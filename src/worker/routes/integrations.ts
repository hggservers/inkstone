import { Hono, type Context } from 'hono'
import type { AppBindings } from '../env'
import { requireAuth } from '../middleware/auth'
import { ApiError } from '../lib/errors'
import { newId } from '../lib/id'
import { sha256Hex } from '../lib/encoding'
import { readJson, JSON_BODY_LIMITS, assertContentSize } from '../lib/request'
import { createNote, patchNote } from './notes'
import { NOTE_COLUMNS_FULL, toNote, type NoteRow } from '../db/rows'
import { ZH_CN_MESSAGES } from '@shared/locales/zh-CN'

type TokenRow = {id:string;user_id:string;folder_id:string;name:string;can_write:number;expires_at:number;revoked_at:number|null}
type IntegrationBindings = AppBindings
export const tokenRoutes = new Hono<AppBindings>()
tokenRoutes.use('*', requireAuth)
tokenRoutes.get('/tokens', async c => {
 const {results} = await c.env.DB.prepare('SELECT id,name,folder_id AS folderId,can_write AS canWrite,created_at AS createdAt,expires_at AS expiresAt,last_used_at AS lastUsedAt,revoked_at AS revokedAt FROM api_tokens WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(c.get('userId')).all()
 return c.json({tokens:results})
})
tokenRoutes.post('/tokens', async c => {
 const b = await readJson<{name:string;folderId:string;expiresInDays?:number;canWrite?:boolean}>(c,JSON_BODY_LIMITS.small)
 if (!b || typeof b.name!=='string' || !b.name.trim() || b.name.length>80 || typeof b.folderId!=='string' || (b.canWrite!==undefined && typeof b.canWrite!=='boolean')) throw ApiError.badRequest('Invalid token settings')
 const days=b.expiresInDays??90
 if (!Number.isInteger(days)||days<1||days>365) throw ApiError.badRequest('Expiry must be between 1 and 365 days')
 const folder=await c.env.DB.prepare('SELECT id FROM folders WHERE id=? AND user_id=? AND deleted_at IS NULL').bind(b.folderId,c.get('userId')).first()
 if(!folder) throw ApiError.notFound('Folder not found')
 const count=await c.env.DB.prepare('SELECT COUNT(*) AS n FROM api_tokens WHERE user_id=? AND revoked_at IS NULL AND expires_at>?').bind(c.get('userId'),Date.now()).first<{n:number}>()
 if((count?.n??0)>=20) throw ApiError.badRequest('Revoke an existing token before creating another')
 const token='ink_'+Array.from(crypto.getRandomValues(new Uint8Array(32)), x=>x.toString(16).padStart(2,'0')).join('')
 const id=newId(),now=Date.now(),expiresAt=now+days*86400000
 await c.env.DB.batch([
 c.env.DB.prepare('INSERT INTO api_tokens(id,user_id,folder_id,name,token_hash,can_write,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,c.get('userId'),b.folderId,b.name.trim(),await sha256Hex(token),b.canWrite===false?0:1,now,expiresAt),
 c.env.DB.prepare('INSERT INTO api_audit VALUES(?,?,?,?,?,?)').bind(newId(),c.get('userId'),id,'token.create',201,now)])
 return c.json({id,token,expiresAt,folderId:b.folderId},201)
})
tokenRoutes.delete('/tokens/:id',async c=>{
 const id=c.req.param('id')
 const result=await c.env.DB.prepare('UPDATE api_tokens SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL').bind(Date.now(),id,c.get('userId')).run()
 if(result.meta.changes) await c.env.DB.prepare('INSERT INTO api_audit VALUES(?,?,?,?,?,?)').bind(newId(),c.get('userId'),id,'token.revoke',200,Date.now()).run()
 return c.json({revoked:true})
})
tokenRoutes.get('/audit',async c=>c.json({events:(await c.env.DB.prepare('SELECT token_id AS tokenId,operation,status,created_at AS createdAt FROM api_audit WHERE user_id=? ORDER BY created_at DESC LIMIT 50').bind(c.get('userId')).all()).results}))

export function validReportDate(date:string) {
 return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date+'T00:00:00Z')) && new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date
}
export async function reportId(userId:string,folderId:string,date:string) {return (await sha256Hex(JSON.stringify([userId,folderId,date]))).slice(0,26)}
export const reportRoutes=new Hono<IntegrationBindings>()
reportRoutes.use('*',async(c,next)=>{
 const raw=c.req.header('Authorization')??''
 if(!/^Bearer ink_[0-9a-f]{64}$/.test(raw)) throw ApiError.unauthenticated('A report API token is required')
 const token=await c.env.DB.prepare('SELECT * FROM api_tokens WHERE token_hash=?').bind(await sha256Hex(raw.slice(7))).first<TokenRow>()
 if(!token||token.revoked_at!==null||token.expires_at<=Date.now()) throw ApiError.unauthenticated('Token expired or revoked')
 const folder=await c.env.DB.prepare('SELECT id FROM folders WHERE id=? AND user_id=? AND deleted_at IS NULL').bind(token.folder_id,token.user_id).first()
 if(!folder) throw ApiError.forbidden('Token folder is unavailable')
 if(c.req.method!=='GET'&&!token.can_write) throw ApiError.forbidden('Token is read-only')
 const window=Math.floor(Date.now()/60000)
 const result=await c.env.DB.prepare('UPDATE api_tokens SET rate_count=CASE WHEN rate_window=? THEN rate_count+1 ELSE 1 END,rate_window=?,last_used_at=? WHERE id=? AND (rate_window<>? OR rate_count<60) AND revoked_at IS NULL AND expires_at>?').bind(window,window,Date.now(),token.id,window,Date.now()).run()
 if(!result.meta.changes) throw new ApiError(429,'bad_request','Too many requests; retry after one minute')
 c.set('userId',token.user_id);c.set('apiToken',token)
 await next()
 await c.env.DB.batch([
 c.env.DB.prepare('INSERT INTO api_audit VALUES(?,?,?,?,?,?)').bind(newId(),token.user_id,token.id,c.req.method+' reports',c.res.status,Date.now()),
 c.env.DB.prepare('DELETE FROM api_audit WHERE created_at<?').bind(Date.now()-30*86400000)])
})

async function locate(c:Context<IntegrationBindings>,date:string) {
 if(!validReportDate(date)) throw ApiError.badRequest('Use a valid YYYY-MM-DD date')
 const token=c.get('apiToken')!,id=await reportId(token.user_id,token.folder_id,date)
 const title=ZH_CN_MESSAGES['reports.title_prefix']+date
 const deterministic=await c.env.DB.prepare(`SELECT ${NOTE_COLUMNS_FULL} FROM notes n WHERE n.id=? AND n.user_id=?`).bind(id,token.user_id).first<NoteRow>()
 if(deterministic){
 if(deterministic.folder_id!==token.folder_id||deterministic.deleted_at!==null||deterministic.is_archived)throw ApiError.conflict('Report was moved, archived or deleted; restore it manually')
 return {row:deterministic,id,title}
 }
 const {results}=await c.env.DB.prepare(`SELECT ${NOTE_COLUMNS_FULL} FROM notes n WHERE n.user_id=? AND n.folder_id=? AND n.title=? LIMIT 2`).bind(token.user_id,token.folder_id,title).all<NoteRow>()
 if(results.length>1)throw ApiError.conflict('Multiple reports exist for this date')
 const row=results[0]??null
 if(row&&(row.deleted_at!==null||row.is_archived))throw ApiError.conflict('Report is archived or deleted')
 return {row,id,title}
}
function response(c:Context<IntegrationBindings>,note:ReturnType<typeof toNote>,created=false){return c.json({note,url:new URL('/?note='+note.id,c.req.url).href,created},created?201:200)}
reportRoutes.get('/reports/:date',async c=>{
 const {row}=await locate(c,c.req.param('date'))
 if(!row)throw ApiError.notFound('Report not found')
 return response(c,toNote(row))
})
reportRoutes.put('/reports/:date',async c=>{
 const body=await readJson<{content:string;rev:number}>(c,JSON_BODY_LIMITS.note)
 if(!body||typeof body.content!=='string'||!body.content.trim()||!Number.isInteger(body.rev)||body.rev<0)throw ApiError.badRequest('Non-empty content and a non-negative rev are required')
 assertContentSize(body.content)
 const {row,id,title}=await locate(c,c.req.param('date')),token=c.get('apiToken')!
 if(row){
 if(row.content===body.content&&row.title===title)return response(c,toNote(row))
 if(body.rev!==row.rev)throw ApiError.conflict('Report changed; review it before updating',{rev:row.rev})
 const result=await patchNote(c,row.id,{content:body.content,title,rev:body.rev,preserveVersion:true})
 return response(c,await result.json())
 }
 if(body.rev!==0)throw ApiError.conflict('Report does not exist; use rev 0 to create')
 const result=await createNote(c,{id,title,content:body.content,folderId:token.folder_id})
 const note=await result.json() as ReturnType<typeof toNote>
 if(note.content!==body.content||note.folderId!==token.folder_id||note.title!==title)throw ApiError.conflict('Concurrent creation; review the current report')
 return response(c,note,result.status===201)
})

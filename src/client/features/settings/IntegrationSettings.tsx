import { useEffect, useState } from 'react'
import { t } from '../../lib/i18n'
import { useNotes } from '../../store/notes'
import { Button } from '../../components/primitives'
import { CLIENT_HEADER } from '@shared/constants'

type Token = {id:string;name:string;folderId:string;expiresAt:number;revokedAt:number|null;lastUsedAt:number|null}
type Event = {tokenId:string;operation:string;status:number;createdAt:number}
async function call<T>(path:string,method='GET',body?:unknown):Promise<T>{
 const r=await fetch('/api/integrations/'+path,{method,headers:{[CLIENT_HEADER]:'1','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)})
 const data=await r.json()
 if(!r.ok)throw Error(data.error?.message??String(r.status))
 return data
}
export function IntegrationSettings(){
 const folders=useNotes(s=>s.folders)
 const [tokens,setTokens]=useState<Token[]>([]),[events,setEvents]=useState<Event[]>([])
 const [name,setName]=useState(''),[folderId,setFolderId]=useState(''),[days,setDays]=useState(90)
 const [secret,setSecret]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const refresh=async()=>{const [a,b]=await Promise.all([call<{tokens:Token[]}>('tokens'),call<{events:Event[]}>('audit')]);setTokens(a.tokens);setEvents(b.events)}
 useEffect(()=>{void refresh().catch(e=>setError(String(e.message)))},[])
 const run=async(action:()=>Promise<void>)=>{setBusy(true);setError('');try{await action();await refresh()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
 const inputClass='w-full rounded border border-[var(--border-default)] bg-[var(--bg-base)] p-2 text-sm'
 return <div className="space-y-5">
 <p className="text-sm text-[var(--text-secondary)]">{t('integrations.description')}</p>
 <form className="space-y-3" onSubmit={e=>{e.preventDefault();void run(async()=>{const data=await call<{token:string}>('tokens','POST',{name,folderId,expiresInDays:days});setSecret(data.token)})}}>
 <label className="block text-sm">{t('integrations.name')}<input className={inputClass} value={name} maxLength={80} required onChange={e=>setName(e.target.value)}/></label>
 <label className="block text-sm">{t('integrations.folder')}<select className={inputClass} value={folderId} required onChange={e=>setFolderId(e.target.value)}><option value="">—</option>{folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
 <label className="block text-sm">{t('integrations.expiry')}<input className={inputClass} type="number" min={1} max={365} required value={days} onChange={e=>setDays(Number(e.target.value))}/></label>
 <Button type="submit" disabled={busy||!folderId||!name.trim()}>{t('integrations.create')}</Button>
 </form>
 {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
 {secret&&<div className="space-y-2 rounded border border-[var(--border-default)] p-3"><p className="text-sm">{t('integrations.once')}</p><textarea aria-label={t('integrations.once')} className={inputClass+' break-all font-mono'} readOnly value={secret}/></div>}
 {!tokens.length&&<p>{t('integrations.empty')}</p>}
 {tokens.map(token=><div key={token.id} className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] py-3"><div className="min-w-0 text-sm"><p className="break-words">{token.name}</p><p className="text-xs text-[var(--text-secondary)]">{folders.find(f=>f.id===token.folderId)?.name} · {new Date(token.expiresAt).toLocaleDateString()} · {token.revokedAt||token.expiresAt<=Date.now()?t('integrations.expired'):t('integrations.active')}</p></div>{!token.revokedAt&&<Button disabled={busy} onClick={()=>void run(async()=>{await call('tokens/'+token.id,'DELETE');setSecret('')})}>{t('integrations.revoke')}</Button>}</div>)}
 <h3 className="text-sm font-semibold">{t('integrations.audit')}</h3>
 {events.slice(0,10).map((e,i)=><p key={i} className="text-xs text-[var(--text-secondary)]">{new Date(e.createdAt).toLocaleString()} · {e.operation} · {e.status}</p>)}
 </div>
}

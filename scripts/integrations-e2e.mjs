import assert from 'node:assert/strict'
const base=process.argv[2]??'http://127.0.0.1:7712'
if(!/^http:\/\/(127\.0\.0\.1|localhost):/.test(base))throw Error('Local test instance required')
let cookie='', checks=0
async function req(path,method='GET',body,token){
 const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{'X-Inkstone-Client':'1',Cookie:cookie})},body:body===undefined?undefined:JSON.stringify(body)})
 if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0]
 return {status:r.status,data:await r.json()}
}
function status(r,s){assert.equal(r.status,s,JSON.stringify(r.data));checks++;return r.data}
status(await req('/api/auth/login','POST',{username:'second-user',password:'supersecret99'}),200)
const folder=status(await req('/api/folders','POST',{name:'API-'+Date.now()}),201)
const token=status(await req('/api/integrations/tokens','POST',{name:'e2e',folderId:folder.id,expiresInDays:1}),201)
const t=token.token
assert.match(t,/^ink_[0-9a-f]{64}$/)
status(await req('/api/v1/reports/2026-09-11'),401)
status(await req('/api/v1/reports/2026-02-30','GET',undefined,t),400)
status(await req('/api/v1/reports/2026-09-11','GET',undefined,t),404)
const first=status(await req('/api/v1/reports/2026-09-11','PUT',{content:'# A\n\nreport unique term #test',rev:0},t),201)
const same=status(await req('/api/v1/reports/2026-09-11','PUT',{content:first.note.content,rev:0},t),200)
assert.equal(first.note.id,same.note.id);assert.equal(first.note.rev,same.note.rev)
status(await req('/api/v1/reports/2026-09-11','PUT',{content:'# overwrite',rev:0},t),409)
const change=status(await req('/api/v1/reports/2026-09-11','PUT',{content:'# B',rev:1},t),200)
assert.equal(change.note.rev,2)
const versions=status(await req('/api/notes/'+change.note.id+'/versions'),200)
assert.ok(JSON.stringify(versions).includes(first.note.id)||JSON.stringify(versions).includes('2026-09-11'))
const race=await Promise.all(['C','D'].map(x=>req('/api/v1/reports/2026-09-11','PUT',{content:'# '+x,rev:2},t)))
assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);checks++
const readOnly=status(await req('/api/integrations/tokens','POST',{name:'read',folderId:folder.id,canWrite:false}),201)
status(await req('/api/v1/reports/2026-09-11','GET',undefined,readOnly.token),200)
status(await req('/api/v1/reports/2026-09-11','PUT',{content:'# x',rev:3},readOnly.token),403)
status(await req('/api/notes','GET',undefined,t),401)
status(await req('/api/v1/notes','GET',undefined,t),404)
const other=status(await req('/api/folders','POST',{name:'Other-'+Date.now()}),201)
const otherToken=status(await req('/api/integrations/tokens','POST',{name:'other',folderId:other.id}),201)
status(await req('/api/v1/reports/2026-09-11','GET',undefined,otherToken.token),404)
status(await req('/api/integrations/tokens','POST',{name:'invalid',folderId:'not-owned'}),404)
const listed=status(await req('/api/integrations/tokens'),200)
assert.ok(!JSON.stringify(listed).includes(t));assert.ok(!JSON.stringify(listed).includes('token_hash'))
const audit=status(await req('/api/integrations/audit'),200)
assert.ok(!JSON.stringify(audit).includes('# B'));assert.ok(audit.events.length>0)
status(await req('/api/integrations/tokens/'+token.id,'DELETE'),200)
status(await req('/api/v1/reports/2026-09-11','GET',undefined,t),401)
console.log(`${checks} integration checks passed: auth, scope, retries, conflicts, versions, audit and revocation`)

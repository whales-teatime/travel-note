import ts from 'typescript';
import {readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

mkdirSync('.wrangler', {recursive:true});
// Disposable database, dummy admin credential. Never sends production writes.
const db=new DatabaseSync(':memory:');
for(const name of readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(`drizzle/${name}`,'utf8'));
let beforeRun=null;
globalThis.__reviewEnv = {
 ADMIN_MASTER_PASSWORD:'audit-only-master',
 DB: {prepare(sql) {
  let args=[];
  return {
   bind(...v){args=v;return this},
   async first(){return db.prepare(sql).get(...args)??null},
   async all(){return {results:db.prepare(sql).all(...args)}},
   async run(){if(beforeRun)beforeRun(sql,args);const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}}
  };
 }}
};
for(const [src,target] of [['lib/plan-save.ts','audit-save.mjs'],['lib/plan-store.ts','audit-store.mjs'],['app/api/plans/route.ts','audit-list.mjs'],['app/api/plans/[id]/route.ts','audit-detail.mjs']]){
 const source=readFileSync(src,'utf8').replace("import { env } from 'cloudflare:workers';",'const env=globalThis.__reviewEnv;').replace("'@/lib/plan-store'","'./audit-store.mjs'");
 writeFileSync(`.wrangler/${target}`,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const list=await import(pathToFileURL(`${process.cwd()}/.wrangler/audit-list.mjs`));
const detail=await import(pathToFileURL(`${process.cwd()}/.wrangler/audit-detail.mjs`));
const store=await import(pathToFileURL(`${process.cwd()}/.wrangler/audit-store.mjs`));
const {planAuthPayload,reconcileSavedSettings,validTripDates}=await import(pathToFileURL(`${process.cwd()}/.wrangler/audit-save.mjs`));
let seq=0;
async function call(method,id,body,token,cookie){const request=new Request(`https://audit.invalid/api/plans${id?'/'+id:''}`,{method,headers:{'content-type':'application/json','CF-Connecting-IP':`192.0.2.${++seq}`,...(token?{'x-plan-edit-token':token}:{}),...(cookie?{cookie}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});const response=await(id?detail[method](request,{params:{id}}):list[method](request));return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}}
const base={title:'audit',destination:'서울',startDate:'2026-09-19',endDate:'2026-09-20',people:5,editPolicy:'owner',stops:[{id:'one',name:'audit-place',day:'2026-09-19',time:'08:39',category:'관광',lat:37.5,lng:127,memo:''}]};
const create=async(policy='owner',password='')=>(await call('POST',null,{...base,editPolicy:policy,password,...(policy==='password'?{editPassword:'audit-edit'}:{})})).body;
// Execute the frontend's exact auth payload expressions, not a hand-written substitute.
const page=readFileSync('app/plan/page.tsx','utf8');
const payloadSource=page.slice(page.indexOf('      const viewPasswordPayload='),page.indexOf('      const response=await fetch(existing?'));
writeFileSync('.wrangler/audit-ui-payload.mjs',`export default function(planAuthPayload,s){const {tripSettings,passwordConfigured,planPassword,planPasswordAuth,planPasswordTouched,editPasswordAuth,editPasswordTouched,editPasswordConfigured,editPassword}=s;const existing=true;${payloadSource};return {...viewPasswordPayload,...editPasswordPayload};}`);
const {default:uiPayload}=await import(pathToFileURL(`${process.cwd()}/.wrangler/audit-ui-payload.mjs`));
const afterAdminUnlock=(policy)=>({tripSettings:{editPolicy:policy},passwordConfigured:true,planPassword:'',planPasswordAuth:'',planPasswordTouched:false,editPasswordAuth:'',editPasswordTouched:false,editPasswordConfigured:policy==='password',editPassword:''});
const results=[];
async function test(name,fn){try{await fn();results.push({name,pass:true})}catch(e){results.push({name,pass:false,detail:e.message})}}
await test('admin backend auth succeeds; wrong admin denied',async()=>{const p=await create('owner','audit-view');const yes=await call('POST',p.id,{password:'audit-only-master'});assert.equal(yes.status,200);assert.equal(yes.body.canEdit,true);assert.equal((await call('POST',p.id,{password:'wrong-admin'})).status,401)});
for(const policy of ['owner','password'])await test(`admin unlock then UI save succeeds (${policy})`,async()=>{const p=await create(policy,'audit-view');const unlocked=await call('POST',p.id,{password:'audit-only-master'});assert.equal(unlocked.body.canEdit,true);assert.ok(unlocked.cookie);const r=await call('PUT',p.id,{...base,editPolicy:policy,baseVersion:1,...uiPayload(planAuthPayload,afterAdminUnlock(policy))},undefined,unlocked.cookie);assert.equal(r.status,200)});
await test('admin save preserves original view password (all policy)',async()=>{const p=await create('all','audit-view');const unlocked=await call('POST',p.id,{password:'audit-only-master'});const r=await call('PUT',p.id,{...base,editPolicy:'all',baseVersion:1,...uiPayload(planAuthPayload,afterAdminUnlock('all'))},undefined,unlocked.cookie);assert.equal(r.status,200);assert.equal((await call('POST',p.id,{password:'audit-view'})).status,200)});
await test('admin edit prompt alone opens view-protected plan',async()=>{const p=await create('password','audit-view');assert.equal((await call('POST',p.id,{action:'edit-auth',editPassword:'audit-only-master'})).status,200)});
await test('object instead of stops is rejected; existing stops preserved',async()=>{const p=await create();const r=await call('PUT',p.id,{...base,stops:{invalid:true},baseVersion:1},p.editToken);assert.equal(r.status,400);assert.equal((await call('GET',p.id)).body.plan.stops.length,1)});
await test('501 stops rejected without silently truncating',async()=>{const r=await call('POST',null,{...base,stops:Array.from({length:501},(_,i)=>({...base.stops[0],id:String(i)}))});assert.equal(r.status,400)});
await test('oversized body without content-length rejected',async()=>{const r=await call('POST',null,{...base,misc:'x'.repeat(950000)});assert.equal(r.status,413)});
await test('failed concurrent delete does not report success',async()=>{const p=await create();beforeRun=(sql)=>{if(sql.startsWith('UPDATE plans SET deleted_at=?')){beforeRun=null;db.prepare('UPDATE plans SET version=version+1 WHERE id=?').run(p.id)}};const r=await call('DELETE',p.id,{},p.editToken);assert.equal(r.status,409);assert.equal(db.prepare('SELECT deleted_at FROM plans WHERE id=?').get(p.id).deleted_at,null)});
await test('overlapping edits preserve original and conflict copy',async()=>{const p=await create('all');const [a,b]=await Promise.all([call('PUT',p.id,{...base,editPolicy:'all',title:'A',baseVersion:1}),call('PUT',p.id,{...base,editPolicy:'all',title:'B',baseVersion:1})]);assert.deepEqual([a.status,b.status].sort((a,b)=>a-b),[200,201]);assert.ok(a.body.conflict||b.body.conflict)});
await test('old hash still authenticates after hardening',async()=>{const p=await create('all');const hash=await store.passwordHash('legacy','salt','sha256');db.prepare("UPDATE plans SET password_hash=?,password_salt='salt',password_algo='sha256' WHERE id=?").run(hash,p.id);assert.equal((await call('POST',p.id,{password:'legacy'})).status,200)});

await test('viewer can change all-edit policy to password and preserve viewing protection',async()=>{
 const p=await create('all','audit-view');
 const fields=uiPayload(planAuthPayload,{...afterAdminUnlock('password'),planPassword:'audit-view',planPasswordAuth:'audit-view',editPassword:'new-edit',editPasswordTouched:true,editPasswordConfigured:false});
 const r=await call('PUT',p.id,{...base,editPolicy:'password',baseVersion:1,...fields});
 assert.equal(r.status,200);assert.equal((await call('GET',p.id)).status,401);
 assert.equal((await call('POST',p.id,{action:'edit-auth',password:'audit-view',editPassword:'new-edit'})).status,200);
});
await test('changing both passwords authenticates with their saved values',async()=>{
 const p=await create('password','audit-view');
 const fields=uiPayload(planAuthPayload,{...afterAdminUnlock('password'),planPassword:'new-view',planPasswordAuth:'audit-view',planPasswordTouched:true,editPassword:'new-edit',editPasswordAuth:'audit-edit',editPasswordTouched:true});
 assert.equal((await call('PUT',p.id,{...base,editPolicy:'password',baseVersion:1,...fields})).status,200);
 assert.equal((await call('POST',p.id,{password:'audit-view'})).status,401);
 assert.equal((await call('POST',p.id,{action:'edit-auth',password:'new-view',editPassword:'new-edit'})).status,200);
});
await test('unchanged passwords are not rewritten',async()=>{
 const fields=uiPayload(planAuthPayload,{...afterAdminUnlock('all'),planPassword:'audit-view',planPasswordAuth:'audit-view'});
 assert.equal(Object.hasOwn(fields,'password'),false);assert.equal(fields.passwordAuth,'audit-view');
});
await test('empty editing password rejected without changing the plan',async()=>{
 const p=await create('password');
 assert.equal((await call('PUT',p.id,{...base,editPolicy:'password',baseVersion:1,editPasswordAuth:'audit-edit',editPassword:''})).status,400);
 assert.equal((await call('POST',p.id,{action:'edit-auth',editPassword:'audit-edit'})).status,200);
});
await test('pin color, distance bases, fuel and multi-destination survive save and duplicate',async()=>{
 const input={...base,editPolicy:'all',viewMode:'distance',distanceBaseIds:['one'],fuelEfficiency:15.5,fuelPrice:1650,stops:[{...base.stops[0],pinColor:'#aBc123',costBasis:'person',costPerPerson:15000,costTotal:75000}],destinations:[{id:'seoul',name:'서울',startDate:base.startDate,endDate:base.startDate},{id:'busan',name:'부산',startDate:base.endDate,endDate:base.endDate}]};
 const p=(await call('POST',null,input)).body;
 const loaded=(await call('GET',p.id)).body.plan;
 assert.equal(loaded.stops[0].pinColor,'#abc123');assert.equal(loaded.stops[0].costTotal,75000);assert.deepEqual(loaded.distanceBaseIds,['one']);assert.equal(loaded.fuelEfficiency,15.5);assert.equal(loaded.destinations.length,2);
 const copy=await call('POST',p.id,{action:'duplicate'});assert.equal(copy.status,201);assert.equal(copy.body.plan.editPolicy,'all');assert.equal(copy.body.plan.editPasswordProtected,false);assert.deepEqual(copy.body.plan.stops,loaded.stops);
});
await test('readers cannot save or delete an owner-only plan',async()=>{
 const p=await create();assert.equal((await call('PUT',p.id,{...base,baseVersion:1})).status,403);assert.equal((await call('DELETE',p.id,{})).status,403);
});
await test('delete, restore, and seven-day expiry',async()=>{
 const p=await create();assert.equal((await call('DELETE',p.id,{},p.editToken)).status,200);assert.equal((await call('GET',p.id)).status,410);
 assert.equal((await call('POST',p.id,{action:'restore'},p.editToken)).status,200);assert.equal((await call('GET',p.id)).status,200);
 db.prepare('UPDATE plans SET deleted_at=? WHERE id=?').run(new Date(Date.now()-8*86400000).toISOString(),p.id);
 assert.equal((await call('POST',p.id,{action:'restore'},p.editToken)).status,404);
});
await test('slow saves preserve later settings and unfinished settings dialog',async()=>{
 const submitted={title:'old',people:2};const newer={title:'new',people:5};
 assert.deepEqual(reconcileSavedSettings(newer,submitted,submitted),newer);
 assert.equal(reconcileSavedSettings(submitted,submitted,submitted),submitted);
 assert.deepEqual(reconcileSavedSettings({...submitted,people:7},submitted,{...submitted,title:'conflict copy'}),{title:'conflict copy',people:7});
});
await test('invalid dates and overlong trips are rejected before saving',async()=>{
 assert.equal(validTripDates('2026-02-30','2026-03-01'),false);
 assert.equal(validTripDates('2026-09-21','2026-09-20'),false);
 assert.equal(validTripDates('2026-01-01','2028-01-01'),false);
 assert.equal(validTripDates('2026-01-01','2027-01-02'),true);
});

console.log(JSON.stringify({passed:results.filter(r=>r.pass).length,total:results.length,results},null,2));
writeFileSync('.wrangler/audit-followup-results.json',JSON.stringify(results,null,2));
db.close();
if(results.some(r=>!r.pass))process.exitCode=1;




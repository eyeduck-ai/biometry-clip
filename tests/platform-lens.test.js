import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyCase} from '../src/model.js';
import {exportLensCatalogDocument} from '../src/lens-catalog.js';
import {lensTransferBridge} from '../src/lens-transfer.js';
import {DEFAULT_LENS_CATALOG,LENS_DEFINITIONS} from '../src/lens-registry.js';
import {siteBridge} from '../src/bridge.js';
import {reconcileLensPatch} from '../src/transfer.js';

let moduleId=0;
const timestamp='2026-11-15T00:00:00.000Z';
const option=(value,label)=>({value,label,kind:'model',available:true});
function snapshot(siteId='evo',value='ZCB00',label='J&J ZCB00'){
  const kind=DEFAULT_LENS_CATALOG.sources.filter(source=>source.siteId===siteId).flatMap(source=>source.options).find(option=>option.value===value&&option.label===label)?.kind||'model';
  return {siteId,status:'read',url:siteId==='evo'?'https://www.evoiolcalculator.com/Calculator.aspx':'https://www.evoiolcalculator.com/Toric.aspx',capturedAt:timestamp,control:'native-select',options:[{...option(value,label),kind}],selected:{value,label,kind},parameters:[{key:'aConstant',value:'119.3',unit:'1',sourceControl:'#txtAConstant'}],navigationExpected:true};
}
function inventory(value=snapshot()){
  return {siteId:value.siteId,status:'read',url:value.url,capturedAt:value.capturedAt,controls:[{...value,controlId:'primary',role:'primary'}]};
}
async function fixture(t,{url='https://www.evoiolcalculator.com/Calculator.aspx',script,locks}={}){
  const saved=new Map(['chrome','location','navigator'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),calls=[],local={};
  const chrome={runtime:{id:'lens-platform-test',getManifest:()=>({version:'test'})},tabs:{get:async id=>({id,url,status:'complete'})},storage:{local:{get:async key=>{calls.push({type:'local.get',key});return structuredClone(local);},set:async patch=>{calls.push({type:'local.set',patch:structuredClone(patch)});Object.assign(local,structuredClone(patch));}}},scripting:{executeScript:async args=>{calls.push({type:'execute',args});if(script)return script(args);return [{frameId:0,result:args.func===lensTransferBridge?inventory():{siteId:'evo',rows:[{key:'al',eye:'OS',value:'24.10',status:'read'}]}}];}}};
  Object.defineProperty(globalThis,'chrome',{configurable:true,writable:true,value:chrome});Object.defineProperty(globalThis,'location',{configurable:true,writable:true,value:{href:'chrome-extension://lens-platform-test/index.html?view=qa'}});
  Object.defineProperty(globalThis,'navigator',{configurable:true,writable:true,value:{locks}});
  t.after(()=>{for(const [key,descriptor]of saved)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];});
  return {api:await import(`../src/platform.js?lens-platform-test=${moduleId++}`),calls,local,chrome};
}

test('readLensOptions injects only the read-only top-frame function and never writes storage',async t=>{
  const f=await fixture(t),read=await f.api.readLensOptions(41);assert.equal(read.selected.value,'ZCB00');assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].args.target,{tabId:41,frameIds:[0]});assert.equal(f.calls[0].args.func,lensTransferBridge);assert.equal(f.calls[0].args.args[0],'inspect');assert.equal(f.calls[0].args.args[1].controls[0].selector,'#DropDownIOLModel');
});

for(const url of ['https://www.evoiolcalculator.com.attacker.example/Calculator.aspx','https://www.evoiolcalculator.com/Calculator.aspx-copy'])test(`unsupported lens collection does not inject on ${url}`,async t=>{
  const f=await fixture(t,{url}),result=await f.api.readLensOptions(41);assert.equal(result.status,'unsupported');assert.deepEqual(f.calls,[]);
});

test('ordinary website read appends source lens identity to the selected eye without persisting the catalog',async t=>{
  const f=await fixture(t),result=await f.api.inspectTab(41,emptyCase(),{eye:'OS'},'read');assert.equal(result.rows[0].key,'al');assert.deepEqual(result.rows.filter(row=>row.key.startsWith('iol')).map(row=>[row.eye,row.key,row.value]),[['OS','iolSourceSite','evo'],['OS','iolSourceValue','ZCB00'],['OS','iolSourceLabel','J&J ZCB00'],['OS','iolSourceControl','primary'],['OS','iolSourceRole','primary']]);assert.equal(result.lensSnapshot.status,'read');assert.deepEqual(f.calls.map(call=>call.type),['execute','execute']);assert.equal(f.calls[0].args.func,siteBridge);
});

test('optional lens bridge failure leaves a successful numeric read intact',async t=>{
  const f=await fixture(t,{script:args=>{if(args.func===lensTransferBridge)throw new Error('lens control changed');return [{frameId:0,result:{siteId:'evo',rows:[{eye:'OD',key:'al',status:'read',value:'23.45'}]}}];}});const result=await f.api.inspectTab(41,emptyCase(),{eye:'OD'},'read');assert.equal(result.rows.length,1);assert.equal(result.rows[0].value,'23.45');assert.equal(result.lensSnapshot,undefined);assert.equal(f.calls.some(call=>call.type==='local.set'),false);
});

test('explicit lens collection remains usable independently of a failed numeric bridge',async t=>{
  const f=await fixture(t,{script:args=>[{frameId:0,result:args.func===lensTransferBridge?inventory():{siteId:'evo',rows:[],error:'Numeric form not ready'}}]});await assert.rejects(f.api.inspectTab(41,emptyCase(),{eye:'OD'},'read'),/Numeric/);const result=await f.api.readLensOptions(41);assert.equal(result.status,'read');assert.equal(f.calls.some(call=>call.type==='local.set'),false);
});

test('collectLensSnapshot explicitly persists its snapshot and retains another site source',async t=>{
  const f=await fixture(t);f.local.biometryLensCatalog=exportLensCatalogDocument([snapshot('evo-toric','ZCU','J&J ZCU')],{now:timestamp});const result=await f.api.collectLensSnapshot(snapshot());assert.equal(result.sources.find(source=>source.siteId==='evo-toric').selected.value,'ZCU');assert.equal(result.sources.find(source=>source.siteId==='evo').selected.value,'ZCB00');assert.ok(result.entries.length>=DEFAULT_LENS_CATALOG.entries.length);assert.deepEqual(f.calls.map(call=>call.type),['local.get','local.set']);assert.deepEqual(Object.keys(f.calls[1].patch),['biometryLensCatalog']);assert.equal(JSON.stringify(f.calls[1].patch).includes('patient'),false);
});

test('invalid catalog import is rejected before any storage mutation',async t=>{
  const f=await fixture(t),document=exportLensCatalogDocument([],{now:timestamp});document.apiKey='SYNTHETIC-KEY';await assert.rejects(f.api.saveLensCatalog(document),/結構/);assert.deepEqual(f.calls,[]);
});

test('unavailable lens collection preserves the saved catalog without any storage access',async t=>{
  const f=await fixture(t),original=exportLensCatalogDocument([snapshot()],{now:timestamp});f.local.biometryLensCatalog=structuredClone(original);await assert.rejects(f.api.collectLensSnapshot({siteId:'evo',status:'unavailable'}),/保留/);assert.deepEqual(f.local.biometryLensCatalog,original);assert.deepEqual(f.calls,[]);
});

test('QA website reads expose no formal catalog-write API and do not persist lens snapshots',async t=>{
  const f=await fixture(t),qa=await import(`../src/qa/platform.js?lens-platform-test=${moduleId++}`);assert.equal(Object.hasOwn(qa,'saveLensCatalog'),false);assert.equal(Object.hasOwn(qa,'collectLensSnapshot'),false);const result=await qa.inspectTab(41,emptyCase(),{eye:'OD'},'read');assert.equal(result.lensSnapshot.status,'read');assert.equal(f.calls.some(call=>call.type==='local.get'||call.type==='local.set'),false);
});

test('website and partial JSON lens changes clear a stale canonical ID while leaving the other eye unchanged',()=>{
  const current=emptyCase();current.eyes.OD={iolSourceSite:'evo',iolSourceValue:'ZCB00',iolSourceLabel:'J&J ZCB00',iolCatalogId:'maker:model:zcb00'};current.eyes.OS={iolCatalogId:'other-eye'};
  for(const patch of [{eyes:{OD:{iolSourceSite:'tecnis-toric',iolSourceValue:'Monofocal-II',iolSourceLabel:'Monofocal-II ZCU'}}},{eyes:{OD:{iolSourceLabel:'Changed model'}}}]){const result=reconcileLensPatch(current,patch);assert.equal(result.eyes.OD.iolCatalogId,'');assert.equal(Object.hasOwn(result.eyes,'OS'),false);}
  assert.equal(current.eyes.OD.iolCatalogId,'maker:model:zcb00');
});

test('a complete explicitly imported source identity can retain its accompanying canonical ID',()=>{
  const current=emptyCase();current.eyes.OD={iolSourceSite:'old',iolSourceValue:'old',iolSourceLabel:'Old',iolCatalogId:'old-id'};
  const patch={eyes:{OD:{iolSourceSite:'new',iolSourceValue:'new',iolSourceLabel:'New',iolCatalogId:'new-id'}}};assert.deepEqual(reconcileLensPatch(current,patch),patch);
});

function sharedLocks(){
  const queues=new Map(),requests=[];let active=0,maxActive=0;
  return {requests,get maxActive(){return maxActive;},request(name,work){
    requests.push(name);const task=(queues.get(name)||Promise.resolve()).then(async()=>{active++;maxActive=Math.max(maxActive,active);try{return await work({name});}finally{active--;}});queues.set(name,task.catch(()=>{}));return task;
  }};
}
function slowCatalogStorage(f){
  const get=f.chrome.storage.local.get,set=f.chrome.storage.local.set;
  f.chrome.storage.local.get=async key=>{const value=await get(key);await new Promise(setImmediate);return value;};
  f.chrome.storage.local.set=async patch=>{await new Promise(setImmediate);return set(patch);};
}

test('two panel module instances sharing a Web Lock retain both concurrently collected site sources',{timeout:2000},async t=>{
  const locks=sharedLocks(),f=await fixture(t,{locks}),second=await import(`../src/platform.js?lens-platform-test=${moduleId++}`);slowCatalogStorage(f);
  await Promise.all([f.api.collectLensSnapshot(snapshot()),second.collectLensSnapshot(snapshot('evo-toric','ZCU','J&J ZCU'))]);
  assert.equal(f.local.biometryLensCatalog.sources.find(source=>source.siteId==='evo').selected.value,'ZCB00');assert.equal(f.local.biometryLensCatalog.sources.find(source=>source.siteId==='evo-toric').selected.value,'ZCU');assert.deepEqual(f.calls.map(call=>call.type),['local.get','local.set','local.get','local.set']);assert.deepEqual(locks.requests,['biometry-lens-catalog-write','biometry-lens-catalog-write']);assert.equal(locks.maxActive,1);
});

test('explicit catalog import and a concurrent other-panel collection use the same non-nested lock',{timeout:2000},async t=>{
  const locks=sharedLocks(),f=await fixture(t,{locks}),second=await import(`../src/platform.js?lens-platform-test=${moduleId++}`);slowCatalogStorage(f);
  const imported=exportLensCatalogDocument([snapshot('evo-toric','ZCU','J&J ZCU')],{now:timestamp});await Promise.all([f.api.saveLensCatalog(imported),second.collectLensSnapshot(snapshot())]);
  assert.equal(f.local.biometryLensCatalog.sources.find(source=>source.siteId==='evo').selected.value,'ZCB00');assert.equal(f.local.biometryLensCatalog.sources.find(source=>source.siteId==='evo-toric').selected.value,'ZCU');assert.equal(locks.requests.length,2);assert.equal(locks.maxActive,1);
});

test('fallback queue serializes same-runtime collections and recovers after a storage failure',async t=>{
  const f=await fixture(t);slowCatalogStorage(f);await Promise.all([f.api.collectLensSnapshot(snapshot()),f.api.collectLensSnapshot(snapshot('evo-toric','ZCU','J&J ZCU'))]);assert.ok(f.local.biometryLensCatalog.sources.length>=2);assert.equal(f.local.biometryLensCatalog.sources.find(source=>source.siteId==='evo').selected.value,'ZCB00');assert.equal(f.local.biometryLensCatalog.sources.find(source=>source.siteId==='evo-toric').selected.value,'ZCU');
  const set=f.chrome.storage.local.set;let failed=false;f.chrome.storage.local.set=async patch=>{if(!failed){failed=true;throw new Error('SYNTHETIC write failure');}return set(patch);};
  const outcomes=await Promise.allSettled([f.api.collectLensSnapshot(snapshot('evo','SN60WF','Alcon SN60WF')),f.api.collectLensSnapshot(snapshot('evo-toric','MX60T','B&L MX60T'))]);assert.deepEqual(outcomes.map(outcome=>outcome.status),['rejected','fulfilled']);assert.equal(f.local.biometryLensCatalog.sources.find(source=>source.siteId==='evo').selected.value,'ZCB00');assert.equal(f.local.biometryLensCatalog.sources.find(source=>source.siteId==='evo-toric').selected.value,'MX60T');
});


test('old or empty local catalogs cannot remove newly packaged verified entries',async t=>{
  const f=await fixture(t);f.local.biometryLensCatalog=exportLensCatalogDocument([],{now:timestamp,version:'1.0'});
  const result=await f.api.loadLensCatalog();assert.ok(DEFAULT_LENS_CATALOG.entries.length>0);assert.ok(result.entries.length>=DEFAULT_LENS_CATALOG.entries.length);assert.equal(result.schemaVersion,'1.1');
  assert.equal(f.calls.some(call=>call.type==='local.set'),false);
});
test('collection keeps independent eye and manufacturer branches on the same website',async t=>{
  const f=await fixture(t),base={...snapshot(),siteId:'escrs',url:'https://iolcalculator.escrs.org/',control:'linked-select',role:'primary'};
  const captures=[{...base,controlId:'model-OD',eye:'OD',manufacturer:'Maker A'},{...base,controlId:'model-OS',eye:'OS',manufacturer:'Maker A'},{...base,controlId:'model-OD',eye:'OD',manufacturer:'Maker B'}];
  await f.api.collectLensSnapshot(captures);
  const saved=f.local.biometryLensCatalog.sources.filter(source=>source.siteId==='escrs'&&['Maker A','Maker B'].includes(source.manufacturer));
  assert.equal(saved.length,3);assert.deepEqual(new Set(saved.map(source=>`${source.controlId}:${source.manufacturer}`)),new Set(['model-OD:Maker A','model-OS:Maker A','model-OD:Maker B']));
});
test('newly supported sites inspect their published lens definitions without opening selectors',async t=>{
  const f=await fixture(t,{url:'https://iolcalculator.escrs.org/',script:args=>[{frameId:0,result:{siteId:'escrs',status:'unavailable',controls:[]}}]});
  const result=await f.api.readLensOptions(41);assert.equal(result.status,'unavailable');assert.equal(f.calls[0].args.func,lensTransferBridge);assert.equal(f.calls[0].args.args[0],'inspect');assert.equal(f.calls[0].args.args[1].siteId,'escrs');assert.ok(LENS_DEFINITIONS.escrs.controls.length>=2);assert.equal(f.calls.some(call=>call.type==='local.set'),false);
});

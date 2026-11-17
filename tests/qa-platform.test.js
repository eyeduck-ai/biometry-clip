import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyCase } from '../src/model.js';
import { createQaStorage,createQaBackend,isTrustedQaSender } from '../src/qa/backend.js';

const extensionId='abcdefghijklmnopabcdefghijklmnop';
const qaUrl=`chrome-extension://${extensionId}/index.html?view=qa`;
const validSender=()=>({id:extensionId,url:qaUrl,frameId:0});
let imports=0;
function storageFixture(){
  const clinical=emptyCase();clinical.patient.patientId='PRIVATE-CLINICAL-SENTINEL';clinical.eyes.OS.al='29.99';
  const values={session:{biometrySession:{data:clinical,revision:8,caseToken:'clinical-token'},biometryCase:clinical},local:{biometryLibrary:{version:1,revision:10,patients:[{patient:{patientId:'PRIVATE-CLINICAL-SENTINEL'}}]},settings:{geminiApiKey:'PRIVATE-KEY-SENTINEL'}}};
  const original=structuredClone(values),calls=[],onChanged=event();let failWrite=false;
  const area=name=>({
    async get(keys){calls.push([name,'get',structuredClone(keys)]);const names=typeof keys==='string'?[keys]:keys;return Object.fromEntries(names.filter(key=>Object.hasOwn(values[name],key)).map(key=>[key,structuredClone(values[name][key])]));},
    async set(update){calls.push([name,'set',Object.keys(update)]);if(failWrite){failWrite=false;throw new Error('QA write failure');}const old=structuredClone(values[name]);Object.assign(values[name],structuredClone(update));const changes=Object.fromEntries(Object.keys(update).filter(key=>JSON.stringify(old[key])!==JSON.stringify(values[name][key])).map(key=>[key,{oldValue:old[key],newValue:structuredClone(values[name][key])}]));if(Object.keys(changes).length)onChanged.emit(changes,name);},
    async setAccessLevel(){},
  });
  return {values,original,calls,storage:{session:area('session'),local:area('local'),onChanged},failNextWrite(){failWrite=true;}};
}
const call=(backend,area,operation,payload={})=>backend.request({type:`biometry:qa:${area}:${operation}`,...payload},validSender());
function assertClinicalUntouched(f){for(const area of ['session','local'])for(const key of Object.keys(f.original[area]))assert.deepEqual(f.values[area][key],f.original[area][key]);}
function assertOnlyQaKeys(f){for(const [,operation,keys] of f.calls)if(operation==='get'||operation==='set')assert.ok((Array.isArray(keys)?keys:[keys]).every(key=>key.startsWith('biometryQa:')));}

test('QA storage adapters expose only fixed, explicitly requested prefix keys',async()=>{
  const f=storageFixture(),session=createQaStorage(f.storage.session,'session'),local=createQaStorage(f.storage.local,'local');
  assert.deepEqual(await session.get(['biometrySession','biometryCase']),{});assert.deepEqual(await local.get('biometryLibrary'),{});
  await session.set({biometryCase:{synthetic:true}});await local.set({biometryLibrary:{synthetic:true}});
  assert.deepEqual(await session.get('biometryCase'),{biometryCase:{synthetic:true}});assertClinicalUntouched(f);assertOnlyQaKeys(f);
});

test('unknown, wildcard and mixed storage keys are rejected before any storage access',async()=>{
  const f=storageFixture(),adapter=createQaStorage(f.storage.session,'session');
  for(const keys of [null,undefined,{},['settings'],['biometryLibrary'],['biometrySession','settings']])await assert.rejects(adapter.get(keys),{code:'QA_STORAGE_KEY'});
  for(const values of [{settings:{}},{biometrySession:{},settings:{}},JSON.parse('{"__proto__":{}}')])await assert.rejects(adapter.set(values),{code:'QA_STORAGE_KEY'});
  assert.throws(()=>createQaStorage(f.storage.local,'clinical'));assert.deepEqual(f.calls,[]);assertClinicalUntouched(f);
});

test('only the own packaged QA view can call isolated data endpoints',async()=>{
  const f=storageFixture(),backend=createQaBackend(f.storage,extensionId);
  const invalid=[
    {...validSender(),id:'another'},
    {...validSender(),url:'https://iolsolver.com/regular'},
    {...validSender(),url:`chrome-extension://${extensionId}.attacker/index.html?view=qa`},
    {...validSender(),url:qaUrl.replace('/index.html','/index.html-copy')},
    {...validSender(),url:qaUrl.replace('view=qa','view=floating')},
    {...validSender(),url:qaUrl.replace('view=qa','view=launcher')},
    {...validSender(),url:qaUrl.replace('?view=qa','')},
    {...validSender(),url:qaUrl+'&view=floating'},
  ];
  assert.equal(isTrustedQaSender(validSender(),extensionId),true);
  for(const sender of invalid){assert.equal(isTrustedQaSender(sender,extensionId),false);await assert.rejects(backend.request({type:'biometry:qa:session:read'},sender),{code:'UNTRUSTED_QA_SENDER'});}
  assert.deepEqual(f.calls,[]);assertClinicalUntouched(f);
});

test('QA initialization and concurrent patches never import the clinical legacy draft',async()=>{
  const f=storageFixture(),backend=createQaBackend(f.storage,extensionId);const {session:initial}=await call(backend,'session','read');
  assert.deepEqual(initial.data,emptyCase());assert.notEqual(initial.caseToken,'clinical-token');
  await Promise.all([
    call(backend,'session','patch',{patch:{eyes:{OD:{al:'23.45'}}},caseToken:initial.caseToken}),
    call(backend,'session','patch',{patch:{eyes:{OS:{al:'24.10'}}},caseToken:initial.caseToken}),
  ]);
  const {session:current}=await call(backend,'session','read');assert.equal(current.data.eyes.OD.al,'23.45');assert.equal(current.data.eyes.OS.al,'24.10');assert.equal(current.revision,2);
  const restarted=createQaBackend(f.storage,extensionId);assert.deepEqual((await call(restarted,'session','read')).session,current);
  assertClinicalUntouched(f);assertOnlyQaKeys(f);
});

test('QA patient snapshots use real production services with isolated local persistence',async()=>{
  const f=storageFixture(),backend=createQaBackend(f.storage,extensionId);
  let current=(await call(backend,'session','read')).session;
  const {result:createdA}=await call(backend,'library','create-patient',{patient:{patientId:'QA-SYNTHETIC-A'}});
  current=(await call(backend,'library','activate-patient',{patientId:createdA.patient.id,caseToken:current.caseToken,revision:current.revision})).result;
  current=(await call(backend,'session','patch',{patch:{eyes:{OD:{al:'23.45'},OS:{al:'24.10'}}},caseToken:current.caseToken})).session;
  const {result:a1}=await call(backend,'library','save-measurement',{options:{patientId:createdA.patient.id,label:'A1',caseToken:current.caseToken,revision:current.revision,data:current.data,storageKey:'biometryLibrary'}});
  current=(await call(backend,'session','patch',{patch:{eyes:{OD:{al:'25.10'}}},caseToken:current.caseToken})).session;
  const {result:a2}=await call(backend,'library','save-measurement',{options:{patientId:createdA.patient.id,label:'A2',caseToken:current.caseToken,revision:current.revision}});
  assert.equal(a1.measurement.eyes.OD.al,'23.45');assert.equal(a2.measurement.eyes.OD.al,'25.10');
  const {result:createdB}=await call(backend,'library','create-patient',{patient:{patientId:'QA-SYNTHETIC-B'}});
  current=(await call(backend,'library','activate-patient',{patientId:createdB.patient.id,caseToken:current.caseToken,revision:current.revision})).result;
  assert.deepEqual(current.data.eyes,{OD:{},OS:{}});
  current=(await call(backend,'library','select-measurement',{patientId:createdA.patient.id,measurementId:a1.measurement.id,caseToken:current.caseToken,revision:current.revision})).result;
  assert.equal(current.data.eyes.OD.al,'23.45');assert.equal(current.data.eyes.OS.al,'24.10');
  const {result:library}=await call(backend,'library','read');assert.equal(library.patients.length,2);assert.equal(library.patients[0].measurements.length,2);
  assertClinicalUntouched(f);assertOnlyQaKeys(f);assert.ok(!JSON.stringify(library).includes('PRIVATE-CLINICAL-SENTINEL'));
});

test('QA replace and clear preserve revision/generation conflict checks',async()=>{
  const f=storageFixture(),backend=createQaBackend(f.storage,extensionId);const initial=(await call(backend,'session','read')).session;
  const patched=(await call(backend,'session','patch',{patch:{eyes:{OD:{al:'23'}}},caseToken:initial.caseToken})).session;
  await assert.rejects(call(backend,'session','replace',{data:emptyCase(),caseToken:initial.caseToken,revision:initial.revision}),{code:'REVISION_CHANGED'});
  const replacement=emptyCase();replacement.patient.patientId='QA-NEW';
  const replaced=(await call(backend,'session','replace',{data:replacement,caseToken:patched.caseToken,revision:patched.revision,storageKeys:['biometrySession']})).session;
  const cleared=(await call(backend,'session','clear',{caseToken:replaced.caseToken})).session;assert.deepEqual(cleared.data,emptyCase());
  await assert.rejects(call(backend,'session','patch',{patch:{eyes:{OD:{al:'99'}}},caseToken:replaced.caseToken}),{code:'CASE_CHANGED'});
  assertClinicalUntouched(f);assertOnlyQaKeys(f);
});

test('QA backend rejects undeclared endpoints and payload storage-key choices',async()=>{
  const f=storageFixture(),backend=createQaBackend(f.storage,extensionId);
  for(const type of ['biometry:qa:library:update-patient','biometry:qa:session:delete','biometry:session:read','toString'])await assert.rejects(backend.request({type,keys:['biometryLibrary']},validSender()),{code:'UNKNOWN_QA_OPERATION'});
  assert.deepEqual(f.calls,[]);
  const {result}=await call(backend,'library','read',{storageKey:'biometryLibrary',prefix:'',keys:null});assert.deepEqual(result.patients,[]);assertClinicalUntouched(f);assertOnlyQaKeys(f);
});

function event(){const listeners=new Set();return {addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),emit:(...args)=>{for(const listener of listeners)listener(...args);},listeners};}
async function platformFixture(t,{view='qa'}={}){
  const previousChrome=Object.getOwnPropertyDescriptor(globalThis,'chrome'),previousLocation=Object.getOwnPropertyDescriptor(globalThis,'location');
  const f=storageFixture(),messages=[],tabCalls=[];
  const chrome={runtime:{id:extensionId,getManifest:()=>({version:'0.3.QA-TEST'}),getURL:path=>`chrome-extension://${extensionId}/${path}`,onInstalled:event(),onMessage:event()},action:{onClicked:event()},storage:f.storage,
    tabs:{onUpdated:event(),onRemoved:event(),get:async id=>{tabCalls.push(['get',id]);return {id,status:'complete',url:'https://iolsolver.com/regular'};},create:async options=>{tabCalls.push(['create',options]);return {id:42,...options};}},
    scripting:{executeScript:async options=>{tabCalls.push(['script',options]);return [{frameId:0,result:{siteId:'solver-regular',url:'https://iolsolver.com/regular',rows:[]}}];}},
  };
  Object.defineProperty(globalThis,'chrome',{configurable:true,writable:true,value:chrome});Object.defineProperty(globalThis,'location',{configurable:true,writable:true,value:{href:`chrome-extension://${extensionId}/index.html?view=${view}`}});
  t.after(()=>{previousChrome?Object.defineProperty(globalThis,'chrome',previousChrome):delete globalThis.chrome;previousLocation?Object.defineProperty(globalThis,'location',previousLocation):delete globalThis.location;});
  await import(`../src/background.js?qa-background=${imports++}`);
  async function dispatch(message,sender={id:extensionId,url:globalThis.location.href,frameId:0}){
    return new Promise(resolve=>{for(const listener of chrome.runtime.onMessage.listeners)listener(message,sender,resolve);});
  }
  chrome.runtime.sendMessage=async message=>{messages.push(structuredClone(message));return dispatch(message);};
  const api=await import(`../src/qa/platform.js?qa-platform=${imports++}`);f.calls.length=0;
  return {f,api,chrome,messages,tabCalls,dispatch};
}

test('QA transport uses only guarded QA endpoints and exact session metadata',async t=>{
  const {api,f,messages}=await platformFixture(t);assert.equal(api.isExtension,true);assert.equal(api.extensionVersion,'0.3.QA-TEST');
  const storageChanges=[];f.storage.onChanged.addListener((changes,area)=>storageChanges.push({changes,area}));
  let current=await api.loadData();assert.deepEqual(current.data,emptyCase());assert.equal(current.settings.geminiApiKey,'');
  const replacement=emptyCase();replacement.patient.patientId='QA-TRANSPORT-A';replacement.eyes.OD.al='23.45';
  current=await api.saveCase(replacement,{caseToken:current.caseToken,revision:current.revision});
  const {patient}=await api.createPatient(current.data.patient);
  const saved=await api.saveMeasurement({patientId:patient.id,label:'QA A1',data:current.data});
  const edited=await api.patchCase({eyes:{OD:{al:'25'}}});
  current=await api.selectMeasurement(patient.id,saved.measurement.id);assert.equal(current.data.eyes.OD.al,'23.45');assert.notEqual(current.caseToken,edited.caseToken);
  current=await api.activatePatient(patient.id);assert.deepEqual(current.data.eyes,{OD:{},OS:{}});
  const library=await api.loadLibrary();assert.equal(library.patients[0].measurements.length,1);
  current=await api.clearCase();assert.deepEqual(current.data,emptyCase());
  const sent=messages.find(message=>message.type==='biometry:qa:library:save-measurement');assert.equal(typeof sent.options.caseToken,'string');assert.equal(sent.options.revision,1);
  assert.ok(messages.every(message=>message.type.startsWith('biometry:qa:')));assertClinicalUntouched(f);assertOnlyQaKeys(f);
  assert.ok(storageChanges.some(event=>event.area==='session'));assert.ok(storageChanges.some(event=>event.area==='local'));
  assert.ok(storageChanges.every(event=>Object.keys(event.changes).every(key=>key.startsWith('biometryQa:'))));
  assert.ok(!JSON.stringify(storageChanges).includes('PRIVATE-CLINICAL-SENTINEL'));assert.ok(!JSON.stringify(storageChanges).includes('PRIVATE-KEY-SENTINEL'));
});

test('normal UI and webpage senders cannot invoke the background QA namespace',async t=>{
  const {api,f,messages,dispatch}=await platformFixture(t,{view:'floating'});
  await assert.rejects(api.loadData(),{code:'QA_CONTEXT_REQUIRED'});assert.deepEqual(messages,[]);
  for(const sender of [{id:extensionId,url:'https://iolsolver.com/regular'},{id:extensionId,url:`chrome-extension://${extensionId}/index.html?view=launcher`},{id:'another',url:qaUrl}]){
    const response=await dispatch({type:'biometry:qa:session:read'},sender);assert.equal(response.ok,false);assert.equal(response.code,'UNTRUSTED_QA_SENDER');
  }
  assert.deepEqual(f.calls,[]);assertClinicalUntouched(f);
});

test('QA transport surfaces conflict codes without replaying stale writes',async t=>{
  const {api,f,messages}=await platformFixture(t);const first=await api.loadData();await api.clearCase(first.caseToken);const count=messages.length;
  await assert.rejects(api.patchCase({eyes:{OD:{al:'99'}}},first.caseToken),{code:'CASE_CHANGED'});assert.equal(messages.length,count+1);assertClinicalUntouched(f);
});

test('QA website helpers reuse production transport but are never invoked on module load',async t=>{
  const {api,f,tabCalls}=await platformFixture(t);assert.deepEqual(tabCalls,[]);assert.deepEqual(f.calls,[]);
  const tab=await api.openSite({url:'https://iolsolver.com/regular'});assert.equal(tab.id,42);
  assert.equal((await api.waitTab(42)).id,42);
  const inspected=await api.inspectTab(42,emptyCase(),{},'inventory');assert.equal(inspected.frameId,0);assert.deepEqual(tabCalls.find(call=>call[0]==='script')[1].target,{tabId:42,frameIds:[0]});assert.deepEqual(f.calls,[]);
});

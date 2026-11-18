import assert from 'node:assert/strict';
import test from 'node:test';
import {cleanCase,emptyCase} from '../src/model.js';
import {cleanParserReport} from '../src/parser-report.js';
import {createEditor} from '../src/editor-state.js';
import {createSessionStore,SESSION_KEY} from '../src/session-store.js';
import {createLibraryStore,createLibraryService} from '../src/library-store.js';
import {exportCaseDocument,exportLibraryDocument,parseInterchange} from '../src/interchange.js';

const at='2026-11-18T00:00:00.000Z';
const field=(value,unit=null)=>({unit,status:'unverified',data_status:'present',verification_status:'unverified',candidate_value:value});
function report(){return cleanParserReport({schema_version:'1.2',source_sha256:'a'.repeat(64),workflow:'synthetic-parser',verification_state:'unverified',measurement_date:field('2026-11-18'),eyes:{OD:{al:field(23.45,'mm'),mean_k:field(44.2,'D'),pupil:field(3.1,'mm')},OS:{cct:field(551,'um')}}});}
function memory(initial={}){const values=structuredClone(initial);return {values,get:async()=>structuredClone(values),set:async updates=>Object.assign(values,structuredClone(updates))};}
function fixture(){let ids=0,tokens=0;const local=memory(),transient=memory();const options={newId:()=>`synthetic-${++ids}`,now:()=>at};const store=createLibraryStore(local,options),session=createSessionStore(transient,{newToken:()=>`case-${++tokens}`});return {local,transient,options,store,session,service:createLibraryService(store,session)};}

test('optional report is sparse and projects only bounded canonical final records',()=>{
  assert.equal(Object.hasOwn(emptyCase(),'report'),false);
  assert.equal(Object.hasOwn(cleanCase(emptyCase()),'report'),false);
  const source={...report(),raw_text:'PRIVATE SOURCE',images:['PRIVATE IMAGE'],metadata:{apiKey:'PRIVATE KEY'}};
  source.eyes.OD.mean_k.evidence={raw_text:'PRIVATE EVIDENCE'};
  const data=cleanCase({...emptyCase(),report:source});
  assert.deepEqual(data.report,report());assert.ok(!JSON.stringify(data).includes('PRIVATE'));
  assert.throws(()=>cleanCase({...emptyCase(),report:{schema_version:'unsupported'}}),{code:'PARSER_REPORT'});
  data.report.eyes.OD.mean_k.candidate_value=99;assert.equal(source.eyes.OD.mean_k.candidate_value,44.2);
});

test('report updates require exact revision and explicit null clears across restart',async()=>{
  const f=fixture(),initial=await f.session.read();
  await assert.rejects(f.session.patch({report:report()},initial.caseToken,'panel'),{code:'REVISION_CHANGED'});
  const saved=await f.session.patch({report:report(),eyes:{OD:{al:'23.45'}}},initial.caseToken,'panel',initial.revision);
  await assert.rejects(f.session.patch({report:null},saved.caseToken,'stale',initial.revision),{code:'REVISION_CHANGED'});
  await assert.rejects(f.session.patch({report:{schema_version:'unsupported'}},saved.caseToken,'invalid',saved.revision),{code:'PARSER_REPORT'});
  assert.deepEqual((await f.session.read()).data.report,report());
  assert.deepEqual((await createSessionStore(f.transient).read()).data.report,report());
  const cleared=await f.session.patch({report:null},saved.caseToken,'clear',saved.revision);
  assert.equal(Object.hasOwn(cleared.data,'report'),false);assert.equal(cleared.data.eyes.OD.al,'23.45');
  assert.equal(Object.hasOwn((await createSessionStore(f.transient).read()).data,'report'),false);
});

test('malformed stored report is reported without replacing or downgrading the saved session',async()=>{
  const record={data:{...emptyCase(),report:{schema_version:'unsupported'}},revision:5,caseToken:'preserve-me'};
  const storage=memory({[SESSION_KEY]:record,biometryCase:record.data});
  await assert.rejects(createSessionStore(storage).read(),{code:'PARSER_REPORT'});
  assert.deepEqual(storage.values[SESSION_KEY],record);
});

test('editor batches a guarded summary with selected fields and supports removing it',async t=>{
  const f=fixture(),calls=[];
  const api={loadData:()=>f.session.read(),subscribeCase:()=>()=>{},patchCase:(patch,token,revision)=>{calls.push({patch,revision});return f.session.patch(patch,token,'editor',revision);}};
  const editor=createEditor(api);t.after(()=>editor.dispose());await editor.init();
  editor.edit({report:report(),eyes:{OD:{al:'23.45'}}});await editor.flush();
  assert.equal(calls[0].revision,0);assert.deepEqual(editor.data.report,report());
  editor.edit({eyes:{OS:{cct:'551'}}});await editor.flush();assert.deepEqual(editor.data.report,report());
  editor.edit({report:null});await editor.flush();assert.equal(Object.hasOwn(editor.data,'report'),false);
});

test('saved reports survive select, duplicate and worker restart and cannot bypass draft guards',async()=>{
  const f=fixture(),initial=await f.session.read(),{patient}=await f.service.createPatient({patientId:'SYNTHETIC'});
  const draft=await f.session.patch({patient:{patientId:'SYNTHETIC'},eyes:{OD:{al:'23.45'}},report:report()},initial.caseToken,'import',initial.revision);
  const first=await f.service.saveMeasurement({patientId:patient.id,label:'baseline',caseToken:draft.caseToken,revision:draft.revision,data:draft.data});
  assert.deepEqual(first.measurement.report,report());
  const forged=structuredClone(draft.data);forged.report.eyes.OD.mean_k.candidate_value=45;
  await assert.rejects(f.service.saveMeasurement({patientId:patient.id,data:forged,caseToken:draft.caseToken,revision:draft.revision}),{code:'REVISION_CHANGED'});
  const copied=await f.service.duplicateMeasurement({patientId:patient.id,measurementId:first.measurement.id,expectedLibraryRevision:first.library.revision,caseToken:draft.caseToken,revision:draft.revision});
  assert.notEqual(copied.measurement.id,first.measurement.id);assert.deepEqual(copied.measurement.report,report());
  copied.measurement.report.eyes.OD.mean_k.candidate_value=99;
  const restored=await createLibraryStore(f.local,f.options).getMeasurement(patient.id,copied.measurement.id);
  assert.deepEqual(restored.data.report,report());
  const selected=await f.service.selectMeasurement(patient.id,first.measurement.id,draft.caseToken,draft.revision);
  assert.deepEqual(selected.data.report,report());
  const deleted=await f.service.deleteMeasurements({patientId:patient.id,measurementIds:[first.measurement.id],expectedLibraryRevision:copied.library.revision,caseToken:selected.caseToken,revision:selected.revision});
  assert.deepEqual(deleted.session.data.report,report());
  const cleared=await f.session.patch({report:null},deleted.session.caseToken,'clear',deleted.session.revision);
  const update=await f.service.saveMeasurement({patientId:patient.id,measurementId:copied.measurement.id,expectedLibraryRevision:deleted.library.revision,caseToken:cleared.caseToken,revision:cleared.revision});
  assert.equal(Object.hasOwn(update.measurement,'report'),false);
  const empty=await f.service.activatePatient(patient.id,cleared.caseToken,cleared.revision);
  assert.equal(Object.hasOwn(empty.data,'report'),false);
});

test('case and mixed library backups use 1.4 only when a canonical report is present',async()=>{
  const data={...emptyCase(),report:report()};data.eyes.OD.al='23.45';
  assert.equal(exportCaseDocument(emptyCase(),{now:at}).schemaVersion,'1.3');
  const document=exportCaseDocument(data,{now:at});assert.equal(document.schemaVersion,'1.4');assert.deepEqual(parseInterchange(document).data,data);
  const reordered=structuredClone(document);reordered.case.report=Object.fromEntries(Object.entries(document.case.report).reverse());assert.deepEqual(parseInterchange(reordered).data.report,report());
  const f=fixture(),{patient}=await f.store.createPatient({patientId:'SYNTHETIC'});
  await f.store.saveMeasurement({patientId:patient.id,data:emptyCase()});await f.store.saveMeasurement({patientId:patient.id,data});
  const backup=exportLibraryDocument(await f.store.read(),{now:at});assert.equal(backup.schemaVersion,'1.4');
  const parsed=parseInterchange(backup);assert.equal(Object.hasOwn(parsed.data.patients[0].measurements[0],'report'),false);assert.deepEqual(parsed.data.patients[0].measurements[1].report,report());
  const imported=fixture();await imported.store.importPatients(parsed.data.patients);assert.deepEqual((await imported.store.read()).patients[0].measurements[1].report,report());
  const regular=structuredClone(backup);delete regular.patients[0].measurements[1].report;
  assert.equal(exportLibraryDocument(parseInterchange(regular).data,{now:at}).schemaVersion,'1.3');
});

test('backup reports reject raw evidence, invalid records and older-version report fields',()=>{
  const base=exportCaseDocument({...emptyCase(),report:report()},{now:at});
  const mutations=[report=>{report.raw_text='should not persist';},report=>{report.eyes.OD.mean_k.evidence=[];},report=>{report.eyes.OD.mean_k.unit='mm';},report=>{report.eyes.OD.mean_k.status='invalid';}];
  for(const mutate of mutations){const value=structuredClone(base);mutate(value.case.report);assert.throws(()=>parseInterchange(value),{code:'INTERCHANGE_REPORT'});assert.throws(()=>exportCaseDocument(value.case,{now:at}),{code:'INTERCHANGE_REPORT'});}
  assert.throws(()=>parseInterchange({...base,case:{...base.case,report:null}}),{code:'INTERCHANGE_REPORT'});
  assert.throws(()=>parseInterchange({...base,schemaVersion:'1.3'}),{code:'INTERCHANGE_FIELD'});
});

test('ordinary workbench preview transport retains reports in guarded saved measurements',async t=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'chrome');delete globalThis.chrome;
  t.after(()=>previous?Object.defineProperty(globalThis,'chrome',previous):delete globalThis.chrome);
  const api=await import('../src/platform.js?report-preview');
  const initial=await api.loadData(),saved=await api.patchCase({report:report(),eyes:{OD:{al:'23.45'}}},initial.caseToken,initial.revision);
  const {patient}=await api.createPatient({patientId:'SYNTHETIC-PREVIEW'});
  const measurement=await api.saveMeasurement({patientId:patient.id,label:'Preview report',data:saved.data});
  const reset=await api.clearCase(saved.caseToken);
  const selected=await api.selectMeasurement(patient.id,measurement.measurement.id,reset.caseToken,reset.revision);
  assert.deepEqual(selected.data.report,report());assert.deepEqual((await api.loadLibrary()).patients[0].measurements[0].report,report());
});

test('direct site inspection never sends the private report summary to a calculator',async t=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'chrome');let injected;
  const chrome={runtime:{id:'report-privacy-test'},tabs:{get:async id=>({id,url:'https://calc.apacrs.org/barrett_universal2105/'})},scripting:{executeScript:async args=>{injected=args;return [{frameId:0,result:{siteId:'barrett-universal',rows:[{key:'al',status:'ready',value:'23.45'}]}}];}}};
  Object.defineProperty(globalThis,'chrome',{value:chrome,configurable:true,writable:true});
  t.after(()=>previous?Object.defineProperty(globalThis,'chrome',previous):delete globalThis.chrome);
  const api=await import('../src/platform.js?report-site-privacy'),data={...emptyCase(),report:report()};data.eyes.OD.al='23.45';
  await api.inspectTab(7,data);
  assert.equal(Object.hasOwn(injected.args[2],'report'),false);assert.equal(injected.args[2].eyes.OD.al,'23.45');assert.deepEqual(data.report,report());
});

test('real background report endpoint forwards revision and rejects old or untrusted writers',async t=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'chrome'),local=memory(),session=memory();let handler;
  const event=()=>({addListener(){},removeListener(){}});
  const chrome={runtime:{id:'report-background-test',onMessage:{addListener(fn){handler=fn;}},onInstalled:event()},action:{onClicked:event()},storage:{local:{...local,setAccessLevel:async()=>{}},session:{...session,setAccessLevel:async()=>{}},onChanged:event()},tabs:{onUpdated:event()}};
  Object.defineProperty(globalThis,'chrome',{value:chrome,configurable:true,writable:true});
  t.after(()=>previous?Object.defineProperty(globalThis,'chrome',previous):delete globalThis.chrome);
  await import('../src/background.js?report-background');
  const sender={id:chrome.runtime.id,url:`chrome-extension://${chrome.runtime.id}/index.html`};
  const call=(message,source=sender)=>new Promise(resolve=>handler(message,source,resolve));
  const initial=(await call({type:'biometry:session:read'})).session;
  const request={type:'biometry:session:patch',patch:{report:report()},caseToken:initial.caseToken,clientId:'synthetic-panel'};
  assert.equal((await call(request)).code,'REVISION_CHANGED');
  const saved=await call({...request,revision:initial.revision});assert.equal(saved.ok,true);assert.deepEqual(saved.session.data.report,report());
  assert.equal((await call({...request,patch:{report:null},revision:initial.revision})).code,'REVISION_CHANGED');
  assert.equal((await call({...request,revision:saved.session.revision},{id:chrome.runtime.id,url:'https://iolcalculator.escrs.org/'})).code,'UNTRUSTED_SENDER');
  assert.deepEqual((await call({type:'biometry:session:read'})).session.data.report,report());
});

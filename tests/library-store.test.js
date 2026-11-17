import assert from 'node:assert/strict';
import test from 'node:test';
import { createLibraryStore,createLibraryService,LIBRARY_KEY,cleanLibrary } from '../src/library-store.js';
import { createSessionStore } from '../src/session-store.js';
import { emptyCase } from '../src/model.js';

function memory(initial={}) {
  const values=structuredClone(initial);let fail=false;
  return {values,failNext(){fail=true;},storage:{get:async()=>structuredClone(values),set:async next=>{if(fail){fail=false;throw new Error('quota');}Object.assign(values,structuredClone(next));}}};
}
function fixture(){
  const local=memory(),transient=memory();let ids=0,tokens=0;
  const options={newId:()=>`id-${++ids}`,now:()=>`2026-11-15T00:00:00.000Z`};
  const library=createLibraryStore(local.storage,options),session=createSessionStore(transient.storage,{newToken:()=>`case-${++tokens}`});
  return {local,transient,library,session,service:createLibraryService(library,session),options};
}
async function source(f,identity={patientId:'TEST-A',name:'Synthetic A',age:'60'}){
  const initial=await f.session.read();
  const current=await f.session.patch({patient:identity,eyes:{OD:{al:'23.45',k1:'43.2',k2:'44.1',toric:true},OS:{al:'24.10',target:'0'}}},initial.caseToken);
  const {patient}=await f.service.createPatient(identity);
  return {patient,current};
}

test('multiple patients and independent measurement snapshots survive worker restart',async()=>{
  const f=fixture(),a=await source(f);
  const first=await f.service.saveMeasurement({patientId:a.patient.id,label:'First',measuredAt:'2026-11-14T12:00:00Z',source:'Synthetic device',caseToken:a.current.caseToken,revision:a.current.revision});
  const edited=await f.session.patch({patient:{age:'61'},eyes:{OD:{al:'24.01'},OS:{al:'25.33'}}},a.current.caseToken);
  const second=await f.service.saveMeasurement({patientId:a.patient.id,label:'Repeat',caseToken:edited.caseToken,revision:edited.revision});
  await f.service.createPatient({patientId:'TEST-B',name:'Synthetic B'});
  const restored=await createLibraryStore(f.local.storage,f.options).read();
  assert.equal(restored.patients.length,2);assert.equal(restored.patients[0].measurements.length,2);
  assert.equal(first.measurement.eyes.OD.al,'23.45');assert.equal(second.measurement.eyes.OD.al,'24.01');
  assert.equal(restored.patients[0].measurements[0].patient.age,'60');assert.equal(restored.patients[0].measurements[1].patient.age,'61');
  assert.equal(restored.patients[0].measurements[0].eyes.OS.al,'24.10');
});

test('selecting historical measurement restores historical age and surgeon, and detaches draft edits',async()=>{
  const f=fixture(),a=await source(f,{patientId:'TEST-A',age:'60',surgeonName:'Surgeon one'});
  const saved=await f.service.saveMeasurement({patientId:a.patient.id,label:'Old',caseToken:a.current.caseToken,revision:a.current.revision});
  await f.library.updatePatient(a.patient.id,{patientId:'TEST-A',age:'70',surgeonName:'Surgeon two'});
  const selected=await f.service.selectMeasurement(a.patient.id,saved.measurement.id,a.current.caseToken,a.current.revision,'panel');
  assert.deepEqual(selected.selection,{patientId:a.patient.id,measurementId:saved.measurement.id});
  assert.notEqual(selected.caseToken,a.current.caseToken);assert.equal(selected.data.patient.age,'60');assert.equal(selected.data.patient.surgeonName,'Surgeon one');
  await f.session.patch({eyes:{OD:{al:'26'}}},selected.caseToken);
  assert.equal((await f.library.getMeasurement(a.patient.id,saved.measurement.id)).data.eyes.OD.al,'23.45');
  const restored=await createSessionStore(f.transient.storage).read();assert.deepEqual(restored.selection,selected.selection);
});

test('activating a patient opens an empty draft and clears any previously selected measurement',async()=>{
  const f=fixture(),a=await source(f),b=await f.service.createPatient({patientId:'TEST-B'});
  const opened=await f.service.activatePatient(b.patient.id,a.current.caseToken,a.current.revision,'switch');
  assert.equal(opened.data.patient.patientId,'TEST-B');assert.deepEqual(opened.data.eyes,{OD:{},OS:{}});
  assert.deepEqual(opened.selection,{patientId:b.patient.id,measurementId:null});
  await assert.rejects(f.session.patch({eyes:{OD:{al:'99'}}},a.current.caseToken),{code:'CASE_CHANGED'});
});

test('saving requires the exact active case and draft revision before writing persistent storage',async()=>{
  const f=fixture(),a=await source(f);
  await f.session.patch({eyes:{OD:{al:'24'}}},a.current.caseToken);
  await assert.rejects(f.service.saveMeasurement({patientId:a.patient.id,caseToken:a.current.caseToken,revision:a.current.revision}),{code:'REVISION_CHANGED'});
  const before=await f.library.read();assert.equal(before.patients[0].measurements.length,0);
  const current=await f.session.read();await f.session.clear(current.caseToken);
  await assert.rejects(f.service.saveMeasurement({patientId:a.patient.id,caseToken:current.caseToken,revision:current.revision}),{code:'CASE_CHANGED'});
  assert.equal((await f.library.read()).revision,before.revision);
});

test('stale snapshot data and a different selected patient cannot be filed into the wrong record',async()=>{
  const f=fixture(),a=await source(f),b=await f.service.createPatient({patientId:'TEST-B'});
  const wrong=structuredClone(a.current.data);wrong.eyes.OD.al='99';
  await assert.rejects(f.service.saveMeasurement({patientId:a.patient.id,data:wrong,caseToken:a.current.caseToken,revision:a.current.revision}),{code:'REVISION_CHANGED'});
  const selected=await f.service.activatePatient(a.patient.id,a.current.caseToken,a.current.revision);
  await assert.rejects(f.service.saveMeasurement({patientId:b.patient.id,caseToken:selected.caseToken,revision:selected.revision}),{code:'PATIENT_MISMATCH'});
  assert.equal((await f.library.read()).patients.flatMap(p=>p.measurements).length,0);
});

test('existing snapshots update only explicitly and under a checked library revision',async()=>{
  const f=fixture(),a=await source(f);
  const first=await f.service.saveMeasurement({patientId:a.patient.id,label:'baseline',measuredAt:'2026-11-14T12:00Z',source:'scanner',caseToken:a.current.caseToken,revision:a.current.revision});
  const edited=await f.session.patch({eyes:{OD:{al:'24'}}},a.current.caseToken);
  await assert.rejects(f.service.saveMeasurement({patientId:a.patient.id,measurementId:first.measurement.id,caseToken:edited.caseToken,revision:edited.revision}),{code:'LIBRARY_CHANGED'});
  const updated=await f.service.saveMeasurement({patientId:a.patient.id,measurementId:first.measurement.id,expectedLibraryRevision:first.library.revision,label:'rechecked',caseToken:edited.caseToken,revision:edited.revision});
  assert.equal(updated.patient.measurements.length,1);assert.equal(updated.measurement.id,first.measurement.id);
  assert.equal(updated.measurement.eyes.OD.al,'24');assert.equal(updated.measurement.label,'rechecked');assert.equal(updated.measurement.source,'scanner');assert.equal(updated.measurement.measuredAt,first.measurement.measuredAt);
  await assert.rejects(f.service.saveMeasurement({patientId:a.patient.id,measurementId:first.measurement.id,expectedLibraryRevision:first.library.revision,caseToken:edited.caseToken,revision:edited.revision}),{code:'LIBRARY_CHANGED'});
});

test('concurrent appends and patients serialize without dropping saved measurements',async()=>{
  const f=fixture(),a=await source(f);
  await Promise.all(['one','two','three'].map(label=>f.service.saveMeasurement({patientId:a.patient.id,label,caseToken:a.current.caseToken,revision:a.current.revision})));
  const stored=await f.library.read();assert.deepEqual(stored.patients[0].measurements.map(m=>m.label),['one','two','three']);
  assert.equal(new Set(stored.patients[0].measurements.map(m=>m.id)).size,3);
});

test('a measurement save holds the session queue so a subsequent clear cannot change its patient mid-save',async()=>{
  const f=fixture(),a=await source(f);
  const saving=f.service.saveMeasurement({patientId:a.patient.id,label:'before-clear',caseToken:a.current.caseToken,revision:a.current.revision});
  const clearing=f.session.clear(a.current.caseToken);
  await saving;const cleared=await clearing;
  assert.deepEqual(cleared.data,emptyCase());assert.equal((await f.library.read()).patients[0].measurements[0].label,'before-clear');
});

test('failed local writes and quota limits leave committed snapshots intact',async()=>{
  const f=fixture(),a=await source(f);const before=await f.library.read();f.local.failNext();
  await assert.rejects(f.service.saveMeasurement({patientId:a.patient.id,caseToken:a.current.caseToken,revision:a.current.revision}),/quota/);
  assert.deepEqual(await f.library.read(),before);
  const tiny=createLibraryStore(memory().storage,{maxBytes:50});await assert.rejects(tiny.createPatient({patientId:'TOO-LARGE'}),/容量/);
});

test('saved library allowlist drops arbitrary fields and does not accept corrupted duplicate IDs',async()=>{
  const f=fixture(),a=await source(f);a.current.data.eyes.OD.extra='discard';
  const saved=await f.library.saveMeasurement({patientId:a.patient.id,data:a.current.data,label:'safe'});
  assert.equal(saved.measurement.eyes.OD.extra,undefined);assert.equal({}.polluted,undefined);
  const invalid=structuredClone(saved.library);invalid.patients.push(structuredClone(invalid.patients[0]));
  assert.throws(()=>cleanLibrary(invalid),/重複/);
  const bad=memory({[LIBRARY_KEY]:{version:999,patients:[]}});await assert.rejects(createLibraryStore(bad.storage).read(),/格式/);assert.equal(bad.values[LIBRARY_KEY].version,999);
});

test('library data survives session clear, and callers cannot mutate stored snapshots through returned references',async()=>{
  const f=fixture(),a=await source(f),saved=await f.service.saveMeasurement({patientId:a.patient.id,caseToken:a.current.caseToken,revision:a.current.revision});
  saved.measurement.eyes.OD.al='99';saved.library.patients[0].patient.patientId='bad';
  await f.session.clear(a.current.caseToken);
  const stored=await f.library.read();assert.equal(stored.patients[0].patient.patientId,'TEST-A');assert.equal(stored.patients[0].measurements[0].eyes.OD.al,'23.45');
});

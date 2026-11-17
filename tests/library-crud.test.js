import assert from 'node:assert/strict';
import test from 'node:test';
import {createLibraryStore,createLibraryService} from '../src/library-store.js';
import {createSessionStore} from '../src/session-store.js';

async function fixture(){
  const persistent={},transient={};let id=0,token=0;
  const storage=value=>({get:async()=>structuredClone(value),set:async patch=>Object.assign(value,structuredClone(patch))});
  const store=createLibraryStore(storage(persistent),{newId:()=>`item-${++id}`,now:()=>new Date('2026-11-15T01:00:00Z').toISOString()});
  const session=createSessionStore(storage(transient),{newToken:()=>`case-${++token}`}),service=createLibraryService(store,session);
  let current=await session.read();current=await session.patch({patient:{patientId:'SYN-A',name:'Synthetic A',age:'60',surgeonName:'OPH'},eyes:{OD:{al:'23.45',toric:true},OS:{al:'24.10',lvcType:'none'}}},current.caseToken);
  const {patient}=await service.createPatient(current.data.patient);
  const first=await service.saveMeasurement({patientId:patient.id,label:'Baseline',measuredAt:'2026-11-14T01:00:00Z',caseToken:current.caseToken,revision:current.revision});
  current=await service.selectMeasurement(patient.id,first.measurement.id,current.caseToken,current.revision);
  const second=await service.saveMeasurement({patientId:patient.id,label:'Repeat',caseToken:current.caseToken,revision:current.revision});
  const third=await service.saveMeasurement({patientId:patient.id,label:'Third',caseToken:current.caseToken,revision:current.revision});
  const options=async()=>{const active=await session.read(),library=await store.read();return {patientId:patient.id,caseToken:active.caseToken,revision:active.revision,expectedLibraryRevision:library.revision};};
  return {store,session,service,patient,first,second,third,options};
}

test('batch deletion removes only selected measurements, detaches an active snapshot, and preserves both-eye draft edits',async()=>{
  const f=await fixture();let current=await f.session.read();await f.session.patch({eyes:{OD:{al:'23.95'}}},current.caseToken);
  const options=await f.options(),result=await f.service.deleteMeasurements({...options,measurementIds:[f.first.measurement.id,f.third.measurement.id]});
  assert.deepEqual(result.library.patients[0].measurements.map(item=>item.id),[f.second.measurement.id]);
  assert.deepEqual(result.session.selection,{patientId:f.patient.id,measurementId:null});
  assert.equal(result.session.data.eyes.OD.al,'23.95');assert.equal(result.session.data.eyes.OS.al,'24.10');
  assert.notEqual(result.session.caseToken,options.caseToken);
  await assert.rejects(f.session.patch({eyes:{OD:{al:'25'}}},options.caseToken),{code:'CASE_CHANGED'});
});

test('deleting a whole patient preserves the draft and other patients, with no dangling selection',async()=>{
  const f=await fixture(),other=await f.service.createPatient({patientId:'SYN-B'}),result=await f.service.deletePatient(await f.options());
  assert.deepEqual(result.library.patients.map(item=>item.id),[other.patient.id]);
  assert.equal(result.session.selection,undefined);assert.equal(result.session.data.patient.patientId,'SYN-A');
  assert.equal(result.session.data.eyes.OD.al,'23.45');assert.equal(result.session.data.eyes.OS.al,'24.10');
});

test('unrelated measurement deletion leaves active session token and selection untouched',async()=>{
  const f=await fixture(),before=await f.session.read();
  const result=await f.service.deleteMeasurements({...await f.options(),measurementIds:[f.third.measurement.id]});
  assert.equal(result.session,undefined);assert.deepEqual(await f.session.read(),before);
  assert.equal(result.library.patients[0].measurements.length,2);
});

test('stale or missing batch targets fail atomically instead of deleting the remaining matches',async()=>{
  const f=await fixture(),before=await f.store.read(),options=await f.options();
  await assert.rejects(f.service.deleteMeasurements({...options,measurementIds:[f.first.measurement.id,'missing']}),/未刪除/);
  assert.deepEqual(await f.store.read(),before);
  await f.store.createPatient({patientId:'SYN-B'});
  await assert.rejects(f.service.deletePatient(options),{code:'LIBRARY_CHANGED'});
  assert.equal((await f.store.read()).patients[0].measurements.length,3);
});

test('copy creates an independent complete OD/OS snapshot with its own identity and original measurement time',async()=>{
  const f=await fixture(),before=await f.session.read(),result=await f.service.duplicateMeasurement({...await f.options(),measurementId:f.first.measurement.id});
  assert.notEqual(result.measurement.id,f.first.measurement.id);assert.equal(result.measurement.label,'Baseline 副本');
  assert.equal(result.measurement.measuredAt,f.first.measurement.measuredAt);assert.deepEqual(result.measurement.eyes,f.first.measurement.eyes);
  assert.deepEqual(await f.session.read(),before);
  result.measurement.eyes.OD.al='99';
  assert.equal((await f.store.getMeasurement(f.patient.id,f.first.measurement.id)).data.eyes.OD.al,'23.45');
  assert.equal((await f.store.getMeasurement(f.patient.id,result.measurement.id)).data.eyes.OD.al,'23.45');
});

test('identity correction updates snapshot identities but preserves historical age, surgeon, and unsaved eye values',async()=>{
  const f=await fixture(),current=await f.session.read();await f.session.patch({eyes:{OS:{al:'24.88'}}},current.caseToken);
  const result=await f.service.editPatient({...await f.options(),patient:{...f.patient.patient,patientId:'SYN-A-CORRECTED',name:'Corrected',age:'70',surgeonName:'New surgeon'}});
  assert.equal(result.patient.patient.age,'70');
  for(const item of result.patient.measurements){assert.equal(item.patient.patientId,'SYN-A-CORRECTED');assert.equal(item.patient.name,'Corrected');assert.equal(item.patient.age,'60');assert.equal(item.patient.surgeonName,'OPH');}
  assert.equal(result.session.data.patient.patientId,'SYN-A-CORRECTED');assert.equal(result.session.data.patient.age,'60');assert.equal(result.session.data.eyes.OS.al,'24.88');
  const selected=await f.service.selectMeasurement(f.patient.id,f.first.measurement.id,result.session.caseToken,result.session.revision);
  const saved=await f.service.saveMeasurement({patientId:f.patient.id,caseToken:selected.caseToken,revision:selected.revision,label:'After correction'});
  assert.equal(saved.measurement.patient.name,'Corrected');
});

test('a session changed by another panel rejects destructive work before persistent records are touched',async()=>{
  const f=await fixture(),options=await f.options(),before=await f.store.read();
  await f.session.patch({eyes:{OD:{al:'24.05'}}},options.caseToken);
  await assert.rejects(f.service.deletePatient(options),{code:'REVISION_CHANGED'});
  await assert.rejects(f.service.duplicateMeasurement({...options,measurementId:f.first.measurement.id}),{code:'REVISION_CHANGED'});
  assert.deepEqual(await f.store.read(),before);
});

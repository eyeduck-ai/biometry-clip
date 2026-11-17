import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createLibraryStore,createLibraryService,LIBRARY_KEY} from '../src/library-store.js';
import {createSessionStore} from '../src/session-store.js';
import {parseInterchange} from '../src/interchange.js';

const at='2026-11-15T04:00:00.000Z';
async function source(){return parseInterchange(JSON.parse(await readFile(new URL('../examples/biometry-library.synthetic.json',import.meta.url),'utf8'))).data.patients;}
function fixture({maxBytes,newId}={}){
  let sequence=0,writes=0,failWrite=false;
  const values={settings:{privateApiKey:'PRIVATE-SENTINEL'}},transient={};
  const storage={get:async()=>structuredClone(values),set:async patch=>{writes++;if(failWrite){failWrite=false;throw new Error('quota');}Object.assign(values,structuredClone(patch));}};
  const store=createLibraryStore(storage,{now:()=>at,newId:newId||(()=>`new-${++sequence}`),...(maxBytes?{maxBytes}:{})});
  const session=createSessionStore({get:async()=>structuredClone(transient),set:async patch=>Object.assign(transient,structuredClone(patch))});
  return {store,session,service:createLibraryService(store,session),values,transient,get writes(){return writes;},failNext(){failWrite=true;}};
}

test('library import appends all snapshots in one commit with new IDs and preserves the active session',async()=>{
  const f=fixture(),existing=await f.store.createPatient({patientId:'EXISTING',name:'PRIVATE EXISTING PATIENT'});
  const draft=await f.session.read();await f.session.patch({patient:{patientId:'ACTIVE'},eyes:{OD:{al:'26.10'},OS:{al:'27.20'}}},draft.caseToken);
  const sessionBefore=structuredClone(f.transient),original=structuredClone(existing.patient),settings=structuredClone(f.values.settings),patients=await source(),before=structuredClone(patients),writes=f.writes;
  patients[0].patient.name='SYNTHETIC NEW NAME';patients[0].measurements[0].patient.name='SYNTHETIC HISTORICAL NAME';
  const result=await f.service.importPatients(patients,existing.library.revision);
  assert.equal(f.writes,writes+1);assert.equal(result.library.revision,existing.library.revision+1);assert.equal(result.library.patients.length,2);
  assert.deepEqual(result.library.patients[0],original);assert.deepEqual(f.transient,sessionBefore);assert.deepEqual(f.values.settings,settings);
  const added=result.library.patients[1];assert.notEqual(added.id,patients[0].id);assert.equal(added.measurements.length,2);assert.equal(added.patient.name,'SYNTHETIC NEW NAME');assert.equal(added.measurements[0].patient.name,'SYNTHETIC HISTORICAL NAME');
  assert.equal(added.measurements[0].eyes.OD.al,'23.45');assert.equal(added.measurements[1].eyes.OD.al,'23.68');assert.equal(added.measurements[0].eyes.OS.al,'24.10');assert.equal(added.measurements[0].measuredAt,before[0].measurements[0].measuredAt);
  assert.equal(added.createdAt,at);assert.equal(added.measurements[0].createdAt,at);assert.notEqual(added.measurements[0].id,patients[0].measurements[0].id);
  assert.equal(result.imported[0].sourcePatientId,patients[0].id);assert.equal(result.imported[0].patientId,added.id);assert.equal(result.imported[0].measurements.length,2);
  assert.equal(JSON.stringify(f.values[LIBRARY_KEY]).includes('sourcePatientId'),false);
});

test('an invalid later patient rejects the entire batch before any persistent write',async()=>{
  const f=fixture(),patients=await source();await f.store.createPatient({patientId:'EXISTING'});const before=structuredClone(f.values),writes=f.writes;
  const second=structuredClone(patients[0]);second.id='source-second';second.measurements[0].eyes.OD.al='not-a-number';patients.push(second);
  await assert.rejects(f.store.importPatients(patients),/數值/);assert.equal(f.writes,writes);assert.deepEqual(f.values,before);assert.equal((await f.store.read()).patients.length,1);
  const unknown=await source();unknown[0].measurements[1].eyes.OS.inferredAl='25.1';await assert.rejects(f.store.importPatients(unknown),/未知/);assert.deepEqual(f.values,before);
});

test('duplicate source IDs, malformed dates and invalid typed fields are rejected atomically',async()=>{
  for(const mutate of [patients=>patients[0].measurements[1].id=patients[0].measurements[0].id,patients=>patients[0].measurements[1].measuredAt='invalid',patients=>patients[0].measurements[0].eyes.OD.toric='true',patients=>patients[0].measurements[0].eyes.OS.k1Axis='181']){
    const f=fixture(),patients=await source(),before=structuredClone(f.values);mutate(patients);await assert.rejects(f.store.importPatients(patients));assert.equal(f.writes,0);assert.deepEqual(f.values,before);
  }
});

test('ID allocation, write failure and storage limits cannot leave a partial import',async()=>{
  const colliding=fixture({newId:()=> 'source-patient-a'}),patients=await source();await assert.rejects(colliding.store.importPatients(patients),/識別碼/);assert.equal(colliding.writes,0);
  const quota=fixture({maxBytes:250});await assert.rejects(quota.store.importPatients(patients),/容量/);assert.equal(quota.writes,0);assert.equal((await quota.store.read()).patients.length,0);
  const failure=fixture();failure.failNext();await assert.rejects(failure.store.importPatients(patients),/quota/);assert.equal((await failure.store.read()).patients.length,0);assert.equal(failure.values[LIBRARY_KEY],undefined);
  const saved=await failure.store.importPatients(patients);assert.equal(saved.library.patients[0].measurements.length,2);
});

test('concurrent imports use the library revision guard without duplicating a stale request',async()=>{
  const f=fixture(),patients=await source(),initial=await f.store.read();
  const results=await Promise.allSettled([f.store.importPatients(patients,initial.revision),f.store.importPatients(patients,initial.revision)]);
  assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.equal(results[1].reason.code,'LIBRARY_CHANGED');assert.equal((await f.store.read()).patients.length,1);assert.equal(f.writes,1);
});

test('an empty import is a no-op and source or returned objects cannot mutate saved snapshots',async()=>{
  const f=fixture();const empty=await f.store.importPatients([],0);assert.equal(empty.library.revision,0);assert.equal(f.writes,0);
  const patients=await source(),before=structuredClone(patients),saved=await f.store.importPatients(patients);assert.deepEqual(patients,before);
  patients[0].measurements[0].eyes.OD.al='88';saved.library.patients[0].measurements[0].eyes.OS.al='99';saved.imported[0].patientId='changed';
  const actual=await f.store.read();assert.equal(actual.patients[0].measurements[0].eyes.OD.al,'23.45');assert.equal(actual.patients[0].measurements[0].eyes.OS.al,'24.10');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createLibraryStore,createLibraryService,LIBRARY_KEY} from '../src/library-store.js';
import {createSessionStore,SESSION_KEY} from '../src/session-store.js';

const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function until(predicate,description){for(let i=0;i<100;i++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,0));}throw new Error(`Timed out: ${description}`);}

async function fixture(t){
  const dom=new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>',{url:'http://127.0.0.1/index.html'});
  const keys=['window','document','location','Event','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','setTimeout','setInterval','__appLibraryPlatform'];
  const saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const nativeTimeout=setTimeout,timers=new Set();
  for(const key of keys.filter(key=>!['setTimeout','setInterval','__appLibraryPlatform'].includes(key)))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:dom.window[key]});
  globalThis.setTimeout=(callback,delay,...args)=>{const timer=nativeTimeout(callback,delay,...args);timers.add(timer);return timer;};
  globalThis.setInterval=()=>0;
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new dom.window.Event('close'));};
  t.after(()=>{for(const timer of timers)clearTimeout(timer);for(const [key,descriptor]of saved)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];dom.window.close();});
  const local={},transient={},caseListeners=new Set(),libraryListeners=new Set();
  const session=createSessionStore({get:async()=>structuredClone(transient),set:async values=>{Object.assign(transient,structuredClone(values));if(values[SESSION_KEY])for(const listener of caseListeners)listener(structuredClone(values[SESSION_KEY]));}});
  const store=createLibraryStore({get:async()=>structuredClone(local),set:async values=>{Object.assign(local,structuredClone(values));if(values[LIBRARY_KEY])for(const listener of libraryListeners)listener(structuredClone(values[LIBRARY_KEY]));}});
  const service=createLibraryService(store,session),patients=[];
  for(const [id,name,age,od,os]of [['SYNTHETIC-A','Synthetic A','60','23.45','24.10'],['SYNTHETIC-B','Synthetic B','70','25.50','26.20']]){
    let current=await session.read();current=await session.clear(current.caseToken);
    current=await session.patch({patient:{patientId:id,name,age,surgeonName:`Surgeon ${id}`},eyes:{OD:{al:od,k1:'43.20',k2:'44.10',aConstant:'118.7'},OS:{al:os,k1:'42.75',k2:'43.65',aConstant:'118.7'}}},current.caseToken);
    const created=await service.createPatient(current.data.patient);
    const result=await service.saveMeasurement({patientId:created.patient.id,label:`${id} baseline`,source:'SYNTHETIC TEST DEVICE',measuredAt:'2026-11-14T12:00:00Z',caseToken:current.caseToken,revision:current.revision});
    patients.push({patient:result.patient,measurement:result.measurement});
  }
  await store.updatePatient(patients[1].patient.id,{...patients[1].patient.patient,age:'77'});
  const before=await session.read();await service.selectMeasurement(patients[0].patient.id,patients[0].measurement.id,before.caseToken,before.revision);
  let holdSave=null,selectCalls=0;
  const api={
    loadLanguage:async()=>'zh-TW',
    isExtension:false,defaultSettings:{ocrProvider:'local',localModel:'small'},getFloatingTabId:()=>undefined,siteTabs:async()=>[],subscribeTabs:()=>()=>{},
    subscribeCase:listener=>{caseListeners.add(listener);return()=>caseListeners.delete(listener);},loadData:async()=>({...await session.read(),settings:{ocrProvider:'local',localModel:'small'}}),
    patchCase:(patch,token)=>session.patch(patch,token,'test-panel'),clearCase:token=>session.clear(token,'test-panel'),
    subscribeLibrary:listener=>{libraryListeners.add(listener);return()=>libraryListeners.delete(listener);},loadLibrary:()=>service.read(),
    createPatient:(...args)=>service.createPatient(...args),activatePatient:(...args)=>service.activatePatient(...args),
    editPatient:options=>service.editPatient(options),deletePatient:options=>service.deletePatient(options),deleteMeasurements:options=>service.deleteMeasurements(options),duplicateMeasurement:options=>service.duplicateMeasurement(options),
    selectMeasurement:(...args)=>{selectCalls++;return service.selectMeasurement(...args);},
    saveMeasurement:async options=>{const result=await service.saveMeasurement(options);if(holdSave){holdSave.saved.resolve(result);await holdSave.release.promise;}return result;},
  };
  globalThis.__appLibraryPlatform=api;
  const appUrl=new URL('../src/app.js',import.meta.url);
  // Exercise the real app/editor/UI modules with a deterministic transport.
  // Node cannot load the app's CSS import; only that import and platform binding
  // are adapted. Persistent/session operations run through the real services.
  const source=(await readFile(appUrl,'utf8')).replace(/^import '\.\/styles\.css';\r?\n/m,'').replace("import * as platform from './platform.js';",'const platform=globalThis.__appLibraryPlatform;').replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL(path,appUrl).href}'`);
  await import(`data:text/javascript;base64,${Buffer.from(`${source}\n// ${crypto.randomUUID()}`).toString('base64')}`);
  await until(()=>dom.window.document.querySelector('#patient-picker')?.value===patients[0].patient.id,'app initialization');
  const find=selector=>{const element=dom.window.document.querySelector(selector);assert.ok(element,`Missing UI control ${selector}`);return element;};
  const input=(selector,value)=>{const element=find(selector);element.value=value;element.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
  const change=(selector,value)=>{const element=find(selector);element.value=value;element.dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
  const click=selector=>find(selector).click();
  return {dom,session,store,service,patients,find,input,change,click,get selectCalls(){return selectCalls;},delaySave(){holdSave={saved:deferred(),release:deferred()};return holdSave;}};
}

test('app patient and measurement selectors restore historical snapshots and save a separate repeat',async t=>{
  const f=await fixture(t),b=f.patients[1];
  f.change('#patient-picker',b.patient.id);
  await until(()=>f.find('#patient-picker').value===b.patient.id&&f.find('#measurement-picker').value==='','patient activation');
  assert.equal(f.find('[data-patient="age"]').value,'77');
  f.change('#measurement-picker',b.measurement.id);
  await until(()=>f.find('#measurement-picker').value===b.measurement.id&&f.find('#field-al').value==='25.50','historical measurement selection');
  assert.equal(f.find('[data-patient="age"]').value,'70');
  f.click('[data-eye="OS"]');assert.equal(f.find('#field-al').value,'26.20');f.click('[data-eye="OD"]');
  f.input('#field-al','25.85');f.click('[data-action="save-measurement"]');
  await until(()=>f.dom.window.document.querySelector('#save-measurement-confirm'),'measurement save dialog');
  f.input('#measurement-label','SYNTHETIC repeat');f.click('#save-measurement-confirm');
  await until(async()=>{const library=await f.store.read();return library.patients[1].measurements.length===2&&f.dom.window.document.querySelector('#measurement-picker')?.selectedOptions[0]?.textContent.includes('SYNTHETIC repeat');},'repeat saved and selected');
  const records=(await f.store.read()).patients[1].measurements;
  assert.equal(records[0].eyes.OD.al,'25.50');assert.equal(records[1].eyes.OD.al,'25.85');assert.equal(records[1].eyes.OS.al,'26.20');
  assert.equal(records[1].patient.age,'70');assert.equal(records[1].source,'SYNTHETIC TEST DEVICE');
  f.change('#measurement-picker',b.measurement.id);
  await until(()=>f.find('#field-al').value==='25.50','baseline restored after repeat');
});

test('a saved measurement completion cannot auto-select over a case switched by another panel',async t=>{
  const f=await fixture(t),a=f.patients[0],b=f.patients[1];
  f.input('#field-al','23.95');f.click('[data-action="save-measurement"]');
  await until(()=>f.dom.window.document.querySelector('#save-measurement-confirm'),'measurement save dialog');
  f.input('#measurement-label','SYNTHETIC delayed save');const delayed=f.delaySave();f.click('#save-measurement-confirm');
  await delayed.saved.promise;
  const current=await f.session.read();await f.service.selectMeasurement(b.patient.id,b.measurement.id,current.caseToken,current.revision,'other-panel');
  assert.equal(f.find('#patient-picker').value,b.patient.id);assert.equal(f.find('#field-al').value,'25.50');
  delayed.release.resolve();
  await until(()=>f.find('#toast').textContent.includes('未自動切換'),'stale completion acknowledged');
  assert.equal(f.selectCalls,0);assert.equal((await f.session.read()).selection.patientId,b.patient.id);
  const saved=(await f.store.read()).patients.find(patient=>patient.id===a.patient.id).measurements;
  assert.equal(saved.length,2);assert.equal(saved[1].eyes.OD.al,'23.95');assert.equal(f.find('#field-al').value,'25.50');
});

test('identity-only draft edits need confirmation and an outdated discard confirmation cannot switch cases',async t=>{
  const f=await fixture(t),a=f.patients[0],b=f.patients[1],current=await f.session.read();
  await f.service.activatePatient(a.patient.id,current.caseToken,current.revision,'other-panel');
  f.input('[data-patient="age"]','61');f.click('[data-action="save"]');
  await until(async()=>(await f.session.read()).data.patient.age==='61','identity draft synchronized');
  f.change('#patient-picker',b.patient.id);
  await until(()=>f.dom.window.document.querySelector('#confirm-selection'),'identity-only discard confirmation');
  const before=await f.session.read();await f.session.patch({patient:{age:'62'}},before.caseToken,'other-panel');
  f.click('#confirm-selection');
  await until(()=>f.find('#toast').textContent.includes('重新選擇測量'),'outdated discard confirmation rejected');
  assert.equal((await f.session.read()).selection.patientId,a.patient.id);
});

test('a rejected overwrite displays its error inside the still-open save dialog and preserves the saved record',async t=>{
  const f=await fixture(t),a=f.patients[0],b=f.patients[1];
  f.input('#field-al','23.90');f.click('[data-action="save-measurement"]');
  await until(()=>f.dom.window.document.querySelector('#save-measurement-confirm'),'measurement save dialog');
  f.click('#overwrite-measurement');
  const before=await f.store.read();
  // Another panel changes the library after this dialog pinned its revision.
  // The draft stays current, so the save reaches the real library conflict guard.
  await f.store.updatePatient(b.patient.id,{...b.patient.patient,age:'78'},before.revision);
  f.click('#save-measurement-confirm');
  await until(()=>f.dom.window.document.querySelector('#review-dialog .dialog-feedback[role="alert"]'),'in-dialog save error');
  const dialog=f.find('#review-dialog'),feedback=f.find('#review-dialog .dialog-feedback[role="alert"]');
  assert.equal(dialog.open,true);assert.equal(feedback.closest('dialog'),dialog);assert.equal(feedback.hidden,false);
  assert.match(feedback.textContent,/資料庫已被其他視窗更新/);
  assert.equal(f.find('#save-measurement-confirm').disabled,false);
  const saved=(await f.store.read()).patients.find(patient=>patient.id===a.patient.id).measurements;
  assert.equal(saved.length,1);assert.equal(saved[0].eyes.OD.al,'23.45');assert.equal(saved[0].id,a.measurement.id);
});

test('patient management edits identity and synchronizes active historical identity without changing eye measurements',async t=>{
  const f=await fixture(t),a=f.patients[0];f.click('[data-route="patients"]');f.click(`[data-edit-patient="${a.patient.id}"]`);
  await until(()=>f.dom.window.document.querySelector('#edit-patient-confirm'),'edit patient dialog');
  f.input('[data-edit-patient-field="name"]','Synthetic A corrected');f.click('#edit-patient-confirm');
  await until(async()=>(await f.store.read()).patients[0].patient.name==='Synthetic A corrected','patient identity saved');
  const library=await f.store.read(),current=await f.session.read();
  assert.equal(library.patients[0].measurements[0].patient.name,'Synthetic A corrected');
  assert.equal(current.data.patient.name,'Synthetic A corrected');assert.equal(current.data.eyes.OD.al,'23.45');
  assert.equal(current.data.eyes.OS.al,'24.10');assert.equal(library.patients[0].measurements[0].patient.age,'60');
});

test('copy measurement button creates and opens a separate editable snapshot; saving updates only that copy',async t=>{
  const f=await fixture(t),a=f.patients[0];f.click('[data-route="patients"]');f.click(`[data-copy-measurement="${a.measurement.id}"]`);
  await until(async()=>(await f.store.read()).patients[0].measurements.length===2&&f.dom.window.document.querySelector('#measurement-picker')?.selectedOptions[0]?.textContent.includes('副本'),'copy saved and opened');
  const copy=(await f.store.read()).patients[0].measurements[1];assert.notEqual(copy.id,a.measurement.id);
  f.input('#field-al','23.87');f.click('[data-action="save-measurement"]');
  await until(()=>f.dom.window.document.querySelector('#save-measurement-confirm'),'edit copied measurement dialog');
  assert.equal(f.find('#overwrite-measurement').checked,true);assert.equal(f.find('#measurement-label').value,copy.label);
  f.click('#save-measurement-confirm');
  await until(async()=>(await f.store.read()).patients[0].measurements[1].eyes.OD.al==='23.87','copy modified');
  const records=(await f.store.read()).patients[0].measurements;assert.equal(records.length,2);assert.equal(records[0].eyes.OD.al,'23.45');assert.equal(records[1].eyes.OS.al,'24.10');
});

test('batch measurement selection deletes chosen records after one confirmation and retains active draft',async t=>{
  const f=await fixture(t),a=f.patients[0];
  await f.service.duplicateMeasurement({patientId:a.patient.id,measurementId:a.measurement.id,caseToken:(await f.session.read()).caseToken,revision:(await f.session.read()).revision});
  f.click('[data-route="patients"]');
  const box=f.find(`[data-select-measurement="${a.measurement.id}"]`);box.checked=true;box.dispatchEvent(new f.dom.window.Event('change',{bubbles:true}));
  const button=f.find(`[data-delete-selected="${a.patient.id}"]`);assert.equal(button.disabled,false);assert.match(button.textContent,/1/);button.click();
  await until(()=>f.dom.window.document.querySelector('#delete-records-confirm'),'one delete confirmation');
  f.click('#delete-records-confirm');
  await until(async()=>(await f.store.read()).patients[0].measurements.length===1,'selected measurement deleted');
  const current=await f.session.read();assert.equal(current.selection.patientId,a.patient.id);assert.equal(current.selection.measurementId,null);
  assert.equal(current.data.eyes.OD.al,'23.45');assert.equal(current.data.eyes.OS.al,'24.10');
  assert.notEqual((await f.store.read()).patients[0].measurements[0].id,a.measurement.id);
});

test('editing an existing measurement opens the saved record and defaults save to that record',async t=>{
  const f=await fixture(t),a=f.patients[0];f.click('[data-route="patients"]');f.click(`[data-edit-measurement="${a.measurement.id}"]`);
  await until(()=>f.dom.window.document.querySelector('#field-al'),'edit measurement loaded');
  f.input('#field-al','23.66');f.click('[data-action="save-measurement"]');
  await until(()=>f.dom.window.document.querySelector('#save-measurement-confirm'),'edit save dialog');
  assert.equal(f.find('#overwrite-measurement').checked,true);assert.equal(f.find('#measurement-label').value,a.measurement.label);
  f.click('#save-measurement-confirm');
  await until(async()=>(await f.store.read()).patients[0].measurements[0].eyes.OD.al==='23.66','original saved from edit mode');
  assert.equal((await f.store.read()).patients[0].measurements.length,1);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {JSDOM} from 'jsdom';
import {siteBridge} from '../src/bridge.js';
import {OTHER_SITES} from '../src/adapters/other-sites.js';
import {emptyCase} from '../src/model.js';
import {caseFromReadRows} from '../src/transfer.js';
import {createSessionStore} from '../src/session-store.js';
import {createLibraryStore,createLibraryService} from '../src/library-store.js';
import {createTabTransfer} from '../src/tab-transfer.js';
import {exportLibraryDocument,parseInterchange} from '../src/interchange.js';

const profile=id=>OTHER_SITES.find(site=>site.id===id);
function memory(){const values={};return {get:async()=>structuredClone(values),set:async next=>Object.assign(values,structuredClone(next))};}
function browserFixture(t){
  const doms=[],keys=['document','location','getComputedStyle','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','Event'];
  const saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  t.after(()=>{for(const [key,descriptor]of saved)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];for(const dom of doms)dom.window.close();});
  return (html,url)=>{
    const dom=new JSDOM(html,{url});doms.push(dom);
    for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='getComputedStyle'?dom.window.getComputedStyle.bind(dom.window):dom.window[key]});
    dom.window.HTMLElement.prototype.getClientRects=function(){return this.hidden||this.style.display==='none'||this.closest('[hidden]')?[]:[{x:0,y:0,width:80,height:24}];};
    return dom.window.document;
  };
}

for(const eye of ['OD','OS']){
  test(`DGS ${eye} Argos read survives saved-history reload and guarded cross-tab Cooke paste`,async t=>{
    const mount=browserFixture(t),side=eye.toLowerCase(),other=eye==='OD'?'os':'od';
    mount(`<div class="switch-eye"><input type="checkbox" ${eye==='OD'?'checked':''}></div>
      <label for="patient">Patient ID / Name</label><input id="patient" value="SYNTHETIC-CROSS-SITE-${eye}">
      <label for="al">AL (mm)</label><input id="al" value="23.45">
      <div class="iol-v-select v-select"><div class="v-input__slot" role="button" aria-haspopup="listbox" aria-owns="biometer-list" aria-expanded="false"><label for="biometer">Biometer</label><div class="v-select__selection">Argos (SOS-AL)</div><input id="biometer" readonly aria-readonly="false"></div></div>`,profile('solver-complex').url);
    const read=siteBridge('read',profile('solver-complex'),emptyCase(),{eye,includeIdentifiers:true});
    const candidate=caseFromReadRows(read.rows,eye,{profile:profile('solver-complex')});
    assert.equal(candidate.eyes[eye].biometer,'Argos (SOS-AL)');assert.equal(candidate.eyes[eye].al,'23.45');
    assert.deepEqual(candidate.eyes[eye==='OD'?'OS':'OD'],{});

    const transient=memory(),local=memory(),session=createSessionStore(transient),library=createLibraryStore(local),service=createLibraryService(library,session);
    const initial=await session.read(),stored=await session.replace(candidate,initial.caseToken,initial.revision);
    const {patient}=await service.createPatient(candidate.patient);
    const saved=await service.saveMeasurement({patientId:patient.id,label:`SYNTHETIC DGS ${eye}`,caseToken:stored.caseToken,revision:stored.revision});
    // Recreate both services rather than testing only an in-memory object.
    const reloadedSession=createSessionStore(transient),reloadedLibrary=createLibraryStore(local),reloaded=createLibraryService(reloadedLibrary,reloadedSession);
    const before=await reloadedSession.read();
    const selected=await reloaded.selectMeasurement(patient.id,saved.measurement.id,before.caseToken,before.revision);
    assert.equal(selected.data.eyes[eye].biometer,'Argos (SOS-AL)');
    assert.equal((await reloadedLibrary.read()).patients[0].measurements[0].eyes[eye].al,'23.45');

    const target=mount(`<form><div role="radiogroup" aria-labelledby="${side}-biometer-label">${['0','1','2'].map(value=>`<input type="radio" name="${side}-biometer" value="${value}" ${value==='2'?'checked':''}>`).join('')}</div>
      <input id="${side}-al" value="22"><input id="${other}-al" value="26"></form>`,profile('cooke').url);
    let time=0,submits=0;target.querySelector('form').addEventListener('submit',event=>{event.preventDefault();submits++;});
    const chromeApi={tabs:{get:async()=>({id:2,url:profile('cooke').url,status:'complete'}),onUpdated:{addListener(){},removeListener(){}}},scripting:{executeScript:async({func,args})=>[{frameId:0,documentId:'synthetic-cooke',result:await func(...args)}]}};
    const transfer=createTabTransfer(chromeApi,{readSession:()=>reloadedSession.read(),now:()=>time,sleep:async ms=>{time+=ms;}});
    const result=await transfer.quickFill(2,selected.data,{eye,includeIdentifiers:true,caseToken:selected.caseToken,revision:selected.revision});
    assert.equal(target.querySelector(`[name="${side}-biometer"]:checked`).value,'0');
    assert.equal(target.querySelector(`#${side}-al`).value,'23.45');assert.equal(target.querySelector(`#${other}-al`).value,'26');
    assert.equal(result.rows.find(row=>row.key==='biometer'&&row.eye===eye).status,'filled');assert.equal(submits,0);
    assert.deepEqual(result.sourceGuard,{caseToken:selected.caseToken,revision:selected.revision});
    assert.deepEqual((await reloadedSession.read()).data,selected.data);
  });
}

test('JSON 1.3 library export imports through the actual append service with both keratoconus booleans',async()=>{
  const transient=memory(),local=memory(),session=createSessionStore(transient),library=createLibraryStore(local),service=createLibraryService(library,session);
  const data=emptyCase();data.patient={...data.patient,patientId:'SYNTHETIC-JSON-1.2',initials:'SYN'};
  data.eyes={OD:{al:'23.45',keratoconus:true,biometer:'Argos (SOS-AL)',posteriorBiometer:'1'},OS:{al:'24.10',keratoconus:false,toric:false}};
  const initial=await session.read(),stored=await session.replace(data,initial.caseToken,initial.revision),{patient}=await service.createPatient(data.patient);
  await service.saveMeasurement({patientId:patient.id,label:'SYNTHETIC 1.2',caseToken:stored.caseToken,revision:stored.revision});
  const document=exportLibraryDocument(await library.read()),parsed=parseInterchange(JSON.stringify(document));
  assert.equal(document.schemaVersion,'1.3');
  const targetSession=createSessionStore(memory()),targetLibrary=createLibraryStore(memory()),target=createLibraryService(targetLibrary,targetSession);
  const result=await target.importPatients(parsed.data.patients,0);
  assert.equal(result.imported.length,1);
  const imported=result.library.patients[0].measurements[0];
  assert.equal(imported.eyes.OD.keratoconus,true);assert.equal(imported.eyes.OS.keratoconus,false);assert.equal(imported.eyes.OS.toric,false);
  assert.equal(imported.eyes.OD.biometer,'Argos (SOS-AL)');assert.equal(imported.eyes.OD.posteriorBiometer,'1');assert.equal(imported.patient.initials,'SYN');
});

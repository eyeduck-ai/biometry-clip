import assert from 'node:assert/strict';
import test from 'node:test';
import {createQaRunner} from '../src/qa/runner.js';
import {createLibraryStore,createLibraryService} from '../src/library-store.js';
import {createSessionStore} from '../src/session-store.js';
import {SITES} from '../src/sites.js';

const clone=value=>structuredClone(value);
function fixture({isExtension=true,detectedEye='OD'}={}){
  const transient={},local={},calls=[],tabs=new Map(),missing=new Set(),overrides=new Map();
  let current,tabSequence=1000,waitError='',holdOpen;
  const session=createSessionStore({get:async()=>clone(transient),set:async values=>Object.assign(transient,clone(values))});
  const library=createLibraryStore({get:async()=>clone(local),set:async values=>Object.assign(local,clone(values))});
  const service=createLibraryService(library,session);
  const api={
    isExtension,extensionVersion:'0.3.2',
    loadData:async()=>{calls.push(['loadData']);return current=await session.read();},
    saveCase:async(data,guard)=>{calls.push(['saveCase']);return current=await session.replace(data,guard.caseToken,guard.revision);},
    patchCase:async(patch,token)=>{calls.push(['patchCase']);return current=await session.patch(patch,token);},
    clearCase:async token=>current=await session.clear(token),loadLibrary:()=>service.read(),createPatient:(...args)=>service.createPatient(...args),saveMeasurement:options=>service.saveMeasurement(options),
    selectMeasurement:async(...args)=>current=await service.selectMeasurement(...args),activatePatient:async(...args)=>current=await service.activatePatient(...args),
    openSite:async profile=>{calls.push(['openSite',profile.id]);if(holdOpen)await holdOpen;const tab={id:++tabSequence,profile,eye:detectedEye,values:new Map()};tabs.set(tab.id,tab);return {id:tab.id,url:profile.url};},
    waitTab:async tabId=>{calls.push(['waitTab',tabId]);assert.ok(tabs.has(tabId));if(waitError)throw new Error(waitError);return {id:tabId,url:tabs.get(tabId).profile.url};},
    inspectTab:async(tabId,data,options,action='preview',frameId)=>{
      assert.ok(tabs.has(tabId),'must never inspect a pre-existing/unowned tab');
      const tab=tabs.get(tabId),profile=tab.profile;calls.push(['inspectTab',tabId,action,options.eye,clone(options)]);
      const result={siteId:profile.id,tabId,tabUrl:profile.url,url:profile.url,frameId:frameId??0,profile,eyeMode:profile.eyeMode,detectedEye:profile.eyeMode==='single'?tab.eye:'',rows:[],unmappedRequired:[]};
      if(action==='inspect'){
        result.fields=profile.fields.map(field=>({...field,eye:field.key.startsWith('patient.')?'patient':field.eye||'current',visible:!missing.has(`${profile.id}:${field.key}`),available:!missing.has(`${profile.id}:${field.key}`),required:(profile.required||[]).includes(field.key)||(profile.requiredIdentity||[]).includes(field.key)}));
        return result;
      }
      const selected=options.eye==='OU'?['OD','OS']:[options.eye];
      for(const field of profile.fields){
        if(field.eye&&!selected.includes(field.eye))continue;
        const eye=field.eye||(options.eye==='OU'?(field.key.startsWith('patient.')?'patient':'shared'):options.eye);
        const value=field.key.startsWith('patient.')?data.patient[field.key.slice(8)]:data.eyes[field.eye||selected[0]][field.key];
        if(value==null||value===''||typeof value==='boolean')continue;
        const absent=missing.has(`${profile.id}:${field.key}`),physical=profile.eyeMode==='single'?field.key:`${eye}:${field.key}`;
        const row={key:field.key,eye,value:String(value),mappedValue:String(value),previous:'AUTOFILLED PRIVATE PREVIOUS',locator:`fixture:${physical}`,status:absent?'missing':'ready'};
        if(action==='apply'){
          assert.equal(options.expectedSiteId,profile.id);assert.equal(options.expectedUrl,profile.url);assert.equal(options.expectedFrameUrl,profile.url);
          assert.ok(options.expected.some(expected=>expected.key===field.key&&expected.eye===eye)||absent);
          if(!absent){tab.values.set(physical,String(value));row.status='filled';}
        }
        if(action==='read'&&!absent){row.status='read';row.value=overrides.get(`${profile.id}:${field.key}`)??tab.values.get(physical)??'';}
        result.rows.push(row);
      }
      if(action==='read')result.rows.push({key:'patient.name',eye:'OD',status:'read',value:'UNRELATED PRIVATE AUTOFILL',locator:'unmatched-extra'});
      return result;
    },
  };
  return {api,calls,tabs,missing,overrides,session,library,get current(){return current;},setWaitError(value){waitError=value;},setHoldOpen(promise){holdOpen=promise;}};
}
const now=()=> '2026-11-15T12:00:00.000Z';

test('QA engine import and construction do no work; start performs eight isolated multi-patient snapshot checks',async()=>{
  const f=fixture(),updates=[],runner=createQaRunner(f.api,{now,onUpdate:state=>updates.push(state)});
  assert.equal(f.calls.length,0);assert.equal(runner.state.sites.length,SITES.length);assert.equal(runner.state.status,'idle');
  await runner.start();
  assert.equal(runner.state.status,'idle');assert.equal(runner.state.storageChecks.length,8);assert.ok(runner.state.storageChecks.every(check=>check.status==='passed'));
  assert.equal(f.calls.some(call=>call[0]==='openSite'),false);
  const saved=await f.library.read();assert.equal(saved.patients.length,2);assert.equal(saved.patients[0].measurements.length,2);
  assert.equal(saved.patients[0].measurements[0].eyes.OD.al,'23.45');assert.equal(saved.patients[0].measurements[1].eyes.OD.al,'23.68');
  assert.equal(f.current.data.eyes.OS.al,'24.10');assert.match(f.current.data.patient.name,/SYNTHETIC.*NOT A PATIENT/);
  assert.ok(updates.some(state=>state.status==='running'));
  const snapshot=runner.state;snapshot.sites[0].notes.push('mutation');assert.equal(runner.state.sites[0].notes.includes('mutation'),false);
});

test('HTTP previews cannot start storage or browser checks',async()=>{
  const f=fixture({isExtension:false}),runner=createQaRunner(f.api,{now});await runner.start();
  assert.equal(runner.state.status,'error');assert.equal(f.calls.length,0);await assert.rejects(runner.runNext(),/初始化/);
});

test('one next operation opens only one owned site and verifies OD, OS, OU plus read-save-select',async()=>{
  const f=fixture(),runner=createQaRunner(f.api,{now});await runner.start();await runner.runNext();
  assert.equal(f.tabs.size,1);assert.equal(runner.state.currentIndex,1);assert.equal(runner.state.sites[0].status,'passed');
  const writes=f.calls.filter(call=>call[0]==='inspectTab'&&call[2]==='apply');assert.deepEqual(writes.map(call=>call[3]),['OD','OS','OU']);
  assert.equal(f.calls.filter(call=>call[0]==='loadData').length,4);assert.equal(runner.state.sites[0].actions.filter(action=>action.step==='load-saved-source').length,3);
  const rows=runner.state.sites[0].actions.find(action=>action.step==='fill-and-read'&&action.eye==='OU').rows;
  assert.equal(rows.find(row=>row.key==='al'&&row.eye==='OD').actual,'23.45');assert.equal(rows.find(row=>row.key==='al'&&row.eye==='OS').actual,'24.10');
  assert.equal(runner.state.sites[0].actions.filter(action=>action.step==='save-and-select'&&action.status==='passed').length,3);
  assert.equal(f.current.data.eyes.OD.al,'23.45');assert.equal(f.current.data.eyes.OS.al,'24.10');
  const report=JSON.stringify(runner.exportReport());assert.equal(report.includes('AUTOFILLED PRIVATE PREVIOUS'),false);assert.equal(report.includes('UNRELATED PRIVATE AUTOFILL'),false);assert.equal(report.includes('caseToken'),false);
});

test('single-eye OS mismatch pauses, retry reuses only its owned tab, and missing special fields never pass',async()=>{
  const f=fixture(),runner=createQaRunner(f.api,{now});await runner.start();await runner.runNext();await runner.runNext();
  await runner.runNext();const site=runner.state.sites[2];assert.equal(site.siteId,'barrett-toric');assert.equal(runner.state.status,'waiting');assert.match(runner.state.message,/OS/);
  assert.equal(f.tabs.size,3);assert.equal(site.actions.some(action=>action.step==='fill-and-read'&&action.eye==='OS'),false);
  await runner.runNext();assert.equal(f.tabs.size,3);
  await runner.retryCurrent({confirmedEye:'OS'});assert.equal(runner.state.status,'waiting','manual confirmation cannot override a detected OD');
  f.tabs.get(site.tabId).eye='OS';await runner.retryCurrent();
  assert.equal(f.tabs.size,3);assert.equal(runner.state.currentIndex,3);assert.equal(runner.state.sites[2].toric.status,'passed');
  f.missing.add('barrett-true-k-toric:k1Axis');await runner.runNext();
  assert.equal(runner.state.status,'waiting');assert.equal(runner.state.sites[3].toric.status,'needs-manual');assert.equal(runner.exportReport().summary.allPassed,false);
});

test('unreliably labeled single forms require a separate explicit confirmation for every requested eye',async()=>{
  const f=fixture({detectedEye:''}),runner=createQaRunner(f.api,{now});await runner.start();runner.skipCurrent();runner.skipCurrent();
  await runner.runNext();const site=runner.state.sites[2];assert.equal(site.awaitingEye,'OD');assert.equal(f.calls.filter(call=>call[2]==='apply').length,0);
  await runner.retryCurrent();assert.equal(f.calls.filter(call=>call[2]==='apply').length,0);
  await runner.retryCurrent({confirmedEye:'OD'});assert.equal(runner.state.status,'waiting');assert.equal(runner.state.sites[2].awaitingEye,'OS');
  await runner.retryCurrent({confirmedEye:'OD'});assert.equal(runner.state.sites[2].awaitingEye,'OS');
  await runner.retryCurrent({confirmedEye:'OS'});assert.equal(runner.state.currentIndex,3);
  const confirmations=runner.state.sites[2].actions.filter(action=>action.step==='eye-confirmation');assert.deepEqual(confirmations.map(action=>action.eye),['OD','OS']);
  assert.ok(confirmations.every(action=>action.status==='manual-confirmed'));
});

test('manual eye confirmation is consumed by one attempt and cannot authorize a later partial or mode retry',async()=>{
  const f=fixture({detectedEye:''}),runner=createQaRunner(f.api,{now});await runner.start();runner.skipCurrent();runner.skipCurrent();
  f.missing.add('barrett-toric:k1Axis');await runner.runNext();await runner.retryCurrent({confirmedEye:'OD'});
  assert.equal(runner.state.status,'waiting');assert.equal(runner.state.sites[2].awaitingEye,'OS');
  await runner.retryCurrent({confirmedEye:'OS'});assert.equal(runner.state.sites[2].awaitingEye,undefined);
  const applied=f.calls.filter(call=>call[2]==='apply').length;
  await runner.retryCurrent();
  assert.equal(runner.state.sites[2].awaitingEye,'OD');assert.equal(f.calls.filter(call=>call[2]==='apply').length,applied);
  f.missing.clear();await runner.retryCurrent({confirmedEye:'OD'});assert.equal(runner.state.sites[2].awaitingEye,'OS');
});

test('a changed isolated saved-source selection blocks website writes before any values are inspected',async()=>{
  const f=fixture(),runner=createQaRunner(f.api,{now});await runner.start();
  await f.api.patchCase({eyes:{OD:{al:'29.00'}}},f.current.caseToken);await runner.runNext();
  assert.equal(runner.state.status,'waiting');assert.match(runner.state.message,/工作副本已變更/);
  assert.equal(f.calls.filter(call=>call[0]==='inspectTab').length,0);
});

test('unsupported optional fields remain reported; attempted readback mismatches and identities are not persisted',async()=>{
  const f=fixture(),runner=createQaRunner(f.api,{now});await runner.start();f.missing.add('barrett-universal:wtw');f.overrides.set('barrett-universal:patient.name','AUTOFILLED REAL NAME');
  await runner.runNext();assert.equal(runner.state.status,'waiting');
  const readAction=runner.state.sites[0].actions.find(action=>action.step==='fill-and-read');
  assert.ok(readAction.counts.unsupportedOptional>0);assert.equal(readAction.rows.find(row=>row.key==='patient.name').actual,'[unexpected value omitted]');
  const library=await f.library.read(),last=library.patients[0].measurements.at(-1);
  assert.equal(last.eyes.OD.wtw,undefined);assert.match(last.patient.name,/SYNTHETIC/);
  assert.equal(JSON.stringify(runner.exportReport()).includes('AUTOFILLED REAL NAME'),false);assert.equal(JSON.stringify(library).includes('UNRELATED PRIVATE AUTOFILL'),false);
});

test('optional unavailable fields alone do not prevent useful base checks but cannot produce an all-fields pass',async()=>{
  const f=fixture(),runner=createQaRunner(f.api,{now});await runner.start();f.missing.add('barrett-universal:wtw');await runner.runNext();
  assert.equal(runner.state.sites[0].status,'passed');assert.equal(runner.state.currentIndex,1);
  const rows=runner.state.sites[0].actions.filter(action=>action.step==='fill-and-read').flatMap(action=>action.rows);assert.ok(rows.some(row=>row.key==='wtw'&&row.status==='missing'));
  while(runner.state.currentIndex<SITES.length)runner.skipCurrent();assert.equal(runner.state.status,'complete');assert.equal(runner.exportReport().summary.allPassed,false);
});

test('unexpected numeric page values are redacted and excluded from every saved readback snapshot',async()=>{
  const f=fixture(),runner=createQaRunner(f.api,{now});await runner.start();f.overrides.set('barrett-universal:al','99.87654');await runner.runNext();
  assert.equal(runner.state.status,'waiting');
  const row=runner.state.sites[0].actions.find(action=>action.step==='fill-and-read').rows.find(row=>row.key==='al'&&row.eye==='OD');
  assert.equal(row.status,'readback-mismatch');assert.equal(row.actual,'[unexpected value omitted]');assert.equal(row.expected,'23.45');
  const library=await f.library.read();assert.equal(library.patients[0].measurements.at(-1).eyes.OD.al,undefined);
  assert.equal(JSON.stringify(library).includes('99.87654'),false);assert.equal(JSON.stringify(runner.exportReport()).includes('99.87654'),false);
});

test('web gates pause on the owned tab, skip records incomplete evidence, and completion needs every supported entry processed',async()=>{
  const f=fixture(),runner=createQaRunner(f.api,{now});await runner.start();f.setWaitError('網站尚未就緒，請手動完成入口。');await runner.runNext();
  assert.equal(runner.state.status,'waiting');assert.equal(f.calls.filter(call=>call[0]==='inspectTab').length,0);
  f.setWaitError('');runner.skipCurrent();assert.equal(runner.state.currentIndex,1);assert.equal(runner.state.status,'idle');
  while(runner.state.currentIndex<SITES.length)runner.skipCurrent();const report=runner.exportReport();assert.equal(report.status,'complete');assert.equal(report.summary.processed,SITES.length);assert.equal(report.summary.sitesSkipped,SITES.length);assert.equal(report.summary.allPassed,false);
  assert.ok(report.sites.every(site=>site.status==='skipped'));assert.equal(report.summary.lvc['needs-manual']>0,true);
});

test('overlapping user operations cannot open extra tabs or corrupt the current cursor',async()=>{
  const f=fixture(),runner=createQaRunner(f.api,{now});await runner.start();let release;f.setHoldOpen(new Promise(resolve=>{release=resolve;}));
  const running=runner.runNext();await Promise.resolve();await assert.rejects(runner.runNext(),/尚未完成/);assert.throws(()=>runner.skipCurrent(),/等待/);release();await running;
  assert.equal(f.tabs.size,1);assert.equal(runner.state.currentIndex,1);
});

test('missing special-mode fields still exercise OD, OS and OU on a bilateral website',async()=>{
  const f=fixture(),runner=createQaRunner(f.api,{now});await runner.start();for(let i=0;i<5;i++)runner.skipCurrent();
  f.missing.add('escrs:k1Axis');await runner.runNext();
  const site=runner.state.sites[5];assert.equal(site.siteId,'escrs');assert.equal(site.status,'waiting');assert.equal(site.toric.status,'needs-manual');
  const writes=site.actions.filter(action=>action.step==='fill-and-read');assert.deepEqual(writes.map(action=>action.eye),['OD','OS','OU']);
  assert.ok(writes.every(action=>action.rows.some(row=>row.key==='al'&&row.status==='verified')));
  assert.equal(writes.at(-1).rows.find(row=>row.key==='al'&&row.eye==='OS').actual,'24.10');
  assert.equal(runner.exportReport().summary.allPassed,false);
});

test('native QA uses verified radio preparation for both single-eye scopes without a manual gate',async()=>{
  const f=fixture({detectedEye:''}),inspect=f.api.inspectTab,preparations=[];
  f.api.inspectTab=async(...args)=>({...await inspect(...args),canSelectEye:true});
  f.api.prepareEye=async(tabId,_data,options)=>{preparations.push(options.eye);f.tabs.get(tabId).eye=options.eye;};
  const runner=createQaRunner(f.api,{now});await runner.start();runner.skipCurrent();runner.skipCurrent();await runner.runNext();
  assert.deepEqual(preparations,['OD','OS']);assert.equal(runner.state.sites[2].status,'passed');assert.equal(runner.state.currentIndex,3);
  assert.equal(runner.state.sites[2].actions.some(action=>action.step==='eye-confirmation'),false);
});


test('native QA records cylinder display evidence without claiming a mismatched preference passed',async()=>{
  const f=fixture(),calls=[];
  f.api.cylinderConvention='minus';
  f.api.prepareDisplayPreferences=async(tabId,data,options)=>{calls.push({tabId,eye:options.eye});return {requested:'minus',value:options.eye==='OS'?'plus':'minus',status:'applied'};};
  const runner=createQaRunner(f.api,{now});await runner.start();await runner.runNext();
  const site=runner.state.sites[0];assert.deepEqual(calls.map(call=>call.eye),['OD','OS','OU']);
  assert.equal(site.displayPreferences.OD.status,'applied');assert.equal(site.displayPreferences.OS.status,'manual');
  assert.equal(site.actions.find(action=>action.step==='display-preference'&&action.eye==='OS').status,'needs-manual');
  assert.equal(runner.exportReport().summary.allPassed,false);
});


test('native QA unwraps the actual platform display response and does not report every site as manual',async()=>{
  const f=fixture();f.api.prepareDisplayPreferences=async()=>({siteId:'barrett-universal',displayPreference:{requested:'minus',value:'minus',status:'already-selected'}});
  const runner=createQaRunner(f.api,{now});await runner.start();await runner.runNext();
  assert.equal(runner.state.sites[0].displayPreferences.OD.status,'already-selected');
  assert.equal(runner.state.sites[0].displayPreferences.OS.value,'minus');
  assert.equal(runner.state.sites[0].actions.some(action=>action.step==='display-preference'&&action.status==='needs-manual'),false);
});


test('native QA checks the website biometer category without inventing an exact device readback',async()=>{
  const f=fixture(),inspect=f.api.inspectTab;
  f.api.inspectTab=async(tabId,data,options,action='preview',...rest)=>{
    const result=await inspect(tabId,data,options,action,...rest);if(action==='inspect')return result;
    const selected=options.eye==='OU'?['OD','OS']:[options.eye];
    for(const eye of selected)result.rows.push({key:'biometer',eye,value:action==='read'?'Other':data.eyes[eye].biometer,mappedValue:'Other',previous:'Other',locator:`biometer:${eye}`,modeControl:true,status:action==='read'?'read':action==='apply'?'filled':'ready'});
    return result;
  };
  const runner=createQaRunner(f.api,{now});await runner.start();for(let i=0;i<6;i++)runner.skipCurrent();await runner.runNext();
  const rows=runner.state.sites[6].actions.filter(action=>action.step==='fill-and-read').flatMap(action=>action.rows.filter(row=>row.key==='biometer'));
  assert.ok(rows.length>=2);assert.ok(rows.every(row=>row.status==='verified'&&row.expected==='Other'&&row.sourceExpected==='IOLMaster 700'&&row.actual==='Other'));
  const library=await f.library.read();assert.equal(library.patients[0].measurements.at(-1).eyes.OD.biometer,'Other');
  assert.equal(f.current.data.eyes.OD.biometer,'IOLMaster 700');
});
test('native QA validates a required initials ID fallback against synthetic source identity',async()=>{
  const f=fixture(),inspect=f.api.inspectTab;
  f.api.inspectTab=async(tabId,data,options,action='preview',...rest)=>{
    const result=await inspect(tabId,data,options,action,...rest);if(action!=='inspect')result.rows.push({key:'patient.initials',eye:'patient',value:data.patient.patientId,mappedValue:data.patient.patientId,previous:'',locator:'initials',status:action==='read'?'read':action==='apply'?'filled':'ready'});return result;
  };
  const runner=createQaRunner(f.api,{now});await runner.start();for(let i=0;i<5;i++)runner.skipCurrent();await runner.runNext();
  const rows=runner.state.sites[5].actions.filter(action=>action.step==='fill-and-read').flatMap(action=>action.rows.filter(row=>row.key==='patient.initials'));
  assert.equal(rows.length,3);assert.ok(rows.every(row=>row.status==='verified'&&row.expected.startsWith('SYNTHETIC-')));
});


test('native QA restores an eye reset by mode postback, rechecks modes and only then previews',async()=>{
  const f=fixture(),inspect=f.api.inspectTab,modes=[];let reset=false;
  f.api.inspectTab=async(...args)=>({...await inspect(...args),canSelectEye:true});
  f.api.prepareEye=async(tabId,_data,options)=>{f.tabs.get(tabId).eye=options.eye;};
  f.api.prepareModes=async(tabId,_data,options)=>{
    modes.push(options.eye);if(options.eye==='OS'&&!reset){reset=true;f.tabs.get(tabId).eye='OD';return {navigated:true,eyeReset:true,modePreparation:{status:'eye-reset'}};}
    return {navigated:false,modePreparation:{status:'ready',controls:[]}};
  };
  const runner=createQaRunner(f.api,{now});await runner.start();runner.skipCurrent();runner.skipCurrent();await runner.runNext();
  assert.deepEqual(modes,['OD','OS','OS']);assert.equal(runner.state.sites[2].status,'passed');
  assert.ok(runner.state.sites[2].actions.some(action=>action.step==='fill-and-read'&&action.eye==='OS'&&action.status==='passed'));
});
test('native QA stops a repeating eye-mode cycle before writing the affected eye',async()=>{
  const f=fixture(),inspect=f.api.inspectTab;
  f.api.inspectTab=async(...args)=>({...await inspect(...args),canSelectEye:true});
  f.api.prepareEye=async(tabId,_data,options)=>{f.tabs.get(tabId).eye=options.eye;};
  f.api.prepareModes=async(tabId,_data,options)=>{if(options.eye==='OS')f.tabs.get(tabId).eye='OD';return {navigated:options.eye==='OS',modePreparation:{status:'ready',controls:[]}};};
  const runner=createQaRunner(f.api,{now});await runner.start();runner.skipCurrent();runner.skipCurrent();await runner.runNext();
  assert.equal(runner.state.status,'waiting');assert.equal(runner.state.sites[2].actions.some(action=>action.step==='fill-and-read'&&action.eye==='OS'),false);
  assert.equal(f.calls.some(call=>call[0]==='inspectTab'&&call[2]==='apply'&&call[3]==='OS'),false);
  assert.match(runner.state.message,/互相重設/);
});
test('native QA identifies the DGS Toric prerequisite before asking for an unavailable eye control',async()=>{
  const f=fixture(),inspect=f.api.inspectTab;
  f.api.inspectTab=async(...args)=>({...await inspect(...args),detectedEye:'',prerequisite:{status:'required',entrySiteId:'solver-regular'}});
  const runner=createQaRunner(f.api,{now});await runner.start();for(let i=0;i<13;i++)runner.skipCurrent();await runner.runNext();
  assert.equal(runner.state.status,'waiting');assert.equal(runner.state.sites[13].prerequisite.entrySiteId,'solver-regular');assert.equal(runner.state.sites[13].awaitingEye,undefined);
  assert.match(runner.state.message,/球面/);assert.equal(f.calls.some(call=>call[0]==='inspectTab'&&call[2]==='apply'),false);
});

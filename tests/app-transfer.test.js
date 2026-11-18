import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createSessionStore,SESSION_KEY} from '../src/session-store.js';
import {createLibraryStore,createLibraryService} from '../src/library-store.js';
import {siteBridge} from '../src/bridge.js';
import {SITES} from '../src/sites.js';
import {decodeImageDataUrl} from '../src/ocr/index.js';
import {emptyCase} from '../src/model.js';
import {exportCaseDocument,exportLibraryDocument} from '../src/interchange.js';

const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function until(predicate,description){for(let i=0;i<100;i++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,0));}throw new Error(`Timed out: ${description}`);}

async function fixture(t,{ocr,lensCatalog,view='floating',capture='data:image/png;base64,iVBORw=='}={}){
  const profile=SITES.find(site=>site.id==='barrett-universal'),tabId=73;
  const form=['OD','OS'].map(eye=>{const suffix=eye==='OD'?'':'0';return Object.entries({Axlength:eye==='OD'?'23.45':'24.10',OpticalACD:eye==='OD'?'3.20':'3.40',LensThickness:'',MeasuredK1:eye==='OD'?'43.20':'42.80',MeasuredK2:eye==='OD'?'44.10':'43.90',WTW:'',Refraction:eye==='OD'?'0':'-0.50'}).map(([id,value])=>`<input id="MainContent_${id}${suffix}" value="${value}">`).join('');}).join('');
  const target=new JSDOM(`<main>${form}<input id="MainContent_Aconstant" value="119.2"><input id="MainContent_LensFactor" value=""></main>`,{url:profile.url});
  target.window.HTMLElement.prototype.getClientRects=function(){return this.hidden||this.style.display==='none'||this.closest('[hidden]')?[]:[{x:0,y:0,width:80,height:24}];};
  const dom=new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>',{url:`http://127.0.0.1/index.html?view=${view}&tabId=73`});
  const keys=['window','document','location','Event','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','FormData','getComputedStyle','setTimeout','setInterval','__appTransferPlatform','__appTransferOcr'];
  const saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),nativeTimeout=setTimeout,timers=new Set();
  for(const key of keys.filter(key=>!['setTimeout','setInterval','__appTransferPlatform','__appTransferOcr'].includes(key)))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='getComputedStyle'?dom.window.getComputedStyle.bind(dom.window):dom.window[key]});
  globalThis.setTimeout=(callback,delay,...args)=>{const timer=nativeTimeout(callback,delay,...args);timers.add(timer);return timer;};globalThis.setInterval=()=>0;
  let dialogs=0;
  dom.window.HTMLDialogElement.prototype.showModal=function(){dialogs++;this.setAttribute('open','');};
  dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new dom.window.Event('close'));};
  t.after(()=>{for(const timer of timers)clearTimeout(timer);for(const [key,descriptor]of saved)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];dom.window.close();target.window.close();});
  const transient={},local={},listeners=new Set(),calls=[];
  const session=createSessionStore({get:async()=>structuredClone(transient),set:async values=>{Object.assign(transient,structuredClone(values));if(values[SESSION_KEY])for(const listener of listeners)listener(structuredClone(values[SESSION_KEY]));}});
  const service=createLibraryService(createLibraryStore({get:async()=>structuredClone(local),set:async values=>Object.assign(local,structuredClone(values))}),session);
  const empty=await session.read();await session.patch({patient:{patientId:'SYNTHETIC-WORKING'},eyes:{OD:{al:'21.00',acd:'3.00',lt:'4.10',cct:'520',wtw:'11.50',target:'-1.00',aConstant:'118.7'},OS:{al:'22.00',acd:'3.10',lt:'4.20',cct:'530',wtw:'11.60',target:'-2.00',aConstant:'118.7'}}},empty.caseToken);
  let heldRead;
  function bridge(action,data,options){
    // The target owns a real synthetic DOM. Chrome transport is replaced; the
    // production bridge runs synchronously with the target's native setters.
    const context=['window','document','location','Event','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','getComputedStyle'];
    const before=new Map(context.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
    try{
      for(const key of context)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='getComputedStyle'?target.window.getComputedStyle.bind(target.window):target.window[key]});
      const result=siteBridge(action,profile,data,options);assert.equal(result.error,undefined);
      return {...result,tabId,frameId:0,tabUrl:profile.url,profile};
    }finally{for(const [key,descriptor]of before)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];}
  }
  const api={
    loadLanguage:async()=>'zh-TW',
    requestCloudPermission:async()=>{},saveSettings:async settings=>{calls.push({type:'save-settings',settings:structuredClone(settings)});},
    captureTab:async()=>capture,
    isExtension:false,defaultSettings:{ocrProvider:'local',localModel:'tiny'},getFloatingTabId:()=>tabId,
    siteTabs:async()=>[{id:tabId,site:profile,url:profile.url,title:'SYNTHETIC bilateral form',active:true}],subscribeTabs:()=>()=>{},
    subscribeCase:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},loadData:async()=>({...await session.read(),settings:{ocrProvider:'local',localModel:'tiny'}}),
    patchCase:(patch,token,revision)=>{calls.push({type:'patch',patch:structuredClone(patch)});return session.patch(patch,token,'app-transfer-test',revision);},clearCase:token=>session.clear(token),
    subscribeLibrary:()=>()=>{},loadLibrary:()=>service.read(),createPatient:(...args)=>service.createPatient(...args),saveMeasurement:options=>service.saveMeasurement(options),
    activatePatient:(...args)=>service.activatePatient(...args),selectMeasurement:(...args)=>service.selectMeasurement(...args),
    importPatients:async(...args)=>{calls.push({type:'import-patients'});return service.importPatients(...args);},
    importMeasurements:async options=>{calls.push({type:'import-measurements',options:structuredClone(options)});return service.importMeasurements(options);},
    inspectTab:async(id,data,options,action)=>{assert.equal(Number(id),tabId);calls.push({type:action,options:structuredClone(options)});const result=bridge(action,data,options);if(action==='read'&&heldRead){heldRead.started.resolve();await heldRead.release.promise;}return result;},
    quickFillTab:async(id,data,options)=>{
      assert.equal(Number(id),tabId);calls.push({type:'quick-fill',data:structuredClone(data),options:structuredClone(options)});
      const current=await session.read();assert.equal(options.caseToken,current.caseToken);assert.equal(options.revision,current.revision);
      const preview=bridge('preview',data,options),ready=preview.rows.filter(row=>row.status==='ready');
      return bridge('apply',data,{...options,expected:ready,expectedSiteId:profile.id,expectedUrl:profile.url,expectedFrameUrl:profile.url});
    },
  };
  if(lensCatalog){let savedCatalog=structuredClone(lensCatalog);api.loadLensCatalog=async()=>structuredClone(savedCatalog);api.saveLensCatalog=async next=>{savedCatalog=structuredClone(next);calls.push({type:'save-lens-catalog'});};}
  globalThis.__appTransferPlatform=api;globalThis.__appTransferOcr={decodeImageDataUrl,...ocr};
  const appUrl=new URL('../src/app.js',import.meta.url);
  const source=(await readFile(appUrl,'utf8')).replace(/^import '\.\/styles\.css';\r?\n/m,'').replace("import * as platform from './platform.js';",'const platform=globalThis.__appTransferPlatform;').replaceAll("const ocr=await import('./ocr/index.js');",'const ocr=globalThis.__appTransferOcr;').replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL(path,appUrl).href}'`);
  await import(`data:text/javascript;base64,${Buffer.from(`${source}\n// ${crypto.randomUUID()}`).toString('base64')}`);
  await until(()=>dom.window.document.querySelector('#field-al')?.value==='21.00','application initializes seeded draft');
  const find=selector=>{const element=dom.window.document.querySelector(selector);assert.ok(element,`Missing app element ${selector}`);return element;};
  return {dom,target,session,calls,find,readLibrary:()=>service.read(),click:selector=>find(selector).click(),get dialogs(){return dialogs;},holdRead(){heldRead={started:deferred(),release:deferred()};return heldRead;},targetValue:(field,eye='OD')=>target.window.document.querySelector(`#MainContent_${field}${eye==='OS'?'0':''}`).value,setTarget:(field,value,eye='OD')=>{target.window.document.querySelector(`#MainContent_${field}${eye==='OS'?'0':''}`).value=value;}};
}

test('one click copies both real target eye groups, preserving zero and existing values where the source is blank',async t=>{
  const f=await fixture(t);assert.equal(f.find('[data-scope="OU"]').getAttribute('aria-pressed'),'true');
  f.click('.footer-buttons [data-action="read-site"]');
  await until(async()=>{const current=await f.session.read();return current.data.eyes.OD.al==='23.45'&&current.data.eyes.OS.al==='24.10'&&!f.find('.footer-buttons [data-action="read-site"]').disabled;},'both eye rows copied and persisted');
  const current=await f.session.read();assert.equal(current.data.eyes.OD.target,'0');assert.equal(current.data.eyes.OS.target,'-0.50');
  assert.equal(current.data.eyes.OD.lt,'4.10');assert.equal(current.data.eyes.OS.lt,'4.20');assert.equal(current.data.eyes.OD.wtw,'11.50');assert.equal(current.data.eyes.OS.wtw,'11.60');
  assert.equal(current.data.eyes.OD.cct,'520');assert.equal(current.data.eyes.OS.cct,'530');assert.equal(current.data.patient.patientId,'SYNTHETIC-WORKING');
  assert.deepEqual(f.calls.filter(call=>call.type==='read').map(call=>call.options.eye),['OU']);assert.equal(f.dialogs,0);assert.equal(f.find('#review-dialog').open,false);
});

test('one click pastes both eyes through quick fill with constants excluded and exact draft guards',async t=>{
  const f=await fixture(t);f.click('.footer-buttons [data-action="preview-fill"]');
  await until(()=>f.calls.some(call=>call.type==='quick-fill')&&!f.find('.footer-buttons [data-action="preview-fill"]').disabled,'direct paste completes');
  const call=f.calls.find(item=>item.type==='quick-fill');assert.equal(call.options.eye,'OU');assert.equal(call.options.includeConstants,false);assert.equal(call.options.includeIdentifiers,true);
  assert.equal(f.targetValue('Axlength','OD'),'21.00');assert.equal(f.targetValue('Axlength','OS'),'22.00');assert.equal(f.targetValue('Refraction','OD'),'-1.00');
  assert.equal(f.target.window.document.querySelector('#MainContent_Aconstant').value,'119.2');assert.equal(f.dialogs,0);assert.equal(f.find('#review-dialog').open,false);
});

test('an explicit OD choice copies and pastes only OD, leaving the other target and stored eye intact',async t=>{
  const f=await fixture(t);f.click('[data-scope="OD"]');f.click('.footer-buttons [data-action="read-site"]');
  await until(async()=>(await f.session.read()).data.eyes.OD.al==='23.45'&&!f.find('.footer-buttons [data-action="read-site"]').disabled,'OD copied');
  assert.equal((await f.session.read()).data.eyes.OS.al,'22.00');assert.equal(f.calls.find(call=>call.type==='read').options.eye,'OD');
  f.setTarget('Axlength','24.80','OS');f.setTarget('Axlength','20.50','OD');f.click('.footer-buttons [data-action="preview-fill"]');
  await until(()=>f.calls.some(call=>call.type==='quick-fill')&&!f.find('.footer-buttons [data-action="preview-fill"]').disabled,'OD pasted');
  assert.equal(f.calls.find(call=>call.type==='quick-fill').options.eye,'OD');assert.equal(f.targetValue('Axlength','OD'),'23.45');assert.equal(f.targetValue('Axlength','OS'),'24.80');assert.equal(f.dialogs,0);
});

test('a case switch while website read is in flight rejects the stale result without merging it into the new case',async t=>{
  const f=await fixture(t),held=f.holdRead();f.click('.footer-buttons [data-action="read-site"]');await held.started.promise;
  const previous=await f.session.read(),fresh=await f.session.clear(previous.caseToken);held.release.resolve();
  await until(()=>!f.find('.footer-buttons [data-action="read-site"]').disabled&&f.find('#toast').textContent.includes('變更'),'stale read rejected');
  const current=await f.session.read();assert.equal(current.caseToken,fresh.caseToken);assert.deepEqual(current.data.eyes,{OD:{},OS:{}});assert.equal(f.calls.filter(call=>call.type==='patch').length,0);assert.equal(f.dialogs,0);
});

function pasteImage(f,target){
  const file=new File([Uint8Array.of(137,80,78,71)],'SYNTHETIC.png',{type:'image/png'});
  const event=new f.dom.window.Event('paste',{bubbles:true,cancelable:true});
  Object.defineProperty(event,'clipboardData',{value:{items:[{kind:'file',type:'image/png',getAsFile:()=>file}],files:[file]}});
  target.dispatchEvent(event);return event;
}

test('pasting a screenshot from the import page reaches the existing OCR and candidate-save flow once',async t=>{
  const calls=[],ocr={recognizeFiles:async(files,settings,progress,options)=>{calls.push({files,settings,options});return {candidates:{patient:{},eyes:{OD:{al:'24.05'},OS:{al:'24.25'}}},text:'SYNTHETIC OD OS',warnings:[]};}};
  const f=await fixture(t,{ocr});f.click('[data-route="import"]');
  f.click('#paste-image-zone');assert.equal(f.dom.window.document.activeElement.id,'paste-image-zone');
  const event=pasteImage(f,f.find('#paste-image-zone'));assert.equal(event.defaultPrevented,true);
  await until(()=>f.dom.window.document.querySelector('#apply-candidates')&&!f.dom.window.document.querySelector('#apply-candidates').disabled,'pasted image recognized and ready for review');
  assert.equal(calls.length,1);assert.equal(calls[0].files.length,1);assert.equal(calls[0].files[0].type,'image/png');assert.equal(calls[0].options.signal.aborted,false);
  for(const box of f.dom.window.document.querySelectorAll('[data-candidate]'))box.checked=true;
  f.click('#apply-candidates');await until(async()=> (await f.session.read()).data.eyes.OS.al==='24.25','recognized screenshot saved');
  assert.equal((await f.session.read()).data.eyes.OD.al,'24.05');
});

test('capturing the active website decodes locally without a CSP-blocked data URL fetch',async t=>{
  const calls=[],f=await fixture(t,{ocr:{recognizeFiles:async files=>{calls.push(files);return {candidates:{patient:{},eyes:{OD:{al:'24.05'},OS:{}}},text:'SYNTHETIC',warnings:[]};}}});
  const originalFetch=globalThis.fetch;globalThis.fetch=()=>{throw new Error('CSP blocks connect-src data:');};t.after(()=>{globalThis.fetch=originalFetch;});
  f.click('[data-route="import"]');f.click('[data-action="screenshot"]');
  await until(()=>f.dom.window.document.querySelector('#recognize-capture'),'capture preview opens');f.click('#recognize-capture');
  await until(()=>f.dom.window.document.querySelector('#apply-candidates'),'captured image is recognized');
  assert.equal(calls.length,1);assert.equal(calls[0][0].name,'capture.png');assert.equal(calls[0][0].type,'image/png');
  assert.deepEqual([...new Uint8Array(await calls[0][0].arrayBuffer())],[137,80,78,71]);
});

test('a malformed captured image reports an error without starting OCR or changing measurements',async t=>{
  const calls=[],f=await fixture(t,{capture:'data:image/png;base64,?',ocr:{recognizeFiles:async()=>{calls.push('unexpected');}}});
  f.click('[data-route="import"]');f.click('[data-action="screenshot"]');
  await until(()=>f.dom.window.document.querySelector('#recognize-capture'),'capture preview opens');f.click('#recognize-capture');
  await until(()=>f.find('#toast').textContent.includes('data URL'),'decoding error is visible');
  assert.deepEqual(calls,[]);assert.equal((await f.session.read()).data.eyes.OD.al,'21.00');
});

test('image paste leaves measurement fields and unrelated tabs untouched, and text report import is removed',async t=>{
  const calls=[],f=await fixture(t,{ocr:{recognizeFiles:async()=>{calls.push('unexpected');throw new Error('Must not OCR here');}}});
  assert.equal(pasteImage(f,f.find('#field-al')).defaultPrevented,false);
  f.click('[data-route="import"]');assert.equal(f.dom.window.document.querySelector('#raw-text'),null);assert.equal(f.dom.window.document.querySelector('[data-action="parse-text"]'),null);assert.ok(f.find('.import-methods #json-file'));
  f.click('[data-route="sites"]');assert.equal(pasteImage(f,f.dom.window.document.body).defaultPrevented,false);
  await Promise.resolve();assert.deepEqual(calls,[]);assert.equal((await f.session.read()).data.eyes.OD.al,'21.00');
});


test('cylinder preference defaults to minus and a saved preserve preference reaches a normal quick fill',async t=>{
  const f=await fixture(t);f.click('[data-route="settings"]');
  const preference=f.find('select[name="cylinderConvention"]');assert.equal(preference.value,'minus');
  preference.value='preserve';f.find('#settings-form').dispatchEvent(new f.dom.window.Event('submit',{bubbles:true,cancelable:true}));
  await until(()=>f.calls.some(call=>call.type==='save-settings'),'preference saved');
  assert.equal(f.calls.find(call=>call.type==='save-settings').settings.cylinderConvention,'preserve');
  f.click('[data-route="data"]');f.click('.footer-buttons [data-action="preview-fill"]');
  await until(()=>f.calls.some(call=>call.type==='quick-fill'),'saved preference forwarded');
  assert.equal(f.calls.find(call=>call.type==='quick-fill').options.cylinderConvention,'preserve');
  assert.equal((await f.session.read()).data.eyes.OD.al,'21.00');
});


test('configurable Toric and biometer defaults reach a direct fill without an EVO unit setting',async t=>{
  const f=await fixture(t);f.click('[data-route="settings"]');
  assert.equal(f.dom.window.document.querySelector('[name="evoCctUnit"]'),null);
  assert.equal(f.find('[name="defaultSia"]').value,'0.05');assert.equal(f.find('[name="defaultIncisionAxisOD"]').value,'180');assert.equal(f.find('[name="defaultIncisionAxisOS"]').value,'0');assert.equal(f.find('[name="defaultBiometer"]').value,'IOLMaster 700');
  f.find('[name="defaultSia"]').value='0.12';f.find('[name="defaultIncisionAxisOS"]').value='25';f.find('[name="defaultBiometer"]').value='Argos';f.find('[name="identityFallbacks"]').value='false';
  f.find('#settings-form').dispatchEvent(new f.dom.window.Event('submit',{bubbles:true,cancelable:true}));await until(()=>f.calls.some(call=>call.type==='save-settings'),'defaults saved');
  f.click('[data-route="data"]');f.click('.footer-buttons [data-action="preview-fill"]');await until(()=>f.calls.some(call=>call.type==='quick-fill'),'defaults forwarded');
  const options=f.calls.find(call=>call.type==='quick-fill').options;
  assert.equal(options.transferDefaults.defaultSia,'0.12');assert.equal(options.transferDefaults.defaultIncisionAxisOS,'25');assert.equal(options.transferDefaults.defaultBiometer,'Argos');assert.equal(options.identityFallbacks,false);assert.equal(options.evoCctUnit,undefined);
  assert.equal((await f.session.read()).data.eyes.OD.biometer,undefined);
});


test('compact lens picker saves explicit eye and source context and forwards the lens opt-out in one paste',async t=>{
  const {DEFAULT_LENS_CATALOG}=await import('../src/lens-registry.js');
  const entry=DEFAULT_LENS_CATALOG.entries.find(item=>item.modelCode==='SN60WF'&&item.kind==='model');assert.ok(entry);
  const f=await fixture(t,{lensCatalog:{...DEFAULT_LENS_CATALOG,entries:[entry]}});
  const picker=f.find('#lens-picker');picker.value=entry.id;picker.dispatchEvent(new f.dom.window.Event('change',{bubbles:true}));
  await until(async()=>(await f.session.read()).data.eyes.OD.iolCatalogId===entry.id,'lens choice is persisted');
  let stored=(await f.session.read()).data;assert.equal(stored.eyes.OD.iolSourceSite,'escrs');assert.equal(stored.eyes.OD.iolSourceControl,'OD.model');assert.equal(stored.eyes.OD.iolSourceManufacturer,'Alcon');assert.equal(stored.eyes.OD.iolSourceRole,'primary');assert.equal(stored.eyes.OS.iolCatalogId,undefined);assert.equal(stored.eyes.OD.al,'21.00');
  assert.equal(f.find('#transfer-lens').checked,true);f.find('#transfer-lens').checked=false;f.find('#transfer-lens').dispatchEvent(new f.dom.window.Event('change',{bubbles:true}));
  f.click('.footer-buttons [data-action="preview-fill"]');await until(()=>f.calls.some(call=>call.type==='quick-fill'),'paste reaches platform');assert.equal(f.calls.find(call=>call.type==='quick-fill').options.includeLens,false);assert.equal(f.dialogs,0);
  f.click('[data-action="clear-lens"]');await until(async()=>(await f.session.read()).data.eyes.OD.iolCatalogId==='','lens clear saved');stored=(await f.session.read()).data;assert.equal(stored.eyes.OD.iolSourceManufacturer,'');assert.equal(stored.eyes.OD.al,'21.00');
});

test('lens search keeps one focused input throughout IME composition and never edits measurements',async t=>{
  const {DEFAULT_LENS_CATALOG}=await import('../src/lens-registry.js');
  const entry=DEFAULT_LENS_CATALOG.entries.find(item=>item.modelCode==='SN60WF'&&item.kind==='model');
  const f=await fixture(t,{lensCatalog:{...DEFAULT_LENS_CATALOG,entries:[entry]}}),section=f.find('#lens-section'),field=f.find('#lens-search');
  section.open=true;field.focus();field.dispatchEvent(new f.dom.window.CompositionEvent('compositionstart',{bubbles:true,data:''}));
  for(const text of ['水','水晶體']){
    field.value=text;field.dispatchEvent(new f.dom.window.InputEvent('input',{bubbles:true,inputType:'insertCompositionText',isComposing:true,data:text}));
    assert.equal(f.find('#lens-search'),field);assert.equal(f.dom.window.document.activeElement,field);assert.equal(field.value,text);
  }
  field.dispatchEvent(new f.dom.window.CompositionEvent('compositionend',{bubbles:true,data:'水晶體'}));
  field.dispatchEvent(new f.dom.window.InputEvent('input',{bubbles:true,inputType:'insertText',data:'水晶體'}));
  assert.equal(f.find('#lens-search'),field);assert.equal(field.value,'水晶體');assert.equal(f.find('#lens-section').open,true);
  field.value='SN60WF';field.dispatchEvent(new f.dom.window.InputEvent('input',{bubbles:true,inputType:'insertText',data:'SN60WF'}));
  assert.equal(f.find('#lens-picker').value,'');assert.match(f.find('#lens-section summary').textContent,/尚未選擇/);
  assert.equal(f.calls.filter(call=>call.type==='patch').length,0);assert.equal((await f.session.read()).data.eyes.OD.al,'21.00');
});

test('selecting a lens immediately displays the saved choice and leaves its section expanded',async t=>{
  const {DEFAULT_LENS_CATALOG}=await import('../src/lens-registry.js');
  const entry=DEFAULT_LENS_CATALOG.entries.find(item=>item.modelCode==='SN60WF'&&item.kind==='model');
  const f=await fixture(t,{lensCatalog:{...DEFAULT_LENS_CATALOG,entries:[entry]}});
  f.find('#lens-section').open=true;
  const picker=f.find('#lens-picker');picker.value=entry.id;picker.dispatchEvent(new f.dom.window.Event('change',{bubbles:true}));
  await until(()=>f.find('#lens-picker').value===entry.id&&f.find('#lens-section summary').textContent.includes('SN60WF')&&f.find('#toast').textContent.includes('已選擇水晶體'),'selected lens is shown after save');
  assert.equal(f.find('#lens-section').open,true);assert.doesNotMatch(f.find('#lens-section summary').textContent,/尚未選擇/);
  f.click('#all-fields');
  assert.equal(f.find('#lens-section').open,true);assert.equal(f.find('#lens-picker').value,entry.id);
  assert.equal((await f.session.read()).data.eyes.OD.iolCatalogId,entry.id);
});


test('standalone launcher opens a wider-workbench composition with contextual help and data as its first route',async t=>{
  const f=await fixture(t,{view:'launcher'});
  assert.equal(f.dom.window.document.body.classList.contains('embedded'),false);
  assert.equal(f.find('#tab-data').getAttribute('aria-selected'),'true');
  assert.match(f.find('.workbench-help').textContent,/輸入一次/);
  f.click('[data-route="import"]');assert.equal(f.dom.window.document.querySelectorAll('.import-methods>.import-method').length,4);
  assert.match(f.find('.workbench-help').textContent,/結構化 JSON/);
  f.click('[data-route="settings"]');assert.equal(f.dom.window.document.querySelectorAll('fieldset.settings-section').length,2);
  assert.equal(f.find('[name="defaultSurgeonName"]').value,'OPH');
  f.find('[name="defaultSurgeonName"]').value='Dr Test';
  f.find('#settings-form').dispatchEvent(new f.dom.window.Event('submit',{bubbles:true,cancelable:true}));
  await until(()=>f.calls.some(call=>call.type==='save-settings'),'physician default saved');
  assert.equal(f.calls.find(call=>call.type==='save-settings').settings.defaultSurgeonName,'Dr Test');
  f.click('[data-route="data"]');f.click('.footer-buttons [data-action="preview-fill"]');
  await until(()=>f.calls.some(call=>call.type==='quick-fill'),'physician default reaches transfer');
  assert.equal(f.calls.find(call=>call.type==='quick-fill').options.transferDefaults.defaultSurgeonName,'Dr Test');
  assert.equal((await f.session.read()).data.patient.surgeonName,'');
});

test('formula search retains the composing input while filtering website results',async t=>{
  const f=await fixture(t);f.click('[data-route="sites"]');
  const input=f.find('#site-search');input.focus();
  input.dispatchEvent(new f.dom.window.CompositionEvent('compositionstart',{bubbles:true}));
  input.value='Barrett';input.dispatchEvent(new f.dom.window.InputEvent('input',{bubbles:true,isComposing:true}));
  assert.equal(f.find('#site-search'),input);assert.equal(f.dom.window.document.activeElement,input);
  assert.match(f.find('#site-results').textContent,/Barrett/);assert.doesNotMatch(f.find('#site-results').textContent,/TECNIS/);
  input.dispatchEvent(new f.dom.window.CompositionEvent('compositionend',{bubbles:true,data:'Barrett'}));
  assert.equal(input.value,'Barrett');assert.equal((await f.session.read()).data.eyes.OD.al,'21.00');
});

test('a lens saved by another panel updates the visible selector without replacing the search input',async t=>{
  const {DEFAULT_LENS_CATALOG}=await import('../src/lens-registry.js');
  const entry=DEFAULT_LENS_CATALOG.entries.find(e=>e.modelCode==='SN60WF'&&e.kind==='model');
  const f=await fixture(t,{lensCatalog:{...DEFAULT_LENS_CATALOG,entries:[entry]}}),input=f.find('#lens-search');
  const current=await f.session.read();await f.session.patch({eyes:{OD:{iolCatalogId:entry.id,iolSourceLabel:'AcrySof SN60WF'}}},current.caseToken,'another-panel');
  await until(()=>f.find('#lens-picker').value===entry.id,'other-panel lens selection becomes visible');
  assert.equal(f.find('#lens-search'),input);assert.match(f.find('#lens-section summary').textContent,/SN60WF/);
  assert.equal(f.find('[data-count="OD"]').textContent,'7');
});


test('visible JSON import refreshes the lens picker immediately without replacing biometry',async t=>{
  const {DEFAULT_LENS_CATALOG}=await import('../src/lens-registry.js'),{exportLensCatalogDocument}=await import('../src/lens-catalog.js');
  const entry=DEFAULT_LENS_CATALOG.entries.find(e=>e.modelCode==='SN60WF'&&e.kind==='model');
  const f=await fixture(t,{lensCatalog:{entries:[],sources:[]}});f.click('[data-route="import"]');
  const document=exportLensCatalogDocument([],{entries:[entry]}),input=f.find('#json-file');
  const file=new File([JSON.stringify(document)],'synthetic-lenses.json',{type:'application/json'});
  Object.defineProperty(input,'files',{configurable:true,value:[file]});input.dispatchEvent(new f.dom.window.Event('change',{bubbles:true}));
  await until(()=>f.calls.some(c=>c.type==='save-lens-catalog')&&f.find('#toast').textContent.includes('已匯入'),'JSON lens catalog imported');
  f.click('[data-route="data"]');assert.ok([...f.find('#lens-picker').options].some(o=>o.value===entry.id));
  assert.equal((await f.session.read()).data.eyes.OD.al,'21.00');
});


test('clinical state buttons precede measurement fields and persist independent eye choices without changing numbers',async t=>{
  const f=await fixture(t),d=f.dom.window.document;
  assert.ok(f.find('.eye-state-panel').compareDocumentPosition(f.find('.core-fields'))&4);
  assert.equal(d.querySelector('.eye-state-panel input,.eye-state-panel select'),null);
  assert.equal(f.find('[data-lvc="none"]').getAttribute('aria-pressed'),'true');
  f.click('[data-mode="toric"]');f.click('[data-mode="keratoconus"]');f.click('[data-lvc="myopic"]');
  assert.equal(f.find('[data-mode="toric"]').getAttribute('aria-pressed'),'true');
  assert.equal(f.find('[data-mode="keratoconus"]').getAttribute('aria-pressed'),'true');
  assert.equal(f.find('[data-lvc="myopic"]').getAttribute('aria-pressed'),'true');
  assert.equal(d.activeElement,f.find('[data-lvc="myopic"]'));
  f.click('[data-eye="OS"]');assert.equal(f.find('[data-mode="toric"]').getAttribute('aria-pressed'),'false');
  f.click('[data-lvc="rk"]');f.click('[data-eye="OD"]');
  assert.equal(f.find('[data-lvc="myopic"]').getAttribute('aria-pressed'),'true');
  f.click('.footer-buttons [data-action="preview-fill"]');
  await until(()=>f.calls.some(c=>c.type==='quick-fill'),'state choices reach fill');
  const call=f.calls.find(c=>c.type==='quick-fill');
  assert.equal(call.data.eyes.OD.toric,true);assert.equal(call.data.eyes.OD.keratoconus,true);assert.equal(call.data.eyes.OD.lvcType,'myopic');
  assert.equal(call.data.eyes.OS.lvcType,'rk');assert.equal(call.data.eyes.OS.toric,undefined);
  assert.equal(call.data.eyes.OD.al,'21.00');assert.equal(call.data.eyes.OS.al,'22.00');assert.equal(f.dialogs,0);
});

test('all-fields is a visibility button and never edits either eye',async t=>{
  const f=await fixture(t),before=(await f.session.read()).data;
  assert.equal(f.find('#all-fields').tagName,'BUTTON');assert.match(f.find('#all-fields').textContent,/顯示所有欄位/);
  assert.equal(f.find('#all-fields').getAttribute('aria-pressed'),'false');
  f.click('#all-fields');assert.equal(f.find('#all-fields').getAttribute('aria-pressed'),'true');
  assert.ok(f.dom.window.document.querySelector('[data-field="fellowAl"]'));
  f.click('#all-fields');assert.equal(f.find('#all-fields').getAttribute('aria-pressed'),'false');
  assert.deepEqual((await f.session.read()).data,before);assert.equal(f.calls.filter(c=>c.type==='patch').length,0);
});

test('switching LVC from a legacy keratoconus record retains the independent keratoconus state',async t=>{
  const f=await fixture(t),current=await f.session.read();
  await f.session.patch({eyes:{OD:{lvcType:'keratoconus'}}},current.caseToken,'another-panel');
  await until(()=>f.find('[data-mode="keratoconus"]').getAttribute('aria-pressed')==='true','legacy condition visible');
  f.click('[data-lvc="hyperopic"]');f.click('.footer-buttons [data-action="preview-fill"]');
  await until(()=>f.calls.some(c=>c.type==='quick-fill'),'legacy state normalized on explicit choice');
  const saved=(await f.session.read()).data;
  assert.equal(saved.eyes.OD.keratoconus,true);assert.equal(saved.eyes.OD.lvcType,'hyperopic');
  f.click('[data-mode="keratoconus"]');f.click('.footer-buttons [data-action="preview-fill"]');
  await until(()=>f.calls.filter(c=>c.type==='quick-fill').length===2,'keratoconus turned off');
  assert.equal((await f.session.read()).data.eyes.OD.keratoconus,false);assert.equal((await f.session.read()).data.eyes.OD.lvcType,'hyperopic');
});

test('cloud upload asks at the actual image request and grants only this job without changing saved settings',async t=>{
  let invoked=0,approved=0;
  const f=await fixture(t,{ocr:{recognizeFiles:async(files,settings,onProgress,options)=>{
    invoked++;assert.equal(settings.ocrProvider,'gemini');assert.notEqual(settings.cloudConsent,true);
    assert.equal(await options.beforeCloudRequest({provider:'gemini'}),true);approved++;
    return {text:'OD\nAL 23.45',candidates:{patient:{},eyes:{OD:{al:'23.45'},OS:{}},warnings:[]},warnings:[]};
  }}});
  f.click('[data-route="settings"]');f.find('[name="ocrProvider"]').value='gemini';f.find('[name="geminiApiKey"]').value='SYNTHETIC-NOT-A-KEY';
  f.find('#settings-form').dispatchEvent(new f.dom.window.Event('submit',{bubbles:true,cancelable:true}));
  await until(()=>f.calls.some(call=>call.type==='save-settings'),'cloud preferences saved');
  f.click('[data-route="import"]');pasteImage(f,f.dom.window.document.body);
  await until(()=>f.dom.window.document.querySelector('#cloud-confirm'),'cloud confirmation after image processing starts');
  assert.equal(invoked,1);assert.equal(approved,0);assert.match(f.find('#review-dialog').textContent,/Google Gemini API/);
  f.click('#cloud-confirm');await until(()=>f.dom.window.document.querySelector('#apply-candidates'),'review after approved upload');
  assert.equal(approved,1);assert.notEqual(f.calls.find(call=>call.type==='save-settings').settings.cloudConsent,true);
  assert.equal((await f.session.read()).data.eyes.OD.al,'21.00');
});

test('OD and OS are keyboard tabs controlling their own measurement panel without changing stored eye values',async t=>{
 const f=await fixture(t),doc=f.dom.window.document;assert.equal(f.find('#eye-tab-OD').getAttribute('aria-selected'),'true');assert.equal(f.find('#biometry-form').getAttribute('role'),'tabpanel');
 f.find('#eye-tab-OD').focus();f.find('#eye-tab-OD').dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
 assert.equal(f.find('#eye-tab-OS').getAttribute('aria-selected'),'true');assert.equal(doc.activeElement.id,'eye-tab-OS');assert.equal(f.find('#biometry-form').getAttribute('aria-labelledby'),'eye-tab-OS');assert.equal(f.find('#field-al').value,'22.00');
 f.find('#eye-tab-OS').dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Home',bubbles:true}));assert.equal(f.find('#field-al').value,'21.00');assert.equal(doc.activeElement.id,'eye-tab-OD');
 const record=await f.session.read();assert.equal(record.data.eyes.OD.al,'21.00');assert.equal(record.data.eyes.OS.al,'22.00');
});
test('OCR review places scored fields in OD/OS columns and retains low-confidence highlighting after language switch',async t=>{
 const candidate={patient:{},eyes:{OD:{al:'24.05'},OS:{al:'24.25'}},fieldConfidence:{'OD.al':.72},evidence:[{eye:'OD',key:'al',value:'24.05',confidence:.72,fileIndex:0}]};
 const f=await fixture(t,{view:'workbench',ocr:{recognizeFiles:async(files,settings,progress)=>{progress('正在本機辨識影像…');return {candidates:candidate,text:'SYNTHETIC OD OS',warnings:[]};}}});
 f.click('[data-route="import"]');pasteImage(f,f.dom.window.document.body);await until(()=>f.dom.window.document.querySelector('#apply-candidates'),'bilateral OCR review');
 const od=f.find('[data-review-eye-column="OD"] [data-candidate-value]'),os=f.find('[data-review-eye-column="OS"] [data-candidate-value]');assert.equal(od.value,'24.05');assert.equal(os.value,'24.25');assert.ok(od.closest('.is-low-confidence'));assert.equal(os.closest('.is-low-confidence'),null);
 od.value='24.15';f.click('#language-toggle');assert.equal(f.find('[data-review-eye-column="OD"] [data-candidate-value]'),od);assert.equal(od.value,'24.15');assert.ok(od.closest('.is-low-confidence'));
 assert.equal(f.find('#review-source-select').options.length,1);assert.ok(f.find('#review-duration').textContent.includes('0:'));
});

test('recognition shows an indeterminate bar and elapsed clock, then cancel stops the active review job',async t=>{
 let started=false;
 const f=await fixture(t,{ocr:{recognizeFiles:async(files,settings,onProgress,{signal})=>{
   started=true;onProgress('正在本機辨識影像…');return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('Canceled'),{name:'AbortError'})),{once:true}));
 }}});
 f.click('[data-route="import"]');pasteImage(f,f.dom.window.document.body);await until(()=>started,'long recognition started');
 assert.equal(f.find('.import-activity').hidden,false);assert.equal(f.find('.import-activity').getAttribute('aria-busy'),'true');assert.equal(f.find('#ocr-progressbar').hasAttribute('value'),false);assert.match(f.find('#ocr-elapsed').textContent,/^\d+:\d{2}$/);
 f.click('[data-action="cancel-ocr"]');await until(()=>f.find('.import-activity').hidden,'progress hidden after cancel');
 assert.equal(f.dom.window.document.querySelector('#apply-candidates'),null);assert.equal((await f.session.read()).data.eyes.OD.al,'21.00');
});

const parserCandidate=(value,unit=null)=>({value:null,candidate_value:value,unit,status:'unverified',data_status:'present',verification_status:'unverified'});
function parserResult(){return {schema_version:'1.2',source_sha256:'',workflow:'synthetic-ui-test',verification_state:'unverified',patient_id:parserCandidate('SYNTHETIC-WORKING'),measurement_date:parserCandidate('2026-11-17'),eyes:{OD:{al:parserCandidate(24.05,'mm'),mean_k:parserCandidate(43.75,'D'),pupil:{unit:'mm',status:'not_measured',data_status:'not_measured',verification_status:'cross_checked'},k1:{power:parserCandidate(43.5,'D'),axis:parserCandidate(90,'degree')}},OS:{k2:{power:parserCandidate(44.2,'D')}}}};}
function uploadJson(f,file){const input=f.find('#json-file');Object.defineProperty(input,'files',{configurable:true,value:[file]});input.dispatchEvent(new f.dom.window.Event('change',{bubbles:true}));}
function pasteJson(f,text){f.click('[data-action="paste-json"]');f.find('#json-paste-content').value=text;f.click('#import-pasted-json');}

test('JSON upload and explicit paste parse once and preserve unchecked parser candidates until reviewed',async t=>{
  for(const method of ['upload','paste'])await t.test(method,async t=>{
    const f=await fixture(t),text='\uFEFF'+JSON.stringify(parserResult());f.click('[data-route="import"]');
    const original=JSON.parse;let count=0;JSON.parse=function(input,...args){if(input===text.slice(1))count++;return original.call(this,input,...args);};t.after(()=>{JSON.parse=original;});
    if(method==='upload')uploadJson(f,{size:new Blob([text]).size,text:async()=>text});else pasteJson(f,text);
    await until(()=>f.dom.window.document.querySelector('#select-new-candidates'),'parser review');JSON.parse=original;assert.equal(count,1);
    const rows=[...f.dom.window.document.querySelectorAll('.candidate-row')];assert.ok(rows.length>=5);
    assert.equal(rows.every(row=>row.classList.contains('is-unverified')),true);assert.equal(rows.some(row=>row.querySelector('[data-candidate]').checked),false);
    assert.equal(f.dom.window.document.querySelector('.review-confidence'),null);assert.equal(f.dom.window.document.querySelector('.review-report-date'),null);assert.match(f.find('.report-date').textContent,/2026-11-17/);assert.match(f.find('.report-date').textContent,/未驗證候選值/);assert.match(f.find('.report-summary').textContent,/43.75/);assert.match(f.find('.report-summary').textContent,/未測量/);
    assert.equal((await f.session.read()).data.eyes.OD.k1??'','');f.click('#select-new-candidates');
    assert.equal(f.find('[data-review-eye="OD"][data-review-key="al"] [data-candidate]').checked,false);
    assert.equal(f.find('[data-review-eye="patient"][data-review-key="patientId"] [data-candidate]').checked,false);
    assert.equal(f.find('[data-review-eye="OD"][data-review-key="k1"] [data-candidate]').checked,true);
    f.click('#apply-candidates');await until(async()=>{const r=await f.session.read();return r.data.eyes.OD.k1==='43.5'&&f.dom.window.document.querySelector('#field-al');},'selected parser fields saved');
    const saved=await f.session.read();assert.equal(saved.data.eyes.OD.al,'21.00');assert.equal(saved.data.patient.patientId,'SYNTHETIC-WORKING');assert.equal(saved.data.eyes.OS.k2,'44.2');assert.equal(Object.hasOwn(saved.data,'measurementDate'),false);assert.equal(saved.data.report.eyes.OD.mean_k.candidate_value,43.75);assert.equal(saved.data.report.measurement_date.candidate_value,'2026-11-17');assert.match(f.find('.report-summary').textContent,/43.75/);
  });
});

test('a pasted single-PDF VGHKS-bot export opens the existing parser review',async t=>{
  const f=await fixture(t);
  f.click('[data-route="import"]');
  pasteJson(f,JSON.stringify({schema_version:1,source:'orders',documents:[{pages:[1],data:parserResult()}]}));
  await until(()=>f.dom.window.document.querySelector('#select-new-candidates'),'single report parser review');
  const candidate=f.find('[data-review-eye="OS"][data-review-key="k2"] [data-candidate]');
  assert.equal(candidate.checked,false);
  assert.equal(f.dom.window.document.querySelector('[data-parser-batch-index]'),null);
});

test('a VGHKS-bot batch reviews and applies only the selected PDF',async t=>{
  const f=await fixture(t);
  const first={...parserResult(),eyes:{OD:{acd:parserCandidate(3.1,'mm')}}};
  const last={...parserResult(),eyes:{OS:{k2:{power:parserCandidate(44.2,'D')}}}};
  const text=JSON.stringify({schema_version:1,source:'scans',documents:[
    {label:'First synthetic report',data:first},
    {label:'Unavailable report',error:'Source failure'},
    {label:'<b>Third synthetic report</b>',pages:[3],data:last},
  ]});
  const before=(await f.session.read()).data;
  f.click('[data-route="import"]');
  uploadJson(f,{size:text.length,text:async()=>text});
  await until(()=>f.dom.window.document.querySelector('[data-parser-batch-index]'),'batch report picker');
  const reports=[...f.dom.window.document.querySelectorAll('[data-parser-batch-index]')];
  assert.equal(f.find('#review-parser-document').disabled,true);
  assert.deepEqual(reports.map(report=>report.dataset.parserBatchIndex),['0','2']);
  assert.match(reports[1].closest('label').textContent,/<b>Third synthetic report<\/b>/);
  assert.match(f.find('[data-parser-batch-failed]').textContent,/Unavailable report/);
  assert.deepEqual((await f.session.read()).data,before);
  reports[1].click();
  f.click('#review-parser-document');
  await until(()=>f.dom.window.document.querySelector('#select-new-candidates'),'selected report review');
  assert.equal(f.dom.window.document.querySelector('[data-review-eye="OD"][data-review-key="acd"]'),null);
  f.click('#select-new-candidates');
  f.click('#apply-candidates');
  await until(async()=>(await f.session.read()).data.eyes.OS.k2==='44.2','selected OS field saved');
  assert.equal((await f.session.read()).data.eyes.OD.acd,before.eyes.OD.acd);
});

test('VGHKS-bot batches save separate measurements to one explicit patient without changing the draft',async t=>{
  const f=await fixture(t);
  const patient_id=parserCandidate('000427');
  const first={...parserResult(),patient_id,source_sha256:'a'.repeat(64),eyes:{OD:{al:parserCandidate(24.05,'mm')}}};
  const second={...parserResult(),patient_id,source_sha256:'b'.repeat(64),eyes:{OS:{al:parserCandidate(24.32,'mm')}}};
  delete second.measurement_date;
  const batch=JSON.stringify({schema_version:1,source:'orders',documents:[
    {label:'Earlier PDF',date:'2026-11-15',pages:[3,1],data:first},
    {label:'Later PDF',date:'2026-11-18',data:second},
    {label:'Failed PDF',error:'Synthetic extraction failure'},
  ]});
  const before=(await f.session.read()).data;
  async function chooseReports(){
    f.click('[data-route="import"]');
    pasteJson(f,batch);
    await until(()=>f.dom.window.document.querySelector('#save-parser-batch'),'batch save controls');
    assert.equal(f.find('#save-parser-batch').disabled,true);
    const reports=[...f.dom.window.document.querySelectorAll('[data-parser-batch-index]')];
    assert.equal(reports.every(report=>report.checked===false),true);
    assert.equal(reports.length,2);
    assert.match(f.find('.parser-batch-report table').textContent,/24\.05/);
    for(const report of reports)report.click();
    assert.equal(f.find('#review-parser-document').disabled,true);
    assert.equal(f.find('#save-parser-batch').disabled,true);
    return f.find('#parser-batch-patient');
  }
  function selectPatient(select,id){
    select.value=id;
    select.dispatchEvent(new f.dom.window.Event('change',{bubbles:true}));
  }
  selectPatient(await chooseReports(),'new');
  assert.equal(f.find('#parser-batch-patient-id').placeholder,'000427');
  f.click('#save-parser-batch');
  await until(()=>f.dom.window.document.querySelector('#tab-patients').getAttribute('aria-selected')==='true','batch saved to Patients');
  const saved=await f.readLibrary();
  assert.equal(saved.patients.length,1);
  const [patient]=saved.patients;
  assert.equal(patient.patient.patientId,'000427');
  assert.equal(patient.measurements.length,2);
  assert.notEqual(patient.measurements[0].id,patient.measurements[1].id);
  assert.deepEqual(patient.measurements.map(item=>item.label),['Earlier PDF','Later PDF']);
  assert.deepEqual(patient.measurements.map(item=>item.measuredAt),['2026-11-17T00:00:00.000Z','']);
  assert.deepEqual(patient.measurements.map(item=>item.source),['VGHKS-bot · p.1,3','VGHKS-bot']);
  assert.deepEqual(patient.measurements.map(item=>item.eyes),[{OD:{al:'24.05'},OS:{}},{OD:{},OS:{al:'24.32'}}]);
  assert.equal(patient.measurements[0].report.eyes.OD.al.status,'unverified');
  assert.equal(f.find('.patient-record').open,true);
  assert.deepEqual((await f.session.read()).data,before);

  selectPatient(await chooseReports(),'0');
  f.click('#save-parser-batch');
  await until(()=>f.find('#toast').textContent.includes('略過 2 筆重複紀錄'),'duplicate import reported');
  assert.deepEqual(await f.readLibrary(),saved);
  assert.deepEqual((await f.session.read()).data,before);
});

test('plain text paste is inert and malformed or oversized explicit JSON does not alter the draft',async t=>{
  const f=await fixture(t),before=await f.session.read();f.click('[data-route="import"]');
  const event=new f.dom.window.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{items:[],files:[],getData:()=>JSON.stringify(parserResult())}});f.dom.window.document.body.dispatchEvent(event);
  assert.equal(event.defaultPrevented,false);assert.equal(f.find('#review-dialog').open,false);
  pasteJson(f,'not JSON');await until(()=>f.dom.window.document.querySelector('.dialog-feedback'),'invalid JSON feedback');assert.match(f.find('.dialog-feedback').textContent,/JSON/);
  f.find('#json-paste-content').value='"'+'中'.repeat(3_333_334)+'"';f.click('#import-pasted-json');await until(()=>/10 MB/.test(f.find('.dialog-feedback').textContent),'UTF-8 size limit');
  assert.deepEqual((await f.session.read()).data,before.data);
});

test('JSON file read rejects stale drafts and rejects oversized files before reading',async t=>{
  const f=await fixture(t),held=deferred();f.click('[data-route="import"]');uploadJson(f,{size:100,text:()=>held.promise});
  f.click('[data-route="data"]');f.find('#field-al').value='21.50';f.find('#field-al').dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));f.click('[data-action="save"]');await until(async()=>(await f.session.read()).data.eyes.OD.al==='21.50','manual edit saved');held.resolve(JSON.stringify(parserResult()));
  await until(()=>/已變更/.test(f.find('#toast').textContent),'stale file import canceled');assert.equal(f.find('#review-dialog').open,false);
  f.click('[data-route="import"]');let read=false;uploadJson(f,{size:10_000_001,text:async()=>{read=true;return '{}';}});
  await until(()=>/10 MB/.test(f.find('#toast').textContent),'file size feedback');assert.equal(read,false);assert.equal((await f.session.read()).data.eyes.OD.al,'21.50');
});

test('legacy case, library and lens catalog JSON still share upload/paste entry points',async t=>{
  const f=await fixture(t,{lensCatalog:{format:'biometry-lens-catalog',schemaVersion:'1.1',sources:[],entries:[]}});f.click('[data-route="import"]');
  const data=emptyCase();data.eyes.OD.k1='43.25';pasteJson(f,JSON.stringify(exportCaseDocument(data)));
  await until(()=>f.dom.window.document.querySelector('#apply-candidates'),'legacy case review');assert.equal(f.dom.window.document.querySelector('#select-new-candidates'),null);
  assert.equal(f.find('[data-review-key="k1"] [data-candidate]').checked,true);f.click('#apply-candidates');await until(()=>f.dom.window.document.querySelector('#field-k1'),'legacy data saved');
  f.click('[data-route="import"]');assert.ok(f.find('[data-action="export-parser"]'));assert.ok(f.find('[data-action="export"]'));assert.ok(f.find('[data-action="export-library"]'));
  pasteJson(f,JSON.stringify(exportLibraryDocument({version:1,revision:0,patients:[]})));
  await until(()=>f.calls.some(call=>call.type==='import-patients'),'library route');await until(()=>f.dom.window.document.querySelector('#tab-patients').getAttribute('aria-selected')==='true','patient view');
  f.click('[data-route="import"]');pasteJson(f,JSON.stringify({format:'biometry-lens-catalog',schemaVersion:'1.1',exportedAt:'2026-11-17T00:00:00.000Z',sources:[],entries:[]}));
  await until(()=>f.calls.some(call=>call.type==='save-lens-catalog'),'lens catalog route');assert.equal(f.find('#review-dialog').open,false);
});

test('parser export downloads its shared candidate schema while case backup remains independent',async t=>{
  const f=await fixture(t),blobs=[];const create=URL.createObjectURL,revoke=URL.revokeObjectURL;
  URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:synthetic-json';};URL.revokeObjectURL=()=>{};t.after(()=>{URL.createObjectURL=create;URL.revokeObjectURL=revoke;});
  const names=[];f.dom.window.HTMLAnchorElement.prototype.click=function(){names.push(this.download);};f.click('[data-route="import"]');
  f.click('[data-action="export-parser"]');await until(()=>blobs.length===1,'parser JSON downloaded');
  const parser=JSON.parse(await blobs[0].text());assert.equal(names[0],'biometry-parser.json');assert.equal(parser.schema_version,'1.2');assert.equal(parser.workflow,'biometry-clip');assert.equal(parser.eyes.OD.al.candidate_value,21);assert.equal(parser.eyes.OD.al.status,'unverified');assert.equal(Object.hasOwn(parser,'measurement_date'),false);
  f.click('.import-advanced [data-action="export"]');await until(()=>blobs.length===2,'case backup downloaded');
  const backup=JSON.parse(await blobs[1].text());assert.equal(names[1],'biometry-case.json');assert.equal(backup.format,'biometry-clipboard');assert.equal(backup.case.eyes.OD.al,'21.00');
});

test('report association blocks a different source patient until the selected identity matches',async t=>{
  const f=await fixture(t),source=parserResult();source.patient_id=parserCandidate('SYNTHETIC-OTHER');f.click('[data-route="import"]');pasteJson(f,JSON.stringify(source));
  await until(()=>f.dom.window.document.querySelector('#select-new-candidates'),'parser report review');f.click('#select-new-candidates');f.click('#apply-candidates');
  await until(()=>f.dom.window.document.querySelector('.dialog-feedback'),'patient mismatch feedback');assert.match(f.find('.dialog-feedback').textContent,/病人 ID/);
  const before=await f.session.read();assert.equal(before.data.patient.patientId,'SYNTHETIC-WORKING');assert.equal(before.data.report,undefined);assert.equal(before.data.eyes.OD.k1??'','');
  f.find('[data-review-eye="patient"][data-review-key="patientId"] [data-candidate]').checked=true;f.click('#apply-candidates');
  await until(async()=>(await f.session.read()).data.patient.patientId==='SYNTHETIC-OTHER','matching selected identity imported');const after=await f.session.read();assert.equal(after.data.report.patient_id.candidate_value,'SYNTHETIC-OTHER');
});

test('no selected fields cannot silently retain an imported report',async t=>{
  const f=await fixture(t);f.click('[data-route="import"]');pasteJson(f,JSON.stringify(parserResult()));await until(()=>f.dom.window.document.querySelector('#apply-candidates'),'unselected review');
  f.click('#apply-candidates');await until(()=>!f.find('#review-dialog').open,'empty selection closed');assert.equal((await f.session.read()).data.report,undefined);
});

test('confirmed report backups preserve their archive separately from editable calculator values',async t=>{
  const f=await fixture(t);f.click('[data-route="import"]');pasteJson(f,JSON.stringify(parserResult()));await until(()=>f.dom.window.document.querySelector('#select-new-candidates'),'source review');f.click('#select-new-candidates');f.click('#apply-candidates');
  await until(async()=>!!(await f.session.read()).data.report,'source archive saved');const saved=(await f.session.read()).data;
  f.click('[data-route="import"]');const backup=exportCaseDocument(saved);assert.equal(backup.schemaVersion,'1.4');pasteJson(f,JSON.stringify(backup));
  await until(()=>f.dom.window.document.querySelector('#apply-candidates'),'backup review');assert.ok(f.find('.report-summary'));f.find('[data-review-eye="OD"][data-review-key="al"] [data-candidate]').checked=true;f.click('#apply-candidates');
  await until(()=>!f.find('#review-dialog').open,'backup applied');assert.deepEqual((await f.session.read()).data.report,saved.report);
});

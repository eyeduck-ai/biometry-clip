import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createSessionStore,SESSION_KEY} from '../src/session-store.js';
import {createLibraryStore,createLibraryService} from '../src/library-store.js';

async function until(predicate,description){
  for(let attempt=0;attempt<100;attempt++){
    if(await predicate())return;
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  throw new Error(`Timed out: ${description}`);
}

async function fixture(t,{language='en',languageApi=true}={}){
  const dom=new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>',{url:'http://127.0.0.1/index.html'});
  const keys=['window','document','location','Event','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','FormData','getComputedStyle','setTimeout','setInterval','__appI18nPlatform'];
  const saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),nativeTimeout=setTimeout,timers=new Set();
  for(const key of keys.filter(key=>!['setTimeout','setInterval','__appI18nPlatform'].includes(key)))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='getComputedStyle'?dom.window.getComputedStyle.bind(dom.window):dom.window[key]});
  globalThis.setTimeout=(callback,delay,...args)=>{const timer=nativeTimeout(callback,delay,...args);timers.add(timer);return timer;};
  globalThis.setInterval=()=>0;
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new dom.window.Event('close'));};
  t.after(()=>{
    dom.window.dispatchEvent(new dom.window.Event('pagehide'));
    for(const timer of timers)clearTimeout(timer);
    for(const [key,descriptor]of saved)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];
    dom.window.close();
  });
  const transient={},local={},caseListeners=new Set(),languageListeners=new Set(),calls=[];
  const session=createSessionStore({get:async()=>structuredClone(transient),set:async values=>{Object.assign(transient,structuredClone(values));if(values[SESSION_KEY])for(const listener of caseListeners)listener(structuredClone(values[SESSION_KEY]));}});
  const store=createLibraryStore({get:async()=>structuredClone(local),set:async values=>Object.assign(local,structuredClone(values))});
  const service=createLibraryService(store,session);
  let current=await session.read();
  // Synthetic identity/source strings intentionally collide with real UI keys.
  current=await session.patch({patient:{patientId:'資料',surgeonName:'設定'},eyes:{OD:{al:'23.45',cct:'543',k1:'43.20',k2:'44.10',target:'0'},OS:{al:'24.10',cct:'551',k1:'42.80',k2:'43.90',target:'-0.50'}}},current.caseToken);
  const created=await service.createPatient(current.data.patient);
  const measurement=await service.saveMeasurement({patientId:created.patient.id,label:'匯入',source:'設定',measuredAt:'2026-11-14T12:00:00Z',caseToken:current.caseToken,revision:current.revision});
  current=await session.read();await service.selectMeasurement(created.patient.id,measurement.measurement.id,current.caseToken,current.revision);
  const api={
    isExtension:false,defaultSettings:{ocrProvider:'local',localModel:'tiny'},getFloatingTabId:()=>undefined,
    siteTabs:async()=>[],subscribeTabs:()=>()=>{},subscribeLibrary:()=>()=>{},loadLibrary:()=>service.read(),
    subscribeCase:listener=>{caseListeners.add(listener);return()=>caseListeners.delete(listener);},
    loadData:async()=>({...await session.read(),settings:{ocrProvider:'local',localModel:'tiny'}}),
    patchCase:(patch,token)=>{calls.push({type:'patch-case',patch:structuredClone(patch)});return session.patch(patch,token,'i18n-test');},
    saveSettings:async settings=>{calls.push({type:'save-settings',settings:structuredClone(settings)});},
    clearCase:token=>session.clear(token),
  };
  if(languageApi){
    api.loadLanguage=async()=>language;
    api.saveLanguage=async value=>{calls.push({type:'save-language',value});};
    api.subscribeLanguage=listener=>{languageListeners.add(listener);return()=>languageListeners.delete(listener);};
  }
  globalThis.__appI18nPlatform=api;
  const appUrl=new URL('../src/app.js',import.meta.url);
  const source=(await readFile(appUrl,'utf8')).replace(/^import '\.\/styles\.css';\r?\n/m,'').replace("import * as platform from './platform.js';",'const platform=globalThis.__appI18nPlatform;').replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL(path,appUrl).href}'`);
  await import(`data:text/javascript;base64,${Buffer.from(`${source}\n// ${crypto.randomUUID()}`).toString('base64')}`);
  await until(()=>dom.window.document.querySelector('#field-al')?.value==='23.45'&&dom.window.document.querySelector('#language-toggle'),'app and language initialize');
  const find=selector=>{const element=dom.window.document.querySelector(selector);assert.ok(element,`Missing UI control ${selector}`);return element;};
  return {dom,session,store,calls,find,click:selector=>find(selector).click(),externalLanguage:value=>{for(const listener of languageListeners)listener(value);}};
}
function writes(f){return f.calls.filter(call=>call.type!=='save-language');}

test('JSON paste dialog changes language without replacing or translating the pasted document',async t=>{
  const f=await fixture(t);f.click('[data-route="import"]');f.click('[data-action="paste-json"]');
  const input=f.find('#json-paste-content');input.value='{"patient_id":"設定","eyes":{"OD":{},"OS":{}}}';const before=input.value;
  assert.match(f.find('#dialog-title').textContent,/Paste JSON/);assert.match(f.find('#import-pasted-json').textContent,/Import JSON/);
  f.click('#language-toggle');assert.equal(f.find('#json-paste-content'),input);assert.equal(input.value,before);assert.equal(f.find('#dialog-title').textContent,'貼上 JSON');assert.equal(writes(f).length,0);
});

test('app without language persistence APIs still opens in English and protects synthetic patient/source labels',async t=>{
  const f=await fixture(t,{languageApi:false});
  assert.equal(f.dom.window.document.documentElement.lang,'en');
  assert.equal(f.find('#tab-data').textContent.trim(),'Data');
  assert.equal(f.find('#tab-patients').textContent.trim(),'Patients');
  assert.equal(f.find('#case-name').textContent,'資料');
  assert.equal(f.find('#patient-picker').selectedOptions[0].textContent,'資料');
  assert.ok(f.find('#measurement-picker').selectedOptions[0].textContent.startsWith('匯入 · '));
  assert.equal(f.find('[data-patient="surgeonName"]').value,'設定');
  assert.equal(f.find('#field-cct').value,'543');
  const before=await f.session.read();
  f.click('[data-route="patients"]');
  assert.equal(f.find('.patient-record summary strong').textContent,'資料');
  assert.equal(f.find('.measurement-description strong').textContent,'匯入');
  assert.equal(f.find('.measurement-description small [data-i18n-skip]').textContent,'設定');
  f.click('#language-toggle');
  assert.equal(f.find('#tab-data').textContent.trim(),'資料');
  assert.equal(f.find('.patient-record summary strong').textContent,'資料');
  assert.equal(f.find('.measurement-description strong').textContent,'匯入');
  assert.deepEqual(await f.session.read(),before);assert.deepEqual(writes(f),[]);
});

test('saved Chinese preference and manual switch preserve the same fields, open details and caret without saving case data',async t=>{
  const f=await fixture(t,{language:'zh-TW'});
  assert.equal(f.dom.window.document.documentElement.lang,'zh-Hant');
  assert.equal(f.find('#tab-data').textContent.trim(),'資料');
  const form=f.find('#biometry-form'),field=f.find('#field-al'),details=f.find('.patient-details'),lens=f.find('#lens-section'),toggle=f.find('#language-toggle');
  details.open=true;lens.open=true;
  field.value='23.456';field.focus();field.setSelectionRange(2,4);
  const before=await f.session.read(),libraryBefore=await f.store.read();
  f.click('#language-toggle');await until(()=>f.calls.some(call=>call.type==='save-language'),'language preference saved');
  assert.equal(f.dom.window.document.documentElement.lang,'en');assert.equal(f.find('#tab-data').textContent.trim(),'Data');
  assert.equal(f.find('#biometry-form'),form);assert.equal(f.find('#field-al'),field);assert.equal(f.find('#language-toggle'),toggle);
  assert.equal(f.find('.patient-details'),details);assert.equal(details.open,true);assert.equal(lens.open,true);
  assert.equal(field.value,'23.456');assert.equal(f.dom.window.document.activeElement,field);assert.equal(field.selectionStart,2);assert.equal(field.selectionEnd,4);
  assert.equal(f.find('#case-name').textContent,'資料');
  assert.equal(f.find('#patient-picker').selectedOptions[0].textContent,'資料');
  assert.deepEqual(f.calls.filter(call=>call.type==='save-language'),[{type:'save-language',value:'en'}]);
  assert.deepEqual(writes(f),[]);assert.deepEqual(await f.session.read(),before);assert.deepEqual(await f.store.read(),libraryBefore);
  f.click('#language-toggle');
  assert.equal(f.find('#tab-data').textContent.trim(),'資料');assert.equal(f.find('#field-al'),field);assert.equal(field.value,'23.456');
});

test('empty case fallback translates while an identity matching a UI key stays verbatim after live updates',async t=>{
  const f=await fixture(t),before=await f.session.read();
  await f.session.clear(before.caseToken,'i18n-test-reset');
  await until(()=>f.find('#case-name').textContent==='Untitled case','empty case English fallback');
  const name=f.find('#case-name');
  assert.equal(name.hasAttribute('data-i18n-skip'),false);
  f.externalLanguage('zh-TW');assert.equal(name.textContent,'未命名個案');
  f.externalLanguage('en');assert.equal(name.textContent,'Untitled case');
  const empty=await f.session.read();
  await f.session.patch({patient:{patientId:'資料'}},empty.caseToken,'i18n-test-identity');
  await until(()=>f.find('#case-name').textContent==='資料','new identity is shown verbatim');
  assert.equal(f.find('#case-name'),name,'syncing identity retains the existing case-name node');
  assert.equal(name.hasAttribute('data-i18n-skip'),true);
  f.externalLanguage('zh-TW');f.externalLanguage('en');
  assert.equal(name.textContent,'資料');assert.equal(f.find('[data-patient="patientId"]').value,'資料');
  assert.deepEqual(writes(f),[]);
});

test('an open measurement dialog switches languages in place and retains editable labels and selected patient identity',async t=>{
  const f=await fixture(t,{language:'en'}),before=await f.session.read();
  f.click('[data-action="save-measurement"]');
  await until(()=>f.dom.window.document.querySelector('#measurement-label'),'measurement dialog opens');
  const dialog=f.find('#review-dialog'),heading=f.find('#dialog-title'),label=f.find('#measurement-label'),source=f.find('#measurement-source');
  assert.equal(dialog.open,true);assert.equal(heading.textContent,'Save current measurement');
  assert.equal(f.find('.dialog-source [data-i18n-skip]').textContent,'資料');
  label.value='匯入';source.value='設定';label.focus();label.setSelectionRange(1,2);
  f.click('#language-toggle');
  assert.equal(f.find('#review-dialog'),dialog);assert.equal(dialog.open,true);assert.equal(f.find('#dialog-title'),heading);
  assert.equal(heading.textContent,'保存目前測量');assert.equal(f.find('#measurement-label'),label);assert.equal(label.value,'匯入');assert.equal(source.value,'設定');
  assert.equal(f.dom.window.document.activeElement,label);assert.equal(label.selectionStart,1);assert.equal(label.selectionEnd,2);
  assert.equal(f.find('.dialog-source [data-i18n-skip]').textContent,'資料');
  f.click('#language-toggle');assert.equal(heading.textContent,'Save current measurement');assert.equal(label.value,'匯入');
  assert.deepEqual(await f.session.read(),before);assert.deepEqual(writes(f),[]);
});

test('cross-panel language updates relabel the current settings page without rendering or saving preferences or the case',async t=>{
  const f=await fixture(t,{language:'en'});
  f.click('[data-route="settings"]');
  const form=f.find('#settings-form'),surgeon=f.find('[name="defaultSurgeonName"]'),details=f.find('details.extra'),toggle=f.find('#language-toggle');
  details.open=true;surgeon.value='資料';surgeon.focus();surgeon.setSelectionRange(1,2);
  const before=await f.session.read();
  assert.equal(f.find('#tab-settings').textContent.trim(),'Settings');
  assert.equal(f.find('[name="ocrProvider"] option[value="local"]').textContent,'Local PaddleOCR');
  f.externalLanguage('zh-TW');
  assert.equal(f.dom.window.document.documentElement.lang,'zh-Hant');assert.equal(f.find('#tab-settings').textContent.trim(),'設定');
  assert.equal(f.find('#settings-form'),form);assert.equal(f.find('#language-toggle'),toggle);assert.equal(f.find('details.extra'),details);assert.equal(details.open,true);
  assert.equal(surgeon.value,'資料');assert.equal(f.dom.window.document.activeElement,surgeon);assert.equal(surgeon.selectionStart,1);assert.equal(surgeon.selectionEnd,2);
  f.externalLanguage('en');
  assert.equal(f.dom.window.document.documentElement.lang,'en');assert.equal(f.find('#tab-settings').textContent.trim(),'Settings');
  assert.equal(f.find('#settings-form'),form);assert.equal(surgeon.value,'資料');
  assert.deepEqual(f.calls,[]);assert.deepEqual(await f.session.read(),before);
});

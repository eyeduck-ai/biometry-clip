import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyCase } from '../src/model.js';
import { createSessionStore, SESSION_KEY } from '../src/session-store.js';
import { createLibraryStore,createLibraryService,LIBRARY_KEY } from '../src/library-store.js';
import { UI_LANGUAGE_KEY } from '../src/ui-language.js';

let imports = 0;
function mockLocation(t,href) {
  const previous=Object.getOwnPropertyDescriptor(globalThis,'location');
  Object.defineProperty(globalThis,'location',{configurable:true,writable:true,value:{href}});
  t.after(()=>previous?Object.defineProperty(globalThis,'location',previous):delete globalThis.location);
}
async function mockedPlatform(t, overrides = {}) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  const calls = [];
  const sessionValues={};
  const localValues={};
  const listeners=new Set();
  const event=()=>{const handlers=new Set();return {addListener:fn=>handlers.add(fn),removeListener:fn=>handlers.delete(fn),emit:(...args)=>Promise.all([...handlers].map(fn=>fn(...args))),get size(){return handlers.size;}};};
  const chrome = {
    runtime: { id: 'extension-under-test',getURL:path=>`chrome-extension://extension-under-test/${path}`,onMessage:event(),onInstalled:event() },
    action:{onClicked:event()},
    storage: {
      session: { get: async key => { calls.push(['session.get', key]); return structuredClone(sessionValues); }, set: async value => { calls.push(['session.set', value]);const old=structuredClone(sessionValues);Object.assign(sessionValues,structuredClone(value));const changes=Object.fromEntries(Object.entries(value).map(([key,newValue])=>[key,{oldValue:old[key],newValue:structuredClone(newValue)}]));for(const fn of listeners)fn(changes,'session'); },setAccessLevel:async value=>calls.push(['session.access',value]) },
      local: { get: async key => { calls.push(['local.get', key]); return structuredClone(localValues); }, set: async value => { calls.push(['local.set', value]);const old=structuredClone(localValues);Object.assign(localValues,structuredClone(value));const changes=Object.fromEntries(Object.entries(value).map(([key,newValue])=>[key,{oldValue:old[key],newValue:structuredClone(newValue)}]));for(const fn of listeners)fn(changes,'local'); },setAccessLevel:async value=>calls.push(['local.access',value]) },
      onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},
    },
    tabs: { get: async id => ({ id,active:true,windowId:7,url: 'https://calc.apacrs.org/barrett_universal2105/' }), query: async () => [], create: async arg => { calls.push(['tabs.create', arg]); return { id: 42, ...arg }; },captureVisibleTab: async (...args) => { calls.push(['capture', ...args]); return 'data:image/png;base64,TEST'; },sendMessage:async(...args)=>{calls.push(['tab.message',...args]);return {ok:true};},onActivated:event(),onUpdated:event(),onRemoved:event() },
    scripting: { executeScript: async arg => { calls.push(['execute', arg]); return [{ frameId: 0, result: { siteId: 'barrett-universal', rows: [{ key: 'al', status: 'ready', value: '24' }] } }]; } },
    permissions: { request: async arg => { calls.push(['permission', arg]); return true; } },
    ...overrides,
  };
  const store=createSessionStore(chrome.storage.session);
  const library=createLibraryService(createLibraryStore(chrome.storage.local),store);
  chrome.runtime.sendMessage=async message=>{
    calls.push(['runtime.message',message]);
    try {
      if(message.type.startsWith('biometry:library:')){
        const op=message.type.slice('biometry:library:'.length);let result;
        if(op==='read')result=await library.read();
        if(op==='create-patient')result=await library.createPatient(message.patient,message.expectedLibraryRevision);
        if(op==='update-patient')result=await library.updatePatient(message.patientId,message.patient,message.expectedLibraryRevision);
        if(op==='save-measurement')result=await library.saveMeasurement(message.options);
        if(op==='activate-patient')result=await library.activatePatient(message.patientId,message.caseToken,message.revision,message.clientId);
        if(op==='select-measurement')result=await library.selectMeasurement(message.patientId,message.measurementId,message.caseToken,message.revision,message.clientId);
        return {ok:true,result};
      }
      const operation=message.type.slice('biometry:session:'.length);let session;
      if(operation==='read')session=await store.read();
      if(operation==='patch')session=await store.patch(message.patch,message.caseToken,message.clientId);
      if(operation==='clear')session=await store.clear(message.caseToken,message.clientId);
      if(operation==='replace')session=await store.replace(message.data,message.caseToken,message.revision,message.clientId);
      return {ok:true,session};
    }catch(error){return {ok:false,code:error.code,error:error.message};}
  };
  Object.defineProperty(globalThis, 'chrome', { configurable: true, writable: true, value: chrome });
  t.after(() => previous ? Object.defineProperty(globalThis, 'chrome', previous) : delete globalThis.chrome);
  return { api: await import(`../src/platform.js?platform-test=${imports++}`), chrome, calls };
}

test('case data uses guarded background messaging and session storage; credentials stay local', async t => {
  const { api, calls } = await mockedPlatform(t);
  const initial=await api.loadData();calls.length=0;
  const data = emptyCase();
  data.patient.patientId = 'LOCAL-CASE';
  await api.saveCase(data,{caseToken:initial.caseToken,revision:initial.revision});
  await api.saveSettings({ geminiApiKey: 'TEST-KEY', ocrProvider: 'gemini' });
  assert.deepEqual(calls.map(call => call[0]), ['runtime.message','session.set','local.set']);
  assert.equal(calls[0][1].type,'biometry:session:replace');
  assert.deepEqual(calls[1][1].biometryCase,data);
  assert.deepEqual(calls[2][1], { settings: { geminiApiKey: 'TEST-KEY', ocrProvider: 'gemini' } });
  assert.ok(!JSON.stringify(calls[2]).includes('LOCAL-CASE'));
});

test('loading data combines local settings defaults with the session case', async t => {
  const { api, chrome } = await mockedPlatform(t);
  const data = emptyCase();
  data.eyes.OS.al = '24';
  chrome.storage.session.get = async () => ({ biometryCase: data });
  chrome.storage.local.get = async () => ({ settings: { localModel: 'small' } });
  const loaded = await api.loadData();
  assert.deepEqual(loaded.data, data);
  assert.equal(loaded.settings.localModel, 'small');
  assert.equal(loaded.settings.ocrProvider, 'local');
});

test('interface language defaults to English and persists independently of settings and patient stores',async t=>{
  const {api,chrome,calls}=await mockedPlatform(t);
  assert.equal(await api.loadLanguage(),'en');
  await chrome.storage.local.set({settings:{geminiApiKey:'TEST-KEY'},[LIBRARY_KEY]:{sentinel:'SYNTHETIC-LIBRARY'}});calls.length=0;
  assert.equal(await api.saveLanguage('zh-TW'),'zh-TW');assert.equal(await api.loadLanguage(),'zh-TW');
  assert.deepEqual(calls.filter(call=>call[0]==='local.set'),[['local.set',{[UI_LANGUAGE_KEY]:'zh-TW'}]]);
  const stored=await chrome.storage.local.get(null);
  assert.deepEqual(stored.settings,{geminiApiKey:'TEST-KEY'});assert.deepEqual(stored[LIBRARY_KEY],{sentinel:'SYNTHETIC-LIBRARY'});
  assert.ok(!calls.some(call=>call[0].startsWith('session.')||call[0]==='runtime.message'));
  await assert.rejects(api.saveLanguage('zh-CN'),/Unsupported interface language/);
});

test('language subscriptions ignore patient/settings changes and stop cleanly',async t=>{
  const {api,chrome}=await mockedPlatform(t);const observed=[],stop=api.subscribeLanguage(value=>observed.push(value));
  await chrome.storage.local.set({settings:{localModel:'tiny'}});await chrome.storage.session.set({[UI_LANGUAGE_KEY]:'zh-TW'});
  assert.deepEqual(observed,[]);await api.saveLanguage('zh-TW');await api.saveLanguage('en');
  assert.deepEqual(observed,['zh-TW','en']);stop();await api.saveLanguage('zh-TW');assert.deepEqual(observed,['zh-TW','en']);
});

test('preview language uses only a locale localStorage key and notifies same-page listeners',async t=>{
  const previousChrome=Object.getOwnPropertyDescriptor(globalThis,'chrome'),previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  delete globalThis.chrome;const values=new Map(),writes=[];
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>values.get(key)??null,setItem:(key,value)=>{writes.push([key,value]);values.set(key,value);}}});
  t.after(()=>{previousChrome?Object.defineProperty(globalThis,'chrome',previousChrome):delete globalThis.chrome;previousStorage?Object.defineProperty(globalThis,'localStorage',previousStorage):delete globalThis.localStorage;});
  const api=await import(`../src/platform.js?locale-preview=${imports++}`),observed=[],stop=api.subscribeLanguage(value=>observed.push(value));
  assert.equal(await api.loadLanguage(),'en');await api.saveLanguage('zh-TW');assert.equal(await api.loadLanguage(),'zh-TW');
  assert.deepEqual(writes,[[UI_LANGUAGE_KEY,'zh-TW']]);assert.deepEqual(observed,['zh-TW']);stop();await api.saveLanguage('en');assert.deepEqual(observed,['zh-TW']);
  const reloaded=await import(`../src/platform.js?locale-preview-reload=${imports++}`);assert.equal(await reloaded.loadLanguage(),'en');
});

test('preview targets only the verified top document and apply stays pinned to its frame', async t => {
  const { api, calls } = await mockedPlatform(t);
  const data = emptyCase();
  const preview = await api.inspectTab('42', data, { eye: 'OD' });
  assert.deepEqual(calls.find(call => call[0] === 'execute')[1].target, { tabId: 42, frameIds:[0] });
  assert.ok(!Object.hasOwn(calls.find(call=>call[0]==='execute')[1].target,'allFrames'));
  calls.length = 0;
  await api.inspectTab(42, data, { eye: 'OD', expected: preview.rows, expectedSiteId:'barrett-universal', expectedUrl:'https://calc.apacrs.org/barrett_universal2105/' }, 'apply', 7);
  const execute = calls.find(call => call[0] === 'execute')[1];
  assert.deepEqual(execute.target, { tabId: 42, frameIds: [7] });
  assert.equal(execute.args[0], 'apply');
});

test('multiple form frames make preview ambiguous before any fill call', async t => {
  const { api, chrome } = await mockedPlatform(t);
  const actions = [];
  chrome.scripting.executeScript = async arg => { actions.push(arg.args[0]); return [0, 2].map(frameId => ({ frameId, result: { rows: [{ key: 'al', status: 'ready' }] } })); };
  await assert.rejects(api.inspectTab(42, emptyCase(), {}), /多個/);
  assert.deepEqual(actions, ['preview']);
});

test('apply rejects a calculator navigation since preview before executing any script', async t => {
  const { api, chrome, calls } = await mockedPlatform(t);
  const data = emptyCase();
  const preview = await api.inspectTab(42, data, {});
  chrome.tabs.get = async id => ({ id, url: 'https://calc.apacrs.org/Barrett_True_K_Universal_2105/' });
  calls.length = 0;
  await assert.rejects(api.inspectTab(42, data, { expected: preview.rows, expectedSiteId: preview.siteId, expectedUrl: 'https://calc.apacrs.org/barrett_universal2105/' }, 'apply', preview.frameId));
  assert.ok(!calls.some(call => call[0] === 'execute'));
});

test('unsupported pages are rejected without executing the injected bridge', async t => {
  const { api, chrome, calls } = await mockedPlatform(t);
  chrome.tabs.get = async id => ({ id, url: 'https://unknown.example/' });
  await assert.rejects(api.inspectTab(42, emptyCase(), {}), /支援/);
  assert.ok(!calls.some(call => call[0] === 'execute'));
});

test('tab discovery excludes lookalike path prefixes and untrusted hosts', async t => {
  const { api, chrome } = await mockedPlatform(t);
  chrome.tabs.query = async () => [
    { id: 1, url: 'https://iolsolver.com/regular' },
    { id: 2, url: 'https://iolsolver.com/regularly' },
    { id: 3, url: 'https://iolsolver.com.attacker.example/regular' },
    { id: 4, url: 'https://www.evoiolcalculator.com/Calculator.aspx-copy' },
  ];
  assert.deepEqual((await api.siteTabs()).map(tab => tab.id), [1]);
});

test('a nonmatching child-frame error does not mask a valid frame reporting missing fields', async t => {
  const { api, chrome } = await mockedPlatform(t);
  chrome.scripting.executeScript = async () => [
    { frameId: 0, result: { rows: [{ key: 'al', status: 'missing' }] } },
    { frameId: 5, result: { rows: [], error: 'unrelated iframe URL' } },
  ];
  const result = await api.inspectTab(42, emptyCase(), {});
  assert.equal(result.frameId, 0);
  assert.equal(result.rows[0].status, 'missing');
});

test('local OCR asks for no cloud permission while cloud OCR requests its chosen origin', async t => {
  const { api, calls } = await mockedPlatform(t);
  await api.requestCloudPermission({ ocrProvider: 'local' });
  assert.deepEqual(calls, []);
  await api.requestCloudPermission({ ocrProvider: 'gemini' });
  assert.deepEqual(calls[0], ['permission', { origins: ['https://generativelanguage.googleapis.com/*'] }]);
  calls.length = 0;
  await api.requestCloudPermission({ ocrProvider: 'paddle-api', paddleApiUrl: 'http://localhost:8080/ocr' });
  assert.deepEqual(calls[0], ['permission', { origins: ['http://localhost:8080/*'] }]);
});

test('cloud endpoint validation rejects credentials and insecure remote HTTP before permission requests', async t => {
  const { api, calls } = await mockedPlatform(t);
  for (const [paddleApiUrl,error] of [['http://example.com/ocr',/HTTPS/], ['https://user:secret@example.com/ocr',/帳號密碼/], ['file:///report.pdf',/HTTPS/]]) {
    await assert.rejects(api.requestCloudPermission({ ocrProvider: 'paddle-api', paddleApiUrl }), error);
  }
  assert.deepEqual(calls, []);
});

test('field patches notify subscribers with their source and unsubscribe cleanly', async t=>{
  const {api,chrome}=await mockedPlatform(t);const initial=await api.loadData();const seen=[];const stop=api.subscribeCase(record=>seen.push(record));
  const patched=await api.patchCase({eyes:{OD:{al:'23.45'}}},initial.caseToken);
  assert.equal(seen.length,1);assert.equal(seen[0].isOwnChange,true);assert.equal(seen[0].revision,patched.revision);assert.equal(seen[0].data.eyes.OD.al,'23.45');
  await chrome.storage.session.set({[SESSION_KEY]:{...patched,revision:patched.revision+1,lastWriter:'different-panel'}});
  assert.equal(seen.length,2);assert.equal(seen[1].isOwnChange,false);
  stop();await api.patchCase({eyes:{OS:{al:'24'}}},initial.caseToken);assert.equal(seen.length,2);
});

test('clear rotates the generation and surfaces stale-panel conflicts to the UI', async t=>{
  const {api}=await mockedPlatform(t);const initial=await api.loadData();await api.patchCase({eyes:{OD:{al:'24'}}},initial.caseToken);
  const cleared=await api.clearCase(initial.caseToken);assert.notEqual(cleared.caseToken,initial.caseToken);assert.deepEqual(cleared.data,emptyCase());
  await assert.rejects(api.patchCase({eyes:{OS:{al:'25'}}},initial.caseToken),{code:'CASE_CHANGED'});
});

test('floating tab IDs are parsed exactly and website launch expands a top-frame overlay', async t=>{
  const {api,calls}=await mockedPlatform(t);
  assert.equal(api.getFloatingTabId('chrome-extension://test/index.html?view=floating&tabId=42'),42);
  for(const value of ['-1','NaN','42oops','9007199254740992',''])assert.equal(api.getFloatingTabId(`https://preview.test/?tabId=${value}`),undefined);
  await api.showFloating(42);assert.deepEqual(calls.find(call=>call[0]==='execute')[1],{target:{tabId:42},files:['floating.js']});
  assert.deepEqual(calls.find(call=>call[0]==='tab.message').slice(1),[42,{type:'biometry:show-floating',tabId:42},{frameId:0}]);
});

test('newly opened calculators receive their overlay only after the final document loads', async t=>{
  const {api,chrome,calls}=await mockedPlatform(t);let status='loading';
  chrome.tabs.get=async id=>({id,status,url:'https://iolsolver.com/regular'});
  const opened=api.showFloating(42);await new Promise(setImmediate);
  assert.ok(!calls.some(call=>call[0]==='execute'));assert.equal(chrome.tabs.onUpdated.size,1);
  status='complete';await chrome.tabs.onUpdated.emit(42,{status},{id:42,status,url:'https://iolsolver.com/regular'});await opened;
  assert.equal(calls.filter(call=>call[0]==='execute').length,1);assert.equal(chrome.tabs.onUpdated.size,0);assert.equal(chrome.tabs.onRemoved.size,0);
});

test('a completed navigation race is detected after the readiness listener is installed', async t=>{
  const {api,chrome,calls}=await mockedPlatform(t);let reads=0;
  chrome.tabs.get=async id=>({id,status:++reads===1?'loading':'complete',url:'https://iolsolver.com/regular'});
  await api.showFloating(42);assert.equal(calls.filter(call=>call[0]==='execute').length,1);assert.equal(chrome.tabs.onUpdated.size,0);
});

test('a calculator redirecting to an unsupported page never receives the overlay', async t=>{
  const {api,chrome,calls}=await mockedPlatform(t);chrome.tabs.get=async id=>({id,status:'loading',url:'https://iolsolver.com/regular'});
  const opened=api.showFloating(42);await new Promise(setImmediate);
  await chrome.tabs.onUpdated.emit(42,{status:'complete'},{id:42,status:'complete',url:'https://example.com/login'});
  await assert.rejects(opened,/導向/);assert.ok(!calls.some(call=>call[0]==='execute'));assert.equal(chrome.tabs.onUpdated.size,0);
});

test('loading timeout and closed tabs release listeners and leave a clear retry path', async t=>{
  const {api,chrome,calls}=await mockedPlatform(t);chrome.tabs.get=async id=>({id,status:'loading',url:'https://iolsolver.com/regular'});
  await assert.rejects(api.showFloating(42,{timeoutMs:15}),/仍在載入/);assert.equal(chrome.tabs.onUpdated.size,0);
  const opened=api.showFloating(42);await new Promise(setImmediate);await chrome.tabs.onRemoved.emit(42);
  await assert.rejects(opened,/已關閉/);assert.equal(chrome.tabs.onRemoved.size,0);assert.ok(!calls.some(call=>call[0]==='execute'));
});

test('screenshots hide and restore the overlay and use the target window', async t=>{
  const {api,calls}=await mockedPlatform(t);assert.equal(await api.captureTab(42),'data:image/png;base64,TEST');
  assert.deepEqual(calls.filter(call=>call[0]==='tab.message').map(call=>call[2].type),['biometry:hide-floating','biometry:restore-floating']);
  assert.deepEqual(calls.find(call=>call[0]==='capture').slice(1),[7,{format:'png'}]);
});

test('a failed screenshot still restores the existing overlay', async t=>{
  const {api,chrome,calls}=await mockedPlatform(t);chrome.tabs.captureVisibleTab=async()=>{throw new Error('permission');};
  await assert.rejects(api.captureTab(42),/擴充功能圖示/);
  assert.equal(calls.filter(call=>call[0]==='tab.message').at(-1)[2].type,'biometry:restore-floating');
});

test('inactive targets cannot accidentally capture a different active tab', async t=>{
  const {api,chrome,calls}=await mockedPlatform(t);chrome.tabs.get=async id=>({id,active:false,url:'https://iolsolver.com/regular'});
  await assert.rejects(api.captureTab(42),/先切換/);assert.ok(!calls.some(call=>call[0]==='capture'));
});

test('tab-change subscriptions are removed when a floating UI is disposed', async t=>{
  const {api,chrome}=await mockedPlatform(t);let calls=0;const stop=api.subscribeTabs(()=>calls++);
  await chrome.tabs.onUpdated.emit(42);assert.equal(calls,1);stop();await chrome.tabs.onActivated.emit({tabId:42});assert.equal(calls,1);assert.equal(chrome.tabs.onRemoved.size,0);
});

test('tab subscriptions skip noisy metadata but preserve navigation, loading, labels and tab lifecycle events',async t=>{
  const {api,chrome}=await mockedPlatform(t),calls=[],stop=api.subscribeTabs((...args)=>calls.push(args));
  const tab={id:42,url:'https://iolsolver.com/regular'};
  for(const changes of [{favIconUrl:'https://iolsolver.com/favicon.ico'},{audible:true},{mutedInfo:{muted:true}},{pinned:true},{groupId:2},{}])await chrome.tabs.onUpdated.emit(42,changes,tab);
  assert.equal(calls.length,0,'background metadata must not trigger panel queries or DOM inspection');
  for(const changes of [{status:'loading'},{status:'complete',favIconUrl:'icon.ico'},{title:'Calculator'},{url:'https://example.com/'}])await chrome.tabs.onUpdated.emit(42,changes,tab);
  assert.equal(calls.length,4,'navigation away must still remove a target from supported tabs');
  assert.deepEqual(calls[0],[42,{status:'loading'},tab]);
  await chrome.tabs.onActivated.emit({tabId:42});await chrome.tabs.onRemoved.emit(42,{windowId:1,isWindowClosing:false});assert.equal(calls.length,6);
  stop();assert.equal(chrome.tabs.onUpdated.size,0);assert.equal(chrome.tabs.onActivated.size,0);assert.equal(chrome.tabs.onRemoved.size,0);
  await chrome.tabs.onUpdated.emit(42,{status:'complete'},tab);assert.equal(calls.length,6);
});

test('toolbar action toggles a supported calculator and opens categorized launcher elsewhere', async t=>{
  const {chrome,calls}=await mockedPlatform(t);await import(`../src/background.js?background-test=${imports++}`);calls.length=0;
  await chrome.action.onClicked.emit({id:42,url:'https://iolsolver.com/regular'});
  assert.deepEqual(calls.find(call=>call[0]==='execute')[1],{target:{tabId:42},files:['floating.js']});
  assert.equal(calls.find(call=>call[0]==='tab.message')[2].type,'biometry:toggle-floating');calls.length=0;
  await chrome.action.onClicked.emit({id:43,url:'https://example.com/'});
  assert.equal(calls.find(call=>call[0]==='tabs.create')[1].url,'chrome-extension://extension-under-test/index.html?view=launcher');assert.ok(!calls.some(call=>call[0]==='execute'));
});

test('background session endpoint rejects website content senders before reading patient data', async t=>{
  const {chrome,calls}=await mockedPlatform(t);await import(`../src/background.js?background-test=${imports++}`);calls.length=0;
  const denied=await new Promise(resolve=>chrome.runtime.onMessage.emit({type:'biometry:session:read'},{id:chrome.runtime.id,url:'https://iolsolver.com/regular'},resolve));
  assert.equal(denied.ok,false);assert.equal(denied.code,'UNTRUSTED_SENDER');assert.ok(!calls.some(call=>call[0]==='session.get'));
  const allowed=await new Promise(resolve=>chrome.runtime.onMessage.emit({type:'biometry:session:read'},{id:chrome.runtime.id,url:'chrome-extension://extension-under-test/index.html?view=floating&tabId=42'},resolve));
  assert.equal(allowed.ok,true);assert.deepEqual(allowed.session.data,emptyCase());
});

test('background locale relay permits supported top-frame shells and shares only the language',async t=>{
  const {chrome,calls}=await mockedPlatform(t);await import(`../src/background.js?locale-relay=${imports++}`);
  const url='https://calc.apacrs.org/barrett_universal2105/',source={id:chrome.runtime.id,url,frameId:0,tab:{id:42,url}};
  await chrome.storage.local.set({settings:{geminiApiKey:'PRIVATE-KEY'},[LIBRARY_KEY]:{sentinel:'PRIVATE-LIBRARY'}});calls.length=0;
  const request=message=>new Promise(resolve=>chrome.runtime.onMessage.emit(message,source,resolve));
  assert.deepEqual(await request({type:'biometry:ui-language:get'}),{ok:true,language:'en'});
  assert.deepEqual(await request({type:'biometry:ui-language:set',language:'zh-TW',settings:{geminiApiKey:'IGNORED'}}),{ok:true,language:'zh-TW'});
  assert.deepEqual(await request({type:'biometry:ui-language:get'}),{ok:true,language:'zh-TW'});
  assert.deepEqual(calls.filter(call=>call[0]==='local.set'),[['local.set',{[UI_LANGUAGE_KEY]:'zh-TW'}]]);
  assert.ok(!calls.some(call=>call[0]==='session.get'));assert.ok(!JSON.stringify(calls).includes('PRIVATE'));
});

test('background locale relay rejects forged, child-frame, unsupported and navigated senders',async t=>{
  const {chrome,calls}=await mockedPlatform(t);await import(`../src/background.js?locale-relay-denials=${imports++}`);
  const url='https://calc.apacrs.org/barrett_universal2105/',source={id:chrome.runtime.id,url,frameId:0,tab:{id:42,url}};calls.length=0;
  for(const invalid of [{...source,id:'other-extension'},{...source,frameId:4},{...source,url:'https://evil.example/'},{...source,tab:{id:42,url:'https://iolsolver.com/regular'}},{...source,url:'https://calc.apacrs.org/Barrett_True_K_Universal_2105/',tab:{id:42,url:'https://calc.apacrs.org/Barrett_True_K_Universal_2105/'}}]){
    const response=await new Promise(resolve=>chrome.runtime.onMessage.emit({type:'biometry:ui-language:get'},invalid,resolve));
    assert.equal(response.ok,false);assert.equal(response.code,'INVALID_UI_LANGUAGE_REQUEST');
  }
  const response=await new Promise(resolve=>chrome.runtime.onMessage.emit({type:'biometry:ui-language:set',language:'anything'},source,resolve));
  assert.equal(response.ok,false);assert.ok(!calls.some(call=>call[0]==='local.get'||call[0]==='local.set'||call[0]==='session.get'));
});

test('language storage changes broadcast locale only to supported top-frame shells',async t=>{
  const {chrome,calls}=await mockedPlatform(t);await import(`../src/background.js?locale-broadcast=${imports++}`);
  chrome.tabs.query=async()=>[{id:42,url:'https://iolsolver.com/regular'},{id:43,url:'https://unknown.example/'},{id:44,url:'https://iolsolver.com/regularly'}];calls.length=0;
  await chrome.storage.local.set({[UI_LANGUAGE_KEY]:'zh-TW'});await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls.filter(call=>call[0]==='tab.message'),[['tab.message',42,{type:'biometry:ui-language:changed',language:'zh-TW'},{frameId:0}]]);
  calls.length=0;await chrome.storage.local.set({settings:{localModel:'tiny'}});await new Promise(resolve=>setImmediate(resolve));assert.ok(!calls.some(call=>call[0]==='tab.message'));
});

test('patient library APIs persist snapshots separately and selecting one notifies active-session subscribers',async t=>{
  const {api,calls}=await mockedPlatform(t);const current=await api.loadData();
  const patched=await api.patchCase({patient:{patientId:'SYNTHETIC-A',age:'60'},eyes:{OD:{al:'23.45'},OS:{al:'24.10'}}},current.caseToken);
  const events=[],records=[],stopLibrary=api.subscribeLibrary(record=>events.push(record)),stopCase=api.subscribeCase(record=>records.push(record));
  const {patient}=await api.createPatient(patched.data.patient);
  const saved=await api.saveMeasurement({patientId:patient.id,label:'First',caseToken:patched.caseToken,revision:patched.revision,data:patched.data});
  assert.equal(events.length,2);assert.equal(saved.measurement.eyes.OS.al,'24.10');
  assert.ok(calls.some(call=>call[0]==='local.set'&&call[1][LIBRARY_KEY]));
  const selected=await api.selectMeasurement(patient.id,saved.measurement.id,patched.caseToken,patched.revision);
  assert.notEqual(selected.caseToken,patched.caseToken);assert.equal(records.at(-1).selection.measurementId,saved.measurement.id);
  const edited=await api.patchCase({eyes:{OD:{al:'25'}}},selected.caseToken);
  assert.equal((await api.loadLibrary()).patients[0].measurements[0].eyes.OD.al,'23.45');
  const fresh=await api.activatePatient(patient.id,edited.caseToken,edited.revision);assert.deepEqual(fresh.data.eyes,{OD:{},OS:{}});
  const count=events.length;stopLibrary();stopCase();await api.createPatient({patientId:'SYNTHETIC-B'});assert.equal(events.length,count);
});

test('library background endpoints reject webpage senders and accept only the packaged panel',async t=>{
  const {chrome,calls}=await mockedPlatform(t);await import(`../src/background.js?background-library-test=${imports++}`);calls.length=0;
  const denied=await new Promise(resolve=>chrome.runtime.onMessage.emit({type:'biometry:library:read'},{id:chrome.runtime.id,url:'https://iolsolver.com/regular'},resolve));
  assert.equal(denied.code,'UNTRUSTED_SENDER');assert.ok(!calls.some(call=>call[0]==='local.get'));
  const allowed=await new Promise(resolve=>chrome.runtime.onMessage.emit({type:'biometry:library:read'},{id:chrome.runtime.id,url:'chrome-extension://extension-under-test/index.html?view=floating&tabId=42'},resolve));
  assert.equal(allowed.ok,true);assert.deepEqual(allowed.result.patients,[]);
});

test('floating panel status reports contain only a phase and never read patient stores',async t=>{
  const {api,chrome,calls}=await mockedPlatform(t);
  const token='8d552fd0-5bb6-4857-a5d7-d31413725b21';
  mockLocation(t,`chrome-extension://${chrome.runtime.id}/index.html?view=floating&tabId=42&panelToken=${token}&patientId=PRIVATE`);
  chrome.runtime.sendMessage=async message=>{calls.push(['runtime.message',message]);return {ok:true};};
  for(const phase of ['starting','ready','error'])assert.deepEqual(await api.reportPanelStatus(phase),{ok:true});
  assert.deepEqual(calls,[...['starting','ready','error'].map(phase=>['runtime.message',{type:'biometry:panel-status',phase}])]);
  assert.ok(!JSON.stringify(calls).includes('PRIVATE'));assert.ok(!JSON.stringify(calls).includes(token));
});

test('standalone, non-extension and invalid-phase reporters do not send status messages',async t=>{
  const {api,chrome,calls}=await mockedPlatform(t);
  const valid=`chrome-extension://${chrome.runtime.id}/index.html?view=floating&tabId=42&panelToken=abcdefghijklmnop`;
  mockLocation(t,valid);await api.reportPanelStatus('patient-data');assert.deepEqual(calls,[]);
  for(const href of [valid.replace('view=floating','view=launcher'),valid.replace('&panelToken=abcdefghijklmnop',''),'https://iolsolver.com/regular']){globalThis.location.href=href;await api.reportPanelStatus('ready');}
  assert.deepEqual(calls,[]);
  const previous=chrome.runtime.id;delete chrome.runtime.id;
  const previewApi=await import(`../src/platform.js?platform-preview-status=${imports++}`);
  globalThis.location.href=valid;await previewApi.reportPanelStatus('ready');chrome.runtime.id=previous;assert.deepEqual(calls,[]);
});

test('status transport failures are generic and cannot interrupt the panel startup',async t=>{
  const {api,chrome}=await mockedPlatform(t);mockLocation(t,`chrome-extension://${chrome.runtime.id}/index.html?view=floating&tabId=42&panelToken=abcdefghijklmnop`);
  chrome.runtime.sendMessage=async()=>{throw new Error('PRIVATE PATIENT FAILURE TEXT');};
  assert.deepEqual(await api.reportPanelStatus('error'),{ok:false,code:'PANEL_UNAVAILABLE'});
});

test('background forwards only trusted floating readiness metadata without accessing patient stores',async t=>{
  const {chrome,calls}=await mockedPlatform(t);await import(`../src/background.js?background-status-test=${imports++}`);calls.length=0;
  const panelToken='c2ca1956-c749-4937-92f7-b23b7b1c71c4';
  const source={id:chrome.runtime.id,url:`chrome-extension://${chrome.runtime.id}/index.html?view=floating&tabId=42&panelToken=${panelToken}`,frameId:5,tab:{id:42,title:'PRIVATE PATIENT TITLE'}};
  const response=await new Promise(resolve=>chrome.runtime.onMessage.emit({type:'biometry:panel-status',phase:'ready',tabId:999,panelToken:'FORGED',patient:{name:'PRIVATE'}},source,resolve));
  assert.deepEqual(response,{ok:true});assert.deepEqual(calls,[['tab.message',42,{type:'biometry:panel-status',phase:'ready',panelToken,tabId:42},{frameId:0}]]);
  assert.ok(!JSON.stringify(calls).includes('PRIVATE'));assert.ok(!JSON.stringify(calls).includes('FORGED'));
});

test('background rejects invalid panel senders and phases without relay or patient-store access',async t=>{
  const {chrome,calls}=await mockedPlatform(t);await import(`../src/background.js?background-status-reject=${imports++}`);calls.length=0;
  const source={id:chrome.runtime.id,url:`chrome-extension://${chrome.runtime.id}/index.html?view=floating&tabId=42&panelToken=abcdefghijklmnop`,frameId:5,tab:{id:42}};
  for(const invalid of [{...source,url:'https://iolsolver.com/regular'},{...source,frameId:0},{...source,tab:{id:43}},{...source,url:source.url.replace('abcdefghijklmnop','short')},{...source,url:source.url.replace('view=floating','view=launcher')}]){
    const response=await new Promise(resolve=>chrome.runtime.onMessage.emit({type:'biometry:panel-status',phase:'ready'},invalid,resolve));assert.equal(response.ok,false);assert.equal(response.code,'INVALID_PANEL_STATUS');
  }
  const response=await new Promise(resolve=>chrome.runtime.onMessage.emit({type:'biometry:panel-status',phase:'patient-data'},source,resolve));assert.equal(response.code,'INVALID_PANEL_STATUS');assert.deepEqual(calls,[]);
});

test('background status relay failures and stale responses return generic metadata-only errors',async t=>{
  const {chrome,calls}=await mockedPlatform(t);await import(`../src/background.js?background-status-unavailable=${imports++}`);calls.length=0;
  const source={id:chrome.runtime.id,url:`chrome-extension://${chrome.runtime.id}/index.html?view=floating&tabId=42&panelToken=abcdefghijklmnop`,frameId:5,tab:{id:42}};
  chrome.tabs.sendMessage=async()=>{throw new Error('PRIVATE FAILURE');};
  const unavailable=await new Promise(resolve=>chrome.runtime.onMessage.emit({type:'biometry:panel-status',phase:'error'},source,resolve));assert.deepEqual(unavailable,{ok:false,code:'PANEL_UNAVAILABLE'});
  chrome.tabs.sendMessage=async()=>({ok:false,ignored:true,patient:'PRIVATE'});
  const stale=await new Promise(resolve=>chrome.runtime.onMessage.emit({type:'biometry:panel-status',phase:'ready'},source,resolve));assert.deepEqual(stale,{ok:false,code:'PANEL_NOT_CURRENT'});assert.deepEqual(calls,[]);
});

test('one-click transfer sends the exact saved-case guard and explicit preferences to the service worker',async t=>{
  const {api,chrome}=await mockedPlatform(t);const loaded=await api.loadData(),messages=[];
  chrome.runtime.sendMessage=async message=>{messages.push(message);return {ok:true,result:{rows:[{status:'filled'}]}};};
  const result=await api.quickFillTab('42',loaded.data,{eye:'OU',includeConstants:false,evoCctUnit:'um'});
  assert.equal(result.rows[0].status,'filled');assert.equal(messages[0].type,'biometry:quick-fill');assert.equal(messages[0].tabId,42);
  assert.equal(messages[0].options.caseToken,loaded.caseToken);assert.equal(messages[0].options.revision,loaded.revision);assert.equal(messages[0].options.includeConstants,false);assert.equal(messages[0].options.evoCctUnit,'um');
  await api.prepareEye(42,loaded.data,{eye:'OS'});assert.equal(messages[1].type,'biometry:prepare-eye');assert.equal(messages[1].data,undefined);
  await api.prepareDisplayPreferences(42,loaded.data,{eye:'OS',cylinderConvention:'minus'});assert.equal(messages[2].type,'biometry:prepare-display');assert.equal(messages[2].options.cylinderConvention,'minus');assert.equal(messages[2].data,undefined);
});

test('background quick transfer rejects webpage and QA senders before reading the clinical session',async t=>{
  const {chrome,calls}=await mockedPlatform(t);await import(`../src/background.js?transfer-guard=${imports++}`);
  calls.length=0;
  const responseFor=sender=>new Promise(resolve=>chrome.runtime.onMessage.emit({type:'biometry:quick-fill',tabId:42,options:{eye:'OD'}},sender,resolve));
  const webpage=await responseFor({id:chrome.runtime.id,url:'https://calc.apacrs.org/barrett_universal2105/'});assert.equal(webpage.code,'UNTRUSTED_SENDER');
  const qa=await responseFor({id:chrome.runtime.id,url:`chrome-extension://${chrome.runtime.id}/index.html?view=qa`});assert.equal(qa.code,'QA_ISOLATION_REQUIRED');
  const wrongTab=await responseFor({id:chrome.runtime.id,url:`chrome-extension://${chrome.runtime.id}/index.html?view=floating&tabId=43`});assert.equal(wrongTab.code,'TARGET_CHANGED');
  assert.equal(calls.some(call=>call[0].endsWith('.get')||call[0]==='execute'),false);
});

test('display preference preparation is guarded and never reads the clinical case',async t=>{
  const {api,chrome,calls}=await mockedPlatform(t);assert.equal(api.defaultSettings.cylinderConvention,'minus');await import(`../src/background.js?display-guard=${imports++}`);calls.length=0;
  const request=sender=>new Promise(resolve=>chrome.runtime.onMessage.emit({type:'biometry:prepare-display',tabId:42,options:{eye:'OD',cylinderConvention:'minus'}},sender,resolve));
  assert.equal((await request({id:chrome.runtime.id,url:'https://calc.apacrs.org/barrett_universal2105/'})).code,'UNTRUSTED_SENDER');
  assert.equal((await request({id:chrome.runtime.id,url:`chrome-extension://${chrome.runtime.id}/index.html?view=floating&tabId=43`})).code,'TARGET_CHANGED');
  assert.equal(calls.length,0);
  const allowed=await request({id:chrome.runtime.id,url:`chrome-extension://${chrome.runtime.id}/index.html?view=qa`});assert.equal(allowed.ok,true);assert.equal(allowed.result.displayPreference.status,'unsupported');
  assert.equal(calls.some(call=>['session.get','local.get','session.set','local.set'].includes(call[0])),false);assert.equal(calls.filter(call=>call[0]==='execute').length,1);
});

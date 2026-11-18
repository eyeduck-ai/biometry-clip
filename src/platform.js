import {DEFAULT_GEMINI_MODEL,DEFAULT_PADDLE_MODEL,cloudPermissionOrigins,migrateCloudSettings} from './ocr/cloud-config.js';
import {DEFAULT_TRANSFER_SETTINGS,transferSettings} from './transfer-defaults.js';
import {buildLensReadRows,exportLensCatalogDocument,parseLensCatalogDocument} from './lens-catalog.js';
import {LENS_DEFINITIONS,DEFAULT_LENS_CATALOG,mergeLensCatalog} from './lens-registry.js';
import {lensTransferBridge,createLensTransfer} from './lens-transfer.js';
import { matchSite } from './sites.js';
import { siteBridge } from './bridge.js';
import { createSessionStore, SESSION_KEY } from './session-store.js';
import { waitForSupportedTab } from './tab-ready.js';
import { createLibraryStore,createLibraryService,LIBRARY_KEY } from './library-store.js';
import {UI_LANGUAGE_KEY,normalizeUiLanguage,isUiLanguage} from './ui-language.js';
export { reportPanelStatus } from './panel-status.js';
export const isExtension = !!globalThis.chrome?.runtime?.id;
export const defaultSettings = {ocrProvider:'local',localModel:'small',geminiApiKey:'',geminiModel:DEFAULT_GEMINI_MODEL,paddleApiMode:'official',paddleApiModel:DEFAULT_PADDLE_MODEL,paddleApiUrl:'',paddleApiToken:'',cylinderConvention:'minus',...DEFAULT_TRANSFER_SETTINGS};
const clientId = crypto.randomUUID();
let knownSession;
const previewListeners = new Set();
const previewValues = {};
const previewLibraryListeners = new Set();
const previewLocalValues = {};
const previewStore = createSessionStore({
  get: async () => structuredClone(previewValues),
  set: async values => { Object.assign(previewValues, structuredClone(values)); },
});
const previewLibrary = createLibraryService(createLibraryStore({
  get:async()=>structuredClone(previewLocalValues),
  set:async values=>{Object.assign(previewLocalValues,structuredClone(values));if(values[LIBRARY_KEY])for(const callback of previewLibraryListeners)callback(structuredClone(values[LIBRARY_KEY]));},
}),previewStore);
function acceptSession(session) {
  if (!session || !session.data || typeof session.caseToken !== 'string' || !Number.isSafeInteger(session.revision)) throw new Error('個案暫存回應格式不正確。');
  if (!knownSession || session.revision >= knownSession.revision) knownSession = session;
  return session;
}
async function sessionMessage(operation, payload = {}) {
  if (!isExtension) {
    let session;
    if (operation === 'read') session = await previewStore.read();
    if (operation === 'patch') session = await previewStore.patch(payload.patch, payload.caseToken, clientId,payload.revision);
    if (operation === 'clear') session = await previewStore.clear(payload.caseToken, clientId);
    if (operation === 'replace') session = await previewStore.replace(payload.data, payload.caseToken, payload.revision, clientId);
    acceptSession(session);
    if (operation !== 'read') for (const callback of previewListeners) callback({ ...structuredClone(session), isOwnChange:true });
    return session;
  }
  const response = await chrome.runtime.sendMessage({ type:`biometry:session:${operation}`, ...payload, clientId });
  if (!response?.ok) { const error = new Error(response?.error || '無法連接個案暫存服務，請重新載入擴充功能。'); error.code = response?.code || 'STORAGE_ERROR'; throw error; }
  return acceptSession(response.session);
}
export async function loadData() {
  const [session,local] = await Promise.all([sessionMessage('read'),isExtension ? chrome.storage.local.get('settings') : {}]);
  return {...session,settings:{...defaultSettings,...migrateCloudSettings(local.settings),...transferSettings(local.settings)}};
}
export async function patchCase(patch, caseToken = knownSession?.caseToken, revision = knownSession?.revision) { return sessionMessage('patch',{patch,caseToken,revision}); }
export async function clearCase(caseToken = knownSession?.caseToken) { return sessionMessage('clear',{caseToken}); }
export async function saveCase(data, {caseToken = knownSession?.caseToken, revision = knownSession?.revision} = {}) {
  return sessionMessage('replace',{data,caseToken,revision});
}
export function subscribeCase(callback) {
  if (!isExtension) { previewListeners.add(callback); return () => previewListeners.delete(callback); }
  const listener = (changes, area) => {
    if (area !== 'session' || !changes[SESSION_KEY]?.newValue) return;
    const session = acceptSession(changes[SESSION_KEY].newValue);
    callback({...structuredClone(session),isOwnChange:session.lastWriter===clientId});
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
export async function saveSettings(settings) { if (isExtension) await chrome.storage.local.set({settings}); }
const languageListeners=new Set();
let previewLanguage='en';
export async function loadLanguage(){
  if(isExtension)return normalizeUiLanguage((await chrome.storage.local.get(UI_LANGUAGE_KEY))[UI_LANGUAGE_KEY]);
  try{return normalizeUiLanguage(globalThis.localStorage?.getItem(UI_LANGUAGE_KEY)??previewLanguage);}catch{return previewLanguage;}
}
export async function saveLanguage(language){
  if(!isUiLanguage(language))throw new Error('Unsupported interface language.');
  if(isExtension){await chrome.storage.local.set({[UI_LANGUAGE_KEY]:language});return language;}
  previewLanguage=language;
  try{globalThis.localStorage?.setItem(UI_LANGUAGE_KEY,language);}catch{/* Local previews without storage retain the choice in memory. */}
  for(const listener of languageListeners)listener(language);
  return language;
}
export function subscribeLanguage(callback){
  if(isExtension){
    const listener=(changes,area)=>{if(area==='local'&&changes[UI_LANGUAGE_KEY])callback(normalizeUiLanguage(changes[UI_LANGUAGE_KEY].newValue));};
    chrome.storage.onChanged.addListener(listener);return()=>chrome.storage.onChanged.removeListener(listener);
  }
  languageListeners.add(callback);
  const onStorage=event=>{if(event.key===UI_LANGUAGE_KEY){previewLanguage=normalizeUiLanguage(event.newValue);callback(previewLanguage);}};
  globalThis.window?.addEventListener('storage',onStorage);
  return()=>{languageListeners.delete(callback);globalThis.window?.removeEventListener('storage',onStorage);};
}
let pendingLensWrites=Promise.resolve();
function lockLensCatalog(work){
  const locks=globalThis.navigator?.locks;
  if(typeof locks?.request==='function')return locks.request('biometry-lens-catalog-write',work);
  // Preview and test runtimes may not expose Web Locks. Keep writes ordered
  // within that runtime and let later work recover after an earlier failure.
  const task=pendingLensWrites.then(work,work);
  pendingLensWrites=task.catch(()=>{});
  return task;
}
function lensSourceContext(source){
  if(source.controlId)return source;
  const controls=LENS_DEFINITIONS[source.siteId]?.controls?.filter(control=>(control.role||'primary')==='primary'&&!control.eye)||[];
  return controls.length===1?{...source,controlId:controls[0].id,role:source.role||'primary'}:source;
}
export async function loadLensCatalog(){
  const stored=isExtension?(await chrome.storage.local.get('biometryLensCatalog')).biometryLensCatalog:previewLocalValues.biometryLensCatalog;
  if(!stored)return mergeLensCatalog();
  const parsed=parseLensCatalogDocument(stored);
  return mergeLensCatalog({...parsed,schemaVersion:'1.1',sources:parsed.sources.map(lensSourceContext)});
}
async function writeLensCatalog(document){
  const value=parseLensCatalogDocument(document);
  if(isExtension)await chrome.storage.local.set({biometryLensCatalog:value});else previewLocalValues.biometryLensCatalog=structuredClone(value);
  return value;
}
export async function saveLensCatalog(document){
  const value=parseLensCatalogDocument(document);
  return lockLensCatalog(()=>writeLensCatalog(value));
}
const lensSourceKey=source=>JSON.stringify([source.siteId,source.controlId||'primary',source.eye||'',source.manufacturer||'']);
export async function collectLensSnapshot(snapshot){
  const snapshots=(Array.isArray(snapshot)?snapshot:snapshot?.snapshots?.length?snapshot.snapshots:[snapshot]).filter(item=>item?.status==='read');
  if(!snapshots.length)throw new Error('沒有可保存的晶體選項，保留原有目錄。');
  const captured=exportLensCatalogDocument(snapshots.map(lensSourceContext)).sources;
  if(!captured.length)throw new Error('沒有可保存的晶體選項，保留原有目錄。');
  // One lock covers every eye/manufacturer branch; another collection cannot
  // replace unrelated sources while this read/merge/write is in flight.
  return lockLensCatalog(async()=>{
    const catalog=await loadLensCatalog(),keys=new Set(captured.map(lensSourceKey));
    const document={...catalog,exportedAt:new Date().toISOString(),sources:[...catalog.sources.filter(source=>!keys.has(lensSourceKey(source))),...captured]};
    return writeLensCatalog(document);
  });
}
async function checkedLensTab(tabId,expectedSiteId){
  const tab=await chrome.tabs.get(Number(tabId)),profile=matchSite(tab.url);
  if(!profile||expectedSiteId&&profile.id!==expectedSiteId)throw Object.assign(new Error('晶體讀取期間分頁已離開原定入口。'),{code:'TARGET_CHANGED'});
  return {tab,profile};
}
async function runLensBridge(tabId,action,definition,request={}){
  const {tab}=await checkedLensTab(tabId,definition.siteId);
  const results=await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},func:lensTransferBridge,args:[action,definition,request]});
  const frame=results.find(item=>item.frameId===0&&item.result);
  if(!frame)return {siteId:definition.siteId,status:'unavailable',controls:[]};
  if(frame.result.status==='target-changed')throw Object.assign(new Error(frame.result.reason),{code:'TARGET_CHANGED'});
  return {...frame.result,documentId:frame.documentId};
}
const lensReader=createLensTransfer({run:runLensBridge,checkedTab:checkedLensTab,onUpdated:globalThis.chrome?.tabs?.onUpdated});
function materializeLensSnapshots(profile,inventory,definition){
  const controls=inventory.controls||[],sources=DEFAULT_LENS_CATALOG.sources||[];
  return controls.filter(control=>control.status==='read').map(control=>{
    const maker=controls.filter(item=>item.role==='manufacturer'&&(!control.eye||!item.eye||item.eye===control.eye));
    const manufacturer=control.manufacturer||(maker.length===1?maker[0].selected?.label||maker[0].selected?.value:'');
    const descriptor=definition.controls?.find(item=>item.id===control.controlId&&(!control.eye||!item.eye||item.eye===control.eye));
    const published=sources.filter(source=>source.siteId===profile.id&&(!source.controlId||source.controlId===control.controlId)&&(!control.eye||!source.eye||source.eye===control.eye)&&(!source.manufacturer||source.manufacturer===manufacturer)).flatMap(source=>source.options);
    const fallback=published.length?published:descriptor?.options||[];
    const options=[...(control.options?.length?control.options:fallback)];
    if(control.selected&&!options.some(option=>option.value===control.selected.value&&option.label===control.selected.label))options.push({...control.selected,available:true});
    const unique=new Map(options.map(option=>[JSON.stringify([option.value,option.label,option.kind]),option]));
    return {siteId:profile.id,status:'read',url:inventory.url||profile.url,capturedAt:inventory.capturedAt||new Date().toISOString(),control:control.control,controlId:control.controlId,...(control.eye?{eye:control.eye}:{}),...(control.formula?{formula:control.formula}:{}),role:control.role||'primary',...(manufacturer?{manufacturer}:{}),options:[...unique.values()],selected:control.selected,parameters:control.selected?control.parameters||[]:[],navigationExpected:!!control.navigationExpected};
  }).filter(snapshot=>snapshot.options.length);
}
export async function readLensOptions(tabId,options={}){
  if(!isExtension)throw new Error('晶體選項需在已載入的 Chrome 擴充功能讀取。');
  const tab=await chrome.tabs.get(Number(tabId)),profile=matchSite(tab.url),definition=LENS_DEFINITIONS[profile?.id];
  if(!definition)return {status:'unsupported',siteId:profile?.id||'',controls:[],snapshots:[]};
  const inventory=options.collect?await lensReader.collect(tabId,definition,{eye:options.eye,guard:options.guard}):await lensReader.inspect(tabId,definition,{eye:options.eye});
  const snapshots=materializeLensSnapshots(profile,inventory,definition);
  const primary=snapshots.filter(source=>source.role==='primary');
  // Legacy single-control callers retain .selected/.options. Multi-eye or Rx
  // callers use explicit snapshots and cannot accidentally choose the first.
  return {...inventory,snapshots,...(primary.length===1?primary[0]:{})};
}
function lensReadRows(profile,inventory,scope){
  const snapshots=(inventory.snapshots||[]).filter(source=>source.role==='primary'&&source.selected&&(!source.eye||scope==='OU'||source.eye===scope));
  const rows=[];
  for(const eye of scope==='OU'?['OD','OS']:[scope]){
    const candidates=snapshots.filter(source=>!source.eye||source.eye===eye);
    if(candidates.length!==1)continue;
    rows.push(...buildLensReadRows(profile,{...candidates[0],eye},eye));
  }
  return rows;
}
async function libraryMessage(operation,payload={}) {
  let result;
  if(!isExtension){
    if(operation==='read')result=await previewLibrary.read();
    if(operation==='create-patient')result=await previewLibrary.createPatient(payload.patient,payload.expectedLibraryRevision);
    if(operation==='update-patient')result=await previewLibrary.updatePatient(payload.patientId,payload.patient,payload.expectedLibraryRevision);
    if(operation==='edit-patient')result=await previewLibrary.editPatient({...payload.options,clientId});
    if(operation==='delete-patient')result=await previewLibrary.deletePatient({...payload.options,clientId});
    if(operation==='delete-measurements')result=await previewLibrary.deleteMeasurements({...payload.options,clientId});
    if(operation==='duplicate-measurement')result=await previewLibrary.duplicateMeasurement(payload.options);
    if(operation==='import-patients')result=await previewLibrary.importPatients(payload.patients,payload.expectedLibraryRevision);
    if(operation==='import-measurements')result=await previewLibrary.importMeasurements(payload.options);
    if(operation==='save-measurement')result=await previewLibrary.saveMeasurement(payload.options);
    if(operation==='activate-patient')result=await previewLibrary.activatePatient(payload.patientId,payload.caseToken,payload.revision,clientId);
    if(operation==='select-measurement')result=await previewLibrary.selectMeasurement(payload.patientId,payload.measurementId,payload.caseToken,payload.revision,clientId);
  }else{
    const response=await chrome.runtime.sendMessage({type:`biometry:library:${operation}`,...payload,clientId});
    if(!response?.ok){const error=new Error(response?.error||'無法存取本機病人資料庫。');error.code=response?.code||'STORAGE_ERROR';throw error;}
    result=response.result;
  }
  if(operation==='activate-patient'||operation==='select-measurement'){
    acceptSession(result);
    if(!isExtension)for(const callback of previewListeners)callback({...structuredClone(result),isOwnChange:true});
  }
  if(result?.session){acceptSession(result.session);if(!isExtension)for(const callback of previewListeners)callback({...structuredClone(result.session),isOwnChange:true});}
  return result;
}
export async function loadLibrary(){return libraryMessage('read');}
export async function createPatient(patient,expectedLibraryRevision){return libraryMessage('create-patient',{patient,expectedLibraryRevision});}
export async function updatePatient(patientId,patient,expectedLibraryRevision){return libraryMessage('update-patient',{patientId,patient,expectedLibraryRevision});}
export async function editPatient(options){return libraryMessage('edit-patient',{options});}
export async function deletePatient(options){return libraryMessage('delete-patient',{options});}
export async function deleteMeasurements(options){return libraryMessage('delete-measurements',{options});}
export async function duplicateMeasurement(options){return libraryMessage('duplicate-measurement',{options});}
export async function importPatients(patients,expectedLibraryRevision){return libraryMessage('import-patients',{patients,expectedLibraryRevision});}
export async function importMeasurements(options){return libraryMessage('import-measurements',{options});}
export async function saveMeasurement(options){return libraryMessage('save-measurement',{options:{...options,caseToken:options.caseToken??knownSession?.caseToken,revision:options.revision??knownSession?.revision}});}
export async function activatePatient(patientId,caseToken=knownSession?.caseToken,revision=knownSession?.revision){return libraryMessage('activate-patient',{patientId,caseToken,revision});}
export async function selectMeasurement(patientId,measurementId,caseToken=knownSession?.caseToken,revision=knownSession?.revision){return libraryMessage('select-measurement',{patientId,measurementId,caseToken,revision});}
export function subscribeLibrary(callback){
  if(!isExtension){previewLibraryListeners.add(callback);return()=>previewLibraryListeners.delete(callback);}
  const listener=(changes,area)=>{if(area==='local'&&changes[LIBRARY_KEY]?.newValue)callback(structuredClone(changes[LIBRARY_KEY].newValue));};
  chrome.storage.onChanged.addListener(listener);return()=>chrome.storage.onChanged.removeListener(listener);
}
export function getFloatingTabId(href = globalThis.location?.href) {
  try { const value = new URL(href).searchParams.get('tabId'); return value != null && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : undefined; }
  catch { return undefined; }
}
export async function siteTabs() {
  if (!isExtension) return [];
  const current = getFloatingTabId();
  return (await chrome.tabs.query({})).map(t => ({...t,site:matchSite(t.url)})).filter(t=>t.site).sort((a,b)=>Number(b.id===current)-Number(a.id===current)||Number(b.active)-Number(a.active)||(b.lastAccessed||0)-(a.lastAccessed||0));
}
export function subscribeTabs(callback) {
  if (!isExtension) return () => {};
  // Audio, favicon and other metadata changes do not alter the calculator list
  // or its form. Each callback otherwise triggers a tab query and DOM inspection
  // in every open panel, so only forward navigation/display-relevant updates.
  const updated=(tabId,changes,tab)=>{
    if(!changes||['url','status','title'].some(key=>Object.hasOwn(changes,key)))callback(tabId,changes,tab);
  };
  const listeners=[[chrome.tabs.onActivated,callback],[chrome.tabs.onUpdated,updated],[chrome.tabs.onRemoved,callback]].filter(([source])=>source);
  for(const [source,listener]of listeners)source.addListener(listener);
  return()=>{for(const [source,listener]of listeners)source.removeListener(listener);};
}
export async function showFloating(tabId, {timeoutMs=15000} = {}) {
  if (!isExtension) return;
  const tab = await waitForSupportedTab(chrome.tabs,tabId,timeoutMs);
  await chrome.scripting.executeScript({target:{tabId:tab.id},files:['floating.js']});
  return chrome.tabs.sendMessage(tab.id,{type:'biometry:show-floating',tabId:tab.id},{frameId:0});
}
export async function openSite(site) {
  if (!isExtension) { window.open(site.url,'_blank','noopener'); return; }
  return chrome.tabs.create({url:site.url});
}
async function transferMessage(type,tabId,payload) {
  if(!isExtension)throw new Error('請在 Chrome 載入擴充功能後貼上。');
  const response=await chrome.runtime.sendMessage({type,tabId:Number(tabId),...payload});
  if(!response?.ok)throw Object.assign(new Error(response?.error||'網站資料傳輸未完成。'),{code:response?.code||'TRANSFER_FAILED'});
  return response.result;
}
export async function prepareEye(tabId,_data,options={}){return transferMessage('biometry:prepare-eye',tabId,{options});}
export async function prepareModes(tabId,data,options={}){return transferMessage('biometry:prepare-modes',tabId,{data,options});}
export async function prepareDisplayPreferences(tabId,_data,options={}){return transferMessage('biometry:prepare-display',tabId,{options});}
export async function quickFillTab(tabId,data,options={}){return transferMessage('biometry:quick-fill',tabId,{data,options:{...options,caseToken:options.caseToken??knownSession?.caseToken,revision:options.revision??knownSession?.revision}});}
export async function inspectTab(tabId, data, options = {}, action = 'preview', frameId) {
  if (!isExtension) throw new Error('請在 Chrome 載入 dist 資料夾後使用網站讀取與填入。');
  const tab = await chrome.tabs.get(Number(tabId));
  const profile = matchSite(tab.url);
  if (!profile) throw new Error('請選擇支援的計算網站分頁。');
  if (action === 'apply' && (options.expectedSiteId !== profile.id || options.expectedUrl !== tab.url)) throw new Error('目標分頁已變更，請重新預覽後再填入。');
  // All supported calculator forms were verified in their top document. Never
  // inject the form bridge into the extension's own floating iframe or OCR frame.
  const target = {tabId:tab.id,frameIds:[frameId ?? 0]};
  const {report:_privateReport,...siteData}=data;
  const results = await chrome.scripting.executeScript({target,func:siteBridge,args:[action,profile,siteData,options]});
  const frames = results.filter(r => r.result && !r.result.error && r.result.rows.some(v => ['ready','read','filled','changed','rejected'].includes(v.status)));
  if (frames.length > 1) throw new Error('頁面包含多個可填寫表單，無法唯一對應；請開啟計算器的獨立頁面。');
  const chosen = frames[0] || results.find(r=>r.result && !r.result.error) || results.find(r=>r.result?.error);
  if (!chosen) throw new Error('未找到表單；請完成網站的必要選擇後重試。');
  if (chosen.result.error) throw new Error(chosen.result.error);
  const result={...chosen.result,frameId:chosen.frameId,tabId:tab.id,tabUrl:tab.url,profile};
  if(action==='read'&&LENS_DEFINITIONS[profile.id]){
    try{
      const lensSnapshot=await readLensOptions(tab.id,{eye:options.eye});
      result.rows=[...result.rows,...lensReadRows(profile,lensSnapshot,options.eye||data.activeEye||'OD')];
      result.lensSnapshot=lensSnapshot;result.lensInventory=lensSnapshot;
    }catch{/* Numeric reads remain useful if the optional lens menu changes. */}
  }
  return result;
}
export async function captureTab(tabId = getFloatingTabId()) {
  if (!isExtension) throw new Error('螢幕擷取需要在已載入的 Chrome 擴充功能中使用。');
  const tab = tabId == null ? (await chrome.tabs.query({active:true,currentWindow:true}))[0] : await chrome.tabs.get(Number(tabId));
  if (!tab?.active || !matchSite(tab.url)) throw new Error('請先切換到要擷取的計算網站分頁。');
  let hidden = false;
  try {
    try { hidden = !!(await chrome.tabs.sendMessage(tab.id,{type:'biometry:hide-floating',tabId:tab.id},{frameId:0}))?.ok; } catch { /* A manually opened page may have no overlay yet. */ }
    if (hidden) await new Promise(resolve=>setTimeout(resolve,80));
    return await chrome.tabs.captureVisibleTab(tab.windowId,{format:'png'});
  } catch { throw new Error('無法擷取畫面；請在此網站點選一次擴充功能圖示後重試。'); }
  finally { if (hidden) try { await chrome.tabs.sendMessage(tab.id,{type:'biometry:restore-floating',tabId:tab.id},{frameId:0}); } catch { /* The page may have navigated during capture. */ } }
}
export async function requestCloudPermission(settings) {
  if (settings.ocrProvider === 'local' || !isExtension) return;
  const origins=cloudPermissionOrigins(settings);
  if (!await chrome.permissions.request({origins})) throw new Error('未授予所選 OCR API 的連線權限。');
}

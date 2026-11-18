import { matchSite } from './sites.js';
import { createSessionStore, isTrustedPanelSender } from './session-store.js';
import { waitForSupportedTab } from './tab-ready.js';
import { createLibraryStore,createLibraryService } from './library-store.js';
import { panelStatusRelay } from './panel-status.js';
import { createQaBackend } from './qa/backend.js';
import { createTabTransfer } from './tab-transfer.js';
import {UI_LANGUAGE_KEY,normalizeUiLanguage,isUiLanguage,sameSupportedDocument} from './ui-language.js';

const store = createSessionStore(chrome.storage.session);
const library = createLibraryService(createLibraryStore(chrome.storage.local),store);
const qa=createQaBackend(chrome.storage,chrome.runtime.id);
const transfers=createTabTransfer(chrome,{readSession:()=>store.read(),readLensCatalog:async()=>(await chrome.storage.local.get('biometryLensCatalog')).biometryLensCatalog});
async function protectStorage() {
  await Promise.all([
    chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
    chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  ]);
}
protectStorage().catch(console.error);
chrome.runtime.onInstalled.addListener(() => protectStorage().catch(console.error));

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if(['biometry:ui-language:get','biometry:ui-language:set'].includes(message?.type)){
    const work=async()=>{
      const panel=isTrustedPanelSender(sender,chrome.runtime.id);
      if(!panel){
        if(sender?.id!==chrome.runtime.id||sender.frameId!==0||!Number.isInteger(sender.tab?.id)||!sameSupportedDocument(sender.url,sender.tab.url,matchSite))throw new Error('Unsupported locale sender.');
        const current=await chrome.tabs.get(sender.tab.id);
        if(!sameSupportedDocument(sender.url,current.url,matchSite))throw new Error('Locale source tab changed.');
      }
      if(message.type.endsWith(':set')){
        if(!isUiLanguage(message.language))throw new Error('Unsupported interface language.');
        await chrome.storage.local.set({[UI_LANGUAGE_KEY]:message.language});
        return message.language;
      }
      return normalizeUiLanguage((await chrome.storage.local.get(UI_LANGUAGE_KEY))[UI_LANGUAGE_KEY]);
    };
    work().then(language=>respond({ok:true,language})).catch(error=>respond({ok:false,code:'INVALID_UI_LANGUAGE_REQUEST',error:error.message}));
    return true;
  }
  if(['biometry:prepare-eye','biometry:prepare-display','biometry:prepare-modes','biometry:quick-fill'].includes(message?.type)){
    if(!isTrustedPanelSender(sender,chrome.runtime.id)){respond({ok:false,code:'UNTRUSTED_SENDER',error:'只有擴充功能面板能貼上資料。'});return false;}
    const query=new URL(sender.url).searchParams;
    if(query.get('view')==='floating'&&query.get('tabId')!==String(message.tabId)){respond({ok:false,code:'TARGET_CHANGED',error:'懸浮窗的目標分頁不符。'});return false;}
    if(message.type==='biometry:quick-fill'&&query.get('view')==='qa'){respond({ok:false,code:'QA_ISOLATION_REQUIRED',error:'QA 頁面不可使用正式工作副本貼上服務。'});return false;}
    const restoreFloating=async siteId=>{
      if(query.get('view')!=='floating')return;
      try{
        if(matchSite((await chrome.tabs.get(Number(message.tabId))).url)?.id!==siteId)return;
        await chrome.scripting.executeScript({target:{tabId:Number(message.tabId)},files:['floating.js']});
        await chrome.tabs.sendMessage(Number(message.tabId),{type:'biometry:show-floating',tabId:Number(message.tabId)},{frameId:0});
      }catch{/* Restoring the UI never clears a case or changes its measurements. */}
    };
    const work=message.type==='biometry:prepare-modes'?transfers.prepareModes(message.tabId,message.data,message.options):message.type==='biometry:prepare-eye'?transfers.prepareEye(message.tabId,message.options):message.type==='biometry:prepare-display'?transfers.prepareDisplayPreferences(message.tabId,message.options):transfers.quickFill(message.tabId,message.data,message.options);
    work.then(async result=>{
      if(result.navigated)await restoreFloating(result.siteId);
      respond({ok:true,result});
    }).catch(async error=>{if(error.navigated)await restoreFloating(error.restoreSiteId);respond({ok:false,code:error.code||'TRANSFER_FAILED',error:error.message||'網站貼上未完成。'});});
    return true;
  }
  if(String(message?.type||'').startsWith('biometry:qa:')){
    qa.request(message,sender).then(value=>respond({ok:true,...value})).catch(error=>respond({ok:false,code:error.code||'QA_STORAGE_ERROR',error:error.message||'隔離 QA 資料操作失敗。'}));
    return true;
  }
  if (message?.type==='biometry:panel-status') {
    const relay=isTrustedPanelSender(sender,chrome.runtime.id)?panelStatusRelay(message,sender,chrome.runtime.id):undefined;
    if (!relay) {respond({ok:false,code:'INVALID_PANEL_STATUS',error:'無法確認懸浮面板狀態來源。'});return false;}
    chrome.tabs.sendMessage(relay.tabId,relay,{frameId:0}).then(result=>respond(result?.ok?{ok:true}:{ok:false,code:'PANEL_NOT_CURRENT'})).catch(()=>respond({ok:false,code:'PANEL_UNAVAILABLE'}));
    return true;
  }
  if (!message || !/^biometry:(?:session|library):/.test(String(message.type || ''))) return;
  if (!isTrustedPanelSender(sender, chrome.runtime.id)) {
    respond({ ok: false, code: 'UNTRUSTED_SENDER', error: '只有擴充功能面板能存取個案資料。' });
    return false;
  }
  const operations = {
    'biometry:session:read': () => store.read(),
    'biometry:session:patch': () => store.patch(message.patch, message.caseToken, message.clientId,message.revision),
    'biometry:session:clear': () => store.clear(message.caseToken, message.clientId),
    'biometry:session:replace': () => store.replace(message.data, message.caseToken, message.revision, message.clientId),
    'biometry:library:read': () => library.read(),
    'biometry:library:create-patient': () => library.createPatient(message.patient,message.expectedLibraryRevision),
    'biometry:library:update-patient': () => library.updatePatient(message.patientId,message.patient,message.expectedLibraryRevision),
    'biometry:library:edit-patient': () => library.editPatient({...message.options,clientId:message.clientId}),
    'biometry:library:delete-patient': () => library.deletePatient({...message.options,clientId:message.clientId}),
    'biometry:library:delete-measurements': () => library.deleteMeasurements({...message.options,clientId:message.clientId}),
    'biometry:library:duplicate-measurement': () => library.duplicateMeasurement(message.options),
    'biometry:library:import-patients': () => library.importPatients(message.patients,message.expectedLibraryRevision),
    'biometry:library:save-measurement': () => library.saveMeasurement(message.options),
    'biometry:library:activate-patient': () => library.activatePatient(message.patientId,message.caseToken,message.revision,message.clientId),
    'biometry:library:select-measurement': () => library.selectMeasurement(message.patientId,message.measurementId,message.caseToken,message.revision,message.clientId),
  };
  const operation = operations[message.type];
  if (!operation) { respond({ ok: false, code: 'UNKNOWN_OPERATION', error: '不支援的個案操作。' }); return false; }
  operation().then(value => respond(message.type.startsWith('biometry:library:')?{ok:true,result:value}:{ok:true,session:value})).catch(error => respond({ ok: false, code: error.code || 'STORAGE_ERROR', error: error.message || '個案暫存失敗。' }));
  return true;
});

chrome.storage.onChanged.addListener((changes,area)=>{
  if(area!=='local'||!changes[UI_LANGUAGE_KEY])return;
  const language=normalizeUiLanguage(changes[UI_LANGUAGE_KEY].newValue);
  chrome.tabs.query({}).then(tabs=>Promise.all(tabs.filter(tab=>Number.isInteger(tab.id)&&matchSite(tab.url)).map(tab=>chrome.tabs.sendMessage(tab.id,{type:'biometry:ui-language:changed',language},{frameId:0}).catch(()=>{})))).catch(()=>{});
});

chrome.action.onClicked.addListener(async tab => {
  try {
    if (tab.id != null && (matchSite(tab.url) || matchSite(tab.pendingUrl))) {
      const ready = await waitForSupportedTab(chrome.tabs,tab.id);
      await chrome.scripting.executeScript({ target: { tabId: ready.id }, files: ['floating.js'] });
      await chrome.tabs.sendMessage(ready.id, { type: 'biometry:toggle-floating', tabId: ready.id }, { frameId: 0 });
    } else {
      await chrome.tabs.create({ url: chrome.runtime.getURL('index.html?view=launcher') });
    }
  } catch {
    await chrome.tabs.create({ url: chrome.runtime.getURL('index.html?view=launcher') });
  }
});

import { defaultSettings } from '../platform.js';
import { waitForSupportedTab } from '../tab-ready.js';
import { isTrustedQaSender } from './backend.js';
import { inspectTab as inspectWebsite,prepareDisplayPreferences as prepareWebsiteDisplay } from '../platform.js';
export { prepareEye,prepareModes,openSite } from '../platform.js';
export const cylinderConvention=(()=>{try{const value=new URL(globalThis.location.href).searchParams.get('cylinderConvention');return ['minus','plus','preserve'].includes(value)?value:'minus';}catch{return 'minus';}})();
export async function inspectTab(tabId,data,options={},...rest){return inspectWebsite(tabId,data,{cylinderConvention,...options},...rest);}
export async function prepareDisplayPreferences(tabId,data,options={}){return prepareWebsiteDisplay(tabId,data,{cylinderConvention,...options});}

export const isExtension=!!globalThis.chrome?.runtime?.id;
export const extensionVersion=(()=>{try{return chrome.runtime.getManifest().version;}catch{return 'unavailable';}})();
const clientId=`qa-${crypto.randomUUID()}`;
let knownSession;

async function request(area,operation,payload={}) {
  const runtime=globalThis.chrome?.runtime;
  if(!isExtension||!isTrustedQaSender({id:runtime?.id,url:globalThis.location?.href},runtime?.id))throw Object.assign(new Error('請從擴充功能的 QA 工具頁啟動隔離測試。'),{code:'QA_CONTEXT_REQUIRED'});
  const response=await runtime.sendMessage({type:`biometry:qa:${area}:${operation}`,...payload,clientId});
  if(!response?.ok)throw Object.assign(new Error(response?.error||'無法存取隔離 QA 資料。'),{code:response?.code||'QA_STORAGE_ERROR'});
  const value=area==='session'?response.session:response.result;
  if(area==='session'||['activate-patient','select-measurement'].includes(operation)){
    if(!value?.data||typeof value.caseToken!=='string'||!Number.isSafeInteger(value.revision))throw new Error('隔離 QA 工作副本回應格式不正確。');
    if(!knownSession||value.revision>=knownSession.revision)knownSession=value;
  }
  return value;
}

export async function loadData(){return {...await request('session','read'),settings:{...defaultSettings}};}
export async function saveCase(data,{caseToken=knownSession?.caseToken,revision=knownSession?.revision}={}){return request('session','replace',{data,caseToken,revision});}
export async function patchCase(patch,caseToken=knownSession?.caseToken,revision=knownSession?.revision){return request('session','patch',{patch,caseToken,revision});}
export async function clearCase(caseToken=knownSession?.caseToken){return request('session','clear',{caseToken});}
export async function loadLibrary(){return request('library','read');}
export async function createPatient(patient,expectedLibraryRevision){return request('library','create-patient',{patient,expectedLibraryRevision});}
export async function saveMeasurement(options){return request('library','save-measurement',{options:{...options,caseToken:options.caseToken??knownSession?.caseToken,revision:options.revision??knownSession?.revision}});}
export async function selectMeasurement(patientId,measurementId,caseToken=knownSession?.caseToken,revision=knownSession?.revision){return request('library','select-measurement',{patientId,measurementId,caseToken,revision});}
export async function activatePatient(patientId,caseToken=knownSession?.caseToken,revision=knownSession?.revision){return request('library','activate-patient',{patientId,caseToken,revision});}
export async function waitTab(tabId,{timeoutMs=15000}={}){if(!isExtension)throw new Error('QA 網站驗證需要已載入的 Chrome 擴充功能。');return waitForSupportedTab(chrome.tabs,tabId,timeoutMs);}

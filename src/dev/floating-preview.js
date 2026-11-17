// Development-only harness: no real Chrome APIs and no external calculations.
import {createFloatingShell} from '../floating.js';
import {createSessionStore,SESSION_KEY} from '../session-store.js';
import {createLibraryStore,createLibraryService,LIBRARY_KEY} from '../library-store.js';
import {siteBridge} from '../bridge.js';
import {SITES} from '../sites.js';
import {createTabTransfer} from '../tab-transfer.js';
import {UI_LANGUAGE_KEY,normalizeUiLanguage,isUiLanguage} from '../ui-language.js';

const channel=crypto.randomUUID();
const sourceProfile=SITES.find(site=>site.id==='barrett-universal');
const destinationProfile=SITES.find(site=>site.id==='evo');
const virtualTabs=[
  {id:101,windowId:1,url:sourceProfile.url,title:'SYNTHETIC · Barrett source',siteId:sourceProfile.id,lastAccessed:2},
  {id:202,windowId:1,url:destinationProfile.url,title:'SYNTHETIC · EVO destination',siteId:destinationProfile.id,lastAccessed:1},
];
let currentTab=101,sequence=2;
const memory={},localValues={};
const source=document.querySelector('#source-form'),destination=document.querySelector('#destination-form');
const sourceValues=new Map([...source.querySelectorAll('input')].map(input=>[input.id,input.value]));
const destinationKeys={al:'txtAL',acd:'txtACD',lt:'txtLT',k1:'txtK1',k2:'txtK2',target:'txtRefraction',aConstant:'txtAConstant'};
const frame=()=>shell.elements.frame;
function toPanel(message){if(frame().isConnected)frame().contentWindow.postMessage({...message,qaChannel:channel},location.origin);}
function displayAudit(){
  const record=memory[SESSION_KEY];
  const data=record?.data;
  document.querySelector('#shared-data').textContent=data?JSON.stringify({revision:record.revision,selection:record.selection,patientId:data.patient.patientId,OD:data.eyes.OD,OS:data.eyes.OS},null,2):'尚未儲存';
  document.querySelector('#destination-readback').textContent=JSON.stringify(Object.fromEntries(Object.entries(destinationKeys).map(([key,id])=>[key,document.querySelector(`#${id}`).value || '—'])),null,2);
  const library=localValues[LIBRARY_KEY];
  document.querySelector('#library-readback').textContent=JSON.stringify({revision:library?.revision||0,patients:(library?.patients||[]).map(patient=>({id:patient.id,patientId:patient.patient.patientId,measurements:patient.measurements.map(measurement=>({id:measurement.id,label:measurement.label,source:measurement.source,OD:measurement.eyes.OD.al,OS:measurement.eyes.OS.al}))}))},null,2);
}
const storage={
  get:async()=>structuredClone(memory),
  set:async values=>{
    const changes=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{oldValue:memory[key],newValue:structuredClone(value)}]));
    Object.assign(memory,structuredClone(values));displayAudit();
    toPanel({type:'qa:storage-change',changes,area:'session'});
  },
};
const store=createSessionStore(storage);
const localStorage={
  get:async()=>structuredClone(localValues),
  set:async values=>{
    const changes=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{oldValue:localValues[key],newValue:structuredClone(value)}]));
    Object.assign(localValues,structuredClone(values));displayAudit();
    if(Object.hasOwn(values,UI_LANGUAGE_KEY))shell.handleMessage({type:'biometry:ui-language:changed',language:normalizeUiLanguage(values[UI_LANGUAGE_KEY])});
    toPanel({type:'qa:storage-change',changes,area:'local'});
  },
};
const library=createLibraryService(createLibraryStore(localStorage),store);
const shell=createFloatingShell({document,window,runtime:{getURL:path=>{
  const url=new URL(path.startsWith('index.html')?'/src/dev/panel.html':`/${path}`,location.origin);
  if(path.startsWith('index.html'))url.searchParams.set('qaChannel',channel);
  return url.href;
},sendMessage:runtimeMessage}});
function tabs(){return virtualTabs.map(tab=>({...tab,status:'complete',active:tab.id===currentTab}));}
function getTab(id){const tab=tabs().find(tab=>tab.id===Number(id));if(!tab)throw new Error('此 QA 僅提供兩個合成分頁。');return tab;}
function selectTab(id,{show=true}={}){
  const tab=getTab(id);currentTab=tab.id;
  virtualTabs.find(item=>item.id===tab.id).lastAccessed=++sequence;
  source.hidden=currentTab!==101;destination.hidden=currentTab!==202;
  document.querySelector('#switch-source').classList.toggle('active',currentTab===101);
  document.querySelector('#switch-destination').classList.toggle('active',currentTab===202);
  document.querySelector('#qa-status').textContent=currentTab===101?'目前 A：可選 OD、OS 或 OD+OS 讀取不同的雙眼合成值，再保存為測量。':'目前 B：單眼表單，先在網站與面板選擇相同眼別，再預覽並貼上。';
  if(show)shell.expand(tab.id);
  toPanel({type:'qa:tabs-change',tabId:tab.id});
  return tab;
}
async function runtimeMessage(message){
  try{
    if(message.type==='biometry:ui-language:get')return {ok:true,language:normalizeUiLanguage(localValues[UI_LANGUAGE_KEY])};
    if(message.type==='biometry:ui-language:set'){
      if(!isUiLanguage(message.language))throw new Error('Unsupported interface language.');
      await localStorage.set({[UI_LANGUAGE_KEY]:message.language});
      return {ok:true,language:message.language};
    }
    if(message.type==='biometry:quick-fill')return {ok:true,result:await transfers.quickFill(message.tabId,message.data,message.options)};
    if(message.type==='biometry:prepare-eye')return {ok:true,result:await transfers.prepareEye(message.tabId,message.options)};
    const operations={
      'biometry:session:read':()=>store.read(),
      'biometry:session:patch':()=>store.patch(message.patch,message.caseToken,message.clientId),
      'biometry:session:clear':()=>store.clear(message.caseToken,message.clientId),
      'biometry:session:replace':()=>store.replace(message.data,message.caseToken,message.revision,message.clientId),
      'biometry:library:read':()=>library.read(),
      'biometry:library:create-patient':()=>library.createPatient(message.patient,message.expectedLibraryRevision),
      'biometry:library:update-patient':()=>library.updatePatient(message.patientId,message.patient,message.expectedLibraryRevision),
      'biometry:library:import-patients':()=>library.importPatients(message.patients,message.expectedLibraryRevision),
      'biometry:library:save-measurement':()=>library.saveMeasurement(message.options),
      'biometry:library:activate-patient':()=>library.activatePatient(message.patientId,message.caseToken,message.revision,message.clientId),
      'biometry:library:select-measurement':()=>library.selectMeasurement(message.patientId,message.measurementId,message.caseToken,message.revision,message.clientId),
    };
    const operation=operations[message.type];
    if(!operation)throw new Error('不支援的 QA 工作階段或病人資料庫操作。');
    const value=await operation();
    return message.type.startsWith('biometry:library:')?{ok:true,result:value}:{ok:true,session:value};
  }catch(error){return {ok:false,code:error.code||'QA_ERROR',error:error.message};}
}
async function execute(details){
  if(details.files)return [];
  const tab=getTab(details.target?.tabId);
  if(tab.id!==currentTab)throw new Error('請先切換到要讀取或貼上的合成分頁。');
  const [action,suppliedProfile,data,options={}]=details.args || [];
  const original=SITES.find(site=>site.id===tab.siteId);
  if(!['inspect','read','preview','apply','select-eye'].includes(action) || suppliedProfile?.id!==original.id)throw new Error('QA 對應目標已變更。');
  // Localhost origin/path adaptation exists only in this dev file. Selectors,
  // field meanings and all write/preview guards still use production code.
  const profile={...original,url:location.href,path:location.pathname,allowedHosts:[]};
  const result=siteBridge(action,profile,data,{...options,expectedFrameUrl:action==='apply'?location.href:undefined});
  result.url=tab.url;
  displayAudit();
  if(action==='apply')document.querySelector('#qa-status').textContent=`${tab.id===101?'A 雙眼來源頁':'B 單眼目的頁'}已寫入 ${result.rows.filter(row=>row.status==='filled').length} 個欄位；下方列出讀回結果。`;
  return [{frameId:0,result}];
}
const methods={
  'runtime.sendMessage':runtimeMessage,
  'storage.local.get':async()=>structuredClone(localValues),
  'storage.local.set':async values=>localStorage.set(values),
  'storage.session.get':async()=>structuredClone(memory),
  'storage.session.set':async values=>storage.set(values),
  'tabs.query':async(options={})=>tabs().filter(tab=>!options.active||tab.active),
  'tabs.get':async id=>getTab(id),
  'tabs.create':async({url})=>{const tab=virtualTabs.find(tab=>tab.url===url);if(!tab)throw new Error('此合成驗證頁只啟用 Barrett 與 EVO 兩個入口。');return selectTab(tab.id);},
  'tabs.update':async(id,options={})=>options.active?selectTab(id):getTab(id),
  'tabs.sendMessage':async(id,message)=>{if(Number(id)!==currentTab)throw new Error('合成分頁並非目前分頁。');return shell.handleMessage(message);},
  'scripting.executeScript':execute,
};
const transfers=createTabTransfer({tabs:{get:async id=>getTab(id),onUpdated:{addListener(){},removeListener(){}}},scripting:{executeScript:execute}},{readSession:()=>store.read()});
window.addEventListener('message',async event=>{
  const message=event.data;
  if(event.source!==frame().contentWindow || event.origin!==location.origin || message?.qaChannel!==channel)return;
  if(message.type==='qa:panel-status'){
    // Local mock transport only: accept a phase for this exact panel instance,
    // strip every other payload field, and use the real shell's nonce guard.
    // In production the service worker authenticates extension-frame senders.
    const url=new URL(frame().src),query=url.searchParams;
    if(location.protocol!=='http:' || !['127.0.0.1','localhost','[::1]'].includes(location.hostname) || frame().hasAttribute('srcdoc') || url.origin!==location.origin || url.pathname!=='/src/dev/panel.html' || query.get('qaChannel')!==channel || !['starting','ready','error'].includes(message.phase) || message.panelToken!==query.get('panelToken') || message.tabId!==currentTab || String(message.tabId)!==query.get('tabId'))return;
    shell.handleMessage({type:'biometry:panel-status',phase:message.phase,panelToken:query.get('panelToken'),tabId:currentTab});
    return;
  }
  if(message.type!=='qa:request')return;
  const method=methods[message.method];
  let value,error;
  try{if(!method)throw new Error('不支援的合成 Chrome API。');value=await method(...(message.args||[]));}
  catch(failure){error=failure.message || 'QA 操作失敗。';}
  event.source.postMessage({type:'qa:response',qaChannel:channel,id:message.id,value,error},event.origin);
});
document.querySelector('#switch-source').onclick=()=>selectTab(101);
document.querySelector('#switch-destination').onclick=()=>selectTab(202);
document.querySelector('#toggle-extension').onclick=()=>shell.toggle(currentTab);
document.querySelector('#simulate-srcdoc').onclick=()=>{
  frame().srcdoc='';
  document.querySelector('#qa-status').textContent='已模擬空白 srcdoc 覆蓋。等待外框顯示未就緒，再按「重新載入面板」；也可重新點 Extension 圖示。共用工作副本與已保存測量不變。此測試只在本機 HTTP 模擬頁執行。';
};
document.querySelector('#reset-test').onclick=async()=>{
  for(const [id,value] of sourceValues)document.querySelector(`#${id}`).value=value;
  for(const input of destination.querySelectorAll('input:not([type="radio"])'))input.value='';
  document.querySelector('#RadioButtonRLEye_0').checked=true;
  document.querySelector('#RadioButtonRLEye_1').checked=false;
  const state=await store.read();await store.clear(state.caseToken,'qa-reset');
  selectTab(101);displayAudit();
};
destination.addEventListener('input',displayAudit);destination.addEventListener('change',displayAudit);
selectTab(101,{show:false});
await store.read();displayAudit();shell.expand(101);

import {lensMarkup,lensPatchFromEntry,lensPatchFromSource,updateLensControls} from './lens-ui.js';
import {parseLensCatalogDocument} from './lens-catalog.js';
import {transferSettings,applyTransferDefaults} from './transfer-defaults.js';
import './styles.css';
import { emptyCase,cleanCase,validateCase,mergeCandidates,FIELD_GROUPS,fieldLabel,PATIENT_FIELDS,EYE_FIELDS } from './model.js';
import { SITES } from './sites.js';
import { FORMULA_GROUPS,SITE_PURPOSES,getGroupSites } from './catalog.js';
import * as platform from './platform.js';
import { createEditor } from './editor-state.js';
import { icon,escapeHtml as esc } from './ui.js';
import { deriveRequirements } from './requirements.js';
import { libraryPicker,libraryMarkup,patientLabel,measurementTime,selectedRecord } from './library-ui.js';
import { caseFromReadRows,resolveTransferScope,patchFromCase,reconcileLensPatch } from './transfer.js';
import { exportCaseDocument,exportLibraryDocument,parseInterchange } from './interchange.js';
import {exportParserDocument} from './parser-interchange.js';
import { choosePdfPages } from './pdf-picker.js';
import { bindImagePaste } from './clipboard-images.js';
import {workbenchHelp,preferenceSettingsMarkup} from './workbench-ui.js';
import {eyeStateMarkup} from './eye-state-ui.js';
import {reviewMarkup} from './import-review-ui.js';
import {parserBatchMarkup} from './parser-batch-ui.js';
import {reportSummaryMarkup} from './report-ui.js';
import {reviewSources,loadReviewSource,bindReviewPreview} from './import-preview.js';
import {createImportProgress,importProgressMarkup,formatElapsed} from './import-progress.js';
import {paddleApiEndpoint} from './ocr/cloud-config.js';
import {getLanguage,setLanguage,localize,observeLocalization,languageButtonMarkup,translate} from './i18n.js';
import {createResultController} from './result-controller.js';

const app=document.querySelector('#app');
const JSON_IMPORT_LIMIT=10_000_000;
const extensionVersion=(()=>{try{return chrome.runtime.getManifest().version;}catch{return '0.5.4';}})();
const query=new URLSearchParams(location.search);
const floating=query.get('view')==='floating';
const hostTabId=platform.getFloatingTabId();
const panelTabs=[['data','data','資料'],['patients','patients','病人'],['import','import','匯入'],
  ['results','results','結果'],['sites','sites','入口'],['settings','gear','設定']];
document.body.classList.toggle('embedded',floating);
let route='data';
let settings={...platform.defaultSettings},tabs=[],targetId=hostTabId!=null?String(hostTabId):'';
let siteFilter='all',search='',busy=false,progress='',pendingFill=null;
let includeIdentifiers=true,includeConstants=false,includeLens=true,scopeExplicit=false,ocrAbort=null,eyeConfirmed=false,status={saving:false,dirty:false,error:''};
let initialized=false,refreshTimer,inspectionRunning=false,inventory=null,requirementsError='',showAllFields=false,needsRequirementRender=false;
let toastMessage='',toastError=false,toastUntil=0;
let lensCatalog={entries:[],sources:[]},lensInventory=null,lensInventoryTab='',lensSearch='',lensOpen=false,lastLensFeedback=null;
let transferScope='OD',library={patients:[],revision:0},draftSource='手動輸入';
let measurementEditId='';
let releaseReview=()=>{};
const importProgress=createImportProgress({onTick:paintImportProgress});
function paintImportProgress(state){
  progress=state.message;const activity=app.querySelector('.import-activity');if(!activity)return;activity.hidden=!state.running;
  activity.setAttribute('aria-busy',String(state.running));activity.dataset.paused=String(state.paused);const message=activity.querySelector('#ocr-progress');if(message)message.textContent=state.message;
  const time=activity.querySelector('#ocr-elapsed');if(time)time.textContent=formatElapsed(state.elapsedMs);
}
let stopLocalization=()=>{},unsubscribeLanguage=()=>{};
function applyLanguage(value){
  setLanguage(value);document.documentElement.lang=getLanguage()==='en'?'en':'zh-Hant';
  document.title=getLanguage()==='en'?'Biometry-Clip':'Biometry-Clip · 生物測量剪貼簿';
  const button=app.querySelector('#language-toggle');
  if(button){const holder=document.createElement('div');holder.innerHTML=languageButtonMarkup();const next=holder.firstElementChild;button.innerHTML=next.innerHTML;for(const attribute of next.attributes)button.setAttribute(attribute.name,attribute.value);}
  localize(app);
}
const editor=createEditor(platform,{
  onChange({source,changedCase}){
    pendingFill=null;
    if(!initialized)return;
    if(changedCase || source==='reset'){
      measurementEditId='';
      ocrAbort?.abort();closeDialog();lensInventory=null;lensInventoryTab='';lastLensFeedback=null;eyeConfirmed=false;draftSource=selectedRecord(library,editor.selection).measurement?.source||'';render();toast('病人或測量已切換，已取消先前的讀取與核對。');
    }else if(source==='edit'){lastLensFeedback=null;updateStatus();updateCounters();}
    else if(source==='eye'){eyeConfirmed=false;if(transferScope!=='OU')transferScope=editor.eye;render();}
    else syncFields();
  },
  onStatus(next){status=next;if(initialized)updateStatus();},
  onError(error){if(initialized)toast(error.message || '資料尚未儲存，請重試。',true);},
});
const currentTab=()=>tabs.find(t=>String(t.id)===String(targetId));
const resultHistory=createResultController({
  sites:SITES,hostTabId,preferredTab:()=>targetId,patients:()=>library.patients,
  currentSelection:()=>editor.selection,sessionGuard:()=>({caseToken:editor.token,revision:editor.revision}),
  isVisible:()=>route==='results',hasDialog:()=>Boolean(document.querySelector('#review-dialog')?.open),
  redraw:render,showDialog,closeDialog,toast,flush:()=>editor.flush(),
});
const measurementKeys=new Set(FIELD_GROUPS.flatMap(group=>group.fields.map(field=>field[0])));
const measureCount=eye=>Object.entries(editor.data.eyes[eye]).filter(([k,v])=>measurementKeys.has(k)&&v!=null&&v!=='').length;
const fieldMeta=key=>FIELD_GROUPS.flatMap(g=>g.fields).find(f=>f[0]===key) || [key,fieldLabel(key),'',''];
const activeData=()=>editor.data.eyes[editor.eye];
const scopeLabel=()=>transferScope==='OU'?'OD+OS':transferScope;
function acceptLibrary(next){if(next&&next.revision>=library.revision)library=next;return library;}
const currentRequirements=(scope=editor.eye)=>currentTab()?.site?deriveRequirements(currentTab().site,inventory,scope,editor.data):{fields:[],requiredKeys:[],availableKeys:[],missing:[],requiredAny:[],capabilities:{both:false}};
const hasDraftMeasurements=()=>Object.values(editor.data.eyes).some(eye=>Object.values(eye).some(v=>v!==''&&v!=null&&v!==false));
function measurementContext(){const {patient,measurement}=selectedRecord(library,editor.selection);return patient?`${patientLabel(patient)} · ${measurement?.label || '新測量工作副本'}`:'未指定病人 · 工作副本';}

function paintToast(){const el=document.querySelector('#toast');if(!el)return;el.textContent=toastMessage;el.className=`toast visible${toastError?' error':''}`;}
function toast(message,error=false){
  toastMessage=message;toastError=error;toastUntil=Date.now()+6500;
  const dialog=document.querySelector('#review-dialog');
  if(error&&dialog?.open){let feedback=dialog.querySelector('.dialog-feedback');if(!feedback){feedback=document.createElement('p');feedback.className='warning-box dialog-feedback';feedback.setAttribute('role','alert');dialog.querySelector('.dialog-heading')?.after(feedback);}feedback.textContent=message;feedback.scrollIntoView?.({block:'nearest'});}
  paintToast();clearTimeout(toast.timer);toast.timer=setTimeout(()=>document.querySelector('#toast')?.classList.remove('visible'),6500);
}
function updateStatus(){
  const el=document.querySelector('#save-status');if(!el)return;
  el.textContent=status.error?'尚未暫存':status.saving||status.dirty?'暫存中…':platform.isExtension?'工作副本已暫存':'預覽 · 目前頁面暫存';
  el.dataset.state=status.error?'error':status.saving||status.dirty?'saving':'saved';
}
function updateCounters(){
  for(const eye of ['OD','OS']){const el=document.querySelector(`[data-count="${eye}"]`);if(el)el.textContent=measureCount(eye);}
  const count=document.querySelector('#eye-count');if(count)count.textContent=`${editor.eye} · ${measureCount(editor.eye)} 項`;
  const caseName=document.querySelector('#case-name');if(caseName){caseName.toggleAttribute('data-i18n-skip',!!(editor.data.patient.patientId||editor.data.patient.name));caseName.replaceChildren(document.createTextNode(editor.data.patient.patientId||editor.data.patient.name||'未命名個案'));}
}
function syncFields(){
  const form=document.querySelector('#biometry-form');
  if(form && form.dataset.toric!==String(!!activeData().toric) && !document.activeElement?.matches('[data-field],[data-patient]')){render();return;}
  const data=editor.data;
  for(const el of app.querySelectorAll('[data-patient],[data-field]')){
    if(el===document.activeElement)continue;
    const value=el.dataset.patient?data.patient[el.dataset.patient]:data.eyes[editor.eye][el.dataset.field];
    if(el.type==='checkbox')el.checked=!!value;else el.value=value??'';
  }
  document.querySelector('#case-name')?.replaceChildren(document.createTextNode(data.patient.patientId || data.patient.name || '未命名個案'));
  syncEyeState();
  updateLensControls(app.querySelector('#lens-section'),{eye:editor.eye,data,catalog:lensCatalog,inventory:lensInventoryTab===targetId?lensInventory:null,search:lensSearch});
  updateCounters();updateStatus();
}
function inputField(key){
  const [,label,description,unit]=fieldMeta(key),value=activeData()[key]??'';
  const required=currentRequirements().requiredKeys.includes(key);
  return `<label class="field ${required?'site-required':''}" for="field-${key}"><span><b>${label}${required?'<em aria-hidden="true">*</em>':''}</b><small>${unit}</small></span><input id="field-${key}" data-field="${key}" aria-label="${editor.eye} ${label}" ${required?'required aria-required="true"':''} title="${esc(description)}${unit?` (${unit})`:''}" inputmode="decimal" autocomplete="off" spellcheck="false" value="${esc(value)}" placeholder="${key==='sia'?`預設 ${esc(settings.defaultSia)}`:key==='incisionAxis'?`預設 ${esc(settings[`defaultIncisionAxis${editor.eye}`])}`:'—'}" /></label>`;
}
function extraSection(title,fields,open=false){return `<details class="extra" ${open?'open':''}><summary>${title}<span>${icon('chevron',13)}</span></summary><div class="field-grid">${fields.map(inputField).join('')}</div></details>`;}
function patientFields(){
  const required=currentRequirements().requiredKeys;
  const fields=[['patientId','ID / 代號'],['name','姓名 / 代稱'],['initials','Initials'],['surgeonId','Surgeon ID'],['surgeonName','醫師姓名'],['age','年齡'],['gender','Gender']];
  const input=([k,label])=>{const needed=required.includes(`patient.${k}`),attr=needed?'required aria-required="true"':'';return `<label class="field"><span><b>${label}${needed?'<em aria-hidden="true">*</em>':''}</b></span>${k==='gender'?`<select aria-label="Gender" data-patient="gender" ${attr}><option value="">未指定</option><option value="male" ${editor.data.patient.gender==='male'?'selected':''}>Male 男</option><option value="female" ${editor.data.patient.gender==='female'?'selected':''}>Female 女</option></select>`:`<input aria-label="${label}" data-patient="${k}" ${attr} value="${esc(editor.data.patient[k])}" ${k==='surgeonName'?`placeholder="預設：${esc(settings.defaultSurgeonName||'OPH')}"`: ''} autocomplete="off" maxlength="150" />`}</label>`;};
  const needed=fields.filter(([k])=>required.includes(`patient.${k}`)),optional=fields.filter(([k])=>!required.includes(`patient.${k}`));
  return `<details class="patient-details"><summary><span class="case-chip">${icon('file',13)}<strong id="case-name" ${editor.data.patient.patientId||editor.data.patient.name?'data-i18n-skip':''}>${esc(editor.data.patient.patientId || editor.data.patient.name || '未命名個案')}</strong></span><span>個案資訊 ${icon('chevron',12)}</span></summary><div class="patient-grid">${optional.map(input).join('')}</div></details>${needed.length?`<div class="patient-grid patient-required">${needed.map(input).join('')}</div>`:''}`;
}
function targetMarkup(){
  const tab=currentTab();
  if(hostTabId!=null)return `<div class="target-context"><span class="status-dot ${tab?'connected':''}"></span><span class="context-label">目前網站</span><strong>${esc(tab?.site.name || (platform.isExtension?'目前非指定計算入口':'懸浮窗預覽'))}</strong><button type="button" class="icon-button" data-action="refresh" aria-label="重新偵測網站">${icon('refresh',13)}</button></div>`;
  return `<div class="target-context"><span class="status-dot ${tab?'connected':''}"></span><label class="sr-only" for="target-tab">目標網站分頁</label><select id="target-tab"><option value="">${platform.isExtension?'選擇已開啟的計算分頁':'預覽模式 · 請載入擴充功能'}</option>${tabs.map(t=>`<option value="${t.id}" ${String(t.id)===targetId?'selected':''}>${esc(t.site.name)} · ${esc(t.title||'')}</option>`).join('')}</select><button type="button" class="icon-button" data-action="refresh" aria-label="重新偵測網站">${icon('refresh',13)}</button></div>`;
}
function syncEyeState(){
  const values=activeData(),legacyKc=values.lvcType==='keratoconus';
  const modes={toric:values.toric===true,keratoconus:values.keratoconus===true||(values.keratoconus==null&&legacyKc)};
  const lvc=!values.lvcType||legacyKc?'none':['none','myopic','hyperopic','rk','unknown'].includes(values.lvcType)?values.lvcType:'unknown';
  app.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(modes[button.dataset.mode])));
  app.querySelectorAll('[data-lvc]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.lvc===lvc)));
  const note=app.querySelector('.lvc-source-note');if(lvc==='unknown'&&!note){const message=document.createElement('p');message.className='lvc-source-note';message.textContent='來源未註明 LVC 類型，請選擇。';app.querySelector('.eye-state-panel')?.append(message);}else if(lvc!=='unknown')note?.remove();
}
function dataMarkup(){
  const toric=!!activeData().toric;
  const req=currentRequirements(),site=currentTab()?.site;
  const numeric=new Set(FIELD_GROUPS.flatMap(g=>g.fields.map(f=>f[0])));
  const common=['al','acd','lt','cct','wtw','k1','k2','target'];
  const constants=new Set(['aConstant','lensFactor','exchangeAConstant','exchangeLensFactor']);
  const siteKeys=[...new Set([...req.requiredKeys,...req.availableKeys,...req.requiredAny.flatMap(g=>g.keys)])].filter(k=>numeric.has(k));
  const main=[...new Set([...common,...req.requiredKeys.filter(k=>numeric.has(k)&&!constants.has(k))])];
  const extras=FIELD_GROUPS.map(g=>({...g,keys:g.fields.map(f=>f[0]).filter(k=>!main.includes(k)&&!constants.has(k)&&(showAllFields||!site||siteKeys.includes(k)))})).filter(g=>g.keys.length);
  const anyNote=req.requiredAny.map(g=>g.keys.map(fieldLabel).join(' / ')).join('；');
  const manual=[...new Set([...(req.unmappedRequired||[]).map(r=>r.label),...req.fields.filter(r=>r.required&&r.manual).map(r=>fieldLabel(r.key))])];
  return `${libraryPicker(library,editor.selection)}${patientFields()}${eyeStateMarkup({eye:editor.eye,values:activeData(),counts:{OD:measureCount('OD'),OS:measureCount('OS')}})}
    <form id="biometry-form" role="tabpanel" aria-labelledby="eye-tab-${editor.eye}" data-toric="${toric}" aria-label="${editor.eye} 生物測量資料" autocomplete="off" novalidate>
    <div class="section-caption measurement-heading"><span>${site?'測量值 · * 此站必填':'測量值'}</span><button type="button" class="field-visibility" id="all-fields" data-action="toggle-fields" aria-pressed="${showAllFields}" aria-describedby="field-visibility-help" title="顯示或隱藏目前網站未使用的額外欄位；不會選取或修改數據">${icon('gear',12)}顯示所有欄位</button></div>
    <p id="field-visibility-help" class="field-visibility-help">${showAllFields?'所有支援欄位皆可展開。':'共用欄位與目前網站需要的欄位。'}</p>
    ${requirementsError?`<p class="dynamic-note">${esc(requirementsError)}</p>`:''}
    ${site?.id==='solver-toric'&&inventory?.prerequisite?.status!=='ready'?`<div class="dynamic-note">DGS Toric 需先完成球面 IOL 計算並在原站選 IOL Power。<button type="button" class="text-button" data-action="dgs-basic">先開基本輸入</button></div>`:''}
    ${manual.length?`<p class="dynamic-note">原站確認：${manual.map(esc).join('、')}</p>`:''}
    <div class="field-grid core-fields ${main.length===8?'common-fields':''}">${main.map(inputField).join('')}</div>
    ${extras.map(g=>extraSection(g.id==='core'?'其他基本欄位':g.title,g.keys,g.keys.some(k=>req.requiredKeys.includes(k)))).join('')}
    ${lensMarkup({eye:editor.eye,data:editor.data,catalog:lensCatalog,inventory:lensInventoryTab===targetId?lensInventory:null,search:lensSearch,open:lensOpen})}${lensFeedbackMarkup()}
    ${extraSection('IOL 常數 · 通常在原站選擇',[...constants].filter(k=>showAllFields||siteKeys.includes(k)))}
    ${showAllFields||req.availableKeys.includes('biometer')?`<label class="field"><span>Biometer</span><input data-field="biometer" placeholder="預設：${esc(settings.defaultBiometer)}" value="${esc(activeData().biometer||'')}"/></label>`:''}
    ${showAllFields||req.availableKeys.includes('posteriorBiometer')?`<label class="field"><span>後角膜測量儀器</span><input data-field="posteriorBiometer" placeholder="保留原站選項" value="${esc(activeData().posteriorBiometer||'')}"/></label>`:''}
    </form>${reportSummaryMarkup(editor.data.report)}<div class="case-tools"><button class="text-button" data-action="save-measurement">${icon('save',13)} 保存為測量</button><button class="icon-button" data-action="export" title="匯出目前測量 JSON" aria-label="匯出目前測量 JSON">${icon('export',15)}</button><button class="icon-button danger-text" data-action="clear" title="清空工作副本" aria-label="清空工作副本">${icon('trash',15)}</button></div>`;
}
function lensFeedbackMarkup(){
  const value=lastLensFeedback;if(!value||value.tabId!==targetId||value.token!==editor.token)return '';
  const warning=value.status!=='applied'||value.geometry;
  return `<p class="${warning?'dynamic-note':'small-note'}" role="status">${esc(value.text)}</p>`;
}
function importMarkup(){
  const provider=settings.ocrProvider==='local'?`本機 PP-OCRv6 ${settings.localModel==='small'?'Small':'Tiny'}`:settings.ocrProvider==='gemini'?'Gemini VLM':'PaddleOCR API';
  return `<div class="section-intro"><h1>匯入測量</h1><p>選擇來源，匯入後可直接在資料頁修改。</p></div>
  <div class="import-methods"><button class="import-method" data-action="read-site" ${busy?'disabled':''}>${icon('copy',22)}<span><strong>複製網站</strong><small>讀取 ${esc(currentTab()?.site.name||'目前計算網站')} 的欄位</small></span>${icon('arrow',14)}</button>
  <button class="import-method paste-image" id="paste-image-zone" data-action="focus-image-paste" aria-describedby="paste-image-help" ${busy?'disabled':''}>${icon('image',22)}<span><strong>貼上截圖</strong><small>截圖或複製圖片後，按 Ctrl + V</small></span><kbd>Ctrl+V</kbd></button>
  <label class="import-method import-file" id="drop-zone"><input class="sr-only" id="ocr-files" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" multiple ${busy?'disabled':''}>${icon('file',22)}<span><strong>PDF / 圖片</strong><small>上傳或拖入檔案 · PDF 可先選頁</small></span>${icon('import',14)}</label>
  <div class="import-method json-method">${icon('json',22)}<span><strong>匯入 JSON</strong><small>biometry-parser、測量、病人資料庫或晶體對照</small></span><div class="json-import-actions"><label class="text-button import-file"><input class="sr-only" id="json-file" type="file" accept="application/json,.json" ${busy?'disabled':''}>${icon('file',13)}上傳 JSON</label><button type="button" class="text-button" data-action="paste-json" ${busy?'disabled':''}>${icon('copy',13)}貼上 JSON</button></div></div></div>
  <p class="import-explanation" id="paste-image-help">Windows：Win + Shift + S 擷取需要的範圍，回到這裡按 Ctrl + V。</p>
  <div class="import-status"><span class="provider-tag">${icon(settings.ocrProvider==='local'?'lock':'gear',12)}${esc(provider)}</span>${busy?'<button class="text-button" data-action="cancel-ocr">取消辨識</button>':'<button class="text-button" data-route="settings">辨識設定</button>'}</div>${importProgressMarkup(importProgress.state)}
  <details class="extra capture-alternative"><summary>${icon('scan',14)}擷取目前網頁${icon('chevron',13)}</summary><p class="small-note">將目前可見的網頁畫面作為圖片辨識。計算網站的表單欄位請使用「複製網站」。</p><button class="button" data-action="screenshot" ${busy?'disabled':''}>${icon('scan',15)}擷取畫面</button></details>
  <details class="extra import-advanced"><summary>${icon('json',14)}匯出與資料格式${icon('chevron',13)}</summary><p class="small-note">JSON 使用版本化格式，包含雙眼、單位、病人及多次測量。匯入資料庫時新增紀錄，保留原有資料。</p><button class="text-button" data-action="export-parser">${icon('export',14)}匯出 biometry-parser JSON</button><button class="text-button" data-action="export">${icon('export',14)}目前測量</button><button class="text-button" data-action="export-library">${icon('export',14)}全部病人與測量</button></details>`;
}
function sitesMarkup(){
  const groups=siteFilter==='all'?FORMULA_GROUPS:FORMULA_GROUPS.filter(g=>g.id===siteFilter);
  const term=search.trim().toLowerCase();
  return `<div class="section-intro"><h1>公式入口 <small>${SITES.length}</small></h1><p>依用途開啟，也可直接使用自己開好的分頁。</p></div><div class="launcher-filters"><label class="sr-only" for="site-group">公式用途</label><select id="site-group"><option value="all">所有用途</option>${FORMULA_GROUPS.map(g=>`<option value="${g.id}" ${siteFilter===g.id?'selected':''}>${esc(g.title)}</option>`).join('')}</select><label class="sr-only" for="site-search">搜尋公式</label><input id="site-search" type="search" placeholder="搜尋公式" value="${esc(search)}"/></div><div id="site-results">${groups.map(group=>{
    const sites=getGroupSites(group).filter(s=>`${s.name} ${SITE_PURPOSES[s.id]}`.toLowerCase().includes(term));
    if(!sites.length)return '';
    return `<section class="site-group"><h2>${esc(group.title)}<small>${sites.length}</small></h2><p>${esc(group.description)}</p>${sites.map(site=>`<article class="site-row"><div class="site-monogram">${site.name.startsWith('Barrett')?'B':site.name.startsWith('EVO')?'E':site.id.startsWith('solver')?'P':site.name[0]}</div><div><strong>${esc(site.name)}</strong><span>${esc(SITE_PURPOSES[site.id])}</span></div><button type="button" class="icon-button" data-open="${site.id}" aria-label="開啟 ${esc(site.name)}">${icon('external',15)}</button></article>`).join('')}</section>`;
  }).join('')||'<p class="empty-note">沒有符合的入口。</p>'}</div><details class="extra"><summary>已開啟的計算分頁 <span>${tabs.length}</span></summary><div class="open-tabs">${tabs.map(t=>`<button class="open-tab" data-focus-tab="${t.id}">${icon('sites',13)}<span>${esc(t.site.name)}</span>${icon('arrow',13)}</button>`).join('')||'<p class="small-note">尚未找到指定網站分頁。</p>'}</div></details><p class="small-note">相同入口可支援多種用途；IOL、特殊模式及最終計算在原網站選擇。</p>`;
}
function settingsMarkup(){return ocrSettingsMarkup()+`<details class="extra"><summary>水晶體選項與對照</summary><p class="small-note">內建 15 個入口的已核對選項與型號／群組對照；複製網站會保留所選品項，貼上時先選晶體再填量測。可收集本頁新選項及站別參數。</p><button type="button" class="button" data-action="collect-lenses">收集本頁晶體選項</button><button type="button" class="text-button" data-action="export-lenses">匯出晶體對照 JSON</button><p class="small-note">可從「匯入 → JSON」載入晶體對照檔。</p></details><details class="extra"><summary>原生合成驗收</summary><p class="small-note">用新分頁與獨立測試資料庫驗證 ${SITES.length} 個入口，完成後匯出欄位核對報告。請在未受 Chrome 接管干擾時手動啟動。</p><button type="button" class="button" data-action="installed-qa">開啟原生合成驗收</button></details>`;}
function ocrSettingsMarkup(){return preferenceSettingsMarkup(settings);}
function footerMarkup(){return `<footer class="action-footer"><div class="transfer-scope"><span>${!scopeExplicit&&currentTab()?.site.eyeMode==='both'?'自動雙眼':'傳輸眼別'}</span><div role="group" aria-label="網站傳輸眼別">${[['OD','OD'],['OS','OS'],['OU','OD+OS']].map(([v,label])=>`<button type="button" data-scope="${v}" aria-pressed="${transferScope===v}" ${busy||(v==='OU'&&currentTab()?.site.eyeMode!=='both')?'disabled':''}>${label}</button>`).join('')}</div></div><div class="save-line"><button class="text-button save-status-button" data-action="save" aria-label="儲存目前個案"><span id="save-status"></span></button><details class="transfer-options"><summary>傳輸選項</summary><label class="check-line"><input type="checkbox" id="transfer-identifiers" ${includeIdentifiers?'checked':''}>包含姓名／ID／醫師</label><label class="check-line"><input type="checkbox" id="transfer-lens" ${includeLens?'checked':''}>貼上已選水晶體</label><label class="check-line"><input type="checkbox" id="transfer-constants" ${includeConstants?'checked':''}>也貼上 IOL 常數</label></details></div><div class="footer-buttons"><button class="button" data-action="read-site" ${busy?'disabled':''}>${icon('copy',14)} 複製網站</button><button class="button primary" data-action="preview-fill" ${busy?'disabled':''}>貼上 ${scopeLabel()}${icon('arrow',14)}</button></div></footer>`;}
function syncTransferScope(){transferScope=resolveTransferScope(currentTab()?.site,inventory,{requested:transferScope,explicit:scopeExplicit,activeEye:editor.eye});}
function render(){
  releaseReview();releaseReview=()=>{};
  syncTransferScope();
  const lensSection=app.querySelector('#lens-section');if(lensSection)lensOpen=lensSection.open;
  const scroll=app.querySelector('.panel-scroll')?.scrollTop||0;
  app.innerHTML=`<section class="compact-panel" aria-label="Biometry-Clip"><header class="panel-brand"><span><img class="brand-icon" src="./icons/48.png" width="26" height="26" alt=""/><strong>Biometry-Clip</strong></span><div class="brand-actions"><span class="version">v${esc(extensionVersion)}</span>${floating?'':languageButtonMarkup()}</div></header><div class="panel-tabs" role="tablist" aria-label="功能分頁">${panelTabs.map(([r,i,label])=>`<button type="button" role="tab" id="tab-${r}" data-route="${r}" aria-selected="${route===r}" tabindex="${route===r?'0':'-1'}">${icon(i,15)}${label}</button>`).join('')}</div>${route==='results'?'':targetMarkup()}<main id="current-panel" role="tabpanel" aria-labelledby="tab-${route}" class="panel-scroll">${!platform.isExtension?'<div class="preview-note">介面預覽 · 網站讀寫需載入 Chrome 擴充功能</div>':''}${({data:dataMarkup,patients:()=>libraryMarkup(library,editor.selection),import:importMarkup,results:()=>resultHistory.markup(),sites:sitesMarkup,settings:settingsMarkup})[route]()}</main>${route==='data'||route==='import'?footerMarkup():`<footer class="quiet-footer"><span id="save-status"></span><button class="text-button" data-route="data">回到資料${icon('arrow',13)}</button></footer>`}</section>${floating?'':workbenchHelp(route)}<div id="toast" role="status" class="toast"></div><dialog id="review-dialog" aria-labelledby="dialog-title"></dialog>`;
  app.querySelector('.panel-scroll').scrollTop=scroll;
  bindEvents();updateStatus();if(Date.now()<toastUntil)paintToast();localize(app);
}
function navigate(next,focus=false){
  if(!panelTabs.some(([key])=>key===next))return;
  route=next;pendingFill=null;render();app.querySelector('.panel-scroll').scrollTop=0;
  if(focus)document.querySelector(`#tab-${next}`).focus();
  if(next==='results')resultHistory.refresh();
}
function bindEvents(){
  app.querySelector('#biometry-form')?.addEventListener('submit',e=>e.preventDefault());
  app.querySelectorAll('[data-field],[data-patient]').forEach(el=>{
    el.addEventListener('input',()=>{
      const value=el.type==='checkbox'?el.checked:el.value;
      editor.edit(el.dataset.patient?{patient:{[el.dataset.patient]:value}}:{eyes:{[editor.eye]:{[el.dataset.field]:value}}});
      el.removeAttribute('aria-invalid');
      if(el.dataset.field==='toric')render();
    });
    el.addEventListener('blur',()=>{
      const message=el.dataset.field?validateCase(editor.data).find(x=>x.startsWith(`${editor.eye} ${fieldLabel(el.dataset.field)}：`)):null;
      el.setAttribute('aria-invalid',String(!!message));if(message)toast(message,true);
      queueMicrotask(()=>{if(needsRequirementRender&&!document.activeElement?.matches('[data-field],[data-patient]')){needsRequirementRender=false;render();}else syncFields();});
    });
  });
  app.querySelector('[role="tablist"]')?.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const routes=panelTabs.map(([key])=>key),i=routes.indexOf(route);
    navigate(routes[event.key==='Home'?0:event.key==='End'?routes.length-1:(i+(event.key==='ArrowRight'?1:routes.length-1))%routes.length],true);
  });
  app.querySelector('.eye-choices[role="tablist"]')?.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();const next=event.key==='Home'?'OD':event.key==='End'?'OS':editor.eye==='OD'?'OS':'OD';
    if(next!==editor.eye)editor.setEye(next);app.querySelector(`[data-eye="${next}"]`)?.focus({preventScroll:true});
  });
  app.querySelector('#target-tab')?.addEventListener('change',event=>{targetId=event.target.value;inventory=null;lensInventory=null;lensInventoryTab='';scopeExplicit=false;eyeConfirmed=false;pendingFill=null;});
  app.querySelector('#target-tab')?.addEventListener('change',()=>refreshInventory(true));
  app.querySelector('#transfer-identifiers')?.addEventListener('change',event=>{includeIdentifiers=event.target.checked;});
  app.querySelector('#transfer-constants')?.addEventListener('change',event=>{includeConstants=event.target.checked;});
  app.querySelector('#transfer-lens')?.addEventListener('change',event=>{includeLens=event.target.checked;});
  app.querySelector('#lens-section')?.addEventListener('toggle',event=>{lensOpen=event.currentTarget.open;});
  app.querySelector('#lens-search')?.addEventListener('input',event=>{lensSearch=event.target.value;updateLensControls(app.querySelector('#lens-section'),{eye:editor.eye,data:editor.data,catalog:lensCatalog,inventory:lensInventoryTab===targetId?lensInventory:null,search:lensSearch});});
  app.querySelector('#lens-picker')?.addEventListener('change',async event=>{try{const entry=lensCatalog.entries.find(item=>item.id===event.target.value);if(!entry)return;editor.edit(lensPatchFromEntry(entry,editor.eye));await editor.flush();render();toast('已選擇水晶體，可直接貼上已核對的公式對應選項。');}catch(error){toast(error.message,true);}});
  app.querySelector('#lens-source-picker')?.addEventListener('change',async event=>{try{if(event.target.value==='')return;const snapshot=lensInventory?.snapshots?.[Number(event.target.value)];if(!snapshot||lensInventoryTab!==targetId)return;editor.edit(lensPatchFromSource(snapshot,editor.eye,lensCatalog));await editor.flush();render();toast('已複製指定來源的水晶體。');}catch(error){toast(error.message,true);}});

  app.querySelector('#patient-picker')?.addEventListener('change',event=>{const id=event.target.value;if(id)requestSelection(id,null);else render();});
  app.querySelector('#measurement-picker')?.addEventListener('change',event=>{const id=event.target.value;if(id)requestSelection(editor.selection?.patientId,id);else render();});
  app.querySelectorAll('[data-select-measurement],[data-select-all-measurements]').forEach(input=>input.addEventListener('change',()=>{
    const patientId=input.dataset.patientId||input.dataset.selectAllMeasurements;
    const boxes=[...app.querySelectorAll('[data-select-measurement]')].filter(item=>item.dataset.patientId===patientId);
    if(input.dataset.selectAllMeasurements)boxes.forEach(item=>{item.checked=input.checked;});
    const count=boxes.filter(item=>item.checked).length,all=[...app.querySelectorAll('[data-select-all-measurements]')].find(item=>item.dataset.selectAllMeasurements===patientId),button=[...app.querySelectorAll('[data-delete-selected]')].find(item=>item.dataset.deleteSelected===patientId);
    if(all){all.checked=count===boxes.length;all.indeterminate=count>0&&count<boxes.length;}
    if(button){button.disabled=!count;button.querySelector('span').textContent=count?`刪除 ${count} 筆`:'刪除已選';}
  }));
  app.querySelector('#site-group')?.addEventListener('change',event=>{siteFilter=event.target.value;render();});
  app.querySelector('#site-search')?.addEventListener('input',event=>{
    search=event.target.value;
    const next=document.createElement('template');next.innerHTML=sitesMarkup();
    app.querySelector('#site-results').replaceChildren(...next.content.querySelector('#site-results').childNodes);
  });
  app.querySelector('#ocr-files')?.addEventListener('change',event=>{const files=[...event.target.files];event.target.value='';processFiles(files);});
  app.querySelector('#json-file')?.addEventListener('change',async event=>{
    try{const token=editor.token,guard=editor.guard,file=event.target.files[0];event.target.value='';if(!file)return;if(file.size>JSON_IMPORT_LIMIT)throw new Error('JSON 檔案上限為 10 MB。');await importJsonText(await file.text(),{token,guard});}catch(error){toast(error.message,true);}
  });
  const drop=app.querySelector('#drop-zone');
  drop?.addEventListener('dragover',event=>{event.preventDefault();drop.classList.add('drag-over');});
  drop?.addEventListener('dragleave',()=>drop.classList.remove('drag-over'));
  drop?.addEventListener('drop',event=>{event.preventDefault();drop.classList.remove('drag-over');if(!busy)processFiles([...event.dataTransfer.files]);});
  app.querySelector('#settings-form')?.addEventListener('submit',async event=>{
    event.preventDefault();const next={...platform.defaultSettings,...Object.fromEntries(new FormData(event.currentTarget))};
    try{Object.assign(next,transferSettings(next,{strict:true}));await platform.requestCloudPermission(next);await platform.saveSettings(next);settings=next;toast('偏好與辨識設定已儲存。');}catch(error){toast(error.message,true);}
  });
}

app.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.action==='toggle-language'){applyLanguage(getLanguage()==='en'?'zh-TW':'en');try{await platform.saveLanguage?.(getLanguage());}catch{toast('無法儲存語言偏好，請重試。',true);}return;}
  if(button.dataset.route)return navigate(button.dataset.route);
  if(button.dataset.eye){editor.setEye(button.dataset.eye);app.querySelector(`[data-eye="${editor.eye}"]`)?.focus({preventScroll:true});return;}
  if(['toric','keratoconus'].includes(button.dataset.mode)){
    const key=button.dataset.mode,values=activeData(),legacy=values.lvcType==='keratoconus';
    const selected=key==='toric'?values.toric===true:values.keratoconus===true||(values.keratoconus==null&&legacy);
    const patch={[key]:!selected};
    if(legacy){patch.lvcType='none';if(key==='toric'&&values.keratoconus==null)patch.keratoconus=true;}
    editor.edit({eyes:{[editor.eye]:patch}});render();app.querySelector(`[data-mode="${key}"]`)?.focus({preventScroll:true});return;
  }
  if(['none','myopic','hyperopic','rk'].includes(button.dataset.lvc)){
    const value=button.dataset.lvc,values=activeData(),patch={lvcType:value};
    if(values.lvcType==='keratoconus'&&values.keratoconus==null)patch.keratoconus=true;
    editor.edit({eyes:{[editor.eye]:patch}});render();app.querySelector(`[data-lvc="${value}"]`)?.focus({preventScroll:true});return;
  }
  if(button.dataset.scope){scopeExplicit=true;transferScope=button.dataset.scope;if(transferScope!=='OU'&&editor.eye!==transferScope)editor.setEye(transferScope);eyeConfirmed=false;pendingFill=null;render();return;}
  try{
    if(button.dataset.editPatient)return showEditPatientDialog(button.dataset.editPatient);
    if(button.dataset.deletePatient)return showDeleteRecordsDialog(button.dataset.deletePatient);
    if(button.dataset.deleteMeasurement)return showDeleteRecordsDialog(button.dataset.patientId,[button.dataset.deleteMeasurement]);
    if(button.dataset.deleteSelected){const ids=[...app.querySelectorAll('[data-select-measurement]:checked')].filter(item=>item.dataset.patientId===button.dataset.deleteSelected).map(item=>item.dataset.selectMeasurement);return showDeleteRecordsDialog(button.dataset.deleteSelected,ids);}
    if(button.dataset.copyMeasurement)return await copyMeasurement(button.dataset.patientId,button.dataset.copyMeasurement);
    if(button.dataset.editMeasurement)return await requestSelection(button.dataset.patientId,button.dataset.editMeasurement,false,'edit');
    if(button.dataset.activatePatient)return await requestSelection(button.dataset.activatePatient,null);
    if(button.dataset.loadPatient)return await requestSelection(button.dataset.loadPatient,button.dataset.loadMeasurement);
    if(button.dataset.open){await editor.flush();const tab=await platform.openSite(SITES.find(s=>s.id===button.dataset.open));if(tab){await refreshTabs();try{await platform.showFloating(tab.id);}catch{toast('網站已開啟；載入完成後點擴充功能即可開啟懸浮窗。');}}return;}
    if(button.dataset.focusTab){await editor.flush();await chrome.tabs.update(Number(button.dataset.focusTab),{active:true});await platform.showFloating(Number(button.dataset.focusTab));return;}
    switch(button.dataset.action){
      case 'toggle-fields':showAllFields=!showAllFields;render();app.querySelector('#all-fields')?.focus({preventScroll:true});break;
      case 'clear-lens':{const keys=['iolSourceSite','iolSourceValue','iolSourceLabel','iolSourceControl','iolSourceManufacturer','iolSourceRole','iolCatalogId'];editor.edit({eyes:{[editor.eye]:Object.fromEntries(keys.map(key=>[key,'']))}});await editor.flush();render();toast('已清除目前眼的晶體選擇。');break;}
      case 'collect-lenses':{await refreshTabs();if(!targetId)throw new Error('請先選擇計算網站分頁。');const tab=targetId,token=editor.token;busy=true;render();try{const captured=await platform.readLensOptions(tab,{collect:true,eye:transferScope});if(tab!==targetId||token!==editor.token)throw new Error('個案或分頁已切換，已取消收集。');const snapshots=captured.snapshots||[captured];if(!snapshots.some(item=>item.status==='read'))throw new Error('未讀到可唯一確認的晶體控制；請先完成原站必要選擇。');await platform.collectLensSnapshot(captured);lensCatalog=await platform.loadLensCatalog();lensInventory=captured;lensInventoryTab=tab;toast(`已保存 ${snapshots.reduce((n,item)=>n+(item.options?.length||0),0)} 個本站晶體選項及站別參數。`);}finally{busy=false;render();}break;}
      case 'export-lenses':{const document=await platform.loadLensCatalog();if(!document.sources.length)throw new Error('請先收集網站晶體選項或匯入晶體對照檔。');downloadJson(document,'biometry-lens-catalog.json');toast('已匯出晶體選項與網站參數。');break;}
      case 'dgs-basic':await editor.flush();await platform.openSite(SITES.find(site=>site.id==='solver-regular'));break;
      case 'installed-qa':await editor.flush();if(!platform.isExtension)throw new Error('請先載入 Chrome 擴充功能。');await chrome.tabs.create({url:chrome.runtime.getURL(`index.html?view=qa&cylinderConvention=${['minus','plus','preserve'].includes(settings.cylinderConvention)?settings.cylinderConvention:'minus'}`)});break;
      case 'refresh':await refreshTabs();await refreshInventory(true);render();break;
      case 'save':await editor.flush();toast('已儲存，可切換至其他網站分頁。');break;
      case 'create-patient':showPatientDialog();break;
      case 'save-measurement':await showMeasurementDialog();break;
      case 'new-measurement':if(editor.selection?.patientId)await requestSelection(editor.selection.patientId,null);else showPatientDialog();break;
      case 'export-library':{
        const records=await platform.loadLibrary();const url=URL.createObjectURL(new Blob([JSON.stringify(exportLibraryDocument(records),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='biometry-patients.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已匯出所有病人與測量備份。');break;
      }
      case 'read-site':await readSite();break;
      case 'preview-fill':await previewFill();break;
      case 'cancel-ocr':ocrAbort?.abort();break;
      case 'focus-image-paste':document.querySelector('#paste-image-zone')?.focus();toast('請按 Ctrl+V 貼上剛截取或複製的圖片。');break;
      case 'paste-json':showJsonPasteDialog();break;
      case 'screenshot':await previewScreenshot();break;
      case 'export':{
        await editor.flush();const url=URL.createObjectURL(new Blob([JSON.stringify(exportCaseDocument(editor.data),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='biometry-case.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已匯出本次個案。');break;
      }
      case 'export-parser':await editor.flush();downloadJson(exportParserDocument(editor.data),'biometry-parser.json');toast('已匯出 biometry-parser JSON。');break;
      case 'clear':{
        showDialog('建立空白個案',`<p>將清除所有分頁共用的雙眼與識別資料。其他懸浮窗會同步更新。</p><div class="dialog-actions"><button class="button" data-close>取消</button><button class="button danger" id="confirm-clear">清除並新增</button></div>`);
        document.querySelector('#confirm-clear').onclick=async()=>{try{await editor.clear();closeDialog();render();toast('已建立空白個案。');}catch(error){toast(error.message,true);}};break;
      }
    }
  }catch(error){toast(error.message || '操作失敗，請重試。',true);}
});
async function refreshTabs(){
  tabs=await platform.siteTabs();
  if(hostTabId!=null){targetId=String(hostTabId);return;}
  if(!tabs.some(t=>String(t.id)===targetId))targetId=String(tabs.find(t=>t.active)?.id || (tabs.length===1?tabs[0].id:''));
}
async function refreshInventory(redraw=false){
  if(inspectionRunning || !initialized || !targetId || !currentTab() || !platform.isExtension)return;
  inspectionRunning=true;
  const capturedId=targetId;
  try{
    const next=await platform.inspectTab(capturedId,editor.data,{eye:editor.eye},'inspect');
    if(capturedId!==targetId)return;
    const old=currentRequirements().signature;inventory=next;requirementsError='';const previousScope=transferScope;syncTransferScope();
    if(transferScope==='OU'&&next.profile?.eyeMode!=='both')transferScope=editor.eye;
    const changed=old!==currentRequirements().signature||previousScope!==transferScope;
    if((changed||redraw)&&!document.querySelector('#review-dialog')?.open){
      if(!document.activeElement?.matches('[data-field],[data-patient]'))render();
      else{needsRequirementRender=true;for(const input of app.querySelectorAll('[data-field]')){const required=currentRequirements().requiredKeys.includes(input.dataset.field);input.required=required;input.setAttribute('aria-required',String(required));}}
    }
  }catch(error){requirementsError='即時偵測暫不可用，依已核對的網站欄位提示。';if(redraw)toast(error.message,true);}
  finally{inspectionRunning=false;}
}
function draftMatchesSaved(){
  const {patient,measurement}=selectedRecord(library,editor.selection);
  if(!measurement){const baseline=patient?.patient||emptyCase().patient;return !hasDraftMeasurements()&&PATIENT_FIELDS.every(k=>(editor.data.patient[k]??'')===(baseline[k]??''));}
  const current=editor.data;
  return JSON.stringify(current.eyes)===JSON.stringify(measurement.eyes)&&JSON.stringify(current.patient)===JSON.stringify(measurement.patient);
}
async function requestSelection(patientId,measurementId,confirmed=false,intent='load'){
  if(!patientId)return;
  if(!confirmed&&!draftMatchesSaved()){
    const guard=editor.guard;
    showDialog('切換病人或測量',`<p>目前工作副本尚未保存為測量。切換會以所選紀錄取代面板資料，已保存的歷史測量不受影響。</p><div class="dialog-actions"><button class="button" data-close>返回保存</button><button class="button primary" id="confirm-selection">仍然切換</button></div>`);
    document.querySelector('#confirm-selection').onclick=()=>guard===editor.guard?requestSelection(patientId,measurementId,true,intent):toast('工作副本已更新，請重新選擇測量。',true);return;
  }
  try{
    const guard=editor.guard,token=editor.token;
    await editor.flush();
    if(guard!==editor.guard||token!==editor.token)throw new Error('工作副本已更新，請重新選擇測量。');
    const record=measurementId?await platform.selectMeasurement(patientId,measurementId,editor.token,editor.revision):await platform.activatePatient(patientId,editor.token,editor.revision);
    editor.accept(record,'reset');measurementEditId=intent==='edit'?measurementId:'';closeDialog();navigate('data');if(measurementEditId)toast('已帶入編輯；修改欄位後按保存即可更新這筆測量。');await refreshInventory();
  }catch(error){toast(error.message,true);}
}
async function showEditPatientDialog(patientId){
  try{
    await editor.flush();acceptLibrary(await platform.loadLibrary());
    const patient=library.patients.find(item=>item.id===patientId);if(!patient)throw new Error('找不到病人，請重新操作。');
    const guard=editor.guard,options={patientId,caseToken:editor.token,revision:editor.revision,expectedLibraryRevision:library.revision};
    showDialog('編輯病人',`<div class="patient-grid">${[['patientId','ID / 代號'],['name','姓名 / 代稱'],['initials','Initials']].map(([key,label])=>`<label class="field"><span>${label}</span><input data-edit-patient-field="${key}" value="${esc(patient.patient[key])}" maxlength="150" autocomplete="off"/></label>`).join('')}<label class="field"><span>Gender</span><select data-edit-patient-field="gender"><option value="">未指定</option><option value="male" ${patient.patient.gender==='male'?'selected':''}>男</option><option value="female" ${patient.patient.gender==='female'?'selected':''}>女</option></select></label></div><p class="small-note">識別資料會同步到此病人的測量；各次測量的年齡、醫師與眼部數值保留。</p><div class="dialog-actions"><button class="button" data-close>取消</button><button class="button primary" id="edit-patient-confirm">保存</button></div>`);
    document.querySelector('#edit-patient-confirm').onclick=async event=>{
      const button=event.currentTarget;
      try{
        if(guard!==editor.guard)throw new Error('工作副本已更新，請重新編輯病人。');
        const identity={...patient.patient};document.querySelectorAll('[data-edit-patient-field]').forEach(input=>{identity[input.dataset.editPatientField]=input.value.trim();});
        if(!identity.patientId&&!identity.name)throw new Error('請填寫病人代號或姓名。');
        button.disabled=true;const result=await platform.editPatient({...options,patient:identity});acceptLibrary(result.library);if(result.session)editor.accept(result.session,'reset');closeDialog();render();toast('已更新病人識別資料。');
      }catch(error){button.disabled=false;toast(error.message,true);}
    };
  }catch(error){toast(error.message,true);}
}
async function showDeleteRecordsDialog(patientId,measurementIds){
  try{
    if(measurementIds&&!measurementIds.length)return;
    await editor.flush();acceptLibrary(await platform.loadLibrary());
    const patient=library.patients.find(item=>item.id===patientId);if(!patient)throw new Error('找不到病人，請重新操作。');
    if(measurementIds?.some(id=>!patient.measurements.some(item=>item.id===id)))throw new Error('所選測量已變更，請重新選取。');
    const count=measurementIds?.length??patient.measurements.length,guard=editor.guard,options={patientId,measurementIds,caseToken:editor.token,revision:editor.revision,expectedLibraryRevision:library.revision};
    showDialog(measurementIds?'刪除測量':'刪除病人',`<p><span data-i18n-skip>${esc(patientLabel(patient))}</span>：將刪除${measurementIds?`選取的 ${count} 筆測量`:`此病人與全部 ${count} 筆測量`}。此操作無法復原。</p><p class="small-note">目前工作副本的雙眼資料會保留。</p><div class="dialog-actions"><button class="button" data-close>取消</button><button class="button danger" id="delete-records-confirm">${icon('trash',14)} 刪除</button></div>`);
    document.querySelector('#delete-records-confirm').onclick=async event=>{
      const button=event.currentTarget;
      try{
        if(guard!==editor.guard)throw new Error('工作副本已更新，請重新選取要刪除的紀錄。');
        button.disabled=true;const result=measurementIds?await platform.deleteMeasurements(options):await platform.deletePatient(options);
        acceptLibrary(result.library);if(result.session)editor.accept(result.session,'reset');closeDialog();render();toast(`已刪除${measurementIds?`${count} 筆測量`:'病人與全部測量'}；目前工作副本已保留。`);
      }catch(error){button.disabled=false;toast(error.message,true);}
    };
  }catch(error){toast(error.message,true);}
}
async function copyMeasurement(patientId,measurementId,confirmed=false){
  if(!confirmed&&!draftMatchesSaved()){
    const guard=editor.guard;
    showDialog('複製測量',`<p>將建立獨立副本並帶入編輯。目前工作副本的未保存修改會被取代。</p><div class="dialog-actions"><button class="button" data-close>取消</button><button class="button primary" id="copy-measurement-confirm">複製並帶入</button></div>`);
    document.querySelector('#copy-measurement-confirm').onclick=()=>guard===editor.guard?copyMeasurement(patientId,measurementId,true):toast('工作副本已更新，請重新複製。',true);return;
  }
  try{
    const guard=editor.guard,token=editor.token;await editor.flush();if(guard!==editor.guard||token!==editor.token)throw new Error('工作副本已更新，請重新複製。');
    const revision=editor.revision,result=await platform.duplicateMeasurement({patientId,measurementId,expectedLibraryRevision:library.revision,caseToken:token,revision});acceptLibrary(result.library);
    if(guard!==editor.guard||token!==editor.token||revision!==editor.revision){closeDialog();render();return toast('副本已建立；工作副本已更新，未自動帶入。');}
    const record=await platform.selectMeasurement(patientId,result.measurement.id,token,revision);editor.accept(record,'reset');measurementEditId=result.measurement.id;closeDialog();navigate('data');toast('已建立並帶入獨立副本；修改後保存即可。');
  }catch(error){toast(error.message,true);}
}
function localDateTime(value){const d=value?new Date(value):new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
function showPatientDialog(){
  const token=editor.token,guard=editor.guard;
  showDialog('新增病人',`<label class="field"><span>病人 ID / 代號</span><input id="new-patient-id" autocomplete="off"/></label><label class="field"><span>姓名 / 代稱</span><input id="new-patient-name" autocomplete="off"/></label><p class="small-note">資料保存在本機，關閉瀏覽器後仍保留。可用去識別代號。</p><div class="dialog-actions"><button class="button" data-close>取消</button><button class="button primary" id="create-patient-confirm">新增病人</button></div>`);
  document.querySelector('#create-patient-confirm').onclick=async event=>{
    if(token!==editor.token)return toast('工作副本已切換，請重新操作。',true);
    const identity={patientId:document.querySelector('#new-patient-id').value.trim(),name:document.querySelector('#new-patient-name').value.trim()};
    if(!identity.patientId&&!identity.name)return toast('請填寫病人代號或姓名。',true);
    event.currentTarget.disabled=true;
    try{const result=await platform.createPatient(identity);acceptLibrary(result.library);closeDialog();if(token!==editor.token||guard!==editor.guard)return toast('病人已新增；工作副本已更新，未自動切換。');await requestSelection(result.patient.id,null);}catch(error){toast(error.message,true);event.target.disabled=false;}
  };
}
async function showMeasurementDialog(){
  await editor.flush();acceptLibrary(await platform.loadLibrary());
  const token=editor.token,guard=editor.guard,libraryRevision=library.revision,{patient,measurement}=selectedRecord(library,editor.selection),data=editor.data;
  const editing=measurement?.id===measurementEditId;
  const label=editing?measurement.label:`${translate('測量')} ${new Intl.DateTimeFormat(getLanguage(),{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date())}`;
  showDialog('保存目前測量',`<p class="dialog-source">${patient?`<span data-i18n-skip>${esc(patientLabel(patient))}</span>`:'將從目前個案資訊新增病人'}</p>${!patient?`<label class="field"><span>病人 ID / 代號</span><input id="save-patient-id" value="${esc(data.patient.patientId)}"/></label><label class="field"><span>姓名 / 代稱</span><input id="save-patient-name" value="${esc(data.patient.name)}"/></label>`:''}<label class="field"><span>測量名稱</span><input id="measurement-label" value="${esc(label)}"/></label><label class="field"><span>測量日期時間</span><input id="measurement-at" type="datetime-local" value="${localDateTime(editing?measurement.measuredAt:undefined)}"/></label><label class="field"><span>來源 / 儀器</span><input id="measurement-source" value="${esc(draftSource || translate('手動輸入'))}"/></label>${measurement?`<label class="check-line"><input id="overwrite-measurement" type="checkbox" ${editing?'checked':''}/>更新目前這筆測量（取消勾選會另存新測量）</label>`:''}<p class="small-note">同一筆紀錄同時保存 OD 與 OS。保存後可隨時帶入任一公式。</p><div class="dialog-actions"><button class="button" data-close>取消</button><button class="button primary" id="save-measurement-confirm">保存測量</button></div>`);
  document.querySelector('#save-measurement-confirm').onclick=async event=>{
    if(token!==editor.token||guard!==editor.guard)return toast('工作副本已更新，請關閉後重新核對。',true);
    const errors=validateCase(editor.data);if(errors.length)return toast(errors[0],true);
    const label=document.querySelector('#measurement-label').value.trim(),at=document.querySelector('#measurement-at').value,source=document.querySelector('#measurement-source').value;
    const overwrite=!!document.querySelector('#overwrite-measurement')?.checked;
    if(!label||!at)return toast('請填寫測量名稱與日期時間。',true);
    const newIdentity=!patient?{patientId:document.querySelector('#save-patient-id').value.trim(),name:document.querySelector('#save-patient-name').value.trim()}:null;
    if(newIdentity&&!newIdentity.patientId&&!newIdentity.name)return toast('請填寫病人代號或姓名。',true);
    event.currentTarget.disabled=true;
    let saved=false;
    try{
      let patientId=patient?.id;
      if(!patientId){const created=await platform.createPatient({...data.patient,...newIdentity});patientId=created.patient.id;acceptLibrary(created.library);if(token!==editor.token||guard!==editor.guard)throw new Error('工作副本已變更，請重新保存。');editor.edit({patient:newIdentity});await editor.flush();}
      if(token!==editor.token)throw new Error('工作副本已切換，請重新保存。');
      const saveToken=editor.token,saveRevision=editor.revision,saveGuard=editor.guard;
      const result=await platform.saveMeasurement({patientId,label,measuredAt:new Date(at).toISOString(),source,measurementId:overwrite?measurement.id:undefined,expectedLibraryRevision:overwrite?libraryRevision:undefined,caseToken:saveToken,revision:saveRevision,data:editor.data});
      saved=true;acceptLibrary(result.library);
      if(saveToken!==editor.token||saveRevision!==editor.revision||saveGuard!==editor.guard){closeDialog();render();return toast('測量已保存；工作副本已更新，未自動切換。');}
      const record=await platform.selectMeasurement(patientId,result.measurement.id,saveToken,saveRevision);editor.accept(record,'reset');closeDialog();render();toast('已保存測量；原有歷史紀錄保持獨立。');
    }catch(error){toast(saved?'測量已保存，但未能切換；可從病人分頁重新帶入。':error.message,true);event.target.disabled=false;}
  };
}
async function importJsonText(content,{token=editor.token,guard=editor.guard}={}){
  if(token!==editor.token||guard!==editor.guard)throw new Error('個案已變更，已取消這次匯入。');
  if(content.length>JSON_IMPORT_LIMIT||new Blob([content]).size>JSON_IMPORT_LIMIT)throw new Error('JSON 檔案上限為 10 MB。');
  let value;try{value=JSON.parse(content.replace(/^\uFEFF/,''));}catch{throw new Error('JSON 無法解析，未匯入。');}
  if(value?.format==='biometry-lens-catalog'){
    const catalog=parseLensCatalogDocument(value);await platform.saveLensCatalog(catalog);lensCatalog=await platform.loadLensCatalog();closeDialog();toast(`已匯入 ${catalog.sources.length} 站晶體選項、${catalog.entries.length} 筆精確對照。`);return;
  }
  const parsed=parseInterchange(value);
  if(parsed.kind==='library'){
    const result=await platform.importPatients(parsed.data.patients,library.revision);acceptLibrary(result.library);
    if(token===editor.token&&guard===editor.guard){closeDialog();navigate('patients');}
    toast(`已新增 ${result.imported.length} 位病人的測量，原有紀錄保留。`);
  }else if(parsed.kind==='parser-batch')showParserBatchPicker(parsed.documents,{token,guard});
  else reviewJsonResult(parsed);
}
function reviewJsonResult(parsed){
  const parserDocument=parsed.source==='biometry-parser';
  reviewCandidates(parsed.data,parserDocument?'匯入 biometry-parser':'JSON 測量匯入','',parsed.warnings,{
    parserDocument,unverifiedFields:parsed.unverifiedFields,measurementDate:parsed.measurementDate,
  });
}
function showParserBatchPicker(documents,{token,guard}){
  const available=documents.filter(item=>item.parsed);
  const {patients,revision}=library;
  showDialog('選擇要匯入的報告',parserBatchMarkup(documents,patients));
  const dialog=document.querySelector('#review-dialog');
  const checkboxes=[...dialog.querySelectorAll('[data-parser-batch-index]')];
  if(!checkboxes.length){dialog.querySelector('[data-close]')?.focus();return;}
  const target=dialog.querySelector('#parser-batch-patient');
  const newPatientFields=dialog.querySelector('#parser-batch-new-patient');
  const newId=dialog.querySelector('#parser-batch-patient-id');
  const newName=dialog.querySelector('#parser-batch-patient-name');
  const identityNote=dialog.querySelector('#parser-batch-identity-note');
  const review=dialog.querySelector('#review-parser-document');
  const save=dialog.querySelector('#save-parser-batch');
  const controls=[...checkboxes,target,newId,newName];
  let saving=false;
  function selection(){
    const records=available.filter((_,index)=>checkboxes[index].checked);
    const ids=records.map(item=>item.parsed.data.patient.patientId.trim());
    const knownIds=[...new Set(ids.filter(Boolean))];
    const suggestedId=knownIds.length===1?knownIds[0]:'';
    return {records,ids,suggestedId};
  }
  function updateActions(){
    const {records,ids,suggestedId}=selection();
    const creating=target.value==='new';
    newPatientFields.hidden=!creating;
    identityNote.hidden=!ids.includes('');
    newId.placeholder=suggestedId;
    review.disabled=saving||records.length!==1;
    save.disabled=saving||!records.length||!target.value||(creating&&!newId.value.trim()&&!newName.value.trim()&&!suggestedId);
    for(const control of controls)control.disabled=saving;
  }
  for(const checkbox of checkboxes)checkbox.onchange=updateActions;
  target.onchange=updateActions;
  newId.oninput=newName.oninput=updateActions;
  review.onclick=()=>{
    if(token!==editor.token||guard!==editor.guard)return toast('個案已變更，已取消這次匯入。',true);
    const {records}=selection();
    if(records.length===1)reviewJsonResult(records[0].parsed);
  };
  save.onclick=async()=>{
    if(saving||save.disabled)return;
    if(token!==editor.token||guard!==editor.guard)return toast('個案已變更，已取消這次匯入。',true);
    const {records,suggestedId}=selection();
    const measurements=records.map(({label,pages,parsed})=>({
      label:label||'VGHKS-bot PDF',
      measuredAt:parsed.measurementDate?`${parsed.measurementDate}T00:00:00.000Z`:'',
      source:pages.length?`VGHKS-bot · p.${[...new Set(pages)].sort((a,b)=>a-b).join(',')}`:'VGHKS-bot',
      data:parsed.data,
    }));
    const destination=target.value==='new'
      ? {patient:{patientId:newId.value.trim()||suggestedId,name:newName.value.trim()}}
      : {patientId:patients[Number(target.value)].id};
    saving=true;
    updateActions();
    try{
      const result=await platform.importMeasurements({...destination,measurements,expectedLibraryRevision:revision});
      acceptLibrary(result.library);
      if(dialog.open&&dialog.contains(save)&&token===editor.token&&guard===editor.guard){
        closeDialog();
        navigate('patients',true);
        for(const record of app.querySelectorAll('.patient-record')){
          if(record.querySelector('[data-activate-patient]')?.dataset.activatePatient===result.patientId)record.open=true;
        }
      }
      toast(`已保存 ${result.importedCount} 筆測量，略過 ${result.skippedDuplicateCount} 筆重複紀錄。`);
    }catch(error){
      toast(error.message,true);
    }finally{
      saving=false;
      updateActions();
    }
  };
  checkboxes[0].focus();
}
function showJsonPasteDialog(){
  const token=editor.token,guard=editor.guard;
  showDialog('貼上 JSON',`<p class="small-note">貼上 biometry-parser 或 Biometry-Clip 匯出的 JSON，再按匯入。文字貼上不會自動讀取或儲存。</p><label class="field json-paste-field"><span>JSON 內容</span><textarea id="json-paste-content" rows="9" autocomplete="off" spellcheck="false" autocapitalize="off" aria-label="JSON 內容"></textarea></label><p class="small-note">JSON 檔案上限為 10 MB。</p><div class="dialog-actions"><button type="button" class="button" data-close>取消</button><button type="button" class="button primary" id="import-pasted-json">${icon('import',14)}匯入 JSON</button></div>`);
  document.querySelector('#import-pasted-json').onclick=async event=>{
    const button=event.currentTarget;button.disabled=true;
    try{await importJsonText(document.querySelector('#json-paste-content').value,{token,guard});}catch(error){button.disabled=false;toast(error.message,true);}
  };
  document.querySelector('#json-paste-content').focus();
}
function showDialog(title,body){
  releaseReview();releaseReview=()=>{};
  const dialog=document.querySelector('#review-dialog');
  dialog.classList.remove('import-review-dialog');
  dialog.innerHTML=`<div class="dialog-heading"><h2 id="dialog-title">${esc(title)}</h2><button class="icon-button" data-close aria-label="關閉">${icon('close')}</button></div>${body}`;
  dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=closeDialog);
  if(!dialog.open)dialog.showModal();
  dialog.onclose=()=>{releaseReview();releaseReview=()=>{};dialog.classList.remove('import-review-dialog');pendingFill=null;if(route==='results')resultHistory.scheduleRefresh();};localize(dialog);
}
function closeDialog(){releaseReview();releaseReview=()=>{};const el=document.querySelector('#review-dialog');if(el?.open)el.close();pendingFill=null;}
function downloadJson(document,filename){const url=URL.createObjectURL(new Blob([JSON.stringify(document,null,2)],{type:'application/json'}));const link=window.document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function readOptions(){return {eye:transferScope,includeIdentifiers,includeConstants,includeLens,eyeConfirmed:scopeExplicit,cylinderConvention:settings.cylinderConvention||'minus',identityFallbacks:settings.identityFallbacks!==false,transferDefaults:transferSettings(settings)};}
async function applyImportedCase(candidate,source){
  const clean=cleanCase(candidate),{patch,rows}=patchFromCase(clean);
  if(!rows.length)throw new Error('沒有可帶入的數值，請檢查來源或手動輸入。');
  const next=mergeCandidates(editor.data,clean,rows),errors=validateCase(next);
  if(errors.length)throw new Error(errors[0]);
  editor.edit(reconcileLensPatch(editor.data,patch));await editor.flush();draftSource=source;navigate('data');toast(`已複製 ${rows.length} 項，可直接切到另一網站貼上。`);return rows.length;
}
async function readSite(){
  if(busy)return;await editor.flush();await refreshTabs();
  if(!targetId)throw new Error('請先開啟或選擇計算網站分頁。');
  const token=editor.token,guard=editor.guard,tabId=targetId;busy=true;render();
  try{
    const detected=await platform.inspectTab(tabId,editor.data,{eye:editor.eye},'inspect');
    if(token!==editor.token||guard!==editor.guard)throw new Error('工作副本已變更，請重新複製。');
    inventory=detected;syncTransferScope();
    if(detected.eyeMode!=='both'&&!detected.detectedEye&&!scopeExplicit)throw new Error('原站尚未選眼別。請先在面板選 OD 或 OS，再複製；不會切換原站以免清除資料。');
    const scope=transferScope,result=await platform.inspectTab(tabId,editor.data,readOptions(),'read');
    if(token!==editor.token||guard!==editor.guard||tabId!==targetId)throw new Error('工作副本或目標已變更，請重新複製。');
    lensInventory=result.lensInventory||null;lensInventoryTab=lensInventory?tabId:'';
    const candidate=caseFromReadRows(result.rows,scope,{profile:result.profile});
    for(const eye of scope==='OU'?['OD','OS']:[scope]){
      const sources=(lensInventory?.snapshots||[]).filter(item=>item.role==='primary'&&item.selected&&(!item.eye||item.eye===eye));
      if(sources.length===1)try{Object.assign(candidate.eyes[eye],lensPatchFromSource(sources[0],eye,lensCatalog).eyes[eye]);}catch{/* Leave uncertain lens identities for the explicit source picker. */}
    }

    const copied=await applyImportedCase(candidate,`${result.profile.name} 網站複製`);
    if((result.lensInventory?.snapshots?.length||result.lensSnapshot?.status==='read')&&platform.collectLensSnapshot)try{await platform.collectLensSnapshot(result.lensInventory||result.lensSnapshot);if(platform.loadLensCatalog)lensCatalog=await platform.loadLensCatalog();}catch{toast('網站數據已複製；晶體目錄未能保存，可再從設定收集。',true);}
    const notices=[...new Set((result.warnings||[]).filter(value=>typeof value==='string'&&value))];
    if(notices.length)toast(`已複製 ${copied} 項。${notices.join(' ')}`);
  }finally{busy=false;render();}
}
function reviewCandidates(candidate,source,text='',warnings=[],context={}){
  const clean=cleanCase({patient:candidate.patient||{},eyes:candidate.eyes||{OD:{},OS:{}},...(candidate.report?{report:candidate.report}:{})});
  const current=editor.data,rows=[],token=editor.token,guard=editor.guard;
  for(const key of PATIENT_FIELDS)if(clean.patient[key]!=='')rows.push({eye:'patient',key,value:clean.patient[key],old:current.patient[key]});
  for(const eye of ['OD','OS'])for(const key of EYE_FIELDS)if(clean.eyes[eye][key]!=null&&clean.eyes[eye][key]!=='')rows.push({eye,key,value:clean.eyes[eye][key],old:current.eyes[eye][key]});
  const sources=reviewSources(context.files,context.selection);
  for(const [index,row]of rows.entries()){
    row.index=index;row.confidence=candidate.fieldConfidence?.[`${row.eye}.${row.key}`];
    row.unverified=context.unverifiedFields?.has(`${row.eye}.${row.key}`)===true;
    const evidence=(candidate.evidence||[]).filter(item=>item.eye===row.eye&&item.key===row.key&&item.fileIndex!=null);
    const chosen=evidence.find(item=>item.confidence===row.confidence)||evidence[0];
    if(chosen)row.source={fileIndex:chosen.fileIndex,pageNumber:chosen.pageNumber};
  }
  const messages=[...new Set([...warnings,...(candidate.warnings||[])])];
  showDialog('核對並儲存',reviewMarkup({rows,messages,source,text,sources,report:clean.report,allowUnverifiedSelection:context.parserDocument===true,measurementDate:context.measurementDate,measurementDateUnverified:context.unverifiedFields?.has('measurementDate')===true,sourceExpanded:!window.matchMedia?.('(max-width:650px)')?.matches}));
  const dialog=document.querySelector('#review-dialog');dialog.classList.add('import-review-dialog');
  const duration=dialog.querySelector('#review-duration');if(duration&&Number.isFinite(context.elapsedMs))duration.textContent=`耗時 ${formatElapsed(context.elapsedMs)}`;
  releaseReview=bindReviewPreview(dialog,{sources,rows,loadSource:(item,{signal})=>loadReviewSource(item,{inspectPdf:context.inspectPdf,signal})});
  localize(dialog);
  dialog.querySelector('#select-new-candidates')?.addEventListener('click',()=>{
    for(const row of rows)if(row.old===undefined||row.old===null||row.old==='')dialog.querySelector(`[data-candidate="${row.index}"]`).checked=true;
  });
  document.querySelector('#reparse-ocr')?.addEventListener('click',async()=>{const {parseBiometry}=await import('./ocr/index.js');const value=document.querySelector('#review-raw-text').value;reviewCandidates(parseBiometry(value),'原文重新解析',value,[],context);});
  document.querySelector('#apply-candidates').onclick=async event=>{
    if(token!==editor.token || guard!==editor.guard)return toast('共用資料已變更，請關閉後重新核對。',true);
    const selections=[...document.querySelectorAll('[data-candidate]:checked')].map(el=>rows[Number(el.dataset.candidate)]);
    rows.forEach((r,i)=>{const value=document.querySelector(`[data-candidate-value="${i}"]`).value;if(r.eye==='patient')clean.patient[r.key]=value;else clean.eyes[r.eye][r.key]=['toric','keratoconus'].includes(r.key)?value==='true':value;});
    const next=mergeCandidates(editor.data,clean,selections),errors=validateCase(next);
    if(errors.length)return toast(errors[0],true);
    const sourcePatient=clean.report?.patient_id,sourceId=sourcePatient?.status==='verified'?sourcePatient.value:sourcePatient?.candidate_value;
    if(selections.length&&clean.report&&next.patient.patientId.trim()&&typeof sourceId==='string'&&sourceId.trim()&&next.patient.patientId.trim()!==sourceId.trim())return toast('來源報告病人 ID 與工作副本不一致，請核對病人 ID 或清空工作副本後再匯入。',true);
    const patch={};for(const r of selections){if(r.eye==='patient')(patch.patient||={})[r.key]=next.patient[r.key];else((patch.eyes||={})[r.eye]||={})[r.key]=next.eyes[r.eye][r.key];}
    if(selections.length&&clean.report)patch.report=clean.report;
    event.currentTarget.disabled=true;
    try{editor.edit(reconcileLensPatch(editor.data,patch));await editor.flush();draftSource=source;closeDialog();navigate('data');toast(`已帶入 ${selections.length} 項工作副本，可到另一分頁貼上或保存為測量。`);}catch(error){toast(error.message,true);event.target.disabled=false;}
  };
}
async function previewFill(){
  if(busy)return;await editor.flush();await refreshTabs();syncTransferScope();
  const errors=validateCase(editor.data);if(errors.length)throw new Error(errors[0]);
  if(!targetId)throw new Error('請先開啟或選擇計算網站分頁。');
  const token=editor.token,guard=editor.guard,tabId=targetId,data=editor.data,opts={...readOptions(),caseToken:editor.token,revision:editor.revision};busy=true;render();
  try{
    let result;
    if(platform.quickFillTab)result=await platform.quickFillTab(tabId,data,opts);
    else{
      const effective=applyTransferDefaults(data,opts.transferDefaults,currentTab()?.site);
      const plan=await platform.inspectTab(tabId,effective,opts,'preview'),ready=plan.rows.filter(row=>row.status==='ready');
      if(token!==editor.token||guard!==editor.guard||tabId!==targetId)throw new Error('資料或目標已變更，請重新貼上。');
      if(!ready.length)throw new Error('尚無可貼入欄位；請確認原站已開啟表單及所需模式。');
      result=await platform.inspectTab(tabId,effective,{...opts,expected:ready,expectedSiteId:plan.siteId,expectedUrl:plan.tabUrl,expectedFrameUrl:plan.url},'apply',plan.frameId);
    }
    const count=result.rows.filter(row=>row.status==='filled').length,skipped=result.rows.filter(row=>!['filled','skipped'].includes(row.status)).length;
    const lensResult=result.lensPreparation;
    if(lensResult&&lensResult.status!=='skipped'){
      const applied=(lensResult.plans||[]).filter(item=>item.status==='ready'),geometry=applied.some(item=>(item.precision||item.kind)==='geometry');
      const labels=[...new Set(applied.map(item=>`${item.label||item.value}${(item.precision||item.kind)==='model'?'（型號）':(item.precision||item.kind)==='geometry'?'（幾何）':'（系列／群組）'}`))];
      lastLensFeedback={tabId,token,status:lensResult.status,geometry,text:lensResult.status==='applied'?`晶體已選：${labels.join('、')||'已讀回核對'}。${geometry?'只套用幾何設定；請核對目的站 A constant。':''}`:`晶體未完整套用。${(lensResult.warnings||[])[0]||'請在原站核對品項；量測資料仍依對應貼入。'}`};
    }
    const lensNote=result.lensPreparation?.status==='applied'?` 已套用 ${(result.lensPreparation.controls||[]).filter(item=>['applied','already-selected'].includes(item.status)).length} 個晶體控制。`:'';
    const preference=result.displayPreference,displayNote=preference?.status==='manual'?' 柱鏡顯示尚未套用，請在原站確認。':['applied','already-selected'].includes(preference?.status)?` 柱鏡顯示 ${preference.value==='minus'?'−ve':'+ve'}。`:'';
    const notices=[...new Set((result.warnings||[]).filter(value=>typeof value==='string'&&value&&value!==preference?.reason))];
    toast(`已貼上 ${count} 項${skipped?`，${skipped} 項未對應。`:'。'}${displayNote}${lensNote}${notices.slice(0,2).join(' ')}`);
  }finally{busy=false;render();}
}
async function cloudConsent(){
  if(settings.ocrProvider==='local')return true;
  return new Promise(resolve=>{
    const destination=settings.ocrProvider==='gemini'?'Google Gemini API':paddleApiEndpoint(settings);
    showDialog('確認雲端辨識',`<p>本次報告影像／PDF 頁面將傳送至 <strong>${esc(destination)}</strong> 辨識，內容可能包含病人資料。</p><div class="dialog-actions"><button class="button" id="cloud-cancel">取消</button><button class="button primary" id="cloud-confirm">同意本次傳送</button></div>`);
    let done=false;const finish=value=>{if(done)return;done=true;closeDialog();resolve(value);};
    const dialog=document.querySelector('#review-dialog');dialog.addEventListener('cancel',()=>finish(false),{once:true});dialog.addEventListener('close',()=>finish(false),{once:true});
    document.querySelector('#cloud-cancel').onclick=()=>finish(false);document.querySelector('#cloud-confirm').onclick=()=>finish(true);
  });
}
async function processFiles(files){
  if(busy||!files.length)return;
  const token=editor.token;let result;const reviewContext={files:Array.from(files)};
  ocrAbort=new AbortController();const controller=ocrAbort;busy=true;progress='正在讀取報告…';importProgress.start(progress);render();
  const reportProgress=message=>importProgress.update(message);
  try{
    if(files.some(file=>file.size>20*1024*1024))throw new Error('單檔上限為 20 MB。');
    const ocr=await import('./ocr/index.js');
    const selection=await choosePdfPages(files,{inspectPdf:ocr.inspectPdf,showDialog,closeDialog,document,signal:controller.signal,onProgress:reportProgress});
    if(!selection||controller.signal.aborted||token!==editor.token)return;
    Object.assign(reviewContext,{selection,inspectPdf:ocr.inspectPdf});importProgress.start('辨識中…');
    let cloudApproved=false;
    const beforeCloudRequest=async()=>{if(controller.signal.aborted||token!==editor.token)return false;if(!cloudApproved){importProgress.pause();try{cloudApproved=await cloudConsent();}finally{importProgress.resume();}}return cloudApproved&&!controller.signal.aborted&&token===editor.token;};
    result=await ocr.recognizeFiles(files,settings,reportProgress,{...selection,signal:controller.signal,beforeCloudRequest});
  }catch(error){if(!controller.signal.aborted&&error.name!=='AbortError')toast(error.message,true);}
  finally{importProgress.finish();reviewContext.elapsedMs=importProgress.state.elapsedMs;busy=false;progress='';if(ocrAbort===controller)ocrAbort=null;render();}
  if(result&&token===editor.token&&!controller.signal.aborted)reviewCandidates(result.candidates,'辨識結果',result.text,result.warnings,reviewContext);
}
async function previewScreenshot(){
  await editor.flush();const token=editor.token,image=await platform.captureTab(targetId?Number(targetId):undefined);
  if(token!==editor.token)throw new Error('個案已變更，已取消這次擷取。');
  showDialog('核對擷取畫面',`<p>確認目前可見的網頁畫面後開始辨識。</p><img class="capture-preview" src="${image}" alt="目前網頁擷取畫面"/><div class="dialog-actions"><button class="button" data-close>取消</button><button class="button primary" id="recognize-capture">辨識這張畫面</button></div>`);
  document.querySelector('#recognize-capture').onclick=async()=>{
    closeDialog();
    try{
      const ocr=await import('./ocr/index.js');
      if(token!==editor.token)return;
      const blob=ocr.decodeImageDataUrl(image);
      await processFiles([new File([blob],'capture.png',{type:blob.type})]);
    }catch(error){if(token===editor.token)toast(error.message||'無法讀取擷取畫面，請重新擷取。',true);}
  };
}
async function init(){
  try{
    applyLanguage(await Promise.resolve(platform.loadLanguage?.()).catch(()=> 'en') ?? 'en');stopLocalization=observeLocalization(app);unsubscribeLanguage=platform.subscribeLanguage?.(applyLanguage)||(()=>{});draftSource=translate(draftSource);const loaded=await editor.init();settings={...platform.defaultSettings,...loaded.settings,...transferSettings(loaded.settings)};
    platform.subscribeLibrary(next=>{acceptLibrary(next);const focused=document.activeElement?.matches('input,textarea,select');if(initialized&&!focused&&!document.querySelector('#review-dialog')?.open)render();});
    acceptLibrary(await platform.loadLibrary());transferScope=editor.eye;if(platform.loadLensCatalog)lensCatalog=await platform.loadLensCatalog();
    await refreshTabs();if(hostTabId!=null&&!currentTab())route='results';initialized=true;render();if(route==='results')resultHistory.refresh();window.dispatchEvent(new Event('biometry:panel-ready'));platform.reportPanelStatus?.('ready')?.catch(()=>{});await refreshInventory(true);
    platform.subscribeTabs(()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(async()=>{try{await refreshTabs();if(route==='results'){resultHistory.scheduleRefresh();return;}await refreshInventory();const hasFocus=app.contains(document.activeElement)&&document.activeElement.matches('input,textarea,select');if(!hasFocus&&!document.querySelector('#review-dialog')?.open)render();}catch(error){toast(error.message,true);}},150);});
    setInterval(()=>{if(!document.hidden&&!document.querySelector('#review-dialog')?.open)refreshInventory().catch(()=>{});},1800);
  }
  catch(error){app.innerHTML=`<div class="startup-error"><h1>無法開啟共用資料</h1><p>${esc(error.message)}</p><button class="button" id="retry">重新載入</button></div>`;localize(app);document.querySelector('#retry').onclick=()=>location.reload();window.dispatchEvent(new Event('biometry:panel-failed'));platform.reportPanelStatus?.('error')?.catch(()=>{});}
}
const unbindImagePaste=bindImagePaste(document,{isEnabled:()=>initialized&&route==='import'&&!busy&&!document.querySelector('#review-dialog')?.open,onImages:files=>processFiles(files),onError:error=>toast(error.message||'無法貼上圖片，請改用上傳。',true)});
app.addEventListener('click',event=>{resultHistory.handleClick(event);});
app.addEventListener('change',event=>resultHistory.handleChange(event));
window.addEventListener('pagehide',()=>{resultHistory.dispose();releaseReview();importProgress.finish();stopLocalization();unsubscribeLanguage();unbindImagePaste();ocrAbort?.abort();editor.flushOnExit().catch(()=>{});});
document.addEventListener('visibilitychange',()=>{if(document.hidden)editor.flush().catch(()=>{});else if(initialized)refreshTabs().then(()=>refreshInventory()).catch(()=>{});});
init();

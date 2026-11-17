import { SITES } from '../sites.js';
import {getLanguage,setLanguage,translate,localize,observeLocalization,languageButtonMarkup} from '../i18n.js';
import {loadLanguage,saveLanguage,subscribeLanguage} from '../platform.js';

const labels={idle:'待繼續',pending:'尚未驗證',running:'驗證中',waiting:'需人工準備','needs-manual':'需人工驗證',complete:'已處理所有網站',passed:'已通過',skipped:'已略過',error:'失敗',failed:'失敗',blocked:'受阻',partial:'部分欄位',manual:'需人工準備','not-applicable':'不適用',not_applicable:'不適用',unverified:'尚未驗證'};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const status=value=>labels[typeof value==='object'?value?.status:value]||'尚未驗證';
const displayStatus={applied:'已套用','already-selected':'已選定',preserved:'保留原站',unsupported:'尚未對應',manual:'需人工驗證'};
function displayPreferencesMarkup(site){const values=Object.entries(site.displayPreferences||{});return values.length?values.map(([eye,preference])=>`<p>${esc(eye)} ${preference.value==='minus'?'−ve':preference.value==='plus'?'+ve':'—'} · <span>${esc(displayStatus[preference.status]||'尚未驗證')}</span></p>`).join(''):'尚未驗證';}


/** User-started UI only: mounting and rendering never invoke a Chrome API. */
export function mountQaApp({document:doc,window:win,api,createRunner,languageStorage={loadLanguage,saveLanguage,subscribeLanguage}}) {
  const app=doc.querySelector('#app');
  if(!app)throw new Error('Missing QA mount');
  const native=!!api.isExtension&&win.location.protocol==='chrome-extension:';
  let runner,busy=false,consent=false,error='',eyeAcknowledgement='',disposed=false,languageChanged=false;
  const render=()=>{
    const state=runner?.state||{status:'idle',sites:[],storageChecks:[]};
    const started=!!state.runId,done=state.status==='complete',waiting=state.status==='waiting';
    const current=state.sites[state.currentIndex];
    const currentName=SITES.find(site=>site.id===current?.siteId)?.name||current?.siteId||'';
    const reports=state.sites.flatMap(site=>(site.actions||[]).map(action=>({siteId:site.siteId,...action})));
    app.innerHTML=`<main class="qa-page"><header class="qa-header"><div><p>BIOMETRY-CLIP · v${esc(api.extensionVersion||'preview')}</p><h1>原生合成驗收</h1><p>測試情境刻意包含 Toric 與近視 LASIK 病史（Myopic），用來核對特殊欄位；一般空白個案的 LVC 預設為 No。</p></div><div class="qa-header-tools">${languageButtonMarkup()}<span class="qa-badge">${SITES.length} 個指定入口</span></div></header>
      <p class="qa-lead">使用真正的 Chrome 分頁與讀寫 API，逐站測試 OD／OS、雙眼表單、Toric 與 LVC。所有保存動作使用獨立測試資料庫。</p>
      <section class="qa-instructions" aria-label="操作說明"><ol><li>請在未由助理接管 Chrome 時操作，保留此驗收分頁。</li><li>開始後按「驗證下一步」，每次只開啟或驗證一個測試網站；程式只填入本次新開分頁。</li><li>若網站要求切換眼別、啟用特殊模式或同意條款，請自行檢視並操作，再回此頁按「重試目前網站」。不需按計算。</li><li>完成或受阻時皆可匯出 JSON，交回核對。一般欄位通過不代表特殊模式通過。</li></ol></section>
      ${!native?'<p class="qa-warning" role="alert">此頁僅供預覽。請在已載入的 Chrome 擴充功能「設定」中開啟原生驗收。</p>':''}
      <label class="qa-consent"><input id="qa-consent" type="checkbox" ${consent?'checked':''} ${started||!native?'disabled':''}>我確認僅使用合成測試資料，並同意將合成欄位送至這 ${SITES.length} 個計算網站的新分頁。</label>
      ${current?.awaitingEye?`<label class="qa-consent qa-warning"><input id="qa-eye-confirm" type="checkbox" ${eyeAcknowledgement===current.awaitingEye?'checked':''} ${busy?'disabled':''}>已在原網站核對目前為 ${esc(current.awaitingEye)}；此表單無法自動辨識眼別，此次將記錄人工確認。</label>`:''}
      <nav class="qa-controls" aria-label="驗收動作"><button class="button primary" data-qa="start" ${!native||!consent||started||busy?'disabled':''}>開始合成驗收</button><button class="button primary" data-qa="next" ${!native||!started||busy||done||waiting||state.status==='error'?'disabled':''}>驗證下一步</button><button class="button" data-qa="retry" ${!native||!waiting||busy||(current?.awaitingEye&&eyeAcknowledgement!==current.awaitingEye)?'disabled':''}>重試目前網站</button><button class="button" data-qa="skip" ${!native||!started||busy||done||!current||state.status==='error'?'disabled':''}>略過目前網站</button><button class="button" data-qa="export" ${!started||busy?'disabled':''}>匯出 JSON</button></nav>
      <section class="qa-progress" aria-live="polite"><strong><span>${esc(status(state.status))}</span>${currentName&&!done?` · <span data-i18n-skip>${esc(currentName)}</span>`:''}</strong><p>${esc(state.message||'尚未啟動；開啟此頁不會操作網站或讀取病人資料。')}</p>${error?`<p role="alert" class="qa-warning">${esc(error)}</p>`:''}</section>
      <section aria-labelledby="qa-storage-title"><h2 id="qa-storage-title">本機保存與切換</h2>${state.storageChecks.length?`<ul class="qa-checks">${state.storageChecks.map(check=>`<li><strong>${esc(status(check.status))}</strong> ${esc(check.name)}${check.detail?`<small>${esc(check.detail)}</small>`:''}</li>`).join('')}</ul>`:'<p>啟動後驗證多病人、多次測量、歷史副本與選取。</p>'}</section>
      <section aria-labelledby="qa-sites-title"><h2 id="qa-sites-title">逐站欄位與跨分頁保存</h2><p>「已通過」須配合各筆 OD／OS／OD+OS 明細判讀。略過、受阻與未測項目保留原狀。</p><div class="qa-table-wrap"><table><caption class="sr-only">${SITES.length} 個網站驗收狀態</caption><thead><tr><th scope="col">網站</th><th scope="col">讀寫流程</th><th scope="col">Toric</th><th scope="col">LVC</th><th scope="col">柱鏡顯示</th><th scope="col">操作與備註</th></tr></thead><tbody>${state.sites.map(site=>`<tr><th scope="row" data-i18n-skip>${esc(SITES.find(item=>item.id===site.siteId)?.name||site.siteId)}</th><td>${esc(status(site.status))}</td><td>${esc(status(site.toric))}</td><td>${esc(status(site.lvc))}</td><td>${displayPreferencesMarkup(site)}</td><td>${site.tabId?`<button class="text-button" data-qa="focus" data-site="${esc(site.siteId)}" ${busy?'disabled':''}>切至測試分頁</button>`:''}${(site.notes||[]).map(note=>`<p>${esc(note)}</p>`).join('')}${site.actions?.length?`<details><summary>${site.actions.length} 筆驗證明細</summary><pre data-i18n-skip>${esc(JSON.stringify(site.actions,null,2))}</pre></details>`:''}</td></tr>`).join('')}</tbody></table></div></section>
      <footer class="qa-footnote"><span>只保存隔離的合成資料與驗證結果；不會更動一般病人資料庫、工作副本或 API 設定。驗收不會自動接受條款、選擇人工水晶體或提交計算。</span>${reports.length?` <span>目前 ${reports.length} 筆動作紀錄。</span>`:''}</footer></main>`;
    doc.documentElement.lang=getLanguage();
    doc.title=translate('Biometry-Clip · 原生合成驗收');
    localize(app);
  };
  const stopObserving=observeLocalization(app);
  const updateLanguage=language=>{if(disposed)return;setLanguage(language);render();};
  const unsubscribeLanguage=languageStorage.subscribeLanguage?.(language=>{languageChanged=true;updateLanguage(language);})||(()=>{});
  const destroy=()=>{disposed=true;stopObserving();unsubscribeLanguage();};
  win.addEventListener('pagehide',destroy,{once:true});
  runner=createRunner(api,{onUpdate:render});
  app.addEventListener('change',event=>{if(event.target.id==='qa-consent'){consent=event.target.checked;render();}if(event.target.id==='qa-eye-confirm'){eyeAcknowledgement=event.target.checked?runner.state.sites[runner.state.currentIndex]?.awaitingEye||'':'';render();}});
  app.addEventListener('click',async event=>{
    if(event.target.closest('[data-action="toggle-language"]')){
      languageChanged=true;
      const language=getLanguage()==='en'?'zh-TW':'en';
      updateLanguage(language);
      // Interface preference only; QA state and exported evidence remain intact.
      try{await languageStorage.saveLanguage?.(language);}catch{/* The current page keeps the selected language. */}
      return;
    }
    const button=event.target.closest('[data-qa]');
    if(!button||button.disabled||busy)return;
    const action=button.dataset.qa;
    if(action==='export'){
      const report=runner.exportReport();
      const url=win.URL.createObjectURL(new win.Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
      const link=doc.createElement('a');link.href=url;link.download=`biometry-synthetic-qa-${String(runner.state.runId).replace(/[^a-zA-Z0-9_-]/g,'-')}.json`;link.click();win.setTimeout(()=>win.URL.revokeObjectURL(url),1000);return;
    }
    if(!native)return;
    if(action==='start'&&!consent)return;
    if(action!=='retry')eyeAcknowledgement='';
    busy=true;error='';render();
    try{
      if(action==='focus'){
        const site=runner.state.sites.find(item=>item.siteId===button.dataset.site);
        if(site?.tabId)await win.chrome.tabs.update(site.tabId,{active:true});
      }else if(action==='start')await runner.start();
      else if(action==='next')await runner.runNext();
      else if(action==='retry'){const confirmedEye=eyeAcknowledgement;eyeAcknowledgement='';await runner.retryCurrent({confirmedEye});}
      else if(action==='skip')await runner.skipCurrent();
    }catch(cause){error=`此步驟未完成，請保留報告並重試。${/^[A-Z0-9_]{1,50}$/.test(cause?.code||'')?`（${cause.code}）`:''}`;}
    finally{busy=false;render();}
  });
  doc.body.classList.add('qa-body');
  render();
  Promise.resolve(languageStorage.loadLanguage?.()).then(language=>{if(!disposed&&!languageChanged&&language)updateLanguage(language);}).catch(()=>{});
  win.dispatchEvent(new win.Event('biometry:panel-ready'));
  return {get runner(){return runner;},destroy};
}

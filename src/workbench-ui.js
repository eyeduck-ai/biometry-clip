import {icon,escapeHtml as esc} from './ui.js';
import {GEMINI_MODELS,PADDLE_API_MODELS,DEFAULT_GEMINI_MODEL,DEFAULT_PADDLE_MODEL,isCustomPaddleApi} from './ocr/cloud-config.js';
import {apiHelpMarkup} from './api-help.js';

const help={
  data:['輸入一次，切站貼上','copy','複製來源網站','在已填資料的計算網站，按「複製」。手動修改的數值會自動保存。','arrow','切到另一個公式','在另一個計算網站開啟懸浮窗，選 OD、OS 或雙眼後按「貼上」。'],
  patients:['同一病人，多次比較','patients','先選病人，再選測量','每筆測量同時保存 OD 與 OS。帶入歷史紀錄後可直接貼到計算網站。','copy','保留原始測量','用複製建立另一筆可編輯的測量；刪除與編輯都在病人清單中操作。'],
  import:['選擇你的資料來源','image','圖片與 PDF','Win + Shift + S 截圖後，回到匯入頁按 Ctrl + V。PDF 可先選擇頁碼。','json','結構化 JSON','交換單筆雙眼測量、整個病人資料庫或晶體對照；也可匯出備份。'],
  sites:['依用途開啟公式','sites','一般、Toric 與特殊眼','用分類找到需要的公式。也可自行開啟網站分頁。','eye','回到網站直接操作','指定網站使用窄版懸浮窗；這個工作台保留較寬的編輯與管理空間。'],
  settings:['讓常用資料自動補上','gear','偏好參數','預設醫師、儀器、SIA 與切口軸向只在缺值時套用，已有資料優先。','scan','辨識模型','本機 OCR 不需 API key；雲端模型與連線資料在獨立區塊設定。'],
};

export function workbenchHelp(route='data'){
  const [title,i1,t1,p1,i2,t2,p2]=help[route]||help.data;
  return `<aside class="workbench-help" aria-label="操作說明"><div class="help-eyebrow">BIOMETRY WORKSPACE</div><h1>${title}</h1><p class="help-lead">把重複輸入留給工具，專注核對測量與計算。</p><div class="help-step">${icon(i1,20)}<div><h2>${t1}</h2><p>${p1}</p></div></div><div class="help-step">${icon(i2,20)}<div><h2>${t2}</h2><p>${p2}</p></div></div><div class="help-reference"><h2>欄位速查</h2><dl><div><dt>AL</dt><dd>眼軸長</dd></div><div><dt>ACD</dt><dd>前房深度</dd></div><div><dt>LT</dt><dd>水晶體厚度</dd></div><div><dt>CCT</dt><dd>中央角膜厚度 · µm</dd></div><div><dt>WTW</dt><dd>白到白距離</dd></div><div><dt>K1 / K2</dt><dd>角膜屈光力</dd></div><div><dt>Target</dt><dd>目標屈光度</dd></div></dl></div><button type="button" class="button help-launch" data-route="sites">${icon('sites',16)}開啟計算公式${icon('arrow',14)}</button></aside>`;
}

export function preferenceSettingsMarkup(settings){
  const modelSelect=(name,label,options,defaultValue)=>`<label class="field"><span>${label}</span><select name="${name}">${options.map(([value,title])=>`<option value="${esc(value)}" ${(settings[name]||defaultValue)===value?'selected':''}>${esc(title)}</option>`).join('')}${settings[name]&&!options.some(([value])=>value===settings[name])?`<option value="${esc(settings[name]??'')}" selected data-i18n-skip>${esc(settings[name]??'')}</option>`:''}</select></label>`;
  const field=(name,label,attr='')=>`<label class="field"><span>${label}</span><input name="${name}" value="${esc(settings[name]??'')}" ${attr}/></label>`;
  return `<div class="section-intro"><h1>設定</h1><p>偏好參數與辨識模型分開管理。</p></div><form id="settings-form" aria-label="偏好與辨識設定">
  <fieldset class="settings-section"><legend>${icon('gear',17)}偏好參數</legend><p>缺少資料時套用；手動輸入的值優先。</p><div class="field-grid preferences-grid">
  ${field('defaultSurgeonName','預設醫師名稱','maxlength="150" placeholder="OPH"')}
  ${field('defaultBiometer','預設測量儀器','list="biometer-options" maxlength="100"')}
  ${field('defaultSia','SIA · D','inputmode="decimal" required')}
  ${field('defaultIncisionAxisOD','OD 切口軸向 · °','inputmode="decimal" required')}
  ${field('defaultIncisionAxisOS','OS 切口軸向 · °','inputmode="decimal" required')}
  <datalist id="biometer-options"><option value="IOLMaster 700"></option><option value="Argos"></option><option value="IOLMaster 500"></option><option value="Lenstar"></option></datalist>
  <label class="field"><span>柱鏡顯示</span><select name="cylinderConvention">${[['minus','−ve（負柱鏡）優先'],['plus','+ve（正柱鏡）'],['preserve','保留原站顯示']].map(([v,n])=>`<option value="${v}" ${(settings.cylinderConvention||'minus')===v?'selected':''}>${n}</option>`).join('')}</select></label></div>
  <label class="field"><span>必填病人識別欄位</span><select name="identityFallbacks"><option value="true" ${settings.identityFallbacks!==false?'selected':''}>缺少 Initials／姓名時使用 ID 或代稱</option><option value="false" ${settings.identityFallbacks===false?'selected':''}>只填完全相同的欄位</option></select></label><p class="small-note">空白 LVC 以 No 處理。EVO CCT 固定使用 µm。</p></fieldset>
  <fieldset class="settings-section"><legend>${icon('scan',17)}辨識模型</legend><p>本機優先；雲端辨識會在傳送前確認。</p><div class="field-grid"><label class="field"><span>辨識引擎</span><select name="ocrProvider">${[['local','本機 PaddleOCR'],['gemini','Gemini API'],['paddle-api','PaddleOCR API']].map(([v,n])=>`<option value="${v}" ${settings.ocrProvider===v?'selected':''}>${n}</option>`).join('')}</select></label><label class="field"><span>本機模型</span><select name="localModel"><option value="small" ${settings.localModel==='small'?'selected':''}>Small</option><option value="tiny" ${settings.localModel==='tiny'?'selected':''}>Tiny</option></select></label></div>
  <details class="extra" ${settings.ocrProvider==='gemini'?'open':''}><summary>Gemini API${icon('chevron',13)}</summary>${field('geminiApiKey','API key','type="password" autocomplete="new-password"')}${modelSelect('geminiModel','Flash 模型',GEMINI_MODELS,DEFAULT_GEMINI_MODEL)}<p class="small-note">預設 Flash-Lite 3.5；模型可用性與配額依帳號而定。</p>${apiHelpMarkup('gemini')}</details>
  <details class="extra" ${settings.ocrProvider==='paddle-api'?'open':''}><summary>PaddleOCR API${icon('chevron',13)}</summary>${field('paddleApiToken','API key / AI Studio Access Token','type="password" autocomplete="new-password"')}${modelSelect('paddleApiModel','OCR 模型',PADDLE_API_MODELS,DEFAULT_PADDLE_MODEL)}<p class="small-note">官方服務已內建，只需貼上 AI Studio Access Token 並選擇模型。</p>${apiHelpMarkup('paddle-api')}<details class="extra" ${isCustomPaddleApi(settings)?'open':''}><summary>進階：自架 OCR 服務${icon('chevron',13)}</summary><label class="field"><span>服務</span><select name="paddleApiMode"><option value="official" ${!isCustomPaddleApi(settings)?'selected':''}>官方 PaddleOCR API</option><option value="custom" ${isCustomPaddleApi(settings)?'selected':''}>自架 basic OCR /ocr</option></select></label>${field('paddleApiUrl','完整 /ocr URL','type="url" placeholder="https://example.com/ocr"')}</details></details></fieldset>
  <p class="small-note privacy-note">${icon('lock',13)} 病人與測量保存在本機；資料及 API key 未加密。</p><button type="submit" class="button primary">${icon('check',14)}儲存設定</button></form>`;
}

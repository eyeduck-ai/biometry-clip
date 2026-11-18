import {FIELD_GROUPS,NUMERIC_FIELDS,fieldLabel} from './model.js';
import {escapeHtml as esc,icon} from './ui.js';
import {reportSummaryMarkup} from './report-ui.js';

const meta=new Map(FIELD_GROUPS.flatMap(group=>group.fields).map(field=>[field[0],field]));
const common=['al','acd','lt','cct','wtw','k1','k1Axis','k2','k2Axis','target'];
const numeric=new Set(NUMERIC_FIELDS);
const knownOrder=[...common,...FIELD_GROUPS.flatMap(group=>group.fields.map(field=>field[0])).filter(key=>!common.includes(key))];
const hasOld=row=>row.old!==undefined&&row.old!==null&&row.old!=='';
const measuredConfidence=row=>typeof row?.confidence==='number'&&Number.isFinite(row.confidence)&&row.confidence>=0&&row.confidence<=1?row.confidence:null;
const lowConfidence=row=>measuredConfidence(row)!==null&&row.confidence<.85;
const confidencePercent=value=>`${Math.floor(value*1000)/10}%`;

function reviewField(row,{eye,key}={}){
  const label=fieldLabel(row?.key||key),unit=meta.get(row?.key||key)?.[3]||'';
  if(!row)return `<div class="review-field is-missing" data-review-missing="${esc(eye)}.${esc(key)}"><div class="review-field-heading"><span>${esc(label)}</span><small>${esc(unit)}</small></div><span class="review-missing-value" aria-label="未辨識到此欄位">—</span><span class="review-field-note">未辨識</span></div>`;
  const confidence=measuredConfidence(row),low=lowConfidence(row),index=row.index;
  const description=`candidate-note-${index}${confidence!==null?` candidate-confidence-${index}`:''}`;
  const input=['toric','keratoconus'].includes(row.key)?`<select data-candidate-value="${index}" aria-label="${esc(row.eye)} ${esc(label)} 辨識結果" aria-describedby="${description}"><option value="true" ${row.value===true?'selected':''}>${esc(label)}</option><option value="false" ${row.value===false?'selected':''}>無 ${esc(label)}</option></select>`:`<input data-candidate-value="${index}" aria-label="${esc(row.eye)} ${esc(label)} 辨識結果" aria-describedby="${description}" ${numeric.has(row.key)?'inputmode="decimal"':''} value="${esc(row.value)}" autocomplete="off" spellcheck="false"/>`;
  return `<div class="candidate-row review-field${low?' is-low-confidence':''}${row.unverified?' is-unverified':''}" data-review-eye="${esc(row.eye)}" data-review-key="${esc(row.key)}">
    <div class="review-field-heading"><label for="candidate-select-${index}"><input id="candidate-select-${index}" type="checkbox" data-candidate="${index}" ${hasOld(row)||row.unverified?'':'checked'}/><strong>${esc(label)}</strong></label><span class="review-field-meta">${confidence!==null?`<span id="candidate-confidence-${index}" class="review-confidence${low?' is-low':''}" title="OCR confidence ${confidencePercent(confidence)}" aria-label="OCR confidence ${confidencePercent(confidence)}">${low?'<b aria-hidden="true">!</b>':''}${confidencePercent(confidence)}</span>`:''}<small>${esc(unit)}</small>${row.source?`<button type="button" class="review-field-source" data-review-field-source="${index}" title="檢視此欄位來源" aria-label="${esc(row.eye)} ${esc(label)} 來源">${icon('image',12)}</button>`:''}</span></div>
    ${input}<small class="review-field-note" id="candidate-note-${index}">${hasOld(row)?`<span>目前：</span><span data-i18n-skip>${esc(row.old)}</span>`:low||row.unverified?'':'<span>新資料</span>'}${low?'<span class="review-low-note">請核對原圖</span>':''}${row.unverified?'<span class="review-unverified-note">未驗證候選值，請核對後勾選</span>':''}</small>
  </div>`;
}

/** Render-only review. All accepted values and selection remain in native form controls. */
export function reviewMarkup({rows=[],messages=[],source='',text='',sources=[],sourceExpanded=true,measurementDate='',measurementDateUnverified=false,allowUnverifiedSelection=false,report}={}){
  const indexed=rows.map((row,index)=>({...row,index:Number.isSafeInteger(row.index)&&row.index>=0?row.index:index}));
  const patient=indexed.filter(row=>row.eye==='patient'),eyes=indexed.filter(row=>['OD','OS'].includes(row.eye));
  const keys=[...new Set(eyes.map(row=>row.key))].sort((a,b)=>{
    const left=knownOrder.indexOf(a),right=knownOrder.indexOf(b);
    return (left<0?knownOrder.length:left)-(right<0?knownOrder.length:right)||a.localeCompare(b);
  });
  const lowCount=indexed.filter(lowConfidence).length;
  return `<div class="import-review-body"><div class="review-summary"><p class="dialog-source"><span>${esc(source)}</span> · <span>${indexed.length} 項</span></p><span id="review-duration" class="review-duration"></span></div>
  ${!report&&/^\d{4}-\d{2}-\d{2}$/.test(measurementDate)?`<p class="review-report-date${measurementDateUnverified?' is-unverified':''}"><span>報告測量日期：</span><span data-i18n-skip>${esc(measurementDate)}</span>${measurementDateUnverified?'<strong>未驗證候選值</strong>':''}<small>僅供核對，不會自動保存為測量時間。</small></p>`:''}
  ${messages.length?`<details class="review-notices warning-box" ${indexed.length?'':'open'}><summary>辨識提示 <small>${messages.length}</small></summary><ul>${messages.map(message=>`<li>${esc(message)}</li>`).join('')}</ul></details>`:''}
  ${reportSummaryMarkup(report)}
  <div class="review-workspace">
    <details class="review-source-panel" ${sources.length&&sourceExpanded?'open':''}><summary><span>${icon('image',15)}來源影像</span>${icon('chevron',13)}</summary><div class="review-source-content">
      ${sources.length?`<label class="sr-only" for="review-source-select">選擇來源頁面</label><select id="review-source-select" data-review-source aria-label="選擇來源頁面">${sources.map((item,index)=>`<option value="${esc(item.id??index)}" data-i18n-skip>${esc(item.label||item.name||`Page ${item.pageNumber||index+1}`)}</option>`).join('')}</select><div class="review-source-tools" role="group" aria-label="影像縮放"><button type="button" data-review-zoom="out" aria-label="縮小影像" title="縮小影像">−</button><button type="button" data-review-zoom="reset" aria-label="符合寬度" title="符合寬度">${icon('scan',14)}</button><button type="button" data-review-zoom="in" aria-label="放大影像" title="放大影像">＋</button><span class="review-zoom-value" id="review-zoom-value" aria-hidden="true">100%</span></div><div class="review-source-viewport" id="review-source-viewport"><p id="review-source-status" role="status">載入來源影像…</p><img id="review-source-image" alt="辨識來源影像" hidden/></div>`:'<p class="review-source-empty">未提供來源影像</p>'}
    </div></details>
    <section class="review-values" aria-label="雙眼辨識資料">
      <div class="review-values-heading"><h3>核對測量值</h3>${lowCount?`<span class="review-confidence-legend"><b aria-hidden="true">!</b><span>暗紅欄位：OCR confidence below 85%</span></span>`:'<span class="review-values-hint">只帶入勾選欄位</span>'}</div>
      ${patient.length?`<details class="review-patient"><summary>個案資訊 <small>${patient.length}</small>${icon('chevron',12)}</summary><div class="review-patient-fields">${patient.map(row=>reviewField(row)).join('')}</div></details>`:''}
      <div class="review-eyes">${['OD','OS'].map(eye=>`<section class="review-eye" data-review-eye-column="${eye}" aria-label="${eye}"><h4>${eye}</h4><div class="review-eye-fields">${keys.map(key=>reviewField(eyes.find(row=>row.eye===eye&&row.key===key),{eye,key})).join('')||'<p class="review-eye-empty">未辨識到眼部數值</p>'}</div></section>`).join('')}</div>
      ${allowUnverifiedSelection&&indexed.some(row=>row.unverified)?'<button type="button" class="text-button" id="select-new-candidates">勾選空白欄位的候選值</button>':''}<p class="review-selection-note">已有值的項目不預選覆蓋；只儲存勾選的欄位。</p>
    </section>
  </div>
  ${text?`<details class="review-raw-text extra"><summary>檢視／修正原文${icon('chevron',13)}</summary><label class="sr-only" for="review-raw-text">辨識原文</label><textarea id="review-raw-text" rows="5">${esc(text)}</textarea><button type="button" class="button" id="reparse-ocr">重新解析原文</button></details>`:''}
  <div class="dialog-actions review-actions"><button type="button" class="button" data-close>取消</button><button type="button" class="button primary" id="apply-candidates" ${indexed.length?'':'disabled'}>儲存已選資料${icon('check',14)}</button></div></div>`;
}

import {escapeHtml as esc,icon} from './ui.js';

const states={verified:'已交叉核對',unverified:'未驗證候選值',needs_review:'待核對',error:'錯誤',not_found:'未找到',absent:'未提供',blank:'空白',not_measured:'未測量',unreadable:'無法讀取',conflict:'衝突',not_reported:'未註明'};
const extras=[['mean_k','平均 K','D'],['corneal_astigmatism','角膜散光','D'],['corneal_astigmatism_axis','角膜散光軸向','°'],['pupil','瞳孔直徑','mm']];
function fieldMarkup(field){
  if(!field)return '<span>未記錄</span>';
  const value=field.status==='verified'?field.value:field.candidate_value;
  return `${value!=null?`<span class="report-value" data-i18n-skip>${esc(value)}</span>`:''}<small>${esc(states[field.data_status==='present'?field.status:field.data_status]||'待核對')}</small>`;
}

/** Archived source facts only. No editable controls or calculator-field aliases. */
export function reportSummaryMarkup(report){
  if(!report?.eyes)return '';
  const rows=extras.filter(([key])=>report.eyes.OD?.[key]||report.eyes.OS?.[key]);
  return `<details class="extra report-summary"><summary><span>${icon('file',13)}來源報告摘要</span>${icon('chevron',13)}</summary><p class="small-note">此摘要保留匯入時的來源內容，與可編輯的計算欄位分開保存。</p><p class="report-verification"><span>來源驗證狀態：</span><strong>${esc(states[report.verification_state]||'待核對')}</strong></p>${report.measurement_date?`<div class="report-date"><span>報告測量日期：</span>${fieldMarkup(report.measurement_date)}</div>`:''}${rows.length?`<table class="report-extra-table"><thead><tr><th scope="col">報告欄位</th><th scope="col">OD</th><th scope="col">OS</th></tr></thead><tbody>${rows.map(([key,label,unit])=>`<tr><th scope="row"><span>${label}</span><small>${unit}</small></th>${['OD','OS'].map(eye=>`<td>${fieldMarkup(report.eyes[eye]?.[key])}</td>`).join('')}</tr>`).join('')}</tbody></table>`:''}</details>`;
}

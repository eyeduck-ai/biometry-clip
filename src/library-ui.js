import { icon,escapeHtml as esc } from './ui.js';
import {reportSummaryMarkup} from './report-ui.js';

export function measurementTime(value) {
  const date=new Date(value);
  return Number.isNaN(date.getTime()) ? value||'未記錄日期' : new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
}
function measurementDisplayTime(measurement) {
  const field=measurement.report?.measurement_date;
  const reportDate=field?.value??field?.candidate_value;
  const dateOnly=measurement.source==='VGHKS-bot'||measurement.source?.startsWith('VGHKS-bot · p.');
  return dateOnly&&reportDate&&measurement.measuredAt===`${reportDate}T00:00:00.000Z`?reportDate:measurementTime(measurement.measuredAt);
}
export function patientLabel(patient) {
  return [patient.patient?.patientId,patient.patient?.name].filter(Boolean).join(' · ') || '未命名病人';
}
export function selectedRecord(library,selection) {
  const patient=library.patients.find(p=>p.id===selection?.patientId);
  return {patient,measurement:patient?.measurements.find(m=>m.id===selection?.measurementId)};
}
export function libraryPicker(library,selection) {
  const {patient,measurement}=selectedRecord(library,selection);
  return `<div class="library-picker"><label class="sr-only" for="patient-picker">選擇病人</label><select id="patient-picker"><option value="">${patient?'選擇病人':'工作副本 / 未指定病人'}</option>${library.patients.map(p=>`<option value="${p.id}" ${p.id===selection?.patientId?'selected':''}>${esc(patientLabel(p))}</option>`).join('')}</select><button class="icon-button" data-route="patients" aria-label="病人與測量管理">${icon('file',14)}</button></div>${patient?`<div class="measurement-picker"><label class="sr-only" for="measurement-picker">選擇測量紀錄</label><select id="measurement-picker"><option value="">${measurement?'選擇測量紀錄':'新測量工作副本'}</option>${patient.measurements.map(m=>`<option value="${m.id}" ${m.id===selection?.measurementId?'selected':''}>${esc(m.label || '測量')} · ${esc(measurementDisplayTime(m))}</option>`).join('')}</select><button class="text-button" data-action="new-measurement" title="保留相同病人，開始空白量測">＋新增</button></div>`:''}`;
}
export function libraryMarkup(library,selection) {
  const action=(name,label,attrs,cls='')=>`<button type="button" class="icon-button ${cls}" ${attrs} aria-label="${esc(label)}" title="${esc(label)}">${icon(name,15)}</button>`;
  return `<div class="section-intro"><h1>病人與測量 <small>${library.patients.length}</small></h1><p>選擇測量帶入；鉛筆編輯、複製建立獨立副本。</p></div><div class="library-toolbar"><button class="button primary" data-action="create-patient">${icon('plus',14)} 新增病人</button><button class="button" data-action="save-measurement">${icon('save',14)} 保存測量</button></div>${library.patients.map(p=>`<details class="patient-record" ${p.id===selection?.patientId?'open':''}><summary><span><strong${p.patient?.patientId||p.patient?.name?' data-i18n-skip':''}>${esc(patientLabel(p))}</strong><small>${p.measurements.length} 次測量</small></span>${icon('chevron',12)}</summary><div class="record-actions"><button class="text-button" data-activate-patient="${p.id}">${icon('plus',13)} 新測量</button><span class="record-tools">${action('edit','編輯病人',`data-edit-patient="${p.id}"`)}${action('trash','刪除病人及全部測量',`data-delete-patient="${p.id}"`,'danger-text')}</span></div>${p.measurements.length?`<div class="measurement-bulk"><label class="check-line"><input type="checkbox" data-select-all-measurements="${p.id}"/>全選</label><button class="text-button danger-text" data-delete-selected="${p.id}" disabled>${icon('trash',13)}<span>刪除已選</span></button></div>`:''}${p.measurements.map(m=>`<article class="measurement-record ${m.id===selection?.measurementId&&p.id===selection?.patientId?'selected':''}"><input type="checkbox" class="measurement-select" data-select-measurement="${m.id}" data-patient-id="${p.id}" data-i18n-skip-attrs="aria-label" aria-label="選取 ${esc(m.label || '測量')}"/><div class="measurement-description"><strong${m.label?' data-i18n-skip':''}>${esc(m.label || '測量')}</strong><time>${esc(measurementDisplayTime(m))}</time><small>OD AL ${esc(m.eyes?.OD?.al || '—')} · OS AL ${esc(m.eyes?.OS?.al || '—')}${m.source?` · <span data-i18n-skip>${esc(m.source)}</span>`:''}</small></div><div class="measurement-actions"><button class="button" data-load-patient="${p.id}" data-load-measurement="${m.id}">${m.id===selection?.measurementId&&p.id===selection?.patientId?'已選':'帶入'}</button>${action('edit','編輯這筆測量',`data-edit-measurement="${m.id}" data-patient-id="${p.id}"`)}${action('copy','複製這筆測量',`data-copy-measurement="${m.id}" data-patient-id="${p.id}"`)}${action('trash','刪除這筆測量',`data-delete-measurement="${m.id}" data-patient-id="${p.id}"`,'danger-text')}</div>${reportSummaryMarkup(m.report)}</article>`).join('')||'<p class="small-note">尚無測量。可輸入、複製網站或辨識報告後保存。</p>'}</details>`).join('')||'<p class="empty-note">尚無病人。新增病人，或保存目前測量建立第一筆紀錄。</p>'}<button class="text-button" data-action="export-library">${icon('import',13)} 匯出備份</button><p class="small-note">資料保存在本機。編輯測量後按保存；複製會保留原始紀錄。</p>`;
}

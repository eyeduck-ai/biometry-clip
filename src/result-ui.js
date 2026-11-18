import {icon, escapeHtml as esc} from './ui.js';
import {fieldLabel} from './model.js';

const present = value => value !== undefined && value !== null && value !== '';
const source = (value, tag = 'span', className = '') => `<${tag} data-i18n-skip${className ? ` class="${className}"` : ''}>${esc(value)}</${tag}>`;
const disabled = value => value ? ' disabled' : '';
const selected = (value, expected) => String(value ?? '') === String(expected ?? '') ? ' selected' : '';
const patientName = patient => [patient?.patient?.patientId, patient?.patient?.name].filter(Boolean).join(' · ');
const unique = values => [...new Set(values.filter(Boolean))];

function dateMarkup(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value ? source(value, 'time') : '<span>未記錄日期</span>';
  const formatter = new Intl.DateTimeFormat('sv-SE', {year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false});
  const text = formatter.format(date);
  return `<time data-i18n-skip datetime="${esc(value)}" title="${esc(formatter.resolvedOptions().timeZone)}">${esc(text)}</time>`;
}
function associationMarkup(run, patients) {
  const association = run.association || {};
  const patient = patients.find(item => item.id === association.patientId);
  const label = patientName(patient);
  const state = !association.patientId ? '未關聯' : association.status === 'confirmed' ? '已確認關聯' : '待核對關聯';
  return `<span class="result-association ${association.patientId ? 'has-association' : ''}"><span>${state}</span>${label ? source(label) : ''}</span>`;
}
function runSummary(run, patients) {
  const groups = run.groups || [];
  const formulas = unique(groups.map(group => group.formula));
  const eyeLabels = unique(groups.map(group => group.eye));
  const lenses = unique(groups.flatMap(group => [group.lensModel, ...(group.rows || []).map(row => row.lensModel)]));
  return `<li class="result-history-item"><button type="button" class="result-record" data-result-action="open" data-result-id="${esc(run.id)}"><span class="result-record-top">${source(run.siteName || run.siteId || '', 'strong')}${dateMarkup(run.capturedAt)}</span><span class="result-record-formulas">${formulas.length ? source(formulas.slice(0, 3).join(' · ')) : '<span>公式未標示</span>'}${formulas.length > 3 ? `<small>+${formulas.length - 3}</small>` : ''}</span><span class="result-record-context"><span class="result-eye">${eyeLabels.length ? source(eyeLabels.join(' / ')) : '<span>眼別未標示</span>'}</span>${lenses.length ? source(lenses.slice(0, 2).join(' · '), 'span', 'result-record-lens') : '<span>晶體未標示</span>'}</span><span class="result-record-bottom">${associationMarkup(run, patients)}<span class="result-record-count"><span>候選項目</span> ${groups.reduce((count, group) => count + (group.rows?.length || 0), 0)}${run.choices?.length ? ` · <span>我的標註</span> ${run.choices.length}` : ''}${icon('chevron', 12)}</span></span></button></li>`;
}

/** Summary rows only: detailed numeric tables are rendered when a record opens. */
export function resultHistoryMarkup({targets = [], targetId = '', watch, runs = [], filter = {}, sites = [], patients = [], cursor, loading = false, isExtension = false} = {}) {
  const watching = watch === true || watch?.watching === true;
  const targetExists = targets.some(target => String(target.id) === String(targetId));
  const captureUnavailable = !isExtension || !targetExists || loading;
  return `<section class="result-history" aria-label="計算結果紀錄"><div class="section-intro"><h1>計算紀錄 <small>${runs.length}</small></h1><p>保留網站輸出，稍後核對與標註。</p></div><section class="result-capture-box" aria-label="結果擷取"><label class="result-control-label" for="result-target">計算網站分頁</label><select id="result-target" data-result-control="target"${disabled(loading)}><option value="">選擇已開啟的計算網站</option>${targets.map(target => `<option data-i18n-skip value="${esc(target.id)}"${selected(target.id, targetId)}>${esc([target.site?.name || target.siteName || target.profile?.name, target.title].filter(Boolean).join(' · ') || target.url || String(target.id))}</option>`).join('')}</select><div class="result-capture-actions"><button type="button" class="button ${watching ? '' : 'primary'}" data-result-action="watch" aria-pressed="${watching}"${disabled(captureUnavailable)}>${icon(watching ? 'close' : 'eye', 14)}<span>${watching ? '停止自動擷取' : '自動擷取此分頁'}</span></button><button type="button" class="button" data-result-action="capture"${disabled(captureUnavailable)}>${icon('scan', 14)}<span>擷取目前結果</span></button></div><p class="result-watch-status" role="status"><span class="result-watch-dot ${watching ? 'watching' : ''}" aria-hidden="true"></span><span>${watching ? '正在監看這個分頁的結果變化' : '自動擷取尚未啟用'}</span>${watch?.lastSavedAt ? dateMarkup(watch.lastSavedAt) : ''}</p>${!isExtension ? '<p class="small-note">結果擷取需在 Chrome 擴充功能中使用。</p>' : ''}<p class="result-capture-note">只讀取網站已顯示的結果，不會執行計算。</p></section><div class="result-list-heading"><h2>已保存的紀錄</h2><button type="button" class="icon-button" data-result-action="refresh" aria-label="重新載入計算紀錄" title="重新載入計算紀錄"${disabled(loading)}>${icon('refresh', 14)}</button></div><div class="result-filters"><label><span>網站</span><select data-result-control="siteId"${disabled(loading)}><option value="">全部網站</option>${sites.map(site => `<option data-i18n-skip value="${esc(site.id)}"${selected(site.id, filter.siteId)}>${esc(site.name)}</option>`).join('')}</select></label><label><span>病人篩選</span><select data-result-control="patientId"${disabled(loading)}><option value="">全部病人</option>${patients.map(patient => `<option${patientName(patient) ? ' data-i18n-skip' : ''} value="${esc(patient.id)}"${selected(patient.id, filter.patientId)}>${esc(patientName(patient) || '未命名病人')}</option>`).join('')}</select></label><label><span>眼別</span><select data-result-control="eye"${disabled(loading)}><option value="">全部眼別</option><option value="OD"${selected('OD', filter.eye)}>OD</option><option value="OS"${selected('OS', filter.eye)}>OS</option></select></label></div><div class="result-list-region" aria-busy="${loading}">${runs.length ? `<ul class="result-history-list" aria-label="計算紀錄列表">${runs.map(run => runSummary(run, patients)).join('')}</ul>` : `<p class="empty-note"${loading ? ' role="status"' : ''}>${loading ? '載入中…' : '尚無符合條件的計算紀錄。'}</p>`}</div>${cursor ? `<button type="button" class="button result-more" data-result-action="more"${disabled(loading)}>載入更多</button>` : ''}<div class="result-export-actions"><span>匯出目前篩選</span><button type="button" class="text-button" data-result-action="export-json"${disabled(loading || !runs.length)}>${icon('json', 13)} JSON</button><button type="button" class="text-button" data-result-action="export-csv"${disabled(loading || !runs.length)}>${icon('export', 13)} CSV</button></div></section>`;
}

const outputColumns = [
  ['lensModel', '晶體型號', false], ['iolPower', 'IOL (D)', true], ['predictedRefraction', '預測屈光度 (D)', true],
  ['toricPower', 'Toric (D)', true], ['axis', 'IOL 軸向 (°)', true], ['residualCylinder', '殘餘柱鏡 (D)', true],
  ['residualAxis', '殘餘軸向 (°)', true], ['refractionSphere', '球面 (D)', true], ['refractionCylinder', '柱面 (D)', true], ['refractionAxis', '屈光軸向 (°)', true],
];
function inputsMarkup(inputs) {
  const entries = Object.entries(inputs || {}).filter(([, value]) => present(value));
  if (!entries.length) return '<p class="small-note">未提供</p>';
  return `<dl class="result-input-values">${entries.map(([key, value]) => `<div><dt>${esc(fieldLabel(key))}</dt><dd>${typeof value === 'boolean' ? `<span>${value ? '是' : '否'}</span>` : source(value)}</dd></div>`).join('')}</dl>`;
}
function formSnapshotMarkup(form, title) {
  const eyes = ['OD', 'OS'].filter(eye => Object.entries(form?.[eye] || {}).some(([, value]) => present(value)));
  if (!eyes.length) return '';
  return `<details class="result-form-snapshot"><summary>${icon('file', 13)}<span>${title}</span>${icon('chevron', 12)}</summary>${form.observedAt ? `<div class="result-snapshot-time">${dateMarkup(form.observedAt)}</div>` : ''}<p class="result-provenance-note">表單快照可能已經變更，不代表這次結果實際採用的輸入。</p>${eyes.map(eye => `<h4>${source(eye)}</h4>${inputsMarkup(form[eye])}`).join('')}</details>`;
}
function safeSourceUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
function resultGroupMarkup(group, groupIndex, choices) {
  const rows = group.rows || [];
  const columns = outputColumns.filter(([key]) => rows.some(row => present(row[key])));
  const hasSiteMarks = rows.some(row => row.highlighted === true || row.siteSelected === true);
  const raw = rows.some(row => row.rawCells?.length);
  const constants = (group.constants || []).filter(item => present(item.value));
  return `<section class="result-group" aria-labelledby="result-group-${groupIndex}"><h3 id="result-group-${groupIndex}"><span class="result-eye">${group.eye ? source(group.eye) : '<span>眼別未標示</span>'}</span>${group.formula ? source(group.formula) : '<span>公式未標示</span>'}</h3>${group.sourceLabel ? source(group.sourceLabel, 'p', 'result-source-label') : ''}<dl class="result-group-context">${group.lensModel ? `<div><dt>晶體</dt><dd>${source(group.lensModel)}</dd></div>` : ''}${group.manufacturer ? `<div><dt>製造商</dt><dd>${source(group.manufacturer)}</dd></div>` : ''}${present(group.targetRefraction) ? `<div><dt>目標屈光度</dt><dd>${source(group.targetRefraction)} <span>D</span></dd></div>` : ''}${group.cylinderNotation ? `<div><dt>柱鏡慣例</dt><dd>${group.cylinderNotation === 'minus' ? '負柱鏡顯示' : '正柱鏡顯示'}</dd></div>` : ''}${group.cylinderPlane ? `<div><dt>柱鏡平面</dt><dd>${group.cylinderPlane === 'iol' ? 'IOL 平面' : '角膜平面'}</dd></div>` : ''}${constants.map(item => `<div><dt data-i18n-skip>${esc(item.name)}</dt><dd>${source([item.value, item.unit].filter(present).join(' '))}</dd></div>`).join('')}</dl><div class="result-table-scroll" tabindex="0" role="region" aria-label="可水平捲動的計算結果表"><table class="result-output-table"><caption class="sr-only">網站計算結果</caption><thead><tr><th scope="col" class="result-choice-heading">我的標註</th>${columns.map(([, label]) => `<th scope="col">${label}</th>`).join('')}${hasSiteMarks ? '<th scope="col">網站標記</th>' : ''}</tr></thead><tbody>${rows.map((row, rowIndex) => `<tr><td class="result-choice-cell"><label><input type="checkbox" data-result-choice data-group-index="${groupIndex}" data-row-index="${rowIndex}" aria-label="候選項目 ${rowIndex + 1}"${choices.some(choice => choice.groupIndex === groupIndex && choice.rowIndex === rowIndex) ? ' checked' : ''}/><span class="sr-only">候選項目 ${rowIndex + 1}</span></label></td>${columns.map(([key, , numeric]) => `<td class="${numeric ? 'result-number' : 'result-model-cell'}" data-i18n-skip>${esc(present(row[key]) ? row[key] : '—')}</td>`).join('')}${hasSiteMarks ? `<td class="result-site-marks">${row.siteSelected === true ? '<span>網站已選</span>' : ''}${row.highlighted === true ? '<span>網站醒目</span>' : ''}${row.siteSelected !== true && row.highlighted !== true ? '—' : ''}</td>` : ''}</tr>`).join('')}</tbody></table></div>${group.inputEcho && Object.keys(group.inputEcho).length ? `<details class="result-echo"><summary>${icon('check', 13)}<span>結果區回顯的輸入</span>${icon('chevron', 12)}</summary><p class="result-provenance-note">以下數值來自結果區顯示的回顯。</p>${inputsMarkup(group.inputEcho)}</details>` : ''}${raw ? `<details class="result-raw"><summary>${icon('data', 13)}<span>網站原始欄位</span>${icon('chevron', 12)}</summary>${rows.map((row, index) => row.rawCells?.length ? `<div class="result-raw-row"><h4>候選項目 ${index + 1}</h4><dl>${row.rawCells.map(cell => `<div><dt data-i18n-skip>${esc(cell.label)}</dt><dd data-i18n-skip>${esc(cell.value)}</dd></div>`).join('')}</dl></div>` : '').join('')}</details>` : ''}</section>`;
}

/** Body markup for the existing modal; only annotations and associations edit. */
export function resultDetailMarkup(run, {associationLabel = '', currentSelectionLabel = '', canLink = false} = {}) {
  const choices = run.choices || [];
  const sourceUrl = safeSourceUrl(run.pageUrl);
  const runId = esc(run.id);
  const association = run.association || {};
  return `<div class="result-detail"><div class="result-detail-source">${source(run.siteName || run.siteId || '', 'strong')}${dateMarkup(run.capturedAt)}${sourceUrl ? `<a data-i18n-skip href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(run.pageUrl)}</a>` : run.pageUrl ? source(run.pageUrl) : ''}</div><p class="result-detail-note">這是網站輸出的唯讀快照；我的標註不會更改計算結果。</p><section class="result-link-box" aria-label="紀錄關聯"><p><span>目前關聯</span> ${associationLabel ? source(associationLabel, 'strong') : ''} <span class="result-link-state">${association.patientId ? association.status === 'confirmed' ? '已確認關聯' : '待核對關聯' : '未關聯'}</span></p>${currentSelectionLabel ? `<p><span>目前選取</span> ${source(currentSelectionLabel)}</p>` : ''}<div><button type="button" class="text-button" data-result-action="link" data-result-id="${runId}"${disabled(!canLink)}>關聯至目前選取</button><button type="button" class="text-button" data-result-action="unlink" data-result-id="${runId}"${disabled(!association.patientId)}>取消關聯</button></div>${!canLink ? '<p class="small-note">請先選擇病人。</p>' : ''}</section>${(run.groups || []).map((group, index) => resultGroupMarkup(group, index, choices)).join('')}<div class="result-annotation-note"><span>網站已選與網站醒目只描述原網站狀態。</span><span>勾選我的標註，保存你要比較的候選項目。</span></div><div class="result-observed-forms">${formSnapshotMarkup(run.preCalculationForm, '按下 Calculate 前觀察的表單')}${formSnapshotMarkup(run.watchStartForm, '開始監看時的表單')}${formSnapshotMarkup(run.observedForm, '擷取當時的表單')}</div><div class="result-detail-actions"><button type="button" class="text-button danger-text" data-result-action="delete" data-result-id="${runId}">${icon('trash', 13)} 刪除紀錄</button><span></span><button type="button" class="button" data-close>關閉</button><button type="button" class="button primary" data-result-action="save-choices" data-result-id="${runId}">${icon('save', 13)} 儲存標註</button></div></div>`;
}

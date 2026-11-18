import {FIELD_GROUPS} from './model.js';
import {patientLabel} from './library-ui.js';
import {escapeHtml as esc} from './ui.js';

const fields=FIELD_GROUPS.flatMap(group=>group.fields);
const eyes=['OD','OS'];

function reportCaption({index,label,pages,parsed}){
  return esc([`#${index+1}`,label,parsed?.measurementDate,pages.length?`p.${pages.join(',')}`:''].filter(Boolean).join(' · '));
}

function reportMarkup(item){
  const {data,measurementDate,unverifiedFields,warnings}=item.parsed;
  const rows=fields.filter(([key])=>eyes.some(eye=>Object.hasOwn(data.eyes[eye],key))).map(([key,label,,unit])=>`
    <tr><th scope="row">${esc(label)}${unit?` <small>${esc(unit)}</small>`:''}</th>${eyes.map(eye=>{
      const value=data.eyes[eye][key];
      return `<td><span data-i18n-skip>${esc(value??'—')}</span>${unverifiedFields.has(`${eye}.${key}`)?'<abbr title="未驗證候選值" aria-label="未驗證候選值">*</abbr>':''}</td>`;
    }).join('')}</tr>`).join('');
  return `<div class="parser-batch-report"><label class="check-line"><input type="checkbox" data-parser-batch-index="${item.index}"><span data-i18n-skip>${reportCaption(item)}</span></label>
    <details class="extra"><summary>核對測量值</summary>
      <p class="small-note"><span>病人 ID / 代號</span> <span data-i18n-skip>${esc(data.patient.patientId||'—')}</span> · <span>報告測量日期：</span> <span data-i18n-skip>${esc(measurementDate||'—')}</span>${unverifiedFields.has('measurementDate')?'<abbr title="未驗證候選值" aria-label="未驗證候選值">*</abbr>':''}</p>
      <div class="result-table-scroll"><table class="result-output-table"><caption class="sr-only">測量值</caption><thead><tr><th scope="col">測量值</th><th scope="col">OD</th><th scope="col">OS</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${unverifiedFields.size?'<p class="small-note">* <span>未驗證候選值</span></p>':''}
      ${warnings.length?`<ul class="small-note">${warnings.map(warning=>`<li>${esc(warning)}</li>`).join('')}</ul>`:''}
    </details></div>`;
}

export function parserBatchMarkup(documents,patients){
  const available=documents.filter(item=>item.parsed);
  const failed=documents.filter(item=>!item.parsed);
  const patientOptions=patients.map((patient,index)=>`<option value="${index}" data-i18n-skip>${esc(patientLabel(patient))}</option>`).join('');
  return `${available.length?`
    <p class="small-note">展開各筆核對後，勾選要保存的測量。勾選即確認採用該筆報告的測量候選值。</p>
    <div aria-label="PDF 報告" role="group">${available.map(reportMarkup).join('')}</div>
    <label class="field"><span>保存至病人</span><select id="parser-batch-patient"><option value="">選擇病人</option>${patientOptions}<option value="new">新增病人</option></select></label>
    <div id="parser-batch-new-patient" hidden><div class="patient-grid"><label class="field"><span>病人 ID / 代號</span><input id="parser-batch-patient-id" maxlength="150" autocomplete="off" data-i18n-skip-attrs="placeholder"></label><label class="field"><span>姓名 / 代稱</span><input id="parser-batch-patient-name" maxlength="150" autocomplete="off"></label></div></div>
    <p class="small-note" id="parser-batch-identity-note" hidden>部分已選報告缺少病人 ID，請依原始報告確認歸屬。</p>`:'<p class="small-note">這批報告沒有可核對的測量值。</p>'}
    ${failed.length?`<details class="extra" data-parser-batch-failed><summary>無法匯入的報告</summary><ul>${failed.map(item=>`<li><span data-i18n-skip>${reportCaption(item)}</span> <span>${esc(item.error)}</span></li>`).join('')}</ul></details>`:''}
    <div class="dialog-actions parser-batch-actions"><button class="button" type="button" data-close>取消</button>${available.length?`<button type="button" class="button" id="review-parser-document" disabled>帶入單筆工作副本</button><button type="button" class="button primary" id="save-parser-batch" disabled>保存已選測量</button>`:''}</div>`;
}

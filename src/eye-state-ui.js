import {icon,escapeHtml as esc} from './ui.js';

const lvcChoices=[
  ['none','無 LVC','無角膜屈光手術病史'],
  ['myopic','近視','近視 LASIK / PRK'],
  ['hyperopic','遠視','遠視 LASIK / PRK'],
  ['rk','RK','Radial keratotomy（放射狀角膜切開術）'],
];
const choice=(attribute,value,label,pressed,title=label,content=esc(label))=>`<button type="button" class="choice-button" ${attribute}="${esc(value)}" aria-pressed="${pressed}" aria-label="${esc(title)}" title="${esc(title)}">${content}</button>`;

/** Presentation only: controls emit deliberate choices; rendering never edits data. */
export function eyeStateMarkup({eye='OD',values={},counts={OD:0,OS:0}}={}){
  if(!['OD','OS'].includes(eye))throw new Error('請先選擇 OD 或 OS。');
  const data=values||{};
  // Older cases encoded keratoconus in lvcType. It is shown independently;
  // an explicit newer boolean remains authoritative, including false.
  const keratoconus=data.keratoconus===true||(data.keratoconus==null&&data.lvcType==='keratoconus');
  const lvc=!data.lvcType||['none','keratoconus'].includes(data.lvcType)?'none':lvcChoices.some(([key])=>key===data.lvcType)?data.lvcType:'unknown';
  return `<section class="eye-state-panel" aria-label="眼別與狀態">
    <div class="state-row state-eye-row"><span class="state-label" id="eye-choice-label">${icon('eye',13)}眼別</span><div class="choice-group eye-choices" role="tablist" aria-labelledby="eye-choice-label">${['OD','OS'].map(value=>`<button type="button" class="choice-button" role="tab" id="eye-tab-${value}" data-eye="${value}" aria-controls="biometry-form" aria-selected="${eye===value}" tabindex="${eye===value?'0':'-1'}" aria-label="${value} ${value==='OD'?'右眼':'左眼'}" title="${value} ${value==='OD'?'右眼':'左眼'}"><strong>${value}</strong><small data-count="${value}" title="已填測量欄位數" aria-hidden="true">${esc(counts?.[value]??0)}</small></button>`).join('')}</div></div>
    <div class="state-row state-mode-row"><span class="state-label" id="mode-choice-label">模式</span><div class="choice-group mode-choices" role="group" aria-labelledby="mode-choice-label">${choice('data-mode','toric','Toric',data.toric===true,'Toric 散光型水晶體')}${choice('data-mode','keratoconus','KC',keratoconus,'Keratoconus 圓錐角膜')}</div></div>
    <div class="state-row state-lvc-row"><span class="state-label" id="lvc-choice-label">LVC</span><div class="choice-group lvc-choices" role="group" aria-labelledby="lvc-choice-label">${lvcChoices.map(([value,label,title])=>choice('data-lvc',value,label,lvc===value,title)).join('')}</div></div>${lvc==='unknown'?'<p class="lvc-source-note">來源未註明 LVC 類型，請選擇。</p>':''}
  </section>`;
}

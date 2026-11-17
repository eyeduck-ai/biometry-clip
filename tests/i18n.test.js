import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

// Exercise the localization boundary independently of the evolving UI wording.
// The fixture deliberately makes a patient's name identical to a UI key.
const source=await readFile(new URL('../src/i18n.js',import.meta.url),'utf8');
let instance=0;
async function engine(){
  const body=source.replace(/^import\s+\{[^\n]+\}\s+from\s+['"]\.\/locales\/en-(?:core|secondary|help)\.js['"];?\r?$/gm,'');
  const fixtures=`
    const coreMessages={"資料":"Data","儲存":"Save","請稍候":"Please wait","姓名":"Name","選擇病人":"Select patient","選擇測量":"Select measurement","測量":"Measurement","圖片":"Image"};
    const secondaryMessages={"資料":"Incorrect duplicate","匯入":"Import"};
    const coreRules=[[/^已選 (\\d+) 頁$/,(_,count)=>count+' pages selected'],[/完成/g,'Done']];
    const helpMessages={},helpRules=[];
    const secondaryRules=[{pattern:/^共 (\\d+) 筆$/,replacement:'$1 records'}];
  `;
  return import(`data:text/javascript;base64,${Buffer.from(fixtures+body+`\n// instance ${instance++}`).toString('base64')}`);
}
function documentFor(markup){
  return new JSDOM(`<!doctype html><html lang="fr"><body>${markup}</body></html>`,{pretendToBeVisual:true});
}
const tick=window=>new Promise(resolve=>window.setTimeout(resolve,0));

test('language defaults to English and translation only accepts full UI fragments',async()=>{
  const i18n=await engine();
  assert.equal(i18n.getLanguage(),'en');
  assert.equal(i18n.normalizeLanguage(undefined),'en');
  assert.equal(i18n.normalizeLanguage('unsupported'),'en');
  assert.equal(i18n.normalizeLanguage(' EN '),'en');
  assert.equal(i18n.normalizeLanguage('zh_TW'),'zh-TW');
  assert.equal(i18n.normalizeLanguage('zh-Hant'),'zh-TW');
  assert.equal(i18n.translate(' \n資料\t '),' \nData\t ');
  assert.equal(i18n.translate('匯入'),'Import');
  assert.equal(i18n.translate('已選 3 頁'),'3 pages selected');
  assert.equal(i18n.translate('共 2 筆'),'2 records');
  assert.equal(i18n.translate('資料 王先生'),'資料 王先生');
  assert.equal(i18n.translate('完成 王先生'),'完成 王先生','partial regex replacement must be rejected');
  assert.equal(i18n.translate('完成'),'Done','global regex may match a complete fragment once');
  assert.equal(i18n.translate('0.05'),'0.05');
  assert.equal(i18n.setLanguage('zh-TW'),'zh-TW');
  assert.equal(i18n.translate('資料'),'資料');
  assert.equal(i18n.translate('資料','en'),'Data');
});

test('in-place language switching preserves patient data, controls, focus and source strings',async()=>{
  const i18n=await engine();
  const dom=documentFor(`
    <main id="root"><button id="save" title="儲存" aria-label="儲存" data-machine="資料">儲存</button>
      <label id="label">姓名<input id="name" value="資料" placeholder="姓名" aria-label="姓名"></label>
      <input id="number" value="543"><input id="hidden" type="hidden" value="資料">
      <p id="mixed">測量<span data-i18n-skip>資料</span>儲存</p>
      <p data-i18n-skip id="patient" title="資料">資料</p>
      <div translate="no" id="external">資料</div><div contenteditable="true" id="editor">資料</div>
      <textarea id="notes" placeholder="姓名">資料</textarea><pre id="json">{"name":"資料"}</pre><code id="code">資料</code>
      <img id="image" alt="圖片"><span id="status">已選 2 頁</span>
    </main>`);
  const {document}=dom.window,root=document.querySelector('#root');
  const input=document.querySelector('#name'),save=document.querySelector('#save'),saveText=save.firstChild;
  input.value='資料王';input.focus();input.setSelectionRange(1,2);
  i18n.localize(root);
  assert.equal(save.textContent,'Save');assert.equal(save.title,'Save');assert.equal(save.getAttribute('aria-label'),'Save');
  assert.equal(save.dataset.machine,'資料');assert.equal(save.id,'save');
  assert.equal(document.querySelector('#label').firstChild.nodeValue,'Name');
  assert.equal(input.placeholder,'Name');assert.equal(input.getAttribute('aria-label'),'Name');
  assert.equal(input.value,'資料王');assert.equal(document.querySelector('#number').value,'543');
  assert.equal(document.querySelector('#hidden').value,'資料');assert.equal(document.querySelector('#notes').value,'資料');
  assert.equal(document.querySelector('#notes').placeholder,'Name');
  assert.equal(document.querySelector('#mixed').textContent,'Measurement資料Save');
  for(const id of ['patient','external','editor','code'])assert.equal(document.getElementById(id).textContent,'資料');
  assert.equal(document.querySelector('#patient').title,'資料');
  assert.equal(document.querySelector('#json').textContent,'{"name":"資料"}');
  assert.equal(document.querySelector('#image').alt,'Image');
  assert.equal(document.querySelector('#status').textContent,'2 pages selected');
  assert.equal(document.activeElement,input);assert.equal(input.selectionStart,1);assert.equal(input.selectionEnd,2);
  for(let pass=0;pass<3;pass++){
    i18n.localize(root,'zh-TW');assert.equal(save.textContent,'儲存');assert.equal(save.title,'儲存');
    i18n.localize(root,'en');assert.equal(save.textContent,'Save');assert.equal(save.title,'Save');
  }
  assert.equal(save.firstChild,saveText);assert.equal(document.querySelector('#name'),input);
  assert.equal(document.activeElement,input);assert.equal(input.value,'資料王');
  assert.equal(document.documentElement.lang,'fr','localizing a shell must not change the host calculator language');
  dom.window.close();
});

test('source option names and explicitly protected attributes remain verbatim',async()=>{
  const i18n=await engine();
  const ids=['patient-picker','measurement-picker','lens-picker','lens-source-picker','target-tab'];
  const dom=documentFor(`<main>${ids.map(id=>`<select id="${id}"><option value="">選擇病人</option><option value="source-key" title="資料">資料</option></select>`).join('')}
    <select id="preference"><option value="save">儲存</option></select>
    <label id="source" data-i18n-skip-attrs="title aria-label" title="資料" aria-label="資料">儲存</label>
    <img data-i18n-skip id="filename" alt="資料"></main>`);
  const {document}=dom.window;
  i18n.localize(document.body);
  for(const id of ids){
    const options=document.getElementById(id).options;
    assert.equal(options[0].textContent,'Select patient');
    assert.equal(options[1].textContent,'資料');assert.equal(options[1].title,'資料');
    assert.equal(options[1].value,'source-key');
  }
  assert.equal(document.querySelector('#preference').textContent,'Save');
  assert.equal(document.querySelector('#source').textContent,'Save');
  assert.equal(document.querySelector('#source').title,'資料');
  assert.equal(document.querySelector('#source').getAttribute('aria-label'),'資料');
  assert.equal(document.querySelector('#filename').alt,'資料');
  i18n.localize(document.body,'zh-TW');
  assert.equal(document.querySelector('#patient-picker').options[0].textContent,'選擇病人');
  dom.window.close();
});

test('observer translates async UI updates and live switches without recursive writes',async()=>{
  const i18n=await engine();
  const dom=documentFor('<main><input id="input" value="資料"><p id="status">請稍候</p></main>');
  const {document}=dom.window,root=document.querySelector('main'),status=document.querySelector('#status');
  const input=document.querySelector('#input');input.focus();input.setSelectionRange(1,1);
  let mutations=0;
  const monitor=new dom.window.MutationObserver(records=>{mutations+=records.length;});
  monitor.observe(root,{subtree:true,characterData:true,childList:true,attributes:true});
  const cleanup=i18n.observeLocalization(root);
  assert.equal(status.textContent,'Please wait');
  const dialog=document.createElement('dialog');dialog.innerHTML='<button title="儲存">儲存</button><span data-i18n-skip>資料</span>';
  root.append(dialog);await tick(dom.window);
  assert.equal(dialog.querySelector('button').textContent,'Save');assert.equal(dialog.querySelector('button').title,'Save');
  assert.equal(dialog.querySelector('span').textContent,'資料');
  status.firstChild.nodeValue='已選 4 頁';status.setAttribute('title','請稍候');await tick(dom.window);
  assert.equal(status.textContent,'4 pages selected');assert.equal(status.title,'Please wait');
  i18n.setLanguage('zh-TW');
  assert.equal(status.textContent,'已選 4 頁');assert.equal(status.title,'請稍候');
  assert.equal(dialog.querySelector('button').textContent,'儲存');
  i18n.setLanguage('en');await tick(dom.window);
  assert.equal(status.textContent,'4 pages selected');assert.equal(dialog.querySelector('button').textContent,'Save');
  assert.equal(document.activeElement,input);assert.equal(input.value,'資料');assert.equal(input.selectionStart,1);
  const settled=mutations;await tick(dom.window);
  assert.equal(mutations,settled,'localization must settle without observing its own output forever');
  assert.ok(mutations<30,`unexpected repeated localization mutations: ${mutations}`);
  cleanup();status.textContent='儲存';await tick(dom.window);assert.equal(status.textContent,'儲存');
  monitor.disconnect();dom.window.close();
});

test('observer respects explicit language callbacks and supports shadow-root UI',async()=>{
  const i18n=await engine(),dom=documentFor('<div id="host"></div>');
  const {document}=dom.window,shadow=document.querySelector('#host').attachShadow({mode:'open'});
  shadow.innerHTML='<button aria-label="儲存">儲存</button>';
  let language='zh-TW';const cleanup=i18n.observeLocalization(shadow,{language:()=>language});
  assert.equal(shadow.textContent,'儲存');
  language='en';shadow.querySelector('button').title='儲存';await tick(dom.window);
  assert.equal(shadow.textContent,'Save');assert.equal(shadow.querySelector('button').getAttribute('aria-label'),'Save');
  i18n.setLanguage('zh-TW');assert.equal(shadow.textContent,'Save','explicit per-root language takes precedence');
  assert.equal(document.documentElement.lang,'fr');
  cleanup();dom.window.close();
});

test('language button exposes a stable action and a compact bilingual choice',async()=>{
  const i18n=await engine(),dom=documentFor(i18n.languageButtonMarkup('en',{floating:true}));
  const button=dom.window.document.querySelector('#language-toggle');
  assert.equal(button.type,'button');assert.equal(button.dataset.action,'toggle-language');
  assert.equal(button.textContent,'EN/中文');assert.ok(button.classList.contains('is-compact'));
  assert.equal(button.querySelector('.selected').lang,'en');assert.equal(button.getAttribute('aria-label'),'Switch to Chinese');
  i18n.localize(button,'zh-TW');assert.equal(button.textContent,'EN/中文','toggle labels remain bilingual');
  dom.window.document.body.innerHTML=i18n.languageButtonMarkup('zh-TW');
  assert.equal(dom.window.document.querySelector('.selected').lang,'zh-Hant');
  assert.equal(dom.window.document.querySelector('button').getAttribute('aria-label'),'切換至英文');
  dom.window.close();
});

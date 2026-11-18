import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {reviewMarkup} from '../src/import-review-ui.js';

const documentFor=options=>new JSDOM(reviewMarkup(options)).window.document;

test('review keeps OD and OS in independent paired columns with one editable control per detected value',()=>{
  const doc=documentFor({rows:[{eye:'OS',key:'k1Axis',value:'87'},{eye:'OD',key:'al',value:'23.40'},{eye:'OS',key:'al',value:'24.80'},{eye:'OD',key:'wtw',value:'11.8'}]});
  const od=doc.querySelector('[data-review-eye-column="OD"]'),os=doc.querySelector('[data-review-eye-column="OS"]');
  assert.equal(od.querySelector('h4').textContent,'OD');assert.equal(os.querySelector('h4').textContent,'OS');
  assert.equal(od.querySelector('[data-review-key="al"] input[data-candidate-value]').value,'23.40');
  assert.equal(os.querySelector('[data-review-key="al"] input[data-candidate-value]').value,'24.80');
  assert.equal(doc.querySelectorAll('[data-candidate-value]').length,4);
  const keys=column=>[...column.querySelector('.review-eye-fields').children].map(el=>el.dataset.reviewKey||el.dataset.reviewMissing.split('.').at(-1));
  assert.deepEqual(keys(od),keys(os));assert.deepEqual(keys(od),['al','wtw','k1Axis']);
  assert.equal(os.querySelector('[data-review-missing="OS.wtw"] input'),null);
  assert.equal(od.querySelector('[data-review-missing="OD.k1Axis"] input'),null);
  assert.match(os.querySelector('[data-review-key="k1Axis"]').textContent,/°/);
});

test('confidence highlights only measured scores below 85 percent, including near-threshold values',()=>{
  const rows=[.849,.85,.95,null,undefined,'0.50',NaN,1.2].map((confidence,index)=>({eye:'OD',key:['al','acd','lt','cct','wtw','k1','k2','target'][index],value:'1',confidence}));
  const doc=documentFor({rows});
  assert.equal(doc.querySelectorAll('.is-low-confidence').length,1);
  const low=doc.querySelector('[data-review-key="al"]');assert.match(low.querySelector('.review-confidence').textContent,/84\.9%/);
  assert.match(low.querySelector('.review-low-note').textContent,/核對/);
  assert.equal(doc.querySelector('[data-review-key="acd"]').classList.contains('is-low-confidence'),false);
  assert.equal(doc.querySelectorAll('.review-confidence').length,3);
  for(const key of ['cct','wtw','k1','k2','target'])assert.equal(doc.querySelector(`[data-review-key="${key}"] .review-confidence`),null);
  assert.equal(low.querySelector('input[data-candidate-value]').hasAttribute('aria-invalid'),false);
});

test('existing zero and false are never preselected for overwrite and imported zero remains editable',()=>{
  const doc=documentFor({rows:[{eye:'OD',key:'target',value:'0',old:0,index:8},{eye:'OS',key:'toric',value:false,old:false,index:12},{eye:'OS',key:'al',value:'23.45',old:'',index:18}]});
  assert.equal(doc.querySelector('[data-candidate="8"]').checked,false);
  assert.equal(doc.querySelector('[data-candidate-value="8"]').value,'0');
  assert.equal(doc.querySelector('[data-candidate="12"]').checked,false);
  assert.equal(doc.querySelector('[data-candidate-value="12"]').value,'false');
  assert.equal(doc.querySelector('[data-candidate="18"]').checked,true);
  assert.equal(doc.querySelectorAll('[data-candidate]').length,3);
});

test('patient identity is in a separate collapsed group and candidate indexes remain stable',()=>{
  const doc=documentFor({rows:[{eye:'patient',key:'name',value:'資料'},{eye:'OD',key:'cct',value:'543'},{eye:'patient',key:'patientId',value:'SYNTHETIC-001'}]});
  const group=doc.querySelector('.review-patient');assert.ok(group);assert.equal(group.hasAttribute('open'),false);
  assert.equal(group.querySelector('[data-candidate-value="0"]').value,'資料');
  assert.equal(group.querySelector('[data-candidate-value="2"]').value,'SYNTHETIC-001');
  assert.equal(doc.querySelector('[data-review-eye-column="OD"] [data-candidate-value="1"]').value,'543');
  assert.match(doc.querySelector('[data-review-key="cct"]').textContent,/µm/);
});

test('source navigation and zoom controls are separate from editable data and do not submit a form',()=>{
  const doc=documentFor({rows:[{eye:'OD',key:'al',value:'23.45',source:{fileIndex:1,pageNumber:6}}],sources:[{id:'1:6',label:'SYNTHETIC.pdf · 6'},{id:'2:1',label:'SYNTHETIC.png'}]});
  assert.equal(doc.querySelector('[data-review-source]').value,'1:6');
  assert.equal(doc.querySelectorAll('[data-review-zoom]').length,3);
  assert.equal(doc.querySelector('[data-review-field-source="0"]').type,'button');
  for(const control of doc.querySelectorAll('[data-review-zoom]'))assert.equal(control.type,'button');
  assert.equal(doc.querySelector('#review-source-image').hidden,true);
  assert.equal(doc.querySelector('#review-source-viewport').contains(doc.querySelector('[data-candidate-value]')),false);
  assert.equal(doc.querySelector('#apply-candidates').disabled,false);
});

test('untrusted values, source names and warnings remain text and cannot create HTML',()=>{
  const attack='<img src=x onerror="attack()">';
  const doc=documentFor({source:attack,text:'</textarea>'+attack,messages:[attack],rows:[{eye:'OD',key:'al',value:'" onfocus="attack()',old:attack}],sources:[{id:'" onfocus="attack()',label:attack}]});
  assert.equal(doc.querySelector('[onerror],[onfocus]'),null);
  assert.equal(doc.querySelectorAll('img').length,1);
  assert.equal(doc.querySelector('#review-source-image').hasAttribute('src'),false);
  assert.equal(doc.querySelector('[data-review-source] option').textContent,attack);
  assert.equal(doc.querySelector('[data-candidate-value]').value,'" onfocus="attack()');
  assert.equal(doc.querySelector('#review-raw-text').value,'</textarea>'+attack);
  assert.equal(doc.querySelector('.review-field-note [data-i18n-skip]').textContent,attack);
});

test('empty review preserves both eye headings but cannot save any invented fields',()=>{
  const doc=documentFor({});assert.equal(doc.querySelectorAll('[data-review-eye-column]').length,2);
  assert.equal(doc.querySelectorAll('[data-candidate],[data-candidate-value]').length,0);
  assert.equal(doc.querySelector('#apply-candidates').disabled,true);
  assert.equal(doc.querySelector('#reparse-ocr'),null);
});

test('a low-confidence patient identifier still shows the review warning legend',()=>{
  const doc=documentFor({rows:[{eye:'patient',key:'patientId',value:'SYNTHETIC-001',confidence:.7}],sources:[{id:'0:1',label:'SYNTHETIC.pdf'}],sourceExpanded:false});
  assert.ok(doc.querySelector('.review-confidence-legend'));
  assert.ok(doc.querySelector('.review-patient .is-low-confidence'));
  assert.equal(doc.querySelector('.review-source-panel').open,false);
  assert.equal(doc.querySelector('[data-candidate-value="0"]').value,'SYNTHETIC-001');
});

test('unverified candidates remain visibly unchecked without invented OCR confidence',()=>{
  const doc=documentFor({rows:[{eye:'OD',key:'al',value:'23.45',unverified:true},{eye:'OS',key:'al',value:'24.10'}],allowUnverifiedSelection:true});
  const candidate=doc.querySelector('[data-review-eye="OD"][data-review-key="al"]');
  assert.ok(candidate.classList.contains('is-unverified'));assert.equal(candidate.querySelector('[data-candidate]').checked,false);
  assert.match(candidate.querySelector('.review-unverified-note').textContent,/核對/);assert.equal(candidate.querySelector('.review-confidence'),null);
  assert.equal(doc.querySelector('[data-review-eye="OS"] [data-candidate]').checked,true);assert.ok(doc.querySelector('#select-new-candidates'));
  assert.equal(documentFor({rows:[{eye:'OD',key:'al',value:'23.45',unverified:true}]}).querySelector('#select-new-candidates'),null);
});

test('report measurement dates are static review metadata and accept only ISO date text',()=>{
  const doc=documentFor({measurementDate:'2026-11-17',measurementDateUnverified:true});
  assert.equal(doc.querySelector('.review-report-date [data-i18n-skip]').textContent,'2026-11-17');
  assert.match(doc.querySelector('.review-report-date strong').textContent,/未驗證候選值/);assert.equal(doc.querySelector('.review-report-date input'),null);
  assert.equal(documentFor({measurementDate:'<img src=x onerror=attack()>'}).querySelector('.review-report-date'),null);
});

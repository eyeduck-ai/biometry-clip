import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {reportSummaryMarkup} from '../src/report-ui.js';
import {libraryMarkup} from '../src/library-ui.js';
import {localize} from '../src/i18n.js';

const field=(value,unit)=>({candidate_value:value,unit,status:'unverified',data_status:'present',verification_status:'unverified'});
const report=()=>({schema_version:'1.2',workflow:'synthetic-test',verification_state:'needs_review',measurement_date:field('2026-11-17',null),eyes:{OD:{mean_k:field(43.75,'D'),pupil:{unit:'mm',status:'not_measured',data_status:'not_measured',verification_status:'cross_checked'}},OS:{corneal_astigmatism:field(0,'D'),corneal_astigmatism_axis:{unit:'degree',status:'conflict',data_status:'conflict',verification_status:'unverified'}}}});

test('archived summary is collapsed and separates report-only bilateral values, units and source states',()=>{
  const value=report(),before=structuredClone(value),dom=new JSDOM(reportSummaryMarkup(value)),doc=dom.window.document;
  const summary=doc.querySelector('.report-summary');assert.equal(summary.open,false);assert.equal(summary.querySelectorAll('input,select,textarea,button').length,0);
  assert.equal(summary.querySelectorAll('tbody tr').length,4);assert.match(summary.textContent,/43.75/);assert.match(summary.textContent,/未測量/);assert.match(summary.textContent,/衝突/);assert.match(summary.textContent,/2026-11-17/);
  assert.equal(summary.querySelectorAll('thead th').length,3);assert.match(summary.textContent,/mm/);assert.match(summary.textContent,/°/);assert.doesNotMatch(summary.textContent,/%/);
  assert.deepEqual(value,before);dom.window.close();assert.equal(reportSummaryMarkup(undefined),'');
});

test('report snapshot localizes labels while source values stay exact and cannot create markup',()=>{
  const value=report();value.eyes.OD.mean_k.candidate_value='設定';value.eyes.OS.corneal_astigmatism.candidate_value='<img src=x onerror=attack()>';
  const dom=new JSDOM(reportSummaryMarkup(value)),doc=dom.window.document;localize(doc,'en');
  assert.match(doc.querySelector('summary').textContent,/Source report summary/);assert.match(doc.body.textContent,/Corneal astigmatism/);assert.match(doc.body.textContent,/Not measured/);
  assert.ok([...doc.querySelectorAll('[data-i18n-skip]')].some(n=>n.textContent==='設定'));assert.equal(doc.querySelectorAll('img,script').length,0);
  localize(doc,'zh-TW');assert.match(doc.querySelector('summary').textContent,/來源報告摘要/);dom.window.close();
});

test('historical measurements display their own separate report snapshots',()=>{
  const dom=new JSDOM(libraryMarkup({patients:[{id:'synthetic',patient:{patientId:'SYNTHETIC'},measurements:[{id:'m1',label:'Synthetic',eyes:{OD:{al:'23.45'},OS:{}},report:report()}]}]},{}));
  assert.equal(dom.window.document.querySelectorAll('.measurement-record > .report-summary').length,1);assert.match(dom.window.document.querySelector('.report-summary').textContent,/43.75/);dom.window.close();
});

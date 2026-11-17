import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {FIELD_GROUPS} from '../src/model.js';
import {FORMULA_GROUPS,SITE_PURPOSES} from '../src/catalog.js';
import {libraryMarkup} from '../src/library-ui.js';
import {lensMarkup} from '../src/lens-ui.js';
import {messages,rules} from '../src/locales/en-secondary.js';

test('English UI dictionary covers every field group, clinical helper and launcher description',()=>{
  const copy=[...FIELD_GROUPS.flatMap(group=>[group.title,group.caption,...group.fields.flatMap(field=>[field[2],field[2]+(field[3]?` (${field[3]})`:'')])]),...FORMULA_GROUPS.flatMap(group=>[group.title,group.description]),...Object.values(SITE_PURPOSES)];
  for(const source of copy){assert.ok(messages[source],`Missing English UI copy: ${source}`);assert.doesNotMatch(messages[source],/[\u3400-\u9fff]/);}
});

test('patient, measurement and source labels are protected even if they equal known UI copy',()=>{
  const library={patients:[{id:'synthetic',patient:{name:'設定',patientId:'測量'},measurements:[{id:'synthetic-m',label:'保存測量',measuredAt:'2026-11-15T00:00:00Z',source:'水晶體',eyes:{OD:{al:'23.45'},OS:{al:'24.10'}}}]}]};
  const original=structuredClone(library),dom=new JSDOM(libraryMarkup(library,{})),doc=dom.window.document;
  assert.equal(doc.querySelector('summary strong[data-i18n-skip]').textContent,'測量 · 設定');
  assert.equal(doc.querySelector('.measurement-description strong[data-i18n-skip]').textContent,'保存測量');
  assert.equal(doc.querySelector('.measurement-description small [data-i18n-skip]').textContent,'水晶體');
  assert.equal(doc.querySelector('.measurement-select').dataset.i18nSkipAttrs,'aria-label');
  assert.deepEqual(library,original);dom.window.close();
});

test('IOL summary separates the localizable heading from the exact saved model identity',()=>{
  const data={eyes:{OD:{iolSourceLabel:'水晶體',iolSourceValue:'exact-model'}}},dom=new JSDOM(lensMarkup({data}));
  assert.equal(dom.window.document.querySelector('summary > span').textContent,'水晶體');
  assert.equal(dom.window.document.querySelector('summary [data-i18n-skip]').textContent,'水晶體');
  assert.equal(data.eyes.OD.iolSourceLabel,'水晶體');dom.window.close();
});

test('dynamic PDF messages translate UI while retaining the exact filename',()=>{
  const source='正在讀取 PDF 頁數：設定 report.pdf',matching=rules.find(([pattern])=>pattern.test(source));
  assert.ok(matching);assert.equal(source.replace(...matching),'Reading PDF page count: 設定 report.pdf');
  const status='已選 4 頁，並辨識已上傳圖片，請減少至 3 頁以內。',rule=rules.find(([pattern])=>pattern.test(status));
  assert.equal(status.replace(...rule),'4 pages selected, plus uploaded images. Select no more than 3 pages.');
});

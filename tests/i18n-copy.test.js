import assert from 'node:assert/strict';
import test from 'node:test';
import {translate} from '../src/i18n.js';
import {FIELD_GROUPS} from '../src/model.js';

test('real dictionaries translate complete JSON errors and the default calculator source label',()=>{
  const pairs=[
    ['JSON 檔案上限為 10 MB。','JSON files must be 10 MB or smaller.'],
    ['讀取 目前計算網站 的欄位','Read fields from the current calculator'],
  ];
  for(const [source,expected]of pairs){
    assert.equal(translate(source,'en'),expected);
    assert.equal(translate(source,'zh-TW'),source);
  }
});

test('real review source/count labels translate their full known source names',()=>{
  const pairs=[
    ['JSON 測量匯入 · 2 項','JSON measurement import · 2 fields'],
    ['辨識結果 · 0 項','Recognition results · 0 fields'],
    ['原文重新解析 · 12 項','Reparsed text · 12 fields'],
    ['OD AL 辨識結果','OD AL recognized value'],
    ['OS CCT 辨識結果','OS CCT recognized value'],
  ];
  for(const [source,expected]of pairs){
    assert.equal(translate(source,'en'),expected);
    assert.equal(translate(source,'zh-TW'),source);
  }
});

test('real paste success messages translate unmatched counts, cylinder notation and lens controls together',()=>{
  const pairs=[
    ['已貼上 8 項。','Pasted 8 fields.'],
    ['已貼上 8 項，2 項未對應。','Pasted 8 fields; 2 unmapped.'],
    ['已貼上 8 項，2 項未對應。 柱鏡顯示 −ve。 已套用 1 個晶體控制。','Pasted 8 fields; 2 unmapped. Cylinder display: −ve. Applied 1 lens controls.'],
    ['已貼上 15 項。 柱鏡顯示 +ve。 已套用 2 個晶體控制。','Pasted 15 fields. Cylinder display: +ve. Applied 2 lens controls.'],
    ['已貼上 0 項。 柱鏡顯示尚未套用，請在原站確認。','Pasted 0 fields. Cylinder display preference was not applied. Check it on the site.'],
  ];
  for(const [source,expected]of pairs){
    const translated=translate(source,'en');
    assert.equal(translated,expected);
    assert.doesNotMatch(translated,/\p{Script=Han}/u);
    assert.equal(translate(source,'zh-TW'),source);
  }
});

test('all real measurement description and unit tooltip combinations have English copy',()=>{
  for(const group of FIELD_GROUPS)for(const [key,label,description,unit]of group.fields){
    const source=description+(unit?` (${unit})`:''),translated=translate(source,'en');
    assert.notEqual(translated,source,`${group.id}.${key} (${label}) description was not translated`);
    assert.doesNotMatch(translated,/\p{Script=Han}/u,`${group.id}.${key} tooltip contains untranslated Chinese`);
    if(unit)assert.ok(translated.endsWith(` (${unit})`),`${group.id}.${key} unit must remain exact`);
    assert.equal(translate(source,'zh-TW'),source,`${group.id}.${key} original Chinese copy changed`);
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { caseFromReadRows,resolveTransferScope,patchFromCase,reconcileLensPatch } from '../src/transfer.js';

const read = (key, eye, value, extra = {}) => ({key, eye, value, status: 'read', ...extra});

test('bilateral imports preserve separate eye values and mirror shared constants for explicit review', () => {
  const result = caseFromReadRows([read('al', 'OD', '23.45'), read('al', 'OS', '24.10'), read('aConstant', 'shared', '118.7'), read('patient.gender', 'patient', 'female')], 'OU');
  assert.deepEqual(result.eyes.OD, {al: '23.45', aConstant: '118.7'});
  assert.deepEqual(result.eyes.OS, {al: '24.10', aConstant: '118.7'});
  assert.equal(result.patient.gender, 'female');
});

test('single-eye imports affect only the selected eye even if provided bilateral rows', () => {
  const rows = [read('al', 'OD', '23.45'), read('al', 'OS', '24.10'), read('aConstant', 'shared', '118.7')];
  const od = caseFromReadRows(rows, 'OD'), os = caseFromReadRows(rows, 'OS');
  assert.deepEqual(od.eyes.OD, {al: '23.45', aConstant: '118.7'});assert.deepEqual(od.eyes.OS, {});
  assert.deepEqual(os.eyes.OS, {al: '24.10', aConstant: '118.7'});assert.deepEqual(os.eyes.OD, {});assert.equal(os.activeEye, 'OS');
});

test('import candidates retain target zero and toric false while excluding blank and unsuccessful reads', () => {
  const result = caseFromReadRows([read('target', 'OD', 0), read('toric', 'OD', false), read('al', 'OD', ''), read('acd', 'OD', null), read('k1', 'OD', '43', {status: 'ambiguous'}), read('k2', 'OD', '44', {status: 'missing'})], 'OD');
  assert.deepEqual(result.eyes.OD, {target: '0', toric: false});
});

test('unknown data keys and unsupported values cannot enter a review candidate', () => {
  const result = caseFromReadRows([read('unknown', 'OD', 'x'), read('__proto__', 'shared', {polluted: true}), read('patient.unknown', 'patient', 'x'), read('al', 'OD', {value: '23'}), read('toric', 'OD', 'false'), read('k1', 'current', '43'), read('k2', 'patient', '44'), read('patient.age', 'patient', 65)], 'OU');
  assert.deepEqual(result.eyes, {OD: {}, OS: {}});assert.equal(result.patient.age, '65');assert.equal(Object.hasOwn(result.patient, 'unknown'), false);assert.equal({}.polluted, undefined);
});

test('read candidate construction leaves input rows unchanged and rejects an unspecified eye scope', () => {
  const rows = [read('aConstant', 'shared', '118.7')], before = structuredClone(rows);
  caseFromReadRows(rows, 'OU');assert.deepEqual(rows, before);assert.throws(() => caseFromReadRows(rows), /OD/);
});

test('automatic scope selects both independent eye groups and follows a detected single eye',()=>{
  assert.equal(resolveTransferScope({eyeMode:'both'},null,{activeEye:'OD'}),'OU');
  assert.equal(resolveTransferScope({eyeMode:'both'},null,{requested:'OS',explicit:true}),'OS');
  assert.equal(resolveTransferScope({eyeMode:'single'},{detectedEye:'OS'},{activeEye:'OD'}),'OS');
  assert.equal(resolveTransferScope({eyeMode:'single'},{detectedEye:'OS'},{requested:'OD',explicit:true}),'OD');
  assert.equal(resolveTransferScope({eyeMode:'single'},null,{requested:'OU',explicit:true,activeEye:'OS'}),'OS');
});

test('quick-copy patch preserves zero and false, excludes blanks, and marks only visible read Toric modes',()=>{
  const rows=[read('al','OD','23.45'),read('target','OD','0'),read('k1Axis','OD','90'),read('k1Axis','OS','85',{status:'missing'}),read('toric','OS',false),read('wtw','OD','')];
  const candidate=caseFromReadRows(rows,'OU',{profile:{fields:[{key:'k1Axis',eye:'OD',mode:'toric'},{key:'k1Axis',eye:'OS',mode:'toric'}]}});
  assert.equal(candidate.eyes.OD.toric,true);assert.equal(candidate.eyes.OS.toric,false);
  const {patch}=patchFromCase(candidate);assert.equal(patch.eyes.OD.target,'0');assert.equal(patch.eyes.OS.toric,false);assert.equal(Object.hasOwn(patch.eyes.OD,'wtw'),false);assert.equal(patch.patient,undefined);
});

test('dedicated Toric calculator reads preserve Toric mode without inferring it from ordinary K',()=>{
  for(const category of ['toric','lvc-toric'])assert.equal(caseFromReadRows([read('sia','OS','0.10')],'OS',{profile:{category}}).eyes.OS.toric,true);
  assert.equal(caseFromReadRows([read('k1','OD','43.20'),read('k2','OD','44.10')],'OD',{profile:{category:'toric'}}).eyes.OD.toric,undefined);
  assert.equal(caseFromReadRows([read('k1Axis','OD','90')],'OD',{profile:{category:'regular'}}).eyes.OD.toric,undefined);
});


test('a source lens change clears an omitted old catalog ID in both direct and partial imports',()=>{
  const current={eyes:{OD:{iolSourceSite:'evo',iolSourceValue:'OLD',iolSourceLabel:'OLD',iolCatalogId:'old-canonical'},OS:{iolCatalogId:'os-canonical'}}};
  const partial={eyes:{OD:{iolSourceValue:'NEW'}}},before=structuredClone(partial);
  assert.equal(reconcileLensPatch(current,partial).eyes.OD.iolCatalogId,'');assert.deepEqual(partial,before);
  const full={eyes:{OD:{iolSourceSite:'evo',iolSourceValue:'NEW',iolSourceLabel:'NEW',iolCatalogId:'new-canonical'}}};
  assert.equal(reconcileLensPatch(current,full).eyes.OD.iolCatalogId,'new-canonical');
  assert.deepEqual(reconcileLensPatch(current,{eyes:{OD:{al:'24'}}}),{eyes:{OD:{al:'24'}}});
});

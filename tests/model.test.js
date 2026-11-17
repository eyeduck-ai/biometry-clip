import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyCase, cleanCase, validateCase, mergeCandidates } from '../src/model.js';

test('new cases and eyes have independent mutable state', () => {
  const first = emptyCase();
  const second = emptyCase();
  first.eyes.OD.al = '24';
  first.patient.patientId = 'CASE-A';
  assert.deepEqual(first.eyes.OS, {});
  assert.deepEqual(second.eyes.OD, {});
  assert.equal(second.patient.patientId, '');
});

test('JSON roundtrip retains the selected eye, Toric flags, zero and separate K contexts', () => {
  const source = emptyCase();
  source.activeEye = 'OS';
  source.eyes.OS = { toric: true, target: 0, k1: '42', tk1: '41', postOpK1: '43', preOpK1: '40', lvcType: 'rk' };
  source.eyes.OD = { toric: false };
  const restored = cleanCase(JSON.parse(JSON.stringify(source)));
  assert.equal(restored.activeEye, 'OS');
  assert.deepEqual(restored.eyes.OS, { toric: true, target: '0', k1: '42', tk1: '41', postOpK1: '43', preOpK1: '40', lvcType: 'rk' });
  assert.equal(restored.eyes.OD.toric, false);
});

test('cleaning excludes unknown fields and object values while preserving known measurements', () => {
  const source = {
    patient: { patientId: 0, name: 'A'.repeat(200), unknown: 'discard', surgeonId: { malicious: 'value' } },
    eyes: { OD: { al: 24.5, target: 0, toric: 'false', unknown: 25, k2: { value: '45' } }, OS: { al: '25' }, OU: { al: '26' } },
    activeEye: 'OU', arbitrary: 'discard',
  };
  const result = cleanCase(source);
  assert.equal(result.patient.patientId, '0');
  assert.equal(result.patient.name.length, 150);
  assert.equal(result.patient.surgeonId, '');
  assert.deepEqual(result.eyes.OD, { al: '24.5', target: '0' });
  assert.deepEqual(result.eyes.OS, { al: '25' });
  assert.equal(result.activeEye, 'OD');
  assert.ok(!('unknown' in result.patient));
  assert.ok(!('OU' in result.eyes));
  result.eyes.OS.al = '27';
  assert.equal(source.eyes.OS.al, '25');
});

test('incision location permits 360 degrees while keratometry and refraction axes stop at 180', () => {
  const data = emptyCase();
  data.eyes.OD = { incisionAxis: '360', k1Axis: '180', k2Axis: '0', refractionAxis: '180', target: '0', refractionSphere: '-3', pk1: '-6' };
  assert.deepEqual(validateCase(data), []);
  data.eyes.OD.k1Axis = '181';
  data.eyes.OS.incisionAxis = '361';
  const errors = validateCase(data);
  assert.equal(errors.length, 2);
  assert.ok(errors.some(error => error.includes('OD K1 axis')));
  assert.ok(errors.some(error => error.includes('OS Incision axis')));
});

test('nonfinite, unit-suffixed, exponent and nonpositive physical measurements are rejected', () => {
  const data = emptyCase();
  data.eyes.OD = { al: 'NaN', acd: '0', lt: '-1', cct: 'Infinity', k1: '42 D', k2: '4.2e1' };
  assert.equal(validateCase(data).length, 6);
});

test('candidate merging changes only selected fields and never the opposite eye implicitly', () => {
  const original = emptyCase();
  original.patient.patientId = 'OLD';
  original.eyes.OD = { al: '23', k1: '42', toric: false };
  original.eyes.OS = { al: '24' };
  const candidate = { patient: { patientId: 'NEW' }, eyes: { OD: { al: '25', k1: '43', toric: true }, OS: { al: '26' } } };
  const merged = mergeCandidates(original, candidate, [{ eye: 'OD', key: 'al' }, { eye: 'OD', key: 'toric' }]);
  assert.deepEqual(merged.eyes.OD, { al: '25', k1: '42', toric: true });
  assert.equal(merged.eyes.OS.al, '24');
  assert.equal(merged.patient.patientId, 'OLD');
  assert.equal(original.eyes.OD.al, '23');
  assert.equal(candidate.eyes.OD.k1, '43');
});

test('candidate merging ignores unrecognized patient, eye and field selections', () => {
  const original = emptyCase();
  const candidate = { patient: { arbitrary: 'secret' }, eyes: { OU: { al: '24' }, OD: { arbitrary: 'value' } } };
  const merged = mergeCandidates(original, candidate, [{ eye: 'patient', key: 'arbitrary' }, { eye: 'OU', key: 'al' }, { eye: 'OD', key: 'arbitrary' }]);
  assert.deepEqual(merged, original);
});

test('planned SE IOL power stays independent from implanted and fellow IOL powers and target refraction',()=>{
  const original=emptyCase();original.eyes.OD={plannedIolPower:'20.0',implantedIolPower:'19.5',fellowIolPower:'18.0',target:'0'};original.eyes.OS={plannedIolPower:'-1.0'};
  const cleaned=cleanCase(original);assert.deepEqual(cleaned.eyes,original.eyes);assert.deepEqual(validateCase(cleaned),[]);
  const merged=mergeCandidates(cleaned,{patient:{},eyes:{OD:{plannedIolPower:'0',implantedIolPower:'22'},OS:{plannedIolPower:'21'}}},[{eye:'OD',key:'plannedIolPower'}]);
  assert.equal(merged.eyes.OD.plannedIolPower,'0');assert.equal(merged.eyes.OD.implantedIolPower,'19.5');assert.equal(merged.eyes.OD.fellowIolPower,'18.0');assert.equal(merged.eyes.OD.target,'0');assert.equal(merged.eyes.OS.plannedIolPower,'-1.0');
  const empty=cleanCase({eyes:{OD:{implantedIolPower:'20'},OS:{}}});assert.equal(empty.eyes.OD.plannedIolPower,undefined);
  merged.eyes.OD.plannedIolPower='20 D';assert.equal(validateCase(merged).length,1);
});

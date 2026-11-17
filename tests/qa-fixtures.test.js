import assert from 'node:assert/strict';
import test from 'node:test';
import { QA_CASE, QA_SITE_CHECKS } from '../src/qa/fixtures.js';
import { cleanCase, EYE_FIELDS, NUMERIC_FIELDS, PATIENT_FIELDS, validateCase } from '../src/model.js';
import { SITES } from '../src/sites.js';

test('QA fixture is explicitly synthetic, schema-clean, and contains no unrecognized fields', () => {
  assert.deepEqual(QA_CASE, cleanCase(QA_CASE));
  assert.match(QA_CASE.patient.patientId, /^QA-/);
  assert.match(QA_CASE.patient.name, /SYNTHETIC.*NOT A PATIENT/);
  assert.equal(QA_CASE.patient.age, '70');
  assert.equal(QA_CASE.patient.gender, 'female');
  assert.equal(QA_CASE.patient.surgeonId, 'DEMO');
  assert.equal(QA_CASE.patient.surgeonName, 'DEMO');
  assert.deepEqual(Object.keys(QA_CASE.patient).sort(), [...PATIENT_FIELDS].sort());
  for (const eye of ['OD', 'OS']) assert.deepEqual(Object.keys(QA_CASE.eyes[eye]).sort(), [...EYE_FIELDS].sort());
  assert.deepEqual(validateCase(QA_CASE), []);
});

test('QA measurements retain unit-specific ranges and explicit independent eye values', () => {
  assert.equal(QA_CASE.eyes.OD.al, '23.45');
  assert.equal(QA_CASE.eyes.OS.al, '24.10');
  for (const key of ['al', 'acd', 'lt', 'cct', 'wtw', 'k1', 'k2', 'k1Axis', 'k2Axis', 'target', 'sia', 'incisionAxis']) {
    assert.notEqual(Number(QA_CASE.eyes.OD[key]), Number(QA_CASE.eyes.OS[key]), key);
  }
  for (const eye of Object.values(QA_CASE.eyes)) {
    for (const key of NUMERIC_FIELDS) {
      if (eye[key] === '') continue;
      assert.ok(Number.isFinite(Number(eye[key])), key);
      if (/Axis$/.test(key)) assert.ok(Number(eye[key]) >= 0 && Number(eye[key]) <= (key === 'incisionAxis' ? 360 : 180), key);
    }
    assert.ok(Number(eye.al) >= 18 && Number(eye.al) <= 35);
    assert.ok(Number(eye.acd) >= 1.5 && Number(eye.acd) <= 5);
    assert.ok(Number(eye.lt) >= 2.5 && Number(eye.lt) <= 8);
    assert.ok(Number(eye.cct) >= 350 && Number(eye.cct) <= 650, 'CCT must be µm rather than mm');
    assert.ok(Number(eye.wtw) >= 8 && Number(eye.wtw) <= 14);
    for (const key of ['k1', 'k2', 'tk1', 'tk2', 'preOpK1', 'preOpK2', 'postOpK1', 'postOpK2', 'fellowK1', 'fellowK2']) {
      assert.ok(Number(eye[key]) >= 30 && Number(eye[key]) <= 60, key);
    }
    assert.ok(Number(eye.k1) < Number(eye.k2));
    assert.ok(Number(eye.preLvcRadius) > 6 && Number(eye.preLvcRadius) < 10, 'LVC radius is mm, not K in D');
    assert.ok(Number(eye.pk1) > 4 && Number(eye.pk2) < 8, 'posterior K uses explicit positive magnitudes');
  }
});

test('QA mode, constant and postoperative values cannot silently alias their different meanings', () => {
  for (const eye of Object.values(QA_CASE.eyes)) {
    assert.equal(eye.toric, true);
    assert.equal(eye.lvcType, 'myopic');
    assert.equal(eye.aConstant, '118.7');
    assert.equal(eye.lensFactor, '');
    assert.equal(eye.exchangeLensFactor, '');
    assert.notEqual(eye.exchangeAConstant, eye.aConstant);
    assert.notEqual(eye.target, eye.preLasikRefraction);
    assert.notEqual(eye.target, eye.postLasikRefraction);
    for (const key of ['k1', 'k2']) {
      assert.notEqual(eye[key], eye[key === 'k1' ? 'preOpK1' : 'preOpK2']);
      assert.notEqual(eye[key], eye[key === 'k1' ? 'postOpK1' : 'postOpK2']);
    }
    assert.notEqual(eye.al, eye.fellowAl);
    assert.notEqual(eye.implantedIolPower, eye.fellowIolPower);
    assert.ok(Number(eye.implantedIolCylinder) >= 1 && Number(eye.implantedIolCylinder) <= 6);
  }
  assert.equal(QA_CASE.eyes.OD.aConstant, QA_CASE.eyes.OS.aConstant);
  const copy = cleanCase(QA_CASE);
  copy.eyes.OD.al = '23.68';
  assert.equal(QA_CASE.eyes.OD.al, '23.45', 'runner must be able to create independent measurement copies');
});

test('QA metadata covers every current calculator profile without storing pass claims', () => {
  assert.equal(QA_SITE_CHECKS.length, SITES.length);
  assert.equal(new Set(QA_SITE_CHECKS.map(check => check.siteId)).size, SITES.length);
  assert.deepEqual(QA_SITE_CHECKS.map(check => check.siteId).sort(), SITES.map(site => site.id).sort());
  for (const check of QA_SITE_CHECKS) {
    assert.deepEqual(Object.keys(check).sort(), ['siteId', 'notes', 'toricKeys', 'lvcKeys', 'requiredManualModes'].sort());
    assert.equal(typeof check.notes, 'string');
    assert.ok(check.notes.length > 0);
    for (const key of ['toricKeys', 'lvcKeys', 'requiredManualModes']) {
      assert.ok(Array.isArray(check[key]), `${check.siteId}: ${key}`);
      assert.ok(check[key].every(value => typeof value === 'string' && value.length > 0));
      assert.equal(new Set(check[key]).size, check[key].length);
    }
  }
});

test('each claimed special-mode key has a real adapter mapping and nonempty test values for its eyes', () => {
  for (const check of QA_SITE_CHECKS) {
    const site = SITES.find(site => site.id === check.siteId);
    for (const key of [...check.toricKeys, ...check.lvcKeys]) {
      const mappings = [...site.fields,...(site.modeControls||[])].filter(field => field.key === key);
      assert.ok(mappings.length > 0, `${site.id}: ${key} must not invent unsupported coverage`);
      for (const mapping of mappings) {
        if (key.startsWith('patient.')) assert.ok(QA_CASE.patient[key.slice(8)] !== '', `${site.id}: ${key}`);
        else for (const eye of mapping.eye ? [mapping.eye] : ['OD', 'OS']) assert.ok(QA_CASE.eyes[eye][key] !== '', `${site.id}: ${eye} ${key}`);
      }
    }
  }
});

test('manual-only and derived modes cannot be mislabeled as automatic special-field coverage', () => {
  const get = id => QA_SITE_CHECKS.find(check => check.siteId === id);
  for (const id of ['escrs', 'solver-second']) {
    assert.deepEqual(get(id).lvcKeys, []);
    assert.ok(get(id).requiredManualModes.some(note => note.includes('LVC')), `${id}: empty keys must still require manual LVC verification`);
  }
  assert.ok(!get('kane').toricKeys.includes('k2Axis'), 'disabled derived axis is not an editable field pass requirement');
  assert.deepEqual(get('kane').lvcKeys, []);
  assert.ok(!get('kane').requiredManualModes.some(note => note.includes('LVC')), 'Keratoconus is not a supported LVC mode');
  assert.deepEqual(get('solver-complex').lvcKeys, ['preLvcRadius', 'correctedAmetropia']);
  assert.ok(get('solver-second').requiredManualModes.some(note => note.includes('Preop. ACD (D)')));
});

test('legal and calculation prerequisites are user actions rather than fixture automation', () => {
  const cooke = QA_SITE_CHECKS.find(check => check.siteId === 'cooke');
  assert.ok(cooke.requiredManualModes.some(note => note.includes('EULA') && note.includes('不得點 Accept')));
  const solver = QA_SITE_CHECKS.find(check => check.siteId === 'solver-toric');
  assert.ok(solver.requiredManualModes.some(note => note.includes('spherical calculation') && note.includes('IOL Power') && note.includes('不得自動點 Calculate')));
  for (const site of QA_SITE_CHECKS.filter(site => site.toricKeys.length)) assert.ok(site.requiredManualModes.some(note => note.includes('Toric')), site.siteId);
  for (const site of QA_SITE_CHECKS.filter(site => site.lvcKeys.length)) assert.ok(site.requiredManualModes.some(note => note.includes('LVC')), site.siteId);
});

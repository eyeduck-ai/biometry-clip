import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {exportCaseDocument, parseInterchange} from '../src/interchange.js';
import {exportParserDocument} from '../src/parser-interchange.js';

const sample = JSON.parse(await readFile(new URL('../examples/biometry-parser.synthetic.json', import.meta.url), 'utf8'));
const fixture = () => structuredClone(sample);

test('native CLI output projects bilateral values, a leading-zero ID and 0° into editable candidates', () => {
  const {data, measurementDate, unverifiedFields} = parseInterchange('\uFEFF' + JSON.stringify(sample));
  assert.equal(data.patient.patientId, '00001234');
  assert.equal(data.patient.gender, 'female');
  assert.equal(data.eyes.OD.al, '23.64');
  assert.equal(data.eyes.OS.al, '25.11');
  assert.equal(data.eyes.OD.cct, '551');
  assert.equal(data.eyes.OS.cct, '534');
  assert.equal(data.eyes.OD.k1Axis, '0');
  assert.equal(data.eyes.OS.tk2Axis, '97');
  assert.equal(measurementDate, '2026-11-18');
  assert.ok(unverifiedFields.has('measurementDate'));
  assert.ok(unverifiedFields.has('OD.k1Axis'));
  assert.ok(unverifiedFields.has('patient.patientId'));
  assert.equal(data.eyes.OD.pupil, undefined);
  assert.equal(data.report.eyes.OD.pupil.candidate_value, 4.25);
  assert.equal(data.report.eyes.OS.pupil.candidate_value, 3.41);
  assert.equal(data.report.measurement_date.candidate_value, measurementDate);
  assert.equal(data.report.eyes.OD.al.candidates, undefined);
  assert.ok(JSON.stringify(data.report).length < 8_192);
});

test('single-eye results keep laterality and distinguish verified values from conflicts and candidates', () => {
  const input = fixture();
  delete input.eyes.OD;
  const os = input.eyes.OS;
  Object.assign(os.al, {value: os.al.candidate_value, status: 'verified', verification_status: 'cross_checked'});
  Object.assign(os.lt, {value: null, candidate_value: null, data_status: 'conflict', status: 'conflict'});
  os.lt.candidates = [{value: 4.5}, {value: 4.6}];
  os.cct.unit = 'mm';
  os.k1.power.value = 39; // A candidate with an inconsistent accepted value.
  input.iol_calculations = [{eye: 'OS', lens_type: 'toric', target_refraction: -0.25}];
  const {data, warnings, unverifiedFields} = parseInterchange(input);
  assert.deepEqual(data.eyes.OD, {});
  assert.equal(data.activeEye, 'OS');
  assert.equal(data.eyes.OS.al, '25.11');
  assert.equal(unverifiedFields.has('OS.al'), false);
  assert.equal(unverifiedFields.has('OS.acd'), true);
  for (const key of ['lt','cct','k1','target','toric','pca','totalK']) {
    assert.equal(data.eyes.OS[key], undefined);
  }
  assert.match(warnings.join(' '), /OS LT.*OS CCT.*OS K1/);
  assert.match(warnings.join(' '), /IOL/);
});

test('rejects unsupported versions, failed reports, ambiguous eyes and unusable measurements', () => {
  for (const [changes, code] of [
    [{schema_version: '2.0'}, 'PARSER_VERSION'],
    [{verification_state: 'error'}, 'PARSER_EXTRACTION_ERROR'],
    [{eyes: {OU: sample.eyes.OD}}, 'PARSER_SHAPE'],
    [{eyes: {OD: {}}}, 'PARSER_EMPTY'],
  ]) assert.throws(() => parseInterchange({...sample, ...changes}), {code});
  const invalid = fixture();
  invalid.eyes.OD.k1.axis.candidate_value = 181;
  assert.throws(() => parseInterchange(invalid), {code: 'PARSER_VALUE'});
});

test('compatible export round-trips shared values without inventing verification, evidence or IOL inputs', () => {
  const imported = parseInterchange(sample);
  Object.assign(imported.data.eyes.OD, {toric: true, target: '-0.50', sia: '0.05'});
  const exported = exportParserDocument(imported.data);
  assert.equal(exported.schema_version, sample.schema_version);
  assert.equal(exported.verification_state, 'unverified');
  assert.equal(exported.source_sha256, '');
  assert.equal(exported.metadata.source_kind, 'biometry_clip_case');
  assert.equal(exported.runs, undefined);
  assert.equal(exported.measurement_date.candidate_value, imported.measurementDate);
  assert.equal(exported.eyes.OD.pupil.candidate_value, 4.25);
  assert.equal(exported.metadata.biometry_clip.report_source.source_sha256, sample.source_sha256);
  assert.equal(exported.eyes.OD.k1.axis.candidate_value, 0);
  assert.equal(exported.eyes.OD.k1.axis.value, null);
  assert.equal(exported.eyes.OD.k1.axis.verification_status, 'unverified');
  assert.equal(exported.eyes.OD.cct.unit, 'um');
  assert.equal(exported.eyes.OS.k2.axis.unit, 'degree');
  assert.equal(exported.eyes.OD.sia, undefined);
  assert.equal(exported.eyes.OD.toric, undefined);
  assert.equal(exported.eyes.OD.target, undefined);
  assert.deepEqual(parseInterchange(exported).data.eyes, parseInterchange(sample).data.eyes);
  assert.throws(() => exportParserDocument({patient:{},eyes:{OD:{target:'0'},OS:{}}}),
    {code: 'PARSER_EXPORT_EMPTY'});
});

test('native backup retains the original compact report alongside edited measurements', () => {
  const {data} = parseInterchange(sample);
  data.eyes.OD.al = '24.20';
  const backup = exportCaseDocument(data);
  assert.equal(backup.schemaVersion, '1.4');
  const restored = parseInterchange(backup).data;
  assert.equal(restored.eyes.OD.al, '24.20');
  assert.equal(restored.report.eyes.OD.al.candidate_value, 23.64);
  assert.equal(restored.report.eyes.OS.pupil.candidate_value, 3.41);
  assert.equal(restored.report.eyes.OS.al.candidates, undefined);
  const exported = exportParserDocument(restored);
  assert.equal(exported.eyes.OD.al.candidate_value, 24.2);
  assert.equal(exported.eyes.OD.pupil.candidate_value, 4.25);
  restored.patient.patientId = 'SYNTHETIC-DIFFERENT';
  assert.throws(() => exportParserDocument(restored), {code: 'PARSER_PATIENT_MISMATCH'});
});

const vghksBatch = (documents, source = 'orders') => ({schema_version: 1, source, documents});

test('a single VGHKS-bot PDF imports the same measurements as its nested parser JSON', () => {
  const source = fixture();
  source.iol_calculations = [{eye: 'OD', lens_type: 'toric', target_refraction: -0.50, rows: [{power: 21.5}]}];
  const wrapped = vghksBatch([{id: 'SYNTHETIC', label: 'Synthetic report', date: '2026-11-01', pages: [2], data: source}]);
  const result = parseInterchange(JSON.stringify({...wrapped, workflow: 'batch-export'}));
  assert.deepEqual(result, parseInterchange(source));
  assert.equal(result.measurementDate, '2026-11-18');
  assert.equal(result.data.eyes.OD.target, undefined);
  assert.equal(result.data.eyes.OD.plannedIolPower, undefined);
  assert.equal(result.data.report.iol_calculations, undefined);
});

test('a VGHKS-bot batch exposes independent reports in source order, including failed entries', () => {
  const od = fixture(), os = fixture();
  delete od.eyes.OS;
  delete os.eyes.OD;
  const batch = parseInterchange(vghksBatch([
    {label: 'First synthetic report', date: '2026-11-01', pages: [1, 3], data: od},
    {label: 'Skipped report', pages: null, error: 'Source error detail'},
    {label: 'Last synthetic report', date: '2026-02-30', pages: [2], data: os, error: null},
  ], 'scans'));
  assert.equal(batch.kind, 'parser-batch');
  const [first, failed, last] = batch.documents;
  assert.deepEqual([first.index, first.label, first.date, first.pages], [0, 'First synthetic report', '2026-11-01', [1, 3]]);
  assert.deepEqual(first.parsed.data.eyes.OS, {});
  assert.equal(first.parsed.data.eyes.OD.al, '23.64');
  assert.equal(first.parsed.measurementDate, '2026-11-18');
  assert.equal(failed.parsed, null);
  assert.match(failed.error, /PDF/);
  assert.doesNotMatch(failed.error, /Source error detail/);
  assert.equal(last.index, 2);
  assert.equal(last.date, '');
  assert.deepEqual(last.parsed.data.eyes.OD, {});
  assert.equal(last.parsed.data.eyes.OS.al, '25.11');
});

test('wrapped input requires a known VGHKS-bot version and applies existing parser validation', () => {
  const valid = vghksBatch([{data: fixture()}]);
  assert.throws(() => parseInterchange({...valid, schema_version: 2}), {code: 'PARSER_BATCH_VERSION'});
  assert.throws(() => parseInterchange({schema_version: 1, source: 'orders', documents: []}), {code: 'PARSER_BATCH_EMPTY'});
  assert.throws(() => parseInterchange({...valid, source: 'unrelated'}), {code: 'INTERCHANGE_FORMAT'});
  assert.throws(() => parseInterchange(vghksBatch([{data: {...fixture(), schema_version: '2.0'}}])), {code: 'PARSER_VERSION'});
  assert.throws(() => parseInterchange(vghksBatch([{data: {...fixture(), verification_state: 'error'}}])), {code: 'PARSER_EXTRACTION_ERROR'});
  assert.throws(() => parseInterchange(vghksBatch([{error: 'Source error detail'}])), {code: 'PARSER_BATCH_DOCUMENT'});
});

import {cleanCase, fieldLabel, validateCase} from './model.js';
import {cleanParserReport, PARSER_SCHEMA_VERSION, PARSER_EYES as eyes, parserObject as object, supplementaryFields} from './parser-report.js';

const numericFields = [
  ['al', ['al'], 'mm'],
  ['acd', ['acd'], 'mm'],
  ['lt', ['lt'], 'mm'],
  ['cct', ['cct'], 'um'],
  ['wtw', ['wtw'], 'mm'],
  ...['k1', 'k2', 'tk1', 'tk2'].flatMap(key => [
    [key, [key, 'power'], 'D'],
    [`${key}Axis`, [key, 'axis'], 'degree'],
  ]),
];
const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const genderValues = new Set(['male', 'female', 'other', 'unknown']);
const own = (value, key) => object(value) && Object.hasOwn(value, key);

function fail(code, message) {
  throw Object.assign(new Error(message), {code});
}

export function isParserDocument(value) {
  return own(value, 'schema_version') && (own(value, 'source_sha256') || own(value, 'workflow'));
}

function measuredValue(field) {
  if (!object(field) || field.data_status !== 'present') return null;
  const candidate = field.candidate_value;
  if (field.status === 'verified' && field.verification_status === 'cross_checked' &&
      candidate != null && field.value === candidate) {
    return {value: field.value, unverified: false};
  }
  if (field.status === 'unverified' && field.verification_status === 'unverified' &&
      field.value == null && candidate != null) {
    return {value: candidate, unverified: true};
  }
  return null;
}

function numericText(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const text = String(value);
  return text.length <= 100 && decimal.test(text) && Number.isFinite(Number(text)) ? text : null;
}

function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
}

/** Project editable measurements and attach a separate, bounded report snapshot. */
export function importParserDocument(document) {
  if (document.schema_version !== PARSER_SCHEMA_VERSION) {
    fail('PARSER_VERSION', '此版本支援 biometry-parser JSON schema 1.2。');
  }
  if (typeof document.source_sha256 !== 'string' || typeof document.workflow !== 'string' ||
      !object(document.eyes) || Object.keys(document.eyes).some(eye => !eyes.includes(eye) || !object(document.eyes[eye]))) {
    fail('PARSER_SHAPE', 'biometry-parser JSON 的來源或眼別結構不正確。');
  }
  if (document.verification_state === 'error') {
    fail('PARSER_EXTRACTION_ERROR', 'biometry-parser 回報擷取失敗，請先檢查來源結果。');
  }

  const patient = {};
  const measurements = {OD: {}, OS: {}};
  const unverifiedFields = new Set();
  const skipped = [];
  let measurementDate = '';
  function read(field, key, label, normalize, unit = null) {
    if (field == null) return null;
    const result = measuredValue(field);
    if (!result) {
      if (!object(field) || ['present', 'conflict'].includes(field.data_status)) skipped.push(label);
      return null;
    }
    const value = (field.unit ?? null) === unit ? normalize(result.value) : null;
    if (value === null || value === '') {
      skipped.push(label);
      return null;
    }
    if (result.unverified) unverifiedFields.add(key);
    return value;
  }

  const id = read(document.patient_id, 'patient.patientId', 'Patient ID',
    value => typeof value === 'string' && value.length <= 150 && value.trim() ? value : null);
  const gender = read(document.gender, 'patient.gender', 'Gender',
    value => genderValues.has(value) ? value : null);
  measurementDate = read(document.measurement_date, 'measurementDate', 'Measurement date', calendarDate) || '';
  if (id !== null) patient.patientId = id;
  if (gender !== null) patient.gender = gender;
  for (const eye of eyes) {
    for (const [key, path, unit] of numericFields) {
      const field = path.reduce((value, part) => value?.[part], document.eyes[eye]);
      const label = `${eye} ${fieldLabel(key)}`;
      const value = read(field, `${eye}.${key}`, label, numericText, unit);
      if (value !== null) measurements[eye][key] = value;
    }
  }
  const report = cleanParserReport(document);
  const data = cleanCase({patient, report, eyes: measurements, activeEye: Object.keys(measurements.OD).length ? 'OD' : 'OS'});
  const errors = validateCase(data);
  if (errors.length) fail('PARSER_VALUE', errors[0]);
  if (!eyes.some(eye => Object.keys(measurements[eye]).length)) {
    fail('PARSER_EMPTY', 'biometry-parser JSON 沒有可匯入的眼部測量值。');
  }
  const warnings = [];
  if (unverifiedFields.size) warnings.push('請核對並選取要匯入的未驗證候選值。');
  if (skipped.length) warnings.push(`已略過衝突、單位不符或無效欄位：${skipped.join('、')}`);
  if (Array.isArray(document.iol_calculations) && document.iol_calculations.length) {
    warnings.push('IOL 計算表保留在原始 JSON。');
  }
  return {kind: 'case', source: 'biometry-parser', data, warnings, measurementDate, unverifiedFields};
}

function candidate(value, unit = null) {
  return {
    value: null,
    candidate_value: value,
    unit,
    status: 'unverified',
    data_status: 'present',
    verification_status: 'unverified',
  };
}

/** The kit can deserialize this as ExtractionResult; edited values have no OCR provenance. */
export function exportParserDocument(input, {measurementDate} = {}) {
  const data = cleanCase(input);
  const errors = validateCase(data);
  if (errors.length) fail('PARSER_VALUE', errors[0]);
  const output = {
    schema_version: PARSER_SCHEMA_VERSION,
    source_sha256: '',
    workflow: 'biometry-clip',
    verification_state: 'unverified',
    eyes: {OD: {}, OS: {}},
    metadata: {source_kind: 'biometry_clip_case'},
  };
  for (const eye of eyes) {
    for (const [key, [group, part], unit] of numericFields) {
      const value = numericText(data.eyes[eye][key]);
      if (value === null) continue;
      const field = candidate(Number(value), unit);
      if (part) (output.eyes[eye][group] ??= {})[part] = field;
      else output.eyes[eye][group] = field;
    }
  }
  if (!eyes.some(eye => Object.keys(output.eyes[eye]).length)) {
    fail('PARSER_EXPORT_EMPTY', '請先填入共用眼部量測欄位，再匯出 biometry-parser JSON。');
  }
  if (data.patient.patientId.trim()) output.patient_id = candidate(data.patient.patientId);
  if (genderValues.has(data.patient.gender)) output.gender = candidate(data.patient.gender);
  const date = calendarDate(measurementDate);
  if (date) output.measurement_date = candidate(date);
  const report = data.report;
  if (report) {
    const reportId = measuredValue(report.patient_id)?.value;
    const draftId = data.patient.patientId.trim();
    if (typeof reportId === 'string' && reportId.trim() && draftId && reportId.trim() !== draftId) {
      fail('PARSER_PATIENT_MISMATCH', '來源報告病人 ID 與工作副本不一致，請先核對再匯出。');
    }
    if (!output.measurement_date && report.measurement_date) output.measurement_date = report.measurement_date;
    for (const eye of eyes) for (const key of supplementaryFields) {
      if (report.eyes[eye][key]) output.eyes[eye][key] = report.eyes[eye][key];
    }
    output.metadata.biometry_clip = {
      report_source: {
        source_sha256: report.source_sha256,
        workflow: report.workflow,
        verification_state: report.verification_state,
      },
    };
  }
  return output;
}

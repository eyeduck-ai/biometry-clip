export const PARSER_SCHEMA_VERSION = '1.2';
export const PARSER_EYES = ['OD', 'OS'];

const scalarUnits = {
  al: 'mm', acd: 'mm', lt: 'mm', cct: 'um', wtw: 'mm',
  mean_k: 'D', corneal_astigmatism: 'D', corneal_astigmatism_axis: 'degree', pupil: 'mm',
};
const topFields = ['patient_id', 'gender', 'measurement_date'];
const keratometryFields = ['k1', 'k2', 'tk1', 'tk2'];
export const supplementaryFields = ['mean_k', 'corneal_astigmatism', 'corneal_astigmatism_axis', 'pupil'];
const sourceStates = new Set(['present', 'not_found', 'absent', 'blank', 'not_measured', 'unreadable', 'conflict']);
const resultStates = new Set(['verified', 'unverified', 'needs_review', 'error']);
const fieldStates = new Set(['verified', 'unverified', 'not_reported', 'error', ...sourceStates]);
const checkedMissingStates = new Set(['not_measured', 'absent', 'blank']);
export const parserObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const scalar = value => typeof value === 'number' && Number.isFinite(value) ||
  typeof value === 'string' && value.length > 0 && value.length <= 150;

function invalid() {
  throw Object.assign(new Error('biometry-parser 報告摘要格式不正確。'), {code: 'PARSER_REPORT'});
}

/** Project one result field, keeping the source state apart from verification. */
function compactField(input, unit) {
  if (!parserObject(input) || (input.unit ?? null) !== unit) return undefined;
  const {data_status, status, verification_status, value, candidate_value} = input;
  if (!sourceStates.has(data_status) || !fieldStates.has(status) ||
      !['unverified', 'cross_checked'].includes(verification_status)) return undefined;

  if (data_status === 'present') {
    if (!scalar(candidate_value)) return undefined;
    if (status === 'verified') {
      if (verification_status !== 'cross_checked' || value !== candidate_value) return undefined;
    } else if (value != null || verification_status !== 'unverified') return undefined;
  } else {
    if (value != null || candidate_value != null || status === 'verified') return undefined;
    if (verification_status === 'cross_checked' &&
        (status !== data_status || !checkedMissingStates.has(status))) return undefined;
    // A default field has no source fact to store.
    if (data_status === 'not_found' && status === 'not_reported') return undefined;
  }

  return {
    unit, status, data_status, verification_status,
    ...(value != null ? {value} : {}),
    ...(candidate_value != null ? {candidate_value} : {}),
  };
}

/** Bounded report snapshot. No OCR runs, images, tables, text, or arbitrary metadata. */
export function cleanParserReport(input) {
  if (input == null) return undefined;
  if (!parserObject(input) || input.schema_version !== PARSER_SCHEMA_VERSION ||
      typeof input.workflow !== 'string' || !parserObject(input.eyes) ||
      Object.keys(input.eyes).some(eye => !PARSER_EYES.includes(eye) || !parserObject(input.eyes[eye]))) invalid();

  const report = {
    schema_version: PARSER_SCHEMA_VERSION,
    source_sha256: typeof input.source_sha256 === 'string' && /^[a-f0-9]{64}$/i.test(input.source_sha256)
      ? input.source_sha256.toLowerCase() : '',
    workflow: input.workflow.slice(0, 100),
    verification_state: resultStates.has(input.verification_state) ? input.verification_state : 'unverified',
    eyes: {OD: {}, OS: {}},
  };
  for (const key of topFields) {
    const value = compactField(input[key], null);
    if (value) report[key] = value;
  }
  for (const eye of PARSER_EYES) {
    const source = input.eyes[eye] || {};
    const target = report.eyes[eye];
    for (const [key, unit] of Object.entries(scalarUnits)) {
      const value = compactField(source[key], unit);
      if (value) target[key] = value;
    }
    for (const key of keratometryFields) {
      const power = compactField(source[key]?.power, 'D');
      const axis = compactField(source[key]?.axis, 'degree');
      if (power || axis) target[key] = {...(power && {power}), ...(axis && {axis})};
    }
  }
  return report;
}

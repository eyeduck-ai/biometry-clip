import {EYE_FIELDS, NUMERIC_FIELDS} from './model.js';

export const RESULT_FORMAT = 'biometry-clip-calculation-runs';
export const RESULT_VERSION = '1.0';
export const RESULT_PAGE_SIZE = 30;
export const RESULT_ROW_FIELDS = [
  'iolPower', 'predictedRefraction', 'toricPower', 'axis', 'residualCylinder',
  'residualAxis', 'refractionSphere', 'refractionCylinder', 'refractionAxis',
];
const units = {iolPower:'D', predictedRefraction:'D', toricPower:'D', axis:'deg',
  residualCylinder:'D', residualAxis:'deg', refractionSphere:'D', refractionCylinder:'D', refractionAxis:'deg'};
const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const numericInputs = new Set(NUMERIC_FIELDS);
const inputKeys = new Set(EYE_FIELDS);
const eyes = new Set(['OD', 'OS']);
const list = (value, limit) => Array.isArray(value) ? value.slice(0, limit) : [];
const present = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = (value, limit = 160) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit) : '';
const number = value => {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value);
  return text.length <= 32 && decimal.test(text) && Number.isFinite(Number(text)) ? text : undefined;
};
const resolvedEye = value => eyes.has(value) ? value : null;

export function cleanResultInputs(value) {
  if (!present(value)) return {};
  const inputs = {};
  for (const key of inputKeys) {
    if (!Object.hasOwn(value, key)) continue;
    const data = value[key];
    if (typeof data === 'boolean' && ['toric', 'keratoconus'].includes(key)) inputs[key] = data;
    else if (numericInputs.has(key)) {
      const text = number(data);
      if (text !== undefined) inputs[key] = text;
    } else {
      const text = string(data, 100);
      if (text) inputs[key] = text;
    }
  }
  return inputs;
}

function cleanResultRow(row) {
  if (!present(row)) return undefined;
  const values = {};
  for (const key of RESULT_ROW_FIELDS) {
    const value = number(row[key]);
    if (value !== undefined) values[key] = value;
  }
  if (!Object.keys(values).length) return undefined;
  const lensModel = string(row.lensModel);
  const rawCells = list(row.rawCells, 16).map(cell => ({
    label: string(cell?.label, 80), value: string(cell?.value, 100),
  })).filter(cell => cell.label && cell.value);
  return {...values, ...(lensModel && {lensModel}), ...(row.highlighted === true && {highlighted: true}),
    ...(row.siteSelected === true && {siteSelected: true}), ...(rawCells.length && {rawCells})};
}

export function normalizeResultGroups(groups) {
  return list(groups, 48).flatMap(group => {
    if (!present(group)) return [];
    const rows = list(group.rows, 250).map(cleanResultRow).filter(Boolean);
    if (!rows.length) return [];
    const constants = list(group.constants, 16).map(item => ({
      name: string(item?.name, 80), value: string(item?.value, 40), unit: string(item?.unit, 16),
    })).filter(item => item.name && item.value);
    const targetRefraction = number(group.targetRefraction);
    return [{
      eye: resolvedEye(group.eye),
      formula: string(group.formula),
      lensModel: string(group.lensModel),
      manufacturer: string(group.manufacturer),
      sourceLabel: string(group.sourceLabel),
      cylinderNotation: ['plus','minus'].includes(group.cylinderNotation) ? group.cylinderNotation : '',
      cylinderPlane: ['corneal','iol'].includes(group.cylinderPlane) ? group.cylinderPlane : '',
      ...(targetRefraction !== undefined && {targetRefraction}),
      ...(constants.length && {constants}),
      inputEcho: cleanResultInputs(group.inputEcho),
      rows,
    }];
  });
}

function safePageUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid result source URL.');
  return url.origin + url.pathname;
}

export function resultAssociation(selection, status = 'pending') {
  const patientId = string(selection?.patientId, 100);
  const measurementId = patientId ? string(selection?.measurementId, 100) : '';
  return {status: patientId ? status : 'unlinked', patientId, measurementId};
}

/** Store what the page showed. A form visible beside a result is not proof of its inputs. */
export function createResultRun({sample, site, pageUrl, trigger, selection, id, now, adapterVersion}) {
  const groups = normalizeResultGroups(sample?.groups);
  if (!groups.length) return null;
  const observedForm = {OD: cleanResultInputs(sample.observedForm?.OD), OS: cleanResultInputs(sample.observedForm?.OS)};
  return {
    id, capturedAt: now, siteId: site.id, siteName: site.name, pageUrl: safePageUrl(pageUrl),
    adapterVersion, trigger, groups, observedForm,
    association: resultAssociation(selection),
    choices: [],
  };
}

export function encodeResultChoices(run, choices) {
  if (!Array.isArray(choices)) throw new Error('Invalid result choices.');
  const accepted = [];
  for (const choice of choices) {
    const {groupIndex, rowIndex} = choice || {};
    if (!Number.isSafeInteger(groupIndex) || !Number.isSafeInteger(rowIndex) ||
        groupIndex < 0 || rowIndex < 0 || !run.groups[groupIndex]?.rows[rowIndex]) {
      throw new Error('Calculation result row no longer exists.');
    }
    if (!accepted.some(item => item.groupIndex === groupIndex && item.rowIndex === rowIndex)) accepted.push({groupIndex, rowIndex});
  }
  return accepted;
}

export function matchesResultRun(run, {siteId, patientId, eye} = {}) {
  return (!siteId || run.siteId === siteId) &&
    (!patientId || run.association.patientId === patientId) &&
    (!eye || run.groups.some(group => group.eye === eye));
}

export function resultExportMetadata(now = new Date().toISOString()) {
  return {format: RESULT_FORMAT, schemaVersion: RESULT_VERSION, exportedAt: now, units};
}

const csvColumns = [
  'run_id', 'captured_at', 'site_id', 'site_name', 'formula', 'eye', 'manufacturer', 'lens_model',
  'group_index', 'row_index', 'patient_ref', 'measurement_ref', 'association_status',
  'capture_trigger', 'page_url', 'adapter_version', 'target_refraction_D',
  'iol_power_D', 'predicted_refraction_D', 'toric_power_D', 'axis_deg', 'residual_cylinder_D',
  'residual_axis_deg', 'refraction_sphere_D', 'refraction_cylinder_D', 'refraction_axis_deg',
  'cylinder_notation', 'cylinder_plane', 'site_highlighted', 'site_selected', 'user_choice',
  'result_input_echo_json', 'observed_form_json', 'pre_calculation_form_json', 'watch_start_form_json', 'constants_json',
];

function escapeCsv(value) {
  let cell = String(value ?? '');
  // Neutralize formula-like text without changing ordinary signed numbers.
  if (/^[=+\-@\t\r\n]/.test(cell) && !decimal.test(cell)) cell = "'" + cell;
  return /[",\r\n]/.test(cell) ? '"' + cell.replaceAll('"', '""') + '"' : cell;
}

export const resultCsvHeader = () => csvColumns.join(',') + '\r\n';
export function resultCsvRows(run) {
  return run.groups.flatMap((group, groupIndex) => group.rows.map((row, rowIndex) => [
    run.id, run.capturedAt, run.siteId, run.siteName, group.formula, group.eye, group.manufacturer,
    row.lensModel || group.lensModel, groupIndex, rowIndex, run.association.patientId,
    run.association.measurementId, run.association.status, run.trigger, run.pageUrl, run.adapterVersion,
    group.targetRefraction, ...RESULT_ROW_FIELDS.map(key => row[key]), group.cylinderNotation,
    group.cylinderPlane, row.highlighted === true, row.siteSelected === true,
    run.choices.some(choice => choice.groupIndex === groupIndex && choice.rowIndex === rowIndex),
    JSON.stringify(group.inputEcho), JSON.stringify(group.eye ? run.observedForm[group.eye] : {}),
    JSON.stringify(group.eye ? run.preCalculationForm?.[group.eye] || {} : {}),
    JSON.stringify(group.eye ? run.watchStartForm?.[group.eye] || {} : {}),
    JSON.stringify(group.constants || []),
  ].map(escapeCsv).join(',') + '\r\n'));
}

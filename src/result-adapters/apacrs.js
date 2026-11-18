import {resultText, resultNumber, isResultVisible} from './dom.js';

// All five families and both Rx output tabs were observed using synthetic
// inputs in a fresh, ordinary headed Chrome profile on 2026-11-18. Current
// APACRS output summaries are readonly controls, separate from the input form.
// Keep the explicit table contract fallback for print-like static outputs.
const families = {
  'barrett-universal': {path: '/barrett_universal2105/', title: /Barrett\s+Universal\s+II(?:\s+Formula)?/i},
  'barrett-true-k': {path: '/barrett_true_k_universal_2105/', title: /Barrett\s+True[\s-]*K(?:\s+Formula)?/i},
  'barrett-toric': {path: '/toric_calculator20/', title: /Barrett\s+Toric(?:\s+Calculator)?/i},
  'barrett-true-k-toric': {path: '/truektorictk_preview/', title: /Barrett\s+True[\s-]*K\s+Toric(?:\s+Calculator)?/i},
  'barrett-rx': {path: '/barrett_rx105/', title: /Barrett\s+Rx(?:\s+Formula)?/i},
};
const aliases = {
  iolPower: ['IOL Power', 'IOL Power (D)', 'IOL (D)', 'IOL'],
  predictedRefraction: ['Refraction', 'Predicted Refraction', 'Refraction (S.E.)', 'Refraction (SE)', 'REF', 'REF (D)'],
  lensModel: ['IOL Model', 'Lens Model', 'Toric IOL Model'],
  toricPower: ['IOL Cylinder', 'Cylinder IOL Plane', 'Cylinder Power (IOL Plane)', 'Toric Power', 'Toric IOL Power'],
  axis: ['IOL Axis', 'Recommended Axis', 'Alignment Axis', 'Axis'],
  residualCylinder: ['Res. Cylinder', 'Residual Cylinder', 'Residual Astigmatism', 'Predicted Residual Astigmatism'],
  residualAxis: ['Residual Axis', 'Residual Cylinder Axis', 'Axis (Residual)'],
};
const header = value => resultText(value).toLowerCase().replace(/[\u00b0]/g, 'deg').replace(/\s*\((?:d|deg)\)\s*$/i, '').replace(/\s+/g, ' ');
const keys = new Map(Object.entries(aliases).flatMap(([key, labels]) => labels.map(label => [header(label), key])));
const validShapes = [['iolPower', 'predictedRefraction'], ['lensModel', 'residualCylinder'], ['toricPower', 'residualCylinder'], ['toricPower', 'axis']];
const decimalSource = '[+\\-−–]?(?:\\d+(?:[.,]\\d+)?|[.,]\\d+)';
const residualPair = new RegExp(`^(${decimalSource})\\s*(?:D|dpt)?\\s*@\\s*(${decimalSource})\\s*(?:°|deg(?:rees)?)?$`, 'i');

function numeric(value) {
  const parsed = resultNumber(value);
  if (parsed === undefined) return undefined;
  let text = parsed.replace(/^\+/, '');
  const negative = text.startsWith('-');
  if (negative) text = text.slice(1);
  const [whole = '0', fraction = ''] = text.split('.');
  const integer = whole.replace(/^0+(?=\d)/, '') || '0';
  const tail = fraction.replace(/0+$/, '');
  const magnitude = integer + (tail ? `.${tail}` : '');
  return `${negative && magnitude !== '0' ? '-' : ''}${magnitude}`;
}
function power(value) {
  const direct = numeric(value);
  if (direct !== undefined) return direct;
  // Some printed Barrett displays append the optic shape to the power.
  // The suffix is retained in rawCells and is never treated as an IOL model.
  const match = resultText(value).match(new RegExp(`^(${decimalSource})\\s*(?:D)?\\s*(?:S\\.E\\.?\\s*)?\\([\\p{L} -]+\\)$`, 'iu'));
  return match ? numeric(match[1]) : undefined;
}
function echoedNumber(value, key) {
  const expectedUnit = key === 'cct' ? '(?:µm|μm|um)' : ['al', 'acd', 'lt', 'wtw'].includes(key) ? 'mm' : 'D';
  const match = resultText(value).match(new RegExp(`^(${decimalSource})\\s*(?:${expectedUnit})?$`, 'i'));
  return match ? numeric(match[1]) : undefined;
}
function staticText(element) {
  if (!element) return '';
  const clone = element.cloneNode(true);
  clone.querySelectorAll('script,style,input,select,textarea,button,nav,[hidden],[aria-hidden="true"]').forEach(node => node.remove());
  return resultText(clone);
}
function eyeFrom(value) {
  const text = resultText(value);
  const od = /\bOD\b|\bRight\s+Eye\b/i.test(text);
  const os = /\bOS\b|\bLeft\s+Eye\b/i.test(text);
  return od !== os ? (od ? 'OD' : 'OS') : null;
}
function hasOutputColumns(table) {
  return [...(table?.rows || [])].slice(0, 305).some(row => {
    const columns = [...row.cells].map(cell => keys.get(header(staticText(cell))));
    return validShapes.some(fields => fields.every(key => columns.filter(value => value === key).length === 1));
  });
}
function labelledPairs(scope, outputTable) {
  const pairs = [];
  const outputTables = new WeakMap();
  for (const row of scope.querySelectorAll('tr')) {
    const table = row.closest('table');
    if (table === outputTable || !isResultVisible(row)) continue;
    if (!outputTables.has(table)) outputTables.set(table, hasOutputColumns(table));
    if (outputTables.get(table)) continue;
    const cells = [...row.cells];
    if (cells.length !== 2 || cells.some(cell => cell.querySelector('table,input,select,textarea,button'))) continue;
    const label = staticText(cells[0]).replace(/:\s*$/, '');
    const value = staticText(cells[1]);
    if (label && value) pairs.push({label, value});
  }
  for (const term of scope.querySelectorAll('dt')) {
    const definition = term.nextElementSibling;
    if (definition?.tagName === 'DD' && isResultVisible(term) && isResultVisible(definition) && !definition.querySelector('input,select,textarea')) {
      pairs.push({label: staticText(term).replace(/:\s*$/, ''), value: staticText(definition)});
    }
  }
  for (const node of scope.querySelectorAll('p,span')) {
    if (!isResultVisible(node) || node.querySelector('input,select,textarea,table,p,span')) continue;
    const pair = staticText(node).match(/^([^:]{1,48}):\s*(.+)$/);
    if (pair) pairs.push({label: pair[1].trim(), value: pair[2].trim()});
  }
  return pairs;
}
const metadataNames = {
  targetRefraction: ['target refraction', 'target ref.', 'target rx'],
  lensModel: ['iol model', 'lens model', 'iol lens model'],
  manufacturer: ['manufacturer', 'iol manufacturer'],
  al: ['axial length', 'al'], acd: ['optical acd', 'acd'], lt: ['lens thickness', 'lensthickness', 'lt'],
  cct: ['cct', 'central corneal thickness'], wtw: ['wtw', 'white to white'],
  k1: ['k1', 'measured k1'], k2: ['k2', 'measured k2'],
};
function uniquePair(pairs, names, parse = value => value) {
  const values = pairs.filter(pair => names.includes(header(pair.label))).map(pair => parse(pair.value)).filter(value => value !== undefined && value !== '');
  const unique = [...new Set(values)];
  return unique.length === 1 ? unique[0] : undefined;
}
function contextFor(table, formula) {
  let scope = table.parentElement || table;
  const explicitRegion = table.closest('section,article,fieldset,[role="region"]');
  if (explicitRegion) scope = explicitRegion;
  else {
    // Prefer the nearest output column, never the entire input/output page.
    for (let current = table.parentElement, depth = 0; current && !['BODY', 'HTML'].includes(current.tagName) && depth < 4; current = current.parentElement, depth++) {
      const pairs = labelledPairs(current, table);
      const markers = [...current.querySelectorAll('h1,h2,h3,h4,h5,h6,legend,caption')].map(staticText);
      if (pairs.length || markers.some(text => eyeFrom(text))) { scope = current; break; }
    }
  }
  const pairs = labelledPairs(scope, table);
  const markers = [...scope.querySelectorAll('h1,h2,h3,h4,h5,h6,legend,caption')].filter(isResultVisible).map(staticText);
  if (table.caption && isResultVisible(table.caption)) markers.unshift(staticText(table.caption));
  const explicitEyes = markers.map(eyeFrom).filter(Boolean);
  for (const pair of pairs) if (['eye', 'eye side', 'laterality'].includes(header(pair.label))) {
    const eye = eyeFrom(pair.value) || (/^right$/i.test(pair.value) ? 'OD' : /^left$/i.test(pair.value) ? 'OS' : null);
    if (eye) explicitEyes.push(eye);
  }
  const distinctEyes = [...new Set(explicitEyes)];
  const group = {eye: distinctEyes.length === 1 ? distinctEyes[0] : null, formula, lensModel: ''};
  for (const key of ['lensModel', 'manufacturer', 'targetRefraction']) {
    const value = uniquePair(pairs, metadataNames[key], key === 'targetRefraction' ? numeric : value => value);
    if (value !== undefined) group[key] = value;
  }
  const constants = pairs.filter(pair => /^(?:lens factor|lf|a constant|a-constant|aconst|a const)$/i.test(pair.label))
    .map(pair => ({name: pair.label, value: numeric(pair.value)})).filter(pair => pair.value !== undefined);
  if (constants.length) group.constants = [...new Map(constants.map(pair => [`${pair.name}:${pair.value}`, pair])).values()];
  const echo = {};
  // Only read echoed values from static metadata in the result scope. Original
  // editable form values and selected options are intentionally excluded.
  for (const key of ['al', 'acd', 'lt', 'cct', 'wtw', 'k1', 'k2']) {
    const value = uniquePair(pairs, metadataNames[key], value => echoedNumber(value, key));
    if (value !== undefined) echo[key] = value;
  }
  if (group.targetRefraction !== undefined) echo.target = group.targetRefraction;
  if (Object.keys(echo).length) group.inputEcho = echo;
  const caption = table.caption && staticText(table.caption);
  const rxMode = markers.find(text => /\bRx\s+(?:Exchange|Piggy\s*Back)\s+IOL\b/i.test(text));
  if (caption || rxMode) group.sourceLabel = [...new Set([rxMode, caption].filter(Boolean))].join(' · ');
  return group;
}
function highlighted(row, cells) {
  if (row.hasAttribute('bgcolor') || (row.style.backgroundColor && !['transparent', 'rgba(0, 0, 0, 0)'].includes(row.style.backgroundColor))) return true;
  const numericCells = cells.filter(cell => numeric(staticText(cell)) !== undefined);
  return numericCells.length > 0 && numericCells.every(cell => cell.querySelector('b,strong') || Number(cell.style.fontWeight) >= 600 || cell.style.fontWeight === 'bold');
}
function readTable(table, formula) {
  if (!isResultVisible(table) || table.querySelector('table')) return undefined;
  const tableRows = [...table.rows].slice(0, 305);
  let labels, columns, shape, start;
  for (const [index, row] of tableRows.entries()) {
    const cells = [...row.cells];
    if (!isResultVisible(row) || cells.some(cell => cell.colSpan !== 1 || cell.rowSpan !== 1 || cell.querySelector('input,select,textarea'))) continue;
    const candidate = cells.map(cell => keys.get(header(staticText(cell))));
    const required = validShapes.find(fields => fields.every(key => candidate.filter(value => value === key).length === 1));
    if (!required) continue;
    labels = cells.map(staticText);
    columns = candidate.map(key => candidate.indexOf(key) === candidate.lastIndexOf(key) ? key : undefined);
    shape = required;
    start = index + 1;
    break;
  }
  if (!shape) return undefined;
  const rows = [];
  for (const row of tableRows.slice(start)) {
    if (!isResultVisible(row)) continue;
    const cells = [...row.cells];
    if (cells.length !== columns.length || cells.some(cell => cell.colSpan !== 1 || cell.rowSpan !== 1 || cell.querySelector('input,select,textarea,table'))) continue;
    const values = {}, rawCells = [];
    for (const [index, cell] of cells.entries()) {
      if (!isResultVisible(cell)) continue;
      const text = staticText(cell);
      if (labels[index] && text) rawCells.push({label: labels[index], value: text});
      const key = columns[index];
      if (!key || !text) continue;
      if (key === 'lensModel') { values[key] = text; continue; }
      const pair = key === 'residualCylinder' && text.match(residualPair);
      if (pair) {
        values.residualCylinder = numeric(pair[1]);
        if (!columns.includes('residualAxis')) values.residualAxis = numeric(pair[2]);
      } else {
        const value = key === 'iolPower' ? power(text) : numeric(text);
        if (value !== undefined) values[key] = value;
      }
    }
    if (!shape.every(key => values[key] !== undefined)) continue;
    // A labelled axis outside its displayed domain is not silently normalized.
    if (['axis', 'residualAxis'].some(key => values[key] !== undefined && (+values[key] < 0 || +values[key] > 180))) continue;
    rows.push({...values, ...(rawCells.length && {rawCells}), ...(highlighted(row, cells) && {highlighted: true}),
      ...(row.getAttribute('aria-selected') === 'true' && {siteSelected: true})});
  }
  return rows.length ? {...contextFor(table, formula), rows} : undefined;
}

function outputControl(document, id) {
  const matches = [...document.querySelectorAll(`#${id}`)];
  const control = matches.length === 1 ? matches[0] : null;
  return control && ['INPUT', 'TEXTAREA'].includes(control.tagName) && control.readOnly && isResultVisible(control) ? resultText(control.value) : '';
}
function sourceTable(document, id) {
  const matches = [...document.querySelectorAll(`#${id}`)];
  return matches.length === 1 && matches[0].tagName === 'TABLE' && isResultVisible(matches[0]) ? matches[0] : null;
}
function liveGridRows(table, kind) {
  const expected = kind === 'bilateral' ? ['IOL Power', 'Optic', 'Refraction'] : kind === 'sphere' ?
    ['IOL Power', 'Toric Power', 'Refraction - (S.E.Q.)'] : ['Toric Power', 'IOL Cylinder', 'Residual Astigmatism'];
  if (!table || table.rows.length < 2) return [];
  const heading = [...table.rows[0].cells];
  if (heading.length !== 3 || heading.some((cell, index) => header(staticText(cell)) !== header(expected[index]))) return [];
  return [...table.rows].slice(1, 251).flatMap(row => {
    const cells = [...row.cells];
    if (!isResultVisible(row) || cells.length !== 3 || cells.some(cell => !isResultVisible(cell) || cell.colSpan !== 1 || cell.rowSpan !== 1 || cell.querySelector('table,input,select,textarea'))) return [];
    const raw = cells.map(staticText);
    let values;
    if (kind === 'cylinder') {
      const residual = raw[2].match(new RegExp(`^(${decimalSource})\\s+Cyl\\s+Axis\\s+(${decimalSource})$`, 'i'));
      const cylinder = numeric(raw[1]);
      if (!raw[0] || cylinder === undefined || !residual || +residual[2] < 0 || +residual[2] > 180) return [];
      values = {lensModel: raw[0], toricPower: cylinder, residualCylinder: numeric(residual[1]), residualAxis: numeric(residual[2])};
    } else {
      const iolPower = power(raw[0]);
      const predictedRefraction = numeric(raw[2].replace(/\s+S\.E\.?$/i, ''));
      if (iolPower === undefined || predictedRefraction === undefined) return [];
      values = {iolPower, predictedRefraction};
      if (kind === 'sphere') {
        const cylinder = numeric(raw[1]);
        if (cylinder !== undefined) values.toricPower = cylinder;
        else if (raw[1]) values.lensModel = raw[1];
      }
    }
    // APACRS gives ordinary zebra rows a background too. Only the observed
    // bold selected styling is a highlight, never every colored stripe.
    const emphasized = row.style.fontWeight === 'bold' || Number(row.style.fontWeight) >= 600;
    return [{...values, rawCells: expected.map((label, index) => ({label, value: raw[index]})),
      ...(emphasized && {highlighted: true}), ...(row.getAttribute('aria-selected') === 'true' && {siteSelected: true})}];
  });
}
function bilateralLiveResults(document, formula) {
  const model = outputControl(document, 'MainContent_ModelSelected');
  return [{eye: 'OD', grid: 'MainContent_GridView1', biometry: 'MainContent_Biomtery', suffix: ''},
    {eye: 'OS', grid: 'MainContent_GridView2', biometry: 'MainContent_Biometry0', suffix: '0'}].flatMap(spec => {
    const table = sourceTable(document, spec.grid);
    const rows = liveGridRows(table, 'bilateral');
    const biometry = outputControl(document, spec.biometry);
    const values = biometry.match(new RegExp(`^Axial length:\\s*(${decimalSource})\\s+Keratometry:\\s*K1:\\s*(${decimalSource})\\s+K2:\\s*(${decimalSource})\\s+ACD:\\s*(${decimalSource})$`, 'i'));
    if (!rows.length || !values) return [];
    const sourceEye = new RegExp(spec.eye === 'OD' ? 'Right Eye\\s*\\(OD\\)' : 'Left Eye\\s*\\(OS\\)', 'i');
    const eye = sourceEye.test(staticText(document.body)) ? spec.eye : null;
    const group = {eye, formula, lensModel: model, rows,
      inputEcho: {al: numeric(values[1]), k1: numeric(values[2]), k2: numeric(values[3]), acd: numeric(values[4])}};
    const prediction = outputControl(document, `MainContent_Prediction${spec.suffix}`);
    const target = prediction.match(new RegExp(`^Recommended IOL:.*?for Target Refraction:\\s*(${decimalSource})$`, 'i'));
    if (target) { group.targetRefraction = numeric(target[1]); group.inputEcho.target = group.targetRefraction; }
    const constants = outputControl(document, `MainContent_Constants${spec.suffix}`);
    const pair = constants.match(new RegExp(`^Lens Factor:\\s*(${decimalSource})\\s+A Constant:\\s*(${decimalSource})`, 'i'));
    if (pair) group.constants = [{name: 'Lens Factor', value: numeric(pair[1])}, {name: 'A Constant', value: numeric(pair[2])}];
    for (const [key, label] of [['wtw', 'WTW'], ['lt', 'LensThickness']]) {
      const value = constants.match(new RegExp(`\\b${label}:\\s*(${decimalSource})(?=\\s|$)`, 'i'));
      if (value) group.inputEcho[key] = numeric(value[1]);
    }
    const pca = outputControl(document, `MainContent_PCAMode${spec.suffix}`);
    if (pca) group.sourceLabel = pca;
    return [group];
  });
}
function singleOutputContext(document, formula, suffix, rx) {
  const selected = outputControl(document, `MainContent_SelectedIOL${suffix}`);
  if (!selected) return null;
  const label = selected.match(/^((?:Recommended|Exchange|Piggyback) IOL):/i)?.[1];
  if (!label || (suffix === 'pb' && !/^Piggyback IOL$/i.test(label))) return null;
  const biometry = outputControl(document, `MainContent_Biometry${suffix}`);
  const values = biometry.match(new RegExp(`^A Constant/LF:\\s*(${decimalSource})\\s*\\/\\s*(${decimalSource})\\s+AL:\\s*(${decimalSource})\\s+ACD:\\s*(${decimalSource})$`, 'i'));
  if (!values) return null;
  const group = {eye: null, formula, lensModel: outputControl(document, `MainContent_ModelSelected${suffix}`),
    constants: [{name: 'A Constant', value: numeric(values[1])}, {name: 'LF', value: numeric(values[2])}],
    inputEcho: {al: numeric(values[3]), acd: numeric(values[4])}};
  const keratometry = outputControl(document, `MainContent_Keratometry${suffix}`);
  const ks = keratometry.match(new RegExp(`^Flat K:\\s*(${decimalSource})\\s*@\\s*(${decimalSource})\\s+Steep K:\\s*(${decimalSource})\\s*@\\s*(${decimalSource})$`, 'i'));
  if (ks) {
    const names = rx ? ['postOpK1', 'postOpK1Axis', 'postOpK2', 'postOpK2Axis'] : ['k1', 'k1Axis', 'k2', 'k2Axis'];
    names.forEach((name, index) => { group.inputEcho[name] = numeric(ks[index + 1]); });
  }
  const incision = outputControl(document, `MainContent_IncisionLocation${suffix}`);
  const sia = incision.match(new RegExp(`^Induced Astigmatism \\(SIA\\):\\s*(${decimalSource})\\s*D\\s*@\\s*(${decimalSource})\\s+Degrees$`, 'i'));
  if (sia) { group.inputEcho.sia = numeric(sia[1]); group.inputEcho.incisionAxis = numeric(sia[2]); }
  const optimized = outputControl(document, `MainContent_OptimisedLF${suffix}`);
  const optimizedPair = optimized.match(new RegExp(`^Optimised A Constant/LF:\\s*(${decimalSource})\\s*\\/\\s*(${decimalSource})$`, 'i'));
  if (optimizedPair) group.constants.push({name: 'Optimised A Constant', value: numeric(optimizedPair[1])}, {name: 'Optimised LF', value: numeric(optimizedPair[2])});
  const minus = document.querySelector('#MainContent_RadioButtonList2_1');
  const plus = document.querySelector('#MainContent_RadioButtonList2_0');
  if (minus?.disabled && minus.checked) group.cylinderNotation = 'minus';
  else if (plus?.disabled && plus.checked) group.cylinderNotation = 'plus';
  return {group, selected, label};
}
function singleSummary(document, context, suffix) {
  const {selected, label} = context;
  const recommendation = selected.match(new RegExp(`^(?:Recommended|Exchange) IOL:\\s*(${decimalSource})\\s*D\\s*(?:S\\.E\\.?\\s*)?(.+?)\\s+Axis\\s+(${decimalSource})$`, 'i'));
  const piggyback = selected.match(new RegExp(`^Piggyback IOL:\\s*(${decimalSource})\\s*D\\s*\\(S\\.E\\.Q\\.\\)\\s*(${decimalSource})\\s*cyl\\s+Axis\\s+(${decimalSource})\\s+Degrees$`, 'i'));
  const match = recommendation || piggyback;
  if (!match || +match[3] < 0 || +match[3] > 180) return null;
  const row = {iolPower: numeric(match[1]), axis: numeric(match[3]), rawCells: [{label, value: selected}]};
  if (recommendation) row.lensModel = recommendation[2];
  const cylinder = outputControl(document, `MainContent_IOLcylinder${suffix}`);
  const iol = cylinder.match(new RegExp(`^Cylinder Power:\\s*IOL Plane\\s*(${decimalSource})\\s*D\\s*~\\s*Corneal Plane\\s*(${decimalSource})\\s*D$`, 'i'));
  if (iol) { row.toricPower = numeric(iol[1]); row.rawCells.push({label: 'Cylinder Power', value: cylinder}); }
  const refraction = outputControl(document, `MainContent_RefractTarget${suffix}`);
  const refract = refraction.match(new RegExp(`^(${decimalSource})\\s+sph\\.\\s*\\/\\s*(${decimalSource})\\s+cyl\\s+Axis\\s+(${decimalSource})\\s+Degrees$`, 'i'));
  if (refract && +refract[3] >= 0 && +refract[3] <= 180) {
    row.refractionSphere = numeric(refract[1]); row.refractionCylinder = numeric(refract[2]); row.refractionAxis = numeric(refract[3]);
    const headings = [...document.querySelectorAll(`#MainContent_Heading${suffix}`)];
    const heading = headings.length === 1 && isResultVisible(headings[0]) ? resultText(headings[0].value).replace(/:\s*$/, '') : '';
    if (['Target Refraction', 'Predicted Refraction'].includes(heading)) row.rawCells.push({label: heading, value: refraction});
  }
  for (const [id, sourceLabel] of [['TruekValue', 'TRUE K'], ['PCAMode', 'PCA'], ['KCalcMode', 'K Calculator'],
    ['OptimisedSIA', 'Calculated SIA'], ['RotateAxis', 'Rotate Existing IOL'], ['MinimumCylinder', 'Recommended Rotation']]) {
    const value = outputControl(document, `MainContent_${id}${suffix}`);
    if (value) row.rawCells.push({label: sourceLabel, value});
  }
  return {...context.group, sourceLabel: label, ...(iol && {cylinderPlane: 'iol'}), rows: [row]};
}
function singleLiveResults(document, formula, rx) {
  return (rx ? ['', 'pb'] : ['']).flatMap(suffix => {
    const context = singleOutputContext(document, formula, suffix, rx);
    if (!context) return [];
    const sphere = sourceTable(document, suffix ? 'MainContent_GridView3' : 'MainContent_GridView1');
    const cylinder = sourceTable(document, suffix ? 'MainContent_GridView4' : 'MainContent_GridView2');
    const sphereRows = liveGridRows(sphere, 'sphere');
    const cylinderRows = liveGridRows(cylinder, 'cylinder');
    const groups = [];
    if (sphereRows.length) groups.push({...context.group, sourceLabel: `${context.label} · IOL Power / Refraction - (S.E.Q.)`, rows: sphereRows});
    if (cylinderRows.length) groups.push({...context.group, sourceLabel: `${context.label} · IOL Cylinder / Residual Astigmatism`, cylinderPlane: 'iol', rows: cylinderRows});
    // Summary values are their own displayed output, not a join across the
    // two alternative tables. Never calculate SE from the sphere/cylinder.
    if (sphereRows.length || cylinderRows.length) { const summary = singleSummary(document, context, suffix); if (summary) groups.push(summary); }
    return groups;
  });
}

export function readApacrsResults(document, profile) {
  const family = families[profile?.id];
  if (!family) return [];
  try {
    const url = new URL(document.URL);
    if (url.protocol !== 'https:' || url.hostname !== 'calc.apacrs.org' || !decodeURIComponent(url.pathname).toLowerCase().startsWith(family.path)) return [];
  } catch { return []; }
  const titles = [...document.querySelectorAll('h1,h2,h3,[role="heading"]')].filter(isResultVisible).map(staticText);
  titles.push(document.title || '');
  const matched = titles.map(title => title.match(family.title)?.[0]).find(Boolean);
  if (!matched) return [];
  const bilateral = ['barrett-universal', 'barrett-true-k'].includes(profile.id);
  const hasLiveOutput = document.querySelector(bilateral ? '#MainContent_Biomtery[readonly],#MainContent_Biometry0[readonly]' : '#MainContent_SelectedIOL[readonly],#MainContent_SelectedIOLpb[readonly]');
  if (hasLiveOutput) return bilateral ? bilateralLiveResults(document, matched) : singleLiveResults(document, matched, profile.id === 'barrett-rx');
  return [...document.querySelectorAll('table')].slice(0, 100).map(table => readTable(table, matched)).filter(Boolean);
}

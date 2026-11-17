import {labelledBiometry} from './layout.js';
import {withReviewEvidence} from './evidence.js';
// Conservative extraction: a value is assigned only when its eye and field are explicit.
export const EYE_KEYS = Object.freeze([
  'al', 'acd', 'lt', 'cct', 'wtw', 'k1', 'k1Axis', 'k2', 'k2Axis', 'target',
  'sia', 'incisionAxis', 'pca', 'pcaAxis', 'tk1', 'tk1Axis', 'tk2', 'tk2Axis',
  'preLasikK', 'preLasikRefraction', 'postLasikRefraction', 'refractionSphere',
  'refractionCylinder', 'refractionAxis', 'implantedIolPower', 'implantedIolCylinder',
  'implantedIolAxis', 'desiredIolAxis',
]);
const PATIENT_KEYS = ['patientId', 'surgeonId', 'gender', 'age'];
const ALIASES = [
  ['k1Axis', /^(?:K1\s*(?:axis|ax)|flat\s*(?:axis|ax))\b/i],
  ['k2Axis', /^(?:K2\s*(?:axis|ax)|steep\s*(?:axis|ax))\b/i],
  ['tk1Axis', /^TK1\s*(?:axis|ax)\b/i], ['tk2Axis', /^TK2\s*(?:axis|ax)\b/i],
  ['tk1', /^TK1\b/i], ['tk2', /^TK2\b/i],
  ['al', /^(?:AL\b|axial\s*length\b|眼軸長|眼軸)/i],
  ['acd', /^(?:ACD\b|anterior\s*chamber\s*depth\b|前房深度)/i],
  ['lt', /^(?:LT\b|lens\s*thickness\b|水晶體厚度)/i],
  ['cct', /^(?:CCT\b|central\s*corneal\s*thickness\b|角膜厚度)/i],
  ['wtw', /^(?:WTW\b|W\s*[-–]\s*W\b|white\s*[-–]?\s*to\s*[-–]?\s*white\b|角膜直徑)/i],
  ['k1', /^(?:K1|K\s*flat|flat\s*K)\b/i], ['k2', /^(?:K2|K\s*steep|steep\s*K)\b/i],
  ['target', /^(?:target(?:\s*refraction)?\b|目標屈光度)/i],
  ['sia', /^(?:SIA|surgically\s*induced\s*astigmatism)\b/i],
  ['incisionAxis', /^(?:incision\s*(?:axis|location)\b|切口軸位)/i],
];
const NUMBERS = /[-+−]?\d+(?:[.,]\d+)?/g;
const eyePattern = /(?:^|[\s,;:(])(?:(OD|OS)|right\s*eye|left\s*eye|右眼|左眼)(?=$|[\s,;:)])/ig;

export function emptyCandidates() { return { patient: {}, eyes: { OD: {}, OS: {} }, warnings: [], conflicts: [] }; }

function eyesIn(text) {
  const found = [];
  for (const match of text.matchAll(eyePattern)) {
    const token = match[0].toUpperCase();
    found.push(/OD|RIGHT|右/.test(token) ? 'OD' : 'OS');
  }
  return [...new Set(found)];
}

function numberStrings(text) {
  return [...text.matchAll(NUMBERS)].map(m => m[0].replace('−', '-').replace(',', '.'));
}

function normalizeNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const text = String(value).trim().replace('−', '-').replace(',', '.');
  if (!/^[-+]?\d+(?:\.\d+)?$/.test(text) || !Number.isFinite(Number(text))) return null;
  return text.startsWith('+') ? text.slice(1) : text;
}

export function normalizeCandidates(input) {
  const result = emptyCandidates();
  if (!input || typeof input !== 'object') return result;
  for (const key of PATIENT_KEYS) {
    const value = input.patient?.[key];
    if (typeof value === 'string' || typeof value === 'number') {
      const text = String(value).trim();
      if (text && text.length <= 100) result.patient[key] = text;
    }
  }
  for (const eye of ['OD', 'OS']) {
    for (const key of EYE_KEYS) {
      const value = normalizeNumber(input.eyes?.[eye]?.[key]);
      if (value !== null) result.eyes[eye][key] = value;
    }
    const type = input.eyes?.[eye]?.lvcType;
    if (typeof type === 'string' && ['myopic', 'hyperopic', 'rk', 'none'].includes(type)) result.eyes[eye].lvcType = type;
  }
  return result;
}

export function parseBiometry(text) {
  const result = emptyCandidates();
  const blocked = new Set();
  let currentEye = null;
  let columns = null;
  const assign = (eye, key, value, unitText = '') => {
    const id = `${eye}.${key}`;
    if (blocked.has(id)) return;
    let normalized = normalizeNumber(value);
    if (normalized === null) return;
    if (key === 'cct' && /\bmm\b/i.test(unitText)) normalized = String(Number(normalized) * 1000);
    if (key === 'cct' && Number(normalized) < 10 && !/\bmm\b/i.test(unitText)) {
      result.warnings.push(`${eye} CCT 單位不明，保留空白。`); return;
    }
    if (result.eyes[eye][key] !== undefined && Number(result.eyes[eye][key]) !== Number(normalized)) {
      delete result.eyes[eye][key]; blocked.add(id); result.conflicts.push(id);
      result.warnings.push(`${eye} ${key} 有多個不同數值，保留空白。`);
    } else result.eyes[eye][key] = normalized;
  };
  for (const sourceLine of String(text ?? '').replace(/\r/g, '').split('\n')) {
    let line = sourceLine.trim();
    if (!line) continue;
    const patient = line.match(/^(patient\s*(?:ID|no\.?|number)|病歷號|surgeon\s*(?:ID|no\.?)|醫師代碼|gender|sex|性別|age|年齡)\s*[:：=]\s*(.+)$/i);
    if (patient) {
      const label = patient[1].toLowerCase();
      const key = /surgeon|醫師/.test(label) ? 'surgeonId' : /gender|sex|性別/.test(label) ? 'gender' : /age|年齡/.test(label) ? 'age' : 'patientId';
      if (result.patient[key] && result.patient[key] !== patient[2].trim()) {
        delete result.patient[key]; blocked.add(`patient.${key}`); result.conflicts.push(`patient.${key}`); result.warnings.push(`${key} 有多個值，保留空白。`);
      } else if (!blocked.has(`patient.${key}`)) result.patient[key] = patient[2].trim().slice(0, 100);
      continue;
    }
    const mentioned = eyesIn(line);
    const headerText = line.replace(eyePattern, '').replace(/[\s|:：,;()\[\]-]/g, '');
    if (mentioned.length === 2 && !headerText) { columns = mentioned; currentEye = null; continue; }
    if (mentioned.length === 1) {
      currentEye = mentioned[0]; columns = null;
      line = line.replace(eyePattern, ' ').replace(/^[\s:：,;()\[\]-]+/, '').trim();
      if (!line) continue;
    }
    // Some instruments put the field label between the right/left values.
    if (columns && /^[-+−]?\d/.test(line)) {
      const middle = line.match(/^([-+−]?\d+(?:[.,]\d+)?)\s+(.+)$/);
      if (middle && ALIASES.some(([, regex]) => regex.test(middle[2]))) {
        const label = ALIASES.find(([, regex]) => regex.test(middle[2]));
        const matchedLabel = middle[2].match(label[1])[0];
        line = `${matchedLabel} ${middle[1]} ${middle[2].slice(matchedLabel.length)}`;
      }
    }
    const alias = ALIASES.find(([, regex]) => regex.test(line));
    if (!alias) continue;
    const [key, label] = alias;
    const remainder = line.replace(label, '').replace(/^\s*[:：=]?\s*/, '');
    const values = numberStrings(remainder);
    if (mentioned.length === 2) {
      // Mixed inline eye labels are not safely separable by regex alone.
      result.warnings.push(`${key} 同列出現雙眼標記，請人工確認。`); continue;
    }
    if (columns) {
      if (values.length === 2) {
        assign(columns[0], key, values[0], remainder); assign(columns[1], key, values[1], remainder);
      } else if (['k1', 'k2', 'tk1', 'tk2'].includes(key) && values.length === 4 && /[@°]|\baxis\b/i.test(remainder)) {
        assign(columns[0], key, values[0]); assign(columns[0], `${key}Axis`, values[1]);
        assign(columns[1], key, values[2]); assign(columns[1], `${key}Axis`, values[3]);
      } else if (values.length) result.warnings.push(`${key} 雙眼欄位數不一致，保留空白。`);
    } else if (currentEye) {
      if (values.length === 1) assign(currentEye, key, values[0], remainder);
      else if (['k1', 'k2', 'tk1', 'tk2'].includes(key) && values.length === 2 && /[@°]|\baxis\b/i.test(remainder)) {
        assign(currentEye, key, values[0]); assign(currentEye, `${key}Axis`, values[1]);
      } else if (values.length) result.warnings.push(`${currentEye} ${key} 有不明的多個數字，保留空白。`);
    } else if (values.length) result.warnings.push(`${key} 缺少 OD／OS 標記，保留空白。`);
  }
  result.warnings = [...new Set(result.warnings)];
  return result;
}

/** OCR and native PDF text share geometry-aware eye and summary association. */
export function parseBiometryItems(items){
  const positioned=labelledBiometry(items);
  const result=parseBiometry(positioned.hasLayout?positioned.text:(positioned.text||itemsToText(items)));
  result.warnings=[...new Set([...result.warnings,...positioned.warnings])];
  return withReviewEvidence(result,positioned.evidence);
}

/** Merge pages without letting a later conflicting value silently win. */
export function mergeCandidatePages(pages) {
  const result = emptyCandidates();
  const blocked = new Set();
  for (const page of pages) for (const id of page.conflicts ?? []) blocked.add(id);
  result.conflicts = [...blocked];
  for (const page of pages) {
    result.warnings.push(...(page.warnings ?? []));
    for (const [section, source, target] of [
      ['patient', page.patient ?? {}, result.patient],
      ['OD', page.eyes?.OD ?? {}, result.eyes.OD],
      ['OS', page.eyes?.OS ?? {}, result.eyes.OS],
    ]) for (const [key, value] of Object.entries(source)) {
      const id = `${section}.${key}`;
      if (blocked.has(id) || value === '' || value === null || value === undefined) continue;
      const equal = target[key] === value || (target[key] !== undefined && normalizeNumber(target[key]) !== null && Number(target[key]) === Number(value));
      if (target[key] !== undefined && !equal) {
        delete target[key]; blocked.add(id); result.conflicts.push(id); result.warnings.push(`${section} ${key} 在不同頁面不一致，保留空白。`);
      } else target[key] = value;
    }
  }
  result.warnings = [...new Set(result.warnings)];
  return pages.some(page=>Array.isArray(page.evidence))?withReviewEvidence(result,pages.flatMap(page=>page.evidence||[])):result;
}

/** Preserve OCR column geometry as text rows for the conservative parser. */
export function itemsToText(items) {
  const points = (items ?? []).filter(item => typeof item.text === 'string').map(item => {
    const poly = item.poly ?? [];
    const xs = poly.map(point => Array.isArray(point) ? point[0] : point.x).filter(Number.isFinite);
    const ys = poly.map(point => Array.isArray(point) ? point[1] : point.y).filter(Number.isFinite);
    return { text: item.text, x: xs.length ? Math.min(...xs) : 0, y: ys.length ? Math.min(...ys) : Infinity, height: ys.length ? Math.max(...ys) - Math.min(...ys) : 0 };
  }).sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const point of points) {
    let row = rows.find(row => Number.isFinite(point.y) && Math.abs(row.y - point.y) <= Math.max(4, Math.min(row.height, point.height) * 0.45));
    if (!row) { row = { y: point.y, height: point.height, points: [] }; rows.push(row); }
    row.points.push(point);
  }
  return rows.map(row => row.points.sort((a, b) => a.x - b.x).map(point => point.text).join('\t')).join('\n');
}

import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { SITES, matchSite } from '../src/sites.js';
import { EYE_FIELDS, PATIENT_FIELDS, emptyCase } from '../src/model.js';
import { siteBridge } from '../src/bridge.js';

const targets = [
  ['https://iolcalculator.escrs.org/', 'escrs'],
  ['https://calc.apacrs.org/barrett_universal2105/', 'barrett-universal'],
  ['https://calc.apacrs.org/Barrett_True_K_Universal_2105/', 'barrett-true-k'],
  ['https://calc.apacrs.org/toric_calculator20/Toric%20Calculator.aspx', 'barrett-toric'],
  ['https://calc.apacrs.org/TrueKToricTK_preview/TrueKToricTK.aspx', 'barrett-true-k-toric'],
  ['https://calc.apacrs.org/barrett_rx105/', 'barrett-rx'],
  ['https://cookeformula.com/', 'cooke'],
  ['https://iolsolver.com/regular', 'solver-regular'],
  ['https://www.iolformula.com/', 'kane'],
  ['https://www.evoiolcalculator.com/Calculator.aspx', 'evo'],
  ['https://www.evoiolcalculator.com/Toric.aspx', 'evo-toric'],
  ['https://iolsolver.com/complex', 'solver-complex'],
  ['https://iolsolver.com/second', 'solver-second'],
  ['https://iolsolver.com/toric', 'solver-toric'],
  ['https://tecnistoriccalc.com/calculator/', 'tecnis-toric'],
];

test('all requested URLs resolve to their distinct calculator profile', () => {
  assert.equal(SITES.length, targets.length);
  assert.equal(new Set(SITES.map(site => site.id)).size, targets.length);
  for (const [url, id] of targets) assert.equal(matchSite(url)?.id, id, url);
});

test('calculator matching handles the encoded ASP.NET Toric path without confusing Rx or True K', () => {
  assert.equal(matchSite('https://calc.apacrs.org/toric_calculator20/Toric Calculator.aspx?test=1')?.id, 'barrett-toric');
  assert.equal(matchSite('https://calc.apacrs.org/BARRETT_RX105/')?.id, 'barrett-rx');
  assert.equal(matchSite('https://iolsolver.com/toric?from=regular')?.id, 'solver-toric');
  assert.equal(matchSite('https://iolsolver.com/second')?.id, 'solver-second');
  assert.equal(matchSite('https://www.evoiolcalculator.com/Toric.aspx?x=1')?.id, 'evo-toric');
});

test('unknown hosts and invalid URLs cannot reuse calculator profiles', () => {
  for (const url of ['https://evil.example/regular', 'https://iolsolver.com.attacker.example/toric', 'https://tecnistoriccalc.com.attacker.example/calculator/', 'http://tecnistoriccalc.com/calculator/', 'not a URL', '']) {
    assert.equal(matchSite(url), undefined, url);
  }
});

test('every mapped field survives the common data schema', () => {
  const eyes = new Set(EYE_FIELDS);
  const patient = new Set(PATIENT_FIELDS);
  for (const site of SITES) for (const field of site.fields) {
    assert.ok(field.key.startsWith('patient.') ? patient.has(field.key.slice(8)) : eyes.has(field.key), `${site.id}: ${field.key}`);
    assert.ok((field.selectors?.length || field.labels?.length || field.label), `${site.id}: locator for ${field.key}`);
    if (field.eye) assert.ok(['OD', 'OS'].includes(field.eye));
    if (field.labelIndex != null) assert.equal(field.expectedLabelCount, 2, `${site.id}: explicit bilateral label count`);
  }
});

function fixture(t, html, url = 'https://iolcalculator.escrs.org/') {
  const dom = new JSDOM(html, { url });
  const keys = ['document', 'location', 'getComputedStyle', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'Event'];
  const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'getComputedStyle' ? dom.window.getComputedStyle.bind(dom.window) : dom.window[key] });
  dom.window.HTMLElement.prototype.getClientRects = function () { return this.hidden || this.closest('[hidden]') ? [] : [{ width: 100, height: 20 }]; };
  t.after(() => {
    for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
    dom.window.close();
  });
}

test('ESCRS finds OS-only Toric controls inside OS scope and never writes OD', async t => {
  fixture(t, '<div class="mud-grid mud-grid-spacing-xs-6 noprint"><div class="mud-grid-item"><p>OD Right</p></div><div class="mud-grid-item"><p>OS Left</p><label for="axis">K1 axis</label><input id="axis" value="90"></div></div>');
  const profile = {...SITES.find(site => site.id === 'escrs'),writeSettleMs:0};
  const data = emptyCase();
  data.activeEye = 'OD';
  data.eyes.OD = { toric: true, k1Axis: '10' };
  assert.equal(siteBridge('preview', profile, data).rows.find(row=>row.key==='k1Axis').status, 'missing');
  assert.equal(document.querySelector('#axis').value, '90');
  data.activeEye = 'OS';
  data.eyes.OS = { toric: true, k1Axis: '175' };
  const preview = siteBridge('preview', profile, data);
  assert.equal(preview.rows.find(row=>row.key==='k1Axis').status, 'ready');
  const applied = await siteBridge('apply', profile, data, { expected: preview.rows });
  assert.equal(applied.rows.find(row=>row.key==='k1Axis').status, 'filled');
  assert.equal(document.querySelector('#axis').value, '175');
});

test('a duplicated ESCRS eye scope is rejected instead of choosing a first match', t => {
  fixture(t, Array(2).fill('<div class="mud-grid mud-grid-spacing-xs-6 noprint"><div class="mud-grid-item"><label for="axis">K1 axis</label><input id="axis" value="90"></div><div class="mud-grid-item"></div></div>').join(''));
  const data = emptyCase();
  data.eyes.OD = { toric: true, k1Axis: '10' };
  const result = siteBridge('preview', SITES.find(site => site.id === 'escrs'), data);
  assert.equal(result.rows.find(row=>row.key==='k1Axis').status, 'ambiguous');
  assert.deepEqual([...document.querySelectorAll('input')].map(input => input.value), ['90', '90']);
});

test('Solver Toric only fills its editable Toric fields and preserves spherical header data', t => {
  fixture(t, '<label for="al">AL (mm)</label><input id="al" readonly value="24"><label for="axis">K1 axis (°)</label><input id="axis" type="number"><label for="sia">SIA (D)</label><input id="sia" type="number"><label for="incision">Incision axis (°)</label><input id="incision" type="number">', 'https://iolsolver.com/toric');
  const profile = SITES.find(site => site.id === 'solver-toric');
  assert.equal(profile.verified, true);
  const data = emptyCase();
  data.eyes.OD = { al: '99', k1Axis: '175', sia: '0.1', incisionAxis: '90', pca: '0.3', pcaAxis: '80' };
  const preview = siteBridge('preview', profile, data, { eyeConfirmed: true });
  assert.deepEqual(preview.rows.map(row => row.key), ['k1Axis', 'sia', 'incisionAxis']);
  const applied = siteBridge('apply', profile, data, { eyeConfirmed: true, expected: preview.rows });
  assert.ok(applied.rows.every(row => row.status === 'filled'));
  assert.equal(document.querySelector('#al').value, '24');
  assert.equal(document.querySelector('#axis').value, '175');
});


test('every supported host can receive the packaged floating panel without wildcard extension access',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../public/manifest.json',import.meta.url),'utf8'));
  const panel=manifest.web_accessible_resources.find(rule=>rule.resources.includes('index.html'));
  for(const site of SITES){
    const permission=`${new URL(site.url).origin}/*`;
    assert.ok(manifest.host_permissions.includes(permission),`${site.id}: host permission`);
    assert.ok(panel.matches.includes(permission),`${site.id}: packaged panel access`);
  }
  assert.equal(manifest.host_permissions.includes('https://*/*'),false);
  assert.equal(panel.extension_ids,undefined);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {APACRS_SITES} from '../src/adapters/apacrs.js';
import {readApacrsResults} from '../src/result-adapters/apacrs.js';

const profiles = new Map(APACRS_SITES.map(profile => [profile.id, profile]));
function fixture(name, id, suffix = '') {
  const profile = profiles.get(id);
  const html = readFileSync(new URL(`./fixtures/result-apacrs/${name}.html`, import.meta.url), 'utf8');
  return {profile, document: new JSDOM(html, {url: new URL(suffix, profile.url).href}).window.document};
}
const inline = (html, id = 'barrett-universal', url = profiles.get(id).url) => ({profile: profiles.get(id), document: new JSDOM(html, {url}).window.document});
const read = ({document, profile}) => readApacrsResults(document, profile);
function liveFixture(name, id) {
  const html = readFileSync(new URL(`./fixtures/result-apacrs/live-${name}.html`, import.meta.url), 'utf8');
  const url = readFileSync(new URL(`./fixtures/result-apacrs/live-${name}-url.txt`, import.meta.url), 'utf8').replace(/^\uFEFF/, '').trim();
  return {profile: profiles.get(id), document: new JSDOM(html, {url}).window.document};
}

test('Universal captures both explicit eyes, source metadata and exact displayed choices', () => {
  const groups = read(fixture('universal', 'barrett-universal'));
  assert.equal(groups.length, 2);
  const [od, os] = groups;
  assert.equal(od.eye, 'OD');
  assert.equal(os.eye, 'OS');
  assert.equal(od.formula, 'Barrett Universal II Formula');
  assert.equal(od.lensModel, 'SYNTHETIC MODEL A');
  assert.equal(od.manufacturer, 'SYNTHETIC MAKER');
  assert.equal(od.targetRefraction, '0');
  assert.deepEqual(od.constants, [{name: 'Lens Factor', value: '1.9'}, {name: 'A Constant', value: '119'}]);
  assert.deepEqual(od.inputEcho, {al: '24', k1: '43', k2: '44', target: '0'});
  assert.equal(od.rows[0].iolPower, '20.5');
  assert.equal(od.rows[0].predictedRefraction, '-0.3');
  assert.equal(od.rows[1].predictedRefraction, '0');
  assert.equal(od.rows[1].highlighted, true);
  assert.equal(od.rows[1].siteSelected, true);
  assert.equal(od.rows[0].siteSelected, undefined);
  assert.equal(os.lensModel, '');
  assert.equal(os.targetRefraction, '-0.5');
  assert.deepEqual(od.rows[0].rawCells.find(cell => cell.label === 'Optic'), {label: 'Optic', value: 'Biconvex'});
});

test('True K supports explicit no-history output labels and printed optic suffixes', () => {
  const [group] = read(fixture('true-k', 'barrett-true-k', 'Results.aspx'));
  assert.equal(group.eye, 'OS');
  assert.equal(group.sourceLabel, 'True K No History');
  assert.equal(group.rows.length, 1);
  assert.equal(group.rows[0].iolPower, '22');
  assert.equal(group.rows[0].predictedRefraction, '-0.25');
  assert.equal(group.rows[0].lensModel, undefined);
});

test('Toric separates IOL cylinder, alignment axis and combined residual cylinder/axis', () => {
  const [group] = read(fixture('toric', 'barrett-toric'));
  assert.equal(group.eye, 'OD');
  assert.equal(group.rows.length, 2);
  assert.deepEqual(Object.fromEntries(['toricPower', 'axis', 'residualCylinder', 'residualAxis'].map(key => [key, group.rows[0][key]])), {toricPower: '0', axis: '0', residualCylinder: '-0.75', residualAxis: '90'});
  assert.equal(group.rows[1].highlighted, true);
  assert.equal(group.rows[1].residualCylinder, '0');
  assert.equal(group.rows[1].toricPower, '1.5');
  assert.equal(group.rows[1].siteSelected, undefined);
  assert.ok(group.rows[1].rawCells.some(cell => cell.label === 'Corneal plane' && cell.value === '1.10 D'));
});

test('True-K Toric reads only labelled numeric result columns and preserves decimal comma source', () => {
  const [group] = read(fixture('true-k-toric', 'barrett-true-k-toric', 'Output.aspx'));
  assert.equal(group.eye, 'OS');
  assert.equal(group.rows[0].iolPower, '20.5');
  assert.equal(group.rows[0].predictedRefraction, '-0.25');
  assert.equal(group.rows[0].axis, '175');
  assert.equal(group.rows[0].residualAxis, '85');
  assert.equal(group.rows[0].rawCells[0].value, '20,50');
});

test('Rx Exchange and Piggyback stay separately labelled without joining spherical/toric alternatives', () => {
  const groups = read(fixture('rx', 'barrett-rx'));
  assert.equal(groups.length, 3);
  assert.match(groups[0].sourceLabel, /Rx Exchange IOL/);
  assert.match(groups[1].sourceLabel, /Rx Exchange IOL/);
  assert.match(groups[2].sourceLabel, /Rx Piggy Back IOL/);
  assert.equal(groups[0].rows[0].iolPower, '23');
  assert.equal(groups[0].lensModel, 'SYNTHETIC EXCHANGE');
  assert.equal(groups[0].rows[0].residualCylinder, undefined);
  assert.equal(groups[1].rows[0].iolPower, undefined);
  assert.equal(groups[1].rows[0].residualCylinder, '-1.2');
  assert.equal(groups[2].rows[0].iolPower, '-1');
  assert.equal(groups[2].rows[0].predictedRefraction, '0');
});

test('the header of an adjacent Toric result table is never mistaken for lens metadata', () => {
  const input = inline('<title>Barrett Universal II Formula</title><section><table><tr><th>IOL Power</th><th>Refraction</th></tr><tr><td>20</td><td>0</td></tr></table><table><tr><th>IOL Model</th><th>Res. Cylinder</th></tr><tr><td>SYNTHETIC T1</td><td>0.1 @ 90</td></tr></table></section>');
  assert.equal(read(input)[0].lensModel, '');
});

test('input forms, selected lens options and numeric biometry grids are not results', () => {
  const input = inline('<title>Barrett Universal II Formula</title><form><select><option>IOL Power</option><option>20.00</option></select><table><tr><td>IOL Power</td><td>Refraction</td></tr><tr><td><input value="20"></td><td><input value="0"></td></tr></table><table><tr><td>AL</td><td>K1</td></tr><tr><td>24</td><td>43</td></tr></table></form>');
  assert.deepEqual(read(input), []);
});

test('a selected original form eye and model are not evidence about a previously generated result', () => {
  const input = inline('<title>Barrett Universal II Formula</title><form><label>OS <input type="radio" checked></label><p>IOL Model: <select><option>INPUT ONLY MODEL</option></select></p><input name="target" value="-8"></form><section><table><tr><th>IOL Power</th><th>Refraction</th></tr><tr><td>20</td><td>0</td></tr></table></section>');
  const [group] = read(input);
  assert.equal(group.eye, null);
  assert.equal(group.lensModel, '');
  assert.equal(group.targetRefraction, undefined);
  assert.equal(group.inputEcho, undefined);
});

test('no eye is assigned when a result region contains conflicting explicit eye labels', () => {
  const input = inline('<title>Barrett Universal II Formula</title><section><h3>Right Eye (OD)</h3><h3>Left Eye (OS)</h3><table><tr><th>IOL Power</th><th>Refraction</th></tr><tr><td>20</td><td>0</td></tr></table></section>');
  assert.equal(read(input)[0].eye, null);
});

test('profile/host/path/formula mismatches and unknown profiles fail closed', () => {
  const html = '<title>Barrett Universal II Formula</title><table><tr><th>IOL Power</th><th>Refraction</th></tr><tr><td>20</td><td>0</td></tr></table>';
  assert.deepEqual(read(inline(html, 'barrett-universal', 'https://calc.apacrs.org/barrett_rx105/Results.aspx')), []);
  assert.deepEqual(read(inline(html, 'barrett-universal', 'https://attacker.example/barrett_universal2105/')), []);
  assert.deepEqual(read(inline(html.replace('Barrett Universal II Formula', 'Unrelated Calculator'))), []);
  const document = inline(html).document;
  assert.deepEqual(readApacrsResults(document, {id: 'unknown'}), []);
});

test('missing or duplicate required headers and nonnumeric cells never become result rows', () => {
  const input = inline('<title>Barrett Universal II Formula</title><table><tr><th>IOL Power</th><th>IOL Power</th><th>Refraction</th></tr><tr><td>20</td><td>21</td><td>0</td></tr></table><table><tr><th>IOL Power</th><th>Refraction</th></tr><tr><td>ERROR 20</td><td>0</td></tr><tr><td>20</td><td>Not calculated</td></tr></table>');
  assert.deepEqual(read(input), []);
});

test('hidden results and layout parent tables do not leak or duplicate captured output', () => {
  const input = inline('<title>Barrett Universal II Formula</title><div hidden><table><tr><th>IOL Power</th><th>Refraction</th></tr><tr><td>99</td><td>99</td></tr></table></div><table><tr><td><table><tr><th>IOL Power</th><th>Refraction</th></tr><tr><td>20</td><td>0</td></tr></table></td></tr></table>');
  const groups = read(input);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].rows[0].iolPower, '20');
});

test('echoed CCT in incompatible units is not silently converted or linked to inputs', () => {
  const input = inline('<title>Barrett Universal II Formula</title><section><dl><dt>CCT</dt><dd>0.540 mm</dd><dt>Axial Length</dt><dd>24.0 mm</dd></dl><table><tr><th>IOL Power</th><th>Refraction</th></tr><tr><td>20</td><td>0</td></tr></table></section>');
  assert.deepEqual(read(input)[0].inputEcho, {al: '24'});
});

test('live Universal II output matches all displayed OD/OS power-refraction pairs and readonly metadata', () => {
  const groups = read(liveFixture('universal', 'barrett-universal'));
  assert.deepEqual(groups.map(g => [g.eye, g.lensModel, g.targetRefraction]), [['OD', 'Alcon SN60WF', '0'], ['OS', 'Alcon SN60WF', '-0.5']]);
  assert.deepEqual(groups.map(g => g.rows.map(r => [r.iolPower, r.predictedRefraction])), [
    [['21', '-0.96'], ['20.5', '-0.6'], ['20', '-0.24'], ['19.5', '0.11'], ['19', '0.46'], ['18.5', '0.8'], ['18', '1.14']],
    [['20.5', '-1.62'], ['20', '-1.25'], ['19.5', '-0.89'], ['19', '-0.53'], ['18.5', '-0.17'], ['18', '0.18'], ['17.5', '0.52']],
  ]);
  assert.deepEqual(groups[0].inputEcho, {al: '24', k1: '43', k2: '44', acd: '3.2', target: '0', wtw: '11.8', lt: '4.5'});
  assert.deepEqual(groups[0].constants, [{name: 'Lens Factor', value: '1.88'}, {name: 'A Constant', value: '118.99'}]);
  assert.ok(groups.every(g => g.rows.filter(r => r.highlighted).length === 1));
});

test('live True-K reads two independent output constants and every displayed pair', () => {
  const groups = read(liveFixture('true-k', 'barrett-true-k'));
  assert.deepEqual(groups.map(g => g.eye), ['OD', 'OS']);
  assert.deepEqual(groups.map(g => g.rows.map(r => [r.iolPower, r.predictedRefraction])), [
    [['22.5', '-1.17'], ['22', '-0.81'], ['21.5', '-0.45'], ['21', '-0.11'], ['20.5', '0.24'], ['20', '0.58'], ['19.5', '0.92']],
    [['21.5', '-1.66'], ['21', '-1.29'], ['20.5', '-0.93'], ['20', '-0.58'], ['19.5', '-0.23'], ['19', '0.12'], ['18.5', '0.46']],
  ]);
  assert.deepEqual(groups.map(g => g.constants.find(c => c.name === 'Lens Factor').value), ['2.15', '2.09']);
  assert.ok(groups.every(g => g.sourceLabel === 'Predicted PCA'));
});

test('live Toric separates model strings, numeric cylinders, residual axes and its summary', () => {
  const groups = read(liveFixture('toric', 'barrett-toric'));
  assert.equal(groups.length, 3);
  assert.ok(groups.every(g => g.eye === null && g.lensModel === 'Alcon SN6ATx' && g.cylinderNotation === 'minus'));
  assert.deepEqual(groups[0].rows.map(r => [r.iolPower, r.predictedRefraction, r.lensModel, r.toricPower]), [['20', '-0.28', 'SN6AT3', undefined], ['19.5', '0.07', 'SN6AT3', undefined], ['19', '0.41', 'SN6AT3', undefined]]);
  assert.deepEqual(groups[1].rows.map(r => [r.lensModel, r.toricPower, r.residualCylinder, r.residualAxis]), [['SN6AT2', '1', '-0.28', '180'], ['SN6AT3', '1.5', '-0.05', '90'], ['SN6AT4', '2.25', '-0.55', '90']]);
  const summary = groups[2].rows[0];
  assert.deepEqual([summary.iolPower, summary.toricPower, summary.axis, summary.refractionSphere, summary.refractionCylinder, summary.refractionAxis], ['19.5', '1.5', '90', '0.09', '-0.05', '90']);
  assert.equal(summary.predictedRefraction, undefined, 'never calculate SE from sphere/cylinder');
  assert.ok(summary.rawCells.some(cell => cell.label === 'Target Refraction'));
  assert.equal(groups[0].rows.filter(r => r.highlighted).length, 1, 'zebra rows are not highlights');
  assert.equal(groups[1].rows.filter(r => r.highlighted).length, 1);
});

test('live True-K Toric preserves different IOL alignment and residual refraction axes', () => {
  const groups = read(liveFixture('true-k-toric', 'barrett-true-k-toric'));
  assert.equal(groups.length, 3);
  assert.deepEqual(groups[0].rows.map(r => [r.iolPower, r.predictedRefraction]), [['20.5', '-0.84'], ['20', '-0.49'], ['19.5', '-0.15']]);
  assert.deepEqual(groups[1].rows.map(r => [r.toricPower, r.residualCylinder, r.residualAxis]), [['1', '-0.41', '13'], ['1.5', '-0.07', '13'], ['2.25', '-0.43', '103']]);
  assert.deepEqual([groups[2].rows[0].axis, groups[2].rows[0].refractionAxis, groups[2].rows[0].refractionSphere, groups[2].rows[0].refractionCylinder], ['103', '13', '-0.45', '-0.07']);
  assert.equal(groups[0].inputEcho.incisionAxis, '0');
  assert.ok(groups[2].rows[0].rawCells.some(cell => cell.label === 'TRUE K' && cell.value.includes('LF 2.27')));
  assert.ok(groups.every(g => g.eye === null));
});

test('live Rx Exchange preserves postoperative K context and actual exchange values', () => {
  const groups = read(liveFixture('rx-exchange', 'barrett-rx'));
  assert.equal(groups.length, 3);
  assert.ok(groups.every(g => g.sourceLabel.startsWith('Exchange IOL')));
  assert.deepEqual(groups[0].rows.map(r => [r.iolPower, r.predictedRefraction, r.lensModel]), [['19.5', '-0.4', 'SN6AT4'], ['19', '0.04', 'SN6AT4'], ['18.5', '0.47', 'SN6AT4']]);
  assert.deepEqual(groups[1].rows.map(r => [r.toricPower, r.residualCylinder, r.residualAxis]), [['1.5', '-0.8', '4'], ['2.25', '-0.31', '4'], ['3', '-0.19', '94']]);
  assert.equal(groups[0].inputEcho.postOpK1, '43');
  assert.equal(groups[0].inputEcho.k1, undefined);
  assert.equal(groups[2].rows[0].axis, '94');
  assert.equal(groups[2].rows[0].refractionAxis, '4');
  assert.ok(groups[2].rows[0].rawCells.some(cell => cell.label === 'Predicted Refraction'));
  assert.deepEqual(groups[0].constants.slice(2), [{name: 'Optimised A Constant', value: '118.4'}, {name: 'Optimised LF', value: '1.55'}]);
});

test('live Rx Piggyback uses pb controls and GridView3/4 without borrowing the Exchange model', () => {
  const groups = read(liveFixture('rx-piggyback', 'barrett-rx'));
  assert.equal(groups.length, 3);
  assert.ok(groups.every(g => g.sourceLabel.startsWith('Piggyback IOL') && g.lensModel === '' && g.eye === null));
  assert.deepEqual(groups[0].rows.map(r => [r.iolPower, r.predictedRefraction, r.toricPower]), [['-0.5', '-0.4', '1'], ['-1', '0.04', '1'], ['-1.5', '0.47', '1']]);
  assert.deepEqual(groups[1].rows.map(r => [r.lensModel, r.toricPower, r.residualCylinder, r.residualAxis]), [['T-0.5', '0.5', '-0.49', '9'], ['T-1.0', '1', '-0.16', '9'], ['T-1.5', '1.5', '-0.17', '99']]);
  assert.deepEqual([groups[2].rows[0].iolPower, groups[2].rows[0].toricPower, groups[2].rows[0].axis, groups[2].rows[0].refractionSphere, groups[2].rows[0].refractionAxis], ['-1', '1', '99', '0.12', '9']);
});

test('live capture is read-only and ignores editable lookalike result metadata', () => {
  const input = liveFixture('universal', 'barrett-universal');
  const before = input.document.documentElement.outerHTML;
  read(input);
  assert.equal(input.document.documentElement.outerHTML, before);
  input.document.querySelector('#MainContent_ModelSelected').readOnly = false;
  input.document.querySelector('#MainContent_ModelSelected').value = 'UNRELATED EDITABLE MODEL';
  assert.ok(read(input).every(g => g.lensModel === ''));
});

test('changed live headers fail closed instead of falling back to partial generic captures', () => {
  const input = liveFixture('universal', 'barrett-universal');
  for (const table of input.document.querySelectorAll('table')) table.rows[0].cells[2].textContent = 'Unknown refraction';
  assert.deepEqual(read(input), []);
});

test('actual single-eye output evidence has no accessible eye controls or image label to infer laterality', () => {
  for (const name of ['toric', 'true-k-toric', 'rx']) {
    const evidence = JSON.parse(readFileSync(new URL(`./fixtures/result-apacrs/live-${name}-eye-evidence.json`, import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
    assert.equal(evidence.visibleTextHasEye, false);
    assert.ok(evidence.eyeControls.every(control => control.present === false));
    assert.ok(evidence.images.every(image => !image.alt && !image.title));
  }
});

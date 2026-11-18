import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {readEscrsDgsResults} from '../src/result-adapters/escrs-dgs.js';

const fixture = name => readFileSync(new URL(`./fixtures/result-escrs-dgs/${name}-live.html`, import.meta.url), 'utf8');
function read(html, kind = 'regular', path = `/result_${kind}`) {
  const dom = new JSDOM(html, {url: `https://iolsolver.com${path}`});
  try { return readEscrsDgsResults(dom.window.document, {id: `solver-${kind}`}); }
  finally { dom.window.close(); }
}

test('live-shaped Regular results preserve each eye and the explicitly selected spherical row', () => {
  const groups = read(fixture('regular'));
  assert.equal(groups.length, 2);assert.deepEqual(groups.map(group => group.eye), ['OD','OS']);
  assert.deepEqual(groups.map(group => group.rows[0].iolPower), ['22','20.5']);
  assert.equal(groups[0].rows[2].siteSelected, true);assert.equal(groups[1].rows.some(row => row.siteSelected), false);
  assert.equal(groups[0].formula, 'PEARL-DGS');assert.equal(groups[0].lensModel, '');
  assert.deepEqual(groups[0].constants, [{name: 'A Constant', value: '118.9'}]);
  assert.equal(groups[0].inputEcho.al, '23.45');assert.equal(groups[1].inputEcho.al, '24.10');
  assert.equal(groups[0].targetRefraction, undefined);assert.equal(groups[0].inputEcho.target, undefined);
  assert.deepEqual(groups[0].rows[0].rawCells, [{label:'IOL POWER (D)',value:'22'},{label:'REFRACTION (D)',value:'-0.643'}]);
});

test('live-shaped Complex result retains the printed target and does not invent lens identity', () => {
  const [group] = read(fixture('complex'), 'complex');
  assert.equal(group.eye, 'OD');assert.equal(group.targetRefraction, '-0.50');assert.equal(group.rows.length, 5);
  assert.equal(group.lensModel, '');assert.equal(group.manufacturer, undefined);assert.equal(group.inputEcho.k1, '43.20');
});

test('Second Eye captures adjusted results and keeps fellow-eye input echoes distinct', () => {
  const groups = read(fixture('second'), 'second');assert.equal(groups.length, 1);
  assert.equal(groups[0].rows[0].predictedRefraction, '-1.033');
  assert.equal(groups[0].inputEcho.al, '23.45');assert.equal(groups[0].inputEcho.fellowAl, '23.90');
  assert.equal(groups[0].inputEcho.fellowRefraction, '-0.25');assert.equal(groups[0].inputEcho.fellowIolPower, '21.0');
  assert.equal(groups[0].rows.some(row => row.predictedRefraction === '-1.03'), false);
});

test('Toric rows preserve residual axis semantics and highlighted state without inferring implantation axis', () => {
  const [group] = read(fixture('toric'), 'toric');assert.equal(group.rows.length, 3);
  assert.deepEqual(group.rows.map(row => row.toricPower), ['2.25','1.5','1']);
  assert.equal(group.rows[2].highlighted, true);assert.equal(group.rows[0].highlighted, undefined);
  for (const row of group.rows) { assert.equal(row.iolPower, '21');assert.equal(row.predictedRefraction, '0.041');assert.equal(row.residualAxis, '130');assert.equal(row.axis, undefined); }
  assert.equal(group.rows[2].rawCells[2].label, 'IOL CYLINDER (D)');
});

test('zero powers, refractions, cylinders, axes and targets survive capture', () => {
  const html = fixture('toric').replace('Target refraction: -- D', 'Target refraction: 0 D').replace('<td>21</td><td>0.041</td>', '<td>0</td><td>0</td>').replace('<td>2.25</td><td>-1.246</td><td>130</td>', '<td>0</td><td>0</td><td>0</td>');
  const [group] = read(html, 'toric');assert.equal(group.targetRefraction, '0');
  assert.deepEqual(['iolPower','predictedRefraction','toricPower','residualCylinder','residualAxis'].map(key => group.rows[0][key]), ['0','0','0','0','0']);
});

test('input routes and mismatched result modes never capture embedded old spherical tables', () => {
  assert.deepEqual(read(fixture('toric'), 'toric', '/toric'), []);
  assert.deepEqual(read(fixture('regular'), 'complex'), []);
  assert.deepEqual(read(fixture('regular'), 'regular', '/regular'), []);
});

test('hidden result cards and unknown or duplicated columns fail closed', () => {
  assert.deepEqual(read(fixture('complex').replace('iol-right-v-sheet', 'iol-right-v-sheet" style="display:none'), 'complex'), []);
  assert.deepEqual(read(fixture('complex').replace('REFRACTION (D)', 'A Constant'), 'complex'), []);
  assert.deepEqual(read(fixture('complex').replace('<span>REFRACTION (D)</span>', '<span>IOL POWER (D)</span>'), 'complex'), []);
});

test('eye conflicts, duplicate eye cards and editable rows are rejected', () => {
  assert.deepEqual(read(fixture('complex').replace('<h2> OD </h2>', '<h2> OS </h2>'), 'complex'), []);
  const original=fixture('complex'),card=original.slice(original.indexOf('<div class="v-sheet'),original.lastIndexOf('</main>'));
  assert.deepEqual(read(original.replace('</main>',`${card}</main>`), 'complex'), []);
  const html=original.replace(/<td class="text-start">/g, '<td class="text-start"><input value="NOT A RESULT">');
  assert.deepEqual(read(html, 'complex'), []);
});

test('the adapter reads no input values and does not mutate source DOM', () => {
  const dom=new JSDOM(fixture('regular'),{url:'https://iolsolver.com/result_regular'}),doc=dom.window.document;
  const input=doc.createElement('input');Object.defineProperty(input,'value',{get(){throw new Error('input value read');}});doc.body.prepend(input);
  const before=doc.documentElement.outerHTML;assert.equal(readEscrsDgsResults(doc,{id:'solver-regular'}).length,2);assert.equal(doc.documentElement.outerHTML,before);dom.window.close();
});

test('ESCRS rejects unrelated tables outside its audited result print structure', () => {
  const dom=new JSDOM(fixture('regular'),{url:'https://iolcalculator.escrs.org/'});
  assert.deepEqual(readEscrsDgsResults(dom.window.document,{id:'escrs'}),[]);dom.window.close();
});

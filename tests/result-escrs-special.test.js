import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {readEscrsDgsResults} from '../src/result-adapters/escrs-dgs.js';
import {normalizeResultGroups} from '../src/result-model.js';

const original=readFileSync(new URL('./fixtures/result-escrs-dgs/escrs-mixed-special-live.html',import.meta.url),'utf8');
const myopicNote='This calculation is only valid for patients who underwent prior MYOPIC LASIK/PRK.';
function capture(html=original){const dom=new JSDOM(html,{url:'https://iolcalculator.escrs.org/'});try{return readEscrsDgsResults(dom.window.document,{id:'escrs'});}finally{dom.window.close();}}
const toric=groups=>groups.filter(group=>group.sourceLabel.startsWith('IOL Cyl.'));
const spherical=groups=>groups.filter(group=>group.sourceLabel.startsWith('SE PWR'));
function changeToric(change){const dom=new JSDOM(original),doc=dom.window.document;const table=[...doc.querySelectorAll('table')].find(table=>table.rows[1]?.cells[0]?.textContent.trim()==='IOL Cyl.');change(table,doc);const html=doc.body.innerHTML;dom.window.close();return html;}

test('live mixed ESCRS results preserve the unwrapped OD Toric and wrapped OS Myopic LVC sections',()=>{
  const groups=capture();assert.equal(groups.length,14);assert.equal(groups.reduce((n,g)=>n+g.rows.length,0),70);
  assert.equal(spherical(groups).filter(g=>g.eye==='OD').length,5);assert.equal(toric(groups).length,5);assert.equal(spherical(groups).filter(g=>g.eye==='OS').length,4);
  assert.deepEqual(toric(groups).map(g=>[g.formula,g.rows.length]),[['Barrett',3],['EVO',3],['Hoffer®QST',8],['Kane',3],['Pearl DGS',4]]);
  for(const group of toric(groups))assert.equal(group.eye,'OD');
});

test('explicit result summaries preserve per-eye IOL, Toric axes and incision source echoes',()=>{
  const groups=capture(),od=groups.find(g=>g.eye==='OD'),os=groups.find(g=>g.eye==='OS');
  assert.equal(od.lensModel,'AcrySof SN6AT (2-9)');assert.equal(os.lensModel,'AcrySof SN60WF');
  assert.equal(od.inputEcho.toric,true);assert.equal(od.inputEcho.k1,'43.20');assert.equal(od.inputEcho.k1Axis,'90');assert.equal(od.inputEcho.k2Axis,'180');
  assert.equal(od.inputEcho.sia,'0.05');assert.equal(od.inputEcho.incisionAxis,'180');assert.equal(os.inputEcho.toric,undefined);
  assert.equal(od.inputEcho.lvcType,undefined);assert.equal(os.inputEcho.lvcType,'myopic');
  assert.equal(od.targetRefraction,'0.00');assert.equal(os.targetRefraction,'-0.50');
});

test('rowspan IOL Axis remains implantation axis while residual axis and source rotation marker stay separate',()=>{
  const groups=toric(capture()),barrett=groups.find(g=>g.formula==='Barrett'),pearl=groups.find(g=>g.formula==='Pearl DGS');
  const t4=barrett.rows.find(r=>r.lensModel==='T4');assert.equal(t4.axis,'0');assert.equal(t4.residualAxis,'90');assert.equal(t4.residualCylinder,'+0.23');assert.equal(t4.toricPower,'2.25');assert.ok(t4.rawCells[2].value.endsWith('↺'));
  const pearlT4=pearl.rows.find(r=>r.lensModel==='T4');assert.equal(pearlT4.axis,'1');assert.equal(pearlT4.residualAxis,'91');
  for(const group of groups){assert.equal(group.cylinderPlane,'iol');for(const row of group.rows){assert.equal(row.iolPower,undefined);assert.equal(row.predictedRefraction,undefined);assert.equal(row.siteSelected,undefined);}}
});

test('empty Toric results are skipped and per-formula is-target markers retain their actual cylinder step',()=>{
  for(const group of toric(capture())){
    assert.equal(group.rows.filter(r=>r.highlighted).length,1);assert.equal(group.rows.find(r=>r.highlighted).lensModel,'T3');
  }
  const evo=toric(capture()).find(g=>g.formula==='EVO');assert.equal(evo.rows[0].toricPower,'1.50');assert.equal(evo.rows.some(r=>r.lensModel==='T2'),false);
});

test('zero implant and residual axes survive; chart legend changes cannot affect table-derived axes',()=>{
  const html=changeToric((table,doc)=>{table.rows[3].cells[1].textContent='0.00 x 0°';const legend=doc.createElement('div');legend.className='legendtext';legend.textContent='Barrett @ 77°';table.before(legend);});
  const row=toric(capture(html)).find(g=>g.formula==='Barrett').rows.find(r=>r.lensModel==='T3');
  assert.equal(row.axis,'0');assert.equal(row.residualCylinder,'0.00');assert.equal(row.residualAxis,'0');
});

test('unknown axis spans, wrong Toric labels and missing explicit mode fail closed for cylinder results',()=>{
  assert.deepEqual(toric(capture(changeToric(table=>{table.rows[2].cells[1].rowSpan=7;}))),[]);
  assert.deepEqual(toric(capture(changeToric(table=>{table.rows[1].cells[1].textContent='Residual Axis';}))),[]);
  assert.deepEqual(toric(capture(original.replace('<td>Toric</td>','<td></td>'))),[]);
  const sphericalOnly=spherical(capture(changeToric(table=>{table.rows[2].cells[1].rowSpan=7;})));assert.equal(sphericalOnly.length,9);
});

test('LVC subtype requires its own exact validity note and cannot be inferred from a generic option or the other eye',()=>{
  const without=capture(original.replace(myopicNote,''));assert.ok(without.filter(g=>g.eye==='OS').every(g=>g.inputEcho.lvcType===undefined));
  const outside=capture(original.replace(myopicNote,'').replace('<div id="pdfContent">',`<div id="pdfContent"><p>${myopicNote}</p>`));
  assert.ok(outside.filter(g=>g.eye==='OS').every(g=>g.inputEcho.lvcType===undefined));
  assert.ok(capture().filter(g=>g.eye==='OS').every(g=>g.sourceLabel.includes(myopicNote)));
});

test('incision echo is bounded to a confirmed Toric option and a full-circle axis range',()=>{
  const replaceAngle=angle=>original.replace('0.05<!--!--> D @ 180<!--!-->°',`0.05 D @ ${angle}°`);
  assert.equal(capture(replaceAngle(360)).find(g=>g.eye==='OD').inputEcho.incisionAxis,'360');
  assert.equal(capture(replaceAngle(0)).find(g=>g.eye==='OD').inputEcho.incisionAxis,'0');
  assert.equal(capture(replaceAngle(361)).find(g=>g.eye==='OD').inputEcho.incisionAxis,undefined);
  assert.equal(capture(original.replace('<td>Toric</td>','<td>Unknown</td>')).find(g=>g.eye==='OD').inputEcho.incisionAxis,undefined);
});

test('special-mode malformed Kane refraction remains raw while all Toric numeric fields survive normalization',()=>{
  const groups=normalizeResultGroups(capture()),kane=spherical(groups).find(g=>g.eye==='OD'&&g.formula==='Kane');
  const malformed=kane.rows.find(r=>Number(r.iolPower)===21.5);assert.equal(malformed.predictedRefraction,undefined);assert.equal(malformed.rawCells[1].value,'-+0.00');
  assert.equal(groups.length,14);assert.equal(toric(groups).find(g=>g.formula==='Barrett').rows[0].axis,'0');
});

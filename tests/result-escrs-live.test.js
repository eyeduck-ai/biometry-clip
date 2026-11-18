import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {readEscrsDgsResults} from '../src/result-adapters/escrs-dgs.js';
import {normalizeResultGroups} from '../src/result-model.js';

const original=readFileSync(new URL('./fixtures/result-escrs-dgs/escrs-regular-live.html',import.meta.url),'utf8');
function capture(html=original,url='https://iolcalculator.escrs.org/') {
  const dom=new JSDOM(html,{url});
  try{return readEscrsDgsResults(dom.window.document,{id:'escrs'});}finally{dom.window.close();}
}

test('live ESCRS transposed matrices preserve six returned formulas separately for each eye',()=>{
  const groups=capture();assert.equal(groups.length,12);
  const names=['Cooke K6','EVO','Hill-RBF','Hoffer®QST','Kane','Pearl DGS'];
  for(const eye of ['OD','OS'])assert.deepEqual(groups.filter(group=>group.eye===eye).map(group=>group.formula),names);
  assert.equal(groups.some(group=>group.formula==='Barrett'),false);
  assert.equal(groups.reduce((count,group)=>count+group.rows.length,0),72);
  const od=groups.find(group=>group.eye==='OD'&&group.formula==='EVO'),os=groups.find(group=>group.eye==='OS'&&group.formula==='EVO');
  assert.equal(od.rows[0].iolPower,'+22.00');assert.equal(od.rows[0].predictedRefraction,'-0.60');
  assert.equal(os.rows[0].iolPower,'+21.00');assert.equal(os.rows[0].predictedRefraction,'-1.00');
});

test('ESCRS result echoes establish IOL identity, units, constants and zero target without reading form inputs',()=>{
  const groups=capture(),od=groups.find(group=>group.eye==='OD'&&group.formula==='Hill-RBF'),os=groups.find(group=>group.eye==='OS'&&group.formula==='Pearl DGS');
  assert.equal(od.manufacturer,'Alcon');assert.equal(od.lensModel,'AcrySof SN60WF');
  assert.equal(od.targetRefraction,'0.00');assert.equal(os.targetRefraction,'-0.50');
  assert.deepEqual(od.constants,[{name:'A',value:'119.02'}]);assert.deepEqual(os.constants,[{name:'A',value:'119.10'}]);
  assert.deepEqual(groups.find(group=>group.formula==='Hoffer®QST').constants,[{name:'pACD',value:'5.67'}]);
  assert.equal(od.inputEcho.al,'23.45');assert.equal(os.inputEcho.al,'24.10');assert.equal(od.inputEcho.cct,'535');assert.equal(os.inputEcho.kIndex,'1.3375');
});

test('ESCRS is-target belongs to its formula cell rather than every result at that power',()=>{
  const groups=capture();
  const hoffer=groups.find(group=>group.eye==='OD'&&group.formula==='Hoffer®QST');
  assert.equal(hoffer.rows.find(row=>row.iolPower==='+21.50').highlighted,true);
  const kane=groups.find(group=>group.eye==='OD'&&group.formula==='Kane');
  assert.equal(kane.rows.find(row=>row.iolPower==='+21.50').highlighted,undefined);
  assert.equal(kane.rows.find(row=>row.iolPower==='+21.00').highlighted,true);
  assert.ok(groups.every(group=>group.rows.every(row=>row.siteSelected===undefined)));
});

test('the malformed live Cooke -+0.00 is auditable raw text and never becomes numeric zero',()=>{
  const groups=capture(),group=groups.find(group=>group.eye==='OD'&&group.formula==='Cooke K6'),row=group.rows.find(row=>row.iolPower==='+21.00');
  assert.equal(row.predictedRefraction,undefined);assert.equal(row.rawCells[1].value,'-+0.00');assert.equal(row.rawCells[1].label,'Cooke K6 A: 119.00');
  const normalized=normalizeResultGroups(groups).find(group=>group.eye==='OD'&&group.formula==='Cooke K6').rows.find(row=>Number(row.iolPower)===21);
  assert.equal(normalized.predictedRefraction,undefined);assert.equal(normalized.rawCells[1].value,'-+0.00');
});

test('an explicit zero refraction in an ESCRS cell remains zero',()=>{
  const group=capture(original.replace('-+0.00','0.00')).find(group=>group.eye==='OD'&&group.formula==='Cooke K6');
  assert.equal(group.rows.find(row=>row.iolPower==='+21.00').predictedRefraction,'0.00');
});

test('ESCRS requires the audited print container, eye labels and exact matrix label',()=>{
  assert.deepEqual(capture(original.replace('id="pdfContent"','id="inputForm"')),[]);
  assert.deepEqual(capture(original.replaceAll('SE PWR (D)','AL')),[]);
  assert.deepEqual(capture(original.replaceAll('OD (Right)','Right').replaceAll('OS (Left)','Left')),[]);
  assert.deepEqual(capture(original,'https://iolcalculator.escrs.org/about'),[]);
  assert.deepEqual(capture(original,'https://example.test/'),[]);
});

test('ESCRS rejects duplicated eyes, duplicate formula columns and editable result cells',()=>{
  const dom=new JSDOM(original),doc=dom.window.document,card=doc.querySelector('.page-keep-together');
  doc.querySelector('#pdfContent').append(card.cloneNode(true));
  assert.deepEqual(capture(doc.body.innerHTML),[]);dom.window.close();
  assert.deepEqual(capture(original.replaceAll('<strong>EVO</strong>','<strong>Cooke K6</strong>')),[]);
  assert.deepEqual(capture(original.replaceAll('<strong>SE PWR (D)</strong>','<input value="SE PWR (D)"><strong>SE PWR (D)</strong>')),[]);
});

test('ESCRS does not archive stale results under verification or an observed calculation spinner',()=>{
  assert.deepEqual(capture(`<div role="dialog">Verification</div>${original}`),[]);
  assert.deepEqual(capture(`<div role="progressbar" aria-label="Calculation in progress"></div>${original}`),[]);
  assert.equal(capture(`<div role="dialog" hidden>Verification</div>${original}`).length,12);
});

test('hidden print content is excluded and capture never reads input values or mutates source',()=>{
  assert.deepEqual(capture(original.replace('id="pdfContent"','id="pdfContent" hidden')),[]);
  const dom=new JSDOM(original,{url:'https://iolcalculator.escrs.org/'}),doc=dom.window.document;
  const input=doc.createElement('input');Object.defineProperty(input,'value',{get(){throw Error('Input read');}});doc.body.prepend(input);
  const before=doc.body.outerHTML;assert.equal(readEscrsDgsResults(doc,{id:'escrs'}).length,12);assert.equal(doc.body.outerHTML,before);dom.window.close();
});

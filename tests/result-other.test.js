import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {readOtherResults} from '../src/result-adapters/other.js';

const cases={
  cooke:['cooke-both.html','https://cookeformula.com/PrintPreview'],
  kane:['kane-both.html','https://www.iolformula.com/'],
  evo:['evo-os.html','https://www.evoiolcalculator.com/Calculator.aspx'],
  'evo-toric':['evo-toric-od.html','https://www.evoiolcalculator.com/Toric.aspx'],
  'tecnis-toric':['tecnis-toric.html','https://tecnistoriccalc.com/calculator/'],
};
const htmls=Object.fromEntries(await Promise.all(Object.entries(cases).map(async([id,[file]])=>[id,await readFile(new URL(`./fixtures/result-other/${file}`,import.meta.url),'utf8')])));
const liveEvidence=JSON.parse(await readFile(new URL('./fixtures/result-other/live-browser-evidence.json',import.meta.url),'utf8'));
function fixture(t,id,{html=htmls[id],url=cases[id][1]}={}){const dom=new JSDOM(html,{url});t.after(()=>dom.window.close());const doc=dom.window.document;return {doc,read:()=>readOtherResults(doc,{id}),dom};}

test('Cooke PrintPreview preserves distinct OD/OS, numeric zero, minus powers and row highlighting',t=>{
  const f=fixture(t,'cooke'),groups=f.read();assert.equal(groups.length,2);const [od,os]=groups;
  assert.equal(od.eye,'OD');assert.equal(os.eye,'OS');assert.equal(od.targetRefraction,'0');assert.equal(os.targetRefraction,'-0.5');
  assert.equal(od.lensModel,'Alcon SN60WF');assert.equal(os.lensModel,'Tecnis');assert.equal(od.formula,'K6v2024.01');
  assert.equal(od.rows[0].iolPower,'-1.00');assert.equal(od.rows[1].iolPower,'0.00');assert.equal(od.rows[1].predictedRefraction,'0.00');assert.equal(od.rows[1].highlighted,true);
  assert.equal(od.constants[0].value,'119.3');assert.equal(os.constants[0].value,'118.9');assert.equal(od.inputEcho.al,'23.5');assert.equal(od.inputEcho.cct,'543');
  assert.equal(Object.hasOwn(os.inputEcho,'k1'),false,'R1 in mm is not a K1 in D');assert.match(od.rows[0].rawCells[0].value,/\(minus\)/);
});

test('Cooke ignores input pages, missing output structure, and ambiguous repeated eye panels',t=>{
  assert.deepEqual(fixture(t,'cooke',{url:'https://cookeformula.com/'}).read(),[]);
  assert.deepEqual(fixture(t,'cooke',{html:'<input value="21"><table><tr><th>IOL Power</th><th>Refraction</th></tr><tr><td>21</td><td>0</td></tr></table>'}).read(),[]);
  const f=fixture(t,'cooke');f.doc.querySelector('td.outputs').after(f.doc.querySelector('td.outputs').cloneNode(true));assert.deepEqual(f.read().map(group=>group.eye),['OS']);
  f.doc.querySelector('td.outputs').hidden=true;assert.deepEqual(f.read().map(group=>group.eye),['OD','OS']);
});

test('Kane keeps OD and OS modes separate and does not join toric/spherical rows by index',t=>{
  const groups=fixture(t,'kane').read();assert.equal(groups.length,3);const [od,os,toric]=groups;
  assert.equal(od.eye,'OD');assert.equal(od.formula,'Kane');assert.equal(od.targetRefraction,'0.00');assert.equal(od.rows[0].iolPower,'0.0');assert.equal(od.rows[0].predictedRefraction,'0.00');
  assert.equal(os.eye,'OS');assert.equal(os.formula,'Kane Toric');assert.equal(os.rows[0].iolPower,'20.5');assert.equal(os.lensModel,'J+J ZCTx');
  assert.equal(toric.rows[0].toricPower,'0.00');assert.equal(toric.rows[0].axis,'0');assert.equal(toric.rows[0].residualAxis,'0');assert.equal(toric.rows[1].toricPower,'1.50');
  assert.equal(toric.rows[1].residualCylinder,'-0.25');assert.equal(toric.rows[1].residualAxis,'90');assert.equal(Object.hasOwn(toric.rows[1],'iolPower'),false);
  assert.equal(od.inputEcho.cct,'543');assert.equal(os.inputEcho.k1Axis,'0');assert.equal(os.inputEcho.k2Axis,'90');
});

test('Kane loading skeleton, hidden modes and simultaneous visible modes fail closed',t=>{
  const f=fixture(t,'kane'),root=f.doc.querySelector('.eye1_results');root.querySelector('.res_tab3_wait').style.display='block';assert.equal(f.read().some(group=>group.eye==='OD'),false);
  root.querySelector('.res_tab3_wait').style.display='none';root.querySelector('.res_tab3_lines').innerHTML=Array.from({length:7},()=>'<tr><td>00</td><td>00</td></tr>').join('');assert.equal(f.read().some(group=>group.eye==='OD'),false);
  const g=fixture(t,'kane');g.doc.querySelector('.eye1_results .res_toric').style.display='block';assert.equal(g.read().some(group=>group.eye==='OD'),false);
  g.doc.querySelector('.eye2_results .eyecircle #angle-bigtext').setAttribute('visibility','hidden');assert.equal(Object.hasOwn(g.read().find(group=>group.sourceLabel.includes('Cylinder Power')).rows[0],'axis'),false);
});

test('EVO spherical real server-response fixture reads OS, five candidates and output-only parameters',t=>{
  const f=fixture(t,'evo'),groups=f.read();assert.equal(groups.length,1);const group=groups[0];
  assert.equal(group.eye,'OS');assert.equal(group.formula,'EVO 2.0');assert.equal(group.lensModel,'Standard');assert.equal(group.rows.length,5);assert.equal(group.targetRefraction,'0');
  assert.deepEqual(group.constants,[{name:'A Constant',value:'119.3',unit:'1'},{name:'K Index',value:'1.3375',unit:'1'}]);
  assert.equal(group.inputEcho.cct,'543');assert.equal(group.inputEcho.k1,'43');assert.equal(group.rows.filter(row=>row.highlighted).length,1);assert.equal(group.rows.some(row=>row.siteSelected),false);
  assert.equal(JSON.stringify(groups).includes('SYNTHETIC QA'),false);assert.equal(JSON.stringify(groups).includes('QA-ONLY'),false);
});

test('EVO Toric server-response fixture separates five sphere rows from three full toric alternatives',t=>{
  const [sphere,toric]=fixture(t,'evo-toric').read();assert.equal(sphere.eye,'OD');assert.equal(toric.eye,'OD');assert.equal(sphere.rows.length,5);assert.equal(toric.rows.length,3);
  assert.equal(toric.rows[0].toricPower,'0');assert.equal(toric.rows[0].iolPower,'21.5');assert.equal(toric.rows[0].axis,'90');assert.equal(toric.rows[0].residualAxis,'180');
  assert.equal(toric.rows[1].residualCylinder,'-0.25');assert.equal(toric.rows[1].highlighted,true);assert.equal(sphere.inputEcho.k1Axis,'0');
  assert.equal(toric.rows[0].rawCells.find(cell=>cell.label==='IOL Axis').value,'90°');assert.equal(toric.rows[0].rawCells.find(cell=>cell.label==='Axis').value,'180°');
});

test('EVO preserves exact zero fields, localized decimal commas, and source model labels without inventing toric powers',t=>{
  const f=fixture(t,'evo-toric');f.doc.querySelector('#LblToric1').textContent='ZCU150';f.doc.querySelector('#LblIOLAxis1').textContent='0°';f.doc.querySelector('#LblResiCyl1').textContent='0,00';f.doc.querySelector('#LblToricAxis1').textContent='0°';
  const row=f.read()[1].rows[0];assert.equal(row.lensModel,'ZCU150');assert.equal(Object.hasOwn(row,'toricPower'),false);assert.equal(row.axis,'0');assert.equal(row.residualCylinder,'0.00');assert.equal(row.residualAxis,'0');
  f.doc.querySelector('#LabelBaseIOL').remove();assert.equal(Object.hasOwn(f.read()[1].rows[0],'iolPower'),false);
});

test('TECNIS separates lens orientation and residual cylinder axis, and never infers a toric power from model codes',t=>{
  const groups=fixture(t,'tecnis-toric').read();assert.equal(groups.length,1);const group=groups[0];assert.equal(group.eye,'OS');assert.equal(group.lensModel,'');assert.equal(group.rows.length,2);
  assert.equal(group.rows[0].lensModel,'ZCU150');assert.equal(group.rows[0].axis,'0');assert.equal(group.rows[0].residualCylinder,'-0.25');assert.equal(group.rows[0].residualAxis,'90');
  assert.equal(group.rows[1].siteSelected,true);assert.equal(group.rows[1].residualCylinder,'0.00');assert.equal(group.rows[1].residualAxis,'0');
  assert.equal(Object.hasOwn(group.rows[0],'toricPower'),false);assert.equal(Object.hasOwn(group.rows[0],'iolPower'),false);assert.equal(Object.hasOwn(group,'constants'),false);
  assert.equal(JSON.stringify(group).includes('99'),false,'SE power form input is not a result echo');
});

test('TECNIS print output reads only visible echoes, suppresses duplicate print rows, and preserves chosen model',t=>{
  const f=fixture(t,'tecnis-toric');for(const node of f.doc.querySelectorAll('.noprint'))node.style.display='none';for(const node of f.doc.querySelectorAll('.print-only'))node.style.display='';
  const groups=f.read();assert.equal(groups.length,1);assert.equal(groups[0].rows.length,2);assert.equal(groups[0].rows[1].siteSelected,true);assert.equal(groups[0].rows[0].iolPower,'+20.0');
  assert.deepEqual(groups[0].constants,[{name:'A-constant',value:'119.30'}]);assert.deepEqual(groups[0].inputEcho,{al:'24.1',plannedIolPower:'+20.0',kIndex:'1.3375',sia:'0.05',incisionAxis:'0'});
});

test('unresolved eye labels remain null and never fall back to editable radio values',t=>{
  const f=fixture(t,'evo');f.doc.querySelector('#LabelODOS').textContent='';assert.equal(f.read()[0].eye,null);
  const g=fixture(t,'tecnis-toric');g.doc.querySelector('.js-eye-selection-text').textContent='';g.doc.body.insertAdjacentHTML('beforeend','<input name="eyeSelection" type="radio" value="right" checked>');assert.equal(g.read()[0].eye,null);
});

test('known-looking result markup is rejected on unrelated routes, hosts, or protocols',t=>{
  for(const [id,url]of [['cooke','https://cookeformula.com/About'],['kane','https://www.iolformula.com/agreement/'],['evo','https://www.evoiolcalculator.com/Toric.aspx'],['evo-toric','https://www.evoiolcalculator.com/Calculator.aspx'],['tecnis-toric','https://tecnistoriccalc.com/'],['evo','https://impostor.example/Calculator.aspx'],['evo','http://www.evoiolcalculator.com/Calculator.aspx']])assert.deepEqual(fixture(t,id,{url}).read(),[]);
  assert.deepEqual(readOtherResults(fixture(t,'evo').doc,{id:'unsupported'}),[]);
});

test('missing/changed headers, duplicate result containers, and injected controls do not become output',t=>{
  const f=fixture(t,'evo');f.doc.querySelector('table.pred th').textContent='AL';assert.deepEqual(f.read(),[]);
  const g=fixture(t,'evo');g.doc.querySelector('#PnPred').after(g.doc.querySelector('#PnPred').cloneNode(true));assert.deepEqual(g.read(),[]);
  const h=fixture(t,'evo');for(const cell of h.doc.querySelectorAll('table.pred td'))cell.innerHTML='<input value="21.5">';assert.deepEqual(h.read(),[]);
  const j=fixture(t,'tecnis-toric');j.doc.querySelector('#results tr td').insertAdjacentHTML('beforeend','<select><option>Injected</option></select>');assert.equal(j.read()[0].rows.length,1);
  const k=fixture(t,'tecnis-toric');k.doc.querySelectorAll('#results tr td:nth-child(3)').forEach(cell=>cell.textContent='0.25 mm');assert.deepEqual(k.read(),[]);
});

test('all readers are DOM-read-only and do not include patient identifiers or input lens choices',t=>{
  for(const id of Object.keys(cases)){
    const f=fixture(t,id);let events=0;for(const type of ['change','input','submit','click'])f.doc.addEventListener(type,()=>events++);
    const before=f.doc.documentElement.outerHTML,result=JSON.stringify(f.read());assert.equal(f.doc.documentElement.outerHTML,before);assert.equal(events,0);
    assert.equal(result.includes('PRIVATE-INPUT'),false);assert.equal(result.includes('Wrong input lens'),false);assert.equal(result.includes('Unselected lens options'),false);
  }
});

for(const evidence of liveEvidence)test(`${evidence.siteId} actual Chromium result DOM retains exact normalized fixture parity`,async t=>{
  const html=await readFile(new URL(`./fixtures/result-other/${evidence.fixture}`,import.meta.url),'utf8');
  const f=fixture(t,evidence.siteId,{html,url:evidence.url});
  assert.deepEqual(f.read(),evidence.result);
  assert.equal(html.includes('SYNTHETIC QA'),false,'sanitized result fixtures omit patient-identifying labels');
  if(evidence.siteId==='kane')assert.ok(f.doc.querySelector('form.form_block input[name="hidden"]'),'retain the real named-property collision shape');
});

test('actual browser rows agree with independently inspected per-eye values and toric meanings',()=>{
  const find=id=>liveEvidence.find(item=>item.siteId===id).result;
  const [od,os]=find('cooke');assert.deepEqual(od.rows.find(row=>row.highlighted),{iolPower:'21.00',predictedRefraction:'0.10',highlighted:true,rawCells:[{label:'IOL Power',value:'21.00'},{label:'Refraction',value:'0.10'}]});assert.equal(os.rows.find(row=>row.highlighted).iolPower,'19.50');assert.equal(os.rows.find(row=>row.highlighted).predictedRefraction,'-0.48');assert.equal(od.targetRefraction,'0');assert.equal(os.targetRefraction,'-0.5');
  const kane=find('kane');assert.deepEqual(kane.map(group=>[group.eye,group.rows.length]),[['OD',7],['OS',5],['OS',3]]);assert.deepEqual(kane[2].rows.map(row=>[row.toricPower,row.axis,row.residualCylinder,row.residualAxis]),[['1.00','90','0.31','90'],['1.50','90','0.01','90'],['2.25','90','0.45','0']]);
  const tecnis=find('tecnis-toric')[0];assert.equal(tecnis.eye,'OS');assert.deepEqual(tecnis.rows.map(row=>[row.lensModel,row.axis,row.residualCylinder,row.residualAxis,!!row.siteSelected]),[['ZCU150','90','-0.57','0',false],['ZCU225','90','-0.07','0',true],['ZCU300','90','-0.43','90',false]]);
  const evo=find('evo')[0];assert.equal(evo.eye,'OS');assert.equal(evo.lensModel,'J&J ZCB00');assert.equal(evo.targetRefraction,'-0.5');assert.deepEqual(evo.rows.map(row=>[row.iolPower,row.predictedRefraction]),[['18.5','0.11'],['19','-0.21'],['19.5','-0.52'],['20','-0.84'],['20.5','-1.17']]);
  const toric=find('evo-toric')[1];assert.equal(toric.eye,'OD');assert.equal(toric.lensModel,'J&J ZCU');assert.deepEqual(toric.rows.map(row=>[row.iolPower,row.toricPower,row.axis,row.predictedRefraction,row.residualCylinder,row.residualAxis]),[['21.5','0','90','0.08','-0.4','180'],['21.5','1','90','0.11','-0.29','90'],['21.5','1.5','90','0.12','-0.63','90']]);
});

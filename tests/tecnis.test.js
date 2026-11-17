import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {TECNIS_SITES} from '../src/adapters/tecnis.js';
import {siteBridge} from '../src/bridge.js';
import {emptyCase} from '../src/model.js';

const profile=TECNIS_SITES[0];
const source=await readFile(new URL('./fixtures/lens-sources/tecnis-calculator.html',import.meta.url),'utf8');
async function fixture(t){
  // Real public HTML, with network/scripts disabled. No registration consent,
  // browser cookies, calculation or live extension is involved in this test.
  const dom=new JSDOM(source,{url:profile.url});
  const keys=['document','location','getComputedStyle','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','Event'];
  const saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='getComputedStyle'?dom.window.getComputedStyle.bind(dom.window):dom.window[key]});
  dom.window.HTMLElement.prototype.getClientRects=function(){return this.hidden||this.style.display==='none'||this.closest('[hidden]')?[]:[{x:0,y:0,width:80,height:24}];};
  t.after(()=>{for(const [key,descriptor]of saved)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];dom.window.close();});
  const doc=dom.window.document;
  for(const [id,values]of [['seIOLPower',['21.5','22.5']],['kIndex',['1.3375','1.336','1.332','1.3315']]])for(const value of values){const option=doc.createElement('option');option.value=value;option.textContent=value;doc.querySelector(`#calculate-form #${id}`).append(option);}
  return {dom,doc,find:id=>doc.querySelector(`#calculate-form #${id}`)};
}
function data(){const value=emptyCase();value.eyes.OD={al:'23.45',k1:'43.20',k2:'44.10',k1Axis:'90',k2Axis:'180',sia:'0.10',incisionAxis:'95',toric:true,plannedIolPower:'21.5',kIndex:'1.3375',acd:'3.20',implantedIolPower:'25.0',target:'-0.50'};value.eyes.OS={...value.eyes.OD,al:'24.10',plannedIolPower:'22.5'};return value;}
function apply(value,options={}){const plan=siteBridge('preview',profile,value,{eye:'OD',...options});return siteBridge('apply',profile,value,{eye:'OD',...options,expected:plan.rows});}

test('TECNIS profile uses unique vendor source selectors and independent planned IOL semantics',async t=>{
  const f=await fixture(t);assert.equal(profile.id,'tecnis-toric');assert.equal(profile.verificationLevel,'public-source');
  for(const field of profile.fields)assert.equal(f.doc.querySelectorAll(field.selectors[0]).length,1,field.key);
  assert.equal(new Set(profile.fields.map(field=>field.selectors[0])).size,profile.fields.length);
  assert.equal(profile.fields.find(field=>field.key==='plannedIolPower').selectors[0],'#calculate-form #seIOLPower');
  for(const key of ['acd','lt','cct','wtw','target','implantedIolPower','aConstant','lensFactor'])assert.equal(profile.fields.some(field=>field.key===key),false,key);
  assert.equal(profile.fields.find(field=>field.key==='k2Axis').readOnlyValue,true);
});

test('TECNIS writes current-eye anterior measurements and planned power without submitting or changing constants',async t=>{
  const f=await fixture(t);let submissions=0;f.doc.querySelector('#calculate-form').addEventListener('submit',event=>{submissions++;event.preventDefault();});
  f.find('constantFactor').value='8.50';f.find('method').value='Personalized ACD';f.find('steepK2M').value='175';
  const result=apply(data());assert.equal(result.error,undefined);assert.equal(f.find('axialLength').value,'23.45');assert.equal(f.find('flatK1').value,'43.20');assert.equal(f.find('steepK2').value,'44.10');assert.equal(f.find('seIOLPower').value,'21.5');
  assert.equal(f.find('constantFactor').value,'8.50');assert.equal(f.find('method').value,'Personalized ACD');assert.equal(f.find('steepK2M').value,'175');assert.equal(submissions,0);
  const read=siteBridge('read',profile,emptyCase(),{eye:'OD'});assert.equal(read.rows.find(row=>row.key==='plannedIolPower').value,'21.5');assert.equal(read.rows.find(row=>row.key==='k2Axis').value,'175');assert.equal(read.rows.some(row=>row.key==='implantedIolPower'||row.key==='acd'||row.key==='aConstant'),false);
});

test('TECNIS native eye selection dispatches exactly one change and reads the selected eye state',async t=>{
  const f=await fixture(t);let changes=0;f.find('eyeSelection2').addEventListener('change',()=>changes++);
  const before=siteBridge('inspect',profile,emptyCase(),{eye:'OS'});assert.equal(before.detectedEye,'OD');assert.equal(before.canSelectEye,true);
  siteBridge('select-eye',profile,emptyCase(),{eye:'OS'});assert.equal(changes,1);assert.equal(siteBridge('inspect',profile,emptyCase(),{eye:'OS'}).detectedEye,'OS');
  const value=data();const result=apply(value,{eye:'OS'});assert.equal(result.error,undefined);assert.equal(f.find('axialLength').value,'24.10');assert.equal(f.find('seIOLPower').value,'22.5');
});

test('reading TECNIS mm notation never changes its units or mislabels radii as diopters',async t=>{
  const f=await fixture(t);f.find('kNotationMillimeters').checked=true;f.find('flatK1').value='7.80';f.find('steepK2').value='7.60';f.find('axialLength').value='23.45';
  const result=siteBridge('read',profile,emptyCase(),{eye:'OD'});assert.equal(result.rows.find(row=>row.key==='k1').status,'unit-required');assert.equal(result.rows.find(row=>row.key==='k2').value,'');assert.equal(result.rows.find(row=>row.key==='al').value,'23.45');
  assert.equal(f.find('kNotationMillimeters').checked,true);assert.equal(f.find('flatK1').value,'7.80');assert.ok(result.warnings.length);
});

test('TECNIS prepares D only with both replacement K values and never invents a missing partner',async t=>{
  const f=await fixture(t);f.find('kNotationMillimeters').checked=true;f.find('flatK1').value='7.80';f.find('steepK2').value='7.60';let changes=0;
  f.find('kNotationDiopters').addEventListener('change',()=>{changes++;f.find('flatK1').value='';f.find('steepK2').value='';});
  const incomplete=data();delete incomplete.eyes.OD.k2;const blocked=siteBridge('prepare-input-units',profile,incomplete,{eye:'OD'});assert.equal(blocked.inputUnitPreparation.status,'manual');assert.equal(changes,0);assert.equal(f.find('flatK1').value,'7.80');
  const prepared=siteBridge('prepare-input-units',profile,data(),{eye:'OD'});assert.equal(prepared.inputUnitPreparation.status,'prepared');assert.equal(changes,1);apply(data());assert.equal(f.find('flatK1').value,'43.20');assert.equal(f.find('steepK2').value,'44.10');
});

test('TECNIS minus preference touches only the empty-result main form and preserves entered values',async t=>{
  const f=await fixture(t);f.find('axialLength').value='23.45';let changed=0;f.find('rccMinus').addEventListener('change',()=>changed++);
  const first=siteBridge('apply-display',profile,data(),{eye:'OD',cylinderConvention:'minus'});assert.equal(first.displayPreference.changed,true);assert.equal(f.find('rccMinus').checked,true);assert.equal(f.doc.querySelector('#rccPlusPreferences').checked,true);assert.equal(changed,1);assert.equal(f.find('axialLength').value,'23.45');
  f.find('rccPlus').checked=true;f.doc.querySelector('#results').innerHTML='<tr><td>SYNTHETIC PREVIOUS RESULT</td></tr>';
  const blocked=siteBridge('apply-display',profile,data(),{eye:'OD',cylinderConvention:'minus'});assert.equal(blocked.displayPreference.changed,false);assert.equal(blocked.displayPreference.status,'manual');assert.equal(f.find('rccPlus').checked,true);assert.equal(changed,1);
});

test('TECNIS missing planned-power option stays unfilled without using implanted or target values',async t=>{
  const f=await fixture(t),value=data();value.eyes.OD.plannedIolPower='23.5';
  const result=apply(value);assert.equal(result.rows.find(row=>row.key==='plannedIolPower').status,'option-missing');assert.equal(f.find('seIOLPower').value,'-Select-');
});

test('TECNIS empty select placeholders remain missing measurements and allow the blank-index default',async t=>{
  const f=await fixture(t);f.find('axialLength').value='23.45';
  const read=siteBridge('read',profile,emptyCase(),{eye:'OD'});
  assert.equal(read.rows.find(row=>row.key==='plannedIolPower').value,'');assert.equal(read.rows.find(row=>row.key==='kIndex').value,'');assert.equal(read.rows.find(row=>row.key==='al').value,'23.45');
  const value=data();delete value.eyes.OD.kIndex;apply(value);assert.equal(f.find('kIndex').value,'1.3375');
  f.find('kIndex').value='1.336';apply(value);assert.equal(f.find('kIndex').value,'1.336');
});

test('the dedicated TECNIS target fills supplied astigmatism data without a separate mode flag and leaves absent values alone',async t=>{
  const f=await fixture(t),value=data();delete value.eyes.OD.toric;
  apply(value);assert.equal(f.find('flatK1M').value,'90');assert.equal(f.find('sia').value,'0.10');assert.equal(f.find('incisionLocation').value,'95');
  delete value.eyes.OD.sia;delete value.eyes.OD.incisionAxis;f.find('sia').value='0.20';f.find('incisionLocation').value='80';
  apply(value);assert.equal(f.find('sia').value,'0.20');assert.equal(f.find('incisionLocation').value,'80');
});

test('saved TECNIS comma format cannot corrupt dot-decimal biometry or trigger a destructive K-unit switch',async t=>{
  const f=await fixture(t);f.find('kIndex').querySelector('option[value="1.3375"]').textContent='1,3375';
  f.find('kNotationMillimeters').checked=true;
  const original={axialLength:'23,45',flatK1:'7,80',steepK2:'7,60',sia:'0,10'};
  for(const [key,value]of Object.entries(original))f.find(key).value=value;
  const read=siteBridge('read',profile,emptyCase(),{eye:'OD'});
  for(const key of ['al','k1','k2','sia']){assert.notEqual(read.rows.find(row=>row.key===key).status,'read');assert.equal(read.rows.find(row=>row.key===key).value,'');}
  assert.ok(read.warnings.length);
  const prepared=siteBridge('prepare-input-units',profile,data(),{eye:'OD'});assert.equal(prepared.inputUnitPreparation.changed,false);assert.equal(f.find('kNotationMillimeters').checked,true);
  const result=apply(data());
  for(const key of ['al','k1','k2','sia'])assert.notEqual(result.rows.find(row=>row.key===key).status,'filled');
  for(const [key,value]of Object.entries(original))assert.equal(f.find(key).value,value);
  assert.equal(f.find('incisionLocation').value,'95');assert.equal(f.find('seIOLPower').value,'21.5');
});

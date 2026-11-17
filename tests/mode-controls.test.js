import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {siteBridge} from '../src/bridge.js';
import {OTHER_SITES} from '../src/adapters/other-sites.js';
import {emptyCase} from '../src/model.js';

function setup(t,html,url){
  const dom=new JSDOM(html,{url}),keys=['document','location','getComputedStyle','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','Event'];
  const saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='getComputedStyle'?dom.window.getComputedStyle.bind(dom.window):dom.window[key]});
  dom.window.HTMLElement.prototype.getClientRects=function(){return this.hidden||this.closest('[hidden]')||this.style.display==='none'?[]:[{width:80,height:24}];};
  t.after(()=>{for(const [key,descriptor]of saved)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];dom.window.close();});
  return dom.window;
}
const findSite=id=>OTHER_SITES.find(site=>site.id===id);
const eyeRadios='<input type="radio" name="eye" id="RadioButtonRLEye_0" checked><input type="radio" name="eye" id="RadioButtonRLEye_1">';

test('ESCRS controls are independent per-eye switches; reading preserves different OD and OS modes',t=>{
  const sections=['OD','OS'].map(eye=>`<div class="mud-grid-item">${['Toric','Keratoconus','Argos (SoS) AL','Post LASIK/PRK/RK'].map((label,index)=>`<label><input type="checkbox" id="${eye}-${index}">${label}</label>`).join('')}</div>`).join('');
  setup(t,`<div class="mud-grid mud-grid-spacing-xs-6 noprint">${sections}</div>`,'https://iolcalculator.escrs.org/');
  const p=findSite('escrs'),data=emptyCase();
  data.eyes.OD={toric:true,keratoconus:false,biometer:'Argos',lvcType:'myopic'};
  data.eyes.OS={toric:false,keratoconus:true,biometer:'IOLMaster 700',lvcType:'none'};
  for(let index=0;index<p.modeControls.length;index++)siteBridge('prepare-modes',p,data,{eye:'OU',modeIndex:index});
  assert.deepEqual([...document.querySelectorAll('input')].map(node=>node.checked),[true,false,true,true,false,true,false,false]);
  const before=[...document.querySelectorAll('input')].map(node=>node.checked),read=siteBridge('read',p,emptyCase(),{eye:'OU'});
  const value=(eye,key)=>read.rows.find(row=>row.eye===eye&&row.key===key)?.value;
  assert.equal(value('OD','toric'),true);assert.equal(value('OS','toric'),false);
  assert.equal(value('OS','keratoconus'),true);assert.equal(value('OD','argos'),'yes');assert.equal(value('OS','argos'),'no');
  assert.equal(value('OD','lvcType'),'unknown');assert.equal(value('OS','lvcType'),'none');
  assert.deepEqual([...document.querySelectorAll('input')].map(node=>node.checked),before);
});

test('ESCRS one-eye mode preparation never touches OS and duplicated controls are blocked',t=>{
  setup(t,'<div class="mud-grid mud-grid-spacing-xs-6 noprint"><div class="mud-grid-item"><label><input type="checkbox">Toric</label><label><input type="checkbox">Toric</label></div><div class="mud-grid-item"><label><input type="checkbox">Toric</label></div></div>','https://iolcalculator.escrs.org/');
  const p=findSite('escrs'),data=emptyCase();data.eyes.OD.toric=true;data.eyes.OS.toric=true;
  const selected=siteBridge('prepare-modes',p,data,{eye:'OD',modeIndex:0});
  assert.equal(selected.modePreparation.status,'ambiguous');assert.equal(document.querySelector('input:checked'),null);
  assert.equal(siteBridge('inspect',p,data,{eye:'OD'}).modeControls.some(state=>state.eye==='OS'),false);
});

test('ESCRS required initials prefer true initials then ID then name, without changing stored identity',async t=>{
  setup(t,'<label for="initials">Patient Initials</label><input id="initials" required>','https://iolcalculator.escrs.org/');
  const p={...findSite('escrs'),writeSettleMs:0},data=emptyCase();data.patient.patientId='SYNTHETIC-ID';data.patient.name='SYNTHETIC NAME';
  const original=structuredClone(data.patient);
  let plan=siteBridge('preview',p,data,{eye:'OD'});await siteBridge('apply',p,data,{eye:'OD',expected:plan.rows});
  assert.equal(document.querySelector('#initials').value,'SYNTHETIC-ID');assert.deepEqual(data.patient,original);
  data.patient.initials='QA';plan=siteBridge('preview',p,data,{eye:'OD'});await siteBridge('apply',p,data,{eye:'OD',expected:plan.rows});assert.equal(document.querySelector('#initials').value,'QA');
  assert.equal(siteBridge('preview',p,data,{eye:'OD',identityFallbacks:false}).rows.some(row=>row.key==='patient.initials'),false);
});

test('Cooke maps IOLMaster 700 to Other and Argos to the exact per-eye native radio',t=>{
  const sections=['od','os'].map(side=>`<div role="radiogroup" aria-labelledby="${side}-biometer-label">${[['Argos','0'],['Lenstar','1'],['Other','2']].map(([label,value])=>`<label><input type="radio" name="${side}-bio" value="${value}">${label}</label>`).join('')}</div>`).join('');
  setup(t,sections,'https://cookeformula.com/');const p=findSite('cooke'),data=emptyCase();data.eyes.OD.biometer='IOLMaster 700';data.eyes.OS.biometer='Argos';
  siteBridge('prepare-modes',p,data,{eye:'OU',modeIndex:0});siteBridge('prepare-modes',p,data,{eye:'OU',modeIndex:1});
  assert.equal(document.querySelector('[name="od-bio"]:checked').value,'2');assert.equal(document.querySelector('[name="os-bio"]:checked').value,'0');
  const rows=siteBridge('read',p,emptyCase(),{eye:'OU'}).rows;assert.equal(rows.find(row=>row.key==='biometer'&&row.eye==='OS').value,'Argos');
});

test('EVO LVC mode is prepared separately before history and posterior-device changes remain separate',t=>{
  setup(t,`${eyeRadios}<select id="DropDownLASIK"><option value="0">No</option><option value="1">Myopic</option><option value="2">Hyperopic</option><option value="3">Radial Keratotomy</option></select><select id="DropDownArgos"><option value="0">No</option><option value="1">Yes</option></select><select id="DropDownListPK"><option>IOLMaster 700</option><option>Anterion</option></select><input id="txtPreLASIK" disabled>`, 'https://www.evoiolcalculator.com/Calculator.aspx');
  const p=findSite('evo'),data=emptyCase();data.eyes.OD={lvcType:'myopic-lasik',biometer:'Argos',preLasikRefraction:'-5'};
  document.querySelector('#DropDownLASIK').addEventListener('change',()=>document.querySelector('#txtPreLASIK').disabled=false);
  assert.equal(siteBridge('preview',p,data,{eye:'OD'}).rows.find(row=>row.key==='preLasikRefraction').status,'missing');
  const outcome=siteBridge('prepare-modes',p,data,{eye:'OD',modeIndex:0});assert.equal(outcome.navigationExpected,true);
  siteBridge('prepare-modes',p,data,{eye:'OD',modeIndex:1});siteBridge('prepare-modes',p,data,{eye:'OD',modeIndex:2});
  assert.equal(document.querySelector('#DropDownLASIK').value,'1');assert.equal(document.querySelector('#DropDownArgos').value,'1');assert.equal(document.querySelector('#DropDownListPK').value,'IOLMaster 700');
  const plan=siteBridge('preview',p,data,{eye:'OD'});assert.equal(plan.rows.find(row=>row.key==='preLasikRefraction').status,'ready');assert.equal(plan.rows.find(row=>row.key==='lvcType').status,'ready');
  const rows=siteBridge('read',p,emptyCase(),{eye:'OD'}).rows;assert.equal(rows.find(row=>row.key==='lvcType').value,'myopic');assert.equal(rows.find(row=>row.key==='posteriorBiometer').value,'IOLMaster 700');
  data.eyes.OD.lvcType='unknown';assert.equal(siteBridge('prepare-modes',p,data,{eye:'OD',modeIndex:0}).modePreparation.status,'option-missing');assert.equal(document.querySelector('#DropDownLASIK').value,'1');
});

test('contradictory Argos and instrument sources preserve site modes instead of guessing',t=>{
  setup(t,`${eyeRadios}<select id="DropDownArgos"><option value="0">No</option><option value="1">Yes</option></select>`, 'https://www.evoiolcalculator.com/Calculator.aspx');
  const p=findSite('evo'),data=emptyCase();data.eyes.OD={al:'24',biometer:'Argos',argos:'no'};
  let result=siteBridge('prepare-modes',p,data,{eye:'OD',modeIndex:1});assert.equal(result.modePreparation.status,'manual');assert.match(result.modePreparation.reason,/矛盾/);assert.equal(document.querySelector('#DropDownArgos').value,'0');
  data.eyes.OD={al:'24',biometer:'IOLMaster 700',argos:'yes'};result=siteBridge('prepare-modes',p,data,{eye:'OD',modeIndex:1});assert.equal(result.modePreparation.status,'manual');assert.equal(document.querySelector('#DropDownArgos').value,'0');
});

test('async forms refind unchanged replacement inputs but preserve later values changed by the site',async t=>{
  setup(t,'<input id="al" value="21"><div id="slot"><input id="target" value="0"><input id="acd" value="3"></div>','https://calculator.test/');
  const p={id:'async',url:'https://calculator.test/',eyeMode:'both',asyncWrites:true,writeSettleMs:5,fields:[{key:'al',selectors:['#al']},{key:'target',selectors:['#target']},{key:'acd',selectors:['#acd']}]};
  const data=emptyCase();data.eyes.OD={al:'24',target:'-1',acd:'3.2'};
  document.querySelector('#al').addEventListener('change',()=>setTimeout(()=>{document.querySelector('#slot').innerHTML='<input id="target" value="0"><input id="acd" value="4">';},0));
  const plan=siteBridge('preview',p,data,{eye:'OD'}),result=await siteBridge('apply',p,data,{eye:'OD',expected:plan.rows});
  assert.equal(result.rows.find(row=>row.key==='target').status,'filled');assert.equal(document.querySelector('#target').value,'-1');
  assert.equal(result.rows.find(row=>row.key==='acd').status,'changed');assert.equal(document.querySelector('#acd').value,'4');
});

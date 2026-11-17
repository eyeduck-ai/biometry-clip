import assert from 'node:assert/strict';
import test from 'node:test';
import {JSDOM} from 'jsdom';
import {siteBridge} from '../src/bridge.js';
import {OTHER_SITES} from '../src/adapters/other-sites.js';
import {emptyCase} from '../src/model.js';

// The public DGS Complex/Second templates bind .switch-eye to inputs.side:
// true renders OD; false renders OS. The website's watcher restores that
// eye's own values, so this must be a native click followed by reinspection.
function fixture(t,html,path='/complex'){
  const dom=new JSDOM(html,{url:`https://iolsolver.com${path}`});
  const keys=['document','location','getComputedStyle','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','Event'];
  const saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='getComputedStyle'?dom.window.getComputedStyle.bind(dom.window):dom.window[key]});
  dom.window.HTMLElement.prototype.getClientRects=function(){return this.hidden||this.style.display==='none'||this.closest('[hidden]')?[]:[{x:0,y:0,width:80,height:24}];};
  t.after(()=>{for(const [key,descriptor]of saved)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];dom.window.close();});
  return dom.window;
}
const profile=id=>OTHER_SITES.find(site=>site.id===id);
const source=eye=>{const data=emptyCase();data.activeEye=eye;data.eyes[eye]={al:eye==='OD'?'23.45':'24.10'};return data;};
const switchMarkup='<div class="switch-eye"><input id="eye-switch" type="checkbox" role="switch" checked></div><label for="al">AL (mm)</label><input id="al" value="22">';

for(const [id,path]of [['solver-complex','/complex'],['solver-second','/second']]){
  test(`${id} reads checked OD and clicks once to OS without filling or submitting`,t=>{
    fixture(t,`<form>${switchMarkup}<button>Calculate</button></form>`,path);
    const p=profile(id),data=source('OS'),control=document.querySelector('#eye-switch');
    let clicks=0,submits=0;
    control.addEventListener('click',()=>clicks++);
    control.addEventListener('change',()=>{document.querySelector('#al').value=control.checked?'22':'23';});
    document.querySelector('form').addEventListener('submit',event=>{event.preventDefault();submits++;});
    const before=siteBridge('inspect',p,data);
    assert.equal(before.detectedEye,'OD');assert.equal(before.canSelectEye,true);
    const selected=siteBridge('select-eye',p,data);
    assert.equal(selected.autoEyeSelected,true);assert.equal(control.checked,false);
    assert.equal(document.querySelector('#al').value,'23');assert.equal(clicks,1);assert.equal(submits,0);
    assert.equal(siteBridge('inspect',p,data).detectedEye,'OS');
    assert.equal(siteBridge('select-eye',p,data).autoEyeSelected,false);assert.equal(clicks,1);
    const preview=siteBridge('preview',p,data);
    const applied=siteBridge('apply',p,data,{expected:preview.rows});
    assert.equal(applied.rows.find(row=>row.key==='al').status,'filled');
    assert.equal(document.querySelector('#al').value,'24.10');
    assert.equal(siteBridge('read',p,emptyCase(),{eye:'OS'}).rows.find(row=>row.key==='al').value,'24.10');
  });
}

test('DGS copying a different eye never toggles the switch or relabels current values',t=>{
  fixture(t,switchMarkup);
  const p=profile('solver-complex'),data=source('OS');let clicks=0;
  document.querySelector('#eye-switch').addEventListener('click',()=>clicks++);
  const wrong=siteBridge('read',p,data,{eye:'OS',eyeConfirmed:true});
  assert.match(wrong.error,/OD/);assert.deepEqual(wrong.rows,[]);assert.equal(clicks,0);
  const right=siteBridge('read',p,data,{eye:'OD'});
  assert.equal(right.rows.find(row=>row.key==='al').value,'22');
  assert.equal(right.rows.find(row=>row.key==='al').eye,'OD');assert.equal(clicks,0);
});

test('DGS indeterminate, duplicated, disabled and ARIA-disabled switches cannot be selected',t=>{
  fixture(t,switchMarkup);
  const p=profile('solver-complex'),data=source('OS'),control=document.querySelector('#eye-switch');
  for(const change of [()=>{control.indeterminate=true;},()=>{control.disabled=true;},()=>{control.setAttribute('aria-disabled','true');}]){
    change();assert.equal(siteBridge('inspect',p,data).canSelectEye,false);
    assert.ok(siteBridge('select-eye',p,data).error);assert.equal(control.checked,true);
    control.indeterminate=false;control.disabled=false;control.removeAttribute('aria-disabled');
  }
  document.querySelector('.switch-eye').insertAdjacentHTML('beforeend','<input type="checkbox" checked>');
  const ambiguous=siteBridge('inspect',p,data);
  assert.equal(ambiguous.canSelectEye,false);assert.equal(ambiguous.detectedEye,'');
  assert.ok(siteBridge('select-eye',p,data).error);assert.equal(control.checked,true);
});

test('DGS Toric identifies the calculated eye from its exact header without a switch',t=>{
  fixture(t,'<section class="iol-left-v-sheet"><h2>OS</h2></section><label for="sia">SIA (D)</label><input id="sia" value="0.05">','/toric');
  const p=profile('solver-toric'),data=source('OS'),inventory=siteBridge('inspect',p,data);
  assert.equal(inventory.detectedEye,'OS');assert.equal(inventory.canSelectEye,false);
  assert.equal(siteBridge('read',p,data).rows.find(row=>row.key==='sia').value,'0.05');
  const wrong=siteBridge('read',p,source('OD'),{eyeConfirmed:true});
  assert.match(wrong.error,/OS/);assert.deepEqual(wrong.rows,[]);
  assert.ok(siteBridge('select-eye',p,source('OD')).error);
});

test('DGS Toric ignores hidden or contradictory calculated-eye indicators',t=>{
  fixture(t,'<section class="iol-left-v-sheet" hidden><h2>OS</h2></section><section class="iol-right-v-sheet"><h2>OD</h2></section>','/toric');
  const p=profile('solver-toric'),data=source('OD');
  assert.equal(siteBridge('inspect',p,data).detectedEye,'OD');
  document.querySelector('.iol-left-v-sheet').hidden=false;
  assert.equal(siteBridge('inspect',p,data).detectedEye,'');
  assert.equal(siteBridge('inspect',p,data).canSelectEye,false);
  document.querySelector('.iol-right-v-sheet').insertAdjacentHTML('beforeend','<h2>OD</h2>');
  assert.equal(siteBridge('inspect',p,data).detectedEye,'');
});

test('DGS Toric exposes its spherical-calculation prerequisite and basic entry',t=>{
  fixture(t,'<form><div class="ghost"><p class="text-center text-h6 text-sm-h5">To perform a toric calculation :<br>Please first complete a spherical IOL calculation<br>Then select an "IOL Power" value<br>Then proceed to toric calculation.</p></div></form>','/toric');
  const result=siteBridge('inspect',profile('solver-toric'),source('OD'));
  assert.equal(result.prerequisite.status,'required');
  assert.equal(result.prerequisite.entrySiteId,'solver-regular');
  assert.match(result.prerequisite.message,/spherical|基本|球面/i);
  assert.deepEqual(result.rows,[]);
});

test('DGS prerequisite detection does not react to hidden help text or one partial phrase',t=>{
  fixture(t,'<form><div class="ghost" hidden><p class="text-center text-h6 text-sm-h5">Please first complete a spherical IOL calculation Then select an "IOL Power" value</p></div><p>Please first complete a spherical IOL calculation</p></form>','/toric');
  const result=siteBridge('inspect',profile('solver-toric'),source('OD'));
  assert.equal(result.prerequisite.status,'ready');
});

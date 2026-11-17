import assert from 'node:assert/strict';
import test from 'node:test';
import {JSDOM} from 'jsdom';
import {siteBridge} from '../src/bridge.js';
import {OTHER_SITES} from '../src/adapters/other-sites.js';
import {emptyCase} from '../src/model.js';

function fixture(t,path='/complex'){
  // The owned listbox and activator match DGS's public Vuetify bundle.
  const dom=new JSDOM(`<form><div class="switch-eye"><input type="checkbox" checked></div>
    <div class="iol-v-select v-select"><div class="v-input__slot" role="button" aria-haspopup="listbox" aria-expanded="false" aria-owns="instrument-list">
    <label for="instrument">Biometer</label><div class="v-select__selection">Other</div><input id="instrument" readonly aria-readonly="false"><input id="internal-value" type="hidden" value="UNCHANGED"></div></div></form>
    <div id="instrument-list" role="listbox" hidden>${['Argos (SOS-AL)','US (immersion)','US (applanation)','Other'].map(text=>`<div role="option" aria-selected="${text==='Other'}">${text}</div>`).join('')}</div>
    <div role="listbox"><div role="option">Argos (SOS-AL)</div></div>`,{url:`https://iolsolver.com${path}`});
  const keys=['document','location','getComputedStyle','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','Event'];
  const saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='getComputedStyle'?dom.window.getComputedStyle.bind(dom.window):dom.window[key]});
  dom.window.HTMLElement.prototype.getClientRects=function(){return this.hidden||this.style.display==='none'||this.closest('[hidden]')?[]:[{x:0,y:0,width:80,height:24}];};
  t.after(()=>{for(const [key,descriptor]of saved)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];dom.window.close();});
  const activator=document.querySelector('[aria-owns]'),list=document.querySelector('#instrument-list'),selection=document.querySelector('.v-select__selection');
  const counts={open:0,select:0,submit:0};
  activator.addEventListener('click',()=>{counts.open++;activator.setAttribute('aria-expanded','true');list.hidden=false;});
  for(const option of list.querySelectorAll('[role="option"]'))option.addEventListener('click',()=>{counts.select++;selection.textContent=option.textContent;for(const sibling of list.children)sibling.setAttribute('aria-selected',String(sibling===option));list.hidden=true;activator.setAttribute('aria-expanded','false');});
  document.querySelector('form').addEventListener('submit',event=>{event.preventDefault();counts.submit++;});
  return {activator,list,selection,counts};
}
const profile=id=>OTHER_SITES.find(site=>site.id===id);
function data(od='Argos',os=od){const value=emptyCase();value.eyes.OD={al:'23.45',biometer:od};value.eyes.OS={al:'24.10',biometer:os};return value;}
function mode(p,value,eye='OD'){const inventory=siteBridge('inspect',p,value,{eye});return inventory.modeControls.find(item=>item.key==='biometer');}
function prepare(p,value,eye='OD'){return siteBridge('prepare-modes',p,value,{eye,modeIndex:mode(p,value,eye).index});}

for(const [id,path,eye]of [['solver-regular','/regular','OU'],['solver-complex','/complex','OD'],['solver-second','/second','OD']]){
  test(`${id} selects Argos through only its linked option UI and reads it back`,t=>{
    const f=fixture(t,path),p=profile(id),value=data();
    assert.equal(mode(p,value,eye).available,true);
    const opened=prepare(p,value,eye);
    assert.equal(opened.modePreparation.phase,'opened');assert.equal(f.counts.open,1);assert.equal(f.counts.select,0);
    assert.equal(document.querySelector('#internal-value').value,'UNCHANGED');
    const selected=prepare(p,value,eye);
    assert.equal(selected.modePreparation.status,'applied');assert.equal(f.counts.select,1);assert.equal(f.counts.submit,0);
    assert.equal(f.selection.textContent,'Argos (SOS-AL)');assert.equal(document.querySelector('#internal-value').value,'UNCHANGED');
    const read=siteBridge('read',p,emptyCase(),{eye});
    const item=read.rows.find(row=>row.key==='biometer');assert.equal(item.status,'read');
    const copied=data(item.value);assert.equal(mode(p,copied,eye).requested,'Argos (SOS-AL)');
    const again=prepare(p,copied,eye);assert.equal(again.modePreparation.status,'already-selected');assert.equal(f.counts.open,1);assert.equal(f.counts.select,1);
  });
}

test('DGS optical instruments map to Other and identical OU mappings are compatible',t=>{
  const f=fixture(t,'/regular'),p=profile('solver-regular'),value=data('IOLMaster 700','Lenstar');
  const state=mode(p,value,'OU');assert.equal(state.requested,'Other');assert.equal(state.available,true);
  assert.equal(prepare(p,value,'OU').modePreparation.status,'already-selected');
  assert.equal(f.counts.open,0);assert.equal(f.counts.select,0);
});

for(const instrument of ['US (immersion)','US (applanation)']){
  test(`DGS keeps the distinct ${instrument} instrument option`,t=>{
    const f=fixture(t),p=profile('solver-complex'),value=data(instrument);
    assert.equal(mode(p,value).requested,instrument);
    prepare(p,value);prepare(p,value);
    assert.equal(f.selection.textContent,instrument);assert.equal(f.counts.select,1);
  });
}

test('DGS conflicting bilateral biometer mappings cannot silently choose OD',t=>{
  const f=fixture(t,'/regular'),p=profile('solver-regular'),value=data('Argos','IOLMaster 700');
  const state=mode(p,value,'OU');assert.equal(state.available,false);
  prepare(p,value,'OU');assert.equal(f.counts.open,0);assert.equal(f.counts.select,0);assert.equal(f.selection.textContent,'Other');
});

test('DGS native option flow rejects duplicated, disabled and unlinked menus',t=>{
  const f=fixture(t),p=profile('solver-complex'),value=data();
  prepare(p,value);
  f.list.insertAdjacentHTML('beforeend','<div role="option">Argos (SOS-AL)</div>');
  prepare(p,value);assert.equal(f.counts.select,0);assert.equal(f.selection.textContent,'Other');
  f.list.lastElementChild.remove();
  f.list.querySelector('[role="option"]').setAttribute('aria-disabled','true');
  prepare(p,value);assert.equal(f.counts.select,0);
  f.list.querySelector('[role="option"]').removeAttribute('aria-disabled');
  f.activator.setAttribute('aria-owns','unrelated-list');
  prepare(p,value);assert.equal(f.counts.select,0);
  assert.equal(document.querySelector('#internal-value').value,'UNCHANGED');
});

test('DGS custom-select copying never opens its menu and duplicate labels are blocked',t=>{
  const f=fixture(t),p=profile('solver-complex');
  const read=siteBridge('read',p,emptyCase(),{eye:'OD'});
  assert.equal(read.rows.find(row=>row.key==='biometer').value,'Other');assert.equal(f.counts.open,0);
  const root=document.querySelector('.iol-v-select');root.insertAdjacentHTML('afterend',root.outerHTML);
  assert.equal(mode(p,data()).available,false);prepare(p,data());assert.equal(f.counts.open,0);
});

test('DGS readonly or disabled custom-select states cannot open the option menu',t=>{
  const f=fixture(t),p=profile('solver-complex'),root=document.querySelector('.iol-v-select'),input=document.querySelector('#instrument');
  for(const attribute of ['aria-readonly','aria-disabled']){
    input.setAttribute(attribute,'true');
    assert.equal(mode(p,data()).available,false);prepare(p,data());assert.equal(f.counts.open,0);
    input.removeAttribute(attribute);
  }
  root.classList.add('v-input--is-readonly');
  assert.equal(mode(p,data()).available,false);prepare(p,data());assert.equal(f.counts.open,0);
});

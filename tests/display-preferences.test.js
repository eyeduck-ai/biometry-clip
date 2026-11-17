import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {siteBridge} from '../src/bridge.js';
import {emptyCase} from '../src/model.js';
import {APACRS_SITES} from '../src/adapters/apacrs.js';

function fixture(t){
  const profile=APACRS_SITES.find(site=>site.id==='barrett-rx');
  const html='<form><input type="radio" id="MainContent_Rad1" name="eye" checked><input type="radio" id="MainContent_Rad2" name="eye"><label for="MainContent_RadioButtonList2_0">+ve Cyl</label><input id="MainContent_RadioButtonList2_0" type="radio" name="cyl" value="1" checked><label for="MainContent_RadioButtonList2_1">-ve Cyl</label><input id="MainContent_RadioButtonList2_1" type="radio" name="cyl" value="-1"><input id="MainContent_PostOpCyl" value="0.50"><input id="MainContent_PostOpAxis" value="85"><button id="calculate">Calculate</button></form>';
  const dom=new JSDOM(html,{url:profile.url}),keys=['document','location','getComputedStyle','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','Event'];
  const saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='getComputedStyle'?dom.window.getComputedStyle.bind(dom.window):dom.window[key]});
  dom.window.HTMLElement.prototype.getClientRects=function(){return this.hidden||this.style.display==='none'||this.closest('[hidden]')?[]:[{width:80,height:24}];};
  t.after(()=>{for(const [key,value]of saved)value?Object.defineProperty(globalThis,key,value):delete globalThis[key];dom.window.close();});
  let submits=0;dom.window.document.querySelector('form').onsubmit=event=>{event.preventDefault();submits++;};
  const data=emptyCase();data.eyes.OD={al:'23.45',refractionCylinder:'0.50',refractionAxis:'85'};
  const run=(action,options={})=>siteBridge(action,profile,data,{eye:'OD',...options});
  return {dom,profile,data,run,get submits(){return submits;},plus:dom.window.document.querySelector('#MainContent_RadioButtonList2_0'),minus:dom.window.document.querySelector('#MainContent_RadioButtonList2_1')};
}

test('inspect, read and preview expose the convention without changing it or refraction data',t=>{
  const f=fixture(t),before=structuredClone(f.data);
  for(const action of ['inspect','read','preview']){
    const result=f.run(action,{cylinderConvention:'minus'});assert.equal(result.error,undefined);assert.equal(result.displayPreferences.cylinderConvention.value,'plus');assert.equal(f.plus.checked,true);assert.equal(f.minus.checked,false);
  }
  assert.deepEqual(f.data,before);assert.equal(f.dom.window.document.querySelector('#MainContent_PostOpCyl').value,'0.50');assert.equal(f.submits,0);
});

test('the default minus preference selects only the verified radio and never transposes cylinder or axis',t=>{
  const f=fixture(t),before=structuredClone(f.data);let changes=0;f.minus.onchange=()=>changes++;
  const result=f.run('apply-display');assert.equal(result.displayPreference.status,'applied');assert.equal(result.displayPreference.value,'minus');assert.equal(f.minus.checked,true);assert.equal(f.plus.checked,false);assert.equal(changes,1);
  assert.equal(f.dom.window.document.querySelector('#MainContent_PostOpCyl').value,'0.50');assert.equal(f.dom.window.document.querySelector('#MainContent_PostOpAxis').value,'85');assert.deepEqual(f.data,before);assert.equal(f.submits,0);assert.deepEqual(result.rows,[]);
  assert.equal(f.run('apply-display').displayPreference.status,'already-selected');assert.equal(changes,1);
});

test('plus and preserve are explicit preferences, with preserve leaving the current radio untouched',t=>{
  const f=fixture(t);f.run('apply-display');assert.equal(f.minus.checked,true);
  assert.equal(f.run('apply-display',{cylinderConvention:'plus'}).displayPreference.status,'applied');assert.equal(f.plus.checked,true);
  assert.equal(f.run('apply-display',{cylinderConvention:'preserve'}).displayPreference.status,'preserved');assert.equal(f.plus.checked,true);assert.equal(f.submits,0);
});

test('hidden, disabled, relabeled, value-changed and extra radio controls remain manual',t=>{
  const f=fixture(t);
  const scenarios=[
    ()=>{f.minus.hidden=true;},
    ()=>{f.minus.disabled=true;},
    ()=>{f.dom.window.document.querySelector('label[for="MainContent_RadioButtonList2_1"]').textContent='Clear Entries';},
    ()=>{f.minus.value='2';},
    ()=>{const extra=f.dom.window.document.createElement('input');extra.type='radio';extra.name='cyl';f.plus.after(extra);},
  ];
  const original=f.dom.window.document.body.innerHTML;
  for(const mutate of scenarios){
    f.dom.window.document.body.innerHTML=original;
    Object.defineProperty(f,'plus',{value:f.dom.window.document.querySelector('#MainContent_RadioButtonList2_0'),configurable:true});Object.defineProperty(f,'minus',{value:f.dom.window.document.querySelector('#MainContent_RadioButtonList2_1'),configurable:true});
    mutate();const result=f.run('apply-display');assert.equal(result.error,undefined);assert.equal(result.displayPreference.status,'manual');assert.equal(f.plus.checked,true);assert.equal(f.minus.checked,false);
  }
});

test('a declared native convention select uses exact options and dispatches its normal change',t=>{
  const f=fixture(t),select=f.dom.window.document.createElement('select');select.id='convention';select.innerHTML='<option value="p">Plus</option><option value="m">Minus</option>';f.dom.window.document.querySelector('form').append(select);
  const p={...f.profile,displayPreferences:{cylinderConvention:{control:'select',selectors:['#convention'],valueMap:{plus:'p',minus:'m'}}}};
  let changes=0;select.onchange=()=>changes++;
  const result=siteBridge('apply-display',p,f.data,{eye:'OD',cylinderConvention:'minus'});assert.equal(result.displayPreference.status,'applied');assert.equal(select.value,'m');assert.equal(changes,1);
  select.disabled=true;assert.equal(siteBridge('apply-display',p,f.data,{eye:'OD',cylinderConvention:'plus'}).displayPreference.status,'manual');assert.equal(select.value,'m');
});

test('unsupported profiles and invalid preference values never guess a plus/minus control',t=>{
  const f=fixture(t),p={...f.profile,displayPreferences:undefined};
  assert.equal(siteBridge('apply-display',p,f.data,{eye:'OD'}).displayPreference.status,'unsupported');assert.equal(f.plus.checked,true);
  assert.match(f.run('apply-display',{cylinderConvention:'negative-clinical-input'}).error,/顯示偏好/);assert.equal(f.plus.checked,true);
});

test('a declared results-side-effect gate leaves existing results untouched while an empty table can change notation',t=>{
  const f=fixture(t),table=f.dom.window.document.createElement('table');table.innerHTML='<tbody id="results"></tbody>';f.dom.window.document.body.append(table);
  const definition={...f.profile.displayPreferences.cylinderConvention,requireNoResultsSelector:'#results > tr',requireUniqueResultsContainer:'#results'},p={...f.profile,displayPreferences:{cylinderConvention:definition}};
  let recalculations=0;f.minus.onchange=()=>{if(f.dom.window.document.querySelector('#results tr'))recalculations++;};
  f.dom.window.document.querySelector('#results').innerHTML='<tr><td>EXISTING RESULT</td></tr>';
  const blocked=siteBridge('apply-display',p,f.data,{eye:'OD'});assert.equal(blocked.displayPreference.status,'manual');assert.match(blocked.displayPreference.reason,/重新計算/);assert.equal(f.plus.checked,true);assert.equal(recalculations,0);
  f.dom.window.document.querySelector('#results').replaceChildren();assert.equal(siteBridge('apply-display',p,f.data,{eye:'OD'}).displayPreference.status,'applied');assert.equal(f.minus.checked,true);assert.equal(recalculations,0);
  f.dom.window.document.querySelector('#results').innerHTML='<tr><td>EXISTING RESULT</td></tr>';assert.equal(siteBridge('apply-display',p,f.data,{eye:'OD'}).displayPreference.status,'already-selected');assert.equal(recalculations,0);
});

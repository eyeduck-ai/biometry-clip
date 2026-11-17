import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {siteBridge} from '../src/bridge.js';
import {emptyCase} from '../src/model.js';

// The real site clears both K inputs in its native unit-change handler. This
// fixture reproduces only that public input behavior, never the calculator.
function fixture(t){
  const dom=new JSDOM(`<form id="calculate-form">
    <input type="radio" name="eye" id="eye-od" checked><input type="radio" name="eye" id="eye-os">
    <input type="radio" name="kNotation" id="kNotationDiopters" value="D"><input type="radio" name="kNotation" id="kNotationMillimeters" value="mm" checked>
    <input id="flatK1" value="7.81"><input id="steepK2" value="7.65"><button id="calculate" type="submit">Calculate</button>
  </form>`,{url:'https://tecnistoriccalc.com/calculator/'});
  const keys=['document','location','getComputedStyle','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','Event'];
  const saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='getComputedStyle'?dom.window.getComputedStyle.bind(dom.window):dom.window[key]});
  dom.window.HTMLElement.prototype.getClientRects=function(){return this.hidden||this.closest('[hidden]')?[]:[{x:0,y:0,width:90,height:25}];};
  t.after(()=>{for(const [key,descriptor]of saved)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];dom.window.close();});
  const doc=dom.window.document,k1=doc.querySelector('#flatK1'),k2=doc.querySelector('#steepK2'),diopters=doc.querySelector('#kNotationDiopters'),millimeters=doc.querySelector('#kNotationMillimeters');
  const events={clicks:0,changes:0,submits:0};
  diopters.addEventListener('click',()=>events.clicks++);
  diopters.addEventListener('change',()=>{events.changes++;k1.value='';k2.value='';});
  doc.querySelector('form').addEventListener('submit',event=>{events.submits++;event.preventDefault();});
  const profile={id:'tecnis-fixture',url:dom.window.location.href,path:'/calculator/',eyeMode:'single',eyeSelectors:{OD:['#eye-od'],OS:['#eye-os']},required:['k1','k2'],fields:[
    {key:'k1',selectors:['#flatK1'],requiresKeratometryUnit:'D',unit:'D'},
    {key:'k2',selectors:['#steepK2'],requiresKeratometryUnit:'D',unit:'D'},
  ],inputUnits:{keratometry:{control:'radio',choices:{D:'#kNotationDiopters',mm:'#kNotationMillimeters'},values:{D:'D',mm:'mm'},sourceKeys:['k1','k2'],canonical:'D',min:20,max:80}}};
  const source=(values={k1:'43.20',k2:'44.10'})=>{const data=emptyCase();data.eyes.OD={...values};return data;};
  const reset=()=>{millimeters.checked=true;diopters.checked=false;k1.value='7.81';k2.value='7.65';};
  const snapshot=()=>({D:diopters.checked,mm:millimeters.checked,k1:k1.value,k2:k2.value});
  return {dom,doc,k1,k2,diopters,millimeters,events,profile,source,reset,snapshot};
}

test('unit preparation clicks native D once, survives the site clearing both K inputs, then fills both canonical powers',t=>{
  const f=fixture(t),data=f.source(),before=structuredClone(data);
  const prepared=siteBridge('prepare-input-units',f.profile,data,{eye:'OD'});
  assert.equal(prepared.error,undefined);assert.equal(prepared.inputUnitPreparation.status,'prepared');assert.equal(prepared.inputUnitPreparation.changed,true);
  assert.deepEqual(f.snapshot(),{D:true,mm:false,k1:'',k2:''});assert.deepEqual(f.events,{clicks:1,changes:1,submits:0});
  const plan=siteBridge('preview',f.profile,data,{eye:'OD'}),ready=plan.rows.filter(row=>row.status==='ready');assert.equal(ready.length,2);
  const applied=siteBridge('apply',f.profile,data,{eye:'OD',expected:ready,expectedFrameUrl:f.dom.window.location.href});
  assert.equal(applied.rows.filter(row=>row.status==='filled').length,2);assert.deepEqual(f.snapshot(),{D:true,mm:false,k1:'43.20',k2:'44.10'});
  assert.deepEqual(data,before);assert.deepEqual(f.events,{clicks:1,changes:1,submits:0});
  const again=siteBridge('prepare-input-units',f.profile,data,{eye:'OD'});assert.equal(again.inputUnitPreparation.status,'already-selected');assert.equal(f.events.changes,1);
});

test('read, inspect, and preview never switch mm or expose its radius as a canonical D measurement',t=>{
  const f=fixture(t),before=f.snapshot();
  for(const action of ['inspect','read','preview']){
    const result=siteBridge(action,f.profile,f.source(),{eye:'OD'});assert.equal(result.error,undefined);assert.deepEqual(f.snapshot(),before);
    if(action!=='inspect')for(const row of result.rows){assert.equal(row.status,'unit-required');if(action==='read')assert.equal(row.value,'');}
  }
  assert.deepEqual(f.events,{clicks:0,changes:0,submits:0});
});

test('incomplete, malformed, out-of-range, or reversed source powers cannot clear the website by switching units',t=>{
  const f=fixture(t),invalid=[
    {},{k1:'43.20'},{k1:'43.20',k2:''},{k1:'1',k2:'2'},
    {k1:'NaN',k2:'44.10'},{k1:'43.20',k2:'Infinity'},
    {k1:'43.20 D',k2:'44.10'},{k1:'4.32e1',k2:'44.10'},
    {k1:'19.99',k2:'44.10'},{k1:'43.20',k2:'80.01'},
    {k1:'44.10',k2:'43.20'},
  ];
  for(const values of invalid){
    f.reset();const before=f.snapshot(),data=f.source(values),source=structuredClone(data);
    const result=siteBridge('prepare-input-units',f.profile,data,{eye:'OD'});
    assert.equal(result.inputUnitPreparation.changed,false,JSON.stringify(values));assert.deepEqual(f.snapshot(),before);assert.deepEqual(data,source);
  }
  assert.deepEqual(f.events,{clicks:0,changes:0,submits:0});
});

test('both destinations and the unit pair must accept the complete replacement before native unit switching',t=>{
  const f=fixture(t),changes=[
    {node:f.k1,attribute:'disabled',value:''},
    {node:f.k2,attribute:'readonly',value:''},
    {node:f.k1,attribute:'aria-readonly',value:'true'},
    {node:f.k2,attribute:'aria-disabled',value:'true'},
    {node:f.k1,attribute:'maxlength',value:'3'},
    {node:f.k2,attribute:'pattern',value:'[0-9]{1,2}'},
    {node:f.diopters,attribute:'disabled',value:''},
    {node:f.millimeters,attribute:'readonly',value:''},
  ];
  for(const {node,attribute,value}of changes){
    f.reset();node.setAttribute(attribute,value);const before=f.snapshot();
    const result=siteBridge('prepare-input-units',f.profile,f.source(),{eye:'OD'});
    assert.equal(result.inputUnitPreparation.changed,false,attribute);assert.deepEqual(f.snapshot(),before);node.removeAttribute(attribute);
  }
  assert.deepEqual(f.events,{clicks:0,changes:0,submits:0});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {lensTransferBridge,createLensTransfer} from '../src/lens-transfer.js';

const url='https://calc.example.test/form';
function fixture(t,html,definition={}){
  const dom=new JSDOM(html,{url,runScripts:'outside-only'}),{window}=dom;
  window.HTMLElement.prototype.getClientRects=function(){return this.hidden||this.closest('[hidden],.d-none')||window.getComputedStyle(this).display==='none'?[]:[{width:80,height:20}];};
  const bridge=window.eval(`(${lensTransferBridge.toString()})`);
  const profile={siteId:'synthetic',url,controls:[{id:'primary',control:'native-select',selector:'#lens',parameters:[{key:'aConstant',selector:'#a',unit:'1'}]}],...definition};
  t.after(()=>dom.window.close());
  return {dom,window,profile,call:(action,request={})=>bridge(action,profile,request)};
}
const select={controlId:'primary',value:'EXACT-2',label:'Exact model 2',kind:'model',catalogId:'manufacturer:exact-2'};
const native='<select id="lens"><option value="EXACT-1">Exact model 1</option><option value="EXACT-2">Exact model 2</option></select><input id="a" value="118.1">';

test('serialized bridge reads only scoped lens identities and site parameters without changes',t=>{
  const f=fixture(t,native+'<input id="patient" value="PRIVATE">'),before=f.window.document.body.innerHTML;
  const result=f.call('inspect');assert.equal(result.status,'read');assert.equal(result.controls[0].selected.value,'EXACT-1');
  assert.equal(result.controls[0].parameters[0].value,'118.1');assert.equal(result.controls[0].options.length,2);
  assert.equal(JSON.stringify(result).includes('PRIVATE'),false);assert.equal(f.window.document.body.innerHTML,before);
});
test('a generic constant with no selected lens is never attached to a model source',t=>{
  const f=fixture(t,native.replace('<select id="lens">','<select id="lens"><option value="0" selected>Choose IOL</option>'),{controls:[{id:'primary',control:'native-select',selector:'#lens',emptyValues:['0',''],parameters:[{key:'aConstant',selector:'#a',unit:'1'}]}]});
  const result=f.call('inspect').controls[0];assert.equal(result.selected,null);assert.equal(result.parameters.length,0);
});
test('native selection dispatches normal changes and lets the destination own its constant',t=>{
  const f=fixture(t,native),events=[];f.window.document.querySelector('#lens').addEventListener('input',()=>events.push('input'));
  f.window.document.querySelector('#lens').addEventListener('change',()=>{events.push('change');f.window.document.querySelector('#a').value='119.7';});
  const result=f.call('select',{...select,aConstant:'100',expectedPrevious:{value:'EXACT-1',label:'Exact model 1'}});
  assert.equal(result.status,'selected');assert.deepEqual(events,['input','change']);assert.equal(f.window.document.querySelector('#a').value,'119.7');
  assert.equal(f.call('inspect').controls[0].selected.value,'EXACT-2');
});
test('native duplicate identities, wrong labels, geometry and stale previous choices never write',t=>{
  const f=fixture(t,native.replace('</select>','<option value="EXACT-2">Exact model 2</option></select>'));
  assert.equal(f.call('select',select).status,'manual');assert.equal(f.window.document.querySelector('#lens').value,'EXACT-1');
  f.window.document.querySelector('#lens').value='EXACT-2';assert.equal(f.call('inspect').controls[0].selected,null);
  const g=fixture(t,native);
  for(const value of [{...select,label:'Similar model 2'},{...select,kind:'geometry'},{...select,expectedPrevious:{value:'CHANGED',label:'Changed'}}])assert.equal(g.call('select',value).status,'manual');
  assert.equal(g.window.document.querySelector('#lens').value,'EXACT-1');
});
test('a different document URL and duplicate control locators are rejected',t=>{
  const f=fixture(t,native,{url:'https://calc.example.test/other'});assert.equal(f.call('select',select).status,'target-changed');
  const g=fixture(t,native+native);assert.equal(g.call('inspect').controls[0].status,'ambiguous');assert.equal(g.call('select',select).status,'manual');
});
test('disabled native options and disabled controls preserve current choice',t=>{
  const f=fixture(t,native.replace('value="EXACT-2"','disabled value="EXACT-2"'));assert.equal(f.call('select',select).status,'manual');
  const g=fixture(t,native.replace('<select','<select disabled'));assert.equal(g.call('select',select).status,'manual');
  assert.equal(f.window.document.querySelector('#lens').value,'EXACT-1');assert.equal(g.window.document.querySelector('#lens').value,'EXACT-1');
});

const linkedDefinition={siteId:'synthetic',url,controls:[{id:'primary',control:'linked-select',rootSelector:'.lens-root',rootLabel:'IOL Model',activatorSelector:'.activator',selectedSelector:'.selection',valueMode:'label',optionSelector:'[role="option"]',parameters:[{key:'aConstant',label:'A constant',scopeSelector:'.eye',unit:'1'}]}]};
const linked='<section class="lens-root"><label>IOL Model</label><div class="activator" role="combobox" aria-controls="lens-menu" aria-expanded="false"><span class="selection">Exact model 1</span></div><section class="eye"><label for="a">A constant</label><input id="a" value="118.1"></section></section><div id="lens-menu" role="listbox" hidden><div role="option" data-value="{&quot;name&quot;:&quot;Exact model 1&quot;}">Exact model 1</div><div role="option" data-value="{&quot;name&quot;:&quot;Exact model 2&quot;}">Exact model 2</div></div><div id="unrelated-menu" role="listbox"><div role="option">Exact model 2</div></div>';
const linkedSelection={...select,value:'Exact model 2'};
function bindLinked(f){
  const d=f.window.document,activator=d.querySelector('.activator'),menu=d.querySelector('#lens-menu');
  activator.addEventListener('click',()=>{menu.hidden=false;activator.setAttribute('aria-expanded','true');});
  activator.addEventListener('keydown',event=>{if(event.key==='Escape'){menu.hidden=true;activator.setAttribute('aria-expanded','false');}});
  for(const option of menu.querySelectorAll('[role="option"]'))option.addEventListener('click',()=>{d.querySelector('.selection').textContent=option.textContent;menu.hidden=true;activator.setAttribute('aria-expanded','false');});
}
test('linked menus use their owned listbox and exact labels without writing hidden JSON values',t=>{
  const f=fixture(t,linked,linkedDefinition);bindLinked(f);
  assert.equal(f.call('inspect').controls[0].options.length,0);assert.equal(f.call('open',{controlId:'primary'}).phase,'opened');
  const opened=f.call('inspect').controls[0];assert.equal(opened.options.length,2);assert.equal(opened.options[1].value,'Exact model 2');
  assert.equal(opened.parameters[0].value,'118.1');
  assert.equal(f.call('select',linkedSelection).status,'selected');assert.equal(f.call('inspect').controls[0].selected.label,'Exact model 2');
  assert.equal(f.window.document.querySelector('#unrelated-menu').textContent,'Exact model 2');
});
test('only an explicitly allowed unique unlinked menu may be used by its sole expanded owner',t=>{
  const html=linked.replace('aria-controls="lens-menu"','').replace('<div id="unrelated-menu" role="listbox"><div role="option">Exact model 2</div></div>','');
  const definition=structuredClone(linkedDefinition);Object.assign(definition.controls[0],{allowUnlinkedMenu:true,menuSelector:'#lens-menu'});
  const f=fixture(t,html,definition);bindLinked(f);f.call('open',{controlId:'primary'});assert.equal(f.call('inspect').controls[0].options.length,2);
  const g=fixture(t,html,linkedDefinition);bindLinked(g);g.call('open',{controlId:'primary'});assert.equal(g.call('inspect').controls[0].options.length,0);
});
test('disabled linked controls and submit activators never open a menu',t=>{
  const f=fixture(t,linked.replace('class="activator"','aria-disabled="true" class="activator"'),linkedDefinition);bindLinked(f);assert.equal(f.call('open',{controlId:'primary'}).status,'manual');assert.equal(f.window.document.querySelector('#lens-menu').hidden,true);
  const g=fixture(t,linked.replace('<div class="activator"','<button type="submit" class="activator"').replace('</span></div>','</span></button>'),linkedDefinition);assert.equal(g.call('open',{controlId:'primary'}).status,'manual');
  const h=fixture(t,linked.replace('class="lens-root"','class="lens-root v-input--is-readonly"'),linkedDefinition);assert.equal(h.call('open',{controlId:'primary'}).status,'manual');
  const i=fixture(t,`<section aria-hidden="true">${linked}</section>`,linkedDefinition);assert.equal(i.call('open',{controlId:'primary'}).status,'manual');
});
test('TECNIS family clicks preserve the destination handler and block existing results or unavailable regions',t=>{
  const definition={siteId:'synthetic',url,controls:[{id:'primary',control:'custom-family',kind:'family',selector:'.lens-select a[data-family]',valueAttribute:'data-family',labelSelector:'img[alt]',activatorSelector:'#lensSelect',selectedSelector:'#lens',requireNoResultsSelector:'#results>tr',parameters:[{key:'aConstant',selector:'#a',unit:'1'}]}]};
  const f=fixture(t,'<button id="lensSelect" type="button">Lens</button><div class="lens-select" hidden><a data-family="family-1"><img alt="Family 1"></a><a data-family="family-2"><img alt="Family 2"></a><a class="d-none" data-family="family-3"><img alt="Family 3"></a></div><input id="lens" type="hidden" value="family-1"><input id="a" value="118.1"><table><tbody id="results"></tbody></table>',definition),d=f.window.document;
  d.querySelector('#lensSelect').addEventListener('click',()=>d.querySelector('.lens-select').hidden=false);
  d.querySelector('[data-family="family-2"]').addEventListener('click',()=>{d.querySelector('#lens').value='family-2';d.querySelector('#a').value='119.2';});
  f.call('open',{controlId:'primary'});assert.equal(f.call('select',{controlId:'primary',value:'family-3',label:'Family 3',kind:'family'}).status,'manual');
  assert.equal(f.call('select',{controlId:'primary',value:'family-2',label:'Family 2',kind:'family'}).status,'selected');assert.equal(d.querySelector('#a').value,'119.2');
  d.querySelector('#results').innerHTML='<tr><td>Result</td></tr>';
  assert.equal(f.call('select',{controlId:'primary',value:'family-1',label:'Family 1',kind:'family'}).status,'manual');assert.equal(d.querySelector('#lens').value,'family-2');
});
test('a verified styled select remains operable only with its unique visible plugin owner',t=>{
  const definition={controls:[{id:'primary',control:'native-select',selector:'#lens',allowStyledSelect:true,styledOwnerSelector:'.bootstrap-select',styledActivatorSelector:'button.dropdown-toggle'}]};
  const f=fixture(t,`<div class="bootstrap-select"><button type="button" class="dropdown-toggle">Lens</button>${native.replace('<select','<select style="display:none"')}</div>`,definition);
  assert.equal(f.call('select',select).status,'selected');
  const g=fixture(t,native.replace('<select','<select style="display:none"'),definition);assert.equal(g.call('select',select).status,'manual');
});
test('independent eye scopes keep options, selected models and constants separate',t=>{
  const definition={controls:['OD','OS'].map(eye=>({id:`primary-${eye}`,eye,control:'native-select',scopeSelector:`#${eye}`,selector:'.lens',parameters:[{key:'aConstant',selector:'.constant',unit:'1'}]}))};
  const f=fixture(t,['OD','OS'].map(eye=>`<section id="${eye}"><select class="lens"><option value="EXACT-1">Exact model 1</option><option value="EXACT-2">Exact model 2</option></select><input class="constant" value="${eye==='OD'?'118.1':'119.1'}"></section>`).join(''),definition);
  assert.equal(f.call('select',{...select,controlId:'primary-OS',eye:'OS'}).status,'selected');
  assert.equal(f.window.document.querySelector('#OD select').value,'EXACT-1');assert.equal(f.window.document.querySelector('#OS select').value,'EXACT-2');
  assert.equal(f.call('inspect').controls[0].parameters[0].value,'118.1');assert.equal(f.call('inspect').controls[1].parameters[0].value,'119.1');
});

function service(t,{linkedUi=false,postback=false,missing=false,onSleep=()=>{}}={}){
  const f=fixture(t,linkedUi?linked:native,linkedUi?linkedDefinition:{});if(linkedUi)bindLinked(f);
  if(postback)f.profile.controls[0].navigationExpected=true;
  const tab={id:8,url,status:'complete'},listeners=new Set(),calls=[];let time=0,revision=1,pending=false,documentId='before';
  const event=status=>{tab.status=status;for(const listener of listeners)listener(tab.id,{status},tab);};
  const run=async(_id,action,definition,request)=>{
    calls.push({action,request:structuredClone(request)});
    if(missing&&action==='open'){f.window.document.querySelector('#lens-menu [role="option"]:last-child').remove();}
    const result=f.call(action,request);
    if(postback&&action==='select'&&result.changed){pending=true;event('loading');throw new Error('Execution context was destroyed');}
    return {...result,documentId};
  };
  const engine=createLensTransfer({run,checkedTab:async()=>{if(tab.url!==url)throw Object.assign(new Error('target changed'),{code:'TARGET_CHANGED'});return {tab};},guard:async()=>{if(revision!==1)throw Object.assign(new Error('source changed'),{code:'CASE_CHANGED'});},onUpdated:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},now:()=>time,sleep:async ms=>{time+=ms;if(pending){pending=false;documentId='after';event('complete');}await onSleep({changeSource:()=>revision++,changeTarget:()=>tab.url='https://elsewhere.test/',calls});}});
  return {...f,engine,tab,calls,listeners};
}
test('background sequencing survives a native postback and verifies the new document before finishing',async t=>{
  const f=service(t,{postback:true});const result=await f.engine.prepare(8,f.profile,[select]);
  assert.equal(result.status,'applied');assert.equal(result.navigated,true);assert.equal(result.controls[0].selected.value,'EXACT-2');assert.equal(f.listeners.size,0);assert.equal(f.calls.filter(call=>call.action==='select').length,1);
});
test('lens-dependent parameters must also settle before the helper returns',async t=>{
  const f=fixture(t,native);let time=0;
  const engine=createLensTransfer({run:async(_id,action,_definition,request)=>({...f.call(action,request),documentId:'same'}),checkedTab:async()=>({tab:{id:8,status:'complete'}}),now:()=>time,sleep:async ms=>{time+=ms;if(time===300)f.window.document.querySelector('#a').value='119.7';}});
  const result=await engine.prepare(8,f.profile,[select]);assert.equal(result.controls[0].parameters[0].value,'119.7');assert.ok(time>=650);
});
test('background linked sequencing opens then clicks once and waits for selected readback',async t=>{
  const f=service(t,{linkedUi:true}),result=await f.engine.prepare(8,f.profile,[linkedSelection]);
  assert.equal(result.status,'applied');assert.equal(f.calls.filter(call=>call.action==='open').length,1);assert.equal(f.calls.filter(call=>call.action==='select').length,1);assert.equal(f.window.document.querySelector('.selection').textContent,'Exact model 2');
});
test('an absent exact option remains manual and closes the menu without choosing another model',async t=>{
  const f=service(t,{linkedUi:true,missing:true}),result=await f.engine.prepare(8,f.profile,[linkedSelection]);
  assert.equal(result.status,'partial');assert.equal(result.controls[0].status,'manual');assert.equal(f.window.document.querySelector('.selection').textContent,'Exact model 1');assert.equal(f.window.document.querySelector('#lens-menu').hidden,true);
});
test('source revisions and target navigation abort before a later linked selection',async t=>{
  const f=service(t,{linkedUi:true,onSleep:({changeSource})=>changeSource()});
  // No delay occurs between a synchronous menu open and the first option click;
  // inject a delayed menu so source changes during the opening wait are checked.
  f.window.document.querySelector('.activator').replaceWith(f.window.document.querySelector('.activator').cloneNode(true));
  await assert.rejects(f.engine.prepare(8,f.profile,[linkedSelection],{timeoutMs:500}),{code:'CASE_CHANGED'});assert.equal(f.calls.some(call=>call.action==='select'),false);assert.equal(f.listeners.size,0);
  const g=service(t,{linkedUi:true,onSleep:({changeTarget})=>changeTarget()});g.window.document.querySelector('.activator').replaceWith(g.window.document.querySelector('.activator').cloneNode(true));
  await assert.rejects(g.engine.prepare(8,g.profile,[linkedSelection],{timeoutMs:500}),{code:'TARGET_CHANGED'});assert.equal(g.calls.some(call=>call.action==='select'),false);
});
test('a postback without completion evidence times out instead of falsely passing',async t=>{
  const f=fixture(t,native);f.profile.controls[0].navigationExpected=true;let time=0;
  const engine=createLensTransfer({run:async(_id,action,_definition,request)=>({...f.call(action,request),documentId:'same'}),checkedTab:async()=>({tab:{id:8,status:'complete'}}),now:()=>time,sleep:async ms=>time+=ms});
  await assert.rejects(engine.prepare(8,f.profile,[select],{timeoutMs:500}),{code:'LENS_SWITCH_TIMEOUT'});
});
test('duplicate selections reject before any inspection or write',async()=>{
  let calls=0;const engine=createLensTransfer({run:async()=>{calls++;},checkedTab:async()=>{calls++;}});
  await assert.rejects(engine.prepare(8,{siteId:'synthetic'},[select,select]),{code:'INVALID_LENS_SELECTION'});assert.equal(calls,0);
});
test('two eye sources cannot silently overwrite one shared physical model control',async()=>{
  let calls=0;const engine=createLensTransfer({run:async()=>{calls++;},checkedTab:async()=>{calls++;}});
  const definition={siteId:'synthetic',controls:[{id:'primary',control:'native-select',selector:'#lens'}]};
  await assert.rejects(engine.prepare(8,definition,[{...select,eye:'OD'},{...select,eye:'OS'}]),{code:'INVALID_LENS_SELECTION'});assert.equal(calls,0);
});

test('published grouped options keep their grouped meaning and are selected by exact identity',t=>{
  const definition=structuredClone(linkedDefinition);definition.controls[0].options=[{value:'Exact model 1',label:'Exact model 1',kind:'group',available:true},{value:'Exact model 2',label:'Exact model 2',kind:'group',available:true}];
  const f=fixture(t,linked,definition);bindLinked(f);f.call('open',{controlId:'primary'});
  assert.equal(f.call('inspect').controls[0].options[1].kind,'group');
  assert.equal(f.call('select',{...linkedSelection,kind:'model'}).status,'manual');
  assert.equal(f.call('select',{...linkedSelection,kind:'group'}).status,'selected');
});
test('explicit collection opens and closes a linked menu without selecting or changing the displayed lens',async t=>{
  const f=service(t,{linkedUi:true}),result=await f.engine.collect(8,f.profile);
  assert.equal(result.status,'read');assert.equal(result.changed,false);assert.equal(result.controls[0].options.length,2);
  assert.equal(result.controls[0].selected.label,'Exact model 1');assert.equal(f.window.document.querySelector('#lens-menu').hidden,true);
  assert.equal(f.calls.some(call=>call.action==='select'),false);assert.equal(f.window.document.querySelector('#a').value,'118.1');
});
test('collection refuses to save if a site unexpectedly commits a different choice while opening',async t=>{
  const f=service(t,{linkedUi:true});f.window.document.querySelector('.activator').addEventListener('click',()=>f.window.document.querySelector('.selection').textContent='Exact model 2');
  await assert.rejects(f.engine.collect(8,f.profile),{code:'LENS_READ_CHANGED'});assert.equal(f.calls.some(call=>call.action==='select'),false);
});
test('autocomplete requires an explicit exact option commit even when typed text already matches',async t=>{
  const f=service(t,{linkedUi:true});f.profile.controls[0].requireOptionCommit=true;f.window.document.querySelector('.selection').textContent='Exact model 2';
  const result=await f.engine.prepare(8,f.profile,[linkedSelection]);
  assert.equal(result.status,'applied');assert.equal(f.calls.filter(call=>call.action==='select').length,1);assert.equal(f.calls.filter(call=>call.action==='open').length,1);
});
test('a searchable autocomplete waits for filtered results then commits the exact model',async t=>{
  const definition={controls:[{id:'primary',control:'linked-select',rootSelector:'.autocomplete',rootLabels:['Select IOL'],activatorSelector:'input[role="combobox"]',valueMode:'label',searchInput:true,requireOptionCommit:true}]};
  const f=fixture(t,'<div class="autocomplete"><label for="query">Select IOL</label><input id="query" role="combobox" value="Old model" aria-controls="models"></div><div id="models" role="listbox" hidden><div role="option">Old model</div></div>',definition),d=f.window.document;let time=0,query='',clicks=0;
  d.querySelector('#query').addEventListener('input',()=>query=d.querySelector('#query').value);d.querySelector('#query').addEventListener('click',()=>d.querySelector('#models').hidden=false);
  const engine=createLensTransfer({run:async(_id,action,_definition,request)=>({...f.call(action,request),documentId:'same'}),checkedTab:async()=>({tab:{id:8,status:'complete'}}),now:()=>time,sleep:async ms=>{time+=ms;if(time===300){d.querySelector('#models').innerHTML='<div role="option">Exact model 2</div>';d.querySelector('[role="option"]').addEventListener('click',()=>{clicks++;d.querySelector('#query').value='Exact model 2';d.querySelector('#models').hidden=true;});}}});
  const result=await engine.prepare(8,f.profile,[linkedSelection]);assert.equal(result.status,'applied');assert.equal(query,'Exact model 2');assert.equal(clicks,1);assert.ok(time>=650);
});
test('manufacturer is prepared before its dependent lens despite reversed request order',async t=>{
  const definition={controls:[{id:'maker',role:'manufacturer',control:'native-select',selector:'#maker'},{id:'model',control:'native-select',selector:'#model'}]};
  const f=fixture(t,'<select id="maker"><option value="one">Manufacturer 1</option><option value="two">Manufacturer 2</option></select><select id="model"><option value="old">Old</option></select>',definition),calls=[];let time=0;
  f.window.document.querySelector('#maker').addEventListener('change',()=>f.window.document.querySelector('#model').innerHTML='<option value="old">Old</option><option value="two-model">Model 2</option>');
  const engine=createLensTransfer({run:async(_id,action,_definition,request)=>{if(action==='select')calls.push(request.controlId);return {...f.call(action,request),documentId:'same'};},checkedTab:async()=>({tab:{id:8,status:'complete'}}),now:()=>time,sleep:async ms=>time+=ms});
  const result=await engine.prepare(8,f.profile,[{controlId:'model',value:'two-model',label:'Model 2',kind:'model'},{controlId:'maker',value:'two',label:'Manufacturer 2',kind:'group'}]);
  assert.equal(result.status,'applied');assert.deepEqual(calls,['maker','model']);
});
test('dependent selections resetting a previously selected manufacturer fail final verification',async t=>{
  const definition={controls:[{id:'maker',role:'manufacturer',control:'native-select',selector:'#maker'},{id:'model',control:'native-select',selector:'#model'}]};
  const f=fixture(t,'<select id="maker"><option value="one">Manufacturer 1</option><option value="two">Manufacturer 2</option></select><select id="model"><option value="old">Old</option><option value="new">New</option></select>',definition);let time=0;
  f.window.document.querySelector('#model').addEventListener('change',()=>f.window.document.querySelector('#maker').value='one');
  const engine=createLensTransfer({run:async(_id,action,_definition,request)=>({...f.call(action,request),documentId:'same'}),checkedTab:async()=>({tab:{id:8,status:'complete'}}),now:()=>time,sleep:async ms=>time+=ms});
  await assert.rejects(engine.prepare(8,f.profile,[{controlId:'maker',value:'two',label:'Manufacturer 2',kind:'group'},{controlId:'model',value:'new',label:'New',kind:'model'}]),{code:'LENS_STATE_CHANGED'});
});

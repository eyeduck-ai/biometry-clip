import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {siteBridge} from '../src/bridge.js';
import {lensTransferBridge} from '../src/lens-transfer.js';
import {SITES} from '../src/sites.js';
import {emptyCase} from '../src/model.js';
import {caseFromReadRows} from '../src/transfer.js';
import {createSessionStore} from '../src/session-store.js';
import {createLibraryStore,createLibraryService} from '../src/library-store.js';
import {createTabTransfer} from '../src/tab-transfer.js';
import {DEFAULT_LENS_CATALOG,LENS_DEFINITIONS} from '../src/lens-registry.js';

const memory=()=>{const values={};return {get:async()=>structuredClone(values),set:async patch=>Object.assign(values,structuredClone(patch))};};
const profile=id=>SITES.find(site=>site.id===id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function mount(t,id,html){
  const dom=new JSDOM(html,{url:profile(id).url,runScripts:'outside-only'});
  dom.window.HTMLElement.prototype.getClientRects=function(){return this.hidden||this.closest('[hidden],.d-none')||dom.window.getComputedStyle(this).display==='none'?[]:[{width:80,height:24}];};
  t.after(()=>dom.window.close());return dom;
}
const selectHtml=(id,options,value)=>`<select id="${id}">${options.map(option=>`<option value="${esc(option.value)}" ${option.value===value?'selected':''}>${esc(option.label)}</option>`).join('')}</select>`;
function aliasFor(code,siteId='evo',role='primary'){
  const candidates=DEFAULT_LENS_CATALOG.entries.filter(entry=>entry.modelCode===code&&entry.aliases.some(alias=>alias.siteId===siteId&&(alias.role||'primary')===role));
  assert.equal(candidates.length,1,`one verified canonical ${code} at ${siteId}`);
  return {entry:candidates[0],alias:candidates[0].aliases.find(alias=>alias.siteId===siteId&&(alias.role||'primary')===role)};
}
function sourceData(code='ZCB00',eye='OS'){
  const {entry,alias}=aliasFor(code),data=emptyCase();data.patient.patientId=`SYNTHETIC-LENS-${eye}`;data.activeEye=eye;
  data.eyes[eye]={al:eye==='OS'?'24.10':'23.45',acd:'3.20',k1:'43.20',k2:'44.10',target:'0',aConstant:'100',lvcType:'none',iolSourceSite:'evo',iolSourceControl:alias.controlId||'primary',iolSourceValue:alias.value,iolSourceLabel:alias.label,iolSourceRole:'primary',iolCatalogId:entry.id};
  return data;
}
async function storedHistory(data){
  const transient=memory(),local=memory(),session=createSessionStore(transient),service=createLibraryService(createLibraryStore(local),session);
  const initial=await session.read(),stored=await session.replace(data,initial.caseToken,initial.revision),created=await service.createPatient(data.patient);
  const saved=await service.saveMeasurement({patientId:created.patient.id,label:'SYNTHETIC LENS HISTORY',caseToken:stored.caseToken,revision:stored.revision});
  const restarted=createSessionStore(transient),reloaded=createLibraryService(createLibraryStore(local),restarted),before=await restarted.read();
  const selected=await reloaded.selectMeasurement(created.patient.id,saved.measurement.id,before.caseToken,before.revision);
  return {session:restarted,selected};
}
function transport(t,siteId,dom,session,{postbackControl,sourceChanges=false,lensResetsEye=false,alwaysLensReset=false,eyeResetsLens=false,resetLensDuringModes=false}={}){
  const tab={id:9,url:profile(siteId).url,status:'complete'},listeners=new Set(),calls=[];let time=0,documentId='before',pending=false,submits=0,lensChanges=0,navigations=0,pendingKind='',resetDone=false;
  dom.window.document.querySelector('form')?.addEventListener('submit',event=>{submits++;event.preventDefault();});
  const emit=status=>{tab.status=status;for(const listener of listeners)listener(tab.id,{status},tab);};
  if(postbackControl)dom.window.document.querySelector(postbackControl).addEventListener('change',()=>{lensChanges++;pending=true;pendingKind='lens';emit('loading');});
  if(eyeResetsLens)for(const radio of dom.window.document.querySelectorAll('#RadioButtonRLEye_0,#RadioButtonRLEye_1'))radio.addEventListener('change',()=>{pending=true;pendingKind='eye';emit('loading');});
  const chrome={tabs:{get:async()=>({...tab}),onUpdated:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}},scripting:{executeScript:async({func,args})=>{
    calls.push({func,action:args[0],args:structuredClone(args)});
    if(resetLensDuringModes&&!resetDone&&lensChanges>0&&func===siteBridge&&args[0]==='inspect'){resetDone=true;dom.window.document.querySelector(postbackControl).value='Personal Constant';}
    const injected=dom.window.eval(`(${func.toString()})`),result=await injected(...structuredClone(args));
    if(pending&&(func===lensTransferBridge&&args[0]==='select'||func===siteBridge&&args[0]==='select-eye'))throw new Error('Execution context was destroyed');
    return [{frameId:0,documentId,result}];
  }}};
  const transfer=createTabTransfer(chrome,{readSession:()=>session.read(),now:()=>time,sleep:async ms=>{
    time+=ms;if(pending){pending=false;documentId=`after-${++navigations}`;if(lensResetsEye&&pendingKind==='lens'&&(alwaysLensReset||lensChanges===1))dom.window.document.querySelector('#RadioButtonRLEye_0').checked=true;if(eyeResetsLens&&pendingKind==='eye')dom.window.document.querySelector(postbackControl).value='Standard';emit('complete');if(sourceChanges){const current=await session.read();await session.patch({eyes:{OD:{al:'25.11'}}},current.caseToken);}}
  }});
  return {transfer,calls,listeners,get submits(){return submits;}};
}
function cookeTarget(t){
  const definitions=LENS_DEFINITIONS.cooke,model=definitions.controls.find(control=>control.eye==='OS'),sources=DEFAULT_LENS_CATALOG.sources.filter(source=>source.siteId==='cooke'&&source.controlId===model.id),options=sources.flatMap(source=>source.options);
  const html=`<form><div id="os-iol" role="combobox" aria-controls="model-list" aria-expanded="false">Previous lens</div><div id="model-list" role="listbox" hidden>${options.map(option=>`<div role="option">${esc(option.label)}</div>`).join('')}</div><input id="os-al" value="22"><input id="od-al" value="26"><input id="os-a-constant" value="118.1"></form>`;
  const dom=mount(t,'cooke',html),d=dom.window.document;
  d.querySelector('#os-iol').addEventListener('click',()=>{d.querySelector('#model-list').hidden=false;d.querySelector('#os-iol').setAttribute('aria-expanded','true');});
  for(const node of d.querySelectorAll('[role="option"]'))node.addEventListener('click',()=>{d.querySelector('#os-iol').textContent=node.textContent;d.querySelector('#model-list').hidden=true;d.querySelector('#os-iol').setAttribute('aria-expanded','false');d.querySelector('#os-a-constant').value='119.7';});
  return dom;
}
function barrettTarget(t,id='barrett-universal'){
  const definition=LENS_DEFINITIONS[id],sources=DEFAULT_LENS_CATALOG.sources.filter(source=>source.siteId===id),controls=definition.controls;
  const selectors=controls.map(control=>selectHtml(control.selector.slice(1),sources.find(source=>source.controlId===control.id).options,'Personal Constant')).join('');
  const eyes=id==='barrett-universal'?'<input id="MainContent_Axlength" value="21"><input id="MainContent_Axlength0" value="22">':'<input type="radio" name="eye" id="MainContent_Rad1" checked><input type="radio" name="eye" id="MainContent_Rad2"><input id="MainContent_AxLength" value="21">';
  const dom=mount(t,id,`<form>${selectors}${eyes}<input id="MainContent_Aconstant" value="118.1"><input id="MainContent_LensFactor" value="1.1"><input id="MainContent_AconstantEx" value="118.2"><input id="MainContent_LensFactorEx" value="1.2"></form>`),d=dom.window.document;
  for(const control of controls)d.querySelector(control.selector).addEventListener('change',()=>{d.querySelector(control.role==='exchange'?'#MainContent_AconstantEx':'#MainContent_Aconstant').value='119.7';});
  return dom;
}

test('EVO OS read, saved-history reload and guarded Cooke OS paste retain lens identity and destination constant',async t=>{
  const selectedAlias=aliasFor('ZCB00').alias,source=mount(t,'evo',`<form><input type="radio" name="eye" id="RadioButtonRLEye_0"><input type="radio" name="eye" id="RadioButtonRLEye_1" checked><input id="txtAL" value="24.10"><input id="txtAConstant" value="100">${selectHtml('DropDownIOLModel',[{value:selectedAlias.value,label:selectedAlias.label}],selectedAlias.value)}</form>`);
  const base=source.window.eval(`(${siteBridge.toString()})`)('read',profile('evo'),emptyCase(),{eye:'OS',includeIdentifiers:true});
  const inventory=source.window.eval(`(${lensTransferBridge.toString()})`)('inspect',LENS_DEFINITIONS.evo,{}),lens=inventory.controls.find(control=>control.role==='primary');
  const rows=[...base.rows,...Object.entries({iolSourceSite:'evo',iolSourceControl:lens.controlId,iolSourceRole:lens.role,iolSourceValue:lens.selected.value,iolSourceLabel:lens.selected.label}).map(([key,value])=>({key,value,eye:'OS',status:'read'}))];
  const candidate=caseFromReadRows(rows,'OS',{profile:profile('evo')});candidate.patient.patientId='SYNTHETIC-LENS-READ';
  const saved=await storedHistory(candidate),before=structuredClone(saved.selected.data),target=cookeTarget(t),f=transport(t,'cooke',target,saved.session);
  const result=await f.transfer.quickFill(9,saved.selected.data,{eye:'OS',caseToken:saved.selected.caseToken,revision:saved.selected.revision,includeConstants:false});
  assert.equal(result.lensPreparation.status,'applied');assert.equal(result.lensPreparation.controls.find(control=>control.role==='primary').kind,'group');
  assert.match(target.window.document.querySelector('#os-iol').textContent,/ZCB00/);assert.equal(target.window.document.querySelector('#os-al').value,'24.10');assert.equal(target.window.document.querySelector('#od-al').value,'26');
  assert.equal(target.window.document.querySelector('#os-a-constant').value,'119.7');assert.equal(f.submits,0);assert.deepEqual((await saved.session.read()).data,before);assert.equal(saved.selected.data.eyes.OS.aConstant,'100');
});

test('native Barrett model postback finishes before fresh numeric preview and never copies the source constant',async t=>{
  const saved=await storedHistory(sourceData('ZCB00','OD')),target=barrettTarget(t),f=transport(t,'barrett-universal',target,saved.session,{postbackControl:'#MainContent_IOLModel'});
  const result=await f.transfer.quickFill(9,saved.selected.data,{eye:'OD',caseToken:saved.selected.caseToken,revision:saved.selected.revision,includeConstants:false});
  assert.equal(result.lensPreparation.status,'applied');assert.equal(result.navigated,true);assert.equal(target.window.document.querySelector('#MainContent_Axlength').value,'23.45');assert.equal(target.window.document.querySelector('#MainContent_Axlength0').value,'22');
  assert.equal(target.window.document.querySelector('#MainContent_Aconstant').value,'119.7');assert.ok(f.calls.findIndex(call=>call.func===lensTransferBridge&&call.action==='select')<f.calls.findIndex(call=>call.func===siteBridge&&call.action==='preview'));assert.equal(f.listeners.size,0);
});
test('changing the saved source during lens postback prevents every numeric write',async t=>{
  const saved=await storedHistory(sourceData('ZCB00','OD')),target=barrettTarget(t),f=transport(t,'barrett-universal',target,saved.session,{postbackControl:'#MainContent_IOLModel',sourceChanges:true});
  await assert.rejects(f.transfer.quickFill(9,saved.selected.data,{eye:'OD',caseToken:saved.selected.caseToken,revision:saved.selected.revision}),{code:'CASE_CHANGED'});
  assert.equal(target.window.document.querySelector('#MainContent_Axlength').value,'21');assert.equal(f.calls.some(call=>call.func===siteBridge&&['preview','apply'].includes(call.action)),false);assert.equal(f.listeners.size,0);
});
test('different OU lenses on a shared Barrett preset remain explicit while independent biometry still fills',async t=>{
  const data=sourceData('SN60WF','OD');data.eyes.OS=sourceData('ZCB00','OS').eyes.OS;
  const saved=await storedHistory(data),target=barrettTarget(t),f=transport(t,'barrett-universal',target,saved.session);
  const result=await f.transfer.quickFill(9,saved.selected.data,{eye:'OU',caseToken:saved.selected.caseToken,revision:saved.selected.revision});
  assert.ok(['manual','partial'].includes(result.lensPreparation.status));assert.ok(result.lensPreparation.warnings.length>0);assert.equal(target.window.document.querySelector('#MainContent_IOLModel').value,'Personal Constant');
  assert.equal(target.window.document.querySelector('#MainContent_Axlength').value,'23.45');assert.equal(target.window.document.querySelector('#MainContent_Axlength0').value,'24.10');assert.equal(f.calls.some(call=>call.func===lensTransferBridge&&call.action==='select'),false);
});
test('a normal copied lens targets Rx exchange without changing the implanted lens selector',async t=>{
  const saved=await storedHistory(sourceData('ZCB00','OD')),target=barrettTarget(t,'barrett-rx'),f=transport(t,'barrett-rx',target,saved.session,{postbackControl:'#MainContent_IOLModelEx'});
  const result=await f.transfer.quickFill(9,saved.selected.data,{eye:'OD',caseToken:saved.selected.caseToken,revision:saved.selected.revision});
  assert.equal(result.lensPreparation.status,'applied');assert.equal(target.window.document.querySelector('#MainContent_IOLModel').value,'Personal Constant');assert.match(target.window.document.querySelector('#MainContent_IOLModelEx').value,/ZCB00/);
  assert.equal(result.lensPreparation.controls[0].role,'exchange');assert.equal(target.window.document.querySelector('#MainContent_AconstantEx').value,'119.7');
});


function evoTarget(t){
  const options=DEFAULT_LENS_CATALOG.sources.find(source=>source.siteId==='evo'&&source.controlId==='primary').options;
  const dom=mount(t,'evo',`<form><input type="radio" name="eye" id="RadioButtonRLEye_0" checked><input type="radio" name="eye" id="RadioButtonRLEye_1">${selectHtml('DropDownIOLModel',options,'Standard')}<input id="txtAL" value="22"><input id="txtAConstant" value="118.1"></form>`);
  dom.window.document.querySelector('#DropDownIOLModel').addEventListener('change',()=>dom.window.document.querySelector('#txtAConstant').value='119.7');return dom;
}
test('lens postback resetting OS is recovered once, including the model lost on eye restoration',async t=>{
  const saved=await storedHistory(sourceData('ZCB00','OS')),target=evoTarget(t),f=transport(t,'evo',target,saved.session,{postbackControl:'#DropDownIOLModel',lensResetsEye:true,eyeResetsLens:true});
  const result=await f.transfer.quickFill(9,saved.selected.data,{eye:'OS',caseToken:saved.selected.caseToken,revision:saved.selected.revision});
  assert.equal(result.lensPreparation.status,'applied');assert.equal(target.window.document.querySelector('#RadioButtonRLEye_1').checked,true);assert.equal(target.window.document.querySelector('#DropDownIOLModel').value,'ZCB00');assert.equal(target.window.document.querySelector('#txtAL').value,'24.10');assert.equal(f.calls.filter(call=>call.func===lensTransferBridge&&call.action==='select').length,2);
});
test('a repeating lens-eye reset cycle stops before numeric writes instead of filling the wrong eye',async t=>{
  const saved=await storedHistory(sourceData('ZCB00','OS')),target=evoTarget(t),f=transport(t,'evo',target,saved.session,{postbackControl:'#DropDownIOLModel',lensResetsEye:true,alwaysLensReset:true,eyeResetsLens:true});
  await assert.rejects(f.transfer.quickFill(9,saved.selected.data,{eye:'OS',caseToken:saved.selected.caseToken,revision:saved.selected.revision}),{code:'LENS_EYE_CYCLE'});assert.equal(target.window.document.querySelector('#txtAL').value,'22');assert.equal(f.calls.filter(call=>call.func===lensTransferBridge&&call.action==='select').length,2);
});
test('explicitly excluding lens selection leaves the target lens intact while numerical fields still fill',async t=>{
  const saved=await storedHistory(sourceData('ZCB00','OD')),target=barrettTarget(t),f=transport(t,'barrett-universal',target,saved.session);
  const result=await f.transfer.quickFill(9,saved.selected.data,{eye:'OD',includeLens:false,caseToken:saved.selected.caseToken,revision:saved.selected.revision});assert.equal(result.lensPreparation.status,'skipped');assert.equal(target.window.document.querySelector('#MainContent_IOLModel').value,'Personal Constant');assert.equal(target.window.document.querySelector('#MainContent_Axlength').value,'23.45');assert.equal(f.calls.some(call=>call.func===lensTransferBridge),false);
});

test('mode or framework updates losing an accepted lens stop the numerical fill',async t=>{
  const saved=await storedHistory(sourceData('ZCB00','OD')),target=barrettTarget(t),f=transport(t,'barrett-universal',target,saved.session,{postbackControl:'#MainContent_IOLModel',resetLensDuringModes:true});
  await assert.rejects(f.transfer.quickFill(9,saved.selected.data,{eye:'OD',caseToken:saved.selected.caseToken,revision:saved.selected.revision}),{code:'LENS_STATE_CHANGED'});assert.equal(target.window.document.querySelector('#MainContent_Axlength').value,'21');assert.equal(f.calls.some(call=>call.func===siteBridge&&call.action==='apply'),false);
});

test('ESCRS prepares the explicit Toric filter before finding ZCU, then fills OD without changing OS',async t=>{
  const entry=DEFAULT_LENS_CATALOG.entries.find(item=>item.modelCode==='ZCU'&&item.aliases.some(alias=>alias.siteId==='escrs'&&alias.controlId==='OD.model'));
  assert.ok(entry,'published ESCRS Toric ZCU family exists');
  const alias=entry.aliases.find(item=>item.siteId==='escrs'&&item.controlId==='OD.model'),data=emptyCase();data.patient.patientId='SYNTHETIC-ESCRS-TORIC';
  data.eyes.OD={al:'23.45',toric:true,lvcType:'none',iolSourceSite:'escrs',iolSourceControl:alias.controlId,iolSourceManufacturer:alias.manufacturer,iolSourceRole:'primary',iolSourceValue:alias.value,iolSourceLabel:alias.label,iolCatalogId:entry.id};
  const eyeHtml=eye=>`<div class="mud-grid-item"><label for="${eye}-toric">Toric</label><input type="checkbox" id="${eye}-toric"><label for="${eye}-kc">Keratoconus</label><input type="checkbox" id="${eye}-kc"><label for="${eye}-argos">Argos (SoS) AL</label><input type="checkbox" id="${eye}-argos"><label for="${eye}-lvc">Post LASIK/PRK/RK</label><input type="checkbox" id="${eye}-lvc"><div class="mud-input-control"><label>Manufacturer</label><div role="combobox" aria-label="Manufacturer" aria-controls="${eye}-makers">${esc(alias.manufacturer)}</div></div><div class="mud-input-control"><label for="${eye}-model">Select IOL</label><input id="${eye}-model" role="combobox" aria-autocomplete="list" aria-controls="${eye}-models" value="${eye==='OD'?'Previous normal lens':'OS preserved lens'}"></div><label for="${eye}-al">AL</label><input id="${eye}-al" value="${eye==='OD'?'21':'26'}">${[['barrett','Barrett A-Constant'],['cooke','Cooke A-Constant'],['evo','EVO A-Constant'],['hill','Hill-RBF A-Constant'],['hoffer','Hoffer® pACD'],['kane','Kane A-Constant'],['dgs','Pearl DGS A-Constant']].map(([key,label])=>`<label for="${eye}-${key}">${label}</label><input id="${eye}-${key}" value="118.1">`).join('')}</div>`;
  const dom=mount(t,'escrs',`<form><div class="mud-grid mud-grid-spacing-xs-6 noprint">${eyeHtml('OD')}${eyeHtml('OS')}</div>${['OD','OS'].map(eye=>`<div id="${eye}-models" role="listbox" hidden></div><div id="${eye}-makers" role="listbox" hidden><div role="option">${esc(alias.manufacturer)}</div></div>`).join('')}</form>`),d=dom.window.document,events=[];
  for(const eye of ['OD','OS']){
    const input=d.querySelector(`#${eye}-model`),menu=d.querySelector(`#${eye}-models`),toric=d.querySelector(`#${eye}-toric`);
    const render=()=>{
      const list=toric.checked?['ZCU']:['ZCB00'];
      menu.innerHTML=list.filter(label=>!input.value||label.includes(input.value)).map(label=>`<div role="option">${label}</div>`).join('');
      for(const option of menu.querySelectorAll('[role="option"]'))option.addEventListener('click',()=>{events.push(`model:${eye}:${option.textContent}`);input.value=option.textContent;menu.hidden=true;d.querySelector(`#${eye}-barrett`).value='119.7';});
    };
    toric.addEventListener('change',()=>{events.push(`mode:${eye}:${toric.checked}`);input.value='';menu.hidden=true;render();});
    input.addEventListener('input',render);input.addEventListener('click',()=>{render();menu.hidden=false;});input.addEventListener('keydown',event=>{if(event.key==='Escape')menu.hidden=true;});
  }
  const saved=await storedHistory(data),f=transport(t,'escrs',dom,saved.session);
  const result=await f.transfer.quickFill(9,saved.selected.data,{eye:'OD',caseToken:saved.selected.caseToken,revision:saved.selected.revision});
  assert.equal(result.lensPreparation.status,'applied');assert.equal(result.preLensModePreparation.controls.find(control=>control.key==='toric').status,'applied');
  assert.equal(d.querySelector('#OD-toric').checked,true);assert.equal(d.querySelector('#OD-model').value,'ZCU');assert.equal(d.querySelector('#OD-al').value,'23.45');assert.equal(d.querySelector('#OD-barrett').value,'119.7');
  assert.equal(d.querySelector('#OS-toric').checked,false);assert.equal(d.querySelector('#OS-model').value,'OS preserved lens');assert.equal(d.querySelector('#OS-al').value,'26');assert.equal(d.querySelector('#OS-barrett').value,'118.1');
  assert.ok(events.indexOf('mode:OD:true')<events.indexOf('model:OD:ZCU'));assert.equal(events.some(value=>value.includes(':OS:')),false);assert.deepEqual((await saved.session.read()).data,saved.selected.data);
});

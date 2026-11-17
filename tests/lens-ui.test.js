import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {lensMarkup,lensPatchFromEntry,lensPatchFromSource,updateLensControls} from '../src/lens-ui.js';

const at='2026-11-15T00:00:00.000Z';
const alias=(overrides={})=>({siteId:'escrs',controlId:'OD.model',manufacturer:'Alcon',role:'primary',value:'SN60WF',label:'AcrySof IQ SN60WF',evidenceUrl:'https://iolcalculator.escrs.org/',verifiedAt:at,...overrides});
const entry=(overrides={})=>({id:'model:alcon:sn60wf',manufacturer:'Alcon',modelCode:'SN60WF',name:'AcrySof IQ',kind:'model',aliases:[alias()],...overrides});
const source=(overrides={})=>({siteId:'escrs',controlId:'OD.model',eye:'OD',manufacturer:'Alcon',role:'primary',selected:{value:'SN60WF',label:'AcrySof IQ SN60WF',kind:'model'},options:[{value:'SN60WF',label:'AcrySof IQ SN60WF',kind:'model',available:true}],...overrides});
const doc=props=>new JSDOM(lensMarkup(props)).window.document;
const selection=result=>result.eyes.OD||result.eyes.OS;

test('canonical choice prefers the verified ESCRS eye and matching maker, keeping full context',()=>{
  const value=entry({aliases:[alias({siteId:'other',controlId:'primary'}),alias({controlId:'OD.model',manufacturer:'Another Maker'}),alias({controlId:'OS.model'}),alias()]});
  assert.equal(lensPatchFromEntry(value,'OD').eyes.OD.iolSourceControl,'OD.model');
  const os=lensPatchFromEntry(value,'OS').eyes.OS;
  assert.equal(os.iolSourceControl,'OS.model');assert.equal(os.iolSourceManufacturer,'Alcon');assert.equal(os.iolSourceRole,'primary');assert.equal(os.iolCatalogId,value.id);
});

test('canonical choice rejects unverified evidence and explicitly clears missing context',()=>{
  const value=entry({aliases:[alias({verifiedAt:'yesterday'}),alias({evidenceUrl:'http://example.test/'}),alias({evidenceUrl:'https://example.test/?patient=ID'}),alias({siteId:'beta',controlId:undefined,manufacturer:undefined,role:undefined})]});
  assert.deepEqual(selection(lensPatchFromEntry(value,'OD')),{iolSourceSite:'beta',iolSourceValue:'SN60WF',iolSourceLabel:'AcrySof IQ SN60WF',iolSourceControl:'',iolSourceManufacturer:'',iolSourceRole:'primary',iolCatalogId:value.id});
  assert.throws(()=>lensPatchFromEntry(entry({aliases:[]}), 'OD'),/已核對/);
  assert.throws(()=>lensPatchFromEntry(entry({kind:'geometry'}),'OD'),/已核對/);
  assert.throws(()=>lensPatchFromEntry(entry(),'OU'),/OD 或 OS/);
});

test('canonical fallback retains an explicit implanted role instead of silently changing it',()=>{
  const value=entry({aliases:[alias({siteId:'barrett-rx',controlId:'implanted',role:'implanted'})]});
  assert.equal(selection(lensPatchFromEntry(value,'OD')).iolSourceRole,'implanted');
});

test('source identity requires exact control, manufacturer and role with one canonical match',()=>{
  const catalog={entries:[entry()]},raw=source();
  assert.equal(selection(lensPatchFromSource(raw,'OD',catalog)).iolCatalogId,entry().id);
  for(const overrides of [{controlId:'OS.model'},{manufacturer:undefined},{manufacturer:'Bausch + Lomb'},{role:'implanted'}])assert.equal(selection(lensPatchFromSource({...raw,...overrides},'OD',catalog)).iolCatalogId,'');
  assert.equal(selection(lensPatchFromSource(raw,'OD',{entries:[entry(),entry({id:'duplicate'})]})).iolCatalogId,'');
  assert.equal(selection(lensPatchFromSource(raw,'OD',{entries:[entry({aliases:[alias(),alias()]})]})).iolCatalogId,entry().id);
  assert.equal(selection(lensPatchFromSource(source({manufacturer:'ALCON'}),'OD',catalog)).iolCatalogId,entry().id);
});

test('group and geometry sources never acquire a specific model identity',()=>{
  const grouped={value:'AcrySof group',label:'SN60WF / SA60AT',kind:'group'},raw=source({selected:grouped,options:[{...grouped,available:true}]});
  const model=entry({aliases:[alias({value:grouped.value,label:grouped.label})]});
  assert.equal(selection(lensPatchFromSource(raw,'OD',{entries:[model]})).iolCatalogId,'');
  const group=entry({id:'group:alcon:pair',kind:'group',aliases:[alias({value:grouped.value,label:grouped.label})]});
  assert.equal(selection(lensPatchFromSource(raw,'OD',{entries:[group,model]})).iolCatalogId,group.id);
  const geometry=source({selected:{value:'Standard',label:'Standard',kind:'geometry'},options:[]});
  assert.equal(selection(lensPatchFromSource(geometry,'OD',{entries:[model]})).iolCatalogId,'');
});

test('source rejects a different eye, absent or ambiguous selection, placeholders and manufacturer roles',()=>{
  for(const raw of [source({eye:'OS'}),source({selected:null}),source({role:'manufacturer'}),source({options:[...source().options,...source().options]}),source({selected:{value:'0',label:'IOL Type',kind:'model'},options:[]})])assert.throws(()=>lensPatchFromSource(raw,'OD',{entries:[]}),/目前眼別/);
  for(const label of ['-- Select IOL --','Choose an IOL model','Please select a lens','請選擇晶體'])assert.throws(()=>lensPatchFromSource(source({selected:{value:'empty',label,kind:'model'},options:[]}),'OD',{entries:[]}),/目前眼別/);
  const shared=source({eye:'shared',controlId:undefined,manufacturer:undefined,role:undefined,options:[]});
  assert.equal(lensPatchFromSource(shared,'OS',{entries:[]}).eyes.OS.iolSourceControl,'');
  assert.equal(lensPatchFromSource(shared,'OS',{entries:[]}).eyes.OS.iolSourceManufacturer,'');
  assert.equal(lensPatchFromSource(shared,'OS',{entries:[]}).eyes.OS.iolSourceRole,'primary');
});

test('source picker retains original inventory indexes, filters eye/placeholder/geometry, and never defaults to Rx',()=>{
  const primary=source(),implanted=source({siteId:'barrett-rx',role:'implanted'}),exchange=source({siteId:'barrett-rx',role:'exchange',eye:'shared'});
  const inventory={snapshots:[source({eye:'OS'}),primary,source({role:'manufacturer'}),implanted,source({selected:null}),exchange,source({selected:{value:'Standard',label:'Standard',kind:'geometry'},options:[]})]};
  const d=doc({eye:'OD',inventory,catalog:{entries:[]}}),picker=d.querySelector('#lens-source-picker');
  assert.deepEqual([...picker.options].map(option=>option.value),['','1','3','5']);assert.equal(picker.value,'');
  assert.match(picker.options[2].textContent,/已植入晶體/);assert.match(picker.options[3].textContent,/共用.*換片晶體/);
  assert.equal(doc({inventory:{snapshots:[source({selected:null})]}}).querySelector('#lens-source-picker').disabled,true);
});

test('canonical picker prioritizes models, caps at 100, and preserves a selected ID during search',()=>{
  const all=[entry({id:'group',kind:'group'}),...Array.from({length:105},(_,index)=>entry({id:`model-${index}`,modelCode:`MODEL-${index}`}))];
  const d=doc({eye:'OD',catalog:{entries:all},data:{eyes:{OD:{iolCatalogId:'group'}}}}),picker=d.querySelector('#lens-picker');
  assert.equal(picker.options.length,101);assert.equal(picker.value,'group');assert.equal(picker.options[2].value,'model-0');
  const searched=doc({eye:'OD',catalog:{entries:all},search:'model-104',data:{eyes:{OD:{iolCatalogId:'group'}}}});
  assert.deepEqual([...searched.querySelector('#lens-picker').options].map(option=>option.value),['','group','model-104']);
  assert.equal(searched.querySelector('#lens-section').open,true);
  assert.equal(doc({catalog:{entries:[entry()]},search:'alcon'}).querySelector('#lens-picker').options.length,2);
  assert.equal(doc({catalog:{entries:[entry()]},search:'acrysof'}).querySelector('#lens-picker').options.length,2);
});

test('unknown current IDs stay visible and all report/catalog/search text is escaped',()=>{
  const injection='\"><img src=x onerror="globalThis.leak()">';
  const data={eyes:{OD:{iolCatalogId:'old-id',iolSourceLabel:injection}}},catalog={entries:[entry({id:injection,name:injection})]};
  const d=doc({data,catalog,search:injection});
  assert.equal(d.querySelectorAll('img,script').length,0);assert.equal(d.querySelector('#lens-search').value,injection);
  assert.equal(d.querySelector('#lens-picker').value,'old-id');assert.match(d.querySelector('summary').textContent,/img src=x/);
  assert.equal(d.querySelector('[data-action="clear-lens"]').type,'button');
  for(const control of d.querySelectorAll('input,select'))assert.ok(d.querySelector(`label[for="${control.id}"]`));
});

test('zero-valued real model is accepted and rendering/patching never mutates input objects',()=>{
  const raw=source({selected:{value:'0',label:'Real Zero Model',kind:'model'},options:[]}),catalog={entries:[entry()]},before=structuredClone({raw,catalog});
  assert.equal(selection(lensPatchFromSource(raw,'OD',catalog)).iolSourceValue,'0');
  lensMarkup({inventory:{snapshots:[raw]},catalog});lensPatchFromEntry(catalog.entries[0],'OD');
  assert.deepEqual({raw,catalog},before);
});

test('a canonical-only saved choice has a visible summary and explicit expansion is retained',()=>{
  const value=entry(),d=doc({catalog:{entries:[value]},data:{eyes:{OD:{iolCatalogId:value.id}}},open:true});
  assert.match(d.querySelector('summary').textContent,/Alcon.*AcrySof IQ.*SN60WF/);
  assert.equal(d.querySelector('#lens-picker').value,value.id);
  assert.equal(d.querySelector('#lens-section').open,true);
  assert.equal(doc({catalog:{entries:[value]},search:'SN60WF',open:false}).querySelector('#lens-section').open,false);
});

test('search refresh preserves the focused input, composition state, selection and expanded section',()=>{
  const value=entry(),d=doc({catalog:{entries:[value]},open:true}),section=d.querySelector('#lens-section'),field=d.querySelector('#lens-search');
  field.focus();field.value='SN';field.setSelectionRange(1,1);
  field.dispatchEvent(new d.defaultView.CompositionEvent('compositionstart',{data:'S'}));
  updateLensControls(section,{catalog:{entries:[value]},search:'SN'});
  assert.equal(d.querySelector('#lens-search'),field);
  assert.equal(d.activeElement,field);assert.equal(field.value,'SN');assert.equal(field.selectionStart,1);
  assert.equal(section.open,true);assert.equal(d.querySelector('#lens-picker').options.length,2);
  assert.equal(d.querySelector('#lens-picker').value,'');
  updateLensControls(section,{catalog:{entries:[value]},search:'無此晶體'});
  assert.equal(d.querySelector('#lens-search'),field);assert.equal(d.querySelector('#lens-picker').options.length,1);
  assert.equal(d.querySelector('[data-lens-count]').textContent,'0 項');
});

test('refreshing multiple search results never auto-selects a model, group or source role',()=>{
  const model=entry(),group=entry({id:'group:alcon:sn60wf',kind:'group'}),inventory={snapshots:[source(),source({siteId:'barrett-rx',role:'exchange',eye:'shared'})]};
  const d=doc({catalog:{entries:[model,group]},inventory,open:true}),section=d.querySelector('#lens-section');
  updateLensControls(section,{catalog:{entries:[model,group]},inventory,search:'SN60WF'});
  assert.equal(d.querySelector('#lens-picker').options.length,3);
  assert.equal(d.querySelector('#lens-picker').value,'');
  assert.equal(d.querySelector('#lens-source-picker').value,'');
  assert.equal(d.querySelector('#lens-picker').selectedIndex,0);
  assert.match(d.querySelector('#lens-section summary').textContent,/尚未選擇/);
  updateLensControls(section,{catalog:{entries:[model,group]},inventory,search:'SN60WF',data:{eyes:{OD:{iolCatalogId:model.id}}}});
  assert.equal(d.querySelector('#lens-picker').value,model.id);
  assert.equal(d.querySelector('#lens-source-picker').value,'');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {LENS_SOURCE_DEFINITIONS,lensSourcesBridge,buildLensReadRows,exportLensCatalogDocument,parseLensCatalogDocument,resolveLensSelection} from '../src/lens-catalog.js';

const now='2026-11-15T00:00:00.000Z';
const htmls={evo:await readFile(new URL('./fixtures/lens-sources/evo-regular.html',import.meta.url),'utf8'),'evo-toric':await readFile(new URL('./fixtures/lens-sources/evo-toric.html',import.meta.url),'utf8'),'tecnis-toric':await readFile(new URL('./fixtures/lens-sources/tecnis-calculator.html',import.meta.url),'utf8')};
function fixture(t,id,html=htmls[id],url=LENS_SOURCE_DEFINITIONS[id].url){
  const dom=new JSDOM(html,{url}),keys=['document','location','getComputedStyle'],saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='getComputedStyle'?dom.window.getComputedStyle.bind(dom.window):dom.window[key]});
  dom.window.HTMLElement.prototype.getClientRects=function(){return this.hidden||this.type==='hidden'||this.classList.contains('d-none')||this.style.display==='none'?[]:[{x:0,y:0,width:80,height:24}];};
  t.after(()=>{for(const [key,descriptor]of saved)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];dom.window.close();});
  return {doc:dom.window.document,read:()=>lensSourcesBridge(LENS_SOURCE_DEFINITIONS[id])};
}
const opt=(value,label,kind='model')=>({value,label,kind,available:true});
function snapshot(siteId,value,label,kind='model'){return {siteId,status:'read',url:`https://${siteId}.example/calculator`,capturedAt:now,control:'native-select',options:[opt(value,label,kind)],selected:{value,label,kind},parameters:[{key:'aConstant',value:'118.7',unit:'1',sourceControl:'#aConstant'}],navigationExpected:true};}
function document(){return exportLensCatalogDocument([snapshot('alpha','M1','Model M1'),snapshot('beta','lens-9','M1 beta')],{now,entries:[{id:'maker:model:m1',manufacturer:'Maker',modelCode:'M1',name:'Model M1',kind:'model',aliases:[{siteId:'alpha',value:'M1',label:'Model M1',evidenceUrl:'https://alpha.example/calculator',verifiedAt:now},{siteId:'beta',value:'lens-9',label:'M1 beta',evidenceUrl:'https://beta.example/calculator',verifiedAt:now}]}]});}
const selection={iolSourceSite:'alpha',iolSourceValue:'M1',iolSourceLabel:'Model M1',iolCatalogId:'maker:model:m1'};

for(const [id,count,selector]of [['evo',33,'#DropDownIOLModel'],['evo-toric',29,'#DropDownToric']])test(`official ${id} source exposes ${count} options without selecting or submitting`,t=>{
  const f=fixture(t,id);let events=0;f.doc.querySelector(selector).addEventListener('change',()=>events++);f.doc.addEventListener('submit',()=>events++);
  const before=f.doc.querySelector(selector).value,result=f.read();assert.equal(result.status,'read');assert.equal(result.options.length,count);assert.equal(result.selected.value,before);assert.equal(result.navigationExpected,true);assert.equal(events,0);assert.equal(f.doc.querySelector(selector).value,before);
  assert.equal(result.options.find(option=>option.value==='Tecnis').kind,'family');assert.equal(result.selected.kind,'geometry');
});

test('read native selected model with site-scoped current constants and shared rows only for both-eye profiles',t=>{
  const f=fixture(t,'evo');f.doc.querySelector('#DropDownIOLModel').value='ZCB00';f.doc.querySelector('#txtAConstant').value='119.3';const result=f.read();
  assert.equal(result.selected.label,'J&J ZCB00');assert.deepEqual(result.parameters,[{key:'aConstant',value:'119.3',unit:'1',sourceControl:'#txtAConstant'}]);
  assert.deepEqual(buildLensReadRows({id:'evo',eyeMode:'single'},result,'OS').map(row=>[row.eye,row.key,row.value]),[['OS','iolSourceSite','evo'],['OS','iolSourceValue','ZCB00'],['OS','iolSourceLabel','J&J ZCB00']]);
  assert.equal(buildLensReadRows({id:'evo',eyeMode:'both'},result,'OU').every(row=>row.eye==='shared'),true);assert.deepEqual(buildLensReadRows({id:'different'},result,'OD'),[]);
});

test('native duplicate select or duplicate selected option is ambiguous and emits no selected rows',t=>{
  const f=fixture(t,'evo');const select=f.doc.querySelector('#DropDownIOLModel');select.value='ZCB00';const duplicate=select.querySelector('option[value="ZCB00"]').cloneNode(true);select.append(duplicate);
  assert.equal(f.read().selected,null);assert.deepEqual(buildLensReadRows({id:'evo'},f.read(),'OD'),[]);f.doc.body.append(select.cloneNode(true));assert.equal(f.read().status,'unavailable');
});

test('TECNIS captures published families separately from calculated toric models without clicking',t=>{
  const f=fixture(t,'tecnis-toric');let clicks=0;f.doc.addEventListener('click',()=>clicks++);f.doc.querySelector('#lens').value='Eyhance-II-Simplicity';f.doc.querySelector('#constantFactor').value='119.3';f.doc.querySelector('#constantFactorLabel').textContent='A-constant';
  const result=f.read();assert.equal(result.status,'read');assert.equal(result.options.length,16);assert.equal(result.selected.kind,'family');assert.equal(result.selected.label,'Eyhance II Simplicity DIU');assert.equal(result.options.every(option=>option.kind==='family'&&!option.available),true);assert.equal(result.parameters[0].method,'A-constant');assert.equal(clicks,0);
});

test('wrong URL or invisible native lens selector cannot be read',t=>{
  const f=fixture(t,'evo',htmls.evo,'https://www.evoiolcalculator.com/Toric.aspx');assert.equal(f.read().status,'unavailable');
});

test('snapshot catalog roundtrips selections and retains site constants inside the source snapshot',()=>{
  const value=document(),loaded=parseLensCatalogDocument(JSON.stringify(value));assert.deepEqual(loaded,value);assert.equal(loaded.sources[0].parameters[0].value,'118.7');assert.equal(loaded.entries[0].aliases[1].value,'lens-9');assert.equal(Object.hasOwn(loaded.entries[0],'aConstant'),false);
});

test('explicit matching aliases resolve exactly and never return site constants',()=>{
  const result=resolveLensSelection(selection,'beta',document(),snapshot('beta','lens-9','M1 beta'));assert.equal(result.status,'ready');assert.equal(result.catalogId,'maker:model:m1');assert.equal(result.navigationExpected,true);assert.equal(result.canonicalId,'maker:model:m1');assert.equal(result.precision,'model');assert.deepEqual(Object.keys(result).sort(),['canonicalId','catalogId','kind','label','navigationExpected','precision','role','siteId','status','value']);
});

test('similar labels or family names do not produce cross-site lens matches',()=>{
  const value=exportLensCatalogDocument([snapshot('alpha','M1','Tecnis'),snapshot('beta','M2','TECNIS')],{now});assert.equal(resolveLensSelection({iolSourceSite:'alpha',iolSourceValue:'M1',iolSourceLabel:'Tecnis'},'beta',value,snapshot('beta','M2','TECNIS')).status,'manual');
});

test('same-site exact native option remains resolvable without cross-site aliases',()=>{
  const live=snapshot('alpha','M1','Model M1'),value=exportLensCatalogDocument([live],{now});assert.equal(resolveLensSelection({...selection,iolCatalogId:''},'alpha',value,live).status,'ready');
});

test('stale label, duplicate target values, disabled options, wrong catalog ID and geometry remain manual',()=>{
  for(const mutate of [live=>live.options[0].label='Changed',live=>live.options.push({...live.options[0]}),live=>live.options[0].available=false,live=>live.options[0].kind='geometry',live=>live.options[0].kind='family']){const live=snapshot('beta','lens-9','M1 beta');mutate(live);assert.equal(resolveLensSelection(selection,'beta',document(),live).status,'manual');}
  assert.equal(resolveLensSelection({...selection,iolCatalogId:'different'},'beta',document(),snapshot('beta','lens-9','M1 beta')).status,'manual');
  const wrongSource=document();wrongSource.sources[0].options[0].kind='family';wrongSource.sources[0].selected.kind='family';assert.equal(resolveLensSelection(selection,'beta',wrongSource,snapshot('beta','lens-9','M1 beta')).status,'manual');
});

test('catalog rejects conflicting aliases, forged selection and unexpected secret fields',()=>{
  const ambiguous=document();ambiguous.entries.push({...structuredClone(ambiguous.entries[0]),id:'other'});assert.throws(()=>parseLensCatalogDocument(ambiguous),/多個對照/);
  const forged=document();forged.sources[0].selected.value='other';assert.throws(()=>parseLensCatalogDocument(forged),/唯一對應/);
  const secret=document();secret.apiKey='not-allowed';assert.throws(()=>parseLensCatalogDocument(secret),/結構/);
  const wrongType=document();wrongType.entries[0].aliases[0].evidenceUrl='https://alpha.example/calculator?patient=123';assert.throws(()=>parseLensCatalogDocument(wrongType),/個人資料/);
});

test('source captures no nonnumeric constant, query string or patient input',t=>{
  const f=fixture(t,'evo');f.doc.querySelector('#DropDownIOLModel').value='ZCB00';f.doc.querySelector('#txtAConstant').value='not a number';f.doc.body.insertAdjacentHTML('beforeend','<input id="patient" value="SYNTHETIC ID">');
  const result=f.read();assert.deepEqual(result.parameters,[]);assert.equal(JSON.stringify(result).includes('SYNTHETIC ID'),false);assert.equal(result.url,'https://www.evoiolcalculator.com/Calculator.aspx');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_LENS_CATALOG as catalog,LENS_DEFINITIONS,canonicalLensId,manufacturerKey,modelCodeKey,mergeLensCatalog,planLensSelections} from '../src/lens-registry.js';
import {parseLensCatalogDocument} from '../src/lens-catalog.js';

const now='2026-11-15T00:00:00.000Z';
const exact=(manufacturer,code)=>catalog.entries.find(entry=>entry.kind==='model'&&manufacturerKey(entry.manufacturer)===manufacturerKey(manufacturer)&&modelCodeKey(entry.modelCode)===modelCodeKey(code));
const source=(entry,siteId,extra={})=>{const alias=entry.aliases.find(alias=>alias.siteId===siteId);assert.ok(alias,`${entry.modelCode}: ${siteId} source`);return {iolCatalogId:entry.id,iolSourceSite:alias.siteId,iolSourceValue:alias.value,iolSourceLabel:alias.label,...(alias.controlId?{iolSourceControl:alias.controlId}:{}),...(alias.manufacturer?{iolSourceManufacturer:alias.manufacturer}:{}),...(alias.role?{iolSourceRole:alias.role}:{}),...extra};};
const caseFor=(entry,other=entry)=>({activeEye:'OD',eyes:{OD:{iolCatalogId:entry.id},OS:{iolCatalogId:other.id}}});
const plan=(data,siteId,options={},inventory={})=>planLensSelections(data,siteId,inventory,options);
const selection=(entry,siteId)=>plan(caseFor(entry),siteId).selections.find(item=>item.role!=='manufacturer');

test('the packaged registry is strict JSON with 15 calculator definitions and evidenced sources',()=>{
  assert.deepEqual(parseLensCatalogDocument(JSON.stringify(catalog)),catalog);
  assert.equal(Object.keys(LENS_DEFINITIONS).length,15);
  for(const siteId of Object.keys(LENS_DEFINITIONS)){
    assert.ok(catalog.sources.some(source=>source.siteId===siteId),`${siteId}: source`);
    for(const control of LENS_DEFINITIONS[siteId].controls)assert.ok(control.options?.length,`${siteId}/${control.id}: published options`);
  }
  assert.ok(catalog.entries.length>500);
});

test('one exact SN60WF joins ESCRS, APACRS, EVO, Kane and DGS while K6 remains a group projection',()=>{
  const entry=exact('Alcon','SN60WF');assert.ok(entry);
  for(const siteId of ['escrs','barrett-universal','evo','kane','solver-regular'])assert.ok(entry.aliases.some(alias=>alias.siteId===siteId),siteId);
  const data={eyes:{OD:source(entry,'escrs')}};
  for(const siteId of ['barrett-universal','barrett-true-k','barrett-toric','barrett-true-k-toric','barrett-rx','evo','kane','solver-regular','solver-complex','solver-second'])assert.equal(plan(data,siteId).status,'ready',siteId);
  const k6=plan(data,'cooke');assert.equal(k6.status,'ready');assert.equal(k6.selections[0].value,'Alcon SA60WF/SN60WF');assert.equal(k6.selections[0].kind,'group');assert.equal(k6.selections[0].relation,'member');
  assert.equal(k6.selections[0].catalogId,entry.id);
  assert.equal(Object.hasOwn(k6.selections[0],'parameters'),false);
});

test('manufacturer, explicit AR40e/AR40E names, power and regional variants never collapse',()=>{
  assert.equal(manufacturerKey('J&J'),manufacturerKey('Johnson and Johnson Vision'));
  assert.notEqual(modelCodeKey('AR40e'),modelCodeKey('AR40E'));
  assert.notEqual(exact('J&J','AR40e').id,exact('J&J','AR40E').id);
  for(const [first,second]of [['MA60MA (+D)','MA60MA (-D)'],['MN60MA','MA60MA'],['409M','409MP'],['AT LISA tri 839MP China','839MP']])assert.notEqual(canonicalLensId('Alcon',first),canonicalLensId('Alcon',second));
  for(const code of ['MA60MA (+D)','MA60MA (-D)']){
    const entry=exact('Alcon',code);assert.ok(entry,code);assert.equal(selection(entry,'cooke').value,'Alcon MA60MA/MN60MA');
  }
  const zeiss=exact('ZEISS','839MP');assert.ok(zeiss.aliases.some(alias=>alias.siteId==='escrs'&&alias.label==='AT LISA tri 839MP'));
  assert.ok(!zeiss.aliases.some(alias=>/China|Korea/.test(alias.label)));
});

test('ESCRS plans exact manufacturer before the matching eye model and preserves both-eye choices',()=>{
  const data=caseFor(exact('Alcon','SN60WF'),exact('J&J','ZCB00'));
  const result=plan(data,'escrs',{eye:'OU'});assert.equal(result.status,'ready');
  assert.deepEqual(result.selections.map(item=>[item.controlId,item.value]),[['OD.manufacturer','Alcon'],['OD.model','AcrySof SN60WF'],['OS.manufacturer','Johnson and Johnson Vision'],['OS.model','ZCB00']]);
  assert.equal(result.selections.every(item=>item.eye===item.controlId.slice(0,2)),true);
  const k6=plan(data,'cooke',{eye:'OU'});assert.equal(k6.status,'ready');assert.deepEqual(k6.selections.map(item=>item.controlId),['model-OD','model-OS']);
});

test('same shared menu supports OU only when both selections resolve to the same native option',()=>{
  const first=exact('Alcon','SN60WF'),second=exact('Alcon','SA60AT');
  assert.equal(plan(caseFor(first),'evo',{eye:'OU'}).selections.length,1);
  const conflict=plan(caseFor(first,second),'evo',{eye:'OU'});assert.equal(conflict.status,'manual');assert.deepEqual(conflict.selections,[]);assert.match(conflict.warnings.join(' '),/共用同一選單/);
  // Distinct models legitimately project to the same K6 group, with each
  // per-eye native control retaining its originating canonical model ID.
  const sameGroup=plan(caseFor(first,exact('Alcon','SA60WF')),'cooke',{eye:'OU'});assert.equal(sameGroup.status,'ready');assert.equal(sameGroup.selections.length,2);assert.notEqual(sameGroup.selections[0].catalogId,sameGroup.selections[1].catalogId);
});

test('OU never fills one shared lens control when the other requested eye is unresolved',()=>{
  const data=caseFor(exact('Alcon','SN60WF'),exact('Alcon','CNA0T0'));
  for(const siteId of ['barrett-universal','solver-complex','solver-second']){
    const result=plan(data,siteId,{eye:'OU'});assert.equal(result.status,'manual',siteId);assert.deepEqual(result.selections,[]);assert.match(result.warnings.join(' '),/其中一眼無法對應.*共用同一選單.*單眼/);
  }
  const bilateral=plan(data,'solver-regular',{eye:'OU'});assert.equal(bilateral.status,'partial');assert.deepEqual(bilateral.selections.map(item=>[item.controlId,item.eye,item.value]),[['model-OD','OD','SN60WF']]);
  const oneSource={eyes:{OD:{iolCatalogId:exact('Alcon','SN60WF').id},OS:{}}};
  const available=plan(oneSource,'barrett-universal',{eye:'OU'});assert.equal(available.status,'ready');assert.equal(available.selections.length,1);
  // Different precise input models may still legitimately share a published
  // destination group; readiness is compared per requested eye and option.
  const grouped=plan(caseFor(exact('Alcon','MA60MA (+D)'),exact('Alcon','MA60MA (-D)')),'solver-complex',{eye:'OU'});assert.equal(grouped.status,'ready');assert.equal(grouped.selections.length,1);assert.equal(grouped.selections[0].value,'MA/MN60MA');
});

test('an evidenced geometry selection explicitly requests destination constant review',()=>{
  const result=plan(caseFor(exact('Alcon','AU00T0')),'evo');assert.equal(result.status,'ready');assert.equal(result.selections[0].kind,'geometry');assert.match(result.warnings.join(' '),/只對應幾何.*核對目的站 A-constant/);
  assert.equal(Object.hasOwn(result.selections[0],'parameters'),false);
});

test('Rx implanted and exchange roles remain distinct across reads and writes',()=>{
  const entry=exact('Alcon','SN60WF');
  assert.equal(selection(entry,'barrett-rx').controlId,'exchange');
  const implanted=entry.aliases.find(alias=>alias.siteId==='barrett-rx'&&alias.role==='implanted');
  const data={eyes:{OD:{...source(entry,'barrett-rx'),iolSourceControl:implanted.controlId,iolSourceRole:'implanted'}}};
  const result=plan(data,'barrett-rx');assert.equal(result.status,'ready');assert.equal(result.selections[0].controlId,'implanted');assert.equal(result.selections[0].role,'implanted');
  assert.equal(plan(data,'barrett-universal').status,'ready');
});

test('group/family sources cannot reverse infer a single member and DGS toric has no invented geometry rule',()=>{
  const group=catalog.entries.find(entry=>entry.aliases.some(alias=>alias.siteId==='cooke'&&alias.value==='Alcon SA60WF/SN60WF'));
  assert.equal(plan(caseFor(group),'escrs').status,'manual');
  assert.equal(plan(caseFor(group),'barrett-universal').status,'manual');
  const toric=plan(caseFor(exact('Alcon','SN60WF')),'solver-toric');assert.equal(toric.status,'manual');assert.deepEqual(toric.selections,[]);assert.match(toric.warnings.join(' '),/先到基本入口/);
  const unlisted=exact('Alcon','CNA0T0');assert.equal(plan(caseFor(unlisted),'solver-regular').status,'manual');
  assert.equal(plan(caseFor(unlisted),'solver-regular').selections.some(item=>item.value==='Other'),false);
});

test('TECNIS matrix membership is precise and an explicitly ambiguous ZCB00 family stays manual',()=>{
  const zcb=exact('J&J','ZCB00');assert.equal(plan(caseFor(zcb),'tecnis-toric').status,'manual');
  const zcu=catalog.entries.find(entry=>entry.kind==='family'&&entry.modelCode==='ZCU');assert.ok(zcu);const result=plan(caseFor(zcu),'tecnis-toric');assert.equal(result.status,'ready');assert.equal(result.selections[0].value,'Monofocal-II');assert.equal(result.selections[0].kind,'family');
  const sphere=plan(caseFor(exact('Alcon','CNA0T0')),'evo');assert.equal(sphere.selections[0].value,'CNA0T0');assert.equal(sphere.selections[0].kind,'model');
  const generic=plan(caseFor(exact('Alcon','MA60MA (+D)')),'evo');assert.equal(generic.status,'ready');assert.equal(generic.selections[0].value,'MA60MA');assert.equal(generic.selections[0].kind,'family');
});

test('explicit ESCRS Alcon range series project to the matching APACRS, EVO and Kane families',()=>{
  const entry=catalog.entries.find(entry=>entry.aliases.some(alias=>alias.siteId==='escrs'&&alias.value==='AcrySof SN6AT (2-9)'));assert.ok(entry);assert.equal(entry.kind,'family');
  for(const [siteId,value]of [['barrett-toric','Alcon SN6ATx'],['evo-toric','SN6ATx'],['kane','7']]){
    const result=plan(caseFor(entry),siteId);assert.equal(result.status,'ready',siteId);assert.equal(result.selections[0].value,value);assert.equal(result.selections[0].kind,'family');
  }
  const reverse=catalog.entries.find(entry=>entry.aliases.some(alias=>alias.siteId==='evo-toric'&&alias.value==='SN6ATx'));
  const toEscrs=plan(caseFor(reverse),'escrs');assert.equal(toEscrs.status,'ready');assert.equal(toEscrs.selections.find(item=>item.role==='primary').value,'AcrySof SN6AT (2-9)');
});

test('named manufacturer families keep sphere/toric choices apart across ESCRS, Kane and EVO',()=>{
  const sphere=catalog.entries.find(entry=>entry.aliases.some(alias=>alias.siteId==='escrs'&&alias.value==='enVista Aspire'));
  const toric=catalog.entries.find(entry=>entry.aliases.some(alias=>alias.siteId==='escrs'&&alias.value==='enVista Aspire Toric'));
  assert.ok(sphere);assert.ok(toric);assert.notEqual(sphere.id,toric.id);
  assert.equal(selection(sphere,'kane').value,'27');assert.equal(selection(toric,'kane').value,'28');assert.equal(selection(toric,'evo-toric').value,'Aspire');
  const evo=catalog.entries.find(entry=>entry.aliases.some(alias=>alias.siteId==='evo-toric'&&alias.value==='Aspire'));
  const reverse=plan(caseFor(evo),'escrs');assert.equal(reverse.status,'ready');assert.equal(reverse.selections.find(item=>item.role==='primary').value,'enVista Aspire Toric');
  const zcu=catalog.entries.find(entry=>entry.aliases.some(alias=>alias.siteId==='escrs'&&alias.value==='ZCU'));assert.ok(zcu);assert.equal(zcu.kind,'family');assert.equal(selection(zcu,'tecnis-toric').value,'Monofocal-II');
  const tec=catalog.entries.find(entry=>entry.aliases.some(alias=>alias.siteId==='tecnis-toric'&&alias.value==='Eyhance-II-Simplicity'));
  assert.equal(plan(caseFor(tec),'escrs').selections.find(item=>item.role==='primary').value,'DIU');
});

test('native disabled, missing and duplicate options override packaged availability',()=>{
  const data=caseFor(exact('Alcon','SN60WF')),good={value:'SN60WF',label:'Alcon SN60WF',kind:'model',available:true};
  for(const options of [[{...good,available:false}],[good,good],[{...good,value:'removed',label:'Removed'}]]){
    const result=plan(data,'evo',{}, {controls:[{controlId:'primary',status:'read',options}]});assert.equal(result.status,'manual');assert.deepEqual(result.selections,[]);
  }
  const linked=plan(data,'escrs',{}, {controls:[{controlId:'OD.model',manufacturer:'Alcon',menuOpen:true,options:[{value:'AcrySof SN60WF',label:'AcrySof SN60WF',kind:'model',available:false}]}]});assert.equal(linked.status,'manual');assert.deepEqual(linked.selections,[]);
});

test('published duplicate ESCRS labels remain duplicate and cannot be automatically selected',()=>{
  const sources=catalog.sources.filter(source=>source.siteId==='escrs'&&source.manufacturer==='Ophtec');assert.ok(sources.length);
  assert.equal(sources[0].options.filter(option=>option.value==='AC 205').length,2);
  const entry=exact('Ophtec','AC 205');assert.ok(entry);
  const result=plan(caseFor(entry),'escrs');assert.equal(result.status,'manual');assert.deepEqual(result.selections,[]);
});

test('source-only cached catalogs merge without shrinking published lists and keep source parameters by formula',()=>{
  const entry=exact('Alcon','SN60WF'),original=catalog.sources.find(item=>item.siteId==='escrs'&&item.manufacturer==='Alcon'&&item.eye==='OD'&&item.formula==='non-toric'),chosen=original.options.find(item=>item.label==='AcrySof SN60WF');
  const snapshot={...structuredClone(original),capturedAt:now,options:[chosen],selected:{value:chosen.value,label:chosen.label,kind:chosen.kind},parameters:[{key:'aConstant',formula:'barrett',value:'118.99',unit:'1',sourceControl:'label:Barrett'},{key:'aConstant',formula:'kane',value:'119.1',unit:'1',sourceControl:'label:Kane'}]};
  const merged=mergeLensCatalog({format:'biometry-lens-catalog',schemaVersion:'1.1',exportedAt:now,sources:[snapshot],entries:[]});
  const source=merged.sources.find(item=>item.siteId===snapshot.siteId&&item.controlId===snapshot.controlId&&item.manufacturer===snapshot.manufacturer&&item.formula===snapshot.formula);
  assert.equal(source.options.length,original.options.length);assert.equal(source.parameters.length,2);
  const parameters=merged.entries.find(item=>item.id===entry.id).parameters.filter(item=>item.siteId==='escrs');assert.deepEqual(parameters.map(item=>[item.formula,item.value]),[['barrett','118.99'],['kane','119.1']]);
  const transmitted=plan(caseFor(entry),'evo',{catalog:merged});assert.equal(transmitted.status,'ready');assert.equal(Object.hasOwn(transmitted.selections[0],'parameters'),false);
  assert.equal(catalog.sources.find(item=>item===original).parameters.length,0);
});

test('stale unknown IDs migrate only from an exact source identity; conflicting known IDs remain manual',()=>{
  const entry=exact('Alcon','SN60WF');
  const old={eyes:{OD:source(entry,'evo',{iolCatalogId:'old-cache-id'})}};assert.equal(plan(old,'cooke').status,'ready');assert.match(plan(old,'cooke').warnings.join(' '),/舊目錄 ID/);
  const conflict={eyes:{OD:source(entry,'evo',{iolCatalogId:exact('Alcon','SA60AT').id})}};assert.equal(plan(conflict,'cooke').status,'manual');
});

test('unknown custom exact models survive merge while a conflicting alias is rejected',()=>{
  const custom={id:'custom:M1',manufacturer:'Synthetic Maker',modelCode:'M1',name:'SYNTHETIC M1',kind:'model',aliases:[{siteId:'synthetic',value:'M1',label:'SYNTHETIC M1',evidenceUrl:'https://synthetic.example/calculator',verifiedAt:now}]};
  const merged=mergeLensCatalog({format:'biometry-lens-catalog',schemaVersion:'1.1',exportedAt:now,sources:[],entries:[custom]});assert.deepEqual(merged.entries.find(entry=>entry.id===custom.id).aliases,custom.aliases);
  const duplicate={...custom,aliases:[structuredClone(exact('Alcon','SN60WF').aliases[0])]};assert.throws(()=>mergeLensCatalog({format:'biometry-lens-catalog',schemaVersion:'1.1',exportedAt:now,sources:[],entries:[duplicate]}),/多個對照/);
});

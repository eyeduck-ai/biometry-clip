import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {exportLensCatalogDocument,parseLensCatalogDocument,resolveLensSelection,buildLensReadRows} from '../src/lens-catalog.js';

const at='2026-11-15T00:00:00.000Z';
const option=(value,label=value,kind='model')=>({value,label,kind,available:true});
const source=(siteId,value,label=value,kind='model',extra={})=>({siteId,status:'read',url:`https://${siteId}.example/calculator`,capturedAt:at,control:'native-select',options:[option(value,label,kind)],selected:{value,label,kind},parameters:[],...extra});
const alias=(siteId,value,label=value,extra={})=>({siteId,value,label,evidenceUrl:`https://${siteId}.example/calculator`,verifiedAt:at,...extra});
const selection={iolSourceSite:'escrs',iolSourceValue:'M1',iolSourceLabel:'Model 1',iolSourceControl:'model-OD',iolSourceManufacturer:'Maker',iolSourceRole:'primary',iolCatalogId:'maker:m1'};
function catalog(){
  return exportLensCatalogDocument([
    source('escrs','M1','Model 1','model',{controlId:'model-OD',eye:'OD',role:'primary',manufacturer:'Maker',control:'linked-select',parameters:[{key:'aConstant',value:'118.7',unit:'1',sourceControl:'label:A Constant',formula:'Barrett'}]}),
    source('escrs','M1','Model 1','model',{controlId:'model-OS',eye:'OS',role:'primary',manufacturer:'Maker',control:'linked-select'}),
    source('evo','M1','Maker M1','model',{controlId:'primary'}),
    source('cooke','M1/M2','Maker group M1/M2','group',{controlId:'model-OD',eye:'OD',control:'linked-select'}),
    source('generic','Standard','Standard','geometry',{controlId:'primary'}),
  ],{now:at,entries:[{id:'maker:m1',manufacturer:'Maker',modelCode:'M1',name:'Model 1',kind:'model',aliases:[alias('escrs','M1','Model 1',{controlId:'model-OD',manufacturer:'Maker',role:'primary'}),alias('escrs','M1','Model 1',{controlId:'model-OS',manufacturer:'Maker',role:'primary'}),alias('evo','M1','Maker M1',{controlId:'primary'})],targets:[{...alias('cooke','M1/M2','Maker group M1/M2',{controlId:'model-OD'}),kind:'group',relation:'member'},{...alias('generic','Standard','Standard',{controlId:'primary'}),kind:'geometry',relation:'geometry'}],parameters:[{siteId:'escrs',controlId:'model-OD',formula:'Barrett',key:'aConstant',value:'118.7',unit:'1',evidenceUrl:'https://escrs.example/calculator',capturedAt:at}]}]});
}

test('catalog 1.1 preserves eye, manufacturer, role and formula-specific parameter provenance',()=>{
  const document=catalog();assert.equal(document.schemaVersion,'1.1');assert.deepEqual(parseLensCatalogDocument(JSON.stringify(document)),document);
  assert.equal(document.sources[0].manufacturer,'Maker');assert.equal(document.sources[0].parameters[0].formula,'Barrett');assert.equal(document.entries[0].parameters[0].siteId,'escrs');
  assert.equal(document.entries[0].aliases.length,3);
});
test('a precise canonical model resolves a verified grouped destination without pretending the group is the model',()=>{
  const result=resolveLensSelection(selection,'cooke',catalog(),source('cooke','M1/M2','Maker group M1/M2','group',{controlId:'model-OD'}),{controlId:'model-OD',eye:'OD'});
  assert.equal(result.status,'ready');assert.equal(result.canonicalId,'maker:m1');assert.equal(result.catalogId,'maker:m1');assert.equal(result.precision,'group');assert.equal(result.relation,'member');assert.equal(result.eye,'OD');assert.equal(result.controlId,'model-OD');
  assert.equal(Object.hasOwn(result,'parameters'),false);assert.equal(Object.hasOwn(result,'aConstant'),false);
});
test('only an explicit evidenced geometry target is usable and source geometry cannot reverse-map a model',()=>{
  const document=catalog(),live=source('generic','Standard','Standard','geometry',{controlId:'primary'});
  const result=resolveLensSelection(selection,'generic',document,live,{controlId:'primary'});assert.equal(result.status,'ready');assert.equal(result.precision,'geometry');assert.equal(result.relation,'geometry');assert.equal(result.catalogId,'maker:m1');
  assert.equal(resolveLensSelection({iolSourceSite:'generic',iolSourceValue:'Standard',iolSourceLabel:'Standard'},'evo',document,source('evo','M1','Maker M1')).status,'manual');
  delete document.entries[0].targets;assert.equal(resolveLensSelection(selection,'generic',document,live).status,'manual');
});
test('an exact native alias takes precedence over broader published targets',()=>{
  const document=catalog();document.entries[0].targets.push({...alias('evo','Standard'),kind:'geometry',relation:'geometry'});
  const live=source('evo','M1','Maker M1');live.options.push(option('Standard','Standard','geometry'));
  const result=resolveLensSelection(selection,'evo',document,live);assert.equal(result.status,'ready');assert.equal(result.value,'M1');assert.equal(result.precision,'model');assert.equal(result.relation,undefined);
});
test('many model entries may project to one group but copying that group cannot identify a member',()=>{
  const document=catalog();document.sources.push(exportLensCatalogDocument([source('escrs','M2','Model 2','model',{controlId:'model-OD',manufacturer:'Maker'})],{now:at}).sources[0]);
  document.entries.push({id:'maker:m2',manufacturer:'Maker',modelCode:'M2',name:'Model 2',kind:'model',aliases:[alias('escrs','M2','Model 2',{controlId:'model-OD',manufacturer:'Maker'})],targets:[document.entries[0].targets[0]]});
  assert.doesNotThrow(()=>parseLensCatalogDocument(document));
  const live=source('cooke','M1/M2','Maker group M1/M2','group',{controlId:'model-OD'});
  assert.equal(resolveLensSelection({...selection,iolSourceValue:'M2',iolSourceLabel:'Model 2',iolCatalogId:'maker:m2'},'cooke',document,live,{controlId:'model-OD'}).status,'ready');
  assert.equal(resolveLensSelection({iolSourceSite:'cooke',iolSourceValue:'M1/M2',iolSourceLabel:'Maker group M1/M2',iolSourceControl:'model-OD'},'evo',document,source('evo','M1','Maker M1')).status,'manual');
});
test('a group canonical entry cannot be guessed into a specific target model',()=>{
  const document=exportLensCatalogDocument([source('group','G','Group','group'),source('evo','M1','Model 1')],{now:at,entries:[{id:'group:g',manufacturer:'Maker',modelCode:'G',name:'Group',kind:'group',aliases:[alias('group','G','Group')],targets:[{...alias('evo','M1','Model 1'),kind:'model',relation:'member'}]}]});
  assert.equal(resolveLensSelection({iolSourceSite:'group',iolSourceValue:'G',iolSourceLabel:'Group',iolCatalogId:'group:g'},'evo',document,source('evo','M1','Model 1')).status,'manual');
});
test('identical labels from different manufacturers require a matching source manufacturer',()=>{
  const document=catalog(),second=structuredClone(document.entries[0]);second.id='other:m1';second.manufacturer='Other';second.aliases=[alias('escrs','M1','Model 1',{controlId:'model-OD',manufacturer:'Other'}),alias('evo','OTHER-M1','Other M1',{controlId:'primary'})];second.targets=[];document.entries.push(second);
  document.sources.push(exportLensCatalogDocument([source('escrs','M1','Model 1','model',{controlId:'model-OD',manufacturer:'Other'})],{now:at}).sources[0]);
  const live=source('evo','M1','Maker M1');live.options.push(option('OTHER-M1','Other M1'));
  assert.equal(resolveLensSelection({...selection,iolSourceManufacturer:'',iolCatalogId:''},'evo',document,live).status,'manual');
  assert.equal(resolveLensSelection(selection,'evo',document,live).catalogId,'maker:m1');
  assert.equal(resolveLensSelection({...selection,iolSourceManufacturer:'Other',iolCatalogId:'other:m1'},'evo',document,live).value,'OTHER-M1');
});
test('typed destination roles avoid automatically filling an implanted lens from an ordinary target',()=>{
  const document=catalog();document.entries[0].aliases.push(alias('rx','M1','Model 1',{controlId:'implanted',role:'implanted'}));
  const live=source('rx','M1','Model 1','model',{controlId:'implanted',role:'implanted'});
  assert.equal(resolveLensSelection(selection,'rx',document,live,{controlId:'implanted'}).status,'manual');
  const chosen=resolveLensSelection(selection,'rx',document,live,{controlId:'implanted',role:'implanted'});assert.equal(chosen.status,'ready');assert.equal(chosen.role,'implanted');
});
test('duplicate exact aliases across canonical identities still reject while different eye controls may share an identity',()=>{
  const document=catalog();assert.doesNotThrow(()=>parseLensCatalogDocument(document));const duplicate=structuredClone(document.entries[0]);duplicate.id='different';document.entries.push(duplicate);assert.throws(()=>parseLensCatalogDocument(document),/多個對照/);
});
test('literal version 1.0 retains strict vocabulary and original resolver result shape',()=>{
  const entry={id:'maker:m1',manufacturer:'Maker',modelCode:'M1',name:'Model 1',kind:'model',aliases:[alias('old','M1','Model 1'),alias('target','T1','Target 1')]};
  const document=exportLensCatalogDocument([source('old','M1','Model 1'),source('target','T1','Target 1')],{now:at,version:'1.0',entries:[entry]});
  assert.equal(document.schemaVersion,'1.0');const result=resolveLensSelection({iolSourceSite:'old',iolSourceValue:'M1',iolSourceLabel:'Model 1'},'target',document,source('target','T1','Target 1'));
  assert.deepEqual(Object.keys(result).sort(),['catalogId','kind','label','navigationExpected','siteId','status','value']);
  for(const mutate of [value=>value.sources[0].controlId='primary',value=>value.sources[0].options[0].kind='group',value=>value.entries[0].targets=[],value=>value.entries[0].parameters=[]]){const value=structuredClone(document);mutate(value);assert.throws(()=>parseLensCatalogDocument(value));}
});
test('closed target options and changed kinds remain manual until caller provides current or published exact options',()=>{
  const live=source('cooke','M1/M2','Maker group M1/M2','group',{controlId:'model-OD'});live.options=[];
  assert.equal(resolveLensSelection(selection,'cooke',catalog(),live,{controlId:'model-OD'}).status,'manual');
  live.options=[option('M1/M2','Maker group M1/M2','family')];assert.equal(resolveLensSelection(selection,'cooke',catalog(),live,{controlId:'model-OD'}).status,'manual');
});
test('new source context becomes eye-specific case rows and never mirrors one eye into the other',()=>{
  const rows=buildLensReadRows({id:'escrs',eyeMode:'both'},catalog().sources[0]&&{...catalog().sources[0],status:'read'},'OU');
  assert.ok(rows.every(row=>row.eye==='OD'));assert.equal(rows.find(row=>row.key==='iolSourceControl').value,'model-OD');assert.equal(rows.find(row=>row.key==='iolSourceManufacturer').value,'Maker');assert.equal(rows.find(row=>row.key==='iolSourceRole').value,'primary');
});
test('new and frozen schemas expose their separate vocabularies and preserve narrow parameter fields',async()=>{
  const schema=JSON.parse(await readFile(new URL('../schemas/biometry-lens-catalog.schema.json',import.meta.url),'utf8')),old=JSON.parse(await readFile(new URL('../schemas/biometry-lens-catalog-1.0.schema.json',import.meta.url),'utf8'));
  assert.equal(schema.oneOf[0].properties.schemaVersion.const,'1.1');assert.equal(schema.oneOf[1].properties.schemaVersion.const,'1.0');assert.equal(schema.$defs.entryParameter.additionalProperties,false);
  assert.ok(schema.$defs.option.properties.kind.enum.includes('group'));assert.equal(old.$defs.option.properties.kind.enum.includes('group'),false);assert.equal(old.$defs.source.properties.controlId,undefined);
});

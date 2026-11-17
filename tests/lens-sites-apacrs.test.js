import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {EVO_TECNIS_LENS_DEFINITIONS,EVO_TECNIS_LENS_SOURCES,EVO_EXPLICIT_MODEL_ENTRIES,TECNIS_MODEL_PROJECTIONS,EVO_GUIDE_RULES,APACRS_LENS_DEFINITIONS,APACRS_LENS_SOURCES,APACRS_LENS_ENTRIES,APACRS_LENS_PARAMETER_PRESETS,APACRS_MODEL_PROJECTIONS} from '../src/lens-sites-apacrs.js';

test('EVO published option values and labels exactly match the seed sources',async()=>{
  for(const [siteId,path]of [['evo','evo-regular.html'],['evo-toric','evo-toric.html']]){
    const dom=new JSDOM(await readFile(new URL(`./fixtures/lens-sources/${path}`,import.meta.url),'utf8'));
    const control=EVO_TECNIS_LENS_DEFINITIONS[siteId].controls[0],source=EVO_TECNIS_LENS_SOURCES.find(item=>item.siteId===siteId);
    const select=dom.window.document.querySelector(control.selector);
    assert.deepEqual(source.options.map(({value,label})=>({value,label})),[...select.options].map(option=>({value:option.value,label:option.label.trim()})));
    assert.equal(control.navigationExpected,true);assert.match(select.getAttribute('onchange'),/__doPostBack/);
    assert.equal(source.selected,null);assert.deepEqual(source.parameters,[]);
    dom.window.close();
  }
});
test('EVO guide model groups and optical geometry never become exact model source aliases',()=>{
  const evo=EVO_TECNIS_LENS_SOURCES.find(item=>item.siteId==='evo'),toric=EVO_TECNIS_LENS_SOURCES.find(item=>item.siteId==='evo-toric');
  assert.equal(evo.options.find(option=>option.value==='MA60MA').kind,'family');
  assert.deepEqual(EVO_GUIDE_RULES.regular.find(rule=>rule.target==='MA60MA').members,['MA60MA','MA60AC','MN60AC']);
  assert.equal(EVO_EXPLICIT_MODEL_ENTRIES.some(entry=>entry.aliases.some(alias=>['MA60MA','Tecnis','Standard'].includes(alias.value))),false);
  assert.equal(EVO_EXPLICIT_MODEL_ENTRIES.length,10);
  for(const value of ['Posterior','Anterior','Bitoric'])assert.equal(toric.options.find(option=>option.value===value).kind,'geometry');
  for(const rule of EVO_GUIDE_RULES.toric)assert.ok(toric.options.some(option=>option.value===rule.target));
});
test('TECNIS projections match the published matrix and preserve ambiguous base-model membership',async()=>{
  const js=await readFile(new URL('./fixtures/lens-sources/tecnis-matrix.js',import.meta.url),'utf8');
  const matrix=JSON.parse(js.match(/const matrix = (\{.*\});/)[1]);
  const expected=new Set(matrix.location.flatMap(location=>location.lens.flatMap(family=>family.models.map(model=>`${model}:${family.name}`))));
  const actual=new Set(TECNIS_MODEL_PROJECTIONS.map(({modelCode,target})=>`${modelCode}:${target.value}`));
  assert.deepEqual(actual,expected);assert.equal(new Set(TECNIS_MODEL_PROJECTIONS.map(item=>item.modelCode)).size,118);
  assert.deepEqual(TECNIS_MODEL_PROJECTIONS.filter(item=>item.modelCode==='ZCB00').map(item=>item.target.value).sort(),['Monofocal','Monofocal-II']);
  assert.equal(TECNIS_MODEL_PROJECTIONS.find(item=>item.modelCode==='ZCU150').target.value,'Monofocal-II');
  assert.ok(TECNIS_MODEL_PROJECTIONS.every(({target})=>target.relation==='member'&&target.kind==='family'&&!('aConstant'in target)));
});
test('TECNIS destination family labels are from the real menu, including generation and injector distinctions',async()=>{
  const dom=new JSDOM(await readFile(new URL('./fixtures/lens-sources/tecnis-calculator.html',import.meta.url),'utf8'));
  const options=EVO_TECNIS_LENS_SOURCES.find(item=>item.siteId==='tecnis-toric').options;
  assert.equal(options.length,16);
  for(const option of options){const node=dom.window.document.querySelector(`[data-bs-attribute="${option.value}"]`);assert.equal(node.querySelector('img').alt,option.label);assert.equal(option.kind,'family');}
  assert.notEqual(options.find(item=>item.value==='Eyhance-II').label,options.find(item=>item.value==='Eyhance-II-Simplicity').label);
  dom.window.close();
});
test('all APACRS public lens menus have captured options and separate Rx implanted/exchange roles',async()=>{
  const evidence=JSON.parse(await readFile(new URL('./fixtures/lens-sources/apacrs-sources.json',import.meta.url),'utf8'));
  assert.equal(Object.keys(APACRS_LENS_DEFINITIONS).length,5);assert.equal(APACRS_LENS_SOURCES.length,6);
  assert.deepEqual(APACRS_LENS_DEFINITIONS['barrett-rx'].controls.map(control=>({id:control.id,role:control.role,selector:control.selector})),[{id:'implanted',role:'implanted',selector:'#MainContent_IOLModel'},{id:'exchange',role:'exchange',selector:'#MainContent_IOLModelEx'}]);
  for(const source of APACRS_LENS_SOURCES){
    assert.equal(source.options.length,38);assert.equal(source.options[0].kind,'geometry');
    assert.equal(source.options[0].value,'Personal Constant');assert.ok(source.options.every(option=>option.value===option.label));
    assert.deepEqual(source,evidence.sources.find(item=>item.siteId===source.siteId&&item.controlId===source.controlId));
  }
  assert.equal(APACRS_LENS_ENTRIES.some(entry=>entry.modelCode==='MN60MA'),true);
  assert.equal(APACRS_LENS_ENTRIES.some(entry=>entry.modelCode==='MA60MA'),false,'different published codes cannot silently alias');
});
test('222 live preset readbacks stay scoped to their exact site, role and selected option',()=>{
  assert.equal(APACRS_LENS_PARAMETER_PRESETS.length,222);const identities=new Set();
  for(const preset of APACRS_LENS_PARAMETER_PRESETS){
    const id=[preset.siteId,preset.controlId,preset.value].join(':');assert.equal(identities.has(id),false);identities.add(id);
    const source=APACRS_LENS_SOURCES.find(source=>source.siteId===preset.siteId&&source.controlId===preset.controlId);assert.ok(source.options.some(option=>option.value===preset.value));
    assert.deepEqual(preset.parameters.map(parameter=>parameter.key),['aConstant','lensFactor']);
    for(const parameter of preset.parameters){assert.match(parameter.value,/^\d+(?:\.\d+)?$/);assert.equal(parameter.unit,'1');assert.equal(parameter.sourceControl.endsWith('Ex'),preset.controlId==='exchange');}
  }
  assert.equal(APACRS_LENS_PARAMETER_PRESETS.filter(row=>row.siteId==='barrett-rx'&&row.controlId==='exchange').length,37);
});
test('APACRS member projections use actual family options and never turn USA presets into generic equivalence',()=>{
  assert.ok(APACRS_MODEL_PROJECTIONS.length>200);
  for(const item of APACRS_MODEL_PROJECTIONS){
    const source=APACRS_LENS_SOURCES.find(source=>source.siteId===item.target.siteId&&source.controlId===item.target.controlId);
    assert.ok(source.options.some(option=>option.kind==='family'&&option.value===item.target.value));
    assert.equal(item.target.value.includes('(USA)'),false);assert.equal(item.target.relation,'member');
    assert.equal('parameters'in item.target,false);assert.equal('aConstant'in item.target,false);
    assert.ok(TECNIS_MODEL_PROJECTIONS.some(model=>model.modelCode===item.modelCode));
  }
  assert.equal(APACRS_MODEL_PROJECTIONS.filter(item=>item.modelCode==='ZCU150').length,6);
});

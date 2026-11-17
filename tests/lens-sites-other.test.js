import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {COOKE_LENS_OPTIONS,DGS_LENS_OPTIONS,DGS_TORIC_GEOMETRIES,OTHER_LENS_MEMBERSHIPS,LENS_OTHER_DEFINITIONS,KANE_LENS_OPTIONS,OTHER_LENS_SOURCES,OTHER_LENS_EXACT_MODELS} from '../src/lens-sites-other.js';

const cooke=await readFile(new URL('./fixtures/lens-sources/cooke-lenses.js',import.meta.url),'utf8');
const dgs=await readFile(new URL('./fixtures/lens-sources/dgs-lenses.js',import.meta.url),'utf8');
const kane=await readFile(new URL('./fixtures/lens-sources/kane-handlers.js',import.meta.url),'utf8');
function literalArray(source,marker){
  const start=source.indexOf('[',source.indexOf(marker));assert.notEqual(start,-1);
  let depth=0,quote='',escaped=false;
  for(let end=start;end<source.length;end++){
    const char=source[end];
    if(quote){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char===quote)quote='';}
    else if(char==='"'||char==="'")quote=char;
    else if(char==='[')depth++;
    else if(char===']'&&--depth===0)return source.slice(start,end+1);
  }
  assert.fail('Published literal list is not closed');
}
const jsonLiteral=source=>JSON.parse(source.replace(/([,{])(\w+):/g,'$1"$2":').replace(/:\.(\d+)/g,':0.$1'));

test('all 23 Cooke choices and each site-specific constant/power range match its published literal list',()=>{
  const source=literalArray(cooke,'static getDefault=()=>[').replace(/a\.default\[a\.default\.(\w+)\]/g,'"$1"').replaceAll('o.default.iol.min','-20').replaceAll('o.default.iol.max','80');
  const published=jsonLiteral(source);
  assert.equal(published.length,23);assert.deepEqual(COOKE_LENS_OPTIONS.map(option=>option.label),published.map(option=>option.name));
  for(const option of published){
    const record=OTHER_LENS_MEMBERSHIPS.cooke.find(item=>item.label===option.name);
    assert.equal(record.siteParameters.aConstant,option.aConst===null?null:String(option.aConst));
    assert.equal(record.siteParameters.formulaFamily,option.family);assert.deepEqual(record.siteParameters.powers,option.powers||[]);
  }
});
test('DGS complete shared model list and three Toric styles retain their actual semantic levels',()=>{
  const published=jsonLiteral(literalArray(dgs,'IOLModelItems:['));
  assert.equal(published.length,13);assert.deepEqual(DGS_LENS_OPTIONS.map(option=>option.label),published.map(option=>option.text));
  for(const option of published){
    const record=OTHER_LENS_MEMBERSHIPS['solver-regular'].find(item=>item.label===option.text);
    assert.equal(record.siteType,option.type);assert.equal(record.siteParameters.aConstant,option.aconst==null?undefined:String(option.aconst));
  }
  assert.deepEqual(DGS_TORIC_GEOMETRIES.map(option=>option.label),jsonLiteral(literalArray(dgs,'style:[')).map(option=>option.text));
  assert.ok(DGS_TORIC_GEOMETRIES.every(option=>option.kind==='geometry'));
});
test('a grouped target explicitly covers its named members without claiming the source is one exact model',()=>{
  const cooke=OTHER_LENS_MEMBERSHIPS.cooke.find(option=>option.label==='J&J Tecnis 1-Piece (ZCB00, ICB00, ZCU***, ZXR00)');
  const dgs=OTHER_LENS_MEMBERSHIPS['solver-regular'].find(option=>option.label==='PCB00/ZCB00');
  assert.equal(cooke.kind,'group');assert.equal(dgs.kind,'group');
  assert.deepEqual(cooke.memberCodes,['ZCB00','ICB00','ZXR00']);assert.deepEqual(cooke.memberCodePatterns,['ZCU???']);assert.deepEqual(dgs.memberCodes,['PCB00','ZCB00']);
  assert.notEqual(cooke.siteParameters.aConstant,dgs.siteParameters.aConstant);
  for(const options of Object.values(OTHER_LENS_MEMBERSHIPS))for(const option of options.filter(option=>option.label.startsWith('Other')))assert.equal(option.automaticIdentityMapping,false);
});
test('six site definitions preserve bilateral scope, single-eye scope and DGS Toric inheritance',()=>{
  assert.equal(Object.keys(LENS_OTHER_DEFINITIONS).length,6);
  for(const siteId of ['cooke','kane','solver-regular'])assert.deepEqual(LENS_OTHER_DEFINITIONS[siteId].controls.map(control=>control.eye),['OD','OS']);
  assert.deepEqual(LENS_OTHER_DEFINITIONS['solver-regular'].controls.map(control=>control.scopeSelector),['.iol-right-v-sheet','.iol-left-v-sheet']);
  for(const siteId of ['solver-complex','solver-second']){assert.equal(LENS_OTHER_DEFINITIONS[siteId].controls.length,1);assert.equal(LENS_OTHER_DEFINITIONS[siteId].controls[0].eye,undefined);}
  assert.equal(LENS_OTHER_DEFINITIONS['solver-toric'].inheritedModel,true);assert.equal(LENS_OTHER_DEFINITIONS['solver-toric'].controls.some(control=>['model','primary'].includes(control.role)),false);
});
test('Kane controls and dependent constants/modes are evidenced by its public change handler',()=>{
  for(const [index,control]of LENS_OTHER_DEFINITIONS.kane.controls.entries()){
    assert.equal(control.selector,`select.d-block[name="ioltype_${index+1}"]`);assert.ok(kane.includes(control.selector));
    assert.equal(control.parameters[0].selector,`#A-Constant${index+1}`);assert.ok(kane.includes(`[name="aconstant_${index+1}"]`));
    assert.deepEqual(control.changeEffects,['constant','toric-mode']);assert.equal(control.options,KANE_LENS_OPTIONS);assert.deepEqual(control.emptyValues,['0','']);
  }
  assert.ok(kane.includes('if ((v[3] == 1) || (v[3] == 2))'));assert.ok(kane.includes('if ((v[3] == 3) || (v[3] == 4))'));
});


test('normal user-approved Kane form provides all 29 non-placeholder options and their own constants',async()=>{
  const capture=JSON.parse(await readFile(new URL('./fixtures/lens-sources/kane-options.json',import.meta.url),'utf8'));
  assert.equal(capture.selects.length,2);assert.deepEqual(capture.selects[0].options,capture.selects[1].options);
  const options=capture.selects[0].options.filter(option=>option.value!=='0');assert.equal(options.length,29);
  assert.deepEqual(KANE_LENS_OPTIONS.map(({value,label})=>({value,label})),options.map(({value,label})=>({value,label})));
  const match=/^\s*document\.ioltypes\s*=\s*(\{.*\})\s*;\s*$/.exec(capture.scriptTexts[0]);assert.ok(match);
  const table=JSON.parse(match[1]);
  for(const option of KANE_LENS_OPTIONS){
    const data=OTHER_LENS_MEMBERSHIPS.kane.find(record=>record.value===option.value),row=table[`v${option.value}`];
    assert.equal(data.label,row[0]);assert.equal(data.siteParameters.aConstant,String(row[1]));assert.equal(data.siteParameters.siteTypeId,row[2]);assert.equal(data.siteParameters.modeFlag,row[3]);assert.deepEqual(data.sourceRow,row);
  }
  assert.equal(KANE_LENS_OPTIONS.some(option=>option.value==='0'),false);
});
test('Kane exact models and explicit cylinder series map forward without converting families into model identities',()=>{
  const models=OTHER_LENS_MEMBERSHIPS.kane.filter(option=>option.kind==='model');assert.equal(models.length,6);
  assert.deepEqual(models.flatMap(option=>option.memberCodes).sort(),['MN60MA','SA60AT','SN60WF','AR40e','ZCB00','409M'].sort());
  assert.deepEqual(OTHER_LENS_MEMBERSHIPS.kane.find(option=>option.label==='Alcon SN6ATx').memberCodePatterns,['SN6AT?']);
  assert.deepEqual(OTHER_LENS_MEMBERSHIPS.kane.find(option=>option.label==='J+J ZCTx').memberCodePatterns,['ZCT???']);
  for(const option of OTHER_LENS_MEMBERSHIPS.kane.filter(option=>option.kind==='family'&&!option.memberCodePatterns.length&&!option.membershipEvidenceUrl)){assert.deepEqual(option.memberCodes,[]);assert.equal(option.automaticIdentityMapping,false);}
  assert.equal(OTHER_LENS_SOURCES.filter(source=>source.siteId==='kane').length,2);assert.equal(OTHER_LENS_EXACT_MODELS.filter(model=>model.aliases[0].siteId==='kane').length,6);
  const zcb=OTHER_LENS_MEMBERSHIPS.kane.find(option=>option.value==='4');assert.equal(zcb.siteParameters.aConstant,'119.36');assert.notEqual(zcb.siteParameters.aConstant,OTHER_LENS_MEMBERSHIPS['solver-regular'].find(option=>option.label==='PCB00/ZCB00').siteParameters.aConstant);
});


test('manufacturer-verified Aspire/Envy variants project to their own Kane family without becoming exact aliases',()=>{
  const families={'27':['EA','EPA'],'28':['ETA','ETPA'],'29':['EN','EPN'],'30':['ETN','ETPN']};
  for(const [value,codes]of Object.entries(families)){
    const option=OTHER_LENS_MEMBERSHIPS.kane.find(option=>option.value===value);assert.equal(option.kind,'family');assert.deepEqual(option.memberCodes,codes);assert.equal(option.membershipEvidenceUrl,'https://ifu.bausch.com/archive/');
    assert.equal(OTHER_LENS_EXACT_MODELS.some(model=>codes.includes(model.modelCode)),false);
  }
});

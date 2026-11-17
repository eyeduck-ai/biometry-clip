import assert from 'node:assert/strict';
import test from 'node:test';
import {deriveRequirements} from '../src/requirements.js';
import {emptyCase} from '../src/model.js';

const field=(key,eye,extra={})=>({key,eye,visible:true,available:true,required:false,declaredRequired:false,domRequired:false,status:'ready',...extra});
const profile={id:'bilateral',eyeMode:'both',required:['al','target','patient.gender'],requiredAny:[['aConstant','lensFactor']],fields:[]};
const inventory=fields=>({siteId:'bilateral',eyeMode:'both',fields});

test('live per-eye requirements include DOM constraints and retain optional visible fields',()=>{
  const data=emptyCase();data.eyes.OD={al:'23',target:'0'};data.patient.gender='female';
  const result=deriveRequirements(profile,inventory([
    field('al','OD',{required:true,declaredRequired:true}),field('al','OS',{required:true,declaredRequired:true}),
    field('target','OD',{required:true,declaredRequired:true}),field('target','OS',{required:true,declaredRequired:true}),
    field('lt','OD',{required:true,domRequired:true}),field('cct','OD'),field('patient.gender','patient',{required:true,declaredRequired:true}),
    field('aConstant','shared'),field('lensFactor','shared'),
  ]),'OD',data);
  assert.deepEqual(result.requiredKeys,['al','target','lt','patient.gender']);assert.ok(result.availableKeys.includes('cct'));
  assert.deepEqual(result.missing.map(row=>row.key),['lt']);assert.equal(result.fields.find(row=>row.key==='cct').optional,true);
  assert.ok(result.fields.every(row=>row.eye!=='OS'));assert.equal(result.requiredAny[0].missing,true);
});

test('bilateral requirements identify the exact missing eye without treating target zero as empty',()=>{
  const p={...profile,required:['al','target'],requiredAny:[]},data=emptyCase();data.eyes.OD={al:'23',target:'0'};data.eyes.OS.target='0';
  const result=deriveRequirements(p,inventory(['OD','OS'].flatMap(eye=>[field('al',eye,{required:true,declaredRequired:true}),field('target',eye,{required:true,declaredRequired:true})])),'OU',data);
  assert.deepEqual(result.missing,[{key:'al',eye:'OS',manual:false,reason:'尚未輸入'}]);assert.equal(result.capabilities.both,true);
});

test('hidden optional mode fields never become required just because they exist in the profile',()=>{
  const p={...profile,required:['al'],requiredAny:[]};
  const result=deriveRequirements(p,inventory([field('al','OD',{required:true,declaredRequired:true}),field('tk1','OD',{visible:false,available:false,status:'missing'}),field('k1Axis','OS',{visible:false,available:false,status:'missing',mode:'toric'})]),'OD',emptyCase());
  const hidden=result.fields.find(row=>row.key==='tk1');assert.equal(hidden.required,false);assert.equal(hidden.optional,true);assert.equal(hidden.manual,false);
  assert.ok(!result.requiredKeys.includes('tk1'));assert.ok(!result.availableKeys.includes('tk1'));
});

test('required controls without safe mappings are explicit manual requirements',()=>{
  const p={id:'second',eyeMode:'single',required:['al','fellowAcd'],fields:[]};
  const result=deriveRequirements(p,{siteId:'second',fields:[field('al','current',{required:true,declaredRequired:true})]},'OS',emptyCase());
  const manual=result.fields.find(row=>row.key==='fellowAcd');assert.equal(manual.eye,'OS');assert.equal(manual.required,true);assert.equal(manual.manual,true);assert.equal(manual.status,'unmapped');
  assert.ok(result.missing.some(row=>row.key==='fellowAcd'&&row.manual));assert.equal(result.capabilities.both,false);
});

test('alternative shared constants require one value, never both',()=>{
  const p={...profile,required:[]},data=emptyCase();data.eyes.OS.lensFactor='2.1';
  const result=deriveRequirements(p,inventory([field('aConstant','shared'),field('lensFactor','shared')]),'OU',data);
  assert.deepEqual(result.requiredKeys,[]);assert.equal(result.requiredAny[0].missing,false);assert.deepEqual(result.requiredAny[0].eyes,['shared']);assert.equal(result.requiredAny[0].manual,false);
});

test('layout signatures react to DOM mode/required changes but exclude patient measurement values',()=>{
  const p={id:'cooke',eyeMode:'both',required:['al'],fields:[]};
  const first={siteId:'cooke',fields:[field('al','OD',{required:true,declaredRequired:true}),field('patient.age','patient',{visible:false,available:false,status:'missing'})]};
  const data=emptyCase(),a=deriveRequirements(p,first,'OD',data);data.eyes.OD.al='PRIVATE-VALUE';
  const b=deriveRequirements(p,first,'OD',data);assert.equal(a.signature,b.signature);assert.ok(!b.signature.includes('PRIVATE'));
  const second={siteId:'cooke',fields:[...first.fields.slice(0,1),field('patient.age','patient',{required:true,domRequired:true})]};
  const c=deriveRequirements(p,second,'OD',data);assert.notEqual(a.signature,c.signature);assert.ok(c.requiredKeys.includes('patient.age'));
});

test('an inventory from a previous website is not reused as current DOM evidence',()=>{
  const p={id:'new-site',eyeMode:'single',required:['al'],fields:[{key:'al',unit:'mm'}]};
  const result=deriveRequirements(p,{siteId:'old-site',fields:[field('cct','current',{required:true})]},'OD',emptyCase());
  assert.equal(result.detected,false);assert.deepEqual(result.availableKeys,[]);assert.equal(result.fields[0].key,'al');assert.equal(result.fields[0].available,null);assert.equal(result.fields[0].required,true);
});

test('unmapped native requirements stay manual label hints without creating editable data keys',()=>{
  const p={id:'native',eyeMode:'single',required:[],fields:[]};
  const result=deriveRequirements(p,{siteId:'native',fields:[],unmappedRequired:[{label:'IOL model',type:'select-one',reason:'此項需在原網站手動完成'}]},'OD',emptyCase());
  assert.deepEqual(result.fields,[]);assert.deepEqual(result.requiredKeys,[]);assert.equal(result.unmappedRequired[0].label,'IOL model');assert.ok(result.signature.includes('IOL model'));
});

test('OD, OS and OU requirement inventories retain only their selected eye rows and shared controls once',()=>{
  const p={id:'matrix',eyeMode:'both',required:['al'],fields:[]};
  const live={siteId:'matrix',fields:[field('al','OD',{required:true,declaredRequired:true}),field('al','OS',{required:true,declaredRequired:true}),field('tk1','OD'),field('cct','OS'),field('aConstant','shared'),field('patient.age','patient')]};
  for(const [scope,expected] of [['OD',[['al','OD'],['tk1','OD'],['aConstant','shared'],['patient.age','patient']]],['OS',[['al','OS'],['cct','OS'],['aConstant','shared'],['patient.age','patient']]],['OU',[['al','OD'],['al','OS'],['tk1','OD'],['cct','OS'],['aConstant','shared'],['patient.age','patient']]]]){
    const result=deriveRequirements(p,live,scope,emptyCase());
    assert.deepEqual(result.fields.map(({key,eye})=>[key,eye]),expected);
    assert.equal(result.fields.filter(row=>row.eye==='patient').length,1);assert.equal(result.fields.filter(row=>row.eye==='shared').length,1);
    assert.deepEqual(result.missing.map(({eye})=>eye),scope==='OU'?['OD','OS']:[scope]);
  }
});

test('a hidden declared Toric field is neither required nor missing until its eye mode is shown',()=>{
  const p={id:'conditional',eyeMode:'both',required:['k1Axis'],fields:[]};
  const live={siteId:'conditional',fields:[field('k1Axis','OD',{mode:'toric',visible:false,available:false,declaredRequired:true,status:'missing'}),field('k1Axis','OS',{mode:'toric',required:true,declaredRequired:true})]};
  const od=deriveRequirements(p,live,'OD',emptyCase());assert.deepEqual(od.requiredKeys,[]);assert.deepEqual(od.missing,[]);assert.equal(od.fields[0].manual,false);
  const os=deriveRequirements(p,live,'OS',emptyCase());assert.deepEqual(os.requiredKeys,['k1Axis']);assert.deepEqual(os.missing.map(({key,eye})=>[key,eye]),[['k1Axis','OS']]);
  const ou=deriveRequirements(p,live,'OU',emptyCase());assert.deepEqual(ou.missing.map(({key,eye})=>[key,eye]),[['k1Axis','OS']]);
});

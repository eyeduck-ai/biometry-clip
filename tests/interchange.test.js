import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {emptyCase,EYE_FIELDS} from '../src/model.js';
import {exportCaseDocument,exportLibraryDocument,parseInterchange,INTERCHANGE_UNITS,INTERCHANGE_UNITS_V1_0} from '../src/interchange.js';

const at='2026-11-15T02:00:00.000Z';
function caseFixture(){const data=emptyCase();data.patient={...data.patient,patientId:'SYNTHETIC-A',name:'SYNTHETIC NOT A PATIENT',age:'70'};data.eyes={OD:{al:'23.45',target:'0',cct:'543',toric:false,lvcType:'none'},OS:{al:'24.10',target:'-0.50',cct:'551',toric:true,lvcType:'myopic',k1Axis:'85',k2Axis:'175',preLasikRefraction:'-3.00'}};return data;}
function libraryFixture(){const first=caseFixture(),second=caseFixture();second.eyes.OD.al='23.68';second.patient.age='71';return {version:1,revision:9,patients:[{id:'source-a',patient:second.patient,createdAt:at,updatedAt:at,measurements:[first,second].map((value,index)=>({id:`measurement-${index+1}`,label:`SYNTHETIC ${index+1}`,measuredAt:at,source:'SYNTHETIC DEVICE',patient:value.patient,eyes:value.eyes,createdAt:at,updatedAt:at}))},{id:'source-b',patient:{...first.patient,patientId:'SYNTHETIC-B'},createdAt:'',updatedAt:'',measurements:[]}]};}

test('versioned case roundtrip preserves independent eyes, empty fields, zero, negative refraction and false Toric',()=>{
  const data=caseFixture(),before=structuredClone(data),document=exportCaseDocument(data,{now:()=>at});
  assert.equal(document.format,'biometry-clipboard');assert.equal(document.schemaVersion,'1.3');assert.equal(document.kind,'case');assert.equal(document.exportedAt,at);
  assert.equal(document.units.cct,'um');assert.equal(document.units.al,'mm');assert.equal(document.units.target,'D');assert.equal(document.units.k1Axis,'deg');
  const result=parseInterchange(JSON.stringify(document));assert.equal(result.kind,'case');assert.deepEqual(result.data,data);assert.deepEqual(result.warnings,[]);assert.deepEqual(data,before);
  document.case.eyes.OD.al='99';assert.equal(data.eyes.OD.al,'23.45');
});

test('versioned library retains every patient, measurement and historical identity without exposing local revision',()=>{
  const library=libraryFixture(),before=structuredClone(library),document=exportLibraryDocument(library,{now:at});
  assert.equal('revision' in document,false);assert.equal(document.patients.length,2);
  const {kind,data}=parseInterchange(document);assert.equal(kind,'library');assert.equal(data.revision,0);assert.equal(data.patients[0].measurements.length,2);
  assert.equal(data.patients[0].patient.age,'71');assert.equal(data.patients[0].measurements[0].patient.age,'70');assert.equal(data.patients[0].measurements[1].eyes.OD.al,'23.68');
  assert.deepEqual(library,before);data.patients[0].measurements[0].eyes.OD.al='99';assert.equal(document.patients[0].measurements[0].eyes.OD.al,'23.45');
});

test('legacy case and library exports load with an explicit unit-assumption warning',()=>{
  const data=caseFixture(),library=libraryFixture();
  assert.deepEqual(parseInterchange(data).data,data);assert.equal(parseInterchange(data).warnings.length,1);
  assert.deepEqual(parseInterchange(library).data,library);assert.equal(parseInterchange(library).warnings.length,1);
  assert.equal(parseInterchange('\uFEFF'+JSON.stringify(data)).kind,'case');
});

test('wrong units and missing unit declarations are refused rather than converted',()=>{
  for(const change of [document=>document.units.cct='mm',document=>delete document.units.cct,document=>document.units.unrecognized='mm']){
    const document=exportCaseDocument(caseFixture(),{now:at});change(document);
    assert.throws(()=>parseInterchange(document),error=>['INTERCHANGE_UNITS','INTERCHANGE_SHAPE','INTERCHANGE_FIELD'].includes(error.code));
  }
});

test('unknown document versions and native QA reports cannot be imported as patient data',()=>{
  const document=exportCaseDocument(caseFixture(),{now:at});document.schemaVersion='2.0';assert.throws(()=>parseInterchange(document),{code:'INTERCHANGE_VERSION'});
  assert.throws(()=>parseInterchange({format:'biometry-native-qa-v1',sites:[],patients:[]}),{code:'INTERCHANGE_FORMAT'});
  assert.throws(()=>parseInterchange({...caseFixture(),version:2}),{code:'INTERCHANGE_VERSION'});
  assert.throws(()=>parseInterchange({...exportCaseDocument(caseFixture(),{now:at}),kind:'calculation-result'}),{code:'INTERCHANGE_KIND'});
});

test('missing and unknown eye structures are refused without copying data into another eye',()=>{
  for(const eyes of [{OD:{al:'23'}},{OD:{},OS:{},OU:{al:'23'}},{OD:[],OS:{}}])assert.throws(()=>parseInterchange({...caseFixture(),eyes}),error=>['INTERCHANGE_SHAPE','INTERCHANGE_FIELD'].includes(error.code));
  assert.throws(()=>parseInterchange({...caseFixture(),activeEye:'OU'}),{code:'INTERCHANGE_EYE'});
  const result=parseInterchange({...caseFixture(),eyes:{OD:{},OS:{al:'24.10'}}});assert.deepEqual(result.data.eyes.OD,{});assert.equal(result.data.eyes.OS.al,'24.10');
});

test('unknown or malformed fields cannot disappear silently during sanitization',()=>{
  const unknown=caseFixture();unknown.eyes.OD.axialLength='23';assert.throws(()=>parseInterchange(unknown),{code:'INTERCHANGE_FIELD'});
  const long=caseFixture();long.patient.name='a'.repeat(151);assert.throws(()=>parseInterchange(long),{code:'INTERCHANGE_VALUE'});
  const prototype=JSON.parse(JSON.stringify(caseFixture()));Object.defineProperty(prototype.eyes.OD,'__proto__',{value:{polluted:true},enumerable:true});assert.throws(()=>parseInterchange(prototype),{code:'INTERCHANGE_FIELD'});
  for(const value of ['true',1,null]){const item=caseFixture();item.eyes.OD.toric=value;assert.throws(()=>parseInterchange(item),{code:'INTERCHANGE_VALUE'});}
});

test('numbers normalize to decimal strings and never acquire implicit units or scientific notation',()=>{
  const data=caseFixture();data.eyes.OD.al=23.45;data.eyes.OD.target=0;data.eyes.OD.pca=0.0000001;data.patient.age=70;
  const result=parseInterchange(data).data;assert.equal(result.eyes.OD.al,'23.45');assert.equal(result.eyes.OD.target,'0');assert.equal(result.eyes.OD.pca,'0.0000001');assert.equal(result.patient.age,'70');
  for(const value of [NaN,Infinity,{},'23 mm','1e-7',' 23.45']){const invalid=caseFixture();invalid.eyes.OD.al=value;assert.throws(()=>parseInterchange(invalid),{code:'INTERCHANGE_VALUE'});}
});

test('axis bounds, positive core values and explicit supported LVC values are checked',()=>{
  for(const [field,value] of [['al','0'],['cct','-543'],['k1Axis','181'],['incisionAxis','361'],['lvcType','infer-from-k']]){
    const data=caseFixture();data.eyes.OD[field]=value;assert.throws(()=>parseInterchange(data),{code:'INTERCHANGE_VALUE'});
  }
  const data=caseFixture();data.eyes.OD.incisionAxis='360';assert.equal(parseInterchange(data).data.eyes.OD.incisionAxis,'360');
});

test('duplicate source IDs are rejected before creating any import plan',()=>{
  const duplicatePatient=libraryFixture();duplicatePatient.patients[1].id=duplicatePatient.patients[0].id;assert.throws(()=>parseInterchange(duplicatePatient),{code:'INTERCHANGE_ID'});
  const duplicateMeasurement=libraryFixture();duplicateMeasurement.patients[0].measurements[1].id=duplicateMeasurement.patients[0].measurements[0].id;assert.throws(()=>parseInterchange(duplicateMeasurement),{code:'INTERCHANGE_ID'});
});

test('timestamps retain explicit timezones and malformed calendar dates are rejected',()=>{
  const document=exportCaseDocument(caseFixture(),{now:'2026-11-15T10:00:00+08:00'});assert.equal(document.exportedAt,at);
  for(const value of ['2026-11-15','2026-11-15T02:00:00','2026-02-31T02:00:00Z'])assert.throws(()=>parseInterchange({...document,exportedAt:value}),{code:'INTERCHANGE_DATE'});
  const library=libraryFixture();library.patients[0].measurements[0].measuredAt='not-a-date';assert.throws(()=>parseInterchange(library),{code:'INTERCHANGE_DATE'});
});

test('committed schema and both actual exported examples agree on field and unit vocabulary',async()=>{
  const schema=JSON.parse(await readFile(new URL('../schemas/biometry-clipboard.schema.json',import.meta.url),'utf8'));
  assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');assert.deepEqual(Object.keys(schema.$defs.eye.properties).sort(),[...EYE_FIELDS].sort());
  assert.deepEqual(schema.oneOf[0].properties.units.const,INTERCHANGE_UNITS);assert.equal(schema.$defs.eye.additionalProperties,false);
  assert.equal(schema.oneOf.length,8);assert.equal(schema.oneOf[6].properties.schemaVersion.const,'1.0');assert.deepEqual(schema.oneOf[6].properties.units.const,INTERCHANGE_UNITS_V1_0);
  assert.equal(schema.$defs.eyeV1_0.properties.plannedIolPower,undefined);assert.equal(schema.$defs.eyeV1_0.additionalProperties,false);
  assert.equal(schema.oneOf[6].properties.case.$ref,'#/$defs/caseV1_0');assert.equal(schema.oneOf[7].properties.patients.items.$ref,'#/$defs/patientV1_0');
  for(const kind of ['case','library']){
    const data=JSON.parse(await readFile(new URL(`../examples/biometry-${kind}.synthetic.json`,import.meta.url),'utf8'));
    assert.equal(parseInterchange(data).kind,kind);assert.equal(data.patient,undefined);assert.match(JSON.stringify(data),/SYNTHETIC SOFTWARE TEST/);
    if(kind==='library')assert.equal(parseInterchange(data).data.patients[0].measurements.length,2);
  }
});

test('version 1.1 retains independent planned power values in cases and every historical measurement',()=>{
  const data=caseFixture();data.eyes.OD={...data.eyes.OD,plannedIolPower:'20.0',implantedIolPower:'19.5',fellowIolPower:'18.0'};data.eyes.OS.plannedIolPower='-1.0';
  const document=exportCaseDocument(data,{now:at});assert.equal(document.units.plannedIolPower,'D');assert.deepEqual(parseInterchange(document).data,data);
  const library=libraryFixture();library.patients[0].measurements[0].eyes.OD.plannedIolPower='20.0';library.patients[0].measurements[1].eyes.OD.plannedIolPower='0';
  const restored=parseInterchange(exportLibraryDocument(library,{now:at})).data;
  assert.equal(restored.patients[0].measurements[0].eyes.OD.plannedIolPower,'20.0');assert.equal(restored.patients[0].measurements[1].eyes.OD.plannedIolPower,'0');
  assert.equal(restored.patients[0].measurements[0].eyes.OS.plannedIolPower,undefined);
});

test('actual version 1.0 exports still load with their exact old units and do not invent planned power',async()=>{
  const oldSchema=JSON.parse(await readFile(new URL('../schemas/biometry-clipboard-1.0.schema.json',import.meta.url),'utf8'));
  assert.deepEqual(oldSchema.oneOf[0].properties.units.const,INTERCHANGE_UNITS_V1_0);assert.equal(oldSchema.$defs.eye.properties.plannedIolPower,undefined);
  for(const kind of ['case','library']){
    const document=JSON.parse(await readFile(new URL(`../examples/biometry-${kind}.v1.0.synthetic.json`,import.meta.url),'utf8'));
    assert.equal(document.schemaVersion,'1.0');assert.deepEqual(document.units,INTERCHANGE_UNITS_V1_0);
    const result=parseInterchange(document);assert.equal(result.kind,kind);assert.deepEqual(result.warnings,[]);
    const current=kind==='case'?exportCaseDocument(result.data,{now:at}):exportLibraryDocument(result.data,{now:at});
    assert.equal(current.schemaVersion,'1.3');assert.equal(current.units.plannedIolPower,'D');
    const values=kind==='case'?[current.case.eyes]:current.patients.flatMap(patient=>patient.measurements.map(measurement=>measurement.eyes));
    for(const eyes of values)for(const eye of ['OD','OS'])assert.equal(eyes[eye].plannedIolPower,undefined);
    assert.deepEqual(parseInterchange(current).data,result.data);
  }
});

test('old declared versions cannot smuggle new planned fields or unit declarations into either payload kind',()=>{
  for(const kind of ['case','library']){
    const current=kind==='case'?exportCaseDocument(caseFixture(),{now:at}):exportLibraryDocument(libraryFixture(),{now:at});
    current.schemaVersion='1.0';current.units=structuredClone(INTERCHANGE_UNITS_V1_0);
    const eyes=kind==='case'?current.case.eyes:current.patients[0].measurements[0].eyes;
    eyes.OD.plannedIolPower='20.0';assert.throws(()=>parseInterchange(current),{code:'INTERCHANGE_FIELD'});
    delete eyes.OD.plannedIolPower;current.units.plannedIolPower='D';assert.throws(()=>parseInterchange(current),{code:'INTERCHANGE_FIELD'});
  }
  for(const change of [document=>delete document.units.plannedIolPower,document=>document.units.plannedIolPower='mm']){
    const current=exportCaseDocument(caseFixture(),{now:at});change(current);assert.throws(()=>parseInterchange(current),error=>['INTERCHANGE_SHAPE','INTERCHANGE_UNITS'].includes(error.code));
  }
});

test('version tags remain strings and legacy raw snapshots retain new fields without implicit aliases',()=>{
  for(const schemaVersion of [1.1,['1.0'],null,{},'__proto__'])assert.throws(()=>parseInterchange({...exportCaseDocument(caseFixture(),{now:at}),schemaVersion}),{code:'INTERCHANGE_VERSION'});
  const raw=caseFixture();raw.eyes.OD.plannedIolPower='0';raw.eyes.OS.plannedIolPower='-2.0';const restored=parseInterchange(raw);
  assert.equal(restored.data.eyes.OD.plannedIolPower,'0');assert.equal(restored.data.eyes.OS.plannedIolPower,'-2.0');assert.equal(restored.data.eyes.OD.implantedIolPower,undefined);assert.equal(restored.warnings.length,1);
});


test('1.3 preserves initials, independent keratoconus and source lens selection through history',()=>{
  const data=caseFixture();data.patient.initials='SYN';Object.assign(data.eyes.OD,{keratoconus:true,lvcType:'unknown',iolSourceSite:'evo',iolSourceValue:'17',iolSourceLabel:'SYNTHETIC LENS',iolCatalogId:''});
  const document=exportCaseDocument(data,{now:at});assert.equal(document.schemaVersion,'1.3');assert.deepEqual(parseInterchange(document).data,data);
  const library=libraryFixture();library.patients[0].measurements[0].patient=data.patient;library.patients[0].measurements[0].eyes=data.eyes;
  const restored=parseInterchange(exportLibraryDocument(library,{now:at})).data.patients[0].measurements[0];
  assert.equal(restored.patient.initials,'SYN');assert.equal(restored.eyes.OD.iolSourceValue,'17');assert.equal(restored.eyes.OD.keratoconus,true);
});
test('literal 1.1 exports keep their frozen vocabulary, including absence of new source lens fields',async()=>{
  for(const kind of ['case','library']){
    const document=JSON.parse(await readFile(new URL(`../examples/biometry-${kind}.v1.1.synthetic.json`,import.meta.url),'utf8'));
    assert.equal(parseInterchange(document).kind,kind);
    const identity=kind==='case'?document.case.patient:document.patients[0].patient;
    identity.initials='SYN';assert.throws(()=>parseInterchange(document),{code:'INTERCHANGE_FIELD'});delete identity.initials;
    const eye=kind==='case'?document.case.eyes.OD:document.patients[0].measurements[0].eyes.OD;
    eye.iolSourceLabel='NEW';assert.throws(()=>parseInterchange(document),{code:'INTERCHANGE_FIELD'});
  }
});


test('1.3 source context roundtrips while literal 1.2 vocabulary stays frozen',async()=>{
 const data=caseFixture();Object.assign(data.eyes.OS,{iolSourceSite:'escrs',iolSourceControl:'OS.model',iolSourceManufacturer:'Johnson and Johnson Vision',iolSourceRole:'primary',iolSourceValue:'ZCB00',iolSourceLabel:'ZCB00',iolCatalogId:'johnson-zcb00'});
 assert.deepEqual(parseInterchange(exportCaseDocument(data,{now:at})).data,data);
 for(const kind of ['case','library']){
  const old=JSON.parse(await readFile(new URL(`../examples/biometry-${kind}.v1.2.synthetic.json`,import.meta.url),'utf8'));assert.equal(parseInterchange(old).kind,kind);
  const eye=kind==='case'?old.case.eyes.OD:old.patients[0].measurements[0].eyes.OD;eye.iolSourceControl='OD.model';assert.throws(()=>parseInterchange(old),{code:'INTERCHANGE_FIELD'});
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyCase} from '../src/model.js';
import {applyTransferDefaults,transferSettings} from '../src/transfer-defaults.js';

test('toric defaults follow each eye and never mutate stored measurements',()=>{
  const source=emptyCase();source.eyes={OD:{al:'23.45'},OS:{al:'24.1'}};const before=structuredClone(source);
  const result=applyTransferDefaults(source,{}, {id:'evo-toric'});
  assert.equal(result.eyes.OD.sia,'0.05');assert.equal(result.eyes.OS.sia,'0.05');
  assert.equal(result.eyes.OD.incisionAxis,'180');assert.equal(result.eyes.OS.incisionAxis,'0');
  assert.equal(result.eyes.OD.biometer,'IOLMaster 700');assert.equal(result.eyes.OD.lvcType,'none');
  assert.deepEqual(source,before);
});
test('explicit measurements, zero and LVC history win over preferences',()=>{
  const source=emptyCase();source.eyes.OD={al:'23',toric:true,sia:'0',incisionAxis:'0',biometer:'Argos',lvcType:'myopic'};
  const result=applyTransferDefaults(source,{defaultSia:'0.15',defaultIncisionAxisOD:'90',defaultBiometer:'Lenstar'});
  assert.deepEqual(result.eyes.OD,source.eyes.OD);assert.deepEqual(result.eyes.OS,{});
});
test('configurable defaults are used on hybrid Toric and leave non-toric fields absent',()=>{
  const source=emptyCase();source.eyes={OD:{al:'23',toric:true},OS:{al:'24',toric:false,lvcType:'unknown'}};
  const result=applyTransferDefaults(source,{defaultSia:'0.12',defaultIncisionAxisOD:'45',defaultIncisionAxisOS:'315',defaultBiometer:'Argos'});
  assert.equal(result.eyes.OD.sia,'0.12');assert.equal(result.eyes.OD.incisionAxis,'45');
  assert.equal(result.eyes.OS.sia,undefined);assert.equal(result.eyes.OS.lvcType,'unknown');
  assert.equal(result.eyes.OS.biometer,'Argos');
});
test('empty eyes never gain measurement defaults',()=>{
  assert.deepEqual(applyTransferDefaults(emptyCase(),{},{id:'barrett-toric'}).eyes,{OD:{},OS:{}});
});
test('old and malformed preferences migrate safely; invalid new settings cannot save',()=>{
  assert.equal(transferSettings({evoCctUnit:'mm'}).defaultSia,'0.05');
  assert.equal(transferSettings({defaultSia:'-0.1',defaultIncisionAxisOS:'361'}).defaultIncisionAxisOS,'0');
  for(const options of [{defaultSia:'-1'},{defaultIncisionAxisOD:'361'},{defaultSia:'abc'},{defaultBiometer:'a'.repeat(101)}])assert.throws(()=>transferSettings(options,{strict:true}));
  assert.equal(transferSettings({identityFallbacks:'false'}).identityFallbacks,false);
  assert.equal(transferSettings({defaultIncisionAxisOS:'0'},{strict:true}).defaultIncisionAxisOS,'0');
});

test('target, constant and fellow-eye values alone do not create measured-eye defaults',()=>{
  const source=emptyCase();source.eyes.OD={target:'0',aConstant:'118.7',fellowAl:'23.5'};
  assert.deepEqual(applyTransferDefaults(source,{},{category:'toric'}).eyes,source.eyes);
});

test('explicit Argos switch data wins over an incompatible default instrument',()=>{
  const source=emptyCase();source.eyes={OD:{al:'23',argos:'yes'},OS:{al:'24',argos:'no'}};
  assert.equal(applyTransferDefaults(source).eyes.OD.biometer,'Argos');
  assert.equal(applyTransferDefaults(source,{defaultBiometer:'Argos'}).eyes.OS.biometer,'Other');
  assert.equal(source.eyes.OD.biometer,undefined);
});

test('physician preference fills missing identity at transfer time and preserves explicit physician fields',()=>{
  const source=emptyCase();source.eyes.OD.al='23.4';
  assert.equal(applyTransferDefaults(source).patient.surgeonName,'OPH');
  assert.equal(applyTransferDefaults(source,{defaultSurgeonName:'Dr Example'}).patient.surgeonName,'Dr Example');
  assert.equal(source.patient.surgeonName,'');
  source.patient.surgeonName='Entered surgeon';
  assert.equal(applyTransferDefaults(source).patient.surgeonName,'Entered surgeon');
  source.patient.surgeonName='';source.patient.surgeonId='SUR-TEST';
  assert.equal(applyTransferDefaults(source).patient.surgeonName,'');
  assert.equal(applyTransferDefaults(source).patient.surgeonId,'SUR-TEST');
  assert.equal(transferSettings({defaultSurgeonName:'  OPH  '}).defaultSurgeonName,'OPH');
  assert.throws(()=>transferSettings({defaultSurgeonName:'x'.repeat(151)},{strict:true}));
});

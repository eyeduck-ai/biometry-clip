import test from 'node:test';
import assert from 'node:assert/strict';
import {ESCRS_PARAMETER_KEYS,validateEscrsConstants,queryEscrsConstants,summarizeEscrsConstants} from '../src/escrs-constants.js';
function fixture(){return {format:'biometry-escrs-formula-constants',schemaVersion:'1.0',formulas:ESCRS_PARAMETER_KEYS.map(key=>({key,label:key})),rows:[
  {id:'a',manufacturer:'Alcon',mode:'non-toric',optionIndex:0,label:'SN60WF',parameters:Object.fromEntries(ESCRS_PARAMETER_KEYS.map((k,i)=>[k,{rawValue:i===4?null:'119.0',status:i===4?'blank':'observed'}]))},
  {id:'b',manufacturer:'Alcon',mode:'toric',optionIndex:0,label:'SN6AT',parameters:Object.fromEntries(ESCRS_PARAMETER_KEYS.map(k=>[k,{rawValue:null,status:'not-collected'}]))},
]};}
test('research lookup separates original blank constants from rows awaiting collection',()=>{
  const d=validateEscrsConstants(fixture()),summary=summarizeEscrsConstants(d);
  assert.equal(summary.checkedRows,1);assert.equal(summary.completeSevenRows,0);assert.equal(summary.observed,6);assert.equal(summary.blank,1);assert.equal(summary.notCollected,7);
  assert.deepEqual(queryEscrsConstants(d,{query:'sn60wf'}).map(r=>r.id),['a']);
  assert.deepEqual(queryEscrsConstants(d,{status:'not-collected'}).map(r=>r.id),['b']);
  assert.deepEqual(queryEscrsConstants(d,{manufacturer:'Alcon',mode:'toric'}).map(r=>r.id),['b']);
});
test('query files reject duplicate identities, inferred blank values and incomplete formula states',()=>{
  for(const mutate of [d=>{d.rows[1].id='a';},d=>{d.rows[0].parameters.hofferPacd.rawValue='5.67';},d=>{delete d.rows[0].parameters.kaneAConstant;},d=>{d.formulas.pop();},d=>{d.rows[0].parameters.kaneAConstant.rawValue='N/A';}]){
    const d=fixture();mutate(d);assert.throws(()=>validateEscrsConstants(d));
  }
});

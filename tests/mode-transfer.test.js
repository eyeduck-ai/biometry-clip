import test from 'node:test';
import assert from 'node:assert/strict';
import {createTabTransfer} from '../src/tab-transfer.js';
import {emptyCase} from '../src/model.js';
import {SITES} from '../src/sites.js';

function setup({onSleep=()=>{},custom=false,contradict=false}={}){
  const profile=SITES.find(site=>site.id===(custom?'solver-regular':'evo')),source=emptyCase();source.eyes.OD={al:'23.45',lvcType:'myopic',biometer:custom?'Argos':'IOLMaster 700'};
  const session={data:source,caseToken:'case',revision:1},tab={id:9,url:profile.url,status:'complete'},listeners=new Set(),calls=[];
  let time=0,value=custom?'Other':'none',pending='',documentId='before',open=false;
  const emit=status=>{tab.status=status;for(const listener of listeners)listener(9,{status},tab);};
  const chrome={tabs:{get:async()=>({...tab}),onUpdated:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}},scripting:{executeScript:async request=>{
    const [action,p,data,options]=request.args;assert.equal(Object.values(options).some(value=>typeof value==='function'),false);calls.push(action);
    const desired=custom?'Argos (SOS-AL)':data.eyes.OD.lvcType||'',state={index:0,key:custom?'biometer':'lvcType',eye:custom?'shared':'OD',requested:desired,value,available:true,status:'ready',menuOpen:open};
    const result={siteId:p.id,url:tab.url,eyeMode:p.eyeMode,detectedEye:'OD',canSelectEye:true,modeControls:[state],rows:[],fields:[]};
    if(action==='prepare-modes'){
      if(custom){if(!open){open=true;result.modePreparation={phase:'opened',changed:true};}else{value=desired;open=false;result.modePreparation={phase:'selected',changed:true};}}
      else {pending=desired;emit('loading');throw new Error('Execution context was destroyed');}
    }
    if(action==='preview'){
      assert.equal(value,desired);assert.equal(tab.status,'complete');
      result.rows=[{key:'al',eye:'OD',value:'23.45',previous:'',mappedValue:'23.45',locator:'#al',status:'ready'}];
    }
    if(action==='apply')result.rows=options.expected.map(row=>({...row,status:'filled'}));
    if(contradict&&action==='inspect'&&calls.filter(value=>value==='inspect').length>7)result.modeControls[0].value='none';
    return [{frameId:0,documentId,result}];
  }}};
  const engine=createTabTransfer(chrome,{now:()=>time,readSession:async()=>structuredClone(session),sleep:async ms=>{time+=ms;if(pending){value=pending;pending='';documentId='after';emit('complete');}await onSleep({session,tab,calls});}});
  return {engine,source,session,tab,calls,listeners};
}

test('EVO waits for LVC postback before field preview, surviving destroyed executeScript response',async()=>{
  const f=setup(),before=structuredClone(f.source),result=await f.engine.quickFill(9,f.source,{eye:'OD',caseToken:'case',revision:1});
  assert.equal(result.rows[0].status,'filled');assert.equal(result.navigated,true);assert.equal(result.modePreparation.controls[0].status,'applied');assert.ok(f.calls.indexOf('prepare-modes')<f.calls.indexOf('preview'));assert.deepEqual(f.source,before);assert.equal(f.listeners.size,0);
});

test('a case change or departure during LVC postback prevents every measurement write',async()=>{
  const f=setup({onSleep:({session})=>session.revision++});await assert.rejects(f.engine.quickFill(9,f.source,{eye:'OD',caseToken:'case',revision:1}),error=>error.code==='CASE_CHANGED');assert.equal(f.calls.includes('apply'),false);assert.equal(f.listeners.size,0);
  const departed=setup({onSleep:({tab})=>tab.url='https://www.evoiolcalculator.com/Toric.aspx'});await assert.rejects(departed.engine.quickFill(9,departed.source,{eye:'OD',caseToken:'case',revision:1}),error=>error.code==='TARGET_CHANGED');assert.equal(departed.calls.includes('apply'),false);assert.equal(departed.listeners.size,0);
});

test('DGS custom biometer preparation opens then selects its linked option before preview',async()=>{
  const f=setup({custom:true}),result=await f.engine.quickFill(9,f.source,{eye:'OD',caseToken:'case',revision:1});
  assert.equal(f.calls.filter(action=>action==='prepare-modes').length,2);assert.equal(result.rows[0].status,'filled');assert.equal(result.modePreparation.controls[0].value,'Argos (SOS-AL)');assert.equal(result.navigated,false);
});

function resetEyeSetup({alwaysReset=false,caseChangesOnRecovery=false,manualEye=false}={}){
  const profile=SITES.find(site=>site.id==='evo'),data=emptyCase();data.eyes.OD={al:'23.45',lvcType:'none'};data.eyes.OS={al:'24.10',lvcType:'myopic'};
  const session={data,caseToken:'case',revision:1},tab={id:10,url:profile.url,status:'complete'},listeners=new Set(),calls=[];
  let time=0,eye=manualEye?'':'OD',value='none',pending='',documentId='initial',modeChanges=0,eyeChanges=0;
  const emit=status=>{tab.status=status;for(const fn of listeners)fn(10,{status},tab);};
  const chrome={tabs:{get:async()=>({...tab}),onUpdated:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}},scripting:{executeScript:async request=>{
    const [action,p,source,options]=request.args;calls.push({action,eye:options.eye,eyeConfirmed:options.eyeConfirmed});
    const desired=source.eyes[options.eye]?.lvcType||'';
    const state={index:0,key:'lvcType',eye:options.eye,requested:desired,value,available:true,status:'ready'};
    const result={siteId:p.id,url:tab.url,eyeMode:'single',detectedEye:eye,canSelectEye:!manualEye,modeControls:[state],rows:[],fields:[]};
    if(action==='select-eye'){
      eye=options.eye;eyeChanges++;if(eyeChanges===2)value='none';
      if(caseChangesOnRecovery&&eyeChanges===2)session.revision++;
    }
    if(action==='prepare-modes'){
      assert.equal(manualEye||eye===options.eye,true);modeChanges++;pending=desired;emit('loading');throw new Error('Execution context was destroyed');
    }
    if(action==='preview'){
      assert.equal(eye,'OS');assert.equal(value,'myopic');assert.equal(options.eyeConfirmed,false);
      result.rows=[{key:'al',eye:'OS',value:source.eyes.OS.al,previous:'',mappedValue:source.eyes.OS.al,locator:'#al',status:'ready'}];
    }
    if(action==='apply'){assert.equal(eye,'OS');result.rows=options.expected.map(row=>({...row,status:'filled'}));}
    return [{frameId:0,documentId,result}];
  }}};
  const engine=createTabTransfer(chrome,{readSession:async()=>structuredClone(session),now:()=>time,sleep:async ms=>{
    time+=ms;if(pending){value=pending;pending='';if(modeChanges===1||alwaysReset)eye=manualEye?'':'OD';documentId=`mode-${modeChanges}`;emit('complete');}
  }});
  return {engine,data,calls,listeners,counts:()=>({modeChanges,eyeChanges})};
}

test('OS mode postback that resets OD is recovered once, with modes re-prepared before filling OS',async()=>{
  const f=resetEyeSetup(),result=await f.engine.quickFill(10,f.data,{eye:'OS',eyeConfirmed:true,caseToken:'case',revision:1});
  assert.equal(result.rows[0].eye,'OS');assert.equal(result.rows[0].value,'24.10');assert.equal(result.rows[0].status,'filled');assert.deepEqual(f.counts(),{modeChanges:2,eyeChanges:2});assert.equal(f.listeners.size,0);
  const secondMode=f.calls.filter(call=>call.action==='prepare-modes')[1];assert.equal(secondMode.eyeConfirmed,false);assert.equal(result.navigated,true);
});

test('an eye/mode reset cycle is bounded and cannot write either eye',async()=>{
  const f=resetEyeSetup({alwaysReset:true});await assert.rejects(f.engine.quickFill(10,f.data,{eye:'OS',eyeConfirmed:true,caseToken:'case',revision:1}),error=>error.code==='MODE_EYE_CYCLE');
  assert.deepEqual(f.counts(),{modeChanges:2,eyeChanges:2});assert.equal(f.calls.some(call=>call.action==='preview'||call.action==='apply'),false);assert.equal(f.listeners.size,0);
});

test('a source change during eye recovery stops before re-preparing modes or writing',async()=>{
  const f=resetEyeSetup({caseChangesOnRecovery:true});await assert.rejects(f.engine.quickFill(10,f.data,{eye:'OS',caseToken:'case',revision:1}),error=>error.code==='CASE_CHANGED');
  assert.equal(f.counts().modeChanges,1);assert.equal(f.calls.some(call=>call.action==='apply'),false);assert.equal(f.listeners.size,0);
});

test('manual eye confirmation cannot survive mode navigation into an unidentifiable eye',async()=>{
  const f=resetEyeSetup({manualEye:true});await assert.rejects(f.engine.quickFill(10,f.data,{eye:'OS',eyeConfirmed:true,caseToken:'case',revision:1}),error=>error.code==='EYE_UNCONFIRMED');
  assert.equal(f.counts().modeChanges,1);assert.equal(f.calls.some(call=>call.action==='preview'||call.action==='apply'),false);assert.equal(f.listeners.size,0);
});

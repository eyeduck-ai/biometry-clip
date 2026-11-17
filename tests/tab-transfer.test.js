import test from 'node:test';
import assert from 'node:assert/strict';
import {createTabTransfer} from '../src/tab-transfer.js';
import {emptyCase} from '../src/model.js';
import {SITES} from '../src/sites.js';

function fixture({siteId='barrett-universal',eye='',canSelectEye=true,interrupted=false,onSleep=()=>{},displayState,displayPostback=false,displayResetEye=false,displayInterrupted=false,refuseDisplay=false}={}) {
  const profile=SITES.find(site=>site.id===siteId),data=emptyCase();data.eyes.OD.al='23.45';data.eyes.OS.al='24.10';
  let time=0,selected=eye,documentId='before',pending=false,pendingDisplay=false,display=displayState&&structuredClone(displayState);
  const calls=[],listeners=new Set(),tab={id:42,url:profile.url,status:'complete'},session={caseToken:'case-1',revision:3,data};
  const emit=status=>{tab.status=status;for(const listener of listeners)listener(tab.id,{status},tab);};
  const chromeApi={tabs:{get:async()=>({...tab}),onUpdated:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}},scripting:{executeScript:async request=>{
    const [action,p,source,options]=request.args;calls.push({action,options,source});
    const result={siteId:p.id,url:tab.url,eyeMode:p.eyeMode,detectedEye:selected,canSelectEye,rows:[],fields:[]};
    if(display)result.displayPreferences={cylinderConvention:structuredClone(display)};
    if(action==='select-eye'){
      assert.equal(options.eye==='OD'||options.eye==='OS',true);pending=options.eye;emit('loading');
      if(interrupted)throw new Error('Execution context was destroyed');
      result.autoEyeSelected=true;
    }
    if(action==='apply-display'){
      const requested=options.cylinderConvention??'minus';
      result.displayPreference={requested,value:display?.value||'',status:refuseDisplay?'manual':'applied',changed:!refuseDisplay};
      if(!refuseDisplay){
        if(displayPostback){pendingDisplay=requested;emit('loading');if(displayInterrupted)throw new Error('Execution context was destroyed');}
        else display.value=requested;
      }
    }
    if(action==='preview')result.rows=[{eye:options.eye,key:'al',value:source.eyes[options.eye==='OU'?'OD':options.eye].al,status:'ready',locator:'#al',previous:'',mappedValue:'23.45'}];
    if(action==='apply')result.rows=[{...options.expected[0],status:'filled'}];
    return [{frameId:0,documentId,result}];
  }}};
  const engine=createTabTransfer(chromeApi,{readSession:async()=>structuredClone(session),now:()=>time,sleep:async ms=>{time+=ms;if(pending){selected=pending;pending=false;documentId='after';emit('complete');}if(pendingDisplay){display.value=pendingDisplay;pendingDisplay=false;documentId='display-after';if(displayResetEye)selected='';emit('complete');}await onSleep({tab,session,calls});}});
  return {engine,calls,session,data,tab,listeners};
}

test('quick fill reads the guarded saved source and fills a bilateral tab without selecting an eye',async()=>{
  const f=fixture(),result=await f.engine.quickFill(42,f.data,{eye:'OU',caseToken:'case-1',revision:3});
  assert.deepEqual(f.calls.map(call=>call.action),['inspect','preview','apply']);assert.equal(result.rows[0].status,'filled');assert.equal(result.autoEyeSelected,false);assert.equal(result.previewCount,1);
  assert.equal(f.calls.at(-1).options.expectedFrameUrl,f.tab.url);assert.equal(f.calls.at(-1).options.includeConstants,undefined);
});

test('a service-worker fill survives eye-select postback and its destroyed caller context',async()=>{
  const f=fixture({siteId:'barrett-toric',interrupted:true});
  const result=await f.engine.quickFill(42,f.data,{eye:'OS',caseToken:'case-1',revision:3});
  assert.equal(result.navigated,true);assert.equal(result.autoEyeSelected,true);assert.equal(result.documentId,'after');
  assert.equal(f.calls.find(call=>call.action==='apply').options.eye,'OS');assert.equal(f.calls.find(call=>call.action==='apply').source.eyes.OS.al,'24.10');assert.equal(f.listeners.size,0);
});

test('case changes during postback stop the transfer before preview or measurement writes',async()=>{
  const f=fixture({siteId:'barrett-toric',onSleep:({session})=>{session.revision++;}});
  await assert.rejects(f.engine.quickFill(42,f.data,{eye:'OD',caseToken:'case-1',revision:3}),error=>error.code==='CASE_CHANGED'&&error.navigated);
  assert.equal(f.calls.some(call=>['preview','apply'].includes(call.action)),false);assert.equal(f.listeners.size,0);
});

test('navigation to another formula during eye selection never receives pasted fields',async()=>{
  const f=fixture({siteId:'barrett-toric',onSleep:({tab})=>{tab.url='https://calc.apacrs.org/barrett_rx105/';}});
  await assert.rejects(f.engine.quickFill(42,f.data,{eye:'OD',caseToken:'case-1',revision:3}),error=>error.code==='TARGET_CHANGED');assert.equal(f.calls.some(call=>call.action==='apply'),false);assert.equal(f.listeners.size,0);
});

test('unknown eyes without safe radio controls need an explicit user eye confirmation',async()=>{
  const f=fixture({siteId:'evo',canSelectEye:false});
  await assert.rejects(f.engine.quickFill(42,f.data,{eye:'OD',caseToken:'case-1',revision:3}),error=>error.code==='EYE_UNCONFIRMED');assert.equal(f.calls.some(call=>call.action==='apply'),false);
  const manual=await f.engine.quickFill(42,f.data,{eye:'OD',eyeConfirmed:true,caseToken:'case-1',revision:3});assert.equal(manual.rows[0].status,'filled');assert.equal(manual.autoEyeSelected,false);
});

test('stale case guards or modified supplied values cannot start website interactions',async()=>{
  const f=fixture();await assert.rejects(f.engine.quickFill(42,f.data,{eye:'OD',caseToken:'old',revision:3}),error=>error.code==='CASE_CHANGED');
  const modified=structuredClone(f.data);modified.eyes.OD.al='29';await assert.rejects(f.engine.quickFill(42,modified,{eye:'OD',caseToken:'case-1',revision:3}),error=>error.code==='CASE_CHANGED');assert.equal(f.calls.length,0);
});

test('switching only local activeEye does not reject an otherwise exact saved source',async()=>{
  const f=fixture(),source=structuredClone(f.data);source.activeEye='OS';const result=await f.engine.quickFill(42,source,{eye:'OS',caseToken:'case-1',revision:3});assert.equal(result.rows[0].status,'filled');
});

const availableDisplay={status:'ready',value:'plus',available:true};
test('quick fill defaults to minus before preview without modifying the saved measurements',async()=>{
  const f=fixture({siteId:'barrett-toric',eye:'OD',displayState:availableDisplay}),before=structuredClone(f.session.data);
  const result=await f.engine.quickFill(42,f.data,{eye:'OD',caseToken:'case-1',revision:3});
  assert.equal(result.displayPreference.status,'applied');assert.equal(result.displayPreference.value,'minus');assert.equal(f.calls.findIndex(call=>call.action==='apply-display')<f.calls.findIndex(call=>call.action==='preview'),true);assert.deepEqual(f.session.data,before);assert.equal(f.listeners.size,0);
});

test('preserve skips convention changes, while unavailable controls remain manual and do not block fields',async()=>{
  const f=fixture({siteId:'barrett-toric',eye:'OD',displayState:availableDisplay});
  const preserved=await f.engine.quickFill(42,f.data,{eye:'OD',cylinderConvention:'preserve',caseToken:'case-1',revision:3});assert.equal(preserved.displayPreference.status,'preserved');assert.equal(f.calls.some(call=>call.action==='apply-display'),false);assert.equal(preserved.rows[0].status,'filled');
  const disabled=fixture({siteId:'barrett-toric',eye:'OD',displayState:{...availableDisplay,status:'manual',available:false}});
  const result=await disabled.engine.quickFill(42,disabled.data,{eye:'OD',caseToken:'case-1',revision:3});assert.equal(result.displayPreference.status,'manual');assert.equal(result.rows[0].status,'filled');assert.equal(result.warnings.length,1);assert.equal(disabled.calls.some(call=>call.action==='apply-display'),false);
});

test('display navigation survives its destroyed caller and invalidates old manual eye confirmation',async()=>{
  const f=fixture({siteId:'barrett-toric',eye:'OS',displayState:availableDisplay,displayPostback:true,displayInterrupted:true});
  const result=await f.engine.quickFill(42,f.data,{eye:'OS',eyeConfirmed:true,caseToken:'case-1',revision:3});
  assert.equal(result.navigated,true);assert.equal(result.displayPreference.value,'minus');assert.equal(f.calls.find(call=>call.action==='preview').options.eyeConfirmed,false);assert.equal(f.calls.find(call=>call.action==='apply').options.eyeConfirmed,false);assert.equal(f.listeners.size,0);
});

test('a preference that resets eye selection is followed by a verified radio re-selection',async()=>{
  const f=fixture({siteId:'barrett-toric',eye:'OS',displayState:availableDisplay,displayPostback:true,displayResetEye:true});
  const result=await f.engine.quickFill(42,f.data,{eye:'OS',caseToken:'case-1',revision:3});
  const preference=f.calls.findIndex(call=>call.action==='apply-display'),eye=f.calls.findIndex(call=>call.action==='select-eye'),preview=f.calls.findIndex(call=>call.action==='preview');
  assert.equal(preference<eye&&eye<preview,true);assert.equal(result.detectedEye,'OS');assert.equal(result.displayPreference.value,'minus');assert.equal(result.navigated,true);assert.equal(result.autoEyeSelected,true);assert.equal(f.listeners.size,0);
});

test('case or destination changes during display selection abort before any measurement write',async()=>{
  for(const targetChange of [false,true]){
    const f=fixture({siteId:'barrett-toric',eye:'OD',displayState:availableDisplay,onSleep:({session,tab})=>{if(targetChange)tab.url='https://calc.apacrs.org/barrett_rx105/';else session.revision++;}});
    await assert.rejects(f.engine.quickFill(42,f.data,{eye:'OD',caseToken:'case-1',revision:3}),error=>error.code===(targetChange?'TARGET_CHANGED':'CASE_CHANGED'));assert.equal(f.calls.some(call=>['preview','apply'].includes(call.action)),false);assert.equal(f.listeners.size,0);
  }
});

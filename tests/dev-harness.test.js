import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {emptyCase} from '../src/model.js';
import {SITES} from '../src/sites.js';
import {UI_LANGUAGE_KEY} from '../src/ui-language.js';

test('HTTP-only development host preserves patient records through tab switches, locale changes and blank-srcdoc retry',async t=>{
  const html=await readFile(new URL('../src/dev/floating-preview.html',import.meta.url),'utf8');
  const dom=new JSDOM(html,{url:'http://127.0.0.1:41867/src/dev/floating-preview.html'});
  const keys=['window','document','location','getComputedStyle','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','Event'];
  const saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='getComputedStyle'?dom.window.getComputedStyle.bind(dom.window):dom.window[key]});
  t.after(()=>{for(const [key,descriptor]of saved)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];dom.window.close();});
  dom.window.HTMLElement.prototype.getClientRects=function(){return this.hidden||this.closest('[hidden]')?[]:[{x:0,y:0,width:80,height:24}];};
  // jsdom does not instantiate browsing contexts for iframes in shadow roots.
  // Keep only that transport endpoint synthetic; the host routes real stores.
  const panelWindow={postMessage(){}};
  Object.defineProperty(dom.window.HTMLIFrameElement.prototype,'contentWindow',{configurable:true,get:()=>panelWindow});
  // Drive only the shell's window-owned deadline without waiting 12 seconds.
  // This fixture does not instantiate an installed extension or browser frame.
  const readinessTimers=new Map();let timerSequence=0;
  dom.window.setTimeout=callback=>{const id=++timerSequence;readinessTimers.set(id,callback);return id;};
  dom.window.clearTimeout=id=>readinessTimers.delete(id);
  let shellRoot;
  const attach=dom.window.HTMLElement.prototype.attachShadow;
  dom.window.HTMLElement.prototype.attachShadow=function(options){const root=attach.call(this,options);if(this.id==='biometry-clipboard-floating')shellRoot=root;return root;};
  await import(`../src/dev/floating-preview.js?integration=${crypto.randomUUID()}`);
  const frame=shellRoot.querySelector('iframe'),channel=new URL(frame.src).searchParams.get('qaChannel');
  function panelStatus(overrides={},eventOverrides={}){
    const query=new URL(frame.src).searchParams;
    dom.window.dispatchEvent(new dom.window.MessageEvent('message',{origin:dom.window.location.origin,source:frame.contentWindow,...eventOverrides,data:{type:'qa:panel-status',qaChannel:channel,phase:'ready',panelToken:query.get('panelToken'),tabId:Number(query.get('tabId')),...overrides}}));
  }
  let sequence=0;
  async function rpc(method,...args){
    const id=String(++sequence);
    return new Promise((resolve,reject)=>{
      frame.contentWindow.postMessage=message=>{
        if(message.type!=='qa:response'||message.id!==id)return;
        message.error?reject(new Error(message.error)):resolve(message.value);
      };
      dom.window.dispatchEvent(new dom.window.MessageEvent('message',{origin:dom.window.location.origin,source:frame.contentWindow,data:{type:'qa:request',qaChannel:channel,id,method,args}}));
    });
  }
  const message=payload=>rpc('runtime.sendMessage',payload);
  const profile=SITES.find(site=>site.id==='barrett-universal');
  const inspection=(await rpc('scripting.executeScript',{target:{tabId:101},args:['inspect',profile,emptyCase(),{eye:'OU'}]}))[0].result;
  assert.equal(inspection.capabilities.both,true);
  assert.ok(inspection.fields.some(field=>field.eye==='OD'&&field.key==='al'&&field.available));
  assert.ok(inspection.fields.some(field=>field.eye==='OS'&&field.key==='al'&&field.available));
  assert.equal(inspection.fields.some(field=>Object.hasOwn(field,'value')),false);
  const result=(await rpc('scripting.executeScript',{target:{tabId:101},args:['read',profile,emptyCase(),{eye:'OU',includeIdentifiers:true}]}))[0].result;
  assert.equal(result.rows.find(row=>row.eye==='OD'&&row.key==='al').value,'23.45');
  assert.equal(result.rows.find(row=>row.eye==='OS'&&row.key==='al').value,'24.10');
  const data=emptyCase();data.patient={...data.patient,patientId:'DEMO-ONLY',name:'DEMO — SYNTHETIC ONLY'};
  for(const row of result.rows.filter(row=>row.status==='read'&&!row.key.startsWith('patient.'))){
    if(row.eye==='shared')for(const eye of ['OD','OS'])data.eyes[eye][row.key]=row.value;
    else data.eyes[row.eye][row.key]=row.value;
  }
  let session=(await message({type:'biometry:session:read'})).session;
  session=(await message({type:'biometry:session:replace',data,caseToken:session.caseToken,revision:session.revision})).session;
  const created=(await message({type:'biometry:library:create-patient',patient:data.patient})).result;
  const save=async label=>message({type:'biometry:library:save-measurement',options:{patientId:created.patient.id,label,source:'SYNTHETIC QA',measuredAt:'2026-11-14T12:00:00Z',data:session.data,caseToken:session.caseToken,revision:session.revision}});
  const first=(await save('SYNTHETIC first')).result;
  session=(await message({type:'biometry:library:select-measurement',patientId:created.patient.id,measurementId:first.measurement.id,caseToken:session.caseToken,revision:session.revision})).result;
  session=(await message({type:'biometry:session:patch',patch:{eyes:{OS:{al:'24.35'}}},caseToken:session.caseToken})).session;
  const second=(await save('SYNTHETIC repeat')).result;
  assert.equal(second.patient.measurements.length,2);
  assert.equal(second.patient.measurements[0].eyes.OS.al,'24.10');
  assert.equal(second.patient.measurements[1].eyes.OS.al,'24.35');
  await rpc('tabs.update',202,{active:true});
  const fromOtherTab=(await message({type:'biometry:library:read'})).result;
  assert.equal(fromOtherTab.patients[0].measurements.length,2);
  assert.match(dom.window.document.querySelector('#library-readback').textContent,/SYNTHETIC repeat/);
  assert.equal((await message({type:'biometry:session:read'})).session.selection.measurementId,first.measurement.id);

  const sourceSession=(await message({type:'biometry:session:read'})).session;
  const quick=await message({type:'biometry:quick-fill',tabId:202,data:sourceSession.data,options:{eye:'OD',caseToken:sourceSession.caseToken,revision:sourceSession.revision}});
  assert.equal(quick.ok,true);assert.equal(dom.window.document.querySelector('#txtAL').value,'23.45');assert.equal(dom.window.document.querySelector('#txtAConstant').value,'');
  const left=await message({type:'biometry:quick-fill',tabId:202,data:sourceSession.data,options:{eye:'OS',caseToken:sourceSession.caseToken,revision:sourceSession.revision}});
  assert.equal(left.ok,true);assert.equal(dom.window.document.querySelector('#txtAL').value,'24.35');assert.equal(dom.window.document.querySelector('#RadioButtonRLEye_1').checked,true);
  assert.deepEqual((await message({type:'biometry:session:read'})).session,sourceSession);

  frame.dispatchEvent(new dom.window.Event('load'));
  panelStatus();
  const notice=shellRoot.querySelector('.panel-status'),retry=shellRoot.querySelector('.retry');
  assert.equal(notice.dataset.phase,'ready');assert.equal(notice.hidden,true);
  const sessionBefore=(await message({type:'biometry:session:read'})).session;
  const libraryBefore=(await message({type:'biometry:library:read'})).result;
  const sourceBefore=[...dom.window.document.querySelectorAll('#source-form input')].map(input=>[input.id,input.value]);
  const oldUrl=frame.src,oldToken=new URL(oldUrl).searchParams.get('panelToken');
  dom.window.document.querySelector('#simulate-srcdoc').click();
  assert.equal(frame.getAttribute('srcdoc'),'');assert.equal(frame.src,oldUrl);
  assert.match(dom.window.document.querySelector('#qa-status').textContent,/本機 HTTP/);
  frame.dispatchEvent(new dom.window.Event('load'));
  for(const [id,callback]of readinessTimers){readinessTimers.delete(id);callback();}
  assert.equal(notice.dataset.phase,'timeout');assert.equal(notice.hidden,false);assert.equal(retry.hidden,false);
  panelStatus();assert.equal(notice.dataset.phase,'timeout','blank srcdoc cannot acknowledge the old panel');
  retry.click();
  assert.equal(frame.hasAttribute('srcdoc'),false);assert.equal(notice.dataset.phase,'starting');
  assert.notEqual(new URL(frame.src).searchParams.get('panelToken'),oldToken);
  assert.equal(new URL(frame.src).pathname,'/src/dev/panel.html');
  frame.dispatchEvent(new dom.window.Event('load'));
  panelStatus({panelToken:oldToken});assert.equal(notice.dataset.phase,'starting','stale instance acknowledgement is ignored');
  panelStatus({}, {origin:'https://untrusted.example'});assert.equal(notice.dataset.phase,'starting');
  panelStatus({qaChannel:'wrong-channel'});assert.equal(notice.dataset.phase,'starting');
  panelStatus({}, {source:null});assert.equal(notice.dataset.phase,'starting');
  panelStatus({patient:{name:'SHOULD NOT BE RELAYED'},data:{al:'99'}});
  assert.equal(notice.dataset.phase,'ready');assert.equal(notice.hidden,true);assert.equal(frame.getAttribute('aria-busy'),'false');
  assert.deepEqual((await message({type:'biometry:session:read'})).session,sessionBefore);
  assert.deepEqual((await message({type:'biometry:library:read'})).result,libraryBefore);
  assert.deepEqual([...dom.window.document.querySelectorAll('#source-form input')].map(input=>[input.id,input.value]),sourceBefore);
  assert.equal(shellRoot.querySelector('iframe'),frame);
  assert.equal(notice.textContent.includes('SHOULD NOT BE RELAYED'),false);

  // Exercise both directions used by the preview: a native shell click sends
  // locale-only storage to the panel; a panel preference updates the live shell.
  const sourceBeforeLanguage=frame.src,languageButton=shellRoot.querySelector('.language');
  const languageMessages=[];frame.contentWindow.postMessage=message=>languageMessages.push(message);
  assert.equal(languageButton.textContent,'中文');languageButton.click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(languageButton.textContent,'EN');assert.equal(frame.src,sourceBeforeLanguage);
  const localeChange=languageMessages.find(message=>message.type==='qa:storage-change'&&message.area==='local');
  assert.deepEqual(localeChange.changes,{[UI_LANGUAGE_KEY]:{oldValue:undefined,newValue:'zh-TW'}});
  assert.equal((await rpc('storage.local.get'))[UI_LANGUAGE_KEY],'zh-TW');
  await rpc('storage.local.set',{[UI_LANGUAGE_KEY]:'en'});
  assert.equal(languageButton.textContent,'中文');assert.equal(frame.src,sourceBeforeLanguage);assert.equal(shellRoot.querySelector('iframe'),frame);
  assert.deepEqual((await message({type:'biometry:session:read'})).session,sessionBefore);
  assert.deepEqual((await message({type:'biometry:library:read'})).result,libraryBefore);
  assert.deepEqual([...dom.window.document.querySelectorAll('#source-form input')].map(input=>[input.id,input.value]),sourceBefore);
});

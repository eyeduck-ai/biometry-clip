import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createLocalOcrClient} from '../src/ocr/local.js';
import {predictWithDisposableModel} from '../src/ocr/model-lifetime.js';

async function tick(){await Promise.resolve();await Promise.resolve();}
function fixture(t,{timeout=1000}={}){
  const dom=new JSDOM('<!doctype html><body></body>',{url:'https://example.test/'});t.after(()=>dom.window.close());
  const client=createLocalOcrClient({document:dom.window.document,window:dom.window,assetUrl:path=>`https://example.test/${path}`,origin:'https://example.test',readyTimeoutMs:timeout,taskTimeoutMs:timeout});
  function frame(){const value=dom.window.document.querySelector('iframe');assert.ok(value);return value;}
  function emit(target,data){dom.window.dispatchEvent(new dom.window.MessageEvent('message',{source:target.contentWindow,data:{channel:new URL(target.src).searchParams.get('channel'),...data}}));}
  function ready(target){let request;target.contentWindow.postMessage=value=>{if(value.type==='biometry-ocr-run')request=value;};emit(target,{type:'biometry-ocr-ready'});assert.ok(request);return request;}
  return {dom,client,frame,emit,ready};
}

test('local inference uses fresh frames and releases successful model contexts before the next queued request',async t=>{
  const f=fixture(t),first=f.client.recognize(new Blob(['synthetic']),'small'),second=f.client.recognize(new Blob(['synthetic']),'tiny');
  await tick();const one=f.frame(),request=f.ready(one);
  assert.equal(f.dom.window.document.querySelectorAll('iframe').length,1);assert.equal(request.model,'small');
  f.emit(one,{type:'biometry-ocr-result',id:request.id,items:[{text:'OD'}]});assert.deepEqual(await first,[{text:'OD'}]);
  await tick();const two=f.frame();assert.notEqual(one,two);assert.equal(one.isConnected,false);
  const next=f.ready(two);assert.equal(next.model,'tiny');f.emit(two,{type:'biometry-ocr-result',id:next.id,items:[]});await second;
  assert.equal(f.dom.window.document.querySelector('iframe'),null);
});

test('sandbox failure and startup timeout remove frames and allow a new request',async t=>{
  const f=fixture(t,{timeout:60}),bad=f.client.recognize(new Blob());await tick();const one=f.frame(),request=f.ready(one);
  f.emit(one,{type:'biometry-ocr-result',id:request.id,error:'synthetic load failure'});await assert.rejects(bad,/synthetic load failure/);assert.equal(one.isConnected,false);
  const slow=f.client.recognize(new Blob());await tick();const two=f.frame();await assert.rejects(slow,/載入逾時/);assert.equal(two.isConnected,false);
});

test('model prediction is not reported complete before model disposal finishes',async()=>{
  const calls=[];let release;const disposed=new Promise(resolve=>{release=resolve;});let settled=false;
  const result=predictWithDisposableModel(async()=>({predict:async()=>{calls.push('predict');return ['synthetic'];},dispose:async()=>{calls.push('dispose');await disposed;}}),new Blob()).then(value=>{settled=true;return value;});
  await tick();await tick();assert.deepEqual(calls,['predict','dispose']);assert.equal(settled,false);release();assert.deepEqual(await result,['synthetic']);
});

test('inference failure still disposes its models while preserving the original failure',async()=>{
  const error=new Error('inference failed');let disposed=false;
  await assert.rejects(predictWithDisposableModel(async()=>({predict:async()=>{throw error;},dispose:async()=>{disposed=true;throw new Error('cleanup failed');}}),new Blob()),actual=>actual===error);
  assert.equal(disposed,true);
});

test('cancellation releases a running frame and a queued cancelled task never allocates one',async t=>{
  const f=fixture(t),controller=new AbortController(),queued=new AbortController();
  const first=f.client.recognize(new Blob(),'small',()=>{},{signal:controller.signal}),second=f.client.recognize(new Blob(),'small',()=>{},{signal:queued.signal});
  await tick();const one=f.frame();f.ready(one);queued.abort();controller.abort();
  await assert.rejects(first,error=>error.name==='AbortError');await assert.rejects(second,error=>error.name==='AbortError');assert.equal(one.isConnected,false);assert.equal(f.dom.window.document.querySelector('iframe'),null);
});

test('stale and wrong-source messages cannot complete an active local inference',async t=>{
  const f=fixture(t),pending=f.client.recognize(new Blob());await tick();const one=f.frame(),request=f.ready(one);
  let settled=false;pending.then(()=>{settled=true;});
  f.emit(one,{type:'biometry-ocr-result',id:'wrong',items:[{text:'wrong'}]});
  f.dom.window.dispatchEvent(new f.dom.window.MessageEvent('message',{source:f.dom.window,data:{type:'biometry-ocr-result',channel:request.channel,id:request.id,items:[{text:'wrong source'}]}}));
  await tick();assert.equal(settled,false);
  f.emit(one,{type:'biometry-ocr-result',id:request.id,items:[]});await pending;assert.equal(one.isConnected,false);
});

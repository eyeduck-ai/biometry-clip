import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {recognizeGemini,recognizePaddleApi,validatePaddleResultUrl} from '../src/ocr/cloud.js';
import {DEFAULT_GEMINI_MODEL,DEFAULT_PADDLE_MODEL,cloudPermissionOrigins,migrateCloudSettings} from '../src/ocr/cloud-config.js';
import {preferenceSettingsMarkup} from '../src/workbench-ui.js';

function mocked(t,handler){const before=globalThis.fetch;globalThis.fetch=handler;t.after(()=>{globalThis.fetch=before;});}
const response=payload=>new Response(typeof payload==='string'?payload:JSON.stringify(payload),{headers:{'Content-Type':'application/json'}});
const ok=data=>response({code:0,data});
const output={result:{ocrResults:[{prunedResult:{rec_texts:['OD','AL','23.40'],rec_scores:[.99,.98,.97],rec_boxes:[[0,0,10,10],[0,20,10,30],[30,20,60,30]]}}]}};

test('official Paddle needs only a key and model, uploads once and downloads unsigned results',async t=>{
  const calls=[];mocked(t,async(url,options)=>{calls.push({url,options});return calls.length===1?ok({jobId:'synthetic-job'}):calls.length===2?ok({state:'done',resultUrl:{jsonUrl:'https://results.bj.bcebos.com/synthetic/result.jsonl?signature=private'}}):response(JSON.stringify(output)+'\n');});
  const items=await recognizePaddleApi(new Blob(['synthetic'],{type:'image/png'}),{cloudConsent:true,paddleApiToken:'SYNTHETIC-TOKEN'});
  assert.equal(calls.length,3);assert.equal(calls[0].url,'https://paddleocr.aistudio-app.com/api/v2/ocr/jobs');
  assert.equal(calls[0].options.headers.Authorization,'Bearer SYNTHETIC-TOKEN');assert.equal(calls[0].options.body.get('model'),'PP-OCRv6');
  assert.equal(calls[0].options.body.get('file').name,'page.png');assert.equal(JSON.parse(calls[0].options.body.get('optionalPayload')).textRecScoreThresh,0);
  assert.equal(calls[1].url,'https://paddleocr.aistudio-app.com/api/v2/ocr/jobs/synthetic-job');assert.deepEqual(calls[2].options.headers,{});
  assert.ok(calls.every(({options})=>options.redirect==='error'&&options.credentials==='omit'));
  assert.deepEqual(items[2].poly,[[30,20],[60,20],[60,30],[30,30]]);assert.equal(items.metadata.model,'PP-OCRv6');assert.equal(items.metadata.protocol,'official-jobs-v2');
  assert.ok(!JSON.stringify(items).includes('TOKEN'));
});

test('Paddle upload errors have no automatic retry or echoed credentials/service errors',async t=>{
  let count=0;mocked(t,async()=>{count++;return new Response('SYNTHETIC-TOKEN patient details',{status:429});});
  await assert.rejects(recognizePaddleApi(new Blob(),{cloudConsent:true,paddleApiToken:'SYNTHETIC-TOKEN'}),error=>/HTTP 429/.test(error.message)&&!error.message.includes('TOKEN')&&!error.message.includes('patient'));
  assert.equal(count,1);
});

test('hosted Paddle rejects result redirects, untrusted hosts and invalid job IDs before download',async t=>{
  for(const url of ['http://results.bcebos.com/a','https://bcebos.com.evil.test/a','https://127.0.0.1/a','https://u:p@results.bcebos.com/a','https://results.bcebos.com:444/a','https://results.bcebos.com/a#fragment','https://results.bcebos.com/a?key=SYNTHETIC-TOKEN'])assert.throws(()=>validatePaddleResultUrl(url,'SYNTHETIC-TOKEN'),/不受信任/);
  let count=0;mocked(t,async()=>{count++;return ok({jobId:'../injected?key=secret'});});
  await assert.rejects(recognizePaddleApi(new Blob(),{cloudConsent:true,paddleApiToken:'SYNTHETIC-TOKEN'}),/格式/);assert.equal(count,1);
});

test('cancellation while Paddle polls stops without a second upload or result download',async t=>{
  const controller=new AbortController();let count=0;
  mocked(t,async()=>{count++;if(count===1)return ok({jobId:'synthetic'});controller.abort();return ok({state:'pending'});});
  await assert.rejects(recognizePaddleApi(new Blob(),{cloudConsent:true,paddleApiToken:'SYNTHETIC',signal:controller.signal}),/abort/i);assert.equal(count,2);
});

test('hosted Paddle validates selected model/key before any network request',async t=>{
  let count=0;mocked(t,async()=>{count++;throw new Error('must not request');});
  await assert.rejects(recognizePaddleApi(new Blob(),{cloudConsent:true}),/API key/);
  await assert.rejects(recognizePaddleApi(new Blob(),{cloudConsent:true,paddleApiToken:'KEY',paddleApiModel:'invented'}),/模型/);assert.equal(count,0);
});

test('Gemini defaults to Flash-Lite 3.5, uses header credentials and avoids unsupported sampling settings',async t=>{
  const before=globalThis.FileReader;globalThis.FileReader=class {readAsDataURL(){this.result='data:image/png;base64,c3ludGhldGlj';this.onload();}};t.after(()=>{globalThis.FileReader=before;});
  const calls=[];mocked(t,async(url,options)=>{calls.push({url,options});return response({modelVersion:'gemini-3.5-flash-lite',usageMetadata:{totalTokenCount:123},candidates:[{content:{parts:[{text:'{"eyes":{"OD":{"al":"23.40"},"OS":{}},"patient":{},"text":"synthetic","warnings":[]}' }]}}]});});
  const result=await recognizeGemini(new Blob(),{cloudConsent:true,geminiApiKey:'SYNTHETIC-KEY'});
  assert.match(calls[0].url,/gemini-3\.5-flash-lite:generateContent$/);assert.ok(!calls[0].url.includes('KEY'));
  const config=JSON.parse(calls[0].options.body).generationConfig;assert.equal(config.temperature,undefined);assert.equal(config.thinkingConfig.thinkingLevel,'minimal');assert.equal(config.maxOutputTokens,8192);
  assert.equal(result.candidates.eyes.OD.al,'23.40');assert.equal(result.metadata.usage.totalTokenCount,123);
});

test('ordinary cloud settings expose model menus and keep custom URLs in a closed advanced section',()=>{
  const document=new JSDOM(preferenceSettingsMarkup({ocrProvider:'paddle-api',localModel:'small'})).window.document;
  assert.equal(DEFAULT_GEMINI_MODEL,'gemini-3.5-flash-lite');assert.equal(DEFAULT_PADDLE_MODEL,'PP-OCRv6');
  assert.equal(document.querySelector('[name="geminiModel"]').value,DEFAULT_GEMINI_MODEL);assert.equal(document.querySelector('[name="paddleApiModel"]').value,DEFAULT_PADDLE_MODEL);
  assert.ok(document.querySelector('[name="geminiModel"]').options.length>=3);assert.ok(document.querySelector('[name="paddleApiModel"]').options.length>=2);
  assert.equal(document.querySelector('[name="paddleApiUrl"]').closest('details').open,false);assert.equal(document.querySelector('[name="paddleApiMode"]').value,'official');
  assert.deepEqual(cloudPermissionOrigins({ocrProvider:'paddle-api'}),['https://paddleocr.aistudio-app.com/*','https://*.bcebos.com/*','https://*.baidubce.com/*','https://*.aistudio-app.com/*']);
  assert.equal(migrateCloudSettings({paddleApiUrl:'https://ocr.example/ocr'}).paddleApiMode,'custom');assert.equal(migrateCloudSettings({paddleApiMode:'official',paddleApiUrl:'https://ocr.example/ocr'}).paddleApiMode,'official');
});

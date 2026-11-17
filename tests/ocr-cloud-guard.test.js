import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

async function fixture(t){
  const keys=['document','location','FileReader','createImageBitmap','fetch','__guardPdfDocument'];
  const saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  t.after(()=>{for(const [key,descriptor]of saved)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];});
  let fetches=0,bitmapsClosed=0;globalThis.location={href:'http://127.0.0.1/'};
  globalThis.fetch=async()=>{fetches++;return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({eyes:{OD:{al:'23.45'},OS:{}},text:'SYNTHETIC'})}]}}]})};};
  globalThis.FileReader=class{readAsDataURL(blob){blob.arrayBuffer().then(bytes=>{this.result=`data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;this.onload();},error=>{this.error=error;this.onerror();});}};
  globalThis.createImageBitmap=async()=>({width:100,height:100,close(){bitmapsClosed++;}});
  const canvases=[];
  globalThis.document={createElement:()=>{const canvas={width:0,height:0,getContext:()=>({fillRect(){},drawImage(){}}),toBlob:done=>done(new Blob(['synthetic'],{type:'image/png'}))};canvases.push(canvas);return canvas;}};
  const appUrl=new URL('../src/ocr/index.js',import.meta.url);
  let source=await readFile(appUrl,'utf8');
  source=source.replace("import { withPdfDocument } from './pdf-worker.js';",'const withPdfDocument=async(_pdfjs,_url,_options,useDocument)=>useDocument(globalThis.__guardPdfDocument);');
  source=source.replace("const pdfjs=await import('pdfjs-dist'),{default:workerUrl}=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');","const pdfjs={},workerUrl='synthetic-worker';");
  source=source.replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL(path,appUrl).href}'`);
  const api=await import(`data:text/javascript;base64,${Buffer.from(source+'\n// '+crypto.randomUUID()).toString('base64')}`);
  return {api,canvases,get fetches(){return fetches;},get bitmapsClosed(){return bitmapsClosed;}};
}

test('a rejected just-in-time cloud guard prevents either image API request and releases its decoded image',async t=>{
  const f=await fixture(t);
  for(const ocrProvider of ['gemini','paddle-api']){
    let guarded=0;
    await assert.rejects(f.api.recognizeImage('data:image/png;base64,U1lOVEhFVElD',{ocrProvider,cloudConsent:true},()=>{},{beforeCloudRequest:async options=>{guarded++;assert.equal(options.provider,ocrProvider);return false;}}),{name:'AbortError'});
    assert.equal(guarded,1);assert.equal(f.fetches,0);
  }
  assert.equal(f.bitmapsClosed,2);assert.ok(f.canvases.every(canvas=>canvas.width===0&&canvas.height===0));
});

test('a usable text PDF selected with a cloud provider never asks the cloud guard or starts an external request',async t=>{
  const f=await fixture(t);let guarded=0,cleaned=0;
  const items=['OD OS','AL 23.45 24.10','ACD 3.20 3.40'].map((str,i)=>({str,transform:[10,0,0,10,20,500-i*20],height:10,width:180}));
  globalThis.__guardPdfDocument={numPages:1,getPage:async()=>({getTextContent:async()=>({items}),cleanup:()=>{cleaned++;}})};
  const file={name:'SYNTHETIC.pdf',type:'application/pdf',size:10,arrayBuffer:async()=>new ArrayBuffer(10)};
  const result=await f.api.recognizeFiles([file],{ocrProvider:'gemini'},()=>{},{beforeCloudRequest:async()=>{guarded++;throw new Error('No consent should be needed');}});
  assert.equal(guarded,0);assert.equal(f.fetches,0);assert.equal(f.canvases.length,0);assert.equal(cleaned,1);
  assert.equal(result.files[0].pages[0].method,'pdf-text');assert.equal(result.candidates.eyes.OD.al,'23.45');assert.equal(result.candidates.eyes.OS.acd,'3.40');
  assert.ok(result.candidates.evidence.every(item=>item.fileIndex===0&&item.pageNumber===1&&item.method==='pdf-text'));
  assert.deepEqual(result.candidates.fieldConfidence,{});
});


test('an explicitly approved cloud guard grants consent for this request without mutating saved settings',async t=>{
  const f=await fixture(t),settings={ocrProvider:'gemini',geminiApiKey:'SYNTHETIC-NOT-A-KEY',geminiModel:'gemini-3.5-flash-lite'};let guarded=0;
  const result=await f.api.recognizeImage('data:image/png;base64,U1lOVEhFVElD',settings,()=>{},{beforeCloudRequest:async()=>{guarded++;return true;}});
  assert.equal(guarded,1);assert.equal(f.fetches,1);assert.equal(settings.cloudConsent,undefined);
  assert.equal(result.candidates.eyes.OD.al,'23.45');
  assert.equal(result.candidates.evidence[0].fileIndex,0);assert.equal(result.candidates.evidence[0].method,'image-ocr');
  assert.deepEqual(result.candidates.fieldConfidence,{});
});

test('review source PDF previews are legible but bounded and release their canvas after one selected page',async t=>{
  const f=await fixture(t),visited=[],renders=[];
  globalThis.__guardPdfDocument={numPages:12,getPage:async pageNumber=>{visited.push(pageNumber);return {
    getViewport:({scale})=>({width:6000*scale,height:8000*scale}),
    render:({viewport})=>{renders.push(viewport);return {promise:Promise.resolve(),cancel(){}};},cleanup(){},
  };}};
  const file={name:'SYNTHETIC.pdf',type:'application/pdf',size:10,arrayBuffer:async()=>new ArrayBuffer(10)};
  const preview=await f.api.inspectPdf(file,{previewPage:8,previewSize:'review'});
  assert.deepEqual(visited,[8]);assert.equal(preview.preview.pageNumber,8);
  assert.ok(Math.max(renders[0].width,renders[0].height)>480);
  assert.ok(Math.max(renders[0].width,renders[0].height)<=1400);
  assert.ok(renders[0].width*renders[0].height<=1500000);
  assert.ok(f.canvases.every(canvas=>canvas.width===0&&canvas.height===0));assert.equal(f.fetches,0);
});

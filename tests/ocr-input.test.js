import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeImageDataUrl,recognizeFiles,recognizeImage} from '../src/ocr/index.js';

test('screenshot bytes decode locally without a data URL fetch blocked by extension connect-src',async()=>{
  const blob=decodeImageDataUrl('data:image/png;base64,U1lOVEhFVElD');assert.equal(blob.type,'image/png');assert.equal(await blob.text(),'SYNTHETIC');
  for(const value of ['data:text/html;base64,PHNjcmlwdD4=','https://example.com/image.png','data:image/png;base64,***'])assert.throws(()=>decodeImageDataUrl(value));
});

test('PDF page budgets are validated before decoding any selected document or sending data',async()=>{
  let reads=0;
  const files=Array.from({length:4},(_,index)=>({name:`synthetic-${index}.pdf`,type:'application/pdf',size:10,arrayBuffer:async()=>{reads++;return new ArrayBuffer(0);}}));
  await assert.rejects(recognizeFiles(files),/最多辨識 3 頁/);assert.equal(reads,0);
  await assert.rejects(recognizeFiles(files.slice(0,1),{},()=>{},{pdfPages:{0:[]}}),/至少選擇一頁/);assert.equal(reads,0);
  await assert.rejects(recognizeFiles(files.slice(0,1),{},()=>{},{pdfPages:{0:[0]}}),/有效的 PDF 頁碼/);assert.equal(reads,0);
});

test('PDFs with an explicit empty selection are skipped rather than silently reading page one',async()=>{
  let reads=0;
  const files=[{name:'skip.pdf',type:'application/pdf',size:10,arrayBuffer:async()=>{reads++;throw new Error('must be skipped');}},{name:'bad.png',type:'image/png',size:10}];
  await assert.rejects(recognizeFiles(files,{},()=>{},{pdfPages:{0:[]}}),/解碼圖片/);assert.equal(reads,0);
});

test('already cancelled recognition does not decode an image or read any PDF data',async()=>{
  const controller=new AbortController();controller.abort();let reads=0;
  const file={name:'synthetic.pdf',type:'application/pdf',size:10,arrayBuffer:async()=>{reads++;return new ArrayBuffer(0);}};
  await assert.rejects(recognizeFiles([file],{},()=>{},{signal:controller.signal}),error=>error.name==='AbortError');assert.equal(reads,0);
  await assert.rejects(recognizeImage('data:image/png;base64,U1lOVEhFVElD',{},()=>{},{signal:controller.signal}),error=>error.name==='AbortError');
});

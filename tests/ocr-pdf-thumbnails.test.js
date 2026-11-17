import test from 'node:test';
import assert from 'node:assert/strict';
import {thumbnailPages,renderPdfThumbnails,PDF_THUMBNAIL_BATCH} from '../src/ocr/pdf-thumbnails.js';

test('thumbnail batch validates page ranges independently of the three-page recognition budget',()=>{
 assert.deepEqual(thumbnailPages(20,[7,2,7]),[2,7]);assert.equal(PDF_THUMBNAIL_BATCH,12);
 for(const pages of [[0],[21],['1'],Array.from({length:13},(_,i)=>i+1)])assert.throws(()=>thumbnailPages(20,pages));
});

test('thumbnail previews render sequentially from the same open PDF and release each page before advancing',async()=>{
 const calls=[],published=[];let active=0,maximum=0;
 const pdf={numPages:20,getPage:async pageNumber=>{calls.push(['page',pageNumber]);return {pageNumber,cleanup(){calls.push(['cleanup',pageNumber]);}};}};
 const previews=await renderPdfThumbnails(pdf,{pages:[5,1,8],renderPage:async(page,limits)=>{active++;maximum=Math.max(maximum,active);calls.push(['render',page.pageNumber,limits.maxEdge,limits.maxPixels]);await Promise.resolve();active--;return new Blob([String(page.pageNumber)]);},toDataUrl:async blob=>`data:${await blob.text()}`,onPreview:preview=>published.push(preview.pageNumber)});
 assert.equal(maximum,1);assert.deepEqual(published,[1,5,8]);assert.deepEqual(previews.map(item=>item.pageNumber),[1,5,8]);
 assert.deepEqual(calls.filter(call=>['page','cleanup'].includes(call[0])),[['page',1],['cleanup',1],['page',5],['cleanup',5],['page',8],['cleanup',8]]);
 assert.ok(calls.filter(call=>call[0]==='render').every(call=>call[2]===320&&call[3]===102400));
});

test('a cancelled or failed thumbnail never starts the next page and still releases its PDF cache',async()=>{
 for(const aborted of [true,false]){
   const controller=new AbortController(),calls=[];
   const pdf={numPages:7,getPage:async pageNumber=>{calls.push(pageNumber);return {cleanup:()=>calls.push('cleanup')};}};
   await assert.rejects(renderPdfThumbnails(pdf,{pages:[1,2],signal:controller.signal,toDataUrl:async()=>'',renderPage:async()=>{if(aborted){controller.abort();return new Blob();}throw new Error('preview failed');}}),aborted?{name:'AbortError'}:/preview failed/);
   assert.deepEqual(calls,[1,'cleanup']);
 }
});

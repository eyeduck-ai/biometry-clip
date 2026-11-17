import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {reviewMarkup} from '../src/import-review-ui.js';
import {reviewSources,loadReviewSource,bindReviewPreview} from '../src/import-preview.js';
const deferred=()=>{let resolve;return {promise:new Promise(done=>resolve=done),resolve:value=>resolve(value)};};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

test('review sources include only selected original PDF pages and stable image file indexes',()=>{
 const sources=reviewSources([{name:'many.pdf',type:'application/pdf'},{name:'image.png',type:'image/png'},{name:'skipped.pdf',type:'application/pdf'}],{pdfPages:{0:[6,8],2:[]}});
 assert.deepEqual(sources.map(({id,fileIndex,pageNumber})=>({id,fileIndex,pageNumber})),[{id:'0:6',fileIndex:0,pageNumber:6},{id:'0:8',fileIndex:0,pageNumber:8},{id:'1:image',fileIndex:1,pageNumber:null}]);
});
test('source switching rejects stale async previews, releases them, and preserves edited input/check state',async()=>{
 const sources=[{id:'0:6',fileIndex:0,pageNumber:6,label:'source6'},{id:'0:8',fileIndex:0,pageNumber:8,label:'source8'}],rows=[{eye:'OD',key:'al',value:'23.45',source:sources[1]}];
 const doc=new JSDOM(reviewMarkup({sources,rows})).window.document,loads=[],released=[];
 const stop=bindReviewPreview(doc,{sources,rows,loadSource:(source,{signal})=>{const job=deferred();loads.push({source,signal,job});return job.promise;}});
 await tick();const input=doc.querySelector('[data-candidate-value]'),check=doc.querySelector('[data-candidate]');input.value='24.01';check.checked=false;
 const select=doc.querySelector('[data-review-source]');select.value='0:8';select.dispatchEvent(new doc.defaultView.Event('change'));
 assert.equal(loads[0].signal.aborted,true);loads[0].job.resolve({url:'blob:stale',release:()=>released.push('stale')});await tick();assert.deepEqual(released,['stale']);
 assert.equal(loads[1].source.pageNumber,8);loads[1].job.resolve({url:'blob:current',release:()=>released.push('current')});await tick();
 assert.equal(doc.querySelector('#review-source-image').getAttribute('src'),'blob:current');assert.equal(doc.querySelector('[data-candidate-value]'),input);assert.equal(input.value,'24.01');assert.equal(check.checked,false);
 doc.querySelector('[data-review-zoom="in"]').click();assert.equal(doc.querySelector('#review-zoom-value').textContent,'125%');
 stop();stop();assert.deepEqual(released,['stale','current']);assert.equal(doc.querySelector('#review-source-image').hasAttribute('src'),false);
});
test('field source button opens its original page and cleanup prevents late image writes',async()=>{
 const sources=[{id:'0:2',fileIndex:0,pageNumber:2,label:'two'},{id:'1:6',fileIndex:1,pageNumber:6,label:'six'}],rows=[{eye:'OS',key:'cct',value:'543',source:sources[1]}];
 const doc=new JSDOM(reviewMarkup({sources,rows})).window.document,jobs=[],released=[];
 const stop=bindReviewPreview(doc,{sources,rows,loadSource:source=>{const task=deferred();jobs.push({source,task});return task.promise;}});
 await tick();jobs[0].task.resolve({url:'blob:two',release:()=>released.push('two')});await tick();
 doc.querySelector('[data-review-field-source]').click();await tick();assert.equal(jobs[1].source.fileIndex,1);assert.equal(jobs[1].source.pageNumber,6);
 stop();jobs[1].task.resolve({url:'blob:late',release:()=>released.push('late')});await tick();assert.deepEqual(released,['two','late']);assert.equal(doc.querySelector('#review-source-image').hasAttribute('src'),false);
});
test('PDF source loader requests one bounded review page without running OCR',async()=>{
 const calls=[];const loaded=await loadReviewSource({file:{name:'synthetic.pdf'},pageNumber:6},{inspectPdf:async(file,options)=>{calls.push(options);return {preview:{dataUrl:'data:image/png;base64,AA=='}};}});
 assert.equal(calls.length,1);assert.equal(calls[0].previewPage,6);assert.equal(calls[0].previewSize,'review');assert.equal(loaded.url,'data:image/png;base64,AA==');loaded.release();
});

test('focusing a review field follows its page without reopening a collapsed source pane',async()=>{
 const sources=[{id:'0:1',fileIndex:0,pageNumber:1,label:'first'}],rows=[{eye:'OD',key:'al',value:'23.45',source:sources[0]}];
 const doc=new JSDOM(reviewMarkup({sources,rows})).window.document;
 const stop=bindReviewPreview(doc,{sources,rows,loadSource:async()=>({url:'blob:synthetic',release(){}})});await tick();
 const pane=doc.querySelector('.review-source-panel');pane.open=false;doc.querySelector('[data-candidate-value]').focus();assert.equal(pane.open,false);
 doc.querySelector('[data-review-field-source]').click();assert.equal(pane.open,true);stop();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {choosePdfPages} from '../src/pdf-picker.js';

function fixture(t,{pageCount=100,inspect}={}){
  const dom=new JSDOM('<dialog id="review-dialog"></dialog>');t.after(()=>dom.window.close());
  const doc=dom.window.document,dialog=doc.querySelector('dialog'),calls=[];
  const options={document:doc,inspectPdf:async(file,settings)=>{calls.push({file:file.name,settings});if(inspect)return inspect(file,settings);const previews=(settings.previewPages||[]).map(pageNumber=>({pageNumber,dataUrl:`data:image/png;base64,UEFHRS0${pageNumber}`}));for(const preview of previews)settings.onPreview?.(preview);return {pageCount,maxSelectedPages:3,defaultPages:[1],preview:null,previews};},showDialog:(_title,body)=>{dialog.innerHTML=body;dialog.setAttribute('open','');},closeDialog:()=>{if(dialog.hasAttribute('open')){dialog.removeAttribute('open');dialog.dispatchEvent(new dom.window.Event('close'));}}};
  const change=(selector,checked)=>{const box=doc.querySelector(selector);assert.ok(box,selector);box.checked=checked;box.dispatchEvent(new dom.window.Event('change'));};
  return {doc,dom,calls,options,change};
}
const files=count=>Array.from({length:count},(_,index)=>({name:`SYNTHETIC-${index}.pdf`,type:'application/pdf'}));
async function rendered(f){for(let i=0;i<20;i++){if(f.doc.querySelector('#pdf-recognize'))return;await new Promise(resolve=>setTimeout(resolve,0));}throw new Error('Picker not rendered');}

test('PDF picker renders bounded page controls and recognizes only explicitly selected page numbers',async t=>{
  const f=fixture(t),pending=choosePdfPages(files(1),f.options);await rendered(f);
  assert.equal(f.calls.filter(call=>!call.settings.previewPages).length,1);assert.equal(f.calls[0].settings.previewPage,false);
  assert.equal(f.doc.querySelectorAll('[data-pdf-page]').length,12);assert.equal(f.doc.querySelectorAll('[data-pdf-page]:checked').length,1);
  f.change('[data-pdf-page="1"]',false);assert.equal(f.doc.querySelector('#pdf-recognize').disabled,true);
  f.doc.querySelector('[data-direction="1"]').click();f.change('[data-pdf-page="13"]',true);f.change('#force-pdf-ocr',true);
  f.doc.querySelector('#pdf-recognize').click();assert.deepEqual(await pending,{pdfPages:{0:[13]},forcePdfOcr:true});
  assert.equal(f.doc.querySelector('dialog').hasAttribute('open'),false);
});

test('PDF picker bounds the entire batch and preserves completely deselected documents',async t=>{
  const f=fixture(t),pending=choosePdfPages(files(4),f.options);await rendered(f);
  assert.equal(f.doc.querySelectorAll('[data-pdf-page]:checked').length,3);
  assert.deepEqual(f.calls.filter(call=>!call.settings.previewPages).map(call=>call.settings.previewPage),[false,false,false,false]);
  f.change('[data-pdf-file="3"][data-pdf-page="1"]',true);assert.equal(f.doc.querySelector('#pdf-recognize').disabled,true);
  f.change('[data-pdf-file="0"][data-pdf-page="1"]',false);assert.equal(f.doc.querySelector('#pdf-recognize').disabled,false);
  f.doc.querySelector('#pdf-recognize').click();assert.deepEqual((await pending).pdfPages,{0:[],1:[1],2:[1],3:[1]});
});

test('cancel or case-abort closes PDF picker without any recognition result',async t=>{
  for(const abort of [false,true]){
    const f=fixture(t),controller=new AbortController(),pending=choosePdfPages(files(1),{...f.options,signal:controller.signal});await rendered(f);
    abort?controller.abort():f.doc.querySelector('#pdf-cancel').click();assert.equal(await pending,null);assert.equal(f.calls.filter(call=>!call.settings.previewPages).length,1);
  }
});

test('a mixed batch can skip every PDF and still recognize its images',async t=>{
  const f=fixture(t),pending=choosePdfPages([...files(1),{name:'SYNTHETIC.png',type:'image/png'}],f.options);await rendered(f);
  f.change('[data-pdf-page="1"]',false);assert.equal(f.doc.querySelector('#pdf-recognize').disabled,false);
  f.doc.querySelector('#pdf-recognize').click();assert.deepEqual((await pending).pdfPages,{0:[]});
});


test('every visible PDF page has an immediate thumbnail choice with the matching source page',async t=>{
  const f=fixture(t,{pageCount:7}),pending=choosePdfPages(files(1),f.options);await rendered(f);
  for(let i=0;i<20&&!f.doc.querySelector('[data-pdf-thumbnail-page="7"] img');i++)await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(f.doc.querySelectorAll('.pdf-thumbnail-grid .pdf-page-card').length,7);
  assert.equal(f.doc.querySelectorAll('.pdf-thumbnail-grid img').length,7);
  assert.equal(f.doc.querySelector('.pdf-thumbnail-grid details'),null);
  assert.deepEqual(f.calls.find(call=>call.settings.previewPages).settings.previewPages,[1,2,3,4,5,6,7]);
  assert.match(f.doc.querySelector('[data-pdf-thumbnail-page="6"] img').src,/UEFHRS06$/);
  f.doc.querySelector('[data-pdf-zoom="0"][data-page="6"]').click();
  const panel=f.doc.querySelector('[data-pdf-zoom-panel="0"]');assert.equal(panel.hidden,false);assert.equal(panel.dataset.page,'6');
  f.doc.querySelector('[data-pdf-close-zoom="0"]').click();assert.equal(panel.hidden,true);
  f.change('[data-pdf-page="1"]',false);f.change('[data-pdf-page="6"]',true);
  f.doc.querySelector('#pdf-recognize').click();assert.deepEqual(await pending,{pdfPages:{0:[6]},forcePdfOcr:false});
});

test('canceling during thumbnail rendering aborts its own work and cannot repaint the closed picker',async t=>{
  let thumbnailSignal,publish;
  const f=fixture(t,{inspect:async(_file,settings)=>{
    if(!settings.previewPages)return {pageCount:7};
    thumbnailSignal=settings.signal;publish=settings.onPreview;
    await new Promise(resolve=>settings.signal.addEventListener('abort',resolve,{once:true}));
    return {pageCount:7,previews:[{pageNumber:1,dataUrl:'data:image/png;base64,TElURQ=='}]};
  }}),pending=choosePdfPages(files(1),f.options);await rendered(f);
  for(let i=0;i<20&&!thumbnailSignal;i++)await new Promise(resolve=>setTimeout(resolve,0));
  f.doc.querySelector('#pdf-cancel').click();assert.equal(await pending,null);assert.equal(thumbnailSignal.aborted,true);
  publish({pageNumber:1,dataUrl:'data:image/png;base64,TElURQ=='});await Promise.resolve();
  assert.equal(f.doc.querySelectorAll('.pdf-thumbnail-grid img').length,0);
});

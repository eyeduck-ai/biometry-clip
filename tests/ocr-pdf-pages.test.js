import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedPdfPages,MAX_RASTER_PIXELS,pdfTextToText,recognizePdfPages } from '../src/ocr/pdf-pages.js';
import { parseBiometry } from '../src/ocr/parser.js';

const candidate=()=>parseBiometry('OD OS\nAL 23.45 24.10\nACD 3.20 3.40');
const content=()=>({items:[
  {str:'OS',transform:[10,0,0,10,150,500],width:20,height:10},
  {str:'OD',transform:[10,0,0,10,80,500],width:20,height:10},
  {str:'AL',transform:[10,0,0,10,10,480],width:20,height:10},
  {str:'23.45',transform:[10,0,0,10,80,480],width:25,height:10},
  {str:'24.10',transform:[10,0,0,10,150,480],width:25,height:10},
  {str:'ACD',transform:[10,0,0,10,10,460],width:20,height:10},
  {str:'3.20',transform:[10,0,0,10,80,460],width:25,height:10},
  {str:'3.40',transform:[10,0,0,10,150,460],width:25,height:10},
]});
function fixture({text=content(),ocrError,renderError,width=60000,height=60000}={}) {
  const calls=[],canvases=[];
  const page={getTextContent:async()=>{calls.push('text');return text;},getViewport:({scale})=>({width:width*scale,height:height*scale}),render:({viewport,canvasContext})=>{calls.push(['render',viewport,canvasContext.canvas.width,canvasContext.canvas.height]);return {promise:renderError?Promise.reject(renderError):Promise.resolve(),cancel(){calls.push('cancel');}};},cleanup:()=>calls.push('cleanup')};
  const pdf={numPages:200,getPage:async index=>{calls.push(['getPage',index]);return page;}};
  const createCanvas=()=>{const canvas={width:0,height:0,getContext(){return {canvas};},toBlob(done){done(new Blob(['synthetic']));}};canvases.push(canvas);return canvas;};
  const recognizeBlob=async()=>{calls.push('ocr');if(ocrError)throw ocrError;return {text:'OD OS\nAL 23.45 24.10\nACD 3.20 3.40',candidates:candidate(),warnings:[]};};
  return {pdf,page,calls,canvases,options:{createCanvas,recognizeBlob}};
}

test('large PDFs default to one selected page and reject empty, out-of-range or excessive selections',()=>{
  assert.deepEqual(selectedPdfPages(200),[1]);assert.deepEqual(selectedPdfPages(200,[100,2,2]),[2,100]);
  for(const selection of [[],[0],[201],[1,2,3,4],['1']])assert.throws(()=>selectedPdfPages(200,selection));
});

test('PDF text geometry retains the row and bilateral eye columns',()=>{
  assert.equal(pdfTextToText(content()),'OD\tOS\nAL\t23.45\t24.10\nACD\t3.20\t3.40');
});

test('usable PDF text skips raster and models and visits only selected pages',async()=>{
  const f=fixture(),output=await recognizePdfPages(f.pdf,{...f.options,pages:[80]});
  assert.deepEqual(f.calls,[['getPage',80],'text','cleanup']);assert.equal(f.canvases.length,0);
  assert.equal(output.candidates.eyes.OD.al,'23.45');assert.equal(output.candidates.eyes.OS.al,'24.10');assert.equal(output.pages[0].method,'pdf-text');
});

test('force image recognition bypasses text shortcuts and bounds canvas pixels before inference',async()=>{
  const f=fixture(),output=await recognizePdfPages(f.pdf,{...f.options,pages:[2],forceOcr:true});
  assert.equal(f.calls.includes('text'),false);assert.equal(f.calls.includes('ocr'),true);
  const render=f.calls.find(call=>Array.isArray(call)&&call[0]==='render');assert.ok(render[2]*render[3]<=MAX_RASTER_PIXELS);
  assert.equal(f.canvases[0].width,0);assert.equal(f.canvases[0].height,0);assert.equal(f.calls.at(-1),'cleanup');assert.equal(output.pages[0].method,'pdf-ocr');
});

test('OCR and render failures still release page caches and every raster canvas',async()=>{
  for(const kind of ['ocrError','renderError']){
    const error=new Error(kind),f=fixture({text:{items:[]},[kind]:error});
    await assert.rejects(recognizePdfPages(f.pdf,f.options),actual=>actual===error);
    assert.equal(f.canvases[0].width,0);assert.equal(f.canvases[0].height,0);assert.equal(f.calls.at(-1),'cleanup');
  }
});

test('selected pages run sequentially and conflicting measurements remain blank',async()=>{
  const f=fixture({text:{items:[]}});let active=0,maximum=0,count=0;
  const output=await recognizePdfPages(f.pdf,{...f.options,pages:[3,1],recognizeBlob:async()=>{active++;maximum=Math.max(maximum,active);await Promise.resolve();active--;count++;const c=candidate();if(count===2)c.eyes.OD.al='23.99';return {text:'synthetic',candidates:c,warnings:[]};}});
  assert.equal(maximum,1);assert.deepEqual(output.pages.map(page=>page.pageNumber),[1,3]);assert.equal(output.candidates.eyes.OD.al,undefined);assert.ok(output.candidates.conflicts.includes('OD.al'));
});

test('cancelling a render cancels its task and clears resources before the next page',async()=>{
  const f=fixture({text:{items:[]}}),controller=new AbortController();let rejectRender;
  f.page.render=()=>({promise:new Promise((_,reject)=>{rejectRender=reject;}),cancel(){f.calls.push('cancel');rejectRender(new Error('render cancelled'));}});
  const pending=recognizePdfPages(f.pdf,{...f.options,pages:[1,2],signal:controller.signal});
  for(let i=0;i<5;i++)await Promise.resolve();controller.abort();
  await assert.rejects(pending,error=>error.name==='AbortError');assert.ok(f.calls.includes('cancel'));assert.equal(f.canvases[0].width,0);assert.equal(f.calls.at(-1),'cleanup');
  assert.equal(f.calls.filter(call=>Array.isArray(call)&&call[0]==='getPage').length,1);
});


test('an isolated text-layer row cannot suppress OCR for an otherwise unreadable scan',async()=>{
  const f=fixture({text:{items:content().items.filter(item=>Number(item.transform?.[5])!==460)}});
  const output=await recognizePdfPages(f.pdf,f.options);
  assert.equal(f.calls.includes('ocr'),true);assert.equal(output.pages[0].method,'pdf-ocr');
  assert.equal(output.candidates.eyes.OD.al,'23.45');assert.equal(output.candidates.eyes.OS.acd,'3.40');
});

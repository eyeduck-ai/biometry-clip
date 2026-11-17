import { itemsToText,mergeCandidatePages,parseBiometryItems } from './parser.js';
import {withCandidateSource} from './evidence.js';

export const MAX_SELECTED_PDF_PAGES=3;
export const MAX_RASTER_PIXELS=2500000;
export function throwIfCancelled(signal){if(signal?.aborted)throw Object.assign(new Error('已取消辨識。'),{name:'AbortError'});}

export function selectedPdfPages(pageCount,selection=[1]) {
  if(!Number.isSafeInteger(pageCount)||pageCount<1)throw new Error('PDF 沒有可讀取的頁面。');
  if(!Array.isArray(selection)||!selection.length)throw new Error('請至少選擇一頁 PDF。');
  if(selection.length>MAX_SELECTED_PDF_PAGES)throw new Error(`每份 PDF 單次最多選擇 ${MAX_SELECTED_PDF_PAGES} 頁。`);
  if(selection.some(page=>!Number.isSafeInteger(page)||page<1||page>pageCount))throw new Error('PDF 選取頁碼超出範圍。');
  return [...new Set(selection)].sort((a,b)=>a-b);
}

export function boundedViewport(page,{maxEdge=1800,maxPixels=MAX_RASTER_PIXELS,maxScale=2}={}) {
  const base=page.getViewport({scale:1});
  if(!Number.isFinite(base.width)||!Number.isFinite(base.height)||base.width<=0||base.height<=0)throw new Error('PDF 頁面尺寸無效。');
  const scale=Math.min(maxScale,maxEdge/Math.max(base.width,base.height),Math.sqrt(maxPixels/(base.width*base.height)));
  return page.getViewport({scale});
}

export function pdfTextItems(content) {
  return (content?.items||[]).filter(item=>typeof item.str==='string'&&item.str.trim()).map(item=>{
    const x=Number(item.transform?.[4]??0),y=-Number(item.transform?.[5]??0),height=Math.max(1,Math.abs(Number(item.height||item.transform?.[3]||10)));
    return {text:item.str,poly:[[x,y],[x+Math.abs(Number(item.width||0)),y],[x,y+height]]};
  });
}
export function pdfTextToText(content) {return itemsToText(pdfTextItems(content));}

function usefulText(candidates) {
  const core=['al','acd','lt','cct','wtw','k1','k2','target'];
  const fields=new Set();let count=0;
  for(const eye of ['OD','OS'])for(const [key,value]of Object.entries(candidates.eyes?.[eye]||{})){
    if(value==null||value===''||!Number.isFinite(Number(value)))continue;
    count++;if(core.includes(key))fields.add(key);
  }
  // A lone recognizable row in an otherwise unusable text layer is not enough
  // to suppress the image path. It must contain several biometry measurements.
  return fields.size>=2&&count>=4;
}

export async function rasterizePdfPage(page,{createCanvas=()=>document.createElement('canvas'),signal,...limits}={}) {
  throwIfCancelled(signal);
  const viewport=boundedViewport(page,limits),canvas=createCanvas();
  let task;
  const abort=()=>task?.cancel();
  try {
    canvas.width=Math.max(1,Math.floor(viewport.width));canvas.height=Math.max(1,Math.floor(viewport.height));
    const context=canvas.getContext('2d');
    if(!context)throw new Error('無法建立 PDF 預覽影像。');
    task=page.render({canvasContext:context,viewport,background:'#ffffff'});
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
    await task.promise;throwIfCancelled(signal);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    throwIfCancelled(signal);
    if(!blob)throw new Error('PDF 頁面無法轉成影像。');
    return blob;
  } catch(error) {throwIfCancelled(signal);throw error;} finally {
    signal?.removeEventListener('abort',abort);
    canvas.width=0;canvas.height=0;
  }
}

/** Sequential selected pages only; no model is loaded for usable text PDFs. */
export async function recognizePdfPages(pdf,{pages=[1],forceOcr=false,onProgress=()=>{},signal,recognizeBlob,createCanvas}={}) {
  const selected=selectedPdfPages(pdf.numPages,pages),results=[];
  for(const pageNumber of selected){
    throwIfCancelled(signal);onProgress(`正在讀取 PDF 第 ${pageNumber} 頁（已選 ${selected.length} 頁）…`);
    const page=await pdf.getPage(pageNumber);
    try {
      let text='',textCandidates;
      if(!forceOcr){
        try{const items=pdfTextItems(await page.getTextContent());text=itemsToText(items);textCandidates=parseBiometryItems(items);}catch(error){throwIfCancelled(signal);/* A broken text layer can still be read from its raster. */}
      }
      throwIfCancelled(signal);
      if(textCandidates&&usefulText(textCandidates)){
        const candidates=withCandidateSource(textCandidates,{pageNumber,method:'pdf-text'});
        results.push({text:`[第 ${pageNumber} 頁 · PDF 文字]\n${text}`,candidates,warnings:candidates.warnings,method:'pdf-text',pageNumber});
      }else{
        onProgress(`正在圖像辨識 PDF 第 ${pageNumber} 頁…`);
        const blob=await rasterizePdfPage(page,{createCanvas,signal});
        const result=await recognizeBlob(blob);
        throwIfCancelled(signal);
        const imageCandidates=withCandidateSource(result.candidates,{pageNumber,method:'pdf-ocr'});
        const candidates=textCandidates?mergeCandidatePages([withCandidateSource(textCandidates,{pageNumber,method:'pdf-text'}),imageCandidates]):imageCandidates;
        results.push({...result,text:`[第 ${pageNumber} 頁 · 圖像辨識]\n${result.text}`,candidates,warnings:[...(result.warnings||[]),...(candidates.warnings||[])],method:'pdf-ocr',pageNumber});
      }
    }finally{page.cleanup();}
  }
  const candidates=mergeCandidatePages(results.map(result=>result.candidates));
  return {text:results.map(result=>result.text).join('\n\n'),candidates,warnings:[...new Set([...candidates.warnings,...results.flatMap(result=>result.warnings||[])])],pages:results.map(({pageNumber,method})=>({pageNumber,method}))};
}

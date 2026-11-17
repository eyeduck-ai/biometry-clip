import { itemsToText,mergeCandidatePages,parseBiometry,parseBiometryItems } from './parser.js';
import { recognizeLocal } from './local.js';
import { recognizeGemini,recognizePaddleApi,blobToDataUrl } from './cloud.js';
import { withPdfDocument } from './pdf-worker.js';
import { MAX_SELECTED_PDF_PAGES,MAX_RASTER_PIXELS,boundedViewport,recognizePdfPages,rasterizePdfPage,selectedPdfPages,throwIfCancelled } from './pdf-pages.js';
import { renderPdfThumbnails,thumbnailPages } from './pdf-thumbnails.js';
import {withCandidateSource} from './evidence.js';

export { parseBiometry } from './parser.js';
export { MAX_SELECTED_PDF_PAGES } from './pdf-pages.js';
const MAX_BYTES=25*1024*1024,MAX_FILES=10;
const localAsset=path=>globalThis.chrome?.runtime?.getURL?chrome.runtime.getURL(path):new URL(`/${path}`,location.href).href;
const isPdf=file=>file.type==='application/pdf'||/\.pdf$/i.test(file.name);
let recognizing=false;
async function exclusively(work){if(recognizing)throw new Error('已有辨識工作進行中，請先等待完成或取消。');recognizing=true;try{return await work();}finally{recognizing=false;}}

async function recognizeBlob(blob,settings,onProgress,{signal,beforeCloudRequest}={}) {
  throwIfCancelled(signal);
  let cloudSettings=settings;
  if(['gemini','paddle-api'].includes(settings.ocrProvider)&&typeof beforeCloudRequest==='function'){
    const allowed=await beforeCloudRequest({provider:settings.ocrProvider});
    if(allowed===false)throw Object.assign(new Error('已取消辨識。'),{name:'AbortError'});
    throwIfCancelled(signal);
    if(allowed===true)cloudSettings={...settings,cloudConsent:true};
  }
  if(settings.ocrProvider==='gemini')return recognizeGemini(blob,{...cloudSettings,signal});
  let items;
  if(settings.ocrProvider==='paddle-api')items=await recognizePaddleApi(blob,{...cloudSettings,signal});
  else if(!settings.ocrProvider||settings.ocrProvider==='local')items=await recognizeLocal(blob,settings.localModel||'small',onProgress,{signal});
  else throw new Error('不支援此 OCR 提供者。');
  throwIfCancelled(signal);
  const text=itemsToText(items),candidates=parseBiometryItems(items),warnings=[...candidates.warnings];
  const lowConfidence=items.filter(item=>typeof item.score==='number'&&item.score<0.85).length;
  if(lowConfidence)warnings.push(`有 ${lowConfidence} 個文字區塊的 OCR 信心低於 85%，請對照原圖確認。`);
  if(!text.trim())warnings.push('沒有辨識出文字，請確認影像清晰度及方向。');
  return {text,candidates,warnings};
}

async function imageFileToBlob(file,{signal}={}) {
  throwIfCancelled(signal);
  let bitmap,canvas;
  try {
    try{bitmap=await createImageBitmap(file);}catch{throw new Error('無法解碼圖片；請使用 PNG、JPEG 或 WebP。');}
    throwIfCancelled(signal);
    if(bitmap.width*bitmap.height>25000000)throw new Error('圖片超過 2,500 萬像素，請縮小後再試。');
    const viewport=boundedViewport({getViewport:({scale})=>({width:bitmap.width*scale,height:bitmap.height*scale})},{maxScale:1});
    canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.floor(viewport.width));canvas.height=Math.max(1,Math.floor(viewport.height));
    const context=canvas.getContext('2d');if(!context)throw new Error('無法建立圖片辨識畫布。');
    context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));throwIfCancelled(signal);
    if(!blob||blob.size>MAX_BYTES)throw new Error('解碼後影像過大，請縮小後再試。');
    return blob;
  }finally{bitmap?.close();if(canvas){canvas.width=0;canvas.height=0;}}
}

export function decodeImageDataUrl(dataUrl) {
  if(typeof dataUrl!=='string'||dataUrl.length>MAX_BYTES*1.4)throw new Error('影像超過 25 MB，請縮小後再試。');
  const match=dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if(!match)throw new Error('截圖必須為 PNG、JPEG 或 WebP data URL。');
  let bytes;try{bytes=Uint8Array.from(atob(match[2]),char=>char.charCodeAt(0));}catch{throw new Error('截圖影像資料無法解碼。');}
  if(bytes.length>MAX_BYTES)throw new Error('影像超過 25 MB，請縮小後再試。');
  return new Blob([bytes],{type:match[1]});
}

export async function recognizeImage(dataUrl,settings={},onProgress=()=>{},options={}) {
  return exclusively(async()=>{
    if(typeof dataUrl!=='string'||!/^data:image\/(?:png|jpeg|webp);base64,/i.test(dataUrl))throw new Error('截圖必須為 PNG、JPEG 或 WebP data URL。');
    if(dataUrl.length>MAX_BYTES*1.4)throw new Error('影像超過 25 MB，請縮小後再試。');
    throwIfCancelled(options.signal);
    const result=await recognizeBlob(await imageFileToBlob(decodeImageDataUrl(dataUrl),options),settings,onProgress,options);
    return {...result,candidates:withCandidateSource(result.candidates,{fileIndex:0,method:'image-ocr'})};
  });
}

async function openPdf(file,useDocument,{signal}={}) {
  throwIfCancelled(signal);
  const pdfjs=await import('pdfjs-dist'),{default:workerUrl}=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  throwIfCancelled(signal);
  return withPdfDocument(pdfjs,workerUrl,{
    data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:true,useWasm:false,
    canvasMaxAreaInBytes:MAX_RASTER_PIXELS*4,maxImageSize:25000000,
    cMapUrl:localAsset('vendor-ocr/pdf-cmaps/'),cMapPacked:true,
    standardFontDataUrl:localAsset('vendor-ocr/pdf-standard_fonts/'),
  },useDocument,{signal});
}

/** Inspect a bounded sequential preview batch; never starts OCR or cloud upload. */
export async function inspectPdf(file,{previewPage=1,previewPages,previewSize,signal,onProgress=()=>{},onPreview=()=>{}}={}) {
  if(!file||!isPdf(file))throw new Error('請選擇 PDF 檔案。');
  if(file.size>MAX_BYTES)throw new Error('PDF 超過 25 MB，請縮小後再試。');
  onProgress('正在讀取 PDF 頁數…');
  return openPdf(file,async pdf=>{
    const metadata={pageCount:pdf.numPages,maxSelectedPages:MAX_SELECTED_PDF_PAGES,defaultPages:[1],preview:null,previews:[]};
    if(previewPages!==undefined){
      const pages=thumbnailPages(pdf.numPages,previewPages);
      metadata.previews=await renderPdfThumbnails(pdf,{pages,signal,onPreview,toDataUrl:blobToDataUrl});
      return metadata;
    }
    if(previewPage===false||previewPage===null)return metadata;
    selectedPdfPages(pdf.numPages,[previewPage]);
    const page=await pdf.getPage(previewPage);
    try {
      const blob=await rasterizePdfPage(page,{signal,...(previewSize==='review'?{maxEdge:1400,maxPixels:1500000,maxScale:2}:{maxEdge:480,maxPixels:230400,maxScale:1})});
      metadata.preview={pageNumber:previewPage,dataUrl:await blobToDataUrl(blob)};
      metadata.previews=[metadata.preview];
      throwIfCancelled(signal);return metadata;
    }finally{page.cleanup();}
  },{signal});
}

export async function recognizeFiles(files,settings={},onProgress=()=>{},options={}) {
  return exclusively(async()=>{
    const list=Array.from(files??[]);
    if(!list.length)throw new Error('請先選擇圖片或 PDF。');
    if(list.length>MAX_FILES)throw new Error(`單次最多辨識 ${MAX_FILES} 個檔案。`);
    let selectedPageTotal=0,selectedFileTotal=0;
    for(const [index,file]of list.entries()){
      if(file.size>MAX_BYTES)throw new Error(`檔案「${file.name}」超過 25 MB，請縮小後再試。`);
      if(!isPdf(file)&&!/^image\/(png|jpeg|webp)$/.test(file.type))throw new Error('支援 PNG、JPEG、WebP 圖片及 PDF。');
      if(isPdf(file)){
        const pages=options.pdfPages?.[index]??[1];
        if(!Array.isArray(pages)||pages.some(page=>!Number.isSafeInteger(page)||page<1))throw new Error('請選擇有效的 PDF 頁碼。');
        selectedPageTotal+=new Set(pages).size;
        if(pages.length)selectedFileTotal++;
      }else selectedFileTotal++;
    }
    if(!selectedFileTotal)throw new Error('請至少選擇一頁 PDF 或一張圖片。');
    if(selectedPageTotal>MAX_SELECTED_PDF_PAGES)throw new Error(`為控制記憶體負擔，一次最多辨識 ${MAX_SELECTED_PDF_PAGES} 頁 PDF；可分次匯入。`);
    const results=[];
    for(const [index,file]of list.entries()){
      if(isPdf(file)&&options.pdfPages?.[index]?.length===0)continue;
      throwIfCancelled(options.signal);onProgress(`正在讀取第 ${index+1}／${list.length} 個檔案…`);
      const result=isPdf(file)?await openPdf(file,pdf=>recognizePdfPages(pdf,{
        pages:options.pdfPages?.[index]??[1],forceOcr:options.forcePdfOcr===true,signal:options.signal,onProgress,
        recognizeBlob:blob=>recognizeBlob(blob,settings,onProgress,options),
      }),options):await recognizeBlob(await imageFileToBlob(file,options),settings,onProgress,options);
      results.push({...result,candidates:withCandidateSource(result.candidates,{fileIndex:index,...(!isPdf(file)?{method:'image-ocr'}:{})}),fileIndex:index});
    }
    const candidates=mergeCandidatePages(results.map(result=>result.candidates)),warnings=[...new Set([...candidates.warnings,...results.flatMap(result=>result.warnings)])];
    if(!Object.keys(candidates.eyes.OD).length&&!Object.keys(candidates.eyes.OS).length)warnings.push('尚未取得可明確對應眼別的數值。可改用圖像辨識、確認所選頁面含 OD／OS，或在面板手動補入。');
    return {text:results.map(result=>result.text).join('\n\n'),candidates,warnings,files:results.map(result=>({index:result.fileIndex,pages:result.pages||[]}))};
  });
}

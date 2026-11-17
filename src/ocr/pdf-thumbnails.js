import {throwIfCancelled,rasterizePdfPage} from './pdf-pages.js';

export const PDF_THUMBNAIL_BATCH=12;
export function thumbnailPages(pageCount,pages=[]){
  if(!Number.isSafeInteger(pageCount)||pageCount<1)throw new Error('PDF 沒有可讀取的頁面。');
  if(!Array.isArray(pages)||pages.length>PDF_THUMBNAIL_BATCH||pages.some(page=>!Number.isSafeInteger(page)||page<1||page>pageCount))throw new Error('PDF 縮圖頁碼無效，單次最多預覽 12 頁。');
  return [...new Set(pages)].sort((a,b)=>a-b);
}

/** One open PDF, sequential small rasters, one canvas at a time. Never starts OCR. */
export async function renderPdfThumbnails(pdf,{pages=[],signal,onPreview=()=>{},renderPage=rasterizePdfPage,toDataUrl}={}){
  const previews=[];
  for(const pageNumber of thumbnailPages(pdf.numPages,pages)){
    throwIfCancelled(signal);
    const page=await pdf.getPage(pageNumber);
    try{
      const blob=await renderPage(page,{signal,maxEdge:320,maxPixels:102400,maxScale:1});
      throwIfCancelled(signal);
      const preview={pageNumber,dataUrl:await toDataUrl(blob)};
      throwIfCancelled(signal);previews.push(preview);onPreview(preview);
    }finally{page.cleanup();}
  }
  return previews;
}

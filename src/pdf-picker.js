import {escapeHtml as esc} from './ui.js';
import {PDF_THUMBNAIL_BATCH} from './ocr/pdf-thumbnails.js';

/** Local, sequential thumbnails only. No OCR or cloud upload happens here. */
export async function choosePdfPages(files,{inspectPdf,showDialog,closeDialog,document:doc=globalThis.document,signal,onProgress=()=>{}}){
  const entries=[];
  for(const [fileIndex,file] of files.entries()){
    if(file.type!=='application/pdf'&&!/\.pdf$/i.test(file.name))continue;
    if(signal?.aborted)return null;
    onProgress(`正在讀取 PDF 頁數：${file.name}`);
    let metadata;try{metadata=await inspectPdf(file,{previewPage:false,signal});}catch(error){if(signal?.aborted)return null;throw error;}
    entries.push({fileIndex,file,metadata,selected:new Set(entries.length<3?[1]:[]),offset:0,previews:new Map()});
  }
  if(!entries.length)return {pdfPages:{},forcePdfOcr:false};
  if(signal?.aborted)return null;
  const hasImages=files.some(file=>file.type!=='application/pdf'&&!/\.pdf$/i.test(file.name));
  return new Promise(resolve=>{
    let settled=false,forcePdfOcr=false,dialog,previewController,generation=0,previewQueue=Promise.resolve();
    const queuePreview=work=>{const task=previewQueue.then(work,work);previewQueue=task.catch(()=>{});return task;};
    const total=()=>entries.reduce((sum,entry)=>sum+entry.selected.size,0);
    const cleanup=()=>{
      previewController?.abort();signal?.removeEventListener('abort',abort);
      dialog?.removeEventListener('close',cancel);dialog?.removeEventListener('cancel',cancel);
      for(const entry of entries)entry.previews.clear();
      for(const image of dialog?.querySelectorAll('.pdf-thumbnail-grid img,.pdf-zoom img')||[])image.removeAttribute('src');
    };
    const finish=value=>{if(settled)return;settled=true;cleanup();closeDialog();resolve(value);};
    const cancel=()=>finish(null),abort=()=>finish(null);
    const pagesFor=entry=>Array.from({length:Math.min(PDF_THUMBNAIL_BATCH,entry.metadata.pageCount-entry.offset)},(_,index)=>entry.offset+index+1);
    function showThumbnail(entry,index,preview,version){
      if(settled||version!==generation)return;
      const slot=dialog.querySelector(`[data-pdf-thumbnail-file="${index}"][data-pdf-thumbnail-page="${preview.pageNumber}"]`);
      if(!slot)return;
      entry.previews.set(preview.pageNumber,preview);
      const image=doc.createElement('img');image.src=preview.dataUrl;image.alt='';image.decoding='async';
      slot.replaceChildren(image);slot.removeAttribute('aria-busy');
      dialog.querySelector(`[data-pdf-zoom="${index}"][data-page="${preview.pageNumber}"]`)?.removeAttribute('disabled');
    }
    async function loadThumbnails(version,controller){
      for(const [index,entry] of entries.entries()){
        if(settled||controller.signal.aborted)return;
        const pages=pagesFor(entry).filter(page=>!entry.previews.has(page));
        if(!pages.length)continue;
        try{
          const metadata=await queuePreview(()=>inspectPdf(entry.file,{previewPage:false,previewPages:pages,signal:controller.signal,onPreview:preview=>showThumbnail(entry,index,preview,version)}));
          if(settled||version!==generation)return;
          for(const preview of metadata.previews||[])showThumbnail(entry,index,preview,version);
        }catch(error){
          if(settled||controller.signal.aborted||version!==generation)return;
          for(const page of pages){const slot=dialog.querySelector(`[data-pdf-thumbnail-file="${index}"][data-pdf-thumbnail-page="${page}"]`);if(slot&&!entry.previews.has(page)){slot.textContent='預覽暫不可用';slot.removeAttribute('aria-busy');}}
          const status=dialog.querySelector(`[data-pdf-preview-status="${index}"]`);
          if(status){status.textContent='縮圖載入失敗；仍可選頁，或按重試縮圖。';status.hidden=false;}
          dialog.querySelector(`[data-pdf-retry="${index}"]`)?.removeAttribute('hidden');
        }
      }
    }
    function render(){
      previewController?.abort();previewController=new AbortController();const version=++generation;
      showDialog('選擇 PDF 辨識頁面',`<p class="small-note">每頁都提供縮圖，點選縮圖選頁，放大鏡可檢視。每批最多 3 頁，先解析文字層，需要時才自動 OCR。</p>${entries.map((entry,i)=>{
        const pages=pagesFor(entry),end=pages.at(-1);
        return `<section class="pdf-file"><h3><span data-i18n-skip>${esc(entry.file.name)}</span> <small>共 ${entry.metadata.pageCount} 頁</small></h3><div class="pdf-pages pdf-thumbnail-grid" role="group" aria-label="${esc(entry.file.name)} 辨識頁面">${pages.map(page=>{
          const preview=entry.previews.get(page);
          return `<div class="pdf-page-card"><label><input type="checkbox" data-pdf-file="${i}" data-pdf-page="${page}" aria-label="選擇第 ${page} 頁" ${entry.selected.has(page)?'checked':''}><span class="pdf-thumbnail-image" data-pdf-thumbnail-file="${i}" data-pdf-thumbnail-page="${page}" ${preview?'':'aria-busy="true"'}>${preview?`<img src="${esc(preview.dataUrl)}" alt="" decoding="async">`:'載入縮圖…'}</span><span class="pdf-page-number">第 ${page} 頁</span></label><button type="button" class="pdf-zoom-button" data-pdf-zoom="${i}" data-page="${page}" aria-label="放大第 ${page} 頁" title="放大第 ${page} 頁" ${preview?'':'disabled'}>⌕</button></div>`;
        }).join('')}</div><p class="small-note" data-pdf-preview-status="${i}" hidden></p><button type="button" class="text-button" data-pdf-retry="${i}" hidden>重試縮圖</button>${entry.metadata.pageCount>PDF_THUMBNAIL_BATCH?`<div class="pdf-navigation"><button type="button" class="text-button" data-pdf-nav="${i}" data-direction="-1" ${entry.offset?'':'disabled'}>上一組</button><span>${entry.offset+1}–${end}／${entry.metadata.pageCount}</span><button type="button" class="text-button" data-pdf-nav="${i}" data-direction="1" ${end<entry.metadata.pageCount?'':'disabled'}>下一組</button></div>`:''}<div class="pdf-zoom" data-pdf-zoom-panel="${i}" hidden><div><strong data-pdf-zoom-title></strong><button type="button" class="text-button" data-pdf-close-zoom="${i}">收起預覽</button></div><img alt=""></div></section>`;
      }).join('')}<label class="check-line"><input type="checkbox" id="force-pdf-ocr" ${forcePdfOcr?'checked':''}>強制圖像 OCR（文字層結果缺漏時使用）</label><p class="small-note" id="pdf-selection-status" role="status"></p><div class="dialog-actions"><button class="button" id="pdf-cancel">取消</button><button class="button primary" id="pdf-recognize">辨識所選頁面</button></div>`);
      dialog=doc.querySelector('#review-dialog');
      dialog.removeEventListener('close',cancel);dialog.addEventListener('close',cancel);
      dialog.removeEventListener('cancel',cancel);dialog.addEventListener('cancel',cancel);
      const update=()=>{const count=total();doc.querySelector('#pdf-selection-status').textContent=`已選 ${count} 頁${hasImages?'，並辨識已上傳圖片':''}${count>3?'，請減少至 3 頁以內。':''}`;doc.querySelector('#pdf-recognize').disabled=(!hasImages&&count<1)||count>3;};
      for(const box of dialog.querySelectorAll('[data-pdf-page]'))box.onchange=()=>{const entry=entries[Number(box.dataset.pdfFile)],page=Number(box.dataset.pdfPage);box.checked?entry.selected.add(page):entry.selected.delete(page);update();};
      for(const button of dialog.querySelectorAll('[data-pdf-nav]'))button.onclick=()=>{const entry=entries[Number(button.dataset.pdfNav)];entry.offset+=Number(button.dataset.direction)*PDF_THUMBNAIL_BATCH;entry.previews.clear();render();};
      for(const button of dialog.querySelectorAll('[data-pdf-retry]'))button.onclick=()=>{button.hidden=true;render();};
      for(const button of dialog.querySelectorAll('[data-pdf-zoom]'))button.onclick=async()=>{
        const index=Number(button.dataset.pdfZoom),page=Number(button.dataset.page),panel=dialog.querySelector(`[data-pdf-zoom-panel="${index}"]`);
        panel.hidden=false;panel.dataset.page=String(page);panel.querySelector('[data-pdf-zoom-title]').textContent=`第 ${page} 頁`;
        panel.querySelector('img').src=entries[index].previews.get(page).dataUrl;
        panel.scrollIntoView?.({block:'nearest'});const zoomSignal=previewController.signal;
        try{
          const metadata=await queuePreview(()=>inspectPdf(entries[index].file,{previewPage:page,signal:zoomSignal}));
          if(!settled&&version===generation&&panel.isConnected&&panel.dataset.page===String(page)&&metadata.preview)panel.querySelector('img').src=metadata.preview.dataUrl;
        }catch{/* The already rendered thumbnail remains available for selection. */}
      };
      for(const button of dialog.querySelectorAll('[data-pdf-close-zoom]'))button.onclick=()=>{const panel=dialog.querySelector(`[data-pdf-zoom-panel="${button.dataset.pdfCloseZoom}"]`);panel.hidden=true;panel.querySelector('img').removeAttribute('src');};
      doc.querySelector('#force-pdf-ocr').onchange=event=>{forcePdfOcr=event.target.checked;};
      doc.querySelector('#pdf-cancel').onclick=cancel;
      doc.querySelector('#pdf-recognize').onclick=()=>{if((!hasImages&&total()<1)||total()>3)return;finish({pdfPages:Object.fromEntries(entries.map(entry=>[entry.fileIndex,[...entry.selected].sort((a,b)=>a-b)])),forcePdfOcr});};
      update();void loadThumbnails(version,previewController);
    }
    signal?.addEventListener('abort',abort,{once:true});render();
  });
}

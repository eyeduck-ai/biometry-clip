// Review-only sources and images. Nothing here is persisted with clinical data.
export function reviewSources(files=[],selection={}){
  const sources=[];
  for(const [fileIndex,file] of Array.from(files).entries()){
    const pdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name||'');
    if(pdf)for(const pageNumber of selection.pdfPages?.[fileIndex]??[1])sources.push({id:`${fileIndex}:${pageNumber}`,fileIndex,pageNumber,file,label:`${file.name} · p. ${pageNumber}`});
    else sources.push({id:`${fileIndex}:image`,fileIndex,pageNumber:null,file,label:file.name||'Image'});
  }
  return sources;
}
export async function loadReviewSource(source,{inspectPdf,signal,document:doc=globalThis.document,createBitmap=globalThis.createImageBitmap,urls=globalThis.URL}={}){
  signal?.throwIfAborted();
  if(source.pageNumber){
    const metadata=await inspectPdf(source.file,{previewPage:source.pageNumber,previewSize:'review',signal});
    signal?.throwIfAborted();if(!metadata.preview?.dataUrl)throw new Error('來源影像暫不可用。');
    return {url:metadata.preview.dataUrl,release(){}};
  }
  let bitmap,canvas;
  try{
    // Test runtimes without bitmap support can still use the bounded original
    // file that already passed the production import size checks.
    let blob=source.file;
    if(typeof createBitmap==='function'){
      bitmap=await createBitmap(source.file);signal?.throwIfAborted();
      const scale=Math.min(1,1400/Math.max(bitmap.width,bitmap.height),Math.sqrt(1500000/(bitmap.width*bitmap.height)));
      canvas=doc.createElement('canvas');canvas.width=Math.max(1,Math.floor(bitmap.width*scale));canvas.height=Math.max(1,Math.floor(bitmap.height*scale));
      const context=canvas.getContext('2d');if(!context)throw new Error('來源影像暫不可用。');
      context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));signal?.throwIfAborted();if(!blob)throw new Error('來源影像暫不可用。');
    }
    const url=urls.createObjectURL(blob);let released=false;
    return {url,release(){if(!released){released=true;urls.revokeObjectURL(url);}}};
  }finally{bitmap?.close();if(canvas){canvas.width=0;canvas.height=0;}}
}
/** Update only the viewer: never replace editable review fields or checkboxes. */
export function bindReviewPreview(root,{sources=[],rows=[],loadSource,onError=()=>{}}={}){
  const select=root.querySelector('[data-review-source]'),image=root.querySelector('#review-source-image'),status=root.querySelector('#review-source-status'),viewport=root.querySelector('#review-source-viewport'),zoomLabel=root.querySelector('#review-zoom-value');
  if(!select||!image||!sources.length)return()=>{};
  let disposed=false,generation=0,controller,current,zoom=1,queue=Promise.resolve();
  function applyZoom(){image.style.maxWidth='none';image.style.width=`${zoom*100}%`;image.style.height='auto';if(zoomLabel)zoomLabel.textContent=`${Math.round(zoom*100)}%`;}
  function release(){current?.release?.();current=null;image.removeAttribute('src');image.hidden=true;}
  async function show(id){
    const source=sources.find(item=>item.id===id);if(!source||disposed)return;
    const version=++generation;controller?.abort();controller=new AbortController();const active=controller;release();zoom=1;applyZoom();status.hidden=false;status.textContent='載入來源影像…';
    viewport?.setAttribute('aria-busy','true');
    const task=queue.then(()=>{if(disposed||active.signal.aborted)return null;return loadSource(source,{signal:active.signal});});queue=task.catch(()=>{});
    try{
      const loaded=await task;
      if(disposed||version!==generation||active.signal.aborted){loaded?.release?.();return;}
      if(!loaded?.url)throw new Error('來源影像暫不可用。');current=loaded;image.src=loaded.url;image.hidden=false;status.hidden=true;viewport?.removeAttribute('aria-busy');applyZoom();
    }catch(error){if(disposed||active.signal.aborted||version!==generation)return;status.hidden=false;status.textContent='來源影像暫不可用。';viewport?.removeAttribute('aria-busy');onError(error);}
  }
  const change=()=>{void show(select.value);};select.addEventListener('change',change);
  const sourceFor=(index,expand=false)=>{
    const row=rows[Number(index)],source=row?.source;if(!source)return;
    const match=sources.find(item=>item.fileIndex===source.fileIndex&&(item.pageNumber??null)===(source.pageNumber??null));
    if(match&&select.value!==match.id){select.value=match.id;change();}if(expand)root.querySelector('.review-source-panel').open=true;
  };
  const click=event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-review-field-source')){sourceFor(button.dataset.reviewFieldSource,true);return;}
    const action=button.dataset.reviewZoom;if(!action)return;
    zoom=action==='reset'?1:Math.max(.75,Math.min(4,zoom+(action==='in'?.25:-.25)));applyZoom();
  };
  const focus=event=>{const field=event.target.closest('[data-candidate-value]');if(field)sourceFor(field.dataset.candidateValue);};
  root.addEventListener('click',click);root.addEventListener('focusin',focus);change();
  return()=>{if(disposed)return;disposed=true;generation++;controller?.abort();select.removeEventListener('change',change);root.removeEventListener('click',click);root.removeEventListener('focusin',focus);release();viewport?.removeAttribute('aria-busy');};
}

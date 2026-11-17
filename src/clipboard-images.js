const supported=new Set(['image/png','image/jpeg','image/webp']);
const nonTextInputTypes=new Set(['button','submit','reset','checkbox','radio','file','range','color','image','hidden']);
const mime=value=>String(value||'').trim().toLowerCase();
const failure=()=>Object.assign(new Error('無法讀取貼上的圖片，請重新複製截圖或改用上傳圖片。'),{code:'CLIPBOARD_IMAGE_READ_FAILED'});
const signature=file=>JSON.stringify([file.name||'',mime(file.type),file.size,file.lastModified??0]);

/** Read only the DataTransfer delivered by a paste gesture, never the OS clipboard. */
export function imagesFromClipboard(data,{FileCtor=globalThis.File}={}){
  if(!data)return [];
  try{
    const images=[],itemCounts=new Map(),objects=new Set();
    function normalize(file,type,index){
      if(!file)return null;
      const format=mime(file.type)||mime(type);
      if(!supported.has(format))return null;
      if(typeof file.name==='string'&&file.name&&file.type===format)return file;
      if(typeof FileCtor!=='function')throw failure();
      const extension=format==='image/jpeg'?'jpg':format.slice(6);
      return new FileCtor([file],file.name||`clipboard-image-${index+1}.${extension}`,{type:format,lastModified:Number.isFinite(file.lastModified)?file.lastModified:Date.now()});
    }
    // Keep separate image items even when their names/size/date match. The
    // files view is only another representation of the same clipboard items.
    for(const [index,item] of Array.from(data.items||[]).entries()){
      if(item?.kind!=='file'||!supported.has(mime(item.type)))continue;
      const original=item.getAsFile();
      if(!original||objects.has(original))continue;
      const file=normalize(original,item.type,index);if(!file)continue;
      objects.add(original);images.push(file);
      const key=signature(file);itemCounts.set(key,(itemCounts.get(key)||0)+1);
    }
    const fileObjects=new Set();
    for(const [index,original] of Array.from(data.files||[]).entries()){
      if(!original||fileObjects.has(original))continue;
      fileObjects.add(original);
      const file=normalize(original,original.type,index);if(!file)continue;
      const key=signature(file),remaining=itemCounts.get(key)||0;
      if(remaining){itemCounts.set(key,remaining-1);continue;}
      if(objects.has(original))continue;
      objects.add(original);images.push(file);
    }
    return images;
  }catch{throw failure();}
}

function textControl(node){
  if(node?.nodeType!==1)return false;
  const tag=node.tagName?.toUpperCase();
  if(tag==='TEXTAREA'||tag==='SELECT'||(tag==='INPUT'&&!nonTextInputTypes.has(String(node.type||'text').toLowerCase())))return true;
  if(node.isContentEditable)return true;
  const editable=node.getAttribute?.('contenteditable');
  if(editable!==null&&editable!==undefined&&['','true','plaintext-only'].includes(String(editable).toLowerCase()))return true;
  return ['textbox','combobox'].includes(node.getAttribute?.('role'));
}

/** Bind once to the extension document; route/busy state stays with the caller. */
export function bindImagePaste(target,{isEnabled=()=>true,onImages=()=>{},onError=()=>{}}={}){
  const doc=target.nodeType===9?target:target.ownerDocument;
  const report=event=>{try{onError(failure(),event);}catch{/* Feedback must not interfere with ordinary paste. */}};
  const listener=event=>{
    try{
      if(event.defaultPrevented||!isEnabled(event))return;
      if(doc?.querySelector('dialog[open],[role="dialog"][aria-modal="true"]'))return;
      const path=typeof event.composedPath==='function'?event.composedPath():[];
      if([...path,event.target,doc?.activeElement].some(textControl))return;
      const images=imagesFromClipboard(event.clipboardData);
      if(!images.length)return;
      event.preventDefault();
      Promise.resolve(onImages(images,event)).catch(()=>report(event));
    }catch{report(event);}
  };
  target.addEventListener('paste',listener);
  return ()=>target.removeEventListener('paste',listener);
}

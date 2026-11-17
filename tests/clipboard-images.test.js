import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {imagesFromClipboard,bindImagePaste} from '../src/clipboard-images.js';

const image=(name='image.png',type='image/png',value='SYNTHETIC')=>new File([value],name,{type,lastModified:123});
const item=file=>({kind:'file',type:file.type,getAsFile:()=>file});

test('clipboard image extraction uses native file items and ignores text, HTML, unsupported and null items',()=>{
  const png=image(),jpeg=image('screen.jpg','image/jpeg'),webp=image('screen.webp','image/webp');
  const data={items:[{kind:'string',type:'text/html',getAsFile(){throw new Error('must not read HTML');}},item(png),item(jpeg),item(webp),item(image('report.pdf','application/pdf')),{kind:'file',type:'image/png',getAsFile:()=>null}],files:[]};
  assert.deepEqual(imagesFromClipboard(data),[png,jpeg,webp]);
  assert.deepEqual(imagesFromClipboard(null),[]);assert.deepEqual(imagesFromClipboard({items:[{kind:'string',type:'text/plain'}]}),[]);
});

test('file-list fallback deduplicates the second representation while retaining distinct identical-name images',()=>{
  const left=image('same.png'),right=image('same.png');
  assert.deepEqual(imagesFromClipboard({items:[item(left),item(right)],files:[left,right]}),[left,right]);
  const leftView=image('same.png'),rightView=image('same.png');
  assert.deepEqual(imagesFromClipboard({items:[item(left),item(right)],files:[leftView,rightView]}),[left,right]);
  assert.deepEqual(imagesFromClipboard({items:[item(left)],files:[leftView,rightView]}),[left,rightView]);
  assert.deepEqual(imagesFromClipboard({files:[left,right,left]}),[left,right]);
});

test('unnamed clipboard blobs acquire local image filenames without reading image contents',()=>{
  const blob=new Blob(['SYNTHETIC'],{type:'image/png'});
  const [file]=imagesFromClipboard({items:[{kind:'file',type:'image/png',getAsFile:()=>blob}]});
  assert.ok(file instanceof File);assert.match(file.name,/\.png$/);assert.equal(file.type,'image/png');assert.equal(file.size,blob.size);
});

test('malformed clipboard retrieval exposes one generic error without clipboard contents',()=>{
  assert.throws(()=>imagesFromClipboard({items:[{kind:'file',type:'image/png',getAsFile(){throw new Error('PRIVATE_SENTINEL');}}]}),error=>error.code==='CLIPBOARD_IMAGE_READ_FAILED'&&!error.message.includes('PRIVATE_SENTINEL'));
});

function fixture(t){
  const dom=new JSDOM('<div id="zone" tabindex="0"></div><input id="number"><textarea></textarea><select><option>A</option></select><div contenteditable="true"><span id="editable-child"></span></div><dialog></dialog>');
  t.after(()=>dom.window.close());
  const doc=dom.window.document,received=[],errors=[];
  let enabled=true;
  const unbind=bindImagePaste(doc,{isEnabled:()=>enabled,onImages:files=>received.push(files),onError:error=>errors.push(error)});
  const paste=(target=doc.querySelector('#zone'),data={items:[item(image())],files:[]})=>{const event=new dom.window.Event('paste',{bubbles:true,composed:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:data});target.dispatchEvent(event);return event;};
  return {doc,dom,received,errors,paste,unbind,setEnabled:value=>{enabled=value;}};
}

test('paste binding consumes image gestures only in the enabled import context and unbinds cleanly',t=>{
  const f=fixture(t);f.doc.querySelector('#zone').focus();
  assert.equal(f.paste().defaultPrevented,true);assert.equal(f.received.length,1);assert.equal(f.received[0][0].type,'image/png');
  f.setEnabled(false);let reads=0;const protectedData={get items(){reads++;throw new Error('must not access clipboard while busy or off-route');}};
  assert.equal(f.paste(undefined,protectedData).defaultPrevented,false);assert.equal(reads,0);
  f.setEnabled(true);assert.equal(f.paste(undefined,{items:[{kind:'string',type:'text/plain'}]}).defaultPrevented,false);
  f.unbind();assert.equal(f.paste().defaultPrevented,false);assert.equal(f.received.length,1);
});

test('ordinary paste in editable controls and open dialogs is untouched',t=>{
  const f=fixture(t);
  for(const selector of ['input','textarea','select','#editable-child']){const element=f.doc.querySelector(selector);element.focus();assert.equal(f.paste(element).defaultPrevented,false);}
  f.doc.querySelector('#zone').focus();f.doc.querySelector('dialog').setAttribute('open','');assert.equal(f.paste().defaultPrevented,false);assert.equal(f.received.length,0);
});

test('active text focus is protected even when a paste event is retargeted to the document',t=>{
  const f=fixture(t);f.doc.querySelector('input').focus();assert.equal(f.paste(f.doc).defaultPrevented,false);assert.equal(f.received.length,0);
});

test('binding reports malformed clipboard and async pipeline errors once without raw contents',async t=>{
  const f=fixture(t),event=f.paste(undefined,{items:[{kind:'file',type:'image/png',getAsFile(){throw new Error('PRIVATE_SENTINEL');}}]});
  assert.equal(event.defaultPrevented,false);assert.equal(f.errors.length,1);assert.equal(f.received.length,0);assert.doesNotMatch(f.errors[0].message,/PRIVATE_SENTINEL/);
  f.unbind();const errors=[];bindImagePaste(f.doc,{onImages:async()=>{throw new Error('PRIVATE_OCR_SENTINEL');},onError:error=>errors.push(error)});
  assert.equal(f.paste().defaultPrevented,true);await Promise.resolve();await Promise.resolve();assert.equal(errors.length,1);assert.doesNotMatch(errors[0].message,/PRIVATE_OCR_SENTINEL/);
});

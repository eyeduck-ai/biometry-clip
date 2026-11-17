import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {OCR_MODEL_MANIFEST,assertModelManifest,assertModelAsset} from '../scripts/ocr-model-assets.mjs';

// A real, tiny ustar file with one synthetic payload and two terminating blocks.
function syntheticArchive(){
  const data=Buffer.from('synthetic ONNX model fixture\n'),header=Buffer.alloc(512);
  header.write('synthetic.onnx');header.write('0000644\0',100);header.write('0000000\0',108);header.write('0000000\0',116);
  header.write(`${data.length.toString(8).padStart(11,'0')}\0`,124);header.write('00000000000\0',136);header.fill(32,148,156);header.write('0',156);header.write('ustar\0',257);header.write('00',263);
  const checksum=header.reduce((sum,byte)=>sum+byte,0);header.write(`${checksum.toString(8).padStart(6,'0')}\0 `,148);
  return Buffer.concat([header,data,Buffer.alloc(512-data.length),Buffer.alloc(1024)]);
}
const descriptor=bytes=>({...OCR_MODEL_MANIFEST.models[0],bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});

test('pinned manifest contains exactly the Small/Tiny detection and recognition models for the installed SDK',async()=>{
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(OCR_MODEL_MANIFEST.sdk,`@paddleocr/paddleocr-js@${pkg.dependencies['@paddleocr/paddleocr-js']}`);
  assert.deepEqual(new Set(OCR_MODEL_MANIFEST.models.map(model=>model.name)),new Set(['tiny','small'].flatMap(size=>['det','rec'].map(part=>`PP-OCRv6_${size}_${part}_onnx_infer.tar`))));
  assert.equal(Object.isFrozen(OCR_MODEL_MANIFEST),true);assert.equal(Object.isFrozen(OCR_MODEL_MANIFEST.models),true);
  assert.throws(()=>{OCR_MODEL_MANIFEST.models[0].sha256='0'.repeat(64);},TypeError);
});

test('valid synthetic ustar bytes return their verified pin values',()=>{
  const bytes=syntheticArchive(),model=descriptor(bytes),expected={name:model.name,source:model.source,bytes:bytes.length,sha256:model.sha256};
  assert.deepEqual(assertModelAsset(bytes,model),expected);
  assert.deepEqual(assertModelAsset(new Uint8Array(bytes),model),expected);
});

test('corruption and truncation fail against the known archive pin',()=>{
  const bytes=syntheticArchive(),model=descriptor(bytes),changed=Buffer.from(bytes);changed[512]^=1;
  assert.throws(()=>assertModelAsset(changed,model),/checksum mismatch/);
  assert.throws(()=>assertModelAsset(bytes.subarray(0,bytes.length-512),model),/checksum mismatch/);
  assert.throws(()=>assertModelAsset(bytes.subarray(0,200),model),/ustar archive/);
});

test('HTML error pages and non-ustar payloads fail even when their lengths and digests are pinned',()=>{
  const html=Buffer.alloc(2048,32);html.write('<!doctype html><title>Service unavailable</title>');
  assert.throws(()=>assertModelAsset(html,descriptor(html)),/ustar archive/);
  const bytes=syntheticArchive();bytes.fill(0,257,262);
  assert.throws(()=>assertModelAsset(bytes,descriptor(bytes)),/ustar archive/);
});

test('model descriptors reject unknown models, malformed hashes and invalid expected sizes',()=>{
  const bytes=syntheticArchive(),model=descriptor(bytes);
  for(const changes of [{name:'../model.tar'},{name:'PP-OCRv5_tiny_det_onnx_infer.tar'},{sha256:'x'.repeat(64)},{sha256:'F'.repeat(64)},{sha256:undefined},{bytes:'2048'},{bytes:0},{bytes:511},{bytes:2049},{bytes:NaN},{bytes:Infinity}])assert.throws(()=>assertModelAsset(bytes,{...model,...changes}),/Invalid pinned OCR model manifest/);
  assert.throws(()=>assertModelAsset(bytes,null),/Invalid pinned OCR model manifest/);
});

test('model sources reject alternate origins, credentials, altered paths and query or fragment suffixes',()=>{
  const bytes=syntheticArchive(),model=descriptor(bytes),base=new URL(model.source);
  for(const source of ['not a URL',undefined,model.source.replace('https:','http:'),model.source.replace(base.hostname,`${base.hostname}.example.com`),model.source.replace('https://','https://user:secret@'),model.source.replace('/paddlex/','/unverified/'),model.source.replace(model.name,'different.tar'),`${model.source}?download=1`,`${model.source}#fragment`])assert.throws(()=>assertModelAsset(bytes,{...model,source}),/Invalid pinned OCR model source/);
});

test('manifest validation rejects missing, duplicated and malformed model collections',()=>{
  for(const invalid of [null,{}, {...OCR_MODEL_MANIFEST,sdk:'@paddleocr/paddleocr-js@latest'},{...OCR_MODEL_MANIFEST,models:null},{...OCR_MODEL_MANIFEST,models:OCR_MODEL_MANIFEST.models.slice(1)},{...OCR_MODEL_MANIFEST,models:[...OCR_MODEL_MANIFEST.models.slice(0,3),OCR_MODEL_MANIFEST.models[0]]}])assert.throws(()=>assertModelManifest(invalid),/Invalid pinned OCR model manifest/);
  const invalid=structuredClone(OCR_MODEL_MANIFEST);invalid.models[0].sha256='invalid';assert.throws(()=>assertModelManifest(invalid),/Invalid pinned OCR model manifest/);
  const copy=structuredClone(OCR_MODEL_MANIFEST),validated=assertModelManifest(copy);copy.models[0].sha256='changed';assert.notEqual(validated.models[0].sha256,'changed');
});

test('available vendored model archives match all four release pins',async t=>{
  for(const model of OCR_MODEL_MANIFEST.models)await t.test(model.name,async t=>{
    let bytes;
    try{bytes=await readFile(new URL(`../public/vendor-ocr/${model.name}`,import.meta.url));}catch(error){if(error.code==='ENOENT'){t.skip('Run npm run vendor:ocr to install the optional local model assets.');return;}throw error;}
    assert.deepEqual(assertModelAsset(bytes,model),{name:model.name,source:model.source,bytes:model.bytes,sha256:model.sha256});
  });
});

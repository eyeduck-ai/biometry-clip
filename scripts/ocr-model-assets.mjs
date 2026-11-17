import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const MODEL_NAMES=new Set(['tiny','small'].flatMap(size=>['det','rec'].map(part=>`PP-OCRv6_${size}_${part}_onnx_infer.tar`)));
function assertModelDescriptor(model){
  if(!model||typeof model!=='object'||!MODEL_NAMES.has(model.name)||typeof model.sha256!=='string'||!/^[a-f0-9]{64}$/.test(model.sha256)||!Number.isSafeInteger(model.bytes)||model.bytes<1024||model.bytes%512!==0)throw new Error('Invalid pinned OCR model manifest.');
  let source;
  try{if(typeof model.source!=='string')throw new Error();source=new URL(model.source);}catch{throw new Error('Invalid pinned OCR model source.');}
  if(source.origin!=='https://paddle-model-ecology.bj.bcebos.com'||source.username||source.password||source.pathname!==`/paddlex/official_inference_model/paddle3.0.0/${model.name}`||source.search||source.hash)throw new Error('Invalid pinned OCR model source.');
}
export function assertModelManifest(manifest){
  if(!manifest||typeof manifest!=='object'||typeof manifest.sdk!=='string'||!/^@paddleocr\/paddleocr-js@\d+\.\d+\.\d+$/.test(manifest.sdk)||!Array.isArray(manifest.models)||manifest.models.length!==MODEL_NAMES.size)throw new Error('Invalid pinned OCR model manifest.');
  const names=new Set();
  const models=manifest.models.map(model=>{
    assertModelDescriptor(model);
    if(names.has(model.name))throw new Error('Invalid pinned OCR model manifest: duplicate model.');
    names.add(model.name);
    return Object.freeze({name:model.name,source:model.source,bytes:model.bytes,sha256:model.sha256});
  });
  return Object.freeze({sdk:manifest.sdk,models:Object.freeze(models)});
}
export const OCR_MODEL_MANIFEST=assertModelManifest(JSON.parse(await readFile(new URL('./ocr-models.json',import.meta.url),'utf8')));
/** Validate before writing or using an existing model, not after trusting it. */
export function assertModelAsset(bytes,model){
  assertModelDescriptor(model);
  const buffer=Buffer.from(bytes);
  if(buffer.length<512||buffer.subarray(257,262).toString()!=='ustar')throw new Error(`${model.name}: not an uncompressed ustar archive`);
  const digest=createHash('sha256').update(buffer).digest('hex');
  if(buffer.length!==model.bytes||digest!==model.sha256)throw new Error(`${model.name}: pinned model checksum mismatch; verify the upstream model before updating scripts/ocr-models.json`);
  return {name:model.name,source:model.source,bytes:buffer.length,sha256:digest};
}

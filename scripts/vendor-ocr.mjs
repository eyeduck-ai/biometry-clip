import { mkdir, readFile, writeFile, copyFile, stat, cp } from 'node:fs/promises';
import {OCR_MODEL_MANIFEST,assertModelAsset} from './ocr-model-assets.mjs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = join(root, 'public', 'vendor-ocr');
await mkdir(destination, { recursive: true });
const records = [];
for (const model of OCR_MODEL_MANIFEST.models) {
  const {name,source}=model,target=join(destination,name);
  let bytes;
  try { bytes=await readFile(target); } catch(error) {if(error.code!=='ENOENT')throw error;}
  if(!bytes){
    process.stdout.write(`Downloading pinned official model ${name}\n`);
    const response=await fetch(source,{signal:AbortSignal.timeout(120000)});
    if(!response.ok)throw new Error(`${name}: HTTP ${response.status}`);
    bytes=Buffer.from(await response.arrayBuffer());
    const verified=assertModelAsset(bytes,model);
    await writeFile(target,bytes);records.push(verified);
  }else records.push(assertModelAsset(bytes,model));
}

// The default onnxruntime-web entry selects the JSEP loader even when the
// requested execution provider is wasm. Ship that loader with its matching
// binary from the exact same installed package, plus the plain WASM pair.
for (const name of [
  'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm',
]) {
  await copyFile(join(root, 'node_modules', 'onnxruntime-web', 'dist', name), join(destination, name));
}
// PDF rendering must also work offline for non-embedded and CJK fonts.
for (const name of ['cmaps', 'standard_fonts']) {
  await cp(join(root, 'node_modules', 'pdfjs-dist', name), join(destination, `pdf-${name}`), { recursive: true });
}
await copyFile(join(root, 'node_modules', 'pdfjs-dist', 'LICENSE'), join(destination, 'LICENSE-PDF.js.txt'));
for (const [dependency, name] of [['onnxruntime-web', 'LICENSE-ONNX-Runtime.txt'], ['@techstark/opencv-js', 'LICENSE-OpenCV-JS.txt']]) {
  const dir = join(root, 'node_modules', dependency);
  for (const file of ['LICENSE', 'LICENSE.txt']) {
    try { await stat(join(dir, file)); await copyFile(join(dir, file), join(destination, name)); break; } catch { /* Try conventional filename. */ }
  }
}
for (const [name, url] of [
  ['LICENSE-PaddleOCR.txt', 'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/LICENSE'],
  ['LICENSE-ONNX-Runtime.txt', 'https://raw.githubusercontent.com/microsoft/onnxruntime/main/LICENSE'],
]) {
  try { await stat(join(destination, name)); }
  catch {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Cannot obtain ${name}: HTTP ${response.status}`);
    await writeFile(join(destination, name), await response.text());
  }
}
await writeFile(join(destination, 'models.json'), `${JSON.stringify({ sdk: OCR_MODEL_MANIFEST.sdk, license: 'Apache-2.0 (PaddleOCR)', source: 'https://github.com/PaddlePaddle/PaddleOCR/tree/main/paddleocr-js', models: records }, null, 2)}\n`);
process.stdout.write('Local OCR assets are ready in public/vendor-ocr. Run npm run build.\n');

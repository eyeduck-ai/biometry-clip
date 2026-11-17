import { build } from 'esbuild';
import { readFile, access } from 'node:fs/promises';
import { assertPackagedCodeCsp } from './manifest-policy.mjs';
const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
assertPackagedCodeCsp(manifest);
await build({ entryPoints: ['src/background.js'], bundle: true, format: 'esm', target: 'chrome140', outfile: 'dist/background.js' });
await build({ entryPoints: ['src/floating.js'], bundle: true, format: 'iife', target: 'chrome140', outfile: 'dist/floating.js' });
for (const file of ['index.html','floating.js',manifest.background.service_worker, ...Object.values(manifest.icons)]) await access(`dist/${file}`);
for (const file of [
  'src/ocr/sandbox.html',
  ...['tiny','small'].flatMap(model => ['det','rec'].map(part => `vendor-ocr/PP-OCRv6_${model}_${part}_onnx_infer.tar`)),
  ...['mjs','wasm'].flatMap(ext => [`vendor-ocr/ort-wasm-simd-threaded.${ext}`,`vendor-ocr/ort-wasm-simd-threaded.jsep.${ext}`]),
  'vendor-ocr/pdf-cmaps/Adobe-Japan1-UCS2.bcmap','vendor-ocr/pdf-standard_fonts/LiberationSans-Regular.ttf',
]) await access(`dist/${file}`);
console.log('Chrome MV3 extension ready: dist/');

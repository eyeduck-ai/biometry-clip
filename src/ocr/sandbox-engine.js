// This document is listed in manifest.sandbox.pages. It has no Chrome APIs.
import { PaddleOCR } from '@paddleocr/paddleocr-js';
import { documentOrigin, matchesParentOrigin, sandboxAssetBase } from './origins.js';
import { predictWithDisposableModel } from './model-lifetime.js';

const query = new URLSearchParams(location.search);
const channel = query.get('channel');
const parentOrigin = query.get('parentOrigin');
const packageOrigin = documentOrigin(location.href);
const expectedAssetBase = sandboxAssetBase(location.href);
let running = false;

function respond(message) {
  // The parent is the exact embedding WindowProxy; '*' also works when a
  // Chromium build serializes an extension custom-scheme origin as opaque.
  parent.postMessage({ ...message, channel }, '*');
}

window.addEventListener('message', async event => {
  if (event.source !== parent || !channel || parentOrigin !== packageOrigin || event.data?.channel !== channel || !matchesParentOrigin(event.origin, parentOrigin)) return;
  const message = event.data;
  if (message.type === 'biometry-ocr-ping') { respond({ type: 'biometry-ocr-ready' }); return; }
  if (message.type !== 'biometry-ocr-run' || typeof message.id !== 'string' || running) return;
  if (!['tiny', 'small'].includes(message.model) || !(message.image instanceof Blob)) return;
  // Derive the only permitted asset directory from this packaged HTML document,
  // rather than comparing URL.origin (opaque for custom extension schemes).
  if (message.assetBase !== expectedAssetBase) return;
  const base = new URL(expectedAssetBase);
  running = true;
  let output,errorMessage;
  try {
    respond({ type: 'biometry-ocr-progress', id: message.id, message: `正在載入本機 PP-OCRv6 ${message.model}…` });
    const name = `PP-OCRv6_${message.model}`;
    const [result] = await predictWithDisposableModel(()=>PaddleOCR.create({
        worker: false,
        textDetectionModelName: `${name}_det`,
        textRecognitionModelName: `${name}_rec`,
        textDetectionModelAsset: { url: new URL(`${name}_det_onnx_infer.tar`, base).href },
        textRecognitionModelAsset: { url: new URL(`${name}_rec_onnx_infer.tar`, base).href },
        ortOptions: { backend: 'wasm', wasmPaths: base.href, numThreads: 1, proxy: false },
    }),message.image,()=>respond({type:'biometry-ocr-progress',id:message.id,message:'正在本機辨識影像…'}));
    output=result.items;
  } catch (error) {
    errorMessage=`本機 OCR 失敗：${error instanceof Error ? error.message : '無法載入模型'}。可改用 Tiny、單頁辨識，或在設定選擇雲端服務。`;
  } finally {
    running=false;
  }
  // The parent removes this sandbox after every result, including failures.
  respond({type:'biometry-ocr-result',id:message.id,...(errorMessage?{error:errorMessage}:{items:output??[]})});
});

if (channel && parentOrigin === packageOrigin) respond({ type: 'biometry-ocr-ready' });

/**
 * Own one packaged worker per PDF document. PDF.js's workerSrc convenience path
 * wraps custom-scheme URLs in blob:, which MV3 extension CSP cannot permit.
 */
export async function withPdfDocument(pdfjs, workerUrl, options, useDocument, {
  WorkerCtor = globalThis.Worker,
  cleanupTimeoutMs = 3000,
  loadTimeoutMs = 45000,
  signal,
} = {}) {
  if(signal?.aborted)throw Object.assign(new Error('已取消辨識。'),{name:'AbortError'});
  const nativeWorker = new WorkerCtor(workerUrl, { type: 'module', name: 'biometry-pdf' });
  let pdfWorker;
  let loadingTask;
  let failed = false;
  let rejectWorker;
  const workerFailure = new Promise((_, reject) => { rejectWorker = reject; });
  // A constructor can throw before the first race is installed.
  workerFailure.catch(() => {});
  const workerError = () => rejectWorker(new Error('PDF 處理程序無法載入或已中斷，請重新載入擴充功能後重試。'));
  const abort=()=>rejectWorker(Object.assign(new Error('已取消辨識。'),{name:'AbortError'}));
  nativeWorker.addEventListener('error', workerError);
  nativeWorker.addEventListener('messageerror', workerError);
  signal?.addEventListener('abort',abort,{once:true});
  let loadTimer;
  try {
    if(signal?.aborted)abort();
    loadTimer=setTimeout(()=>rejectWorker(new Error('PDF 載入逾時；請確認檔案有效，或改為單頁圖片。')),loadTimeoutMs);
    pdfWorker = new pdfjs.PDFWorker({ port: nativeWorker });
    loadingTask = pdfjs.getDocument({ ...options, worker: pdfWorker, disableWorkerRendering: true });
    const document = await Promise.race([loadingTask.promise, workerFailure]);
    clearTimeout(loadTimer);
    return await Promise.race([useDocument(document), workerFailure]);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    clearTimeout(loadTimer);
    signal?.removeEventListener('abort',abort);
    nativeWorker.removeEventListener('error', workerError);
    nativeWorker.removeEventListener('messageerror', workerError);
    let cleanupError;
    // A crashed worker cannot answer PDF.js's Terminate request. Bound that
    // handshake so the explicit native Worker is still terminated on failure.
    let timer;
    try {
      if (loadingTask) await Promise.race([
        Promise.resolve().then(() => loadingTask.destroy()),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('PDF 資源釋放逾時。')), cleanupTimeoutMs); }),
      ]);
    } catch (error) { cleanupError = error; }
    finally { clearTimeout(timer); }
    try { pdfWorker?.destroy(); } catch (error) { cleanupError ??= error; }
    try { nativeWorker.terminate(); } catch (error) { cleanupError ??= error; }
    // Keep the original parse/render/OCR failure when teardown also fails.
    if (!failed && cleanupError) throw cleanupError;
  }
}

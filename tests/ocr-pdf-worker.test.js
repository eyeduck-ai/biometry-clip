import test from 'node:test';
import assert from 'node:assert/strict';
import { withPdfDocument } from '../src/ocr/pdf-worker.js';

const URL = 'chrome-extension://extension-id/assets/pdf.worker.min-hash.mjs';

function harness({ loadError, getDocumentError, constructError, destroyError, callbackError, hangLoad = false, hangDestroy = false,signal,loadTimeoutMs=45000 } = {}) {
  const calls = [];
  const nativeWorkers = [];
  const pdfWorkers = [];
  const documents = [];
  class NativeWorker extends EventTarget {
    constructor(url, options) { super(); this.url = url; this.options = options; nativeWorkers.push(this); calls.push('native:create'); }
    terminate() { this.terminated = true; calls.push('native:terminate'); }
  }
  class PDFWorker {
    constructor({ port }) {
      if (constructError) throw constructError;
      this.port = port; pdfWorkers.push(this); calls.push('pdf-worker:create');
    }
    destroy() { this.destroyed = true; calls.push('pdf-worker:destroy'); }
  }
  const pdfjs = {
    PDFWorker,
    // The helper must never mutate these globals, even with concurrent PDFs.
    GlobalWorkerOptions: Object.freeze({ workerPort: null, workerSrc: '' }),
    getDocument(options) {
      calls.push('document:create');
      if (getDocumentError) throw getDocumentError;
      const document = { id: documents.length, options }; documents.push(document);
      return {
        promise: hangLoad ? new Promise(() => {}) : loadError ? Promise.reject(loadError) : Promise.resolve(document),
        async destroy() { calls.push('document:destroy'); if (hangDestroy) await new Promise(() => {}); if (destroyError) throw destroyError; },
      };
    },
  };
  const run = (consume = async document => { calls.push('document:use'); if (callbackError) throw callbackError; return document.id; }) => withPdfDocument(pdfjs, URL, { data: new Uint8Array([1, 2, 3]) }, consume, { WorkerCtor: NativeWorker, cleanupTimeoutMs: 15,signal,loadTimeoutMs });
  return { run, calls, nativeWorkers, pdfWorkers, documents };
}

test('PDF uses the packaged module Worker directly and releases all three owners on success', async () => {
  const h = harness();
  assert.equal(await h.run(), 0);
  assert.equal(h.nativeWorkers[0].url, URL);
  assert.equal(h.nativeWorkers[0].options.type, 'module');
  assert.equal(h.pdfWorkers[0].port, h.nativeWorkers[0]);
  assert.equal(h.documents[0].options.worker, h.pdfWorkers[0]);
  assert.equal(h.documents[0].options.disableWorkerRendering, true);
  assert.deepEqual(h.calls, ['native:create', 'pdf-worker:create', 'document:create', 'document:use', 'document:destroy', 'pdf-worker:destroy', 'native:terminate']);
});

test('PDF load failure keeps its original error and still destroys task, PDFWorker and native Worker', async () => {
  const error = new Error('invalid PDF');
  const h = harness({ loadError: error });
  await assert.rejects(h.run(), actual => actual === error);
  assert.equal(h.calls.includes('document:use'), false);
  assert.deepEqual(h.calls.slice(-3), ['document:destroy', 'pdf-worker:destroy', 'native:terminate']);
});

test('render or OCR failure preserves its original error even when document teardown fails', async () => {
  const error = new Error('render failure');
  const h = harness({ callbackError: error, destroyError: new Error('teardown failure') });
  await assert.rejects(h.run(), actual => actual === error);
  assert.equal(h.pdfWorkers[0].destroyed, true);
  assert.equal(h.nativeWorkers[0].terminated, true);
});

test('synchronous document setup failure still releases the explicitly created worker', async () => {
  const error = new Error('getDocument failed');
  const h = harness({ getDocumentError: error });
  await assert.rejects(h.run(), actual => actual === error);
  assert.equal(h.pdfWorkers[0].destroyed, true);
  assert.equal(h.nativeWorkers[0].terminated, true);
  assert.equal(h.calls.includes('document:destroy'), false);
});

test('PDFWorker constructor failure terminates the native Worker', async () => {
  const error = new Error('port rejected');
  const h = harness({ constructError: error });
  await assert.rejects(h.run(), actual => actual === error);
  assert.equal(h.nativeWorkers[0].terminated, true);
});

test('cleanup errors are reported after a successful operation without leaking its Worker', async () => {
  const error = new Error('teardown failure');
  const h = harness({ destroyError: error });
  await assert.rejects(h.run(), actual => actual === error);
  assert.equal(h.pdfWorkers[0].destroyed, true);
  assert.equal(h.nativeWorkers[0].terminated, true);
});

test('native worker load errors reject pending PDF loading and bound a hung destroy handshake', async () => {
  const h = harness({ hangLoad: true, hangDestroy: true });
  const pending = h.run();
  h.nativeWorkers[0].dispatchEvent(new Event('error'));
  await assert.rejects(pending, /PDF 處理程序/);
  assert.equal(h.pdfWorkers[0].destroyed, true);
  assert.equal(h.nativeWorkers[0].terminated, true);
});

test('concurrent PDF documents own separate ports and never use a global workerPort', async () => {
  const h = harness();
  let finishFirst;
  const first = h.run(() => new Promise(resolve => { finishFirst = resolve; }));
  await Promise.resolve(); await Promise.resolve();
  const second = h.run();
  assert.equal(await second, 1);
  assert.notEqual(h.pdfWorkers[0], h.pdfWorkers[1]);
  assert.notEqual(h.pdfWorkers[0].port, h.pdfWorkers[1].port);
  assert.equal(h.nativeWorkers[0].terminated, undefined);
  assert.equal(h.nativeWorkers[1].terminated, true);
  finishFirst('first');
  assert.equal(await first, 'first');
  assert.equal(h.nativeWorkers[0].terminated, true);
});

test('cancelling PDF loading terminates its worker and an already cancelled request creates none',async()=>{
  const controller=new AbortController(),h=harness({signal:controller.signal,hangLoad:true});
  const pending=h.run();controller.abort();await assert.rejects(pending,error=>error.name==='AbortError');
  assert.equal(h.nativeWorkers[0].terminated,true);assert.equal(h.pdfWorkers[0].destroyed,true);
  const next=harness({signal:controller.signal});await assert.rejects(next.run(),error=>error.name==='AbortError');assert.equal(next.nativeWorkers.length,0);
});

test('a silent PDF loading hang is bounded and still destroys the packaged worker',async()=>{
  const h=harness({hangLoad:true,loadTimeoutMs:15});await assert.rejects(h.run(),/載入逾時/);assert.equal(h.nativeWorkers[0].terminated,true);
});

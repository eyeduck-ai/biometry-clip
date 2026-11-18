import {matchesResultRun, RESULT_PAGE_SIZE} from './result-model.js';

const databaseName = 'biometry-clip-calculations';
const storeName = 'runs';
const sortIndex = 'captured';

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error('Calculation storage was aborted.'));
  });
}

function limitOf(pageSize) {
  return Number.isSafeInteger(pageSize) ? Math.min(Math.max(pageSize, 1), 100) : RESULT_PAGE_SIZE;
}
const keyOf = run => [run.capturedAt, run.id];

function packPage(items, pageSize) {
  const runs = items.slice(0, pageSize);
  return {runs, cursor: items.length > pageSize ? keyOf(runs.at(-1)) : null};
}

/** Independent, incrementally written history. The workspace draft stays in chrome.storage. */
export function createResultStore(indexedDB = globalThis.indexedDB, keyRange = globalThis.IDBKeyRange) {
  let opening;
  function open() {
    if (!opening) {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        const runs = request.result.createObjectStore(storeName, {keyPath: 'id'});
        runs.createIndex(sortIndex, ['capturedAt', 'id'], {unique: true});
      };
      opening = requestValue(request).then(database => {
        database.onversionchange = () => { database.close(); opening = undefined; };
        return database;
      }).catch(error => { opening = undefined; throw error; });
    }
    return opening;
  }
  return {
    async add(run) {
      const database = await open();
      const tx = database.transaction(storeName, 'readwrite');
      const done = transactionDone(tx);
      tx.objectStore(storeName).add(run);
      await done;
      return run;
    },
    async get(id) {
      const database = await open();
      return requestValue(database.transaction(storeName).objectStore(storeName).get(id));
    },
    async update(id, change) {
      const database = await open();
      const tx = database.transaction(storeName, 'readwrite');
      const runs = tx.objectStore(storeName);
      const done = transactionDone(tx);
      const request = runs.get(id);
      let updated;
      let failure;
      request.onsuccess = () => {
        try {
          if (!request.result) throw new Error('The calculation record no longer exists.');
          updated = change(request.result);
          runs.put(updated);
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      await done.catch(error => { throw failure || error; });
      return updated;
    },
    async remove(id) {
      const database = await open();
      const tx = database.transaction(storeName, 'readwrite');
      const done = transactionDone(tx);
      tx.objectStore(storeName).delete(id);
      await done;
    },
    async list({cursor, pageSize, filter} = {}) {
      const database = await open();
      const limit = limitOf(pageSize);
      const index = database.transaction(storeName).objectStore(storeName).index(sortIndex);
      const request = index.openCursor(cursor ? keyRange.upperBound(cursor, true) : null, 'prev');
      return new Promise((resolve, reject) => {
        const items = [];
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const position = request.result;
          if (!position) return resolve(packPage(items, limit));
          if (matchesResultRun(position.value, filter)) items.push(position.value);
          if (items.length > limit) return resolve(packPage(items, limit));
          position.continue();
        };
      });
    },
  };
}

/** UI preview and focused transport tests use the same pagination contract. */
export function createMemoryResultStore() {
  const records = new Map();
  return {
    async add(run) {
      if (records.has(run.id)) throw new Error('The calculation record already exists.');
      records.set(run.id, structuredClone(run));
      return structuredClone(run);
    },
    async get(id) { return structuredClone(records.get(id)); },
    async update(id, change) {
      if (!records.has(id)) throw new Error('The calculation record no longer exists.');
      const run = change(structuredClone(records.get(id)));
      records.set(id, structuredClone(run));
      return structuredClone(run);
    },
    async remove(id) { records.delete(id); },
    async list({cursor, pageSize, filter} = {}) {
      const runs = [...records.values()].filter(run => {
        if (cursor && (run.capturedAt > cursor[0] || run.capturedAt === cursor[0] && run.id >= cursor[1])) return false;
        return matchesResultRun(run, filter);
      }).sort((a,b) => b.capturedAt.localeCompare(a.capturedAt) || b.id.localeCompare(a.id));
      return structuredClone(packPage(runs, limitOf(pageSize)));
    },
  };
}

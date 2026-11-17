import { cleanCase, emptyCase, EYE_FIELDS, PATIENT_FIELDS } from './model.js';

export const SESSION_KEY = 'biometrySession';
const copy = value => structuredClone(value);
export class SessionConflict extends Error {
  constructor(code, message) { super(message); this.name = 'SessionConflict'; this.code = code; }
}
function cleanSelection(value) {
  if(!value || typeof value.patientId!=='string' || !value.patientId || value.patientId.length>100)return undefined;
  if(value.measurementId!=null&&(typeof value.measurementId!=='string'||!value.measurementId||value.measurementId.length>100))return undefined;
  return {patientId:value.patientId,measurementId:value.measurementId??null};
}

// Only the service worker owns this queue. Patches read the latest committed
// record, so independent floating panels never replace each other's whole case.
export function createSessionStore(storage, { newToken = () => crypto.randomUUID() } = {}) {
  let record;
  let initialization;
  let queue = Promise.resolve();
  async function initialize() {
    if (record) return record;
    if (!initialization) initialization = (async () => {
      const saved = await storage.get([SESSION_KEY, 'biometryCase']);
      const existing = saved[SESSION_KEY];
      if (existing && typeof existing.caseToken === 'string' && existing.caseToken && Number.isSafeInteger(existing.revision) && existing.revision >= 0) {
        try {
          record = { data: cleanCase(existing.data), revision: existing.revision, caseToken: existing.caseToken, lastWriter: typeof existing.lastWriter === 'string' ? existing.lastWriter : '' };
          const selection=cleanSelection(existing.selection);if(selection)record.selection=selection;
          return record;
        } catch { /* Invalid old data is replaced with a new empty case. */ }
      }
      let data = emptyCase();
      try { if (saved.biometryCase) data = cleanCase(saved.biometryCase); } catch { /* Treat invalid legacy data as empty. */ }
      const next = { data, revision: 0, caseToken: newToken(), lastWriter: '' };
      await storage.set({ [SESSION_KEY]: next, biometryCase: next.data });
      record = next;
      return record;
    })().catch(error => { initialization = undefined; throw error; });
    return initialization;
  }
  function serialize(work) {
    const next = queue.then(async () => work(await initialize()));
    queue = next.catch(() => {});
    return next;
  }
  function guard(current, expectedToken) {
    if (typeof expectedToken !== 'string' || expectedToken !== current.caseToken) throw new SessionConflict('CASE_CHANGED', '個案已在另一個視窗清除或更換，請重新核對目前資料。');
  }
  async function commit(next) {
    // Persist first. A failed write must not advance the in-memory revision.
    await storage.set({ [SESSION_KEY]: next, biometryCase: next.data });
    record = next;
    return copy(next);
  }
  return {
    read: () => serialize(current => copy(current)),
    guardWork: (expectedToken, expectedRevision, work) => serialize(current=>{
      guard(current,expectedToken);
      if(expectedRevision!==current.revision)throw new SessionConflict('REVISION_CHANGED','草稿已被其他視窗更新，請重新核對後儲存。');
      return work(copy(current));
    }),
    reconcileAfter: (expectedToken, expectedRevision, work, lastWriter='') => serialize(async current=>{
      guard(current,expectedToken);
      if(expectedRevision!==current.revision)throw new SessionConflict('REVISION_CHANGED','工作副本已被其他視窗更新，請重新操作。');
      const changed=await work(copy(current));
      if(!changed.reconcile)return changed.result;
      const next={...copy(current),revision:current.revision+1,caseToken:newToken(),lastWriter:String(lastWriter).slice(0,100)};
      const selection=cleanSelection(changed.selection);
      if(selection)next.selection=selection;else delete next.selection;
      if(changed.patientPatch)next.data.patient=cleanCase({patient:{...next.data.patient,...changed.patientPatch},eyes:next.data.eyes}).patient;
      // Library changes never discard a draft. Detach deleted snapshots and
      // invalidate outstanding panel operations while preserving both eyes.
      const session=await commit(next);return {...changed.result,session};
    }),
    selectFrom: (expectedToken, expectedRevision, load, lastWriter='') => serialize(async current=>{
      guard(current,expectedToken);
      if(expectedRevision!==current.revision)throw new SessionConflict('REVISION_CHANGED','草稿已被其他視窗更新，請重新核對後切換。');
      const loaded=await load(),selection=cleanSelection(loaded.selection);
      if(!selection)throw new Error('選取的病人或測量識別不正確。');
      return commit({data:cleanCase(loaded.data),revision:current.revision+1,caseToken:newToken(),lastWriter:String(lastWriter).slice(0,100),selection});
    }),
    patch: (patch, expectedToken, lastWriter = '') => serialize(async current => {
      guard(current, expectedToken);
      const next = copy(current);
      for (const key of PATIENT_FIELDS) if (Object.hasOwn(patch?.patient || {}, key)) {
        const value = patch.patient[key];
        if (typeof value === 'string' || typeof value === 'number') next.data.patient[key] = String(value).slice(0, 150);
      }
      for (const eye of ['OD', 'OS']) for (const key of EYE_FIELDS) if (Object.hasOwn(patch?.eyes?.[eye] || {}, key)) {
        const value = patch.eyes[eye][key];
        if (['toric','keratoconus'].includes(key)) { if (typeof value === 'boolean') next.data.eyes[eye][key] = value; }
        else if (typeof value === 'string' || typeof value === 'number') next.data.eyes[eye][key] = String(value).slice(0, 100);
      }
      if (['OD', 'OS'].includes(patch?.activeEye)) next.data.activeEye = patch.activeEye;
      next.data = cleanCase(next.data);
      next.revision++;
      next.lastWriter = String(lastWriter).slice(0, 100);
      return commit(next);
    }),
    clear: (expectedToken, lastWriter = '') => serialize(current => {
      guard(current, expectedToken);
      return commit({ data: emptyCase(), revision: current.revision + 1, caseToken: newToken(), lastWriter: String(lastWriter).slice(0, 100) });
    }),
    replace: (data, expectedToken, expectedRevision, lastWriter = '') => serialize(current => {
      guard(current, expectedToken);
      if (expectedRevision !== current.revision) throw new SessionConflict('REVISION_CHANGED', '其他視窗已更新資料，請重新載入後核對再匯入。');
      return commit({ data: cleanCase(data), revision: current.revision + 1, caseToken: newToken(), lastWriter: String(lastWriter).slice(0, 100) });
    }),
  };
}

export function isTrustedPanelSender(sender, extensionId) {
  if (sender?.id !== extensionId || typeof sender.url !== 'string') return false;
  try {
    const url = new URL(sender.url);
    return url.protocol === 'chrome-extension:' && url.hostname === extensionId && url.pathname === '/index.html';
  } catch { return false; }
}

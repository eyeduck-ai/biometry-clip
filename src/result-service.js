import {cleanResultInputs, createResultRun, encodeResultChoices, resultAssociation} from './result-model.js';
import {createResultStore} from './result-store.js';
import {matchResultSite, sameResultPage, sameResultSiteOrigin} from './result-sites.js';
import {isTrustedPanelSender} from './session-store.js';

const prefix = 'biometry:results:';
const keyFor = tabId => `biometryResultWatch:${tabId}`;
const validTabId = value => Number.isSafeInteger(value) && value >= 0;
const bounded = value => typeof value === 'string' && value.length <= 100;
const sizeLimit = 1_500_000;
const errorWith = (code, message) => Object.assign(new Error(message), {code});

async function signature(groups) {
  const comparable = groups.map(group => ({...group,
    rows: group.rows.map(({highlighted, siteSelected, ...row}) => row),
  }));
  const data = new TextEncoder().encode(JSON.stringify(comparable));
  if (data.byteLength > sizeLimit) throw errorWith('RESULT_TOO_LARGE', '這次計算結果超過可儲存的大小。');
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

export function createResultService(chrome, {readSession, readLibrary, history = createResultStore(),
  newId = () => crypto.randomUUID(), now = () => new Date().toISOString()} = {}) {
  const inFlight = new Map();
  const sessionStorage = chrome.storage.session;
  const adapterVersion = chrome.runtime.getManifest?.()?.version || '0.5.4';

  function serialize(tabId, work) {
    const task = (inFlight.get(tabId) || Promise.resolve()).catch(() => {}).then(work);
    inFlight.set(tabId, task);
    return task.finally(() => { if (inFlight.get(tabId) === task) inFlight.delete(tabId); });
  }
  async function readWatch(tabId) { return (await sessionStorage.get(keyFor(tabId)))[keyFor(tabId)]; }
  function saveWatch(tabId, watch) { return sessionStorage.set({[keyFor(tabId)]: watch}); }
  function clearWatch(tabId) { return sessionStorage.remove(keyFor(tabId)); }
  async function tabContext(tabId) {
    if (!validTabId(tabId)) throw errorWith('RESULT_TAB', '請選擇支援的計算網站分頁。');
    const tab = await chrome.tabs.get(tabId);
    const site = matchResultSite(tab?.url);
    if (!site) throw errorWith('RESULT_SITE', '這個分頁不是支援的計算網站結果頁。');
    return {tab, site};
  }
  async function attach(tabId) {
    const [top] = await chrome.scripting.executeScript({
      target: {tabId, frameIds: [0]}, files: ['result-probe.js'],
    });
    if (!top || top.frameId !== 0 || !top.documentId) throw errorWith('RESULT_DOCUMENT', '網站頁面已變更，請重新擷取。');
    return top.documentId;
  }
  function probe(tabId, documentId, action, properties = {}) {
    return chrome.tabs.sendMessage(tabId, {type: `biometry:result-probe:${action}`, ...properties},
      documentId ? {documentId, frameId: 0} : {frameId: 0});
  }
  async function checkedSample(tabId, expected, sample) {
    const current = await tabContext(tabId);
    if (current.site.id !== expected.site.id || sample?.siteId !== current.site.id ||
        !sameResultPage(sample.url, current.tab.url) || !sameResultPage(expected.tab.url, current.tab.url)) {
      throw errorWith('RESULT_DOCUMENT', '網站頁面已變更，請重新擷取。');
    }
    return current;
  }
  async function currentSelection() {
    const session = await readSession();
    return {caseToken: session.caseToken, revision: session.revision, selection: session.selection || null};
  }
  async function selectionForWatch(watch) {
    const current = await currentSelection();
    return current.caseToken === watch.context.caseToken ? watch.context.selection : null;
  }
  function announce() {
    Promise.resolve(chrome.runtime.sendMessage?.({type: `${prefix}changed`})).catch(() => {});
  }
  function watchStatus(watch, siteId = watch?.siteId) {
    return {watching: Boolean(watch && watch.siteId === siteId), lastSavedAt: watch?.lastSavedAt || ''};
  }
  async function startWatcher(tabId, watch, captureExisting) {
    const documentId = await attach(tabId);
    if (captureExisting && watch.documentId === documentId) return watch;
    const response = await probe(tabId, documentId, 'watch', {
      nonce: watch.nonce, siteId: watch.siteId, captureExisting,
    });
    if (!response?.ok) throw errorWith('RESULT_DOCUMENT', '無法開始監看這個結果頁。');
    const context = await tabContext(tabId);
    await checkedSample(tabId, context, response.sample);
    if (context.site.id !== watch.siteId) throw errorWith('RESULT_SITE', '計算網站已切換，請重新啟用自動擷取。');
    const next = {...watch, documentId};
    if (!captureExisting) {
      next.lastResultKey = '';
      next.initialForm = response.sample.observedForm;
    }
    await saveWatch(tabId, next);
    return next;
  }
  async function setWatch(tabId, enabled) {
    const current = await tabContext(tabId);
    const earlier = await readWatch(tabId);
    if (!enabled) {
      await clearWatch(tabId);
      if (earlier) await probe(tabId, earlier.documentId, 'stop').catch(() => {});
      return watchStatus(null);
    }
    const context = await currentSelection();
    const watch = await startWatcher(tabId, {siteId: current.site.id, nonce: newId(), context}, false);
    return watchStatus(watch);
  }
  async function persist(sample, current, trigger, selection, {watch, documentId} = {}) {
    const capturedAt = now();
    const run = createResultRun({
      sample, site: current.site, pageUrl: current.tab.url, trigger, selection,
      id: newId(), now: capturedAt, adapterVersion,
    });
    if (!run) return {saved: false};
    const fingerprint = await signature(run.groups);
    const resultKey = documentId + ':' + fingerprint;
    if (trigger === 'automatic' && watch?.lastResultKey === resultKey) return {saved: false, duplicate: true};
    if (watch?.initialForm && Object.values(watch.initialForm).some(fields => Object.keys(fields).length)) {
      run.watchStartForm = watch.initialForm;
    }
    const triggerAge = Date.parse(capturedAt) - Date.parse(watch?.formBefore?.observedAt);
    if (triggerAge >= 0 && triggerAge < 120_000) {
      run.preCalculationForm = watch.formBefore;
    }
    if (new TextEncoder().encode(JSON.stringify(run)).byteLength > sizeLimit) {
      throw errorWith('RESULT_TOO_LARGE', '這次計算結果超過可儲存的大小。');
    }
    await history.add(run);
    if (watch) {
      const {formBefore, ...next} = watch;
      await saveWatch(current.tab.id, {...next, lastResultKey: resultKey, lastSavedAt: capturedAt});
    }
    announce();
    return {saved: true, run};
  }
  async function capture(tabId) {
    const expected = await tabContext(tabId);
    const before = await currentSelection();
    const documentId = await attach(tabId);
    const response = await probe(tabId, documentId, 'read');
    const current = await checkedSample(tabId, expected, response?.sample);
    const after = await currentSelection();
    const selection = after.caseToken === before.caseToken ? before.selection : null;
    const watch = await readWatch(tabId);
    return persist(response.sample, current, 'manual', selection, {
      watch: watch?.siteId === current.site.id ? watch : null, documentId,
    });
  }
  async function observe(message, sender, inputOnly = false) {
    const tabId = sender?.tab?.id;
    if (sender?.id !== chrome.runtime.id || sender.frameId !== 0 || !validTabId(tabId) ||
        !sender.documentId || !sameResultSiteOrigin(sender.url, message.sample?.url)) {
      throw errorWith('RESULT_SENDER', '無法確認計算結果來源。');
    }
    return serialize(tabId, async () => {
      const watch = await readWatch(tabId);
      if (!watch || watch.nonce !== message.nonce || watch.documentId !== sender.documentId) {
        throw errorWith('RESULT_WATCH', '此分頁未啟用自動擷取。');
      }
      const expected = await tabContext(tabId);
      if (expected.site.id !== watch.siteId) throw errorWith('RESULT_SITE', '計算網站已切換，請重新啟用自動擷取。');
      const current = await checkedSample(tabId, expected, message.sample);
      if (inputOnly) {
        const {observedForm} = message.sample;
        await saveWatch(tabId, {...watch, formBefore: {
          observedAt: now(), OD: cleanResultInputs(observedForm?.OD), OS: cleanResultInputs(observedForm?.OS),
        }});
        return true;
      }
      return persist(message.sample, current, 'automatic', await selectionForWatch(watch), {
        watch, documentId: sender.documentId,
      }).then(({saved, duplicate}) => ({saved, duplicate}));
    });
  }
  function reconnect(tabId, change, tab) {
    if (change.status !== 'complete' || !validTabId(tabId)) return;
    return serialize(tabId, async () => {
      let watch = await readWatch(tabId);
      const site = matchResultSite(tab?.url);
      if (!watch && site && validTabId(tab.openerTabId)) {
        const parent = await readWatch(tab.openerTabId);
        if (parent?.siteId === site.id) watch = {...parent, nonce: newId(), documentId: ''};
      }
      if (!watch) return;
      if (site?.id !== watch.siteId) {
        await clearWatch(tabId);
        return;
      }
      await startWatcher(tabId, watch, true);
    }).catch(() => {});
  }
  async function confirmAssociation(message) {
    const current = await currentSelection();
    if (message.caseToken !== current.caseToken || message.revision !== current.revision) {
      throw errorWith('RESULT_SELECTION', '病人或測量已變更，請重新確認關聯。');
    }
    const linked = current.selection;
    const known = linked && (await readLibrary()).patients.find(patient => patient.id === linked.patientId);
    if (!known || (linked.measurementId && !known.measurements.some(item => item.id === linked.measurementId))) {
      throw errorWith('RESULT_SELECTION', '請先在病人分頁選擇要關聯的病人或測量。');
    }
    const run = await history.update(message.id, existing => ({...existing, association: resultAssociation(linked, 'confirmed')}));
    announce();
    return run;
  }
  async function request(message, sender) {
    const action = message.type.slice(prefix.length);
    if (action === 'observed' || action === 'form-before') return observe(message, sender, action === 'form-before');
    if (!isTrustedPanelSender(sender, chrome.runtime.id) || new URL(sender.url).searchParams.get('view') === 'qa') {
      throw errorWith('RESULT_SENDER', '只有擴充功能面板能存取計算紀錄。');
    }
    if (['status', 'watch', 'capture'].includes(action)) {
      const tabId = message.tabId;
      const query = new URL(sender.url).searchParams;
      if (!validTabId(tabId) || query.get('view') === 'floating' && query.get('tabId') !== String(tabId)) {
        throw errorWith('RESULT_TAB', '請選擇支援的計算網站分頁。');
      }
      return serialize(tabId, async () => {
        if (action === 'capture') return capture(tabId);
        if (action === 'watch') return setWatch(tabId, message.enabled === true);
        const {site} = await tabContext(tabId);
        return watchStatus(await readWatch(tabId), site.id);
      });
    }
    if (action === 'list') {
      const cursor = Array.isArray(message.cursor) && message.cursor.length === 2 && message.cursor.every(bounded)
        ? message.cursor : null;
      const filter = message.filter || {};
      return history.list({cursor, pageSize: message.pageSize, filter: Object.fromEntries(
        ['siteId', 'patientId', 'eye'].filter(key => bounded(filter[key])).map(key => [key, filter[key]]),
      )});
    }
    if (!bounded(message.id) || !message.id) throw errorWith('RESULT_ID', '找不到指定的計算紀錄。');
    if (action === 'confirm-association') return confirmAssociation(message);
    if (action === 'unlink') {
      const run = await history.update(message.id, item => ({...item, association: resultAssociation(null)}));
      announce();
      return run;
    }
    if (action === 'choices') {
      const run = await history.update(message.id, item => ({...item, choices: encodeResultChoices(item, message.choices)}));
      announce();
      return run;
    }
    if (action === 'remove') {await history.remove(message.id); announce(); return true;}
    throw errorWith('RESULT_OPERATION', '不支援的計算紀錄操作。');
  }
  return {handles: type => typeof type === 'string' && type.startsWith(prefix) && type !== `${prefix}changed`,
    request, reconnect, removed: tabId => serialize(tabId, () => clearWatch(tabId)).catch(() => {})};
}

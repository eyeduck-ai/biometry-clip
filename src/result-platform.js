import {matchResultSite} from './result-sites.js';
import {createMemoryResultStore} from './result-store.js';

export const resultExtension = Boolean(globalThis.chrome?.runtime?.id);
const preview = createMemoryResultStore();

export async function resultTabs() {
  if (!resultExtension) return [];
  const tabs = await chrome.tabs.query({});
  return tabs.flatMap(tab => {
    const site = matchResultSite(tab.url);
    return site ? [{id: tab.id, active: tab.active, siteId: site.id, siteName: site.name, title: `#${tab.id}`}] : [];
  });
}

export async function resultRequest(action, properties = {}) {
  if (!resultExtension) {
    if (action === 'list') return preview.list(properties);
    throw new Error('請先在 Chrome 載入擴充功能。');
  }
  const response = await chrome.runtime.sendMessage({type: `biometry:results:${action}`, ...properties});
  if (!response?.ok) throw Object.assign(new Error(response?.error || '計算紀錄操作未完成。'), {code: response?.code});
  return response.result;
}

export function subscribeResults(callback) {
  if (!resultExtension) return () => {};
  const listener = (message, sender) => {
    if (sender.id === chrome.runtime.id && !sender.tab && message?.type === 'biometry:results:changed') callback();
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}

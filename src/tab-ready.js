import { matchSite } from './sites.js';

/** Wait for a newly created or navigating calculator before injecting its UI. */
export async function waitForSupportedTab(tabs, tabId, timeoutMs = 15000) {
  const id = Number(tabId);
  if (!Number.isSafeInteger(id) || id < 0) throw new Error('無效的計算網站分頁。');
  const initial = await tabs.get(id);
  if (initial.status !== 'loading') {
    if (!matchSite(initial.url)) throw new Error('此分頁不是支援的計算網站。');
    return initial;
  }
  return new Promise((resolve,reject)=>{
    let done = false;
    const timer = setTimeout(()=>finish(new Error('網站仍在載入；完成後請點選擴充功能圖示。')),timeoutMs);
    function finish(error,tab) {
      if(done)return;done=true;clearTimeout(timer);
      tabs.onUpdated.removeListener(onUpdated);tabs.onRemoved?.removeListener(onRemoved);
      if(error)reject(error);else resolve(tab);
    }
    function check(tab) {
      if(tab.status==='loading')return;
      if(!matchSite(tab.url))finish(new Error('網站已導向其他頁面，請在指定計算頁面開啟懸浮窗。'));
      else finish(null,tab);
    }
    function onUpdated(updatedId,changeInfo,tab) {
      if(updatedId!==id || (changeInfo.status!=='complete' && tab?.status!=='complete'))return;
      if(tab?.url)check(tab);else tabs.get(id).then(check,error=>finish(error));
    }
    function onRemoved(removedId) {if(removedId===id)finish(new Error('計算網站分頁已關閉。'));}
    tabs.onUpdated.addListener(onUpdated);tabs.onRemoved?.addListener(onRemoved);
    // Cover a completion between the initial tabs.get and listener registration.
    tabs.get(id).then(check,error=>finish(error));
  });
}

export const PANEL_PHASES = Object.freeze(['starting','ready','error']);
const validPhase = phase => PANEL_PHASES.includes(phase);

// This context contains only an iframe instance identifier and its browser tab.
export function panelContextFromUrl(href,extensionId) {
  let url;
  try {url=new URL(href);} catch {return undefined;}
  if (!extensionId || url.protocol!=='chrome-extension:' || url.hostname!==extensionId || url.pathname!=='/index.html') return undefined;
  const query = url.searchParams;
  if (['view','tabId','panelToken'].some(key=>query.getAll(key).length!==1) || query.get('view')!=='floating') return undefined;
  const rawTabId=query.get('tabId'),panelToken=query.get('panelToken');
  if (!/^\d+$/.test(rawTabId || '') || !Number.isSafeInteger(Number(rawTabId)) || !/^[A-Za-z0-9_-]{16,100}$/.test(panelToken || '')) return undefined;
  return {tabId:Number(rawTabId),panelToken};
}

export function panelStatusRelay(message,sender,extensionId) {
  if (message?.type!=='biometry:panel-status' || !validPhase(message.phase) || sender?.id!==extensionId) return undefined;
  if (!Number.isInteger(sender.frameId) || sender.frameId<=0 || !Number.isSafeInteger(sender.tab?.id) || sender.tab.id<0) return undefined;
  const context=panelContextFromUrl(sender.url,extensionId);
  if (!context || context.tabId!==sender.tab.id) return undefined;
  return {type:'biometry:panel-status',phase:message.phase,panelToken:context.panelToken,tabId:context.tabId};
}

export async function reportPanelStatus(phase) {
  const runtime=globalThis.chrome?.runtime;
  if (!runtime?.id || !validPhase(phase) || !panelContextFromUrl(globalThis.location?.href,runtime.id)) return;
  try {return await runtime.sendMessage({type:'biometry:panel-status',phase});}
  catch {return {ok:false,code:'PANEL_UNAVAILABLE'};}
}

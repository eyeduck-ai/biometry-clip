// Development-only Chrome API adapter. It is not a production build entry.
const query=new URLSearchParams(location.search);
const channel=query.get('qaChannel');
if(location.protocol!=='http:' || !['127.0.0.1','localhost','[::1]'].includes(location.hostname) || !channel || window.parent===window)throw new Error('請從本機 HTTP 合成流程驗證頁開啟面板。');
// HTTP-only readiness transport. The production helper intentionally accepts
// only chrome-extension: documents and is not bypassed by this adapter.
function panelStatus(phase){
  if(!['starting','ready','error'].includes(phase))return;
  const panelToken=query.get('panelToken'),rawTabId=query.get('tabId');
  if(!/^[A-Za-z0-9_-]{16,100}$/.test(panelToken || '') || !/^\d+$/.test(rawTabId || '') || !Number.isSafeInteger(Number(rawTabId)))return;
  parent.postMessage({type:'qa:panel-status',qaChannel:channel,phase,panelToken,tabId:Number(rawTabId)},location.origin);
}
window.addEventListener('biometry:panel-ready',()=>panelStatus('ready'));
window.addEventListener('biometry:panel-failed',()=>panelStatus('error'));
const callbacks=new Map();
const event=()=>{const listeners=new Set();return {addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),emit:(...args)=>{for(const fn of listeners)fn(...args);}};};
const storageChanged=event(),activated=event(),updated=event(),removed=event();
window.addEventListener('message',event=>{
  if(event.source!==parent || event.origin!==location.origin || event.data?.qaChannel!==channel)return;
  const message=event.data;
  if(message.type==='qa:response'){
    const request=callbacks.get(message.id);if(!request)return;
    clearTimeout(request.timer);callbacks.delete(message.id);
    message.error?request.reject(new Error(message.error)):request.resolve(message.value);
  }
  if(message.type==='qa:storage-change')storageChanged.emit(message.changes,message.area);
  if(message.type==='qa:tabs-change')activated.emit({tabId:message.tabId,windowId:1});
});
function request(method,args=[]){return new Promise((resolve,reject)=>{
  const id=crypto.randomUUID(),timer=setTimeout(()=>{callbacks.delete(id);reject(new Error('合成 QA API 回應逾時。'));},15000);
  callbacks.set(id,{resolve,reject,timer});
  parent.postMessage({type:'qa:request',qaChannel:channel,id,method,args},location.origin);
});}
window.chrome={
  runtime:{id:'qa-only',getURL:path=>new URL(`/${path}`,location.origin).href,sendMessage:message=>request('runtime.sendMessage',[message])},
  storage:{
    local:{get:keys=>request('storage.local.get',[keys]),set:values=>request('storage.local.set',[values])},
    session:{get:keys=>request('storage.session.get',[keys]),set:values=>request('storage.session.set',[values])},
    onChanged:storageChanged,
  },
  tabs:{
    query:options=>request('tabs.query',[options]),get:id=>request('tabs.get',[id]),
    create:options=>request('tabs.create',[options]),update:(id,options)=>request('tabs.update',[id,options]),
    sendMessage:(id,message,options)=>request('tabs.sendMessage',[id,message,options]),
    captureVisibleTab:()=>Promise.reject(new Error('此合成 QA 頁不擷取畫面。')),
    onActivated:activated,onUpdated:updated,onRemoved:removed,
  },
  scripting:{executeScript:details=>request('scripting.executeScript',[{target:details.target,args:details.args,files:details.files}])},
  permissions:{request:()=>Promise.resolve(true)},
};
panelStatus('starting');
try{await import('../app.js');}catch(error){panelStatus('error');throw error;}

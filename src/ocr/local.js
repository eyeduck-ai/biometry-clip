import { documentOrigin } from './origins.js';

const cancelled=()=>Object.assign(new Error('已取消辨識。'),{name:'AbortError'});

/** One bounded sandbox per inference. Removing it releases retained WASM heaps. */
export function createLocalOcrClient({document:doc,window:win,createId=()=>crypto.randomUUID(),assetUrl,
  origin,readyTimeoutMs=45000,taskTimeoutMs=180000,timers=globalThis}={}) {
  let queue=Promise.resolve();
  function recognize(image,model='small',onProgress=()=>{},{signal}={}) {
    const work=()=>{
      if(signal?.aborted)throw cancelled();
      return new Promise((resolve,reject)=>{
        const frame=doc.createElement('iframe'),channel=createId(),id=createId();
        let timer,settled=false,started=false;
        frame.hidden=true;frame.sandbox='allow-scripts';frame.title='本機 OCR 隔離環境';
        const url=new URL(assetUrl('src/ocr/sandbox.html'));
        url.searchParams.set('channel',channel);url.searchParams.set('parentOrigin',origin);
        function cleanup(){timers.clearTimeout(timer);win.removeEventListener('message',receive);signal?.removeEventListener('abort',abort);frame.removeEventListener('error',failed);frame.remove();}
        function finish(error,items){if(settled)return;settled=true;cleanup();error?reject(error):resolve(items??[]);}
        function arm(ms,message){timers.clearTimeout(timer);timer=timers.setTimeout(()=>finish(new Error(message)),ms);}
        function abort(){finish(cancelled());}
        function failed(){finish(new Error('本機 OCR 處理程序無法載入，請重新載入擴充功能後重試。'));}
        function receive(event){
          if(event.source!==frame.contentWindow||event.data?.channel!==channel)return;
          const message=event.data;
          if(message.type==='biometry-ocr-ready'&&!started){
            started=true;arm(taskTimeoutMs,'本機 OCR 逾時，請只選一頁或縮小影像後重試。');
            frame.contentWindow.postMessage({type:'biometry-ocr-run',id,channel,image,model:model==='small'?'small':'tiny',assetBase:assetUrl('vendor-ocr/')},'*');
          }
          if(message.id!==id)return;
          if(message.type==='biometry-ocr-progress'){try{onProgress(message.message);}catch{/* UI callbacks cannot strand inference resources. */}}
          if(message.type==='biometry-ocr-result')finish(message.error?new Error(message.error):null,message.items);
        }
        win.addEventListener('message',receive);signal?.addEventListener('abort',abort,{once:true});frame.addEventListener('error',failed,{once:true});
        arm(readyTimeoutMs,'本機 OCR 隔離環境載入逾時，請重新載入擴充功能後重試。');
        frame.src=url.href;
        frame.addEventListener('load',()=>{if(!settled)frame.contentWindow?.postMessage({type:'biometry-ocr-ping',channel},'*');},{once:true});
        doc.body.append(frame);
      });
    };
    const next=queue.then(work,work);queue=next.catch(()=>{});return next;
  }
  return {recognize};
}

let client;
export function recognizeLocal(image,model='small',onProgress=()=>{},options={}) {
  client??=createLocalOcrClient({document,window,origin:documentOrigin(location.href),assetUrl:path=>globalThis.chrome?.runtime?.getURL?chrome.runtime.getURL(path):new URL(`/${path}`,location.href).href});
  return client.recognize(image,model,onProgress,options);
}

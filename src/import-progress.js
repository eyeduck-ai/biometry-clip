// Wall-clock activity indicator. No inferred percentage or completion estimate.
export function formatElapsed(milliseconds=0){
  const seconds=Math.max(0,Math.floor(Number(milliseconds)/1000)||0);
  return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
}
export function createImportProgress({now=()=>Date.now(),timers=globalThis,onTick=()=>{}}={}){
  let startedAt=0,elapsedMs=0,message='',running=false,paused=false,timer;
  const snapshot=()=>({running,paused,message,elapsedMs:running&&!paused?elapsedMs+Math.max(0,now()-startedAt):elapsedMs});
  const notify=()=>onTick(snapshot());
  return {
    start(initial='正在讀取報告…'){
      if(timer!==undefined)timers.clearInterval(timer);
      startedAt=now();elapsedMs=0;message=initial;running=true;paused=false;
      timer=timers.setInterval(notify,1000);notify();return snapshot();
    },
    update(value){message=typeof value==='string'?value:value?.message||'辨識中…';if(running)notify();return snapshot();},
    pause(){if(running&&!paused){elapsedMs+=Math.max(0,now()-startedAt);paused=true;if(timer!==undefined)timers.clearInterval(timer);timer=undefined;notify();}return snapshot();},
    resume(){if(running&&paused){startedAt=now();paused=false;timer=timers.setInterval(notify,1000);notify();}return snapshot();},
    finish(){if(running&&!paused)elapsedMs+=Math.max(0,now()-startedAt);running=false;paused=false;if(timer!==undefined)timers.clearInterval(timer);timer=undefined;notify();return snapshot();},
    get state(){return snapshot();},
  };
}
export function importProgressMarkup({running=false,message='',elapsedMs=0}={}){
  return `<section class="import-activity" ${running?'aria-busy="true"':'hidden'} aria-label="辨識進度"><div class="import-activity-heading"><p id="ocr-progress" role="status">${escape(message)}</p><span class="import-time"><span>經過</span> <time id="ocr-elapsed" data-i18n-skip>${formatElapsed(elapsedMs)}</time></span></div><progress id="ocr-progressbar" aria-label="辨識進行中"></progress><p class="import-activity-note">模型處理中，完成後會開啟核對畫面。</p></section>`;
}
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

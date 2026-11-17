import {normalizeUiLanguage} from './ui-language.js';

/** Startup feedback only. It never reads form values or changes saved data. */
export function createPanelBootstrap({ document:doc, window:win, loadApp, report=()=>Promise.resolve(), timeoutMs=12000, language:initialLanguage='en' }) {
  let phase='idle',timer,language=normalizeUiLanguage(initialLanguage),failureKind;
  const text=(en,zh)=>language==='zh-TW'?zh:en;
  function setLanguage(value){
    language=normalizeUiLanguage(value);
    doc.documentElement.lang=language;
    doc.title=text('Biometry-Clip · Biometry workspace','Biometry-Clip · 生物測量工作台');
    const heading=doc.querySelector('[data-startup-heading]');
    if(heading)heading.textContent=text('Loading panel','正在載入面板');
    const message=doc.querySelector('[data-startup-message]');
    if(message)message.textContent=phase==='failed'?(failureKind==='timeout'?text('The panel has not finished starting. Its background connection or code may still be loading.','面板尚未完成啟動。背景連線或程式載入可能仍未完成。'):text('The panel could not finish loading. Reload the extension, then retry the panel.','面板程式未能完成載入。請先重新載入擴充功能，再重試面板。')):text('Connecting to your local workspace…','正在連接本機工作副本…');
    const retry=doc.querySelector('[data-startup-retry]');
    if(retry)retry.textContent=text('Reload panel','重新載入面板');
  }
  const announce=next=>{try{Promise.resolve(report(next)).catch(()=>{});}catch{}};
  const stopTimer=()=>{if(timer!=null){win.clearTimeout(timer);timer=undefined;}};
  function failed(kind='load') {
    if(phase==='ready'||phase==='failed'||phase==='disposed')return;
    phase='failed';failureKind=kind;stopTimer();announce('error');setLanguage(language);
    const retry=doc.querySelector('[data-startup-retry]');
    if(retry)retry.hidden=false;
  }
  function ready(){if(phase==='disposed')return;phase='ready';stopTimer();}
  const onError=()=>failed('load');
  const onPageHide=()=>dispose();
  function start(){
    if(phase!=='idle')return;
    phase='starting';announce('starting');
    win.addEventListener('biometry:panel-ready',ready);
    win.addEventListener('biometry:panel-failed',onError);
    win.addEventListener('error',onError);
    win.addEventListener('unhandledrejection',onError);
    win.addEventListener('pagehide',onPageHide);
    const retry=doc.querySelector('[data-startup-retry]');
    if(retry)retry.onclick=()=>win.location.reload();
    timer=win.setTimeout(()=>failed('timeout'),timeoutMs);
    Promise.resolve().then(loadApp).catch(onError);
  }
  function dispose(){
    stopTimer();phase='disposed';
    win.removeEventListener('biometry:panel-ready',ready);
    win.removeEventListener('biometry:panel-failed',onError);
    win.removeEventListener('error',onError);
    win.removeEventListener('unhandledrejection',onError);
    win.removeEventListener('pagehide',onPageHide);
  }
  setLanguage(language);
  return {start,dispose,setLanguage,get phase(){return phase;}};
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountQaApp } from '../src/qa/ui.js';
import { SITES } from '../src/sites.js';
import {setLanguage,translate} from '../src/i18n.js';

function fixture(t,{native=true}={}) {
  setLanguage('en');
  const dom=new JSDOM('<div id="app"></div>',{url:native?'chrome-extension://qa-test/index.html?view=qa':'http://localhost/index.html?view=qa'});
  t.after(()=>dom.window.close());
  const calls=[],state={runId:null,status:'idle',currentIndex:0,storageChecks:[],sites:SITES.map(site=>({siteId:site.id,status:'pending',actions:[],notes:[]}))};
  let notify,ready=0;
  dom.window.addEventListener('biometry:panel-ready',()=>ready++);
  const runner={get state(){return structuredClone(state);},async start(){calls.push('start');state.runId='synthetic-test';notify();},async runNext(){calls.push('next');state.status='waiting';state.sites[0].status='waiting';notify();},async retryCurrent(options){calls.push({retry:options});},async skipCurrent(){calls.push('skip');},exportReport(){calls.push('export');return {synthetic:true};}};
  const languageSaves=[],languageListeners=new Set();
  const languageStorage={loadLanguage:async()=>'en',saveLanguage:async language=>{languageSaves.push(language);for(const listener of languageListeners)listener(language);},subscribeLanguage:listener=>{languageListeners.add(listener);return()=>languageListeners.delete(listener);}};
  const mounted=mountQaApp({document:dom.window.document,window:dom.window,api:{isExtension:native,extensionVersion:'0.3.3'},createRunner:(_api,options)=>{notify=options.onUpdate;return runner;},languageStorage});
  t.after(()=>mounted.destroy());
  const button=name=>dom.window.document.querySelector(`[data-qa="${name}"]`);
  const consent=()=>{const box=dom.window.document.querySelector('#qa-consent');box.checked=true;box.dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
  return {dom,calls,state,button,consent,languageSaves,languageListeners,update:()=>notify(),get ready(){return ready;}};
}

test('native QA mounts without operations and starts only after explicit consent and click',async t=>{
  const f=fixture(t);
  assert.equal(f.ready,1);assert.deepEqual(f.calls,[]);assert.equal(f.button('start').disabled,true);
  assert.equal(f.dom.window.document.querySelectorAll('tbody tr').length,SITES.length);
  f.consent();assert.deepEqual(f.calls,[]);assert.equal(f.button('start').disabled,false);
  f.button('start').click();await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(f.calls,['start']);assert.equal(f.button('next').disabled,false);
  f.button('next').click();await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(f.calls,['start','next']);assert.equal(f.button('next').disabled,true);assert.equal(f.button('retry').disabled,false);
  assert.match(f.dom.window.document.querySelector('tbody').textContent,/Manual preparation needed/);
  assert.doesNotMatch(f.dom.window.document.querySelector('tbody').textContent,/Passed/);
});

test('HTTP preview cannot start or invoke the QA runner even with synthetic click events',async t=>{
  const f=fixture(t,{native:false});f.consent();f.button('start').click();
  f.button('start').disabled=false;f.button('start').click();await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(f.calls,[]);assert.match(f.dom.window.document.querySelector('[role="alert"]').textContent,/Preview only/);
});

test('unobservable eye needs explicit acknowledgment for each requested eye',async t=>{
  const f=fixture(t);f.state.runId='synthetic';f.state.status='waiting';f.state.sites[0].awaitingEye='OD';f.update();
  assert.equal(f.button('retry').disabled,true);
  const acknowledge=()=>{const box=f.dom.window.document.querySelector('#qa-eye-confirm');box.checked=true;box.dispatchEvent(new f.dom.window.Event('change',{bubbles:true}));};
  acknowledge();assert.equal(f.button('retry').disabled,false);f.button('retry').click();await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(f.calls,[{retry:{confirmedEye:'OD'}}]);assert.equal(f.button('retry').disabled,true);
  f.state.sites[0].awaitingEye='OS';f.update();assert.equal(f.button('retry').disabled,true);
  acknowledge();f.button('retry').click();await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(f.calls[1],{retry:{confirmedEye:'OS'}});
});

test('QA UI renders unknown and partial coverage without converting it into success or HTML',t=>{
  setLanguage('en');
  const dom=new JSDOM('<div id="app"></div>',{url:'chrome-extension://qa-test/index.html?view=qa'});t.after(()=>dom.window.close());
  const runner={state:{runId:'demo',currentIndex:0,status:'waiting',storageChecks:[],sites:[{siteId:SITES[0].id,status:'waiting',toric:{status:'partial'},lvc:{status:'unverified'},notes:['<script>unsafe()</script>'],actions:[]}]}};
  const mounted=mountQaApp({document:dom.window.document,window:dom.window,api:{isExtension:true},createRunner:()=>runner,languageStorage:{}});t.after(()=>mounted.destroy());
  assert.equal(dom.window.document.querySelector('script'),null);assert.match(dom.window.document.querySelector('tbody').textContent,/Partial fields/);assert.doesNotMatch(dom.window.document.querySelector('tbody').textContent,/Passed/);
});

test('QA language switch persists the preference without running QA or changing raw evidence',async t=>{
  const f=fixture(t),doc=f.dom.window.document;
  assert.equal(doc.documentElement.lang,'en');assert.equal(doc.querySelector('h1').textContent,translate('原生合成驗收','en'));
  f.state.sites[0].actions=[{step:'synthetic-evidence',notes:['保存測量'],actual:'水晶體'}];f.update();
  const before=structuredClone(f.state),raw=doc.querySelector('pre').textContent;
  assert.ok(raw.includes('保存測量'));
  doc.querySelector('[data-action="toggle-language"]').click();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(doc.documentElement.lang,'zh-TW');assert.equal(doc.querySelector('h1').textContent,'原生合成驗收');
  assert.deepEqual(f.calls,[]);assert.deepEqual(f.state,before);assert.equal(doc.querySelector('pre').textContent,raw);assert.deepEqual(f.languageSaves,['zh-TW']);
  for(const listener of f.languageListeners)listener('en');
  assert.equal(doc.querySelector('h1').textContent,translate('原生合成驗收','en'));assert.equal(doc.querySelector('pre').textContent,raw);
});

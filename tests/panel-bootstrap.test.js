import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createPanelBootstrap } from '../src/panel-bootstrap.js';

function fixture(t,loadApp){
  const dom=new JSDOM('<div id="app"><h1 data-startup-heading>Loading panel</h1><p data-startup-message>Loading</p><button data-startup-retry hidden>Retry</button></div>',{url:'https://example.test/index.html'});
  const statuses=[];
  const boot=createPanelBootstrap({document:dom.window.document,window:dom.window,loadApp,report:phase=>statuses.push(phase),timeoutMs:15});
  t.after(()=>{boot.dispose();dom.window.close();});
  return {dom,boot,statuses};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,25));

test('a module import completing does not hide a stalled asynchronous app initialization',async t=>{
  const f=fixture(t,async()=>{});f.boot.start();await tick();
  assert.equal(f.boot.phase,'failed');assert.deepEqual(f.statuses,['starting','error']);
  assert.equal(f.dom.window.document.querySelector('[data-startup-retry]').hidden,false);
  assert.match(f.dom.window.document.querySelector('[data-startup-message]').textContent,/not finished starting/);
});

test('actual app readiness cancels the timeout and preserves the rendered form',async t=>{
  const f=fixture(t,async()=>{});f.boot.start();
  f.dom.window.document.querySelector('#app').innerHTML='<input value="SYNTHETIC-DRAFT"/>';
  f.dom.window.dispatchEvent(new f.dom.window.Event('biometry:panel-ready'));
  await tick();assert.equal(f.boot.phase,'ready');assert.deepEqual(f.statuses,['starting']);
  assert.equal(f.dom.window.document.querySelector('input').value,'SYNTHETIC-DRAFT');
  f.dom.window.dispatchEvent(new f.dom.window.Event('unhandledrejection'));
  assert.equal(f.boot.phase,'ready');
});

test('module failure exposes retry without putting exception contents into the page or report',async t=>{
  const f=fixture(t,async()=>{throw new Error('PRIVATE-SENTINEL');});f.boot.start();await tick();
  assert.equal(f.boot.phase,'failed');assert.deepEqual(f.statuses,['starting','error']);
  assert.ok(!f.dom.window.document.body.textContent.includes('PRIVATE-SENTINEL'));
});

test('closing startup cancels its timer and never attempts automatic reload',async t=>{
  let loads=0;const f=fixture(t,async()=>{loads++;});f.boot.start();f.boot.start();
  f.dom.window.dispatchEvent(new f.dom.window.Event('pagehide'));await tick();
  assert.equal(f.boot.phase,'disposed');assert.equal(loads,1);assert.deepEqual(f.statuses,['starting']);
});

test('startup defaults to English and can restore Chinese while preserving a failed state',async t=>{
  const f=fixture(t,async()=>{throw new Error('PRIVATE');});
  assert.equal(f.dom.window.document.documentElement.lang,'en');assert.equal(f.dom.window.document.querySelector('h1').textContent,'Loading panel');
  f.boot.start();await tick();f.boot.setLanguage('zh-TW');
  assert.equal(f.boot.phase,'failed');assert.equal(f.dom.window.document.documentElement.lang,'zh-TW');
  assert.match(f.dom.window.document.querySelector('[data-startup-message]').textContent,/面板程式未能完成載入/);
  assert.equal(f.dom.window.document.querySelector('[data-startup-retry]').hidden,false);
  assert.deepEqual(f.statuses,['starting','error']);
});

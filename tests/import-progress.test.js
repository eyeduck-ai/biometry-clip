import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createImportProgress,formatElapsed,importProgressMarkup} from '../src/import-progress.js';

test('elapsed timer tracks wall time without fabricated percent and releases interval on finish/restart',()=>{
 let now=10000,callback,cleared=[],ticks=[];const timers={setInterval:fn=>{callback=fn;return 42;},clearInterval:id=>cleared.push(id)};
 const progress=createImportProgress({now:()=>now,timers,onTick:value=>ticks.push(value)});progress.start('讀取');now+=65300;callback();
 assert.equal(formatElapsed(ticks.at(-1).elapsedMs),'1:05');progress.update('推論');assert.equal(ticks.at(-1).message,'推論');
 const end=progress.finish();assert.equal(end.elapsedMs,65300);assert.equal(end.running,false);assert.deepEqual(cleared,[42]);now+=2000;assert.equal(progress.state.elapsedMs,65300);
 progress.start();assert.equal(progress.state.elapsedMs,0);progress.finish();assert.equal(formatElapsed(-100),'0:00');
});
test('active progress exposes indeterminate native bar and escaped message; idle state is hidden',()=>{
 const doc=new JSDOM(importProgressMarkup({running:true,message:'<script>unsafe</script>',elapsedMs:72000})).window.document;
 assert.equal(doc.querySelector('progress').hasAttribute('value'),false);assert.equal(doc.querySelector('script'),null);assert.equal(doc.querySelector('#ocr-elapsed').textContent,'1:12');assert.equal(doc.querySelector('[aria-busy]').getAttribute('aria-busy'),'true');
 assert.ok(new JSDOM(importProgressMarkup()).window.document.querySelector('[hidden]'));
});

test('waiting for human approval pauses elapsed processing time and resumes without resetting completed work',()=>{
 let now=0;const task=createImportProgress({now:()=>now,timers:{setInterval:()=>1,clearInterval(){}}});task.start();now=3000;task.pause();now=63000;assert.equal(task.state.elapsedMs,3000);assert.equal(task.state.paused,true);task.resume();now=65000;assert.equal(task.finish().elapsedMs,5000);
});

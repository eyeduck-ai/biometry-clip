import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { PANEL_SIZE,clampPanelGeometry,initialPanelGeometry,createFloatingShell,installFloatingShell } from '../src/floating.js';

function fixture(t,width=1280,height=800,options={}) {
  const dom=new JSDOM('<!doctype html><html><body><main id="calculator"><input value="43.25"></main></body></html>',{url:'https://calc.apacrs.org/barrett_universal2105/'});
  Object.defineProperty(dom.window,'innerWidth',{configurable:true,writable:true,value:width});
  Object.defineProperty(dom.window,'innerHeight',{configurable:true,writable:true,value:height});
  const listeners=[];
  const runtime={id:'biometry-test',getURL:path=>`chrome-extension://biometry-test/${path}`,onMessage:{addListener:listener=>listeners.push(listener)}};
  const shell=createFloatingShell({document:dom.window.document,window:dom.window,runtime,...options});
  t.after(()=>{shell.destroy();dom.window.close();});
  return {dom,shell,runtime,listeners};
}

test('initial floating panel uses compact dimensions and remains inside the viewport',()=>{
  const rect=initialPanelGeometry({width:1280,height:800});
  assert.deepEqual(rect,{x:908,y:248,width:360,height:540});
  assert.equal(PANEL_SIZE.pillHeight,38);
});

test('geometry stays reachable when moved, resized, or opened in a small viewport',()=>{
  const cases=[
    clampPanelGeometry({x:-999,y:9999,width:9999,height:9999},{width:360,height:300}),
    clampPanelGeometry({x:NaN,y:Infinity,width:NaN,height:NaN},{width:280,height:190}),
    clampPanelGeometry({x:-10,y:-10,width:360,height:540},{width:10,height:10}),
    clampPanelGeometry({x:Infinity,y:-Infinity},{width:320,height:240},true),
  ];
  for(const [index,rect] of cases.entries()) {
    const viewport=[{width:360,height:300},{width:280,height:190},{width:10,height:10},{width:320,height:240}][index];
    assert.ok(Object.values(rect).every(Number.isFinite));
    assert.ok(rect.x>=0 && rect.y>=0);
    assert.ok(rect.width>0 && rect.height>0);
    assert.ok(rect.x+rect.width<=viewport.width);
    assert.ok(rect.y+rect.height<=viewport.height);
  }
});

test('toolbar opens, collapses and expands one iframe without disturbing the website',t=>{
  const {dom,shell}=fixture(t);
  const before=dom.window.document.body.innerHTML;
  assert.equal(shell.toggle(42).expanded,true);
  const {host,frame}=shell.elements;
  assert.equal(host.style.position,'fixed');
  assert.equal(host.style.zIndex,'2147483647');
  assert.equal(host.shadowRoot,null);
  assert.equal(dom.window.document.body.innerHTML,before);
  assert.equal(new URL(frame.src).searchParams.get('view'),'floating');
  assert.equal(new URL(frame.src).searchParams.get('tabId'),'42');
  assert.equal(new URL(frame.src).hostname,'biometry-test');
  assert.deepEqual([...new URL(frame.src).searchParams.keys()],['view','tabId','panelToken']);
  assert.ok(new URL(frame.src).searchParams.get('panelToken').length>=16);
  assert.equal(host.textContent,'');
  const frameIdentity=frame;
  assert.equal(shell.toggle(42).expanded,false);
  assert.equal(shell.getState().geometry.height,38);
  assert.equal(shell.toggle(42).expanded,true);
  assert.equal(shell.elements.frame,frameIdentity);
  assert.equal(shell.getState().geometry.height,540);
});

test('close removes only the overlay and opens again with its source tab identifier',t=>{
  const {dom,shell}=fixture(t);
  shell.expand(42);
  shell.close();
  assert.equal(shell.elements.host.isConnected,false);
  assert.equal(dom.window.document.querySelector('#calculator input').value,'43.25');
  assert.equal(shell.expand(42).expanded,true);
  assert.equal(dom.window.document.querySelectorAll('[data-biometry-floating]').length,1);
  assert.equal(new URL(shell.elements.frame.src).searchParams.get('tabId'),'42');
});

test('temporarily hiding for screenshot preserves collapsed state and iframe contents',t=>{
  const {shell}=fixture(t);
  shell.expand(42);shell.minimize();
  const frame=shell.elements.frame;
  assert.equal(shell.hide().visible,false);
  assert.equal(shell.elements.host.style.display,'none');
  const restored=shell.restore();
  assert.equal(restored.visible,true);
  assert.equal(restored.expanded,false);
  assert.equal(shell.elements.frame,frame);
  assert.equal(shell.elements.host.style.display,'block');
});

test('keyboard moves and resizes the panel while the dedicated header controls remain usable',t=>{
  const {dom,shell}=fixture(t);shell.expand(42);
  const before=shell.getState().geometry;
  const event=new dom.window.KeyboardEvent('keydown',{key:'ArrowLeft',shiftKey:true,cancelable:true,bubbles:true});
  shell.elements.dragHandle.dispatchEvent(event);
  assert.equal(event.defaultPrevented,true);
  assert.equal(shell.getState().geometry.x,before.x-40);
  shell.elements.resizeHandle.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
  assert.equal(shell.getState().geometry.width,before.width+10);
  shell.elements.dockButton.click();
  assert.equal(shell.getState().geometry.x,PANEL_SIZE.margin);
  shell.elements.dockButton.click();
  assert.equal(shell.getState().geometry.x,dom.window.innerWidth-shell.getState().geometry.width-PANEL_SIZE.margin);
});

test('pointer dragging preserves the grabbed offset and cannot strand the titlebar',t=>{
  const {dom,shell}=fixture(t);shell.expand(42);
  function pointer(type,x,y,id=4,button=0) {
    const event=new dom.window.Event(type,{bubbles:true,cancelable:true});
    Object.assign(event,{clientX:x,clientY:y,pointerId:id,button});
    shell.elements.dragHandle.dispatchEvent(event);
  }
  const start=shell.getState().geometry;
  pointer('pointerdown',start.x+33,start.y+16);
  pointer('pointermove',start.x-17,start.y-4);
  assert.equal(shell.getState().geometry.x,start.x-50);
  assert.equal(shell.getState().geometry.y,start.y-20);
  pointer('pointermove',-10000,-10000);
  assert.equal(shell.getState().geometry.x,12);
  assert.equal(shell.getState().geometry.y,12);
  pointer('pointerup',0,0);
  pointer('pointermove',500,500);
  assert.equal(shell.getState().geometry.x,12);
});

test('viewport changes clamp both expanded and collapsed windows without duplicating the shell',t=>{
  const {dom,shell}=fixture(t);shell.expand(42);
  dom.window.innerWidth=320;dom.window.innerHeight=240;
  dom.window.dispatchEvent(new dom.window.Event('resize'));
  const rect=shell.getState().geometry;
  assert.equal(rect.width,296);assert.equal(rect.height,216);
  assert.equal(rect.x,12);assert.equal(rect.y,12);
  shell.minimize();dom.window.innerWidth=180;dom.window.innerHeight=140;
  dom.window.dispatchEvent(new dom.window.Event('resize'));
  const pill=shell.getState().geometry;
  assert.ok(pill.x+pill.width<=180);assert.ok(pill.y+pill.height<=140);
  assert.equal(dom.window.document.querySelectorAll('[data-biometry-floating]').length,1);
});

test('toolbar remounts a host removed by the calculator application',t=>{
  const {dom,shell}=fixture(t);shell.expand(42);
  shell.elements.host.remove();
  assert.equal(shell.toggle(42).expanded,true);
  assert.equal(dom.window.document.querySelectorAll('[data-biometry-floating]').length,1);
});

test('reinjection installs exactly one runtime listener and rejects another extension sender',t=>{
  const {dom,runtime,listeners}=fixture(t);
  const scope={};
  const args={scope,document:dom.window.document,window:dom.window,runtime};
  const first=installFloatingShell(args),second=installFloatingShell(args);
  t.after(()=>first.destroy());
  assert.equal(first,second);assert.equal(listeners.length,1);
  let reply;
  listeners[0]({type:'biometry:toggle-floating',tabId:42},{id:'other-extension'},value=>{reply=value;});
  assert.equal(reply,undefined);assert.equal(first.getState().open,false);
  listeners[0]({type:'biometry:toggle-floating',tabId:42},{id:runtime.id},value=>{reply=value;});
  assert.equal(reply.expanded,true);
  listeners[0]({type:'biometry:hide-floating'},{id:runtime.id},()=>{});
  assert.equal(first.getState().visible,false);
  listeners[0]({type:'biometry:restore-floating'},{id:runtime.id},()=>{});
  assert.equal(first.getState().visible,true);
  listeners[0]({type:'biometry:show-floating',tabId:42},{id:runtime.id},()=>{});
  assert.equal(first.getState().expanded,true);
});

function fakeTimers() {
  let time=0,next=0;
  const pending=new Map();
  return {
    setTimeout(fn,delay){const id=++next;pending.set(id,{fn,at:time+delay});return id;},
    clearTimeout(id){pending.delete(id);},
    advance(ms){time+=ms;for(const [id,task] of [...pending].sort((a,b)=>a[1].at-b[1].at))if(task.at<=time&&pending.has(id)){pending.delete(id);task.fn();}},
    get count(){return pending.size;},
  };
}
function diagnosticFixture(t) {
  const timers=fakeTimers();let counter=0;
  const value=fixture(t,1280,800,{timers,createToken:()=>`shell-attempt-token-${++counter}`});
  const status=phase=>({type:'biometry:panel-status',phase,panelToken:value.shell.getState().panelStatus.panelToken,tabId:42});
  return {...value,timers,status};
}

test('bounded loading deadline shows a manual retry without reloading the iframe automatically',t=>{
  const {shell,timers}=diagnosticFixture(t);shell.expand(42);
  const src=shell.elements.frame.src;
  assert.equal(shell.getState().panelStatus.phase,'starting');
  assert.equal(shell.elements.statusNotice.hidden,false);
  assert.equal(shell.elements.retryButton.hidden,true);
  assert.equal(shell.elements.frame.getAttribute('aria-busy'),'true');
  timers.advance(11999);
  assert.equal(shell.getState().panelStatus.phase,'starting');
  timers.advance(1);
  assert.equal(shell.getState().panelStatus.phase,'timeout');
  assert.match(shell.elements.statusText.textContent,/Panel is not ready/);
  assert.equal(shell.elements.retryButton.hidden,false);
  assert.equal(shell.elements.frame.src,src);
  assert.equal(timers.count,0);
  timers.advance(120000);
  assert.equal(shell.elements.frame.src,src);
  assert.equal(timers.count,0);
});

test('manual retry rotates the correlation token while preserving geometry, controls and website values',t=>{
  const {dom,shell,timers,status}=diagnosticFixture(t);shell.expand(42);
  shell.move(40,50);shell.resize(410,570);
  const original=shell.getState(),frame=shell.elements.frame;
  const stale=status('ready');
  timers.advance(12000);
  shell.elements.retryButton.click();
  const retried=shell.getState();
  assert.notEqual(retried.panelStatus.panelToken,original.panelStatus.panelToken);
  assert.equal(new URL(frame.src).searchParams.get('panelToken'),retried.panelStatus.panelToken);
  assert.equal(retried.panelStatus.phase,'starting');
  assert.deepEqual(retried.geometry,original.geometry);
  assert.equal(shell.elements.frame,frame);
  assert.equal(dom.window.document.querySelector('#calculator input').value,'43.25');
  assert.equal(shell.handleMessage(stale).ignored,true);
  assert.equal(shell.getState().panelStatus.phase,'starting');
  assert.equal(timers.count,1);
});

test('ready received before the initial load event stays ready and cancels the diagnostic timer',t=>{
  const {dom,shell,timers,status}=diagnosticFixture(t);shell.expand(42);
  assert.equal(shell.handleMessage(status('ready')).panelStatus.phase,'ready');
  shell.elements.frame.dispatchEvent(new dom.window.Event('load'));
  assert.equal(shell.getState().panelStatus.phase,'ready');
  assert.equal(shell.elements.statusNotice.hidden,true);
  assert.equal(shell.elements.frame.getAttribute('aria-busy'),'false');
  assert.equal(timers.count,0);
  timers.advance(20000);
  assert.equal(shell.getState().panelStatus.phase,'ready');
});

test('a late starting relay cannot reset a matching already-ready panel',t=>{
  const {shell,timers,status}=diagnosticFixture(t);shell.expand(42);
  shell.handleMessage(status('ready'));
  shell.handleMessage(status('starting'));
  assert.equal(shell.getState().panelStatus.phase,'ready');
  assert.equal(shell.elements.statusNotice.hidden,true);
  assert.equal(timers.count,0);
  timers.advance(12000);
  assert.equal(shell.getState().panelStatus.phase,'ready');
});

test('later iframe loads clear an earlier ready state and remain diagnosable',t=>{
  const {dom,shell,timers,status}=diagnosticFixture(t);shell.expand(42);
  shell.elements.frame.dispatchEvent(new dom.window.Event('load'));
  shell.handleMessage(status('ready'));
  shell.elements.frame.dispatchEvent(new dom.window.Event('load'));
  assert.equal(shell.getState().panelStatus.phase,'starting');
  assert.equal(shell.elements.statusNotice.hidden,false);
  timers.advance(12000);
  assert.equal(shell.getState().panelStatus.phase,'timeout');
});

test('wrong tab, stale token and unsupported phase cannot alter current readiness',t=>{
  const {shell,timers,status}=diagnosticFixture(t);shell.expand(42);
  for(const message of [
    {...status('ready'),tabId:43},
    {...status('ready'),panelToken:'older-panel-token-0000'},
    {...status('ready'),phase:'some-private-value'},
  ])assert.equal(shell.handleMessage(message).ignored,true);
  assert.equal(shell.getState().panelStatus.phase,'starting');
  timers.advance(5000);
  shell.handleMessage(status('starting'));
  timers.advance(7000);
  assert.equal(shell.getState().panelStatus.phase,'timeout');
});

test('error notices discard payload details and offer a bounded manual recovery',t=>{
  const {shell,timers,status}=diagnosticFixture(t);shell.expand(42);
  shell.handleMessage({...status('error'),error:'DO NOT DISPLAY: SYNTHETIC PRIVATE VALUE'});
  assert.equal(shell.getState().panelStatus.phase,'error');
  assert.equal(timers.count,0);
  assert.equal(shell.elements.retryButton.hidden,false);
  assert.ok(!shell.elements.statusText.textContent.includes('PRIVATE'));
  shell.retry();
  assert.equal(shell.getState().panelStatus.phase,'starting');
  assert.equal(timers.count,1);
});

test('close and destroy cancel readiness deadlines; reopening uses a fresh token',t=>{
  const {shell,timers,status}=diagnosticFixture(t);shell.expand(42);
  const oldToken=shell.getState().panelStatus.panelToken,oldReady=status('ready');
  shell.close();assert.equal(timers.count,0);
  assert.equal(shell.getState().panelStatus.phase,'idle');
  assert.equal(shell.handleMessage(oldReady).ignored,true);
  shell.expand(42);
  assert.notEqual(shell.getState().panelStatus.panelToken,oldToken);
  assert.equal(timers.count,1);
  shell.destroy();assert.equal(timers.count,0);
  timers.advance(50000);assert.equal(shell.getState().open,false);
});

test('minimize and screenshot hide preserve a matching ready state without refreshing the frame',t=>{
  const {shell,timers,status}=diagnosticFixture(t);shell.expand(42);
  shell.handleMessage(status('ready'));
  const src=shell.elements.frame.src;
  shell.minimize();shell.hide();shell.restore();shell.expand();
  assert.equal(shell.getState().panelStatus.phase,'ready');
  assert.equal(shell.elements.frame.src,src);
  assert.equal(timers.count,0);
});

test('explicit retry removes an empty srcdoc override before setting the trusted src',t=>{
  const {shell,runtime,timers}=diagnosticFixture(t);shell.expand(42);
  shell.move(45,55);shell.resize(410,570);
  const {frame}=shell.elements;
  const before=shell.getState(),originalFrame=frame;
  frame.setAttribute('srcdoc','');
  assert.equal(frame.hasAttribute('srcdoc'),true);
  const assignments=[];
  const sourceDescriptor=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(frame),'src');
  Object.defineProperty(frame,'src',{configurable:true,get(){return sourceDescriptor.get.call(this);},set(value){assignments.push({hasSrcdoc:this.hasAttribute('srcdoc'),value});sourceDescriptor.set.call(this,value);}});
  runtime.sendMessage=()=>assert.fail('iframe recovery must not change stored measurements');
  shell.retry();
  assert.equal(frame.hasAttribute('srcdoc'),false);
  assert.equal(assignments.length,1);
  assert.equal(assignments[0].hasSrcdoc,false);
  assert.equal(new URL(assignments[0].value).protocol,'chrome-extension:');
  assert.equal(new URL(assignments[0].value).hostname,'biometry-test');
  assert.equal(new URL(assignments[0].value).pathname,'/index.html');
  assert.notEqual(shell.getState().panelStatus.panelToken,before.panelStatus.panelToken);
  assert.deepEqual(shell.getState().geometry,before.geometry);
  assert.equal(shell.elements.frame,originalFrame);
  assert.equal(timers.count,1);
});

test('explicit expand discards nonempty srcdoc replacement and preserves website values',t=>{
  const {dom,shell,timers,status}=diagnosticFixture(t);shell.expand(42);
  shell.handleMessage(status('ready'));
  const frame=shell.elements.frame,before=shell.getState();
  frame.setAttribute('srcdoc','<p>Unexpected synthetic replacement</p>');
  shell.expand(42);
  const after=shell.getState();
  assert.equal(frame.hasAttribute('srcdoc'),false);
  assert.notEqual(after.panelStatus.panelToken,before.panelStatus.panelToken);
  assert.equal(after.panelStatus.phase,'starting');
  assert.deepEqual(after.geometry,before.geometry);
  assert.equal(dom.window.document.querySelector('#calculator input').value,'43.25');
  assert.equal(timers.count,1);
});

test('unexpected srcdoc recovery requires an explicit toolbar action and does not run an observer loop',t=>{
  const {shell,timers,status}=diagnosticFixture(t);shell.expand(42);
  shell.handleMessage(status('ready'));
  const frame=shell.elements.frame,before=shell.getState();
  frame.setAttribute('srcdoc','');
  timers.advance(120000);
  assert.equal(frame.hasAttribute('srcdoc'),true);
  assert.equal(shell.getState().panelStatus.panelToken,before.panelStatus.panelToken);
  assert.equal(timers.count,0);
  shell.toggle(42);
  assert.equal(frame.hasAttribute('srcdoc'),false);
  assert.equal(shell.getState().expanded,true);
  assert.notEqual(shell.getState().panelStatus.panelToken,before.panelStatus.panelToken);
  assert.equal(timers.count,1);
});

test('shell defaults to English and switches labels without navigating or replacing its live panel',async t=>{
  const {dom,shell,runtime}=fixture(t);shell.expand(42);shell.move(40,50);shell.resize(410,570);
  const frame=shell.elements.frame,source=frame.src,before=shell.getState();
  assert.equal(shell.elements.minimizeButton.title,'Collapse panel');
  assert.equal(shell.elements.languageButton.textContent,'中文');
  const requests=[];
  runtime.sendMessage=async message=>{requests.push(message);return {ok:true,language:message.language};};
  shell.elements.languageButton.click();await Promise.resolve();await Promise.resolve();
  assert.deepEqual(requests,[{type:'biometry:ui-language:set',language:'zh-TW'}]);
  assert.equal(shell.elements.languageButton.textContent,'EN');assert.equal(shell.elements.minimizeButton.title,'收合視窗');
  assert.equal(shell.elements.frame,frame);assert.equal(frame.src,source);assert.deepEqual(shell.getState(),before);
  assert.equal(dom.window.document.querySelector('#calculator input').value,'43.25');
  shell.elements.dragHandle.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));
  assert.equal(shell.getState().geometry.x,before.geometry.x-10);
  shell.elements.minimizeButton.click();assert.equal(shell.getState().expanded,false);
  shell.elements.minimizeButton.click();assert.equal(shell.getState().expanded,true);assert.equal(frame.src,source);
});

test('locale broadcasts update only shell labels and invalid values are ignored',t=>{
  const {shell}=fixture(t);shell.expand(42);const source=shell.elements.frame.src,before=shell.getState();
  assert.deepEqual(shell.handleMessage({type:'biometry:ui-language:changed',language:'zh-TW',patient:{patientId:'IGNORED'}}),{ok:true,language:'zh-TW'});
  assert.equal(shell.elements.languageButton.textContent,'EN');assert.equal(shell.elements.frame.src,source);assert.deepEqual(shell.getState(),before);
  assert.equal(shell.handleMessage({type:'biometry:ui-language:changed',language:'unknown'}),undefined);
  assert.equal(shell.elements.languageButton.textContent,'EN');
});

test('install restores saved language through the locale-only relay without opening an iframe',async t=>{
  const {dom,runtime}=fixture(t);const messages=[];
  runtime.sendMessage=async message=>{messages.push(message);return {ok:true,language:'zh-TW'};};
  const shell=installFloatingShell({scope:{},document:dom.window.document,window:dom.window,runtime});t.after(()=>shell.destroy());
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(messages,[{type:'biometry:ui-language:get'}]);assert.equal(shell.elements.languageButton.textContent,'EN');
  assert.equal(shell.getState().open,false);assert.equal(shell.elements.frame.getAttribute('src'),null);
});

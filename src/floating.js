import {BRAND_GLYPH} from './brand-icon.js';
import {normalizeUiLanguage,isUiLanguage} from './ui-language.js';
// Runs in an isolated content-script world. Patient data stays inside the
// extension-origin iframe and is never copied into the calculator's DOM.
const INSTANCE_KEY = '__biometryClipboardFloatingV2';
export const PANEL_SIZE = Object.freeze({ width: 360, height: 540, minWidth: 300, minHeight: 320, margin: 12, pillWidth: 178, pillHeight: 38 });

const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const bounded = (value, min, max) => Math.min(Math.max(value, min), max);

export function clampPanelGeometry(rect, viewport, collapsed = false) {
  const viewportWidth = Math.max(1, finite(viewport.width, 1));
  const viewportHeight = Math.max(1, finite(viewport.height, 1));
  const margin = Math.min(PANEL_SIZE.margin, Math.max(0, (Math.min(viewportWidth, viewportHeight) - 1) / 2));
  const maxWidth = Math.max(1, viewportWidth - margin * 2);
  const maxHeight = Math.max(1, viewportHeight - margin * 2);
  const width = collapsed ? Math.min(PANEL_SIZE.pillWidth, maxWidth) : bounded(finite(rect.width, PANEL_SIZE.width), Math.min(PANEL_SIZE.minWidth, maxWidth), maxWidth);
  const height = collapsed ? Math.min(PANEL_SIZE.pillHeight, maxHeight) : bounded(finite(rect.height, PANEL_SIZE.height), Math.min(PANEL_SIZE.minHeight, maxHeight), maxHeight);
  return {
    x: bounded(finite(rect.x, viewportWidth - width - margin), margin, Math.max(margin, viewportWidth - width - margin)),
    y: bounded(finite(rect.y, viewportHeight - height - margin), margin, Math.max(margin, viewportHeight - height - margin)),
    width, height,
  };
}

export function initialPanelGeometry(viewport) {
  return clampPanelGeometry({ width: PANEL_SIZE.width, height: PANEL_SIZE.height }, viewport);
}

const GLYPHS = {
  eye:BRAND_GLYPH,
  dock:'<path d="M3 6h14M3 14h14m-3-11 3 3-3 3M6 11l-3 3 3 3"/>',
  minimize:'<path d="M4 10h12"/>', expand:'<rect x="4" y="4" width="12" height="12" rx="2"/><path d="M4 8h12"/>',
  close:'<path d="m5 5 10 10M5 15 15 5"/>', resize:'<path d="M8 16 16 8m-3 8 3-3"/>',
};
const svg = name => `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[name]}</svg>`;

export function createFloatingShell({ document: doc, window: win, runtime, loadTimeoutMs = 12000, timers = win, createToken = () => globalThis.crypto.randomUUID(), language:initialLanguage='en' }) {
  let language=normalizeUiLanguage(initialLanguage);
  let tabId = null;
  let geometry = initialPanelGeometry({ width: win.innerWidth, height: win.innerHeight });
  let collapsed = false;
  let hidden = false;
  let open = false;
  let gesture = null;
  let panelStatus = { phase:'idle',panelToken:null,tabId:null };
  let readinessTimer = null;
  let initialLoadPending = false;
  let rememberedSize = { width: geometry.width, height: geometry.height };
  const host = doc.createElement('div');
  host.id = 'biometry-clipboard-floating';
  host.setAttribute('data-biometry-floating', '');
  for (const [property, value] of Object.entries({ all:'initial', position:'fixed', display:'block', zIndex:'2147483647', margin:'0', padding:'0', border:'0', opacity:'1', visibility:'visible', transform:'none', pointerEvents:'auto', isolation:'isolate', boxSizing:'border-box' })) {
    host.style.setProperty(property.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`), value, 'important');
  }
  const root = host.attachShadow({ mode:'closed' });
  root.innerHTML = `<style>
    :host{color-scheme:light;font:12px/1.4 "Segoe UI","Microsoft JhengHei",sans-serif;color:#454545}
    *,*:before,*:after{box-sizing:border-box}button{font:inherit;color:inherit;border:0;margin:0;background:none;cursor:pointer}
    .shell{display:flex;flex-direction:column;width:100%;height:100%;background:#fbfbfb;border:1px solid #c8c8c8;border-radius:11px;box-shadow:0 8px 36px #32323230;overflow:hidden;position:relative}
    .bar{color:#f5f5f2;display:flex;align-items:center;gap:2px;min-height:37px;flex:none;padding:3px 5px;background:#f1f1f1;border-bottom:1px solid #dfdfdf}
    .drag{display:flex;align-items:center;gap:7px;min-width:0;flex:1;padding:4px 5px;border-radius:5px;text-align:left;cursor:grab;touch-action:none;-webkit-user-select:none;user-select:none;min-height:28px}
    .drag strong{font:18px/1 Georgia,"Times New Roman",serif;letter-spacing:-.6px}.drag small{font-size:8px;color:#868686;letter-spacing:.4px}
    .drag>svg{color:#6c6c6c;flex:none}.control{display:grid;place-items:center;width:27px;height:27px;flex:none;border-radius:5px;color:#7c7c7c}
    button:hover{background:#e6e6e6}button:focus-visible{outline:2px solid #757575;outline-offset:-2px}.close:hover{background:#e7ded4;color:#935d4c}
    .panel-status{display:flex;align-items:center;gap:9px;flex:none;padding:9px 10px;background:#f3f3f3;border-bottom:1px solid #e2e2e2;color:#828282;font-size:10px;line-height:1.6}.panel-status[hidden]{display:none}.panel-status p{margin:0;min-width:0;flex:1}.panel-status[data-phase="error"],.panel-status[data-phase="timeout"]{background:#faf4e7;color:#8a744b}.retry{font-size:10px;line-height:1.4;padding:7px 8px;white-space:nowrap;border:1px solid #d0c4a8;border-radius:5px;background:#fffdf8;color:#7b6847;flex:none}.retry[hidden]{display:none}
    .bar{background:#303337;border-bottom-color:#41464a}.drag small{color:#c1c4c7}.drag>svg,.bar .control{color:#e7e8e5}.bar button:hover{background:#4c5156}.bar .close:hover{background:#65504b;color:#fff}
    iframe{border:0;margin:0;width:100%;flex:1;min-height:0;background:#fbfbfb;display:block;color-scheme:light}.resize{position:absolute;right:1px;bottom:1px;width:19px;height:19px;padding:0;color:#8d8d8d;cursor:nwse-resize;touch-action:none;background:#fbfbfbd9;border-radius:5px 0 8px 0}
    .language{font:10px/1 Consolas,monospace;width:35px;min-width:35px;padding:3px}.collapsed .language{display:none}
    .collapsed .bar{border-bottom:0;height:100%;padding:3px 4px}.collapsed iframe,.collapsed .resize,.collapsed .dock,.collapsed small,.collapsed .panel-status{display:none}.collapsed .drag{gap:6px}.collapsed .drag strong{font-size:14px}.collapsed.shell{border-radius:20px}.collapsed .control{width:25px;height:25px;border-radius:50%}
    .moving .drag{cursor:grabbing}.moving iframe,.resizing iframe{pointer-events:none}.moving,.resizing{box-shadow:0 8px 36px #32323245}
    .sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
    @media(prefers-reduced-motion:no-preference){button{transition:background .12s}}
  </style><section class="shell" aria-label="Biometry-Clip 懸浮視窗">
    <header class="bar"><button type="button" class="drag" aria-label="移動 Biometry 視窗；可使用方向鍵" title="拖曳移動；方向鍵微調，Shift 加快移動">${svg('eye')}<strong>Biometry-Clip</strong></button>
      <button type="button" class="control dock" aria-label="移到畫面另一側" title="移到畫面另一側">${svg('dock')}</button>
      <button type="button" class="control language" data-action="toggle-language" aria-label="Switch to Chinese" title="Switch to Chinese">中文</button>
      <button type="button" class="control minimize" aria-label="收合視窗" title="收合視窗">${svg('minimize')}</button>
      <button type="button" class="control close" aria-label="關閉懸浮視窗" title="關閉；已儲存資料仍保留">${svg('close')}</button>
    </header>
    <div class="panel-status" role="status" aria-live="polite" hidden><p></p><button type="button" class="retry" hidden>重新載入面板</button></div>
    <iframe title="Biometry-Clip 精簡輸入與貼上面板" referrerpolicy="no-referrer"></iframe>
    <button type="button" class="resize" aria-label="調整視窗大小；可使用方向鍵" title="拖曳調整大小；可使用方向鍵">${svg('resize')}</button>
    <span class="sr" role="status" aria-live="polite"></span>
  </section>`;
  const shell = root.querySelector('.shell');
  const frame = root.querySelector('iframe');
  const dragHandle = root.querySelector('.drag');
  const resizeHandle = root.querySelector('.resize');
  const minimizeButton = root.querySelector('.minimize');
  const dockButton = root.querySelector('.dock');
  const closeButton = root.querySelector('.close');
  const announcement = root.querySelector('.sr[role="status"]');
  const statusNotice = root.querySelector('.panel-status');
  const statusText = statusNotice.querySelector('p');
  const retryButton = root.querySelector('.retry');
  const languageButton=root.querySelector('.language');
  const text=(en,zh)=>language==='zh-TW'?zh:en;
  function applyLanguage(value){
    language=normalizeUiLanguage(value);
    const label=(element,en,zh,titleEn=en,titleZh=zh)=>{element.setAttribute('aria-label',text(en,zh));element.title=text(titleEn,titleZh);};
    shell.setAttribute('lang',language);shell.setAttribute('aria-label',text('Biometry-Clip floating panel','Biometry-Clip 懸浮視窗'));
    label(dragHandle,'Move Biometry panel; arrow keys supported','移動 Biometry 視窗；可使用方向鍵','Drag to move; use arrow keys, Shift for larger steps','拖曳移動；方向鍵微調，Shift 加快移動');
    label(dockButton,'Move to the other side','移到畫面另一側');
    label(closeButton,'Close floating panel','關閉懸浮視窗','Close; saved data is retained','關閉；已儲存資料仍保留');
    label(resizeHandle,'Resize panel; arrow keys supported','調整視窗大小；可使用方向鍵','Drag to resize; arrow keys supported','拖曳調整大小；可使用方向鍵');
    label(languageButton,language==='en'?'Switch to Chinese':'Switch to English',language==='en'?'切換為中文':'切換為英文');
    languageButton.textContent=language==='en'?'中文':'EN';
    frame.title=text('Biometry-Clip compact entry and paste panel','Biometry-Clip 精簡輸入與貼上面板');
    retryButton.textContent=text('Reload panel','重新載入面板');
    render();displayPanelStatus();return language;
  }
  const viewport = () => ({ width:win.innerWidth, height:win.innerHeight });

  function cancelReadinessTimer() {
    if(readinessTimer !== null)timers.clearTimeout(readinessTimer);
    readinessTimer = null;
  }
  function displayPanelStatus() {
    const phase=panelStatus.phase;
    statusNotice.hidden=phase==='idle' || phase==='ready';
    statusNotice.dataset.phase=phase;
    retryButton.hidden=phase!=='error' && phase!=='timeout';
    frame.setAttribute('aria-busy',String(phase==='starting'));
    statusText.textContent=phase==='starting'?text('Opening panel…','正在開啟面板…'):phase==='timeout'?text('Panel is not ready. Reload it; saved cases are retained.','面板尚未回報就緒。可重新載入；已儲存個案會保留。'):phase==='error'?text('Panel failed to load. Reload it; saved cases are retained.','面板載入未完成。請重新載入；已儲存個案會保留。'):'';
  }
  function awaitReadiness() {
    cancelReadinessTimer();
    const token=panelStatus.panelToken,sourceTab=panelStatus.tabId;
    panelStatus={...panelStatus,phase:'starting'};
    displayPanelStatus();
    readinessTimer=timers.setTimeout(()=>{
      readinessTimer=null;
      if(!open || panelStatus.panelToken!==token || panelStatus.tabId!==sourceTab || panelStatus.phase!=='starting')return;
      panelStatus={...panelStatus,phase:'timeout'};
      displayPanelStatus();
    },Math.max(1,finite(loadTimeoutMs,12000)));
  }
  function loadPanel() {
    cancelReadinessTimer();
    const panelToken=String(createToken());
    if(panelToken.length<16 || panelToken.length>100)throw new Error('面板載入識別碼格式錯誤。');
    panelStatus={phase:'starting',panelToken,tabId};
    initialLoadPending=true;
    const url=new URL(runtime.getURL('index.html'));
    url.searchParams.set('view','floating');
    url.searchParams.set('tabId',String(tabId));
    url.searchParams.set('panelToken',panelToken);
    awaitReadiness();
    // Even an empty srcdoc overrides src. An explicit open/retry must discard
    // unexpected replacement markup before navigating to our packaged page.
    frame.removeAttribute('srcdoc');
    frame.src=url.href;
  }
  function receivePanelStatus(message) {
    if(!open || !host.isConnected || message.panelToken!==panelStatus.panelToken || message.tabId!==tabId || !['starting','ready','error'].includes(message.phase))return {ok:false,ignored:true};
    if(message.phase==='starting') {
      if(panelStatus.phase==='ready')return current();
      // Repeated bootstrap status must not postpone the same bounded deadline.
      if(panelStatus.phase!=='starting')awaitReadiness();
    }else {
      cancelReadinessTimer();
      panelStatus={...panelStatus,phase:message.phase};
      displayPanelStatus();
    }
    return current();
  }
  frame.addEventListener('load',()=>{
    if(!open)return;
    if(initialLoadPending){initialLoadPending=false;return;}
    // A later navigation can produce a blank document after an earlier ready.
    // Diagnose that document once; do not automatically reload or launch UI.
    awaitReadiness();
  });

  function render() {
    geometry = clampPanelGeometry(geometry, viewport(), collapsed);
    host.style.setProperty('left', `${geometry.x}px`, 'important');
    host.style.setProperty('top', `${geometry.y}px`, 'important');
    host.style.setProperty('width', `${geometry.width}px`, 'important');
    host.style.setProperty('height', `${geometry.height}px`, 'important');
    host.style.setProperty('display', hidden ? 'none' : 'block', 'important');
    shell.classList.toggle('collapsed', collapsed);
    minimizeButton.innerHTML = svg(collapsed ? 'expand' : 'minimize');
    minimizeButton.setAttribute('aria-label', collapsed ? text('Expand panel','展開視窗') : text('Collapse panel','收合視窗'));
    minimizeButton.title = collapsed ? text('Expand panel','展開視窗') : text('Collapse panel','收合視窗');
    minimizeButton.setAttribute('aria-expanded', String(!collapsed));
  }
  function current() { return { ok:true, open, expanded:open && !collapsed, visible:open && !hidden, geometry:{...geometry}, tabId,panelStatus:{...panelStatus} }; }
  function mount(id) {
    if (!Number.isInteger(id) || id < 0) return {ok:false,error:'無效分頁'};
    const needsLoad=!open || !host.isConnected || id!==tabId || !panelStatus.panelToken || frame.hasAttribute('srcdoc');
    tabId = id;
    open = true;
    hidden = false;
    if(needsLoad)loadPanel();
    if (!host.isConnected) doc.documentElement.append(host);
    render();
    return current();
  }
  function expand(id = tabId) {
    if (collapsed) {
      collapsed = false;
      geometry = clampPanelGeometry({...geometry,...rememberedSize},viewport());
    }
    const state = mount(id);
    if (state.ok) announcement.textContent=text('Biometry panel expanded.','Biometry 視窗已展開。');
    return state;
  }
  function minimize() {
    if (!open) return current();
    stopGesture();
    if (!collapsed) rememberedSize = { width:geometry.width, height:geometry.height };
    collapsed = true;
    hidden = false;
    render();
    announcement.textContent=text('Biometry panel collapsed.','Biometry 視窗已收合。');
    return current();
  }
  function toggle(id = tabId) {
    if (!open || !host.isConnected || collapsed || hidden || frame.hasAttribute('srcdoc')) return expand(id);
    return minimize();
  }
  function close() {
    stopGesture();
    cancelReadinessTimer();
    panelStatus={phase:'idle',panelToken:null,tabId:null};
    initialLoadPending=false;
    displayPanelStatus();
    host.remove();
    open = false;
    hidden = false;
    return current();
  }
  function hide() { if(open){stopGesture();hidden=true;render();}return current(); }
  function restore() { if(open){hidden=false;render();}return current(); }
  function retry() { if(!open || !host.isConnected)return {ok:false,error:'面板尚未開啟'};loadPanel();return current(); }
  function move(x,y) {
    geometry = clampPanelGeometry({...geometry,x,y},viewport(),collapsed);
    render();
  }
  function resize(width,height) {
    if(collapsed)return;
    geometry = clampPanelGeometry({...geometry,width,height},viewport());
    rememberedSize = {width:geometry.width,height:geometry.height};
    render();
  }
  function stopGesture() {
    if (gesture) {
      const ended = gesture;
      gesture = null;
      try { ended.handle.releasePointerCapture?.(ended.id); } catch {}
    }
    shell.classList.remove('moving','resizing');
  }
  function startGesture(event,mode,handle) {
    if (event.button !== 0 || gesture) return;
    event.preventDefault();event.stopPropagation();
    gesture={ id:event.pointerId,mode,handle,startX:event.clientX,startY:event.clientY,rect:{...geometry} };
    try { handle.setPointerCapture?.(event.pointerId); } catch {}
    shell.classList.add(mode==='move'?'moving':'resizing');
  }
  function updateGesture(event) {
    if(!gesture || event.pointerId!==gesture.id)return;
    event.preventDefault();event.stopPropagation();
    const dx=event.clientX-gesture.startX,dy=event.clientY-gesture.startY;
    if(gesture.mode==='move')move(gesture.rect.x+dx,gesture.rect.y+dy);
    else resize(gesture.rect.width+dx,gesture.rect.height+dy);
  }
  for(const [handle,mode] of [[dragHandle,'move'],[resizeHandle,'resize']]) {
    handle.addEventListener('pointerdown',event=>startGesture(event,mode,handle));
    handle.addEventListener('pointermove',updateGesture);
    handle.addEventListener('pointerup',event=>{if(gesture?.id===event.pointerId)stopGesture();});
    handle.addEventListener('pointercancel',stopGesture);
    handle.addEventListener('lostpointercapture',stopGesture);
    handle.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
      event.preventDefault();event.stopPropagation();
      const distance=event.shiftKey?40:10;
      const dx=event.key==='ArrowLeft'?-distance:event.key==='ArrowRight'?distance:0;
      const dy=event.key==='ArrowUp'?-distance:event.key==='ArrowDown'?distance:0;
      if(mode==='move')move(geometry.x+dx,geometry.y+dy);else resize(geometry.width+dx,geometry.height+dy);
      announcement.textContent=mode==='move'?text('Biometry panel moved.','Biometry 視窗位置已調整。'):text('Biometry panel resized.','Biometry 視窗大小已調整。');
    });
  }
  languageButton.addEventListener('click',async event=>{
    event.stopPropagation();const next=language==='en'?'zh-TW':'en';
    if(typeof runtime.sendMessage!=='function'){applyLanguage(next);return;}
    languageButton.disabled=true;
    try{const response=await runtime.sendMessage({type:'biometry:ui-language:set',language:next});if(!response?.ok)throw new Error('Language not saved');applyLanguage(response.language);}
    catch{announcement.textContent=text('Could not save language. Try again.','無法儲存語言，請再試一次。');}
    finally{languageButton.disabled=false;}
  });
  minimizeButton.addEventListener('click',event=>{event.stopPropagation();collapsed?expand():minimize();});
  closeButton.addEventListener('click',event=>{event.stopPropagation();close();});
  retryButton.addEventListener('click',event=>{event.stopPropagation();retry();});
  dockButton.addEventListener('click',event=>{
    event.stopPropagation();
    const toLeft=geometry.x+geometry.width/2>win.innerWidth/2;
    move(toLeft?PANEL_SIZE.margin:win.innerWidth-geometry.width-PANEL_SIZE.margin,geometry.y);
    announcement.textContent=toLeft?text('Biometry panel moved left.','Biometry 視窗已移至左側。'):text('Biometry panel moved right.','Biometry 視窗已移至右側。');
  });
  const onViewportResize=()=>{if(open){stopGesture();render();}};
  win.addEventListener('resize',onViewportResize);
  function handleMessage(message) {
    if(message?.type==='biometry:ui-language:changed'&&isUiLanguage(message.language)){applyLanguage(message.language);return {ok:true,language};}
    if(message?.type==='biometry:panel-status')return receivePanelStatus(message);
    if(message?.type==='biometry:toggle-floating')return toggle(message.tabId);
    if(message?.type==='biometry:show-floating')return expand(message.tabId);
    if(message?.type==='biometry:hide-floating')return hide();
    if(message?.type==='biometry:restore-floating')return restore();
    return undefined;
  }
  function destroy(){close();win.removeEventListener('resize',onViewportResize);}
  applyLanguage(language);
  return {toggle,expand,minimize,close,hide,restore,move,resize,retry,setLanguage:applyLanguage,getState:current,handleMessage,destroy,elements:{host,frame,dragHandle,resizeHandle,minimizeButton,dockButton,closeButton,statusNotice,statusText,retryButton,languageButton}};
}

export function installFloatingShell({ scope = globalThis, document:doc = globalThis.document, window:win = globalThis.window, runtime = globalThis.chrome?.runtime } = {}) {
  if (!doc || !win || !runtime?.onMessage?.addListener || win.top !== win) return undefined;
  if (scope[INSTANCE_KEY]) return scope[INSTANCE_KEY];
  const controller = createFloatingShell({document:doc,window:win,runtime});
  if(typeof runtime.sendMessage==='function')Promise.resolve().then(()=>runtime.sendMessage({type:'biometry:ui-language:get'})).then(response=>{if(response?.ok)controller.setLanguage(response.language);}).catch(()=>{});
  const listener = (message, sender, sendResponse) => {
    // Only this extension can issue shell commands. No window postMessage bridge
    // is exposed to the host site.
    if(sender?.id && sender.id !== runtime.id)return false;
    const result=controller.handleMessage(message);
    if(result)sendResponse(result);
    return false;
  };
  runtime.onMessage.addListener(listener);
  scope[INSTANCE_KEY] = controller;
  return controller;
}

if(typeof document !== 'undefined' && typeof chrome !== 'undefined') installFloatingShell();

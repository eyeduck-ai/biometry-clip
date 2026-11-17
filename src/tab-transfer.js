import {LENS_DEFINITIONS,mergeLensCatalog,planLensSelections} from './lens-registry.js';
import {lensTransferBridge,createLensTransfer} from './lens-transfer.js';
import {matchSite} from './sites.js';
import {siteBridge} from './bridge.js';
import {cleanCase,emptyCase} from './model.js';
import {waitForSupportedTab} from './tab-ready.js';
import {applyTransferDefaults} from './transfer-defaults.js';

const failure=(code,message)=>Object.assign(new Error(message),{code});
const sameValues=(left,right)=>{const a=cleanCase(left),b=cleanCase(right);return JSON.stringify(a.patient)===JSON.stringify(b.patient)&&JSON.stringify(a.eyes)===JSON.stringify(b.eyes);};

/** Runs in the service worker, so ASP.NET postbacks cannot interrupt a fill. */
export function createTabTransfer(chromeApi,{readSession,readLensCatalog=async()=>undefined,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=()=>Date.now()}={}) {
  const locks=new Set();
  async function checkedTab(tabId,expectedSiteId) {
    const id=Number(tabId);if(!Number.isSafeInteger(id)||id<0)throw failure('INVALID_TAB','無效的計算網站分頁。');
    const tab=await chromeApi.tabs.get(id),profile=matchSite(tab.url);
    if(!profile||expectedSiteId&&profile.id!==expectedSiteId)throw failure('TARGET_CHANGED','分頁已離開原定計算入口，已停止貼上。');
    return {tab,profile};
  }
  async function run(tabId,action,data,options={},expectedSiteId) {
    const {tab,profile}=await checkedTab(tabId,expectedSiteId);
    const results=await chromeApi.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},func:siteBridge,args:[action,profile,data,options]});
    const frame=results.find(item=>item.frameId===0&&item.result);
    if(!frame)throw failure('FORM_UNAVAILABLE','計算表單尚未就緒。');
    if(frame.result.error)throw failure('FORM_REJECTED',frame.result.error);
    return {...frame.result,tabId:tab.id,tabUrl:tab.url,frameId:0,documentId:frame.documentId,profile};
  }
  async function runLens(tabId,action,definition,request={}){
    const {tab}=await checkedTab(tabId,definition.siteId);
    const results=await chromeApi.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},func:lensTransferBridge,args:[action,definition,request]});
    const frame=results.find(item=>item.frameId===0&&item.result);
    if(!frame)throw failure('LENS_FORM_UNAVAILABLE','晶體欄位尚未就緒。');
    if(frame.result.status==='target-changed')throw failure('TARGET_CHANGED',frame.result.reason||'目的晶體入口已變更。');
    return {...frame.result,documentId:frame.documentId};
  }
  const lensEngine=createLensTransfer({run:runLens,checkedTab,onUpdated:chromeApi.tabs.onUpdated,sleep,now});
  async function prepareLenses(tabId,data,options={},guard=async()=>{}){
    const eyes=options.eye==='OU'?['OD','OS']:[options.eye||data.activeEye||'OD'];
    const hasSource=eyes.some(eye=>['iolSourceSite','iolSourceValue','iolSourceLabel','iolCatalogId'].some(key=>data.eyes[eye]?.[key]));
    if(options.includeLens===false||!hasSource)return {status:'skipped',controls:[],plans:[],warnings:[],navigated:false};
    const {profile}=await checkedTab(tabId),definition=LENS_DEFINITIONS[profile.id];
    if(!definition)return {status:'manual',controls:[],plans:[],warnings:[`${profile.name} 尚無可操作的晶體欄位，已保留原站選擇。`],navigated:false};
    await guard();const inventory=await lensEngine.inspect(tabId,definition),catalog=mergeLensCatalog(await readLensCatalog());await guard();
    const plan=planLensSelections(data,profile.id,inventory,{eye:options.eye||data.activeEye||'OD',catalog});
    if(!plan.selections?.length)return {siteId:profile.id,status:plan.status||'manual',controls:[],plans:plan.plans||[],warnings:plan.warnings||[],navigated:false};
    const result=await lensEngine.prepare(tabId,definition,plan.selections,{eye:options.eye,guard,timeoutMs:options.lensTimeoutMs,settleMs:options.lensSettleMs});
    return {...result,plans:plan.plans||[],warnings:[...new Set([...(plan.warnings||[]),...(result.warnings||[])])],status:plan.status==='partial'||result.status==='partial'?'partial':result.status};
  }
  async function verifyLenses(tabId,preparation,guard){
    const accepted=(preparation.controls||[]).filter(control=>['applied','already-selected'].includes(control.status));
    if(!accepted.length)return;
    await guard();const {profile}=await checkedTab(tabId),definition=LENS_DEFINITIONS[profile.id],inventory=await lensEngine.inspect(tabId,definition);await guard();
    for(const selection of accepted){
      const matches=(inventory.controls||[]).filter(control=>control.controlId===selection.controlId&&(!selection.eye||!control.eye||control.eye===selection.eye));
      if(matches.length!==1||matches[0].selected?.value!==selection.value||matches[0].selected?.label!==selection.label||matches[0].selected?.kind!==selection.kind)throw failure('LENS_STATE_CHANGED','原站後續更新重設了已選晶體，已停止貼上；請核對模式與晶體。');
    }
  }
  async function prepareEye(tabId,{eye,eyeConfirmed=false,timeoutMs=15000,...options}={}) {
    if(!['OD','OS','OU'].includes(eye))throw failure('INVALID_EYE','請選擇 OD、OS 或雙眼。');
    await waitForSupportedTab(chromeApi.tabs,tabId,timeoutMs);
    const data=emptyCase(),before=await run(tabId,'inspect',data,{...options,eye}),siteId=before.siteId;
    if(before.eyeMode==='both')return {...before,autoEyeSelected:false,navigated:false};
    if(eye==='OU')throw failure('SINGLE_EYE_ONLY','此網站一次只支援單眼。');
    if(before.detectedEye===eye)return {...before,autoEyeSelected:false,navigated:false};
    if(!before.canSelectEye){
      if(!before.detectedEye&&eyeConfirmed)return {...before,autoEyeSelected:false,navigated:false,manualEyeConfirmed:true};
      throw failure('EYE_UNCONFIRMED','此表單無法自動切換眼別，請在原網站確認 OD／OS。');
    }
    let loading=false,completed=false,changed=false;
    const onUpdated=(id,change)=>{if(Number(id)!==Number(tabId))return;if(change.status==='loading'){loading=true;changed=true;}if(change.status==='complete'&&loading)completed=true;};
    chromeApi.tabs.onUpdated.addListener(onUpdated);
    const started=now();let stableSince;
    try {
      // A navigation may invalidate executeScript's response after the native
      // click. Only the later reinspection can confirm that selection worked.
      try{await run(tabId,'select-eye',data,{eye},siteId);}catch(error){if(error.code==='FORM_REJECTED'||error.code==='TARGET_CHANGED')throw error;}
      while(now()-started<timeoutMs){
        const {tab}=await checkedTab(tabId,siteId);
        if(tab.status==='loading'){loading=true;changed=true;stableSince=undefined;await sleep(100);continue;}
        let current;
        try{current=await run(tabId,'inspect',data,{...options,eye},siteId);}catch(error){if(error.code==='TARGET_CHANGED')throw error;await sleep(100);continue;}
        const documentChanged=!!before.documentId&&!!current.documentId&&before.documentId!==current.documentId;
        const postbackDone=!before.profile.eyeSelectPostback||completed||documentChanged;
        if(current.detectedEye===eye&&postbackDone){
          stableSince??=now();
          if(now()-stableSince>=350)return {...current,autoEyeSelected:true,navigated:changed||documentChanged};
        }else stableSince=undefined;
        await sleep(100);
      }
      throw failure('EYE_SWITCH_TIMEOUT','網站眼別切換尚未穩定，已停止貼上；請在原站確認後重試。');
    }finally{chromeApi.tabs.onUpdated.removeListener(onUpdated);}
  }
  async function prepareDisplayPreferences(tabId,options={},knownBefore) {
    const requested=options.cylinderConvention??'minus';
    if(!['minus','plus','preserve'].includes(requested))throw failure('INVALID_DISPLAY_PREFERENCE','柱鏡顯示偏好必須為 minus、plus 或 preserve。');
    const data=emptyCase(),before=knownBefore||await run(tabId,'inspect',data,options),siteId=before.siteId;
    const meta=before.displayPreferences?.cylinderConvention||{status:'unsupported',value:'',available:false};
    const state={requested,value:meta.value||'',status:'unsupported',changed:false};
    const finish=(current,displayPreference,navigated=false)=>({...current,displayPreference,navigated});
    if(requested==='preserve')return finish(before,{...state,status:'preserved'});
    if(meta.status==='unsupported')return finish(before,state);
    if(meta.value===requested)return finish(before,{...state,status:'already-selected'});
    if(!meta.available)return finish(before,{...state,status:'manual',reason:meta.reason||'柱鏡顯示控制目前不可唯一操作，請於原站確認。'});
    let loading=false,completed=false,changed=false,documentChangedSeen=false,actionResult;
    const onUpdated=(id,change)=>{if(Number(id)!==Number(tabId))return;if(change.status==='loading'){loading=true;changed=true;}if(change.status==='complete'&&loading)completed=true;};
    chromeApi.tabs.onUpdated.addListener(onUpdated);
    const started=now(),timeoutMs=options.preferenceTimeoutMs??4000;let stableSince;
    try{
      try{actionResult=await run(tabId,'apply-display',data,options,siteId);}catch(error){if(error.code==='FORM_REJECTED'||error.code==='TARGET_CHANGED')throw error;}
      if(actionResult?.displayPreference?.status==='manual'&&!actionResult.displayPreference.changed)return finish(before,actionResult.displayPreference);
      while(now()-started<timeoutMs){
        const {tab}=await checkedTab(tabId,siteId);
        if(tab.status==='loading'){loading=true;changed=true;stableSince=undefined;await sleep(100);continue;}
        let current;
        try{current=await run(tabId,'inspect',data,options,siteId);}catch(error){if(error.code==='TARGET_CHANGED')throw error;await sleep(100);continue;}
        const documentChanged=!!before.documentId&&!!current.documentId&&before.documentId!==current.documentId;
        documentChangedSeen||=documentChanged;
        const currentState=current.displayPreferences?.cylinderConvention;
        const postbackDone=!before.profile.displayPreferences?.cylinderConvention?.navigationExpected||completed||documentChanged;
        if(currentState?.available&&currentState.value===requested&&postbackDone){
          stableSince??=now();
          if(now()-stableSince>=350)return finish(current,{...state,value:requested,status:'applied',changed:true},changed||documentChanged);
        }else stableSince=undefined;
        await sleep(100);
      }
      const current=await run(tabId,'inspect',data,options,siteId);
      return finish(current,{...state,value:current.displayPreferences?.cylinderConvention?.value||'',status:'manual',changed:true,reason:'原站未確認柱鏡顯示偏好，請於原站確認。'},changed||documentChangedSeen);
    }finally{chromeApi.tabs.onUpdated.removeListener(onUpdated);}
  }
  async function prepareModes(tabId,data,options={},knownBefore) {
    const {guard:guardSource,...bridgeOptions}=options;
    let current=knownBefore||await run(tabId,'inspect',data,bridgeOptions),navigated=false,eyeReset=false;
    const siteId=current.siteId,outcomes=[];
    const lostRequestedEye=snapshot=>snapshot.eyeMode!=='both'&&snapshot.detectedEye!==options.eye&&(!!snapshot.detectedEye||navigated||knownBefore?.detectedEye===options.eye);
    modeLoop: for(const initial of current.modeControls||[]){
      await guardSource?.();
      const before=await run(tabId,'inspect',data,bridgeOptions,siteId),state=before.modeControls?.find(item=>item.index===initial.index);
      if(lostRequestedEye(before)){current=before;eyeReset=true;break;}
      if(!state||state.requested==null||state.requested==='')continue;
      if(state.status!=='ready'||!state.available){outcomes.push({...state,status:'manual',changed:false,reason:state.reason||'原站模式元件未能唯一確認，請在原站核對。'});continue;}
      if(String(state.value)===String(state.requested)){outcomes.push({...state,status:'already-selected',changed:false});current=before;continue;}
      let loading=false,completed=false,changed=false,actionResult;
      const onUpdated=(id,change)=>{if(Number(id)!==Number(tabId))return;if(change.status==='loading'){loading=true;changed=true;}if(change.status==='complete'&&loading)completed=true;};
      chromeApi.tabs.onUpdated.addListener(onUpdated);
      const started=now();let stableSince;
      try{
        try{actionResult=await run(tabId,'prepare-modes',data,{...bridgeOptions,modeIndex:state.index},siteId);}catch(error){if(error.code==='FORM_REJECTED'||error.code==='TARGET_CHANGED')throw error;}
        if(actionResult?.modePreparation?.changed===false){outcomes.push(actionResult.modePreparation);current=before;continue;}
        const expectsNavigation=!!before.profile.modeControls?.[state.index]?.navigationExpected;
        let settled=false,menuSelectionAttempted=false;
        while(now()-started<(options.modeTimeoutMs??15000)){
          await guardSource?.();
          const {tab}=await checkedTab(tabId,siteId);
          if(tab.status==='loading'){loading=true;changed=true;stableSince=undefined;await sleep(100);continue;}
          try{current=await run(tabId,'inspect',data,bridgeOptions,siteId);}catch(error){if(error.code==='TARGET_CHANGED')throw error;await sleep(100);continue;}
          const documentChanged=!!before.documentId&&!!current.documentId&&before.documentId!==current.documentId;
          navigated||=changed||documentChanged;
          const latest=current.modeControls?.find(item=>item.index===state.index);
          if((!expectsNavigation||completed||documentChanged)&&lostRequestedEye(current)){
            eyeReset=true;outcomes.push({...state,status:'eye-reset',changed:true,reason:'原站模式更新重設了眼別，需重新確認眼別與模式。'});break modeLoop;
          }
          if(actionResult?.modePreparation?.phase==='opened'&&latest?.menuOpen&&!menuSelectionAttempted){
            if(!latest.available||latest.status!=='ready'){outcomes.push({...latest,status:'manual',changed:false,reason:'儀器選單沒有唯一可操作的對應選項，請在原站選擇。'});settled=true;break;}
            await guardSource?.();
            actionResult=await run(tabId,'prepare-modes',data,{...bridgeOptions,modeIndex:state.index},siteId);menuSelectionAttempted=true;stableSince=undefined;await sleep(100);continue;
          }
          if(latest?.available&&String(latest.value)===String(state.requested)&&(!expectsNavigation||completed||documentChanged)){
            stableSince??=now();if(now()-stableSince>=350){outcomes.push({...latest,status:'applied',changed:true});settled=true;break;}
          }else stableSince=undefined;
          await sleep(100);
        }
        if(!settled)throw failure('MODE_SWITCH_TIMEOUT','網站模式切換尚未穩定，已停止貼上；請在原站確認後重試。');
      }finally{chromeApi.tabs.onUpdated.removeListener(onUpdated);}
    }
    if(outcomes.length&&!eyeReset){
      await guardSource?.();current=await run(tabId,'inspect',data,bridgeOptions,siteId);
      eyeReset=lostRequestedEye(current);
      for(const accepted of outcomes.filter(item=>!eyeReset&&['applied','already-selected'].includes(item.status))){
        const latest=current.modeControls?.find(item=>item.index===accepted.index);
        if(!latest?.available||String(latest.value)!==String(accepted.requested))throw failure('MODE_STATE_CHANGED','原站重新整理後模式已變更，已停止貼上；請核對是否有互不相容的選項。');
      }
    }
    const controls=outcomes.map(item=>item.manualReason?{...item,status:'manual',reason:item.manualReason}:item);
    return {...current,eyeReset,modePreparation:{status:eyeReset?'eye-reset':controls.some(item=>item.status==='manual')?'manual':controls.length?'ready':'unsupported',controls},navigated};
  }
  async function quickFill(tabId,data,options={}) {
    const id=Number(tabId);if(locks.has(id))throw failure('TRANSFER_BUSY','此分頁正在貼上資料，請稍候。');
    locks.add(id);
    let prepared;
    try{
      const savedSource=cleanCase(data),{caseToken,revision}=options;
      const guard=async()=>{
        const session=await readSession();
        if(session.caseToken!==caseToken||session.revision!==revision||!sameValues(session.data,savedSource))throw failure('CASE_CHANGED','工作副本已變更，已停止貼上；請重新按貼上。');
      };
      await guard();
      prepared=await prepareEye(id,options);
      await guard();
      const source=applyTransferDefaults(savedSource,options.transferDefaults,prepared.profile);
      let preLensModes;
      const lensEyes=options.eye==='OU'?['OD','OS']:[options.eye||source.activeEye||'OD'];
      const hasSourceLens=lensEyes.some(eye=>['iolSourceSite','iolSourceValue','iolSourceLabel','iolCatalogId'].some(key=>source.eyes[eye]?.[key]));
      // ESCRS filters its IOL list by the Toric switch. Prepare the explicit
      // source modes before searching that list, then verify modes again after
      // the lens choice. Kane keeps the opposite order because its lens choice
      // can itself select Toric/Non-toric.
      if(prepared.siteId==='escrs'&&options.includeLens!==false&&hasSourceLens){
        preLensModes=await prepareModes(id,source,{...options,guard},prepared);
        prepared={...prepared,...preLensModes,navigated:prepared.navigated||preLensModes.navigated};await guard();
      }
      let lensPreparation=await prepareLenses(id,savedSource,options,guard);
      prepared={...prepared,navigated:prepared.navigated||lensPreparation.navigated};await guard();
      if(lensPreparation.status!=='skipped'){
        const beforeEye=prepared.detectedEye,fresh=await run(id,'inspect',emptyCase(),options,prepared.siteId);
        prepared={...prepared,...fresh,navigated:prepared.navigated||lensPreparation.navigated};
        if(prepared.eyeMode!=='both'&&prepared.detectedEye!==options.eye&&(lensPreparation.navigated||beforeEye===options.eye)){
          const selected=await prepareEye(id,{...options,eyeConfirmed:false});
          prepared={...prepared,...selected,autoEyeSelected:prepared.autoEyeSelected||selected.autoEyeSelected,navigated:prepared.navigated||selected.navigated};await guard();
          const previous=lensPreparation;
          lensPreparation=await prepareLenses(id,savedSource,{...options,eyeConfirmed:false},guard);
          lensPreparation={...lensPreparation,navigated:previous.navigated||lensPreparation.navigated,warnings:[...new Set([...(previous.warnings||[]),...(lensPreparation.warnings||[])])]};
          const refreshed=await run(id,'inspect',emptyCase(),{...options,eyeConfirmed:false},prepared.siteId);
          prepared={...prepared,...refreshed,navigated:prepared.navigated||lensPreparation.navigated};await guard();
          if(prepared.detectedEye!==options.eye)throw failure('LENS_EYE_CYCLE','晶體與眼別切換互相重設，已停止貼上；請在原站確認後重試。');
        }
      }
      const modeEyeWasKnown=prepared.detectedEye===options.eye;
      let modes=await prepareModes(id,source,{...options,guard},prepared),modeEyeRechecked=false;
      prepared={...prepared,...modes,navigated:prepared.navigated||modes.navigated};
      await guard();
      if(prepared.eyeMode!=='both'&&(modes.eyeReset||prepared.detectedEye!==options.eye&&(modeEyeWasKnown||modes.navigated))){
        const selected=await prepareEye(id,{...options,eyeConfirmed:false});
        prepared={...prepared,...selected,autoEyeSelected:prepared.autoEyeSelected||selected.autoEyeSelected,navigated:prepared.navigated||selected.navigated};modeEyeRechecked=true;await guard();
        // A native eye choice may itself load a different saved form. Rebuild
        // modes once from that document; an eye/mode cycle is not retried.
        modes=await prepareModes(id,source,{...options,eyeConfirmed:false,guard},prepared);
        prepared={...prepared,...modes,navigated:prepared.navigated||modes.navigated};await guard();
        if(modes.eyeReset||prepared.detectedEye!==options.eye)throw failure('MODE_EYE_CYCLE','網站模式與眼別切換互相重設，已停止貼上；請在原站確認後重試。');
      }
      let inputUnitPreparation;
      if(prepared.profile.inputUnits?.keratometry){
        const units=await run(id,'prepare-input-units',source,options,prepared.siteId);
        inputUnitPreparation=units.inputUnitPreparation;
        await guard();
        // A native K-notation change may clear old K inputs/results. Build
        // both the display decision and field preview from the fresh form.
        const refreshed=await run(id,'inspect',emptyCase(),options,prepared.siteId);
        prepared={...prepared,...refreshed,autoEyeSelected:prepared.autoEyeSelected,navigated:prepared.navigated};
      }
      const firstEyeWasKnown=prepared.detectedEye===options.eye;
      let display=await prepareDisplayPreferences(id,options,prepared);
      prepared={...prepared,navigated:prepared.navigated||display.navigated};
      await guard();
      // Some preference controls can navigate or rebuild the current eye.
      // Never carry a manual confirmation into a new document. A reliable
      // radio pair may be selected again, followed by one bounded preference
      // recheck; preview itself still rejects any remaining eye mismatch.
      let eyeRechecked=false;
      if(display.eyeMode!=='both'&&(display.navigated||(firstEyeWasKnown&&display.detectedEye!==options.eye))){
        const selected=await prepareEye(id,{...options,eyeConfirmed:false});
        prepared={...prepared,navigated:prepared.navigated||selected.navigated,autoEyeSelected:prepared.autoEyeSelected||selected.autoEyeSelected};eyeRechecked=true;
        await guard();
        display=await prepareDisplayPreferences(id,options,selected);
        prepared={...prepared,navigated:prepared.navigated||display.navigated};
        await guard();
      }
      const writeOptions={...options,eyeConfirmed:prepared.navigated||eyeRechecked||modeEyeRechecked?false:options.eyeConfirmed};
      await verifyLenses(id,lensPreparation,guard);
      const plan=await run(id,'preview',source,writeOptions,prepared.siteId),ready=plan.rows.filter(row=>row.status==='ready');
      if(!ready.length)throw failure('NO_MATCHED_FIELDS','尚無可貼上的欄位；請確認原網站模式及面板資料。');
      await guard();
      const result=await run(id,'apply',source,{...writeOptions,expected:ready,expectedFrameUrl:plan.url},prepared.siteId);
      const warnings=[...(result.warnings||[]),...(lensPreparation.warnings||[])];
      if(display.displayPreference.status==='manual')warnings.push(display.displayPreference.reason);
      if(inputUnitPreparation?.status==='manual'&&inputUnitPreparation.reason)warnings.push(inputUnitPreparation.reason);
      for(const control of modes.modePreparation.controls)if(control.status==='manual'&&control.reason)warnings.push(control.reason);
      return {...result,warnings,lensPreparation,...(preLensModes?{preLensModePreparation:preLensModes.modePreparation}:{}),inputUnitPreparation,modePreparation:modes.modePreparation,displayPreference:display.displayPreference,previewCount:ready.length,sourceGuard:{caseToken,revision},autoEyeSelected:prepared.autoEyeSelected,navigated:prepared.navigated};
    }catch(error){if(prepared?.navigated){error.navigated=true;error.restoreSiteId=prepared.siteId;}throw error;}finally{locks.delete(id);}
  }
  return {prepareEye,prepareDisplayPreferences,prepareModes,prepareLenses,quickFill};
}

import {cleanCase,emptyCase} from '../model.js';
import {SITES} from '../sites.js';
import {caseFromReadRows} from '../transfer.js';
import {QA_CASE,QA_SITE_CHECKS} from './fixtures.js';

const copy=value=>structuredClone(value);
const equal=(left,right)=>String(left)===String(right)||(String(left??'').trim()!==''&&String(right??'').trim()!==''&&Number.isFinite(Number(left))&&Number.isFinite(Number(right))&&Number(left)===Number(right));
const sameData=(left,right)=>JSON.stringify(cleanCase(left).patient)===JSON.stringify(cleanCase(right).patient)&&JSON.stringify(cleanCase(left).eyes)===JSON.stringify(cleanCase(right).eyes);
const id=row=>`${row.eye}:${row.key}`;
const errorText=error=>String(error?.message||error||'操作未完成').slice(0,500);
const notes=value=>(Array.isArray(value)?copy(value):[String(value||'')]).filter(Boolean);

/** User-started native integration checks. No website or storage work on import. */
export function createQaRunner(api,{onUpdate=()=>{},now=()=>new Date().toISOString()}={}){
  const initialSites=()=>QA_SITE_CHECKS.map(check=>({siteId:check.siteId,status:'pending',actions:[],notes:[...notes(check.notes),...notes(check.requiredManualModes)]}));
  let state={runId:null,status:'idle',currentIndex:0,sites:initialSites(),storageChecks:[],message:'尚未開始合成驗收。'};
  let busy=false,session,source,patientA,measurementA1,startedAt,finishedAt;
  const ownedTabs=new Set(),cursors=new Map(),confirmedEyes=new Set();
  const update=()=>{try{onUpdate(copy(state));}catch{/* Rendering cannot change test execution. */}};
  const valueFor=(field,scope)=>field.key.startsWith('patient.')?source.patient[field.key.slice(8)]:source.eyes[field.eye==='shared'?(scope==='OS'?'OS':'OD'):field.eye]?.[field.key];
  async function exclusive(work){if(busy)throw new Error('目前驗收操作尚未完成。');busy=true;state.status='running';update();try{return await work();}finally{busy=false;update();}}
  async function check(name,work){const row={name,status:'running'};state.storageChecks.push(row);update();try{await work();row.status='passed';}catch(error){row.status='failed';row.detail=errorText(error);throw error;}finally{update();}}
  const requireValue=(condition,message)=>{if(!condition)throw new Error(message);};
  async function replace(data){session=await api.saveCase(data,{caseToken:session.caseToken,revision:session.revision});return session;}
  async function select(patientId,measurementId){session=await api.selectMeasurement(patientId,measurementId,session.caseToken,session.revision);return session;}
  async function save(patientId,label,data=session.data){return api.saveMeasurement({patientId,label,measuredAt:now(),source:'SYNTHETIC · native QA',caseToken:session.caseToken,revision:session.revision,data});}
  async function start(){
    if(!api.isExtension){state.status='error';state.message='請從已安裝擴充功能的原生驗收入口開始。';update();return copy(state);}
    requireValue(!state.runId||state.status==='complete','此驗收已開始；請繼續、重試或略過目前網站。');
    return exclusive(async()=>{
      state={runId:crypto.randomUUID(),status:'running',currentIndex:0,sites:initialSites(),storageChecks:[],message:'正在驗證隔離的合成資料儲存。'};
      startedAt=now();finishedAt=undefined;ownedTabs.clear();cursors.clear();confirmedEyes.clear();update();
      try{
        session=await api.loadData();source=cleanCase(QA_CASE);
        source.patient.patientId=`SYNTHETIC-${state.runId}-A`;source.patient.name='SYNTHETIC QA PATIENT A - NOT A PATIENT';
        await check('isolated-session-cas',async()=>{await replace(source);requireValue(sameData(session.data,source),'合成工作副本寫入後不一致。');});
        await check('patient-A-created',async()=>{patientA=(await api.createPatient(source.patient)).patient;requireValue(patientA.patient.patientId===source.patient.patientId,'合成病人 A 不一致。');});
        await check('measurement-A1-saved',async()=>{measurementA1=(await save(patientA.id,'SYNTHETIC-01')).measurement;requireValue(sameData({patient:measurementA1.patient,eyes:measurementA1.eyes},source),'第一筆測量與來源不同。');});
        await check('measurement-A2-independent',async()=>{session=await api.patchCase({eyes:{OD:{al:'23.68'}}},session.caseToken);const second=await save(patientA.id,'SYNTHETIC-02');requireValue(second.patient.measurements.length===2&&second.measurement.eyes.OD.al==='23.68'&&second.patient.measurements[0].eyes.OD.al===source.eyes.OD.al,'多次測量未保持獨立。');});
        await check('measurement-A1-selected',async()=>{await select(patientA.id,measurementA1.id);requireValue(sameData(session.data,source)&&source.eyes.OD.al!==source.eyes.OS.al,'歷史測量或雙眼資料不一致。');});
        let patientB;
        await check('patient-B-activated',async()=>{patientB=(await api.createPatient({...source.patient,patientId:`SYNTHETIC-${state.runId}-B`,name:'SYNTHETIC QA PATIENT B - NOT A PATIENT'})).patient;session=await api.activatePatient(patientB.id,session.caseToken,session.revision);requireValue(session.data.patient.patientId===patientB.patient.patientId&&Object.values(session.data.eyes).every(eye=>Object.keys(eye).length===0),'第二位病人未建立空白工作副本。');});
        await check('patient-B-measurement-saved',async()=>{const data=cleanCase(source);data.patient=patientB.patient;data.eyes.OD.al='25.11';data.eyes.OS.al='25.92';await replace(data);const result=await save(patientB.id,'SYNTHETIC-B-01');requireValue(result.measurement.eyes.OD.al==='25.11'&&result.measurement.eyes.OS.al==='25.92','第二位病人量測不一致。');});
        await check('patient-A-history-retained',async()=>{await select(patientA.id,measurementA1.id);const library=await api.loadLibrary(),a=library.patients.find(patient=>patient.id===patientA.id);requireValue(sameData(session.data,source)&&a.measurements.length===2&&library.patients.some(patient=>patient.id===patientB.id),'跨病人切換未保留歷史測量。');});
        state.status='idle';state.message='隔離儲存驗證完成。按「驗證下一站」開啟第一個合成測試分頁。';
      }catch(error){state.status='error';state.message=errorText(error);}
      return copy(state);
    });
  }
  function coverage(site,definition,kind){
    const keys=definition[`${kind}Keys`]||[],manual=(definition.requiredManualModes||[]).filter(note=>new RegExp(kind==='toric'?'toric|散光':'lvc|lasik|prk|rk','i').test(typeof note==='string'?note:JSON.stringify(note)));
    const eyes=['OD','OS'],missing=eyes.flatMap(eye=>keys.filter(key=>!site.actions.some(action=>action.rows?.some(row=>row.eye===eye&&row.key===key&&row.status==='verified')||action.rows?.some(row=>row.eye==='shared'&&row.key===key&&row.status==='verified'))).map(key=>({eye,key})));
    return {status:keys.length?(missing.length?'needs-manual':'passed'):manual.length?'needs-manual':'not-applicable',keys:[...keys],missing,notes:copy(manual)};
  }
  function summarizeSite(site,definition){site.toric=coverage(site,definition,'toric');site.lvc=coverage(site,definition,'lvc');}
  function pause(site,message){site.status='waiting';state.status='waiting';state.message=message;site.notes.push(message);update();return false;}
  function assertOwned(plan,site){requireValue(ownedTabs.has(site.tabId)&&plan.siteId===site.siteId&&plan.tabId===site.tabId,'合成分頁已離開原定計算入口；請勿在其他分頁執行驗收。');}
  function action(site,eye,step,status,rows=[],counts={},notes=[]){const value={siteId:site.siteId,tabId:site.tabId,eye,step,status,counts,rows,notes};site.actions.push(value);update();return value;}
  async function persistReadback(site,eye,readRows){
    const candidate=caseFromReadRows(readRows,eye);candidate.patient=copy(source.patient);
    await replace(candidate);const result=await save(patientA.id,`SYNTHETIC READ ${site.siteId} ${eye}`);
    await select(patientA.id,result.measurement.id);requireValue(sameData(session.data,candidate),'網站讀回後保存／重新選取的測量不同。');
    await select(patientA.id,measurementA1.id);requireValue(sameData(session.data,source),'網站讀回驗證後無法還原合成來源測量。');
    action(site,eye,'save-and-select','passed',[],{saved:1,selected:1},['僅保存本輪成功填入且逐項讀回一致的合成欄位。']);
  }
  async function scope(site,definition,eye){
    session=await api.loadData();
    requireValue(sameData(session.data,source)&&session.selection?.patientId===patientA.id&&session.selection?.measurementId===measurementA1.id,'隔離工作副本已變更；請重新開始合成驗收，勿帶入其他工作副本。');
    const storedSource=cleanCase(session.data);
    action(site,eye,'load-saved-source','passed',[],{loaded:1},['從隔離儲存重新載入 SYNTHETIC-01，核對後作為此分頁的填入來源。']);
    const options={eye,includeIdentifiers:true,includeConstants:true,eyeConfirmed:false};
    let inventory=await api.inspectTab(site.tabId,storedSource,options,'inspect');assertOwned(inventory,site);
    if(inventory.prerequisite?.status==='required'){site.prerequisite={status:'required',entrySiteId:inventory.prerequisite.entrySiteId};return pause(site,'DGS Toric 需先在 Regular 完成球面 IOL 計算並選 IOL Power，再重試；工具不代按計算。');}
    if(inventory.eyeMode!=='both'&&inventory.canSelectEye&&inventory.detectedEye!==eye&&api.prepareEye){
      await api.prepareEye(site.tabId,storedSource,options);
      inventory=await api.inspectTab(site.tabId,storedSource,options,'inspect');assertOwned(inventory,site);
      action(site,eye,'eye-selection','passed',[],{},['依已核對的原站 radio 選擇眼別並等待表單穩定；沒有代按 Calculate。']);
    }
    action(site,eye,'inspect','passed',[],{fields:inventory.fields?.length||0,manual:inventory.unmappedRequired?.length||0});
    if(inventory.eyeMode!=='both'&&inventory.detectedEye&&inventory.detectedEye!==eye)return pause(site,`請先在此新分頁將網站眼別切換為 ${eye}，再按「重試目前網站」。`);
    if(inventory.eyeMode!=='both'&&!inventory.detectedEye&&!confirmedEyes.has(`${site.tabId}:${eye}`)){site.awaitingEye=eye;return pause(site,`無法自動確認網站眼別。請在此新分頁核對目前為 ${eye}，勾選確認後重試；不會自行假設眼別。`);}
    options.eyeConfirmed=inventory.eyeMode==='both'||inventory.detectedEye===eye||confirmedEyes.has(`${site.tabId}:${eye}`);
    confirmedEyes.delete(`${site.tabId}:${eye}`);
    delete site.awaitingEye;
    async function recheckEye(changed){
      inventory=await api.inspectTab(site.tabId,storedSource,options,'inspect');assertOwned(inventory,site);
      if(inventory.eyeMode==='both')return {ok:true,selected:false};
      if(inventory.detectedEye===eye){options.eyeConfirmed=true;return {ok:true,selected:false};}
      if(!inventory.detectedEye&&!changed?.navigated&&!changed?.eyeReset&&options.eyeConfirmed)return {ok:true,selected:false};
      options.eyeConfirmed=false;
      if(inventory.canSelectEye&&api.prepareEye){
        await api.prepareEye(site.tabId,storedSource,{...options,eyeConfirmed:false});
        inventory=await api.inspectTab(site.tabId,storedSource,options,'inspect');assertOwned(inventory,site);
        if(inventory.detectedEye===eye){options.eyeConfirmed=true;action(site,eye,'eye-selection','passed',[],{},['模式更新後重新選眼並讀回核對。']);return {ok:true,selected:true};}
      }
      if(!inventory.detectedEye)site.awaitingEye=eye;
      pause(site,`模式更新後無法確認 ${eye}；請在原站核對眼別後重試。`);return {ok:false,selected:false};
    }
    if(api.prepareModes){
      let modes=await api.prepareModes(site.tabId,storedSource,options),checked=await recheckEye(modes);
      if(!checked.ok)return false;
      if(checked.selected||modes.eyeReset){
        modes=await api.prepareModes(site.tabId,storedSource,{...options,eyeConfirmed:false});checked=await recheckEye(modes);
        if(!checked.ok)return false;
        if(checked.selected||modes.eyeReset)return pause(site,'眼別與模式反覆互相重設，已停止此步；請在原站核對後重試。');
      }
      const metadata=modes.modePreparation||modes;
      const warnings=(metadata.controls||[]).map(control=>control.reason).filter(Boolean);
      action(site,eye,'prepare-modes',['ready','unsupported'].includes(metadata.status)?'passed':'needs-manual',[],{},warnings);
    }
    if(inventory.inputUnits?.keratometry?.value==='mm'){
      const prepared=await api.inspectTab(site.tabId,storedSource,options,'prepare-input-units');assertOwned(prepared,site);
      inventory=await api.inspectTab(site.tabId,storedSource,options,'inspect');assertOwned(inventory,site);
      const unit=inventory.inputUnits?.keratometry?.value;
      (site.inputUnits||={})[eye]={keratometry:['D','mm'].includes(unit)?unit:'',status:unit==='D'?'prepared':'manual'};
      action(site,eye,'input-units',unit==='D'?'passed':'needs-manual',[],{prepared:unit==='D'?1:0},[unit==='D'?'來源 K1／K2 完整，已切為 D 並準備填入。':'K 單位未能安全準備，保留原值並繼續可對應欄位。']);
    }
    if(api.prepareDisplayPreferences||(inventory.displayPreferences?.cylinderConvention&&inventory.displayPreferences.cylinderConvention.status!=='unsupported')){
      let preferenceResult=api.prepareDisplayPreferences?await api.prepareDisplayPreferences(site.tabId,storedSource,{...options,cylinderConvention:api.cylinderConvention||'minus'}):{status:'manual',requested:'minus'};
      let checked=await recheckEye(preferenceResult);
      if(!checked.ok)return false;
      if(checked.selected&&api.prepareDisplayPreferences){
        preferenceResult=await api.prepareDisplayPreferences(site.tabId,storedSource,{...options,cylinderConvention:api.cylinderConvention||'minus'});
        checked=await recheckEye(preferenceResult);if(!checked.ok)return false;
        if(checked.selected)return pause(site,'柱鏡顯示與眼別反覆重設，請在原站確認後重試。');
      }
      const preference=preferenceResult?.displayPreference||preferenceResult;
      const requested=['minus','plus','preserve'].includes(preference?.requested)?preference.requested:api.cylinderConvention||'minus';
      const value=['minus','plus'].includes(preference?.value)?preference.value:'';
      let prefStatus=['applied','already-selected','preserved','unsupported','manual'].includes(preference?.status)?preference.status:'manual';
      if(['applied','already-selected'].includes(prefStatus)&&value!==requested)prefStatus='manual';
      (site.displayPreferences||={})[eye]={requested,value,status:prefStatus};
      if(prefStatus!=='unsupported')action(site,eye,'display-preference',prefStatus==='manual'?'needs-manual':'passed',[],{selected:value?1:0},[prefStatus==='manual'?'此眼柱鏡顯示尚未驗證，量測欄位仍繼續檢查。':`顯示偏好 ${requested}；目前 ${value||'保留原站'}。`]);
    }
    const plan=await api.inspectTab(site.tabId,storedSource,options,'preview');assertOwned(plan,site);
    const ready=plan.rows.filter(row=>row.status==='ready');
    if(!ready.length){action(site,eye,'preview','needs-manual',[],{ready:0},['請先完成原站的同意、模式或必要選擇；本工具不會代按。']);return pause(site,'尚無可唯一對應的可填欄位；請先準備網站後重試，或略過。');}
    const applied=await api.inspectTab(site.tabId,storedSource,{...options,expected:ready,expectedSiteId:site.siteId,expectedUrl:plan.tabUrl,expectedFrameUrl:plan.url},'apply',plan.frameId);assertOwned(applied,site);
    const read=await api.inspectTab(site.tabId,storedSource,options,'read',plan.frameId);assertOwned(read,site);
    const safeReads=[],rows=plan.rows.map(row=>{
      const sourceExpected=valueFor(row,eye),filled=applied.rows.find(item=>id(item)===id(row)),actual=read.rows.find(item=>id(item)===id(row)&&item.status==='read');
      let expected=sourceExpected;
      if(row.modeControl&&row.key==='biometer'&&row.mappedValue)expected=row.mappedValue;
      if((expected==null||expected==='')&&row.key.startsWith('patient.')&&(plan.profile?.requiredIdentity||[]).includes(row.key)){
        const aliases={initials:['patientId','name'],name:['patientId','initials'],patientId:['name','initials'],surgeonName:['surgeonId'],surgeonId:['surgeonName']};
        expected=(aliases[row.key.slice(8)]||[]).map(key=>source.patient[key]).find(value=>value!=null&&value!=='');
      }
      const expectedValue=expected==null?'':String(expected),matched=row.status==='ready'&&filled?.status==='filled'&&actual&&equal(actual.value,expected);
      if(matched)safeReads.push({...actual,value:expectedValue});
      // Arbitrary page strings (especially identifiers) never enter an export.
      const safeActual=actual?(equal(actual.value,expected)?String(actual.value):'[unexpected value omitted]'):'';
      return {key:row.key,eye:row.eye,expected:expectedValue,...(sourceExpected!=null&&String(sourceExpected)!==expectedValue?{sourceExpected:String(sourceExpected)}:{}),actual:safeActual,status:matched?'verified':row.status!=='ready'?row.status:filled?.status!=='filled'?filled?.status||'not-filled':'readback-mismatch'};
    });
    const verified=rows.filter(row=>row.status==='verified').length;
    const declaredRequired=new Set([...(plan.profile?.required||[]),...(plan.profile?.requiredIdentity||[])]),specialKeys=new Set([...(definition.toricKeys||[]),...(definition.lvcKeys||[])]);
    const liveRequired=row=>(inventory.fields||[]).some(field=>field.key===row.key&&field.required&&(!['OD','OS'].includes(field.eye)||field.eye===row.eye));
    const gaps=rows.filter(row=>row.expected!==''&&row.status!=='verified'),missingRequired=[...declaredRequired].filter(key=>!rows.some(row=>row.key===key&&row.status==='verified'));
    for(const group of plan.profile?.requiredAny||[])if(!group.some(key=>rows.some(row=>row.key===key&&row.status==='verified')))missingRequired.push(group.join('|'));
    const partial=gaps.some(row=>declaredRequired.has(row.key)||specialKeys.has(row.key)||liveRequired(row)||ready.some(item=>id(item)===id(row)))||missingRequired.length>0||!!inventory.unmappedRequired?.length;
    action(site,eye,'fill-and-read',partial?'needs-manual':'passed',rows,{preview:plan.rows.length,ready:ready.length,filled:applied.rows.filter(row=>row.status==='filled').length,verified,unsupportedOptional:gaps.filter(row=>!declaredRequired.has(row.key)&&!specialKeys.has(row.key)&&!liveRequired(row)).length,missingRequired:missingRequired.length},inventory.unmappedRequired?.length?['原站另有未對應的必填控制；請在原站核對，報告不收集其文字內容。']:[]);
    if(safeReads.length)await persistReadback(site,eye,safeReads);
    summarizeSite(site,definition);
    // Missing Toric/LVC and unrelated required controls must not prevent the
    // other eye from being exercised. The enclosing site is still partial.
    return partial?'partial':true;
  }
  function advance(){state.currentIndex++;if(state.currentIndex===state.sites.length){state.status='complete';finishedAt=now();state.message=`${state.sites.length} 個入口均已處理；請依報告區分通過、略過與待人工驗證。`;}else{state.status='idle';state.message='此站已處理。按「驗證下一站」開啟下一個新分頁。';}}
  async function process(retry,{confirmedEye}={}){
    requireValue(state.runId&&state.storageChecks.length===8&&state.storageChecks.every(check=>check.status==='passed'),'請先完成隔離合成資料初始化。');
    if(state.currentIndex>=state.sites.length)return copy(state);
    const site=state.sites[state.currentIndex],definition=QA_SITE_CHECKS[state.currentIndex],profile=SITES.find(profile=>profile.id===site.siteId);
    if(!retry&&site.status==='waiting')return copy(state);
    if(retry)requireValue(ownedTabs.has(site.tabId),'此站尚無本次建立的分頁，請使用「驗證下一站」。');
    if(retry&&site.awaitingEye){if(confirmedEye!==site.awaitingEye)return copy(state);confirmedEyes.add(`${site.tabId}:${confirmedEye}`);action(site,confirmedEye,'eye-confirmation','manual-confirmed',[],{},['使用者已在原站明確核對本次眼別；非自動偵測。']);}
    return exclusive(async()=>{
      site.status='running';state.message=`驗證 ${site.siteId}；只操作本輪建立的合成分頁。`;update();
      try{
        if(!site.tabId){const tab=await api.openSite(profile);requireValue(Number.isSafeInteger(tab?.id)&&!ownedTabs.has(tab.id),'未建立唯一的新合成分頁。');site.tabId=tab.id;ownedTabs.add(tab.id);}
        await api.waitTab(site.tabId);
        const scopes=profile.eyeMode==='both'?['OD','OS','OU']:['OD','OS'];
        let cursor=cursors.get(site.siteId)||0;if(retry&&cursor>=scopes.length)cursor=0;
        let partial=false;
        while(cursor<scopes.length){site.eye=scopes[cursor];const outcome=await scope(site,definition,scopes[cursor]);if(!outcome)return copy(state);if(outcome==='partial')partial=true;cursors.set(site.siteId,++cursor);}
        summarizeSite(site,definition);
        if(partial||scopes.some(eye=>site.actions.findLast(action=>action.step==='fill-and-read'&&action.eye===eye)?.status==='needs-manual')){pause(site,'OD／OS（雙眼表單另含 OD+OS）已逐項檢查；仍有欄位或原站模式未完成，請核對明細後重試或略過。');return copy(state);}
        if(site.toric.status==='needs-manual'||site.lvc.status==='needs-manual'){pause(site,'基本欄位已驗證，特殊模式仍有未驗證項目；可依原站準備後重試，或略過並保留待人工驗證標記。');return copy(state);}
        site.status='passed';advance();return copy(state);
      }catch(error){summarizeSite(site,definition);action(site,site.eye||'OD','operation','blocked',[],{},[errorText(error)]);pause(site,errorText(error));return copy(state);}
    });
  }
  function skipCurrent(){requireValue(!busy,'請等待目前操作完成。');requireValue(state.runId&&state.storageChecks.length===8&&state.storageChecks.every(check=>check.status==='passed')&&state.currentIndex<state.sites.length,'目前沒有可略過的網站。');const site=state.sites[state.currentIndex];site.status='skipped';site.notes.push('使用者略過；未完成項目不視為通過。');summarizeSite(site,QA_SITE_CHECKS[state.currentIndex]);advance();update();return copy(state);}
  function exportReport(){
    const sites=copy(state.sites),steps=sites.flatMap(site=>site.actions),special=kind=>Object.fromEntries(['passed','needs-manual','not-applicable'].map(status=>[status,sites.filter(site=>site[kind]?.status===status).length]));
    const complete=site=>{
      const scopes=SITES.find(profile=>profile.id===site.siteId)?.eyeMode==='both'?['OD','OS','OU']:['OD','OS'];
      return site.status==='passed'&&!Object.values(site.displayPreferences||{}).some(preference=>preference.status==='manual')&&site.toric?.status!=='needs-manual'&&site.lvc?.status!=='needs-manual'&&scopes.every(eye=>{const latest=site.actions.findLast(action=>action.step==='fill-and-read'&&action.eye===eye);return latest?.status==='passed'&&latest.rows.every(row=>row.status==='verified'||row.expected==='')&&site.actions.some(action=>action.step==='save-and-select'&&action.eye===eye&&action.status==='passed');});
    };
    return {format:'biometry-native-qa-v1',runId:state.runId,extensionVersion:String(api.extensionVersion||''),startedAt,finishedAt,status:state.status,currentIndex:state.currentIndex,storageChecks:copy(state.storageChecks),sites,summary:{processed:state.currentIndex,total:sites.length,sitesPassed:sites.filter(site=>site.status==='passed').length,sitesSkipped:sites.filter(site=>site.status==='skipped').length,fieldActionsPassed:steps.filter(step=>step.step==='fill-and-read'&&step.status==='passed').length,storageChecksPassed:state.storageChecks.filter(check=>check.status==='passed').length,toric:special('toric'),lvc:special('lvc'),allPassed:state.status==='complete'&&sites.length===SITES.length&&sites.every(complete)},limitations:['只操作使用者啟動後新建的合成分頁與隔離儲存空間。','只切換已核對的眼別／模式／儀器控制；不代按同意、IOL 選擇或 Calculate；欄位通過不等於公式結果或臨床驗證。','空白、不可見、不可唯一對應及未填入／未讀回一致的特殊模式欄位不視為通過。']};
  }
  return {start,runNext:()=>process(false),retryCurrent:options=>process(true,options),skipCurrent,exportReport,get state(){return copy(state);}};
}

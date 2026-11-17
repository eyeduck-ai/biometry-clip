import { cleanCase, emptyCase, PATIENT_FIELDS, EYE_FIELDS } from './model.js';

const paths = patch => {
  const entries = [];
  for (const key of PATIENT_FIELDS) if (Object.hasOwn(patch.patient || {},key)) entries.push([`patient.${key}`,patch.patient[key]]);
  for (const eye of ['OD','OS']) for (const key of EYE_FIELDS) if (Object.hasOwn(patch.eyes?.[eye] || {},key)) entries.push([`eyes.${eye}.${key}`,patch.eyes[eye][key]]);
  return entries;
};
const toPatch = entries => {
  const patch = {};
  for (const [path,value] of entries) {
    const bits=path.split('.');
    if (bits[0]==='patient') (patch.patient ||= {})[bits[1]]=value;
    else ((patch.eyes ||= {})[bits[1]] ||= {})[bits[2]]=value;
  }
  return patch;
};
const overlay = (record,...maps) => {
  const next=cleanCase(record);
  for (const map of maps) for (const [path,value] of map) {
    const bits=path.split('.');
    if(bits[0]==='patient') next.patient[bits[1]]=value;
    else next.eyes[bits[1]][bits[2]]=value;
  }
  return cleanCase(next);
};

/** Merge server snapshots with this editor's unsent/in-flight field edits. */
export function createEditor(api, { onChange=()=>{}, onStatus=()=>{}, onError=()=>{} } = {}) {
  let latest={data:emptyCase(),revision:-1,caseToken:null};
  let data=emptyCase(),eye='OD',pending=new Map(),inFlight=new Map();
  let running=null,timer=null,version=0,unsubscribe=()=>{},ready=false;
  let error='';
  const status = () => onStatus({saving:!!running,dirty:pending.size>0,error,revision:latest.revision});
  function accept(record,source='sync') {
    if (!record?.data || !Number.isInteger(record.revision)) return;
    if (record.revision < latest.revision) record=latest;
    const changedCase=ready && latest.caseToken!==record.caseToken;
    if(changedCase){pending.clear();inFlight=new Map();clearTimeout(timer);error='';}
    const before=JSON.stringify(data);
    latest={...record,data:cleanCase(record.data)};
    if(!ready){eye=latest.data.activeEye;ready=true;}
    data=overlay(latest.data,inFlight,pending);data.activeEye=eye;
    if(changedCase || before!==JSON.stringify(data)){version++;onChange({source:changedCase?'reset':source,changedCase});}
    status();
  }
  async function init() {
    unsubscribe=api.subscribeCase(record=>accept(record));
    const loaded=await api.loadData();
    accept(loaded,'init');
    return loaded;
  }
  function edit(patch) {
    const entries=paths(patch);
    if(!entries.length)return;
    for(const [key,value] of entries)pending.set(key,value);
    data=overlay(data,new Map(entries));data.activeEye=eye;
    version++;error='';onChange({source:'edit',changedCase:false});status();
    clearTimeout(timer);timer=setTimeout(()=>flush().catch(()=>{}),180);
  }
  async function flush() {
    clearTimeout(timer);
    if(running){await running;if(pending.size)return flush();return latest;}
    if(!pending.size)return latest;
    const task=(async()=>{
      while(pending.size){
        const batch=new Map(pending),token=latest.caseToken;
        pending.clear();inFlight=batch;
        try{
          const result=await api.patchCase(toPatch(batch),token);
          if(token===latest.caseToken)inFlight=new Map();
          error='';
          accept(result);
        }catch(failure){
          inFlight=new Map();
          if(failure.code==='CASE_CHANGED' || failure.code==='REVISION_CHANGED') {
            if(token===latest.caseToken)pending.clear();
            accept(await api.loadData(),'reset');
          }else if(token===latest.caseToken){
            for(const [key,value] of batch)if(!pending.has(key))pending.set(key,value);
            data=overlay(latest.data,pending);data.activeEye=eye;
          }
          error=failure.message || '儲存失敗';onError(failure);throw failure;
        }
      }
      return latest;
    })();
    running=task;status();
    try{return await task;}finally{if(running===task)running=null;status();}
  }
  async function clear() {
    const token=latest.caseToken;
    await flush();
    if(token!==latest.caseToken)throw Object.assign(new Error('個案已變更，請核對後重新執行清除。'),{code:'CASE_CHANGED'});
    const result=await api.clearCase(token);accept(result,'reset');return result;
  }
  function flushOnExit() {
    clearTimeout(timer);
    if(!pending.size)return running || Promise.resolve(latest);
    // Send now: unloading an iframe cannot wait for an earlier acknowledgment.
    // The background service worker serializes this behind the prior message.
    const batch=new Map(pending),token=latest.caseToken;
    pending.clear();
    return api.patchCase(toPatch(batch),token).then(record=>{accept(record);return record;});
  }
  function setEye(value){if(!['OD','OS'].includes(value)||value===eye)return;eye=value;data.activeEye=eye;version++;onChange({source:'eye',changedCase:false});}
  function dispose(){clearTimeout(timer);unsubscribe();}
  return {init,edit,flush,flushOnExit,clear,setEye,dispose,accept,
    get data(){return structuredClone(data);},get eye(){return eye;},get token(){return latest.caseToken;},get revision(){return latest.revision;},get selection(){return structuredClone(latest.selection || null);},get guard(){return `${latest.caseToken}:${version}`;},get dirty(){return pending.size>0||!!running;},
  };
}

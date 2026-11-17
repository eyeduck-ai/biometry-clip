import { cleanCase, emptyCase, validateCase, EYE_FIELDS, PATIENT_FIELDS } from './model.js';
import { SessionConflict } from './session-store.js';

export const LIBRARY_KEY = 'biometryLibrary';
const copy = value => structuredClone(value);
const text = (value,limit=150) => typeof value==='string'||typeof value==='number' ? String(value).trim().slice(0,limit) : '';
const identity = value => cleanCase({patient:value||{},eyes:{OD:{},OS:{}}}).patient;
const validId = value => typeof value==='string' && value.length>0 && value.length<=100;
const date = value => { const valueText=text(value,40);if(!valueText)return '';if(!Number.isFinite(Date.parse(valueText)))throw new Error('測量日期格式不正確。');return new Date(valueText).toISOString(); };

// Import is an append-only library transaction. Check the complete source before
// allocating new IDs or committing; cleanCase alone would silently drop fields.
function validateImportPatients(patients) {
  if(!Array.isArray(patients))throw new Error('匯入病人資料必須是陣列。');
  function shape(value,keys,required=keys){
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key))||required.some(key=>!Object.hasOwn(value,key)))throw new Error('匯入資料包含缺漏、未知或無效欄位，未新增紀錄。');
  }
  function scalar(value,limit){if(!['string','number'].includes(typeof value)||(typeof value==='number'&&!Number.isFinite(value))||String(value).length>limit)throw new Error('匯入資料包含無效或過長數值，未新增紀錄。');}
  function patient(value){shape(value,PATIENT_FIELDS,[]);for(const key of Object.keys(value))scalar(value[key],150);}
  function eyes(value){
    shape(value,['OD','OS']);
    for(const eye of ['OD','OS']){
      shape(value[eye],EYE_FIELDS,[]);
      for(const key of Object.keys(value[eye]))if(['toric','keratoconus'].includes(key)){if(typeof value[eye][key]!=='boolean')throw new Error('匯入 Toric／Keratoconus 必須為 true 或 false。');}else scalar(value[eye][key],100);
    }
    const errors=validateCase(cleanCase({patient:{},eyes:value}));if(errors.length)throw new Error(errors[0]);
  }
  for(const source of patients){
    shape(source,['id','patient','createdAt','updatedAt','measurements']);patient(source.patient);
    if(!Array.isArray(source.measurements))throw new Error('匯入測量資料必須是陣列。');
    for(const item of source.measurements){
      shape(item,['id','label','measuredAt','source','patient','eyes','createdAt','updatedAt']);patient(item.patient);eyes(item.eyes);scalar(item.label,150);scalar(item.source,500);
      for(const key of ['measuredAt','createdAt','updatedAt']){scalar(item[key],40);date(item[key]);}
    }
    for(const key of ['createdAt','updatedAt']){scalar(source[key],40);date(source[key]);}
  }
  return cleanLibrary({version:1,revision:0,patients});
}

export function cleanLibrary(value) {
  if(!value || value.version!==1 || !Number.isSafeInteger(value.revision) || value.revision<0 || !Array.isArray(value.patients)) throw new Error('病人資料庫格式不正確，未覆寫原資料。');
  const ids=new Set(),patients=[];
  for(const source of value.patients) {
    if(!source || !validId(source.id) || ids.has(source.id) || !Array.isArray(source.measurements))throw new Error('病人資料庫包含無效或重複識別碼。');
    ids.add(source.id);const measurements=[],measurementIds=new Set();
    for(const item of source.measurements) {
      if(!item || !validId(item.id) || measurementIds.has(item.id))throw new Error('測量資料包含無效或重複識別碼。');
      measurementIds.add(item.id);
      measurements.push({id:item.id,label:text(item.label)||'未命名測量',measuredAt:date(item.measuredAt),source:text(item.source,500),patient:identity(item.patient??source.patient),eyes:cleanCase({patient:{},eyes:item.eyes}).eyes,createdAt:date(item.createdAt),updatedAt:date(item.updatedAt)});
    }
    patients.push({id:source.id,patient:identity(source.patient),createdAt:date(source.createdAt),updatedAt:date(source.updatedAt),measurements});
  }
  return {version:1,revision:value.revision,patients};
}

/** Persistent saved snapshots; editing the active session never writes here. */
export function createLibraryStore(storage,{newId=()=>crypto.randomUUID(),now=()=>new Date().toISOString(),maxBytes=8*1024*1024}={}) {
  let record,initialization,queue=Promise.resolve();
  async function initialize(){
    if(record)return record;
    if(!initialization)initialization=(async()=>{
      const saved=await storage.get(LIBRARY_KEY);
      record=saved[LIBRARY_KEY]==null?{version:1,revision:0,patients:[]}:cleanLibrary(saved[LIBRARY_KEY]);
      return record;
    })().catch(error=>{initialization=undefined;throw error;});
    return initialization;
  }
  function serialize(work){const task=queue.then(async()=>work(await initialize()));queue=task.catch(()=>{});return task;}
  function guard(current,expected){if(expected!=null&&expected!==current.revision)throw new SessionConflict('LIBRARY_CHANGED','病人資料庫已被其他視窗更新，請重新載入後核對。');}
  function patientIn(current,id){const patient=current.patients.find(p=>p.id===id);if(!patient)throw new Error('找不到所選病人，請重新載入資料庫。');return patient;}
  async function commit(next){
    const clean=cleanLibrary(next);
    if(new TextEncoder().encode(JSON.stringify(clean)).byteLength>maxBytes)throw new Error('本機病人資料庫已達容量上限，請先匯出備份。');
    await storage.set({[LIBRARY_KEY]:clean});record=clean;return copy(clean);
  }
  return {
    read:()=>serialize(current=>copy(current)),
    createPatient:(patient,expectedRevision)=>serialize(async current=>{
      guard(current,expectedRevision);const next=copy(current),at=now();
      const entry={id:newId(),patient:identity(patient),createdAt:at,updatedAt:at,measurements:[]};
      next.patients.push(entry);next.revision++;
      const library=await commit(next);return {library,patient:copy(library.patients.find(p=>p.id===entry.id))};
    }),
    updatePatient:(id,patient,expectedRevision,{updateIdentitySnapshots=false}={})=>serialize(async current=>{
      guard(current,expectedRevision);const next=copy(current),entry=patientIn(next,id);
      entry.patient=identity(patient);entry.updatedAt=now();next.revision++;
      if(updateIdentitySnapshots)for(const measurement of entry.measurements){
        for(const key of ['patientId','name','initials','gender'])measurement.patient[key]=entry.patient[key];
        measurement.updatedAt=entry.updatedAt;
      }
      const library=await commit(next);return {library,patient:copy(library.patients.find(p=>p.id===id))};
    }),
    deletePatient:(id,expectedRevision)=>serialize(async current=>{
      if(expectedRevision==null)throw new SessionConflict('LIBRARY_CHANGED','刪除前需核對病人資料庫版本。');
      guard(current,expectedRevision);patientIn(current,id);
      const next=copy(current);next.patients=next.patients.filter(patient=>patient.id!==id);next.revision++;
      return {library:await commit(next),deletedPatientId:id};
    }),
    deleteMeasurements:(patientId,measurementIds,expectedRevision)=>serialize(async current=>{
      if(expectedRevision==null)throw new SessionConflict('LIBRARY_CHANGED','刪除前需核對病人資料庫版本。');
      guard(current,expectedRevision);const next=copy(current),patient=patientIn(next,patientId);
      if(!Array.isArray(measurementIds)||!measurementIds.length||new Set(measurementIds).size!==measurementIds.length||measurementIds.some(id=>!patient.measurements.some(item=>item.id===id)))throw new Error('所選測量已變更，未刪除任何紀錄。');
      patient.measurements=patient.measurements.filter(item=>!measurementIds.includes(item.id));patient.updatedAt=now();next.revision++;
      return {library:await commit(next),deletedMeasurementIds:copy(measurementIds),patientId};
    }),
    duplicateMeasurement:(patientId,measurementId,expectedRevision)=>serialize(async current=>{
      guard(current,expectedRevision);const next=copy(current),patient=patientIn(next,patientId),original=patient.measurements.find(item=>item.id===measurementId);
      if(!original)throw new Error('找不到所選測量，未建立副本。');
      const at=now(),measurement={...copy(original),id:newId(),label:text(`${original.label} 副本`),createdAt:at,updatedAt:at};
      patient.measurements.push(measurement);patient.updatedAt=at;next.revision++;
      const library=await commit(next);return {library,patient:copy(library.patients.find(item=>item.id===patientId)),measurement:copy(measurement)};
    }),
    importPatients:(patients,expectedRevision)=>serialize(async current=>{
      guard(current,expectedRevision);
      const source=validateImportPatients(patients);
      if(!source.patients.length)return {library:copy(current),imported:[]};
      const next=copy(current),at=now(),imported=[];
      const reserved=new Set([...current.patients,...source.patients].flatMap(patient=>[patient.id,...patient.measurements.map(item=>item.id)]));
      function allocate(){for(let attempt=0;attempt<100;attempt++){const id=newId();if(validId(id)&&!reserved.has(id)){reserved.add(id);return id;}}throw new Error('無法建立新的匯入識別碼，未新增紀錄。');}
      for(const patient of source.patients){
        const entry={...copy(patient),id:allocate(),createdAt:at,updatedAt:at,measurements:[]};
        const mapping={sourcePatientId:patient.id,patientId:entry.id,measurements:[]};
        for(const item of patient.measurements){
          const measurement={...copy(item),id:allocate(),createdAt:at,updatedAt:at};entry.measurements.push(measurement);
          mapping.measurements.push({sourceMeasurementId:item.id,measurementId:measurement.id});
        }
        next.patients.push(entry);imported.push(mapping);
      }
      next.revision++;
      return {library:await commit(next),imported};
    }),
    saveMeasurement:({patientId,measurementId,label,measuredAt,source,data,expectedLibraryRevision})=>serialize(async current=>{
      guard(current,expectedLibraryRevision);const next=copy(current),patient=patientIn(next,patientId),at=now();
      const clean=cleanCase(data);let measurement;
      if(measurementId){
        if(expectedLibraryRevision==null)throw new SessionConflict('LIBRARY_CHANGED','更新既有測量需先核對資料庫版本。');
        measurement=patient.measurements.find(m=>m.id===measurementId);
        if(!measurement)throw new Error('找不到所選測量，未新增或覆寫資料。');
        Object.assign(measurement,{label:text(label)||measurement.label,measuredAt:measuredAt===undefined?measurement.measuredAt:date(measuredAt),source:source===undefined?measurement.source:text(source,500),patient:clean.patient,eyes:clean.eyes,updatedAt:at});
      }else{
        measurement={id:newId(),label:text(label)||`測量 ${patient.measurements.length+1}`,measuredAt:date(measuredAt),source:text(source,500),patient:clean.patient,eyes:clean.eyes,createdAt:at,updatedAt:at};
        patient.measurements.push(measurement);
      }
      patient.updatedAt=at;next.revision++;
      const library=await commit(next),savedPatient=library.patients.find(p=>p.id===patientId);
      return {library,patient:copy(savedPatient),measurement:copy(savedPatient.measurements.find(m=>m.id===measurement.id))};
    }),
    getPatient:id=>serialize(current=>copy(patientIn(current,id))),
    getMeasurement:(patientId,measurementId)=>serialize(current=>{
      const patient=patientIn(current,patientId),measurement=patient.measurements.find(m=>m.id===measurementId);
      if(!measurement)throw new Error('找不到所選測量，請重新載入。');
      const data=emptyCase();data.patient=copy(measurement.patient);data.eyes=copy(measurement.eyes);
      return {patient:copy(patient),measurement:copy(measurement),data};
    }),
  };
}

/** All saved-session checks run while the session queue is locked. */
export function createLibraryService(library,session) {
  return {
    read:()=>library.read(),
    importPatients:(patients,expectedRevision)=>library.importPatients(patients,expectedRevision),
    createPatient:(patient,expectedLibraryRevision)=>library.createPatient(patient,expectedLibraryRevision),
    updatePatient:(patientId,patient,expectedLibraryRevision)=>library.updatePatient(patientId,patient,expectedLibraryRevision),
    editPatient:options=>session.reconcileAfter(options.caseToken,options.revision,async current=>{
      if(options.expectedLibraryRevision==null)throw new SessionConflict('LIBRARY_CHANGED','編輯前需核對病人資料庫版本。');
      const result=await library.updatePatient(options.patientId,options.patient,options.expectedLibraryRevision,{updateIdentitySnapshots:true});
      const active=current.selection?.patientId===options.patientId;
      const patientPatch=Object.fromEntries(['patientId','name','initials','gender'].map(key=>[key,result.patient.patient[key]]));
      return {result,reconcile:active,selection:current.selection,patientPatch};
    },options.clientId),
    deletePatient:options=>session.reconcileAfter(options.caseToken,options.revision,async current=>{
      const result=await library.deletePatient(options.patientId,options.expectedLibraryRevision);
      return {result,reconcile:current.selection?.patientId===options.patientId,selection:undefined};
    },options.clientId),
    deleteMeasurements:options=>session.reconcileAfter(options.caseToken,options.revision,async current=>{
      const result=await library.deleteMeasurements(options.patientId,options.measurementIds,options.expectedLibraryRevision);
      const active=current.selection?.patientId===options.patientId&&options.measurementIds.includes(current.selection.measurementId);
      return {result,reconcile:active,selection:active?{patientId:options.patientId,measurementId:null}:current.selection};
    },options.clientId),
    duplicateMeasurement:options=>session.guardWork(options.caseToken,options.revision,()=>library.duplicateMeasurement(options.patientId,options.measurementId,options.expectedLibraryRevision)),
    saveMeasurement:options=>session.guardWork(options.caseToken,options.revision,async current=>{
      const patient=await library.getPatient(options.patientId);
      if(current.selection?.patientId && current.selection.patientId!==patient.id)throw new SessionConflict('PATIENT_MISMATCH','目前草稿屬於另一位病人；請先選取正確病人。');
      for(const key of ['patientId','name'])if(patient.patient[key]&&current.data.patient[key]&&patient.patient[key].trim()!==current.data.patient[key].trim())throw new SessionConflict('PATIENT_MISMATCH','草稿識別資訊與所選病人不同，請先核對或建立新病人。');
      if(options.data){
        const data=cleanCase(options.data);
        if(JSON.stringify(data.patient)!==JSON.stringify(current.data.patient)||JSON.stringify(data.eyes)!==JSON.stringify(current.data.eyes))throw new SessionConflict('REVISION_CHANGED','草稿已變更，請重新核對後儲存測量。');
      }
      return library.saveMeasurement({...options,data:current.data});
    }),
    activatePatient:(patientId,token,revision,lastWriter)=>session.selectFrom(token,revision,async()=>{
      const patient=await library.getPatient(patientId),data=emptyCase();data.patient=patient.patient;
      return {data,selection:{patientId,measurementId:null}};
    },lastWriter),
    selectMeasurement:(patientId,measurementId,token,revision,lastWriter)=>session.selectFrom(token,revision,async()=>{
      const {data}=await library.getMeasurement(patientId,measurementId);
      return {data,selection:{patientId,measurementId}};
    },lastWriter),
  };
}

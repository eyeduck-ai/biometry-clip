import { cleanCase, emptyCase, validateCase, EYE_FIELDS, NUMERIC_FIELDS, PATIENT_FIELDS } from './model.js';
import { SessionConflict } from './session-store.js';
import {cleanParserReport} from './parser-report.js';

export const LIBRARY_KEY = 'biometryLibrary';
const copy = value => structuredClone(value);
const text = (value,limit=150) => typeof value==='string'||typeof value==='number' ? String(value).trim().slice(0,limit) : '';
const identity = value => cleanCase({patient:value||{},eyes:{OD:{},OS:{}}}).patient;
const validId = value => typeof value==='string' && value.length>0 && value.length<=100;
const date = value => { const valueText=text(value,40);if(!valueText)return '';if(!Number.isFinite(Date.parse(valueText)))throw new Error('測量日期格式不正確。');return new Date(valueText).toISOString(); };

function importShape(value, keys, required=keys) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key))||required.some(key=>!Object.hasOwn(value,key)))throw new Error('匯入資料包含缺漏、未知或無效欄位，未新增紀錄。');
}
function importScalar(value,limit) {
  if(!['string','number'].includes(typeof value)||(typeof value==='number'&&!Number.isFinite(value))||String(value).length>limit)throw new Error('匯入資料包含無效或過長數值，未新增紀錄。');
}
function validateImportIdentity(value) {
  importShape(value,PATIENT_FIELDS,[]);
  for(const key of Object.keys(value))importScalar(value[key],150);
}
function validateImportEyes(value) {
  importShape(value,['OD','OS']);
  for(const eye of ['OD','OS']){
    importShape(value[eye],EYE_FIELDS,[]);
    for(const key of Object.keys(value[eye]))if(['toric','keratoconus'].includes(key)){if(typeof value[eye][key]!=='boolean')throw new Error('匯入 Toric／Keratoconus 必須為 true 或 false。');}else importScalar(value[eye][key],100);
  }
  const errors=validateCase(cleanCase({patient:{},eyes:value}));if(errors.length)throw new Error(errors[0]);
}

// Import is an append-only library transaction. Check the complete source before
// allocating new IDs or committing; cleanCase alone would silently drop fields.
function validateImportPatients(patients) {
  if(!Array.isArray(patients))throw new Error('匯入病人資料必須是陣列。');
  for(const source of patients){
    importShape(source,['id','patient','createdAt','updatedAt','measurements']);validateImportIdentity(source.patient);
    if(!Array.isArray(source.measurements))throw new Error('匯入測量資料必須是陣列。');
    for(const item of source.measurements){
      const keys=['id','label','measuredAt','source','patient','eyes','createdAt','updatedAt'];
      importShape(item,[...keys,'report'],keys);validateImportIdentity(item.patient);validateImportEyes(item.eyes);importScalar(item.label,150);importScalar(item.source,500);
      if(Object.hasOwn(item,'report')&&!cleanParserReport(item.report))throw Object.assign(new Error('匯入報告摘要格式不正確。'),{code:'PARSER_REPORT'});
      for(const key of ['measuredAt','createdAt','updatedAt']){importScalar(item[key],40);date(item[key]);}
    }
    for(const key of ['createdAt','updatedAt']){importScalar(source[key],40);date(source[key]);}
  }
  return cleanLibrary({version:1,revision:0,patients});
}

function validateMeasurementBatch(measurements) {
  const emptyMessage='請至少選擇一筆含有眼部測量值的紀錄。';
  if(!Array.isArray(measurements)||!measurements.length)throw new Error(emptyMessage);
  return measurements.map(item=>{
    importShape(item,['label','measuredAt','source','data'],['data']);
    for(const [key,limit] of [['label',150],['measuredAt',40],['source',500]]){
      if(Object.hasOwn(item,key))importScalar(item[key],limit);
    }
    const {data}=item;
    importShape(data,['version','patient','eyes','activeEye','report'],['patient','eyes']);
    if(Object.hasOwn(data,'version')&&data.version!==1)throw new Error('匯入資料包含缺漏、未知或無效欄位，未新增紀錄。');
    validateImportIdentity(data.patient);
    validateImportEyes(data.eyes);
    const clean=cleanCase(data);
    if(!Object.values(clean.eyes).some(eye=>NUMERIC_FIELDS.some(key=>eye[key]!=null&&eye[key]!=='')))throw new Error(emptyMessage);
    return {
      label:text(item.label)||'未命名測量',measuredAt:date(item.measuredAt),source:text(item.source,500),
      patient:clean.patient,eyes:clean.eyes,...(clean.report?{report:clean.report}:{}),
    };
  });
}

function measurementPatientIds(measurement) {
  const id=measurement.report?.patient_id;
  const reported=id?.value??id?.candidate_value;
  return [measurement.patient.patientId.trim(),typeof reported==='string'?reported.trim():''].filter(Boolean);
}

function savedPatientIds(entry) {
  const id=text(entry.patient.patientId);
  return new Set(id?[id]:entry.measurements.flatMap(measurementPatientIds));
}

function duplicateSourceKey(measurement) {
  if(!measurement.report?.source_sha256)return '';
  return JSON.stringify([measurement.source,measurement.measuredAt,measurement.eyes,measurement.report]);
}

function allocateImportId(reserved,newId) {
  for(let attempt=0;attempt<100;attempt++){
    const id=newId();
    if(validId(id)&&!reserved.has(id)){reserved.add(id);return id;}
  }
  throw new Error('無法建立新的匯入識別碼，未新增紀錄。');
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
      const data=cleanCase({patient:{},eyes:item.eyes,...(Object.hasOwn(item,'report')?{report:item.report}:{})});
      measurements.push({id:item.id,label:text(item.label)||'未命名測量',measuredAt:date(item.measuredAt),source:text(item.source,500),patient:identity(item.patient??source.patient),eyes:data.eyes,...(data.report?{report:data.report}:{}),createdAt:date(item.createdAt),updatedAt:date(item.updatedAt)});
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
      for(const patient of source.patients){
        const entry={...copy(patient),id:allocateImportId(reserved,newId),createdAt:at,updatedAt:at,measurements:[]};
        const mapping={sourcePatientId:patient.id,patientId:entry.id,measurements:[]};
        for(const item of patient.measurements){
          const measurement={...copy(item),id:allocateImportId(reserved,newId),createdAt:at,updatedAt:at};entry.measurements.push(measurement);
          mapping.measurements.push({sourceMeasurementId:item.id,measurementId:measurement.id});
        }
        next.patients.push(entry);imported.push(mapping);
      }
      next.revision++;
      return {library:await commit(next),imported};
    }),
    importMeasurements:({patientId,patient={},measurements,expectedLibraryRevision}={})=>serialize(async current=>{
      if(expectedLibraryRevision==null)throw new SessionConflict('LIBRARY_CHANGED','病人資料庫已被其他視窗更新，請重新載入後核對。');
      guard(current,expectedLibraryRevision);
      validateImportIdentity(patient);
      const incoming=validateMeasurementBatch(measurements);
      const reportIds=new Set(incoming.flatMap(measurementPatientIds));
      if(reportIds.size>1)throw new SessionConflict('PATIENT_MISMATCH','匯入測量的病人 ID 不一致，請分開匯入。');
      const [sourceId='']=reportIds;
      const enteredId=text(patient.patientId);
      const next=copy(current),at=now();
      const reserved=new Set(next.patients.flatMap(entry=>[entry.id,...entry.measurements.map(item=>item.id)]));
      let destination;
      if(patientId){
        destination=patientIn(next,patientId);
        if(new Set([...savedPatientIds(destination),sourceId,enteredId].filter(Boolean)).size>1){
          throw new SessionConflict('PATIENT_MISMATCH','所選病人與報告的病人 ID 不一致。');
        }
      }else{
        if(sourceId&&enteredId&&sourceId!==enteredId)throw new SessionConflict('PATIENT_MISMATCH','所選病人與報告的病人 ID 不一致。');
        const externalId=enteredId||sourceId;
        if(!externalId&&!text(patient.name))throw new Error('請選擇一位病人，或輸入病人 ID／代稱。');
        if(externalId&&next.patients.some(entry=>{
          const known=savedPatientIds(entry);
          return known.size===1&&known.has(externalId);
        })){
          throw new SessionConflict('PATIENT_MISMATCH','請選擇資料庫中已有相同 ID 的病人。');
        }
        const identitySnapshot=identity({...patient,patientId:externalId});
        destination={id:allocateImportId(reserved,newId),patient:identitySnapshot,createdAt:at,updatedAt:at,measurements:[]};
        next.patients.push(destination);
      }
      const duplicates=new Set(destination.measurements.map(duplicateSourceKey).filter(Boolean));
      let importedCount=0,skippedDuplicateCount=0;
      for(const measurement of incoming){
        const key=duplicateSourceKey(measurement);
        if(key&&duplicates.has(key)){skippedDuplicateCount++;continue;}
        if(key)duplicates.add(key);
        const snapshot={...destination.patient};
        for(const field of PATIENT_FIELDS)if(measurement.patient[field].trim())snapshot[field]=measurement.patient[field];
        snapshot.patientId=text(snapshot.patientId)||sourceId;
        destination.measurements.push({...measurement,patient:snapshot,id:allocateImportId(reserved,newId),createdAt:at,updatedAt:at});
        importedCount++;
      }
      if(!importedCount)return {library:copy(current),patientId:destination.id,importedCount,skippedDuplicateCount};
      destination.updatedAt=at;
      next.revision++;
      return {library:await commit(next),patientId:destination.id,importedCount,skippedDuplicateCount};
    }),
    saveMeasurement:({patientId,measurementId,label,measuredAt,source,data,expectedLibraryRevision})=>serialize(async current=>{
      guard(current,expectedLibraryRevision);const next=copy(current),patient=patientIn(next,patientId),at=now();
      const clean=cleanCase(data);let measurement;
      if(measurementId){
        if(expectedLibraryRevision==null)throw new SessionConflict('LIBRARY_CHANGED','更新既有測量需先核對資料庫版本。');
        measurement=patient.measurements.find(m=>m.id===measurementId);
        if(!measurement)throw new Error('找不到所選測量，未新增或覆寫資料。');
        Object.assign(measurement,{label:text(label)||measurement.label,measuredAt:measuredAt===undefined?measurement.measuredAt:date(measuredAt),source:source===undefined?measurement.source:text(source,500),patient:clean.patient,eyes:clean.eyes,updatedAt:at});
        if(clean.report)measurement.report=clean.report;else delete measurement.report;
      }else{
        measurement={id:newId(),label:text(label)||`測量 ${patient.measurements.length+1}`,measuredAt:date(measuredAt),source:text(source,500),patient:clean.patient,eyes:clean.eyes,...(clean.report?{report:clean.report}:{}),createdAt:at,updatedAt:at};
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
      if(measurement.report)data.report=copy(measurement.report);
      return {patient:copy(patient),measurement:copy(measurement),data};
    }),
  };
}

/** All saved-session checks run while the session queue is locked. */
export function createLibraryService(library,session) {
  return {
    read:()=>library.read(),
    importPatients:(patients,expectedRevision)=>library.importPatients(patients,expectedRevision),
    importMeasurements:options=>library.importMeasurements(options),
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
        if(JSON.stringify(data.patient)!==JSON.stringify(current.data.patient)||JSON.stringify(data.eyes)!==JSON.stringify(current.data.eyes)||JSON.stringify(data.report)!==JSON.stringify(current.data.report))throw new SessionConflict('REVISION_CHANGED','草稿已變更，請重新核對後儲存測量。');
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

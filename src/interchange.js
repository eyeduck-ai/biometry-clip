import {cleanCase,validateCase,FIELD_GROUPS,NUMERIC_FIELDS,EYE_FIELDS,PATIENT_FIELDS} from './model.js';
import {cleanLibrary} from './library-store.js';
import {isParserDocument,importParserDocument,isVghksParserBatch,importVghksParserBatch} from './parser-interchange.js';
import {cleanParserReport} from './parser-report.js';

export const INTERCHANGE_FORMAT='biometry-clipboard';
export const INTERCHANGE_VERSION='1.3';
export const INTERCHANGE_REPORT_VERSION='1.4';
export const INTERCHANGE_UNITS=Object.freeze(Object.fromEntries([
  ...FIELD_GROUPS.flatMap(group=>group.fields.map(([key,,,unit])=>[key,unit==='µm'?'um':unit==='°'?'deg':unit||'1'])),
  ['patient.age','year'],
]));
// Version 1.0's vocabulary is frozen. New planned IOL power is not an alias
// for implanted/fellow IOL power, and must carry its own v1.1 unit declaration.
const addedInV1_1=new Set(['plannedIolPower']);
const addedInV1_2=new Set(['iolSourceSite','iolSourceValue','iolSourceLabel','iolCatalogId','keratoconus','posteriorBiometer']);
const addedInV1_3=new Set(['iolSourceControl','iolSourceManufacturer','iolSourceRole']);
const eyeFieldsV1_2=Object.freeze(EYE_FIELDS.filter(key=>!addedInV1_3.has(key)));
const eyeFieldsV1_1=Object.freeze(eyeFieldsV1_2.filter(key=>!addedInV1_2.has(key)));
const eyeFieldsV1_0=Object.freeze(eyeFieldsV1_1.filter(key=>!addedInV1_1.has(key)));
const patientFieldsV1_1=Object.freeze(PATIENT_FIELDS.filter(key=>key!=='initials'));
export const INTERCHANGE_UNITS_V1_0=Object.freeze(Object.fromEntries(Object.entries(INTERCHANGE_UNITS).filter(([key])=>!addedInV1_1.has(key))));
export const INTERCHANGE_UNITS_BY_VERSION=Object.freeze({'1.0':INTERCHANGE_UNITS_V1_0,'1.1':INTERCHANGE_UNITS,'1.2':INTERCHANGE_UNITS,'1.3':INTERCHANGE_UNITS,'1.4':INTERCHANGE_UNITS});
const own=(object,key)=>Object.hasOwn(object,key);
const copy=value=>structuredClone(value);
const numeric=new Set(NUMERIC_FIELDS);
const decimal=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const procedure=new Set(['','none','myopic','hyperopic','rk','keratoconus','unknown']);

export class InterchangeError extends Error {
  constructor(code,message){super(message);this.name='InterchangeError';this.code=code;}
}
const fail=(code,message)=>{throw new InterchangeError(code,message);};
function object(value,path,keys,required=[]) {
  if(!value||typeof value!=='object'||Array.isArray(value))fail('INTERCHANGE_SHAPE',`${path} 必須是物件。`);
  if(Object.keys(value).some(key=>!keys.includes(key)))fail('INTERCHANGE_FIELD',`${path} 包含此版本未支援的欄位。`);
  if(required.some(key=>!own(value,key)))fail('INTERCHANGE_SHAPE',`${path} 缺少必要結構。`);
}
function text(value,path,max=150) {
  if(!['string','number'].includes(typeof value)||(typeof value==='number'&&!Number.isFinite(value)))fail('INTERCHANGE_VALUE',`${path} 必須是文字或有限數值。`);
  const result=String(value);
  if(result.length>max)fail('INTERCHANGE_VALUE',`${path} 內容過長，未截斷或匯入。`);
  return result;
}
function plainNumber(value) {
  const source=String(value);
  if(!/[eE]/.test(source))return source;
  const [mantissa,exponentText]=source.toLowerCase().split('e'),exponent=Number(exponentText);
  const negative=mantissa.startsWith('-'),unsigned=negative?mantissa.slice(1):mantissa;
  const [integer,fraction='']=unsigned.split('.'),digits=integer+fraction,point=integer.length+exponent;
  const expanded=point<=0?`0.${'0'.repeat(-point)}${digits}`:point>=digits.length?digits+'0'.repeat(point-digits.length):`${digits.slice(0,point)}.${digits.slice(point)}`;
  return `${negative?'-':''}${expanded}`;
}
function numberText(value,path) {
  if(typeof value==='number'){
    if(!Number.isFinite(value))fail('INTERCHANGE_VALUE',`${path} 不是有限數值。`);
    value=plainNumber(value);
  }
  const result=text(value,path,100);
  if(result!==''&&(!decimal.test(result)||!Number.isFinite(Number(result))))fail('INTERCHANGE_VALUE',`${path} 必須是無單位的十進位數值。`);
  return result;
}
function identity(value,path,patientFields=PATIENT_FIELDS) {
  object(value,path,patientFields);
  const result={};
  for(const key of Object.keys(value)){
    result[key]=key==='age'?numberText(value[key],`${path}.${key}`):text(value[key],`${path}.${key}`);
    if(key==='age'&&result[key]!==''&&Number(result[key])<0)fail('INTERCHANGE_VALUE',`${path}.age 不可小於 0。`);
  }
  return result;
}
function eyes(value,path,eyeFields=EYE_FIELDS) {
  object(value,path,['OD','OS'],['OD','OS']);
  const result={OD:{},OS:{}};
  for(const eye of ['OD','OS']){
    object(value[eye],`${path}.${eye}`,eyeFields);
    for(const key of Object.keys(value[eye])){
      const entry=value[eye][key],field=`${path}.${eye}.${key}`;
      if(['toric','keratoconus'].includes(key)){
        if(typeof entry!=='boolean')fail('INTERCHANGE_VALUE',`${field} 必須為 true 或 false。`);
        result[eye][key]=entry;
      }else result[eye][key]=numeric.has(key)?numberText(entry,field):text(entry,field,100);
      if(key==='lvcType'&&(!procedure.has(result[eye][key])||(result[eye][key]==='unknown'&&!eyeFields.includes('keratoconus'))))fail('INTERCHANGE_VALUE',`${field} 是未支援的手術類型。`);
      if(key==='argos'&&!['','yes','no'].includes(result[eye][key]))fail('INTERCHANGE_VALUE',`${field} 必須為 yes、no 或空白。`);
    }
  }
  const errors=validateCase(cleanCase({patient:{},eyes:result}));
  if(errors.length)fail('INTERCHANGE_VALUE',errors[0]);
  return result;
}
function sameStructure(left,right){
  if(left===right)return true;
  if(!left||!right||typeof left!=='object'||typeof right!=='object'||Array.isArray(left)!==Array.isArray(right))return false;
  const a=Object.keys(left).sort(),b=Object.keys(right).sort();
  return a.length===b.length&&a.every((key,index)=>key===b[index]&&sameStructure(left[key],right[key]));
}
function reportData(value,path){
  let report;
  try{report=cleanParserReport(value);}catch{fail('INTERCHANGE_REPORT',`${path} 報告摘要格式不正確，未匯入。`);}
  if(!report||!sameStructure(value,report))fail('INTERCHANGE_REPORT',`${path} 包含非標準、原始或無效報告欄位，未匯入。`);
  return report;
}
function caseData(value,{eyeFields=EYE_FIELDS,patientFields=PATIENT_FIELDS,allowReport=false}={}) {
  object(value,'case',['version','patient','eyes','activeEye',...(allowReport?['report']:[])],['version','patient','eyes','activeEye']);
  if(value.version!==1)fail('INTERCHANGE_VERSION','不支援這個個案資料版本。');
  if(!['OD','OS'].includes(value.activeEye))fail('INTERCHANGE_EYE','activeEye 必須是 OD 或 OS；不會推測眼別。');
  return cleanCase({version:1,patient:identity(value.patient,'case.patient',patientFields),eyes:eyes(value.eyes,'case.eyes',eyeFields),activeEye:value.activeEye,...(own(value,'report')?{report:reportData(value.report,'case.report')}:{})});
}
function dateTime(value,path,{empty=false}={}) {
  if(value===''&&empty)return '';
  if(typeof value!=='string'||value.length>40)fail('INTERCHANGE_DATE',`${path} 必須是含時區的日期時間。`);
  const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if(!match||!Number.isFinite(Date.parse(value)))fail('INTERCHANGE_DATE',`${path} 必須是含時區的日期時間。`);
  const [,year,month,day,hour,minute,second]=match.map(Number);
  if(month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate()||hour>23||minute>59||second>59)fail('INTERCHANGE_DATE',`${path} 日期時間不正確。`);
  return new Date(value).toISOString();
}
function recordId(value,path) {
  if(typeof value!=='string'||!value.length||value.length>100)fail('INTERCHANGE_ID',`${path} 必須是非空白的文字識別碼。`);
  return value;
}
function libraryData(value,{envelope=false,eyeFields=EYE_FIELDS,patientFields=PATIENT_FIELDS,allowReport=false}={}) {
  const source=envelope?{version:1,revision:0,patients:value}:value;
  object(source,'library',['version','revision','patients'],['version','revision','patients']);
  if(source.version!==1)fail('INTERCHANGE_VERSION','不支援這個病人資料庫版本。');
  if(!Number.isSafeInteger(source.revision)||source.revision<0||!Array.isArray(source.patients))fail('INTERCHANGE_SHAPE','病人資料庫結構不正確。');
  const patients=source.patients.map((patient,index)=>{
    const path=`patients[${index}]`;
    object(patient,path,['id','patient','createdAt','updatedAt','measurements'],['id','patient','createdAt','updatedAt','measurements']);
    if(!Array.isArray(patient.measurements))fail('INTERCHANGE_SHAPE',`${path}.measurements 必須是陣列。`);
    return {id:recordId(patient.id,`${path}.id`),patient:identity(patient.patient,`${path}.patient`,patientFields),createdAt:dateTime(patient.createdAt,`${path}.createdAt`,{empty:true}),updatedAt:dateTime(patient.updatedAt,`${path}.updatedAt`,{empty:true}),measurements:patient.measurements.map((measurement,number)=>{
      const item=`${path}.measurements[${number}]`;
      object(measurement,item,['id','label','measuredAt','source','patient','eyes','createdAt','updatedAt',...(allowReport?['report']:[])],['id','label','measuredAt','source','patient','eyes','createdAt','updatedAt']);
      return {id:recordId(measurement.id,`${item}.id`),label:text(measurement.label,`${item}.label`),measuredAt:dateTime(measurement.measuredAt,`${item}.measuredAt`,{empty:true}),source:text(measurement.source,`${item}.source`,500),patient:identity(measurement.patient,`${item}.patient`,patientFields),eyes:eyes(measurement.eyes,`${item}.eyes`,eyeFields),createdAt:dateTime(measurement.createdAt,`${item}.createdAt`,{empty:true}),updatedAt:dateTime(measurement.updatedAt,`${item}.updatedAt`,{empty:true}),...(own(measurement,'report')?{report:reportData(measurement.report,`${item}.report`)}:{})};
    })};
  });
  try{return cleanLibrary({version:1,revision:source.revision,patients});}
  catch{fail('INTERCHANGE_ID','病人或測量識別碼重複，未匯入。');}
}
function metadata(kind,now,schemaVersion=INTERCHANGE_VERSION) {
  return {format:INTERCHANGE_FORMAT,schemaVersion,kind,exportedAt:dateTime(typeof now==='function'?now():now??new Date().toISOString(),'exportedAt'),units:copy(INTERCHANGE_UNITS)};
}

/** Portable data only. No Chrome APIs, API keys, session tokens, or writes. */
export function exportCaseDocument(data,{now}={}) {
  const value=caseData(data,{allowReport:true});
  return {...metadata('case',now,value.report?INTERCHANGE_REPORT_VERSION:INTERCHANGE_VERSION),case:value};
}
export function exportLibraryDocument(data,{now}={}) {
  const {patients}=libraryData(data,{allowReport:true});
  const hasReport=patients.some(patient=>patient.measurements.some(measurement=>own(measurement,'report')));
  return {...metadata('library',now,hasReport?INTERCHANGE_REPORT_VERSION:INTERCHANGE_VERSION),patients};
}
export function parseInterchange(input) {
  let value=input;
  if(typeof value==='string'){
    try{value=JSON.parse(value.replace(/^\uFEFF/,''));}catch{fail('INTERCHANGE_JSON','JSON 無法解析，未匯入。');}
  }
  if(!value||typeof value!=='object'||Array.isArray(value))fail('INTERCHANGE_SHAPE','JSON 必須是 Biometry-Clip 資料物件。');
  if(!own(value,'format')&&isVghksParserBatch(value))return importVghksParserBatch(value);
  if(!own(value,'format')&&isParserDocument(value))return importParserDocument(value);
  if(own(value,'format')){
    if(value.format!==INTERCHANGE_FORMAT)fail('INTERCHANGE_FORMAT','這不是病人或量測交換資料；原生 QA 報告不能當作病人資料匯入。');
    if(typeof value.schemaVersion!=='string'||!Object.hasOwn(INTERCHANGE_UNITS_BY_VERSION,value.schemaVersion))fail('INTERCHANGE_VERSION','不支援這個 JSON schemaVersion，未推測或轉換。');
    const units=INTERCHANGE_UNITS_BY_VERSION[value.schemaVersion],eyeFields=value.schemaVersion==='1.0'?eyeFieldsV1_0:value.schemaVersion==='1.1'?eyeFieldsV1_1:value.schemaVersion==='1.2'?eyeFieldsV1_2:EYE_FIELDS,patientFields=['1.2','1.3','1.4'].includes(value.schemaVersion)?PATIENT_FIELDS:patientFieldsV1_1,allowReport=value.schemaVersion==='1.4';
    if(!['case','library'].includes(value.kind))fail('INTERCHANGE_KIND','JSON kind 必須是 case 或 library。');
    const payload=value.kind==='case'?'case':'patients';
    object(value,'document',['format','schemaVersion','kind','exportedAt','units',payload],['format','schemaVersion','kind','exportedAt','units',payload]);
    dateTime(value.exportedAt,'exportedAt');
    object(value.units,'units',Object.keys(units),Object.keys(units));
    if(Object.entries(units).some(([key,unit])=>value.units[key]!==unit))fail('INTERCHANGE_UNITS','JSON 單位與此版本不符，未自動換算。CCT 須為 um，AL／ACD／LT／WTW 須為 mm。');
    return {kind:value.kind,data:value.kind==='case'?caseData(value.case,{eyeFields,patientFields,allowReport}):libraryData(value.patients,{envelope:true,eyeFields,patientFields,allowReport}),warnings:[]};
  }
  const warnings=['舊版 JSON 沒有明示單位；依原專案定義讀取（CCT 為 um，其餘依交換文件）。不做單位或眼別推測。'];
  if(own(value,'eyes'))return {kind:'case',data:caseData(value),warnings};
  if(own(value,'patients'))return {kind:'library',data:libraryData(value),warnings};
  fail('INTERCHANGE_FORMAT','無法辨識 JSON 資料格式；請使用個案、病人資料庫或 biometry-parser 輸出。');
}

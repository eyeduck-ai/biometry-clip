import { createSessionStore,isTrustedPanelSender } from '../session-store.js';
import { createLibraryStore,createLibraryService } from '../library-store.js';

const SESSION_KEYS=Object.freeze({biometrySession:'biometryQa:biometrySession',biometryCase:'biometryQa:biometryCase'});
const LOCAL_KEYS=Object.freeze({biometryLibrary:'biometryQa:biometryLibrary'});
const failure=(code,message)=>Object.assign(new Error(message),{code});

// The production services see their normal keys. This adapter can map only the
// fixed QA keys below; an RPC payload never controls an underlying storage key.
export function createQaStorage(storage,area) {
  const mapping=area==='session'?SESSION_KEYS:area==='local'?LOCAL_KEYS:null;
  if(!mapping)throw new Error('無效的 QA 儲存區。');
  function mappedKey(key){if(typeof key!=='string'||!Object.hasOwn(mapping,key))throw failure('QA_STORAGE_KEY','QA 儲存鍵不在允許範圍。');return mapping[key];}
  return {
    async get(keys){
      const requested=typeof keys==='string'?[keys]:keys;
      if(!Array.isArray(requested))throw failure('QA_STORAGE_KEY','QA 儲存讀取必須列出已知鍵。');
      const physical=requested.map(mappedKey),saved=await storage.get(physical),result={};
      requested.forEach((key,index)=>{if(Object.hasOwn(saved,physical[index]))result[key]=saved[physical[index]];});
      return result;
    },
    async set(values){
      if(!values||typeof values!=='object'||Array.isArray(values))throw failure('QA_STORAGE_KEY','無效的 QA 儲存內容。');
      const mapped=Object.fromEntries(Object.entries(values).map(([key,value])=>[mappedKey(key),value]));
      await storage.set(mapped);
    },
  };
}

export function isTrustedQaSender(sender,extensionId) {
  if(!isTrustedPanelSender(sender,extensionId))return false;
  const query=new URL(sender.url).searchParams;
  return query.getAll('view').length===1&&query.get('view')==='qa';
}

export function createQaBackend(storage,extensionId) {
  const session=createSessionStore(createQaStorage(storage.session,'session'));
  const library=createLibraryService(createLibraryStore(createQaStorage(storage.local,'local')),session);
  return {
    async request(message,sender){
      if(!isTrustedQaSender(sender,extensionId))throw failure('UNTRUSTED_QA_SENDER','只有擴充功能 QA 工具頁能使用隔離測試資料。');
      const operations={
        'biometry:qa:session:read':()=>session.read(),
        'biometry:qa:session:replace':()=>session.replace(message.data,message.caseToken,message.revision,message.clientId),
        'biometry:qa:session:patch':()=>session.patch(message.patch,message.caseToken,message.clientId),
        'biometry:qa:session:clear':()=>session.clear(message.caseToken,message.clientId),
        'biometry:qa:library:read':()=>library.read(),
        'biometry:qa:library:create-patient':()=>library.createPatient(message.patient,message.expectedLibraryRevision),
        'biometry:qa:library:save-measurement':()=>library.saveMeasurement(message.options),
        'biometry:qa:library:activate-patient':()=>library.activatePatient(message.patientId,message.caseToken,message.revision,message.clientId),
        'biometry:qa:library:select-measurement':()=>library.selectMeasurement(message.patientId,message.measurementId,message.caseToken,message.revision,message.clientId),
      };
      if(!Object.hasOwn(operations,message?.type))throw failure('UNKNOWN_QA_OPERATION','不支援的隔離 QA 操作。');
      const operation=operations[message.type];
      const value=await operation();
      return message.type.startsWith('biometry:qa:session:')?{session:value}:{result:value};
    },
  };
}

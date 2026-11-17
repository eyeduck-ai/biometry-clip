/** Site values identify a selected option, not a universal clinical lens. */
export const LENS_CATALOG_FORMAT='biometry-lens-catalog';
export const LENS_CATALOG_VERSION='1.1';
export const LENS_SOURCE_DEFINITIONS=Object.freeze({
  evo:{siteId:'evo',url:'https://www.evoiolcalculator.com/Calculator.aspx',allowedHosts:['evoiolcalculator.com'],control:'native-select',selector:'#DropDownIOLModel',navigationExpected:true,geometryValues:['Standard'],familyValues:['Tecnis','AR40e/E/M','Vivity','Panoptix','Aspire','Beyond','Envy','LuxGood','LuxSmart','LuxLife','Eyhance','PureSee','Synergy','Odyssey','EMV','Galaxy','PU6A/AS','PN6A/AS','409M/MP','509M/MP','621P/PY'],parameters:[{key:'aConstant',selector:'#txtAConstant',unit:'1'}]},
  'evo-toric':{siteId:'evo-toric',url:'https://www.evoiolcalculator.com/Toric.aspx',allowedHosts:['evoiolcalculator.com'],control:'native-select',selector:'#DropDownToric',navigationExpected:true,geometryValues:['Posterior','Anterior','Bitoric'],familyValues:['Tecnis','SA6ATx','SN6ATx','CNW0Tx','Vivity','Panoptix','MX60T','MX60ET','Aspire','Envy','LuxGood','LuxSmart','LuxLife','ZCU','Eyhance','PureSee','Synergy','Odyssey','Kowa','Nidek','EMV','Galaxy','Simedice','709M/MP','929M/MP','939M/MP'],parameters:[{key:'aConstant',selector:'#txtAConstant',unit:'1'}]},
  'tecnis-toric':{siteId:'tecnis-toric',url:'https://tecnistoriccalc.com/calculator/',control:'custom-family',selector:'.lens-select a[data-bs-attribute]',valueAttribute:'data-bs-attribute',labelSelector:'img[alt]',selectedSelector:'#lens',parameters:[{key:'constantFactor',selector:'#constantFactor',unit:'site-defined',methodSelector:'#constantFactorLabel'}]},
});

/** Self-contained, read-only function for chrome.scripting.executeScript. */
export function lensSourcesBridge(definition) {
  const result={siteId:definition?.siteId||'',status:'unavailable',options:[],selected:null,parameters:[]};
  if(!definition||!['native-select','custom-family'].includes(definition.control))return result;
  const expected=new URL(definition.url),actual=new URL(location.href);
  if(actual.protocol!=='https:'||![expected.hostname,...(definition.allowedHosts||[])].includes(actual.hostname)||decodeURIComponent(actual.pathname).toLowerCase()!==decodeURIComponent(expected.pathname).toLowerCase())return result;
  const shown=node=>!!node&&node.type!=='hidden'&&!node.hidden&&node.getClientRects().length>0&&!['hidden','collapse'].includes(getComputedStyle(node).visibility);
  const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
  const one=selector=>{try{const nodes=[...document.querySelectorAll(selector)];return nodes.length===1?nodes[0]:null;}catch{return null;}};
  const kind=value=>(definition.geometryValues||[]).includes(value)?'geometry':definition.control==='custom-family'||(definition.familyValues||[]).includes(value)?'family':'model';
  let nodes;
  try{nodes=[...document.querySelectorAll(definition.selector)];}catch{return result;}
  if(definition.control==='native-select'){
    if(nodes.length!==1||nodes[0].tagName!=='SELECT'||!shown(nodes[0])||nodes[0].multiple)return result;
    const select=nodes[0];
    result.options=[...select.options].map(option=>({value:clean(option.value),label:clean(option.label||option.textContent),kind:kind(clean(option.value)),available:!select.disabled&&!option.disabled&&!option.parentElement?.disabled})).filter(option=>option.value&&option.label);
    const selected=[...select.selectedOptions];
    if(selected.length===1){const value=clean(selected[0].value),label=clean(selected[0].label||selected[0].textContent),matches=result.options.filter(option=>option.value===value&&option.label===label);if(matches.length===1)result.selected={value,label,kind:matches[0].kind};}
  }else{
    result.options=nodes.map(node=>({value:clean(node.getAttribute(definition.valueAttribute)),label:clean(node.querySelector(definition.labelSelector)?.getAttribute('alt')||node.textContent),kind:'family',available:shown(node)&&node.getAttribute('aria-disabled')!=='true'})).filter(option=>option.value&&option.label);
    // This allowlisted hidden value is the site's selected lens family. Read it
    // only when it agrees with one published, explicitly labelled menu entry.
    const selected=one(definition.selectedSelector),matches=result.options.filter(option=>option.value===clean(selected?.value));
    if(selected&&matches.length===1)result.selected={value:matches[0].value,label:matches[0].label,kind:'family'};
  }
  if(!result.options.length)return result;
  result.status='read';result.control=definition.control;result.url=actual.origin+actual.pathname;result.capturedAt=new Date().toISOString();result.navigationExpected=!!definition.navigationExpected;
  if(result.selected)for(const parameter of definition.parameters||[]){
    const node=one(parameter.selector),value=clean(node?.value);
    if(!shown(node)||!value||!Number.isFinite(Number(value))||!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))continue;
    const record={key:parameter.key,value,unit:parameter.unit,sourceControl:parameter.selector};
    if(parameter.methodSelector){const method=one(parameter.methodSelector);if(!shown(method))continue;record.method=clean(method.textContent);}
    result.parameters.push(record);
  }
  return result;
}

/** Add these rows only to a website read, never its ordinary numeric fill. */
export function buildLensReadRows(profile,snapshot,eye) {
  if(snapshot?.status!=='read'||snapshot.siteId!==profile?.id||!snapshot.selected||!['OD','OS','OU'].includes(eye))return [];
  const selected=snapshot.options.filter(option=>option.value===snapshot.selected.value&&option.label===snapshot.selected.label);
  if(selected.length!==1)return [];
  const rowEye=['OD','OS'].includes(snapshot.eye)?snapshot.eye:profile.eyeMode==='both'?'shared':eye;
  const context={...(snapshot.controlId?{iolSourceControl:snapshot.controlId}:{}),...(snapshot.manufacturer?{iolSourceManufacturer:snapshot.manufacturer}:{}),...(snapshot.role?{iolSourceRole:snapshot.role}:{})};
  return Object.entries({iolSourceSite:profile.id,iolSourceValue:snapshot.selected.value,iolSourceLabel:snapshot.selected.label,...context}).map(([key,value])=>({eye:rowEye,key,label:key,value,status:'read'}));
}

const fail=message=>{throw new Error(message);};
const clone=value=>structuredClone(value);
const own=(value,key)=>Object.hasOwn(value,key);
const baseSourceKeys=['siteId','url','capturedAt','control','options','selected','parameters'];
const contextKeys=['controlId','eye','formula','role','manufacturer'];
const baseAliasKeys=['siteId','value','label','evidenceUrl','verifiedAt'];
const aliasContextKeys=['controlId','manufacturer','role'];
const string=(value,name,max=150)=>{if(typeof value!=='string'||!value.trim()||value.length>max)fail(`${name} 必須是非空白文字（最多 ${max} 字）。`);return value;};
function shape(value,keys,name,required=keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key))||required.some(key=>!own(value,key)))fail(`${name} 結構不正確。`);}
function date(value){string(value,'日期',40);if(!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))fail('日期必須含時區。');return new Date(value).toISOString();}
function url(value){const result=new URL(string(value,'來源網址',500));if(result.protocol!=='https:'||result.username||result.password||result.search||result.hash)fail('來源網址須為無個人資料參數的 HTTPS 網址。');return result.href;}
function context(value,keys){for(const key of keys)if(own(value,key))string(value[key],key,100);if(own(value,'eye')&&!['OD','OS','shared'].includes(value.eye))fail('晶體來源眼別不正確。');}
function option(value,version){shape(value,['value','label','kind','available'],'晶體選項');string(value.value,'選項值',100);string(value.label,'選項名稱',100);if(!(version==='1.0'?['model','family','geometry']:['model','family','group','geometry']).includes(value.kind)||typeof value.available!=='boolean')fail('晶體選項類型不正確。');return clone(value);}
function snapshotParameter(parameter,version){
  const keys=['key','value','unit','sourceControl','method',...(version==='1.1'?['formula']:[])];
  shape(parameter,keys,'晶體參數',['key','value','unit','sourceControl']);
  for(const key of Object.keys(parameter))string(parameter[key],`參數 ${key}`,100);
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(parameter.value)||!Number.isFinite(Number(parameter.value)))fail('晶體參數須為十進位數值。');
  return clone(parameter);
}
function source(value,version){
  shape(value,[...baseSourceKeys,...(version==='1.1'?contextKeys:[])],'晶體來源',baseSourceKeys);string(value.siteId,'網站代碼',100);url(value.url);date(value.capturedAt);context(value,contextKeys);
  if(!(version==='1.0'?['native-select','custom-family']:['native-select','custom-family','linked-select']).includes(value.control)||!Array.isArray(value.options)||!value.options.length||value.options.length>2000||!Array.isArray(value.parameters)||value.parameters.length>(version==='1.0'?30:100))fail('晶體來源內容不正確。');
  const result={...clone(value),options:value.options.map(item=>option(item,version)),parameters:value.parameters.map(parameter=>snapshotParameter(parameter,version))};
  if(value.selected!==null){shape(value.selected,['value','label','kind'],'已選晶體');const matches=result.options.filter(item=>item.value===value.selected.value&&item.label===value.selected.label&&item.kind===value.selected.kind);if(matches.length!==1)fail('已選晶體必須唯一對應來源選項。');}
  if(!value.selected&&value.parameters.length)fail('未選晶體不能保存所屬參數。');
  return result;
}
function alias(value,version){
  shape(value,[...baseAliasKeys,...(version==='1.1'?aliasContextKeys:[])],'晶體別名',baseAliasKeys);
  for(const key of ['siteId','value','label'])string(value[key],key,100);url(value.evidenceUrl);date(value.verifiedAt);context(value,aliasContextKeys);return clone(value);
}
function target(value){
  shape(value,[...baseAliasKeys,...aliasContextKeys,'kind','relation'],'晶體目標',[...baseAliasKeys,'kind','relation']);
  alias(Object.fromEntries(Object.entries(value).filter(([key])=>!['kind','relation'].includes(key))),'1.1');
  if(!['model','family','group','geometry'].includes(value.kind)||!['member','family','geometry'].includes(value.relation))fail('晶體目標關係不正確。');
  if((value.kind==='geometry')!==(value.relation==='geometry'))fail('幾何設定只能使用明確的 geometry 關係。');
  return clone(value);
}
function entryParameter(value){
  const required=['siteId','key','value','unit','evidenceUrl','capturedAt'];
  shape(value,[...required,'controlId','formula'],'站別晶體參數',required);
  for(const key of ['siteId','key','value','unit','controlId','formula'])if(own(value,key))string(value[key],key,100);
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.value)||!Number.isFinite(Number(value.value)))fail('站別晶體參數須為十進位數值。');
  url(value.evidenceUrl);date(value.capturedAt);return clone(value);
}
function entry(value,version){
  const required=['id','manufacturer','modelCode','name','kind','aliases'];
  shape(value,[...required,...(version==='1.1'?['targets','parameters']:[])],'晶體對照',required);for(const key of ['id','manufacturer','modelCode','name'])string(value[key],key,100);
  if(!(version==='1.0'?['model','family']:['model','family','group']).includes(value.kind)||!Array.isArray(value.aliases)||!value.aliases.length||value.aliases.length>(version==='1.0'?100:2000))fail('晶體對照須包含明確的型號層級與已核對別名。');
  const result={...clone(value),aliases:value.aliases.map(item=>alias(item,version))};
  if(own(value,'targets')){if(!Array.isArray(value.targets)||value.targets.length>5000)fail('晶體目標清單不正確。');result.targets=value.targets.map(target);}
  if(own(value,'parameters')){if(!Array.isArray(value.parameters)||value.parameters.length>5000)fail('站別晶體參數清單不正確。');result.parameters=value.parameters.map(entryParameter);}
  return result;
}

export function exportLensCatalogDocument(snapshots,{entries=[],now=()=>new Date().toISOString(),version=LENS_CATALOG_VERSION}={}) {
  if(!Array.isArray(snapshots))fail('晶體來源必須是陣列。');
  const sources=[];
  for(const snapshot of snapshots.filter(item=>item?.status==='read')){
    const branches=Array.isArray(snapshot.controls)?snapshot.controls.filter(control=>control.status==='read'&&control.options?.length).map(control=>({...snapshot,...control,controlId:control.controlId})): [snapshot];
    for(const branch of branches){
      const keys=[...baseSourceKeys,...(version==='1.1'?contextKeys:[])];
      sources.push(source(Object.fromEntries(keys.filter(key=>own(branch,key)).map(key=>[key,branch[key]])),version));
    }
  }
  return parseLensCatalogDocument({format:LENS_CATALOG_FORMAT,schemaVersion:version,exportedAt:typeof now==='function'?now():now,sources,entries});
}
export function parseLensCatalogDocument(input) {
  let value=input;if(typeof value==='string'){try{value=JSON.parse(value.replace(/^\uFEFF/,''));}catch{fail('晶體對照 JSON 無法解析。');}}
  shape(value,['format','schemaVersion','exportedAt','sources','entries'],'晶體對照文件');
  if(value.format!==LENS_CATALOG_FORMAT||!['1.0','1.1'].includes(value.schemaVersion))fail('不支援這個晶體對照格式或版本。');date(value.exportedAt);
  const version=value.schemaVersion;
  if(!Array.isArray(value.sources)||value.sources.length>(version==='1.0'?100:1000)||!Array.isArray(value.entries)||value.entries.length>(version==='1.0'?10000:20000))fail('晶體對照清單不正確。');
  const result={...clone(value),sources:value.sources.map(item=>source(item,version)),entries:value.entries.map(item=>entry(item,version))},ids=new Set(),aliases=new Map();
  for(const item of result.entries){
    if(ids.has(item.id))fail('晶體對照 ID 重複。');ids.add(item.id);
    for(const alias of item.aliases){
      const key=JSON.stringify([alias.siteId,...(version==='1.1'?[alias.controlId||'',alias.manufacturer||'',alias.role||'']:[]),alias.value,alias.label]);
      if(aliases.has(key)&&aliases.get(key)!==item.id)fail('相同網站晶體選項有多個對照，請先消除歧義。');
      if(version==='1.0'&&aliases.has(key))fail('相同網站晶體選項有多個對照，請先消除歧義。');
      aliases.set(key,item.id);
    }
  }
  return result;
}

/** Resolves identities and explicitly evidenced projections, never constants. */
export function resolveLensSelection(selection,targetSiteId,catalog,liveSnapshot,options={}) {
  const manual=reason=>({status:'manual',reason});
  if(!selection||!targetSiteId||liveSnapshot?.siteId!==targetSiteId||liveSnapshot.status!=='read')return manual('目的網站晶體選項尚未讀取。');
  let document;try{document=parseLensCatalogDocument(catalog);}catch{return manual('晶體對照文件不正確。');}
  const version=document.schemaVersion;
  const from={siteId:selection.iolSourceSite,value:selection.iolSourceValue,label:selection.iolSourceLabel,controlId:selection.iolSourceControl,manufacturer:selection.iolSourceManufacturer,role:selection.iolSourceRole};
  if(!from.siteId||!from.value||!from.label)return manual('來源所選晶體資料不完整。');
  const compatible=(record,expected,keys)=>keys.every(key=>!expected[key]||!record[key]||record[key]===expected[key]);
  const identity=(record,expected)=>record.siteId===expected.siteId&&record.value===expected.value&&record.label===expected.label;
  const candidates=document.entries.filter(item=>item.aliases.some(alias=>identity(alias,from)&&compatible(alias,from,aliasContextKeys)));
  if(candidates.length>1)return manual('來源晶體對照有歧義，請核對製造商與來源欄位。');
  if(selection.iolCatalogId&&candidates[0]?.id!==selection.iolCatalogId)return manual('來源晶體與保存的對照 ID 不一致。');
  const canonical=candidates[0],sourceAliases=canonical?.aliases.filter(alias=>identity(alias,from)&&compatible(alias,from,aliasContextKeys))||[];
  const sourceOptions=document.sources.filter(source=>source.siteId===from.siteId&&compatible(source,from,contextKeys)&&(!sourceAliases.length||sourceAliases.some(alias=>compatible(source,alias,aliasContextKeys)))).flatMap(source=>source.options).filter(option=>option.value===from.value&&option.label===from.label);
  if(sourceOptions.some(option=>option.kind==='geometry'))return manual('來源只有光學幾何設定，不能反推精確晶體型號。');
  const desired={controlId:options.controlId||liveSnapshot.controlId,role:options.role||'primary',manufacturer:options.manufacturer};
  const targetCompatible=record=>record.siteId===targetSiteId&&compatible(record,desired,['controlId','manufacturer'])&&(record.role||'primary')===desired.role;
  let targets=[],projection=false;
  if(from.siteId===targetSiteId&&compatible(from,desired,['controlId','manufacturer'])&&(from.role||'primary')===desired.role){
    const actual=(liveSnapshot.options||[]).filter(option=>option.value===from.value&&option.label===from.label);
    if(actual.length===1)targets=[{...from,kind:actual[0].kind}];
  }
  if(!targets.length){
    if(!canonical)return manual('來源與目的網站尚無已核對的精確晶體對照。');
    if(!sourceOptions.length||sourceOptions.some(option=>option.kind!==canonical.kind))return manual('來源型號層級尚未核對或與晶體對照不同。');
    targets=canonical.aliases.filter(targetCompatible).map(alias=>({...alias,kind:canonical.kind}));
    if(!targets.length&&version==='1.1'){targets=(canonical.targets||[]).filter(targetCompatible);projection=true;}
  }
  const identities=new Map();
  for(const target of targets){const key=JSON.stringify([target.siteId,target.controlId||'',target.manufacturer||'',target.role||'primary',target.value,target.label,target.kind,target.relation||'']);identities.set(key,target);}
  targets=[...identities.values()];
  if(targets.length!==1)return manual(targets.length?'目的網站晶體對照無法唯一選定。':'目的網站沒有此晶體的已核對對照。');
  const target=targets[0];
  if(projection&&target.kind==='model'&&canonical?.kind!=='model')return manual('來源是群組或系列，不能推測為單一精確型號。');
  if(target.kind==='geometry'&&!(projection&&version==='1.1'&&target.relation==='geometry'&&canonical?.id))return manual('目的選項只是光學幾何設定，沒有可用的精確晶體對照。');
  const matches=(liveSnapshot.options||[]).filter(option=>option.value===target.value&&option.label===target.label&&option.available);
  if(matches.length!==1||matches[0].kind!==target.kind)return manual('目的選項不可唯一辨識、層級不同或目前不可操作。');
  const result={status:'ready',siteId:targetSiteId,value:target.value,label:target.label,catalogId:canonical?.id||'',kind:target.kind,navigationExpected:!!liveSnapshot.navigationExpected};
  if(version==='1.1'){
    result.canonicalId=canonical?.id||'';result.precision=target.kind;
    for(const key of ['controlId','manufacturer','role'])if(target[key]||desired[key])result[key]=target[key]||desired[key];
    if(options.eye)result.eye=options.eye;
    if(projection)result.relation=target.relation;
  }
  return result;
}

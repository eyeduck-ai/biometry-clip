const present=value=>value!=null && value!=='';
const unique=values=>[...new Set(values)];

/** Derive UI requirements from the verified profile and a value-free live DOM inventory. */
export function deriveRequirements(profile, inventory, requestedEye='OD', data={patient:{},eyes:{OD:{},OS:{}}}) {
  if(!profile)return {fields:[],requiredKeys:[],availableKeys:[],missing:[],requiredAny:[],capabilities:{both:false},signature:'no-site'};
  const both=profile.eyeMode==='both';
  const eyes=requestedEye==='OU' && both?['OD','OS']:[['OD','OS'].includes(requestedEye)?requestedEye:inventory?.detectedEye || data.activeEye || 'OD'];
  const declared=new Set([...(profile.required||[]),...(profile.requiredIdentity||[])]);
  const live=inventory?.siteId===profile.id && Array.isArray(inventory?.fields)?inventory.fields:null;
  const source=live || (profile.fields||[]).map(field=>({key:field.key,eye:field.key.startsWith('patient.')?'patient':field.eye || (both?'shared':'current'),unit:field.unit||'',label:field.label || field.labels?.[0] || field.key,mode:field.mode||'',visible:null,available:null,required:declared.has(field.key),declaredRequired:declared.has(field.key),domRequired:false,status:'unverified'}));
  const fields=source.filter(field=>!['OD','OS'].includes(field.eye) || eyes.includes(field.eye)).map(field=>{
    const eye=field.key.startsWith('patient.')?'patient':field.eye==='current' || !field.eye?eyes[0]:field.eye;
    const hiddenConditional=!!field.mode && field.visible===false;
    const required=!!field.required && !hiddenConditional;
    const unavailable=field.available===false;
    return {...field,eye,required,optional:!required,available:field.available??null,manual:!hiddenConditional && unavailable && (!!field.declaredRequired || !!field.domRequired),reason:unavailable?(field.status==='ambiguous'?'網站欄位對應不唯一':field.visible?'網站欄位目前無法自動填入':'網站尚未顯示此欄位，請先核對模式'):field.available==null?'尚未完成網站偵測':''};
  });
  // Some required site controls intentionally have no automatic mapping (e.g.
  // a unit ambiguity). Keep those requirements explicit instead of inventing a selector.
  for(const key of declared)if(!fields.some(field=>field.key===key)){
    const targetEyes=key.startsWith('patient.')?['patient']:both?eyes:[eyes[0]];
    for(const eye of targetEyes)fields.push({key,eye,required:true,declaredRequired:true,domRequired:false,optional:false,visible:false,available:false,manual:true,status:'unmapped',reason:'此必填項目需在原網站手動確認'});
  }
  const valueFor=(key,eye)=>key.startsWith('patient.')?data.patient?.[key.slice(8)]:eye==='shared'?eyes.map(side=>data.eyes?.[side]?.[key]).find(present):data.eyes?.[eye]?.[key];
  const missing=fields.filter(field=>(field.required || field.manual && field.declaredRequired) && !present(valueFor(field.key,field.eye))).map(field=>({key:field.key,eye:field.eye,manual:field.manual,reason:field.reason || '尚未輸入'}));
  const requiredAny=(profile.requiredAny||[]).map(keys=>{
    const shared=keys.some(key=>fields.some(field=>field.key===key && field.eye==='shared'));
    const groupEyes=shared?['shared']:eyes;
    const missingEyes=groupEyes.filter(eye=>!keys.some(key=>present(valueFor(key,eye))));
    return {keys:[...keys],eyes:groupEyes,missing:missingEyes.length>0,missingEyes,availableKeys:keys.filter(key=>fields.some(field=>field.key===key && field.available===true)),manual:keys.every(key=>!fields.some(field=>field.key===key && field.available===true))};
  });
  const requiredKeys=unique(fields.filter(field=>field.required).map(field=>field.key));
  const availableKeys=unique(fields.filter(field=>field.available===true).map(field=>field.key));
  const unmappedRequired=live && Array.isArray(inventory?.unmappedRequired)?inventory.unmappedRequired.map(({label,type,reason})=>({label,type,reason})):[];
  const signature=JSON.stringify({siteId:profile.id,eyes,detectedEye:inventory?.detectedEye||'',fields:fields.map(({key,eye,visible,available,required,status})=>({key,eye,visible,available,required,status})),requiredAny:requiredAny.map(({keys,eyes})=>({keys,eyes})),unmappedRequired});
  return {fields,requiredKeys,availableKeys,missing,requiredAny,unmappedRequired,capabilities:{both},detected:!!live,signature};
}

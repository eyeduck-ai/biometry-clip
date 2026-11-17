import {cleanCase} from './model.js';

export const DEFAULT_TRANSFER_SETTINGS=Object.freeze({defaultSia:'0.05',defaultIncisionAxisOD:'180',defaultIncisionAxisOS:'0',defaultBiometer:'IOLMaster 700',defaultSurgeonName:'OPH',identityFallbacks:true});
const absent=value=>value==null||String(value).trim()==='';
const decimal=/^(?:\d+(?:\.\d*)?|\.\d+)$/;
const measuredFields=['al','acd','lt','cct','wtw','k1','k2','tk1','tk2','pk1','pk2','pca'];

/** Normalize saved preferences, including older installations without defaults. */
export function transferSettings(input={},{strict=false}={}) {
  const result={...DEFAULT_TRANSFER_SETTINGS};
  for(const key of ['defaultSia','defaultIncisionAxisOD','defaultIncisionAxisOS']){
    const value=String(input[key]??result[key]).trim(),limit=key==='defaultSia'?10:360;
    if(!decimal.test(value)||!Number.isFinite(Number(value))||Number(value)>limit){
      if(strict)throw new Error(`${key==='defaultSia'?'SIA':'切口軸向'} 預設值須為 0–${limit} 的數值。`);
    }else result[key]=value;
  }
  const biometer=String(input.defaultBiometer??result.defaultBiometer).trim();
  if(biometer.length>100){if(strict)throw new Error('測量儀器名稱過長。');}
  else result.defaultBiometer=biometer;
  const surgeon=String(input.defaultSurgeonName??result.defaultSurgeonName).trim();
  if(surgeon.length>150){if(strict)throw new Error('預設醫師名稱過長。');}
  else result.defaultSurgeonName=surgeon;
  result.identityFallbacks=![false,'false'].includes(input.identityFallbacks);
  return result;
}

/** A transfer-only copy: never writes preferences into stored measurements. */
export function applyTransferDefaults(data,settings={},profile={}) {
  const result=cleanCase(data),prefs=transferSettings(settings);
  if(absent(result.patient.surgeonName)&&absent(result.patient.surgeonId)&&prefs.defaultSurgeonName)result.patient.surgeonName=prefs.defaultSurgeonName;
  for(const eye of ['OD','OS']){
    const values=result.eyes[eye];
    // Do not turn an unmeasured eye into a case containing only defaults.
    if(!measuredFields.some(key=>!absent(values[key])))continue;
    if(absent(values.biometer)){
      if(values.argos==='yes')values.biometer='Argos';
      else if(values.argos==='no'&&/^argos$/i.test(prefs.defaultBiometer))values.biometer='Other';
      else if(prefs.defaultBiometer)values.biometer=prefs.defaultBiometer;
    }
    if(absent(values.lvcType))values.lvcType='none';
    if(values.toric===true||['toric','lvc-toric'].includes(profile.category)||profile.modes?.includes('toric')||profile.tags?.includes('toric')||profile.id?.includes('toric')){
      if(absent(values.sia))values.sia=prefs.defaultSia;
      if(absent(values.incisionAxis))values.incisionAxis=prefs[`defaultIncisionAxis${eye}`];
    }
  }
  return result;
}

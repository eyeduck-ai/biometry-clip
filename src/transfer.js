import { emptyCase, EYE_FIELDS, PATIENT_FIELDS } from './model.js';

/** Build a review candidate without merging anything into the current case. */
export function caseFromReadRows(rows, scope, {profile} = {}) {
  if (!['OD', 'OS', 'OU'].includes(scope)) throw new Error('請選擇 OD、OS 或雙眼。');
  const candidate = emptyCase();
  const selectedEyes = scope === 'OU' ? ['OD', 'OS'] : [scope];
  if (scope !== 'OU') candidate.activeEye = scope;
  for (const row of rows || []) {
    if (row?.status !== 'read' || row.value == null || row.value === '' || typeof row.key !== 'string') continue;
    if (row.key.startsWith('patient.')) {
      const key = row.key.slice(8);
      if (PATIENT_FIELDS.includes(key) && ['string', 'number'].includes(typeof row.value)) candidate.patient[key] = String(row.value).slice(0, 150);
      continue;
    }
    if (!EYE_FIELDS.includes(row.key)) continue;
    const value = ['toric','keratoconus'].includes(row.key) ? (typeof row.value === 'boolean' ? row.value : undefined) : ['string', 'number'].includes(typeof row.value) ? String(row.value).slice(0, 100) : undefined;
    if (value === undefined) continue;
    const eyes = row.eye === 'shared' ? selectedEyes : selectedEyes.includes(row.eye) ? [row.eye] : [];
    for (const eye of eyes) candidate.eyes[eye][row.key] = value;
  }
  // These rows came from visible, readable Toric-specific controls. Preserve
  // their active mode so copying to a new draft does not silently drop axes.
  for(const row of rows||[]){
    if(row?.status!=='read'||row.value==null||row.value==='')continue;
    const dedicatedToric=['toric','lvc-toric'].includes(profile?.category)&&['k1Axis','k2Axis','sia','incisionAxis','pk1Axis','pk2Axis'].includes(row.key);
    if(!dedicatedToric&&!(profile?.fields||[]).some(field=>field.key===row.key&&field.mode==='toric'&&(!field.eye||field.eye===row.eye)))continue;
    const eyes=row.eye==='shared'?selectedEyes:selectedEyes.includes(row.eye)?[row.eye]:[];
    for(const eye of eyes)candidate.eyes[eye].toric=true;
  }
  return candidate;
}

/** Prefer both eyes when the website has two independent input groups. */
export function resolveTransferScope(profile,inventory,{requested='OD',explicit=false,activeEye='OD'}={}){
  if(profile?.eyeMode==='both')return explicit&&['OD','OS','OU'].includes(requested)?requested:'OU';
  if(explicit&&['OD','OS'].includes(requested))return requested;
  if(['OD','OS'].includes(inventory?.detectedEye))return inventory.detectedEye;
  return ['OD','OS'].includes(activeEye)?activeEye:'OD';
}

/** Copy every populated, allowlisted value; blanks never erase the draft. */
export function patchFromCase(candidate){
  const patch={},rows=[];
  for(const key of PATIENT_FIELDS)if(candidate.patient?.[key]!=null&&candidate.patient[key]!==''){(patch.patient||={})[key]=candidate.patient[key];rows.push({eye:'patient',key});}
  for(const eye of ['OD','OS'])for(const key of EYE_FIELDS)if(candidate.eyes?.[eye]?.[key]!=null&&candidate.eyes[eye][key]!==''){((patch.eyes||={})[eye]||={})[key]=candidate.eyes[eye][key];rows.push({eye,key});}
  return {patch,rows};
}

/** A changed source cannot inherit a previous lens identity by omission. */
export function reconcileLensPatch(current,patch){
  const next=structuredClone(patch),keys=['iolSourceSite','iolSourceValue','iolSourceLabel','iolSourceControl','iolSourceManufacturer','iolSourceRole'];
  for(const eye of ['OD','OS']){
    const values=next.eyes?.[eye];if(!values)continue;
    const changed=keys.some(key=>Object.hasOwn(values,key)&&values[key]!==current.eyes?.[eye]?.[key]);
    const complete=['iolSourceSite','iolSourceValue','iolSourceLabel'].every(key=>Object.hasOwn(values,key)&&String(values[key]??'').trim()!=='');
    if(changed&&!(complete&&String(values.iolCatalogId??'').trim()))values.iolCatalogId='';
  }
  return next;
}

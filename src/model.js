export const FIELD_GROUPS = [
  { id: 'core', title: '基本測量', caption: '常用欄位 · 依各公式需求填寫', fields: [
    ['al','AL','眼軸長','mm'], ['k1','K1','平坦角膜曲率','D'], ['k1Axis','K1 axis','平坦軸向','°'],
    ['k2','K2','陡峭角膜曲率','D'], ['k2Axis','K2 axis','陡峭軸向','°'], ['acd','ACD','前房深度','mm'],
    ['lt','LT','水晶體厚度','mm'], ['cct','CCT','中央角膜厚度','µm'], ['wtw','WTW','白到白距離','mm'],
    ['target','Target','目標屈光度','D'], ['aConstant','A constant','所選 IOL 的 A 常數',''], ['lensFactor','Lens factor','所選 IOL 的鏡片因子',''],
  ]},
  { id: 'toric', title: 'Toric 與後角膜', caption: '軸向獨立輸入；不從另一軸推算', fields: [
    ['sia','SIA','手術引起散光','D'], ['incisionAxis','Incision axis','切口軸向','°'],
    ['tk1','TK1','總角膜平坦曲率','D'], ['tk1Axis','TK1 axis','總角膜平坦軸向','°'], ['tk2','TK2','總角膜陡峭曲率','D'], ['tk2Axis','TK2 axis','總角膜陡峭軸向','°'],
    ['pk1','Posterior K1','後角膜平坦曲率','D'], ['pk1Axis','Posterior K1 axis','後角膜平坦軸向','°'],
    ['pk2','Posterior K2','後角膜陡峭曲率','D'], ['pk2Axis','Posterior K2 axis','後角膜陡峭軸向','°'], ['pca','PCA','後角膜散光','D'], ['pcaAxis','PCA axis','後角膜散光軸向','°'],
  ]},
  { id: 'lvc', title: 'LVC 歷史與特殊情況', caption: '歷史數值不會代入目前 K 值', fields: [
    ['preLasikK','Pre-LVC K','屈光手術前 K 值','D'], ['preLasikRefraction','Pre-LVC refraction','屈光手術前屈光度','D'], ['postLasikRefraction','Post-LVC refraction','屈光手術後屈光度','D'],
    ['kIndex','K index','角膜折射率指數',''],
    ['preLvcRadius','Pre-LVC radius','LVC 前角膜曲率半徑','mm'], ['correctedAmetropia','Corrected ametropia','LVC 矯正屈光度','D'], ['posteriorRadius','Posterior radius','後角膜曲率半徑','mm'], ['totalK','Total K','測得總角膜曲率','D'], ['tcrp','TCRP','總角膜屈光力','D'],
  ]},
  { id: 'calculation', title: '計畫植入資料', caption: '由外部計算或原站選擇；不從量測推算', fields: [
    ['plannedIolPower','Planned SE IOL','計畫植入的球面等效 IOL 度數，非已植入 IOL 或目標屈光度','D'],
  ]},
  { id: 'rx', title: '術後、換片與第二眼', caption: '已植入 IOL、術前與術後測量分別保存', fields: [
    ['refractionSphere','Refraction sphere','目前球面屈光度','D'], ['refractionCylinder','Refraction cylinder','目前柱面屈光度','D'], ['refractionAxis','Refraction axis','目前散光軸向','°'],
    ['implantedIolPower','Implanted IOL','已植入 IOL 度數','D'], ['implantedIolCylinder','Implanted cylinder','已植入 IOL 平面柱鏡度數','D'], ['implantedIolAxis','Implanted axis','已植入 IOL 軸向','°'], ['desiredIolAxis','Desired axis','預期 IOL 軸向','°'],
    ['preOpK1','Preop K1','白內障術前平坦 K','D'], ['preOpK1Axis','Preop K1 axis','白內障術前平坦軸向','°'], ['preOpK2','Preop K2','白內障術前陡峭 K','D'], ['preOpK2Axis','Preop K2 axis','白內障術前陡峭軸向','°'],
    ['postOpK1','Postop K1','白內障術後平坦 K','D'], ['postOpK1Axis','Postop K1 axis','白內障術後平坦軸向','°'], ['postOpK2','Postop K2','白內障術後陡峭 K','D'], ['postOpK2Axis','Postop K2 axis','白內障術後陡峭軸向','°'],
    ['exchangeLensFactor','Exchange lens factor','換片用鏡片因子',''], ['exchangeAConstant','Exchange A constant','換片用 A 常數',''],
    ['fellowAl','Fellow AL','已手術對側眼眼軸長','mm'], ['fellowAcd','Fellow ACD','已手術對側眼前房深度','mm'], ['fellowLt','Fellow LT','已手術對側眼水晶體厚度','mm'], ['fellowCct','Fellow CCT','已手術對側眼角膜厚度','µm'], ['fellowK1','Fellow K1','已手術對側眼平坦 K','D'], ['fellowK2','Fellow K2','已手術對側眼陡峭 K','D'], ['fellowIolPower','Fellow IOL','對側眼已植入 IOL 度數','D'], ['fellowRefraction','Fellow refraction','對側眼術後屈光度','D'],
  ]},
];
export const NUMERIC_FIELDS = FIELD_GROUPS.flatMap(g => g.fields.map(f => f[0]));
export const EYE_FIELDS = [...NUMERIC_FIELDS, 'toric', 'keratoconus', 'lvcType', 'biometer', 'posteriorBiometer', 'argos', 'iolSourceSite', 'iolSourceValue', 'iolSourceLabel', 'iolCatalogId', 'iolSourceControl', 'iolSourceManufacturer', 'iolSourceRole'];
export const PATIENT_FIELDS = ['patientId','name','initials','surgeonId','surgeonName','gender','age'];
export const fieldLabel = key => FIELD_GROUPS.flatMap(g => g.fields).find(f => f[0] === key)?.[1] || ({'patient.patientId':'Patient ID','patient.name':'Name / Alias','patient.initials':'Patient initials','patient.gender':'Gender','patient.age':'Age','patient.surgeonId':'Surgeon ID','patient.surgeonName':'Surgeon name',patientId:'Patient ID',name:'Name / Alias',initials:'Patient initials',iolSourceSite:'IOL source site',iolSourceValue:'IOL source value',iolSourceLabel:'IOL model',iolCatalogId:'IOL catalog ID',iolSourceControl:'IOL source control',iolSourceManufacturer:'IOL manufacturer',iolSourceRole:'IOL role',gender:'Gender',age:'Age',surgeonId:'Surgeon ID',surgeonName:'Surgeon name',lvcType:'LVC type',toric:'Toric',keratoconus:'Keratoconus',biometer:'Biometer',posteriorBiometer:'Posterior biometer',argos:'ARGOS'}[key] || key);
export function emptyCase() { return { version: 1, patient: Object.fromEntries(PATIENT_FIELDS.map(k => [k,''])), eyes: {OD:{}, OS:{}}, activeEye:'OD' }; }
export function cleanCase(input) {
  if (!input || typeof input !== 'object' || !input.eyes) throw new Error('不是有效的 Biometry-Clip 資料格式。');
  const result = emptyCase();
  for (const key of PATIENT_FIELDS) if (['string','number'].includes(typeof input.patient?.[key])) result.patient[key] = String(input.patient[key]).slice(0,150);
  for (const eye of ['OD','OS']) for (const key of EYE_FIELDS) {
    const value = input.eyes?.[eye]?.[key];
    if (['toric','keratoconus'].includes(key)) { if (typeof value === 'boolean') result.eyes[eye][key] = value; }
    else if (['string','number'].includes(typeof value)) result.eyes[eye][key] = String(value).slice(0,100);
  }
  if (['OD','OS'].includes(input.activeEye)) result.activeEye = input.activeEye;
  return result;
}
export function validateCase(data) {
  const errors = [];
  for (const eye of ['OD','OS']) for (const key of NUMERIC_FIELDS) {
    const value = data.eyes[eye]?.[key];
    if (value == null || value === '') continue;
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(value)) || !Number.isFinite(Number(value))) errors.push(`${eye} ${fieldLabel(key)}：請輸入數值。`);
    else if (/Axis$/.test(key) && (Number(value) < 0 || Number(value) > (key === 'incisionAxis' ? 360 : 180))) errors.push(`${eye} ${fieldLabel(key)}：軸向必須介於 0–${key === 'incisionAxis' ? 360 : 180}°。`);
    else if (['al','acd','lt','cct','wtw','k1','k2','tk1','tk2'].includes(key) && Number(value) <= 0) errors.push(`${eye} ${fieldLabel(key)}：數值必須大於 0。`);
  }
  return errors;
}
export function mergeCandidates(data, candidate, selections) {
  const next = cleanCase(data);
  for (const item of selections) {
    if (item.eye === 'patient' && PATIENT_FIELDS.includes(item.key)) next.patient[item.key] = String(candidate.patient?.[item.key] ?? '');
    else if (['OD','OS'].includes(item.eye) && EYE_FIELDS.includes(item.key)) next.eyes[item.eye][item.key] = candidate.eyes?.[item.eye]?.[item.key] ?? '';
  }
  return cleanCase(next);
}

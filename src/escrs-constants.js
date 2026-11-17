/** Queryable research data. Missing constants are never inferred or converted. */
export const ESCRS_PARAMETER_KEYS=Object.freeze(['barrettAConstant','cookeAConstant','evoAConstant','hillRbfAConstant','hofferPacd','kaneAConstant','pearlDgsAConstant']);
const statuses=new Set(['observed','blank','not-exposed','not-collected']);

export function validateEscrsConstants(data){
  if(data?.format!=='biometry-escrs-formula-constants'||data.schemaVersion!=='1.0'||!Array.isArray(data.rows)||!Array.isArray(data.formulas))throw new Error('ESCRS 參數查詢檔格式不正確。');
  const formulas=data.formulas.map(f=>f.key);
  if(formulas.length!==7||new Set(formulas).size!==7||ESCRS_PARAMETER_KEYS.some(k=>!formulas.includes(k)))throw new Error('查詢檔必須明確包含七種公式欄位。');
  const ids=new Set();
  for(const row of data.rows){
    if(typeof row.id!=='string'||!row.id||ids.has(row.id)||!row.manufacturer||!row.label||!Number.isInteger(row.optionIndex))throw new Error('晶體來源列缺少識別資訊或包含重複 ID。');
    ids.add(row.id);
    if(!row.parameters||Object.keys(row.parameters).length!==7)throw new Error(`${row.id} 缺少七公式狀態。`);
    for(const key of ESCRS_PARAMETER_KEYS){
      const p=row.parameters[key];
      if(!p||!statuses.has(p.status))throw new Error(`${row.id} 的 ${key} 狀態無效。`);
      if(p.status==='observed'&&(typeof p.rawValue!=='string'||!p.rawValue.trim()||!Number.isFinite(Number(p.rawValue))))throw new Error(`${row.id} 的 ${key} 已讀值不是數值字串。`);
      if(p.status!=='observed'&&p.rawValue!==null)throw new Error(`${row.id} 的 ${key} 缺值須保留 null。`);
    }
  }
  return data;
}

export function queryEscrsConstants(data,{query='',manufacturer='',mode='',status=''}={}){
  const term=String(query).normalize('NFKC').trim().toLocaleLowerCase();
  return data.rows.filter(row=>(!term||`${row.manufacturer} ${row.label} ${row.id}`.normalize('NFKC').toLocaleLowerCase().includes(term))&&(!manufacturer||row.manufacturer===manufacturer)&&(!mode||row.mode===mode)&&(!status||Object.values(row.parameters).some(p=>p.status===status)));
}

export function summarizeEscrsConstants(data){
  const result={rows:data.rows.length,checkedRows:0,completeSevenRows:0,observed:0,blank:0,notExposed:0,notCollected:0,byFormula:Object.fromEntries(ESCRS_PARAMETER_KEYS.map(k=>[k,{observed:0,blank:0,'not-exposed':0,'not-collected':0}]))};
  for(const row of data.rows){
    const values=ESCRS_PARAMETER_KEYS.map(k=>row.parameters[k]);
    if(values.every(p=>p.status!=='not-collected'))result.checkedRows++;
    if(values.every(p=>p.status==='observed'))result.completeSevenRows++;
    for(const key of ESCRS_PARAMETER_KEYS){const status=row.parameters[key].status;result.byFormula[key][status]++;result[status==='not-collected'?'notCollected':status==='not-exposed'?'notExposed':status]++;}
  }
  return result;
}

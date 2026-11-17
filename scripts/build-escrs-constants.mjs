import fs from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'artifacts/escrs-constants-039');
const master=JSON.parse(await fs.readFile(path.join(root,'artifacts/lens-catalog-038/escrs-master.json'),'utf8'));
const definitions=[
 ['barrettAConstant','Barrett A-Constant'],['cookeAConstant','Cooke A-Constant'],['evoAConstant','EVO A-Constant'],
 ['hillRbfAConstant','Hill-RBF A-Constant'],['hofferPacd','Hoffer® pACD'],['kaneAConstant','Kane A-Constant'],['pearlDgsAConstant','Pearl DGS A-Constant']
].map(([key,label])=>({key,label,unit:''}));
const checkpoints=['early-normal-checkpoint.json','late-normal-checkpoint.json','root-normal-checkpoint.json','root-extra-checkpoint.json','toric-checkpoint.json','root-toric-checkpoint.json'];
const records=new Map();const rejected=[];const conflicts=[];
for(const filename of checkpoints){
 let checkpoint;try{checkpoint=JSON.parse(await fs.readFile(path.join(out,filename),'utf8'));}catch(error){if(error.code==='ENOENT')continue;throw error;}
 if(!Array.isArray(checkpoint))checkpoint=checkpoint.rows;
 for(const item of checkpoint){
  const branch=master.captures.find(x=>x.manufacturer===item.manufacturer&&x.mode===item.mode);
  if(!item.verifiedAfterClear||!branch||branch.options[item.optionIndex]!==item.label||item.values?.length!==7){rejected.push({filename,item});continue;}
  if(!item.values.every(x=>x===null||(typeof x==='string'&&/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(x)&&Number.isFinite(Number(x))))
    ||typeof item.capturedAt!=='string'||!Number.isFinite(Date.parse(item.capturedAt))){rejected.push({filename,item});continue;}
  const key=JSON.stringify([item.mode,item.manufacturer,item.optionIndex,item.label]);
  const previous=records.get(key);
  if(previous&&JSON.stringify(previous.values)!==JSON.stringify(item.values))conflicts.push({key,previous,item});
  records.set(key,{...item,checkpoint:filename});
 }
}
if(rejected.length)throw Error('Invalid verified checkpoint records: '+JSON.stringify(rejected));
if(conflicts.length)throw Error('Conflicting observations: '+JSON.stringify(conflicts));
const rows=master.captures.flatMap(branch=>branch.options.map((label,optionIndex)=>{
 const id=JSON.stringify([branch.mode,branch.manufacturer,optionIndex,label]);
 const record=records.get(id);
 const parameters=Object.fromEntries(definitions.map((formula,index)=>{
  const exposed=branch.mode!=='toric'||![1,3].includes(index)||!!record?.sourceSelectionVerified;
  return [formula.key,{rawValue:record?.values[index]??null,status:!record?'not-collected':!exposed?'not-exposed':record.values[index]===null?'blank':'observed'}];
 }));
 return {id,manufacturer:branch.manufacturer,mode:branch.mode,optionIndex,label,sourceUrl:master.url,
  capturedAt:record?.capturedAt??null,captureMethod:record?.captureMethod??(record?'native-ui-clear-buttons':null),
  verifiedAfterClear:!!record,
  ...(record?.selectionContext?{selectionContext:record.selectionContext,revealedInMode:record.revealedInMode,sourceSelectionVerified:record.sourceSelectionVerified}:{}),
  parameters};
}));
const statuses={observed:0,blank:0,'not-exposed':0,'not-collected':0};
for(const row of rows)for(const parameter of Object.values(row.parameters))statuses[parameter.status]++;
const names=new Map();
for(const row of rows){const key=JSON.stringify([row.mode,row.manufacturer,row.label]);if(!names.has(key))names.set(key,[]);names.get(key).push(row);}
const duplicateGroups=[...names.values()].filter(group=>group.length>1).map(group=>({manufacturer:group[0].manufacturer,mode:group[0].mode,label:group[0].label,
 complete:group.every(row=>row.verifiedAfterClear),sourceRows:group.map(row=>({id:row.id,optionIndex:row.optionIndex,parameters:row.parameters})),
 differingFormulaKeys:definitions.filter(formula=>new Set(group.map(row=>JSON.stringify(row.parameters[formula.key]))).size>1).map(formula=>formula.key)}));
const fullyCollected=row=>row.verifiedAfterClear&&Object.values(row.parameters).every(x=>['observed','blank'].includes(x.status));
const payload={format:'biometry-escrs-formula-constants',schemaVersion:'1.0',sourceUrl:master.url,capturedAt:new Date().toISOString(),
 formulas:definitions,rows,coverage:{totalRows:rows.length,collectedRows:rows.filter(x=>x.verifiedAfterClear).length,
  fullyCollectedRows:rows.filter(fullyCollected).length,totalParameterSlots:rows.length*7,statuses,complete:rows.every(fullyCollected),
  duplicateLabelGroups:duplicateGroups.length,duplicateSourceRows:duplicateGroups.reduce((sum,group)=>sum+group.sourceRows.length,0),
  byMode:Object.fromEntries(['non-toric','toric'].map(mode=>[mode,{totalRows:rows.filter(x=>x.mode===mode).length,collectedRows:rows.filter(x=>x.mode===mode&&x.verifiedAfterClear).length}]))},
 notes:[
  'Values are observations of the ESCRS input defaults, not clinical recommendations or values inferred from another formula.',
  'The toric input form directly exposes five formula constant fields. Cooke and Hill-RBF can be read by returning to the normal mode after the toric selection; these observations carry selectionContext/revealedInMode metadata and were cleared before selection.',
  'Every accepted record was read after native Clear or Reset actions and a committed lens selection. DOM-only empty edits are excluded.',
  'Duplicate labels retain original source optionIndex; names alone are not unique identifiers.',
  'blank means the native source did not refill a visible field after clearing; not-collected means no verified observation is available yet.'
 ]};
await fs.mkdir(out,{recursive:true});
await fs.writeFile(path.join(out,'escrs-formula-constants.json'),JSON.stringify(payload,null,2)+'\n');
const csvCell=x=>'"'+String(x??'').replaceAll('"','""')+'"';
const columns=['manufacturer','mode','optionIndex','label','sourceUrl','capturedAt','captureMethod',...definitions.flatMap(f=>[f.key,f.key+'Status'])];
const csv=[columns,...rows.map(row=>[row.manufacturer,row.mode,row.optionIndex,row.label,row.sourceUrl,row.capturedAt,row.captureMethod,
 ...definitions.flatMap(f=>[row.parameters[f.key].rawValue,row.parameters[f.key].status])])].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
await fs.writeFile(path.join(out,'escrs-formula-constants.csv'),'\uFEFF'+csv);
await fs.writeFile(path.join(out,'coverage.json'),JSON.stringify(payload.coverage,null,2)+'\n');
await fs.writeFile(path.join(out,'duplicate-labels.json'),JSON.stringify({format:'biometry-escrs-duplicate-labels',schemaVersion:'1.0',sourceUrl:master.url,groups:duplicateGroups},null,2)+'\n');
console.log(JSON.stringify(payload.coverage));

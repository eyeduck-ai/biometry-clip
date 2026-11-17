import fs from 'node:fs/promises';
import path from 'node:path';
import {validateEscrsConstants,ESCRS_PARAMETER_KEYS} from '../src/escrs-constants.js';

const root=path.resolve(import.meta.dirname,'..');
const dir=path.join(root,'artifacts/escrs-constants-039');
const data=validateEscrsConstants(JSON.parse(await fs.readFile(path.join(dir,'escrs-formula-constants.json'),'utf8')));
const key=row=>JSON.stringify([row.mode,row.manufacturer,row.optionIndex,row.label]);
const source=new Map(data.rows.map(row=>[key(row),row]));
const observations=new Map();
for(const name of ['blank-verification-normal.json','blank-verification-toric.json']){
 let rows;try{rows=JSON.parse(await fs.readFile(path.join(dir,name),'utf8'));}catch(error){if(error.code==='ENOENT')continue;throw error;}
 for(const row of rows){
  if(!row.verifiedAfterClear||row.values?.length!==7)throw Error('Invalid independent verification: '+key(row));
  observations.set(key(row),{...row,checkpoint:name});
 }
}
const mismatches=[];const matches=[];
for(const [id,observation] of observations){
 const row=source.get(id);
 if(!row?.verifiedAfterClear)throw Error('Verification row has no original observation: '+id);
 const original=ESCRS_PARAMETER_KEYS.map(key=>row.parameters[key].rawValue);
 const comparison={id,originalCapturedAt:row.capturedAt,verifiedAt:observation.capturedAt,method:observation.captureMethod,checkpoint:observation.checkpoint};
 if(JSON.stringify(original)===JSON.stringify(observation.values))matches.push(comparison);
 else mismatches.push({...comparison,original,verified:observation.values});
}
const allBlank=data.rows.filter(row=>row.verifiedAfterClear&&ESCRS_PARAMETER_KEYS.every(key=>row.parameters[key].status==='blank'));
const pendingBlankRechecks=allBlank.filter(row=>!observations.has(key(row))).map(row=>({id:row.id,manufacturer:row.manufacturer,mode:row.mode,optionIndex:row.optionIndex,label:row.label}));
const report={format:'biometry-escrs-observation-verification',schemaVersion:'1.0',verifiedAt:new Date().toISOString(),
 sourceRows:data.rows.length,sourceCollectionComplete:data.coverage.complete,independentRechecks:observations.size,matches:matches.length,
 allBlankRows:allBlank.length,blankRowsRechecked:allBlank.length-pendingBlankRechecks.length,pendingBlankRechecks,
 mismatches,complete:observations.size>0&&pendingBlankRechecks.length===0&&mismatches.length===0,comparisons:matches,
 notes:['Independent verification reloads the public ESCRS page and waits at least 2.5 seconds after the accepted lens selection before reading the seven values.','Blank records and positive controls are compared as exact raw strings/nulls. No constants are inferred or rounded.']};
await fs.writeFile(path.join(dir,'verification-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,comparisons:undefined,notes:undefined}));
if(mismatches.length)process.exitCode=1;

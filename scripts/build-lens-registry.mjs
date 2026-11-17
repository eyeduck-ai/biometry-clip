import {mkdir,writeFile} from 'node:fs/promises';
import {DEFAULT_LENS_CATALOG as catalog,LENS_DEFINITIONS,planLensSelections} from '../src/lens-registry.js';
import {ESCRS_CAPTURE} from '../src/lens-escrs-data.js';

const directory=new URL('../artifacts/lens-catalog-038/',import.meta.url);
await mkdir(directory,{recursive:true});
await writeFile(new URL('default-lens-catalog.json',directory),JSON.stringify(catalog,null,2)+'\n');
const master=catalog.sources.filter(source=>source.siteId==='escrs'&&source.eye==='OD');
const destinations=Object.keys(LENS_DEFINITIONS).filter(siteId=>siteId!=='escrs');
const rows=[],totals=Object.fromEntries(destinations.map(siteId=>[siteId,{exact:0,family:0,geometry:0,ambiguous:0,none:0,inherited:0}]));
for(const source of master)for(const option of source.options){
  const aliasMatch=alias=>alias.siteId==='escrs'&&alias.controlId===source.controlId&&alias.manufacturer===source.manufacturer&&alias.value===option.value&&alias.label===option.label;
  const entries=catalog.entries.filter(entry=>entry.aliases.some(aliasMatch));
  const duplicate=source.options.filter(item=>item.value===option.value&&item.label===option.label).length>1;
  const outcomes={};
  for(const siteId of destinations){
    let outcome,reason,selections=[];
    if(duplicate||entries.length!==1){outcome='ambiguous';reason=duplicate?'ESCRS 同一選單中有重複的完全相同名稱。':'來源無法唯一對應目錄。';}
    else{
      const entry=entries[0],data={eyes:{OD:{iolCatalogId:entry.id,iolSourceSite:'escrs',iolSourceValue:option.value,iolSourceLabel:option.label,iolSourceControl:source.controlId,iolSourceManufacturer:source.manufacturer,iolSourceRole:'primary'}}};
      // Keep every relevant source option and the complete canonical entry.
      // Limiting unrelated entries makes this deterministic resolver audit
      // fast; destination options are still the published real site options.
      const subset={...catalog,entries:[entry],sources:[source,...catalog.sources.filter(item=>item.siteId===siteId)]};
      const result=planLensSelections(data,siteId,{}, {catalog:subset,eye:'OD'});
      selections=result.selections.filter(selection=>selection.role!=='manufacturer');
      if(result.status==='ready'&&selections.length){outcome=selections.some(item=>item.kind==='geometry')?'geometry':selections.every(item=>item.kind==='model')?'exact':'family';}
      else if(LENS_DEFINITIONS[siteId].inheritedModel)outcome='inherited';
      else if(result.warnings.some(warning=>/無法唯一|有歧義|唯一辨識/.test(warning)))outcome='ambiguous';
      else outcome='none';
      reason=result.warnings.join(' ');
    }
    totals[siteId][outcome]++;
    outcomes[siteId]={outcome,...(reason?{reason}:{}),selections:selections.map(({controlId,value,label,kind,relation,catalogId})=>({controlId,value,label,kind,...(relation?{relation}:{}),catalogId}))};
  }
  rows.push({manufacturer:source.manufacturer,mode:source.formula,label:option.label,kind:option.kind,duplicateSource:duplicate,catalogId:entries.length===1?entries[0].id:null,destinations:outcomes});
}
const report={format:'biometry-lens-coverage',schemaVersion:'1.0',generatedAt:new Date().toISOString(),basis:'Published catalog resolver audit; not live browser execution or clinical formula validation.',master:{siteId:'escrs',manufacturers:new Set(master.map(source=>source.manufacturer)).size,branches:ESCRS_CAPTURE.length,nonemptyBranches:master.length,rows:rows.length,normal:rows.filter(row=>row.mode==='non-toric').length,toric:rows.filter(row=>row.mode==='toric').length,duplicateSourceRows:rows.filter(row=>row.duplicateSource).length},catalog:{entries:catalog.entries.length,sources:catalog.sources.length,parameters:catalog.entries.reduce((sum,entry)=>sum+(entry.parameters?.length||0),0)},totals,rows};
await writeFile(new URL('registry-coverage.json',directory),JSON.stringify(report,null,2)+'\n');
const table=['| Calculator | Exact model | Family/group | Geometry only | Ambiguous | No mapping | Inherited |','|---|---:|---:|---:|---:|---:|---:|',...Object.entries(totals).map(([siteId,item])=>`| ${siteId} | ${item.exact} | ${item.family} | ${item.geometry} | ${item.ambiguous} | ${item.none} | ${item.inherited} |`)];
await writeFile(new URL('registry-coverage.md',directory),[
'# Published cross-site lens coverage','',
`ESCRS master: ${report.master.manufacturers} manufacturers, ${report.master.branches} normal/toric branches, ${report.master.rows} source rows (${report.master.normal} normal; ${report.master.toric} toric). ${report.master.duplicateSourceRows} rows have indistinguishable duplicate labels in their original menu.`,
'','These counts execute the same identity resolver used by the extension against the bundled official option data. They do not claim live browser execution. Exact means a single physical model; family/group means an explicit named series or published member relationship. Geometry means only the destination formula’s explicitly documented optical configuration; it does not preserve an exact model identity.','',
...table,'',
'No mapping means the target calculator does not expose an evidenced unique corresponding option. DGS Toric inherits its model from the preceding spherical calculation. The extension never replaces a missing correspondence with a guessed model, guessed constant, or DGS “Other IOL Model”.',
'','Canonical model identity retains manufacturer, power-sign variants, injector/model suffixes and regional qualifiers. AR40e and AR40E remain different. Each saved parameter retains its originating site/control/formula.',''
].join('\n'));
console.log(JSON.stringify({master:report.master,catalog:report.catalog,totals},null,2));

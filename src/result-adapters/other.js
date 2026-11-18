import {resultText as text,resultNumber as number,isResultVisible} from './dom.js';

const routes={
  cooke:{hosts:['cookeformula.com'],paths:['/printpreview']},
  kane:{hosts:['www.iolformula.com','iolformula.com'],paths:['/']},
  evo:{hosts:['www.evoiolcalculator.com','evoiolcalculator.com'],paths:['/calculator.aspx']},
  'evo-toric':{hosts:['www.evoiolcalculator.com','evoiolcalculator.com'],paths:['/toric.aspx']},
  'tecnis-toric':{hosts:['tecnistoriccalc.com'],paths:['/calculator/']},
};
const decimal='[+-]?(?:\\d+(?:[.,]\\d+)?|\\.\\d+)';
const own=(value,key)=>Object.hasOwn(value,key);
const visible=node=>isResultVisible(node)&&!node.closest('[visibility="hidden"],[visibility="collapse"]');
const all=(root,selector)=>[...root.querySelectorAll(selector)];
const one=(root,selector)=>{const nodes=all(root,selector).filter(visible);return nodes.length===1?nodes[0]:undefined;};
const scalar=node=>node&&visible(node)&&!node.matches('input,select,textarea,option,script,style')&&!node.querySelector('input,select,textarea,option,table,script,style,[hidden],[aria-hidden="true"]')?text(node):'';
const scalarNumber=node=>number(scalar(node));
const cells=row=>[...row.cells];
const plainCells=row=>cells(row).every(cell=>cell.colSpan===1&&cell.rowSpan===1&&visible(cell)&&!cell.querySelector('input,select,textarea,table'));
const rowFlags=row=>(row.matches('.recommended,.table-active')||row.querySelector('.best-option'))?{highlighted:true}:{};
const validRow=value=>value!==undefined;
function routeMatches(document,id){try{const url=new URL(document.URL),route=routes[id];return route&&url.protocol==='https:'&&route.hosts.includes(url.hostname)&&route.paths.includes(url.pathname.toLowerCase());}catch{return false;}}
function eyeText(value){const match=text(value).match(/^(OD|OS)(?:\s*(?:[-–]\s*(?:Right|Left)|\((?:Right|Left)\)))?$/i);return match?match[1].toUpperCase():null;}
function directRows(container){return !container?[]:container.tagName==='TABLE'?[...container.rows].filter(row=>row.closest('table')===container):[...container.children].filter(row=>row.tagName==='TR');}
function pairValues(container){
  const result=new Map();
  for(const row of directRows(container)){if(!visible(row)||cells(row).length!==2||!plainCells(row))continue;const [label,value]=cells(row).map(scalar);if(label&&value){if(result.has(label))result.set(label,null);else result.set(label,value);}}
  return result;
}
function metadata(pairs,mapping){
  const inputEcho={};for(const [label,key]of Object.entries(mapping)){const value=number(pairs.get(label));if(validRow(value))inputEcho[key]=value;}
  return Object.keys(inputEcho).length?{inputEcho}:{};
}
function numericTable(table,headers,keys,required){
  if(!table||table.tagName!=='TABLE'||!visible(table))return [];
  const rows=directRows(table),heading=rows.find(row=>visible(row)&&cells(row).length===headers.length&&cells(row).every((cell,index)=>cell.tagName==='TH'&&scalar(cell)===headers[index]));
  if(!heading)return [];
  const result=[];
  for(const row of rows.slice(rows.indexOf(heading)+1,302)){
    if(!visible(row)||cells(row).length!==headers.length||!plainCells(row))continue;
    const raw=cells(row).map(scalar),value={};
    keys.forEach((key,index)=>{if(!key)return;const parsed=key==='lensModel'?raw[index]:number(raw[index]);if(validRow(parsed)&&parsed!=='')value[key]=parsed;});
    if(!required.every(key=>own(value,key)))continue;
    result.push({...value,...rowFlags(row),rawCells:raw.map((value,index)=>({label:headers[index],value}))});
  }
  return result;
}

function cookeResults(document){
  const page=one(document,'#page');if(!page)return [];
  const heading=scalar(one(page,'h1'));if(!/^K6(?:\s|v|$)/i.test(heading))return [];
  const groups=[];
  for(const output of all(page,'td.outputs').filter(visible)){
    const summary=one(output,':scope > table.outputs'),eye=eyeText(scalar(one(summary||output,'h3.tblabel')));if(!summary||!eye)continue;
    const tables=all(output,':scope > table').filter(table=>table!==summary&&visible(table));if(tables.length!==1)continue;
    const table=tables[0],names=all(table,'td.iol-names[colspan="3"]').filter(visible);if(names.length!==1)continue;
    const lensModel=scalar(names[0]);if(!lensModel)continue;
    const rows=[];
    for(const row of directRows(table).slice(0,302)){
      if(!visible(row)||cells(row).length!==3||!plainCells(row))continue;
      const [power,,refraction]=cells(row);if(!power.matches('.iol-names')||!refraction.matches('.iol-results'))continue;
      const iolPower=number(scalar(power).replace(/^\(minus\)\s*/i,'')),predictedRefraction=scalarNumber(refraction);
      if(!validRow(iolPower)||!validRow(predictedRefraction))continue;
      rows.push({iolPower,predictedRefraction,...rowFlags(row),rawCells:[{label:'IOL Power',value:scalar(power)},{label:'Refraction',value:scalar(refraction)}]});
    }
    if(!rows.length)continue;
    const pairs=pairValues(summary),targetRefraction=number(pairs.get('Target Refraction (D)')),aConstant=number(pairs.get('A-Constant'));
    groups.push({eye,formula:heading,lensModel,...(validRow(targetRefraction)?{targetRefraction}:{}),...(validRow(aConstant)?{constants:[{name:'A-Constant',value:aConstant,unit:'1'}]}:{}),
      ...metadata(pairs,{'Target Refraction (D)':'target','A-Constant':'aConstant','Axial Length (mm)':'al','Central Corneal Thickness (μm)':'cct','Central Corneal Thickness (µm)':'cct','Anterior Chamber Depth (mm)':'acd','Lens Thickness (mm)':'lt','White-To-White (mm)':'wtw','K1 (D)':'k1','K2 (D)':'k2','TK1 (D)':'tk1','TK2 (D)':'tk2'}),rows,sourceLabel:'Cooke K6 · Print Preview'});
  }
  // Repeated visible eye panels are ambiguous, rather than an extra case.
  return groups.filter(group=>groups.filter(other=>other.eye===group.eye).length===1);
}

function kanePairRows(container){
  if(!container||!visible(container)||!['TBODY','TABLE'].includes(container.tagName))return [];
  const rows=directRows(container).filter(row=>visible(row)&&cells(row).length===2&&plainCells(row));
  // ShowResult's loading skeleton consists of seven literal "00" pairs.
  if(rows.length&&rows.every(row=>cells(row).every(cell=>scalar(cell)==='00')))return [];
  return rows;
}
function kaneEcho(pairs){
  const inputEcho={};
  for(const [label,key,unit]of [['AL:','al','mm'],['ACD:','acd','mm'],['LT:','lt','mm'],['CCT:','cct','[µμ]m']]){
    const match=pairs.get(label)?.match(new RegExp(`^(${decimal})\\s*${unit}$`));if(match)inputEcho[key]=number(match[1]);
  }
  for(const [label,key]of [['K1:','k1'],['K2:','k2']]){
    const match=pairs.get(label)?.match(new RegExp(`^(${decimal})\\s*D(?:\\s*@\\s*(${decimal})\\s*°)?$`));
    if(match){inputEcho[key]=number(match[1]);if(match[2]!==undefined)inputEcho[`${key}Axis`]=number(match[2]);}
  }
  for(const [label,key]of [['Target Ref:','target'],['A-Constant:','aConstant']]){const value=number(pairs.get(label));if(validRow(value))inputEcho[key]=value;}
  return Object.keys(inputEcho).length?{inputEcho}:{};
}
function kaneResults(document){
  const groups=[];
  for(const [eye,index]of [['OD',1],['OS',2]]){
    const root=one(document,`.form_block .eye${index}_results`);if(!root)continue;
    if(all(root,'.res_tab3_wait').some(visible))continue;
    const pairs=new Map([...pairValues(one(root,'.res_tab1')),...pairValues(one(root,'.res_tab2'))]);
    const targetRefraction=number(pairs.get('Target Ref:')),aConstant=number(pairs.get('A-Constant:'));
    const model=scalar(one(root,'.iol_device_name')),lensModel=model.startsWith('IOL:')?model.slice(4).trim():'';
    const base={eye,lensModel,...(validRow(targetRefraction)?{targetRefraction}:{}),...(validRow(aConstant)?{constants:[{name:'A-Constant',value:aConstant,unit:'1'}]}:{}),...kaneEcho(pairs)};
    const non=one(root,'.res_nontoric .res_tab3_lines'),toric=one(root,'.res_toric .res_tab32_lines');
    // The site's modes are mutually exclusive. Do not combine stale tables.
    if(!!non===!!toric)continue;
    const formula=toric?'Kane Toric':'Kane',rows=[];
    for(const row of kanePairRows(toric||non)){
      const [power,refraction]=cells(row),iolPower=scalarNumber(power),predictedRefraction=scalarNumber(refraction);
      if(validRow(iolPower)&&validRow(predictedRefraction))rows.push({iolPower,predictedRefraction,...rowFlags(row),rawCells:[{label:'IOL Power',value:scalar(power)},{label:'Refraction',value:scalar(refraction)}]});
    }
    if(rows.length)groups.push({...base,formula,rows,sourceLabel:`${formula} · IOL Power / Refraction`});
    if(!toric||!rows.length)continue;
    const cylinderRows=[],axisNode=one(root,'.eyecircle svg #angle-bigtext'),axis=scalarNumber(axisNode),powerLabel=scalar(one(root,'.sifi_toric_hdr'))||'Toric (Cylinder Power)';
    for(const row of kanePairRows(one(root,'.res_toric .res_tab42_lines'))){
      const [power,residual]=cells(row),powerText=scalar(power),residualText=scalar(residual);
      const toricPower=number(powerText)??number(powerText.match(/^(?:T\d+|Non-toric)\s*\(([^)]+)\)$/i)?.[1]);
      const parts=residualText.match(new RegExp(`^(${decimal})\\s*D\\s+Axis\\s+(${decimal})(?:\\s*°)?$`,'i'));
      if(!validRow(toricPower)||!parts)continue;
      cylinderRows.push({toricPower,residualCylinder:number(parts[1]),residualAxis:number(parts[2]),...(validRow(axis)?{axis}:{}),...rowFlags(row),rawCells:[{label:powerLabel,value:powerText},{label:'Residual Cylinder',value:residualText},...(validRow(axis)?[{label:'IOL Axis',value:scalar(axisNode)}]:[])]});
    }
    // These are independent toric alternatives, not a row-by-row join to the
    // sphere table; the site does not publish a sphere power on these rows.
    if(cylinderRows.length)groups.push({...base,formula,rows:cylinderRows,sourceLabel:'Kane Toric · Cylinder Power / Residual Cylinder'});
  }
  return groups;
}

function labelledParts(node,labels){
  const value=scalar(node),escaped=labels.map(label=>label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
  const pattern=new RegExp(`(?:^|\\s)(${escaped}):\\s*(.*?)(?=\\s+(?:${escaped}):|$)`,'g'),result=new Map();
  for(const match of value.matchAll(pattern)){if(result.has(match[1]))result.set(match[1],null);else result.set(match[1],match[2].trim());}
  return result;
}
function evoResults(document,id){
  const root=one(document,'#PnPred.results');if(!root)return [];
  const eye=eyeText(scalar(one(root,'#LabelODOS'))),formula=id==='evo-toric'?'EVO Toric 2.0':'EVO 2.0';
  const first=labelledParts(one(root,'#Labelpara1'),['A Constant','IOL','Toric Model','K Index']),second=labelledParts(one(root,'#Labelpara2'),['AL','K1','K2','ACD','LT','CCT','Ref']);
  const lensModel=first.get('IOL')||first.get('Toric Model')||'',targetRefraction=number(second.get('Ref')),constants=[];
  for(const label of ['A Constant','K Index']){const value=number(first.get(label));if(validRow(value))constants.push({name:label,value,unit:'1'});}
  const inputEcho={};for(const [label,key]of [['AL','al'],['ACD','acd'],['LT','lt'],['CCT','cct'],['Ref','target']]){const value=number(second.get(label));if(validRow(value))inputEcho[key]=value;}
  for(const [label,key]of [['K1','k1'],['K2','k2']]){
    const match=second.get(label)?.match(new RegExp(`^(${decimal})(?:\\s*@\\s*(${decimal})\\s*°)?$`));
    if(match){inputEcho[key]=number(match[1]);if(match[2]!==undefined)inputEcho[`${key}Axis`]=number(match[2]);}
  }
  const base={eye,formula,lensModel,...(validRow(targetRefraction)?{targetRefraction}:{}),...(constants.length?{constants}:{}),...(Object.keys(inputEcho).length?{inputEcho}:{})};
  const rows=numericTable(one(root,'table.pred'),['IOL Power (SE)','Refraction (SE)'],['iolPower','predictedRefraction'],['iolPower','predictedRefraction']);
  const groups=rows.length?[{...base,rows,sourceLabel:`${formula} · Spherical equivalent`}]:[];
  if(id!=='evo-toric'||!rows.length)return groups;
  const table=one(root,'table.toric'),toricRows=numericTable(table,['Toric','IOL Axis','Refraction','Residual Cyl','Axis'],['toricPower','axis','predictedRefraction','residualCylinder','residualAxis'],['axis','predictedRefraction','residualCylinder','residualAxis']);
  const iolPower=scalarNumber(one(root,'#LabelBaseIOL'));
  for(const row of toricRows){if(validRow(iolPower))row.iolPower=iolPower;if(!own(row,'toricPower')){const label=row.rawCells[0].value;if(label&&!/^[-–—]+$/.test(label))row.lensModel=label;}}
  const identifiedRows=toricRows.filter(row=>own(row,'toricPower')||row.lensModel);
  if(identifiedRows.length)groups.push({...base,rows:identifiedRows,sourceLabel:'EVO Toric 2.0 · Toric alternatives'});
  return groups;
}

function tecnisResults(document){
  const body=one(document,'#results')||one(document,'#resultsPrint');if(!body||body.tagName!=='TBODY')return [];
  const table=body.closest('table');if(!table||!visible(table))return [];
  const heading=[...table.tHead?.rows||[]].at(-1);if(!heading||cells(heading).map(scalar).join('|')!=='IOL Model|Orientation|Cylinder|Axis')return [];
  const eyes=[...new Set(all(document,'.js-eye-selection-text,.js-eye-selection-text-side').filter(visible).map(scalar).map(eyeText).filter(Boolean))],eye=eyes.length===1?eyes[0]:null;
  const iolPower=scalarNumber(one(document,'.pr-seIOLPower')),rows=[];
  const chosen=scalar(one(document,'.pr-chosenModel'));
  for(const row of directRows(body).slice(0,302)){
    if(!visible(row)||cells(row).length!==4||cells(row).some(cell=>cell.colSpan!==1||cell.rowSpan!==1||!visible(cell)))continue;
    const [model,orientation,cylinder,residual]=cells(row),labels=all(model,'label').filter(visible),controls=all(model,'input');
    if(model.querySelector('select,textarea,table')||controls.some(input=>!input.matches('input[type="radio"].select-model[name="select-model"]'))||controls.length>1||labels.length!==1||[orientation,cylinder,residual].some(cell=>cell.querySelector('input,select,textarea,table')))continue;
    const lensModel=scalar(labels[0]),axis=scalarNumber(orientation),residualCylinder=scalarNumber(cylinder),residualAxis=scalarNumber(residual);
    if(!lensModel||![axis,residualCylinder,residualAxis].every(validRow))continue;
    rows.push({lensModel,axis,residualCylinder,residualAxis,...(validRow(iolPower)?{iolPower}:{}),...(controls[0]?.checked||chosen===lensModel?{siteSelected:true}:{}),rawCells:[{label:'IOL Model',value:lensModel},{label:'Orientation',value:scalar(orientation)},{label:'Cylinder',value:scalar(cylinder)},{label:'Axis',value:scalar(residual)}]});
  }
  if(!rows.length)return [];
  const constantName=scalar(one(document,'.pr-constant-factor-label')),constantValue=scalarNumber(one(document,'.pr-constantFactor'));
  const inputEcho={};for(const [selector,key]of [['.pr-axialLength','al'],['.pr-seIOLPower','plannedIolPower'],['.pr-kIndex','kIndex']]){const value=scalarNumber(one(document,selector));if(validRow(value))inputEcho[key]=value;}
  const incision=scalar(one(document,'.pr-incisionLocation')).match(new RegExp(`^(${decimal})\\s*@\\s*(${decimal})$`));if(incision){inputEcho.sia=number(incision[1]);inputEcho.incisionAxis=number(incision[2]);}
  return [{eye,formula:'TECNIS Toric',lensModel:rows.every(row=>row.lensModel===rows[0].lensModel)?rows[0].lensModel:'',...(constantName&&validRow(constantValue)?{constants:[{name:constantName,value:constantValue}]}:{}),...(Object.keys(inputEcho).length?{inputEcho}:{}),rows,sourceLabel:'TECNIS Toric · Final Results'}];
}

/** Only published result containers; no form-value, app-state or network reads. */
export function readOtherResults(document,profile){
  const id=profile?.id;if(!routeMatches(document,id))return [];
  if(id==='cooke')return cookeResults(document);
  if(id==='kane')return kaneResults(document);
  if(id==='evo'||id==='evo-toric')return evoResults(document,id);
  if(id==='tecnis-toric')return tecnisResults(document);
  return [];
}

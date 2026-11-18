import {isResultVisible, readResultTable, resultNumber, resultText} from './dom.js';

const DGS_RESULTS = {
  'solver-regular': {path: '/result_regular', title: 'PEARL-DGS - Results - Regular Eyes'},
  'solver-complex': {path: '/result_complex', title: 'PEARL-DGS - Results - Complex Eyes'},
  'solver-second': {path: '/result_second', title: 'PEARL-DGS - Results - Second Eyes'},
  'solver-toric': {path: '/result_toric', title: /^PEARL-DGS - Toric Calculation Results \(from (regular|complex|second)\)$/},
};
const SPHERICAL_ALIASES = {iolPower: ['IOL POWER (D)'], predictedRefraction: ['REFRACTION (D)']};
const TORIC_ALIASES = {toricPower: ['IOL CYLINDER (D)'], residualCylinder: ['RESIDUAL REF. CYL (D)'], residualAxis: ['RESIDUAL AXIS (°)']};
const ECHO_FIELDS = [['AL','al'],['K1','k1'],['K2','k2'],['ACD','acd'],['LT','lt'],['CCT','cct'],['A Constant','aConstant'],['Target refraction','target']];
const FELLOW_FIELDS = [['AL','fellowAl'],['K1','fellowK1'],['K2','fellowK2'],['ACD','fellowAcd'],['LT','fellowLt'],['CCT','fellowCct'],['Implanted IOL power','fellowIolPower'],['Postop. spherical equivalent','fellowRefraction']];
const uniqueVisible = nodes => [...nodes].filter(isResultVisible);

function rowMarkers(row) {
  return {
    ...(row.classList.contains('selected') || row.getAttribute('aria-selected') === 'true' ? {siteSelected: true} : {}),
    ...([...row.cells].length && [...row.cells].every(cell => cell.classList.contains('bg-blue')) ? {highlighted: true} : {}),
  };
}

function echoedValues(sheet, definitions) {
  const result = {};
  // These are printed measurements inside the result card, never form values.
  const text = resultText(sheet);
  for (const [label, key] of definitions) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = [...text.matchAll(new RegExp(`(?:^|\\s)${escaped}\\s*:\\s*([+−–-]?(?:\\d+(?:[.,]\\d+)?|\\.\\d+))(?=\\s|$)`, 'gi'))];
    if (matches.length !== 1) continue;
    const value = resultNumber(matches[0][1]);
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function contextFromCard(card, sourceLabel, eye) {
  const sheets = uniqueVisible(card.querySelectorAll('.iol-used-inputs-v-sheet'));
  const current = sheets.filter(sheet => !uniqueVisible(sheet.querySelectorAll('h3')).some(heading => resultText(heading) === 'Controlateral Operated Eye Information'));
  const inputEcho = current.length === 1 ? echoedValues(current[0], ECHO_FIELDS) : {};
  const fellow = sheets.filter(sheet => uniqueVisible(sheet.querySelectorAll('h3')).some(heading => resultText(heading) === 'Controlateral Operated Eye Information'));
  if (fellow.length === 1) Object.assign(inputEcho, echoedValues(fellow[0], FELLOW_FIELDS));
  return {
    eye, formula: 'PEARL-DGS', lensModel: '', sourceLabel,
    ...(inputEcho.target !== undefined ? {targetRefraction: inputEcho.target} : {}),
    ...(inputEcho.aConstant !== undefined ? {constants: [{name: 'A Constant', value: inputEcho.aConstant}]} : {}),
    ...(Object.keys(inputEcho).length ? {inputEcho} : {}),
  };
}

const ESCRS_ECHO_FIELDS = {AL:['al','mm'],ACD:['acd','mm'],LT:['lt','mm'],CCT:['cct','µm'],WTW:['wtw','mm'],K1:['k1','D'],K2:['k2','D'],n:['kIndex','']};
function textWithBreaks(node) {
  const copy=node.cloneNode(true);
  for(const br of copy.querySelectorAll('br'))br.replaceWith(' ');
  return resultText(copy);
}

function escrsContext(scope, eye) {
  const inputEcho={}, values=new Map(), duplicates=new Set();
  const labels=new Set([...Object.keys(ESCRS_ECHO_FIELDS),'IOL','TARGET','OPTION','SIA']);
  for(const table of scope.tables) {
    if(table.querySelector('input,select,textarea'))continue;
    for(const row of [...table.rows].filter(isResultVisible)) {
      const cells=[...row.cells];
      if(cells.some(cell=>cell.colSpan!==1 || cell.rowSpan!==1))continue;
      for(let i=0;i+1<cells.length;i+=2) {
        const label=resultText(cells[i]),value=resultText(cells[i+1]);
        if(!labels.has(label) || !cells[i].querySelector('strong') || !value || !isResultVisible(cells[i+1]))continue;
        if(values.has(label))duplicates.add(label);else values.set(label,value);
      }
    }
  }
  for(const label of duplicates)values.delete(label);
  for(const [label,[key,unit]] of Object.entries(ESCRS_ECHO_FIELDS)) {
    const raw=values.get(label);if(raw===undefined)continue;
    if(['K1','K2'].includes(label)) {
      const vector=raw.match(/^([+−–-]?(?:\d+(?:[.,]\d+)?|\.\d+))\s*D\s*@\s*(\d+(?:[.,]\d+)?)\s*°$/u);
      if(vector){inputEcho[key]=resultNumber(vector[1]);inputEcho[`${key}Axis`]=resultNumber(vector[2]);continue;}
    }
    const text=unit?raw.replace(new RegExp(`\\s*(?:${unit==='µm'?'[µμ]m':unit})$`,'u'),''):raw;
    const number=resultNumber(text);if(number!==undefined)inputEcho[key]=number;
  }
  const lens=values.get('IOL') || '',separator=lens.indexOf(' - ');
  const manufacturer=separator>0?lens.slice(0,separator):'';
  const lensModel=separator>0?lens.slice(separator+3):lens;
  const targetRefraction=resultNumber(values.get('TARGET'));
  if(targetRefraction!==undefined)inputEcho.target=targetRefraction;
  const option=values.get('OPTION') || '';
  if(option==='Toric')inputEcho.toric=true;
  const myopicNote='This calculation is only valid for patients who underwent prior MYOPIC LASIK/PRK.';
  const hasMyopicNote=option==='Post LASIK/PRK/RK' && scope.notes.filter(note=>resultText(note)===myopicNote).length===1;
  if(hasMyopicNote)inputEcho.lvcType='myopic';
  const sia=values.get('SIA')?.match(/^([+−–-]?(?:\d+(?:[.,]\d+)?|\.\d+))\s*D\s*@\s*(\d+(?:[.,]\d+)?)\s*°$/u);
  if(sia){
    inputEcho.sia=resultNumber(sia[1]);
    const incisionAxis=resultNumber(sia[2]);
    // Audited against the explicit "Incision @" result legend and the
    // pre-calculation Incision control; the printed SIA angle uses that axis.
    if(option==='Toric' && incisionAxis!==undefined && Number(incisionAxis)>=0 && Number(incisionAxis)<=360)inputEcho.incisionAxis=incisionAxis;
  }
  const sourceLabel=[option?`OPTION: ${option}`:'',hasMyopicNote?myopicNote:''].filter(Boolean).join(' · ');
  return {eye,lensModel,...(manufacturer?{manufacturer}:{}),...(targetRefraction!==undefined?{targetRefraction}:{}),...(Object.keys(inputEcho).length?{inputEcho}:{}),...(sourceLabel?{sourceLabel}:{})};
}

function readEscrsRegularMatrix(table, context) {
  if(!isResultVisible(table) || table.querySelector('input,select,textarea,table'))return [];
  const sourceRows=[...table.rows].filter(isResultVisible);
  const header=sourceRows[0],cells=header?[...header.cells]:[];
  if(cells.length<2 || resultText(cells[0])!=='SE PWR (D)' || cells.some(cell=>cell.colSpan!==1 || cell.rowSpan!==1))return [];
  const columns=[];
  for(const cell of cells.slice(1)) {
    const names=cell.querySelectorAll('strong');if(names.length!==1)return [];
    const formula=resultText(names[0]);if(!formula || formula.length>80)return [];
    const remainder=cell.cloneNode(true);remainder.querySelector('strong').remove();
    const constant=resultText(remainder).match(/^(A|pACD):\s*([+-]?(?:\d+(?:[.,]\d+)?|\.\d+))$/);
    if(!constant || resultNumber(constant[2])===undefined || columns.some(column=>column.formula===formula))return [];
    columns.push({formula,label:textWithBreaks(cell),constant:{name:constant[1],value:constant[2]}});
  }
  const groups=columns.map(column=>({...context,formula:column.formula,sourceLabel:['SE PWR (D)',context.sourceLabel].filter(Boolean).join(' · '),constants:[column.constant],rows:[]}));
  for(const row of sourceRows.slice(1,251)) {
    const rowCells=[...row.cells];
    if(rowCells.length!==cells.length || rowCells.some(cell=>cell.colSpan!==1 || cell.rowSpan!==1 || !isResultVisible(cell)))continue;
    const rawPower=resultText(rowCells[0]),iolPower=resultNumber(rawPower);if(iolPower===undefined)continue;
    for(let index=0;index<columns.length;index++) {
      const cell=rowCells[index+1],raw=resultText(cell);if(!raw)continue;
      const predictedRefraction=resultNumber(raw);
      // A nonempty malformed cell remains auditable as raw text, without a
      // fabricated refraction (the live Cooke zero cell can contain "-+0.00").
      groups[index].rows.push({iolPower,...(predictedRefraction!==undefined?{predictedRefraction}:{}),...(cell.classList.contains('is-target')?{highlighted:true}:{}),rawCells:[{label:'SE PWR (D)',value:rawPower},{label:columns[index].label,value:raw}]});
    }
  }
  return groups.filter(group=>group.rows.length);
}

function readEscrsToricMatrix(table, spherical) {
  if(!isResultVisible(table) || table.querySelector('input,select,textarea,table'))return [];
  const rows=[...table.rows].filter(isResultVisible),header=rows[0]?[...rows[0].cells]:[],labels=rows[1]?[...rows[1].cells]:[],data=rows.slice(2);
  if(header.length<2 || resultText(header[0])!=='' || header[0].colSpan!==1 || header.some(cell=>cell.rowSpan!==1) || !data.length || data.length>32)return [];
  const formulas=[];
  for(const cell of header.slice(1)){
    const strong=cell.querySelectorAll('strong');
    if(cell.colSpan!==2 || strong.length!==1 || !isResultVisible(cell))return [];
    const name=resultText(strong[0]);
    if(!name || formulas.includes(name) || !spherical.some(group=>group.formula===name))return [];
    formulas.push(name);
  }
  if(labels.length!==1+2*formulas.length || resultText(labels[0])!=='IOL Cyl.' || labels.some(cell=>cell.colSpan!==1 || cell.rowSpan!==1 || !isResultVisible(cell)))return [];
  for(let index=0;index<formulas.length;index++)if(resultText(labels[1+2*index])!=='IOL Axis' || resultText(labels[2+2*index])!=='Res. Cyl.')return [];
  const first=[...data[0].cells];
  if(first.length!==labels.length || first[0].colSpan!==1 || first[0].rowSpan!==1)return [];
  const axes=[];
  for(let index=0;index<formulas.length;index++){
    const axisCell=first[1+2*index],residual=first[2+2*index],axis=resultNumber(resultText(axisCell));
    if(axisCell.colSpan!==1 || axisCell.rowSpan!==data.length || residual.colSpan!==1 || residual.rowSpan!==1 || !isResultVisible(axisCell) || axis===undefined || Number(axis)<0 || Number(axis)>180)return [];
    axes.push({value:axis,raw:resultText(axisCell)});
  }
  const groups=formulas.map(formula=>{
    const {rows:unused,...context}=spherical.find(group=>group.formula===formula);
    return {...context,sourceLabel:context.sourceLabel.replace(/^SE PWR \(D\)/,'IOL Cyl. / IOL Axis / Res. Cyl.'),cylinderPlane:'iol',rows:[]};
  });
  for(let rowIndex=0;rowIndex<data.length;rowIndex++){
    const cells=[...data[rowIndex].cells];
    if(rowIndex>0 && (cells.length!==1+formulas.length || cells.some(cell=>cell.colSpan!==1 || cell.rowSpan!==1)))return [];
    if(cells.some(cell=>!isResultVisible(cell)))return [];
    const power=resultText(cells[0]).match(/^([+−–-]?(?:\d+(?:[.,]\d+)?|\.\d+))\s*\(([^()]{1,32})\)$/u);
    const toricPower=power?resultNumber(power[1]):undefined;if(toricPower===undefined)return [];
    for(let index=0;index<formulas.length;index++){
      const cell=cells[rowIndex===0?2+2*index:1+index],raw=resultText(cell);if(!raw)continue;
      const residual=raw.match(/^([+−–-]?(?:\d+(?:[.,]\d+)?|\.\d+))\s*x\s*(\d+(?:[.,]\d+)?)\s*°(?:\s*↺)?$/u);
      const residualCylinder=residual?resultNumber(residual[1]):undefined,residualAxis=residual?resultNumber(residual[2]):undefined;
      groups[index].rows.push({toricPower,axis:axes[index].value,lensModel:power[2],...(residualCylinder!==undefined?{residualCylinder}:{}),...(residualAxis!==undefined && Number(residualAxis)<=180?{residualAxis}:{}),...(cell.classList.contains('is-target')?{highlighted:true}:{}),rawCells:[{label:'IOL Cyl.',value:resultText(cells[0])},{label:'IOL Axis',value:axes[index].raw},{label:'Res. Cyl.',value:raw}]});
    }
  }
  return groups.filter(group=>group.rows.length);
}

function readEscrsResults(document) {
  let url;try{url=new URL(document.URL);}catch{return [];}
  if(url.hostname!=='iolcalculator.escrs.org' || url.pathname!=='/')return [];
  if(uniqueVisible(document.querySelectorAll('[role="dialog"],dialog[open]')).length)return [];
  if(uniqueVisible(document.querySelectorAll('[role="progressbar"][aria-label="Calculation in progress"]')).length)return [];
  const roots=uniqueVisible(document.querySelectorAll('#pdfContent'));if(roots.length!==1)return [];
  const root=roots[0],groups=[],seenEyes=new Set();
  const headings=uniqueVisible(root.querySelectorAll('h6')).filter(heading=>['OD (Right)','OS (Left)'].includes(resultText(heading)));
  const following=(first,second)=>!!(first.compareDocumentPosition(second)&4);
  for(const [index,heading] of headings.entries()) {
    const eye=resultText(heading)==='OD (Right)'?'OD':'OS';
    if(seenEyes.has(eye))return [];seenEyes.add(eye);
    const next=headings[index+1],within=node=>following(heading,node) && (!next || following(node,next));
    // Toric headings are unwrapped; regular eyes have a print wrapper. The
    // explicit OD/OS headings, not column/chart position, delimit both layouts.
    const tables=uniqueVisible(root.querySelectorAll('table')).filter(table=>!table.querySelector('table') && within(table));
    const notes=uniqueVisible(root.querySelectorAll('p')).filter(within);
    const matrices=tables.filter(table=>resultText(table.rows[0]?.cells[0])==='SE PWR (D)');
    if(matrices.length!==1)continue;
    const context=escrsContext({tables,notes},eye),spherical=readEscrsRegularMatrix(matrices[0],context);
    groups.push(...spherical);
    if(context.inputEcho?.toric===true){
      const toric=tables.filter(table=>resultText(table.rows[1]?.cells[0])==='IOL Cyl.');
      if(toric.length===1)groups.push(...readEscrsToricMatrix(toric[0],spherical));
    }
  }
  return groups;
}

/** Read only audited DGS result cards. Never submit, select, or inspect app state. */
export function readEscrsDgsResults(document, profile) {
  if (profile?.id === 'escrs') return readEscrsResults(document);
  const expected = DGS_RESULTS[profile?.id];
  if (!expected) return [];
  let url;
  try { url = new URL(document.URL); } catch { return []; }
  if (url.hostname !== 'iolsolver.com' || url.pathname.replace(/\/$/, '') !== expected.path) return [];
  const mains = uniqueVisible(document.querySelectorAll('main'));
  if (mains.length !== 1) return [];
  const main = mains[0];
  const titles = uniqueVisible(main.querySelectorAll('h3')).map(resultText).filter(title => typeof expected.title === 'string' ? title === expected.title : expected.title.test(title));
  if (titles.length !== 1) return [];
  const sourceLabel = titles[0], groups = [], seenEyes = new Set();
  for (const card of uniqueVisible(main.querySelectorAll('.iol-right-v-sheet,.iol-left-v-sheet'))) {
    const headers = uniqueVisible(card.querySelectorAll('h2')).map(resultText);
    if (headers.length !== 1 || !['OD','OS'].includes(headers[0])) continue;
    const eye = headers[0];
    if (card.classList.contains(eye === 'OD' ? 'iol-left-v-sheet' : 'iol-right-v-sheet') || seenEyes.has(eye)) return [];
    seenEyes.add(eye);
    const context = contextFromCard(card, sourceLabel, eye);
    const spherical = uniqueVisible(card.querySelectorAll('.iol-v2-results table'));
    if (spherical.length !== 1) continue;
    const base = readResultTable(spherical[0], {aliases: SPHERICAL_ALIASES, rowMarkers, ...context});
    if (!base) continue;
    if (profile.id !== 'solver-toric') { groups.push(base); continue; }
    const cylinders = uniqueVisible(card.querySelectorAll('.iol-v2-tor-results table'));
    if (cylinders.length !== 1 || base.rows.length !== 1) continue;
    const toric = readResultTable(cylinders[0], {aliases: TORIC_ALIASES, require: ['toricPower','residualCylinder','residualAxis'], rowMarkers, ...context});
    if (!toric) continue;
    const selectedPower = base.rows[0];
    // The single printed spherical row explicitly supplies context for this
    // cylinder table. Do not derive an implantation axis from residual axis.
    toric.rows = toric.rows.map(row => ({iolPower: selectedPower.iolPower, predictedRefraction: selectedPower.predictedRefraction, ...row, rawCells: [...selectedPower.rawCells, ...row.rawCells]}));
    groups.push(toric);
  }
  return groups;
}

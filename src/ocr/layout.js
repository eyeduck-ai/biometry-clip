// Geometry is retained until explicit eye headings and labelled summary cells
// have been associated. No value or missing eye is inferred from its magnitude.
const FIELD=/(?<![A-Za-z0-9])(?<label>TK[12](?:\s*(?:axis|ax))?|K[12](?:\s*(?:axis|ax))?|Axial\s*length|Anterior\s*chamber\s*depth|Lens\s*thickness|Central\s*corneal\s*thickness|White\s*[-–]?\s*to\s*[-–]?\s*White|W\s*[-–]\s*W|K\s*flat|Flat\s*K|K\s*steep|Steep\s*K|Flat\s*(?:axis|ax)|Steep\s*(?:axis|ax)|Surgically\s*induced\s*astigmatism|AL|ACD|LT|CCT|WTW|Target(?:\s*ref(?:raction)?)?|SIA|Incision\s*(?:axis|location)|眼軸長|眼軸|前房深度|水晶體厚度|角膜厚度|角膜直徑|目標屈光度|切口軸位)(?![A-Za-z0-9])\.?\s*[:：=]?/gi;
const NUMBER='[+\\-−]?\\d+(?:[.,]\\d+)?';
const FIRST=new RegExp(`^\\s*[!*]?\\s*(${NUMBER})(?:\\s*[!*])?`);
const KFIELD=/^(?:tk|k)[12]$/;
const eyeName=text=>{
  const compact=text.trim().replace(/[()：:]/g,' ').replace(/\s+/g,' ').trim();
  if(/^(?:OD(?:\s*right)?|right(?:\s*OD)?|右眼)$/i.test(compact))return 'OD';
  if(/^(?:OS(?:\s*left)?|left(?:\s*OS)?|左眼)$/i.test(compact))return 'OS';
  return null;
};
const LABEL_KEYS={axiallength:'al',anteriorchamberdepth:'acd',lensthickness:'lt',centralcornealthickness:'cct',whitetowhite:'wtw',ww:'wtw',kflat:'k1',flatk:'k1',ksteep:'k2',steepk:'k2',flataxis:'k1Axis',flatax:'k1Axis',steepaxis:'k2Axis',steepax:'k2Axis',surgicallyinducedastigmatism:'sia',incisionlocation:'incisionAxis',眼軸長:'al',眼軸:'al',前房深度:'acd',水晶體厚度:'lt',角膜厚度:'cct',角膜直徑:'wtw',目標屈光度:'target',切口軸位:'incisionAxis'};
const keyFor=label=>{
  const compact=label.toLowerCase().replace(/[\s–-]+/g,'');
  return LABEL_KEYS[compact]||compact.replace(/(axis|ax)$/,'Axis').replace(/^target.*$/,'target');
};
const numeric=value=>value?.replace('−','-').replace(',','.').replace(/^\+/,'');

export function positionedItems(items){
  return (items||[]).flatMap((item,index)=>{
    if(typeof item?.text!=='string'||!item.text.trim())return [];
    const points=item.poly||[],xs=points.map(p=>Array.isArray(p)?p[0]:p.x).filter(Number.isFinite),ys=points.map(p=>Array.isArray(p)?p[1]:p.y).filter(Number.isFinite);
    const x=xs.length?Math.min(...xs):Number(item.x),y=ys.length?Math.min(...ys):Number(item.y);
    const width=xs.length?Math.max(...xs)-x:Number(item.width),height=ys.length?Math.max(...ys)-y:Number(item.height);
    if(![x,y,width,height].every(Number.isFinite)||height<=0)return [];
    return [{...item,text:item.text,x,y,width:Math.max(0,width),height,index,center:y+height/2}];
  });
}

export function positionedRows(items){
  const points=positionedItems(items).sort((a,b)=>a.center-b.center||a.x-b.x),rows=[];
  for(const point of points){
    const row=rows.slice(-5).reverse().find(row=>Math.abs(row.center-point.center)<=Math.max(.5,Math.min(row.height,point.height)*.65));
    if(row){row.points.push(point);row.center=row.points.reduce((sum,p)=>sum+p.center,0)/row.points.length;row.height=Math.max(row.height,point.height);}
    else rows.push({points:[point],center:point.center,height:point.height});
  }
  return rows.sort((a,b)=>a.center-b.center).map(row=>{
    const points=row.points.sort((a,b)=>a.x-b.x),intervals=[];let text='',previous;
    for(const point of points){
      // PDF character runs may split a word into single glyphs. OCR words are
      // already complete spans. Preserve real whitespace in either source.
      const gap=previous?point.x-(previous.x+previous.width):0;
      const glyphs=previous&&previous.text.trim().length===1&&point.text.trim().length===1;
      const join=previous&&!/\s$/.test(text)&&!/^\s/.test(point.text)?(glyphs&&gap<=Math.min(previous.height,point.height)*.16?'':' '):'';
      text+=join;intervals.push({start:text.length,end:text.length+point.text.length,point});text+=point.text;previous=point;
    }
    return {...row,text,intervals};
  });
}

function positionAt(row,index){
  const interval=row.intervals.find(part=>part.start<=index&&part.end>index)||row.intervals.at(-1);
  if(!interval)return 0;
  return interval.point.x+interval.point.width*Math.max(0,index-interval.start)/Math.max(1,interval.end-interval.start);
}

function fieldConfidence(row,ranges,heading){
  const scores=row.intervals.filter(part=>ranges.some(([start,end])=>part.start<end&&part.end>start)).map(part=>part.point.score);
  if(heading!==undefined)scores.push(heading);
  const known=scores.filter(value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1);
  return known.length?Math.min(...known):undefined;
}

function measurementValue(key,tail){
  if(/^\s*(?:[-—–−]\s*){2,}/.test(tail))return null;
  if(key==='target'&&/^\s*plano\b/i.test(tail))return {value:'0',unit:'D',valueRange:[0,tail.match(/^\s*plano\b/i)[0].length]};
  const first=tail.match(FIRST);if(!first)return null;
  let value=numeric(first[1]),unit='',axis;
  let valueRange=[first[0].indexOf(first[1]),first[0].indexOf(first[1])+first[1].length],axisRange;
  if(KFIELD.test(key)){
    // Radius/power reports explicitly print both mm and D. Keep the printed
    // diopter value; never convert a radius using an assumed refractive index.
    const primary=tail.split(/\b(?:SD|SNR)\s*:?/i)[0];
    const diopter=primary.match(new RegExp(`(${NUMBER})\\s*(?:D|dpt)\\b`,'i'));
    if(diopter){value=numeric(diopter[1]);valueRange=[diopter.index,diopter.index+diopter[0].length];}
    else if(new RegExp(`^\\s*[!*]?\\s*${NUMBER}\\s*mm\\b`,'i').test(tail))return null;
    unit='D';
    const marker=primary.match(new RegExp(`(?:@|\\baxis\\b|\\bax\\b)\\s*(${NUMBER})\\s*(?:°|deg(?:rees?)?)?`,'i'));
    if(marker){axis=numeric(marker[1]);axisRange=[marker.index,marker.index+marker[0].length];}
  }else{
    const following=tail.slice(first[0].length).match(/^\s*(mm|[µμu]m|D|°|deg(?:rees?)?)(?![A-Za-z])/i);
    unit=following?.[1]||'';
    if(following)valueRange[1]=first[0].length+following[0].length;
    // An SD value belongs to a distinct labelled statistic, not this value.
    // Other unexplained numeric values remain unassigned rather than guessed.
    const rest=tail.slice(first[0].length).replace(/^\s*(?:mm|[µμu]m|D|°|deg(?:rees?)?)/i,'').trim();
    if(new RegExp(NUMBER).test(rest)&&!/^\s*(?:SD|SNR|Ix|Iy|Kappa|Pupil|SE|Avg\.?\s*K|Ast\.?\s*K|ΔK|∆K|\+\/\-|±|\()/i.test(rest)&&!/^\s*[A-Za-z][A-Za-z ]{0,20}\s*:/i.test(rest))return null;
  }
  return {value,unit,axis,valueRange,axisRange};
}

function patientLines(rows,evidence){
  const lines=[];
  for(const row of rows){
    const id=row.text.match(/\bPatient\s*ID\s*[:：=]?\s*([A-Za-z0-9][A-Za-z0-9._/-]*)/i);
    if(id){lines.push(`Patient ID: ${id[1]}`);const confidence=fieldConfidence(row,[[id.index,id.index+id[0].length]]);evidence.push({eye:'patient',key:'patientId',value:id[1],rawText:id[0],...(confidence!==undefined?{confidence}:{})});}
    const gender=row.text.match(/\b(?:Gender|Sex)\s*[:：=]?\s*(Male|Female|Other|Unknown|M|F)\b/i);
    if(gender){const value=gender[1].toLowerCase().replace(/^m$/,'male').replace(/^f$/,'female');lines.push(`Gender: ${value}`);const confidence=fieldConfidence(row,[[gender.index,gender.index+gender[0].length]]);evidence.push({eye:'patient',key:'gender',value,rawText:gender[0],...(confidence!==undefined?{confidence}:{})});}
  }
  return lines;
}

/** Produce canonical explicit-eye lines from label/value cells, with evidence. */
export function labelledBiometry(items){
  const rows=positionedRows(items),warnings=[],evidence=[],identity=patientLines(rows,evidence);
  const markers=[];
  for(const row of rows){
    for(const point of row.points){const eye=eyeName(point.text);if(eye)markers.push({eye,x:point.x+point.width/2,y:row.center,height:row.height,confidence:point.score});}
    // Some native PDF generators emit each glyph separately. Reading headings
    // from these joined runs is safe only when OD/OS are explicit whole words.
    for(const match of row.text.matchAll(/\b(OD|OS)\b/gi))if(!markers.some(marker=>marker.y===row.center&&marker.eye===match[1].toUpperCase()))markers.push({eye:match[1].toUpperCase(),x:positionAt(row,match.index),y:row.center,height:row.height,confidence:fieldConfidence(row,[[match.index,match.index+match[0].length]])});
  }
  let firstValue=Infinity;
  for(const row of rows)for(const match of row.text.matchAll(FIELD))if(FIRST.test(row.text.slice(match.index+match[0].length)))firstValue=Math.min(firstValue,row.center);
  let headings=markers.filter(marker=>marker.y<=firstValue+marker.height*1.5);
  if(!headings.length)headings=markers;
  if(!headings.length)return {text:rows.map(row=>row.text).join('\n'),warnings,evidence,hasLayout:false};
  const lastY=Math.max(...headings.map(marker=>marker.y));headings=headings.filter(marker=>Math.abs(marker.y-lastY)<marker.height*2);
  const byEye=new Map();for(const marker of headings)byEye.set(marker.eye,marker);
  const bounds=rows.flatMap(row=>row.points),minX=Math.min(...bounds.map(p=>p.x)),maxX=Math.max(...bounds.map(p=>p.x+p.width)),pageWidth=Math.max(1,maxX-minX);
  if(byEye.size===1&&rows.some(row=>{
    const fields=new Map();for(const match of row.text.matchAll(FIELD)){const key=keyFor(match.groups.label);if(!fields.has(key))fields.set(key,[]);fields.get(key).push(positionAt(row,match.index));}
    return [...fields.values()].some(xs=>xs.length>1&&Math.max(...xs)-Math.min(...xs)>pageWidth*.25);
  })){
    warnings.push('雙眼版面僅讀到一個眼別標題，眼部數值保留空白。');
    return {text:identity.join('\n'),warnings,evidence,hasLayout:true};
  }
  const ordered=[...byEye.values()].sort((a,b)=>a.x-b.x),midpoint=ordered.length===2?(ordered[0].x+ordered[1].x)/2:null;
  const sharedColumns=ordered.length===2&&rows.some(row=>Math.abs(row.center-lastY)<row.height*2&&/^\s*(?:OD\s+OS|OS\s+OD)\s*$/i.test(row.text));
  const sectionMarkers=ordered.length===1?markers.filter(marker=>Math.abs(marker.x-ordered[0].x)<pageWidth*.15).sort((a,b)=>a.y-b.y):[];
  const lines=[...identity];
  for(const row of rows){
    if(row.center<Math.min(...headings.map(marker=>marker.y))-row.height)continue;
    // Formula result tables and explanatory legends are not measurements.
    if(/\b(?:IOL|Lens\s*factor|A[ -]?constant)\b/i.test(row.text)&&/\b(?:Ref|Res|Power|D)\b/i.test(row.text))continue;
    const matches=[...row.text.matchAll(FIELD)];
    if(matches.length===1&&ordered.length===2&&!/\bSD|±|\+\s*\/\s*-/i.test(row.text)){
      const match=matches[0],key=keyFor(match.groups.label),tailStart=match.index+match[0].length;
      const values=[...row.text.slice(tailStart).matchAll(new RegExp(NUMBER,'g'))];
      const expected=KFIELD.test(key)&&/[@°]|\baxis\b/i.test(row.text)?4:2;
      const sideValues=values.map(value=>positionAt(row,tailStart+value.index)<midpoint?0:1);
      const balanced=values.length===expected&&(sharedColumns||sideValues.slice(0,expected/2).every(side=>side===0)&&sideValues.slice(expected/2).every(side=>side===1));
      // A shared label followed by values beneath both explicit column headers.
      // A statistic in the same eye column cannot satisfy this geometry.
      if(balanced){
        lines.push(`${ordered[0].eye} ${ordered[1].eye}\n${row.text}`);
        const perEye=expected/2;
        for(const [side,heading]of ordered.entries())for(let slot=0;slot<perEye;slot++){
          const number=values[side*perEye+slot],begin=tailStart+number.index,end=begin+number[0].length;
          const field=slot===1?`${key}Axis`:key;
          const printed=numeric(number[0]),value=key==='cct'&&/\bmm\b/i.test(row.text)?String(Number(printed)*1000):printed;
          const confidence=fieldConfidence(row,[[match.index,tailStart],[begin,end]],heading.confidence),x=positionAt(row,begin);
          evidence.push({eye:heading.eye,key:field,value,rawText:row.text.slice(match.index).trim(),bbox:{x,y:row.center-row.height/2,width:Math.max(1,positionAt(row,end-1)-x),height:row.height},...(confidence!==undefined?{confidence}:{})});
        }
        continue;
      }
    }
    if(sharedColumns&&matches.length===1){
      // A single surviving value in a shared-label table is not necessarily OD.
      // Without complete cells, neither text order nor the label's X position
      // establishes its eye; an uncertainty/SD must not become the other eye.
      warnings.push(`${keyFor(matches[0].groups.label)} 雙眼欄位數不一致，保留空白。`);
      continue;
    }
    for(const [i,match]of matches.entries()){
      const key=keyFor(match.groups.label),start=match.index+match[0].length,end=matches[i+1]?.index??row.text.length;
      const untrimmed=row.text.slice(start,end),offset=start+untrimmed.length-untrimmed.trimStart().length;
      const tail=untrimmed.trim(),value=measurementValue(key,tail);if(!value)continue;
      const x=positionAt(row,match.index),section=sectionMarkers.filter(marker=>marker.y<=row.center+row.height/2).at(-1);
      const eye=ordered.length===1?(section?.eye||ordered[0].eye):(x<midpoint?ordered[0].eye:ordered[1].eye);
      const label=key.replace(/Axis$/,' axis');
      lines.push(`${eye}\n${label} ${value.value}${value.unit?' '+value.unit:''}${value.axis!==undefined?' @ '+value.axis+'°':''}`);
      const heading=ordered.length===1?(section||ordered[0]):byEye.get(eye),ranges=[[match.index,start],[offset+value.valueRange[0],offset+value.valueRange[1]]];
      const confidence=fieldConfidence(row,ranges,heading?.confidence);
      const normalized=key==='cct'&&/^mm$/i.test(value.unit)?String(Number(value.value)*1000):value.value;
      const item={eye,key,value:normalized,unit:key==='cct'&&/^mm$/i.test(value.unit)?'µm':value.unit,...(key==='cct'&&/^mm$/i.test(value.unit)?{sourceUnit:'mm'}:{}),rawText:row.text.slice(match.index,end).trim(),bbox:{x,y:row.center-row.height/2,width:Math.max(1,positionAt(row,end-1)-x),height:row.height},...(confidence!==undefined?{confidence}:{})};
      evidence.push(item);
      if(value.axis!==undefined){
        const confidence=fieldConfidence(row,[[match.index,start],[offset+value.axisRange[0],offset+value.axisRange[1]]],heading?.confidence);
        evidence.push({...item,key:`${key}Axis`,value:value.axis,unit:'°',confidence});
      }
    }
  }
  return {text:lines.join('\n'),warnings,evidence,hasLayout:true};
}

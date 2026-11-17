import {escapeHtml as esc,icon} from './ui.js';
import {manufacturerKey} from './lens-registry.js';

const roles=new Set(['primary','implanted','exchange']);
const kinds=new Set(['model','family','group']);
const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
const role=value=>clean(value)||'primary';
const roleLabel=value=>({primary:'計畫晶體',implanted:'已植入晶體',exchange:'換片晶體'})[role(value)]||'';
const entries=catalog=>Array.isArray(catalog?.entries)?catalog.entries:[];
const checkEye=eye=>{if(!['OD','OS'].includes(eye))throw new Error('請先選擇 OD 或 OS。');};
const sameEye=(source,eye)=>!source.eye||source.eye==='shared'||source.eye===eye;
const placeholder=value=>/^(?:|(?:please\s+)?(?:select|choose)(?:\s+(?:an?|iol|lens|model|type|manufacturer|one))*[.\s…]*|iol\s*(?:type|model)|lens\s*(?:type|model)|請選擇(?:晶體|型號)?|選擇(?:晶體|型號)?)$/i.test(clean(value).replace(/^[-–—\s]+|[-–—\s]+$/g,''));

function validAlias(alias){
  if(!alias||!['siteId','value','label'].every(key=>typeof alias[key]==='string'&&clean(alias[key])&&alias[key].length<=100)||placeholder(alias.label)||!roles.has(role(alias.role)))return false;
  if(['controlId','manufacturer'].some(key=>alias[key]!=null&&(typeof alias[key]!=='string'||!clean(alias[key])||alias[key].length>100)))return false;
  try{const url=new URL(alias.evidenceUrl);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)return false;}catch{return false;}
  return typeof alias.verifiedAt==='string'&&/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(alias.verifiedAt)&&Number.isFinite(Date.parse(alias.verifiedAt));
}
function aliasEye(alias){
  const matches=clean(alias.controlId).toUpperCase().match(/(?:^|[^A-Z])(OD|OS)(?=$|[^A-Z])/g)||[];
  const eyes=[...new Set(matches.map(value=>value.match(/OD|OS/)[0]))];
  return eyes.length===1?eyes[0]:'';
}
function chooseAlias(entry,eye){
  if(!entry||!kinds.has(entry.kind))return null;
  const aliases=(entry.aliases||[]).filter(validAlias);
  const score=alias=>{
    const maker=!!clean(alias.manufacturer)&&manufacturerKey(alias.manufacturer)===manufacturerKey(entry.manufacturer);
    const selectedEye=aliasEye(alias);
    return (alias.siteId==='escrs'&&selectedEye===eye&&maker?100:0)+(role(alias.role)==='primary'?20:0)+(selectedEye===eye?8:!selectedEye?4:0)+(maker?2:0);
  };
  return aliases.map((alias,index)=>({alias,index,score:score(alias)})).sort((a,b)=>b.score-a.score||a.index-b.index)[0]?.alias||null;
}
function patch(source,selected,eye,catalogId=''){
  return {eyes:{[eye]:{
    iolSourceSite:source.siteId||'',iolSourceValue:selected.value||'',iolSourceLabel:selected.label||'',
    iolSourceControl:source.controlId||'',iolSourceManufacturer:source.manufacturer||'',
    iolSourceRole:role(source.role),iolCatalogId:catalogId,
  }}};
}
function selectedSource(snapshot,eye){
  if(!snapshot||!sameEye(snapshot,eye)||!clean(snapshot.siteId)||!roles.has(role(snapshot.role)))return false;
  const selected=snapshot.selected;
  if(!selected||!clean(selected.value)||!clean(selected.label)||placeholder(selected.label)||!['model','family','group','geometry'].includes(selected.kind))return false;
  // Linked menus can be closed when read. If options are present, require the
  // selected identity to be unique; never infer a selection from the first row.
  if(Array.isArray(snapshot.options)&&snapshot.options.length){
    const matches=snapshot.options.filter(option=>option.value===selected.value&&option.label===selected.label&&option.kind===selected.kind);
    if(matches.length!==1)return false;
  }
  return true;
}

/** A deliberate canonical choice uses a published alias, retaining its context. */
export function lensPatchFromEntry(entry,eye){
  checkEye(eye);
  const alias=chooseAlias(entry,eye);
  if(!alias||!clean(entry.id))throw new Error('這個晶體尚無已核對的網站選項。');
  return patch(alias,alias,eye,entry.id);
}

/** Only exact, unique source identities acquire a canonical ID. */
export function lensPatchFromSource(snapshot,eye,catalog){
  checkEye(eye);
  if(!selectedSource(snapshot,eye))throw new Error('請選擇目前眼別已明確選定的晶體。');
  const selected=snapshot.selected;
  const matches=selected.kind==='geometry'?[]:entries(catalog).filter(entry=>entry.kind===selected.kind&&(entry.aliases||[]).some(alias=>
    validAlias(alias)&&alias.siteId===snapshot.siteId&&alias.value===selected.value&&alias.label===selected.label&&
    (alias.controlId||'')===(snapshot.controlId||'')&&role(alias.role)===role(snapshot.role)&&
    ((!clean(alias.manufacturer)&&!clean(snapshot.manufacturer))||(clean(alias.manufacturer)&&clean(snapshot.manufacturer)&&manufacturerKey(alias.manufacturer)===manufacturerKey(snapshot.manufacturer)))
  ));
  const ids=[...new Set(matches.map(entry=>entry.id).filter(Boolean))];
  return patch(snapshot,selected,eye,ids.length===1?ids[0]:'');
}

function displayEntry(entry){
  const name=clean(entry.name),code=clean(entry.modelCode);
  return [clean(entry.manufacturer),name,code&&code!==name?code:'',entry.kind==='model'?'':entry.kind==='group'?'群組':'系列'].filter(Boolean).join(' · ');
}

/** Native compact controls only; the app owns state, focus and change events. */
export function lensMarkup({eye='OD',data={},catalog,inventory,search='',open}={}){
  checkEye(eye);
  const current=data?.eyes?.[eye]||data||{},currentId=clean(current.iolCatalogId),query=clean(search).normalize('NFKC').toLocaleLowerCase();
  const all=entries(catalog),found=all.filter(entry=>!query||[entry.manufacturer,entry.name,entry.modelCode].some(value=>clean(value).normalize('NFKC').toLocaleLowerCase().includes(query)))
    .map((entry,index)=>({entry,index})).sort((a,b)=>(a.entry.kind==='model'?0:1)-(b.entry.kind==='model'?0:1)||a.index-b.index).map(item=>item.entry);
  let shown=found.slice(0,100);
  const currentEntry=all.find(entry=>entry.id===currentId);
  if(currentEntry&&!shown.some(entry=>entry.id===currentId))shown=[currentEntry,...shown.slice(0,99)];
  const options=shown.map(entry=>`<option value="${esc(entry.id)}"${entry.id===currentId?' selected':''}${chooseAlias(entry,eye)?'':' disabled'}>${esc(displayEntry(entry))}</option>`).join('');
  const missing=currentId&&!currentEntry?`<option value="${esc(currentId)}" selected>目前：${esc(current.iolSourceLabel||currentId)}</option>`:'';
  const sourceOptions=(inventory?.snapshots||[]).map((snapshot,index)=>({snapshot,index})).filter(({snapshot})=>selectedSource(snapshot,eye)&&kinds.has(snapshot.selected.kind)).map(({snapshot,index})=>{
    const label=[snapshot.eye==='shared'||!snapshot.eye?'共用':snapshot.eye,roleLabel(snapshot.role),snapshot.siteId,snapshot.formula,snapshot.manufacturer,snapshot.selected.label].filter(Boolean).join(' · ');
    return `<option value="${index}">${esc(label)}</option>`;
  }).join('');
  const count=found.length>100?`顯示前 100 項，共 ${found.length} 項`:`${found.length} 項`;
  const selectedIdentity=clean(current.iolSourceLabel)||(currentEntry?displayEntry(currentEntry):'')||clean(current.iolSourceValue);
  const selectedLabel=selectedIdentity||(currentId?'已選擇晶體':'尚未選擇');
  return `<details class="extra" id="lens-section"${(open??!!query)?' open':''}><summary><span>水晶體</span> · <span${selectedIdentity?' data-i18n-skip':''}>${esc(selectedLabel)}</span><span>${icon('chevron',13)}</span></summary>
    <label class="field" for="lens-search"><span>查詢晶體 <small data-lens-count>${esc(count)}</small></span><input id="lens-search" type="search" value="${esc(search)}" placeholder="廠牌、名稱或型號" autocomplete="off"></label>
    <label class="field" for="lens-picker"><span>晶體對照目錄</span><select id="lens-picker"><option value=""${currentId?'':' selected'}>選擇晶體</option>${missing}${options}</select></label>
    <label class="field" for="lens-source-picker"><span>本頁已選晶體</span><select id="lens-source-picker"${sourceOptions?'':' disabled'}><option value="" selected>${sourceOptions?'選擇來源與用途':'先複製網站或收集本頁晶體'}</option>${sourceOptions}</select></label>
    <button type="button" class="text-button" data-action="clear-lens">清除晶體選擇</button></details>`;
}

/** Refresh results without replacing the active search node or its IME session. */
export function updateLensControls(section,options){
  if(!section)return;
  const template=section.ownerDocument.createElement('template');
  template.innerHTML=lensMarkup(options);
  for(const id of ['lens-picker','lens-source-picker']){
    const current=section.querySelector(`#${id}`),next=template.content.querySelector(`#${id}`);
    if(current&&next){
      // Removing each option can make its source select auto-select the next
      // row. Retain the intended choice before moving nodes, then restore it.
      const selectedValue=next.value;
      current.replaceChildren(...next.childNodes);current.value=selectedValue;current.disabled=next.disabled;
    }
  }
  const count=section.querySelector('[data-lens-count]'),nextCount=template.content.querySelector('[data-lens-count]');
  if(count&&nextCount)count.textContent=nextCount.textContent;
  const summary=section.querySelector('summary'),nextSummary=template.content.querySelector('summary');
  if(summary&&nextSummary)summary.replaceChildren(...nextSummary.childNodes);
}

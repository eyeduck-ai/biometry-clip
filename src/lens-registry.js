import {parseLensCatalogDocument,resolveLensSelection} from './lens-catalog.js';
import {APACRS_LENS_DEFINITIONS,APACRS_LENS_SOURCES,APACRS_LENS_ENTRIES,APACRS_LENS_PARAMETER_PRESETS,APACRS_MODEL_PROJECTIONS,EVO_TECNIS_LENS_DEFINITIONS,EVO_TECNIS_LENS_SOURCES,EVO_EXPLICIT_MODEL_ENTRIES,TECNIS_MODEL_PROJECTIONS,EVO_GUIDE_RULES} from './lens-sites-apacrs.js';
import {LENS_OTHER_DEFINITIONS,OTHER_LENS_SOURCES,OTHER_LENS_EXACT_MODELS,OTHER_LENS_MEMBERSHIPS} from './lens-sites-other.js';
import {ESCRS_LENS_DEFINITIONS,ESCRS_LENS_SOURCES} from './lens-sites-escrs.js';

const at='2026-11-15T00:00:00.000Z',clone=value=>structuredClone(value);
const clean=value=>String(value??'').normalize('NFKC').replace(/[\u200b\ufeff]/g,'').replace(/\s+/g,' ').trim();
const own=(value,key)=>Object.hasOwn(value,key),present=value=>value!=null&&String(value).trim()!=='';
const unique=(values,key=JSON.stringify)=>[...new Map(values.map(value=>[key(value),value])).values()];
const literal=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

export function manufacturerKey(value){
  const name=clean(value).toLowerCase().replace(/[^a-z0-9]/g,'');
  if(/johnson|^jj$|^amo$|abbottmedicaloptics/.test(name))return 'johnson-johnson';
  if(/bausch|^bl$/.test(name))return 'bausch-lomb';
  if(/zeiss/.test(name))return 'zeiss';
  if(/^hoya/.test(name))return 'hoya';
  if(/^alcon/.test(name))return 'alcon';
  if(/^rayner/.test(name))return 'rayner';
  if(/physiol/.test(name))return 'physiol';
  if(name==='mbi'||name==='millenniumbiomedical')return 'millennium-biomedical';
  return name||'unknown';
}
export function modelCodeKey(value){
  // Plus/minus power variants, injector suffixes, and region qualifiers survive.
  // The publisher explicitly distinguishes Sensar AR40e from AR40E.
  return clean(value).replace(/AR40e/g,'AR40~e').replace(/[−–]/g,'-').replace(/\s+/g,'').toUpperCase();
}
function inferredCode(manufacturer,label){
  const value=clean(label),maker=manufacturerKey(manufacturer);
  if(['alcon','zeiss'].includes(maker)&&!value.includes('/')){
    const match=value.match(maker==='zeiss'?/\b(\d{3}[A-Z]{0,3})(\s*\([+-]D\))?$/i:/\b([A-Z]{1,8}\d[A-Z\d-]*)(\s*\([+-]D\))?$/i);
    if(match)return match[1]+(match[2]||'');
  }
  return value;
}
function hash(value){let result=2166136261;for(const char of value){result^=char.charCodeAt(0);result=Math.imul(result,16777619);}return (result>>>0).toString(16);}
export function canonicalLensId(manufacturer,modelCode,kind='model'){
  const key=`${kind}:${manufacturerKey(manufacturer)}:${encodeURIComponent(modelCodeKey(modelCode))}`;
  return key.length<=100?key:`${key.slice(0,88)}:${hash(key)}`;
}
const semanticKey=entry=>JSON.stringify([entry.kind,manufacturerKey(entry.manufacturer),modelCodeKey(entry.modelCode)]);
const aliasKey=alias=>JSON.stringify([alias.siteId,alias.controlId||'',alias.manufacturer||'',alias.role||'primary',alias.value,alias.label]);
const sourceKey=source=>JSON.stringify([source.siteId,source.controlId||'',source.eye||'',source.formula||'',source.role||'primary',source.manufacturer||'']);
const optionKey=option=>JSON.stringify([option.value,option.label]);
function explicitFamily(manufacturer,label){
  const maker=manufacturerKey(manufacturer),text=clean(label),code=modelCodeKey(text);
  if(maker==='johnson-johnson'&&/^(?:DET|DFW|DIU|DRT|DXW|ZCT|ZCU|ZFW|ZKU|ZLU|ZMT|ZXT|ZXW)$/.test(code))return `jj:${code}`;
  if(maker==='alcon'){
    const range=text.match(/\b(SA6AT|SN6AT|SND1T|SV25T|TFNT|DFT)\s*\(\d+\s*-\s*\d+\)/i);
    if(range)return `alcon:${range[1].toUpperCase()}x`;
    const series=text.match(/\b(SA6AT|SN6AT|SND1T|SV25T|TFNT|DFT|CNW0T)x\b/i);
    if(series)return `alcon:${series[1].toUpperCase()}x`;
    if(/\bCNW0T\d+-T\d+\b/i.test(text))return 'alcon:CNW0Tx';
  }
  return null;
}
function namedFamily(manufacturer,label){
  const maker=manufacturerKey(manufacturer),name=clean(label).toLowerCase();
  if(maker==='bausch-lomb'){
    for(const family of ['aspire','envy','luxgood','luxsmart','luxlife'])if(new RegExp(`\\b${family}\\b`,'i').test(name))return `bl:${family}`;
    if(/\benvista\b/.test(name))return 'bl:envista';
  }
  if(maker==='alcon'&&!/panoptix pro/i.test(name)){
    if(/\bvivity\b/.test(name))return 'alcon:vivity';
    if(/\bpanoptix\b/.test(name))return 'alcon:panoptix';
  }
  if(maker==='rayner'){
    if(/\b(?:rayone\s+)?emv\b/.test(name))return 'rayner:emv';
    if(/\b(?:rayone\s+)?galaxy\b/.test(name))return 'rayner:galaxy';
  }
  if(maker==='astvisioncare')for(const family of ['monofocal','pluris','edof','trifocal'])if(new RegExp(`\\basqelio\\s+${family}\\b`).test(name))return `ast:${family}`;
  return null;
}
function explicitNamedFamilyOption(manufacturer,label){
  const maker=manufacturerKey(manufacturer),name=clean(label).toLowerCase().replace(/\btoric\b/g,'').replace(/\s+/g,' ').trim();
  return maker==='bausch-lomb'&&/^(?:envista(?: aspire| envy)?|luxgood|luxsmart|luxlife)$/.test(name)||maker==='rayner'&&/^rayone (?:emv|galaxy)$/.test(name);
}
const isToricSource=source=>source.formula==='toric'||source.siteId==='evo-toric'||source.siteId==='tecnis-toric';
function aliasIsToric(alias){
  if(/\btoric\b/i.test(alias.label)||alias.siteId==='evo-toric'||alias.siteId==='tecnis-toric')return true;
  // APACRS exposes the same preset dropdown in both ordinary and toric pages;
  // those page names alone do not turn a spherical model into a toric one.
  return publishedSources.some(source=>source.siteId===alias.siteId&&(!alias.controlId||source.controlId===alias.controlId)&&(!alias.manufacturer||source.manufacturer===alias.manufacturer)&&source.formula==='toric'&&source.options.some(option=>option.value===alias.value&&option.label===alias.label));
}
// A published menu may deliberately contain indistinguishable labels. Keep
// the greatest multiplicity observed in any one menu, without double-counting
// the same menu captured for OD/OS or normal/toric modes.
function unionMenus(menus){
  const maxima=new Map();
  for(const menu of menus){const counts=new Map();for(const option of menu){const key=optionKey(option);if(!counts.has(key))counts.set(key,[]);counts.get(key).push(option);}for(const [key,items]of counts)if(items.length>(maxima.get(key)?.length||0))maxima.set(key,items);}
  return [...maxima.values()].flat();
}
const definitionSets={...APACRS_LENS_DEFINITIONS,...EVO_TECNIS_LENS_DEFINITIONS,...LENS_OTHER_DEFINITIONS,...ESCRS_LENS_DEFINITIONS};
const controlFor=(siteId,id)=>definitionSets[siteId]?.controls?.find(control=>control.id===id);
function enrichSource(source){
  const next=clone(source),control=controlFor(next.siteId,next.controlId);
  if(control?.role&&!next.role)next.role=control.role;
  // An explicit range is a family, even when its UI displays one list row.
  if(next.siteId==='escrs')next.options=next.options.map(option=>explicitFamily(next.manufacturer,option.label)||explicitNamedFamilyOption(next.manufacturer,option.label)||/\(\d+\s*-\s*\d+\)|\b[A-Z]+\d+-[A-Z]?\d+\b/.test(option.label)?{...option,kind:'family'}:option);
  return next;
}
const publishedSources=[...APACRS_LENS_SOURCES,...EVO_TECNIS_LENS_SOURCES,...OTHER_LENS_SOURCES,...ESCRS_LENS_SOURCES].map(enrichSource);
function optionFor(siteId,value,controlId){return publishedSources.filter(source=>source.siteId===siteId&&(!controlId||source.controlId===controlId)).flatMap(source=>source.options).find(option=>option.value===value);}
function target(siteId,controlId,option,relation='member',extra={}){
  const control=controlFor(siteId,controlId);
  return {siteId,controlId,role:control?.role||'primary',value:option.value,label:option.label,kind:option.kind,relation,evidenceUrl:definitionSets[siteId].url,verifiedAt:at,...extra};
}
function memberCode(code){return modelCodeKey(code).replace(/\([+-]D\)$/,'');}
function patternMatches(code,pattern){
  const expression=literal(modelCodeKey(pattern)).replace(/\\\?/g,'[A-Z0-9]').replace(/\\\*/g,'[A-Z0-9]*');
  return new RegExp(`^${expression}$`).test(memberCode(code));
}
const memberMatches=(entry,record)=>manufacturerKey(entry.manufacturer)===manufacturerKey(record.manufacturer)&&((record.memberCodes||[]).some(code=>modelCodeKey(code)===memberCode(entry.modelCode))||(record.memberCodePatterns||[]).some(pattern=>patternMatches(entry.modelCode,pattern)));

/** Published data only; no network, Chrome API, storage, or selection at import. */
function buildDefaultCatalog(){
  const bySemantic=new Map();
  function add(candidate){
    if(!candidate.aliases?.length)return;
    const item=clone(candidate),key=semanticKey(item),existing=bySemantic.get(key);
    item.id=canonicalLensId(item.manufacturer,item.modelCode,item.kind);
    item.targets||=[];item.parameters||=[];
    item.aliases=item.aliases.map(alias=>{const control=controlFor(alias.siteId,alias.controlId);return {...alias,...(control?.role?{role:control.role}:{})};});
    if(existing){existing.aliases.push(...item.aliases);existing.targets.push(...item.targets);existing.parameters.push(...item.parameters);}
    else bySemantic.set(key,item);
  }
  // ESCRS is the broad source of manufacturer/model identities. Preserve the
  // original displayed alias while extracting only documented Alcon codes.
  for(const source of publishedSources.filter(source=>source.siteId==='escrs'))for(const option of source.options){
    if(!['model','family','group'].includes(option.kind)||!present(source.manufacturer))continue;
    add({manufacturer:source.manufacturer,modelCode:inferredCode(source.manufacturer,option.value),name:option.label,kind:option.kind,aliases:[{siteId:source.siteId,controlId:source.controlId,manufacturer:source.manufacturer,role:source.role||'primary',value:option.value,label:option.label,evidenceUrl:source.url,verifiedAt:source.capturedAt}]});
  }
  for(const entry of [...APACRS_LENS_ENTRIES,...EVO_EXPLICIT_MODEL_ENTRIES,...OTHER_LENS_EXACT_MODELS])add(entry);
  for(const source of EVO_TECNIS_LENS_SOURCES)for(const option of source.options){
    if(option.kind!=='family')continue;
    const manufacturer=source.siteId==='tecnis-toric'?'Johnson & Johnson':option.label.startsWith('Alcon ')||option.value==='MA60MA'?'Alcon':option.label.startsWith('B&L ')?'Bausch + Lomb':option.label.startsWith('J&J ')||['Tecnis','AR40e/E/M'].includes(option.value)?'Johnson & Johnson':option.label.startsWith('Zeiss ')?'ZEISS':option.label.startsWith('Rayner ')?'Rayner':option.label.startsWith('Kowa ')?'Kowa':option.label.startsWith('Nidek ')?'Nidek':option.label.startsWith('Simedice ')?'Simedice':undefined;
    if(manufacturer)add({manufacturer,modelCode:`${source.siteId}:${option.value}`,name:option.label,kind:'family',aliases:[{siteId:source.siteId,controlId:source.controlId,role:'primary',value:option.value,label:option.label,evidenceUrl:source.url,verifiedAt:source.capturedAt}]});
  }
  // Native group/family sources remain identifiable as that group only. They
  // never acquire the exact aliases of one of their member models.
  for(const [siteId,records]of Object.entries(OTHER_LENS_MEMBERSHIPS))for(const record of records){
    if(record.kind==='model'||!record.manufacturer)continue;
    add({manufacturer:record.manufacturer,modelCode:`${siteId}:${record.value}`,name:record.label,kind:record.kind,aliases:(definitionSets[siteId]?.controls||[]).filter(control=>control.role==='primary').map(control=>({siteId,controlId:control.id,role:'primary',value:record.value,label:record.label,evidenceUrl:definitionSets[siteId].url,verifiedAt:at}))});
  }
  const entries=[...bySemantic.values()];
  for(const entry of entries){
    if(entry.kind==='model'){
      for(const projection of [...APACRS_MODEL_PROJECTIONS,...TECNIS_MODEL_PROJECTIONS])if(manufacturerKey(entry.manufacturer)===manufacturerKey(projection.manufacturer)&&modelCodeKey(entry.modelCode)===modelCodeKey(projection.modelCode))entry.targets.push({...projection.target,role:controlFor(projection.target.siteId,projection.target.controlId)?.role||'primary'});
      for(const [siteId,records]of Object.entries(OTHER_LENS_MEMBERSHIPS))for(const record of records){
        if(!record.automaticIdentityMapping||record.kind==='model'||!memberMatches(entry,record))continue;
        for(const control of definitionSets[siteId].controls.filter(control=>control.role==='primary'))entry.targets.push(target(siteId,control.id,record));
      }
    }
    // Parameters belong to the exact originating preset/role, even where the
    // same numeric value happens to occur on another calculator.
    for(const preset of APACRS_LENS_PARAMETER_PRESETS)if(entry.aliases.some(alias=>alias.siteId===preset.siteId&&alias.controlId===preset.controlId&&alias.value===preset.value))for(const parameter of preset.parameters)entry.parameters.push({siteId:preset.siteId,controlId:preset.controlId,key:parameter.key,value:parameter.value,unit:parameter.unit,evidenceUrl:preset.evidenceUrl,capturedAt:preset.verifiedAt});
    for(const [siteId,records]of Object.entries(OTHER_LENS_MEMBERSHIPS))for(const record of records)if(entry.aliases.some(alias=>alias.siteId===siteId&&alias.value===record.value))for(const control of definitionSets[siteId].controls)for(const [key,value]of Object.entries(record.siteParameters||{}))if(['aConstant','lensFactor'].includes(key)&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(value)))entry.parameters.push({siteId,controlId:control.id,...(control.formula?{formula:control.formula}:{}),key,value:String(value),unit:'1',evidenceUrl:definitionSets[siteId].url,capturedAt:at});
    addEvoTargets(entry);
    addKnownFamilyTargets(entry);
    addExplicitSeriesTargets(entry);
    addNamedFamilyTargets(entry);
    entry.aliases=unique(entry.aliases,aliasKey);entry.targets=unique(entry.targets);entry.parameters=unique(entry.parameters);
  }
  return parseLensCatalogDocument({format:'biometry-lens-catalog',schemaVersion:'1.1',exportedAt:at,sources:publishedSources,entries});
}

function addNamedFamilyTargets(entry){
  const names=unique([entry.name,...entry.aliases.map(alias=>alias.label)].map(label=>namedFamily(entry.manufacturer,label)).filter(Boolean),String);
  if(!names.length)return;
  const toric=entry.aliases.some(aliasIsToric),maker=manufacturerKey(entry.manufacturer);
  for(const name of names)for(const source of publishedSources){
    if(!['escrs','evo','evo-toric','kane'].includes(source.siteId))continue;
    for(const option of source.options){
      if(option.kind!=='family')continue;
      const destinationMaker=source.manufacturer||entry.manufacturer;
      if(manufacturerKey(destinationMaker)!==maker||namedFamily(destinationMaker,option.label)!==name)continue;
      const destinationToric=isToricSource(source)||/\btoric\b/i.test(option.label);
      if(destinationToric!==toric)continue;
      if(entry.aliases.some(alias=>alias.siteId===source.siteId&&alias.controlId===source.controlId&&alias.value===option.value&&alias.label===option.label))continue;
      // A specific named family supersedes EVO's generic unlisted-IOL choice.
      if(source.siteId==='evo')entry.targets=entry.targets.filter(item=>!(item.siteId==='evo'&&item.value==='Standard'));
      entry.targets.push(target(source.siteId,source.controlId,option,'family',source.manufacturer?{manufacturer:source.manufacturer}:{}));
    }
  }
}

function addExplicitSeriesTargets(entry){
  const familyPrefixes={'Monofocal':'ZCT','Monofocal-II':'ZCU','Eyhance-II-Simplicity':'DIU','Multifocal-II-275':'ZKU','Multifocal-II-325':'ZLU','Symfony':'ZXT'};
  const tecSeries=entry.aliases.filter(alias=>alias.siteId==='tecnis-toric'&&familyPrefixes[alias.value]).map(alias=>`jj:${familyPrefixes[alias.value]}`);
  const maker=manufacturerKey(entry.manufacturer),series=unique([...tecSeries,...[entry.modelCode,entry.name,...entry.aliases.flatMap(alias=>[alias.label,alias.value])].map(label=>explicitFamily(entry.manufacturer,label)).filter(Boolean)],String);
  for(const key of series){
    const code=key.slice(key.indexOf(':')+1);
    // Same explicitly named family is portable; a family never becomes one
    // of the numeric physical models contained within that family.
    for(const destination of publishedSources.filter(source=>source.siteId==='escrs'&&manufacturerKey(source.manufacturer)===maker))for(const option of destination.options)if(option.kind==='family'&&explicitFamily(destination.manufacturer,option.label)===key&&!entry.aliases.some(alias=>alias.siteId===destination.siteId&&alias.controlId===destination.controlId&&alias.manufacturer===destination.manufacturer&&alias.value===option.value))entry.targets.push(target(destination.siteId,destination.controlId,option,'family',{manufacturer:destination.manufacturer}));
    for(const [siteId,definition]of Object.entries(APACRS_LENS_DEFINITIONS))for(const control of definition.controls){
      const label=maker==='johnson-johnson'?`J&J ${code}`:maker==='alcon'?`Alcon ${code}`:undefined;
      const option=label&&optionFor(siteId,label,control.id);if(option&&!entry.aliases.some(alias=>alias.siteId===siteId&&alias.controlId===control.id&&alias.value===option.value))entry.targets.push(target(siteId,control.id,option,'family'));
    }
    const evo=maker==='alcon'?({SA6ATx:'SA6ATx',SN6ATx:'SN6ATx',CNW0Tx:'CNW0Tx',DFTx:'Vivity',TFNTx:'Panoptix'})[code]:maker==='johnson-johnson'?({ZCU:'ZCU',DIU:'Eyhance',DET:'PureSee',DRT:'Odyssey',DFW:'Synergy',ZFW:'Synergy'})[code]||'Tecnis':undefined;
    const option=evo&&optionFor('evo-toric',evo,'primary');if(option&&!entry.aliases.some(alias=>alias.siteId==='evo-toric'&&alias.value===option.value))entry.targets.push(target('evo-toric','primary',option,'family',{evidenceUrl:EVO_GUIDE_RULES.url}));
    const tecFamily=maker==='johnson-johnson'?({ZCT:'Monofocal',ZCU:'Monofocal-II',DIU:'Eyhance-II-Simplicity',ZKU:'Multifocal-II-275',ZLU:'Multifocal-II-325',ZXT:'Symfony'})[code]:undefined;
    const tecOption=tecFamily&&optionFor('tecnis-toric',tecFamily,'primary');if(tecOption&&!entry.aliases.some(alias=>alias.siteId==='tecnis-toric'&&alias.value===tecOption.value))entry.targets.push(target('tecnis-toric','primary',tecOption,'family'));
    if(key==='alcon:SN6ATx'||key==='jj:ZCT')for(const control of definitionSets.kane.controls.filter(item=>item.role==='primary')){const record=OTHER_LENS_MEMBERSHIPS.kane.find(item=>item.value===(key==='jj:ZCT'?'10':'7'));entry.targets.push(target('kane',control.id,record,'family'));}
  }
}

function addEvoTargets(entry){
  const maker=manufacturerKey(entry.manufacturer),code=memberCode(entry.modelCode),labels=[entry.name,...entry.aliases.map(alias=>alias.label)].join(' '),controlId='primary';
  const actualEvo=entry.aliases.some(alias=>alias.siteId==='evo');
  if(!actualEvo){
    let value;
    for(const rule of EVO_GUIDE_RULES.regular.filter(rule=>rule.members))if(rule.members.some(member=>modelCodeKey(member)===code))value=rule.target;
    const tec=maker==='johnson-johnson'&&(TECNIS_MODEL_PROJECTIONS.some(item=>modelCodeKey(item.modelCode)===code)||/tecnis/i.test(labels)||['AAB00','ZA9003','Z9002'].includes(code));
    if(!value&&tec)value='Tecnis';
    if(!value)value='Standard';
    const option=optionFor('evo',value,controlId);
    if(option)entry.targets.push(target('evo',controlId,option,option.kind==='geometry'?'geometry':'member',{evidenceUrl:EVO_GUIDE_RULES.url}));
  }
  // Explicit family links require an actual code member from a published
  // source. A similar marketing word alone does not establish model identity.
  const familyLinks=[
    ['Alcon','TFNT?0','Panoptix'],['Alcon','CNWET?','Vivity'],
    ['ZEISS','409M','409M/MP'],['ZEISS','409MP','409M/MP'],['ZEISS','509M','509M/MP'],['ZEISS','509MP','509M/MP'],
  ];
  if(!actualEvo&&entry.kind==='model')for(const [manufacturer,pattern,value]of familyLinks)if(maker===manufacturerKey(manufacturer)&&patternMatches(code,pattern)){
    // A specific family replaces the general Standard projection.
    entry.targets=entry.targets.filter(item=>!(item.siteId==='evo'&&item.value==='Standard'));
    entry.targets.push(target('evo',controlId,optionFor('evo',value,controlId),'member'));
  }
  // Toric geometry is not inferred from manufacturer alone for an ordinary
  // spherical model. Only explicitly toric codes/family evidence participate.
  const toric=/(?:toric|sn6at|snd1t|sv25t[1-9]|tfnt[1-9]|cnw0t[1-9]|zct\d|zcu\d|diu\d|zku\d|zlu\d|zxt\d|zmt\d|zfw\d|dfw\d|drt\d|det\d|mx60et|mx60t|709m|929m|939m)/i.test(labels+' '+code);
  if(!entry.aliases.some(alias=>alias.siteId==='evo-toric')&&toric&&entry.kind==='model'){
    let value=maker==='zeiss'?'Bitoric':['alcon','hoya','physiol'].includes(maker)?'Posterior':maker==='johnson-johnson'&&(/tecnis/i.test(labels)||TECNIS_MODEL_PROJECTIONS.some(item=>modelCodeKey(item.modelCode)===code))?'Tecnis':undefined;
    const explicit=[['johnson-johnson',/^ZCU\d+$/,'ZCU'],['johnson-johnson',/^DIU\d+$/,'Eyhance'],['johnson-johnson',/^DRT\d+$/,'Odyssey'],['johnson-johnson',/^DET\d+$/,'PureSee'],['alcon',/^SN6AT\d+$/,'SN6ATx'],['alcon',/^CNW0T\d+$/,'CNW0Tx']].find(([manufacturer,pattern])=>manufacturer===maker&&pattern.test(code));
    if(explicit)value=explicit[2];
    const option=value&&optionFor('evo-toric',value,controlId);
    if(option)entry.targets.push(target('evo-toric',controlId,option,option.kind==='geometry'?'geometry':'member',{evidenceUrl:EVO_GUIDE_RULES.url}));
  }
}

function addKnownFamilyTargets(entry){
  const maker=manufacturerKey(entry.manufacturer),labels=[entry.name,...entry.aliases.map(alias=>alias.label)].join(' ');
  const code=entry.modelCode.includes(':')?entry.modelCode.slice(entry.modelCode.indexOf(':')+1):entry.modelCode;
  // These code families have one unique published TECNIS matrix family. Do
  // not choose a family for ZCB00, which is explicitly a member of two.
  const familyMap={ZCT:'Monofocal',ZCU:'Monofocal-II',DIU:'Eyhance-II-Simplicity',ZKU:'Multifocal-II-275',ZLU:'Multifocal-II-325',ZXT:'Symfony'};
  if(maker==='johnson-johnson'&&entry.kind==='family'){
    let family=familyMap[code];
    if(entry.aliases.some(alias=>alias.siteId==='tecnis-toric'))family=code;
    if(family){
      const option=optionFor('tecnis-toric',family,'primary');
      if(option&&!entry.aliases.some(alias=>alias.siteId==='tecnis-toric'))entry.targets.push(target('tecnis-toric','primary',option,'family'));
      const prefixes=Object.entries(familyMap).filter(([,value])=>value===family).map(([key])=>key);
      for(const prefix of prefixes)for(const [siteId,definition]of Object.entries(APACRS_LENS_DEFINITIONS))for(const control of definition.controls){
        const option=optionFor(siteId,`J&J ${prefix}`,control.id);if(option)entry.targets.push(target(siteId,control.id,option,'family'));
      }
      if(!entry.aliases.some(alias=>alias.siteId==='evo')){
        entry.targets=entry.targets.filter(item=>!(item.siteId==='evo'&&item.value==='Standard'));
        entry.targets.push(target('evo','primary',optionFor('evo','Tecnis','primary'),'family',{evidenceUrl:EVO_GUIDE_RULES.url}));
      }
      if(!entry.aliases.some(alias=>alias.siteId==='evo-toric')){
        const evoFamily=family==='Monofocal-II'?'ZCU':/^Eyhance/.test(family)?'Eyhance':/^Odyssey/.test(family)?'Odyssey':/^PureSee/.test(family)?'PureSee':'Tecnis';
        entry.targets.push(target('evo-toric','primary',optionFor('evo-toric',evoFamily,'primary'),'family',{evidenceUrl:EVO_GUIDE_RULES.url}));
      }
    }
  }
  const marketing=[['alcon','panoptix','Panoptix'],['alcon','vivity','Vivity'],['bausch-lomb','aspire','Aspire'],['bausch-lomb','envy','Envy'],['bausch-lomb','luxgood','LuxGood'],['bausch-lomb','luxsmart','LuxSmart'],['bausch-lomb','luxlife','LuxLife'],['rayner','rayone emv','EMV'],['rayner','galaxy','Galaxy']];
  for(const [manufacturer,name,value]of marketing)if(maker===manufacturer&&labels.toLowerCase().includes(name)){
    const option=optionFor('evo',value,'primary');if(option&&!entry.aliases.some(alias=>alias.siteId==='evo')){
      entry.targets=entry.targets.filter(item=>!(item.siteId==='evo'&&item.value==='Standard'));
      entry.targets.push(target('evo','primary',option,'family'));
    }
  }
  if(maker==='johnson-johnson'&&entry.kind!=='model'&&/tecnis/i.test(labels)&&!entry.aliases.some(alias=>alias.siteId==='evo')){
    entry.targets=entry.targets.filter(item=>!(item.siteId==='evo'&&item.value==='Standard'));
    entry.targets.push(target('evo','primary',optionFor('evo','Tecnis','primary'),'family',{evidenceUrl:EVO_GUIDE_RULES.url}));
  }
}

export const DEFAULT_LENS_CATALOG=buildDefaultCatalog();
export const LENS_DEFINITIONS=Object.freeze(Object.fromEntries(Object.entries(definitionSets).map(([siteId,definition])=>[siteId,{...clone(definition),controls:definition.controls.map(control=>{
  const manufacturerOptions=control.role==='manufacturer'?unique(publishedSources.filter(source=>source.siteId===siteId&&source.manufacturer&&(!control.eye||!source.eye||source.eye===control.eye)).map(source=>({value:source.manufacturer,label:source.manufacturer,kind:'group',available:true})),optionKey):[];
  const options=unique([...(control.options||[]),...manufacturerOptions,...publishedSources.filter(source=>source.siteId===siteId&&(!source.controlId||source.controlId===control.id)).flatMap(source=>source.options)],option=>JSON.stringify([option.value,option.label,option.kind]));
  return {...clone(control),...(options.length?{options}:{}),...(control.dependsOn?{manufacturerControlId:control.dependsOn}:{})};
})}])));

export function mergeLensCatalog(userCatalog){
  if(!userCatalog)return clone(DEFAULT_LENS_CATALOG);
  const user=parseLensCatalogDocument(userCatalog),result=clone(DEFAULT_LENS_CATALOG),bySemantic=new Map(result.entries.map(entry=>[semanticKey(entry),entry]));
  const normalizeAlias=alias=>{
    const controls=LENS_DEFINITIONS[alias.siteId]?.controls.filter(control=>control.role!=='manufacturer')||[];
    const control=alias.controlId?controls.find(control=>control.id===alias.controlId):controls.length===1?controls[0]:undefined;
    return {...alias,...(control?{controlId:control.id,role:control.role||'primary'}:{})};
  };
  for(const original of user.entries){
    const incoming={...original,aliases:original.aliases.map(normalizeAlias),targets:(original.targets||[]).map(normalizeAlias)};
    const existing=bySemantic.get(semanticKey(incoming));
    if(!existing){const entry=clone(incoming);entry.targets||=[];entry.parameters||=[];result.entries.push(entry);bySemantic.set(semanticKey(entry),entry);continue;}
    existing.aliases=unique([...existing.aliases,...incoming.aliases],aliasKey);
    existing.targets=unique([...(existing.targets||[]),...(incoming.targets||[])]);
    existing.parameters=unique([...(existing.parameters||[]),...(incoming.parameters||[])]);
  }
  const sources=new Map(result.sources.map(source=>[sourceKey(source),source]));
  for(const original of user.sources){
    const controls=LENS_DEFINITIONS[original.siteId]?.controls.filter(control=>control.role!=='manufacturer')||[];
    const descriptor=original.controlId?controls.find(control=>control.id===original.controlId):controls.length===1?controls[0]:undefined;
    const incoming={...clone(original),...(descriptor?{controlId:descriptor.id,role:descriptor.role||'primary'}:{})};
    const known=DEFAULT_LENS_CATALOG.sources.filter(source=>source.siteId===incoming.siteId&&(!incoming.controlId||source.controlId===incoming.controlId)).flatMap(source=>source.options);
    incoming.options=incoming.options.map(option=>{const match=known.filter(item=>item.value===option.value&&item.label===option.label);return match.length&&new Set(match.map(item=>item.kind)).size===1?{...option,kind:match[0].kind}:option;});
    if(incoming.selected){const match=incoming.options.find(option=>option.value===incoming.selected.value&&option.label===incoming.selected.label);if(match)incoming.selected.kind=match.kind;}
    const key=sourceKey(incoming),existing=sources.get(key);
    if(!existing){sources.set(key,clone(incoming));continue;}
    // Capturing a filtered autocomplete menu must not delete the full list.
    const options=unionMenus([existing.options,incoming.options]);
    sources.set(key,{...existing,...clone(incoming),options});
  }
  result.sources=[...sources.values()];result.exportedAt=user.exportedAt;
  // Attach newly captured parameters to their exact model and source/formula.
  // This is provenance storage, never a request to write a destination constant.
  for(const source of result.sources)if(source.selected&&source.parameters.length){
    const matches=result.entries.filter(entry=>entry.aliases.some(alias=>alias.siteId===source.siteId&&alias.value===source.selected.value&&alias.label===source.selected.label&&['controlId','manufacturer','role'].every(key=>!alias[key]||!source[key]||alias[key]===source[key])));
    if(matches.length!==1)continue;
    const entry=matches[0];entry.parameters||=[];
    for(const parameter of source.parameters)entry.parameters.push({siteId:source.siteId,...(source.controlId?{controlId:source.controlId}:{}),...(parameter.formula||source.formula?{formula:parameter.formula||source.formula}:{}),key:parameter.key,value:parameter.value,unit:parameter.unit,evidenceUrl:source.url,capturedAt:source.capturedAt});
    entry.parameters=unique(entry.parameters);
  }
  return parseLensCatalogDocument(result);
}

function matchingEntries(selection,catalog){
  return catalog.entries.filter(entry=>entry.aliases.some(alias=>alias.siteId===selection.iolSourceSite&&alias.value===selection.iolSourceValue&&alias.label===selection.iolSourceLabel&&['controlId','manufacturer','role'].every(key=>!selection[{controlId:'iolSourceControl',manufacturer:'iolSourceManufacturer',role:'iolSourceRole'}[key]]||!alias[key]||alias[key]===selection[{controlId:'iolSourceControl',manufacturer:'iolSourceManufacturer',role:'iolSourceRole'}[key]])));
}
function seededInventory(siteId,control,catalog,live,manufacturer){
  const sources=catalog.sources.filter(source=>source.siteId===siteId&&(!source.controlId||source.controlId===control.id)&&(!source.eye||!control.eye||source.eye===control.eye)&&(!manufacturer||!source.manufacturer||source.manufacturer===manufacturer));
  const sameManufacturer=!manufacturer||!live?.manufacturer||live.manufacturer===manufacturer;
  const actual=sameManufacturer?(live?.options||[]):[],published=unionMenus(sources.map(source=>source.options));
  // Open linked menus and native selects are authoritative about availability
  // and duplicate options. A closed autocomplete can show only its selection;
  // add its known list, retaining every live option's availability and count.
  const authoritative=actual.length&&sameManufacturer&&(live.menuOpen||control.control==='native-select');
  const seen=new Set(actual.map(optionKey));
  const choices=authoritative?actual:[...actual,...published.filter(option=>!seen.has(optionKey(option)))];
  return {...(live||{}),siteId,status:'read',controlId:control.id,role:control.role||'primary',...(manufacturer?{manufacturer}:{}),navigationExpected:!!control.navigationExpected,options:choices};
}
export function planLensSelections(data,profileId,inventory,options={}){
  const siteId=typeof profileId==='string'?profileId:profileId?.id,definition=LENS_DEFINITIONS[siteId],warnings=[],plans=[],selections=[];
  if(!definition)return {status:'unsupported',selections,warnings,plans};
  const catalog=options.catalog?parseLensCatalogDocument(options.catalog):DEFAULT_LENS_CATALOG,scope=options.eye||data.activeEye||'OD',eyes=scope==='OU'?['OD','OS']:[scope];
  if(!eyes.every(eye=>['OD','OS'].includes(eye)))return {status:'manual',selections,warnings:['請選擇晶體傳輸眼別。'],plans};
  for(const eye of eyes){
    let source=clone(data.eyes?.[eye]||{});
    if(!source.iolSourceSite&&!source.iolCatalogId)continue;
    let canonical=catalog.entries.find(entry=>entry.id===source.iolCatalogId);
    if(canonical&&!source.iolSourceSite){
      const alias=canonical.aliases[0];source={...source,iolSourceSite:alias.siteId,iolSourceValue:alias.value,iolSourceLabel:alias.label,iolSourceControl:alias.controlId||'',iolSourceManufacturer:alias.manufacturer||'',iolSourceRole:alias.role||'primary'};
    }
    if(!canonical&&source.iolCatalogId){
      const matches=matchingEntries(source,catalog);if(matches.length===1){canonical=matches[0];source.iolCatalogId=canonical.id;warnings.push(`${eye} 已依來源精確品項更新舊目錄 ID。`);}
    }
    canonical||=matchingEntries(source,catalog).length===1?matchingEntries(source,catalog)[0]:undefined;
    const role=siteId==='barrett-rx'?(source.iolSourceRole==='implanted'?'implanted':'exchange'):'primary';
    const controls=definition.controls.filter(control=>(control.role||'primary')===role&&(!control.eye||control.eye===eye));
    if(!controls.length){const reason=definition.inheritedModel?'此頁晶體承接先前球面計算，請先到基本入口選擇。':'此入口沒有可對應的晶體角色。';plans.push({eye,status:'manual',reason});warnings.push(`${eye} ${reason}`);continue;}
    for(const control of controls){
      const live=inventory?.controls?.find(item=>item.controlId===control.id&&(!item.eye||item.eye===eye));
      const possible=canonical?[...canonical.aliases,...(canonical.targets||[])].filter(item=>item.siteId===siteId&&(!item.controlId||item.controlId===control.id)&&(item.role||'primary')===role):[];
      const manufacturers=unique(possible.map(item=>item.manufacturer).filter(Boolean),value=>value);
      const manufacturer=manufacturers.length===1?manufacturers[0]:undefined;
      const snapshot=seededInventory(siteId,control,catalog,live,manufacturer);
      const resolved=resolveLensSelection(source,siteId,catalog,snapshot,{controlId:control.id,eye,role,...(manufacturer?{manufacturer}:{})});
      const plan={eye,controlId:control.id,role,...resolved};plans.push(plan);
      if(resolved.status!=='ready'){warnings.push(`${eye} ${resolved.reason}`);continue;}
      if(resolved.kind==='geometry')warnings.push(`${eye} 晶體只對應幾何，仍需核對目的站 A-constant。`);
      const makerControl=control.manufacturerControlId||control.dependsOn;
      if(makerControl&&manufacturer){
        const descriptor=definition.controls.find(item=>item.id===makerControl),state=inventory?.controls?.find(item=>item.controlId===makerControl),makerOptions=unique([...(state?.options||[]),...(descriptor?.options||[])],optionKey);
        const matches=makerOptions.filter(option=>option.value===manufacturer||option.label===manufacturer);
        if(matches.length!==1){plan.status='manual';plan.reason='目的製造商選項無法唯一辨識。';warnings.push(`${eye} ${plan.reason}`);continue;}
        selections.push({controlId:makerControl,eye,value:matches[0].value,label:matches[0].label,kind:'group',catalogId:resolved.catalogId,role:'manufacturer',_model:control.id});
      }
      selections.push({...resolved,controlId:control.id,eye,role,...(makerControl?{_manufacturerControl:makerControl}:{})});
    }
  }
  // OU can share one selector only when both requested values are identical.
  const grouped=new Map();
  for(const selection of selections){const descriptor=definition.controls.find(control=>control.id===selection.controlId),key=selection.controlId+':'+(descriptor?.eye||'shared');if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(selection);}
  const conflicts=new Set();
  for(const [key,items]of grouped)if(new Set(items.map(item=>JSON.stringify([item.value,item.label,item.kind,item.manufacturer||'']))).size>1){conflicts.add(key.split(':')[0]);warnings.push('OD／OS 晶體不同，但目的網站共用同一選單；請改單眼貼上。');}
  const requestedEyes=eyes.filter(eye=>data.eyes?.[eye]?.iolSourceSite||data.eyes?.[eye]?.iolCatalogId);
  if(scope==='OU'&&requestedEyes.length===2)for(const items of grouped.values()){
    const descriptor=definition.controls.find(control=>control.id===items[0].controlId);
    if(descriptor?.eye)continue;
    // A shared control changes the displayed model for both eyes. A ready OD
    // choice cannot silently stand in for an unresolved/missing OS plan (or
    // vice versa), including a shared manufacturer's dependent model plans.
    const readyForEveryEye=requestedEyes.every(eye=>plans.some(plan=>plan.eye===eye&&plan.status==='ready'&&(plan.controlId===items[0].controlId||items.some(item=>item.eye===eye&&item._model===plan.controlId))));
    if(!readyForEveryEye){conflicts.add(items[0].controlId);warnings.push('OD／OS 都有晶體資料，但其中一眼無法對應；目的網站共用同一選單，請改單眼貼上晶體。');}
  }
  const accepted=[];
  for(const items of grouped.values()){
    const item=items[0];if(conflicts.has(item.controlId)||conflicts.has(item._manufacturerControl)||conflicts.has(item._model))continue;
    const {_model,_manufacturerControl,...request}=item;accepted.push(request);
  }
  const failed=plans.some(plan=>plan.status!=='ready')||conflicts.size>0;
  return {status:accepted.length?(failed?'partial':'ready'):plans.length?'manual':'empty',selections:accepted,warnings:unique(warnings,value=>value),plans};
}

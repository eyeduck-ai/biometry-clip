// Review-only metadata. It is never part of a case/library export or a model
// prompt, and it cannot create, change or resurrect a clinical value.
const validScore=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1;
const numeric=value=>(typeof value==='number'||typeof value==='string'&&/^[+-]?\d+(?:\.\d+)?$/.test(value))&&Number.isFinite(Number(value));
const same=(left,right)=>left===right||(numeric(left)&&numeric(right)&&Number(left)===Number(right));
const valueAt=(candidate,eye,key)=>eye==='patient'?candidate.patient?.[key]:candidate.eyes?.[eye]?.[key];

export function withReviewEvidence(candidate,evidence=candidate?.evidence||[]){
  const accepted=[];
  for(const item of evidence){
    if(!item||!['OD','OS','patient'].includes(item.eye)||typeof item.key!=='string')continue;
    const value=valueAt(candidate,item.eye,item.key);
    if(value==null||value===''||!same(value,item.value))continue;
    const next={...item,value};
    if(!validScore(next.confidence))delete next.confidence;
    accepted.push(next);
  }
  const fieldConfidence={};
  for(const item of accepted)if(validScore(item.confidence)){
    const id=`${item.eye}.${item.key}`;
    fieldConfidence[id]=Math.min(fieldConfidence[id]??1,item.confidence);
  }
  return {...candidate,evidence:accepted,fieldConfidence};
}

export function withCandidateSource(candidate,source={}){
  const provenance={};
  for(const key of ['fileIndex','pageNumber'])if(Number.isSafeInteger(source[key])&&source[key]>=(key==='pageNumber'?1:0))provenance[key]=source[key];
  if(typeof source.method==='string')provenance.method=source.method;
  const evidence=(candidate.evidence||[]).map(item=>({...item,...provenance}));
  const represented=new Set(evidence.map(item=>`${item.eye}.${item.key}`));
  // VLM and plain-text paths may know the page without reporting OCR scores or
  // boxes. Preserve that source while leaving confidence genuinely unknown.
  for(const [eye,values]of [['patient',candidate.patient],['OD',candidate.eyes?.OD],['OS',candidate.eyes?.OS]])for(const [key,value]of Object.entries(values||{})){
    if(value==null||value===''||represented.has(`${eye}.${key}`))continue;
    evidence.push({eye,key,value,...provenance});
  }
  return withReviewEvidence(candidate,evidence);
}

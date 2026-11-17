import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBiometryItems,mergeCandidatePages} from '../src/ocr/parser.js';
import {withCandidateSource,withReviewEvidence} from '../src/ocr/evidence.js';
import {recognizePdfPages} from '../src/ocr/pdf-pages.js';

const box=(text,x,y,score,width=text.length*6)=>({text,score,poly:[[x,y],[x+width,y],[x+width,y+12],[x,y+12]]});
const headings=()=>[box('OD right',10,10,.99,50),box('left OS',400,10,.98,50)];

test('confidence follows each field label and primary value, excluding a separate SD or the other eye',()=>{
  const candidate=parseBiometryItems([...headings(),
    box('AL:',10,40,.99),box('23.45 mm',40,40,.84),box('SD: 9 µm',110,40,.12),
    box('AL:',300,40,.97),box('24.56 mm',330,40,.96),box('SD: 8 µm',400,40,.05),
    box('K1:',10,70,.99),box('43.20 D',40,70,.96),box('@ 90°',90,70,.73),box('SD: 0.01 D',140,70,.10),
  ]);
  assert.deepEqual(candidate.eyes,{OD:{al:'23.45',k1:'43.20',k1Axis:'90'},OS:{al:'24.56'}});
  assert.equal(candidate.fieldConfidence['OD.al'],.84);
  assert.equal(candidate.fieldConfidence['OS.al'],.96);
  assert.equal(candidate.fieldConfidence['OD.k1'],.96);
  assert.equal(candidate.fieldConfidence['OD.k1Axis'],.73);
  assert.ok(candidate.evidence.find(item=>item.eye==='OD'&&item.key==='k1Axis'&&item.value==='90'));
});

test('confidence handles zero, converted CCT, patient identifiers and unknown native text independently',()=>{
  const candidate=parseBiometryItems([
    box('Patient ID: SYNTHETIC-001',10,-20,.72),...headings(),
    box('Target: 0 D',10,40,0),box('CCT: 0.543 mm',300,40,.81),
  ]);
  assert.equal(candidate.fieldConfidence['patient.patientId'],.72);
  assert.equal(candidate.fieldConfidence['OD.target'],0);
  assert.equal(candidate.eyes.OD.target,'0');
  assert.equal(candidate.eyes.OS.cct,'543');
  assert.equal(candidate.fieldConfidence['OS.cct'],.81);
  assert.equal(candidate.evidence.find(item=>item.key==='cct').unit,'µm');
  const native=parseBiometryItems([box('OD',10,10),box('AL: 23.45 mm',10,40)]);
  assert.equal(native.eyes.OD.al,'23.45');assert.deepEqual(native.fieldConfidence,{});
  assert.equal(Object.hasOwn(native.evidence[0],'confidence'),false);
});

test('shared-label bilateral matrix retains a separate confidence for each eye and K axis',()=>{
  const candidate=parseBiometryItems([box('OD',60,10,.99,20),box('OS',200,10,.99,20),
    box('AL',0,50,.98,20),box('23.45',60,50,.82,30),box('24.56',200,50,.96,30),
    box('K1',0,80,.97,20),box('43.20 @',60,80,.95,45),box('90°',110,80,.70,20),
    box('42.80 @',200,80,.94,45),box('10°',250,80,.91,20),
  ]);
  assert.equal(candidate.fieldConfidence['OD.al'],.82);assert.equal(candidate.fieldConfidence['OS.al'],.96);
  assert.equal(candidate.fieldConfidence['OD.k1'],.95);assert.equal(candidate.fieldConfidence['OD.k1Axis'],.70);
  assert.equal(candidate.fieldConfidence['OS.k1Axis'],.91);
});

test('page merges retain accepted sources and the lowest reported confidence but discard conflict evidence',()=>{
  const make=(al,score,fileIndex,pageNumber)=>withCandidateSource(parseBiometryItems([
    box('OD',10,10,.99),box(`AL: ${al} mm`,10,40,score),box('Target: 0 D',10,70,score),
  ]),{fileIndex,pageNumber,method:'pdf-ocr'});
  const a=make('23.45',.96,0,2),b=make('23.45',.77,1,7),same=mergeCandidatePages([a,b]);
  assert.equal(same.eyes.OD.al,'23.45');assert.equal(same.fieldConfidence['OD.al'],.77);
  assert.deepEqual(same.evidence.filter(item=>item.key==='al').map(item=>[item.fileIndex,item.pageNumber]),[[0,2],[1,7]]);
  const conflict=mergeCandidatePages([a,make('23.75',.40,1,3),a]);
  assert.equal(conflict.eyes.OD.al,undefined);assert.equal(conflict.fieldConfidence['OD.al'],undefined);
  assert.equal(conflict.evidence.some(item=>item.key==='al'),false);
  assert.equal(conflict.eyes.OD.target,'0');assert.equal(conflict.fieldConfidence['OD.target'],.40);
  assert.equal(a.evidence[0].fileIndex,0);
});

test('source metadata never supplies a missing value or fabricates OCR confidence',()=>{
  const original={patient:{},eyes:{OD:{al:'23.45'},OS:{}},warnings:[],conflicts:[]};
  const vlm=withCandidateSource(original,{fileIndex:2,pageNumber:6,method:'pdf-ocr'});
  assert.deepEqual(vlm.fieldConfidence,{});assert.equal(vlm.evidence[0].fileIndex,2);
  assert.equal(Object.hasOwn(vlm.evidence[0],'confidence'),false);assert.equal(original.evidence,undefined);
  const invalid=withReviewEvidence(original,[
    {eye:'OD',key:'al',value:'99.99',confidence:.1},
    {eye:'OS',key:'al',value:'24.56',confidence:.2},
    {eye:'OD',key:'al',value:'23.45',confidence:'0.2'},
  ]);
  assert.deepEqual(invalid.eyes,original.eyes);assert.deepEqual(invalid.fieldConfidence,{});assert.equal(invalid.evidence.length,1);
  const boolean=withReviewEvidence({patient:{},eyes:{OD:{toric:false},OS:{}}},[{eye:'OD',key:'toric',value:0,confidence:.2}]);assert.deepEqual(boolean.fieldConfidence,{});assert.deepEqual(boolean.evidence,[]);
});

test('real selected PDF page evidence keeps its original page and native method without an OCR score',async()=>{
  const items=[
    {str:'OD',transform:[10,0,0,10,50,500],width:20,height:10},
    {str:'OS',transform:[10,0,0,10,300,500],width:20,height:10},
    {str:'AL 23.45 24.56',transform:[10,0,0,10,50,470],width:300,height:10},
    {str:'ACD 3.20 3.40',transform:[10,0,0,10,50,450],width:300,height:10},
  ];
  const pdf={numPages:20,getPage:async()=>({getTextContent:async()=>({items}),cleanup(){}})};
  const result=await recognizePdfPages(pdf,{pages:[7],recognizeBlob:async()=>{throw new Error('Native page must not load OCR');}});
  assert.equal(result.pages[0].pageNumber,7);assert.equal(result.pages[0].method,'pdf-text');
  assert.ok(result.candidates.evidence.length>=4);
  assert.ok(result.candidates.evidence.every(item=>item.pageNumber===7&&item.method==='pdf-text'&&item.confidence===undefined));
  assert.deepEqual(result.candidates.fieldConfidence,{});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBiometryItems} from '../src/ocr/parser.js';

const box=(text,x,y,width=100,height=12)=>({text,poly:[[x,y],[x+width,y],[x+width,y+height],[x,y+height]]});
const headings=()=>[box('OD right',40,10,40,24),box('left OS',440,10,40,24)];

test('IOLMaster geometry keeps independent summary labels and excludes SD / individual table numbers',()=>{
  const items=[...headings(),
    box('AL: 24.12 mm SD: 12 µm',40,60),box('AL: 25.23 mm SD: 8 µm',300,60),
    box('CCT: 0.546 mm SD: 4 µm',40,80),box('CCT: 531 µm SD: 3 µm',300,80),
    box('ACD: 3.25 mm',40,100),box('ACD: 3.38 mm',300,100),
    box('LT: 4.11 mm',40,120),box('LT: 4.43 mm',300,120),
    box('AL',40,145),box('CCT',100,145),box('ACD',160,145),box('LT',220,145),
    box('24.10 mm 550 µm 3.23 mm 4.12 mm',40,165),
    box('K1: 43.25 D @ 172° SD: 0.02 D',40,200),box('K1: 42.50 D @ 11° SD: 0.04 D',300,200),
    box('K2: 44.25 D @ 82° SD: 0.02 D',40,220),box('K2: 43.50 D @ 101° SD: 0.03 D',300,220),
    box('WTW: 11.8 mm Ix: +0.3 mm Iy: +0.1 mm',40,250),box('WTW: 12.0 mm Ix: -0.2 mm Iy: +0.2 mm',300,250),
    box('TK1: ---',40,280),box('TK2: ---',300,280),
    box('IOL (D) Ref (D)',40,300),box('+20.00 -0.53',40,320),
  ];
  const actual=parseBiometryItems(items);
  assert.deepEqual(actual.eyes.OD,{al:'24.12',cct:'546',acd:'3.25',lt:'4.11',k1:'43.25',k1Axis:'172',k2:'44.25',k2Axis:'82',wtw:'11.8'});
  assert.deepEqual(actual.eyes.OS,{al:'25.23',cct:'531',acd:'3.38',lt:'4.43',k1:'42.50',k1Axis:'11',k2:'43.50',k2Axis:'101',wtw:'12.0'});
  assert.equal(actual.warnings.length,0);
  assert.equal(actual.evidence[0].rawText,'AL: 24.12 mm SD: 12 µm');
  assert.equal(actual.eyes.OD.implantedIolPower,undefined);
});

test('paired columns can be reversed and OCR fragments retain labels, units and axes',()=>{
  const actual=parseBiometryItems([
    box('OS',60,10,20),box('OD',360,10,20),
    box('AL:',40,50,20),box('24.56 mm',70,50,80),box('SD: 9 µm',160,50,60),
    box('AL:',300,50,20),box('23.45 mm',330,50,80),box('SD: 5 µm',420,50,60),
    box('K1:',40,80,20),box('7.80 mm / 43.27 D @ 79°',70,80,180),
    box('K1:',300,80,20),box('7.70 mm / 43.83 D @ 95°',330,80,180),
  ]);
  assert.equal(actual.eyes.OD.al,'23.45');assert.equal(actual.eyes.OS.al,'24.56');
  assert.equal(actual.eyes.OD.k1,'43.83');assert.equal(actual.eyes.OS.k1Axis,'79');
});

test('a missing bilateral eye heading never turns the other column into a monocular value',()=>{
  const actual=parseBiometryItems([box('OD',40,10),box('AL: 23.45 mm',40,50),box('AL: 24.56 mm',300,50),box('ACD: 3.2 mm',40,80),box('ACD: 3.8 mm',300,80)]);
  assert.deepEqual(actual.eyes,{OD:{},OS:{}});assert.match(actual.warnings.join(' '),/一個眼別/);
});

test('a genuinely monocular header applies only the explicitly printed measurements',()=>{
  const actual=parseBiometryItems([box('OS left',40,10),box('AL: 24.56 mm',40,50),box('WTW: 11.7 mm',250,50),box('K1: 43.25 D @ 12°',40,80),box('K2: ---',250,80)]);
  assert.deepEqual(actual.eyes.OD,{});assert.equal(actual.eyes.OS.al,'24.56');assert.equal(actual.eyes.OS.wtw,'11.7');assert.equal(actual.eyes.OS.k2,undefined);
});

test('shared-label bilateral tables still use both value positions and retain zero',()=>{
  const actual=parseBiometryItems([box('OD',60,10,20),box('OS',180,10,20),
    box('AL',0,50,20),box('23.45',60,50,30),box('24.56',180,50,30),
    box('Target',0,80,30),box('0',60,80,10),box('-0.50',180,80,30),
    box('K1',0,110,20),box('43.20 @ 90°',60,110,60),box('42.80 @ 10°',180,110,60)]);
  assert.equal(actual.eyes.OD.al,'23.45');assert.equal(actual.eyes.OS.al,'24.56');assert.equal(actual.eyes.OD.target,'0');assert.equal(actual.eyes.OS.target,'-0.50');assert.equal(actual.eyes.OS.k1Axis,'10');
});

test('duplicate contradictory summary labels remain conflicted and missing units do not turn a radius into D',()=>{
  const actual=parseBiometryItems([...headings(),box('AL: 23.45 mm',40,50),box('AL: 23.75 mm',40,80),box('K1: 7.8 mm @ 90°',40,110),box('CCT: 0.54',300,110)]);
  assert.equal(actual.eyes.OD.al,undefined);assert.ok(actual.conflicts.includes('OD.al'));assert.equal(actual.eyes.OD.k1,undefined);assert.equal(actual.eyes.OS.cct,undefined);
});

test('printed patient ID and gender normalize separately and no eye values are inferred above headings',()=>{
  const actual=parseBiometryItems([box('Patient ID',10,10,50),box('SYNTHETIC-001',70,10,100),box('Gender Female',10,30,100),box('AL: 99.99 mm',40,60),box('OD right',40,100),box('AL: 23.45 mm',40,140)]);
  assert.equal(actual.patient.patientId,'SYNTHETIC-001');assert.equal(actual.patient.gender,'female');assert.equal(actual.eyes.OD.al,'23.45');
});

test('adjacent native PDF glyphs are reconstructed before label matching',()=>{
  const items=[];for(const [text,x,y]of [['OD',40,10],['OS',340,10],['AL: 23.45 mm',40,60],['AL: 24.56 mm',300,60]])for(let i=0;i<text.length;i++)items.push(box(text[i],x+i*6,y,6,12));
  const actual=parseBiometryItems(items);assert.equal(actual.eyes.OD.al,'23.45');assert.equal(actual.eyes.OS.al,'24.56');
});

test('a rotated PDF watermark overlapping a measurement never joins into its label',()=>{
  const actual=parseBiometryItems([...headings(),box('r e s e r v e d',10,60,35,6),box('K2:',44,58,18,8),box('46.13 D @ 75° SD: 0.02 D',70,58,160,8)]);
  assert.equal(actual.eyes.OD.k2,'46.13');assert.equal(actual.eyes.OD.k2Axis,'75');
});

test('stacked explicitly labelled eye sections use their local heading',()=>{
  const actual=parseBiometryItems([box('OD',40,10),box('AL: 23.45 mm',40,50),box('ACD: 3.2 mm',40,80),box('OS',40,120),box('AL: 24.56 mm',40,160),box('ACD: 3.8 mm',40,190)]);
  assert.equal(actual.eyes.OD.al,'23.45');assert.equal(actual.eyes.OS.al,'24.56');assert.equal(actual.conflicts.length,0);
});

test('other labelled statistics do not discard a primary WTW or supply an unprinted K power',()=>{
  const actual=parseBiometryItems([...headings(),box('WTW: 11.8 mm lx: -0.3 mm ly: +0.2 mm',300,60,200),box('K1: 7.8 mm SD: 0.02 D',40,80,200),box('K2: 7.7 mm SD0.03 D',40,100,200)]);
  assert.equal(actual.eyes.OS.wtw,'11.8');assert.equal(actual.eyes.OD.k1,undefined);
  assert.equal(actual.eyes.OD.k2,undefined);
});

test('uncertainty and incomplete shared rows never masquerade as the other eye',()=>{
  const actual=parseBiometryItems([box('OD',60,10,20),box('OS',180,10,20),
    box('AL: 23.45 mm ± 0.02 mm',0,50,200),box('ACD: 3.20 mm +/- 0.04 mm',0,80,200),
    box('LT',0,110,20),box('4.50',180,110,30),box('CCT: 543 um SD0.03',0,140,200)]);
  assert.deepEqual(actual.eyes,{OD:{},OS:{}});assert.equal(actual.warnings.length,4);
});

test('mixed Chinese and long English field labels retain existing parser compatibility',()=>{
  const actual=parseBiometryItems([box('右眼',40,10),box('左眼',440,10),
    box('眼軸長：23.45 mm',40,60),box('Axial length: 24.56 mm',300,60),
    box('Anterior chamber depth: 3.25 mm',40,90),box('前房深度：3.38 mm',300,90),
    box('角膜厚度：543 µm',40,120),box('Central corneal thickness: 531 µm',300,120),
    box('White-to-white: 11.8 mm',40,150),box('角膜直徑：12.0 mm',300,150),
    box('Flat K: 43.20 D @ 90°',40,180),box('K steep: 44.50 D @ 12°',300,180)]);
  assert.equal(actual.eyes.OD.al,'23.45');assert.equal(actual.eyes.OS.al,'24.56');
  assert.equal(actual.eyes.OD.acd,'3.25');assert.equal(actual.eyes.OS.acd,'3.38');
  assert.equal(actual.eyes.OD.cct,'543');assert.equal(actual.eyes.OS.cct,'531');
  assert.equal(actual.eyes.OD.wtw,'11.8');assert.equal(actual.eyes.OS.wtw,'12.0');
  assert.equal(actual.eyes.OD.k1,'43.20');assert.equal(actual.eyes.OS.k2Axis,'12');
});

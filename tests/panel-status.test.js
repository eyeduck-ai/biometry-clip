import assert from 'node:assert/strict';
import test from 'node:test';
import { panelContextFromUrl,panelStatusRelay } from '../src/panel-status.js';

const id='abcdefghijklmnopabcdefghijklmnop';
const token='bc21f681-f8c2-4621-9797-cfb6ce746d10';
const url=`chrome-extension://${id}/index.html?view=floating&tabId=42&panelToken=${token}`;
const sender=()=>({id,url,frameId:3,tab:{id:42,title:'PRIVATE PATIENT HEADER'}});

test('panel status is derived from the trusted iframe URL and never from payload identifiers',()=>{
  for(const phase of ['starting','ready','error'])assert.deepEqual(panelStatusRelay({type:'biometry:panel-status',phase,tabId:999,panelToken:'forged',patient:{name:'PRIVATE'},data:{al:'24'}},sender(),id),{type:'biometry:panel-status',phase,panelToken:token,tabId:42});
});

test('panel status rejects wrong origin, extension, document path, tab and frame',()=>{
  const invalid=[
    {...sender(),id:'another'},
    {...sender(),url:'https://iolsolver.com/regular'},
    {...sender(),url:url.replace(`${id}/`,`${id}.attacker/`)},
    {...sender(),url:url.replace('/index.html?','/index.html-copy?')},
    {...sender(),tab:{id:43}},
    {...sender(),tab:undefined},
    {...sender(),frameId:0},
    {...sender(),frameId:-1},
    {...sender(),frameId:undefined},
    {...sender(),frameId:1.5},
  ];
  for(const source of invalid)assert.equal(panelStatusRelay({type:'biometry:panel-status',phase:'ready'},source,id),undefined);
});

test('panel status rejects missing, malformed, duplicate and out-of-range context',()=>{
  for(const invalidUrl of [
    url.replace('view=floating','view=launcher'),
    url.replace('&panelToken='+token,''),
    url.replace(token,'too-short'),
    url.replace(token,'x'.repeat(101)),
    url.replace(token,'invalid%20token%20characters'),
    url.replace('tabId=42','tabId=-1'),
    url.replace('tabId=42','tabId=42x'),
    url.replace('tabId=42','tabId=9007199254740992'),
    url+'&tabId=43',url+'&view=floating',url+'&panelToken=another-token-value',
  ])assert.equal(panelContextFromUrl(invalidUrl,id),undefined);
});

test('status phases have a strict metadata-only allowlist',()=>{
  for(const phase of ['loading','patient',null,{},'READY','__proto__'])assert.equal(panelStatusRelay({type:'biometry:panel-status',phase},sender(),id),undefined);
  assert.equal(panelStatusRelay({type:'biometry:session:read',phase:'ready'},sender(),id),undefined);
  assert.deepEqual(panelContextFromUrl(url,id),{tabId:42,panelToken:token});
});

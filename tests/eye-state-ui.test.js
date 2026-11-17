import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {eyeStateMarkup} from '../src/eye-state-ui.js';

const doc=options=>new JSDOM(eyeStateMarkup(options)).window.document;
const pressed=(document,attribute)=>[...document.querySelectorAll(`[${attribute}][${attribute==='data-eye'?'aria-selected':'aria-pressed'}="true"]`)].map(el=>el.getAttribute(attribute));

test('eye tabs and LVC toggle choices each expose one selected native button with stable accessible labels',()=>{
  const document=doc({eye:'OS',values:{lvcType:'hyperopic'},counts:{OD:3,OS:8}});
  assert.deepEqual(pressed(document,'data-eye'),['OS']);assert.deepEqual(pressed(document,'data-lvc'),['hyperopic']);
  assert.equal(document.querySelectorAll('.choice-group[role="group"]').length,2);
  assert.equal(document.querySelectorAll('.eye-choices[role="tablist"]').length,1);
  assert.equal(document.querySelectorAll('button[type="button"][aria-pressed]').length,6);
  assert.equal(document.querySelectorAll('[data-eye][role="tab"]').length,2);
  assert.equal(document.querySelector('[data-eye="OS"]').tabIndex,0);assert.equal(document.querySelector('[data-eye="OD"]').tabIndex,-1);
  assert.equal(document.querySelector('[data-eye="OS"]').getAttribute('aria-controls'),'biometry-form');
  assert.equal(document.querySelector('input,select,[role="switch"],[role="radio"]'),null);
  assert.equal(document.querySelector('[data-count="OS"]').textContent,'8');
  assert.match(document.querySelector('[data-lvc="hyperopic"]').getAttribute('aria-label'),/LASIK/);
  assert.throws(()=>eyeStateMarkup({eye:'OU'}),/OD 或 OS/);
});

test('independent boolean modes preserve explicit false over legacy keratoconus data',()=>{
  assert.deepEqual(pressed(doc({values:{toric:true,keratoconus:true,lvcType:'myopic'}}),'data-mode'),['toric','keratoconus']);
  const legacy=doc({values:{lvcType:'keratoconus'}});
  assert.deepEqual(pressed(legacy,'data-mode'),['keratoconus']);assert.deepEqual(pressed(legacy,'data-lvc'),['none']);
  const explicit=doc({values:{keratoconus:false,lvcType:'keratoconus'}});
  assert.deepEqual(pressed(explicit,'data-mode'),[]);assert.deepEqual(pressed(explicit,'data-lvc'),['none']);
  assert.equal(legacy.querySelector('[data-lvc="keratoconus"]'),null);
});

test('absent LVC uses No and unrecognized historical types remain visibly uncertain',()=>{
  for(const lvcType of ['',undefined,'none'])assert.deepEqual(pressed(doc({values:{lvcType}}),'data-lvc'),['none']);
  for(const lvcType of ['unrecognized-source-type','unknown']){
    const values={lvcType},document=doc({values});
    assert.deepEqual(pressed(document,'data-lvc'),[]);
    assert.equal(document.querySelector('[data-lvc="unknown"]'),null);
    assert.match(document.querySelector('.lvc-source-note').textContent,/來源/);
    assert.equal(values.lvcType,lvcType);
  }
});

test('markup escapes untrusted displayed counts and does not mutate stored eye values',()=>{
  const values={toric:true,keratoconus:false,lvcType:'rk',al:'24.32'},before=structuredClone(values);
  const document=doc({values,counts:{OD:'<img src=x onerror="attack()">',OS:0}});
  assert.equal(document.querySelector('[data-count="OD"]').textContent,'<img src=x onerror="attack()">');
  assert.equal(document.querySelector('img,[onerror]'),null);assert.deepEqual(values,before);
  assert.deepEqual(pressed(document,'data-lvc'),['rk']);
});


test('short visible labels keep full eye and KC meanings in accessible names',()=>{
  const document=doc({eye:'OD',counts:{OD:10,OS:8}});
  const od=document.querySelector('[data-eye="OD"]'),os=document.querySelector('[data-eye="OS"]'),kc=document.querySelector('[data-mode="keratoconus"]');
  assert.equal(od.textContent,'OD10');assert.equal(os.textContent,'OS8');
  assert.equal(od.querySelector('span'),null);assert.equal(os.querySelector('span'),null);
  assert.equal(od.getAttribute('aria-label'),'OD 右眼');assert.equal(os.getAttribute('aria-label'),'OS 左眼');
  assert.equal(kc.textContent,'KC');assert.equal(kc.title,'Keratoconus 圓錐角膜');assert.equal(kc.getAttribute('aria-label'),'Keratoconus 圓錐角膜');
});

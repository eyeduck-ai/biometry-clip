import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { siteBridge } from '../src/bridge.js';
import { emptyCase } from '../src/model.js';
import { APACRS_SITES } from '../src/adapters/apacrs.js';
import { OTHER_SITES } from '../src/adapters/other-sites.js';

function fixture(t, html, url = 'https://calculator.test/regular') {
  const dom = new JSDOM(html, { url });
  const keys = ['document', 'location', 'getComputedStyle', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'Event'];
  const saved = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'getComputedStyle' ? dom.window.getComputedStyle.bind(dom.window) : dom.window[key] });
  // jsdom performs no layout. Preserve the browser engine's visible/hidden
  // distinction while treating normal controls as occupying a client rectangle.
  dom.window.HTMLElement.prototype.getClientRects = function () {
    return this.hidden || this.style.display === 'none' || this.closest('[hidden]') ? [] : [{ x: 0, y: 0, width: 80, height: 24 }];
  };
  t.after(() => {
    for (const [key, descriptor] of saved) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
    dom.window.close();
  });
  return dom.window;
}
const f = (key, selector, extra = {}) => ({ key, selectors: [selector], ...extra });
const genderChoices = {key:'patient.gender',control:'exclusive-checkboxes',choices:{male:'input[name="gender_1"]',female:'input[name="gender_2"]'}};
const profile = (fields, extra = {}) => ({ id: 'fixture', url: 'https://calculator.test/regular', path: '/regular', fields, ...extra });

test('only explicitly declared derived readonly values can be read, and none can be written',t=>{
  const win=fixture(t,'<input id="derived" readonly value="175"><input id="other" readonly value="90">'),data=emptyCase();data.eyes.OD.k2Axis='85';
  const p=profile([f('k2Axis','#derived',{readOnlyValue:true}),f('k1Axis','#other')]);
  const read=siteBridge('read',p,data,{eye:'OD',eyeConfirmed:true});assert.equal(read.rows.find(row=>row.key==='k2Axis').value,'175');assert.equal(read.rows.find(row=>row.key==='k2Axis').status,'read');assert.notEqual(read.rows.find(row=>row.key==='k1Axis').status,'read');
  const preview=siteBridge('preview',p,data,{eye:'OD',eyeConfirmed:true});assert.equal(preview.rows.some(row=>row.key==='k2Axis'),false);siteBridge('apply',p,data,{eye:'OD',eyeConfirmed:true,expected:preview.rows});assert.equal(win.document.querySelector('#derived').value,'175');
  win.document.querySelector('#derived').disabled=true;assert.equal(siteBridge('read',p,data,{eye:'OD',eyeConfirmed:true}).rows.find(row=>row.key==='k2Axis').status,'read');
  win.document.querySelector('#derived').disabled=false;win.document.querySelector('#derived').readOnly=false;assert.equal(siteBridge('preview',p,data,{eye:'OD',eyeConfirmed:true}).rows.some(row=>row.key==='k2Axis'),false);
});
function caseWith(values = {}, activeEye = 'OD') {
  const data = emptyCase();
  data.activeEye = activeEye;
  data.eyes[activeEye] = values;
  return data;
}
function previewAndApply(p, data, options = {}) {
  const preview = siteBridge('preview', p, data, options);
  const applied = siteBridge('apply', p, data, { ...options, expected: preview.rows });
  return { preview, applied };
}

test('ARIA read-only or disabled controls are not writable and become manual inventory entries', t => {
  fixture(t,'<input id="al" aria-readonly="true" required value="21"><input id="acd" aria-disabled="true" value="3.1">');
  const p=profile([f('al','#al'),f('acd','#acd')]),data=caseWith({al:'23',acd:'3.2'});
  const inventory=siteBridge('inspect',p,data);
  assert.ok(inventory.fields.every(row=>row.visible && !row.available && row.status==='manual'));
  const {applied}=previewAndApply(p,data);assert.ok(applied.rows.every(row=>row.status==='missing'));
  assert.equal(document.querySelector('#al').value,'21');assert.equal(document.querySelector('#acd').value,'3.1');
});

test('unmapped label hints exclude nested textarea and editable text values',t=>{
  fixture(t,'<label>Clinical note<textarea required>PRIVATE-TEXTAREA-VALUE</textarea><span contenteditable="true">PRIVATE-EDITABLE-VALUE</span></label><div id="aria-note">History <textarea>PRIVATE-REFERENCED-VALUE</textarea></div><input required aria-labelledby="aria-note">');
  const result=siteBridge('inspect',profile([]),emptyCase());
  assert.deepEqual(result.unmappedRequired.map(row=>row.label),['Clinical note','History']);
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});

test('the ESCRS adapter maps required initials using identity fallback while custom gender stays manual',async t=>{
  const grid=['OD','OS'].map(eye=>`<div class="mud-grid-item">${['SIA','Incision','K1 axis','K2 axis'].map(label=>`<label for="${eye}-${label.replaceAll(' ','-')}">${label}</label><input id="${eye}-${label.replaceAll(' ','-')}" value="">`).join('')}</div>`).join('');
  fixture(t,`<label for="surgeon">Surgeon</label><input id="surgeon" required aria-required="true"><label for="initials">Patient Initials</label><input id="initials" required aria-required="true"><label for="gender">Gender</label><input id="gender" type="text" role="combobox" readonly required aria-required="true"><div class="mud-grid mud-grid-spacing-xs-6 noprint">${grid}</div>`,'https://iolcalculator.escrs.org/');
  const p={...OTHER_SITES.find(site=>site.id==='escrs'),writeSettleMs:0},data=emptyCase();data.patient.surgeonName='SYNTHETIC SURGEON';data.patient.name='SYNTHETIC FULL NAME';data.eyes.OD={toric:true,sia:'0.25',incisionAxis:'90',k1Axis:'10',k2Axis:'100'};data.eyes.OS={toric:true,sia:'0.50',incisionAxis:'180',k1Axis:'20',k2Axis:'110'};
  const preview=siteBridge('preview',p,data,{eye:'OU',includeIdentifiers:true}),applied=await siteBridge('apply',p,data,{eye:'OU',includeIdentifiers:true,expected:preview.rows});
  assert.equal(applied.rows.filter(row=>row.status==='filled').length,10);
  assert.equal(document.querySelector('#OD-SIA').value,'0.25');assert.equal(document.querySelector('#OS-SIA').value,'0.50');assert.equal(document.querySelector('#surgeon').value,'SYNTHETIC SURGEON');
  assert.equal(document.querySelector('#initials').value,'SYNTHETIC FULL NAME');assert.equal(document.querySelector('#gender').value,'');
  const result=siteBridge('inspect',p,data,{eye:'OU'});
  assert.ok(result.fields.find(row=>row.key==='patient.surgeonName').required);
  assert.deepEqual(result.unmappedRequired.map(row=>row.label),['Gender']);
});

test('trailing ASCII and fullwidth required stars are ignored only for label matching',t=>{
  fixture(t,'<label for="surgeon">Surgeon*</label><input id="surgeon"><label for="sia">SIA ＊</label><input id="sia"><label for="choice">IOL*</label><select id="choice"><option value="Model*">Model*</option></select>');
  const p=profile([{key:'patient.surgeonName',labels:['Surgeon']},{key:'sia',labels:['SIA']},{key:'biometer',labels:['IOL']}]),data=caseWith({sia:'0.25',biometer:'Model'});data.patient.surgeonName='SYNTHETIC';
  const {applied}=previewAndApply(p,data,{includeIdentifiers:true});
  assert.equal(applied.rows.find(row=>row.key==='patient.surgeonName').status,'filled');assert.equal(applied.rows.find(row=>row.key==='sia').status,'filled');
  assert.equal(applied.rows.find(row=>row.key==='biometer').status,'option-missing');assert.equal(document.querySelector('#choice').value,'Model*');
});

test('normalizing required stars never resolves an ambiguous pair of matching labels',t=>{
  fixture(t,'<label for="first">SIA*</label><input id="first" value="0.1"><label for="second">SIA＊</label><input id="second" value="0.2">');
  const {applied}=previewAndApply(profile([{key:'sia',labels:['SIA']}]),caseWith({sia:'0.5'}));
  assert.equal(applied.rows[0].status,'ambiguous');assert.deepEqual([...document.querySelectorAll('input')].map(input=>input.value),['0.1','0.2']);
});

test('Kane sex checkboxes preserve exclusivity and read back the clinical gender', t => {
  fixture(t,'<input type="checkbox" name="gender_1" checked><input type="checkbox" name="gender_2">');
  const data=emptyCase();data.patient.gender='female';
  const p=profile([genderChoices]);
  const {applied}=previewAndApply(p,data);
  assert.equal(applied.rows[0].status,'filled');
  assert.equal(document.querySelector('[name="gender_1"]').checked,false);
  assert.equal(document.querySelector('[name="gender_2"]').checked,true);
  assert.equal(siteBridge('read',p,emptyCase()).rows[0].value,'female');
});

test('bilateral paste uses each eye once and writes a compatible shared constant once', t => {
  fixture(t,'<input id="od" value="21"><input id="os" value="22"><input id="constant" value="119"><input id="name">');
  const p=profile([f('al','#od',{eye:'OD'}),f('al','#os',{eye:'OS'}),f('aConstant','#constant'),f('patient.name','#name')],{eyeMode:'both'});
  const data=caseWith({al:'23.45',aConstant:'118.7'});data.eyes.OS={al:'24.10',aConstant:'118.70'};data.patient.name='SYNTHETIC';
  let changes=0;document.querySelector('#constant').addEventListener('change',()=>changes++);
  const {preview,applied}=previewAndApply(p,data,{eye:'OU',includeIdentifiers:true,includeConstants:true});
  assert.ok(!preview.error);assert.ok(applied.rows.every(row=>row.status==='filled'));
  assert.equal(document.querySelector('#od').value,'23.45');assert.equal(document.querySelector('#os').value,'24.10');
  assert.equal(document.querySelector('#constant').value,'118.7');assert.equal(changes,1);
  assert.equal(applied.rows.find(row=>row.key==='aConstant').eye,'shared');
  assert.equal(applied.rows.filter(row=>row.key==='patient.name').length,1);
  assert.equal(applied.rows.find(row=>row.key==='patient.name').eye,'patient');
});

test('bilateral read collects both eyes independently while one-eye paste preserves its neighbour', t => {
  fixture(t,'<input id="od" value="23.45"><input id="os" value="24.10"><input id="constant" value="118.7">');
  const p=profile([f('al','#od',{eye:'OD'}),f('al','#os',{eye:'OS'}),f('aConstant','#constant')],{eyeMode:'both'});
  const read=siteBridge('read',p,emptyCase(),{eye:'OU'});
  assert.deepEqual(read.rows.map(row=>[row.eye,row.value]),[['OD','23.45'],['OS','24.10'],['shared','118.7']]);
  const data=caseWith({al:'25'},'OS');data.eyes.OD.al='26';
  previewAndApply(p,data,{eye:'OS'});
  assert.equal(document.querySelector('#od').value,'23.45');assert.equal(document.querySelector('#os').value,'25');
});

test('bilateral blank values never erase the other eye and zero stays valid', t => {
  fixture(t,'<input id="od" value="1"><input id="os" value="2">');
  const p=profile([f('target','#od',{eye:'OD'}),f('target','#os',{eye:'OS'})],{eyeMode:'both'});
  const data=caseWith({target:'0'});data.eyes.OS.target='';
  const {applied}=previewAndApply(p,data,{eye:'OU'});
  assert.equal(applied.rows.length,1);assert.equal(document.querySelector('#od').value,'0');assert.equal(document.querySelector('#os').value,'2');
});

test('single-eye calculators reject bilateral operations before any control changes', t => {
  fixture(t,'<input id="al" value="21">');
  const p=profile([f('al','#al')],{eyeMode:'single'}),data=caseWith({al:'25'});
  for(const action of ['read','preview','apply']){
    const result=siteBridge(action,p,data,{eye:'OU',eyeConfirmed:true,expected:[]});
    assert.match(result.error,/單眼/);assert.deepEqual(result.rows,[]);
  }
  assert.equal(document.querySelector('#al').value,'21');
});

test('conflicting shared constants abort bilateral paste before writing either eye', t => {
  fixture(t,'<input id="od" value="21"><input id="os" value="22"><input id="constant" value="119">');
  const p=profile([f('al','#od',{eye:'OD'}),f('al','#os',{eye:'OS'}),f('aConstant','#constant')],{eyeMode:'both'});
  const data=caseWith({al:'23.45',aConstant:'118.7'});data.eyes.OS={al:'24.10',aConstant:'119.2'};
  for(const action of ['preview','apply'])assert.match(siteBridge(action,p,data,{eye:'OU',expected:[],includeConstants:true}).error,/共用/);
  assert.deepEqual([...document.querySelectorAll('input')].map(el=>el.value),['21','22','119']);
});

test('a shared bilateral field can use the one explicitly populated eye without inventing values', t => {
  fixture(t,'<input id="constant">');
  const p=profile([f('aConstant','#constant')],{eyeMode:'both'}),data=emptyCase();data.eyes.OS.aConstant='118.7';
  const {preview,applied}=previewAndApply(p,data,{eye:'OU',includeConstants:true});
  assert.deepEqual(preview.rows[0].sourceEyes,['OS']);assert.equal(applied.rows[0].status,'filled');
  assert.equal(document.querySelector('#constant').value,'118.7');assert.equal(data.eyes.OD.aConstant,undefined);
});

test('bilateral Toric gating is evaluated separately for each eye', t => {
  fixture(t,'<input id="od-axis"><input id="os-axis">');
  const p=profile([f('k1Axis','#od-axis',{eye:'OD',mode:'toric'}),f('k1Axis','#os-axis',{eye:'OS',mode:'toric'})],{eyeMode:'both'});
  const data=caseWith({toric:true,k1Axis:'90'});data.eyes.OS={toric:false,k1Axis:'80'};
  const {applied}=previewAndApply(p,data,{eye:'OU'});
  assert.deepEqual(applied.rows.map(row=>row.eye),['OD']);assert.equal(document.querySelector('#od-axis').value,'90');assert.equal(document.querySelector('#os-axis').value,'');
  assert.equal(siteBridge('read',p,emptyCase(),{eye:'OU'}).rows.length,2);
});

test('live inventory exposes visibility and required metadata without reading any field value', t => {
  fixture(t,'<input id="od" required value="PRIVATE-AL"><input id="os" aria-required="true" value="PRIVATE-OS"><input id="lt" value="PRIVATE-LT"><input id="disabled" required disabled><input id="hidden" hidden required><input id="name" value="PRIVATE-NAME">');
  const p=profile([f('al','#od',{eye:'OD',unit:'mm'}),f('al','#os',{eye:'OS',unit:'mm'}),f('lt','#lt',{eye:'OD'}),f('cct','#disabled',{eye:'OD'}),f('tk1','#hidden',{eye:'OD'}),f('patient.name','#name')],{eyeMode:'both',required:['al'],requiredIdentity:['patient.name']});
  for(const el of document.querySelectorAll('input'))Object.defineProperty(el,'value',{get(){throw new Error('inventory must not read value');}});
  const result=siteBridge('inspect',p,emptyCase(),{eye:'OD'});
  assert.ok(!result.error);assert.equal(result.rows.length,0);assert.equal(result.fields.length,6);
  assert.deepEqual(result.fields.filter(row=>row.key==='al').map(row=>row.eye),['OD','OS']);
  assert.equal(result.fields.find(row=>row.key==='lt').required,false);
  assert.equal(result.fields.find(row=>row.key==='cct').visible,true);assert.equal(result.fields.find(row=>row.key==='cct').available,false);
  assert.equal(result.fields.find(row=>row.key==='tk1').visible,false);assert.equal(result.fields.find(row=>row.key==='tk1').required,false);
  assert.ok(result.fields.filter(row=>row.key==='al').every(row=>row.required));
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});

test('inventory reports the live single-eye choice without requiring confirmation or matching the panel', t => {
  fixture(t,'<input type="radio" id="od"><input type="radio" id="os" checked><input id="al">');
  const p=profile([f('al','#al')],{eyeMode:'single',eyeSelectors:{OD:['#od'],OS:['#os']}});
  const result=siteBridge('inspect',p,emptyCase(),{eye:'OD'});
  assert.ok(!result.error);assert.equal(result.detectedEye,'OS');assert.equal(result.fields[0].eye,'current');assert.equal(result.fields[0].available,true);
});

test('inventory reports unmapped required controls as label-only manual hints', t => {
  fixture(t,'<input id="al" required value="PRIVATE-AL"><label for="lens">IOL model</label><select id="lens" required><option value="PRIVATE-MODEL">Synthetic model</option></select><input aria-label="Consent" type="checkbox" required><input aria-label="Hidden" required hidden><input aria-label="Disabled" required disabled><input aria-label="Read only" required readonly><input aria-label="Extra" aria-required="true" value="PRIVATE-EXTRA">');
  for(const el of document.querySelectorAll('input,select'))Object.defineProperty(el,'value',{get(){throw new Error('must not read value');}});
  const result=siteBridge('inspect',profile([f('al','#al')],{required:['al']}),emptyCase());
  assert.deepEqual(result.unmappedRequired.map(row=>row.label),['IOL model','Consent','Extra']);
  assert.ok(result.unmappedRequired.every(row=>Object.keys(row).sort().join(',')==='label,reason,type'));
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});

test('ambiguous or edited gender groups cannot be silently selected', t => {
  fixture(t,'<input type="checkbox" name="gender_1" checked><input type="checkbox" name="gender_2" checked>');
  const data=emptyCase();data.patient.gender='male';const p=profile([genderChoices]);
  assert.equal(siteBridge('read',p,data).rows[0].status,'ambiguous');
  assert.equal(siteBridge('preview',p,data).rows[0].status,'ambiguous');
  document.querySelector('[name="gender_2"]').checked=false;
  const preview=siteBridge('preview',p,data);
  document.querySelector('[name="gender_2"]').checked=true;
  assert.equal(siteBridge('apply',p,data,{expected:preview.rows}).rows[0].status,'ambiguous');
  document.querySelector('[name="gender_1"]').checked=false;
  assert.equal(siteBridge('apply',p,data,{expected:preview.rows}).rows[0].status,'changed');
});

test('writes through the native setter, dispatches input/change, and never submits', t => {
  const window = fixture(t, '<form><input id="al" value="22.00"><button type="submit">Calculate</button></form>');
  const seen = [];
  const input = window.document.querySelector('#al');
  input.addEventListener('input', event => seen.push([event.type, event.bubbles, input.value]));
  input.addEventListener('change', event => seen.push([event.type, event.bubbles, input.value]));
  window.document.querySelector('form').addEventListener('submit', () => assert.fail('bridge must never submit calculations'));
  window.document.querySelector('button').addEventListener('click', () => assert.fail('bridge must never click Calculate'));
  const { preview, applied } = previewAndApply(profile([f('al', '#al')]), caseWith({ al: '24.12' }));
  assert.equal(preview.rows[0].status, 'ready');
  assert.equal(preview.rows[0].previous, '22.00');
  assert.equal(applied.rows[0].status, 'filled');
  assert.equal(input.value, '24.12');
  assert.deepEqual(seen, [['input', true, '24.12'], ['change', true, '24.12']]);
});

test('only the active eye is written on a bilateral APACRS form', t => {
  fixture(t, '<input id="MainContent_Axlength" value="21"><input id="MainContent_Axlength0" value="22">', 'https://calc.apacrs.org/barrett_universal2105/');
  const data = caseWith({ al: '25.2' }, 'OS');
  data.eyes.OD.al = '24.1';
  const p = APACRS_SITES.find(site => site.id === 'barrett-universal');
  const { applied } = previewAndApply(p, data);
  assert.equal(document.querySelector('#MainContent_Axlength').value, '21');
  assert.equal(document.querySelector('#MainContent_Axlength0').value, '25.2');
  assert.equal(applied.rows.filter(row => row.status === 'filled').length, 1);
  assert.ok(applied.rows.every(row => row.eye === 'OS'));
});

test('single-eye mismatch blocks preview and apply even with a prior confirmation', t => {
  fixture(t, '<input type="radio" id="od"><input type="radio" id="os" checked><input id="al" value="22">');
  const p = profile([f('al', '#al')], { eyeMode: 'single', eyeSelectors: { OD: ['#od'], OS: ['#os'] } });
  const data = caseWith({ al: '25' });
  for (const action of ['preview', 'apply', 'read']) {
    const result = siteBridge(action, p, data, { eyeConfirmed: true, expected: [] });
    assert.equal(result.detectedEye, 'OS');
    assert.match(result.error, /OS/);
    assert.deepEqual(result.rows, []);
  }
  assert.equal(document.querySelector('#al').value, '22');
});

test('single-eye pages require a selected radio or explicit eye confirmation', t => {
  fixture(t, '<input type="radio" id="od"><input type="radio" id="os"><input id="al">');
  const p = profile([f('al', '#al')], { eyeMode: 'single', eyeSelectors: { OD: ['#od'], OS: ['#os'] } });
  const data = caseWith({ al: '24' });
  assert.match(siteBridge('preview', p, data).error, /眼別/);
  const { applied } = previewAndApply(p, data, { eyeConfirmed: true });
  assert.equal(applied.rows[0].status, 'filled');
  assert.equal(document.querySelector('#od').checked, false);
  assert.equal(document.querySelector('#os').checked, false);
});

test('multiple matching elements stay ambiguous and are not written', t => {
  fixture(t, '<input class="al" value="21"><input class="al" value="22">');
  const { applied } = previewAndApply(profile([f('al', '.al')]), caseWith({ al: '24' }));
  assert.equal(applied.rows[0].status, 'ambiguous');
  assert.deepEqual([...document.querySelectorAll('.al')].map(el => el.value), ['21', '22']);
});

test('two distinct fields resolving to one input are both blocked', t => {
  fixture(t, '<input id="shared" value="21">');
  const p = profile([f('k1', '#shared'), f('k2', '#shared')]);
  const { preview, applied } = previewAndApply(p, caseWith({ k1: '42', k2: '43' }));
  assert.ok(preview.rows.every(row => row.status === 'ambiguous'));
  assert.ok(applied.rows.every(row => row.status === 'ambiguous'));
  assert.equal(document.querySelector('#shared').value, '21');
});

test('selects map clinical enums and accept numeric-equivalent option values', t => {
  fixture(t, '<select id="history"><option value="Myopic Lasik">Myopic Lasik</option><option value="Radial Keratotomy">Radial Keratotomy</option></select><select id="cylinder"><option value="0">0</option><option value="3.0">T5</option></select>');
  const p = profile([
    f('lvcType', '#history', { valueMap: { myopic: 'Myopic Lasik', rk: 'Radial Keratotomy' } }),
    f('implantedIolCylinder', '#cylinder'),
  ]);
  const { preview, applied } = previewAndApply(p, caseWith({ lvcType: 'rk', implantedIolCylinder: '3' }));
  assert.deepEqual(preview.rows.map(row => row.mappedValue), ['Radial Keratotomy', '3.0']);
  assert.ok(applied.rows.every(row => row.status === 'filled'));
  assert.equal(document.querySelector('#history').value, 'Radial Keratotomy');
  assert.equal(document.querySelector('#cylinder').value, '3.0');
});

test('missing select options cannot erase an existing selection', t => {
  fixture(t, '<select id="history"><option value="Myopic Lasik">Myopic Lasik</option></select>');
  const { applied } = previewAndApply(profile([f('lvcType', '#history')]), caseWith({ lvcType: 'rk' }));
  assert.equal(applied.rows[0].status, 'option-missing');
  assert.equal(document.querySelector('#history').value, 'Myopic Lasik');
});

test('a website edit after preview invalidates that write', t => {
  fixture(t, '<input id="al" value="21">');
  const p = profile([f('al', '#al')]);
  const data = caseWith({ al: '24' });
  const preview = siteBridge('preview', p, data);
  document.querySelector('#al').value = '22';
  const result = siteBridge('apply', p, data, { expected: preview.rows });
  assert.equal(result.rows[0].status, 'changed');
  assert.equal(document.querySelector('#al').value, '22');
});

test('a changed panel value and missing preview each block writing', t => {
  fixture(t, '<input id="al" value="21">');
  const p = profile([f('al', '#al')]);
  const data = caseWith({ al: '24' });
  const preview = siteBridge('preview', p, data);
  data.eyes.OD.al = '25';
  assert.equal(siteBridge('apply', p, data, { expected: preview.rows }).rows[0].status, 'changed');
  assert.equal(siteBridge('apply', p, data).rows[0].status, 'changed');
  assert.equal(document.querySelector('#al').value, '21');
});

test('blank source fields do not clear the website, while zero remains valid', t => {
  fixture(t, '<input id="al" value="21"><input id="target" value="-1">');
  const { preview, applied } = previewAndApply(profile([f('al', '#al'), f('target', '#target')]), caseWith({ al: '', target: 0 }));
  assert.deepEqual(preview.rows.map(row => row.key), ['target']);
  assert.equal(applied.rows[0].status, 'filled');
  assert.equal(document.querySelector('#al').value, '21');
  assert.equal(document.querySelector('#target').value, '0');
});

test('reading a populated page into an empty case does not depend on panel values', t => {
  fixture(t, '<input id="al" value="24.45"><select id="history"><option value="Radial Keratotomy">Radial Keratotomy</option></select><input id="target" value="0">');
  const data = emptyCase();
  const p = profile([f('al', '#al'), f('lvcType', '#history', { valueMap: { rk: 'Radial Keratotomy' } }), f('target', '#target')]);
  const result = siteBridge('read', p, data);
  assert.deepEqual(result.rows.map(({ key, value, status }) => ({ key, value, status })), [
    { key: 'al', value: '24.45', status: 'read' },
    { key: 'lvcType', value: 'rk', status: 'read' },
    { key: 'target', value: '0', status: 'read' },
  ]);
  assert.deepEqual(data.eyes.OD, {});
});

test('patient identifiers require opt-in for both reading and writing', t => {
  fixture(t, '<input id="patient" value="WEBSITE-CASE"><input id="al" value="21">');
  const p = profile([f('patient.patientId', '#patient'), f('al', '#al')]);
  const data = caseWith({ al: '24' });
  data.patient.patientId = 'LOCAL-CASE';
  const without = previewAndApply(p, data);
  assert.ok(without.preview.rows.every(row => row.key !== 'patient.patientId'));
  assert.equal(document.querySelector('#patient').value, 'WEBSITE-CASE');
  assert.ok(siteBridge('read', p, emptyCase()).rows.every(row => row.key !== 'patient.patientId'));
  const read = siteBridge('read', p, emptyCase(), { includeIdentifiers: true });
  assert.equal(read.rows.find(row => row.key === 'patient.patientId').value, 'WEBSITE-CASE');
  const withIdentifiers = previewAndApply(p, data, { includeIdentifiers: true });
  assert.equal(withIdentifiers.applied.rows.find(row => row.key === 'patient.patientId').status, 'filled');
  assert.equal(document.querySelector('#patient').value, 'LOCAL-CASE');
});

test('a stale profile on the same host but another calculator is rejected', t => {
  fixture(t, '<input id="al" value="21">', 'https://calculator.test/complex');
  const p = profile([f('al', '#al')]);
  const result = siteBridge('preview', p, caseWith({ al: '24' }));
  assert.ok(result.error);
  assert.deepEqual(result.rows, []);
});

test('a different host is rejected before controls are inspected', t => {
  fixture(t, '<input id="al" value="21">', 'https://other.test/regular');
  const result = siteBridge('preview', profile([f('al', '#al')]), caseWith({ al: '24' }));
  assert.ok(result.error);
  assert.deepEqual(result.rows, []);
});

test('associated labels resolve unambiguously and repeated labels are blocked', t => {
  fixture(t, '<label for="al">Axial Length</label><input id="al"><label for="k1">K</label><input id="k1"><label for="k2">K</label><input id="k2">');
  const p = profile([{ key: 'al', labels: ['Axial Length'] }, { key: 'k1', labels: ['K'] }]);
  const { applied } = previewAndApply(p, caseWith({ al: '24', k1: '42' }));
  assert.equal(applied.rows.find(row => row.key === 'al').status, 'filled');
  assert.equal(applied.rows.find(row => row.key === 'k1').status, 'ambiguous');
});

test('hidden, disabled and readonly controls are never overwritten', t => {
  fixture(t, '<input id="al" disabled value="21"><input id="acd" readonly value="3"><input id="lt" hidden value="4"><input type="hidden" id="target" value="0">');
  const p = profile([f('al', '#al'), f('acd', '#acd'), f('lt', '#lt'), f('target', '#target')]);
  const { applied } = previewAndApply(p, caseWith({ al: '24', acd: '3.5', lt: '4.5', target: '-1' }));
  assert.ok(applied.rows.every(row => row.status === 'missing'));
  assert.deepEqual([...document.querySelectorAll('input')].map(el => el.value), ['21', '3', '4', '0']);
});

test('APACRS Rx never substitutes ordinary K values for post-operative K', t => {
  fixture(t, '<input type="radio" id="MainContent_Rad1" checked><input id="MainContent_MeasuredK" value="43"><input id="MainContent_MeasuredK0" value="44">', 'https://calc.apacrs.org/barrett_rx105/');
  const p = APACRS_SITES.find(site => site.id === 'barrett-rx');
  const data = caseWith({ k1: '40', k2: '41' });
  const { applied } = previewAndApply(p, data);
  assert.deepEqual(applied.rows, []);
  assert.equal(document.querySelector('#MainContent_MeasuredK').value, '43');
  data.eyes.OD.postOpK1 = '42.5';
  const { applied: postOp } = previewAndApply(p, data);
  assert.equal(postOp.rows.find(row => row.key === 'postOpK1').status, 'filled');
  assert.equal(document.querySelector('#MainContent_MeasuredK').value, '42.5');
});

test('a change handler modifying a later target invalidates that later write', t => {
  fixture(t, '<input id="al" value="21"><input id="target" value="0">');
  document.querySelector('#al').addEventListener('change', () => { document.querySelector('#target').value = '-2'; });
  const p = profile([f('al', '#al'), f('target', '#target')]);
  const { applied } = previewAndApply(p, caseWith({ al: '24', target: '-1' }));
  assert.equal(applied.rows.find(row => row.key === 'al').status, 'filled');
  assert.equal(applied.rows.find(row => row.key === 'target').status, 'changed');
  assert.equal(document.querySelector('#target').value, '-2');
});

test('a rerender cannot report filling an input already detached from the page', t => {
  fixture(t, '<input id="al" value="21"><div id="target-slot"><input id="target" value="0"></div>');
  document.querySelector('#al').addEventListener('change', () => { document.querySelector('#target-slot').innerHTML = '<input id="target" value="-2">'; });
  const { applied } = previewAndApply(profile([f('al', '#al'), f('target', '#target')]), caseWith({ al: '24', target: '-1' }));
  assert.equal(applied.rows.find(row => row.key === 'target').status, 'changed');
  assert.equal(document.querySelector('#target').value, '-2');
});

test('reading does not return either of two aliases of the same input as trusted data', t => {
  fixture(t, '<input id="shared" value="42">');
  const result = siteBridge('read', profile([f('k1', '#shared'), f('k2', '#shared')]), emptyCase());
  assert.equal(result.rows.length, 2);
  assert.ok(result.rows.every(row => row.status === 'ambiguous'));
});

test('reading toric page fields works before the panel toric toggle has been set', t => {
  fixture(t, '<input id="axis" value="175">');
  const result = siteBridge('read', profile([f('k1Axis', '#axis', { mode: 'toric' })]), emptyCase());
  assert.equal(result.rows[0].status, 'read');
  assert.equal(result.rows[0].value, '175');
});

test('ordinary paste preserves website IOL constants by default even when stored eye constants conflict',t=>{
  fixture(t,'<input id="od"><input id="os"><input id="constant" value="119.4">');
  const p=profile([f('al','#od',{eye:'OD'}),f('al','#os',{eye:'OS'}),f('aConstant','#constant')],{eyeMode:'both'}),data=caseWith({al:'23.45',aConstant:'118.7'});data.eyes.OS={al:'24.10',aConstant:'119.2'};
  const {preview,applied}=previewAndApply(p,data,{eye:'OU'});
  assert.equal(preview.error,undefined);assert.equal(applied.rows.length,2);assert.equal(document.querySelector('#constant').value,'119.4');
  assert.equal(siteBridge('read',p,emptyCase(),{eye:'OU'}).rows.find(row=>row.key==='aConstant').value,'119.4');
});

test('eye selection uses the verified native radio pair and never writes measurements or submits',t=>{
  fixture(t,'<form><input type="radio" name="eye" id="od"><input type="radio" name="eye" id="os"><input id="al" value="21"><button id="calculate">Calculate</button></form>');
  let selections=0,submits=0;document.querySelector('#os').addEventListener('click',()=>selections++);document.querySelector('form').addEventListener('submit',event=>{event.preventDefault();submits++;});
  const p=profile([f('al','#al')],{eyeMode:'single',eyeSelectors:{OD:['#od'],OS:['#os']}}),data=caseWith({al:'24.10'},'OS');
  assert.equal(siteBridge('inspect',p,data).eyeSelectionState,'unselected');assert.equal(siteBridge('inspect',p,data).canSelectEye,true);
  const selected=siteBridge('select-eye',p,data,{eye:'OS'});assert.equal(selected.autoEyeSelected,true);assert.equal(document.querySelector('#os').checked,true);
  assert.equal(document.querySelector('#al').value,'21');assert.equal(submits,0);assert.equal(selections,1);
  assert.equal(siteBridge('inspect',p,data).detectedEye,'OS');assert.equal(siteBridge('select-eye',p,data,{eye:'OS'}).autoEyeSelected,false);
});

test('ambiguous or unrelated radio groups cannot be selected automatically',t=>{
  fixture(t,'<input type="radio" name="one" id="od"><input type="radio" name="two" id="os"><input type="radio" name="one" class="extra">');
  const data=emptyCase(),single={eyeMode:'single',eyeSelectors:{OD:['#od'],OS:['#os']}},p=profile([],single);
  assert.equal(siteBridge('inspect',p,data).canSelectEye,false);assert.match(siteBridge('select-eye',p,data).error,/無法唯一/);
  p.eyeSelectors.OD=['#od','.extra'];assert.equal(siteBridge('inspect',p,data).canSelectEye,false);assert.equal(document.querySelector('#od').checked,false);
});

test('EVO CCT always uses micrometres and ignores legacy millimetre settings',t=>{
  fixture(t,'<input type="radio" name="eye" id="RadioButtonRLEye_0" checked><input type="radio" name="eye" id="RadioButtonRLEye_1"><input id="txtCCT">','https://www.evoiolcalculator.com/Calculator.aspx');
  const p=OTHER_SITES.find(site=>site.id==='evo'),data=caseWith({cct:'543'});
  let result=previewAndApply(p,data,{evoCctUnit:'um'});assert.equal(result.applied.rows.find(row=>row.key==='cct').status,'filled');assert.equal(document.querySelector('#txtCCT').value,'543');
  result=previewAndApply(p,data,{evoCctUnit:'mm'});assert.equal(document.querySelector('#txtCCT').value,'543');
  assert.equal(siteBridge('read',p,emptyCase(),{eye:'OD',evoCctUnit:'mm'}).rows.find(row=>row.key==='cct').value,'543');
  const read=siteBridge('read',p,emptyCase(),{eye:'OD'}).rows.find(row=>row.key==='cct');assert.equal(read.status,'read');assert.equal(read.value,'543');
});

test('Kane index reads the numerical selected label rather than the option code',t=>{
  fixture(t,'<label for="index">Index</label><select id="index"><option value="0">1.3375</option><option value="1">1.332</option></select>','https://www.iolformula.com/');
  const p=OTHER_SITES.find(site=>site.id==='kane'),data=caseWith({kIndex:'1.3375'}),{applied}=previewAndApply(p,data);
  assert.equal(applied.rows.find(row=>row.key==='kIndex').status,'filled');assert.equal(document.querySelector('#index').value,'0');
  assert.equal(siteBridge('read',p,emptyCase()).rows.find(row=>row.key==='kIndex').value,'1.3375');
});

test('K index fallback fills only a blank target and preserves an explicitly selected site index',t=>{
  fixture(t,'<input id="index">');const p=profile([f('kIndex','#index')]),data=emptyCase();
  previewAndApply(p,data);assert.equal(document.querySelector('#index').value,'1.3375');
  document.querySelector('#index').value='1.332';assert.deepEqual(siteBridge('preview',p,data).rows,[]);
  data.eyes.OD.kIndex='1.3315';previewAndApply(p,data);assert.equal(document.querySelector('#index').value,'1.3315');
});

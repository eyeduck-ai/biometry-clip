import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createResultService} from '../src/result-service.js';
import {createMemoryResultStore} from '../src/result-store.js';
import {resultCsvRows, resultCsvHeader, createResultRun, normalizeResultGroups} from '../src/result-model.js';
import {matchResultSite, sameResultSiteOrigin} from '../src/result-sites.js';
import {matchSite} from '../src/sites.js';
import {isResultVisible} from '../src/result-adapters/dom.js';

const date = '2026-11-18T04:00:00.000Z';
const form = 'https://iolsolver.com/regular';
const results = 'https://iolsolver.com/result_regular';
const patient = {patientId:'p1', measurementId:'m1'};
const panel = {id:'clip', url:'chrome-extension://clip/index.html?view=floating&tabId=7'};
const scope = {caseToken:'case-1', revision:3, selection:patient};
const row = {iolPower:'22.50', predictedRefraction:'0', highlighted:true};
const group = {eye:'OS',formula:'PEARL-DGS',lensModel:'Synthetic',inputEcho:{al:'25.12'},rows:[row]};

function fixture() {
  const values = {}, calls = [];
  let id = 0, url = form, documentId = 'form-document', session = scope, groups = [];
  const tabs = new Map([
    [7, {id:7, status:'complete', url:form}],
    [8, {id:8, status:'complete', url:results, openerTabId:7}],
  ]);
  const history = createMemoryResultStore();
  const mock = {
    runtime: {id:'clip', getManifest:()=>({version:'0.5.0'}), sendMessage:async () => {}},
    storage: {session: {
      get: async key => ({[key]: structuredClone(values[key])}),
      set: async items => Object.assign(values, structuredClone(items)),
      remove: async key => { delete values[key]; },
    }},
    scripting: {executeScript: async request => {
      calls.push(request);
      return [{frameId:0, documentId}];
    }},
    tabs: {
      get: async tabId => tabs.get(tabId),
      sendMessage: async (tabId, request, options) => {
        calls.push({tabId, request, options});
        return {ok:true, sample:{url, siteId:'solver-regular', groups, observedForm:{OD:{al:'23.5'},OS:{al:'25.12'}}}};
      },
    },
  };
  const service = createResultService(mock, {
    readSession: async () => session,
    readLibrary: async () => ({patients:[{id:'p1',measurements:[{id:'m1'}]}]}),
    history, newId: () => `id-${++id}`, now: () => date,
  });
  return {
    service, values, calls, history, tabs,
    request: (action, extra, sender = panel) => service.request({type:`biometry:results:${action}`,tabId:7,...extra},sender),
    sample: value => ({url,siteId:'solver-regular',groups:value,observedForm:{OS:{al:'25.15'}}}),
    page: extra => ({id:'clip',frameId:0,documentId,tab:{id:7,url},url,...extra}),
    navigate(next) {
      documentId = 'result-document';
      url = next;
      tabs.get(7).url = next;
    },
    setGroups(value) {groups = value;},
    switchCase() {session = {...scope,caseToken:'new-case',selection:{patientId:'unrelated'}};},
  };
}

test('result route aliases never authorize the calculator fill bridge', () => {
  assert.equal(matchResultSite(results).id, 'solver-regular');
  assert.equal(matchSite(results), undefined);
  assert.equal(matchResultSite('https://www.cookeformula.com/PrintPreview').id, 'cooke');
  assert.equal(matchResultSite('https://iolsolver.com/results-admin'), undefined);
  assert.equal(matchResultSite('https://iolsolver.com.evil.example/result_regular'), undefined);
  assert.equal(matchResultSite('https://user@iolsolver.com/regular'), undefined);
  assert.equal(sameResultSiteOrigin(form, 'https://iolsolver.com/result_toric'), true);
  assert.equal(sameResultSiteOrigin('https://iolsolver.com/unrelated', results), false);
});

test('a visible result inside a form with a named hidden control is still readable', () => {
  const dom = new JSDOM('<form><input name="hidden"><table id="result"><tr><td>21.0</td></tr></table></form>');
  const form = dom.window.document.forms[0];
  const table = dom.window.document.getElementById('result');
  // Emulate Chromium's named-form-property lookup in the DOM test runtime.
  Object.defineProperty(form, 'hidden', {value: form.elements.namedItem('hidden')});
  assert.equal(isResultVisible(table), true);
  form.setAttribute('hidden', '');
  assert.equal(isResultVisible(table), false);
  dom.window.close();
});

test('automatic capture stays attached across same-site result navigation and rejects stale or spoofed messages', async () => {
  const f = fixture();
  assert.equal((await f.request('watch',{enabled:true})).watching, true);
  const {nonce} = f.values['biometryResultWatch:7'];
  await assert.rejects(f.request('list',{},f.page()),{code:'RESULT_SENDER'});
  await assert.rejects(f.request('capture',{tabId:8}),{code:'RESULT_TAB'});
  await assert.rejects(f.request('observed',{nonce:'stranger',sample:f.sample([group])},f.page()),{code:'RESULT_WATCH'});
  await assert.rejects(f.request('observed',{nonce,sample:f.sample([group])},f.page({frameId:8})),{code:'RESULT_SENDER'});

  await f.request('form-before',{nonce,sample:f.sample([])},f.page());
  f.navigate(results);
  await f.service.reconnect(7,{status:'complete'},f.tabs.get(7));
  assert.ok(f.calls.some(item => item.request?.captureExisting && item.options.documentId==='result-document'));
  await assert.rejects(f.request('observed',{nonce,sample:f.sample([group])},f.page({documentId:'form-document'})),{code:'RESULT_WATCH'});
  // A SPA's MessageSender may still identify the original calculator URL.
  await assert.rejects(f.request('observed',{nonce,sample:f.sample([group])},f.page({url:'https://evil.example/regular'})),{code:'RESULT_SENDER'});
  assert.ok((await f.request('observed',{nonce,sample:f.sample([group])},f.page({url:form}))).saved);
  const next = structuredClone(group);
  next.rows[0].siteSelected = true;
  assert.ok((await f.request('observed',{nonce,sample:f.sample([next])},f.page())).duplicate);
  const page = await f.request('list');
  assert.equal(page.runs.length,1);
  assert.equal(page.runs[0].association.status,'pending');
  assert.deepEqual(page.runs[0].preCalculationForm.OS,{al:'25.15'});
  assert.deepEqual(page.runs[0].observedForm.OS,{al:'25.15'});
  assert.equal(page.runs[0].groups[0].inputEcho.al,'25.12');
  assert.equal(page.runs[0].groups[0].rows[0].predictedRefraction,'0');
});

test('new calculations after a case switch remain unlinked, and user choices stay separate', async () => {
  const f = fixture();
  await f.request('watch',{enabled:true});
  const {nonce} = f.values['biometryResultWatch:7'];
  f.switchCase();
  await f.request('observed',{nonce,sample:f.sample([group])},f.page());
  const [run] = (await f.request('list')).runs;
  assert.equal(run.association.status,'unlinked');
  await assert.rejects(f.request('confirm-association',{id:run.id,caseToken:'case-1',revision:3}),{code:'RESULT_SELECTION'});
  const marked = await f.request('choices',{id:run.id,choices:[{groupIndex:0,rowIndex:0}]});
  assert.deepEqual(marked.choices,[{groupIndex:0,rowIndex:0}]);
  assert.equal(marked.groups[0].rows[0].siteSelected,undefined);
  await assert.rejects(f.request('choices',{id:run.id,choices:[{groupIndex:0,rowIndex:1}]}));

  await f.request('watch',{enabled:false});
  assert.equal((await f.request('status')).watching,false);
  await assert.rejects(f.request('observed',{nonce,sample:f.sample([group])},f.page()),{code:'RESULT_WATCH'});
  assert.equal(await f.request('remove',{id:run.id}),true);
  assert.equal((await f.request('list')).runs.length,0);
});

test('manual capture, confirmed links, and paged filtering preserve independent runs', async () => {
  const f = fixture();
  f.setGroups([group]);
  const first = (await f.request('capture')).run;
  const second = (await f.request('capture')).run;
  assert.notEqual(first.id,second.id);
  const updated = await f.request('confirm-association',{id:first.id,caseToken:'case-1',revision:3});
  assert.equal(updated.association.status,'confirmed');
  const page = await f.request('list',{filter:{eye:'OS',patientId:'p1'},pageSize:1});
  assert.equal(page.runs.length,1);
  assert.ok(page.cursor);
  assert.equal((await f.request('list',{cursor:page.cursor,filter:{eye:'OS',patientId:'p1'}})).runs.length,1);
  assert.equal((await f.request('list',{filter:{eye:'OD'}})).runs.length,0);
});

test('result data excludes URL identifiers and rejects mixed text cells', () => {
  const sanitized = normalizeResultGroups([{...group,eye:'OU',rows:[
    {iolPower:'label 22',predictedRefraction:'NaN'}, {iolPower:'20',predictedRefraction:'-0.5',lensModel:'=DANGEROUS'},
  ]}]);
  assert.equal(sanitized[0].eye,null);
  assert.equal(sanitized[0].rows.length,1);
  const run = createResultRun({sample:{groups:sanitized}, site: matchResultSite(results),
    pageUrl: results+'?sensitive=1#tab',trigger:'manual',id:'1',now:date,adapterVersion:'0.5.0'});
  assert.equal(run.pageUrl,results);
  assert.match(resultCsvHeader(),/predicted_refraction_D/);
  assert.match(resultCsvRows(run)[0],/'=DANGEROUS/);
  assert.match(resultCsvRows(run)[0],/,-0\.5,/);
});

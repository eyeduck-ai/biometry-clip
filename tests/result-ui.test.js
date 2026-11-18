import assert from 'node:assert/strict';
import test from 'node:test';
import {JSDOM} from 'jsdom';
import {resultHistoryMarkup, resultDetailMarkup} from '../src/result-ui.js';
import {messages, rules} from '../src/locales/en-results-ui.js';

function runFixture() {
  return {
    id: 'run-1', capturedAt: '2026-11-18T04:00:00.000Z', siteName: 'Synthetic calculator', siteId: 'synthetic',
    pageUrl: 'https://calc.apacrs.org/barrett_universal2105/', association: {status: 'pending', patientId: 'patient-1', measurementId: 'measurement-1'},
    groups: [{eye: 'OD', formula: 'Barrett Universal II', lensModel: 'Synthetic IOL', manufacturer: 'Synthetic maker', sourceLabel: 'Source output label', targetRefraction: '0.00',
      constants: [{name: 'A Constant', value: '119.00'}], inputEcho: {al: '21.00', target: '0'}, rows: [
        {iolPower: '20.00', predictedRefraction: '0.00', highlighted: true, siteSelected: true, rawCells: [{label: 'Optic', value: 'Biconvex'}]},
        {iolPower: '20.50', predictedRefraction: '-0.25'},
      ]}],
    choices: [{groupIndex: 0, rowIndex: 1}], preCalculationForm: {observedAt: '2026-11-18T03:59:00.000Z', OD: {al: '22.00'}},
    watchStartForm: {OD: {al: '23.00'}}, observedForm: {OD: {al: '24.00'}},
  };
}
const documentFor = markup => new JSDOM(markup).window.document;

test('history exposes all controls and keeps numeric details lazy', () => {
  const document = documentFor(resultHistoryMarkup({targets: [{id: 7, site: {name: 'Calculator'}, title: 'Tab title'}], targetId: 7, watch: {watching: true}, runs: [runFixture()], sites: [{id: 'synthetic', name: 'Calculator'}], patients: [{id: 'patient-1', patient: {patientId: 'CASE-1'}}], cursor: ['time', 'id'], isExtension: true}));
  for (const key of ['target', 'siteId', 'patientId', 'eye']) assert.ok(document.querySelector(`[data-result-control="${key}"]`), key);
  for (const action of ['watch', 'capture', 'refresh', 'more', 'export-json', 'export-csv', 'open']) assert.ok(document.querySelector(`[data-result-action="${action}"]`), action);
  assert.equal(document.querySelector('[data-result-action="watch"]').getAttribute('aria-pressed'), 'true');
  assert.equal(document.querySelector('[data-result-action="capture"]').disabled, false);
  assert.equal(document.querySelector('[data-result-action="open"]').dataset.resultId, 'run-1');
  assert.equal(document.querySelectorAll('table,[data-result-choice]').length, 0);
  assert.equal(document.querySelector('time').getAttribute('datetime'), '2026-11-18T04:00:00.000Z');
  assert.equal(document.querySelector('time').title, new Intl.DateTimeFormat().resolvedOptions().timeZone);
});

test('capture is unavailable in browser preview or without an exact target tab', () => {
  for (const state of [{isExtension: false, targetId: 7, targets: [{id: 7}]}, {isExtension: true, targetId: '', targets: [{id: 7}]}, {isExtension: true, targetId: 7, targets: [{id: 8}]}]) {
    const document = documentFor(resultHistoryMarkup(state));
    assert.equal(document.querySelector('[data-result-action="capture"]').disabled, true);
    assert.equal(document.querySelector('[data-result-action="watch"]').disabled, true);
  }
});

test('filters preserve selection and protect source option labels from translation', () => {
  const document = documentFor(resultHistoryMarkup({sites: [{id: 'site-1', name: 'SOURCE SITE'}], patients: [{id: 'patient-1', patient: {name: 'SOURCE PATIENT'}}], filter: {siteId: 'site-1', patientId: 'patient-1', eye: 'OS'}}));
  assert.equal(document.querySelector('[data-result-control="siteId"]').value, 'site-1');
  assert.equal(document.querySelector('[data-result-control="patientId"]').value, 'patient-1');
  assert.equal(document.querySelector('[data-result-control="eye"]').value, 'OS');
  assert.ok(document.querySelector('option[value="site-1"]').hasAttribute('data-i18n-skip'));
  assert.ok(document.querySelector('option[value="patient-1"]').hasAttribute('data-i18n-skip'));
});

test('history and details escape all source strings and identifiers', () => {
  const run = runFixture();
  run.id = '" onclick="alert(1)';
  run.siteName = '<img src=x onerror=alert(1)>';
  run.groups[0].formula = '<script>alert(1)</script>';
  run.groups[0].lensModel = '<svg onload=alert(1)>';
  run.groups[0].rows[0].rawCells = [{label: '<img src=x>', value: '<script>source</script>'}];
  for (const markup of [resultHistoryMarkup({runs: [run]}), resultDetailMarkup(run, {associationLabel: '<img src=x>', currentSelectionLabel: '<script>patient</script>'})]) {
    const document = documentFor(markup);
    assert.equal(document.querySelectorAll('script,img,[onclick],[onerror],[onload]').length, 0);
    assert.ok(document.body.textContent.includes('<script>'));
    assert.equal(document.querySelector('[data-result-id]').dataset.resultId, run.id);
  }
});

test('detail keeps site marks separate from the explicit user annotations', () => {
  const document = documentFor(resultDetailMarkup(runFixture(), {canLink: true}));
  const checkboxes = [...document.querySelectorAll('[data-result-choice]')];
  assert.equal(checkboxes.length, 2);
  assert.equal(checkboxes[0].checked, false);
  assert.equal(checkboxes[1].checked, true);
  assert.equal(checkboxes[1].dataset.groupIndex, '0');
  assert.equal(checkboxes[1].dataset.rowIndex, '1');
  assert.ok(document.querySelector('.result-site-marks').textContent.includes('網站已選'));
  assert.ok(document.querySelector('.result-site-marks').textContent.includes('網站醒目'));
  assert.equal(document.querySelectorAll('input:not([type="checkbox"]),textarea,select').length, 0);
  assert.equal(document.querySelector('[data-result-action="link"]').disabled, false);
  assert.equal(document.querySelector('[data-result-action="unlink"]').disabled, false);
  assert.ok(document.querySelector('[data-result-action="save-choices"]'));
  assert.ok(document.querySelector('[data-result-action="delete"]'));
  assert.ok(document.querySelector('[data-close]'));
});

test('zero, signed decimals, constants and original cells retain their displayed source precision', () => {
  const document = documentFor(resultDetailMarkup(runFixture()));
  const values = [...document.querySelectorAll('.result-number')].map(cell => cell.textContent);
  assert.deepEqual(values, ['20.00', '0.00', '20.50', '-0.25']);
  assert.ok(document.querySelector('.result-group-context').textContent.includes('119.00'));
  assert.ok(document.querySelector('.result-group-context').textContent.includes('0.00'));
  assert.ok(document.querySelector('.result-raw').textContent.includes('Biconvex'));
  assert.ok(document.querySelector('.result-table-scroll').hasAttribute('tabindex'));
});

test('echoed inputs, before-Calculate observation, watch-start form and capture form remain distinct', () => {
  const document = documentFor(resultDetailMarkup(runFixture()));
  assert.ok(document.querySelector('.result-echo').textContent.includes('21.00'));
  const snapshots = [...document.querySelectorAll('.result-form-snapshot')];
  assert.equal(snapshots.length, 3);
  assert.ok(snapshots[0].querySelector('summary').textContent.includes('Calculate'));
  assert.ok(snapshots[0].textContent.includes('22.00'));
  assert.ok(snapshots[0].querySelector('time'));
  assert.ok(snapshots[1].textContent.includes('23.00'));
  assert.ok(snapshots[2].textContent.includes('24.00'));
  assert.ok(snapshots.every(snapshot => snapshot.querySelector('.result-provenance-note')));
});

test('unsafe source URLs are displayed as text without creating clickable links', () => {
  const run = runFixture();
  for (const url of ['javascript:alert(1)', 'http://insecure.example/', 'https://user:secret@example.com/']) {
    run.pageUrl = url;
    const document = documentFor(resultDetailMarkup(run));
    assert.equal(document.querySelectorAll('a').length, 0);
    assert.ok(document.querySelector('.result-detail-source').textContent.includes(url));
  }
});

test('empty/loading lists disable exports and render an accessible status', () => {
  const document = documentFor(resultHistoryMarkup({loading: true}));
  assert.equal(document.querySelector('.result-list-region').getAttribute('aria-busy'), 'true');
  assert.equal(document.querySelector('[data-result-action="export-json"]').disabled, true);
  assert.equal(document.querySelector('[data-result-action="export-csv"]').disabled, true);
  assert.equal(document.querySelector('[data-result-action="more"]'), null);
  assert.ok(document.querySelector('.result-list-region [role="status"]'));
});

test('English result copy covers source distinction and indexed candidate labels', () => {
  for (const text of ['按下 Calculate 前觀察的表單', '結果區回顯的輸入', '開始監看時的表單', '擷取當時的表單', '網站已選', '我的標註']) assert.ok(messages[text], text);
  const [pattern, replacement] = rules[0];
  assert.equal('候選項目 3'.replace(pattern, replacement), 'Candidate 3');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBiometry, normalizeCandidates, mergeCandidatePages, itemsToText } from '../src/ocr/parser.js';
import { assertCloudConsent, recognizeGemini, recognizePaddleApi } from '../src/ocr/cloud.js';
import { documentOrigin, sandboxAssetBase, matchesParentOrigin } from '../src/ocr/origins.js';

test('keeps reversed bilateral table columns and K axes associated with the right eye', () => {
  const parsed = parseBiometry('Patient ID: DEMO\nOS OD\nAL 24.02 23.45\nACD 3.2 3.1\nK1 42.8 @ 80 43.2 @ 95\nK2 43.9 @ 170 44.4 @ 5');
  assert.equal(parsed.eyes.OD.al, '23.45');
  assert.equal(parsed.eyes.OS.al, '24.02');
  assert.equal(parsed.eyes.OD.k1Axis, '95');
  assert.equal(parsed.eyes.OS.k2Axis, '170');
  assert.equal(parsed.patient.patientId, 'DEMO');
});

test('never assigns measurements lacking explicit laterality', () => {
  const parsed = parseBiometry('AL 23.45\nACD 3.1\nLT 4.2\nK1 43.2 @ 90');
  assert.deepEqual(parsed.eyes, { OD: {}, OS: {} });
  assert.ok(parsed.warnings.length);
});

test('single eye sections preserve blanks and convert only explicit CCT mm', () => {
  const parsed = parseBiometry('OD\nAL 23,45 mm\nCCT 0.543 mm\nK1 43.20 @ 90°\nOS\nAL 24.10\nCCT 0.55\nLT unreadable');
  assert.equal(parsed.eyes.OD.al, '23.45');
  assert.equal(parsed.eyes.OD.cct, '543');
  assert.equal(parsed.eyes.OD.k1, '43.20');
  assert.equal(parsed.eyes.OD.k1Axis, '90');
  assert.equal(parsed.eyes.OS.cct, undefined);
  assert.equal(parsed.eyes.OS.lt, undefined);
  assert.equal(parsed.eyes.OD.k2Axis, undefined);
});

test('conflicting measurements remain blank even after a later repeated value', () => {
  const parsed = parseBiometry('OD\nAL 23.45\nAL 23.75\nAL 23.45');
  assert.equal(parsed.eyes.OD.al, undefined);
  const merged = mergeCandidatePages([
    { patient: { patientId: 'A' }, eyes: { OD: { al: '23.45' }, OS: {} } },
    { patient: { patientId: 'B' }, eyes: { OD: { al: '23.75' }, OS: {} } },
    { patient: { patientId: 'A' }, eyes: { OD: { al: '23.45' }, OS: {} } },
  ]);
  assert.equal(merged.patient.patientId, undefined);
  assert.equal(merged.eyes.OD.al, undefined);
});

test('does not treat incomplete bilateral rows as single eye measurements', () => {
  const parsed = parseBiometry('OD OS\nAL 23.4\nK1 43.1 44.2 43.3\nACD 3.2 3.5');
  assert.equal(parsed.eyes.OD.al, undefined);
  assert.equal(parsed.eyes.OS.k1, undefined);
  assert.equal(parsed.eyes.OD.acd, '3.2');
});

test('recognizes explicit Chinese field labels and measurements with a central table label', () => {
  const parsed = parseBiometry('OD OS\n23.45 AL 24.10\n3.20 ACD 3.40\n右眼\n角膜厚度：550\n前房深度：3.20');
  assert.equal(parsed.eyes.OD.al, '23.45');
  assert.equal(parsed.eyes.OS.al, '24.10');
  assert.equal(parsed.eyes.OD.cct, '550');
  assert.equal(parsed.eyes.OD.acd, '3.20');
});

test('a field conflicted inside one page cannot reappear from another page', () => {
  const merged = mergeCandidatePages([parseBiometry('OD\nAL 23.4\nAL 23.8'), parseBiometry('OD\nAL 23.4')]);
  assert.equal(merged.eyes.OD.al, undefined);
});

test('normalizes cloud candidates by a strict allowlist and preserves null as blank', () => {
  const parsed = normalizeCandidates({ patient: { patientId: 'A', secret: 'x' }, eyes: { OD: { al: 23.45, acd: null, k1: '43.2 D', cct: Infinity, injected: '<script>' }, OS: { k2Axis: '−3' } } });
  assert.deepEqual(parsed.patient, { patientId: 'A' });
  assert.deepEqual(parsed.eyes.OD, { al: '23.45' });
  assert.equal(parsed.eyes.OS.k2Axis, '-3'); // Domain validation is the panel's responsibility.
});

test('sorts OCR boxes by row then horizontal position', () => {
  const box = (text, x, y) => ({ text, poly: [[x, y], [x + 20, y], [x + 20, y + 12], [x, y + 12]] });
  const text = itemsToText([box('23.4', 60, 30), box('OS', 110, 10), box('OD', 60, 10), box('AL', 5, 30), box('24.1', 110, 31)]);
  assert.equal(text, 'OD\tOS\nAL\t23.4\t24.1');
});

test('rejects cloud processing before consent and never makes a request', async () => {
  assert.throws(() => assertCloudConsent({}), /確認/);
  await assert.rejects(recognizeGemini(new Blob(), {}), /確認/);
  await assert.rejects(recognizePaddleApi(new Blob(), {}), /確認/);
});

test('rejects insecure or credential-bearing custom endpoints before file reading', async () => {
  await assert.rejects(recognizePaddleApi(new Blob(), { cloudConsent: true, paddleApiUrl: 'http://example.com/ocr' }), /HTTPS/);
  await assert.rejects(recognizePaddleApi(new Blob(), { cloudConsent: true, paddleApiUrl: 'https://user:pass@example.com/ocr' }), /帳號密碼/);
});

test('handles opaque URL.origin for packaged extension assets without accepting another package', () => {
  const url = 'chrome-extension://abcdefghijklmnop/src/ocr/sandbox.html?channel=nonce';
  assert.equal(new URL(url).origin, 'null');
  assert.equal(documentOrigin(url), 'chrome-extension://abcdefghijklmnop');
  assert.equal(sandboxAssetBase(url), 'chrome-extension://abcdefghijklmnop/vendor-ocr/');
  assert.equal(sandboxAssetBase('http://127.0.0.1:41867/src/ocr/sandbox.html'), 'http://127.0.0.1:41867/vendor-ocr/');
  assert.equal(matchesParentOrigin('null', 'chrome-extension://abcdefghijklmnop'), true);
  assert.equal(matchesParentOrigin('https://untrusted.example', 'chrome-extension://abcdefghijklmnop'), false);
  assert.equal(matchesParentOrigin('null', 'http://127.0.0.1:41867'), false);
});

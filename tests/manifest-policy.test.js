import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { assertPackagedCodeCsp } from '../scripts/manifest-policy.mjs';

const manifest = JSON.parse(await readFile(new URL('../public/manifest.json', import.meta.url), 'utf8'));
const withPolicy = policy => ({ ...manifest, content_security_policy: { ...manifest.content_security_policy, extension_pages: policy } });

test('release manifest restricts executable code to packaged resources while retaining the isolated OCR sandbox', () => {
  assert.doesNotThrow(() => assertPackagedCodeCsp(manifest));
});

test('rejects the v0.3.0 blob worker CSP that Chrome refused at install time', () => {
  const policy = manifest.content_security_policy.extension_pages.replace("worker-src 'self'", "worker-src 'self' blob:");
  assert.throws(() => assertPackagedCodeCsp(withPolicy(policy)), /blob: in worker-src/);
});

test('worker restrictions include CSP fallbacks and script overrides instead of inspecting one literal string', () => {
  assert.throws(() => assertPackagedCodeCsp(withPolicy("script-src 'self'; object-src 'self'; child-src blob:;")), /blob: in worker-src/);
  assert.throws(() => assertPackagedCodeCsp(withPolicy("script-src 'self'; object-src 'self'; worker-src 'self'; script-src-elem https://example.com;")), /https:\/\/example.com in script-src-elem/);
  assert.doesNotThrow(() => assertPackagedCodeCsp(withPolicy("default-src 'self'; connect-src https:;")));
});

test('unsafe eval stays restricted to the separate sandbox policy', () => {
  assert.throws(() => assertPackagedCodeCsp(withPolicy("script-src 'self' 'unsafe-eval'; object-src 'self'; worker-src 'self';")), /unsafe-eval/);
  const unsafe = structuredClone(manifest);
  unsafe.content_security_policy.sandbox = 'sandbox allow-scripts allow-same-origin; script-src \'self\' \'unsafe-eval\';';
  assert.throws(() => assertPackagedCodeCsp(unsafe), /isolated origin/);
});

test('only the isolated OCR sandbox may fetch its embedded OpenCV WASM data URL',()=>{
  const sources=(policy,name)=>policy.split(';').map(part=>part.trim().split(/\s+/)).find(parts=>parts[0]===name)?.slice(1)||[];
  assert.ok(sources(manifest.content_security_policy.sandbox,'connect-src').includes('data:'));
  assert.ok(!sources(manifest.content_security_policy.extension_pages,'connect-src').includes('data:'));
  assert.deepEqual(sources(manifest.content_security_policy.extension_pages,'worker-src'),["'self'"]);
  assert.ok(!sources(manifest.content_security_policy.sandbox,'sandbox').includes('allow-same-origin'));
});

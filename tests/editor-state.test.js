import assert from 'node:assert/strict';
import test from 'node:test';
import { createEditor } from '../src/editor-state.js';
import { emptyCase } from '../src/model.js';

const clone = value => structuredClone(value);
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function snapshot(revision, patch = {}, caseToken = 'case-A') {
  const data = emptyCase();
  Object.assign(data.patient, patch.patient);
  for (const eye of ['OD', 'OS']) Object.assign(data.eyes[eye], patch.eyes?.[eye]);
  if (patch.activeEye) data.activeEye = patch.activeEye;
  return { data, revision, caseToken };
}
const tick = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

async function setup(t, initial = snapshot(0)) {
  let current = clone(initial), receiver;
  const patches = [], clears = [], changes = [], statuses = [], errors = [];
  const api = {
    subscribeCase(callback) { receiver = callback; return () => { receiver = null; }; },
    async loadData() { return clone(current); },
    patchCase(patch, token) {
      const pending = deferred();
      patches.push({ patch: clone(patch), token, ...pending });
      return pending.promise;
    },
    clearCase(token) {
      const pending = deferred();
      clears.push({ token, ...pending });
      return pending.promise;
    },
  };
  const editor = createEditor(api, {
    onChange: change => changes.push(change),
    onStatus: status => statuses.push(status),
    onError: error => errors.push(error),
  });
  t.after(() => editor.dispose());
  await editor.init();
  return { editor, patches, clears, changes, statuses, errors,
    push(record) { current = clone(record); receiver?.(clone(record)); },
    setServer(record) { current = clone(record); },
  };
}

test('initialization cannot replace a newer subscribed snapshot with an older load response', async t => {
  const loaded = deferred();
  let receiver;
  const editor = createEditor({
    subscribeCase(callback) { receiver = callback; return () => {}; },
    loadData: () => loaded.promise,
  });
  t.after(() => editor.dispose());
  const started = editor.init();
  receiver(snapshot(4, { eyes: { OS: { al: '25' } }, activeEye: 'OS' }));
  loaded.resolve(snapshot(1, { eyes: { OD: { al: '22' } } }));
  await started;
  assert.equal(editor.revision, 4);
  assert.equal(editor.data.eyes.OS.al, '25');
  assert.equal(editor.data.eyes.OD.al, undefined);
  assert.equal(editor.eye, 'OS');
});

test('pending local edits survive successive remote snapshots without dropping other fields', async t => {
  const h = await setup(t);
  h.editor.edit({ eyes: { OD: { al: '23.45' } } });
  h.push(snapshot(1, { eyes: { OS: { al: '24.10' } } }));
  h.push(snapshot(2, { eyes: { OS: { al: '24.10', cct: '551' } } }));
  assert.equal(h.editor.data.eyes.OD.al, '23.45');
  assert.deepEqual(h.editor.data.eyes.OS, { al: '24.10', cct: '551' });
  const saved = h.editor.flush();
  assert.deepEqual(h.patches[0].patch, { eyes: { OD: { al: '23.45' } } });
  h.patches[0].resolve(snapshot(3, { eyes: { OD: { al: '23.45' }, OS: { al: '24.10', cct: '551' } } }));
  await saved;
  assert.equal(h.editor.dirty, false);
});

test('queued keystrokes survive a previous save acknowledgment and form a distinct patch', async t => {
  const h = await setup(t);
  h.editor.edit({ eyes: { OD: { al: '23' } } });
  const saved = h.editor.flush();
  h.editor.edit({ eyes: { OD: { al: '23.45', k1: '43.2' } } });
  h.patches[0].resolve(snapshot(1, { eyes: { OD: { al: '23' } } }));
  await tick();
  assert.equal(h.patches.length, 2);
  assert.deepEqual(h.patches[1].patch, { eyes: { OD: { al: '23.45', k1: '43.2' } } });
  assert.equal(h.editor.data.eyes.OD.al, '23.45');
  assert.equal(h.editor.data.eyes.OD.k1, '43.2');
  h.patches[1].resolve(snapshot(2, { eyes: { OD: { al: '23.45', k1: '43.2' } } }));
  await saved;
  assert.equal(h.editor.revision, 2);
  assert.equal(h.editor.dirty, false);
});

test('a remote update during an in-flight save preserves both independent fields', async t => {
  const h = await setup(t);
  h.editor.edit({ eyes: { OD: { k1: '43.2' } } });
  const saved = h.editor.flush();
  h.push(snapshot(1, { eyes: { OS: { al: '24.10' } } }));
  assert.equal(h.editor.data.eyes.OD.k1, '43.2');
  assert.equal(h.editor.data.eyes.OS.al, '24.10');
  h.patches[0].resolve(snapshot(2, { eyes: { OD: { k1: '43.2' }, OS: { al: '24.10' } } }));
  await saved;
  assert.equal(h.editor.data.eyes.OD.k1, '43.2');
  assert.equal(h.editor.data.eyes.OS.al, '24.10');
});

test('an older acknowledgment cannot leave an in-flight value over a newer committed value', async t => {
  const h = await setup(t);
  h.editor.edit({ eyes: { OD: { al: '23' } } });
  const saved = h.editor.flush();
  // A later write from another panel commits before this request's response arrives.
  h.push(snapshot(2, { eyes: { OD: { al: '25' }, OS: { cct: '551' } } }));
  h.patches[0].resolve(snapshot(1, { eyes: { OD: { al: '23' } } }));
  await saved;
  assert.equal(h.editor.revision, 2);
  assert.equal(h.editor.data.eyes.OD.al, '25');
  assert.equal(h.editor.data.eyes.OS.cct, '551');
  assert.equal(h.editor.dirty, false);
});

test('remote clear cancels unsent old-case edits before they can be flushed', async t => {
  const h = await setup(t);
  h.editor.edit({ patient: { patientId: 'OLD' }, eyes: { OD: { al: '23' } } });
  h.push(snapshot(1, {}, 'case-B'));
  await h.editor.flush();
  assert.equal(h.patches.length, 0);
  assert.equal(h.editor.token, 'case-B');
  assert.equal(h.editor.data.patient.patientId, '');
  assert.deepEqual(h.editor.data.eyes.OD, {});
  assert.equal(h.editor.dirty, false);
  assert.ok(h.changes.some(change => change.changedCase));
});

test('an old in-flight response cannot resurrect values after a remote clear', async t => {
  const h = await setup(t);
  h.editor.edit({ eyes: { OD: { al: '23' } } });
  const saved = h.editor.flush();
  h.push(snapshot(2, {}, 'case-B'));
  h.patches[0].resolve(snapshot(1, { eyes: { OD: { al: '23' } } }));
  await saved;
  assert.equal(h.editor.token, 'case-B');
  assert.deepEqual(h.editor.data.eyes.OD, {});
});

test('an old-case conflict cannot discard a new edit already made after a remote clear', async t => {
  const h = await setup(t);
  h.editor.edit({ eyes: { OD: { al: '23' } } });
  const oldSave = h.editor.flush();
  h.push(snapshot(1, {}, 'case-B'));
  h.editor.edit({ eyes: { OS: { al: '24.10' } } });
  h.patches[0].reject(Object.assign(new Error('old case cleared'), { code: 'CASE_CHANGED' }));
  await assert.rejects(oldSave, /old case cleared/);
  assert.equal(h.editor.token, 'case-B');
  assert.equal(h.editor.data.eyes.OS.al, '24.10');
  assert.equal(h.editor.dirty, true);
  const saved = h.editor.flush();
  assert.equal(h.patches[1].token, 'case-B');
  h.patches[1].resolve(snapshot(2, { eyes: { OS: { al: '24.10' } } }, 'case-B'));
  await saved;
});

test('failed saves retain pending values and a successful retry clears its error state', async t => {
  const h = await setup(t);
  h.editor.edit({ eyes: { OD: { al: '23.45' } } });
  const failed = h.editor.flush();
  h.patches[0].reject(new Error('offline'));
  await assert.rejects(failed, /offline/);
  assert.equal(h.editor.dirty, true);
  assert.equal(h.editor.data.eyes.OD.al, '23.45');
  assert.equal(h.errors.length, 1);
  const retry = h.editor.flush();
  assert.deepEqual(h.patches[1].patch, { eyes: { OD: { al: '23.45' } } });
  h.patches[1].resolve(snapshot(1, { eyes: { OD: { al: '23.45' } } }));
  await retry;
  assert.equal(h.editor.dirty, false);
  assert.equal(h.statuses.at(-1).error, '');
});

test('eye choice stays local across remote edits and does not send a patient-data patch', async t => {
  const h = await setup(t);
  const before = h.editor.guard;
  h.editor.setEye('OS');
  assert.notEqual(h.editor.guard, before);
  h.push(snapshot(1, { eyes: { OD: { al: '23' } }, activeEye: 'OD' }));
  assert.equal(h.editor.eye, 'OS');
  assert.equal(h.editor.data.activeEye, 'OS');
  assert.equal(h.editor.data.eyes.OD.al, '23');
  assert.equal(h.patches.length, 0);
  h.editor.setEye('invalid');
  assert.equal(h.editor.eye, 'OS');
});

test('clear waits for pending writes before clearing the latest case', async t => {
  const h = await setup(t);
  h.editor.edit({ eyes: { OD: { al: '23.45' } } });
  const cleared = h.editor.clear();
  assert.equal(h.patches.length, 1);
  assert.equal(h.clears.length, 0);
  h.patches[0].resolve(snapshot(1, { eyes: { OD: { al: '23.45' } } }));
  await tick();
  assert.equal(h.clears.length, 1);
  assert.equal(h.clears[0].token, 'case-A');
  h.clears[0].resolve(snapshot(2, {}, 'case-B'));
  await cleared;
  assert.equal(h.editor.token, 'case-B');
  assert.deepEqual(h.editor.data.eyes.OD, {});
  assert.equal(h.editor.dirty, false);
});

test('a clear started for one case cannot erase a replacement case while waiting for a write', async t => {
  const h = await setup(t);
  h.editor.edit({ eyes: { OD: { al: '23' } } });
  const clearing = h.editor.clear();
  // Attach an outcome handler immediately, so an intentional conflict rejection
  // is observed before the assertions below inspect whether a clear was sent.
  const settled = clearing.then(() => ({ ok: true }), error => ({ error }));
  h.push(snapshot(2, { patient: { patientId: 'NEW' }, eyes: { OS: { al: '26' } } }, 'case-B'));
  h.patches[0].resolve(snapshot(1, { eyes: { OD: { al: '23' } } }));
  await tick();
  assert.equal(h.clears.length, 0, 'no clear may be sent with the replacement case token');
  const result = await settled;
  assert.ok(result.error, 'the caller must be told to review the new case');
  assert.equal(h.editor.token, 'case-B');
  assert.equal(h.editor.data.patient.patientId, 'NEW');
  assert.equal(h.editor.data.eyes.OS.al, '26');
});

test('exit flush posts the last keystroke immediately even while an earlier save is unresolved', async t => {
  const h = await setup(t);
  h.editor.edit({ eyes: { OD: { al: '23' } } });
  const earlier = h.editor.flush();
  h.editor.edit({ eyes: { OD: { al: '23.45' }, OS: { cct: '551' } } });
  const leaving = h.editor.flushOnExit();
  assert.equal(h.patches.length, 2, 'pagehide cannot wait for the first response before posting pending changes');
  assert.deepEqual(h.patches[1].patch, { eyes: { OD: { al: '23.45' }, OS: { cct: '551' } } });
  assert.equal(h.patches[1].token, 'case-A');
  // A visibility event and pagehide may both fire; neither should duplicate the batch.
  const leavingAgain = h.editor.flushOnExit();
  assert.equal(h.patches.length, 2);
  h.patches[0].resolve(snapshot(1, { eyes: { OD: { al: '23' } } }));
  h.patches[1].resolve(snapshot(2, { eyes: { OD: { al: '23.45' }, OS: { cct: '551' } } }));
  await Promise.all([earlier, leaving, leavingAgain]);
  assert.equal(h.editor.data.eyes.OD.al, '23.45');
  assert.equal(h.editor.data.eyes.OS.cct, '551');
  assert.equal(h.editor.revision, 2);
});

test('exit flush without another edit reuses an existing save instead of posting an empty patch', async t => {
  const h = await setup(t);
  h.editor.edit({ eyes: { OD: { al: '23.45' } } });
  const saving = h.editor.flush();
  const leaving = h.editor.flushOnExit();
  assert.equal(h.patches.length, 1);
  h.patches[0].resolve(snapshot(1, { eyes: { OD: { al: '23.45' } } }));
  await Promise.all([saving, leaving]);
  await h.editor.flushOnExit();
  assert.equal(h.patches.length, 1);
});

test('exit flush retains its original case token and cannot restore a cleared case', async t => {
  const h = await setup(t);
  h.editor.edit({ eyes: { OD: { al: '23.45' } } });
  const leaving = h.editor.flushOnExit();
  const settled = Promise.resolve(leaving).then(value => ({ value }), error => ({ error }));
  assert.equal(h.patches.length, 1);
  assert.equal(h.patches[0].token, 'case-A');
  h.push(snapshot(1, { patient: { patientId: 'NEW' } }, 'case-B'));
  h.patches[0].reject(Object.assign(new Error('case cleared'), { code: 'CASE_CHANGED' }));
  await settled;
  assert.equal(h.editor.token, 'case-B');
  assert.equal(h.editor.data.patient.patientId, 'NEW');
  assert.deepEqual(h.editor.data.eyes.OD, {});
  assert.equal(h.patches.length, 1);
});

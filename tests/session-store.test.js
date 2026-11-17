import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionStore, isTrustedPanelSender, SESSION_KEY } from '../src/session-store.js';
import { emptyCase } from '../src/model.js';

function fixture(initial = {}) {
  const values=structuredClone(initial);let tokens=0;let writes=0;let fail=false;
  const storage={get:async()=>structuredClone(values),set:async value=>{writes++;if(fail){fail=false;throw new Error('quota');}Object.assign(values,structuredClone(value));}};
  return {storage,values,get writes(){return writes;},failNext(){fail=true;},create:()=>createSessionStore(storage,{newToken:()=>`case-${++tokens}`})};
}
test('migrates a legacy session case once and recovers revision after worker restart', async()=>{
  const legacy=emptyCase();legacy.eyes.OS.al='24.10';const f=fixture({biometryCase:legacy});const store=f.create();
  const initial=await store.read();assert.equal(initial.data.eyes.OS.al,'24.10');assert.equal(initial.revision,0);
  const updated=await store.patch({eyes:{OD:{al:'23.45'}}},initial.caseToken,'panel-a');
  const recovered=await f.create().read();assert.deepEqual(recovered,updated);assert.equal(f.writes,2);
});
test('concurrent panels patch distinct fields without losing either eye or identifiers', async()=>{
  const f=fixture();const store=f.create();const initial=await store.read();
  await Promise.all([
    store.patch({eyes:{OD:{al:'23.45',target:'0'}}},initial.caseToken,'right-panel'),
    store.patch({eyes:{OS:{al:'24.10',toric:true}},patient:{patientId:'TEST'}},initial.caseToken,'left-panel'),
  ]);
  const current=await store.read();assert.equal(current.revision,2);assert.equal(current.data.eyes.OD.al,'23.45');assert.equal(current.data.eyes.OD.target,'0');assert.equal(current.data.eyes.OS.al,'24.10');assert.equal(current.data.eyes.OS.toric,true);assert.equal(current.data.patient.patientId,'TEST');
  assert.deepEqual(f.values.biometryCase,current.data);
});
test('a queued patch from before clear cannot revive the old case', async()=>{
  const store=fixture().create();const initial=await store.read();
  await store.patch({patient:{patientId:'OLD'},eyes:{OD:{al:'23'}}},initial.caseToken);
  const clearedPromise=store.clear(initial.caseToken);
  const latePatch=store.patch({eyes:{OS:{al:'25'}}},initial.caseToken);
  await assert.rejects(latePatch,{code:'CASE_CHANGED'});
  const cleared=await clearedPromise;assert.notEqual(cleared.caseToken,initial.caseToken);assert.deepEqual(cleared.data,emptyCase());
  assert.deepEqual((await store.read()).data,emptyCase());
});
test('a whole-case replacement requires exact revision and creates a new generation', async()=>{
  const store=fixture().create();const initial=await store.read();await store.patch({eyes:{OD:{al:'23'}}},initial.caseToken);
  await assert.rejects(store.replace(emptyCase(),initial.caseToken,initial.revision),{code:'REVISION_CHANGED'});
  const current=await store.read();const replacement=emptyCase();replacement.eyes.OS.al='26';
  const replaced=await store.replace(replacement,current.caseToken,current.revision,'import');assert.notEqual(replaced.caseToken,current.caseToken);assert.equal(replaced.data.eyes.OD.al,undefined);assert.equal(replaced.data.eyes.OS.al,'26');
  await assert.rejects(store.patch({eyes:{OD:{al:'30'}}},current.caseToken),{code:'CASE_CHANGED'});
});
test('a failed storage write leaves the committed record intact and queue usable', async()=>{
  const f=fixture();const store=f.create();const initial=await store.read();f.failNext();
  await assert.rejects(store.patch({eyes:{OD:{al:'23'}}},initial.caseToken),/quota/);
  assert.deepEqual(await store.read(),initial);
  const saved=await store.patch({eyes:{OS:{al:'24'}}},initial.caseToken);assert.equal(saved.revision,1);assert.equal(saved.data.eyes.OS.al,'24');assert.equal(saved.data.eyes.OD.al,undefined);
});
test('patch allowlist ignores prototype keys, objects and unknown fields while retaining zero and blanks', async()=>{
  const store=fixture().create();const initial=await store.read();
  const patch=JSON.parse('{"patient":{"patientId":0,"unknown":"discard"},"eyes":{"OD":{"al":24,"target":"","toric":false,"unknown":"discard","k1":{"value":43},"__proto__":{"polluted":true}},"OU":{"al":26}},"activeEye":"OS"}');
  const saved=await store.patch(patch,initial.caseToken);assert.equal(saved.data.patient.patientId,'0');assert.deepEqual(saved.data.eyes.OD,{al:'24',target:'',toric:false});assert.deepEqual(saved.data.eyes.OS,{});assert.equal(saved.data.activeEye,'OS');assert.equal({}.polluted,undefined);
});
test('returned records are detached snapshots rather than mutable shared state', async()=>{
  const store=fixture().create();const first=await store.read();first.data.eyes.OD.al='999';assert.equal((await store.read()).data.eyes.OD.al,undefined);
  const updated=await store.patch({eyes:{OD:{al:'24'}}},first.caseToken);updated.data.eyes.OD.al='888';assert.equal((await store.read()).data.eyes.OD.al,'24');
});
test('invalid legacy data starts an empty case and unknown tokens cannot mutate it', async()=>{
  const store=fixture({[SESSION_KEY]:{data:{},caseToken:'bad',revision:3},biometryCase:{bad:true}}).create();const current=await store.read();assert.deepEqual(current.data,emptyCase());assert.equal(current.revision,0);
  await assert.rejects(store.patch({eyes:{OD:{al:'24'}}},undefined),{code:'CASE_CHANGED'});
});
test('only the packaged panel URL can send session operations, including its floating frame URL',()=>{
  const id='abcdefghijklmnopabcdefghijklmnop';const sender=url=>({id,url});
  assert.equal(isTrustedPanelSender(sender(`chrome-extension://${id}/index.html?view=floating&tabId=42`),id),true);
  for(const url of ['https://calc.apacrs.org/barrett_universal2105/',`chrome-extension://${id}.attacker/index.html`,`chrome-extension://${id}/src/ocr/sandbox.html`,`chrome-extension://${id}/index.html-copy`,'about:blank'])assert.equal(isTrustedPanelSender(sender(url),id),false);
  assert.equal(isTrustedPanelSender({id:'another',url:`chrome-extension://${id}/index.html`},id),false);
});


test('Keratoconus boolean edits persist across panels and restart without becoming LVC',async()=>{
  const f=fixture(),store=f.create(),initial=await store.read();
  await store.patch({eyes:{OD:{keratoconus:true,lvcType:'none'},OS:{keratoconus:false,lvcType:'myopic'}}},initial.caseToken,'panel-a');
  const recovered=await f.create().read();assert.equal(recovered.data.eyes.OD.keratoconus,true);assert.equal(recovered.data.eyes.OS.keratoconus,false);assert.equal(recovered.data.eyes.OD.lvcType,'none');assert.equal(recovered.data.eyes.OS.lvcType,'myopic');
  const cleared=await store.patch({eyes:{OD:{keratoconus:false}}},initial.caseToken,'panel-b');assert.equal(cleared.data.eyes.OD.keratoconus,false);
  const invalid=await store.patch({eyes:{OD:{keratoconus:'true'}}},initial.caseToken,'panel-c');assert.equal(invalid.data.eyes.OD.keratoconus,false);
});

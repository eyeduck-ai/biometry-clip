import {matchResultSite} from './result-sites.js';
import {matchSite} from './sites.js';
import {siteBridge} from './bridge.js';
import {emptyCase} from './model.js';
import {cleanResultInputs, normalizeResultGroups} from './result-model.js';
import {readApacrsResults} from './result-adapters/apacrs.js';
import {readEscrsDgsResults} from './result-adapters/escrs-dgs.js';
import {readOtherResults} from './result-adapters/other.js';

const wirePrefix = 'biometry:result-probe:';

function formInputs(profile, groups) {
  const result = {OD: {}, OS: {}};
  const calculator = matchSite(location.href);
  if (calculator?.id !== profile.id) return result;
  const data = emptyCase();
  const known = new Set(groups.map(group => group.eye).filter(Boolean));
  let eye = profile.eyeMode === 'both' ? 'OU' : known.size === 1 ? [...known][0] : 'OD';
  let reading = siteBridge('read', profile, data, {eye, includeIdentifiers: false});
  if (reading.error && ['OD', 'OS'].includes(reading.detectedEye) && (known.size === 0 || known.has(reading.detectedEye))) {
    eye = reading.detectedEye;
    reading = siteBridge('read', profile, data, {eye, includeIdentifiers: false});
  }
  if (reading.error) return result;
  for (const row of reading.rows) {
    if (row.status !== 'read' || row.value == null || row.value === '' || row.key.startsWith('patient.')) continue;
    const destinations = row.eye === 'shared' && eye === 'OU' ? ['OD', 'OS'] :
      ['OD', 'OS'].includes(row.eye) ? [row.eye] : [];
    for (const destination of destinations) result[destination][row.key] = row.value;
  }
  return {OD: cleanResultInputs(result.OD), OS: cleanResultInputs(result.OS)};
}

function readGroups() {
  const profile = matchResultSite(location.href);
  if (!profile) return {profile, groups: []};
  const reader = profile.host === 'calc.apacrs.org' ? readApacrsResults :
    profile.id === 'escrs' || profile.id.startsWith('solver-') ? readEscrsDgsResults : readOtherResults;
  return {profile, groups: normalizeResultGroups(reader(document, profile))};
}

function readSample() {
  const {profile, groups} = readGroups();
  return {
    url: location.href,
    siteId: profile?.id,
    groups,
    observedForm: profile ? formInputs(profile, groups) : {OD: {}, OS: {}},
  };
}

function installProbe() {
  let active, observer, timer, baseline, scanning = false, lastInputSignature = '';
  function stop() {
    active = undefined;
    observer?.disconnect();
    clearTimeout(timer);
    timer = undefined;
    lastInputSignature = '';
  }
  async function scan() {
    timer = undefined;
    if (!active) return;
    if (scanning) {schedule(); return;}
    const watch = active;
    scanning = true;
    try {
      const {profile, groups} = readGroups();
      if (profile?.id !== watch.siteId || !groups.length) return;
      const fingerprint = JSON.stringify(groups);
      if (fingerprint === baseline) return;
      const response = await chrome.runtime.sendMessage({
        type: 'biometry:results:observed',
        nonce: watch.nonce,
        sample: {url: location.href, siteId: profile.id, groups, observedForm: formInputs(profile, groups)},
      });
      if (active === watch && response?.ok) baseline = fingerprint;
    } catch { /* DOM changes during a read are retried on the next result mutation. */ }
    finally { scanning = false; }
  }
  function schedule() {
    if (!timer) timer = setTimeout(scan, 450);
  }
  function start(message) {
    const sample = readSample();
    if (sample.siteId !== message.siteId) return {ok: false};
    stop();
    active = {nonce: message.nonce, siteId: message.siteId};
    baseline = message.captureExisting ? '' : JSON.stringify(sample.groups);
    observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['class', 'hidden', 'style', 'aria-hidden']});
    if (message.captureExisting) schedule();
    return {ok: true, sample};
  }
  function beforeCalculation(event) {
    if (!active || !event.isTrusted) return;
    if (event.type === 'click') {
      const control = event.target.closest?.('button,input[type=button],input[type=submit],[role=button]');
      const label = (control?.getAttribute('aria-label') || control?.value || control?.textContent || '').trim();
      if (!/^(?:calculate(?:\s+(?:iol(?:\s+power)?|toric))?|continue)$/i.test(label)) return;
    }
    const profile = matchSite(location.href);
    if (profile?.id !== active.siteId) return;
    const observedForm = formInputs(profile, []);
    if (!Object.values(observedForm).some(fields => Object.keys(fields).length)) return;
    const sampleSignature = JSON.stringify(observedForm);
    if (event.type === 'submit' && sampleSignature === lastInputSignature) return;
    lastInputSignature = sampleSignature;
    chrome.runtime.sendMessage({
      type: 'biometry:results:form-before',
      nonce: active.nonce,
      sample: {url: location.href, siteId: profile.id, observedForm},
    }).catch(() => {});
  }
  document.addEventListener('click', beforeCalculation, true);
  document.addEventListener('submit', beforeCalculation, true);
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || !message?.type?.startsWith(wirePrefix)) return;
    try {
      const action = message.type.slice(wirePrefix.length);
      if (action === 'read') respond({ok: true, sample: readSample()});
      if (action === 'watch') respond(start(message));
      if (action === 'stop') {stop(); respond({ok: true});}
    } catch {
      respond({ok: false});
    }
  });
}

if (!globalThis.__biometryResultProbe) {
  globalThis.__biometryResultProbe = true;
  installProbe();
}

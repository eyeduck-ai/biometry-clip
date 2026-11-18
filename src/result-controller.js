import {resultCsvHeader, resultCsvRows, resultExportMetadata} from './result-model.js';
import {resultHistoryMarkup, resultDetailMarkup} from './result-ui.js';
import {resultRequest, resultTabs, subscribeResults, resultExtension} from './result-platform.js';

function download(parts, filename, type) {
  const url = URL.createObjectURL(new Blob(parts, {type}));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export function createResultController({
  sites, hostTabId, preferredTab, patients, currentSelection, sessionGuard,
  isVisible, hasDialog, redraw, showDialog, closeDialog, toast, flush,
}) {
  const state = {targets: [], targetId: hostTabId ? String(hostTabId) : '', watch: {}, runs: [], filter: {}, cursor: null, loading: false};
  let generation = 0, refreshTimer, detailId;
  const active = () => isVisible() && !hasDialog();
  function repaint() {
    if (!active()) return;
    const focusedId = document.activeElement?.id;
    redraw();
    if (focusedId) document.getElementById(focusedId)?.focus({preventScroll:true});
  }

  async function refresh({more = false} = {}) {
    if (!isVisible()) return;
    const epoch = ++generation;
    state.loading = true;
    repaint();
    try {
      const targets = await resultTabs();
      if (epoch !== generation) return;
      state.targets = hostTabId != null ? targets.filter(tab => tab.id === hostTabId) : targets;
      const ids = state.targets.map(tab => String(tab.id));
      if (!ids.includes(state.targetId)) {
        const preferred = String(preferredTab() ?? '');
        state.targetId = ids.includes(preferred) ? preferred : String(state.targets.find(tab => tab.active)?.id ?? ids[0] ?? '');
      }
      const id = state.targetId;
      const [watch, page] = await Promise.all([
        id ? resultRequest('status', {tabId: Number(id)}).catch(() => ({})) : {},
        resultRequest('list', {cursor: more ? state.cursor : null, filter: state.filter}),
      ]);
      if (epoch !== generation) return;
      state.watch = watch;
      state.runs = more ? [...state.runs, ...page.runs] : page.runs;
      state.cursor = page.cursor;
    } catch (error) {
      if (epoch === generation) toast(error.message, true);
    } finally {
      if (epoch === generation) {state.loading = false; repaint();}
    }
  }
  function scheduleRefresh() {
    if (!active()) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {if (active()) refresh();}, 180);
  }
  function associationLabel({patientId, measurementId}) {
    const patient = patients().find(item => item.id === patientId);
    if (!patient) return '';
    const name = patient.patient.name || patient.patient.patientId || patient.patient.initials;
    const measurement = patient.measurements.find(item => item.id === measurementId);
    return [name, measurement?.label].filter(Boolean).join(' · ');
  }
  function open(run) {
    const selection = currentSelection();
    detailId = run.id;
    showDialog('計算紀錄', resultDetailMarkup(run, {
      associationLabel: associationLabel(run.association),
      currentSelectionLabel: selection ? associationLabel(selection) : '',
      canLink: Boolean(selection?.patientId),
    }));
  }
  async function exportResults(format) {
    const parts = format === 'csv' ? ['\uFEFF', resultCsvHeader()] : [
      JSON.stringify(resultExportMetadata()).slice(0, -1), ',"runs":[',
    ];
    const filter = {...state.filter};
    let cursor = null, count = 0;
    do {
      const page = await resultRequest('list', {cursor, pageSize: 40, filter});
      for (const run of page.runs) {
        if (format === 'csv') parts.push(...resultCsvRows(run));
        else parts.push(count ? ',' : '', JSON.stringify(run));
        count++;
      }
      cursor = page.cursor;
    } while (cursor);
    if (!count) {toast('沒有符合篩選的計算紀錄。', true); return;}
    if (format === 'json') parts.push(']}');
    download(parts, `biometry-calculations-${new Date().toISOString().slice(0, 10)}.${format}`,
      format === 'json' ? 'application/json' : 'text/csv;charset=utf-8');
    toast('已匯出計算紀錄。');
  }
  async function action(button) {
    const key = button.dataset.resultAction;
    if (key === 'open') {
      const run = state.runs.find(item => item.id === button.dataset.resultId);
      if (run) open(run);
      return;
    }
    if (key === 'refresh' || key === 'more') return refresh({more: key === 'more'});
    if (key === 'export-json' || key === 'export-csv') return exportResults(key.slice(7));
    if (key === 'capture' || key === 'watch') {
      const tabId = Number(state.targetId);
      if (!state.targetId) throw new Error('請選擇支援的計算網站分頁。');
      await flush();
      if (key === 'watch') {
        state.watch = await resultRequest('watch', {tabId, enabled: !state.watch.watching});
        repaint();
        return;
      }
      const outcome = await resultRequest('capture', {tabId});
      if (!outcome.saved) {
        toast(outcome.duplicate ? '此頁的相同結果已保存。' : '尚未辨識到計算結果，請確認網站已完成計算。', !outcome.duplicate);
        return;
      }
      await refresh();
      open(outcome.run);
      return;
    }
    const id = detailId;
    if (!id) return;
    if (key === 'delete') {
      showDialog('刪除計算紀錄', '<p>要刪除這次擷取的計算紀錄嗎？</p><div class="dialog-actions"><button class="button" data-close>取消</button><button class="button danger" data-result-action="confirm-delete">刪除</button></div>');
      return;
    }
    if (key === 'confirm-delete') {
      await resultRequest('remove', {id});
      closeDialog();
      await refresh();
      return;
    }
    if (key === 'save-choices') {
      const choices = [...document.querySelectorAll('#review-dialog [data-result-choice]:checked')].map(input => ({
        groupIndex: Number(input.dataset.groupIndex), rowIndex: Number(input.dataset.rowIndex),
      }));
      open(await resultRequest('choices', {id, choices}));
      toast('已儲存選擇紀錄。');
      return;
    }
    if (key === 'link') {
      await flush();
      open(await resultRequest('confirm-association', {id, ...sessionGuard()}));
      return;
    }
    if (key === 'unlink') open(await resultRequest('unlink', {id}));
  }
  function handleClick(event) {
    const button = event.target.closest?.('[data-result-action]');
    if (!button || button.disabled) return false;
    button.disabled = true;
    action(button).catch(error => toast(error.message, true)).finally(() => {if (button.isConnected) button.disabled = false;});
    return true;
  }
  function handleChange(event) {
    const key = event.target.dataset.resultControl;
    if (!key) return;
    const value = event.target.value;
    if (key === 'target') state.targetId = value;
    else state.filter = {...state.filter, [key]: value};
    refresh();
  }
  const disposeListener = subscribeResults(scheduleRefresh);
  return {
    markup() { return resultHistoryMarkup({...state, sites, patients: patients(), isExtension: resultExtension}); },
    refresh, scheduleRefresh, handleChange, handleClick,
    dispose() {disposeListener(); clearTimeout(refreshTimer);},
  };
}

export function resultText(value) {
  const text = typeof value === 'string' ? value : value?.textContent;
  return (text || '').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Read a standalone numeric cell. Never take a number embedded in a label. */
export function resultNumber(value) {
  const text = resultText(value).replace(/[−–]/g, '-');
  const match = text.match(/^([+-]?(?:\d+(?:[.,]\d+)?|\.\d+))\s*(?:D|dpt|deg|°)?$/i);
  if (!match) return undefined;
  const number = match[1].replace(',', '.');
  return Number.isFinite(Number(number)) ? number : undefined;
}

export function isResultVisible(element) {
  if (!element?.isConnected) return false;
  const view = element.ownerDocument.defaultView;
  for (let current = element; current; current = current.parentElement) {
    // Form named properties can shadow .hidden (e.g. Kane's input[name=hidden]).
    if (current.hasAttribute('hidden') || current.getAttribute('aria-hidden') === 'true') return false;
    const style = view?.getComputedStyle?.(current);
    if (style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse') return false;
  }
  return true;
}

function headerKey(value) {
  return resultText(value).toLowerCase().replace(/\s*(?:\(d\)|\[d\]|\(deg\)|\(°\))\s*$/i, '').replace(/\s+/g, ' ');
}

/**
 * Table structure must establish the columns before any row is read. Exact
 * aliases and table scope are supplied by each site adapter.
 */
export function readResultTable(table, {aliases, require = ['iolPower', 'predictedRefraction'], rowMarkers, ...context}) {
  if (table?.tagName !== 'TABLE' || !isResultVisible(table)) return undefined;
  const indexes = new Map(Object.entries(aliases || {}).flatMap(([key, labels]) =>
    labels.map(label => [headerKey(label), key])));
  const tableRows = [...table.rows].slice(0, 305);
  let headers, keys, start;
  for (const [index, row] of tableRows.entries()) {
    const cells = [...row.cells];
    if (!isResultVisible(row) || cells.some(cell => cell.colSpan !== 1 || cell.rowSpan !== 1)) continue;
    const candidateHeaders = cells.map(resultText);
    const candidateKeys = candidateHeaders.map(label => indexes.get(headerKey(label)));
    if (!require.every(key => candidateKeys.filter(item => item === key).length === 1)) continue;
    headers = candidateHeaders;
    keys = candidateKeys.map(key => candidateKeys.indexOf(key) === candidateKeys.lastIndexOf(key) ? key : undefined);
    start = index + 1;
    break;
  }
  if (!headers) return undefined;
  const rows = [];
  for (const row of tableRows.slice(start)) {
    if (!isResultVisible(row)) continue;
    const cells = [...row.cells];
    if (cells.length !== keys.length || cells.some(cell => cell.colSpan !== 1 || cell.rowSpan !== 1 ||
        cell.querySelector('input,select,textarea,table'))) continue;
    const values = {}, rawCells = [];
    for (const [index, key] of keys.entries()) {
      if (!key || !isResultVisible(cells[index])) continue;
      const text = resultText(cells[index]);
      if (!text) continue;
      const value = key === 'lensModel' ? text : resultNumber(text);
      if (value !== undefined) values[key] = value;
      rawCells.push({label: headers[index], value: text});
    }
    if (!require.every(key => values[key] !== undefined)) continue;
    rows.push({...values, ...rowMarkers?.(row), rawCells});
  }
  if (!rows.length) return undefined;
  return {...context, rows};
}

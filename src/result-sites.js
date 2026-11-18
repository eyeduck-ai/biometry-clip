import {matchSite, SITES} from './sites.js';

const dgsResults = new Map([
  ['/result_regular', 'solver-regular'], ['/result_complex', 'solver-complex'],
  ['/result_second', 'solver-second'], ['/result_toric', 'solver-toric'],
]);

/** Calculator matching stays unchanged. These aliases only permit read-only capture. */
export function matchResultSite(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return undefined;
    const calculator = matchSite(url.href);
    if (calculator) return calculator;
    const path = url.pathname.toLowerCase().replace(/\/$/, '');
    const id = url.hostname === 'iolsolver.com' ? dgsResults.get(path) :
      ['cookeformula.com', 'www.cookeformula.com'].includes(url.hostname) && path === '/printpreview' ? 'cooke' : undefined;
    return SITES.find(site => site.id === id);
  } catch { return undefined; }
}

export function sameResultPage(left, right) {
  try {
    const a = new URL(left), b = new URL(right);
    return a.origin === b.origin && a.pathname === b.pathname && a.search === b.search;
  } catch { return false; }
}

/** MessageSender.url can retain the original URL of a same-document router. */
export function sameResultSiteOrigin(left, right) {
  try {
    const a = new URL(left), b = new URL(right);
    // A DGS document can also move from Regular to Toric after the user
    // selects a power. The active watch, nonce and current mode are checked
    // separately against the actual tab URL.
    return Boolean(matchResultSite(a.href) && matchResultSite(b.href) && a.origin === b.origin);
  } catch { return false; }
}

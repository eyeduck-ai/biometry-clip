import { APACRS_SITES } from './adapters/apacrs.js';
import { OTHER_SITES } from './adapters/other-sites.js';
import { TECNIS_SITES } from './adapters/tecnis.js';
export const SITES = [...APACRS_SITES,...OTHER_SITES,...TECNIS_SITES];
export const CATEGORIES = { all:'所有公式',regular:'一般 IOL',toric:'Toric',lvc:'LVC / 特殊眼',second:'術後 / 第二眼' };
export function matchSite(url) {
  try {
    const current = new URL(url);
    if (current.protocol !== 'https:') return undefined;
    const path = decodeURIComponent(current.pathname).toLowerCase();
    return [...SITES].sort((a,b) => b.path.length - a.path.length).find(site => {
      const expected = decodeURIComponent(site.path).toLowerCase();
      const rootMatch = expected === '/' && path === '/';
      return (current.hostname === site.host || site.allowedHosts?.includes(current.hostname)) && (rootMatch || path === expected || (expected.endsWith('/') && expected !== '/' && path.startsWith(expected)));
    });
  } catch { return undefined; }
}

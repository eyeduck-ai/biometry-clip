import { SITES } from './sites.js';

// A URL can serve several modes. These groups describe where to start;
// selecting a group never switches clinical modes on the destination website.
export const FORMULA_GROUPS = [
  {
    id: 'general',
    title: '一般白內障',
    description: '一般 IOL 度數計算與多公式比較。',
    siteIds: ['escrs', 'barrett-universal', 'cooke', 'solver-regular', 'kane', 'evo'],
  },
  {
    id: 'toric',
    title: 'Toric 散光矯正',
    description: '需要角膜軸向、SIA 與切口資訊；部分網站須先切換模式或完成球面計算。',
    siteIds: ['barrett-toric', 'barrett-true-k-toric', 'evo-toric', 'solver-toric', 'tecnis-toric', 'escrs', 'kane'],
  },
  {
    id: 'post-lvc',
    title: '屈光手術後 · LVC / RK',
    description: 'LASIK／PRK／RK 等病史入口；先在原網站選擇對應手術模式。',
    siteIds: ['barrett-true-k', 'barrett-true-k-toric', 'solver-complex', 'cooke', 'escrs', 'evo'],
  },
  {
    id: 'special-cornea',
    title: '特殊角膜／Keratoconus',
    description: '提供特殊角膜選項的入口；不同病況與量測方式仍需在原網站確認。',
    siteIds: ['solver-complex', 'kane', 'escrs', 'barrett-true-k', 'barrett-true-k-toric'],
  },
  {
    id: 'postop',
    title: '術後分析／IOL 換片',
    description: '使用已植入 IOL、術後屈光度及術前／術後量測。',
    siteIds: ['barrett-rx'],
  },
  {
    id: 'second-eye',
    title: '第二眼調整',
    description: '使用已手術對側眼資訊，規劃目前眼的計算。',
    siteIds: ['solver-second'],
  },
];

export const SITE_PURPOSES = {
  escrs: '多公式比較；Toric、LVC 與特殊角膜選項於原站切換。',
  'barrett-universal': 'Barrett 一般 IOL 度數計算，支援雙眼資料。',
  'barrett-true-k': '屈光手術後與特殊角膜；LASIK／RK 等病史分別選擇。',
  'barrett-toric': 'Barrett Toric；先核對目前眼別、軸向、SIA 與切口。',
  'barrett-true-k-toric': 'True-K 與 Toric；先在原站選手術病史及目前眼別。',
  'barrett-rx': '術後屈光分析、IOL 換片或 piggyback 規劃入口。',
  cooke: 'Cooke K6；可在原站切換一般、近視／遠視 LVC 或 RK。',
  'solver-regular': 'PEARL-DGS 一般 IOL 度數計算，支援雙眼資料。',
  kane: 'Kane 一般、Toric 與 Keratoconus；模式於原站切換。',
  evo: 'EVO 一般 IOL；可在原站選 LASIK／PRK／RK 與後角膜模式。',
  'evo-toric': 'EVO Toric；支援 LVC／RK 與後角膜量測選項。',
  'solver-complex': 'LVC／RK、非生理角膜與 ICL 等特殊情況入口。',
  'solver-second': '第二眼計算；目前眼與已手術對側眼資料分開。',
  'solver-toric': '先完成球面計算並選 IOL power，之後開啟 Toric 表單。',
  'tecnis-toric': 'TECNIS Toric；前角膜 K、SIA、切口與獨立的 Planned SE IOL Power。',
};

export function getSiteGroups(siteOrId) {
  const id = typeof siteOrId === 'string' ? siteOrId : siteOrId?.id;
  return FORMULA_GROUPS.filter(group => group.siteIds.includes(id));
}

export function getGroupSites(groupOrId) {
  const group = typeof groupOrId === 'string'
    ? FORMULA_GROUPS.find(item => item.id === groupOrId)
    : groupOrId;
  return (group?.siteIds ?? []).map(id => SITES.find(site => site.id === id)).filter(Boolean);
}

export function getUniqueSiteCount() {
  return new Set(FORMULA_GROUPS.flatMap(group => group.siteIds)).size;
}

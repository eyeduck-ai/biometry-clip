import assert from 'node:assert/strict';
import test from 'node:test';
import { SITES } from '../src/sites.js';
import { FORMULA_GROUPS, SITE_PURPOSES, getGroupSites, getSiteGroups, getUniqueSiteCount } from '../src/catalog.js';

test('purpose catalog covers every supported URL and counts overlaps only once', () => {
  const supported = SITES.map(site => site.id).sort();
  const classified = [...new Set(FORMULA_GROUPS.flatMap(group => group.siteIds))].sort();
  assert.deepEqual(classified, supported);
  assert.equal(getUniqueSiteCount(), SITES.length);
  assert.equal(new Set(FORMULA_GROUPS.map(group => group.id)).size, FORMULA_GROUPS.length);
  for (const group of FORMULA_GROUPS) {
    assert.equal(new Set(group.siteIds).size, group.siteIds.length);
    assert.equal(getGroupSites(group).length, group.siteIds.length);
  }
});

test('Kane special-cornea and Toric options do not imply LVC support', () => {
  assert.ok(getSiteGroups('kane').some(group => group.id === 'special-cornea'));
  assert.ok(getSiteGroups('kane').some(group => group.id === 'toric'));
  assert.ok(!getSiteGroups('kane').some(group => group.id === 'post-lvc'));
});

test('postoperative exchange and second-eye adjustment have distinct entry groups', () => {
  assert.deepEqual(getGroupSites('postop').map(site => site.id), ['barrett-rx']);
  assert.deepEqual(getGroupSites('second-eye').map(site => site.id), ['solver-second']);
  assert.ok(!getSiteGroups('solver-second').some(group => group.id === 'postop'));
});

test('launcher metadata retains prerequisites and accepts site objects or ids', () => {
  assert.match(SITE_PURPOSES['solver-toric'], /先完成球面計算/);
  assert.match(SITE_PURPOSES.escrs, /原站切換/);
  for (const site of SITES) {
    assert.equal(typeof SITE_PURPOSES[site.id], 'string');
    assert.deepEqual(getSiteGroups(site), getSiteGroups(site.id));
  }
  assert.deepEqual(getGroupSites('not-a-group'), []);
  assert.deepEqual(getSiteGroups('not-a-site'), []);
});

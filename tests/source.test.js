import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { Source, buildUrl, isEmptyEntry, EMPTY_TTL } from '../js/source.js';
import { fixtureHtml } from './helpers.js';

/** Source s podvrženým stahováním: art → fixture, zaznamenává stažené adresy. */
function fakeSource(pages) {
  const src = new Source({ getProxyUrl: () => 'https://proxy.example', domParser: () => new DOMParser() });
  src.requested = [];
  src.fetchHtml = async (url) => {
    src.requested.push(url);
    const art = new URL(url).searchParams.get('art');
    return { html: fixtureHtml(pages[art]), fetchedAt: '2026-11-28T12:00:00Z' };
  };
  return src;
}

test('buildUrl: volitelně jiný art', () => {
  assert.match(buildUrl(1, 'teamRanking', 3), /art=46&rd=3/);
  assert.match(buildUrl(1, 'teamRanking', 3, 0), /art=0&rd=3/);
});

test('tabulka družstev: švýcar družstev (art=46 prázdná) → pořadí z art=0', async () => {
  const src = fakeSource({ 46: 'teamswiss-art46-empty', 0: 'teamswiss-ranking-r3' });
  const entry = await src.get(999002, 'teamRanking', 3);
  assert.equal(entry.data.rows.length, 6);
  assert.equal(entry.data.rows[0].name, 'Šachklub Alfa A');
  assert.equal(entry.data.round, 3);
  assert.equal(entry.data.tiebreaks.length, 3);
  assert.match(entry.url, /art=0&rd=3/);
  assert.equal(src.requested.length, 2);
});

test('tabulka družstev: liga s tabulkou na art=46 – žádné další stahování', async () => {
  const src = fakeSource({ 46: 'team-table', 0: 'teamswiss-ranking-r3' });
  const entry = await src.get(999001, 'teamRanking', null);
  assert.ok(entry.data.rows.length > 0);
  assert.notEqual(entry.data.rows[0].name, 'Šachklub Alfa A');
  assert.equal(src.requested.length, 1);
});

test('tabulka družstev: prázdná i záložní stránka → prázdná tabulka (upozornění v šabloně)', async () => {
  const src = fakeSource({ 46: 'teamswiss-art46-empty', 0: 'teamswiss-art46-empty' });
  const entry = await src.get(999002, 'teamRanking', 3);
  assert.equal(entry.data.rows.length, 0);
});

test('prázdné stránky se neukládají do uložených dat a neobnovují', async () => {
  const src = fakeSource({ 46: 'teamswiss-art46-empty', 0: 'teamswiss-art46-empty', 32: 'teamswiss-teams' });
  await src.get(999002, 'teamRanking', 3);
  await src.get(999002, 'teams');
  const snap = src.snapshot(999002);
  assert.deepEqual(Object.keys(snap), ['999002|teams|']);
  // Starší uložená data (z verze, která prázdné stránky ukládala) se při obnovení vynechají
  const empty = { info: {}, data: { rows: [], tiebreaks: [] }, fetchedAt: '2026-11-28T12:00:00Z', manual: false };
  const src2 = fakeSource({});
  src2.restore({ ...snap, '999002|teamRanking|3': empty });
  assert.equal(src2.peek(999002, 'teamRanking', 3), null);
  assert.ok(src2.peek(999002, 'teams'));
});

test('prázdná stránka v paměti se po 2 minutách stáhne znovu, plná ne', async () => {
  const pages = { 46: 'teamswiss-art46-empty', 0: 'teamswiss-art46-empty' };
  const src = fakeSource(pages);
  await src.get(999002, 'teamRanking', 3);
  assert.equal(src.requested.length, 2);
  await src.get(999002, 'teamRanking', 3); // hned znovu → z paměti
  assert.equal(src.requested.length, 2);
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + EMPTY_TTL + 1000;
    pages[0] = 'teamswiss-ranking-r3'; // chess-results mezitím pořadí zveřejnil
    const e = await src.get(999002, 'teamRanking', 3);
    assert.equal(e.data.rows.length, 6);
    assert.equal(src.requested.length, 4);
    Date.now = () => realNow() + 2 * (EMPTY_TTL + 1000);
    await src.get(999002, 'teamRanking', 3); // plná tabulka zůstává v paměti
    assert.equal(src.requested.length, 4);
  } finally {
    Date.now = realNow;
  }
});

test('isEmptyEntry: hlavní stránka a ručně vložené se nepočítají', () => {
  const empty = { data: { rows: [] } };
  assert.equal(isEmptyEntry('1|teamRanking|3', empty), true);
  assert.equal(isEmptyEntry('1|main|', { data: { players: [] } }), false);
  assert.equal(isEmptyEntry('1|teamRanking|3', { ...empty, manual: true }), false);
  assert.equal(isEmptyEntry('1|teamRanking|3', { data: { rows: [{}], tiebreaks: [] } }), false);
});

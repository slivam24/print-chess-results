import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { Source, buildUrl } from '../js/source.js';
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

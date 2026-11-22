import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resultChecks, checkNeeds, lastCompleteRound } from '../js/checks.js';
import { hashString, dataHash, printKey, PrintLog, pdfTitle } from '../js/printLog.js';
import { fmtWhen } from '../js/templates/common.js';
import { loadQr, qrSvg } from '../js/qr.js';
import { buildDocument, publicUrl } from '../js/render.js';
import { getTemplate } from '../js/templates/index.js';
import { defaultProfile } from '../js/store.js';

const played = { played: true, text: '1 - 0' };
const open = { played: false, text: '' };
const pair = (board, result, black = { name: 'B' }) => ({ board, white: { name: 'W' }, black, result });
const swiss = { isTeam: false, system: 'swiss', lastPairedRound: 6, lastRankedRound: 5 };
const ranking = { roundMode: 'ranking' };
const pairingsTpl = { roundMode: 'pairings' };

describe('kontrola výsledků', () => {
  test('pořadí po kole, ve kterém chybí výsledky → šachovnice', () => {
    const data = { pairings: { rounds: [{ round: 5, published: true, hasResults: true, pairings: [pair(1, played), pair(2, open), pair(3, played), pair(7, open), { board: 8, white: { name: 'X' }, black: null, bye: 'bye', result: open }] }] } };
    const w = resultChecks({ tpl: ranking, info: swiss, data, round: 5, auto: true });
    assert.equal(w.length, 1);
    assert.match(w[0], /Kolo 5: na chess-results chybí 2 výsledky \(šachovnice 2, 7\)/);
  });

  test('kompletní kolo bez upozornění; volno se nepočítá', () => {
    const data = { pairings: { rounds: [{ round: 5, published: true, hasResults: true, pairings: [pair(1, played), { board: 2, white: { name: 'X' }, black: null, result: open }] }] } };
    assert.deepEqual(resultChecks({ tpl: ranking, info: swiss, data, round: 5 }), []);
  });

  test('pořadí zaostává za losem (švýcar, automaticky)', () => {
    const w = resultChecks({ tpl: ranking, info: { ...swiss, lastPairedRound: 7, lastRankedRound: 4 }, data: {}, round: 4, auto: true });
    assert.match(w[0], /jen po 4\. kole, ale los je už na 7\. kolo – pořadí po 6\. kole/);
  });

  test('ručně vybrané starší kolo', () => {
    assert.match(resultChecks({ tpl: ranking, info: swiss, round: 3, auto: false })[0], /pořadí po 3\. kole – nejnovější je po 5\. kole/);
    assert.match(resultChecks({ tpl: pairingsTpl, info: swiss, round: 4, auto: false })[0], /los 4\. kola – nejnovější zveřejněný je los 6\. kola/);
    assert.deepEqual(resultChecks({ tpl: pairingsTpl, info: swiss, round: 6, auto: false }), []);
  });

  test('los: částečně zadané výsledky kola', () => {
    const rd = { round: 6, published: true, hasResults: true, pairings: [pair(1, played), pair(2, open)] };
    assert.match(resultChecks({ tpl: pairingsTpl, info: swiss, data: { pairings: { rounds: [rd] } }, round: 6 })[0], /Kolo 6: zatím chybí 1 výsledek \(šachovnice 2\)/);
    // nový los bez výsledků – nic
    const fresh = { ...rd, hasResults: false, pairings: [pair(1, open), pair(2, open)] };
    assert.deepEqual(resultChecks({ tpl: pairingsTpl, info: swiss, data: { pairings: { rounds: [fresh] } }, round: 6 }), []);
  });

  test('každý s každým: výsledky dál než pořadí', () => {
    const rr = { isTeam: false, system: 'roundrobin', lastRankedRound: 2 };
    const pairings = { rounds: [
      { round: 1, published: true, hasResults: true, pairings: [pair(1, played)] },
      { round: 2, published: true, hasResults: true, pairings: [pair(1, played)] },
      { round: 3, published: true, hasResults: true, pairings: [pair(1, played)] },
      { round: 4, published: true, hasResults: true, pairings: [pair(1, played), pair(2, open)] },
    ] };
    assert.equal(lastCompleteRound(pairings), 3);
    const w = resultChecks({ tpl: ranking, info: rr, data: { pairings }, round: 2, auto: true });
    assert.deepEqual(w, ['Výsledky jsou na chess-results zadané už do 3. kola, ale pořadí je zveřejněné jen po 2. kole.']);
    assert.deepEqual(checkNeeds(ranking, rr, 2), [{ dataset: 'pairings', round: 1, optional: true }]);
  });

  test('družstva: chybějící výsledek zápasu a šachovnic', () => {
    const team = { isTeam: true, system: 'swiss', lastPairedRound: 3, lastRankedRound: 3 };
    const teamPairings = { rounds: [{ round: 3, matches: [
      { no: 1, home: { name: 'A' }, away: { name: 'B' }, score: { home: 2.5, away: 1.5 } },
      { no: 2, home: { name: 'C' }, away: { name: 'D' }, score: { home: null, away: null } },
      { no: 3, home: { name: 'E' }, away: null, bye: 'bye', score: { home: null } },
    ] }] };
    assert.match(resultChecks({ tpl: ranking, info: team, data: { teamPairings }, round: 3 })[0], /chybí výsledek zápasu 2 –/);
    assert.deepEqual(checkNeeds(ranking, team, 3), [{ dataset: 'teamPairings', round: 3, optional: true }]);
    const side = (name) => ({ name });
    const boards = { rounds: [{ round: 3, hasResults: true, matches: [
      { no: 1, home: { name: 'A' }, away: { name: 'B' }, boards: [{ home: side('a'), away: side('b'), result: played }, { home: side('a'), away: side('b'), result: open }] },
      { no: 2, home: { name: 'C' }, away: { name: 'D' }, boards: [{ home: side('c'), away: side('d'), result: played }] },
    ] }] };
    assert.match(resultChecks({ tpl: pairingsTpl, info: team, data: { boards }, round: 3 })[0], /Kolo 3: zatím chybí 1 výsledek \(zápas 1\)/);
  });

  test('bez kola (startovní listina, všechna kola) nic nekontroluje', () => {
    assert.deepEqual(resultChecks({ tpl: { roundMode: null }, info: swiss, round: null }), []);
    assert.deepEqual(resultChecks({ tpl: pairingsTpl, info: swiss, round: 'all' }), []);
    assert.deepEqual(checkNeeds(pairingsTpl, swiss, 5), []);
  });
});

describe('záznam o tisku a název PDF', () => {
  const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

  test('otisk dat je stabilní a pozná změnu', () => {
    assert.equal(hashString('abc'), hashString('abc'));
    assert.notEqual(dataHash({ a: 1 }), dataHash({ a: 2 }));
    assert.match(hashString(''), /^[0-9a-f]{8}$/);
  });

  test('vytištěno → změněno po změně dat; přetrvá v úložišti', () => {
    const st = mem();
    const log = new PrintLog(st);
    const key = printKey({ tnr: 1, group: 1, templateId: 'ranking', round: 5 });
    assert.equal(log.status(key, 'aaa'), null);
    log.mark(key, 'aaa', '2026-11-22T10:00:00Z');
    assert.deepEqual(log.status(key, 'aaa'), { state: 'printed', at: '2026-11-22T10:00:00Z' });
    assert.equal(log.status(key, 'bbb').state, 'changed');
    assert.equal(log.status(key).state, 'printed');
    assert.equal(new PrintLog(st).status(key, 'bbb').state, 'changed');
    log.unmark(key);
    assert.equal(new PrintLog(st).status(key), null);
  });

  test('uchová jen posledních 300 záznamů', () => {
    const log = new PrintLog(mem());
    for (let i = 0; i < 320; i++) log.mark(`k${i}`, 'h');
    assert.equal(Object.keys(log.items).length, 300);
    assert.equal(log.get('k0'), null);
    assert.ok(log.get('k319'));
  });

  test('název PDF bez zakázaných znaků', () => {
    assert.equal(pdfTitle({ tournament: 'Open 2026: A/B', output: 'Pořadí po 5. kole' }), 'Open 2026 A B – Pořadí po 5. kole');
    assert.equal(pdfTitle({ tournament: 'Turnaj', group: 'Skupina A', output: 'Los 3. kola' }), 'Turnaj – Skupina A – Los 3. kola');
    assert.equal(pdfTitle({}), 'Šachový tisk');
    assert.ok(pdfTitle({ tournament: 'x'.repeat(300), output: 'Pořadí' }).length <= 150);
  });

  test('krátké datum pro seznamy', () => {
    const now = new Date(2026, 10, 22, 15, 0);
    assert.equal(fmtWhen(new Date(2026, 10, 22, 9, 5).toISOString(), now), 'dnes 09:05');
    assert.equal(fmtWhen(new Date(2026, 10, 21, 23, 0).toISOString(), now), 'včera');
    assert.equal(fmtWhen(new Date(2026, 9, 3, 12, 0).toISOString(), now), '3. 10. 2026');
    assert.equal(fmtWhen(null, now), '');
  });
});

describe('QR kód v záhlaví', () => {
  test('SVG z knihovny s odkazem na turnaj', async () => {
    const qr = await loadQr();
    const svg = qr('https://chess-results.com/tnr1495793.aspx?lan=5', 20);
    assert.match(svg, /^<svg class="qr"[^>]*viewBox="0 0 (\d+) \1"[^>]*width:20mm/);
    assert.match(svg, /<path d="M\d/);
    assert.equal(qrSvg(''), '');
  });

  test('záhlaví s QR kódem jen když je zapnutý; odkaz na stránku výstupu', () => {
    const tpl = getTemplate('startlist');
    const info = { tnr: 77, title: 'Turnaj', groups: [] };
    const data = { main: { players: [{ startNo: 1, name: 'Novák Jan' }] } };
    const urls = [];
    const qr = (url) => { urls.push(url); return '<svg class="qr"></svg>'; };
    const p = defaultProfile();
    assert.doesNotMatch(buildDocument({ tpl, info, data, profile: p, round: null, qr }).layout.header, /hd-qr/);
    p.header.qr = 'on';
    assert.match(buildDocument({ tpl, info, data, profile: p, round: null, qr }).layout.header, /hd-with-qr[\s\S]*hd-qr/);
    assert.equal(urls.at(-1), 'https://chess-results.com/tnr77.aspx?lan=5');
    p.header.qrTarget = 'output';
    buildDocument({ tpl: getTemplate('ranking'), info, data: { ...data, ranking: { rows: [], tiebreaks: [] } }, profile: p, round: 5, qr });
    assert.equal(urls.at(-1), publicUrl(77, 1, 5));
    assert.equal(publicUrl(77, 1, 5), 'https://chess-results.com/tnr77.aspx?lan=5&art=1&rd=5');
  });
});

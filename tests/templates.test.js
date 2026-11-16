import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.js';
import {
  parseInfo, parseStartList, parseRanking, parsePairings, parseTeamList, parseBoardPairings, parseTeamPairings,
} from '../js/parser/index.js';
import { TEMPLATES, getTemplate, templatesFor } from '../js/templates/index.js';
import { buildDocument, autoRound, datasetsFor } from '../js/render.js';
import { defaultProfile, templateSettings } from '../js/store.js';
import { fmtName, resolveColumns, fillVars } from '../js/templates/common.js';
import { pack } from '../js/layout.js';

const swiss = {
  info: parseInfo(fixture('swiss-main')),
  data: {
    main: { players: parseStartList(fixture('swiss-main')).players },
    pairings: parsePairings(fixture('swiss-pairings-r7')),
    ranking: parseRanking(fixture('swiss-ranking-r6')),
  },
};
const team = {
  info: parseInfo(fixture('team-main')),
  data: {
    boards: parseBoardPairings(fixture('team-boards-r3')),
    teamPairings: parseTeamPairings(fixture('team-pairings-r3')),
    teams: parseTeamList(fixture('team-teams')),
    teamPlayers: parseStartList(fixture('team-players')),
    teamRanking: parseRanking(fixture('team-table')),
  },
};

const html = (doc) => doc.blocks.map((b) => (b.type === 'table' ? b.thead + b.rows.join('') : b.html || '')).join('\n');

describe('registr šablon', () => {
  test('každá šablona má povinné části a unikátní id', () => {
    const ids = new Set();
    for (const t of TEMPLATES) {
      assert.ok(t.id && t.name && typeof t.render === 'function' && typeof t.needs === 'function', t.id);
      assert.ok(!ids.has(t.id), `duplicitní ${t.id}`);
      ids.add(t.id);
    }
  });
  test('výběr šablon podle typu turnaje', () => {
    const ind = templatesFor(swiss.info).map((t) => t.id);
    const tm = templatesFor(team.info).map((t) => t.id);
    assert.ok(ind.includes('pairings') && !ind.includes('team-boards'));
    assert.ok(tm.includes('team-boards') && !tm.includes('pairings'));
  });
});

describe('vykreslení šablon jednotlivců', () => {
  const profile = defaultProfile();
  for (const id of ['pairings', 'pairings-board', 'pairings-alpha', 'arbiter-sheet', 'scoresheets', 'startlist', 'ranking']) {
    test(id, () => {
      const tpl = getTemplate(id);
      const round = id === 'ranking' ? 6 : 7;
      const doc = buildDocument({ tpl, info: swiss.info, data: swiss.data, profile, round });
      assert.ok(doc.blocks.length > 0);
      assert.ok(doc.title);
      assert.deepEqual(doc.warnings, []);
      const h = html(doc);
      assert.match(h, /Novák, Jindřich/);
      assert.doesNotMatch(h, /undefined|NaN|\[object/);
    });
  }

  test('los obsahuje šachovnice a volno', () => {
    const doc = buildDocument({ tpl: getTemplate('pairings'), info: swiss.info, data: swiss.data, profile, round: 7 });
    const t = doc.blocks[0];
    assert.equal(t.rows.length, 30);
    assert.match(t.rows.join(''), /volno/);
    assert.match(t.rows.join(''), /nenasazen/);
    assert.equal(doc.title, 'Los 7. kola');
    assert.equal(doc.sub, '19. 11. 2026, 17:30');
  });

  test('nezveřejněné kolo → upozornění', () => {
    const data = { ...swiss.data, pairings: parsePairings(fixture('swiss-pairings-r8')) };
    const doc = buildDocument({ tpl: getTemplate('pairings'), info: swiss.info, data, profile, round: 8 });
    assert.equal(doc.warnings.length, 1);
    assert.match(doc.warnings[0], /8\. kola zatím není/);
  });

  test('vlastní pořadí a skrytí sloupců z profilu', () => {
    const p = defaultProfile();
    p.templates.pairings = { columns: [{ key: 'bName', on: true }, { key: 'wName', on: true }, { key: 'board', on: false }] };
    const doc = buildDocument({ tpl: getTemplate('pairings'), info: swiss.info, data: swiss.data, profile: p, round: 7 });
    const head = doc.blocks[0].thead;
    assert.ok(head.indexOf('Černý') < head.indexOf('Bílý'));
    assert.doesNotMatch(head, />Š\.</);
  });

  test('výsledkové lístky: bez záhlaví, dva sloupce', () => {
    const doc = buildDocument({ tpl: getTemplate('scoresheets'), info: swiss.info, data: swiss.data, profile, round: 7 });
    assert.equal(doc.layout.header, null);
    assert.equal(doc.layout.columns, 2);
    assert.equal(doc.blocks.length, 27); // 30 řádků losu minus 3× volno/nenasazen
  });

  test('kategorie: rozdělení startovní listiny', () => {
    const info = parseInfo(fixture('categories-main'));
    const data = { main: { players: parseStartList(fixture('categories-main')).players } };
    const p = defaultProfile();
    p.templates.startlist = { options: { category: '*split*' } };
    const doc = buildDocument({ tpl: getTemplate('startlist'), info, data, profile: p });
    const titles = doc.blocks.filter((b) => b.type === 'html').map((b) => b.html).join('');
    assert.match(titles, /Top \(A\)/);
    assert.match(titles, /U1800 \(B\)/);
  });

  test('záhlaví s proměnnými a zápatí s čísly stran', () => {
    const doc = buildDocument({ tpl: getTemplate('pairings'), info: swiss.info, data: swiss.data, profile, round: 7 });
    assert.match(doc.layout.header, /Vršovický podzimní open 2026/);
    assert.match(doc.layout.header, /Praha, 8\. 10\. 2026 – 10\. 12\. 2026/);
    assert.match(doc.layout.header, /Jan Kovář/);
    assert.match(doc.layout.footer(2, 3), /Strana 2 \/ 3/);
  });
});

describe('vykreslení šablon družstev', () => {
  const profile = defaultProfile();
  for (const id of ['team-matches', 'team-boards', 'team-roster', 'team-ranking']) {
    test(id, () => {
      const doc = buildDocument({ tpl: getTemplate(id), info: team.info, data: team.data, profile, round: 3 });
      const h = html(doc);
      assert.match(h, /TJ Baník Havířov/);
      assert.doesNotMatch(h, /undefined|NaN|\[object/);
    });
  }
  test('rozpis šachovnic doplní Elo ze soupisek', () => {
    const doc = buildDocument({ tpl: getTemplate('team-boards'), info: team.info, data: team.data, profile, round: 3 });
    const h = html(doc);
    assert.match(h, /Kuboš, Rostislav/);
    const firstTable = doc.blocks.find((b) => b.type === 'table');
    assert.match(firstTable.rows[0], />\d{4}</);
  });
  test('neznámé sestavy → prázdné šachovnice a upozornění', () => {
    const data = { ...team.data, boards: parseBoardPairings(fixture('team-boards-r4')) };
    const doc = buildDocument({ tpl: getTemplate('team-boards'), info: team.info, data, profile, round: 4 });
    assert.match(doc.warnings[0], /Sestavy družstev/);
    assert.match(html(doc), /blank-line/);
  });
});

describe('pomocné funkce', () => {
  test('formáty jmen', () => {
    assert.equal(fmtName('Novák, Jindřich', 'first-last'), 'Jindřich Novák');
    assert.equal(fmtName('Novák, Jindřich', 'LAST-first'), 'NOVÁK Jindřich');
    assert.equal(fmtName('Novák, Jindřich', 'last-first'), 'Novák Jindřich');
    assert.equal(fmtName('Novák, Jindřich'), 'Novák, Jindřich');
  });
  test('sloupce: uložené pořadí + nové sloupce na konec', () => {
    const defs = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B', def: false }, { key: 'c', label: 'C' }];
    const r = resolveColumns(defs, [{ key: 'c', on: true }, { key: 'x', on: true }, { key: 'a', on: false }]);
    assert.deepEqual(r.map((c) => [c.key, c.on]), [['c', true], ['a', false], ['b', false]]);
  });
  test('proměnné', () => {
    assert.equal(fillVars('{turnaj} – {kolo}. kolo {neznama}', { turnaj: 'Open', kolo: '3' }), 'Open – 3. kolo');
  });
  test('automatické kolo', () => {
    assert.equal(autoRound(getTemplate('pairings'), swiss.info), 7);
    assert.equal(autoRound(getTemplate('ranking'), swiss.info), 6);
    const rr = parseInfo(fixture('rr-main'));
    assert.equal(autoRound(getTemplate('pairings'), rr, { pairings: parsePairings(fixture('rr-pairings-r1')) }), 4);
    assert.deepEqual(datasetsFor(getTemplate('pairings'), rr, 5, {}).find((d) => d.dataset === 'pairings').round, 1);
  });
  test('nastavení šablony z profilu', () => {
    const s = templateSettings(defaultProfile(), getTemplate('scoresheets'));
    assert.equal(s.options.perPage, '8');
    assert.equal(s.orientation, 'inherit');
  });
});

describe('stránkování (výpočet bez DOM)', () => {
  const tbl = (n, rowH = 10) => ({ b: { type: 'table', rows: Array(n).fill('<tr></tr>') }, h: 20 + n * rowH, theadH: 15, rowH: Array(n).fill(rowH), extra: 5 });
  test('dlouhá tabulka se rozdělí na stránky', () => {
    const pages = pack([tbl(50)], { capFirst: 200, capOther: 300, columns: 1 });
    // 1. strana: (200-2-20)/10 = 17 řádků, další: (300-2-20)/10 = 27
    assert.equal(pages.length, 3);
    assert.equal(pages[0][0][0].to - pages[0][0][0].from, 17);
    assert.equal(pages[1][0][0].to - pages[1][0][0].from, 27);
  });
  test('dva sloupce na stránce', () => {
    const pages = pack([tbl(40)], { capFirst: 300, capOther: 300, columns: 2 });
    assert.equal(pages.length, 1);
    assert.equal(pages[0].length, 2);
  });
  test('vynucený konec stránky a keepWithNext', () => {
    const html = (h, extra = {}) => ({ b: { type: 'html', ...extra }, h });
    const pages = pack([html(50), { b: { type: 'break' }, h: 0 }, html(250, {}), html(30, { keepWithNext: true }), html(40)], { capFirst: 300, capOther: 300, columns: 1 });
    assert.equal(pages.length, 3);
    assert.equal(pages[2][0].length, 2); // nadpis přešel s následujícím blokem
  });
  test('keepTogether nerozdělí zápas', () => {
    const t = { ...tbl(8), b: { type: 'table', rows: Array(8).fill(''), keepTogether: true } };
    const pages = pack([{ b: { type: 'html' }, h: 250 }, t], { capFirst: 300, capOther: 300, columns: 1 });
    assert.equal(pages.length, 2);
    assert.equal(pages[1][0][0].to, 8);
  });
});

describe('záhlaví bez údajů', () => {
  test('prázdné proměnné nenechají visící oddělovače ani popisky', () => {
    const info = parseInfo(fixture('rr-main'));
    const doc = buildDocument({ tpl: getTemplate('startlist'), info, data: { main: { players: parseStartList(fixture('rr-main')).players } }, profile: defaultProfile() });
    assert.match(doc.layout.header, /<div class="hd-sub">18\. 10\. 2026 – 19\. 12\. 2026<\/div>/);
    assert.doesNotMatch(doc.layout.header, /Rozhodčí:/);
  });
  test('kruhový systém: prázdné sloupce bodů se skryjí', () => {
    const info = parseInfo(fixture('rr-main'));
    const data = { main: { players: parseStartList(fixture('rr-main')).players }, pairings: parsePairings(fixture('rr-pairings-r1')) };
    const doc = buildDocument({ tpl: getTemplate('pairings'), info, data, profile: defaultProfile(), round: 4 });
    assert.doesNotMatch(doc.blocks[0].thead, />B\.</);
  });
});

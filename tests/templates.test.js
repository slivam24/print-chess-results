import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.js';
import {
  parseInfo, parseStartList, parseRanking, parsePairings, parseTeamList, parseBoardPairings, parseTeamPairings,
  parseBoardList, parseClubRanking, parseTeamComposition, detectPageKind,
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
  for (const id of ['pairings', 'pairings-board', 'pairings-alpha', 'arbiter-sheet', 'scoresheets', 'startlist', 'alphalist', 'ranking']) {
    test(id, () => {
      const tpl = getTemplate(id);
      const round = id === 'ranking' ? 6 : 7;
      const doc = buildDocument({ tpl, info: swiss.info, data: swiss.data, profile, round });
      assert.ok(doc.blocks.length > 0);
      assert.ok(doc.title);
      assert.deepEqual(doc.warnings, []);
      const h = html(doc);
      assert.match(h, /Novák,? Jindřich/);
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

  describe('soupisky škol (klubů) u jednotlivců', () => {
    const school = (name, club, startNo, rating = 0) => ({ startNo, title: '', name, fideId: null, fed: 'CZE', rating, ratingNat: null, club, type: '', group: '', sex: '' });
    const players = [
      school('Starec, Jan', 'ZŠ Chabařovice', 1),
      school('Beran, Jan', 'ZŠ a MŠ Povrly', 2),
      school('Paroubek, Jan', 'ZŠ Chabařovice', 3),
      school('Kobrle, Ondřej', 'ZŠ E. Krásnohorské', 4),
      school('Samotář, Petr', '', 5),
      school('Pánek, Matěj', 'ZŠ a MŠ Povrly', 6),
    ];
    const render = (options = {}, list = players) => {
      const p = defaultProfile();
      p.templates['club-roster'] = { options };
      return buildDocument({ tpl: getTemplate('club-roster'), info: swiss.info, data: { main: { players: list } }, profile: p });
    };
    const titles = (doc) => doc.blocks.filter((b) => b.type === 'html').map((b) => b.html.replace(/<[^>]*>/g, ''));

    test('jen pro jednotlivce', () => {
      assert.ok(templatesFor(swiss.info).some((t) => t.id === 'club-roster'));
      assert.ok(!templatesFor(team.info).some((t) => t.id === 'club-roster'));
    });
    test('hráči seskupení podle klubu, abecedně, bez klubu na konci', () => {
      const doc = render();
      assert.equal(doc.title, 'Soupisky družstev');
      assert.equal(doc.sub, '4 družstva · 6 hráčů');
      // česká abeceda: CH až za H
      assert.deepEqual(titles(doc), [
        '1. ZŠ a MŠ Povrly 2 hráči', '2. ZŠ E. Krásnohorské 1 hráč', '3. ZŠ Chabařovice 2 hráči', '4. Bez klubu 1 hráč',
      ]);
      const first = doc.blocks.find((b) => b.type === 'table');
      assert.equal(first.rows.length, 2);
      assert.match(first.rows[0], /Beran/);
      assert.match(first.rows[1], /Pánek/);
      assert.ok(first.keepTogether);
      assert.deepEqual(doc.warnings, []);
      assert.doesNotMatch(html(doc), /undefined|NaN|\[object/);
    });
    test('pořadí podle startovních čísel, minimum hráčů, nadpis', () => {
      const doc = render({ teamOrder: 'startNo', minPlayers: '2', heading: 'schools' });
      assert.equal(doc.title, 'Soupisky škol');
      assert.deepEqual(titles(doc), ['1. ZŠ Chabařovice 2 hráči', '2. ZŠ a MŠ Povrly 2 hráči']);
      assert.match(doc.warnings.join(' '), /méně než 2 hráči: 2/);
    });
    test('každé družstvo na novou stránku', () => {
      const doc = render({ teamPerPage: true });
      const heads = doc.blocks.filter((b) => b.type === 'html');
      assert.ok(!heads[0].breakBefore && heads.slice(1).every((b) => b.breakBefore));
    });
    test('bez klubů → upozornění', () => {
      const doc = render({}, players.map((p) => ({ ...p, club: '' })));
      assert.match(doc.warnings.join(' '), /nemají na chess-results vyplněný klub/);
    });
    test('skutečná startovní listina z chess-results', () => {
      const doc = render({}, swiss.data.main.players);
      assert.ok(doc.blocks.length > 2);
      assert.match(html(doc), /Novák,? Jindřich/);
      assert.match(titles(doc).join('\n'), /TJ Sokol Praha-Vršovice/);
    });
  });

  test('záhlaví s proměnnými a zápatí s čísly stran', () => {
    const pf = { ...profile, footer: { ...profile.footer, enabled: true } };
    const doc = buildDocument({ tpl: getTemplate('pairings'), info: swiss.info, data: swiss.data, profile: pf, round: 7 });
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
    assert.match(h, /Kuboš,? Rostislav/);
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
  test('mezera pod bloky se započítá (kromě posledního ve sloupci)', () => {
    const html = (h) => ({ b: { type: 'html' }, h });
    // 3 × 90 + 2 mezery po 10 = 290 ≤ 298 → jedna stránka
    assert.equal(pack([html(90), html(90), html(90)], { capFirst: 300, capOther: 300, columns: 1, gap: 10 }).length, 1);
    // 3 × 95 + 2 × 10 = 305 > 298 → třetí blok na další stránku (bez mezer by se vešel)
    assert.equal(pack([html(95), html(95), html(95)], { capFirst: 300, capOther: 300, columns: 1, gap: 10 }).length, 2);
    assert.equal(pack([html(95), html(95), html(95)], { capFirst: 300, capOther: 300, columns: 1 }).length, 1);
  });
  test('mezera nad blokem (spaceBefore) se nepřidá na začátku stránky; „tight“ blok nemá mezeru pod sebou', () => {
    const html = (h, b = {}) => ({ b: { type: 'html', ...b }, h });
    // 2 × 100 + mezera 10 mm (≈ 37,8 px) = 237,8 ≤ 298
    assert.equal(pack([html(100), html(100, { spaceBefore: 10 })], { capFirst: 300, capOther: 300, columns: 1 }).length, 1);
    // 2 × 100 + 30 mm (≈ 113 px) > 298 → na další stránku, tam bez mezery
    const pages = pack([html(100), html(100, { spaceBefore: 30 })], { capFirst: 300, capOther: 300, columns: 1 });
    assert.equal(pages.length, 2);
    assert.equal(pages[1][0][0].space, false);
    // tight: 3 × 98 = 294 ≤ 298 jen bez mezer
    assert.equal(pack([html(98, { blockClass: 'tight' }), html(98, { blockClass: 'tight' }), html(98)], { capFirst: 300, capOther: 300, columns: 1, gap: 10 }).length, 1);
    // „sec-tight“ není „tight“ – mezeru pod sebou má
    assert.equal(pack([html(98, { blockClass: 'sec-tight' }), html(98, { blockClass: 'sec-tight' }), html(98)], { capFirst: 300, capOther: 300, columns: 1, gap: 10 }).length, 2);
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

describe('každý s každým: los všech kol najednou', () => {
  const info = parseInfo(fixture('rr-main'));
  const data = { main: { players: parseStartList(fixture('rr-main')).players }, pairings: parsePairings(fixture('rr-pairings-r1')) };
  test('nabídka jen u kruhového systému', () => {
    assert.equal(getTemplate('pairings').allRounds(info), true);
    assert.equal(getTemplate('pairings').allRounds(swiss.info), false);
  });
  test('každé kolo s nadpisem, nerozdělí se, stejné sloupce; volitelně kolo na stránku', () => {
    const doc = buildDocument({ tpl: getTemplate('pairings'), info, data, profile: defaultProfile(), round: 'all' });
    const tables = doc.blocks.filter((b) => b.type === 'table');
    assert.equal(tables.length, data.pairings.rounds.length);
    assert.ok(tables.every((t) => t.keepTogether && t.thead === tables[0].thead));
    assert.match(doc.blocks[0].html, /1\. kolo/);
    assert.equal(doc.title, 'Los všech kol');
    assert.doesNotMatch(doc.layout.header, /all/);
    assert.ok(!doc.blocks.some((b) => b.breakBefore));
    const p = defaultProfile();
    p.templates.pairings = { options: { roundPerPage: true } };
    const paged = buildDocument({ tpl: getTemplate('pairings'), info, data, profile: p, round: 'all' });
    assert.equal(paged.blocks.filter((b) => b.breakBefore).length, data.pairings.rounds.length - 1);
  });
  test('mezera mezi koly: výchozí 6 mm, nastavitelná, první kolo bez mezery', () => {
    const titles = (opts) => {
      const p = defaultProfile();
      p.templates.pairings = { options: opts };
      return buildDocument({ tpl: getTemplate('pairings'), info, data, profile: p, round: 'all' }).blocks.filter((b) => b.type === 'html');
    };
    assert.deepEqual(titles({}).map((b) => b.spaceBefore), [undefined, ...Array(data.pairings.rounds.length - 1).fill(6)]);
    assert.ok(titles({ roundGap: 0 }).slice(1).every((b) => b.spaceBefore === 0));
    assert.ok(titles({ roundGap: 20 }).slice(1).every((b) => b.spaceBefore === 20));
  });
});

describe('vestavěná proxy', () => {
  test('bez vlastní adresy se použije vestavěná, vlastní má přednost', async () => {
    const { Store, DEFAULT_PROXY_URL } = await import('../js/store.js');
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    const st = new Store(storage);
    assert.equal(st.proxyUrl, DEFAULT_PROXY_URL);
    st.state.proxyUrl = '  http://localhost:8787/proxy ';
    assert.equal(st.proxyUrl, 'http://localhost:8787/proxy');
    st.state.proxyUrl = '';
    assert.equal(st.proxyUrl, DEFAULT_PROXY_URL);
  });
});

describe('abecední seznam hráčů', () => {
  test('řadí podle české abecedy, jméno je první sloupec', () => {
    const doc = buildDocument({ tpl: getTemplate('alphalist'), info: swiss.info, data: swiss.data, profile: defaultProfile() });
    const t = doc.blocks[0];
    assert.equal(doc.title, 'Abecední seznam');
    const names = t.rows.map((r) => r.match(/<td class="name">([^<]*)</)[1]);
    assert.equal(names.length, 57);
    const sorted = [...names].sort(new Intl.Collator('cs').compare);
    assert.deepEqual(names, sorted);
    // CH patří v češtině za H
    assert.ok(names.indexOf('Chamoso Javier') > names.indexOf('Havlák Lubomír'));
  });
});

describe('vzhled podle Swiss-Manageru', () => {
  test('abecední seznam: sloupce Č., St.č., titul, Jméno, RtgN, RtgF, Klub a pořadová čísla', () => {
    const info = parseInfo(fixture('categories-main'));
    const sl = parseStartList(fixture('categories-main'));
    const doc = buildDocument({ tpl: getTemplate('alphalist'), info, data: { main: { players: sl.players, ratingInfo: sl.ratingInfo } }, profile: defaultProfile() });
    const head = doc.blocks[0].thead.replace(/<[^>]+>/g, '|').split('|').filter(Boolean);
    assert.deepEqual(head, ['Č.', 'St.č.', 'Jméno', 'RtgN', 'RtgF', 'Klub']);
    assert.match(doc.blocks[0].rows[0], /^<tr><td class="c num">1<\/td><td class="c num">17<\/td>/); // Č. 1, St.č. 17
    assert.match(doc.blocks[0].rows[0], /Barabas Aleš/); // výchozí formát „Příjmení Jméno“
    assert.match(doc.blocks[0].rows.join(''), /GM<\/td><td class="name">Druska Juraj/);
  });
  test('jen jeden zveřejněný rating → sloupec se jmenuje Elo (všude)', () => {
    const sl = parseStartList(fixture('swiss-main'));
    assert.deepEqual(sl.ratingInfo, { generic: true, international: false, national: false });
    const doc = buildDocument({ tpl: getTemplate('alphalist'), info: swiss.info, data: { main: { players: sl.players, ratingInfo: sl.ratingInfo } }, profile: defaultProfile() });
    assert.match(doc.blocks[0].thead, />Elo</);
    assert.doesNotMatch(doc.blocks[0].thead, /RtgF|RtgN/);
    const pr = buildDocument({ tpl: getTemplate('pairings'), info: swiss.info, data: swiss.data, profile: defaultProfile(), round: 7 });
    assert.match(pr.blocks.find((b) => b.thead).thead, />Elo</);
  });
  test('vlastní nadpis ratingu z profilu má přednost', () => {
    const p = defaultProfile();
    p.templates.alphalist = { columnsVersion: 2, columns: [{ key: 'rating', label: 'Elo FIDE' }] };
    const sl = parseStartList(fixture('categories-main'));
    const doc = buildDocument({ tpl: getTemplate('alphalist'), info: swiss.info, data: { main: { players: sl.players } }, profile: p });
    assert.match(doc.blocks[0].thead, />Elo FIDE</);
    assert.match(doc.blocks[0].thead, />RtgN</);
  });
  test('styl mřížky a nadpis vlevo jsou výchozí, pruhy a nadpis na střed lze zvolit', () => {
    const p = defaultProfile();
    const doc = buildDocument({ tpl: getTemplate('startlist'), info: swiss.info, data: swiss.data, profile: p });
    assert.match(doc.layout.docClass, /tbl-grid/);
    assert.doesNotMatch(doc.layout.header, /hd-bar[^"]*center/);
    assert.equal(doc.layout.footer, null); // zápatí ve výchozím stavu vypnuté
    p.header.align = 'center';
    assert.match(buildDocument({ tpl: getTemplate('startlist'), info: swiss.info, data: swiss.data, profile: p }).layout.header, /hd-bar[^"]*center/);
    p.page.tableStyle = 'stripes';
    const doc2 = buildDocument({ tpl: getTemplate('startlist'), info: swiss.info, data: swiss.data, profile: p });
    assert.doesNotMatch(doc2.layout.docClass, /tbl-grid/);
  });
  test('migrace: starý profil s formátem „original“ přejde na „Příjmení Jméno“', async () => {
    const { normalizeState } = await import('../js/store.js');
    const s = normalizeState({ version: 1, profiles: [{ id: 'a', name: 'X', nameFormat: 'original' }] });
    assert.equal(s.profiles[0].nameFormat, 'last-first');
    assert.equal(s.profiles[0].page.tableStyle, 'grid');
    const s2 = normalizeState({ version: 2, profiles: [{ id: 'a', name: 'X', nameFormat: 'original' }] });
    assert.equal(s2.profiles[0].nameFormat, 'original');
  });
});

describe('sloupce: šířka, písmo, výška řádku, nové sloupce', () => {
  test('nový sloupec se vloží na výchozí místo, ne na konec', () => {
    const defs = [{ key: 'rowNo', label: 'Č.' }, { key: 'startNo', label: 'St.č.' }, { key: 'name', label: 'Jméno' }, { key: 'club', label: 'Klub' }];
    const r = resolveColumns(defs, [{ key: 'name', on: true }, { key: 'club', on: true }, { key: 'startNo', on: true }]);
    assert.deepEqual(r.map((c) => c.key), ['rowNo', 'name', 'club', 'startNo']);
    const r2 = resolveColumns(defs, [{ key: 'startNo', on: true }, { key: 'club', on: true }]);
    assert.deepEqual(r2.map((c) => c.key), ['rowNo', 'startNo', 'name', 'club']);
  });
  test('abecední seznam: sloupce uložené ve staré verzi se nepoužijí', () => {
    const p = defaultProfile();
    p.templates.alphalist = { columns: [{ key: 'name', on: true }, { key: 'startNo', on: true }] };
    const doc = buildDocument({ tpl: getTemplate('alphalist'), info: swiss.info, data: swiss.data, profile: p });
    assert.match(doc.blocks[0].thead, /^<tr><th class="c num">Č\.<\/th>/);
    p.templates.alphalist = { columnsVersion: 2, columns: [{ key: 'name', on: true }, { key: 'rowNo', on: true }] };
    const doc2 = buildDocument({ tpl: getTemplate('alphalist'), info: swiss.info, data: swiss.data, profile: p });
    assert.match(doc2.blocks[0].thead, /^<tr><th class="name">Jméno<\/th>/);
  });
  test('šířka v mm, písmo v pt a výška řádku se propíšou do výstupu', () => {
    const p = defaultProfile();
    p.templates.startlist = { rowHeight: 7, columns: [{ key: 'startNo', on: true, width: 12 }, { key: 'name', on: true, fontSize: 13 }] };
    const doc = buildDocument({ tpl: getTemplate('startlist'), info: swiss.info, data: swiss.data, profile: p });
    const t = doc.blocks[0];
    assert.match(t.colgroup, /<col style="width:12mm" data-key="[^"]*">/);
    assert.match(t.rows[0], /<td class="name" style="font-size:13pt">/);
    assert.equal(doc.layout.rowHeight, 7);
  });
});

describe('okraje a písmo „co největší“', () => {
  test('výchozí okraje 5 mm; profil s původními 12 mm se převede, vlastní okraje zůstanou', async () => {
    const { normalizeState } = await import('../js/store.js');
    assert.deepEqual(defaultProfile().page.margins, { top: 5, right: 5, bottom: 5, left: 5 });
    const s = normalizeState({ version: 2, profiles: [
      { id: 'a', name: 'A', page: { margins: { top: 12, right: 12, bottom: 12, left: 12 } } },
      { id: 'b', name: 'B', page: { margins: { top: 10, right: 12, bottom: 12, left: 12 } } },
    ] });
    assert.deepEqual(s.profiles[0].page.margins, { top: 5, right: 5, bottom: 5, left: 5 });
    assert.deepEqual(s.profiles[1].page.margins, { top: 10, right: 12, bottom: 12, left: 12 });
  });
  test('režim „co největší“ zapne hledání písma a vypne zalamování; nástěnku nemění', () => {
    const p = defaultProfile();
    p.templates.alphalist = { fontMode: 'max', fontMax: 16 };
    const doc = buildDocument({ tpl: getTemplate('alphalist'), info: swiss.info, data: swiss.data, profile: p });
    assert.deepEqual(doc.layout.fitWidth, { enabled: true, minPt: 6, maxPt: 16 });
    assert.match(doc.layout.docClass, /nowrap-cells/);
    p.templates['pairings-board'] = { fontMode: 'max' };
    const board = buildDocument({ tpl: getTemplate('pairings-board'), info: swiss.info, data: swiss.data, profile: p, round: 7 });
    assert.equal(board.layout.fitWidth, undefined);
  });
  test('režim „1 strana A4“ zapne hledání písma i výšky řádků na jednu stránku; nástěnku nemění', () => {
    const p = defaultProfile();
    p.templates.ranking = { fontMode: 'page', fontMax: 18 };
    const doc = buildDocument({ tpl: getTemplate('ranking'), info: swiss.info, data: swiss.data, profile: p, round: 6 });
    assert.deepEqual(doc.layout.fitPage, { enabled: true, minPt: 6, maxPt: 18, maxRowFactor: 2.5 });
    assert.equal(doc.layout.fitWidth, undefined);
    assert.match(doc.layout.docClass, /nowrap-cells/);
    p.templates['pairings-board'] = { fontMode: 'page' };
    assert.equal(buildDocument({ tpl: getTemplate('pairings-board'), info: swiss.info, data: swiss.data, profile: p, round: 7 }).layout.fitPage, undefined);
    assert.equal(templateSettings(p, getTemplate('ranking')).fontMode, 'page');
  });
});

describe('symetrické šířky sloupců v tabulkách s dvojicemi', () => {
  const widthsOf = (block) => [...block.colgroup.matchAll(/<col(?!group)(?: style="width:([^"]+)")?[^>]*>/g)].map((m) => m[1] || 'auto');
  const keysOf = (block) => [...block.thead.matchAll(/<th class="[^"]*">([^<]*)<\/th>/g)].map((m) => m[1]);
  test('los kola: protějškové sloupce mají stejnou šířku, jména se dělí o zbytek', () => {
    const doc = buildDocument({ tpl: getTemplate('pairings'), info: swiss.info, data: swiss.data, profile: defaultProfile(), round: 7 });
    const t = doc.blocks[0];
    assert.match(t.className, /\bsym\b/);
    const w = widthsOf(t);
    const k = keysOf(t);
    // levá strana (bez čísla šachovnice) má stejné šířky jako pravá
    const mid = k.indexOf('Výs.');
    assert.ok(mid > 0);
    const left = w.slice(1, mid); const right = w.slice(mid + 1).reverse().slice(0, left.length);
    assert.deepEqual(new Set(w.filter((x) => x === 'auto')).size, 1);
    assert.equal(w.filter((x) => x === 'auto').length, 2); // Bílý a Černý
    assert.deepEqual([...left].sort(), [...right].sort());
  });
  test('rozpis šachovnic družstev a rozhodcovský list jsou také symetrické', () => {
    for (const [id, info, data, round] of [['team-boards', team.info, team.data, 3], ['arbiter-sheet', swiss.info, swiss.data, 7]]) {
      const doc = buildDocument({ tpl: getTemplate(id), info, data, profile: defaultProfile(), round });
      const t = doc.blocks.find((b) => b.type === 'table');
      assert.match(t.className, /\bsym\b/, id);
      assert.equal(widthsOf(t).filter((x) => x === 'auto').length, 2, id);
    }
  });
});

describe('volno bez čísla šachovnice (jako Swiss-Manager)', () => {
  for (const id of ['pairings', 'pairings-board', 'arbiter-sheet']) {
    test(id, () => {
      const doc = buildDocument({ tpl: getTemplate(id), info: swiss.info, data: swiss.data, profile: defaultProfile(), round: 7 });
      const rows = doc.blocks.find((b) => b.type === 'table').rows;
      const byes = rows.filter((r) => /class="bye"/.test(r));
      assert.ok(byes.length > 0);
      for (const r of byes) assert.match(r, /^<tr[^>]*><td class="c num[^"]*"[^>]*><\/td>/, 'první buňka (šachovnice) má být prázdná');
      const played = rows.find((r) => !/class="bye"/.test(r));
      assert.match(played, /^<tr[^>]*><td class="c num[^"]*"[^>]*>1<\/td>/);
    });
  }
});

describe('los kola: sloupec Výs., čísla na střed, schované výstupy', () => {
  test('sloupec výsledku se jmenuje „Výs.“ a před kolem má pomlčku, u volna nic', () => {
    const doc = buildDocument({ tpl: getTemplate('pairings'), info: swiss.info, data: swiss.data, profile: defaultProfile(), round: 7 });
    const t = doc.blocks[0];
    assert.match(t.thead, /<th class="c res">Výs\.<\/th>/);
    assert.ok(t.rows.filter((r) => !/class="bye"/.test(r)).every((r) => /<td class="c res">–<\/td>/.test(r)));
    assert.ok(t.rows.filter((r) => /class="bye"/.test(r)).every((r) => /<td class="c res"><\/td>/.test(r)));
  });
  test('s volbou „Zobrazit výsledky“ je ve sloupci výsledek', () => {
    const p = defaultProfile();
    p.templates.pairings = { options: { showResults: true } };
    const data = { ...swiss.data, pairings: parsePairings(fixture('swiss-pairings-r6')) };
    const doc = buildDocument({ tpl: getTemplate('pairings'), info: swiss.info, data, profile: p, round: 6 });
    assert.match(doc.blocks[0].rows[0], /<td class="c res">0 – 1<\/td>/);
  });
  test('žádný číselný sloupec není zarovnaný vpravo', () => {
    for (const t of TEMPLATES) for (const c of t.columns || []) assert.doesNotMatch(c.cls || '', /\br\b/, `${t.id}.${c.key}`);
  });
  test('výchozí profil schovává nástěnku, kdo kde hraje, rozhodcovský list a výsledkové lístky', () => {
    assert.deepEqual(defaultProfile().hiddenTemplates.sort(), ['arbiter-sheet', 'pairings-alpha', 'pairings-board', 'scoresheets']);
  });
});

describe('pořadí + kategorie', () => {
  const players = [
    ['Hráč, Jedna', 'U10', 1], ['Hráč, Dva', 'U16', 2], ['Hráč, Tři', '', 3], ['Hráč, Čtyři', 'S50', 4],
    ['Hráč, Pět', 'U12', 5], ['Hráč, Šest', 'S65', 6],
  ].map(([name, type, n]) => ({ startNo: n, name, type, group: '', sex: n === 5 ? 'w' : '', rating: 1500 + n, ratingNat: 1000, club: 'Klub', title: '', fed: 'CZE' }));
  // Pořadí: bez typů (typy doplní startovní listina)
  const ranking = {
    round: 7, final: false, tiebreaks: [{ label: 'Buchholz' }],
    rows: [6, 2, 5, 1, 4, 3].map((n, i) => ({ rank: i + 1, startNo: n, name: players[n - 1].name, title: '', fed: '', rating: 1500 + n, ratingNat: null, club: '', type: '', group: '', sex: '', points: 7 - i, tb: ['1'] })),
  };
  const data = { main: { players }, ranking };
  const build = (opts) => {
    const p = defaultProfile();
    p.templates['ranking-cat'] = { options: { withOverall: false, ...opts } };
    return buildDocument({ tpl: getTemplate('ranking-cat'), info: swiss.info, data, profile: p, round: 7 });
  };
  const heads = (b) => b.thead.replace(/<[^>]+>/g, '|').split('|').filter(Boolean);

  test('bez kategorií = celé pořadí s Typem (doplněným ze startovní listiny)', () => {
    const doc = build({});
    const t = doc.blocks.find((b) => b.type === 'table');
    assert.deepEqual(heads(t), ['Poř.', 'Jméno', 'RtgF', 'RtgN', 'Typ', 'Klub', 'Body']);
    assert.equal(t.rows.length, 6);
    assert.match(t.rows[0], /Šest.*S65/);
  });
  test('kategorie „do 16 let“ (U16, U12, U10) a „nad 50“ (S50, S65) – vlastní pořadí + celkové', () => {
    const doc = build({ categories: [
      { name: 'Nejlepší do 16 let', types: ['U16', 'U12', 'U10'] },
      { name: 'Nejlepší nad 50 let', types: ['S50', 'S65'] },
      { name: 'Vypnutá', types: ['U10'], on: false },
    ] });
    const tables = doc.blocks.filter((b) => b.type === 'table');
    assert.equal(tables.length, 2);
    assert.deepEqual(heads(tables[0]), ['Poř.', 'Celk.', 'Jméno', 'RtgF', 'RtgN', 'Typ', 'Klub', 'Body']);
    // do 16: Dva (2.), Pět (3.), Jedna (4.)
    assert.deepEqual(tables[0].rows.map((r) => r.match(/<td[^>]*>(\d+)<\/td><td[^>]*>(\d+)<\/td>/).slice(1).join('/')), ['1/2', '2/3', '3/4']);
    assert.deepEqual(tables[1].rows.map((r) => r.match(/Hráč ([^<]+)/)[1]), ['Šest', 'Čtyři']);
    assert.ok(doc.blocks.some((b) => b.html && /Nejlepší do 16 let.*U16, U12, U10/.test(b.html)));
    assert.ok(!doc.blocks.some((b) => b.breakBefore));
  });
  test('kategorie se ve výchozím stavu nerozdělí na více stránek, lze vypnout', () => {
    const cats = [{ name: 'Do 16', types: ['U16', 'U12', 'U10'] }];
    assert.equal(build({ categories: cats }).blocks.find((b) => b.type === 'table').keepTogether, true);
    assert.equal(build({ categories: cats, keepTogether: false }).blocks.find((b) => b.type === 'table').keepTogether, false);
    // celkové pořadí se dělit smí
    assert.ok(!build({ categories: cats, withOverall: true }).blocks.find((b) => b.type === 'table').keepTogether);
  });
  test('každá kategorie na samostatné stránce, pohlaví a prázdná kategorie', () => {
    const doc = build({ catLayout: 'pages', categories: [
      { name: 'Ženy do 16', types: ['U16', 'U12', 'U10'], sex: ['w'] },
      { name: 'Prázdná' },
    ] });
    assert.equal(doc.blocks.filter((b) => b.breakBefore).length, 1);
    const t = doc.blocks.find((b) => b.type === 'table');
    assert.equal(t.rows.length, 1);
    assert.match(t.rows[0], /Pět/);
    assert.ok(doc.blocks.some((b) => b.html && /nemá vybraný/.test(b.html)));
  });
  test('startovní listina ukazuje Typ ve výchozím stavu', () => {
    const doc = buildDocument({ tpl: getTemplate('startlist'), info: swiss.info, data: { main: { players } }, profile: defaultProfile() });
    assert.ok(heads(doc.blocks[0]).includes('Typ'));
  });
});


describe('tisk jedním klikem', () => {
  test('rozpozná prohlížeč a sestaví příkaz pro zástupce', async () => {
    const { detectEnv, launchCommand } = await import('../js/ui/printSetup.js');
    const win = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
    assert.deepEqual(detectEnv(win), { os: 'win', browser: 'chrome' });
    assert.deepEqual(detectEnv(`${win} Edg/130.0.0.0`), { os: 'win', browser: 'edge' });
    assert.deepEqual(detectEnv('Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:131.0) Gecko/20100101 Firefox/131.0'), { os: 'mac', browser: 'firefox' });
    const url = 'https://slivam24.github.io/print-chess-results/';
    assert.equal(launchCommand({ os: 'win', browser: 'chrome' }, url), `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing "${url}"`);
    assert.match(launchCommand({ os: 'win', browser: 'edge' }, url), /msedge\.exe" --kiosk-printing/);
    assert.equal(launchCommand({ os: 'mac', browser: 'chrome' }, url), `open -na "Google Chrome" --args --kiosk-printing "${url}"`);
  });
});

describe('záhlaví a zápatí výstupu', () => {
  const build = (t) => {
    const p = defaultProfile();
    p.templates.ranking = t;
    return buildDocument({ tpl: getTemplate('ranking'), info: swiss.info, data: swiss.data, profile: p, round: 6 });
  };
  test('podle profilu: záhlaví na první stránce, zápatí vypnuté (výchozí profil), zapnout jde výstupem', () => {
    const d = build({});
    assert.match(d.layout.header, /hd-bar/);
    assert.equal(d.layout.headerEveryPage, false);
    assert.equal(d.layout.footer, null);
    assert.equal(typeof build({ footer: 'on' }).layout.footer, 'function');
  });
  test('na každé stránce / jen název výstupu / vypnuto', () => {
    assert.equal(build({ header: 'every' }).layout.headerEveryPage, true);
    const t = build({ header: 'title' }).layout.header;
    assert.doesNotMatch(t, /hd-bar/);
    assert.match(t, /hd-output-title/);
    assert.equal(build({ header: 'off' }).layout.header, null);
    assert.equal(build({ footer: 'off' }).layout.footer, null);
  });
  test('výstup může zapnout zápatí vypnuté v profilu; lístky záhlaví nemají', () => {
    const p = defaultProfile();
    p.footer.enabled = false;
    p.templates.ranking = { footer: 'on' };
    assert.equal(typeof buildDocument({ tpl: getTemplate('ranking'), info: swiss.info, data: swiss.data, profile: p, round: 6 }).layout.footer, 'function');
    assert.equal(getTemplate('scoresheets').pageChrome, false);
  });
});

describe('výsledky', () => {
  test('kontumace se píše 1K – 0K / 0K – 1K / 0K – 0K, běžné výsledky beze změny', async () => {
    const { fmtResult } = await import('../js/templates/common.js');
    const r = (white, black) => ({ played: true, white, black });
    assert.equal(fmtResult(r('+', '-')), '1K – 0K');
    assert.equal(fmtResult(r('-', '+')), '0K – 1K');
    assert.equal(fmtResult(r('-', '-')), '0K – 0K');
    assert.equal(fmtResult(r('1', '0')), '1 – 0');
    assert.equal(fmtResult(r('½', '½')), '½ – ½');
    assert.equal(fmtResult({ played: false }), '');
  });
});

describe('družstva: startovní pořadí, všechna kola, rozpis k rozstříhání', () => {
  const rr = { ...team.info, isTeam: true, system: 'roundrobin' };
  test('startovní pořadí družstev podle čísel', () => {
    const doc = buildDocument({ tpl: getTemplate('team-startlist'), info: team.info, data: { teams: { teams: [{ no: 2, name: 'B', ratingAvg: 1500 }, { no: 1, name: 'A', ratingAvg: 1600 }] } }, profile: defaultProfile() });
    assert.match(doc.blocks[0].rows[0], /<td class="name">A<\/td>/);
    assert.ok(!/Hráčů/.test(doc.blocks[0].thead)); // bez soupisek se sloupec skryje
  });
  test('los všech kol jen u družstev každý s každým', () => {
    assert.equal(getTemplate('team-matches').allRounds(rr), true);
    assert.equal(getTemplate('team-matches').allRounds({ ...rr, system: 'swiss' }), false);
    assert.deepEqual(datasetsFor(getTemplate('team-matches'), rr, 'all', {}).map((n) => n.round), [null, null]);
    const doc = buildDocument({ tpl: getTemplate('team-matches'), info: rr, data: team.data, profile: defaultProfile(), round: 'all' });
    assert.equal(doc.title, 'Los všech kol');
    assert.ok(doc.blocks.some((b) => b.type === 'table' && b.keepTogether));
  });
  test('rozpis: bez záhlaví a zápatí, Kolo X, Zápas Y, názvy družstev v hlavičce, mezera mezi zápasy', () => {
    const doc = buildDocument({ tpl: getTemplate('team-boards'), info: team.info, data: team.data, profile: defaultProfile(), round: 3 });
    assert.equal(doc.layout.header, null);
    assert.equal(doc.layout.footer, null);
    const heads = doc.blocks.filter((b) => b.type === 'html' && /match-head/.test(b.html));
    assert.match(heads[0].html, /Kolo 3, Zápas 1/);
    assert.equal(heads[0].spaceBefore, undefined);
    assert.equal(heads[1].spaceBefore, 12);
    const m = team.data.boards.rounds[0].matches[0];
    const t = doc.blocks.find((b) => b.type === 'table');
    assert.ok(t.thead.includes(`>${m.home.name}<`) && t.thead.includes(`>${m.away.name}<`));
    // vlastní volba záhlaví má přednost
    const p = defaultProfile();
    p.templates['team-boards'] = { header: 'first' };
    assert.ok(buildDocument({ tpl: getTemplate('team-boards'), info: team.info, data: team.data, profile: p, round: 3 }).layout.header);
  });
  test('sestava ze soupisky: jen družstvo s přesně tolika hráči jako šachovnic', async () => {
    const { prefillLineups } = await import('../js/templates/team.js');
    const boards = [1, 2].map((n) => ({ board: n, home: { empty: true, color: 'w' }, away: { empty: true, color: 'b' }, result: { played: false } }));
    const players = [
      { team: 'A', name: 'A2', board: 2 }, { team: 'A', name: 'A1', board: 1 },
      { team: 'B', name: 'B1', board: 1 }, { team: 'B', name: 'B2', board: 2 }, { team: 'B', name: 'B3', board: 3 },
    ];
    const r = prefillLineups({ home: { name: 'A' }, away: { name: 'B' }, boards }, players, 2);
    assert.deepEqual(r.filled, ['A']);
    assert.deepEqual(r.match.boards.map((b) => b.home.name), ['A1', 'A2']);
    assert.deepEqual(r.match.boards.map((b) => b.home.rosterNo), [1, 2]);
    assert.ok(r.match.boards.every((b) => !b.away.name));
    assert.ok(boards.every((b) => !b.home.name)); // původní data se nezmění
  });
});

describe('automatická aktualizace', () => {
  test('kontroluje jen soubory appky (js, css) ze stejného webu', async () => {
    const { appFiles } = await import('../js/ui/update.js');
    const files = appFiles([
      { name: 'https://example.github.io/app/js/main.js' },
      { name: 'https://example.github.io/app/css/app.css' },
      { name: 'https://example.github.io/app/js/main.js' },
      { name: 'https://chess-print-proxy.example.dev/?url=x' },
      { name: 'https://fonts.example.com/x.css' },
    ], 'https://example.github.io');
    assert.deepEqual(files, ['https://example.github.io/app/js/main.js', 'https://example.github.io/app/css/app.css']);
  });
});

test('rozpis šachovnic: řádek celkového skóre bez popisku „celkem“', () => {
  const doc = buildDocument({ tpl: getTemplate('team-boards'), info: team.info, data: team.data, profile: defaultProfile(), round: 3 });
  const rows = doc.blocks.filter((b) => b.type === 'table').flatMap((b) => b.rows).join('');
  assert.doesNotMatch(rows, /celkem/);
});

test('rozpis šachovnic: sloupec s pořadím na soupisce u obou družstev', () => {
  const doc = buildDocument({ tpl: getTemplate('team-boards'), info: team.info, data: team.data, profile: defaultProfile(), round: 3 });
  const t = doc.blocks.find((b) => b.type === 'table');
  assert.equal((t.thead.match(/>Soup\.</g) || []).length, 2);
  // hráči ze zveřejněné sestavy dostanou pořadí ze soupisky
  const m = team.data.boards.rounds[0].matches[0];
  const p = team.data.teamPlayers.players.find((x) => x.team === m.home.name && x.name === m.boards[0].home.name);
  if (p && p.board != null) assert.match(t.rows[0], new RegExp(`<td class="c num">${p.board}</td>`));
});

describe('šířky sloupců', () => {
  test('šířka v mm nebo v procentech', async () => {
    const { parseColWidth } = await import('../js/templates/common.js');
    assert.deepEqual(parseColWidth(12), { css: '12mm', value: 12 });
    assert.deepEqual(parseColWidth('12,5'), { css: '12.5mm', value: 12.5 });
    assert.deepEqual(parseColWidth('10 %'), { css: '10%', value: '10%' });
    assert.equal(parseColWidth(''), null);
    assert.equal(parseColWidth('abc'), null);
    const cols = resolveColumns(getTemplate('team-boards').columns, [{ key: 'homeRoster', width: '8%' }]);
    assert.equal(cols.find((c) => c.key === 'homeRoster').width, '8%');
  });
  test('úzké sloupce se přizpůsobí obsahu (data-fit), protějšky a vlastní šířka', async () => {
    const { partnerKey } = await import('../js/layout.js');
    assert.equal(partnerKey('homeRoster'), 'awayRoster');
    assert.equal(partnerKey('wNo'), 'bNo');
    assert.equal(partnerKey('board'), null);
    const p = defaultProfile();
    p.templates['team-boards'] = { columns: [{ key: 'awayRoster', width: 15 }] };
    const doc = buildDocument({ tpl: getTemplate('team-boards'), info: team.info, data: team.data, profile: p, round: 3 });
    const cg = doc.blocks.find((b) => b.type === 'table').colgroup;
    assert.match(cg, /data-key="homeRoster" data-fit="1"/);
    assert.match(cg, /style="width:15mm" data-key="awayRoster">/); // vlastní šířka se nepřizpůsobuje
    assert.match(cg, /data-key="result" data-fit="1" data-min="5.5"/); // k zápisu: nejmenší šířka
  });
});

describe('křížová tabulka (každý s každým)', () => {
  const info = parseInfo(fixture('rr-main'));
  const players = parseStartList(fixture('rr-main')).players;
  const xt = parseRanking(fixture('rr-crosstable'));
  test('jen u turnaje každý s každým', () => {
    assert.ok(templatesFor(info).some((t) => t.id === 'crosstable'));
    assert.ok(!templatesFor(swiss.info).some((t) => t.id === 'crosstable'));
  });
  test('podle pořadí: sloupce 1…N, úhlopříčka, výsledky souhlasí', async () => {
    const doc = buildDocument({ tpl: getTemplate('crosstable'), info, data: { main: { players }, crosstable: xt }, profile: defaultProfile() });
    const t = doc.blocks[0];
    const n = xt.rows.length;
    for (let j = 1; j <= n; j++) assert.match(t.thead, new RegExp(`>${j}</th>`));
    assert.equal((t.rows.join('').match(/ diag"/g) || []).length, n);
    // 1. řádek (Titov) proti 4. (Shabanov): 1
    const { crossMatrix } = await import('../js/templates/crosstable.js');
    const m = crossMatrix(xt, players, 'rank');
    assert.equal(m.cells[0][3], '1');
    assert.equal(m.cells[3][0], '0');
    assert.equal(m.cells[2][2], '*');
  });
  test('podle startovních čísel se přeskládají řádky i sloupce; prázdná k vyplnění', async () => {
    const { crossMatrix } = await import('../js/templates/crosstable.js');
    const byRank = crossMatrix(xt, players, 'rank');
    const bySno = crossMatrix(xt, players, 'startNo');
    assert.deepEqual(bySno.players.map((p) => p.startNo), [...bySno.players.map((p) => p.startNo)].sort((a, b) => a - b));
    const a = byRank.players[0]; const b = byRank.players[3];
    const ia = bySno.players.findIndex((p) => p.startNo === a.startNo);
    const ib = bySno.players.findIndex((p) => p.startNo === b.startNo);
    assert.equal(bySno.cells[ia][ib], byRank.cells[0][3]);
    const p = defaultProfile();
    p.templates.crosstable = { options: { results: false } };
    const doc = buildDocument({ tpl: getTemplate('crosstable'), info, data: { main: { players }, crosstable: xt }, profile: p });
    assert.doesNotMatch(doc.blocks[0].rows.join(''), /<td class="c xt">(1|0|½)<\/td>/);
    assert.doesNotMatch(doc.blocks[0].thead, />Body</);
  });
  test('před turnajem: prázdná tabulka ze startovní listiny', () => {
    const doc = buildDocument({ tpl: getTemplate('crosstable'), info, data: { main: { players } }, profile: defaultProfile() });
    assert.equal(doc.blocks[0].rows.length, players.length);
    assert.ok(doc.warnings.length);
  });
});

describe('vyhlášení výsledků', () => {
  test('nejlepší 3 celkově a v kategoriích z „Pořadí + kategorie“', () => {
    const p = defaultProfile();
    const players = swiss.data.main.players.map((x, i) => ({ ...x, type: i % 3 === 0 ? 'U16' : '' }));
    p.templates['ranking-cat'] = { options: { categories: [{ name: 'Do 16 let', types: ['U16'] }, { name: 'Vypnutá', types: ['U16'], on: false }, { name: 'Nad 65', types: ['S65'] }] } };
    const doc = buildDocument({ tpl: getTemplate('awards'), info: swiss.info, data: { main: { players }, ranking: swiss.data.ranking }, profile: p, round: 6 });
    const titles = doc.blocks.filter((b) => b.type === 'html').map((b) => b.html.replace(/<[^>]+>/g, '').trim());
    assert.deepEqual(titles, ['Celkové pořadí', 'Do 16 let']); // prázdná „Nad 65“ se vynechá
    assert.ok(doc.warnings.some((w) => /Nad 65/.test(w)));
    const tables = doc.blocks.filter((b) => b.type === 'table');
    assert.ok(tables.every((t) => t.rows.length === 3 && t.keepTogether));
    assert.match(tables[0].rows[0], /<td class="c num strong">1\.<\/td>/);
    assert.equal(templateSettings(p, getTemplate('awards')).fontMode, 'page');
  });
});

describe('nejlepší na šachovnicích (družstva, Board list)', () => {
  const doc = fixture('team-boardlist');
  const bl = parseBoardList(doc);

  test('parser: šachovnice, dělená místa, pomocná hodnocení, kolo', () => {
    assert.equal(detectPageKind(doc), 'boardList');
    assert.deepEqual(bl.boards.map((b) => [b.board, b.rows.length]), [[1, 5], [2, 5], [3, 6], [4, 7]]);
    assert.equal(bl.final, true);
    assert.equal(bl.round, 5);
    assert.deepEqual(bl.tiebreaks.map((t) => t.label), ['points (game-points)', 'Games ascending (Less is better)', 'Performance (variable with parameter)']);
    const b4 = bl.boards[3].rows;
    assert.deepEqual(b4.slice(0, 4).map((r) => [r.rank, r.tie]), [[1, false], [1, true], [3, false], [3, true]]);
    assert.equal(b4[2].tb[0], '1,5');
    assert.equal(bl.boards[0].rows[0].rating, null); // Rtg 0 = bez ratingu
    assert.equal(bl.boards[0].rows[0].team, 'ZŠ Vzorová A');
  });

  test('výstup: šachovnice jako oddíly, body s ½, české názvy hodnocení, jen první místa', () => {
    const tpl = getTemplate('team-board-best');
    assert.ok(tpl.supports({ isTeam: true }) && !tpl.supports({ isTeam: false }));
    const info = { tnr: 1464724, title: 'Turnaj', isTeam: true, groups: [] };
    const doc1 = buildDocument({ tpl, info, data: { boardList: bl }, profile: defaultProfile(), round: null });
    assert.equal(doc1.title, 'Nejlepší hráči na šachovnicích – konečné pořadí');
    const titles = doc1.blocks.filter((b) => /sec-title/.test(b.html || '')).map((b) => b.html.replace(/<[^>]+>/g, ''));
    assert.deepEqual(titles, ['1. šachovnice', '2. šachovnice', '3. šachovnice', '4. šachovnice']);
    const tables = doc1.blocks.filter((b) => b.type === 'table');
    assert.match(tables[0].thead, />Body<.*>Partie<.*>Výkon</);
    assert.doesNotMatch(tables[0].thead, />Elo</); // bez ratingu
    assert.ok(tables.every((t) => t.keepTogether));
    assert.match(tables[3].rows[2], />1½</);
    assert.match(doc1.blocks.at(-1).html, /méně je lépe/);
    const p = defaultProfile();
    p.templates['team-board-best'] = { options: { places: '1', boardPerPage: true } };
    const doc2 = buildDocument({ tpl, info, data: { boardList: bl }, profile: p, round: null });
    const t2 = doc2.blocks.filter((b) => b.type === 'table');
    assert.deepEqual(t2.map((t) => t.rows.length), [1, 1, 1, 2]); // dělené 1. místo na 4. šachovnici
    assert.equal(doc2.blocks.filter((b) => b.breakBefore).length, 3);
    const empty = buildDocument({ tpl, info, data: {}, profile: p, round: null });
    assert.match(empty.warnings[0], /Board list/);
  });
});

describe('záhlaví a zápatí: nadpis na více řádků, loga, sponzoři, vodoznak', () => {
  const info = { tnr: 1, title: 'Okresní kolo přeboru škol kategorie A', groups: [{ tnr: 1, name: 'kat. A', current: true }, { tnr: 2, name: 'kat. B' }] };
  const logo = (c) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="${c}"/></svg>`)}`;
  const tpl = getTemplate('startlist');
  const data = { main: { players: [{ startNo: 1, name: 'Novák Jan' }] } };

  test('nadpis na 2 řádky, {skupina}, menší 2. řádek', () => {
    const p = defaultProfile();
    p.header.title = 'Okresní kolo přeboru škol\n{skupina}';
    p.header.titleLines = 'second-smaller';
    const hd = buildDocument({ tpl, info, data, profile: p, round: null }).layout.header;
    assert.match(hd, /<span class="hd-title-line">Okresní kolo přeboru škol<\/span><span class="hd-title-line small">kat\. A<\/span>/);
    p.header.title = '{turnaj}';
    assert.match(buildDocument({ tpl, info, data, profile: p, round: null }).layout.header, /<div class="hd-title">Okresní kolo přeboru škol kategorie A<\/div>/);
  });

  test('více log vlevo i vpravo', () => {
    const p = defaultProfile();
    p.header.logos = [{ src: logo('red'), height: 20, position: 'left' }, { src: logo('blue'), height: 12, position: 'right', gray: false }, { src: logo('green'), height: 12, position: 'right', gray: true }];
    const hd = buildDocument({ tpl, info, data, profile: p, round: null }).layout.header;
    const [left, right] = hd.split('hd-main');
    assert.equal((left.match(/<img class="logo gray"/g) || []).length, 1); // bez volby = černobíle
    assert.match(left, /height:20mm/);
    assert.equal((right.match(/<img class="logo[ "]/g) || []).length, 2);
    assert.equal((right.match(/<img class="logo gray"/g) || []).length, 1); // barevné logo bez filtru
  });

  test('sponzoři v zápatí', () => {
    const p = defaultProfile();
    p.footer.enabled = true;
    p.footer.sponsorsText = 'Děkujeme partnerům:';
    p.footer.sponsors = Array.from({ length: 10 }, (_, i) => ({ src: logo('red'), height: 8, gray: i > 0 }));
    const ft = buildDocument({ tpl, info, data, profile: p, round: null }).layout.footer(1, 2);
    assert.match(ft, /^<div class="ft-sponsors"><span class="ft-thanks">Děkujeme partnerům:<\/span><img class="ft-logo"[^>]*height:8mm/);
    assert.equal((ft.match(/<img class="ft-logo/g) || []).length, 10);
    assert.equal((ft.match(/<img class="ft-logo gray"/g) || []).length, 9);
    assert.match(ft, /<div class="ft-line">.*Strana 1 \/ 2/);
    p.footer.sponsors = [];
    p.footer.sponsorsText = '';
    assert.doesNotMatch(buildDocument({ tpl, info, data, profile: p, round: null }).layout.footer(1, 1), /ft-sponsors/);
  });

  test('vodoznak z profilu; výstup ho může vypnout; lístky ho nemají', () => {
    const p = defaultProfile();
    assert.equal(buildDocument({ tpl, info, data, profile: p, round: null }).layout.watermark, null);
    p.page.watermark = { src: logo('red'), opacity: 12, color: 'gray', size: 60 };
    assert.deepEqual(buildDocument({ tpl, info, data, profile: p, round: null }).layout.watermark, p.page.watermark);
    p.templates.startlist = { watermark: 'off' };
    assert.equal(buildDocument({ tpl, info, data, profile: p, round: null }).layout.watermark, null);
    const slips = getTemplate('scoresheets');
    assert.equal(buildDocument({ tpl: slips, info, data: { ...data, pairings: { rounds: [] } }, profile: p, round: 1 }).layout.watermark, null);
  });
});

describe('švýcar jednotlivců hodnocený do družstev: pořadí škol (art=72) a soupisky s výsledky (art=71)', () => {
  const info = parseInfo(fixture('club-main'));
  const ranking = parseClubRanking(fixture('club-ranking'));
  const composition = parseTeamComposition(fixture('club-composition'));

  test('parser: družstva se započítanými hráči, pomocná hodnocení; soupisky s 7 koly', () => {
    assert.equal(detectPageKind(fixture('club-ranking')), 'clubRanking');
    assert.equal(detectPageKind(fixture('club-composition')), 'teamComposition');
    assert.equal(ranking.teams.length, 15);
    const t = ranking.teams[0];
    assert.deepEqual([t.rank, t.points, t.tb, t.players.length], [1, 21, ['1', '104', '113'], 4]);
    assert.deepEqual(t.players.map((p) => p.no), [1, 2, 3, 4]);
    assert.equal(t.players[1].points, 5.5);
    assert.equal(ranking.tiebreaks.length, 3);
    assert.match(ranking.tiebreaks[1].label, /Buchholz/);
    assert.equal(composition.teams.length, 15);
    assert.equal(composition.rounds, 7);
    const p = composition.teams[1].players[0];
    assert.deepEqual([p.board, p.rating, p.ratingNat, p.results, p.points, p.games], [1, 1635, 1355, ['1', '1', '1', '0', '1', '0', '1'], 5, 7]);
    assert.equal(composition.teams[0].no, 1);
    assert.doesNotMatch(composition.teams[0].name, /RtgAvg|\(/);
  });

  test('výstupy se nabízejí jen u švýcaru jednotlivců, který stránky má', () => {
    assert.ok(getTemplate('club-ranking').supports(info));
    assert.ok(getTemplate('team-composition').supports(info));
    assert.ok(!getTemplate('club-ranking').supports(swiss.info));
    assert.ok(!getTemplate('team-composition').supports(team.info));
  });

  test('pořadí škol: řádek školy + hráči, dělení jen na hranicích škol, počet míst, bez hráčů', () => {
    const tpl = getTemplate('club-ranking');
    const doc = buildDocument({ tpl, info, data: { clubRanking: ranking }, profile: defaultProfile(), round: null });
    assert.equal(doc.title, 'Pořadí škol');
    const tb = doc.blocks[0];
    assert.match(tb.thead, />Škola \/ hráč</);
    assert.match(tb.thead, />PH1<.*>PH2<.*>PH3</);
    assert.equal(tb.rows.length, 15 + ranking.teams.reduce((n, t) => n + t.players.length, 0));
    assert.ok(tb.splitAt.every((i) => /class="club-team"/.test(tb.rows[i])));
    assert.match(tb.rows[1], /class="club-member"/);
    assert.match(tb.rows[2], />5½</);
    const p = defaultProfile();
    p.templates['club-ranking'] = { options: { places: '3', players: false, heading: 'clubs' } };
    const d2 = buildDocument({ tpl, info, data: { clubRanking: ranking }, profile: p, round: null });
    assert.equal(d2.title, 'Pořadí klubů');
    assert.equal(d2.blocks[0].rows.length, 3);
    assert.match(d2.blocks[0].thead, />Klub</);
  });

  test('pořadí škol: všichni hráči družstva – nezapočítaní ze soupisek, šedě a podle bodů', () => {
    const tpl = getTemplate('club-ranking');
    const p = defaultProfile();
    p.templates['club-ranking'] = { options: { players: 'all' } };
    assert.deepEqual(datasetsFor(tpl, info, null, { players: 'all' }).map((x) => x.dataset), ['clubRanking', 'teamComposition']);
    assert.deepEqual(datasetsFor(tpl, info, null, { players: 'counted' }).map((x) => x.dataset), ['clubRanking']);
    const doc = buildDocument({ tpl, info, data: { clubRanking: ranking, teamComposition: composition }, profile: p, round: null });
    const rows = doc.blocks[0].rows;
    const total = ranking.teams.reduce((n, t) => n + Math.max(t.players.length, composition.teams.find((c) => c.name === t.name)?.players.length || 0), 0);
    assert.equal(rows.length, 15 + total);
    // 1. škola má v soupisce 6 hráčů: 4 započítaní + 2 šedě
    const first = rows.slice(1, rows.findIndex((r, i) => i > 0 && /club-team/.test(r)));
    assert.equal(first.length, composition.teams.find((c) => c.name === ranking.teams[0].name).players.length);
    assert.equal(first.filter((r) => /club-extra/.test(r)).length, first.length - 4);
    assert.ok(first.slice(0, 4).every((r) => !/club-extra/.test(r)));
    assert.match(doc.blocks.at(-1).html, /Šedě: hráči, kteří se do pořadí družstva nezapočítávají/);
    // bez soupisek: jen započítaní + upozornění
    const d2 = buildDocument({ tpl, info, data: { clubRanking: ranking }, profile: p, round: null });
    assert.equal(d2.blocks[0].rows.filter((r) => /club-extra/.test(r)).length, 0);
    assert.match(d2.warnings.join(' '), /jen hráči, kteří se započítávají/);
    // dřívější uložená volba (zaškrtávátko) dál funguje
    p.templates['club-ranking'] = { options: { players: true } };
    assert.equal(buildDocument({ tpl, info, data: { clubRanking: ranking }, profile: p, round: null }).blocks[0].rows.length, 15 + ranking.teams.reduce((n, t) => n + t.players.length, 0));
  });

  test('pořadí škol: podbarvení řádků škol jde vypnout', () => {
    const tpl = getTemplate('club-ranking');
    const p = defaultProfile();
    const rows = () => buildDocument({ tpl, info, data: { clubRanking: ranking }, profile: p, round: null }).blocks[0].rows;
    assert.ok(rows().filter((r) => /club-team/.test(r)).every((r) => !/club-plain/.test(r)));
    p.templates['club-ranking'] = { options: { shade: false, players: 'none' } };
    const r = rows();
    assert.equal(r.length, 15);
    assert.ok(r.every((x) => /class="club-team club-plain"/.test(x)));
  });

  test('soupisky s výsledky: sloupce kol 1–7, každé družstvo zvlášť se stejnými šířkami', () => {
    const tpl = getTemplate('team-composition');
    const doc = buildDocument({ tpl, info, data: { teamComposition: composition }, profile: defaultProfile(), round: null });
    assert.equal(doc.title, 'Soupisky škol s výsledky kol');
    const tables = doc.blocks.filter((b) => b.type === 'table');
    assert.equal(tables.length, 15);
    assert.ok(tables.every((t) => t.widthGroup === 'teams' && t.keepTogether));
    assert.match(tables[0].thead, />1<\/th><th[^>]*>2<.*>7<\/th><th[^>]*>Body</);
    assert.match(tables[1].rows[0], />½<|>1</);
    const titles = doc.blocks.filter((b) => /sec-title/.test(b.html || '')).map((b) => b.html.replace(/<small>.*<\/small>/, '').replace(/<[^>]+>/g, '').trim());
    assert.equal(titles[0], `1. ${composition.teams[0].name}`);
    const p = defaultProfile();
    p.templates['team-composition'] = { options: { teamOrder: 'alpha', teamPerPage: true } };
    const d2 = buildDocument({ tpl, info, data: { teamComposition: composition }, profile: p, round: null });
    const t2 = d2.blocks.filter((b) => /sec-title/.test(b.html || '')).map((b) => b.html.replace(/<small>.*<\/small>/, '').replace(/<[^>]+>/g, '').trim());
    assert.deepEqual(t2, [...t2].sort((a, b) => a.localeCompare(b, 'cs')));
    assert.equal(d2.blocks.filter((b) => b.breakBefore).length, 14);
  });

  test('sazba: tabulka se splitAt se dělí jen před skupinou řádků', () => {
    const rows = Array.from({ length: 10 }, (_, i) => `<tr><td>${i}</td></tr>`);
    const m = [{ b: { type: 'table', rows, splitAt: [0, 4, 8] }, h: 110, theadH: 10, rowH: rows.map(() => 10), extra: 0 }];
    // stránka pojme hlavičku + 5 řádků: bez splitAt by se dělilo po 5 řádcích (0–5, 5–10)
    const pages = pack(m, { capFirst: 65, capOther: 65, columns: 1 });
    const pieces = pages.flatMap((pg) => pg.flatMap((c) => c.map((it) => [it.from, it.to])));
    assert.deepEqual(pieces, [[0, 4], [4, 8], [8, 10]]);
  });
});

test('šířky sloupců min. / max.: zúžení na obsah, přebytek sloupci „max.“, ruční šířka má přednost', async () => {
  const { colgroup } = await import('../js/templates/common.js');
  const defs = [
    { key: 'no', label: 'č.', cls: 'c num', width: '2.6em', get: () => '' },
    { key: 'name', label: 'Jméno', cls: 'name', get: () => '' },
    { key: 'club', label: 'Klub', cls: 'club', get: () => '' },
  ];
  const by = (cols) => Object.fromEntries(cols.map((c) => [c.key, c]));
  let c = by(resolveColumns(defs, [{ key: 'club', fit: 'max' }]));
  assert.equal(c.club.grow, true);
  assert.equal(c.name.shrink, true); // bez pevné šířky → zúží se na obsah
  assert.match(c.name.cls, /col-shrink/);
  assert.equal(c.no.width, '2.6em'); // úzký sloupec s výchozí šířkou zůstává
  assert.match(colgroup(Object.values(c)), /data-key="name" style="width:1%" data-fit="1"/);
  c = by(resolveColumns(defs, [{ key: 'name', fit: 'min' }]));
  assert.equal(c.name.shrink, true);
  assert.equal(c.club.shrink, undefined); // bez „max.“ si přebytek rozdělí ostatní
  c = by(resolveColumns(defs, [{ key: 'name', fit: 'min', width: 50 }, { key: 'club', fit: 'max' }]));
  assert.equal(c.name.shrink, undefined);
  assert.equal(c.name.userWidth, 50);
  assert.equal(by(resolveColumns(defs, [{ key: 'name', fit: 'nesmysl' }])).name.fit, undefined);
});

test('pevná velikost záhlaví: nadpis turnaje v zadaných pt, nezávisle na písmu výstupu', async () => {
  const { fixedHeaderSize } = await import('../js/render.js');
  const p = defaultProfile();
  const tpl = getTemplate('startlist');
  const plain = buildDocument({ tpl, info: swiss.info, data: swiss.data, profile: p, round: null }).layout.header;
  assert.doesNotMatch(plain, /hd-fixed/);
  p.header.fontSize = 15.5;
  p.header.align = 'left';
  const hd = buildDocument({ tpl, info: swiss.info, data: swiss.data, profile: p, round: null }).layout.header;
  assert.match(hd, /^<div class="hd-fixed" style="font-size:10\.00pt">/); // nadpis = 1,55 × 10 pt = 15,5 pt
  assert.match(fixedHeaderSize('<b>x</b>', { fontSize: 17, align: 'center' }), /font-size:10\.00pt/);
  assert.equal(fixedHeaderSize(null, { fontSize: 17 }), null);
  assert.equal(fixedHeaderSize('<b>x</b>', {}), '<b>x</b>');
});

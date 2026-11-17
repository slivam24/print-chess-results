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
  test('abecední seznam: sloupce Č., St.č., titul, Jméno, RtgN, RtgF, FED, Klub a pořadová čísla', () => {
    const info = parseInfo(fixture('categories-main'));
    const sl = parseStartList(fixture('categories-main'));
    const doc = buildDocument({ tpl: getTemplate('alphalist'), info, data: { main: { players: sl.players, ratingInfo: sl.ratingInfo } }, profile: defaultProfile() });
    const head = doc.blocks[0].thead.replace(/<[^>]+>/g, '|').split('|').filter(Boolean);
    assert.deepEqual(head, ['Č.', 'St.č.', 'Jméno', 'RtgN', 'RtgF', 'FED', 'Klub']);
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
  test('styl mřížky a centrovaný nadpis jsou výchozí, pruhy lze zvolit', () => {
    const p = defaultProfile();
    const doc = buildDocument({ tpl: getTemplate('startlist'), info: swiss.info, data: swiss.data, profile: p });
    assert.match(doc.layout.docClass, /tbl-grid/);
    assert.match(doc.layout.header, /hd-bar[^"]*center/);
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
    assert.match(t.colgroup, /<col style="width:12mm">/);
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
});

describe('symetrické šířky sloupců v tabulkách s dvojicemi', () => {
  const widthsOf = (block) => [...block.colgroup.matchAll(/<col(?: style="width:([^"]+)")?>/g)].map((m) => m[1] || 'auto');
  const keysOf = (block) => [...block.thead.matchAll(/<th class="[^"]*">([^<]*)<\/th>/g)].map((m) => m[1]);
  test('los kola: protějškové sloupce mají stejnou šířku, jména se dělí o zbytek', () => {
    const doc = buildDocument({ tpl: getTemplate('pairings'), info: swiss.info, data: swiss.data, profile: defaultProfile(), round: 7 });
    const t = doc.blocks[0];
    assert.match(t.className, /\bsym\b/);
    const w = widthsOf(t);
    const k = keysOf(t);
    // levá strana (bez čísla šachovnice) má stejné šířky jako pravá
    const mid = k.indexOf('Výsledek');
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
    p.templates['ranking-cat'] = { options: opts };
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


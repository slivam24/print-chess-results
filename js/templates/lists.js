// Startovní listina a pořadí (jednotlivci i družstva).

import {
  esc, fmtName, fmtRating, fmtPoints, theadRow, colgroup, bodyRow, collator,
  sectionTitle, noteBlock, playerIndex, pruneEmpty,
} from './common.js';

// ---------------------------------------------------------------------------
// Kategorie (sloupec „Gr“/„Typ“ ve startovní listině)
// ---------------------------------------------------------------------------

export function categoriesOf(players) {
  const set = new Set();
  for (const p of players || []) if (p.group) set.add(p.group);
  return [...set].sort((a, b) => collator.compare(a, b));
}

const categoryOption = {
  key: 'category',
  label: 'Kategorie',
  type: 'category',
  def: '',
  help: 'Prázdné = všichni; „každá zvlášť“ vytiskne každou kategorii jako samostatný oddíl.',
};

/** Rozdělí položky podle kategorie dle volby. */
function byCategory(items, catOf, choice) {
  if (!choice) return [{ name: null, items }];
  if (choice === '*split*') {
    const groups = new Map();
    for (const it of items) {
      const c = catOf(it) || 'bez kategorie';
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c).push(it);
    }
    return [...groups.entries()].sort((a, b) => collator.compare(a[0], b[0])).map(([name, list]) => ({ name, items: list }));
  }
  return [{ name: choice, items: items.filter((it) => catOf(it) === choice) }];
}

// ---------------------------------------------------------------------------
// Startovní listina jednotlivců
// ---------------------------------------------------------------------------

const START_COLUMNS = [
  { key: 'startNo', label: 'č.', cls: 'c num', width: '2.6em', get: (p) => esc(p.startNo ?? '') },
  { key: 'title', hideEmpty: true, label: 'Tit.', cls: 'c title', width: '2.8em', get: (p) => esc(p.title) },
  { key: 'name', label: 'Jméno', cls: 'name', get: (p, ctx) => esc(fmtName(p.name, ctx.nameFormat)) },
  { key: 'fideId', hideEmpty: true, label: 'FIDE ID', cls: 'r num muted', def: false, get: (p) => esc(p.fideId ?? '') },
  { key: 'fed', hideEmpty: true, label: 'Fed', cls: 'c', width: '3em', get: (p) => esc(p.fed) },
  { key: 'rating', hideEmpty: true, label: 'Elo', cls: 'r num', width: '3.2em', get: (p) => fmtRating(p.rating) },
  { key: 'ratingNat', hideEmpty: true, label: 'Elo nár.', cls: 'r num', width: '3.6em', get: (p) => fmtRating(p.ratingNat) },
  { key: 'group', hideEmpty: true, label: 'Kat.', cls: 'c', def: false, get: (p) => esc(p.group) },
  { key: 'club', hideEmpty: true, label: 'Klub', cls: 'club', get: (p) => esc(p.club) },
];

function sortPlayers(list, how) {
  const a = [...list];
  if (how === 'alpha') a.sort((x, y) => collator.compare(x.name, y.name));
  else if (how === 'rating') a.sort((x, y) => (y.rating || 0) - (x.rating || 0) || (x.startNo || 0) - (y.startNo || 0));
  else a.sort((x, y) => (x.startNo || 0) - (y.startNo || 0));
  return a;
}

export const startList = {
  id: 'startlist',
  name: 'Startovní listina',
  description: 'Hráči podle startovních čísel (nebo ratingu).',
  group: 'Seznamy',
  supports: (info) => !info.isTeam,
  roundMode: null,
  options: [
    { key: 'sort', label: 'Řazení', type: 'select', def: 'startNo', choices: [['startNo', 'podle startovních čísel'], ['rating', 'podle ratingu'], ['alpha', 'abecedně']] },
    categoryOption,
  ],
  columns: START_COLUMNS,
  defaults: { orientation: 'portrait', columns: 1 },
  needs: () => [{ dataset: 'main' }],
  render({ data, opts, cols: allCols, nameFormat }) {
    const players = data.main?.players || [];
    const ctx = { nameFormat };
    const cols = ratingLabels(pruneEmpty(allCols, players, ctx), START_COLUMNS, data.main?.ratingInfo);
    const blocks = [];
    const parts = byCategory(sortPlayers(players, opts.sort), (p) => p.group, opts.category);
    for (const part of parts) {
      if (part.name && parts.length > 1) blocks.push(sectionTitle(part.name, `${part.items.length} hráčů`));
      blocks.push({ type: 'table', className: 'grid startlist', colgroup: colgroup(cols), thead: theadRow(cols), rows: part.items.map((p) => bodyRow(cols, p, ctx)) });
    }
    if (!players.length) blocks.push(noteBlock('Startovní listina je prázdná.'));
    const sub = `${players.length} hráčů${opts.category && opts.category !== '*split*' ? ` · kategorie ${opts.category}` : ''}`;
    return { title: opts.sort === 'alpha' ? 'Startovní listina – abecedně' : 'Startovní listina', sub, blocks, warnings: [] };
  },
};

// ---------------------------------------------------------------------------
// Abecední seznam hráčů (tiskne se před turnajem vedle startovní listiny)
// ---------------------------------------------------------------------------

const ALPHA_COLUMNS = [
  { key: 'rowNo', label: 'Č.', cls: 'c num', width: '2.6em', get: (p) => esc(p.rowNo ?? '') },
  { key: 'startNo', label: 'St.č.', cls: 'c num', width: '3.2em', get: (p) => esc(p.startNo ?? '') },
  { key: 'title', hideEmpty: true, label: '', cls: 'c title', width: '2.8em', get: (p) => esc(p.title) },
  { key: 'name', label: 'Jméno', cls: 'name', get: (p, ctx) => esc(fmtName(p.name, ctx.nameFormat)) },
  { key: 'ratingNat', hideEmpty: true, label: 'NRtg', cls: 'r num', width: '3.4em', get: (p) => fmtRating(p.ratingNat) },
  { key: 'rating', hideEmpty: true, label: 'IRtg', cls: 'r num', width: '3.4em', get: (p) => fmtRating(p.rating) },
  { key: 'fed', hideEmpty: true, label: 'FED', cls: 'c', width: '3em', get: (p) => esc(p.fed) },
  { key: 'club', hideEmpty: true, label: 'Klub', cls: 'club', get: (p) => esc(p.club) },
  { key: 'fideId', hideEmpty: true, label: 'FIDE ID', cls: 'r num muted', def: false, get: (p) => esc(p.fideId ?? '') },
  { key: 'group', hideEmpty: true, label: 'Kat.', cls: 'c', def: false, get: (p) => esc(p.group) },
];

/**
 * Popisek sloupce s ratingem podle toho, co chess-results uvádí: když je jen obecný „Rtg“,
 * nevíme, zda jde o mezinárodní rating, a nadpis „IRtg“ by klamal. Vlastní nadpis z profilu má přednost.
 */
export function ratingLabels(cols, defs, ratingInfo) {
  if (!ratingInfo || ratingInfo.international || !ratingInfo.generic) return cols;
  const def = defs.find((d) => d.key === 'rating');
  return cols.map((c) => (c.key === 'rating' && def && c.label === def.label ? { ...c, label: 'Rtg' } : c));
}

export const alphaList = {
  id: 'alphalist',
  name: 'Abecední seznam hráčů',
  description: 'Hráči podle abecedy se startovním číslem – jako abecední seznam ve Swiss-Manageru.',
  group: 'Seznamy',
  supports: (info) => !info.isTeam,
  roundMode: null,
  options: [categoryOption],
  columns: ALPHA_COLUMNS,
  defaults: { orientation: 'portrait', columns: 1 },
  needs: () => [{ dataset: 'main' }],
  render({ data, opts, cols: allCols, nameFormat }) {
    const players = data.main?.players || [];
    const ctx = { nameFormat };
    const cols = ratingLabels(pruneEmpty(allCols, players, ctx), ALPHA_COLUMNS, data.main?.ratingInfo);
    const blocks = [];
    const parts = byCategory(sortPlayers(players, 'alpha'), (p) => p.group, opts.category);
    for (const part of parts) {
      if (part.name && parts.length > 1) blocks.push(sectionTitle(part.name, `${part.items.length} hráčů`));
      const rows = part.items.map((p, i) => ({ ...p, rowNo: i + 1 }));
      blocks.push({ type: 'table', className: 'grid startlist', colgroup: colgroup(cols), thead: theadRow(cols), rows: rows.map((p) => bodyRow(cols, p, ctx)) });
    }
    if (!players.length) blocks.push(noteBlock('Seznam hráčů je prázdný.'));
    const sub = opts.category && opts.category !== '*split*' ? `kategorie ${opts.category}` : '';
    return { title: 'Abecední seznam', sub, blocks, warnings: [] };
  },
};

// ---------------------------------------------------------------------------
// Pořadí jednotlivců
// ---------------------------------------------------------------------------

const TB_KEYS = [1, 2, 3, 4, 5, 6];

const RANK_COLUMNS = [
  { key: 'rank', label: 'Poř.', cls: 'c num strong', width: '2.8em', get: (r) => esc(r.rankShown ?? r.rank ?? '') },
  { key: 'startNo', label: 'č.', cls: 'c num muted', width: '2.6em', get: (r) => esc(r.startNo ?? '') },
  { key: 'title', hideEmpty: true, label: 'Tit.', cls: 'c title', width: '2.8em', get: (r) => esc(r.title) },
  { key: 'name', label: 'Jméno', cls: 'name', get: (r, ctx) => esc(fmtName(r.name, ctx.nameFormat)) },
  { key: 'fed', hideEmpty: true, label: 'Fed', cls: 'c', width: '3em', def: false, get: (r) => esc(r.fed) },
  { key: 'rating', hideEmpty: true, label: 'Elo', cls: 'r num', width: '3.2em', get: (r) => fmtRating(r.rating) },
  { key: 'ratingNat', hideEmpty: true, label: 'Elo nár.', cls: 'r num', def: false, get: (r) => fmtRating(r.ratingNat) },
  { key: 'group', hideEmpty: true, label: 'Kat.', cls: 'c', def: false, get: (r) => esc(r.group) },
  { key: 'club', hideEmpty: true, label: 'Klub', cls: 'club', get: (r) => esc(r.club) },
  { key: 'points', label: 'Body', cls: 'c num strong', width: '3em', get: (r) => fmtPoints(r.points) },
  ...TB_KEYS.map((i) => ({ key: `tb${i}`, label: `PH${i}`, cls: 'c num', width: '3em', tb: i, get: (r) => esc(r.tb?.[i - 1] ?? '') })),
];

function tbLegend(tiebreaks) {
  const items = tiebreaks.filter((t) => t.label).map((t, i) => `<span><b>PH${i + 1}</b>: ${esc(t.label)}</span>`);
  return items.length ? { type: 'html', html: `<div class="legend">${items.join('')}</div>` } : null;
}

export const ranking = {
  id: 'ranking',
  name: 'Pořadí',
  description: 'Pořadí po zvoleném kole s body a pomocnými hodnoceními.',
  group: 'Seznamy',
  supports: (info) => !info.isTeam,
  roundMode: 'ranking',
  options: [
    categoryOption,
    { key: 'legend', label: 'Vysvětlivky pomocných hodnocení', type: 'bool', def: true },
  ],
  columns: RANK_COLUMNS,
  defaults: { orientation: 'portrait', columns: 1 },
  needs: ({ round }) => [{ dataset: 'main' }, { dataset: 'ranking', round }],
  render({ info, data, round, opts, cols, nameFormat }) {
    const rk = data.ranking || { rows: [], tiebreaks: [] };
    const idx = playerIndex(data.main?.players);
    const rows = rk.rows.map((r) => {
      const p = r.startNo != null ? idx.get(r.startNo) : null;
      return p ? { ...r, group: r.group || p.group, club: r.club || p.club, title: r.title || p.title, fed: r.fed || p.fed, ratingNat: r.ratingNat ?? p.ratingNat } : r;
    });
    const tbCount = rk.tiebreaks.length;
    const ctx = { nameFormat };
    const usable = pruneEmpty(cols.filter((c) => !c.tb || c.tb <= tbCount), rows, ctx);
    const blocks = [];
    const parts = byCategory(rows, (r) => r.group, opts.category);
    for (const part of parts) {
      if (part.name && parts.length > 1) blocks.push(sectionTitle(part.name));
      const list = part.name ? part.items.map((r, i) => ({ ...r, rankShown: i + 1 })) : part.items;
      blocks.push({ type: 'table', className: 'grid ranking', colgroup: colgroup(usable), thead: theadRow(usable), rows: list.map((r) => bodyRow(usable, r, ctx)) });
    }
    if (opts.legend !== false) {
      const lg = tbLegend(rk.tiebreaks);
      if (lg) blocks.push(lg);
    }
    const warnings = [];
    if (!rows.length) warnings.push(`Pořadí${round ? ` po ${round}. kole` : ''} zatím není na chess-results k dispozici.`);
    const r = rk.round || round;
    const title = rk.final ? 'Konečné pořadí' : r ? `Pořadí po ${r}. kole` : 'Pořadí';
    const sub = opts.category && opts.category !== '*split*' ? `kategorie ${opts.category}` : '';
    return { title, sub, blocks, warnings };
  },
};

// ---------------------------------------------------------------------------
// Družstva: tabulka a soupisky
// ---------------------------------------------------------------------------

const TEAM_RANK_COLUMNS = [
  { key: 'rank', label: 'Poř.', cls: 'c num strong', width: '2.8em', get: (r) => esc(r.rank ?? '') },
  { key: 'startNo', label: 'č.', cls: 'c num muted', width: '2.6em', def: false, get: (r) => esc(r.startNo ?? '') },
  { key: 'name', label: 'Družstvo', cls: 'name', get: (r) => esc(r.name) },
  { key: 'games', label: 'Záp.', cls: 'c num', width: '2.8em', get: (r) => esc(r.games ?? '') },
  { key: 'wins', label: '+', cls: 'c num', width: '2.2em', get: (r) => esc(r.wins ?? '') },
  { key: 'draws', label: '=', cls: 'c num', width: '2.2em', get: (r) => esc(r.draws ?? '') },
  { key: 'losses', label: '−', cls: 'c num', width: '2.2em', get: (r) => esc(r.losses ?? '') },
  ...TB_KEYS.slice(0, 5).map((i) => ({ key: `tb${i}`, label: `PH${i}`, cls: 'c num', width: '3.2em', tb: i, get: (r) => esc(r.tb?.[i - 1] ?? '') })),
];

export const teamRanking = {
  id: 'team-ranking',
  name: 'Pořadí družstev',
  description: 'Tabulka družstev s počtem zápasů, výher, remíz a proher.',
  group: 'Seznamy',
  supports: (info) => info.isTeam,
  roundMode: 'ranking',
  options: [{ key: 'legend', label: 'Vysvětlivky pomocných hodnocení', type: 'bool', def: true }],
  columns: TEAM_RANK_COLUMNS,
  defaults: { orientation: 'portrait', columns: 1 },
  needs: ({ round }) => [{ dataset: 'teamRanking', round }],
  render({ data, round, opts, cols }) {
    const rk = data.teamRanking || { rows: [], tiebreaks: [] };
    const usable = cols.filter((c) => !c.tb || c.tb <= rk.tiebreaks.length);
    const blocks = [{ type: 'table', className: 'grid ranking', colgroup: colgroup(usable), thead: theadRow(usable), rows: rk.rows.map((r) => bodyRow(usable, r, {})) }];
    if (opts.legend !== false) {
      const lg = tbLegend(rk.tiebreaks);
      if (lg) blocks.push(lg);
    }
    const r = rk.round || round;
    return {
      title: r ? `Pořadí družstev po ${r}. kole` : 'Pořadí družstev',
      sub: '',
      blocks,
      warnings: rk.rows.length ? [] : ['Tabulka družstev zatím není na chess-results k dispozici.'],
    };
  },
};

const ROSTER_COLUMNS = [
  { key: 'board', label: 'Š.', cls: 'c num', width: '2.4em', get: (p) => esc(p.board ?? '') },
  { key: 'title', hideEmpty: true, label: 'Tit.', cls: 'c title', width: '2.8em', get: (p) => esc(p.title) },
  { key: 'name', label: 'Jméno', cls: 'name', get: (p, ctx) => esc(fmtName(p.name, ctx.nameFormat)) },
  { key: 'fideId', hideEmpty: true, label: 'FIDE ID', cls: 'r num muted', def: false, get: (p) => esc(p.fideId ?? '') },
  { key: 'fed', hideEmpty: true, label: 'Fed', cls: 'c', width: '3em', get: (p) => esc(p.fed) },
  { key: 'rating', hideEmpty: true, label: 'Elo', cls: 'r num', width: '3.2em', get: (p) => fmtRating(p.rating) },
  { key: 'ratingNat', hideEmpty: true, label: 'Elo nár.', cls: 'r num', width: '3.6em', get: (p) => fmtRating(p.ratingNat) },
  { key: 'group', hideEmpty: true, label: 'Typ', cls: 'c', def: false, get: (p) => esc(p.group) },
];

export const teamRoster = {
  id: 'team-roster',
  name: 'Startovní listina družstev (soupisky)',
  description: 'Družstva se soupiskami hráčů v pořadí šachovnic.',
  group: 'Seznamy',
  supports: (info) => info.isTeam,
  roundMode: null,
  options: [
    { key: 'teamsOnly', label: 'Jen seznam družstev (bez hráčů)', type: 'bool', def: false },
    { key: 'teamPerPage', label: 'Každé družstvo na novou stránku', type: 'bool', def: false },
  ],
  columns: ROSTER_COLUMNS,
  defaults: { orientation: 'portrait', columns: 2 },
  needs: ({ opts }) => (opts && opts.teamsOnly ? [{ dataset: 'teams' }] : [{ dataset: 'teams' }, { dataset: 'teamPlayers' }]),
  render({ data, opts, cols: allCols, nameFormat }) {
    const teams = data.teams?.teams || [];
    const cols = pruneEmpty(allCols, data.teamPlayers?.players || [], { nameFormat });
    const players = data.teamPlayers?.players || [];
    const blocks = [];
    if (opts.teamsOnly || !players.length) {
      blocks.push({
        type: 'table',
        className: 'grid',
        thead: '<tr><th class="c">č.</th><th>Družstvo</th><th class="r">Ø Elo</th></tr>',
        rows: teams.map((t) => `<tr><td class="c num">${esc(t.no ?? '')}</td><td class="name">${esc(t.name)}</td><td class="r num">${fmtRating(t.ratingAvg)}</td></tr>`),
      });
    } else {
      const byTeam = new Map();
      for (const p of players) {
        if (!byTeam.has(p.team)) byTeam.set(p.team, []);
        byTeam.get(p.team).push(p);
      }
      const order = teams.length ? teams.map((t) => t.name) : [...byTeam.keys()];
      for (const name of order) byTeam.has(name) || byTeam.set(name, []);
      const ctx = { nameFormat };
      order.forEach((name, i) => {
        const t = teams.find((x) => x.name === name);
        const list = [...(byTeam.get(name) || [])].sort((a, b) => (Number(a.board) || 999) - (Number(b.board) || 999));
        blocks.push({ ...sectionTitle(`${t?.no ?? i + 1}. ${name}`, t?.ratingAvg ? `Ø Elo ${t.ratingAvg}` : ''), breakBefore: opts.teamPerPage && i > 0, columnBreakBefore: false });
        blocks.push({ type: 'table', className: 'grid roster', colgroup: colgroup(cols), thead: theadRow(cols), rows: list.map((p) => bodyRow(cols, p, ctx)) });
      });
    }
    return {
      title: opts.teamsOnly ? 'Seznam družstev' : 'Soupisky družstev',
      sub: `${teams.length || ''} družstev`.trim(),
      blocks,
      warnings: teams.length || players.length ? [] : ['Seznam družstev zatím není na chess-results k dispozici.'],
    };
  },
};

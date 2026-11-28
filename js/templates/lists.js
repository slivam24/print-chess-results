// Startovní listina a pořadí (jednotlivci i družstva).

import {
  esc, fmtName, fmtRating, fmtPoints, theadRow, colgroup, bodyRow, collator,
  sectionTitle, noteBlock, playerIndex, pruneEmpty,
} from './common.js';
import { parseNum } from '../parser/dom.js';

// ---------------------------------------------------------------------------
// Kategorie: sloupce „Typ“ (U16, S50, …) a „Gr“ (skupina) ze startovní listiny
// ---------------------------------------------------------------------------

/** Hodnoty kategorií hráče (typ i skupina). */
function catValues(p) {
  return [p.group, p.type].filter(Boolean);
}

export function categoriesOf(players) {
  const set = new Set();
  for (const p of players || []) for (const v of catValues(p)) set.add(v);
  return [...set].sort((a, b) => collator.compare(a, b));
}

/** Hodnoty pro editor kategorií: typy, skupiny a pohlaví, které se v turnaji vyskytují. */
export function categoryValues(players) {
  const out = { type: new Set(), group: new Set(), sex: new Set() };
  for (const p of players || []) for (const k of Object.keys(out)) if (p[k]) out[k].add(String(p[k]).trim());
  const sorted = (set) => [...set].filter(Boolean).sort((a, b) => collator.compare(a, b));
  return { type: sorted(out.type), group: sorted(out.group), sex: sorted(out.sex) };
}

const categoryOption = {
  key: 'category',
  label: 'Kategorie',
  type: 'category',
  def: '',
  help: 'Prázdné = všichni; „každá zvlášť“ vytiskne každou kategorii jako samostatný oddíl.',
};

/** Rozdělí položky podle kategorie dle volby. */
function byCategory(items, choice) {
  if (!choice) return [{ name: null, items }];
  if (choice === '*split*') {
    const groups = new Map();
    for (const it of items) {
      const c = catValues(it)[0] || 'bez kategorie';
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c).push(it);
    }
    return [...groups.entries()].sort((a, b) => collator.compare(a[0], b[0])).map(([name, list]) => ({ name, items: list }));
  }
  return [{ name: choice, items: items.filter((it) => catValues(it).includes(choice)) }];
}

/**
 * Patří hráč do vlastní kategorie? Kategorie = { types: [], groups: [], sex: [] }.
 * V rámci jednoho údaje stačí shoda s kteroukoli hodnotou (U16 nebo U12 nebo U10),
 * vyplněné údaje musí platit všechny (např. typ U16 a zároveň pohlaví ženy).
 */
export function inCategory(cat, p) {
  const dims = [['types', 'type'], ['groups', 'group'], ['sex', 'sex']]
    .filter(([k]) => Array.isArray(cat[k]) && cat[k].length);
  if (!dims.length) return false;
  return dims.every(([k, f]) => cat[k].includes(String(p[f] || '').trim()));
}

/** Popis kategorie pro podtitulek, např. „U16, U12, U10“. */
export function categoryDescription(cat) {
  const parts = [...(cat.types || []), ...(cat.groups || []), ...(cat.sex || []).map(sexLabel)];
  return parts.join(', ');
}

export function sexLabel(v) {
  const t = String(v || '').trim().toLowerCase();
  if (['w', 'f', 'ž', 'z', 'female'].includes(t)) return 'ženy';
  if (['m', 'male'].includes(t)) return 'muži';
  return `pohlaví ${v}`;
}

// ---------------------------------------------------------------------------
// Startovní listina jednotlivců
// ---------------------------------------------------------------------------

const START_COLUMNS = [
  { key: 'startNo', label: 'č.', cls: 'c num', width: '2.6em', get: (p) => esc(p.startNo ?? '') },
  { key: 'title', hideEmpty: true, label: 'Tit.', cls: 'c title', width: '2.8em', get: (p) => esc(p.title) },
  { key: 'name', label: 'Jméno', cls: 'name', get: (p, ctx) => esc(fmtName(p.name, ctx.nameFormat)) },
  { key: 'fideId', hideEmpty: true, label: 'FIDE ID', cls: 'c num muted', def: false, get: (p) => esc(p.fideId ?? '') },
  { key: 'fed', hideEmpty: true, label: 'Fed', cls: 'c', width: '3em', def: false, get: (p) => esc(p.fed) },
  { key: 'rating', hideEmpty: true, label: 'RtgF', cls: 'c num', width: '3.2em', get: (p) => fmtRating(p.rating) },
  { key: 'ratingNat', hideEmpty: true, label: 'RtgN', cls: 'c num', width: '3.6em', get: (p) => fmtRating(p.ratingNat) },
  { key: 'type', hideEmpty: true, label: 'Typ', cls: 'c', get: (p) => esc(p.type) },
  { key: 'group', hideEmpty: true, label: 'Skup.', cls: 'c', get: (p) => esc(p.group) },
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
    const cols = pruneEmpty(allCols, players, ctx);
    const blocks = [];
    const parts = byCategory(sortPlayers(players, opts.sort), opts.category);
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
  { key: 'ratingNat', hideEmpty: true, label: 'RtgN', cls: 'c num', width: '3.4em', get: (p) => fmtRating(p.ratingNat) },
  { key: 'rating', hideEmpty: true, label: 'RtgF', cls: 'c num', width: '3.4em', get: (p) => fmtRating(p.rating) },
  { key: 'fed', hideEmpty: true, label: 'FED', cls: 'c', width: '3em', def: false, get: (p) => esc(p.fed) },
  { key: 'club', hideEmpty: true, label: 'Klub', cls: 'club', get: (p) => esc(p.club) },
  { key: 'fideId', hideEmpty: true, label: 'FIDE ID', cls: 'c num muted', def: false, get: (p) => esc(p.fideId ?? '') },
  { key: 'type', hideEmpty: true, label: 'Typ', cls: 'c', def: false, get: (p) => esc(p.type) },
  { key: 'group', hideEmpty: true, label: 'Skup.', cls: 'c', def: false, get: (p) => esc(p.group) },
];

export const alphaList = {
  id: 'alphalist',
  name: 'Abecední seznam hráčů',
  description: 'Hráči podle abecedy se startovním číslem – jako abecední seznam ve Swiss-Manageru.',
  group: 'Seznamy',
  supports: (info) => !info.isTeam,
  roundMode: null,
  options: [categoryOption],
  columns: ALPHA_COLUMNS,
  columnsVersion: 2, // sloupce podle Swiss-Manageru (Č., St.č., …)
  defaults: { orientation: 'portrait', columns: 1 },
  needs: () => [{ dataset: 'main' }],
  render({ data, opts, cols: allCols, nameFormat }) {
    const players = data.main?.players || [];
    const ctx = { nameFormat };
    const cols = pruneEmpty(allCols, players, ctx);
    const blocks = [];
    const parts = byCategory(sortPlayers(players, 'alpha'), opts.category);
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
// Soupisky škol / klubů ve švýcaru jednotlivců (hodnocení družstev)
// chess-results soupisky zobrazuje jen u turnajů družstev. U jednotlivců hodnocených
// i do družstev (např. přebory škol) se hráči seskupí podle klubu ze startovní listiny –
// podobně jako „Sestava družstev“ ve Swiss-Manageru.
// ---------------------------------------------------------------------------

const NO_CLUB = 'Bez klubu';

const CLUB_ROSTER_COLUMNS = [
  { key: 'rowNo', label: 'Poř.', cls: 'c num', width: '2.8em', get: (p) => esc(p.rowNo ?? '') },
  { key: 'startNo', label: 'St.č.', cls: 'c num muted', width: '3.2em', get: (p) => esc(p.startNo ?? '') },
  { key: 'title', hideEmpty: true, label: 'Tit.', cls: 'c title', width: '2.8em', get: (p) => esc(p.title) },
  { key: 'name', label: 'Jméno', cls: 'name', get: (p, ctx) => esc(fmtName(p.name, ctx.nameFormat)) },
  { key: 'fideId', hideEmpty: true, label: 'FIDE ID', cls: 'c num muted', def: false, get: (p) => esc(p.fideId ?? '') },
  { key: 'ratingNat', hideEmpty: true, label: 'RtgN', cls: 'c num', width: '3.4em', get: (p) => fmtRating(p.ratingNat) },
  { key: 'rating', hideEmpty: true, label: 'RtgF', cls: 'c num', width: '3.4em', get: (p) => fmtRating(p.rating) },
  { key: 'fed', hideEmpty: true, label: 'FED', cls: 'c', width: '3em', def: false, get: (p) => esc(p.fed) },
  { key: 'type', hideEmpty: true, label: 'Typ', cls: 'c', def: false, get: (p) => esc(p.type) },
  { key: 'group', hideEmpty: true, label: 'Skup.', cls: 'c', def: false, get: (p) => esc(p.group) },
];

const CLUB_ROSTER_TITLES = { teams: 'Soupisky družstev', schools: 'Soupisky škol', clubs: 'Soupisky klubů' };

/** Hráči seskupení podle družstva (sloupec družstva, jinak klub); hráči bez klubu na konci. */
export function groupByClub(players, { teamOrder = 'alpha', sort = 'startNo' } = {}) {
  const map = new Map();
  for (const p of sortPlayers(players, 'startNo')) {
    const name = String(p.team || p.club || '').trim() || NO_CLUB;
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(p);
  }
  let groups = [...map.entries()].map(([name, list]) => ({ name, players: sortPlayers(list, sort) }));
  if (teamOrder === 'alpha') groups.sort((a, b) => collator.compare(a.name, b.name));
  else if (teamOrder === 'size') groups.sort((a, b) => b.players.length - a.players.length || collator.compare(a.name, b.name));
  // 'startNo': pořadí podle nejnižšího startovního čísla hráče (= pořadí vzniku mapy)
  groups = [...groups.filter((g) => g.name !== NO_CLUB), ...groups.filter((g) => g.name === NO_CLUB)];
  return groups;
}

/** Český tvar podle počtu: 1 hráč, 2–4 hráči, 5+ hráčů. */
function plural(n, one, few, many) {
  return n === 1 ? one : n >= 2 && n <= 4 ? few : many;
}

function avgRating(list, key) {
  const vals = list.map((p) => p[key]).filter((r) => typeof r === 'number' && r > 0);
  return vals.length ? Math.round(vals.reduce((s, r) => s + r, 0) / vals.length) : null;
}

export const clubRoster = {
  id: 'club-roster',
  name: 'Soupisky škol (klubů)',
  description: 'Švýcar jednotlivců hodnocený i do družstev: hráči seskupení podle klubu / školy ze startovní listiny – jako „Sestava družstev“ ve Swiss-Manageru.',
  group: 'Seznamy',
  supports: (info) => !info.isTeam,
  roundMode: null,
  options: [
    { key: 'heading', label: 'Nadpis', type: 'select', def: 'teams', choices: Object.entries(CLUB_ROSTER_TITLES) },
    { key: 'teamOrder', label: 'Pořadí družstev', type: 'select', def: 'alpha', choices: [['alpha', 'abecedně'], ['startNo', 'podle startovních čísel hráčů'], ['size', 'podle počtu hráčů']] },
    { key: 'sort', label: 'Hráči v družstvu', type: 'select', def: 'startNo', choices: [['startNo', 'podle startovních čísel'], ['rating', 'podle ratingu'], ['alpha', 'abecedně']] },
    { key: 'minPlayers', label: 'Jen družstva s alespoň', type: 'select', def: '1', choices: [['1', '1 hráčem (všechna)'], ['2', '2 hráči'], ['3', '3 hráči'], ['4', '4 hráči']] },
    { key: 'avg', label: 'Průměrný rating družstva v nadpisu', type: 'bool', def: false },
    { key: 'keepTogether', label: 'Nerozdělovat družstvo na více stránek', type: 'bool', def: true },
    { key: 'teamPerPage', label: 'Každé družstvo na novou stránku', type: 'bool', def: false },
    categoryOption,
  ],
  columns: CLUB_ROSTER_COLUMNS,
  defaults: { orientation: 'portrait', columns: 1 },
  needs: () => [{ dataset: 'main' }],
  render({ data, opts, cols: allCols, nameFormat }) {
    const all = data.main?.players || [];
    const ctx = { nameFormat };
    const min = Math.max(1, Number(opts.minPlayers) || 1);
    const parts = byCategory(all, opts.category);
    const players = parts.flatMap((part) => part.items);
    const cols = pruneEmpty(allCols, players, ctx);
    const blocks = [];
    let teamCount = 0;
    let playerCount = 0;
    let hidden = 0;
    parts.forEach((part, pi) => {
      const groups = groupByClub(part.items, opts);
      const shown = groups.filter((g) => g.players.length >= min);
      hidden += groups.length - shown.length;
      if (parts.length > 1) {
        const head = { ...sectionTitle(part.name, `${shown.length} ${plural(shown.length, 'družstvo', 'družstva', 'družstev')}`), blockClass: 'award-title' };
        if (pi > 0) head.breakBefore = true;
        blocks.push(head);
      }
      shown.forEach((g, i) => {
        const n = g.players.length;
        const subs = [`${n} ${plural(n, 'hráč', 'hráči', 'hráčů')}`];
        const avg = opts.avg ? avgRating(g.players, 'ratingNat') ?? avgRating(g.players, 'rating') : null;
        if (avg) subs.push(`Ø ${avg}`);
        const title = sectionTitle(`${i + 1}. ${g.name}`, subs.join(' · '));
        if (opts.teamPerPage && i > 0) title.breakBefore = true;
        else if (i > 0) title.spaceBefore = 4;
        blocks.push(title);
        const rows = g.players.map((p, j) => ({ ...p, rowNo: j + 1 }));
        blocks.push({
          type: 'table', className: 'grid roster', colgroup: colgroup(cols), thead: theadRow(cols),
          rows: rows.map((p) => bodyRow(cols, p, ctx)), keepTogether: opts.keepTogether !== false, widthGroup: 'roster',
        });
        teamCount += 1;
        playerCount += n;
      });
    });
    if (!all.length) blocks.push(noteBlock('Startovní listina je prázdná.'));
    else if (!players.length) blocks.push(noteBlock('V této kategorii nikdo není.'));
    const warnings = [];
    if (players.length && !players.some((p) => p.team || p.club)) {
      warnings.push('Hráči nemají na chess-results vyplněný klub, takže nejde poznat, za koho hrají. Ve Swiss-Manageru zadejte hráčům školu jako klub a na chess-results zapněte sloupec „Klub“ (Pole (Hráč) → Klub).');
    }
    if (hidden > 0) warnings.push(`Nevytisknou se družstva s méně než ${min} ${plural(min, 'hráčem', 'hráči', 'hráči')}: ${hidden}.`);
    const subParts = [`${teamCount} ${plural(teamCount, 'družstvo', 'družstva', 'družstev')}`, `${playerCount} ${plural(playerCount, 'hráč', 'hráči', 'hráčů')}`];
    if (opts.category && opts.category !== '*split*') subParts.push(`kategorie ${opts.category}`);
    return { title: CLUB_ROSTER_TITLES[opts.heading] || CLUB_ROSTER_TITLES.teams, sub: subParts.join(' · '), blocks, warnings };
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
  { key: 'rating', hideEmpty: true, label: 'RtgF', cls: 'c num', width: '3.2em', get: (r) => fmtRating(r.rating) },
  { key: 'ratingNat', hideEmpty: true, label: 'RtgN', cls: 'c num', get: (r) => fmtRating(r.ratingNat) },
  { key: 'type', hideEmpty: true, label: 'Typ', cls: 'c', def: false, get: (r) => esc(r.type) },
  { key: 'group', hideEmpty: true, label: 'Skup.', cls: 'c', def: false, get: (r) => esc(r.group) },
  { key: 'club', hideEmpty: true, label: 'Klub', cls: 'club', get: (r) => esc(r.club) },
  { key: 'points', label: 'Body', cls: 'c num strong', width: '3em', get: (r) => fmtPoints(r.points) },
  ...TB_KEYS.map((i) => ({ key: `tb${i}`, label: `PH${i}`, cls: 'c num', width: '3em', tb: i, get: (r) => esc(r.tb?.[i - 1] ?? '') })),
];

function tbLegend(tiebreaks) {
  const items = tiebreaks.filter((t) => t.label).map((t, i) => `<span><b>PH${i + 1}</b>: ${esc(t.label)}</span>`);
  return items.length ? { type: 'html', html: `<div class="legend">${items.join('')}</div>` } : null;
}

/** Řádky pořadí doplněné o údaje ze startovní listiny (typ, skupina, klub, …). */
function rankingRows(rk, players) {
  const idx = playerIndex(players);
  return rk.rows.map((r) => {
    const p = r.startNo != null ? idx.get(r.startNo) : null;
    if (!p) return r;
    return {
      ...r,
      type: r.type || p.type || '',
      group: r.group || p.group || '',
      sex: r.sex || p.sex || '',
      club: r.club || p.club,
      title: r.title || p.title,
      fed: r.fed || p.fed,
      ratingNat: r.ratingNat ?? p.ratingNat,
    };
  });
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
    const rows = rankingRows(rk, data.main?.players);
    const tbCount = rk.tiebreaks.length;
    const ctx = { nameFormat };
    const usable = pruneEmpty(cols.filter((c) => !c.tb || c.tb <= tbCount), rows, ctx);
    const blocks = [];
    const parts = byCategory(rows, opts.category);
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
// Pořadí + kategorie: pořadí s typem a skupinou; volitelně jen vybrané kategorie
// (např. „Nejlepší do 16 let“ = typy U16, U12, U10) – každá s vlastním pořadím.
// ---------------------------------------------------------------------------

const RANK_CAT_COLUMNS = [
  { key: 'rank', label: 'Poř.', cls: 'c num strong', width: '3.2em', get: (r) => esc(r.rankShown ?? r.rank ?? '') },
  { key: 'rankAll', label: 'Celk.', cls: 'c num', width: '3.6em', hideEmpty: true, get: (r) => esc(r.rankAll ?? '') },
  { key: 'startNo', label: 'č.', cls: 'c num muted', width: '2.6em', def: false, get: (r) => esc(r.startNo ?? '') },
  { key: 'title', hideEmpty: true, label: 'Tit.', cls: 'c title', width: '2.8em', get: (r) => esc(r.title) },
  { key: 'name', label: 'Jméno', cls: 'name', get: (r, ctx) => esc(fmtName(r.name, ctx.nameFormat)) },
  { key: 'fed', hideEmpty: true, label: 'Fed', cls: 'c', width: '3em', def: false, get: (r) => esc(r.fed) },
  { key: 'rating', hideEmpty: true, label: 'RtgF', cls: 'c num', width: '3.2em', get: (r) => fmtRating(r.rating) },
  { key: 'ratingNat', hideEmpty: true, label: 'RtgN', cls: 'c num', width: '3.4em', get: (r) => fmtRating(r.ratingNat) },
  { key: 'sex', hideEmpty: true, label: 'Pohl.', cls: 'c', width: '3em', def: false, get: (r) => esc(r.sex) },
  { key: 'type', hideEmpty: true, label: 'Typ', cls: 'c', width: '3em', get: (r) => esc(r.type) },
  { key: 'group', hideEmpty: true, label: 'Skup.', cls: 'c', get: (r) => esc(r.group) },
  { key: 'club', hideEmpty: true, label: 'Klub', cls: 'club', get: (r) => esc(r.club) },
  { key: 'points', label: 'Body', cls: 'c num strong', width: '3.6em', get: (r) => fmtPoints(r.points) },
  ...TB_KEYS.map((i) => ({ key: `tb${i}`, label: `PH${i}`, cls: 'c num', width: '3em', tb: i, def: false, get: (r) => esc(r.tb?.[i - 1] ?? '') })),
];

/** Kategorie z profilu, které se mají tisknout. */
export function activeCategories(opts) {
  return (Array.isArray(opts.categories) ? opts.categories : []).filter((c) => c && c.on !== false);
}

export const rankingCat = {
  id: 'ranking-cat',
  name: 'Pořadí + kategorie',
  description: 'Pořadí s typem a skupinou hráče. Lze vybrat kategorie (např. nejlepší do 16 let) – každá dostane vlastní pořadí.',
  group: 'Seznamy',
  supports: (info) => !info.isTeam,
  roundMode: 'ranking',
  options: [
    { key: 'categories', label: 'Kategorie', type: 'categories', def: [] },
    { key: 'catLayout', label: 'Tisk kategorií', type: 'select', def: 'flow', choices: [['flow', 'za sebou (co se vejde na stránku)'], ['pages', 'každá kategorie na samostatné stránce']] },
    { key: 'keepTogether', label: 'Nerozdělovat kategorii na více stránek', type: 'bool', def: true },
    { key: 'withOverall', label: 'Před kategoriemi i celkové pořadí', type: 'bool', def: true },
    { key: 'legend', label: 'Vysvětlivky pomocných hodnocení', type: 'bool', def: false },
  ],
  columns: RANK_CAT_COLUMNS,
  defaults: { orientation: 'portrait', columns: 1 },
  needs: ({ round }) => [{ dataset: 'main' }, { dataset: 'ranking', round }],
  render({ data, round, opts, cols, nameFormat }) {
    const rk = data.ranking || { rows: [], tiebreaks: [] };
    const rows = rankingRows(rk, data.main?.players);
    const ctx = { nameFormat };
    const base = cols.filter((c) => !c.tb || c.tb <= rk.tiebreaks.length);
    const cats = activeCategories(opts);
    const blocks = [];
    const lists = cats.map((cat) => rows.filter((r) => inCategory(cat, r)).map((r, j) => ({ ...r, rankShown: j + 1, rankAll: r.rank })));
    // Stejné sloupce ve všech tabulkách kategorií (prázdné se skryjí podle všech vytištěných hráčů)
    const shown = cats.length && !opts.withOverall ? lists.flat() : rows;
    const table = (list, withAll) => {
      const usable = pruneEmpty(base.filter((c) => withAll || c.key !== 'rankAll'), withAll ? lists.flat() : shown, ctx);
      return { type: 'table', className: `grid ranking${cats.length ? ' sym' : ''}`, colgroup: colgroup(usable), thead: theadRow(usable), rows: list.map((r) => bodyRow(usable, r, ctx)) };
    };
    if (!cats.length || opts.withOverall) {
      if (cats.length) blocks.push(sectionTitle('Celkové pořadí'));
      blocks.push(table(rows, false));
    }
    cats.forEach((cat, i) => {
      const list = lists[i];
      const desc = categoryDescription(cat);
      const name = String(cat.name || '').trim();
      const title = { ...sectionTitle(name || desc || `Kategorie ${i + 1}`, name && desc && name !== desc ? desc : '') };
      if (opts.catLayout === 'pages' && blocks.length) title.breakBefore = true;
      blocks.push(title);
      // Celá kategorie na jedné stránce (rozdělí se jen ta, která se nevejde ani na celou stránku)
      blocks.push(list.length ? { ...table(list, true), keepTogether: opts.keepTogether !== false } : noteBlock(desc ? 'V této kategorii není žádný hráč.' : 'Kategorie nemá vybraný žádný typ ani skupinu.'));
    });
    if (opts.legend) {
      const lg = tbLegend(rk.tiebreaks);
      if (lg) blocks.push(lg);
    }
    const warnings = [];
    if (!rows.length) warnings.push(`Pořadí${round ? ` po ${round}. kole` : ''} zatím není na chess-results k dispozici.`);
    const r = rk.round || round;
    const title = rk.final ? 'Konečné pořadí' : r ? `Pořadí po ${r}. kole` : 'Pořadí';
    const sub = cats.length === 1 ? cats[0].name || categoryDescription(cats[0]) : '';
    return { title, sub, blocks, warnings };
  },
};

// ---------------------------------------------------------------------------
// Vyhlášení výsledků: nejlepší hráči celkově a v kategoriích (kategorie z „Pořadí + kategorie“)
// ---------------------------------------------------------------------------

const AWARD_COLUMNS = [
  { key: 'place', label: 'Místo', cls: 'c num strong', width: '3.4em', get: (r) => `${esc(r.place)}.` },
  { key: 'title', hideEmpty: true, label: 'Tit.', cls: 'c title', width: '2.8em', get: (r) => esc(r.title) },
  { key: 'name', label: 'Jméno', cls: 'name strong', get: (r, ctx) => esc(fmtName(r.name, ctx.nameFormat)) },
  { key: 'type', hideEmpty: true, label: 'Typ', cls: 'c', width: '3em', def: false, get: (r) => esc(r.type) },
  { key: 'club', hideEmpty: true, label: 'Klub', cls: 'club', get: (r) => esc(r.club) },
  { key: 'points', label: 'Body', cls: 'c num strong', width: '3em', get: (r) => fmtPoints(r.points) },
  { key: 'rank', label: 'Celk.', cls: 'c num muted', width: '3em', def: false, get: (r) => esc(r.rank ?? '') },
];

export const awards = {
  id: 'awards',
  name: 'Vyhlášení výsledků',
  description: 'Nejlepší hráči celkově a v kategoriích velkým písmem – k vyhlášení. Kategorie se nastavují u „Pořadí + kategorie“.',
  group: 'Seznamy',
  supports: (info) => !info.isTeam,
  roundMode: 'ranking',
  options: [
    { key: 'places', label: 'Počet míst', type: 'select', def: '3', choices: [['1', '1'], ['3', '3'], ['5', '5'], ['10', '10']] },
    { key: 'withOverall', label: 'Celkové pořadí', type: 'bool', def: true },
    { key: 'sectionPerPage', label: 'Každá kategorie na samostatné stránce', type: 'bool', def: false },
  ],
  columns: AWARD_COLUMNS,
  // Velké písmo: vše na jednu stránku A4, co největší
  defaults: { orientation: 'portrait', columns: 1, fontMode: 'page' },
  needs: ({ round }) => [{ dataset: 'main' }, { dataset: 'ranking', round }],
  render({ data, round, opts, cols, nameFormat, profile }) {
    const rk = data.ranking || { rows: [], tiebreaks: [] };
    const rows = rankingRows(rk, data.main?.players);
    const ctx = { nameFormat };
    const n = Math.max(1, Number(opts.places) || 3);
    const catOpts = (profile && profile.templates && profile.templates['ranking-cat'] && profile.templates['ranking-cat'].options) || {};
    const cats = activeCategories(catOpts);
    const sections = [];
    if (opts.withOverall !== false || !cats.length) sections.push({ name: 'Celkové pořadí', list: rows });
    for (const cat of cats) {
      sections.push({ name: String(cat.name || '').trim() || categoryDescription(cat) || 'Kategorie', list: rows.filter((r) => inCategory(cat, r)) });
    }
    // Kategorie bez hráčů se na vyhlášení nevypisují (jen upozornění)
    const empty = sections.filter((sec) => !sec.list.length && sec.name !== 'Celkové pořadí').map((sec) => sec.name);
    const shown = sections.filter((sec) => sec.list.length || sec.name === 'Celkové pořadí')
      .map((sec) => ({ ...sec, list: sec.list.slice(0, n).map((r, i) => ({ ...r, place: i + 1 })) }));
    const usable = pruneEmpty(cols, shown.flatMap((x) => x.list), ctx);
    const blocks = [];
    shown.forEach((sec, i) => {
      const title = { ...sectionTitle(sec.name), blockClass: 'award-title' };
      if (opts.sectionPerPage && i > 0) title.breakBefore = true;
      else if (i > 0) title.spaceBefore = 4;
      blocks.push(title);
      blocks.push(sec.list.length
        ? { type: 'table', className: 'grid awards', colgroup: colgroup(usable), thead: theadRow(usable), rows: sec.list.map((r) => bodyRow(usable, r, ctx)), keepTogether: true }
        : noteBlock('V této kategorii nikdo není.'));
    });
    const warnings = [];
    if (!rows.length) warnings.push(`Pořadí${round ? ` po ${round}. kole` : ''} zatím není na chess-results k dispozici.`);
    if (rows.length && empty.length) warnings.push(`Kategorie bez hráčů (nevytisknou se): ${empty.join(', ')}.`);
    const r = rk.round || round;
    return { title: rk.final ? 'Vyhlášení výsledků' : r ? `Vyhlášení výsledků – po ${r}. kole` : 'Vyhlášení výsledků', sub: '', blocks, warnings };
  },
};

// ---------------------------------------------------------------------------
// Družstva: tabulka a soupisky
// ---------------------------------------------------------------------------

const TEAM_RANK_COLUMNS = [
  { key: 'rank', label: 'Poř.', cls: 'c num strong', width: '2.8em', get: (r) => esc(r.rank ?? '') },
  { key: 'startNo', label: 'č.', cls: 'c num muted', width: '2.6em', def: false, get: (r) => esc(r.startNo ?? '') },
  { key: 'name', label: 'Družstvo', cls: 'name', get: (r) => esc(r.name) },
  // Sloupce, které pořadatel může na chess-results zapnout – ukážou se, jen když jsou vyplněné
  { key: 'group', hideEmpty: true, label: 'Skup.', cls: 'c', get: (r) => esc(r.group || '') },
  { key: 'fed', hideEmpty: true, label: 'Fed', cls: 'c', width: '3em', def: false, get: (r) => esc(r.fed || '') },
  { key: 'points', hideEmpty: true, label: 'Body', cls: 'c num strong', width: '3em', get: (r) => (r.points != null ? esc(fmtPoints(r.points)) : '') },
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
    const usable = pruneEmpty(cols.filter((c) => !c.tb || c.tb <= rk.tiebreaks.length), rk.rows, {});
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

// ---------------------------------------------------------------------------
// Družstva: nejlepší hráči na šachovnicích (chess-results art=81 „Board list“)
// ---------------------------------------------------------------------------

/** Krátký český název a vysvětlivka pomocného hodnocení podle textu z chess-results. */
export function boardTiebreak(label, i) {
  const t = String(label || '').toLowerCase();
  if (/point|bod|punkt/.test(t)) return { short: 'Body', long: 'body (z partií na šachovnici)', points: true };
  if (/game|parti/.test(t)) return { short: 'Partie', long: /less|ascending|méně|weniger/.test(t) ? 'počet odehraných partií (méně je lépe)' : 'počet odehraných partií' };
  if (/perform|výkon|leistung/.test(t)) return { short: 'Výkon', long: 'výkon (performance)' };
  if (/percent|procent|prozent|%/.test(t)) return { short: '%', long: 'procento bodů' };
  return { short: `PH${i}`, long: label || '' };
}

const BOARD_BEST_COLUMNS = [
  { key: 'rank', label: 'Poř.', cls: 'c num strong', width: '2.8em', get: (r) => esc(r.rank ?? '') },
  { key: 'title', hideEmpty: true, label: 'Tit.', cls: 'c title', width: '2.8em', get: (r) => esc(r.title) },
  { key: 'name', label: 'Jméno', cls: 'name', get: (r, ctx) => esc(fmtName(r.name, ctx.nameFormat)) },
  { key: 'rating', hideEmpty: true, label: 'Elo', cls: 'c num', width: '3.2em', get: (r) => fmtRating(r.rating) },
  { key: 'fed', hideEmpty: true, label: 'Fed', cls: 'c', width: '3em', def: false, get: (r) => esc(r.fed) },
  { key: 'team', label: 'Družstvo', cls: 'club', get: (r) => esc(r.team) },
  ...[1, 2, 3, 4].map((i) => ({
    key: `tb${i}`, label: `PH${i}`, cls: `c num${i === 1 ? ' strong' : ''}`, width: '3.4em', tb: i,
    get: (r, ctx) => {
      const v = r.tb?.[i - 1] ?? '';
      return ctx.tbInfo?.[i - 1]?.points && parseNum(v) != null ? fmtPoints(parseNum(v)) : esc(v);
    },
  })),
];

export const teamBoardBest = {
  id: 'team-board-best',
  name: 'Nejlepší na šachovnicích',
  description: 'Pořadí hráčů na jednotlivých šachovnicích (chess-results „Board list“) – k vyhlášení nejlepších hráčů na šachovnicích.',
  group: 'Seznamy',
  supports: (info) => info.isTeam,
  roundMode: null,
  options: [
    { key: 'places', label: 'Počet míst na šachovnici', type: 'select', def: 'all', choices: [['all', 'všichni hráči'], ['1', '1 (jen nejlepší)'], ['3', '3'], ['5', '5']] },
    { key: 'keepTogether', label: 'Nerozdělovat šachovnici na více stránek', type: 'bool', def: true },
    { key: 'boardPerPage', label: 'Každá šachovnice na samostatné stránce', type: 'bool', def: false },
    { key: 'legend', label: 'Vysvětlivky', type: 'bool', def: true },
  ],
  columns: BOARD_BEST_COLUMNS,
  defaults: { orientation: 'portrait', columns: 1 },
  needs: () => [{ dataset: 'boardList' }],
  render({ data, opts, cols, nameFormat }) {
    const bl = data.boardList || { boards: [], tiebreaks: [] };
    const tbInfo = bl.tiebreaks.map((t, i) => boardTiebreak(t.label, i + 1));
    const ctx = { nameFormat, tbInfo };
    // Pořadí do N. místa včetně dělených míst
    const n = opts.places === 'all' ? Infinity : Math.max(1, Number(opts.places) || 3);
    const boards = bl.boards.map((b) => ({ ...b, rows: b.rows.filter((r) => r.rank == null || r.rank <= n) }));
    const all = boards.flatMap((b) => b.rows);
    const usable = pruneEmpty(cols.filter((c) => !c.tb || c.tb <= bl.tiebreaks.length), all, ctx)
      .map((c) => (c.tb && !c.customLabel ? { ...c, label: tbInfo[c.tb - 1].short } : c));
    const blocks = [];
    boards.forEach((b, i) => {
      const title = sectionTitle(`${b.board}. šachovnice`);
      if (opts.boardPerPage && i > 0) title.breakBefore = true;
      else if (i > 0) title.spaceBefore = 3;
      blocks.push(title);
      blocks.push(b.rows.length
        ? { type: 'table', className: 'grid ranking', colgroup: colgroup(usable), thead: theadRow(usable), rows: b.rows.map((r) => bodyRow(usable, r, ctx)), keepTogether: opts.keepTogether !== false, widthGroup: 'boards' }
        : noteBlock('Na této šachovnici zatím nikdo nehrál.'));
    });
    if (opts.legend !== false && boards.length) {
      const items = usable.filter((c) => c.tb).map((c) => `<span><b>${esc(c.label)}</b>: ${esc(tbInfo[c.tb - 1].long)}</span>`);
      if (/most played|nejčastěji|meisten/i.test(bl.determination)) {
        items.push('<span>Hráč je zařazen na šachovnici, na které hrál nejčastěji (při rovnosti na vyšší). Kontumace se nezapočítávají.</span>');
      }
      if (items.length) blocks.push({ type: 'html', spaceBefore: 3, html: `<div class="legend">${items.join('')}</div>` });
    }
    const warnings = boards.length ? [] : ['Přehled nejlepších hráčů na šachovnicích (Board list) zatím není na chess-results k dispozici – zveřejňuje se, když ho pořadatel ve Swiss-Manageru zapne.'];
    const title = bl.final ? 'Nejlepší hráči na šachovnicích – konečné pořadí' : bl.round ? `Nejlepší hráči na šachovnicích po ${bl.round}. kole` : 'Nejlepší hráči na šachovnicích';
    return { title, sub: '', blocks, warnings };
  },
};

const ROSTER_COLUMNS = [
  { key: 'board', label: 'Š.', cls: 'c num', width: '2.4em', get: (p) => esc(p.board ?? '') },
  { key: 'title', hideEmpty: true, label: 'Tit.', cls: 'c title', width: '2.8em', get: (p) => esc(p.title) },
  { key: 'name', label: 'Jméno', cls: 'name', get: (p, ctx) => esc(fmtName(p.name, ctx.nameFormat)) },
  { key: 'fideId', hideEmpty: true, label: 'FIDE ID', cls: 'c num muted', def: false, get: (p) => esc(p.fideId ?? '') },
  { key: 'fed', hideEmpty: true, label: 'Fed', cls: 'c', width: '3em', get: (p) => esc(p.fed) },
  { key: 'rating', hideEmpty: true, label: 'RtgF', cls: 'c num', width: '3.2em', get: (p) => fmtRating(p.rating) },
  { key: 'ratingNat', hideEmpty: true, label: 'RtgN', cls: 'c num', width: '3.6em', get: (p) => fmtRating(p.ratingNat) },
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
        thead: '<tr><th class="c">č.</th><th>Družstvo</th><th class="c">Ø Elo</th></tr>',
        rows: teams.map((t) => `<tr><td class="c num">${esc(t.no ?? '')}</td><td class="name">${esc(t.name)}</td><td class="c num">${fmtRating(t.ratingAvg)}</td></tr>`),
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

// ---------------------------------------------------------------------------
// Švýcar jednotlivců hodnocený i do družstev (přebory škol) – stránky chess-results:
//  art=72 „Team-Ranking“ (pořadí družstev a započítaní hráči), art=71 soupisky s výsledky kol
// ---------------------------------------------------------------------------

const CLUB_RANK_TITLES = { teams: 'Pořadí družstev', schools: 'Pořadí škol', clubs: 'Pořadí klubů' };
const CLUB_UNIT = { teams: 'Družstvo', schools: 'Škola', clubs: 'Klub' };

const CLUB_RANK_COLUMNS = [
  { key: 'rank', label: 'Poř.', cls: 'c num strong', width: '2.8em', get: (r) => (r.member ? `<span class="muted">${esc(r.no ?? '')}</span>` : esc(r.rank ?? '')) },
  { key: 'name', label: 'Družstvo / hráč', cls: 'name', get: (r, ctx) => (r.member ? esc(fmtName(r.name, ctx.nameFormat)) : esc(r.name)) },
  { key: 'points', label: 'Body', cls: 'c num strong', width: '3em', get: (r) => fmtPoints(r.points) },
  ...[1, 2, 3, 4].map((i) => ({ key: `tb${i}`, label: `PH${i}`, cls: 'c num', width: '3.2em', tb: i, get: (r) => esc(r.tb?.[i - 1] ?? '') })),
];

/** Volba hráčů v pořadí družstev: 'counted' | 'all' | 'none' (dřívější true / false). */
function clubPlayersMode(v) {
  if (v === false || v === 'none') return 'none';
  return v === 'all' ? 'all' : 'counted';
}

const normName = (s) => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('cs');

/**
 * Hráči družstva pro pořadí: započítaní (z Team-Ranking) a při mode 'all' i ostatní ze soupisky
 * (Team-Composition) – ti jsou označení extra a seřazení podle bodů.
 */
export function clubTeamPlayers(team, composition, mode) {
  if (mode === 'none') return [];
  const counted = team.players.map((p) => ({ ...p, member: true }));
  if (mode !== 'all' || !composition) return counted;
  const comp = (composition.teams || []).find((t) => normName(t.name) === normName(team.name));
  if (!comp) return counted;
  const have = new Set(team.players.map((p) => normName(p.name)));
  const extra = comp.players
    .filter((p) => !have.has(normName(p.name)))
    .sort((a, b) => (b.points ?? -1) - (a.points ?? -1) || (a.board ?? 99) - (b.board ?? 99))
    .map((p) => ({ name: p.name, points: p.points, no: null, tb: [], member: true, extra: true }));
  return [...counted, ...extra];
}

export const clubRanking = {
  id: 'club-ranking',
  name: 'Pořadí škol (družstev)',
  description: 'Švýcar jednotlivců hodnocený i do družstev: pořadí škol / klubů a hráči, kteří se do něj započítávají, nebo všichni hráči družstva (chess-results „Team-Ranking“).',
  group: 'Seznamy',
  supports: (info) => !info.isTeam && (info.availableArts || []).includes(72),
  roundMode: null,
  options: [
    { key: 'heading', label: 'Nadpis', type: 'select', def: 'schools', choices: Object.entries(CLUB_RANK_TITLES) },
    {
      key: 'players', label: 'Hráči', type: 'select', def: 'counted',
      choices: [['counted', 'jen ti, kteří se započítávají'], ['all', 'všichni hráči družstva (nezapočítaní šedě)'], ['none', 'bez hráčů – jen pořadí']],
    },
    { key: 'places', label: 'Počet míst', type: 'select', def: 'all', choices: [['all', 'všechna družstva'], ['3', '3'], ['5', '5'], ['10', '10']] },
    { key: 'keepTogether', label: 'Nerozdělovat družstvo s hráči na dvě stránky', type: 'bool', def: true },
    { key: 'shade', label: 'Podbarvit řádky družstev (škol)', type: 'bool', def: true },
    { key: 'legend', label: 'Vysvětlivky pomocných hodnocení', type: 'bool', def: true },
  ],
  columns: CLUB_RANK_COLUMNS,
  defaults: { orientation: 'portrait', columns: 1 },
  // Všichni hráči družstva: ostatní hráče (mimo započítané) bere ze soupisek s výsledky (art=71)
  needs: ({ opts } = {}) => (clubPlayersMode(opts && opts.players) === 'all'
    ? [{ dataset: 'clubRanking' }, { dataset: 'teamComposition', optional: true }]
    : [{ dataset: 'clubRanking' }]),
  render({ data, opts, cols, nameFormat }) {
    const cr = data.clubRanking || { teams: [], tiebreaks: [] };
    const ctx = { nameFormat };
    const mode = clubPlayersMode(opts.players);
    const n = opts.places === 'all' ? Infinity : Math.max(1, Number(opts.places) || 3);
    const teams = cr.teams.filter((t) => t.rank == null || t.rank <= n);
    const unit = CLUB_UNIT[opts.heading] || 'Družstvo';
    const usable = cols.filter((c) => !c.tb || c.tb <= cr.tiebreaks.length)
      .map((c) => (c.key === 'name' && !c.customLabel ? { ...c, label: mode !== 'none' ? `${unit} / hráč` : unit } : c));
    const rows = [];
    const splitAt = [];
    let anyExtra = false;
    for (const t of teams) {
      splitAt.push(rows.length);
      rows.push(bodyRow(usable, t, ctx, opts.shade === false ? 'club-team club-plain' : 'club-team'));
      for (const p of clubTeamPlayers(t, data.teamComposition, mode)) {
        anyExtra = anyExtra || !!p.extra;
        rows.push(bodyRow(usable, p, ctx, p.extra ? 'club-member club-extra' : 'club-member'));
      }
    }
    const blocks = rows.length
      ? [{ type: 'table', className: 'grid ranking club-ranking', colgroup: colgroup(usable), thead: theadRow(usable), rows, splitAt: opts.keepTogether !== false ? splitAt : undefined }]
      : [noteBlock('Pořadí družstev zatím není na chess-results k dispozici.')];
    if (rows.length && (anyExtra || opts.legend !== false)) {
      const lg = opts.legend !== false ? tbLegend(cr.tiebreaks) : null;
      const note = anyExtra ? '<span>Šedě: hráči, kteří se do pořadí družstva nezapočítávají.</span>' : '';
      if (lg || note) blocks.push({ type: 'html', html: `<div class="legend">${note}${lg ? lg.html.replace(/^<div class="legend">|<\/div>$/g, '') : ''}</div>` });
    }
    const warnings = cr.teams.length ? [] : ['Pořadí družstev (Team-Ranking) zatím není na chess-results zveřejněné.'];
    if (mode === 'all' && cr.teams.length && !(data.teamComposition && data.teamComposition.teams && data.teamComposition.teams.length)) {
      warnings.push('Soupisky s výsledky kol (Team-Composition) nejsou na chess-results zveřejněné – zobrazují se jen hráči, kteří se započítávají.');
    }
    return {
      title: CLUB_RANK_TITLES[opts.heading] || CLUB_RANK_TITLES.teams,
      sub: '',
      blocks,
      warnings,
    };
  },
};

/** Výsledek v soupisce: „½“, „1“, „0“, „+“, „−“; nehráno = prázdné. */
function roundCell(v) {
  const t = String(v ?? '').trim();
  if (!t || t === '*') return '';
  return t === '-' ? '−' : t;
}

const COMPOSITION_COLUMNS = [
  { key: 'board', label: 'Š.', cls: 'c num', width: '2.4em', get: (p) => esc(p.board ?? '') },
  { key: 'title', hideEmpty: true, label: 'Tit.', cls: 'c title', width: '2.8em', get: (p) => esc(p.title) },
  { key: 'name', label: 'Jméno', cls: 'name', get: (p, ctx) => esc(fmtName(p.name, ctx.nameFormat)) },
  { key: 'rating', hideEmpty: true, label: 'RtgF', cls: 'c num', width: '3.2em', get: (p) => fmtRating(p.rating) },
  { key: 'ratingNat', hideEmpty: true, label: 'RtgN', cls: 'c num', width: '3.6em', get: (p) => fmtRating(p.ratingNat) },
  { key: 'fed', hideEmpty: true, label: 'Fed', cls: 'c', width: '3em', def: false, get: (p) => esc(p.fed) },
  // Zástupný sloupec: při sazbě se rozvine na sloupce 1…N s výsledky jednotlivých kol
  { key: 'rounds', label: 'Kola 1…N', cls: 'c xt', width: '2.2em', get: () => '' },
  { key: 'points', label: 'Body', cls: 'c num strong', width: '3em', get: (p) => fmtPoints(p.points) },
  { key: 'games', label: 'Partie', cls: 'c num', width: '3.2em', get: (p) => esc(p.games ?? '') },
  { key: 'ratingAvg', hideEmpty: true, label: 'Ø soup.', cls: 'c num', width: '3.6em', def: false, get: (p) => fmtRating(p.ratingAvg) },
];

export const teamComposition = {
  id: 'team-composition',
  name: 'Soupisky s výsledky kol',
  description: 'Švýcar jednotlivců hodnocený i do družstev: hráči každé školy / klubu s výsledky jednotlivých kol (chess-results „Team-Composition with round-results“).',
  group: 'Seznamy',
  supports: (info) => !info.isTeam && (info.availableArts || []).includes(71),
  roundMode: null,
  options: [
    { key: 'heading', label: 'Nadpis', type: 'select', def: 'schools', choices: Object.entries(CLUB_ROSTER_TITLES).map(([k, v]) => [k, `${v} s výsledky`]) },
    { key: 'teamOrder', label: 'Pořadí družstev', type: 'select', def: 'start', choices: [['start', 'jako na chess-results'], ['alpha', 'abecedně']] },
    { key: 'keepTogether', label: 'Nerozdělovat družstvo na více stránek', type: 'bool', def: true },
    { key: 'teamPerPage', label: 'Každé družstvo na novou stránku', type: 'bool', def: false },
  ],
  columns: COMPOSITION_COLUMNS,
  defaults: { orientation: 'portrait', columns: 1 },
  needs: () => [{ dataset: 'teamComposition' }],
  render({ data, opts, cols: allCols, nameFormat }) {
    const tc = data.teamComposition || { teams: [], rounds: 0 };
    const ctx = { nameFormat };
    let teams = [...tc.teams];
    if (opts.teamOrder === 'alpha') teams.sort((a, b) => collator.compare(a.name, b.name));
    const pruned = pruneEmpty(allCols, teams.flatMap((t) => t.players), ctx);
    // Rozvinutí zástupného sloupce na sloupce kol 1…N
    const cols = pruned.flatMap((c) => (c.key !== 'rounds' ? [c] : Array.from({ length: tc.rounds }, (_, j) => ({
      ...c, key: `r${j + 1}`, label: String(j + 1), get: (p) => esc(roundCell(p.results?.[j])),
    }))));
    const blocks = [];
    teams.forEach((t, i) => {
      const title = sectionTitle(t.no != null && opts.teamOrder !== 'alpha' ? `${t.no}. ${t.name}` : t.name, `${t.players.length} ${t.players.length === 1 ? 'hráč' : t.players.length < 5 ? 'hráči' : 'hráčů'}`);
      if (opts.teamPerPage && i > 0) title.breakBefore = true;
      else if (i > 0) title.spaceBefore = 2;
      blocks.push(title);
      blocks.push({
        type: 'table', className: 'grid roster', colgroup: colgroup(cols), thead: theadRow(cols),
        rows: t.players.map((p) => bodyRow(cols, p, ctx)), keepTogether: opts.keepTogether !== false, widthGroup: 'teams',
      });
    });
    if (!blocks.length) blocks.push(noteBlock('Soupisky zatím nejsou na chess-results k dispozici.'));
    const title = (CLUB_ROSTER_TITLES[opts.heading] || CLUB_ROSTER_TITLES.teams) + ' s výsledky kol';
    return {
      title,
      sub: '',
      blocks,
      warnings: tc.teams.length ? [] : ['Soupisky s výsledky kol (Team-Composition) zatím nejsou na chess-results zveřejněné.'],
    };
  },
};

// Křížová tabulka turnaje každý s každým (chess-results art=4). Řádky i sloupce jsou hráči;
// lze řadit podle pořadí (jako chess-results) nebo podle startovních čísel a vytisknout i prázdnou
// tabulku k ručnímu vyplňování.

import {
  esc, fmtName, fmtRating, fmtPoints, theadRow, colgroup, bodyRow, noteBlock, pruneEmpty,
} from './common.js';

const XT_COLUMNS = [
  { key: 'no', label: 'Č.', cls: 'c num strong', width: '2.6em', get: (r) => esc(r.no ?? '') },
  { key: 'startNo', label: 'St.č.', cls: 'c num muted', width: '3em', def: false, get: (r) => esc(r.startNo ?? '') },
  { key: 'title', hideEmpty: true, label: 'Tit.', cls: 'c title', width: '2.8em', get: (r) => esc(r.title || '') },
  { key: 'name', label: 'Jméno', cls: 'name', get: (r, ctx) => esc(fmtName(r.name, ctx.nameFormat)) },
  { key: 'rating', hideEmpty: true, label: 'RtgF', cls: 'c num', width: '3.2em', get: (r) => fmtRating(r.rating) },
  { key: 'club', hideEmpty: true, label: 'Klub', cls: 'club', def: false, get: (r) => esc(r.club || '') },
  // Zástupný sloupec: při sazbě se rozvine na sloupce 1…N s výsledky proti jednotlivým soupeřům
  { key: 'cross', label: '1…N', cls: 'c xt', width: '2.2em', get: () => '' },
  { key: 'points', hideEmpty: true, label: 'Body', cls: 'c num strong', width: '3em', get: (r) => fmtPoints(r.points) },
  { key: 'rank', hideEmpty: true, label: 'Poř.', cls: 'c num strong', width: '2.8em', get: (r) => esc(r.rank ?? '') },
  ...[1, 2, 3].map((i) => ({ key: `tb${i}`, hideEmpty: true, label: `PH${i}`, cls: 'c num', width: '3em', def: i === 1, get: (r) => esc(r.tb?.[i - 1] ?? '') })),
];

/** Výsledek do buňky: „½“, „1“, „0“, „+“, „−“. */
function cellText(v) {
  const t = String(v ?? '').trim();
  if (!t || t === '*') return '';
  return t === '-' ? '−' : t;
}

/**
 * Hráči a matice výsledků v požadovaném pořadí.
 * chess-results: řádky podle pořadí, sloupce odpovídají řádkům (pozice 1…N).
 */
export function crossMatrix(xt, players, sort) {
  const rows = (xt && xt.rows) || [];
  let list;
  let res;
  if (rows.length && rows.some((r) => r.cross && r.cross.length)) {
    list = rows.map((r) => ({ ...r }));
    res = rows.map((r) => list.map((_, j) => (r.cross || [])[j] ?? ''));
  } else {
    // Křížová tabulka zatím není (před 1. kolem) – prázdná tabulka ze startovní listiny
    list = [...(players || [])].sort((a, b) => (a.startNo || 0) - (b.startNo || 0)).map((p) => ({ ...p, rank: null, points: null, tb: [] }));
    res = list.map(() => list.map(() => ''));
  }
  // Doplnění údajů ze startovní listiny (titul, klub, rating)
  const idx = new Map((players || []).map((p) => [p.startNo, p]));
  list = list.map((r) => {
    const p = idx.get(r.startNo);
    return p ? { ...r, title: r.title || p.title, club: r.club || p.club, rating: r.rating || p.rating } : r;
  });
  let order = list.map((_, i) => i);
  if (sort === 'startNo') order = order.sort((a, b) => (list[a].startNo || 0) - (list[b].startNo || 0));
  return {
    players: order.map((i, k) => ({ ...list[i], no: k + 1 })),
    cells: order.map((i) => order.map((j) => (i === j ? '*' : res[i][j]))),
  };
}

export const crossTable = {
  id: 'crosstable',
  name: 'Křížová tabulka',
  description: 'Turnaj každý s každým: výsledky všech hráčů proti sobě. I prázdná k ručnímu vyplňování.',
  group: 'Seznamy',
  supports: (info) => !info.isTeam && info.system === 'roundrobin',
  roundMode: 'ranking',
  options: [
    { key: 'sort', label: 'Řazení', type: 'select', def: 'rank', choices: [['rank', 'podle pořadí (jako chess-results)'], ['startNo', 'podle startovních čísel']] },
    { key: 'results', label: 'Vyplnit výsledky (vypnuto = prázdná tabulka k vyplnění)', type: 'bool', def: true },
  ],
  columns: XT_COLUMNS,
  defaults: { orientation: 'landscape', columns: 1 },
  needs: ({ round }) => [{ dataset: 'main' }, { dataset: 'crosstable', round, optional: true }],
  render({ data, round, opts, cols: allCols, nameFormat }) {
    const xt = data.crosstable;
    const { players, cells } = crossMatrix(xt, data.main?.players, opts.sort);
    const ctx = { nameFormat };
    const showRes = opts.results !== false;
    const base = showRes ? allCols : allCols.filter((c) => !['points', 'rank'].includes(c.key) && !/^tb/.test(c.key));
    const tbCount = (xt && xt.tiebreaks && xt.tiebreaks.length) || 0;
    const pruned = pruneEmpty(base.filter((c) => c.key === 'cross' || !/^tb/.test(c.key) || Number(c.key.slice(2)) <= tbCount), players, ctx);
    // Rozvinutí zástupného sloupce na sloupce 1…N
    const cols = pruned.flatMap((c) => (c.key !== 'cross' ? [c] : players.map((_, j) => ({
      ...c,
      key: `x${j + 1}`,
      label: String(j + 1),
      get: (r) => {
        const v = cells[r.no - 1][j];
        if (v === '*') return '';
        return showRes ? esc(cellText(v)) : '';
      },
    }))));
    const rows = players.map((p) => {
      let html = bodyRow(cols, p, ctx);
      // Úhlopříčka (hráč sám proti sobě) – šedá buňka
      const diag = cols.findIndex((c) => c.key === `x${p.no}`);
      if (diag >= 0) {
        let n = -1;
        html = html.replace(/<td class="([^"]*)"/g, (m, cls) => { n += 1; return n === diag ? `<td class="${cls} diag"` : m; });
      }
      return html;
    });
    const blocks = players.length
      ? [{ type: 'table', className: 'grid crosstable sym', colgroup: colgroup(cols), thead: theadRow(cols), rows }]
      : [noteBlock('Startovní listina ani křížová tabulka zatím nejsou k dispozici.')];
    const r = (xt && xt.round) || round;
    const title = !showRes ? 'Křížová tabulka' : xt && xt.final ? 'Křížová tabulka – konečné pořadí' : r ? `Křížová tabulka po ${r}. kole` : 'Křížová tabulka';
    const warnings = [];
    if (showRes && !(xt && xt.rows && xt.rows.length)) warnings.push('Křížová tabulka zatím není na chess-results zveřejněná – tiskne se prázdná podle startovní listiny.');
    return { title, sub: opts.sort === 'startNo' ? 'podle startovních čísel' : '', blocks, warnings };
  },
};

// Los kola jednotlivců: běžná tabulka, velká varianta na nástěnku a abecední přehled.

import {
  esc, fmtName, fmtRating, fmtResult, fmtPoints, fmtDate, byeLabel, theadRow, colgroup,
  bodyRow, playerIndex, collator, noteBlock, pruneEmpty,
} from './common.js';

/** Najde v datech losu požadované kolo (kruhový systém má všechna kola najednou). */
export function pickRound(pairingsData, round) {
  const rounds = (pairingsData && pairingsData.rounds) || [];
  if (!rounds.length) return null;
  if (round == null) return rounds[rounds.length - 1];
  return rounds.find((r) => r.round === round) || (rounds.length === 1 && rounds[0].round == null ? rounds[0] : null);
}

/** Doplní k hráčům v losu údaje ze startovní listiny (klub, titul, kategorie…). */
export function enrichPairings(round, players) {
  if (!round) return [];
  const idx = playerIndex(players);
  const fill = (s) => {
    if (!s) return s;
    const p = s.startNo != null ? idx.get(s.startNo) : null;
    if (!p) return s;
    return {
      ...p,
      ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== '' && v != null)),
      club: s.club || p.club,
      group: p.group,
      ratingNat: s.ratingNat ?? p.ratingNat,
      title: s.title || p.title,
    };
  };
  return round.pairings.map((p) => ({ ...p, white: fill(p.white), black: fill(p.black) }));
}

function roundSub(round) {
  if (!round) return '';
  const parts = [];
  if (round.date) parts.push(fmtDate(round.date));
  if (round.time) parts.push(round.time);
  return parts.join(', ');
}

function side(s, ctx, fn) {
  if (!s) return '';
  return fn(s, ctx);
}

const nm = (s, ctx) => esc(fmtName(s.name, ctx.nameFormat));

/** Sloupce tabulky losu. */
const PAIRING_COLUMNS = [
  { key: 'board', label: 'Š.', cls: 'c num', width: '2.2em', get: (p) => esc(p.board ?? '') },
  { key: 'wNo', label: 'č.', cls: 'c num muted', width: '2.4em', get: (p) => esc(p.white?.startNo ?? '') },
  { key: 'wTitle', hideEmpty: true, label: '', cls: 'c title', width: '2.6em', get: (p) => esc(p.white?.title || '') },
  { key: 'wName', label: 'Bílý', cls: 'name', get: (p, ctx) => side(p.white, ctx, nm) },
  { key: 'wFed', hideEmpty: true, label: 'Fed', cls: 'c', def: false, get: (p) => esc(p.white?.fed || '') },
  { key: 'wRating', hideEmpty: true, label: 'Elo', cls: 'r num', width: '3em', get: (p) => fmtRating(p.white?.rating) },
  { key: 'wRatingNat', hideEmpty: true, label: 'Elo nár.', cls: 'r num', def: false, get: (p) => fmtRating(p.white?.ratingNat) },
  { key: 'wClub', hideEmpty: true, label: 'Klub', cls: 'club', def: false, get: (p) => esc(p.white?.club || '') },
  { key: 'wPoints', hideEmpty: true, label: 'B.', cls: 'c num', width: '2.4em', get: (p) => fmtPoints(p.white?.points) },
  { key: 'result', label: 'Výsledek', cls: 'c res', width: '5em', get: (p, ctx) => resultCell(p, ctx) },
  { key: 'bPoints', hideEmpty: true, label: 'B.', cls: 'c num', width: '2.4em', get: (p) => (p.black ? fmtPoints(p.black.points) : '') },
  { key: 'bTitle', hideEmpty: true, label: '', cls: 'c title', width: '2.6em', get: (p) => esc(p.black?.title || '') },
  { key: 'bName', label: 'Černý', cls: 'name', get: (p, ctx) => (p.black ? nm(p.black, ctx) : `<span class="bye">${esc(byeLabel(p.bye))}</span>`) },
  { key: 'bFed', hideEmpty: true, label: 'Fed', cls: 'c', def: false, get: (p) => esc(p.black?.fed || '') },
  { key: 'bRating', hideEmpty: true, label: 'Elo', cls: 'r num', width: '3em', get: (p) => fmtRating(p.black?.rating) },
  { key: 'bRatingNat', hideEmpty: true, label: 'Elo nár.', cls: 'r num', def: false, get: (p) => fmtRating(p.black?.ratingNat) },
  { key: 'bClub', hideEmpty: true, label: 'Klub', cls: 'club', def: false, get: (p) => esc(p.black?.club || '') },
  { key: 'bNo', label: 'č.', cls: 'c num muted', width: '2.4em', get: (p) => esc(p.black?.startNo ?? '') },
];

function resultCell(p, ctx) {
  if (!ctx.opts.showResults) return '';
  return esc(fmtResult(p.result));
}

function filterPairings(list, opts) {
  return list.filter((p) => opts.showByes !== false || p.black);
}

function roundWarnings(info, round, requested) {
  const w = [];
  if (!round || !round.pairings.length) {
    w.push(`Los ${requested}. kola zatím není na chess-results zveřejněn${info.lastPairedRound ? ` (poslední zveřejněné kolo: ${info.lastPairedRound}.)` : ''}.`);
  }
  return w;
}

const roundNeeds = ({ round }) => [{ dataset: 'main' }, { dataset: 'pairings', round }];

const baseOptions = [
  { key: 'showResults', label: 'Zobrazit výsledky (pokud jsou známy)', type: 'bool', def: false },
  { key: 'showByes', label: 'Uvést volno a nenasazené hráče', type: 'bool', def: true },
];

export const pairingsTable = {
  id: 'pairings',
  name: 'Los kola',
  description: 'Tabulka dvojic s čísly šachovnic, body a ratingem.',
  group: 'Los kola',
  supports: (info) => !info.isTeam,
  roundMode: 'pairings',
  options: baseOptions,
  columns: PAIRING_COLUMNS,
  defaults: { orientation: 'portrait', fontSize: null, columns: 1 },
  needs: roundNeeds,
  render({ info, data, round: rq, opts, cols: allCols, nameFormat }) {
    const round = pickRound(data.pairings, rq);
    const list = filterPairings(enrichPairings(round, data.main?.players), opts);
    const ctx = { opts, nameFormat };
    const cols = pruneEmpty(allCols, list, ctx);
    const blocks = [];
    if (list.length) {
      blocks.push({
        type: 'table',
        className: 'grid pairings',
        colgroup: colgroup(cols),
        thead: theadRow(cols),
        rows: list.map((p) => bodyRow(cols, p, ctx, p.black ? '' : 'bye-row')),
      });
    } else {
      blocks.push(noteBlock('Pro toto kolo nejsou k dispozici žádné dvojice.'));
    }
    return {
      title: `Los ${rq}. kola`,
      sub: roundSub(round),
      blocks,
      warnings: roundWarnings(info, round, rq),
    };
  },
};

// ---------------------------------------------------------------------------
// Velká varianta na nástěnku – vše na jednu stránku, písmo co největší
// ---------------------------------------------------------------------------

const BOARD_COLUMNS = [
  { key: 'board', label: 'Šach.', cls: 'c num strong', get: (p) => esc(p.board ?? '') },
  { key: 'wNo', label: 'č.', cls: 'c num muted', def: false, get: (p) => esc(p.white?.startNo ?? '') },
  { key: 'wName', label: 'Bílý', cls: 'name', get: (p, ctx) => boardName(p.white, ctx) },
  { key: 'wPoints', label: 'B.', cls: 'c num', get: (p) => fmtPoints(p.white?.points) },
  { key: 'result', label: '', cls: 'c res', get: (p, ctx) => (ctx.opts.showResults ? esc(fmtResult(p.result)) || '–' : '–') },
  { key: 'bPoints', label: 'B.', cls: 'c num', get: (p) => (p.black ? fmtPoints(p.black.points) : '') },
  { key: 'bName', label: 'Černý', cls: 'name', get: (p, ctx) => (p.black ? boardName(p.black, ctx) : `<span class="bye">${esc(byeLabel(p.bye))}</span>`) },
  { key: 'bNo', label: 'č.', cls: 'c num muted', def: false, get: (p) => esc(p.black?.startNo ?? '') },
];

function boardName(s, ctx) {
  if (!s) return '';
  const t = ctx.opts.showTitle && s.title ? `<span class="title">${esc(s.title)}</span> ` : '';
  return `${t}${esc(fmtName(s.name, ctx.nameFormat))}`;
}

export const pairingsBoard = {
  id: 'pairings-board',
  name: 'Los kola – nástěnka',
  description: 'Velké a čitelné dvojice, automaticky zmenšené na jednu stránku.',
  group: 'Los kola',
  supports: (info) => !info.isTeam,
  roundMode: 'pairings',
  options: [
    { key: 'showResults', label: 'Zobrazit výsledky (pokud jsou známy)', type: 'bool', def: false },
    { key: 'showByes', label: 'Uvést volno a nenasazené hráče', type: 'bool', def: true },
    { key: 'showTitle', label: 'Tituly u jmen', type: 'bool', def: true },
    { key: 'maxPt', label: 'Největší písmo (pt)', type: 'number', def: 26, min: 10, max: 60 },
    { key: 'autoColumns', label: 'Při velkém počtu dvojic dělit do sloupců', type: 'bool', def: true },
  ],
  columns: BOARD_COLUMNS,
  defaults: { orientation: 'portrait', fontSize: null, columns: 1 },
  needs: roundNeeds,
  layout: (opts) => ({ fit: { enabled: true, minPt: 6, maxPt: Number(opts.maxPt) || 26, autoColumns: opts.autoColumns !== false, preferSingleAbovePt: 13 }, docClass: 'board-doc' }),
  render({ info, data, round: rq, opts, cols, nameFormat }) {
    const round = pickRound(data.pairings, rq);
    const list = filterPairings(enrichPairings(round, data.main?.players), opts);
    const ctx = { opts, nameFormat };
    const blocks = list.length
      ? [{ type: 'table', className: 'grid board-pairings', thead: theadRow(cols), rows: list.map((p) => bodyRow(cols, p, ctx, p.black ? '' : 'bye-row')) }]
      : [noteBlock('Pro toto kolo nejsou k dispozici žádné dvojice.')];
    return { title: `Los ${rq}. kola`, sub: roundSub(round), blocks, warnings: roundWarnings(info, round, rq) };
  },
};

// ---------------------------------------------------------------------------
// Abecední přehled: kdo kde hraje
// ---------------------------------------------------------------------------

const ALPHA_COLUMNS = [
  { key: 'name', label: 'Hráč', cls: 'name', get: (r, ctx) => esc(fmtName(r.me.name, ctx.nameFormat)) },
  { key: 'no', label: 'č.', cls: 'c num muted', def: false, get: (r) => esc(r.me.startNo ?? '') },
  { key: 'points', label: 'B.', cls: 'c num', def: false, get: (r) => fmtPoints(r.me.points) },
  { key: 'board', label: 'Šach.', cls: 'c num strong', get: (r) => (r.opp ? esc(r.board ?? '') : '') },
  { key: 'color', label: 'Barva', cls: 'c', get: (r) => (r.opp ? (r.color === 'w' ? 'bílé' : 'černé') : '') },
  { key: 'opponent', label: 'Soupeř', cls: 'name', get: (r, ctx) => (r.opp ? esc(fmtName(r.opp.name, ctx.nameFormat)) : `<span class="bye">${esc(byeLabel(r.bye))}</span>`) },
];

export const pairingsAlpha = {
  id: 'pairings-alpha',
  name: 'Los kola – abecedně (kdo kde hraje)',
  description: 'Abecední seznam hráčů s číslem šachovnice a barvou. Ideální k losu na nástěnku.',
  group: 'Los kola',
  supports: (info) => !info.isTeam,
  roundMode: 'pairings',
  options: [
    { key: 'showByes', label: 'Uvést volno a nenasazené hráče', type: 'bool', def: true },
    { key: 'fitOnePage', label: 'Zmenšit na jednu stránku', type: 'bool', def: true },
  ],
  columns: ALPHA_COLUMNS,
  defaults: { orientation: 'portrait', fontSize: null, columns: 2 },
  needs: roundNeeds,
  layout: (opts) => (opts.fitOnePage !== false ? { fit: { enabled: true, minPt: 6, maxPt: 18, autoColumns: true, preferSingleAbovePt: 30 } } : {}),
  render({ info, data, round: rq, opts, cols, nameFormat }) {
    const round = pickRound(data.pairings, rq);
    const list = enrichPairings(round, data.main?.players);
    const rows = [];
    for (const p of list) {
      if (p.white) rows.push({ me: p.white, opp: p.black, board: p.board, color: 'w', bye: p.bye });
      if (p.black) rows.push({ me: p.black, opp: p.white, board: p.board, color: 'b' });
    }
    const filtered = rows.filter((r) => opts.showByes !== false || r.opp);
    filtered.sort((a, b) => collator.compare(a.me.name, b.me.name));
    const ctx = { opts, nameFormat };
    const blocks = filtered.length
      ? [{ type: 'table', className: 'grid alpha', thead: theadRow(cols), rows: filtered.map((r) => bodyRow(cols, r, ctx, r.opp ? '' : 'bye-row')) }]
      : [noteBlock('Pro toto kolo nejsou k dispozici žádné dvojice.')];
    return { title: `Los ${rq}. kola – abecedně`, sub: roundSub(round), blocks, warnings: roundWarnings(info, round, rq) };
  },
};

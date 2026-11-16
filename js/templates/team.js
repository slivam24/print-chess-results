// Výstupy pro soutěže družstev: los zápasů a rozpis hráčů na šachovnicích.

import { esc, fmtName, fmtRating, fmtResult, fmtPoints, fmtDate, colorLabel, theadRow, colgroup, bodyRow, noteBlock } from './common.js';

function roundSub(round) {
  if (!round) return '';
  return [round.date ? fmtDate(round.date) : '', round.time || ''].filter(Boolean).join(', ');
}

/** Kolo ze šachovnic (art=3), případně ze zápasů (art=2). */
export function teamRound(data, rq) {
  const pick = (d) => {
    const rs = (d && d.rounds) || [];
    return rs.find((r) => r.round === rq) || (rs.length === 1 ? rs[0] : null);
  };
  const boards = pick(data.boards);
  if (boards && boards.matches.length) return { ...boards, source: 'boards' };
  const tp = pick(data.teamPairings);
  if (tp && tp.matches.length) {
    return { ...tp, source: 'teamPairings', lineupsPublished: false, matches: tp.matches.map((m) => ({ ...m, home: { ...m.home }, away: m.away && { ...m.away }, boards: [] })) };
  }
  return null;
}

function matchPlayed(m) {
  if ((m.boards || []).some((b) => b.result && b.result.played)) return true;
  return !(m.boards || []).length && !!m.score && m.score.home != null && (m.score.home + m.score.away) > 0;
}

function scoreText(m) {
  if (!m.score || m.score.home == null) return '';
  return `${fmtPoints(m.score.home)} : ${fmtPoints(m.score.away)}`;
}

function teamWarnings(round, rq) {
  if (!round) return [`Los ${rq}. kola družstev zatím není na chess-results zveřejněn.`];
  if (!round.lineupsPublished) return [`Sestavy družstev pro ${rq}. kolo zatím nejsou zveřejněné – šachovnice zůstanou prázdné k ručnímu vyplnění.`];
  return [];
}

const needs = ({ round }) => [{ dataset: 'boards', round }, { dataset: 'teamPairings', round, optional: true }];

// ---------------------------------------------------------------------------
// Los zápasů
// ---------------------------------------------------------------------------

const MATCH_COLUMNS = [
  { key: 'no', label: 'Zápas', cls: 'c num', width: '3.4em', get: (m) => esc(m.no ?? '') },
  { key: 'homeNo', label: 'č.', cls: 'c num muted', width: '2.4em', get: (m) => esc(m.home?.no ?? '') },
  { key: 'home', label: 'Domácí', cls: 'name strong', get: (m) => esc(m.home?.name || '') },
  { key: 'score', label: 'Výsledek', cls: 'c res', width: '6em', get: (m, ctx) => (ctx.opts.showResults && matchPlayed(m) ? esc(scoreText(m)) : '–') },
  { key: 'away', label: 'Hosté', cls: 'name strong', get: (m) => (m.away ? esc(m.away.name) : '<span class="bye">volno</span>') },
  { key: 'awayNo', label: 'č.', cls: 'c num muted', width: '2.4em', get: (m) => esc(m.away?.no ?? '') },
];

export const teamMatches = {
  id: 'team-matches',
  name: 'Los zápasů družstev',
  description: 'Přehled zápasů kola (domácí – hosté), volitelně s výsledky.',
  group: 'Družstva',
  supports: (info) => info.isTeam,
  roundMode: 'pairings',
  options: [
    { key: 'showResults', label: 'Zobrazit výsledky (pokud jsou známy)', type: 'bool', def: false },
    { key: 'bigOnePage', label: 'Velké písmo na jednu stránku (nástěnka)', type: 'bool', def: false },
  ],
  columns: MATCH_COLUMNS,
  defaults: { orientation: 'portrait', columns: 1 },
  needs,
  layout: (opts) => (opts.bigOnePage ? { fit: { enabled: true, minPt: 8, maxPt: 32, autoColumns: false }, docClass: 'board-doc' } : {}),
  render({ data, round: rq, opts, cols }) {
    const round = teamRound(data, rq);
    const ctx = { opts };
    const blocks = round
      ? [{ type: 'table', className: 'grid matches', colgroup: colgroup(cols), thead: theadRow(cols), rows: round.matches.map((m) => bodyRow(cols, m, ctx)) }]
      : [noteBlock('Pro toto kolo nejsou k dispozici žádné zápasy.')];
    return { title: `Los ${rq}. kola`, sub: roundSub(round), blocks, warnings: round ? [] : teamWarnings(round, rq) };
  },
};

// ---------------------------------------------------------------------------
// Rozpis hráčů na šachovnicích
// ---------------------------------------------------------------------------

function playerHtml(s, ctx) {
  if (!s || s.empty || !s.name) return '<span class="blank-line"></span>';
  const t = s.title ? `<span class="title">${esc(s.title)}</span> ` : '';
  return `${t}${esc(fmtName(s.name, ctx.nameFormat))}`;
}

const BOARD_COLUMNS = [
  { key: 'board', label: 'Š.', cls: 'c num strong', width: '2.4em', get: (b) => esc(b.board ?? '') },
  { key: 'homeColor', label: '', cls: 'c muted', width: '1.8em', get: (b) => colorLabel(b.home.color) },
  { key: 'home', label: 'Domácí', cls: 'name', get: (b, ctx) => playerHtml(b.home, ctx) },
  { key: 'homeRating', label: 'Elo', cls: 'r num', width: '3.2em', get: (b) => fmtRating(b.home.rating) },
  { key: 'result', label: 'Výsledek', cls: 'c res write', width: '5.5em', get: (b, ctx) => (ctx.opts.showResults ? esc(fmtResult(b.result)) : '') },
  { key: 'awayColor', label: '', cls: 'c muted', width: '1.8em', get: (b) => colorLabel(b.away.color) },
  { key: 'away', label: 'Hosté', cls: 'name', get: (b, ctx) => playerHtml(b.away, ctx) },
  { key: 'awayRating', label: 'Elo', cls: 'r num', width: '3.2em', get: (b) => fmtRating(b.away.rating) },
];

/** Doplní rating a titul hráčů ze soupisek (stránka šachovnic rating neuvádí). */
function enrichBoards(match, players) {
  if (!players || !players.length) return match;
  const key = (team, name) => `${team}|${name}`;
  const idx = new Map(players.map((p) => [key(p.team, p.name), p]));
  const fill = (s, team) => {
    if (!s || !s.name) return s;
    const p = idx.get(key(team, s.name));
    return p ? { ...s, rating: s.rating ?? p.rating, title: s.title || p.title } : s;
  };
  return { ...match, boards: match.boards.map((b) => ({ ...b, home: fill(b.home, match.home?.name), away: fill(b.away, match.away?.name) })) };
}

/** Prázdné šachovnice, když sestavy nejsou známy (počet podle soupisky nebo volby). */
function blankBoards(n) {
  return Array.from({ length: n }, (_, i) => ({
    board: i + 1,
    home: { empty: true, color: i % 2 === 0 ? 'w' : 'b' },
    away: { empty: true, color: i % 2 === 0 ? 'b' : 'w' },
    result: { played: false },
  }));
}

export const teamBoards = {
  id: 'team-boards',
  name: 'Rozpis hráčů na šachovnicích',
  description: 'Každý zápas se sestavami na šachovnicích, barvami a místem pro výsledky a podpisy kapitánů.',
  group: 'Družstva',
  supports: (info) => info.isTeam,
  roundMode: 'pairings',
  options: [
    { key: 'showResults', label: 'Zobrazit výsledky (pokud jsou známy)', type: 'bool', def: false },
    { key: 'matchPerPage', label: 'Každý zápas na samostatnou stránku', type: 'bool', def: false },
    { key: 'signatures', label: 'Podpisy kapitánů a rozhodčího', type: 'bool', def: true },
    { key: 'blankBoards', label: 'Počet šachovnic, když sestavy nejsou známy', type: 'number', def: 8, min: 1, max: 20 },
    { key: 'ratings', label: 'Doplnit Elo ze soupisek', type: 'bool', def: true },
  ],
  columns: BOARD_COLUMNS,
  defaults: { orientation: 'portrait', columns: 1 },
  needs: ({ round, opts }) => [...needs({ round }), ...(opts && opts.ratings === false ? [] : [{ dataset: 'teamPlayers', optional: true }])],
  render({ data, round: rq, opts, cols, nameFormat }) {
    const round = teamRound(data, rq);
    const ctx = { opts, nameFormat };
    const blocks = [];
    if (!round) {
      blocks.push(noteBlock('Pro toto kolo nejsou k dispozici žádné zápasy.'));
      return { title: `Rozpis šachovnic – ${rq}. kolo`, sub: '', blocks, warnings: teamWarnings(round, rq) };
    }
    round.matches.forEach((m0, i) => {
      if (!m0.away) return;
      const m = opts.ratings === false ? m0 : enrichBoards(m0, data.teamPlayers?.players);
      const boards = m.boards && m.boards.length ? m.boards : blankBoards(Number(opts.blankBoards) || 8);
      const played = opts.showResults && matchPlayed(m);
      const head = `<div class="match-head">
          <span class="m-no">Zápas ${esc(m.no ?? i + 1)}</span>
          <span class="m-team">${esc(m.home?.name || '')}</span>
          <span class="m-vs">${played ? esc(scoreText(m)) : '–'}</span>
          <span class="m-team">${esc(m.away?.name || '')}</span>
        </div>`;
      const rows = boards.map((b) => bodyRow(cols, b, ctx));
      if (!played) {
        const total = cols.map((c) => (c.key === 'result' ? '<td class="c res write strong">:</td>' : c.key === 'home' || c.key === 'away' ? '<td class="r muted">celkem</td>' : '<td></td>'));
        rows.push(`<tr class="total-row">${total.join('')}</tr>`);
      }
      blocks.push({ type: 'html', html: head, keepWithNext: true, breakBefore: opts.matchPerPage && i > 0 });
      blocks.push({ type: 'table', className: 'grid boards', colgroup: colgroup(cols), thead: theadRow(cols), rows, keepTogether: true });
      if (opts.signatures !== false) {
        blocks.push({ type: 'html', html: '<div class="signs three"><div class="sign">Kapitán domácích</div><div class="sign">Kapitán hostů</div><div class="sign">Rozhodčí</div></div>' });
      }
    });
    return { title: `Rozpis šachovnic – ${rq}. kolo`, sub: roundSub(round), blocks, warnings: teamWarnings(round, rq) };
  },
};

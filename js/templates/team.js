// Výstupy pro soutěže družstev: los zápasů a rozpis hráčů na šachovnicích.

import {
  esc, fmtName, fmtRating, fmtResult, fmtPoints, fmtDate, fmtDateTime, colorLabel, theadRow, colgroup, bodyRow, noteBlock, sectionTitle, pruneEmpty, SYM_W,
} from './common.js';

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

/** Čísla kol, která data obsahují (pro „všechna kola najednou“). */
export function teamRoundNumbers(data) {
  const set = new Set();
  for (const d of [data.boards, data.teamPairings]) for (const r of (d && d.rounds) || []) if (r.round != null && r.matches.length) set.add(r.round);
  return [...set].sort((a, b) => a - b);
}

/** Každý s každým: los všech kol družstev najednou. */
const allRoundsTeam = (info) => info.isTeam && info.system === 'roundrobin';

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

/**
 * Body družstev před kolem (jako „Pts“ v losu Swiss-Manageru): z pořadí družstev
 * po předchozím kole – hlavní hodnocení (sloupec bodů, jinak první pomocné hodnocení,
 * které je u družstev hlavním kritériem). Před 1. kolem mají všichni 0.
 * Vrací Map(klíč družstva → body) nebo null, když pořadí není k dispozici.
 */
function pointsBefore(data, round) {
  if (round === 1) return 'zero';
  const rows = data.teamRanking && data.teamRanking.rows;
  if (!rows || !rows.length) return null;
  const map = new Map();
  for (const r of rows) {
    const raw = r.points != null ? r.points : (r.tb && r.tb[0]);
    const v = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(',', '.').replace('½', '.5'));
    if (!Number.isFinite(v)) continue;
    if (r.startNo != null) map.set(`no:${r.startNo}`, v);
    if (r.name) map.set(`name:${r.name}`, v);
  }
  return map;
}

function teamPts(ctx, team) {
  if (!ctx.opts.showPoints || !ctx.pts || !team) return '';
  if (ctx.pts === 'zero') return '0';
  const byNo = team.no != null ? ctx.pts.get(`no:${team.no}`) : undefined;
  const v = byNo ?? ctx.pts.get(`name:${team.name}`);
  return v == null ? '' : esc(fmtPoints(v));
}

const MATCH_COLUMNS = [
  { key: 'no', label: 'Zápas', cls: 'c num', width: '4.4em', get: (m) => esc(m.no ?? '') },
  { key: 'homeNo', label: 'č.', cls: 'c num muted', width: SYM_W.no, get: (m) => esc(m.home?.no ?? '') },
  { key: 'home', label: 'Domácí', cls: 'name strong', get: (m) => esc(m.home?.name || '') },
  { key: 'homePts', label: 'Body', cls: 'c num', width: '3.4em', hideEmpty: true, get: (m, ctx) => teamPts(ctx, m.home) },
  { key: 'score', label: 'Výsledek', cls: 'c res', width: '6em', get: (m, ctx) => (ctx.opts.showResults && matchPlayed(m) ? esc(scoreText(m)) : '–') },
  { key: 'awayPts', label: 'Body', cls: 'c num', width: '3.4em', hideEmpty: true, get: (m, ctx) => teamPts(ctx, m.away) },
  { key: 'away', label: 'Hosté', cls: 'name strong', get: (m) => (m.away ? esc(m.away.name) : '<span class="bye">volno</span>') },
  { key: 'awayNo', label: 'č.', cls: 'c num muted', width: SYM_W.no, get: (m) => esc(m.away?.no ?? '') },
];

export const teamMatches = {
  id: 'team-matches',
  name: 'Los zápasů družstev',
  description: 'Přehled zápasů kola (domácí – hosté), volitelně s výsledky.',
  group: 'Družstva',
  supports: (info) => info.isTeam,
  roundMode: 'pairings',
  allRounds: allRoundsTeam,
  options: [
    { key: 'showResults', label: 'Zobrazit výsledky (pokud jsou známy)', type: 'bool', def: false },
    { key: 'showPoints', label: 'Zobrazit body družstev před kolem (jako Swiss-Manager)', type: 'bool', def: false, onlySingleRound: true },
    { key: 'bigOnePage', label: 'Velké písmo na jednu stránku (nástěnka)', type: 'bool', def: false },
    { key: 'roundPerPage', label: 'Každé kolo na samostatné stránce', type: 'bool', def: false, onlyAllRounds: true },
    { key: 'roundGap', label: 'Mezera mezi koly (mm)', type: 'number', def: 6, min: 0, max: 60, step: 1, onlyAllRounds: true },
  ],
  columns: MATCH_COLUMNS,
  defaults: { orientation: 'portrait', columns: 1 },
  // Body před kolem: pořadí družstev po předchozím kole
  needs: ({ round, opts }) => [
    ...needs({ round }),
    ...(opts && opts.showPoints && typeof round === 'number' && round > 1 ? [{ dataset: 'teamRanking', round: round - 1, optional: true }] : []),
  ],
  layout: (opts) => (opts.bigOnePage ? { fit: { enabled: true, minPt: 8, maxPt: 32, autoColumns: false }, docClass: 'board-doc' } : {}),
  render({ data, round: rq, opts, cols }) {
    const ctx = { opts };
    if (rq === 'all') {
      const nums = teamRoundNumbers(data);
      const blocks = [];
      cols = cols.filter((c) => c.key !== 'homePts' && c.key !== 'awayPts'); // body jen u jednoho kola
      nums.forEach((n, i) => {
        const r = teamRound(data, n);
        const title = { ...sectionTitle(`${n}. kolo`, roundSub(r)), blockClass: 'sec-tight' };
        if (opts.roundPerPage && i > 0) title.breakBefore = true;
        else if (i > 0) title.spaceBefore = Math.max(0, Number(opts.roundGap) || 0);
        blocks.push(title);
        blocks.push({ type: 'table', className: 'grid matches sym', colgroup: colgroup(cols), thead: theadRow(cols), rows: r.matches.map((m) => bodyRow(cols, m, ctx)), keepTogether: true, blockClass: 'tight' });
      });
      return {
        title: 'Los všech kol',
        sub: nums.length ? `${nums.length} kol` : '',
        blocks: blocks.length ? blocks : [noteBlock('Los zatím není na chess-results zveřejněn.')],
        warnings: nums.length ? [] : ['Los zatím není na chess-results zveřejněn.'],
      };
    }
    const round = teamRound(data, rq);
    const warnings = round ? [] : teamWarnings(round, rq);
    if (opts.showPoints) {
      ctx.pts = pointsBefore(data, rq);
      if (!ctx.pts && round) warnings.push(`Body družstev nejsou k dispozici – pořadí po ${rq - 1}. kole zatím není na chess-results zveřejněno.`);
    }
    const used = round ? pruneEmpty(cols, round.matches, ctx) : cols;
    const blocks = round
      ? [{ type: 'table', className: 'grid matches sym', colgroup: colgroup(used), thead: theadRow(used), rows: round.matches.map((m) => bodyRow(used, m, ctx)) }]
      : [noteBlock('Pro toto kolo nejsou k dispozici žádné zápasy.')];
    return { title: `Los ${rq}. kola`, sub: roundSub(round), blocks, warnings };
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
  { key: 'homeColor', label: '', cls: 'c muted', width: SYM_W.color, def: false, get: (b) => colorLabel(b.home.color) },
  { key: 'homeRoster', label: 'Soup.', cls: 'c num', width: '4.2em', get: (b) => esc(b.home.rosterNo ?? '') },
  { key: 'home', label: 'Domácí', cls: 'name', get: (b, ctx) => playerHtml(b.home, ctx) },
  { key: 'homeRating', label: 'RtgF', cls: 'c num', width: SYM_W.rating, hideEmpty: true, get: (b) => fmtRating(b.home.rating) },
  { key: 'result', label: 'Výsledek', cls: 'c res write', width: '5.5em', get: (b, ctx) => (ctx.opts.showResults ? esc(fmtResult(b.result)) : '') },
  { key: 'awayColor', label: '', cls: 'c muted', width: SYM_W.color, def: false, get: (b) => colorLabel(b.away.color) },
  // hosté zrcadlově: jméno, pak pořadí na soupisce
  { key: 'away', label: 'Hosté', cls: 'name', get: (b, ctx) => playerHtml(b.away, ctx) },
  { key: 'awayRoster', label: 'Soup.', cls: 'c num', width: '4.2em', get: (b) => esc(b.away.rosterNo ?? '') },
  { key: 'awayRating', label: 'RtgF', cls: 'c num', width: SYM_W.rating, hideEmpty: true, get: (b) => fmtRating(b.away.rating) },
];

/**
 * Doplní ze soupisek pořadí hráče na soupisce, a volitelně rating a titul
 * (stránka šachovnic rating neuvádí).
 */
function enrichBoards(match, players, { ratings = true } = {}) {
  if (!players || !players.length) return match;
  const key = (team, name) => `${team}|${name}`;
  const idx = new Map(players.map((p) => [key(p.team, p.name), p]));
  const fill = (s, team) => {
    if (!s || !s.name) return s;
    const p = idx.get(key(team, s.name));
    if (!p) return s;
    const out = { ...s, rosterNo: s.rosterNo ?? p.board ?? null };
    return ratings ? { ...out, rating: s.rating ?? p.rating, title: s.title || p.title } : out;
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

/**
 * Sestavy nejsou zveřejněné: družstvo, které má na soupisce přesně tolik hráčů jako šachovnic,
 * může nastoupit jen v jednom složení – doplníme ho podle pořadí na soupisce.
 */
export function prefillLineups(match, players, nBoards) {
  if (!players || !players.length || !match.away) return { match, filled: [] };
  const filled = [];
  const roster = (team) => players.filter((p) => p.team === team).sort((a, b) => (Number(a.board) || 999) - (Number(b.board) || 999));
  const boards = (match.boards && match.boards.length ? match.boards : blankBoards(nBoards)).map((b) => ({ ...b, home: { ...b.home }, away: { ...b.away } }));
  for (const side of ['home', 'away']) {
    const team = match[side]?.name;
    if (boards.some((b) => b[side].name)) continue; // sestava je známá
    const list = roster(team);
    if (list.length !== boards.length) continue;
    boards.forEach((b, i) => {
      const p = list[i];
      b[side] = { ...b[side], empty: false, name: p.name, title: p.title || '', rating: p.rating ?? null, rosterNo: p.board ?? null };
    });
    filled.push(team);
  }
  return { match: { ...match, boards }, filled };
}

/** Sloupce s hráči nadepsané názvy družstev (vlastní nadpis z nastavení má přednost). */
function matchCols(cols, m) {
  return cols.map((c) => {
    if (c.customLabel) return c;
    if (c.key === 'home') return { ...c, label: m.home?.name || c.label };
    if (c.key === 'away') return { ...c, label: m.away?.name || c.label };
    return c;
  });
}

/** Zápasy kola se sestavami (doplněné Elo, pořadí na soupisce, případně sestava ze soupisky). */
function prepareMatches(round, data, opts) {
  const list = [];
  const filledTeams = new Set();
  for (const m0 of round.matches) {
    if (!m0.away) continue;
    let m = enrichBoards(m0, data.teamPlayers?.players, { ratings: opts.ratings !== false });
    const nBoards = m.boards && m.boards.length ? m.boards.length : Number(opts.blankBoards) || 8;
    if (opts.prefill !== false && !(m.boards || []).some((b) => b.home.name || b.away.name)) {
      const r = prefillLineups(m, data.teamPlayers?.players, nBoards);
      m = r.match;
      r.filled.forEach((t) => filledTeams.add(t));
    }
    list.push({ m, boards: m.boards && m.boards.length ? m.boards : blankBoards(nBoards) });
  }
  return { list, filledTeams };
}

function boardsBlocks(round, rq, prepared, opts, cols, ctx, first) {
  const blocks = [];
  let i = 0;
  for (const { m, boards } of prepared) {
    const played = opts.showResults && matchPlayed(m);
    const mc = matchCols(cols, m);
    // Názvy družstev jsou v hlavičce tabulky – nad ní stačí kolo a číslo zápasu (a skóre, je-li odehráno)
    const head = `<div class="match-head">
        <span class="m-no">Kolo ${esc(round.round ?? rq)}, Zápas ${esc(m.no ?? i + 1)}</span>
        ${played ? `<span class="m-score">${esc(scoreText(m))}</span>` : ''}
      </div>`;
    const rows = boards.map((b, bi) => bodyRow(mc, b, ctx, bi === boards.length - 1 ? 'last-row' : ''));
    if (!played) {
      // Řádek pro celkové skóre zápasu (jen dvojtečka ve sloupci výsledků)
      const total = mc.map((c) => (c.key === 'result' ? '<td class="c res write strong">:</td>' : '<td></td>'));
      rows.push(`<tr class="total-row">${total.join('')}</tr>`);
    }
    const headBlock = { type: 'html', html: head, keepWithNext: true };
    if (opts.matchPerPage && !(first && i === 0)) headBlock.breakBefore = true;
    else if (!(first && i === 0)) headBlock.spaceBefore = Math.max(0, Number(opts.matchGap) || 0);
    blocks.push(headBlock);
    // one-line: názvy družstev i jména hráčů na jeden řádek (při „max. písmu“ se písmo zmenší, aby se vešly)
    blocks.push({ type: 'table', className: 'grid boards sym one-line', colgroup: colgroup(mc), thead: theadRow(mc), rows, keepTogether: true });
    if (opts.signatures !== false) {
      blocks.push({ type: 'html', html: `<div class="signs three"><div class="sign">Kapitán – ${esc(m.home?.name || 'domácí')}</div><div class="sign">Kapitán – ${esc(m.away?.name || 'hosté')}</div><div class="sign">Rozhodčí</div></div>` });
    }
    i += 1;
  }
  return blocks;
}

export const teamBoards = {
  id: 'team-boards',
  name: 'Rozpis hráčů na šachovnicích',
  description: 'Každý zápas se sestavami na šachovnicích, barvami a místem pro výsledky a podpisy kapitánů – k rozstříhání.',
  group: 'Družstva',
  supports: (info) => info.isTeam,
  roundMode: 'pairings',
  allRounds: allRoundsTeam,
  options: [
    { key: 'showResults', label: 'Zobrazit výsledky (pokud jsou známy)', type: 'bool', def: false },
    { key: 'matchPerPage', label: 'Každý zápas na samostatnou stránku', type: 'bool', def: false },
    { key: 'matchGap', label: 'Mezera mezi zápasy (mm)', type: 'number', def: 12, min: 0, max: 80, step: 1 },
    { key: 'signatures', label: 'Podpisy kapitánů a rozhodčího', type: 'bool', def: false },
    { key: 'prefill', label: 'Doplnit sestavu ze soupisky, když má družstvo přesně tolik hráčů jako šachovnic', type: 'bool', def: true },
    { key: 'blankBoards', label: 'Počet šachovnic, když sestavy nejsou známy', type: 'number', def: 8, min: 1, max: 20 },
    { key: 'ratings', label: 'Doplnit Elo ze soupisek', type: 'bool', def: true },
  ],
  columns: BOARD_COLUMNS,
  // Rozpis se stříhá na jednotlivé zápasy – ve výchozím stavu bez záhlaví a zápatí stránky
  defaults: { orientation: 'portrait', columns: 1, header: 'off', footer: 'off' },
  // Soupisky: pořadí na soupisce, Elo a doplnění sestav
  // Soupisky pro doplnění sestav musí být aktuální (hráč mohl přibýt ráno u prezence)
  needs: ({ round }) => [...needs({ round }), { dataset: 'teamPlayers', optional: true, maxAgeMin: 10 }],
  render({ data, round: rq, opts, cols, nameFormat }) {
    const ctx = { opts, nameFormat };
    const rounds = rq === 'all' ? teamRoundNumbers(data).map((n) => teamRound(data, n)).filter(Boolean) : [teamRound(data, rq)].filter(Boolean);
    if (!rounds.length) {
      return { title: `Rozpis šachovnic – ${rq === 'all' ? 'všechna kola' : `${rq}. kolo`}`, sub: '', blocks: [noteBlock('Pro toto kolo nejsou k dispozici žádné zápasy.')], warnings: teamWarnings(null, rq) };
    }
    const blocks = [];
    const filled = new Set();
    let notPublished = false;
    const prepared = rounds.map((round) => prepareMatches(round, data, opts));
    // Prázdné sloupce (např. Elo u soutěží bez ratingu) se skryjí – ve všech zápasech stejně
    const usable = pruneEmpty(cols, prepared.flatMap((p) => p.list.flatMap((x) => x.boards)), ctx);
    rounds.forEach((round, ri) => {
      const b = boardsBlocks(round, rq, prepared[ri].list, opts, usable, ctx, ri === 0);
      if (rq === 'all' && ri > 0 && !opts.matchPerPage && b[0]) b[0] = { ...b[0], breakBefore: true, spaceBefore: undefined };
      blocks.push(...b);
      prepared[ri].filledTeams.forEach((t) => filled.add(t));
      if (!round.lineupsPublished) notPublished = true;
    });
    const warnings = [];
    if (notPublished) {
      const at = data.fetchedAt && data.fetchedAt.teamPlayers ? ` podle soupisek z chess-results (staženo ${fmtDateTime(data.fetchedAt.teamPlayers)})` : '';
      warnings.push(filled.size
        ? `Sestavy zatím nejsou zveřejněné – doplněny${at} u družstev, která mají přesně tolik hráčů jako šachovnic: ${[...filled].join(', ')}. Ostatní šachovnice zůstanou prázdné k vyplnění. Pokud některé družstvo má hráčů víc, než je na chess-results, doplněnou sestavu nepoužívejte (volba „Doplnit sestavu ze soupisky“).`
        : 'Sestavy družstev zatím nejsou zveřejněné – šachovnice zůstanou prázdné k ručnímu vyplnění.');
    }
    return {
      title: rq === 'all' ? 'Rozpis šachovnic – všechna kola' : `Rozpis šachovnic – ${rq}. kolo`,
      sub: rq === 'all' ? '' : roundSub(rounds[0]),
      blocks,
      warnings,
    };
  },
};

// ---------------------------------------------------------------------------
// Startovní pořadí družstev
// ---------------------------------------------------------------------------

const TEAM_START_COLUMNS = [
  { key: 'no', label: 'č.', cls: 'c num strong', width: '2.8em', get: (t) => esc(t.no ?? '') },
  { key: 'name', label: 'Družstvo', cls: 'name', get: (t) => esc(t.name) },
  { key: 'players', label: 'Hráčů', cls: 'c num', width: '3.6em', hideEmpty: true, get: (t) => esc(t.players ?? '') },
  { key: 'ratingAvg', label: 'Ø Elo', cls: 'c num', width: '4em', hideEmpty: true, get: (t) => fmtRating(t.ratingAvg) },
];

export const teamStartList = {
  id: 'team-startlist',
  name: 'Startovní pořadí družstev',
  description: 'Družstva podle startovních (losovacích) čísel s průměrným Elo.',
  group: 'Seznamy',
  supports: (info) => info.isTeam,
  roundMode: null,
  options: [],
  columns: TEAM_START_COLUMNS,
  defaults: { orientation: 'portrait', columns: 1 },
  needs: () => [{ dataset: 'teams' }, { dataset: 'teamPlayers', optional: true }],
  render({ data, cols }) {
    const players = data.teamPlayers?.players || [];
    const teams = [...(data.teams?.teams || [])]
      .sort((a, b) => (a.no ?? 999) - (b.no ?? 999))
      .map((t) => ({ ...t, players: players.length ? players.filter((p) => p.team === t.name).length || null : null }));
    const usable = pruneEmpty(cols, teams, {});
    return {
      title: 'Startovní pořadí družstev',
      sub: `${teams.length} družstev`,
      blocks: teams.length
        ? [{ type: 'table', className: 'grid startlist', colgroup: colgroup(usable), thead: theadRow(usable), rows: teams.map((t) => bodyRow(usable, t, {})) }]
        : [noteBlock('Seznam družstev zatím není k dispozici.')],
      warnings: teams.length ? [] : ['Seznam družstev zatím není na chess-results k dispozici.'],
    };
  },
};

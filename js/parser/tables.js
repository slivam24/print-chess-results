// Parsování datových tabulek chess-results: startovní listina, pořadí,
// los kola, družstva, zápasy družstev a rozpis šachovnic.

import {
  text, cellsOf, rowsOf, classList, isHeaderRow, isDataRow, isSectionRow,
  parseNum, parseIntSafe, parseResult, urlParam, dataTables, headingBefore,
  roundFromText, dateFromText, timeFromText, norm,
} from './dom.js';
import { mapHeader } from './headers.js';

const TITLES = /^(GM|IM|FM|CM|WGM|WIM|WFM|WCM|AGM|AIM|AFM|ACM|HGM|NM|WNM|CMM|LGM|LIM)$/;
const BYE_WORDS = /^(bye|volno|spielfrei|not paired|nenasazen|nicht gepaart|nicht ausgelost|kein partner|free|frei|pairing allocated bye|half point bye|zero point bye|full point bye)$/i;
const NO_PLAYER = /^(no player|bez hrace|kein spieler|bez hráče|n\.?n\.?)$/i;

/** Rozdělí tabulku na sekce (nadpisy kol / družstev) s hlavičkou a datovými řádky. */
export function splitTable(table) {
  const sections = [];
  let cur = null;
  const ensure = () => {
    if (!cur) {
      cur = { heading: null, headerCells: null, header: null, rows: [] };
      sections.push(cur);
    }
    return cur;
  };
  for (const tr of rowsOf(table)) {
    if (isSectionRow(tr)) {
      cur = { heading: text(tr), headerCells: null, header: null, rows: [] };
      sections.push(cur);
      continue;
    }
    if (isHeaderRow(tr)) {
      const s = ensure();
      if (s.header && s.rows.length) {
        // Nová hlavička uvnitř sekce (např. další zápas v rozpisu šachovnic)
        cur = { heading: s.heading, headerCells: null, header: null, rows: [] };
        sections.push(cur);
      }
      cur.headerCells = cellsOf(tr);
      cur.header = cur.headerCells.map((c) => text(c));
      continue;
    }
    if (isDataRow(tr)) ensure().rows.push(tr);
  }
  return sections.filter((s) => s.header || s.rows.length);
}

/** Hlavní datová tabulka stránky (první s hlavičkou obsahující některý z klíčů). */
function findTable(doc, requiredKeys) {
  for (const t of dataTables(doc)) {
    const secs = splitTable(t);
    for (const s of secs) {
      if (!s.header) continue;
      const keys = mapHeader(s.header).map((c) => c.key);
      if (requiredKeys.every((k) => (Array.isArray(k) ? k.some((x) => keys.includes(x)) : keys.includes(k)))) return t;
    }
  }
  return null;
}

function nameCell(cell) {
  const a = cell.querySelector('a');
  const href = a ? a.getAttribute('href') : null;
  const snr = href ? parseIntSafe(urlParam(href, 'snr')) : null;
  return { name: text(cell), href, snr };
}

function fedFromCell(cell) {
  for (const c of classList(cell)) if (/^[A-Z]{3}$/.test(c)) return c;
  const div = cell.querySelector && cell.querySelector('div[class^="tn_"]');
  if (div) return (div.getAttribute('class') || '').replace(/^tn_/, '').slice(0, 3);
  return null;
}

function rowFed(tr) {
  for (const c of classList(tr).slice(1)) if (/^[A-Z]{3}$/.test(c)) return c;
  return null;
}

/** Hodnoty jednoho řádku podle mapy sloupců. */
function readRow(tr, cols) {
  const cells = cellsOf(tr);
  const o = { tb: [], xt: [] };
  cols.forEach((col, i) => {
    const cell = cells[i];
    if (!cell || !col.key) return;
    const v = text(cell);
    switch (col.key) {
      case 'name': case 'white': case 'black': {
        const n = nameCell(cell);
        o.name = n.name;
        if (n.snr != null && o.snrFromLink == null) o.snrFromLink = n.snr;
        break;
      }
      case 'tb': o.tb[col.index - 1] = v; break;
      case 'xt': o.xt[col.index - 1] = v; break;
      case 'rating': case 'ratingNat': case 'ratingAvg': case 'rank': case 'startNo': case 'games':
      case 'wins': case 'draws': case 'losses': case 'fideId':
        if (o[col.key] == null) o[col.key] = parseIntSafe(v.replace(/\s/g, '')) ?? (v || null);
        break;
      case 'points': o.points = parseNum(v); o.pointsText = v; break;
      default:
        if (o[col.key] == null) o[col.key] = v;
    }
  });
  if (o.startNo == null && o.snrFromLink != null) o.startNo = o.snrFromLink;
  delete o.snrFromLink;
  if (!o.fed) o.fed = rowFed(tr);
  if (typeof o.title === 'string' && !o.title) delete o.title;
  return o;
}

/** Legenda pomocných hodnocení pod tabulkou pořadí („Tie Break1: Buchholz…“). */
export function parseTiebreakLegend(doc) {
  const out = [];
  const body = text(doc.body || doc.documentElement);
  const re = /(?:Tie Break|Pomocné hodnocení|Feinwertung|Wertung|TB)\s*(\d+)\s*:\s*(.+?)(?=(?:Tie Break|Pomocné hodnocení|Feinwertung|Wertung)\s*\d+\s*:|Chess-Tournament-Results-Server|$)/gi;
  let m;
  while ((m = re.exec(body))) {
    const i = Number(m[1]);
    if (!out[i - 1]) out[i - 1] = m[2].trim();
  }
  return out;
}

// ---------------------------------------------------------------------------
// Startovní listina (jednotlivci: art=0, družstva – hráči: art=16)
// ---------------------------------------------------------------------------

export function parseStartList(doc) {
  const table = findTable(doc, ['name', ['startNo', 'rank', 'board']]);
  if (!table) return { players: [], heading: null };
  const players = [];
  let heading = null;
  for (const sec of splitTable(table)) {
    if (!sec.header) continue;
    const cols = mapHeader(sec.header);
    if (!cols.some((c) => c.key === 'name')) continue;
    for (const tr of sec.rows) {
      const r = readRow(tr, cols);
      if (!r.name) continue;
      const p = {
        startNo: typeof r.startNo === 'number' ? r.startNo : null,
        title: r.title || '',
        name: r.name,
        fideId: typeof r.fideId === 'number' ? r.fideId : null,
        fed: r.fed || '',
        rating: typeof r.rating === 'number' ? r.rating : null,
        ratingNat: typeof r.ratingNat === 'number' ? r.ratingNat : null,
        club: r.club || '',
        type: r.type || '',
        group: r.group || '',
        sex: r.sex || '',
      };
      if (r.team) p.team = r.team;
      if (r.board != null) p.board = parseIntSafe(r.board) ?? r.board;
      players.push(p);
    }
  }
  const h = headingBefore(table);
  heading = h ? text(h) : null;
  // Které ratingy stránka uvádí: obecný „Rtg“ (chess-results neříká jaký), mezinárodní, národní
  const ratingInfo = { generic: false, international: false, national: false };
  for (const sec of splitTable(table)) {
    if (!sec.header) continue;
    for (const c of mapHeader(sec.header)) {
      if (c.key === 'rating') ratingInfo[c.generic ? 'generic' : 'international'] = true;
      if (c.key === 'ratingNat') ratingInfo.national = true;
    }
  }
  return { players, heading, ratingInfo };
}

// ---------------------------------------------------------------------------
// Pořadí (art=1&rd=N), křížová tabulka (art=4), tabulka družstev (art=46)
// ---------------------------------------------------------------------------

export function parseRanking(doc) {
  const table = findTable(doc, ['rank', ['name', 'team']]);
  if (!table) return { round: null, rows: [], tiebreaks: [], heading: null, crossRounds: 0 };
  const h = headingBefore(table);
  const heading = h ? text(h) : '';
  const rows = [];
  let tbCount = 0;
  let crossRounds = 0;
  for (const sec of splitTable(table)) {
    if (!sec.header) continue;
    const cols = mapHeader(sec.header);
    tbCount = Math.max(tbCount, cols.filter((c) => c.key === 'tb').length);
    crossRounds = Math.max(crossRounds, cols.filter((c) => c.key === 'xt').length);
    let lastRank = null;
    for (const tr of sec.rows) {
      const r = readRow(tr, cols);
      if (!r.name && !r.team) continue;
      if (typeof r.rank === 'number') lastRank = r.rank;
      const row = {
        rank: typeof r.rank === 'number' ? r.rank : lastRank,
        startNo: typeof r.startNo === 'number' ? r.startNo : null,
        title: r.title || '',
        name: r.name || r.team || '',
        fed: r.fed || '',
        rating: typeof r.rating === 'number' ? r.rating : null,
        ratingNat: typeof r.ratingNat === 'number' ? r.ratingNat : null,
        club: r.club || '',
        type: r.type || '',
        group: r.group || '',
        sex: r.sex || '',
        points: r.points ?? null,
        tb: r.tb.map((x) => x ?? ''),
      };
      if (r.team && r.name) row.team = r.team;
      if (r.games != null) row.games = r.games;
      if (r.wins != null) row.wins = r.wins;
      if (r.draws != null) row.draws = r.draws;
      if (r.losses != null) row.losses = r.losses;
      if (r.xt.length) row.cross = r.xt.map((x) => x ?? '');
      rows.push(row);
    }
  }
  const legend = parseTiebreakLegend(doc);
  const tiebreaks = Array.from({ length: tbCount }, (_, i) => ({ key: `TB${i + 1}`, label: legend[i] || '' }));
  const final = /final|konecne|endstand|schluss/.test(norm(heading));
  return { round: roundFromText(heading), final, rows, tiebreaks, heading, crossRounds };
}

// ---------------------------------------------------------------------------
// Los kola jednotlivců (art=2&rd=N). Kruhový systém vrací všechna kola najednou.
// ---------------------------------------------------------------------------

function sideFromCells(cells, cols, from, to) {
  const s = {};
  for (let i = from; i < to; i++) {
    const col = cols[i];
    const cell = cells[i];
    if (!col || !cell || !col.key) continue;
    const v = text(cell);
    switch (col.key) {
      case 'name': case 'white': case 'black': {
        const n = nameCell(cell);
        s.name = n.name;
        s.fed = fedFromCell(cell) || s.fed;
        if (n.snr != null) s.snr = n.snr;
        break;
      }
      case 'startNo': s.startNo = parseIntSafe(v); break;
      case 'rating': case 'ratingNat': s[col.key] = parseIntSafe(v); break;
      case 'points': s.points = parseNum(v); break;
      case 'title': s.title = v; break;
      case 'club': s.club = v; break;
      case 'fed': s.fed = v; break;
      default: break;
    }
  }
  if (s.startNo == null && s.snr != null) s.startNo = s.snr;
  delete s.snr;
  return s;
}

function isByeSide(side) {
  if (!side || !side.name) return true;
  if (BYE_WORDS.test(side.name.trim())) return true;
  if (side.startNo != null && side.startNo <= 0) return true;
  return false;
}

function roundMeta(s) {
  return { round: roundFromText(s), date: dateFromText(s), time: timeFromText(s) };
}

export function parsePairings(doc) {
  const tables = dataTables(doc);
  const rounds = [];
  for (const table of tables) {
    const secs = splitTable(table);
    let headerCols = null;
    for (const sec of secs) {
      if (!sec.header) continue;
      const cols = mapHeader(sec.header);
      const keys = cols.map((c) => c.key);
      if (!keys.includes('result') || !(keys.includes('white') || keys.includes('name'))) continue;
      headerCols = cols;
      // Rozdělení na bílého a černého podle sloupce s výsledkem
      const resIdx = keys.indexOf('result');
      const h = headingBefore(table);
      const metaText = sec.heading || (h ? text(h) : '');
      // Na stránce jednoho kola je údaj v h3 (Round 6 on 2026/11/12 at 17:30)
      const h3 = [...doc.querySelectorAll('h3')].map(text).find((x) => roundFromText(x) != null);
      const meta = roundMeta(sec.heading || h3 || metaText);
      let rd = rounds.find((r) => r.round === meta.round && meta.round != null);
      if (!rd) {
        rd = { ...meta, pairings: [] };
        rounds.push(rd);
      }
      for (const tr of sec.rows) {
        const cells = cellsOf(tr);
        const boardCol = keys.indexOf('board');
        const board = boardCol >= 0 ? parseIntSafe(text(cells[boardCol])) ?? text(cells[boardCol]) : null;
        const white = sideFromCells(cells, cols, 0, resIdx);
        const black = sideFromCells(cells, cols, resIdx + 1, cols.length);
        const result = parseResult(text(cells[resIdx]));
        const p = { board, white, black, result };
        if (isByeSide(black)) {
          p.bye = black.name ? black.name.trim() : 'bye';
          p.black = null;
        }
        if (isByeSide(white) && !isByeSide(black)) {
          // Výjimečně je volno uvedeno na straně bílého
          p.bye = white.name ? white.name.trim() : 'bye';
          p.white = black;
          p.black = null;
        }
        rd.pairings.push(p);
      }
    }
    if (headerCols) break;
  }
  for (const r of rounds) {
    r.published = r.pairings.some((p) => p.black);
    r.hasResults = r.pairings.some((p) => p.black && p.result.played);
  }
  return { rounds };
}

// ---------------------------------------------------------------------------
// Družstva (art=32), zápasy družstev (art=2&rd=N), šachovnice (art=3&rd=N)
// ---------------------------------------------------------------------------

export function parseTeamList(doc) {
  const table = findTable(doc, ['team', ['startNo', 'rank']]);
  if (!table) return { teams: [] };
  const teams = [];
  for (const sec of splitTable(table)) {
    if (!sec.header) continue;
    const cols = mapHeader(sec.header);
    for (const tr of sec.rows) {
      const r = readRow(tr, cols);
      if (!r.team) continue;
      teams.push({
        no: typeof r.startNo === 'number' ? r.startNo : null,
        name: r.team,
        ratingAvg: typeof r.ratingAvg === 'number' ? r.ratingAvg : null,
      });
    }
  }
  return { teams };
}

/** Výsledek zápasu „5½:2½“ / „2 : 6“. */
function parseMatchScore(s) {
  const m = String(s || '').replace(/\s+/g, '').match(/^([0-9½.,]+):([0-9½.,]+)$/);
  if (!m) return { home: null, away: null, text: String(s || '').trim() };
  return { home: parseNum(m[1]), away: parseNum(m[2]), text: `${m[1]} : ${m[2]}` };
}

export function parseTeamPairings(doc) {
  const rounds = [];
  for (const table of dataTables(doc)) {
    for (const sec of splitTable(table)) {
      if (!sec.header) continue;
      const cols = mapHeader(sec.header);
      const teamIdx = cols.map((c, i) => (c.key === 'team' ? i : -1)).filter((i) => i >= 0);
      if (teamIdx.length < 2) continue;
      const resIdx = cols.map((c, i) => (c.key === 'result' ? i : -1)).filter((i) => i >= 0);
      const h3 = [...doc.querySelectorAll('h3')].map(text).find((x) => roundFromText(x) != null);
      const meta = roundMeta(sec.heading || h3 || '');
      let rd = rounds.find((r) => r.round === meta.round && meta.round != null);
      if (!rd) { rd = { ...meta, matches: [] }; rounds.push(rd); }
      for (const tr of sec.rows) {
        const cells = cellsOf(tr);
        const home = text(cells[teamIdx[0]]);
        const away = text(cells[teamIdx[1]]);
        let score = { home: null, away: null, text: '' };
        if (resIdx.length >= 2) {
          const a = text(cells[resIdx[0]]);
          const b = text(cells[resIdx[1]]);
          if (a || b) score = { home: parseNum(a), away: parseNum(b), text: a || b ? `${a} : ${b}` : '' };
        }
        const no = parseIntSafe(text(cells[0]));
        const bye = BYE_WORDS.test(away) || !away;
        rd.matches.push({ no, home: { name: home }, away: bye ? null : { name: away }, bye: bye ? (away || 'bye') : null, score });
      }
    }
  }
  for (const r of rounds) r.published = r.matches.length > 0;
  return { rounds };
}

function boardSide(cells) {
  // Strana zápasu: [titul?] [jméno (vnořená tabulka s barvou)] [rating?]
  const s = { title: '', name: '', color: null, rating: null, startNo: null };
  for (const c of cells) {
    const v = text(c);
    const nested = c.querySelector && (c.querySelector('table') || c.querySelector('a'));
    const colorDiv = c.querySelector && c.querySelector('div[class^="Farbe"]');
    if (nested || colorDiv) {
      const n = nameCell(c);
      s.name = n.name;
      if (n.snr != null) s.startNo = n.snr;
      if (colorDiv) {
        const cls = colorDiv.getAttribute('class') || '';
        s.color = /Farbew/i.test(cls) ? 'w' : /Farbes/i.test(cls) ? 'b' : null;
      }
      continue;
    }
    if (TITLES.test(v)) { s.title = v; continue; }
    if (/^\d{3,4}$/.test(v) && !s.name) { s.rating = Number(v); continue; }
    if (/^\d{3,4}$/.test(v) && s.name) { s.rating = s.rating ?? Number(v); continue; }
    if (v && !s.name && !/^\d+$/.test(v)) s.name = v;
  }
  if (NO_PLAYER.test(s.name.trim())) { s.name = ''; s.empty = true; }
  return s;
}

export function parseBoardPairings(doc) {
  const rounds = [];
  for (const table of dataTables(doc)) {
    let rd = null;
    for (const tr of rowsOf(table)) {
      if (isSectionRow(tr)) {
        const meta = roundMeta(text(tr));
        rd = rounds.find((r) => r.round === meta.round && meta.round != null);
        if (!rd) { rd = { ...meta, matches: [] }; rounds.push(rd); }
        continue;
      }
      const cells = cellsOf(tr);
      if (isHeaderRow(tr)) {
        // [Bo.] [č. domácích] [domácí] [-] [č. hostů] [hosté] [výsledek]
        const vals = cells.map(text);
        const dash = vals.findIndex((v, i) => i > 0 && v === '-');
        if (dash < 0) continue;
        if (!rd) {
          const h3 = [...doc.querySelectorAll('h3')].map(text).find((x) => roundFromText(x) != null);
          rd = { ...roundMeta(h3 || ''), matches: [] };
          rounds.push(rd);
        }
        const left = vals.slice(1, dash);
        const right = vals.slice(dash + 1);
        const scoreText = right.length > 2 ? right[right.length - 1] : '';
        const rightTeam = right.length > 2 ? right.slice(0, -1) : right;
        // Hlavička zápasu má za názvem družstva ještě sloupec „Rtg“ (průměr) – do názvu nepatří
        const RTG_HEAD = /^(rtg|elo|rtgi|rtgn|rtg avg|rtgavg|ø|ø rtg|ø elo)$/i;
        const pick = (arr) => ({
          no: parseIntSafe(arr.find((x) => /^\d+$/.test(x))),
          name: arr.filter((x) => !/^\d+$/.test(x) && !RTG_HEAD.test(x.trim())).join(' ').trim(),
        });
        const score = parseMatchScore(scoreText);
        rd.matches.push({
          no: rd.matches.length + 1,
          home: pick(left),
          away: pick(rightTeam),
          score,
          boards: [],
        });
        continue;
      }
      if (!isDataRow(tr) || !rd || !rd.matches.length) continue;
      const match = rd.matches[rd.matches.length - 1];
      const vals = cells.map(text);
      const dash = vals.findIndex((v, i) => i > 0 && v === '-');
      if (dash < 0) continue;
      const boardLabel = vals[0];
      const bm = boardLabel.match(/^(\d+)\.(\d+)$/);
      const home = boardSide(cells.slice(1, dash));
      const awayCells = cells.slice(dash + 1);
      const resultCell = awayCells.length > 1 ? awayCells[awayCells.length - 1] : null;
      const away = boardSide(resultCell ? awayCells.slice(0, -1) : awayCells);
      if (!away.color && home.color) away.color = home.color === 'w' ? 'b' : 'w';
      match.boards.push({
        label: boardLabel,
        board: bm ? Number(bm[2]) : parseIntSafe(boardLabel),
        home,
        away,
        result: parseResult(resultCell ? text(resultCell) : ''),
      });
    }
  }
  for (const r of rounds) {
    r.published = r.matches.length > 0;
    r.lineupsPublished = r.matches.some((m) => m.boards.some((b) => b.home.name || b.away.name));
    r.hasResults = r.matches.some((m) => m.boards.some((b) => b.result.played));
  }
  return { rounds };
}

// ---------------------------------------------------------------------------
// Detekce typu stránky (pro ručně vložené HTML)
// ---------------------------------------------------------------------------

export function detectPageKind(doc) {
  const tables = dataTables(doc);
  for (const t of tables) {
    for (const sec of splitTable(t)) {
      if (!sec.header) continue;
      const vals = sec.header.map((x) => norm(x));
      const keys = mapHeader(sec.header).map((c) => c.key);
      if (keys.includes('result') && (keys.includes('white') || keys.includes('name'))) return 'pairings';
      if (keys.filter((k) => k === 'team').length >= 2) return 'teamPairings';
      if (vals.includes('-') && keys[0] === 'board' && !keys.includes('name')) return 'boards';
      if (keys.includes('rank') && keys.includes('team') && !keys.includes('name')) return 'teamRanking';
      if (keys.includes('rank') && keys.includes('name')) {
        return keys.includes('xt') ? 'crosstable' : 'ranking';
      }
      if (keys.includes('team') && keys.includes('name')) return 'teamPlayers';
      if (keys.includes('team') && !keys.includes('name')) return 'teams';
      if (keys.includes('name')) return 'startlist';
    }
  }
  return null;
}

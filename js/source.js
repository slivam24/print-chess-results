// Datová vrstva: sestavení URL chess-results, stažení přes proxy,
// mezipaměť v paměti a ručně vložené stránky (záložní režim bez proxy).

import {
  parseInfo, parseStartList, parseRanking, parsePairings, parseTeamList,
  parseTeamPairings, parseBoardPairings, detectPageKind, detectTnr,
} from './parser/index.js';
import { roundFromText } from './parser/dom.js';

/**
 * Rozpozná vstup uživatele: číslo turnaje, „tnr123“, nebo celou URL.
 * Z URL převezme i server (s1., s2.…), druh stránky (art) a kolo (rd).
 */
export function parseTournamentInput(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  let m = s.match(/^(?:tnr)?(\d{3,9})$/i);
  if (m) return { tnr: Number(m[1]) };
  m = s.match(/tnr(\d{3,9})\.aspx/i);
  if (!m) return null;
  const out = { tnr: Number(m[1]) };
  const art = s.match(/[?&]art=(\d+)/i);
  const rd = s.match(/[?&]rd=(\d+)/i);
  if (art) out.art = Number(art[1]);
  if (rd) out.rd = Number(rd[1]);
  return out;
}

/** Druhy stránek (dataset → parametr art a parser). */
export const DATASETS = {
  main: { art: null, label: 'Hlavní stránka' },
  players: { art: 0, label: 'Startovní listina', parse: parseStartList },
  teamPlayers: { art: 16, label: 'Hráči družstev', parse: parseStartList },
  teams: { art: 32, label: 'Družstva', parse: parseTeamList },
  ranking: { art: 1, label: 'Pořadí', parse: parseRanking, round: true },
  teamRanking: { art: 46, label: 'Tabulka družstev', parse: parseRanking, round: true },
  crosstable: { art: 4, label: 'Křížová tabulka', parse: parseRanking, round: true },
  pairings: { art: 2, label: 'Los kola', parse: parsePairings, round: true },
  teamPairings: { art: 2, label: 'Zápasy družstev', parse: parseTeamPairings, round: true },
  boards: { art: 3, label: 'Šachovnice družstev', parse: parseBoardPairings, round: true },
};

export function buildUrl(tnr, dataset, round) {
  const d = DATASETS[dataset];
  const p = new URLSearchParams({ lan: '1', turdet: 'YES', zeilen: '99999' });
  if (d && d.art != null) p.set('art', String(d.art));
  if (d && d.round && round) p.set('rd', String(round));
  return `https://chess-results.com/tnr${tnr}.aspx?${p.toString()}`;
}

export function cacheKey(tnr, dataset, round) {
  const d = DATASETS[dataset];
  return `${tnr}|${dataset}|${d && d.round && round ? round : ''}`;
}

export class FetchError extends Error {
  constructor(message, { status, hint } = {}) {
    super(message);
    this.status = status;
    this.hint = hint;
  }
}

/**
 * Zdroj dat. Drží stažené a zparsované stránky, umí je stáhnout přes proxy
 * a přijímá ručně vložené HTML.
 */
export class Source {
  constructor({ getProxyUrl, domParser }) {
    this.getProxyUrl = getProxyUrl;
    this.domParser = domParser || (() => new DOMParser());
    this.cache = new Map(); // key → { data, info, fetchedAt, manual }
    this.inflight = new Map();
    this.listeners = new Set();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(ev) {
    for (const fn of this.listeners) fn(ev);
  }

  parseHtml(html) {
    return this.domParser().parseFromString(html, 'text/html');
  }

  async fetchHtml(url, { fresh = false } = {}) {
    const proxy = String(this.getProxyUrl() || '').trim();
    if (!proxy) {
      throw new FetchError('Není nastavená adresa proxy.', {
        hint: 'Doplňte ji v Nastavení → Připojení, nebo vložte stránky ručně.',
      });
    }
    let full;
    try {
      const u = new URL(proxy);
      u.searchParams.set('url', url);
      if (fresh) u.searchParams.set('fresh', '1');
      full = u.toString();
    } catch {
      throw new FetchError('Adresa proxy není platná URL.', { hint: 'Opravte ji v Nastavení → Připojení.' });
    }
    let res;
    try {
      res = await fetch(full, { cache: fresh ? 'no-store' : 'default' });
    } catch (e) {
      throw new FetchError('Proxy neodpovídá (síť nebo CORS).', {
        hint: 'Zkontrolujte adresu proxy a připojení k internetu. Případně vložte HTML ručně.',
      });
    }
    const body = await res.text();
    if (!res.ok) {
      throw new FetchError(`Proxy vrátila chybu ${res.status}: ${body.slice(0, 200)}`, { status: res.status });
    }
    if (/too many requests|zu viele anfragen/i.test(body.slice(0, 3000)) && body.length < 20000) {
      throw new FetchError('chess-results dočasně omezil přístup (příliš mnoho požadavků).', {
        hint: 'Počkejte chvíli a zkuste to znovu.',
      });
    }
    return { html: body, fetchedAt: res.headers.get('X-Proxy-Fetched-At') || new Date().toISOString() };
  }

  /**
   * Vrátí data datasetu (s cache). Pro dataset „main“ vrací { info, players }.
   */
  async get(tnr, dataset, round = null, { fresh = false } = {}) {
    const key = cacheKey(tnr, dataset, round);
    if (!fresh && this.cache.has(key)) return this.cache.get(key);
    if (!fresh && this.inflight.has(key)) return this.inflight.get(key);
    const p = (async () => {
      const url = buildUrl(tnr, dataset, round);
      const { html, fetchedAt } = await this.fetchHtml(url, { fresh });
      const entry = this.parseInto(html, dataset, { fetchedAt, url });
      if (entry.info && entry.info.tnr && entry.info.tnr !== tnr && dataset === 'main') {
        // Přesměrování na jiný turnaj by bylo podezřelé – ale číslo z odkazů může chybět.
        entry.info.tnr = tnr;
      }
      if (entry.info && !entry.info.tnr) entry.info.tnr = tnr;
      this.cache.set(key, entry);
      this.emit({ type: 'loaded', key, tnr, dataset, round });
      return entry;
    })();
    this.inflight.set(key, p);
    try {
      return await p;
    } finally {
      this.inflight.delete(key);
    }
  }

  parseInto(html, dataset, meta = {}) {
    const doc = this.parseHtml(html);
    const info = parseInfo(doc);
    let data = null;
    if (dataset === 'main') {
      data = { players: parseStartList(doc).players };
    } else {
      const d = DATASETS[dataset];
      data = d && d.parse ? d.parse(doc) : null;
    }
    return { info, data, fetchedAt: meta.fetchedAt || new Date().toISOString(), url: meta.url || null, manual: !!meta.manual };
  }

  /** Smaže z cache vše pro daný turnaj (před „Aktualizovat data“). */
  invalidate(tnr) {
    for (const k of [...this.cache.keys()]) if (k.startsWith(`${tnr}|`)) this.cache.delete(k);
  }

  /**
   * Ručně vložené HTML (uložená stránka z chess-results).
   * Rozpozná turnaj, druh stránky a kolo a uloží ji do cache, jako by byla stažená.
   */
  addManualHtml(html, { isTeamHint } = {}) {
    const doc = this.parseHtml(html);
    const info = parseInfo(doc);
    const tnr = info.tnr || detectTnr(doc);
    if (!tnr) throw new Error('Ve vloženém HTML se nepodařilo najít číslo turnaje.');
    const kind = detectPageKind(doc);
    const isTeam = info.isTeam || isTeamHint;
    const now = new Date().toISOString();
    const added = [];
    const put = (dataset, round, data) => {
      const key = cacheKey(tnr, dataset, round);
      this.cache.set(key, { info, data, fetchedAt: now, manual: true });
      added.push({ dataset, round });
    };
    // Každá stránka s detaily obsahuje i info → uložíme jako „main“, pokud ještě není.
    if (!this.cache.has(cacheKey(tnr, 'main')) || kind === 'startlist') {
      put('main', null, { players: kind === 'startlist' ? parseStartList(doc).players : [] });
    }
    const h = [...doc.querySelectorAll('h2,h3')].map((x) => x.textContent).join(' ');
    const rd = roundFromText(h);
    switch (kind) {
      case 'pairings': {
        const parsed = parsePairings(doc);
        if (parsed.rounds.length > 1) {
          // Kruhový systém – všechna kola; uložíme pod každé kolo i bez kola
          for (const r of parsed.rounds) put('pairings', r.round, parsed);
        }
        put('pairings', parsed.rounds[0]?.round ?? rd, parsed);
        break;
      }
      case 'ranking': put('ranking', parseRanking(doc).round ?? null, parseRanking(doc)); put('ranking', null, parseRanking(doc)); break;
      case 'crosstable': put('crosstable', null, parseRanking(doc)); break;
      case 'teamRanking': put('teamRanking', null, parseRanking(doc)); break;
      case 'teams': put('teams', null, parseTeamList(doc)); break;
      case 'teamPlayers': put('teamPlayers', null, parseStartList(doc)); break;
      case 'teamPairings': {
        const parsed = parseTeamPairings(doc);
        put('teamPairings', parsed.rounds[0]?.round ?? rd, parsed);
        break;
      }
      case 'boards': {
        const parsed = parseBoardPairings(doc);
        put('boards', parsed.rounds[0]?.round ?? rd, parsed);
        break;
      }
      case 'startlist':
        if (isTeam) put('teamPlayers', null, parseStartList(doc));
        break;
      default:
        break;
    }
    this.emit({ type: 'manual', tnr, kind });
    return { tnr, kind, info, added };
  }

  /** Data datasetu, pokud jsou v cache (bez stahování). */
  peek(tnr, dataset, round = null) {
    return this.cache.get(cacheKey(tnr, dataset, round)) || null;
  }

  /** Nejnovější čas stažení pro turnaj. */
  lastFetched(tnr) {
    let best = null;
    for (const [k, v] of this.cache) {
      if (!k.startsWith(`${tnr}|`)) continue;
      if (!best || v.fetchedAt > best) best = v.fetchedAt;
    }
    return best;
  }

  /** Serializace cache jednoho turnaje (pro obnovení po načtení stránky). */
  snapshot(tnr) {
    const out = {};
    for (const [k, v] of this.cache) if (k.startsWith(`${tnr}|`)) out[k] = v;
    return out;
  }

  restore(snapshot) {
    for (const [k, v] of Object.entries(snapshot || {})) if (!this.cache.has(k)) this.cache.set(k, v);
  }
}

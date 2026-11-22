// Sestavení dokumentu: šablona + data + profil → bloky a parametry sazby.
// Neobsahuje DOM, takže jde testovat v Node.js.

import { templateSettings } from './store.js';
import { visibleColumns, renderHeader, renderFooter, ratingLabels, ratingPresence } from './templates/common.js';

/**
 * Záhlaví výstupu: 'first' (jen 1. stránka), 'every' (každá stránka), 'title' (jen název výstupu,
 * bez hlavičky turnaje), 'off' (žádné). 'inherit' v nastavení výstupu = podle profilu.
 */
export function headerMode(profile, ts) {
  if (ts && ts.header && ts.header !== 'inherit') return ts.header;
  const h = profile.header || {};
  if (h.enabled === false) return 'title';
  return h.everyPage ? 'every' : 'first';
}

/** Veřejná adresa stránky turnaje na chess-results (pro QR kód). */
export function publicUrl(tnr, art = null, round = null) {
  const p = new URLSearchParams({ lan: '5' });
  if (art != null) p.set('art', String(art));
  if (art != null && round) p.set('rd', String(round));
  return `https://chess-results.com/tnr${tnr}.aspx?${p.toString()}`;
}

/** Stránka chess-results, která odpovídá výstupu (los, pořadí, …). */
const OUTPUT_ART = {
  startlist: 0, alphalist: 0, ranking: 1, 'ranking-cat': 1, awards: 1, crosstable: 4,
  pairings: 2, 'pairings-board': 2, 'pairings-alpha': 2, 'arbiter-sheet': 2, scoresheets: 2,
  'team-matches': 2, 'team-boards': 3, 'team-ranking': 46, 'team-roster': 16, 'team-startlist': 32, 'team-board-best': 81,
};

/**
 * QR kód do záhlaví (Nastavení → Záhlaví a zápatí → QR kód). qr = funkce (text, mm) → SVG,
 * načtená předem (js/qr.js); bez ní nebo při vypnutém QR kódu ''.
 */
function qrFor(qr, profile, tpl, info, round) {
  const hd = profile.header || {};
  if (!qr || hd.qr !== 'on' || !info || !info.tnr) return '';
  const art = hd.qrTarget === 'output' ? OUTPUT_ART[tpl.id] ?? null : null;
  const rd = typeof round === 'number' && [1, 2, 3, 46].includes(art) ? round : null;
  return qr(publicUrl(info.tnr, art, rd), hd.qrSize);
}

/** Které kolo použít, když uživatel zvolí „automaticky“. */
export function autoRound(tpl, info, data = {}) {
  if (!tpl.roundMode) return null;
  if (tpl.roundMode === 'ranking') return info.lastRankedRound || null;
  if (info.lastPairedRound) return info.lastPairedRound;
  // Kruhový systém bez odkazů v menu: první kolo bez výsledků
  const rounds = data.pairings && data.pairings.rounds;
  if (rounds && rounds.length) {
    const open = rounds.find((r) => !r.hasResults);
    return (open || rounds[rounds.length - 1]).round;
  }
  return 1;
}

/** Datové sady potřebné pro šablonu (round = konkrétní číslo kola). */
export function datasetsFor(tpl, info, round, opts) {
  const list = tpl.needs({ info, round, opts }) || [];
  // Pro jednotlivce v kruhovém systému je los všech kol na jedné stránce rd=1
  return list.map((n) => {
    if (n.dataset === 'pairings' && !info.isTeam && info.system === 'roundrobin') return { ...n, round: 1, fetchRound: 1 };
    // Družstva – všechna kola: stránka bez čísla kola obsahuje všechna kola
    if (round === 'all' && ['boards', 'teamPairings'].includes(n.dataset)) return { ...n, round: null };
    return n;
  });
}

/**
 * Vytvoří dokument pro jednu skupinu (turnaj).
 * Vrací { title, sub, blocks, warnings, layout }.
 */
export function buildDocument({ tpl, info, data, profile, round, optionsOverride, qr = null }) {
  const ts = templateSettings(profile, tpl);
  const opts = { ...ts.options, ...(optionsOverride || {}) };
  const cols = ratingLabels(visibleColumns(tpl.columns || [], ts.columns), ratingPresence(data));
  const orientation = ts.orientation && ts.orientation !== 'inherit' ? ts.orientation : profile.page.orientation;
  const page = { orientation, margins: profile.page.margins };
  const out = tpl.render({
    info, data, round, opts, cols, nameFormat: profile.nameFormat || 'original', profile, page,
  });
  const extra = tpl.layout ? tpl.layout(opts, page) || {} : {};
  const vars = { kolo: round && round !== 'all' ? String(round) : '' };
  const hMode = headerMode(profile, ts);
  const headerHtml = ('header' in extra && extra.header === null) || hMode === 'off'
    ? null
    : renderHeader(hMode === 'title' ? { ...profile, header: { ...profile.header, enabled: false } } : profile, info, {
      outputTitle: out.title, outputSub: out.sub, vars, qr: qrFor(qr, profile, tpl, info, round),
    });
  const footerFn = ('footer' in extra && extra.footer === null) || ts.footer === 'off'
    ? null
    : renderFooter(ts.footer === 'on' ? { ...profile, footer: { ...profile.footer, enabled: true } } : profile, info, { vars });
  const layout = {
    orientation,
    margins: profile.page.margins,
    fontFamily: profile.page.fontFamily,
    fontSize: ts.fontSize || profile.page.fontSize,
    columns: ts.pageColumns || 1,
    rowHeight: ts.rowHeight,
    header: headerHtml,
    headerEveryPage: hMode === 'every',
    footer: footerFn,
    // Vodoznak z profilu (Nastavení → Stránka); výstup ho může vypnout, lístky k rozstříhání ho nemají
    watermark: ts.watermark !== 'off' && tpl.pageChrome !== false && profile.page.watermark && profile.page.watermark.src ? profile.page.watermark : null,
    ...extra,
    docClass: [profile.page.tableStyle === 'stripes' ? '' : 'tbl-grid', extra.docClass || ''].join(' ').trim(),
  };
  // Písmo „co největší“ – jen u výstupů, které si velikost neurčují samy (nástěnka apod.)
  if (ts.fontMode === 'max' && !(extra.fit && extra.fit.enabled)) {
    layout.fitWidth = { enabled: true, minPt: 6, maxPt: ts.fontMax };
    layout.docClass = `${layout.docClass} nowrap-cells`.trim();
  }
  // „Na 1 stránku“: písmo i výška řádků co největší, aby se vše vešlo na jednu stránku A4
  if (ts.fontMode === 'page' && !(extra.fit && extra.fit.enabled)) {
    layout.fitPage = { enabled: true, minPt: 6, maxPt: ts.fontMax, maxRowFactor: 2.5 };
    layout.docClass = `${layout.docClass} nowrap-cells`.trim();
  }
  if (extra.header === null) layout.header = null;
  if (extra.footer === null) layout.footer = null;
  return { ...out, layout, opts };
}

// Sestavení dokumentu: šablona + data + profil → bloky a parametry sazby.
// Neobsahuje DOM, takže jde testovat v Node.js.

import { templateSettings } from './store.js';
import { visibleColumns, renderHeader, renderFooter } from './templates/common.js';

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
    return n;
  });
}

/**
 * Vytvoří dokument pro jednu skupinu (turnaj).
 * Vrací { title, sub, blocks, warnings, layout }.
 */
export function buildDocument({ tpl, info, data, profile, round, optionsOverride }) {
  const ts = templateSettings(profile, tpl);
  const opts = { ...ts.options, ...(optionsOverride || {}) };
  const cols = visibleColumns(tpl.columns || [], ts.columns);
  const orientation = ts.orientation && ts.orientation !== 'inherit' ? ts.orientation : profile.page.orientation;
  const page = { orientation, margins: profile.page.margins };
  const out = tpl.render({
    info, data, round, opts, cols, nameFormat: profile.nameFormat || 'original', profile, page,
  });
  const extra = tpl.layout ? tpl.layout(opts, page) || {} : {};
  const headerHtml = 'header' in extra && extra.header === null
    ? null
    : renderHeader(profile, info, { outputTitle: out.title, outputSub: out.sub, vars: { kolo: round ? String(round) : '' } });
  const footerFn = 'footer' in extra && extra.footer === null
    ? null
    : renderFooter(profile, info, { vars: { kolo: round ? String(round) : '' } });
  const layout = {
    orientation,
    margins: profile.page.margins,
    fontFamily: profile.page.fontFamily,
    fontSize: ts.fontSize || profile.page.fontSize,
    columns: ts.pageColumns || 1,
    header: headerHtml,
    headerEveryPage: !!(profile.header && profile.header.everyPage),
    footer: footerFn,
    ...extra,
    docClass: [profile.page.tableStyle === 'stripes' ? '' : 'tbl-grid', extra.docClass || ''].join(' ').trim(),
  };
  if (extra.header === null) layout.header = null;
  if (extra.footer === null) layout.footer = null;
  return { ...out, layout, opts };
}

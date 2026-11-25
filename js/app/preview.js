// Náhled: stažení dat pro výstup, sestavení dokumentu, sazba stránek a zvětšení náhledu.

import { store, source, session, els, setStatus, showWarnings } from './context.js';
import { templateSettings, withTournamentHeader } from '../store.js';
import { DATASETS } from '../source.js';
import { buildDocument, autoRound, datasetsFor } from '../render.js';
import { layoutDocument, pageRule } from '../layout.js';
import { checkNeeds, resultChecks } from '../checks.js';
import { dataHash, hashString } from '../printLog.js';
import { clear, debounce, h } from '../ui/dom.js';
import { currentTemplate, renderTournamentInfo } from './panel.js';
import { reportError } from './loader.js';
import { saveSnapshot, syncTab } from './tabs.js';
import { renderPrintMark, printKeyFor } from './printing.js';

/** Turnaje (tnr), které se mají vytisknout – jedna skupina nebo všechny. */
export function targetTnrs() {
  const info = session.rootInfo;
  if (!info) return [];
  if (session.group === 'all' && info.groups.length > 1) return info.groups.map((g) => g.tnr);
  return [session.group || session.tnr];
}

export function groupName(tnr) {
  const g = session.rootInfo && session.rootInfo.groups.find((x) => x.tnr === tnr);
  return g ? g.name : null;
}

/** Kola, která jsou pro šablonu v mezipaměti (např. ručně vložená). */
function cachedRounds(tnr, tpl) {
  const sets = { pairings: ['pairings', 'boards', 'teamPairings'], ranking: ['ranking', 'teamRanking'] }[tpl.roundMode] || [];
  const out = new Set();
  for (const k of source.cache.keys()) {
    const [t, ds, rd] = k.split('|');
    if (Number(t) === tnr && sets.includes(ds) && rd) out.add(Number(rd));
  }
  return [...out];
}

async function loadDatasets(tnr, info, tpl, round, opts, { fresh }) {
  const data = {};
  const needs = datasetsFor(tpl, info, round, opts);
  // Podklady výstupu se stahují souběžně (např. los + startovní listina + soupisky)
  await Promise.all(needs.map(async (n) => {
    if (n.dataset === 'main') {
      data.main = (await source.get(tnr, 'main', null, { fresh: false })).data;
      return;
    }
    try {
      const entry = await source.get(tnr, n.dataset, DATASETS[n.dataset].round ? n.round : null, { fresh });
      data[n.dataset] = entry.data;
    } catch (e) {
      if (n.optional) return;
      e.dataset = n.dataset;
      e.round = n.round;
      throw e;
    }
  }));
  return data;
}

/** Data jen pro kontrolu výsledků (nepovinná – když se nestáhnou, kontrola se vynechá). */
async function loadCheckData(tnr, info, tpl, round, data, { fresh }) {
  const extra = {};
  await Promise.all(checkNeeds(tpl, info, round).map(async (n) => {
    if (data[n.dataset]) { extra[n.dataset] = data[n.dataset]; return; }
    try {
      extra[n.dataset] = (await source.get(tnr, n.dataset, n.round, { fresh })).data;
    } catch { /* kontrola se vynechá */ }
  }));
  return extra;
}

/** Zpracuje položky souběžně, nejvýš `limit` najednou; výsledky ve stejném pořadí. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Poslední vysázený náhled: výstup, dokumenty, klíč a otisk dat (pro značku „vytištěno“
 * a název PDF).
 */
export let current = null;

let qrLoading = null;
/** Funkce pro QR kód, když ho má profil zapnutý (knihovna se načte jen tehdy). */
async function qrFactory(profile) {
  if (!profile.header || profile.header.qr !== 'on') return null;
  if (!qrLoading) qrLoading = import('../qr.js').then((m) => m.loadQr()).catch(() => { qrLoading = null; return null; });
  return qrLoading;
}

export async function refreshPreview({ fresh = false } = {}) {
  const tpl = currentTemplate();
  const seq = ++session.renderSeq;
  syncTab();
  current = null;
  if (!tpl || !session.rootInfo) return;
  setStatus('Připravuji náhled…', 'loading');
  showWarnings([]);
  // Profil s obrázky (loga, sponzoři, vodoznak) doplněnými z knihovny obrázků
  const profile = store.resolvedProfile;
  const ts = templateSettings(profile, tpl);
  const docs = [];
  const tnrs = targetTnrs();
  const qr = await qrFactory(profile);
  try {
    // Skupiny („Všechny skupiny“) se stahují souběžně, nejvýš 3 najednou – šetrné k chess-results i k proxy
    const built = await mapLimit(tnrs, 3, async (tnr) => {
      const main = await source.get(tnr, 'main', null, { fresh: fresh && tnr !== session.tnr });
      const info = main.info;
      if (!tpl.supports(info)) return null;
      // Kolo: „automaticky“ se určí pro každou skupinu zvlášť
      let round = null;
      if (tpl.roundMode) {
        if (session.round === 'all' && tpl.allRounds && tpl.allRounds(info)) {
          round = 'all';
        } else if (session.round === 'auto' || session.round === 'all') {
          let pre = {};
          if (!info.isTeam && info.system === 'roundrobin' && tpl.roundMode === 'pairings') {
            pre = { pairings: (await source.get(tnr, 'pairings', 1, { fresh })).data };
          }
          round = autoRound(tpl, info, pre);
          // Bez proxy (ručně vložená data) vezmeme nejnovější kolo, které je opravdu k dispozici
          if (!store.proxyUrl) {
            const have = cachedRounds(tnr, tpl);
            if (have.length && !have.includes(round)) round = Math.max(...have);
          }
        } else {
          round = session.round;
        }
      }
      const data = await loadDatasets(tnr, info, tpl, round, ts.options, { fresh });
      const checkData = await loadCheckData(tnr, info, tpl, round, data, { fresh });
      if (seq !== session.renderSeq) return null;
      // Nadpis / podnadpis jen pro tento turnaj (karta „1. Turnaj“) přepíše profil
      const doc = buildDocument({ tpl, info, data, profile: withTournamentHeader(profile, store.tournamentHeader(tnr)), round, qr });
      doc.groupName = tnrs.length > 1 ? groupName(tnr) : null;
      doc.round = round;
      doc.tnr = tnr;
      doc.dataHash = dataHash(data);
      doc.checks = resultChecks({ tpl, info, data: { ...data, ...checkData }, round, auto: session.round === 'auto' });
      return doc;
    });
    if (seq !== session.renderSeq) return;
    docs.push(...built.filter(Boolean));
  } catch (e) {
    if (seq !== session.renderSeq) return;
    reportError(e, targetTnrs()[0], e.dataset, e.round);
    return;
  }
  if (seq !== session.renderSeq) return;
  current = {
    tpl,
    docs,
    key: printKeyFor(tpl, docs.map((d) => d.round ?? '').join(',')),
    hash: docs.length ? hashString(docs.map((d) => d.dataHash).join('|')) : null,
  };
  // Loga v záhlaví / zápatí a vodoznak musí být načtené dřív, než se změří výška záhlaví a zápatí
  // (nenačtený obrázek nemá šířku – loga by se po načtení zalomila a stránka přetekla)
  await preloadImages(docs);
  if (seq !== session.renderSeq) return;
  layoutAll(docs);
  if (fresh) saveSnapshot(session.tnr);
}

const decoded = new Set();
/** Načte (dekóduje) obrázky ze záhlaví, zápatí a vodoznaku dokumentů. */
async function preloadImages(docs) {
  const srcs = new Set();
  for (const d of docs) {
    const html = `${d.layout.header || ''}${d.layout.footer ? d.layout.footer(1, 1) : ''}`;
    for (const m of html.matchAll(/<img[^>]+src="([^"]+)"/g)) srcs.add(m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
    if (d.layout.watermark && d.layout.watermark.src) srcs.add(d.layout.watermark.src);
  }
  await Promise.all([...srcs].filter((s) => !decoded.has(s)).map(async (src) => {
    const img = new Image();
    img.src = src;
    try { await img.decode(); } catch { /* poškozený obrázek – vysází se bez něj */ }
    decoded.add(src);
    // Dekódované obrázky držíme, aby je prohlížeč při sazbě měl hned k dispozici
    keep.push(img);
  }));
}
const keep = [];

function layoutAll(docs) {
  clear(els.pages);
  let pages = 0;
  let orientation = 'portrait';
  const checks = [];
  const warnings = [];
  for (const d of docs) {
    const container = h('div');
    els.pages.append(container);
    const res = layoutDocument(container, d.blocks, d.layout);
    pages += res.pageCount;
    orientation = d.layout.orientation;
    for (const w of d.checks || []) checks.push(d.groupName ? `${d.groupName}: ${w}` : w);
    for (const w of d.warnings) warnings.push(d.groupName ? `${d.groupName}: ${w}` : w);
    if (res.overflowX && /one-line/.test(d.blocks.map((b) => b.className || '').join(' '))) {
      warnings.push('Některé názvy nebo jména se nevešly celé na řádek (jsou zkrácené „…“). Zkuste tlačítko Max. písmo nebo menší písmo či orientaci na šířku.');
    }
    if (d.layout.fitPage && d.layout.fitPage.enabled) {
      const pt = String(res.fontSize).replace('.', ',');
      // Vynucené konce stránek (např. každé kolo na samostatné stránce) nejsou „nevejde se“
      const forced = 1 + d.blocks.filter((b, i) => i > 0 && (b.breakBefore || b.type === 'break')).length;
      const row = res.rowHeight ? `, řádek ${String(res.rowHeight).replace('.', ',')} mm` : '';
      container.dataset.fit = res.pageCount > forced ? `${pt} pt${row}` : `${pt} pt${row} (${forced > 1 ? 'oddíl na stránku' : '1 strana'})`;
      if (res.pageCount > forced) warnings.push(`${d.groupName ? `${d.groupName}: ` : ''}Výstup se nevejde na jednu stránku ani při nejmenším písmu (${d.layout.fitPage.minPt} pt) – je na ${res.pageCount} stránkách s co největším písmem. Tip: zkuste 2 sloupce na stránce (⚙ Nastavení → Výstup) nebo orientaci na šířku.`);
    } else if (d.layout.fitWidth && d.layout.fitWidth.enabled) {
      container.dataset.fit = `${String(res.fontSize).replace('.', ',')} pt (co největší)`;
    } else if (d.layout.fit && d.layout.fit.enabled) {
      container.dataset.fit = `${res.fontSize} pt, ${res.columns} sl.`;
    }
  }
  els.pageRule.textContent = pageRule(orientation);
  if (window.chessPrint) window.chessPrint.renders += 1;
  els.pageCount.textContent = pages ? `${pages} ${pages === 1 ? 'stránka' : pages < 5 ? 'stránky' : 'stránek'}` : '';
  els.btnPrint.disabled = !pages;
  // Kontrola výsledků je nejdůležitější – patří na první řádek upozornění
  showWarnings([...checks.map((c) => h('p', { class: 'warn-check' }, '⚠ ', c)), ...warnings]);
  const fitInfo = docs.length === 1 && els.pages.firstChild?.dataset.fit ? ` · písmo ${els.pages.firstChild.dataset.fit}` : '';
  setStatus(docs.length ? `Náhled připraven${fitInfo}` : 'Pro tento turnaj není výstup k dispozici.', docs.length ? 'ok' : 'error');
  applyZoom();
  renderTournamentInfo();
  renderPrintMark();
}

export const scheduleRender = debounce(() => {
  // Změna vzhledu: data jsou v mezipaměti, takže jde jen o přeskládání.
  refreshPreview();
}, 200);

export function applyZoom() {
  const z = els.zoom.value;
  const pages = els.pages;
  const first = pages.querySelector('.page');
  // Zmenšení přes transform (ne CSS zoom): rozvržení stránek zůstane přesně jako při tisku,
  // CSS zoom by výšky řádků zaokrouhloval jinak a konec tabulky mohl „přetéct“ přes okraj.
  Object.assign(pages.style, { zoom: '', transform: '', transformOrigin: '', marginLeft: '', marginRight: '', marginBottom: '' });
  if (!first) return;
  const cs = getComputedStyle(els.scroll);
  const availW = els.scroll.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  const availH = els.scroll.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
  let scale = Number(z) || 1;
  if (z === 'fit') {
    scale = Math.min(1.25, Math.max(0.2, availW / first.offsetWidth));
  } else if (z === 'page') {
    scale = Math.min(1.25, Math.max(0.2, Math.min(availW / first.offsetWidth, availH / first.offsetHeight)));
  }
  const w = pages.offsetWidth;
  const hgt = pages.offsetHeight;
  Object.assign(pages.style, {
    transform: `scale(${scale})`,
    transformOrigin: '0 0',
    // Okraje upraví místo, které stránky zabírají, na zmenšenou velikost (a vycentrují je)
    marginLeft: `${Math.max(0, (availW - w * scale) / 2)}px`,
    marginRight: `${w * scale - w}px`,
    marginBottom: `${hgt * scale - hgt}px`,
  });
  store.update((s) => { s.ui.previewZoom = z; }, { silent: true });
}

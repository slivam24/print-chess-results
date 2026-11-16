// Metadata turnaje: název, informační tabulka, menu (kola, seznamy), skupiny.

import { text, norm, urlParam, tnrFromHref, dateFromText, cellsOf } from './dom.js';
import { infoKey } from './headers.js';

/** Typ turnaje z textu „Tournament type“. */
export function classifyType(typeText) {
  const t = norm(typeText);
  const isTeam = /team|druzstv|mannschaft|tym/.test(t);
  let system = 'swiss';
  if (/round ?robin|kazdy s kazdym|rundenturnier|vollrunden|scheveningen|berger/.test(t)) system = 'roundrobin';
  else if (/swiss|svycar|schweizer/.test(t)) system = 'swiss';
  else if (/k\.?\s?o\.?|knock/.test(t)) system = 'knockout';
  return { isTeam, system };
}

function parseDateRange(s) {
  const t = String(s || '');
  const all = [...t.matchAll(/(\d{4}\/\d{1,2}\/\d{1,2}|\d{1,2}\.\d{1,2}\.\d{4})/g)].map((m) => dateFromText(m[1]));
  return { from: all[0] || null, to: all[1] || all[0] || null };
}

/** Název turnaje. */
function parseTitle(doc) {
  const h2 = doc.querySelector('.defaultDialog h2') || doc.querySelector('h2');
  let title = text(h2);
  // Na stránce bez detailů je první h2 přímo název seznamu – zkusíme <title>.
  const docTitle = text(doc.querySelector('title'));
  const fromTitle = docTitle.replace(/^.*?chess-results\.com\s*-\s*/i, '').trim();
  if (!title || (fromTitle && !doc.querySelector('td.CRnowrap'))) title = fromTitle || title;
  return title;
}

/** Položky řádku menu (odkazy + aktuální položka v <i><b>). */
function menuItems(td, selfTnr) {
  const items = [];
  const walk = (node) => {
    for (const n of node.childNodes || []) {
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toUpperCase();
      if (tag === 'A') {
        const href = n.getAttribute('href') || '';
        items.push({
          label: text(n),
          href,
          tnr: tnrFromHref(href),
          art: urlParam(href, 'art') != null ? Number(urlParam(href, 'art')) : null,
          rd: urlParam(href, 'rd') != null ? Number(urlParam(href, 'rd')) : null,
          current: false,
        });
      } else if (tag === 'I' || tag === 'B') {
        if (n.querySelector('a')) walk(n);
        else items.push({ label: text(n), href: null, tnr: selfTnr, art: null, rd: null, current: true });
      } else {
        walk(n);
      }
    }
  };
  walk(td);
  return items;
}

/** Číslo turnaje z odkazů na stránce. */
export function detectTnr(doc) {
  const counts = new Map();
  for (const a of doc.querySelectorAll('a[href*="tnr"]')) {
    const href = a.getAttribute('href') || '';
    const n = tnrFromHref(href);
    if (n && /art=9|art=0|art=1|art=2|art=3/.test(href)) counts.set(n, (counts.get(n) || 0) + 1);
  }
  const form = doc.querySelector('form[action*="tnr"]');
  if (form) {
    const n = tnrFromHref(form.getAttribute('action'));
    if (n) counts.set(n, (counts.get(n) || 0) + 1000);
  }
  let best = null;
  let bestC = 0;
  for (const [n, c] of counts) if (c > bestC) { best = n; bestC = c; }
  return best;
}

/**
 * Hlavní informace o turnaji z libovolné stránky turnaje se zobrazenými detaily (turdet=YES).
 */
export function parseInfo(doc, { tnr } = {}) {
  const selfTnr = tnr || detectTnr(doc);
  const info = {
    tnr: selfTnr,
    title: parseTitle(doc),
    fields: {},
    rawFields: [],
    lastUpdate: null,
    lastUpdateText: null,
    groups: [],
    menu: [],
  };

  // Informační tabulka: řádky se dvěma buňkami (popisek | hodnota).
  for (const tr of doc.querySelectorAll('.defaultDialog tr')) {
    const cells = cellsOf(tr);
    if (cells.length !== 2) continue;
    const tbl = tr.closest && tr.closest('table');
    if (tbl && /\bCRs\d\b/.test(tbl.getAttribute('class') || '')) continue;
    const labelCell = cells[0];
    const cls = labelCell.getAttribute('class') || '';
    if (!/^CR(nowrap b)?$/i.test(cls.trim())) continue;
    const label = text(labelCell);
    if (!label || label.length > 60) continue;
    const isMenu = /nowrap/.test(cls);
    if (isMenu) {
      info.menu.push({ label, key: infoKey(label), items: menuItems(cells[1], selfTnr) });
      continue;
    }
    const value = text(cells[1]);
    info.rawFields.push({ label, value });
    const key = infoKey(label);
    if (key && info.fields[key] == null) info.fields[key] = value;
    if (/^(time control|bedenkzeit|tempo)/i.test(norm(label))) {
      const m = label.match(/\(([^)]+)\)/);
      if (m) info.fields.timeControlKind = m[1];
    }
  }

  // Poslední aktualizace
  for (const p of doc.querySelectorAll('p.CRsmall, .CRsmall')) {
    const t = text(p);
    const m = t.match(/(\d{1,2}\.\d{1,2}\.\d{4})\s+(\d{1,2}:\d{2}(?::\d{2})?)/);
    if (m && /update|aktualiz|aktualis/i.test(t)) {
      info.lastUpdateText = `${m[1]} ${m[2]}`;
      const d = dateFromText(m[1]);
      info.lastUpdate = `${d}T${m[2].length === 5 ? m[2] + ':00' : m[2]}`;
      break;
    }
  }

  const f = info.fields;
  const { isTeam, system } = classifyType(f.type);
  info.type = f.type || '';
  info.isTeam = isTeam;
  info.system = system;
  info.totalRounds = f.rounds ? Number(String(f.rounds).match(/\d+/)?.[0]) || null : null;
  const dr = parseDateRange(f.date);
  info.dateFrom = dr.from;
  info.dateTo = dr.to;

  // Skupiny / propojené turnaje („Tournament selection“)
  const groupsRow = info.menu.find((m) => m.key === 'groups');
  if (groupsRow) {
    info.groups = groupsRow.items
      .filter((it) => it.tnr)
      .map((it) => ({ tnr: it.tnr, name: it.label, current: it.current || it.tnr === selfTnr }));
  }

  // Kola: odkazy art=2 (jednotlivci) / art=3 (šachovnice družstev) a art=1 (pořadí po kole)
  const pairRounds = new Set();
  const rankRounds = new Set();
  let maxFromSlash = null;
  for (const row of info.menu) {
    for (const it of row.items) {
      const slash = it.label.match(/(\d+)\s*\/\s*(\d+)/);
      if (slash) maxFromSlash = Number(slash[2]);
      if (it.rd == null) continue;
      if (it.art === 2 || it.art === 3) pairRounds.add(it.rd);
      if (it.art === 1 || it.art === 7) rankRounds.add(it.rd);
    }
  }
  // Aktuální (nezvýrazněná odkazem) položka v řádku s koly
  for (const row of info.menu) {
    const linked = row.items.filter((it) => it.rd != null);
    if (!linked.length) continue;
    const isPair = linked.some((it) => it.art === 2 || it.art === 3);
    const isRank = linked.some((it) => it.art === 1 || it.art === 7);
    for (const it of row.items) {
      if (!it.current) continue;
      const m = it.label.match(/(\d+)/);
      if (!m) continue;
      if (isPair) pairRounds.add(Number(m[1]));
      if (isRank) rankRounds.add(Number(m[1]));
    }
  }
  info.pairedRounds = [...pairRounds].sort((a, b) => a - b);
  info.rankedRounds = [...rankRounds].sort((a, b) => a - b);
  if (!info.totalRounds && maxFromSlash) info.totalRounds = maxFromSlash;
  info.lastPairedRound = info.pairedRounds.length ? Math.max(...info.pairedRounds) : null;
  info.lastRankedRound = info.rankedRounds.length ? Math.max(...info.rankedRounds) : null;

  // Seznam dostupných stránek (art) z menu
  info.availableArts = [...new Set(info.menu.flatMap((m) => m.items.map((it) => it.art)).filter((a) => a != null))];

  // Turnaj bez zobrazených detailů (starý turnaj) – appka/proxy to musí řešit postbackem
  info.detailsHidden = !!doc.querySelector('#cb_alleDetails, input[name="cb_alleDetails"]');

  return info;
}

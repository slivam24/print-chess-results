// Společné pomůcky pro tiskové šablony.

import { fmtPoints } from '../parser/dom.js';

export { fmtPoints };

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Formát jména. chess-results používá „Příjmení, Jméno“.
 *  original   – Novák, Jindřich
 *  first-last – Jindřich Novák
 *  last-first – Novák Jindřich
 *  LAST-first – NOVÁK Jindřich
 */
export function fmtName(name, format = 'original') {
  const n = String(name ?? '').trim();
  if (!n || format === 'original') return n;
  const i = n.indexOf(',');
  if (i < 0) return format === 'LAST-first' ? n.toLocaleUpperCase('cs') : n;
  const last = n.slice(0, i).trim();
  const first = n.slice(i + 1).trim();
  if (format === 'first-last') return `${first} ${last}`.trim();
  if (format === 'last-first') return `${last} ${first}`.trim();
  if (format === 'LAST-first') return `${last.toLocaleUpperCase('cs')} ${first}`.trim();
  return n;
}

export function fmtRating(r) {
  return typeof r === 'number' && r > 0 ? String(r) : '';
}

/** Výsledek partie pro tisk: „1 – 0“, „½ – ½“, „+ – −“. */
export function fmtResult(res) {
  if (!res || !res.played) return '';
  if (res.black == null) return res.white ?? res.text;
  const m = (x) => (x === '-' ? '−' : x);
  return `${m(res.white)} – ${m(res.black)}`;
}

/** Datum ISO → „19. 11. 2026“. */
export function fmtDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${Number(m[3])}. ${Number(m[2])}. ${m[1]}`;
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Text s barvou u hráčů družstev. */
export function colorLabel(c, short = true) {
  if (c === 'w') return short ? 'B' : 'bílé';
  if (c === 'b') return short ? 'Č' : 'černé';
  return '';
}

export function byeLabel(bye) {
  const t = String(bye || '').toLowerCase();
  if (/not paired|nenasazen|nicht/.test(t)) return 'nenasazen';
  if (/half/.test(t)) return 'volno (½)';
  if (/zero/.test(t)) return 'volno (0)';
  return 'volno';
}

/**
 * Systém sloupců: šablona definuje dostupné sloupce, profil ukládá pořadí a viditelnost.
 * Vrací seřazené viditelné definice sloupců.
 */
export function resolveColumns(defs, saved) {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const out = [];
  const seen = new Set();
  for (const s of saved || []) {
    const d = byKey.get(s.key);
    if (!d || seen.has(s.key)) continue;
    seen.add(s.key);
    const w = Number(s.width) > 0 ? Number(s.width) : null;
    const fs = Number(s.fontSize) > 0 ? Number(s.fontSize) : null;
    out.push({
      ...d,
      on: s.on !== false,
      label: s.label || d.label,
      ...(w ? { width: `${w}mm`, userWidth: w } : {}),
      ...(fs ? { fontSize: fs } : {}),
    });
  }
  // Sloupce, které uložené nastavení nezná (přibyly v nové verzi), vložíme na jejich
  // výchozí místo – za nejbližší předchozí sloupec podle definice šablony.
  defs.forEach((d, i) => {
    if (seen.has(d.key)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const idx = out.findIndex((c) => c.key === defs[j].key);
      if (idx >= 0) { at = idx + 1; break; }
    }
    out.splice(at, 0, { ...d, on: d.def !== false });
    seen.add(d.key);
  });
  return out;
}

export function visibleColumns(defs, saved) {
  return resolveColumns(defs, saved).filter((c) => c.on);
}

/**
 * Skryje sloupce označené „hideEmpty“, pokud nemají v žádném řádku hodnotu
 * (typicky tituly nebo národní rating u turnaje, kde je nikdo nemá).
 */
export function pruneEmpty(cols, items, ctx) {
  return cols.filter((c) => !c.hideEmpty || items.some((it) => {
    const v = c.get(it, ctx);
    return v != null && String(v).replace(/<[^>]*>/g, '').trim() !== '';
  }));
}

/**
 * Šířky sloupců pro tabulky s dvojicemi (bílý/černý, domácí/hosté). Protějškové sloupce
 * mají stejnou šířku; sloupce se jménem šířku nemají a rozdělí si zbylé místo rovným dílem
 * (tabulka má table-layout: fixed). Hodnoty v em rostou s písmem, takže sedí při každé velikosti.
 */
export const SYM_W = {
  board: '2.8em',
  no: '2.8em',
  title: '3.2em',
  rating: '3.6em',
  ratingNat: '4.2em',
  fed: '3.2em',
  points: '2.6em',
  result: '5.4em',
  color: '2em',
};

/** Řádek hlavičky tabulky. */
export function theadRow(cols) {
  return `<tr>${cols.map((c) => `<th class="${c.cls || ''}">${esc(c.label)}</th>`).join('')}</tr>`;
}

/** Vlastní velikost písma sloupce (pt) z nastavení profilu. */
function cellStyle(c) {
  return c.fontSize ? ` style="font-size:${c.fontSize}pt"` : '';
}

export function colgroup(cols) {
  if (!cols.some((c) => c.width)) return '';
  return `<colgroup>${cols.map((c) => `<col${c.width ? ` style="width:${c.width}"` : ''}>`).join('')}</colgroup>`;
}

/** Datový řádek – getter vrací už escapované HTML. */
export function bodyRow(cols, item, ctx, trClass = '') {
  return `<tr${trClass ? ` class="${trClass}"` : ''}>${cols.map((c) => `<td class="${c.cls || ''}"${cellStyle(c)}>${c.get(item, ctx) ?? ''}</td>`).join('')}</tr>`;
}

/** Nahrazení proměnných v textech záhlaví/zápatí. */
export function fillVars(text, vars) {
  return String(text ?? '')
    .replace(/\{([a-z_]+)\}/gi, (m, k) => (vars[k.toLowerCase()] != null ? vars[k.toLowerCase()] : ''))
    .split('\n')
    // Úklid oddělovačů po prázdných proměnných: „, 8. 10.“ → „8. 10.“
    .map((line) => line.replace(/^[\s,;·–-]+|[\s,;·–-]+$/g, '').replace(/([,;·])\s*(?=[,;·])/g, '').replace(/\s{2,}/g, ' '))
    .join('\n');
}

export function infoVars(info, extra = {}) {
  const f = (info && info.fields) || {};
  const dates = info && info.dateFrom
    ? (info.dateTo && info.dateTo !== info.dateFrom ? `${fmtDate(info.dateFrom)} – ${fmtDate(info.dateTo)}` : fmtDate(info.dateFrom))
    : '';
  return {
    turnaj: info ? info.title : '',
    misto: f.location || '',
    datum: dates,
    poradatel: f.organizer || '',
    reditel: f.director || '',
    rozhodci: f.chiefArbiter || '',
    hlavni_rozhodci: f.chiefArbiter || '',
    zastupce: f.deputyArbiter || '',
    tempo: f.timeControl || '',
    kol: info && info.totalRounds ? String(info.totalRounds) : '',
    rating: (f.avgRating && String(f.avgRating).match(/\d+/)?.[0]) || '',
    cislo: info && info.tnr ? String(info.tnr) : '',
    ...extra,
  };
}

/** Prostý text → HTML s odstavci podle řádků. */
function lines(s) {
  return esc(s).split(/\n/).map((x) => x.trim()).filter(Boolean).join('<br>');
}

/**
 * Záhlaví stránky z profilu.
 * outputTitle: název výstupu („Los 7. kola“), outputSub: doplněk (datum a čas kola).
 */
export function renderHeader(profile, info, { outputTitle, outputSub, vars = {}, compact = false } = {}) {
  const h = profile.header || {};
  const v = infoVars(info, vars);
  const title = fillVars(h.title ?? '{turnaj}', v);
  const subtitle = fillVars(h.subtitle ?? '', v);
  const right = [];
  const org = fillVars(h.organizer, v);
  const arb = fillVars(h.arbiter, v);
  const txt = fillVars(h.text, v);
  if (org) right.push(`<div><span class="lbl">Pořadatel:</span> ${esc(org)}</div>`);
  if (arb) right.push(`<div><span class="lbl">Rozhodčí:</span> ${esc(arb)}</div>`);
  if (txt) right.push(`<div>${lines(txt)}</div>`);
  const logo = h.logo ? `<img class="logo" src="${h.logo}" alt="" style="height:${Number(h.logoHeight) || 18}mm">` : '';
  const logoRight = h.logoPosition === 'right';
  const showBar = h.enabled !== false && (title || subtitle || right.length || logo);
  const bar = showBar
    ? `<div class="hd-bar${compact ? ' compact' : ''}${h.align === 'left' ? '' : ' center'}">
        ${logo && !logoRight ? `<div class="hd-logo">${logo}</div>` : ''}
        <div class="hd-main">
          ${title ? `<div class="hd-title">${esc(title)}</div>` : ''}
          ${subtitle ? `<div class="hd-sub">${lines(subtitle)}</div>` : ''}
        </div>
        ${right.length ? `<div class="hd-right">${right.join('')}</div>` : ''}
        ${logo && logoRight ? `<div class="hd-logo">${logo}</div>` : ''}
      </div>`
    : '';
  const out = outputTitle
    ? `<div class="hd-output"><span class="hd-output-title">${esc(outputTitle)}</span>${outputSub ? `<span class="hd-output-sub">${esc(outputSub)}</span>` : ''}</div>`
    : '';
  return bar + out;
}

/** Zápatí: vrací funkci (strana, počet stran) → HTML. */
export function renderFooter(profile, info, { vars = {}, fetchedAt } = {}) {
  const f = profile.footer || {};
  if (f.enabled === false) return null;
  const v = infoVars(info, vars);
  const left = f.text ? esc(fillVars(f.text, v)) : '';
  const mid = [];
  if (f.showPrinted !== false) mid.push(`Vytištěno ${esc(fmtDateTime(new Date().toISOString()))}`);
  if (f.showSource !== false && info) {
    mid.push(`chess-results.com${info.tnr ? ` (${info.tnr})` : ''}${info.lastUpdateText ? `, aktualizace ${esc(info.lastUpdateText)}` : ''}`);
  }
  return (no, count) => `<div class="ft-left">${left}</div><div class="ft-mid">${mid.join(' · ')}</div><div class="ft-right">${f.showPageNumbers !== false ? `Strana ${no} / ${count}` : ''}</div>`;
}

/** Nadpis sekce uvnitř dokumentu (např. kategorie nebo skupina). */
export function sectionTitle(text, sub = '') {
  return {
    type: 'html',
    keepWithNext: true,
    html: `<h2 class="sec-title">${esc(text)}${sub ? ` <small>${esc(sub)}</small>` : ''}</h2>`,
  };
}

export function noteBlock(html) {
  return { type: 'html', html: `<div class="note">${html}</div>` };
}

/** Index hráčů startovní listiny podle startovního čísla. */
export function playerIndex(players) {
  const m = new Map();
  for (const p of players || []) if (p.startNo != null) m.set(p.startNo, p);
  return m;
}

/** Porovnání jmen podle české abecedy. */
export const collator = new Intl.Collator('cs', { sensitivity: 'base' });

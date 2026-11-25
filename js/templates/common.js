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
  // Kontumace (chess-results „+ - -“) jako „1K – 0K“, „0K – 1K“, „0K – 0K“
  const isForfeit = [res.white, res.black].some((x) => x === '+' || x === '-');
  if (isForfeit) {
    const k = (x) => `${x === '+' ? '1' : x === '-' ? '0' : x}K`;
    return `${k(res.white)} – ${k(res.black)}`;
  }
  return `${res.white} – ${res.black}`;
}

/** Datum ISO → „19. 11. 2026“. */
export function fmtDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${Number(m[3])}. ${Number(m[2])}. ${m[1]}`;
}

/** Krátké datum pro seznamy: „dnes 14:30“, „včera“, „12. 11. 2026“. */
export function fmtWhen(iso, now = new Date()) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return `dnes ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (diff === 1) return 'včera';
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
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
    const w = parseColWidth(s.width);
    const fs = Number(s.fontSize) > 0 ? Number(s.fontSize) : null;
    out.push({
      ...d,
      on: s.on !== false,
      label: s.label || d.label,
      customLabel: !!s.label,
      ...(w ? { width: w.css, userWidth: w.value } : {}),
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

// ---------------------------------------------------------------------------
// Nadpisy sloupců s ratingem: „RtgF“ (FIDE) a „RtgN“ (národní); když turnaj
// zveřejňuje jen jeden rating, stačí „Elo“.
// ---------------------------------------------------------------------------

const RATING_KIND = {
  rating: 'F', wRating: 'F', bRating: 'F', homeRating: 'F', awayRating: 'F',
  ratingNat: 'N', wRatingNat: 'N', bRatingNat: 'N',
};

/** Zjistí, které ratingy data obsahují (hledá vlastnosti rating / ratingNat > 0). */
export function ratingPresence(data) {
  const found = { F: false, N: false };
  const seen = new Set();
  const walk = (v, depth) => {
    if (!v || typeof v !== 'object' || depth > 6 || seen.has(v) || (found.F && found.N)) return;
    seen.add(v);
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (typeof v.rating === 'number' && v.rating > 0) found.F = true;
    if (typeof v.ratingNat === 'number' && v.ratingNat > 0) found.N = true;
    for (const k in v) if (v[k] && typeof v[k] === 'object') walk(v[k], depth + 1);
  };
  walk(data, 0);
  return found;
}

/** Přepíše výchozí nadpisy ratingových sloupců podle toho, co turnaj zveřejňuje. Vlastní nadpis z profilu zůstane. */
export function ratingLabels(cols, presence) {
  const both = presence && presence.F && presence.N;
  return cols.map((c) => {
    const kind = RATING_KIND[c.key];
    if (!kind || c.customLabel) return c;
    return { ...c, label: both ? (kind === 'F' ? 'RtgF' : 'RtgN') : 'Elo' };
  });
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
  result: '5em', // vejde se i kontumace „1K – 0K“
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

/**
 * <colgroup> tabulky. Výchozí šířky v em jsou jen odhad: sazba (layout.js) je u tabulek
 * s pevným rozložením („sym“) přizpůsobí obsahu (data-fit). Sloupce k ručnímu zápisu
 * (výsledek) si nechají výchozí šířku jako nejmenší (data-min). Šířka zadaná uživatelem platí vždy.
 */
export function colgroup(cols) {
  if (!cols.some((c) => c.width)) return '';
  return `<colgroup>${cols.map((c) => {
    const attrs = [];
    if (c.width) attrs.push(`style="width:${c.width}"`);
    attrs.push(`data-key="${esc(c.key || '')}"`);
    if (c.width && !c.userWidth && /em$/.test(c.width)) {
      attrs.push('data-fit="1"');
      if (/\b(write|res)\b/.test(c.cls || '')) attrs.push(`data-min="${parseFloat(c.width)}"`);
    }
    return `<col ${attrs.join(' ')}>`;
  }).join('')}</colgroup>`;
}

/** Šířka sloupce z nastavení: číslo = mm, „15 %“ = procenta šířky tabulky. */
export function parseColWidth(v) {
  if (v == null || v === '') return null;
  const m = String(v).trim().replace(',', '.').match(/^(\d+(?:\.\d+)?)\s*(%|mm)?$/);
  if (!m || !(Number(m[1]) > 0)) return null;
  return m[2] === '%' ? { css: `${Number(m[1])}%`, value: `${Number(m[1])}%` } : { css: `${Number(m[1])}mm`, value: Number(m[1]) };
}

/** Datový řádek – getter vrací už escapované HTML. */
export function bodyRow(cols, item, ctx, trClass = '') {
  return `<tr${trClass ? ` class="${trClass}"` : ''}>${cols.map((c) => `<td class="${c.cls || ''}"${cellStyle(c)}>${c.get(item, ctx) ?? ''}</td>`).join('')}</tr>`;
}

/** Rozdělí název z chess-results za poslední čárkou: „Přebor škol 2026, 2. stupeň“ → 2 řádky. */
export function splitTitle(title) {
  const t = String(title || '').trim();
  const i = t.lastIndexOf(',');
  return i > 0 && i < t.length - 1 ? `${t.slice(0, i).trim()}\n${t.slice(i + 1).trim()}` : t;
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
    // název skupiny / turnaje z „Tournament selection“ (např. „kat. A“)
    skupina: (info && (info.groups || []).find((g) => g.current || g.tnr === info.tnr)?.name) || '',
    ...extra,
  };
}

/** Prostý text → HTML s odstavci podle řádků. */
function lines(s) {
  return esc(s).split(/\n/).map((x) => x.trim()).filter(Boolean).join('<br>');
}

/**
 * Nadpis na více řádků (Enter v nastavení), např. „Okresní kolo přeboru škol“ / „kategorie A“.
 * mode: 'same' | 'second-smaller' (2. a další řádky menší) | 'first-smaller' (1. řádek menší).
 */
export function titleLines(title, mode = 'same') {
  const rows = String(title || '').split(/\n/).map((x) => x.trim()).filter(Boolean);
  if (rows.length < 2) return esc(rows[0] || '');
  return rows.map((r, i) => {
    const small = (mode === 'second-smaller' && i > 0) || (mode === 'first-smaller' && i === 0);
    return `<span class="hd-title-line${small ? ' small' : ''}">${esc(r)}</span>`;
  }).join('');
}

/**
 * Záhlaví stránky z profilu.
 * outputTitle: název výstupu („Los 7. kola“), outputSub: doplněk (datum a čas kola).
 */
export function renderHeader(profile, info, { outputTitle, outputSub, vars = {}, compact = false, qr = '' } = {}) {
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
  // Loga (turnaj, pořadatel, svaz) vlevo a vpravo od nadpisu
  const logos = (Array.isArray(h.logos) ? h.logos : []).filter((l) => l && l.src);
  const logoBox = (pos) => {
    const list = logos.filter((l) => (l.position === 'right' ? 'right' : 'left') === pos);
    return list.length
      ? `<div class="hd-logo">${list.map((l) => `<img class="logo${l.gray !== false ? ' gray' : ''}" src="${esc(l.src)}" alt="" style="height:${Number(l.height) || 16}mm">`).join('')}</div>`
      : '';
  };
  const showBar = h.enabled !== false && (title || subtitle || right.length || logos.length);
  const bar = showBar
    ? `<div class="hd-bar${compact ? ' compact' : ''}${h.align === 'left' ? '' : ' center'}">
        ${logoBox('left')}
        <div class="hd-main">
          ${title ? `<div class="hd-title">${titleLines(title, h.titleLines)}</div>` : ''}
          ${subtitle ? `<div class="hd-sub">${lines(subtitle)}</div>` : ''}
        </div>
        ${right.length ? `<div class="hd-right">${right.join('')}</div>` : ''}
        ${logoBox('right')}
      </div>`
    : '';
  const out = outputTitle
    ? `<div class="hd-output"><span class="hd-output-title">${esc(outputTitle)}</span>${outputSub ? `<span class="hd-output-sub">${esc(outputSub)}</span>` : ''}</div>`
    : '';
  // QR kód s odkazem na turnaj – vpravo vedle hlavičky (i když je zobrazený jen název výstupu)
  if (qr && (bar || out)) {
    return `<div class="hd-with-qr"><div class="hd-col">${bar}${out}</div><div class="hd-qr">${qr}<div class="hd-qr-cap">výsledky online</div></div></div>`;
  }
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
  // Poděkování sponzorům: text a loga v řádku nad patičkou (na každé stránce se zápatím)
  const sponsors = (Array.isArray(f.sponsors) ? f.sponsors : []).filter((l) => l && l.src);
  const thanks = f.sponsorsText ? esc(fillVars(f.sponsorsText, v)) : '';
  const sponsorRow = sponsors.length || thanks
    ? `<div class="ft-sponsors">${thanks ? `<span class="ft-thanks">${thanks}</span>` : ''}${sponsors.map((l) => `<img class="ft-logo${l.gray !== false ? ' gray' : ''}" src="${esc(l.src)}" alt="" style="height:${Number(l.height) || 10}mm">`).join('')}</div>`
    : '';
  return (no, count) => `${sponsorRow}<div class="ft-line"><div class="ft-left">${left}</div><div class="ft-mid">${mid.join(' · ')}</div><div class="ft-right">${f.showPageNumbers !== false ? `Strana ${no} / ${count}` : ''}</div></div>`;
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

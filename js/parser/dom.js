// Pomocné funkce pro práci s DOM stránek chess-results.com.
// Modul nepoužívá žádné API specifické pro prohlížeč – funguje nad libovolným
// DOM (DOMParser v prohlížeči, linkedom v testech pod Node.js).

/** Normalizovaný text elementu (nbsp → mezera, sloučené mezery). */
export function text(el) {
  if (!el) return '';
  return String(el.textContent || '')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Přímí potomci <tr> typu td/th (ignoruje vnořené tabulky). */
export function cellsOf(tr) {
  const out = [];
  for (const c of tr.children || []) {
    const t = c.tagName && c.tagName.toUpperCase();
    if (t === 'TD' || t === 'TH') out.push(c);
  }
  return out;
}

/** Přímé řádky tabulky (i přes případné <tbody>), bez řádků vnořených tabulek. */
export function rowsOf(table) {
  const out = [];
  for (const c of table.children || []) {
    const t = c.tagName && c.tagName.toUpperCase();
    if (t === 'TR') out.push(c);
    else if (t === 'TBODY' || t === 'THEAD' || t === 'TFOOT') {
      for (const r of c.children || []) {
        if (r.tagName && r.tagName.toUpperCase() === 'TR') out.push(r);
      }
    }
  }
  return out;
}

export function classList(el) {
  return String((el && el.getAttribute && el.getAttribute('class')) || '')
    .split(/\s+/)
    .filter(Boolean);
}

/** Řádek záhlaví datové tabulky chess-results (třída CRng1b / CRg1b apod.). */
export function isHeaderRow(tr) {
  const cls = classList(tr)[0] || '';
  return /^CRn?g\d*b$/i.test(cls);
}

/** Datový řádek (CRng1 / CRng2, případně CRg1 / CRg2). */
export function isDataRow(tr) {
  const cls = classList(tr)[0] || '';
  return /^CRn?g\d+$/i.test(cls);
}

/** Řádek s nadpisem sekce (např. „Round 3 on 2026/11/15 at 10:00“) – jediná buňka s colspan. */
export function isSectionRow(tr) {
  const cells = cellsOf(tr);
  return cells.length === 1 && Number(cells[0].getAttribute('colspan') || 1) > 1;
}

/**
 * Číslo z textu chess-results: „4½“, „5,5“, „½“, „12“, „-1“.
 * Vrací null pro prázdný nebo nečíselný text.
 */
export function parseNum(s) {
  if (s == null) return null;
  let t = String(s).replace(/ /g, ' ').trim();
  if (!t) return null;
  let half = 0;
  if (t.includes('½')) {
    half = 0.5;
    t = t.replace('½', '');
    if (!t.trim()) return 0.5;
  }
  t = t.replace(',', '.').replace(/\s+/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n < 0 ? n - half : n + half;
}

export function parseIntSafe(s) {
  const t = String(s ?? '').trim();
  if (!/^-?\d+$/.test(t)) return null;
  return Number(t);
}

/** Formát bodů pro tisk: 4.5 → „4½“, 0.5 → „½“, 3 → „3“. */
export function fmtPoints(n) {
  if (n == null || Number.isNaN(n)) return '';
  const whole = Math.trunc(n);
  const frac = Math.abs(n - whole);
  if (Math.abs(frac - 0.5) < 1e-9) return (whole === 0 ? (n < 0 ? '-' : '') : String(whole)) + '½';
  if (frac < 1e-9) return String(whole);
  return String(n).replace('.', ',');
}

/** Hodnota parametru z URL odkazu (relativního i absolutního). */
export function urlParam(href, name) {
  if (!href) return null;
  const m = String(href).match(new RegExp('[?&]' + name + '=([^&#]*)', 'i'));
  return m ? decodeURIComponent(m[1]) : null;
}

/** Číslo turnaje z odkazu typu „tnr1495793.aspx“. */
export function tnrFromHref(href) {
  const m = String(href || '').match(/tnr(\d+)\.aspx/i);
  return m ? Number(m[1]) : null;
}

/**
 * Normalizace výsledku partie.
 * „1 - 0“, „½ - ½“, „0 - 1“, „+ - -“, „- - +“, „0 - 0“, „1“ (volno), „“ (nehráno).
 */
export function parseResult(raw) {
  const t = String(raw ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return { text: '', white: null, black: null, played: false, forfeit: false };
  const m = t.match(/^([0-9½+\-]+(?:[.,]5)?)\s*[-:]\s*([0-9½+\-]+(?:[.,]5)?)$/);
  if (m) {
    const w = m[1];
    const b = m[2];
    const forfeit = w === '+' || w === '-' || b === '+' || b === '-';
    return { text: `${w} - ${b}`, white: w, black: b, played: true, forfeit };
  }
  // Jediné číslo (volno / nenasazen) – body pro bílého.
  if (/^[0-9½]+([.,]5)?$/.test(t)) return { text: t, white: t, black: null, played: true, forfeit: false };
  return { text: t, white: null, black: null, played: false, forfeit: false };
}

/** Odstraní diakritiku a sjednotí text pro porovnávání hlaviček. */
export function norm(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ /g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Najde v řetězci číslo kola: „Round 6 on …“, „7. Kolo“, „Rank after Round 6“, „Pořadí po 6 kole“. */
export function roundFromText(s) {
  const t = norm(s).replace(/\d{4}\/\d{1,2}\/\d{1,2}|\d{1,2}\.\d{1,2}\.\d{4}/g, ' ');
  let m = t.match(/(?:^|\D)(\d{1,3})\s*\.\s*(?:round|rd|runde|kolo|kole|kola)\b/);
  if (m) return Number(m[1]);
  m = t.match(/(?:round|rd\.?|runde|kolo|kole|kola)\s*(\d{1,3})(?!\d)/);
  if (m) return Number(m[1]);
  m = t.match(/(?:^|\D)(\d{1,3})\s*(?:round|rd|runde|kolo|kole|kola)\b/);
  if (m) return Number(m[1]);
  return null;
}

export function dateFromText(s) {
  const t = String(s || '');
  let m = t.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

export function timeFromText(s) {
  const m = String(s || '').match(/\b(\d{1,2}:\d{2})\b/);
  return m ? m[1] : null;
}

/** Element h2 s názvem datové sekce (druhý h2 na stránce s detaily turnaje). */
export function sectionHeadings(doc) {
  return [...doc.querySelectorAll('h2')].map((h) => text(h));
}

/** Datové tabulky chess-results v pořadí výskytu. */
export function dataTables(doc) {
  return [...doc.querySelectorAll('table')].filter((t) => /\bCRs\d\b/.test(t.getAttribute('class') || ''));
}

/** Nejbližší předchozí nadpis h2/h3 k tabulce (pro určení typu stránky). */
export function headingBefore(table) {
  let el = table;
  for (let i = 0; i < 6 && el; i++) {
    let p = el.previousElementSibling;
    while (p) {
      const tag = p.tagName.toUpperCase();
      if (tag === 'H2' || tag === 'H3') return p;
      p = p.previousElementSibling;
    }
    el = el.parentElement;
  }
  return null;
}

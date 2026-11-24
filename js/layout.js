// Stránkovací engine.
// Šablona vrací seznam bloků, engine je změří ve skrytém kontejneru se
// stejnými styly a rozloží do stránek A4 (případně do více sloupců na stránce).
// Výsledné stránky slouží zároveň jako náhled i jako podklad pro tisk,
// takže co je vidět v náhledu, to se vytiskne.
//
// Bloky:
//   { type: 'html',  html, keepWithNext?, breakBefore?, spaceBefore? (mm), blockClass? ('tight' = bez mezery pod blokem) }
//   { type: 'table', className?, colgroup?, thead, rows: [ '<tr>…</tr>' ], keepTogether?, breakBefore?,
//     widthGroup? (tabulky se stejnou hodnotou mají stejné šířky sloupců – např. všechny šachovnice),
//     splitAt? ([indexy řádků] – tabulka se smí rozdělit jen před těmito řádky, např. škola + její hráči) }
//   { type: 'break' }

const PAGE_MM = { portrait: [210, 297], landscape: [297, 210] };
const SAFETY_PX = 2;

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

let measureHost = null;
function getMeasureHost() {
  if (!measureHost || !measureHost.isConnected) {
    measureHost = el('div', 'measure-host');
    measureHost.setAttribute('aria-hidden', 'true');
    document.body.appendChild(measureHost);
  }
  measureHost.innerHTML = '';
  return measureHost;
}

/** Aplikuje proměnné vzhledu na kořen dokumentu (náhled i měření). */
export function applyDocStyle(root, o) {
  const [w, h] = PAGE_MM[o.orientation] || PAGE_MM.portrait;
  const m = o.margins || {};
  root.style.setProperty('--page-w', `${w}mm`);
  root.style.setProperty('--page-h', `${h}mm`);
  root.style.setProperty('--m-top', `${m.top ?? 12}mm`);
  root.style.setProperty('--m-right', `${m.right ?? 12}mm`);
  root.style.setProperty('--m-bottom', `${m.bottom ?? 12}mm`);
  root.style.setProperty('--m-left', `${m.left ?? 12}mm`);
  root.style.setProperty('--font', o.fontFamily || 'Arial, Helvetica, sans-serif');
  root.style.setProperty('--fs', `${o.fontSize || 10}pt`);
  root.style.setProperty('--cols', String(o.columns || 1));
  root.style.setProperty('--col-gap', `${o.columnGap ?? 6}mm`);
  if (o.rowHeight) root.style.setProperty('--row-h', `${o.rowHeight}mm`);
  else root.style.removeProperty('--row-h');
  root.className = `print-doc ${o.docClass || ''} ${o.rowHeight ? 'fixed-rows' : ''}`.replace(/\s+/g, ' ').trim();
}

function buildPage(o, { withHeader, pageNo, pageCount }) {
  const page = el('section', 'page');
  if (o.header && withHeader) page.appendChild(el('header', 'pg-head', o.header));
  const body = el('div', 'pg-body');
  const cols = [];
  for (let i = 0; i < (o.columns || 1); i++) {
    const c = el('div', 'pg-col');
    body.appendChild(c);
    cols.push(c);
  }
  page.appendChild(body);
  if (o.footer) page.appendChild(el('footer', 'pg-foot', o.footer(pageNo, pageCount)));
  const wm = o.watermark;
  if (wm && wm.src) {
    const box = el('div', `pg-wm${wm.color === 'color' ? '' : ' gray'}`);
    const img = document.createElement('img');
    img.src = wm.src;
    img.alt = '';
    img.style.width = `${wm.size || 70}%`;
    img.style.opacity = String(Math.max(0.01, Math.min(1, (Number(wm.opacity) || 10) / 100)));
    box.appendChild(img);
    page.appendChild(box);
  }
  return { page, body, cols };
}

/**
 * HTML tabulky (nebo jejího kusu). colPct = šířky sloupců v % změřené z celé tabulky – když se tabulka
 * dělí na více stránek / sloupců, má každý kus stejné šířky sloupců jako celek.
 */
function tableHtml(b, rows, colPct = null) {
  const fixed = colPct && colPct.length;
  const cg = fixed ? `<colgroup>${colPct.map((w) => `<col style="width:${w.toFixed(4)}%">`).join('')}</colgroup>` : (b.colgroup || '');
  return `<table class="${b.className || 'grid'}"${fixed ? ' style="table-layout:fixed"' : ''}>${cg}${b.thead ? `<thead>${b.thead}</thead>` : ''}<tbody>${rows.join('')}</tbody></table>`;
}

/** Šířky sloupců celé tabulky v % (podle řádku s nejvíce buňkami bez slučování). */
function columnPercents(table) {
  const tw = table.getBoundingClientRect().width;
  if (!tw) return null;
  let ref = null;
  for (const tr of table.querySelectorAll('tr')) {
    if ([...tr.children].some((c) => c.colSpan > 1)) continue;
    if (!ref || tr.children.length > ref.children.length) ref = tr;
  }
  if (!ref) return null;
  return [...ref.children].map((c) => (c.getBoundingClientRect().width / tw) * 100);
}

/** Protějškový sloupec (bílý ↔ černý, domácí ↔ hosté) – má mít stejnou šířku. */
export function partnerKey(key) {
  if (/^w[A-Z]/.test(key)) return `b${key.slice(1)}`;
  if (/^b[A-Z]/.test(key)) return `w${key.slice(1)}`;
  if (/^home/.test(key)) return `away${key.slice(4)}`;
  if (/^away/.test(key)) return `home${key.slice(4)}`;
  return null;
}

/**
 * Úzké sloupce tabulek s pevným rozložením („sym“) přizpůsobí obsahu: šířka = nejdelší text
 * (nadpis i buňky) + odsazení. Tabulky se stejnými sloupci (např. všechny zápasy rozpisu) dostanou
 * stejné šířky, protějškové sloupce také. Šířky jsou v em, takže platí pro každou velikost písma.
 */
function autofitColumns(host, blocks, o) {
  const targets = blocks.filter((b) => b.type === 'table' && /\bsym\b/.test(b.className || '') && /data-fit/.test(b.colgroup || ''));
  if (!targets.length) return blocks;
  applyDocStyle(host, o);
  host.innerHTML = '';
  const { page, cols } = buildPage({ ...o, columns: 1 }, { withHeader: false, pageNo: 1, pageCount: 1 });
  host.appendChild(page);
  const col = cols[0];
  const groups = new Map(); // stejný colgroup → společné šířky
  for (const b of targets) {
    if (!groups.has(b.colgroup)) groups.set(b.colgroup, []);
    groups.get(b.colgroup).push(b);
  }
  const replaced = new Map();
  for (const [cg, list] of groups) {
    const tmp = document.createElement('div');
    tmp.innerHTML = `<table>${cg}</table>`;
    const colEls = [...tmp.querySelectorAll('col')];
    const max = colEls.map(() => 0);
    let fs = 0;
    for (const b of list) {
      const wrap = el('div', 'blk autofit-measure');
      wrap.innerHTML = tableHtml(b, b.rows);
      col.appendChild(wrap);
      const table = wrap.querySelector('table');
      fs = parseFloat(getComputedStyle(table).fontSize) || fs;
      for (const tr of table.querySelectorAll('tr')) {
        const cells = [...tr.children];
        if (cells.length !== colEls.length) continue;
        cells.forEach((cell, i) => {
          if (!colEls[i].dataset.fit || !cell.firstChild) return;
          const range = document.createRange();
          range.selectNodeContents(cell);
          const cs = getComputedStyle(cell);
          const w = range.getBoundingClientRect().width + (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) + 2;
          if (w > max[i]) max[i] = w;
        });
      }
      col.removeChild(wrap);
    }
    if (!fs) continue;
    const em = colEls.map((c, i) => {
      if (!c.dataset.fit) return null;
      const min = Number(c.dataset.min) || 1.4;
      // + malá rezerva, aby text nebyl nalepený na čárách
      return Math.max(min, Math.ceil((max[i] / fs + 0.4) * 10) / 10);
    });
    const keys = colEls.map((c) => c.dataset.key);
    keys.forEach((k, i) => {
      const j = keys.indexOf(partnerKey(k));
      if (em[i] != null && j >= 0 && em[j] != null) em[i] = em[j] = Math.max(em[i], em[j]);
    });
    colEls.forEach((c, i) => { if (em[i] != null) c.style.width = `${em[i]}em`; });
    replaced.set(cg, `<colgroup>${colEls.map((c) => c.outerHTML).join('')}</colgroup>`);
  }
  host.innerHTML = '';
  return blocks.map((b) => (b.type === 'table' && replaced.has(b.colgroup) ? { ...b, colgroup: replaced.get(b.colgroup) } : b));
}

/** Kolikrát je obsah buňky širší než místo v ní (pro odhad menšího písma). */
function cellRatio(cell) {
  const range = document.createRange();
  range.selectNodeContents(cell);
  const cs = getComputedStyle(cell);
  const avail = Math.max(1, cell.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0));
  return Math.max(range.getBoundingClientRect().width, cell.scrollWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)) / avail;
}

/** Je text buňky širší než její vnitřní šířka (přesně, bez zaokrouhlení)? */
function textOverflows(cell) {
  if (!cell.firstChild) return false;
  const range = document.createRange();
  range.selectNodeContents(cell);
  const cs = getComputedStyle(cell);
  const avail = cell.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  return range.getBoundingClientRect().width > avail + 0.05;
}

/** Změří bloky v daném sloupci. */
function measureBlocks(col, blocks) {
  const out = [];
  out.overflowX = false;
  const cs = getComputedStyle(col);
  const colW = col.getBoundingClientRect().width - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  // Mezera pod blokem (padding-bottom .blk) – poslední blok ve sloupci ji nemá, proto se měří zvlášť
  const g1 = el('div', 'blk');
  const g2 = el('div', 'blk');
  col.append(g1, g2);
  out.gap = Math.max(0, g1.getBoundingClientRect().height - g2.getBoundingClientRect().height);
  col.removeChild(g1);
  col.removeChild(g2);
  // Skupiny tabulek se stejnými šířkami sloupců: šířky z jedné tabulky se všemi jejich řádky
  const groupPct = new Map();
  const groups = new Map();
  for (const b of blocks) {
    if (b.type === 'table' && b.widthGroup) {
      if (!groups.has(b.widthGroup)) groups.set(b.widthGroup, []);
      groups.get(b.widthGroup).push(b);
    }
  }
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const wrap = el('div', 'blk');
    wrap.innerHTML = tableHtml({ ...list[0], rows: list.flatMap((b) => b.rows) }, list.flatMap((b) => b.rows));
    col.appendChild(wrap);
    const needW = Math.max(wrap.scrollWidth, wrap.firstElementChild ? wrap.firstElementChild.getBoundingClientRect().width : 0);
    if (needW > colW + 1) {
      out.overflowX = true;
      out.widthRatio = Math.max(out.widthRatio || 1, needW / colW);
    }
    const pct = columnPercents(wrap.querySelector('table'));
    if (pct) groupPct.set(key, pct);
    col.removeChild(wrap);
  }
  for (const b of blocks) {
    if (b.type === 'break') { out.push({ b, h: 0 }); continue; }
    const wrap = el('div', `blk ${b.blockClass || ''}`.trim());
    if (b.type === 'html') {
      wrap.innerHTML = b.html;
      col.appendChild(wrap);
      out.push({ b, h: wrap.getBoundingClientRect().height });
    } else if (b.type === 'table') {
      const gp = b.widthGroup ? groupPct.get(b.widthGroup) : null;
      wrap.innerHTML = tableHtml(b, b.rows, gp);
      col.appendChild(wrap);
      const total = wrap.getBoundingClientRect().height;
      const thead = wrap.querySelector('thead');
      const theadH = thead ? thead.getBoundingClientRect().height : 0;
      const trs = wrap.querySelectorAll(':scope > table > tbody > tr');
      const rowH = [...trs].map((tr) => tr.getBoundingClientRect().height);
      const sum = theadH + rowH.reduce((a, c) => a + c, 0);
      out.push({ b, h: total, theadH, rowH, extra: Math.max(0, total - sum), colPct: gp || columnPercents(wrap.querySelector('table')), grouped: !!gp });
    }
    const needW = Math.max(wrap.scrollWidth, wrap.firstElementChild ? wrap.firstElementChild.getBoundingClientRect().width : 0);
    if (needW > colW + 1) {
      out.overflowX = true;
      out.widthRatio = Math.max(out.widthRatio || 1, needW / colW);
    }
    // Pevné rozložení tabulky (table-layout: fixed) nepřeteče jako celek – přetéct může obsah buňky
    if (b.type === 'table' && /\bsym\b/.test(b.className || '')) {
      // U tabulek „one-line“ se hlídá i hlavička (názvy družstev), a to přesně – i o zlomek pixelu
      // delší text by prohlížeč zkrátil na „…“ (scrollWidth je zaokrouhlený, proto měříme text přímo)
      const oneLine = /\bone-line\b/.test(b.className || '');
      for (const cell of wrap.querySelectorAll(oneLine ? 'td, th' : 'td')) {
        if (cell.scrollWidth > cell.clientWidth + 1 || (oneLine && textOverflows(cell))) {
          out.overflowX = true;
          out.widthRatio = Math.max(out.widthRatio || 1, cellRatio(cell));
        }
      }
    }
    col.removeChild(wrap);
  }
  return out;
}

/**
 * Rozloží změřené bloky do stránek a sloupců (čistý výpočet bez DOM).
 * gap = mezera pod každým blokem kromě posledního ve sloupci.
 */
/** Konec skupiny řádků, která začíná řádkem start (podle splitAt), nebo konec tabulky. */
function groupEnd(b, start) {
  if (!b.splitAt) return Math.min(start + 1, b.rows.length);
  const next = b.splitAt.filter((x) => x > start);
  return next.length ? Math.min(...next) : b.rows.length;
}

export function pack(measured, { capFirst, capOther, columns, gap = 0 }) {
  const pages = [[]];
  let colIdx = 0;
  let used = 0; // obsazená výška včetně mezery pod posledním blokem
  const cap = () => (pages.length === 1 ? capFirst : capOther);
  const curCol = () => {
    const p = pages[pages.length - 1];
    while (p.length <= colIdx) p.push([]);
    return p[colIdx];
  };
  const pageHasContent = () => pages[pages.length - 1].some((c) => c.length);
  const newPage = () => { pages.push([]); colIdx = 0; used = 0; };
  const newCol = () => {
    colIdx += 1;
    used = 0;
    if (colIdx >= columns) newPage();
  };
  // Vejde se do sloupce blok výšky h (bez mezery pod ním)?
  const fits = (h) => used + h <= cap() - SAFETY_PX;
  const minHeight = (m) => {
    if (!m) return 0;
    if (m.b.type === 'table') {
      if (m.b.keepTogether) return m.h;
      const firstEnd = groupEnd(m.b, 0);
      return m.extra + m.theadH + m.rowH.slice(0, firstEnd).reduce((a, c) => a + c, 0);
    }
    return m.h;
  };

  // Mezera pod blokem (blok s třídou „tight“ ji nemá) a volitelná mezera nad blokem
  // (spaceBefore v mm – nepřidává se na začátku sloupce/stránky)
  const gapOf = (m) => (String(m.b.blockClass || '').split(/\s+/).includes('tight') ? 0 : gap);
  const spaceOf = (m) => (used > 0 && m.b.spaceBefore > 0 ? m.b.spaceBefore * PX_PER_MM : 0);

  for (let i = 0; i < measured.length; i++) {
    const m = measured[i];
    const b = m.b;
    if (b.type === 'break') { if (pageHasContent()) newPage(); continue; }
    if (b.breakBefore && pageHasContent()) newPage();
    if (b.columnBreakBefore && used > 0) newCol();

    if (b.type === 'html') {
      let need = m.h;
      if (b.keepWithNext && measured[i + 1]) need += gapOf(m) + minHeight(measured[i + 1]);
      let sp = spaceOf(m);
      if (used > 0 && !fits(sp + need)) { newCol(); sp = 0; }
      curCol().push({ kind: 'html', b, space: sp > 0 });
      used += sp + m.h + gapOf(m);
      continue;
    }

    // Tabulka
    if ((b.keepTogether && m.h <= cap()) || !b.rows.length) {
      let sp = spaceOf(m);
      if (used > 0 && !fits(sp + m.h)) { newCol(); sp = 0; }
      curCol().push({ kind: 'table', b, from: 0, to: b.rows.length, space: sp > 0 });
      used += sp + m.h + gapOf(m);
      continue;
    }
    let start = 0;
    let sp = spaceOf(m);
    while (start < b.rows.length) {
      const base = m.extra + m.theadH;
      if (used > 0 && !fits(sp + base + m.rowH[start])) { newCol(); sp = 0; continue; }
      let h = base;
      let end = start;
      while (end < b.rows.length && fits(sp + h + m.rowH[end])) {
        h += m.rowH[end];
        end += 1;
      }
      // Dělení jen na hranicích skupin řádků (splitAt); skupina vyšší než sloupec se rozdělí
      if (b.splitAt && end < b.rows.length) {
        const allowed = b.splitAt.filter((x) => x > start && x <= end);
        const at = allowed.length ? Math.max(...allowed) : null;
        if (at != null && at < end) {
          for (let k = at; k < end; k++) h -= m.rowH[k];
          end = at;
        } else if (at == null && used > 0) {
          // Skupina se sem nevejde celá – začne v dalším sloupci
          newCol(); sp = 0; continue;
        }
      }
      if (end === start) { h += m.rowH[start]; end = start + 1; } // řádek vyšší než sloupec
      curCol().push({ kind: 'table', b, from: start, to: end, space: sp > 0 });
      used += sp + h + gapOf(m);
      sp = 0;
      start = end;
      if (start < b.rows.length) newCol();
    }
  }
  // Odstraní prázdné koncové stránky
  while (pages.length > 1 && !pages[pages.length - 1].some((c) => c.length)) pages.pop();
  return pages;
}

/** Výška obsahu sloupce (bez vnitřního okraje). */
function contentHeight(col) {
  const cs = getComputedStyle(col);
  return col.getBoundingClientRect().height - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
}

function measureAndPack(host, blocks, o) {
  applyDocStyle(host, o);
  host.innerHTML = '';
  const probeFirst = buildPage(o, { withHeader: true, pageNo: 99, pageCount: 99 });
  host.appendChild(probeFirst.page);
  const capFirst = contentHeight(probeFirst.cols[0]);
  let capOther = capFirst;
  if (o.header && !o.headerEveryPage) {
    const probeOther = buildPage(o, { withHeader: false, pageNo: 99, pageCount: 99 });
    host.appendChild(probeOther.page);
    capOther = contentHeight(probeOther.cols[0]);
  }
  const measured = measureBlocks(probeFirst.cols[0], blocks);
  const pages = pack(measured, { capFirst, capOther, columns: o.columns || 1, gap: measured.gap });
  return { pages, capFirst, capOther, overflowX: measured.overflowX, widthRatio: measured.widthRatio || 1, measured };
}

/**
 * Vysází bloky do stránek v elementu target.
 * o: { orientation, margins, fontFamily, fontSize, columns, header (html), headerEveryPage,
 *      footer (fn(pageNo, pageCount) → html), watermark ({ src, opacity %, color: 'gray'|'color', size % }),
 *      fit: { enabled, minPt, maxPt, autoColumns } }
 * Vrací { pageCount, fontSize, columns }.
 */
export function layoutDocument(target, blocks0, o) {
  const host = getMeasureHost();
  let opts = { ...o };
  const blocks = autofitColumns(host, blocks0, o);

  if (o.fit && o.fit.enabled) {
    opts = fitToOnePage(host, blocks, o);
  } else if (o.fitPage && o.fitPage.enabled) {
    opts = fitPageWithRows(host, blocks, o);
  } else if (o.fitWidth && o.fitWidth.enabled) {
    opts = fitToWidth(host, blocks, o);
  }
  const { pages, overflowX, measured } = measureAndPack(host, blocks, opts);
  host.innerHTML = '';
  // Tabulky rozdělené na více kusů (stránky, sloupce): všechny kusy se šířkami sloupců celé tabulky
  const pctOf = new Map(measured.filter((m) => m.colPct).map((m) => [m.b, m.colPct]));
  const grouped = new Set(measured.filter((m) => m.grouped).map((m) => m.b));
  const pieces = new Map();
  for (const pg of pages) for (const col of pg) for (const it of col) if (it.kind === 'table') pieces.set(it.b, (pieces.get(it.b) || 0) + 1);

  applyDocStyle(target, opts);
  target.innerHTML = '';
  const total = pages.length;
  pages.forEach((cols, pi) => {
    const withHeader = pi === 0 || opts.headerEveryPage;
    const { page, cols: colEls } = buildPage(opts, { withHeader, pageNo: pi + 1, pageCount: total });
    cols.forEach((items, ci) => {
      for (const it of items) {
        const wrap = el('div', `blk ${it.b.blockClass || ''}`.trim());
        if (it.space) wrap.style.marginTop = `${it.b.spaceBefore}mm`;
        if (it.kind === 'html') wrap.innerHTML = it.b.html;
        else wrap.innerHTML = tableHtml(it.b, it.b.rows.slice(it.from, it.to), pieces.get(it.b) > 1 || grouped.has(it.b) ? pctOf.get(it.b) : null);
        colEls[ci].appendChild(wrap);
      }
    });
    target.appendChild(page);
  });
  return { pageCount: total, fontSize: opts.fontSize, columns: opts.columns, rowHeight: opts.rowHeight || null, overflowX };
}

/** Najde největší písmo (a případně počet sloupců), při kterém se vše vejde na 1 stránku. */
function fitToOnePage(host, blocks, o) {
  const minPt = o.fit.minPt || 7;
  const maxPt = o.fit.maxPt || 28;
  const tryCols = o.fit.autoColumns ? [1, 2, 3] : [o.columns || 1];
  let best = null;
  for (const columns of tryCols) {
    let lo = minPt;
    let hi = maxPt;
    let found = null;
    // Binární hledání s krokem 0,25 pt
    while (hi - lo > 0.25) {
      const mid = Math.round(((lo + hi) / 2) * 4) / 4;
      const { pages, overflowX } = measureAndPack(host, blocks, { ...o, columns, fontSize: mid });
      if (pages.length <= 1 && !overflowX) { found = mid; lo = mid; } else { hi = mid; }
    }
    if (found == null) {
      const { pages, overflowX } = measureAndPack(host, blocks, { ...o, columns, fontSize: lo });
      if (pages.length <= 1 && !overflowX) found = lo;
    }
    if (found != null && (!best || found > best.fontSize + 0.5)) best = { columns, fontSize: found };
    // Pokud 1 sloupec dává dost velké písmo, další sloupce nezkoušíme
    if (best && best.columns === 1 && best.fontSize >= (o.fit.preferSingleAbovePt || 14)) break;
  }
  if (!best) return { ...o, fontSize: minPt, columns: tryCols[tryCols.length - 1] };
  return { ...o, ...best };
}

/**
 * Největší písmo (nejvýš maxPt), při kterém se všechny sloupce tabulek vejdou na šířku
 * bez zalamování. Počet stránek se nehlídá – tabulka může pokračovat na další stránce.
 */
function fitToWidth(host, blocks, o) {
  const r = maxFontForWidth(host, blocks, o, o.fitWidth.minPt || 6, Math.max(o.fitWidth.minPt || 6, o.fitWidth.maxPt || 20));
  return { ...o, fontSize: r.font };
}

const snap = (pt) => Math.floor(pt * 4) / 4; // krok 0,25 pt

/**
 * Největší písmo v [minPt, maxPt], při kterém se všechny sloupce vejdou na šířku.
 * Šířky textu rostou úměrně písmu, takže z poměru „potřebná / dostupná šířka“ se dá menší písmo
 * přímo odhadnout; měření pak jen ověří odhad (obvykle 2–3 sazby místo ~8 při půlení intervalu).
 * Vrací { font, fits, result } – result je sazba při nalezeném písmu.
 */
function maxFontForWidth(host, blocks, o, minPt, maxPt) {
  const at = (pt) => measureAndPack(host, blocks, { ...o, fontSize: pt });
  let hi = maxPt;
  let r = at(hi);
  if (!r.overflowX) return { font: hi, fits: true, result: r };
  // 1) Odhad z poměru šířek (u běžných tabulek přesný, u tabulek s pevnými sloupci spíš opatrný)
  let lo = null; // největší ověřené písmo, které se vejde
  let loRes = null;
  for (let i = 0; i < 4 && lo == null; i++) {
    const guess = Math.max(minPt, Math.min(hi - 0.25, snap(hi / Math.max(1.0001, r.widthRatio))));
    const g = at(guess);
    if (!g.overflowX) { lo = guess; loRes = g; } else { hi = guess; r = g; }
    if (guess <= minPt) break;
  }
  if (lo == null) return { font: minPt, fits: false, result: at(minPt) };
  // 2) Dohledání nahoru: nejdřív o krok (obvykle stačí), jinak půlením intervalu
  while (hi - lo > 0.25) {
    const mid = hi - lo <= 0.5 ? lo + 0.25 : snap((lo + hi) / 2);
    if (mid <= lo || mid >= hi) break;
    const m = at(mid);
    if (!m.overflowX) { lo = mid; loRes = m; } else hi = mid;
    if (mid === lo && lo + 0.25 >= hi) break;
  }
  return { font: lo, fits: true, result: loRes };
}

const PX_PER_MM = 96 / 25.4;

/**
 * Vše na jednu stránku: největší písmo (nejvýš maxPt), při kterém se všechny sloupce vejdou
 * na šířku a celý výstup na jednu stránku. Zbylé místo dole pak vyplní vyšší řádky tabulek
 * (nejvýš maxRowFactor× přirozené výšky, aby pár řádků nebylo přes celou stránku).
 */
function fitPageWithRows(host, blocks, o) {
  const minPt = o.fitPage.minPt || 6;
  const maxPt = Math.max(minPt, o.fitPage.maxPt || 20);
  // Nevejde-li se výstup na jednu stránku ani při nejmenším písmu, hledá se co největší písmo
  // pro nejmenší možný počet stránek (ten, který dává nejmenší písmo)
  const atMin = measureAndPack(host, blocks, { ...o, fontSize: minPt });
  const maxPages = Math.max(1, atMin.pages.length);
  // 1) Písmo: nejdřív strop daný šířkou sloupců, pak výška (stránkování) – výšky rostou úměrně písmu,
  //    takže stránkování mezi dvěma změřenými velikostmi se dá dopočítat bez další sazby
  const w = maxFontForWidth(host, blocks, o, minPt, maxPt);
  let font = w.font;
  let res = w.result;
  if (res.pages.length > maxPages) {
    const fits = (pt) => packEstimate(interpolate(atMin, res, minPt, font, pt), o.columns || 1).length <= maxPages;
    let lo = minPt;
    let hi = font;
    while (hi - lo > 0.25) {
      const mid = snap((lo + hi) / 2);
      if (mid <= lo) break;
      if (fits(mid)) lo = mid; else hi = mid;
    }
    // ověření skutečnou sazbou (odhad může být o krok vedle)
    font = lo;
    res = measureAndPack(host, blocks, { ...o, fontSize: font });
    while (font > minPt && (res.pages.length > maxPages || res.overflowX)) {
      font = Math.max(minPt, font - 0.25);
      res = measureAndPack(host, blocks, { ...o, fontSize: font });
    }
    if (font + 0.25 <= w.font) {
      const up = measureAndPack(host, blocks, { ...o, fontSize: font + 0.25 });
      if (up.pages.length <= maxPages && !up.overflowX) { font += 0.25; res = up; }
    }
  }
  const base = { ...o, fontSize: font };
  // 2) Výška řádků: přirozená výška řádku (nejvyšší z tabulek) → co nejvyšší, aby se nezvýšil počet stránek
  //    (1 stránka, nebo počet daný vynuceným koncem stránky, např. „každé kolo na samostatné stránce“)
  const rows = res.measured.flatMap((m) => m.rowH || []);
  if (!rows.length || res.pages.length > maxPages) return base;
  const natural = Math.max(...rows) / PX_PER_MM; // mm
  const start = Math.max(natural, Number(o.rowHeight) || 0);
  const maxRow = Math.max(start, natural * (o.fitPage.maxRowFactor || 2.5));
  // Výšku řádku stačí dopočítat: každý řádek bude vysoký aspoň zvolenou výšku
  const fitsRows = (mm) => packEstimate(withRowHeight(res, mm * PX_PER_MM), o.columns || 1).length <= maxPages;
  let lo = start;
  let hi = maxRow;
  if (fitsRows(hi)) lo = hi;
  else {
    while (hi - lo > 0.1) {
      const mid = (lo + hi) / 2;
      if (fitsRows(mid)) lo = mid; else hi = mid;
    }
  }
  let rowHeight = Math.floor(lo * 10) / 10;
  if (rowHeight <= natural + 0.05) return base;
  // ověření skutečnou sazbou
  for (let i = 0; i < 6; i++) {
    const r = measureAndPack(host, blocks, { ...base, rowHeight });
    if (r.pages.length <= maxPages && !r.overflowX) return { ...base, rowHeight };
    rowHeight = Math.round((rowHeight - Math.max(0.2, (rowHeight - natural) / 4)) * 10) / 10;
    if (rowHeight <= natural + 0.05) break;
  }
  return base;
}

function packEstimate(est, columns) {
  return pack(est.measured, { capFirst: est.capFirst, capOther: est.capOther, columns, gap: est.gap });
}

/** Odhad sazby při písmu pt lineárně mezi dvěma skutečnými měřeními (stejné bloky). */
export function interpolate(A, B, fa, fb, pt) {
  const t = fb === fa ? 0 : (pt - fa) / (fb - fa);
  const lerp = (x, y) => x + (y - x) * t;
  const measured = A.measured.map((m, i) => {
    const n = B.measured[i];
    const out = { b: m.b, h: lerp(m.h, n.h) };
    if (m.rowH) {
      out.theadH = lerp(m.theadH, n.theadH);
      out.extra = lerp(m.extra, n.extra);
      out.rowH = m.rowH.map((x, j) => lerp(x, n.rowH[j]));
    }
    return out;
  });
  return { measured, capFirst: lerp(A.capFirst, B.capFirst), capOther: lerp(A.capOther, B.capOther), gap: lerp(A.measured.gap || 0, B.measured.gap || 0) };
}

/** Sazba s minimální výškou řádku tabulek (px). */
export function withRowHeight(R, px) {
  const measured = R.measured.map((m) => {
    if (!m.rowH) return m;
    const rowH = m.rowH.map((x) => Math.max(x, px));
    return { ...m, rowH, h: m.theadH + m.extra + rowH.reduce((a, c) => a + c, 0) };
  });
  return { measured, capFirst: R.capFirst, capOther: R.capOther, gap: R.measured.gap || 0 };
}

/** CSS pravidlo @page pro tisk dané orientace. */
export function pageRule(orientation) {
  return `@page { size: A4 ${orientation === 'landscape' ? 'landscape' : 'portrait'}; margin: 0; }`;
}

// Stránkovací engine.
// Šablona vrací seznam bloků, engine je změří ve skrytém kontejneru se
// stejnými styly a rozloží do stránek A4 (případně do více sloupců na stránce).
// Výsledné stránky slouží zároveň jako náhled i jako podklad pro tisk,
// takže co je vidět v náhledu, to se vytiskne.
//
// Bloky:
//   { type: 'html',  html, keepWithNext?, breakBefore? }
//   { type: 'table', className?, colgroup?, thead, rows: [ '<tr>…</tr>' ], keepTogether?, breakBefore? }
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
  root.className = `print-doc ${o.docClass || ''}`.trim();
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
  return { page, body, cols };
}

function tableHtml(b, rows) {
  return `<table class="${b.className || 'grid'}">${b.colgroup || ''}${b.thead ? `<thead>${b.thead}</thead>` : ''}<tbody>${rows.join('')}</tbody></table>`;
}

/** Změří bloky v daném sloupci. */
function measureBlocks(col, blocks) {
  const out = [];
  out.overflowX = false;
  const colW = col.getBoundingClientRect().width;
  for (const b of blocks) {
    if (b.type === 'break') { out.push({ b, h: 0 }); continue; }
    const wrap = el('div', `blk ${b.blockClass || ''}`.trim());
    if (b.type === 'html') {
      wrap.innerHTML = b.html;
      col.appendChild(wrap);
      out.push({ b, h: wrap.getBoundingClientRect().height });
    } else if (b.type === 'table') {
      wrap.innerHTML = tableHtml(b, b.rows);
      col.appendChild(wrap);
      const total = wrap.getBoundingClientRect().height;
      const thead = wrap.querySelector('thead');
      const theadH = thead ? thead.getBoundingClientRect().height : 0;
      const trs = wrap.querySelectorAll(':scope > table > tbody > tr');
      const rowH = [...trs].map((tr) => tr.getBoundingClientRect().height);
      const sum = theadH + rowH.reduce((a, c) => a + c, 0);
      out.push({ b, h: total, theadH, rowH, extra: Math.max(0, total - sum) });
    }
    if (wrap.scrollWidth > colW + 1 || (wrap.firstElementChild && wrap.firstElementChild.getBoundingClientRect().width > colW + 1)) out.overflowX = true;
    col.removeChild(wrap);
  }
  return out;
}

/** Rozloží změřené bloky do stránek a sloupců (čistý výpočet bez DOM). */
export function pack(measured, { capFirst, capOther, columns }) {
  const pages = [[]];
  let colIdx = 0;
  let used = 0;
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
  const minHeight = (m) => {
    if (!m) return 0;
    if (m.b.type === 'table') {
      if (m.b.keepTogether) return m.h;
      return m.extra + m.theadH + (m.rowH[0] || 0);
    }
    return m.h;
  };

  for (let i = 0; i < measured.length; i++) {
    const m = measured[i];
    const b = m.b;
    if (b.type === 'break') { if (pageHasContent()) newPage(); continue; }
    if (b.breakBefore && pageHasContent()) newPage();
    if (b.columnBreakBefore && used > 0) newCol();

    if (b.type === 'html') {
      let need = m.h;
      if (b.keepWithNext) need += minHeight(measured[i + 1]);
      if (used > 0 && used + need > cap() - SAFETY_PX) newCol();
      curCol().push({ kind: 'html', b });
      used += m.h;
      continue;
    }

    // Tabulka
    if (b.keepTogether && m.h <= cap()) {
      if (used > 0 && used + m.h > cap() - SAFETY_PX) newCol();
      curCol().push({ kind: 'table', b, from: 0, to: b.rows.length });
      used += m.h;
      continue;
    }
    let start = 0;
    if (!b.rows.length) {
      if (used > 0 && used + m.h > cap() - SAFETY_PX) newCol();
      curCol().push({ kind: 'table', b, from: 0, to: 0 });
      used += m.h;
      continue;
    }
    while (start < b.rows.length) {
      const base = m.extra + m.theadH;
      if (used > 0 && used + base + m.rowH[start] > cap() - SAFETY_PX) { newCol(); continue; }
      let h = base;
      let end = start;
      while (end < b.rows.length && used + h + m.rowH[end] <= cap() - SAFETY_PX) {
        h += m.rowH[end];
        end += 1;
      }
      if (end === start) { h += m.rowH[start]; end = start + 1; } // řádek vyšší než sloupec
      curCol().push({ kind: 'table', b, from: start, to: end });
      used += h;
      start = end;
      if (start < b.rows.length) newCol();
    }
  }
  // Odstraní prázdné koncové stránky
  while (pages.length > 1 && !pages[pages.length - 1].some((c) => c.length)) pages.pop();
  return pages;
}

function measureAndPack(host, blocks, o) {
  applyDocStyle(host, o);
  host.innerHTML = '';
  const probeFirst = buildPage(o, { withHeader: true, pageNo: 99, pageCount: 99 });
  host.appendChild(probeFirst.page);
  const capFirst = probeFirst.cols[0].getBoundingClientRect().height;
  let capOther = capFirst;
  if (o.header && !o.headerEveryPage) {
    const probeOther = buildPage(o, { withHeader: false, pageNo: 99, pageCount: 99 });
    host.appendChild(probeOther.page);
    capOther = probeOther.cols[0].getBoundingClientRect().height;
  }
  const measured = measureBlocks(probeFirst.cols[0], blocks);
  const pages = pack(measured, { capFirst, capOther, columns: o.columns || 1 });
  return { pages, capFirst, capOther, overflowX: measured.overflowX };
}

/**
 * Vysází bloky do stránek v elementu target.
 * o: { orientation, margins, fontFamily, fontSize, columns, header (html), headerEveryPage,
 *      footer (fn(pageNo, pageCount) → html), fit: { enabled, minPt, maxPt, autoColumns } }
 * Vrací { pageCount, fontSize, columns }.
 */
export function layoutDocument(target, blocks, o) {
  const host = getMeasureHost();
  let opts = { ...o };

  if (o.fit && o.fit.enabled) {
    opts = fitToOnePage(host, blocks, o);
  }
  const { pages } = measureAndPack(host, blocks, opts);
  host.innerHTML = '';

  applyDocStyle(target, opts);
  target.innerHTML = '';
  const total = pages.length;
  pages.forEach((cols, pi) => {
    const withHeader = pi === 0 || opts.headerEveryPage;
    const { page, cols: colEls } = buildPage(opts, { withHeader, pageNo: pi + 1, pageCount: total });
    cols.forEach((items, ci) => {
      for (const it of items) {
        const wrap = el('div', `blk ${it.b.blockClass || ''}`.trim());
        if (it.kind === 'html') wrap.innerHTML = it.b.html;
        else wrap.innerHTML = tableHtml(it.b, it.b.rows.slice(it.from, it.to));
        colEls[ci].appendChild(wrap);
      }
    });
    target.appendChild(page);
  });
  return { pageCount: total, fontSize: opts.fontSize, columns: opts.columns };
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

/** CSS pravidlo @page pro tisk dané orientace. */
export function pageRule(orientation) {
  return `@page { size: A4 ${orientation === 'landscape' ? 'landscape' : 'portrait'}; margin: 0; }`;
}

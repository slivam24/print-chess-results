// QR kód s odkazem na turnaj (volitelně v záhlaví: Nastavení → Záhlaví a zápatí).
// Knihovna js/vendor/qrcode.mjs (qrcode-generator, MIT, Kazuhiko Arase) se načítá, až když je
// QR kód zapnutý.

let lib = null;

/** Načte knihovnu (jednou) a vrátí funkci (text, velikost v mm) → SVG. */
export async function loadQr() {
  if (!lib) lib = (await import('./vendor/qrcode.mjs')).default;
  return qrSvg;
}

/** SVG s QR kódem. Funguje až po loadQr(); bez knihovny vrací ''. */
export function qrSvg(text, sizeMm = 18) {
  if (!lib || !text) return '';
  const q = lib(0, 'M');
  q.addData(String(text), 'Byte');
  q.make();
  const n = q.getModuleCount();
  const quiet = 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!q.isDark(r, c)) continue;
      // souvislé tmavé moduly v řádku jako jeden obdélník (menší SVG)
      let w = 1;
      while (c + w < n && q.isDark(r, c + w)) w++;
      d += `M${c + quiet} ${r + quiet}h${w}v1h-${w}z`;
      c += w - 1;
    }
  }
  const s = n + quiet * 2;
  const mm = Math.max(8, Math.min(60, Number(sizeMm) || 18));
  return `<svg class="qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" style="width:${mm}mm;height:${mm}mm" shape-rendering="crispEdges" role="img" aria-label="QR kód"><rect width="${s}" height="${s}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

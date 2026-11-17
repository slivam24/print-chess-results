// Automatická aktualizace appky. GitHub Pages dovoluje prohlížeči držet soubory v mezipaměti
// až 10 minut, takže po nasazení nové verze může prohlížeč ještě chvíli spouštět tu starou.
// Po startu proto porovnáme soubory appky (ETag / Last-Modified) v mezipaměti a na serveru;
// když se liší, mezipaměť se tím rovnou obnoví a stránka se jednou znovu načte.

const GUARD_KEY = 'chessPrint.updateReload';

function stamp(res) {
  return (res && (res.headers.get('etag') || res.headers.get('last-modified'))) || null;
}

/** Soubory appky, které stránka načetla (moduly, styly) – jen ze stejného webu. */
export function appFiles(entries = performance.getEntriesByType('resource'), origin = location.origin) {
  const urls = new Set();
  for (const e of entries) {
    try {
      const u = new URL(e.name);
      if (u.origin === origin && /\.(js|css)$/.test(u.pathname)) urls.add(u.href);
    } catch { /* neplatná adresa */ }
  }
  return [...urls];
}

/**
 * Zkontroluje, zda na serveru není novější verze. Vrací true, pokud stránku znovu načítá.
 * onReload(text) – zobrazí stav (např. „Načítám novou verzi…“).
 */
export async function checkForUpdate({ onReload } = {}) {
  if (!('fetch' in globalThis) || location.protocol === 'file:') return false;
  const files = [location.href.split('#')[0], ...appFiles()];
  let changed = false;
  await Promise.all(files.map(async (url) => {
    try {
      const cached = await fetch(url, { cache: 'force-cache' });
      const before = stamp(cached);
      // „no-cache“ se zeptá serveru a mezipaměť rovnou obnoví
      const fresh = await fetch(url, { cache: 'no-cache' });
      const after = stamp(fresh);
      if (fresh.ok && before && after && before !== after) changed = true;
    } catch { /* offline apod. – nevadí */ }
  }));
  if (!changed) return false;
  // Pojistka proti opakovanému načítání (např. když server ještě nemá všechny soubory)
  try {
    const last = Number(sessionStorage.getItem(GUARD_KEY)) || 0;
    if (Date.now() - last < 5 * 60 * 1000) return false;
    sessionStorage.setItem(GUARD_KEY, String(Date.now()));
  } catch { /* bez sessionStorage načteme jen jednou za běh */ }
  if (onReload) onReload('Načítám novou verzi appky…');
  location.reload();
  return true;
}

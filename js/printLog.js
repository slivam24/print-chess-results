// Záznam o tisku: appka si pamatuje, které výstupy (turnaj, skupina, výstup, kolo) už vytiskla
// a z jakých dat. Když se data na chess-results potom změní (opravený výsledek, nový hráč),
// u výstupu se ukáže „změnilo se od tisku“. Ukládá se v prohlížeči (localStorage) zvlášť
// od nastavení – nejde do zálohy ani do profilů.
// Obsahuje i název PDF při „Uložit jako PDF“ (prohlížeč ho bere z titulku stránky).

const KEY = 'chessPrint.printed.v1';
const MAX = 300;

/** Krátký otisk textu (FNV-1a, 32 bitů) – stačí k poznání změny dat. */
export function hashString(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Otisk dat výstupu (jen data z chess-results, ne vzhled). */
export function dataHash(data) {
  return hashString(JSON.stringify(data ?? null));
}

/** Klíč výstupu: turnaj | skupina | výstup | kolo. */
export function printKey({ tnr, group, templateId, round }) {
  return [tnr ?? '', group ?? '', templateId ?? '', round ?? ''].join('|');
}

export class PrintLog {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.items = {};
    try {
      const raw = storage && storage.getItem(KEY);
      const v = raw ? JSON.parse(raw) : null;
      if (v && typeof v === 'object' && !Array.isArray(v)) this.items = v;
    } catch { /* poškozený záznam – začneme znovu */ }
  }

  save() {
    try { this.storage && this.storage.setItem(KEY, JSON.stringify(this.items)); } catch { /* plné úložiště – nevadí */ }
  }

  get(key) {
    return this.items[key] || null;
  }

  /**
   * Stav výstupu: null (netištěno), { state: 'printed', at } nebo { state: 'changed', at }
   * (data se od tisku změnila). hash = null → jen zda byl tištěn.
   */
  status(key, hash = null) {
    const it = this.get(key);
    if (!it) return null;
    return { state: hash && it.hash && it.hash !== hash ? 'changed' : 'printed', at: it.at };
  }

  mark(key, hash, at = new Date().toISOString()) {
    delete this.items[key]; // nejnovější na konec (kvůli mazání nejstarších)
    this.items[key] = { at, hash: hash || null };
    const keys = Object.keys(this.items);
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX))) delete this.items[k];
    this.save();
  }

  unmark(key) {
    delete this.items[key];
    this.save();
  }
}

/** Název souboru PDF: „Turnaj – Pořadí po 5. kole“ bez znaků, které nesmí být v názvu souboru. */
export function pdfTitle({ tournament, output, group } = {}) {
  const clean = (s) => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
  const t = clean(tournament);
  const parts = [t.length > 70 ? `${t.slice(0, 69).trim()}…` : t, clean(group), clean(output)].filter(Boolean);
  // Bez opakování: když výstup už obsahuje název skupiny apod.
  const uniq = parts.filter((p, i) => parts.findIndex((q) => q.toLocaleLowerCase('cs') === p.toLocaleLowerCase('cs')) === i);
  return uniq.join(' – ').slice(0, 150) || 'Šachový tisk';
}

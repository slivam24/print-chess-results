// Nastavení appky: profily, šablony, proxy, poslední turnaje.
// Ukládá se do localStorage, export/import do JSON jako záloha.

const KEY = 'chessPrint.v1';
const SNAP_KEY = 'chessPrint.lastData.v1';
export const STATE_VERSION = 6;

/**
 * Vestavěná proxy (Cloudflare Worker z worker/worker.js nasazený pro tuto appku).
 * Používá se, když uživatel v Nastavení → Připojení nezadá vlastní adresu.
 * Při nasazení vlastní kopie appky zde změňte adresu na svůj Worker.
 */
export const DEFAULT_PROXY_URL = 'https://chess-print-proxy.slivam24.workers.dev';
const MAX_RECENT = 12;

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function defaultProfile(name = 'Výchozí') {
  return {
    id: uid(),
    name,
    page: {
      orientation: 'portrait',
      margins: { top: 5, right: 5, bottom: 5, left: 5 },
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontSize: 10,
      tableStyle: 'grid',
    },
    nameFormat: 'last-first',
    // Výstupy schované z nabídky (zapínají se v Nastavení → Výstupy)
    hiddenTemplates: ['pairings-board', 'pairings-alpha', 'arbiter-sheet', 'scoresheets'],
    header: {
      enabled: true,
      align: 'center',
      title: '{turnaj}',
      subtitle: '{misto}, {datum}',
      organizer: '',
      arbiter: '{rozhodci}',
      text: '',
      logo: null,
      logoHeight: 16,
      logoPosition: 'left',
      everyPage: false,
    },
    footer: {
      enabled: true,
      text: '',
      showPageNumbers: true,
      showPrinted: true,
      showSource: true,
    },
    templates: {},
  };
}

export function defaultState() {
  const open = defaultProfile('Otevřený turnaj');
  const league = defaultProfile('Liga družstev');
  league.header.subtitle = '{datum}';
  return {
    version: STATE_VERSION,
    proxyUrl: '',
    activeProfileId: open.id,
    profiles: [open, league],
    recent: [],
    ui: { previewZoom: 'page', sideWidth: null, lastTemplate: 'pairings' },
  };
}

function isObj(x) {
  return x && typeof x === 'object' && !Array.isArray(x);
}

/** Doplní chybějící klíče z výchozí hodnoty (pro starší zálohy a nové verze). */
function deepFill(target, defaults) {
  const out = isObj(target) ? { ...target } : {};
  for (const [k, v] of Object.entries(defaults)) {
    if (isObj(v)) out[k] = deepFill(out[k], v);
    else if (out[k] === undefined) out[k] = v;
  }
  return out;
}

export function normalizeProfile(p) {
  const d = defaultProfile(p && p.name ? p.name : 'Profil');
  const out = deepFill(p, d);
  if (!out.id) out.id = uid();
  if (!isObj(out.templates)) out.templates = {};
  return out;
}

/** Ověří a doplní stav (z localStorage nebo importu). */
export function normalizeState(raw) {
  if (!isObj(raw)) throw new Error('Soubor neobsahuje nastavení appky.');
  const d = defaultState();
  // Verze < 6: startovní listina nově ukazuje Typ a Skupinu – sloupec „Kat.“, který
  // dřív býval ve výchozím stavu vypnutý, zapneme (prázdný se stejně skryje)
  if (raw.version && raw.version < 6) {
    for (const p of Array.isArray(raw.profiles) ? raw.profiles : []) {
      const cols = p && p.templates && p.templates.startlist && p.templates.startlist.columns;
      if (Array.isArray(cols)) for (const c of cols) if (c && c.key === 'group' && c.on === false) c.on = true;
    }
  }
  // Verze < 5: schovat i „Los kola – nástěnka“ (jen když profil už měl seznam schovaných výstupů;
  // starší profily bez něj dostanou celý výchozí seznam)
  if (raw.version && raw.version < 5) {
    for (const p of Array.isArray(raw.profiles) ? raw.profiles : []) {
      if (p && Array.isArray(p.hiddenTemplates) && !p.hiddenTemplates.includes('pairings-board')) {
        p.hiddenTemplates.push('pairings-board');
      }
    }
  }
  // Verze < 3: výchozí okraje 12 mm → 5 mm (jen u profilů, které měly pořád původní výchozí hodnotu)
  if (!raw.version || raw.version < 3) {
    for (const p of Array.isArray(raw.profiles) ? raw.profiles : []) {
      const m = p && p.page && p.page.margins;
      if (m && ['top', 'right', 'bottom', 'left'].every((k) => Number(m[k]) === 12)) {
        p.page.margins = { top: 5, right: 5, bottom: 5, left: 5 };
      }
    }
  }
  // Verze 1 → 2: výchozí vzhled podle Swiss-Manageru (jména „Příjmení Jméno“)
  if (!raw.version || raw.version < 2) {
    for (const p of Array.isArray(raw.profiles) ? raw.profiles : []) {
      if (p && (!p.nameFormat || p.nameFormat === 'original')) p.nameFormat = 'last-first';
    }
  }
  const s = {
    version: STATE_VERSION,
    proxyUrl: typeof raw.proxyUrl === 'string' ? raw.proxyUrl : '',
    profiles: Array.isArray(raw.profiles) && raw.profiles.length ? raw.profiles.map(normalizeProfile) : d.profiles,
    recent: Array.isArray(raw.recent)
      ? raw.recent.filter((r) => r && Number.isFinite(Number(r.tnr))).map((r) => ({ tnr: Number(r.tnr), title: String(r.title || ''), at: r.at || null })).slice(0, MAX_RECENT)
      : [],
    ui: deepFill(raw.ui, d.ui),
  };
  const ids = new Set();
  for (const p of s.profiles) {
    if (ids.has(p.id)) p.id = uid();
    ids.add(p.id);
  }
  s.activeProfileId = s.profiles.some((p) => p.id === raw.activeProfileId) ? raw.activeProfileId : s.profiles[0].id;
  return s;
}

export class Store {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.listeners = new Set();
    this.state = this.load();
    this.saveTimer = null;
    this.lastSaveError = null;
  }

  load() {
    try {
      const raw = this.storage && this.storage.getItem(KEY);
      if (raw) return normalizeState(JSON.parse(raw));
    } catch (e) {
      console.warn('Nastavení se nepodařilo načíst, použijí se výchozí.', e);
    }
    return defaultState();
  }

  save() {
    try {
      this.storage && this.storage.setItem(KEY, JSON.stringify(this.state));
      this.lastSaveError = null;
    } catch (e) {
      this.lastSaveError = e;
      console.warn('Nastavení se nepodařilo uložit', e);
    }
  }

  /** Změna stavu: fn dostane stav a upraví ho. Uloží s malým zpožděním. */
  update(fn, { silent = false } = {}) {
    fn(this.state);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), 250);
    if (!silent) for (const l of this.listeners) l(this.state);
  }

  flush() {
    clearTimeout(this.saveTimer);
    this.save();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Adresa proxy, která se skutečně použije (vlastní, jinak vestavěná). */
  get proxyUrl() {
    return String(this.state.proxyUrl || '').trim() || DEFAULT_PROXY_URL;
  }

  get profile() {
    return this.state.profiles.find((p) => p.id === this.state.activeProfileId) || this.state.profiles[0];
  }

  // --- Profily ---------------------------------------------------------

  setActiveProfile(id) {
    this.update((s) => { if (s.profiles.some((p) => p.id === id)) s.activeProfileId = id; });
  }

  addProfile(name) {
    const p = defaultProfile(name || 'Nový profil');
    this.update((s) => { s.profiles.push(p); s.activeProfileId = p.id; });
    return p;
  }

  duplicateProfile(id) {
    const src = this.state.profiles.find((p) => p.id === id);
    if (!src) return null;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = uid();
    copy.name = `${src.name} (kopie)`;
    this.update((s) => {
      const i = s.profiles.findIndex((p) => p.id === id);
      s.profiles.splice(i + 1, 0, copy);
      s.activeProfileId = copy.id;
    });
    return copy;
  }

  renameProfile(id, name) {
    const n = String(name || '').trim();
    if (!n) return;
    this.update((s) => { const p = s.profiles.find((x) => x.id === id); if (p) p.name = n; });
  }

  deleteProfile(id) {
    if (this.state.profiles.length <= 1) return false;
    this.update((s) => {
      s.profiles = s.profiles.filter((p) => p.id !== id);
      if (s.activeProfileId === id) s.activeProfileId = s.profiles[0].id;
    });
    return true;
  }

  moveProfile(id, dir) {
    this.update((s) => {
      const i = s.profiles.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.profiles.length) return;
      [s.profiles[i], s.profiles[j]] = [s.profiles[j], s.profiles[i]];
    });
  }

  // --- Poslední turnaje -------------------------------------------------

  addRecent(tnr, title) {
    this.update((s) => {
      s.recent = [{ tnr, title: title || '', at: new Date().toISOString() }, ...s.recent.filter((r) => r.tnr !== tnr)].slice(0, MAX_RECENT);
    });
  }

  removeRecent(tnr) {
    this.update((s) => { s.recent = s.recent.filter((r) => r.tnr !== tnr); });
  }

  // --- Záloha -------------------------------------------------------------

  exportJson() {
    return JSON.stringify({ app: 'chess-print', exportedAt: new Date().toISOString(), ...this.state }, null, 2);
  }

  importJson(text) {
    let raw;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error('Soubor není platný JSON.');
    }
    if (raw && raw.app && raw.app !== 'chess-print') throw new Error('Soubor nepochází z této appky.');
    if (raw && raw.kind === 'profiles') {
      throw new Error('Toto je soubor s profily – importujte ho v Nastavení → Profily (přidá je ke stávajícím).');
    }
    const s = normalizeState(raw);
    this.state = s;
    this.flush();
    for (const l of this.listeners) l(this.state);
    return s;
  }

  // --- Přenos profilů mezi počítači ----------------------------------------

  /** JSON s vybranými profily (bez adresy proxy a posledních turnajů). ids = null → všechny. */
  exportProfiles(ids = null) {
    const profiles = this.state.profiles.filter((p) => !ids || ids.includes(p.id));
    return JSON.stringify({
      app: 'chess-print', kind: 'profiles', stateVersion: STATE_VERSION, exportedAt: new Date().toISOString(), profiles,
    }, null, 2);
  }

  /**
   * Co by import udělal: u každého profilu ze souboru „replace“ (stejný profil už tu je –
   * podle id, jinak podle názvu) nebo „add“. Přijme soubor s profily i celou zálohu.
   */
  previewProfileImport(text) {
    let raw;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error('Soubor není platný JSON.');
    }
    if (!raw || (raw.app && raw.app !== 'chess-print')) throw new Error('Soubor nepochází z této appky.');
    if (!Array.isArray(raw.profiles) || !raw.profiles.length) throw new Error('Soubor neobsahuje žádné profily.');
    // Projdou stejnými převody jako nastavení (starší verze souboru → aktuální)
    const version = raw.kind === 'profiles' ? raw.stateVersion : raw.version;
    const { profiles } = normalizeState({ version: version || 1, profiles: JSON.parse(JSON.stringify(raw.profiles)) });
    const norm = (s) => String(s || '').trim().toLocaleLowerCase('cs');
    return profiles.map((p) => {
      const byId = this.state.profiles.find((x) => x.id === p.id);
      const byName = byId ? null : this.state.profiles.find((x) => norm(x.name) === norm(p.name));
      const target = byId || byName;
      return { profile: p, action: target ? 'replace' : 'add', targetId: target ? target.id : null };
    });
  }

  /** Přidá / aktualizuje profily ze souboru. Ostatní profily a nastavení zůstanou. */
  importProfiles(text) {
    const plan = this.previewProfileImport(text);
    const result = { added: [], replaced: [] };
    this.update((s) => {
      for (const { profile, action, targetId } of plan) {
        const p = JSON.parse(JSON.stringify(profile));
        if (action === 'replace') {
          const i = s.profiles.findIndex((x) => x.id === targetId);
          // Převezme id ze souboru, aby se příští přenos spároval přímo podle id
          if (s.profiles.some((x, j) => j !== i && x.id === p.id)) p.id = uid();
          if (s.activeProfileId === targetId) s.activeProfileId = p.id;
          s.profiles[i] = p;
          result.replaced.push(p.name);
        } else {
          if (s.profiles.some((x) => x.id === p.id)) p.id = uid();
          s.profiles.push(p);
          result.added.push(p.name);
        }
      }
    });
    this.flush();
    return result;
  }

  reset() {
    this.state = defaultState();
    this.flush();
    for (const l of this.listeners) l(this.state);
  }

  // --- Poslední stažená data (rychlé obnovení po načtení stránky) ---------

  saveSnapshot(tnr, snapshot) {
    try {
      this.storage && this.storage.setItem(SNAP_KEY, JSON.stringify({ tnr, savedAt: new Date().toISOString(), data: snapshot }));
    } catch {
      // Plná kvóta – data se jen nebudou pamatovat, nevadí.
    }
  }

  loadSnapshot() {
    try {
      const raw = this.storage && this.storage.getItem(SNAP_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}

/** Nastavení konkrétní šablony v profilu (sloučené s výchozími hodnotami šablony). */
export function templateSettings(profile, tpl) {
  const saved = (profile.templates && profile.templates[tpl.id]) || {};
  const opts = {};
  for (const o of tpl.options || []) opts[o.key] = saved.options && saved.options[o.key] !== undefined ? saved.options[o.key] : o.def;
  return {
    // Když šablona změní výchozí sadu sloupců (columnsVersion), staré uložené pořadí se nepoužije
    columns: Array.isArray(saved.columns) && (saved.columnsVersion || 1) === (tpl.columnsVersion || 1) ? saved.columns : null,
    orientation: saved.orientation || 'inherit',
    fontSize: saved.fontSize ?? null,
    rowHeight: Number(saved.rowHeight) > 0 ? Number(saved.rowHeight) : null,
    // 'fixed' = pevná velikost; 'max' = co největší písmo, při kterém se všechny sloupce vejdou na šířku;
    // 'page' = navíc vše na jednu stránku (písmo i výška řádků co největší)
    fontMode: ['max', 'page'].includes(saved.fontMode) ? saved.fontMode : 'fixed',
    fontMax: Number(saved.fontMax) > 0 ? Number(saved.fontMax) : 20,
    pageColumns: saved.pageColumns ?? (tpl.defaults && tpl.defaults.columns) ?? 1,
    // Záhlaví / zápatí výstupu: 'inherit' = podle profilu (Nastavení → Záhlaví a zápatí)
    header: ['first', 'every', 'title', 'off'].includes(saved.header) ? saved.header : 'inherit',
    footer: ['on', 'off'].includes(saved.footer) ? saved.footer : 'inherit',
    options: opts,
  };
}

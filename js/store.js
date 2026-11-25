// Nastavení appky: profily, šablony, proxy, poslední turnaje.
// Ukládá se do localStorage, export/import do JSON jako záloha.

import { hashString } from './printLog.js';

const KEY = 'chessPrint.v1';
const SNAP_KEY = 'chessPrint.lastData.v1';
export const STATE_VERSION = 7;

/**
 * Vestavěná proxy (Cloudflare Worker z worker/worker.js nasazený pro tuto appku).
 * Používá se, když uživatel v Nastavení → Připojení nezadá vlastní adresu.
 * Při nasazení vlastní kopie appky zde změňte adresu na svůj Worker.
 */
export const DEFAULT_PROXY_URL = 'https://chess-print-proxy.slivam24.workers.dev';
const MAX_RECENT = 20;

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
      // Vodoznak přes celou stránku (logo turnaje / pořadatele): obrázek z knihovny, viditelnost v %,
      // černobíle / barevně, velikost v % šířky stránky
      watermark: { img: null, opacity: 10, color: 'gray', size: 70 },
    },
    nameFormat: 'last-first',
    // Výstupy schované z nabídky (zapínají se v Nastavení → Výstupy)
    hiddenTemplates: ['pairings-board', 'pairings-alpha', 'arbiter-sheet', 'scoresheets'],
    header: {
      enabled: true,
      align: 'left',
      title: '{turnaj}',
      subtitle: '{misto}, {datum}',
      organizer: '',
      arbiter: '{rozhodci}',
      text: '',
      // Velikost řádků víceřádkového nadpisu: 'same' | 'second-smaller' | 'first-smaller'
      titleLines: 'same',
      // Loga v záhlaví (turnaj, pořadatel, svaz): [{ img (id obrázku z knihovny), position: 'left' | 'right', height (mm), gray (černobíle) }]
      logos: [],
      everyPage: false,
      // QR kód s odkazem na turnaj (vpravo v záhlaví): 'off' | 'on'; odkaz na hlavní stránku
      // turnaje ('main') nebo na stránku výstupu na chess-results ('output')
      qr: 'off',
      qrTarget: 'main',
      qrSize: 18,
    },
    // Zápatí ve výchozím stavu vypnuté (tak ho pořadatelé používají); zapíná se v Nastavení
    footer: {
      enabled: false,
      text: '',
      showPageNumbers: true,
      showPrinted: true,
      showSource: true,
      // Poděkování sponzorům: text a loga v řádku nad patičkou
      sponsorsText: '',
      sponsors: [], // [{ img (id obrázku z knihovny), height (mm), gray (černobíle) }]
    },
    templates: {},
  };
}

// Přednastavené profily (js/presets.js, ~25 kB) se načítají až když jsou potřeba:
// při prvním spuštění (bez uloženého nastavení) a tlačítkem „+ Přednastavené profily“.
let presetSource = null;

/** Načte přednastavené profily (jednou). */
export async function loadPresets() {
  if (!presetSource) presetSource = (await import('./presets.js')).PRESET_PROFILES;
  return presetSource;
}

/** Přednastavené profily jako nové profily (s vlastním id); před loadPresets() prázdné. */
export function presetProfiles() {
  return (presetSource || []).map((p) => normalizeProfile({ ...JSON.parse(JSON.stringify(p)), id: uid() }));
}

/** Je v úložišti uložené nastavení? (jinak se při startu načtou přednastavené profily) */
export function hasSavedState(storage = globalThis.localStorage) {
  try {
    return !!(storage && storage.getItem(KEY));
  } catch {
    return false;
  }
}

const DEFAULT_UI = () => ({ previewZoom: 'page', sideWidth: null, lastTemplate: 'pairings', tabs: [], activeTab: null });

export function defaultState() {
  const presets = presetProfiles();
  const profiles = presets.length ? presets : [defaultProfile()];
  return {
    version: STATE_VERSION,
    proxyUrl: '',
    activeProfileId: profiles[0].id,
    profiles,
    recent: [],
    // Knihovna obrázků (loga, sponzoři, vodoznak) – společná pro všechny profily:
    // [{ id, name, src (data URL) }]; profily na obrázky odkazují přes id
    images: [],
    // Nastavení jednotlivých turnajů (podle čísla turnaje), přepíše profil jen pro ten turnaj:
    // { [tnr]: { title, subtitle } } – např. dvouřádkový nadpis jednoho turnaje
    tournaments: {},
    // tabs: otevřené turnaje v horní liště – [{ tnr, title, profileId, templateId, round, group }]
    ui: DEFAULT_UI(),
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

const isDataImage = (src) => typeof src === 'string' && src.startsWith('data:image/');
// Odkaz na obrázek: id z knihovny (img), nebo obrázek přímo (src – starší verze, převede se do knihovny)
const validRef = (x) => x && ((typeof x.img === 'string' && x.img) || isDataImage(x.src));
const refOf = (x) => (isDataImage(x.src) ? { src: x.src } : { img: x.img });
const mm = (v, min, max, def) => (Number(v) >= min && Number(v) <= max ? Number(v) : def);

/** Id obrázku podle obsahu – stejný obrázek má na každém počítači stejné id (import ho nezdvojí). */
export function imageId(src) {
  return `img-${hashString(src)}-${String(src).length.toString(36)}`;
}

export function normalizeProfile(p) {
  const d = defaultProfile(p && p.name ? p.name : 'Profil');
  const out = deepFill(p, d);
  if (!out.id) out.id = uid();
  if (!isObj(out.templates)) out.templates = {};
  // Dřívější jediné logo (header.logo) → seznam log
  const hd = out.header;
  const logos = Array.isArray(hd.logos) ? hd.logos : [];
  if (hd.logo) logos.unshift({ src: hd.logo, height: hd.logoHeight, position: hd.logoPosition });
  delete hd.logo;
  delete hd.logoHeight;
  delete hd.logoPosition;
  // gray: tisknout černobíle (výchozí – většina turnajů se tiskne na černobílé tiskárně)
  hd.logos = logos.filter(validRef).map((l) => ({ ...refOf(l), height: mm(l.height, 5, 60, 16), position: l.position === 'right' ? 'right' : 'left', gray: l.gray !== false }));
  const ft = out.footer;
  ft.sponsors = (Array.isArray(ft.sponsors) ? ft.sponsors : []).filter(validRef).map((l) => ({ ...refOf(l), height: mm(l.height, 4, 40, 10), gray: l.gray !== false }));
  const wm = isObj(out.page.watermark) ? out.page.watermark : {};
  out.page.watermark = {
    ...(validRef(wm) ? refOf(wm) : { img: null }),
    opacity: mm(wm.opacity, 1, 100, 10),
    color: wm.color === 'color' ? 'color' : 'gray',
    size: mm(wm.size, 10, 100, 70),
  };
  return out;
}

/** Všechny odkazy na obrázky v profilu: [{ ref, kind, label }]. */
function imageRefs(p) {
  const out = [];
  (p.header.logos || []).forEach((l, i) => out.push({ ref: l, kind: 'logo', label: `logo ${i + 1} v záhlaví` }));
  (p.footer.sponsors || []).forEach((l, i) => out.push({ ref: l, kind: 'sponsor', label: `sponzor ${i + 1}` }));
  if (p.page.watermark) out.push({ ref: p.page.watermark, kind: 'watermark', label: 'vodoznak' });
  return out;
}

/**
 * Knihovna obrázků: obrázky vložené přímo do profilů (starší verze appky, starší export) přesune
 * do knihovny a nahradí odkazem; odkazy na neexistující obrázky odstraní.
 */
function libraryFor(profiles, images) {
  const lib = new Map();
  for (const im of Array.isArray(images) ? images : []) {
    if (im && isDataImage(im.src)) {
      const id = typeof im.id === 'string' && im.id ? im.id : imageId(im.src);
      if (!lib.has(id)) lib.set(id, { id, name: String(im.name || '').slice(0, 80) || 'Obrázek', src: im.src });
    }
  }
  const NAMES = { logo: 'Logo', sponsor: 'Sponzor', watermark: 'Vodoznak' };
  for (const p of profiles) {
    for (const { ref, kind } of imageRefs(p)) {
      if (!isDataImage(ref.src)) continue;
      const id = imageId(ref.src);
      if (!lib.has(id)) lib.set(id, { id, name: `${NAMES[kind]} (${p.name})`, src: ref.src });
      ref.img = id;
      delete ref.src;
    }
    p.header.logos = p.header.logos.filter((l) => lib.has(l.img));
    p.footer.sponsors = p.footer.sponsors.filter((l) => lib.has(l.img));
    if (!lib.has(p.page.watermark.img)) p.page.watermark.img = null;
  }
  return [...lib.values()];
}

/**
 * Profil s doplněnými obrázky (src) z knihovny – pro sazbu. Obrázek uvedený přímo (src) zůstane.
 */
export function resolveImages(profile, images) {
  const lib = new Map((images || []).map((i) => [i.id, i.src]));
  const src = (x) => (x && (x.src || lib.get(x.img))) || null;
  const list = (arr) => (arr || []).map((l) => ({ ...l, src: src(l) })).filter((l) => l.src);
  return {
    ...profile,
    header: { ...profile.header, logos: list(profile.header.logos) },
    footer: { ...profile.footer, sponsors: list(profile.footer.sponsors) },
    page: { ...profile.page, watermark: profile.page.watermark ? { ...profile.page.watermark, src: src(profile.page.watermark) } : null },
  };
}

/** Nastavení turnajů: jen čísla turnajů a textové hodnoty (nadpis, podnadpis). */
function normalizeTournaments(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (!/^\d+$/.test(k) || !isObj(v)) continue;
    const t = {};
    for (const f of ['title', 'subtitle']) if (typeof v[f] === 'string' && v[f].trim()) t[f] = v[f].slice(0, 500);
    if (Object.keys(t).length) out[k] = t;
  }
  return out;
}

/**
 * Profil s nadpisem / podnadpisem konkrétního turnaje (když je u turnaje vyplněný),
 * jinak profil beze změny.
 */
export function withTournamentHeader(profile, t) {
  if (!t || (!t.title && !t.subtitle)) return profile;
  return {
    ...profile,
    header: { ...profile.header, ...(t.title ? { title: t.title } : {}), ...(t.subtitle ? { subtitle: t.subtitle } : {}) },
  };
}

/** Ověří a doplní stav (z localStorage nebo importu). */
export function normalizeState(raw) {
  if (!isObj(raw)) throw new Error('Soubor neobsahuje nastavení appky.');
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
    profiles: Array.isArray(raw.profiles) && raw.profiles.length ? raw.profiles.map(normalizeProfile) : defaultState().profiles,
    recent: Array.isArray(raw.recent)
      ? raw.recent.filter((r) => r && Number.isFinite(Number(r.tnr))).map((r) => ({ tnr: Number(r.tnr), title: String(r.title || ''), at: r.at || null })).slice(0, MAX_RECENT)
      : [],
    ui: deepFill(raw.ui, DEFAULT_UI()),
    tournaments: normalizeTournaments(raw.tournaments),
  };
  s.images = libraryFor(s.profiles, raw.images);
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
    const value = JSON.stringify(this.state);
    try {
      this.storage && this.storage.setItem(KEY, value);
      this.lastSaveError = null;
    } catch (e) {
      // Plné úložiště: nastavení (profily, loga) má přednost před uloženými daty turnajů,
      // ta se dají kdykoli znovu stáhnout
      for (const k of snapshotKeys(this.storage)) safeRemove(this.storage, k);
      safeRemove(this.storage, SNAP_KEY);
      try {
        this.storage.setItem(KEY, value);
        this.lastSaveError = null;
      } catch (e2) {
        this.lastSaveError = e2;
        console.warn('Nastavení se nepodařilo uložit', e2);
      }
    }
  }

  // --- Nastavení jednotlivých turnajů --------------------------------------

  /** Nadpis a podnadpis jen pro daný turnaj ({ title?, subtitle? }), nebo null. */
  tournamentHeader(tnr) {
    return (tnr != null && this.state.tournaments && this.state.tournaments[String(tnr)]) || null;
  }

  /** Uloží nadpis / podnadpis turnaje; prázdná hodnota = podle profilu. */
  setTournamentHeader(tnr, patch) {
    if (tnr == null) return;
    this.update((s) => {
      s.tournaments = s.tournaments || {};
      const cur = { ...(s.tournaments[String(tnr)] || {}), ...patch };
      for (const k of Object.keys(cur)) if (typeof cur[k] !== 'string' || !cur[k].trim()) delete cur[k];
      if (Object.keys(cur).length) s.tournaments[String(tnr)] = cur;
      else delete s.tournaments[String(tnr)];
    }, { silent: true });
  }

  // --- Knihovna obrázků --------------------------------------------------

  /** Kolik znaků zabírají obrázky v knihovně. */
  imageBytes() {
    return this.state.images.reduce((n, x) => n + x.src.length, 0);
  }

  /** Přidá obrázky do knihovny ([{ name, src }]); stejný obrázek se nezdvojí. Vrací jejich id. */
  addImages(list) {
    const ids = [];
    this.update((s) => {
      for (const { name, src } of list) {
        if (!isDataImage(src)) continue;
        const id = imageId(src);
        if (!s.images.some((x) => x.id === id)) s.images.push({ id, name: String(name || 'Obrázek').slice(0, 80), src });
        ids.push(id);
      }
    }, { silent: true });
    return ids;
  }

  renameImage(id, name) {
    this.update((s) => { const im = s.images.find((x) => x.id === id); if (im) im.name = String(name || '').slice(0, 80); }, { silent: true });
  }

  /** Kde se obrázek používá: [„profil: logo 1 v záhlaví“, …]. */
  imageUsage(id) {
    const out = [];
    for (const p of this.state.profiles) for (const { ref, label } of imageRefs(p)) if (ref.img === id) out.push(`${p.name}: ${label}`);
    return out;
  }

  /** Smaže obrázek z knihovny i ze všech profilů, které ho používají. */
  deleteImage(id) {
    this.update((s) => {
      s.images = s.images.filter((x) => x.id !== id);
      for (const p of s.profiles) {
        p.header.logos = p.header.logos.filter((l) => l.img !== id);
        p.footer.sponsors = p.footer.sponsors.filter((l) => l.img !== id);
        if (p.page.watermark.img === id) p.page.watermark.img = null;
      }
    }, { silent: true });
  }

  /** Nahradí obsah obrázku (např. zmenšený) – odkazy v profilech zůstanou. */
  replaceImageSrc(id, src) {
    this.update((s) => { const im = s.images.find((x) => x.id === id); if (im) im.src = src; }, { silent: true });
  }

  /** Aktivní profil s doplněnými obrázky z knihovny (pro sazbu). */
  get resolvedProfile() {
    return resolveImages(this.profile, this.state.images);
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

  /** Přidá přednastavené profily, které ještě nemáte (podle názvu). Vrací názvy přidaných. Předtím loadPresets(). */
  addPresetProfiles() {
    const norm = (x) => String(x || '').trim().toLocaleLowerCase('cs');
    const have = new Set(this.state.profiles.map((p) => norm(p.name)));
    const add = presetProfiles().filter((p) => !have.has(norm(p.name)));
    if (add.length) this.update((s) => { s.profiles.push(...add); });
    return add.map((p) => p.name);
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
    // Obrázky, které profily používají, jdou do souboru s nimi
    const used = new Set(profiles.flatMap((p) => imageRefs(p).map((r) => r.ref.img)).filter(Boolean));
    const images = this.state.images.filter((im) => used.has(im.id));
    return JSON.stringify({
      app: 'chess-print', kind: 'profiles', stateVersion: STATE_VERSION, exportedAt: new Date().toISOString(), profiles, images,
    }, null, 2);
  }

  /**
   * Co by import udělal: u každého profilu ze souboru „replace“ (stejný profil už tu je –
   * podle id, jinak podle názvu) nebo „add“. Přijme soubor s profily i celou zálohu.
   */
  previewProfileImport(text) {
    return this.parseProfileFile(text).plan;
  }

  /** Načte soubor s profily: plán importu a obrázky, které profily používají. */
  parseProfileFile(text) {
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
    const { profiles, images } = normalizeState({ version: version || 1, profiles: JSON.parse(JSON.stringify(raw.profiles)), images: raw.images });
    const norm = (s) => String(s || '').trim().toLocaleLowerCase('cs');
    const plan = profiles.map((p) => {
      const byId = this.state.profiles.find((x) => x.id === p.id);
      const byName = byId ? null : this.state.profiles.find((x) => norm(x.name) === norm(p.name));
      const target = byId || byName;
      return { profile: p, action: target ? 'replace' : 'add', targetId: target ? target.id : null };
    });
    return { plan, images };
  }

  /** Přidá / aktualizuje profily ze souboru (i s jejich obrázky). Ostatní profily a nastavení zůstanou. */
  importProfiles(text) {
    const { plan, images } = this.parseProfileFile(text);
    const result = { added: [], replaced: [] };
    this.update((s) => {
      for (const im of images) if (!s.images.some((x) => x.id === im.id)) s.images.push(im);
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

  /**
   * Uloží stažená data turnaje (každý turnaj zvlášť). keep = turnaje, jejichž data se mají
   * ponechat (otevřené záložky) – data ostatních se smažou, aby nedošlo místo.
   */
  saveSnapshot(tnr, snapshot, keep = null) {
    const st = this.storage;
    if (!st) return;
    const value = JSON.stringify({ tnr, savedAt: new Date().toISOString(), data: snapshot });
    const prune = (all) => {
      for (const k of snapshotKeys(st)) {
        const t = Number(k.slice(SNAP_KEY.length + 1));
        if (t !== tnr && (all || (keep && !keep.includes(t)))) safeRemove(st, k);
      }
      if (all || keep) safeRemove(st, SNAP_KEY); // starý formát (jeden turnaj)
    };
    prune(false);
    try {
      st.setItem(`${SNAP_KEY}:${tnr}`, value);
    } catch {
      // Plná kvóta – uvolníme data ostatních turnajů a zkusíme znovu; jinak se data jen nebudou pamatovat
      prune(true);
      try { st.setItem(`${SNAP_KEY}:${tnr}`, value); } catch { /* nevadí */ }
    }
  }

  /** Uložená data turnaje (bez tnr: starý formát s jedním turnajem). */
  loadSnapshot(tnr = null) {
    try {
      const raw = this.storage && this.storage.getItem(tnr != null ? `${SNAP_KEY}:${tnr}` : SNAP_KEY);
      if (raw) return JSON.parse(raw);
      if (tnr != null) {
        const old = this.loadSnapshot(null);
        return old && old.tnr === tnr ? old : null;
      }
      return null;
    } catch {
      return null;
    }
  }
}

function snapshotKeys(st) {
  const out = [];
  try {
    for (let i = 0; i < (st.length || 0); i++) {
      const k = st.key(i);
      if (k && k.startsWith(`${SNAP_KEY}:`)) out.push(k);
    }
  } catch { /* úložiště bez výčtu klíčů */ }
  return out;
}

function safeRemove(st, k) {
  try { st.removeItem && st.removeItem(k); } catch { /* nevadí */ }
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
    // Výchozí je „co největší“ písmo (tak ho pořadatelé používají); šablona může mít vlastní výchozí
    fontMode: ['fixed', 'max', 'page'].includes(saved.fontMode) ? saved.fontMode : (tpl.defaults && tpl.defaults.fontMode) || 'max',
    fontMax: Number(saved.fontMax) > 0 ? Number(saved.fontMax) : 20,
    pageColumns: saved.pageColumns ?? (tpl.defaults && tpl.defaults.columns) ?? 1,
    // Záhlaví / zápatí výstupu: 'inherit' = podle profilu (Nastavení → Záhlaví a zápatí)
    // (šablona může mít vlastní výchozí hodnotu, např. rozpis šachovnic k rozstříhání bez záhlaví)
    header: ['first', 'every', 'title', 'off', 'inherit'].includes(saved.header) ? saved.header : (tpl.defaults && tpl.defaults.header) || 'inherit',
    // Vodoznak výstupu: 'inherit' = podle profilu (Nastavení → Stránka), 'off' = bez vodoznaku
    watermark: ['inherit', 'off'].includes(saved.watermark) ? saved.watermark : 'inherit',
    footer: ['on', 'off', 'inherit'].includes(saved.footer) ? saved.footer : (tpl.defaults && tpl.defaults.footer) || 'inherit',
    options: opts,
  };
}

// Hlavní ovladač aplikace: načtení turnaje, výběr výstupu, náhled a tisk.

import { Store, templateSettings } from './store.js';
import { Source, parseTournamentInput, buildUrl, DATASETS, FetchError } from './source.js';
import { TEMPLATES, getTemplate, templatesFor } from './templates/index.js';
import { buildDocument, autoRound, datasetsFor } from './render.js';
import { layoutDocument, pageRule } from './layout.js';
import { categoriesOf } from './templates/lists.js';
import { fmtDateTime } from './templates/common.js';
import { SettingsPanel } from './ui/settings.js';
import { h, clear, $, options, debounce, readFileText } from './ui/dom.js';

const store = new Store();
const source = new Source({ getProxyUrl: () => store.proxyUrl });

const session = {
  tnr: null, // hlavní (zadaný) turnaj
  rootInfo: null, // jeho informace
  group: null, // tnr zvolené skupiny nebo 'all'
  templateId: store.state.ui.lastTemplate || 'pairings',
  round: 'auto',
  busy: false,
  renderSeq: 0,
};

const els = {
  form: $('#form-load'),
  input: $('#input-tournament'),
  btnLoad: $('#btn-load'),
  recent: $('#recent'),
  tinfo: $('#tournament-info'),
  tplList: $('#template-list'),
  options: $('#options'),
  btnPrint: $('#btn-print'),
  status: $('#status'),
  warnings: $('#warnings'),
  pages: $('#pages'),
  pageCount: $('#page-count'),
  zoom: $('#zoom'),
  scroll: $('#preview-scroll'),
  profileSelect: $('#profile-select'),
  btnSettings: $('#btn-settings'),
  sideMain: $('#side-main'),
  sideSettings: $('#side-settings'),
  pageRule: $('#page-rule'),
};

// ---------------------------------------------------------------------------
// Stav a pomocné funkce
// ---------------------------------------------------------------------------

function setStatus(text, kind = '') {
  els.status.textContent = text || '';
  els.status.className = `status ${kind}`;
}

function showWarnings(list, kind = '') {
  clear(els.warnings);
  if (!list || !list.length) { els.warnings.hidden = true; return; }
  els.warnings.className = `warnings ${kind}`;
  for (const w of list) els.warnings.append(w instanceof Node ? w : h('p', {}, '⚠ ', w));
  els.warnings.hidden = false;
}

/** Výstupy pro turnaj bez těch, které má aktivní profil schované. */
function visibleTemplates(info) {
  const hidden = new Set(store.profile.hiddenTemplates || []);
  const list = templatesFor(info).filter((t) => !hidden.has(t.id));
  return list.length ? list : templatesFor(info);
}

/** Když je zvolený výstup schovaný nebo nepodporovaný, přepne na první viditelný. */
function ensureVisibleTemplate() {
  if (!session.rootInfo) return;
  const vis = visibleTemplates(session.rootInfo);
  if (!vis.some((t) => t.id === session.templateId)) session.templateId = vis[0].id;
}

function currentTemplate() {
  const t = getTemplate(session.templateId);
  if (t && session.rootInfo && !t.supports(session.rootInfo)) return null;
  return t;
}

/** Turnaje (tnr), které se mají vytisknout – jedna skupina nebo všechny. */
function targetTnrs() {
  const info = session.rootInfo;
  if (!info) return [];
  if (session.group === 'all' && info.groups.length > 1) return info.groups.map((g) => g.tnr);
  return [session.group || session.tnr];
}

function groupName(tnr) {
  const g = session.rootInfo && session.rootInfo.groups.find((x) => x.tnr === tnr);
  return g ? g.name : null;
}

// ---------------------------------------------------------------------------
// Načtení turnaje
// ---------------------------------------------------------------------------

async function loadTournament(input, { fresh = false, fromSnapshot = false } = {}) {
  const parsed = typeof input === 'object' ? input : parseTournamentInput(input);
  if (!parsed) {
    setStatus('Zadejte číslo turnaje (např. 1495793) nebo odkaz z chess-results.com.', 'error');
    return;
  }
  setBusy(true);
  setStatus(`Stahuji turnaj ${parsed.tnr}…`, 'loading');
  try {
    if (fresh) source.invalidate(parsed.tnr);
    const main = await source.get(parsed.tnr, 'main', null, { fresh });
    const info = main.info;
    if (!info.title && !(main.data.players || []).length && !info.menu.length) {
      throw new FetchError(`Turnaj ${parsed.tnr} se na chess-results nepodařilo najít.`);
    }
    const changed = session.tnr !== parsed.tnr;
    session.tnr = parsed.tnr;
    session.rootInfo = info;
    if (changed) {
      session.group = parsed.tnr;
      session.round = parsed.rd || 'auto';
      const hint = templateFromArt(parsed.art, info);
      if (hint) session.templateId = hint;
    }
    if (!getTemplate(session.templateId) || !getTemplate(session.templateId).supports(info)) {
      session.templateId = visibleTemplates(info)[0].id;
    }
    // Před zveřejněním losu (a ne u kruhového systému, kde je los znám předem) začneme seznamy
    const tpl0 = getTemplate(session.templateId);
    if (changed && !parsed.art && !info.lastPairedRound && info.system !== 'roundrobin' && tpl0.roundMode === 'pairings') {
      session.templateId = info.isTeam ? 'team-roster' : 'startlist';
    }
    if (!fromSnapshot) store.addRecent(parsed.tnr, info.title);
    els.input.value = String(parsed.tnr);
    renderRecent();
    renderTournamentInfo();
    renderTemplateList();
    await refreshPreview({ fresh });
    if (!fromSnapshot) store.saveSnapshot(parsed.tnr, source.snapshot(parsed.tnr));
  } catch (e) {
    reportError(e, parsed.tnr);
  } finally {
    setBusy(false);
  }
}

function templateFromArt(art, info) {
  if (art == null) return null;
  if (info.isTeam) return { 2: 'team-matches', 3: 'team-boards', 46: 'team-ranking', 32: 'team-roster', 16: 'team-roster' }[art] || null;
  return { 0: 'startlist', 1: 'ranking', 2: 'pairings', 3: 'startlist', 4: 'ranking' }[art] || null;
}

/** Kola, která jsou pro šablonu v mezipaměti (např. ručně vložená). */
function cachedRounds(tnr, tpl) {
  const sets = { pairings: ['pairings', 'boards', 'teamPairings'], ranking: ['ranking', 'teamRanking'] }[tpl.roundMode] || [];
  const out = new Set();
  for (const k of source.cache.keys()) {
    const [t, ds, rd] = k.split('|');
    if (Number(t) === tnr && sets.includes(ds) && rd) out.add(Number(rd));
  }
  return [...out];
}

function reportError(e, tnr, dataset, round) {
  console.error(e);
  const msg = e instanceof FetchError || e.message ? e.message : String(e);
  setStatus('Chyba při stahování', 'error');
  const items = [h('p', {}, '✖ ', msg)];
  if (dataset && DATASETS[dataset]) {
    items.push(h('p', {}, `Chybí data: ${DATASETS[dataset].label}${round && DATASETS[dataset].round ? `, ${round}. kolo` : ''}.`));
  }
  if (e.hint) items.push(h('p', {}, e.hint));
  if (tnr && e instanceof FetchError) {
    const url = buildUrl(tnr, dataset || 'main', round);
    items.push(h('p', {}, 'Záložní možnost: otevřete ',
      h('a', { href: url, target: '_blank', rel: 'noopener' }, 'stránku na chess-results'),
      ', uložte ji a nahrajte přes „Vložit HTML ručně“.'));
  }
  showWarnings(items, 'error');
}

function setBusy(b) {
  session.busy = b;
  els.btnLoad.disabled = b;
  const upd = $('#btn-refresh');
  if (upd) upd.disabled = b;
}

// ---------------------------------------------------------------------------
// Vykreslení panelu
// ---------------------------------------------------------------------------

function renderRecent() {
  clear(els.recent);
  for (const r of store.state.recent) {
    els.recent.append(h('span', { class: 'chip', title: `${r.title} (${r.tnr})` },
      h('button', { type: 'button', class: 'chip-main', onclick: () => loadTournament(String(r.tnr)) }, r.title || String(r.tnr)),
      h('button', { type: 'button', title: 'Odebrat ze seznamu', 'aria-label': 'Odebrat', onclick: () => { store.removeRecent(r.tnr); renderRecent(); } }, '×')));
  }
}

const SYSTEM_NAMES = { swiss: 'švýcarský systém', roundrobin: 'každý s každým', knockout: 'vyřazovací' };

function renderTournamentInfo() {
  const info = session.rootInfo;
  clear(els.tinfo);
  if (!info) { els.tinfo.hidden = true; return; }
  els.tinfo.hidden = false;
  const fetched = source.lastFetched(session.tnr);
  const anyManual = [...source.cache.entries()].some(([k, v]) => k.startsWith(`${session.tnr}|`) && v.manual);
  const meta = [
    info.isTeam ? 'družstva' : 'jednotlivci',
    SYSTEM_NAMES[info.system] || info.type,
    info.totalRounds ? `${info.totalRounds} kol` : null,
    info.lastPairedRound ? `los zveřejněn do ${info.lastPairedRound}. kola` : null,
  ].filter(Boolean).join(' · ');
  els.tinfo.append(
    h('div', { class: 't-title' }, info.title || `Turnaj ${info.tnr}`, ' ', h('span', { class: 'badge' }, String(session.tnr))),
    h('div', { class: 't-meta' }, meta),
    h('div', { class: 't-times' },
      h('div', {}, 'Na chess-results aktualizováno: ', h('b', {}, info.lastUpdateText || 'neznámo')),
      h('div', {}, anyManual ? 'Data vložena ručně: ' : 'Staženo do appky: ', h('b', {}, fetched ? fmtDateTime(fetched) : '–'))),
  );
  if (info.groups.length > 1) {
    const sel = h('select', {
      onchange: (e) => {
        session.group = e.target.value === 'all' ? 'all' : Number(e.target.value);
        renderOptions();
        refreshPreview();
      },
    }, options([...info.groups.map((g) => [g.tnr, g.name + (g.tnr === session.tnr ? ' (zadaný)' : '')]), ['all', `Všechny skupiny (${info.groups.length})`]], session.group));
    els.tinfo.append(h('label', { class: 'field' }, 'Skupina / turnaj', sel));
    if (session.group === 'all' && info.groups.length > 4) {
      els.tinfo.append(h('p', { class: 'small muted' }, `Tisk všech skupin stáhne data ze ${info.groups.length} turnajů – chvíli to potrvá.`));
    }
  }
  els.tinfo.append(h('div', { class: 'row', style: { marginTop: '8px' } },
    h('button', {
      type: 'button', class: 'btn', id: 'btn-refresh', disabled: session.busy, title: 'Stáhne znovu aktuální stav z chess-results (obejde mezipaměť)',
      onclick: () => refreshData(),
    }, '⟳ Aktualizovat data'),
    h('a', { class: 'small', href: `https://chess-results.com/tnr${session.tnr}.aspx?lan=5`, target: '_blank', rel: 'noopener' }, 'otevřít na chess-results ↗')));
}

function renderTemplateList() {
  clear(els.tplList);
  const info = session.rootInfo;
  if (!info) { els.tplList.append(h('p', { class: 'muted small' }, 'Nejdřív stáhněte turnaj.')); return; }
  ensureVisibleTemplate();
  let lastGroup = null;
  for (const t of visibleTemplates(info)) {
    if (t.group !== lastGroup) {
      els.tplList.append(h('div', { class: 'tpl-group' }, t.group));
      lastGroup = t.group;
    }
    els.tplList.append(h('button', {
      type: 'button', class: 'tpl', 'aria-pressed': String(t.id === session.templateId),
      onclick: () => {
        session.templateId = t.id;
        store.update((s) => { s.ui.lastTemplate = t.id; }, { silent: true });
        renderTemplateList();
        refreshPreview();
        if (settingsPanel && !els.sideSettings.hidden) settingsPanel.render();
      },
    }, h('span', { class: 'tpl-name' }, t.name), h('span', { class: 'tpl-desc' }, t.description)));
  }
  renderOptions();
}

/** Rychlé přepnutí orientace a písma „co největší“ přímo nad náhledem (ukládá se do profilu). */
function renderQuickLayout() {
  const box = $('#quick-layout');
  if (!box) return;
  clear(box);
  const tpl = currentTemplate();
  if (!tpl || !session.rootInfo) return;
  const ts = templateSettings(store.profile, tpl);
  const orient = ts.orientation && ts.orientation !== 'inherit' ? ts.orientation : store.profile.page.orientation;
  const isMax = ts.fontMode === 'max';
  const set = (orientation) => {
    const active = isMax && orient === orientation;
    store.update((s) => {
      const p = s.profiles.find((x) => x.id === s.activeProfileId);
      p.templates[tpl.id] = p.templates[tpl.id] || {};
      p.templates[tpl.id].orientation = orientation;
      p.templates[tpl.id].fontMode = active ? 'fixed' : 'max';
    }, { silent: true });
    renderQuickLayout();
    if (settingsPanel && !els.sideSettings.hidden) settingsPanel.render();
    scheduleRender();
  };
  const btn = (orientation, icon, label) => h('button', {
    type: 'button', class: 'btn small quick-btn', 'aria-pressed': String(isMax && orient === orientation),
    title: isMax && orient === orientation ? 'Kliknutím vrátíte pevnou velikost písma' : `Přepnout ${label.toLowerCase()} a zvětšit písmo na maximum`,
    onclick: () => set(orientation),
  }, `${icon} ${label} · max. písmo`);
  box.append(btn('portrait', '↕', 'Na výšku'), btn('landscape', '↔', 'Na šířku'));
}

function renderOptions() {
  renderQuickLayout();
  clear(els.options);
  const tpl = currentTemplate();
  const info = session.rootInfo;
  if (!tpl || !info) { els.options.append(h('p', { class: 'muted small' }, 'Vyberte výstup.')); return; }

  if (tpl.roundMode) {
    const max = Math.max(info.totalRounds || 0, info.lastPairedRound || 0, info.lastRankedRound || 0, 1);
    const auto = autoRoundFor(tpl);
    const label = tpl.roundMode === 'ranking' ? 'Pořadí po kole' : 'Kolo';
    const list = [['auto', `automaticky${auto ? ` (${auto}. kolo)` : ''}`]];
    for (let i = 1; i <= max; i++) {
      let note = '';
      if (tpl.roundMode === 'pairings' && info.pairedRounds.length && !info.pairedRounds.includes(i)) note = ' – los zatím není';
      if (tpl.roundMode === 'ranking' && info.rankedRounds.length && !info.rankedRounds.includes(i)) note = ' – zatím není';
      list.push([i, `${i}. kolo${note}`]);
    }
    els.options.append(h('label', { class: 'field' }, label, h('select', {
      onchange: (e) => { session.round = e.target.value === 'auto' ? 'auto' : Number(e.target.value); refreshPreview(); },
    }, options(list, session.round))));
  }

  const ts = templateSettings(store.profile, tpl);
  const setOpt = (key, value) => {
    store.update((s) => {
      const p = s.profiles.find((x) => x.id === s.activeProfileId);
      p.templates[tpl.id] = p.templates[tpl.id] || {};
      p.templates[tpl.id].options = { ...(p.templates[tpl.id].options || {}), [key]: value };
    }, { silent: true });
    scheduleRender();
  };
  for (const o of tpl.options || []) {
    const v = ts.options[o.key];
    if (o.type === 'bool') {
      els.options.append(h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: !!v, onchange: (e) => setOpt(o.key, e.target.checked) }), o.label));
    } else if (o.type === 'select') {
      els.options.append(h('label', { class: 'field' }, o.label,
        h('select', { onchange: (e) => setOpt(o.key, e.target.value) }, options(o.choices, v))));
    } else if (o.type === 'number') {
      els.options.append(h('label', { class: 'field inline' }, o.label,
        h('input', { type: 'number', min: o.min, max: o.max, value: v, oninput: (e) => setOpt(o.key, Number(e.target.value) || o.def) })));
    } else if (o.type === 'text') {
      els.options.append(h('label', { class: 'field' }, o.label,
        h('input', { type: 'text', value: v || '', oninput: (e) => setOpt(o.key, e.target.value) })));
    } else if (o.type === 'category') {
      const tnr = targetTnrs()[0];
      const players = source.peek(tnr, 'main')?.data?.players || [];
      const cats = categoriesOf(players);
      if (!cats.length) continue;
      els.options.append(h('label', { class: 'field' }, o.label,
        h('select', { onchange: (e) => setOpt(o.key, e.target.value) },
          options([['', 'všechny dohromady'], ...cats.map((c) => [c, c]), ['*split*', 'každá kategorie zvlášť']], v))));
    }
  }
  els.options.append(h('button', {
    type: 'button', class: 'btn small', style: { marginTop: '6px' },
    onclick: () => { openSettings('template'); },
  }, 'Sloupce, písmo a orientace…'));
}

function autoRoundFor(tpl) {
  const tnr = targetTnrs()[0];
  const info = source.peek(tnr, 'main')?.info || session.rootInfo;
  const data = { pairings: source.peek(tnr, 'pairings', 1)?.data };
  return autoRound(tpl, info, data);
}

function renderProfileSelect() {
  clear(els.profileSelect);
  els.profileSelect.append(...options(store.state.profiles.map((p) => [p.id, p.name]), store.state.activeProfileId));
}

// ---------------------------------------------------------------------------
// Náhled
// ---------------------------------------------------------------------------

async function loadDatasets(tnr, info, tpl, round, opts, { fresh }) {
  const data = {};
  const needs = datasetsFor(tpl, info, round, opts);
  for (const n of needs) {
    if (n.dataset === 'main') {
      data.main = (await source.get(tnr, 'main', null, { fresh: false })).data;
      continue;
    }
    try {
      const entry = await source.get(tnr, n.dataset, DATASETS[n.dataset].round ? n.round : null, { fresh });
      data[n.dataset] = entry.data;
    } catch (e) {
      if (n.optional) continue;
      e.dataset = n.dataset;
      e.round = n.round;
      throw e;
    }
  }
  return data;
}

async function refreshPreview({ fresh = false } = {}) {
  const tpl = currentTemplate();
  const seq = ++session.renderSeq;
  if (!tpl || !session.rootInfo) return;
  setStatus('Připravuji náhled…', 'loading');
  showWarnings([]);
  const profile = store.profile;
  const ts = templateSettings(profile, tpl);
  const docs = [];
  const tnrs = targetTnrs();
  try {
    for (const tnr of tnrs) {
      const main = await source.get(tnr, 'main', null, { fresh: fresh && tnr !== session.tnr });
      const info = main.info;
      if (!tpl.supports(info)) continue;
      // Kolo: „automaticky“ se určí pro každou skupinu zvlášť
      let round = null;
      if (tpl.roundMode) {
        if (session.round === 'auto') {
          let pre = {};
          if (!info.isTeam && info.system === 'roundrobin' && tpl.roundMode === 'pairings') {
            pre = { pairings: (await source.get(tnr, 'pairings', 1, { fresh })).data };
          }
          round = autoRound(tpl, info, pre);
          // Bez proxy (ručně vložená data) vezmeme nejnovější kolo, které je opravdu k dispozici
          if (!store.proxyUrl) {
            const have = cachedRounds(tnr, tpl);
            if (have.length && !have.includes(round)) round = Math.max(...have);
          }
        } else {
          round = session.round;
        }
      }
      const data = await loadDatasets(tnr, info, tpl, round, ts.options, { fresh });
      if (seq !== session.renderSeq) return;
      const doc = buildDocument({ tpl, info, data, profile, round });
      doc.groupName = tnrs.length > 1 ? groupName(tnr) : null;
      docs.push(doc);
    }
  } catch (e) {
    if (seq !== session.renderSeq) return;
    reportError(e, targetTnrs()[0], e.dataset, e.round);
    return;
  }
  if (seq !== session.renderSeq) return;
  layoutAll(docs);
  if (fresh) store.saveSnapshot(session.tnr, source.snapshot(session.tnr));
}

let lastDocs = [];
function layoutAll(docs) {
  lastDocs = docs;
  clear(els.pages);
  let pages = 0;
  let orientation = 'portrait';
  const warnings = [];
  for (const d of docs) {
    const container = h('div');
    els.pages.append(container);
    const res = layoutDocument(container, d.blocks, d.layout);
    pages += res.pageCount;
    orientation = d.layout.orientation;
    for (const w of d.warnings) warnings.push(d.groupName ? `${d.groupName}: ${w}` : w);
    if (d.layout.fitWidth && d.layout.fitWidth.enabled) {
      container.dataset.fit = `${String(res.fontSize).replace('.', ',')} pt (co největší)`;
    } else if (d.layout.fit && d.layout.fit.enabled) {
      container.dataset.fit = `${res.fontSize} pt, ${res.columns} sl.`;
    }
  }
  els.pageRule.textContent = pageRule(orientation);
  els.pageCount.textContent = pages ? `${pages} ${pages === 1 ? 'stránka' : pages < 5 ? 'stránky' : 'stránek'}` : '';
  els.btnPrint.disabled = !pages;
  showWarnings(warnings);
  const fitInfo = docs.length === 1 && els.pages.firstChild?.dataset.fit ? ` · písmo ${els.pages.firstChild.dataset.fit}` : '';
  setStatus(docs.length ? `Náhled připraven${fitInfo}` : 'Pro tento turnaj není výstup k dispozici.', docs.length ? 'ok' : 'error');
  applyZoom();
  renderTournamentInfo();
}

const scheduleRender = debounce(() => {
  // Změna vzhledu: data jsou v mezipaměti, takže jde jen o přeskládání.
  refreshPreview();
}, 200);

async function refreshData() {
  if (!session.tnr) return;
  setBusy(true);
  for (const t of new Set([session.tnr, ...targetTnrs()])) source.invalidate(t);
  try {
    const main = await source.get(session.tnr, 'main', null, { fresh: true });
    session.rootInfo = main.info;
    renderOptions();
    await refreshPreview({ fresh: true });
    store.saveSnapshot(session.tnr, source.snapshot(session.tnr));
  } catch (e) {
    reportError(e, session.tnr);
  } finally {
    setBusy(false);
    renderTournamentInfo();
  }
}

function applyZoom() {
  const z = els.zoom.value;
  const first = els.pages.querySelector('.page');
  if (!first) { els.pages.style.zoom = ''; return; }
  let scale = Number(z);
  const availW = els.scroll.clientWidth - 48;
  if (z === 'fit') {
    scale = Math.min(1.25, Math.max(0.2, availW / first.offsetWidth));
  } else if (z === 'page') {
    const availH = els.scroll.clientHeight - 48;
    scale = Math.min(1.25, Math.max(0.2, Math.min(availW / first.offsetWidth, availH / first.offsetHeight)));
  }
  els.pages.style.zoom = String(scale);
  store.update((s) => { s.ui.previewZoom = z; }, { silent: true });
}

/** Posuvník mezi panelem a náhledem – šířka panelu se pamatuje. */
function setupSplitter() {
  const handle = $('#splitter');
  const app = document.querySelector('.app');
  const clamp = (w) => Math.round(Math.max(320, Math.min(w, window.innerWidth - 320)));
  const apply = (w, save) => {
    const v = clamp(w);
    app.style.setProperty('--side-w', `${v}px`);
    if (save) store.update((s) => { s.ui.sideWidth = v; }, { silent: true });
    applyZoom();
  };
  const initial = Number(store.state.ui.sideWidth) || Math.round(Math.min(620, Math.max(420, window.innerWidth * 0.42)));
  apply(initial, false);
  let dragging = false;
  handle.addEventListener('pointerdown', (e) => {
    dragging = true;
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
  });
  handle.addEventListener('pointermove', (e) => { if (dragging) apply(e.clientX, false); });
  const stop = (e) => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('resizing');
    apply(e.clientX, true);
  };
  handle.addEventListener('pointerup', stop);
  handle.addEventListener('pointercancel', stop);
  handle.addEventListener('dblclick', () => apply(Math.round(window.innerWidth * 0.42), true));
  handle.addEventListener('keydown', (e) => {
    const cur = parseInt(getComputedStyle(app).getPropertyValue('--side-w'), 10) || initial;
    if (e.key === 'ArrowLeft') { apply(cur - 40, true); e.preventDefault(); }
    if (e.key === 'ArrowRight') { apply(cur + 40, true); e.preventDefault(); }
  });
}

// ---------------------------------------------------------------------------
// Nastavení
// ---------------------------------------------------------------------------

let settingsPanel = null;

function openSettings(tab) {
  els.sideMain.hidden = true;
  els.sideSettings.hidden = false;
  els.btnSettings.setAttribute('aria-pressed', 'true');
  settingsPanel.show(tab);
}

function closeSettings() {
  els.sideSettings.hidden = true;
  els.sideMain.hidden = false;
  els.btnSettings.setAttribute('aria-pressed', 'false');
  renderOptions();
}

async function testProxy(url) {
  if (!url) return { ok: false, message: 'Zadejte adresu proxy.' };
  try {
    const u = new URL(url);
    u.searchParams.set('url', 'https://chess-results.com/tnr1.aspx?lan=1');
    const res = await fetch(u.toString(), { cache: 'no-store' });
    const text = await res.text();
    if (!res.ok) return { ok: false, message: `Proxy odpověděla chybou ${res.status}: ${text.slice(0, 160)}` };
    if (/chess-results|Chess-Results/i.test(text)) return { ok: true, message: '✔ Proxy funguje a dosáhne na chess-results.com.' };
    return { ok: false, message: 'Proxy odpověděla, ale obsah nevypadá jako chess-results.' };
  } catch (e) {
    return { ok: false, message: 'Proxy neodpovídá (špatná adresa, nebo chybí CORS hlavičky).' };
  }
}

// ---------------------------------------------------------------------------
// Ruční vložení HTML
// ---------------------------------------------------------------------------

function setupManualDialog() {
  const dlg = $('#dlg-manual');
  const out = $('#manual-result');
  $('#btn-manual').addEventListener('click', () => { out.textContent = ''; dlg.showModal(); });
  $('#manual-cancel').addEventListener('click', () => dlg.close());
  $('#manual-submit').addEventListener('click', async () => {
    const files = [...$('#manual-files').files];
    const texts = [];
    for (const f of files) texts.push({ name: f.name, html: await readFileText(f) });
    const pasted = $('#manual-text').value.trim();
    if (pasted) texts.push({ name: 'vložený text', html: pasted });
    if (!texts.length) { out.textContent = 'Vyberte soubor nebo vložte zdrojový kód.'; return; }
    clear(out);
    let lastTnr = null;
    for (const t of texts) {
      try {
        const r = source.addManualHtml(t.html, { isTeamHint: session.rootInfo?.isTeam });
        lastTnr = r.tnr;
        const what = r.kind ? (DATASETS[r.kind]?.label || r.kind) : 'informace o turnaji';
        out.append(h('div', { class: 'manual-ok' }, `✔ ${t.name}: ${r.info.title || r.tnr} – ${what}${r.added.find((a) => a.round) ? `, kolo ${r.added.find((a) => a.round).round}` : ''}`));
      } catch (e) {
        out.append(h('div', { class: 'manual-err' }, `✖ ${t.name}: ${e.message}`));
      }
    }
    $('#manual-files').value = '';
    $('#manual-text').value = '';
    if (lastTnr) {
      if (session.tnr === lastTnr) {
        session.rootInfo = source.peek(lastTnr, 'main').info;
        renderTournamentInfo();
        renderTemplateList();
        refreshPreview();
      } else {
        loadTournament({ tnr: lastTnr }, { fromSnapshot: false });
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

function init() {
  settingsPanel = new SettingsPanel(els.sideSettings, {
    store,
    getTemplate: currentTemplate,
    testProxy,
    onClose: closeSettings,
    onChange: (ev = {}) => {
      renderProfileSelect();
      if (ev.proxyChanged) renderRecent();
      // nabídka výstupů a rychlá tlačítka se mohla změnit (schované výstupy, orientace, písmo)
      if (session.rootInfo) renderTemplateList();
      scheduleRender();
    },
  });

  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    loadTournament(els.input.value);
  });
  els.btnPrint.addEventListener('click', () => window.print());
  els.btnSettings.addEventListener('click', () => (els.sideSettings.hidden ? openSettings() : closeSettings()));
  els.profileSelect.addEventListener('change', (e) => {
    store.setActiveProfile(e.target.value);
    renderTemplateList();
    if (!els.sideSettings.hidden) settingsPanel.render();
    scheduleRender();
  });
  els.zoom.value = store.state.ui.previewZoom || 'page';
  setupSplitter();
  els.zoom.addEventListener('change', applyZoom);
  window.addEventListener('resize', debounce(applyZoom, 150));
  window.addEventListener('beforeunload', () => store.flush());
  // Ctrl+P bez kliknutí na tlačítko – náhled je vždy aktuální, nic dalšího netřeba.

  setupManualDialog();
  renderProfileSelect();
  renderRecent();

  // Odkaz s ?t=číslo otevře turnaj rovnou
  const qp = new URLSearchParams(location.search).get('t');
  const snap = store.loadSnapshot();
  if (qp) {
    loadTournament(qp);
  } else if (snap && snap.tnr && snap.data) {
    source.restore(snap.data);
    loadTournament({ tnr: snap.tnr }, { fromSnapshot: true }).then(() => {
      setStatus(`Zobrazena data z ${fmtDateTime(snap.savedAt)} – pro aktuální stav klikněte na „Aktualizovat data“.`);
    });
  }
}

init();

// Pro ladění v konzoli
window.chessPrint = { store, source, session, TEMPLATES };

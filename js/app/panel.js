// Levý panel: naposledy otevřené turnaje, informace o turnaji, nabídka výstupů a jejich možnosti,
// rychlé volby nad náhledem.

import { store, source, session, els, updateTemplateSettings } from './context.js';
import { templateSettings } from '../store.js';
import { getTemplate, templatesFor } from '../templates/index.js';
import { autoRound, headerMode } from '../render.js';
import { fmtDateTime, fmtWhen } from '../templates/common.js';
import { h, clear, $, options } from '../ui/dom.js';
import { optionControls } from '../ui/options.js';
import { loadTournament, refreshData } from './loader.js';
import { tabList, switchTab } from './tabs.js';
import { refreshPreview, scheduleRender, targetTnrs } from './preview.js';
import { openSettings, refreshSettings } from './settingsHost.js';
import { outputPrintStatus } from './printing.js';

/** Výstupy pro turnaj bez těch, které má aktivní profil schované. */
export function visibleTemplates(info) {
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

export function currentTemplate() {
  const t = getTemplate(session.templateId);
  if (t && session.rootInfo && !t.supports(session.rootInfo)) return null;
  return t;
}

// ---------------------------------------------------------------------------
// Naposledy otevřené turnaje
// ---------------------------------------------------------------------------

let recentFilter = '';

/**
 * Seznam naposledy otevřených turnajů pod polem pro adresu. Bez otevřeného turnaje je rozbalený,
 * jinak sbalený do „Naposledy otevřené (N)“. Otevřené turnaje (záložky) jsou označené.
 */
export function renderRecent() {
  clear(els.recent);
  const list = store.state.recent;
  if (!list.length) return;
  const open = new Set(tabList().map((t) => t.tnr));
  const q = recentFilter.trim().toLocaleLowerCase('cs');
  const shown = q ? list.filter((r) => `${r.title} ${r.tnr}`.toLocaleLowerCase('cs').includes(q)) : list;
  const rows = h('ul', { class: 'recent-list' }, shown.map((r) => h('li', { class: open.has(r.tnr) ? 'open' : '' },
    h('button', {
      type: 'button', class: 'recent-main', title: open.has(r.tnr) ? 'Přepnout na otevřený turnaj' : 'Otevřít turnaj',
      onclick: () => (open.has(r.tnr) ? switchTab(r.tnr) : loadTournament(String(r.tnr))),
    },
    h('span', { class: 'recent-title' }, r.title || `Turnaj ${r.tnr}`),
    h('span', { class: 'recent-meta' }, `č. ${r.tnr}`, r.at ? ` · ${fmtWhen(r.at)}` : '', open.has(r.tnr) ? h('span', { class: 'recent-open' }, 'otevřený') : null)),
    h('button', {
      type: 'button', class: 'recent-del', title: 'Odebrat ze seznamu', 'aria-label': `Odebrat ${r.title || r.tnr} ze seznamu`,
      onclick: () => { store.removeRecent(r.tnr); renderRecent(); },
    }, '×'))));
  const filter = list.length > 6 ? h('input', {
    type: 'search', class: 'recent-filter', placeholder: 'Hledat v naposledy otevřených…', value: recentFilter, 'aria-label': 'Hledat v naposledy otevřených turnajích',
    oninput: (e) => {
      recentFilter = e.target.value;
      const pos = e.target.selectionStart;
      renderRecent();
      const f = els.recent.querySelector('.recent-filter');
      if (f) { f.focus(); f.setSelectionRange(pos, pos); }
    },
  }) : null;
  const body = [filter, shown.length ? rows : h('p', { class: 'small muted' }, 'Nic nenalezeno.')];
  if (!session.tnr) {
    els.recent.append(h('div', { class: 'recent-head' }, 'Naposledy otevřené'), ...body.filter(Boolean));
  } else {
    els.recent.append(h('details', { class: 'recent-fold' }, h('summary', {}, `Naposledy otevřené (${list.length})`), ...body.filter(Boolean)));
  }
}

// ---------------------------------------------------------------------------
// Informace o turnaji
// ---------------------------------------------------------------------------

const SYSTEM_NAMES = { swiss: 'švýcarský systém', roundrobin: 'každý s každým', knockout: 'vyřazovací' };

export function renderTournamentInfo() {
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

// ---------------------------------------------------------------------------
// Výstupy
// ---------------------------------------------------------------------------

export function selectTemplate(id) {
  session.templateId = id;
  store.update((s) => { s.ui.lastTemplate = id; }, { silent: true });
  renderTemplateList();
  refreshPreview();
  refreshSettings();
}

/** Nejvyšší číslo kola pro nabídku kol. */
export function maxRound(info) {
  return Math.max(info.totalRounds || 0, info.lastPairedRound || 0, info.lastRankedRound || 0, 1);
}

/** Klávesy ← / → : předchozí / další kolo. */
export function stepRound(d) {
  const tpl = currentTemplate();
  const info = session.rootInfo;
  if (!tpl || !tpl.roundMode || !info) return;
  const max = maxRound(info);
  let cur = session.round;
  if (cur === 'auto') cur = autoRoundFor(tpl) || 1;
  else if (cur === 'all') cur = d < 0 ? max + 1 : 0;
  const next = Math.min(max, Math.max(1, Number(cur) + d));
  if (next === session.round) return;
  session.round = next;
  renderOptions();
  refreshPreview();
}

/** Kolo, které se pro výstup vytiskne (pro značku „vytištěno“ u dlaždic). */
export function resolvedRound(tpl) {
  if (!tpl.roundMode) return '';
  if (session.round === 'all') return tpl.allRounds && session.rootInfo && tpl.allRounds(session.rootInfo) ? 'all' : autoRoundFor(tpl) ?? '';
  if (session.round === 'auto') return autoRoundFor(tpl) ?? '';
  return session.round;
}

export function renderTemplateList() {
  clear(els.tplList);
  const info = session.rootInfo;
  if (!info) { els.tplList.append(h('p', { class: 'muted small' }, 'Nejdřív stáhněte turnaj.')); return; }
  ensureVisibleTemplate();
  let lastGroup = null;
  const vis = visibleTemplates(info);
  vis.forEach((t, i) => {
    if (t.group !== lastGroup) {
      els.tplList.append(h('div', { class: 'tpl-group' }, t.group));
      lastGroup = t.group;
    }
    const k = i + 1;
    // Kompaktní dlaždice: jen název (a číslo klávesy), popis po najetí myší
    els.tplList.append(h('button', {
      type: 'button', class: 'tpl', 'aria-pressed': String(t.id === session.templateId), dataset: { tpl: t.id, desc: `${t.description}${k <= 9 ? ` (klávesa ${k})` : ''}` },
      onclick: () => selectTemplate(t.id),
    },
    h('span', { class: 'tpl-name' }, t.name),
    k <= 9 ? h('span', { class: 'tpl-key', 'aria-hidden': 'true' }, String(k)) : null));
  });
  refreshTileMarks();
  renderOptions();
}

/** Značky „vytištěno“ (✓) a „data se od tisku změnila“ (!) u dlaždic výstupů. */
export function refreshTileMarks() {
  for (const btn of els.tplList.querySelectorAll('.tpl[data-tpl]')) {
    const t = getTemplate(btn.dataset.tpl);
    const printed = t ? outputPrintStatus(t) : null;
    btn.classList.remove('printed-printed', 'printed-changed');
    btn.querySelector('.tpl-printed')?.remove();
    btn.title = btn.dataset.desc + (printed ? `\nVytištěno ${fmtDateTime(printed.at)}${printed.state === 'changed' ? ' – data se od té doby změnila' : ''}` : '');
    if (!printed) continue;
    btn.classList.add(`printed-${printed.state}`);
    btn.prepend(h('span', { class: 'tpl-printed', 'aria-label': printed.state === 'changed' ? 'vytištěno, data se změnila' : 'vytištěno' }, printed.state === 'changed' ? '!' : '✓'));
  }
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
  const setTpl = (fn) => {
    updateTemplateSettings(tpl.id, fn);
    renderQuickLayout();
    refreshSettings();
    scheduleRender();
  };
  // label '' = bez viditelného popisku (orientace je jasná ze šipek)
  const seg = (label, items) => h('div', { class: 'quick-group seg', role: 'group', 'aria-label': label || 'Orientace' },
    label ? h('span', {}, label) : null,
    items.map((it) => h('button', {
      type: 'button', class: 'btn small quick-btn', 'aria-pressed': String(it.on), title: it.title, 'aria-label': `${label || 'Orientace'}: ${it.text}`, onclick: it.onclick,
    }, it.text)));
  box.append(
    seg('', [
      { text: '↕ Na výšku', on: orient === 'portrait', title: 'Stránka na výšku', onclick: () => setTpl((t) => { t.orientation = 'portrait'; }) },
      { text: '↔ Na šířku', on: orient === 'landscape', title: 'Stránka na šířku', onclick: () => setTpl((t) => { t.orientation = 'landscape'; }) },
    ]),
    seg('Písmo', [
      { text: 'Pevné', on: ts.fontMode === 'fixed', title: 'Velikost písma podle nastavení (⚙ Nastavení → Výstup)', onclick: () => setTpl((t) => { t.fontMode = 'fixed'; }) },
      { text: 'Co největší', on: ts.fontMode === 'max', title: 'Co největší písmo, aby se vešly všechny sloupce; tabulka může pokračovat na další stránce', onclick: () => setTpl((t) => { t.fontMode = 'max'; }) },
      { text: '1 strana A4', on: ts.fontMode === 'page', title: 'Písmo i výška řádků co největší, aby se vše vešlo na jednu stránku A4', onclick: () => setTpl((t) => { t.fontMode = 'page'; }) },
    ]),
  );
}

export function renderOptions() {
  renderQuickLayout();
  clear(els.options);
  const tpl = currentTemplate();
  const info = session.rootInfo;
  const wrap = $('#options-wrap');
  if (wrap) wrap.hidden = !tpl || !info;
  if (!tpl || !info) return;
  const ot = $('#options-title');
  if (ot) ot.textContent = `Možnosti: ${tpl.name}`;

  if (tpl.roundMode) {
    const max = maxRound(info);
    const auto = autoRoundFor(tpl);
    const label = tpl.roundMode === 'ranking' ? 'Pořadí po kole' : 'Kolo';
    const list = [['auto', `automaticky${auto ? ` (${auto}. kolo)` : ''}`]];
    if (tpl.allRounds && tpl.allRounds(info)) list.push(['all', 'všechna kola najednou']);
    for (let i = 1; i <= max; i++) {
      let note = '';
      if (tpl.roundMode === 'pairings' && info.pairedRounds.length && !info.pairedRounds.includes(i)) note = ' – los zatím není';
      if (tpl.roundMode === 'ranking' && info.rankedRounds.length && !info.rankedRounds.includes(i)) note = ' – zatím není';
      list.push([i, `${i}. kolo${note}`]);
    }
    els.options.append(h('label', { class: 'field' }, label, h('select', {
      onchange: (e) => {
        const v = e.target.value;
        session.round = v === 'auto' || v === 'all' ? v : Number(v);
        renderOptions(); // volby jen pro „všechna kola“
        refreshPreview();
      },
    }, options(list, session.round))));
  }

  const ts = templateSettings(store.profile, tpl);
  const setOpt = (key, value) => {
    updateTemplateSettings(tpl.id, (t) => { t.options = { ...(t.options || {}), [key]: value }; });
    scheduleRender();
  };
  els.options.append(...optionControls(tpl, ts.options, { setOpt, ...optionsContext() }));
  // Záhlaví a zápatí tohoto výstupu (přepíše nastavení profilu)
  if (tpl.pageChrome !== false) {
    const setTpl = (key, value) => {
      updateTemplateSettings(tpl.id, (t) => { t[key] = value; });
      refreshSettings();
      scheduleRender();
    };
    const HEADER = { first: 'jen na první stránce', every: 'na každé stránce', title: 'jen název výstupu (bez hlavičky turnaje)', off: 'vypnuto' };
    const profHeader = headerMode(store.profile, null);
    const profFooter = store.profile.footer && store.profile.footer.enabled === false ? 'vypnuto' : 'na každé stránce';
    els.options.append(h('div', { class: 'row wrap chrome-opts' },
      h('label', { class: 'field' }, 'Záhlaví',
        h('select', { onchange: (e) => setTpl('header', e.target.value) },
          options([['inherit', `podle profilu (${HEADER[profHeader]})`], ...Object.entries(HEADER)], ts.header))),
      h('label', { class: 'field' }, 'Zápatí',
        h('select', { onchange: (e) => setTpl('footer', e.target.value) },
          options([['inherit', `podle profilu (${profFooter})`], ['on', 'na každé stránce'], ['off', 'vypnuto']], ts.footer))),
      // Vodoznak jen když ho profil má (Nastavení → Stránka)
      store.profile.page.watermark && store.profile.page.watermark.img
        ? h('label', { class: 'field' }, 'Vodoznak',
          h('select', { onchange: (e) => setTpl('watermark', e.target.value) },
            options([['inherit', 'podle profilu (zapnutý)'], ['off', 'vypnuto']], ts.watermark)))
        : null));
  }
  els.options.append(h('button', {
    type: 'button', class: 'btn small', style: { marginTop: '6px' },
    onclick: () => { openSettings('template'); },
  }, 'Sloupce, písmo a orientace…'));
}

/** Souvislosti pro volby výstupu (i pro Nastavení → Výstup): tisk všech kol, hráči turnaje. */
export function optionsContext() {
  const tpl = currentTemplate();
  const info = session.rootInfo;
  const tnr = targetTnrs()[0];
  return {
    allRounds: !!(tpl && info && session.round === 'all' && tpl.allRounds && tpl.allRounds(info)),
    players: (tnr && source.peek(tnr, 'main')?.data?.players) || [],
  };
}

export function autoRoundFor(tpl) {
  const tnr = targetTnrs()[0];
  const info = source.peek(tnr, 'main')?.info || session.rootInfo;
  const data = { pairings: source.peek(tnr, 'pairings', 1)?.data };
  return autoRound(tpl, info, data);
}

export function renderProfileSelect() {
  clear(els.profileSelect);
  els.profileSelect.append(...options(store.state.profiles.map((p) => [p.id, p.name]), store.state.activeProfileId));
}

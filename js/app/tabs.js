// Záložky turnajů (horní lišta): každý otevřený turnaj si pamatuje profil, výstup, kolo a skupinu.

import { store, source, session, els, setStatus, showWarnings } from './context.js';
import { getTemplate } from '../templates/index.js';
import { fmtDateTime } from '../templates/common.js';
import { h, clear, $ } from '../ui/dom.js';
import { loadTournament } from './loader.js';
import { renderProfileSelect, renderTournamentInfo, renderTemplateList, renderOptions, renderRecent } from './panel.js';
import { refreshSettings } from './settingsHost.js';
import { renderPrintMark } from './printing.js';

const EMPTY_PAGES_HTML = els.pages.innerHTML;

export function tabList() {
  return store.state.ui.tabs || [];
}

/** Uloží stav aktuálního turnaje do jeho záložky. */
export function syncTab() {
  if (!session.tnr) return;
  store.update((s) => {
    const t = (s.ui.tabs || []).find((x) => x.tnr === session.tnr);
    if (!t) return;
    Object.assign(t, {
      templateId: session.templateId,
      round: session.round,
      group: session.group,
      profileId: s.activeProfileId,
      title: (session.rootInfo && session.rootInfo.title) || t.title,
    });
    s.ui.activeTab = session.tnr;
  }, { silent: true });
}

/** Přidá záložku nového turnaje (stav se doplní při syncTab). */
export function addTab(tnr, title) {
  store.update((s) => {
    s.ui.tabs = [...(s.ui.tabs || []), {
      tnr, title: title || '', profileId: s.activeProfileId, templateId: session.templateId, round: 'auto', group: tnr,
    }];
  }, { silent: true });
}

/** Nastaví appku podle záložky (profil, výstup, kolo, skupina). */
export function applyTab(tab) {
  if (tab.profileId && store.state.profiles.some((p) => p.id === tab.profileId)) store.setActiveProfile(tab.profileId);
  renderProfileSelect();
  if (tab.templateId && getTemplate(tab.templateId)) session.templateId = tab.templateId;
  session.round = tab.round ?? 'auto';
  session.group = tab.group ?? tab.tnr;
  refreshSettings();
}

export function saveSnapshot(tnr) {
  store.saveSnapshot(tnr, source.snapshot(tnr), tabList().map((t) => t.tnr));
}

/** Přepne na záložku turnaje (data z paměti, z uložených dat, nebo stáhne znovu). */
export async function switchTab(tnr) {
  if (tnr === session.tnr || session.busy) return;
  let fromSnapshot = !!source.peek(tnr, 'main');
  let snap = null;
  if (!fromSnapshot) {
    snap = store.loadSnapshot(tnr);
    if (snap && snap.data) { source.restore(snap.data); fromSnapshot = true; }
  }
  await loadTournament({ tnr }, { fromSnapshot });
  if (snap && session.tnr === tnr && !els.status.classList.contains('error')) {
    setStatus(`Zobrazena data z ${fmtDateTime(snap.savedAt)} – pro aktuální stav klikněte na „Aktualizovat data“.`);
  }
}

export function closeTab(tnr) {
  const list = tabList();
  const i = list.findIndex((t) => t.tnr === tnr);
  if (i < 0) return;
  if (tnr === session.tnr) syncTab();
  store.update((s) => {
    s.ui.tabs = s.ui.tabs.filter((t) => t.tnr !== tnr);
    if (s.ui.activeTab === tnr) s.ui.activeTab = null;
  }, { silent: true });
  if (tnr === session.tnr) {
    const rest = tabList();
    const next = rest[Math.min(i, rest.length - 1)];
    showEmpty();
    if (next) switchTab(next.tnr);
  }
  renderTabs();
  renderRecent();
}

/** Prázdná plocha – nový turnaj (záložka vznikne po stažení). */
export function showEmpty() {
  syncTab();
  session.tnr = null;
  session.rootInfo = null;
  session.group = null;
  session.round = 'auto';
  session.renderSeq += 1;
  els.input.value = '';
  els.pages.innerHTML = EMPTY_PAGES_HTML;
  els.pages.style.cssText = '';
  els.pageCount.textContent = '';
  els.btnPrint.disabled = true;
  setStatus('');
  showWarnings([]);
  renderTournamentInfo();
  renderTemplateList();
  renderOptions();
  renderTabs();
  renderRecent();
  renderPrintMark();
}

export function renderTabs() {
  const box = $('#tabs');
  if (!box) return;
  clear(box);
  const profName = (id) => (store.state.profiles.find((p) => p.id === id) || store.profile).name;
  for (const t of tabList()) {
    const active = t.tnr === session.tnr;
    const label = t.title || `Turnaj ${t.tnr}`;
    box.append(h('div', { class: `tab${active ? ' active' : ''}`, role: 'presentation' },
      h('button', {
        type: 'button', class: 'tab-main', role: 'tab', 'aria-selected': String(active),
        title: `${label} (${t.tnr}) · profil ${profName(t.profileId)}`,
        onclick: () => switchTab(t.tnr),
      }, h('span', { class: 'tab-title' }, label), h('span', { class: 'tab-prof' }, profName(t.profileId))),
      h('button', { type: 'button', class: 'tab-close', title: 'Zavřít turnaj', 'aria-label': `Zavřít ${label}`, onclick: () => closeTab(t.tnr) }, '×')));
  }
  box.append(h('button', {
    type: 'button', class: 'tab-new', title: 'Otevřít další turnaj', 'aria-label': 'Otevřít další turnaj',
    onclick: () => { showEmpty(); els.input.focus(); },
  }, '+'));
}

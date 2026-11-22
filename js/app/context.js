// Sdílený stav appky: nastavení (store), zdroj dat, stav relace a prvky stránky.
// Ostatní moduly v js/app/ si odsud berou, co potřebují.

import { Store, hasSavedState, loadPresets } from '../store.js';
import { Source } from '../source.js';
import { PrintLog } from '../printLog.js';
import { h, clear, $ } from '../ui/dom.js';

// První spuštění (bez uloženého nastavení): přednastavené profily se načtou předem
if (!hasSavedState()) await loadPresets().catch(() => null);

export const store = new Store();
export const source = new Source({ getProxyUrl: () => store.proxyUrl });
export const printLog = new PrintLog();

export const session = {
  tnr: null, // hlavní (zadaný) turnaj
  rootInfo: null, // jeho informace
  group: null, // tnr zvolené skupiny nebo 'all'
  templateId: store.state.ui.lastTemplate || 'pairings',
  round: 'auto',
  busy: false,
  renderSeq: 0,
};

export const els = {
  form: $('#form-load'),
  input: $('#input-tournament'),
  btnLoad: $('#btn-load'),
  recent: $('#recent'),
  tinfo: $('#tournament-info'),
  tplList: $('#template-list'),
  options: $('#options'),
  btnPrint: $('#btn-print'),
  status: $('#status'),
  printMark: $('#print-mark'),
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

export function setStatus(text, kind = '') {
  els.status.textContent = text || '';
  els.status.className = `status ${kind}`;
}

let warningsOpen = false;
/** Upozornění nad náhledem – sbalená na jeden řádek, rozbalí se kliknutím (chyby jsou vždy rozbalené). */
export function showWarnings(list, kind = '') {
  clear(els.warnings);
  if (!list || !list.length) { els.warnings.hidden = true; return; }
  const items = list.map((w) => (w instanceof Node ? w : h('p', {}, '⚠ ', w)));
  const collapsible = kind !== 'error';
  const update = () => {
    els.warnings.className = `warnings ${kind} ${collapsible && !warningsOpen ? 'collapsed' : ''}`.trim();
    if (toggle) toggle.textContent = warningsOpen ? '▴ sbalit' : `▾ ${list.length > 1 ? `zobrazit vše (${list.length})` : 'zobrazit celé'}`;
  };
  const toggle = collapsible ? h('button', { type: 'button', class: 'linklike warn-toggle', onclick: () => { warningsOpen = !warningsOpen; update(); } }) : null;
  els.warnings.append(h('div', { class: 'warn-list' }, items), toggle);
  update();
  els.warnings.hidden = false;
  // Jediné krátké upozornění se vejde celé – tlačítko „zobrazit“ není potřeba
  if (toggle && !warningsOpen && list.length === 1 && items[0].scrollWidth <= items[0].clientWidth + 1) toggle.hidden = true;
}

/** Úprava nastavení šablony v aktivním profilu. */
export function updateTemplateSettings(tplId, fn) {
  store.update((s) => {
    const p = s.profiles.find((x) => x.id === s.activeProfileId);
    p.templates[tplId] = p.templates[tplId] || {};
    fn(p.templates[tplId]);
  }, { silent: true });
}

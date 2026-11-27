// Tlačítko „? O aplikaci“ v horní liště: okno s návodem, novinkami a informacemi o appce.
// Obsah (js/ui/about.js, js/changelog.js) se načte až při otevření okna.

import { store } from './context.js';
import { $ } from '../ui/dom.js';

/** Datum nejnovější položky v js/changelog.js (hlídá test) – podle něj se ukáže tečka „nové“. */
export const LATEST_CHANGE = '2026-11-27';

function hasNews() {
  const seen = store.state.ui.seenChangelog;
  return !seen || seen < LATEST_CHANGE;
}

function renderDot() {
  const dot = $('#btn-about .about-dot');
  if (dot) dot.hidden = !hasNews();
}

/** Otevře okno; bez zadané záložky ukáže Novinky, když jsou nové, jinak Návod. */
export async function openAbout(tab) {
  const dlg = $('#dlg-about');
  if (!dlg) return;
  const seen = store.state.ui.seenChangelog || null;
  const { renderAbout } = await import('../ui/about.js');
  renderAbout(dlg, { tab: tab || (seen && hasNews() ? 'news' : 'guide'), seen, onClose: () => dlg.close() });
  if (!dlg.open) dlg.showModal();
  store.update((s) => { s.ui.seenChangelog = LATEST_CHANGE; }, { silent: true });
  renderDot();
}

export function setupAbout() {
  $('#btn-about')?.addEventListener('click', () => openAbout());
  // Klávesa „?“ otevře návod (mimo pole pro psaní)
  document.addEventListener('keydown', (e) => {
    if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (document.querySelector('dialog[open]')) return;
    e.preventDefault();
    openAbout('guide');
  });
  renderDot();
}

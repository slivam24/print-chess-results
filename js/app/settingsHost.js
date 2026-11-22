// Panel nastavení (⚙). Modul js/ui/settings.js (s průvodcem tiskem) se načítá až při
// prvním otevření panelu – při běžném tisku ho appka nepotřebuje.

import { store, els, session } from './context.js';
import { currentTemplate, renderOptions, renderProfileSelect, renderRecent, renderTemplateList } from './panel.js';
import { syncTab, renderTabs } from './tabs.js';
import { scheduleRender } from './preview.js';

/** Panel nastavení, když už je vytvořený (jinak null). */
export let settingsPanel = null;
let loading = null;

async function ensurePanel() {
  if (settingsPanel) return settingsPanel;
  if (!loading) {
    loading = import('../ui/settings.js').then(({ SettingsPanel }) => {
      settingsPanel = new SettingsPanel(els.sideSettings, {
        store,
        getTemplate: currentTemplate,
        testProxy,
        onClose: closeSettings,
        onChange: (ev = {}) => {
          renderProfileSelect();
          syncTab();
          renderTabs(); // název profilu v záložce
          if (ev.proxyChanged) renderRecent();
          // nabídka výstupů a rychlá tlačítka se mohla změnit (schované výstupy, orientace, písmo)
          if (session.rootInfo) renderTemplateList();
          scheduleRender();
        },
      });
      return settingsPanel;
    }).catch((e) => { loading = null; throw e; });
  }
  return loading;
}

/** Je panel nastavení otevřený? */
export function settingsOpen() {
  return !!settingsPanel && !els.sideSettings.hidden;
}

/** Překreslí otevřený panel nastavení (např. po změně výstupu nebo profilu). */
export function refreshSettings() {
  if (settingsOpen()) settingsPanel.render();
}

export async function openSettings(tab) {
  els.btnSettings.setAttribute('aria-pressed', 'true');
  const panel = await ensurePanel();
  els.sideMain.hidden = true;
  els.sideSettings.hidden = false;
  panel.show(tab);
}

export function closeSettings() {
  els.sideSettings.hidden = true;
  els.sideMain.hidden = false;
  els.btnSettings.setAttribute('aria-pressed', 'false');
  renderOptions();
}

export function toggleSettings() {
  return els.sideSettings.hidden ? openSettings() : closeSettings();
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

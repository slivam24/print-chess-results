// Spuštění appky. Jednotlivé části jsou v js/app/:
//   context.js     – sdílený stav (nastavení, zdroj dat, relace, prvky stránky)
//   loader.js      – načtení turnaje a aktualizace dat
//   tabs.js        – záložky turnajů v horní liště
//   panel.js       – levý panel (turnaj, výstupy, možnosti, naposledy otevřené)
//   preview.js     – náhled (data → dokument → stránky), kontrola výsledků
//   printing.js    – značka „vytištěno“ a název PDF
//   settingsHost.js – panel nastavení (načítá se až při otevření)
//   controls.js    – posuvník panelu, klávesové zkratky, ruční vložení HTML

import { store, source, session, els, setStatus } from './app/context.js';
import { TEMPLATES } from './templates/index.js';
import { checkForUpdate } from './ui/update.js';
import { debounce } from './ui/dom.js';
import { loadTournament } from './app/loader.js';
import { tabList, syncTab, renderTabs, switchTab } from './app/tabs.js';
import { renderProfileSelect, renderRecent, renderTemplateList, renderTournamentHeading, selectTemplate } from './app/panel.js';
import { refreshPreview, scheduleRender, applyZoom } from './app/preview.js';
import { openSettings, toggleSettings, refreshSettings } from './app/settingsHost.js';
import { setupSplitter, setupShortcuts, setupManualDialog } from './app/controls.js';
import { setupPrinting } from './app/printing.js';
import { setupAbout } from './app/aboutHost.js';

function init() {
  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    loadTournament(els.input.value);
  });
  els.btnPrint.addEventListener('click', () => window.print());
  document.querySelector('#btn-print-setup').addEventListener('click', () => openSettings('print'));
  els.btnSettings.addEventListener('click', () => toggleSettings());
  els.profileSelect.addEventListener('change', (e) => {
    store.setActiveProfile(e.target.value);
    syncTab();
    renderTabs();
    renderTemplateList();
    renderTournamentHeading(); // šedá nápověda „podle profilu“
    refreshSettings();
    scheduleRender();
  });
  els.zoom.value = store.state.ui.previewZoom || 'page';
  setupSplitter();
  els.zoom.addEventListener('change', applyZoom);
  window.addEventListener('resize', debounce(applyZoom, 150));
  window.addEventListener('beforeunload', () => store.flush());

  setupManualDialog();
  setupShortcuts();
  setupPrinting();
  setupAbout();
  renderProfileSelect();

  // Starší verze appky si pamatovala jen jeden turnaj – udělá se z něj záložka
  if (!tabList().length) {
    const old = store.loadSnapshot();
    if (old && old.tnr) {
      store.update((s) => {
        s.ui.tabs = [{ tnr: old.tnr, title: '', profileId: s.activeProfileId, templateId: session.templateId, round: 'auto', group: old.tnr }];
        s.ui.activeTab = old.tnr;
      }, { silent: true });
    }
  }
  renderTabs();
  renderRecent();
  // Odkaz s ?t=číslo otevře turnaj rovnou (v nové záložce, nebo přepne na otevřenou)
  const qp = new URLSearchParams(location.search).get('t');
  const startTab = tabList().find((t) => t.tnr === store.state.ui.activeTab) || tabList()[0];
  if (qp) {
    loadTournament(qp);
  } else if (startTab) {
    switchTab(startTab.tnr);
  }
}

init();
// Novější verze appky na serveru? (prohlížeč mohl spustit starou z mezipaměti)
setTimeout(() => { checkForUpdate({ onReload: (t) => setStatus(t, 'loading') }); }, 800);

// Pro ladění v konzoli a automatické testy (tests/e2e)
window.chessPrint = {
  store, source, session, TEMPLATES,
  loadTournament, refreshPreview, selectTemplate, switchTab, renders: 0,
};

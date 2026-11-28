// Načtení turnaje z chess-results (přes proxy), aktualizace dat a hlášení chyb.

import { store, source, session, els, setStatus, showWarnings } from './context.js';
import { parseTournamentInput, buildUrl, DATASETS, FetchError } from '../source.js';
import { getTemplate } from '../templates/index.js';
import { h, $ } from '../ui/dom.js';
import { tabList, syncTab, applyTab, addTab, renderTabs, saveSnapshot } from './tabs.js';
import { visibleTemplates, renderRecent, renderTournamentInfo, renderTournamentHeading, renderTemplateList, renderOptions } from './panel.js';
import { refreshPreview, targetTnrs } from './preview.js';

export async function loadTournament(input, { fresh = false, fromSnapshot = false } = {}) {
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
    if (info.notFound || (!info.title && !(main.data.players || []).length && !info.menu.length)) {
      source.invalidate(parsed.tnr);
      throw new FetchError(`Turnaj ${parsed.tnr} se na chess-results nepodařilo najít${info.notFound ? ' („Record not found“) – možná byl smazán, skrytý, nebo má nové číslo' : ''}.`);
    }
    const changed = session.tnr !== parsed.tnr;
    // Jiný turnaj = jiná záložka: uložíme stav té dosavadní a otevřeme / přepneme na záložku turnaje
    let restored = false;
    if (changed) {
      syncTab();
      const tab = tabList().find((t) => t.tnr === parsed.tnr);
      if (tab) {
        applyTab(tab);
        restored = true;
      } else {
        addTab(parsed.tnr, info.title);
      }
    }
    session.tnr = parsed.tnr;
    session.rootInfo = info;
    if (changed && !restored) {
      session.group = parsed.tnr;
      session.round = 'auto';
    }
    if (changed) {
      if (parsed.rd) session.round = parsed.rd;
      const hint = templateFromArt(parsed.art, info);
      if (hint) session.templateId = hint;
    }
    if (!getTemplate(session.templateId) || !getTemplate(session.templateId).supports(info)) {
      session.templateId = visibleTemplates(info)[0].id;
    }
    // Před zveřejněním losu (a ne u kruhového systému, kde je los znám předem) začneme seznamy
    const tpl0 = getTemplate(session.templateId);
    if (changed && !restored && !parsed.art && !info.lastPairedRound && info.system !== 'roundrobin' && tpl0.roundMode === 'pairings') {
      session.templateId = info.isTeam ? 'team-roster' : 'startlist';
    }
    if (!fromSnapshot) store.addRecent(parsed.tnr, info.title);
    els.input.value = String(parsed.tnr);
    renderTournamentInfo();
    renderTournamentHeading();
    renderTemplateList();
    syncTab();
    renderTabs();
    renderRecent();
    await refreshPreview({ fresh });
    if (!fromSnapshot) saveSnapshot(parsed.tnr);
  } catch (e) {
    reportError(e, parsed.tnr);
  } finally {
    setBusy(false);
  }
}

function templateFromArt(art, info) {
  if (art == null) return null;
  if (info.isTeam) return { 0: 'team-ranking', 2: 'team-matches', 3: 'team-boards', 46: 'team-ranking', 32: 'team-roster', 16: 'team-roster', 81: 'team-board-best' }[art] || null;
  return { 0: 'startlist', 1: 'ranking', 2: 'pairings', 3: 'startlist', 4: 'ranking', 71: 'team-composition', 72: 'club-ranking' }[art] || null;
}

/** „Aktualizovat data“: stáhne znovu aktuální stav z chess-results. */
export async function refreshData() {
  if (!session.tnr) return;
  setBusy(true);
  for (const t of new Set([session.tnr, ...targetTnrs()])) source.invalidate(t);
  try {
    const main = await source.get(session.tnr, 'main', null, { fresh: true });
    session.rootInfo = main.info;
    renderOptions();
    await refreshPreview({ fresh: true });
    saveSnapshot(session.tnr);
  } catch (e) {
    reportError(e, session.tnr);
  } finally {
    setBusy(false);
    renderTournamentInfo();
  }
}

export function reportError(e, tnr, dataset, round) {
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

export function setBusy(b) {
  session.busy = b;
  els.btnLoad.disabled = b;
  const upd = $('#btn-refresh');
  if (upd) upd.disabled = b;
}

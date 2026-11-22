// Tisk: značka „vytištěno“ (a „změnilo se od tisku“) a název PDF při „Uložit jako PDF“.
// Prohlížeč neprozradí, zda uživatel dialog tisku potvrdil, nebo zrušil – značka se proto dá
// kliknutím zrušit.

import { session, els, printLog } from './context.js';
import { printKey, pdfTitle } from '../printLog.js';
import { fmtWhen } from '../templates/common.js';
import { clear, h } from '../ui/dom.js';
import { current, groupName } from './preview.js';
import { resolvedRound, refreshTileMarks } from './panel.js';

/** Klíč výstupu pro záznam o tisku (aktuální turnaj a skupina). */
export function printKeyFor(tpl, round) {
  const r = [...new Set(String(round ?? '').split(','))].join(',');
  return printKey({ tnr: session.tnr, group: session.group, templateId: tpl.id, round: r });
}

/** Stav tisku výstupu pro dlaždici v nabídce: null, { state: 'printed' | 'changed', at }. */
export function outputPrintStatus(tpl) {
  if (!session.tnr) return null;
  // Zobrazený výstup: i s porovnáním dat (current se vynuluje při každém novém náhledu)
  if (current && current.tpl.id === tpl.id) return printLog.status(current.key, current.hash);
  return printLog.status(printKeyFor(tpl, resolvedRound(tpl)));
}

/** Značka vedle počtu stránek: „✓ Vytištěno 14:32“ / „Data se od tisku změnila“. */
export function renderPrintMark() {
  const el = els.printMark;
  if (!el) return;
  clear(el);
  refreshTileMarks();
  const st = current && session.tnr && current.docs.length ? printLog.status(current.key, current.hash) : null;
  el.hidden = !st;
  if (!st) return;
  const when = fmtWhen(st.at);
  el.className = `print-mark ${st.state}`;
  el.append(st.state === 'changed' ? `⚠ Od tisku (${when}) se data změnila` : `✓ Vytištěno ${when}`);
  el.title = st.state === 'changed'
    ? 'Tento výstup už jste vytiskl, ale data na chess-results se od té doby změnila (např. opravený výsledek). Kliknutím značku zrušíte.'
    : 'Tento výstup (toto kolo) už jste vytiskl a data se od té doby nezměnila. Kliknutím značku zrušíte (např. když jste tisk v dialogu zrušil).';
}

function unmarkCurrent() {
  if (!current) return;
  printLog.unmark(current.key);
  renderPrintMark();
}

/** Název PDF podle obsahu (turnaj, skupina, výstup). */
export function currentPdfTitle() {
  const info = session.rootInfo;
  if (!current || !info) return null;
  let group = '';
  if (session.group === 'all' && info.groups.length > 1) group = 'všechny skupiny';
  else if (info.groups.length > 1 && session.group && session.group !== session.tnr) group = groupName(session.group) || '';
  const doc = current.docs[0];
  return pdfTitle({ tournament: info.title || `Turnaj ${session.tnr}`, group, output: doc ? doc.title : current.tpl.name });
}

export function setupPrinting() {
  let savedTitle = null;
  // „beforeprint“ přijde při tlačítku Tisknout i při Ctrl+P
  window.addEventListener('beforeprint', () => {
    const title = currentPdfTitle();
    if (title) {
      savedTitle = document.title;
      document.title = title; // Chrome/Edge z titulku navrhne název souboru PDF
    }
    if (current && current.docs.length && !els.btnPrint.disabled) printLog.mark(current.key, current.hash);
  });
  window.addEventListener('afterprint', () => {
    if (savedTitle != null) document.title = savedTitle;
    savedTitle = null;
    renderPrintMark();
  });
  els.printMark?.addEventListener('click', unmarkCurrent);
}

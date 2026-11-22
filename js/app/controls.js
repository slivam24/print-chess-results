// Ovládání mimo panel: posuvník šířky panelu, klávesové zkratky a ruční vložení HTML.

import { store, source, session, els } from './context.js';
import { DATASETS } from '../source.js';
import { h, clear, $, readFileText } from '../ui/dom.js';
import { applyZoom, refreshPreview } from './preview.js';
import { visibleTemplates, selectTemplate, stepRound, renderTournamentInfo, renderTemplateList } from './panel.js';
import { loadTournament } from './loader.js';

/** Posuvník mezi panelem a náhledem – šířka panelu se pamatuje. */
export function setupSplitter() {
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

/** Klávesové zkratky: ← / → kolo, 1–9 výstup v pořadí nabídky. */
export function setupShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (document.querySelector('dialog[open]') || !session.rootInfo) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      stepRound(e.key === 'ArrowLeft' ? -1 : 1);
    } else if (/^[1-9]$/.test(e.key)) {
      const tpl = visibleTemplates(session.rootInfo)[Number(e.key) - 1];
      if (tpl) { e.preventDefault(); selectTemplate(tpl.id); }
    }
  });
}

/** Ruční vložení uložených stránek chess-results (když proxy nefunguje). */
export function setupManualDialog() {
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

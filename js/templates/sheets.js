// Rozhodcovský list kola a výsledkové lístky.

import {
  esc, fmtName, fmtRating, fmtPoints, fmtResult, theadRow, colgroup, bodyRow, byeLabel, noteBlock, fmtDate,
} from './common.js';
import { pickRound, enrichPairings } from './pairings.js';

function roundSub(round) {
  if (!round) return '';
  return [round.date ? fmtDate(round.date) : '', round.time || ''].filter(Boolean).join(', ');
}

// ---------------------------------------------------------------------------
// Rozhodcovský list – dvojice s prázdnými kolonkami na výsledek a poznámku
// ---------------------------------------------------------------------------

const ARB_COLUMNS = [
  { key: 'board', label: 'Š.', cls: 'c num strong', width: '2.4em', get: (p) => esc(p.board ?? '') },
  { key: 'wNo', label: 'č.', cls: 'c num muted', width: '2.4em', get: (p) => esc(p.white?.startNo ?? '') },
  { key: 'wName', label: 'Bílý', cls: 'name', get: (p, ctx) => esc(fmtName(p.white?.name, ctx.nameFormat)) },
  { key: 'wRating', hideEmpty: true, label: 'Elo', cls: 'r num', def: false, get: (p) => fmtRating(p.white?.rating) },
  { key: 'wPoints', label: 'B.', cls: 'c num', def: false, get: (p) => fmtPoints(p.white?.points) },
  { key: 'bNo', label: 'č.', cls: 'c num muted', width: '2.4em', get: (p) => esc(p.black?.startNo ?? '') },
  { key: 'bName', label: 'Černý', cls: 'name', get: (p, ctx) => (p.black ? esc(fmtName(p.black.name, ctx.nameFormat)) : `<span class="bye">${esc(byeLabel(p.bye))}</span>`) },
  { key: 'bRating', hideEmpty: true, label: 'Elo', cls: 'r num', def: false, get: (p) => fmtRating(p.black?.rating) },
  { key: 'bPoints', label: 'B.', cls: 'c num', def: false, get: (p) => (p.black ? fmtPoints(p.black.points) : '') },
  { key: 'result', label: 'Výsledek', cls: 'c res write', width: '6em', get: (p, ctx) => (ctx.opts.prefill ? esc(fmtResult(p.result)) : p.black ? '' : esc(p.result?.text || '')) },
  { key: 'check', label: '✓', cls: 'c write', width: '2em', get: () => '' },
  { key: 'note', label: 'Poznámka', cls: 'write', width: '22%', get: () => '' },
];

export const arbiterSheet = {
  id: 'arbiter-sheet',
  name: 'Rozhodcovský list kola',
  description: 'Dvojice s prázdnými kolonkami pro zápis výsledků a poznámek rozhodčího.',
  group: 'Pro rozhodčí',
  supports: (info) => !info.isTeam,
  roundMode: 'pairings',
  options: [
    { key: 'rowHeight', label: 'Výška řádku (mm)', type: 'number', def: 8, min: 5, max: 20 },
    { key: 'prefill', label: 'Předvyplnit známé výsledky', type: 'bool', def: false },
    { key: 'showByes', label: 'Uvést volno a nenasazené hráče', type: 'bool', def: true },
    { key: 'signature', label: 'Kolonka pro podpis rozhodčího', type: 'bool', def: true },
  ],
  columns: ARB_COLUMNS,
  defaults: { orientation: 'portrait', columns: 1 },
  needs: ({ round }) => [{ dataset: 'main' }, { dataset: 'pairings', round }],
  render({ info, data, round: rq, opts, cols, nameFormat }) {
    const round = pickRound(data.pairings, rq);
    const list = enrichPairings(round, data.main?.players).filter((p) => opts.showByes !== false || p.black);
    const ctx = { opts, nameFormat };
    const h = Math.max(4, Number(opts.rowHeight) || 8);
    const blocks = [];
    if (list.length) {
      blocks.push({
        type: 'table',
        className: 'grid arbiter',
        colgroup: colgroup(cols),
        thead: theadRow(cols),
        rows: list.map((p) => bodyRow(cols, p, ctx, p.black ? '' : 'bye-row').replace('<tr', `<tr style="height:${h}mm"`)),
      });
    } else {
      blocks.push(noteBlock('Pro toto kolo nejsou k dispozici žádné dvojice.'));
    }
    if (opts.signature !== false) {
      blocks.push({
        type: 'html',
        html: `<div class="signs"><div>Začátek kola: ____________</div><div>Konec kola: ____________</div><div class="sign">Podpis rozhodčího</div></div>`,
      });
    }
    const warnings = !round || !round.pairings.length ? [`Los ${rq}. kola zatím není na chess-results zveřejněn.`] : [];
    return { title: `Rozhodcovský list – ${rq}. kolo`, sub: roundSub(round), blocks, warnings };
  },
};

// ---------------------------------------------------------------------------
// Výsledkové lístky – jeden lístek na šachovnici, několik na stránku
// ---------------------------------------------------------------------------

function slip(p, { info, rq, round, opts, nameFormat, heightMm }) {
  const player = (s, color) => `
    <div class="sl-player">
      <div class="sl-color">${color}</div>
      <div class="sl-name">${s ? `${s.startNo != null ? `<span class="sl-no">${esc(s.startNo)}</span>` : ''}${esc(fmtName(s.name, nameFormat))}${opts.showPoints && s.points != null ? ` <span class="muted">(${fmtPoints(s.points)})</span>` : ''}` : '&nbsp;'}</div>
      ${opts.signatures !== false ? '<div class="sl-sign">podpis</div>' : ''}
    </div>`;
  const boxes = ['1 – 0', '½ – ½', '0 – 1']
    .map((r) => `<span class="sl-box"><span class="sq"></span>${r}</span>`)
    .join('');
  return `<div class="slip" style="height:${heightMm}mm">
    <div class="sl-head">
      <span class="sl-tour">${esc(opts.shortTitle || info.title || '')}</span>
      <span class="sl-round">${esc(rq)}. kolo${round?.date ? ` · ${esc(fmtDate(round.date))}` : ''}</span>
      <span class="sl-board">Šachovnice <b>${esc(p.board ?? '')}</b></span>
    </div>
    ${player(p.white, 'Bílý')}
    ${player(p.black, 'Černý')}
    <div class="sl-result"><span class="lbl">Výsledek:</span>${boxes}${opts.showResults && p.result?.played ? `<span class="sl-known">${esc(fmtResult(p.result))}</span>` : ''}</div>
  </div>`;
}

export const scoreSlips = {
  id: 'scoresheets',
  name: 'Výsledkové lístky',
  description: 'Prázdné lístky pro hráče k vyplnění výsledku – několik na stránku, k rozstříhání.',
  group: 'Pro rozhodčí',
  supports: (info) => !info.isTeam,
  roundMode: 'pairings',
  options: [
    { key: 'perPage', label: 'Lístků na stránku', type: 'select', def: '8', choices: [['4', '4'], ['5', '5'], ['6', '6'], ['8', '8 (2 sloupce)'], ['10', '10 (2 sloupce)'], ['12', '12 (2 sloupce)']] },
    { key: 'showPoints', label: 'Uvést body hráčů', type: 'bool', def: false },
    { key: 'signatures', label: 'Kolonky pro podpis', type: 'bool', def: true },
    { key: 'shortTitle', label: 'Název na lístku (prázdné = název turnaje)', type: 'text', def: '' },
  ],
  columns: [],
  defaults: { orientation: 'portrait', columns: 1 },
  needs: ({ round }) => [{ dataset: 'main' }, { dataset: 'pairings', round }],
  layout: (opts, page) => {
    const n = Number(opts.perPage) || 8;
    return { header: null, footer: null, columns: n >= 8 ? 2 : 1, columnGap: 0, docClass: 'slips-doc' };
  },
  render({ info, data, round: rq, opts, nameFormat, page }) {
    const round = pickRound(data.pairings, rq);
    const list = enrichPairings(round, data.main?.players).filter((p) => p.black);
    const n = Number(opts.perPage) || 8;
    const perCol = n >= 8 ? n / 2 : n;
    const m = page.margins;
    const [, hMm] = page.orientation === 'landscape' ? [297, 210] : [210, 297];
    const heightMm = Math.floor(((hMm - m.top - m.bottom) / perCol - 0.6) * 10) / 10;
    const blocks = list.map((p) => ({ type: 'html', html: slip(p, { info, rq, round, opts, nameFormat, heightMm }) }));
    if (!blocks.length) blocks.push(noteBlock('Pro toto kolo nejsou k dispozici žádné dvojice.'));
    const warnings = !round || !round.pairings.length ? [`Los ${rq}. kola zatím není na chess-results zveřejněn.`] : [];
    return { title: `Výsledkové lístky – ${rq}. kolo`, sub: '', blocks, warnings };
  },
};

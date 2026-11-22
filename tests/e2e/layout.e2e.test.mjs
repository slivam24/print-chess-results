// Automatické testy vzhledu v prohlížeči (Playwright): appka nad uloženými stránkami chess-results
// (tests/fixtures, bez sítě) vysází výstupy ve všech režimech písma a orientacích a hlídá,
// že se nic neořezává na okraji stránky a že se v tabulkách s pevnými sloupci nic nezkrátí.
// Spuštění: npm run test:e2e   (potřebuje Playwright s prohlížečem Chromium)

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = (n) => fs.readFileSync(path.join(root, 'tests/fixtures', `${n}.html`), 'utf8');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

let server;
let browser;
let base;

before(async () => {
  server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const f = path.join(root, u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.close();
});

/** Otevře appku, vloží uložené stránky turnaje a načte ho. */
async function openTournament(fixtures) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // žádná síť mimo appku (chess-results, proxy)
  await page.route('**/*', (route) => (route.request().url().startsWith(base) ? route.continue() : route.abort()));
  await page.goto(base);
  // appka se spouští asynchronně (při prvním spuštění načítá přednastavené profily)
  await page.waitForFunction(() => window.chessPrint);
  const tnr = await page.evaluate(async (htmls) => {
    const cp = window.chessPrint;
    let t = null;
    for (const html of htmls) t = cp.source.addManualHtml(html).tnr || t;
    await cp.loadTournament({ tnr: t }, { fromSnapshot: true });
    return t;
  }, fixtures.map(fixture));
  return { page, errors, tnr };
}

/** Vysází výstup s danými volbami a vrátí kontrolu ořezu. */
async function render(page, tplId, { round = 'auto', orientation, fontMode, options } = {}) {
  return page.evaluate(async ({ tplId, round, orientation, fontMode, options }) => {
    const cp = window.chessPrint;
    cp.store.update((s) => {
      const p = s.profiles.find((x) => x.id === s.activeProfileId);
      p.templates[tplId] = { ...(p.templates[tplId] || {}), orientation, fontMode, options: { ...((p.templates[tplId] || {}).options || {}), ...(options || {}) } };
    }, { silent: true });
    cp.session.round = round;
    const before = cp.renders;
    cp.selectTemplate(tplId);
    const t0 = performance.now();
    while (cp.renders === before && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 25));
    const pages = [...document.querySelectorAll('#pages .page')];
    const problems = [];
    for (const col of document.querySelectorAll('#pages .pg-col')) {
      const c = col.getBoundingClientRect();
      for (const k of col.children) {
        const r = k.getBoundingClientRect();
        if (r.bottom > c.bottom + 0.5 || r.right > c.right + 0.5) problems.push(`přetéká o ${Math.round(Math.max(r.bottom - c.bottom, r.right - c.right))} px: ${k.textContent.trim().slice(0, 40)}`);
      }
    }
    // Tabulka rozdělená na více stránek / sloupců: stejné šířky sloupců ve všech kusech
    const cols = [...document.querySelectorAll('#pages .pg-col')];
    for (let i = 1; i < cols.length; i++) {
      const prevTables = cols[i - 1].querySelectorAll('table');
      const prev = prevTables[prevTables.length - 1];
      const first = cols[i].firstElementChild && cols[i].firstElementChild.querySelector('table');
      if (!prev || !first || !prev.tHead || !first.tHead || prev.tHead.innerHTML !== first.tHead.innerHTML) continue;
      const w = (t) => [...t.tHead.rows[0].cells].map((c) => Math.round(c.getBoundingClientRect().width));
      const a = w(prev); const b = w(first);
      if (a.some((x, j) => Math.abs(x - b[j]) > 1)) problems.push(`jiné šířky sloupců na další stránce: ${a.join(',')} × ${b.join(',')}`);
    }
    if (fontMode !== 'fixed') {
      for (const cell of document.querySelectorAll('#pages table.sym td, #pages table.one-line th')) {
        if (!cell.firstChild) continue;
        const range = document.createRange();
        range.selectNodeContents(cell);
        const cs = getComputedStyle(cell);
        const avail = cell.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        if (cs.whiteSpace === 'nowrap' && range.getBoundingClientRect().width > avail + 0.5) problems.push(`zkrácený text: ${cell.textContent.trim().slice(0, 30)}`);
      }
    }
    return { rendered: cp.renders > before, pages: pages.length, status: document.querySelector('#status').textContent, problems };
  }, { tplId, round, orientation, fontMode, options });
}

const MODES = ['fixed', 'max', 'page'];
const ORIENTS = ['portrait', 'landscape'];

async function checkAll(t, page, outputs) {
  for (const [tplId, extra] of outputs) {
    for (const orientation of ORIENTS) {
      for (const fontMode of MODES) {
        const r = await render(page, tplId, { ...extra, orientation, fontMode });
        const label = `${tplId} ${extra.round ?? ''} ${orientation} ${fontMode}`;
        assert.ok(r.rendered, `${label}: náhled se nevykreslil (${r.status})`);
        assert.ok(r.pages > 0, `${label}: žádná stránka`);
        assert.deepEqual(r.problems, [], label);
      }
    }
  }
}

test('jednotlivci – švýcarský systém', async (t) => {
  const { page, errors } = await openTournament(['swiss-main', 'swiss-pairings-r7', 'swiss-ranking-r6']);
  await checkAll(t, page, [
    ['startlist', {}], ['alphalist', {}],
    ['ranking', { round: 6 }],
    ['ranking-cat', { round: 6, options: { categories: [{ name: 'Výběr', types: [], groups: [], sex: [] }] } }],
    ['pairings', { round: 7 }], ['pairings-board', { round: 7 }], ['pairings-alpha', { round: 7 }],
    ['arbiter-sheet', { round: 7 }], ['scoresheets', { round: 7 }],
    ['awards', { round: 6 }],
  ]);
  assert.deepEqual(errors, []);
  await page.close();
});

test('jednotlivci – každý s každým: los všech kol, křížová tabulka', async (t) => {
  const { page, errors } = await openTournament(['rr-main', 'rr-pairings-r1', 'rr-crosstable']);
  await checkAll(t, page, [
    ['pairings', { round: 'all' }], ['pairings', { round: 2 }],
    ['crosstable', {}], ['crosstable', { options: { sort: 'startNo', results: false } }],
  ]);
  assert.deepEqual(errors, []);
  await page.close();
});

test('družstva', async (t) => {
  const { page, errors } = await openTournament(['team-main', 'team-boards-r3', 'team-pairings-r3', 'team-players', 'team-teams', 'team-table', 'team-boardlist']);
  await checkAll(t, page, [
    ['team-matches', { round: 3 }], ['team-boards', { round: 3 }],
    ['team-startlist', {}], ['team-roster', {}], ['team-ranking', {}],
    ['team-board-best', {}], ['team-board-best', { options: { places: '3', boardPerPage: true } }],
  ]);
  // Nejlepší na šachovnicích: všechny šachovnice mají stejné šířky sloupců
  for (const fontMode of ['fixed', 'max', 'page']) {
    await render(page, 'team-board-best', { fontMode, options: { places: 'all', boardPerPage: false } });
    const widths = await page.evaluate(() => [...document.querySelectorAll('#pages table')]
      .map((t) => [...t.rows[0].cells].map((c) => Math.round(c.getBoundingClientRect().width)).join(',')));
    assert.ok(widths.length >= 4, `${fontMode}: ${widths.length} tabulek`);
    assert.equal(new Set(widths).size, 1, `${fontMode}: různé šířky sloupců ${widths.join(' × ')}`);
  }
  assert.deepEqual(errors, []);
  await page.close();
});

// Testy ovládání appky v prohlížeči (Playwright) nad uloženými stránkami chess-results
// (tests/fixtures, bez sítě): záložky turnajů s vlastním profilem, naposledy otevřené turnaje,
// značka „vytištěno“ a název PDF, klávesové zkratky, export a import profilů.
// Spuštění: npm run test:e2e

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
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
const SWISS = ['swiss-main', 'swiss-pairings-r7', 'swiss-ranking-r6', 'swiss-pairings-r6'];
const RR = ['rr-main', 'rr-pairings-r1', 'rr-crosstable'];

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

async function newApp() {
  const context = await browser.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  const requested = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => requested.push(new URL(r.url()).pathname));
  await page.route('**/*', (route) => (route.request().url().startsWith(base) ? route.continue() : route.abort()));
  await page.goto(base);
  await page.waitForFunction(() => window.chessPrint);
  return { page, errors, requested, context };
}

/** Vloží uložené stránky a otevře turnaj jako uživatel (přidá se i do naposledy otevřených). */
async function open(page, names) {
  return page.evaluate(async (htmls) => {
    const cp = window.chessPrint;
    let t = null;
    for (const html of htmls) t = cp.source.addManualHtml(html).tnr || t;
    await cp.loadTournament({ tnr: t });
    return t;
  }, names.map(fixture));
}

/** Provede akci a počká na nové vysázení náhledu. */
async function rendered(page, action) {
  const before = await page.evaluate(() => window.chessPrint.renders);
  await action();
  await page.waitForFunction((b) => window.chessPrint.renders > b, before, { timeout: 15000 });
}

test('záložky turnajů si pamatují výstup, kolo a profil; naposledy otevřené', async () => {
  const { page, errors, context } = await newApp();
  const swiss = await open(page, SWISS);
  await rendered(page, () => page.locator('.tpl', { hasText: /^Pořadí\d*$/ }).first().click());
  const rr = await open(page, RR);
  assert.notEqual(swiss, rr);
  assert.equal(await page.locator('#tabs .tab').count(), 2);
  // Druhý turnaj: křížová tabulka a jiný profil
  await rendered(page, () => page.locator('.tpl', { hasText: 'Křížová tabulka' }).click());
  const profiles = await page.locator('#profile-select option').evaluateAll((o) => o.map((x) => x.value));
  await rendered(page, () => page.selectOption('#profile-select', profiles[1]));

  // Přepnutí kliknutím na záložku
  await rendered(page, () => page.locator('#tabs .tab-main').nth(0).click());
  let s = await page.evaluate(() => ({ tnr: window.chessPrint.session.tnr, tpl: window.chessPrint.session.templateId }));
  assert.deepEqual(s, { tnr: swiss, tpl: 'ranking' });
  assert.equal(await page.inputValue('#profile-select'), profiles[0]);
  await rendered(page, () => page.locator('#tabs .tab:not(.active) .tab-main').click());
  s = await page.evaluate(() => ({ tnr: window.chessPrint.session.tnr, tpl: window.chessPrint.session.templateId }));
  assert.deepEqual(s, { tnr: rr, tpl: 'crosstable' });
  assert.equal(await page.inputValue('#profile-select'), profiles[1]);
  assert.match(await page.locator('#tabs .tab.active .tab-prof').innerText(), /\S/);

  // Naposledy otevřené: oba turnaje, označené jako otevřené (sbalené, když je turnaj načtený)
  await page.locator('#recent summary').click();
  assert.equal(await page.locator('#recent .recent-list li').count(), 2);
  assert.equal(await page.locator('#recent .recent-list li.open').count(), 2);

  // Zavření záložky → zůstane jeden turnaj; v naposledy otevřených už není „otevřený“
  await rendered(page, () => page.locator('#tabs .tab.active .tab-close').click());
  assert.equal(await page.locator('#tabs .tab').count(), 1);
  assert.equal(await page.evaluate(() => window.chessPrint.session.tnr), swiss);
  await page.locator('#recent summary').click();
  assert.equal(await page.locator('#recent .recent-list li.open').count(), 1);
  // Znovu otevření ze seznamu (nová záložka převezme právě zvolený výstup – pořadí; to v uložených
  // stránkách turnaje každý s každým není, takže náhled skončí hláškou o chybějících datech)
  await page.locator('#recent .recent-list li:not(.open) .recent-main').click();
  await page.waitForFunction((t) => window.chessPrint.session.tnr === t && !window.chessPrint.session.busy, rr);
  assert.equal(await page.locator('#tabs .tab').count(), 2);
  assert.equal(await page.evaluate(() => window.chessPrint.session.tnr), rr);

  // Nová prázdná záložka (+): seznam naposledy otevřených je rozbalený
  await page.locator('#tabs .tab-new').click();
  assert.equal(await page.locator('#recent .recent-head').textContent(), 'Naposledy otevřené');
  assert.equal(await page.locator('#recent .recent-list li').count(), 2);
  assert.deepEqual(errors, []);
  await context.close();
});

test('značka „vytištěno“, změna dat po tisku a název PDF', async () => {
  const { page, errors, context } = await newApp();
  await open(page, SWISS);
  await rendered(page, () => page.locator('.tpl', { hasText: /^Pořadí\d*$/ }).first().click());
  assert.equal(await page.locator('#print-mark').isHidden(), true);

  const title = await page.evaluate(() => {
    window.dispatchEvent(new Event('beforeprint'));
    const t = document.title;
    window.dispatchEvent(new Event('afterprint'));
    return t;
  });
  assert.match(title, / – Pořadí po 6\. kole$/);
  assert.equal(await page.title(), 'Šachový tisk');
  assert.match(await page.locator('#print-mark').innerText(), /Vytištěno dnes/);
  assert.equal(await page.locator('.tpl[aria-pressed="true"] .tpl-printed').innerText(), '✓');
  // jiný výstup netištěný
  assert.equal(await page.locator('.tpl[aria-pressed="false"] .tpl-printed').count(), 0);

  // Na chess-results se změní výsledek → „od tisku se data změnila“
  await rendered(page, () => page.evaluate((html) => {
    window.chessPrint.source.addManualHtml(html.replace('>5,5<', '>6,5<'));
    window.chessPrint.refreshPreview();
  }, fixture('swiss-ranking-r6')));
  assert.match(await page.locator('#print-mark').innerText(), /se data změnila/);
  assert.equal(await page.locator('.tpl.printed-changed').count(), 1);

  // Kliknutím se značka zruší
  await page.locator('#print-mark').click();
  assert.equal(await page.locator('#print-mark').isHidden(), true);
  assert.equal(await page.locator('.tpl-printed').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('klávesové zkratky a kontrola ručně vybraného kola', async () => {
  const { page, errors, context } = await newApp();
  await open(page, SWISS);
  await rendered(page, () => page.keyboard.press('1'));
  assert.equal(await page.evaluate(() => window.chessPrint.session.templateId), 'startlist');
  const pairIdx = await page.locator('.tpl').evaluateAll((b) => b.findIndex((x) => /Los kola/.test(x.textContent)) + 1);
  await rendered(page, () => page.keyboard.press(String(pairIdx)));
  assert.equal(await page.evaluate(() => window.chessPrint.session.templateId), 'pairings');
  await rendered(page, () => page.keyboard.press('ArrowLeft'));
  assert.equal(await page.evaluate(() => window.chessPrint.session.round), 6);
  assert.match(await page.locator('#warnings').innerText(), /Tisknete los 6\. kola – nejnovější zveřejněný je los 7\. kola/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('nastavení se načte až při otevření; export a import profilů', async () => {
  const { page, errors, requested, context } = await newApp();
  await open(page, SWISS);
  assert.ok(!requested.some((r) => /ui\/settings\.js|qrcode/.test(r)), 'nastavení a QR se nemají načítat při startu');
  await page.click('#btn-settings');
  await page.locator('#side-settings').getByRole('tab', { name: 'Profily' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '⬇ Exportovat všechny profily' }).click(),
  ]);
  const file = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  assert.equal(file.kind, 'profiles');
  assert.ok(file.profiles.length >= 3);
  // „Jiný počítač“: upravený profil s novým názvem se při importu přidá
  const p = { ...file.profiles[0], id: 'novy-profil', name: 'Krajský přebor' };
  page.once('dialog', (d) => d.accept());
  await page.locator('#side-settings input[type=file][accept^=".json"]').first().setInputFiles({
    name: 'profily.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...file, profiles: [p] })),
  });
  await page.waitForFunction(() => [...document.querySelectorAll('#profile-select option')].some((o) => o.textContent === 'Krajský přebor'));
  assert.match(await page.locator('#side-settings .transfer-msg').innerText(), /Přidáno: Krajský přebor/);

  // QR kód zapnutý v Záhlaví → načte se knihovna a QR je v náhledu
  await page.locator('#side-settings').getByRole('tab', { name: /Záhlaví/ }).click();
  await rendered(page, () => page.locator('#side-settings label', { hasText: 'QR kód s odkazem na turnaj' }).locator('select').selectOption('on'));
  await page.waitForSelector('#pages .hd-qr svg');
  assert.ok(requested.some((r) => /vendor\/qrcode\.mjs/.test(r)));
  assert.deepEqual(errors, []);
  await context.close();
});

test('nová verze se načte i u modulů načítaných podle potřeby (nastavení)', async () => {
  // Server jako GitHub Pages: mezipaměť 10 minut a ETag; nastavení pak „vyjde v nové verzi“
  let version = 1;
  const marker = () => `\n// verze ${version}\n`;
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const f = path.join(root, u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    let body = fs.readFileSync(f);
    const isSettings = u.pathname.endsWith('/js/ui/settings.js');
    if (isSettings) body = Buffer.concat([body, Buffer.from(marker())]);
    const etag = `"${isSettings ? `s${version}` : 'v1'}-${body.length}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { etag, 'cache-control': 'max-age=600' }); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', etag, 'cache-control': 'max-age=600' });
    res.end(body);
  });
  await new Promise((r) => srv.listen(0, r));
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(() => window.chessPrint);
    await page.click('#btn-settings'); // nastavení verze 1 je teď v mezipaměti prohlížeče
    await page.waitForSelector('#side-settings .tabs');
    await page.waitForTimeout(1200); // kontrola nové verze po startu proběhne a nic nenajde
    version = 2;
    // Uživatel appku znovu otevře – kontrola najde novější nastavení a stránku jednou obnoví
    await page.goto(url);
    await page.waitForEvent('framenavigated', { timeout: 8000 }).catch(() => null);
    await page.waitForFunction(() => window.chessPrint);
    const text = await page.evaluate(async (u) => (await fetch(new URL('js/ui/settings.js', u), { cache: 'force-cache' })).text(), url);
    assert.match(text, /verze 2/, 'prohlížeč by při otevření nastavení použil starou verzi z mezipaměti');
  } finally {
    await context.close();
    srv.closeAllConnections();
    srv.close();
  }
});

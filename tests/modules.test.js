// Hlídá rychlé načtení appky: index.html předem stahuje (modulepreload) přesně ty moduly,
// které main.js načítá staticky, a moduly načítané až podle potřeby mezi nimi nejsou.

import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { LAZY_MODULES } from '../js/ui/update.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LAZY = LAZY_MODULES;

function staticGraph(entry) {
  const seen = new Set();
  const walk = (file) => {
    const rel = relative(root, file).split('\\').join('/');
    if (seen.has(rel)) return;
    seen.add(rel);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/^(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/gms)) walk(join(dirname(file), m[1]));
  };
  walk(join(root, entry));
  return seen;
}

test('modulepreload v index.html odpovídá statickým importům main.js', () => {
  const graph = staticGraph('js/main.js');
  graph.delete('js/main.js');
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const preload = new Set([...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => m[1]));
  assert.deepEqual([...graph].filter((m) => !preload.has(m)).sort(), [], 'chybí v modulepreload');
  assert.deepEqual([...preload].filter((m) => !graph.has(m)).sort(), [], 'navíc v modulepreload');
});

test('nastavení, kategorie, přednastavené profily a QR kód se načítají až když jsou potřeba', () => {
  const graph = staticGraph('js/main.js');
  for (const m of LAZY) assert.ok(!graph.has(m), `${m} se načítá hned při startu`);
});

test('kontrola nové verze hlídá všechny moduly načítané až podle potřeby', () => {
  const graph = staticGraph('js/main.js');
  // Všechny moduly appky = statické + dynamické importy (import('…')) a jejich statické závislosti
  const all = new Set(graph);
  const walkDir = (d) => readdirSync(join(root, d)).flatMap((f) => (statSync(join(root, d, f)).isDirectory() ? walkDir(`${d}/${f}`) : [`${d}/${f}`]));
  const dynamic = [];
  for (const f of walkDir('js').filter((x) => /\.m?js$/.test(x) && !x.startsWith('js/vendor/'))) {
    for (const m of readFileSync(join(root, f), 'utf8').matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      dynamic.push(relative(root, join(root, dirname(f), m[1])).split('\\').join('/'));
    }
  }
  for (const d of dynamic) for (const m of staticGraph(d)) all.add(m);
  const lazy = [...all].filter((m) => !graph.has(m)).sort();
  assert.deepEqual(lazy, [...LAZY_MODULES].sort());
});

test('novinky: seznam změn od nejnovější, LATEST_CHANGE odpovídá nejnovější položce', async () => {
  const { CHANGELOG } = await import('../js/changelog.js');
  assert.ok(CHANGELOG.length > 5);
  for (const e of CHANGELOG) {
    assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(e.items.length > 0 && e.items.every((x) => typeof x === 'string' && x.length > 10));
  }
  const dates = CHANGELOG.map((e) => e.date);
  assert.deepEqual(dates, [...dates].sort().reverse(), 'nejnovější nahoře, bez duplicit');
  assert.equal(new Set(dates).size, dates.length);
  const host = readFileSync(join(root, 'js/app/aboutHost.js'), 'utf8');
  assert.equal(host.match(/LATEST_CHANGE = '([^']+)'/)[1], dates[0], 'aktualizujte LATEST_CHANGE v js/app/aboutHost.js');
});

test('všechny soubory appky jdou přeložit (i ty načítané až podle potřeby)', () => {
  const walkDir = (d) => readdirSync(join(root, d)).flatMap((f) => (statSync(join(root, d, f)).isDirectory() ? walkDir(`${d}/${f}`) : [`${d}/${f}`]));
  for (const f of walkDir('js').filter((x) => /\.m?js$/.test(x))) {
    const r = spawnSync(process.execPath, ['--check', join(root, f)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${f}: ${r.stderr.split('\n').slice(0, 4).join(' ')}`);
  }
});

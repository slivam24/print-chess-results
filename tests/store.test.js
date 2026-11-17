import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Store, defaultProfile } from '../js/store.js';

/** Úložiště v paměti – každý „počítač“ má své. */
function computer() {
  const mem = new Map();
  return new Store({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) });
}

describe('přenos profilů mezi počítači', () => {
  test('export jednoho profilu → import na jiný počítač ho přidá, ostatní zůstanou', () => {
    const a = computer();
    const liga = a.addProfile('Krajská liga');
    a.update((s) => { s.profiles.find((p) => p.id === liga.id).header.organizer = 'ŠK Štětí'; });
    const file = a.exportProfiles([liga.id]);
    const json = JSON.parse(file);
    assert.equal(json.kind, 'profiles');
    assert.equal(json.profiles.length, 1);
    assert.equal(json.proxyUrl, undefined); // jen profily, ne ostatní nastavení

    const b = computer();
    const before = b.state.profiles.map((p) => p.name);
    b.update((s) => { s.proxyUrl = 'http://vlastni'; });
    const r = b.importProfiles(file);
    assert.deepEqual(r, { added: ['Krajská liga'], replaced: [] });
    assert.deepEqual(b.state.profiles.map((p) => p.name), [...before, 'Krajská liga']);
    assert.equal(b.state.profiles.at(-1).header.organizer, 'ŠK Štětí');
    assert.equal(b.state.proxyUrl, 'http://vlastni');
  });

  test('stejný profil se při dalším přenosu aktualizuje (podle id), nevznikne duplikát', () => {
    const a = computer();
    const p = a.addProfile('Open');
    const b = computer();
    b.importProfiles(a.exportProfiles([p.id]));
    a.update((s) => { s.profiles.find((x) => x.id === p.id).page.fontSize = 12; });
    const r = b.importProfiles(a.exportProfiles([p.id]));
    assert.deepEqual(r, { added: [], replaced: ['Open'] });
    assert.equal(b.state.profiles.filter((x) => x.name === 'Open').length, 1);
    assert.equal(b.state.profiles.find((x) => x.name === 'Open').page.fontSize, 12);
  });

  test('výchozí profil se stejným názvem (jiné id) se přepíše, ne zdvojí', () => {
    const a = computer();
    a.update((s) => { s.profiles[0].header.text = 'z počítače A'; }); // „Otevřený turnaj“
    const b = computer(); // má vlastní „Otevřený turnaj“ s jiným id
    const plan = b.previewProfileImport(a.exportProfiles());
    assert.deepEqual(plan.map((x) => x.action), ['replace', 'replace']);
    b.importProfiles(a.exportProfiles());
    assert.equal(b.state.profiles.length, 2);
    assert.equal(b.state.profiles[0].header.text, 'z počítače A');
    // příště už se páruje podle id
    assert.equal(b.state.profiles[0].id, a.state.profiles[0].id);
  });

  test('import přijme i celou zálohu a převede starší verzi souboru', () => {
    const b = computer();
    const oldBackup = JSON.stringify({ app: 'chess-print', version: 1, profiles: [{ id: 'x1', name: 'Starý', nameFormat: 'original', page: { margins: { top: 12, right: 12, bottom: 12, left: 12 } } }] });
    b.importProfiles(oldBackup);
    const p = b.state.profiles.find((x) => x.name === 'Starý');
    assert.equal(p.nameFormat, 'last-first');
    assert.deepEqual(p.page.margins, { top: 5, right: 5, bottom: 5, left: 5 });
  });

  test('chybné soubory se odmítnou srozumitelně a nic nezmění', () => {
    const b = computer();
    const n = b.state.profiles.length;
    assert.throws(() => b.importProfiles('nesmysl'), /není platný JSON/);
    assert.throws(() => b.importProfiles('{"app":"jina-appka","profiles":[{}]}'), /nepochází z této appky/);
    assert.throws(() => b.importProfiles('{"app":"chess-print","kind":"profiles","profiles":[]}'), /žádné profily/);
    assert.equal(b.state.profiles.length, n);
    // soubor s profily nejde omylem nahrát jako celou zálohu (ta by vše přepsala)
    assert.throws(() => b.importJson(b.exportProfiles()), /soubor s profily/);
  });

  test('logo jde s profilem', () => {
    const a = computer();
    a.update((s) => { s.profiles[0].header.logo = 'data:image/png;base64,AAAA'; });
    const b = computer();
    b.importProfiles(a.exportProfiles([a.state.profiles[0].id]));
    assert.equal(b.state.profiles[0].header.logo, 'data:image/png;base64,AAAA');
  });

  test('defaultProfile je použitelný sám o sobě', () => {
    assert.ok(defaultProfile('X').id);
  });
});

test('migrace v5: profil s uloženým seznamem schovaných výstupů schová i nástěnku', async () => {
  const { normalizeState } = await import('../js/store.js');
  const s = normalizeState({ version: 4, profiles: [{ id: 'a', name: 'A', hiddenTemplates: ['pairings-alpha'] }] });
  assert.deepEqual(s.profiles[0].hiddenTemplates.sort(), ['pairings-alpha', 'pairings-board']);
  const t = normalizeState({ version: 5, profiles: [{ id: 'a', name: 'A', hiddenTemplates: [] }] });
  assert.deepEqual(t.profiles[0].hiddenTemplates, []);
});

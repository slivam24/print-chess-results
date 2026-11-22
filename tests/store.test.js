import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { Store, defaultProfile, loadPresets, hasSavedState, imageId, resolveImages } from '../js/store.js';

// Jako appka při prvním spuštění (main.js): přednastavené profily se načtou předem
before(() => loadPresets());

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
    a.update((s) => { s.profiles[0].header.text = 'z počítače A'; }); // první přednastavený profil
    const b = computer(); // má vlastní přednastavené profily s jinými id
    const plan = b.previewProfileImport(a.exportProfiles());
    assert.deepEqual(plan.map((x) => x.action), ['replace', 'replace', 'replace']);
    b.importProfiles(a.exportProfiles());
    assert.equal(b.state.profiles.length, 3);
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

  test('loga, sponzoři a vodoznak jdou s profilem; staré obrázky se převedou do knihovny', () => {
    const a = computer();
    a.update((s) => {
      const p = s.profiles[0];
      p.header.logo = 'data:image/png;base64,AAAA'; // starší verze appky: obrázky přímo v profilu
      p.header.logoPosition = 'right';
      p.footer.sponsors = [{ src: 'data:image/png;base64,BBBB', height: 12, gray: false }, { src: 'http://cizi/obr.png' }, { src: 'data:image/png;base64,AAAA' }];
      p.page.watermark = { src: 'data:image/png;base64,CCCC', opacity: 15, color: 'color', size: 500 };
    });
    // Starší export (obrázky v profilu) → nový počítač: obrázky skončí v knihovně, profil na ně odkazuje
    const old = JSON.parse(a.exportProfiles([a.state.profiles[0].id]));
    delete old.images;
    old.stateVersion = 6;
    const b = computer();
    b.importProfiles(JSON.stringify(old));
    const p = b.state.profiles.find((x) => x.id === a.state.profiles[0].id);
    const idA = imageId('data:image/png;base64,AAAA');
    assert.deepEqual(p.header.logos, [{ img: idA, height: 16, position: 'right', gray: true }]); // bez volby barev → černobíle
    assert.equal(p.header.logo, undefined);
    assert.deepEqual(p.footer.sponsors.map((x) => [x.img, x.gray]), [[imageId('data:image/png;base64,BBBB'), false], [idA, true]]);
    assert.deepEqual(p.page.watermark, { img: imageId('data:image/png;base64,CCCC'), opacity: 15, color: 'color', size: 70 });
    // stejné logo (AAAA) je v knihovně jen jednou
    assert.deepEqual(b.state.images.map((x) => x.src).sort(), ['data:image/png;base64,AAAA', 'data:image/png;base64,BBBB', 'data:image/png;base64,CCCC']);
    // Sazba dostane profil s obrázky
    const r = resolveImages(p, b.state.images);
    assert.equal(r.header.logos[0].src, 'data:image/png;base64,AAAA');
    assert.equal(r.page.watermark.src, 'data:image/png;base64,CCCC');
  });

  test('knihovna obrázků: nový export nese obrázky, smazání odstraní i odkazy', () => {
    const a = computer();
    const [id1, id2] = a.addImages([{ name: 'Klub', src: 'data:image/webp;base64,K' }, { name: 'Svaz', src: 'data:image/webp;base64,S' }]);
    assert.deepEqual(a.addImages([{ name: 'Klub znovu', src: 'data:image/webp;base64,K' }]), [id1]); // nezdvojí se
    assert.equal(a.state.images.length, 2);
    a.update((s) => {
      s.profiles[0].header.logos = [{ img: id1, height: 16, position: 'left', gray: true }];
      s.profiles[0].footer.sponsors = [{ img: id2, height: 10, gray: true }];
    });
    assert.deepEqual(a.imageUsage(id1), [`${a.state.profiles[0].name}: logo 1 v záhlaví`]);
    const file = JSON.parse(a.exportProfiles([a.state.profiles[0].id]));
    assert.deepEqual(file.images.map((x) => x.name).sort(), ['Klub', 'Svaz']);
    const b = computer();
    b.importProfiles(JSON.stringify(file));
    assert.deepEqual(b.state.images.map((x) => x.id).sort(), [id1, id2].sort());
    a.deleteImage(id1);
    assert.deepEqual(a.state.profiles[0].header.logos, []);
    assert.equal(a.state.images.length, 1);
    assert.ok(a.imageBytes() > 0);
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

test('migrace v6: startovní listina zapne dřív vypnutý sloupec skupiny', async () => {
  const { normalizeState } = await import('../js/store.js');
  const s = normalizeState({ version: 5, profiles: [{ id: 'a', name: 'A', templates: { startlist: { columns: [{ key: 'name' }, { key: 'group', on: false }] } } }] });
  assert.equal(s.profiles[0].templates.startlist.columns[1].on, true);
});

test('hasSavedState: první spuštění pozná podle prázdného úložiště', () => {
  const mem = new Map();
  const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(hasSavedState(st), false);
  new Store(st).flush();
  assert.equal(hasSavedState(st), true);
  assert.equal(hasSavedState({ getItem: () => { throw new Error('zakázáno'); } }), false);
});

test('přednastavené profily: při prvním spuštění a doplnění chybějících podle názvu', () => {
  const a = computer();
  assert.deepEqual(a.state.profiles.map((p) => p.name), ['Švýcar jednotlivců', 'Každý s každým jednotlivci', 'Každý s každým – družstva školy']);
  assert.equal(new Set(a.state.profiles.map((p) => p.id)).size, 3);
  const cats = a.state.profiles[0].templates['ranking-cat'].options.categories;
  assert.deepEqual(cats.find((c) => c.name === 'U16').types, ['U10', 'U12', 'U16']);
  assert.deepEqual(a.addPresetProfiles(), []); // všechny už jsou
  a.update((s) => { s.profiles = s.profiles.slice(1); });
  assert.deepEqual(a.addPresetProfiles(), ['Švýcar jednotlivců']);
  assert.equal(a.state.profiles.length, 3);
});


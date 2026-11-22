// Panel nastavení: profily, stránka a písmo, záhlaví/zápatí, šablona, připojení, záloha.

import { h, clear, options, downloadText, readFileText, imageToDataUrl, compactDataUrl } from './dom.js';
import { resolveColumns, parseColWidth } from '../templates/common.js';
import { templateSettings, DEFAULT_PROXY_URL, loadPresets } from '../store.js';
import { TEMPLATES } from '../templates/index.js';
import { optionControls } from './options.js';
import { renderPrintSetup } from './printSetup.js';

const FONTS = [
  ['Arial, Helvetica, sans-serif', 'Arial'],
  ['Calibri, Carlito, Arial, sans-serif', 'Calibri'],
  ['Verdana, Geneva, sans-serif', 'Verdana'],
  ['Tahoma, Verdana, sans-serif', 'Tahoma'],
  ['"Segoe UI", Roboto, Arial, sans-serif', 'Segoe UI'],
  ['"Trebuchet MS", Arial, sans-serif', 'Trebuchet MS'],
  ['"Arial Narrow", "Liberation Sans Narrow", Arial, sans-serif', 'Arial Narrow (úzké)'],
  ['Georgia, "Times New Roman", serif', 'Georgia'],
  ['"Times New Roman", Times, serif', 'Times New Roman'],
  ['Cambria, Georgia, serif', 'Cambria'],
];

const NAME_FORMATS = [
  ['original', 'Novák, Jindřich (jako chess-results)'],
  ['last-first', 'Novák Jindřich'],
  ['LAST-first', 'NOVÁK Jindřich'],
  ['first-last', 'Jindřich Novák'],
];

const TABS = [
  ['profiles', 'Profily'],
  ['page', 'Stránka'],
  ['header', 'Záhlaví a zápatí'],
  ['images', 'Obrázky'],
  ['template', 'Výstup'],
  ['outputs', 'Nabídka výstupů'],
  ['print', 'Tisk'],
  ['connection', 'Připojení'],
  ['backup', 'Záloha'],
];

export class SettingsPanel {
  constructor(root, { store, getTemplate, getOptionsContext, onChange, onClose, testProxy }) {
    this.root = root;
    this.store = store;
    this.getTemplate = getTemplate;
    this.getOptionsContext = getOptionsContext || (() => ({}));
    this.onChange = onChange;
    this.onClose = onClose;
    this.testProxy = testProxy;
    this.tab = 'profiles';
    this.compactImages();
  }

  /**
   * Obrázky uložené dřívější verzí appky jako PNG zabírají v úložišti prohlížeče až 10× víc místa.
   * Při prvním otevření nastavení je jednou převedeme (WebP, menší rozměr) – vzhled se nezmění.
   */
  async compactImages() {
    let changed = false;
    for (const im of [...this.store.state.images]) {
      const out = await compactDataUrl(im.src, 1000);
      if (out !== im.src) { this.store.replaceImageSrc(im.id, out); changed = true; }
    }
    if (changed) this.onChange();
  }

  get profile() {
    return this.store.profile;
  }

  /** Změna aktivního profilu + překreslení náhledu. */
  edit(fn, { rerenderPanel = false } = {}) {
    this.store.update((s) => fn(s.profiles.find((p) => p.id === s.activeProfileId)), { silent: true });
    this.onChange();
    if (rerenderPanel) this.render();
  }

  show(tab) {
    if (tab) this.tab = tab;
    this.root.hidden = false;
    this.render();
  }

  render() {
    clear(this.root);
    this.root.append(
      h('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '8px' } },
        h('strong', {}, `Nastavení profilu „${this.profile.name}“`),
        h('button', { class: 'btn small', type: 'button', onclick: () => this.onClose() }, '✕ Zavřít')),
      h('div', { class: 'tabs', role: 'tablist' },
        TABS.map(([id, label]) => h('button', {
          class: 'btn small', type: 'button', role: 'tab', 'aria-selected': String(this.tab === id),
          onclick: () => { this.tab = id; this.render(); },
        }, label))),
    );
    const card = h('div', { class: 'card' });
    this.root.append(card);
    const fn = {
      profiles: () => this.renderProfiles(card),
      page: () => this.renderPage(card),
      header: () => this.renderHeader(card),
      images: () => this.renderImages(card),
      template: () => this.renderTemplate(card),
      outputs: () => this.renderOutputs(card),
      print: () => renderPrintSetup(card, { appUrl: `${location.origin}${location.pathname}`, onTestPrint: () => window.print() }),
      connection: () => this.renderConnection(card),
      backup: () => this.renderBackup(card),
    }[this.tab];
    fn();
  }

  // --- Profily -------------------------------------------------------------

  renderProfiles(card) {
    const s = this.store.state;
    const list = h('ul', { class: 'profile-list' });
    s.profiles.forEach((p, i) => {
      const active = p.id === s.activeProfileId;
      list.append(h('li', { class: active ? 'active' : '' },
        h('span', { class: 'p-name', title: 'Přepnout na tento profil', onclick: () => { this.store.setActiveProfile(p.id); this.onChange(); this.render(); } }, (active ? '● ' : '○ ') + p.name),
        h('button', { class: 'btn icon small', type: 'button', title: 'Posunout nahoru', disabled: i === 0, onclick: () => { this.store.moveProfile(p.id, -1); this.render(); } }, '↑'),
        h('button', { class: 'btn icon small', type: 'button', title: 'Posunout dolů', disabled: i === s.profiles.length - 1, onclick: () => { this.store.moveProfile(p.id, 1); this.render(); } }, '↓'),
        h('button', { class: 'btn small', type: 'button', title: 'Vytvořit kopii profilu', onclick: () => { this.store.duplicateProfile(p.id); this.onChange(); this.render(); } }, 'Duplikovat'),
        h('button', { class: 'btn small', type: 'button', title: 'Uložit profil do souboru (pro jiný počítač)', onclick: () => downloadText(`chess-print-profil-${fileSlug(p.name)}-${today()}.json`, this.store.exportProfiles([p.id])) }, '⬇ Export'),
        h('button', {
          class: 'btn small danger', type: 'button', title: 'Smazat profil', disabled: s.profiles.length <= 1,
          onclick: () => {
            if (confirm(`Opravdu smazat profil „${p.name}“?`)) { this.store.deleteProfile(p.id); this.onChange(); this.render(); }
          },
        }, 'Smazat')));
    });
    const nameInput = h('input', { type: 'text', value: this.profile.name, 'aria-label': 'Název profilu' });
    add(card, 
      h('h2', {}, 'Profily nastavení'),
      h('p', { class: 'small muted' }, 'Každý profil má vlastní vzhled, záhlaví a nastavení výstupů (např. „Švýcar jednotlivců“, „Každý s každým – družstva“). Kliknutím na název profil přepnete. Profil pro turnaj vyberete i v horní liště – každá záložka turnaje si ho pamatuje.'),
      list,
      h('div', { class: 'row wrap', style: { marginTop: '10px' } },
        h('button', { class: 'btn', type: 'button', onclick: () => { const n = prompt('Název nového profilu:', 'Nový profil'); if (n) { this.store.addProfile(n); this.onChange(); this.render(); } } }, '+ Nový profil'),
        h('button', {
          class: 'btn', type: 'button',
          title: 'Přidá přednastavené profily (Švýcar jednotlivců, Každý s každým jednotlivci, Každý s každým – družstva školy), které ještě nemáte',
          onclick: async () => {
            await loadPresets();
            const added = this.store.addPresetProfiles();
            this.onChange();
            this.render();
            alert(added.length ? `Přidáno: ${added.join(', ')}` : 'Všechny přednastavené profily už máte.');
          },
        }, '+ Přednastavené profily')),
      h('h3', {}, 'Přejmenovat aktivní profil'),
      h('div', { class: 'row' }, nameInput,
        h('button', { class: 'btn', type: 'button', onclick: () => { this.store.renameProfile(this.profile.id, nameInput.value); this.onChange(); this.render(); } }, 'Uložit')),
      this.renderProfileTransfer(),
    );
  }

  /** Přenos profilů mezi počítači: export do souboru a import (přidá / aktualizuje). */
  renderProfileTransfer() {
    const msg = h('div', { class: 'small', style: { marginTop: '6px' } });
    const file = h('input', {
      type: 'file', accept: '.json,application/json',
      onchange: async (e) => {
        const f = e.target.files[0];
        e.target.value = '';
        if (!f) return;
        try {
          const text = await readFileText(f);
          const plan = this.store.previewProfileImport(text);
          const lines = plan.map((x) => `• ${x.profile.name} – ${x.action === 'replace' ? 'přepíše stávající profil' : 'přidá se jako nový'}`);
          if (!confirm(`Importovat profily ze souboru?\n\n${lines.join('\n')}\n\nOstatní profily a nastavení zůstanou beze změny.`)) return;
          const r = this.store.importProfiles(text);
          this.onChange();
          this.render();
          // render() vytvoří nový panel – zprávu ukážeme v něm
          const out = this.root.querySelector('.transfer-msg');
          if (out) {
            out.textContent = `Hotovo. ${r.added.length ? `Přidáno: ${r.added.join(', ')}. ` : ''}${r.replaced.length ? `Aktualizováno: ${r.replaced.join(', ')}.` : ''}`;
            out.className = 'small manual-ok transfer-msg';
          }
        } catch (err) {
          msg.textContent = `Import se nepovedl: ${err.message}`;
          msg.className = 'small manual-err transfer-msg';
        }
      },
    });
    msg.className = 'small transfer-msg';
    file.style.display = 'none';
    file.setAttribute('aria-label', 'Soubor s profily');
    return h('div', {},
      h('h3', {}, 'Přenos profilů na jiný počítač'),
      h('p', { class: 'small muted' }, 'Export uloží profil (vzhled, záhlaví s logem, nastavení výstupů a sloupců) do souboru JSON. Na druhém počítači ho tady importujte – profil se přidá ke stávajícím, a pokud tam stejný profil už je, aktualizuje se. Tlačítko „⬇ Export“ u profilu výše uloží jen ten jeden.'),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn', type: 'button', onclick: () => downloadText(`chess-print-profily-${today()}.json`, this.store.exportProfiles()) }, '⬇ Exportovat všechny profily'),
        h('label', { class: 'btn', style: { cursor: 'pointer' } }, '⬆ Importovat profily ze souboru…', file)),
      msg,
    );
  }

  // --- Stránka a písmo --------------------------------------------------------

  renderPage(card) {
    const p = this.profile;
    const margin = (side, label) => h('label', {}, label,
      h('input', {
        type: 'number', min: 0, max: 40, step: 1, value: p.page.margins[side],
        oninput: (e) => this.edit((pp) => { pp.page.margins[side] = clampNum(e.target.value, 0, 40, 12); }),
      }));
    const fontKnown = FONTS.some(([v]) => v === p.page.fontFamily);
    const customFont = h('input', {
      type: 'text', value: fontKnown ? '' : p.page.fontFamily, placeholder: 'vlastní písmo, např. Roboto',
      oninput: (e) => { if (e.target.value.trim()) this.edit((pp) => { pp.page.fontFamily = e.target.value.trim(); }); },
    });
    add(card, 
      h('h2', {}, 'Stránka a písmo'),
      field('Orientace (výchozí pro všechny výstupy)', h('select', {
        onchange: (e) => this.edit((pp) => { pp.page.orientation = e.target.value; }),
      }, options([['portrait', 'na výšku'], ['landscape', 'na šířku']], p.page.orientation))),
      h('div', { class: 'field' }, 'Okraje (mm)', h('div', { class: 'margins' },
        margin('top', 'nahoře'), margin('right', 'vpravo'), margin('bottom', 'dole'), margin('left', 'vlevo'))),
      field('Písmo', h('select', {
        onchange: (e) => { this.edit((pp) => { pp.page.fontFamily = e.target.value; }); customFont.value = ''; },
      }, options(fontKnown ? FONTS : [[p.page.fontFamily, '(vlastní)'], ...FONTS], p.page.fontFamily))),
      field('…nebo vlastní písmo nainstalované v počítači', customFont),
      field('Velikost písma (pt)', h('input', {
        type: 'number', min: 6, max: 24, step: 0.5, value: p.page.fontSize,
        oninput: (e) => this.edit((pp) => { pp.page.fontSize = clampNum(e.target.value, 6, 24, 10); }),
      }), true),
      field('Vzhled tabulek', h('select', {
        onchange: (e) => this.edit((pp) => { pp.page.tableStyle = e.target.value; }),
      }, options([['grid', 'mřížka – jako Swiss-Manager'], ['stripes', 'pruhy – bez svislých čar']], p.page.tableStyle || 'grid'))),
      field('Formát jmen', h('select', {
        onchange: (e) => this.edit((pp) => { pp.nameFormat = e.target.value; }),
      }, options(NAME_FORMATS, p.nameFormat))),
      h('p', { class: 'help' }, 'Písmo a orientaci lze pro jednotlivé výstupy přepsat na kartě „Výstup“.'),
      this.renderWatermark(),
    );
  }

  /** Vodoznak: obrázek z knihovny přes celou stránku, nastavitelná viditelnost, černobíle / barevně. */
  renderWatermark() {
    const wm = this.profile.page.watermark || {};
    const src = this.imageSrc(wm.img);
    const set = (fn, opt) => this.edit((pp) => { pp.page.watermark = pp.page.watermark || {}; fn(pp.page.watermark); }, opt);
    const pct = h('span', { class: 'small muted' }, `${wm.opacity || 10} %`);
    const picking = this.openPicker === 'watermark';
    return h('div', {},
      h('h2', { style: { marginTop: '16px' } }, 'Vodoznak'),
      h('p', { class: 'small muted' }, 'Logo turnaje nebo pořadatele světle přes celou stránku. Lze vypnout u jednotlivého výstupu v jeho možnostech; lístky k rozstříhání ho nemají.'),
      src
        ? h('div', { class: 'row wrap' },
          h('img', { class: 'logo-prev', src, alt: 'Vodoznak', style: { opacity: String((wm.opacity || 10) / 100 * 3), filter: wm.color === 'color' ? '' : 'grayscale(1)' } }),
          h('button', { class: 'btn small', type: 'button', onclick: () => this.togglePicker('watermark') }, picking ? 'Zavřít výběr' : 'Změnit obrázek'),
          h('button', { class: 'btn small danger', type: 'button', onclick: () => set((w) => { w.img = null; }, { rerenderPanel: true }) }, 'Odebrat vodoznak'))
        : h('button', { class: 'btn', type: 'button', onclick: () => this.togglePicker('watermark') }, picking ? 'Zavřít výběr' : '+ Vybrat obrázek vodoznaku'),
      picking ? this.picker({
        selected: [wm.img],
        onPick: (id) => { this.openPicker = null; set((w) => { w.img = id; w.color = w.color || 'gray'; }, { rerenderPanel: true }); },
      }) : null,
      src ? h('div', {},
        field(h('span', {}, 'Viditelnost ', pct), h('input', {
          type: 'range', min: 2, max: 40, step: 1, value: wm.opacity || 10,
          oninput: (e) => { pct.textContent = `${e.target.value} %`; set((w) => { w.opacity = clampNum(e.target.value, 1, 100, 10); }); },
        })),
        h('div', { class: 'row wrap' },
          h('label', { class: 'check' },
            h('input', { type: 'checkbox', checked: wm.color !== 'color', onchange: (e) => set((w) => { w.color = e.target.checked ? 'gray' : 'color'; }, { rerenderPanel: true }) }),
            'Černobíle'),
          field('Velikost (% šířky stránky)', h('input', {
            type: 'number', min: 10, max: 100, step: 5, value: wm.size || 70,
            oninput: (e) => set((w) => { w.size = clampNum(e.target.value, 10, 100, 70); }),
          }), true)),
        h('p', { class: 'help' }, 'Doporučená viditelnost 5–15 %, aby text zůstal dobře čitelný. Pro černobílou tiskárnu nechte černobíle – barevné logo by se vytisklo nerovnoměrně šedé.')) : null);
  }

  // --- Knihovna obrázků ------------------------------------------------------

  imageSrc(id) {
    const im = id && this.store.state.images.find((x) => x.id === id);
    return im ? im.src : null;
  }

  togglePicker(key) {
    this.openPicker = this.openPicker === key ? null : key;
    this.render();
  }

  /** Nahraje soubory do knihovny (zmenšené, úsporně) a vrátí id obrázků. */
  async uploadImages(files) {
    const list = [];
    try {
      for (const f of files) list.push({ name: String(f.name || 'Obrázek').replace(/\.[a-z0-9]+$/i, ''), src: await imageToDataUrl(f, 1000) });
    } catch (err) {
      alert(err.message);
    }
    const ids = this.store.addImages(list);
    this.checkSaved();
    return ids;
  }

  /** Tlačítko pro nahrání obrázků do knihovny (i více najednou). */
  uploadButton(label, onDone) {
    const input = h('input', {
      type: 'file', accept: 'image/*', multiple: true,
      onchange: async (e) => {
        const files = [...e.target.files];
        e.target.value = '';
        if (!files.length) return;
        const ids = await this.uploadImages(files);
        await onDone(ids);
      },
    });
    return h('label', { class: 'btn', style: { cursor: 'pointer' }, title: 'Můžete vybrat i více obrázků najednou' }, label, hidden(input));
  }

  /**
   * Výběr z knihovny obrázků: náhledy ke kliknutí (vybrané jsou označené) a nahrání nových.
   * onPick(id) – kliknutí na obrázek.
   */
  picker({ selected = [], onPick }) {
    const images = this.store.state.images;
    const chosen = new Set(selected.filter(Boolean));
    return h('div', { class: 'img-picker' },
      images.length
        ? h('div', { class: 'img-grid' }, images.map((im) => h('button', {
          type: 'button', class: 'img-pick', 'aria-pressed': String(chosen.has(im.id)), title: im.name,
          onclick: () => onPick(im.id),
        }, h('img', { src: im.src, alt: '' }), h('span', {}, im.name))))
        : h('p', { class: 'small muted' }, 'Knihovna obrázků je zatím prázdná.'),
      h('div', { class: 'row wrap' },
        this.uploadButton('+ Nahrát nové obrázky…', async (ids) => { for (const id of ids) await onPick(id); this.render(); }),
        h('button', { type: 'button', class: 'linklike', onclick: () => { this.openPicker = null; this.show('images'); } }, 'Spravovat obrázky…')));
  }

  /**
   * Seznam vybraných obrázků (loga v záhlaví, sponzoři): náhled, výška v mm, (umístění), černobíle,
   * pořadí, odebrání; nové se přidávají výběrem z knihovny obrázků.
   * path(profil) vrací pole v profilu, které se upravuje.
   */
  imageList({ key, items, path, addLabel, heightRange: [min, max, def], withPosition = false }) {
    const edit = (fn, rerender = true) => this.edit((pp) => fn(path(pp)), { rerenderPanel: rerender });
    const picking = this.openPicker === key;
    return h('div', { class: 'img-list' },
      items.map((it, i) => h('div', { class: 'img-row' },
        h('img', { class: 'logo-prev', src: this.imageSrc(it.img) || '', alt: `Logo ${i + 1}`, style: { filter: it.gray !== false ? 'grayscale(1)' : '' } }),
        h('div', { class: 'img-ctrls' },
          field('Výška (mm)', h('input', {
            type: 'number', min, max, value: it.height || def,
            oninput: (e) => edit((list) => { list[i].height = clampNum(e.target.value, min, max, def); }, false),
          }), true),
          withPosition ? field('Umístění', h('select', { onchange: (e) => edit((list) => { list[i].position = e.target.value; }, false) },
            options([['left', 'vlevo'], ['right', 'vpravo']], it.position || 'left')), true) : null,
          h('label', { class: 'check', title: 'Vytisknout v odstínech šedi – tak, jak ho vytiskne černobílá tiskárna' },
            h('input', { type: 'checkbox', checked: it.gray !== false, onchange: (e) => edit((list) => { list[i].gray = e.target.checked; }) }),
            'černobíle'),
          h('div', { class: 'row' },
            h('button', { class: 'btn icon small', type: 'button', title: 'Posunout dříve', disabled: i === 0, onclick: () => edit((list) => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; }) }, '↑'),
            h('button', { class: 'btn icon small', type: 'button', title: 'Posunout později', disabled: i === items.length - 1, onclick: () => edit((list) => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; }) }, '↓'),
            h('button', { class: 'btn small danger', type: 'button', title: 'Odebrat odsud (v knihovně obrázků zůstane)', onclick: () => edit((list) => { list.splice(i, 1); }) }, 'Odebrat'))))),
      h('button', { type: 'button', class: 'btn', style: { alignSelf: 'flex-start' }, onclick: () => this.togglePicker(key) }, picking ? 'Hotovo' : addLabel),
      picking ? h('div', {},
        h('p', { class: 'small muted' }, 'Kliknutím obrázek přidáte (rovnou černobíle), dalším kliknutím ho zase odeberete.'),
        this.picker({
          selected: items.map((x) => x.img),
          onPick: (id) => edit((list) => {
            const i = list.findIndex((x) => x.img === id);
            if (i >= 0) list.splice(i, 1);
            else list.push(withPosition ? { img: id, height: def, position: 'left', gray: true } : { img: id, height: def, gray: true });
          }),
        })) : null);
  }

  /** Záložka „Obrázky“: jedno místo pro nahrání všech obrázků (společné pro všechny profily). */
  renderImages(card) {
    const images = this.store.state.images;
    const kb = Math.round(this.store.imageBytes() / 1024);
    const refresh = () => { this.onChange(); this.render(); };
    add(card,
      h('h2', {}, 'Obrázky'),
      h('p', { class: 'small' }, 'Sem nahrajte loga turnaje, pořadatele, svazu a sponzorů. V záhlaví, zápatí a u vodoznaku je pak jen vyberete. Obrázky jsou společné pro všechny profily, takže stejné logo zabírá místo jen jednou.'),
      h('div', { class: 'row wrap' }, this.uploadButton('+ Nahrát obrázky (i více najednou)', () => this.render())),
      images.length
        ? h('div', { class: 'img-list' }, images.map((im) => {
          const used = this.store.imageUsage(im.id);
          return h('div', { class: 'img-row' },
            h('img', { class: 'logo-prev', src: im.src, alt: im.name }),
            h('div', { class: 'img-ctrls' },
              h('input', {
                type: 'text', class: 'img-name', value: im.name, 'aria-label': 'Název obrázku',
                onchange: (e) => { this.store.renameImage(im.id, e.target.value); },
              }),
              h('span', { class: 'small muted img-used' }, used.length ? `Použito: ${used.join(', ')}` : 'Zatím nepoužito'),
              h('button', {
                class: 'btn small danger', type: 'button',
                onclick: () => {
                  if (used.length && !confirm(`Obrázek „${im.name}“ se používá (${used.join(', ')}). Opravdu ho smazat? Z těchto míst zmizí.`)) return;
                  this.store.deleteImage(im.id);
                  refresh();
                },
              }, 'Smazat')));
        }))
        : h('p', { class: 'muted small' }, 'Zatím žádné obrázky.'),
      kb ? h('p', { class: 'small muted' }, `Obrázky zabírají v prohlížeči ${kb} kB (úložiště má zhruba 5 MB). Ukládají se zmenšené a úsporně.`) : null,
      h('p', { class: 'help' }, 'Obrázky jdou s profilem i do exportu profilů (pro jiný počítač) a do zálohy.'));
  }

  /** Po přidání obrázku: uloží hned a upozorní, když se nevejde do úložiště prohlížeče. */
  checkSaved() {
    this.store.flush();
    if (this.store.lastSaveError) {
      alert('Nastavení se nepodařilo uložit – úložiště prohlížeče je plné. Odeberte některé obrázky nebo použijte menší (méně podrobné) soubory.');
    }
  }

  // --- Záhlaví a zápatí ---------------------------------------------------------

  renderHeader(card) {
    const p = this.profile;
    const hd = p.header;
    const ft = p.footer;
    const text = (label, key, obj, opt = {}) => field(label, h(opt.area ? 'textarea' : 'input', {
      type: 'text', rows: opt.area ? opt.rows || 3 : null, value: obj === 'header' ? hd[key] ?? '' : ft[key] ?? '', placeholder: opt.ph || '',
      oninput: (e) => this.edit((pp) => { pp[obj][key] = e.target.value; }),
    }));
    const check = (label, key, obj) => h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: obj === 'header' ? hd[key] !== false : ft[key] !== false, onchange: (e) => this.edit((pp) => { pp[obj][key] = e.target.checked; }) }),
      label);
    add(card, 
      h('h2', {}, 'Záhlaví'),
      check('Zobrazit záhlaví (název, logo, pořadatel)', 'enabled', 'header'),
      field('Zarovnání nadpisu', h('select', { onchange: (e) => this.edit((pp) => { pp.header.align = e.target.value; }) },
        options([['center', 'na střed (jako Swiss-Manager)'], ['left', 'vlevo']], hd.align || 'center'))),
      text('Nadpis (Enter = další řádek)', 'title', 'header', { area: true, rows: 2, ph: '{turnaj}' }),
      h('p', { class: 'help' }, 'Nadpis může mít více řádků – např. 1. řádek název festivalu a 2. řádek „{turnaj}“, nebo „Okresní kolo přeboru škol“ a pod tím „kategorie A“ (případně „{skupina}“ = název skupiny z chess-results). Každý profil si nadpis upraví podle sebe.'),
      field('Velikost řádků nadpisu', h('select', { onchange: (e) => this.edit((pp) => { pp.header.titleLines = e.target.value; }) },
        options([['same', 'všechny řádky stejně velké'], ['second-smaller', '2. řádek menší'], ['first-smaller', '1. řádek menší']], hd.titleLines || 'same'))),
      text('Podnadpis', 'subtitle', 'header', { area: true, ph: '{misto}, {datum}' }),
      text('Pořadatel', 'organizer', 'header', { ph: 'např. ŠK Štětí' }),
      text('Rozhodčí', 'arbiter', 'header', { ph: '{rozhodci}' }),
      text('Volný text (vpravo)', 'text', 'header', { area: true }),
      h('h3', {}, 'Loga v záhlaví'),
      h('p', { class: 'small muted' }, 'Logo turnaje, pořadatele, svazu… Každé logo může být vlevo nebo vpravo od nadpisu.'),
      this.imageList({
        key: 'logos',
        items: hd.logos || [],
        path: (pp) => pp.header.logos,
        addLabel: '+ Přidat logo z obrázků',
        heightRange: [5, 60, 16],
        withPosition: true,
      }),
      check('Záhlaví na každé stránce (jinak jen na první)', 'everyPage', 'header'),
      h('h3', {}, 'QR kód'),
      field('QR kód s odkazem na turnaj', h('select', { onchange: (e) => this.edit((pp) => { pp.header.qr = e.target.value; }, { rerenderPanel: true }) },
        options([['off', 'vypnuto'], ['on', 'v záhlaví vpravo']], hd.qr || 'off'))),
      hd.qr === 'on' ? h('div', { class: 'row wrap' },
        field('Odkaz vede na', h('select', { onchange: (e) => this.edit((pp) => { pp.header.qrTarget = e.target.value; }) },
          options([['main', 'hlavní stránku turnaje'], ['output', 'stránku výstupu (los, pořadí…)']], hd.qrTarget || 'main')), true),
        field('Velikost (mm)', h('input', { type: 'number', min: 12, max: 40, value: hd.qrSize || 18, oninput: (e) => this.edit((pp) => { pp.header.qrSize = clampNum(e.target.value, 12, 40, 18); }) }), true)) : null,
      h('p', { class: 'help' }, 'Hráči a rodiče si QR kód načtou mobilem a uvidí aktuální výsledky na chess-results. Zobrazí se u výstupů se záhlavím (podle nastavení záhlaví i jen na první stránce). Hlavní stránka turnaje platí i po dalších kolech.'),
      h('p', { class: 'help', html: 'Proměnné: <code>{turnaj}</code> <code>{misto}</code> <code>{datum}</code> <code>{kolo}</code> <code>{rozhodci}</code> <code>{zastupce}</code> <code>{reditel}</code> <code>{poradatel}</code> <code>{tempo}</code> <code>{kol}</code> <code>{rating}</code> (průměrný rating) <code>{skupina}</code> (název skupiny) – doplní se z chess-results.' }),
      h('h2', { style: { marginTop: '16px' } }, 'Zápatí'),
      check('Zobrazit zápatí', 'enabled', 'footer'),
      text('Text vlevo', 'text', 'footer', { ph: 'např. www.mujklub.cz' }),
      check('Čísla stránek', 'showPageNumbers', 'footer'),
      check('Čas tisku', 'showPrinted', 'footer'),
      check('Zdroj a čas aktualizace na chess-results', 'showSource', 'footer'),
      h('h3', {}, 'Poděkování sponzorům'),
      h('p', { class: 'small muted' }, 'Text a loga sponzorů se vytisknou vystředěně nad čarou zápatí na každé stránce (zápatí musí být zapnuté – v profilu, nebo jen u vybraného výstupu v jeho možnostech).'),
      text('Text', 'sponsorsText', 'footer', { ph: 'např. Děkujeme partnerům turnaje:' }),
      this.imageList({
        key: 'sponsors',
        items: ft.sponsors || [],
        path: (pp) => pp.footer.sponsors,
        addLabel: '+ Přidat loga sponzorů z obrázků',
        heightRange: [4, 40, 10],
      }),
    );
  }

  // --- Nastavení aktuálního výstupu --------------------------------------------

  renderTemplate(card) {
    const tpl = this.getTemplate();
    if (!tpl) {
      add(card, h('p', { class: 'muted' }, 'Nejdřív vyberte výstup (vlevo v části „Co tisknout“).'));
      return;
    }
    const ts = templateSettings(this.profile, tpl);
    const setT = (fn, opt) => this.edit((pp) => {
      pp.templates[tpl.id] = pp.templates[tpl.id] || {};
      fn(pp.templates[tpl.id]);
    }, opt);
    add(card, 
      h('h2', {}, `Výstup: ${tpl.name}`),
      field('Orientace', h('select', { onchange: (e) => setT((t) => { t.orientation = e.target.value; }) },
        options([['inherit', 'podle profilu'], ['portrait', 'na výšku'], ['landscape', 'na šířku']], ts.orientation))),
      field('Velikost písma', h('select', { onchange: (e) => setT((t) => { t.fontMode = e.target.value; }, { rerenderPanel: true }) },
        options([['fixed', 'pevná'], ['max', 'co největší – aby se vešly všechny sloupce'], ['page', 'co největší – vše na jednu stránku (i výška řádků)']], ts.fontMode))),
      ts.fontMode !== 'fixed'
        ? field('Nejvýš (pt)', h('input', {
          type: 'number', min: 6, max: 40, step: 0.5, value: ts.fontMax,
          oninput: (e) => setT((t) => { t.fontMax = clampNum(e.target.value, 6, 40, 20); }),
        }), true)
        : field('Velikost písma (pt, prázdné = podle profilu)', h('input', {
          type: 'number', min: 6, max: 30, step: 0.5, value: ts.fontSize ?? '', placeholder: String(this.profile.page.fontSize),
          oninput: (e) => setT((t) => { t.fontSize = e.target.value === '' ? null : clampNum(e.target.value, 6, 30, null); }),
        }), true),
      ts.fontMode === 'max' ? h('p', { class: 'help' }, 'Appka zvolí největší písmo (nejvýš zadanou velikost), při kterém se všechny sloupce vejdou na šířku stránky bez zalamování textu. Tabulka může pokračovat na další stránce. Zvolená velikost se ukáže nad náhledem.') : null,
      ts.fontMode === 'page' ? h('p', { class: 'help' }, 'Appka zvolí největší písmo (nejvýš zadanou velikost), při kterém se vše vejde na jednu stránku a všechny sloupce na šířku. Zbylé místo dole vyplní vyššími řádky (nejvýš 2,5× běžné výšky). Výška řádku níže je pak nejmenší výška. Zvolené písmo a výška řádku se ukážou nad náhledem.') : null,
      tpl.layout && /fit/.test(String(tpl.layout)) ? h('p', { class: 'help' }, 'Tento výstup velikost písma volí automaticky, aby se vše vešlo na jednu stránku.') : null,
      field('Sloupců na stránce', h('select', { onchange: (e) => setT((t) => { t.pageColumns = Number(e.target.value); }) },
        options([[1, '1'], [2, '2'], [3, '3']], ts.pageColumns)), true),
    );
    add(card,
      field('Výška řádku tabulky (mm, prázdné = podle písma)', h('input', {
        type: 'number', min: 3, max: 30, step: 0.5, value: ts.rowHeight ?? '', placeholder: 'auto',
        oninput: (e) => setT((t) => { t.rowHeight = e.target.value === '' ? null : clampNum(e.target.value, 3, 30, null); }),
      }), true),
    );
    // Možnosti výstupu (mezery, co zobrazit…) – stejné jako vlevo v části „Možnosti“
    const optEls = optionControls(tpl, ts.options, {
      setOpt: (key, value) => setT((t) => { t.options = { ...(t.options || {}), [key]: value }; }),
      ...this.getOptionsContext(),
    });
    if (optEls.length) add(card, h('h3', {}, 'Možnosti výstupu'), h('div', { class: 'tpl-options' }, optEls));
    if ((tpl.columns || []).length) {
      const cols = resolveColumns(tpl.columns, ts.columns);
      const savedOf = (key) => (ts.columns || []).find((x) => x.key === key) || {};
      const current = () => cols.map((c) => {
        const sv = savedOf(c.key);
        return { key: c.key, on: c.on, label: sv.label || '', width: sv.width ?? null, fontSize: sv.fontSize ?? null };
      });
      const save = (list) => setT((t) => {
        t.columnsVersion = tpl.columnsVersion || 1;
        t.columns = list.map((c) => ({
          key: c.key,
          on: c.on,
          ...(c.label ? { label: c.label } : {}),
          ...(parseColWidth(c.width) ? { width: parseColWidth(c.width).value } : {}),
          ...(Number(c.fontSize) > 0 ? { fontSize: Number(c.fontSize) } : {}),
        }));
      }, { rerenderPanel: true });
      const numInput = (i, prop, title, ph, min, max, step) => h('input', {
        type: 'number', min, max, step, value: current()[i][prop] ?? '', placeholder: ph, title,
        onchange: (e) => { const l = current(); l[i][prop] = e.target.value === '' ? null : clampNum(e.target.value, min, max, null); save(l); },
      });
      const ul = h('ul', { class: 'col-editor' });
      const move = (from, to) => {
        if (from === to || to < 0 || to >= cols.length) return;
        const l = current();
        const [it] = l.splice(from, 1);
        l.splice(to, 0, it);
        save(l);
      };
      let dragFrom = null;
      ul.append(h('li', { class: 'col-head' },
        h('span', { style: { width: '18px' } }), h('span', { style: { width: '18px' } }), h('span', { class: 'c-label' }, 'Sloupec'),
        h('span', { class: 'c-h-label' }, 'Vlastní nadpis'), h('span', { class: 'c-h-num' }, 'Šířka mm/%'),
        h('span', { class: 'c-h-num' }, 'Písmo pt')));
      cols.forEach((c, i) => {
        ul.append(h('li', {
          class: c.on ? '' : 'off',
          // Přetažení řádku myší za úchyt ⋮⋮ změní pořadí sloupců
          // čára ukazuje, kam sloupec dopadne (nad řádek při přesunu nahoru, pod řádek při přesunu dolů)
          ondragover: (e) => { if (dragFrom == null) return; e.preventDefault(); e.currentTarget.classList.add(dragFrom < i ? 'drop-below' : 'drop-target'); },
          ondragleave: (e) => e.currentTarget.classList.remove('drop-target', 'drop-below'),
          ondrop: (e) => { e.preventDefault(); e.currentTarget.classList.remove('drop-target', 'drop-below'); const f = dragFrom; dragFrom = null; if (f != null) move(f, i); },
        },
          h('span', {
            class: 'c-drag', draggable: 'true', tabindex: '0', role: 'button',
            title: 'Přetáhněte myší pro změnu pořadí (nebo šipkami ↑ ↓ na klávesnici)', 'aria-label': `Přesunout sloupec ${describeColumn(tpl.columns.find((d) => d.key === c.key))}`,
            ondragstart: (e) => { dragFrom = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); e.currentTarget.closest('li').classList.add('dragging'); },
            ondragend: (e) => { dragFrom = null; e.currentTarget.closest('li')?.classList.remove('dragging'); },
            onkeydown: (e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const to = i + (e.key === 'ArrowUp' ? -1 : 1);
                move(i, to);
                requestAnimationFrame(() => { const hs = this.root.querySelectorAll('.col-editor .c-drag'); if (hs[to]) hs[to].focus(); });
              }
            },
          }, '⋮⋮'),
          h('input', { type: 'checkbox', checked: c.on, title: 'Zobrazit sloupec', onchange: (e) => { const l = current(); l[i].on = e.target.checked; save(l); } }),
          h('span', { class: 'c-label' }, describeColumn(tpl.columns.find((d) => d.key === c.key))),
          h('input', {
            type: 'text', class: 'c-in-label', value: savedOf(c.key).label || '', placeholder: c.label || '(bez nadpisu)', title: 'Vlastní nadpis sloupce',
            onchange: (e) => { const l = current(); l[i].label = e.target.value.trim(); save(l); },
          }),
          h('input', {
            type: 'text', class: 'c-in-width', value: current()[i].width ?? '', placeholder: 'auto', inputmode: 'decimal',
            title: 'Šířka sloupce: číslo = mm, s % = procenta šířky tabulky (např. 12 %). Prázdné = automaticky podle obsahu.',
            onchange: (e) => {
              const l = current();
              const w = parseColWidth(e.target.value);
              l[i].width = w ? w.value : null;
              save(l);
            },
          }),
          numInput(i, 'fontSize', 'Velikost písma sloupce v pt (prázdné = jako tabulka)', '–', 5, 30, 0.5)));
      });
      add(card,
        h('h3', {}, 'Sloupce'),
        h('p', { class: 'small muted' }, 'Zaškrtnutím sloupec zobrazíte, pořadí změníte přetažením za úchyt ⋮⋮. Vlastní nadpis, šířka a velikost písma (pt) jsou nepovinné – prázdné pole = automaticky. Úzké sloupce (čísla, body, rating…) se samy přizpůsobí nejdelšímu textu včetně nadpisu, protějškové sloupce (bílý/černý, domácí/hosté) mají stejnou šířku. Šířku můžete zadat v mm (např. 12) nebo v procentech šířky tabulky (např. 10 %); zbylé místo dostanou sloupce se jmény.'),
        ul,
        h('button', { class: 'btn small', type: 'button', style: { marginTop: '8px' }, onclick: () => setT((t) => { delete t.columns; delete t.columnsVersion; }, { rerenderPanel: true }) }, 'Obnovit výchozí sloupce'),
      );
    }
    add(card, h('p', { class: 'help', style: { marginTop: '12px' } }, 'Možnosti výstupu jsou výše v části „Možnosti výstupu“ a také vlevo pod výběrem výstupu (když je nastavení zavřené) – ukládají se do profilu.'));
  }

  // --- Které výstupy se nabízejí ------------------------------------------

  renderOutputs(card) {
    const hidden = new Set(this.profile.hiddenTemplates || []);
    const list = h('div', {});
    let lastGroup = null;
    for (const t of TEMPLATES) {
      if (t.group !== lastGroup) { list.append(h('div', { class: 'tpl-group' }, t.group)); lastGroup = t.group; }
      list.append(h('label', { class: 'check' },
        h('input', {
          type: 'checkbox', checked: !hidden.has(t.id),
          onchange: (e) => this.edit((pp) => {
            const set = new Set(pp.hiddenTemplates || []);
            if (e.target.checked) set.delete(t.id); else set.add(t.id);
            pp.hiddenTemplates = [...set];
          }),
        }),
        h('span', {}, h('b', {}, t.name), h('span', { class: 'muted' }, ` – ${t.description}`))));
    }
    add(card,
      h('h2', {}, 'Nabídka výstupů'),
      h('p', { class: 'small muted' }, 'Zaškrtnuté výstupy se ukazují vlevo v části „Co tisknout“. Nepoužívané můžete schovat – nastavení se neztratí a jdou kdykoli znovu zapnout. Výstupy pro družstva se ukazují jen u soutěží družstev a naopak.'),
      list,
    );
  }

  // --- Připojení -----------------------------------------------------------

  renderConnection(card) {
    const input = h('input', { type: 'url', value: this.store.state.proxyUrl, placeholder: DEFAULT_PROXY_URL });
    const result = h('div', { class: 'small', style: { marginTop: '6px' } });
    const custom = !!String(this.store.state.proxyUrl || '').trim();
    const save = (value) => {
      this.store.update((s) => { s.proxyUrl = value; });
      this.onChange({ proxyChanged: true });
      this.render();
    };
    add(card,
      h('h2', {}, 'Připojení k chess-results'),
      h('p', { class: 'small' }, 'chess-results.com nejde z prohlížeče číst přímo (CORS), appka proto stahuje stránky přes proxy na Cloudflare Workers. Proxy je součástí appky – nic nastavovat nemusíte.'),
      h('p', { class: 'help' }, custom ? 'Používá se vlastní proxy: ' : 'Používá se vestavěná proxy: ', h('code', {}, this.store.proxyUrl)),
      field('Vlastní adresa proxy (prázdné = vestavěná)', input),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => save(input.value.trim()) }, 'Uložit'),
        h('button', {
          class: 'btn', type: 'button',
          onclick: async () => {
            result.textContent = 'Zkouším…';
            result.className = 'small';
            const r = await this.testProxy(input.value.trim() || DEFAULT_PROXY_URL);
            result.textContent = r.message;
            result.className = `small ${r.ok ? 'manual-ok' : 'manual-err'}`;
          },
        }, 'Otestovat'),
        custom ? h('button', { class: 'btn', type: 'button', onclick: () => save('') }, 'Použít vestavěnou') : null),
      result,
      h('p', { class: 'help', style: { marginTop: '12px' } }, 'Vlastní proxy se hodí jen při nasazení vlastní kopie appky (návod v worker/README.md). Pro vývoj: „npm run dev“ → http://localhost:8787/proxy.'),
    );
  }

  // --- Záloha ----------------------------------------------------------------

  renderBackup(card) {
    const msg = h('div', { class: 'small', style: { marginTop: '6px' } });
    const file = h('input', {
      type: 'file', accept: '.json,application/json',
      onchange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        if (!confirm('Import nahradí všechna současná nastavení a profily. Pokračovat?')) { e.target.value = ''; return; }
        try {
          this.store.importJson(await readFileText(f));
          msg.textContent = 'Nastavení bylo obnoveno ze zálohy.';
          msg.className = 'small manual-ok';
          this.onChange({ proxyChanged: true });
          this.render();
        } catch (err) {
          msg.textContent = `Import se nepovedl: ${err.message}`;
          msg.className = 'small manual-err';
        }
      },
    });
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    add(card, 
      h('h2', {}, 'Záloha nastavení'),
      h('p', { class: 'small' }, 'Nastavení se ukládá v tomto prohlížeči (localStorage). Zálohu do souboru JSON doporučujeme po každé větší úpravě – obsahuje všechny profily (i s logy a vodoznakem), adresu proxy a poslední turnaje.'),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => downloadText(`chess-print-zaloha-${stamp}.json`, this.store.exportJson()) }, '⬇ Exportovat zálohu')),
      h('h3', {}, 'Obnovit ze zálohy'),
      file,
      msg,
      h('h3', {}, 'Obnovit výchozí stav'),
      h('button', {
        class: 'btn danger', type: 'button',
        onclick: () => { if (confirm('Smazat všechna nastavení a profily a začít znovu?')) { this.store.reset(); this.onChange({ proxyChanged: true }); this.render(); } },
      }, 'Smazat vše a začít znovu'),
      this.store.lastSaveError ? h('p', { class: 'manual-err small' }, 'Pozor: poslední uložení selhalo (plné úložiště prohlížeče?). Zkuste odebrat nebo zmenšit loga či vodoznak.') : null,
    );
  }
}

/** append bez null/false (DOM by jinak vypsal text „null“). */
function add(el, ...kids) {
  el.append(...kids.flat().filter((k) => k != null && k !== false));
}

/** Pole pro výběr souboru schované v tlačítku (label) – systémové „Vybrat soubor“ by rušilo. */
function hidden(input) {
  input.style.display = 'none';
  return input;
}

function field(label, control, inline = false) {
  return h('label', { class: `field${inline ? ' inline' : ''}` }, label, control);
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Název souboru bez diakritiky a mezer. */
function fileSlug(s) {
  return String(s || 'profil').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'profil';
}

function clampNum(v, min, max, def) {
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

const COLUMN_NAMES = {
  wTitle: 'Titul bílého', bTitle: 'Titul černého', title: 'Titul', wNo: 'Č. bílého', bNo: 'Č. černého',
  wPoints: 'Body bílého', bPoints: 'Body černého', wRating: 'Elo bílého', bRating: 'Elo černého',
  wRatingNat: 'Nár. Elo bílého', bRatingNat: 'Nár. Elo černého', wClub: 'Klub bílého', bClub: 'Klub černého',
  wFed: 'Federace bílého', bFed: 'Federace černého', homeColor: 'Barva domácího', awayColor: 'Barva hosta',
  homeRating: 'Elo domácího', awayRating: 'Elo hosta', homeRoster: 'Pořadí na soupisce (domácí)', awayRoster: 'Pořadí na soupisce (hosté)', homeNo: 'Č. domácích', awayNo: 'Č. hostů',
  check: 'Kontrola (✓)', note: 'Poznámka', startNo: 'Startovní číslo', no: 'Číslo',
  rating: 'Rating FIDE', ratingNat: 'Národní rating', type: 'Typ hráče (U16, S50…)', group: 'Skupina', sex: 'Pohlaví',
  rank: 'Pořadí', rankAll: 'Celkové pořadí (u kategorií)', cross: 'Výsledky proti soupeřům (1…N)', place: 'Místo',
};

function describeColumn(def) {
  if (!def) return '';
  return COLUMN_NAMES[def.key] || def.label || def.key;
}

// Panel nastavení: profily, stránka a písmo, záhlaví/zápatí, šablona, připojení, záloha.

import { h, clear, options, downloadText, readFileText, imageToDataUrl } from './dom.js';
import { resolveColumns } from '../templates/common.js';
import { templateSettings, DEFAULT_PROXY_URL } from '../store.js';
import { TEMPLATES } from '../templates/index.js';
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
  ['template', 'Výstup'],
  ['outputs', 'Nabídka výstupů'],
  ['print', 'Tisk'],
  ['connection', 'Připojení'],
  ['backup', 'Záloha'],
];

export class SettingsPanel {
  constructor(root, { store, getTemplate, onChange, onClose, testProxy }) {
    this.root = root;
    this.store = store;
    this.getTemplate = getTemplate;
    this.onChange = onChange;
    this.onClose = onClose;
    this.testProxy = testProxy;
    this.tab = 'profiles';
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
      h('p', { class: 'small muted' }, 'Každý profil má vlastní vzhled, záhlaví a nastavení výstupů (např. „Otevřený turnaj“, „Liga“). Kliknutím na název profil přepnete.'),
      list,
      h('div', { class: 'row', style: { marginTop: '10px' } },
        h('button', { class: 'btn', type: 'button', onclick: () => { const n = prompt('Název nového profilu:', 'Nový profil'); if (n) { this.store.addProfile(n); this.onChange(); this.render(); } } }, '+ Nový profil')),
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
    );
  }

  // --- Záhlaví a zápatí ---------------------------------------------------------

  renderHeader(card) {
    const p = this.profile;
    const hd = p.header;
    const ft = p.footer;
    const text = (label, key, obj, opt = {}) => field(label, h(opt.area ? 'textarea' : 'input', {
      type: 'text', rows: opt.area ? 3 : null, value: obj === 'header' ? hd[key] ?? '' : ft[key] ?? '', placeholder: opt.ph || '',
      oninput: (e) => this.edit((pp) => { pp[obj][key] = e.target.value; }),
    }));
    const check = (label, key, obj) => h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: obj === 'header' ? hd[key] !== false : ft[key] !== false, onchange: (e) => this.edit((pp) => { pp[obj][key] = e.target.checked; }) }),
      label);
    const logoInput = h('input', {
      type: 'file', accept: 'image/*',
      onchange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          const url = await imageToDataUrl(f);
          this.edit((pp) => { pp.header.logo = url; }, { rerenderPanel: true });
        } catch (err) {
          alert(err.message);
        }
      },
    });
    add(card, 
      h('h2', {}, 'Záhlaví'),
      check('Zobrazit záhlaví (název, logo, pořadatel)', 'enabled', 'header'),
      field('Zarovnání nadpisu', h('select', { onchange: (e) => this.edit((pp) => { pp.header.align = e.target.value; }) },
        options([['center', 'na střed (jako Swiss-Manager)'], ['left', 'vlevo']], hd.align || 'center'))),
      text('Nadpis', 'title', 'header', { ph: '{turnaj}' }),
      text('Podnadpis', 'subtitle', 'header', { area: true, ph: '{misto}, {datum}' }),
      text('Pořadatel', 'organizer', 'header', { ph: 'např. ŠK Štětí' }),
      text('Rozhodčí', 'arbiter', 'header', { ph: '{rozhodci}' }),
      text('Volný text (vpravo)', 'text', 'header', { area: true }),
      h('div', { class: 'field' }, 'Logo',
        hd.logo ? h('img', { class: 'logo-prev', src: hd.logo, alt: 'Logo' }) : h('span', { class: 'small muted' }, 'Bez loga'),
        h('div', { class: 'row wrap' }, logoInput,
          hd.logo ? h('button', { class: 'btn small danger', type: 'button', onclick: () => this.edit((pp) => { pp.header.logo = null; }, { rerenderPanel: true }) }, 'Odebrat logo') : null)),
      h('div', { class: 'row wrap' },
        field('Výška loga (mm)', h('input', { type: 'number', min: 5, max: 50, value: hd.logoHeight, oninput: (e) => this.edit((pp) => { pp.header.logoHeight = clampNum(e.target.value, 5, 50, 16); }) }), true),
        field('Umístění', h('select', { onchange: (e) => this.edit((pp) => { pp.header.logoPosition = e.target.value; }) }, options([['left', 'vlevo'], ['right', 'vpravo']], hd.logoPosition)), true)),
      check('Záhlaví na každé stránce (jinak jen na první)', 'everyPage', 'header'),
      h('p', { class: 'help', html: 'Proměnné: <code>{turnaj}</code> <code>{misto}</code> <code>{datum}</code> <code>{kolo}</code> <code>{rozhodci}</code> <code>{zastupce}</code> <code>{reditel}</code> <code>{poradatel}</code> <code>{tempo}</code> <code>{kol}</code> <code>{rating}</code> (průměrný rating) – doplní se z chess-results.' }),
      h('h2', { style: { marginTop: '16px' } }, 'Zápatí'),
      check('Zobrazit zápatí', 'enabled', 'footer'),
      text('Text vlevo', 'text', 'footer', { ph: 'např. www.mujklub.cz' }),
      check('Čísla stránek', 'showPageNumbers', 'footer'),
      check('Čas tisku', 'showPrinted', 'footer'),
      check('Zdroj a čas aktualizace na chess-results', 'showSource', 'footer'),
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
          ...(Number(c.width) > 0 ? { width: Number(c.width) } : {}),
          ...(Number(c.fontSize) > 0 ? { fontSize: Number(c.fontSize) } : {}),
        }));
      }, { rerenderPanel: true });
      const numInput = (i, prop, title, ph, min, max, step) => h('input', {
        type: 'number', min, max, step, value: current()[i][prop] ?? '', placeholder: ph, title,
        onchange: (e) => { const l = current(); l[i][prop] = e.target.value === '' ? null : clampNum(e.target.value, min, max, null); save(l); },
      });
      const ul = h('ul', { class: 'col-editor' });
      ul.append(h('li', { class: 'col-head' },
        h('span', { style: { width: '18px' } }), h('span', { class: 'c-label' }, 'Sloupec'),
        h('span', { class: 'c-h-label' }, 'Vlastní nadpis'), h('span', { class: 'c-h-num' }, 'Šířka mm'),
        h('span', { class: 'c-h-num' }, 'Písmo pt'), h('span', { class: 'c-h-btn' })));
      cols.forEach((c, i) => {
        ul.append(h('li', { class: c.on ? '' : 'off' },
          h('input', { type: 'checkbox', checked: c.on, title: 'Zobrazit sloupec', onchange: (e) => { const l = current(); l[i].on = e.target.checked; save(l); } }),
          h('span', { class: 'c-label' }, describeColumn(tpl.columns.find((d) => d.key === c.key))),
          h('input', {
            type: 'text', class: 'c-in-label', value: savedOf(c.key).label || '', placeholder: c.label || '(bez nadpisu)', title: 'Vlastní nadpis sloupce',
            onchange: (e) => { const l = current(); l[i].label = e.target.value.trim(); save(l); },
          }),
          numInput(i, 'width', 'Šířka sloupce v mm (prázdné = automaticky)', 'auto', 3, 150, 1),
          numInput(i, 'fontSize', 'Velikost písma sloupce v pt (prázdné = jako tabulka)', '–', 5, 30, 0.5),
          h('button', { class: 'btn icon small', type: 'button', title: 'Nahoru', disabled: i === 0, onclick: () => { const l = current(); [l[i - 1], l[i]] = [l[i], l[i - 1]]; save(l); } }, '↑'),
          h('button', { class: 'btn icon small', type: 'button', title: 'Dolů', disabled: i === cols.length - 1, onclick: () => { const l = current(); [l[i + 1], l[i]] = [l[i], l[i + 1]]; save(l); } }, '↓')));
      });
      add(card,
        h('h3', {}, 'Sloupce'),
        h('p', { class: 'small muted' }, 'Zaškrtnutím sloupec zobrazíte, šipkami změníte pořadí. Vlastní nadpis, šířka (mm) a velikost písma (pt) jsou nepovinné – prázdné pole = automaticky. Šířka je nejmenší šířka; zbylé místo dostanou sloupce bez zadané šířky.'),
        ul,
        h('button', { class: 'btn small', type: 'button', style: { marginTop: '8px' }, onclick: () => setT((t) => { delete t.columns; delete t.columnsVersion; }, { rerenderPanel: true }) }, 'Obnovit výchozí sloupce'),
      );
    }
    add(card, h('p', { class: 'help', style: { marginTop: '12px' } }, 'Volby výstupu (např. zobrazení výsledků) najdete vlevo v části „Možnosti“ – i ty se ukládají do profilu.'));
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
      h('p', { class: 'small' }, 'Nastavení se ukládá v tomto prohlížeči (localStorage). Zálohu do souboru JSON doporučujeme po každé větší úpravě – obsahuje všechny profily, logo, adresu proxy a poslední turnaje.'),
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
      this.store.lastSaveError ? h('p', { class: 'manual-err small' }, 'Pozor: poslední uložení selhalo (plné úložiště prohlížeče?). Zkuste zmenšit logo.') : null,
    );
  }
}

/** append bez null/false (DOM by jinak vypsal text „null“). */
function add(el, ...kids) {
  el.append(...kids.flat().filter((k) => k != null && k !== false));
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
  rank: 'Pořadí', rankAll: 'Celkové pořadí (u kategorií)',
};

function describeColumn(def) {
  if (!def) return '';
  return COLUMN_NAMES[def.key] || def.label || def.key;
}

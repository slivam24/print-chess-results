// Ovládací prvky možností výstupu (šablony): zaškrtávátka, výběry, čísla, text, kategorie.
// Používá je levý panel („Možnosti“) i Nastavení → Výstup, aby byly volby na obou místech stejné.

import { h, options } from './dom.js';
import { categoriesOf } from '../templates/lists.js';

/**
 * Prvky pro volby šablony.
 * @param {object} tpl šablona
 * @param {object} values aktuální hodnoty voleb (templateSettings(...).options)
 * @param {object} o
 * @param {(key: string, value: any) => void} o.setOpt uložení volby
 * @param {boolean} o.allRounds tiskne se „všechna kola najednou“ (volby jen pro tento režim)
 * @param {object[]} o.players hráči turnaje (pro kategorie)
 * @returns {HTMLElement[]}
 */
export function optionControls(tpl, values, { setOpt, allRounds = false, players = [] }) {
  const out = [];
  for (const o of tpl.options || []) {
    if (o.onlyAllRounds && !allRounds) continue;
    if (o.onlySingleRound && allRounds) continue;
    const v = values[o.key];
    if (o.type === 'bool') {
      out.push(h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: !!v, onchange: (e) => setOpt(o.key, e.target.checked) }), o.label));
    } else if (o.type === 'select') {
      out.push(h('label', { class: 'field' }, o.label,
        h('select', { onchange: (e) => setOpt(o.key, e.target.value) }, options(o.choices, v))));
    } else if (o.type === 'number') {
      out.push(h('label', { class: 'field inline' }, o.label,
        h('input', {
          type: 'number', min: o.min, max: o.max, step: o.step, value: v,
          oninput: (e) => {
            const n = Number(e.target.value);
            if (e.target.value === '' || !Number.isFinite(n)) return;
            setOpt(o.key, Math.min(o.max ?? n, Math.max(o.min ?? n, n)));
          },
        })));
    } else if (o.type === 'text') {
      out.push(h('label', { class: 'field' }, o.label,
        h('input', { type: 'text', value: v || '', oninput: (e) => setOpt(o.key, e.target.value) })));
    } else if (o.type === 'categories') {
      const box = h('div', { class: 'cat-editor' }, h('p', { class: 'small muted' }, 'Načítám editor kategorií…'));
      out.push(box);
      // Editor kategorií se načítá, až když je potřeba
      import('./categories.js').then(({ renderCategoryEditor }) => {
        if (box.isConnected) renderCategoryEditor(box, { value: v, players, onChange: (cats) => setOpt(o.key, cats) });
      });
    } else if (o.type === 'category') {
      const cats = categoriesOf(players);
      if (!cats.length) continue;
      out.push(h('label', { class: 'field' }, o.label,
        h('select', { onchange: (e) => setOpt(o.key, e.target.value) },
          options([['', 'všechny dohromady'], ...cats.map((c) => [c, c]), ['*split*', 'každá kategorie zvlášť']], v))));
    }
  }
  return out;
}

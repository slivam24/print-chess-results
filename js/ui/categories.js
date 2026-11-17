// Editor vlastních kategorií pro „Pořadí + kategorie“ (např. „Nejlepší do 16 let“ = typy U16, U12, U10).
// Kategorie se ukládají do profilu (volba šablony „categories“), takže platí i pro další turnaje.

import { h, clear } from './dom.js';
import { categoryValues, sexLabel } from '../templates/lists.js';

const DIMS = [
  ['types', 'type', 'Typ'],
  ['groups', 'group', 'Skupina'],
  ['sex', 'sex', 'Pohlaví'],
];

function newId() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Vykreslí editor do kontejneru.
 * @param {HTMLElement} box
 * @param {{ value: object[], players: object[], onChange: (cats: object[]) => void }} o
 */
export function renderCategoryEditor(box, { value, players, onChange }) {
  const avail = categoryValues(players);
  let cats = (Array.isArray(value) ? value : []).map((c) => ({ ...c, id: c.id || newId() }));
  const commit = (rerender) => {
    onChange(cats.map((c) => ({ ...c })));
    if (rerender) draw();
  };

  function chipRow(cat, [k, field, label]) {
    const selected = new Set(cat[k] || []);
    // Hodnoty z turnaje + uložené, které v tomto turnaji nejsou (aby šly odebrat)
    const values = [...avail[field], ...[...selected].filter((v) => !avail[field].includes(v))];
    if (!values.length) return null;
    return h('div', { class: 'cat-dim' },
      h('span', { class: 'cat-dim-label' }, label),
      h('div', { class: 'cat-chips' }, values.map((v) => h('button', {
        type: 'button',
        class: `cat-chip${avail[field].includes(v) ? '' : ' missing'}`,
        'aria-pressed': String(selected.has(v)),
        title: avail[field].includes(v) ? '' : 'V tomto turnaji se nevyskytuje',
        onclick: (e) => {
          const set = new Set(cat[k] || []);
          if (set.has(v)) set.delete(v); else set.add(v);
          cat[k] = values.filter((x) => set.has(x));
          e.currentTarget.setAttribute('aria-pressed', String(set.has(v)));
          commit(false);
        },
      }, field === 'sex' ? sexLabel(v) : v))));
  }

  function draw() {
    clear(box);
    box.append(h('div', { class: 'cat-head' },
      h('b', {}, 'Kategorie'),
      h('span', { class: 'muted small' }, cats.length
        ? ' – každá zaškrtnutá kategorie se vytiskne se svým pořadím.'
        : ' – zatím žádné, tiskne se celé pořadí. Přidejte např. „Nejlepší do 16 let“ a zaklikněte typy U16, U12, U10.')));
    cats.forEach((cat, i) => {
      const rows = DIMS.map((d) => chipRow(cat, d)).filter(Boolean);
      box.append(h('div', { class: `cat-card${cat.on === false ? ' off' : ''}` },
        h('div', { class: 'cat-top' },
          h('input', {
            type: 'checkbox', checked: cat.on !== false, title: 'Tisknout tuto kategorii',
            onchange: (e) => { cat.on = e.target.checked; e.target.closest('.cat-card').classList.toggle('off', !cat.on); commit(false); },
          }),
          h('input', {
            type: 'text', class: 'cat-name', value: cat.name || '', placeholder: 'Název, např. Nejlepší do 16 let',
            oninput: (e) => { cat.name = e.target.value; commit(false); },
          }),
          h('button', { type: 'button', class: 'btn small ghost', title: 'Posunout výš', disabled: i === 0, onclick: () => { [cats[i - 1], cats[i]] = [cats[i], cats[i - 1]]; commit(true); } }, '↑'),
          h('button', { type: 'button', class: 'btn small ghost', title: 'Posunout níž', disabled: i === cats.length - 1, onclick: () => { [cats[i + 1], cats[i]] = [cats[i], cats[i + 1]]; commit(true); } }, '↓'),
          h('button', { type: 'button', class: 'btn small ghost', title: 'Smazat kategorii', onclick: () => { cats.splice(i, 1); commit(true); } }, '✕')),
        rows.length ? rows : h('p', { class: 'muted small' }, 'Turnaj na chess-results neuvádí typ, skupinu ani pohlaví hráčů.')));
    });
    const actions = h('div', { class: 'cat-actions' },
      h('button', {
        type: 'button', class: 'btn small',
        onclick: () => { cats.push({ id: newId(), name: '', types: [], groups: [], sex: [], on: true }); commit(true); [...box.querySelectorAll('.cat-name')].pop()?.focus(); },
      }, '+ Přidat kategorii'));
    const missingTypes = avail.type.filter((t) => !cats.some((c) => (c.types || []).length === 1 && c.types[0] === t));
    if (missingTypes.length) {
      actions.append(h('button', {
        type: 'button', class: 'btn small ghost', title: 'Vytvoří jednu kategorii pro každý typ, který ještě kategorii nemá',
        onclick: () => {
          for (const t of missingTypes) cats.push({ id: newId(), name: t, types: [t], groups: [], sex: [], on: true });
          commit(true);
        },
      }, `Kategorie podle typů (${missingTypes.join(', ')})`));
    }
    if (cats.length) {
      actions.append(h('button', {
        type: 'button', class: 'btn small ghost',
        onclick: () => { const on = !cats.every((c) => c.on !== false); cats.forEach((c) => { c.on = on; }); commit(true); },
      }, cats.every((c) => c.on !== false) ? 'Odškrtnout vše' : 'Zaškrtnout vše'));
    }
    box.append(actions);
  }

  draw();
}

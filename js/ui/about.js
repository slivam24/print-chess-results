// Okno „O aplikaci“: návod k použití, novinky (seznam změn) a informace o appce.
// Načítá se, až když ho uživatel otevře.

import { h, clear } from './dom.js';
import { CHANGELOG } from '../changelog.js';

const kbd = (k) => h('kbd', {}, k);

/** Oddíl návodu: nadpis a odstavce / seznamy. */
function section(title, ...body) {
  return h('section', { class: 'about-sec' }, h('h3', {}, title), ...body);
}
const p = (...c) => h('p', {}, ...c);
const ul = (...items) => h('ul', {}, items.map((x) => h('li', {}, x)));
const b = (t) => h('b', {}, t);

function guide() {
  return h('div', { class: 'about-guide' },
    p('Appka připraví k tisku los, pořadí, startovní listiny a další výstupy turnajů z ', b('chess-results.com'),
      ' – s vlastním záhlavím, logy a co největším písmem. Nic se neinstaluje, nastavení se ukládá v tomto prohlížeči.'),
    section('1. Otevření turnaje',
      ul(
        h('span', {}, 'Vlevo v kartě ', b('1. Turnaj'), ' zadejte číslo turnaje nebo vložte odkaz z chess-results a klikněte na ', b('Stáhnout'), '. Odkaz rovnou na los, pořadí apod. otevře i příslušný výstup.'),
        h('span', {}, 'Každý turnaj má nahoře v liště vlastní ', b('záložku'), ' (s vlastním profilem, výstupem a kolem). Další turnaj otevřete tlačítkem ', b('+'), '.'),
        h('span', {}, 'U turnaje s více skupinami vyberte skupinu, nebo ', b('Všechny skupiny'), ' – každá se vytiskne od nové stránky.'),
        h('span', {}, b('Naposledy otevřené'), ' turnaje najdete pod polem pro číslo turnaje.'),
      )),
    section('2. Výběr výstupu a kola',
      ul(
        h('span', {}, 'V kartě ', b('2. Co tisknout'), ' vyberte výstup (startovní listina, los, pořadí, křížová tabulka, výstupy družstev…). Klávesy ', kbd('1'), '–', kbd('9'), ' vyberou výstup podle pořadí v nabídce.'),
        h('span', {}, 'Pod výstupem jsou jeho ', b('Možnosti'), ': kolo (', kbd('←'), ' ', kbd('→'), ' přepínají kola), co zobrazit, mezery, záhlaví a zápatí jen pro tento výstup…'),
        h('span', {}, 'Výstupy, které nepoužíváte, schováte v ', b('⚙ Nastavení → Nabídka výstupů'), '.'),
      )),
    section('3. Náhled a tisk',
      ul(
        h('span', {}, 'Nad náhledem přepnete ', b('orientaci'), ' a ', b('písmo'), ': ', b('Pevné'), ' (velikost z nastavení), ', b('Co největší'), ' (všechny sloupce na šířku stránky), ', b('1 strana A4'), ' (vše na jednu stránku, i výška řádků).'),
        h('span', {}, b('🖨 Tisknout'), ' (nebo ', kbd('Ctrl'), '+', kbd('P'), '). V dialogu tisku nechte měřítko 100 % a okraje „Výchozí“. Uložit jako PDF navrhne název souboru podle turnaje a výstupu.'),
        h('span', {}, 'Po tisku se u výstupu ukáže ', b('✓ Vytištěno'), '; když se pak data na chess-results změní, uvidíte „od tisku se data změnila“. Kliknutím značku zrušíte.'),
        h('span', {}, b('Tisk jedním klikem'), ' bez dialogu nastavíte podle průvodce v ', b('⚙ Nastavení → Tisk'), '.'),
      )),
    section('4. Po každém kole',
      ul(
        h('span', {}, 'Klikněte na ', b('⟳ Aktualizovat data'), ' – appka stáhne aktuální stav z chess-results. Kolo „automaticky“ samo přejde na nejnovější.'),
        h('span', {}, 'Žlutá ', b('upozornění'), ' nad náhledem hlídají např. chybějící výsledky v kole nebo pořadí, které zatím zaostává za losem.'),
      )),
    section('5. Profily',
      ul(
        h('span', {}, 'Profil je sada nastavení vzhledu: písmo, okraje, záhlaví a zápatí, sloupce a možnosti výstupů. Vybírá se nahoře v liště, každá záložka turnaje si ho pamatuje.'),
        h('span', {}, 'Profily spravujete v ', b('⚙ Nastavení → Profily'), ' (nový, kopie, přednastavené, export / import na jiný počítač).'),
        h('span', {}, 'Vše, co změníte v nastavení, se ukládá do ', b('aktivního profilu'), ' – platí tedy pro všechny turnaje s tímto profilem.'),
      )),
    section('6. Záhlaví, obrázky a vodoznak',
      ul(
        h('span', {}, b('⚙ Nastavení → Záhlaví a zápatí'), ': nadpis (Enter = další řádek, proměnné jako ', h('code', {}, '{turnaj}'), ', ', h('code', {}, '{skupina}'), '), velikost nadpisu v pt, pořadatel, rozhodčí, loga, QR kód, zápatí a poděkování sponzorům.'),
        h('span', {}, b('Nadpis jen pro jeden turnaj'), ' (když profil sdílí více turnajů) nastavíte vlevo v kartě 1. Turnaj → „Nadpis pro tisk – jen tento turnaj“.'),
        h('span', {}, 'Obrázky (loga turnaje, pořadatele, svazu, sponzorů) nahrajte v ', b('⚙ Nastavení → Obrázky'), ' – v záhlaví, zápatí a u vodoznaku je pak jen vyberete. Ve výchozím stavu se tisknou černobíle.'),
        h('span', {}, b('Vodoznak'), ' (logo světle přes celou stránku) je v ', b('⚙ Nastavení → Stránka'), '.'),
      )),
    section('7. Sloupce tabulek',
      ul(
        h('span', {}, b('⚙ Nastavení → Výstup → Sloupce'), ' (nebo tlačítko „Sloupce, písmo a orientace…“ pod možnostmi): zaškrtnutím sloupec zobrazíte, pořadí změníte přetažením za ⋮⋮.'),
        h('span', {}, 'Vlastní nadpis, šířka (mm nebo %) a písmo sloupce. ', b('min.'), ' = sloupec jen na šířku textu, ', b('max.'), ' = sloupec dostane přebytečnou šířku.'),
      )),
    section('8. Když něco nejde',
      ul(
        h('span', {}, 'Stránku obnovte klávesami ', kbd('Ctrl'), '+', kbd('F5'), ' (appka se jinak aktualizuje sama).'),
        h('span', {}, 'Když se data nestáhnou, uložte stránku z chess-results (', kbd('Ctrl'), '+', kbd('S'), ') a nahrajte ji přes ', b('Vložit HTML ručně'), '.'),
        h('span', {}, 'Zálohu nastavení (profily, obrázky) uložíte v ', b('⚙ Nastavení → Záloha'), '.'),
      )),
    section('Klávesové zkratky',
      h('table', { class: 'about-keys' }, h('tbody', {},
        [[[kbd('←'), ' ', kbd('→')], 'předchozí / další kolo'],
          [[kbd('1'), '–', kbd('9')], 'výběr výstupu'],
          [[kbd('Ctrl'), '+', kbd('P')], 'tisk'],
          [[kbd('?')], 'toto okno']].map(([k, t]) => h('tr', {}, h('td', {}, ...k), h('td', {}, t)))))));
}

/** „27. 11. 2026“ */
function fmtDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}. ${m}. ${y}`;
}

function news(seen) {
  return h('div', { class: 'about-news' },
    CHANGELOG.map((e) => h('section', { class: `about-sec${seen && e.date > seen ? ' is-new' : ''}` },
      h('h3', {}, fmtDay(e.date), seen && e.date > seen ? h('span', { class: 'about-new' }, 'nové') : null),
      h('ul', {}, e.items.map((t) => h('li', {}, t))))));
}

function about() {
  return h('div', { class: 'about-info' },
    p(b('Šachový tisk'), ' – tisk turnajů z chess-results.com pro rozhodčí a pořadatele.'),
    p('Verze ze dne ', b(fmtDay(CHANGELOG[0].date)), '. Nová verze se načte automaticky; když ne, obnovte stránku (', kbd('Ctrl'), '+', kbd('F5'), ').'),
    p('Data stahuje z veřejných stránek chess-results.com (přes vlastní proxy). Appka není oficiální součástí chess-results ani Swiss-Manageru – výsledky a pořadí jsou vždy tak, jak je zveřejnil rozhodčí.'),
    p('Nastavení, profily a obrázky se ukládají jen v tomto prohlížeči (na tomto počítači). Na jiný počítač je přenesete exportem profilů nebo zálohou v ⚙ Nastavení.'));
}

const TABS = [['guide', 'Návod'], ['news', 'Novinky'], ['about', 'O aplikaci']];

/**
 * Vykreslí obsah okna.
 * @param {HTMLDialogElement} dlg
 * @param {{ tab?: string, seen?: string|null, onClose: () => void }} o
 */
export function renderAbout(dlg, { tab = 'guide', seen = null, onClose }) {
  let current = tab;
  const body = h('div', { class: 'about-body' });
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const draw = () => {
    clear(body);
    for (const btn of tabs.children) btn.setAttribute('aria-selected', String(btn.dataset.t === current));
    body.append(current === 'news' ? news(seen) : current === 'about' ? about() : guide());
    body.scrollTop = 0;
  };
  for (const [id, label] of TABS) {
    tabs.append(h('button', { type: 'button', class: 'btn small', role: 'tab', dataset: { t: id }, onclick: () => { current = id; draw(); } }, label));
  }
  clear(dlg);
  dlg.append(h('div', { class: 'about-head' },
    h('h2', {}, '♞ Šachový tisk'),
    tabs,
    h('button', { type: 'button', class: 'btn small', onclick: onClose, 'aria-label': 'Zavřít' }, '✕ Zavřít')), body);
  draw();
}

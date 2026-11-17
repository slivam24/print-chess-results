// Průvodce „tiskem jedním klikem“. Webová stránka nesmí sama vybrat tiskárnu ani tisknout
// bez dialogu – umí to ale prohlížeč, když se spustí se zvláštním přepínačem
// (Chrome/Edge: --kiosk-printing, Firefox: print.always_print_silent).

import { h } from './dom.js';

const CHROME_WIN = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_WIN = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

/** Zjistí prohlížeč a systém (jen pro výběr návodu, nic se neukládá). */
export function detectEnv(ua = globalThis.navigator ? navigator.userAgent : '') {
  const os = /Windows/i.test(ua) ? 'win' : /Mac OS X|Macintosh/i.test(ua) ? 'mac' : 'other';
  let browser = 'other';
  if (/Edg\//.test(ua)) browser = 'edge';
  else if (/Firefox\//.test(ua)) browser = 'firefox';
  else if (/Chrome\//.test(ua)) browser = 'chrome';
  else if (/Safari\//.test(ua)) browser = 'safari';
  return { os, browser };
}

/** Příkaz / cíl zástupce, který spustí appku s tiskem bez dialogu. */
export function launchCommand({ os, browser }, url) {
  const b = browser === 'edge' ? 'edge' : 'chrome';
  if (os === 'mac') {
    const app = b === 'edge' ? 'Microsoft Edge' : 'Google Chrome';
    return `open -na "${app}" --args --kiosk-printing "${url}"`;
  }
  if (os === 'win') return `"${b === 'edge' ? EDGE_WIN : CHROME_WIN}" --kiosk-printing "${url}"`;
  return `${b === 'edge' ? 'microsoft-edge' : 'google-chrome'} --kiosk-printing "${url}"`;
}

function copyBox(text) {
  const input = h('input', { type: 'text', readonly: true, value: text, class: 'copy-input', onfocus: (e) => e.target.select() });
  const btn = h('button', {
    type: 'button', class: 'btn small',
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        input.select();
        document.execCommand && document.execCommand('copy');
      }
      btn.textContent = '✓ Zkopírováno';
      setTimeout(() => { btn.textContent = 'Kopírovat'; }, 1800);
    },
  }, 'Kopírovat');
  return h('div', { class: 'copy-row' }, input, btn);
}

const ol = (...items) => h('ol', { class: 'steps' }, items.filter(Boolean).map((x) => (x.tagName === 'LI' ? x : h('li', {}, x))));

/** Vykreslí záložku „Tisk“ do karty nastavení. */
export function renderPrintSetup(card, { appUrl, onTestPrint, env = detectEnv() }) {
  let browser = ['chrome', 'edge', 'firefox'].includes(env.browser) ? env.browser : 'chrome';
  const body = h('div');
  const tabs = h('div', { class: 'row wrap', role: 'tablist', style: { margin: '8px 0' } });

  const firstPrint = () => h('li', {}, h('b', {}, 'Jednou vytiskněte normálně přes dialog'),
    ' (tlačítkem Tisknout, ještě bez zástupce): vyberte tiskárnu, Okraje „Výchozí“, Měřítko „Výchozí“ (100 %) a vypněte „Záhlaví a zápatí“. ',
    'Prohlížeč si tiskárnu i nastavení zapamatuje a tisk jedním klikem je pak použije.');

  const draw = () => {
    body.replaceChildren();
    for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.b === browser));
    if (browser === 'firefox') {
      body.append(
        ol(
          firstPrint(),
          h('span', {}, 'Do adresního řádku Firefoxu napište ', h('code', {}, 'about:config'), ' a potvrďte upozornění.'),
          h('span', {}, 'Vyhledejte ', h('code', {}, 'print.always_print_silent'), '. Když neexistuje, vyberte „Boolean“ a klikněte na +. Nastavte ', h('b', {}, 'true'), '.'),
          'Hotovo – tlačítko Tisknout tiskne rovnou na naposledy použitou tiskárnu.',
        ),
        h('p', { class: 'help' }, 'Pozor: platí pro všechny stránky ve Firefoxu. Změna tiskárny: dočasně nastavte zpět false, vytiskněte přes dialog na jinou tiskárnu a pak zase true.'),
      );
      return;
    }
    const name = browser === 'edge' ? 'Edge' : 'Chrome';
    const cmd = launchCommand({ os: env.os, browser }, appUrl);
    if (env.os === 'mac') {
      body.append(ol(
        firstPrint(),
        h('span', {}, `Úplně ukončete ${name} (⌘Q).`),
        h('span', {}, 'Otevřete Terminál a spusťte příkaz:', copyBox(cmd)),
        `Appka se otevře v ${name} a tlačítko Tisknout tiskne rovnou bez dialogu. Platí, dokud ${name} neukončíte.`,
      ));
    } else if (env.os === 'win') {
      body.append(
        ol(
          firstPrint(),
          h('span', {}, 'Na ploše klikněte pravým tlačítkem → ', h('b', {}, 'Nový → Zástupce'), ' a do pole „Zadejte umístění položky“ vložte:', copyBox(cmd)),
          'Klikněte Další, pojmenujte zástupce „Šachový tisk“ a Dokončit.',
          h('span', {}, h('b', {}, `Úplně zavřete ${name}`), ' – všechna okna, a pokud běží na pozadí, i jeho ikonu vedle hodin. Pak spusťte appku tímto zástupcem.'),
          'Tlačítko Tisknout (i Ctrl+P) teď tiskne rovnou bez dialogu.',
        ),
        h('p', { class: 'help' },
          `Když Windows hlásí, že soubor neexistuje, je ${name} nainstalovaný jinde: otevřete v něm adresu `,
          h('code', {}, browser === 'edge' ? 'edge://version' : 'chrome://version'),
          ', zkopírujte „Cesta ke spustitelnému souboru“ a použijte ji místo cesty v uvozovkách na začátku.'),
      );
    } else {
      body.append(ol(firstPrint(), h('span', {}, `Úplně zavřete ${name} a spusťte ho příkazem:`, copyBox(cmd))));
    }
    body.append(...[
      h('p', { class: 'help' },
        `Přepínač platí jen pro okno spuštěné zástupcem, a jen když ${name} předtím neběžel – jinak se okno připojí k běžícímu prohlížeči a dialog se zase ukáže. `,
        'Tiskne se na naposledy použitou tiskárnu (v tomto prohlížeči). ',
        h('b', {}, 'Změna tiskárny:'), ` zavřete ${name}, spusťte ho normálně (ne zástupcem), vytiskněte jednou přes dialog na jinou tiskárnu a znovu otevřete zástupce.`),
      browser === 'chrome'
        ? h('p', { class: 'help' }, 'Tip: když Chrome používáte celý den na jiné věci, udělejte zástupce pro Edge – Chrome pak nemusíte zavírat. Profily do Edge přenesete v záložce Profily (Export → Import).')
        : null,
    ].filter(Boolean));
  };

  for (const [id, label] of [['chrome', 'Chrome'], ['edge', 'Edge'], ['firefox', 'Firefox']]) {
    tabs.append(h('button', {
      type: 'button', class: 'btn small', role: 'tab', dataset: { b: id },
      onclick: () => { browser = id; draw(); },
    }, label + (env.browser === id ? ' (tento)' : '')));
  }

  card.append(...[
    h('h2', {}, 'Tisk jedním klikem'),
    h('p', { class: 'small' },
      'Webová stránka z bezpečnostních důvodů nemůže sama vybrat tiskárnu ani tisknout bez dialogu. ',
      'Prohlížeč to ale umí zapnout: tlačítko Tisknout pak pošle stránky rovnou na tiskárnu, kterou jste v něm naposledy použili.'),
    env.browser === 'safari' ? h('p', { class: 'help' }, 'Safari tisk bez dialogu neumí – použijte Chrome, Edge nebo Firefox.') : null,
    tabs,
    body,
    h('div', { class: 'row wrap', style: { marginTop: '10px' } },
      h('button', { type: 'button', class: 'btn', onclick: onTestPrint }, '🖨 Vyzkoušet tisk aktuálního náhledu')),
    h('p', { class: 'help', style: { marginTop: '10px' } },
      'Orientaci (na výšku / na šířku) a okraje určuje appka podle výstupu, prohlížeč je převezme sám. ',
      'V dialogu tisku proto nechte Okraje „Výchozí“ a Měřítko „Výchozí“.'),
  ].filter(Boolean));
  draw();
}

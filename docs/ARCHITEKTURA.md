# Architektura

## Struktura repozitáře

```
index.html                 jediná stránka appky (GitHub Pages servíruje kořen repozitáře)
css/
  app.css                  rozhraní (panel, náhled, dialogy)
  print.css                vzhled tiskových stránek – platí pro náhled i tisk, @media print
js/
  main.js                  ovladač: načtení turnaje, výběr výstupu, náhled, tisk, ruční vložení
  store.js                 nastavení: profily, šablony, proxy, poslední turnaje, export/import
  source.js                data: URL chess-results, stažení přes proxy, mezipaměť, ruční HTML
  render.js                šablona + data + profil → bloky a parametry sazby (bez DOM)
  layout.js                stránkovací engine: bloky → stránky A4 (měření v DOM)
  parser/                  čtení HTML chess-results (bez závislosti na prohlížeči)
    dom.js                 pomůcky: text, čísla s ½, výsledky, čísla kol
    headers.js             slovník hlaviček sloupců EN/CS/DE, popisky informací o turnaji
    info.js                metadata, menu (kola), skupiny, typ turnaje
    tables.js              startovní listina, pořadí, los, družstva, šachovnice, detekce stránky
    index.js               veřejné rozhraní parseru
  templates/               tiskové šablony
    index.js               registr šablon
    common.js              formátování, sloupce, záhlaví, zápatí
    pairings.js            los kola, nástěnka, abecední přehled
    sheets.js              rozhodcovský list, výsledkové lístky
    lists.js               startovní listina, pořadí, soupisky, tabulka družstev
    team.js                los zápasů, rozpis šachovnic
  ui/
    dom.js                 pomocník h(), stahování souborů, zmenšení loga
    settings.js            panel nastavení (profily, stránka, záhlaví, výstup, připojení, záloha)
worker/
  worker.js                Cloudflare Worker – CORS proxy
  wrangler.toml            konfigurace pro nasazení přes wrangler
  README.md                návod k nasazení proxy
tests/
  fixtures/*.html          uložené stránky chess-results (anonymizované)
  parser.test.js           testy parseru
  templates.test.js        testy šablon, sloupců, stránkování
  worker.test.js           testy proxy
tools/
  dev-server.mjs           lokální server: appka + proxy (npm run dev)
  fetch-fixtures.sh        stažení vzorových stránek
```

## Tok dat

```
chess-results HTML ──(proxy)──▶ source.js ──▶ parser ──▶ datové objekty (cache v paměti + localStorage)
                                                               │
profil (store.js) ─────────────┐                              ▼
                               └──▶ render.js: šablona.render() → bloky + záhlaví/zápatí
                                                               │
                                                               ▼
                                     layout.js: měření → stránky A4 → #pages (náhled = tisk)
```

### Stránky chess-results, které appka čte

Vše s `lan=1&turdet=YES&zeilen=99999`:

| Dataset (`source.js`) | `art` | Obsah |
|---|---|---|
| `main` | – | hlavní stránka: informace, menu s koly, skupiny; u jednotlivců startovní listina |
| `pairings` | 2 + `rd` | los kola jednotlivců (u kruhového systému všechna kola najednou) |
| `ranking` | 1 + `rd` | pořadí po kole |
| `crosstable` | 4 | křížová tabulka (parser hotový, šablona zatím ne) |
| `teams` | 32 | družstva |
| `teamPlayers` | 16 | hráči družstev se šachovnicemi |
| `teamPairings` | 2 + `rd` | zápasy družstev |
| `boards` | 3 + `rd` | šachovnice zápasů (sestavy, barvy, výsledky) |
| `teamRanking` | 46 + `rd` | tabulka družstev |

### Datový model (výstup parseru)

```js
info = { tnr, title, type, isTeam, system: 'swiss'|'roundrobin', totalRounds,
         pairedRounds: [1..], rankedRounds: [1..], lastPairedRound, lastRankedRound,
         lastUpdate, lastUpdateText, dateFrom, dateTo,
         fields: { organizer, director, chiefArbiter, deputyArbiter, arbiter, timeControl, location, … },
         groups: [{ tnr, name, current }] }

player  = { startNo, title, name, fideId, fed, rating, ratingNat, club, group, team?, board? }
ranking = { round, final, rows: [{ rank, startNo, name, points, tb: ['18,5', …], cross?: […] }],
            tiebreaks: [{ key: 'TB1', label: 'Buchholz …' }] }
pairings = { rounds: [{ round, date, time, published, hasResults,
             pairings: [{ board, white: {startNo, name, rating, points, title}, black | null, bye?, result }] }] }
boards  = { rounds: [{ round, lineupsPublished, matches: [{ no, home: {no, name}, away, score,
             boards: [{ board, home: {name, color: 'w'|'b'}, away, result }] }] }] }
result  = { text: '1 - 0', white: '1', black: '0', played, forfeit }
```

Robustnost parseru:

- sloupce se mapují **podle textu hlavičky** (EN/CS/DE synonyma), ne podle pozice – vlastní konfigurace sloupců v Swiss-Manageru nevadí,
- strana bílého/černého se určuje podle polohy vůči sloupci „Result“,
- prázdná hlavička před jménem = titul; startovní číslo se doplní i z odkazu (`snr=`),
- volno/nenasazen se rozpozná podle textu (`bye`, `not paired`, `volno`, …) nebo čísla ≤ 0,
- nezveřejněné kolo = stránka bez tabulky → `rounds: []` → appka zobrazí upozornění,
- DOMParser dekóduje entity, takže diakritika je v pořádku; řazení používá `Intl.Collator('cs')` (CH za H).

## Jak přidat nový výstup (šablonu)

1. Vytvořte modul v `js/templates/` (nebo přidejte do existujícího) a exportujte objekt:

```js
export const roundResults = {
  id: 'round-results',                   // unikátní, ukládá se do profilu
  name: 'Výsledky kola',
  description: 'Krátký popis do seznamu výstupů.',
  group: 'Los kola',                     // nadpis skupiny v seznamu
  supports: (info) => !info.isTeam,      // pro které turnaje
  roundMode: 'pairings',                 // 'pairings' | 'ranking' | null → výběr kola
  options: [                             // volby ve „3. Možnosti“, ukládají se do profilu
    { key: 'showByes', label: 'Uvést volno', type: 'bool', def: true },
    // type: 'bool' | 'select' (choices: [[hodnota, popisek]]) | 'number' (min, max) | 'text' | 'category'
    //       | 'categories' (editor vlastních kategorií: [{ name, types, groups, sex, on }])
  ],
  columns: [                             // sloupce, které si uživatel může přeuspořádat a skrýt
    { key: 'board', label: 'Š.', cls: 'c num', get: (row, ctx) => String(row.board) },
    // def: false = ve výchozím stavu skrytý; hideEmpty: true = skrýt, když je všude prázdný
    // get vrací už escapované HTML (použijte esc() z common.js)
    // nadpisy sloupců rating*/…Rating (RtgF / RtgN / Elo) nastaví render.js podle zveřejněných ratingů
  ],
  defaults: { orientation: 'portrait', columns: 1 },
  needs: ({ info, round, opts }) => [{ dataset: 'main' }, { dataset: 'pairings', round }],
  // volitelné: úpravy sazby – fit na jednu stránku, bez záhlaví…
  layout: (opts, page) => ({ fit: { enabled: false } }),
  render({ info, data, round, opts, cols, nameFormat, profile, page }) {
    return {
      title: `Výsledky ${round}. kola`,  // nadpis výstupu pod záhlavím
      sub: '',                           // doplněk (datum, čas)
      blocks: [ /* viz níže */ ],
      warnings: [],                      // žluté upozornění nad náhledem
    };
  },
};
```

2. Přidejte ho do pole `TEMPLATES` v `js/templates/index.js`.
3. Přidejte test do `tests/templates.test.js` (stačí vykreslit nad fixtures a ověřit obsah).

### Bloky pro stránkovač

| Blok | Chování |
|---|---|
| `{ type: 'table', thead, rows: ['<tr>…</tr>'], colgroup?, className? }` | dělí se po řádcích, hlavička se opakuje na každé stránce/sloupci |
| `{ type: 'table', …, keepTogether: true }` | nerozdělí se (např. jeden zápas družstev) |
| `{ type: 'html', html, keepWithNext? }` | nedělitelný blok; `keepWithNext` drží nadpis s následujícím blokem |
| `{ …, breakBefore: true }` | začne na nové stránce |
| `{ type: 'break' }` | konec stránky |

Pomocníci v `common.js`: `theadRow(cols)`, `bodyRow(cols, item, ctx)`, `colgroup(cols)`, `pruneEmpty(cols, items, ctx)`,
`sectionTitle(text, sub)`, `noteBlock(html)`, `fmtName`, `fmtPoints`, `fmtResult`, `fmtRating`, `fmtDate`, `esc`.

### Připravené rozšíření

- **Výsledky kola**: data jsou v `pairings` (`result`), stačí šablona podle vzoru `pairingsTable` s `showResults: true`.
- **Křížová tabulka**: parser `parseRanking` nad `art=4` vrací `rows[].cross` a `crossRounds`; dataset `crosstable` je v `source.js`.

## Stránkování (layout.js)

1. Šablona vrátí bloky. `render.js` přidá záhlaví a zápatí podle profilu.
2. `layout.js` vytvoří skrytou zkušební stránku se stejnými styly, změří výšku těla stránky a výšku každého bloku
   a řádku tabulky (jedno rozvržení, pak už jen součty).
3. Čistá funkce `pack()` (testovaná bez DOM) rozdělí bloky do sloupců a stránek.
4. Vzniknou skutečné `<section class="page">` o rozměru A4 s vlastními okraji; `@page { margin: 0 }`.
   Náhled je tedy přesně to, co se vytiskne – včetně čísel stránek v zápatí (bez závislosti na podpoře `@page` margin boxů).
5. Režim „na jednu stránku“ (nástěnka) hledá binárně největší písmo, při kterém se vše vejde výškou i šířkou;
   pokud je písmo malé, zkusí 2–3 sloupce.

## Úložiště

- `localStorage['chessPrint.v1']` – stav: `{ version, proxyUrl, activeProfileId, profiles[], recent[], ui }`.
- `localStorage['chessPrint.lastData.v1']` – poslední stažená data pro rychlé obnovení po načtení stránky.
- Profil: `{ id, name, page: {orientation, margins, fontFamily, fontSize}, nameFormat, header: {…, logo}, footer: {…},
  templates: { [id]: { columns: [{key, on, label?}], orientation, fontSize, pageColumns, options: {…} } } }`.
- Import zálohy prochází `normalizeState()` – chybějící klíče se doplní z výchozích hodnot, takže staré zálohy fungují i po přidání nových voleb.

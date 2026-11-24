# ♞ Šachový tisk – tisk turnajů z chess-results.com

Statická webová aplikace pro pohodlný tisk šachových turnajů, které řídíte ve Swiss-Manageru a nahráváte na [chess-results.com](https://chess-results.com).
Jednou si nastavíte, jak mají výstupy vypadat, a pak už jen: **stáhnout → vybrat → tisknout**. Po dalším kole stačí kliknout na **Aktualizovat data**.

- Před turnajem: **startovní listina** a **abecední seznam hráčů**
- Los kola: běžná tabulka, **velká varianta na nástěnku** (automaticky na jednu stránku) a **abecední přehled „kdo kde hraje“**
- **Rozhodcovský list kola** a **výsledkové lístky** k rozstříhání (4–12 na stránku)
- Startovní listina a pořadí (i po kategoriích), **soupisky škol / klubů** i u švýcaru jednotlivců hodnoceného do družstev
- Družstva: **los zápasů**, **rozpis hráčů na šachovnicích** (s podpisy kapitánů), soupisky, tabulka
- Švýcar, každý s každým, družstva i turnaje s **více skupinami** (tisk jedné nebo všech)
- **Profily** (přednastavené: „Švýcar jednotlivců“, „Každý s každým jednotlivci“, „Každý s každým – družstva školy“) s vlastním písmem, okraji, orientací, sloupci, záhlavím (nadpis na více řádků, loga turnaje / pořadatele / svazu), zápatím (i s logy sponzorů) a vodoznakem
- Náhled přesně odpovídá tisku (A4, stránkování dělá appka sama)
- Vše se pamatuje v prohlížeči, záloha do JSON jedním klikem
- Proxy pro stahování z chess-results je součástí appky – nic se nenastavuje
- Záložní režim bez proxy: ruční vložení uložených stránek

Rozhraní je česky, appka nemá backend a nepotřebuje build.

---

## Obsah

1. [Jak to funguje](#jak-to-funguje)
2. [Nasazení na GitHub Pages](#nasazení-na-github-pages)
3. [Nasazení proxy (Cloudflare Worker)](#nasazení-proxy-cloudflare-worker)
4. [Návod k použití](#návod-k-použití)
5. [Výstupy a jejich volby](#výstupy-a-jejich-volby)
6. [Profily, záhlaví a záloha](#profily-záhlaví-a-záloha)
7. [Když něco nejde](#když-něco-nejde)
8. [Vývoj a testy](#vývoj-a-testy)

---

## Jak to funguje

```
 prohlížeč (GitHub Pages)                Cloudflare Worker            chess-results.com
 ┌────────────────────────┐   ?url=…    ┌────────────────────┐  GET  ┌──────────────────┐
 │ index.html + js/ (ESM) │ ──────────▶ │ /worker/worker.js  │ ────▶ │ tnrNNN.aspx?art… │
 │ parser → šablony →     │ ◀────────── │ allowlist, CORS,   │ ◀──── │ (HTML)           │
 │ stránkování → tisk     │   HTML+CORS │ cache 60 s         │       └──────────────────┘
 └────────────────────────┘             └────────────────────┘
```

chess-results.com nemá API a prohlížeč jeho stránky kvůli CORS přímo číst nesmí. Proto appka používá malou proxy –
Cloudflare Worker (zdarma, 100 000 požadavků denně). Ta je **součástí appky**: kód je ve složce `worker/`, nasazený Worker
`https://chess-print-proxy.slivam24.workers.dev` je v appce nastavený jako výchozí (`DEFAULT_PROXY_URL` v `js/store.js`)
a Cloudflare ho automaticky znovu nasadí při každé změně ve složce `worker/` na větvi `main`. Proxy propouští jen domény chess-results.com,
přidává CORS hlavičky a krátce (60 s) cachuje. Tlačítko „Aktualizovat data“ cache vždy obchází.

Appka stahuje anglickou verzi stránek (stabilnější názvy sloupců), všechny texty výstupů jsou ale česky.

---

## Nasazení na GitHub Pages

Repozitář je hotová statická stránka – nic se nekompiluje.

1. Na GitHubu otevřete repozitář → **Settings** → **Pages**.
2. V části **Build and deployment** zvolte **Source: Deploy from a branch**.
3. Vyberte větev (např. `main`) a složku **`/ (root)`**, klikněte na **Save**.
4. Za minutu bude appka na adrese `https://<uživatel>.github.io/<repozitář>/`
   (pro tento repozitář `https://slivam24.github.io/print-chess-results/`).

> Pokud chcete kratší adresu (např. `…/chess-print/`), repozitář přejmenujte v **Settings → General → Repository name**.
> Po přejmenování upravte i `ALLOWED_ORIGINS` u proxy (viz níže) – stačí doména `https://slivam24.github.io`.

Soubor `.nojekyll` v kořeni zajišťuje, že GitHub soubory jen vystaví beze změn.

---

## Nasazení proxy (Cloudflare Worker)

> Pro tuto appku je proxy už nasazená a vestavěná – tato sekce je potřeba jen pro vlastní kopii appky
> (fork). Po nasazení vlastního Workeru změňte `DEFAULT_PROXY_URL` v `js/store.js`, nebo adresu zadejte v ⚙ Nastavení → Připojení.

Podrobný návod krok za krokem je v [`worker/README.md`](worker/README.md). Zkráceně:

### Varianta A – přes webové rozhraní (bez instalace čehokoli)

1. Zaregistrujte se zdarma na <https://dash.cloudflare.com/sign-up>.
2. V levém menu otevřete **Workers & Pages** (může být pod položkou **Compute**) → **Create** → **Create Worker** (případně „Start with Hello World“).
3. Pojmenujte ho např. `chess-print-proxy` a klikněte **Deploy** (nasadí se ukázkový kód).
4. Klikněte **Edit code**, smažte obsah souboru `worker.js` a vložte celý obsah souboru
   [`worker/worker.js`](worker/worker.js) z tohoto repozitáře. Klikněte **Deploy**.
5. Zkopírujte adresu workeru, např. `https://chess-print-proxy.vas-ucet.workers.dev`.
6. V appce otevřete **⚙ Nastavení → Připojení**, vložte adresu, klikněte **Otestovat** a **Uložit**.

### Varianta B – příkazová řádka (wrangler)

```bash
cd worker
```

```bash
npx wrangler login
```

```bash
npx wrangler deploy
```

Wrangler vypíše adresu workeru. Nastavení (`ALLOWED_ORIGINS`, `CACHE_SECONDS`) je v [`worker/wrangler.toml`](worker/wrangler.toml).

### Zabezpečení

Proxy smí používat jen stránky uvedené v `ALLOWED_ORIGINS` v [`worker/wrangler.toml`](worker/wrangler.toml)
(teď `https://slivam24.github.io` a `http://localhost:8787` pro vývoj). Při nasazení z GitHubu tato hodnota přepíše
proměnnou nastavenou ve webovém rozhraní Cloudflare – měňte ji proto v repozitáři.

---

## Návod k použití

### Před turnajem (jednou)

1. Proxy je vestavěná, není potřeba nic nastavovat. (V **⚙ Nastavení → Připojení** lze zadat vlastní.)
2. **⚙ Nastavení → Profily**: vyberte nebo vytvořte profil. Appka má tři přednastavené profily podle skutečného použití
   (**Švýcar jednotlivců** – vč. kategorií U10/U12/U16 a S50/S65, **Každý s každým jednotlivci**, **Každý s každým – družstva školy**);
   chybějící doplní tlačítko **+ Přednastavené profily**. Profil můžete **duplikovat** a **přejmenovat**.
   Výchozí nastavení vychází z toho, jak se appka používá: písmo co největší, záhlaví vlevo, zápatí vypnuté,
   los bez startovních čísel a titulů, rozpis šachovnic bez barev a podpisů.
3. **⚙ Nastavení → Obrázky**: jedno místo, kam se nahrávají všechna loga (turnaj, pořadatel, svaz, sponzoři) –
   společná pro všechny profily, ukládají se zmenšená a úsporně. **Záhlaví a zápatí**: nadpis i na více řádků
   (např. „Okresní kolo přeboru škol“ / „{skupina}“, druhý řádek může být menší), pořadatel, rozhodčí, loga vlevo
   i vpravo a poděkování sponzorům s logy – obojí se vybírá z Obrázků, každé logo jde tisknout černobíle (výchozí)
   nebo barevně. **Stránka → Vodoznak**: obrázek z Obrázků světle přes celou stránku – viditelnost v %, černobíle
   nebo barevně, velikost; u jednotlivého výstupu ho jde vypnout.
4. **⚙ Nastavení → Stránka**: písmo, velikost, okraje (výchozí 5 mm), orientace, vzhled tabulek (mřížka jako Swiss-Manager / pruhy),
   formát jmen (výchozí `Novák Jindřich` jako ve Swiss-Manageru, dále `Novák, Jindřich`, `NOVÁK Jindřich`, …).
5. Pro každý výstup zvlášť (**⚙ Nastavení → Výstup**, nebo tlačítko „Sloupce, písmo a orientace…“): které sloupce a v jakém pořadí (pořadí změníte přetažením za úchyt ⋮⋮),
   vlastní nadpisy, **šířka sloupce (v mm, nebo v % šířky tabulky, např. `10 %`)** a **velikost písma sloupce (pt)**,
   **výška řádku (mm)**, orientace, velikost písma, počet sloupců na stránce. Celá tabulka má jednotnou velikost písma,
   pokud ji u sloupce nezměníte. Bez zadané šířky se úzké sloupce (čísla, body, rating…) samy přizpůsobí nejdelšímu textu
   včetně nadpisu; protějškové sloupce (bílý/černý, domácí/hosté) mají stejnou šířku a zbytek dostanou sloupce se jmény.
   Velikost písma může být **pevná**, nebo **co největší** – appka zvolí největší písmo (do zadané hranice), při kterém
   se všechny sloupce vejdou na šířku stránky bez zalamování.
6. **⚙ Nastavení → Záloha → Exportovat zálohu** – uschovejte si soubor JSON.

### Během turnaje (každé kolo)

1. Ve Swiss-Manageru vylosujte kolo a nahrajte ho na chess-results.
2. V appce zadejte **číslo turnaje** (např. `1495793`) nebo vložte **odkaz** z chess-results a klikněte **Stáhnout**.
   Odkaz na konkrétní stránku (např. `…art=2&rd=7`) rovnou předvybere výstup a kolo. Poslední turnaje jsou pod polem jako štítky.
3. Vyberte **co tisknout** (dlaždice s názvem, popis po najetí myší; možnosti vybraného výstupu jsou hned pod nimi) – náhled se zobrazí vpravo. Nad náhledem jedním klikem přepnete **Orientaci** (↕ na výšku / ↔ na šířku)
   a **Písmo**: *Pevné* (podle nastavení), *Co největší* (aby se vešly všechny sloupce, tabulka může pokračovat na další
   stránce) nebo *1 strana A4* (písmo i výška řádků co největší, aby se vše vešlo na jednu stránku; když to nejde ani při 6 pt,
   vytiskne se na co nejméně stránek). Šířku levého panelu změníte tažením svislé lišty mezi panelem a náhledem
   (dvojklik = výchozí šířka); náhled ukazuje celou stránku, větší zobrazení vyberete v „Zvětšení“. Kolo je ve výchozím stavu
   **automaticky** poslední vylosované. **Klávesy:** `←` / `→` předchozí / další kolo, `1`–`9` výstup v pořadí nabídky.
   Upozornění nad náhledem jsou sbalená na jeden řádek, celá je zobrazíte odkazem „zobrazit“.
4. **🖨 Tisknout** – tlačítko v liště nad náhledem (nebo `Ctrl+P`). V tiskovém dialogu nechte měřítko 100 % a okraje „Výchozí“.
   Tisk **jedním klikem bez dialogu** si zapnete podle průvodce v ⚙ Nastavení → Tisk (viz níže).
5. Po nahrání výsledků a dalšího losu klikněte **⟳ Aktualizovat data** a tiskněte znovu.

Appka ukazuje, **kdy byl turnaj na chess-results naposledy aktualizován** a **kdy jste data stáhli**.
Pokud los zvoleného kola ještě není zveřejněný, zobrazí žluté upozornění.
Po zavření a otevření prohlížeče se poslední turnaj zobrazí hned z uložených dat (pro aktuální stav klikněte na Aktualizovat).

Tip: odkaz `…/?t=1495793` otevře turnaj rovnou.

### Tisk jedním klikem (bez dialogu)

Webová stránka sama tiskárnu vybrat nesmí, prohlížeč ale umí tisknout bez dialogu na naposledy použitou tiskárnu.
Průvodce v **⚙ Nastavení → Tisk** připraví vše ke zkopírování:

- **Chrome / Edge:** zástupce, který spustí appku s přepínačem `--kiosk-printing`
  (např. `"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing "https://slivam24.github.io/print-chess-results/"`).
  Funguje, jen když prohlížeč předtím úplně zavřete. Kdo Chrome používá i na jiné věci, může zástupce udělat pro Edge.
- **Firefox:** v `about:config` nastavit `print.always_print_silent` na `true` (platí pro všechny stránky).
- Tiskárnu a nastavení (barva, oboustranně…) si prohlížeč pamatuje z posledního tisku přes dialog – proto jednou vytiskněte
  normálně (Okraje „Výchozí“, Měřítko „Výchozí“). Orientaci a okraje určuje appka podle výstupu.

### Více turnajů najednou (záložky)

Když se hraje víc turnajů současně, každý má v horní liště vlastní **záložku**. Nový turnaj otevřete tlačítkem **+**
(nebo zadáním dalšího čísla turnaje). Už otevřený turnaj se jen přepne. Každá záložka si pamatuje **svůj profil**
(vybraný v horní liště), zvolený výstup, kolo a skupinu. Záložky i stažená data zůstanou po zavření prohlížeče.
Křížkem záložku zavřete.

### Více skupin / turnajů

Pokud má turnaj na chess-results „Výběr turnaje“ (např. A/B/C, H18+H20 a D18+D20, ligy), objeví se výběr **Skupina / turnaj**
s možností **Všechny skupiny** – každá skupina se vytiskne s vlastním záhlavím od nové stránky.
Kategorie uvnitř jednoho turnaje (sloupce „Typ“ a „Gr“, např. U10, U12) lze u startovní listiny a pořadí vyfiltrovat nebo vytisknout **každou zvlášť**.
Pro vyhlášení cen slouží **Pořadí + kategorie**: vytvoříte si kategorie (např. „Nejlepší do 16 let“ = typy U16, U12, U10,
„Nejlepší nad 50 let“ = S50, S65), zaškrtnete, které tisknout, a každá dostane vlastní pořadí se sloupcem celkového pořadí.
Kategorie se ukládají do profilu, takže je příště nemusíte zadávat znovu.

---

## Výstupy a jejich volby

| Výstup | Pro | Volby |
|---|---|---|
| **Los kola** | jednotlivci | výsledky ano/ne, volno a nenasazení, sloupce (č., titul, Elo, nár. Elo, klub, federace, body…); u turnaje každý s každým v nabídce kola **všechna kola najednou** (kolo se nerozdělí na dvě stránky, nastavitelná mezera mezi koly v mm, volitelně každé kolo na samostatné stránce) |
| **Los kola – nástěnka** | jednotlivci | vše na jednu stránku, písmo se zvětší na maximum, při mnoha dvojicích dělení do sloupců, tituly, max. velikost písma |
| **Los kola – kdo kde hraje** | jednotlivci | hráči podle abecedy → šachovnice, barva, soupeř; na jednu stránku |
| **Rozhodcovský list kola** | jednotlivci | prázdné kolonky výsledek / ✓ / poznámka, výška řádku, předvyplnění známých výsledků, podpis |
| **Výsledkové lístky** | jednotlivci | 4–12 lístků na stránku, body, podpisy, vlastní krátký název |
| **Startovní listina** | jednotlivci | řazení (st. čísla / rating), kategorie; Typ a Skupina hráče, pokud je chess-results uvádí |
| **Abecední seznam hráčů** | jednotlivci | jako ve Swiss-Manageru: Č., St.č., titul, Jméno, RtgN, RtgF, FED, Klub; česká abeceda (CH za H), kategorie |
| **Soupisky škol (klubů)** | jednotlivci | pro švýcar jednotlivců hodnocený i do družstev (např. přebory škol), kde chess-results soupisky nezobrazuje: hráči ze startovní listiny seskupení podle klubu (= školy) jako „Sestava družstev“ ve Swiss-Manageru; nadpis „Soupisky družstev / škol / klubů“, pořadí družstev (abecedně, podle st. čísel, podle počtu hráčů), řazení hráčů, jen družstva s alespoň N hráči, Ø rating, družstvo nerozdělené nebo na samostatné stránce, kategorie; hráči bez klubu na konci. Na chess-results musí být zapnutý sloupec **Klub** |
| **Soupisky s výsledky kol** | jednotlivci | švýcar hodnocený i do družstev, kde chess-results zveřejňuje „Team-Composition with round-results“: hráči každé školy / klubu s výsledky jednotlivých kol, body a počtem partií; stejné šířky sloupců u všech družstev, družstvo nerozdělené nebo na samostatné stránce, pořadí jako na chess-results nebo abecedně |
| **Pořadí škol (družstev)** | jednotlivci | chess-results „Team-Ranking“: pořadí škol / klubů / družstev s body a pomocnými hodnoceními a pod každou školou hráči, kteří se započítávají, nebo všichni hráči školy (nezapočítaní šedě, ze soupisek art=71); škola se nerozdělí od svých hráčů na dvě stránky, počet míst (3 / 5 / 10 / vše), volitelně bez hráčů |
| **Pořadí** | jednotlivci | po zvoleném kole, kategorie (vč. přepočtu pořadí v kategorii), vysvětlivky pomocných hodnocení |
| **Pořadí + kategorie** | jednotlivci | pořadí s Typem a Skupinou; vlastní kategorie složené z typů / skupin / pohlaví, každá s vlastním pořadím; za sebou, nebo každá na samostatné stránce; kategorie se nerozdělí na dvě stránky (lze vypnout); volitelně i celkové pořadí |
| **Křížová tabulka** | jednotlivci, každý s každým | výsledky všech proti všem, řazení podle pořadí nebo startovních čísel, prázdná k ručnímu vyplňování (i před turnajem ze startovní listiny) |
| **Vyhlášení výsledků** | jednotlivci | nejlepší 1/3/5/10 celkově a v kategoriích z „Pořadí + kategorie“, velké písmo na jednu stránku, kategorie na samostatné stránky |
| **Los zápasů družstev** | družstva | výsledky, velké písmo na nástěnku; u soutěže každý s každým **všechna kola najednou** (mezera mezi koly, kolo na stránku) |
| **Rozpis hráčů na šachovnicích** | družstva | k rozstříhání: ve výchozím stavu bez záhlaví a zápatí, nastavitelná mezera mezi zápasy, popisek „Kolo 1, Zápas 1“, sloupce nadepsané názvy družstev, pořadí hráče na soupisce („Soup.“); sestavy a barvy, Elo ze soupisek, podpisy kapitánů a rozhodčího, zápas na stránku; když sestavy nejsou zveřejněné, doplní sestavu družstva, které má přesně tolik hráčů jako šachovnic, ostatní nechá prázdné k vyplnění; u každý s každým i všechna kola najednou |
| **Startovní pořadí družstev** | družstva | družstva podle startovních čísel, počet hráčů, Ø Elo |
| **Soupisky družstev** | družstva | družstvo na stránku, jen seznam družstev |
| **Pořadí družstev** | družstva | po kole, vysvětlivky |
| **Nejlepší na šachovnicích** | družstva | pořadí hráčů na každé šachovnici (chess-results „Board list“) k vyhlášení: počet míst (i s dělenými), šachovnice nerozdělená nebo na samostatné stránce, stejné šířky sloupců u všech šachovnic, české vysvětlivky |

Prázdné sloupce (např. tituly, když je nikdo nemá) se skrývají automaticky.
U každého výstupu jde v „Možnostech“ (pod výběrem výstupu) nastavit **Záhlaví** (jen na první stránce / na každé stránce / jen název výstupu /
vypnuto), **Zápatí** (na každé stránce / vypnuto) a **Vodoznak** (když ho profil má); „podle profilu“ = nastavení z ⚙ Nastavení → Záhlaví a zápatí.
Méně používané výstupy (los na nástěnku, kdo kde hraje, rozhodcovský list, výsledkové lístky) jsou ve výchozím stavu schované – zapnete je
v ⚙ Nastavení → Nabídka výstupů.
Ratingy: když turnaj zveřejňuje oba ratingy, sloupce se jmenují **RtgF** (FIDE) a **RtgN** (národní); když jen jeden
(nebo jen obecný „Rtg“), stačí nadpis **Elo**. Vlastní nadpis sloupce z nastavení má vždy přednost. Ve výchozím stavu je chess-results
nezobrazuje – zobrazení obou ratingů je potřeba pro turnaj povolit (při nahrávání ze Swiss-Manageru / v nastavení turnaje).
Výsledky kola a křížová tabulka jsou připravené k doplnění jako další šablony – viz [docs/ARCHITEKTURA.md](docs/ARCHITEKTURA.md).

---

## Profily, záhlaví a záloha

- Vše se ukládá do `localStorage` prohlížeče (na jednom počítači a v jednom prohlížeči).
- **Export zálohy** uloží JSON se všemi profily, logem, adresou proxy a posledními turnaji. **Import** vše nahradí obsahem zálohy.
- **Přenos profilů na jiný počítač** (⚙ Nastavení → Profily): „⬇ Export“ u profilu uloží jeden profil, „Exportovat
  všechny profily“ všechny. Na druhém počítači „Importovat profily ze souboru…“ – profily se **přidají** ke stávajícím;
  když tam stejný profil už je (podle předchozího přenosu nebo stejného názvu), **aktualizuje se**. Ostatní nastavení
  (adresa proxy, poslední turnaje) zůstane. Před importem appka ukáže, co se přidá a co přepíše.
- Celá záloha (⚙ Nastavení → Záloha) naopak při obnově nahradí úplně všechno.
- Volby výstupů (např. „8 lístků na stránku“) se ukládají do aktivního profilu, takže liga a open mohou mít jiné.

---

## Když něco nejde

**Po aktualizaci appky vidím starou verzi:** GitHub Pages dovoluje prohlížeči držet soubory až 10 minut v mezipaměti.
Appka po spuštění sama zkontroluje, zda na serveru není novější verze, a případně se jednou znovu načte.
Kdyby to nestačilo, pomůže `Ctrl+F5` (úplné obnovení stránky).

| Problém | Řešení |
|---|---|
| „Proxy neodpovídá (síť nebo CORS)“ | Otevřete <https://chess-print-proxy.slivam24.workers.dev> – má odpovědět „chess-print proxy OK“. Pokud ano, zkontrolujte v Cloudflare proměnnou `ALLOWED_ORIGINS` (musí obsahovat `https://slivam24.github.io`) a v Nastavení → Připojení, že není zadaná jiná adresa. |
| „Los X. kola zatím není zveřejněn“ | Nahrajte kolo ze Swiss-Manageru na chess-results a klikněte na Aktualizovat data. |
| Proxy nefunguje vůbec | **Vložit HTML ručně**: otevřete stránku turnaje na chess-results, uložte ji (`Ctrl+S`, „pouze HTML“) a nahrajte. Appka pozná turnaj, druh stránky i kolo. Potřebujete hlavní stránku turnaje a stránku losu/pořadí daného kola. |
| Starý turnaj (déle než 2 týdny po skončení) | Proxy sama „klikne“ na *Show tournament details*. Při ručním vkládání to udělejte na chess-results před uložením. |
| Tisk má prázdnou stránku navíc / je zmenšený | V dialogu tisku nastavte měřítko 100 % a okraje „Výchozí“; vypněte „Přizpůsobit stránce“. |
| Logo / vodoznak se neuloží | Úložiště prohlížeče je plné – odeberte některé obrázky. Appka obrázky ukládá úsporně (WebP, loga max. 600 px, sponzoři 500 px, vodoznak 1000 px) a při nedostatku místa nejdřív smaže uložená data turnajů (dají se znovu stáhnout). |

Nejlépe funguje Chrome / Edge (náhled je vyladěný pro jejich tisk), Firefox funguje také.

---

## Vývoj a testy

Bez buildu: čisté ES moduly v prohlížeči. Node.js (≥ 20) je potřeba jen pro testy a lokální server.

```bash
npm install
```

```bash
npm test
```

```bash
npm run dev
```

`npm run dev` spustí na <http://localhost:8787> appku i proxy (stejný kód jako Worker) na adrese `http://localhost:8787/proxy`.
Za firemní proxy přidejte `NODE_USE_ENV_PROXY=1`.

Testy parseru běží nad uloženými stránkami v `tests/fixtures/` (kontakty jsou anonymizované). Nové vzorky stáhnete skriptem:

```bash
npm run fixtures
```

Testy vzhledu v prohlížeči (Playwright, Chromium) vysází nad uloženými stránkami všechny výstupy ve všech režimech písma
a orientacích a hlídají, že se nic neořezává na okraji stránky ani nezkracuje. Na GitHubu běží při každé změně (úloha „vzhled“):

```bash
npx playwright install chromium
```

```bash
npm run test:e2e
```

Struktura projektu, datový model a návod na přidání nového výstupu: **[docs/ARCHITEKTURA.md](docs/ARCHITEKTURA.md)**.

### Proč vanilla JS bez frameworku

- **Žádný build** – GitHub Pages servíruje soubory tak, jak jsou; nic nezastará, nic se nemusí znovu kompilovat.
- **Žádné závislosti v prohlížeči** – appka funguje i za 5 let; dev závislosti (`linkedom`, `playwright`) slouží jen testům.
- **Většina práce není UI, ale data a tisk** – parser a šablony jsou čisté funkce (HTML → data → HTML), které framework nepotřebují
  a dají se testovat v Node.js. Rozhraní je jedna obrazovka s formuláři, na kterou stačí malý pomocník `h()`.
- Tiskové šablony jsou obyčejné moduly – nový výstup = jeden soubor a jeden řádek v registru.

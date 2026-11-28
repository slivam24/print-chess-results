// Seznam změn appky pro okno „O aplikaci → Novinky“ (nejnovější nahoře).
// Při každé změně, kterou uživatel uvidí, sem přidejte řádek a aktualizujte LATEST_CHANGE
// v js/app/aboutHost.js (hlídá test – podle něj se u tlačítka ukáže tečka „nové“).

export const CHANGELOG = [
  {
    date: '2026-11-28',
    items: [
      'Stránky, které chess-results ještě nezveřejnil (prázdná tabulka, los, …), si appka neukládá – po obnovení stránky nebo nejpozději po 2 minutách je zkusí stáhnout znovu sama, bez „Aktualizovat data“.',
      'Oprava: Pořadí družstev u švýcarského systému družstev bylo prázdné – chess-results ho tam zveřejňuje na jiné stránce (Pořadí po N. kole), appka ji teď načte.',
      'Rozpis šachovnic: sestava doplněná ze soupisky (u družstev s přesně tolika hráči jako šachovnic) vychází vždy z aktuální soupisky – starší než 10 minut se před doplněním stáhne znovu; upozornění ukazuje, kdy byla soupiska stažena.',
    ],
  },
  {
    date: '2026-11-27',
    items: [
      'Nové okno „? O aplikaci“ v horní liště: návod k použití, seznam novinek a informace o appce (klávesa ?).',
    ],
  },
  {
    date: '2026-11-26',
    items: [
      'Pořadí škol (družstev): volba „Podbarvit řádky družstev (škol)“ – podbarvení jde vypnout.',
    ],
  },
  {
    date: '2026-11-25',
    items: [
      'Nadpis pro tisk jen pro jeden turnaj (karta „1. Turnaj“) – ostatní turnaje se stejným profilem se nezmění; tlačítko rozdělí název z chess-results na 2 řádky.',
      'Pevná velikost nadpisu turnaje v pt (Záhlaví a zápatí) – záhlaví je stejně velké ve všech listinách bez ohledu na písmo tabulky.',
      'Šířky sloupců: zaškrtávátka „min.“ (sloupec jen na šířku textu) a „max.“ (sloupec dostane přebytečnou šířku).',
      'Oprava: chybová hláška nad náhledem už nevypisuje „null“; zarovnané popisky v editoru sloupců.',
    ],
  },
  {
    date: '2026-11-24',
    items: [
      'Švýcar jednotlivců hodnocený do družstev (přebory škol): nové výstupy „Pořadí škol (družstev)“ (chess-results Team-Ranking) a „Soupisky s výsledky kol“.',
      'Pořadí škol: volba Hráči – jen započítaní / všichni hráči družstva (nezapočítaní šedě) / bez hráčů.',
    ],
  },
  {
    date: '2026-11-23',
    items: ['Soupisky škol (klubů) pro švýcar jednotlivců – hráči ze startovní listiny seskupení podle klubu / školy.'],
  },
  {
    date: '2026-11-22',
    items: [
      'Kontrola výsledků před tiskem: chybějící výsledky v kole, pořadí zaostávající za losem, ručně vybrané starší kolo.',
      'Značka „✓ Vytištěno“ u výstupu a upozornění „od tisku se data změnila“.',
      'Uložit jako PDF navrhne název souboru podle turnaje a výstupu.',
      'Volitelný QR kód s odkazem na turnaj v záhlaví.',
      'Nový výstup „Nejlepší na šachovnicích“ (družstva, chess-results Board list).',
      'Záhlaví: nadpis na více řádků, proměnná {skupina}, více log vlevo i vpravo; zápatí s poděkováním sponzorům a jejich logy; vodoznak přes celou stránku.',
      'Knihovna obrázků (Nastavení → Obrázky): obrázky se nahrají na jedno místo a jen se vybírají; ve výchozím stavu černobíle; ukládají se úsporně.',
      'Možnosti výstupu i v Nastavení → Výstup.',
      'Rychlejší start appky; seznam naposledy otevřených turnajů s hledáním.',
    ],
  },
  {
    date: '2026-11-21',
    items: ['Tabulka přes více stránek má na všech stránkách stejné šířky sloupců.'],
  },
  {
    date: '2026-11-20',
    items: [
      'Křížová tabulka (každý s každým), i prázdná k ručnímu vyplňování.',
      'Vyhlášení výsledků: nejlepší celkově a v kategoriích velkým písmem.',
      'Přepínače Orientace a Písmo (Pevné / Co největší / 1 strana A4) nad náhledem, klávesové zkratky ← → (kolo) a 1–9 (výstup).',
      'Přetahování sloupců v editoru, sbalená upozornění, kompaktní nabídka výstupů, tlačítko Tisknout nad náhledem.',
      'Přednastavené profily: Švýcar jednotlivců, Každý s každým jednotlivci, Každý s každým – družstva školy.',
      'Rychlejší výpočet písma a souběžné stahování skupin.',
    ],
  },
  {
    date: '2026-11-17',
    items: [
      'Záložky turnajů v horní liště – každý turnaj s vlastním profilem, výstupem a kolem.',
      'Družstva: startovní pořadí družstev, los všech kol (každý s každým), rozpis šachovnic k rozstříhání („Kolo 1, Zápas 1“, pořadí na soupisce, doplnění sestav).',
      'Každý s každým: los všech kol najednou s nastavitelnou mezerou mezi koly.',
      'Tlačítko „1 strana A4“: písmo i výška řádků co největší, aby se vše vešlo na jednu stránku.',
      'Pořadí + kategorie (vlastní kategorie z typů hráčů, např. „Nejlepší do 16 let“), Typ a Skupina ve startovní listině, nadpisy RtgF / RtgN / Elo.',
      'Kontumace jako 1K – 0K; záhlaví a zápatí nastavitelné u každého výstupu.',
      'Průvodce tiskem jedním klikem (bez dialogu) v Nastavení → Tisk.',
      'Přenos profilů mezi počítači (export / import).',
      'Automatické načtení nové verze appky.',
      'Opravy: konec tabulky se už neořezává na okraji stránky; volno bez čísla šachovnice.',
    ],
  },
  {
    date: '2026-11-16',
    items: [
      'První verze: tisk losu, pořadí, startovní listiny, výsledkových lístků a rozhodcovského listu z chess-results.com.',
      'Abecední seznam hráčů, tabulky ve stylu Swiss-Manageru, nastavitelná šířka a písmo sloupců, písmo „co největší“.',
      'Vestavěná proxy pro stahování z chess-results.',
    ],
  },
];

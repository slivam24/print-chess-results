# Proxy pro chess-results.com (Cloudflare Worker)

Appka běží v prohlížeči a chess-results.com nedovoluje jiným webům číst své stránky (CORS).
Tento malý Worker stránky stáhne za appku a přidá potřebné hlavičky. Je zdarma
(Cloudflare Workers Free: 100 000 požadavků denně – jeden tisk spotřebuje 1–3 požadavky).

Co Worker dělá a nedělá:

- propouští **jen** `chess-results.com` a jeho subdomény (`s1.`, `s2.`, …) a jen stránky `*.aspx`,
- jen metodu GET, žádné cookies ani přihlašování,
- každé přesměrování kontroluje znovu (nedá se zneužít k přístupu jinam),
- odpovědi drží v cache 60 s (`CACHE_SECONDS`), parametr `&fresh=1` cache obejde,
- u starých turnajů sám odešle tlačítko „Show tournament details“, aby byla vidět celá data,
- volitelně pustí jen vaši appku (`ALLOWED_ORIGINS`).

Použití: `GET https://<worker>/?url=<zakódovaná adresa stránky chess-results>[&fresh=1]`.
Na samotnou adresu workeru odpoví textem `chess-print proxy OK`.

---

## Nasazení přes webové rozhraní (doporučeno, bez instalace)

1. Vytvořte si účet zdarma na <https://dash.cloudflare.com/sign-up> a potvrďte e-mail.
2. V levém menu otevřete **Workers & Pages** (může být pod položkou **Compute**).
3. Klikněte **Create** → **Create Worker** (nebo „Start with Hello World“).
4. Jméno: `chess-print-proxy` → **Deploy**. Cloudflare nasadí ukázkový kód.
5. Klikněte **Edit code**. Vlevo je soubor `worker.js` (nebo `index.js`) – smažte celý jeho obsah.
6. Otevřete v tomto repozitáři soubor [`worker.js`](worker.js), zkopírujte **celý** obsah a vložte ho do editoru.
7. Vpravo nahoře klikněte **Deploy** (a potvrďte).
8. Adresu workeru najdete nahoře, vypadá jako `https://chess-print-proxy.<vas-ucet>.workers.dev`.
   Otevřete ji v prohlížeči – má se zobrazit `chess-print proxy OK`.
9. V appce: **⚙ Nastavení → Připojení** → vložit adresu → **Otestovat** → **Uložit**.

### Omezení na vaši appku (doporučeno)

Worker → **Settings** → **Variables and Secrets** → **Add**:

| Název | Hodnota |
|---|---|
| `ALLOWED_ORIGINS` | `https://slivam24.github.io` |
| `CACHE_SECONDS` | `60` (volitelné) |

Více adres oddělte čárkou, např. `https://slivam24.github.io,http://localhost:8787`.
Pozor: hodnota je jen *origin* (schéma + doména), bez cesty k repozitáři.

---

## Nasazení z příkazové řádky (wrangler)

Potřebujete Node.js 20+.

```bash
cd worker
```

```bash
npx wrangler login
```

```bash
npx wrangler deploy
```

Proměnné jsou v [`wrangler.toml`](wrangler.toml) v sekci `[vars]`. Po změně stačí znovu `npx wrangler deploy`.
Logy v reálném čase: `npx wrangler tail`.

---

## Aktualizace

Když se v repozitáři změní `worker.js`, zopakujte kroky 5–7 (nebo `npx wrangler deploy`).
Adresa workeru i proměnné zůstanou.

## Lokální vývoj

V kořeni repozitáře `npm run dev` spustí appku i tuto proxy na `http://localhost:8787` (proxy na `/proxy`).
Testy proxy (bez přístupu na internet): `npm test`.

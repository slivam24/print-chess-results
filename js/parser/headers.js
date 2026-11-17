// Slovník hlaviček sloupců chess-results (angličtina, čeština, němčina).
// Appka stahuje stránky anglicky (lan=1), ale ručně vložené HTML může být
// v jiném jazyce – proto parser rozumí více variantám.

import { norm } from './dom.js';

const SYNONYMS = {
  board: ['bo.', 'bo', 'board', 'brd.', 'sach.', 'sach', 'br.', 'brett', 'tisch'],
  rank: ['rk.', 'rk', 'rank', 'por.', 'poradi', 'rg.', 'rang', 'pl.', 'platz'],
  startNo: ['no.', 'no', 'sno', 'snr', 'snr.', 'cis.', 'cis', 'st.c.', 'st.c', 'nr.', 'nr', 'c.', 'startnr', 'startnr.'],
  name: ['name', 'jmeno', 'player', 'hrac', 'spieler', 'teilnehmer'],
  white: ['white', 'bily', 'weiss', 'weiß'],
  black: ['black', 'cerny', 'schwarz'],
  fideId: ['fideid', 'fide-id', 'fide id', 'id fide', 'fide-nr.', 'fide-nr'],
  fed: ['fed', 'fed.', 'land', 'stat'],
  rating: ['rtg', 'elo', 'rating', 'rtgi', 'rtgfide', 'rtg fide', 'rtgint', 'rtg int', 'fide', 'elo fide', 'eloi', 'ratingi', 'irtg'],
  ratingNat: ['rtgn', 'rtgnat', 'rtg nat', 'elo narodni', 'nwz', 'dwz', 'elon', 'national rating', 'nrtg'],
  club: ['club/city', 'club', 'klub/misto', 'klub', 'oddil', 'verein/ort', 'verein', 'club/ort'],
  points: ['pts.', 'pts', 'points', 'body', 'b.', 'pkt.', 'pkt', 'punkte'],
  result: ['result', 'res.', 'res', 'vysledek', 'vysl.', 'ergebnis', 'erg.'],
  // „Typ“ (U16, S50, …) a „Gr“ (skupina) jsou ve Swiss-Manageru dva různé sloupce
  type: ['typ', 'type', 'typ hrace', 'spielertyp'],
  group: ['gr', 'gr.', 'group', 'skup.', 'skup', 'skupina', 'gruppe', 'kat.', 'kategorie', 'category'],
  sex: ['sex', 'pohl.', 'm/f', 's'],
  team: ['team', 'druzstvo', 'mannschaft', 'tym'],
  games: ['games', 'partie', 'partien', 'gam.', 'sp.'],
  wins: ['+', 'w', 'v'],
  draws: ['=', 'd', 'r'],
  losses: ['-', 'l', 'p'],
  ratingAvg: ['rtgavg', 'rtg avg', 'rtg prum.', 'rtg prum', 'elo-o', 'o-elo', 'ratingavg', 'elo prum.'],
  percent: ['%', 'perc.', 'proc.'],
  rp: ['rp', 'perf.', 'tpr'],
  k: ['k', 'rtg+/-', '+/-'],
  bday: ['bday', 'narozen', 'geb.', 'b-day', 'year', 'rok nar.'],
};

const LOOKUP = new Map();
for (const [key, list] of Object.entries(SYNONYMS)) {
  for (const s of list) LOOKUP.set(norm(s), key);
}

/**
 * Převede text hlavičky na klíč sloupce.
 * Pomocná hodnocení: TB1, PH 1, Wtg1, BH… → { key: 'tb', index: 1 }.
 * Čísla kol v křížové tabulce: „1“..„N“ → { key: 'xt', index: N }.
 */
export function headerKey(raw) {
  const t = norm(raw);
  if (!t) return { key: null };
  const tb = t.match(/^(?:tb|ph|wtg|fw|tie ?break|pomocne hodnoceni)\s*\.?\s*(\d+)$/);
  if (tb) return { key: 'tb', index: Number(tb[1]) };
  if (/^\d+$/.test(t)) return { key: 'xt', index: Number(t) };
  if (/^\d+\.?\s*(kolo|rd\.?|round|runde)$/.test(t) || /^(kolo|rd\.?|round|runde)\s*\d+$/.test(t)) {
    return { key: 'xt', index: Number(t.match(/\d+/)[0]) };
  }
  const k = LOOKUP.get(t);
  // Obecný „Rtg“/„Elo“ nevypovídá, zda jde o mezinárodní, nebo národní rating
  if (k === 'rating') return { key: k, generic: ['rtg', 'elo', 'rating'].includes(t) };
  if (k) return { key: k };
  // Časté varianty s doplňkem, např. „Rtg FIDE“, „Elo int.“
  if (/^(rtg|elo)\b/.test(t) && /nat|nar|nwz|dwz/.test(t)) return { key: 'ratingNat' };
  if (/^(rtg|elo)\b/.test(t) && /avg|prum|ø/.test(t)) return { key: 'ratingAvg' };
  if (/^(rtg|elo)\b/.test(t)) return { key: 'rating' };
  if (/^club|^klub|^verein/.test(t)) return { key: 'club' };
  return { key: null, raw: t };
}

/**
 * Mapuje řádek hlavičky na pole popisů sloupců.
 * Prázdná hlavička těsně před sloupcem se jménem = titul (GM, IM, …).
 * Ostatní prázdné sloupce (vlajky) se ignorují.
 */
export function mapHeader(headerTexts) {
  const cols = headerTexts.map((h) => ({ ...headerKey(h), label: String(h || '').trim() }));
  for (let i = 0; i < cols.length; i++) {
    if (cols[i].key) continue;
    const next = cols[i + 1];
    if (next && ['name', 'white', 'black'].includes(next.key)) cols[i].key = 'title';
  }
  return cols;
}

/** Popisky informační tabulky turnaje → klíče. */
const INFO_LABELS = [
  ['organizer', /^(organizer|organizator|veranstalter|poradatel)/],
  ['federation', /^(federation|federace|landesverband|verband)$/],
  ['director', /^(tournament director|reditel turnaje|turnierdirektor|turnierleiter)/],
  ['chiefArbiter', /^(chief arbiter|hlavni rozhodci|hauptschiedsrichter)/],
  ['deputyArbiter', /^(deputy|zastupce|stellvertretender)/],
  ['arbiter', /^(arbiter|rozhodci|schiedsrichter)$/],
  ['timeControl', /^(time control|bedenkzeit|tempo|hraci tempo)/],
  ['location', /^(location|misto|ort|spielort)$/],
  ['rounds', /^(number of rounds|pocet kol|rundenanzahl|anzahl runden)/],
  ['type', /^(tournament type|typ turnaje|turniertyp|turnierart)/],
  ['ratingCalc', /^(rating calculation|vypocet ratingu|elorechnung|wertung)/],
  ['date', /^(date|datum)/],
  ['avgRating', /^(rating-ø|ø elo|elo-ø|rating-o|o elo|elo-o|prumerne)/],
  ['groups', /^(tournament selection|vyber turnaje|turnierauswahl)/],
  ['lists', /^(lists|seznamy|listen)$/],
];

export function infoKey(label) {
  const t = norm(label);
  for (const [k, re] of INFO_LABELS) if (re.test(t)) return k;
  return null;
}

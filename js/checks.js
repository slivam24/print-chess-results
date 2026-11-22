// Kontroly před tiskem: chybějící výsledky v kole a nesoulad kol (např. pořadí po 4. kole,
// ale los už je na 6. kolo). Bez DOM, takže jde testovat v Node.js.

const LIST_MAX = 8;

function plural(n, one, few, many) {
  return n === 1 ? one : n >= 2 && n <= 4 ? few : many;
}

function listText(items) {
  return items.length > LIST_MAX ? `${items.slice(0, LIST_MAX).join(', ')}, …` : items.join(', ');
}

function missingText(n) {
  return `${n} ${plural(n, 'výsledek', 'výsledky', 'výsledků')}`;
}

/**
 * Data, která kontrola potřebuje navíc (stahují se jako nepovinná).
 * Pořadí po kole N: los N. kola s výsledky – jednotlivci (kruhový systém: všechna kola na rd=1),
 * u družstev zápasy kola.
 */
export function checkNeeds(tpl, info, round) {
  if (!tpl || tpl.roundMode !== 'ranking' || typeof round !== 'number' || !info) return [];
  if (info.isTeam) return [{ dataset: 'teamPairings', round, optional: true }];
  return [{ dataset: 'pairings', round: info.system === 'roundrobin' ? 1 : round, optional: true }];
}

function findRound(rounds, n) {
  const list = rounds || [];
  return list.find((r) => r.round === n) || (list.length === 1 && list[0].round == null ? list[0] : null);
}

/** Šachovnice jednotlivců bez výsledku (bez volna). */
function missingBoards(rd) {
  return (rd.pairings || []).filter((p) => p.black && !(p.result && p.result.played)).map((p, i) => p.board ?? i + 1);
}

const BYE = /^(bye|spielfrei|volno|frei|-)?$/i;
const isByeTeam = (t) => !t || BYE.test(String(t.name || '').trim());

/** Zápasy družstev bez výsledku – podle šachovnic (art=3), nebo podle skóre zápasu (art=2). */
function missingMatches(rd) {
  const out = [];
  (rd.matches || []).forEach((m, i) => {
    const label = m.no ?? i + 1;
    if (m.boards) {
      const real = m.boards.filter((b) => !(b.home && b.home.empty) || !(b.away && b.away.empty));
      const miss = real.filter((b) => !(b.result && b.result.played)).length;
      if (!isByeTeam(m.away) && miss) out.push({ label, boards: miss, played: real.length - miss });
    } else if (!isByeTeam(m.away) && (m.score == null || m.score.home == null)) {
      out.push({ label, boards: null, played: 0 });
    }
  });
  return out;
}

/** Nejvyšší kolo, které má všechny výsledky (kruhový systém – los všech kol je známý předem). */
export function lastCompleteRound(pairings) {
  let last = null;
  for (const rd of (pairings && pairings.rounds) || []) {
    if (rd.round == null || !rd.published) continue;
    if (rd.hasResults && !missingBoards(rd).length) last = Math.max(last || 0, rd.round);
  }
  return last;
}

/**
 * Upozornění k výstupu (pole textů).
 * @param {object} o
 * @param {object} o.tpl šablona
 * @param {object} o.info informace o turnaji
 * @param {object} o.data stažená data (včetně dat z checkNeeds)
 * @param {number|string|null} o.round kolo, které se tiskne
 * @param {boolean} o.auto kolo zvolené automaticky (jinak ho uživatel vybral sám)
 */
export function resultChecks({ tpl, info, data = {}, round, auto = true }) {
  const out = [];
  if (!tpl || !tpl.roundMode || !info || typeof round !== 'number') return out;
  const r = round;
  const rr = info.system === 'roundrobin';

  if (tpl.roundMode === 'ranking') {
    // Chybějící výsledky v kole, po kterém je pořadí
    if (info.isTeam) {
      const rd = findRound(data.teamPairings && data.teamPairings.rounds, r);
      const miss = rd ? missingMatches(rd) : [];
      if (miss.length) out.push(`Kolo ${r}: na chess-results chybí výsledek ${plural(miss.length, 'zápasu', 'zápasů', 'zápasů')} ${listText(miss.map((m) => m.label))} – pořadí nemusí být konečné.`);
    } else {
      const rd = findRound(data.pairings && data.pairings.rounds, r);
      const miss = rd ? missingBoards(rd) : [];
      if (miss.length) out.push(`Kolo ${r}: na chess-results chybí ${missingText(miss.length)} (${plural(miss.length, 'šachovnice', 'šachovnice', 'šachovnice')} ${listText(miss)}) – pořadí nemusí být konečné.`);
    }
    // Nesoulad kol
    if (auto) {
      if (rr && !info.isTeam) {
        const done = lastCompleteRound(data.pairings);
        if (done && done > r) out.push(`Výsledky jsou na chess-results zadané už do ${done}. kola, ale pořadí je zveřejněné jen po ${r}. kole.`);
      } else if (!rr && info.lastPairedRound && info.lastPairedRound - 1 > r) {
        out.push(`Pořadí je zveřejněné jen po ${r}. kole, ale los je už na ${info.lastPairedRound}. kolo – pořadí po ${info.lastPairedRound - 1}. kole na chess-results zatím není.`);
      }
    } else if (info.lastRankedRound && r < info.lastRankedRound) {
      out.push(`Tisknete pořadí po ${r}. kole – nejnovější je po ${info.lastRankedRound}. kole.`);
    }
    return out;
  }

  // Los: kolo už má některé výsledky, ale ne všechny (např. výsledková listina kola)
  if (info.isTeam) {
    const rd = findRound(data.boards && data.boards.rounds, r);
    if (rd && rd.hasResults) {
      const miss = missingMatches(rd);
      if (miss.length) {
        const n = miss.reduce((s, m) => s + (m.boards || 0), 0);
        out.push(`Kolo ${r}: zatím chybí ${missingText(n)} (${plural(miss.length, 'zápas', 'zápasy', 'zápasy')} ${listText(miss.map((m) => m.label))}).`);
      }
    }
  } else {
    const rd = findRound(data.pairings && data.pairings.rounds, r);
    if (rd && rd.hasResults) {
      const miss = missingBoards(rd);
      if (miss.length) out.push(`Kolo ${r}: zatím chybí ${missingText(miss.length)} (šachovnice ${listText(miss)}).`);
    }
  }
  if (!auto && !rr && info.lastPairedRound && r < info.lastPairedRound) {
    out.push(`Tisknete los ${r}. kola – nejnovější zveřejněný je los ${info.lastPairedRound}. kola.`);
  }
  return out;
}

// Veřejné rozhraní parseru. Funkce přijímají DOM dokument (Document),
// takže stejný kód běží v prohlížeči (DOMParser) i v testech (linkedom).

export { parseInfo, classifyType, detectTnr } from './info.js';
export {
  parseStartList, parseRanking, parsePairings, parseTeamList,
  parseTeamPairings, parseBoardPairings, detectPageKind, parseTiebreakLegend,
} from './tables.js';
export { fmtPoints, parseNum, parseResult } from './dom.js';

import { parseInfo } from './info.js';
import {
  parseStartList, parseRanking, parsePairings, parseTeamList,
  parseTeamPairings, parseBoardPairings, detectPageKind,
} from './tables.js';
import { dataTables } from './dom.js';

/** Druhy stránek, které appka umí číst, a jejich parsery. */
export const PAGE_PARSERS = {
  startlist: parseStartList,
  teamPlayers: parseStartList,
  ranking: parseRanking,
  crosstable: parseRanking,
  teamRanking: parseRanking,
  pairings: parsePairings,
  teams: parseTeamList,
  teamPairings: parseTeamPairings,
  boards: parseBoardPairings,
};

/** Zpracuje stránku daného druhu; vrací { info, data, empty }. */
export function parsePage(doc, kind) {
  const k = kind || detectPageKind(doc);
  const info = parseInfo(doc);
  const fn = PAGE_PARSERS[k];
  const data = fn ? fn(doc) : null;
  return { kind: k, info, data, empty: dataTables(doc).length === 0 };
}

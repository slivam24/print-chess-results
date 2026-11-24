// Registr tiskových šablon.
// Nový výstup = nový modul se šablonou a jeden řádek v seznamu TEMPLATES.
// Rozhraní šablony popisuje docs/ARCHITEKTURA.md.

import { pairingsTable, pairingsBoard, pairingsAlpha } from './pairings.js';
import {
  startList, alphaList, clubRoster, ranking, rankingCat, awards, teamRanking, teamRoster, teamBoardBest, clubRanking, teamComposition,
} from './lists.js';
import { crossTable } from './crosstable.js';
import { arbiterSheet, scoreSlips } from './sheets.js';
import { teamMatches, teamBoards, teamStartList } from './team.js';

export const TEMPLATES = [
  startList,
  alphaList,
  clubRoster,
  teamComposition,
  ranking,
  rankingCat,
  crossTable,
  awards,
  clubRanking,
  pairingsTable,
  pairingsBoard,
  pairingsAlpha,
  arbiterSheet,
  scoreSlips,
  teamMatches,
  teamBoards,
  teamStartList,
  teamRoster,
  teamRanking,
  teamBoardBest,
];

export function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) || null;
}

export function templatesFor(info) {
  return TEMPLATES.filter((t) => !info || t.supports(info));
}

// Registr tiskových šablon.
// Nový výstup = nový modul se šablonou a jeden řádek v seznamu TEMPLATES.
// Rozhraní šablony popisuje docs/ARCHITEKTURA.md.

import { pairingsTable, pairingsBoard, pairingsAlpha } from './pairings.js';
import { startList, ranking, teamRanking, teamRoster } from './lists.js';
import { arbiterSheet, scoreSlips } from './sheets.js';
import { teamMatches, teamBoards } from './team.js';

export const TEMPLATES = [
  pairingsTable,
  pairingsBoard,
  pairingsAlpha,
  arbiterSheet,
  scoreSlips,
  startList,
  ranking,
  teamMatches,
  teamBoards,
  teamRoster,
  teamRanking,
];

export function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) || null;
}

export function templatesFor(info) {
  return TEMPLATES.filter((t) => !info || t.supports(info));
}

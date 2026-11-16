import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, parseHtml } from './helpers.js';
import {
  parseInfo, parseStartList, parseRanking, parsePairings, parseTeamList,
  parseTeamPairings, parseBoardPairings, detectPageKind, classifyType, parsePage,
  parseNum, parseResult, fmtPoints,
} from '../js/parser/index.js';
import { roundFromText } from '../js/parser/dom.js';

describe('pomocné funkce', () => {
  test('parseNum zvládá ½, čárku i prázdné hodnoty', () => {
    assert.equal(parseNum('4½'), 4.5);
    assert.equal(parseNum('½'), 0.5);
    assert.equal(parseNum('5,5'), 5.5);
    assert.equal(parseNum('12'), 12);
    assert.equal(parseNum(''), null);
    assert.equal(parseNum('abc'), null);
  });

  test('fmtPoints', () => {
    assert.equal(fmtPoints(4.5), '4½');
    assert.equal(fmtPoints(0.5), '½');
    assert.equal(fmtPoints(3), '3');
    assert.equal(fmtPoints(null), '');
  });

  test('parseResult', () => {
    assert.deepEqual(
      [parseResult('1 - 0').white, parseResult('1 - 0').black, parseResult('1 - 0').played],
      ['1', '0', true],
    );
    assert.equal(parseResult('½ - ½').white, '½');
    assert.equal(parseResult('+ - -').forfeit, true);
    assert.equal(parseResult('').played, false);
    assert.equal(parseResult('1').white, '1');
  });

  test('roundFromText rozumí více jazykům a ignoruje datum', () => {
    assert.equal(roundFromText('Round 6 on 2026/11/12 at 17:30'), 6);
    assert.equal(roundFromText('7. Kolo Datum kola 2026/11/19 Hodina 17:30'), 7);
    assert.equal(roundFromText('Rank after Round 6'), 6);
    assert.equal(roundFromText('Pořadí po 3 kole'), 3);
    assert.equal(roundFromText('3. Runde am 2026/11/15'), 3);
    assert.equal(roundFromText('Starting rank'), null);
  });

  test('classifyType', () => {
    assert.deepEqual(classifyType('Swiss-System'), { isTeam: false, system: 'swiss' });
    assert.deepEqual(classifyType('Round robin for teams'), { isTeam: true, system: 'roundrobin' });
    assert.deepEqual(classifyType('Švýcarský systém pro družstva'), { isTeam: true, system: 'swiss' });
    assert.deepEqual(classifyType('Každý s každým'), { isTeam: false, system: 'roundrobin' });
    assert.deepEqual(classifyType('Schweizer System'), { isTeam: false, system: 'swiss' });
  });
});

describe('informace o turnaji', () => {
  test('švýcar jednotlivců – metadata a kola', () => {
    const i = parseInfo(fixture('swiss-main'));
    assert.equal(i.tnr, 1495793);
    assert.equal(i.title, 'Vršovický podzimní open 2026');
    assert.equal(i.isTeam, false);
    assert.equal(i.system, 'swiss');
    assert.equal(i.totalRounds, 9);
    assert.deepEqual(i.pairedRounds, [1, 2, 3, 4, 5, 6, 7]);
    assert.equal(i.lastPairedRound, 7);
    assert.equal(i.lastRankedRound, 6);
    assert.equal(i.fields.chiefArbiter, 'Jan Kovář');
    assert.equal(i.fields.location, 'Praha');
    assert.equal(i.dateFrom, '2026-10-08');
    assert.equal(i.dateTo, '2026-12-10');
    assert.equal(i.lastUpdate, '2026-11-15T21:02:53');
    assert.deepEqual(i.groups, []);
  });

  test('turnaj s více skupinami – výběr turnaje', () => {
    const i = parseInfo(fixture('groups-main'));
    assert.equal(i.groups.length, 3);
    assert.deepEqual(i.groups.map((g) => g.name), ['H18+H20', 'D18+D20', 'Blesk']);
    assert.equal(i.groups[0].current, true);
    assert.equal(i.groups[0].tnr, 1486996);
    assert.equal(i.groups[1].tnr, 1486998);
  });

  test('liga družstev – kruhový systém', () => {
    const i = parseInfo(fixture('team-main'));
    assert.equal(i.isTeam, true);
    assert.equal(i.system, 'roundrobin');
    assert.equal(i.totalRounds, 11);
    assert.deepEqual(i.pairedRounds, [1, 2, 3]);
    assert.equal(i.groups.length, 9);
    assert.equal(i.groups.find((g) => g.current).name, '2. liga F');
  });

  test('kruhový systém jednotlivců bez odkazů na kola', () => {
    const i = parseInfo(fixture('rr-main'));
    assert.equal(i.system, 'roundrobin');
    assert.equal(i.isTeam, false);
    assert.equal(i.totalRounds, 11);
    assert.deepEqual(i.pairedRounds, []);
  });

  test('švýcar družstev před startem', () => {
    const i = parseInfo(fixture('teamswiss-main'));
    assert.equal(i.isTeam, true);
    assert.equal(i.system, 'swiss');
    assert.equal(i.totalRounds, 7);
    assert.equal(i.fields.timeControlKind, 'Rapid');
  });
});

describe('startovní listina', () => {
  test('jednotlivci, diakritika', () => {
    const { players } = parseStartList(fixture('swiss-main'));
    assert.equal(players.length, 57);
    assert.deepEqual(players[0], {
      startNo: 1, title: '', name: 'Vavřinec, Tomáš', fideId: 318353, fed: 'CZE', rating: 1960,
      ratingNat: null, club: 'Klub Šachistů Říčany 1925', group: '', sex: '',
    });
    assert.ok(players.every((p) => p.name && p.startNo));
  });

  test('kategorie, tituly a dva ratingy', () => {
    const { players } = parseStartList(fixture('categories-main'));
    assert.equal(players.length, 20);
    assert.equal(players[0].title, 'GM');
    assert.equal(players[0].group, 'Top (A)');
    assert.equal(players[1].ratingNat, 2349);
    const groups = new Set(players.map((p) => p.group));
    assert.deepEqual([...groups].sort(), ['Top (A)', 'U1800 (B)']);
  });

  test('hráči družstev se šachovnicí', () => {
    const { players } = parseStartList(fixture('team-players'));
    assert.ok(players.length > 200);
    assert.equal(players[0].team, 'TJ Baník Havířov');
    assert.equal(players[0].board, 1);
    assert.equal(players[0].title, 'GM');
  });
});

describe('pořadí', () => {
  test('pořadí po kole s pomocnými hodnoceními', () => {
    const r = parseRanking(fixture('swiss-ranking-r6'));
    assert.equal(r.round, 6);
    assert.equal(r.rows.length, 57);
    assert.equal(r.rows[0].name, 'Novák, Jindřich');
    assert.equal(r.rows[0].points, 5.5);
    assert.equal(r.rows[0].startNo, 7);
    assert.equal(r.tiebreaks.length, 3);
    assert.match(r.tiebreaks[0].label, /Buchholz/);
    assert.deepEqual(r.rows[0].tb, ['18,5', '0', '20,5']);
  });

  test('křížová tabulka kruhového turnaje', () => {
    const r = parseRanking(fixture('rr-crosstable'));
    assert.equal(r.rows.length, 11);
    assert.equal(r.crossRounds, 11);
    assert.equal(r.rows[0].cross.length, 11);
    assert.equal(r.rows[0].points, 3);
  });

  test('tabulka družstev', () => {
    const r = parseRanking(fixture('team-table'));
    assert.equal(r.rows.length, 12);
    assert.equal(r.rows[0].name, 'TJ Baník Havířov');
    assert.equal(r.rows[0].wins, 3);
    assert.match(r.tiebreaks[0].label, /Matchpoints/);
  });
});

describe('los kola jednotlivců', () => {
  test('odehrané kolo s výsledky a nenasazenými', () => {
    const { rounds } = parsePairings(fixture('swiss-pairings-r6'));
    assert.equal(rounds.length, 1);
    const r = rounds[0];
    assert.equal(r.round, 6);
    assert.equal(r.date, '2026-11-12');
    assert.equal(r.time, '17:30');
    assert.equal(r.published, true);
    assert.equal(r.hasResults, true);
    const p = r.pairings[0];
    assert.equal(p.board, 1);
    assert.equal(p.white.name, 'Berger, Michael');
    assert.equal(p.white.startNo, 11);
    assert.equal(p.white.rating, 1899);
    assert.equal(p.white.points, 4);
    assert.equal(p.black.name, 'Novák, Jindřich');
    assert.equal(p.black.points, 4.5);
    assert.equal(p.result.text, '0 - 1');
    const byes = r.pairings.filter((x) => x.bye);
    assert.ok(byes.length > 0);
    assert.equal(byes[0].black, null);
  });

  test('nové kolo bez výsledků', () => {
    const r = parsePairings(fixture('swiss-pairings-r7')).rounds[0];
    assert.equal(r.round, 7);
    assert.equal(r.published, true);
    assert.equal(r.hasResults, false);
    assert.equal(r.pairings[0].result.played, false);
  });

  test('česká verze stránky dává stejná data', () => {
    const en = parsePairings(fixture('swiss-pairings-r7')).rounds[0];
    const cs = parsePairings(fixture('swiss-pairings-r7-cs')).rounds[0];
    assert.equal(cs.round, 7);
    assert.equal(cs.pairings.length, en.pairings.length);
    assert.deepEqual(cs.pairings[0].white, en.pairings[0].white);
    assert.deepEqual(cs.pairings[5].black, en.pairings[5].black);
  });

  test('nezveřejněné kolo = žádná data', () => {
    const { rounds } = parsePairings(fixture('swiss-pairings-r8'));
    assert.equal(rounds.length, 0);
  });

  test('kruhový systém: všechna kola na jedné stránce, volno', () => {
    const { rounds } = parsePairings(fixture('rr-pairings-r1'));
    assert.equal(rounds.length, 11);
    assert.deepEqual(rounds.map((r) => r.round), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    assert.ok(rounds.every((r) => r.pairings.length === 6));
    const bye = rounds[0].pairings.find((p) => p.bye);
    assert.equal(bye.bye, 'bye');
    assert.equal(bye.white.name, 'Miklánek, Filip');
    assert.equal(rounds[0].hasResults, true);
    assert.equal(rounds[5].hasResults, false);
  });
});

describe('družstva', () => {
  test('seznam družstev', () => {
    const { teams } = parseTeamList(fixture('team-teams'));
    assert.equal(teams.length, 12);
    assert.deepEqual(teams[0], { no: 1, name: 'Šachy Krnov', ratingAvg: 2051 });
  });

  test('zápasy kola', () => {
    const { rounds } = parseTeamPairings(fixture('team-pairings-r3'));
    assert.equal(rounds[0].round, 3);
    assert.equal(rounds[0].matches.length, 6);
    assert.equal(rounds[0].matches[1].home.name, 'Sokol Francova Lhota');
    assert.equal(rounds[0].matches[1].score.home, 5.5);
  });

  test('rozpis šachovnic s barvami a výsledky', () => {
    const r = parseBoardPairings(fixture('team-boards-r3')).rounds[0];
    assert.equal(r.round, 3);
    assert.equal(r.matches.length, 6);
    const m = r.matches[0];
    assert.equal(m.home.name, 'SK Slavia Orlová B');
    assert.equal(m.home.no, 2);
    assert.equal(m.away.no, 12);
    assert.equal(m.score.away, 6);
    assert.equal(m.boards.length, 8);
    assert.equal(m.boards[0].home.name, 'Kuboš, Rostislav');
    assert.equal(m.boards[0].home.color, 'w');
    assert.equal(m.boards[1].home.color, 'b');
    assert.equal(m.boards[1].home.title, 'FM');
    assert.equal(m.boards[3].away.title, 'FM');
    assert.equal(m.boards[2].result.text, '0 - 1');
    assert.equal(r.lineupsPublished, true);
  });

  test('kolo bez nominací – prázdné šachovnice', () => {
    const r = parseBoardPairings(fixture('team-boards-r4')).rounds[0];
    assert.equal(r.round, 4);
    assert.equal(r.matches.length, 6);
    assert.equal(r.lineupsPublished, false);
    assert.equal(r.matches[0].boards[0].home.empty, true);
  });
});

describe('detekce druhu stránky (ruční vložení)', () => {
  const cases = {
    'swiss-main': 'startlist',
    'swiss-ranking-r6': 'ranking',
    'swiss-pairings-r6': 'pairings',
    'rr-pairings-r1': 'pairings',
    'rr-crosstable': 'crosstable',
    'team-teams': 'teams',
    'team-table': 'teamRanking',
    'team-pairings-r3': 'teamPairings',
    'team-boards-r3': 'boards',
    'team-players': 'teamPlayers',
  };
  for (const [f, kind] of Object.entries(cases)) {
    test(`${f} → ${kind}`, () => assert.equal(detectPageKind(fixture(f)), kind));
  }

  test('parsePage vrací i metadata', () => {
    const r = parsePage(fixture('swiss-pairings-r6'));
    assert.equal(r.kind, 'pairings');
    assert.equal(r.info.tnr, 1495793);
    assert.equal(r.data.rounds[0].pairings.length, 31);
  });

  test('neznámé HTML nespadne', () => {
    const r = parsePage(parseHtml('<html><body><p>nic</p></body></html>'));
    assert.equal(r.kind, null);
    assert.equal(r.empty, true);
  });
});

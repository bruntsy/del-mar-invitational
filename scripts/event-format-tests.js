#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let appScript = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .join('\n');

appScript = appScript.replace(/\n\(async function init\(\)\{[\s\S]*?\}\)\(\);\s*$/, '');

const browserStub = `
const window = {
  supabase: { createClient: () => ({}) },
  location: { search: '', hash: '', origin: 'http://local', pathname: '/' },
  history: { replaceState() {} }
};
const localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const document = { getElementById() { return null; }, querySelector() { return null; } };
const CSS = { escape: value => String(value) };
function alert() {}
function confirm() { return true; }
`;

const tests = `
const failures = [];

function assertEqual(actual, expected, label) {
  if (actual !== expected) failures.push(label + ': expected ' + expected + ', got ' + actual);
}

function assertIncludes(value, expected, label) {
  if (!String(value).includes(expected)) failures.push(label + ': expected "' + value + '" to include "' + expected + '"');
}

function resetRound(pairMatches = [{ a: ['A', 'B'], b: ['C', 'D'] }]) {
  GROUP = {
    id: 'group-1',
    roomCode: 'TEST',
    players: {
      A: { name: 'A', handicapIndex: 0 },
      B: { name: 'B', handicapIndex: 0 },
      C: { name: 'C', handicapIndex: 0 },
      D: { name: 'D', handicapIndex: 0 },
      E: { name: 'E', handicapIndex: 0 },
      F: { name: 'F', handicapIndex: 0 },
      G: { name: 'G', handicapIndex: 0 },
      H: { name: 'H', handicapIndex: 0 }
    }
  };
  const team1 = [...new Set(pairMatches.flatMap(match => match.a))];
  const team2 = [...new Set(pairMatches.flatMap(match => match.b))];
  EVENT = {
    id: 'event-1',
    config: normalizeEventConfig({
      teamNames: { team1: 'Team One', team2: 'Team Two' },
      team1,
      team2,
      rounds: [{ format: 'twoManBestBallAggy', scoringMode: 'matchPlay', pairMatches }]
    })
  };
  ROUND = {
    id: 'round-1',
    event: { id: 'event-1', roundIndex: 0 },
    course: {
      par: Array(18).fill(4),
      si: Array.from({ length: 18 }, (_, i) => i + 1),
      yds: Array(18).fill(400),
      tee: { parTotal: 72, slope: 113, rating: 72 }
    },
    teamNames: EVENT.config.teamNames,
    team1,
    team2,
    pairMatches,
    playingGroups: [],
    scores: {},
    putts: {},
    games: cloneDefaultGames()
  };
  [...team1, ...team2].forEach(player => { ROUND.scores[player] = Array(18).fill(null); });
}

function setHole(h, scores) {
  Object.entries(scores).forEach(([player, score]) => { ROUND.scores[player][h] = score; });
}

function resultFor(scores, h = 0) {
  resetRound();
  setHole(h, scores);
  return computeEventRoundResult();
}

let res = resultFor({ A: 4, B: 5, C: 5, D: 6 });
assertEqual(res.team1, 2, '2-0 total team1');
assertEqual(res.team2, 0, '2-0 total team2');
assertEqual(res.rows[0].components[0].team1, 2, '2-0 hole team1');
assertIncludes(eventComponentDetail(res.rows[0].components[0], res.rows[0]), 'Best ball: Team One wins 4-5', '2-0 best-ball detail');
assertIncludes(eventComponentDetail(res.rows[0].components[0], res.rows[0]), 'Aggy: Team One wins 9-11', '2-0 aggy detail');

res = resultFor({ A: 4, B: 5, C: 4, D: 6 });
assertEqual(res.team1, 1.5, 'best-ball tie plus aggy win team1');
assertEqual(res.team2, 0.5, 'best-ball tie plus aggy win team2');

res = resultFor({ A: 4, B: 6, C: 5, D: 5 });
assertEqual(res.team1, 1.5, 'best-ball win plus aggy tie team1');
assertEqual(res.team2, 0.5, 'best-ball win plus aggy tie team2');

res = resultFor({ A: 4, B: 6, C: 4, D: 6 });
assertEqual(res.team1, 1, 'all tied team1');
assertEqual(res.team2, 1, 'all tied team2');

res = resultFor({ A: 4, B: 7, C: 5, D: 5 });
assertEqual(res.team1, 1, 'split hole team1');
assertEqual(res.team2, 1, 'split hole team2');

res = resultFor({ A: 4, B: 5, C: 5 });
assertEqual(res.team1, 0, 'incomplete hole team1');
assertEqual(res.team2, 0, 'incomplete hole team2');
assertEqual(res.rows[0].components[0].winner, 'open', 'incomplete hole is open');

resetRound();
setHole(0, { A: 4, B: 5, C: 5, D: 6 });
setHole(1, { A: 4, B: 5, C: 4, D: 6 });
setHole(2, { A: 4, B: 6, C: 4, D: 6 });
res = computeEventRoundResult();
assertEqual(res.team1, 4.5, 'multi-hole total team1');
assertEqual(res.team2, 1.5, 'multi-hole total team2');

resetRound([{ a: ['A', 'B'], b: ['C', 'D'] }, { a: ['E', 'F'], b: ['G', 'H'] }]);
setHole(0, { A: 4, B: 5, C: 5, D: 6, E: 6, F: 6, G: 4, H: 5 });
res = computeEventRoundResult();
assertEqual(res.team1, 2, 'two-match total team1');
assertEqual(res.team2, 2, 'two-match total team2');
assertEqual(eventRoundAvailablePoints(EVENT.config.rounds[0]), 72, 'two-match available points');

assertEqual(eventRoundAvailablePoints(normalizeEventConfig({
  team1: ['A', 'B'],
  team2: ['C', 'D'],
  rounds: [{ format: 'twoManBestBallAggy', pairMatches: [{ a: ['A', 'B'], b: ['C', 'D'] }] }]
}).rounds[0]), 36, 'single-match available points');

assertIncludes(eventFormatLabel('twoManBestBallAggy'), 'Best Ball + Aggy', 'format label');

if (failures.length) {
  console.error(failures.join('\\n'));
  process.exit(1);
}

console.log('event format tests passed');
`;

new Function(browserStub + appScript + tests)();

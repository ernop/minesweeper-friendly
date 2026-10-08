'use strict';
// Tests for switch-cost.js, the session stats' switch cost: transitions from a
// hand-built game (press pairing, distance with and without a board move,
// what the board offered, chain breaks, a release without its press,
// interval bounds), knot placement
// against numpy, the fit against the independent Python reference on the
// synthetic fixture (tests/switch-cost-reference.json, written by
// analysis/switch-cost/reference.py from `node tests/switch-cost-fixture.js
// ROWS.jsonl`), recovery of the fixture's planted effect, and both pools: the
// latest-500 window and the session window.
//
// Usage: node tests/switch-cost-test.js

const fs = require('fs');
const path = require('path');
const SwitchCost = require('../switch-cost.js');
const TrainingCore = require('../training-core.js');
const Solver = require('../solver.js');
const GameRandom = require('../rng.js');
const { switchCostFixtureGames, PLANTED } = require('./switch-cost-fixture.js');

let failures = 0;
function check(name, condition) {
  if (condition) console.log('  ok  ' + name);
  else {
    failures++;
    console.log('FAIL  ' + name);
  }
}
const close = (a, b, tolerance = 1e-12) => Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b));
const deps = { training: TrainingCore, randomPlacement: Solver.randomPlacement, fromSeed: GameRandom.fromSeed,
  rngVersion: GameRandom.VERSION };

// 5x4 board, mines '*', and the numbers the game shows:
//   . . . . *      0 0 0 1 *
//   . . . . .      0 1 1 2 1
//   . . * . .      0 1 * 2 1
//   . . . . *      0 1 1 2 *
// Revealing (0,0) floods the six zeros and their borders: 12 of 17 safe
// cells open, with (4,1), (3,2), (4,2), (2,3), (3,3) still covered.
const width = 5;
const board = { width, height: 4, mines: 3 };
const mines = ['....*', '.....', '..*..', '....*'].join('').split('').map((ch) => ch === '*');
const finalBoard = { cells: mines.map((mine) => ({ mine })) };
const CELL = 20;
const cell = (x, y) => y * width + x;
function gameTrace(moves, { scrollBefore = null } = {}) {
  let top = 0;
  const layout = (t) => ({ t, kind: 'layout', left: 0, top, width: CELL * 5.25, height: CELL * 4.25,
    boardWidth: 5, boardHeight: 4 });
  const events = [layout(1)];
  moves.forEach(([kind, x, y, t], i) => {
    if (i === scrollBefore) {
      top -= 30;
      events.push(layout(t - 10));
    }
    const px = { x: (0.625 + x) * CELL, y: top + (0.625 + y) * CELL, index: cell(x, y) };
    if (kind === 'right') events.push({ t, kind: 'rdown', ...px });
    else {
      events.push({ t, kind: 'ldown', ...px });
      events.push({ t: t + 60, kind: 'lup', ...px });
    }
  });
  return { events, finalBoard };
}
const winMoves = [
  ['left', 0, 0, 1000], // first reveal
  ['right', 2, 2, 1400], // flag a mine the 1 at (1,1) proves
  ['right', 4, 0, 1700], // flag a mine no single number proves
  ['left', 3, 1, 2000], // chord the 2: opens three cells
  ['left', 2, 3, 2500], // reveal a cell the satisfied 1 at (1,2) proves safe
  ['right', 4, 3, 2900], // flag the last mine
  ['left', 4, 2, 3200], // chord the 1: opens the last cell
];

console.log('transitions of a hand-built win');
{
  const result = SwitchCost.gameRows(gameTrace(winMoves), 'win', board, deps);
  check('replays and measures', result.status === 'measured');
  const rows = result.rows;
  check('five transitions: the first reveal starts none', rows.length === 5);
  const kinds = rows.map((r) => r.prev + '>' + r.next).join(',');
  check('transition kinds: ' + kinds, kinds === 'flag>flag,flag>chord,chord>reveal,reveal>flag,flag>chord');
  check('press to press, the left press standing for a left move',
    JSON.stringify(rows.map((r) => r.intervalMs)) === JSON.stringify([300, 300, 500, 400, 300]));
  check('button switches', JSON.stringify(rows.map((r) => r.switched)) === JSON.stringify([false, true, false, true, true]));
  check('same button, other move: chord then reveal only',
    JSON.stringify(rows.map((r) => r.leftMoveChanged)) === JSON.stringify([false, false, true, false, false]));
  check('Fitts index from press positions in cells',
    close(rows[0].fitts, Math.log2(1 + 2 * Math.SQRT2)) && close(rows[1].fitts, Math.log2(1 + Math.SQRT2))
    && close(rows[2].fitts, Math.log2(1 + Math.sqrt(5))) && close(rows[3].fitts, Math.log2(3)) && close(rows[4].fitts, 1));
  check('cells the previous move opened', JSON.stringify(rows.map((r) => r.openedByPrevious)) === JSON.stringify([0, 0, 3, 1, 0])
    && rows.every((r) => r.previousOpenedEmpty === false));
  check('board progress before the next move',
    [12, 12, 15, 16, 16].every((open, i) => close(rows[i].progress, open / 17)));
  check('single-number logic offered: not the unprovable flags; every chord; the proven reveal',
    JSON.stringify(rows.map((r) => r.offered)) === JSON.stringify([false, true, true, false, true]));
  check('what the board offered before the second flag: 3 chordable numbers, 2 safe cells, no forced mine',
    rows[0].chordable === 3 && rows[0].safe === 2 && rows[0].mine === 0);
  check('before the first chord: 5 chordable numbers, 4 safe cells',
    rows[1].chordable === 5 && rows[1].safe === 4 && rows[1].mine === 0);
}

console.log('chain breaks, bounds, and a board that moved');
{
  const noop = [...winMoves.slice(0, 4), ['left', 0, 0, 2200], ...winMoves.slice(4)];
  const broken = SwitchCost.gameRows(gameTrace(noop), 'win', board, deps).rows;
  check('a no-op between two moves removes both of its transitions', broken.length === 4
    && broken.map((r) => r.prev + '>' + r.next).join(',') === 'flag>flag,flag>chord,reveal>flag,flag>chord');
  const slow = winMoves.map((move, i) => (i >= 4 ? [move[0], move[1], move[2], move[3] + 5000] : move));
  const bounded = SwitchCost.gameRows(gameTrace(slow), 'win', board, deps).rows;
  check('an interval over 5 s is not timed', bounded.length === 4 && !bounded.some((r) => r.intervalMs > 5000));
  const scrolled = SwitchCost.gameRows(gameTrace(winMoves, { scrollBefore: 6 }), 'win', board, deps).rows;
  check('across a board move the distance is taken between cells', close(scrolled[4].fitts, 1));
  const heldThroughStart = gameTrace(winMoves);
  heldThroughStart.events.splice(heldThroughStart.events.findIndex((e) => e.kind === 'ldown' && e.t === 2500), 1);
  const unpaired = SwitchCost.gameRows(heldThroughStart, 'win', board, deps).rows;
  check('a release without its press times neither of its transitions', unpaired.length === 3
    && unpaired.map((r) => r.prev + '>' + r.next).join(',') === 'flag>flag,flag>chord,flag>chord');
  check('a replay that does not reach the outcome is not measured',
    SwitchCost.gameRows(gameTrace(winMoves.slice(0, 5)), 'win', board, deps).status === 'diverged');
}

console.log('knots: patsy cr placement, near-equal values counted once');
{
  const values = [9, 0, 0.5, 1, 4, 9, 16, 4 + 1e-12];
  const four = SwitchCost.knots(values, 4);
  const three = SwitchCost.knots(values, 3);
  check('df 4 matches numpy: ' + four.join(', '), JSON.stringify(four) === JSON.stringify([0, 0.8333333333333335, 5.66666666666667, 16]));
  check('df 3 matches numpy: ' + three.join(', '), JSON.stringify(three) === JSON.stringify([0, 2.5, 16]));
  check('two distinct values still interpolate distinct inner knots, as in patsy; the maximum bounds them',
    JSON.stringify(SwitchCost.knots([1, 1, 2, 2 + 1e-12], 4))
      === JSON.stringify([1, 1.3333333333333335, 1.6666666666666667, 2.000000000001]));
  check('one distinct value gives no knots', SwitchCost.knots([3, 3, 3 + 1e-12], 4) === null);
}

const fixture = switchCostFixtureGames();
const measured = fixture.map((game) => ({ endedAt: game.record.endedAt,
  rows: SwitchCost.gameRows(game.trace, game.record.outcome, SwitchCost.KEYS[game.key], deps).rows }));

console.log('fit: the independent Python reference on the synthetic fixture');
(async () => {
  const newestFirst = [...measured].reverse();
  const window = await SwitchCost.window(newestFirst, (game) => game);
  const fit = SwitchCost.fit(window);
  const reference = JSON.parse(fs.readFileSync(path.join(__dirname, 'switch-cost-reference.json'), 'utf8'));
  check('same games, transitions, and identified columns',
    fit.games === reference.games && fit.transitions === reference.transitions && fit.columns === reference.columns);
  for (const field of ['beta', 'se', 'percent', 'percentLow', 'percentHigh', 'medianSwitchMs', 'msPerSwitch', 'switchShare']) {
    check(field + ' ' + fit[field] + ' matches ' + reference[field], close(fit[field], reference[field], 1e-9));
  }
  const planted = 100 * Math.expm1(PLANTED.switch);
  check('the 95% interval covers the planted +' + planted.toFixed(2) + '%',
    fit.percentLow < planted && planted < fit.percentHigh);

  console.log('window: latest games first, only games with a timed transition');
  const loads = [];
  const candidates = Array.from({ length: 2 * SwitchCost.WINDOW_GAMES }, (_, i) => i);
  const games = await SwitchCost.window(candidates, (i) => {
    loads.push(i);
    if (i % 7 === 3) return null;
    return { endedAt: i, rows: i % 11 === 5 ? [] : [{}] };
  });
  check('the window fills to ' + SwitchCost.WINDOW_GAMES, games.length === SwitchCost.WINDOW_GAMES);
  check('games without a saved trace or transition are skipped',
    games.every((g) => g.endedAt % 7 !== 3 && g.endedAt % 11 !== 5));
  check('no game past the window is loaded', loads.at(-1) === games.at(-1).endedAt);

  console.log('since: the session window, newest first, however many games');
  const total = 2 * SwitchCost.WINDOW_GAMES;
  const sessionCandidates = Array.from({ length: total }, (_, i) => ({ endedAt: total - i }));
  const fromMs = total / 4 + 1;
  const sessionLoads = [];
  const sessionGame = (candidate) => {
    sessionLoads.push(candidate.endedAt);
    if (candidate.endedAt % 7 === 3) return null;
    return { endedAt: candidate.endedAt, rows: candidate.endedAt % 11 === 5 ? [] : [{}] };
  };
  const session = await SwitchCost.since(sessionCandidates, fromMs, sessionGame);
  const inSession = sessionCandidates.filter((c) => c.endedAt >= fromMs && c.endedAt % 7 !== 3 && c.endedAt % 11 !== 5);
  check('every game with a transition since the start, past the ' + SwitchCost.WINDOW_GAMES + '-game window ('
    + session.length + ')', session.length > SwitchCost.WINDOW_GAMES && session.length === inSession.length
      && session.every((game, i) => game.endedAt === inSession[i].endedAt));
  check('the start is inclusive', session.at(-1).endedAt === fromMs);
  check('no game that ended before the start is loaded',
    sessionLoads.length === total - fromMs + 1 && sessionLoads.every((endedAt) => endedAt >= fromMs));
  sessionLoads.length = 0;
  check('a window after every game is empty and loads nothing',
    (await SwitchCost.since(sessionCandidates, total + 1, sessionGame)).length === 0 && sessionLoads.length === 0);

  const few = SwitchCost.fit(window.slice(0, SwitchCost.MIN_GAMES - 1));
  check('under ' + SwitchCost.MIN_GAMES + ' games: too few games, counted',
    few.status === 'too-few-games' && few.games === SwitchCost.MIN_GAMES - 1 && few.percent === undefined);
  check('no games at all', SwitchCost.fit([]).status === 'too-few-games');

  console.log(failures === 0 ? '\nall tests passed' : '\n' + failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})();

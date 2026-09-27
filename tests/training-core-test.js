'use strict';
// Tests for training-core.js: input replay with the game's click semantics,
// flag-use classification, the per-win time budget, record-based pace and
// run conversion (through the game's own fatal-status classifier), stage
// status, and an end-to-end summary over seed-rebuilt Expert boards.
//
// Usage: node tests/training-core-test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const TrainingCore = require('../training-core.js');
const Solver = require('../solver.js');
const GameRandom = require('../rng.js');

const evaluationSource = fs.readFileSync(path.join(__dirname, '..', 'game', 'evaluation.js'), 'utf8');
vm.runInThisContext(evaluationSource.slice(
  evaluationSource.indexOf('//-------GAME-END EVALUATION: VERDICT'),
  evaluationSource.indexOf('//-------GAME-END EVALUATION: CAPTURE')));
/* global fatalEvaluationOf, fatalActionStatusKind */

let failures = 0;
function check(name, condition) {
  if (condition) console.log('  ok  ' + name);
  else {
    failures++;
    console.log('FAIL  ' + name);
  }
}

const deps = {
  randomPlacement: Solver.randomPlacement,
  fromSeed: GameRandom.fromSeed,
  rngVersion: GameRandom.VERSION,
  fatalKindOf: (record) => {
    const fatal = fatalEvaluationOf(record);
    return fatal === undefined || fatal.legacy ? undefined : fatalActionStatusKind(fatal);
  },
};

// 5x4 board, mines marked '*', with the numbers the game shows:
//   . . . . *      0 0 0 1 *
//   . . . . .      0 1 1 2 1
//   . . * . .      0 1 * 2 1
//   . . . . *      0 1 1 2 *
// Revealing (0,0) floods the six zeros and their borders, leaving (4,1),
// (3,2), (4,2), (2,3), and (3,3) covered.
function fixture(rows) {
  const mines = [];
  for (const row of rows) for (const ch of row) mines.push(ch === '*');
  return mines;
}
const width = 5;
const height = 4;
const board = { width, height, mines: 3 };
const mines = fixture(['....*', '.....', '..*..', '....*']);
const at = (x, y) => y * width + x;
function finalBoard(mineAt) {
  return { cells: mineAt.map((mine) => ({ mine })) };
}
function trace(events, extra = {}) {
  return { events: events.map(([kind, index, t, marks = {}]) => ({ kind, index, t, ...marks })), ...extra };
}

console.log('replay: every input kind on a hand-built win');
{
  const events = [
    ['lup', at(0, 0), 1000], // first reveal: floods the zeros
    ['lup', at(3, 1), 1300], // the 2 at (3,1) has no flags yet -> missing-flag no-op
    ['rdown', at(2, 2), 1600], // flag a mine
    ['rdown', at(4, 0), 1900], // flag a mine
    ['lup', at(3, 1), 2200], // chord (3,1): opens (4,1), (3,2), (4,2)
    ['lup', at(0, 1), 2500], // revealed zero -> blank no-op
    ['rdown', at(3, 0), 2800], // flag action on an open number -> no-op
    ['rdown', at(3, 3), 3100], // wrong flag on a safe cell
    ['rdown', at(3, 3), 3400], // remove it
    ['lup', at(3, 0), 3700], // the 1 at (3,0) has nothing left to open -> finished no-op
    ['lup', at(4, 0), 4000], // left release on a flag -> no-op
    ['lup', at(2, 3), 4300], // direct reveal
    ['rdown', at(4, 3), 4600], // flag the last mine
    ['lup', at(4, 2), 6900], // chord (4,2) after a 2.3 s pause: single target (3,3)
  ];
  const replay = TrainingCore.replay(trace(events, { finalBoard: finalBoard(mines) }), 'win', board, deps);
  check('replay status', replay.status === 'replayed');
  const kinds = replay.steps.map((s) => s.kind);
  check('input kinds in order: ' + kinds.join(','), JSON.stringify(kinds) === JSON.stringify([
    'first-reveal', 'noop-missing-flag', 'flag', 'flag', 'chord-multi', 'noop-blank', 'noop-right-on-open',
    'flag', 'unflag', 'noop-finished', 'noop-on-flag', 'reveal', 'flag', 'chord-single']));
  check('first reveal has no gap; later gaps are measured', replay.steps[0].gapMs === null && replay.steps[1].gapMs === 300);
  check('each step keeps its trace time and cell', replay.steps[0].t === 1000 && replay.steps[0].index === at(0, 0)
    && replay.steps[13].t === 6900 && replay.steps[13].index === at(4, 2));
  check('played time runs from the first reveal to the last input', replay.playedMs === 5900);
  const breakdown = TrainingCore.winBreakdown(replay);
  check('timed inputs exclude the first reveal', breakdown.inputCount === 13);
  check('no-op count', breakdown.noopCount === 5);
  check('one pause over 1 s', breakdown.pauseCount === 1 && breakdown.pauseMs === 2300);
  check('flag classes', JSON.stringify(breakdown.flags) === JSON.stringify(
    { usedByMultiChord: 2, usedOnlyBySingleChord: 1, neverUsed: 0, removed: 1, onSafeCell: 1 }));
  // Removable: 5 no-ops + unflag + removed placement + single-chord-only flag = 8.
  check('removable inputs', breakdown.removableCount === 8);
  check('removable time', breakdown.removableMs === 300 * 7 + 300);
  check('chord kinds counted', breakdown.byKind['chord-multi'].count === 1 && breakdown.byKind['chord-single'].count === 1);
}

console.log('replay: both-button chords and the 1.5 click');
{
  const gesture = { chordGesture: true };
  const events = [
    ['lup', at(0, 0), 0], // first reveal
    ['rdown', at(2, 2), 300], // 1.5 click: the right press flags (2,2)...
    ['rdown', at(4, 0), 600], // ...another flag...
    ['lup', at(3, 1), 900, gesture], // ...then the left release on the 2 chords it
    ['rdown', at(2, 3), 1200, gesture], // right press that joined a chord on (2,3)...
    ['lup', at(2, 3), 1300, gesture], // ...whose release over an unopened cell does not reveal
    ['lup', at(2, 3), 1600], // a plain left click reveals it
    ['rdown', at(4, 3), 1900], // flag the last mine
    ['rdown', at(4, 2), 2200, gesture], // classic both-button chord started with the right button
    ['lup', at(4, 2), 2300, gesture],
  ];
  const replay = TrainingCore.replay(trace(events, { finalBoard: finalBoard(mines) }), 'win', board, deps);
  check('both-button chords replay to a win', replay.status === 'replayed');
  check('the right halves of chords are not inputs; the unopened release is a no-op: '
    + replay.steps.map((s) => s.kind).join(','), JSON.stringify(replay.steps.map((s) => s.kind)) === JSON.stringify(
    ['first-reveal', 'flag', 'flag', 'chord-multi', 'noop-chord-on-unopened', 'reveal', 'flag', 'chord-single']));
  const firstGesture = TrainingCore.replay(trace([['lup', at(0, 0), 0, gesture], ['lup', at(2, 2), 100]],
    { finalBoard: finalBoard(mines) }), 'loss', board, deps);
  check('a both-button release is never the game-starting reveal', firstGesture.status === 'replayed'
    && JSON.stringify(firstGesture.steps.map((s) => s.kind)) === JSON.stringify(['noop-chord-on-unopened', 'first-reveal']));
}

console.log('replay: outcome checks');
{
  const unfinished = [['lup', at(0, 0), 0], ['lup', at(3, 3), 400]];
  check('an unfinished "win" diverges',
    TrainingCore.replay(trace(unfinished, { finalBoard: finalBoard(mines) }), 'win', board, deps).status === 'diverged');
  const death = [['lup', at(0, 0), 0], ['lup', at(2, 2), 400]];
  check('a loss that hits a mine replays',
    TrainingCore.replay(trace(death, { finalBoard: finalBoard(mines) }), 'loss', board, deps).status === 'replayed');
  const afterDeath = [...death, ['lup', at(4, 2), 800]];
  check('inputs after an explosion diverge',
    TrainingCore.replay(trace(afterDeath, { finalBoard: finalBoard(mines) }), 'loss', board, deps).status === 'diverged');
  check('no layout without a final board or a known seeded placement',
    TrainingCore.replay(trace(death, { boardVersion: 'colored-noise-fbm-exp-weights-v1', rngVersion: GameRandom.VERSION, seed: '0'.repeat(31) + '1' }),
      'loss', board, deps).status === 'no-layout');
  check('no reveal at all',
    TrainingCore.replay(trace([['rdown', at(2, 2), 0]], { finalBoard: finalBoard(mines) }), 'win', board, deps).status === 'no-reveal');
  const preFlag = [['rdown', at(4, 0), 0], ['lup', at(4, 0), 100], ['lup', at(0, 0), 200],
    ['rdown', at(2, 2), 500], ['lup', at(3, 1), 800], ['lup', at(2, 3), 1100], ['lup', at(3, 3), 1400]];
  const replay = TrainingCore.replay(trace(preFlag, { finalBoard: finalBoard(mines) }), 'win', board, deps);
  check('a pre-start flag and a release on it precede the first reveal', replay.status === 'replayed'
    && JSON.stringify(replay.steps.map((s) => s.kind)) === JSON.stringify(
      ['flag', 'noop-on-flag', 'first-reveal', 'flag', 'chord-multi', 'reveal', 'reveal']));
  const breakdown = TrainingCore.winBreakdown(replay);
  check('inputs before the timer starts are not timed', breakdown.inputCount === 4 && replay.playedMs === 1200);
}

// A no-flag solver: click every still-covered safe cell in index order.
function solvedTrace(seed, firstIndex, stepMs) {
  const { width: w, height: h, mines: m } = TrainingCore.BOARD;
  const mineAt = Solver.randomPlacement(w, h, m, firstIndex, GameRandom.fromSeed(seed));
  const n = w * h;
  const around = (i) => {
    const out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = (i % w) + dx;
      const y = Math.floor(i / w) + dy;
      if ((dx || dy) && x >= 0 && x < w && y >= 0 && y < h) out.push(y * w + x);
    }
    return out;
  };
  const adjacent = mineAt.map((_, i) => around(i).filter((j) => mineAt[j]).length);
  const open = new Uint8Array(n);
  const flood = (start) => {
    const stack = [start];
    while (stack.length) {
      const i = stack.pop();
      if (open[i]) continue;
      open[i] = 1;
      if (adjacent[i] === 0) for (const j of around(i)) if (!open[j] && !mineAt[j]) stack.push(j);
    }
  };
  const events = [];
  let t = 500;
  const click = (i) => { events.push({ kind: 'lup', index: i, t }); t += stepMs; flood(i); };
  click(firstIndex);
  for (let i = 0; i < n; i++) if (!mineAt[i] && !open[i]) click(i);
  return { mineAt, events, trace: { events, seed, rngVersion: GameRandom.VERSION, boardVersion: 'uniform-first-safe-fisher-yates-v1' } };
}

console.log('replay: seed-rebuilt Expert boards');
{
  const seed = '0123456789abcdef0123456789abcdef';
  const solved = solvedTrace(seed, 0, 250);
  const replay = TrainingCore.replay(solved.trace, 'win', TrainingCore.BOARD, deps);
  check('seed-rebuilt no-flag win replays', replay.status === 'replayed');
  check('every timed input is a reveal', replay.steps.slice(1).every((s) => s.kind === 'reveal'));
  const wrongSeed = { ...solved.trace, seed: 'fedcba9876543210fedcba9876543210' };
  check('the wrong seed diverges', TrainingCore.replay(wrongSeed, 'win', TrainingCore.BOARD, deps).status === 'diverged');
  const withFinal = { events: solved.events, finalBoard: finalBoard(solved.mineAt) };
  check('the saved final board replays the same inputs',
    TrainingCore.replay(withFinal, 'win', TrainingCore.BOARD, deps).steps.length === replay.steps.length);
}

console.log('records: pace, runs, weeks');
{
  const day = Date.UTC(2026, 8, 21, 18);
  const win = (i, timeMs, bv3, clicks, wastedClicks) => ({ endedAt: day + i * 60000, outcome: 'win', timeMs, bv3, clicks,
    ...(wastedClicks === undefined ? {} : { wastedClicks }), actionEvaluations: [] });
  const wins = [win(0, 100000, 175, 240, 40), win(1, 80000, 160, 200, 20), win(2, 90000, 150, 190)];
  const pace = TrainingCore.winPace(wins);
  check('median win time over all wins', pace.medianWinS === 90);
  check('input medians skip records without no-op counts', pace.inputMeasuredWins === 2
    && Math.abs(pace.medianIoe - (175 / 280 + 160 / 220) / 2) < 1e-12);
  check('median no-ops', pace.medianNoopsPerWin === 30);
  const death = (i, mistakes, evidence) => ({ endedAt: day + i * 60000, outcome: 'loss', timeMs: 30000, bv3: 170,
    clicks: 50, wastedClicks: 3, actionEvaluations: [{ version: 'action-evaluation-v1', action: 'reveal', result: 'death',
      mistakes, evidence }] });
  const runs = [
    wins[0],
    death(10, ['opened-proven-mine'], { safeAvailable: true, knowledge: 'proven-mine' }),
    death(11, ['guessed-with-safe-move'], { safeAvailable: true }),
    death(12, [], { chosenRisk: 0.3, bestRisk: 0.3, boardProgress: 0.6 }),
    { ...death(13, [], {}), actionEvaluations: [{ version: 'action-evaluation-v1', action: 'reveal', result: 'death', legacy: { source: 'stupidDeath' }, mistakes: ['legacy-avoidable'], evidence: {} }] },
  ];
  const summary = TrainingCore.runs(runs, deps.fatalKindOf);
  check('run conversion', summary.runs === 5 && summary.won === 1 && summary.conversion === 0.2);
  check('legacy losses are not classified', summary.classifiedLosses === 3);
  check('avoidable share uses the game classifier (mine-safe, guess-safe)', summary.avoidableLosses === 2
    && Math.abs(summary.avoidableShare - 2 / 3) < 1e-12);
  const weeks = TrainingCore.weeks([...wins, ...runs.slice(1), { ...wins[1], endedAt: day - 7 * 86400000 }], deps.fatalKindOf);
  check('weeks newest first', weeks.length === 2 && weeks[0].weekStartMs > weeks[1].weekStartMs);
  check('week counts games, best, and conversion', weeks[0].games === 7 && weeks[0].bestMs === 80000
    && weeks[0].runs === 7 && Math.abs(weeks[0].conversion - 3 / 7) < 1e-12);
}

console.log('stages');
{
  const values = { ioe: 0.95, noopsPerWin: 3, removableFlagsPerWin: 8, runConversion: 0.3,
    avoidableShare: 0.5, wrongFlagsPerWin: 0.2, pausesPerWin: 7, bvPerS: 1.8, goalWins: 0 };
  const status = TrainingCore.stageStatus(values, {});
  check('economy complete', status.stages[0].complete);
  check('runs incomplete, so runs is current', !status.stages[1].complete && status.currentStageId === 'runs');
  const unmeasured = TrainingCore.stageStatus({ ...values, noopsPerWin: null }, {});
  check('an unmeasured criterion is not met', !unmeasured.stages[0].complete && unmeasured.currentStageId === 'economy');
  const done = TrainingCore.stageStatus({ ...values, runConversion: 0.5, avoidableShare: 0.3, pausesPerWin: 3, bvPerS: 2.9, goalWins: 1 }, {});
  check('all complete leaves no current stage', done.currentStageId === null);
}

console.log('player states compared');
{
  const base = new Date(2026, 8, 20, 10, 0, 0).getTime();
  const noop = (reason) => ({ version: 'action-evaluation-v1', action: 'no-op', result: 'continued',
    mistakes: ['no-op-click'], evidence: { reason } });
  const records = [{ endedAt: base - 86400000, outcome: 'win', timeMs: 95000, bv3: 180, clicks: 200, wastedClicks: 0,
    flagsPlaced: 90, states: ['sleepy'], actionEvaluations: [] }];
  // Five pairs of blocks, without the state first, each block one win and
  // one loss past 20 s. With the state the win is faster in pairs 1 and 2
  // only, so the rule's four pairs say no; pair 5 would tip a five-pair count.
  const winS = [[100, 90], [100, 95], [90, 99], [80, 100], [200, 70]];
  winS.forEach(([withoutS, withS]) => {
    for (const [withState, s] of [[false, withoutS], [true, withS]]) {
      const states = withState ? ['exp'] : [];
      const endedAt = base + records.length * 300000;
      records.push({ endedAt, outcome: 'win', timeMs: s * 1000, bv3: 180, clicks: 200, wastedClicks: withState ? 0 : 2,
        flagsPlaced: withState ? 60 : 90, states,
        actionEvaluations: withState ? [] : [noop('chord-short-of-flags'), noop('chord-short-of-flags')] });
      records.push({ endedAt: endedAt + 60000, outcome: 'loss', timeMs: 30000, bv3: 180, clicks: 50, wastedClicks: 0,
        flagsPlaced: 20, states, actionEvaluations: [] });
    }
  });
  records.push({ endedAt: base + 50 * 300000, outcome: 'loss', timeMs: 25000, bv3: 180, clicks: 60, wastedClicks: 1,
    flagsPlaced: 20, states: [], actionEvaluations: [noop('chord-unavailable')] });
  const comparisons = TrainingCore.stateComparisons(records, deps.fatalKindOf);
  check('states listed most recently used first', comparisons.map((c) => c.state).join() === 'exp,sleepy');
  const exp = comparisons[0];
  check('scope is the days the state was used', exp.days === 1 && exp.without.games === 11 && exp.with.games === 10);
  check('blocks alternate and pair in order within the day', exp.blocks === 11 && exp.pairs === 5 && exp.comparablePairs === 5);
  check('the rule decides on the first four pairs only', exp.rule.faster === 2 && exp.rule.stateBetter === false);
  check('late win rate over the four pairs\u2019 blocks', exp.rule.lateWith === 0.5 && exp.rule.lateWithout === 0.5);
  check('chords one flag short: counted per game, old combined reason unmeasured',
    exp.with.meanShortChordsPerGame === 0 && exp.without.meanShortChordsPerGame === 1
    && exp.without.shortChordMeasuredGames === 10);
  check('flags per win by condition', exp.with.medianFlagsPerWin === 60 && exp.without.medianFlagsPerWin === 90);
  const sleepy = comparisons[1];
  check('a state with no games without it has nothing to compare', sleepy.without.games === 0
    && sleepy.without.medianWinS === null && sleepy.rule === null && sleepy.comparablePairs === 0);
  check('the old combined reason reads as unmeasured', TrainingCore.shortChords(records[records.length - 1]) === undefined
    && TrainingCore.shortChords({ ...records[0], actionEvaluations: undefined }) === undefined);
  // Pair differences with minus without: -10, -5, +9, +20, -130 s.
  const difference = exp.winTimeDifference;
  const expectedMean = (-10 - 5 + 9 + 20 - 130) / 5;
  check('the paired interval covers every comparable pair', difference.pairs === 5
    && Math.abs(difference.meanS - expectedMean) < 1e-9 && difference.lowS < expectedMean && difference.highS > expectedMean);
  check('fewer than 3 pairs give no interval', sleepy.winTimeDifference === null
    && TrainingCore.pairedInterval([1, 2]) === null);
}

console.log('Student t quantiles');
{
  // Two-sided 95% quantiles from published tables.
  const known = [[1, 12.7062], [2, 4.3027], [4, 2.7764], [10, 2.2281], [30, 2.0423], [120, 1.9799]];
  check('t quantiles match tables to 4 decimals', known.every(([df, t]) => Math.abs(TrainingCore.t975(df) - t) < 5e-5));
  const interval = TrainingCore.pairedInterval([1, 2, 3]);
  check('interval of 1, 2, 3 is 2 \u00b1 4.3027 \u00d7 1/\u221a3', Math.abs(interval.meanS - 2) < 1e-12
    && Math.abs(interval.highS - (2 + 4.3027 / Math.sqrt(3))) < 1e-3);
}

console.log('summary: end to end over seed-rebuilt Expert wins');
{
  const records = [];
  const traces = [];
  for (let i = 0; i < 3; i++) {
    const seed = (i + 1).toString(16).padStart(32, 'a');
    const solved = solvedTrace(seed, 0, 300);
    const inputs = solved.events.length;
    records.push({ endedAt: 1790000000000 + i * 1000, outcome: 'win', timeMs: (inputs - 1) * 300, bv3: inputs,
      clicks: inputs, wastedClicks: 0, actionEvaluations: [] });
    traces.push(i === 1 ? undefined : solved.trace);
  }
  records.push({ endedAt: 1790000009000, outcome: 'loss', timeMs: 2000, bv3: 170, clicks: 2, wastedClicks: 0,
    actionEvaluations: [{ version: 'action-evaluation-v1', action: 'reveal', result: 'death', mistakes: [], evidence: { boardProgress: 0.01 } }] });
  const summary = TrainingCore.summary(records, traces, deps);
  check('replay status counts', summary.replayStatus.replayed === 2 && summary.replayStatus['no-trace'] === 1);
  check('budget over replayed wins only', summary.budget.wins === 2);
  check('no-flag wins have no removable inputs', summary.budget.removableInputsPerWin === 0);
  check('IOE of the synthetic no-flag wins is 1', summary.pace.medianIoe === 1);
  check('seconds per input matches the synthetic pace', Math.abs(summary.budget.secondsPerWin
    - summary.budget.inputsPerWin * 0.3) < 1e-9);
  check('economy met by pure no-flag wins; runs current with no classified losses',
    summary.stages[0].complete && summary.currentStageId === 'runs');
  let threw = false;
  try { TrainingCore.summary(records, traces.slice(1), deps); } catch (error) { threw = /one trace slot/.test(error.message); }
  check('a trace list that does not match the recent wins fails loudly', threw);
}

console.log(failures === 0 ? '\nall tests passed' : '\n' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);

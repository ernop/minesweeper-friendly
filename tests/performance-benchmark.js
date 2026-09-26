'use strict';
// Compare the working tree with an explicit baseline revision. Synthetic
// histories/traces stay in Node; no player storage is read or written.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const revision = process.argv[2];
if (!revision) throw new Error('Usage: node tests/performance-benchmark.js BASELINE_GIT_REVISION');
const repo = path.join(__dirname, '..');
const current = (file) => fs.readFileSync(path.join(repo, file), 'utf8');
const baseline = (file) => execFileSync('git', ['show', revision + ':' + file], { cwd: repo, encoding: 'utf8' });
function span(source, from, to) {
  const start = source.indexOf(from), end = source.indexOf(to, start);
  assert(start >= 0 && end > start, 'missing benchmark source span: ' + from);
  return source.slice(start, end);
}
function fitOf(read) {
  return vm.runInThisContext('(() => {' + span(read('game/charts.js'), 'function median(',
    "// The chart's trend lines") + ';return fitTheilSen;})()');
}
const oldFit = fitOf(baseline);
const newFit = vm.runInThisContext('(() => {' + current('trend-fit.js') + ';return fitTheilSen;})()');
const oldRanks = baseline('game/result-ranks.js');
const oldStreaks = vm.runInThisContext(`(modeRecords, slack) => {
  ${span(oldRanks, '  const runs = [[]];', '  for (const [label, slack]')}
  ${span(oldRanks, '    const span = Math.min(slack + 1, runs.length);', '    const myIndex =')}
  return segments;
}`);
const newStreaks = vm.runInThisContext('(() => {' + span(current('game/rankings.js'),
  '//-------STREAK RANKINGS: COMPUTATION-------', '//-------STREAK RANKINGS: COMPUTATION END-------')
  + ';return (records, slack) => rankedStreaks(streakRuns(records), slack);})()');
function metricsOf(read, cached) {
  return vm.runInThisContext('(() => {' + read('game/trace-metrics.js')
    + ';return ' + (cached ? 'createTraceMetricComputer' : 'computeAllTraceMetrics') + ';})()');
}
const timed = (run) => {
  const durations = [];
  let value;
  for (let repeat = 0; repeat < 3; repeat++) {
    const start = performance.now();
    value = run();
    durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);
  return { ms: durations[1], value };
};
const report = (name, size, before, after) => console.log(JSON.stringify({
  name, size, beforeMs: Number(before.ms.toFixed(2)), afterMs: Number(after.ms.toFixed(2)),
  speedup: Number((before.ms / after.ms).toFixed(1)),
}));
let seed = 835;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
const warmup = Array.from({ length: 100 }, (_, i) => [i, random()]);
oldFit(warmup); newFit(warmup);
for (const size of [1000, 2000, 4000]) {
  const pairs = Array.from({ length: size }, (_, i) => [1.7e12 + i * 60000, Math.round(random() * 100000) / 1000]);
  const before = timed(() => oldFit(pairs)), after = timed(() => newFit(pairs));
  assert.deepEqual(after.value, before.value);
  report('trend fit', size, before, after);
}
for (const size of [5000, 10000, 20000]) {
  const records = Array.from({ length: size }, (_, i) => ({ endedAt: i, outcome: i % 2 ? 'loss' : 'win' }));
  const before = timed(() => oldStreaks(records, 2)), after = timed(() => newStreaks(records, 2));
  assert.deepEqual(after.value, before.value);
  report('near-near-streak', size, before, after);
}
for (const size of [20, 40, 80]) {
  const t = [], x = [], y = [];
  const events = [{ t: 0, kind: 'layout', left: -3.75, top: -3.75, width: 277.5, height: 277.5, boardWidth: 9, boardHeight: 9 }];
  for (let click = 0; click < size; click++) {
    for (let point = 0; point < 20; point++) {
      t.push(click * 500 + point * 20);
      x.push(click % 9 * 28 + point); y.push(Math.floor(click / 9) % 9 * 28 + Math.sin(point));
    }
    events.push({ t: click * 500 + 395, kind: 'ldown', x: x.at(-1), y: y.at(-1), index: click % 81 },
      { t: click * 500 + 400, kind: 'lup', x: x.at(-1), y: y.at(-1), index: click % 81 });
  }
  const oldMetrics = metricsOf(baseline, false), createMetrics = metricsOf(current, true);
  const before = timed(() => {
    let last;
    for (let at = 0; at < size * 500; at += 100) {
      const end = t.findIndex((time) => time > at), count = end < 0 ? t.length : end;
      last = oldMetrics(t.slice(0, count), x.slice(0, count), y.slice(0, count), events.filter((e) => e.t <= at), at);
    }
    return last;
  });
  const sampleT = Float64Array.from(t), sampleX = Float64Array.from(x), sampleY = Float64Array.from(y);
  const after = timed(() => {
    const newMetrics = createMetrics();
    let last, samples = 0, eventCount = 0;
    const prefix = [];
    for (let at = 0; at < size * 500; at += 100) {
      while (samples < t.length && t[samples] <= at) samples++;
      while (eventCount < events.length && events[eventCount].t <= at) prefix.push(events[eventCount++]);
      last = newMetrics(sampleT.subarray(0, samples), sampleX.subarray(0, samples), sampleY.subarray(0, samples), prefix, at);
    }
    return last;
  });
  assert.deepEqual(after.value, before.value);
  report('trace restoration (clicks)', size, before, after);
}

// Per-action evidence: the proof, odds, and Justice calls one click makes,
// over positions from seeded games. The former join added up to 250,000
// per-layout weights one at a time, so its sums carry rounding up to about
// 3e-11 relative; grouped sums may differ within that. Everything else,
// including every threshold decision, must match exactly.
function solverOf(read) {
  const context = vm.createContext({ console, performance });
  for (const [file, name] of [['justice.js', 'Justice'], ['odds.js', 'Odds'], ['solver.js', 'Solver']]) {
    context.module = { exports: {} };
    vm.runInContext(read(file), context, { filename: file });
    context[name] = context.module.exports;
  }
  return context;
}
const oldSolver = solverOf(baseline), newSolver = solverOf(current);
function actionPositions(width, height, mines, games) {
  const { Justice, Solver } = newSolver;
  const positions = [];
  for (let game = 0; game < games; game++) {
    const n = width * height;
    const first = Math.floor(random() * n);
    const mineAt = Solver.randomPlacement(width, height, mines, first, random);
    const adjacent = Solver.adjacentMap(width, height, mineAt);
    const revealed = new Array(n).fill(false);
    const flagged = new Array(n).fill(false);
    const flood = (start) => {
      for (const stack = [start]; stack.length > 0;) {
        const i = stack.pop();
        if (revealed[i] || flagged[i]) continue;
        revealed[i] = true;
        if (adjacent[i] === 0) stack.push(...Justice.neighbors(i, width, height).filter((j) => !revealed[j]));
      }
    };
    flood(first);
    // Real play flags and chords across the whole game; unproven clicks
    // pick a truly safe cell so games reach their large mid-game frontiers.
    const pick = (list) => list[Math.floor(random() * list.length)];
    while (revealed.filter(Boolean).length < n - mines) {
      const view = { width, height, mines, revealed: revealed.slice(), adjacent };
      const facts = Justice.proveFacts(view, Justice.rawClues(view));
      const open = [...Array(n).keys()].filter((i) => !revealed[i] && !flagged[i]);
      const safe = open.filter((i) => facts.get(i) === 2);
      const provenMines = open.filter((i) => facts.get(i) === 1);
      const chordable = [...Array(n).keys()].filter((i) => revealed[i] && adjacent[i] > 0
        && Justice.neighbors(i, width, height).filter((j) => flagged[j]).length === adjacent[i]
        && Justice.neighbors(i, width, height).some((j) => !revealed[j] && !flagged[j]));
      const roll = random();
      if (chordable.length > 0 && roll < 0.25) {
        const cell = pick(chordable);
        positions.push({ view, cell, flag: true });
        for (const j of Justice.neighbors(cell, width, height)) if (!flagged[j]) flood(j);
      } else if (provenMines.length > 0 && roll < 0.55) {
        const cell = pick(provenMines);
        positions.push({ view, cell, flag: true });
        flagged[cell] = true;
      } else {
        const cell = safe.length > 0 ? pick(safe) : pick(open.filter((i) => !mineAt[i]));
        positions.push({ view, cell, flag: false });
        flood(cell);
      }
    }
  }
  return positions;
}
function actionEvidence({ Justice, Odds, Solver }, positions) {
  return positions.map(({ view, cell, flag }) => {
    const copy = () => ({ ...view, revealed: view.revealed.slice(), adjacent: view.adjacent.slice() });
    const facts = Solver.classifyCells(copy(), [cell]);
    const kinds = { complete: facts.complete, visits: facts.visits, kinds: facts.kinds };
    if (flag) {
      const odds = Odds.analyzeView(copy());
      return { kinds, odds: odds.measured ? { visits: odds.visits, pMine: odds.pMine } : false };
    }
    return { kinds, guess: Odds.scoreGuess(copy(), cell, { considerJustice: true }),
      justice: Justice.certifyEntry(copy(), cell) };
  });
}
function assertEvidenceEqual(after, before, where = 'evidence') {
  if (typeof after === 'number' && typeof before === 'number') {
    assert(after === before || Math.abs(after - before) <= 1e-9 * Math.max(1, Math.abs(before)),
      where + ': ' + after + ' vs ' + before);
  } else if (after && before && typeof after === 'object' && typeof before === 'object') {
    for (const key of new Set([...Object.keys(after), ...Object.keys(before)])) {
      assertEvidenceEqual(after[key], before[key], where + '.' + key);
    }
  } else assert.equal(after, before, where);
}
// The player feels the slowest click, so the worst position is reported
// beside the total.
const slowestPosition = (solver, positions) => timed(() => Math.max(...positions.map((position) => {
  const start = performance.now();
  actionEvidence(solver, [position]);
  return performance.now() - start;
})));
for (const [width, height, mines, games] of [[16, 16, 40, 4], [30, 16, 99, 3]]) {
  const positions = actionPositions(width, height, mines, games);
  const before = timed(() => actionEvidence(oldSolver, positions));
  const after = timed(() => actionEvidence(newSolver, positions));
  assertEvidenceEqual(after.value, before.value);
  const name = 'action evidence ' + width + 'x' + height;
  report(name + ' (positions)', positions.length, before, after);
  const worstBefore = slowestPosition(oldSolver, positions), worstAfter = slowestPosition(newSolver, positions);
  report(name + ' slowest position', positions.length,
    { ms: worstBefore.value }, { ms: worstAfter.value });
}

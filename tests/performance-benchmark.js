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
  const events = [{ t: 0, kind: 'layout', left: 0, top: 0, width: 270, height: 270, boardWidth: 9, boardHeight: 9 }];
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

'use strict';
// Known-answer tests for the queue (hover-then-later-click) and pace
// recovery metrics in minesweeper.js: constructed traces whose dwells,
// waits, baselines, and post-mistake gaps are known analytically.
//
// Usage: node tests/metrics-queue-recovery-test.js

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const repo = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'minesweeper.js'), 'utf8');
const startIdx = source.indexOf('//-------TRACE METRICS: COMPUTATION');
const endIdx = source.indexOf('//-------TRACE METRICS: DISPLAY');
if (startIdx === -1 || endIdx === -1) throw new Error('section markers not found');
vm.runInThisContext(source.slice(startIdx, endIdx));

let checks = 0;
function assertClose(name, actual, want, tol) {
  checks++;
  if (actual === undefined || Math.abs(actual - want) > tol) {
    throw new Error(`${name}: got ${actual}, want ${want} (tol ${tol})`);
  }
}
function assertEq(name, actual, want) {
  checks++;
  if (actual !== want) throw new Error(`${name}: got ${actual}, want ${want}`);
}
function assertUndefined(name, actual) {
  checks++;
  if (actual !== undefined) throw new Error(`${name}: got ${actual}, want undefined`);
}

// ---- Queue metrics ----
// Board 9x9 at (0,0), 90x90px, so cells are 10px. Samples walk the cursor:
// cell 0 from t=0 to t=400 (a 400ms clickless dwell, recorded), cell 2
// from 400 to 600 (200ms, under the 300ms rule), cell 40 from 600 to 1500
// (900ms but a click lands during it, so no dwell), then cell 7.
// Presses: cell 0 at t=700 (dwell ended 400, needs <= 200: too recent, not
// queued), cell 40 at t=1100 (no completed dwell yet), cell 0 at t=2000
// (queued; wait 2000-400=1600), cell 2 at t=2200 (its stay was too short).
{
  const layout = {
    t: 0, kind: 'layout', left: 0, top: 0, width: 90, height: 90,
    boardWidth: 9, boardHeight: 9,
  };
  const events = [
    layout,
    { t: 700, kind: 'lup', x: 5, y: 5, index: 0 },
    { t: 1100, kind: 'lup', x: 45, y: 45, index: 40 },
    { t: 2000, kind: 'lup', x: 5, y: 5, index: 0 },
    { t: 2200, kind: 'rdown', x: 25, y: 5, index: 2 },
  ];
  const sampleT = [0, 400, 600, 1500, 5000];
  const sampleX = [5, 25, 45, 75, 75];
  const sampleY = [5, 5, 45, 5, 5];
  const q = computeQueueMetrics(sampleT, sampleX, sampleY, events);
  assertEq('queue: one queued click', q.queuedClickCount, 1);
  assertClose('queue: share over 4 cell presses', q.queuedClickShare, 0.25, 1e-9);
  assertClose('queue: wait is leave-to-click', q.queueWaitMedianMs, 1600, 1e-9);
  assertClose('queue: max equals the only wait', q.queueWaitMaxMs, 1600, 1e-9);
}

// No dwells at all: zero queued clicks and no wait values.
{
  const q = computeQueueMetrics([], [], [], [
    { t: 100, kind: 'lup', x: 5, y: 5, index: 0 },
  ]);
  assertEq('queue: no samples means no dwells', q.queuedClickCount, 0);
  assertUndefined('queue: no waits means no median', q.queueWaitMedianMs);
}

// ---- Recovery metrics ----
// Actions at t = 0, 1000, 2000, 3000, 6000, 7000, 8000. Gaps sorted:
// [1000 x5, 3000], baseline (median of 6) = 1000. Mistake decisions at
// t=3000 (next gap 3000, ratio 3.0; one gap over 1.5x then back: recovery
// 1) and t=6000 (next gap 1000, ratio 1.0, recovery 0). A death-tagged
// decision and a mistake on the final action must both be excluded.
{
  const action = (t) => ({ t: t, kind: 'lup', x: 0, y: 0, index: 1 });
  const mistake = (t, result) => ({
    t: t, kind: 'decision', x: 0, y: 0,
    evaluation: { mistakes: ['no-op-click'], result: result },
  });
  const events = [
    action(0), action(1000), action(2000), action(3000),
    mistake(3000, 'continued'),
    action(6000),
    mistake(6000, 'continued'),
    action(7000), action(8000),
    mistake(8000, 'continued'), // final action: no next gap, skipped
    mistake(8000, 'death'),     // deaths have no post-pace, excluded
  ];
  const r = computeRecoveryMetrics(events);
  assertEq('recovery: two measurable mistakes', r.measuredMistakes, 2);
  assertClose('recovery: median next-gap ratio', r.postMistakeGapRatio, 2.0, 1e-9);
  assertClose('recovery: median elevated actions', r.recoveryActionsMedian, 0.5, 1e-9);
}

// A clean game (no mistake decisions) reports zero mistakes and no ratios.
{
  const r = computeRecoveryMetrics([
    { t: 0, kind: 'lup', x: 0, y: 0, index: 1 },
    { t: 500, kind: 'lup', x: 0, y: 0, index: 2 },
    { t: 900, kind: 'rdown', x: 0, y: 0, index: 3 },
  ]);
  assertEq('recovery: clean game has zero measured mistakes', r.measuredMistakes, 0);
  assertUndefined('recovery: no mistakes means no ratio', r.postMistakeGapRatio);
}

// Under three actions nothing is measurable at all.
{
  const r = computeRecoveryMetrics([
    { t: 0, kind: 'lup', x: 0, y: 0, index: 1 },
    { t: 500, kind: 'lup', x: 0, y: 0, index: 2 },
  ]);
  assertUndefined('recovery: two actions measure nothing', r.measuredMistakes);
}

console.log('metrics queue/recovery tests passed (' + checks + ' checks)');

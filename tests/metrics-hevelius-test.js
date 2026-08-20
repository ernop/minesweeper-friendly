'use strict';
// Known-answer tests for the in-page clinical (Hevelius-style) movement
// features and the waste (survey Tier 1/2) metrics in minesweeper.js.
// There is no runnable Hevelius reference implementation (the pipeline was
// never published — reference/hevelius/FEATURES.md "System availability"),
// so verification is against constructed movements whose feature values are
// known analytically.
//
// Usage: node tests/metrics-hevelius-test.js

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

// A 9x9 board rect at (0, 0), 30 px cells: cell (col, row) center is at
// (col*30+15, row*30+15).
const LAYOUT = { t: 0, kind: 'layout', left: 0, top: 0, width: 270, height: 270,
  boardWidth: 9, boardHeight: 9 };

// ---- Test 1: one straight constant-speed movement, clean click ----
// Cursor moves along y=135 (row 4) from x=0 to x=200 at exactly 1 px/ms,
// one sample per 10 ms, pressing and releasing without slipping at
// (200, 135) — inside cell (6, 4), index 4*9+6 = 42, center (195, 135) —
// at the instant of the last sample, so the speed profile is genuinely
// constant. (A still tail before the click would put a step edge into the
// speed series and the 7 Hz FIR's side lobes overshoot ~1.5% there;
// that is the published filter's real behavior, not an error.)
{
  const t = [];
  const x = [];
  const y = [];
  for (let ms = 0; ms <= 200; ms += 10) { t.push(ms); x.push(ms); y.push(135); }
  const events = [
    LAYOUT,
    { t: 200, kind: 'ldown', x: 200, y: 135, index: 42 },
    { t: 200, kind: 'lup', x: 200, y: 135, index: 42 },
  ];
  const h = computeHevelius(t, x, y, events);

  assertEq('t1 movementCount', h.movementCount, 1);
  assertEq('t1 movementTime', h.movementTimeMs, 200);
  // Execution: first (0) to last (200) mousemove; the button interval is
  // zero-length, so nothing is excluded.
  assertEq('t1 execution', h.executionTimeMs, 200);
  assertEq('t1 execNoPauses', h.executionTimeNoPausesMs, 200);
  // Constant speed: the FIR has unity DC gain, so smoothed speed is 1.
  assertClose('t1 peakSpeed', h.peakSpeedPxPerMs, 1, 1e-9);
  // ... and its derivative chain is exactly zero.
  assertClose('t1 peakAccel', h.peakAccelPxPerMs2, 0, 1e-12);
  assertClose('t1 normJerk', h.normalizedJerkNoPauses, 0, 1e-12);
  // One speed pulse above both thresholds.
  assertEq('t1 submovements', h.submovementCount, 1);
  // A perfectly straight path: no deviation, no crossings.
  assertClose('t1 axisDev', h.maxAxisDeviationPx, 0, 1e-9);
  assertClose('t1 movementError', h.movementErrorPx, 0, 1e-9);
  assertEq('t1 axisCrossings', h.axisCrossings, 0);
  // No 100 ms gaps between the 10 ms samples.
  assertEq('t1 pauses', h.pauseCount, 0);
  assertEq('t1 longestPause', h.longestPauseMs, 0);
  // Press and release at the same point.
  assertEq('t1 clickSlip', h.clickSlipPx, 0);
  // The movement ends at (200, 135); cell 42's center is (195, 135). The
  // whole trajectory is one submovement, so its end is the last position.
  assertClose('t1 subEndDist', h.mainSubEndDistPx, 5, 1e-6);
  // Verification: the movement's last sample is the press instant itself,
  // inside cell 42 (x 180..210).
  assertEq('t1 verification', h.verificationTimeMs, 0);
}

// ---- Test 2: two pulses separated by a 300 ms stop ----
// Pulse 1: x 0->300 over 0..300 ms; stop at (300, 135) until 600 ms
// (samples at both ends of the gap); pulse 2: x 300->600 over 600..900 ms;
// click at (600, 135) at t=900.
{
  const t = [];
  const x = [];
  const y = [];
  for (let ms = 0; ms <= 300; ms += 10) { t.push(ms); x.push(ms); y.push(135); }
  t.push(600); x.push(300); y.push(135);
  for (let ms = 610; ms <= 900; ms += 10) { t.push(ms); x.push(ms - 300); y.push(135); }
  const events = [
    LAYOUT,
    { t: 900, kind: 'rdown', x: 600, y: 135, index: null },
  ];
  const h = computeHevelius(t, x, y, events);
  assertEq('t2 movementCount', h.movementCount, 1);
  // The 300 ms sample gap is one pause (>= 100 ms).
  assertEq('t2 pauses', h.pauseCount, 1);
  assertEq('t2 longestPause', h.longestPauseMs, 300);
  assertEq('t2 execution', h.executionTimeMs, 900);
  assertEq('t2 execNoPauses', h.executionTimeNoPausesMs, 600);
  // Two distinct speed pulses, each crossing 100 px/s and reaching
  // 500 px/s, separated by a full stop.
  assertEq('t2 submovements', h.submovementCount, 2);
  // No target cell (index null): target-dependent features are absent.
  assertUndefined('t2 subEndDist', h.mainSubEndDistPx);
  assertUndefined('t2 verification', h.verificationTimeMs);

  // The waste system on the same trace: the 300 ms stop also crosses the
  // whole-game 250 ms pause bar.
  const w = computeWasteMetrics(t, x, y, events);
  assertEq('t2 waste pauses', w.pauseCount, 1);
  assertEq('t2 waste paused', w.pausedMs, 300);
  assertEq('t2 waste longest', w.longestPauseMs, 300);
  // One click: no click-to-click travel exists, so wander is unmeasurable.
  assertUndefined('t2 wander', w.wanderRatio);
  // Monotone straight path: no turnarounds.
  assertEq('t2 turnarounds', w.dirChanges, 0);

  // The psychometric system agrees on the idle time (the 300 ms
  // position-constant step) and sees zero x-flips on the monotone path.
  const p = computePsychometrics(t, x, y, events);
  assertEq('t2 segments', p.segmentCount, 1);
  assertEq('t2 psych idle', p.idleTimeMs, 300);
  assertEq('t2 psych xFlips', p.xFlips, 0);
  assertClose('t2 psych velMax', p.velMaxPxPerMs, 1, 1e-9);
  assertClose('t2 psych MAD', p.mad, 0, 1e-9);
}

// ---- Test 3: out-and-back (a feint plus a turnaround) ----
// The cursor runs from (5, 135) to (95, 135) — into cell (3, 4) — dwells
// there from t=100 to t=500 (samples at both ends), returns to (5, 135)
// by t=600, dwells at (5,135) in cell (0,4) from 600 to 1000, then clicks
// there at t=1000. The first dwell ends clickless (a feint); the second
// ends in a click (not a feint). The reversal is one turnaround.
{
  const t = [];
  const x = [];
  const y = [];
  for (let ms = 0; ms <= 100; ms += 10) { t.push(ms); x.push(5 + ms * 0.9); y.push(135); }
  t.push(500); x.push(95); y.push(135);
  for (let ms = 510; ms <= 600; ms += 10) { t.push(ms); x.push(95 - (ms - 500) * 0.9); y.push(135); }
  t.push(1000); x.push(5); y.push(135);
  const events = [
    LAYOUT,
    { t: 1000, kind: 'lup', x: 5, y: 135, index: 36 },
  ];
  const w = computeWasteMetrics(t, x, y, events);
  assertEq('t3 feints', w.feintCount, 1);
  assertEq('t3 turnarounds', w.dirChanges, 1);
  // Out 90 px and back 90 px = 180 px of travel; a single click means
  // wander stays unmeasurable — the travel is still all counted.
  assertClose('t3 path (via bio)', computeTraceMetrics(t, x, y, events, 1000).totalPathPx,
    180, 1e-9);

  // The x-coordinate reverses once: exactly one x-flip in the segment.
  const p = computePsychometrics(t, x, y, events);
  assertEq('t3 psych xFlips', p.xFlips, 1);
}

// ---- Test 4: click slip and empty traces ----
{
  // Slip: press at (100, 100), release at (103, 104) -> slip 5.
  const t = [0, 10, 20, 30, 40];
  const x = [60, 70, 80, 90, 100];
  const y = [100, 100, 100, 100, 100];
  const events = [
    LAYOUT,
    { t: 50, kind: 'ldown', x: 100, y: 100, index: 30 },
    { t: 80, kind: 'lup', x: 103, y: 104, index: 30 },
  ];
  const h = computeHevelius(t, x, y, events);
  assertClose('t4 clickSlip', h.clickSlipPx, 5, 1e-9);

  // Empty and clickless traces measure nothing but do not crash.
  assertEq('t4 empty hev', computeHevelius([], [], [], []).movementCount, 0);
  assertEq('t4 empty psych', computePsychometrics([], [], [], []).segmentCount, 0);
  assertEq('t4 empty waste feints', computeWasteMetrics([], [], [], []).feintCount, 0);
  const clickless = computeHevelius([0, 10, 20], [0, 5, 10], [0, 0, 0], [LAYOUT]);
  assertEq('t4 clickless hev', clickless.movementCount, 0);
}

console.log(`PASS: ${checks} checks (hevelius-style + waste known answers)`);

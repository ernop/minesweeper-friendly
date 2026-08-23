'use strict';
// Known-answer tests for the click-cadence (press-to-press timing) metrics
// in minesweeper.js: constructed press sequences whose gap quartiles, peak
// window counts, and moving-press shares are known analytically.
//
// Usage: node tests/metrics-cadence-test.js

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

const press = (kind, t) => ({ t: t, kind: kind, x: 0, y: 0, index: 0 });

// ---- Test 1: mixed presses with known gap quartiles ----
// Presses (ldown and rdown mixed; the lup releases must not count) at
// t = 0, 100, 200, 1000, 5000. Gaps sorted: [100, 100, 800, 4000].
// median = 100 + 0.5*(800-100) = 450; q1 (at 0.75) = 100;
// q3 (at 2.25) = 800 + 0.25*(4000-800) = 1600; spread = 1500/450.
// Burst gaps (< 250ms): 2 of 4. Peak 1s window [0, 1000] holds 4 presses.
// Samples at 0, 50, 950, 990, 4800: presses at 0 (gap 0), 100 (gap 50),
// and 1000 (gap 10) are on the move; 200 (gap 150) and 5000 (gap 200)
// are not — share 3/5.
{
  const events = [
    press('ldown', 0), press('lup', 20),
    press('ldown', 100), press('lup', 120),
    press('rdown', 200),
    press('ldown', 1000), press('lup', 1020),
    press('ldown', 5000), press('lup', 5020),
  ];
  const c = computeClickCadence([0, 50, 950, 990, 4800], events);
  assertClose('t1 gapMedian', c.gapMedianMs, 450, 1e-9);
  assertClose('t1 gapSpread', c.gapSpreadRatio, 1500 / 450, 1e-9);
  assertEq('t1 fastestGap', c.fastestGapMs, 100);
  assertClose('t1 burstShare', c.burstGapShare, 0.5, 1e-9);
  assertClose('t1 peakRate', c.peakPressesPerSec, 4, 1e-9);
  assertClose('t1 movingShare', c.movingPressShare, 3 / 5, 1e-9);
}

// ---- Test 2: metronomic clicking ----
// Five presses every 300ms: every gap is 300, so the median is 300 and
// the spread is exactly 0. A 1s window holds at most 4 presses
// (0/300/600/900). No sample precedes any press within 100ms except the
// one at t=250 before the 300ms press — share 1/5.
{
  const events = [0, 300, 600, 900, 1200].map((t) => press('ldown', t));
  const c = computeClickCadence([250], events);
  assertClose('t2 gapMedian', c.gapMedianMs, 300, 1e-9);
  assertClose('t2 gapSpread', c.gapSpreadRatio, 0, 1e-9);
  assertEq('t2 fastestGap', c.fastestGapMs, 300);
  assertClose('t2 burstShare', c.burstGapShare, 0, 1e-9);
  assertClose('t2 peakRate', c.peakPressesPerSec, 4, 1e-9);
  assertClose('t2 movingShare', c.movingPressShare, 1 / 5, 1e-9);
}

// ---- Test 3: a single press ----
// No gaps exist, so every gap statistic is not measurable; the peak
// window holds the one press, and it sits 60ms after a sample.
{
  const c = computeClickCadence([0], [press('rdown', 60)]);
  assertUndefined('t3 gapMedian', c.gapMedianMs);
  assertUndefined('t3 gapSpread', c.gapSpreadRatio);
  assertUndefined('t3 fastestGap', c.fastestGapMs);
  assertUndefined('t3 burstShare', c.burstGapShare);
  assertClose('t3 peakRate', c.peakPressesPerSec, 1, 1e-9);
  assertClose('t3 movingShare', c.movingPressShare, 1, 1e-9);
}

// ---- Test 4: no presses at all ----
{
  const c = computeClickCadence([0, 10, 20], [
    { t: 0, kind: 'layout', left: 0, top: 0, width: 270, height: 270,
      boardWidth: 9, boardHeight: 9 },
  ]);
  assertUndefined('t4 gapMedian', c.gapMedianMs);
  assertUndefined('t4 peakRate', c.peakPressesPerSec);
  assertUndefined('t4 movingShare', c.movingPressShare);
}

// ---- Test 5: simultaneous left+right press (zero median) ----
// Three presses at t = 0, 0, 600: gaps [0, 600], median 300 — but with
// gaps [0, 0, 600] from presses at 0, 0, 0, 600 the median is 0 and the
// spread ratio is genuinely not measurable.
{
  const events = [press('ldown', 0), press('rdown', 0), press('ldown', 0),
    press('rdown', 600)];
  const c = computeClickCadence([], events);
  assertClose('t5 gapMedian', c.gapMedianMs, 0, 1e-9);
  assertUndefined('t5 gapSpread', c.gapSpreadRatio);
  assertEq('t5 fastestGap', c.fastestGapMs, 0);
  assertClose('t5 movingShare', c.movingPressShare, 0, 1e-9);
}

console.log(`PASS: ${checks} checks (click-cadence known answers)`);

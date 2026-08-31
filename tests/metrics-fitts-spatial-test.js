'use strict';
// Known-answer tests for the Fitts aimed-movement metrics and the
// spatial pace-bias computation in minesweeper.js: constructed traces
// whose difficulty indices, movement times, fits, and residuals are
// known analytically.
//
// Usage: node tests/metrics-fitts-spatial-test.js

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

const LAYOUT = {
  t: 0, kind: 'layout', left: 0, top: 0, width: 90, height: 90,
  boardWidth: 9, boardHeight: 9,
};

// ---- Fitts pairs ----
// Cells are 10px. Presses at (0,0) t=0, (30,40) t=500 (D=50, first sample
// after t=0 is t=100, MT=400, ID=log2(6)), (30,45) t=900 (D=5, under the
// 8px floor, skipped), (110,40) t=2000 (D=sqrt(80^2+5^2), first sample
// after t=900 is t=1200, MT=800).
{
  const events = [
    LAYOUT,
    { t: 0, kind: 'ldown', x: 0, y: 0, index: 0 },
    { t: 500, kind: 'ldown', x: 30, y: 40, index: 30 },
    { t: 900, kind: 'rdown', x: 30, y: 45, index: 30 },
    { t: 2000, kind: 'ldown', x: 110, y: 40, index: 38 },
  ];
  const sampleT = [100, 700, 1200];
  const sampleX = [30, 30, 60];
  const sampleY = [40, 50, 40];
  const f = computeFittsMetrics(sampleT, sampleX, sampleY, events);
  assertEq('fitts: two aimed movements', f.movementCount, 2);
  const id1 = Math.log2(50 / 10 + 1);
  const d2 = Math.hypot(80, 5);
  const id2 = Math.log2(d2 / 10 + 1);
  assertClose('fitts: first ID', f.pairs[0].id, id1, 1e-9);
  assertClose('fitts: first MT', f.pairs[0].mtMs, 400, 1e-9);
  assertClose('fitts: second ID', f.pairs[1].id, id2, 1e-9);
  assertClose('fitts: second MT', f.pairs[1].mtMs, 800, 1e-9);
  assertClose('fitts: mean-of-ratios throughput',
    f.throughputBitsPerSec, (id1 / 0.4 + id2 / 0.8) / 2, 1e-9);
}

// A press with no cursor sample between it and the previous press is a
// stationary re-press, not an aimed movement.
{
  const events = [
    LAYOUT,
    { t: 0, kind: 'ldown', x: 0, y: 0, index: 0 },
    { t: 500, kind: 'ldown', x: 50, y: 0, index: 5 },
  ];
  const f = computeFittsMetrics([], [], [], events);
  assertEq('fitts: no samples means no movements', f.movementCount, 0);
}

// ---- Spatial bias ----
// Twelve action pairs walking rightward along y=0 with distances 10..120.
// The first nine pairs land on cell 0 (board region row 1, column 1) with
// gaps exactly 100 + 2*distance; the last three land on cell 80 (region
// row 3, column 3) with 500ms added. The exact-line majority pins the
// Theil-Sen fit at a=100, b=2, so the on-line region's residual median is
// 0 and the biased region's is +500.
{
  const events = [LAYOUT];
  let x = 0;
  let t = 0;
  events.push({ t: 0, kind: 'lup', x: 0, y: 0, index: 0 });
  for (let i = 0; i < 12; i++) {
    const d = (i + 1) * 10;
    const extra = i >= 9 ? 500 : 0;
    x += d;
    t += 100 + 2 * d + extra;
    events.push({ t: t, kind: 'lup', x: x, y: 0, index: i >= 9 ? 80 : 0 });
  }
  const s = computeSpatialBias(events);
  assertEq('spatial: twelve pairs', s.pairCount, 12);
  assertClose('spatial: fitted intercept', s.aMs, 100, 1e-9);
  assertClose('spatial: fitted slope', s.bMsPerPx, 2, 1e-9);
  assertEq('spatial: nine regions', s.regions.length, 9);
  assertEq('spatial: on-line region count', s.regions[0].count, 9);
  assertClose('spatial: on-line region residual', s.regions[0].medianResidualMs, 0, 1e-9);
  assertEq('spatial: biased region count', s.regions[8].count, 3);
  assertClose('spatial: biased region residual', s.regions[8].medianResidualMs, 500, 1e-9);
  assertEq('spatial: untouched regions have no clicks', s.regions[4].count, 0);
  assertEq('spatial: untouched regions measure nothing',
    s.regions[4].medianResidualMs, undefined);
}

// Under eight pairs the fit is refused: only the pair count is reported.
{
  const events = [LAYOUT];
  for (let i = 0; i <= 4; i++) {
    events.push({ t: i * 300, kind: 'lup', x: i * 25, y: 0, index: 0 });
  }
  const s = computeSpatialBias(events);
  assertEq('spatial: four pairs is too few', s.pairCount, 4);
  assertEq('spatial: no regions under the minimum', s.regions, undefined);
}

console.log('metrics fitts/spatial tests passed (' + checks + ' checks)');

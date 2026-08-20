'use strict';
// Parity check: the in-page computeTraceMetrics (minesweeper.js) against the
// offline extractor's output (analysis/biometrics/extract_features.py) on the
// checked-in synthetic trace. The JS computation section is pure, so it is
// extracted by its section markers and run standalone.
//
// Usage: node tests/metrics-biometrics-parity.js

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const repo = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'minesweeper.js'), 'utf8');

const startMarker = '//-------TRACE METRICS: COMPUTATION';
const endMarker = '//-------TRACE METRICS: DISPLAY';
const startIdx = source.indexOf(startMarker);
const endIdx = source.indexOf(endMarker);
if (startIdx === -1 || endIdx === -1) throw new Error('section markers not found');
vm.runInThisContext(source.slice(startIdx, endIdx));

const games = JSON.parse(fs.readFileSync(
  path.join(repo, 'analysis/biometrics/synthetic-trace.json'), 'utf8'));
const expected = JSON.parse(fs.readFileSync(
  path.join(repo, 'analysis/biometrics/synthetic-features.json'), 'utf8'));
if (games.length !== expected.length) throw new Error('fixture length mismatch');

let checks = 0;
function close(name, actual, want) {
  checks++;
  if (actual === undefined && want === undefined) return;
  const tol = 1e-9 * Math.max(1, Math.abs(want));
  if (actual === undefined || Math.abs(actual - want) > tol) {
    throw new Error(`${name}: js=${actual} python=${want}`);
  }
}

for (let g = 0; g < games.length; g++) {
  const game = games[g];
  const want = expected[g];
  const m = computeTraceMetrics(game.sampleT, game.sampleX, game.sampleY,
    game.events, game.endedAt - game.startedAt);

  close(`game${g}.strokeCount`, m.strokeCount, want.session.strokeCount);
  close(`game${g}.sampleCount`, m.sampleCount, want.session.sampleCount);
  close(`game${g}.movementMs`, m.movementMs, want.session.movementMs);
  close(`game${g}.silenceRatio`, m.silenceRatio, want.session.silenceRatio);
  close(`game${g}.totalPathPx`, m.totalPathPx, want.session.totalPathPx);

  close(`game${g}.leftClickCount`, m.leftClickCount, want.clicks.leftClickCount);
  close(`game${g}.rightClickCount`, m.rightClickCount, want.clicks.rightClickCount);
  close(`game${g}.clickDurationMeanMs`, m.clickDurationMeanMs,
    want.clicks.clickDurationMs === undefined ? undefined : want.clicks.clickDurationMs.mean);
  close(`game${g}.pauseAndClickMeanMs`, m.pauseAndClickMeanMs,
    want.clicks.pauseAndClickMs === undefined ? undefined : want.clicks.pauseAndClickMs.mean);

  const agg = want.strokeAggregates;
  const aggMean = (key) => (agg[key] === undefined ? undefined : agg[key].mean);
  close(`game${g}.speedMeanPxPerMs`, m.speedMeanPxPerMs, aggMean('speedPxPerMs'));
  close(`game${g}.straightness`, m.straightness, aggMean('straightness'));
  close(`game${g}.jerkMeanPxPerMs3`, m.jerkMeanPxPerMs3, aggMean('jerkPxPerMs3'));
  close(`game${g}.angularVelocityMeanRadPerMs`, m.angularVelocityMeanRadPerMs,
    aggMean('angularVelocityRadPerMs'));

  // Peak speed is not a Python aggregate; recompute it from the Python
  // per-stroke list: max over strokes of the per-stroke max.
  let peak;
  for (const s of want.strokes) {
    if (s.speedPxPerMs !== undefined && (peak === undefined || s.speedPxPerMs.max > peak)) {
      peak = s.speedPxPerMs.max;
    }
  }
  close(`game${g}.speedMaxPxPerMs`, m.speedMaxPxPerMs, peak);

  // Live-call shape check: the same function over a truncated prefix (the
  // live schedule's input) must run and stay self-consistent.
  const half = Math.floor(game.sampleT.length / 2);
  const live = computeTraceMetrics(
    game.sampleT.slice(0, half), game.sampleX.slice(0, half),
    game.sampleY.slice(0, half),
    game.events.filter((e) => e.t <= game.sampleT[half - 1]),
    game.sampleT[half - 1]);
  if (!(live.strokeCount <= m.strokeCount)) throw new Error(`game${g}: live strokes exceed final`);
  if (!(live.totalPathPx <= m.totalPathPx + 1e-9)) throw new Error(`game${g}: live path exceeds final`);
  checks += 2;
}
console.log(`PASS: ${checks} checks across ${games.length} game(s)`);

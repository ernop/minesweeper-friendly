'use strict';
// Parity check: the in-page psychometric system (computePsychometrics in
// minesweeper.js, a port of the mousetrap R package's measures) against the
// actual R package, run via analysis/mousetrap/trace_measures.R on the
// checked-in synthetic trace. Both sides compute per-game means of the same
// key measures; they must agree to floating-point noise.
//
// Requires the R environment at ~/analysis-envs/r-mousetrap (see agents.md);
// fails loudly if it is missing rather than skipping.
//
// Usage: node tests/metrics-mousetrap-parity.js

const fs = require('fs');
const os = require('os');
const vm = require('vm');
const path = require('path');
const { execFileSync } = require('child_process');

const repo = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'minesweeper.js'), 'utf8');

const startMarker = '//-------TRACE METRICS: COMPUTATION';
const endMarker = '//-------TRACE METRICS: DISPLAY';
const startIdx = source.indexOf(startMarker);
const endIdx = source.indexOf(endMarker);
if (startIdx === -1 || endIdx === -1) throw new Error('section markers not found');
vm.runInThisContext(source.slice(startIdx, endIdx));

const rscript = path.join(os.homedir(), 'analysis-envs/r-mousetrap/bin/Rscript');
if (!fs.existsSync(rscript)) {
  throw new Error(`R environment missing: ${rscript} (see agents.md for setup)`);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-parity-'));

// Two inputs: the checked-in synthetic trace (stable) and a freshly
// generated randomized one (curved multi-segment movements with jitter —
// a new parity case on every run).
const freshPath = path.join(tmp, 'fresh-trace.json');
execFileSync(process.execPath,
  [path.join(repo, 'analysis/mousetrap/make_synthetic_trace.js'), freshPath],
  { stdio: ['ignore', 'ignore', 'inherit'] });
const traceFiles = [
  path.join(repo, 'analysis/biometrics/synthetic-trace.json'),
  freshPath,
];

// Run the R pipeline over a traces file and return the per-game means
// (quoted game ids, numeric columns, NA/NaN for unmeasurable values).
function runR(tracePath, outPrefix) {
  execFileSync(rscript,
    [path.join(repo, 'analysis/mousetrap/trace_measures.R'), tracePath, outPrefix],
    { stdio: ['ignore', 'ignore', 'inherit'] });
  const csv = fs.readFileSync(outPrefix + '_games.csv', 'utf8').trim().split('\n');
  const header = csv[0].split(',').map((h) => h.replace(/"/g, ''));
  const rGames = new Map();
  for (const line of csv.slice(1)) {
    const cells = line.split(',').map((c) => c.replace(/"/g, ''));
    const row = {};
    for (let i = 1; i < header.length; i++) {
      row[header[i]] = cells[i] === 'NA' || cells[i] === 'NaN' ? NaN : Number(cells[i]);
    }
    rGames.set(cells[0], row);
  }
  return rGames;
}

// R column name -> field of computePsychometrics' per-game object.
const FIELD_MAP = [
  ['MAD', 'mad'],
  ['AUC', 'auc'],
  ['AD', 'ad'],
  ['xpos_flips', 'xFlips'],
  ['ypos_flips', 'yFlips'],
  ['initiation_time', 'initiationTimeMs'],
  ['idle_time', 'idleTimeMs'],
  ['vel_max', 'velMaxPxPerMs'],
  ['acc_max', 'accMaxPxPerMs2'],
  ['sample_entropy', 'sampleEntropy'],
  ['RT', 'rtMs'],
];

let checks = 0;
let comparedGames = 0;
for (const traceFile of traceFiles) {
  const games = JSON.parse(fs.readFileSync(traceFile, 'utf8'));
  const rGames = runR(traceFile, path.join(tmp, path.basename(traceFile, '.json')));
  for (const game of games) {
    const want = rGames.get(String(game.endedAt));
    const m = computePsychometrics(game.sampleT, game.sampleX, game.sampleY, game.events);
    if (want === undefined) {
      // The R script only emits games with measurable segments; the JS side
      // must agree that there were none.
      if (m.segmentCount !== 0) {
        throw new Error(`game ${game.endedAt}: JS found ${m.segmentCount} segments, R found none`);
      }
      continue;
    }
    comparedGames++;
    for (const [rName, jsName] of FIELD_MAP) {
      if (!(rName in want)) continue; // column not emitted by this R version
      checks++;
      const rVal = want[rName];
      const jsVal = m[jsName];
      if (Number.isNaN(rVal) && Number.isNaN(jsVal)) continue;
      const tol = 1e-8 * Math.max(1, Math.abs(rVal));
      if (jsVal === undefined || Math.abs(jsVal - rVal) > tol) {
        throw new Error(`game ${game.endedAt} ${rName} (${path.basename(traceFile)}): js=${jsVal} R=${rVal}`);
      }
    }
  }
}
if (comparedGames === 0) throw new Error('nothing compared: no game matched the R output');
console.log(`PASS: ${checks} checks across ${comparedGames} game(s) against mousetrap (R)`);

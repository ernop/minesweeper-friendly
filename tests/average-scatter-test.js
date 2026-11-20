'use strict';
// Known-answer tests for average-time chart metrics, bucketing, and legacy
// record eligibility.

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const repo = path.join(__dirname, '..');
const source = require('./game-source.js').source;
function section(from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  if (start === -1 || end === -1) throw new Error(`section not found: ${from}`);
  return source.slice(start, end);
}

const tested = vm.runInThisContext(`(() => {
  ${fs.readFileSync(path.join(repo, 'game-data.js'), 'utf8')}
  const config = { width: 9, height: 9, mines: 10 };
  ${section('function boardFractionOf', 'function boardShareHelp')}
  ${section('// Property charts group games', "// A chart's eligible wins.")}
  ${section("// A chart's eligible wins.", '// Bucket all finished games')}
  ${section('// Bucket all finished games', "// The property charts' three vertical readings")}
  return { GameData, PERF_CHART_SPECS, BOARD_CHART_SPECS, msPerBv3Of, averageEligibleWins, averagePoints, winratePoints };
})()`);

let checks = 0;
function assertEq(name, actual, want) {
  checks++;
  if (actual !== want) throw new Error(`${name}: got ${actual}, want ${want}`);
}

assertEq(
  'your-perf chart order',
  tested.PERF_CHART_SPECS.map((spec) => spec.label).join(','),
  'IOE,HZiNi efficiency,board-changing click share,click rate,fastclick gap,mouse speed,cadence spread,misclicks,unused flag share,unflagged mine share');
assertEq(
  'board-trait chart order',
  tested.BOARD_CHART_SPECS.map((spec) => spec.label).join(','),
  '3BV,ZiNi,HZiNi,3BV spread,max number,islands,largest island,zeros,0–1 share,zero-opening coverage');

const byLabel = (label) =>
  [...tested.PERF_CHART_SPECS, ...tested.BOARD_CHART_SPECS].find((spec) => spec.label === label);
const base = {
  endedAt: 1000,
  outcome: 'win',
  timeMs: 25000,
  bv3: 25,
  boardChangingClicks: 30,
  noOpClicks: 3,
  misclicks: 2,
  hzini: 27,
  mousePathPx: 3120,
  zeroCount: 40,
  islandCount: 7,
  maxAdjacent: 5,
};

assertEq('zeros use their exact count', byLabel('zeros').value(base), 40);
assertEq('islands use their exact count', byLabel('islands').value(base), 7);
assertEq('max number uses maxAdjacent', byLabel('max number').value(base), 5);
assertEq('misclicks use their exact count', byLabel('misclicks').value(base), 2);
assertEq('misclicks keep losses for winrate', byLabel('misclicks').winBound, undefined);
assertEq('IOE is win-only', byLabel('IOE').winBound, true);
assertEq('HZiNi efficiency plots in percent', byLabel('HZiNi efficiency').xTickUnit, '%');
assertEq('HZiNi efficiency groups in 1-point steps', byLabel('HZiNi efficiency').value(base), 90);
assertEq('board-changing click share plots in percent', byLabel('board-changing click share').xTickUnit, '%');
assertEq('board-changing click share groups in 1-point steps', byLabel('board-changing click share').value(base), 91);
// A loss's recorded 3BV is the whole board's, not what it solved (creator
// 2026-10-07, "one name one thing"), so the 3BV measurements sit winrate
// out; a chart of a catalog measurement is win-only exactly where game
// data compares it on wins only, under its catalog name.
assertEq('HZiNi efficiency is win-only', byLabel('HZiNi efficiency').winBound, true);
assertEq('click rate keeps losses for winrate', byLabel('click rate').winBound, undefined);
for (const spec of tested.PERF_CHART_SPECS.filter((item) => item.measurementId !== undefined)) {
  const metric = tested.GameData.metrics.find((item) => item.id === spec.measurementId);
  assertEq(spec.label + ' is win-only exactly where game data is', spec.winBound === true, !metric.allOutcomes);
  assertEq(spec.measurementId + ' takes the catalog name', spec.label, metric.name);
}
// The flag shares are win-only and plot in percent: unused flag share in
// 5-point groups, unflagged mine share at its exact values, one per count
// of unflagged mines.
assertEq('unused flag share is win-only', byLabel('unused flag share').winBound, true);
assertEq('unused flag share ticks in percent', byLabel('unused flag share').xTickUnit, '%');
assertEq('unused flag share groups in 5 points',
  byLabel('unused flag share').value({ ...base, flagsPlaced: 8, unusedCorrectFlags: 1 }), 15);
const unflagged = byLabel('unflagged mine share');
assertEq('unflagged mine share is win-only', unflagged.winBound, true);
assertEq('unflagged mine share ticks in percent', unflagged.xTickUnit, '%');
assertEq('unflagged mine share links its game data row', unflagged.measurementId, 'unflaggedMineShare');
assertEq('unflagged mine share plots the exact percent',
  unflagged.value({ ...base, flagsPlaced: 9, flagsRemoved: 2 }), 30);
assertEq('a markless win plots 100%', unflagged.value({ ...base, flagsPlaced: 0 }), 100);
assertEq('unflagged mine share needs the flag counters',
  tested.averageEligibleWins(unflagged, [{ ...base, flagsPlaced: 4 }]).length, 0);

assertEq('legacy shape records are ineligible',
  tested.averageEligibleWins(byLabel('zeros'), [{ ...base, zeroCount: undefined }]).length,
  0);
assertEq('ms / 3BV divides timeMs by solved 3BV', tested.msPerBv3Of(base), 1000);
assertEq('ms / 3BV subtracts a trial given opening',
  tested.msPerBv3Of({ ...base, identityIndex: 0, givenOpening: true, givenOpeningBv3: 5 }), 1250);
assertEq('ms / 3BV excludes zero solved 3BV',
  tested.averageEligibleWins(byLabel('click rate'), [{ ...base, bv3: 0 }], tested.msPerBv3Of).length,
  0);
assertEq('ms / 3BV excludes unmeasured trial openings',
  tested.averageEligibleWins(byLabel('click rate'), [{ ...base, identityIndex: 0, givenOpening: true }], tested.msPerBv3Of).length,
  0);

const zeroPoints = tested.averagePoints(byLabel('zeros'), [
  base,
  { ...base, endedAt: 2000, timeMs: 35000 },
  { ...base, endedAt: 3000, timeMs: 90000, zeroCount: 41 },
  { ...base, endedAt: 4000, zeroCount: undefined },
]).sort((a, b) => a.x - b.x);
assertEq('same-value wins form one bucket', zeroPoints.length, 2);
assertEq('bucket time is the arithmetic mean', zeroPoints[0].averageY, 30);
assertEq('bucket age follows its newest win', zeroPoints[0].endedAt, 2000);
assertEq('a distinct value forms another bucket', zeroPoints[1].x, 41);

const pacePoints = tested.averagePoints(byLabel('misclicks'), [
  { ...base, bv3: 20, timeMs: 10000, misclicks: 0 },
  { ...base, endedAt: 2000, bv3: 50, timeMs: 35000, misclicks: 0 },
  { ...base, endedAt: 3000, bv3: 25, timeMs: 25000, misclicks: 1 },
], tested.msPerBv3Of).sort((a, b) => a.x - b.x);
assertEq('your-perf buckets average ms / 3BV across board sizes', pacePoints[0].averageY, 600);
assertEq('misclick bucket 1 reads exact ms / 3BV', pacePoints[1].averageY, 1000);

// Winrate mode buckets wins AND losses by the same property value.
const winratePoints = tested.winratePoints(byLabel('zeros'), [
  base,
  { ...base, endedAt: 2000, outcome: 'loss' },
  { ...base, endedAt: 3000, zeroCount: 41 },
  { ...base, endedAt: 4000, zeroCount: undefined },
]).sort((a, b) => a.x - b.x);
assertEq('winrate buckets by value', winratePoints.length, 2);
assertEq('losses join their bucket and lower it',
  winratePoints[0].winratePct, 50);
assertEq('winrate bucket age follows its newest game',
  winratePoints[0].endedAt, 2000);
assertEq('an all-win bucket reads 100', winratePoints[1].winratePct, 100);
assertEq('IOE sits winrate mode out', byLabel('IOE').winBound, true);

console.log(`average-scatter: all ${checks} checks passed`);

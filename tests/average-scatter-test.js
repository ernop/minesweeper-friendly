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
  return { GameData, PERF_CHART_SPECS, BOARD_CHART_SPECS, averageEligibleWins, averagePoints, winratePoints };
})()`);

let checks = 0;
function assertEq(name, actual, want) {
  checks++;
  if (actual !== want) throw new Error(`${name}: got ${actual}, want ${want}`);
}

assertEq(
  'your-perf chart order',
  tested.PERF_CHART_SPECS.map((spec) => spec.label).join(','),
  'clicks,path,clicks over 3BV,misclick rate,fastclick gap,3BV/s,click rate,no-op rate,efficiency,path / 3BV,path / click,board-changing click share,IOE,ZiNi efficiency,HZiNi efficiency,IOS,STNB,mouse speed,cadence spread,unused flag share,unflagged mine share');
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
  mousePathPx: 3120,
  zeroCount: 40,
  islandCount: 7,
  maxAdjacent: 5,
};

assertEq('zeros use their exact count', byLabel('zeros').value(base), 40);
assertEq('islands use their exact count', byLabel('islands').value(base), 7);
assertEq('max number uses maxAdjacent', byLabel('max number').value(base), 5);
assertEq('click overhead is clicks minus 3BV',
  byLabel('clicks over 3BV').value(base), 5);
assertEq('IOS buckets to hundredths', byLabel('IOS').value(base), 1);
assertEq('path / click buckets to 10px',
  byLabel('path / click').value(base), 100);
assertEq('path / 3BV buckets to 10px',
  byLabel('path / 3BV').value(base), 120);
assertEq('efficiency is win-only', byLabel('efficiency').winBound, true);
// A loss's recorded 3BV is the whole board's, not what it solved (creator
// 2026-10-07, "one name one thing"), so the 3BV measurements sit winrate
// out; a chart of a catalog measurement is win-only exactly where game
// data compares it on wins only, under its catalog name.
assertEq('3BV/s is win-only', byLabel('3BV/s').winBound, true);
assertEq('path / 3BV is win-only', byLabel('path / 3BV').winBound, true);
assertEq('clicks over 3BV is win-only', byLabel('clicks over 3BV').winBound, true);
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
assertEq('IOS excludes games at or below one second',
  tested.averageEligibleWins(byLabel('IOS'), [{ ...base, timeMs: 1000 }]).length,
  0);
assertEq('path / click excludes a zero denominator',
  tested.averageEligibleWins(byLabel('path / click'), [{ ...base, boardChangingClicks: 0 }]).length,
  0);
assertEq('path / 3BV excludes a zero denominator',
  tested.averageEligibleWins(byLabel('path / 3BV'), [{ ...base, bv3: 0 }]).length,
  0);

const zeroPoints = tested.averagePoints(byLabel('zeros'), [
  base,
  { ...base, endedAt: 2000, timeMs: 35000 },
  { ...base, endedAt: 3000, timeMs: 90000, zeroCount: 41 },
  { ...base, endedAt: 4000, zeroCount: undefined },
]).sort((a, b) => a.x - b.x);
assertEq('same-value wins form one bucket', zeroPoints.length, 2);
assertEq('bucket time is the arithmetic mean', zeroPoints[0].averageSeconds, 30);
assertEq('bucket age follows its newest win', zeroPoints[0].endedAt, 2000);
assertEq('a distinct value forms another bucket', zeroPoints[1].x, 41);

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
assertEq('IOS sits winrate mode out', byLabel('IOS').winBound, true);

console.log(`average-scatter: all ${checks} checks passed`);

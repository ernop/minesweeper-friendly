'use strict';
// Known-answer tests for average-time chart metrics, bucketing, and legacy
// record eligibility.

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const repo = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'minesweeper.js'), 'utf8');
function section(from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  if (start === -1 || end === -1) throw new Error(`section not found: ${from}`);
  return source.slice(start, end);
}

const tested = vm.runInThisContext(`(() => {
  ${section('function secondsOf(', 'function formatGuesses(')}
  ${section('// Average-time charts group wins', '// Every list renders')}
  ${section("// A chart's eligible wins.", '// Bucket all finished games')}
  ${section('// Bucket all finished games', "// The property charts' three vertical readings")}
  return { AVERAGE_SCATTER_SPECS, averageEligibleWins, averagePoints, winratePoints };
})()`);

let checks = 0;
function assertEq(name, actual, want) {
  checks++;
  if (actual !== want) throw new Error(`${name}: got ${actual}, want ${want}`);
}

assertEq(
  'chart order',
  tested.AVERAGE_SCATTER_SPECS.map((spec) => spec.label).join(','),
  'clicks,3BV,mouse path,zeros,islands,max number,clicks over 3BV,IOS,path per click,path per 3BV');

const byLabel = (label) =>
  tested.AVERAGE_SCATTER_SPECS.find((spec) => spec.label === label);
const base = {
  endedAt: 1000,
  outcome: 'win',
  timeMs: 25000,
  bv3: 25,
  clicks: 30,
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
assertEq('path per click buckets to 10px',
  byLabel('path per click').value(base), 100);
assertEq('path per 3BV buckets to 10px',
  byLabel('path per 3BV').value(base), 120);

assertEq('legacy shape records are ineligible',
  tested.averageEligibleWins(byLabel('zeros'), [{ ...base, zeroCount: undefined }]).length,
  0);
assertEq('IOS excludes games at or below one second',
  tested.averageEligibleWins(byLabel('IOS'), [{ ...base, timeMs: 1000 }]).length,
  0);
assertEq('path per click excludes a zero denominator',
  tested.averageEligibleWins(byLabel('path per click'), [{ ...base, clicks: 0 }]).length,
  0);
assertEq('path per 3BV excludes a zero denominator',
  tested.averageEligibleWins(byLabel('path per 3BV'), [{ ...base, bv3: 0 }]).length,
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

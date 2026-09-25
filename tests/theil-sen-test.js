'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../trend-fit.js'), 'utf8');
const fit = vm.runInThisContext('(() => {' + source + ';return fitTheilSen;})()');

function reference(pairs) {
  const median = (values) => {
    values.sort((a, b) => a - b);
    const middle = Math.floor(values.length / 2);
    return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  };
  const slopes = [];
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const dx = pairs[j][0] - pairs[i][0];
      if (dx !== 0) slopes.push((pairs[j][1] - pairs[i][1]) / dx);
    }
  }
  if (!slopes.length) return null;
  const b = median(slopes);
  return { a: median(pairs.map(([x, y]) => y - b * x)), b };
}
let seed = 235;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
let cases = 0;
function check(pairs, exact = true) {
  const expected = reference(pairs);
  const actual = fit(pairs, random);
  cases++;
  if (expected === null) return assert.equal(actual, null);
  if (exact) {
    assert(actual.a === expected.a && actual.b === expected.b,
      JSON.stringify({ actual, expected, pairs }));
  } else {
    // The old implementation rounds each subtraction before ordering its
    // slopes. Exact intersection ordering can differ by floating-point ulps.
    const tolerance = 1e-12 * Math.max(1, Math.abs(expected.b));
    assert(Math.abs(actual.b - expected.b) <= tolerance);
    const maxX = Math.max(...pairs.map(([x]) => Math.abs(x)));
    assert(Math.abs(actual.a - expected.a) <= tolerance * Math.max(1, maxX));
  }
}
for (const pairs of [[], [[1, 2]], [[1, 2], [1, 3]], [[1, 2], [2, 4]],
  [[0, 0], [1, 1], [2, 5]], [[0, 0], [1, 1], [2, 5], [2, 5]],
  Array.from({ length: 400 }, (_, i) => [i % 20, 3 * (i % 20) - 5])]) check(pairs);
for (let trial = 0; trial < 2500; trial++) {
  const n = 2 + Math.floor(random() * 90);
  check(Array.from({ length: n }, () => [Math.floor(random() * 20), Math.floor(random() * 40)]));
  check(Array.from({ length: n }, () => [1.7e12 + random() * 1e9, random() * 100]));
}
for (let trial = 0; trial < 500; trial++) {
  const slope = (random() - .5) * 100;
  const offset = trial % 2 ? 1.7e12 : 0;
  check(Array.from({ length: 120 }, (_, i) => {
    const x = offset + i * .1;
    return [x, slope * x + 12 + (trial % 5 ? 0 : (random() - .5) * 1e-4)];
  }), false);
}
// Collinear subnormal coordinates exercise the exact predicate when all
// floating-point products underflow; identical points remain distinct votes.
check(Array.from({ length: 50 }, (_, i) => [i * 1e-310, i * 1e-310]));
console.log(`Theil–Sen: ${cases} exhaustive-fit comparisons, ties, duplicate x, collinearity, and subnormal coordinates passed`);

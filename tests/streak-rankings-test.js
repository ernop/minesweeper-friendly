'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const source = require('./game-source.js').source;
const start = source.indexOf('//-------STREAK RANKINGS: COMPUTATION-------');
const end = source.indexOf('//-------STREAK RANKINGS: COMPUTATION END-------');
const { streakRuns, rankedStreaks } = vm.runInThisContext('(() => {'
  + source.slice(start, end) + '; return { streakRuns, rankedStreaks }; })()');

// Independent exhaustive definition: all nonempty run intervals with at
// most slack intervening losses, then remove strictly contained intervals.
function exhaustive(records, slack) {
  const runs = [[]];
  for (const record of records) {
    if (record.outcome === 'win') runs.at(-1).push(record.endedAt);
    else runs.push([]);
  }
  const candidates = [];
  for (let a = 0; a < runs.length; a++) {
    for (let b = a; b < runs.length && b - a <= slack; b++) {
      if (runs[a].length && runs[b].length) candidates.push({ a, b });
    }
  }
  return candidates.filter((c) => !candidates.some((o) =>
    o !== c && o.a <= c.a && o.b >= c.b)).map(({ a, b }) => ({
    len: runs.slice(a, b + 1).flat().length,
    end: runs[b].at(-1), current: b === runs.length - 1,
  })).sort((a, b) => b.len - a.len || b.end - a.end);
}
let cases = 0;
for (let length = 0; length <= 13; length++) {
  for (let bits = 0; bits < 2 ** length; bits++) {
    const records = Array.from({ length }, (_, i) => ({
      endedAt: i + 1, outcome: bits & (1 << i) ? 'win' : 'loss',
    }));
    for (const slack of [0, 1, 2]) {
      assert.deepEqual(rankedStreaks(streakRuns(records), slack), exhaustive(records, slack));
      cases++;
    }
  }
}
const alternating = Array.from({ length: 100000 }, (_, i) => ({
  endedAt: i, outcome: i % 2 ? 'loss' : 'win',
}));
assert.equal(rankedStreaks(streakRuns(alternating), 0).length, 50000);
assert.equal(rankedStreaks(streakRuns(alternating), 2).length, 49998);
console.log(`streak rankings: ${cases} exhaustive sequences and 100,000-game history passed`);

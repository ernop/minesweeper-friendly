'use strict';
const assert = require('node:assert/strict');
const Metrics = require('../board-metrics.js');
const Reference = require('../reference/board-metric-calculators.js');
const Zini = require('../zini.js');
const Structure = require('../reference/board-structure-metrics.js');

// Independently execute the documented action protocol. Recompute all gains
// from visible cells and flags each step; do not use ZiNi's premiums, opening
// IDs, scan helper, or incremental bookkeeping.
function simulate(width, height, mines) {
  const neighbors = mines.map((_, i) => {
    const out = [], x = i % width, y = Math.floor(i / width);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((dx || dy) && x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height) out.push((y + dy) * width + x + dx);
    }
    return out;
  });
  const clues = neighbors.map((ns) => ns.filter((i) => mines[i]).length);
  const order = Array.from({length: mines.length}, (_, i) => Math.floor(i / height) + (i % height) * width);
  const revealed = new Set(), flags = new Set();
  const actions = { openings: 0, direct: 0, flags: 0, chords: 0 };
  const reveal = (start) => {
    const queue = [start];
    while (queue.length) {
      const i = queue.pop();
      if (revealed.has(i)) continue;
      if (mines[i]) throw new Error('mine revealed');
      revealed.add(i);
      if (!clues[i]) queue.push(...neighbors[i]);
    }
  };
  for (const i of order) if (!mines[i] && !clues[i] && !revealed.has(i)) {
    actions.openings++; reveal(i);
  }
  while (revealed.size < mines.filter((m) => !m).length) {
    let best = -1, gain = -1;
    for (const i of order) if (revealed.has(i) && clues[i]) {
      const g = neighbors[i].filter((j) => !mines[j] && !revealed.has(j)).length
        - neighbors[i].filter((j) => mines[j] && !flags.has(j)).length - 1;
      if (g > gain) { best = i; gain = g; }
    }
    if (best < 0) { actions.direct++; reveal(order.find((i) => !mines[i] && !revealed.has(i))); }
    else {
      for (const j of neighbors[best]) if (mines[j] && !flags.has(j)) { flags.add(j); actions.flags++; }
      actions.chords++;
      for (const j of neighbors[best]) if (!mines[j] && !revealed.has(j)) reveal(j);
    }
  }
  return {actions, total: Object.values(actions).reduce((a,b) => a+b,0)};
}

for (let mask = 0; mask < 511; mask++) {
  const mines = Array.from({ length: 9 }, (_, i) => Boolean(mask & 1 << i));
  const result = Metrics.analyze(3, 3, mines);
  assert.equal(result.hzini, simulate(3, 3, mines).total);
  assert.equal(result.hzini, Zini.hzini(3, 3, mines));
  assert(Metrics.valid(result.boardMetrics));
  assert(!('hzini' in result.boardMetrics), 'one primary copy of the benchmark');
  assert(!('chord' in result.boardMetrics) && !('logic' in result.boardMetrics));
  const reference = Reference.boardOf([0, 1, 2].map((y) =>
    mines.slice(3 * y, 3 * y + 3).map((m) => m ? '*' : '.').join('')));
  const expected = Reference.workGeometry(reference).spreadCells;
  const structure = Structure.describe(reference);
  assert.equal(result.boardMetrics.safeCells, structure.safeCells);
  assert.equal(result.boardMetrics.zeroOpenedZeroOneCells, structure.zeroOpenedZeroOneCells);
  assert.equal(result.boardMetrics.zeroOpenedCells, structure.zeroOpenedCells);
  const visibleLow = reference.safes.filter((i) => reference.clues[i] === 0
    || (reference.clues[i] === 1 && reference.neighbors[i]
      .some((j) => !reference.mines[j] && reference.clues[j] === 0))).length;
  assert.equal(result.boardMetrics.zeroOpenedZeroOneCells, visibleLow);
  assert(!('zeroOneCells' in result.boardMetrics), 'new results do not write the obsolete whole-board count');
  assert(Metrics.hasFractions(result.boardMetrics));
  const openingMinimum = Reference.openingFirstMinimumClicks(reference);
  assert(openingMinimum <= result.hzini);
  assert(openingMinimum >= Reference.minimumChordClicks(reference));
  const reflected = Reference.boardOf([0, 1, 2].map((y) =>
    mines.slice(3 * y, 3 * y + 3).reverse().map((m) => m ? '*' : '.').join('')));
  assert.equal(openingMinimum, Reference.openingFirstMinimumClicks(reflected));
  assert(Math.abs(result.boardMetrics.workSpread - expected) < 1e-12);
}
let seed = 9828;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
for (const [width, height] of [[9, 9], [16, 16], [30, 16]]) {
  for (let trial = 0; trial < 100; trial++) {
    const mines = Array.from({ length: width * height }, () => random() < 0.2);
    const result = Metrics.analyze(width, height, mines);
    assert.equal(result.hzini, simulate(width, height, mines).total);
    assert(result.hzini <= Metrics.board(width, height, mines).units.length);
  }
}
const empty = Array(9).fill(false);
assert.deepEqual(simulate(3, 3, empty), {
  total: 1, actions: { openings: 1, direct: 0, flags: 0, chords: 0 },
});
const center = empty.map((_, i) => i === 4);
assert.equal(Metrics.analyze(3, 3, center).boardMetrics.zeroOpenedZeroOneCells, 0,
  'all ones, but no zeros to reveal any of them');
assert.equal(Metrics.analyze(3, 3, empty).boardMetrics.zeroOpenedZeroOneCells, 9);
assert.deepEqual(simulate(3, 3, center), {
  total: 6, actions: { openings: 0, direct: 1, flags: 1, chords: 4 },
});
assert.equal(Reference.openingFirstMinimumClicks(Reference.boardOf(['...', '.*.', '...'])), 5,
  'a fixed benchmark is not a global optimum');
assert.equal(Reference.openingFirstMinimumClicks(Reference.boardOf(['...', '...', '...'])), 1);
assert.equal(Reference.openingFirstMinimumClicks(Reference.boardOf(['.*.', '.*.', '.*.'])), 6);
assert.throws(() => Reference.openingFirstMinimumClicks(Reference.boardOf(['.................'])), /at most 16/);
assert(Metrics.valid({ version: 1, workSpread: 2,
  chord: { status: 'bounded', lower: 3, upper: 5 } }), 'preserve prior research values');
assert(!Metrics.valid({ version: 1, workSpread: NaN }));
assert(!Metrics.valid({ version: 1, workSpread: -1 }));
assert(Metrics.valid({ version: 2, future: 'preserved' }));
assert(!Metrics.hasFractions({ version: 1, workSpread: 2 }));
for (const counts of [
  { safeCells: 0, zeroOpenedZeroOneCells: 0, zeroOpenedCells: 0 },
  { safeCells: 8, zeroOpenedZeroOneCells: 9, zeroOpenedCells: 0 },
  { safeCells: 8, zeroOpenedZeroOneCells: 0, zeroOpenedCells: -1 },
  { safeCells: 8, zeroOpenedZeroOneCells: 0.5, zeroOpenedCells: 0 },
  { safeCells: 8, zeroOpenedZeroOneCells: 4 },
  { safeCells: 8, zeroOpenedZeroOneCells: 4, zeroOpenedCells: 3 },
]) assert(!Metrics.valid({ version: 1, workSpread: 1, ...counts }));
assert(Metrics.valid({ version: 1, workSpread: 0, safeCells: 1, zeroOpenedZeroOneCells: 1, zeroOpenedCells: 1 }));
const oldWholeBoardCount = { version: 1, workSpread: 1, safeCells: 8,
  zeroOneCells: 8, zeroOpenedCells: 0 };
assert(Metrics.valid(oldWholeBoardCount), 'older saved measurements remain importable');
assert(!Metrics.hasFractions(oldWholeBoardCount), 'old whole-board count still needs backfill');
assert(!Metrics.valid({ ...oldWholeBoardCount, zeroOneCells: 9 }));
console.log('Board benchmarks: independent HZiNi protocol on 511 small and 300 standard-size boards, exact action accounting, geometry, persistence schema passed.');

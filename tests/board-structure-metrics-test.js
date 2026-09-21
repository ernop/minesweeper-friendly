'use strict';

const assert = require('node:assert/strict');
const { boardOf, workGeometry, clueWidthClosure } = require('../reference/board-metric-calculators.js');
const { describe, deductionClosure, factsFromEquations, meanSafeStartCoverage } =
  require('../reference/board-structure-metrics.js');

// Exhaust all pairs of subsets of five cells and all realizable right-hand
// sides. Compare the interval reasoning with independent Boolean enumeration.
const ids = [0, 1, 2, 3, 4];
const subsets = Array.from({ length: 32 }, (_, bits) => ids.filter((i) => bits & 1 << i));
let pairs = 0;
for (const A of subsets) for (const B of subsets) {
  const cases = new Map();
  for (const world of subsets) {
    const needA = A.filter((i) => world.includes(i)).length;
    const needB = B.filter((i) => world.includes(i)).length;
    const key = needA + '/' + needB;
    if (!cases.has(key)) cases.set(key, { needA, needB, worlds: [] });
    cases.get(key).worlds.push(world);
  }
  for (const { needA, needB, worlds } of cases.values()) {
    const expected = new Map();
    for (const i of ids) {
      const values = new Set(worlds.map((world) => Number(world.includes(i))));
      if (values.size === 1) expected.set(i, [...values][0]);
    }
    const actual = factsFromEquations([{ cells: A, need: needA }, { cells: B, need: needB }], 2);
    assert.deepEqual([...actual].sort(), [...expected].sort());
    pairs++;
  }
}

// An independent raw-clue test for automatic zero coverage: a safe cell is
// exposed iff it is zero or adjacent to a zero. No flood implementation needed.
for (let bits = 0; bits < 511; bits++) {
  const rows = [0, 1, 2].map((y) => [0, 1, 2].map((x) => bits & 1 << (3 * y + x) ? '*' : '.').join(''));
  const board = boardOf(rows);
  const stats = describe(board);
  const automatic = board.safes.filter((i) => board.clues[i] === 0
    || board.neighbors[i].some((j) => !board.mines[j] && board.clues[j] === 0)).length;
  assert.equal(stats.zeroOpenedCells, automatic);
  assert.equal(stats.zeroOneCells, board.safes.filter((i) => board.clues[i] <= 1).length);
  assert.equal(workGeometry(board).bv3, stats.openingCount + stats.safeCells - stats.zeroOpenedCells);
  const reflected = boardOf(rows.map((row) => [...row].reverse().join('')));
  assert.deepEqual(describe(reflected), stats);
  const one = deductionClosure(board, 1), two = deductionClosure(board, 2);
  assert(stats.zeroOpenedCells <= one.revealedCells && one.revealedCells <= two.revealedCells);
  assert(two.revealedCells <= stats.safeCells);
  assert.deepEqual(deductionClosure(reflected, 1), one);
  assert.deepEqual(deductionClosure(reflected, 2), two);
  assert.deepEqual(meanSafeStartCoverage(reflected), meanSafeStartCoverage(board));
}

const corner = boardOf(['*..', '...', '...']);
const center = boardOf(['...', '.*.', '...']);
assert.deepEqual(describe(corner), { safeCells: 8, zeroOneCells: 8, zeroOpenedCells: 8,
  openingCount: 1, largestOpeningCells: 8, remainingWorkClusters: 0, largestRemainingWorkCluster: 0 });
assert.deepEqual(describe(center), { safeCells: 8, zeroOneCells: 8, zeroOpenedCells: 0,
  openingCount: 0, largestOpeningCells: 0, remainingWorkClusters: 1, largestRemainingWorkCluster: 8 });
assert.deepEqual(meanSafeStartCoverage(center), { numerator: 64, denominator: 64 });
assert.deepEqual(meanSafeStartCoverage(boardOf(['*.', '..'])), { numerator: 3, denominator: 9 });
assert.deepEqual(describe(boardOf(['.....'])), { safeCells: 5, zeroOneCells: 5, zeroOpenedCells: 5,
  openingCount: 1, largestOpeningCells: 5, remainingWorkClusters: 0, largestRemainingWorkCluster: 0 });
assert.equal(describe(boardOf(['.*.'])).zeroOpenedCells, 0);
assert.equal(describe(boardOf(['*.*', '...', '*.*'])).zeroOneCells, 0);
// Two disjoint zero regions reveal a shared numbered border: union, not sum.
const shared = describe(boardOf(['..*', '...', '*..']));
assert.equal(shared.openingCount, 2);
assert.equal(shared.largestOpeningCells, 4);
assert.equal(shared.zeroOpenedCells, 7);
assert.equal(shared.zeroOneCells, 6);
assert.throws(() => deductionClosure(center, 3), /width/);
assert.throws(() => deductionClosure(center, 2, 4), /safe/);
// Compare the complete evolving closure, including synchronous round counts,
// with the previous reference's exhaustive Boolean-world enumeration.
for (let bits = 0; bits < 63; bits++) {
  const board = boardOf([0, 1].map((y) => [0, 1, 2].map((x) => bits & 1 << (3 * y + x) ? '*' : '.').join('')));
  for (const start of board.safes) for (const width of [1, 2]) {
    const actual = deductionClosure(board, width, start);
    const expected = clueWidthClosure(board, start, width);
    assert.equal(actual.remainingSafeCells, expected.remainingSafeCells);
    assert.equal(actual.rounds, expected.rounds);
  }
}
console.log(`Board structure research: ${pairs} exact equation pairs, 511 layouts, reflection invariance, overlapping floods and known fractions passed.`);

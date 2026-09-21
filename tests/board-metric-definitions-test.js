'use strict';

const assert = require('node:assert/strict');
const Metrics = require('../reference/board-metric-calculators.js');
const Pregen = require('../pregen.js');
const Zini = require('../zini.js');

const empty = Metrics.boardOf(['...', '...', '...']);
assert.equal(Metrics.workGeometry(empty).bv3, 1);
assert.equal(Metrics.workGeometry(empty).spreadCells, 0);
assert.equal(Metrics.minimumChordClicks(empty), 1);
assert.equal(Metrics.logicProfile(empty, 0).requiredClueWidth, 0);

const centerMine = Metrics.boardOf(['...', '.*.', '...']);
const work = Metrics.workGeometry(centerMine);
assert.equal(work.bv3, 8);
assert.equal(work.openings, 0);
assert.equal(work.spreadCells, Math.sqrt(1.5));
assert.equal(work.treeLengthCells, 7);
assert.equal(Metrics.minimumChordClicks(centerMine), 5);
assert.equal(Zini.hzini(3, 3, centerMine.mines), 6);
assert.equal(Metrics.logicProfile(centerMine, 0).requiredClueWidth, 2);
assert.equal(Metrics.clueWidthClosure(centerMine, 0, 1).deductionCoverage, 0);
assert.equal(Metrics.clueWidthClosure(centerMine, 0, 2).deductionCoverage, 1);
assert.deepEqual(Metrics.boardLogicProfile(centerMine).widthCounts, { 2: 8 });

const ambiguous = Metrics.boardOf(['*.', '..']);
const ambiguity = Metrics.boardLogicProfile(ambiguous);
assert.equal(ambiguity.logicSolvableStartFraction, 0);
assert.equal(ambiguity.guessingStarts, 3);
assert.equal(ambiguity.starts[0].requiredClueWidth, null);

// Exhaust all 3x2 layouts. Compare the independently implemented production
// 3BV and ZiNi calculations with the exact state search, and reflect each
// board to check that geometry and logical closure have no scan-order bias.
for (let mines = 0; mines < 63; mines++) {
  const rows = [0, 1].map((y) => [0, 1, 2].map((x) => mines & (1 << (y * 3 + x)) ? '*' : '.').join(''));
  const board = Metrics.boardOf(rows);
  const reflected = Metrics.boardOf(rows.map((row) => [...row].reverse().join('')));
  const actual = Metrics.workGeometry(board);
  const mirror = Metrics.workGeometry(reflected);
  assert.equal(actual.bv3, Pregen.board3BV(3, 2, board.mines));
  const minimum = Metrics.minimumChordClicks(board);
  assert(minimum <= actual.bv3);
  assert(minimum <= Zini.zini(3, 2, board.mines));
  assert(minimum <= Zini.hzini(3, 2, board.mines));
  assert.equal(minimum, Metrics.minimumChordClicks(reflected));
  assert(Math.abs(actual.spreadCells - mirror.spreadCells) < 1e-12);
  assert(Math.abs(actual.treeLengthCells - mirror.treeLengthCells) < 1e-12);
  const originalLogic = Metrics.boardLogicProfile(board);
  const reflectedLogic = Metrics.boardLogicProfile(reflected);
  assert.deepEqual(originalLogic.widthCounts, reflectedLogic.widthCounts);
  assert.equal(originalLogic.guessingStarts, reflectedLogic.guessingStarts);
  for (const { start } of originalLogic.starts) {
    let previousCoverage = 0;
    for (let width = 0; width <= 7; width++) {
      const closure = Metrics.clueWidthClosure(board, start, width);
      assert(closure.deductionCoverage >= previousCoverage);
      previousCoverage = closure.deductionCoverage;
    }
  }
}

assert.throws(() => Metrics.minimumChordClicks(Metrics.boardOf(['.................'])), /at most 16/);
assert.throws(() => Metrics.logicProfile(Metrics.boardOf(['..........']), 0), /at most 9/);
console.log('board-metric-definitions: exact examples, all 63 non-full 3x2 layouts, bounds, symmetry, monotonicity, and explicit search limits passed');

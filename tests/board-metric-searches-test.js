'use strict';

const assert = require('node:assert/strict');
const Metrics = require('../reference/board-metric-searches.js');
const Reference = require('../reference/board-metric-calculators.js');

function bruteModels(unknown, clues) {
  const numerators = new Map(unknown.map((i) => [i, 0n]));
  let total = 0n;
  for (let bits = 0; bits < 2 ** unknown.length; bits++) {
    const mines = new Set(unknown.filter((_, j) => bits & (1 << j)));
    if (!clues.every((c) => c.cells.filter((i) => mines.has(i)).length === c.need)) continue;
    total++;
    for (const i of mines) numerators.set(i, numerators.get(i) + 1n);
  }
  return { total, numerators };
}

for (let bits = 0; bits < 511; bits++) {
  const rows = [0, 1, 2].map((y) => [0, 1, 2].map((x) =>
    bits & (1 << (3 * y + x)) ? '*' : '.').join(''));
  const reference = Reference.boardOf(rows);
  const board = Metrics.board(3, 3, reference.mines);
  assert(Math.abs(board.workSpread - Reference.workGeometry(reference).spreadCells) < 1e-12);
  const want = Reference.minimumChordClicks(reference);
  const exact = Metrics.minimumChordClicks(board, { maxWork: 1000000 });
  assert.equal(exact.status, 'exact');
  assert.equal(exact.lower, want);
  assert.equal(exact.upper, want);
  const bounded = Metrics.minimumChordClicks(board, { maxWork: 0 });
  assert(bounded.lower <= want && want <= bounded.upper);

  // Check exact integer model weights against raw Boolean enumeration after
  // the prescribed opening, including a known mine hit at upper left.
  const revealed = new Set(board.mines[0] ? [] : board.floods[0]);
  const knownMines = new Set(board.mines[0] ? [0] : []);
  const { unknown, clues } = Metrics.equations(board, revealed, knownMines);
  const models = Metrics.modelCounts(unknown, clues, Metrics.budget(1000000));
  const brute = bruteModels(unknown, clues);
  assert.equal(models.total, brute.total);
  for (const i of unknown) assert.equal(models.numerators.get(i), brute.numerators.get(i));

  const logic = Metrics.canonicalLogic(board, { trace: true });
  assert.equal(logic.status, 'complete');
  assert.equal(logic.remainingSafe, 0);
  assert.equal(logic.lower, logic.upper);
  if (!board.mines[0] && logic.guesses === 0) {
    assert.equal(logic.lower, Reference.logicProfile(reference, 0).requiredClueWidth);
  }
  // Recompute all information visible at each guess; no selected mine may
  // be silently skipped, and equal exact odds must keep row-major order.
  const r = new Set(board.mines[0] ? [] : board.floods[0]);
  const f = new Set(board.mines[0] ? [0] : []);
  for (const choice of logic.choices) {
    let state, worlds;
    while (true) {
      state = Metrics.equations(board, r, f);
      worlds = bruteModels(state.unknown, state.clues);
      let changed = false;
      for (const [i, n] of worlds.numerators) {
        if (n === worlds.total) { f.add(i); changed = true; }
        else if (n === 0n) { board.floods[i].forEach((cell) => r.add(cell)); changed = true; }
      }
      if (!changed) break;
    }
    const sorted = state.unknown.slice().sort((a, b) => {
      const x = worlds.numerators.get(a), y = worlds.numerators.get(b);
      return x < y ? -1 : x > y ? 1 : a - b;
    });
    assert.equal(choice.cell, sorted[0]);
    assert.equal(choice.mine, board.mines[choice.cell]);
    if (choice.mine) f.add(choice.cell);
    else board.floods[choice.cell].forEach((cell) => r.add(cell));
  }
}

// A mine at the mandated start is observed and counted; it is never moved.
const cornerMine = Metrics.board(2, 2, [true, false, false, false]);
const corner = Metrics.canonicalLogic(cornerMine);
assert.equal(corner.openingMine, true);
assert.equal(corner.mineHits, 1);
assert.equal(corner.guesses, 0);
assert.equal(corner.lower, 1);
const unfinished = Metrics.canonicalLogic(cornerMine, { maxWork: 0 });
assert.equal(unfinished.status, 'incomplete');
assert.equal(unfinished.remainingSafe, 3);

// Independent definition of phase width: rerun fixed-k closures from the
// phase's initial observation until one matches complete logical closure.
function bruteClosure(board, fromR, fromF, width) {
  const r = new Set(fromR), f = new Set(fromF);
  while (r.size < board.safe.length) {
    const { unknown, clues } = Metrics.equations(board, r, f);
    const facts = new Map();
    const subsets = width === Infinity ? [clues] : [];
    if (width !== Infinity) for (let bits = 0; bits < 2 ** clues.length; bits++) {
      const q = clues.filter((_, i) => bits & (1 << i));
      if (q.length <= width) subsets.push(q);
    }
    for (const q of subsets) {
      const worlds = bruteModels(unknown, q);
      for (const [cell, n] of worlds.numerators) {
        if (n === 0n || n === worlds.total) facts.set(cell, n === 0n ? 0 : 1);
      }
    }
    if (!facts.size) break;
    for (const [i, mine] of facts) {
      if (mine) f.add(i); else board.floods[i].forEach((cell) => r.add(cell));
    }
  }
  return { r, f };
}

for (let bits = 0; bits < 63; bits++) {
  const board = Metrics.board(3, 2, Array.from({ length: 6 }, (_, i) => !!(bits & (1 << i))));
  let r = new Set(board.mines[0] ? [] : board.floods[0]);
  let f = new Set(board.mines[0] ? [0] : []);
  let required = 0;
  while (r.size < board.safe.length) {
    const full = bruteClosure(board, r, f, Infinity);
    for (let width = 0; width <= 7; width++) {
      const limited = bruteClosure(board, r, f, width);
      if (limited.r.size === full.r.size
          && (full.r.size === board.safe.length || limited.f.size === full.f.size)) {
        required = Math.max(required, width); break;
      }
    }
    r = full.r; f = full.f;
    if (r.size === board.safe.length) break;
    const state = Metrics.equations(board, r, f);
    const worlds = bruteModels(state.unknown, state.clues);
    let next = state.unknown[0];
    for (const i of state.unknown) {
      if (worlds.numerators.get(i) < worlds.numerators.get(next)) next = i;
    }
    if (board.mines[next]) f.add(next); else board.floods[next].forEach((cell) => r.add(cell));
  }
  assert.equal(Metrics.canonicalLogic(board).lower, required);
}

const center = Metrics.analyze(3, 3, [false, false, false, false, true, false, false, false, false]);
assert(Metrics.valid(center));
assert.equal(center.chord.upper, 5);
assert.equal(center.logic.upper, 2);
assert.equal(center.logic.guesses, 0);
for (const broken of [
  { ...center, workSpread: Infinity },
  { ...center, chord: { status: 'exact', lower: 2, upper: 5 } },
  { ...center, logic: { ...center.logic, remainingSafe: 2 } },
  { ...center, logic: { ...center.logic, mineHits: 1 } },
]) assert.equal(Metrics.valid(broken), false);
assert(Metrics.valid({ version: 2, futureData: 'preserved' }));
console.log('board-metrics: all 511 non-full 3x3 layouts; independent exact click minima, posterior counts, RCW, safest-guess choices/ties, bounds, and validation passed');

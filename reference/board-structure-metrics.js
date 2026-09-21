'use strict';

// Research calculators, not live UI fields. All results are counts; callers
// derive fractions from the declared safe-cell denominator without rounding.
const { boardOf } = require('./board-metric-calculators.js');

function zeroOpeningSets(board) {
  const seen = new Set(), openings = [];
  for (const i of board.safes) {
    if (board.clues[i] !== 0 || seen.has(i)) continue;
    const flood = board.floods[i];
    openings.push(flood);
    for (const j of flood) if (board.clues[j] === 0) seen.add(j);
  }
  return openings;
}

function describe(board) {
  const openings = zeroOpeningSets(board);
  const exposed = new Set(openings.flat());
  const remaining = new Set(board.safes.filter((i) => !exposed.has(i)));
  const sizes = [];
  while (remaining.size) {
    const stack = [remaining.values().next().value];
    let size = 0;
    while (stack.length) {
      const i = stack.pop();
      if (!remaining.delete(i)) continue;
      size++;
      for (const j of board.neighbors[i]) if (remaining.has(j)) stack.push(j);
    }
    sizes.push(size);
  }
  return {
    safeCells: board.safes.length,
    zeroOneCells: board.safes.filter((i) => board.clues[i] <= 1).length,
    zeroOpenedCells: exposed.size,
    openingCount: openings.length,
    largestOpeningCells: openings.length ? Math.max(...openings.map((o) => o.length)) : 0,
    remainingWorkClusters: sizes.length,
    largestRemainingWorkCluster: sizes.length ? Math.max(...sizes) : 0,
  };
}

// Complete Boolean consequences of each single equation and each pair.
// For a pair there are only three membership classes: A\B, A∩B, B\A.
// Their feasible mine-count intervals suffice; no full-board search is used.
function factsFromEquations(equations, width) {
  if (width !== 1 && width !== 2) throw new Error('clue width must be 1 or 2');
  const facts = new Map();
  const note = (cells, low, high) => {
    if (low > high || low < 0 || high > cells.length) throw new Error('inconsistent equations');
    if (!cells.length || (high !== 0 && low !== cells.length)) return;
    const value = high === 0 ? 0 : 1;
    for (const i of cells) {
      if (facts.has(i) && facts.get(i) !== value) throw new Error('conflicting cell facts');
      facts.set(i, value);
    }
  };
  for (const e of equations) note(e.cells, e.need, e.need);
  if (width === 1) return facts;
  const sets = equations.map((e) => new Set(e.cells));
  for (let a = 0; a < equations.length; a++) for (let b = a + 1; b < equations.length; b++) {
    const A = equations[a], B = equations[b];
    const both = A.cells.filter((i) => sets[b].has(i));
    if (!both.length) continue; // Disjoint equations add no new single-cell facts.
    const onlyA = A.cells.filter((i) => !sets[b].has(i));
    const onlyB = B.cells.filter((i) => !sets[a].has(i));
    const low = Math.max(0, A.need - onlyA.length, B.need - onlyB.length);
    const high = Math.min(both.length, A.need, B.need);
    note(both, low, high);
    note(onlyA, A.need - high, A.need - low);
    note(onlyB, B.need - high, B.need - low);
  }
  return facts;
}

function deductionClosure(board, width, start = 'all-zeros') {
  if (width !== 1 && width !== 2) throw new Error('clue width must be 1 or 2');
  if (start !== 'all-zeros' && !board.safes.includes(start)) throw new Error('start must be safe');
  const revealed = new Set(start === 'all-zeros' ? zeroOpeningSets(board).flat() : board.floods[start]);
  const knownMines = new Set();
  const mineCount = board.mines.length - board.safes.length;
  let rounds = 0;
  while (revealed.size < board.safes.length) {
    const unknown = board.mines.flatMap((_, i) => !revealed.has(i) && !knownMines.has(i) ? [i] : []);
    const equations = [{ cells: unknown, need: mineCount - knownMines.size }];
    for (const i of revealed) {
      const cells = board.neighbors[i].filter((j) => !revealed.has(j) && !knownMines.has(j));
      if (cells.length) equations.push({ cells,
        need: board.clues[i] - board.neighbors[i].filter((j) => knownMines.has(j)).length });
    }
    const facts = factsFromEquations(equations, width);
    if (!facts.size) break;
    rounds++;
    // All deductions used the same pre-round observations. New clues and
    // substitutions become available in the following round only.
    for (const [i, value] of facts) {
      if (Boolean(value) !== board.mines[i]) throw new Error('unsound deduction');
      if (value) knownMines.add(i);
      else for (const j of board.floods[i]) revealed.add(j);
    }
  }
  return { safeCells: board.safes.length, revealedCells: revealed.size,
    remainingSafeCells: board.safes.length - revealed.size, rounds };
}

function meanSafeStartCoverage(board, width = 2) {
  return { numerator: board.safes.reduce((sum, start) =>
    sum + deductionClosure(board, width, start).revealedCells, 0),
  denominator: board.safes.length ** 2 };
}

module.exports = { describe, deductionClosure, factsFromEquations, meanSafeStartCoverage };

if (require.main === module) {
  const board = boardOf(process.argv.slice(2));
  console.log(JSON.stringify({ ...describe(board),
    oneClue: deductionClosure(board, 1), twoClue: deductionClosure(board, 2),
    meanSafeStartTwoClueCoverage: meanSafeStartCoverage(board) }, null, 2));
}

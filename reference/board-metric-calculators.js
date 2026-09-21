'use strict';

// Executable definitions for the accompanying research note, not a live-game
// scoring engine. Exact searches deliberately reject large inputs instead of
// presenting a bounded search as a proved optimum or a forced guess.
const BoardShape = require('../board-shape.js');
const Zini = require('../zini.js');

function boardOf(rows) {
  if (!rows.length || !rows[0].length || rows.some((row) =>
    row.length !== rows[0].length || /[^.*]/.test(row))) {
    throw new Error('expected a nonempty rectangular array of ./* strings');
  }
  const width = rows[0].length;
  const height = rows.length;
  const mines = rows.join('').split('').map((cell) => cell === '*');
  const neighbors = mines.map((_, i) => BoardShape.neighbors(i, width, height));
  const clues = neighbors.map((around) => around.filter((i) => mines[i]).length);
  const safes = mines.flatMap((mine, i) => mine ? [] : [i]);
  if (!safes.length) throw new Error('board must contain a safe cell');
  const floods = mines.map((mine, cell) => mine ? [] : [cell]);
  const visitedZeros = new Set();
  for (const start of safes) {
    if (clues[start] !== 0 || visitedZeros.has(start)) continue;
    const seen = new Set();
    const zeros = [];
    const stack = [start];
    while (stack.length) {
      const cell = stack.pop();
      if (seen.has(cell)) continue;
      seen.add(cell);
      if (clues[cell] === 0) {
        visitedZeros.add(cell);
        zeros.push(cell);
        for (const next of neighbors[cell]) if (!seen.has(next)) stack.push(next);
      }
    }
    const opening = [...seen];
    for (const cell of zeros) floods[cell] = opening;
  }
  return { width, height, mines, neighbors, clues, safes, floods };
}

function workGeometry(board) {
  const { width, height, clues, safes, floods } = board;
  const covered = new Set();
  const visitedZeros = new Set();
  const points = [];
  let openings = 0;
  for (const i of safes) {
    if (clues[i] !== 0 || visitedZeros.has(i)) continue;
    openings++;
    const zeros = floods[i].filter((cell) => clues[cell] === 0);
    zeros.forEach((cell) => visitedZeros.add(cell));
    floods[i].forEach((cell) => covered.add(cell));
    points.push({
      x: zeros.reduce((sum, cell) => sum + cell % width, 0) / zeros.length,
      y: zeros.reduce((sum, cell) => sum + Math.floor(cell / width), 0) / zeros.length,
    });
  }
  for (const i of safes) {
    if (!covered.has(i)) points.push({ x: i % width, y: Math.floor(i / width) });
  }
  const count = points.length;
  const center = { x: points.reduce((sum, p) => sum + p.x, 0) / count,
    y: points.reduce((sum, p) => sum + p.y, 0) / count };
  const spreadCells = Math.sqrt(points.reduce((sum, p) =>
    sum + (p.x - center.x) ** 2 + (p.y - center.y) ** 2, 0) / count);
  const diagonal = Math.hypot(width - 1, height - 1);
  // Prim's algorithm gives a unique length even when several trees tie.
  const distance = points.map(() => Infinity);
  distance[0] = 0;
  const used = new Set();
  let treeLengthCells = 0;
  while (used.size < count) {
    let next = -1;
    for (let i = 0; i < count; i++) {
      if (!used.has(i) && (next < 0 || distance[i] < distance[next])) next = i;
    }
    used.add(next);
    treeLengthCells += distance[next];
    for (let i = 0; i < count; i++) {
      distance[i] = Math.min(distance[i], Math.hypot(
        points[next].x - points[i].x, points[next].y - points[i].y));
    }
  }
  return { bv3: count, openings, isolatedSafes: count - openings, points,
    spreadCells, spreadDiagonalPercent: diagonal === 0 ? 0 : spreadCells / diagonal * 100,
    treeLengthCells };
}

const maskOf = (cells) => cells.reduce((mask, cell) => mask | (1 << cell), 0);
function popcount(mask) {
  let count = 0;
  while (mask) { mask &= mask - 1; count++; }
  return count;
}

function minimumChordClicks(board) {
  return minimumChordClicksFrom(board, 0, 0);
}

// The prescribed opening phase charges one reveal per zero component. Its
// final state is independent of which zero represents each component.
function openingFirstMinimumClicks(board) {
  let initial = 0, openingClicks = 0;
  if (board.mines.length > 16) throw new Error('exact chord reference search supports at most 16 cells');
  for (const i of board.safes) if (!board.clues[i] && !(initial & (1 << i))) {
    initial |= maskOf(board.floods[i]);
    openingClicks++;
  }
  return minimumChordClicksFrom(board, initial, openingClicks);
}

function minimumChordClicksFrom(board, initial, openingClicks) {
  const n = board.mines.length;
  if (n > 16) throw new Error('exact chord reference search supports at most 16 cells');
  const safeMask = maskOf(board.safes);
  const mineMask = ((1 << n) - 1) ^ safeMask;
  const floods = board.floods.map(maskOf);
  const neighborMines = board.neighbors.map((cells) => maskOf(cells) & mineMask);
  const chordReveals = board.neighbors.map((cells) =>
    cells.reduce((mask, cell) => mask | floods[cell], 0));
  // One state bit per cell: revealed if safe, flagged if mined.
  const costs = new Int16Array(1 << n).fill(-1);
  costs[initial] = openingClicks;
  const queue = [initial];
  const add = (state, next) => {
    if (costs[next] >= 0) return;
    costs[next] = costs[state] + 1;
    queue.push(next);
  };
  for (let head = 0; head < queue.length; head++) {
    const state = queue[head];
    if ((state & safeMask) === safeMask) return costs[state];
    for (let cell = 0; cell < n; cell++) {
      const bit = 1 << cell;
      if (!(state & bit)) {
        add(state, state | (board.mines[cell] ? bit : floods[cell]));
      } else if (!board.mines[cell] && board.clues[cell] > 0
          && (state & neighborMines[cell]) === neighborMines[cell]) {
        add(state, state | chordReveals[cell]);
      }
    }
  }
  throw new Error('safe reveals must provide a completing path');
}

function clueWidthClosure(board, start, width) {
  const n = board.mines.length;
  if (n > 9) throw new Error('exact clue-width reference search supports at most 9 cells');
  if (!Number.isInteger(width) || width < 0) throw new Error('clue width must be a nonnegative integer');
  if (!board.safes.includes(start)) throw new Error('start must be a safe cell');
  const all = (1 << n) - 1;
  const safeMask = maskOf(board.safes);
  let revealed = maskOf(board.floods[start]);
  const initiallyHiddenSafes = popcount(safeMask & ~revealed);
  let knownMines = 0;
  let rounds = 0;
  while (revealed !== safeMask) {
    const unknown = all & ~(revealed | knownMines);
    const constraints = [];
    for (const cell of board.safes) {
      if (!(revealed & (1 << cell))) continue;
      const neighbors = maskOf(board.neighbors[cell]);
      constraints.push({ mask: neighbors & unknown,
        count: board.clues[cell] - popcount(neighbors & knownMines) });
    }
    // The global counter costs one constraint; it is not silently included
    // when testing what a smaller local clue subset alone can establish.
    constraints.push({ mask: unknown, count: n - board.safes.length - popcount(knownMines) });
    const worlds = [];
    for (let mines = unknown; ; mines = (mines - 1) & unknown) {
      let violations = 0;
      constraints.forEach((constraint, i) => {
        if (popcount(mines & constraint.mask) !== constraint.count) violations |= 1 << i;
      });
      worlds.push({ mines, violations });
      if (mines === 0) break;
    }
    let forcedSafe = 0;
    let forcedMines = 0;
    for (let subset = 0; subset < 1 << constraints.length; subset++) {
      if (popcount(subset) > width) continue;
      let union = 0;
      let intersection = unknown;
      for (const world of worlds) {
        if (!(world.violations & subset)) {
          union |= world.mines;
          intersection &= world.mines;
        }
      }
      forcedSafe |= unknown & ~union;
      forcedMines |= intersection;
    }
    if (!(forcedSafe | forcedMines)) break;
    knownMines |= forcedMines;
    for (const cell of board.safes) {
      if (forcedSafe & (1 << cell)) revealed |= maskOf(board.floods[cell]);
    }
    rounds++;
  }
  const remaining = popcount(safeMask & ~revealed);
  return { solved: remaining === 0, rounds, remainingSafeCells: remaining,
    deductionCoverage: initiallyHiddenSafes === 0 ? 1 : 1 - remaining / initiallyHiddenSafes };
}

function logicProfile(board, start) {
  const fullWidth = board.mines.length + 1;
  const exact = clueWidthClosure(board, start, fullWidth);
  const atWidth = [];
  let requiredClueWidth = null;
  for (let width = 0; width <= fullWidth; width++) {
    const result = clueWidthClosure(board, start, width);
    atWidth.push({ width, ...result });
    if (result.solved) { requiredClueWidth = width; break; }
    // No wider rule set can beat full exact logical closure.
    if (!exact.solved && result.remainingSafeCells === exact.remainingSafeCells) break;
  }
  return { requiredClueWidth, guessRequired: !exact.solved, atWidth };
}

function boardLogicProfile(board) {
  const starts = board.safes.map((start) => ({ start, ...logicProfile(board, start) }));
  const widthCounts = {};
  let guessingStarts = 0;
  for (const profile of starts) {
    if (profile.guessRequired) guessingStarts++;
    else widthCounts[profile.requiredClueWidth] = (widthCounts[profile.requiredClueWidth] || 0) + 1;
  }
  return { safeStarts: starts.length, guessingStarts, widthCounts,
    logicSolvableStartFraction: 1 - guessingStarts / starts.length, starts };
}

module.exports = { boardOf, workGeometry, minimumChordClicks, openingFirstMinimumClicks, clueWidthClosure,
  logicProfile, boardLogicProfile };

if (require.main === module) {
  const board = boardOf(process.argv.slice(2));
  console.log(JSON.stringify({
    ...workGeometry(board),
    greedyZiNi: Zini.zini(board.width, board.height, board.mines),
    humanZiNi: Zini.hzini(board.width, board.height, board.mines),
    minimumChordClicks: minimumChordClicks(board),
    openingFirstMinimumClicks: openingFirstMinimumClicks(board),
    logic: boardLogicProfile(board),
  }, null, 2));
}

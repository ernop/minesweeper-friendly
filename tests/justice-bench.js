'use strict';

// Deterministic timing measurements for the "a just universe" solver.
// Run: node tests/justice-bench.js
//
// No randomness: each case is a constructed position that exercises one
// path of the solver at its worst plausible scale. Boards use the same
// ascii convention as the tests ('.' revealed safe, '#' covered safe,
// '*' covered mine); revealed numbers are computed from the true mines,
// so every position is consistent by construction.

const Justice = require('../justice.js');

function makeBoard(rows) {
  const height = rows.length;
  const width = rows[0].length;
  const mines = [];
  const revealed = [];
  for (const row of rows) {
    if (row.length !== width) throw new Error('ragged fixture');
    for (const ch of row) {
      mines.push(ch === '*');
      revealed.push(ch === '.');
    }
  }
  const adjacent = mines.map((m, i) => (m ? 0
    : Justice.neighbors(i, width, height).filter((n) => mines[n]).length));
  return {
    view: { width, height, mines: mines.filter(Boolean).length, revealed, adjacent },
    mines,
    at: (x, y) => y * width + x,
  };
}

function measure(name, board, hit, expectSave) {
  const budget = { nodes: 0, limit: Justice.NODE_BUDGET };
  const start = process.hrtime.bigint();
  const redrawn = Justice.trySave(board.view, [hit], [hit],
    board.mines.slice(), Math.random, budget);
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  const outcome = redrawn === null ? 'no save' : 'SAVE';
  const expected = expectSave ? 'SAVE' : 'no save';
  const verdict = outcome === expected ? 'ok' : 'WRONG (expected ' + expected + ')';
  console.log(name.padEnd(58) + outcome.padEnd(9)
    + ms.toFixed(3).padStart(9) + 'ms' + String(budget.nodes).padStart(10) + ' work  ' + verdict);
  return outcome === expected;
}

let allOk = true;
const run = (...args) => { allOk = measure(...args) && allOk; };

//-------1. Early corner "1" on expert: huge sea, tiny island-------
// Only the corner is revealed; one mine among its three neighbors, the
// other 98 mines deep in the sea in a fixed diagonal-ish pattern.
{
  const W = 30, H = 16;
  const grid = Array.from({ length: H }, () => new Array(W).fill('#'));
  grid[0][0] = '.';
  grid[1][1] = '*';
  let placed = 1;
  outer:
  for (let y = 3; y < H; y++) {
    for (let x = (y * 7) % 5; x < W; x += 3) {
      if (placed === 99) break outer;
      grid[y][x] = '*';
      placed++;
    }
  }
  if (placed !== 99) throw new Error('bad construction: ' + placed);
  const b = makeBoard(grid.map((r) => r.join('')));
  run('expert corner-1: sea mine death (open field)', b, b.at(3, 5), false);
  run('expert corner-1: neighbor mine death (open field)', b, b.at(1, 1), false);
}

//-------2. Long undeducible chain, variable totals: the abort path-------
// One row, clues "1" between covered cells: [#][1][#][1][#]... 41 wide.
// Every clue sees exactly two covered cells; nothing is deducible by
// counting or subsets, so the island is all 21 covered cells with many
// arrangements of *different* totals — the witness-anchored abort must
// reject it after its first divergent arrangement, not enumerate it.
{
  const cells = [];
  for (let i = 0; i < 41; i++) {
    if (i % 2 === 1) cells.push('.');
    else cells.push(i % 4 === 0 ? '*' : '#');
  }
  const b = makeBoard([cells.join('')]);
  run('41-wide undeducible chain, 21-cell island (open)', b, 0, false);
}

//-------3. Sealed sea remnant on expert: the sea path at scale-------
// Columns 0-25 revealed, column 26 a full wall of 16 provable mines,
// columns 27-29 a 48-cell sealed sea holding 5 mines. Every guard of the
// sea is a proven mine, every island is empty: a named coin at 5/48 odds.
{
  const W = 30, H = 16;
  const grid = Array.from({ length: H }, () => new Array(W).fill('.'));
  for (let y = 0; y < H; y++) {
    grid[y][26] = '*';
    for (let x = 27; x < W; x++) grid[y][x] = '#';
  }
  for (const [x, y] of [[28, 1], [27, 4], [29, 7], [28, 10], [27, 14]]) grid[y][x] = '*';
  const b = makeBoard(grid.map((r) => r.join('')));
  run('expert sealed sea remnant, 48 cells / 5 mines', b, b.at(28, 1), true);
}

//-------4. The same shapes at 100x100 (the biggest custom board)-------
{
  const W = 100, H = 100;
  const grid = Array.from({ length: H }, () => new Array(W).fill('#'));
  grid[0][0] = '.';
  grid[1][1] = '*';
  let placed = 1;
  outer:
  for (let y = 3; y < H; y++) {
    for (let x = (y * 7) % 5; x < W; x += 4) {
      if (placed === 2000) break outer;
      grid[y][x] = '*';
      placed++;
    }
  }
  if (placed !== 2000) throw new Error('bad construction: ' + placed);
  const b = makeBoard(grid.map((r) => r.join('')));
  run('100x100/2000 corner-1: sea mine death (open field)', b, b.at(50, 50), false);
}
{
  const W = 100, H = 100;
  const grid = Array.from({ length: H }, () => new Array(W).fill('.'));
  for (let y = 0; y < H; y++) {
    grid[y][96] = '*';
    for (let x = 97; x < W; x++) grid[y][x] = '#';
  }
  for (let y = 2; y < H; y += 7) grid[y][98] = '*';
  const b = makeBoard(grid.map((r) => r.join('')));
  run('100x100 sealed sea remnant, 300 cells / 14 mines', b, b.at(98, 2), true);
}

//-------5. Sealed pair reached mid-game (the common save)-------
{
  const b = makeBoard([
    '..#',
    '..*',
    '.**',
    '...',
  ]);
  run('sealed pair (help-file diagram)', b, b.at(2, 1), true);
}

console.log(allOk ? '\nall outcomes as expected' : '\nUNEXPECTED OUTCOMES');
process.exit(allOk ? 0 : 1);

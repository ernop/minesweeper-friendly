'use strict';

// Deterministic scale checks for the certificate-based Justice solver.
// These are measurements, not pass/fail timing thresholds.
// Run: node tests/justice-bench.js

const Justice = require('../justice.js');

function measure(name, operation) {
  const start = process.hrtime.bigint();
  const result = operation();
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  console.log(name.padEnd(62) + ms.toFixed(3).padStart(10) + ' ms');
  return result;
}

function makeBoard(rows) {
  const height = rows.length;
  const width = rows[0].length;
  const mines = [];
  const revealed = [];
  for (const row of rows) {
    for (const char of row) {
      mines.push(char === '*');
      revealed.push(char === '.');
    }
  }
  const adjacent = mines.map((mine, index) => (mine ? 0
    : Justice.neighbors(index, width, height).filter((neighbor) => mines[neighbor]).length));
  return {
    view: {
      width,
      height,
      mines: mines.filter(Boolean).length,
      revealed,
      adjacent,
    },
    mines,
    at: (x, y) => y * width + x,
  };
}

// 1. Largest custom board, open field: deterministic rejection.
{
  const width = 100;
  const height = 100;
  const grid = Array.from({ length: height }, () => new Array(width).fill('#'));
  grid[0][0] = '.';
  grid[1][1] = '*';
  let placed = 1;
  outer:
  for (let y = 3; y < height; y++) {
    for (let x = (y * 7) % 5; x < width; x += 4) {
      if (placed === 2000) break outer;
      grid[y][x] = '*';
      placed++;
    }
  }
  const board = makeBoard(grid.map((row) => row.join('')));
  const certificate = measure(
    '100x100 open-field rejection',
    () => Justice.certifyEntry(board.view, board.at(50, 50)));
  if (certificate !== null) throw new Error('open field was certified');
}

// 2. Largest custom board, 300-cell sea behind a proven mine wall.
{
  const width = 100;
  const height = 100;
  const grid = Array.from({ length: height }, () => new Array(width).fill('.'));
  for (let y = 0; y < height; y++) {
    grid[y][96] = '*';
    for (let x = 97; x < width; x++) grid[y][x] = '#';
  }
  for (let y = 2; y < height; y += 7) grid[y][98] = '*';
  const board = makeBoard(grid.map((row) => row.join('')));
  const certificate = measure(
    '100x100 sealed 300-cell sea certification',
    () => Justice.certifyEntry(board.view, board.at(98, 2)));
  if (certificate === null || certificate.type !== 'sea') {
    throw new Error('sealed sea was not certified');
  }
}

// 3. A maximal-size complement graph is proven by traversal, not layouts.
{
  const count = 10000;
  const cells = Array.from({ length: count }, (_, index) => index);
  const clues = [];
  for (let i = 0; i + 1 < count; i++) {
    clues.push({ covered: [i, i + 1], count: 1 });
  }
  const structure = { clues };
  const component = { cells, clues: clues.map((_, index) => index) };
  const shape = measure(
    '10,000-cell complement-chain structural proof',
    () => Justice.complementShape(structure, component));
  if (shape === null || shape.partitionA.length !== 5000) {
    throw new Error('complement chain was not proven');
  }
}

// 4. A 10,000-cell k-of-n redraw is direct sampling, not C(n,k) models.
{
  const count = 10000;
  const mineCount = 2000;
  const cells = Array.from({ length: count }, (_, index) => index);
  const currentMines = cells.map((index) => index < mineCount);
  const certificate = {
    type: 'sea',
    cells,
    mineCount,
    clearWays: count - mineCount,
    totalWays: count,
  };
  let state = 0x12345678;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const redrawn = measure(
    '10,000-cell 2,000-mine conditioned redraw',
    () => Justice.redrawEntry(certificate, 0, currentMines, random));
  if (redrawn[0] || redrawn.filter(Boolean).length !== mineCount) {
    throw new Error('large redraw is invalid');
  }
}

console.log('\nall deterministic scale checks passed');

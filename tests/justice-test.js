'use strict';

// Deterministic policy and correctness tests for sealed-pocket mercy.
// Run: node tests/justice-test.js

const fs = require('node:fs');
const path = require('node:path');
const Justice = require('../justice.js');

let failures = 0;

function check(name, condition) {
  if (condition) console.log('  ok  ' + name);
  else {
    failures++;
    console.log('FAIL  ' + name);
  }
}

function makeBoard(rows) {
  const height = rows.length;
  const width = rows[0].length;
  const mines = [];
  const revealed = [];
  for (const row of rows) {
    if (row.length !== width) throw new Error('ragged fixture');
    for (const char of row) {
      if (!'.#*'.includes(char)) throw new Error('bad fixture char ' + char);
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

function validRedraw(board, redrawn, clicked) {
  if (redrawn[clicked]) return false;
  if (redrawn.filter(Boolean).length !== board.view.mines) return false;
  for (let i = 0; i < redrawn.length; i++) {
    if (!board.view.revealed[i]) continue;
    const count = Justice.neighbors(i, board.view.width, board.view.height)
      .filter((neighbor) => redrawn[neighbor]).length;
    if (count !== board.view.adjacent[i]) return false;
  }
  return true;
}

// 1. A symmetric 1-in-3 is certified before the witness is consulted.
{
  const minedEntry = makeBoard(['.*', '##']);
  const safeEntry = makeBoard(['.#', '*#']);
  const minedCertificate = Justice.certifyEntry(minedEntry.view, 1);
  const safeCertificate = Justice.certifyEntry(safeEntry.view, 1);
  check('1-in-3: certified cardinality pocket',
    minedCertificate !== null && minedCertificate.type === 'cardinality');
  check('1-in-3: qualification independent of hidden layout',
    JSON.stringify(minedCertificate) === JSON.stringify(safeCertificate));
  check('1-in-3: exact entry odds recorded',
    minedCertificate.clearWays === 2 && minedCertificate.totalWays === 3);
  const redrawn = Justice.redrawEntry(
    minedCertificate, 1, minedEntry.mines, () => 0);
  check('1-in-3: mined entry redrawn clear', validRedraw(minedEntry, redrawn, 1));
  const unchanged = Justice.redrawEntry(
    safeCertificate, 1, safeEntry.mines, () => 0);
  check('1-in-3: already-safe entry leaves layout unchanged',
    unchanged.every((mine, index) => mine === safeEntry.mines[index]));
}

// 2. A larger cardinality pocket uses direct combinatorial redraw.
{
  const board = makeBoard([
    '*##',
    '#.#',
    '##*',
  ]);
  const certificate = Justice.certifyEntry(board.view, board.at(0, 0));
  check('2-in-8: certified without layout enumeration',
    certificate !== null
      && certificate.type === 'cardinality'
      && certificate.mineCount === 2
      && certificate.cells.length === 8);
  const redrawn = Justice.redrawEntry(
    certificate, board.at(0, 0), board.mines, () => 0);
  check('2-in-8: conditioned redraw valid',
    validRedraw(board, redrawn, board.at(0, 0)));
}

// 3. An even alternating chain has exactly two equal-total layouts.
{
  const board = makeBoard(['*.#.*.#']);
  const certificate = Justice.certifyEntry(board.view, 0);
  check('alternating chain: complement certificate',
    certificate !== null
      && certificate.type === 'complement'
      && certificate.partitionA.length === 2
      && certificate.partitionB.length === 2);
  const redrawn = Justice.redrawEntry(certificate, 0, board.mines, () => 0);
  check('alternating chain: switches to the clear complement',
    validRedraw(board, redrawn, 0));
}

// 4. Sealed sea remnant behind proven mines.
{
  const board = makeBoard(['.*#**.']);
  const certificate = Justice.certifyEntry(board.view, 3);
  check('sealed sea: certified k-of-n remnant',
    certificate !== null
      && certificate.type === 'sea'
      && certificate.cells.length === 2
      && certificate.mineCount === 1);
  const redrawn = Justice.redrawEntry(certificate, 3, board.mines, () => 0);
  check('sealed sea: conditioned redraw valid', validRedraw(board, redrawn, 3));
  check('sealed sea: mine moves to partner', redrawn[2] === true);
}

// 5. Early open-field guesses remain ordinary risk.
{
  const board = makeBoard([
    '.#########',
    '#*########',
    '##########',
    '##########',
    '####*#####',
    '##*###*###',
    '####*###*#',
    '#######*##',
    '##*#######',
    '#####*####',
  ]);
  check('corner 1: sea entry not certified',
    Justice.certifyEntry(board.view, board.at(5, 9)) === null);
  check('corner 1: neighbor entry not certified',
    Justice.certifyEntry(board.view, board.at(1, 1)) === null);
}

// 6. A geometrically open flank can reveal which side contains the mine.
{
  const board = makeBoard([
    '..##',
    '..*#',
    '.**#',
    '...#',
  ]);
  check('open-flank pair: not certified',
    Justice.certifyEntry(board.view, board.at(2, 1)) === null);
}

// 7. Knowable cells are not ambiguous entries.
{
  const board = makeBoard(['.**']);
  check('provable mine: not certified', Justice.certifyEntry(board.view, 2) === null);
}

// 8. Disconnected complement pockets are certified and redrawn separately.
{
  const board = makeBoard(['*.#.*.#*.**.#.*.#']);
  const first = Justice.certifyEntry(board.view, 0);
  const second = Justice.certifyEntry(board.view, 10);
  check('disconnected pockets: first independently certified',
    first !== null && first.type === 'complement' && first.cells.includes(0));
  check('disconnected pockets: second independently certified',
    second !== null && second.type === 'complement' && second.cells.includes(10));
  const redrawn = Justice.redrawEntry(first, 0, board.mines, () => 0);
  check('disconnected pockets: first redraw leaves second untouched',
    second.cells.every((cell) => redrawn[cell] === board.mines[cell]));
}

// 9. Chords categorically bypass Justice in the game integration. This is
// an origin rule, not something the pure cell certifier can infer.
{
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'minesweeper.js'), 'utf8');
  const chordBody = source.slice(
    source.indexOf('function chord('), source.indexOf('function checkWin('));
  check('chord integration: never calls Justice', !chordBody.includes('attemptJustice'));
  check('direct reveal integration: calls Justice before mine test',
    source.indexOf('attemptJustice(index)') < source.indexOf('if (cell.mine)', source.indexOf('function revealCell(')));
}

console.log(failures === 0 ? '\nall tests passed' : '\n' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);

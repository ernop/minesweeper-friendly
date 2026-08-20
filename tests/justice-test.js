'use strict';

// Correctness tests for the "a just universe" solver (justice.js).
// Run: node tests/justice-test.js
//
// Boards are ascii fixtures: '.' = revealed safe cell, '#' = covered safe
// cell, '*' = covered mine. Revealed numbers are computed from the true
// mines, so every fixture is a consistent position by construction.

const Justice = require('../justice.js');

let failures = 0;

function check(name, condition) {
  if (condition) {
    console.log('  ok  ' + name);
  } else {
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
    for (const ch of row) {
      if (!'.#*'.includes(ch)) throw new Error('bad fixture char ' + ch);
      mines.push(ch === '*');
      revealed.push(ch === '.');
    }
  }
  const adjacent = mines.map((m, i) => (m ? 0
    : Justice.neighbors(i, width, height).filter((n) => mines[n]).length));
  const view = {
    width,
    height,
    mines: mines.filter(Boolean).length,
    revealed,
    adjacent,
  };
  return { view, mines, at: (x, y) => y * width + x };
}

function trySave(board, hits, reveals) {
  return Justice.trySave(board.view, hits, reveals !== undefined ? reveals : hits,
    board.mines.slice(), Math.random, { nodes: 0, limit: 1e7 });
}

// A redraw must keep the mine total, keep every opened cell clear, and
// agree with every revealed number.
function validRedraw(board, redrawn, reveals) {
  if (redrawn.filter(Boolean).length !== board.view.mines) return false;
  if (reveals.some((i) => redrawn[i])) return false;
  for (let i = 0; i < redrawn.length; i++) {
    if (!board.view.revealed[i]) continue;
    const adj = Justice.neighbors(i, board.view.width, board.view.height)
      .filter((n) => redrawn[n]).length;
    if (adj !== board.view.adjacent[i]) return false;
  }
  return true;
}

//-------1. Sealed sea pair (endgame remnant / early sealed nook)-------
// [.][*][#][*][*][.]: the outer 1s prove the mines at 1 and 4; the pair
// {2,3} touches no number and holds exactly one mine (3 total - 2 proven).
// A named coin: saved, and the mine moves to the other cell.
{
  const b = makeBoard(['.*#**.']);
  const redrawn = trySave(b, [3], [3]);
  check('sealed sea pair: saved', redrawn !== null);
  check('sealed sea pair: valid redraw', redrawn !== null && validRedraw(b, redrawn, [3]));
  check('sealed sea pair: mine moved to the partner', redrawn !== null && redrawn[2] === true);
}

//-------2. Early-game corner 1: open-field guesses are real risk-------
{
  const rows = [
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
  ];
  const b = makeBoard(rows);
  check('corner 1: sea guess is not saved', trySave(b, [b.at(5, 9)]) === null);
  check('corner 1: neighbor guess is not saved', trySave(b, [b.at(1, 1)]) === null);
}

//-------3. Sealed clue pair mid-game (the help-file diagram)-------
// 3 wide, 4 tall; A=(2,0), B=(2,1) with B the true mine; proven mines at
// (1,2) and (2,2). The 1 at (1,0) sees exactly {A,B}; the 3 proves the two
// mines; every clue touching A touches B; the only asymmetric neighbors of
// the pair are the proven mines. Sealed: saved.
{
  const b = makeBoard([
    '..#',
    '..*',
    '.**',
    '...',
  ]);
  const B = b.at(2, 1);
  const A = b.at(2, 0);
  const M2 = b.at(1, 2);
  const M = b.at(2, 2);
  const redrawn = trySave(b, [B], [B]);
  check('sealed pair: saved', redrawn !== null);
  check('sealed pair: valid redraw', redrawn !== null && validRedraw(b, redrawn, [B]));
  check('sealed pair: mine moved onto A', redrawn !== null && redrawn[A] === true);
  check('sealed pair: proven mines untouched',
    redrawn !== null && redrawn[M2] === true && redrawn[M] === true);
  check('sealed pair: clicking a proven mine is not saved', trySave(b, [M]) === null);
  check('sealed pair: chord opening the whole pair is not saved',
    trySave(b, [B], [A, B]) === null);
  // Chord equivalence: a flag on A + chord opens only B == clicking B.
  const chorded = trySave(b, [B], [B]);
  check('sealed pair: flag-and-chord entry is saved', chorded !== null);
}

//-------4. The same pair with an open flank: resolvable, not saved-------
// A fourth column of unexplored cells borders B's side; opening those
// cells later could tell A from B, so the pair is not a sealed coin.
{
  const b = makeBoard([
    '..##',
    '..*#',
    '.**#',
    '...#',
  ]);
  check('open-flank pair: not saved', trySave(b, [b.at(2, 1)]) === null);
}

//-------5. All remaining covered cells are mines: knowable, not saved-------
{
  const b = makeBoard(['.**']);
  check('all-mines remnant: not saved', trySave(b, [2]) === null);
}

//-------6. The help-file endgame diagram: pair behind a proven wall-------
// [2][*][#] / [2][*][*]: the 2s prove the wall column; the right column
// holds one mine between two cells no number can ever see.
{
  const b = makeBoard([
    '.*#',
    '.**',
  ]);
  const A = b.at(2, 0);
  const B = b.at(2, 1);
  const redrawn = trySave(b, [B], [B]);
  check('endgame wall pair: saved', redrawn !== null);
  check('endgame wall pair: valid redraw', redrawn !== null && validRedraw(b, redrawn, [B]));
  check('endgame wall pair: mine moved to partner', redrawn !== null && redrawn[A] === true);
}

//-------7. Redraw distribution sanity: repeated saves stay valid-------
{
  const b = makeBoard([
    '..#',
    '..*',
    '.**',
    '...',
  ]);
  const B = b.at(2, 1);
  let allValid = true;
  for (let t = 0; t < 200; t++) {
    const redrawn = trySave(b, [B], [B]);
    if (redrawn === null || !validRedraw(b, redrawn, [B])) allValid = false;
  }
  check('repeated redraws: always valid', allValid);
}

console.log(failures === 0 ? '\nall tests passed' : '\n' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);

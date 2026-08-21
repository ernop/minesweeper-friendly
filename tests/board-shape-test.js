'use strict';

const BoardShape = require('../board-shape.js');

let failures = 0;
function check(name, condition) {
  if (condition) console.log('  ok  ' + name);
  else {
    failures++;
    console.log('FAIL  ' + name);
  }
}

function mines(width, height, marks) {
  const rows = marks.trim().split('\n').map((row) => row.trim());
  check('fixture ' + JSON.stringify(marks.slice(0, 20)) + ' is ' + height + 'x' + width,
    rows.length === height && rows.every((row) => row.length === width));
  const mineAt = [];
  for (const row of rows) {
    for (const ch of row) mineAt.push(ch === '*');
  }
  return BoardShape.of(width, height, mineAt);
}

check('empty 3x3 is all zeros and no islands', (() => {
  const s = mines(3, 3, `
...
...
...
`);
  return s.maxAdjacent === 0 && s.hasSeven === false && s.zeroCount === 9
    && s.islandCount === 0 && s.largestIsland === 0;
})());

check('corner mine: 1 island of 1, max 1, 5 zeros', (() => {
  const s = mines(3, 3, `
*..
...
...
`);
  // Three numbered neighbors, five zeros, one mine.
  return s.maxAdjacent === 1 && s.hasSeven === false && s.zeroCount === 5
    && s.islandCount === 1 && s.largestIsland === 1;
})());

check('diagonal mines are one island', (() => {
  const s = mines(3, 3, `
*..
.*.
...
`);
  return s.islandCount === 1 && s.largestIsland === 2;
})());

check('edge-separated mines are two islands (no wrap)', (() => {
  const s = mines(3, 1, `*.*`);
  return s.islandCount === 2 && s.largestIsland === 1 && s.maxAdjacent === 2
    && s.zeroCount === 0;
})());

check('eight mines around a hole is max 8, one island of 8, no 7', (() => {
  const s = mines(3, 3, `
***
*.*
***
`);
  return s.maxAdjacent === 8 && s.hasSeven === false && s.zeroCount === 0
    && s.islandCount === 1 && s.largestIsland === 8;
})());

check('a 7 exists without an 8', (() => {
  const s = mines(5, 5, `
.....
.***.
.*...
.***.
.....
`);
  return s.maxAdjacent === 7 && s.hasSeven === true && s.islandCount === 1
    && s.largestIsland === 7;
})());

check('four isolated corners: 4 islands of 1, max 4', (() => {
  const s = mines(3, 3, `
*.*
...
*.*
`);
  return s.maxAdjacent === 4 && s.hasSeven === false && s.zeroCount === 0
    && s.islandCount === 4 && s.largestIsland === 1;
})());

check('rejects a mine map of the wrong length', (() => {
  let threw = false;
  try { BoardShape.of(2, 2, [true]); } catch (err) { threw = true; }
  return threw;
})());

if (failures) {
  console.log(failures + ' failed');
  process.exit(1);
}
console.log('all ok');

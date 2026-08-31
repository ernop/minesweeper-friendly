'use strict';
// Known-answer and invariant tests for zini.js (Greedy ZiNi / Human ZiNi).
// The small-board expectations were hand-simulated step by step against
// the reference algorithm's premium bookkeeping.
//
// Usage: node tests/zini-test.js

const Zini = require('../zini.js');
const Pregen = require('../pregen.js');

let failures = 0;
function check(name, condition) {
  if (condition) console.log('  ok  ' + name);
  else {
    failures++;
    console.log('FAIL  ' + name);
  }
}

function board(width, height, marks) {
  const rows = marks.trim().split('\n').map((row) => row.trim());
  if (rows.length !== height || rows.some((row) => row.length !== width)) {
    throw new Error('fixture is not ' + width + 'x' + height);
  }
  const mineAt = [];
  for (const row of rows) {
    for (const ch of row) mineAt.push(ch === '*');
  }
  return mineAt;
}

// A mine-free board is one opening: one click either way.
{
  const mineAt = board(3, 3, `
...
...
...
`);
  check('empty 3x3 zini is 1', Zini.zini(3, 3, mineAt) === 1);
  check('empty 3x3 hzini is 1', Zini.hzini(3, 3, mineAt) === 1);
}

// A corner mine leaves one opening that swallows every number: flags
// cannot beat the single opening click.
{
  const mineAt = board(3, 3, `
*..
...
...
`);
  check('corner-mine 3x3 zini is 1', Zini.zini(3, 3, mineAt) === 1);
  check('corner-mine 3x3 hzini is 1', Zini.hzini(3, 3, mineAt) === 1);
}

// 2x2 with one mine: no openings, 3BV is 3. Open one number, flag the
// mine, chord: also 3 clicks (flagging cannot help here).
{
  const mineAt = board(2, 2, `
*.
..
`);
  check('2x2 one-mine 3BV is 3', Pregen.board3BV(2, 2, mineAt) === 3);
  check('2x2 one-mine zini is 3', Zini.zini(2, 2, mineAt) === 3);
  check('2x2 one-mine hzini is 3', Zini.hzini(2, 2, mineAt) === 3);
}

// Center mine in 3x3: 3BV is 8 (every number is isolated from openings).
// Greedy: open an edge (1), flag the center (2), chord (3) revealing five
// cells, then two more chords through opened numbers (4, 5). Human ZiNi
// pays one extra chord because it cannot start from the best closed cell:
// fallback-open the first corner (1), flag+chord (2, 3), then three more
// chords (4, 5, 6).
{
  const mineAt = board(3, 3, `
...
.*.
...
`);
  check('center-mine 3x3 3BV is 8', Pregen.board3BV(3, 3, mineAt) === 8);
  check('center-mine 3x3 zini is 5', Zini.zini(3, 3, mineAt) === 5);
  check('center-mine 3x3 hzini is 6', Zini.hzini(3, 3, mineAt) === 6);
}

// Invariants on deterministic pseudo-random boards: both values are at
// least 1 and never exceed 3BV (the algorithms only ever save clicks over
// the plain no-flag solve).
{
  let seed = 0x2c9277b5;
  const rand = () => {
    // xorshift32; deterministic across runs.
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed / 0x100000000;
  };
  let checked = 0;
  for (let trial = 0; trial < 60; trial++) {
    const width = 4 + Math.floor(rand() * 12);
    const height = 4 + Math.floor(rand() * 8);
    const mines = 1 + Math.floor(rand() * (width * height * 0.25));
    const mineAt = new Array(width * height).fill(false);
    let placed = 0;
    while (placed < mines) {
      const at = Math.floor(rand() * width * height);
      if (!mineAt[at]) {
        mineAt[at] = true;
        placed++;
      }
    }
    if (mineAt.every((m) => m)) continue;
    const bv3 = Pregen.board3BV(width, height, mineAt);
    const zini = Zini.zini(width, height, mineAt);
    const hzini = Zini.hzini(width, height, mineAt);
    if (zini < 1 || zini > bv3) {
      check(`random board ${width}x${height}/${mines}: zini ${zini} within [1, ${bv3}]`, false);
    }
    if (hzini < 1 || hzini > bv3) {
      check(`random board ${width}x${height}/${mines}: hzini ${hzini} within [1, ${bv3}]`, false);
    }
    checked++;
  }
  check('random boards: 1 <= zini <= 3BV and 1 <= hzini <= 3BV (' + checked + ' boards)',
    failures === 0 && checked >= 50);
}

if (failures > 0) {
  console.error(failures + ' failure(s)');
  process.exit(1);
}
console.log('zini tests passed');

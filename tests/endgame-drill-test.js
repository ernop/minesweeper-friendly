'use strict';
// Tests for endgame.js: remaining-3BV known answers, outside-reveal closure,
// deducibility gating, and full deals through the real generator registry,
// rng, and exact solver — including seed-replay determinism.
//
// Usage: node tests/endgame-drill-test.js

const EndgameDrill = require('../endgame.js');
const Solver = require('../solver.js');
const BoardGenerators = require('../generators.js');
const GameRandom = require('../rng.js');
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

function neighborsOf(index, width, height) {
  const x = index % width;
  const y = Math.floor(index / width);
  const result = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      result.push(ny * width + nx);
    }
  }
  return result;
}

// Remaining 3BV, hand-counted: five covered numbered cells around the
// covered mine, no covered zeros -> one click each.
{
  const mineAt = board(4, 3, `
....
..*.
....
`);
  const revealed = mineAt.map((mine, i) => !mine && i % 4 < 2);
  check('numbered remnant: remaining 3BV is 5',
    EndgameDrill.remaining3BV(4, 3, mineAt, revealed) === 5);
}

// A covered zero flood opens its whole border with one click.
{
  const mineAt = board(5, 3, `
*....
.....
.....
`);
  // Only the mine's three neighbors revealed; the far right is a covered
  // zero region that floods everything else -> exactly one click.
  const revealed = new Array(15).fill(false);
  revealed[1] = true;
  revealed[5] = true;
  revealed[6] = true;
  check('zero-flood remnant: remaining 3BV is 1',
    EndgameDrill.remaining3BV(5, 3, mineAt, revealed) === 1);
}

// With nothing revealed, remaining 3BV must equal the board's plain 3BV.
{
  let seed = 0x51f15eed;
  const rand = () => {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed / 0x100000000;
  };
  let agreed = 0;
  for (let trial = 0; trial < 40; trial++) {
    const width = 4 + Math.floor(rand() * 10);
    const height = 4 + Math.floor(rand() * 8);
    const mines = 1 + Math.floor(rand() * (width * height * 0.2));
    const mineAt = new Array(width * height).fill(false);
    let placed = 0;
    while (placed < mines) {
      const at = Math.floor(rand() * width * height);
      if (!mineAt[at]) {
        mineAt[at] = true;
        placed++;
      }
    }
    const none = new Array(width * height).fill(false);
    if (EndgameDrill.remaining3BV(width, height, mineAt, none)
        === Pregen.board3BV(width, height, mineAt)) agreed++;
  }
  check('remaining 3BV of an untouched board equals plain 3BV (40 boards)',
    agreed === 40);
}

// revealOutside: safe cells outside the window revealed, closure holds
// (no revealed zero keeps a covered neighbor), mines never revealed.
{
  const mineAt = board(6, 4, `
......
..*...
......
....*.
`);
  const rect = { x0: 3, y0: 0, w: 3, h: 4 };
  const revealed = EndgameDrill.revealOutside(6, 4, mineAt, adjacentsOf(6, 4, mineAt), rect);
  let closureOk = true;
  let minesCovered = true;
  let outsideRevealed = true;
  for (let i = 0; i < revealed.length; i++) {
    if (mineAt[i] && revealed[i]) minesCovered = false;
    const x = i % 6;
    if (!mineAt[i] && x < 3 && !revealed[i]) outsideRevealed = false;
    if (revealed[i] && adjacentsOf(6, 4, mineAt)[i] === 0) {
      for (const n of neighborsOf(i, 6, 4)) {
        if (!revealed[n]) closureOk = false;
      }
    }
  }
  check('revealOutside: every safe cell outside the window is revealed', outsideRevealed);
  check('revealOutside: revealed zeros keep no covered neighbor (closure)', closureOk);
  check('revealOutside: mines stay covered', minesCovered);
}

function adjacentsOf(width, height, mineAt) {
  const adjacent = new Array(width * height).fill(0);
  for (let i = 0; i < adjacent.length; i++) {
    if (mineAt[i]) continue;
    for (const n of neighborsOf(i, width, height)) {
      if (mineAt[n]) adjacent[i]++;
    }
  }
  return adjacent;
}

// solvable(): a symmetric two-cell 50/50 must be rejected; breaking the
// symmetry with a revealed zero makes the same shape deducible.
{
  // 2x2, mine top-left, bottom row revealed: both top cells read the same,
  // so neither covered cell is provable.
  const mineAt = board(2, 2, `
*.
..
`);
  const revealed = [false, false, true, true];
  check('50/50 remnant is not deducible',
    EndgameDrill.solvable(2, 2, 1, mineAt, adjacentsOf(2, 2, mineAt), revealed,
      Solver.classifyCells) === false);
}
{
  // 3x2, mine top-left, bottom row revealed: the revealed zero at (2,1)
  // clears its neighbors, pinning the single mine onto (0,0).
  const mineAt = board(3, 2, `
*..
...
`);
  const revealed = [false, false, false, true, true, true];
  check('zero-pinned remnant is deducible',
    EndgameDrill.solvable(3, 2, 1, mineAt, adjacentsOf(3, 2, mineAt), revealed,
      Solver.classifyCells) === true);
}

// windowRect: always inside the board and flush with at least one side.
{
  const rng = GameRandom.fromSeed(GameRandom.createSeed());
  let ok = true;
  for (let i = 0; i < 200; i++) {
    const rect = EndgameDrill.windowRect(rng, 30, 16, 99);
    const inside = rect.x0 >= 0 && rect.y0 >= 0
      && rect.x0 + rect.w <= 30 && rect.y0 + rect.h <= 16;
    const flush = rect.x0 === 0 || rect.y0 === 0
      || rect.x0 + rect.w === 30 || rect.y0 + rect.h === 16;
    if (!inside || !flush) ok = false;
  }
  check('windowRect: 200 draws all inside the board and flush with a side', ok);
}

// Full deals through the real stack, on beginner and expert shapes.
function dealOpts(width, height, mines) {
  return {
    width,
    height,
    mines,
    generator: BoardGenerators.uniformGenerator(),
    place: BoardGenerators.place,
    createSeed: GameRandom.createSeed,
    randomFromSeed: GameRandom.fromSeed,
    classifyCells: Solver.classifyCells,
  };
}

function checkDeal(label, width, height, mines) {
  const deal = EndgameDrill.deal(dealOpts(width, height, mines));
  const adjacent = adjacentsOf(width, height, deal.mineAt);
  let safeLeft = 0;
  let revealedCount = 0;
  let minesCovered = true;
  let closureOk = true;
  for (let i = 0; i < deal.revealed.length; i++) {
    if (deal.revealed[i]) {
      revealedCount++;
      if (deal.mineAt[i]) minesCovered = false;
      if (adjacent[i] === 0) {
        for (const n of neighborsOf(i, width, height)) {
          if (!deal.revealed[n]) closureOk = false;
        }
      }
    } else if (!deal.mineAt[i]) safeLeft++;
  }
  check(label + ': covered safe cells within ['
    + EndgameDrill.MIN_SAFE + ', ' + EndgameDrill.MAX_SAFE + ']',
  safeLeft >= EndgameDrill.MIN_SAFE && safeLeft <= EndgameDrill.MAX_SAFE);
  check(label + ': reported safeLeft matches the map', deal.safeLeft === safeLeft);
  check(label + ': something is revealed', revealedCount > 0);
  check(label + ': mines stay covered', minesCovered);
  check(label + ': closure holds', closureOk);
  check(label + ': remaining 3BV agrees with the map',
    deal.remaining3BV === EndgameDrill.remaining3BV(
      width, height, deal.mineAt, deal.revealed));
  check(label + ': position is deducible',
    EndgameDrill.solvable(width, height, mines, deal.mineAt, adjacent,
      deal.revealed, Solver.classifyCells));
  return deal;
}

const beginnerDeal = checkDeal('beginner deal', 9, 9, 10);
checkDeal('intermediate deal', 16, 16, 40);
checkDeal('expert deal', 30, 16, 99);

// Determinism: dealing again with the accepted seed pinned reproduces the
// identical presentation (board and revealed map), so a record's seed
// replays its drill exactly.
{
  const replay = EndgameDrill.deal({
    ...dealOpts(9, 9, 10),
    createSeed: () => beginnerDeal.seed,
  });
  check('replay from the accepted seed reproduces the board',
    replay.mineAt.every((m, i) => m === beginnerDeal.mineAt[i]));
  check('replay from the accepted seed reproduces the revealed map',
    replay.revealed.every((r, i) => r === beginnerDeal.revealed[i]));
  check('replay from the accepted seed reproduces remaining 3BV',
    replay.remaining3BV === beginnerDeal.remaining3BV);
}

if (failures > 0) {
  console.error(failures + ' failure(s)');
  process.exit(1);
}
console.log('endgame drill tests passed');

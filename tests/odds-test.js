'use strict';

// Remaining-layout odds and guess scoring.
// Run: node tests/odds-test.js

const Justice = require('../justice.js');
const Odds = require('../odds.js');

let failures = 0;

function check(name, condition) {
  if (condition) console.log('  ok  ' + name);
  else {
    failures++;
    console.log('FAIL  ' + name);
  }
}

function close(a, b, eps) {
  return Math.abs(a - b) <= (eps === undefined ? 1e-9 : eps);
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
    at: (x, y) => y * width + x,
  };
}

console.log('derived clone stats');
{
  function correctness(clicks, wasted) {
    if (wasted === undefined) return undefined;
    const total = clicks + wasted;
    return total === 0 ? undefined : clicks / total;
  }
  function throughput(bv3, clicks) {
    return clicks === 0 ? undefined : bv3 / clicks;
  }
  function ios(bv3, timeSec) {
    if (!(timeSec > 1) || !(bv3 > 0)) return undefined;
    return Math.log(bv3) / Math.log(timeSec);
  }
  check('correctness 19/(19+1)', close(correctness(19, 1), 0.95));
  check('correctness absent wasted is unmeasured', correctness(19, undefined) === undefined);
  check('throughput 10/19', close(throughput(10, 19), 10 / 19));
  check('ios t<=1 is unmeasured', ios(10, 1) === undefined);
  check('ios log10/log5', close(ios(10, 5), Math.log(10) / Math.log(5)));
}

console.log('1-of-2 pocket');
{
  const board = makeBoard([
    '.*',
    '.#',
  ]);
  const a = board.at(1, 0);
  const b = board.at(1, 1);
  const odds = Odds.analyzeView(board.view);
  check('measured', odds.measured);
  check('p=1/2', close(odds.pMine[a], 0.5) && close(odds.pMine[b], 0.5));
  const guess = Odds.scoreGuess(board.view, a);
  check('life lost 0.5', close(guess.lifeLost, 0.5));
  check('needless 0', close(guess.lifeNeedless, 0));
  check('ideal risk', guess.idealRisk);
  check('perfect play (symmetric)', guess.perfectPlay);
  check('expected life 0.5', close(guess.expectedLife, 0.5));
}

console.log('1-of-3 pocket');
{
  const view = {
    width: 2,
    height: 2,
    mines: 1,
    revealed: [true, false, false, false],
    adjacent: [1, 0, 0, 0],
  };
  const odds = Odds.analyzeView(view);
  check('p=1/3', odds.unproven.length === 3
    && odds.unproven.every((cell) => close(odds.pMine[cell], 1 / 3)));
  const guess = Odds.scoreGuess(view, 1);
  check('life lost 1/3', close(guess.lifeLost, 1 / 3));
  check('needless 0', close(guess.lifeNeedless, 0));
}

console.log('needless 50/50 next to a safer sea');
{
  // Left pair is a 1-of-2. Four cells behind it are sea with one mine
  // (p=1/4). Clicking the 50/50 is legal but needless.
  const board = makeBoard([
    '..*#*',
    '..###',
  ]);
  const fifty = board.at(2, 0);
  const sea = board.at(4, 0);
  const odds = Odds.analyzeView(board.view);
  check('50/50 is 0.5', close(odds.pMine[fifty], 0.5));
  check('sea is 0.25', close(odds.pMine[sea], 0.25));
  const bad = Odds.scoreGuess(board.view, fifty);
  check('needless 0.25', close(bad.lifeNeedless, 0.25));
  check('not ideal risk', bad.idealRisk === false);
  const good = Odds.scoreGuess(board.view, sea);
  check('sea is ideal risk', good.idealRisk);
  check('sea life lost 0.25', close(good.lifeLost, 0.25));
  check('sea needless 0', close(good.lifeNeedless, 0));
}

console.log('a proven safe makes any guess needless');
{
  // Left 0 proves its covered neighbor safe. Right pair is a 50/50.
  const view = {
    width: 4,
    height: 2,
    mines: 1,
    revealed: [
      true, false, true, false,
      true, false, true, false,
    ],
    adjacent: [
      0, 0, 1, 0,
      0, 0, 1, 0,
    ],
  };
  const fifty = 3;
  const odds = Odds.analyzeView(view);
  check('proven safe is open', odds.provenSafeOpen);
  check('50/50 still 0.5', close(odds.pMine[fifty], 0.5));
  const guess = Odds.scoreGuess(view, fifty);
  check('minP is 0', close(guess.minP, 0));
  check('whole 0.5 is needless', close(guess.lifeNeedless, 0.5));
  check('not ideal', guess.idealRisk === false);
  check('not perfect', guess.perfectPlay === false);
}

console.log('proven safe is not a guess');
{
  const board = makeBoard([
    '.*',
    '.#',
  ]);
  check('already revealed is not a guess', Odds.scoreGuess(board.view, board.at(0, 0)) === null);
}

console.log('binom');
{
  check('C(5,2)=10', Odds.binom(5, 2) === 10);
  check('C(n,0)=1', Odds.binom(7, 0) === 1);
  check('C(4,5)=0', Odds.binom(4, 5) === 0);
}

if (failures > 0) {
  console.log(failures + ' failed');
  process.exit(1);
}
console.log('all passed');

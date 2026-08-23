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
  check('safer cells are returned for explanation',
    bad.bestCells.length > 0 && bad.bestCells.every((cell) => close(odds.pMine[cell], 0.25)));
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
  check('guaranteed-safe alternatives are returned',
    guess.bestCells.includes(1) && guess.bestCells.includes(5));
  check('higher modeled-life alternatives are returned',
    guess.bestExpectedCells.includes(1) && guess.bestExpectedCells.includes(5)
      && !guess.bestExpectedCells.includes(fifty));
  check('not ideal', guess.idealRisk === false);
  check('not perfect', guess.perfectPlay === false);
}

console.log('enumeration-safe is not a guess');
{
  // One mine in the 50/50 at col 2. The two cells behind it are sea
  // with zero mines left — p=0 even if proveFacts does not mark them.
  const board = makeBoard([
    '..*##',
    '..###',
  ]);
  const sea = board.at(4, 0);
  const fifty = board.at(2, 0);
  const odds = Odds.analyzeView(board.view);
  check('sea p is 0', close(odds.pMine[sea], 0));
  check('50/50 is still a guess', Odds.scoreGuess(board.view, fifty) !== null);
  check('clicking the zero-risk sea is not a guess',
    Odds.scoreGuess(board.view, sea) === null);
}

console.log('proven safe is not a guess');
{
  const board = makeBoard([
    '.*',
    '.#',
  ]);
  check('already revealed is not a guess', Odds.scoreGuess(board.view, board.at(0, 0)) === null);
}

console.log('brute-force parity: engine odds match exhaustive enumeration');
{
  // Ground truth: enumerate every mine placement consistent with the
  // view and count, per covered cell, the fraction that mine it. The
  // engine's component-plus-sea factoring must reproduce it exactly.
  function lcg(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function bruteForce(view) {
    const n = view.width * view.height;
    const covered = [];
    for (let i = 0; i < n; i++) if (!view.revealed[i]) covered.push(i);
    const mineCount = new Array(n).fill(0);
    let total = 0;
    const pick = [];
    function consistent(mineSet) {
      for (let i = 0; i < n; i++) {
        if (!view.revealed[i]) continue;
        let c = 0;
        for (const nb of Justice.neighbors(i, view.width, view.height)) {
          if (mineSet.has(nb)) c++;
        }
        if (c !== view.adjacent[i]) return false;
      }
      return true;
    }
    function rec(start, left) {
      if (left === 0) {
        if (!consistent(new Set(pick))) return;
        total++;
        for (const c of pick) mineCount[c]++;
        return;
      }
      for (let k = start; k <= covered.length - left; k++) {
        pick.push(covered[k]);
        rec(k + 1, left - 1);
        pick.pop();
      }
    }
    rec(0, view.mines);
    return { total, p: mineCount.map((c) => c / total) };
  }

  function randomView(rng, w, h, m, clicks) {
    const n = w * h;
    const mine = new Array(n).fill(false);
    const pool = [...Array(n).keys()];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (let k = 0; k < m; k++) mine[pool[k]] = true;
    const adj = mine.map((mm, i) => (mm ? 0
      : Justice.neighbors(i, w, h).filter((x) => mine[x]).length));
    const revealed = new Array(n).fill(false);
    const safes = [...Array(n).keys()].filter((i) => !mine[i]);
    for (let c = 0; c < clicks; c++) {
      const stack = [safes[Math.floor(rng() * safes.length)]];
      while (stack.length) {
        const i = stack.pop();
        if (revealed[i] || mine[i]) continue;
        revealed[i] = true;
        if (adj[i] === 0) {
          for (const nb of Justice.neighbors(i, w, h)) {
            if (!revealed[nb] && !mine[nb]) stack.push(nb);
          }
        }
      }
    }
    return { width: w, height: h, mines: m, revealed, adjacent: adj };
  }

  const rng = lcg(12345);
  let cases = 0;
  let mismatches = 0;
  for (let t = 0; t < 200; t++) {
    const w = 4 + Math.floor(rng() * 2);
    const m = 3 + Math.floor(rng() * 3);
    const view = randomView(rng, w, 4, m, 1 + Math.floor(rng() * 2));
    const truth = bruteForce(view);
    if (truth.total === 0) continue;
    const odds = Odds.analyzeView(view);
    if (!odds.measured) continue;
    cases++;
    for (let i = 0; i < view.width * view.height; i++) {
      if (view.revealed[i]) continue;
      if (Math.abs(odds.pMine[i] - truth.p[i]) > 1e-9) mismatches++;
    }
  }
  check('at least 150 random positions compared (' + cases + ')', cases >= 150);
  check('every covered-cell probability matches ground truth', mismatches === 0);
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

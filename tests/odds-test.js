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
  check('actual risk follows raw risk without protection',
    close(guess.actualP, 0.5) && close(guess.actualMinP, 0.5));
  let certificationCalls = 0;
  const certifyEntries = Justice.certifyEntries;
  Justice.certifyEntries = (...args) => {
    certificationCalls++;
    return certifyEntries(...args);
  };
  const protectedGuess = Odds.scoreGuess(board.view, a, { considerJustice: true });
  Justice.certifyEntries = certifyEntries;
  check('certified pocket reports zero actual protected risk',
    protectedGuess.justice === true
      && close(protectedGuess.actualP, 0)
      && close(protectedGuess.actualMinP, 0));
  check('protected scoring batches Justice certification once',
    certificationCalls === 1);
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

console.log('no one-ply life values when the model did not run');
{
  // Ninety-nine covered squares and no proven-safe one: too many for the
  // one-ply model, so the chosen and best values would both be bare
  // survival odds and read as a tie nobody measured.
  const board = makeBoard([
    '.#########',
    '#*########',
    '##########',
    '##########',
    '##########',
    '**********',
    '*********#',
    '##########',
    '##########',
    '##########',
  ]);
  const odds = Odds.analyzeView(board.view);
  check('no proven-safe square', !odds.provenSafeOpen);
  check('over the one-ply limit', odds.unproven.length > 40);
  const guess = Odds.scoreGuess(board.view, board.at(9, 9));
  check('the guess is still scored', guess !== null && guess.measured);
  check('life values are absent',
    guess.expectedLife === undefined && guess.bestExpectedLife === undefined
      && guess.bestExpectedCells === undefined);
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

  // One-ply expected life for the squares the model gives a number
  // lookahead: covered squares whose covered neighbors are proven or lie
  // in their own group. Ground truth groups the consistent layouts where
  // the square is safe by the number it would show; each group is exactly
  // the next position's layouts.
  function consistentLayouts(view) {
    const n = view.width * view.height;
    const covered = [];
    for (let i = 0; i < n; i++) if (!view.revealed[i]) covered.push(i);
    const mine = new Uint8Array(n);
    const layouts = [];
    function consistent() {
      for (let i = 0; i < n; i++) {
        if (!view.revealed[i]) continue;
        let c = 0;
        for (const nb of Justice.neighbors(i, view.width, view.height)) c += mine[nb];
        if (c !== view.adjacent[i]) return false;
      }
      return true;
    }
    function rec(start, left) {
      if (left === 0) {
        if (consistent()) layouts.push(mine.slice());
        return;
      }
      for (let k = start; k <= covered.length - left; k++) {
        mine[covered[k]] = 1;
        rec(k + 1, left - 1);
        mine[covered[k]] = 0;
      }
    }
    rec(0, view.mines);
    return layouts;
  }

  // The lowest risk left once `opened` shows its number: 0 when a covered
  // square is safe in every remaining layout, else the smallest mine share
  // among the undecided squares (0 when none is undecided).
  function lowestRisk(view, layouts, opened) {
    let lowest = 1;
    let undecided = false;
    for (let x = 0; x < view.width * view.height; x++) {
      if (view.revealed[x] || x === opened) continue;
      let mined = 0;
      for (const layout of layouts) mined += layout[x];
      if (mined === 0) return 0;
      if (mined < layouts.length) {
        undecided = true;
        lowest = Math.min(lowest, mined / layouts.length);
      }
    }
    return undecided ? lowest : 0;
  }

  function oneMoveLife(view, layouts, cell) {
    const byNumber = new Map();
    for (const layout of layouts) {
      if (layout[cell]) continue;
      let number = 0;
      for (const nb of Justice.neighbors(cell, view.width, view.height)) number += layout[nb];
      if (!byNumber.has(number)) byNumber.set(number, []);
      byNumber.get(number).push(layout);
    }
    let life = 0;
    for (const group of byNumber.values()) {
      life += (group.length / layouts.length) * (1 - lowestRisk(view, group, cell));
    }
    return life;
  }

  function hasNumberLookahead(view, odds, cell) {
    const structure = odds.structure;
    const componentIndex = structure.componentOfCell.get(cell);
    return componentIndex !== undefined
      && Justice.neighbors(cell, view.width, view.height).every((nb) => view.revealed[nb]
        || structure.facts.has(nb) || structure.componentOfCell.get(nb) === componentIndex);
  }

  const lifeRng = lcg(20261022);
  let lifeSquares = 0;
  let lifeMismatches = 0;
  for (let t = 0; t < 200; t++) {
    const w = 4 + Math.floor(lifeRng() * 2);
    const m = 3 + Math.floor(lifeRng() * 3);
    const view = randomView(lifeRng, w, 4, m, 1 + Math.floor(lifeRng() * 2));
    const odds = Odds.analyzeView(view);
    if (!odds.measured) continue;
    const layouts = consistentLayouts(view);
    for (const cell of odds.unproven) {
      if (!hasNumberLookahead(view, odds, cell)) continue;
      lifeSquares++;
      if (Math.abs(Odds.expectedLife(view, odds, cell) - oneMoveLife(view, layouts, cell)) > 1e-9) {
        lifeMismatches++;
      }
    }
  }
  check('at least 150 squares with a number lookahead compared (' + lifeSquares + ')',
    lifeSquares >= 150);
  check('every one-ply expected life matches ground truth (' + lifeMismatches + ' differ)',
    lifeMismatches === 0);
}

console.log('a number only a ruled-out layout would show is never scored');
{
  // 5 mines remain for the 13 covered squares at the right: 12 touch
  // numbers, whose layouts hold 4, 5, or 6 mines, and 1 touches none. Only
  // a 6-mine layout would make the square at column 12, row 7 show 5. No
  // square is proven safe, so every guess there runs the one-ply model.
  const board = makeBoard([
    '.*...*..........',
    '................',
    '........***..*..',
    '..............*.',
    '*..*.*.*........',
    '.......**.....*.',
    '....*......**.*.',
    '.....*....*.##*#',
    '*....*..*..*#*##',
    '......*....#*.#*',
    '..........*...*.',
    '.....*..........',
    '................',
    '...*.....*.*....',
    '.......*.......*',
    '...*...*.*......',
  ]);
  const odds = Odds.analyzeView(board.view);
  check('no square is proven safe', odds.measured && !odds.provenSafeOpen);
  check('13 squares are undecided', odds.unproven.length === 13);
  const scored = odds.unproven.map((cell) => Odds.scoreGuess(board.view, cell));
  check('every guess there is scored with one-ply life values',
    scored.every((guess) => guess.measured && typeof guess.expectedLife === 'number'));
}

console.log('win chances: two separate 50/50s');
{
  // Each pocket holds one mine in two squares, and opening a square of one
  // shows nothing about the other: perfect play wins 1 layout in 4.
  const board = makeBoard([
    '.*.*.',
    '.#.#.',
  ]);
  const chances = Odds.winChances(board.view, Odds.analyzeView(board.view), board.at(1, 1));
  check('every layout is listed', chances.measured && chances.layouts === 4);
  check('perfect play wins 1 of 4', chances.bestWins === 1 && chances.chosenWins === 1);
}

console.log('win chances: an early Expert position is past the work limit');
{
  // One open corner and 99 mines among 476 undecided squares.
  const rows = Array.from({ length: 16 }, (_, y) => (y >= 13 ? '*'.repeat(30)
    : y === 12 ? '*'.repeat(9) + '#'.repeat(21) : '#'.repeat(30)));
  rows[0] = '.' + rows[0].slice(1);
  const board = makeBoard(rows);
  const odds = Odds.analyzeView(board.view);
  check('the odds are measured', odds.measured === true);
  check('the chances are not computed', Odds.winChances(board.view, odds, board.at(5, 5)).measured === false);
}

console.log('win chances: parity with a brute-force game search');
{
  // The search under test opens every square all remaining layouts leave
  // safe before it guesses. The brute force plays one square at a time by
  // the game's rules, a zero opening its neighbors, so it checks that
  // shortcut as well as the counting.
  let seed = 7;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const bruteForce = (view, cell) => {
    const { width, height } = view;
    const size = width * height;
    const near = (square) => Justice.neighbors(square, width, height);
    const covered = [...Array(size).keys()].filter((square) => !view.revealed[square]);
    const layouts = [];
    const place = (from, left, chosen) => {
      if (left === 0) {
        const mine = new Uint8Array(size);
        for (const square of chosen) mine[square] = 1;
        for (let square = 0; square < size; square++) {
          if (view.revealed[square] && near(square).reduce((sum, n) => sum + mine[n], 0) !== view.adjacent[square]) return;
        }
        layouts.push(mine);
        return;
      }
      for (let k = from; k <= covered.length - left; k++) place(k + 1, left - 1, [...chosen, covered[k]]);
    };
    place(0, view.mines, []);
    const shown = (mine, square) => near(square).reduce((sum, n) => sum + mine[n], 0);
    const memo = new Map();
    const open = (ids, opened, square) => {
      const parts = new Map();
      for (const l of ids) {
        if (layouts[l][square]) continue;
        const now = new Set(opened);
        const stack = [square];
        while (stack.length > 0) {
          const at = stack.pop();
          if (now.has(at)) continue;
          now.add(at);
          if (shown(layouts[l], at) === 0) stack.push(...near(at));
        }
        const key = [...now].sort((a, b) => a - b).map((at) => at + ':' + shown(layouts[l], at)).join();
        if (!parts.has(key)) parts.set(key, { ids: [], opened: now });
        parts.get(key).ids.push(l);
      }
      let total = 0;
      for (const part of parts.values()) total += wins(part.ids, part.opened);
      return total;
    };
    const wins = (ids, opened) => {
      const key = ids.join() + '|' + [...opened].sort((a, b) => a - b).join();
      if (memo.has(key)) return memo.get(key);
      let best = null;
      for (let square = 0; square < size; square++) {
        if (opened.has(square) || ids.every((l) => layouts[l][square])) continue;
        best = Math.max(best === null ? 0 : best, open(ids, opened, square));
      }
      const result = best === null ? ids.length : best;
      memo.set(key, result);
      return result;
    };
    const all = layouts.map((_, l) => l);
    const opened = new Set([...Array(size).keys()].filter((square) => view.revealed[square]));
    return { layouts: layouts.length, bestWins: wins(all, opened), chosenWins: open(all, opened, cell) };
  };
  let compared = 0;
  let agreed = 0;
  let generated = 0;
  while (compared < 60) {
    if (++generated > 600) throw new Error('parity: too few positions within the work limit');
    const width = 3 + Math.floor(random() * 3);
    const height = 3 + Math.floor(random() * 2);
    const size = width * height;
    const mines = 1 + Math.floor(random() * Math.min(5, size - 4));
    const mine = new Array(size).fill(false);
    for (let placed = 0; placed < mines;) {
      const square = Math.floor(random() * size);
      if (!mine[square]) {
        mine[square] = true;
        placed++;
      }
    }
    const safe = [...Array(size).keys()].filter((square) => !mine[square]);
    const revealed = new Array(size).fill(false);
    for (let r = Math.floor(random() * safe.length); r > 0; r--) revealed[safe[Math.floor(random() * safe.length)]] = true;
    const covered = [...Array(size).keys()].filter((square) => !revealed[square]);
    // A guess follows the first click: some square is open.
    if (covered.length > 12 || covered.length === size) continue;
    const adjacent = mine.map((isMine, square) => (isMine ? 0
      : Justice.neighbors(square, width, height).filter((n) => mine[n]).length));
    const view = { width, height, mines, revealed, adjacent: adjacent.map((count, square) => (revealed[square] ? count : 0)) };
    const cell = covered[Math.floor(random() * covered.length)];
    const fast = Odds.winChances(view, Odds.analyzeView(view), cell);
    if (!fast.measured) continue;
    const slow = bruteForce(view, cell);
    compared++;
    if (fast.layouts === slow.layouts && fast.bestWins === slow.bestWins && fast.chosenWins === slow.chosenWins) agreed++;
  }
  check('60 small positions within the work limit agree exactly', agreed === 60);
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

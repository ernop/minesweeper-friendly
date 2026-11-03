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
  check('two layouts, each square mined in one', odds.total === 2n
    && odds.mineLayouts[a] === 1n && odds.mineLayouts[b] === 1n);
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

console.log('one-move life however many squares are covered');
{
  // Ninety-nine covered squares and no proven-safe one. The model before
  // 2026-11-02 stopped at 40 undecided squares and stored no values.
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
  check('more than 40 undecided squares', odds.unproven.length > 40);
  const guess = Odds.scoreGuess(board.view, board.at(9, 9));
  check('the guess has its one-move life and the best',
    typeof guess.expectedLife === 'number' && guess.expectedLife > 0
      && guess.expectedLife <= 1 - guess.p && guess.bestExpectedLife >= guess.expectedLife
      && guess.bestExpectedCells.length > 0);
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
    cases++;
    if (odds.total !== BigInt(truth.total)) mismatches++;
    for (let i = 0; i < view.width * view.height; i++) {
      if (view.revealed[i]) continue;
      if (odds.mineLayouts[i] !== BigInt(Math.round(truth.p[i] * truth.total))) mismatches++;
      if (Math.abs(odds.pMine[i] - truth.p[i]) > 1e-12) mismatches++;
    }
  }
  check('at least 150 random positions compared (' + cases + ')', cases >= 150);
  check('every layout count and covered-cell probability matches ground truth', mismatches === 0);

  // One-move life for every covered square. Ground truth groups the
  // consistent layouts where the square is safe by the number it would
  // show; each group is exactly the next position's layouts.
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

  // The one-move life of opening `cell`, times the layouts: per number it
  // shows, the layouts showing it minus those mining the safest other square.
  function oneMoveLifeLayouts(view, layouts, cell) {
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
      life += group.length - Math.round(lowestRisk(view, group, cell) * group.length);
    }
    return BigInt(life);
  }

  const lifeRng = lcg(20261022);
  const kinds = { 'no number touches it': 0, 'a neighbor outside its group': 0, 'every neighbor in its group': 0, 'proven safe': 0 };
  let lifeMismatches = 0;
  let bestChecked = 0;
  let bestMismatches = 0;
  for (let t = 0; t < 300; t++) {
    const w = 4 + Math.floor(lifeRng() * 2);
    const h = 4 + Math.floor(lifeRng() * 2);
    const m = 3 + Math.floor(lifeRng() * 4);
    const view = randomView(lifeRng, w, h, m, 1 + Math.floor(lifeRng() * 3));
    const layouts = consistentLayouts(view);
    if (layouts.length === 0) continue;
    const odds = Odds.analyzeView(view);
    const { structure } = odds;
    const cache = Odds.lifeCache();
    const truths = new Map();
    for (let cell = 0; cell < w * h; cell++) {
      if (view.revealed[cell] || odds.mineLayouts[cell] === odds.total) continue;
      const truth = oneMoveLifeLayouts(view, layouts, cell);
      truths.set(cell, truth);
      const group = structure.componentOfCell.get(cell);
      const covered = Justice.neighbors(cell, w, h).filter((nb) => !view.revealed[nb] && !structure.facts.has(nb));
      kinds[structure.facts.get(cell) === 2 ? 'proven safe' : group === undefined ? 'no number touches it'
        : covered.every((nb) => structure.componentOfCell.get(nb) === group)
          ? 'every neighbor in its group' : 'a neighbor outside its group']++;
      if (Odds.lifeLayouts(view, odds, cell, cache) !== truth) lifeMismatches++;
    }
    // The best value is the highest over every covered square.
    for (const clicked of odds.unproven) {
      const guess = Odds.scoreGuess(view, clicked);
      let best = -1n;
      for (const value of truths.values()) if (value > best) best = value;
      const bestCells = [...truths.keys()].filter((cell) => truths.get(cell) === best);
      bestChecked++;
      if (!close(guess.bestExpectedLife, Number(best) / layouts.length, 1e-12)
          || guess.bestExpectedCells.join() !== bestCells.join()
          || guess.perfectPlay !== (truths.get(clicked) === best)
          || !close(guess.expectedLife, Number(truths.get(clicked)) / layouts.length, 1e-12)) bestMismatches++;
    }
  }
  for (const [kind, squares] of Object.entries(kinds)) {
    check('one-move life compared on at least 100 squares where ' + kind + ' (' + squares + ')', squares >= 100);
  }
  check('every one-move life matches ground truth exactly (' + lifeMismatches + ' differ)', lifeMismatches === 0);
  check('the best value, its squares, and perfect play match ground truth on '
    + bestChecked + ' guesses (' + bestMismatches + ' differ)', bestChecked >= 300 && bestMismatches === 0);
}

console.log('a number only a ruled-out layout would show is never scored');
{
  // 5 mines remain for the 13 covered squares at the right: 12 touch
  // numbers, whose layouts hold 4, 5, or 6 mines, and 1 touches none. Only
  // a 6-mine layout would make the square at column 12, row 7 show 5. No
  // square is proven safe, so every guess there runs the one-move model.
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
  check('no square is proven safe', !odds.provenSafeOpen);
  check('13 squares are undecided', odds.unproven.length === 13);
  const scored = odds.unproven.map((cell) => Odds.scoreGuess(board.view, cell));
  check('every guess there is scored with one-move life values',
    scored.every((guess) => typeof guess.expectedLife === 'number' && guess.expectedLife <= 1 - guess.p));
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
  check('every layout is counted', chances.measured && chances.layouts === 4n);
  check('perfect play wins 1 of 4', chances.bestWins === 1n && chances.chosenWins === 1n);
}

console.log('win chances: fifteen separate 50/50s');
{
  // Two open columns keep every number to one pocket. Listing all 32,768
  // layouts of the board would pass the work limit; each pocket alone has
  // two.
  const row = (pocket) => Array.from({ length: 46 }, (_, x) => (x % 3 === 1 ? pocket : '.')).join('');
  const board = makeBoard([row('*'), row('#')]);
  const odds = Odds.analyzeView(board.view);
  check('the odds count every layout', odds.total === 32768n);
  const chances = Odds.winChances(board.view, odds, board.at(4, 1));
  check('every layout is counted', chances.measured && chances.layouts === 32768n);
  check('perfect play wins 1', chances.bestWins === 1n && chances.chosenWins === 1n);
}

console.log('win chances: an early Expert position is past the work limit');
{
  // One open corner and 99 mines among 476 undecided squares.
  const rows = Array.from({ length: 16 }, (_, y) => (y >= 13 ? '*'.repeat(30)
    : y === 12 ? '*'.repeat(9) + '#'.repeat(21) : '#'.repeat(30)));
  rows[0] = '.' + rows[0].slice(1);
  const board = makeBoard(rows);
  const odds = Odds.analyzeView(board.view);
  check('the odds count every layout', odds.total === Justice.choose(476, 99));
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
  // Separate groups of covered squares, touching at no corner.
  const coveredGroups = (view) => {
    const seen = new Set();
    let groups = 0;
    for (let square = 0; square < view.width * view.height; square++) {
      if (view.revealed[square] || seen.has(square)) continue;
      groups++;
      const stack = [square];
      while (stack.length > 0) {
        const at = stack.pop();
        if (seen.has(at)) continue;
        seen.add(at);
        for (const n of Justice.neighbors(at, view.width, view.height)) if (!view.revealed[n]) stack.push(n);
      }
    }
    return groups;
  };
  const compare = (wanted, widths, heights, maxCovered, minGroups) => {
    let compared = 0;
    let agreed = 0;
    let generated = 0;
    while (compared < wanted) {
      if (++generated > wanted * 40) throw new Error('parity: too few positions within the work limit');
      const width = widths[0] + Math.floor(random() * (widths[1] - widths[0] + 1));
      const height = heights[0] + Math.floor(random() * (heights[1] - heights[0] + 1));
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
      if (covered.length > maxCovered || covered.length === size) continue;
      const adjacent = mine.map((isMine, square) => (isMine ? 0
        : Justice.neighbors(square, width, height).filter((n) => mine[n]).length));
      const view = { width, height, mines, revealed, adjacent: adjacent.map((count, square) => (revealed[square] ? count : 0)) };
      if (coveredGroups(view) < minGroups) continue;
      const odds = Odds.analyzeView(view);
      const undecided = covered.filter((square) => !odds.structure.facts.has(square));
      if (undecided.length === 0) continue;
      const cell = undecided[Math.floor(random() * undecided.length)];
      const fast = Odds.winChances(view, odds, cell);
      if (!fast.measured) continue;
      const slow = bruteForce(view, cell);
      compared++;
      if (fast.layouts === BigInt(slow.layouts) && fast.bestWins === BigInt(slow.bestWins)
        && fast.chosenWins === BigInt(slow.chosenWins)) agreed++;
    }
    return agreed;
  };
  check('60 small positions within the work limit agree exactly', compare(60, [3, 5], [3, 4], 12, 1) === 60);
  check('40 positions with separate groups of covered squares agree exactly',
    compare(40, [5, 7], [3, 5], 12, 2) === 40);
}

console.log('odds past a double and past the old limits');
{
  const huge = Justice.choose(4000, 2000);
  check('a ratio of counts past a double\u2019s range keeps its precision',
    close(Odds.ratio(huge, huge * 3n), 1 / 3, 1e-15) && Odds.ratio(0n, huge) === 0 && Odds.ratio(huge, huge) === 1);
  // A row of numbers between two covered rows, as in justice-test: 160
  // squares in one group, far past the 22 squares the listing stopped at.
  const width = 119;
  const rows = [0, 1, 2].map((y) => Array.from({ length: width }, (_, x) =>
    (y === 1 ? '.' : (y === 0 ? x % 3 === 0 : x % 3 === 1) ? '*' : '#')).join(''));
  const board = makeBoard(rows);
  const odds = Odds.analyzeView(board.view);
  check('a 160-square group: 2^80 + 2 layouts, each undecided square mined in half',
    odds.groups.length === 1 && odds.groups[0].cells.length === 160 && odds.total === 2n ** 80n + 2n
      && odds.unproven.length === 160 && odds.unproven.every((cell) => odds.mineLayouts[cell] * 2n === odds.total));
}

if (failures > 0) {
  console.log(failures + ' failed');
  process.exit(1);
}
console.log('all passed');

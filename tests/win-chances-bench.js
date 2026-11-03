'use strict';

// Perfect play's chance to win (Odds.winChances) on the guesses of
// simulated games: how many guesses it computes within its work limit, and
// its time per guess. A measurement, not a pass/fail check.
// Run: node tests/win-chances-bench.js
//
// The simulated player opens a square the visible board proves safe while
// there is one, and otherwise guesses the lowest mine risk. A game ends at
// a win or a loss.
// The first click is the middle square, kept free of mines with its
// neighbors.

const Justice = require('../justice.js');
const Odds = require('../odds.js');

const LEVELS = [
  { name: 'Beginner', width: 9, height: 9, mines: 10, games: 400 },
  { name: 'Intermediate', width: 16, height: 16, mines: 40, games: 200 },
  { name: 'Expert', width: 30, height: 16, mines: 99, games: 150 },
];

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function playGame(level, seed, onGuess) {
  const { width, height, mines } = level;
  const random = seeded(seed);
  const size = width * height;
  const near = (square) => Justice.neighbors(square, width, height);
  const mine = new Array(size).fill(false);
  const first = Math.floor(height / 2) * width + Math.floor(width / 2);
  const kept = new Set([first, ...near(first)]);
  for (let placed = 0; placed < mines;) {
    const square = Math.floor(random() * size);
    if (!mine[square] && !kept.has(square)) {
      mine[square] = true;
      placed++;
    }
  }
  const adjacent = mine.map((_, square) => near(square).filter((n) => mine[n]).length);
  const revealed = new Array(size).fill(false);
  let openCount = 0;
  const open = (square) => {
    const stack = [square];
    while (stack.length > 0) {
      const at = stack.pop();
      if (revealed[at]) continue;
      revealed[at] = true;
      openCount++;
      if (adjacent[at] === 0) stack.push(...near(at));
    }
  };
  open(first);
  while (openCount < size - mines) {
    const view = {
      width,
      height,
      mines,
      revealed: revealed.slice(),
      adjacent: revealed.map((isOpen, square) => (isOpen ? adjacent[square] : 0)),
    };
    const safe = [...Justice.proveFacts(view, Justice.rawClues(view))]
      .find(([square, fact]) => fact === 2 && !revealed[square]);
    if (safe !== undefined) {
      open(safe[0]);
      continue;
    }
    const odds = Odds.analyzeView(view);
    let cell = -1;
    for (const square of odds.unproven) {
      if (cell === -1 || odds.mineLayouts[square] < odds.mineLayouts[cell]) cell = square;
    }
    onGuess(view, odds, cell);
    if (mine[cell]) return;
    open(cell);
  }
}

for (const level of LEVELS) {
  const times = [];
  let computed = 0;
  for (let game = 1; game <= level.games; game++) {
    playGame(level, game * 7919, (view, odds, cell) => {
      const start = process.hrtime.bigint();
      const chances = Odds.winChances(view, odds, cell);
      times.push(Number(process.hrtime.bigint() - start) / 1e6);
      if (chances.measured) computed++;
    });
  }
  times.sort((a, b) => a - b);
  const at = (q) => times[Math.min(times.length - 1, Math.floor(q * times.length))].toFixed(2);
  console.log(level.name.padEnd(13) + (computed + ' of ' + times.length + ' guesses computed').padEnd(30)
    + 'ms a guess: median ' + at(0.5) + ', 95th percentile ' + at(0.95) + ', most ' + times[times.length - 1].toFixed(2));
}

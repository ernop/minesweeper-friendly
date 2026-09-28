'use strict';
// Deterministic synthetic games for the switch-cost tests: a scripted
// flag-and-chord player on seed-built standard boards. Each game has the
// stored trace's shape (layout, left press and release, right press, cursor
// samples, and for every other game its final board) and a timing model with
// a planted switch effect. Node tests replay the games with the game's own
// code; the browser check stores them in IndexedDB.
//
// Usage as a script: node tests/switch-cost-fixture.js ROWS.jsonl
// writes the window's games as analysis/switch-cost/reference.py reads them.

const GameRandom = require('../rng.js');
const Solver = require('../solver.js');

const FIXTURE_SEED = '5c0ffee15c0ffee15c0ffee15c0ffee1';
const FIXTURE_GAMES = 80;
const UNIFORM = 'uniform-first-safe-fisher-yates-v1';
const CELL_PX = 24;
const BOARD_LEFT = 180;
const BOARD_TOP = 120;
const FIRST_ENDED_AT = Date.UTC(2026, 8, 1, 19, 0, 0);
// Timing model on log milliseconds: the planted effects the fit should find.
const PLANTED = { switch: 0.12, leftMoveChange: 0.2, fitts: 0.18, noise: 0.25 };
const BASE_MS = { chord: 200, flag: 260, reveal: 300 };
const BOARDS = [
  ['16x16/40@standard', 16, 16, 40],
  ['30x16/99@standard', 30, 16, 99],
  ['9x9/10@standard', 9, 9, 10],
  ['16x16/40@standard', 16, 16, 40],
];

function neighbours(width, height, index) {
  const x = index % width;
  const y = Math.floor(index / width);
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if ((dx || dy) && nx >= 0 && nx < width && ny >= 0 && ny < height) out.push(ny * width + nx);
    }
  }
  return out;
}

function hexSeed(random) {
  let seed = '';
  for (let i = 0; i < 4; i++) seed += Math.floor(random() * 0x100000000).toString(16).padStart(8, '0');
  return seed;
}

function gaussian(random) {
  const u = 1 - random();
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function playGame(random, gameIndex, endedAtFloor) {
  const [key, width, height, mineCount] = BOARDS[gameIndex % BOARDS.length];
  const n = width * height;
  const seed = hexSeed(random);
  const first = Math.floor(random() * n);
  const mine = Solver.randomPlacement(width, height, mineCount, first, GameRandom.fromSeed(seed));
  const around = Array.from({ length: n }, (_, i) => neighbours(width, height, i));
  const adjacent = around.map((list) => list.filter((c) => mine[c]).length);
  const revealed = new Uint8Array(n);
  const flagged = new Uint8Array(n);
  let revealedCount = 0;
  let exploded = false;
  const open = (start) => {
    const stack = [start];
    while (stack.length) {
      const i = stack.pop();
      if (revealed[i] || flagged[i]) continue;
      revealed[i] = 1;
      revealedCount++;
      if (mine[i]) { exploded = true; continue; }
      if (adjacent[i] === 0) for (const c of around[i]) if (!revealed[c]) stack.push(c);
    }
  };
  // A scroll halfway through some games moves the board under the cursor.
  const scrollAt = gameIndex % 5 === 0 ? 40 : Infinity;
  let top = BOARD_TOP;
  const layout = (t) => ({ t, kind: 'layout', left: BOARD_LEFT, top, width: CELL_PX * (width + 0.25),
    height: CELL_PX * (height + 0.25), boardWidth: width, boardHeight: height });
  const events = [layout(1)];
  const samples = [];
  const at = (index) => ({
    x: BOARD_LEFT + (0.125 + (index % width) + 0.5) * CELL_PX + Math.round((random() - 0.5) * 8),
    y: top + (0.125 + Math.floor(index / width) + 0.5) * CELL_PX + Math.round((random() - 0.5) * 8),
  });
  let t = 400 + Math.floor(random() * 300);
  let startT = null;
  let previous = null;
  let moves = 0;
  let flagsPlaced = 0;
  const act = (kind, index) => {
    const button = kind === 'flag' ? 'R' : 'L';
    if (previous !== null) {
      const dx = (index % width) - (previous.index % width);
      const dy = Math.floor(index / width) - Math.floor(previous.index / width);
      const fitts = Math.log2(1 + Math.hypot(dx, dy));
      const switched = previous.button !== button;
      const leftChange = previous.button === 'L' && button === 'L' && previous.kind !== kind
        && kind !== 'noop' && previous.kind !== 'noop';
      let gap = Math.exp(Math.log(BASE_MS[kind === 'noop' ? 'reveal' : kind]) + PLANTED.fitts * fitts
        + (switched ? PLANTED.switch : 0) + (leftChange ? PLANTED.leftMoveChange : 0)
        + PLANTED.noise * gaussian(random));
      gap = Math.max(gap, previous.releaseAfter + 12);
      t += Math.round(gap);
    }
    if (moves === scrollAt) {
      top -= 48;
      events.push(layout(t - 5));
    }
    const { x, y } = at(index);
    samples.push([t - 3, x, y]);
    const atMs = startT === null ? 0 : t - startT;
    let releaseAfter = 0;
    if (button === 'R') events.push({ t, atMs, kind: 'rdown', x, y, index });
    else {
      releaseAfter = 55 + Math.floor(random() * 35);
      events.push({ t, atMs, kind: 'ldown', x, y, index });
      events.push({ t: t + releaseAfter, atMs: atMs + releaseAfter, kind: 'lup', x, y, index });
    }
    previous = { kind, index, button, releaseAfter };
    moves++;
  };

  act('reveal', first);
  startT = t;
  open(first);
  const safeTotal = n - mineCount;
  for (let guard = 0; guard < 4 * n && !exploded && revealedCount < safeTotal; guard++) {
    const forced = [];
    const chordable = [];
    for (let r = 0; r < n; r++) {
      if (!revealed[r] || adjacent[r] === 0) continue;
      let flags = 0;
      const covered = [];
      for (const c of around[r]) {
        if (flagged[c]) flags++;
        else if (!revealed[c]) covered.push(c);
      }
      if (!covered.length) continue;
      if (flags === adjacent[r]) chordable.push([r, covered]);
      if (adjacent[r] - flags === covered.length) forced.push(...covered);
    }
    const nearest = (cells) => cells.reduce((best, c) => {
      const d = Math.hypot((c % width) - (previous.index % width), Math.floor(c / width) - Math.floor(previous.index / width));
      return best === null || d < best.d ? { c, d } : best;
    }, null).c;
    const blank = revealed.findIndex((v, i) => v && adjacent[i] === 0);
    if (blank !== -1 && random() < 0.02) {
      act('noop', blank);
    } else if (forced.length && random() < 0.85) {
      const c = nearest([...new Set(forced)]);
      act('flag', c);
      flagged[c] = 1;
      flagsPlaced++;
    } else if (chordable.length) {
      const [r, covered] = chordable.find(([cell]) => cell === nearest(chordable.map(([cell]) => cell)));
      if (random() < 0.8) {
        act('chord', r);
        for (const c of covered) open(c);
      } else {
        const c = covered[Math.floor(random() * covered.length)];
        act('reveal', c);
        open(c);
      }
    } else {
      const options = [];
      const forcedSet = new Set(forced);
      for (let i = 0; i < n; i++) if (!revealed[i] && !flagged[i] && !forcedSet.has(i)) options.push(i);
      if (!options.length) break;
      const c = options[Math.floor(random() * options.length)];
      act('reveal', c);
      open(c);
    }
  }
  const outcome = exploded ? 'loss' : 'win';
  const endT = events[events.length - 1].t;
  const endedAt = Math.max(endedAtFloor, FIRST_ENDED_AT + gameIndex * 90000) + endT + 17;
  const startedAt = endedAt - endT - 20;
  const trace = {
    endedAt, mode: key, outcome, justiceEnabled: false, seed, rngVersion: GameRandom.VERSION, boardVersion: UNIFORM,
    startedAt, events,
    sampleT: samples.map((s) => s[0]), sampleX: samples.map((s) => s[1]), sampleY: samples.map((s) => s[2]),
    ...(gameIndex % 2 === 0 ? { finalBoard: {
      cells: Array.from({ length: n }, (_, i) => ({ mine: mine[i], adjacent: adjacent[i],
        revealed: Boolean(revealed[i]), flagged: Boolean(flagged[i]) })),
      hitIndices: [],
    } } : {}),
  };
  const record = {
    endedAt, outcome, timeMs: endT - startT, bv3: Math.max(1, moves - flagsPlaced), clicks: moves,
    wastedClicks: 0, flagsPlaced, flagsRemoved: 0, mousePathPx: 0, playMode: 'standard', justiceEnabled: false,
    seed, rngVersion: GameRandom.VERSION, boardVersion: UNIFORM, actionEvaluations: [],
  };
  return { key, record, trace };
}

// Games in play order, oldest first.
function switchCostFixtureGames(count = FIXTURE_GAMES) {
  const random = GameRandom.fromSeed(FIXTURE_SEED);
  const games = [];
  let endedAtFloor = 0;
  for (let i = 0; i < count; i++) {
    const game = playGame(random, i, endedAtFloor);
    endedAtFloor = game.record.endedAt;
    games.push(game);
  }
  return games;
}

module.exports = { switchCostFixtureGames, PLANTED, FIXTURE_GAMES };

if (require.main === module) {
  const fs = require('fs');
  const TrainingCore = require('../training-core.js');
  const SwitchCost = require('../switch-cost.js');
  const deps = { training: TrainingCore, randomPlacement: Solver.randomPlacement, fromSeed: GameRandom.fromSeed,
    rngVersion: GameRandom.VERSION };
  const newestFirst = switchCostFixtureGames().reverse();
  SwitchCost.window(newestFirst, (game) => ({ endedAt: game.record.endedAt,
    rows: SwitchCost.gameRows(game.trace, game.record.outcome, SwitchCost.KEYS[game.key], deps).rows }))
    .then((games) => {
      fs.writeFileSync(process.argv[2], games.map((game) => JSON.stringify(game)).join('\n') + '\n');
      console.log('wrote', games.length, 'games');
    });
}

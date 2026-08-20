'use strict';

// Timing benchmark for the "a just universe" solver (justice.js).
// Run: node tests/justice-bench.js
//
// Simulates mid-game positions the way the game reaches them — random
// layout, first-click flood, then a number of further floods from random
// safe cells — and times a full save attempt (judge + redraw) on a random
// covered mine, exactly what one death-click costs. Random flooding
// fragments the frontier more than careful play does, so these positions
// are, if anything, harder than real ones.

const Justice = require('../justice.js');

function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function simulate(width, height, mineCount, extraFloods, rng) {
  const size = width * height;
  const first = Math.floor(rng() * size);
  const pool = shuffle([...Array(size).keys()].filter((i) => i !== first), rng);
  const mines = new Array(size).fill(false);
  for (let k = 0; k < mineCount; k++) mines[pool[k]] = true;
  const adjacent = mines.map((m, i) => (m ? 0
    : Justice.neighbors(i, width, height).filter((n) => mines[n]).length));
  const revealed = new Array(size).fill(false);
  const flood = (start) => {
    const stack = [start];
    while (stack.length > 0) {
      const i = stack.pop();
      if (revealed[i] || mines[i]) continue;
      revealed[i] = true;
      if (adjacent[i] === 0) {
        for (const n of Justice.neighbors(i, width, height)) {
          if (!revealed[n]) stack.push(n);
        }
      }
    }
  };
  flood(first);
  const safeCovered = () => {
    const options = [];
    for (let i = 0; i < size; i++) if (!revealed[i] && !mines[i]) options.push(i);
    return options;
  };
  for (let f = 0; f < extraFloods; f++) {
    const options = safeCovered();
    if (options.length === 0) break;
    flood(options[Math.floor(rng() * options.length)]);
  }
  const coveredMines = [];
  for (let i = 0; i < size; i++) if (!revealed[i] && mines[i]) coveredMines.push(i);
  if (coveredMines.length === 0) return null;
  const hit = coveredMines[Math.floor(rng() * coveredMines.length)];
  return {
    view: { width, height, mines: mineCount, revealed, adjacent },
    mines,
    hit,
  };
}

function bench(label, width, height, mineCount, floodChoices, samples) {
  const times = [];
  const nodes = [];
  let saves = 0;
  for (let t = 0; t < samples; t++) {
    const extra = floodChoices[t % floodChoices.length];
    const sim = simulate(width, height, mineCount, extra, Math.random);
    if (sim === null) continue;
    const budget = { nodes: 0, limit: 1e9 };
    const start = process.hrtime.bigint();
    const redrawn = Justice.trySave(sim.view, [sim.hit], [sim.hit],
      sim.mines.slice(), Math.random, budget);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    times.push(ms);
    nodes.push(budget.nodes);
    if (redrawn !== null) saves++;
  }
  times.sort((a, b) => a - b);
  nodes.sort((a, b) => a - b);
  const pick = (list, q) => list[Math.min(list.length - 1, Math.floor(q * list.length))];
  const mean = times.reduce((s, v) => s + v, 0) / times.length;
  console.log(label);
  console.log('  attempts ' + times.length + ', saves granted ' + saves);
  console.log('  time  ms: mean ' + mean.toFixed(3)
    + '  p95 ' + pick(times, 0.95).toFixed(3)
    + '  p99 ' + pick(times, 0.99).toFixed(3)
    + '  max ' + times[times.length - 1].toFixed(3));
  console.log('  nodes:    p95 ' + pick(nodes, 0.95)
    + '  p99 ' + pick(nodes, 0.99)
    + '  max ' + nodes[nodes.length - 1]);
}

// Early to mid game, expert.
bench('expert 30x16/99, 0-24 extra floods (early/mid game)',
  30, 16, 99, [...Array(25).keys()], 4000);
// Late game / near-endgame, expert: flood until almost everything safe is open.
bench('expert 30x16/99, 100-400 extra floods (late game)',
  30, 16, 99, [100, 200, 400], 1500);
// Big dense custom board.
bench('custom 100x100/2500, 0-40 extra floods',
  100, 100, 2500, [0, 5, 10, 20, 40], 300);
// Big sparse custom board (huge floods, long frontiers).
bench('custom 100x100/1200, 0-20 extra floods',
  100, 100, 1200, [0, 5, 10, 20], 300);

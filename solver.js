'use strict';

if (typeof Justice === 'undefined') {
  globalThis.Justice = require('./justice.js');
}

// Logical NG solver on top of Justice.proveFacts. Used to generate
// no-guess boards and to decide proof-or-die / angelic clicks.
// Grades, cheapest first: count, subset, global.

function solverNeighbors(index, width, height) {
  return Justice.neighbors(index, width, height);
}

function adjacentMap(width, height, mineAt) {
  const n = width * height;
  const adjacent = new Array(n);
  for (let i = 0; i < n; i++) {
    if (mineAt[i]) {
      adjacent[i] = 0;
      continue;
    }
    let count = 0;
    for (const nb of solverNeighbors(i, width, height)) {
      if (mineAt[nb]) count++;
    }
    adjacent[i] = count;
  }
  return adjacent;
}

function floodOpening(width, height, adjacent, mineAt, start) {
  const n = width * height;
  const revealed = new Array(n).fill(false);
  if (mineAt[start]) throw new Error('opening cell is a mine');
  const stack = [start];
  while (stack.length > 0) {
    const i = stack.pop();
    if (revealed[i] || mineAt[i]) continue;
    revealed[i] = true;
    if (adjacent[i] === 0) {
      for (const nb of solverNeighbors(i, width, height)) {
        if (!revealed[nb] && !mineAt[nb]) stack.push(nb);
      }
    }
  }
  return revealed;
}

function viewOf(width, height, mineCount, adjacent, revealed) {
  return {
    width: width,
    height: height,
    mines: mineCount,
    adjacent: adjacent,
    revealed: revealed,
  };
}

function newSafeFrom(facts, revealed) {
  const safe = [];
  facts.forEach((value, cell) => {
    if (value === 2 && !revealed[cell]) safe.push(cell);
  });
  return safe;
}

function floodFrom(width, height, adjacent, mineAt, start, already) {
  const opened = [];
  const stack = [start];
  while (stack.length > 0) {
    const i = stack.pop();
    if (mineAt[i] || already[i] || opened.includes(i)) continue;
    opened.push(i);
    if (adjacent[i] === 0) {
      for (const nb of solverNeighbors(i, width, height)) {
        if (!already[nb] && !mineAt[nb]) stack.push(nb);
      }
    }
  }
  return opened;
}

function applySafes(width, height, adjacent, mineAt, revealed, safes) {
  for (const start of safes) {
    for (const i of floodFrom(width, height, adjacent, mineAt, start, revealed)) {
      revealed[i] = true;
    }
  }
}

function oneClickCovers(width, height, adjacent, mineAt, revealed, safes) {
  if (safes.length <= 1) return true;
  for (const start of safes) {
    const opened = floodFrom(width, height, adjacent, mineAt, start, revealed);
    if (safes.every((cell) => opened.includes(cell))) return true;
  }
  return false;
}

function mineCountOf(mineAt) {
  let n = 0;
  for (let i = 0; i < mineAt.length; i++) if (mineAt[i]) n++;
  return n;
}

function analyze(width, height, mineAt, firstClick) {
  const n = width * height;
  const mines = mineCountOf(mineAt);
  const adjacent = adjacentMap(width, height, mineAt);
  const revealed = floodOpening(width, height, adjacent, mineAt, firstClick);
  const steps = [];
  const safeTarget = n - mines;

  function revealedSafe() {
    let count = 0;
    for (let i = 0; i < n; i++) if (revealed[i]) count++;
    return count;
  }

  while (revealedSafe() < safeTarget) {
    const view = viewOf(width, height, mines, adjacent, revealed);
    const clues = Justice.rawClues(view);
    let grade = null;
    let safes = [];
    const countFacts = Justice.proveFacts(view, clues, { subset: false, global: false });
    safes = newSafeFrom(countFacts, revealed);
    if (safes.length > 0) {
      grade = 'count';
    } else {
      const subsetFacts = Justice.proveFacts(view, clues, { global: false });
      safes = newSafeFrom(subsetFacts, revealed);
      if (safes.length > 0) {
        grade = 'subset';
      } else {
        const fullFacts = Justice.proveFacts(view, clues);
        safes = newSafeFrom(fullFacts, revealed);
        if (safes.length > 0) grade = 'global';
      }
    }
    if (safes.length === 0) break;
    steps.push({
      grade: grade,
      safes: safes.length,
      oneClick: oneClickCovers(width, height, adjacent, mineAt, revealed, safes),
    });
    applySafes(width, height, adjacent, mineAt, revealed, safes);
  }

  const solved = revealedSafe() === safeTarget;
  const uniform = steps.length === 0
    || steps.every((step) => step.grade === steps[0].grade);
  const singlePath = steps.every((step) => step.oneClick);
  return {
    solved: solved,
    uniform: uniform,
    singlePath: singlePath,
    steps: steps,
    opening: revealed,
    adjacent: adjacent,
  };
}

// Carve a connected safe polyomino of the right size out of an
// all-mine field, growing from the opening. Random placement almost
// never has a unique next click; a corridor often does.
function tunnelPlacement(width, height, mineCount, safeIndex, rng) {
  const n = width * height;
  const targetSafes = n - mineCount;
  if (targetSafes < 1) throw new Error('tunnel needs at least one safe cell');
  const mineAt = new Array(n).fill(true);
  mineAt[safeIndex] = false;
  const carved = new Set([safeIndex]);
  let current = safeIndex;
  while (carved.size < targetSafes) {
    let opts = solverNeighbors(current, width, height).filter((cell) => mineAt[cell]);
    if (opts.length === 0) {
      opts = [];
      carved.forEach((cell) => {
        for (const nb of solverNeighbors(cell, width, height)) {
          if (mineAt[nb]) opts.push(nb);
        }
      });
    }
    if (opts.length === 0) {
      throw new Error('tunnel placement could not carve ' + targetSafes + ' safe cells');
    }
    const next = opts[Math.floor(rng() * opts.length)];
    mineAt[next] = false;
    carved.add(next);
    current = next;
  }
  return mineAt;
}

function randomPlacement(width, height, mineCount, safeIndex, rng) {
  const n = width * height;
  const pool = [];
  for (let i = 0; i < n; i++) {
    if (i !== safeIndex) pool.push(i);
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  const mineAt = new Array(n).fill(false);
  for (let k = 0; k < mineCount; k++) mineAt[pool[k]] = true;
  return mineAt;
}

function generate(width, height, mineCount, safeIndex, rng, pred, maxAttempts, placer) {
  placer = placer || randomPlacement;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const mineAt = placer(width, height, mineCount, safeIndex, rng);
    if (mineAt[safeIndex]) continue;
    const report = analyze(width, height, mineAt, safeIndex);
    if (report.solved && pred(report)) {
      return { mineAt: mineAt, report: report, attempts: attempt };
    }
  }
  throw new Error(
    'could not generate a qualifying no-guess board in ' + maxAttempts
    + ' attempts (' + width + 'x' + height + '/' + mineCount + ')');
}

function factsFor(view) {
  return Justice.proveFacts(view, Justice.rawClues(view));
}

function isProvenSafe(view, cell) {
  return factsFor(view).get(cell) === 2;
}

function isCertainMine(view, cell) {
  return factsFor(view).get(cell) === 1;
}

function layoutAgrees(view, mines) {
  if (mineCountOf(mines) !== view.mines) return false;
  const size = view.width * view.height;
  for (let i = 0; i < size; i++) {
    if (!view.revealed[i]) continue;
    if (mines[i]) return false;
    let count = 0;
    for (const nb of solverNeighbors(i, view.width, view.height)) {
      if (mines[nb]) count++;
    }
    if (count !== view.adjacent[i]) return false;
  }
  return true;
}

// If clicked is a certain mine, return null (cannot save). Otherwise
// return a mine map with that cell clear, agreeing with every revealed
// number. Single-mine swaps cover 50/50 partners and open sea.
function forceSafe(view, mines, clicked, rng) {
  if (isCertainMine(view, clicked)) return null;
  const next = mines.slice();
  if (!next[clicked]) return next;
  const size = view.width * view.height;
  const partners = [];
  for (let i = 0; i < size; i++) {
    if (i === clicked || view.revealed[i] || next[i]) continue;
    if (isProvenSafe(view, i)) continue;
    partners.push(i);
  }
  for (let i = partners.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = partners[i];
    partners[i] = partners[j];
    partners[j] = tmp;
  }
  next[clicked] = false;
  for (const partner of partners) {
    next[partner] = true;
    if (layoutAgrees(view, next)) return next;
    next[partner] = false;
  }
  throw new Error(
    'angelic save failed: cell ' + clicked
    + ' is not a proven mine but no agreeing safe layout was found');
}

const Solver = {
  neighbors: solverNeighbors,
  adjacentMap: adjacentMap,
  floodOpening: floodOpening,
  analyze: analyze,
  randomPlacement: randomPlacement,
  tunnelPlacement: tunnelPlacement,
  generate: generate,
  isProvenSafe: isProvenSafe,
  isCertainMine: isCertainMine,
  forceSafe: forceSafe,
  layoutAgrees: layoutAgrees,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Solver;

'use strict';

if (typeof Justice === 'undefined') {
  globalThis.Justice = require('./justice.js');
}

// Board helpers and visible-fact questions on top of Justice.proveFacts:
// first-click-safe placement, angelic saves, misclick classification, and
// the cell classes the endgame drill and the game-end evaluation ask for.

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

function mineCountOf(mineAt) {
  let n = 0;
  for (let i = 0; i < mineAt.length; i++) if (mineAt[i]) n++;
  return n;
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

function factsFor(view) {
  return Justice.proveFacts(view, Justice.rawClues(view));
}

function isProvenSafe(view, cell) {
  return factsFor(view).get(cell) === 2;
}

function isCertainMine(view, cell) {
  return factsFor(view).get(cell) === 1;
}

function classifyCells(view, cells) {
  const facts = factsFor(view);
  return {
    complete: facts.complete === true,
    visits: facts.visits || 0,
    kinds: cells.map((cell) => {
      const fact = facts.get(cell);
      return fact === 1 ? 'mine' : fact === 2 ? 'safe' : 'unknown';
    }),
  };
}

// Whether a board-changing action contradicts facts provable from the
// visible board. This classifies the action, not the player's intent.
// Flags are passed as action data rather than fed into the proof system,
// because a player's mark cannot prove itself correct.
function isVisibleMisclick(view, action) {
  const facts = factsFor(view);
  if (action.kind === 'reveal') return facts.get(action.cell) === 1;
  if (action.kind === 'flag') {
    return action.removing
      ? facts.get(action.cell) === 1
      : facts.get(action.cell) === 2;
  }
  if (action.kind === 'chord') {
    return action.opened.some((cell) => facts.get(cell) === 1)
      || action.flagged.some((cell) => facts.get(cell) === 2);
  }
  throw new Error('unknown visible action kind ' + action.kind);
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
  const facts = factsFor(view);
  if (facts.get(clicked) === 1) return null;
  const next = mines.slice();
  if (!next[clicked]) return next;
  const size = view.width * view.height;
  const partners = [];
  for (let i = 0; i < size; i++) {
    if (i === clicked || view.revealed[i] || next[i]) continue;
    if (facts.get(i) === 2) continue;
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
  randomPlacement: randomPlacement,
  isProvenSafe: isProvenSafe,
  isCertainMine: isCertainMine,
  classifyCells: classifyCells,
  isVisibleMisclick: isVisibleMisclick,
  forceSafe: forceSafe,
  layoutAgrees: layoutAgrees,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Solver;

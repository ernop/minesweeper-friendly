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
    kinds: cells.map((cell) => {
      const fact = facts.get(cell);
      return fact === 1 ? 'mine' : fact === 2 ? 'safe' : 'unknown';
    }),
  };
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
// number. Single-mine swaps cover 50/50 partners and open sea. A clear
// cell needs no proof: a certain mine is a mine in the real layout too.
function forceSafe(view, mines, clicked, rng) {
  const next = mines.slice();
  if (!next[clicked]) return next;
  const facts = factsFor(view);
  if (facts.get(clicked) === 1) return null;
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
  forceSafe: forceSafe,
  layoutAgrees: layoutAgrees,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Solver;

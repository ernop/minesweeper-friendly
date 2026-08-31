'use strict';

// Endgame drill dealing: build a full board, then present it as a late-game
// position by revealing every safe cell except a remnant pocket flush with a
// board edge (real endgames finish against borders and corners). A deal is
// accepted only when the pocket keeps a modest number of covered safe cells,
// contains genuine mine tension, and is finishable by pure deduction from
// the visible numbers and the mine counter — so a drill death is always a
// reading error, never a forced guess.
//
// Everything is dependency-injected (rng, generator placement, solver), so
// the module is pure and node-testable, and a deal is replayable from its
// seed alone: the seed drives the placement AND the window-attempt sequence.

// Covered safe cells a presented position may keep. Below the minimum the
// position is a formality; above the maximum it is a midgame, not an endgame.
const ENDGAME_MIN_SAFE = 4;
const ENDGAME_MAX_SAFE = 45;

const ENDGAME_BOARD_ATTEMPTS = 120;
const ENDGAME_WINDOWS_PER_BOARD = 8;

function endgameNeighbors(index, width, height) {
  const x = index % width;
  const y = Math.floor(index / width);
  const result = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      result.push(ny * width + nx);
    }
  }
  return result;
}

function endgameAdjacents(width, height, mineAt) {
  const adjacent = new Array(width * height).fill(0);
  for (let i = 0; i < adjacent.length; i++) {
    if (mineAt[i]) continue;
    for (const n of endgameNeighbors(i, width, height)) {
      if (mineAt[n]) adjacent[i]++;
    }
  }
  return adjacent;
}

// A remnant window flush with a random board side. Its dimensions come from
// a target covered-safe budget scaled by the board's mine density, so the
// same code deals sensible pockets on beginner and expert boards alike.
function endgameWindowRect(rng, width, height, mines) {
  const density = mines / (width * height);
  const targetSafes = 6 + Math.floor(rng() * 25);
  const area = Math.max(9, Math.round(targetSafes / Math.max(0.2, 1 - density)));
  const h = Math.max(2, Math.min(height, Math.round(Math.sqrt(area))));
  const w = Math.max(2, Math.min(width, Math.round(area / h)));
  const side = Math.floor(rng() * 4);
  let x0;
  let y0;
  if (side === 0) {
    x0 = 0;
    y0 = Math.floor(rng() * (height - h + 1));
  } else if (side === 1) {
    x0 = width - w;
    y0 = Math.floor(rng() * (height - h + 1));
  } else if (side === 2) {
    y0 = 0;
    x0 = Math.floor(rng() * (width - w + 1));
  } else {
    y0 = height - h;
    x0 = Math.floor(rng() * (width - w + 1));
  }
  return { x0, y0, w, h };
}

// Reveal every safe cell outside the window, then enforce opening closure:
// a revealed zero opens all its neighbors in real play, so any zero the
// closure reaches erodes the window from outside. Returns the revealed map.
function endgameRevealOutside(width, height, mineAt, adjacent, rect) {
  const size = width * height;
  const revealed = new Array(size).fill(false);
  const stack = [];
  for (let i = 0; i < size; i++) {
    if (mineAt[i]) continue;
    const x = i % width;
    const y = Math.floor(i / width);
    const inside = x >= rect.x0 && x < rect.x0 + rect.w
      && y >= rect.y0 && y < rect.y0 + rect.h;
    if (inside) continue;
    revealed[i] = true;
    if (adjacent[i] === 0) stack.push(i);
  }
  while (stack.length > 0) {
    const i = stack.pop();
    for (const n of endgameNeighbors(i, width, height)) {
      if (revealed[n]) continue;
      // A zero's neighbors are safe by definition.
      revealed[n] = true;
      if (adjacent[n] === 0) stack.push(n);
    }
  }
  return revealed;
}

// The presented position's remaining 3BV: the minimum reveals that finish
// it. Standard 3BV restricted to covered cells — one click per covered zero
// flood (which also opens its covered border), one per covered number not
// reachable from any covered zero.
function endgameRemaining3BV(width, height, mineAt, revealed) {
  const adjacent = endgameAdjacents(width, height, mineAt);
  const size = width * height;
  const opened = new Array(size).fill(false);
  let count = 0;
  for (let i = 0; i < size; i++) {
    if (revealed[i] || mineAt[i] || opened[i] || adjacent[i] !== 0) continue;
    count++;
    const stack = [i];
    opened[i] = true;
    while (stack.length > 0) {
      const j = stack.pop();
      for (const n of endgameNeighbors(j, width, height)) {
        if (opened[n] || revealed[n] || mineAt[n]) continue;
        opened[n] = true;
        if (adjacent[n] === 0) stack.push(n);
      }
    }
  }
  for (let i = 0; i < size; i++) {
    if (!revealed[i] && !mineAt[i] && !opened[i]) count++;
  }
  return count;
}

// Whether the position is finishable by deduction alone: repeatedly reveal
// every covered safe cell the solver proves safe (with real flood-opening
// semantics) until the board is finished or no progress remains. A solver
// work-limit hit rejects the deal — unverified is as bad as unsolvable.
function endgameSolvable(width, height, mines, mineAt, adjacent, presented, classifyCells) {
  const size = width * height;
  const revealed = presented.slice();
  const reveal = (index) => {
    const stack = [index];
    while (stack.length > 0) {
      const i = stack.pop();
      if (revealed[i]) continue;
      revealed[i] = true;
      if (adjacent[i] === 0) {
        for (const n of endgameNeighbors(i, width, height)) {
          if (!revealed[n]) stack.push(n);
        }
      }
    }
  };
  for (;;) {
    const candidates = [];
    for (let i = 0; i < size; i++) {
      if (!revealed[i] && !mineAt[i]) candidates.push(i);
    }
    if (candidates.length === 0) return true;
    const view = { width, height, mines, revealed: revealed.slice(), adjacent };
    const proof = classifyCells(view, candidates);
    const safes = candidates.filter((cell, k) => proof.kinds[k] === 'safe');
    if (safes.length === 0) return false;
    for (const cell of safes) reveal(cell);
  }
}

// Deal one endgame position. opts:
//   width, height, mines  - the board configuration
//   generator             - the frozen generator spec ({id, params})
//   place                 - BoardGenerators.place
//   createSeed            - GameRandom.createSeed
//   randomFromSeed        - GameRandom.fromSeed
//   classifyCells         - Solver.classifyCells
//   boardAttempts, windowsPerBoard - optional rejection budgets
// Returns {seed, mineAt, revealed, remaining3BV, safeLeft, rect}. Throws
// when the budget produces no acceptable position (per project doctrine:
// announce and stop rather than silently degrade).
function endgameDeal(opts) {
  const { width, height, mines } = opts;
  const boardAttempts = opts.boardAttempts || ENDGAME_BOARD_ATTEMPTS;
  const windowsPerBoard = opts.windowsPerBoard || ENDGAME_WINDOWS_PER_BOARD;
  for (let attempt = 0; attempt < boardAttempts; attempt++) {
    const seed = opts.createSeed();
    const rng = opts.randomFromSeed(seed);
    const safeIndex = Math.floor(rng() * width * height);
    const mineAt = opts.place(opts.generator, width, height, mines, safeIndex, rng);
    const adjacent = endgameAdjacents(width, height, mineAt);
    for (let w = 0; w < windowsPerBoard; w++) {
      const rect = endgameWindowRect(rng, width, height, mines);
      const revealed = endgameRevealOutside(width, height, mineAt, adjacent, rect);
      let safeLeft = 0;
      let revealedCount = 0;
      let numberedSafeLeft = 0;
      for (let i = 0; i < revealed.length; i++) {
        if (revealed[i]) revealedCount++;
        else if (!mineAt[i]) {
          safeLeft++;
          if (adjacent[i] > 0) numberedSafeLeft++;
        }
      }
      if (safeLeft < ENDGAME_MIN_SAFE || safeLeft > ENDGAME_MAX_SAFE) continue;
      if (revealedCount === 0) continue;
      // Tension: a mine inside the pocket, and at least one covered safe
      // cell that touches a mine (an all-zero remnant trains nothing).
      let mineInRect = false;
      for (let y = rect.y0; y < rect.y0 + rect.h && !mineInRect; y++) {
        for (let x = rect.x0; x < rect.x0 + rect.w; x++) {
          if (mineAt[y * width + x]) { mineInRect = true; break; }
        }
      }
      if (!mineInRect || numberedSafeLeft === 0) continue;
      if (!endgameSolvable(width, height, mines, mineAt, adjacent, revealed,
        opts.classifyCells)) continue;
      return {
        seed,
        mineAt,
        revealed,
        remaining3BV: endgameRemaining3BV(width, height, mineAt, revealed),
        safeLeft,
        rect,
      };
    }
  }
  throw new Error('no deducible endgame position found in '
    + boardAttempts + ' boards \u00d7 ' + windowsPerBoard + ' windows');
}

const EndgameDrill = {
  MIN_SAFE: ENDGAME_MIN_SAFE,
  MAX_SAFE: ENDGAME_MAX_SAFE,
  deal: endgameDeal,
  remaining3BV: endgameRemaining3BV,
  revealOutside: endgameRevealOutside,
  solvable: endgameSolvable,
  windowRect: endgameWindowRect,
};

if (typeof module !== 'undefined' && module.exports) module.exports = EndgameDrill;

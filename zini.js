'use strict';

// Greedy ZiNi and Human ZiNi: the flaggers' counterparts to 3BV. Each is
// an estimate (an upper bound found by a fixed greedy strategy) of the
// clicks needed to clear the board using flags and chords — left clicks,
// flag placements, and chords all count as one click each. ZiNi may
// inspect closed cells; Human ZiNi first opens every opening and then
// only ever chords through already-open numbers, simulating a human who
// cannot see under closed cells. Both are deterministic.
//
// This is a faithful port of the original 2009 algorithm ("new benchmark:
// 3bv for flaggers", minesweepergame.com forum, Elmar Zimmermann and
// Christoph Nikolaus) as implemented in ms_toollib's zini.rs. The greedy
// scan order is part of the definition: ties in premium are broken by the
// reference's column-major cell order (down each column, columns left to
// right), so this port keeps that interior order exactly. A different
// tie-break yields a different (still valid upper-bound) number, and this
// port is meant to reproduce the reference values.
//
// The premium of a cell is the click benefit of chording it over plain
// left clicks: adjacent 3BV credit, minus the flags still needed, minus
// one for the chord, minus one more if the cell itself is still closed.

function ziniBuildCells(width, height, mineAt) {
  const cells = [];
  for (let c = 0; c < width; c++) {
    for (let r = 0; r < height; r++) {
      cells.push({
        mine: mineAt[r * width + c] === true,
        opening: 0,   // 1-based id of the opening this zero/border belongs to
        opening2: 0,  // second opening id for borders shared by two openings
        number: 0,
        opened: false,
        flagged: false,
        premium: 0,
        rb: r > 0 ? r - 1 : r,
        re: r < height - 1 ? r + 1 : r,
        cb: c > 0 ? c - 1 : c,
        ce: c < width - 1 ? c + 1 : c,
      });
    }
  }
  return cells;
}

function ziniEachNeighborhood(cells, height, index, take) {
  const cell = cells[index];
  for (let rr = cell.rb; rr <= cell.re; rr++) {
    for (let cc = cell.cb; cc <= cell.ce; cc++) {
      take(cc * height + rr);
    }
  }
}

function ziniNumber(cells, height, index) {
  let count = 0;
  ziniEachNeighborhood(cells, height, index, (i) => {
    if (cells[i].mine) count++;
  });
  return count;
}

// The 3BV credit a chord through this cell can claim: each adjacent
// non-mine cell outside any opening is one 3BV cell, and each of up to
// two adjacent openings is one 3BV click. A zero cell is itself worth 1.
function ziniAdj3bv(cells, height, index) {
  if (cells[index].number === 0) return 1;
  let credit = 0;
  ziniEachNeighborhood(cells, height, index, (i) => {
    if (!cells[i].mine && cells[i].opening === 0) credit++;
  });
  if (cells[index].opening !== 0) credit++;
  if (cells[index].opening2 !== 0) credit++;
  return credit;
}

function ziniSetOpeningBorder(cells, opId, index) {
  if (cells[index].opening === 0) {
    cells[index].opening = opId;
  } else if (cells[index].opening !== opId && cells[index].opening2 === 0) {
    cells[index].opening2 = opId;
  }
}

// Iterative flood (the reference recurses; deep recursion would overflow
// on large open boards). Visit order within one opening cannot change any
// assignment: every call within a flood carries the same opening id.
function ziniProcessOpening(cells, height, opId, start) {
  const stack = [start];
  cells[start].opening = opId;
  while (stack.length > 0) {
    const index = stack.pop();
    ziniEachNeighborhood(cells, height, index, (i) => {
      if (cells[i].number !== 0) {
        ziniSetOpeningBorder(cells, opId, i);
      } else if (cells[i].opening === 0) {
        cells[i].opening = opId;
        stack.push(i);
      }
    });
  }
}

function ziniInitBoard(cells, height) {
  for (let i = 0; i < cells.length; i++) {
    cells[i].number = ziniNumber(cells, height, i);
    cells[i].premium = -cells[i].number - 2;
  }
  let openings = 0;
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i].mine && cells[i].number === 0 && cells[i].opening === 0) {
      openings++;
      ziniProcessOpening(cells, height, openings, i);
    }
  }
  for (let i = 0; i < cells.length; i++) {
    cells[i].premium += ziniAdj3bv(cells, height, i);
  }
}

function ziniOpen(state, index) {
  const { cells, height } = state;
  cells[index].opened = true;
  cells[index].premium += 1;
  if (cells[index].opening === 0) {
    ziniEachNeighborhood(cells, height, index, (i) => {
      cells[i].premium -= 1;
    });
  }
  state.closedCells--;
}

function ziniReveal(state, index) {
  const { cells } = state;
  if (cells[index].opened || cells[index].flagged) return;
  if (cells[index].number !== 0) {
    ziniOpen(state, index);
  } else {
    const op = cells[index].opening;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].opening2 === op || cells[i].opening === op) {
        if (!cells[i].opened) ziniOpen(state, i);
        cells[i].premium -= 1;
      }
    }
  }
}

function ziniClick(state, index) {
  ziniReveal(state, index);
  state.zini++;
}

function ziniFlag(state, index) {
  const { cells, height } = state;
  if (cells[index].flagged) return;
  state.zini++;
  cells[index].flagged = true;
  ziniEachNeighborhood(cells, height, index, (i) => {
    cells[i].premium += 1;
  });
}

function ziniFlagAround(state, index) {
  const { cells, height } = state;
  ziniEachNeighborhood(cells, height, index, (i) => {
    if (cells[i].mine) ziniFlag(state, i);
  });
}

function ziniChord(state, index) {
  state.zini++;
  ziniEachNeighborhood(state.cells, state.height, index, (i) => {
    ziniReveal(state, i);
  });
}

// Human ZiNi's fixed first phase: open every opening (one click each; the
// first click of an opening reveals the rest of it, so later zeros of the
// same opening are already open when the scan reaches them).
function ziniHitOpenings(state) {
  const { cells } = state;
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i].mine && cells[i].number === 0 && !cells[i].opened) {
      ziniClick(state, i);
    }
  }
}

// One greedy step: chord the best non-negative-premium cell (opening and
// flagging it as needed), or fall back to plain-clicking the first closed
// safe cell that is a zero or outside every opening. Returns false when
// nothing remains to do.
function ziniStep(state, human) {
  const { cells } = state;
  let maxPremium = -1;
  let chosen = -1;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].premium > maxPremium && !cells[i].mine
        && (cells[i].opened || !human)) {
      maxPremium = cells[i].premium;
      chosen = i;
    }
  }
  if (chosen >= 0) {
    if (!cells[chosen].opened) ziniClick(state, chosen);
    ziniFlagAround(state, chosen);
    ziniChord(state, chosen);
    return true;
  }
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i].opened && !cells[i].mine
        && (cells[i].number === 0 || cells[i].opening === 0)) {
      ziniClick(state, i);
      return true;
    }
  }
  return false;
}

function ziniRun(width, height, mineAt, human, hitOpenings) {
  const cells = ziniBuildCells(width, height, mineAt);
  ziniInitBoard(cells, height);
  let mines = 0;
  for (const cell of cells) {
    if (cell.mine) mines++;
  }
  const state = { cells, height, zini: 0, closedCells: cells.length };
  if (hitOpenings) ziniHitOpenings(state);
  while (state.closedCells > mines) {
    if (!ziniStep(state, human)) break;
  }
  return state.zini;
}

// mineAt is row-major (index = row * width + col), matching the rest of
// this project; the column-major reference order lives only inside.
const Zini = {
  zini: (width, height, mineAt) => ziniRun(width, height, mineAt, false, false),
  hzini: (width, height, mineAt) => ziniRun(width, height, mineAt, true, true),
};

if (typeof module !== 'undefined' && module.exports) module.exports = Zini;

'use strict';

//-------A JUST UNIVERSE: THE SOLVER (pure logic, no DOM, no game state)-------
//
// Decided 2026-08-20 (PRODUCT.md "A just universe"). The mode's principle:
// the player can lose to their own choices and to the field's diffuse odds,
// but never to a coin the universe minted specifically for them. A "named
// coin" is a sealed region: a set of covered cells with two or more
// consistent mine arrangements that NO strategy could ever tell apart —
// no revealed number distinguishes them, no revealable cell ever could,
// and the region's mine total is the same in every arrangement (so global
// mine counting is blind to it too). Winning requires clearing the safe
// cells inside such a region, so every winning line must eventually click
// into it blind: the coin is unavoidable, and in a just universe it always
// lands well — provided the player took the region's best odds.
//
// Everything here works on a *view* of the board — exactly what the player
// can see and nothing more:
//   { width, height, mines, revealed: bool[], adjacent: int[] }
// (adjacent is meaningful only on revealed cells). Flags are deliberately
// invisible: they are annotations, not information.
//
// Every decision is an exact integer fact (a solution count is zero or it
// isn't); there is no floating point and no probability weighting anywhere.
// The enumeration is exact and budgeted in nodes; exceeding the budget is
// treated as a bug (announce and throw — see agents.md for the measured
// headroom), never as a silent behavioral fallback.

function justiceNeighbors(index, width, height) {
  const x = index % width;
  const y = (index - x) / width;
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

// The constraint picture of a view: clues (revealed numbers with covered
// neighbors), the frontier (covered cells under at least one clue) split
// into connected components (cells sharing a clue), and the sea (covered
// cells no clue touches; a revealed zero always floods, so no revealed
// cell is ever adjacent to a sea cell).
function buildStructure(view) {
  const size = view.width * view.height;
  const clues = [];
  const cluesOfCell = new Map(); // covered cell -> [clue index]
  for (let i = 0; i < size; i++) {
    if (!view.revealed[i]) continue;
    const covered = justiceNeighbors(i, view.width, view.height)
      .filter((n) => !view.revealed[n]);
    if (covered.length === 0) continue;
    const clueIndex = clues.length;
    clues.push({ covered, count: view.adjacent[i] });
    for (const c of covered) {
      if (!cluesOfCell.has(c)) cluesOfCell.set(c, []);
      cluesOfCell.get(c).push(clueIndex);
    }
  }

  // Components over frontier cells: connected through shared clues.
  const componentOfCell = new Map();
  const components = [];
  for (const start of cluesOfCell.keys()) {
    if (componentOfCell.has(start)) continue;
    const cellList = [];
    const clueSet = new Set();
    const queue = [start];
    componentOfCell.set(start, components.length);
    while (queue.length > 0) {
      const cell = queue.pop();
      cellList.push(cell);
      for (const ci of cluesOfCell.get(cell)) {
        if (clueSet.has(ci)) continue;
        clueSet.add(ci);
        for (const other of clues[ci].covered) {
          if (componentOfCell.has(other)) continue;
          componentOfCell.set(other, components.length);
          queue.push(other);
        }
      }
    }
    const localOf = new Map();
    cellList.forEach((cell, li) => localOf.set(cell, li));
    components.push({ cells: cellList, localOf, clues: [...clueSet] });
  }

  const seaCells = [];
  for (let i = 0; i < size; i++) {
    if (!view.revealed[i] && !componentOfCell.has(i)) seaCells.push(i);
  }
  const seaSet = new Set(seaCells);

  // Frontier cells adjacent to at least one sea cell: the only cells whose
  // future reveal could ever inform the sea (revealed cells never touch it).
  const frontierNextToSea = [];
  for (const cell of cluesOfCell.keys()) {
    if (justiceNeighbors(cell, view.width, view.height).some((n) => seaSet.has(n))) {
      frontierNextToSea.push(cell);
    }
  }

  return { view, clues, cluesOfCell, components, componentOfCell, seaCells, seaSet, frontierNextToSea };
}

// Exact backtracking enumeration of one component's consistent mine
// assignments, with constraint propagation. pins (cell -> 0|1) force
// values before the search (used for conditioned redraws and existence
// queries). onSolution(assign, comp) is called per solution with the local
// Int8Array (index into comp.cells); returning false stops the search.
// budget = { nodes, limit } is shared across calls and counts search-tree
// nodes; exceeding it throws.
function enumerateComponent(structure, comp, pins, onSolution, budget) {
  const clues = structure.clues;
  const n = comp.cells.length;
  const localClues = comp.clues.map((ci) => ({
    vars: clues[ci].covered.map((cell) => comp.localOf.get(cell)),
    need: clues[ci].count,
  }));
  const cluesOfVar = [];
  for (let v = 0; v < n; v++) cluesOfVar.push([]);
  localClues.forEach((c, li) => {
    for (const v of c.vars) cluesOfVar[v].push(li);
  });

  const assign = new Int8Array(n).fill(-1);
  const mines = new Int32Array(localClues.length);
  const done = new Int32Array(localClues.length);
  const trail = [];

  // Returns false on an immediate contradiction.
  const set = (v, val) => {
    assign[v] = val;
    trail.push(v);
    for (const li of cluesOfVar[v]) {
      done[li]++;
      if (val === 1) mines[li]++;
      const c = localClues[li];
      if (mines[li] > c.need) return false;
      if (c.need - mines[li] > c.vars.length - done[li]) return false;
    }
    return true;
  };

  const undoTo = (mark) => {
    while (trail.length > mark) {
      const v = trail.pop();
      for (const li of cluesOfVar[v]) {
        done[li]--;
        if (assign[v] === 1) mines[li]--;
      }
      assign[v] = -1;
    }
  };

  // Fixpoint pass: a clue whose remaining need is 0 clears its unassigned
  // cells; one whose need equals its remaining cells mines them.
  const propagate = () => {
    let changed = true;
    while (changed) {
      changed = false;
      for (let li = 0; li < localClues.length; li++) {
        const c = localClues[li];
        const remaining = c.vars.length - done[li];
        if (remaining === 0) continue;
        const needLeft = c.need - mines[li];
        if (needLeft !== 0 && needLeft !== remaining) continue;
        const val = needLeft === 0 ? 0 : 1;
        for (const v of c.vars) {
          if (assign[v] === -1 && !set(v, val)) return false;
        }
        changed = true;
      }
    }
    return true;
  };

  // Branch on a cell from the tightest unfinished clue.
  const chooseVar = () => {
    let best = -1;
    let bestRemaining = Infinity;
    for (let li = 0; li < localClues.length; li++) {
      const c = localClues[li];
      const remaining = c.vars.length - done[li];
      if (remaining === 0 || remaining >= bestRemaining) continue;
      bestRemaining = remaining;
      for (const v of c.vars) {
        if (assign[v] === -1) { best = v; break; }
      }
    }
    return best;
  };

  let stopped = false;
  const dfs = () => {
    budget.nodes++;
    if (budget.nodes > budget.limit) {
      throw new Error('node budget exceeded (' + budget.limit + ') — see agents.md "A just universe"');
    }
    if (trail.length === n) {
      if (onSolution(assign, comp) === false) stopped = true;
      return;
    }
    const v = chooseVar();
    for (const val of [0, 1]) {
      const mark = trail.length;
      if (set(v, val) && propagate()) dfs();
      undoTo(mark);
      if (stopped) return;
    }
  };

  let feasible = true;
  if (pins !== null) {
    for (const [cell, val] of pins) {
      const v = comp.localOf.get(cell);
      if (v === undefined) continue;
      if (assign[v] !== -1) {
        if (assign[v] !== val) { feasible = false; break; }
        continue;
      }
      if (!set(v, val)) { feasible = false; break; }
    }
  }
  if (feasible && propagate()) dfs();
  undoTo(0);
}

// Full report on one component, streaming over its solutions:
// - totalsFixed: every solution has the same mine total (checked first and
//   aborted on the first counterexample — an open region disqualifies
//   itself almost immediately, so only genuinely sealed regions ever pay
//   for a complete enumeration);
// - solutionCount and per-cell mine counts (exact integers);
// - externals: for each covered cell OUTSIDE the component that touches it,
//   whether the number it would show contributions from this component is
//   the same in every solution (constant = revealing it could never
//   distinguish the arrangements).
function componentReport(structure, comp, budget) {
  const view = structure.view;
  const inComp = new Set(comp.cells);
  const externals = [];
  const externalIndex = new Map();
  comp.cells.forEach((cell, li) => {
    for (const nb of justiceNeighbors(cell, view.width, view.height)) {
      if (view.revealed[nb] || inComp.has(nb)) continue;
      if (!externalIndex.has(nb)) {
        externalIndex.set(nb, externals.length);
        externals.push({ cell: nb, members: [], sum: -1, constant: true });
      }
      externals[externalIndex.get(nb)].members.push(li);
    }
  });

  const report = {
    solutionCount: 0,
    total: -1,
    totalsFixed: true,
    mineCounts: new Int32Array(comp.cells.length),
    externals,
  };
  enumerateComponent(structure, comp, null, (assign) => {
    let total = 0;
    for (let i = 0; i < assign.length; i++) total += assign[i];
    if (report.solutionCount === 0) {
      report.total = total;
    } else if (total !== report.total) {
      report.totalsFixed = false;
      return false; // open region; nothing else about it matters
    }
    report.solutionCount++;
    for (let i = 0; i < assign.length; i++) {
      if (assign[i] === 1) report.mineCounts[i]++;
    }
    for (const e of externals) {
      let s = 0;
      for (const li of e.members) s += assign[li];
      if (report.solutionCount === 1) e.sum = s;
      else if (s !== e.sum) e.constant = false;
    }
    return true;
  }, budget);
  if (report.solutionCount === 0) {
    // The witness layout satisfies every clue, so an inconsistent view is
    // impossible unless the caller (or this solver) has a bug.
    throw new Error('component has no consistent arrangement — the view is corrupt');
  }
  return report;
}

// One existence query: is there any consistent arrangement of this cell's
// component with the cell clear? (false = the cell is a certain mine and
// can never be revealed). Aborts on the first witness.
function existsClearArrangement(structure, comp, cell, budget) {
  let found = false;
  enumerateComponent(structure, comp, new Map([[cell, 0]]), () => {
    found = true;
    return false;
  }, budget);
  return found;
}

// The judge and the redraw. hits are the covered mine cells the player's
// action would open; reveals is every covered cell the action opens (for a
// chord that is the whole set, and the redraw must leave all of them
// clear). currentMines is the witness layout. Returns the redrawn mine
// layout (boolean per cell) when every hit is a named coin taken at its
// best odds, or null when the death is deserved and must stand.
// budget = { nodes: 0, limit } counts search nodes across the whole attempt
// (the caller can read nodes back).
function trySave(view, hits, reveals, currentMines, random, budget) {
  if (hits.length === 0) throw new Error('trySave called with no mine hits');
  const structure = buildStructure(view);
  const reports = new Map();
  const reportOf = (ci) => {
    if (!reports.has(ci)) reports.set(ci, componentReport(structure, structure.components[ci], budget));
    return reports.get(ci);
  };

  // A covered cell is a certain mine when its own region admits no
  // arrangement with it clear; such a cell can never be revealed, so it
  // can never leak information.
  let seaTotalsChecked = false;
  let seaCount = -1; // fixed sea mine count, valid once computed
  const computeSeaCount = () => {
    if (seaTotalsChecked) return seaCount;
    seaTotalsChecked = true;
    let frontierMines = 0;
    for (let ci = 0; ci < structure.components.length; ci++) {
      const r = reportOf(ci);
      if (!r.totalsFixed) { seaCount = -1; return seaCount; }
      frontierMines += r.total;
    }
    seaCount = view.mines - frontierMines;
    return seaCount;
  };
  const isCertainMine = (cell) => {
    const ci = structure.componentOfCell.get(cell);
    if (ci !== undefined) {
      if (reports.has(ci) && reports.get(ci).totalsFixed) {
        const r = reports.get(ci);
        return r.mineCounts[structure.components[ci].localOf.get(cell)] === r.solutionCount;
      }
      return !existsClearArrangement(structure, structure.components[ci], cell, budget);
    }
    // A sea cell is a certain mine only when the whole remaining sea is.
    const k = computeSeaCount();
    return k !== -1 && k === structure.seaCells.length;
  };

  // Judge every hit; collect one redraw plan per touched region.
  const componentPlans = new Set(); // component indices
  let seaPlan = false;
  for (const hit of hits) {
    const ci = structure.componentOfCell.get(hit);
    if (ci !== undefined) {
      const comp = structure.components[ci];
      const r = reportOf(ci);
      // Sealed region test (the σ-closure conditions):
      // (1) one fixed mine total, at least two arrangements;
      if (!r.totalsFixed || r.solutionCount < 2) return null;
      // (2) no certain-safe cell inside — free knowledge remains there,
      //     so the region is not yet an atomic coin;
      for (let i = 0; i < comp.cells.length; i++) {
        if (r.mineCounts[i] === 0) return null;
      }
      // (3) no outside covered cell whose reveal could ever distinguish
      //     the arrangements (varying contribution + not a certain mine);
      for (const e of r.externals) {
        if (!e.constant && !isCertainMine(e.cell)) return null;
      }
      // (4) the player took the region's best odds (ties included).
      const my = r.mineCounts[comp.localOf.get(hit)];
      for (let i = 0; i < comp.cells.length; i++) {
        if (r.mineCounts[i] < my) return null;
      }
      componentPlans.add(ci);
    } else {
      // A sea death is a named coin only for a sealed remnant: every
      // frontier region has a fixed total (so the sea's count is pinned),
      // the count leaves genuine ambiguity, and no revealable cell borders
      // the sea. All sea cells share the same odds, so best-odds is automatic.
      const k = computeSeaCount();
      if (k === -1) return null;
      if (!(k > 0 && k < structure.seaCells.length)) return null;
      for (const f of structure.frontierNextToSea) {
        if (!isCertainMine(f)) return null;
      }
      seaPlan = true;
    }
  }

  // Redraw: resample only the touched regions, conditioned on every opened
  // cell being clear. A sealed region's fixed total makes its arrangement
  // independent of the rest of the board, so leaving everything else at
  // the witness layout IS the exact conditional distribution.
  const result = currentMines.slice();
  const revealSet = new Set(reveals);
  for (const ci of componentPlans) {
    const comp = structure.components[ci];
    const pins = new Map();
    for (const cell of comp.cells) {
      if (revealSet.has(cell)) pins.set(cell, 0);
    }
    let count = 0;
    let kept = null;
    enumerateComponent(structure, comp, pins, (assign) => {
      count++;
      if (random() < 1 / count) kept = Int8Array.from(assign); // reservoir: uniform
      return true;
    }, budget);
    if (count === 0) return null; // e.g. a chord that opens a whole pair
    comp.cells.forEach((cell, li) => { result[cell] = kept[li] === 1; });
  }
  if (seaPlan) {
    const k = computeSeaCount();
    const pool = structure.seaCells.filter((cell) => !revealSet.has(cell));
    if (k > pool.length) return null;
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (const cell of structure.seaCells) result[cell] = false;
    for (let i = 0; i < k; i++) result[pool[i]] = true;
  }

  // The redraw preserves the mine total by construction; anything else is
  // a bug and must not reach the board.
  let total = 0;
  for (const m of result) if (m) total++;
  if (total !== view.mines) throw new Error('redraw changed the mine total');
  return result;
}

const Justice = {
  neighbors: justiceNeighbors,
  buildStructure,
  enumerateComponent,
  componentReport,
  trySave,
  // Search-node budget per save attempt. Measured headroom: the benchmark
  // (tests/justice-bench.js) puts the worst observed attempt at under 2e5
  // nodes on expert and dense 100x100 boards; this limit sits ~100x above
  // that. Exceeding it is a bug (announce and throw), not a fallback.
  NODE_BUDGET: 2e7,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Justice;

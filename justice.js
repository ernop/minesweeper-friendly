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
// The pipeline is deduce → decompose → decide, and every step is
// deterministic logic:
//
// 1. DEDUCE (proveFacts): plain counting plus subset subtraction — the
//    classic solver tiers (a) and (b) of agents.md — iterated to a
//    fixpoint. Sound and polynomial; no search. This proves most frontier
//    cells to be mines or safe.
// 2. DECOMPOSE (buildStructure): substitute the proven facts into the
//    clues and split the remaining unknowns into *ambiguity islands*
//    (connected through shared residual clues). Proven cells cut the
//    constraint graph apart, so islands are small — a sealed 50/50 pair
//    is a 2-cell island; an early corner "1" is a 3-cell island.
// 3. DECIDE (trySave): the exact sealed-region test runs only on the
//    hit's island, and it is witness-anchored: the current mine layout is
//    itself one consistent arrangement, so the enumeration only has to
//    answer "does any arrangement disagree with the witness about
//    anything a player could ever observe?" — an open island volunteers a
//    disagreeing arrangement within its first few solutions, and only
//    genuinely sealed islands (tiny by nature) enumerate in full.
//
// Every decision is an exact integer fact (an arrangement exists or it
// doesn't); there is no floating point, no sampling, and no probability
// weighting anywhere. Search work is budgeted (one unit per cell
// assignment); exceeding the budget is treated as a bug (announce and
// throw — see agents.md for the measured headroom), never as a silent
// behavioral fallback.

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

// Raw clues of a view: one constraint per revealed number that still has
// covered neighbors. All mines are covered, so each clue says exactly
// "this many mines among these covered cells".
function rawClues(view) {
  const size = view.width * view.height;
  const clues = [];
  for (let i = 0; i < size; i++) {
    if (!view.revealed[i]) continue;
    const covered = justiceNeighbors(i, view.width, view.height)
      .filter((n) => !view.revealed[n]);
    if (covered.length === 0) continue;
    clues.push({ covered, count: view.adjacent[i] });
  }
  return clues;
}

//-------STEP 1: DEDUCE-------

// Sound deterministic deduction to a fixpoint. Returns Map(cell -> 1 mine
// | 2 safe); absent = genuinely ambiguous to these rules. Rules:
// (a) counting: a residual clue needing 0 clears its cells; one needing
//     all of them mines them;
// (b) subset subtraction: when one residual clue's cells are a subset of
//     another's, the difference is a derived clue (this yields the classic
//     1-1 and 1-2 pattern deductions).
// Incompleteness here never affects correctness — the exact island
// enumeration is the truth — it only affects how finely step 2 fragments.
function proveFacts(view, clues) {
  const status = new Map();
  let changed = true;
  while (changed) {
    changed = false;
    const residuals = [];
    for (const clue of clues) {
      const unknown = [];
      let need = clue.count;
      for (const cell of clue.covered) {
        const s = status.get(cell);
        if (s === 1) need--;
        else if (s !== 2) unknown.push(cell);
      }
      if (unknown.length === 0) continue;
      residuals.push({ unknown, need, set: new Set(unknown) });
    }
    const mark = (cell, s) => {
      if (!status.has(cell)) {
        status.set(cell, s);
        changed = true;
      }
    };
    for (const r of residuals) {
      if (r.need === 0) for (const c of r.unknown) mark(c, 2);
      else if (r.need === r.unknown.length) for (const c of r.unknown) mark(c, 1);
    }
    // Re-run the cheap rule to a fixpoint before paying for the pairwise one.
    if (changed) continue;
    for (let i = 0; i < residuals.length && !changed; i++) {
      for (let j = 0; j < residuals.length && !changed; j++) {
        if (i === j) continue;
        const small = residuals[i];
        const large = residuals[j];
        if (small.unknown.length >= large.unknown.length) continue;
        if (!small.unknown.every((c) => large.set.has(c))) continue;
        const diff = large.unknown.filter((c) => !small.set.has(c));
        const need = large.need - small.need;
        if (need === 0) for (const c of diff) mark(c, 2);
        else if (need === diff.length) for (const c of diff) mark(c, 1);
      }
    }
  }
  return status;
}

//-------STEP 2: DECOMPOSE-------

// The residual constraint picture: proven facts substituted into the
// clues, ambiguity islands (unknown frontier cells connected through
// shared residual clues), and the sea (covered cells no clue touches; a
// revealed zero always floods, so no revealed cell ever borders the sea —
// facts only ever cover clue-touched cells, so sea cells are never proven).
function buildStructure(view) {
  const size = view.width * view.height;
  const facts = proveFacts(view, rawClues(view));

  // Residual clues over unknown cells only.
  const clues = [];
  const cluesOfCell = new Map(); // unknown frontier cell -> [clue index]
  const frontierSet = new Set(); // every covered cell touched by any clue
  for (const raw of rawClues(view)) {
    const unknown = [];
    let need = raw.count;
    for (const cell of raw.covered) {
      frontierSet.add(cell);
      const s = facts.get(cell);
      if (s === 1) need--;
      else if (s !== 2) unknown.push(cell);
    }
    if (unknown.length === 0) continue;
    const clueIndex = clues.length;
    clues.push({ covered: unknown, count: need });
    for (const c of unknown) {
      if (!cluesOfCell.has(c)) cluesOfCell.set(c, []);
      cluesOfCell.get(c).push(clueIndex);
    }
  }

  // Islands: connected components of unknown cells through shared clues.
  const islandOfCell = new Map();
  const islands = [];
  for (const start of cluesOfCell.keys()) {
    if (islandOfCell.has(start)) continue;
    const cellList = [];
    const clueSet = new Set();
    const queue = [start];
    islandOfCell.set(start, islands.length);
    while (queue.length > 0) {
      const cell = queue.pop();
      cellList.push(cell);
      for (const ci of cluesOfCell.get(cell)) {
        if (clueSet.has(ci)) continue;
        clueSet.add(ci);
        for (const other of clues[ci].covered) {
          if (islandOfCell.has(other)) continue;
          islandOfCell.set(other, islands.length);
          queue.push(other);
        }
      }
    }
    const localOf = new Map();
    cellList.forEach((cell, li) => localOf.set(cell, li));
    islands.push({ cells: cellList, localOf, clues: [...clueSet] });
  }

  const seaCells = [];
  for (let i = 0; i < size; i++) {
    if (!view.revealed[i] && !frontierSet.has(i)) seaCells.push(i);
  }
  const seaSet = new Set(seaCells);

  // Covered non-sea cells bordering the sea: the only cells whose future
  // reveal could ever inform the sea (revealed cells never touch it).
  const seaGuards = [];
  const guardSeen = new Set();
  for (const cell of frontierSet) {
    if (guardSeen.has(cell)) continue;
    if (justiceNeighbors(cell, view.width, view.height).some((n) => seaSet.has(n))) {
      guardSeen.add(cell);
      seaGuards.push(cell);
    }
  }

  let provenMineCount = 0;
  for (const s of facts.values()) if (s === 1) provenMineCount++;

  return {
    view, facts, clues, cluesOfCell, islands, islandOfCell,
    frontierSet, seaCells, seaSet, seaGuards, provenMineCount,
  };
}

//-------EXACT SEARCH OVER ONE ISLAND-------

// Exact backtracking search over one island's consistent mine
// assignments, with constraint propagation. Options:
//   pins        Map(cell -> 0|1): values forced before the search
//   onSolution  (assign, island) per solution; return false to stop
//   mineFirst   try 1 before 0 at branch points (default 0 first)
//   prune       optional (minesSoFar, lowerBoundExtra, upperBoundExtra) ->
//               bool; called at each node with admissible bounds on the
//               mines still to come; return true to cut the branch
// budget = { nodes, limit } counts one unit per cell assignment (so it
// tracks real work, not just branch points) and is shared across calls;
// exceeding it throws.
function islandSearch(structure, island, options, budget) {
  const clues = structure.clues;
  const n = island.cells.length;
  const localClues = island.clues.map((ci) => ({
    vars: clues[ci].covered.map((cell) => island.localOf.get(cell)),
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
  let minesTotal = 0;

  // Returns false on an immediate contradiction.
  const set = (v, val) => {
    budget.nodes++;
    if (budget.nodes > budget.limit) {
      throw new Error('work budget exceeded (' + budget.limit + ') — see agents.md "A just universe"');
    }
    assign[v] = val;
    trail.push(v);
    if (val === 1) minesTotal++;
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
      if (assign[v] === 1) minesTotal--;
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

  // Admissible bounds on the mines still to be placed, from the current
  // clue state:
  // - lower: sum of needs over a greedy set of cell-disjoint unfinished
  //   clues (each demands its mines from cells no other counted clue uses);
  // - upper: sum over all unfinished clues of what they can still accept
  //   (they jointly cover every unassigned cell, and a mine counts in at
  //   least one of them).
  const scratch = new Uint8Array(n);
  const boundsExtra = () => {
    let lower = 0;
    let upper = 0;
    scratch.fill(0);
    for (let li = 0; li < localClues.length; li++) {
      const c = localClues[li];
      const remaining = c.vars.length - done[li];
      if (remaining === 0) continue;
      const needLeft = c.need - mines[li];
      upper += Math.min(needLeft, remaining);
      if (needLeft === 0) continue;
      let disjoint = true;
      for (const v of c.vars) {
        if (assign[v] === -1 && scratch[v] === 1) { disjoint = false; break; }
      }
      if (!disjoint) continue;
      for (const v of c.vars) {
        if (assign[v] === -1) scratch[v] = 1;
      }
      lower += needLeft;
    }
    return [lower, upper];
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

  const order = options.mineFirst === true ? [1, 0] : [0, 1];
  let stopped = false;
  const dfs = () => {
    if (options.prune !== undefined) {
      const [lower, upper] = boundsExtra();
      if (options.prune(minesTotal, lower, upper)) return;
    }
    if (trail.length === n) {
      if (options.onSolution(assign, island) === false) stopped = true;
      return;
    }
    const v = chooseVar();
    for (const val of order) {
      const mark = trail.length;
      if (set(v, val) && propagate()) dfs();
      undoTo(mark);
      if (stopped) return;
    }
  };

  let feasible = true;
  if (options.pins !== undefined && options.pins !== null) {
    for (const [cell, val] of options.pins) {
      const v = island.localOf.get(cell);
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

// Is there any consistent arrangement of this island with the cell at the
// given value? Stops at the first witnessing arrangement.
function existsArrangement(structure, island, cell, value, budget) {
  let found = false;
  islandSearch(structure, island, {
    pins: new Map([[cell, value]]),
    onSolution: () => { found = true; return false; },
    mineFirst: value === 1,
  }, budget);
  return found;
}

// Is there any arrangement whose island mine total differs from T?
// Two branch-and-bound existence queries with admissible bounds.
function existsOtherTotal(structure, island, T, budget) {
  let found = false;
  // Below T: prefer clears, prune branches that can no longer stay under.
  islandSearch(structure, island, {
    onSolution: (assign) => {
      let total = 0;
      for (let i = 0; i < assign.length; i++) total += assign[i];
      if (total < T) { found = true; return false; }
      return true;
    },
    prune: (minesSoFar, lowerExtra) => minesSoFar + lowerExtra >= T,
  }, budget);
  if (found) return true;
  // Above T: prefer mines, prune branches that can no longer get over.
  islandSearch(structure, island, {
    mineFirst: true,
    onSolution: (assign) => {
      let total = 0;
      for (let i = 0; i < assign.length; i++) total += assign[i];
      if (total > T) { found = true; return false; }
      return true;
    },
    prune: (minesSoFar, lowerExtra, upperExtra) => minesSoFar + upperExtra <= T,
  }, budget);
  return found;
}

//-------STEP 3: DECIDE (the judge and the redraw)-------

// hits are the covered mine cells the player's action would open; reveals
// is every covered cell the action opens (for a chord that is the whole
// set, and the redraw must leave all of them clear). currentMines is the
// witness layout — a consistent arrangement, which is what anchors every
// test. budget = { nodes: 0, limit } counts work units across the whole
// attempt (the caller can read nodes back). Returns the redrawn mine
// layout (boolean per cell) when every hit is a named coin taken at its
// best odds, or null when the death is deserved and must stand.
function trySave(view, hits, reveals, currentMines, random, budget) {
  if (hits.length === 0) throw new Error('trySave called with no mine hits');
  const structure = buildStructure(view);

  const witnessTotalOf = (island) => {
    let total = 0;
    for (const cell of island.cells) if (currentMines[cell]) total++;
    return total;
  };

  // Witness-assisted certainty: a proven mine is certain; a cell clear in
  // the witness is certainly NOT a certain mine. Only witness-mine unknown
  // cells need a search, and only in their own island. Memoized per attempt.
  const certainMemo = new Map();
  const isCertainMine = (cell) => {
    if (certainMemo.has(cell)) return certainMemo.get(cell);
    let certain;
    const fact = structure.facts.get(cell);
    if (fact === 1) {
      certain = true;
    } else if (fact === 2 || !currentMines[cell]) {
      certain = false;
    } else {
      const ii = structure.islandOfCell.get(cell);
      if (ii !== undefined) {
        certain = !existsArrangement(structure, structure.islands[ii], cell, 0, budget);
      } else {
        // A sea cell is a certain mine only when the whole remaining sea
        // is mines in every arrangement: all sea cells are witness-mines
        // AND no island can trade a mine with the sea.
        certain = structure.seaCells.every((s) => currentMines[s])
          && structure.islands.every((island) => !existsOtherTotal(
            structure, island, witnessTotalOf(island), budget));
      }
    }
    certainMemo.set(cell, certain);
    return certain;
  };

  // Sealed-island test, one witness-anchored streaming enumeration.
  // Tracked aspects: the mine total and, for every bordering covered cell
  // that is not a certain mine (proven safes, other islands' cells, sea),
  // the number of this island's mines it touches. The first arrangement
  // that disagrees with the witness on any tracked aspect proves the
  // island open — someone, someday, could have told the difference — and
  // aborts immediately.
  const sealedMemo = new Map();
  const judgeIslandSealed = (ii) => {
    if (sealedMemo.has(ii)) return sealedMemo.get(ii);
    const island = structure.islands[ii];
    const inIsland = new Set(island.cells);
    const witnessTotal = witnessTotalOf(island);

    const tracked = [];
    const externalSeen = new Set();
    for (const cell of island.cells) {
      for (const nb of justiceNeighbors(cell, view.width, view.height)) {
        if (view.revealed[nb] || inIsland.has(nb) || externalSeen.has(nb)) continue;
        externalSeen.add(nb);
        if (isCertainMine(nb)) continue; // can never be revealed: no leak
        const members = justiceNeighbors(nb, view.width, view.height)
          .filter((m) => inIsland.has(m))
          .map((m) => island.localOf.get(m));
        let witnessSum = 0;
        for (const li of members) witnessSum += currentMines[island.cells[li]] ? 1 : 0;
        tracked.push({ members, witnessSum });
      }
    }

    let open = false;
    let solutionCount = 0;
    const mineCounts = new Int32Array(island.cells.length);
    islandSearch(structure, island, {
      onSolution: (assign) => {
        let total = 0;
        for (let i = 0; i < assign.length; i++) total += assign[i];
        if (total !== witnessTotal) { open = true; return false; }
        for (const t of tracked) {
          let s = 0;
          for (const li of t.members) s += assign[li];
          if (s !== t.witnessSum) { open = true; return false; }
        }
        solutionCount++;
        for (let i = 0; i < assign.length; i++) {
          if (assign[i] === 1) mineCounts[i]++;
        }
        return true;
      },
    }, budget);
    if (!open && solutionCount === 0) {
      // The witness satisfies every clue, so an inconsistent view is
      // impossible unless the caller (or this solver) has a bug.
      throw new Error('island has no consistent arrangement — the view is corrupt');
    }
    const result = open ? null : { solutionCount, mineCounts };
    sealedMemo.set(ii, result);
    return result;
  };

  // Judge every hit; collect one redraw plan per touched region.
  const islandPlans = new Set(); // island indices
  let seaPlan = false;
  for (const hit of hits) {
    // Opening a provably-known mine is a knowable mistake, never a coin.
    if (structure.facts.get(hit) === 1) return null;
    const ii = structure.islandOfCell.get(hit);
    if (ii !== undefined) {
      const island = structure.islands[ii];
      const sealed = judgeIslandSealed(ii);
      // Sealed island with a genuine coin inside...
      if (sealed === null || sealed.solutionCount < 2) return null;
      // ...no free knowledge left inside it (a provably safe cell means
      // the pocket is not yet an atomic coin)...
      for (let i = 0; i < island.cells.length; i++) {
        if (sealed.mineCounts[i] === 0) return null;
      }
      // ...entered at its best odds (ties included).
      const my = sealed.mineCounts[island.localOf.get(hit)];
      for (let i = 0; i < island.cells.length; i++) {
        if (sealed.mineCounts[i] < my) return null;
      }
      islandPlans.add(ii);
    } else {
      // A sea death is a named coin only for a sealed remnant: nothing
      // revealable borders the sea (checked first: cheap and almost
      // always decisive), every island has a fixed mine total (so the
      // sea's count is pinned), and that count leaves genuine ambiguity.
      // All sea cells share the same odds, so best-odds is automatic.
      for (const g of structure.seaGuards) {
        if (structure.facts.get(g) === 2) return null; // provably safe: will be revealed
        if (!isCertainMine(g)) return null;
      }
      let frontierMines = structure.provenMineCount;
      for (const island of structure.islands) {
        const T = witnessTotalOf(island);
        if (existsOtherTotal(structure, island, T, budget)) return null;
        frontierMines += T;
      }
      const k = view.mines - frontierMines;
      if (!(k > 0 && k < structure.seaCells.length)) return null;
      seaPlan = true;
    }
  }

  // Redraw: resample only the touched regions, conditioned on every opened
  // cell being clear. A sealed region's fixed total makes its arrangement
  // independent of the rest of the board, so leaving everything else at
  // the witness layout IS the exact conditional distribution.
  const result = currentMines.slice();
  const revealSet = new Set(reveals);
  for (const ii of islandPlans) {
    const island = structure.islands[ii];
    const pins = new Map();
    for (const cell of island.cells) {
      if (revealSet.has(cell)) pins.set(cell, 0);
    }
    let count = 0;
    let kept = null;
    islandSearch(structure, island, {
      pins,
      onSolution: (assign) => {
        count++;
        if (random() < 1 / count) kept = Int8Array.from(assign); // reservoir: uniform
        return true;
      },
    }, budget);
    if (count === 0) return null; // e.g. a chord that opens a whole pair
    island.cells.forEach((cell, li) => { result[cell] = kept[li] === 1; });
  }
  if (seaPlan) {
    let k = 0;
    for (const cell of structure.seaCells) if (currentMines[cell]) k++;
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
  proveFacts,
  buildStructure,
  islandSearch,
  existsArrangement,
  existsOtherTotal,
  trySave,
  // Work budget per save attempt (one unit = one cell assignment during
  // search). Measured headroom: tests/justice-bench.js puts the worst
  // constructed position orders of magnitude below this. Exceeding it is
  // a bug (announce and throw), not a fallback.
  NODE_BUDGET: 2e7,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Justice;

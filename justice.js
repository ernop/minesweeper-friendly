'use strict';

const VISIBLE_PROOF_VERSION = 'all-consistent-layouts-v1';

//-------SEALED-POCKET MERCY (pure logic, no DOM, no hidden-state judgment)-------
//
// A Justice event is a bare click into a certified sealed pocket: a group
// of still-unknown cells whose possible mine arrangements all look
// identical from everywhere outside the group. No outside play can make
// the first entry knowable, so that entry is guaranteed safe.
//
// Qualification uses only the player's information:
//   { width, height, mines, revealed: bool[], adjacent: int[] }
// Flags are annotations, not evidence. The current hidden layout is not an
// input to certifyEntry. Chords never call this module.
//
// V1 deliberately recognizes only three families with short, exact
// certificates:
//   1. cardinality pockets: every k-of-n placement is possible;
//   2. complement pockets: exactly two alternating pair/chain layouts, the
//      chain's sides equal or, since 2026-10-26, the smaller side completed
//      by the whole sea when the mine total fixes both together;
//   3. one sealed sea remnant with a fixed mine count.
// The first two are found per group inside a clue component
// (componentGroups), so a pocket qualifies even when a number it shares
// with another pocket joins them into one component.
//
// Certification is deduction, graph traversal, and integer counting. It
// never enumerates mine layouts, estimates probabilities, or needs a work
// budget. An exotic ambiguous region without one of these certificates is
// ordinary Minesweeper in v1; that is the rule's explicit boundary, not a
// timeout or degraded answer.

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

function rawClues(view) {
  const size = view.width * view.height;
  const clues = [];
  for (let i = 0; i < size; i++) {
    if (!view.revealed[i]) continue;
    const covered = justiceNeighbors(i, view.width, view.height)
      .filter((n) => !view.revealed[n]);
    if (covered.length > 0) clues.push({ covered, count: view.adjacent[i] });
  }
  return clues;
}

const DEFAULT_PROOF_VISITS = 2000000;
// The latest exact proof per work budget. One click proves its position
// several times (misclick, evidence, Justice), and guess scoring interleaves
// many smaller-budget hypothetical positions that must not evict it.
const lastExactProofByBudget = new Map();

function exactProofKey(view, clues, maxVisits) {
  const visible = [];
  for (let i = 0; i < view.revealed.length; i++) {
    if (view.revealed[i]) visible.push(i + ':' + view.adjacent[i]);
  }
  const equations = clues.map((clue) =>
    clue.count + ':' + clue.covered.join(',')).join(';');
  return view.width + 'x' + view.height + '/' + view.mines
    + '|' + visible.join(',') + '|' + equations + '|' + maxVisits;
}

// byMineCount maps each achievable mine count to flags indexed like
// `cells`: minePossible[i] / safePossible[i] are 1 when some layout with
// that count puts a mine / no mine on cells[i]; `unseen` counts flags
// still 0.
function enumerateProofComponent(cells, clues, work) {
  const clueIndexesByCell = new Map(cells.map((cell) => [cell, []]));
  clues.forEach((clue, clueIndex) => {
    for (const cell of clue.unknown) clueIndexesByCell.get(cell).push(clueIndex);
  });
  const ordered = cells.slice().sort((a, b) =>
    clueIndexesByCell.get(b).length - clueIndexesByCell.get(a).length);
  // The clues touching ordered[at] are touching[offsets[at]..offsets[at+1]).
  const offsets = new Int32Array(ordered.length + 1);
  ordered.forEach((cell, at) => { offsets[at + 1] = offsets[at] + clueIndexesByCell.get(cell).length; });
  const touching = new Int32Array(offsets[ordered.length]);
  ordered.forEach((cell, at) => touching.set(clueIndexesByCell.get(cell), offsets[at]));
  const remaining = Int32Array.from(clues, (clue) => clue.unknown.length);
  const needed = Int32Array.from(clues, (clue) => clue.need);
  const assignment = new Uint8Array(ordered.length);
  const byMineCount = new Map();
  const maxVisits = work.maxVisits;
  let visits = work.visits;
  let stopped = false;

  const visit = (at, mineCount) => {
    visits++;
    if (visits > maxVisits) {
      stopped = true;
      return;
    }
    // Assigning a clue's last cell prunes unless it needs exactly zero more
    // mines, so every clue is satisfied at a leaf.
    if (at === ordered.length) {
      let summary = byMineCount.get(mineCount);
      if (!summary) {
        summary = {
          minePossible: new Uint8Array(ordered.length),
          safePossible: new Uint8Array(ordered.length),
          unseen: 2 * ordered.length,
        };
        byMineCount.set(mineCount, summary);
      }
      if (summary.unseen === 0) return;
      for (let i = 0; i < ordered.length; i++) {
        const seen = assignment[i] === 1 ? summary.minePossible : summary.safePossible;
        if (seen[i] === 0) {
          seen[i] = 1;
          summary.unseen--;
        }
      }
      return;
    }
    const from = offsets[at];
    const to = offsets[at + 1];
    for (let mine = 0; mine <= 1; mine++) {
      let possible = true;
      assignment[at] = mine;
      for (let k = from; k < to; k++) {
        const clueIndex = touching[k];
        remaining[clueIndex]--;
        needed[clueIndex] -= mine;
        if (needed[clueIndex] < 0 || needed[clueIndex] > remaining[clueIndex]) {
          possible = false;
        }
      }
      if (possible) visit(at + 1, mineCount + mine);
      for (let k = from; k < to; k++) {
        const clueIndex = touching[k];
        needed[clueIndex] += mine;
        remaining[clueIndex]++;
      }
      if (stopped) return;
    }
  };

  visit(0, 0);
  work.visits = visits;
  if (stopped) return null;
  if (byMineCount.size === 0) throw new Error('visible clues have no valid layout');
  return { cells: ordered, byMineCount };
}

function possibleMineSums(components, skip = -1) {
  let sums = new Set([0]);
  for (let i = 0; i < components.length; i++) {
    if (i === skip) continue;
    const next = new Set();
    for (const sum of sums) {
      for (const count of components[i].byMineCount.keys()) next.add(sum + count);
    }
    sums = next;
  }
  return sums;
}

// Every layout of the unresolved frontier the visible numbers allow, searched
// per component of cells the numbers link. `solved` is null when the search
// stopped at `maxVisits`; `frontier` holds every cell some number touches.
function searchNumberLayouts(clues, status, maxVisits) {
  const residuals = [];
  const clueIndexesByCell = new Map();
  for (const clue of clues) {
    const unknown = [];
    let need = clue.count;
    for (const cell of clue.covered) {
      const fact = status.get(cell);
      if (fact === 1) need--;
      else if (fact !== 2) unknown.push(cell);
    }
    if (need < 0 || need > unknown.length) {
      throw new Error('visible clues are inconsistent');
    }
    if (unknown.length === 0) continue;
    const clueIndex = residuals.length;
    residuals.push({ unknown, need });
    for (const cell of unknown) {
      if (!clueIndexesByCell.has(cell)) clueIndexesByCell.set(cell, []);
      clueIndexesByCell.get(cell).push(clueIndex);
    }
  }

  const components = [];
  const seen = new Set();
  for (const start of clueIndexesByCell.keys()) {
    if (seen.has(start)) continue;
    const cells = [];
    const clueSet = new Set();
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const cell = stack.pop();
      cells.push(cell);
      for (const clueIndex of clueIndexesByCell.get(cell)) {
        if (!clueSet.has(clueIndex)) clueSet.add(clueIndex);
        for (const other of residuals[clueIndex].unknown) {
          if (seen.has(other)) continue;
          seen.add(other);
          stack.push(other);
        }
      }
    }
    components.push({
      cells,
      clues: [...clueSet].map((index) => residuals[index]),
    });
  }

  const work = { visits: 0, maxVisits };
  const solved = [];
  const frontier = new Set(clueIndexesByCell.keys());
  for (const component of components) {
    const result = enumerateProofComponent(component.cells, component.clues, work);
    if (result === null) return { solved: null, frontier, visits: work.visits };
    solved.push(result);
  }
  return { solved, frontier, visits: work.visits };
}

// A cell is a fact when every layout of its component holding one of
// `counts` mines gives it the same value.
function markComponent(component, counts, mark) {
  component.cells.forEach((cell, index) => {
    let canBeMine = false;
    let canBeSafe = false;
    for (const count of counts) {
      const summary = component.byMineCount.get(count);
      if (summary.minePossible[index] === 1) canBeMine = true;
      if (summary.safePossible[index] === 1) canBeSafe = true;
    }
    if (!canBeMine) mark(cell, 2);
    else if (!canBeSafe) mark(cell, 1);
  });
}

// What every layout the numbers allow agrees on, whatever its mine count.
// The sea, which no number touches, is never marked.
function markNumberFacts(solved, mark) {
  for (const component of solved) markComponent(component, [...component.byMineCount.keys()], mark);
}

// The board's mine total joins the searched components and the sea: each
// component's mine counts that some whole-board layout allows, and the sea's
// fact when every such layout fills it or leaves it empty (null otherwise).
// It reads `status` as the search saw it, before any of its facts are marked.
function mineTotalVerdict(view, status, solved, frontier) {
  let knownMines = 0;
  const unresolved = [];
  for (let cell = 0; cell < view.width * view.height; cell++) {
    if (view.revealed[cell]) continue;
    const fact = status.get(cell);
    if (fact === 1) knownMines++;
    else if (fact !== 2) unresolved.push(cell);
  }
  const sea = unresolved.filter((cell) => !frontier.has(cell));
  const target = view.mines - knownMines;
  if (target < 0 || target > unresolved.length) {
    throw new Error('global mine count contradicts visible clues');
  }

  const allComponentSums = possibleMineSums(solved);
  const possibleSeaCounts = new Set();
  for (const sum of allComponentSums) {
    const seaMines = target - sum;
    if (seaMines >= 0 && seaMines <= sea.length) possibleSeaCounts.add(seaMines);
  }
  if (possibleSeaCounts.size === 0) {
    throw new Error('visible clues and global mine count have no valid layout');
  }

  const feasibleCounts = solved.map((component, i) => {
    const otherSums = possibleMineSums(solved, i);
    const counts = [];
    for (const localCount of component.byMineCount.keys()) {
      if ([...otherSums].some((otherCount) => {
        const seaMines = target - localCount - otherCount;
        return seaMines >= 0 && seaMines <= sea.length;
      })) {
        counts.push(localCount);
      }
    }
    if (counts.length === 0) {
      throw new Error('component has no globally valid layout');
    }
    return counts;
  });

  const seaFact = [...possibleSeaCounts].every((count) => count === 0) ? 2
    : [...possibleSeaCounts].every((count) => count === sea.length) ? 1 : null;
  return { feasibleCounts, sea, seaFact };
}

function markMineTotalFacts(solved, verdict, mark) {
  solved.forEach((component, i) => markComponent(component, verdict.feasibleCounts[i], mark));
  if (verdict.seaFact !== null) for (const cell of verdict.sea) mark(cell, verdict.seaFact);
}

// Exhaustive visible-information proof. Frontier components are searched
// independently, then joined through the board's total mine count and the
// unconstrained sea. A cell is marked only when every globally consistent
// layout gives it the same value. Without the mine total (`useGlobal`
// false) a cell is marked when every layout the numbers allow, whatever its
// mine count, gives it the same value.
function proveExactFacts(view, clues, status, mark, maxVisits, useGlobal) {
  const search = searchNumberLayouts(clues, status, maxVisits);
  if (search.solved === null) return { complete: false, visits: search.visits };
  if (useGlobal) {
    markMineTotalFacts(search.solved, mineTotalVerdict(view, status, search.solved, search.frontier), mark);
  } else {
    markNumberFacts(search.solved, mark);
  }
  return { complete: true, visits: search.visits };
}

// The local rules to a fixpoint: counting single clues (`useCount`),
// comparing overlapping pairs (`useSubset`), and the mine total's
// all-or-none rule (`useGlobal`).
function applyRules(view, clues, status, mark, useCount, useSubset, useGlobal) {
  const size = view.width * view.height;
  let changed = true;
  while (changed) {
    changed = false;
    const before = status.size;
    const residuals = [];

    for (const clue of clues) {
      const unknown = [];
      let need = clue.count;
      for (const cell of clue.covered) {
        const fact = status.get(cell);
        if (fact === 1) need--;
        else if (fact !== 2) unknown.push(cell);
      }
      if (need < 0 || need > unknown.length) {
        throw new Error('visible clues are inconsistent');
      }
      if (unknown.length === 0) continue;
      residuals.push({ unknown, need, set: new Set(unknown) });
    }

    if (useCount) {
      for (const residual of residuals) {
        if (residual.need === 0) {
          for (const cell of residual.unknown) mark(cell, 2);
        } else if (residual.need === residual.unknown.length) {
          for (const cell of residual.unknown) mark(cell, 1);
        }
      }
    }

    if (useSubset && status.size === before) {
      // After a count pass that marked nothing, every residual needs
      // strictly between none and all of its cells, so a pair sharing no
      // cell can neither mark nor contradict. Only overlapping pairs are
      // compared then, in the same order as the all-pairs loop.
      const residualsOfCell = new Map();
      if (useCount) {
        residuals.forEach((residual, index) => {
          for (const cell of residual.unknown) {
            if (!residualsOfCell.has(cell)) residualsOfCell.set(cell, []);
            residualsOfCell.get(cell).push(index);
          }
        });
      }
      for (let i = 0; i < residuals.length; i++) {
        let partners;
        if (useCount) {
          const overlapping = new Set();
          for (const cell of residuals[i].unknown) {
            for (const other of residualsOfCell.get(cell)) if (other > i) overlapping.add(other);
          }
          partners = [...overlapping].sort((a, b) => a - b);
        } else {
          partners = [];
          for (let j = i + 1; j < residuals.length; j++) partners.push(j);
        }
        for (const j of partners) {
          const left = residuals[i];
          const right = residuals[j];
          const leftOnly = left.unknown.filter((cell) => !right.set.has(cell));
          const rightOnly = right.unknown.filter((cell) => !left.set.has(cell));
          const difference = left.need - right.need;
          if (difference < -rightOnly.length || difference > leftOnly.length) {
            throw new Error('visible clues are inconsistent');
          }
          if (difference === leftOnly.length) {
            for (const cell of leftOnly) mark(cell, 1);
            for (const cell of rightOnly) mark(cell, 2);
          } else if (difference === -rightOnly.length) {
            for (const cell of leftOnly) mark(cell, 2);
            for (const cell of rightOnly) mark(cell, 1);
          }
        }
      }
    }

    if (useGlobal) {
      let knownMines = 0;
      const globallyUnknown = [];
      for (let i = 0; i < size; i++) {
        if (view.revealed[i]) continue;
        const fact = status.get(i);
        if (fact === 1) knownMines++;
        else if (fact !== 2) globallyUnknown.push(i);
      }
      const minesLeft = view.mines - knownMines;
      if (minesLeft < 0 || minesLeft > globallyUnknown.length) {
        throw new Error('global mine count contradicts visible clues');
      }
      if (minesLeft === 0) {
        for (const cell of globallyUnknown) mark(cell, 2);
      } else if (minesLeft === globallyUnknown.length) {
        for (const cell of globallyUnknown) mark(cell, 1);
      }
    }

    changed = status.size !== before;
  }
}

// Sound local deduction to a fixpoint:
// - a clue needing zero/all of its unresolved cells proves them safe/mined;
// - subtracting any two overlapping residual clues can expose extreme
//   one-sided differences (strict subsets are one instance);
// - the default exact pass searches every globally consistent frontier
//   layout and applies the total mine count across components and sea;
//   without `global` it searches every layout the numbers allow.
// A work-limit result is explicitly marked incomplete. Every returned fact
// remains sound; incompleteness can withhold a certificate, never invent one.
//
// Status values remain 1=mine and 2=safe for the public test interface.
function proveFacts(view, clues, opts) {
  opts = opts || {};
  const useCount = opts.count !== false;
  const useSubset = opts.subset !== false;
  const useGlobal = opts.global !== false;
  const useExact = opts.exact !== false && useCount && useSubset;
  const maxVisits = Number.isFinite(opts.maxVisits)
    ? opts.maxVisits : DEFAULT_PROOF_VISITS;
  // Only the full proof is the one a click asks for several times.
  const cacheKey = useExact && useGlobal ? exactProofKey(view, clues, maxVisits) : null;
  const cached = cacheKey !== null ? lastExactProofByBudget.get(maxVisits) : undefined;
  if (cached !== undefined && cached.key === cacheKey) return cached.facts;
  const status = new Map();
  const mark = (cell, value) => {
    const previous = status.get(cell);
    if (previous !== undefined && previous !== value) {
      throw new Error('visible clues prove cell ' + cell + ' both safe and mined');
    }
    if (previous === undefined) status.set(cell, value);
  };

  applyRules(view, clues, status, mark, useCount, useSubset, useGlobal);
  if (useExact) {
    const exact = proveExactFacts(
      view, clues, status, mark, maxVisits, useGlobal);
    status.complete = exact.complete;
    status.visits = exact.visits;
    status.method = !exact.complete ? 'work-limit'
      : useGlobal ? 'all-consistent-layouts' : 'all-number-layouts';
    if (cacheKey !== null) lastExactProofByBudget.set(maxVisits, { key: cacheKey, facts: status });
  } else {
    status.complete = false;
    status.visits = 0;
    status.method = 'rules-only';
  }
  return status;
}

// The deduction levels (docs/product/design-axis.md, "Deduction levels"),
// easiest first: what a proof may use. Each level adds one kind of reasoning
// to the level before it, so it proves every fact the levels below it prove:
// counting single numbers, one at a time; comparing two numbers that share
// covered squares; every layout all the numbers allow together; and only
// those layouts that hold the board's mine total, which is every fact the
// visible board proves. A fact's level is the first level that proves it.
const DEDUCTION_LEVELS = Object.freeze([
  Object.freeze({ id: 'counting', proof: Object.freeze({ subset: false, global: false, exact: false }) }),
  Object.freeze({ id: 'overlap', proof: Object.freeze({ global: false, exact: false }) }),
  Object.freeze({ id: 'allNumbers', proof: Object.freeze({ global: false }) }),
  Object.freeze({ id: 'mineTotal', proof: Object.freeze({}) }),
]);

// Every deduction level in one pass, each stage continuing from the facts of
// the stages before it, so each fact is marked once, by the first level that
// proves it; all numbers and the mine total share one search. Returns the
// facts as proveFacts' full proof gives them (the same facts, complete or
// stopped at the same work limit) and `levelOf`, each fact's level id. A
// stopped search leaves only the rule levels' facts.
function proveLevels(view, clues, opts) {
  opts = opts || {};
  const maxVisits = Number.isFinite(opts.maxVisits)
    ? opts.maxVisits : DEFAULT_PROOF_VISITS;
  const facts = new Map();
  const levelOf = new Map();
  let level = 'counting';
  const mark = (cell, value) => {
    const previous = facts.get(cell);
    if (previous !== undefined && previous !== value) {
      throw new Error('visible clues prove cell ' + cell + ' both safe and mined');
    }
    if (previous === undefined) {
      facts.set(cell, value);
      levelOf.set(cell, level);
    }
  };
  applyRules(view, clues, facts, mark, true, false, false);
  level = 'overlap';
  applyRules(view, clues, facts, mark, true, true, false);
  const search = searchNumberLayouts(clues, facts, maxVisits);
  facts.visits = search.visits;
  if (search.solved === null) {
    facts.complete = false;
    facts.method = 'work-limit';
    return { facts, levelOf };
  }
  const verdict = mineTotalVerdict(view, facts, search.solved, search.frontier);
  level = 'allNumbers';
  markNumberFacts(search.solved, mark);
  level = 'mineTotal';
  markMineTotalFacts(search.solved, verdict, mark);
  facts.complete = true;
  facts.method = 'all-consistent-layouts';
  return { facts, levelOf };
}

// provenFacts: the position's proof under the default options when the
// caller already holds it (proveLevels and proveFacts prove the same
// facts), else proved here.
function buildStructure(view, proofOptions, provenFacts) {
  const size = view.width * view.height;
  if (view.revealed.length !== size || view.adjacent.length !== size) {
    throw new Error('board view has the wrong size');
  }

  const raw = rawClues(view);
  const facts = provenFacts === undefined ? proveFacts(view, raw, proofOptions) : provenFacts;
  const clues = [];
  const cluesOfCell = new Map();
  const frontierSet = new Set();

  for (const clue of raw) {
    const covered = [];
    let count = clue.count;
    for (const cell of clue.covered) {
      frontierSet.add(cell);
      const fact = facts.get(cell);
      if (fact === 1) count--;
      else if (fact !== 2) covered.push(cell);
    }
    if (count < 0 || count > covered.length) {
      throw new Error('deduced facts contradict a visible clue');
    }
    if (covered.length === 0) continue;
    const clueIndex = clues.length;
    clues.push({ covered, count });
    for (const cell of covered) {
      if (!cluesOfCell.has(cell)) cluesOfCell.set(cell, []);
      cluesOfCell.get(cell).push(clueIndex);
    }
  }

  const components = [];
  const componentOfCell = new Map();
  for (const start of cluesOfCell.keys()) {
    if (componentOfCell.has(start)) continue;
    const componentIndex = components.length;
    const cells = [];
    const clueSet = new Set();
    const stack = [start];
    componentOfCell.set(start, componentIndex);
    while (stack.length > 0) {
      const cell = stack.pop();
      cells.push(cell);
      for (const clueIndex of cluesOfCell.get(cell)) {
        if (clueSet.has(clueIndex)) continue;
        clueSet.add(clueIndex);
        for (const other of clues[clueIndex].covered) {
          if (componentOfCell.has(other)) continue;
          componentOfCell.set(other, componentIndex);
          stack.push(other);
        }
      }
    }
    components.push({ cells, clues: [...clueSet] });
  }

  const seaCells = [];
  for (let i = 0; i < size; i++) {
    if (!view.revealed[i] && !frontierSet.has(i) && !facts.has(i)) seaCells.push(i);
  }
  const seaSet = new Set(seaCells);
  const seaComponents = [];
  const seaComponentOfCell = new Map();
  // Each sea square's component index plus one, 0 while unassigned. The
  // neighbors are walked in place, in justiceNeighbors' order (each
  // component's cell order depends on it), without a list per square: this
  // fill runs on every structure, early in a game over most of the board.
  const seaIndexOf = new Int32Array(size);
  const isSea = new Uint8Array(size);
  for (const cell of seaCells) isSea[cell] = 1;
  const { width, height } = view;
  for (const start of seaCells) {
    if (seaIndexOf[start] !== 0) continue;
    const seaIndex = seaComponents.length;
    const cells = [];
    const stack = [start];
    seaIndexOf[start] = seaIndex + 1;
    seaComponentOfCell.set(start, seaIndex);
    while (stack.length > 0) {
      const cell = stack.pop();
      cells.push(cell);
      const x = cell % width;
      const y = (cell - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if ((dx === 0 && dy === 0) || nx < 0 || nx >= width) continue;
          const other = ny * width + nx;
          if (isSea[other] === 0 || seaIndexOf[other] !== 0) continue;
          seaIndexOf[other] = seaIndex + 1;
          seaComponentOfCell.set(other, seaIndex);
          stack.push(other);
        }
      }
    }
    seaComponents.push(cells);
  }

  let provenMineCount = 0;
  for (const value of facts.values()) if (value === 1) provenMineCount++;

  return {
    view,
    facts,
    clues,
    cluesOfCell,
    components,
    componentOfCell,
    frontierSet,
    seaCells,
    seaSet,
    seaComponents,
    seaComponentOfCell,
    provenMineCount,
  };
}

// The candidate groups inside one residual component, each judged on its
// own. A component joins every covered cell that shares a clue with
// another, so two 50/50s seen by one common number are one component with
// four layouts, yet each 50/50 alone is a family below (2026-10-21; until
// then only whole components were judged, and such a pair was refused).
//
// Twin groups hold the cells touched by exactly the same residual clues.
// Each of those clues covers the whole group, so any rearrangement of mines
// inside it changes no clue's count. A group's mine count is pinned when a
// clue covers exactly the group, or when subtracting the pinned groups a
// clue covers leaves only this group.
//
// Pair chains hold the cells linked by x+y=1 clues: every consistent layout
// is one of the chain's two alternating colorings.
function componentGroups(structure, component) {
  const twinsByKey = new Map();
  const twinOfCell = new Map();
  for (const cell of component.cells) {
    const key = structure.cluesOfCell.get(cell).join(',');
    if (!twinsByKey.has(key)) twinsByKey.set(key, { cells: [], mineCount: null });
    const twins = twinsByKey.get(key);
    twins.cells.push(cell);
    twinOfCell.set(cell, twins);
  }
  const clueGroups = component.clues.map((clueIndex) => {
    const clue = structure.clues[clueIndex];
    return { count: clue.count, groups: [...new Set(clue.covered.map((cell) => twinOfCell.get(cell)))] };
  });
  let pinned = true;
  while (pinned) {
    pinned = false;
    for (const clue of clueGroups) {
      const open = clue.groups.filter((twins) => twins.mineCount === null);
      if (open.length !== 1) continue;
      let count = clue.count;
      for (const twins of clue.groups) if (twins.mineCount !== null) count -= twins.mineCount;
      if (count < 0 || count > open[0].cells.length) throw new Error('visible clues are inconsistent');
      open[0].mineCount = count;
      pinned = true;
    }
  }

  const partners = new Map(component.cells.map((cell) => [cell, []]));
  for (const clueIndex of component.clues) {
    const clue = structure.clues[clueIndex];
    if (clue.covered.length !== 2 || clue.count !== 1) continue;
    const [a, b] = clue.covered;
    partners.get(a).push(b);
    partners.get(b).push(a);
  }
  const chainOfCell = new Map();
  for (const start of component.cells) {
    if (chainOfCell.has(start)) continue;
    const chain = { cells: [], partitionA: [], partitionB: [] };
    const side = new Map([[start, 0]]);
    const stack = [start];
    while (stack.length > 0) {
      const cell = stack.pop();
      chain.cells.push(cell);
      (side.get(cell) === 0 ? chain.partitionA : chain.partitionB).push(cell);
      chainOfCell.set(cell, chain);
      for (const other of partners.get(cell)) {
        if (!side.has(other)) {
          side.set(other, 1 - side.get(cell));
          stack.push(other);
        } else if (side.get(other) === side.get(cell)) {
          throw new Error('x+y=1 clues form an odd cycle');
        }
      }
    }
  }
  return { twinOfCell, chainOfCell };
}

function balancedChain(chain) {
  return chain.cells.length >= 2 && chain.partitionA.length === chain.partitionB.length;
}

// True when every residual clue touching the chain sees as many cells of
// one side as of the other, so switching sides changes no count.
function chainCluesAreInvariant(structure, chain) {
  const aSet = new Set(chain.partitionA);
  const bSet = new Set(chain.partitionB);
  const touching = new Set();
  for (const cell of chain.cells) {
    for (const clueIndex of structure.cluesOfCell.get(cell)) touching.add(clueIndex);
  }
  for (const clueIndex of touching) {
    let seenA = 0;
    let seenB = 0;
    for (const cell of structure.clues[clueIndex].covered) {
      if (aSet.has(cell)) seenA++;
      else if (bSet.has(cell)) seenB++;
    }
    if (seenA !== seenB) return false;
  }
  return true;
}

function externalCoveredNeighbors(structure, cells) {
  const inPocket = new Set(cells);
  const external = new Set();
  for (const cell of cells) {
    for (const neighbor of justiceNeighbors(
      cell, structure.view.width, structure.view.height)) {
      if (!structure.view.revealed[neighbor] && !inPocket.has(neighbor)) {
        external.add(neighbor);
      }
    }
  }
  return { inPocket, external: [...external] };
}

function cardinalityBoundaryIsSealed(structure, cells) {
  const { inPocket, external } = externalCoveredNeighbors(structure, cells);
  for (const observer of external) {
    if (structure.facts.get(observer) === 1) continue;
    let touched = 0;
    for (const neighbor of justiceNeighbors(
      observer, structure.view.width, structure.view.height)) {
      if (inPocket.has(neighbor)) touched++;
    }
    if (touched !== cells.length) return false;
  }
  return true;
}

function complementBoundaryIsSealed(structure, shape) {
  const { external } = externalCoveredNeighbors(structure, shape.cells);
  const aSet = new Set(shape.partitionA);
  const bSet = new Set(shape.partitionB);
  for (const observer of external) {
    if (structure.facts.get(observer) === 1) continue;
    let touchedA = 0;
    let touchedB = 0;
    for (const neighbor of justiceNeighbors(
      observer, structure.view.width, structure.view.height)) {
      if (aSet.has(neighbor)) touchedA++;
      if (bSet.has(neighbor)) touchedB++;
    }
    if (touchedA !== touchedB) return false;
  }
  return true;
}

// Walks the whole frontier: the mines of every pinned twin group and pair
// chain with equal sides, and the one uneven chain left open (null when
// none is). Null when two parts are open. Every cell of a twin group no
// clue pins lies on an uneven chain (its own one-cell chain when no pair
// clue touches it), so open chains are the only open parts. No chain
// mixes pinned and unpinned twin groups: a pair clue touching a twin group
// covers it whole, so pinning passes along every pair clue.
function frontierBesideOpenChain(structure, groupsOf) {
  let pinnedMines = 0;
  let openChain = null;
  const counted = new Set();
  for (let index = 0; index < structure.components.length; index++) {
    const groups = groupsOf(index);
    for (const cell of structure.components[index].cells) {
      const twins = groups.twinOfCell.get(cell);
      const chain = groups.chainOfCell.get(cell);
      let group;
      let mines;
      if (twins.mineCount !== null) {
        group = twins;
        mines = twins.mineCount;
      } else if (balancedChain(chain)) {
        group = chain;
        mines = chain.partitionA.length;
      } else if (openChain === null || openChain === chain) {
        openChain = chain;
        continue;
      } else {
        return null;
      }
      if (counted.has(group)) continue;
      counted.add(group);
      pinnedMines += mines;
    }
  }
  return { pinnedMines, openChain };
}

// Every k-of-n layout of a twin group is possible when its count is pinned
// strictly between none and all of it.
function twinCertificate(structure, twins) {
  if (twins.mineCount === null || twins.mineCount === 0
      || twins.mineCount === twins.cells.length) return null;
  if (!cardinalityBoundaryIsSealed(structure, twins.cells)) return null;
  return {
    type: 'cardinality',
    cells: twins.cells,
    mineCount: twins.mineCount,
    clearWays: twins.cells.length - twins.mineCount,
    totalWays: twins.cells.length,
  };
}

function chainCertificate(structure, chain) {
  if (!balancedChain(chain) || !chainCluesAreInvariant(structure, chain)
      || !complementBoundaryIsSealed(structure, chain)) return null;
  return {
    type: 'complement',
    cells: chain.cells,
    mineCount: chain.partitionA.length,
    partitionA: chain.partitionA,
    partitionB: chain.partitionB,
    clearWays: 1,
    totalWays: 2,
  };
}

function certifySeaEntry(structure, clicked, groupsOf) {
  const seaIndex = structure.seaComponentOfCell.get(clicked);
  if (seaIndex === undefined || structure.seaComponents.length !== 1) return null;
  const cells = structure.seaComponents[seaIndex];
  if (cells.length < 2) return null;

  const frontier = frontierBesideOpenChain(structure, groupsOf);
  if (frontier === null || frontier.openChain !== null) return null;
  const mineCount = structure.view.mines - structure.provenMineCount - frontier.pinnedMines;
  if (!(mineCount > 0 && mineCount < cells.length)) return null;
  if (!cardinalityBoundaryIsSealed(structure, cells)) return null;

  return {
    type: 'sea',
    cells: cells.slice(),
    mineCount,
    clearWays: cells.length - mineCount,
    totalWays: cells.length,
  };
}

// An uneven chain the sea completes (creator report 2026-10-26: a loss in
// a 2-by-2 block walled off by flags, the clicked square against the
// squares above it and beside it, with the block's fourth square, which no
// number touches, making up the difference). When the chain's sides differ
// by exactly the sea's size, every other part of the frontier is pinned,
// and the mine total leaves the larger side's count to the chain and the
// sea together, two layouts remain: the larger side mined and the sea
// clear, or the smaller side and the whole sea mined. A complement pocket,
// then, whose smaller side the mine total extends over the sea.
function seaCompletedChainCertificate(structure, groupsOf) {
  const sea = structure.seaCells;
  // The sea makes up the difference between two sides of one chain, so it
  // is smaller than the frontier; the early game, with its open field,
  // skips the walk over every component.
  if (sea.length === 0 || sea.length >= structure.cluesOfCell.size) return null;
  const frontier = frontierBesideOpenChain(structure, groupsOf);
  if (frontier === null || frontier.openChain === null) return null;
  const chain = frontier.openChain;
  const [larger, smaller] = chain.partitionA.length > chain.partitionB.length
    ? [chain.partitionA, chain.partitionB]
    : [chain.partitionB, chain.partitionA];
  if (larger.length - smaller.length !== sea.length) return null;
  const mineCount = structure.view.mines - structure.provenMineCount - frontier.pinnedMines;
  if (mineCount !== larger.length) return null;
  if (!chainCluesAreInvariant(structure, chain)) return null;
  const shape = {
    cells: [...chain.cells, ...sea],
    partitionA: larger,
    partitionB: [...smaller, ...sea],
  };
  if (!complementBoundaryIsSealed(structure, shape)) return null;
  return {
    type: 'complement',
    cells: shape.cells,
    mineCount,
    partitionA: shape.partitionA,
    partitionB: shape.partitionB,
    clearWays: 1,
    totalWays: 2,
  };
}

function validateEntryIndex(view, clicked) {
  const size = view.width * view.height;
  if (!Number.isInteger(clicked) || clicked < 0 || clicked >= size) {
    throw new Error('clicked cell is outside the board');
  }
}

// Returns compact proofs for qualifying entries while constructing the
// visible constraint structure only once. Every cell in one certified
// pocket shares its certificate, so each component's groups, each group,
// and the sea are also checked only once. heldStructure: buildStructure's
// for this view when the caller already holds it, else built here.
function certifyEntries(view, entries, heldStructure) {
  for (const entry of entries) validateEntryIndex(view, entry);
  const structure = heldStructure === undefined ? buildStructure(view) : heldStructure;
  const groupsByComponent = new Map();
  const groupsOf = (componentIndex) => {
    if (!groupsByComponent.has(componentIndex)) {
      groupsByComponent.set(componentIndex,
        componentGroups(structure, structure.components[componentIndex]));
    }
    return groupsByComponent.get(componentIndex);
  };
  const groupCertificates = new Map();
  const certificateOf = (group, certify) => {
    if (!groupCertificates.has(group)) groupCertificates.set(group, certify(structure, group));
    return groupCertificates.get(group);
  };
  const certificates = new Map();
  let seaCertificate;
  let seaChecked = false;
  let seaCompletedChain;
  let seaCompletedChainChecked = false;
  const seaCompletedChainOf = () => {
    if (!seaCompletedChainChecked) {
      seaCompletedChain = seaCompletedChainCertificate(structure, groupsOf);
      seaCompletedChainChecked = true;
    }
    return seaCompletedChain;
  };

  for (const entry of entries) {
    if (view.revealed[entry] || structure.facts.has(entry)) continue;
    const componentIndex = structure.componentOfCell.get(entry);
    let certificate = null;
    if (componentIndex !== undefined) {
      const groups = groupsOf(componentIndex);
      certificate = certificateOf(groups.twinOfCell.get(entry), twinCertificate);
      if (certificate === null) {
        certificate = certificateOf(groups.chainOfCell.get(entry), chainCertificate);
      }
      if (certificate === null) {
        const completed = seaCompletedChainOf();
        if (completed !== null && completed.cells.includes(entry)) certificate = completed;
      }
    } else if (structure.seaComponentOfCell.has(entry)) {
      if (!seaChecked) {
        seaCertificate = certifySeaEntry(structure, entry, groupsOf);
        seaChecked = true;
      }
      certificate = seaCertificate === null ? seaCompletedChainOf() : seaCertificate;
    }
    if (certificate !== null) certificates.set(entry, certificate);
  }
  return certificates;
}

// Returns a compact proof that the covered cell is a qualifying sealed
// entry, or null. This function cannot inspect the hidden mine layout.
function certifyEntry(view, clicked) {
  validateEntryIndex(view, clicked);
  return certifyEntries(view, [clicked]).get(clicked) || null;
}

function layoutMatchesComplement(currentMines, shape) {
  const aSet = new Set(shape.partitionA);
  const bSet = new Set(shape.partitionB);
  let layoutA = true;
  let layoutB = true;
  for (const cell of shape.cells) {
    if (currentMines[cell] !== aSet.has(cell)) layoutA = false;
    if (currentMines[cell] !== bSet.has(cell)) layoutB = false;
  }
  return layoutA || layoutB;
}

function shuffle(list, random) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
}

// Applies a certificate to the hidden witness. A currently safe entry
// leaves the witness untouched; a mined entry receives the exact
// conditional redraw represented by the certificate.
function redrawEntry(certificate, clicked, currentMines, random) {
  if (!certificate.cells.includes(clicked)) {
    throw new Error('certificate does not contain the clicked cell');
  }
  const result = currentMines.slice();

  if (certificate.type === 'complement') {
    if (!layoutMatchesComplement(currentMines, certificate)) {
      throw new Error('hidden layout does not match complement certificate');
    }
    if (!currentMines[clicked]) return result;
    const clickedInA = certificate.partitionA.includes(clicked);
    const clearLayout = clickedInA
      ? new Set(certificate.partitionB)
      : new Set(certificate.partitionA);
    for (const cell of certificate.cells) result[cell] = clearLayout.has(cell);
    return result;
  }

  let currentCount = 0;
  for (const cell of certificate.cells) if (currentMines[cell]) currentCount++;
  if (currentCount !== certificate.mineCount) {
    throw new Error('hidden layout does not match cardinality certificate');
  }
  if (!currentMines[clicked]) return result;

  const pool = certificate.cells.filter((cell) => cell !== clicked);
  shuffle(pool, random);
  for (const cell of certificate.cells) result[cell] = false;
  for (let i = 0; i < certificate.mineCount; i++) result[pool[i]] = true;
  return result;
}

const Justice = {
  PROOF_VERSION: VISIBLE_PROOF_VERSION,
  DEDUCTION_LEVELS,
  neighbors: justiceNeighbors,
  rawClues,
  proveFacts,
  proveLevels,
  buildStructure,
  componentGroups,
  certifyEntries,
  certifyEntry,
  redrawEntry,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Justice;

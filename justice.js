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
//   2. complement pockets: exactly two alternating pair/chain layouts;
//   3. one sealed sea remnant with a fixed mine count.
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
let lastExactProof = null;

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

function enumerateProofComponent(cells, clues, work) {
  const clueIndexesByCell = new Map(cells.map((cell) => [cell, []]));
  clues.forEach((clue, clueIndex) => {
    for (const cell of clue.unknown) clueIndexesByCell.get(cell).push(clueIndex);
  });
  const ordered = cells.slice().sort((a, b) =>
    clueIndexesByCell.get(b).length - clueIndexesByCell.get(a).length);
  const remaining = clues.map((clue) => clue.unknown.length);
  const needed = clues.map((clue) => clue.need);
  const assignment = new Map();
  const byMineCount = new Map();
  let stopped = false;

  const visit = (at, mineCount) => {
    work.visits++;
    if (work.visits > work.maxVisits) {
      stopped = true;
      return;
    }
    if (at === ordered.length) {
      if (needed.some((need) => need !== 0)) return;
      let summary = byMineCount.get(mineCount);
      if (!summary) {
        summary = { minePossible: new Set(), safePossible: new Set() };
        byMineCount.set(mineCount, summary);
      }
      for (const cell of ordered) {
        (assignment.get(cell) ? summary.minePossible : summary.safePossible).add(cell);
      }
      return;
    }
    const cell = ordered[at];
    for (const mine of [false, true]) {
      let possible = true;
      assignment.set(cell, mine);
      for (const clueIndex of clueIndexesByCell.get(cell)) {
        remaining[clueIndex]--;
        if (mine) needed[clueIndex]--;
        if (needed[clueIndex] < 0 || needed[clueIndex] > remaining[clueIndex]) {
          possible = false;
        }
      }
      if (possible) visit(at + 1, mineCount + (mine ? 1 : 0));
      for (const clueIndex of clueIndexesByCell.get(cell)) {
        if (mine) needed[clueIndex]++;
        remaining[clueIndex]++;
      }
      if (stopped) return;
    }
    assignment.delete(cell);
  };

  visit(0, 0);
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

// Exhaustive visible-information proof. Frontier components are searched
// independently, then joined through the board's total mine count and the
// unconstrained sea. A cell is marked only when every globally consistent
// layout gives it the same value.
function proveExactFacts(view, clues, status, mark, maxVisits) {
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
  for (const component of components) {
    const result = enumerateProofComponent(component.cells, component.clues, work);
    if (result === null) return { complete: false, visits: work.visits };
    solved.push(result);
  }

  let knownMines = 0;
  const unresolved = [];
  for (let cell = 0; cell < view.width * view.height; cell++) {
    if (view.revealed[cell]) continue;
    const fact = status.get(cell);
    if (fact === 1) knownMines++;
    else if (fact !== 2) unresolved.push(cell);
  }
  const frontier = new Set(clueIndexesByCell.keys());
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

  for (let i = 0; i < solved.length; i++) {
    const otherSums = possibleMineSums(solved, i);
    const feasibleCounts = [];
    for (const localCount of solved[i].byMineCount.keys()) {
      if ([...otherSums].some((otherCount) => {
        const seaMines = target - localCount - otherCount;
        return seaMines >= 0 && seaMines <= sea.length;
      })) {
        feasibleCounts.push(localCount);
      }
    }
    if (feasibleCounts.length === 0) {
      throw new Error('component has no globally valid layout');
    }
    for (const cell of solved[i].cells) {
      let canBeMine = false;
      let canBeSafe = false;
      for (const count of feasibleCounts) {
        const summary = solved[i].byMineCount.get(count);
        if (summary.minePossible.has(cell)) canBeMine = true;
        if (summary.safePossible.has(cell)) canBeSafe = true;
      }
      if (!canBeMine) mark(cell, 2);
      else if (!canBeSafe) mark(cell, 1);
    }
  }

  if ([...possibleSeaCounts].every((count) => count === 0)) {
    for (const cell of sea) mark(cell, 2);
  } else if ([...possibleSeaCounts].every((count) => count === sea.length)) {
    for (const cell of sea) mark(cell, 1);
  }
  return { complete: true, visits: work.visits };
}

// Sound local deduction to a fixpoint:
// - a clue needing zero/all of its unresolved cells proves them safe/mined;
// - subtracting any two overlapping residual clues can expose extreme
//   one-sided differences (strict subsets are one instance);
// - the default exact pass searches every globally consistent frontier
//   layout and applies the total mine count across components and sea.
// A work-limit result is explicitly marked incomplete. Every returned fact
// remains sound; incompleteness can withhold a certificate, never invent one.
//
// Status values remain 1=mine and 2=safe for the public test interface.
function proveFacts(view, clues, opts) {
  opts = opts || {};
  const useCount = opts.count !== false;
  const useSubset = opts.subset !== false;
  const useGlobal = opts.global !== false;
  const useExact = opts.exact !== false && useCount && useSubset && useGlobal;
  const maxVisits = Number.isFinite(opts.maxVisits)
    ? opts.maxVisits : DEFAULT_PROOF_VISITS;
  const cacheKey = useExact ? exactProofKey(view, clues, maxVisits) : null;
  if (lastExactProof && lastExactProof.key === cacheKey) return lastExactProof.facts;
  const size = view.width * view.height;
  const status = new Map();
  const mark = (cell, value) => {
    const previous = status.get(cell);
    if (previous !== undefined && previous !== value) {
      throw new Error('visible clues prove cell ' + cell + ' both safe and mined');
    }
    if (previous === undefined) status.set(cell, value);
  };

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
      for (let i = 0; i < residuals.length; i++) {
        for (let j = i + 1; j < residuals.length; j++) {
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
  if (useExact) {
    const exact = proveExactFacts(
      view, clues, status, mark, maxVisits);
    status.complete = exact.complete;
    status.visits = exact.visits;
    status.method = exact.complete ? 'all-consistent-layouts' : 'work-limit';
    lastExactProof = { key: cacheKey, facts: status };
  } else {
    status.complete = false;
    status.visits = 0;
    status.method = 'rules-only';
  }
  return status;
}

function buildStructure(view, proofOptions) {
  const size = view.width * view.height;
  if (view.revealed.length !== size || view.adjacent.length !== size) {
    throw new Error('board view has the wrong size');
  }

  const raw = rawClues(view);
  const facts = proveFacts(view, raw, proofOptions);
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
  for (const start of seaCells) {
    if (seaComponentOfCell.has(start)) continue;
    const seaIndex = seaComponents.length;
    const cells = [];
    const stack = [start];
    seaComponentOfCell.set(start, seaIndex);
    while (stack.length > 0) {
      const cell = stack.pop();
      cells.push(cell);
      for (const other of justiceNeighbors(cell, view.width, view.height)) {
        if (!seaSet.has(other) || seaComponentOfCell.has(other)) continue;
        seaComponentOfCell.set(other, seaIndex);
        stack.push(other);
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

function sameCellSet(cells, set) {
  return cells.length === set.size && cells.every((cell) => set.has(cell));
}

// Returns the complete symbolic family "all k-subsets of these cells", or
// null. Every residual clue in the component must be the same equation.
function cardinalityShape(structure, component) {
  if (component.clues.length === 0 || component.cells.length < 2) return null;
  const cellSet = new Set(component.cells);
  let mineCount = null;
  for (const clueIndex of component.clues) {
    const clue = structure.clues[clueIndex];
    if (!sameCellSet(clue.covered, cellSet)) return null;
    if (mineCount === null) mineCount = clue.count;
    else if (mineCount !== clue.count) throw new Error('equivalent clues disagree');
  }
  if (!(mineCount > 0 && mineCount < component.cells.length)) return null;
  return { cells: component.cells.slice(), mineCount };
}

// Returns the two complete alternating layouts of a connected x+y=1
// graph, after verifying every residual clue under both layouts.
function complementShape(structure, component) {
  if (component.cells.length < 2) return null;
  const cellSet = new Set(component.cells);
  const graph = new Map(component.cells.map((cell) => [cell, []]));
  for (const clueIndex of component.clues) {
    const clue = structure.clues[clueIndex];
    if (clue.covered.length !== 2 || clue.count !== 1) continue;
    const [a, b] = clue.covered;
    graph.get(a).push(b);
    graph.get(b).push(a);
  }

  const color = new Map();
  const stack = [component.cells[0]];
  color.set(component.cells[0], 0);
  while (stack.length > 0) {
    const cell = stack.pop();
    const nextColor = 1 - color.get(cell);
    for (const other of graph.get(cell)) {
      if (!color.has(other)) {
        color.set(other, nextColor);
        stack.push(other);
      } else if (color.get(other) !== nextColor) {
        return null;
      }
    }
  }
  if (color.size !== cellSet.size) return null;

  const partitionA = component.cells.filter((cell) => color.get(cell) === 0);
  const partitionB = component.cells.filter((cell) => color.get(cell) === 1);
  if (partitionA.length === 0 || partitionB.length === 0) return null;

  const aSet = new Set(partitionA);
  const bSet = new Set(partitionB);
  for (const clueIndex of component.clues) {
    const clue = structure.clues[clueIndex];
    let minesA = 0;
    let minesB = 0;
    for (const cell of clue.covered) {
      if (aSet.has(cell)) minesA++;
      if (bSet.has(cell)) minesB++;
    }
    if (minesA !== clue.count || minesB !== clue.count) return null;
  }
  return { cells: component.cells.slice(), partitionA, partitionB };
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

function fixedTemplateTotal(structure, component) {
  const cardinality = cardinalityShape(structure, component);
  if (cardinality !== null) return cardinality.mineCount;
  const complement = complementShape(structure, component);
  if (complement !== null
      && complement.partitionA.length === complement.partitionB.length) {
    return complement.partitionA.length;
  }
  return null;
}

function certifyFrontierEntry(structure, component) {
  const cardinality = cardinalityShape(structure, component);
  if (cardinality !== null
      && cardinalityBoundaryIsSealed(structure, cardinality.cells)) {
    return {
      type: 'cardinality',
      cells: cardinality.cells,
      mineCount: cardinality.mineCount,
      clearWays: cardinality.cells.length - cardinality.mineCount,
      totalWays: cardinality.cells.length,
    };
  }

  const complement = complementShape(structure, component);
  if (complement !== null
      && complement.partitionA.length === complement.partitionB.length
      && complementBoundaryIsSealed(structure, complement)) {
    return {
      type: 'complement',
      cells: complement.cells,
      mineCount: complement.partitionA.length,
      partitionA: complement.partitionA,
      partitionB: complement.partitionB,
      clearWays: 1,
      totalWays: 2,
    };
  }
  return null;
}

function certifySeaEntry(structure, clicked) {
  const seaIndex = structure.seaComponentOfCell.get(clicked);
  if (seaIndex === undefined || structure.seaComponents.length !== 1) return null;
  const cells = structure.seaComponents[seaIndex];
  if (cells.length < 2) return null;

  let frontierMines = structure.provenMineCount;
  for (const component of structure.components) {
    const total = fixedTemplateTotal(structure, component);
    if (total === null) return null;
    frontierMines += total;
  }
  const mineCount = structure.view.mines - frontierMines;
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

function validateEntryIndex(view, clicked) {
  const size = view.width * view.height;
  if (!Number.isInteger(clicked) || clicked < 0 || clicked >= size) {
    throw new Error('clicked cell is outside the board');
  }
}

// Returns compact proofs for qualifying entries while constructing the
// visible constraint structure only once. Every cell in one certified
// pocket shares its certificate, so each frontier/sea component is also
// checked only once.
function certifyEntries(view, entries) {
  for (const entry of entries) validateEntryIndex(view, entry);
  const structure = buildStructure(view);
  const certificates = new Map();
  const frontierCertificates = new Map();
  let seaCertificate;
  let seaChecked = false;

  for (const entry of entries) {
    if (view.revealed[entry] || structure.facts.has(entry)) continue;
    const componentIndex = structure.componentOfCell.get(entry);
    let certificate = null;
    if (componentIndex !== undefined) {
      if (!frontierCertificates.has(componentIndex)) {
        frontierCertificates.set(componentIndex,
          certifyFrontierEntry(structure, structure.components[componentIndex]));
      }
      certificate = frontierCertificates.get(componentIndex);
    } else if (structure.seaComponentOfCell.has(entry)) {
      if (!seaChecked) {
        seaCertificate = certifySeaEntry(structure, entry);
        seaChecked = true;
      }
      certificate = seaCertificate;
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
  neighbors: justiceNeighbors,
  rawClues,
  proveFacts,
  buildStructure,
  cardinalityShape,
  complementShape,
  certifyEntries,
  certifyEntry,
  redrawEntry,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Justice;

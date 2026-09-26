'use strict';

if (typeof Justice === 'undefined') {
  globalThis.Justice = require('./justice.js');
}

// Remaining-layout odds for a player view. Used to score a bare click
// into a cell with p(mine) > 0: absolute multiverse life lost
// (the cell's mine probability), needless life lost (excess over the
// safest available click), and a one-ply expected-remaining-life score
// so a slightly riskier but more informative click can beat a safer
// dead-end.
//
// Enumeration is exact on residual clue components plus a binomial sea.
// Over budget returns {measured: false}; callers must not invent odds.

const ODDS_VERSION = 'guess-ledger-v1';
const MAX_COMPONENT_VARS = 22;
const MAX_VISITS = 250000;

function binom(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = r * (n - k + i) / i;
  return r;
}

const SAFE_THEN_MINE = [false, true];

// Depth-first over the component's cells, safe before mine. Each residual
// clue keeps its still-needed mines and unassigned cells, so a placement
// rechecks only the clues touching that cell. Clues elsewhere cannot change
// satisfiability, so the search tree, its visit count against MAX_VISITS,
// and the solution order are exactly those of checking every clue per node.
function enumerateComponent(cells, clues, visits) {
  const n = cells.length;
  if (n > MAX_COMPONENT_VARS) return null;
  const indexOf = new Map();
  for (let i = 0; i < n; i++) indexOf.set(cells[i], i);
  const need = [];
  const open = [];
  const cluesOfCell = Array.from({ length: n }, () => []);
  for (const clue of clues) {
    const clueIndex = need.length;
    let size = 0;
    for (const cell of clue.covered) {
      const i = indexOf.get(cell);
      if (i === undefined) continue;
      cluesOfCell[i].push(clueIndex);
      size++;
    }
    if (size === 0) continue;
    need.push(clue.count);
    open.push(size);
  }
  const assign = new Array(n);
  const solutions = [];

  function place(i, mine) {
    let satisfiable = true;
    for (const clueIndex of cluesOfCell[i]) {
      open[clueIndex]--;
      if (mine) need[clueIndex]--;
      if (need[clueIndex] < 0 || need[clueIndex] > open[clueIndex]) satisfiable = false;
    }
    return satisfiable;
  }

  function unplace(i, mine) {
    for (const clueIndex of cluesOfCell[i]) {
      open[clueIndex]++;
      if (mine) need[clueIndex]++;
    }
  }

  function rec(i) {
    visits.n++;
    if (visits.n > MAX_VISITS) return false;
    if (i === n) {
      let mineCount = 0;
      const mines = new Array(n);
      for (let j = 0; j < n; j++) {
        mines[j] = assign[j];
        if (assign[j]) mineCount++;
      }
      solutions.push({ mines, mineCount });
      return true;
    }
    for (const mine of SAFE_THEN_MINE) {
      assign[i] = mine;
      const satisfiable = place(i, mine);
      if (satisfiable && !rec(i + 1)) return false;
      unplace(i, mine);
    }
    return true;
  }

  if (!rec(0)) return null;
  return solutions;
}

// Polynomial product over mine counts: coefficient k of the result counts
// the combined layouts holding k mines.
function convolveCounts(a, b) {
  const product = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === 0) continue;
    for (let j = 0; j < b.length; j++) product[i + j] += a[i] * b[j];
  }
  return product;
}

// The number of calls a depth-first walk over every combination of one
// solution per component makes (one per tree node, leaves included): the
// work unit the MAX_VISITS budget has always counted for this join.
function combinationWalkVisits(components, budget) {
  let nodes = 1;
  let level = 1;
  for (const component of components) {
    level *= component.solutions.length;
    nodes += level;
    if (nodes > budget) return budget + 1;
  }
  return nodes;
}

function analyzeView(view, opts) {
  opts = opts || {};
  const structure = Justice.buildStructure(view, opts.proof);
  const visits = { n: 0 };
  const components = [];
  for (const component of structure.components) {
    const clues = component.clues.map((i) => structure.clues[i]);
    const solutions = enumerateComponent(component.cells, clues, visits);
    if (solutions === null) return { measured: false };
    if (solutions.length === 0) return { measured: false };
    components.push({ cells: component.cells, solutions });
  }

  const seaSize = structure.seaCells.length;
  let minesLeft = view.mines - structure.provenMineCount;
  if (minesLeft < 0) return { measured: false };

  const size = view.width * view.height;
  const mineWeight = new Array(size).fill(0);
  let totalWeight = 0;

  function addSea(weight, seaMines) {
    if (seaSize === 0) return;
    const p = seaMines / seaSize;
    for (const cell of structure.seaCells) mineWeight[cell] += weight * p;
  }

  if (components.length === 0) {
    if (minesLeft > seaSize) return { measured: false };
    const w = binom(seaSize, minesLeft);
    if (w === 0 && !(seaSize === 0 && minesLeft === 0)) return { measured: false };
    totalWeight = seaSize === 0 && minesLeft === 0 ? 1 : w;
    addSea(totalWeight, minesLeft);
  } else {
    visits.n += combinationWalkVisits(components, MAX_VISITS - visits.n);
    if (visits.n > MAX_VISITS) return { measured: false };
    // Every combination of one solution per component weighs
    // binom(sea, seaMines) and depends only on its total mine count, so the
    // join groups solutions by mine count instead of visiting combinations.
    // Counts stay exact integers: the budget above bounds the combinations.
    const byCount = components.map((component) => {
      const length = component.cells.length;
      const layouts = new Array(length + 1).fill(0);
      const mineLayouts = Array.from({ length: length + 1 }, () => new Array(length).fill(0));
      for (const solution of component.solutions) {
        layouts[solution.mineCount]++;
        const perCell = mineLayouts[solution.mineCount];
        for (let i = 0; i < length; i++) if (solution.mines[i]) perCell[i]++;
      }
      return { layouts, mineLayouts };
    });
    const prefix = [[1]];
    for (const component of byCount) prefix.push(convolveCounts(prefix[prefix.length - 1], component.layouts));
    const suffix = new Array(byCount.length + 1);
    suffix[byCount.length] = [1];
    for (let c = byCount.length - 1; c >= 0; c--) suffix[c] = convolveCounts(byCount[c].layouts, suffix[c + 1]);
    const all = prefix[byCount.length];
    // seaWeight[k]: the sea's layout count when the components hold k mines.
    const seaWeight = all.map((_, mines) => {
      const seaMines = minesLeft - mines;
      return seaMines < 0 || seaMines > seaSize ? 0 : binom(seaSize, seaMines);
    });
    let seaMineWeight = 0;
    for (let mines = 0; mines < all.length; mines++) {
      if (all[mines] === 0) continue;
      const w = all[mines] * seaWeight[mines];
      totalWeight += w;
      if (seaSize > 0) seaMineWeight += w * ((minesLeft - mines) / seaSize);
    }
    for (const cell of structure.seaCells) mineWeight[cell] = seaMineWeight;
    for (let c = 0; c < byCount.length; c++) {
      const others = convolveCounts(prefix[c], suffix[c + 1]);
      const { mineLayouts } = byCount[c];
      const cells = components[c].cells;
      for (let mines = 0; mines < mineLayouts.length; mines++) {
        let restWeight = 0;
        for (let otherMines = 0; otherMines < others.length; otherMines++) {
          if (others[otherMines] !== 0) restWeight += others[otherMines] * seaWeight[mines + otherMines];
        }
        if (restWeight === 0) continue;
        const perCell = mineLayouts[mines];
        for (let i = 0; i < cells.length; i++) {
          if (perCell[i] !== 0) mineWeight[cells[i]] += perCell[i] * restWeight;
        }
      }
    }
  }

  if (totalWeight <= 0) return { measured: false };

  const pMine = new Array(size).fill(0);
  const unproven = [];
  let provenSafeOpen = false;
  for (let i = 0; i < size; i++) {
    if (view.revealed[i]) continue;
    const fact = structure.facts.get(i);
    if (fact === 2) {
      pMine[i] = 0;
      provenSafeOpen = true;
      continue;
    }
    if (fact === 1) {
      pMine[i] = 1;
      continue;
    }
    pMine[i] = mineWeight[i] / totalWeight;
    unproven.push(i);
  }

  return {
    measured: true,
    visits: visits.n,
    pMine,
    unproven,
    provenSafeOpen,
    structure,
    components,
    minesLeft,
    seaSize,
    totalWeight,
  };
}

function minRisk(odds) {
  if (odds.provenSafeOpen) return 0;
  if (odds.unproven.length === 0) return 0;
  let best = 1;
  for (const cell of odds.unproven) {
    if (odds.pMine[cell] < best) best = odds.pMine[cell];
  }
  return best;
}

// The number `cell` would show under one of its component's layouts: proven
// mines around it plus that layout's mines among `localNeighbors`. Null
// when a covered unproven neighbor lies outside the component, so no
// layout of it alone fixes the number.
function neighborCountShape(view, facts, cell, component) {
  let provenMines = 0;
  const localNeighbors = [];
  for (const nb of Justice.neighbors(cell, view.width, view.height)) {
    if (view.revealed[nb]) continue;
    const fact = facts.get(nb);
    if (fact === 1) provenMines++;
    else if (fact === 2) continue;
    else {
      const local = component.cells.indexOf(nb);
      if (local < 0) return null;
      localNeighbors.push(local);
    }
  }
  return { provenMines, localNeighbors };
}

function nextView(view, cell, number) {
  const revealed = view.revealed.slice();
  const adjacent = view.adjacent.slice();
  revealed[cell] = true;
  adjacent[cell] = number;
  return {
    width: view.width,
    height: view.height,
    mines: view.mines,
    revealed,
    adjacent,
  };
}

// One-ply expected remaining life if you click `cell` and then take the
// lowest remaining raw risk. Sea cells update by hypergeometric count.
// Frontier cells whose unknown neighbors all sit in enumerated components
// get a real number-partition lookahead. Anything else falls back to
// survival only (1 - p), which gives no information credit.
function expectedLife(view, odds, cell) {
  const pDie = odds.pMine[cell];
  if (pDie >= 1) return 0;
  const survive = 1 - pDie;
  const structure = odds.structure;
  const seaSet = structure.seaSet;

  if (seaSet.has(cell)) {
    const nextSea = odds.seaSize - 1;
    const seaMinesEst = odds.pMine[cell] * odds.seaSize;
    const nextMin = nextSea <= 0 || seaMinesEst <= 0 ? 0 : seaMinesEst / nextSea;
    let otherMin = 1;
    let otherCount = 0;
    for (const other of odds.unproven) {
      if (other === cell || seaSet.has(other)) continue;
      otherCount++;
      if (odds.pMine[other] < otherMin) otherMin = odds.pMine[other];
    }
    const nextRisk = otherCount === 0 ? nextMin : Math.min(nextMin, otherMin);
    return survive * (1 - nextRisk);
  }

  const componentIndex = structure.componentOfCell.get(cell);
  if (componentIndex === undefined) return survive;

  const component = odds.components[componentIndex];
  const local = component.cells.indexOf(cell);
  if (local < 0) return survive;

  const shape = neighborCountShape(view, structure.facts, cell, component);
  const buckets = new Map();
  let safeWeight = 0;
  for (const sol of component.solutions) {
    if (sol.mines[local]) continue;
    if (shape === null) return survive;
    let number = shape.provenMines;
    for (const i of shape.localNeighbors) if (sol.mines[i]) number++;
    const key = String(number);
    buckets.set(key, (buckets.get(key) || 0) + 1);
    safeWeight++;
  }
  if (safeWeight === 0) return 0;

  let value = 0;
  buckets.forEach((count, key) => {
    const next = analyzeView(nextView(view, cell, Number(key)), {
      // One-ply scoring can inspect up to forty hypothetical positions.
      // Keep each canonical proof bounded; incomplete facts remain sound,
      // and the odds enumerator either solves the residual or reports that
      // this branch was unmeasured.
      proof: { maxVisits: 80000 },
    });
    const nextMin = next.measured ? minRisk(next) : minRisk(odds);
    value += (count / safeWeight) * (1 - nextMin);
  });
  return survive * value;
}

// Score a bare click into `clicked`. Returns null when the click is not
// a guess: already revealed, proven safe by the canonical constraint
// solver, or p(mine) is 0 in every enumerated layout after a proof search
// that explicitly ended incomplete at its work limit.
function scoreGuess(view, clicked, opts) {
  opts = opts || {};
  if (view.revealed[clicked]) return null;
  const facts = Justice.proveFacts(view, Justice.rawClues(view));
  if (facts.get(clicked) === 2) return null;

  const odds = analyzeView(view);
  if (!odds.measured) return { measured: false };

  const p = odds.pMine[clicked];
  if (!(p > 1e-12)) return null;
  const minP = minRisk(odds);
  const bestCells = [];
  for (let i = 0; i < view.revealed.length; i++) {
    if (!view.revealed[i] && odds.pMine[i] <= minP + 1e-12) bestCells.push(i);
  }
  const lifeNeedless = Math.max(0, p - minP);
  const idealRisk = !odds.provenSafeOpen && p <= minP + 1e-12;
  let justiceCertificates = new Map();
  if (opts.considerJustice === true) {
    try {
      // Certification depends only on this one visible position. Batch all
      // candidates so the board's proof structure is built once, rather
      // than once per covered cell on the click-critical path.
      justiceCertificates = Justice.certifyEntries(view, odds.unproven);
    } catch (err) {
      justiceCertificates = new Map();
    }
  }
  const justice = justiceCertificates.has(clicked);
  const actualP = justice ? 0 : p;
  const actualMinP = justiceCertificates.size > 0 ? 0 : minP;

  let expected = 1 - (justice ? 0 : p);
  let bestExpected = expected;
  let bestExpectedCells = [clicked];
  let perfectPlay = idealRisk;
  if (odds.provenSafeOpen) {
    bestExpected = 1;
    bestExpectedCells = bestCells;
    perfectPlay = false;
  }
  const cheap = !odds.provenSafeOpen && odds.visits < 80000 && odds.unproven.length <= 40;
  if (cheap && odds.unproven.length > 0) {
    expected = expectedLife(view, odds, clicked);
    if (justice) expected = Math.max(expected, 1 - minRisk({
      measured: true,
      unproven: odds.unproven.filter((c) => c !== clicked),
      pMine: odds.pMine,
    }));
    bestExpected = expected;
    perfectPlay = true;
    for (const other of odds.unproven) {
      if (other === clicked) continue;
      let life = expectedLife(view, odds, other);
      if (justiceCertificates.has(other)) {
        life = Math.max(life, 1 - minRisk({
          measured: true,
          unproven: odds.unproven.filter((c) => c !== other),
          pMine: odds.pMine,
        }));
      }
      if (life > bestExpected + 1e-9) {
        bestExpected = life;
        bestExpectedCells = [other];
        perfectPlay = false;
      } else if (Math.abs(life - bestExpected) <= 1e-9) {
        bestExpectedCells.push(other);
      }
    }
  }

  return {
    measured: true,
    cell: clicked,
    p,
    minP,
    actualP,
    actualMinP,
    bestCells,
    lifeLost: p,
    lifeNeedless,
    expectedLife: expected,
    bestExpectedLife: bestExpected,
    bestExpectedCells,
    idealRisk,
    perfectPlay,
    justice,
    needlessGuess: !idealRisk,
  };
}

const Odds = {
  VERSION: ODDS_VERSION,
  binom,
  analyzeView,
  minRisk,
  expectedLife,
  scoreGuess,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Odds;

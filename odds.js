'use strict';

if (typeof Justice === 'undefined') {
  globalThis.Justice = require('./justice.js');
}

// Remaining-layout odds for a player view. Used to score a bare click
// into a cell that is not proven safe: absolute multiverse life lost
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

function enumerateComponent(cells, clues, visits) {
  const n = cells.length;
  if (n > MAX_COMPONENT_VARS) return null;
  const indexOf = new Map();
  for (let i = 0; i < n; i++) indexOf.set(cells[i], i);
  const residuals = [];
  for (const clue of clues) {
    const idx = [];
    for (const cell of clue.covered) {
      const i = indexOf.get(cell);
      if (i !== undefined) idx.push(i);
    }
    if (idx.length > 0) residuals.push({ idx, count: clue.count });
  }
  const assign = new Array(n);
  const solutions = [];

  function consistent(upto) {
    for (const clue of residuals) {
      let mines = 0;
      let unknown = 0;
      for (const i of clue.idx) {
        if (i >= upto) unknown++;
        else if (assign[i]) mines++;
      }
      if (mines > clue.count || mines + unknown < clue.count) return false;
    }
    return true;
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
    assign[i] = false;
    if (consistent(i + 1) && !rec(i + 1)) return false;
    assign[i] = true;
    if (consistent(i + 1) && !rec(i + 1)) return false;
    return true;
  }

  if (!rec(0)) return null;
  return solutions;
}

function analyzeView(view) {
  const structure = Justice.buildStructure(view);
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

  function walk(index, minesUsed, weight, pick) {
    visits.n++;
    if (visits.n > MAX_VISITS) return false;
    if (index === components.length) {
      const seaMines = minesLeft - minesUsed;
      if (seaMines < 0 || seaMines > seaSize) return true;
      const w = weight * binom(seaSize, seaMines);
      if (w === 0) return true;
      totalWeight += w;
      for (let c = 0; c < components.length; c++) {
        const sol = components[c].solutions[pick[c]];
        for (let i = 0; i < components[c].cells.length; i++) {
          if (sol.mines[i]) mineWeight[components[c].cells[i]] += w;
        }
      }
      addSea(w, seaMines);
      return true;
    }
    const solutions = components[index].solutions;
    for (let s = 0; s < solutions.length; s++) {
      pick[index] = s;
      if (!walk(index + 1, minesUsed + solutions[s].mineCount, weight, pick)) {
        return false;
      }
    }
    return true;
  }

  if (components.length === 0) {
    if (minesLeft > seaSize) return { measured: false };
    const w = binom(seaSize, minesLeft);
    if (w === 0 && !(seaSize === 0 && minesLeft === 0)) return { measured: false };
    totalWeight = seaSize === 0 && minesLeft === 0 ? 1 : w;
    addSea(totalWeight, minesLeft);
  } else if (!walk(0, 0, 1, new Array(components.length))) {
    return { measured: false };
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

function neighborMineCount(view, facts, cell, componentMineAt) {
  let count = 0;
  for (const nb of Justice.neighbors(cell, view.width, view.height)) {
    if (view.revealed[nb]) continue;
    const fact = facts.get(nb);
    if (fact === 1) count++;
    else if (fact === 2) continue;
    else if (componentMineAt && componentMineAt.has(nb)) {
      if (componentMineAt.get(nb)) count++;
    } else {
      return null;
    }
  }
  return count;
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

  const buckets = new Map();
  let safeWeight = 0;
  for (const sol of component.solutions) {
    if (sol.mines[local]) continue;
    const mineAt = new Map();
    for (let i = 0; i < component.cells.length; i++) {
      mineAt.set(component.cells[i], sol.mines[i]);
    }
    const number = neighborMineCount(view, structure.facts, cell, mineAt);
    if (number === null) return survive;
    const key = String(number);
    buckets.set(key, (buckets.get(key) || 0) + 1);
    safeWeight++;
  }
  if (safeWeight === 0) return 0;

  let value = 0;
  buckets.forEach((count, key) => {
    const next = analyzeView(nextView(view, cell, Number(key)));
    const nextMin = next.measured ? minRisk(next) : minRisk(odds);
    value += (count / safeWeight) * (1 - nextMin);
  });
  return survive * value;
}

function justiceWouldSave(view, cell) {
  try {
    return Justice.certifyEntry(view, cell) !== null;
  } catch (err) {
    return false;
  }
}

// Score a bare click into `clicked`. Returns null when the click is not
// a guess (proven safe) or when odds cannot be measured.
function scoreGuess(view, clicked, opts) {
  opts = opts || {};
  if (view.revealed[clicked]) return null;
  const facts = Justice.proveFacts(view, Justice.rawClues(view));
  if (facts.get(clicked) === 2) return null;

  const odds = analyzeView(view);
  if (!odds.measured) return { measured: false };

  const p = odds.pMine[clicked];
  const minP = minRisk(odds);
  const lifeNeedless = Math.max(0, p - minP);
  const idealRisk = !odds.provenSafeOpen && p <= minP + 1e-12;
  const justice = opts.considerJustice === true && justiceWouldSave(view, clicked);

  let expected = 1 - (justice ? 0 : p);
  let bestExpected = expected;
  let perfectPlay = idealRisk;
  if (odds.provenSafeOpen) {
    bestExpected = 1;
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
      if (opts.considerJustice === true && justiceWouldSave(view, other)) {
        life = Math.max(life, 1 - minRisk({
          measured: true,
          unproven: odds.unproven.filter((c) => c !== other),
          pMine: odds.pMine,
        }));
      }
      if (life > bestExpected + 1e-9) {
        bestExpected = life;
        perfectPlay = false;
      }
    }
  }

  return {
    measured: true,
    cell: clicked,
    p,
    minP,
    lifeLost: p,
    lifeNeedless,
    expectedLife: expected,
    bestExpectedLife: bestExpected,
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

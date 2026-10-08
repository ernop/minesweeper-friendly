'use strict';

// Switch cost: how much longer the next press takes after changing mouse
// buttons (flag versus click or chord) than after repeating the same move.
// Spec: docs/product/trace-metrics-panel.md ("Switching"); study and
// estimator choice: reference/mode-switch-2026-09-28.md. Pure: the session
// stats' switch-cost row runs it in switch-cost-worker.js over the saved
// traces of the session's and the latest standard games, and Node tests load
// it directly.
//
// Per game, every pair of consecutive board inputs that are both moves
// (reveal, chord, flag; no other input between them) is one transition,
// timed press to press. The estimate is the pre-registered model P1 of the
// study: least squares on log interval with one intercept per game,
// previous and next move type, the button switch S and the same-button
// change of move T, natural cubic splines of travel distance (Fitts index),
// of the cells the previous move opened, and of board progress, whether the
// previous move opened an empty region, whether single-number logic offered
// the next target, and what the board offered before the next move. Its
// interval is cluster-robust by game.

// The latest standard games that have a timed transition.
const SWITCH_COST_WINDOW_GAMES = 500;
// Below this many games the interval is too wide to show a value.
const SWITCH_COST_MIN_GAMES = 30;
const SWITCH_COST_INTERVAL_MIN_MS = 40;
const SWITCH_COST_INTERVAL_MAX_MS = 5000;
// Standard play on the three standard boards with the default generator.
const SWITCH_COST_KEYS = {
  '9x9/10@standard': { width: 9, height: 9, mines: 10 },
  '16x16/40@standard': { width: 16, height: 16, mines: 40 },
  '30x16/99@standard': { width: 30, height: 16, mines: 99 },
};
// Layout events measure the board's border box; the cell grid is inset by
// the bevel, one eighth of a cell (style.css --bevel-size).
const SWITCH_COST_BEVEL_CELLS = 1 / 8;
const SWITCH_COST_MOVES = { reveal: 'reveal', 'chord-single': 'chord', 'chord-multi': 'chord', flag: 'flag' };
const SWITCH_COST_Z95 = 1.959963984540054;

// What the visible board offers by single-number logic: numbers that can be
// chorded, covered cells they prove safe, covered cells a number proves to be
// mines. Uses only what the player sees (numbers and flags).
function switchCostOffers(view) {
  const { revealed, flagged, adjacent, around } = view;
  let chordable = 0;
  const safe = new Set();
  const mine = new Set();
  for (let r = 0; r < revealed.length; r++) {
    if (!revealed[r] || adjacent[r] === 0) continue;
    let flags = 0;
    const covered = [];
    for (const c of around[r]) {
      if (flagged[c]) flags++;
      else if (!revealed[c]) covered.push(c);
    }
    if (covered.length === 0) continue;
    if (flags === adjacent[r]) {
      chordable++;
      for (const c of covered) safe.add(c);
    }
    if (adjacent[r] - flags === covered.length) for (const c of covered) mine.add(c);
  }
  return { chordable, safe, mine };
}

// The press that performed each board input: a left release's latest left
// press, a right press itself. Inputs are TrainingCore.boardInputs(trace).
// A release can lack its press (the button was held while Space started the
// game); that input then has none and times no transition.
function switchCostPresses(trace, inputs) {
  const pressOf = new Map();
  let pendingLeft = null;
  for (const event of trace.events) {
    if (event.kind === 'ldown') pendingLeft = event;
    else if (event.kind === 'lup') {
      pressOf.set(event, pendingLeft);
      pendingLeft = null;
    }
  }
  return inputs.map((event) => (event.kind === 'rdown' ? event : pressOf.get(event)));
}

function switchCostLayoutAt(layouts, t) {
  let current = null;
  for (const layout of layouts) {
    if (layout.t > t) break;
    current = layout;
  }
  return current;
}

// One game's timed transitions, or the replay status saying why it has none.
// `board` is SWITCH_COST_KEYS[key]; `deps` is TrainingCore.replay's deps plus
// `training`, the TrainingCore module (the replay with the game's rules).
// Every trace opens with a layout event (beginTrace), so each press has one.
function switchCostGameRows(trace, outcome, board, deps) {
  const layouts = trace.events.filter((event) => event.kind === 'layout');
  const TrainingCore = deps.training;
  const replay = TrainingCore.replay(trace, outcome, board, deps, (event, view) => {
    const offers = switchCostOffers(view);
    return {
      progress: view.revealedCount / view.safeCount,
      chordable: offers.chordable, safe: offers.safe.size, mine: offers.mine.size,
      offeredSafe: offers.safe.has(event.index), offeredMine: offers.mine.has(event.index),
    };
  });
  if (replay.status !== 'replayed') return { status: replay.status, rows: [] };
  const inputs = TrainingCore.boardInputs(trace);
  const presses = switchCostPresses(trace, inputs);
  const last = layouts[layouts.length - 1];
  const cellPx = last.width / (board.width + 2 * SWITCH_COST_BEVEL_CELLS);
  const rows = [];
  for (let k = 1; k < replay.steps.length; k++) {
    const a = replay.steps[k - 1];
    const b = replay.steps[k];
    const prev = SWITCH_COST_MOVES[a.kind];
    const next = SWITCH_COST_MOVES[b.kind];
    const pressA = presses[k - 1];
    const pressB = presses[k];
    if (prev === undefined || next === undefined || !pressA || !pressB) continue;
    const intervalMs = pressB.t - pressA.t;
    if (intervalMs < SWITCH_COST_INTERVAL_MIN_MS || intervalMs > SWITCH_COST_INTERVAL_MAX_MS) continue;
    const layoutA = switchCostLayoutAt(layouts, pressA.t);
    const layoutB = switchCostLayoutAt(layouts, pressB.t);
    const sameRect = layoutA.left === layoutB.left && layoutA.top === layoutB.top
      && layoutA.width === layoutB.width && layoutA.height === layoutB.height;
    const distancePx = sameRect
      ? Math.hypot(pressB.x - pressA.x, pressB.y - pressA.y)
      : Math.hypot((b.index % board.width) - (a.index % board.width),
        Math.floor(b.index / board.width) - Math.floor(a.index / board.width)) * cellPx;
    const prevButton = prev === 'flag' ? 'R' : 'L';
    const nextButton = next === 'flag' ? 'R' : 'L';
    rows.push({
      intervalMs, prev, next,
      switched: prevButton !== nextButton,
      leftMoveChanged: prevButton === 'L' && nextButton === 'L' && prev !== next,
      fitts: Math.log2(1 + distancePx / cellPx),
      openedByPrevious: a.opened,
      previousOpenedEmpty: a.openedZeros > 0,
      progress: b.before.progress,
      offered: next === 'chord' || (next === 'reveal' ? b.before.offeredSafe : b.before.offeredMine),
      chordable: b.before.chordable, safe: b.before.safe, mine: b.before.mine,
    });
  }
  return { status: 'measured', rows };
}

// numpy.percentile's default ("linear") interpolation, including its
// two-sided lerp, so knots agree bit for bit with the reference fit
// (analysis/switch-cost/reference.py).
function switchCostPercentile(sorted, q) {
  const position = (sorted.length - 1) * (q / 100);
  const below = Math.floor(position);
  const above = Math.min(below + 1, sorted.length - 1);
  const t = position - below;
  const a = sorted[below];
  const b = sorted[above];
  const diff = b - a;
  return t >= 0.5 ? b - diff * (1 - t) : a + diff * t;
}

// Values closer than this count as one when knots are placed. patsy uses
// exactly distinct doubles, so a last-bit difference in how two engines
// compute the same distance moved its knots (found in the parity run).
const SWITCH_COST_KNOT_TOLERANCE = 1e-9;

// patsy cr(x, df) without constraints: df knots, the minimum and maximum plus
// df - 2 inner knots at equally spaced percentiles of the distinct values.
// Null when the values cannot supply df distinct knots.
function switchCostKnots(values, df) {
  const sorted = Float64Array.from(values).sort();
  const distinct = [sorted[0]];
  for (const value of sorted) {
    if (value - distinct[distinct.length - 1] > SWITCH_COST_KNOT_TOLERANCE) distinct.push(value);
  }
  const knots = [sorted[0]];
  for (let i = 1; i <= df - 2; i++) knots.push(switchCostPercentile(distinct, (100 * i) / (df - 1)));
  knots.push(sorted[sorted.length - 1]);
  for (let i = 1; i < knots.length; i++) {
    if (!(knots[i] - knots[i - 1] > SWITCH_COST_KNOT_TOLERANCE)) return null;
  }
  return knots;
}

// A basis of the natural cubic splines with these knots, less the constant
// (the game intercepts absorb it): x, then d_k - d_{K-1} (ESL eq. 5.4-5.5).
// It spans the same space as patsy's cr basis, so fitted effects agree.
function switchCostSplineColumns(x, knots) {
  const K = knots.length;
  const last = knots[K - 1];
  const cube = (u) => (u > 0 ? u * u * u : 0);
  const d = (v, k) => (cube(v - knots[k]) - cube(v - last)) / (last - knots[k]);
  const columns = [x];
  for (let k = 0; k <= K - 3; k++) {
    const column = new Float64Array(x.length);
    for (let i = 0; i < x.length; i++) column[i] = d(x[i], k) - d(x[i], K - 2);
    columns.push(column);
  }
  return columns;
}

// P1's design, in the study's column order: previous chord, previous flag,
// next chord, next flag, S, T, the spline of the Fitts index, of log(1 +
// cells the previous move opened), the previous move opened an empty
// region, the spline of progress, offered next reveal, offered next flag
// (an offered chord is every chord), log(1 + chordable numbers), log(1 +
// proven-safe cells), log(1 + proven-mine cells).
function switchCostDesign(rows) {
  const n = rows.length;
  const column = (of) => {
    const values = new Float64Array(n);
    for (let i = 0; i < n; i++) values[i] = of(rows[i]);
    return values;
  };
  const splines = [];
  for (const [of, df] of [[(r) => r.fitts, 4], [(r) => Math.log1p(r.openedByPrevious), 3], [(r) => r.progress, 4]]) {
    const x = column(of);
    const knots = switchCostKnots(x, df);
    if (knots === null) return null;
    splines.push(switchCostSplineColumns(x, knots));
  }
  const columns = [
    ['previous chord', column((r) => (r.prev === 'chord' ? 1 : 0))],
    ['previous flag', column((r) => (r.prev === 'flag' ? 1 : 0))],
    ['next chord', column((r) => (r.next === 'chord' ? 1 : 0))],
    ['next flag', column((r) => (r.next === 'flag' ? 1 : 0))],
    ['S', column((r) => (r.switched ? 1 : 0))],
    ['T', column((r) => (r.leftMoveChanged ? 1 : 0))],
    ...splines[0].map((values, i) => ['fitts spline ' + i, values]),
    ...splines[1].map((values, i) => ['opened spline ' + i, values]),
    ['previous opened empty', column((r) => (r.previousOpenedEmpty ? 1 : 0))],
    ...splines[2].map((values, i) => ['progress spline ' + i, values]),
    ['offered next reveal', column((r) => (r.next === 'reveal' && r.offered ? 1 : 0))],
    ['offered next flag', column((r) => (r.next === 'flag' && r.offered ? 1 : 0))],
    ['log chordable', column((r) => Math.log1p(r.chordable))],
    ['log proven safe', column((r) => Math.log1p(r.safe))],
    ['log proven mine', column((r) => Math.log1p(r.mine))],
  ];
  return columns;
}

// Subtracts each game's mean (the game fixed effects, by Frisch-Waugh-Lovell).
function switchCostDemean(values, groupOf, groupCount) {
  const sums = new Float64Array(groupCount);
  const counts = new Float64Array(groupCount);
  for (let i = 0; i < values.length; i++) {
    sums[groupOf[i]] += values[i];
    counts[groupOf[i]]++;
  }
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = values[i] - sums[groupOf[i]] / counts[groupOf[i]];
  return out;
}

// Least squares by Householder QR in column order. A column that previous
// columns already span (a zero-variance or exactly collinear term) is left
// out, as the study's fit did, and the rest keep their order.
function switchCostLeastSquares(columns, y) {
  const n = y.length;
  const work = columns.map(([, values]) => Float64Array.from(values));
  const rhs = Float64Array.from(y);
  const kept = [];
  const reflectors = [];
  const rDiag = [];
  const rUpper = [];
  for (let j = 0; j < work.length; j++) {
    const col = work[j];
    const row = kept.length;
    let norm2 = 0;
    for (let i = row; i < n; i++) norm2 += col[i] * col[i];
    let original2 = 0;
    for (let i = 0; i < n; i++) original2 += columns[j][1][i] * columns[j][1][i];
    if (original2 === 0 || norm2 <= 1e-20 * original2) continue;
    const norm = Math.sqrt(norm2);
    const alpha = col[row] > 0 ? -norm : norm;
    const v = new Float64Array(n - row);
    v[0] = col[row] - alpha;
    for (let i = row + 1; i < n; i++) v[i - row] = col[i];
    let vv = 0;
    for (let i = 0; i < v.length; i++) vv += v[i] * v[i];
    const apply = (target) => {
      let dot = 0;
      for (let i = 0; i < v.length; i++) dot += v[i] * target[row + i];
      const scale = (2 * dot) / vv;
      for (let i = 0; i < v.length; i++) target[row + i] -= scale * v[i];
    };
    for (let m = j + 1; m < work.length; m++) apply(work[m]);
    apply(rhs);
    col[row] = alpha;
    kept.push(j);
    reflectors.push(v);
    rDiag.push(alpha);
  }
  const p = kept.length;
  for (let a = 0; a < p; a++) {
    const rowValues = new Float64Array(p);
    rowValues[a] = rDiag[a];
    for (let b = a + 1; b < p; b++) rowValues[b] = work[kept[b]][a];
    rUpper.push(rowValues);
  }
  const beta = new Float64Array(p);
  for (let a = p - 1; a >= 0; a--) {
    let s = rhs[a];
    for (let b = a + 1; b < p; b++) s -= rUpper[a][b] * beta[b];
    beta[a] = s / rUpper[a][a];
  }
  // (X'X)^-1 e_j = R^-1 R^-T e_j, for the sandwich.
  const inverseColumn = (target) => {
    const z = new Float64Array(p);
    for (let a = 0; a < p; a++) {
      let s = a === target ? 1 : 0;
      for (let b = 0; b < a; b++) s -= rUpper[b][a] * z[b];
      z[a] = s / rUpper[a][a];
    }
    const out = new Float64Array(p);
    for (let a = p - 1; a >= 0; a--) {
      let s = z[a];
      for (let b = a + 1; b < p; b++) s -= rUpper[a][b] * out[b];
      out[a] = s / rUpper[a][a];
    }
    return out;
  };
  return { kept, beta, inverseColumn };
}

function switchCostMedian(values) {
  const sorted = Float64Array.from(values).sort();
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// P1 over the games' transitions. `games` is [{ endedAt, rows }], each with
// at least one row. Status 'not-measurable' when too few games or when the
// data cannot identify the switch term.
function switchCostFit(games) {
  const counted = { games: games.length, transitions: games.reduce((sum, game) => sum + game.rows.length, 0) };
  if (games.length < SWITCH_COST_MIN_GAMES) return { status: 'too-few-games', ...counted };
  const rows = [];
  const groupOf = [];
  games.forEach((game, g) => {
    for (const row of game.rows) {
      rows.push(row);
      groupOf.push(g);
    }
  });
  const design = switchCostDesign(rows);
  if (design === null) return { status: 'not-measurable', ...counted };
  const y = Float64Array.from(rows, (row) => Math.log(row.intervalMs));
  const groups = games.length;
  const demeaned = design.map(([name, values]) => [name, switchCostDemean(values, groupOf, groups)]);
  const yd = switchCostDemean(y, groupOf, groups);
  const fit = switchCostLeastSquares(demeaned, yd);
  const switchColumn = fit.kept.indexOf(design.findIndex(([name]) => name === 'S'));
  if (switchColumn === -1) return { status: 'not-measurable', ...counted };
  const n = rows.length;
  const p = fit.kept.length;
  const residual = Float64Array.from(yd);
  fit.kept.forEach((j, a) => {
    const values = demeaned[j][1];
    for (let i = 0; i < n; i++) residual[i] -= fit.beta[a] * values[i];
  });
  const weights = fit.inverseColumn(switchColumn);
  const scores = new Float64Array(groups);
  for (let i = 0; i < n; i++) {
    let w = 0;
    fit.kept.forEach((j, a) => { w += weights[a] * demeaned[j][1][i]; });
    scores[groupOf[i]] += w * residual[i];
  }
  let meat = 0;
  for (const score of scores) meat += score * score;
  const correction = (groups / (groups - 1)) * ((n - 1) / (n - p));
  const beta = fit.beta[switchColumn];
  const se = Math.sqrt(correction * meat);
  const switchIntervals = rows.filter((row) => row.switched).map((row) => row.intervalMs);
  const medianSwitchMs = switchCostMedian(switchIntervals);
  const percent = (b) => 100 * Math.expm1(b);
  return {
    status: 'measured', ...counted, columns: p, beta, se,
    percent: percent(beta),
    percentLow: percent(beta - SWITCH_COST_Z95 * se),
    percentHigh: percent(beta + SWITCH_COST_Z95 * se),
    medianSwitchMs,
    msPerSwitch: medianSwitchMs * -Math.expm1(-beta),
    switchShare: switchIntervals.length / n,
  };
}

// The window: walking `candidates` newest first, the first
// SWITCH_COST_WINDOW_GAMES games with a timed transition. `gameOf` loads one
// candidate's { endedAt, rows }, or null when its trace is not saved; it may
// be async, and no candidate past the window is loaded.
async function switchCostWindow(candidates, gameOf) {
  const games = [];
  for (const candidate of candidates) {
    const game = await gameOf(candidate);
    if (game === null || game.rows.length === 0) continue;
    games.push(game);
    if (games.length === SWITCH_COST_WINDOW_GAMES) break;
  }
  return games;
}

// The session: walking `candidates` newest first, every game that ended at or
// after `fromMs` (the session window's inclusive start) and has a timed
// transition, however many. `gameOf` is as for the window; no candidate that
// ended before `fromMs` is loaded.
async function switchCostSince(candidates, fromMs, gameOf) {
  const games = [];
  for (const candidate of candidates) {
    if (candidate.endedAt < fromMs) break;
    const game = await gameOf(candidate);
    if (game === null || game.rows.length === 0) continue;
    games.push(game);
  }
  return games;
}

const SwitchCost = {
  WINDOW_GAMES: SWITCH_COST_WINDOW_GAMES,
  MIN_GAMES: SWITCH_COST_MIN_GAMES,
  KNOT_TOLERANCE: SWITCH_COST_KNOT_TOLERANCE,
  INTERVAL_MIN_MS: SWITCH_COST_INTERVAL_MIN_MS,
  INTERVAL_MAX_MS: SWITCH_COST_INTERVAL_MAX_MS,
  KEYS: SWITCH_COST_KEYS,
  offers: switchCostOffers,
  gameRows: switchCostGameRows,
  knots: switchCostKnots,
  splineColumns: switchCostSplineColumns,
  design: switchCostDesign,
  fit: switchCostFit,
  window: switchCostWindow,
  since: switchCostSince,
};

if (typeof module !== 'undefined' && module.exports) module.exports = SwitchCost;

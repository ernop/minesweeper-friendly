'use strict';
// Decision situations: which logic each move needed, how long the thinking
// part took, which patterns players resolve at the speed of trivial moves
// (memorized) versus by working them out, and where one player stands among
// players of the same speed on each trait.
//
// For every reveal and flag in a game (shared format from corpus_actions.py and
// user_games.js, with its mine layout), the visible board before the move is
// run through the game's own proof engine (justice.js) at three strengths:
//   one      a single number settles the cell (counting alone);
//   two      two overlapping numbers settle it (the pairwise difference rule:
//            1-1 and 1-2 against a wall, reductions around known mines);
//   more     only more numbers or the global mine count settle it;
//   guess    nothing visible settles it (or the search reached its limit).
// A move is "fresh" when the cell was not settled by the same logic before the
// previous move (the previous move revealed what made it solvable), and
// "queued" otherwise. Thinking time is the gap minus cursor travel: reaction
// before the cursor starts moving plus hover on the target (the split used by
// compare.py). A fresh two-number move is "fluent" when its thinking time is
// within FLUENT_MARGIN_MS of the same player's median fresh one-number reveal:
// the pattern cost no more thought than reading a single number.
//
// Patterns are named two ways, both the same under all 8 rotations and mirror
// images of the board:
//   pair  the two numbers of the difference rule that settles the move, their
//         remaining mine counts, their unsettled cells, walls, and the target;
//   line  when those two numbers sit side by side on a straight edge, every
//         number along that edge (up to two beyond the pair on each side),
//         each written as its remaining mine count and its three cells in the
//         row beside the edge: u unsettled, . open or settled, # off the board.
//         A 1-2-2-1 against an open row reads "1uuu 2uuu 2uuu 1uuu".
// Mine-for-safe complements are kept apart: they show different numbers. A
// fresh exact pattern occurs only a few times per game, so levels are also
// compared on pattern families: the remaining mine counts of the number whose
// own cells hold the target and of the other number, what the rule proves
// there, and whether either number touches the board edge ("1/1 safe wall" is
// the 1-1 against a wall: the square past the second 1 is safe).
//
// Your speed is compared with the average game at your speed: each trait's
// value is interpolated in ln(3BV/s) between the two levels around yours, and
// bootstrap resampling of games gives 95% intervals for you, for that
// expectation, and for the gap. Replay parsers count the right half of a
// both-button chord as a click that changed nothing, so efficiency is compared
// on effective clicks only (reveals, chords, flags, unflags).
//
// Usage: node situations.js OUT.json GAMES.jsonl [GAMES.jsonl ...]
// The file of your own games (source "self", from user_games.js) is required.

const fs = require('fs');
const path = require('path');
const Justice = require(path.join(__dirname, '..', '..', 'justice.js'));

const W = 30;
const H = 16;
const MINES = 99;
const N = W * H;
const ONSET_CELLS = 0.25;
const EXACT_VISITS = 200000;
const LEVEL_BANDS = [[1.0, 1.4], [1.4, 1.8], [1.8, 2.2], [2.2, 2.6], [2.6, 3.0], [3.0, 3.5], [3.5, 9]];
const FLUENT_MARGIN_MS = 60;
// Gaps longer than this are breaks rather than decisions.
const DECISION_GAP_MAX_MS = 3000;
// Time beyond this in one gap counts as pausing.
const PAUSE_FROM_MS = 1000;
// A player's two-number moves are judged fluent or not only when the player
// has at least this many timed fresh one-number reveals as a baseline.
const MIN_BASELINE = 15;
// Travel is compared on moves of this length (cells), so players who make
// longer moves on average are not charged for it.
const TRAVEL_DISTANCE = [2, 6];
// Move lengths (squares) for travel by distance.
const TRAVEL_BUCKETS = [[1, 2], [2, 4], [4, 8], [8, Infinity]];
const bucketName = ([low, high]) => (high === Infinity ? `${low}+` : `${low}-${high}`);
const TOP_PATTERNS = 30;
// A family counts as memorized at a level when this share of its judged
// fresh moves there is fluent, over at least MEMORIZED_MIN_N moves.
const MEMORIZED_SHARE = 0.75;
const MEMORIZED_MIN_N = 8;
const BOOTSTRAP = 400;
const BOOTSTRAP_SEED = 20260926;

const NEIGHBORS = Array.from({ length: N }, (_, i) => {
  const x = i % W;
  const y = Math.floor(i / W);
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((dx || dy) && x + dx >= 0 && x + dx < W && y + dy >= 0 && y + dy < H) out.push((y + dy) * W + x + dx);
    }
  }
  return out;
});

const TRANSFORMS = [
  ([x, y]) => [x, y], ([x, y]) => [-y, x], ([x, y]) => [-x, -y], ([x, y]) => [y, -x],
  ([x, y]) => [-x, y], ([x, y]) => [x, -y], ([x, y]) => [y, x], ([x, y]) => [-y, -x],
];

function median(values) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mean(values) {
  return values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length;
}

function adjacencyOf(mine) {
  const adjacent = new Array(N).fill(0);
  for (let i = 0; i < N; i++) if (mine[i]) for (const n of NEIGHBORS[i]) adjacent[n]++;
  return adjacent;
}

function clueList(revealed, adjacent) {
  const clues = [];
  for (let i = 0; i < N; i++) {
    if (!revealed[i]) continue;
    const covered = NEIGHBORS[i].filter((n) => !revealed[n]);
    if (covered.length > 0) clues.push({ cell: i, covered, count: adjacent[i] });
  }
  return clues;
}

// Facts map a cell to 1 (mine) or 2 (safe).
function settle(revealed, adjacent) {
  const view = { width: W, height: H, mines: MINES, revealed, adjacent };
  const clues = clueList(revealed, adjacent);
  const one = Justice.proveFacts(view, clues, { subset: false, global: false, exact: false });
  const two = Justice.proveFacts(view, clues, { global: false, exact: false });
  return { view, clues, one, two };
}

function exactFacts(state) {
  return Justice.proveFacts(state.view, state.clues, { maxVisits: EXACT_VISITS });
}

function exactFact(state, cell) {
  const facts = exactFacts(state);
  if (facts.has(cell)) return 'more';
  return facts.complete ? 'guess' : 'unresolved';
}

// Each number's cells not settled by single-number counting, and the mines it
// still needs among them.
function residualClues(state) {
  const residual = new Map();
  for (const clue of state.clues) {
    const unknown = clue.covered.filter((c) => !state.one.has(c));
    if (unknown.length === 0) continue;
    const need = clue.count - clue.covered.filter((c) => state.one.get(c) === 1).length;
    residual.set(clue.cell, { cell: clue.cell, unknown, need, set: new Set(unknown) });
  }
  return residual;
}

// The pair of numbers whose difference rule settles the target directly;
// null when the target needs a chain.
function decisivePair(residual, target, truth) {
  const entries = [...residual.values()];
  for (const a of entries) {
    for (const b of entries) {
      if (a === b) continue;
      if (!a.unknown.some((c) => b.set.has(c))) continue;
      if (!a.set.has(target) && !b.set.has(target)) continue;
      const aOnly = a.unknown.filter((c) => !b.set.has(c));
      const bOnly = b.unknown.filter((c) => !a.set.has(c));
      const difference = a.need - b.need;
      let marks = null;
      if (difference === aOnly.length) marks = [[aOnly, 1], [bOnly, 2]];
      else if (difference === -bOnly.length) marks = [[aOnly, 2], [bOnly, 1]];
      if (marks === null) continue;
      for (const [cells, value] of marks) {
        if (cells.includes(target) && value === truth) return { a, b };
      }
    }
  }
  return null;
}

function patternKey(pair, target, truth) {
  const ax = pair.a.cell % W;
  const ay = Math.floor(pair.a.cell / W);
  const region = new Set([pair.a.cell, pair.b.cell, ...NEIGHBORS[pair.a.cell], ...NEIGHBORS[pair.b.cell]]);
  const points = [];
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const x = ax + dx;
      const y = ay + dy;
      const inside = x >= 0 && x < W && y >= 0 && y < H;
      const cell = y * W + x;
      if (inside && !region.has(cell)) continue;
      if (!inside) {
        const near = [pair.a.cell, pair.b.cell].some((c) => Math.abs(x - c % W) <= 1 && Math.abs(y - Math.floor(c / W)) <= 1);
        if (near) points.push([dx, dy, '#']);
        continue;
      }
      // Cells outside both numbers' unsettled sets take no part in the
      // deduction, opened or not, so they share one mark.
      let mark;
      if (cell === pair.a.cell) mark = 'A';
      else if (cell === pair.b.cell) mark = 'B';
      else if (cell === target) mark = truth === 2 ? 'S' : 'M';
      else if (pair.a.set.has(cell) || pair.b.set.has(cell)) mark = 'u';
      else mark = 'o';
      points.push([dx, dy, mark]);
    }
  }
  let best = null;
  for (const swap of [false, true]) {
    const needs = swap ? [pair.b.need, pair.a.need] : [pair.a.need, pair.b.need];
    const origin = swap ? [pair.b.cell % W - ax, Math.floor(pair.b.cell / W) - ay] : [0, 0];
    for (const transform of TRANSFORMS) {
      const moved = points.map(([dx, dy, mark]) => {
        const [tx, ty] = transform([dx - origin[0], dy - origin[1]]);
        const m = swap ? (mark === 'A' ? 'B' : mark === 'B' ? 'A' : mark) : mark;
        return [tx, ty, m];
      });
      const minX = Math.min(...moved.map((p) => p[0]));
      const minY = Math.min(...moved.map((p) => p[1]));
      const cells = moved.map(([x, y, m]) => `${x - minX},${y - minY}${m}`).sort().join(' ');
      const key = `${needs[0]}-${needs[1]}|${cells}`;
      if (best === null || key < best) best = key;
    }
  }
  return best;
}

// The straight-edge run through the decisive pair (see the header), or null
// when the pair is not two side-by-side numbers on a flat edge.
function lineKey(residual, pair) {
  const ax = pair.a.cell % W;
  const ay = Math.floor(pair.a.cell / W);
  const dx = pair.b.cell % W - ax;
  const dy = Math.floor(pair.b.cell / W) - ay;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
  const px = -dy;
  const py = dx;
  const sideOf = (entry) => {
    const cx = entry.cell % W;
    const cy = Math.floor(entry.cell / W);
    let side = null;
    for (const u of entry.unknown) {
      const across = (u % W - cx) * px + (Math.floor(u / W) - cy) * py;
      if (across === 0 || (side !== null && across !== side)) return null;
      side = across;
    }
    return side;
  };
  const side = sideOf(pair.a);
  if (side === null || sideOf(pair.b) !== side) return null;
  const memberAt = (x, y) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return null;
    const entry = residual.get(y * W + x);
    return entry !== undefined && sideOf(entry) === side ? entry : null;
  };
  const run = [pair.a, pair.b];
  let before = false;
  let after = false;
  for (let step = 1; step <= 3; step++) {
    const entry = memberAt(ax - step * dx, ay - step * dy);
    if (entry === null) break;
    if (step === 3) before = true;
    else run.unshift(entry);
  }
  const bx = ax + dx;
  const by = ay + dy;
  for (let step = 1; step <= 3; step++) {
    const entry = memberAt(bx + step * dx, by + step * dy);
    if (entry === null) break;
    if (step === 3) after = true;
    else run.push(entry);
  }
  const encode = (entries, direction, truncatedStart, truncatedEnd) => {
    const parts = entries.map((entry) => {
      const cx = entry.cell % W;
      const cy = Math.floor(entry.cell / W);
      let mask = '';
      for (const k of [-direction, 0, direction]) {
        const x = cx + side * px + k * dx;
        const y = cy + side * py + k * dy;
        if (x < 0 || x >= W || y < 0 || y >= H) mask += '#';
        else mask += entry.set.has(y * W + x) ? 'u' : '.';
      }
      return entry.need + mask;
    });
    return [truncatedStart ? '~' : null, ...parts, truncatedEnd ? '~' : null].filter((p) => p !== null).join(' ');
  };
  const forward = encode(run, 1, before, after);
  const backward = encode([...run].reverse(), -1, after, before);
  return forward < backward ? forward : backward;
}

function familyKey(pair, target, truth) {
  const near = pair.a.set.has(target) ? pair.a : pair.b;
  const far = near === pair.a ? pair.b : pair.a;
  const wall = NEIGHBORS[pair.a.cell].length < 8 || NEIGHBORS[pair.b.cell].length < 8;
  return `${near.need}/${far.need} ${truth === 2 ? 'safe' : 'mine'}${wall ? ' wall' : ''}`;
}

function picture(key) {
  const [needs, cellText] = key.split('|');
  const [needA, needB] = needs.split('-');
  const grid = new Map();
  let maxX = 0;
  let maxY = 0;
  for (const token of cellText.split(' ')) {
    const [xy, mark] = [token.slice(0, -1), token.slice(-1)];
    const [x, y] = xy.split(',').map(Number);
    grid.set(`${x},${y}`, mark);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const glyph = { A: needA, B: needB, u: '?', S: 'S', M: 'M', '#': '#', o: '.' };
  const rows = [];
  for (let y = 0; y <= maxY; y++) {
    let row = '';
    for (let x = 0; x <= maxX; x++) row += grid.has(`${x},${y}`) ? glyph[grid.get(`${x},${y}`)] : ' ';
    rows.push(row);
  }
  return rows;
}

// Reaction, travel, hover for the gap before an input, as in compare.py.
function movementSplit(samples, cursor, tPrev, tNext, target) {
  let i = cursor;
  while (i + 1 < samples.length && samples[i + 1][0] <= tPrev) i++;
  const x0 = samples[i][1];
  const y0 = samples[i][2];
  let onset = null;
  let j = i + 1;
  while (j < samples.length && samples[j][0] <= tNext) {
    if (onset === null && Math.hypot(samples[j][1] - x0, samples[j][2] - y0) >= ONSET_CELLS) onset = samples[j][0];
    j++;
  }
  const last = j - 1;
  let k = last;
  while (k > i && Math.floor(samples[k][1]) === target[0] && Math.floor(samples[k][2]) === target[1]) k--;
  if (k === last || onset === null) return { split: null, cursor: i };
  const arrival = samples[k + 1][0];
  if (arrival < onset) return { split: null, cursor: i };
  return { split: { reaction: onset - tPrev, travel: arrival - onset, hover: tNext - arrival }, cursor: i };
}

// Replays a game's actions on its mine layout. visit(k, action, board) runs
// before each action is applied; board holds the live revealed and flagged
// arrays, the adjacency counts, and the layout.
function replayGame(game, visit) {
  const mine = [...game.mines].map((c) => c === '1');
  const adjacent = adjacencyOf(mine);
  const revealed = new Array(N).fill(false);
  const flagged = new Array(N).fill(false);
  const board = { mine, adjacent, revealed, flagged };
  const open = (start) => {
    const stack = [start];
    while (stack.length) {
      const c = stack.pop();
      if (revealed[c] || flagged[c]) continue;
      if (mine[c]) throw new Error(`game ${game.id}: replay opened a mine at ${c}`);
      revealed[c] = true;
      if (adjacent[c] === 0) for (const n of NEIGHBORS[c]) if (!revealed[n]) stack.push(n);
    }
  };
  for (let k = 0; k < game.actions.length; k++) {
    const action = game.actions[k];
    const [, x, y, kind] = action;
    const cell = y * W + x;
    visit(k, action, board);
    if (kind === 'reveal') open(cell);
    else if (kind === 'flag') flagged[cell] = true;
    else if (kind === 'unflag') flagged[cell] = false;
    else if (kind === 'chord') for (const n of NEIGHBORS[cell]) if (!revealed[n] && !flagged[n]) open(n);
  }
  return board;
}

function analyzeGame(game) {
  const decisions = [];
  const kinds = { reveal: 0, chord: 0, flag: 0, unflag: 0, noop: 0 };
  const flags = [];
  const chords = [];
  let previousState = null;
  let cursor = 0;
  let pauseMs = 0;
  replayGame(game, (k, action, board) => {
    const [t, x, y, kind] = action;
    const cell = y * W + x;
    const prior = game.actions[k - 1];
    if (k > 0) pauseMs += Math.max(0, t - prior[0] - PAUSE_FROM_MS);
    kinds[kind]++;
    if (kind === 'flag') flags.push({ cell, k });
    if (kind === 'chord') chords.push({ cell, k, opens: NEIGHBORS[cell].filter((n) => !board.revealed[n] && !board.flagged[n]).length });
    if (k === 0 || !(kind === 'reveal' || kind === 'flag' || kind === 'chord')) return;
    const state = settle(board.revealed, board.adjacent);
    const truth = kind === 'flag' ? 1 : 2;
    const decision = { kind, gap: t - prior[0], distance: Math.hypot(x - prior[1], y - prior[2]) };
    if (kind === 'chord') decision.logic = 'chord';
    else if (kind === 'flag' && !board.mine[cell]) decision.logic = 'wrong-flag';
    else if (state.one.get(cell) === truth) decision.logic = 'one';
    else if (state.two.get(cell) === truth) decision.logic = 'two';
    else decision.logic = exactFact(state, cell);
    if (decision.logic === 'one' || decision.logic === 'two') {
      const before = previousState === null ? undefined
        : (decision.logic === 'one' ? previousState.one : previousState.two).get(cell);
      decision.fresh = before !== truth;
    }
    if (decision.logic === 'two') {
      const residual = residualClues(state);
      const pair = decisivePair(residual, cell, truth);
      decision.pattern = pair === null ? 'chain' : patternKey(pair, cell, truth);
      decision.line = pair === null ? null : lineKey(residual, pair);
      decision.family = pair === null ? 'chain' : familyKey(pair, cell, truth);
    }
    if (decision.distance >= 1) {
      const moved = movementSplit(game.samples, cursor, prior[0], t, [x, y]);
      cursor = moved.cursor;
      if (moved.split !== null) {
        decision.think = moved.split.reaction + moved.split.hover;
        decision.reaction = moved.split.reaction;
        decision.travel = moved.split.travel;
        decision.hover = moved.split.hover;
      }
    }
    decisions.push(decision);
    previousState = state;
  });
  const bvs = game.bv3 / (game.timeMs / 1000);
  // A flag pays for itself only when the later chords touching it open at
  // least two squares in total: flag plus chord for one square is two clicks
  // where a direct click is one.
  const lowValueFlags = flags.filter((f) => chords
    .filter((c) => c.k > f.k && NEIGHBORS[c.cell].includes(f.cell))
    .reduce((s, c) => s + c.opens, 0) <= 1).length;
  return {
    decisions, pauseMs, kinds, bv3: game.bv3, timeMs: game.timeMs, bvs,
    lowValueFlags, chordsOpeningOne: chords.filter((c) => c.opens === 1).length,
    effective: kinds.reveal + kinds.chord + kinds.flag + kinds.unflag,
    group: game.source === 'self' ? 'you' : band(bvs),
    player: game.source === 'self' ? 'you' : `saolei:${game.player}`,
  };
}

function band(bvs) {
  const found = LEVEL_BANDS.find(([low, high]) => bvs >= low && bvs < high);
  return found === undefined ? null : bandName(found);
}

function bandName([low, high]) {
  return `${low}-${high === 9 ? '' : high}`;
}

const timed = (d) => d.think !== undefined && d.gap <= DECISION_GAP_MAX_MS;

function freshMoves(decisions, kind, logic) {
  return decisions.filter((d) => d.kind === kind && d.logic === logic && d.fresh && timed(d));
}

// Traits pooled over a set of analyzed games.
function traitsOf(games) {
  const decisions = games.flatMap((g) => g.decisions);
  const gameCount = games.length;
  const sum = (f) => games.reduce((s, g) => s + f(g), 0);
  const one = freshMoves(decisions, 'reveal', 'one');
  const two = freshMoves(decisions, 'reveal', 'two');
  const judged = two.filter((d) => d.fluent !== undefined);
  const oneThinkMs = median(one.map((d) => d.think));
  const twoThinkMs = median(two.map((d) => d.think));
  const moved = decisions.filter((d) => d.travel !== undefined && d.gap <= DECISION_GAP_MAX_MS);
  const mid = moved.filter((d) => d.distance >= TRAVEL_DISTANCE[0] && d.distance < TRAVEL_DISTANCE[1]);
  const freshTwoFlags = decisions.filter((d) => d.kind === 'flag' && d.logic === 'two' && d.fresh).length;
  const freshTwoReveals = decisions.filter((d) => d.kind === 'reveal' && d.logic === 'two' && d.fresh).length;
  const bv3 = sum((g) => g.bv3);
  const effective = sum((g) => g.effective);
  return {
    games: gameCount,
    bvs: median(games.map((g) => g.bvs)),
    oneFresh: one.length,
    twoFresh: two.length,
    twoJudged: judged.length,
    oneThinkMs,
    twoThinkMs,
    twoExtraMs: oneThinkMs === null || twoThinkMs === null ? null : twoThinkMs - oneThinkMs,
    twoFluentShare: judged.length === 0 ? null : judged.filter((d) => d.fluent).length / judged.length,
    oneReactionMs: median(one.map((d) => d.reaction)),
    oneHoverMs: median(one.map((d) => d.hover)),
    travelMidMs: median(mid.map((d) => d.travel)),
    // Median travel by move length in squares, for the pointing test's ladders.
    travelByDistance: Object.fromEntries(TRAVEL_BUCKETS.map(([low, high]) => {
      const list = moved.filter((d) => d.distance >= low && d.distance < high);
      return [bucketName([low, high]), { medianMs: median(list.map((d) => d.travel)), moves: list.length }];
    })),
    pauseSecondsPerGame: sum((g) => g.pauseMs) / 1000 / gameCount,
    effectivePer3BV: effective / bv3,
    flagsPer3BV: sum((g) => g.kinds.flag) / bv3,
    chordsPer3BV: sum((g) => g.kinds.chord) / bv3,
    lowValueFlagsPer3BV: sum((g) => g.lowValueFlags) / bv3,
    chordsOpeningOnePer3BV: sum((g) => g.chordsOpeningOne) / bv3,
    twoSkipShare: freshTwoReveals + freshTwoFlags === 0 ? null : freshTwoReveals / (freshTwoReveals + freshTwoFlags),
    // Counts that price a trait gap in seconds per game.
    freshOnePerGame: decisions.filter((d) => d.logic === 'one' && d.fresh).length / gameCount,
    freshTwoPerGame: (freshTwoReveals + freshTwoFlags) / gameCount,
    travelSecondsPerGame: moved.reduce((s, d) => s + d.travel, 0) / 1000 / gameCount,
    bv3PerGame: bv3 / gameCount,
    secondsPerEffective: sum((g) => g.timeMs) / 1000 / effective,
  };
}

// Traits compared with the average game at your speed: which direction is
// better, and seconds per game gained by moving your value by delta that way.
const RANKED_TRAITS = {
  oneThinkMs: { lowerIsBetter: true, label: 'reading one number',
    seconds: (t, delta) => delta / 1000 * t.freshOnePerGame },
  twoExtraMs: { lowerIsBetter: true, label: 'extra thought for two-number patterns',
    seconds: (t, delta) => delta / 1000 * t.freshTwoPerGame },
  travelMidMs: { lowerIsBetter: true, label: `cursor travel, ${TRAVEL_DISTANCE[0]}-${TRAVEL_DISTANCE[1]} cell moves`,
    seconds: (t, delta) => t.travelSecondsPerGame * delta / t.travelMidMs },
  pauseSecondsPerGame: { lowerIsBetter: true, label: `pausing (time past ${PAUSE_FROM_MS / 1000} s in a gap)`,
    seconds: (t, delta) => delta },
  effectivePer3BV: { lowerIsBetter: true, label: 'effective clicks per 3BV',
    seconds: (t, delta) => delta * t.bv3PerGame * t.secondsPerEffective },
};
const DESCRIBED_TRAITS = ['twoFluentShare', 'oneReactionMs', 'oneHoverMs', 'twoSkipShare', 'flagsPer3BV', 'chordsPer3BV',
  'lowValueFlagsPer3BV', 'chordsOpeningOnePer3BV'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function interval(values) {
  const s = values.filter((v) => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
  if (s.length === 0) return null;
  return [s[Math.floor(0.025 * (s.length - 1))], s[Math.ceil(0.975 * (s.length - 1))]];
}

// A trait's value at ln(3BV/s) x, on the straight line between the two
// levels around x.
function interpolate(levels, x, value) {
  for (let i = 0; i + 1 < levels.length; i++) {
    const [low, high] = [levels[i], levels[i + 1]];
    if (x < low.x || x > high.x) continue;
    const a = value(low);
    const b = value(high);
    if (a === null || b === null) return null;
    return a + (b - a) * (x - low.x) / (high.x - low.x);
  }
  throw new Error(`3BV/s ${Math.exp(x).toFixed(2)} lies outside the measured levels`);
}

// Calls fn with each parsed line of a JSONL file. A corpus file outgrows one
// JavaScript string (about 512 MB), so it is read in chunks.
function forEachJsonLine(path, fn) {
  const fd = fs.openSync(path, 'r');
  const chunk = Buffer.alloc(1 << 24);
  let carry = Buffer.alloc(0);
  try {
    for (let read = fs.readSync(fd, chunk); read > 0; read = fs.readSync(fd, chunk)) {
      const data = Buffer.concat([carry, chunk.subarray(0, read)]);
      let start = 0;
      for (let end = data.indexOf(10); end !== -1; end = data.indexOf(10, start)) {
        if (end > start) fn(JSON.parse(data.toString('utf8', start, end)));
        start = end + 1;
      }
      carry = data.subarray(start);
    }
    if (carry.length > 0) fn(JSON.parse(carry.toString('utf8')));
  } finally {
    fs.closeSync(fd);
  }
}

function main() {
  const [outPath, ...inputs] = process.argv.slice(2);
  const started = Date.now();
  const games = [];
  for (const input of inputs) {
    forEachJsonLine(input, (game) => {
      games.push(analyzeGame(game));
      if (games.length % 100 === 0) console.error(`analyzed ${games.length} games (${Math.round((Date.now() - started) / 1000)} s)`);
    });
  }
  const yourGames = games.filter((g) => g.group === 'you');
  if (yourGames.length === 0) throw new Error('no games of yours: pass the self.jsonl from user_games.js');

  // Each player's own baseline decides which of their two-number moves were fluent.
  const byPlayer = new Map();
  for (const g of games) {
    if (!byPlayer.has(g.player)) byPlayer.set(g.player, []);
    byPlayer.get(g.player).push(g);
  }
  let baselinePlayers = 0;
  for (const list of byPlayer.values()) {
    const decisions = list.flatMap((g) => g.decisions);
    const one = freshMoves(decisions, 'reveal', 'one');
    if (one.length < MIN_BASELINE) continue;
    baselinePlayers++;
    const limit = median(one.map((d) => d.think)) + FLUENT_MARGIN_MS;
    for (const d of decisions) if (d.logic === 'two' && d.fresh && timed(d)) d.fluent = d.think <= limit;
  }

  const groups = [...LEVEL_BANDS.map(bandName), 'you'];
  const gamesOf = new Map(groups.map((name) => [name, games.filter((g) => g.group === name)]));
  const present = groups.filter((name) => gamesOf.get(name).length > 0);
  const levelNames = present.filter((name) => name !== 'you');
  const levels = Object.fromEntries(present.map((name) => [name, traitsOf(gamesOf.get(name))]));

  // Bootstrap replicates: games resampled with replacement within each group.
  const random = mulberry32(BOOTSTRAP_SEED);
  const replicates = [];
  for (let r = 0; r < BOOTSTRAP; r++) {
    const replicate = {};
    for (const name of present) {
      const list = gamesOf.get(name);
      replicate[name] = traitsOf(list.map(() => list[Math.floor(random() * list.length)]));
    }
    replicates.push(replicate);
  }

  // Placement: you against the average game at your speed.
  const yours = levels.you;
  const x = Math.log(yours.bvs);
  const points = (traits) => levelNames.map((name) => ({ x: Math.log(levels[name].bvs), traits: traits[name] }));
  const placement = {};
  for (const trait of [...Object.keys(RANKED_TRAITS), ...DESCRIBED_TRAITS]) {
    const expected = interpolate(points(levels), x, (p) => p.traits[trait]);
    const expectedDraws = replicates.map((rep) => interpolate(points(rep), x, (p) => p.traits[trait]));
    const row = {
      you: yours[trait], youInterval: interval(replicates.map((rep) => rep.you[trait])),
      expectedAtYourSpeed: expected, expectedInterval: interval(expectedDraws),
    };
    const ranked = RANKED_TRAITS[trait];
    if (ranked !== undefined) {
      const behind = (you, exp) => (you === null || exp === null ? null : ranked.lowerIsBetter ? you - exp : exp - you);
      row.label = ranked.label;
      row.behind = behind(yours[trait], expected);
      row.behindInterval = interval(replicates.map((rep, i) => behind(rep.you[trait], expectedDraws[i])));
      row.behindShare = row.behind / expected;
      row.secondsPerGame = ranked.seconds(yours, row.behind);
      row.secondsInterval = interval(replicates.map((rep, i) => {
        const gap = behind(rep.you[trait], expectedDraws[i]);
        return gap === null ? null : ranked.seconds(rep.you, gap);
      }));
    }
    placement[trait] = row;
  }

  // Pattern catalogs, counted over every two-number move; thinking time and
  // fluency over fresh timed moves.
  const catalog = (field, limit) => {
    const byKey = new Map();
    for (const name of present) {
      for (const g of gamesOf.get(name)) {
        for (const d of g.decisions) {
          if (d.logic !== 'two' || d[field] === null || d[field] === 'chain') continue;
          if (!byKey.has(d[field])) byKey.set(d[field], { key: d[field], corpusCount: 0, groups: new Map() });
          const item = byKey.get(d[field]);
          if (name !== 'you') item.corpusCount++;
          if (!item.groups.has(name)) item.groups.set(name, []);
          item.groups.get(name).push(d);
        }
      }
    }
    return [...byKey.values()].sort((a, b) => b.corpusCount - a.corpusCount).slice(0, limit).map((item) => ({
      key: item.key,
      corpusCount: item.corpusCount,
      picture: field === 'pattern' ? picture(item.key) : [item.key],
      byGroup: Object.fromEntries(present.map((name) => {
        const list = item.groups.get(name) || [];
        const fresh = list.filter((d) => d.fresh && timed(d));
        const judged = fresh.filter((d) => d.fluent !== undefined);
        return [name, {
          moves: list.length,
          fresh: fresh.length,
          medianThinkMs: median(fresh.map((d) => d.think)),
          fluentShare: judged.length === 0 ? null : judged.filter((d) => d.fluent).length / judged.length,
          judged: judged.length,
        }];
      })),
    }));
  };
  const families = catalog('family', Infinity);
  const pairPatterns = catalog('pattern', TOP_PATTERNS);
  const linePatterns = catalog('line', TOP_PATTERNS);

  // Memorization scope per level: fluent share per family, averaged with the
  // corpus's family frequencies as weights so every level is scored on the
  // same mix; and how many families count as memorized there.
  const scope = Object.fromEntries(present.map((name) => {
    let weighted = 0;
    let weight = 0;
    let memorized = 0;
    let measured = 0;
    for (const family of families) {
      const cell = family.byGroup[name];
      if (cell.judged < MEMORIZED_MIN_N) continue;
      measured++;
      weighted += family.corpusCount * cell.fluentShare;
      weight += family.corpusCount;
      if (cell.fluentShare >= MEMORIZED_SHARE) memorized++;
    }
    return [name, { standardizedFluentShare: weight === 0 ? null : weighted / weight, memorized, measured }];
  }));

  const result = {
    games: games.length,
    playersWithBaseline: baselinePlayers,
    constants: { FLUENT_MARGIN_MS, DECISION_GAP_MAX_MS, PAUSE_FROM_MS, MIN_BASELINE, TRAVEL_DISTANCE,
      MEMORIZED_SHARE, MEMORIZED_MIN_N, BOOTSTRAP },
    levels, scope, placement, families, pairPatterns, linePatterns,
  };
  fs.writeFileSync(outPath, JSON.stringify(result, null, 1));
  report(result, present);
}

function report(result, groups) {
  const f = (v, d = 0) => (v === null || v === undefined ? '-' : v.toFixed(d));
  const pct = (v) => (v === null || v === undefined ? '-' : `${Math.round(100 * v)}%`);
  const span = (iv, d = 0) => (iv === null ? '' : `[${f(iv[0], d)}, ${f(iv[1], d)}]`);
  console.log(`games ${result.games}; players with a fluency baseline ${result.playersWithBaseline}`);
  console.log('\nlevel     games  3BV/s | think ms: one  two  extra fluent (judged) | reaction hover | travel | pause s | eff/3BV flags/3BV chords/3BV skip');
  for (const g of groups) {
    const t = result.levels[g];
    console.log(`${g.padEnd(8)} ${String(t.games).padStart(5)} ${f(t.bvs, 2).padStart(6)} | ${f(t.oneThinkMs).padStart(12)} ${f(t.twoThinkMs).padStart(4)} ${f(t.twoExtraMs).padStart(6)}`
      + ` ${pct(t.twoFluentShare).padStart(5)} (${String(t.twoJudged).padStart(4)}) | ${f(t.oneReactionMs).padStart(8)} ${f(t.oneHoverMs).padStart(5)} | ${f(t.travelMidMs).padStart(6)} |`
      + ` ${f(t.pauseSecondsPerGame, 1).padStart(7)} | ${f(t.effectivePer3BV, 2).padStart(7)} ${f(t.flagsPer3BV, 2).padStart(9)} ${f(t.chordsPer3BV, 2).padStart(10)} ${pct(t.twoSkipShare).padStart(4)}`);
  }
  console.log('\nmemorization scope (fluent share over pattern families, one family mix for every level):');
  for (const g of groups) {
    const s = result.scope[g];
    console.log(`  ${g.padEnd(8)} ${pct(s.standardizedFluentShare).padStart(4)}   memorized ${s.memorized} of ${s.measured} families with ${MEMORIZED_MIN_N}+ judged moves`);
  }
  console.log(`\nyou against the average game at your speed (3BV/s ${f(result.levels.you.bvs, 2)}), 95% intervals:`);
  const rows = Object.entries(result.placement).filter(([, p]) => p.label !== undefined)
    .sort((a, b) => b[1].secondsPerGame - a[1].secondsPerGame);
  for (const [trait, p] of rows) {
    const d = trait === 'effectivePer3BV' || trait === 'pauseSecondsPerGame' ? 2 : 0;
    console.log(`  ${p.label.padEnd(36)} you ${f(p.you, d)} ${span(p.youInterval, d)}  expected ${f(p.expectedAtYourSpeed, d)} ${span(p.expectedInterval, d)}`
      + `  behind ${f(p.behind, d)} ${span(p.behindInterval, d)} (${pct(p.behindShare)})  worth ${f(p.secondsPerGame, 1)} s/game ${span(p.secondsInterval, 1)}`);
  }
  for (const trait of DESCRIBED_TRAITS) {
    const p = result.placement[trait];
    console.log(`  ${trait.padEnd(36)} you ${f(p.you, 2)} ${span(p.youInterval, 2)}  expected ${f(p.expectedAtYourSpeed, 2)} ${span(p.expectedInterval, 2)}`);
  }
  const catalogReport = (title, list, count) => {
    console.log(`\n${title}`);
    for (const p of list.slice(0, count)) {
      console.log(`\n  corpus moves ${p.corpusCount}   ` + groups.map((g) => {
        const c = p.byGroup[g];
        return `${g}: ${f(c.medianThinkMs)} ms ${pct(c.fluentShare)} (n=${c.judged})`;
      }).join('  '));
      for (const row of p.picture) console.log('     ' + row);
    }
  };
  catalogReport('pattern families (median thinking ms and fluent share of fresh moves, by level):', result.families, 16);
  catalogReport('most common exact two-number patterns:', result.pairPatterns, 12);
  catalogReport('most common straight-edge runs:', result.linePatterns, 12);
}

module.exports = {
  W, H, N, MINES, NEIGHBORS, LEVEL_BANDS, FLUENT_MARGIN_MS, DECISION_GAP_MAX_MS, TRAVEL_BUCKETS, bucketName,
  median, settle, exactFacts, residualClues, decisivePair, patternKey, lineKey, familyKey, picture,
  movementSplit, replayGame, analyzeGame, band, bandName, forEachJsonLine,
};

if (require.main === module) main();

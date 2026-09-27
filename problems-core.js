'use strict';

// Minesweeper problems, pure (docs/product/problems.md): the bank format, the
// board a problem starts from, what each click does, when a problem is solved,
// the thinking/moving split of the first answer, and summaries of saved
// attempts. No DOM and no storage; problems-page.js and
// tests/problems-core-test.js load it.

// A released protocol id names one exact procedure; any change to these values
// or to how an attempt runs ships under a new id. problems-v2 (2026-09-26,
// evening) adds the focus box; problems-v1 attempts, made without it, stay in
// the history but out of the ladders, because the box shortens the search.
const PROBLEM_PROTOCOL = 'problems-v2';
const PROBLEM_RECORDED_PROTOCOLS = Object.freeze(['problems-v1', 'problems-v2']);
const PROBLEM_PREVIEW_MS = 1000;
const PROBLEM_TIMEOUT_MS = 20000;
const PROBLEM_ONSET_CELLS = 0.25;
// The focus box reaches this many squares past the start and answer squares,
// so the numbers that decide them sit inside it.
const PROBLEM_FOCUS_MARGIN = 1;

// A level's median thinking time on a rule is shown only when it rests on at
// least this many fresh moves in the replay corpus.
const PROBLEM_LEVEL_MIN_MOVES = 10;
const PROBLEM_SET_SIZE = 20;
const PROBLEM_SET_ONE_NUMBER = 5;
const PROBLEM_CELL_SIZES = [16, 20, 24, 28, 32];
const PROBLEM_DEFAULT_CELL_PX = 24;
const PROBLEM_OUTCOMES = ['solved', 'mine', 'timeout', 'abandoned', 'interrupted'];
const PROBLEM_ACTION_KINDS = ['reveal', 'chord', 'flag', 'unflag'];
const PROBLEM_BANK_FORMAT = 'minesweeper-problems-bank';
const PROBLEM_BANK_VERSION = 2;
const PROBLEM_FILE_FORMAT = 'minesweeper-problems-attempts';
const PROBLEM_FILE_VERSION = 2;

function problemBits(hex, count) {
  if (typeof hex !== 'string' || hex.length * 4 !== count || !/^[0-9a-f]*$/.test(hex)) {
    throw new Error('problem bank: a square map does not have ' + count + ' squares');
  }
  const bits = new Array(count);
  for (let i = 0; i < hex.length; i++) {
    const digit = parseInt(hex[i], 16);
    bits[4 * i] = (digit & 8) !== 0;
    bits[4 * i + 1] = (digit & 4) !== 0;
    bits[4 * i + 2] = (digit & 2) !== 0;
    bits[4 * i + 3] = (digit & 1) !== 0;
  }
  return bits;
}

function problemNeighbors(width, height) {
  return Array.from({ length: width * height }, (_, i) => {
    const x = i % width;
    const y = Math.floor(i / width);
    const out = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height) {
          out.push((y + dy) * width + x + dx);
        }
      }
    }
    return out;
  });
}

// Validates the bank and decodes every problem's square maps once.
function readProblemBank(json) {
  if (json.format !== PROBLEM_BANK_FORMAT) throw new Error('problem bank: not a problem bank file');
  if (json.formatVersion !== PROBLEM_BANK_VERSION) {
    throw new Error('problem bank: format version ' + json.formatVersion + ' is not ' + PROBLEM_BANK_VERSION);
  }
  const { width, height } = json;
  const count = width * height;
  for (const level of json.levels) {
    if (json.travelByLevel?.[level] === undefined) throw new Error('problem bank: no travel times for level ' + level);
  }
  const neighbors = problemNeighbors(width, height);
  const byId = new Map();
  const problems = json.problems.map((raw) => {
    if (json.classes[raw.classId] === undefined) throw new Error('problem bank: ' + raw.id + ' has an unknown class');
    const mine = problemBits(raw.mines, count);
    const adjacent = mine.map((_, i) => neighbors[i].filter((n) => mine[n]).length);
    const problem = {
      ...raw,
      mine,
      adjacent,
      opened: problemBits(raw.opened, count),
      flags: problemBits(raw.flags, count),
    };
    if (problem.opened[problem.start] || mine[problem.start] || adjacent[problem.start] === 0) {
      throw new Error('problem bank: ' + raw.id + ' has an invalid start square');
    }
    for (const cell of raw.freshSafe) if (mine[cell] || problem.opened[cell]) throw new Error('problem bank: ' + raw.id + ' has an invalid answer square');
    for (const cell of raw.freshMines) if (!mine[cell]) throw new Error('problem bank: ' + raw.id + ' marks a safe square as a mine');
    byId.set(raw.id, problem);
    return problem;
  });
  return { ...json, neighbors, problems, byId };
}

// The board just before the start square opens.
function problemBoard(bank, problem) {
  return {
    width: bank.width,
    height: bank.height,
    neighbors: bank.neighbors,
    mine: problem.mine,
    adjacent: problem.adjacent,
    revealed: problem.opened.slice(),
    flagged: problem.flags.slice(),
  };
}

function openFrom(board, start) {
  const opened = [];
  const stack = [start];
  while (stack.length) {
    const cell = stack.pop();
    if (board.revealed[cell] || board.flagged[cell]) continue;
    board.revealed[cell] = true;
    opened.push(cell);
    if (!board.mine[cell] && board.adjacent[cell] === 0) {
      for (const n of board.neighbors[cell]) if (!board.revealed[n]) stack.push(n);
    }
  }
  return opened;
}

// Applies one click to the board and returns what it changed: the squares it
// opened, the mine it hit (or null), and whether a flag was placed or removed.
// A click that changes nothing returns an empty effect.
function applyProblemAction(board, kind, cell) {
  const effect = { opened: [], mineHit: null, flagChanged: false };
  if (kind === 'flag' || kind === 'unflag') {
    if (board.revealed[cell] || board.flagged[cell] === (kind === 'flag')) return effect;
    board.flagged[cell] = kind === 'flag';
    effect.flagChanged = true;
    return effect;
  }
  let targets;
  if (kind === 'reveal') {
    targets = board.revealed[cell] || board.flagged[cell] ? [] : [cell];
  } else if (kind === 'chord') {
    const around = board.neighbors[cell];
    const flags = around.filter((n) => board.flagged[n]).length;
    targets = !board.revealed[cell] || board.adjacent[cell] === 0 || flags !== board.adjacent[cell] ? []
      : around.filter((n) => !board.revealed[n] && !board.flagged[n]);
  } else {
    throw new Error('problem action: unknown kind ' + kind);
  }
  for (const target of targets) {
    effect.opened.push(...openFrom(board, target));
    if (board.mine[target] && effect.mineHit === null) effect.mineHit = target;
  }
  return effect;
}

// The rectangle to look at, in squares, inclusive: the start and answer
// squares with PROBLEM_FOCUS_MARGIN around them, inside the board.
function problemFocusBox(bank, problem) {
  const cells = [problem.start, ...problem.freshSafe, ...problem.freshMines];
  const cols = cells.map((c) => c % bank.width);
  const rows = cells.map((c) => Math.floor(c / bank.width));
  return {
    col0: Math.max(0, Math.min(...cols) - PROBLEM_FOCUS_MARGIN),
    row0: Math.max(0, Math.min(...rows) - PROBLEM_FOCUS_MARGIN),
    col1: Math.min(bank.width - 1, Math.max(...cols) + PROBLEM_FOCUS_MARGIN),
    row1: Math.min(bank.height - 1, Math.max(...rows) + PROBLEM_FOCUS_MARGIN),
  };
}

function problemSolved(board, problem) {
  return problem.freshSafe.every((cell) => board.revealed[cell]);
}

// Whether a click answers the problem: it opens one of the new number's safe
// squares itself (a chain opening from some other square does not count), or
// chords a number into them, or flags one of its mines.
function answersProblem(problem, kind, cell, effect) {
  if (kind === 'reveal') return problem.freshSafe.includes(cell) && effect.opened.length > 0;
  if (kind === 'chord') return effect.opened.some((c) => problem.freshSafe.includes(c));
  if (kind === 'flag') return effect.flagChanged && problem.freshMines.includes(cell);
  return false;
}

// Reaction (until the cursor has moved PROBLEM_ONSET_CELLS from where it was at
// the start), travel (until it enters the answered square for the last time),
// and hover (from then to the click). samples hold t (ms after the start
// square opened) and x, y in squares from the board's top-left corner. Null
// when the cursor never left its place or never settled on the square.
function problemMovementSplit(samples, clickT, square) {
  return movementSplitAt(samples, 0, clickT, square);
}

// The same split for a move that starts at startT; reaction counts from startT.
function movementSplitAt(samples, startT, clickT, square) {
  let last = -1;
  while (last + 1 < samples.t.length && samples.t[last + 1] <= startT) last++;
  if (last < 0) return null;
  const x0 = samples.x[last];
  const y0 = samples.y[last];
  let onset = null;
  let j = last + 1;
  while (j < samples.t.length && samples.t[j] <= clickT) {
    if (onset === null && Math.hypot(samples.x[j] - x0, samples.y[j] - y0) >= PROBLEM_ONSET_CELLS) onset = samples.t[j];
    j++;
  }
  const end = j - 1;
  let k = end;
  while (k > last && Math.floor(samples.x[k]) === square.x && Math.floor(samples.y[k]) === square.y) k--;
  if (k === end || onset === null) return null;
  const arrival = samples.t[k + 1];
  if (arrival < onset) return null;
  return { reaction: onset - startT, travel: arrival - onset, hover: clickT - arrival };
}

// Replays an attempt's clicks on its problem: the answer times, the clicks
// outside the new number's squares, and the thinking/moving split of the
// first answer.
function summarizeAttempt(bank, attempt) {
  const problem = bank.byId.get(attempt.problemId);
  if (problem === undefined) throw new Error('attempt ' + attempt.startedAt + ': problem ' + attempt.problemId + ' is not in this bank');
  const board = problemBoard(bank, problem);
  applyProblemAction(board, 'reveal', problem.start);
  let first = null;
  let doneMs = null;
  let otherClicks = 0;
  let idleClicks = 0;
  for (const action of attempt.actions) {
    const effect = applyProblemAction(board, action.kind, action.cell);
    const changed = effect.opened.length > 0 || effect.flagChanged;
    if (answersProblem(problem, action.kind, action.cell, effect)) {
      if (first === null) first = action;
    } else if (changed) {
      otherClicks++;
    } else {
      idleClicks++;
    }
    if (doneMs === null && problemSolved(board, problem)) doneMs = action.t;
  }
  let split = null;
  if (first !== null) {
    split = problemMovementSplit(attempt.samples, first.t,
      { x: first.cell % bank.width, y: Math.floor(first.cell / bank.width) });
  }
  return {
    outcome: attempt.outcome,
    firstMs: first === null ? null : first.t,
    thinkMs: split === null ? null : split.reaction + split.hover,
    travelMs: split === null ? null : split.travel,
    doneMs: attempt.outcome === 'solved' ? doneMs : null,
    otherClicks,
    idleClicks,
  };
}

// A level's median thinking time on a class, or null when too few corpus
// moves stand behind it.
function levelThinkMs(bank, classId, level) {
  const entry = bank.classes[classId].byLevel[level];
  return entry.freshMoves >= PROBLEM_LEVEL_MIN_MOVES ? entry.medianThinkMs : null;
}

// Layout of a vertical ladder, fastest at the top: each entry's exact
// position on the scale, label positions pushed apart to at least gapPx
// without changing their order, and tick values. heightPx is the drawing
// height; values are ms and must not be empty.
function ladderLayout(values, heightPx, gapPx) {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const pad = Math.max(10, (high - low) * 0.08);
  const top = low - pad;
  const bottom = high + pad;
  const y = (ms) => ((ms - top) / (bottom - top)) * heightPx;
  const step = [20, 50, 100, 200, 500, 1000, 2000].find((s) => (bottom - top) / s <= 6);
  const ticks = [];
  for (let t = Math.ceil(top / step) * step; t <= bottom; t += step) ticks.push(t);
  const order = values.map((v, i) => i).sort((a, b) => values[a] - values[b] || a - b);
  const labelY = new Array(values.length);
  let previous = -Infinity;
  for (const i of order) {
    labelY[i] = Math.max(y(values[i]), previous + gapPx, gapPx / 2);
    previous = labelY[i];
  }
  let next = Infinity;
  for (const i of [...order].reverse()) {
    labelY[i] = Math.min(labelY[i], next - gapPx, heightPx - gapPx / 2);
    next = labelY[i];
  }
  return { dotY: values.map(y), labelY, ticks: ticks.map((t) => ({ ms: t, y: y(t) })) };
}

function problemMedian(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Per class: attempts, solved count, and median thinking and first-answer
// times over solved attempts. A problem's id names one moment of one replay,
// so attempts count toward the class their problem has in this bank, whichever
// bank they were made with; attempts at problems this bank lacks are left out.
function problemProfile(bank, attempts) {
  const rows = new Map(Object.keys(bank.classes).map((id) => [id, { classId: id, attempts: 0, solved: 0, think: [], first: [] }]));
  for (const attempt of attempts) {
    const problem = bank.byId.get(attempt.problemId);
    if (problem === undefined || attempt.protocol !== PROBLEM_PROTOCOL
      || attempt.outcome === 'abandoned' || attempt.outcome === 'interrupted') continue;
    const row = rows.get(problem.classId);
    const summary = summarizeAttempt(bank, attempt);
    row.attempts++;
    if (summary.outcome !== 'solved') continue;
    row.solved++;
    if (summary.thinkMs !== null) row.think.push(summary.thinkMs);
    if (summary.firstMs !== null) row.first.push(summary.firstMs);
  }
  return [...rows.values()].map((row) => ({
    classId: row.classId,
    attempts: row.attempts,
    solved: row.solved,
    medianThinkMs: problemMedian(row.think),
    medianFirstMs: problemMedian(row.first),
    thinkCount: row.think.length,
  }));
}

// A set: PROBLEM_SET_ONE_NUMBER one-number problems and the rest from the
// pattern classes in turn, each time the least attempted problem of its
// class (random among ties). random() returns [0, 1).
function pickProblemSet(bank, attempts, random) {
  const tries = new Map();
  for (const attempt of attempts) tries.set(attempt.problemId, (tries.get(attempt.problemId) || 0) + 1);
  const pools = new Map();
  for (const problem of bank.problems) {
    if (!pools.has(problem.classId)) pools.set(problem.classId, []);
    pools.get(problem.classId).push({ problem, tries: tries.get(problem.id) || 0, tie: random() });
  }
  for (const pool of pools.values()) pool.sort((a, b) => a.tries - b.tries || a.tie - b.tie);
  const take = (classId) => pools.get(classId).shift().problem;
  const patternClasses = [...pools.keys()].filter((id) => id !== 'one');
  const picked = [];
  for (let i = 0; i < PROBLEM_SET_ONE_NUMBER && pools.get('one').length > 0; i++) picked.push(take('one'));
  let turn = 0;
  while (picked.length < PROBLEM_SET_SIZE) {
    const open = patternClasses.filter((id) => pools.get(id).length > 0);
    if (open.length === 0) break;
    picked.push(take(open[turn % open.length]));
    turn++;
  }
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [picked[i], picked[j]] = [picked[j], picked[i]];
  }
  return picked;
}

// "1/1 safe wall" style family keys, in words.
function describeProblemClass(bank, classId) {
  const entry = bank.classes[classId];
  if (entry.family === null) {
    return {
      name: 'one number at a time',
      rule: 'Counting around single numbers settles every square, one number at a time: a number with all its mines'
        + ' found has its other covered squares safe, and one with as many covered squares as missing mines has them all'
        + ' as mines. Each settled square can complete the next number.',
    };
  }
  const [needs, result, wall] = entry.family.split(' ');
  const [near, far] = needs.split('/').map(Number);
  const pair = near === far ? near + '-' + near : Math.min(near, far) + '-' + Math.max(near, far);
  return {
    name: pair + ' rule' + (wall === 'wall' ? ' at the edge' : ''),
    rule: 'Two numbers share covered squares. Counting only the mines each still needs (a '
      + near + ' and a ' + far + '), the squares only the ' + near + ' touches must all be '
      + (result === 'safe' ? 'safe' : 'mines') + '.',
  };
}

function validProblemAttempt(attempt) {
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  if (attempt === null || typeof attempt !== 'object') return false;
  if (!finite(attempt.startedAt) || !PROBLEM_RECORDED_PROTOCOLS.includes(attempt.protocol)) return false;
  if (typeof attempt.bankId !== 'string' || typeof attempt.problemId !== 'string' || typeof attempt.classId !== 'string') return false;
  if (!finite(attempt.setStartedAt) || !PROBLEM_CELL_SIZES.includes(attempt.cellPx)) return false;
  if (!finite(attempt.timeOriginMs) || !finite(attempt.previewT) || !finite(attempt.startT) || !finite(attempt.endT)) return false;
  if (attempt.startT - attempt.previewT < PROBLEM_PREVIEW_MS || attempt.endT < attempt.startT) return false;
  if (!PROBLEM_OUTCOMES.includes(attempt.outcome) || !Array.isArray(attempt.actions)) return false;
  if (!attempt.actions.every((a) => finite(a.t) && PROBLEM_ACTION_KINDS.includes(a.kind) && Number.isInteger(a.cell))) return false;
  const s = attempt.samples;
  if (s === null || typeof s !== 'object' || !Array.isArray(s.t) || !Array.isArray(s.x) || !Array.isArray(s.y)) return false;
  if (s.t.length !== s.x.length || s.t.length !== s.y.length) return false;
  return s.t.every(finite) && s.x.every(finite) && s.y.every(finite);
}

//-------POINTING TEST (the hand alone, on the board grid)-------

// A released protocol id names one exact test. The route is fixed so runs
// compare over years: from the start square, 24 moves of 2 to 13 squares in
// every direction, each target a square to press as fast as possible.
const POINTING_PROTOCOL = 'pointing-v1';
const POINTING_START = Object.freeze([15, 8]);
const POINTING_MOVES = Object.freeze([
  [3, 0], [0, 3], [-3, 0], [0, -3], [6, 2], [-2, -6], [-6, 2], [2, 6],
  [10, -3], [-10, -3], [-10, 3], [10, 3], [2, -2], [-2, -2], [-2, 2], [2, 2],
  [5, -5], [-5, -5], [-5, 5], [5, 5], [1, -2], [-8, -6], [12, 4], [-5, 0],
].map((move) => Object.freeze(move)));
const POINTING_OUTCOMES = ['complete', 'abandoned', 'interrupted'];

// The targets in order: square and distance from the previous square's center.
function pointingTargets(width, height) {
  let [col, row] = POINTING_START;
  return POINTING_MOVES.map(([dx, dy]) => {
    col += dx;
    row += dy;
    if (col < 0 || row < 0 || col >= width || row >= height) throw new Error('pointing route leaves the board');
    return { col, row, cell: row * width + col, distance: Math.hypot(dx, dy) };
  });
}

// Per target: movement time (target shown to press), its reaction, travel, and
// hover, the press's offset from the square's center (squares), and misses.
// Over the run: medians by move length, the least-squares line of movement
// time against Fitts's index of difficulty log2(distance + 1) (target width
// one square), throughput (mean index over movement seconds, bits per second),
// misses, and the spread of press positions.
function summarizePointing(run, width, height) {
  const targets = pointingTargets(width, height);
  const moves = run.targets.map((target, i) => {
    const spec = targets[i];
    const split = movementSplitAt(run.samples, target.shownT, target.pressT, { x: spec.col, y: spec.row });
    return {
      distance: spec.distance,
      index: Math.log2(spec.distance + 1),
      movementMs: target.pressT - target.shownT,
      reactionMs: split === null ? null : split.reaction,
      travelMs: split === null ? null : split.travel,
      hoverMs: split === null ? null : split.hover,
      offsetX: target.x - (spec.col + 0.5),
      offsetY: target.y - (spec.row + 0.5),
      misses: target.misses.length,
    };
  });
  const byDistance = {};
  for (const [low, high, name] of [[1, 2, '1-2'], [2, 4, '2-4'], [4, 8, '4-8'], [8, Infinity, '8+']]) {
    const list = moves.filter((m) => m.distance >= low && m.distance < high);
    byDistance[name] = {
      moves: list.length,
      medianMovementMs: problemMedian(list.map((m) => m.movementMs)),
      medianTravelMs: problemMedian(list.filter((m) => m.travelMs !== null).map((m) => m.travelMs)),
    };
  }
  const n = moves.length;
  const meanIndex = moves.reduce((s, m) => s + m.index, 0) / n;
  const meanMs = moves.reduce((s, m) => s + m.movementMs, 0) / n;
  const covariance = moves.reduce((s, m) => s + (m.index - meanIndex) * (m.movementMs - meanMs), 0);
  const variance = moves.reduce((s, m) => s + (m.index - meanIndex) ** 2, 0);
  const slope = covariance / variance;
  const spread = Math.sqrt(moves.reduce((s, m) => s + m.offsetX ** 2 + m.offsetY ** 2, 0) / n);
  return {
    moves,
    byDistance,
    medianMovementMs: problemMedian(moves.map((m) => m.movementMs)),
    medianReactionMs: problemMedian(moves.filter((m) => m.reactionMs !== null).map((m) => m.reactionMs)),
    medianHoverMs: problemMedian(moves.filter((m) => m.hoverMs !== null).map((m) => m.hoverMs)),
    fittsSlopeMsPerBit: slope,
    fittsInterceptMs: meanMs - slope * meanIndex,
    throughputBitsPerSec: moves.reduce((s, m) => s + m.index / (m.movementMs / 1000), 0) / n,
    misses: moves.reduce((s, m) => s + m.misses, 0),
    pressSpreadSquares: spread,
  };
}

function validPointingRun(run, width, height) {
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  if (run === null || typeof run !== 'object') return false;
  if (!finite(run.startedAt) || run.protocol !== POINTING_PROTOCOL || !PROBLEM_CELL_SIZES.includes(run.cellPx)) return false;
  if (!finite(run.timeOriginMs) || !finite(run.startT) || !finite(run.endT) || run.endT < run.startT) return false;
  if (!POINTING_OUTCOMES.includes(run.outcome) || !Array.isArray(run.targets)) return false;
  const route = pointingTargets(width, height);
  if (run.outcome === 'complete' ? run.targets.length !== route.length : run.targets.length > route.length) return false;
  const inside = (v, limit) => finite(v) && v >= 0 && v < limit;
  const ok = run.targets.every((t, i) => finite(t.shownT) && finite(t.pressT) && t.pressT >= t.shownT
    && inside(t.x, width) && inside(t.y, height)
    && Math.floor(t.x) === route[i].col && Math.floor(t.y) === route[i].row
    && Array.isArray(t.misses) && t.misses.every((m) => finite(m.t) && finite(m.x) && finite(m.y)));
  if (!ok) return false;
  const s = run.samples;
  if (s === null || typeof s !== 'object' || !Array.isArray(s.t) || !Array.isArray(s.x) || !Array.isArray(s.y)) return false;
  return s.t.length === s.x.length && s.t.length === s.y.length && s.t.every(finite) && s.x.every(finite) && s.y.every(finite);
}

function problemAttemptsFile(attempts, pointingRuns, exportedAt) {
  return { format: PROBLEM_FILE_FORMAT, formatVersion: PROBLEM_FILE_VERSION, exportedAt, attempts, pointingRuns };
}

function readProblemAttemptsFile(json, width, height) {
  if (json === null || typeof json !== 'object' || json.format !== PROBLEM_FILE_FORMAT) {
    throw new Error('not a problem attempts file');
  }
  if (json.formatVersion !== PROBLEM_FILE_VERSION) throw new Error('unknown problem attempts file version ' + json.formatVersion);
  if (!Array.isArray(json.attempts)) throw new Error('problem attempts file has no attempt list');
  if (!Array.isArray(json.pointingRuns)) throw new Error('problem attempts file has no pointing run list');
  const valid = json.attempts.filter(validProblemAttempt);
  const validRuns = json.pointingRuns.filter((run) => validPointingRun(run, width, height));
  return {
    valid,
    validRuns,
    rejected: json.attempts.length - valid.length + json.pointingRuns.length - validRuns.length,
  };
}

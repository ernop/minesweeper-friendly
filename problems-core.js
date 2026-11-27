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
const PROBLEM_BANK_VERSION = 3;
// The last-flag drill: a number one flag short, answered by flagging its mine
// and chording (in one motion with the 1.5 click).
const LAST_FLAG_PROTOCOL = 'last-flag-v1';
const LAST_FLAG_TIMEOUT_MS = 10000;
const LAST_FLAG_SET_SIZE = 10;
const PROBLEM_FILE_FORMAT = 'minesweeper-problems-attempts';
const PROBLEM_FILE_VERSION = 3;

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
  // Last-flag positions reuse the problem shape: the squares to open are the
  // number's safe squares, the mine to flag its missing one.
  const lastFlagById = new Map();
  const lastFlag = json.lastFlag.map((raw) => {
    const mine = problemBits(raw.mines, count);
    const adjacent = mine.map((_, i) => neighbors[i].filter((n) => mine[n]).length);
    const opened = problemBits(raw.opened, count);
    const flags = problemBits(raw.flags, count);
    const around = neighbors[raw.number];
    const fail = (why) => { throw new Error('problem bank: last-flag position ' + raw.id + ' ' + why); };
    if (!opened[raw.number]) fail('has a covered number');
    if (around.filter((n) => flags[n]).length !== adjacent[raw.number] - 1) fail('is not one flag short');
    if (!around.includes(raw.mine) || !mine[raw.mine] || opened[raw.mine] || flags[raw.mine]) fail('has an invalid mine');
    if (raw.safe.length === 0 || raw.safe.some((c) => !around.includes(c) || mine[c] || opened[c] || flags[c])) fail('has an invalid safe square');
    const position = { ...raw, mine, adjacent, opened, flags, mineCell: raw.mine, freshSafe: raw.safe, freshMines: [raw.mine] };
    lastFlagById.set(raw.id, position);
    return position;
  });
  return { ...json, neighbors, problems, byId, lastFlag, lastFlagById };
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

//-------LAST-FLAG DRILL-------

// Replays a drill attempt: when the number's safe squares were all open, how
// many clicks it took, how many changed nothing, and whether a both-button
// chord (the second half of the 1.5 click) opened them.
function summarizeDrillAttempt(bank, attempt) {
  const position = bank.lastFlagById.get(attempt.positionId);
  if (position === undefined) throw new Error('drill attempt ' + attempt.startedAt + ': position ' + attempt.positionId + ' is not in this bank');
  const board = problemBoard(bank, position);
  let doneMs = null;
  let idleClicks = 0;
  let usedGesture = false;
  for (const action of attempt.actions) {
    const effect = applyProblemAction(board, action.kind, action.cell);
    if (effect.opened.length === 0 && !effect.flagChanged) idleClicks++;
    if (action.kind === 'chord' && action.gesture === true && effect.opened.length > 0) usedGesture = true;
    if (doneMs === null && problemSolved(board, position)) doneMs = action.t;
  }
  return {
    outcome: attempt.outcome,
    doneMs: attempt.outcome === 'solved' ? doneMs : null,
    clicks: attempt.actions.length,
    idleClicks,
    usedGesture,
  };
}

function validDrillAttempt(attempt) {
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  if (attempt === null || typeof attempt !== 'object') return false;
  if (!finite(attempt.startedAt) || attempt.protocol !== LAST_FLAG_PROTOCOL) return false;
  if (typeof attempt.bankId !== 'string' || typeof attempt.positionId !== 'string') return false;
  if (!finite(attempt.setStartedAt) || !PROBLEM_CELL_SIZES.includes(attempt.cellPx)) return false;
  if (!finite(attempt.timeOriginMs) || !finite(attempt.startT) || !finite(attempt.endT) || attempt.endT < attempt.startT) return false;
  if (!PROBLEM_OUTCOMES.includes(attempt.outcome) || !Array.isArray(attempt.actions)) return false;
  if (!attempt.actions.every((a) => finite(a.t) && PROBLEM_ACTION_KINDS.includes(a.kind) && Number.isInteger(a.cell)
    && (a.gesture === undefined || a.gesture === true))) return false;
  const s = attempt.samples;
  if (s === null || typeof s !== 'object' || !Array.isArray(s.t) || !Array.isArray(s.x) || !Array.isArray(s.y)) return false;
  if (s.t.length !== s.x.length || s.t.length !== s.y.length) return false;
  return s.t.every(finite) && s.x.every(finite) && s.y.every(finite);
}

// LAST_FLAG_SET_SIZE positions, the least attempted first (random among ties),
// in random order.
function pickDrillSet(bank, drillAttempts, random) {
  const tries = new Map();
  for (const attempt of drillAttempts) tries.set(attempt.positionId, (tries.get(attempt.positionId) || 0) + 1);
  const picked = bank.lastFlag.map((position) => ({ position, tries: tries.get(position.id) || 0, tie: random() }))
    .sort((a, b) => a.tries - b.tries || a.tie - b.tie)
    .slice(0, LAST_FLAG_SET_SIZE)
    .map((entry) => entry.position);
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [picked[i], picked[j]] = [picked[j], picked[i]];
  }
  return picked;
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

// Complete runs grouped by square size, smallest first: per size, the median
// over runs of each run's median time per target (all targets and by move
// length) and the mean misses per run. Answers the plan's square size
// experiment: whether smaller squares are faster per square moved, and at
// what cost in accuracy.
function pointingBySize(runs, width, height) {
  const sizes = [...new Set(runs.map((run) => run.cellPx))].sort((a, b) => a - b);
  return sizes.map((cellPx) => {
    const summaries = runs.filter((run) => run.cellPx === cellPx).map((run) => summarizePointing(run, width, height));
    const byDistance = {};
    for (const name of ['2-4', '4-8', '8+']) {
      byDistance[name] = problemMedian(summaries.map((s) => s.byDistance[name].medianMovementMs));
    }
    return {
      cellPx,
      runs: summaries.length,
      medianMovementMs: problemMedian(summaries.map((s) => s.medianMovementMs)),
      byDistance,
      missesPerRun: summaries.reduce((sum, s) => sum + s.moves.reduce((m, move) => m + move.misses, 0), 0) / summaries.length,
    };
  });
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

function problemAttemptsFile(attempts, pointingRuns, drillAttempts, exportedAt) {
  return { format: PROBLEM_FILE_FORMAT, formatVersion: PROBLEM_FILE_VERSION, exportedAt, attempts, pointingRuns, drillAttempts };
}

function readProblemAttemptsFile(json, width, height) {
  if (json === null || typeof json !== 'object' || json.format !== PROBLEM_FILE_FORMAT) {
    throw new Error('not a problem attempts file');
  }
  if (json.formatVersion !== PROBLEM_FILE_VERSION) throw new Error('unknown problem attempts file version ' + json.formatVersion);
  if (!Array.isArray(json.attempts)) throw new Error('problem attempts file has no attempt list');
  if (!Array.isArray(json.pointingRuns)) throw new Error('problem attempts file has no pointing run list');
  if (!Array.isArray(json.drillAttempts)) throw new Error('problem attempts file has no drill attempt list');
  const valid = json.attempts.filter(validProblemAttempt);
  const validRuns = json.pointingRuns.filter((run) => validPointingRun(run, width, height));
  const validDrills = json.drillAttempts.filter(validDrillAttempt);
  return {
    valid,
    validRuns,
    validDrills,
    rejected: json.attempts.length - valid.length + json.pointingRuns.length - validRuns.length
      + json.drillAttempts.length - validDrills.length,
  };
}

//-------CLUTTERED SUB-BOARD & MENTATION SKILL DRILLS-------

const SKILL_DRILL_SET_SIZE = 8;

const SKILL_DRILL_SPECS = Object.freeze([
  {
    id: 'cluttered-counting',
    title: '1. Cluttered no-flag counting chunks',
    targetText: 'Entry <= 420 ms, follow-up <= 250 ms, 0 flags, 0 no-ops',
    description: 'Open every proven-safe counting square in a cluttered frontier by direct left-click reveals without placing flags. Trains overcoming the +269 ms no-flag counting hesitation.',
    instruction: 'Open all safe squares proven by single-number counting using direct left clicks only (place 0 flags).',
  },
  {
    id: 'bail-shape',
    title: '2. Cluttered 1-2 / 1-2-1 shapes with bail-first traps',
    targetText: 'Bail < 450 ms when easy moves wait; solve when alone',
    description: 'About 30% of rounds have 2 simple counting-safe squares open in another area (marked by a teal box): press Space or click an easy square within 450 ms to bail first. When no easy area exists, solve the overlap shape.',
    instruction: 'If a teal easy-counting box is open elsewhere, press Space (or click it) within 450 ms to bail first; otherwise solve the orange overlap shape.',
  },
  {
    id: 'ready-high',
    title: '3. Ready 4, 5, 6, and 7 pop-out scan',
    targetText: 'First flag <= 550 ms, 0 wrong flags',
    description: 'Spot a high number (3, 4, 5, or 6) whose remaining covered neighbors are all mines, flag its missing mine(s), and chord open the adjacent safe square(s).',
    instruction: 'Find the number whose remaining covered neighbors must all be mines, flag its mine, and open the newly proven safe squares.',
  },
  {
    id: 'endgame-finish',
    title: '4. Endgame direct finishing (no pointless flags)',
    targetText: '<= 260 ms per safe square, 0 flags placed',
    description: 'Endgame board with 2\u20134 remaining safe squares that are all provably safe right now. Left-click every remaining safe square directly to finish without placing a single flag.',
    instruction: 'Endgame: left-click all remaining safe squares directly to win. Do not place any flags.',
  },
  {
    id: 'eyes-ahead',
    title: '5. Two-area eyes-ahead lookahead transition',
    targetText: 'Departure <= 60 ms after Area A opens, path ratio <= 1.25x',
    description: 'Look at the orange target area (Area B) while resting on the blue start ring (Area A). The moment Area A opens, launch your cursor straight to Area B within 60 ms and clear its safe squares.',
    instruction: 'Fix your eyes on the orange target box now; the instant the ringed square opens, move straight to the orange box and open its safe square(s).',
  },
  {
    id: 'anti-drift',
    title: '6. Eyes-first anti-drift reading',
    targetText: 'Cursor path ratio <= 1.25x, slow clue drift <= 60 ms, hover <= 85 ms',
    description: 'Read the cluttered clue numbers with your eyes first before moving the mouse. Move in a direct line to the safe square(s) without dragging the cursor slowly over open numbers.',
    instruction: 'Read with your eyes first: keep cursor travel straight (<= 1.25x distance) with no slow drifting over open clue numbers.',
  },
]);

const SKILL_DRILL_BY_ID = new Map(SKILL_DRILL_SPECS.map((s) => [s.id, s]));

// Builds a set of SKILL_DRILL_SET_SIZE positions for `drillId` from the real
// pro-game problem bank so every drill runs on authentic 30x16 board clutter.
function buildSkillDrillSet(bank, drillId, random = Math.random) {
  const spec = SKILL_DRILL_BY_ID.get(drillId);
  if (!spec) throw new Error('unknown skill drill: ' + drillId);

  const shuffle = (arr) => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  if (drillId === 'cluttered-counting') {
    const pool = shuffle(bank.problems.filter((p) => p.classId === 'one' && p.freshSafe.length >= 2));
    const fallback = shuffle(bank.problems.filter((p) => p.classId === 'one'));
    const chosen = [...pool, ...fallback].slice(0, SKILL_DRILL_SET_SIZE);
    return chosen.map((p, idx) => ({
      ...p,
      id: `cc-${idx}-${p.id}`,
      drillId,
      forbidFlags: true,
      isTrapBail: false,
      easyElsewhereCells: [],
    }));
  }

  if (drillId === 'bail-shape') {
    const overlapPool = shuffle(bank.problems.filter((p) => p.classId !== 'one'));
    const countingPool = shuffle(bank.problems.filter((p) => p.classId === 'one'));
    const picked = overlapPool.slice(0, SKILL_DRILL_SET_SIZE);
    return picked.map((p, idx) => {
      // Make ~30% of rounds (e.g. 2 or 3 of 8) bail-first trap rounds by finding
      // 2 covered non-mine squares at distance >= 5 from p.start and opening a
      // safe neighbor around them so they are visibly easy counting targets.
      const isTrap = idx % 3 === 1 && countingPool.length > 0;
      const opened = p.opened.slice();
      const flags = p.flags.slice();
      const easyCells = [];
      if (isTrap) {
        const sx = p.start % bank.width;
        const sy = Math.floor(p.start / bank.width);
        for (let c = 0; c < bank.width * bank.height; c++) {
          if (opened[c] || flags[c] || p.mine[c] || p.freshSafe.includes(c) || c === p.start) continue;
          const dist = Math.max(Math.abs((c % bank.width) - sx), Math.abs(Math.floor(c / bank.width) - sy));
          if (dist < 5 || dist > 11) continue;
          const adjOpen = bank.neighbors[c].some((n) => opened[n] && p.adjacent[n] > 0);
          if (adjOpen) {
            easyCells.push(c);
            if (easyCells.length === 2) break;
          }
        }
      }
      return {
        ...p,
        id: `bs-${idx}-${p.id}`,
        drillId,
        opened,
        flags,
        isTrapBail: easyCells.length >= 2,
        easyElsewhereCells: easyCells,
        freshSafe: easyCells.length >= 2 ? [...p.freshSafe, ...easyCells] : p.freshSafe.slice(),
        primaryOverlapSafe: p.freshSafe.slice(),
      };
    });
  }

  if (drillId === 'ready-high') {
    // Use lastFlag positions preferring numbers >= 3, or problems with freshMines
    const highLastFlag = shuffle(bank.lastFlag.filter((pos) => pos.adjacent[pos.number] >= 3));
    const otherLastFlag = shuffle(bank.lastFlag.filter((pos) => pos.adjacent[pos.number] < 3));
    const chosen = [...highLastFlag, ...otherLastFlag].slice(0, SKILL_DRILL_SET_SIZE);
    return chosen.map((pos, idx) => ({
      ...pos,
      id: `rh-${idx}-${pos.id}`,
      drillId,
      isLastFlagStyle: true,
      isTrapBail: false,
      easyElsewhereCells: [],
    }));
  }

  if (drillId === 'endgame-finish') {
    const pool = shuffle(bank.problems);
    return pool.slice(0, SKILL_DRILL_SET_SIZE).map((p, idx) => {
      // Reveal every safe square on the board EXCEPT p.start and p.freshSafe (2-4 safe squares left!)
      const targetSafe = p.freshSafe.slice(0, 3);
      const keepCoveredSafe = new Set([p.start, ...targetSafe]);
      const opened = p.opened.map((_, i) => !p.mine[i] && !keepCoveredSafe.has(i));
      // Keep only a subset of existing flags so the player isn't given all 99 flags
      const flags = p.flags.slice();
      return {
        ...p,
        id: `ef-${idx}-${p.id}`,
        drillId,
        opened,
        flags,
        freshSafe: targetSafe,
        freshMines: [],
        forbidFlags: true,
        isTrapBail: false,
        easyElsewhereCells: [],
      };
    });
  }

  if (drillId === 'eyes-ahead') {
    // Pick problems where start and freshSafe are separated or plant a start ring 5-7 squares away
    const pool = shuffle(bank.problems.filter((p) => p.classId === 'one'));
    return pool.slice(0, SKILL_DRILL_SET_SIZE).map((p, idx) => {
      const tx = p.freshSafe[0] % bank.width;
      const ty = Math.floor(p.freshSafe[0] / bank.width);
      // Open p.start immediately in `opened` so the local clues around freshSafe are already visible!
      const opened = p.opened.slice();
      opened[p.start] = true;
      // Pick a distant safe square 5-8 squares away as Area A's trigger ring
      let remoteStart = p.start;
      for (let c = 0; c < bank.width * bank.height; c++) {
        if (opened[c] || p.flags[c] || p.mine[c] || p.freshSafe.includes(c)) continue;
        const d = Math.max(Math.abs((c % bank.width) - tx), Math.abs(Math.floor(c / bank.width) - ty));
        if (d >= 5 && d <= 8 && bank.neighbors[c].some((n) => opened[n])) {
          remoteStart = c;
          break;
        }
      }
      return {
        ...p,
        id: `ea-${idx}-${p.id}`,
        drillId,
        opened,
        start: remoteStart,
        startAt: [0.5, 0.5],
        isEyesAhead: true,
        isTrapBail: false,
        easyElsewhereCells: [],
      };
    });
  }

  // 'anti-drift': cluttered counting + overlap positions scored strictly on cursor path ratio & clue drift
  const pool = shuffle(bank.problems);
  return pool.slice(0, SKILL_DRILL_SET_SIZE).map((p, idx) => ({
    ...p,
    id: `ad-${idx}-${p.id}`,
    drillId,
    isAntiDrift: true,
    isTrapBail: false,
    easyElsewhereCells: [],
  }));
}

// Evaluates cursor kinematics & action discipline on a completed skill-drill round.
function summarizeSkillDrillAttempt(bank, problem, attempt) {
  const board = problemBoard(bank, problem);
  if (!problem.isLastFlagStyle) {
    applyProblemAction(board, 'reveal', problem.start);
  }
  let firstMs = null;
  let doneMs = null;
  let flagsPlaced = 0;
  let idleClicks = 0;
  let bailedFast = false;
  const followGaps = [];
  let prevActionT = null;

  if (attempt.bailedWithSpace === true) {
    firstMs = attempt.endT - attempt.startT;
    doneMs = firstMs;
    bailedFast = problem.isTrapBail === true && firstMs <= 550;
  }

  for (const action of attempt.actions) {
    const effect = applyProblemAction(board, action.kind, action.cell);
    const changed = effect.opened.length > 0 || effect.flagChanged;
    if (!changed) idleClicks++;
    if (action.kind === 'flag' && effect.flagChanged) flagsPlaced++;
    if (firstMs === null && changed) firstMs = action.t;
    else if (changed && prevActionT !== null) followGaps.push(action.t - prevActionT);
    if (changed) prevActionT = action.t;

    if (problem.isTrapBail && problem.easyElsewhereCells.includes(action.cell) && effect.opened.length > 0) {
      bailedFast = action.t <= 650;
      doneMs = action.t;
    }
    const targetList = problem.isTrapBail ? problem.primaryOverlapSafe : problem.freshSafe;
    if (doneMs === null && targetList.every((c) => board.revealed[c])) {
      doneMs = action.t;
    }
  }

  // Cursor kinematics over [0, firstActionT or doneMs]
  const s = attempt.samples || { t: [], x: [], y: [] };
  let departMs = null;
  let pathRatio = null;
  let slowOnClueMs = 0;
  let hoverMs = null;

  const endWindowT = firstMs !== null ? firstMs : (doneMs !== null ? doneMs : 1000);
  const startIdx = s.t.findIndex((t) => t >= 0);
  if (startIdx !== -1 && s.t.length - startIdx >= 2) {
    const x0 = s.x[startIdx];
    const y0 = s.y[startIdx];
    let pathCells = 0;
    let lastEndIdx = startIdx;
    for (let i = startIdx + 1; i < s.t.length && s.t[i] <= endWindowT; i++) {
      lastEndIdx = i;
      const dt = s.t[i] - s.t[i - 1];
      const seg = Math.hypot(s.x[i] - s.x[i - 1], s.y[i] - s.y[i - 1]);
      pathCells += seg;
      if (departMs === null && Math.hypot(s.x[i] - x0, s.y[i] - y0) >= 0.3) {
        departMs = Math.max(0, Math.round(s.t[i]));
      }
      if (dt > 0) {
        const spd = seg / (dt / 1000);
        if (spd < 3.0 && Math.hypot(s.x[i] - x0, s.y[i] - y0) > 0.7) {
          const cx = Math.floor(s.x[i]);
          const cy = Math.floor(s.y[i]);
          if (cx >= 0 && cx < bank.width && cy >= 0 && cy < bank.height) {
            const ci = cy * bank.width + cx;
            if (problem.opened[ci] && problem.adjacent[ci] > 0) slowOnClueMs += dt;
          }
        }
      }
    }
    const chord = Math.hypot(s.x[lastEndIdx] - x0, s.y[lastEndIdx] - y0);
    if (chord >= 0.8) pathRatio = pathCells / chord;
    if (attempt.actions.length > 0) {
      const a0 = attempt.actions[0];
      const split = problemMovementSplit(s, a0.t, { x: a0.cell % bank.width, y: Math.floor(a0.cell / bank.width) });
      if (split) hoverMs = Math.round(split.hover);
    }
  }

  const followMedMs = problemMedian(followGaps);
  let passedRule = attempt.outcome === 'solved';
  let feedbackNote = 'Clean execution.';

  if (problem.drillId === 'cluttered-counting') {
    if (flagsPlaced > 0) {
      passedRule = false;
      feedbackNote = 'Placed ' + flagsPlaced + ' flag(s) \u2014 solve by direct left-click reveals only.';
    } else if (idleClicks > 0) {
      passedRule = false;
      feedbackNote = 'Made ' + idleClicks + ' no-op click(s).';
    }
  } else if (problem.drillId === 'bail-shape') {
    if (problem.isTrapBail) {
      passedRule = bailedFast;
      feedbackNote = bailedFast
        ? 'Fast bail (' + Math.round(firstMs || 0) + ' ms) to easy counting!'
        : 'Trap round: 2 easy counting moves waited in the teal box, so bailing within 550 ms was faster.';
    } else if (attempt.bailedWithSpace) {
      passedRule = false;
      feedbackNote = 'Bailed with Space when no easy counting moves existed elsewhere.';
    }
  } else if (problem.drillId === 'endgame-finish') {
    if (flagsPlaced > 0) {
      passedRule = false;
      feedbackNote = 'Placed ' + flagsPlaced + ' pointless endgame flag(s) instead of clicking safe squares directly.';
    }
  } else if (problem.drillId === 'eyes-ahead') {
    if (departMs !== null && departMs > 120) {
      feedbackNote = 'Cursor departed after ' + departMs + ' ms (target <= 60 ms: shift eyes to the orange box before Area A opens).';
    } else if (departMs !== null) {
      feedbackNote = 'Eyes-ahead departure in ' + departMs + ' ms!';
    }
  } else if (problem.drillId === 'anti-drift') {
    if (pathRatio !== null && pathRatio > 1.35) {
      feedbackNote = 'Cursor path ratio ' + pathRatio.toFixed(2) + '\u00d7 (target <= 1.25\u00d7: read with eyes before moving mouse).';
    } else if (pathRatio !== null) {
      feedbackNote = 'Straight eyes-first path (' + pathRatio.toFixed(2) + '\u00d7)!';
    }
  }

  return {
    outcome: attempt.outcome,
    passedRule,
    feedbackNote,
    firstMs: firstMs !== null ? Math.round(firstMs) : null,
    followMedMs: followMedMs !== null ? Math.round(followMedMs) : null,
    doneMs: doneMs !== null ? Math.round(doneMs) : null,
    departMs,
    pathRatio,
    slowOnClueMs: Math.round(slowOnClueMs),
    hoverMs,
    flagsPlaced,
    idleClicks,
  };
}

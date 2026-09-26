'use strict';

// Minesweeper problems, pure (docs/product/problems.md): the bank format, the
// board a problem starts from, what each click does, when a problem is solved,
// the thinking/moving split of the first answer, and summaries of saved
// attempts. No DOM and no storage; problems-page.js and
// tests/problems-core-test.js load it.

// A released protocol id names one exact procedure; any change to these values
// or to how an attempt runs ships under a new id.
const PROBLEM_PROTOCOL = 'problems-v1';
const PROBLEM_PREVIEW_MS = 1000;
const PROBLEM_TIMEOUT_MS = 20000;
const PROBLEM_ONSET_CELLS = 0.25;

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
const PROBLEM_BANK_VERSION = 1;
const PROBLEM_FILE_FORMAT = 'minesweeper-problems-attempts';
const PROBLEM_FILE_VERSION = 1;

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
  let last = -1;
  while (last + 1 < samples.t.length && samples.t[last + 1] <= 0) last++;
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
  return { reaction: onset, travel: arrival - onset, hover: clickT - arrival };
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
    if (problem === undefined || attempt.outcome === 'abandoned' || attempt.outcome === 'interrupted') continue;
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
  if (!finite(attempt.startedAt) || attempt.protocol !== PROBLEM_PROTOCOL) return false;
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

function problemAttemptsFile(attempts, exportedAt) {
  return { format: PROBLEM_FILE_FORMAT, formatVersion: PROBLEM_FILE_VERSION, exportedAt, attempts };
}

function readProblemAttemptsFile(json) {
  if (json === null || typeof json !== 'object' || json.format !== PROBLEM_FILE_FORMAT) {
    throw new Error('not a problem attempts file');
  }
  if (json.formatVersion !== PROBLEM_FILE_VERSION) throw new Error('unknown problem attempts file version ' + json.formatVersion);
  if (!Array.isArray(json.attempts)) throw new Error('problem attempts file has no attempt list');
  const valid = json.attempts.filter(validProblemAttempt);
  return { valid, rejected: json.attempts.length - valid.length };
}

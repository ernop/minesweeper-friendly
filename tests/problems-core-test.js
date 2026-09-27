'use strict';

// Minesweeper problems, pure core: the released protocol stays frozen, the
// bank decodes and every problem's answer squares are what the new number
// proves, clicks do what the game's clicks do, only aimed answers count, the
// thinking/moving split, profiles, set picking, validation, and backup files
// (docs/product/problems.md).

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const repo = path.join(__dirname, '..');
vm.runInThisContext(fs.readFileSync(path.join(repo, 'problems-core.js'), 'utf8'));
const Justice = require(path.join(repo, 'justice.js'));

let checks = 0;
function check(name, fn) {
  try {
    fn();
  } catch (error) {
    error.message = name + ': ' + error.message;
    throw error;
  }
  checks++;
}

const bankJson = JSON.parse(fs.readFileSync(path.join(repo, 'problems-bank.json'), 'utf8'));
const bank = readProblemBank(bankJson);

check('released protocol constants are frozen', () => {
  assert.equal(PROBLEM_PROTOCOL, 'problems-v2');
  assert.deepEqual([...PROBLEM_RECORDED_PROTOCOLS], ['problems-v1', 'problems-v2']);
  assert.equal(PROBLEM_PREVIEW_MS, 1000);
  assert.equal(PROBLEM_TIMEOUT_MS, 20000);
  assert.equal(PROBLEM_ONSET_CELLS, 0.25);
  assert.equal(PROBLEM_FOCUS_MARGIN, 1);
});

check('the focus box holds the start and every answer square, one square wider, inside the board', () => {
  for (const problem of bank.problems) {
    const box = problemFocusBox(bank, problem);
    assert.ok(box.col0 >= 0 && box.row0 >= 0 && box.col1 < bank.width && box.row1 < bank.height, problem.id);
    for (const cell of [problem.start, ...problem.freshSafe, ...problem.freshMines]) {
      const col = cell % bank.width;
      const row = Math.floor(cell / bank.width);
      assert.ok(col >= box.col0 && col <= box.col1 && row >= box.row0 && row <= box.row1, problem.id + ' square ' + cell);
      assert.ok(col - box.col0 >= 1 || box.col0 === 0, 'margin on the left unless at the edge');
    }
  }
});

check('square maps decode four squares per hex digit, most significant first', () => {
  assert.deepEqual(problemBits('a1', 8), [true, false, true, false, false, false, false, true]);
  assert.throws(() => problemBits('a1', 12), /12 squares/);
  assert.throws(() => problemBits('g1', 8), /8 squares/);
});

check('the bank decodes, and every class has problems', () => {
  assert.equal(bank.width * bank.height, 480);
  assert.ok(bank.problems.length > 0);
  const used = new Set(bank.problems.map((p) => p.classId));
  assert.deepEqual([...used].sort(), Object.keys(bank.classes).sort());
  assert.ok(bank.classes.one !== undefined, 'the one-number class is the baseline');
  for (const problem of bank.problems) assert.equal(problem.mine.filter(Boolean).length, bank.mines, problem.id);
});

// The bank was built with the full solver; here every problem is re-proved
// with the game's own engine at the two-number strength the classes name.
check('every answer square is proven by the new number and was not provable before', () => {
  const clues = (revealed, adjacent) => {
    const list = [];
    for (let i = 0; i < 480; i++) {
      if (!revealed[i]) continue;
      const covered = bank.neighbors[i].filter((n) => !revealed[n]);
      if (covered.length > 0) list.push({ cell: i, covered, count: adjacent[i] });
    }
    return list;
  };
  const prove = (revealed, adjacent) => Justice.proveFacts(
    { width: bank.width, height: bank.height, mines: bank.mines, revealed, adjacent },
    clues(revealed, adjacent), { global: false, exact: false });
  for (const problem of bank.problems) {
    const before = prove(problem.opened, problem.adjacent);
    const after = problem.opened.slice();
    after[problem.start] = true;
    const facts = prove(after, problem.adjacent);
    assert.ok(problem.freshSafe.length > 0, problem.id);
    for (const cell of problem.freshSafe) {
      assert.equal(facts.get(cell), 2, problem.id + ' square ' + cell + ' proven safe');
      assert.equal(before.has(cell), false, problem.id + ' square ' + cell + ' not provable before');
    }
    for (const cell of problem.freshMines) assert.equal(facts.get(cell), 1, problem.id + ' square ' + cell + ' proven mine');
  }
});

// A hand-made 4 x 4 bank for exact click semantics, mines at 0 and 2:
//   M 2 M 1
//   1 2 1 1
//   0 0 0 0
//   0 0 0 0
check('clicks: reveal, chain opening, flags, chords, mines', () => {
  const hex = (cells) => {
    const list = new Array(16).fill(false);
    for (const c of cells) list[c] = true;
    let out = '';
    for (let i = 0; i < 16; i += 4) out += ((list[i] << 3) | (list[i + 1] << 2) | (list[i + 2] << 1) | list[i + 3]).toString(16);
    return out;
  };
  const small = readProblemBank({
    format: 'minesweeper-problems-bank', formatVersion: 3, bankId: 'test', width: 4, height: 4, mines: 2, lastFlag: [],
    travelByLevel: { '1-1.4': {} },
    levels: ['1-1.4'], classes: { one: { family: null, byLevel: {} } },
    problems: [{ id: 't-1', classId: 'one', mines: hex([0, 2]), opened: hex([]), flags: hex([]), start: 1,
      startAt: [0.5, 0.5], freshSafe: [4], freshMines: [0], original: { first: null, doneMs: null } }],
  });
  const problem = small.problems[0];
  const board = problemBoard(small, problem);
  let effect = applyProblemAction(board, 'reveal', 1);
  assert.deepEqual(effect.opened, [1], 'a numbered square opens alone');
  effect = applyProblemAction(board, 'chord', 1);
  assert.deepEqual(effect.opened, [], 'a chord without its flags changes nothing');
  effect = applyProblemAction(board, 'flag', 0);
  assert.equal(effect.flagChanged, true);
  assert.equal(applyProblemAction(board, 'flag', 0).flagChanged, false, 'flagging a flagged square changes nothing');
  assert.deepEqual(applyProblemAction(board, 'chord', 1).opened, [], 'one flag of two: still nothing');
  applyProblemAction(board, 'flag', 2);
  effect = applyProblemAction(board, 'chord', 1);
  assert.deepEqual(effect.opened.sort((a, b) => a - b), [4, 5, 6], 'the chord opens every unflagged neighbor');
  assert.equal(effect.mineHit, null);
  assert.equal(problemSolved(board, problem), true);
  effect = applyProblemAction(board, 'reveal', 13);
  assert.deepEqual(effect.opened.sort((a, b) => a - b), [7, 8, 9, 10, 11, 12, 13, 14, 15],
    'a zero opens its neighbors and the zeros among them theirs; numbers stop it');
  effect = applyProblemAction(board, 'unflag', 0);
  assert.equal(effect.flagChanged, true);
  effect = applyProblemAction(board, 'reveal', 0);
  assert.equal(effect.mineHit, 0);
  assert.throws(() => applyProblemAction(board, 'poke', 3), /unknown kind/);
});

check('only clicks aimed at the answer squares count as answers', () => {
  const problem = { freshSafe: [4, 9], freshMines: [0] };
  assert.equal(answersProblem(problem, 'reveal', 4, { opened: [4], flagChanged: false }), true);
  assert.equal(answersProblem(problem, 'reveal', 7, { opened: [7, 4], flagChanged: false }), false,
    'a chain opening from another square is not an answer');
  assert.equal(answersProblem(problem, 'chord', 1, { opened: [9], flagChanged: false }), true);
  assert.equal(answersProblem(problem, 'flag', 0, { opened: [], flagChanged: true }), true);
  assert.equal(answersProblem(problem, 'flag', 3, { opened: [], flagChanged: true }), false);
});

check('thinking and moving: reaction, travel, hover', () => {
  const samples = {
    t: [-400, 0, 50, 80, 120, 160, 200],
    x: [3.5, 3.5, 3.5, 3.9, 5.0, 6.4, 6.5],
    y: [2.5, 2.5, 2.5, 2.5, 2.6, 2.5, 2.5],
  };
  const split = problemMovementSplit(samples, 260, { x: 6, y: 2 });
  assert.deepEqual(split, { reaction: 80, travel: 80, hover: 100 });
  assert.equal(problemMovementSplit({ t: [5], x: [1], y: [1] }, 100, { x: 1, y: 1 }), null, 'no position at the start');
  assert.equal(problemMovementSplit({ t: [0, 50], x: [6.5, 6.6], y: [2.5, 2.5] }, 100, { x: 6, y: 2 }), null,
    'an answer under the resting cursor has no travel');
});

function solvedAttempt(problem, t, overrides) {
  const target = problem.freshSafe[0];
  const x = target % bank.width + 0.5;
  const y = Math.floor(target / bank.width) + 0.5;
  const sx = problem.start % bank.width + 0.5;
  const sy = Math.floor(problem.start / bank.width) + 0.5;
  return {
    startedAt: 1790000000000 + t, protocol: PROBLEM_PROTOCOL, bankId: bank.bankId, problemId: problem.id,
    classId: problem.classId, setStartedAt: 1790000000000, cellPx: 24, timeOriginMs: 1789999990000,
    previewT: 1000, startT: 2000, endT: 2000 + 400 + 50 * problem.freshSafe.length, outcome: 'solved',
    actions: problem.freshSafe.map((cell, i) => ({ t: 400 + 50 * i, kind: 'reveal', cell })),
    samples: { t: [-900, 0, 150, 250, 350], x: [sx, sx, sx + (x - sx) * 0.3, x, x], y: [sy, sy, sy + (y - sy) * 0.3, y, y] },
    ...overrides,
  };
}

check('an attempt summary replays the clicks', () => {
  const problem = bank.problems.find((p) => p.freshSafe.length >= 2);
  const attempt = solvedAttempt(problem, 1);
  assert.equal(validProblemAttempt(attempt), true);
  const summary = summarizeAttempt(bank, attempt);
  assert.equal(summary.firstMs, 400);
  assert.equal(summary.doneMs, 400 + 50 * (problem.freshSafe.length - 1));
  assert.equal(summary.otherClicks, 0);
  assert.equal(summary.thinkMs + summary.travelMs, 400);
  const mixed = solvedAttempt(problem, 2, { actions: [{ t: 300, kind: 'chord', cell: problem.start }, ...attempt.actions] });
  const withIdle = summarizeAttempt(bank, mixed);
  assert.equal(withIdle.firstMs, 400);
  assert.equal(withIdle.otherClicks + withIdle.idleClicks, 1, 'the first click was not an answer');
});

check('the profile groups attempts by the class their problem has now', () => {
  const [a, b] = bank.problems.filter((p) => p.classId === 'one');
  const list = [
    solvedAttempt(a, 10),
    solvedAttempt(b, 11, { classId: 'a class from an older bank' }),
    solvedAttempt(a, 12, { outcome: 'mine' }),
    solvedAttempt(a, 13, { outcome: 'abandoned' }),
    solvedAttempt(a, 14, { problemId: 'not-in-this-bank' }),
    solvedAttempt(a, 15, { protocol: 'problems-v1' }),
  ];
  assert.equal(validProblemAttempt(list[list.length - 1]), true, 'attempts made before the focus box stay valid');
  const row = problemProfile(bank, list).find((r) => r.classId === 'one');
  assert.equal(row.attempts, 3, 'the ladders count only attempts made with the focus box');
  assert.equal(row.solved, 2);
  assert.equal(row.thinkCount, 2);
  assert.equal(problemProfile(bank, []).every((r) => r.medianThinkMs === null), true);
});

check('a set: one-number problems, then pattern classes in turn, least tried first', () => {
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const set = pickProblemSet(bank, [], random);
  assert.equal(set.length, PROBLEM_SET_SIZE);
  assert.equal(new Set(set.map((p) => p.id)).size, set.length, 'no problem twice in a set');
  assert.equal(set.filter((p) => p.classId === 'one').length, PROBLEM_SET_ONE_NUMBER);
  const patternClasses = Object.keys(bank.classes).filter((id) => id !== 'one');
  const counts = patternClasses.map((id) => set.filter((p) => p.classId === id).length);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, 'pattern classes share the set evenly');
  const tried = set.map((p, i) => solvedAttempt(p, 100 + i));
  const next = pickProblemSet(bank, tried, random);
  assert.equal(next.filter((p) => tried.some((a) => a.problemId === p.id)).length, 0, 'untried problems come first');
});

check('ladder layout: fastest on top, labels kept apart and in order', () => {
  const values = [300, 160, 170, 165, 250];
  const layout = ladderLayout(values, 200, 20);
  const byValue = values.map((v, i) => i).sort((a, b) => values[a] - values[b]);
  for (let k = 1; k < byValue.length; k++) {
    const [a, b] = [byValue[k - 1], byValue[k]];
    assert.ok(layout.dotY[a] <= layout.dotY[b], 'faster entries sit higher');
    assert.ok(layout.labelY[b] - layout.labelY[a] >= 20 - 1e-9, 'labels at least the gap apart');
  }
  assert.ok(layout.labelY.every((y) => y >= 10 - 1e-9 && y <= 190 + 1e-9), 'labels stay inside');
  assert.equal(layout.dotY[1] > 0 && layout.dotY[0] < 200, true, 'exact points inside the drawing');
  assert.ok(layout.ticks.length >= 2 && layout.ticks.every((t, i) => i === 0 || t.ms > layout.ticks[i - 1].ms));
  const single = ladderLayout([200], 100, 20);
  assert.equal(single.dotY[0], 50, 'one entry sits in the middle');
});

check('class names in words', () => {
  assert.equal(describeProblemClass(bank, 'one').name, 'one number at a time');
  const entry = (family) => ({ classes: { x: { family } } });
  assert.equal(describeProblemClass(entry('1/1 safe'), 'x').name, '1-1 rule');
  assert.equal(describeProblemClass(entry('1/1 safe wall'), 'x').name, '1-1 rule at the edge');
  assert.equal(describeProblemClass(entry('1/2 safe'), 'x').name, '1-2 rule');
  assert.match(describeProblemClass(entry('1/2 safe'), 'x').rule, /only the 1 touches must all be safe/);
});

check('attempt validation and the backup file', () => {
  const problem = bank.problems[0];
  const good = solvedAttempt(problem, 20);
  assert.equal(validProblemAttempt(good), true);
  assert.equal(validProblemAttempt({ ...good, protocol: 'problems-v0' }), false);
  assert.equal(validProblemAttempt({ ...good, protocol: 'problems-v1' }), true);
  assert.equal(validProblemAttempt({ ...good, outcome: 'won' }), false);
  assert.equal(validProblemAttempt({ ...good, cellPx: 25 }), false);
  assert.equal(validProblemAttempt({ ...good, previewT: good.startT - 999 }), false, 'the preview lasts the full second');
  assert.equal(validProblemAttempt({ ...good, samples: { t: [1], x: [], y: [] } }), false);
  assert.equal(validProblemAttempt({ ...good, actions: [{ t: 1, kind: 'poke', cell: 3 }] }), false);
  const run = pointingRun();
  const drill = drillAttempt(bank.lastFlag[0], true);
  const file = problemAttemptsFile([good, { ...good, outcome: 'won' }], [run, { ...run, protocol: 'pointing-v0' }],
    [drill, { ...drill, protocol: 'last-flag-v0' }], 1790000000000);
  const read = readProblemAttemptsFile(JSON.parse(JSON.stringify(file)), bank.width, bank.height);
  assert.equal(read.valid.length, 1);
  assert.equal(read.validRuns.length, 1);
  assert.equal(read.validDrills.length, 1);
  assert.equal(read.rejected, 3);
  assert.throws(() => readProblemAttemptsFile({ format: 'minesweeper-friendly-self-checks' }, 30, 16), /not a problem attempts file/);
  assert.throws(() => readProblemAttemptsFile({ ...file, formatVersion: 2 }, 30, 16), /unknown problem attempts file version/);
  assert.throws(() => readProblemAttemptsFile({ ...file, pointingRuns: undefined }, 30, 16), /no pointing run list/);
  assert.throws(() => readProblemAttemptsFile({ ...file, drillAttempts: undefined }, 30, 16), /no drill attempt list/);
});

// A drill attempt at a position: the 1.5 click (flag, then a both-button
// chord) or a chord tried first, one flag short, then flag and chord.
function drillAttempt(position, oneAndHalf) {
  const flag = { t: 300, kind: 'flag', cell: position.mineCell };
  const actions = oneAndHalf
    ? [flag, { t: 420, kind: 'chord', cell: position.number, gesture: true }]
    : [{ t: 250, kind: 'chord', cell: position.number }, { ...flag, t: 500 }, { t: 700, kind: 'chord', cell: position.number }];
  return { startedAt: 1790000000000, protocol: 'last-flag-v1', bankId: bank.bankId, positionId: position.id,
    setStartedAt: 1790000000000, cellPx: 24, timeOriginMs: 1789999990000, startT: 2000, endT: 2800,
    outcome: 'solved', actions, samples: { t: [0, 100], x: [1, 2], y: [1, 2] } };
}

check('last-flag positions: one flag short, a provable mine, safe squares to open', () => {
  assert.equal(LAST_FLAG_PROTOCOL, 'last-flag-v1');
  assert.equal(LAST_FLAG_TIMEOUT_MS, 10000);
  assert.equal(LAST_FLAG_SET_SIZE, 10);
  assert.ok(bank.lastFlag.length >= LAST_FLAG_SET_SIZE);
  for (const position of bank.lastFlag) {
    const clues = [];
    for (let i = 0; i < 480; i++) {
      if (!position.opened[i]) continue;
      const covered = bank.neighbors[i].filter((n) => !position.opened[n]);
      if (covered.length > 0) clues.push({ cell: i, covered, count: position.adjacent[i] });
    }
    const facts = Justice.proveFacts({ width: 30, height: 16, mines: 99, revealed: position.opened, adjacent: position.adjacent },
      clues, { global: false, exact: false });
    assert.equal(facts.get(position.mineCell), 1, position.id + ' mine is provable');
  }
});

check('a drill attempt: the 1.5 click, and a chord tried one flag short', () => {
  const position = bank.lastFlag[0];
  const quick = summarizeDrillAttempt(bank, drillAttempt(position, true));
  assert.deepEqual(quick, { outcome: 'solved', doneMs: 420, clicks: 2, idleClicks: 0, usedGesture: true });
  const slow = summarizeDrillAttempt(bank, drillAttempt(position, false));
  assert.deepEqual(slow, { outcome: 'solved', doneMs: 700, clicks: 3, idleClicks: 1, usedGesture: false });
  assert.equal(validDrillAttempt(drillAttempt(position, true)), true);
  assert.equal(validDrillAttempt({ ...drillAttempt(position, true), actions: [{ t: 1, kind: 'chord', cell: 3, gesture: false }] }), false);
  assert.equal(validDrillAttempt({ ...drillAttempt(position, true), positionId: 5 }), false);
  const set = pickDrillSet(bank, [drillAttempt(position, true)], () => 0.5);
  assert.equal(set.length, LAST_FLAG_SET_SIZE);
  assert.equal(set.some((p) => p.id === position.id), false, 'untried positions first');
});

// A complete pointing run on the fixed route: each target shown 50 ms after
// the previous press and pressed after 200 + 100 * index of difficulty ms, the
// cursor resting 60 ms before each press; one miss on the first target.
function pointingRun() {
  const route = pointingTargets(bank.width, bank.height);
  const samples = { t: [1000], x: [15.5], y: [8.5] };
  const targets = [];
  let t = 1000;
  let [x, y] = [15.5, 8.5];
  for (const target of route) {
    const shownT = t + 50;
    const pressT = shownT + 200 + 100 * Math.log2(target.distance + 1);
    const tx = target.col + 0.5;
    const ty = target.row + 0.5;
    samples.t.push(shownT + 30, shownT + 60, pressT - 60, pressT - 1);
    samples.x.push(x, x + (tx - x) * 0.5, tx, tx);
    samples.y.push(y, y + (ty - y) * 0.5, ty, ty);
    targets.push({ shownT, pressT, x: tx + 0.1, y: ty, misses: targets.length === 0 ? [{ t: shownT + 100, x: 1.5, y: 1.5 }] : [] });
    [x, y, t] = [tx, ty, pressT];
  }
  return { startedAt: 1790000000000, protocol: 'pointing-v1', cellPx: 24, timeOriginMs: 1789999990000,
    startT: 1000, endT: t, outcome: 'complete', targets, samples };
}

check('the pointing route is frozen and stays on the board', () => {
  assert.equal(POINTING_PROTOCOL, 'pointing-v1');
  assert.deepEqual([...POINTING_START], [15, 8]);
  assert.equal(POINTING_MOVES.length, 24);
  const route = pointingTargets(bank.width, bank.height);
  assert.equal(route.length, 24);
  assert.deepEqual(route.slice(0, 3).map((r) => [r.col, r.row]), [[18, 8], [18, 11], [15, 11]]);
  assert.ok(route.every((r) => r.distance >= 2 && r.distance <= 13));
  const lengths = route.map((r) => r.distance);
  assert.equal(lengths.filter((d) => d >= 2 && d < 4).length, 9);
  assert.equal(lengths.filter((d) => d >= 4 && d < 8).length, 9);
  assert.equal(lengths.filter((d) => d >= 8).length, 6);
});

check('a pointing run summarizes to the line it was built from', () => {
  const run = pointingRun();
  assert.equal(validPointingRun(run, bank.width, bank.height), true);
  const summary = summarizePointing(run, bank.width, bank.height);
  assert.ok(Math.abs(summary.fittsSlopeMsPerBit - 100) < 1e-9);
  assert.ok(Math.abs(summary.fittsInterceptMs - 200) < 1e-9);
  assert.equal(summary.misses, 1);
  assert.ok(Math.abs(summary.pressSpreadSquares - 0.1) < 1e-9);
  assert.equal(summary.medianHoverMs, 60);
  assert.equal(summary.byDistance['2-4'].moves, 9);
  assert.ok(summary.byDistance['2-4'].medianTravelMs > 0);
  assert.ok(summary.throughputBitsPerSec > 0);
  assert.equal(validPointingRun({ ...run, targets: run.targets.slice(1) }, bank.width, bank.height), false, 'a complete run has every target');
  assert.equal(validPointingRun({ ...run, outcome: 'abandoned', targets: run.targets.slice(0, 5) }, bank.width, bank.height), true);
  const outside = run.targets.map((t, i) => (i === 3 ? { ...t, x: t.x + 1 } : t));
  assert.equal(validPointingRun({ ...run, targets: outside }, bank.width, bank.height), false, 'a press counts only on its target');
});

check('a malformed bank fails loudly', () => {
  assert.throws(() => readProblemBank({ ...bankJson, format: 'x' }), /not a problem bank/);
  assert.throws(() => readProblemBank({ ...bankJson, formatVersion: 2 }), /format version/);
  const noMine = { ...bankJson, lastFlag: [{ ...bankJson.lastFlag[0], mine: bankJson.lastFlag[0].safe[0] }] };
  assert.throws(() => readProblemBank(noMine), /last-flag position .* has an invalid mine/);
  const broken = { ...bankJson, problems: [{ ...bankJson.problems[0], classId: 'nonexistent' }] };
  assert.throws(() => readProblemBank(broken), /unknown class/);
  assert.throws(() => readProblemBank({ ...bankJson, travelByLevel: {} }), /no travel times/);
});

console.log('problems core: ' + checks + ' checks passed');

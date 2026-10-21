'use strict';
// The during-the-game model and rows (during-game.js), run inside the
// analysis worker as the page runs them, on scripted games over hand-built
// boards whose proofs are worked out by hand in the comments.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const replies = [];
const context = vm.createContext({ self: { postMessage: (value) => replies.push(structuredClone(value)) } });
context.importScripts = (...files) => {
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file.split('?')[0]), 'utf8'), context, { filename: file });
};
vm.runInContext(fs.readFileSync(path.join(root, 'analysis-worker.js'), 'utf8'), context);
let id = 0;
const task = (kind, payload) => {
  context.self.onmessage({ data: { id: ++id, kind, payload: structuredClone(payload) } });
  const response = replies.pop();
  assert.equal(response.id, id);
  if (response.error) throw new Error(response.error);
  return response.result;
};
const DuringGame = vm.runInContext('DuringGame', context);
// Results cross into this realm so deepEqual compares values, not prototypes.
const modelOf = (game) => structuredClone(DuringGame.model(game));
const viewOf = (game, rows, average) => structuredClone(DuringGame.view(DuringGame.model(game), rows, average));
const Justice = vm.runInContext('Justice', context);

const CELL_PX = 20;
const START_T = 500;

// Plays `steps` on a board as the game records them: one decision per
// action with the position before it, the cursor gliding to each target
// and arriving 5 ms before the click (or 300 ms before when `still`).
function playGame(width, height, mineCells, steps) {
  const size = width * height;
  const mine = new Array(size).fill(false);
  for (const cell of mineCells) mine[cell] = true;
  const near = (cell) => {
    const out = [];
    const cx = cell % width, cy = Math.floor(cell / width);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx, ny = cy + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < width && ny < height) out.push(ny * width + nx);
    }
    return out;
  };
  const adjacent = mine.map((_, cell) => near(cell).filter((n) => mine[n]).length);
  const revealed = new Map();
  const flagged = new Set();
  const events = [];
  const t = [100, 200], x = [5, 6], y = [5, 6];
  let outcome = null;
  let firstReveal = true;
  const open = (cell) => {
    const stack = [cell];
    while (stack.length > 0) {
      const at = stack.pop();
      if (revealed.has(at) || flagged.has(at)) continue;
      revealed.set(at, adjacent[at]);
      if (adjacent[at] === 0) stack.push(...near(at));
    }
  };
  for (const step of steps) {
    const cell = step.cell;
    const target = { x: (cell % width) * CELL_PX + 10, y: Math.floor(cell / width) * CELL_PX + 10 };
    const arrive = START_T + step.atMs - (step.still ? 300 : 5);
    const from = { x: x[x.length - 1], y: y[y.length - 1] };
    for (let i = 1; i <= 10; i++) {
      const at = arrive - 100 + i * 10;
      if (at <= t[t.length - 1]) continue;
      t.push(at);
      x.push(from.x + (target.x - from.x) * i / 10);
      y.push(from.y + (target.y - from.y) * i / 10);
    }
    const position = { width, height, mines: mineCells.length,
      revealed: [...revealed].map(([c, a]) => [c, a]), flagged: [...flagged] };
    const view = { width, height, mines: mineCells.length,
      revealed: Array.from({ length: size }, (_, c) => revealed.has(c)),
      adjacent: Array.from({ length: size }, (_, c) => revealed.get(c) ?? 0) };
    const facts = Justice.proveFacts(view, Justice.rawClues(view));
    const safeAvailable = [...facts].some(([c, fact]) => fact === 2 && !flagged.has(c));
    const evaluation = { action: null, atMs: step.atMs, selected: [cell], result: 'continued', mistakes: [],
      evidence: {}, position };
    if (step.act === 'reveal') {
      evaluation.action = 'reveal';
      evaluation.evidence = { firstReveal, safeAvailable,
        knowledge: facts.get(cell) === 1 ? 'proven-mine' : facts.get(cell) === 2 ? 'proven-safe' : 'uncertain' };
      firstReveal = false;
      if (mine[cell]) { evaluation.result = 'death'; outcome = 'loss'; } else open(cell);
    } else if (step.act === 'flag') {
      evaluation.action = flagged.has(cell) ? 'flag-remove' : 'flag-place';
      if (flagged.has(cell)) flagged.delete(cell); else flagged.add(cell);
    } else if (step.act === 'no-op') {
      evaluation.action = 'no-op';
      evaluation.evidence = { reason: step.reason };
      evaluation.mistakes.push('no-op-click');
    } else throw new Error('unknown step ' + step.act);
    events.push({ t: START_T + step.atMs, kind: 'decision', x: target.x, y: target.y, evaluation });
    if (outcome === null && revealed.size === size - mineCells.length) outcome = 'win';
  }
  return { width, height, mines: mine, timeMs: steps[steps.length - 1].atMs, outcome,
    t, x, y, events, initialPageState: { visibilityState: 'visible', hasFocus: true } };
}

const cellAt = (width) => (col, row) => row * width + col;
const types = (model) => model.events.map((event) => event.type + '@' + event.atMs);

// Board A, 13 x 3, mine walls in columns 4 and 8: the first click opens
// columns 0-3, whose numbers prove column 4; a guess opens columns 9-12,
// whose numbers prove column 8, and the mine count then proves columns 5-7
// safe; a click in column 6 opens them and wins. That last click is three
// squares from everything the guess opened but beside the proven-safe
// column 7 near it: continuing work, not a move.
{
  const width = 13;
  const at = cellAt(width);
  const mines = [0, 1, 2].flatMap((row) => [at(4, row), at(8, row)]);
  const game = playGame(width, 3, mines, [
    { act: 'reveal', cell: at(0, 0), atMs: 0 },
    { act: 'reveal', cell: at(12, 0), atMs: 1500 },
    { act: 'reveal', cell: at(6, 1), atMs: 2200 },
  ]);
  assert.equal(game.outcome, 'win');
  const model = modelOf(game);
  assert.equal(model.recorded, true);
  assert.equal(model.timeMs, 2200);
  assert.deepEqual(model.bv3, { total: 3, atStart: 0 }, 'three zero regions and no isolated number');
  assert.deepEqual(model.progress.solved, [0, 1, 2, 3]);
  assert.deepEqual(model.progress.opened, [0, 12, 24, 33]);
  assert.deepEqual(model.known.all, [0, 0, 9], 'only the mine count proves the middle');
  assert.deepEqual(model.known.areas, [0, 0, 1]);
  assert.deepEqual(types(model), ['opening@0', 'long-gap@0', 'guess@1500', 'opening@1500', 'moved-on@1500', 'opening@2200']);
  const gap = model.events.find((event) => event.type === 'long-gap');
  assert.deepEqual([gap.endMs, gap.known, gap.countingKnown, gap.nearKnown, gap.endedBy, gap.guess, gap.windowLeft],
    [1500, 0, 0, 0, 'reveal', true, false]);
  const move = model.events.find((event) => event.type === 'moved-on');
  assert.deepEqual([move.squares, move.areas, move.guess, move.gapMs], [12, 0, true, 1500]);
  assert.deepEqual(structuredClone(DuringGame.moveHabits(model)), { movesRanOut: 1, movesLeftHardWork: 0, movesLeftEasyWork: 0,
    moveGapMedianMs: 1500, forkMoves: 0, forkMovesToNearestArea: 0 }, 'one move, after the local work ran out');

  const view = viewOf(game, ['bv3Solved', 'safeOpened', 'bvPerSecond', 'clickRate', 'actionGap', 'fastclickGap',
    'safeKnown', 'longGapEvents'], 'buckets-2');
  const row = (rowId) => view.rows.find((item) => item.id === rowId);
  assert.equal(row('bv3Solved').summary, 1);
  assert.equal(row('safeOpened').summary, 1);
  assert.equal(row('bvPerSecond').summary, 3 / 2.2, 'the whole game: 3 3BV over 2.2 s');
  assert.equal(row('clickRate').summary, 3 / 2.2);
  assert.equal(row('actionGap').summary, (1500 + 700) / 2, 'the median of two gaps');
  assert.equal(row('fastclickGap').summary, 700, 'the 1.5 s gap is too long for a fastclick');
  assert.equal(row('safeKnown').summary, 9 * 700 / 2200, 'nine known for the last 0.7 s');
  assert.equal(row('longGapEvents').summary, 1);
  assert.deepEqual(row('bvPerSecond').buckets.map((bucket) => bucket.value), [1, undefined],
    'two 2 s buckets: 3BV at 0 s and at 1.5 s in the first; the 0.2 s remainder is under a second of play');
  assert.equal(DuringGame.valueAt(row('bv3Solved'), 1600, 50), 2 / 3);
  assert.equal(DuringGame.valueAt(row('actionGap'), 1510, 50), 1500, 'the bucket holding the moment');
}

// Board B, 15 x 3, mines at (4,0) (4,2) (10,0) (10,2) (7,1). Opening the
// left (columns 0-3, numbers 1 2 1 in column 3) proves (4,1) safe between
// two mines; the right opening (columns 11-14) proves (10,1) the same way.
{
  const width = 15;
  const at = cellAt(width);
  const game = playGame(width, 3, [at(4, 0), at(4, 2), at(10, 0), at(10, 2), at(7, 1)], [
    { act: 'reveal', cell: at(0, 1), atMs: 0 },
    { act: 'flag', cell: at(4, 0), atMs: 400 },
    { act: 'flag', cell: at(4, 2), atMs: 700 },
    // A guess across the board, leaving (4,1) proven safe beside the flags.
    { act: 'reveal', cell: at(14, 1), atMs: 1000 },
    { act: 'flag', cell: at(10, 0), atMs: 1300 },
    // (10,1) shows 2 beside two proven mines, proving column 9 safe.
    { act: 'reveal', cell: at(10, 1), atMs: 1600 },
    // After a 1.1 s pause, back to (4,1): column 9 stays unopened while two
    // separate places hold proven-safe squares.
    { act: 'reveal', cell: at(4, 1), atMs: 2700 },
    { act: 'no-op', cell: at(4, 0), atMs: 2900, reason: 'left-clicked-flag' },
    // (4,1) shows 2, proving column 5 safe; flagging (5,1) is a misclick.
    { act: 'flag', cell: at(5, 1), atMs: 3100 },
    { act: 'flag', cell: at(5, 1), atMs: 3400 },
    { act: 'reveal', cell: at(7, 1), atMs: 3700 },
  ]);
  assert.equal(game.outcome, 'loss');
  const model = modelOf(game);
  // Leaving (4,1), which only two numbers together prove, is leaving hard
  // work; leaving column 9, which counting proves, is leaving easy work.
  assert.deepEqual(types(model), ['opening@0', 'guess@1000', 'opening@1000', 'left-hard-work@1000', 'long-gap@1600',
    'left-easy-work@2700', 'fork@2700', 'came-back@2700', 'no-op@2900', 'misclick@3100', 'wrong-flag@3100',
    'flag-removed@3400', 'guess@3700']);
  const event = (type, atMs) => model.events.find((item) => item.type === type && item.atMs === atMs);
  const hard = event('left-hard-work', 1000);
  assert.deepEqual([hard.safeCells, hard.leftSafe, hard.leftByCounting, hard.guess, hard.gapMs],
    [[at(4, 1)], 1, 0, true, 300]);
  const gap = event('long-gap', 1600);
  assert.deepEqual([gap.endMs, gap.known, gap.countingKnown, gap.nearKnown],
    [2700, 4, 3, 3], 'counting proves column 9 but not (4,1), which needs two numbers together');
  const easy = event('left-easy-work', 2700);
  assert.deepEqual([easy.safeCells, easy.leftSafe, easy.leftByCounting, easy.gapMs],
    [[at(9, 0), at(9, 1), at(9, 2)], 3, 3, 1100]);
  assert.equal(model.movesJudged, true);
  assert.deepEqual(structuredClone(DuringGame.moveHabits(model)), { movesRanOut: 0, movesLeftHardWork: 1, movesLeftEasyWork: 1,
    moveGapMedianMs: 700, forkMoves: 1, forkMovesToNearestArea: 0 }, 'two moves 0.3 s and 1.1 s after the click before; one fork, past the nearest area');
  const fork = event('fork', 2700);
  assert.deepEqual([fork.areas, fork.nearestSafeSquares, fork.toArea, fork.toNearestArea], [2, 1, true, false]);
  assert.equal(event('came-back', 2700).awayMs, 1700);
  assert.equal(event('no-op', 2900).reason, 'left-clicked-flag');
  assert.equal(event('misclick', 3100).mistake, 'flagged-proven-safe');
  assert.deepEqual([event('flag-removed', 3400).stoodMs, event('flag-removed', 3400).quickUndo], [300, true]);
  assert.deepEqual([event('guess', 3700).died, event('guess', 3700).safeAvailable], [true, true]);
  assert.deepEqual(model.progress.flaggedMines, [0, 0, 1, 2, 2, 3, 3, 3, 3, 3, 3, 3]);
  assert.deepEqual(model.known.areas.slice(4, 8), [2, 2, 2, 2]);

  // The worker holds the finished game by its endedAt and answers only for
  // it; its move habits go to the record with the finished game's
  // measurements.
  const gameId = 1760000000000;
  const finished = task('finished-game', { width, height: 3, mines: game.mines, drill: true, needCadence: false,
    needMoveHabits: true, gameId, timeMs: game.timeMs, outcome: game.outcome,
    trace: { t: game.t, x: game.x, y: game.y, events: game.events, wallMs: 4000,
      initialPageState: game.initialPageState } });
  assert.deepEqual(finished.measurements, structuredClone(DuringGame.moveHabits(model)));
  const rows = ['minesFlagged', 'misclickRate', 'fastclickGap', 'forkEvents', 'leftHardWorkEvents', 'leftEasyWorkEvents', 'mouseSpeed'];
  const view = task('during-game', { gameId, timeMs: game.timeMs, outcome: game.outcome, rows, average: 'rolling-2' });
  assert.deepEqual(view.rows.map((row) => row.id), rows);
  assert.equal(view.actions.length, 11);
  const row = (rowId) => view.rows.find((item) => item.id === rowId);
  assert.equal(row('minesFlagged').summary, 0.6);
  assert.equal(row('misclickRate').summary, 60000 / 3700);
  assert.equal(row('forkEvents').summary, 1);
  assert.equal(row('leftHardWorkEvents').summary, 1);
  assert.equal(row('leftEasyWorkEvents').summary, 1);
  assert.equal(row('fastclickGap').summary, 300, 'every gap but the 1.1 s pause is a moving fastclick; their median');
  assert.equal(row('mouseSpeed').line.length, 241);
  assert.throws(() => task('during-game', { gameId: gameId + 1, timeMs: 1, outcome: 'win', rows, average: 'raw' }),
    /is not the latest finished or restored game/);
  assert.throws(() => task('during-game', { gameId, timeMs: game.timeMs, outcome: game.outcome, rows: ['nope'], average: 'raw' }),
    /unknown row nope/);
}

// A trace without decision events (captured before actions were traced)
// has no rows to show and no move habits.
{
  const unrecorded = DuringGame.model({ width: 9, height: 9, mines: new Array(81).fill(false), timeMs: 1000, outcome: 'win',
    t: [], x: [], y: [], events: [], initialPageState: { visibilityState: 'visible', hasFocus: true } });
  assert.deepEqual(structuredClone(unrecorded), { recorded: false });
  assert.deepEqual(structuredClone(DuringGame.moveHabits(unrecorded)), {});
  // A proof stopped at its work limit at a move leaves that move unjudged,
  // so the game records no move habits rather than undercounting them.
  assert.deepEqual(structuredClone(DuringGame.moveHabits({ recorded: true, movesJudged: false, events: [] })), {});
}

// The window-left spans come from page-state events on the game clock.
{
  const width = 13;
  const at = cellAt(width);
  const mines = [0, 1, 2].flatMap((row) => [at(4, row), at(8, row)]);
  const game = playGame(width, 3, mines, [
    { act: 'reveal', cell: at(0, 0), atMs: 0 },
    { act: 'reveal', cell: at(12, 0), atMs: 5000 },
    { act: 'reveal', cell: at(6, 1), atMs: 5600 },
  ]);
  game.events.push({ t: START_T + 1000, kind: 'page-state', visibilityState: 'visible', hasFocus: false },
    { t: START_T + 3500, kind: 'page-state', visibilityState: 'visible', hasFocus: true });
  game.events.sort((a, b) => a.t - b.t);
  const model = modelOf(game);
  const left = model.events.find((item) => item.type === 'window-left');
  assert.deepEqual([left.atMs, left.endMs], [1000, 3500]);
  assert.equal(model.events.find((item) => item.type === 'long-gap').windowLeft, true);

  // A trace from before page states were recorded says nothing about them,
  // rather than showing a window that never left.
  const { initialPageState, ...unrecorded } = game;
  unrecorded.events = game.events.filter((item) => item.kind !== 'page-state');
  const old = modelOf(unrecorded);
  assert.equal(old.pageStateRecorded, false);
  assert.equal(old.events.some((item) => item.type === 'window-left'), false);
  assert.equal('windowLeft' in old.events.find((item) => item.type === 'long-gap'), false);
  const row = viewOf(unrecorded, ['windowLeftEvents', 'longGapEvents'], 'buckets-5').rows;
  assert.deepEqual(row[0], { id: 'windowLeftEvents', kind: 'unrecorded', summary: undefined });
  assert.equal(row[1].summary, 1);
}

// Legend clicks (creator 2026-10-21): with every row shown, a click shows
// that row alone; another adds its row; a second click on one removes it;
// removing the last picked row, or picking every row, shows them all.
{
  const ids = ['a', 'b', 'c'];
  let picked = new Set();
  const hidden = () => ids.filter((id) => DuringGame.legendHides(picked, id, ids));
  assert.deepEqual(hidden(), [], 'every row shown by default');
  picked = DuringGame.legendPick(picked, 'b', ids);
  assert.deepEqual(hidden(), ['a', 'c'], 'a click shows that row alone');
  picked = DuringGame.legendPick(picked, 'a', ids);
  assert.deepEqual(hidden(), ['c'], 'another adds its row');
  picked = DuringGame.legendPick(picked, 'a', ids);
  assert.deepEqual(hidden(), ['a', 'c'], 'a second click removes it');
  picked = DuringGame.legendPick(picked, 'b', ids);
  assert.deepEqual(hidden(), [], 'removing the last picked row shows them all');
  picked = ids.reduce((set, id) => DuringGame.legendPick(set, id, ids), new Set());
  assert.equal(picked.size, 0, 'picking every row is every row shown');
  assert.equal(DuringGame.legendPick(new Set(), 'a', ['a']).size, 0, 'a one-row legend always shows its row');
  // Configure can remove a picked row: its pick no longer hides anything,
  // and drops out at the next click.
  assert.deepEqual(ids.filter((id) => DuringGame.legendHides(new Set(['gone']), id, ids)), []);
  assert.deepEqual([...DuringGame.legendPick(new Set(['gone', 'a']), 'b', ids)], ['a', 'b']);
}
assert(DuringGame.RELATIVE_SCALES.some(([id]) => id === DuringGame.DEFAULT_RELATIVE_SCALE), 'the default scale is a choice');
assert.equal(DuringGame.DEFAULT_RELATIVE_SCALE, 'log', 'log by default');

console.log('during-game tests passed');

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
// The worker's timers run when the test drains them, between its messages.
const timers = [];
const runTimers = () => { while (timers.length > 0) timers.shift()(); };
const context = vm.createContext({ self: { postMessage: (value) => replies.push(structuredClone(value)) },
  setTimeout: (callback, delayMs, ...args) => timers.push(() => callback(...args)) });
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
const proved = (game) => DuringGame.model({ ...game, proofs: DuringGame.positionProofs() });
const modelOf = (game) => structuredClone(proved(game));
const viewOf = (game, rows, average) => structuredClone(DuringGame.view(proved(game), rows, average));
const Justice = vm.runInContext('Justice', context);
const { FASTCLICK_GAP_VERSION } = vm.runInContext('GameData', context);

const CELL_PX = 20;
const START_T = 500;
// How long the scripted left button stays down: a reveal or no-op click
// takes effect at its release, this long after its press.
const PRESS_MS = 60;

// Plays `steps` on a board as the game records them: one decision per
// action with the position before it, after its presses (a flag acts at its
// right press, a left click at its release), the cursor gliding to each
// target and arriving 5 ms before the click (or 300 ms before when `still`).
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
    const clickT = START_T + step.atMs;
    const input = { x: target.x, y: target.y, index: cell };
    if (step.act === 'flag') events.push({ t: clickT, kind: 'rdown', ...input });
    else events.push({ t: clickT - PRESS_MS, kind: 'ldown', ...input }, { t: clickT, kind: 'lup', ...input });
    events.push({ t: clickT, kind: 'decision', x: target.x, y: target.y, evaluation });
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
  assert.deepEqual(model.known.safe, [0, 0, 9], 'only the mine count proves the middle');
  assert.deepEqual(model.known.areas, [0, 0, 1]);
  // Counting proves each wall from the column of numbers beside it; with
  // both walls known, the mine total proves the 9 squares between them.
  const none = [0, 0, 0];
  assert.deepEqual(model.known.safeByLevel, { counting: none, overlap: none, allNumbers: none, mineTotal: [0, 0, 9] });
  assert.deepEqual(model.known.minesByLevel, { counting: [0, 3, 6], overlap: none, allNumbers: none, mineTotal: none });
  assert.deepEqual(model.known.mines, [0, 3, 6]);
  assert.deepEqual(model.known.minesByCountingNearLastMove, [null, 2, 2],
    'none before the first click; then the top two squares of the wall 4 columns from the click, 4 and 5 steps away, not the bottom one 6 away');
  assert.deepEqual(model.known.chordableNumbers, none, 'no flags, so no chord');
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
  assert.equal(row('fastclickGap').summary, undefined, 'no two clicks in a row touch: no planned pair');
  assert.deepEqual(structuredClone(DuringGame.fastclickGap(model)), { fastclickGapVersion: FASTCLICK_GAP_VERSION },
    'measured under the definition, with no value');
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
  // Before each of the 11 actions. Each 1 2 1 proves its middle safe and
  // its ends mines by overlap; flags take those mines off the counts. Once
  // (10,1) and then (4,1) open, each 1 beside a single covered square is
  // counting, and so are the squares a 2 between two known mines proves.
  // The flag on (5,1) hides one square counting proved safe.
  const zeros = new Array(11).fill(0);
  assert.deepEqual(model.known.safeByLevel, { counting: [0, 0, 0, 0, 0, 0, 3, 6, 6, 5, 6],
    overlap: [0, 1, 1, 1, 2, 2, 1, 0, 0, 0, 0], allNumbers: zeros, mineTotal: zeros });
  assert.deepEqual(model.known.minesByLevel, { counting: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1],
    overlap: [0, 2, 1, 0, 2, 1, 0, 0, 0, 0, 0], allNumbers: zeros, mineTotal: zeros });
  assert.deepEqual(model.known.safe, [0, 1, 1, 1, 2, 2, 4, 6, 6, 5, 6]);
  assert.deepEqual(model.known.mines, [0, 2, 1, 0, 2, 1, 1, 1, 1, 1, 1]);
  // The only mine counting proves and no flag covers is (10,2): 1 step from
  // (10,1), which the click before the long gap opened, and 6 or 7 steps
  // from every later click; flags count as moves, the no-op does not.
  assert.deepEqual(model.known.minesByCountingNearLastMove, [null, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0]);
  // Each flag beside the left 1 2 1 makes its numbers chordable while (4,1)
  // is covered; (11,0) with its flag joins until (10,1) opens. Then only the
  // 2 at (4,1) with both flags is, until the wrong flag on (5,1) makes it
  // three flags.
  assert.deepEqual(model.known.chordableNumbers, [0, 0, 1, 3, 3, 4, 3, 1, 1, 0, 1]);

  // One planned pair: the flag on (10,0) at 1.3 s, then (10,1) beside it,
  // pressed at 1.54 s, both proven by the 1 2 1 before the flag. Every
  // other pair of clicks in a row is too far apart, has the no-op between,
  // or holds the flag removal.
  assert.deepEqual(structuredClone(DuringGame.fastclickGap(model)),
    { fastclickGapVersion: FASTCLICK_GAP_VERSION, fastclickGapMs: 240 });

  // The worker holds the finished game by its endedAt and answers only for
  // it; its move habits and fastclick gap go to the record with the
  // finished game's measurements.
  const gameId = 1760000000000;
  const finished = task('finished-game', { width, height: 3, mines: game.mines, drill: true, needCadence: false,
    needMoveHabits: true, needFastclickGap: true, gameId, timeMs: game.timeMs, outcome: game.outcome, liveTraceId: 1,
    trace: { t: game.t, x: game.x, y: game.y, events: game.events, wallMs: 4000,
      initialPageState: game.initialPageState } });
  assert.deepEqual(finished.measurements, structuredClone({ ...DuringGame.moveHabits(model), ...DuringGame.fastclickGap(model) }));
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
  assert.equal(row('fastclickGap').summary, 240, 'the one planned pair, press to press');
  assert.equal(row('mouseSpeed').line.length, 241);
  assert.throws(() => task('during-game', { gameId: gameId + 1, timeMs: 1, outcome: 'win', rows, average: 'raw' }),
    /is not the latest finished or restored game/);
  assert.throws(() => task('during-game', { gameId, timeMs: game.timeMs, outcome: game.outcome, rows: ['nope'], average: 'raw' }),
    /unknown row nope/);
}

// A trace without decision events (captured before actions were traced)
// has no rows to show and no move habits.
{
  const unrecorded = proved({ width: 9, height: 9, mines: new Array(81).fill(false), timeMs: 1000, outcome: 'win',
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
assert.deepEqual([...DuringGame.RELATIVE_SCALES], ['log', 'linear'], 'two scales, one checkbox');
assert.equal(DuringGame.DEFAULT_RELATIVE_SCALE, 'log', 'log by default');

// The catalog: three charts, every row of the moves group on the moves
// chart, each line's color unique within its chart and each mark's shape
// within its track, and counts shown whole at a moment, to a tenth averaged.
{
  assert.deepEqual([...DuringGame.CHARTS.map((chart) => chart.id)], ['progress', 'moves', 'relative']);
  assert(DuringGame.ROWS.filter((row) => row.group === 'moves').every((row) => row.chart === 'moves'));
  for (const chart of DuringGame.CHARTS) {
    const colors = DuringGame.ROWS.filter((row) => row.chart === chart.id).map((row) => row.color);
    assert.equal(new Set(colors).size, colors.length, chart.id + ': one color per line');
  }
  for (const [track] of DuringGame.TRACKS) {
    const marks = DuringGame.ROWS.filter((row) => row.track === track).map((row) => row.mark);
    assert.equal(new Set(marks).size, marks.length, track + ': one shape per row');
  }
  assert.deepEqual([...DuringGame.ROWS.filter((row) => row.chart === 'moves' && row.default).map((row) => row.id)],
    ['safeKnown', 'minesByCounting', 'minesByCountingNearLastMove', 'chordableNumbers']);
  const chordable = DuringGame.rowById('chordableNumbers');
  assert.deepEqual([chordable.format(3), chordable.format(0), chordable.format(2.25)], ['3', '0', '2.3']);
}

// One catalog (docs/product/measurement-catalog.md): a row or motion stats
// display showing a game data measurement takes its id, name, definition,
// and format from GameData.metrics; every row's measurements are catalog
// ids, an event row's only those computed over its events; and no other
// row or display takes a catalog name.
{
  const catalog = new Map(vm.runInContext('GameData', context).metrics.map((metric) => [metric.id, metric]));
  const byName = new Map([...catalog.values()].map((metric) => [metric.name, metric]));
  for (const row of DuringGame.ROWS) {
    const measurements = row.measurements === undefined ? [] : row.measurements;
    for (const id of measurements) assert(catalog.has(id), row.id + ': unknown measurement ' + id);
    const metric = catalog.get(row.id);
    if (metric === undefined) {
      assert.equal(byName.has(row.name), false, row.id + ' takes the catalog name ' + row.name);
      continue;
    }
    assert.deepEqual([row.name, row.help, row.format, [...measurements]], [metric.name, metric.help, metric.format, [row.id]],
      row.id + ' reads the catalog');
  }
  assert.deepEqual(Object.fromEntries(DuringGame.ROWS.filter((row) => row.group === 'events' && row.measurements)
    .map((row) => [row.id, [...row.measurements]])), {
    noOpEvents: ['noopRate'], misclickEvents: ['misclickRate'], flagRemovedEvents: ['flagRemovalRate'],
    movedOnEvents: ['timeBeforeMove'], leftHardWorkEvents: ['timeBeforeMove'],
    leftEasyWorkEvents: ['timeBeforeMove', 'easyWorkLeftShare'], forkEvents: ['nearestAreaShare'],
    unusedFlagEvents: ['unusedFlagShare', 'unusedFlagRate'],
  });
  const displays = vm.runInContext('TRACE_METRIC_GROUPS', context).flatMap((group) => group.displays);
  const shared = displays.filter((display) => byName.has(display.label));
  assert.deepEqual([...shared.map((display) => display.label)], ['cadence spread']);
  for (const display of shared) {
    const metric = byName.get(display.label);
    assert.deepEqual([display.help, display.fmt], [metric.help, metric.format], display.label + ' reads the catalog');
  }
}

// A whole-game value is the record's measurement exactly: rates divide by
// the record's time even under a second, and every press counts toward
// cadence spread.
{
  const computeClickCadence = vm.runInContext('computeClickCadence', context);
  const width = 13;
  const at = cellAt(width);
  const mines = [0, 1, 2].flatMap((row) => [at(4, row), at(8, row)]);
  const game = playGame(width, 3, mines, [
    { act: 'reveal', cell: at(0, 0), atMs: 0 },
    { act: 'reveal', cell: at(12, 0), atMs: 420 },
    { act: 'reveal', cell: at(6, 1), atMs: 799.6 },
  ]);
  // The record's time is rounded to the ms; the last click came 0.4 ms
  // after it. One press came before the clock started.
  game.timeMs = 800;
  game.events.unshift({ t: START_T - 300, kind: 'ldown' });
  const view = viewOf(game, ['clickRate', 'bvPerSecond', 'mouseSpeed', 'cadenceSpread'], 'rolling-2');
  const row = (rowId) => view.rows.find((item) => item.id === rowId);
  assert.equal(row('clickRate').summary, 3 * 1000 / 800, 'three clicks over the record\u2019s 0.8 s');
  assert.equal(row('bvPerSecond').summary, 3 * 1000 / 800);
  assert(Number.isFinite(row('mouseSpeed').summary), 'a game under a second still has its mouse speed');
  assert.equal(row('cadenceSpread').summary, computeClickCadence(game.t, game.events).gapSpreadRatio,
    'the trace\u2019s cadence spread, the press before the clock included');
  // The record stores the cadence spread unrounded.
  const finished = task('finished-game', { width, height: 3, mines: game.mines, drill: true, needCadence: true,
    needMoveHabits: false, gameId: 1760000000001, timeMs: game.timeMs, outcome: game.outcome, liveTraceId: 2,
    trace: { t: game.t, x: game.x, y: game.y, events: game.events, wallMs: 1500, initialPageState: game.initialPageState } });
  assert.equal(finished.measurements.cadenceSpread, row('cadenceSpread').summary);
}

// The creator's corner (2026-10-26), 6 x 4, mines at (1,1) (3,0) (4,3)
// (0,3). The 1 in the corner and the 1 beside it against the wall share
// their one mine, (0,1) or (1,1), which leaves (2,0) and (2,1) safe before
// either is clicked: the fastclick gap's planned pair. Every later pair
// fails one rule.
{
  const width = 6;
  const at = cellAt(width);
  const game = playGame(width, 4, [at(1, 1), at(3, 0), at(4, 3), at(0, 3)], [
    { act: 'reveal', cell: at(0, 0), atMs: 0 },
    // A guess: the corner 1's mine is (1,0), (0,1), or (1,1).
    { act: 'reveal', cell: at(1, 0), atMs: 800 },
    { act: 'reveal', cell: at(2, 0), atMs: 1600 },
    { act: 'reveal', cell: at(2, 1), atMs: 1750 },
    // Only the 2 that (2,1) shows proves (2,2) safe: sequential work.
    { act: 'reveal', cell: at(2, 2), atMs: 1900 },
    // Proven before (2,2) opened, but the hand rested between.
    { act: 'reveal', cell: at(3, 2), atMs: 2400, still: true },
    // Proven before, but two squares from (3,2).
    { act: 'reveal', cell: at(1, 3), atMs: 2550 },
    // (1,2) beside it was proven too, but a click on the open 1 came between.
    { act: 'no-op', cell: at(1, 3), atMs: 2650, reason: 'chord-short-of-flags' },
    { act: 'reveal', cell: at(1, 2), atMs: 2750 },
    // Beside it and in one motion, but a guess: (0,2) or (0,3) holds a mine.
    { act: 'reveal', cell: at(0, 3), atMs: 2900 },
  ]);
  assert.equal(game.outcome, 'loss');
  const model = modelOf(game);
  assert.deepEqual(model.plannedPairs, [{ atMs: 1750, gapMs: 150 }], 'from the press on (2,0) to the press on (2,1)');
  assert.deepEqual(structuredClone(DuringGame.fastclickGap(model)),
    { fastclickGapVersion: FASTCLICK_GAP_VERSION, fastclickGapMs: 150 });
  const view = viewOf(game, ['fastclickGap'], 'rolling-2');
  assert.equal(view.rows[0].summary, 150, 'the live line\u2019s whole-game value is the record\u2019s');
}

// The planned pairs' rules on single pairs of clicks, 5 squares wide: the
// presses that time them, the hold after a flag, a press between, flag
// removals, and a proof stopped at its work limit.
{
  const pathDecisionEvents = vm.runInContext('pathDecisionEvents', context);
  const facts = (entries, complete = true) => Object.assign(new Map(entries), { complete });
  const decision = (t, action, selected, extra = {}) => ({ t, kind: 'decision',
    evaluation: { action, atMs: t - START_T, selected, position: {}, ...extra } });
  // A cursor sample every 20 ms from `from` to `to`.
  const moving = (from, to) => Array.from({ length: (to - from) / 20 + 1 }, (_, i) => from + i * 20);
  const pairs = (events, factsBefore, sampleT) => {
    const decisions = pathDecisionEvents(events);
    return structuredClone(DuringGame.plannedPairsOf(events, decisions, decisions.map(() => factsBefore), sampleT, 5));
  };

  // A flag, then, the right button still held, a chord on the number beside
  // it (the 1.5 click): from the right press to the left press, though the
  // cursor stood still on the flag.
  assert.deepEqual(pairs([
    { t: 1000, kind: 'rdown', index: 6 }, decision(1000, 'flag-place', [6]),
    { t: 1080, kind: 'ldown', index: 7 }, { t: 1150, kind: 'lup', index: 7 },
    decision(1150, 'chord', [3, 8], { triggerCell: 7 }),
  ], facts([[6, 1], [3, 2], [8, 2]]), [900, 950, 990]), [{ atMs: 650, gapMs: 80 }]);

  // After a click that opened squares, a rest before the next press breaks
  // the motion.
  const revealThenFlag = (sampleT) => pairs([
    { t: 2000, kind: 'ldown', index: 0 }, { t: 2060, kind: 'lup', index: 0 }, decision(2060, 'reveal', [0]),
    { t: 2200, kind: 'rdown', index: 6 }, decision(2200, 'flag-place', [6]),
  ], facts([[0, 2], [6, 1]]), sampleT);
  assert.deepEqual(revealThenFlag(moving(2000, 2200)), [{ atMs: 1700, gapMs: 200 }]);
  assert.deepEqual(revealThenFlag([...moving(2000, 2060), ...moving(2180, 2200)]), [], 'still from 2.06 s to 2.18 s');

  // A two-button chord is pressed when its first button goes down.
  assert.deepEqual(pairs([
    { t: 3000, kind: 'ldown', index: 0 }, { t: 3060, kind: 'lup', index: 0 }, decision(3060, 'reveal', [0]),
    { t: 3100, kind: 'rdown', index: 1, chordGesture: true }, { t: 3110, kind: 'ldown', index: 1, chordGesture: true },
    { t: 3170, kind: 'lup', index: 1, chordGesture: true }, decision(3170, 'chord', [2], { triggerCell: 1 }),
  ], facts([[0, 2], [2, 2]]), moving(3000, 3200)), [{ atMs: 2670, gapMs: 100 }]);

  // Another press between the two, here one released off the board.
  assert.deepEqual(pairs([
    { t: 4000, kind: 'ldown', index: 0 }, { t: 4060, kind: 'lup', index: 0 }, decision(4060, 'reveal', [0]),
    { t: 4100, kind: 'ldown', index: 1 }, { t: 4120, kind: 'lup', index: null },
    { t: 4150, kind: 'ldown', index: 1 }, { t: 4210, kind: 'lup', index: 1 }, decision(4210, 'reveal', [1]),
  ], facts([[0, 2], [1, 2]]), moving(4000, 4260)), []);

  // A flag removal is a correction, neither click of a pair.
  assert.deepEqual(pairs([
    { t: 5000, kind: 'rdown', index: 6 }, decision(5000, 'flag-remove', [6]),
    { t: 5050, kind: 'ldown', index: 7 }, { t: 5110, kind: 'lup', index: 7 }, decision(5110, 'reveal', [7]),
    { t: 5150, kind: 'rdown', index: 12 }, decision(5150, 'flag-remove', [12]),
  ], facts([[6, 1], [7, 2], [12, 1]]), moving(5000, 5200)), []);

  // A square left unproven by a proof stopped at its work limit leaves the
  // pair, and so the game, unjudged; a complete proof that did not prove it,
  // or any proof proving it otherwise, rules the pair out.
  const twoReveals = (factsBefore) => pairs([
    { t: 6000, kind: 'ldown', index: 0 }, { t: 6060, kind: 'lup', index: 0 }, decision(6060, 'reveal', [0]),
    { t: 6100, kind: 'ldown', index: 5 }, { t: 6160, kind: 'lup', index: 5 }, decision(6160, 'reveal', [5]),
  ], factsBefore, moving(6000, 6200));
  assert.deepEqual(twoReveals(facts([[0, 2], [5, 2]], false)), [{ atMs: 5660, gapMs: 100 }], 'both proven: judged');
  assert.equal(twoReveals(facts([[0, 2]], false)), null);
  assert.deepEqual(twoReveals(facts([[0, 2]])), []);
  assert.deepEqual(twoReveals(facts([[0, 2], [5, 1]], false)), []);
  assert.deepEqual(structuredClone(DuringGame.fastclickGap({ recorded: true, plannedPairs: null })),
    { fastclickGapVersion: FASTCLICK_GAP_VERSION }, 'an unjudged game is measured with no value');
}

// The move hierarchy's proven moves (docs/product/design-axis.md, "Move
// hierarchy"): the most 3BV per click and the steps to the nearest
// proven-safe square. Board E, 4 x 3, mines at (0,0) (3,1) (3,2):
//   * 1 1 1    row 0 covered until the end
//   1 1 2 *
//   0 0 2 *
// Opening the 0 at (1,2) shows the numbers below row 0. Counting proves
// everything: the 2 at (2,2) has only (3,1) and (3,2) covered, both mines;
// the 2 at (2,1) then has its two mines, so the 1s of row 0 are safe; the
// 1 at (1,1) then has only (0,0) left, a mine. Row 0's 1s touch no zero, so
// each is 1 3BV. The game flags the three mines, then opens row 0.
{
  const width = 4;
  const at = cellAt(width);
  const game = playGame(width, 3, [at(0, 0), at(3, 1), at(3, 2)], [
    { act: 'reveal', cell: at(1, 2), atMs: 0 },
    { act: 'flag', cell: at(3, 1), atMs: 300 },
    { act: 'flag', cell: at(3, 2), atMs: 600 },
    { act: 'flag', cell: at(0, 0), atMs: 900 },
    { act: 'reveal', cell: at(1, 0), atMs: 1200 },
    { act: 'reveal', cell: at(2, 0), atMs: 1400 },
    { act: 'reveal', cell: at(3, 0), atMs: 1600 },
  ]);
  assert.equal(game.outcome, 'win');
  const model = modelOf(game);
  // Nothing is proven before the first click. Then opening a 1 of row 0
  // solves 1 3BV in 1 click, and chording the 2 at (2,1) solves all three
  // in 3 clicks, its two flags and the chord; in 2 once (3,1) is flagged,
  // in 1 once (3,2) is. Each 1 opened leaves that chord one 3BV fewer.
  const most = ['none', 1, 1.5, 3, 3, 2, 1];
  const none = new Array(7).fill('none');
  assert.deepEqual(model.known.mostBvPerClick, most);
  assert.deepEqual(model.known.mostBvPerClickByLevel, { counting: most, overlap: none, allNumbers: none, mineTotal: none });
  // From the last click to the nearest 1 of row 0 still covered.
  const steps = ['none', 2, 1, 2, 1, 1, 1];
  assert.deepEqual(model.known.stepsToSafe, steps);
  assert.deepEqual(model.known.stepsToSafeByLevel, { counting: steps, overlap: none, allNumbers: none, mineTotal: none });
  const view = viewOf(game, ['mostBvPerClick', 'stepsToSafe', 'mostBvPerClickByOverlap'], 'rolling-2');
  const row = (rowId) => view.rows.find((item) => item.id === rowId);
  assert.equal(row('mostBvPerClick').summary, (1 * 300 + 1.5 * 300 + 3 * 600 + 2 * 200 + 1 * 200) / 1600);
  assert.equal(row('stepsToSafe').summary, (2 * 300 + 1 * 300 + 2 * 300 + 1 * 300 + 1 * 400) / 1600);
  assert.deepEqual(row('mostBvPerClick').steps[0], { atMs: 0, value: null, none: true });
  assert.equal(DuringGame.valueAt(row('mostBvPerClick'), 700, 0), 3);
  assert.equal(row('mostBvPerClick').noMoves, undefined);
  assert.deepEqual([row('mostBvPerClickByOverlap').summary, row('mostBvPerClickByOverlap').noMoves], [undefined, true],
    'no such move all game: the legend says none');
  assert.equal(DuringGame.rowById('mostBvPerClick').format(1.5), '1.50');
}

// What a guess chose among. Board F, 6 x 2, one mine at (2,0): opening the
// zeros at the left shows two 1s seeing (2,0) and (2,1) and nothing else,
// so the mine total proves the right side safe; opening it shows two more
// 1s seeing the same two squares. Nothing could ever settle that 50/50: it
// was one from the first click, and before it the whole board was one
// sealed sea. Perfect play wins one of its two layouts.
{
  const width = 6;
  const at = cellAt(width);
  const play = (guessCell) => {
    const game = playGame(width, 2, [at(2, 0)], [
      { act: 'reveal', cell: at(0, 0), atMs: 0 },
      { act: 'reveal', cell: at(5, 0), atMs: 400 },
      { act: 'reveal', cell: guessCell, atMs: 1000 },
    ]);
    game.justiceEnabled = false;
    game.events.filter((event) => event.kind === 'decision')[2].evaluation.evidence.oddsMeasured = true;
    return game;
  };
  const won = play(at(2, 1));
  assert.equal(won.outcome, 'win');
  assert.deepEqual(modelOf(won).events.find((event) => event.type === 'guess'), { type: 'guess', atMs: 1000, action: 2,
    cell: at(2, 1), safeAvailable: false, died: false, connected: true, safestConnectedRisk: 0.5, minesFixed: true,
    winMeasured: true, winChance: 0.5, bestWinChance: 0.5, unavoidable: true, waitedMs: 1000 });
  const lost = modelOf(play(at(2, 0))).events.find((event) => event.type === 'guess');
  assert.deepEqual([lost.died, lost.minesFixed, lost.unavoidable, lost.waitedMs], [true, true, true, 1000]);
  // A just universe can move mines: the risks stay, the win chance goes.
  const just = play(at(2, 1));
  just.justiceEnabled = true;
  const justGuess = modelOf(just).events.find((event) => event.type === 'guess');
  assert.deepEqual([justGuess.safestConnectedRisk, justGuess.minesFixed, justGuess.winMeasured], [0.5, undefined, undefined]);
  // Where the guess ledger did not measure the guess (Angelic play, whose
  // mines move), only what the visible board shows.
  const unmeasured = play(at(2, 1));
  delete unmeasured.events.filter((event) => event.kind === 'decision')[2].evaluation.evidence.oddsMeasured;
  const unmeasuredGuess = modelOf(unmeasured).events.find((event) => event.type === 'guess');
  assert.deepEqual([unmeasuredGuess.connected, unmeasuredGuess.safestConnectedRisk, unmeasuredGuess.winMeasured,
    unmeasuredGuess.unavoidable, unmeasuredGuess.waitedMs], [true, undefined, undefined, true, 1000]);
}

// Proofs made during play: the reports worker proves each position the live
// feed sends, one per task, and the finished game's model reads them back.
// Board E again, its last decision missing from the feed as the game's end
// cuts off the feed's last batch. Its positions hold 0, 6, 7, and 8 open
// squares; the game's end proves only the 8 the feed never sent, and every
// result equals proving all four after the game.
{
  const width = 4;
  const at = cellAt(width);
  const game = playGame(width, 3, [at(0, 0), at(3, 1), at(3, 2)], [
    { act: 'reveal', cell: at(1, 2), atMs: 0 },
    { act: 'flag', cell: at(3, 1), atMs: 300 },
    { act: 'flag', cell: at(3, 2), atMs: 600 },
    { act: 'flag', cell: at(0, 0), atMs: 900 },
    { act: 'reveal', cell: at(1, 0), atMs: 1200 },
    { act: 'reveal', cell: at(2, 0), atMs: 1400 },
    { act: 'reveal', cell: at(3, 0), atMs: 1600 },
  ]);
  const lastDecision = game.events.filter((event) => event.kind === 'decision').at(-1);
  task('live-trace', { traceId: 3, wallMs: 1500, t: [], x: [], y: [],
    events: game.events.slice(0, game.events.indexOf(lastDecision)) });
  runTimers();
  const rows = DuringGame.ROWS.map((row) => row.id);
  const proveLevels = Justice.proveLevels;
  let proofs = 0;
  Justice.proveLevels = (...args) => { proofs++; return proveLevels(...args); };
  const finish = (gameId, liveTraceId) => {
    const before = proofs;
    const finished = task('finished-game', { width, height: 3, mines: game.mines, drill: true, needCadence: false,
      needMoveHabits: true, needFastclickGap: true, gameId, timeMs: game.timeMs, outcome: game.outcome, liveTraceId,
      trace: { t: game.t, x: game.x, y: game.y, events: game.events, wallMs: 2000,
        initialPageState: game.initialPageState } });
    const view = task('during-game', { gameId, timeMs: game.timeMs, outcome: game.outcome, rows, average: 'rolling-2' });
    return { measurements: finished.measurements, view, proofs: proofs - before };
  };
  const live = finish(1760000000002, 3);
  const after = finish(1760000000003, 4);
  Justice.proveLevels = proveLevels;
  assert.equal(live.proofs, 1, 'the game\u2019s end proves only the position the feed never sent');
  assert.equal(after.proofs, 4, 'one proof per count of open squares');
  assert.deepEqual(live.measurements, after.measurements);
  assert.deepEqual(live.view, after.view);
}

console.log('during-game tests passed');

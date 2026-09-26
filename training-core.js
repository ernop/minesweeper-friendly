'use strict';

// Training toward a first Expert win under 60 seconds (user request
// 2026-09-26; plan, targets, and rationale in docs/product/training.md).
// Pure measurements over saved Expert records and their input traces. The
// training page runs them in training-worker.js and tests load them in
// Node. The solver placement, seeded random stream, and fatal-status
// classifier are passed in, so every result depends only on its arguments.

const TRAINING_KEY = '30x16/99@standard';
const TRAINING_BOARD = { width: 30, height: 16, mines: 99 };
const TRAINING_GOAL_MS = 60000;
// Pace and economy are read from the latest wins; run conversion from the
// latest games that lasted long enough to be past the opening.
const TRAINING_RECENT_WINS = 20;
const TRAINING_RUN_MIN_MS = 20000;
const TRAINING_RECENT_RUNS = 60;
const TRAINING_PAUSE_MS = 1000;
const TRAINING_UNIFORM_BOARD_VERSION = 'uniform-first-safe-fisher-yates-v1';
// Fatal statuses (game/evaluation.js) in which a proven-safe move existed.
const TRAINING_AVOIDABLE_FATAL_KINDS = new Set(['mine-safe', 'guess-safe']);

// Every recorded input kind, in the order the time-budget table lists them.
const TRAINING_INPUT_KINDS = [
  'reveal', 'chord-multi', 'chord-single', 'flag', 'unflag',
  'noop-missing-flag', 'noop-extra-flag', 'noop-finished', 'noop-blank',
  'noop-on-flag', 'noop-right-on-open',
];
const TRAINING_NOOP_KINDS = new Set(TRAINING_INPUT_KINDS.filter((kind) => kind.startsWith('noop-')));

function trainingNeighborLists(width, height) {
  const lists = [];
  for (let index = 0; index < width * height; index++) {
    const x = index % width;
    const y = Math.floor(index / width);
    const around = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if ((dx !== 0 || dy !== 0) && nx >= 0 && nx < width && ny >= 0 && ny < height) {
          around.push(ny * width + nx);
        }
      }
    }
    lists.push(around);
  }
  return lists;
}

// The mines the game's clicks met. A saved final board is the layout after
// any Justice redraw; redraws only rearrange covered sealed pockets without
// changing a revealed number, so every recorded input replays identically on
// it. Older traces without a final board are rebuilt from the seed and the
// first reveal, which is exact unless a redraw happened; replay then detects
// the divergence instead of reporting a false game.
function trainingMineLayout(trace, board, firstRevealIndex, deps) {
  if (trace.finalBoard !== undefined) return trace.finalBoard.cells.map((cell) => cell.mine === true);
  if (trace.boardVersion !== TRAINING_UNIFORM_BOARD_VERSION || trace.rngVersion !== deps.rngVersion) return null;
  return deps.randomPlacement(board.width, board.height, board.mines, firstRevealIndex, deps.fromSeed(trace.seed));
}

// Replays one game's recorded board inputs with the game's own semantics
// (game/controls.js and game/play.js): a left release on a covered cell
// reveals and floods zeros, one on a number chords when its flags match and
// covered neighbors remain, and a flag action toggles a covered cell. Each
// input carries the gap since the previous input; the game-starting reveal
// has none because the timer starts there.
function trainingFirstRevealIndex(inputs) {
  const flaggedBeforeStart = new Set();
  for (const event of inputs) {
    if (event.kind === 'rdown') {
      if (flaggedBeforeStart.has(event.index)) flaggedBeforeStart.delete(event.index);
      else flaggedBeforeStart.add(event.index);
    } else if (!flaggedBeforeStart.has(event.index)) {
      return event.index;
    }
  }
  return null;
}

function trainingReplay(trace, outcome, board, deps) {
  const inputs = trace.events.filter((event) => (event.kind === 'lup' || event.kind === 'rdown')
    && Number.isInteger(event.index));
  const firstRevealIndex = trainingFirstRevealIndex(inputs);
  if (firstRevealIndex === null) return { status: 'no-reveal' };
  const mine = trainingMineLayout(trace, board, firstRevealIndex, deps);
  if (mine === null) return { status: 'no-layout' };
  const cellCount = board.width * board.height;
  const around = trainingNeighborLists(board.width, board.height);
  const adjacent = new Array(cellCount).fill(0);
  for (let index = 0; index < cellCount; index++) {
    if (mine[index]) for (const neighbor of around[index]) adjacent[neighbor]++;
  }
  const revealed = new Uint8Array(cellCount);
  const flagged = new Uint8Array(cellCount);
  const standingFlag = new Array(cellCount).fill(null);
  const flagEpisodes = [];
  const steps = [];
  let revealedCount = 0;
  let exploded = false;
  let startedAtT = null;
  let previousT = null;

  function open(start) {
    const stack = [start];
    while (stack.length > 0) {
      const index = stack.pop();
      if (revealed[index] || flagged[index]) continue;
      revealed[index] = 1;
      revealedCount++;
      if (mine[index]) {
        exploded = true;
        continue;
      }
      if (adjacent[index] === 0) {
        for (const neighbor of around[index]) if (!revealed[neighbor]) stack.push(neighbor);
      }
    }
  }

  for (const event of inputs) {
    if (exploded) return { status: 'diverged' };
    const index = event.index;
    const gapMs = startedAtT === null ? null : event.t - previousT;
    let kind;
    let episode = null;
    if (event.kind === 'lup') {
      if (!revealed[index] && !flagged[index]) {
        kind = startedAtT === null ? 'first-reveal' : 'reveal';
        open(index);
        if (startedAtT === null) startedAtT = event.t;
      } else if (flagged[index]) {
        kind = 'noop-on-flag';
      } else if (adjacent[index] === 0) {
        kind = 'noop-blank';
      } else {
        let flags = 0;
        const targets = [];
        for (const neighbor of around[index]) {
          if (flagged[neighbor]) flags++;
          else if (!revealed[neighbor]) targets.push(neighbor);
        }
        if (targets.length === 0) kind = 'noop-finished';
        else if (flags < adjacent[index]) kind = 'noop-missing-flag';
        else if (flags > adjacent[index]) kind = 'noop-extra-flag';
        else {
          kind = targets.length === 1 ? 'chord-single' : 'chord-multi';
          for (const neighbor of around[index]) {
            if (!flagged[neighbor]) continue;
            if (kind === 'chord-single') standingFlag[neighbor].singleChordUses++;
            else standingFlag[neighbor].multiChordUses++;
          }
          for (const target of targets) open(target);
        }
      }
    } else if (revealed[index]) {
      kind = 'noop-right-on-open';
    } else if (flagged[index]) {
      kind = 'unflag';
      flagged[index] = 0;
      standingFlag[index].removed = true;
      standingFlag[index] = null;
    } else {
      kind = 'flag';
      flagged[index] = 1;
      episode = { onMine: mine[index], placementGapMs: gapMs, singleChordUses: 0, multiChordUses: 0, removed: false };
      standingFlag[index] = episode;
      flagEpisodes.push(episode);
    }
    steps.push({ kind, gapMs, t: event.t, index });
    if (startedAtT !== null) previousT = event.t;
  }
  const won = !exploded && revealedCount === cellCount - board.mines;
  if (outcome === 'win' ? !won : !exploded) return { status: 'diverged' };
  return { status: 'replayed', outcome, steps, flagEpisodes, playedMs: previousT - startedAtT };
}

// A won game's inputs split by what they did, the time before each, and the
// inputs a cheaper sequence of the same moves would not need: every no-op,
// every flag that was removed again (with its removal), every standing flag
// no chord used, and every standing flag used only by chords that opened a
// single cell (clicking that cell directly costs the same one input).
function trainingWinBreakdown(replay) {
  const byKind = Object.fromEntries(TRAINING_INPUT_KINDS.map((kind) => [kind, { count: 0, ms: 0 }]));
  let pauseCount = 0;
  let pauseMs = 0;
  let inputCount = 0;
  let removableCount = 0;
  let removableMs = 0;
  for (const step of replay.steps) {
    if (step.kind === 'first-reveal' || step.gapMs === null) continue;
    inputCount++;
    byKind[step.kind].count++;
    byKind[step.kind].ms += step.gapMs;
    if (step.gapMs > TRAINING_PAUSE_MS) {
      pauseCount++;
      pauseMs += step.gapMs;
    }
    if (TRAINING_NOOP_KINDS.has(step.kind) || step.kind === 'unflag') {
      removableCount++;
      removableMs += step.gapMs;
    }
  }
  const flags = { usedByMultiChord: 0, usedOnlyBySingleChord: 0, neverUsed: 0, removed: 0, onSafeCell: 0 };
  for (const episode of replay.flagEpisodes) {
    if (!episode.onMine) flags.onSafeCell++;
    let removable = true;
    if (episode.removed) flags.removed++;
    else if (episode.multiChordUses > 0) {
      flags.usedByMultiChord++;
      removable = false;
    } else if (episode.singleChordUses > 0) flags.usedOnlyBySingleChord++;
    else flags.neverUsed++;
    if (removable && episode.placementGapMs !== null) {
      removableCount++;
      removableMs += episode.placementGapMs;
    }
  }
  const noopCount = [...TRAINING_NOOP_KINDS].reduce((sum, kind) => sum + byKind[kind].count, 0);
  return { byKind, inputCount, noopCount, pauseCount, pauseMs, flags, removableCount, removableMs,
    playedMs: replay.playedMs };
}

function trainingMedian(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function trainingMean(values) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

// Means over wins so the time parts add up to the whole; medians for the
// per-win counts the stage targets use.
function trainingTimeBudget(winBreakdowns, records) {
  const n = winBreakdowns.length;
  if (n === 0) return null;
  const kinds = TRAINING_INPUT_KINDS.map((kind) => ({
    kind,
    countPerWin: trainingMean(winBreakdowns.map((b) => b.byKind[kind].count)),
    secondsPerWin: trainingMean(winBreakdowns.map((b) => b.byKind[kind].ms / 1000)),
  }));
  const withoutRemovableS = winBreakdowns.map((b, i) => (records[i].timeMs - b.removableMs) / 1000);
  return {
    wins: n,
    kinds,
    secondsPerWin: trainingMean(winBreakdowns.map((b) => b.playedMs / 1000)),
    inputsPerWin: trainingMean(winBreakdowns.map((b) => b.inputCount)),
    pausesPerWin: trainingMean(winBreakdowns.map((b) => b.pauseCount)),
    pauseSecondsPerWin: trainingMean(winBreakdowns.map((b) => b.pauseMs / 1000)),
    removableInputsPerWin: trainingMean(winBreakdowns.map((b) => b.removableCount)),
    removableSecondsPerWin: trainingMean(winBreakdowns.map((b) => b.removableMs / 1000)),
    flagsPerWin: Object.fromEntries(Object.keys(winBreakdowns[0].flags)
      .map((key) => [key, trainingMean(winBreakdowns.map((b) => b.flags[key]))])),
    medianNoopsPerWin: trainingMedian(winBreakdowns.map((b) => b.noopCount)),
    medianRemovableFlagsPerWin: trainingMedian(winBreakdowns.map((b) => b.flags.neverUsed + b.flags.usedOnlyBySingleChord)),
    meanWrongFlagsPerWin: trainingMean(winBreakdowns.map((b) => b.flags.onSafeCell)),
    medianPausesPerWin: trainingMedian(winBreakdowns.map((b) => b.pauseCount)),
    medianWithoutRemovableS: trainingMedian(withoutRemovableS),
    withoutRemovableUnderGoal: withoutRemovableS.filter((s) => s * 1000 < TRAINING_GOAL_MS).length,
  };
}

function trainingInputs(record) {
  return record.clicks + record.wastedClicks;
}

// Pace and economy over a list of wins. Inputs are board-changing clicks
// plus no-op clicks, so IOE here is the game data column's IOE (3BV per
// input) and 3BV/s = IOE / seconds per input. Records from before no-op
// clicks were measured are left out of the input-based medians rather than
// counted as zero.
function trainingWinPace(wins) {
  const measured = wins.filter((r) => typeof r.wastedClicks === 'number');
  return {
    wins: wins.length,
    medianWinS: trainingMedian(wins.map((r) => r.timeMs / 1000)),
    median3bvPerS: trainingMedian(wins.map((r) => r.bv3 / (r.timeMs / 1000))),
    inputMeasuredWins: measured.length,
    medianIoe: trainingMedian(measured.map((r) => r.bv3 / trainingInputs(r))),
    medianSecondsPerInput: trainingMedian(measured.map((r) => r.timeMs / 1000 / trainingInputs(r))),
    medianNoopsPerWin: trainingMedian(measured.map((r) => r.wastedClicks)),
  };
}

// Games that lasted at least TRAINING_RUN_MIN_MS got past the opening. How
// many of them end in a win, and how many of their losses came while a
// proven-safe move existed, per the game's own fatal-status classifier.
function trainingRuns(runs, fatalKindOf) {
  let won = 0;
  let avoidable = 0;
  let classified = 0;
  for (const record of runs) {
    if (record.outcome === 'win') {
      won++;
      continue;
    }
    const kind = fatalKindOf(record);
    if (kind === undefined) continue;
    classified++;
    if (TRAINING_AVOIDABLE_FATAL_KINDS.has(kind)) avoidable++;
  }
  const losses = runs.length - won;
  return {
    runs: runs.length,
    won,
    conversion: runs.length === 0 ? null : won / runs.length,
    losses,
    classifiedLosses: classified,
    avoidableLosses: avoidable,
    avoidableShare: classified === 0 ? null : avoidable / classified,
  };
}

// Monday-based local calendar weeks, newest first.
function trainingWeekStart(ms) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date.getTime();
}

function trainingWeeks(records, fatalKindOf) {
  const groups = new Map();
  for (const record of records) {
    const start = trainingWeekStart(record.endedAt);
    if (!groups.has(start)) groups.set(start, []);
    groups.get(start).push(record);
  }
  return [...groups.entries()].sort((a, b) => b[0] - a[0]).map(([weekStartMs, group]) => {
    const wins = group.filter((r) => r.outcome === 'win');
    const runs = trainingRuns(group.filter((r) => r.timeMs >= TRAINING_RUN_MIN_MS), fatalKindOf);
    return {
      weekStartMs,
      games: group.length,
      bestMs: wins.length === 0 ? null : Math.min(...wins.map((r) => r.timeMs)),
      ...trainingWinPace(wins),
      runs: runs.runs,
      conversion: runs.conversion,
    };
  });
}

// Stage targets are the plan's decisions (docs/product/training.md), not
// measurements. A stage is complete when every criterion is met; the
// current stage is the first incomplete one. Rules of earlier stages stay
// in force, so a later stage never replaces an earlier one's criteria.
const TRAINING_STAGES = [
  { id: 'economy', title: 'Stop wasting inputs', criteria: [
    { id: 'ioe', label: 'IOE (3BV per input, no-ops included)', target: 0.91, better: 'higher', digits: 2 },
    { id: 'noopsPerWin', label: 'no-op clicks per win', target: 5, better: 'lower', digits: 0 },
    { id: 'removableFlagsPerWin', label: 'flags no multi-cell chord used, per win', target: 10, better: 'lower', digits: 0 },
  ] },
  { id: 'runs', title: 'Finish the runs you start', criteria: [
    { id: 'runConversion', label: 'games reaching 20 s that are won', target: 0.45, better: 'higher', percent: true },
    { id: 'avoidableShare', label: 'losses after 20 s with a safe move available', target: 0.35, better: 'lower', percent: true },
    { id: 'wrongFlagsPerWin', label: 'wrong flags per win', target: 0.5, better: 'lower', digits: 1 },
  ] },
  { id: 'speed', title: 'Read and move faster', criteria: [
    { id: 'pausesPerWin', label: 'pauses over 1 s per win', target: 4, better: 'lower', digits: 0 },
    { id: 'bvPerS', label: 'median 3BV/s', target: 2.8, better: 'higher', digits: 2 },
  ] },
  { id: 'goal', title: 'Win under 60 seconds', criteria: [
    { id: 'goalWins', label: 'wins under 60 s', target: 1, better: 'higher', digits: 0 },
  ] },
];

function trainingStageStatus(values, sampleSizes) {
  const stages = TRAINING_STAGES.map((stage) => {
    const criteria = stage.criteria.map((criterion) => {
      const value = values[criterion.id];
      const met = value === null ? false
        : criterion.better === 'lower' ? value <= criterion.target : value >= criterion.target;
      return { ...criterion, value, met, sampleSize: sampleSizes[criterion.id] };
    });
    return { id: stage.id, title: stage.title, criteria, complete: criteria.every((c) => c.met) };
  });
  const current = stages.find((stage) => !stage.complete);
  return { stages, currentStageId: current === undefined ? null : current.id };
}

// The whole training summary. `winTraces` holds, for each of the latest
// wins (oldest first), its saved trace or undefined when none was saved.
function trainingSummary(records, winTraces, deps) {
  const sorted = [...records].sort((a, b) => a.endedAt - b.endedAt);
  const wins = sorted.filter((r) => r.outcome === 'win');
  const recentWins = wins.slice(-TRAINING_RECENT_WINS);
  if (winTraces.length !== recentWins.length) throw new Error('training: one trace slot is required per recent win');
  const replayStatus = { replayed: 0, 'no-trace': 0, 'no-reveal': 0, 'no-layout': 0, diverged: 0 };
  const breakdowns = [];
  const breakdownRecords = [];
  recentWins.forEach((record, i) => {
    const trace = winTraces[i];
    if (trace === undefined) {
      replayStatus['no-trace']++;
      return;
    }
    const replay = trainingReplay(trace, 'win', TRAINING_BOARD, deps);
    replayStatus[replay.status]++;
    if (replay.status !== 'replayed') return;
    breakdowns.push(trainingWinBreakdown(replay));
    breakdownRecords.push(record);
  });
  const budget = trainingTimeBudget(breakdowns, breakdownRecords);
  const pace = trainingWinPace(recentWins);
  const runs = trainingRuns(sorted.filter((r) => r.timeMs >= TRAINING_RUN_MIN_MS).slice(-TRAINING_RECENT_RUNS),
    deps.fatalKindOf);
  const goalWins = wins.filter((r) => r.timeMs < TRAINING_GOAL_MS).length;
  const best = wins.length === 0 ? null : wins.reduce((a, b) => (b.timeMs < a.timeMs ? b : a));
  const values = {
    ioe: pace.medianIoe,
    noopsPerWin: pace.medianNoopsPerWin,
    removableFlagsPerWin: budget === null ? null : budget.medianRemovableFlagsPerWin,
    runConversion: runs.conversion,
    avoidableShare: runs.avoidableShare,
    wrongFlagsPerWin: budget === null ? null : budget.meanWrongFlagsPerWin,
    pausesPerWin: budget === null ? null : budget.medianPausesPerWin,
    bvPerS: pace.median3bvPerS,
    goalWins,
  };
  const sampleSizes = {
    ioe: `${pace.inputMeasuredWins} latest wins`,
    noopsPerWin: `${pace.inputMeasuredWins} latest wins`,
    removableFlagsPerWin: `${breakdowns.length} replayed wins`,
    runConversion: `${runs.runs} latest games reaching 20 s`,
    avoidableShare: `${runs.classifiedLosses} classified losses of those`,
    wrongFlagsPerWin: `${breakdowns.length} replayed wins`,
    pausesPerWin: `${breakdowns.length} replayed wins`,
    bvPerS: `${pace.wins} latest wins`,
    goalWins: `${wins.length} wins`,
  };
  return {
    key: TRAINING_KEY,
    games: sorted.length,
    wins: wins.length,
    best: best === null ? null : { timeMs: best.timeMs, bv3: best.bv3, endedAt: best.endedAt },
    goalWins,
    pace,
    runs,
    budget,
    replayStatus,
    ...trainingStageStatus(values, sampleSizes),
    weeks: trainingWeeks(sorted, deps.fatalKindOf),
  };
}

const TrainingCore = {
  KEY: TRAINING_KEY,
  BOARD: TRAINING_BOARD,
  GOAL_MS: TRAINING_GOAL_MS,
  RECENT_WINS: TRAINING_RECENT_WINS,
  RUN_MIN_MS: TRAINING_RUN_MIN_MS,
  RECENT_RUNS: TRAINING_RECENT_RUNS,
  PAUSE_MS: TRAINING_PAUSE_MS,
  INPUT_KINDS: TRAINING_INPUT_KINDS,
  STAGES: TRAINING_STAGES,
  AVOIDABLE_FATAL_KINDS: TRAINING_AVOIDABLE_FATAL_KINDS,
  replay: trainingReplay,
  winBreakdown: trainingWinBreakdown,
  timeBudget: trainingTimeBudget,
  winPace: trainingWinPace,
  runs: trainingRuns,
  weeks: trainingWeeks,
  stageStatus: trainingStageStatus,
  summary: trainingSummary,
  median: trainingMedian,
};

if (typeof module !== 'undefined' && module.exports) module.exports = TrainingCore;

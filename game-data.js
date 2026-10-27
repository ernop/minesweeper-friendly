'use strict';

// Shared completed-game measurements: one formula per measurement for every
// page and worker that shows it. Saved history is the only source of
// observations.
function secondsOf(record) {
  return record.timeMs / 1000;
}

function bvPerSecond(record) {
  return record.bv3 / secondsOf(record);
}

// Efficiency: 3BV / board-changing clicks (the clone name "throughput" is
// the same quantity). Wins only: a lost board was never finished, so the 3BV
// numerator is the whole board and the ratio would flatter a short loss.
function efficiencyOf(record) {
  if (record.outcome !== 'win' || record.clicks === 0) return undefined;
  return record.bv3 / record.clicks;
}

// log(3BV) / log(time in seconds). MSO blanks t≤1; we do the same.
// Wins only, same unfinished-board honesty as efficiency.
function iosOf(record) {
  if (record.outcome !== 'win') return undefined;
  const t = secondsOf(record);
  if (!(t > 1) || !(record.bv3 > 0)) return undefined;
  return Math.log(record.bv3) / Math.log(t);
}

// IOE (index of efficiency): 3BV / all clicks, no-op clicks included — the
// all-click cousin of efficiency. Wins only for the same
// unfinished-board reason; undefined where the no-op count (wastedClicks)
// was never measured (a missing denominator part, not zero).
function ioeOf(record) {
  if (record.outcome !== 'win' || !('wastedClicks' in record)) return undefined;
  const total = record.clicks + record.wastedClicks;
  if (total === 0) return undefined;
  return record.bv3 / total;
}

// Chord share: accepted chords over board-changing clicks. Defined for
// wins and losses (both had a real click mix); absent where chordClicks
// was never measured.
function chordShareOf(record) {
  if (record.chordClicks === undefined || record.clicks === 0) return undefined;
  return record.chordClicks / record.clicks;
}

// STNB, the difficulty-normalized speed score used on saolei.wang:
// constant / QG with QG = time^1.7 / 3BV, where the constant makes equal
// skill score alike across the three standard boards (the current
// site constants; Minesweeper Arbiter's older polynomial constants were
// 47.299/153.73/435.001). Only the three standard boards have constants,
// so STNB is undefined elsewhere; wins only (completion = 1).
const STNB_CONSTANTS = [
  { width: 9, height: 9, mines: 10, constant: 36 },
  { width: 16, height: 16, mines: 40, constant: 162 },
  { width: 30, height: 16, mines: 99, constant: 435 },
];

function stnbConstantOf(params) {
  const spec = STNB_CONSTANTS.find((s) => s.width === params.width
    && s.height === params.height && s.mines === params.mines);
  return spec === undefined ? undefined : spec.constant;
}

function stnbOf(record, params) {
  if (record.outcome !== 'win' || !(record.bv3 > 0)) return undefined;
  // A drill's bv3 is the remnant's remaining 3BV, not a full solve of the
  // standard board; STNB's difficulty constants would flatter it wildly.
  if (record.playMode === 'endgame-drill') return undefined;
  const constant = stnbConstantOf(params);
  const t = secondsOf(record);
  if (constant === undefined || !(t > 0)) return undefined;
  return constant / (Math.pow(t, 1.7) / record.bv3);
}

// ZiNi efficiency: the flagger analog of efficiency (ZNE on the stats
// sites) — greedy ZiNi over effective clicks. Wins only, and only on
// games whose records carry the stored zini.
function ziniEfficiencyOf(record) {
  if (record.outcome !== 'win' || record.zini === undefined
      || record.clicks === 0) return undefined;
  return record.zini / record.clicks;
}

// HZiNi efficiency describes the completed play; hzini itself describes the board.
function hziniEfficiencyOf(record) {
  if (record.outcome !== 'win' || !Number.isSafeInteger(record.hzini)
      || !(record.clicks > 0)) return undefined;
  return record.hzini / record.clicks;
}

// The share of the board's mines with no flag when the game was won: the
// mine counter at the win over the mine count. A flagged cell cannot be
// opened, so at a win every standing flag sits on a mine, and
// flagsPlaced - flagsRemoved flags stand. Wins only; unmeasured where the
// counters predate their fields, and on Endgame drills, whose mines outside
// the remnant were never in play.
function unflaggedMineShareOf(record, mines) {
  if (record.outcome !== 'win' || record.playMode === 'endgame-drill'
      || typeof record.flagsPlaced !== 'number') return undefined;
  if (record.flagsPlaced === 0) return 1;
  if (typeof record.flagsRemoved !== 'number') return undefined;
  return (mines - record.flagsPlaced + record.flagsRemoved) / mines;
}


// One page-wide definition, shared by live stats, ranks won, and game data.
// "today" starts at local midnight; it is not the trailing 24 hours.
const SessionScope = (() => {
  const dayStart = (now, days = 0, hour = 0) => {
    const d = new Date(now); d.setDate(d.getDate() - days); d.setHours(hour, 0, 0, 0); return d.getTime();
  };
  const choices = [
    { id: 'past10min', label: 'last 10 minutes', start: (now) => now - 600000 },
    { id: 'past30min', label: 'last 30 minutes', start: (now) => now - 1800000 },
    { id: 'pastHour', label: 'last hour', start: (now) => now - 3600000 },
    { id: 'past2h', label: 'last 2 hours', start: (now) => now - 7200000 },
    { id: 'past4h', label: 'last 4 hours', start: (now) => now - 14400000 },
    { id: 'past24h', label: 'last 24 hours', start: (now) => now - 86400000 },
    { id: 'today', label: 'today', start: (now) => dayStart(now) },
    { id: 'today6am', label: 'today since 6am', start: (now) => now >= dayStart(now, 0, 6) ? dayStart(now, 0, 6) : dayStart(now, 1, 6) },
    { id: 'pastWeek', label: 'last 7 calendar days', start: (now) => dayStart(now, 6) },
  ];
  function bounds(id, referenceMs) {
    return { from: choices.find((c) => c.id === id).start(referenceMs), to: referenceMs };
  }
  function records(items, id, referenceMs) {
    const { from, to } = bounds(id, referenceMs);
    return items.filter((r) => r.endedAt >= from && r.endedAt <= to);
  }
  const earliest = (now) => Math.min(...choices.map((c) => c.start(now)));
  return { choices, defaultId: 'today', bounds, records, earliest };
})();

const GameData = (() => {
  const percent = (v) => Number((v * 100).toFixed(2)) + '%';
  const decimal = (v) => Number(v.toFixed(2)).toString();
  const perSecond = (field) => (r) => r.timeMs > 0 ? r[field] * 1000 / r.timeMs : undefined;
  const perMinute = (field) => (r) => r.timeMs > 0 ? r[field] * 60000 / r.timeMs : undefined;
  // The report-category measurements read `actionSummary`, the game's action
  // summary (game/evaluation.js, actionCategorySummary), which the game page
  // adds to the records it sends only while one of them is asked for; a game
  // whose evidence predates the categories has none.
  const actionRate = (read) => (r) => r.actionSummary && r.timeMs > 0 ? read(r.actionSummary) * 60000 / r.timeMs : undefined;
  const count = (n) => n.toLocaleString('en-US');
  // A game's moves (during-game.js, moveHabits): absent on games recorded
  // before move habits were.
  const movesOf = (r) => r.movesRanOut + r.movesLeftHardWork + r.movesLeftEasyWork;
  // The fastclick gap's definition, which a record measured under it names
  // (`fastclickGapVersion`): planned pairs since 2026-10-26. A record's
  // fastclickGapMs without it follows the definition before (gaps of at
  // most 1 s ending on the move), a different measurement.
  const FASTCLICK_GAP_VERSION = 'planned-pairs-v1';
  // The one catalog of performance measurements
  // (docs/product/measurement-catalog.md): each measurement's id, name,
  // definition (`help`), format, and better direction, which every surface
  // showing it reads: game summary perf, its line in the live perf charts
  // (during-game.js), the loss's this-game table, the your-perf property
  // charts, and motion stats. A surface never renames or redefines one.
  // `help` says only what a measurement's name and unit leave open, worded
  // so it holds for the whole game and for any stretch of it. A measurement
  // whose name and unit already say what it is has none (creator
  // 2026-10-08, of the time card's definition: it "just state[s] what the
  // user already knows").
  const metrics = [
    { id: 'time', name: 'time', higher: false, default: true,
      value: (r) => r.timeMs, format: (v) => (v / 1000).toFixed(3) + 's' },
    { id: 'misclickRate', allOutcomes: true, name: 'misclick rate', higher: false, default: true,
      value: (r) => r.timeMs > 0 ? r.misclicks * 60000 / r.timeMs : undefined,
      format: (v) => decimal(v) + '/min',
      help: 'A misclick is an action the visible board had already proved wrong: opening a proven mine, flagging a proven-safe square, removing a proven mine\u2019s flag, or chording against the visible proof.' },
    { id: 'fastclickGap', allOutcomes: true, name: 'fastclick gap', higher: false, default: true,
      value: (r) => (r.fastclickGapVersion === FASTCLICK_GAP_VERSION ? r.fastclickGapMs : undefined),
      format: (v) => Math.round(v) + 'ms',
      help: 'Median press-to-press time of two clicks on touching squares in one motion (no other press, no 100 ms stop after a reveal or chord), all they open proved safe and all they flag mines before the first. Flag removals excluded.' },
    { id: 'bvPerSecond', name: '3BV/s', higher: true, default: true,
      value: (r) => r.timeMs > 0 ? bvPerSecond(r) : undefined,
      format: (v) => v.toFixed(3) },
    { id: 'clickRate', allOutcomes: true, name: 'click rate', higher: true, default: true,
      value: perSecond('clicks'), format: (v) => v.toFixed(2) + '/s',
      help: 'Counts board-changing clicks only: reveals, flags, flag removals, and chords.' },
    { id: 'efficiency', name: 'efficiency', higher: true, default: false,
      value: efficiencyOf, format: percent,
      help: '3BV solved divided by board-changing clicks.' },
    { id: 'noopRate', allOutcomes: true, name: 'no-op rate', higher: false, default: true,
      value: perSecond('wastedClicks'), format: (v) => v.toFixed(2) + '/s',
      help: 'Clicks that changed nothing, such as chording a number whose mines are not all flagged, or clicking a flag.' },
    { id: 'pathPer3bv', name: 'path / 3BV', higher: false, default: false,
      value: (r) => r.bv3 > 0 ? r.mousePathPx / r.bv3 : undefined,
      format: (v) => Number(v.toFixed(1)) + 'px' },
    { id: 'boardChangingClickShare', allOutcomes: true, name: 'board-changing click share', higher: true, default: true,
      value: (r) => r.clicks + r.wastedClicks > 0 ? r.clicks / (r.clicks + r.wastedClicks) : undefined,
      format: percent, help: 'Board-changing clicks divided by all clicks; a wrong flag still counts as a change.' },
    { id: 'ioe', name: 'IOE', higher: true, default: false,
      value: ioeOf, format: (v) => v.toFixed(3),
      help: '3BV solved divided by all clicks, including those that changed nothing.' },
    { id: 'ziniEfficiency', name: 'ZiNi efficiency', higher: true, default: false,
      value: ziniEfficiencyOf, format: percent, help: 'ZiNi divided by board-changing clicks. ZiNi is the click count of a standard greedy flag-and-chord solve of this board.' },
    { id: 'hziniEfficiency', name: 'HZiNi efficiency', higher: true, default: false,
      value: hziniEfficiencyOf, format: percent, help: 'HZiNi divided by board-changing clicks. HZiNi is the action count of a fixed human-style flag-and-chord solve of this board.' },
    { id: 'ios', name: 'IOS', higher: true, default: false,
      value: iosOf, format: (v) => v.toFixed(3), help: 'log(3BV) divided by log(seconds).' },
    { id: 'stnb', name: 'STNB', higher: true, default: false,
      value: stnbOf, format: (v) => v.toFixed(1),
      help: '3BV times the level’s constant (beginner 36, intermediate 162, expert 435), divided by seconds^1.7.' },
    { id: 'mouseSpeed', allOutcomes: true, name: 'mouse speed', higher: true, default: true,
      value: perSecond('mousePathPx'), format: (v) => Math.round(v) + 'px/s',
      help: 'All cursor travel divided by all of the time, pauses included.' },
    { id: 'pathPerClick', allOutcomes: true, name: 'path / click', higher: false, default: false,
      value: (r) => r.clicks > 0 ? r.mousePathPx / r.clicks : undefined,
      format: (v) => Number(v.toFixed(1)) + 'px' },
    { id: 'cadenceSpread', allOutcomes: true, name: 'cadence spread', higher: false, default: false,
      value: (r) => r.cadenceSpread, format: (v) => v.toFixed(2) + '×',
      help: 'How uneven the timing of all your presses on the board is, no-op clicks included: the width of the middle half of the gaps between consecutive presses (the interquartile range) divided by their median. 0 is perfectly even.' },
    { id: 'timeBeforeMove', allOutcomes: true, name: 'time before a move', higher: false, default: true,
      value: (r) => r.moveGapMedianMs, format: (v) => Math.round(v) + 'ms',
      help: 'The median time from a board-changing click to a move: a click 3 or more squares from everything the click before it opened or marked and from the proven-safe squares within 2 squares of those.' },
    { id: 'easyWorkLeftShare', allOutcomes: true, name: 'moves leaving easy work', higher: false, default: true,
      value: (r) => (r.movesRanOut !== undefined && movesOf(r) > 0 ? r.movesLeftEasyWork / movesOf(r) : undefined),
      format: percent,
      help: 'Moves made while counting a single number had proved a square within 2 squares of the click before safe, as a share of all moves: jumps of 3 or more squares from the work the click before touched.' },
    { id: 'nearestAreaShare', allOutcomes: true, name: 'forks to the nearest area', higher: true, default: false,
      value: (r) => (r.forkMoves > 0 ? r.forkMovesToNearestArea / r.forkMoves : undefined), format: percent,
      help: 'Of the moves made while proven-safe squares lay in 2 or more separate areas (squares at most 2 apart are one area), the share that went to the area nearest the click before.' },
    { id: 'unusedFlagShare', name: 'unused flag share', higher: false, default: true,
      value: (r) => r.flagsPlaced > 0 ? r.unusedCorrectFlags / r.flagsPlaced : undefined,
      format: percent, help: 'Correct flags that no chord ever used, as a share of all flags placed.' },
    { id: 'unflaggedMineShare', name: 'unflagged mine share', higher: true, default: true,
      value: (r, params) => unflaggedMineShareOf(r, params.mines), step: (params) => 1 / params.mines,
      format: percent, help: 'Mines without a flag when you won, as a share of all the board’s mines.' },
    { id: 'flagRate', allOutcomes: true, name: 'flag rate', higher: false, default: false,
      value: perSecond('flagsPlaced'), format: (v) => v.toFixed(2) + '/s',
      help: 'Flags placed per second. Removals do not subtract, and the automatic flags at a win do not count.' },
    { id: 'flagRemovalRate', allOutcomes: true, name: 'flag-removal rate', higher: false, default: false,
      value: perMinute('flagsRemoved'), format: (v) => decimal(v) + '/min', help: 'Flags you took back.' },
    { id: 'unusedFlagRate', name: 'unused flag rate', higher: false, default: false,
      value: perMinute('unusedCorrectFlags'), format: (v) => decimal(v) + '/min',
      help: 'Correct flags that no chord ever used.' },
    { id: 'gameRiskRate', allOutcomes: true, name: 'game risk rate', higher: false, default: false, actionSummary: true,
      value: actionRate((s) => s.counts.gameRisk), format: (v) => decimal(v) + '/min',
      help: 'Survived actions riskier than the safest available move, once a tenth of the safe squares were open: a guess while a safe move was available, or a riskier guess than necessary.' },
    { id: 'earlyGuessRate', allOutcomes: true, name: 'early guess rate', higher: false, default: false, actionSummary: true,
      value: actionRate((s) => s.counts.earlyGuess), format: (v) => decimal(v) + '/min',
      help: 'Survived guesses that were not the safest choice, made before a tenth of the safe squares were open. They are kept out of game risk.' },
    { id: 'timeLossRate', allOutcomes: true, name: 'time loss rate', higher: false, default: false, actionSummary: true,
      value: actionRate((s) => s.counts.timeLoss), format: (v) => decimal(v) + '/min',
      help: 'Clicks that made no progress or undid visible progress, plus correct flags in wins that no chord used.' },
    { id: 'lifeMaximizationRate', allOutcomes: true, name: 'life maximization rate', higher: false, default: false, actionSummary: true,
      value: actionRate((s) => s.counts.lifeMaximization), format: (v) => decimal(v) + '/min',
      help: 'Moves where a one-move survival model saw a safer choice.' },
    { id: 'excessGameRiskRate', allOutcomes: true, name: 'excess game risk rate', higher: false, default: false, actionSummary: true,
      value: actionRate((s) => 100 * s.excessRisk), format: (v) => decimal(v) + 'pp/min',
      help: 'How much riskier the game risk actions were than the safest available move, summed, in percentage points of the chance of losing.' },
    { id: 'modeledLifeGapRate', allOutcomes: true, name: 'modeled life gap rate', higher: false, default: false, actionSummary: true,
      value: actionRate((s) => s.modeledLifeGap), format: (v) => v.toFixed(3) + '/min',
      help: 'How much expected remaining life the one-move survival model saw given up in the life maximization moves, summed.' },
  ];
  // The creator's own selection (2026-09-23), compared since 2026-10-07 with
  // both lifetime and the session.
  const defaults = Object.fromEntries(metrics.map((m) => [m.id, m.default]));
  const defaultsForView = { gameDataMetrics: defaults, sessionDefinition: SessionScope.defaultId };
  const chronological = (records) => records.slice().sort((a, b) => a.endedAt - b.endedAt);
  const poolValues = (pool, spec, params) => pool.filter((r) => spec.allOutcomes || r.outcome === 'win')
    .map((r) => spec.value(r, params)).filter(Number.isFinite);
  // `counted` names the population (wins, games, boards). `standingText` is
  // the rank alone, "19th of 1,201 wins": the card's label names the pool,
  // the row shows the percentage, and every pool has this game's board
  // settings (creator 2026-10-08: no "with these board settings", no
  // "pointless actual division equation").
  function rankedRow(record, pool, spec, scope, params, counted) {
    const value = spec.value(record, params);
    if (!Number.isFinite(value)) return null;
    const measured = pool.filter((r) => spec.allOutcomes || r.outcome === 'win').map((r) => ({ record: r, value: spec.value(r, params) }))
      .filter((r) => Number.isFinite(r.value));
    const total = measured.length;
    if (total < 2) return null;
    const strictlyBetter = measured.filter((r) => spec.higher ? r.value > value : r.value < value).length;
    const equal = measured.filter((r) => r.value === value).length;
    const time = spec.id === 'time';
    const earlierEqual = time ? measured.filter((r) => r.value === value && r.record.endedAt < record.endedAt).length : 0;
    const better = strictlyBetter + earlierEqual;
    const tiedOthers = time ? 0 : equal - 1;
    const rank = better + tiedOthers / 2 + 1;
    const allEqual = !time && equal === total;
    // Share of the other measured games that beat this one: the best is 0%, the worst 100%.
    const percentile = allEqual ? 50 : 100 * (rank - 1) / (total - 1);
    const place = tiedOthers > 0 ? 'tied ' + ordinalOf(better + 1) + '–' + ordinalOf(better + equal) : ordinalOf(rank);
    const standingText = allEqual
      ? (total === 2 ? 'both ' + counted : 'all ' + count(total) + ' ' + counted) + ' have this value'
      : place + ' of ' + count(total) + ' ' + counted;
    return { id: spec.id + '.' + scope, metricId: spec.id, scope, name: spec.name,
      value, valueText: spec.format(value), higher: spec.higher, side: 'performance',
      rank, firstRank: better + 1, lastRank: better + 1 + tiedOthers, better, tiedOthers,
      total, allEqual, percentile, definition: spec.help, standingText,
    };
  }
  function ordinalOf(n) {
    const rem100 = n % 100, rem10 = n % 10;
    return count(n) + (rem100 >= 11 && rem100 <= 13 ? 'th' : rem10 === 1 ? 'st' : rem10 === 2 ? 'nd' : rem10 === 3 ? 'rd' : 'th');
  }
  // The drawn axis of one measurement, shared by all its pools. A discrete
  // measurement takes only multiples of `step`: whole counts (step 1, found
  // from the values) or a share of a fixed cell count (step 1 ÷ that count,
  // declared by the measurement). Its bins are whole groups of possible
  // values, one value per bin while at most 60 values are drawn, otherwise
  // equally many values per bin for about 36 bins. Equal-width bins that
  // ignored the values' spacing held 1 or 2 possible values alternately and
  // drew a comb that was not in the data. Continuous measurements get 36
  // bins. The range is the box-plot whisker of the lifetime values (below);
  // this game and the session do not stretch it.
  const VALUE_BINS = 60, GROUPED_BINS = 36;
  // Q1 − 1.5·IQR through Q3 + 1.5·IQR, the fence path colors and the scatter
  // y-axes already use. A per-minute rate's far tail is a short game (one
  // misclick in a few seconds), and trimming only the outer 1% still left
  // that tail as the end of the axis, so the games that differ sat in a
  // sliver. The ends are the most extreme values inside the fence, not the
  // fence itself, so it is not padded with empty bins. Fewer than 8 values
  // leave the fence unstable, as path colors do, and the whole range is
  // drawn. A zero interquartile range has no whisker — at least half the
  // values are one number — and the narrowest window that still holds 90%
  // of them keeps the tail beside that mass.
  function drawnRange(sorted) {
    const n = sorted.length;
    if (n < 8) return [sorted[0], sorted[n - 1]];
    const q1 = quantile(sorted, 0.25), q3 = quantile(sorted, 0.75), iqr = q3 - q1;
    if (iqr === 0) {
      const span = Math.round(0.9 * (n - 1));
      let best = Infinity, start = 0;
      for (let i = 0; i + span < n; i++) {
        const width = sorted[i + span] - sorted[i];
        if (width < best) { best = width; start = i; }
      }
      return [sorted[start], sorted[start + span]];
    }
    const low = q1 - 1.5 * iqr, high = q3 + 1.5 * iqr;
    let first = 0, last = n - 1;
    while (sorted[first] < low) first++;
    while (sorted[last] > high) last--;
    return [sorted[first], sorted[last]];
  }
  function axisOf(values, declaredStep) {
    const sorted = values.slice().sort((a, b) => a - b);
    const [least, most] = drawnRange(sorted);
    const step = declaredStep ?? (sorted.every(Number.isInteger) ? 1 : undefined);
    if (step === undefined) {
      return least === most ? { lo: least - 0.5, hi: most + 0.5, bins: 1, step: null, perBin: null }
        : { lo: least, hi: most, bins: GROUPED_BINS, step: null, perBin: null };
    }
    const index = (v) => Math.round(v / step);
    const first = index(least), last = index(most);
    const valueCount = last - first + 1;
    const perBin = valueCount <= VALUE_BINS ? 1 : Math.ceil(valueCount / GROUPED_BINS);
    const bins = Math.ceil(valueCount / perBin);
    const start = first - Math.floor((bins * perBin - valueCount) / 2);
    return { lo: (start - 0.5) * step, hi: (start + bins * perBin - 0.5) * step, bins, step, perBin };
  }
  // At most six labels at round values: the finest multiple of 1, 2, 2.5, or
  // 5 times a power of ten that fits, whole values on a whole-count axis.
  // Trailing zeros after a decimal point are dropped, so 2.000 reads 2.
  function axisLabels(axis, format) {
    const power = 10 ** Math.floor(Math.log10((axis.hi - axis.lo) / 4));
    const multiples = (labelStep) => {
      const ks = [];
      for (let k = Math.ceil(axis.lo / labelStep - 1e-9); k * labelStep <= axis.hi + 1e-9; k++) ks.push(k);
      return ks;
    };
    const labelStep = [1, 2, 2.5, 5, 10].map((m) => m * power)
      .filter((s) => axis.step !== 1 || Number.isInteger(s)).find((s) => multiples(s).length <= 6);
    return multiples(labelStep).map((k) => {
      const value = Number((k * labelStep).toPrecision(12));
      return { value, text: tidyNumber(format(value)) };
    });
  }
  function tidyNumber(text) {
    return text.replace(/(\.\d*?)0+(?=\D*$)/, '$1').replace(/\.(?=\D*$)/, '');
  }
  // Counts per bin, and each bin's standing: the mean percentile of its games
  // (0 best; equal values share their mean rank, so a bin of ties stands
  // where each of them does), null for a bin without games. Values beyond
  // the axis are never drawn into an edge bin, and still rank.
  function distribution(values, higher, axis) {
    const width = (axis.hi - axis.lo) / axis.bins;
    const counts = new Array(axis.bins).fill(0);
    let below = 0, above = 0;
    for (const v of values) {
      if (v < axis.lo) below++;
      else if (v > axis.hi) above++;
      else counts[Math.min(axis.bins - 1, Math.floor((v - axis.lo) / width))]++;
    }
    const standing = new Array(axis.bins).fill(null);
    let better = higher ? above : below;
    for (let step = 0; step < axis.bins; step++) {
      const i = higher ? axis.bins - 1 - step : step;
      if (counts[i] > 0) standing[i] = 100 * (better + (counts[i] - 1) / 2) / (values.length - 1);
      better += counts[i];
    }
    return { ...axis, counts, standing };
  }
  // Each pool's histogram uses the lifetime axis, so one measurement's strips
  // share bins. A pool of at most DOT_POOL games also carries its values, so
  // its strip draws each game as its own dot. `step` is a declared spacing of
  // possible values.
  const DOT_POOL = 30;
  function addDistributions(poolRows, poolValuesByScope, format, step) {
    const axis = axisOf(poolValuesByScope.lifetime, step);
    const labels = axisLabels(axis, format);
    return poolRows.map((row) => {
      const values = poolValuesByScope[row.scope];
      return { ...row,
        distribution: { ...distribution(values, row.higher, axis), labels,
          ...(values.length <= DOT_POOL ? { values: values.slice().sort((a, b) => a - b) } : {}) } };
    });
  }
  function rows(record, records, preferences = defaultsForView, params) {
    if (record.outcome !== 'win' || !records.includes(record)) return [];
    const past = records.filter((r) => r.endedAt <= record.endedAt);
    const session = SessionScope.records(past, preferences.sessionDefinition, record.endedAt);
    const result = [];
    for (const spec of metrics) {
      if (!preferences.gameDataMetrics[spec.id]) continue;
      const counted = spec.allOutcomes ? 'games' : 'wins';
      const pools = [['lifetime', past], ['session', session]];
      // The session pool is a subset of lifetime, so any row implies a lifetime row.
      const poolRows = pools.map(([scope, pool]) => rankedRow(record, pool, spec, scope, params, counted))
        .filter((row) => row !== null);
      if (poolRows.length === 0) continue;
      const valuesByScope = Object.fromEntries(pools.map(([scope, pool]) => [scope, poolValues(pool, spec, params)]));
      result.push(...addDistributions(poolRows, valuesByScope, spec.format, spec.step?.(params)));
    }
    return result;
  }
  function quantile(sorted, p) {
    const at = (sorted.length - 1) * p, low = Math.floor(at);
    return sorted[low] + (sorted[Math.ceil(at)] - sorted[low]) * (at - low);
  }
  function summary(records, metricId, params) {
    const spec = metrics.find((m) => m.id === metricId);
    const wins = records.filter((r) => r.outcome === 'win');
    const values = records.filter((r) => spec.allOutcomes || r.outcome === 'win').map((r) => spec.value(r, params)).filter(Number.isFinite).sort((a, b) => a - b);
    return { games: records.length, wins: wins.length, measured: values.length,
      median: values.length ? quantile(values, .5) : null,
      lower: values.length ? quantile(values, .25) : null,
      upper: values.length ? quantile(values, .75) : null };
  }
  function history(records, referenceMs, choiceId, page = 0, size = 20) {
    // Read only the requested page: materializing every overlapping history
    // window would duplicate quadratic amounts of the same primary records.
    const past = chronological(records.filter((r) => r.endedAt <= referenceMs));
    return { total: past.length,
      windows: past.slice().reverse().slice(page * size, (page + 1) * size)
        .map((record) => ({ endedAt: record.endedAt,
          records: SessionScope.records(past, choiceId, record.endedAt) })),
    };
  }
  function domain(rows) {
    const positions = rows.map((r) => r.percentile).filter(Number.isFinite);
    if (!positions.length) return [0, 100];
    const low = Math.min(...positions), high = Math.max(...positions);
    const padding = Math.max(2, (high - low) * .05);
    return [Math.max(0, Math.floor((low - padding) / 10) * 10),
      Math.min(100, Math.ceil((high + padding) / 10) * 10)];
  }
  // What each measurement counts on this game's board, for the example board
  // on its card (creator 2026-10-20: "visible UI examples of what the number
  // or trait means", in the player's board style). Marks are squares to
  // shade, ring, or dot; 3BV spread draws its work points, their center,
  // and the spread as a circle, in cell coordinates. Board traits read the
  // final layout. `play` is null for a trace without recorded decisions;
  // otherwise misclicks, no-op clicks, unused flags, moves, and forks are
  // its during-the-game events and `play.flagged` the flags standing at the
  // end. A move's square is where it went.
  // A measurement whose name is a count of the marked squares needs no count
  // beside its board, so only the rest carry counts.
  function examples(width, height, mines, play) {
    const board = BoardMetrics.board(width, height, mines);
    const covered = new Set(board.covered);
    const safeCount = board.safe.length;
    const isolated = board.safe.filter((cell) => !covered.has(cell));
    const maxClue = Math.max(...board.safe.map((cell) => board.clues[cell]));
    const islands = BoardShape.islands(width, height, mines);
    const largest = islands.reduce((best, island) => (island.length > best.length ? island : best), []);
    const zini = (actions) => ({ marks: {
      ring: actions.filter((a) => a.kind === 'click').map((a) => a.cell),
      dot: actions.filter((a) => a.kind === 'chord').map((a) => a.cell),
      shade: actions.filter((a) => a.kind === 'flag').map((a) => a.cell) } });
    const traits = {
      bv3: { marks: { shade: board.covered, ring: isolated }, openings: board.units.length - isolated.length },
      zini: zini(Zini.ziniActions(width, height, mines)),
      hzini: zini(Zini.hziniActions(width, height, mines)),
      maxAdjacent: { marks: { shade: board.safe.filter((cell) => board.clues[cell] === maxClue) } },
      workSpread: { spread: { points: board.points, center: board.center, radius: board.workSpread } },
      zeroOneShare: { marks: { shade: board.covered.filter((cell) => board.clues[cell] <= 1) }, of: safeCount },
      zeroOpeningCoverage: { marks: { shade: board.covered }, of: safeCount },
      islandCount: { marks: { shade: islands.flat() } },
      largestIsland: { marks: { shade: largest } },
      zeroCount: { marks: { shade: board.safe.filter((cell) => board.clues[cell] === 0) } },
    };
    if (play === null) return traits;
    const eventCells = (type) => play.events.filter((event) => event.type === type && event.cell !== null)
      .map((event) => event.cell);
    const eventCount = (type) => play.events.filter((event) => event.type === type).length;
    const standing = new Set(play.flagged);
    const easyWorkLeft = play.events.filter((event) => event.type === 'left-easy-work');
    return { ...traits,
      moves: { marks: { ring: ['moved-on', 'left-hard-work', 'left-easy-work'].flatMap(eventCells) } },
      easyWorkLeft: { marks: { ring: eventCells('left-easy-work'),
        shade: [...new Set(easyWorkLeft.flatMap((event) => event.safeCells))] } },
      forks: { marks: { ring: eventCells('fork') } },
      misclickRate: { marks: { ring: eventCells('misclick') }, clicks: eventCount('misclick') },
      noopRate: { marks: { ring: eventCells('no-op') }, clicks: eventCount('no-op') },
      unusedFlagShare: { marks: { shade: eventCells('unused-flag') } },
      unflaggedMineShare: { marks: { shade: mines.flatMap((mine, cell) => (mine && !standing.has(cell) ? [cell] : [])) },
        of: mines.filter(Boolean).length },
    };
  }
  return { FASTCLICK_GAP_VERSION, metrics, defaults, defaultsForView, rows, rankedRow, addDistributions, summary, history, domain, examples };
})();

'use strict';

// Shared completed-game measurements: the stats panel and game-data catalog
// use the same formulas. Saved history is the only source of observations.
function secondsOf(record) {
  return record.timeMs / 1000;
}

function bvPerSecond(record) {
  return record.bv3 / secondsOf(record);
}

// Efficiency: 3BV / effective clicks (the clone name "throughput" is the
// same quantity). Wins only: a lost board was never finished, so the 3BV
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

// IOE (index of efficiency): 3BV / total clicks, wasted included — the
// total-click cousin of efficiency. Wins only for the same
// unfinished-board reason; undefined where wastedClicks was never
// measured (a missing denominator part, not zero).
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
  const metrics = [
    { id: 'time', name: 'time', higher: false, default: true,
      value: (r) => r.timeMs, format: (v) => (v / 1000).toFixed(3) + 's',
      help: 'Time from your first click to the win. Equal times rank the earlier game first.' },
    { id: 'misclickRate', allOutcomes: true, name: 'misclick rate', higher: false, default: true,
      value: (r) => r.timeMs > 0 ? r.misclicks * 60000 / r.timeMs : undefined,
      format: (v) => decimal(v) + '/min',
      help: 'Actions per minute that the visible board had already proved wrong, such as opening a proven mine or flagging a proven safe cell.' },
    { id: 'fastclickGap', allOutcomes: true, name: 'fastclick gap', higher: false, default: true,
      value: (r) => r.fastclickGapMs, format: (v) => Math.round(v) + 'ms',
      help: 'Median time between board-changing actions made while the cursor was moving (within 100 ms before), counting gaps up to 1 second. Flags are timed at the right press, left clicks at their release.' },
    { id: 'bvPerSecond', name: '3BV/s', higher: true, default: true,
      value: (r) => r.timeMs > 0 ? bvPerSecond(r) : undefined,
      format: (v) => v.toFixed(3), help: '3BV per second. 3BV is the fewest clicks that clear the board without flags.' },
    { id: 'clickRate', allOutcomes: true, name: 'click rate', higher: true, default: true,
      value: perSecond('clicks'), format: (v) => v.toFixed(2) + '/s',
      help: 'Board-changing clicks per second: reveals, flags, flag removals, and chords.' },
    { id: 'efficiency', name: 'efficiency', higher: true, default: false,
      value: efficiencyOf, format: percent,
      help: '3BV divided by your board-changing clicks. Chording can push it above 100%.' },
    { id: 'noopRate', allOutcomes: true, name: 'no-op rate', higher: false, default: true,
      value: perSecond('wastedClicks'), format: (v) => v.toFixed(2) + '/s',
      help: 'Clicks per second that changed nothing, such as chording an unsatisfied number or clicking a flag.' },
    { id: 'pathPer3bv', name: 'path / 3BV', higher: false, default: false,
      value: (r) => r.bv3 > 0 ? r.mousePathPx / r.bv3 : undefined,
      format: (v) => Number(v.toFixed(1)) + 'px',
      help: 'Cursor travel per unit of 3BV.' },
    { id: 'correctness', allOutcomes: true, name: 'correctness', higher: true, default: true,
      value: (r) => r.clicks + r.wastedClicks > 0 ? r.clicks / (r.clicks + r.wastedClicks) : undefined,
      format: percent, help: 'Share of your clicks that changed the board. A wrong flag still counts as a change.' },
    { id: 'ioe', name: 'IOE', higher: true, default: false,
      value: ioeOf, format: (v) => v.toFixed(3),
      help: '3BV divided by all your clicks, including clicks that changed nothing.' },
    { id: 'ziniEfficiency', name: 'ZiNi efficiency', higher: true, default: false,
      value: ziniEfficiencyOf, format: percent, help: 'ZiNi divided by your board-changing clicks. ZiNi is the click count of a standard greedy flag-and-chord solve of this board.' },
    { id: 'hziniEfficiency', name: 'HZiNi efficiency', higher: true, default: false,
      value: hziniEfficiencyOf, format: percent, help: 'HZiNi divided by your board-changing clicks. HZiNi is the action count of a fixed human-style solve; beating it gives more than 100%.' },
    { id: 'ios', name: 'IOS', higher: true, default: false,
      value: iosOf, format: (v) => v.toFixed(3), help: 'log(3BV) ÷ log(seconds). Only defined for games longer than 1 second.' },
    { id: 'stnb', name: 'STNB', higher: true, default: false,
      value: stnbOf, format: (v) => v.toFixed(1), help: 'Speed score adjusted for board difficulty, comparable across beginner, intermediate, and expert. Not defined on other boards or in Endgame drill.' },
    { id: 'mouseSpeed', allOutcomes: true, name: 'mouse speed', higher: true, default: true,
      value: perSecond('mousePathPx'), format: (v) => Math.round(v) + 'px/s',
      help: 'Cursor travel per second of play, pauses included.' },
    { id: 'pathPerClick', allOutcomes: true, name: 'path / click', higher: false, default: false,
      value: (r) => r.clicks > 0 ? r.mousePathPx / r.clicks : undefined,
      format: (v) => Number(v.toFixed(1)) + 'px', help: 'Cursor travel per board-changing click.' },
    { id: 'cadenceSpread', allOutcomes: true, name: 'cadence spread', higher: false, default: false,
      value: (r) => r.cadenceSpread, format: (v) => v.toFixed(2) + '×',
      help: 'How uneven your click timing is: the interquartile range of the gaps between all presses, divided by their median. 0 is perfectly even.' },
    { id: 'unusedMarkShare', name: 'unused flag share', higher: false, default: true,
      value: (r) => r.flagsPlaced > 0 ? r.unusedCorrectFlags / r.flagsPlaced : undefined,
      format: percent, help: 'Correct flags that no chord ever used, as a share of all flags you placed.' },
    { id: 'flagsWithoutMultiCellChord', name: 'flags no multi-cell chord used', higher: false, default: true,
      value: (r) => r.flagsWithoutMultiCellChord, format: (v) => String(v),
      help: 'Flags standing at the win that no chord opening two or more squares used. Each could have been one direct click, or nothing. Stage 1 of the training plan aims for 10 or fewer on Expert.' },
  ];
  // The creator's own selection (2026-09-23), compared since 2026-10-07 with
  // both lifetime and the session; time also against the last 24 hours.
  const defaults = Object.fromEntries(metrics.map((m) => [m.id, m.default]));
  const defaultsForView = { gameDataMetrics: defaults, sessionDefinition: SessionScope.defaultId, gameDataDayTime: true };
  const chronological = (records) => records.slice().sort((a, b) => a.endedAt - b.endedAt);
  const poolValues = (pool, spec, params) => pool.filter((r) => spec.allOutcomes || r.outcome === 'win')
    .map((r) => spec.value(r, params)).filter(Number.isFinite);
  // `counted` names the population (wins, games, boards) and windowText its
  // window, e.g. "so far".
  function rankedRow(record, pool, spec, scope, params, counted, windowText) {
    const value = spec.value(record, params);
    if (!Number.isFinite(value)) return null;
    const measured = pool.filter((r) => spec.allOutcomes || r.outcome === 'win').map((r) => ({ record: r, value: spec.value(r, params) }))
      .filter((r) => Number.isFinite(r.value));
    const total = measured.length;
    if (total < 2) return null;
    const better = measured.filter((r) => spec.higher ? r.value > value : r.value < value).length;
    const equal = measured.filter((r) => r.value === value).length;
    const time = spec.id === 'time';
    const rank = time ? better + measured.filter((r) => r.value === value && r.record.endedAt < record.endedAt).length + 1
      : better + (equal + 1) / 2;
    const allEqual = !time && equal === total;
    // Share of the other measured games that beat this one: the best is 0%, the worst 100%.
    const percentile = allEqual ? 50 : 100 * (rank - 1) / (total - 1);
    const population = total + ' ' + counted + ' ' + windowText + ' with these board settings';
    const tied = !time && equal > 1;
    const standing = allEqual
      ? 'All ' + population + ' have the same value, so it sits at 50%.'
      : (tied ? 'Tied for ranks ' + (better + 1) + '–' + (better + equal) : 'Rank ' + rank)
        + ' of ' + population + '. ' + (spec.higher ? 'Higher' : 'Lower')
        + ' values rank first; 0% is the best, and this sits at ' + Number(percentile.toFixed(1)) + '%.';
    return { id: spec.id + '.' + scope, metricId: spec.id, scope, name: spec.name,
      value, valueText: spec.format(value), higher: spec.higher, side: 'performance',
      rank, firstRank: tied ? better + 1 : rank, lastRank: tied ? better + equal : rank,
      total, counted, allEqual, percentile, helpText: [spec.help, standing],
    };
  }
  // The drawn axis of one measurement, shared by all its pools: one bin per
  // value for integers spanning at most 60 values, otherwise 36 bins over the
  // lifetime range trimmed to its 1st–99th percentiles. This game is always inside.
  function axisOf(values, value) {
    const sorted = values.slice().sort((a, b) => a - b);
    const low = Math.min(sorted[0], value), high = Math.max(sorted[sorted.length - 1], value);
    if (Number.isInteger(value) && sorted.every(Number.isInteger) && high - low <= 60) {
      return { lo: low - 0.5, hi: high + 0.5, bins: high - low + 1, integer: true };
    }
    const at = (p) => sorted[Math.round(p * (sorted.length - 1))];
    const lo = Math.min(at(0.01), value), hi = Math.max(at(0.99), value);
    return lo === hi ? { lo: lo - 0.5, hi: hi + 0.5, bins: 1, integer: false } : { lo, hi, bins: 36, integer: false };
  }
  // At most five labeled axis values, whole values on a per-value axis.
  function axisLabels(axis, format) {
    if (!axis.integer) {
      return [0, 1, 2, 3, 4].map((i) => axis.lo + i * (axis.hi - axis.lo) / 4)
        .map((value) => ({ value, text: format(value) }));
    }
    const first = axis.lo + 0.5, last = axis.hi - 0.5;
    const step = Math.max(1, Math.ceil((last - first) / 4));
    const labels = [];
    for (let value = first; value <= last; value += step) labels.push({ value, text: format(value) });
    return labels;
  }
  // Counts per bin, and each bin's standing: the mean percentile of its games
  // (0 best; equal values share their mean rank, so a bin of ties stands
  // where each of them does), null for a bin without games. Values beyond
  // the axis are counted in `outside`, never drawn into an edge bin, and
  // still rank.
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
    return { ...axis, counts, standing, outside: below + above };
  }
  // Each pool's histogram uses the lifetime axis, so one measurement's strips
  // line up; the lifetime row also carries the session games' values, drawn
  // as ticks under its axis.
  function addDistributions(poolRows, poolValuesByScope, sessionValues, format) {
    const lifetime = poolRows.find((row) => row.scope === 'lifetime');
    const axis = axisOf(poolValuesByScope.lifetime, lifetime.value);
    const labels = axisLabels(axis, format);
    return poolRows.map((row) => ({ ...row,
      distribution: { ...distribution(poolValuesByScope[row.scope], row.higher, axis), labels },
      ...(row === lifetime ? { sessionValues } : {}) }));
  }
  function rows(record, records, preferences = defaultsForView, params) {
    if (record.outcome !== 'win' || !records.includes(record)) return [];
    const past = records.filter((r) => r.endedAt <= record.endedAt);
    const session = SessionScope.records(past, preferences.sessionDefinition, record.endedAt);
    const day = past.filter((r) => r.endedAt >= record.endedAt - 86400000);
    const choice = SessionScope.choices.find((c) => c.id === preferences.sessionDefinition);
    const result = [];
    for (const spec of metrics) {
      if (!preferences.gameDataMetrics[spec.id]) continue;
      const counted = spec.allOutcomes ? 'games' : 'wins';
      const pools = [
        ['lifetime', past, 'so far'],
        ['session', session, 'this session (' + choice.label + ')'],
        ...(spec.id === 'time' && preferences.gameDataDayTime ? [['day', day, 'in the last 24 hours']] : []),
      ];
      // Session and day pools are subsets of lifetime, so any row implies a lifetime row.
      const poolRows = pools.map(([scope, pool, windowText]) => rankedRow(record, pool, spec, scope, params, counted, windowText))
        .filter((row) => row !== null);
      if (poolRows.length === 0) continue;
      const valuesByScope = Object.fromEntries(pools.map(([scope, pool]) => [scope, poolValues(pool, spec, params)]));
      result.push(...addDistributions(poolRows, valuesByScope, valuesByScope.session, spec.format));
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
  return { metrics, defaults, defaultsForView, rows, rankedRow, addDistributions, summary, history, domain };
})();

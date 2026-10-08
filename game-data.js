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
  // The worked calculations below print this game's stored inputs.
  const count = (n) => n.toLocaleString('en-US');
  const plural = (n, word) => count(n) + ' ' + word + (n === 1 ? '' : 's');
  const seconds = (r) => (r.timeMs / 1000).toFixed(3) + ' s';
  const pixels = (r) => count(Math.round(r.mousePathPx)) + ' px of cursor travel';
  const metrics = [
    { id: 'time', name: 'time', higher: false, default: true,
      value: (r) => r.timeMs, format: (v) => (v / 1000).toFixed(3) + 's',
      help: 'Seconds from your first click to the click that opened the last safe cell.',
      explain: (r) => 'This game took ' + seconds(r) + ' on the game clock.' },
    { id: 'misclickRate', allOutcomes: true, name: 'misclick rate', higher: false, default: true,
      value: (r) => r.timeMs > 0 ? r.misclicks * 60000 / r.timeMs : undefined,
      format: (v) => decimal(v) + '/min',
      help: 'Misclicks per minute. A misclick is an action the visible board had already proved wrong: opening a cell proven to be a mine, or flagging a cell proven safe.',
      explain: (r, params, v) => plural(r.misclicks, 'misclick') + ' ÷ ' + (r.timeMs / 60000).toFixed(3) + ' minutes = ' + decimal(v) + ' per minute.' },
    { id: 'fastclickGap', allOutcomes: true, name: 'fastclick gap', higher: false, default: true,
      value: (r) => r.fastclickGapMs, format: (v) => Math.round(v) + 'ms',
      help: 'The median gap between consecutive board-changing actions made while the cursor was moving (it moved in the 100 ms before), counting gaps up to 1 second. Flags are timed at the right press, left clicks at release.',
      explain: (r) => 'Half of this game’s qualifying gaps were shorter than ' + Math.round(r.fastclickGapMs) + ' ms and half longer.' },
    { id: 'bvPerSecond', name: '3BV/s', higher: true, default: true,
      value: (r) => r.timeMs > 0 ? bvPerSecond(r) : undefined,
      format: (v) => v.toFixed(3),
      help: '3BV divided by seconds: how much of the board’s minimum work you cleared per second. 3BV is the fewest clicks that clear the board without flags.',
      explain: (r, params, v) => r.bv3 + ' 3BV ÷ ' + seconds(r) + ' = ' + v.toFixed(3) + ' 3BV per second.' },
    { id: 'clickRate', allOutcomes: true, name: 'click rate', higher: true, default: true,
      value: perSecond('clicks'), format: (v) => v.toFixed(2) + '/s',
      help: 'Board-changing clicks per second: reveals, flags, flag removals, and chords. Clicks that changed nothing are not counted.',
      explain: (r, params, v) => plural(r.clicks, 'board-changing click') + ' ÷ ' + seconds(r) + ' = ' + v.toFixed(2) + ' per second.' },
    { id: 'efficiency', name: 'efficiency', higher: true, default: false,
      value: efficiencyOf, format: percent,
      help: '3BV divided by your board-changing clicks. 100% means as many clicks as the board’s 3BV; chords that open several cells at once can push it above 100%.',
      explain: (r, params, v) => r.bv3 + ' 3BV ÷ ' + plural(r.clicks, 'board-changing click') + ' = ' + percent(v) + '.' },
    { id: 'noopRate', allOutcomes: true, name: 'no-op rate', higher: false, default: true,
      value: perSecond('wastedClicks'), format: (v) => v.toFixed(2) + '/s',
      help: 'Clicks per second that changed nothing, such as chording a number whose mines are not all flagged, or clicking a flag.',
      explain: (r, params, v) => plural(r.wastedClicks, 'click') + ' that changed nothing ÷ ' + seconds(r) + ' = ' + v.toFixed(2) + ' per second.' },
    { id: 'pathPer3bv', name: 'path / 3BV', higher: false, default: false,
      value: (r) => r.bv3 > 0 ? r.mousePathPx / r.bv3 : undefined,
      format: (v) => Number(v.toFixed(1)) + 'px',
      help: 'How far the cursor moved, in screen pixels, per unit of the board’s 3BV.',
      explain: (r, params, v) => pixels(r) + ' ÷ ' + r.bv3 + ' 3BV = ' + Number(v.toFixed(1)) + ' px per 3BV.' },
    { id: 'correctness', allOutcomes: true, name: 'correctness', higher: true, default: true,
      value: (r) => r.clicks + r.wastedClicks > 0 ? r.clicks / (r.clicks + r.wastedClicks) : undefined,
      format: percent, help: 'The share of your clicks that changed the board. Clicks that changed nothing lower it; a wrong flag still counts as a change.',
      explain: (r, params, v) => r.clicks + ' board-changing ÷ (' + r.clicks + ' + ' + r.wastedClicks + ' that changed nothing) = ' + percent(v) + '.' },
    { id: 'ioe', name: 'IOE', higher: true, default: false,
      value: ioeOf, format: (v) => v.toFixed(3),
      help: '3BV divided by all your clicks, including the clicks that changed nothing.',
      explain: (r, params, v) => r.bv3 + ' 3BV ÷ (' + r.clicks + ' board-changing + ' + r.wastedClicks + ' that changed nothing) = ' + v.toFixed(3) + '.' },
    { id: 'ziniEfficiency', name: 'ZiNi efficiency', higher: true, default: false,
      value: ziniEfficiencyOf, format: percent, help: 'ZiNi divided by your board-changing clicks. ZiNi is the click count of a standard greedy flag-and-chord solve of this board.',
      explain: (r, params, v) => r.zini + ' ZiNi ÷ ' + plural(r.clicks, 'board-changing click') + ' = ' + percent(v) + '.' },
    { id: 'hziniEfficiency', name: 'HZiNi efficiency', higher: true, default: false,
      value: hziniEfficiencyOf, format: percent, help: 'HZiNi divided by your board-changing clicks. HZiNi is the action count of a fixed human-style flag-and-chord solve of this board; beating it gives more than 100%.',
      explain: (r, params, v) => r.hzini + ' HZiNi ÷ ' + plural(r.clicks, 'board-changing click') + ' = ' + percent(v) + '.' },
    { id: 'ios', name: 'IOS', higher: true, default: false,
      value: iosOf, format: (v) => v.toFixed(3), help: 'log(3BV) ÷ log(seconds), a speed index that grows more slowly than 3BV/s. Only defined for games longer than 1 second.',
      explain: (r, params, v) => 'log ' + r.bv3 + ' ÷ log ' + (r.timeMs / 1000).toFixed(3) + ' = ' + Math.log(r.bv3).toFixed(3)
        + ' ÷ ' + Math.log(secondsOf(r)).toFixed(3) + ' = ' + v.toFixed(3) + ' (natural logarithms; any base gives the same ratio).' },
    { id: 'stnb', name: 'STNB', higher: true, default: false,
      value: stnbOf, format: (v) => v.toFixed(1), help: 'A speed score adjusted for board difficulty, so beginner, intermediate, and expert compare: the level’s constant (36, 162, 435) ÷ (seconds^1.7 ÷ 3BV). Not defined on other boards or in Endgame drill.',
      explain: (r, params, v) => {
        const constant = stnbConstantOf(params), t = (r.timeMs / 1000).toFixed(3);
        return constant + ' ÷ (' + t + '^1.7 ÷ ' + r.bv3 + ') = ' + constant + ' ÷ ' + (Math.pow(secondsOf(r), 1.7) / r.bv3).toFixed(2)
          + ' = ' + v.toFixed(1) + '.';
      } },
    { id: 'mouseSpeed', allOutcomes: true, name: 'mouse speed', higher: true, default: true,
      value: perSecond('mousePathPx'), format: (v) => Math.round(v) + 'px/s',
      help: 'How far the cursor moved, in screen pixels, per second of play, pauses included.',
      explain: (r, params, v) => pixels(r) + ' ÷ ' + seconds(r) + ' = ' + Math.round(v) + ' px per second.' },
    { id: 'pathPerClick', allOutcomes: true, name: 'path / click', higher: false, default: false,
      value: (r) => r.clicks > 0 ? r.mousePathPx / r.clicks : undefined,
      format: (v) => Number(v.toFixed(1)) + 'px', help: 'How far the cursor moved, in screen pixels, per board-changing click.',
      explain: (r, params, v) => pixels(r) + ' ÷ ' + plural(r.clicks, 'board-changing click') + ' = ' + Number(v.toFixed(1)) + ' px per click.' },
    { id: 'cadenceSpread', allOutcomes: true, name: 'cadence spread', higher: false, default: false,
      value: (r) => r.cadenceSpread, format: (v) => v.toFixed(2) + '×',
      help: 'How uneven your click timing is: the width of the middle half of the gaps between all presses (the interquartile range) divided by their median. 0 is perfectly even.',
      explain: (r, params, v) => 'The middle half of this game’s press gaps spanned ' + v.toFixed(2) + ' times their median gap.' },
    { id: 'unusedMarkShare', name: 'unused flag share', higher: false, default: true,
      value: (r) => r.flagsPlaced > 0 ? r.unusedCorrectFlags / r.flagsPlaced : undefined,
      format: percent, help: 'Correct flags that no chord ever used, as a share of all flags you placed.',
      explain: (r, params, v) => plural(r.unusedCorrectFlags, 'correct flag') + ' no chord used ÷ ' + plural(r.flagsPlaced, 'flag') + ' placed = ' + percent(v) + '.' },
    { id: 'flagsWithoutMultiCellChord', name: 'flags no multi-cell chord used', higher: false, default: true,
      value: (r) => r.flagsWithoutMultiCellChord, format: (v) => String(v),
      help: 'Flags standing at the win that no chord opening two or more cells used. Each could have been one direct click, or nothing. Stage 1 of the training plan aims for 10 or fewer on Expert.',
      explain: (r) => 'Replaying this game’s inputs found ' + plural(r.flagsWithoutMultiCellChord, 'such flag') + ' at the win.' },
  ];
  // The creator's own selection (2026-09-23), compared since 2026-10-07 with
  // both lifetime and the session; time also against the last 24 hours.
  const defaults = Object.fromEntries(metrics.map((m) => [m.id, m.default]));
  const defaultsForView = { gameDataMetrics: defaults, sessionDefinition: SessionScope.defaultId, gameDataDayTime: true };
  const chronological = (records) => records.slice().sort((a, b) => a.endedAt - b.endedAt);
  const poolValues = (pool, spec, params) => pool.filter((r) => spec.allOutcomes || r.outcome === 'win')
    .map((r) => spec.value(r, params)).filter(Number.isFinite);
  // `counted` names the population (wins, games, boards) and windowText its
  // window, e.g. "so far". The standing sentence shows the percentage's
  // arithmetic: the share of the other games that ranked better, a tie
  // counting as half.
  function rankedRow(record, pool, spec, scope, params, counted, windowText) {
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
    const others = total - 1;
    const population = count(total) + ' ' + counted + ' ' + windowText + ' with these board settings';
    const place = tiedOthers > 0 ? 'Tied ' + ordinalOf(better + 1) + '–' + ordinalOf(better + equal) : ordinalOf(rank);
    const share = tiedOthers > 0
      ? count(better) + ' of the ' + count(others) + ' others ranked better and ' + count(tiedOthers)
        + ' tied, a tie counting as half: (' + count(better) + ' + ' + count(tiedOthers) + ' ÷ 2) ÷ ' + count(others)
      : count(better) + ' of the ' + count(others) + ' others ranked better' + (earlierEqual > 0
        ? ' (' + plural(earlierEqual, 'equal time') + ' set earlier counted as better)' : '') + ': ' + count(better) + ' ÷ ' + count(others);
    const standing = allEqual
      ? 'All ' + population + ' have the same value, so it sits at 50%.'
      : place + ' of ' + population + '. ' + share + ' = ' + Number(percentile.toFixed(1)) + '%.';
    return { id: spec.id + '.' + scope, metricId: spec.id, scope, name: spec.name,
      value, valueText: spec.format(value), higher: spec.higher, side: 'performance',
      rank, firstRank: better + 1, lastRank: better + 1 + tiedOthers, better, tiedOthers,
      total, counted, allEqual, percentile, helpText: [spec.help, standing],
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
  // bins. Either way the range is the lifetime range, trimmed to its
  // 1st–99th percentiles when wider than 60 values; this game and the
  // session's games (`inside`) are always inside.
  const VALUE_BINS = 60, GROUPED_BINS = 36;
  function axisOf(values, inside, declaredStep) {
    const sorted = values.slice().sort((a, b) => a - b);
    const at = (p) => sorted[Math.round(p * (sorted.length - 1))];
    const least = Math.min(...inside), most = Math.max(...inside);
    const step = declaredStep ?? ([...sorted, ...inside].every(Number.isInteger) ? 1 : undefined);
    if (step === undefined) {
      const lo = Math.min(at(0.01), least), hi = Math.max(at(0.99), most);
      return lo === hi ? { lo: lo - 0.5, hi: hi + 0.5, bins: 1, step: null, perBin: null }
        : { lo, hi, bins: GROUPED_BINS, step: null, perBin: null };
    }
    const index = (v) => Math.round(v / step);
    let first = Math.min(index(sorted[0]), index(least)), last = Math.max(index(sorted[sorted.length - 1]), index(most));
    if (last - first + 1 > VALUE_BINS) {
      first = Math.min(index(at(0.01)), index(least));
      last = Math.max(index(at(0.99)), index(most));
    }
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
  // What one bar covers, for the card's key.
  function binText(axis, format) {
    if (axis.step === 1 && axis.perBin === 1) return 'one bar per value';
    if (axis.step === 1 && /\d$/.test(format(axis.perBin))) return 'one bar per ' + axis.perBin + ' consecutive values';
    if (axis.step !== null && axis.step !== 1) {
      return 'one bar per ' + (axis.perBin === 1 ? 'possible value' : axis.perBin + ' possible values')
        + ' (one cell in ' + count(Math.round(1 / axis.step)) + ' is ' + format(axis.step) + ')';
    }
    return 'each bar spans ' + tidyNumber(format((axis.hi - axis.lo) / axis.bins));
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
  // and both card modes share bins. A pool of at most DOT_POOL games also
  // carries its values, so a card draws each game as its own dot. The
  // lifetime row also carries what the card shows once: the session games'
  // values, drawn as ticks under the lifetime axis, and this game's worked
  // calculation. `step` is a declared spacing of possible values.
  const DOT_POOL = 30;
  function addDistributions(poolRows, poolValuesByScope, sessionValues, format, calculation, step) {
    const lifetime = poolRows.find((row) => row.scope === 'lifetime');
    const axis = axisOf(poolValuesByScope.lifetime, [lifetime.value, ...sessionValues], step);
    const labels = axisLabels(axis, format);
    const bars = binText(axis, format);
    return poolRows.map((row) => {
      const values = poolValuesByScope[row.scope];
      return { ...row,
        distribution: { ...distribution(values, row.higher, axis), labels, binText: bars,
          ...(values.length <= DOT_POOL ? { values: values.slice().sort((a, b) => a - b) } : {}) },
        ...(row === lifetime ? { sessionValues, calculation } : {}) };
    });
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
      result.push(...addDistributions(poolRows, valuesByScope, valuesByScope.session, spec.format,
        spec.explain(record, params, spec.value(record, params))));
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

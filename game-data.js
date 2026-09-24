'use strict';

// Shared completed-game measurements: the stats panel and game-data catalog
// use the same formulas. Saved history is the only source of observations.
function secondsOf(record) {
  return record.timeMs / 1000;
}

function bvPerSecond(record) {
  return record.bv3 / secondsOf(record);
}

function efficiencyPercent(record) {
  return Math.round((record.bv3 / record.clicks) * 100);
}

// Effective / (effective + wasted). Absence of wastedClicks means the
// denominator was never measured, so this is undefined rather than 100%.
function correctnessPercent(record) {
  if (!('wastedClicks' in record)) return undefined;
  const total = record.clicks + record.wastedClicks;
  if (total === 0) return undefined;
  return Math.round((record.clicks / total) * 100);
}

// 3BV / effective clicks. Same quantity as efficiency, as a ratio.
// Wins only: a lost board was never finished, so the 3BV numerator is
// the whole board and the ratio would flatter a short loss.
function throughputOf(record) {
  if (record.outcome !== 'win' || record.clicks === 0) return undefined;
  return record.bv3 / record.clicks;
}

// log(3BV) / log(time in seconds). MSO blanks t≤1; we do the same.
// Wins only, same unfinished-board honesty as throughput.
function iosOf(record) {
  if (record.outcome !== 'win') return undefined;
  const t = secondsOf(record);
  if (!(t > 1) || !(record.bv3 > 0)) return undefined;
  return Math.log(record.bv3) / Math.log(t);
}

// IOE (index of efficiency): 3BV / total clicks, wasted included — the
// total-click cousin of throughput. Wins only for the same
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

// ZiNi efficiency: the flagger analog of throughput (ZNE on the stats
// sites) — greedy ZiNi over effective clicks. Wins only, and only on
// games whose records carry the stored zini.
function zniEfficiencyOf(record) {
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


// One page-wide definition, shared by live stats, records won, and game data.
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
  return { choices, bounds, records, earliest };
})();

const GameData = (() => {
  const percent = (v) => Number((v * 100).toFixed(2)) + '%';
  const decimal = (v) => Number(v.toFixed(2)).toString();
  const perSecond = (field) => (r) => r.timeMs > 0 ? r[field] * 1000 / r.timeMs : undefined;
  const metrics = [
    { id: 'time', name: 'time', higher: false, default: true,
      value: (r) => r.timeMs, format: (v) => (v / 1000).toFixed(3) + 's',
      help: 'Solve duration. Faster times rank higher; equal times keep earlier-completion-first order.' },
    { id: 'misclickRate', allOutcomes: true, name: 'misclick rate', higher: false, default: true,
      value: (r) => r.timeMs > 0 ? r.misclicks * 60000 / r.timeMs : undefined,
      format: (v) => decimal(v) + '/min',
      help: 'Board-changing actions contradicted by visible facts, per minute. Lower rates rank higher.' },
    { id: 'fastclickGap', allOutcomes: true, name: 'fastclick gap', higher: false, default: true,
      value: (r) => r.fastclickGapMs, format: (v) => Math.round(v) + 'ms',
      help: 'Median gap between useful presses made while moving, with gaps under one second. Shorter gaps rank higher. This is not literal double-click timing.' },
    { id: 'bvPerSecond', name: '3BV/s', higher: true, default: true,
      value: (r) => r.timeMs > 0 ? bvPerSecond(r) : undefined,
      format: (v) => v.toFixed(3), help: 'Board workload per second. Faster completion ranks higher.' },
    { id: 'clickRate', allOutcomes: true, name: 'click rate', higher: true, default: true,
      value: perSecond('clicks'), format: (v) => v.toFixed(2) + '/s',
      help: 'Board-changing clicks per second. Higher means faster activity, separately from efficiency.' },
    { id: 'efficiency', name: 'efficiency', higher: true, default: false,
      value: throughputOf, format: percent,
      help: '3BV divided by board-changing clicks. Higher ranks higher. Throughput is the same measurement and is not duplicated.' },
    { id: 'noopRate', allOutcomes: true, name: 'no-op rate', higher: false, default: true,
      value: perSecond('wastedClicks'), format: (v) => v.toFixed(2) + '/s',
      help: 'Clicks that changed nothing per second. Lower rates rank higher.' },
    { id: 'pathPer3bv', name: 'path / 3BV', higher: false, default: false,
      value: (r) => r.bv3 > 0 ? r.mousePathPx / r.bv3 : undefined,
      format: (v) => Number(v.toFixed(1)) + 'px',
      help: 'Cursor travel per unit of workload. Less travel ranks higher as movement economy.' },
    { id: 'correctness', allOutcomes: true, name: 'correctness', higher: true, default: true,
      value: (r) => r.clicks + r.wastedClicks > 0 ? r.clicks / (r.clicks + r.wastedClicks) : undefined,
      format: percent, help: 'Board-changing clicks divided by all clicks, including no-ops. Higher ranks higher.' },
    { id: 'ioe', name: 'IOE', higher: true, default: false,
      value: ioeOf, format: (v) => v.toFixed(3),
      help: '3BV divided by all clicks, including no-ops. Higher ranks higher. Unlike efficiency, the denominator includes wasted clicks.' },
    { id: 'ziniEfficiency', name: 'ZiNi efficiency', higher: true, default: false,
      value: zniEfficiencyOf, format: percent, help: 'Greedy ZiNi divided by board-changing clicks. Higher ranks higher.' },
    { id: 'hziniEfficiency', name: 'HZiNi efficiency', higher: true, default: false,
      value: hziniEfficiencyOf, format: percent, help: 'Human ZiNi divided by board-changing clicks. Higher ranks higher; this can exceed 100%.' },
    { id: 'ios', name: 'IOS', higher: true, default: false,
      value: iosOf, format: (v) => v.toFixed(3), help: 'Log(3BV) divided by log(solve seconds). Defined only above one second. Higher ranks higher.' },
    { id: 'stnb', name: 'STNB', higher: true, default: false,
      value: stnbOf, format: (v) => v.toFixed(1), help: 'Difficulty-normalized speed on the three standard board shapes, excluding Endgame drill. Higher ranks higher.' },
    { id: 'mouseSpeed', allOutcomes: true, name: 'mouse speed', higher: true, default: true,
      value: perSecond('mousePathPx'), format: (v) => Math.round(v) + 'px/s',
      help: 'Cursor travel per solve second. Higher means faster movement, not necessarily more efficient or better play.' },
    { id: 'pathPerClick', allOutcomes: true, name: 'path / click', higher: false, default: false,
      value: (r) => r.clicks > 0 ? r.mousePathPx / r.clicks : undefined,
      format: (v) => Number(v.toFixed(1)) + 'px', help: 'Cursor travel per board-changing click. Less travel ranks higher as movement economy.' },
    { id: 'cadenceSpread', allOutcomes: true, name: 'cadence spread', higher: false, default: false,
      value: (r) => r.cadenceSpread, format: (v) => v.toFixed(2) + '×',
      help: 'All-press gap interquartile range divided by its median. Lower means more even timing, not necessarily better reasoning.' },
    { id: 'unusedMarkShare', name: 'unused mark share', higher: false, default: true,
      value: (r) => r.flagsPlaced > 0 ? r.unusedCorrectFlags / r.flagsPlaced : undefined,
      format: percent, help: 'Correct placed marks that never contributed to an accepted chord, divided by all placed marks. Lower ranks higher for this observable no-chord-use measure; mental use is unobserved.' },
  ];
  // The creator's own configuration (2026-09-23): each metric's `default`
  // against lifetime, plus time (day); no session comparisons.
  const defaults = {
    lifetime: Object.fromEntries(metrics.map((m) => [m.id, m.default])),
    session: Object.fromEntries(metrics.map((m) => [m.id, false])),
  };
  const defaultsForView = { gameDataSessionMetrics: defaults.session, gameDataLifetimeMetrics: defaults.lifetime, sessionDefinition: 'pastHour', gameDataDayTime: true };
  const chronological = (records) => records.slice().sort((a, b) => a.endedAt - b.endedAt);
  const SCOPE_WORDS = { session: 'session', lifetime: 'life', day: 'day' };
  function rankedRow(record, pool, spec, scope, params, description) {
    const value = spec.value(record, params);
    if (!Number.isFinite(value)) return null;
    const measured = pool.filter((r) => spec.allOutcomes || r.outcome === 'win').map((r) => ({ record: r, value: spec.value(r, params) }))
      .filter((r) => Number.isFinite(r.value));
    const total = measured.length;
    const better = measured.filter((r) => spec.higher ? r.value > value : r.value < value).length;
    const equal = measured.filter((r) => r.value === value).length;
    const time = spec.id === 'time';
    const rank = time ? better + measured.filter((r) => r.value === value && r.record.endedAt < record.endedAt).length + 1
      : better + (equal + 1) / 2;
    const allEqual = !time && equal === total;
    // The label names this game's measurement; the trailing word names the
    // comparison pool (user wording: "(session)", "(life)").
    const scopeText = scope ? '(' + SCOPE_WORDS[scope] + ')' : '';
    const trait = spec.name + (scopeText ? ' ' + scopeText : '');
    return { id: spec.id + '.' + scope, metricId: spec.id, scope, trait, name: spec.name, scopeText,
      label: spec.name + ' ' + spec.format(value) + (scopeText ? ' ' + scopeText : ''),
      valueText: spec.format(value), side: 'performance',
      rank, total, allEqual, direction: spec.higher ? 'higher' : 'lower', population: spec.allOutcomes ? 'completed games' : 'wins',
      // Share of the other measured games that beat this one: the best is 0%, the worst 100%.
      percentile: total < 2 ? null : allEqual ? 50 : 100 * (rank - 1) / (total - 1),
      rankLabel: !time && equal > 1 ? '#' + (better + 1) + '–' + (better + equal) : '#' + rank,
      help: () => [spec.help, description + ' Only measured ' + (spec.allOutcomes ? 'completed games (wins and losses)' : 'wins')
        + ' in this size, mine count, mode, and generator count. This game’s measurement is compared with '
        + total + ' observations, including itself.'
        + (!time && equal > 1 ? ' Equal values share their mean rank.' : '')
        + (allEqual && total > 1 ? ' All measured values are equal, shown at 50%.' : '')],
    };
  }
  function rows(record, records, preferences = defaultsForView, params) {
    if (record.outcome !== 'win' || !records.includes(record)) return [];
    const past = records.filter((r) => r.endedAt <= record.endedAt);
    const session = SessionScope.records(records, preferences.sessionDefinition, record.endedAt);
    const choice = SessionScope.choices.find((c) => c.id === preferences.sessionDefinition);
    const result = [];
    for (const spec of metrics) {
      for (const [scope, pool, description] of [
        ['lifetime', past, 'Lifetime through this game’s completion.'],
        ['session', session, 'Session through this game’s completion; ' + choice.label + '. This is the shared page-wide session definition.'],
      ]) {
        const selected = scope === 'session' ? preferences.gameDataSessionMetrics : preferences.gameDataLifetimeMetrics;
        if (!selected[spec.id]) continue;
        const row = rankedRow(record, pool, spec, scope, params, description);
        if (row) result.push(row);
      }
    }
    if (preferences.gameDataDayTime) {
      const day = past.filter((r) => r.endedAt >= record.endedAt - 86400000);
      result.push(rankedRow(record, day, metrics[0], 'day', params, 'The trailing 24 hours ending at this game’s completion, across midnight.'));
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
  return { metrics, defaults, defaultsForView, rows, rankedRow, summary, history, domain };
})();

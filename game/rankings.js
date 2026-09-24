'use strict';

// Rank tables: rank windows, local days, and relative ages; day categories;
// board-metric and board-shape families; recent placements ("ranks won in
// session"); and the 11-row rank list builder.

//-------RANK WINDOWS AND AGES (local days, windows, relative ages)-------

// Local midnight `daysBack` days before the given moment.
function startOfDay(ms, daysBack = 0) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysBack);
  return d.getTime();
}

// Day-and-longer windows anchor at local midnights: "today" runs from the
// last midnight, "past week" from midnight 6 days back (7 calendar days),
// "this month"/"in <year>" from their calendar starts, and the rolling
// "in the last year" starts at the end of the day exactly 365 days prior.
// Sub-day windows stay purely rolling.
// Ordering concerns are deliberately separate:
// - displayOrder is where the tablechart appears;
// - dedupePriority is lower for the chart that claims a duplicate member set;
// "lifetime" and "past week" are additionally pinned by callers. Day
// categories (added in rankColumns) dedupe between "today" and "past week".
function rankWindows(nowMs) {
  const d = new Date(nowMs);
  return [
    { id: 'lifetime', label: 'lifetime', startMs: -Infinity,
      displayOrder: 10, dedupePriority: 12 },
    { id: 'calendar-year', label: 'in ' + d.getFullYear(),
      startMs: new Date(d.getFullYear(), 0, 1).getTime(),
      displayOrder: 20, dedupePriority: 10 },
    { id: 'rolling-year', label: 'in the last year',
      startMs: startOfDay(nowMs, 364),
      displayOrder: 30, dedupePriority: 11 },
    { id: 'calendar-month', label: 'this month',
      startMs: new Date(d.getFullYear(), d.getMonth(), 1).getTime(),
      displayOrder: 40, dedupePriority: 9 },
    { id: 'past-week', label: 'past week', startMs: startOfDay(nowMs, 6),
      displayOrder: 50, dedupePriority: 8 },
    { id: 'today', label: 'today', startMs: startOfDay(nowMs),
      displayOrder: 60, dedupePriority: 4 },
    { id: 'past-hour', label: 'past hour', startMs: nowMs - 3600e3,
      displayOrder: 70, dedupePriority: 3 },
    { id: 'past-15-min', label: 'past 15 min',
      startMs: nowMs - 15 * 60e3,
      displayOrder: 80, dedupePriority: 2 },
    { id: 'past-5-min', label: 'past 5 min', startMs: nowMs - 5 * 60e3,
      displayOrder: 90, dedupePriority: 1 },
    { id: 'past-1-min', label: 'past 1 min', startMs: nowMs - 60e3,
      displayOrder: 100, dedupePriority: 0 },
  ];
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Relative age in the largest sensible unit, split into count and unit so the
// counts can be right-aligned as their own column. h/d/w/y keep one decimal
// (including trailing .0); s/m/mo stay whole. Tenths-rounding that would
// display as the next unit's threshold promotes instead (23.95h → 1.0d).
function relativeAge(nowMs, thenMs) {
  const tenths = (n) => Math.round(n * 10) / 10;
  const seconds = Math.max(0, Math.round((nowMs - thenMs) / 1000));
  if (seconds < 60) return { count: seconds, unit: 's' };
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return { count: minutes, unit: 'm' };
  const hours = minutes / 60;
  const hoursTenth = tenths(hours);
  if (hoursTenth < 24) return { count: hoursTenth, unit: 'h' };
  const days = hours / 24;
  const daysTenth = tenths(days);
  if (daysTenth < 7) return { count: daysTenth, unit: 'd' };
  if (days < 30) return { count: tenths(days / 7), unit: 'w' };
  if (days < 365) return { count: Math.floor(days / 30), unit: 'mo' };
  return { count: tenths(days / 365), unit: 'y' };
}

function formatAgeCount(age) {
  return (age.unit === 'h' || age.unit === 'd' || age.unit === 'w' || age.unit === 'y')
    ? age.count.toFixed(1)
    : String(age.count);
}

// Each age unit's span in ms, matching relativeAge's boundaries. Used to
// place an age within its unit: frac runs 0 (just entered the unit) to 1
// (about to roll into the next), so scatter dots can fade with age inside
// a single color. Years cap at 10, beyond which everything is equally old.
const AGE_UNIT_SPANS = [
  ['s', 0, 60e3],
  ['m', 60e3, 3600e3],
  ['h', 3600e3, 864e5],
  ['d', 864e5, 7 * 864e5],
  ['w', 7 * 864e5, 30 * 864e5],
  ['mo', 30 * 864e5, 365 * 864e5],
  ['y', 365 * 864e5, 10 * 365 * 864e5],
];

function ageInfo(nowMs, thenMs) {
  const age = Math.max(0, nowMs - thenMs);
  for (const [unit, lo, hi] of AGE_UNIT_SPANS) {
    if (age < hi || unit === 'y') {
      return { unit, frac: Math.min(1, (age - lo) / (hi - lo)) };
    }
  }
}

//-------DAY CATEGORIES (weekday / weekend / US holidays / day of month)-------

function isWeekend(date) {
  return date.getDay() === 0 || date.getDay() === 6;
}

// US federal holidays (fixed dates plus the weekday-rule ones).
function isHoliday(date) {
  const m = date.getMonth();
  const day = date.getDate();
  const weekday = date.getDay();
  const nth = Math.ceil(day / 7);
  if (m === 0 && day === 1) return true;                       // New Year's Day
  if (m === 0 && weekday === 1 && nth === 3) return true;      // MLK Day
  if (m === 1 && weekday === 1 && nth === 3) return true;      // Presidents Day
  if (m === 4 && weekday === 1 && day >= 25) return true;      // Memorial Day
  if (m === 5 && day === 19) return true;                      // Juneteenth
  if (m === 6 && day === 4) return true;                       // Independence Day
  if (m === 8 && weekday === 1 && day <= 7) return true;       // Labor Day
  if (m === 10 && weekday === 4 && nth === 4) return true;     // Thanksgiving
  if (m === 11 && day === 25) return true;                     // Christmas
  return false;
}

// Columns for the current win: the rolling windows, plus lifetime-spanning
// categories the win itself belongs to (same weekday, weekend/weekday,
// day of month, holiday when today is one). Window columns carry their startMs; day
// categories have none — that absence is what marks them lifetime-spanning
// (the recent-placements strictly-longer rule reads it).
function rankColumns(referenceMs) {
  const columns = rankWindows(referenceMs).map((window) => ({
    ...window,
    filter: (s) => s.endedAt >= window.startMs,
  }));
  const winDate = new Date(referenceMs);
  const weekday = winDate.getDay();
  columns.push({
    id: 'weekday',
    label: 'on ' + WEEKDAY_NAMES[weekday] + 's',
    filter: (s) => new Date(s.endedAt).getDay() === weekday,
    displayOrder: 110,
    dedupePriority: 5,
  });
  const weekend = isWeekend(winDate);
  columns.push({
    id: weekend ? 'weekends' : 'weekdays',
    label: weekend ? 'on weekends' : 'on weekdays',
    filter: (s) => isWeekend(new Date(s.endedAt)) === weekend,
    displayOrder: 120,
    dedupePriority: 6,
  });
  if (isHoliday(winDate)) {
    columns.push({
      id: 'holidays',
      label: 'on holidays',
      filter: (s) => isHoliday(new Date(s.endedAt)),
      displayOrder: 130,
      dedupePriority: 7,
    });
  }
  const monthDate = winDate.getDate();
  columns.push({
    id: 'month-date',
    label: 'on the ' + ordinal(monthDate),
    filter: (s) => new Date(s.endedAt).getDate() === monthDate,
    displayOrder: 140,
    dedupePriority: 4.5,
    help: 'Times for wins finished on the ' + ordinal(monthDate)
      + ' day of any month, across all years, in your local timezone. This table follows the reference date, like the weekday tables.',
  });
  return columns.sort((a, b) => a.displayOrder - b.displayOrder);
}

//-------BOARD FAMILIES (exact values, shares, spread bands, shapes)-------

// Exact-value families present in the reference wins, compared against all
// saved wins. Group once per field so a long recent window does not rescan
// the history for each game or distinct value.
function rankValueGroups(referenceWins, wins, field) {
  const valueOf = typeof field === 'function' ? field : (win) => win[field];
  const values = [...new Set(referenceWins.map(valueOf)
    .filter((value) => typeof value === 'number' && Number.isFinite(value)))].sort((a, b) => a - b);
  const groups = new Map(values.map((value) => [value, []]));
  for (const win of wins) {
    const value = valueOf(win);
    if (groups.has(value)) groups.get(value).push(win);
  }
  return groups;
}

function boardFractionOf(record, field) {
  const m = record.boardMetrics;
  return m?.version === 1 && Number.isSafeInteger(m.safeCells) && m.safeCells > 0
    && Number.isSafeInteger(m[field]) && m[field] >= 0 && m[field] <= m.safeCells
    ? m[field] / m.safeCells : undefined;
}

function formatBoardShare(fraction) {
  return Number((100 * fraction).toFixed(3)) + '%';
}

function boardShareGroup(record, field) {
  if (boardFractionOf(record, field) === undefined) return undefined;
  const m = record.boardMetrics;
  // Integer arithmetic makes exact half-percentage ties round upward even
  // when the corresponding floating-point ratio lies just below its tie.
  return Math.floor((200 * m[field] + m.safeCells) / (2 * m.safeCells));
}

function boardSpreadGroup(record) {
  const m = record.boardMetrics;
  return m?.version === 1 && Number.isFinite(m.workSpread)
    ? Math.round(2 * m.workSpread) / 2 : undefined;
}

function boardShareHelp(record, field, definition) {
  const m = record.boardMetrics;
  return [definition,
    'This board: ' + m[field] + ' of ' + m.safeCells + ' safe cells ('
      + formatBoardShare(boardFractionOf(record, field)) + ').',
    'Times compare boards rounded to the nearest whole percentage point. Exact halfway values round up: 71.5% through below 72.5% belongs to 72%. The stored counts keep their full precision.',
  ];
}

// Shared by full tables and recent achievements, including every qualifying
// earlier group. Summary groups follow time/day (0/1): workload (2–5),
// clues (6–8), islands (9–10), then zeros/fractions (11–13). Within each
// family, use the numeric measurement. Pool size never changes row order.
// Matching one feature does not imply equal overall difficulty.
const BOARD_METRIC_TABLES = [
  { field: 'bv3', label: '3BV', setting: 'exact3BV', priority: 13, summaryGroup: 2 },
  { field: 'zini', label: 'ZiNi', setting: 'exactZiNi', priority: 14, summaryGroup: 3 },
  { field: 'maxAdjacent', label: 'max number', shortLabel: 'MN', setting: 'exactMaxNumber', priority: 15, summaryGroup: 6, higher: true },
  { field: 'hzini', label: 'HZiNi', setting: 'exactHZiNi', priority: 16, summaryGroup: 4,
    help: () => [
      'Human ZiNi is the action count of a fixed opening-first solve with full board knowledge. The same oriented board always gives the same integer.',
      'Open each zero region once. Then choose the revealed clue with the greatest nonnegative saving: covered safe neighbors minus unflagged mine neighbors minus one chord. Flag its missing mines and chord it. If none qualifies, reveal the next safe cell. Ties and direct reveals scan down columns, left to right.',
      'Each reveal, flag placement, and chord counts once. This measures that procedure, rather than the global minimum over all possible procedures. Times compare boards with exactly the same HZiNi count.',
    ] },
  { field: boardSpreadGroup, label: '3BV spread',
    labelOf: (value) => '3BV spread ' + value.toFixed(1) + ' cells',
    valueText: (record) => Number(record.boardMetrics.workSpread.toFixed(1)) + ' cells',
    rawValue: (record) => record.boardMetrics?.version === 1 ? record.boardMetrics.workSpread : undefined,
    setting: 'workSpreadTable', priority: 17, summaryGroup: 5,
    help: (record) => [
      'How spread out the board’s 3BV work is, measured in cell widths. Larger values mean the work points are more widely spread.',
      'Each zero region contributes one point at the mean position of its zero squares. Each safe square outside all zero openings contributes its own center. All points have equal weight. The value is the root-mean-square distance of these points from their mean position.',
      'This board: ' + record.boardMetrics.workSpread.toFixed(3) + ' cells. Times compare boards rounded to the nearest 0.5 cell. Exact halfway values round up: 2.25 through below 2.75 belongs to 2.5. The stored measurement keeps its full precision.',
    ] },
  { field: (win) => boardShareGroup(win, 'zeroOpenedZeroOneCells'), label: '0–1 share',
    valueText: (record) => formatBoardShare(boardFractionOf(record, 'zeroOpenedZeroOneCells')),
    rawValue: (record) => boardFractionOf(record, 'zeroOpenedZeroOneCells'), higher: true,
    labelOf: (value) => '0–1 share ' + value + '%', setting: 'zeroOneShareTable', priority: 18, summaryGroup: 12,
    help: (record) => boardShareHelp(record, 'zeroOpenedZeroOneCells',
      'Open every zero and nothing else. Count only the revealed zeros and ones, divided by all safe squares on the board. Covered ones and revealed clues of two or more do not count. Shared borders count once. No zeros means 0%.') },
  { field: (win) => boardShareGroup(win, 'zeroOpenedCells'), label: 'zero-opening coverage', shortLabel: 'ZOC',
    valueText: (record) => formatBoardShare(boardFractionOf(record, 'zeroOpenedCells')),
    rawValue: (record) => boardFractionOf(record, 'zeroOpenedCells'), higher: true,
    labelOf: (value) => 'zero-opening coverage ' + value + '%', setting: 'zeroOpeningTable', priority: 19, summaryGroup: 13,
    help: (record) => boardShareHelp(record, 'zeroOpenedCells',
      'The fraction of all safe squares exposed after opening every zero region, including bordering numbers of any value. Shared borders count once. This stops after automatic flooding, before deductions or chords. With no zeros the coverage is 0%.') },
];

function boardMetricCandidates(referenceWins, wins) {
  return BOARD_METRIC_TABLES.flatMap((spec) =>
    [...rankValueGroups(referenceWins, wins, spec.field)].map(([value, rows]) => ({
      label: spec.labelOf ? spec.labelOf(value) : spec.label + ' ' + value,
      trait: spec.shortLabel || spec.label,
      valueText: spec.valueText || (() => String(value)),
      rawValue: spec.rawValue || ((record) => record[spec.field]),
      higher: spec.higher === true, measurement: spec.label,
      setting: spec.setting,
      help: spec.help,
      dedupePriority: spec.priority,
      summaryOrder: [spec.summaryGroup, value],
      wins: rows,
    })));
}

// Board-shape chart candidates for the reference wins' finished-board families:
// {label, displayOrder, dedupePriority, summaryOrder, rows}. Older wins lacking a
// measurement stay off their list. Shared by the board-shape tablecharts
// and the recent-placements summary so the two chart sets cannot drift;
// the largestIsland display gate is applied at the tablechart render
// site, not here.
function boardShapeCandidates(referenceWins, wins) {
  const candidates = [];
  if (referenceWins.some((record) => record.maxAdjacent === 8)) {
    candidates.push({
      id: 'has-8',
      trait: 'has an 8',
      valueText: () => 'yes',
      summaryOrder: [7, 8],
      label: 'has 8',
      displayOrder: 10,
      dedupePriority: 0,
      rows: wins.filter((s) => s.maxAdjacent === 8),
    });
  }
  if (referenceWins.some((record) => record.hasSeven === true)) {
    candidates.push({
      id: 'has-7',
      trait: 'has a 7',
      valueText: () => 'yes',
      summaryOrder: [7, 7],
      label: 'has 7',
      displayOrder: 20,
      dedupePriority: 1,
      rows: wins.filter((s) => s.hasSeven === true),
    });
  }
  for (const cap of [4, 3, 2]) {
    if (referenceWins.some((record) =>
      typeof record.maxAdjacent === 'number' && record.maxAdjacent <= cap)) {
      candidates.push({
        id: 'max-' + cap,
        trait: 'MN ≤ ' + cap,
        valueText: (record) => String(record.maxAdjacent),
        summaryOrder: [8, cap],
        label: 'max ' + cap,
        displayOrder: 70 - cap * 10,
        dedupePriority: cap,
        rows: wins.filter((s) => typeof s.maxAdjacent === 'number' && s.maxAdjacent <= cap),
      });
    }
  }
  for (const [count, rows] of rankValueGroups(referenceWins, wins, 'islandCount')) {
    candidates.push({
      id: 'islands-' + count,
      trait: 'islands', rawValue: (record) => record.islandCount, higher: false,
      valueText: () => String(count),
      summaryOrder: [9, count],
      label: count === 1 ? '1 island' : count + ' islands',
      displayOrder: 80,
      dedupePriority: 10,
      rows,
    });
  }
  for (const [size, rows] of rankValueGroups(referenceWins, wins, 'largestIsland')) {
    candidates.push({
      id: 'largest-island-' + size,
      trait: 'largest island', rawValue: (record) => record.largestIsland, higher: true,
      valueText: () => String(size),
      summaryOrder: [10, size],
      label: 'largest island ' + size,
      displayOrder: 90,
      dedupePriority: 11,
      rows,
    });
  }
  for (const [count, rows] of rankValueGroups(referenceWins, wins, 'zeroCount')) {
    candidates.push({
      id: 'zeros-' + count,
      trait: 'zeros', rawValue: (record) => record.zeroCount, higher: true,
      valueText: () => String(count),
      summaryOrder: [11, count],
      label: count === 1 ? '1 zero' : count + ' zeros',
      displayOrder: 100,
      dedupePriority: 12,
      rows,
    });
  }
  return candidates.sort((a, b) => a.displayOrder - b.displayOrder);
}

//-------RECENT PLACEMENTS: COMPUTATION (pure; tests extract this span)-------

// Canonical order for every time-ranked win list. Modern JavaScript's stable
// sort preserves history order only in the extremely rare case where both
// stored values are identical.
function compareRankedWins(a, b) {
  return a.timeMs - b.timeMs || a.endedAt - b.endedAt;
}

// English ordinal: 1st, 2nd, 3rd, 4th ... with the 11th/12th/13th rule.
function ordinal(n) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return n + 'th';
  return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
}

// Absolute place and percentage standing are independent: first of a small
// pool can have a modest percentage, while a large pool's 32nd can be top 3%.
// Integer comparisons keep the color thresholds identical to ranking cutoffs.
function rankStanding(rank, total) {
  if (total === 1) return { band: 'only', podium: 0, label: 'Only result' };
  const podium = rank <= 3 ? rank : 0;
  if (rank === total) return { band: 'last', podium, label: 'Last place' };
  // An odd pool's center has equal numbers ahead and behind. Including it
  // in either tail makes that tail exceed half, e.g. "Bottom 67%" for #2/3.
  if (rank * 2 === total + 1) return { band: 'middle', podium, label: 'Middle place' };
  const thresholds = [[1, 'top1'], [2, 'top2'], [5, 'top5'], [10, 'top10'],
    [25, 'top25'], [50, 'top50'], [90, 'lower50'], [100, 'bottom10']];
  const [, band] = thresholds.find(([percent]) => rank * 100 <= total * percent);
  const upper = rank * 2 <= total;
  const count = upper ? rank : total - rank + 1;
  // Round outward so the text never claims a smaller top/bottom group than
  // the position occupies. Tenths below 1% keep very high placements useful.
  const percent = count * 100 < total
    ? Math.ceil(count * 1000 / total) / 10
    : Math.ceil(count * 100 / total);
  return { band, podium, label: (upper ? 'Top ' : 'Bottom ') + percent + '%' };
}

// Sorted ranks compressed into runs, the ordinal suffix only closing each
// run: [1, 3, 8, 9, 10, 11, 12] renders as "1st, 3rd, 8\u201312th".
function formatRankRuns(ranks) {
  const parts = [];
  for (let i = 0; i < ranks.length; i++) {
    let j = i;
    while (j + 1 < ranks.length && ranks[j + 1] === ranks[j] + 1) j++;
    parts.push(j > i ? ranks[i] + '\u2013' + ordinal(ranks[j]) : ordinal(ranks[i]));
    i = j;
  }
  return parts.join(', ');
}

// Compress only placements with the same visual meaning. Podium places,
// percentage-band boundaries, and the current game remain individually legible.
function recentPlacementRuns(ranks, total, currentRank) {
  const runs = [];
  for (const rank of ranks) {
    const standing = rankStanding(rank, total);
    const current = rank === currentRank;
    const previous = runs[runs.length - 1];
    if (previous && !previous.current && !current
        && previous.last + 1 === rank && previous.band === standing.band
        && previous.podium === standing.podium) {
      previous.last = rank;
    } else {
      runs.push({ first: rank, last: rank, current, ...standing });
    }
  }
  return runs;
}

function recentPlacementStanding(ranks, total) {
  const first = rankStanding(ranks[0], total).label;
  const last = rankStanding(ranks[ranks.length - 1], total).label;
  return first === last ? first : first + ' \u2013 ' + last;
}

// Progressive-disclosure dedupe shared by the tablecharts and their
// recent-placements summary. Candidates with the exact same member wins
// keep the lowest dedupePriority chart, except pinned charts are always
// kept and claim their duplicate sets before the ordinary candidates.
// `specificity` remains a compatibility fallback for extracted callers and
// old known-answer fixtures; production candidates use the explicit fields.
function rankDedupePriority(candidate) {
  return candidate.dedupePriority ?? candidate.specificity
    ?? Number.MAX_SAFE_INTEGER;
}

function dedupeRankCandidates(candidates, pinnedLabels = []) {
  const signatureOf = (candidate) => candidate.wins
    .map((win) => win.endedAt)
    .sort((a, b) => a - b)
    .join('|');
  const kept = [];
  const keptSet = new Set();
  const seenSets = new Set();
  for (const label of pinnedLabels) {
    const pinned = candidates.find((candidate) => candidate.label === label);
    if (pinned === undefined) throw new Error('missing pinned rank chart: ' + label);
    kept.push(pinned);
    keptSet.add(pinned);
    seenSets.add(signatureOf(pinned));
  }
  for (const candidate of [...candidates]
    .sort((a, b) => rankDedupePriority(a) - rankDedupePriority(b))) {
    if (keptSet.has(candidate)) continue;
    const signature = signatureOf(candidate);
    if (seenSets.has(signature)) continue;
    seenSets.add(signature);
    kept.push(candidate);
  }
  return kept;
}

// The recent-placements rows (docs/product/rankings.md "Recent placements"). Each
// candidate names one tablechart: {label, ordering priorities, wins (that chart's
// member wins), startMs (present only on time windows — a window reports
// only when it starts strictly before the source window, since a window
// no longer than the source could only echo its own chart; membership
// charts like weekend/weekday and same-3BV span lifetime and always
// qualify), alwaysShowBest (lifetime's near-miss rule: when no rank is
// within the top tenth, report the single best source-window rank anyway,
// marked nearMiss, so how close it came stays visible)}. Within each
// chart, wins rank fastest-first (ties by earlier finish) and a rank r is
// reported only when it is earned within the source window and sits in
// the list's top tenth (r * 10 <= list length; a 9-win list reports
// nothing). Rows preserve the supplied category/value order, independent
// of changing comparison-pool sizes or earned placements. Each row is
// {label, ranks (ascending, 1-based), total, nearMiss, currentRank}.
function recentPlacementsSummary(candidates, sourceStartMs, currentRecord) {
  const rows = [];
  for (const c of candidates) {
    if (c.startMs !== undefined && !(c.startMs < sourceStartMs)) continue;
    const list = c.wins.slice().sort(compareRankedWins);
    const ranks = [];
    for (let i = 0; (i + 1) * 10 <= list.length; i++) {
      if (list[i].endedAt >= sourceStartMs) ranks.push(i + 1);
    }
    const currentIndex = currentRecord === undefined ? -1 : list.indexOf(currentRecord);
    const currentRank = currentIndex === -1 ? undefined : currentIndex + 1;
    if (ranks.length > 0) {
      rows.push({
        label: c.label,
        summaryOrder: c.summaryOrder,
        ranks,
        total: list.length,
        nearMiss: false,
        currentRank: ranks.includes(currentRank) ? currentRank : undefined,
      });
    } else if (c.alwaysShowBest === true) {
      const best = list.findIndex((s) => s.endedAt >= sourceStartMs);
      if (best !== -1) {
        rows.push({
          label: c.label,
          summaryOrder: c.summaryOrder,
          ranks: [best + 1],
          total: list.length,
          nearMiss: true,
          currentRank: best === currentIndex ? currentRank : undefined,
        });
      }
    }
  }
  return rows;
}

// Keep the current mode and date's chart scope, but let every recent win
// contribute its exact benchmarks and board-shape families. The reference game controls
// highlighting only; a later unrelated board must not erase earlier ranks.
function recentPlacementCandidates(wins, referenceMs, sourceStartMs, collapseDuplicates) {
  const recentWins = wins.filter((win) => win.endedAt >= sourceStartMs);
  let rankCandidates = rankColumns(referenceMs).map((column) => ({
    label: column.label,
    dedupePriority: column.dedupePriority,
    summaryOrder: [column.startMs === undefined ? 1 : 0, column.displayOrder],
    startMs: column.startMs,
    wins: wins.filter(column.filter),
    alwaysShowBest: column.label === 'lifetime',
  }));
  if (collapseDuplicates) {
    rankCandidates = dedupeRankCandidates(rankCandidates, ['lifetime', 'past week']);
  }
  const candidates = [...rankCandidates, ...boardMetricCandidates(recentWins, wins)];
  let shapeCandidates = boardShapeCandidates(recentWins, wins)
    .map((candidate) => ({ ...candidate, wins: candidate.rows }));
  if (collapseDuplicates) {
    shapeCandidates = dedupeRankCandidates(shapeCandidates);
  }
  for (const c of shapeCandidates) {
    candidates.push({
      label: c.label,
      dedupePriority: 14 + c.dedupePriority,
      summaryOrder: c.summaryOrder,
      wins: c.wins,
    });
  }
  return candidates.sort((a, b) =>
    a.summaryOrder[0] - b.summaryOrder[0] || a.summaryOrder[1] - b.summaryOrder[1]);
}

//-------RECENT PLACEMENTS: DISPLAY-------

function applyRankHighlight(element, rank, total) {
  const standing = rankStanding(rank, total);
  element.classList.add('rank-highlight');
  element.dataset.rankBand = standing.band;
  element.dataset.rankPodium = String(standing.podium);
  element.title = ordinal(rank) + ' of ' + total + ' · ' + standing.label;
  return standing;
}

function buildRecentPlacements(record, wins, referenceMs, markReferenceRecord = true) {
  const { label: chosenLabel } = SessionScope.choices.find((c) => c.id === settings.sessionDefinition);
  const sourceStartMs = SessionScope.bounds(settings.sessionDefinition, referenceMs).from;
  const candidates = recentPlacementCandidates(
    wins, referenceMs, sourceStartMs, settings.collapseDuplicateCharts);
  const rows = recentPlacementsSummary(
    candidates, sourceStartMs, markReferenceRecord ? record : undefined);

  const box = document.createElement('div');
  box.className = 'rank-list recent-placements';
  const heading = document.createElement('h4');
  heading.textContent = 'ranks won in session';
  heading.title = 'top ranks on every longer chart (time windows, day '
    + 'categories, exact board benchmarks, 3BV-spread bands, and board shapes of session wins) that were earned '
    + 'in the session (' + chosenLabel + ', the one page-wide session chosen at the upper left); only ranks within the top tenth of a list count, '
    + 'except that lifetime shows its closest rank when none made the tenth. Ordered by category, with board values ascending.';
  box.dataset.sessionScopeView = '';
  box.addEventListener('session-scope-change', () => box.replaceWith(buildRecentPlacements(record, wins, referenceMs, markReferenceRecord)));
  box.appendChild(heading);

  // Lifetime's near-miss rule reports whenever the source window has any
  // win at all, so an empty summary means exactly that: no wins yet.
  if (rows.length === 0) {
    const none = document.createElement('div');
    none.className = 'recent-placements-none';
    none.textContent = 'no wins in session';
    box.appendChild(none);
    return box;
  }
  const grid = document.createElement('div');
  grid.className = 'recent-placements-grid';
  for (const row of rows) {
    const line = document.createElement('div');
    line.className = 'rank-row recent-row-ranked';
    applyRankHighlight(line, row.ranks[0], row.total);
    if (row.currentRank !== undefined) {
      line.classList.add('recent-row-current');
    }
    line.title = formatRankRuns(row.ranks) + ' of ' + row.total + ' · '
      + recentPlacementStanding(row.ranks, row.total);
    if (row.nearMiss) {
      line.title += '; no top-tenth ' + row.label + ' rank was won in the session'
        + '; this is the closest one';
    }
    const labelCell = document.createElement('span');
    labelCell.className = 'recent-window-cell';
    labelCell.textContent = row.label;
    line.appendChild(labelCell);
    const ranksCell = document.createElement('span');
    ranksCell.className = 'recent-ranks-cell';
    for (const run of recentPlacementRuns(row.ranks, row.total, row.currentRank)) {
      if (ranksCell.childNodes.length > 0) ranksCell.appendChild(document.createTextNode(', '));
      const rank = document.createElement('span');
      rank.className = 'recent-rank-run' + (run.current ? ' recent-current-rank' : '');
      const text = run.first === run.last ? ordinal(run.first)
        : run.first + '\u2013' + ordinal(run.last);
      applyRankHighlight(rank, run.first, row.total);
      rank.textContent = text;
      rank.title = text + ' of ' + row.total + ' · '
        + recentPlacementStanding([run.first, run.last], row.total);
      if (run.current) {
        rank.setAttribute('aria-label', 'This game: ' + rank.title);
        const marker = document.createElement('span');
        marker.className = 'recent-current-label';
        marker.textContent = ' this';
        rank.appendChild(marker);
      }
      ranksCell.appendChild(rank);
    }
    line.appendChild(ranksCell);
    const totalCell = document.createElement('span');
    totalCell.className = 'recent-of-cell';
    totalCell.textContent = 'of ' + row.total;
    line.appendChild(totalCell);
    const standingCell = document.createElement('span');
    standingCell.className = 'recent-standing-cell';
    standingCell.textContent = recentPlacementStanding(row.ranks, row.total);
    line.appendChild(standingCell);
    grid.appendChild(line);
  }
  box.appendChild(grid);
  return box;
}

//-------RANK LISTS (the 11-row ranked table)-------

// Visible slice of a ranked list, always the full 11 rows when the list has
// them (a constant row count keeps a chart's height stable across re-sorts,
// so reordering never reflows its neighbors). When my row sits within the
// top 11, the whole budget anchors at #1: the top 11 renders with my row in
// its true place. Otherwise the window centers on me — 5 above, 5 below —
// sliding upward when I'm near the bottom so the budget still fills.
function windowBounds(myIndex, length) {
  if (myIndex <= 10) return [0, Math.min(length, 11)];
  const end = Math.min(length, myIndex + 6);
  return [Math.max(0, end - 11), end];
}

// Every list renders its full 11-row window around the player's row (see
// windowBounds); a mediocre placement still shows its 5 neighbors above and
// below, at full opacity, since the placement itself is fresh information.
// The footer names the selected rank's full comparison pool and percentage,
// even when the end of a short list is visible.
function buildRankList(headingText, rowCount, myIndex, gridClass, buildRowCells, help) {
  const list = document.createElement('div');
  list.className = 'rank-list';
  if (headingText !== null) {
    const heading = document.createElement('h4');
    if (help) heading.appendChild(chartHelpButton(help, headingText));
    else heading.textContent = headingText;
    list.appendChild(heading);
  }
  const grid = document.createElement('div');
  grid.className = gridClass;
  const [start, end] = windowBounds(myIndex, rowCount);
  let standing;
  for (let i = start; i < end; i++) {
    const row = document.createElement('div');
    row.className = i === myIndex ? 'rank-row me' : 'rank-row';
    if (i === myIndex) standing = applyRankHighlight(row, i + 1, rowCount);
    for (const [cls, text] of buildRowCells(i)) {
      const cell = document.createElement('span');
      cell.className = cls;
      cell.textContent = text;
      row.appendChild(cell);
    }
    grid.appendChild(row);
  }
  list.appendChild(grid);
  // Keep one footer line in history views too, so clearing a selection
  // does not move the next row of tables.
  const total = document.createElement('div');
  total.className = 'rank-total';
  if (standing) {
    total.classList.add('rank-standing');
    const count = document.createElement('span');
    count.className = 'rank-standing-count';
    count.textContent = '#' + (myIndex + 1) + ' of ' + rowCount.toLocaleString();
    const percentage = document.createElement('span');
    percentage.className = 'rank-standing-label';
    percentage.textContent = standing.label;
    total.append(count, percentage);
  } else {
    total.textContent = end < rowCount ? rowCount + ' total' : '\u00a0';
  }
  list.appendChild(total);
  return list;
}

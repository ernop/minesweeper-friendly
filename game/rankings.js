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

function formatBoardShare(fraction, digits) {
  return Number((100 * fraction).toFixed(digits)) + '%';
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

// One measurement has one name in every table, game data row, chart, and
// report (creator direction 2026-10-07); all of them read it here.
const BOARD_TRAIT_NAMES = {
  bv3: '3BV', zini: 'ZiNi', hzini: 'HZiNi', workSpread: '3BV spread',
  maxAdjacent: 'max number', islandCount: 'islands', largestIsland: 'largest island',
  zeroCount: 'zeros', zeroOneShare: '0–1 share', zeroOpeningCoverage: 'zero-opening coverage',
};

function boardShareHelp(record, field, definition) {
  const m = record.boardMetrics;
  return [definition,
    'This board: ' + m[field] + ' of ' + m.safeCells + ' safe cells ('
      + formatBoardShare(boardFractionOf(record, field), 3) + '). Times compare boards rounded to the nearest whole percentage point (exact halfway values round up).',
  ];
}

// A share of safe cells moves in steps of one cell, and every board with
// these settings has the same number of safe cells.
function boardShareStep(record) {
  return 1 / record.boardMetrics.safeCells;
}

// Shared by full tables and recent achievements, including every qualifying
// earlier group. Summary groups follow time/day (0/1): workload (2–5),
// clues (6–8), islands (9–10), then zeros/fractions (11–13). Within each
// family, use the numeric measurement. Pool size never changes row order.
// Matching one feature does not imply equal overall difficulty. A grouped
// table names its group's range.
// `selfEvident` marks a trait whose name says what it is: its game data
// card shows no definition (creator 2026-10-08); its table keeps its help.
const BOARD_METRIC_TABLES = [
  { id: 'bv3', field: 'bv3', format: String, setting: 'exact3BV', priority: 13, summaryGroup: 2, selfEvident: true,
    help: () => ['The fewest clicks that clear this board without flags: one for each zero region, plus one for each number that no zero region reveals.'] },
  { id: 'zini', field: 'zini', format: String, setting: 'exactZiNi', priority: 14, summaryGroup: 3,
    help: () => ['The clicks a standard greedy solve with flags and chords needs when every mine is known. Never more than 3BV.'] },
  { id: 'maxAdjacent', field: 'maxAdjacent', format: String, setting: 'exactMaxNumber', priority: 15, summaryGroup: 6, higher: true,
    selfEvident: true, help: () => ['Max number: the most mines touching any one safe cell, from 1 to 8.'] },
  { id: 'hzini', field: 'hzini', format: String, setting: 'exactHZiNi', priority: 16, summaryGroup: 4,
    help: () => ['Human ZiNi: the actions a fixed human-style solve takes when every mine is known. It opens each zero region, then flags and chords around the clue that saves the most clicks, and reveals single cells when chording would cost extra. A reference count, not the true minimum.'] },
  { id: 'workSpread', field: boardSpreadGroup,
    labelOf: (value) => BOARD_TRAIT_NAMES.workSpread + ' ' + (value - 0.25).toFixed(2) + '–' + (value + 0.25).toFixed(2) + ' cells',
    format: (value) => Number(value.toFixed(1)) + ' cells',
    rawValue: (record) => record.boardMetrics?.version === 1 ? record.boardMetrics.workSpread : undefined,
    setting: 'workSpreadTable', priority: 17, summaryGroup: 5,
    help: (record) => [
      'How spread out the board’s 3BV work is, in cell widths: the root-mean-square distance of its work points from their center. Each zero region is one point at its center, and each safe cell that no zero region reveals is its own point.',
      'This board: ' + record.boardMetrics.workSpread.toFixed(3) + ' cells. Its table holds boards from '
        + (boardSpreadGroup(record) - 0.25).toFixed(2) + ' cells up to, not including, '
        + (boardSpreadGroup(record) + 0.25).toFixed(2) + ' cells.',
    ] },
  { id: 'zeroOneShare', field: (win) => boardShareGroup(win, 'zeroOpenedZeroOneCells'),
    format: (value) => formatBoardShare(value, 1),
    rawValue: (record) => boardFractionOf(record, 'zeroOpenedZeroOneCells'), higher: true,
    labelOf: (value) => BOARD_TRAIT_NAMES.zeroOneShare + ' ' + value + '%', setting: 'zeroOneShareTable', priority: 18, summaryGroup: 12,
    step: boardShareStep,
    help: (record) => boardShareHelp(record, 'zeroOpenedZeroOneCells',
      'Share of safe cells showing 0 or 1 after opening every zero region and nothing else. Covered ones do not count.') },
  { id: 'zeroOpeningCoverage', field: (win) => boardShareGroup(win, 'zeroOpenedCells'),
    format: (value) => formatBoardShare(value, 1),
    rawValue: (record) => boardFractionOf(record, 'zeroOpenedCells'), higher: true,
    labelOf: (value) => BOARD_TRAIT_NAMES.zeroOpeningCoverage + ' ' + value + '%', setting: 'zeroOpeningTable', priority: 19, summaryGroup: 13,
    step: boardShareStep,
    help: (record) => boardShareHelp(record, 'zeroOpenedCells',
      'Share of safe cells uncovered by opening every zero region, including the numbers on their borders.') },
];

function boardMetricCandidates(referenceWins, wins) {
  return BOARD_METRIC_TABLES.flatMap((spec) =>
    [...rankValueGroups(referenceWins, wins, spec.field)].map(([value, rows]) => ({
      label: spec.labelOf ? spec.labelOf(value) : BOARD_TRAIT_NAMES[spec.id] + ' ' + value,
      measurementId: spec.id,
      trait: BOARD_TRAIT_NAMES[spec.id],
      format: spec.format,
      rawValue: spec.rawValue || ((record) => record[spec.field]),
      higher: spec.higher === true,
      setting: spec.setting,
      selfEvident: spec.selfEvident === true,
      help: spec.help,
      step: spec.step,
      dedupePriority: spec.priority,
      summaryOrder: [spec.summaryGroup, value],
      wins: rows,
    })));
}

// Board-shape chart candidates for the reference wins' finished-board families:
// {id, label, displayOrder, dedupePriority, summaryOrder, rows}. Older wins lacking a
// measurement stay off their list. Shared by the board-shape tablecharts
// and the recent-placements summary so the two chart sets cannot drift;
// the largestIsland display gate is applied at the tablechart render
// site, not here. Families of one measured count also carry what game data
// plots (measurementId, trait, rawValue, higher, format).
function boardShapeCandidates(referenceWins, wins) {
  const candidates = [];
  if (referenceWins.some((record) => record.maxAdjacent === 8)) {
    candidates.push({
      id: 'has-8',
      summaryOrder: [7, 8],
      label: 'has an 8',
      displayOrder: 10,
      dedupePriority: 0,
      rows: wins.filter((s) => s.maxAdjacent === 8),
    });
  }
  if (referenceWins.some((record) => record.hasSeven === true)) {
    candidates.push({
      id: 'has-7',
      summaryOrder: [7, 7],
      label: 'has a 7',
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
        help: () => ['Boards with no number higher than ' + cap + '.'],
        summaryOrder: [8, cap],
        label: BOARD_TRAIT_NAMES.maxAdjacent + ' ≤ ' + cap,
        displayOrder: 70 - cap * 10,
        dedupePriority: cap,
        rows: wins.filter((s) => typeof s.maxAdjacent === 'number' && s.maxAdjacent <= cap),
      });
    }
  }
  for (const [count, rows] of rankValueGroups(referenceWins, wins, 'islandCount')) {
    candidates.push({
      id: 'islands-' + count, measurementId: 'islandCount',
      trait: BOARD_TRAIT_NAMES.islandCount, rawValue: (record) => record.islandCount, higher: false,
      help: () => ['Groups of touching mines on this board, diagonals included.'],
      format: String,
      summaryOrder: [9, count],
      label: BOARD_TRAIT_NAMES.islandCount + ' ' + count,
      displayOrder: 80,
      dedupePriority: 10,
      rows,
    });
  }
  for (const [size, rows] of rankValueGroups(referenceWins, wins, 'largestIsland')) {
    candidates.push({
      id: 'largest-island-' + size, measurementId: 'largestIsland',
      trait: BOARD_TRAIT_NAMES.largestIsland, rawValue: (record) => record.largestIsland, higher: true,
      help: () => ['Mines in the largest group of touching mines, diagonals included.'],
      format: String,
      summaryOrder: [10, size],
      label: BOARD_TRAIT_NAMES.largestIsland + ' ' + size,
      displayOrder: 90,
      dedupePriority: 11,
      rows,
    });
  }
  for (const [count, rows] of rankValueGroups(referenceWins, wins, 'zeroCount')) {
    candidates.push({
      id: 'zeros-' + count, measurementId: 'zeroCount',
      trait: BOARD_TRAIT_NAMES.zeroCount, rawValue: (record) => record.zeroCount, higher: true,
      selfEvident: true, help: () => ['Safe cells with no adjacent mines.'],
      format: String,
      summaryOrder: [11, count],
      label: BOARD_TRAIT_NAMES.zeroCount + ' ' + count,
      displayOrder: 100,
      dedupePriority: 12,
      rows,
    });
  }
  return candidates.sort((a, b) => a.displayOrder - b.displayOrder);
}

// The largest-island families show only with their own switch.
function largestIslandShown(candidate, shownThings) {
  return shownThings.largestIsland || candidate.measurementId !== 'largestIsland';
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

// Standing is the percentage band alone: first of a small pool can have a
// modest percentage, while a large pool's 32nd can be top 3%. Integer
// comparisons keep the color thresholds identical to ranking cutoffs.
function rankStanding(rank, total) {
  if (total === 1) return { band: 'only', label: 'Only result' };
  if (rank === total) return { band: 'last', label: 'Last place' };
  // An odd pool's center has equal numbers ahead and behind. Including it
  // in either tail makes that tail exceed half, e.g. "Bottom 67%" for #2/3.
  if (rank * 2 === total + 1) return { band: 'middle', label: 'Middle place' };
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
  return { band, label: (upper ? 'Top ' : 'Bottom ') + percent + '%' };
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

// Compress only placements with the same visual meaning. Percentage-band
// boundaries and the current game remain individually legible.
function recentPlacementRuns(ranks, total, currentRank) {
  const runs = [];
  for (const rank of ranks) {
    const standing = rankStanding(rank, total);
    const current = rank === currentRank;
    const previous = runs[runs.length - 1];
    if (previous && !previous.current && !current
        && previous.last + 1 === rank && previous.band === standing.band) {
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
  element.title = ordinal(rank) + ' of ' + total + ' · ' + standing.label;
  return standing;
}

function buildRecentPlacements(record, wins, referenceMs, markReferenceRecord = true) {
  const { label: chosenLabel } = SessionScope.choices.find((c) => c.id === settings.sessionDefinition);
  const sourceStartMs = SessionScope.bounds(settings.sessionDefinition, referenceMs).from;
  const box = document.createElement('div');
  box.className = 'rank-list recent-placements';
  const heading = document.createElement('h4');
  heading.appendChild(chartHelpButton([
    'Top ranks earned in the session (' + chosenLabel + ', the one page-wide session chosen at the upper left) on every longer chart: time windows, day categories, exact board benchmarks, 3BV-spread groups, and board shapes of session wins.',
    'Only ranks within the top tenth of a list count, except that lifetime shows its closest rank when none made the tenth. Rows go by category, board values ascending. Each rank is colored by its standing, green better and red worse; this game’s rank is light blue and says “this”.',
  ], 'ranks won in session'));
  box.dataset.sessionScopeView = '';
  box.addEventListener('session-scope-change', () => box.replaceWith(buildRecentPlacements(record, wins, referenceMs, markReferenceRecord)));
  box.appendChild(heading);

  const loading = document.createElement('div');
  loading.setAttribute('role', 'status');
  loading.textContent = 'Calculating ranks…';
  box.appendChild(loading);
  box.analysisReady = analysisTask('rankings', 'recent-placements', { wins: wins.map(analysisRecord), referenceMs, sourceStartMs,
    recordEndedAt: markReferenceRecord ? record.endedAt : null,
    collapseDuplicates: settings.collapseDuplicateCharts }).then((rows) => {
    loading.remove();
    drawRows(rows);
    // Its width decides whether it fits beside the board.
    scheduleBoardLayout();
  });
  box.analysisReady.catch(analysisFailure);
  function drawRows(rows) {
  // Lifetime's near-miss rule reports whenever the source window has any
  // win at all, so an empty summary means exactly that: no wins yet.
  if (rows.length === 0) {
    const none = document.createElement('div');
    none.className = 'recent-placements-none';
    none.textContent = 'no wins in session';
    box.appendChild(none);
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'recent-placements-grid';
  for (const row of rows) {
    const line = document.createElement('div');
    line.className = 'rank-row';
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
  }
  return box;
}

//-------SESSION SUMMARY: COMPUTATION (pure; tests extract this span)-------

// The session summary (docs/product/rankings.md "Session summary"): for each
// board type played in the session window, its games and wins, the
// session's best time with that time's rank among the type's wins so far,
// and the session's mean of each SESSION_SUMMARY_MEANS measurement over the
// wins that measured it (`means[id]`: {value, measured}, null without one).
// A board type is one history key (board, play mode, and generator). Rows
// follow difficultyKeys (board keys in difficulty order), then other keys.
const SESSION_SUMMARY_MEANS = ['time', 'bvPerSecond', 'ioe'];
function sessionSummaryRows(historyByKey, from, to, difficultyKeys) {
  const rows = [];
  for (const [key, records] of Object.entries(historyByKey)) {
    const session = records.filter((r) => r.endedAt >= from && r.endedAt <= to);
    if (session.length === 0) continue;
    const wins = session.filter((r) => r.outcome === 'win').sort(compareRankedWins);
    let best = null;
    if (wins.length > 0) {
      const lifetime = records.filter((r) => r.outcome === 'win' && r.endedAt <= to);
      best = { record: wins[0], total: lifetime.length,
        rank: lifetime.filter((r) => compareRankedWins(r, wins[0]) < 0).length + 1 };
    }
    const means = Object.fromEntries(SESSION_SUMMARY_MEANS.map((id) => {
      const spec = GameData.metrics.find((m) => m.id === id);
      const values = wins.map((r) => spec.value(r)).filter(Number.isFinite);
      return [id, values.length ? { value: values.reduce((sum, v) => sum + v, 0) / values.length, measured: values.length } : null];
    }));
    rows.push({ key, latest: session[session.length - 1], games: session.length, wins: wins.length, best, means });
  }
  const order = (key) => {
    const index = difficultyKeys.indexOf(key.split('@')[0]);
    return index === -1 ? difficultyKeys.length : index;
  };
  return rows.sort((a, b) => order(a.key) - order(b.key) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

//-------SESSION SUMMARY: DISPLAY-------

// A type's board, then its variant: the play mode unless it is the default
// Standard, and the generator unless it is the default. The variant has its
// own column, so variants line up and the usual case shows the board alone.
function sessionSummaryTypeParts(row) {
  const [board, mode] = row.key.split('@');
  const [size, mines] = board.split('/');
  const [width, height] = size.split('x').map(Number);
  const modeId = mode.split('+')[0];
  return { board: boardDisplayLabelOf({ width, height, mines: Number(mines) }),
    variant: [modeId === 'standard' ? null : playModeLabel(modeId),
      row.latest.generator === undefined ? null : BoardGenerators.displayLabel(row.latest.generator)]
      .filter((part) => part !== null).join(' · ') };
}

// `record` is the game just finished, whose best-time chip says "this";
// history views pass null.
function buildSessionSummary(record, referenceMs) {
  const box = document.createElement('div');
  box.className = 'rank-list session-summary';
  box.dataset.sessionScopeView = '';
  box.addEventListener('session-scope-change', () => {
    box.replaceWith(buildSessionSummary(record, referenceMs));
    scheduleBoardLayout();
  });
  const choice = SessionScope.choices.find((c) => c.id === settings.sessionDefinition);
  const { from, to } = SessionScope.bounds(settings.sessionDefinition, referenceMs);
  const heading = document.createElement('h4');
  heading.appendChild(chartHelpButton([
    'Games, wins, and win rate for every board type played in the session (' + choice.label
      + ', the one page-wide session chosen at the upper left). A board type is one size, mine count, mode, and generator; the mode is named only when it is not Standard, the generator only when it is not the default.',
    'Best is the session’s fastest win of that type. Its lifetime rank compares it with every win of that type so far; among equal times the earlier finish ranks first.',
    'Mean time, mean 3BV/s, and mean IOE average the session’s wins of that type, each over the wins that measured it, as game data defines them; for the board just played they are the session baseline for its time, 3BV/s, and IOE.',
  ], 'session'));
  box.appendChild(heading);
  const rows = sessionSummaryRows(history, from, to, Object.values(DIFFICULTIES).map(boardKeyOf));
  if (rows.length === 0) {
    const none = document.createElement('div');
    none.className = 'recent-placements-none';
    none.textContent = 'no games in session';
    box.appendChild(none);
    return box;
  }
  const grid = document.createElement('div');
  grid.className = 'session-summary-grid';
  const cell = (className, text) => {
    const node = document.createElement('span');
    node.className = className;
    node.textContent = text;
    return node;
  };
  const line = (className, cells) => {
    const node = document.createElement('div');
    node.className = 'rank-row ' + className;
    node.append(...cells);
    grid.appendChild(node);
  };
  const rate = (wins, games) => Math.round(100 * wins / games) + '%';
  const parts = rows.map(sessionSummaryTypeParts);
  const variants = parts.some((part) => part.variant !== '');
  const typeCells = (board, variant) => variants
    ? [cell('session-summary-type', board), cell('session-summary-type session-summary-variant', variant)]
    : [cell('session-summary-type', board)];
  const meanSpecs = SESSION_SUMMARY_MEANS.map((id) => GameData.metrics.find((m) => m.id === id));
  grid.style.gridTemplateColumns = 'repeat(' + ((variants ? 7 : 6) + meanSpecs.length) + ', auto)';
  const typeHead = cell('', 'board type');
  if (variants) typeHead.style.gridColumn = 'span 2';
  line('session-summary-head', [typeHead, ...['games', 'wins', 'win rate', 'best', 'lifetime rank',
    ...meanSpecs.map((spec) => 'mean ' + spec.name)].map((text) => cell('', text))]);
  rows.forEach((row, index) => {
    const rank = cell('session-summary-rank-cell', '');
    let best = cell('session-summary-number', '');
    if (row.best !== null) {
      const chip = cell('session-summary-rank', ordinal(row.best.rank));
      applyRankHighlight(chip, row.best.rank, row.best.total);
      if (row.best.record === record) {
        chip.classList.add('session-summary-current');
        chip.appendChild(cell('recent-current-label', ' this'));
      }
      rank.append(chip, ' of ' + row.best.total);
      best = cell('session-summary-number' + (isMarkless(row.best.record) ? ' markless-time' : ''),
        (row.best.record.timeMs / 1000).toFixed(3) + 's');
    }
    line('session-summary-row', [...typeCells(parts[index].board, parts[index].variant),
      cell('session-summary-number', String(row.games)), cell('session-summary-number', String(row.wins)),
      cell('session-summary-number', rate(row.wins, row.games)), best, rank,
      ...meanSpecs.map((spec) => cell('session-summary-number', row.means[spec.id] === null ? '' : spec.format(row.means[spec.id].value)))]);
  });
  if (rows.length > 1) {
    const games = rows.reduce((sum, row) => sum + row.games, 0);
    const wins = rows.reduce((sum, row) => sum + row.wins, 0);
    line('session-summary-total', [...typeCells('all', ''), cell('session-summary-number', String(games)),
      cell('session-summary-number', String(wins)), cell('session-summary-number', rate(wins, games)), cell('', ''), cell('', ''),
      ...meanSpecs.map(() => cell('', ''))]);
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

//-------STREAK RANKINGS: COMPUTATION-------

function streakRuns(records) {
  const runs = [{ len: 0, end: null }];
  for (const record of records) {
    if (record.outcome === 'win') {
      const run = runs[runs.length - 1];
      run.len++;
      run.end = record.endedAt;
    } else runs.push({ len: 0, end: null });
  }
  return runs;
}

function rankedStreaks(runs, slack) {
  const span = Math.min(slack + 1, runs.length);
  const cores = [];
  for (let i = 0; i + span <= runs.length; i++) {
    let a = -1, b = -1, len = 0;
    for (let j = i; j < i + span; j++) {
      if (runs[j].len === 0) continue;
      if (a === -1) a = j;
      b = j;
      len += runs[j].len;
    }
    if (a === -1) continue;
    // Fixed-width windows advance both endpoints monotonically. Only the
    // last core can contain this one, or be contained by it.
    if (cores.length && cores[cores.length - 1].a === a) cores.pop();
    if (cores.length && cores[cores.length - 1].b >= b) continue;
    cores.push({ a, b, len });
  }
  return cores.map(({ b, len }) => ({
    len, end: runs[b].end, current: b === runs.length - 1,
  })).sort((a, b) => b.len - a.len || b.end - a.end);
}

//-------STREAK RANKINGS: COMPUTATION END-------

// Compute complete standings in the worker, returning only each table's
// visible window. History-sized arrays never need to cross back into the UI.
function resultRankPlan(record, records, options, preferences, referenceMs) {
  const wins = records.filter((r) => r.outcome === 'win');
  const boardRecord = options.boardRecord || record;
  const table = (label, list, help) => {
    const index = options.historyView ? -1 : list.indexOf(record);
    const [start, end] = windowBounds(index, list.length);
    return { label, count: list.length, index, start, rows: list.slice(start, end), help };
  };
  let candidates = rankColumns(referenceMs)
    .filter((column) => preferences.shownThings.lastOneMinute || column.label !== 'past 1 min')
    .map((column) => ({ ...column, wins: wins.filter(column.filter).sort(compareRankedWins) }));
  if (preferences.collapseDuplicateCharts) {
    const kept = new Set(dedupeRankCandidates(candidates, ['lifetime', 'past week']));
    candidates = candidates.filter((c) => kept.has(c));
  }
  const timeTables = preferences.shownThings.timeTables
    ? candidates.map((c) => table(c.label, c.wins, c.help)) : [];
  const boardTables = [];
  for (const c of boardMetricCandidates([boardRecord], wins)) {
    if (preferences.shownThings[c.setting]) {
      boardTables.push(table(c.label, c.wins.slice().sort(compareRankedWins), c.help(boardRecord)));
    }
  }
  if (preferences.shownThings.boardShapeTables) {
    let shapes = boardShapeCandidates([boardRecord], wins)
      .filter((c) => largestIslandShown(c, preferences.shownThings))
      .map((c) => ({ ...c, wins: c.rows }));
    if (preferences.collapseDuplicateCharts) {
      const kept = new Set(dedupeRankCandidates(shapes));
      shapes = shapes.filter((c) => kept.has(c));
    }
    for (const c of shapes) boardTables.push(table(c.label, c.wins.slice().sort(compareRankedWins), c.help?.(boardRecord)));
  }
  const runs = streakRuns(records);
  const streakTables = [];
  for (const [label, key, slack] of [['streak', 'streak', 0], ['near-streak', 'nearStreak', 1],
    ['near-near-streak', 'nearNearStreak', 2]]) {
    if (!preferences.shownThings[key]) continue;
    const list = rankedStreaks(runs, slack);
    const index = options.historyView ? -1 : list.findIndex((seg) => seg.current);
    const [start, end] = windowBounds(index, list.length);
    streakTables.push({ label, count: list.length, index, start, rows: list.slice(start, end) });
  }
  return { timeTables, boardTables, streakTables };
}

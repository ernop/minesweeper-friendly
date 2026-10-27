'use strict';
// Known-answer tests for the recent-placements summary: ordinal and
// run formatting, chart-set dedupe, the strictly-longer-window rule,
// membership charts (no startMs), the top-tenth cutoff, tie-breaking,
// row order, current-game marking, lifetime's near-miss rule, and the
// streak lists.

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const repo = path.join(__dirname, '..');
vm.runInThisContext(fs.readFileSync(path.join(repo, 'game-data.js'), 'utf8'));
const source = require('./game-source.js').source;
function section(from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  if (start === -1 || end === -1) throw new Error('section markers not found: ' + from);
  return source.slice(start, end);
}
vm.runInThisContext(section('//-------RECENT PLACEMENTS: COMPUTATION', '//-------RECENT PLACEMENTS: DISPLAY'));
vm.runInThisContext(section('//-------RANK WINDOWS AND AGES', '//-------DAY CATEGORIES'));
vm.runInThisContext(section('//-------DAY CATEGORIES', '//-------RECENT PLACEMENTS: COMPUTATION'));
vm.runInThisContext(section('//-------GAME DATA RANKING', '//-------GAME DATA CHART'));
globalThis.Justice = require(path.join(repo, 'justice.js'));
vm.runInThisContext(section('//-------GAME-END EVALUATION: VERDICT', '//-------GAME-END EVALUATION: CAPTURE'));
vm.runInThisContext(section('//-------SESSION SUMMARY: COMPUTATION', '//-------SESSION SUMMARY: DISPLAY'));
vm.runInThisContext(section('//-------STREAK RANKINGS: COMPUTATION-------', '//-------STREAK RANKINGS: COMPUTATION END'));
globalThis.isMarkless = (record) => record.flagsPlaced === 0;

let checks = 0;
function assertEq(name, actual, want) {
  checks++;
  if (actual !== want) throw new Error(`${name}: got ${actual}, want ${want}`);
}

// Trait markers rank board values, with the player's preferred directions.
{
  const current = { outcome: 'win', endedAt: 3, bv3: 75, zeroCount: 59 };
  const past = [{ outcome: 'win', endedAt: 1, bv3: 70, zeroCount: 40 },
    { outcome: 'loss', endedAt: 2, bv3: 60, zeroCount: 50 }, current];
  const comparisons = [...boardMetricCandidates([current], past),
    ...boardShapeCandidates([current], past)];
  const rows = boardTraitRankProfile(current, comparisons, past, 'today');
  const workload = rows.find((r) => r.metricId === 'bv3');
  const zeros = rows.find((r) => r.metricId === 'zeroCount');
  assertEq('lower 3BV preferred', workload.rank, 3);
  assertEq('higher zero count preferred', zeros.rank, 1);
  assertEq('trait values compare all measured boards including losses', workload.total, 3);
  assertEq('trait measured value stays visible', workload.valueText, '75');
  assertEq('the best board in the pool is 0%', zeros.percentile, 0);
  assertEq('the worst board in the pool is 100%', workload.percentile, 100);
  assertEq('a board trait has the same name as its table and chart', workload.name, '3BV');
  assertEq('board traits count boards', workload.standingText, '3rd of 3 boards');
  assertEq('board trait distributions count every measured board', workload.distribution.counts.reduce((a, b) => a + b, 0), 3);
  const low = { outcome: 'win', endedAt: 1, maxAdjacent: 2, largestIsland: 3, islandCount: 12,
    boardMetrics: { version: 1, safeCells: 100, zeroOpenedCells: 20, zeroOpenedZeroOneCells: 10 } };
  const mid = { outcome: 'win', endedAt: 2, maxAdjacent: 5, largestIsland: 8, islandCount: 6,
    boardMetrics: { version: 1, safeCells: 100, zeroOpenedCells: 50, zeroOpenedZeroOneCells: 40 } };
  const high = { outcome: 'win', endedAt: 3, maxAdjacent: 8, largestIsland: 20, islandCount: 1,
    boardMetrics: { version: 1, safeCells: 100, zeroOpenedCells: 90, zeroOpenedZeroOneCells: 80 } };
  const pool = [low, mid, high];
  const preferred = (record) => boardTraitRankProfile(record,
    [...boardMetricCandidates([record], pool), ...boardShapeCandidates([record], pool)], pool, 'today');
  const highRows = preferred(high);
  const lateLow = { ...low, endedAt: 4 };
  const worstRows = boardTraitRankProfile(lateLow,
    [...boardMetricCandidates([lateLow], [mid, high, lateLow]),
      ...boardShapeCandidates([lateLow], [mid, high, lateLow])],
    [mid, high, lateLow], 'today');
  const of = (list, id) => list.find((r) => r.metricId === id);
  assertEq('higher max number is the preferred end', of(highRows, 'maxAdjacent').percentile, 0);
  assertEq('lower max number is the worst end', of(worstRows, 'maxAdjacent').percentile, 100);
  assertEq('max number keeps its full name', of(highRows, 'maxAdjacent').name, 'max number');
  assertEq('higher zero-opening coverage is the preferred end', of(highRows, 'zeroOpeningCoverage').percentile, 0);
  assertEq('lower zero-opening coverage is the worst end', of(worstRows, 'zeroOpeningCoverage').percentile, 100);
  assertEq('zero-opening coverage keeps its full name', of(highRows, 'zeroOpeningCoverage').name, 'zero-opening coverage');
  assertEq('higher largest island is the preferred end', of(highRows, 'largestIsland').percentile, 0);
  assertEq('fewer islands stay preferred', of(highRows, 'islandCount').percentile, 0);
  assertEq('higher 0–1 share stays preferred', of(highRows, 'zeroOneShare').percentile, 0);
  const shareAxis = of(highRows, 'zeroOneShare').distribution;
  assertEq('a share axis labels round shares', shareAxis.labels.map((label) => label.text).join(' '), '20% 40% 60% 80%');
  assertEq('a share of safe cells bins whole cells', shareAxis.step + ' ' + shareAxis.perBin, 0.01 + ' 2');
  assertEq('a board trait also ranks against the session’s boards',
    highRows.filter((r) => r.metricId === 'zeroOneShare').map((r) => r.scope).join(' '), 'lifetime session');
  assertEq('a self-evident trait’s card has no definition', of(highRows, 'maxAdjacent').definition, undefined);
  assertEq('a trait the name leaves open keeps its definition', of(highRows, 'islandCount').definition,
    'Groups of touching mines on this board, diagonals included.');
  assertEq('a board trait’s card gives the rank alone', of(highRows, 'maxAdjacent').standingText, '1st of 3 boards');
  assertEq('single board has no comparison rows', boardTraitRankProfile(current, comparisons, [current], 'today').length, 0);
  assertEq('no board profile for a loss', boardTraitRankProfile({ ...current, outcome: 'loss' }, comparisons, past, 'today').length, 0);
}

// Visible board measurements are independent of rounded comparison buckets.
{
  const record = { outcome: 'win', timeMs: 33542, bv3: 75, maxAdjacent: 5,
    islandCount: 21, zeroCount: 59,
    boardMetrics: { version: 1, workSpread: 6.38, safeCells: 1000,
      zeroOpenedZeroOneCells: 604, zeroOpenedCells: 694 } };
  const candidates = boardMetricCandidates([record], [record]);
  const spread = candidates.find((r) => r.trait === '3BV spread');
  assertEq('a spread table names its half-cell group range', spread.label, '3BV spread 6.25–6.75 cells');
  assertEq('spread label displays the measurement', spread.format(spread.rawValue(record)), '6.4 cells');
  const coverage = candidates.find((r) => r.trait === 'zero-opening coverage');
  assertEq('coverage cohort stays a whole percentage', coverage.label, 'zero-opening coverage 69%');
  assertEq('coverage label displays the measured share', coverage.format(coverage.rawValue(record)), '69.4%');
  const zeros = boardShapeCandidates([record], [record]).find((r) => r.trait === 'zeros');
  assertEq('shape label displays its actual count', zeros.format(zeros.rawValue(record)), '59');
  const capped = { ...record, maxAdjacent: 3 };
  assertEq('a max number cap names the measurement', boardShapeCandidates([capped], [capped])
    .filter((r) => r.id.startsWith('max-')).map((r) => r.label).join(', '), 'max number ≤ 4, max number ≤ 3');
}

{
  const layout = (values) => boardTraitLabelLayout(values.map((percentile) => ({ percentile })), 0, 100, 20);
  assertEq('nearby trait labels share the displacement', layout([40, 40]).map((r) => r.labelY).join(','), '30,50');
  assertEq('displaced trait labels retain exact points', layout([40, 40]).map((r) => r.pointY).join(','), '40,40');
  assertEq('top trait cluster stays on scale', layout([0, 0, 0]).map((r) => r.labelY).join(','), '0,20,40');
  assertEq('bottom trait cluster stays on scale', layout([100, 100, 100]).map((r) => r.labelY).join(','), '60,80,100');
  assertEq('separated labels keep exact positions', layout([100, 0, 50]).map((r) => r.labelY).join(','), '0,50,100');
  assertEq('empty comparisons have no labels', layout([]).length, 0);
}

// Ordinals, including the 11th/12th/13th rule and its 111th recurrence.
for (const [n, want] of [
  [1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [10, '10th'],
  [11, '11th'], [12, '12th'], [13, '13th'], [21, '21st'], [22, '22nd'],
  [23, '23rd'], [100, '100th'], [101, '101st'], [111, '111th'], [112, '112th'],
]) {
  assertEq(`ordinal ${n}`, ordinal(n), want);
}

// Run compression: consecutive ranks join, the suffix closes each run.
assertEq('single rank', formatRankRuns([1]), '1st');
assertEq('two apart', formatRankRuns([1, 3]), '1st, 3rd');
assertEq('adjacent pair', formatRankRuns([1, 2]), '1\u20132nd');
assertEq('example from the request',
  formatRankRuns([1, 3, 8, 9, 10, 11, 12]), '1st, 3rd, 8\u201312th');
assertEq('run then single', formatRankRuns([2, 3, 4, 7]), '2\u20134th, 7th');

// Highlight semantics must agree between full tables and the compact
// summary, including inclusive lower-tail counts and exact band boundaries.
for (const [rank, total, band, label] of [
  [1, 1, 'only', 'Only result'],
  [1, 2, 'top50', 'Top 50%'],
  [2, 2, 'last', 'Last place'],
  [1, 3, 'top50', 'Top 34%'],
  [2, 3, 'middle', 'Middle place'],
  [3, 3, 'last', 'Last place'],
  [2, 5, 'top50', 'Top 40%'],
  [3, 5, 'middle', 'Middle place'],
  [4, 5, 'lower50', 'Bottom 40%'],
  [4, 7, 'middle', 'Middle place'],
  [51, 101, 'middle', 'Middle place'],
  [1, 9, 'top25', 'Top 12%'],
  [1, 91, 'top2', 'Top 2%'],
  [2, 1000, 'top1', 'Top 0.2%'],
  [3, 1000, 'top1', 'Top 0.3%'],
  [10, 1000, 'top1', 'Top 1%'],
  [11, 1000, 'top2', 'Top 2%'],
  [20, 1000, 'top2', 'Top 2%'],
  [21, 1000, 'top5', 'Top 3%'],
  [50, 1000, 'top5', 'Top 5%'],
  [51, 1000, 'top10', 'Top 6%'],
  [100, 1000, 'top10', 'Top 10%'],
  [101, 1000, 'top25', 'Top 11%'],
  [250, 1000, 'top25', 'Top 25%'],
  [251, 1000, 'top50', 'Top 26%'],
  [500, 1000, 'top50', 'Top 50%'],
  [501, 1000, 'lower50', 'Bottom 50%'],
  [900, 1000, 'lower50', 'Bottom 11%'],
  [901, 1000, 'bottom10', 'Bottom 10%'],
  [999, 1000, 'bottom10', 'Bottom 0.2%'],
  [1000, 1000, 'last', 'Last place'],
  [32, 1080, 'top5', 'Top 3%'],
  [155, 287, 'lower50', 'Bottom 47%'],
  [1, 100000, 'top1', 'Top 0.1%'],
]) {
  const standing = rankStanding(rank, total);
  assertEq(rank + '/' + total + ' band', standing.band, band);
  assertEq(rank + '/' + total + ' has no podium', 'podium' in standing, false);
  assertEq(rank + '/' + total + ' percentage label', standing.label, label);
}

assertEq('middle placement wording is shared by the recent summary',
  recentPlacementStanding([2], 3), 'Middle place');

{
  const ranks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 20, 21];
  const runs = recentPlacementRuns(ranks, 7);
  assertEq('runs join consecutive ranks across standing bands, apart from the current game',
    runs.map((run) => run.first + '-' + run.last).join(','),
    '1-6,7-7,8-12,20-21');
  assertEq('exactly one run identifies the current game',
    runs.filter((run) => run.current).map((run) => run.first).join(','), '7');
  assertEq('summary percentage range names Top once and the percent sign once',
    recentPlacementStanding([1, 2, 3, 10], 1000), 'Top 0.1 \u2013 1%');
  assertEq('same percentage labels are not repeated',
    recentPlacementStanding([11, 20], 1000), 'Top 2%');
  assertEq('history summary joins consecutive earlier ranks',
    recentPlacementRuns([1, 2, 3]).length, 1);
}

// Session summary: games and wins per board type in the window, and the
// session's best time ranked among that type's wins so far.
{
  const game = (endedAt, outcome, timeMs) => ({ endedAt, outcome, timeMs, actionEvaluations: [] });
  const historyByKey = {
    '30x16/99@standard': [game(1, 'win', 90000), game(50, 'loss', 1000), game(60, 'win', 95000)],
    '9x9/10@standard': [game(2, 'win', 5000), game(3, 'win', 4000), game(55, 'win', 4500),
      game(56, 'loss', 900), game(57, 'win', 4000), game(61, 'win', 100)],
    '8x8/10@standard': [game(4, 'win', 3000)],
    '9x9/10@standard+pink-noise(scale=12)': [game(58, 'loss', 700)],
  };
  const rows = sessionSummaryRows(historyByKey, 50, 60, ['9x9/10', '16x16/40', '30x16/99']);
  assertEq('types follow difficulty order, then key order; types without session games are absent',
    rows.map((row) => row.key).join(' '), '9x9/10@standard 9x9/10@standard+pink-noise(scale=12) 30x16/99@standard');
  const [beginner, pink, expert] = rows;
  assertEq('session games and wins, later games excluded', beginner.games + '/' + beginner.wins, '3/2');
  assertEq('the best is the session’s fastest win', beginner.best.record.endedAt, 57);
  assertEq('an equal earlier time ranks ahead of the session best', beginner.best.rank + '/' + beginner.best.total, '2/4');
  assertEq('a type without session wins has no best', pink.best, null);
  assertEq('window bounds are inclusive', expert.games + '/' + expert.wins, '2/1');
  assertEq('the lifetime pool ends with the window', expert.best.rank + '/' + expert.best.total, '2/2');
  assertEq('a history without the flag count is not a no-mark row', expert.noMark, false);
  assertEq('the latest session game names the type', pink.latest.endedAt, 58);
  assertEq('a loss without saved evidence is unjudged, as the after-game report files it; '
    + 'a win without a guess ledger is unmeasured',
    JSON.stringify(beginner.results), '{"win-unmeasured":2,"other":1}');
  assertEq('no misclicks without evidence', JSON.stringify(beginner.likelyMisclicks), '{}');
}

// Session summary results: each game files under its session result kind,
// and likely misclicks count separately.
{
  const fatal = (actionNumber, atMs, extra) => ({
    version: ACTION_EVALUATION_VERSION, action: 'reveal', actionNumber, atMs, result: 'death',
    selected: [1], alternatives: [],
    position: { width: 3, height: 1, mines: 1, cells: '1..' }, ...extra,
  });
  const provenMine = fatal(9, 5000, { mistakes: ['opened-proven-mine'],
    evidence: { safeAvailable: true, mineProofTier: 'counting', safeProofTier: 'whole-board' } });
  const shortChord = { version: ACTION_EVALUATION_VERSION, action: 'no-op', actionNumber: 8, atMs: 4700,
    result: 'continued', selected: [0], mistakes: ['no-op-click'], evidence: { reason: 'chord-short-of-flags' } };
  const slipLoss = { endedAt: 10, outcome: 'loss', actionEvaluations: [shortChord, provenMine] };
  const wrongFlagLoss = { endedAt: 11, outcome: 'loss', actionEvaluations: [fatal(4, 2000, {
    mistakes: ['opened-proven-mine', 'likely-misclick-after-wrong-flag'],
    evidence: { safeAvailable: true, mineProofTier: 'counting', safeProofTier: 'whole-board',
      likelyMisclick: { gapMs: 200 } } })] };
  const [row] = sessionSummaryRows({ '3x1/1@standard': [
    { endedAt: 9, outcome: 'win', timeMs: 900, actionEvaluations: [], guesses: 0 }, slipLoss, wrongFlagLoss,
    { endedAt: 12, outcome: 'loss', actionEvaluations: [] },
  ] }, 0, 20, []);
  assertEq('results sum to the games and use the session result kinds',
    JSON.stringify(row.results), '{"win-no-guess":1,"mine-counting":2,"other":1}');
  assertEq('each likely-misclick reason counts its losses',
    JSON.stringify(row.likelyMisclicks), '{"wrong-button":1,"wrong-flag":1}');
  assertEq('a row keeps the session games it counts', row.records.length, row.games);
  assertEq('a game’s places in the tree: its leaf’s kind and the misclick rows that recount it',
    JSON.stringify(sessionGameResult(slipLoss)), '{"kind":"mine-counting","likelyMisclicks":["wrong-button"]}');
  assertEq('a win is recounted by no misclick row',
    JSON.stringify(sessionGameResult(row.records[0])), '{"kind":"win-no-guess","likelyMisclicks":[]}');
  const lines = sessionResultLines([row]);
  assertEq('won and lost head the tree; a family shows only when one of its kinds occurred',
    lines.map((line) => line.depth + ' ' + line.label).join(' | '),
    '1 won | 2 no avoidable risk | 3 without guessing | 1 lost | 2 opened a proven mine'
      + ' | 3 counting single numbers proved it | 2 not judged');
  assertEq('a family sums every kind beneath it',
    lines.find((line) => line.label === 'opened a proven mine').kinds.join(),
    'mine-counting,mine-overlap,mine-whole-board,mine-safe,mine-forced');
  assertEq('a kind is a leaf', lines.find((line) => line.label === 'without guessing').leaf, true);
  assertEq('a family is not a leaf', lines.find((line) => line.label === 'won').leaf, false);
  assertEq('a session without losses still shows the lost row',
    sessionResultLines([{ results: { 'win-guess-early': 1 } }]).map((line) => line.label).join(' | '),
    'won | riskier guess than necessary | in the opening | lost');
}

// The session results tree holds every result kind exactly once: every win
// type, every loss type except the early-game guess (split by risk), the
// split and survived-guess kinds, the legacy verdicts, and unjudged.
{
  const kindsOf = (node) => (node.children ? node.children.flatMap(kindsOf) : [node.kind]);
  const treeKinds = SESSION_RESULT_TREE.flatMap(kindsOf);
  const expected = [...Object.keys(WIN_TYPE_LABELS),
    ...Object.keys(LOSS_TYPE_LABELS).filter((kind) => kind !== 'guess-early'),
    'guess-early-min', 'guess-early-higher', 'guess-early-unmeasured',
    'survived-guess-safe', 'survived-guess-higher', ...Object.keys(DEATH_KIND_LABELS), 'other'];
  assertEq('every result kind has one row', [...treeKinds].sort().join(), [...expected].sort().join());
  assertEq('no kind appears twice', new Set(treeKinds).size, treeKinds.length);
  const depthOf = (node) => (node.children ? 1 + Math.max(...node.children.map(depthOf)) : 1);
  assertEq('every tree level names its own share column',
    Math.max(...SESSION_RESULT_TREE.map(depthOf)), SESSION_RESULT_LEVELS.length);
  let thrown = null;
  try {
    sessionResultLines([{ results: { 'guess-early': 1 } }]);
  } catch (err) {
    thrown = err.message;
  }
  assertEq('a counted kind outside the tree fails loudly', thrown,
    'session results tree has no row for result kind guess-early');
}

// Abandoned boards (creator request 2026-10-20): the type's spans that left
// play by a restart, a trial's end, or a page closed in play, counted from
// when spans began recording how boards left play.
{
  vm.runInThisContext(fs.readFileSync(path.join(repo, 'play-limits.js'), 'utf8'));
  const keyOf = (span) => span.width + 'x' + span.height + '/' + span.mines + '@' + span.playMode;
  const span = (startedAt, ending, endedAt, lastSeenAt = endedAt, board = [9, 9, 10]) => ({
    startedAt, lastSeenAt, endedAt, width: board[0], height: board[1], mines: board[2], playMode: 'standard',
    ...(ending === undefined ? {} : { ending }) });
  const now = 1000000;
  const spans = [
    span(100, undefined, 150),
    span(200, 'restarted', 250),
    span(300, 'finished', 350),
    span(400, 'restarted', 450),
    span(500, 'trial-ended', 550),
    span(600, null, null, 650),
    span(700, 'restarted', 750, 750, [30, 16, 99]),
    span(800, null, null, now - 1000),
    span(900, 'restarted', 2000),
  ];
  assertEq('restarted, cut off by a trial, and closed in play count; finished, another type, a board still in play, '
    + 'one after the game shown, and one from before endings were recorded do not',
  JSON.stringify(sessionAbandonedCounts(spans, '9x9/10@standard', keyOf, 400, 1000, now)),
  '{"session":3,"lifetime":4,"recordedFrom":200}');
  assertEq('before any span records its ending, nothing counts and no start is known',
    JSON.stringify(sessionAbandonedCounts([span(100, undefined, 150)], '9x9/10@standard', keyOf, 0, 1000, now)),
    '{"session":0,"lifetime":0,"recordedFrom":null}');
}

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const NOW = 1000 * DAY;
const win = (endedAt, timeMs) => ({ outcome: 'win', endedAt, timeMs });
// A time-ranked list in its table order, as recentPlacementCandidates
// hands it to the summary.
const ranked = (wins) => wins.slice().sort(compareRankedWins);
// The board wins with "ranks on other session boards" on: every session win.
const sessionBoards = (records, sourceStartMs) => recentPlacementBoardWins(records, null, sourceStartMs, true);
// A time-window candidate the way recentPlacementCandidates makes them: the
// window's own member wins plus its start for the strictly-longer rule.
const windowCandidate = (label, specificity, startMs, wins) =>
  ({ label, specificity, startMs, ranked: ranked(wins.filter((s) => s.endedAt >= startMs)) });

// Tablechart progressive disclosure: pinned lifetime and past week both
// survive even when identical, claim their member set from ordinary charts,
// and each remaining duplicate set keeps its most specific candidate.
{
  const a = win(NOW - 2 * HOUR, 20000);
  const b = win(NOW - HOUR, 10000);
  const kept = dedupeRankCandidates([
    { label: 'lifetime', specificity: 12, wins: [a, b] },
    { label: 'past week', specificity: 8, wins: [a, b] },
    { label: 'this month', specificity: 9, wins: [b, a] },
    { label: 'today', specificity: 4, wins: [b] },
    { label: 'past hour', specificity: 3, wins: [b] },
  ], ['lifetime', 'past week']);
  assertEq('pinned charts claim duplicate sets',
    kept.map((candidate) => candidate.label).join(','),
    'lifetime,past week,past hour');

  const shapeKept = dedupeRankCandidates([
    { label: 'max number ≤ 4', specificity: 4, wins: [a] },
    { label: 'max number ≤ 2', specificity: 2, wins: [a] },
  ]);
  assertEq('shape duplicate keeps most specific',
    shapeKept.map((candidate) => candidate.label).join(','), 'max number ≤ 2');

  const explicit = dedupeRankCandidates([
    { label: 'broad', dedupePriority: 8, summaryOrder: [0, 10], wins: [a] },
    { label: 'narrow', dedupePriority: 2, summaryOrder: [1, 20], wins: [a] },
  ]);
  assertEq('explicit dedupe priority is independent of summary priority',
    explicit.map((candidate) => candidate.label).join(','), 'narrow');
}

// 20 old wins at 20s..39s spread over past weeks, plus recent wins placed
// among them by solve time. Source window: the last hour.
{
  const old = [];
  for (let i = 0; i < 20; i++) old.push(win(NOW - 10 * DAY - i * HOUR, 20000 + i * 1000));
  const sourceStart = NOW - HOUR;
  // A recent win fastest of all: rank 1 lifetime (22 wins -> top tenth is
  // ranks 1-2). "past week" and "today" hold only the 2 recent wins — too
  // short a list for any top-tenth rank. Windows not strictly longer than
  // the source ("past hour" itself, "past 5 min") never report.
  const fast = win(NOW - 600e3, 10000);
  const mid = win(NOW - 120e3, 25500); // rank 8 of 22 lifetime: past the tenth
  const wins = [...old, fast, mid];
  const candidates = [
    { label: 'lifetime', specificity: 12, startMs: -Infinity, ranked: ranked(wins), alwaysShowBest: true },
    windowCandidate('past week', 8, NOW - 7 * DAY, wins),
    windowCandidate('today', 4, NOW - 5 * HOUR, wins),
    windowCandidate('past hour', 3, sourceStart, wins),
    windowCandidate('past 5 min', 1, NOW - 300e3, wins),
  ];
  const rows = recentPlacementsSummary(candidates, sourceStart);
  assertEq('one window reports', rows.length, 1);
  assertEq('lifetime label', rows[0].label, 'lifetime');
  assertEq('lifetime ranks', rows[0].ranks.join(','), '1');
  assertEq('lifetime total', rows[0].total, 22);
  assertEq('lifetime not a near miss', rows[0].nearMiss, false);
}

// Cutoff boundary: rank r qualifies only when r * 10 <= list length.
{
  const sourceStart = NOW - HOUR;
  const nine = [];
  for (let i = 0; i < 9; i++) nine.push(win(NOW - 2 * DAY - i * HOUR, 20000 + i * 1000));
  const recent = win(NOW - 60e3, 10000);
  const candidate = (wins) =>
    [windowCandidate('this month', 9, NOW - 20 * DAY, wins)];
  // 9 old + 1 recent fastest = 10 wins: rank 1 qualifies exactly.
  assertEq('rank 1 of 10 reported',
    recentPlacementsSummary(candidate([...nine, recent]), sourceStart)[0].ranks.join(','), '1');
  // 8 old + 1 recent fastest = 9 wins: nothing is within the top tenth.
  assertEq('9-win list reports nothing',
    recentPlacementsSummary(candidate([...nine.slice(0, 8), recent]), sourceStart).length, 0);
  // A recent win at rank 2 of 10 does not qualify (2 * 10 > 10).
  const second = win(NOW - 60e3, 20500);
  assertEq('rank 2 of 10 not reported',
    recentPlacementsSummary(candidate([...nine, second]), sourceStart).length, 0);
}

// A membership chart (weekend/weekday, same-3BV) has no startMs: it spans
// lifetime rather than an interval, so it reports regardless of the
// strictly-longer rule.
{
  const sourceStart = NOW - HOUR;
  const wins = [];
  for (let i = 0; i < 9; i++) wins.push(win(NOW - 3 * DAY - i * HOUR, 20000 + i * 1000));
  wins.push(win(NOW - 60e3, 10000));
  const rows = recentPlacementsSummary(
    [{ label: '3BV 25', specificity: 13, ranked: ranked(wins) }], sourceStart);
  assertEq('membership chart reports without a startMs', rows.length, 1);
  assertEq('membership ranks', rows[0].ranks.join(','), '1');
}

// Membership and ordering: only source-window wins report, ties break by
// earlier finish, and rows preserve the supplied category order.
{
  const sourceStart = NOW - HOUR;
  const wins = [];
  // 38 older wins this month at 30s+; the old rank-1 win predates the month.
  wins.push(win(NOW - 25 * DAY, 5000));
  for (let i = 0; i < 38; i++) wins.push(win(NOW - 15 * DAY + i * HOUR, 30000 + i * 1000));
  // Two recent wins: 6s (rank 2 lifetime, rank 1 month) and a 30s tie that
  // the older 30s win beats on earlier finish — the recent one takes rank
  // 3 of the month and rank 4 lifetime, both within their lists' top tenth
  // (40 and 41 wins reach ranks 4).
  wins.push(win(NOW - 30 * 60e3, 6000));
  wins.push(win(NOW - 10 * 60e3, 30000));
  const candidates = [
    { label: 'lifetime', specificity: 12, startMs: -Infinity, ranked: ranked(wins), alwaysShowBest: true },
    windowCandidate('this month', 9, NOW - 20 * DAY, wins),
  ];
  const rows = recentPlacementsSummary(candidates, sourceStart);
  assertEq('two windows report', rows.length, 2);
  assertEq('supplied lifetime category first', rows[0].label, 'lifetime');
  assertEq('lifetime ranks', rows[0].ranks.join(','), '2,4');
  assertEq('lifetime total', rows[0].total, 41);
  assertEq('month second', rows[1].label, 'this month');
  assertEq('month ranks', rows[1].ranks.join(','), '1,3');
  assertEq('month total', rows[1].total, 40);
}

// Summary filtering preserves the canonical category order supplied by the
// candidate builder; pool sizes and duplicate priorities do not reorder it.
{
  const sourceStart = NOW - HOUR;
  const wins = [];
  for (let i = 0; i < 9; i++) wins.push(win(NOW - 2 * DAY - i * HOUR, 20000 + i * 1000));
  wins.push(win(NOW - 60e3, 10000));
  const rows = recentPlacementsSummary([
    { label: 'this month', specificity: 9, ranked: ranked(wins) },
    { label: 'lifetime', specificity: 12, ranked: ranked(wins), alwaysShowBest: true },
  ], sourceStart);
  assertEq('first supplied category stays first at equal pool size', rows[0].label, 'this month');
  assertEq('second supplied category stays second', rows[1].label, 'lifetime');

  const explicitRows = recentPlacementsSummary([
    { label: 'narrow', dedupePriority: 1, summaryOrder: [1, 10], ranked: ranked(wins) },
    { label: 'broad', dedupePriority: 9, summaryOrder: [0, 10], ranked: ranked(wins) },
  ], sourceStart);
  assertEq('summary filtering does not re-sort by duplicate priority',
    explicitRows.map((row) => row.label).join(','), 'narrow,broad');
}

// The summary identifies the rank belonging to the exact current record,
// including lifetime's near-miss path.
{
  const sourceStart = NOW - HOUR;
  const old = [];
  for (let i = 0; i < 19; i++) old.push(win(NOW - 2 * DAY - i * HOUR, 20000 + i * 1000));
  const current = win(NOW, 10000);
  const rows = recentPlacementsSummary([
    { label: 'lifetime', specificity: 12, ranked: ranked([...old, current]), alwaysShowBest: true },
  ], sourceStart, current);
  assertEq('current top rank identified', rows[0].currentRank, 1);

  const nearCurrent = win(NOW, 21500);
  const nearRows = recentPlacementsSummary([
    { label: 'lifetime', specificity: 12, ranked: ranked([...old, nearCurrent]), alwaysShowBest: true },
  ], sourceStart, nearCurrent);
  assertEq('current near-miss rank identified', nearRows[0].currentRank, 3);
}

// Lifetime's near-miss rule: with alwaysShowBest, a source-window win
// outside the top tenth still reports its single best rank, marked; with
// no source-window win at all, nothing reports.
{
  const sourceStart = NOW - HOUR;
  const old = [];
  for (let i = 0; i < 19; i++) old.push(win(NOW - 2 * DAY - i * HOUR, 20000 + i * 1000));
  const recent = win(NOW - 60e3, 21500); // rank 3 of 20; the tenth reaches rank 2
  const lifetime = (list) =>
    [{ label: 'lifetime', specificity: 12, startMs: -Infinity, ranked: ranked(list), alwaysShowBest: true }];
  const rows = recentPlacementsSummary(lifetime([...old, recent]), sourceStart);
  assertEq('near miss reports', rows.length, 1);
  assertEq('near miss flag', rows[0].nearMiss, true);
  assertEq('near miss rank', rows[0].ranks.join(','), '3');
  assertEq('near miss total', rows[0].total, 20);
  assertEq('no source win reports nothing',
    recentPlacementsSummary(lifetime(old), sourceStart).length, 0);
}

// By default only the shown win's board categories compete. With other
// session boards on, category discovery follows all wins in the selected
// period while the date categories and the full tablecharts retain their
// reference scope.
{
  const now = new Date(2026, 8, 21, 12).getTime(); // Monday in the viewer's timezone.
  const start = startOfDay(now);
  const low = { bv3: 40, zini: 30, maxAdjacent: 2, hasSeven: false,
    islandCount: 7, largestIsland: 9, zeroCount: 80 };
  const high = { bv3: 41, zini: 31, maxAdjacent: 8, hasSeven: true,
    islandCount: 8, largestIsland: 10, zeroCount: 70 };
  const old = [low, high].flatMap((shape, group) =>
    Array.from({ length: 20 }, (_, i) => ({ ...shape,
      ...win(now - (60 + i + group * 20) * DAY, 30000 + i * 100) })));
  const earlier = { ...high, ...win(now - 2 * HOUR, 10000) };
  const current = { ...low, ...win(now, 15000) };
  const unmeasured = win(now - 30 * DAY, 5000);
  const wins = [...old, unmeasured, earlier, current];
  const thisBoard = recentPlacementsSummary(recentPlacementCandidates(wins, now, start,
    recentPlacementBoardWins(wins, current.endedAt, start, false), false), start, current);
  for (const label of ['3BV 40', 'ZiNi 30', 'max number 2', 'max number ≤ 2', 'islands 7',
    'largest island 9', 'zeros 80']) {
    assertEq(label + ' of this win is listed by default',
      thisBoard.find((row) => row.label === label).ranks.join(','), '1');
  }
  for (const label of ['3BV 41', 'ZiNi 31', 'max number 8', 'has an 8', 'has a 7',
    'islands 8', 'largest island 10', 'zeros 70']) {
    assertEq(label + ' of an earlier session board is not listed by default',
      thisBoard.some((row) => row.label === label), false);
  }
  assertEq('time windows still report the earlier session win by default',
    thisBoard.find((row) => row.label === 'lifetime').ranks.join(','), '2,3');
  assertEq('a loss shown without any win supplies no board categories',
    recentPlacementBoardWins([{ outcome: 'loss', endedAt: now, bv3: 40 }], now, start, false).length, 0);
  const candidates = recentPlacementCandidates(wins, now, start, sessionBoards(wins, start), false);
  const rows = recentPlacementsSummary(candidates, start, current);
  for (const label of ['3BV 40', '3BV 41', 'ZiNi 30', 'ZiNi 31',
    'max number 2', 'max number 8', 'has an 8', 'has a 7',
    'max number ≤ 2', 'max number ≤ 3', 'max number ≤ 4', 'islands 7', 'islands 8',
    'largest island 9', 'largest island 10', 'zeros 70', 'zeros 80']) {
    const row = rows.find((candidate) => candidate.label === label);
    assertEq(label + ' represented despite a different latest board', row !== undefined, true);
    assertEq(label + ' compares against full historical pool', row.total, 21);
    assertEq(label + ' earlier source win still ranks first', row.ranks.join(','), '1');
  }
  assertEq('older category result is not marked current',
    rows.find((row) => row.label === '3BV 41').currentRank, undefined);
  assertEq('latest category result is marked current',
    rows.find((row) => row.label === '3BV 40').currentRank, 1);
  const shapes = boardShapeCandidates([earlier, current], wins);
  assertEq('exact-value shapes have distinct identities',
    new Set(shapes.map((candidate) => candidate.id)).size, shapes.length);
  assertEq('full tablecharts remain specific to current board',
    boardShapeCandidates([current], wins).some((candidate) => candidate.label === 'has an 8'), false);
  assertEq('full tablechart membership still covers all history',
    boardShapeCandidates([current], wins).find((candidate) => candidate.label === 'islands 7').rows.length, 21);
  const short = recentPlacementCandidates(wins, now, now - HOUR, sessionBoards(wins, now - HOUR), false);
  assertEq('shorter selection removes earlier 3BV category',
    short.some((candidate) => candidate.label === '3BV 41'), false);
  assertEq('shorter selection removes earlier shape category',
    short.some((candidate) => candidate.label === 'has an 8'), false);
  const week = recentPlacementCandidates(wins, now, startOfDay(now, 6),
    sessionBoards(wins, startOfDay(now, 6)), false);
  assertEq('current weekday category kept',
    week.some((candidate) => candidate.label === 'on Mondays'), true);
  assertEq('current weekday class kept',
    week.some((candidate) => candidate.label === 'on weekdays'), true);
  assertEq('other weekday classes not added',
    week.some((candidate) => candidate.label === 'on weekends'), false);
  assertEq('other weekdays not added',
    week.some((candidate) => candidate.label === 'on Sundays'), false);
  const collapsed = recentPlacementCandidates(wins, now, start, sessionBoards(wins, start), true);
  assertEq('collapse keeps both distinct 3BV values',
    collapsed.filter((candidate) => candidate.label.startsWith('3BV ')).length, 2);
  assertEq('collapse keeps independent ZiNi benchmarks',
    collapsed.filter((candidate) => candidate.label.startsWith('ZiNi ')).length, 2);
  assertEq('collapse keeps exact maximum clues identifiable beside caps',
    collapsed.filter((candidate) => /^max number \d/.test(candidate.label)).length, 2);
  assertEq('earlier ZiNi does not acquire current-game marker',
    rows.find((row) => row.label === 'ZiNi 31').currentRank, undefined);
  assertEq('shorter window removes earlier ZiNi category',
    short.some((candidate) => candidate.label === 'ZiNi 31'), false);
  const anotherEarlier = { ...high, ...win(now - HOUR, 12000) };
  const multipleWins = [...wins, anotherEarlier];
  const multipleRows = recentPlacementsSummary(
    recentPlacementCandidates(multipleWins, now, start, sessionBoards(multipleWins, start), true), start, current);
  assertEq('all qualifying earlier ranks at another 3BV remain listed',
    multipleRows.find((row) => row.label === '3BV 41').ranks.join(','), '1,2');
  assertEq('current 3BV remains listed beside earlier 3BV ranks',
    multipleRows.find((row) => row.label === '3BV 40').ranks.join(','), '1');
  assertEq('collapse still merges identical shape member sets',
    collapsed.some((candidate) => candidate.label === 'has a 7'), false);
  const noRecent = recentPlacementCandidates(old, now, start, sessionBoards(old, start), false);
  assertEq('no recent wins creates no shape or 3BV candidates',
    noRecent.some((candidate) => candidate.label.startsWith('3BV ')
      || candidate.label.startsWith('max ')), false);
  assertEq('no recent wins keeps empty summary behavior',
    recentPlacementsSummary(noRecent, start).length, 0);
}

{
  const five = { ...win(NOW, 30000), bv3: 40, zini: 30, maxAdjacent: 5 };
  const six = { ...win(NOW - DAY, 10000), bv3: 40, zini: 31, maxAdjacent: 6 };
  const absent = win(NOW - 2 * DAY, 5000);
  const candidates = boardMetricCandidates([five], [six, absent, five]);
  assertEq('same-ZiNi excludes other values and unmeasured history',
    candidates.find((c) => c.label === 'ZiNi 30').wins.length, 1);
  assertEq('maximum clue is exact, not an upper bound',
    candidates.find((c) => c.label === 'max number 5').wins[0], five);
  assertEq('maximum clue table excludes higher and unmeasured clues',
    candidates.find((c) => c.label === 'max number 5').wins.length, 1);
  assertEq('unmeasured reference creates no benchmark tables',
    boardMetricCandidates([absent], [five, six, absent]).length, 0);
}

{
  const measured = (hzini, spread) => ({ hzini, boardMetrics: { version: 1, workSpread: spread } });
  const a = measured(5, 3.2), b = measured(6, 2.1);
  const old = [a, b].flatMap((measurements, group) => Array.from({ length: 20 }, (_, i) => ({
    ...win(NOW - (30 + group * 20 + i) * DAY, 10000 + i * 100), ...measurements,
  })));
  const earlier = { ...win(NOW - 1000, 9000), ...a };
  const current = { ...win(NOW, 9000), ...b };
  const records = [...old, earlier, current];
  const rows = recentPlacementsSummary(recentPlacementCandidates(records, NOW, NOW - 60000,
    sessionBoards(records, NOW - 60000), true), NOW - 60000, current);
  for (const label of ['HZiNi 5', 'HZiNi 6', '3BV spread 2.75–3.25 cells', '3BV spread 1.75–2.25 cells']) {
    assertEq('period summary retains every qualifying measured family: ' + label,
      rows.find((row) => row.label === label).ranks.join(','), '1');
  }
  assertEq('earlier HZiNi retains its own category', rows.find((r) => r.label === 'HZiNi 5').currentRank, undefined);
  const historical = { ...win(NOW - DAY, 12000), hzini: 6 };
  const research = { ...win(NOW - DAY, 14000), boardMetrics: { ...b.boardMetrics,
    chord: { status: 'exact', lower: 6, upper: 6 },
    logic: { status: 'complete', lower: 2, upper: 2 } } };
  const families = boardMetricCandidates([current, research], [...records, historical, research]);
  assertEq('existing HZiNi records enter without new board measurements',
    families.find((c) => c.label === 'HZiNi 6').wins.length, 22);
  assertEq('retired research does not create time tables',
    families.some((c) => /minimum clicks|RCW/.test(c.label)), false);
  assertEq('exact half-cell value keeps its centered group',
    boardMetricCandidates([{ ...current, boardMetrics: { ...b.boardMetrics, workSpread: 2.5 } }], records)
      .find((c) => c.label.startsWith('3BV spread')).label, '3BV spread 2.25–2.75 cells');
}

{
  const measured = (zeroOpenedZeroOneCells, zeroOpenedCells) => ({ version: 1, workSpread: 2,
    safeCells: 71, zeroOpenedZeroOneCells, zeroOpenedCells });
  const a = measured(51, 57), b = measured(50, 56);
  const old = [a, b].flatMap((boardMetrics, group) => Array.from({ length: 20 }, (_, i) => ({
    ...win(NOW - (30 + group * 20 + i) * DAY, 10000 + i * 100), boardMetrics,
  })));
  const earlier = { ...win(NOW - 1000, 9000), boardMetrics: a };
  const current = { ...win(NOW, 9000), boardMetrics: b };
  const unmeasured = { ...win(NOW - DAY, 5000), boardMetrics: { version: 1, workSpread: 2 } };
  const future = { ...win(NOW - DAY, 6000), boardMetrics: { ...b, version: 2 } };
  const records = [...old, unmeasured, future, earlier, current];
  const rows = recentPlacementsSummary(recentPlacementCandidates(records, NOW, NOW - 60000,
    sessionBoards(records, NOW - 60000), true), NOW - 60000, current);
  for (const label of ['0–1 share 72%', '0–1 share 70%',
    'zero-opening coverage 80%', 'zero-opening coverage 79%']) {
    const row = rows.find((r) => r.label === label);
    assertEq(label + ' retains qualifying earlier values', row.ranks.join(','), '1');
    assertEq(label + ' excludes absent and unknown-version measurements', row.total, 21);
  }
  assertEq('older fractional category is not marked current',
    rows.find((r) => r.label === '0–1 share 72%').currentRank, undefined);
  const tables = boardMetricCandidates([current], records);
  const obsolete = { ...current, boardMetrics: { version: 1, workSpread: 2,
    safeCells: 71, zeroOneCells: 50, zeroOpenedCells: 56 } };
  const obsoleteTables = boardMetricCandidates([obsolete], [obsolete]);
  assertEq('obsolete whole-board count never creates a corrected 0–1 table',
    obsoleteTables.some((t) => t.setting === 'zeroOneShareTable'), false);
  assertEq('unchanged zero-opening coverage remains available before backfill',
    obsoleteTables.some((t) => t.setting === 'zeroOpeningTable'), true);
  assertEq('obsolete count cannot enter a corrected comparison pool',
    boardMetricCandidates([current], [...records, obsolete])
      .find((t) => t.setting === 'zeroOneShareTable').wins.length, 21);
  assertEq('full fraction table matches this board only',
    tables.some((t) => t.label === '0–1 share 72%'), false);
  assertEq('nearby fractions merge into the same whole-percent group',
    boardMetricCandidates([
      { boardMetrics: { ...a, safeCells: 100000, zeroOpenedZeroOneCells: 50000 } },
      { boardMetrics: { ...a, safeCells: 100000, zeroOpenedZeroOneCells: 50001 } },
    ], []).filter((t) => t.label.startsWith('0–1 share')).map((t) => t.label).join(','),
    '0–1 share 50%');
  assertEq('zero coverage is measured, not absent',
    boardFractionOf({ boardMetrics: measured(30, 0) }, 'zeroOpenedCells'), 0);
}

// Centered rounding boundaries and merged comparison pools. Use integer
// counts at half-percent ties so binary ratio error cannot flip membership.
for (let percent = 0; percent < 100; percent++) {
  for (const field of ['zeroOpenedZeroOneCells', 'zeroOpenedCells']) {
    const record = { boardMetrics: { version: 1, safeCells: 200,
      [field]: 2 * percent + 1 } };
    assertEq(field + ' exact half-percent tie at ' + percent,
      boardShareGroup(record, field), percent + 1);
  }
}
for (const [n, expected] of [[0, 0], [499, 0], [500, 1], [50499, 50],
  [50500, 51], [99499, 99], [99500, 100], [100000, 100]]) {
  assertEq('whole-percent boundary ' + n,
    boardShareGroup({ boardMetrics: { version: 1, safeCells: 100000, zeroOpenedZeroOneCells: n } }, 'zeroOpenedZeroOneCells'), expected);
}
for (const [spread, expected] of [[0, 0], [0.24999999999, 0], [0.25, 0.5],
  [1.24999999999, 1], [1.25, 1.5], [2.5, 2.5], [2.74999999999, 2.5], [2.75, 3]]) {
  assertEq('nearest half-cell boundary ' + spread,
    boardSpreadGroup({ boardMetrics: { version: 1, workSpread: spread } }), expected);
}
{
  const measurements = (n, spread) => ({ version: 1, safeCells: 100000,
    zeroOpenedZeroOneCells: n, zeroOpenedCells: n, workSpread: spread });
  const earlier = { ...win(NOW - 1000, 8000), boardMetrics: measurements(50000, 2.3) };
  const current = { ...win(NOW, 9000), boardMetrics: measurements(50499, 2.7) };
  const old = Array.from({ length: 20 }, (_, i) => ({
    ...win(NOW - (30 + i) * DAY, 10000 + i * 100),
    boardMetrics: measurements(i % 2 ? 50000 : 50499, i % 2 ? 2.3 : 2.7),
  }));
  const outside = { ...win(NOW - DAY, 1000), boardMetrics: measurements(50500, 2.75) };
  const records = [...old, outside, earlier, current];
  const before = JSON.stringify(records);
  const full = boardMetricCandidates([current], records);
  const rows = recentPlacementsSummary(recentPlacementCandidates(records, NOW, NOW - 60000,
    recentPlacementBoardWins(records, current.endedAt, NOW - 60000, false), true), NOW - 60000, current);
  for (const label of ['0–1 share 50%', 'zero-opening coverage 50%', '3BV spread 2.25–2.75 cells']) {
    assertEq(label + ' table merges nearby values and excludes next group',
      full.find((c) => c.label === label).wins.length, 22);
    const row = rows.find((r) => r.label === label);
    assertEq(label + ' summary shares the table pool', row.total, 22);
    assertEq(label + ' preserves earlier and current qualifying ranks', row.ranks.join(','), '1,2');
    assertEq(label + ' marks only the current rank', row.currentRank, 2);
  }
  assertEq('grouping leaves recorded measurements unchanged', JSON.stringify(records), before);
}

// A long period must stay navigable when comparison-pool sizes differ,
// grow, or arrive in another history order. Every family remains contiguous
// and values sort numerically, including one-/two-digit and half-cell values.
{
  const now = new Date(2026, 8, 21, 12).getTime();
  const sourceStart = now - HOUR;
  const shapes = [
    { bv3: 74, zini: 51, hzini: 49, maxAdjacent: 8, hasSeven: true,
      islandCount: 26, largestIsland: 10, zeroCount: 71,
      boardMetrics: { version: 1, workSpread: 7, safeCells: 100, zeroOpenedZeroOneCells: 80, zeroOpenedCells: 90 } },
    { bv3: 55, zini: 49, hzini: 46, maxAdjacent: 2, hasSeven: false,
      islandCount: 9, largestIsland: 3, zeroCount: 9,
      boardMetrics: { version: 1, workSpread: 6, safeCells: 100, zeroOpenedZeroOneCells: 9, zeroOpenedCells: 10 } },
    { bv3: 60, zini: 50, hzini: 48, maxAdjacent: 7, hasSeven: true,
      islandCount: 20, largestIsland: 5, zeroCount: 62,
      boardMetrics: { version: 1, workSpread: 6.5, safeCells: 100, zeroOpenedZeroOneCells: 72, zeroOpenedCells: 80 } },
  ];
  const old = shapes.flatMap((shape, group) => Array.from({ length: [79, 39, 19][group] }, (_, i) => ({
    ...shape, ...win(now - (35 + i * 7) * DAY - group, 20000 + i * 100),
  })));
  const recent = shapes.map((shape, group) => ({ ...shape, ...win(now - group * 1000, 10000 + group * 100) }));
  const records = [...old, ...recent];
  const expected = ['3BV 55', '3BV 60', '3BV 74',
    'ZiNi 49', 'ZiNi 50', 'ZiNi 51', 'HZiNi 46', 'HZiNi 48', 'HZiNi 49',
    '3BV spread 5.75–6.25 cells', '3BV spread 6.25–6.75 cells', '3BV spread 6.75–7.25 cells',
    'max number 2', 'max number 7', 'max number 8', 'has a 7', 'has an 8',
    'max number ≤ 2', 'max number ≤ 3', 'max number ≤ 4', 'islands 9', 'islands 20', 'islands 26',
    'largest island 3', 'largest island 5', 'largest island 10',
    'zeros 9', 'zeros 62', 'zeros 71', '0–1 share 9%', '0–1 share 72%', '0–1 share 80%',
    'zero-opening coverage 10%', 'zero-opening coverage 80%', 'zero-opening coverage 90%'];
  const summarize = (history, collapse) => recentPlacementsSummary(
    recentPlacementCandidates(history, now, sourceStart, sessionBoards(history, sourceStart), collapse),
    sourceStart, recent[0]);
  const rows = summarize(records, false);
  assertEq('all board families are stable and numeric in a long period',
    rows.filter((row) => row.summaryOrder[0] >= 3).map((row) => row.label).join('|'), expected.join('|'));
  assertEq('lifetime remains first', rows[0].label, 'lifetime');
  assertEq('pool sizes do not reorder 3BV values',
    rows.filter((row) => row.label.startsWith('3BV ') && !row.label.startsWith('3BV spread'))
      .map((row) => row.total).join(','), '40,20,80');
  for (let i = 1; i < rows.length; i++) {
    assertEq('numeric category order at row ' + i,
      rows[i - 1].summaryOrder[0] < rows[i].summaryOrder[0]
      || (rows[i - 1].summaryOrder[0] === rows[i].summaryOrder[0]
        && rows[i - 1].summaryOrder[1] <= rows[i].summaryOrder[1]), true);
  }
  for (const collapse of [false, true]) {
    const normal = summarize(records, collapse);
    const reversed = summarize([...records].reverse(), collapse);
    assertEq('history order does not change categories, collapse=' + collapse,
      normal.map((r) => r.label).join('|'), reversed.map((r) => r.label).join('|'));
    const grown = summarize([...records, ...Array.from({ length: 100 }, (_, i) => ({
      ...shapes[2], ...win(now - (84 + i * 7) * DAY - 500, 30000 + i),
    }))], collapse);
    assertEq('growing another comparison pool does not move categories, collapse=' + collapse,
      grown.filter((r) => normal.some((before) => before.label === r.label)).map((r) => r.label).join('|'),
      normal.filter((r) => grown.some((after) => after.label === r.label)).map((r) => r.label).join('|'));
    assertEq('current record keeps its placement after sorting, collapse=' + collapse,
      normal.find((r) => r.label === '3BV 74').currentRank, 1);
  }
}

// Day-of-month comparisons apply to every date, across months and years,
// using local finish dates. They are lifetime membership charts, not windows.
for (let day = 1; day <= 31; day++) {
  const at = (year, month, date, hour = 12) => new Date(year, month, date, hour).getTime();
  const reference = at(2026, 0, day);
  const column = rankColumns(reference).find((c) => c.id === 'month-date');
  assertEq('day-of-month label ' + day, column.label, 'on the ' + ordinal(day));
  assertEq('date category has lifetime membership ' + day, column.startMs, undefined);
  for (const [year, month] of [[2024, 11], [2025, 2], [2026, 0]]) {
    assertEq('same date across month/year ' + [year, month, day].join('/'),
      column.filter(win(at(year, month, day), 10000)), true);
  }
  const midnight = at(2026, 0, day, 0);
  assertEq('previous local date excluded ' + day, column.filter(win(midnight - 1, 9000)), false);
  assertEq('local midnight included ' + day, column.filter(win(midnight, 9000)), true);
  assertEq('different local date excluded ' + day,
    column.filter(win(at(2026, 0, day === 31 ? 1 : day + 1), 9000)), false);
}
{
  const now = new Date(2024, 1, 29, 12).getTime();
  const column = rankColumns(now).find((c) => c.id === 'month-date');
  const previous = Array.from({ length: 20 }, (_, i) =>
    win(new Date(2023, 0, 29, 12, i).getTime(), 20000 + i));
  const current = win(now, 10000);
  const otherDate = win(new Date(2024, 1, 28, 12).getTime(), 1000);
  assertEq('leap-day label is the 29th', column.label, 'on the 29th');
  const row = recentPlacementsSummary(
    recentPlacementCandidates([...previous, otherDate, current], now, now - HOUR, [current], false),
    now - HOUR, current).find((r) => r.label === 'on the 29th');
  assertEq('day-of-month summary compares all earlier months', row.total, 21);
  assertEq('day-of-month summary preserves current placement', row.currentRank, 1);
}

// Streak lists report like the other lists, in their own table order
// (longer first; an equal streak after the earlier one): a streak is earned
// at its last win, so one
// the session continued counts at its full length, and one that ended before
// the session never reports, however high it ranks. Losses carry only what
// the streaks read.
{
  const sourceStart = NOW - HOUR;
  const records = [];
  let at = NOW - 10 * DAY;
  const add = (outcome) => {
    at += 60e3;
    records.push(outcome === 'win' ? { ...win(at, 30000), bv3: 40 } : { outcome, endedAt: at });
  };
  for (let i = 0; i < 6; i++) add('win');
  add('loss');
  for (let i = 0; i < 28; i++) { add('win'); add('loss'); }
  // Two wins before the session, three in it, then a loss and the current run.
  at = sourceStart - 3 * 60e3;
  for (let i = 0; i < 5; i++) add('win');
  add('loss');
  add('win');
  const current = { ...win(NOW, 30000), bv3: 40 };
  records.push(current);
  const rows = recentPlacementsSummary(recentPlacementCandidates(records, NOW, sourceStart, [current], true),
    sourceStart, current);
  const row = (label) => {
    const found = rows.find((r) => r.label === label);
    return found.ranks.join(',') + ' of ' + found.total + ', current ' + found.currentRank;
  };
  // Streaks: 6 (before the session), 5 (continued into it), 2 (current), 28 single wins.
  assertEq('a streak the session continued reports beside the current one',
    row('streak'), '2,3 of 31, current 3');
  // Near-streaks: the earlier 7 holds first, the equal current 7 is second,
  // then the 6.
  assertEq('an equal near-streak ranks after the earlier one',
    row('near-streak'), '2,3 of 30, current 2');
  // Near-near-streaks: 8 (before), 8 (current), 7: the tenth of 29 stops at 2.
  assertEq('near-near-streak keeps the top-tenth cutoff',
    row('near-near-streak'), '2 of 29, current 2');
  assertEq('a history view marks no current streak',
    recentPlacementsSummary(recentPlacementCandidates(records, NOW, sourceStart, [current], true), sourceStart)
      .filter((r) => r.label.includes('streak')).every((r) => r.currentRank === undefined), true);
  const candidates = recentPlacementCandidates(records, NOW, sourceStart, [current], false);
  const labels = candidates.map((c) => c.label);
  const first = labels.indexOf('streak');
  assertEq('streak lists keep their table order',
    labels.slice(first, first + 3).join(','), 'streak,near-streak,near-near-streak');
  assertEq('time windows and day categories precede the streak lists',
    candidates.slice(0, first).every((c) => c.summaryOrder[0] <= 1), true);
  assertEq('board families follow the streak lists', labels.slice(first + 3).join(','), '3BV 40');
  assertEq('a session without wins earns no streak',
    recentPlacementsSummary(recentPlacementCandidates(records, NOW, NOW + 1, [current], true), NOW + 1).length, 0);
}

// No-mark is a way of winning the current board, not a mode. A no-mark win's
// comparisons keep only no-mark games, and the lifetime list is named for them.
{
  const marked = { outcome: 'win', endedAt: NOW - 1000, timeMs: 10000, flagsPlaced: 3, bv3: 10 };
  const markless = { outcome: 'win', endedAt: NOW, timeMs: 12000, flagsPlaced: 0, bv3: 10 };
  const marklessLoss = { outcome: 'loss', endedAt: NOW - 500, flagsPlaced: 0, timeMs: 4000 };
  const all = [marked, marklessLoss, markless];
  assertEq('a no-mark win compares only with no-mark games',
    noMarkComparison(markless, all).map((r) => r.endedAt).join(','), (NOW - 500) + ',' + NOW);
  assertEq('a marked win keeps the shared list', noMarkComparison(marked, all).length, 3);
  assertEq('a no-mark loss keeps the shared list', noMarkComparison(marklessLoss, all).length, 3);
  const labels = recentPlacementCandidates([marked, markless], NOW, startOfDay(NOW, 6), [markless], false,
    'top expert no-mark times').map((c) => c.label);
  assertEq('lifetime names the no-mark list', labels.includes('top expert no-mark times'), true);
  assertEq('the shared lifetime name is not also shown', labels.includes('lifetime'), false);
  assertEq('other windows name the no-mark pool', labels.includes('past week · no-mark'), true);
  assertEq('streaks name the no-mark pool', labels.includes('no-mark streak'), true);
  const shared = recentPlacementCandidates([marked, markless], NOW, startOfDay(NOW, 6), [markless], false)
    .map((c) => c.label);
  assertEq('without the label the shared names stay', shared.includes('lifetime') && shared.includes('streak'), true);
  const marklessOnly = (endedAt, timeMs) => ({
    endedAt, outcome: 'win', timeMs, flagsPlaced: 0, actionEvaluations: [],
  });
  const [row] = sessionSummaryRows({
    '30x16/99@standard': [marklessOnly(10, 80000), marklessOnly(20, 70000)],
  }, 10, 20, ['30x16/99']);
  assertEq('a no-mark history row is no-mark', row.noMark, true);
  assertEq('its lifetime rank counts only those wins', row.best.rank + '/' + row.best.total, '1/2');
  const [mixed] = sessionSummaryRows({
    '30x16/99@standard': [
      { endedAt: 10, outcome: 'win', timeMs: 50000, flagsPlaced: 4, actionEvaluations: [] },
      marklessOnly(20, 70000),
    ],
  }, 10, 20, ['30x16/99']);
  assertEq('a marked win in the same key keeps the shared row', mixed.noMark, false);
  assertEq('the shared row still ranks the faster marked win first', mixed.best.rank + '/' + mixed.best.total, '1/2');
}

console.log(`recent-placements: all ${checks} checks passed`);

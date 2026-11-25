'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
vm.runInThisContext(fs.readFileSync(require('node:path').join(__dirname, '..', 'game-data.js'), 'utf8'));
const now = new Date(2026, 8, 23, 0, 30).getTime();
const current = { endedAt: now, outcome: 'win', timeMs: 30000, bv3: 60, boardChangingClicks: 80,
  noOpClicks: 2, misclicks: 0, fastclickGapMs: 200, fastclickGapVersion: GameData.FASTCLICK_GAP_VERSION, mousePathPx: 600 };
const records = [
  { ...current, endedAt: now - 25 * 3600000, timeMs: 10000 },
  { ...current, endedAt: now - 2 * 3600000, timeMs: 20000, misclicks: 1 },
  { ...current, endedAt: now - 30 * 60000, timeMs: 40000, fastclickGapMs: undefined },
  { ...current, endedAt: now - 5 * 60000, outcome: 'loss', timeMs: 15000, misclicks: 1 },
  current,
  { ...current, endedAt: now + 1000, timeMs: 1000 },
];
const on = (selection) => Object.keys(selection).filter((id) => selection[id]);
assert.deepEqual(on(GameData.defaults), ['time', 'misclickRate', 'fastclickGap', 'flagChordGap', 'bvPerSecond',
  'clickRate', 'noopRate', 'boardChangingClickShare', 'mouseSpeed', 'timeBeforeMove', 'easyWorkLeftShare', 'unusedFlagShare', 'unflaggedMineShare'],
  'the creator’s defaults, plus the requested unflagged mine share, move habits, and flag→chord gap');
const board = { width: 9, height: 9, mines: 10 };
assert.deepEqual(GameData.rows(current, records, GameData.defaultsForView, board).map((r) => r.id), ['time.all',
  'misclickRate.all', 'fastclickGap.all', 'bvPerSecond.all', 'clickRate.all',
  'noopRate.all', 'boardChangingClickShare.all', 'mouseSpeed.all'],
  'default pool ranks each shown measurement against all games; unmeasured flag measurements are absent');
const all = Object.fromEntries(GameData.metrics.map((m) => [m.id, true]));
const none = Object.fromEntries(GameData.metrics.map((m) => [m.id, false]));
const allMetrics = { ...GameData.defaultsForView, gameDataMetrics: all };
const allRows = GameData.rows(current, records, allMetrics, board);
const sessionRows = GameData.rows(current, records, { ...allMetrics, gameDataPool: 'session' }, board);
const row = (id) => allRows.find((r) => r.id === id) || sessionRows.find((r) => r.id === id);
assert.equal(row('time.all').name, 'time');
assert.equal(row('time.all').metricId, 'time');
assert.equal(row('time.all').scope, 'all');
assert.equal(row('time.all').poolLabel, 'all games');
assert.equal(row('time.session').scope, 'session');
assert.equal(row('time.session').poolLabel, 'session');
assert.equal(row('time.all').rank, 3);
assert.equal(row('time.all').percentile, 100 * 2 / 3, '100 × (rank − 1) ÷ (count − 1)');
assert.equal(row('time.session').percentile, 0, 'the best in the pool is 0%');
assert.equal(row('time.all').total, 4, 'future games and losses cannot enter solve-time background');
assert.equal(row('time.session').total, 2);
assert.equal(row('time.all').valueText, '30.000s');
assert.equal(row('clickRate.session').total, 3, 'measured action rates include wins and losses');
assert.equal(row('efficiency.session').total, 2, 'completion ratios exclude incomplete boards');
assert.equal(row('fastclickGap.session').total, 2, 'missing is not zero');
assert.equal(row('misclickRate.session').rank, 1.5, 'equal rates share mean ordinal rank');
assert.deepEqual([row('misclickRate.session').firstRank, row('misclickRate.session').lastRank], [1, 2], 'a tie names its rank range');
assert.deepEqual([row('time.all').firstRank, row('time.all').lastRank], [3, 3]);
assert.equal(row('misclickRate.session').percentile, 25);
assert.equal(row('misclickRate.session').valueText, '0/min');
assert.equal(row('fastclickGap.session').percentile, 50, 'all-equal timing has neutral rank');
// A card states the rank alone (creator 2026-10-08): its label names the
// pool and the row shows the percentage, so no pool description ("so far
// with these board settings") and no arithmetic.
assert.equal(row('time.all').standingText, '3rd of 4 wins');
assert.equal(row('time.all').compactRankText, '3rd / 4');
assert.equal(row('misclickRate.session').standingText, 'tied 1st–2nd of 3 games');
assert.equal(row('misclickRate.session').compactRankText, '1st / 3 (tie)');
const midTarget = { ...current, endedAt: now, boardChangingClicks: 19, noOpClicks: 1 };
const midTieRows = GameData.rows(midTarget, [
  { ...current, endedAt: now - 180000, boardChangingClicks: 20, noOpClicks: 0 },
  { ...current, endedAt: now - 120000, boardChangingClicks: 19, noOpClicks: 1 },
  { ...current, endedAt: now - 60000, boardChangingClicks: 18, noOpClicks: 2 },
  midTarget,
], { ...allMetrics, gameDataMetrics: { ...none, boardChangingClickShare: true } }, board);
assert.equal(midTieRows.find((r) => r.id === 'boardChangingClickShare.all').compactRankText, '2nd / 4 (tie)',
  'tied ranks use farthest-up competition place with trailing (tie)');
assert.equal(midTieRows.find((r) => r.id === 'boardChangingClickShare.all').standingText, 'tied 2nd–3rd of 4 games',
  'hover card standing keeps full exact tie span');
assert.deepEqual([row('misclickRate.session').better, row('misclickRate.session').tiedOthers], [0, 1]);
assert.equal(row('fastclickGap.session').standingText, 'both games have this value');
assert.equal(row('fastclickGap.session').compactRankText, 'all 2');
const equalTimes = [{ ...current, endedAt: now - 60000 }, current];
assert.equal(GameData.rows(current, equalTimes, GameData.defaultsForView, board)[0].standingText, '2nd of 2 wins', 'an equal time set earlier ranks ahead');
const constant = GameData.rows(current, [1, 2, 3].map((i) => ({ ...current, endedAt: now - i * 60000 })).concat(current),
  { ...allMetrics, gameDataMetrics: { ...none, boardChangingClickShare: true } }, board);
assert.equal(constant.find((r) => r.id === 'boardChangingClickShare.all').standingText, 'all 4 games have this value');
assert([...allRows, ...sessionRows].every((r) => !/÷|=|settings|so far/.test(r.standingText)), 'no rank carries arithmetic or an obvious qualifier');
// A definition says only what the name and unit leave open; a measurement
// they already explain has none.
assert.deepEqual(GameData.metrics.filter((m) => m.help === undefined).map((m) => m.id),
  ['time', 'bvPerSecond', 'pathPer3bv', 'pathPerClick']);
assert(GameData.metrics.every((m) => m.help === undefined
  || (m.help.split(' ').length <= 40 && !m.help.toLowerCase().startsWith(m.name.toLowerCase()))),
  'every definition is short and never opens by repeating the name');
// The catalog's formulas are the only ones (docs/product/measurement-catalog.md),
// unmeasured where a fact is missing or the definition does not apply.
const formula = (id) => GameData.metrics.find((m) => m.id === id).value;
assert.equal(formula('boardChangingClickShare')({ boardChangingClicks: 19, noOpClicks: 1 }), 19 / 20);
assert.equal(formula('boardChangingClickShare')({ boardChangingClicks: 19 }), undefined, 'an unrecorded no-op count is unmeasured');
assert.equal(formula('efficiency')({ outcome: 'win', bv3: 10, boardChangingClicks: 19 }), 10 / 19);
assert.equal(formula('efficiency')({ outcome: 'loss', bv3: 10, boardChangingClicks: 19 }), undefined, 'a loss solved only part of its 3BV');
// A trial's given opening solved part of the board before the first click:
// performance divides only the 3BV the player solved. Trial games carry
// identityIndex, and those before givenOpening was recorded had an opening.
const givenWin = { outcome: 'win', bv3: 10, timeMs: 4000, boardChangingClicks: 12, noOpClicks: 0,
  zini: 8, hzini: 9, identityIndex: 0, givenOpening: true, givenOpeningBv3: 1 };
assert.equal(solvedBv3Of(givenWin), 9);
assert.equal(formula('bvPerSecond')(givenWin), 9 / 4);
assert.equal(formula('efficiency')(givenWin), 9 / 12);
assert.equal(formula('ioe')(givenWin), 9 / 12);
assert.equal(formula('ziniEfficiency')(givenWin), undefined, 'ZiNi counts the clicks from an unopened board');
assert.equal(formula('hziniEfficiency')(givenWin), undefined);
const { givenOpening, ...earlyTrialWin } = givenWin;
assert.equal(solvedBv3Of(earlyTrialWin), 9, 'a trial game from before givenOpening was recorded had an opening');
const { givenOpeningBv3, ...unmeasuredGivenWin } = givenWin;
assert.equal(formula('bvPerSecond')(unmeasuredGivenWin), undefined, 'the given opening\u2019s 3BV is not measured yet');
assert.equal(solvedBv3Of({ ...givenWin, givenOpening: false }), 10, 'a trial without an opening solved the whole board');
assert.equal(solvedBv3Of({ bv3: 10, givenOpening: true }), 10, 'only trial games have a given opening');
assert.equal(clicksOverBv3Of(givenWin), 3);
assert.equal(clicksOverBv3Of({ ...givenWin, outcome: 'loss' }), undefined);
assert.equal(formula('ios')({ outcome: 'win', bv3: 10, timeMs: 1000 }), undefined, 'IOS is unmeasured at 1 s or less');
assert.equal(formula('ios')({ outcome: 'win', bv3: 10, timeMs: 5000 }), Math.log(10) / Math.log(5));
assert.equal(formula('fastclickGap')({ fastclickGapMs: 140, fastclickGapVersion: 'planned-pairs-v1' }), 140);
assert.equal(formula('fastclickGap')({ fastclickGapMs: 300 }), undefined,
  'a value under the definition before planned pairs is another measurement');
assert.equal(formula('flagChordGap')({ flagsPlaced: 5, flagChordGapMs: 165 }), 165,
  'flag→chord gap is measured on flagged wins and losses');
assert.equal(formula('flagChordGap')({ flagsPlaced: 0, flagChordGapMs: 165 }), undefined,
  'no-mark games are unmeasured for flag→chord gap');
assert.equal(formula('flagChordGap')({ flagsPlaced: 5, flagsBlocked: true, flagChordGapMs: 165 }), undefined,
  'flag-blocked games are unmeasured for flag→chord gap');
assert.equal(formula('flagChordGap')({ flagsPlaced: 5 }), undefined,
  'flagged games with no qualifying flag→chord pair are unmeasured');
assert.equal(row('time.all').definition, undefined);
assert.equal(row('misclickRate.session').definition, GameData.metrics.find((m) => m.id === 'misclickRate').help,
  'every pool’s row carries its measurement’s definition');
assert.equal(GameData.rows({ ...current, outcome: 'loss' }, records).length, 0);
assert.deepEqual(GameData.rows(current, [current], allMetrics, board), [], 'one measured game produces no comparison rows in any scope');
const short = GameData.rows(current, records, { ...allMetrics, gameDataPool: 'session', sessionDefinition: 'past10min' }, board);
assert.equal(short.find((r) => r.id === 'time.session'), undefined, 'a session with only one win has no solve-time comparison');
assert.equal(short.find((r) => r.id === 'clickRate.session').total, 2, 'activity can compare a measured win and loss');
assert.equal(GameData.rows(current, records, { ...allMetrics, gameDataPool: 'all' }, board).find((r) => r.id === 'time.all').total, 4);
assert.throws(() => GameData.poolSpec('bogus'), /unknown game data pool/);

// Time-window pools share the rank tables' boundaries and draw on the all-games axis.
const olderGames = [
  { ...current, endedAt: new Date(2025, 11, 20, 12).getTime(), timeMs: 8000 },
  { ...current, endedAt: new Date(2026, 7, 15, 12).getTime(), timeMs: 12000 },
  { ...current, endedAt: new Date(2026, 8, 10, 12).getTime(), timeMs: 15000 },
  { ...current, endedAt: new Date(2026, 8, 20, 12).getTime(), timeMs: 18000 },
  ...records,
];
const windowRow = (poolId) => GameData.rows(current, olderGames,
  { ...allMetrics, gameDataMetrics: { ...none, time: true }, gameDataPool: poolId }, board)[0];
assert.equal(windowRow('past-hour').total, 2);
assert.equal(windowRow('past-hour').poolLabel, 'past hour');
assert.equal(windowRow('today').total, 2);
assert.equal(windowRow('today').poolLabel, 'today');
assert.equal(windowRow('past-week').total, 5, 'past week covers 7 calendar days including Sept 20 and Sept 21');
assert.equal(windowRow('past-week').poolLabel, 'past week');
assert.equal(windowRow('calendar-month').total, 6, 'this month adds Sept 10');
assert.equal(windowRow('calendar-month').poolLabel, 'this month');
assert.equal(windowRow('calendar-year').total, 7, 'in 2026 adds Aug 15');
assert.equal(windowRow('calendar-year').poolLabel, 'in 2026');
assert.equal(windowRow('rolling-year').total, 8, 'last 365 days adds Dec 2025');
assert.equal(windowRow('rolling-year').poolLabel, 'last 365 days');
assert.equal(windowRow('all').total, 8);
assert.deepEqual([windowRow('past-week').distribution.lo, windowRow('past-week').distribution.hi],
  [windowRow('all').distribution.lo, windowRow('all').distribution.hi],
  'time-window pools share the all-games distribution axis');

// Board-match pools scope perf metrics to boards matching one trait, using the
// same buckets as This board tables, and draw distributions on their own axis.
const bmCurrent = { ...current, timeMs: 30000, bv3: 60, zini: 40, hzini: 42, maxAdjacent: 5,
  islandCount: 10, largestIsland: 4, zeroCount: 20,
  boardMetrics: { version: 1, workSpread: 6.38, safeCells: 100, zeroOpenedZeroOneCells: 60, zeroOpenedCells: 69 } };
const bmRecords = [
  { ...bmCurrent, endedAt: now - 5 * 60000, timeMs: 10000, bv3: 30, zini: 20, hzini: 22, maxAdjacent: 3,
    islandCount: 5, largestIsland: 2, zeroCount: 40,
    boardMetrics: { version: 1, workSpread: 3.1, safeCells: 100, zeroOpenedZeroOneCells: 80, zeroOpenedCells: 90 } },
  { ...bmCurrent, endedAt: now - 4 * 60000, timeMs: 60000, bv3: 90, zini: 70, hzini: 72, maxAdjacent: 7,
    islandCount: 20, largestIsland: 8, zeroCount: 5,
    boardMetrics: { version: 1, workSpread: 9.8, safeCells: 100, zeroOpenedZeroOneCells: 30, zeroOpenedCells: 40 } },
  { ...bmCurrent, endedAt: now - 3 * 60000, timeMs: 28000, boardChangingClicks: 70,
    boardMetrics: { version: 1, workSpread: 6.62, safeCells: 100, zeroOpenedZeroOneCells: 60, zeroOpenedCells: 69 } },
  { ...bmCurrent, endedAt: now - 2 * 60000, outcome: 'loss', timeMs: 12000, boardChangingClicks: 60,
    boardMetrics: { version: 1, workSpread: 6.4, safeCells: 100, zeroOpenedZeroOneCells: 60, zeroOpenedCells: 69 } },
  bmCurrent,
];
const bv3Scoped = GameData.rows(bmCurrent, bmRecords,
  { ...allMetrics, gameDataMetrics: { ...none, time: true, clickRate: true }, gameDataPool: 'board:bv3' }, board);
const bv3Time = bv3Scoped.find((r) => r.metricId === 'time');
const bv3Clicks = bv3Scoped.find((r) => r.metricId === 'clickRate');
assert.equal(bv3Time.scope, 'board:bv3');
assert.equal(bv3Time.poolLabel, '3BV 60');
assert.equal(bv3Time.standingText, '2nd of 2 wins', 'wins-only metric compares matching wins');
assert.equal(bv3Clicks.standingText, '2nd of 3 games', 'all-outcome metric compares matching wins and losses');
const allBmTime = GameData.rows(bmCurrent, bmRecords,
  { ...allMetrics, gameDataMetrics: { ...none, time: true }, gameDataPool: 'all' }, board)[0];
assert(bv3Time.distribution.lo > allBmTime.distribution.lo && bv3Time.distribution.hi < allBmTime.distribution.hi,
  'board-match pool draws its distribution on its own axis rather than the wider all-games axis');
const spreadRow = GameData.rows(bmCurrent, bmRecords,
  { ...allMetrics, gameDataMetrics: { ...none, time: true }, gameDataPool: 'board:workSpread' }, board)[0];
assert.equal(spreadRow.poolLabel, '3BV spread 6.25–6.75 cells');
assert.equal(spreadRow.total, 2, '6.38 and 6.62 share the 6.25–6.75 band');
const shareBoardRow = GameData.rows(bmCurrent, bmRecords,
  { ...allMetrics, gameDataMetrics: { ...none, time: true }, gameDataPool: 'board:zeroOneShare' }, board)[0];
assert.equal(shareBoardRow.poolLabel, '0–1 share 60%');
assert.equal(shareBoardRow.total, 2);
for (const [poolId, wantLabel] of [['board:zini', 'ZiNi 40'], ['board:hzini', 'HZiNi 42'],
  ['board:maxAdjacent', 'max number 5'], ['board:zeroOpeningCoverage', 'zero-opening coverage 69%'],
  ['board:islandCount', 'islands 10'], ['board:largestIsland', 'largest island 4'], ['board:zeroCount', 'zeros 20']]) {
  const matched = GameData.rows(bmCurrent, bmRecords,
    { ...allMetrics, gameDataMetrics: { ...none, time: true }, gameDataPool: poolId }, board)[0];
  assert.equal(matched.poolLabel, wantLabel, poolId + ' label');
  assert.equal(matched.total, 2, poolId + ' matches the two wins with that trait');
}
const missingTrait = { ...current, zini: undefined };
assert.deepEqual(GameData.rows(missingTrait, [bmRecords[0], missingTrait],
  { ...allMetrics, gameDataPool: 'board:zini' }, board), [], 'unmeasured trait on this board produces no rows');
assert.equal(GameData.boardTraitPoolId('board:bv3'), 'all', 'board traits fall back to all games for board-match pools');
assert.equal(GameData.boardTraitPoolId('past-week'), 'past-week', 'board traits follow time-window pools');
assert.equal(GameData.boardTraitPoolId('session'), 'session');

// Scoped performance rows: multiple pools plotted alongside base rows in
// catalog/pool order, suppressing duplicates when the base pool matches.
const multiScoped = GameData.rows(bmCurrent, bmRecords, {
  ...allMetrics,
  gameDataMetrics: { ...none, time: true, clickRate: true },
  gameDataPool: 'all',
  gameDataScopedRows: [
    { metric: 'time', pool: 'board:zeroCount' },
    { metric: 'time', pool: 'board:bv3' },
    { metric: 'time', pool: 'past-week' },
    { metric: 'clickRate', pool: 'board:bv3' },
  ],
}, board);
assert.deepEqual(multiScoped.map((r) => [r.id, r.name, Boolean(r.scoped)]), [
  ['time.all', 'time', false],
  ['time.past-week', 'time · past week', true],
  ['time.board:bv3', 'time · 3BV 60', true],
  ['time.board:zeroCount', 'time · zeros 20', true],
  ['clickRate.all', 'click rate', false],
  ['clickRate.board:bv3', 'click rate · 3BV 60', true],
], 'scoped rows follow their base metric in canonical pool order');
const dedupedScoped = GameData.rows(bmCurrent, bmRecords, {
  ...allMetrics,
  gameDataMetrics: { ...none, time: true },
  gameDataPool: 'board:bv3',
  gameDataScopedRows: [
    { metric: 'time', pool: 'board:bv3' },
    { metric: 'time', pool: 'board:zeroCount' },
  ],
}, board);
assert.deepEqual(dedupedScoped.map((r) => [r.id, r.name, Boolean(r.scoped)]), [
  ['time.board:bv3', 'time', false],
  ['time.board:zeroCount', 'time · zeros 20', true],
], 'scoped row matching active base pool is not duplicated');
const scopedOnly = GameData.rows(bmCurrent, bmRecords, {
  ...allMetrics,
  gameDataMetrics: none,
  gameDataPool: 'all',
  gameDataScopedRows: [{ metric: 'time', pool: 'board:bv3' }],
}, board);
assert.deepEqual(scopedOnly.map((r) => [r.id, r.name, Boolean(r.scoped)]), [
  ['time.board:bv3', 'time · 3BV 60', true],
], 'scoped rows still render when their base measurement is unchecked');
assert.equal(SessionScope.records(records, 'pastHour', now).length, 3);
const boundary = { ...current, endedAt: now - 3600000 };
assert(SessionScope.records([boundary], 'pastHour', now).includes(boundary), 'lower bound is inclusive everywhere');
assert.equal(SessionScope.bounds('today', now).from, new Date(2026, 8, 23).getTime());
assert.equal(SessionScope.bounds('today6am', now).from, new Date(2026, 8, 22, 6).getTime());
assert.equal(GameData.defaultsForView.sessionDefinition, 'today', 'the one session defaults to today');
assert.equal(SessionScope.defaultId, 'today');
assert.deepEqual(SessionScope.records(records, 'today', now).map((r) => r.endedAt),
  [now - 30 * 60000, now - 5 * 60000, now], 'today starts at local midnight, the boundary game included');
assert.equal(SessionScope.records(records, 'past24h', now).length, 4,
  'the last 24 hours also holds yesterday evening’s game; today does not');
const history = GameData.history(records, now, 'pastHour', 0, 2);
assert.equal(history.total, 5);
assert.equal(history.windows.length, 2);
assert.equal(history.windows[0].records.length, 3);
assert(history.windows[1].records.every((r) => r.endedAt <= history.windows[1].endedAt));
assert.equal(GameData.history(records, now, 'pastHour', 2, 2).windows.length, 1);
const summary = GameData.summary(history.windows[0].records, 'fastclickGap');
assert.deepEqual(summary, { games: 3, wins: 2, measured: 2, median: 200, lower: 200, upper: 200 });
assert.equal(GameData.summary(history.windows[0].records, 'time').measured, 2);
// Tail-aware percentile formatting: 0% strictly for 1st, 100% strictly for
// last, and one significant tail digit inside (0, 1) and (99, 100).
for (const [p, want] of [
  [0, '0%'], [100, '100%'],
  [100 / 240, '0.4%'], [100 / 999, '0.1%'], [0.05, '0.05%'], [0.024, '0.02%'], [0.0042, '0.004%'], [0.98, '1%'],
  [1, '1%'], [1.4, '1%'], [50, '50%'], [98.6, '99%'], [99, '99%'],
  [99.02, '99%'], [100 - 100 / 240, '99.6%'], [99.95, '99.95%'], [99.98, '99.98%'],
]) {
  assert.equal(GameData.formatPercentile(p), want, 'formatPercentile(' + p + ')');
}
// Symmetric regularized logit bar scale, logit-space autozoom, and tick placement.
assert.equal(GameData.barFraction(0, [0, 100]), 0);
assert.equal(GameData.barFraction(50, [0, 100]), 0.5);
assert.equal(GameData.barFraction(100, [0, 100]), 1);
assert(Math.abs(GameData.barFraction(1, [0, 100]) + GameData.barFraction(99, [0, 100]) - 1) < 1e-12, 'logit scale is symmetric');
assert(GameData.barFraction(1, [0, 100]) - GameData.barFraction(0, [0, 100])
  > GameData.barFraction(51, [0, 100]) - GameData.barFraction(50, [0, 100]) * 10,
  'tail 0%–1% gets far more resolution than middle 50%–51%');
assert.deepEqual(GameData.domain([{ percentile: 0 }, { percentile: 43 }]), [0, 60], '43% padded in logit space without clipping');
assert.deepEqual(GameData.domain([{ percentile: 0 }, { percentile: 32 }]), [0, 50]);
assert.deepEqual(GameData.domain([{ percentile: 50 }]), [40, 60]);
assert.deepEqual(GameData.domain([]), [0, 100]);
assert.deepEqual(GameData.domain([{ percentile: 98 }, { percentile: 100 }]), [95, 100]);
const fullTicks = GameData.barTicks([0, 100], 520, 1);
assert.equal(fullTicks[0].text, '1st');
assert.equal(fullTicks[fullTicks.length - 1].text, 'last');
assert(fullTicks.some((t) => t.percentile === 50 && t.text === '50%'));
assert(fullTicks.every((t, i) => i === 0 || t.y - fullTicks[i - 1].y >= 18.9), 'bar ticks never collide');
assert.equal(GameData.rows(current, records, { ...GameData.defaultsForView, gameDataMetrics: none }).length, 0);

// Distributions: time windows on the all-games axis.
// Whole milliseconds are whole values: 30,001 possible times in about 36
// bins of 834 values each, every bin holding the same number.
const timeLife = row('time.all').distribution;
assert.deepEqual([timeLife.lo, timeLife.hi, timeLife.bins, timeLife.step, timeLife.perBin], [9988.5, 40012.5, 36, 1, 834],
  'whole values beyond 60 get equal groups of whole values, the spare values split around the range');
assert.equal(timeLife.counts.reduce((a, b) => a + b, 0), row('time.all').total, 'every game inside the range is drawn');
assert.deepEqual([0, 12, 35].map((bin) => Math.round(timeLife.standing[bin])), [0, 33, 100],
  'a bin stands at its games’ percentile');
assert.equal(timeLife.standing[1], null, 'a bin without games has no standing');
assert.deepEqual(timeLife.labels.map((label) => label.text), ['10s', '20s', '30s', '40s'], 'labels sit at round values');
assert.deepEqual([row('time.session').distribution.lo, row('time.session').distribution.hi], [9988.5, 40012.5], 'time windows share the all-games axis');
assert.equal(row('time.session').distribution.counts.reduce((a, b) => a + b, 0), 2);
const bvRow = row('bvPerSecond.all').distribution;
assert.deepEqual([bvRow.step, bvRow.bins], [null, 36], 'a continuous measurement gets 36 equal bins');

// The comb a 3BV histogram showed: whole counts spanning more than 60
// values in 36 equal bins put 1 or 2 possible values in alternate bins.
// Every bin now covers the same number of whole values. A uniform spread
// has no outliers, so the fence keeps every value.
const spread = Array.from({ length: 121 }, (_, i) => 110 + i);
const bv3Records = spread.map((bv3, i) => ({ ...current, endedAt: now - (200 - i) * 60000, bv3 }));
const bv3Axis = GameData.addDistribution({ scope: 'all', value: 150, higher: false }, spread, spread, String).distribution;
assert.deepEqual([bv3Axis.step, bv3Axis.perBin, bv3Axis.bins, bv3Axis.lo, bv3Axis.hi], [1, 4, 31, 108.5, 232.5],
  '121 whole values, 110 to 230, in 31 bins of 4, the spare slots split around the range');
assert.equal(bv3Axis.counts.reduce((a, b) => a + b, 0), 121, 'every value of a uniform spread is drawn');
assert(bv3Axis.counts.every((count) => count >= 2 && count <= 4), 'only the padding at the ends is short a value');
assert(bv3Records.length === 121);
const narrowValues = Array.from({ length: 55 }, (_, i) => 41 + i);
const narrow = GameData.addDistribution({ scope: 'all', value: 75, higher: false }, narrowValues, narrowValues, String).distribution;
assert.deepEqual([narrow.perBin, narrow.bins], [1, 55], 'at most 60 values get one bar each');
const percentOf = (v) => Number((100 * v).toFixed(1)) + '%';
const shareValues = Array.from({ length: 55 }, (_, i) => (100 + i) / 216);
const share = GameData.addDistribution({ scope: 'all', value: 130 / 216, higher: true }, shareValues, shareValues, percentOf, 1 / 216).distribution;
assert.deepEqual([share.perBin, share.bins], [1, 55], 'a share of 216 safe cells bins one cell each');
assert(share.counts.every((count) => count === 1), 'one board per cell value draws an even histogram');
const wideShareValues = Array.from({ length: 108 }, (_, i) => (100 + i) / 216);
const wideShare = GameData.addDistribution({ scope: 'all', value: 130 / 216, higher: true }, wideShareValues, wideShareValues, percentOf, 1 / 216).distribution;
assert.deepEqual([wideShare.perBin, [...new Set(wideShare.counts)]], [3, [3]], 'wider shares group whole cells evenly');
// A far tail must not stretch the axis out to itself. The bulk is 0 and
// then 0.1–4; 8, 12, and 20 are past the fence (Q3 is 2, so the whisker
// ends at 5).
const skewed = [...Array(50).fill(0), ...Array.from({ length: 40 }, (_, i) => (i + 1) / 10), 8, 12, 20];
const skewedAxis = GameData.addDistribution({ scope: 'all', value: 0.5, higher: false }, skewed, skewed, (v) => v.toFixed(1)).distribution;
assert.deepEqual([skewedAxis.lo, skewedAxis.hi, skewedAxis.bins], [0, 4, 36],
  'the axis ends at the last value inside the fence, not at the tail');
assert.equal(skewedAxis.counts.reduce((a, b) => a + b, 0), 90, 'the three tail values are not drawn');
// At least half the values tied, so there is no whisker: the narrowest
// window holding 90% is drawn instead of collapsing onto the tied value.
const mass = [...Array(80).fill(0), 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const massAxis = GameData.addDistribution({ scope: 'all', value: 0, higher: false }, mass, mass, String).distribution;
assert.deepEqual([massAxis.lo, massAxis.hi], [-0.5, 1.5],
  'a point mass keeps the nearest tail value the 90% window needs');
assert.equal(massAxis.counts.reduce((a, b) => a + b, 0), 81);
const wholeValues = [0, 3, 1, 3];
const wholeAxis = GameData.addDistribution({ scope: 'all', value: 3, higher: false }, wholeValues, wholeValues, String).distribution;
assert.deepEqual([wholeAxis.lo, wholeAxis.hi, wholeAxis.bins, wholeAxis.step], [-0.5, 3.5, 4, 1],
  'whole values spanning at most 60 get one bin each');
assert.deepEqual(wholeAxis.counts, [1, 1, 0, 2]);
assert.equal(Math.round(wholeAxis.standing[3] * 10), 833, 'tied games stand at their shared mean rank, as their percentiles do');
assert.deepEqual(wholeAxis.labels.map((label) => label.text), ['0', '1', '2', '3']);

// Unflagged mine share (requested 2026-10-10): the mine counter at the win
// over the mine count, from the stored flag counters.
const unflagged = GameData.metrics.find((m) => m.id === 'unflaggedMineShare');
const shareOf = (fields) => unflagged.value({ ...current, ...fields }, board);
assert.equal(shareOf({ flagsPlaced: 4, flagsRemoved: 1 }), 0.7, 'placed minus removed flags stand, all on mines at a win');
assert.equal(shareOf({ flagsPlaced: 10, flagsRemoved: 0 }), 0, 'every mine flagged');
assert.equal(shareOf({ flagsPlaced: 3, flagsRemoved: 3 }), 1, 'flags all taken back');
assert.equal(shareOf({ flagsPlaced: 0 }), 1, 'a markless win, even from before removals were counted');
assert.equal(shareOf({ flagsPlaced: 3 }), undefined, 'placements without the removal count give no net');
assert.equal(shareOf({}), undefined, 'records from before the flag counters are unmeasured');
assert.equal(shareOf({ outcome: 'loss', flagsPlaced: 0, flagsRemoved: 0 }), undefined, 'wins only');
assert.equal(shareOf({ playMode: 'endgame-drill', flagsPlaced: 2, flagsRemoved: 0 }), undefined,
  'a drill’s mines outside the remnant were never in play');
assert.equal(unflaggedMineShareOf({ ...current, flagsPlaced: 90, flagsRemoved: 3 }, 99), 12 / 99);
const shareGames = [[8, 0], [6, 1], [10, 0], [7, 0], [9, 1]].map(([flagsPlaced, flagsRemoved], i) =>
  ({ ...current, endedAt: now - (5 - i) * 60000, flagsPlaced, flagsRemoved }));
const shareRow = GameData.rows(shareGames[4], shareGames,
  { ...GameData.defaultsForView, gameDataMetrics: { ...none, unflaggedMineShare: true } }, board)
  .find((r) => r.id === 'unflaggedMineShare.all');
assert.equal(shareRow.valueText, '20%');
assert.equal(shareRow.higher, true, 'more mines left unflagged is better');
assert.deepEqual([shareRow.standingText, shareRow.percentile], ['tied 3rd–4th of 5 wins', 62.5],
  '50% and 30% beat this 20%, which ties the other 20%');
assert.deepEqual([shareRow.distribution.step, shareRow.distribution.perBin, shareRow.distribution.bins], [0.1, 1, 6],
  'one bin per count of unflagged mines');
assert.deepEqual(shareRow.distribution.counts, [1, 0, 2, 1, 0, 1]);
assert.deepEqual(shareRow.distribution.labels.map((label) => label.text), ['0%', '10%', '20%', '30%', '40%', '50%']);
assert.equal(GameData.metrics.find((m) => m.id === 'stnb').value(current, board), stnbOf(current, board));
assert.equal(GameData.metrics.find((m) => m.id === 'ioe').value(current), 60 / 82);
assert.equal(new Set(GameData.metrics.map((m) => m.id)).size, GameData.metrics.length);

// Example boards: what each measurement counts on one board. A 4×3 board
// with mines in opposite corners opens in two zero regions that cover
// every safe square.
for (const file of ['board-shape.js', 'zini.js', 'board-metrics.js']) {
  vm.runInThisContext(fs.readFileSync(require('node:path').join(__dirname, '..', file), 'utf8'));
}
const cornerMines = Array.from({ length: 12 }, (_, i) => i === 0 || i === 11);
const traitExamples = GameData.examples(4, 3, cornerMines, null);
assert.deepEqual([traitExamples.bv3.openings, traitExamples.bv3.marks.shade.length, traitExamples.bv3.marks.ring],
  [2, 10, []], 'two openings cover all ten safe squares, with no number outside them');
assert.deepEqual([traitExamples.zeroOpeningCoverage.marks.shade.length, traitExamples.zeroOpeningCoverage.of], [10, 10]);
assert.deepEqual(traitExamples.maxAdjacent.marks.shade.slice().sort((a, b) => a - b), [1, 4, 5, 6, 7, 10],
  'every 1 is the largest number');
assert.deepEqual([traitExamples.islandCount.marks.shade, traitExamples.largestIsland.marks.shade], [[0, 11], [0]]);
assert.deepEqual(traitExamples.zeroCount.marks.shade, [2, 3, 8, 9]);
assert.deepEqual([traitExamples.workSpread.spread.center, Number(traitExamples.workSpread.spread.radius.toFixed(4))],
  [{ x: 1.5, y: 1 }, Number(Math.SQRT2.toFixed(4))], 'the two openings sit √2 squares from their center');
const ziniMarks = traitExamples.zini.marks;
assert.equal(ziniMarks.ring.length + ziniMarks.dot.length + ziniMarks.shade.length, Zini.zini(4, 3, cornerMines),
  'the ZiNi example marks every one of its clicks');
assert.equal(traitExamples.misclickRate, undefined, 'a trace without decisions has no play examples');
const playExamples = GameData.examples(4, 3, cornerMines, { flagged: [0], events: [
  { type: 'misclick', cell: 5 }, { type: 'no-op', cell: null }, { type: 'no-op', cell: 7 }, { type: 'unused-flag', cell: 0 }] });
assert.deepEqual([playExamples.misclickRate.marks.ring, playExamples.misclickRate.clicks], [[5], 1]);
assert.deepEqual([playExamples.noopRate.marks.ring, playExamples.noopRate.clicks], [[7], 2],
  'a no-op click with no square is counted but not marked');
assert.deepEqual(playExamples.unusedFlagShare.marks.shade, [0]);
assert.deepEqual([playExamples.unflaggedMineShare.marks.shade, playExamples.unflaggedMineShare.of], [[11], 2]);
assert.deepEqual([playExamples.moves.marks.ring, playExamples.forks.marks.ring], [[], []], 'no move, no fork');
const moveExamples = GameData.examples(4, 3, cornerMines, { flagged: [], events: [
  { type: 'moved-on', cell: 3 }, { type: 'left-easy-work', cell: 8, safeCells: [1, 2] },
  { type: 'fork', cell: 8 }, { type: 'left-easy-work', cell: 7, safeCells: [2, 4] }, { type: 'left-hard-work', cell: 6 }] });
assert.deepEqual(moveExamples.moves.marks.ring, [3, 6, 8, 7], 'every move by its kind, each where it went');
assert.deepEqual([moveExamples.easyWorkLeft.marks.ring, moveExamples.easyWorkLeft.marks.shade], [[8, 7], [1, 2, 4]],
  'the moves leaving easy work and every square they left, once each');
assert.deepEqual(moveExamples.forks.marks.ring, [8]);

// Move habits: measured where the record has them, each move kind a share of all moves.
const metric = (id) => GameData.metrics.find((m) => m.id === id);
const habits = { movesMovedOn: 3, movesLeftHardWork: 2, movesLeftEasyWork: 1, moveGapMedianMs: 840, forkMoves: 4, forkMovesToNearestArea: 3 };
assert.deepEqual(['timeBeforeMove', 'easyWorkLeftShare', 'nearestAreaShare'].map((id) => metric(id).value(habits)), [840, 1 / 6, 0.75]);
assert.deepEqual(['timeBeforeMove', 'easyWorkLeftShare', 'nearestAreaShare'].map((id) => metric(id).value(current)),
  [undefined, undefined, undefined], 'a game recorded before move habits is unmeasured, never zero');
assert.deepEqual(['timeBeforeMove', 'easyWorkLeftShare', 'nearestAreaShare'].map((id) => metric(id).value({
  movesMovedOn: 0, movesLeftHardWork: 0, movesLeftEasyWork: 0, forkMoves: 0, forkMovesToNearestArea: 0 })),
[undefined, undefined, undefined], 'a game without a move or a fork has no share of them');

// Option F1 (2026-11-24): flag-activity metrics require at least one placed
// flag and no daily-limit flag block; unflaggedMineShare stays measured on
// every win (including no-mark wins at 100%).
const flagMetricIds = ['flagRate', 'flagRemovalRate', 'unusedFlagRate', 'unusedFlagShare'];
const boardParams = { mines: 10 };
const noMarkWin = { outcome: 'win', timeMs: 30000, flagsPlaced: 0, flagsRemoved: 0, unusedCorrectFlags: 0 };
const blockedWin = { outcome: 'win', timeMs: 30000, flagsPlaced: 3, flagsRemoved: 1, unusedCorrectFlags: 1, flagsBlocked: true };
const flaggedWin = { outcome: 'win', timeMs: 30000, flagsPlaced: 6, flagsRemoved: 1, unusedCorrectFlags: 2 };
assert.deepEqual(flagMetricIds.map((id) => metric(id).value(noMarkWin, boardParams)),
  [undefined, undefined, undefined, undefined], 'no-mark game is unmeasured for all four flag-activity metrics');
assert.deepEqual(flagMetricIds.map((id) => metric(id).value(blockedWin, boardParams)),
  [undefined, undefined, undefined, undefined], 'flag-blocked game is unmeasured for all four flag-activity metrics');
assert.deepEqual(flagMetricIds.map((id) => metric(id).value(flaggedWin, boardParams)),
  [0.2, 2, 4, 2 / 6], 'flagged unblocked game measures all four flag-activity metrics');
assert.equal(metric('unflaggedMineShare').value(noMarkWin, boardParams), 1, 'no-mark win stays 100% unflagged mine share');
console.log('game-data: scope boundaries, historical windows, eligible populations, missing values, ties, metric catalog, autozoom, flag gating, and example boards passed');

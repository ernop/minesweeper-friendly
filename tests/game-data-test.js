'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
vm.runInThisContext(fs.readFileSync(require('node:path').join(__dirname, '..', 'game-data.js'), 'utf8'));
const now = new Date(2026, 8, 23, 0, 30).getTime();
const current = { endedAt: now, outcome: 'win', timeMs: 30000, bv3: 60, clicks: 80,
  wastedClicks: 2, misclicks: 0, fastclickGapMs: 200, mousePathPx: 600 };
const records = [
  { ...current, endedAt: now - 25 * 3600000, timeMs: 10000 },
  { ...current, endedAt: now - 2 * 3600000, timeMs: 20000, misclicks: 1 },
  { ...current, endedAt: now - 30 * 60000, timeMs: 40000, fastclickGapMs: undefined },
  { ...current, endedAt: now - 5 * 60000, outcome: 'loss', timeMs: 15000, misclicks: 1 },
  current,
  { ...current, endedAt: now + 1000, timeMs: 1000 },
];
const on = (selection) => Object.keys(selection).filter((id) => selection[id]);
assert.deepEqual(on(GameData.defaults), ['time', 'misclickRate', 'fastclickGap', 'bvPerSecond',
  'clickRate', 'noopRate', 'correctness', 'mouseSpeed', 'unusedMarkShare', 'unflaggedMineShare',
  'flagsWithoutMultiCellChord'],
  'the creator’s defaults, plus the training plan’s stage 1 flag count and the requested unflagged mine share');
const board = { width: 9, height: 9, mines: 10 };
assert.deepEqual(GameData.rows(current, records, GameData.defaultsForView, board).map((r) => r.id), ['time.lifetime', 'time.session',
  'misclickRate.lifetime', 'misclickRate.session', 'fastclickGap.lifetime', 'fastclickGap.session',
  'bvPerSecond.lifetime', 'bvPerSecond.session', 'clickRate.lifetime', 'clickRate.session',
  'noopRate.lifetime', 'noopRate.session', 'correctness.lifetime', 'correctness.session',
  'mouseSpeed.lifetime', 'mouseSpeed.session'],
  'one selection ranks each shown measurement against lifetime and the session; unmeasured flag measurements are absent');
const all = Object.fromEntries(GameData.metrics.map((m) => [m.id, true]));
const none = Object.fromEntries(GameData.metrics.map((m) => [m.id, false]));
const both = { ...GameData.defaultsForView, gameDataMetrics: all };
const rows = GameData.rows(current, records, both, board);
const row = (id) => rows.find((r) => r.id === id);
assert.equal(row('time.lifetime').name, 'time');
assert.equal(row('time.lifetime').metricId, 'time');
assert.deepEqual(['time.lifetime', 'time.session'].map((id) => row(id).scope), ['lifetime', 'session']);
assert.equal(row('time.lifetime').rank, 3);
assert.equal(row('time.lifetime').percentile, 100 * 2 / 3, '100 × (rank − 1) ÷ (count − 1)');
assert.equal(row('time.session').percentile, 0, 'the best in the pool is 0%');
assert.equal(row('time.lifetime').total, 4, 'future games and losses cannot enter solve-time background');
assert.equal(row('time.session').total, 2);
assert.equal(row('time.lifetime').valueText, '30.000s');
assert.equal(row('clickRate.session').total, 3, 'measured action rates include wins and losses');
assert.equal(row('efficiency.session').total, 2, 'completion ratios exclude incomplete boards');
assert.equal(row('fastclickGap.session').total, 2, 'missing is not zero');
assert.equal(row('misclickRate.session').rank, 1.5, 'equal rates share mean ordinal rank');
assert.deepEqual([row('misclickRate.session').firstRank, row('misclickRate.session').lastRank], [1, 2], 'a tie names its rank range');
assert.deepEqual([row('time.lifetime').firstRank, row('time.lifetime').lastRank], [3, 3]);
assert.equal(row('misclickRate.session').percentile, 25);
assert.equal(row('misclickRate.session').valueText, '0/min');
assert.equal(row('fastclickGap.session').percentile, 50, 'all-equal timing has neutral rank');
// A card states the rank alone (creator 2026-10-08): its label names the
// pool and the row shows the percentage, so no pool description ("so far
// with these board settings") and no arithmetic.
assert.equal(row('time.lifetime').standingText, '3rd of 4 wins');
assert.equal(row('misclickRate.session').standingText, 'tied 1st–2nd of 3 games');
assert.deepEqual([row('misclickRate.session').better, row('misclickRate.session').tiedOthers], [0, 1]);
assert.equal(row('fastclickGap.session').standingText, 'both games have this value');
const equalTimes = [{ ...current, endedAt: now - 60000 }, current];
assert.equal(GameData.rows(current, equalTimes, GameData.defaultsForView, board)[0].standingText, '2nd of 2 wins', 'an equal time set earlier ranks ahead');
const constant = GameData.rows(current, [1, 2, 3].map((i) => ({ ...current, endedAt: now - i * 60000 })).concat(current),
  { ...both, gameDataMetrics: { ...none, correctness: true } }, board);
assert.equal(constant.find((r) => r.id === 'correctness.lifetime').standingText, 'all 4 games have this value');
assert(rows.every((r) => !/÷|=|settings|so far/.test(r.standingText)), 'no rank carries arithmetic or an obvious qualifier');
// A definition says only what the name and unit leave open; a measurement
// they already explain has none.
assert.deepEqual(GameData.metrics.filter((m) => m.help === undefined).map((m) => m.id),
  ['time', 'bvPerSecond', 'pathPer3bv', 'pathPerClick', 'flagsWithoutMultiCellChord']);
assert(GameData.metrics.every((m) => m.help === undefined
  || (m.help.split(' ').length <= 40 && !m.help.toLowerCase().startsWith(m.name.toLowerCase()))),
  'every definition is short and never opens by repeating the name');
assert.equal(row('time.lifetime').definition, undefined);
assert.equal(row('misclickRate.session').definition, GameData.metrics.find((m) => m.id === 'misclickRate').help,
  'every pool’s row carries its measurement’s definition');
assert.equal(GameData.rows({ ...current, outcome: 'loss' }, records).length, 0);
assert.deepEqual(GameData.rows(current, [current], both, board), [], 'one measured game produces no comparison rows in any scope');
const short = GameData.rows(current, records, { ...both, sessionDefinition: 'past10min' }, board);
assert.equal(short.find((r) => r.id === 'time.session'), undefined, 'a session with only one win has no solve-time comparison');
assert.equal(short.find((r) => r.id === 'clickRate.session').total, 2, 'activity can compare a measured win and loss');
assert.equal(short.find((r) => r.id === 'time.lifetime').total, 4);
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
assert.deepEqual(GameData.domain([{ percentile: 0 }, { percentile: 43 }]), [0, 50], '43% never clipped by a 40% endpoint');
assert.deepEqual(GameData.domain([{ percentile: 32 }, { percentile: 43 }]), [30, 50]);
assert.deepEqual(GameData.domain([{ percentile: 50 }]), [40, 60]);
assert.deepEqual(GameData.domain([]), [0, 100]);
assert.deepEqual(GameData.domain([{ percentile: 98 }, { percentile: 100 }]), [90, 100]);
assert.equal(GameData.rows(current, records, { ...GameData.defaultsForView, gameDataMetrics: none }).length, 0);

// Distributions: every pool on the lifetime axis, session values as ticks.
// Whole milliseconds are whole values: 30,001 possible times in about 36
// bins of 834 values each, every bin holding the same number.
const timeLife = row('time.lifetime').distribution;
assert.deepEqual([timeLife.lo, timeLife.hi, timeLife.bins, timeLife.step, timeLife.perBin], [9988.5, 40012.5, 36, 1, 834],
  'whole values beyond 60 get equal groups of whole values, the spare values split around the range');
assert.equal(timeLife.counts.reduce((a, b) => a + b, 0), row('time.lifetime').total, 'every game inside the range is drawn');
assert.deepEqual([0, 12, 35].map((bin) => Math.round(timeLife.standing[bin])), [0, 33, 100],
  'a bin stands at its games’ percentile');
assert.equal(timeLife.standing[1], null, 'a bin without games has no standing');
assert.deepEqual(timeLife.labels.map((label) => label.text), ['10s', '20s', '30s', '40s'], 'labels sit at round values');
assert.deepEqual(row('time.lifetime').sessionValues.slice().sort(), [30000, 40000], 'the lifetime row carries the session games');
assert.equal(row('time.session').sessionValues, undefined);
assert.deepEqual([row('time.session').distribution.lo, row('time.session').distribution.hi], [9988.5, 40012.5], 'pools share the lifetime axis');
assert.equal(row('time.session').distribution.counts.reduce((a, b) => a + b, 0), 2);
const bvRow = row('bvPerSecond.lifetime').distribution;
assert.deepEqual([bvRow.step, bvRow.bins], [null, 36], 'a continuous measurement gets 36 equal bins');

// The comb a 3BV histogram showed: whole counts spanning more than 60
// values in 36 equal bins put 1 or 2 possible values in alternate bins.
// Every bin now covers the same number of whole values. A uniform spread
// has no outliers, so the fence keeps every value.
const spread = Array.from({ length: 121 }, (_, i) => 110 + i);
const bv3Records = spread.map((bv3, i) => ({ ...current, endedAt: now - (200 - i) * 60000, bv3 }));
const bv3Axis = GameData.addDistributions([{ scope: 'lifetime', value: 150, higher: false }], { lifetime: spread }, [], String)[0].distribution;
assert.deepEqual([bv3Axis.step, bv3Axis.perBin, bv3Axis.bins, bv3Axis.lo, bv3Axis.hi], [1, 4, 31, 108.5, 232.5],
  '121 whole values, 110 to 230, in 31 bins of 4, the spare slots split around the range');
assert.equal(bv3Axis.counts.reduce((a, b) => a + b, 0), 121, 'every value of a uniform spread is drawn');
assert(bv3Axis.counts.every((count) => count >= 2 && count <= 4), 'only the padding at the ends is short a value');
assert(bv3Records.length === 121);
const narrow = GameData.addDistributions([{ scope: 'lifetime', value: 75, higher: false }],
  { lifetime: Array.from({ length: 55 }, (_, i) => 41 + i) }, [], String)[0].distribution;
assert.deepEqual([narrow.perBin, narrow.bins], [1, 55], 'at most 60 values get one bar each');
const percentOf = (v) => Number((100 * v).toFixed(1)) + '%';
const share = GameData.addDistributions([{ scope: 'lifetime', value: 130 / 216, higher: true }],
  { lifetime: Array.from({ length: 55 }, (_, i) => (100 + i) / 216) }, [], percentOf, 1 / 216)[0].distribution;
assert.deepEqual([share.perBin, share.bins], [1, 55], 'a share of 216 safe cells bins one cell each');
assert(share.counts.every((count) => count === 1), 'one board per cell value draws an even histogram');
const wideShare = GameData.addDistributions([{ scope: 'lifetime', value: 130 / 216, higher: true }],
  { lifetime: Array.from({ length: 108 }, (_, i) => (100 + i) / 216) }, [], percentOf, 1 / 216)[0].distribution;
assert.deepEqual([wideShare.perBin, [...new Set(wideShare.counts)]], [3, [3]], 'wider shares group whole cells evenly');
// A far tail, and a session game sitting in it, must not stretch the axis
// out to themselves. The bulk is 0 and then 0.1–4; 8, 12, and 20 are past
// the fence (Q3 is 2, so the whisker ends at 5).
const skewed = [...Array(50).fill(0), ...Array.from({ length: 40 }, (_, i) => (i + 1) / 10), 8, 12, 20];
const skewedAxis = GameData.addDistributions([{ scope: 'lifetime', value: 0.5, higher: false }],
  { lifetime: skewed }, [20], (v) => v.toFixed(1))[0].distribution;
assert.deepEqual([skewedAxis.lo, skewedAxis.hi, skewedAxis.bins], [0, 4, 36],
  'the axis ends at the last value inside the fence, not at the tail or the session game');
assert.equal(skewedAxis.counts.reduce((a, b) => a + b, 0), 90, 'the three tail values are not drawn');
// At least half the values tied, so there is no whisker: the narrowest
// window holding 90% is drawn instead of collapsing onto the tied value.
const mass = [...Array(80).fill(0), 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const massAxis = GameData.addDistributions([{ scope: 'lifetime', value: 0, higher: false }],
  { lifetime: mass }, [], String)[0].distribution;
assert.deepEqual([massAxis.lo, massAxis.hi], [-0.5, 1.5],
  'a point mass keeps the nearest tail value the 90% window needs');
assert.equal(massAxis.counts.reduce((a, b) => a + b, 0), 81);
const flagged = [0, 3, 1, 3].map((count, i) => ({ ...current, endedAt: now - (4 - i) * 60000, flagsWithoutMultiCellChord: count }));
const flagRow = GameData.rows(flagged[3], flagged, { ...GameData.defaultsForView, gameDataMetrics: { ...none, flagsWithoutMultiCellChord: true } }, board)
  .find((r) => r.id === 'flagsWithoutMultiCellChord.lifetime');
assert.deepEqual([flagRow.distribution.lo, flagRow.distribution.hi, flagRow.distribution.bins, flagRow.distribution.step], [-0.5, 3.5, 4, 1],
  'whole values spanning at most 60 get one bin each');
assert.deepEqual(flagRow.distribution.counts, [1, 1, 0, 2]);
assert.equal(Math.round(flagRow.distribution.standing[3] * 10), 833, 'tied games stand at their shared mean rank, as their percentiles do');
assert.equal(flagRow.percentile, flagRow.distribution.standing[3], 'this game’s bin stands where this game does');
assert.deepEqual(flagRow.distribution.labels.map((label) => label.text), ['0', '1', '2', '3']);

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
  .find((r) => r.id === 'unflaggedMineShare.lifetime');
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
console.log('game-data: scope boundaries, historical windows, eligible populations, missing values, ties, metric catalog, and autozoom passed');

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
  'clickRate', 'noopRate', 'correctness', 'mouseSpeed', 'unusedMarkShare', 'flagsWithoutMultiCellChord'],
  'the creator’s defaults, plus the training plan’s stage 1 flag count');
assert.deepEqual(GameData.rows(current, records).map((r) => r.id), ['time.lifetime', 'time.session', 'time.day',
  'misclickRate.lifetime', 'misclickRate.session', 'fastclickGap.lifetime', 'fastclickGap.session',
  'bvPerSecond.lifetime', 'bvPerSecond.session', 'clickRate.lifetime', 'clickRate.session',
  'noopRate.lifetime', 'noopRate.session', 'correctness.lifetime', 'correctness.session',
  'mouseSpeed.lifetime', 'mouseSpeed.session'],
  'one selection ranks each shown measurement against lifetime and the session, time also the last 24 hours; unmeasured flag measurements are absent');
const board = { width: 9, height: 9, mines: 10 };
const all = Object.fromEntries(GameData.metrics.map((m) => [m.id, true]));
const none = Object.fromEntries(GameData.metrics.map((m) => [m.id, false]));
const both = { ...GameData.defaultsForView, gameDataMetrics: all };
const rows = GameData.rows(current, records, both, board);
const row = (id) => rows.find((r) => r.id === id);
assert.equal(row('time.lifetime').name, 'time');
assert.equal(row('time.lifetime').metricId, 'time');
assert.deepEqual(['time.lifetime', 'time.session', 'time.day'].map((id) => row(id).scope), ['lifetime', 'session', 'day']);
assert.equal(row('time.lifetime').counted, 'wins');
assert.equal(row('clickRate.lifetime').counted, 'games');
assert.equal(row('time.lifetime').rank, 3);
assert.equal(row('time.lifetime').percentile, 100 * 2 / 3, '100 × (rank − 1) ÷ (count − 1)');
assert.equal(row('time.session').percentile, 0, 'the best in the pool is 0%');
assert.equal(row('time.lifetime').total, 4, 'future games and losses cannot enter solve-time background');
assert.equal(row('time.day').total, 3, 'day is trailing 24 hours, crossing midnight');
assert.equal(row('time.session').total, 2);
assert.equal(row('time.day').valueText, '30.000s');
assert.equal(row('clickRate.session').total, 3, 'measured action rates include wins and losses');
assert.equal(row('efficiency.session').total, 2, 'completion ratios exclude incomplete boards');
assert.equal(row('fastclickGap.session').total, 2, 'missing is not zero');
assert.equal(row('misclickRate.session').rank, 1.5, 'equal rates share mean ordinal rank');
assert.deepEqual([row('misclickRate.session').firstRank, row('misclickRate.session').lastRank], [1, 2], 'a tie names its rank range');
assert.deepEqual([row('time.lifetime').firstRank, row('time.lifetime').lastRank], [3, 3]);
assert.equal(row('misclickRate.session').percentile, 25);
assert.equal(row('misclickRate.session').valueText, '0/min');
assert.equal(row('fastclickGap.session').percentile, 50, 'all-equal timing has neutral rank');
assert.deepEqual(row('time.lifetime').helpText, [
  'Time from your first click to the win. Equal times rank the earlier game first.',
  'Rank 3 of 4 wins so far with these board settings. Lower values rank first; 0% is the best, and this sits at 66.7%.',
], 'a popup is the definition plus one rank sentence');
assert.equal(row('misclickRate.session').helpText[1],
  'Tied for ranks 1–2 of 3 games this session (today) with these board settings. Lower values rank first; 0% is the best, and this sits at 25%.');
assert.equal(row('fastclickGap.session').helpText[1],
  'All 2 games this session (today) with these board settings have the same value, so it sits at 50%.');
assert.equal(row('time.day').helpText[1],
  'Rank 2 of 3 wins in the last 24 hours with these board settings. Lower values rank first; 0% is the best, and this sits at 50%.');
assert(GameData.metrics.every((m) => typeof m.help === 'string' && m.help.split(' ').length <= 40),
  'every metric has a short definition');
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
assert.equal(GameData.rows(current, records, { ...GameData.defaultsForView, gameDataMetrics: none, gameDataDayTime: false }).length, 0);

// Distributions: every pool on the lifetime axis, session values as ticks.
const timeLife = row('time.lifetime').distribution;
assert.deepEqual([timeLife.lo, timeLife.hi, timeLife.bins, timeLife.integer], [10000, 40000, 36, false],
  'a wide range gets 36 bins over its 1st–99th percentiles');
assert.equal(timeLife.counts.reduce((a, b) => a + b, 0) + timeLife.outside, row('time.lifetime').total);
assert.deepEqual([0, 12, 35].map((bin) => Math.round(timeLife.standing[bin])), [0, 33, 100],
  'a bin stands at its games’ percentile');
assert.equal(timeLife.standing[1], null, 'a bin without games has no standing');
assert.deepEqual(timeLife.labels.map((label) => label.text), ['10.000s', '17.500s', '25.000s', '32.500s', '40.000s']);
assert.deepEqual(row('time.lifetime').sessionValues.slice().sort(), [30000, 40000], 'the lifetime row carries the session games');
assert.equal(row('time.session').sessionValues, undefined);
assert.deepEqual([row('time.session').distribution.lo, row('time.session').distribution.hi], [10000, 40000], 'pools share the lifetime axis');
assert.equal(row('time.session').distribution.counts.reduce((a, b) => a + b, 0), 2);
const flagged = [0, 3, 1, 3].map((count, i) => ({ ...current, endedAt: now - (4 - i) * 60000, flagsWithoutMultiCellChord: count }));
const flagRow = GameData.rows(flagged[3], flagged, { ...GameData.defaultsForView, gameDataMetrics: { ...none, flagsWithoutMultiCellChord: true } }, board)
  .find((r) => r.id === 'flagsWithoutMultiCellChord.lifetime');
assert.deepEqual([flagRow.distribution.lo, flagRow.distribution.hi, flagRow.distribution.bins, flagRow.distribution.integer], [-0.5, 3.5, 4, true],
  'whole values spanning at most 60 get one bin each');
assert.deepEqual(flagRow.distribution.counts, [1, 1, 0, 2]);
assert.equal(Math.round(flagRow.distribution.standing[3] * 10), 833, 'tied games stand at their shared mean rank, as their percentiles do');
assert.equal(flagRow.percentile, flagRow.distribution.standing[3], 'this game’s bin stands where this game does');
assert.deepEqual(flagRow.distribution.labels.map((label) => label.text), ['0', '1', '2', '3']);
assert.equal(GameData.metrics.find((m) => m.id === 'stnb').value(current, board), stnbOf(current, board));
assert.equal(GameData.metrics.find((m) => m.id === 'ioe').value(current), 60 / 82);
assert.equal(new Set(GameData.metrics.map((m) => m.id)).size, GameData.metrics.length);
console.log('game-data: scope boundaries, historical windows, eligible populations, missing values, ties, metric catalog, and autozoom passed');

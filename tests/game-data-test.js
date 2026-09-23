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
const rows = GameData.rows(current, records);
const row = (id) => rows.find((r) => r.id === id);
assert.equal(row('time.lifetime').trait, 'time (life)');
assert.equal(row('time.session').label, 'time 30.000s (session)', 'the pool word ends the label');
assert.equal(row('time.day').trait, 'time (day)');
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
assert.equal(row('misclickRate.session').percentile, 25);
assert.equal(row('misclickRate.session').valueText, '0/min');
assert.equal(row('fastclickGap.session').percentile, 50, 'all-equal timing has neutral rank');
assert.equal(GameData.rows({ ...current, outcome: 'loss' }, records).length, 0);
assert(GameData.rows(current, [current]).every((r) => r.percentile === null));
const short = GameData.rows(current, records, { ...GameData.defaultsForView, sessionDefinition: 'past10min' });
assert.equal(short.find((r) => r.id === 'time.session').total, 1);
assert.equal(short.find((r) => r.id === 'time.lifetime').total, 4);
assert.equal(SessionScope.records(records, 'pastHour', now).length, 3);
const boundary = { ...current, endedAt: now - 3600000 };
assert(SessionScope.records([boundary], 'pastHour', now).includes(boundary), 'lower bound is inclusive everywhere');
assert.equal(SessionScope.bounds('today', now).from, new Date(2026, 8, 23).getTime());
assert.equal(SessionScope.bounds('today6am', now).from, new Date(2026, 8, 22, 6).getTime());
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
assert.deepEqual(GameData.domain([{ percentile: null }]), [0, 100]);
assert.deepEqual(GameData.domain([{ percentile: 98 }, { percentile: 100 }]), [90, 100]);
const enabled = Object.fromEntries(GameData.metrics.map((m) => [m.id, false]));
assert.equal(GameData.rows(current, records, { ...GameData.defaultsForView, gameDataSessionMetrics: enabled, gameDataLifetimeMetrics: enabled, gameDataDayTime: false }).length, 0);
const board = { width: 9, height: 9, mines: 10 };
assert.equal(GameData.metrics.find((m) => m.id === 'stnb').value(current, board), stnbOf(current, board));
assert.equal(GameData.metrics.find((m) => m.id === 'ioe').value(current), 60 / 82);
assert.equal(new Set(GameData.metrics.map((m) => m.id)).size, GameData.metrics.length);
console.log('game-data: scope boundaries, historical windows, eligible populations, missing values, ties, metric catalog, and autozoom passed');

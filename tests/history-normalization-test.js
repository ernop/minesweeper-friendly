'use strict';
// Load-time normalization must name exactly the stored entries it changes, so
// persisting it can never clear a record another open tab saved meanwhile.

const assert = require('node:assert/strict');
const vm = require('node:vm');
const source = require('./game-source.js').source;
const start = source.indexOf('function normalizeHistory(raw)');
const end = source.indexOf('//-------PLAY HISTORY: TRANSFER CLEANING (pure)-------', start);
assert(start >= 0 && end > start, 'normalizeHistory is present');

const context = vm.createContext({
  normalizeHistoryKey: (key) => key.includes('@') ? key : key + '@standard',
  // Records without actionEvaluations are the legacy shape normalization upgrades.
  normalizeGameRecord: (record) => Array.isArray(record.actionEvaluations)
    ? { record: { ...record }, changed: false }
    : { record: { ...record, actionEvaluations: [] }, changed: true },
});
vm.runInContext(source.slice(start, end), context);
const normalize = (raw) => JSON.parse(JSON.stringify(vm.runInContext('normalizeHistory', context)(raw)));

const modern = (endedAt, outcome = 'win') => ({ endedAt, outcome, actionEvaluations: [] });

// Already-normalized records: nothing to write, nothing to delete.
const clean = normalize({ '9x9/10@standard': [modern(1), modern(2)] });
assert.equal(clean.changed, false);
assert.deepEqual(clean.writes, []);
assert.deepEqual(clean.deletions, []);

// One upgraded record is the only write; untouched siblings stay untouched.
const upgraded = normalize({ '9x9/10@standard': [modern(1), { endedAt: 2, outcome: 'loss' }, modern(3)] });
assert.equal(upgraded.changed, true);
assert.deepEqual(upgraded.writes, [['9x9/10@standard', { endedAt: 2, outcome: 'loss', actionEvaluations: [] }]]);
assert.deepEqual(upgraded.deletions, []);
assert.deepEqual(upgraded.history['9x9/10@standard'].map((r) => r.endedAt), [1, 2, 3]);

// A legacy key moves: each entry is deleted there and written under the
// normalized key. Sorted key order puts the legacy key first, so its copy of a
// shared endedAt is the one kept, overwriting the modern key's duplicate.
const moved = normalize({
  '9x9/10': [modern(5, 'loss'), modern(7)],
  '9x9/10@standard': [modern(5, 'win'), modern(6)],
});
assert.deepEqual(moved.deletions, [['9x9/10', 5], ['9x9/10', 7]]);
assert.deepEqual(moved.writes, [['9x9/10@standard', modern(5, 'loss')], ['9x9/10@standard', modern(7)]]);
assert.deepEqual(moved.history['9x9/10@standard'].map((r) => [r.endedAt, r.outcome]),
  [[5, 'loss'], [6, 'win'], [7, 'win']]);

console.log('history normalization: exact writes and legacy-key deletions passed');

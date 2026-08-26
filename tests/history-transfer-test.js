'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'minesweeper.js'), 'utf8');
const start = source.indexOf('//-------PLAY HISTORY: TRANSFER CLEANING (pure)-------');
const end = source.indexOf('//-------PLAY HISTORY: TRANSFER CLEANING END-------');
if (start < 0 || end < 0) throw new Error('transfer-cleaning section marker missing');

globalThis.GAME_RECORD_SCHEMA = [
  { field: 'endedAt', valid: (v) => typeof v === 'number' && Number.isFinite(v) },
  { field: 'outcome', valid: (v) => v === 'win' || v === 'loss' },
  { field: 'note', valid: (v) => v === undefined || typeof v === 'string' },
  { field: 'actionEvaluations', valid: (v) => v === undefined || Array.isArray(v) },
];
globalThis.SETTINGS_SCHEMA = [
  { field: 'playMode', valid: (v) => v === 'standard' },
  { field: 'zoom', valid: (v) => typeof v === 'number' && Number.isFinite(v) },
];
globalThis.normalizeHistoryKey = (key) => key.includes('@') ? key : key + '@standard';
globalThis.normalizeGameRecord = (record) => ({
  record: {
    ...record,
    actionEvaluations: Array.isArray(record.actionEvaluations)
      ? record.actionEvaluations : [],
  },
});

vm.runInThisContext(source.slice(start, end));

let checks = 0;
function check(name, condition) {
  checks++;
  if (!condition) throw new Error(name);
}

{
  const transfer = cleanTransferredHistory({
    '9x9/10': [
      { endedAt: 1, outcome: 'win', note: 'kept' },
      { endedAt: null, outcome: 'loss' },
      { endedAt: Infinity, outcome: 'win' },
    ],
    broken: 'not a list',
  });
  check('valid sibling survives', transfer.gameCount === 1);
  check('legacy key normalized', transfer.history['9x9/10@standard'].length === 1);
  check('irreparable records skipped', transfer.skippedRecords === 2);
  check('malformed list skipped', transfer.skippedLists === 1);
}

{
  const transfer = cleanTransferredHistory({
    '9x9/10@standard': [
      { endedAt: 2, outcome: 'loss', note: 42, actionEvaluations: 'broken' },
    ],
  });
  const record = transfer.history['9x9/10@standard'][0];
  check('record with bad optional fields survives', transfer.gameCount === 1);
  check('bad optional fields counted', transfer.repairedFields === 2);
  check('bad optional scalar removed', !('note' in record));
  check('bad action evidence normalized', Array.isArray(record.actionEvaluations));
}

{
  const imported = cleanTransferredSettings(
    { playMode: 'standard', zoom: Infinity, legacySetting: true }, true);
  check('valid setting retained', imported.settings.playMode === 'standard');
  check('invalid setting discarded', !('zoom' in imported.settings));
  check('legacy import input preserved', imported.settings.legacySetting === true);
  check('invalid setting counted', imported.skippedFields === 1);

  const exported = cleanTransferredSettings(
    { playMode: 'standard', zoom: 24, legacySetting: true }, false);
  check('export has current valid settings', exported.settings.zoom === 24);
  check('export omits unknown settings', !('legacySetting' in exported.settings));
}

check('non-finite numbers are rejected by the real schema helper',
  source.includes("const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);"));

console.log(`history-transfer: all ${checks} checks passed`);

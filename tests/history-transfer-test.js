'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = require('./game-source.js').source;
const start = source.indexOf('//-------PLAY HISTORY: TRANSFER CLEANING (pure)-------');
const end = source.indexOf('//-------PLAY HISTORY: TRANSFER CLEANING END-------');
if (start < 0 || end < 0) throw new Error('transfer-cleaning section marker missing');

globalThis.GAME_RECORD_SCHEMA = [
  { field: 'endedAt', valid: (v) => typeof v === 'number' && Number.isFinite(v) },
  { field: 'outcome', valid: (v) => v === 'win' || v === 'loss' },
  { field: 'note', valid: (v) => v === undefined || typeof v === 'string' },
  { field: 'actionEvaluations', valid: (v) => v === undefined || Array.isArray(v) },
];
globalThis.BoardGenerators = require('../generators.js');
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'game-data.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'during-game.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'board-icons.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'settings-core.js'), 'utf8'));
globalThis.normalizeHistoryKey = (key) => key.includes('@') ? key : key + '@standard';
globalThis.normalizeGameRecord = (record) => ({
  record: {
    ...record,
    actionEvaluations: Array.isArray(record.actionEvaluations)
      ? record.actionEvaluations : [],
  },
});

vm.runInThisContext(source.slice(start, end));
const storageSource = fs.readFileSync(path.join(__dirname, '..', 'storage.js'), 'utf8');
const renameStart = storageSource.indexOf('const RENAMED_RECORD_FIELDS');
const renameEnd = storageSource.indexOf('const dbRequest');
if (renameStart < 0 || renameEnd < renameStart) throw new Error('storage.js record renames missing');
vm.runInThisContext(storageSource.slice(renameStart, renameEnd));

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
  // A backup from before 2026-10-27 carries the old field names.
  const transfer = cleanTransferredHistory({
    '9x9/10@standard': [{ endedAt: 3, outcome: 'win', clicks: 12, wastedClicks: 1, movesRanOut: 2 }],
  });
  const record = transfer.history['9x9/10@standard'][0];
  check('old field names import under the current ones',
    record.boardChangingClicks === 12 && record.noOpClicks === 1 && record.movesMovedOn === 2);
  check('old field names are gone', !('clicks' in record || 'wastedClicks' in record || 'movesRanOut' in record));
  check('renaming is not a repair', transfer.repairedFields === 0);
}

{
  const imported = cleanTransferredSettings(
    { playMode: 'standard', cellSize: Infinity, legacySetting: true }, true);
  check('valid setting retained', imported.settings.playMode === 'standard');
  check('invalid setting discarded', !('cellSize' in imported.settings));
  check('legacy import input preserved', imported.settings.legacySetting === true);
  check('invalid setting counted', imported.skippedFields === 1);

  const exported = cleanTransferredSettings(
    { playMode: 'standard', cellSize: 64, legacySetting: true }, false);
  check('export has current valid settings', exported.settings.cellSize === 64);
  check('export omits unknown settings', !('legacySetting' in exported.settings));
}

check('non-finite numbers are rejected by the real schema helper',
  source.includes("const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);"));

console.log(`history-transfer: all ${checks} checks passed`);

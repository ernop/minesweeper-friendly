'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Match the settings page: no game globals, solver, DOM, or CommonJS loader.
const saved = new Map();
const context = vm.createContext({
  structuredClone,
  persistUserdata: (kind, value) => saved.set(kind, structuredClone(value)),
});
for (const file of ['generators.js', 'settings-core.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
}
const run = (source) => vm.runInContext(source, context);
const plain = (value) => JSON.parse(JSON.stringify(value));
const defaults = plain(run('settingsFrom({})'));

assert.equal(defaults.cellSize, 28);
assert(run('SETTINGS_SCHEMA.every((s) => s.valid(s.default))'));
assert(run('new Set(SETTINGS_SCHEMA.map((s) => s.field)).size === SETTINGS_SCHEMA.length'));
for (const value of [undefined, null, [], 'bad', 42]) {
  context.stored = value;
  assert.deepEqual(plain(run('settingsFrom(stored)')), defaults);
}

for (const size of plain(run('CELL_SIZE_CHOICES'))) {
  context.size = size;
  run('settings = settingsFrom({ cellSize: size, numberDisplay: "letters", boardOffsetX: 120 }); saveSettings()');
  assert.equal(saved.size, 1, 'preferences share one settings entry');
  const exported = plain(run('cleanTransferredSettings(settings, false).settings'));
  assert.equal(exported.cellSize, size);
  context.stored = JSON.parse(JSON.stringify(saved.get('settings')));
  const reloaded = plain(run('settingsFrom(stored)'));
  assert.deepEqual(reloaded, exported, 'storage and backup use the same format');
  assert.equal(reloaded.numberDisplay, 'letters');
  assert.equal(reloaded.boardOffsetX, 120);
}
assert(saved.get('settings').cellSize > 32);

context.stored = {
  cellSize: 100000, playMode: 'missing', metricsPanelWidth: NaN,
  sessionLookbackSeconds: -1, sessionLookbackGames: 2, sessionWindowMinutes: 17,
  recentPlacementsWindow: 'never', boardGenerator: 'missing',
  boardGeneratorParams: { unknown: { scale: 4 } },
  boardOffsetX: Infinity, boardOffsetY: -1001, numberDisplay: 'emoji',
  averageChartMode: 'unknown', justUniverse: 'true',
};
assert.deepEqual(plain(run('settingsFrom(stored)')), defaults);
for (const size of [null, '64', 0, 33, 64.5, Infinity, -16]) {
  context.size = size;
  assert.equal(run('settingsFrom({ cellSize: size }).cellSize'), 28);
  assert.equal(run('cleanTransferredSettings({ cellSize: size }, true).skippedFields'), 1);
}

context.stored = {
  cellSize: 64,
  shownThings: { gameStats: false },
  boardGenerator: 'pink-noise',
  boardGeneratorParams: { 'pink-noise': { scale: 12 } },
};
run('settings = settingsFrom(stored)');
assert.equal(run('settings.shownThings.gameStats'), false);
assert.equal(run('settings.shownThings.timeTables'), true);
run('settings.boardGeneratorParams["pink-noise"].scale = 16; settings.shownThings.gameStats = true');
assert.equal(context.stored.boardGeneratorParams['pink-noise'].scale, 12);
assert.equal(context.stored.shownThings.gameStats, false);
run('saveSettings(); settings.cellSize = 16');
assert.equal(saved.get('settings').cellSize, 64, 'later RAM changes cannot alter the saved snapshot');
assert.deepEqual(plain(run('settingsFrom({})')), defaults, 'defaults cannot be mutated through settings');

assert.equal(run('settingsFrom({ reportCategories: { gameRisk: true } }).reportScope'), 'risk');
assert.equal(run('settingsFrom({ shownThings: { endVerdict: false } }).reportScope'), 'none');
assert.equal(run('settingsFrom({ reportScope: "full", shownThings: { endVerdict: false } }).reportScope'), 'full');
assert.deepEqual(plain(run('settingsFrom(Object.create({ cellSize: 96 }))')), defaults);

console.log('settings-state: shared validation, defaults, migration, isolation, and backup round trips passed');

const choices = {
  difficulty: 'custom', customBoard: { width: 24, height: 12, mines: 45 },
  customBoardDraft: { width: '25', height: '12', mines: '45' },
  playerStates: [{ name: 'new mouse', active: true }, { name: 'sleepy', active: false }],
  pathView: 'click-speed', replayOverlays: { moves: false, mines: false, probs: true, pointless: true, purposeful: true, movement: true },
  metricsPanelCollapsed: true, trialSpeedBucketMs: 375, resultView: 'scores',
  replayPosition: { endedAt: 12345, step: 7 },
  panels: { boardPosition: true, gameDetails: true, states: true, replay: true, reviewOptions: true, reviewDisplay: true, importHistory: true, dataFormat: true },
  trialSections: { '123:identity:1': false, '123:action:456': true },
  drafts: { stateName: 'draft', historyImport: '{', preferencesImport: '{' },
  viewPosition: { pageX: 14, pageY: 400, metricsX: 2, metricsY: 120, focusId: 'custom-width' },
};
context.choices = choices;
run('settings = settingsFrom({}); updateSettings(choices)');
const savedChoices = plain(saved.get('settings'));
for (const [key, value] of Object.entries(choices)) assert.deepEqual(savedChoices[key], value);
const preferenceFile = run('exportPreferences()');
run('settings = settingsFrom({})');
context.preferenceFile = preferenceFile;
run('importPreferences(preferenceFile)');
assert.deepEqual(plain(run('settings')), savedChoices);
assert.equal(saved.size, 1, 'preferences transfer never writes history or traces');
const beforeBadImport = run('exportPreferences()');
assert.throws(() => run(`importPreferences('{"difficulty":"not-a-preset"}')`), /invalid preference/);
assert.throws(() => run(`importPreferences('{"history":{}}')`), /unknown preference/);
assert.equal(run('exportPreferences()'), beforeBadImport, 'invalid imports are atomic');
console.log('settings-state: all board, view, draft, tag, and independent preference-transfer choices passed');

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
for (const file of ['generators.js', 'game-data.js', 'during-game.js', 'board-icons.js', 'settings-core.js']) {
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
  cellSize: 100000, playMode: 'missing', sessionDefinition: 'never', gameDataSwitchCost: 'yes',
  gameDataSessionMetrics: { unknown: true }, gameDataShowValues: 'yes', boardGenerator: 'missing',
  boardGeneratorParams: { unknown: { scale: 4 } },
  boardOffsetX: Infinity, boardOffsetY: -1001, numberDisplay: 'emoji',
  perfChartMode: 'unknown', boardChartMode: 'unknown', justUniverse: 'true',
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

// One game data selection replaced the separate lifetime and session ones.
const merged = plain(run(`settingsFrom({
  gameDataLifetimeMetrics: { time: false, clickRate: false, ioe: true },
  gameDataSessionMetrics: { time: true, clickRate: false },
})`));
assert.equal(merged.gameDataMetrics.time, true, 'a measurement either old selection showed stays shown');
assert.equal(merged.gameDataMetrics.clickRate, false, 'a measurement both old selections hid stays hidden');
assert.equal(merged.gameDataMetrics.ioe, true);
assert.equal(merged.gameDataMetrics.misclickRate, defaults.gameDataMetrics.misclickRate, 'unset measurements keep their defaults');
assert(!('gameDataLifetimeMetrics' in merged) && !('gameDataSessionMetrics' in merged), 'the old selections are not kept');
assert.equal(run('settingsFrom({ gameDataMetrics: { time: false } }).gameDataMetrics.time'), false);
assert.equal(run('settingsFrom({ gameDataMetrics: { time: false } }).gameDataMetrics.clickRate'), true);
// A selection saved before a measurement's removal keeps its other choices.
const beforeRemoval = plain(run('settingsFrom({ gameDataMetrics: { time: false, flagsWithoutMultiCellChord: true } }).gameDataMetrics'));
assert.equal(beforeRemoval.time, false, 'the removed measurement does not discard the saved selection');
assert(!('flagsWithoutMultiCellChord' in beforeRemoval));
// Panel states saved while the Replay game disclosure existed keep the rest.
const panelsBeforeRemoval = plain(run('settingsFrom({ panels: { states: true, replay: true, duringGame: false } }).panels'));
assert.equal(panelsBeforeRemoval.states, true, 'the removed replay panel does not discard the saved panel states');
assert.equal(panelsBeforeRemoval.duringGame, false);
assert(!('replay' in panelsBeforeRemoval));
// Panel states saved while the Overlays panel existed keep the rest.
const panelsBeforeOverlaysRemoval = plain(run('settingsFrom({ panels: { states: true, reviewOptions: true } }).panels'));
assert.equal(panelsBeforeOverlaysRemoval.states, true, 'the removed Overlays panel does not discard the saved panel states');
assert(!('reviewOptions' in panelsBeforeOverlaysRemoval));
// Row choices saved before left work split into hard and easy work keep the
// rest, and both new rows take its choice.
const rowsBeforeSplit = plain(run('settingsFrom({ duringGameRows: { leftWorkEvents: false, forkEvents: false } }).duringGameRows'));
assert.deepEqual([rowsBeforeSplit.leftHardWorkEvents, rowsBeforeSplit.leftEasyWorkEvents, rowsBeforeSplit.forkEvents],
  [false, false, false], 'a hidden left work row hides both rows that replaced it');
assert.equal(rowsBeforeSplit.movedOnEvents, defaults.duringGameRows.movedOnEvents, 'unset rows keep their defaults');
assert(!('leftWorkEvents' in rowsBeforeSplit));
assert.equal(run('settingsFrom({ duringGameRows: { leftHardWorkEvents: false } }).duringGameRows.leftEasyWorkEvents'), true);

// The three presets are Standard with the default generator; a block that
// paired one with another mode continues as that mode on the custom board
// at the preset's size, and saving the pairing is a bug that throws.
run('settings = settingsFrom({})');
run('loadSettings({ settings: { difficulty: "expert", playMode: "angelic", customBoard: { width: 12, height: 12, mines: 20 } } })');
assert.deepEqual(plain(run('[settings.difficulty, settings.playMode, settings.customBoard, settings.customBoardDraft]')),
  ['custom', 'angelic', { width: 30, height: 16, mines: 99 }, { width: '30', height: '16', mines: '99' }]);
run('loadSettings({ settings: { difficulty: "expert", playMode: "standard" } })');
assert.deepEqual(plain(run('[settings.difficulty, settings.playMode]')), ['expert', 'standard']);
assert.throws(() => run('settings.playMode = "angelic"; saveSettings()'), /a preset board is played only in Standard/);
// Game data's board traits followed the This board table switches until
// configure chose them (2026-10-14).
assert.deepEqual(defaults.gameDataBoardTraits, plain(run('GAME_DATA_BOARD_TRAIT_DEFAULTS')));
assert.equal(defaults.gameDataBoardTraits.workSpread, false, '3BV spread stays off by default');
assert.deepEqual(plain(run(`settingsFrom({ shownThings: {
  exactHZiNi: false, workSpreadTable: true, boardShapeTables: false, largestIsland: true,
} }).gameDataBoardTraits`)), {
  bv3: true, zini: true, maxAdjacent: true, hzini: false, workSpread: true, zeroOneShare: true,
  zeroOpeningCoverage: true, islandCount: false, largestIsland: false, zeroCount: false,
}, 'a saved profile starts from what its table switches showed');
assert.equal(run('settingsFrom({ shownThings: { largestIsland: true } }).gameDataBoardTraits.largestIsland'), true);
assert.equal(run('settingsFrom({ gameDataBoardTraits: { hzini: true }, shownThings: { exactHZiNi: false } }).gameDataBoardTraits.hzini'),
  true, 'a saved board-trait selection wins over the table switches');
assert.equal(run('settingsFrom({ gameDataBoardTraits: { hzini: false } }).gameDataBoardTraits.bv3'), true,
  'unset traits keep their defaults');
assert.deepEqual(plain(run('settingsFrom({ gameDataBoardTraits: { unknown: true } }).gameDataBoardTraits')),
  defaults.gameDataBoardTraits);
assert.equal(run('settingsFrom({ gameDataBandPool: "day" }).gameDataBandPool'), 'lifetime');
assert.equal(defaults.gameDataDistributionPools, 'both', 'distributions show both pools until the switch says otherwise');
assert.equal(run('settingsFrom({ gameDataDistributionPools: "day" }).gameDataDistributionPools'), 'both');

// Mine styles: the setting offers exactly the drawn styles, classic first
// and by default, and every style draws a mine and a crossed-out wrong flag.
const mineStyleIds = plain(run('MINE_STYLES.map((style) => style.id)'));
assert.equal(mineStyleIds.length, 5);
assert.equal(new Set(mineStyleIds).size, 5);
assert.equal(defaults.mineStyle, 'classic');
assert.equal(mineStyleIds[0], 'classic');
assert.deepEqual(plain(run('MINE_STYLE_CHOICES.map(([id]) => id)')), mineStyleIds);
for (const id of mineStyleIds) {
  context.id = id;
  assert.equal(run('settingsFrom({ mineStyle: id }).mineStyle'), id);
  assert.match(run('mineSvg(id)'), /^<svg viewBox="0 0 16 16"( class="mine-full-size")?>.*<\/svg>$/);
  assert(run('wrongFlagSvg(id)').includes('stroke="#ff0000"'));
}
assert.equal(run('settingsFrom({ mineStyle: "skull" }).mineStyle'), 'classic');

// Flags: five styles, a size slider and a color-strength slider; the
// defaults are the classic flag, which the problems page also draws.
const flagStyleIds = plain(run('FLAG_STYLES.map((style) => style.id)'));
assert.equal(flagStyleIds.length, 5);
assert.equal(new Set(flagStyleIds).size, 5);
assert.deepEqual(plain(run('FLAG_STYLE_CHOICES.map(([id]) => id)')), flagStyleIds);
assert.deepEqual([defaults.flagStyle, defaults.flagSize, defaults.flagIntensity],
  plain(run('[CLASSIC_FLAG.style, CLASSIC_FLAG.sizePercent, CLASSIC_FLAG.intensityPercent]')));
for (const [field, good, bad] of [['flagSize', [20, 45, 100], [15, 47, 105, 45.5, '45']],
  ['flagIntensity', [10, 50, 100], [0, 55, 110, '100']]]) {
  context.field = field;
  for (const value of good) {
    context.value = value;
    assert.equal(run('settingsFrom({ [field]: value })[field]'), value, field + ' keeps ' + value);
  }
  for (const value of bad) {
    context.value = value;
    assert.equal(run('settingsFrom({ [field]: value })[field]'), defaults[field], field + ' rejects ' + value);
  }
}
assert.equal(run('flagColor(100)'), run('FLAG_COLOR'), 'full strength is the reserved magenta');
assert.notEqual(run('flagColor(50)'), run('FLAG_COLOR'));
for (const id of flagStyleIds) {
  context.id = id;
  const svg = run('flagSvg(id, 100)');
  assert.match(svg, /^<svg viewBox="0 0 16 16" class="flag">.*<\/svg>$/);
  assert(svg.includes('#ff00ff'), id + ' draws in the flag color');
  assert(run('flagSvg(id, 30)').includes(run('flagColor(30)')), id + ' follows the color strength');
}
assert.throws(() => run('flagSvg("banner", 100)'), /unknown flag style: banner/);
assert.throws(() => run('mineSvg("skull")'), /unknown mine style: skull/);

console.log('settings-state: shared validation, defaults, migration, isolation, and backup round trips passed');

const choices = {
  sessionDefinition: 'past30min', gameDataShowValues: false,
  gameDataMetrics: { ...defaults.gameDataMetrics, fastclickGap: false, ioe: true },
  gameDataBoardTraits: { ...defaults.gameDataBoardTraits, hzini: false, largestIsland: true },
  gameDataBandPool: 'session', gameDataDistributions: true, gameDataDistributionPools: 'session',
  difficulty: 'custom', customBoard: { width: 24, height: 12, mines: 45 },
  customBoardDraft: { width: '25', height: '12', mines: '45' },
  playerStates: [{ name: 'new mouse', active: true }, { name: 'sleepy', active: false }],
  pathView: 'click-speed', replayOverlays: { moves: false, mines: false, probs: true, pointless: true, purposeful: true, movement: true },
  gameDataSwitchCost: true, trialSpeedBucketMs: 375, resultView: 'scores',
  replayPosition: { endedAt: 12345, step: 7 },
  panels: { boardPosition: true, gameDetails: true, states: true, importHistory: true, dataFormat: true,
    duringGame: false, gamePerformance: false, boardTraits: false, motionStats: true },
  trialSections: { '123:identity:1': false, '123:action:456': true },
  drafts: { stateName: 'draft', historyImport: '{', preferencesImport: '{' },
  viewPosition: { pageX: 14, pageY: 400, focusId: 'custom-width' },
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

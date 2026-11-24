'use strict';

// Each setting has one place (creator 2026-10-21): what the settings page
// shows is changed only there, and the game page carries no copy of it.

const fs = require('fs');
const vm = require('vm');
const path = require('path');

globalThis.BoardGenerators = require('../generators.js');
for (const file of ['game-data.js', 'during-game.js', 'board-icons.js', 'settings-core.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
}
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('index.html');
const gamePage = [require('./game-source.js').source, read('preferences-game.js'), html].join('\n');

let checks = 0;
function check(name, condition) {
  checks++;
  if (!condition) throw new Error(name);
}

const onSettingsPage = SETTINGS_SCHEMA.filter((s) => s.control !== 'none').map((s) => s.field);
check('the settings page holds global play, board look, and report scope, not local view composition',
  onSettingsPage.includes('reportScope') && onSettingsPage.includes('guardianAngel')
    && !onSettingsPage.includes('shownThings') && !onSettingsPage.includes('collapseDuplicateCharts'));
for (const field of onSettingsPage) {
  const writes = [
    new RegExp('settings\\.' + field + '(\\.\\w+|\\[[^\\]]+\\])?\\s*=(?!=)'),
    new RegExp('updateSettings\\(\\{[^}]*\\b' + field + '\\s*:'),
    new RegExp("rememberPreference\\('" + field + "'"),
  ];
  check('the game page never changes ' + field + ', which the settings page shows',
    writes.every((pattern) => !pattern.test(gamePage)));
}
check('the game page renders no copy of the report choice',
  !/\bREPORT_SCOPE_CHOICES\b/.test(gamePage));
const settingsPage = read('settings-page.js');
check('the settings page renders no copy of the game page\'s local result-section switches',
  !/\b(RESULT_SECTION_GROUPS|SHOWN_THINGS_OPTIONS|setResultSectionShown)\b/.test(settingsPage));
check('the game page renders the local result-section groups',
  gamePage.includes('for (const [groupLabel, paths] of RESULT_SECTION_GROUPS)'));
{
  const transportStart = html.indexOf('<div id="replay-controls"');
  const transport = html.slice(transportStart, html.indexOf('id="board-position-drag-surface"', transportStart));
  check('the replay\'s own view toggles end its transport, each at its top level, behind no opener',
    transportStart > 0
      && transport.includes('id="replay-overlay-control"') && transport.includes('id="path-view-control"')
      && !transport.includes('<select') && !transport.includes('type="checkbox"')
      && !/<details|<summary|popover/.test(transport)
      && !html.includes('id="review-options"'));
}

console.log(`settings-one-place: all ${checks} checks passed`);

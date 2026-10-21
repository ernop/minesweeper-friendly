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
check('the settings page shows the report choice and every result-section switch',
  ['reportScope', 'shownThings', 'collapseDuplicateCharts'].every((field) => onSettingsPage.includes(field)));
for (const field of onSettingsPage) {
  const writes = [
    new RegExp('settings\\.' + field + '(\\.\\w+|\\[[^\\]]+\\])?\\s*=(?!=)'),
    new RegExp('updateSettings\\(\\{[^}]*\\b' + field + '\\s*:'),
    new RegExp("rememberPreference\\('" + field + "'"),
  ];
  check('the game page never changes ' + field + ', which the settings page shows',
    writes.every((pattern) => !pattern.test(gamePage)));
}
check('the game page renders no copy of the report choice or the result-section switches',
  !/\b(RESULT_SECTION_GROUPS|REPORT_SCOPE_CHOICES|setResultSectionShown)\b/.test(gamePage));
check('the settings page renders the result-section groups',
  read('settings-page.js').includes('for (const [groupLabel, paths] of RESULT_SECTION_GROUPS)'));
{
  const panelStart = html.indexOf('<div id="review-options"');
  const panel = html.slice(panelStart, html.indexOf('</aside>', panelStart));
  check('the overlays panel holds only the board overlays and the mouse path, each option at its top level',
    panelStart > 0
      && panel.includes('<strong>Overlays</strong>')
      && panel.includes('id="replay-overlay-control"') && panel.includes('id="path-view-control"')
      && !panel.includes('<select') && !panel.includes('type="checkbox"')
      && !/<details|<summary|popover(?!target)/.test(panel.slice(panel.indexOf('>') + 1)));
}

console.log(`settings-one-place: all ${checks} checks passed`);

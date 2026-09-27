'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

globalThis.BoardGenerators = require('../generators.js');
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'game-data.js'), 'utf8'));
const source = fs.readFileSync(path.join(__dirname, '..', 'settings-core.js'), 'utf8');
vm.runInThisContext(source);

let checks = 0;
function check(name, condition) {
  checks++;
  if (!condition) throw new Error(name);
}

{
  const fresh = settingsFrom({});
  check('new-player default shows no action report', fresh.reportScope === 'none');
  check('new-player session stats are off', fresh.showSessionStats === false);
  check('session defaults to running averages', fresh.sessionAggregation === 'average');
  check('session defaults to played-time rates', fresh.sessionRateBasis === 'time');
  check('per-game grouping defaults to five completed games',
    fresh.sessionLookbackGames === 5);
  check('session defaults to exact current mode', fresh.sessionModeScope === 'current');
  check('the one session defaults to today', fresh.sessionDefinition === 'today');
  check('today starts at local midnight, not 24 hours back',
    SessionScope.bounds('today', new Date(2026, 8, 23, 7, 30).getTime()).from
      === new Date(2026, 8, 23).getTime());
  check('retired category block is not rewritten',
    !('reportCategories' in fresh));
  check('retired detail setting is not rewritten',
    !('reportDetail' in fresh));
}

{
  check('old hidden report becomes nothing',
    settingsFrom({ shownThings: { endVerdict: false } }).reportScope === 'none');
  check('old fatal plus risk switches become risk tier',
    settingsFrom({ reportCategories: {
      gameLoss: true, gameRisk: true, timeLoss: false,
      lifeMaximization: false, measurementNotes: false,
    } }).reportScope === 'risk');
  check('any old extended category becomes full tier',
    settingsFrom({ reportCategories: {
      gameLoss: true, gameRisk: true, timeLoss: true,
    } }).reportScope === 'full');
  check('explicit modern scope wins over legacy fields',
    settingsFrom({
      reportScope: 'fatal',
      shownThings: { endVerdict: false },
    }).reportScope === 'fatal');
}

check('all four scope choices are schema-valid',
  REPORT_SCOPE_CHOICES.length === 4
    && REPORT_SCOPE_CHOICES.every(([id]) => validReportScope(id)));
check('unknown scope rejected', validReportScope('everything-ish') === false);

{
  const paths = RESULT_SECTION_GROUPS.flatMap(([, groupPaths]) => groupPaths);
  const expected = [
    ...SHOWN_THINGS_OPTIONS.map(([key]) => 'shownThings.' + key),
    ...SETTINGS_SCHEMA.filter((s) => s.control === 'result-section').map((s) => s.field),
  ];
  check('every result-section switch is in exactly one group',
    paths.length === new Set(paths).size
      && JSON.stringify(paths.slice().sort()) === JSON.stringify(expected.sort()));
  check('every grouped switch has a name and a description',
    paths.map(resultSectionSwitch).every((entry) => entry.label && entry.describe));
  check('grouped settings are booleans',
    SETTINGS_SCHEMA.filter((s) => s.control === 'result-section')
      .every((s) => typeof s.default === 'boolean'));
}

console.log(`report-settings: all ${checks} checks passed`);

'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'settings-core.js'), 'utf8');
vm.runInThisContext(source);

let checks = 0;
function check(name, condition) {
  checks++;
  if (!condition) throw new Error(name);
}

{
  const fresh = settingsFrom({});
  check('new-player default is fatal only', fresh.reportScope === 'fatal');
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

console.log(`report-settings: all ${checks} checks passed`);

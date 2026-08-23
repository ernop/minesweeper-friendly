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
  check('fatal actions shown by default', fresh.reportCategories.gameLoss === true);
  check('game risk shown by default', fresh.reportCategories.gameRisk === true);
  check('time loss shown by default', fresh.reportCategories.timeLoss === true);
  check('model-relative advice is opt-in',
    fresh.reportCategories.lifeMaximization === false);
  check('full position detail preserves existing default',
    fresh.reportDetail === 'positions');
}

{
  const stored = settingsFrom({
    reportCategories: { timeLoss: false },
    reportDetail: 'summary',
  });
  check('partial stored category merges with newer defaults',
    stored.reportCategories.gameLoss === true
      && stored.reportCategories.timeLoss === false);
  check('stored detail retained', stored.reportDetail === 'summary');
}

check('unknown category rejected',
  validReportCategories({ gameLoss: true, imaginary: true }) === false);
check('all detail choices are schema-valid',
  REPORT_DETAIL_CHOICES.every(([id]) =>
    SETTINGS_SCHEMA.find((entry) => entry.field === 'reportDetail').valid(id)));

console.log(`report-settings: all ${checks} checks passed`);

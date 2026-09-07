'use strict';

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'minesweeper.js'), 'utf8');

let checks = 0;
function check(name, condition) {
  checks++;
  if (!condition) throw new Error(name);
}

check('every post-game report scope uses the same display panel',
  source.includes('renderReviewDisplay(() => renderResult(record, modeRecords, options))')
    && !source.includes('resultStats.appendChild(buildReportScopeControl('));
check('display controls survive report redraws',
  source.includes('if (host.childElementCount > 0) {')
    && source.includes('host.reviewChange = onChange;'));
check('display options reuse the complete shared section list',
  source.includes('for (const [key, name, description] of SHOWN_THINGS_OPTIONS)'));

const sessionRenderStart = source.indexOf('function appendSessionSection(');
const sessionRenderEnd = source.indexOf(
  '\nfunction appendSessionEndingsRow(', sessionRenderStart);
const sessionRender = source.slice(sessionRenderStart, sessionRenderEnd);
check('session category chart always uses every report category',
  sessionRender.includes(
    'const categorySpecs = SESSION_CATEGORY_RATE_SPECS;'));
check('session magnitude charts ignore after-game report scope',
  !sessionRender.includes('reportCategoryEnabled('));

console.log(`report-control-layout: all ${checks} checks passed`);

'use strict';

const fs = require('fs');
const path = require('path');

const source = require('./game-source.js').source;

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
check('display options reuse the shared result-section groups',
  source.includes('for (const [groupLabel, paths] of RESULT_SECTION_GROUPS)'));
{
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const panelStart = html.indexOf('<div id="review-options"');
  const panel = html.slice(panelStart, html.indexOf('</aside>', panelStart));
  check('every display option is at the panel\u2019s top level, none collapsed',
    panelStart > 0 && !/<details|<summary|popover(?!target)/.test(panel.slice(panel.indexOf('>') + 1)));
  const settingsPage = fs.readFileSync(path.join(__dirname, '..', 'settings-page.js'), 'utf8');
  check('the settings page renders the same groups',
    settingsPage.includes('for (const [groupLabel, paths] of RESULT_SECTION_GROUPS)'));
}

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

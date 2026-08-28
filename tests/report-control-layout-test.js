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

check('full report keeps its selector above analysis',
  source.includes("if (settings.reportScope === 'full') {\n"
    + '      resultAnalysis.appendChild(buildReportScopeControl('));

check('compact report scopes put the selector in the stats block',
  source.includes("if (!historyView && settings.reportScope !== 'full') {\n"
    + '    resultStats.appendChild(buildReportScopeControl('));

const statsAppend = source.indexOf('resultStats.appendChild(statsGrid);');
const compactControl = source.indexOf(
  "if (!historyView && settings.reportScope !== 'full') {", statsAppend);
check('compact selector follows the stats table',
  statsAppend >= 0 && compactControl > statsAppend);

console.log(`report-control-layout: all ${checks} checks passed`);

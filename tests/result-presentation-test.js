'use strict';
// Known-answer tests for the shared semantic order used by post-game and
// score-view result surfaces.

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const repo = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'minesweeper.js'), 'utf8');
const startIdx = source.indexOf('//-------RESULT PRESENTATION MODEL');
const endIdx = source.indexOf('//-------RESULT PRESENTATION DISPLAY');
if (startIdx === -1 || endIdx === -1) throw new Error('section markers not found');
vm.runInThisContext(source.slice(startIdx, endIdx));

let checks = 0;
function assertEq(name, actual, want) {
  checks++;
  if (actual !== want) throw new Error(`${name}: got ${actual}, want ${want}`);
}

assertEq(
  'post-game phase order',
  resultPresentationPhases('postGame').map((phase) => phase.id).join(','),
  'outcome,facts,analysis,placements,rankings,streaks,averages,relationships,diagnostics');

assertEq(
  'score phase order',
  resultPresentationPhases('scores').map((phase) => phase.id).join(','),
  'outcome,facts,placements,rankings,streaks,averages,relationships');

assertEq(
  'post-game chart order',
  resultChartSections('postGame').map((section) => section.id).join(','),
  'placements,rankings,streaks,averages,relationships,diagnostics');

assertEq(
  'score chart order',
  resultChartSections('scores').map((section) => section.id).join(','),
  'placements,rankings,streaks,averages,relationships');

for (const context of ['postGame', 'scores']) {
  const ids = resultChartSections(context).map((section) => section.id);
  const lastPagetable = Math.max(
    ...['placements', 'rankings', 'streaks'].map((id) => ids.indexOf(id)));
  const firstPointChart = Math.min(
    ...['averages', 'relationships'].map((id) => ids.indexOf(id)));
  assertEq(`${context} pagetables precede point charts`,
    lastPagetable < firstPointChart, true);
}

assertEq(
  'score viewer excludes action analysis',
  resultPresentationPhases('scores').some((phase) => phase.id === 'analysis'),
  false);

assertEq(
  'score viewer excludes diagnostics',
  resultChartSections('scores').some((section) => section.id === 'diagnostics'),
  false);

assertEq(
  'placements lead chart content',
  resultChartSections('postGame')[0].id,
  'placements');

assertEq(
  'relationships precede diagnostics',
  resultChartSections('postGame').slice(-2).map((section) => section.id).join(','),
  'relationships,diagnostics');

console.log(`result-presentation: all ${checks} checks passed`);

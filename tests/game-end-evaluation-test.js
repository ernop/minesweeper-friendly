'use strict';
// Known-answer tests for multidimensional action evidence, its
// player-facing explanation, the derived session ending line, and the
// Justice recap wording.

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const repo = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'minesweeper.js'), 'utf8');
const startIdx = source.indexOf('//-------GAME-END EVALUATION: VERDICT');
const endIdx = source.indexOf('//-------GAME-END EVALUATION: CAPTURE');
if (startIdx === -1 || endIdx === -1) throw new Error('section markers not found');
vm.runInThisContext(source.slice(startIdx, endIdx));

let checks = 0;
function assertEq(name, actual, want) {
  checks++;
  if (actual !== want) throw new Error(`${name}: got ${actual}, want ${want}`);
}
function assertContains(name, text, want) {
  checks++;
  if (!text.includes(want)) {
    throw new Error(`${name}: "${text}" does not contain "${want}"`);
  }
}
// Every kind has a label.
for (const kind of ['mine', 'chord', 'needless', 'forced', 'angel']) {
  checks++;
  if (typeof DEATH_KIND_LABELS[kind] !== 'string') {
    throw new Error(`missing label for kind ${kind}`);
  }
}
assertEq('mine label matches the requested wording',
  DEATH_KIND_LABELS.mine, 'clicked clear mine');
assertEq('angel label', DEATH_KIND_LABELS.angel, 'angel-death');

// Modern action evidence keeps independent facts together instead of
// collapsing them into one exclusive verdict.
const provenMineWithSafe = {
  version: ACTION_EVALUATION_VERSION,
  action: 'reveal',
  result: 'death',
  mistakes: ['opened-proven-mine', 'ignored-safe-move'],
  evidence: { chosenRisk: 1, bestRisk: 0, safeAvailable: true },
  alternatives: [{ kind: 'safe-reveal', cells: [4] }],
};
assertEq('proven mine remains ending kind', evaluationEndingKind(provenMineWithSafe), 'mine');
assertContains('mine text states the provable fact',
  actionEvaluationText(provenMineWithSafe), 'provably a mine');
assertContains('mine also retains safe alternative',
  actionEvaluationText(provenMineWithSafe), 'guaranteed-safe reveal was available');
assertContains('mine text carries selected risk',
  actionEvaluationText(provenMineWithSafe), '100.0%');
assertContains('mine text carries best risk',
  actionEvaluationText(provenMineWithSafe), '0.0%');

const unnecessaryGuess = {
  version: ACTION_EVALUATION_VERSION,
  action: 'reveal',
  result: 'continued',
  mistakes: ['guessed-with-safe-move'],
  evidence: { chosenRisk: 0.2, bestRisk: 0, safeAvailable: true },
  alternatives: [{ kind: 'safe-reveal', cells: [7, 8] }],
};
assertEq('safe-open guess is needless ending kind',
  evaluationEndingKind({ ...unnecessaryGuess, result: 'death' }), 'needless');
assertContains('safe-open guess explanation',
  actionEvaluationText(unnecessaryGuess), 'nonzero mine risk');
assertContains('nonfatal mistake label',
  actionEvaluationLabel(unnecessaryGuess), 'guessed while');
assertEq('survived needless guess is game risk',
  actionEvaluationCategory(unnecessaryGuess), 'gameRisk');

const lowerModeledLife = {
  version: ACTION_EVALUATION_VERSION,
  action: 'reveal',
  result: 'continued',
  mistakes: ['chose-lower-modeled-life'],
  evidence: { expectedLife: 0.4, bestExpectedLife: 0.6 },
  alternatives: [{ kind: 'higher-modeled-life-reveal', cells: [6] }],
};
assertContains('modeled-life dimension names the model',
  actionEvaluationText(lowerModeledLife), 'one-ply odds model');
assertContains('modeled-life values retained',
  actionEvaluationText(lowerModeledLife), '0.400 selected; 0.600 best');
assertEq('modeled-only action has optional category',
  actionEvaluationCategory(lowerModeledLife), 'lifeMaximization');
assertEq('modeled life gap is measured',
  Number(evaluationLifeGap(lowerModeledLife).toFixed(3)), 0.2);

const higherRisk = {
  version: ACTION_EVALUATION_VERSION,
  action: 'reveal',
  result: 'death',
  mistakes: ['chose-higher-risk'],
  evidence: { chosenRisk: 0.3, bestRisk: 0.125, safeAvailable: false },
  alternatives: [{ kind: 'lower-risk-reveal', cells: [2] }],
};
assertEq('higher-risk forced guess ending', evaluationEndingKind(higherRisk), 'forced');
assertContains('higher-risk text chosen odds', actionEvaluationText(higherRisk), '30.0%');
assertContains('higher-risk text best odds', actionEvaluationText(higherRisk), '12.5%');
assertEq('fatal severity wins over risk mechanism',
  actionEvaluationCategory(higherRisk), 'gameLoss');

const bestRiskDeath = {
  version: ACTION_EVALUATION_VERSION,
  action: 'reveal',
  result: 'death',
  mistakes: [],
  evidence: { chosenRisk: 0.25, bestRisk: 0.25, safeAvailable: false },
  alternatives: [],
};
assertEq('best-risk forced death ending', evaluationEndingKind(bestRiskDeath), 'angel');
assertContains('best-risk death is explained', actionEvaluationText(bestRiskDeath), 'lowest measured');

assertContains('legacy text admits evidence limit', actionEvaluationText({
  version: ACTION_EVALUATION_VERSION,
  action: 'unknown',
  result: 'death',
  mistakes: ['legacy-avoidable'],
  alternatives: [],
  legacy: { avoidable: true },
}), 'not store enough evidence');

const protectedGuess = {
  version: ACTION_EVALUATION_VERSION,
  action: 'reveal',
  result: 'continued',
  mistakes: ['chose-higher-risk'],
  evidence: {
    chosenRisk: 0.4, bestRisk: 0.2,
    actualRisk: 0, bestActualRisk: 0,
    justiceProtected: true,
  },
};
assertEq('protected legacy risk tag becomes a note, not game risk',
  actionEvaluationCategory(protectedGuess), 'measurementNotes');

const timeLoss = {
  version: ACTION_EVALUATION_VERSION,
  action: 'flag-remove',
  result: 'continued',
  mistakes: ['removed-proven-mine-flag'],
  evidence: {},
};
assertEq('proven-mine unflag is time loss',
  actionEvaluationCategory(timeLoss), 'timeLoss');
const noOp = {
  version: ACTION_EVALUATION_VERSION,
  action: 'no-op',
  result: 'continued',
  mistakes: ['no-op-click'],
  evidence: { reason: 'left-clicked-flag' },
};
assertEq('no-progress click is time loss',
  actionEvaluationCategory(noOp), 'timeLoss');
assertContains('no-progress reason is explained',
  actionEvaluationText(noOp), 'flagged square');

const note = {
  version: ACTION_EVALUATION_VERSION,
  action: 'unknown',
  result: 'continued',
  mistakes: ['legacy-avoidable'],
  evidence: {},
  legacy: { avoidable: true },
};
assertEq('legacy uncertainty is a measurement note',
  actionEvaluationCategory(note), 'measurementNotes');

const future = {
  version: 'action-evaluation-v99',
  action: 'future-action',
  result: 'continued',
  mistakes: { futureShape: true },
};
assertEq('unknown future version is preserved as a measurement note',
  actionEvaluationCategory(future), 'measurementNotes');
assertContains('unknown future version is not interpreted',
  actionEvaluationText(future), 'cannot interpret it safely');

const summary = actionCategorySummary([
  unnecessaryGuess, lowerModeledLife, timeLoss, noOp, note, future, higherRisk,
]);
assertEq('summary counts fatal once', summary.counts.gameLoss, 1);
assertEq('summary counts risk once', summary.counts.gameRisk, 1);
assertEq('summary counts both time-loss actions', summary.counts.timeLoss, 2);
assertEq('summary counts life once', summary.counts.lifeMaximization, 1);
assertEq('summary counts both legacy and future notes',
  summary.counts.measurementNotes, 2);
assertEq('summary quantifies survived excess risk',
  Number(summary.excessRisk.toFixed(3)), 0.2);
assertEq('summary quantifies modeled-life gap',
  Number(summary.modeledLifeGap.toFixed(3)), 0.2);

// The Justice recap: the rule is cited by name, the count is right, and
// the redraw detail is honest about entries that were already clear.
assertContains('recap cites the rule',
  justiceRecapText(2, 1), 'A Just Universe');
assertContains('recap counts the choices',
  justiceRecapText(2, 1), '2 times');
assertContains('recap singular', justiceRecapText(1, 1), 'once');
assertContains('recap names the real save',
  justiceRecapText(1, 1), 'moved out from under you');
assertContains('recap is honest about already-clear entries',
  justiceRecapText(2, 0), 'already clear');
assertContains('event detail names the pocket',
  justiceEventDetail({ type: 'sea', clearWays: 3, totalWays: 5, saved: true }, 0),
  'sealed sea pocket (3/5 layouts clear)');
assertContains('event detail says the mine moved',
  justiceEventDetail({ type: 'sea', clearWays: 3, totalWays: 5, saved: true }, 0),
  'redrawn');
assertContains('event detail says already clear',
  justiceEventDetail({ type: 'complement', clearWays: 1, totalWays: 2, saved: false }, 1),
  'already clear');

console.log(`game-end-evaluation: all ${checks} checks passed`);

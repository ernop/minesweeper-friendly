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
assertEq('nothing scope allows no fatal report',
  reportScopeAllows('none', 'gameLoss'), false);
assertEq('fatal scope allows only game loss',
  reportScopeAllows('fatal', 'gameLoss'), true);
assertEq('fatal scope hides survived risk',
  reportScopeAllows('fatal', 'gameRisk'), false);
assertEq('risk scope includes fatal and survived risk',
  reportScopeAllows('risk', 'gameLoss')
    && reportScopeAllows('risk', 'gameRisk'), true);
assertEq('risk scope excludes time loss',
  reportScopeAllows('risk', 'timeLoss'), false);
assertEq('full scope includes model advice',
  reportScopeAllows('full', 'lifeMaximization'), true);
assertEq('all primary report item types remain registered',
  ACTION_CATEGORY_SPECS.map((spec) => spec.id).join(','),
  'gameLoss,gameRisk,timeLoss,lifeMaximization,measurementNotes');
assertEq('all current mistake tags remain registered',
  Object.keys(ACTION_MISTAKE_LABELS).join(','),
  [
    'opened-proven-mine', 'ignored-safe-move', 'guessed-with-safe-move',
    'chose-higher-risk', 'chose-lower-modeled-life', 'flagged-proven-safe',
    'removed-proven-mine-flag', 'chord-visible-contradiction',
    'chord-wrong-flag-outcome', 'opened-unproven-with-safe-move',
    'no-op-click', 'unused-correct-flag',
    'likely-misclick-after-wrong-flag', 'legacy-avoidable',
  ].join(','));
const recordEvaluationSource = source.slice(
  source.indexOf('function recordActionEvaluation('),
  source.indexOf('\nfunction reportResult(', source.indexOf('function recordActionEvaluation(')));
assertEq('report display scope never gates evidence recording',
  recordEvaluationSource.includes('reportCategoryEnabled'), false);
const unusedMarkSource = source.slice(
  source.indexOf('function finishOpenFlagEpisodes('),
  source.indexOf('\nfunction markChordFlagUsage('));
assertEq('report display scope never gates unused-mark recording',
  unusedMarkSource.includes('reportCategoryEnabled'), false);
assertEq('empty successful games do not render a report placeholder',
  source.includes('No recorded reportable actions'), false);
assertEq('bare reveals are evaluated without requiring flags or chords',
  source.includes('const actionEvaluation = evaluateRevealAction('), true);
assertEq('no-op report entries omit duplicate board snapshots',
  source.includes("undefined, { position: false });"), true);
assertEq('trace replay restores a snapshot only on its no-op copy',
  source.includes('{ ...evaluation, position: visiblePositionSnapshot() }'), true);
assertEq('reveal and flag-placement choices exclude unavailable cells',
  source.includes("const placingFlag = kind.endsWith('-to-flag');"), true);

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
assertEq('fatal proven mine label includes safe alternative status',
  actionEvaluationLabel(provenMineWithSafe),
  'opened a proven mine while a safe move was available');

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
assertEq('fatal label distinguishes higher-risk forced guess',
  actionEvaluationLabel(higherRisk), 'died from a higher-risk forced guess');
assertContains('higher-risk text chosen odds', actionEvaluationText(higherRisk), '30.0%');
assertContains('higher-risk text best odds', actionEvaluationText(higherRisk), '12.5%');
assertEq('fatal severity wins over risk mechanism',
  actionEvaluationCategory(higherRisk), 'gameLoss');
const compactRiskLines = actionEvaluationLines({
  ...higherRisk,
  result: 'continued',
  evidence: {
    chosenRisk: 1 / 3,
    bestRisk: 0.155,
    actualRisk: 1 / 3,
    bestActualRisk: 0.155,
    expectedLife: 2 / 3,
    bestExpectedLife: 2 / 3,
  },
  alternatives: [{ kind: 'lower-risk-reveal',
    cells: Array.from({ length: 252 }, (_, i) => i + 2) }],
  position: { width: 30, height: 16, revealed: [[0, 1]], flagged: [] },
});
assertEq('compact risk report has one nonduplicated risk line',
  compactRiskLines.filter((line) =>
    line.label.includes('risk') || line.label.includes('rules')).length, 1);
assertContains('compact risk line highlights the delta',
  compactRiskLines.find((line) => line.label === 'Immediate risk').value,
  '+17.8pp');
assertEq('compact one-ply line states a tie once',
  compactRiskLines.find((line) => line.label === 'One-ply life (model)').value,
  'tied at 0.667');
assertEq('positioned report leaves alternative count to its legend',
  compactRiskLines.some((line) => line.label === 'Alternatives'), false);

const cropped = evaluationCropBounds({
  width: 30,
  height: 16,
  revealed: [[0, 1]],
  flagged: [],
}, {
  selected: [1],
  alternatives: [{ kind: 'lower-risk-reveal',
    cells: Array.from({ length: 252 }, (_, i) => i + 2) }],
});
assertEq('uniform covered remainder is cropped', cropped.cropped, true);
assertEq('crop keeps two cells of nearby context',
  [cropped.rowFrom, cropped.rowTo, cropped.colFrom, cropped.colTo].join(','),
  '0,2,0,3');

const bestRiskDeath = {
  version: ACTION_EVALUATION_VERSION,
  action: 'reveal',
  result: 'death',
  mistakes: [],
  evidence: { chosenRisk: 0.25, bestRisk: 0.25, safeAvailable: false },
  alternatives: [],
};
assertEq('best-risk forced death ending', evaluationEndingKind(bestRiskDeath), 'angel');
assertEq('fatal label says minimum-risk choice still lost',
  actionEvaluationLabel(bestRiskDeath),
  'died despite choosing a minimum-risk forced guess');
assertContains('best-risk death is explained', actionEvaluationText(bestRiskDeath), 'lowest measured');

const uncertainChordDeath = {
  version: ACTION_EVALUATION_VERSION,
  action: 'chord',
  result: 'death',
  mistakes: ['chord-wrong-flag-outcome'],
  evidence: { safeAvailable: false },
  alternatives: [],
};
assertEq('chord is input method, not a special fatal class',
  actionEvaluationLabel(uncertainChordDeath),
  'died from a forced guess (risk rank unmeasured)');
assertEq('modern chord derives forced ending line, not chord class',
  evaluationEndingKind(uncertainChordDeath), 'forced');
assertEq('chord with a safe alternative uses the same needless language',
  actionEvaluationLabel({
    ...uncertainChordDeath,
    evidence: { safeAvailable: true },
  }), 'died after guessing while a safe move was available');
assertEq('chord opening a proven mine uses the same proven-mine language',
  actionEvaluationLabel({
    ...uncertainChordDeath,
    evidence: { safeAvailable: false, openedProvenMines: [4] },
  }), 'opened a proven mine when a guess was required');
assertEq('modern proven-mine chord derives mine ending line',
  evaluationEndingKind({
    ...uncertainChordDeath,
    evidence: { safeAvailable: false, openedProvenMines: [4] },
  }), 'mine');
assertEq('legacy chord line survives only as provenance',
  evaluationEndingKind({
    ...uncertainChordDeath,
    legacy: { deathKind: 'chord' },
  }), 'chord');

// The session endings chart classifies through the same fatal-action
// status the report labels, so the two can never disagree.
for (const [evaluation, kind] of [
  [provenMineWithSafe, 'mine-safe'],
  [higherRisk, 'guess-higher'],
  [bestRiskDeath, 'guess-min'],
  [uncertainChordDeath, 'guess-unmeasured'],
  [{ ...uncertainChordDeath, evidence: { safeAvailable: true } }, 'guess-safe'],
  [{ ...uncertainChordDeath,
    evidence: { safeAvailable: false, openedProvenMines: [4] } }, 'mine-forced'],
]) {
  assertEq(`session ending kind ${kind}`, sessionEndingKind(evaluation), kind);
  assertEq(`chart kind ${kind} carries the report's exact wording`,
    FATAL_STATUS_LABELS[kind], actionEvaluationLabel(evaluation));
}
assertEq('proof-or-die death with a safe move has its own ending kind',
  sessionEndingKind({
    version: ACTION_EVALUATION_VERSION,
    action: 'proof-open',
    result: 'death',
    mistakes: [],
    evidence: { safeAvailable: true },
  }), 'proof-safe');
assertEq('proof-or-die death without a safe move has its own ending kind',
  sessionEndingKind({
    version: ACTION_EVALUATION_VERSION,
    action: 'proof-open',
    result: 'death',
    mistakes: [],
    evidence: { safeAvailable: false },
  }), 'proof-forced');
assertEq('legacy verdict stays its own provenance ending kind',
  sessionEndingKind({
    ...uncertainChordDeath,
    legacy: { deathKind: 'angel' },
  }), 'angel');
assertEq('missing fatal evaluation is an unjudged ending',
  sessionEndingKind(undefined), 'other');
assertEq('legacy without a stored verdict is an unjudged ending',
  sessionEndingKind({
    ...uncertainChordDeath,
    legacy: { avoidable: true },
  }), 'other');

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
const unusedCorrectFlag = {
  version: ACTION_EVALUATION_VERSION,
  action: 'flag-place',
  result: 'continued',
  mistakes: ['unused-correct-flag'],
  evidence: { unusedFlagEndedBy: 'game-ended' },
};
assertEq('unused correct mark is classified as time loss',
  actionEvaluationCategory(unusedCorrectFlag), 'timeLoss');
assertContains('unused correct mark explains the chord criterion',
  actionEvaluationText(unusedCorrectFlag), 'never contributed to a chord');
const likelyMisclick = {
  version: ACTION_EVALUATION_VERSION,
  action: 'reveal',
  result: 'death',
  mistakes: ['opened-unproven-with-safe-move',
    'likely-misclick-after-wrong-flag'],
  evidence: {
    likelyMisclick: { flagCell: 4, targetCell: 5, gapMs: 317 },
  },
};
assertEq('likely misclick inference does not replace fatal category',
  actionEvaluationCategory(likelyMisclick), 'gameLoss');
assertContains('likely misclick report carries the measured interval',
  actionEvaluationText(likelyMisclick), '317ms');
assertEq('accepted chords consume neighboring flag episodes',
  source.includes('markChordFlagUsage(index);'), true);
assertEq('only wins classify outstanding flag episodes',
  source.includes("finishOpenFlagEpisodes(end === 'win');"), true);
const noOpGroups = aggregateReportEntries([
  { evaluation: noOp, shown: noOp, category: 'timeLoss' },
  { evaluation: { ...noOp, actionNumber: 8 },
    shown: { ...noOp, actionNumber: 8 }, category: 'timeLoss' },
  { evaluation: { ...noOp, evidence: { reason: 'chord-unavailable' } },
    shown: { ...noOp, evidence: { reason: 'chord-unavailable' } },
    category: 'timeLoss' },
]);
assertEq('identical positionless actions aggregate', noOpGroups.length, 2);
assertEq('aggregate carries the repeated count', noOpGroups[0].count, 2);
assertEq('aggregate title is a count, not action numbers',
  aggregateReportTitle(noOpGroups[0]), 'Left-clicks on flagged squares: 2');

const lowerDangerRisk = {
  version: ACTION_EVALUATION_VERSION,
  action: 'reveal',
  actionNumber: 3,
  result: 'continued',
  mistakes: ['chose-higher-risk'],
  evidence: { actualRisk: 0.4, bestActualRisk: 0 },
};
const higherDangerRisk = {
  ...lowerDangerRisk,
  actionNumber: 9,
  evidence: { actualRisk: 0.6, bestActualRisk: 0.5 },
};
const orderedWinEntries = orderReportEntries([
  { evaluation: timeLoss, shown: timeLoss, category: 'timeLoss', count: 1 },
  { evaluation: lowerModeledLife, shown: lowerModeledLife,
    category: 'lifeMaximization', count: 1 },
  { evaluation: lowerDangerRisk, shown: lowerDangerRisk,
    category: 'gameRisk', count: 1 },
  { evaluation: higherDangerRisk, shown: higherDangerRisk,
    category: 'gameRisk', count: 1 },
]);
assertEq('winning report still puts survived risks first',
  orderedWinEntries.map((entry) => entry.category).join(','),
  'gameRisk,gameRisk,timeLoss,lifeMaximization');
assertEq('highest selected death risk comes first within game risk',
  orderedWinEntries[0].evaluation.actionNumber, 9);

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
// the wording stays strictly in the player's point of view — a forced
// flip is a forced flip; no "actual" mine reality is ever revealed.
assertContains('recap cites the rule',
  justiceRecapText(2), 'A Just Universe');
assertContains('recap counts the flips',
  justiceRecapText(2), '2 forced coinflips');
assertContains('recap singular', justiceRecapText(1), 'a forced coinflip');
assertEq('recap never reveals mine reality',
  /redraw|moved|already clear|mined/.test(justiceRecapText(3)), false);
assertContains('event detail names the pocket',
  justiceEventDetail({ type: 'sea', clearWays: 3, totalWays: 5 }, 0),
  'sealed sea pocket (3/5 layouts clear)');
assertContains('event detail calls the entry a won coinflip',
  justiceEventDetail({ type: 'complement', clearWays: 1, totalWays: 2 }, 1),
  'a forced coinflip, won');
assertEq('event detail never reveals mine reality',
  /redraw|moved|already clear|mined/.test(
    justiceEventDetail({ type: 'sea', clearWays: 3, totalWays: 5 }, 0)),
  false);

console.log(`game-end-evaluation: all ${checks} checks passed`);

'use strict';

// Game-end evaluation: the pure verdict model (categories, labels, report
// entries) and the capture that reads the live board at each judged action.

//-------GAME-END EVALUATION: VERDICT (pure)-------

// Compatibility labels for the derived game-endings chart and legacy
// imports. Current records store multidimensional action evidence instead.
const DEATH_KIND_LABELS = {
  mine: 'clicked clear mine',
  chord: 'chord death',
  needless: 'needless guess',
  forced: 'forced guess',
  angel: 'angel-death',
};

const ACTION_EVALUATION_VERSION = 'action-evaluation-v1';
const ACTION_MISTAKE_LABELS = {
  'opened-proven-mine': 'opened a proven mine',
  'ignored-safe-move': 'ignored a guaranteed-safe move',
  'guessed-with-safe-move': 'guessed while a guaranteed-safe move was available',
  'chose-higher-risk': 'chose higher risk than necessary',
  'chose-lower-modeled-life': 'chose lower modeled expected remaining life',
  'flagged-proven-safe': 'flagged a proven-safe square',
  'removed-proven-mine-flag': 'removed a flag from a proven mine',
  'chord-visible-contradiction': 'chorded through a visible contradiction',
  'chord-wrong-flag-outcome': 'chorded with a wrong flag',
  'opened-unproven-with-safe-move': 'opened an unproven square while a proven-safe move was available',
  'no-op-click': 'made a click that changed nothing',
  'unused-correct-flag': 'marked a mine but never used that mark in a chord',
  'likely-misclick-after-wrong-flag': 'likely misclick after a recent wrong flag',
  'legacy-avoidable': 'legacy avoidable-death classification',
};

const ACTION_CATEGORY_SPECS = [
  { id: 'gameLoss', label: 'Game loss',
    records: 'the fatal action; a loss can be best-available play and is not automatically a mistake' },
  { id: 'gameRisk', label: 'Game risk',
    records: 'a survived action that increased the actual chance of losing under the active rules' },
  { id: 'earlyGuess', label: 'Early-game guess',
    records: 'a survived non-optimal guess taken while under a tenth of the board\u2019s safe squares were revealed; a common way to open a board, so it reports below mid-game risk' },
  { id: 'timeLoss', label: 'Time loss',
    records: 'an input that made no board progress, moved visible state away from a proven fact, or—in a won game—placed a correct mine flag never consumed by a chord; counts actions, not seconds or intent' },
  { id: 'lifeMaximization', label: 'Life maximization',
    records: 'an optional one-ply model comparison where another action had higher expected remaining life' },
  { id: 'measurementNotes', label: 'Measurement notes',
    records: 'legacy or incomplete evidence the app cannot classify more precisely' },
];

function reportScopeAllows(scope, category) {
  if (scope === 'none') return false;
  if (scope === 'fatal') return category === 'gameLoss';
  if (scope === 'risk') {
    return category === 'gameLoss' || category === 'gameRisk'
      || category === 'earlyGuess';
  }
  return scope === 'full';
}

const TIME_LOSS_MISTAKES = new Set([
  'flagged-proven-safe',
  'removed-proven-mine-flag',
  'chord-visible-contradiction',
  'no-op-click',
  'unused-correct-flag',
]);
const GAME_RISK_MISTAKES = new Set([
  'guessed-with-safe-move',
  'chose-higher-risk',
  'opened-unproven-with-safe-move',
]);

function evaluationRiskDelta(evaluation) {
  const evidence = evaluation.evidence || {};
  if (typeof evidence.actualRisk === 'number'
      && typeof evidence.bestActualRisk === 'number') {
    return Math.max(0, evidence.actualRisk - evidence.bestActualRisk);
  }
  if (evidence.playMode === 'angelic' || evidence.justiceProtected === true) return 0;
  if (typeof evidence.chosenRisk === 'number'
      && typeof evidence.bestRisk === 'number') {
    return Math.max(0, evidence.chosenRisk - evidence.bestRisk);
  }
  return undefined;
}

// "Early game" is judged from the player's own position: the fraction of
// the board's safe squares already revealed when the action was taken
// (evidence.boardProgress on new records; derived from the saved position
// on records stored before the field existed). Guessing before the board
// opens up is how most games start, so a survived non-optimal early guess
// reports as its own lower-priority category instead of mid-game risk
// (creator request 2026-08-24). Fatal actions are unaffected: a death is
// the fatal action wherever it happens.
const EARLY_GAME_PROGRESS_LIMIT = 0.1;

function evaluationBoardProgress(evaluation) {
  const evidence = evaluation.evidence || {};
  if (typeof evidence.boardProgress === 'number') return evidence.boardProgress;
  const position = evaluation.position;
  if (!position || !Array.isArray(position.revealed)
      || !Number.isFinite(position.width) || !Number.isFinite(position.height)
      || !Number.isFinite(position.mines)) return undefined;
  const safeTotal = position.width * position.height - position.mines;
  if (safeTotal <= 0) return undefined;
  return position.revealed.length / safeTotal;
}

function evaluationIsEarlyGame(evaluation) {
  const progress = evaluationBoardProgress(evaluation);
  return progress !== undefined && progress < EARLY_GAME_PROGRESS_LIMIT;
}

function evaluationLifeGap(evaluation) {
  const evidence = evaluation.evidence || {};
  if (typeof evidence.expectedLife !== 'number'
      || typeof evidence.bestExpectedLife !== 'number') return undefined;
  return Math.max(0, evidence.bestExpectedLife - evidence.expectedLife);
}

// One primary section per action. Severity wins; lower-level mechanisms
// remain on the evidence as secondary tags and never duplicate the action.
function actionEvaluationCategory(evaluation) {
  if (!evaluation) return undefined;
  if (evaluation.result === 'death') return 'gameLoss';
  if (typeof evaluation.version === 'string'
      && evaluation.version !== ACTION_EVALUATION_VERSION) return 'measurementNotes';
  const mistakes = new Set(evaluation.mistakes || []);
  const hasRiskRule = [...GAME_RISK_MISTAKES].some((kind) => mistakes.has(kind));
  if (hasRiskRule) {
    const delta = evaluationRiskDelta(evaluation);
    if (delta === undefined || delta > 1e-12) {
      return evaluationIsEarlyGame(evaluation) ? 'earlyGuess' : 'gameRisk';
    }
  }
  if ([...TIME_LOSS_MISTAKES].some((kind) => mistakes.has(kind))) return 'timeLoss';
  if (mistakes.has('chose-lower-modeled-life')
      && (evaluationLifeGap(evaluation) || 0) > 1e-9) return 'lifeMaximization';
  if (evaluation.legacy || mistakes.has('legacy-avoidable')
      || (evaluation.evidence && evaluation.evidence.factsMeasured === false)) {
    return 'measurementNotes';
  }
  if (mistakes.size > 0) return 'measurementNotes';
  return undefined;
}

function actionCategorySummary(evaluations) {
  const counts = Object.fromEntries(
    ACTION_CATEGORY_SPECS.map((spec) => [spec.id, 0]));
  let excessRisk = 0;
  let modeledLifeGap = 0;
  for (const evaluation of evaluations || []) {
    const category = actionEvaluationCategory(evaluation);
    if (category) counts[category]++;
    if (category === 'gameRisk') {
      excessRisk += evaluationRiskDelta(evaluation) || 0;
    }
    if (Array.isArray(evaluation.mistakes)
        && evaluation.mistakes.includes('chose-lower-modeled-life')) {
      modeledLifeGap += evaluationLifeGap(evaluation) || 0;
    }
  }
  return { counts, excessRisk, modeledLifeGap };
}

function evaluationHasMistake(evaluation) {
  return Array.isArray(evaluation && evaluation.mistakes)
    && evaluation.mistakes.length > 0;
}

// The old five-way verdict, kept as a derived compatibility view for the
// report's legacy labels and its verdict styling (the endings chart now
// classifies through sessionEndingKind below). Never the evidence source:
// independent facts and every applicable mistake remain together on the
// action evaluation.
function evaluationEndingKind(evaluation) {
  if (!evaluation) return 'other';
  if (evaluation.version !== ACTION_EVALUATION_VERSION) return 'other';
  if (evaluation.legacy && DEATH_KIND_LABELS[evaluation.legacy.deathKind]) {
    return evaluation.legacy.deathKind;
  }
  const mistakes = new Set(Array.isArray(evaluation.mistakes)
    ? evaluation.mistakes : []);
  const evidence = evaluation.evidence || {};
  if (mistakes.has('opened-proven-mine')
      || (Array.isArray(evidence.openedProvenMines)
        && evidence.openedProvenMines.length > 0)) return 'mine';
  if (mistakes.has('guessed-with-safe-move')
      || mistakes.has('opened-unproven-with-safe-move')
      || evidence.safeAvailable === true) return 'needless';
  if (mistakes.has('chose-higher-risk') || evaluation.action === 'proof-open') {
    return 'forced';
  }
  // Chord is only the input method. Without an exact set-risk rank, a
  // modern uncertain chord with no safe alternative is a forced,
  // risk-rank-unmeasured mine opening. Legacy chord verdicts returned above
  // retain their old chart line as provenance.
  if (evaluation.action === 'chord') return 'forced';
  if (evidence.firstReveal === true
      || (typeof evidence.chosenRisk === 'number'
        && typeof evidence.bestRisk === 'number'
        && evidence.chosenRisk <= evidence.bestRisk + 1e-12)) {
    return 'angel';
  }
  return 'other';
}

function fatalEvaluationOf(record) {
  if (!Array.isArray(record.actionEvaluations)) return undefined;
  for (let i = record.actionEvaluations.length - 1; i >= 0; i--) {
    if (record.actionEvaluations[i].result === 'death') return record.actionEvaluations[i];
  }
  return undefined;
}

// The modern fatal-action status: one exclusive kind per fatal action.
// The after-game report label and the session endings chart both derive
// from this single classification (requested 2026-08-23 evening: the
// chart's loss categories must be the report's reasons for losing), so
// the two can never disagree. FATAL_STATUS_LABELS carries the exact
// report wording per kind.
const FATAL_STATUS_LABELS = {
  'mine-safe': 'opened a proven mine while a safe move was available',
  'mine-forced': 'opened a proven mine when a guess was required',
  'proof-safe': 'Proof-or-die rule death while a proven-safe move was available',
  'proof-forced': 'Proof-or-die rule death with no proven-safe move available',
  'guess-safe': 'died after guessing while a safe move was available',
  'guess-early': 'died on an early-game guess',
  'guess-higher': 'died from a higher-risk forced guess',
  'guess-min': 'died despite choosing a minimum-risk forced guess',
  'guess-unmeasured': 'died from a forced guess (risk rank unmeasured)',
};

function fatalActionStatusKind(evaluation) {
  if (!evaluation || evaluation.result !== 'death') return undefined;
  const evidence = evaluation.evidence || {};
  const mistakes = new Set(Array.isArray(evaluation.mistakes)
    ? evaluation.mistakes : []);
  const provenMine = mistakes.has('opened-proven-mine')
    || evidence.knowledge === 'proven-mine'
    || (Array.isArray(evidence.openedProvenMines)
      && evidence.openedProvenMines.length > 0);
  const safeAvailable = evidence.safeAvailable === true
    || (typeof evidence.bestActualRisk === 'number'
      && evidence.bestActualRisk <= 1e-12)
    || (typeof evidence.bestRisk === 'number' && evidence.bestRisk <= 1e-12);
  if (provenMine) return safeAvailable ? 'mine-safe' : 'mine-forced';
  if (evaluation.action === 'proof-open') {
    return safeAvailable ? 'proof-safe' : 'proof-forced';
  }
  const delta = evaluationRiskDelta(evaluation);
  if (safeAvailable) return 'guess-safe';
  // A forced guess death before the board opened up is the mode's
  // entry fee: over enough games it must happen, so it files as one
  // routine kind whatever the risk rank was (creator, 2026-08-24).
  // Guessing past a proven-safe move stays 'guess-safe' at any stage.
  if (evaluationIsEarlyGame(evaluation)) return 'guess-early';
  if (delta !== undefined && delta > 1e-12) return 'guess-higher';
  if (delta !== undefined) return 'guess-min';
  return 'guess-unmeasured';
}

function fatalActionStatusLabel(evaluation) {
  const kind = fatalActionStatusKind(evaluation);
  return kind === undefined ? 'unjudged death' : FATAL_STATUS_LABELS[kind];
}

// The endings-chart kind for a loss: the modern fatal-action status
// verbatim, so the chart's categories are exactly the report's reasons
// for losing; a legacy-imported record's stored five-way verdict stays
// its own provenance line (coarse old evidence is never upgraded by
// inventing detail); 'other' when nothing was measurable.
function sessionEndingKind(evaluation) {
  if (!evaluation) return 'other';
  if (evaluation.version !== ACTION_EVALUATION_VERSION) return 'other';
  if (evaluation.legacy) {
    return DEATH_KIND_LABELS[evaluation.legacy.deathKind]
      ? evaluation.legacy.deathKind : 'other';
  }
  return fatalActionStatusKind(evaluation) || 'other';
}

function actionEvaluationLabel(evaluation) {
  if (evaluation.legacy
      && evaluation.legacy.source === 'pre-action-evaluation-coverage') {
    return 'action evidence unavailable for this older game';
  }
  if (evaluation.result === 'death') {
    if (!evaluation.legacy
        && evaluation.version === ACTION_EVALUATION_VERSION) {
      return fatalActionStatusLabel(evaluation);
    }
    const kind = evaluationEndingKind(evaluation);
    return kind === 'other' ? 'unjudged death' : DEATH_KIND_LABELS[kind];
  }
  // One player-facing wording for the whole early-game category: the
  // specific mechanism (higher risk, ignored safe move) stays on the
  // evidence lines, but the headline calls it what it is to a player.
  if (actionEvaluationCategory(evaluation) === 'earlyGuess') {
    return 'made a non-optimal early-game guess';
  }
  const labels = (Array.isArray(evaluation.mistakes) ? evaluation.mistakes : [])
    .map((kind) => ACTION_MISTAKE_LABELS[kind] || kind);
  return labels.length > 0 ? labels.join('; ') : 'recorded action';
}

function actionEvaluationText(evaluation) {
  if (evaluation.version !== ACTION_EVALUATION_VERSION) {
    return 'This action uses a newer evidence version. It was preserved verbatim, but this build cannot interpret it safely.';
  }
  if (evaluation.legacy) {
    if (evaluation.legacy.source === 'pre-action-evaluation-coverage') {
      return 'This game predates action-by-action evidence. Its outcome and aggregate counts remain valid, but earlier actions cannot be reconstructed from this record alone.';
    }
    if (evaluation.legacy.deathKind) {
      return 'This older record stored the verdict “'
        + (DEATH_KIND_LABELS[evaluation.legacy.deathKind] || evaluation.legacy.deathKind)
        + '”, but not the board evidence needed to reconstruct it.';
    }
    return evaluation.legacy.avoidable
      ? 'This older record classified the fatal act as avoidable, but did not store enough evidence to say which modern mistake applied.'
      : 'This older record did not classify the fatal act as avoidable, but did not store enough evidence for a modern re-evaluation.';
  }
  const evidence = evaluation.evidence || {};
  const parts = [];
  const mistakes = new Set(evaluation.mistakes || []);
  if (mistakes.has('opened-proven-mine')) {
    parts.push('The selected square was provably a mine from the visible position.');
  }
  if (mistakes.has('ignored-safe-move')) {
    parts.push('At least one guaranteed-safe reveal was available instead.');
  }
  if (mistakes.has('guessed-with-safe-move')) {
    parts.push('The selected square had a nonzero mine risk while at least one guaranteed-safe reveal was available.');
  }
  if (mistakes.has('opened-unproven-with-safe-move')) {
    parts.push('A proven-safe reveal was available, but the action opened an unproven square.');
  }
  if (mistakes.has('chose-higher-risk')) {
    parts.push('The selected risk was higher than the lowest risk available.');
  }
  if (mistakes.has('chose-lower-modeled-life')) {
    parts.push('The one-ply odds model found another action with higher expected remaining life; this compares modeled outcomes, not intent.');
  }
  if (mistakes.has('flagged-proven-safe')) {
    parts.push('Visible facts proved the flagged square safe.');
  }
  if (mistakes.has('removed-proven-mine-flag')) {
    parts.push('Visible facts still proved the unflagged square was a mine.');
  }
  if (mistakes.has('unused-correct-flag')) {
    parts.push(evidence.unusedFlagEndedBy === 'flag-removed'
      ? 'This was a mine, but its flag was removed before contributing to any chord.'
      : 'This was a mine, but its flag never contributed to a chord before the game ended.');
  }
  if (mistakes.has('likely-misclick-after-wrong-flag')
      && evidence.likelyMisclick) {
    parts.push('Likely physical misclick: an adjacent safe square was flagged '
      + Math.round(evidence.likelyMisclick.gapMs)
      + 'ms before this fatal action and remained flagged.');
  }
  if (mistakes.has('no-op-click')) {
    const reason = {
      'chord-unavailable': 'The chord conditions were not met, so the board did not change.',
      'left-clicked-flag': 'Left-clicking a flagged square did not change the board.',
      'flagged-revealed-cell': 'A revealed square cannot be flagged, so the board did not change.',
    }[evidence.reason];
    parts.push(reason || 'The click did not change the board.');
  }
  if (mistakes.has('chord-visible-contradiction')) {
    parts.push('The chord’s flags or opened neighbors contradicted facts provable from the visible board.');
  }
  if (mistakes.has('chord-wrong-flag-outcome')
      && !mistakes.has('chord-visible-contradiction')) {
    parts.push('The chord opened a mine because at least one surrounding flag was wrong; the visible position did not prove that error beforehand.');
  }
  if (evaluation.action === 'chord' && evaluation.result === 'death'
      && !mistakes.has('chord-visible-contradiction')
      && !mistakes.has('chord-wrong-flag-outcome')) {
    parts.push('The chord opened a mine because at least one surrounding flag was wrong, but the stored visible facts did not prove the contradiction beforehand.');
  }
  if (evaluation.action === 'proof-open' && evaluation.result === 'death'
      && !evidence.safeAvailable) {
    parts.push('Proof-or-die had no proven-safe legal move; opening an unproven square caused the mode’s rule death.');
  }
  if (evaluation.result === 'death' && parts.length === 0
      && typeof evidence.chosenRisk === 'number') {
    parts.push('No guaranteed-safe reveal was available. The selected square had the lowest measured mine risk and happened to be mined.');
  }
  if (actionEvaluationCategory(evaluation) === 'earlyGuess'
      || fatalActionStatusKind(evaluation) === 'guess-early') {
    parts.push('This was an early-game guess: only '
      + Math.round(evaluationBoardProgress(evaluation) * 100)
      + '% of the board\u2019s safe squares were revealed, a routine '
      + 'opening gamble.');
  }
  if (typeof evidence.chosenRisk === 'number') {
    parts.push('Selected mine risk: ' + (evidence.chosenRisk * 100).toFixed(1) + '%.');
  }
  if (typeof evidence.bestRisk === 'number') {
    parts.push('Lowest available mine risk: ' + (evidence.bestRisk * 100).toFixed(1) + '%.');
  }
  if (typeof evidence.actualRisk === 'number'
      && typeof evidence.bestActualRisk === 'number') {
    const delta = Math.max(0, evidence.actualRisk - evidence.bestActualRisk);
    parts.push('Under the active mode and protection rules: '
      + (evidence.actualRisk * 100).toFixed(1) + '% selected versus '
      + (evidence.bestActualRisk * 100).toFixed(1) + '% best available'
      + (delta > 1e-12
        ? ' (+' + (delta * 100).toFixed(1) + ' percentage points)' : '')
      + '.');
  }
  if (typeof evidence.expectedLife === 'number'
      && typeof evidence.bestExpectedLife === 'number') {
    parts.push('One-ply expected remaining life: '
      + evidence.expectedLife.toFixed(3) + ' selected; '
      + evidence.bestExpectedLife.toFixed(3) + ' best measured'
      + (evidence.bestExpectedLife > evidence.expectedLife + 1e-9
        ? ' (gap ' + (evidence.bestExpectedLife - evidence.expectedLife).toFixed(3) + ')'
        : '') + '.');
  }
  const alternativeCount = new Set((evaluation.alternatives || [])
    .flatMap((alternative) => alternative.cells)).size;
  if (alternativeCount > 0) {
    parts.push(alternativeCount + ' alternative '
      + (alternativeCount === 1 ? 'move is' : 'moves are')
      + ' highlighted on the saved position.');
  }
  return parts.join(' ') || 'The action was recorded, but no further judgement was measurable.';
}

const NO_OP_AGGREGATE_LABELS = {
  'chord-unavailable': 'Unsatisfied chord clicks',
  'left-clicked-flag': 'Left-clicks on flagged squares',
  'flagged-revealed-cell': 'Flag attempts on revealed squares',
};

const DISCLOSURE_AGGREGATE_LABELS = {
  'flagged-proven-safe': 'Proven-safe squares flagged',
};

function disclosureAggregateKind(evaluation) {
  if (!Array.isArray(evaluation && evaluation.mistakes)) return null;
  return Object.keys(DISCLOSURE_AGGREGATE_LABELS)
    .find((kind) => evaluation.mistakes.includes(kind)) || null;
}

// Most positioned evidence remains individual so its action number stays
// attached to its diagram. High-frequency, specifically named mistakes can
// instead form one count whose instances remain available in a disclosure.
function aggregateReportEntries(entries) {
  const result = [];
  const groups = new Map();
  for (const entry of entries) {
    const aggregateKind = disclosureAggregateKind(entry.shown);
    if (aggregateKind !== null) {
      const key = JSON.stringify([entry.category, aggregateKind]);
      const existing = groups.get(key);
      if (existing) {
        existing.count++;
        existing.instances.push(entry);
        continue;
      }
      const grouped = {
        ...entry,
        aggregateKind,
        count: 1,
        instances: [entry],
      };
      groups.set(key, grouped);
      result.push(grouped);
      continue;
    }
    if (entry.shown.position !== undefined) {
      result.push({ ...entry, count: 1 });
      continue;
    }
    const label = actionEvaluationLabel(entry.shown);
    const text = actionEvaluationText(entry.shown);
    const key = JSON.stringify([entry.category, entry.shown.action, label, text]);
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
      continue;
    }
    const grouped = { ...entry, count: 1, label, text };
    groups.set(key, grouped);
    result.push(grouped);
  }
  return result;
}

function reportEntryOrderValue(entry) {
  const evaluation = entry.evaluation || entry.shown || {};
  const evidence = evaluation.evidence || {};
  if (entry.category === 'gameRisk' || entry.category === 'earlyGuess') {
    const selectedRisk = typeof evidence.actualRisk === 'number'
      ? evidence.actualRisk
      : (typeof evidence.chosenRisk === 'number' ? evidence.chosenRisk : -1);
    return [selectedRisk, evaluationRiskDelta(evaluation) ?? -1];
  }
  if (entry.category === 'lifeMaximization') {
    return [evaluationLifeGap(evaluation) ?? -1, -1];
  }
  return [-1, -1];
}

function orderReportEntries(entries) {
  const categoryOrder = new Map(
    ACTION_CATEGORY_SPECS.map((spec, index) => [spec.id, index]));
  return [...entries].sort((a, b) => {
    const byCategory = (categoryOrder.get(a.category) ?? Number.MAX_SAFE_INTEGER)
      - (categoryOrder.get(b.category) ?? Number.MAX_SAFE_INTEGER);
    if (byCategory !== 0) return byCategory;
    const aValue = reportEntryOrderValue(a);
    const bValue = reportEntryOrderValue(b);
    if (bValue[0] !== aValue[0]) return bValue[0] - aValue[0];
    if (bValue[1] !== aValue[1]) return bValue[1] - aValue[1];
    const aAction = Number.isFinite(a.evaluation && a.evaluation.actionNumber)
      ? a.evaluation.actionNumber : Number.MAX_SAFE_INTEGER;
    const bAction = Number.isFinite(b.evaluation && b.evaluation.actionNumber)
      ? b.evaluation.actionNumber : Number.MAX_SAFE_INTEGER;
    return aAction - bAction;
  });
}

function aggregateReportTitle(entry) {
  if (entry.aggregateKind !== undefined) {
    return DISCLOSURE_AGGREGATE_LABELS[entry.aggregateKind] + ': ' + entry.count;
  }
  if (entry.shown.action === 'no-op') {
    const reason = entry.shown.evidence && entry.shown.evidence.reason;
    const label = NO_OP_AGGREGATE_LABELS[reason] || 'Clicks that changed nothing';
    return label + ': ' + entry.count;
  }
  return entry.count + ' recorded '
    + (entry.count === 1 ? 'action' : 'actions') + ': ' + entry.label;
}

function evaluationAlternativeLabel(kind) {
  return {
    'safe-reveal': 'Guaranteed-safe reveal',
    'lower-risk-reveal': 'Lower-risk reveal',
    'higher-modeled-life-reveal': 'Higher modeled expected-life reveal',
    'flag-proven-mine': 'Proven mine to flag',
    'unflag-proven-safe': 'Proven-safe flag to remove',
    'keep-proven-mine-flag': 'Proven-mine flag to keep',
  }[kind] || kind;
}

function actionEvaluationLines(evaluation) {
  if (evaluation.version !== ACTION_EVALUATION_VERSION || evaluation.legacy) {
    return [{ label: 'Note', value: actionEvaluationText(evaluation) }];
  }
  const evidence = evaluation.evidence || {};
  const mistakes = new Set(Array.isArray(evaluation.mistakes)
    ? evaluation.mistakes : []);
  const lines = [];
  if (mistakes.has('opened-proven-mine')) {
    lines.push({ label: 'Certainty', value: 'selected square was proven mined' });
  } else if (evidence.knowledge === 'proven-safe') {
    lines.push({ label: 'Certainty', value: 'selected square was proven safe' });
  }
  if (evidence.safeAvailable === true
      || mistakes.has('ignored-safe-move')
      || mistakes.has('guessed-with-safe-move')
      || mistakes.has('opened-unproven-with-safe-move')) {
    lines.push({ label: 'Safe alternative', value: 'available' });
  }
  if (mistakes.has('flagged-proven-safe')) {
    lines.push({ label: 'Difference', value: 'flagged a proven-safe square' });
  }
  if (mistakes.has('removed-proven-mine-flag')) {
    lines.push({ label: 'Difference', value: 'removed a flag from a proven mine' });
  }
  if (mistakes.has('unused-correct-flag')) {
    lines.push({
      label: 'Mark use',
      value: evidence.unusedFlagEndedBy === 'flag-removed'
        ? 'correct mine flag removed before any chord used it'
        : 'correct mine flag remained unused by every later chord',
    });
  }
  if (mistakes.has('likely-misclick-after-wrong-flag')
      && evidence.likelyMisclick) {
    lines.push({
      label: 'Likely misclick',
      value: 'adjacent wrong flag placed '
        + Math.round(evidence.likelyMisclick.gapMs)
        + 'ms before death and never removed',
    });
  }
  if (mistakes.has('chord-visible-contradiction')) {
    lines.push({ label: 'Difference', value: 'chord contradicted visible facts' });
  } else if (mistakes.has('chord-wrong-flag-outcome')) {
    lines.push({ label: 'Outcome', value: 'a wrong flag made the chord open a mine; the error was not proven beforehand' });
  }
  if (evaluation.action === 'proof-open' && evaluation.result === 'death') {
    lines.push({ label: 'Mode rule', value: evidence.safeAvailable
      ? 'opened an unproven square while a proven-safe move was available'
      : 'no proven-safe move was available; the unproven open caused the rule death' });
  }

  const pct = (value) => (value * 100).toFixed(1) + '%';
  const rawMeasured = typeof evidence.chosenRisk === 'number'
    && typeof evidence.bestRisk === 'number';
  const activeMeasured = typeof evidence.actualRisk === 'number'
    && typeof evidence.bestActualRisk === 'number';
  const sameRisk = rawMeasured && activeMeasured
    && Math.abs(evidence.chosenRisk - evidence.actualRisk) <= 1e-12
    && Math.abs(evidence.bestRisk - evidence.bestActualRisk) <= 1e-12;
  const riskValue = (chosen, best) => {
    const delta = Math.max(0, chosen - best);
    return pct(chosen) + ' selected · ' + pct(best) + ' minimum'
      + (delta > 1e-12 ? ' · +' + (delta * 100).toFixed(1) + 'pp' : ' · tied');
  };
  if (sameRisk) {
    lines.push({ label: 'Immediate risk', value:
      riskValue(evidence.actualRisk, evidence.bestActualRisk) });
  } else {
    if (rawMeasured) {
      lines.push({ label: 'Raw mine risk', value:
        riskValue(evidence.chosenRisk, evidence.bestRisk) });
    }
    if (activeMeasured) {
      lines.push({ label: 'Under active rules', value:
        riskValue(evidence.actualRisk, evidence.bestActualRisk) });
    }
  }
  if (evidence.oddsMeasured === false && !rawMeasured) {
    lines.push({ label: 'Immediate risk', value: 'not measured' });
  }
  if (actionEvaluationCategory(evaluation) === 'earlyGuess'
      || fatalActionStatusKind(evaluation) === 'guess-early') {
    const progress = evaluationBoardProgress(evaluation);
    lines.push({ label: 'Early game', value:
      'only ' + Math.round(progress * 100) + '% of the board\u2019s safe '
      + 'squares were revealed \u2014 a routine opening gamble' });
  }
  if (typeof evidence.expectedLife === 'number'
      && typeof evidence.bestExpectedLife === 'number') {
    const gap = Math.max(0, evidence.bestExpectedLife - evidence.expectedLife);
    lines.push({
      label: 'One-ply life (model)',
      value: gap <= 1e-9
        ? 'tied at ' + evidence.expectedLife.toFixed(3)
        : evidence.expectedLife.toFixed(3) + ' selected · '
          + evidence.bestExpectedLife.toFixed(3) + ' best · gap '
          + gap.toFixed(3),
    });
  }
  if (mistakes.has('no-op-click')) {
    const reason = {
      'chord-unavailable': 'chord conditions were not met',
      'left-clicked-flag': 'left-clicked a flagged square',
      'flagged-revealed-cell': 'tried to flag a revealed square',
    }[evidence.reason] || 'board state did not change';
    lines.push({ label: 'No-op', value: reason });
  }
  if (evidence.factsMeasured === false) {
    lines.push({ label: 'Visible facts', value: 'not measured' });
  }
  const alternatives = evaluation.alternatives || [];
  if (!evaluation.position && alternatives.length > 0) {
    const parts = alternatives.map((alternative) => {
      const count = Array.isArray(alternative.cells) ? alternative.cells.length : 0;
      return count + ' ' + evaluationAlternativeLabel(alternative.kind).toLowerCase()
        + (count === 1 ? '' : 's');
    });
    lines.push({ label: 'Alternatives', value: parts.join(' · ') });
  }
  return lines.length > 0
    ? lines : [{ label: 'Note', value: 'No further difference was measurable.' }];
}

function evaluationCropBounds(position, evaluation, padding = 2) {
  const full = {
    colFrom: 0, colTo: position.width - 1,
    rowFrom: 0, rowTo: position.height - 1,
    cropped: false,
  };
  const relevant = new Set();
  for (const pair of position.revealed || []) relevant.add(pair[0]);
  for (const cell of position.flagged || []) relevant.add(cell);
  for (const cell of evaluation.selected || []) relevant.add(cell);
  if (Number.isInteger(evaluation.triggerCell)) relevant.add(evaluation.triggerCell);
  const cellsInBoard = [...relevant].filter((cell) =>
    Number.isInteger(cell) && cell >= 0
      && cell < position.width * position.height);
  if (cellsInBoard.length === 0) return full;
  let colFrom = position.width - 1;
  let colTo = 0;
  let rowFrom = position.height - 1;
  let rowTo = 0;
  for (const cell of cellsInBoard) {
    const col = cell % position.width;
    const row = Math.floor(cell / position.width);
    colFrom = Math.min(colFrom, col);
    colTo = Math.max(colTo, col);
    rowFrom = Math.min(rowFrom, row);
    rowTo = Math.max(rowTo, row);
  }
  colFrom = Math.max(0, colFrom - padding);
  colTo = Math.min(position.width - 1, colTo + padding);
  rowFrom = Math.max(0, rowFrom - padding);
  rowTo = Math.min(position.height - 1, rowTo + padding);
  const area = (colTo - colFrom + 1) * (rowTo - rowFrom + 1);
  if (area >= position.width * position.height * 0.8) return full;
  return { colFrom, colTo, rowFrom, rowTo, cropped: true };
}

// The end-of-game Justice recap, win or loss: cited by rule name, with
// the count of forced coinflips the player won. Strictly the player's
// point of view (creator request 2026-08-23): there is no "actual" mine
// reality to report — a forced flip is a forced flip, neither a life
// nor a death, and whether any entry involved a redraw is never revealed.
function justiceRecapText(count) {
  const flips = count === 1
    ? 'a forced coinflip' : count + ' forced coinflips';
  return 'Due to the rule "A Just Universe", you won ' + flips
    + ': every bare entry into a sealed pocket that no outside clue '
    + 'could ever resolve lands in your favor.';
}

// One recap line per Justice event of the just-finished game. The clear
// and total layout counts are the player's own information (derived from
// visible clues); nothing here peeks behind the board.
function justiceEventDetail(detail, index) {
  return '#' + (index + 1) + ': entry into a sealed ' + detail.type
    + ' pocket (' + detail.clearWays + '/' + detail.totalWays
    + ' layouts clear) \u2014 a forced coinflip, won.';
}

//-------GAME-END EVALUATION: CAPTURE (reads the live board at the fatal act)-------

// Facts common to every globally consistent visible-information layout:
// the fact map (1 = certain mine, 2 = proven safe), completeness status,
// and the covered safe/mine lists. The same canonical prover feeds odds.
function coveredFactsInfo(view = playerView()) {
  const facts = Justice.proveFacts(view, Justice.rawClues(view));
  const safeCells = [];
  const mineCells = [];
  for (let i = 0; i < cells.length; i++) {
    if (view.revealed[i]) continue;
    if (facts.get(i) === 2) safeCells.push(i);
    if (facts.get(i) === 1) mineCells.push(i);
  }
  return {
    facts,
    safeCells,
    mineCells,
    safeAvailable: safeCells.length > 0,
    complete: facts.complete === true,
  };
}

function visiblePositionSnapshot() {
  const revealed = [];
  const flagged = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].revealed) revealed.push([i, cells[i].adjacent]);
    if (cells[i].flagged) flagged.push(i);
  }
  return {
    width: config.width,
    height: config.height,
    mines: config.mines,
    revealed,
    flagged,
  };
}

function actionEvaluationBase(action, actionNumber, selected, triggerCell, options = {}) {
  const evaluation = {
    version: ACTION_EVALUATION_VERSION,
    action,
    actionNumber,
    atMs: Math.round(elapsedMs()),
    selected: [...new Set(selected)],
    ...(typeof triggerCell === 'number' ? { triggerCell } : {}),
    result: 'continued',
    mistakes: [],
    evidence: {
      playMode: settings.playMode,
      oddsVersion: Odds.VERSION,
      proofVersion: Justice.PROOF_VERSION,
      // The fraction of the board's safe squares already revealed when
      // the action was taken; the early-game guess category thresholds
      // on it (older records derive it from the saved position instead).
      boardProgress: revealedCount / (cells.length - config.mines),
    },
    alternatives: [],
    choices: [],
  };
  if (options.position !== false) evaluation.position = visiblePositionSnapshot();
  return evaluation;
}

function addAlternative(evaluation, kind, candidates, risk) {
  const selected = new Set(evaluation.selected);
  const cells = [...new Set(candidates)].filter((cell) => !selected.has(cell));
  if (cells.length === 0) return;
  const alternative = { kind, cells };
  if (typeof risk === 'number') alternative.risk = risk;
  evaluation.alternatives.push(alternative);
}

function setDecisionChoices(evaluation, kind, candidates, risk) {
  const revealing = kind.endsWith('-reveal');
  const placingFlag = kind.endsWith('-to-flag');
  const choices = [...new Set(candidates)].filter((cell) =>
    Number.isInteger(cell) && cell >= 0 && cell < config.width * config.height
      && (!(revealing || placingFlag) || !cells[cell].revealed)
      && (!(revealing || placingFlag) || !cells[cell].flagged));
  if (choices.length === 0) return;
  const choice = { kind, cells: choices };
  if (typeof risk === 'number') choice.risk = risk;
  evaluation.choices = [choice];
}

function evaluateRevealAction(index, firstReveal, guessEvent, action = 'reveal') {
  const evaluation = actionEvaluationBase(action, inputActionCount, [index]);
  evaluation.evidence.firstReveal = firstReveal;
  let local;
  try {
    local = coveredFactsInfo();
  } catch (err) {
    backupStatus.textContent = 'action evaluation failed: ' + err.message;
    local = {
      facts: new Map(),
      safeCells: [],
      mineCells: [],
      safeAvailable: false,
      complete: false,
    };
    evaluation.evidence.factsMeasured = false;
  }
  const measuredGuess = guessEvent && guessEvent.measured === true;
  const provenMine = local.facts.get(index) === 1
    || (measuredGuess && guessEvent.p >= 1 - 1e-12);
  const provenSafe = local.facts.get(index) === 2;
  evaluation.evidence.factsMeasured = evaluation.evidence.factsMeasured !== false
    && local.complete;
  evaluation.evidence.knowledge = provenMine ? 'proven-mine'
    : provenSafe ? 'proven-safe'
      : local.complete ? 'uncertain' : 'unmeasured';
  if (provenMine) {
    evaluation.evidence.knowledgeSource = local.facts.get(index) === 1
      ? 'visible-deduction' : 'remaining-layouts';
  }

  const safeAvailable = measuredGuess
    ? guessEvent.minP <= 1e-12 : local.safeAvailable;
  evaluation.evidence.safeAvailable = safeAvailable;
  evaluation.evidence.oddsMeasured = measuredGuess;
  if (measuredGuess) {
    evaluation.evidence.chosenRisk = guessEvent.p;
    evaluation.evidence.bestRisk = guessEvent.minP;
    evaluation.evidence.actualRisk = guessEvent.actualP;
    evaluation.evidence.bestActualRisk = guessEvent.actualMinP;
    evaluation.evidence.justiceProtected = guessEvent.justice === true;
    evaluation.evidence.bestRiskTaken = guessEvent.p <= guessEvent.minP + 1e-12;
    evaluation.evidence.expectedLife = guessEvent.expectedLife;
    evaluation.evidence.bestExpectedLife = guessEvent.bestExpectedLife;
  } else if (firstReveal) {
    const blindRisk = config.mines / cells.length;
    evaluation.evidence.oddsMeasured = true;
    evaluation.evidence.chosenRisk = blindRisk;
    evaluation.evidence.bestRisk = blindRisk;
    evaluation.evidence.actualRisk = blindRisk;
    evaluation.evidence.bestActualRisk = blindRisk;
    evaluation.evidence.bestRiskTaken = true;
  }

  if (firstReveal) {
    setDecisionChoices(evaluation, 'first-safe-reveal',
      cells.map((_, cellIndex) => cellIndex));
  } else if (safeAvailable) {
    setDecisionChoices(evaluation, 'guaranteed-safe-reveal',
      measuredGuess ? guessEvent.bestCells : local.safeCells, 0);
  } else if (measuredGuess) {
    setDecisionChoices(evaluation, 'minimum-risk-reveal',
      guessEvent.bestCells, guessEvent.minP);
  } else if (settings.playMode === 'angelic' && local.complete) {
    setDecisionChoices(evaluation, 'angelic-safe-reveal',
      cells.map((cell, cellIndex) => ({ cell, cellIndex }))
        .filter(({ cell, cellIndex }) =>
          !cell.revealed && !cell.flagged && local.facts.get(cellIndex) !== 1)
        .map(({ cellIndex }) => cellIndex));
  }

  if (provenMine) evaluation.mistakes.push('opened-proven-mine');
  if (provenMine && safeAvailable) evaluation.mistakes.push('ignored-safe-move');
  if (!provenMine && measuredGuess && guessEvent.p > 1e-12
      && guessEvent.minP <= 1e-12
      && guessEvent.actualP > guessEvent.actualMinP + 1e-12) {
    evaluation.mistakes.push('guessed-with-safe-move');
  }
  if (measuredGuess && guessEvent.minP > 1e-12
      && guessEvent.p > guessEvent.minP + 1e-12
      && guessEvent.actualP > guessEvent.actualMinP + 1e-12) {
    evaluation.mistakes.push('chose-higher-risk');
  }
  if (measuredGuess && guessEvent.bestExpectedLife > guessEvent.expectedLife + 1e-9) {
    evaluation.mistakes.push('chose-lower-modeled-life');
  }
  if (!provenMine && !provenSafe && !measuredGuess && safeAvailable
      && local.complete
      && settings.playMode !== 'angelic') {
    evaluation.mistakes.push('opened-unproven-with-safe-move');
  }

  const bestCells = measuredGuess ? guessEvent.bestCells : local.safeCells;
  if (safeAvailable) addAlternative(evaluation, 'safe-reveal', bestCells, 0);
  else if (measuredGuess && guessEvent.p > guessEvent.minP + 1e-12) {
    addAlternative(evaluation, 'lower-risk-reveal', guessEvent.bestCells, guessEvent.minP);
  }
  if (measuredGuess && guessEvent.bestExpectedLife > guessEvent.expectedLife + 1e-9) {
    addAlternative(evaluation, 'higher-modeled-life-reveal', guessEvent.bestExpectedCells);
  }
  return evaluation;
}

function evaluateChordAction(index, toReveal) {
  const evaluation = actionEvaluationBase('chord', inputActionCount, toReveal, index);
  try {
    const view = playerView();
    const local = coveredFactsInfo(view);
    const odds = Odds.analyzeView(view);
    const oddsMeasured = odds.measured === true;
    const isSafe = (cell) => local.facts.get(cell) === 2
      || (oddsMeasured && odds.pMine[cell] <= 1e-12);
    const isMine = (cell) => local.facts.get(cell) === 1
      || (oddsMeasured && odds.pMine[cell] >= 1 - 1e-12);
    const flagged = neighbors(index).filter((cell) => cells[cell].flagged);
    const wrongFlags = flagged.filter(isSafe);
    const openedMines = toReveal.filter(isMine);
    const safeCells = [];
    for (let cell = 0; cell < cells.length; cell++) {
      if (!view.revealed[cell] && isSafe(cell)) safeCells.push(cell);
    }
    evaluation.evidence.factsMeasured = local.complete || oddsMeasured;
    evaluation.evidence.oddsMeasured = oddsMeasured;
    evaluation.evidence.safeAvailable = safeCells.length > 0;
    evaluation.evidence.wrongFlags = wrongFlags;
    evaluation.evidence.openedProvenMines = openedMines;
    setDecisionChoices(evaluation, 'guaranteed-safe-reveal',
      safeCells.filter((cell) => !cells[cell].flagged), 0);
    if (wrongFlags.length > 0 || openedMines.length > 0) {
      evaluation.mistakes.push('chord-visible-contradiction');
    }
    addAlternative(evaluation, 'unflag-proven-safe', wrongFlags);
    addAlternative(evaluation, 'flag-proven-mine', openedMines);
    addAlternative(evaluation, 'safe-reveal',
      safeCells.filter((cell) => !cells[cell].flagged), 0);
    if (settings.playMode === 'proof-or-die'
        && (local.complete || oddsMeasured)
        && toReveal.some((cell) => !isSafe(cell))
        && safeCells.length > 0) {
      evaluation.mistakes.push('opened-unproven-with-safe-move');
      addAlternative(evaluation, 'safe-reveal', safeCells, 0);
    }
  } catch (err) {
    backupStatus.textContent = 'action evaluation failed: ' + err.message;
    evaluation.evidence.factsMeasured = false;
  }
  return evaluation;
}

function evaluateFlagAction(index, removing) {
  const action = removing ? 'flag-remove' : 'flag-place';
  const evaluation = actionEvaluationBase(action, inputActionCount, [index]);
  try {
    const view = playerView();
    const local = coveredFactsInfo(view);
    const odds = Odds.analyzeView(view);
    const oddsMeasured = odds.measured === true;
    const provenMine = local.facts.get(index) === 1
      || (oddsMeasured && odds.pMine[index] >= 1 - 1e-12);
    const provenSafe = local.facts.get(index) === 2
      || (oddsMeasured && odds.pMine[index] <= 1e-12);
    const mineCells = [];
    if (oddsMeasured) {
      for (let cell = 0; cell < cells.length; cell++) {
        if (!view.revealed[cell] && odds.pMine[cell] >= 1 - 1e-12) mineCells.push(cell);
      }
    } else {
      mineCells.push(...local.mineCells);
    }
    evaluation.evidence.factsMeasured = local.complete || oddsMeasured;
    evaluation.evidence.oddsMeasured = oddsMeasured;
    evaluation.evidence.knowledge = provenMine ? 'proven-mine'
      : provenSafe ? 'proven-safe'
        : (local.complete || oddsMeasured) ? 'uncertain' : 'unmeasured';
    if (removing) {
      const safeFlags = [];
      for (let cell = 0; cell < cells.length; cell++) {
        if (cells[cell].flagged
            && (local.facts.get(cell) === 2
              || (oddsMeasured && odds.pMine[cell] <= 1e-12))) {
          safeFlags.push(cell);
        }
      }
      setDecisionChoices(evaluation, 'proven-safe-flag-to-remove', safeFlags);
    } else {
      setDecisionChoices(evaluation, 'proven-mine-to-flag', mineCells);
    }
    if (!removing && evaluation.evidence.knowledge === 'proven-safe') {
      evaluation.mistakes.push('flagged-proven-safe');
      addAlternative(evaluation, 'flag-proven-mine', mineCells);
    }
    if (removing && evaluation.evidence.knowledge === 'proven-mine') {
      evaluation.mistakes.push('removed-proven-mine-flag');
      addAlternative(evaluation, 'keep-proven-mine-flag', [index]);
    }
  } catch (err) {
    backupStatus.textContent = 'action evaluation failed: ' + err.message;
    evaluation.evidence.factsMeasured = false;
  }
  return evaluation;
}

function evaluateNoOpAction(index, reason) {
  const evaluation = actionEvaluationBase(
    'no-op', inputActionCount, index === null ? [] : [index],
    undefined, { position: false });
  evaluation.mistakes.push('no-op-click');
  evaluation.evidence.reason = reason;
  return evaluation;
}

function recordActionEvaluation(evaluation, result) {
  if (!evaluation) return;
  evaluation.result = result;
  traceDecision(evaluation);
  if (result === 'death' || evaluationHasMistake(evaluation)) {
    actionEvaluations.push(evaluation);
    sessionRecordEvaluation(evaluation);
  }
}

'use strict';

// Game-end evaluation: the pure verdict model (categories, labels, report
// entries) and the capture that reads the live board at each judged action.

//-------GAME-END EVALUATION: VERDICT (pure)-------

// Compatibility labels for legacy records and imports, which stored this
// five-way verdict. Current records store multidimensional action evidence
// instead.
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
    records: 'an optional one-move survival model comparison where another action had higher expected remaining life' },
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

// Whether an action took more risk than the least on offer under the rules
// in play; undefined when its risk was not measured. A guess judged since
// 2026-11-03 saved the exact verdict, from layout counts; an older one is
// judged from its saved risks, decimals within a rounding tolerance.
function evaluationTookHigherRisk(evaluation) {
  const evidence = evaluation.evidence || {};
  if (typeof evidence.bestActualRiskTaken === 'boolean') return !evidence.bestActualRiskTaken;
  const delta = evaluationRiskDelta(evaluation);
  return delta === undefined ? undefined : delta > 1e-12;
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
  if (!position || typeof position.cells !== 'string'
      || !Number.isFinite(position.width) || !Number.isFinite(position.height)
      || !Number.isFinite(position.mines)) return undefined;
  const safeTotal = position.width * position.height - position.mines;
  if (safeTotal <= 0) return undefined;
  return positionOpenCount(position) / safeTotal;
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
  if (hasRiskRule && evaluationTookHigherRisk(evaluation) !== false) {
    return evaluationIsEarlyGame(evaluation) ? 'earlyGuess' : 'gameRisk';
  }
  if ([...TIME_LOSS_MISTAKES].some((kind) => mistakes.has(kind))) return 'timeLoss';
  // The tag is the verdict, set from exact counts: a real gap can be
  // smaller than any decimal tolerance on the stored lives.
  if (mistakes.has('chose-lower-modeled-life')) return 'lifeMaximization';
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
// report's legacy labels and its verdict styling (the session results
// classify losses through lossKindOf below). Never the evidence source:
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
      || evidence.safeAvailable === true
      || evaluationJusticeSafeAvailable(evidence)) return 'needless';
  if (mistakes.has('chose-higher-risk') || evaluation.action === 'proof-open') {
    return 'forced';
  }
  // Chord is only the input method. Without an exact set-risk rank, a
  // modern uncertain chord with no safe alternative is a forced,
  // risk-rank-unmeasured mine opening. Legacy chord verdicts returned above
  // retain their old chart line as provenance.
  if (evaluation.action === 'chord') return 'forced';
  if (evidence.firstReveal === true || evaluationTookHigherRisk(evaluation) === false) return 'angel';
  return 'other';
}

function fatalEvaluationOf(record) {
  if (!Array.isArray(record.actionEvaluations)) return undefined;
  for (let i = record.actionEvaluations.length - 1; i >= 0; i--) {
    if (record.actionEvaluations[i].result === 'death') return record.actionEvaluations[i];
  }
  return undefined;
}

// The modern fatal-action status: one exclusive kind per fatal action,
// refined below into the loss type that the after-game report and the
// session results both name. FATAL_STATUS_LABELS words each status;
// a status the loss type does not refine keeps these words. The proof
// statuses belong to games saved in Proof-or-die, a mode removed
// 2026-10-21 with the other no-guess modes; no new game produces them.
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

// A covered square was proven safe: the canonical prover or the
// remaining-layout odds found one. The odds are ratios of layout counts,
// exactly 0 for a square no layout mines.
function evaluationProvenSafeAvailable(evidence) {
  return evidence.safeAvailable === true || evidence.bestRisk === 0;
}

// A safe entry existed under the active rules (A Just Universe certifies
// some guesses) even where no square was proven safe.
function evaluationJusticeSafeAvailable(evidence) {
  return evidence.bestActualRisk === 0;
}

function fatalActionStatusKind(evaluation) {
  if (!evaluation || evaluation.result !== 'death') return undefined;
  const evidence = evaluation.evidence || {};
  const mistakes = new Set(Array.isArray(evaluation.mistakes)
    ? evaluation.mistakes : []);
  const provenMine = mistakes.has('opened-proven-mine')
    || evidence.knowledge === 'proven-mine'
    || (Array.isArray(evidence.openedProvenMines)
      && evidence.openedProvenMines.length > 0);
  const safeAvailable = evaluationProvenSafeAvailable(evidence)
    || evaluationJusticeSafeAvailable(evidence);
  if (provenMine) return safeAvailable ? 'mine-safe' : 'mine-forced';
  if (evaluation.action === 'proof-open') {
    return safeAvailable ? 'proof-safe' : 'proof-forced';
  }
  if (safeAvailable) return 'guess-safe';
  // A forced guess death before the board opened up is the mode's
  // entry fee: over enough games it must happen, so it files as one
  // routine kind whatever the risk rank was (creator, 2026-08-24).
  // Guessing past a proven-safe move stays 'guess-safe' at any stage.
  if (evaluationIsEarlyGame(evaluation)) return 'guess-early';
  const higher = evaluationTookHigherRisk(evaluation);
  if (higher === undefined) return 'guess-unmeasured';
  return higher ? 'guess-higher' : 'guess-min';
}

// The loss type (creator request 2026-10-11): one exclusive kind per modern
// loss naming the error that ended it. It refines the fatal-action status
// with facts only: the saved position, the solver's proof rules, and the
// death itself.
// - A wrong flag comes first. A chord opens only around a number whose
//   flags match its count, and a reveal beside a number already carrying
//   all its flags opened a square those flags declared safe; either way,
//   opening a mine proves one of those flags wrong.
// - A clicked proven mine and a guess past a proven-safe square are graded
//   by the easiest proof tier that settles them: the deduction levels
//   (docs/product/design-axis.md, "Deduction levels") counting and overlap,
//   or 'whole-board' for all numbers and the mine total together. The
//   tiers are measured once on the evidence (fatalProofTiers). A guess where
//   only A Just Universe guaranteed a safe entry is its own kind.
// - A higher-risk forced guess is graded by how far the nearest
//   lowest-risk square was from the chosen one.
// Every other status is its own loss type, as is a refinable status whose
// record has no saved position. Likely misclicks are inferences, not facts,
// and stay an overlay (likelyMisclickReasonsOf).
const LOSS_TYPE_LABELS = {
  'flag-wrong': 'opened a mine that a wrong flag made look safe',
  'mine-counting': 'opened a mine that counting single numbers proved',
  'mine-overlap': 'opened a mine that comparing overlapping numbers proved',
  'mine-whole-board': 'opened a mine that only whole-board reasoning proved',
  'guess-safe-counting': 'died after guessing while counting single numbers proved a square safe',
  'guess-safe-overlap': 'died after guessing while comparing overlapping numbers proved a square safe',
  'guess-safe-whole-board': 'died after guessing while only whole-board reasoning proved a square safe',
  'guess-safe-justice': 'died after guessing while A Just Universe guaranteed a safe entry',
  'guess-higher-near': 'died from a higher-risk forced guess with a lowest-risk square within 2 squares',
  'guess-higher-far': 'died from a higher-risk forced guess with every lowest-risk square 3 or more squares away',
  ...FATAL_STATUS_LABELS,
};

// Lowest-risk squares at most this many squares away in any direction
// count as near the chosen square.
const LOWER_RISK_NEAR_SQUARES = 2;

const PROOF_TIER_PHRASES = {
  counting: 'counting single numbers',
  overlap: 'comparing overlapping numbers',
  'whole-board': 'only whole-board reasoning',
};

// A saved board (an evaluation's `position`) keeps its squares in `cells`,
// one character per square in index order: '.' covered, 'F' flagged, '0' to
// '8' an open square's number. A square list (an alternative's or a choice's
// `cells`) is its squares joined by commas. Both are strings because a
// history holds tens of thousands of them: kept as arrays of pairs, reading
// them back took most of the page's load (2026-10-26).
function positionNumbers(position) {
  const numbers = new Map();
  const cells = position.cells;
  for (let cell = 0; cell < cells.length; cell++) {
    const number = cells.charCodeAt(cell) - 48;
    if (number >= 0 && number <= 8) numbers.set(cell, number);
  }
  return numbers;
}

function positionFlags(position) {
  const flags = new Set();
  const cells = position.cells;
  for (let cell = cells.indexOf('F'); cell !== -1; cell = cells.indexOf('F', cell + 1)) flags.add(cell);
  return flags;
}

function positionOpenCount(position) {
  let count = 0;
  const cells = position.cells;
  for (let cell = 0; cell < cells.length; cell++) {
    const number = cells.charCodeAt(cell) - 48;
    if (number >= 0 && number <= 8) count++;
  }
  return count;
}

function squareList(cells) {
  return cells.split(',').map(Number);
}

function positionView(position) {
  const size = position.width * position.height;
  const revealed = new Array(size).fill(false);
  const adjacent = new Array(size).fill(0);
  for (const [cell, number] of positionNumbers(position)) {
    revealed[cell] = true;
    adjacent[cell] = number;
  }
  return {
    width: position.width, height: position.height, mines: position.mines,
    revealed, adjacent,
  };
}

// Evaluations saved before 2026-10-26 kept a board as `revealed`
// ([square, number] pairs) and `flagged` (squares), and each square list as
// an array. Temporary: saved records convert as they load and saved traces
// as they are read, until BACKLOG.md "Board strings: step 2" removes this.
function stringFormatEvaluation(evaluation) {
  const position = evaluation.position;
  const pairBoard = position !== undefined && Array.isArray(position.revealed);
  const arrayLists = ['alternatives', 'choices'].some((field) => Array.isArray(evaluation[field])
    && evaluation[field].some((list) => Array.isArray(list.cells)));
  if (!pairBoard && !arrayLists) return evaluation;
  const converted = { ...evaluation };
  if (pairBoard) {
    const size = position.width * position.height;
    const cells = new Array(size).fill('.');
    for (const [cell, number] of position.revealed) {
      if (!(Number.isInteger(cell) && cell >= 0 && cell < size && Number.isInteger(number)
          && number >= 0 && number <= 8 && cells[cell] === '.')) {
        throw new Error('saved board has an unconvertible open square: ' + JSON.stringify([cell, number]));
      }
      cells[cell] = String(number);
    }
    for (const cell of position.flagged) {
      if (!(Number.isInteger(cell) && cell >= 0 && cell < size && cells[cell] === '.')) {
        throw new Error('saved board has an unconvertible flag: ' + JSON.stringify(cell));
      }
      cells[cell] = 'F';
    }
    converted.position = { width: position.width, height: position.height, mines: position.mines,
      cells: cells.join('') };
  }
  for (const field of ['alternatives', 'choices']) {
    if (!Array.isArray(evaluation[field])) continue;
    converted[field] = evaluation[field].map((list) => {
      if (!Array.isArray(list.cells)) return list;
      if (list.cells.length === 0 || !list.cells.every((cell) => Number.isInteger(cell) && cell >= 0)) {
        throw new Error('saved square list is unconvertible: ' + JSON.stringify(list.cells));
      }
      return { ...list, cells: list.cells.join(',') };
    });
  }
  return converted;
}

function squareDistance(width, a, b) {
  return Math.max(Math.abs((a % width) - (b % width)),
    Math.abs(Math.floor(a / width) - Math.floor(b / width)));
}

// Whether a revealed number next to `cell` already carried exactly as many
// flags as its count, which declares every other covered neighbor safe.
function besideFlagSatisfiedNumber(position, cell) {
  const flagged = positionFlags(position);
  for (const [number, count] of positionNumbers(position)) {
    if (count === 0 || squareDistance(position.width, number, cell) !== 1) continue;
    let flags = 0;
    for (const around of Justice.neighbors(number, position.width, position.height)) {
      if (flagged.has(around)) flags++;
    }
    if (flags === count) return true;
  }
  return false;
}

// The easiest proof tier whose rules prove `fact` (1 mine, 2 safe) for
// `cell`, or for any covered square when `cell` is undefined: the first two
// deduction levels, then 'whole-board' for the last two, all numbers and the
// mine total, which the stored tiers do not tell apart. The caller knows the
// fact holds, so what the counting and overlap rules miss needed
// whole-board reasoning and the exhaustive prover never runs.
function easiestProofTier(position, fact, cell) {
  const view = positionView(position);
  const clues = Justice.rawClues(view);
  const proves = (facts) => (cell === undefined
    ? [...facts.values()].includes(fact) : facts.get(cell) === fact);
  const [counting, overlap] = Justice.DEDUCTION_LEVELS;
  if (proves(Justice.proveFacts(view, clues, counting.proof))) return 'counting';
  if (proves(Justice.proveFacts(view, clues, overlap.proof))) return 'overlap';
  return 'whole-board';
}

// The fatal reveal's proof tiers, measured from its saved position and kept
// on its evidence: mineProofTier when the opened square was a proven mine,
// safeProofTier when any covered square was proven safe. A chord's loss type
// is its wrong flag, so chords carry neither. Recorded at the death
// (recordActionEvaluation); history normalization adds them once to losses
// saved before 2026-10-11. Returns only the tiers the evaluation lacks.
function fatalProofTiers(evaluation) {
  if (evaluation.version !== ACTION_EVALUATION_VERSION || evaluation.legacy
      || evaluation.result !== 'death' || evaluation.action === 'chord'
      || evaluation.position === undefined) return {};
  const evidence = evaluation.evidence || {};
  const status = fatalActionStatusKind(evaluation);
  const tiers = {};
  if ((status === 'mine-safe' || status === 'mine-forced')
      && evidence.mineProofTier === undefined) {
    tiers.mineProofTier = easiestProofTier(evaluation.position, 1, evaluation.selected[0]);
  }
  if (evaluationProvenSafeAvailable(evidence) && evidence.safeProofTier === undefined) {
    tiers.safeProofTier = easiestProofTier(evaluation.position, 2);
  }
  return tiers;
}

// The death stores both tiers and history normalization adds them to older
// losses, so a positioned fatal action without its tier is a bug.
function storedProofTier(tier) {
  if (!Object.hasOwn(PROOF_TIER_PHRASES, tier)) {
    throw new Error('positioned fatal action has no stored proof tier (got ' + tier + ')');
  }
  return tier;
}

function nearestLowestRiskDistance(evaluation) {
  const lower = evaluation.alternatives.find((alternative) =>
    alternative.kind === 'lower-risk-reveal');
  if (lower === undefined) return undefined;
  const chosen = evaluation.selected[0];
  return Math.min(...squareList(lower.cells).map((cell) =>
    squareDistance(evaluation.position.width, cell, chosen)));
}

// Memoized per evaluation object: the session summary recounts every loss
// in its window at each game end.
const lossTypeCache = new WeakMap();

function lossTypeOf(evaluation) {
  if (evaluation.version !== ACTION_EVALUATION_VERSION || evaluation.legacy) return undefined;
  const status = fatalActionStatusKind(evaluation);
  if (status === undefined) return undefined;
  if (!lossTypeCache.has(evaluation)) {
    lossTypeCache.set(evaluation, refinedLossType(evaluation, status));
  }
  return lossTypeCache.get(evaluation);
}

function refinedLossType(evaluation, status) {
  const evidence = evaluation.evidence || {};
  const position = evaluation.position;
  const provenMine = status === 'mine-safe' || status === 'mine-forced';
  const proofOrDie = evidence.playMode === 'proof-or-die';
  // Proof-or-die (removed; its saved games remain) ended a game on any
  // unproven open, so there a chord over unproven squares is a rule death
  // like an unproven reveal, and only a proven mine shows the opened square
  // was mined.
  if (proofOrDie && evaluation.action === 'chord' && !provenMine) {
    return evaluationProvenSafeAvailable(evidence)
      || evaluationJusticeSafeAvailable(evidence) ? 'proof-safe' : 'proof-forced';
  }
  if (position === undefined || status === 'proof-safe' || status === 'proof-forced') {
    return status;
  }
  if ((!proofOrDie || provenMine) && (evaluation.action === 'chord'
      || besideFlagSatisfiedNumber(position, evaluation.selected[0]))) {
    return 'flag-wrong';
  }
  if (provenMine) return 'mine-' + storedProofTier(evidence.mineProofTier);
  if (status === 'guess-safe') {
    return evaluationProvenSafeAvailable(evidence)
      ? 'guess-safe-' + storedProofTier(evidence.safeProofTier) : 'guess-safe-justice';
  }
  if (status === 'guess-higher') {
    const distance = nearestLowestRiskDistance(evaluation);
    if (distance === undefined) return status;
    return distance <= LOWER_RISK_NEAR_SQUARES ? 'guess-higher-near' : 'guess-higher-far';
  }
  return status;
}

// A slip shows as an input under a second after the one it follows
// (creator rule 2026-08-28; exactly 1,000ms does not qualify). Shared by the
// captured recent-wrong-flag tag and the wrong-button pattern below.
const LIKELY_MISCLICK_MAX_MS = 1000;

// The wrong-button slip (creator request 2026-10-11): a direct reveal of a
// proven mine under a second after a chord on a neighboring number failed
// for lack of flags, with no input between them. The mine was one of that
// number's missing flags, so the player most likely meant to flag it.
// Read from the saved ledger: the failed chord is a no-op entry, and every
// accepted input takes the next action number.
function wrongButtonEvidenceOf(evaluation, ledger) {
  const status = fatalActionStatusKind(evaluation);
  if (evaluation.action !== 'reveal' || evaluation.position === undefined
      || (status !== 'mine-safe' && status !== 'mine-forced')) return undefined;
  const chord = ledger.find((entry) => entry.action === 'no-op'
    && entry.actionNumber === evaluation.actionNumber - 1);
  if (chord === undefined || chord.evidence.reason !== 'chord-short-of-flags') return undefined;
  const gapMs = evaluation.atMs - chord.atMs;
  const number = chord.selected[0];
  if (!(gapMs >= 0 && gapMs < LIKELY_MISCLICK_MAX_MS)
      || squareDistance(evaluation.position.width, number, evaluation.selected[0]) !== 1) {
    return undefined;
  }
  return { numberCell: number, gapMs };
}

// The likely-misclick reasons in display order, worded for the session
// summary's rows.
const LIKELY_MISCLICK_REASON_LABELS = {
  'wrong-flag': 'adjacent wrong flag placed under a second before',
  'wrong-button': 'left click on a proven mine under a second after a chord beside it lacked flags',
};

// The likely-misclick overlay: inferred slips, any number per loss, never a
// loss type (creator decision 2026-08-28). 'wrong-flag' is the captured
// tag; 'wrong-button' is read from the ledger.
function likelyMisclickReasonsOf(evaluation, ledger) {
  if (evaluation.version !== ACTION_EVALUATION_VERSION) return [];
  const reasons = [];
  if (evaluation.mistakes.includes('likely-misclick-after-wrong-flag')) reasons.push('wrong-flag');
  if (wrongButtonEvidenceOf(evaluation, ledger) !== undefined) reasons.push('wrong-button');
  return reasons;
}

// The evidence lines a modern fatal action adds for its loss type and the
// ledger-read misclick reason.
function fatalEvidenceLines(evaluation, ledger) {
  if (evaluation.version !== ACTION_EVALUATION_VERSION || evaluation.legacy) return [];
  const lines = [];
  const type = lossTypeOf(evaluation);
  if (type === 'flag-wrong' && evaluation.action !== 'chord') {
    lines.push({ label: 'Wrong flag', value: 'a number beside this square already had all '
      + 'its flags, so one of them was on a safe square' });
  }
  if (type === 'guess-higher-near' || type === 'guess-higher-far') {
    const distance = nearestLowestRiskDistance(evaluation);
    lines.push({ label: 'Lowest-risk square',
      value: distance + (distance === 1 ? ' square' : ' squares') + ' away' });
  }
  const wrongButton = wrongButtonEvidenceOf(evaluation, ledger);
  if (wrongButton !== undefined) {
    lines.push({ label: 'Likely misclick', value: 'left-clicked this proven mine '
      + Math.round(wrongButton.gapMs) + 'ms after a chord on the number beside it '
      + 'failed for lack of flags' });
  }
  return lines;
}

// A loss's kind: the modern loss type, the same classification the
// report's fatal-action heading names, so the session results' rows are
// exactly the report's reasons for losing; a legacy-imported record's stored
// five-way verdict stays its own kind (coarse old evidence is never upgraded
// by inventing detail); 'other' when nothing was measurable.
function lossKindOf(evaluation) {
  if (!evaluation) return 'other';
  if (evaluation.version !== ACTION_EVALUATION_VERSION) return 'other';
  if (evaluation.legacy) {
    return DEATH_KIND_LABELS[evaluation.legacy.deathKind]
      ? evaluation.legacy.deathKind : 'other';
  }
  return lossTypeOf(evaluation) || 'other';
}

// The win type (creator request 2026-10-14: "there are types of wins, since
// sometimes you'll WIN by accident"): one exclusive kind per win, named by
// the worst guess the player survived. A guess is a click on a square that
// might hold a mine, after the first click; its risk is the actual risk
// under the active rules, so a guess A Just Universe made safe risked
// nothing. Worst first: a guess past a proven-safe square, a higher-risk
// forced guess, the same before the board opened up (filed apart, as early
// losses are), lowest-risk guesses only, none. The saved action evaluations
// hold every survived guess riskier than necessary; the guess ledger counts
// the rest, and without it a clean-looking win stays unmeasured. Lowest-risk
// guesses split by the one-move choice (creator request 2026-11-03): whether
// every guess was also the best one-move choice, the square with the highest
// one-move life (the chance to survive it and then the safest next square).
const WIN_TYPE_LABELS = {
  'win-no-guess': 'won without guessing',
  'win-guess-min-best': 'won guessing only at the lowest risk, each guess the best one-move choice',
  'win-guess-min': 'won guessing only at the lowest risk, not each guess the best one-move choice',
  'win-guess-min-unrated': 'won guessing only at the lowest risk; one-move choices not measured',
  'win-guess-early': 'won despite a higher-risk early-game guess',
  'win-guess-higher': 'won despite a higher-risk forced guess',
  'win-guess-safe': 'won despite guessing while a safe move was available',
  'win-unmeasured': 'won; guesses not measured',
};

// The guess ledgers whose one-move verdicts (`guessPerfect`) are exact,
// counted from layouts; earlier ones estimated some squares' one-move life.
// A later ledger version joins this list when it keeps them exact.
const EXACT_ONE_MOVE_LEDGERS = new Set(['guess-ledger-v3']);

// Whether every guess of the game was the best one-move choice; undefined
// where the ledger's one-move verdicts are not exact or it has none.
function everyGuessBestOneMove(record) {
  if (!EXACT_ONE_MOVE_LEDGERS.has(record.oddsVersion)) return undefined;
  return record.guessPerfect === record.guesses;
}

// A lowest-risk kind refined by the one-move choice: `kind` + '-best' when
// every guess was the best one, the kind itself when one was not, + '-unrated'
// when the ledger cannot tell.
function oneMoveKind(kind, record) {
  const best = everyGuessBestOneMove(record);
  return best === undefined ? kind + '-unrated' : best ? kind + '-best' : kind;
}

function winTypeOf(record) {
  // Proof-or-die (removed; its saved games remain) killed every unproven
  // open, so its wins never guessed.
  if (record.playMode === 'proof-or-die') return 'win-no-guess';
  const evaluations = record.actionEvaluations;
  if (evaluations.some((evaluation) => evaluation.legacy
      || evaluation.version !== ACTION_EVALUATION_VERSION)) {
    return record.guesses === 0 ? 'win-no-guess' : 'win-unmeasured';
  }
  const survived = worstSurvivedGuess(evaluations);
  if (survived !== undefined) return 'win-guess-' + survived;
  if (record.guesses === undefined) return 'win-unmeasured';
  return record.guesses > 0 ? oneMoveKind('win-guess-min', record) : 'win-no-guess';
}

// The worst guess a game survived, worst first: 'safe', past a proven-safe
// square; 'higher', riskier than the lowest available after the opening;
// 'early', the same in the opening. Undefined when the saved evaluations
// hold none. The tags are stored only where the risk under the active rules
// was higher, so a guess A Just Universe made safe is no such guess.
function worstSurvivedGuess(evaluations) {
  let worst;
  for (const evaluation of evaluations) {
    if (evaluation.result === 'death') continue;
    if (evaluation.mistakes.includes('guessed-with-safe-move')
        || evaluation.mistakes.includes('opened-unproven-with-safe-move')) return 'safe';
    if (evaluation.mistakes.includes('chose-higher-risk')) {
      if (!evaluationIsEarlyGame(evaluation)) worst = 'higher';
      else if (worst === undefined) worst = 'early';
    }
  }
  return worst;
}

// How bad a loss's fatal click was against perfect play, for comparing it
// with the worst guess the game survived: 0, a lowest-risk forced guess;
// 1, a riskier guess than necessary; 2, a guess past a safe move; 3, a wrong
// flag or a proven mine. A forced guess of unmeasured risk takes its lowest
// possible rank, 0: if it was riskier, a survived riskier guess was just as
// bad, so the game's worst offense is that guess's either way. Proof-or-die's
// forced rule death, legacy verdicts, and unjudged losses are not ranked and
// keep their own kind.
const FATAL_OFFENSE_RANKS = {
  'guess-early-min': 0, 'guess-min': 0, 'guess-early-unmeasured': 0, 'guess-unmeasured': 0,
  'guess-early-higher': 1, 'guess-higher-near': 1, 'guess-higher-far': 1, 'guess-higher': 1,
  'guess-safe-counting': 2, 'guess-safe-overlap': 2, 'guess-safe-whole-board': 2,
  'guess-safe-justice': 2, 'guess-safe': 2, 'proof-safe': 2,
  'flag-wrong': 3, 'mine-counting': 3, 'mine-overlap': 3, 'mine-whole-board': 3,
  'mine-safe': 3, 'mine-forced': 3,
};
const SURVIVED_GUESS_RANKS = { safe: 2, higher: 1, early: 1 };

// The session results tree's kind for a game (creator request 2026-10-14:
// "1st split: wins/losses. then within each cat, break them down by the
// variety and type of worst offenses against perfect play"). A win is its
// win type. A loss is its loss type, with three refinements:
// - an early-game guess death splits by its risk rank like any other guess:
//   'guess-early-min', 'guess-early-higher', or 'guess-early-unmeasured';
// - when the game survived a guess worse than its fatal click, that guess
//   was the worst offense: 'survived-guess-safe' or 'survived-guess-higher';
// - a lowest-risk forced guess death after the opening splits by the
//   one-move choice, as lowest-risk wins do: 'guess-min-best' when every
//   guess of the game was the best one-move choice, 'guess-min' when one was
//   not, 'guess-min-unrated' when the ledger cannot tell.
function sessionResultKind(record) {
  if (record.outcome === 'win') return winTypeOf(record);
  const fatal = fatalEvaluationOf(record);
  let kind = lossKindOf(fatal);
  if (kind === 'guess-early') {
    const higher = evaluationTookHigherRisk(fatal);
    kind = higher === undefined ? 'guess-early-unmeasured'
      : higher ? 'guess-early-higher' : 'guess-early-min';
  }
  if (!Object.hasOwn(FATAL_OFFENSE_RANKS, kind)) return kind;
  const survived = worstSurvivedGuess(record.actionEvaluations);
  if (survived !== undefined && SURVIVED_GUESS_RANKS[survived] > FATAL_OFFENSE_RANKS[kind]) {
    return survived === 'safe' ? 'survived-guess-safe' : 'survived-guess-higher';
  }
  return kind === 'guess-min' ? oneMoveKind(kind, record) : kind;
}

function actionEvaluationLabel(evaluation) {
  if (evaluation.legacy
      && evaluation.legacy.source === 'pre-action-evaluation-coverage') {
    return 'action evidence unavailable for this older game';
  }
  if (evaluation.result === 'death') {
    if (!evaluation.legacy
        && evaluation.version === ACTION_EVALUATION_VERSION) {
      return LOSS_TYPE_LABELS[lossTypeOf(evaluation)];
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
    parts.push('The one-move survival model found another action with higher expected remaining life; this compares modeled outcomes, not intent.');
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
      'chord-short-of-flags': 'The number was still short of flags, so nothing opened. The 1.5 click flags its last mine and chords in one motion.',
      'chord-nothing-to-open': 'The number had nothing left to open.',
      'chord-too-many-flags': 'The number had more flags than its count, so nothing opened.',
      'chord-over-covered': 'Both buttons were released over a covered square; a chord needs a number.',
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
    parts.push(evaluationJusticeSafeAvailable(evidence)
      ? 'A Just Universe guaranteed a safe entry elsewhere; the selected square was not one and happened to be mined.'
      : 'No guaranteed-safe reveal was available. The selected square had the lowest measured mine risk and happened to be mined.');
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
      + (evaluationTookHigherRisk(evaluation) === true
        ? ' (+' + (delta * 100).toFixed(1) + ' percentage points)' : '')
      + '.');
  }
  if (typeof evidence.expectedLife === 'number'
      && typeof evidence.bestExpectedLife === 'number') {
    parts.push('One-move expected remaining life: '
      + evidence.expectedLife.toFixed(3) + ' selected; '
      + evidence.bestExpectedLife.toFixed(3) + ' best measured'
      + (mistakes.has('chose-lower-modeled-life')
        ? ' (gap ' + (evidence.bestExpectedLife - evidence.expectedLife).toFixed(3) + ')'
        : '') + '.');
  }
  const alternativeCount = new Set((evaluation.alternatives || [])
    .flatMap((alternative) => squareList(alternative.cells))).size;
  if (alternativeCount > 0) {
    parts.push(alternativeCount + ' alternative '
      + (alternativeCount === 1 ? 'move is' : 'moves are')
      + ' highlighted on the saved position.');
  }
  return parts.join(' ') || 'The action was recorded, but no further judgement was measurable.';
}

// Games recorded before 2026-09-26 night carry the one chord reason
// chord-unavailable; later games carry the four specific chord reasons.
const NO_OP_AGGREGATE_LABELS = {
  'chord-short-of-flags': 'Chord clicks on numbers still short of flags',
  'chord-nothing-to-open': 'Clicks on finished numbers',
  'chord-too-many-flags': 'Chord clicks with too many flags',
  'chord-over-covered': 'Chords released over covered squares',
  'chord-unavailable': 'Unsatisfied chord clicks',
  'left-clicked-flag': 'Left-clicks on flagged squares',
  'flagged-revealed-cell': 'Flag attempts on revealed squares',
};

// Why a click changed nothing, as a short phrase.
const NO_OP_REASON_PHRASES = {
  'chord-short-of-flags': 'number still short of flags',
  'chord-nothing-to-open': 'number had nothing left to open',
  'chord-too-many-flags': 'number had too many flags',
  'chord-over-covered': 'chord released over a covered square',
  'chord-unavailable': 'chord conditions were not met',
  'left-clicked-flag': 'left-clicked a flagged square',
  'flagged-revealed-cell': 'tried to flag a revealed square',
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

// extraLines: lines only the caller can measure, such as fatalEvidenceLines.
function actionEvaluationLines(evaluation, extraLines = []) {
  if (evaluation.version !== ACTION_EVALUATION_VERSION || evaluation.legacy) {
    return [{ label: 'Note', value: actionEvaluationText(evaluation) }];
  }
  const evidence = evaluation.evidence || {};
  const mistakes = new Set(Array.isArray(evaluation.mistakes)
    ? evaluation.mistakes : []);
  const lines = [];
  const byTier = (tier) => (tier === undefined ? '' : ' by ' + PROOF_TIER_PHRASES[tier]);
  if (mistakes.has('opened-proven-mine')) {
    lines.push({ label: 'Certainty',
      value: 'selected square was proven mined' + byTier(evidence.mineProofTier) });
  } else if (evidence.knowledge === 'proven-safe') {
    lines.push({ label: 'Certainty', value: 'selected square was proven safe' });
  }
  if (evidence.safeAvailable === true
      || mistakes.has('ignored-safe-move')
      || mistakes.has('guessed-with-safe-move')
      || mistakes.has('opened-unproven-with-safe-move')) {
    lines.push({ label: 'Safe alternative', value: evidence.safeProofTier === undefined
      ? 'available' : 'a square was proven safe' + byTier(evidence.safeProofTier) });
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
  // The active-rules gap is the saved verdict where the judgment saved one
  // (evaluationTookHigherRisk); the raw one is read from its decimals.
  const riskValue = (chosen, best, higher) => {
    const delta = Math.max(0, chosen - best);
    return pct(chosen) + ' selected · ' + pct(best) + ' minimum'
      + (higher ? ' · +' + (delta * 100).toFixed(1) + 'pp' : ' · tied');
  };
  const activeHigher = activeMeasured && evaluationTookHigherRisk(evaluation) === true;
  if (sameRisk) {
    lines.push({ label: 'Immediate risk', value:
      riskValue(evidence.actualRisk, evidence.bestActualRisk, activeHigher) });
  } else {
    if (rawMeasured) {
      lines.push({ label: 'Raw mine risk', value: riskValue(evidence.chosenRisk, evidence.bestRisk,
        evidence.chosenRisk - evidence.bestRisk > 1e-12) });
    }
    if (activeMeasured) {
      lines.push({ label: 'Under active rules', value:
        riskValue(evidence.actualRisk, evidence.bestActualRisk, activeHigher) });
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
    lines.push({
      label: 'One-move life (model)',
      value: !evaluation.mistakes.includes('chose-lower-modeled-life')
        ? 'tied at ' + evidence.expectedLife.toFixed(3)
        : evidence.expectedLife.toFixed(3) + ' selected · '
          + evidence.bestExpectedLife.toFixed(3) + ' best · gap '
          + (evidence.bestExpectedLife - evidence.expectedLife).toFixed(3),
    });
  }
  if (mistakes.has('no-op-click')) {
    lines.push({ label: 'No-op', value: NO_OP_REASON_PHRASES[evidence.reason] || 'board state did not change' });
  }
  if (evidence.factsMeasured === false) {
    lines.push({ label: 'Visible facts', value: 'not measured' });
  }
  const alternatives = evaluation.alternatives || [];
  if (!evaluation.position && alternatives.length > 0) {
    const parts = alternatives.map((alternative) => {
      const count = squareList(alternative.cells).length;
      return count + ' ' + evaluationAlternativeLabel(alternative.kind).toLowerCase()
        + (count === 1 ? '' : 's');
    });
    lines.push({ label: 'Alternatives', value: parts.join(' · ') });
  }
  lines.push(...extraLines);
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
  for (const cell of positionNumbers(position).keys()) relevant.add(cell);
  for (const cell of positionFlags(position)) relevant.add(cell);
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
    + ': every click into a guess that nothing else on the board could '
    + 'ever settle goes your way.';
}

// One recap line per Justice event of the just-finished game, naming the
// guess in plain words (creator 2026-10-21: no coined terms with players).
// The counts and odds are the player's own information (derived from
// visible clues); nothing here peeks behind the board.
function justiceEventDetail(detail, index) {
  return '#' + (index + 1) + ': ' + justiceGuessName(detail)
    + ' \u2014 a forced coinflip, won.';
}

function justiceGuessName(detail) {
  if (detail.squareCount === 2 && detail.totalWays === 2) return 'a 50/50';
  if (detail.type === 'complement') {
    return 'a chain of 50/50s over ' + detail.squareCount + ' squares';
  }
  const mines = detail.mineCount === 1 ? '1 mine' : detail.mineCount + ' mines';
  const odds = ' (' + detail.clearWays + ' in ' + detail.totalWays + ' safe)';
  if (detail.type === 'sea') {
    return mines + ' among the last ' + detail.squareCount
      + ' squares no number touches' + odds;
  }
  return mines + ' among ' + detail.squareCount + ' squares' + odds;
}

//-------GAME-END EVALUATION: DECISIONS (pure; the reports worker judges a finished game)-------

// A click saves what it did and the board before it (CAPTURE below). Every
// judgment of it is made from that saved board when the game ends, in the
// reports worker: off the input thread (creator 2026-11-03: "we MUST not
// block the input thread"), each board proved once for this and the live
// perf charts, each proof resumed from the game's board before it
// (DuringGame.positionProofs). A game whose page closed before its
// evaluation was done is evaluated from its saved trace at the next load.

// The mistakes that make an action a misclick: the board before it already
// proved it wrong. The record's misclicks count the actions carrying one.
const MISCLICK_MISTAKES = new Set(['opened-proven-mine', 'flagged-proven-safe',
  'removed-proven-mine-flag', 'chord-visible-contradiction']);

// A proof tier (fatalProofTiers) from the deduction level that first proves
// a fact: the first two name themselves, the last two need the whole board.
const PROOF_TIER_OF_LEVEL = {
  counting: 'counting', overlap: 'overlap', allNumbers: 'whole-board', mineTotal: 'whole-board',
};

// The covered squares a proof settles, in square order.
function provenSquares(position, facts) {
  const safe = [];
  const mines = [];
  const squares = position.cells;
  for (let cell = 0; cell < squares.length; cell++) {
    if (squares[cell] !== '.' && squares[cell] !== 'F') continue;
    const fact = facts.get(cell);
    if (fact === 2) safe.push(cell);
    else if (fact === 1) mines.push(cell);
  }
  return { safe, mines };
}

function addAlternative(evaluation, kind, candidates, risk) {
  const selected = new Set(evaluation.selected);
  const squares = [...new Set(candidates)].filter((cell) => !selected.has(cell));
  if (squares.length === 0) return;
  const alternative = { kind, cells: squares.join(',') };
  if (typeof risk === 'number') alternative.risk = risk;
  evaluation.alternatives.push(alternative);
}

// A choice to open or to flag lists only squares its board left covered
// and unflagged.
function setDecisionChoices(evaluation, kind, candidates, risk) {
  const squares = evaluation.position.cells;
  const untouchedOnly = kind.endsWith('-reveal') || kind.endsWith('-to-flag');
  const choices = [...new Set(candidates)].filter((cell) => !untouchedOnly || squares[cell] === '.');
  if (choices.length === 0) return;
  const choice = { kind, cells: choices.join(',') };
  if (typeof risk === 'number') choice.risk = risk;
  evaluation.choices = [choice];
}

// Mistakes the proof finds come before those the click itself saw (a
// chord's outcome, a likely misclick, an unused flag).
function prependMistakes(evaluation, mistakes) {
  evaluation.mistakes = [...mistakes, ...evaluation.mistakes];
}

// `context`: { proofs, justiceEnabled, guessLedger } (completeGameEvaluations).
// Returns the guess's score (Odds.scoreGuess), or null when the ledger
// scores no guess here.
function completeReveal(evaluation, proof, context) {
  const { position, evidence } = evaluation;
  const { facts } = proof;
  const index = evaluation.selected[0];
  const proven = provenSquares(position, facts);
  const provenMine = facts.get(index) === 1;
  const provenSafe = facts.get(index) === 2;
  const safeAvailable = proven.safe.length > 0;
  evidence.factsMeasured = true;
  evidence.knowledge = provenMine ? 'proven-mine' : provenSafe ? 'proven-safe' : 'uncertain';
  if (provenMine) evidence.knowledgeSource = 'visible-deduction';
  evidence.safeAvailable = safeAvailable;
  const guess = context.guessLedger && !evidence.startedGame && !provenSafe
    ? Odds.scoreGuess(positionView(position), index,
      { odds: context.proofs.oddsOf(position), considerJustice: context.justiceEnabled })
    : null;
  const measuredGuess = guess !== null;
  evidence.oddsMeasured = measuredGuess;
  if (measuredGuess) {
    evidence.chosenRisk = guess.p;
    evidence.bestRisk = guess.minP;
    evidence.actualRisk = guess.actualP;
    evidence.bestActualRisk = guess.actualMinP;
    evidence.justiceProtected = guess.justice === true;
    evidence.bestActualRiskTaken = !guess.actualHigherRisk;
    evidence.expectedLife = guess.expectedLife;
    evidence.bestExpectedLife = guess.bestExpectedLife;
  } else if (evidence.firstReveal) {
    const blindRisk = position.mines / (position.width * position.height);
    evidence.oddsMeasured = true;
    evidence.chosenRisk = blindRisk;
    evidence.bestRisk = blindRisk;
    evidence.actualRisk = blindRisk;
    evidence.bestActualRisk = blindRisk;
    evidence.bestActualRiskTaken = true;
  }

  if (evidence.firstReveal) {
    setDecisionChoices(evaluation, 'first-safe-reveal', Array.from(position.cells, (_, cell) => cell));
  } else if (safeAvailable) {
    setDecisionChoices(evaluation, 'guaranteed-safe-reveal',
      measuredGuess ? guess.bestCells : proven.safe, 0);
  } else if (measuredGuess) {
    setDecisionChoices(evaluation, 'minimum-risk-reveal', guess.bestCells, guess.minP);
  } else if (evidence.playMode === 'angelic') {
    setDecisionChoices(evaluation, 'angelic-safe-reveal',
      Array.from(position.cells, (_, cell) => cell).filter((cell) => facts.get(cell) !== 1));
  }

  const mistakes = [];
  if (provenMine) mistakes.push('opened-proven-mine');
  if (provenMine && safeAvailable) mistakes.push('ignored-safe-move');
  if (!provenMine && measuredGuess && safeAvailable && guess.actualHigherRisk) {
    mistakes.push('guessed-with-safe-move');
  }
  if (measuredGuess && !safeAvailable && guess.higherRisk && guess.actualHigherRisk) {
    mistakes.push('chose-higher-risk');
  }
  if (measuredGuess && !guess.perfectPlay) mistakes.push('chose-lower-modeled-life');
  if (!provenMine && !provenSafe && !measuredGuess && safeAvailable
      && evidence.playMode !== 'angelic') {
    mistakes.push('opened-unproven-with-safe-move');
  }
  prependMistakes(evaluation, mistakes);

  const bestCells = measuredGuess ? guess.bestCells : proven.safe;
  if (safeAvailable) addAlternative(evaluation, 'safe-reveal', bestCells, 0);
  else if (measuredGuess && guess.higherRisk) {
    addAlternative(evaluation, 'lower-risk-reveal', guess.bestCells, guess.minP);
  }
  if (measuredGuess && !guess.perfectPlay) {
    addAlternative(evaluation, 'higher-modeled-life-reveal', guess.bestExpectedCells);
  }
  return guess;
}

function completeChord(evaluation, proof) {
  const { position, evidence } = evaluation;
  const { facts } = proof;
  const flags = positionFlags(position);
  const flagged = Justice.neighbors(evaluation.triggerCell, position.width, position.height)
    .filter((cell) => flags.has(cell));
  const wrongFlags = flagged.filter((cell) => facts.get(cell) === 2);
  const openedMines = evaluation.selected.filter((cell) => facts.get(cell) === 1);
  const proven = provenSquares(position, facts);
  const unflaggedSafe = proven.safe.filter((cell) => !flags.has(cell));
  evidence.factsMeasured = true;
  evidence.safeAvailable = proven.safe.length > 0;
  evidence.wrongFlags = wrongFlags;
  evidence.openedProvenMines = openedMines;
  setDecisionChoices(evaluation, 'guaranteed-safe-reveal', unflaggedSafe, 0);
  if (wrongFlags.length > 0 || openedMines.length > 0) {
    prependMistakes(evaluation, ['chord-visible-contradiction']);
  }
  addAlternative(evaluation, 'unflag-proven-safe', wrongFlags);
  addAlternative(evaluation, 'flag-proven-mine', openedMines);
  addAlternative(evaluation, 'safe-reveal', unflaggedSafe, 0);
}

function completeFlag(evaluation, proof) {
  const { position, evidence } = evaluation;
  const { facts } = proof;
  const index = evaluation.selected[0];
  const removing = evaluation.action === 'flag-remove';
  const proven = provenSquares(position, facts);
  evidence.factsMeasured = true;
  evidence.knowledge = facts.get(index) === 1 ? 'proven-mine'
    : facts.get(index) === 2 ? 'proven-safe' : 'uncertain';
  if (removing) {
    setDecisionChoices(evaluation, 'proven-safe-flag-to-remove',
      [...positionFlags(position)].filter((cell) => facts.get(cell) === 2));
  } else {
    setDecisionChoices(evaluation, 'proven-mine-to-flag', proven.mines);
  }
  if (!removing && evidence.knowledge === 'proven-safe') {
    prependMistakes(evaluation, ['flagged-proven-safe']);
    addAlternative(evaluation, 'flag-proven-mine', proven.mines);
  }
  if (removing && evidence.knowledge === 'proven-mine') {
    prependMistakes(evaluation, ['removed-proven-mine-flag']);
    addAlternative(evaluation, 'keep-proven-mine-flag', [index]);
  }
}

// A fatal reveal's proof tiers (fatalProofTiers), read from its board's
// proof levels.
function fatalTiersOfProof(evaluation, proof) {
  if (evaluation.action === 'chord') return {};
  const status = fatalActionStatusKind(evaluation);
  const tiers = {};
  if (status === 'mine-safe' || status === 'mine-forced') {
    tiers.mineProofTier = PROOF_TIER_OF_LEVEL[proof.levelOf.get(evaluation.selected[0])];
  }
  if (evaluationProvenSafeAvailable(evaluation.evidence)) {
    tiers.safeProofTier = 'whole-board';
    for (const [cell, level] of proof.levelOf) {
      if (proof.facts.get(cell) !== 2) continue;
      if (level === 'counting') {
        tiers.safeProofTier = 'counting';
        break;
      }
      if (level === 'overlap') tiers.safeProofTier = 'overlap';
    }
  }
  return tiers;
}

// A Justice event (attemptJustice): a reveal after the game began into an
// entry its board certifies, mined or not. Deliberately not recorded:
// whether the entry was mined before a redraw. The player's point of view is
// the only one that exists (creator request 2026-08-23) — a forced flip is a
// forced flip.
function justiceDetailOf(evaluation, proof, context) {
  const index = evaluation.selected[0];
  if (!context.justiceEnabled || evaluation.evidence.startedGame || proof.facts.has(index)) return null;
  const certificate = Justice.certifyEntries(positionView(evaluation.position), [index],
    context.proofs.structureOf(evaluation.position)).get(index);
  if (certificate === undefined) return null;
  return {
    type: certificate.type,
    squareCount: certificate.cells.length,
    mineCount: certificate.mineCount,
    clearWays: certificate.clearWays,
    totalWays: certificate.totalWays,
  };
}

// Judges a finished game's decisions in place, each from its saved board.
// `game`: { events (its trace's), justiceEnabled (the record's), guessLedger
// (guessLedgerAppliesTo its play mode) }; `proofs`:
// DuringGame.positionProofs() for this game. Returns `completed`, the parts
// judged on each decision but a no-op, in order (applyCompletedEvaluations
// puts them on the page's copies); the misclick count; the Justice events'
// details; and, where the mode keeps one, the guess ledger.
function completeGameEvaluations(game, proofs) {
  const context = { proofs, justiceEnabled: game.justiceEnabled === true, guessLedger: game.guessLedger };
  const completed = [];
  const guesses = [];
  const justiceDetails = [];
  let misclicks = 0;
  for (const event of game.events) {
    if (event.kind !== 'decision' || event.evaluation.action === 'no-op') continue;
    const evaluation = event.evaluation;
    // A game judged at a later load (completePendingGames) may meet newer
    // code than captured it; the stamps name the code that judged it.
    evaluation.evidence.oddsVersion = Odds.VERSION;
    evaluation.evidence.proofVersion = Justice.PROOF_VERSION;
    const { proof } = proofs.of(evaluation.position);
    if (evaluation.action === 'reveal') {
      const guess = completeReveal(evaluation, proof, context);
      if (guess !== null) guesses.push(guess);
      const justice = justiceDetailOf(evaluation, proof, context);
      if (justice !== null) justiceDetails.push(justice);
    } else if (evaluation.action === 'chord') {
      completeChord(evaluation, proof);
    } else if (evaluation.action === 'flag-place' || evaluation.action === 'flag-remove') {
      completeFlag(evaluation, proof);
    } else {
      throw new Error('evaluation: no judgment for a ' + evaluation.action + ' decision');
    }
    if (evaluation.result === 'death') Object.assign(evaluation.evidence, fatalTiersOfProof(evaluation, proof));
    if (evaluation.mistakes.some((mistake) => MISCLICK_MISTAKES.has(mistake))) misclicks++;
    completed.push({ evidence: evaluation.evidence, mistakes: evaluation.mistakes,
      alternatives: evaluation.alternatives, choices: evaluation.choices });
  }
  return {
    completed,
    misclicks,
    justiceDetails,
    ...(game.guessLedger ? { ledger: {
      guesses: guesses.length,
      guessIdealRisk: guesses.filter((guess) => guess.idealRisk).length,
      guessNonideal: guesses.filter((guess) => !guess.idealRisk).length,
      guessPerfect: guesses.filter((guess) => guess.perfectPlay).length,
      lifeLost: guesses.reduce((sum, guess) => sum + guess.lifeLost, 0),
      lifeNeedless: guesses.reduce((sum, guess) => sum + guess.lifeNeedless, 0),
      oddsVersion: Odds.VERSION,
    } } : {}),
  };
}

// Puts completeGameEvaluations' `completed` parts on the same decisions of
// `events` (the page's copy of the trace).
function applyCompletedEvaluations(events, completed) {
  let judged = 0;
  for (const event of events) {
    if (event.kind !== 'decision' || event.evaluation.action === 'no-op') continue;
    Object.assign(event.evaluation, completed[judged++]);
  }
  if (judged !== completed.length) {
    throw new Error('evaluation: ' + completed.length + ' judged decisions returned for ' + judged);
  }
}

// The record's evaluations: every decision with a death or a mistake, in
// order. A no-op keeps no board: only its trace copy needs one, for replay.
function reportableEvaluations(events) {
  const kept = [];
  for (const event of events) {
    if (event.kind !== 'decision') continue;
    const evaluation = event.evaluation;
    if (evaluation.result !== 'death' && !evaluationHasMistake(evaluation)) continue;
    if (evaluation.action === 'no-op') {
      const { position, ...compact } = evaluation;
      kept.push(compact);
    } else {
      kept.push(evaluation);
    }
  }
  return kept;
}

//-------GAME-END EVALUATION: CAPTURE (what each click did, saved at the click)-------

function visiblePositionSnapshot() {
  let squares = '';
  for (const cell of cells) squares += cell.revealed ? cell.adjacent : cell.flagged ? 'F' : '.';
  return {
    width: config.width,
    height: config.height,
    mines: config.mines,
    cells: squares,
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

// `startedGame`: this reveal moved the game from ready to playing, so
// neither A just universe nor the guess ledger applies to it.
function captureRevealAction(index, startedGame) {
  const evaluation = actionEvaluationBase('reveal', inputActionCount, [index]);
  evaluation.evidence.firstReveal = startedGame && revealedCount === 0;
  evaluation.evidence.startedGame = startedGame;
  return evaluation;
}

function captureChordAction(index, toReveal) {
  return actionEvaluationBase('chord', inputActionCount, toReveal, index);
}

function captureFlagAction(index, removing) {
  return actionEvaluationBase(removing ? 'flag-remove' : 'flag-place', inputActionCount, [index]);
}

function captureNoOpAction(index, reason) {
  const evaluation = actionEvaluationBase(
    'no-op', inputActionCount, index === null ? [] : [index],
    undefined, { position: false });
  evaluation.mistakes.push('no-op-click');
  evaluation.evidence.reason = reason;
  return evaluation;
}

// Every decision goes into the trace; the game's end judges them there.
function recordActionEvaluation(evaluation, result) {
  evaluation.result = result;
  traceDecision(evaluation);
}

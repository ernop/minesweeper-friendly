'use strict';

// Coaching practice modes (pure logic, no DOM): live habit detectors for
// No-waste, Early bail, Scan shield, and Full mix, weak-pattern classification,
// record validation, and longitudinal transfer / state-sample summaries for the
// training page.

const COACH_MODES = [
  {
    id: 'coach-no-waste',
    label: 'Coach: No-waste',
    shortLabel: 'No-waste',
    description: 'Practice mode: cues wasted clicks, 1-cell flags and chords, 1.5-click pairs, and optional flag caps; stored separately from Standard.',
    features: { noWaste: true, earlyBail: false, scanShield: false },
  },
  {
    id: 'coach-early-bail',
    label: 'Coach: Early bail',
    shortLabel: 'Early bail',
    description: 'Practice mode: cues when local work turns hard while an easy move sits elsewhere, flags easy local blind spots, and tracks lookahead; stored separately from Standard.',
    features: { noWaste: false, earlyBail: true, scanShield: false },
  },
  {
    id: 'coach-scan-shield',
    label: 'Coach: Scan shield',
    shortLabel: 'Scan shield',
    description: 'Practice mode: intercepts guesses when a proven-safe square exists elsewhere, warns on wrong flags before you chord, and notes numbered starts; stored separately from Standard.',
    features: { noWaste: false, earlyBail: false, scanShield: true },
  },
  {
    id: 'coach-full',
    label: 'Coach: Full mix',
    shortLabel: 'Full mix',
    description: 'Practice mode: runs No-waste, Early bail, and Scan shield together; stored separately from Standard.',
    features: { noWaste: true, earlyBail: true, scanShield: true },
  },
];

const COACH_MODE_BY_ID = new Map(COACH_MODES.map((mode) => [mode.id, mode]));
const COACH_RECORD_VERSION = 1;
const COACH_FLAG_BUDGET_CHOICES = [null, 50, 35, 20, 0];
const COACH_BAIL_DELAY_CHOICES = [300, 450, 600, 800];
const COACH_DEFAULT_BAIL_DELAY_MS = 450;
const COACH_BLIND_SPOT_DELAY_MS = 550;
const COACH_LOOKAHEAD_FAST_MS = 220;
const COACH_SLOW_PATTERN_MIN_MS = 450;
const COACH_STATE_SAMPLE_MAX_AGE_MS = 45 * 60 * 1000;
const COACH_STATE_SAMPLE_REMIND_AGE_MS = 30 * 60 * 1000;
const COACH_STATE_FOCUS_LEVELS = [1, 2, 3, 4, 5];
const COACH_STATE_PACE_CHOICES = ['calm', 'flowing', 'rushed', 'tilted'];
const COACH_PATTERN_FAMILIES = [
  '1-2-interior',
  '1-2-wall',
  '1-1-interior',
  '1-1-wall',
  'overlap-chain',
];
const COACH_PATTERN_LABELS = {
  '1-2-interior': '1-2 interior',
  '1-2-wall': '1-2 on wall',
  '1-1-interior': '1-1 interior',
  '1-1-wall': '1-1 on wall',
  'overlap-chain': 'overlap chain',
};
const COACH_TRANSFER_MIN_POST_WINS = 10;
const COACH_TRANSFER_BASELINE_WINS = 50;
const COACH_RUN_MIN_MS = 20000;
const COACH_AVOIDABLE_FATAL_KINDS = new Set(['mine-safe', 'mine-forced', 'guess-safe']);

function isCoachPlayMode(id) {
  return typeof id === 'string' && COACH_MODE_BY_ID.has(id);
}

function coachSpecOf(id) {
  const spec = COACH_MODE_BY_ID.get(id);
  if (spec === undefined) throw new Error('unknown coach play mode: ' + id);
  return spec;
}

function coachFeaturesOf(id) {
  return coachSpecOf(id).features;
}

function coachNonNegInt(value) {
  return Number.isInteger(value) && value >= 0;
}

function validCoachRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.version !== COACH_RECORD_VERSION || !isCoachPlayMode(value.mode)) return false;
  if (value.flagBudget !== undefined && value.flagBudget !== null
      && !COACH_FLAG_BUDGET_CHOICES.includes(value.flagBudget)) return false;
  if (value.bailDelayMs !== undefined && !COACH_BAIL_DELAY_CHOICES.includes(value.bailDelayMs)) return false;
  const countFields = [
    'noOpCues', 'lowValueFlagCues', 'oneCellChordCues', 'openingRimOneCellChords',
    'flagBudgetRefusals', 'flagChordPairs', 'flagChord15Clicks',
    'earlyBailOpportunities', 'earlyBailFastJumps', 'earlyBailNudges',
    'blindSpotNudges', 'queuedMoves', 'fastQueuedMoves',
    'shieldSaves', 'shieldMineSaves', 'wrongFlagWarnings',
  ];
  for (const field of countFields) {
    if (!coachNonNegInt(value[field])) return false;
  }
  if (typeof value.numberedStartNoted !== 'boolean') return false;
  if (value.slowPatterns === null || typeof value.slowPatterns !== 'object' || Array.isArray(value.slowPatterns)) {
    return false;
  }
  for (const [family, count] of Object.entries(value.slowPatterns)) {
    if (!COACH_PATTERN_FAMILIES.includes(family) || !coachNonNegInt(count)) return false;
  }
  return true;
}

function emptyCoachCounters(mode, options = {}) {
  const features = coachFeaturesOf(mode);
  return {
    version: COACH_RECORD_VERSION,
    mode,
    ...(features.noWaste ? { flagBudget: options.flagBudget === undefined ? null : options.flagBudget } : {}),
    ...(features.earlyBail ? { bailDelayMs: options.bailDelayMs === undefined ? COACH_DEFAULT_BAIL_DELAY_MS : options.bailDelayMs } : {}),
    noOpCues: 0,
    lowValueFlagCues: 0,
    oneCellChordCues: 0,
    openingRimOneCellChords: 0,
    flagBudgetRefusals: 0,
    flagChordPairs: 0,
    flagChord15Clicks: 0,
    earlyBailOpportunities: 0,
    earlyBailFastJumps: 0,
    earlyBailNudges: 0,
    blindSpotNudges: 0,
    queuedMoves: 0,
    fastQueuedMoves: 0,
    shieldSaves: 0,
    shieldMineSaves: 0,
    wrongFlagWarnings: 0,
    numberedStartNoted: false,
    slowPatterns: Object.fromEntries(COACH_PATTERN_FAMILIES.map((family) => [family, 0])),
  };
}

function coachGuardianAngel(ga) {
  const engine = ga !== undefined ? ga : (typeof GuardianAngel !== 'undefined' ? GuardianAngel : undefined);
  if (engine === undefined) throw new Error('Coach requires GuardianAngel');
  return engine;
}

function coachChebyshev(width, a, b) {
  return Math.max(Math.abs((a % width) - (b % width)),
    Math.abs(Math.floor(a / width) - Math.floor(b / width)));
}

function coachMinDistance(width, cell, anchors) {
  let best = Infinity;
  for (const anchor of anchors) {
    const d = coachChebyshev(width, cell, anchor);
    if (d < best) best = d;
  }
  return best;
}

function coachOnWall(width, height, cell) {
  const x = cell % width;
  const y = Math.floor(cell / width);
  return x === 0 || x === width - 1 || y === 0 || y === height - 1;
}

// Evaluates a newly placed flag on `index` (with `flagged[index] === true`):
// detects provable wrong flags (overflagged adjacent numbers or a locally
// proven-safe cell) and low-value flags (whose adjacent numbers can open at
// most 1 cell by chording).
function evaluateFlagPlacement(view, flagged, index, ga) {
  const engine = coachGuardianAngel(ga);
  const around = engine.neighbors(index, view.width, view.height);
  const overflaggedNumbers = [];
  const adjacentNumbers = [];
  let maxChordOpens = 0;

  for (const n of around) {
    if (!view.revealed[n] || view.adjacent[n] <= 0) continue;
    adjacentNumbers.push(n);
    const nAround = engine.neighbors(n, view.width, view.height);
    let flaggedNeighbors = 0;
    let coveredTotal = 0;
    let unflaggedCovered = 0;
    for (const nb of nAround) {
      if (view.revealed[nb]) continue;
      coveredTotal++;
      if (flagged[nb]) flaggedNeighbors++;
      else unflaggedCovered++;
    }
    if (flaggedNeighbors > view.adjacent[n]) overflaggedNumbers.push(n);
    const safeCapacity = coveredTotal - view.adjacent[n];
    const openable = Math.max(0, Math.min(safeCapacity, unflaggedCovered));
    if (openable > maxChordOpens) maxChordOpens = openable;
  }

  let provenSafeTier = null;
  if (adjacentNumbers.length > 0) {
    const clues = engine.rawClues(view);
    const [counting, overlap] = engine.DEDUCTION_LEVELS;
    const countingFacts = engine.proveFacts(view, clues, counting.proof);
    if (countingFacts.get(index) === 2) {
      provenSafeTier = 'counting';
    } else {
      const overlapFacts = engine.proveFacts(view, clues, overlap.proof);
      if (overlapFacts.get(index) === 2) provenSafeTier = 'overlap';
    }
  }

  const wrongFlag = overflaggedNumbers.length > 0 || provenSafeTier !== null;
  const lowValueFlag = !wrongFlag && adjacentNumbers.length > 0 && maxChordOpens <= 1;
  const lowValueReason = !lowValueFlag ? null
    : maxChordOpens === 0 ? 'no-chord-target' : 'single-cell-chord';
  let revealedCount = 0;
  for (let i = 0; i < view.revealed.length; i++) if (view.revealed[i]) revealedCount++;
  const remSafe = typeof view.mines === 'number'
    ? Math.max(0, view.width * view.height - view.mines - revealedCount)
    : null;
  const endgamePointless = !wrongFlag && lowValueFlag && remSafe !== null && remSafe <= 5;

  return {
    wrongFlag,
    overflaggedNumbers,
    provenSafeTier,
    lowValueFlag,
    lowValueReason,
    maxChordOpens,
    remSafe,
    endgamePointless,
  };
}

function evaluateChordEfficiency(view, triggerIndex, openedTargets, ga) {
  const engine = coachGuardianAngel(ga);
  const oneCellChord = openedTargets.length === 1;
  const onOpeningRim = oneCellChord && engine.neighbors(triggerIndex, view.width, view.height)
    .some((n) => view.revealed[n] && view.adjacent[n] === 0);
  return { oneCellChord, onOpeningRim };
}

// Fast local board state snapshot for Early bail, easy-local blind-spot cues,
// and queued lookahead tracking. Runs only counting + overlap proof tiers.
function analyzeBoardState(view, flagged, anchorCells, ga) {
  const engine = coachGuardianAngel(ga);
  const clues = engine.rawClues(view);
  const [counting, overlap] = engine.DEDUCTION_LEVELS;
  const countingFacts = engine.proveFacts(view, clues, counting.proof);
  const overlapFacts = engine.proveFacts(view, clues, overlap.proof);

  const countingSafe = [];
  const countingMines = [];
  const overlapOnlySafe = [];
  const overlapOnlyMines = [];
  for (const [cell, fact] of countingFacts) {
    if (view.revealed[cell]) continue;
    if (fact === 2) countingSafe.push(cell);
    else if (fact === 1) countingMines.push(cell);
  }
  for (const [cell, fact] of overlapFacts) {
    if (view.revealed[cell] || countingFacts.has(cell)) continue;
    if (fact === 2) overlapOnlySafe.push(cell);
    else if (fact === 1) overlapOnlyMines.push(cell);
  }

  // Ready chords: revealed numbers with exact flag count, unflagged covered
  // neighbors, and no flag contradicting counting proof. Also track ready
  // exhaustive 4/5/6/7 numbers whose remaining covered neighbors are all mines.
  const readyChords = [];
  const readyHighNumbers = [];
  const size = view.width * view.height;
  for (let i = 0; i < size; i++) {
    if (!view.revealed[i] || view.adjacent[i] <= 0) continue;
    const around = engine.neighbors(i, view.width, view.height);
    let flaggedCount = 0;
    let unflaggedCovered = 0;
    let badFlag = false;
    for (const n of around) {
      if (view.revealed[n]) continue;
      if (flagged[n]) {
        flaggedCount++;
        if (countingFacts.get(n) === 2) badFlag = true;
      } else {
        unflaggedCovered++;
      }
    }
    if (!badFlag && flaggedCount === view.adjacent[i] && unflaggedCovered > 0) {
      readyChords.push(i);
    } else if (!badFlag && view.adjacent[i] >= 4 && unflaggedCovered > 0
      && flaggedCount + unflaggedCovered === view.adjacent[i]) {
      readyHighNumbers.push(i);
    }
  }

  const anchors = anchorCells.length > 0 ? anchorCells : [];
  const localEasySafe = [];
  const localReadyChords = [];
  const remoteCandidates = [];
  const remoteSeen = new Set();

  for (const cell of countingSafe) {
    const dist = anchors.length === 0 ? 0 : coachMinDistance(view.width, cell, anchors);
    if (dist <= 2) localEasySafe.push({ cell, dist });
    else {
      remoteSeen.add(cell);
      remoteCandidates.push({ cell, kind: 'safe', dist });
    }
  }
  for (const cell of readyChords) {
    const dist = anchors.length === 0 ? 0 : coachMinDistance(view.width, cell, anchors);
    if (dist <= 2) localReadyChords.push({ cell, dist });
    else if (!remoteSeen.has(cell)) {
      remoteSeen.add(cell);
      remoteCandidates.push({ cell, kind: 'chord', dist });
    }
  }

  localEasySafe.sort((a, b) => a.dist - b.dist || a.cell - b.cell);
  localReadyChords.sort((a, b) => a.dist - b.dist || a.cell - b.cell);
  remoteCandidates.sort((a, b) => a.dist - b.dist || a.cell - b.cell);

  const localOverlapCells = [];
  for (const cell of overlapOnlySafe) {
    if (anchors.length > 0 && coachMinDistance(view.width, cell, anchors) <= 2) localOverlapCells.push(cell);
  }
  for (const cell of overlapOnlyMines) {
    if (anchors.length > 0 && coachMinDistance(view.width, cell, anchors) <= 2) localOverlapCells.push(cell);
  }

  const hasLocalEasy = localEasySafe.length > 0 || localReadyChords.length > 0;
  const localHintCells = (localEasySafe.length > 0 ? localEasySafe : localReadyChords)
    .slice(0, 2)
    .map((entry) => entry.cell);

  let remoteClusterCells = [];
  let nearestRemoteDistance = null;
  if (remoteCandidates.length > 0) {
    const primary = remoteCandidates[0];
    nearestRemoteDistance = primary.dist;
    remoteClusterCells = remoteCandidates
      .filter((entry) => coachChebyshev(view.width, entry.cell, primary.cell) <= 2)
      .slice(0, 3)
      .map((entry) => entry.cell);
  }

  let regime = 'none';
  if (hasLocalEasy) regime = 'easy-local';
  else if (remoteCandidates.length > 0) regime = 'state-b';
  else if (overlapOnlySafe.length > 0) regime = 'hard-only';

  return {
    regime,
    localHard: localOverlapCells.length > 0,
    countingFacts,
    overlapFacts,
    countingSafe,
    countingMines,
    overlapOnlySafe,
    overlapOnlyMines,
    readyChords,
    readyHighNumbers,
    localHintCells,
    remoteClusterCells,
    nearestRemoteDistance,
  };
}

// Classifies an overlap-tier move into a concrete pattern family so recurring
// hesitation patterns can be tracked over time.
function classifyPatternAt(view, targetCell, countingFacts, overlapFacts, ga) {
  const engine = coachGuardianAngel(ga);
  if (!overlapFacts.has(targetCell) || countingFacts.has(targetCell)) return null;

  const size = view.width * view.height;
  const reducedClues = [];
  for (let i = 0; i < size; i++) {
    if (!view.revealed[i] || view.adjacent[i] <= 0) continue;
    let count = view.adjacent[i];
    const covered = [];
    for (const n of engine.neighbors(i, view.width, view.height)) {
      if (view.revealed[n]) continue;
      const fact = countingFacts.get(n);
      if (fact === 1) count--;
      else if (fact !== 2) covered.push(n);
    }
    if (covered.length > 0) reducedClues.push({ origin: i, count, covered, set: new Set(covered) });
  }

  const touching = reducedClues.filter((clue) => clue.set.has(targetCell));
  for (const a of touching) {
    for (const b of reducedClues) {
      if (a === b) continue;
      let shared = 0;
      for (const c of a.covered) if (b.set.has(c)) shared++;
      if (shared === 0) continue;
      const onlyA = a.covered.filter((c) => !b.set.has(c));
      const onlyB = b.covered.filter((c) => !a.set.has(c));
      const onWall = coachOnWall(view.width, view.height, targetCell)
        || coachOnWall(view.width, view.height, a.origin)
        || coachOnWall(view.width, view.height, b.origin);

      // Subset / 1-1 reduction: one clue's remaining squares are inside the other
      // with equal remaining mine count, proving the excess squares safe.
      if (onlyB.length === 0 && a.count === b.count && onlyA.includes(targetCell)) {
        return onWall ? '1-1-wall' : '1-1-interior';
      }
      if (onlyA.length === 0 && a.count === b.count && onlyB.includes(targetCell)) {
        return onWall ? '1-1-wall' : '1-1-interior';
      }

      // Difference / 1-2 reduction: difference in remaining mines equals one
      // side's unique squares, proving all those mines and the other side safe.
      if (a.count - b.count === onlyA.length && onlyA.length > 0
          && (onlyA.includes(targetCell) || onlyB.includes(targetCell))) {
        return onWall ? '1-2-wall' : '1-2-interior';
      }
      if (b.count - a.count === onlyB.length && onlyB.length > 0
          && (onlyB.includes(targetCell) || onlyA.includes(targetCell))) {
        return onWall ? '1-2-wall' : '1-2-interior';
      }
    }
  }
  return 'overlap-chain';
}

// Scan shield: intercepts a non-first reveal on an unproven square whenever a
// proven-safe move exists elsewhere, or on a proven mine even when no safe
// square exists. Genuine forced guesses (no proven-safe cell anywhere and
// target not a proven mine) are allowed through.
function checkScanShield(view, clickedIndex, ga) {
  const engine = coachGuardianAngel(ga);
  if (view.revealed[clickedIndex]) return { block: false };

  const clues = engine.rawClues(view);
  const [counting, overlap] = engine.DEDUCTION_LEVELS;
  const countingFacts = engine.proveFacts(view, clues, counting.proof);
  if (countingFacts.get(clickedIndex) === 2) return { block: false };

  const overlapFacts = engine.proveFacts(view, clues, overlap.proof);
  if (overlapFacts.get(clickedIndex) === 2) return { block: false };

  const structure = engine.buildStructure(view);
  if (structure.facts.get(clickedIndex) === 2) return { block: false };

  const clickedWasMine = structure.facts.get(clickedIndex) === 1;
  const sortNearest = (cells) => cells.sort((a, b) =>
    coachChebyshev(view.width, a, clickedIndex) - coachChebyshev(view.width, b, clickedIndex) || a - b);

  const countingSafe = [];
  for (const [cell, fact] of countingFacts) {
    if (!view.revealed[cell] && fact === 2) countingSafe.push(cell);
  }
  if (countingSafe.length > 0) {
    sortNearest(countingSafe);
    return {
      block: true,
      reason: 'missed-safe',
      tier: 'counting',
      safeCells: countingSafe.slice(0, 4),
      totalSafe: countingSafe.length,
      clickedWasMine,
    };
  }

  const overlapSafe = [];
  for (const [cell, fact] of overlapFacts) {
    if (!view.revealed[cell] && fact === 2) overlapSafe.push(cell);
  }
  if (overlapSafe.length > 0) {
    sortNearest(overlapSafe);
    return {
      block: true,
      reason: 'missed-safe',
      tier: 'overlap',
      safeCells: overlapSafe.slice(0, 4),
      totalSafe: overlapSafe.length,
      clickedWasMine,
    };
  }

  const wholeBoardSafe = [];
  for (const [cell, fact] of structure.facts) {
    if (!view.revealed[cell] && fact === 2) wholeBoardSafe.push(cell);
  }
  if (wholeBoardSafe.length > 0) {
    sortNearest(wholeBoardSafe);
    return {
      block: true,
      reason: 'missed-safe',
      tier: 'whole-board',
      safeCells: wholeBoardSafe.slice(0, 4),
      totalSafe: wholeBoardSafe.length,
      clickedWasMine,
    };
  }

  if (clickedWasMine) {
    const mineTier = countingFacts.get(clickedIndex) === 1 ? 'counting'
      : overlapFacts.get(clickedIndex) === 1 ? 'overlap' : 'whole-board';
    return {
      block: true,
      reason: 'proven-mine',
      tier: mineTier,
      safeCells: [],
      totalSafe: 0,
      clickedWasMine: true,
    };
  }

  return { block: false };
}

//-------TRAINING ANALYTICS (practice progress, Standard transfer, state samples)-------

function coachMedian(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function coachMean(values) {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function coachLocalDayStart(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function coachStandardMetrics(records, fatalKindOf, bvPerSecondFn, ioeOfFn) {
  const wins = records.filter((r) => r.outcome === 'win');
  const ioeWins = wins.filter((r) => typeof r.noOpClicks === 'number');
  const flagWins = wins.filter((r) => typeof r.flagsPlaced === 'number' && r.bv3 > 0);
  const flagChordGaps = wins.filter((r) => typeof r.flagChordGapMs === 'number').map((r) => r.flagChordGapMs);
  const moveGaps = wins.filter((r) => typeof r.moveGapMedianMs === 'number').map((r) => r.moveGapMedianMs);
  const leftHard = wins.filter((r) => typeof r.movesLeftHardWork === 'number').map((r) => r.movesLeftHardWork);
  const runs = records.filter((r) => r.timeMs >= COACH_RUN_MIN_MS);
  let runWins = 0;
  let classifiedLosses = 0;
  let avoidableLosses = 0;
  for (const r of runs) {
    if (r.outcome === 'win') {
      runWins++;
      continue;
    }
    const kind = fatalKindOf(r);
    if (kind === undefined) continue;
    classifiedLosses++;
    if (COACH_AVOIDABLE_FATAL_KINDS.has(kind)) avoidableLosses++;
  }
  return {
    games: records.length,
    wins: wins.length,
    median3bvPerS: coachMedian(wins.map((r) => bvPerSecondFn(r))),
    medianWinS: coachMedian(wins.map((r) => r.timeMs / 1000)),
    medianIoe: coachMedian(ioeWins.map((r) => ioeOfFn(r))),
    medianNoopsPerWin: coachMedian(ioeWins.map((r) => r.noOpClicks)),
    medianFlagsPer3bv: coachMedian(flagWins.map((r) => r.flagsPlaced / r.bv3)),
    medianFlagChordGapMs: coachMedian(flagChordGaps),
    medianMoveGapMs: coachMedian(moveGaps),
    meanLeftHardWorkPerWin: coachMean(leftHard),
    runs: runs.length,
    runConversion: runs.length === 0 ? null : runWins / runs.length,
    classifiedLosses,
    avoidableShare: classifiedLosses === 0 ? null : avoidableLosses / classifiedLosses,
  };
}

function summarizePracticeSlice(records) {
  const wins = records.filter((r) => r.outcome === 'win');
  const withCoach = records.filter((r) => r.coach !== undefined);
  const sum = (field) => withCoach.reduce((acc, r) => acc + r.coach[field], 0);
  const flagChordPairs = sum('flagChordPairs');
  const flagChord15 = sum('flagChord15Clicks');
  const bailOpps = sum('earlyBailOpportunities');
  const bailFast = sum('earlyBailFastJumps');
  const queued = sum('queuedMoves');
  const fastQueued = sum('fastQueuedMoves');
  return {
    games: records.length,
    wins: wins.length,
    noopsPerGame: coachMean(records.filter((r) => typeof r.noOpClicks === 'number').map((r) => r.noOpClicks)),
    lowValueFlagsPerGame: withCoach.length === 0 ? null : sum('lowValueFlagCues') / withCoach.length,
    oneCellChordsPerGame: withCoach.length === 0 ? null : sum('oneCellChordCues') / withCoach.length,
    click15Share: flagChordPairs === 0 ? null : flagChord15 / flagChordPairs,
    flagChordPairs,
    fastBailShare: bailOpps === 0 ? null : bailFast / bailOpps,
    earlyBailOpportunities: bailOpps,
    blindSpotsPerGame: withCoach.length === 0 ? null : sum('blindSpotNudges') / withCoach.length,
    lookaheadFastShare: queued === 0 ? null : fastQueued / queued,
    queuedMoves: queued,
    shieldSavesPerGame: withCoach.length === 0 ? null : sum('shieldSaves') / withCoach.length,
    wrongFlagWarningsPerGame: withCoach.length === 0 ? null : sum('wrongFlagWarnings') / withCoach.length,
  };
}

function summarizeCoachPractice(coachRecords) {
  const sorted = [...coachRecords].sort((a, b) => a.endedAt - b.endedAt);
  const byMode = [];
  for (const spec of COACH_MODES) {
    const group = sorted.filter((r) => r.playMode === spec.id);
    if (group.length === 0) continue;
    const mid = Math.floor(group.length / 2);
    byMode.push({
      mode: spec.id,
      label: spec.label,
      shortLabel: spec.shortLabel,
      features: spec.features,
      games: group.length,
      wins: group.filter((r) => r.outcome === 'win').length,
      activeMinutes: group.reduce((acc, r) => acc + r.timeMs, 0) / 60000,
      firstPlayedAt: group[0].endedAt,
      lastPlayedAt: group[group.length - 1].endedAt,
      overall: summarizePracticeSlice(group),
      earlier: mid >= 2 ? summarizePracticeSlice(group.slice(0, mid)) : null,
      latest: mid >= 2 ? summarizePracticeSlice(group.slice(mid)) : null,
    });
  }

  const patternTotals = Object.fromEntries(COACH_PATTERN_FAMILIES.map((family) => [family, 0]));
  let slowPatternTotal = 0;
  for (const r of sorted) {
    if (r.coach === undefined || r.coach.slowPatterns === undefined) continue;
    for (const family of COACH_PATTERN_FAMILIES) {
      const count = r.coach.slowPatterns[family] || 0;
      patternTotals[family] += count;
      slowPatternTotal += count;
    }
  }
  const slowPatterns = COACH_PATTERN_FAMILIES
    .map((family) => ({ family, label: COACH_PATTERN_LABELS[family], count: patternTotals[family] }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    totalGames: sorted.length,
    totalWins: sorted.filter((r) => r.outcome === 'win').length,
    totalMinutes: sorted.reduce((acc, r) => acc + r.timeMs, 0) / 60000,
    firstPlayedAt: sorted.length === 0 ? null : sorted[0].endedAt,
    lastPlayedAt: sorted.length === 0 ? null : sorted[sorted.length - 1].endedAt,
    byMode,
    slowPatternTotal,
    slowPatterns,
  };
}

// Diagnoses the current top Standard Expert bottleneck so the training page
// recommends which Coach mode to run next.
function diagnoseCoachRecommendation(recentStats) {
  if (recentStats.wins === 0 && recentStats.runs === 0) {
    return {
      mode: 'coach-no-waste',
      label: 'Coach: No-waste',
      reason: 'Start with input economy so clean clicks become automatic before adding speed.',
    };
  }
  if ((recentStats.medianNoopsPerWin !== null && recentStats.medianNoopsPerWin > 10)
      || (recentStats.medianIoe !== null && recentStats.medianIoe < 0.78)) {
    return {
      mode: 'coach-no-waste',
      label: 'Coach: No-waste',
      reason: 'No-op clicks and low-value flags are the largest removable time leak right now.',
    };
  }
  if (recentStats.avoidableShare !== null && recentStats.avoidableShare > 0.5) {
    return {
      mode: 'coach-scan-shield',
      label: 'Coach: Scan shield',
      reason: 'More than half of late losses happen while a safe move or wrong-flag warning is visible.',
    };
  }
  return {
    mode: 'coach-early-bail',
    label: 'Coach: Early bail',
    reason: 'Input economy and survival are solid; leaving slow local patterns earlier and chaining queued moves is the next speed lever.',
  };
}

function summarizeCoachTransfer(standardRecords, coachRecords, deps) {
  const sortedStd = [...standardRecords].sort((a, b) => a.endedAt - b.endedAt);
  const sortedCoach = [...coachRecords].sort((a, b) => a.endedAt - b.endedAt);
  const bvFn = deps.bvPerSecond;
  const ioeFn = deps.ioeOf;
  const recentWindow = sortedStd.slice(-100);
  const recentStats = coachStandardMetrics(recentWindow, deps.fatalKindOf, bvFn, ioeFn);
  const recommendation = diagnoseCoachRecommendation(recentStats);

  if (sortedCoach.length === 0) {
    return {
      status: 'no-practice',
      firstCoachAt: null,
      minPostWins: COACH_TRANSFER_MIN_POST_WINS,
      baseline: null,
      post: null,
      coachDays: null,
      nonCoachDays: null,
      recommendation,
    };
  }

  const firstCoachAt = sortedCoach[0].endedAt;
  const preAll = sortedStd.filter((r) => r.endedAt < firstCoachAt);
  // Anchor baseline to the latest N wins before first Coach game (and all
  // losses from that earliest baseline win onward, so conversion matches).
  const preWins = preAll.filter((r) => r.outcome === 'win');
  const baselineStartAt = preWins.length > COACH_TRANSFER_BASELINE_WINS
    ? preWins[preWins.length - COACH_TRANSFER_BASELINE_WINS].endedAt
    : (preAll.length > 0 ? preAll[0].endedAt : 0);
  const baselineRecords = preAll.filter((r) => r.endedAt >= baselineStartAt);
  const postRecords = sortedStd.filter((r) => r.endedAt >= firstCoachAt);

  const coachDaySet = new Set(sortedCoach.map((r) => coachLocalDayStart(r.endedAt)));
  const recentCutoff = firstCoachAt - 30 * 86400000;
  const recentStd = sortedStd.filter((r) => r.endedAt >= recentCutoff);
  const coachDayStd = recentStd.filter((r) => coachDaySet.has(coachLocalDayStart(r.endedAt)));
  const nonCoachDayStd = recentStd.filter((r) => !coachDaySet.has(coachLocalDayStart(r.endedAt)));

  const baseline = coachStandardMetrics(baselineRecords, deps.fatalKindOf, bvFn, ioeFn);
  const post = coachStandardMetrics(postRecords, deps.fatalKindOf, bvFn, ioeFn);
  const status = post.wins < COACH_TRANSFER_MIN_POST_WINS ? 'collecting' : 'compared';

  return {
    status,
    firstCoachAt,
    minPostWins: COACH_TRANSFER_MIN_POST_WINS,
    baseline,
    post,
    coachDays: coachStandardMetrics(coachDayStd, deps.fatalKindOf, bvFn, ioeFn),
    nonCoachDays: coachStandardMetrics(nonCoachDayStd, deps.fatalKindOf, bvFn, ioeFn),
    recommendation,
  };
}

function summarizeStateSamples(standardRecords, deps) {
  const sampled = standardRecords.filter((r) => r.stateSample !== undefined);
  const bvFn = deps.bvPerSecond;
  const ioeFn = deps.ioeOf;
  const byFocus = COACH_STATE_FOCUS_LEVELS.map((level) => {
    const group = sampled.filter((r) => r.stateSample.focus === level);
    return {
      value: level,
      label: 'focus ' + level + '/5',
      ...coachStandardMetrics(group, deps.fatalKindOf, bvFn, ioeFn),
    };
  }).filter((row) => row.games > 0);
  const byPace = COACH_STATE_PACE_CHOICES.map((pace) => {
    const group = sampled.filter((r) => r.stateSample.pace === pace);
    return {
      value: pace,
      label: pace,
      ...coachStandardMetrics(group, deps.fatalKindOf, bvFn, ioeFn),
    };
  }).filter((row) => row.games > 0);
  return { totalSampledGames: sampled.length, byFocus, byPace };
}

const Coach = {
  MODES: COACH_MODES,
  RECORD_VERSION: COACH_RECORD_VERSION,
  FLAG_BUDGET_CHOICES: COACH_FLAG_BUDGET_CHOICES,
  BAIL_DELAY_CHOICES: COACH_BAIL_DELAY_CHOICES,
  DEFAULT_BAIL_DELAY_MS: COACH_DEFAULT_BAIL_DELAY_MS,
  BLIND_SPOT_DELAY_MS: COACH_BLIND_SPOT_DELAY_MS,
  LOOKAHEAD_FAST_MS: COACH_LOOKAHEAD_FAST_MS,
  SLOW_PATTERN_MIN_MS: COACH_SLOW_PATTERN_MIN_MS,
  STATE_SAMPLE_MAX_AGE_MS: COACH_STATE_SAMPLE_MAX_AGE_MS,
  STATE_SAMPLE_REMIND_AGE_MS: COACH_STATE_SAMPLE_REMIND_AGE_MS,
  STATE_FOCUS_LEVELS: COACH_STATE_FOCUS_LEVELS,
  STATE_PACE_CHOICES: COACH_STATE_PACE_CHOICES,
  PATTERN_FAMILIES: COACH_PATTERN_FAMILIES,
  PATTERN_LABELS: COACH_PATTERN_LABELS,
  TRANSFER_MIN_POST_WINS: COACH_TRANSFER_MIN_POST_WINS,
  isPlayMode: isCoachPlayMode,
  specOf: coachSpecOf,
  featuresOf: coachFeaturesOf,
  validCoachRecord,
  emptyCounters: emptyCoachCounters,
  evaluateFlagPlacement,
  evaluateChordEfficiency,
  analyzeBoardState,
  classifyPatternAt,
  checkScanShield,
  summarizePractice: summarizeCoachPractice,
  summarizeTransfer: summarizeCoachTransfer,
  summarizeStateSamples,
  diagnoseRecommendation: diagnoseCoachRecommendation,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Coach;

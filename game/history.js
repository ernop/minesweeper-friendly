'use strict';

// Play history: the game record schema, per-mode history in RAM, mode keys,
// legacy normalization, and transfer cleaning for imports.

//-------PLAY HISTORY (every finished game kept per mode)-------

// The game-record schema: one record per finished game, win or loss,
// holding only the primary measurements; every other displayed stat is
// derived from them at read time, never stored. This is the single
// definition of the record shape — reportResult writes the non-legacy
// fields, importHistory also accepts the explicitly marked legacy boundary
// fields, and the data-format card renders only the current examples and
// descriptions. wastedClicks and
// flagsPlaced joined the schema on 2026-08-19, flagsRemoved on 2026-08-20,
// and win-only unusedCorrectFlags on 2026-08-28: the first two are always
// written now and the last is written on wins; games recorded before they were measured
// lack them, so absence is valid ("not measured"); displays that need them
// use only records that carry them.
// JSON turns NaN and infinities into null. Accepting them here would let an
// export produced by this page fail its own importer after serialization.
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
function validActionEvaluations(value) {
  return value === undefined || (Array.isArray(value) && value.every((evaluation) => {
    if (evaluation === null || typeof evaluation !== 'object'
        || typeof evaluation.version !== 'string') return false;
    // Unknown future versions are preserved verbatim. This build cannot
    // interpret them, but import must not destroy data merely because a
    // newer build added or reorganized evidence.
    if (evaluation.version !== ACTION_EVALUATION_VERSION) return true;
    if (typeof evaluation.action !== 'string'
        || (evaluation.result !== 'continued' && evaluation.result !== 'death')
        || !Array.isArray(evaluation.mistakes)
        || !evaluation.mistakes.every((mistake) => typeof mistake === 'string')) {
      return false;
    }
    if (evaluation.position === undefined) return true;
    const position = evaluation.position;
    return position !== null
      && typeof position === 'object'
      && Number.isInteger(position.width) && position.width > 0
      && Number.isInteger(position.height) && position.height > 0
      && position.width * position.height <= 100000
      && Array.isArray(position.revealed)
      && Array.isArray(position.flagged);
  }));
}
const GAME_RECORD_SCHEMA = [
  { field: 'endedAt', valid: isNumber, example: '1787201223496', describe: 'when the game finished (Unix epoch, ms)' },
  { field: 'outcome', valid: (v) => v === 'win' || v === 'loss', example: '"win"', describe: '"win" or "loss"' },
  { field: 'timeMs', valid: isNumber, example: '6705', describe: 'solve time in ms (shown as 6.705s)' },
  { field: 'bv3', valid: isNumber, example: '10', describe: "the board's 3BV: minimum clicks to clear it (in Endgame drill, the presented remnant's remaining 3BV — the minimum clicks to finish what was actually left)" },
  { field: 'zini', valid: (v) => v === undefined || isNumber(v), example: '8', describe: "the board's greedy ZiNi: the reference greedy flags-and-chords algorithm's click count, the flaggers' counterpart to 3BV (never above it); absent on games recorded before 2026-08-30 and on Endgame drill games (a full-board measure misdescribes a partial solve)" },
  { field: 'hzini', valid: (v) => v === undefined || isNumber(v), example: '9', describe: "the board's human ZiNi: the same greedy algorithm restricted to already-open cells after opening every opening first; absent on games recorded before 2026-08-30 and on Endgame drill games" },
  { field: 'boardMetrics', valid: (v) => v === undefined || BoardMetrics.valid(v), example: '{"version":1,"workSpread":3.12,"safeCells":71,"zeroOpenedZeroOneCells":51,"zeroOpenedCells":57}', describe: 'final-board 3BV spread in cells and exact safe-cell counts for visible 0–1 share after opening all zeros and zero-opening coverage; absent measurements can be backfilled from saved final-board traces' },
  { field: 'clicks', valid: isNumber, example: '19', describe: 'clicks that changed the board (reveals, flags, chords)' },
  { field: 'chordClicks', valid: (v) => v === undefined || isNumber(v), example: '4', describe: 'accepted chords among the board-changing clicks (the chord-share numerator); absent on games recorded before 2026-08-30' },
  { field: 'wastedClicks', valid: (v) => v === undefined || isNumber(v), example: '3', describe: 'board clicks that changed nothing; absent on games recorded before 2026-08-19' },
  { field: 'misclicks', valid: (v) => v === undefined || isNumber(v), example: '1', describe: 'board-changing actions contradicted by facts provable from the visible board at click time: opening a proven mine, flagging a proven safe, removing a proven-mine flag, or chording through a visible contradiction; independent of whether the action caused death; absent on games recorded before 2026-08-23' },
  { field: 'flagsPlaced', valid: (v) => v === undefined || isNumber(v), example: '0', describe: 'flags the player placed (win auto-flagging not counted); 0 = a markless game; absent on games recorded before 2026-08-19' },
  { field: 'flagsRemoved', valid: (v) => v === undefined || isNumber(v), example: '1', describe: 'flag states the player turned off; placement and removal are each board-changing clicks; the reason for removal is not observed; absent on games recorded before 2026-08-20' },
  { field: 'unusedCorrectFlags', valid: (v) => v === undefined || isNumber(v), example: '2', describe: 'on a win, correct mine-flag placement episodes that ended or were removed without ever contributing to an accepted chord; absent on losses and games recorded before 2026-08-28 because an unfinished solve cannot establish whether a standing mark would later have been used' },
  { field: 'mousePathPx', valid: isNumber, example: '1182', describe: 'cursor travel while playing, px' },
  { field: 'fastclickGapMs', valid: (v) => v === undefined || isNumber(v), example: '218', describe: 'median gap between consecutive board-changing presses made on the move (cursor moving within 100ms before) with gaps under 1s; absent when no gap qualified or on games recorded before 2026-08-22' },
  { field: 'cadenceSpread', valid: (v) => v === undefined || isNumber(v), example: '1.42', describe: 'press-to-press rhythm consistency: interquartile range of all button-press gaps (wasted presses included) divided by their median — 0 means metronomic, larger means burstier; measured for wins and losses; absent under two measurable gaps or on games recorded before 2026-08-30' },
  { field: 'states', valid: (v) => v === undefined || (Array.isArray(v) && v.every((s) => typeof s === 'string')), example: '["sleepy"]', describe: 'player-defined state tags active when the game finished (see the states panel); absent on games recorded before 2026-08-20' },
  { field: 'musicPlaying', valid: (v) => v === undefined || typeof v === 'boolean', example: 'true', describe: 'whether this machine heard audio playing during the game (sampled about once a minute from the local base system); absent when that endpoint never answered or on games recorded before 2026-08-22' },
  { field: 'justice', valid: (v) => v === undefined || isNumber(v), example: '1', describe: 'bare entries into certified sealed pockets that Justice guaranteed safe; absent on games recorded before 2026-08-20' },
  { field: 'justiceEnabled', valid: (v) => v === undefined || typeof v === 'boolean', example: 'true', describe: 'whether "a just universe" was frozen on for this game at its first reveal; absent on earlier games' },
  { field: 'seed', valid: (v) => v === undefined || (typeof v === 'string' && /^[0-9a-f]{32}$/.test(v)), example: '"2f4c5a107ad399e681137b2dc51490aa"', describe: '128-bit seed for initial placement and Justice redraws; absent on earlier games' },
  { field: 'rngVersion', valid: (v) => v === undefined || v === RNG_VERSION, example: '"' + RNG_VERSION + '"', describe: 'algorithm that turns seed into the game random stream; absent on earlier games' },
  { field: 'boardVersion', valid: (v) => v === undefined || BOARD_VERSIONS.has(v), example: '"' + BOARD_VERSION + '"', describe: 'board placement algorithm used with the seed (one version string per board generator); absent on earlier games' },
  { field: 'generator', valid: (v) => v === undefined || BoardGenerators.validStoredGenerator(v), example: '{"id":"pink-noise","params":{"alpha":1,"scale":8,"contrast":2}}', describe: 'non-default board generator this board was placed with (id plus its complete parameter set, the same facts the top score key\u2019s +generator suffix carries); absent = the default uniform generator' },
  { field: 'justiceVersion', valid: (v) => v === undefined || JUSTICE_VERSIONS.has(v), example: '"' + JUSTICE_VERSION + '"', describe: 'sealed-pocket certification and redraw contract; v2 uses the all-consistent-layout proof prepass; absent on earlier games' },
  { field: 'maxAdjacent', valid: (v) => v === undefined || isNumber(v), example: '4', describe: 'highest adjacent-mine number on the finished board; absent on games recorded before 2026-08-21' },
  { field: 'hasSeven', valid: (v) => v === undefined || typeof v === 'boolean', example: 'true', describe: 'whether the finished board contains at least one 7; absent on earlier games' },
  { field: 'zeroCount', valid: (v) => v === undefined || isNumber(v), example: '41', describe: 'how many finished-board cells have adjacent-mine count 0; absent on earlier games' },
  { field: 'islandCount', valid: (v) => v === undefined || isNumber(v), example: '6', describe: '8-connected mine components on the finished board (diagonals count, edges empty); absent on earlier games' },
  { field: 'largestIsland', valid: (v) => v === undefined || isNumber(v), example: '5', describe: 'mine count in the largest 8-connected mine component; 0 if no mines; absent on earlier games' },
  { field: 'playMode', valid: (v) => v === undefined || PLAY_MODE_IDS.has(v), example: '"standard"', describe: 'play mode this game was under; absent on games recorded before 2026-08-21' },
  { field: 'actionEvaluations', valid: validActionEvaluations, example: '[{"version":"action-evaluation-v1","action":"reveal","result":"continued","mistakes":["guessed-with-safe-move"],"evidence":{"proofVersion":"all-consistent-layouts-v1"}}]', describe: 'versioned evidence for the fatal action and every earlier measured reportable action, generated independently of the player’s report display scope: proof-engine version/completeness, exclusive report category derived from action/outcome, independent mistake tags, raw and protection-aware chosen/best risks, modeled-life values, highlighted alternatives, and (except compact no-op entries) the visible position before the action; [] means no recorded reportable action and no death; older records are normalized into this field on load/import' },
  { field: 'identityIndex', valid: (v) => v === undefined || isNumber(v), example: '3', describe: 'trial board identity (0-based in that session); absent outside trial' },
  { field: 'transform', valid: (v) => v === undefined || typeof v === 'string', example: '"rot90"', describe: 'isometry applied to the trial identity for this presentation' },
  { field: 'trialStartedAt', valid: (v) => v === undefined || isNumber(v), example: '1787201223496', describe: 'when the enclosing trial session began' },
  { field: 'givenOpening', valid: (v) => v === undefined || typeof v === 'boolean', example: 'false', describe: 'whether this trial presentation started with a predetermined cell already opened; absent on earlier trial games (those were given an opening)' },
  { field: 'guesses', valid: (v) => v === undefined || isNumber(v), example: '2', describe: 'bare clicks into cells with p(mine) > 0; a zero-risk cell is not a guess even if local deduction had not marked it; absent when odds could not be measured, in modes without a real mine gamble (angelic, proof-or-die), or on games recorded before 2026-08-21' },
  { field: 'guessIdealRisk', valid: (v) => v === undefined || isNumber(v), example: '1', describe: 'guesses that chose a lowest-available death risk; absent with guesses' },
  { field: 'guessNonideal', valid: (v) => v === undefined || isNumber(v), example: '1', describe: 'guesses that chose a cell riskier than the safest available; absent with guesses' },
  { field: 'guessPerfect', valid: (v) => v === undefined || isNumber(v), example: '1', describe: 'guesses that maximized one-ply expected remaining life (survival times leftover min-risk after the number you would see); absent with guesses' },
  { field: 'lifeLost', valid: (v) => v === undefined || isNumber(v), example: '0.75', describe: 'sum of mine probabilities of guessed cells (absolute multiverse lives spent); absent with guesses' },
  { field: 'lifeNeedless', valid: (v) => v === undefined || isNumber(v), example: '0.25', describe: 'sum of (chosen risk minus safest available risk); an ideal-risk guess costs 0 even at 19% death; absent with guesses' },
  { field: 'oddsVersion', valid: (v) => v === undefined || v === Odds.VERSION, example: '"' + Odds.VERSION + '"', describe: 'remaining-layout odds and guess-scoring contract; absent on earlier games' },
  { field: 'stupidDeath', legacy: true, valid: (v) => v === undefined || typeof v === 'boolean', example: 'true', describe: 'legacy import-only avoidable-death boolean; normalized into actionEvaluations and removed immediately' },
  { field: 'deathKind', legacy: true, valid: (v) => v === undefined || v in DEATH_KIND_LABELS, example: '"angel"', describe: 'legacy import-only five-way death verdict; normalized into actionEvaluations and removed immediately' },
  { field: 'deathRisk', legacy: true, valid: (v) => v === undefined || isNumber(v), example: '0.25', describe: 'legacy import-only selected risk; normalized into actionEvaluations and removed immediately' },
  { field: 'deathBestRisk', legacy: true, valid: (v) => v === undefined || isNumber(v), example: '0.143', describe: 'legacy import-only best available risk; normalized into actionEvaluations and removed immediately' },
  { field: 'justiceSaves', valid: (v) => v === undefined || isNumber(v), example: '0', describe: 'historical field written only during part of 2026-08-23; no longer recorded or shown anywhere \u2014 the player\u2019s point of view is the only one that exists, and a forced flip is neither a life nor a death; accepted so those records stay valid' },
];

// Records are grouped by mode key and kept in chronological order. The RAM
// copy of the whole history (userdata 'history', filled by userdataReady);
// scalar records are small enough that all of them stay in RAM — revisit
// only if that ever stops being true.
let history = null;

// The top score key: everything that determines how a board is made and
// played — board parameters, play mode, and the board generator with its
// exact parameter values. Every key holds its own history and rankings.
// Named difficulty labels are display-only (see boardDisplayLabel). Keys
// without @ are the pre-2026-08-21 shape and mean Standard; keys without
// a +generator suffix mean the default uniform generator, so every
// pre-generator key is already a valid top score key.
function boardKeyOf(params) {
  return params.width + 'x' + params.height + '/' + params.mines;
}

function boardKey() {
  return boardKeyOf(config);
}

function modeKeyOf(params, playMode) {
  return boardKeyOf(params) + '@' + playMode;
}

function topScoreKeyOf(params, playMode, generator) {
  return modeKeyOf(params, playMode) + BoardGenerators.keySuffix(generator);
}

function modeKey() {
  return topScoreKeyOf(config, settings.playMode, gameGenerator);
}

function playModeLabel(id) {
  const spec = PLAY_MODES.find((m) => m.id === (id || settings.playMode));
  return spec ? spec.label : String(id);
}

function normalizeHistoryKey(key) {
  return key.includes('@') ? key : key + '@standard';
}

//-------ACTION EVALUATION: HISTORY NORMALIZATION (pure)-------

function legacyFatalEvaluation(record) {
  const deathKind = record.deathKind;
  const evaluation = {
    version: ACTION_EVALUATION_VERSION,
    action: deathKind === 'chord' ? 'chord'
      : record.playMode === 'proof-or-die' ? 'proof-open'
        : deathKind === undefined ? 'unknown' : 'reveal',
    actionNumber: record.clicks,
    atMs: record.timeMs,
    selected: [],
    result: 'death',
    mistakes: [],
    evidence: {
      playMode: record.playMode,
      oddsMeasured: typeof record.deathRisk === 'number',
      ...(typeof record.deathRisk === 'number'
        ? { chosenRisk: record.deathRisk } : {}),
      ...(typeof record.deathBestRisk === 'number'
        ? { bestRisk: record.deathBestRisk,
          safeAvailable: record.deathBestRisk <= 1e-12 } : {}),
    },
    alternatives: [],
    legacy: {
      source: deathKind !== undefined ? 'death-kind-v1'
        : record.stupidDeath !== undefined ? 'avoidable-boolean-v1'
          : 'unjudged-loss',
      ...(deathKind !== undefined ? { deathKind } : {}),
      ...(record.stupidDeath !== undefined ? { avoidable: record.stupidDeath } : {}),
    },
  };
  if (deathKind === 'mine') evaluation.mistakes.push('opened-proven-mine');
  if (deathKind === 'needless') evaluation.mistakes.push('guessed-with-safe-move');
  if (deathKind === 'forced' && typeof record.deathRisk === 'number'
      && typeof record.deathBestRisk === 'number'
      && record.deathRisk > record.deathBestRisk + 1e-12) {
    evaluation.mistakes.push('chose-higher-risk');
  }
  if (deathKind === undefined && record.stupidDeath === true) {
    evaluation.mistakes.push('legacy-avoidable');
  }
  return evaluation;
}

function legacyCoverageEvaluation(record) {
  return {
    version: ACTION_EVALUATION_VERSION,
    action: 'history-coverage',
    atMs: record.timeMs,
    selected: [],
    result: 'continued',
    mistakes: [],
    evidence: { factsMeasured: false, playMode: record.playMode },
    alternatives: [],
    legacy: { source: 'pre-action-evaluation-coverage' },
  };
}

// Every record in RAM uses the newest action-evidence representation.
// Legacy fields are accepted only at the storage/import boundary, converted
// once, deleted, and persisted back so the rest of the app has one model.
function normalizeGameRecord(record) {
  const normalized = { ...record };
  let changed = false;
  if (!Array.isArray(normalized.actionEvaluations)) {
    normalized.actionEvaluations = normalized.outcome === 'loss'
      ? [legacyFatalEvaluation(normalized)]
      : [legacyCoverageEvaluation(normalized)];
    changed = true;
  } else if (typeof proofCorrectedEvaluation === 'function') {
    normalized.actionEvaluations = normalized.actionEvaluations.map((evaluation) => {
      const corrected = proofCorrectedEvaluation(evaluation);
      if (corrected !== evaluation) changed = true;
      return corrected;
    });
  }
  for (const field of ['stupidDeath', 'deathKind', 'deathRisk', 'deathBestRisk']) {
    if (field in normalized) {
      delete normalized[field];
      changed = true;
    }
  }
  return { record: normalized, changed };
}

//-------ACTION EVALUATION: HISTORY NORMALIZATION END-------

function normalizeHistory(raw) {
  const out = {};
  let changed = false;
  for (const [key, list] of Object.entries(raw)) {
    const norm = normalizeHistoryKey(key);
    if (norm !== key) changed = true;
    if (!out[norm]) out[norm] = [];
    const seen = new Set(out[norm].map((r) => r.endedAt));
    for (const sourceRecord of list) {
      const modern = normalizeGameRecord(sourceRecord);
      if (modern.changed) changed = true;
      const r = modern.record;
      if (seen.has(r.endedAt)) continue;
      seen.add(r.endedAt);
      out[norm].push(r);
    }
  }
  for (const key of Object.keys(out)) {
    out[key].sort((a, b) => a.endedAt - b.endedAt);
  }
  return { history: out, changed: changed };
}

//-------PLAY HISTORY: TRANSFER CLEANING (pure)-------

// Preserve every usable measurement in a record. An invalid optional field
// can be dropped without changing the primary game result; an invalid
// required field makes the record unusable. Normalization then upgrades any
// legacy action evidence that was absent or had to be discarded.
function cleanTransferredGameRecord(source) {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) {
    return { record: null, repairedFields: 0 };
  }
  const cleaned = { ...source };
  let repairedFields = 0;
  for (const field of GAME_RECORD_SCHEMA) {
    if (field.valid(cleaned[field.field])) continue;
    if (!field.valid(undefined)) return { record: null, repairedFields: 0 };
    delete cleaned[field.field];
    repairedFields++;
  }
  const normalized = normalizeGameRecord(cleaned).record;
  if (GAME_RECORD_SCHEMA.some((field) => !field.valid(normalized[field.field]))) {
    return { record: null, repairedFields: 0 };
  }
  return { record: normalized, repairedFields };
}

// Used in both directions so an export never contains a record this build
// would reject, while import can retain all valid siblings of bad data.
function cleanTransferredHistory(raw) {
  const cleaned = {};
  let gameCount = 0;
  let skippedRecords = 0;
  let skippedLists = 0;
  let repairedFields = 0;
  for (const [mode, list] of Object.entries(raw)) {
    if (mode === 'settings') continue;
    if (!Array.isArray(list)) {
      skippedLists++;
      continue;
    }
    const key = normalizeHistoryKey(mode);
    if (!cleaned[key]) cleaned[key] = [];
    for (const source of list) {
      const result = cleanTransferredGameRecord(source);
      if (result.record === null) {
        skippedRecords++;
        continue;
      }
      cleaned[key].push(result.record);
      gameCount++;
      repairedFields += result.repairedFields;
    }
  }
  return { history: cleaned, gameCount, skippedRecords, skippedLists, repairedFields };
}

//-------PLAY HISTORY: TRANSFER CLEANING END-------

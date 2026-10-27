'use strict';

// Play history: record version stamps and the game record schema, per-mode
// history in RAM and appending to it, mode keys, legacy normalization, and
// transfer cleaning for imports.

//-------PLAY HISTORY (every finished game kept per mode)-------

// Version stamps each record carries: the random stream, the board
// placement algorithm, the Justice rule its game ran under, and the guess
// scoring its ledger used.
const RNG_VERSION = GameRandom.VERSION;
// One version string per board generator (generators.js); a record's
// boardVersion names the exact placement algorithm its seed replays
// through. The default generator's string predates the registry.
const BOARD_VERSION = BoardGenerators.byId(BoardGenerators.DEFAULT_ID).version;
const BOARD_VERSIONS = new Set(BoardGenerators.SPECS.map((g) => g.version));
const JUSTICE_VERSION = 'just-universe-v3';
const JUSTICE_VERSIONS = new Set([
  'sealed-pocket-mercy-v1',
  'sealed-pocket-mercy-v2',
  JUSTICE_VERSION,
]);
const ODDS_VERSIONS = new Set(['guess-ledger-v1', Odds.VERSION]);

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
const isCount = (v) => Number.isInteger(v) && v >= 0;
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
  { field: 'timeZone', valid: (v) => v === undefined || validTimeZoneName(v), example: '"America/Los_Angeles"', describe: 'IANA time zone the browser reported when the game finished, so local time of day stays correct after travel or a move; absent on games recorded before 2026-09-26' },
  { field: 'utcOffsetMin', valid: (v) => v === undefined || validUtcOffsetMin(v), example: '-420', describe: 'minutes east of UTC the browser applied at endedAt (-420 = UTC-7); absent on games recorded before 2026-09-26' },
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
  { field: 'flagsPlaced', valid: (v) => v === undefined || isNumber(v), example: '0', describe: 'flags the player placed; 0 = a markless game; absent on games recorded before 2026-08-19' },
  { field: 'flagsRemoved', valid: (v) => v === undefined || isNumber(v), example: '1', describe: 'flag states the player turned off; placement and removal are each board-changing clicks; the reason for removal is not observed; absent on games recorded before 2026-08-20' },
  { field: 'unusedCorrectFlags', valid: (v) => v === undefined || isNumber(v), example: '2', describe: 'on a win, correct mine-flag placement episodes that ended or were removed without ever contributing to an accepted chord; absent on losses and games recorded before 2026-08-28 because an unfinished solve cannot establish whether a standing mark would later have been used' },
  { field: 'mousePathPx', valid: isNumber, example: '1182', describe: 'cursor travel while playing, px' },
  { field: 'fastclickGapMs', valid: (v) => v === undefined || isNumber(v), example: '142', describe: 'with fastclickGapVersion "' + GameData.FASTCLICK_GAP_VERSION + '": median press-to-press time of the game\u2019s planned pairs, rounded to the ms: two board-changing clicks in a row, neither a flag removal, on touching squares, every square they open proven safe and every square they flag proven a mine before the first, nothing else pressed between them, and, after a first click that opened squares, the cursor never 100 ms without moving before the second press; absent when the game had no planned pair or the prover stopped at its work limit on one. Without fastclickGapVersion (games before 2026-10-26 not since restored): the earlier definition, the median gap between board-changing clicks of at most 1 s ending in a click made on the move, which no view reads; absent on games recorded before 2026-08-22' },
  { field: 'fastclickGapVersion', valid: (v) => v === undefined || v === GameData.FASTCLICK_GAP_VERSION, example: '"' + GameData.FASTCLICK_GAP_VERSION + '"', describe: 'the fastclick gap definition fastclickGapMs was measured under, written for every game measured since 2026-10-26, including games with no planned pair; absent on earlier games until their result is next restored' },
  { field: 'cadenceSpread', valid: (v) => v === undefined || isNumber(v), example: '1.42', describe: 'press-to-press rhythm consistency: interquartile range of all button-press gaps (wasted presses included) divided by their median — 0 means metronomic, larger means burstier; measured for wins and losses; unrounded since 2026-10-26, rounded to 3 decimals before; absent under two measurable gaps or on games recorded before 2026-08-30' },
  { field: 'movesRanOut', valid: (v) => v === undefined || isCount(v), example: '4', describe: 'moves made once the local work had run out: a move is a board-changing click 3 or more squares from everything the board-changing click before it opened or marked and from the proven-safe squares within 2 squares of those; measured for wins and losses from the trace; absent where the prover stopped at its work limit at a move, and on games recorded before 2026-10-20 until their result is next restored' },
  { field: 'movesLeftHardWork', valid: (v) => v === undefined || isCount(v), example: '2', describe: 'moves made while proven-safe squares were still within 2 squares of the click before, none of which counting a single number proved: the local work had turned slow; absent with movesRanOut' },
  { field: 'movesLeftEasyWork', valid: (v) => v === undefined || isCount(v), example: '1', describe: 'moves made while counting a single number had proved a square within 2 squares of the click before safe; absent with movesRanOut' },
  { field: 'moveGapMedianMs', valid: (v) => v === undefined || isNumber(v), example: '842', describe: 'median time from the board-changing click before a move to the move, ms; absent with movesRanOut and on games without a move' },
  { field: 'forkMoves', valid: (v) => v === undefined || isCount(v), example: '2', describe: 'moves made while proven-safe squares lay in 2 or more places (squares at most 2 apart are one place); absent with movesRanOut' },
  { field: 'forkMovesToNearestArea', valid: (v) => v === undefined || isCount(v), example: '1', describe: 'fork moves that went to the place holding the proven-safe square nearest the click before; absent with movesRanOut' },
  { field: 'states', valid: (v) => v === undefined || (Array.isArray(v) && v.every((s) => typeof s === 'string')), example: '["sleepy"]', describe: 'player-defined state tags active when the game finished (see the states panel); absent on games recorded before 2026-08-20' },
  { field: 'musicPlaying', valid: (v) => v === undefined || typeof v === 'boolean', example: 'true', describe: 'whether this machine heard audio playing during the game (sampled about once a minute from the local base system); absent when that endpoint never answered, on every origin other than the local player origin, or on games recorded before 2026-08-22' },
  { field: 'flagsBlocked', valid: (v) => v === undefined || v === true, example: 'true', describe: 'true when a reached daily play limit\u2019s no-flags penalty kept the player from placing flags for the whole game (fixed when the board went into play; removing a flag stayed allowed); absent = flags allowed, as on every game before 2026-10-14' },
  { field: 'justice', valid: (v) => v === undefined || isNumber(v), example: '1', describe: 'clicks into guesses that nothing else on the board could ever settle, each made safe by "a just universe" (the forced coinflips won); absent on games recorded before 2026-08-20' },
  { field: 'justiceEnabled', valid: (v) => v === undefined || typeof v === 'boolean', example: 'true', describe: 'whether "a just universe" was frozen on for this game at its first reveal; absent on earlier games' },
  { field: 'seed', valid: (v) => v === undefined || (typeof v === 'string' && /^[0-9a-f]{32}$/.test(v)), example: '"2f4c5a107ad399e681137b2dc51490aa"', describe: '128-bit seed for initial placement and for "a just universe"; absent on earlier games' },
  { field: 'firstRevealIndex', valid: (v) => v === undefined || (Number.isInteger(v) && v >= 0), example: '0', describe: 'the cell of the game-starting reveal on an unopened board, as row * width + column; with the seed, RNG version, and board version it rebuilds the initial mine layout without the trace; absent on Endgame drill games and games recorded before 2026-09-27' },
  { field: 'rngVersion', valid: (v) => v === undefined || v === RNG_VERSION, example: '"' + RNG_VERSION + '"', describe: 'algorithm that turns seed into the game random stream; absent on earlier games' },
  { field: 'boardVersion', valid: (v) => v === undefined || BOARD_VERSIONS.has(v), example: '"' + BOARD_VERSION + '"', describe: 'board placement algorithm used with the seed (one version string per board generator); absent on earlier games' },
  { field: 'generator', valid: (v) => v === undefined || BoardGenerators.validStoredGenerator(v), example: '{"id":"pink-noise","params":{"alpha":1,"scale":8,"contrast":2}}', describe: 'non-default board generator this board was placed with (id plus its complete parameter set, the same facts the top score key\u2019s +generator suffix carries); absent = the default uniform generator' },
  { field: 'justiceVersion', valid: (v) => v === undefined || JUSTICE_VERSIONS.has(v), example: '"' + JUSTICE_VERSION + '"', describe: 'version of the rules for which guesses "a just universe" covers and how it keeps them safe; v2 added the all-consistent-layout proof prepass; v3 judges each 50/50 or group on its own when a shared number links it to other unknown squares; absent on earlier games' },
  { field: 'maxAdjacent', valid: (v) => v === undefined || isNumber(v), example: '4', describe: 'highest adjacent-mine number on the finished board; absent on games recorded before 2026-08-21' },
  { field: 'hasSeven', valid: (v) => v === undefined || typeof v === 'boolean', example: 'true', describe: 'whether the finished board contains at least one 7; absent on earlier games' },
  { field: 'zeroCount', valid: (v) => v === undefined || isNumber(v), example: '41', describe: 'how many finished-board cells have adjacent-mine count 0; absent on earlier games' },
  { field: 'islandCount', valid: (v) => v === undefined || isNumber(v), example: '6', describe: '8-connected mine components on the finished board (diagonals count, edges empty); absent on earlier games' },
  { field: 'largestIsland', valid: (v) => v === undefined || isNumber(v), example: '5', describe: 'mine count in the largest 8-connected mine component; 0 if no mines; absent on earlier games' },
  { field: 'playMode', valid: (v) => v === undefined || RECORD_PLAY_MODE_IDS.has(v), example: '"standard"', describe: 'play mode this game was under, including the no-guess modes removed 2026-10-21 (uniform-ng, single-path-ng, proof-or-die); absent on games recorded before 2026-08-21' },
  { field: 'actionEvaluations', valid: validActionEvaluations, example: '[{"version":"action-evaluation-v1","action":"reveal","result":"continued","mistakes":["guessed-with-safe-move"],"evidence":{"proofVersion":"all-consistent-layouts-v1"}}]', describe: 'versioned evidence for the fatal action and every earlier measured reportable action, generated independently of the player’s report display scope: proof-engine version/completeness, exclusive report category derived from action/outcome, independent mistake tags, raw and protection-aware chosen/best risks, modeled-life values, highlighted alternatives, and (except compact no-op entries) the visible position before the action; [] means no recorded reportable action and no death; older records are normalized into this field on load/import' },
  { field: 'identityIndex', valid: (v) => v === undefined || isNumber(v), example: '3', describe: 'trial board identity (0-based in that session); absent outside trial' },
  { field: 'transform', valid: (v) => v === undefined || typeof v === 'string', example: '"rot90"', describe: 'isometry applied to the trial identity for this presentation' },
  { field: 'trialStartedAt', valid: (v) => v === undefined || isNumber(v), example: '1787201223496', describe: 'when the enclosing trial session began' },
  { field: 'givenOpening', valid: (v) => v === undefined || typeof v === 'boolean', example: 'false', describe: 'whether this trial presentation started with a predetermined cell already opened; absent on earlier trial games (those were given an opening)' },
  { field: 'guesses', valid: (v) => v === undefined || isNumber(v), example: '2', describe: 'clicks (not chords) on cells with p(mine) > 0; a zero-risk cell is not a guess even if local deduction had not marked it; absent when odds could not be measured, in modes without a real mine gamble (angelic, and the removed proof-or-die), or on games recorded before 2026-08-21' },
  { field: 'guessIdealRisk', valid: (v) => v === undefined || isNumber(v), example: '1', describe: 'guesses that chose a lowest-available death risk; absent with guesses' },
  { field: 'guessNonideal', valid: (v) => v === undefined || isNumber(v), example: '1', describe: 'guesses that chose a cell riskier than the safest available; absent with guesses' },
  { field: 'guessPerfect', valid: (v) => v === undefined || isNumber(v), example: '1', describe: 'guesses that maximized one-ply expected remaining life (survival times leftover min-risk after the number you would see); absent with guesses' },
  { field: 'lifeLost', valid: (v) => v === undefined || isNumber(v), example: '0.75', describe: 'sum of mine probabilities of guessed cells (absolute multiverse lives spent); absent with guesses' },
  { field: 'lifeNeedless', valid: (v) => v === undefined || isNumber(v), example: '0.25', describe: 'sum of (chosen risk minus safest available risk); an ideal-risk guess costs 0 even at 19% death; absent with guesses' },
  { field: 'oddsVersion', valid: (v) => v === undefined || ODDS_VERSIONS.has(v), example: '"' + Odds.VERSION + '"', describe: 'remaining-layout odds and guess-scoring contract; v2 weighs each number a guessed square could show by the whole-board layouts that show it (v1 counted each layout of the square\u2019s group once, including layouts the remaining mine count rules out); absent on earlier games' },
  { field: 'stupidDeath', legacy: true, valid: (v) => v === undefined || typeof v === 'boolean', example: 'true', describe: 'legacy import-only avoidable-death boolean; normalized into actionEvaluations and removed immediately' },
  { field: 'deathKind', legacy: true, valid: (v) => v === undefined || v in DEATH_KIND_LABELS, example: '"angel"', describe: 'legacy import-only five-way death verdict; normalized into actionEvaluations and removed immediately' },
  { field: 'deathRisk', legacy: true, valid: (v) => v === undefined || isNumber(v), example: '0.25', describe: 'legacy import-only selected risk; normalized into actionEvaluations and removed immediately' },
  { field: 'deathBestRisk', legacy: true, valid: (v) => v === undefined || isNumber(v), example: '0.143', describe: 'legacy import-only best available risk; normalized into actionEvaluations and removed immediately' },
  { field: 'justiceSaves', valid: (v) => v === undefined || isNumber(v), example: '0', describe: 'historical field written only during part of 2026-08-23; no longer recorded or shown anywhere \u2014 the player\u2019s point of view is the only one that exists, and a forced flip is neither a life nor a death; accepted so those records stay valid' },
];

// A markless game: the player never placed a single flag. Records from
// before flagsPlaced was measured have it undefined and never qualify —
// the status is only claimed where it is known.
function isMarkless(record) {
  return record.flagsPlaced === 0;
}

// Records are grouped by mode key and kept in chronological order. The RAM
// copy of the whole history (the 'records' store, filled by userdataReady);
// scalar records are small enough that all of them stay in RAM — revisit
// only if that ever stops being true.
let history = null;

// Appends the finished game to its mode's history and returns that mode's
// full record list (the appended object included, so identity search works).
function appendGameRecord(record) {
  const key = modeKey();
  if (!(key in history)) history[key] = [];
  history[key].push(record);
  persistGameRecord(key, record);
  return history[key];
}

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

// A play span's top score key, the one its game record would have; a span
// stores its generator only when it is not the default, as a record does.
function playSpanKeyOf(span) {
  return modeKeyOf(span, span.playMode) + (span.generator === undefined ? '' : BoardGenerators.keySuffix(span.generator));
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
  }
  // Losses saved before their fatal reveal recorded its proof tiers
  // (2026-10-11) get them once from the saved position.
  const fatal = fatalEvaluationOf(normalized);
  const tiers = fatal === undefined ? {} : fatalProofTiers(fatal);
  if (Object.keys(tiers).length > 0) {
    const measured = { ...fatal, evidence: { ...fatal.evidence, ...tiers } };
    normalized.actionEvaluations = normalized.actionEvaluations.map((evaluation) =>
      evaluation === fatal ? measured : evaluation);
    changed = true;
  }
  // The last field is a win measure the creator removed on 2026-10-15.
  for (const field of ['stupidDeath', 'deathKind', 'deathRisk', 'deathBestRisk', 'flagsWithoutMultiCellChord']) {
    if (field in normalized) {
      delete normalized[field];
      changed = true;
    }
  }
  return { record: normalized, changed };
}

//-------ACTION EVALUATION: HISTORY NORMALIZATION END-------

// Besides the RAM history, lists exactly the stored entries normalization
// changes: `writes` ([history key, record]) for records whose content or key
// changed, and `deletions` ([stored key, endedAt]) for entries moved off a
// legacy key. Persisting only these leaves every other record untouched, so
// a game another open tab saved meanwhile cannot be erased.
function normalizeHistory(raw) {
  const out = {};
  const writes = [];
  const deletions = [];
  for (const [key, list] of Object.entries(raw)) {
    const norm = normalizeHistoryKey(key);
    if (!out[norm]) out[norm] = [];
    const seen = new Set(out[norm].map((r) => r.endedAt));
    for (const sourceRecord of list) {
      const modern = normalizeGameRecord(sourceRecord);
      const r = modern.record;
      if (norm !== key) deletions.push([key, sourceRecord.endedAt]);
      if (seen.has(r.endedAt)) continue;
      seen.add(r.endedAt);
      out[norm].push(r);
      if (norm !== key || modern.changed) writes.push([norm, r]);
    }
  }
  for (const key of Object.keys(out)) {
    out[key].sort((a, b) => a.endedAt - b.endedAt);
  }
  return { history: out, changed: writes.length > 0 || deletions.length > 0, writes, deletions };
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

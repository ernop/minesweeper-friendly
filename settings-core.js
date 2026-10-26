'use strict';

//-------PERSONAL SETTINGS (one schema, one JSON-compatible stored object)-------

// Every persistent preference belongs to SETTINGS_SCHEMA. Both pages use
// this module to load, validate, default, migrate, clone, and save the same
// flat settings object in IndexedDB userdata['settings']. Preferences have
// their own JSON export/import; game history never reads or writes them.
// Control 'none' means the editor lives on the game page, not a second store;
// control 'result-section' means the switch renders in RESULT_SECTION_GROUPS.
// Choices and bounds live here; generator definitions come from the shared
// generators.js registry, loaded before this module on both pages.

// Play mode is a second uniqueifier next to board size: rankings and
// history keys are per (board, play mode, board generator). Trial
// results never mix with the other modes' lists. Board lab is the
// non-play mode for exploring board generation: every board appears
// already solved, nothing is recorded. A `description` is the menu entry's
// tooltip where the name alone leaves the rules open.
const PLAY_MODES = [
  { id: 'standard', label: 'Standard' },
  {
    id: 'pregen-10-3bv-desc',
    label: '3BV countdown',
    description: 'Ten boards a batch, played from the highest 3BV down; the upper-right square opens on its own.',
  },
  { id: 'angelic', label: 'Angelic' },
  { id: 'endgame-drill', label: 'Endgame drill' },
  { id: 'trial', label: 'Trial' },
  { id: 'short-trial', label: 'Short trial' },
  { id: 'test-trial', label: 'Test trial' },
  { id: 'board-lab', label: 'Board lab' },
];
const PLAY_MODE_IDS = new Set(PLAY_MODES.map((m) => m.id));

// The no-guess modes, removed 2026-10-21 (creator decision,
// docs/product/play-modes.md). They can no longer be chosen; games saved
// under them keep their mode, so it stays a valid record value with a name.
const REMOVED_PLAY_MODES = [
  { id: 'uniform-ng', label: 'Uniform NG' },
  { id: 'single-path-ng', label: 'Single-path NG' },
  { id: 'proof-or-die', label: 'Proof-or-die' },
];
const RECORD_PLAY_MODES = [...PLAY_MODES, ...REMOVED_PLAY_MODES];
const RECORD_PLAY_MODE_IDS = new Set(RECORD_PLAY_MODES.map((m) => m.id));

const AVERAGE_CHART_MODES = [
  ['average', 'average'],
  ['distribution', 'distribution'],
  ['winrate', 'winrate'],
];

const SHOWN_THINGS_DEFAULTS = Object.freeze({
  endVerdict: true,
  gameStats: true,
  timeTables: true,
  lastOneMinute: false,
  exact3BV: true,
  exactZiNi: true,
  exactMaxNumber: true,
  boardMetricFacts: true,
  boardPercentiles: true,
  exactHZiNi: true,
  workSpreadTable: false,
  zeroOneShareTable: true,
  zeroOpeningTable: true,
  sessionSummary: true,
  sessionEndings: true,
  recentPlacements: true,
  recentPlacementsOtherBoards: false,
  boardShapeTables: true,
  largestIsland: false,
  duringGame: true,
  averageCharts: true,
  streak: true,
  nearStreak: true,
  nearNearStreak: false,
  relationshipCharts: true,
});

const SHOWN_THINGS_OPTIONS = [
  ['gameStats', 'loss and trial stats', 'the label/value stats for losses and trial games; regular wins use game data'],
  ['sessionSummary', 'session summary', 'games, wins, and win rate per board type in the session, with each type’s best session time and that time’s lifetime rank; left of the board when it fits'],
  ['sessionEndings', 'session results by type', 'under the session summary: the session’s games of the current board type alone (its size, mode, and generator) split into won, lost, and abandoned, won and lost then by the worst offense against perfect play and its type, each level’s shares in their own column, and how many losses were likely misclicks'],
  ['recentPlacements', 'ranks won in session', 'top-tenth ranks earned in the session on every longer tablechart; lifetime always shows at least its closest rank; right of the board when it fits'],
  ['recentPlacementsOtherBoards', 'ranks on other session boards', 'ranks won in session also lists the board categories of the session’s other wins (3BV, ZiNi, HZiNi, 3BV spread, max number, board shapes, 0–1 share, zero-opening coverage), e.g. 1st in 3BV 30 when this win’s 3BV is 40; off lists only this win’s board categories'],
  ['timeTables', 'time-window tablecharts', 'lifetime, calendar, rolling-window, and day-category rankings'],
  ['lastOneMinute', 'last 1 minute', 'the very short rolling time tablechart'],
  ['exact3BV', 'same-3BV tablechart', 'times on boards with exactly the same 3BV'],
  ['exactZiNi', 'same-ZiNi tablechart', 'times on boards with exactly the same greedy ZiNi click benchmark'],
  ['exactMaxNumber', 'same-max-number tablechart', 'times on boards whose max number (highest clue) is exactly the same; distinct from the max number ≤ 4/3/2 tablecharts'],
  ['boardMetricFacts', 'board backfill progress', 'progress and Stop/Resume controls for measuring saved wins in This board'],
  ['boardPercentiles', 'game data', 'the winning-game chart: game summary perf, your performance ranked against your lifetime and session games, on the left; this board’s traits ranked against earlier boards on the right'],
  ['exactHZiNi', 'same-HZiNi tablechart', 'times on boards with the same HZiNi (human ZiNi, the opening-first chord benchmark)'],
  ['workSpreadTable', '3BV-spread tablechart', 'times on boards with 3BV spread rounded to the same nearest 0.5 cell'],
  ['zeroOneShareTable', '0–1-share tablechart', 'times on boards whose zeros and ones revealed by opening every zero, as a fraction of all safe squares, round to the same nearest whole percentage point'],
  ['zeroOpeningTable', 'zero-opening-coverage tablechart', 'times on boards whose fraction of safe squares exposed by opening every zero region rounds to the same nearest whole percentage point'],
  ['boardShapeTables', 'board-shape tablecharts', 'has an 8, has a 7, max number ≤ 4/3/2, islands, and zeros rankings'],
  ['largestIsland', 'largest island', 'the largest-island stat and matching tablechart'],
  ['duringGame', 'live perf charts', 'at the head of the game data column: how the game just played unfolded on its own clock: progress; the moves the board offered, counted (proven-safe squares and proven mines by how hard they were to see, chordable numbers); tracks of clicks, jumps, and pauses; and each measured line against its own whole-game value, all on one time axis; pointing at a line shows its value and moves the replay under the board to that moment'],
  ['averageCharts', 'average-time charts', 'your-perf and board-trait property charts, each with its own average, distribution, or winrate reading'],
  ['streak', 'streak', 'consecutive-win ranking'],
  ['nearStreak', 'near-streak', 'win runs spanning at most one loss'],
  ['nearNearStreak', 'near-near-streak', 'win runs spanning at most two losses'],
  ['relationshipCharts', 'relationship charts', 'the raw win scatter plots at the bottom'],
];

// The result-section switches, grouped under what they control and ordered
// as the result shows it; only the settings page renders them. 'shownThings.x'
// is a shownThings key; a bare name is a boolean setting with control
// 'result-section'.
const RESULT_SECTION_GROUPS = [
  ['This game', ['shownThings.gameStats', 'shownThings.duringGame', 'shownThings.boardPercentiles']],
  ['Tables', ['shownThings.sessionSummary', 'shownThings.sessionEndings', 'shownThings.recentPlacements',
    'shownThings.recentPlacementsOtherBoards', 'shownThings.timeTables', 'shownThings.lastOneMinute',
    'collapseDuplicateCharts', 'shownThings.streak', 'shownThings.nearStreak', 'shownThings.nearNearStreak']],
  ['This board', ['shownThings.boardMetricFacts', 'shownThings.exact3BV', 'shownThings.exactZiNi',
    'shownThings.exactMaxNumber', 'shownThings.exactHZiNi', 'shownThings.workSpreadTable',
    'shownThings.zeroOneShareTable', 'shownThings.zeroOpeningTable', 'shownThings.boardShapeTables',
    'shownThings.largestIsland']],
  ['Charts', ['shownThings.averageCharts', 'shownThings.relationshipCharts']],
];

function resultSectionSwitch(path) {
  const [field, key = null] = path.split('.');
  if (key === null) {
    const s = SETTINGS_SCHEMA.find((entry) => entry.field === field);
    return { path, field, key, label: s.label, describe: s.describe };
  }
  const [, label, describe] = SHOWN_THINGS_OPTIONS.find(([id]) => id === key);
  return { path, field, key, label, describe };
}

function resultSectionShown(entry) {
  return entry.key === null ? settings[entry.field] : settings[entry.field][entry.key];
}

function setResultSectionShown(entry, shown) {
  if (entry.key === null) settings[entry.field] = shown;
  else settings[entry.field][entry.key] = shown;
}

const REPORT_SCOPE_CHOICES = [
  ['none', 'nothing', 'no action analysis, mistake counts, or fatal-action mention; evidence is still stored in history'],
  ['fatal', 'fatal action only', 'the one fatal action after a loss; wins show no action analysis'],
  ['risk', 'fatal + risky actions', 'the fatal action plus earlier actions that increased actual death probability'],
  ['full', 'full analysis', 'fatal and risky actions, aggregated time loss, model-relative optimization, and measurement notes'],
];

function validReportScope(value) {
  return REPORT_SCOPE_CHOICES.some(([id]) => id === value);
}

function reportScopeFromStored(stored) {
  if (validReportScope(stored.reportScope)) return stored.reportScope;
  if (stored.shownThings && stored.shownThings.endVerdict === false) return 'none';
  const old = stored.reportCategories;
  if (old !== null && typeof old === 'object' && !Array.isArray(old)) {
    if (old.timeLoss || old.lifeMaximization || old.measurementNotes) return 'full';
    if (old.gameRisk) return 'risk';
    if (old.gameLoss) return 'fatal';
    if (Object.values(old).every((enabled) => enabled === false)) return 'none';
  }
  // No stored scope and no legacy category block: the new-player default.
  return 'none';
}

function validGameDataMetrics(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.entries(value).every(([key, shown]) => Object.hasOwn(GameData.defaults, key) && typeof shown === 'boolean');
}

// The creator removed one measurement on 2026-10-15; selections saved before
// then still name it, and validGameDataMetrics rejects any unknown entry.
function withoutRemovedGameDataMetric(selection) {
  if (selection === null || typeof selection !== 'object' || Array.isArray(selection)) return selection;
  const kept = { ...selection };
  delete kept.flagsWithoutMultiCellChord;
  return kept;
}

// One selection replaced the separate lifetime and session selections
// (2026-10-07); a measurement either of them showed stays shown.
function gameDataMetricsFromStored(stored) {
  if (Object.hasOwn(stored, 'gameDataMetrics')) return withoutRemovedGameDataMetric(stored.gameDataMetrics);
  const old = [stored.gameDataLifetimeMetrics, stored.gameDataSessionMetrics]
    .map(withoutRemovedGameDataMetric).filter(validGameDataMetrics);
  if (old.length === 0) return GameData.defaults;
  return Object.fromEntries(Object.keys(GameData.defaults).map((id) =>
    [id, old.some((selection) => selection[id] ?? GameData.defaults[id])]));
}

// Game data's board traits in its row order, and whether each shows by
// default: as the This board table switches showed them by default.
const GAME_DATA_BOARD_TRAIT_DEFAULTS = Object.freeze({
  bv3: true, zini: true, maxAdjacent: true, hzini: true, workSpread: false,
  zeroOneShare: true, zeroOpeningCoverage: true, islandCount: true, largestIsland: false, zeroCount: true,
});

// Game data's board traits followed the This board table switches until
// configure chose them (2026-10-14); a saved profile starts from what its
// switches showed.
function gameDataBoardTraitsFromStored(stored) {
  if (Object.hasOwn(stored, 'gameDataBoardTraits')) return stored.gameDataBoardTraits;
  const shown = { ...SHOWN_THINGS_DEFAULTS, ...(validShownThings(stored.shownThings) ? stored.shownThings : {}) };
  return {
    bv3: shown.exact3BV, zini: shown.exactZiNi, maxAdjacent: shown.exactMaxNumber, hzini: shown.exactHZiNi,
    workSpread: shown.workSpreadTable, zeroOneShare: shown.zeroOneShareTable, zeroOpeningCoverage: shown.zeroOpeningTable,
    islandCount: shown.boardShapeTables, largestIsland: shown.boardShapeTables && shown.largestIsland,
    zeroCount: shown.boardShapeTables,
  };
}

function validShownThings(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.entries(value).every(([key, enabled]) =>
      Object.hasOwn(SHOWN_THINGS_DEFAULTS, key) && typeof enabled === 'boolean');
}

// The settings page renders one section per group, in this order; a
// schema entry's `group` names its section. Entries with control 'none'
// carry a group only for coherence (they never render).
const SETTINGS_GROUPS = [
  ['gameplay', 'gameplay'],
  ['after-game', 'after a game'],
];

// The three ways a revealed cell's adjacent-mine count can be drawn.
// All three use the classic number-color palette, so the color always
// carries the count; letters map A=1 … H=8, a dot carries only its color.
const NUMBER_DISPLAY_CHOICES = [
  ['numbers', 'numbers', 'the classic digits 1\u20138'],
  ['letters', 'letters', 'letters A\u2013H (A=1 \u2026 H=8) in the digit colors'],
  ['dots', 'dots', 'one dot per cell \u2014 the count lives only in the color'],
];

// The drawings live in board-icons.js, which every page with this schema
// loads first.
const MINE_STYLE_CHOICES = MINE_STYLES.map((style) => [style.id, style.label, style.describe]);
const FLAG_STYLE_CHOICES = FLAG_STYLES.map((style) => [style.id, style.label, style.describe]);

// Slider settings: whole numbers from min to max in steps, with a numbered
// notch every labelStep.
const FLAG_SIZE_SCALE = { min: 20, max: 100, step: 5, labelStep: 10, unit: '%' };
const FLAG_INTENSITY_SCALE = { min: 10, max: 100, step: 10, labelStep: 10, unit: '' };
const onScale = (scale) => (v) => Number.isInteger(v) && v >= scale.min && v <= scale.max
  && (v - scale.min) % scale.step === 0;

const CELL_SIZE_CHOICES = [16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 80, 96];

const DIFFICULTIES = {
  beginner: { width: 9, height: 9, mines: 10 },
  intermediate: { width: 16, height: 16, mines: 40 },
  expert: { width: 30, height: 16, mines: 99 },
};
const PATH_VIEW_IDS = new Set([
  'off', 'raw-path', 'click-locations', 'movement-speed', 'click-speed', 'progress', 'less-useful',
]);
const REPLAY_OVERLAY_DEFAULTS = {
  moves: true, mines: true, probs: false, pointless: false, purposeful: false, movement: false,
};
const PANEL_OPEN_DEFAULTS = {
  boardPosition: false, gameDetails: false, states: false,
  importHistory: false, dataFormat: false,
  duringGame: true, gamePerformance: true, boardTraits: true, motionStats: false,
};
// Two panels were removed: the Replay game disclosure on 2026-10-20 (the
// transport now sits under the board) and the Overlays panel on 2026-10-21
// (its toggles now end the transport). Panel states saved before then still
// name them, and preferenceBooleans rejects any unknown entry.
function panelsFromStored(stored) {
  if (!Object.hasOwn(stored, 'panels')) return PANEL_OPEN_DEFAULTS;
  if (!preferenceObject(stored.panels)) return stored.panels;
  const kept = { ...stored.panels };
  delete kept.replay;
  delete kept.reviewOptions;
  return kept;
}
// The left work event row split into left hard work and left easy work on
// 2026-10-20; row choices saved before then still name it, and
// preferenceBooleans rejects any unknown entry. Both new rows take its choice.
function duringGameRowsFromStored(stored) {
  if (!Object.hasOwn(stored, 'duringGameRows')) return DuringGame.defaults;
  const rows = stored.duringGameRows;
  if (!preferenceObject(rows) || !Object.hasOwn(rows, 'leftWorkEvents')) return rows;
  const { leftWorkEvents, ...kept } = rows;
  return { leftHardWorkEvents: leftWorkEvents, leftEasyWorkEvents: leftWorkEvents, ...kept };
}
const DEFAULT_STATE_NAMES = ['sleepy', 'just woke up', 'inebriated'];
const preferenceObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const preferenceNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const preferenceBooleans = (defaults) => (v) => preferenceObject(v)
  && Object.entries(v).every(([k, enabled]) => Object.hasOwn(defaults, k) && typeof enabled === 'boolean');
const preferenceBooleanMap = (v) => preferenceObject(v)
  && Object.values(v).every((enabled) => typeof enabled === 'boolean');
function validCustomBoard(v) {
  return preferenceObject(v) && Number.isInteger(v.width) && v.width >= 8 && v.width <= 100
    && Number.isInteger(v.height) && v.height >= 1 && v.height <= 100
    && Number.isInteger(v.mines) && v.mines >= 1
    && v.mines <= Math.max(1, (v.width - 1) * (v.height - 1));
}
function validPlayerStates(v) {
  return Array.isArray(v) && v.every((s) => preferenceObject(s)
    && typeof s.name === 'string' && s.name.trim() !== '' && typeof s.active === 'boolean')
    && new Set(v.map((s) => s.name)).size === v.length;
}

const SETTINGS_SCHEMA = [
  {
    field: 'difficulty',
    default: 'beginner',
    valid: (v) => v === 'custom' || Object.hasOwn(DIFFICULTIES, v),
    group: 'gameplay',
    label: 'board selection',
    describe: 'Beginner, Intermediate, or Expert (each Standard with the default generator), or custom, the board every other mode plays on',
    control: 'none',
  },
  {
    field: 'customBoard',
    default: { ...DIFFICULTIES.expert },
    valid: validCustomBoard,
    group: 'gameplay',
    label: 'custom board',
    describe: 'applied custom width, height, and mine count: the board of every mode chosen from the other modes menu',
    control: 'none',
  },
  {
    field: 'customBoardDraft',
    default: { width: '30', height: '16', mines: '99' },
    valid: (v) => preferenceObject(v) && ['width', 'height', 'mines'].every((key) => typeof v[key] === 'string'),
    group: 'gameplay',
    label: 'custom board draft',
    describe: 'unsubmitted custom-board input values',
    control: 'none',
  },
  {
    field: 'playerStates',
    default: DEFAULT_STATE_NAMES.map((name) => ({ name, active: false })),
    valid: validPlayerStates,
    group: 'gameplay',
    label: 'player states',
    describe: 'personal state-tag names in display order, including which tags are active',
    control: 'none',
  },
  {
    field: 'pathView',
    default: 'off',
    valid: (v) => PATH_VIEW_IDS.has(v),
    group: 'after-game',
    label: 'mouse path display',
    describe: 'chosen mouse-path presentation',
    control: 'none',
  },
  {
    field: 'replayOverlays',
    default: REPLAY_OVERLAY_DEFAULTS,
    valid: preferenceBooleans(REPLAY_OVERLAY_DEFAULTS),
    mergeDefaults: true,
    group: 'after-game',
    label: 'replay overlays',
    describe: 'independent available-move, mine, probability, click, and movement overlays',
    control: 'none',
  },
  {
    field: 'trialSpeedBucketMs',
    default: 200,
    valid: (v) => Number.isInteger(v) && v >= 0 && v <= 800 && v % 25 === 0,
    group: 'after-game',
    label: 'trial speed smoothing',
    describe: 'cursor-speed averaging window in milliseconds; zero shows raw samples',
    control: 'none',
  },
  {
    field: 'resultView',
    default: 'game',
    valid: (v) => v === 'game' || v === 'scores',
    group: 'after-game',
    label: 'result view',
    describe: 'current game or high-score view',
    control: 'none',
  },
  {
    field: 'replayPosition',
    default: { endedAt: null, step: 0 },
    valid: (v) => preferenceObject(v) && (v.endedAt === null || (preferenceNumber(v.endedAt) && v.endedAt >= 0)) && Number.isInteger(v.step) && v.step >= 0,
    group: 'after-game',
    label: 'replay position',
    describe: 'last reviewed finished-game timestamp and action position',
    control: 'none',
  },
  {
    field: 'panels',
    default: PANEL_OPEN_DEFAULTS,
    valid: preferenceBooleans(PANEL_OPEN_DEFAULTS),
    migrate: panelsFromStored,
    mergeDefaults: true,
    group: 'gameplay',
    label: 'open panels',
    describe: 'open or closed state of game panels',
    control: 'none',
  },
  {
    field: 'trialSections',
    default: {},
    valid: preferenceBooleanMap,
    group: 'after-game',
    label: 'trial sections',
    describe: 'expanded trial identities and action reports, keyed by session and identity',
    control: 'none',
  },
  {
    field: 'drafts',
    default: { stateName: '', historyImport: '', preferencesImport: '' },
    valid: (v) => preferenceObject(v) && ['stateName', 'historyImport', 'preferencesImport'].every((key) => typeof v[key] === 'string'),
    group: 'gameplay',
    label: 'draft text',
    describe: 'unsubmitted state name, history JSON, and preferences JSON',
    control: 'none',
  },
  {
    field: 'viewPosition',
    default: { pageX: 0, pageY: 0, focusId: null },
    valid: (v) => preferenceObject(v) && ['pageX', 'pageY'].every((key) => preferenceNumber(v[key]) && v[key] >= 0) && (v.focusId === null || typeof v.focusId === 'string'),
    group: 'gameplay',
    label: 'view position',
    describe: 'page scroll offsets plus the focused control',
    control: 'none',
  },
  {
    field: 'cellSize',
    default: 28,
    valid: (v) => CELL_SIZE_CHOICES.includes(v),
    choices: CELL_SIZE_CHOICES,
    group: 'gameplay',
    label: 'cell size',
    describe: 'cell size in pixels; chosen with Zoom above the board and remembered between visits',
    control: 'none',
  },
  {
    field: 'justUniverse',
    default: true,
    valid: (v) => typeof v === 'boolean',
    group: 'gameplay',
    label: 'a just universe',
    // The one visible hint: the name alone cannot carry this meaning.
    hint: 'a guess that nothing else on the board could ever settle, like a boxed-in 50/50, never kills you',
    describe: 'when you click (not chord) a square in a guess that nothing else on the board could ever settle, that square is guaranteed safe, and every number shown and the mine count stay true; it covers 50/50s, chains of 50/50s, groups like 1 mine among 3 squares, and the last squares no number touches once the mine count fixes their mines; it never covers chords, guesses that opening other squares could still settle, or squares the numbers already prove',
  },
  {
    field: 'collapseDuplicateCharts',
    default: true,
    valid: (v) => typeof v === 'boolean',
    group: 'after-game',
    label: 'collapse duplicate tablecharts',
    describe: 'when several time windows hold the exact same wins (e.g. every win this week happened today), show only the most specific chart in both the tablecharts and ranks-won summary (lifetime and past week always render); off = every window always renders its own chart',
    control: 'result-section',
  },
  {
    field: 'reportScope',
    default: 'none',
    valid: validReportScope,
    migrate: reportScopeFromStored,
    group: 'after-game',
    label: 'after each game, show me',
    describe: 'how much action analysis appears after games; nothing is the new-player default',
    control: 'choice',
    choices: REPORT_SCOPE_CHOICES,
  },
  {
    field: 'perfChartMode',
    default: 'average',
    valid: (v) => AVERAGE_CHART_MODES.some(([id]) => id === v),
    group: 'after-game',
    label: 'your-perf chart mode',
    describe: 'what the your-perf property charts plot per value: the average win time, every individual win time (the distribution), or the share of games won; chosen on that section',
    control: 'none',
  },
  {
    field: 'boardChartMode',
    default: 'average',
    valid: (v) => AVERAGE_CHART_MODES.some(([id]) => id === v),
    group: 'after-game',
    label: 'board-trait chart mode',
    describe: 'what the board-trait property charts plot per value: the average win time, every individual win time (the distribution), or the share of games won; chosen on that section',
    control: 'none',
  },
  {
    field: 'sessionDefinition', default: SessionScope.defaultId,
    valid: (v) => SessionScope.choices.some((choice) => choice.id === v),
    group: 'after-game', label: 'page-wide session',
    describe: 'the one wall-clock session window for the session summary, ranks won in session, game data session comparisons, and the switch cost line; chosen only with the session picker in the settings row at the foot of the game page; default today (since local midnight, not the last 24 hours)',
    control: 'none',
  },
  {
    field: 'gameDataShowValues', default: true,
    valid: (v) => typeof v === 'boolean', group: 'after-game',
    label: 'show values in game data', describe: 'show each measurement’s value for this game beside its name in game data; chosen on the chart', control: 'none',
  },
  {
    field: 'gameDataMetrics', default: GameData.defaults, mergeDefaults: true,
    valid: validGameDataMetrics, migrate: gameDataMetricsFromStored,
    group: 'after-game', label: 'game data measurements',
    describe: 'which of your performance measurements game data compares with your lifetime and your session', control: 'none',
  },
  {
    field: 'gameDataBoardTraits', default: GAME_DATA_BOARD_TRAIT_DEFAULTS, mergeDefaults: true,
    valid: preferenceBooleans(GAME_DATA_BOARD_TRAIT_DEFAULTS), migrate: gameDataBoardTraitsFromStored,
    group: 'after-game', label: 'game data board traits',
    describe: 'which of this board’s traits game data ranks against your lifetime and your session boards; chosen with configure on the chart, apart from the This board tables', control: 'none',
  },
  {
    field: 'gameDataSwitchCost', default: false,
    valid: (v) => typeof v === 'boolean', group: 'after-game', label: 'switch cost line',
    describe: 'your switch cost, the extra time before a press after changing buttons: what the shown game’s switches cost, and the estimate over the session’s, the latest 500, and the earlier 500 standard games, shown under game data’s chart; chosen with configure on the chart', control: 'none',
  },
  {
    field: 'duringGameRows', default: DuringGame.defaults, mergeDefaults: true,
    valid: preferenceBooleans(DuringGame.defaults), migrate: duringGameRowsFromStored,
    group: 'after-game', label: 'during-the-game rows',
    describe: 'which progress, moves available, pace, board, report category, and event rows the live perf charts show; chosen with configure on that section', control: 'none',
  },
  {
    field: 'duringGameAveraging', default: DuringGame.DEFAULT_AVERAGE,
    valid: (v) => DuringGame.AVERAGES.some(([id]) => id === v), group: 'after-game', label: 'live perf charts averaging',
    describe: 'how the live perf charts average: a rolling 2, 5, or 10 second average (default 2 seconds), raw incidents, or fixed 2, 5, or 10 second buckets from the first click; chosen on that section', control: 'none',
  },
  {
    field: 'duringGameRelativeScale', default: DuringGame.DEFAULT_RELATIVE_SCALE,
    valid: (v) => DuringGame.RELATIVE_SCALES.includes(v), group: 'after-game', label: 'live perf charts scale',
    describe: 'the scale of the live perf chart that sets each line against its whole-game value: log, doublings either side of 1× (default), or linear from 0; chosen with the log scale checkbox on that section', control: 'none',
  },
  {
    field: 'gameDataBandPool', default: 'lifetime',
    valid: (v) => v === 'lifetime' || v === 'session', group: 'after-game',
    label: 'game data comparison pool', describe: 'whether game data places both sides’ points, and shows every hover card, among your lifetime games or your session games; chosen with the points switch on the chart', control: 'none',
  },
  {
    field: 'gameDataDistributions', default: false,
    valid: (v) => typeof v === 'boolean', group: 'after-game',
    label: 'game data distributions', describe: 'show game data as one distribution strip per measurement and comparison instead of the bar; chosen on the chart', control: 'none',
  },
  {
    field: 'gameDataDistributionPools', default: 'both',
    valid: (v) => v === 'lifetime' || v === 'session' || v === 'both', group: 'after-game',
    label: 'game data distribution pools', describe: 'whether game data’s distributions show the lifetime groups, the session groups, or both, for your perf and board traits alike; chosen with the pools switch on the chart', control: 'none',
  },
  {
    field: 'detailsColumnShare',
    default: 0.46,
    valid: (v) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1,
    group: 'after-game',
    label: 'details column width',
    describe: 'share of the window width the details column right of the board takes, never under 320px and never taking room the board column needs for the board or 640px, whichever is wider; set by dragging the column\u2019s left edge, not from here',
    control: 'none',
  },
  {
    field: 'boardOffsetX',
    default: 0,
    valid: (v) => typeof v === 'number' && Number.isFinite(v) && v >= -2000 && v <= 2000,
    group: 'gameplay',
    label: 'board horizontal position',
    describe: 'preferred horizontal offset in px from the normal centered position; adjusted with the position control beside Zoom',
    control: 'none',
  },
  {
    field: 'boardOffsetY',
    default: 0,
    valid: (v) => typeof v === 'number' && Number.isFinite(v) && v >= -1000 && v <= 2000,
    group: 'gameplay',
    label: 'board vertical position',
    describe: 'preferred vertical offset in px from the normal position; adjusted with the position control beside Zoom',
    control: 'none',
  },
  {
    field: 'shownThings',
    default: SHOWN_THINGS_DEFAULTS,
    valid: validShownThings,
    mergeDefaults: true,
    group: 'after-game',
    label: 'shown things',
    describe: 'which result sections appear after a game or in the score viewer',
    control: 'result-sections',
  },
  {
    field: 'playMode',
    default: 'standard',
    valid: (v) => PLAY_MODE_IDS.has(v),
    group: 'gameplay',
    label: 'play mode',
    describe: 'Standard, 3BV countdown, Angelic, Endgame drill, Trial, Short trial, Test trial, or Board lab, chosen from the other modes menu beside the three presets (Standard on the custom board is its Custom entry). Each mode stores and ranks its own results (Board lab records nothing).',
    control: 'none',
  },
  {
    field: 'boardGenerator',
    default: 'uniform',
    valid: (v) => typeof v === 'string' && BoardGenerators.SPECS.some((g) => g.id === v),
    group: 'gameplay',
    label: 'board generator',
    describe: 'the mine-placement algorithm for custom games, chosen with the Generator menu in the mode options row above the board (the menu lists them all; the three presets always use the default); each generator + parameter combination keeps its own top score lists',
    control: 'none',
  },
  {
    field: 'boardGeneratorParams',
    default: {},
    valid: (v) => BoardGenerators.validParamsBlock(v),
    group: 'gameplay',
    label: 'board generator parameters',
    describe: 'per-generator parameter overrides (an absent parameter means its default), adjusted with the Board lab\u2019s sliders',
    control: 'none',
  },
  {
    field: 'numberDisplay',
    default: 'numbers',
    valid: (v) => NUMBER_DISPLAY_CHOICES.some(([id]) => id === v),
    group: 'gameplay',
    label: 'number display',
    describe: 'how a revealed cell\u2019s adjacent-mine count is drawn: the classic digits, letters A\u2013H in the same colors, or a bare colored dot',
    control: 'choice',
    choices: NUMBER_DISPLAY_CHOICES,
  },
  {
    field: 'flagStyle',
    default: CLASSIC_FLAG.style,
    valid: (v) => FLAG_STYLE_CHOICES.some(([id]) => id === v),
    group: 'gameplay',
    label: 'flag style',
    describe: 'how a flag on a covered square is drawn; each choice is shown on a board in play',
    control: 'choice',
    choices: FLAG_STYLE_CHOICES,
  },
  {
    field: 'flagSize',
    default: CLASSIC_FLAG.sizePercent,
    valid: onScale(FLAG_SIZE_SCALE),
    group: 'gameplay',
    label: 'flag size',
    describe: 'how much of the square a flag covers, as a percent of the square\u2019s width',
    control: 'slider',
    scale: FLAG_SIZE_SCALE,
  },
  {
    field: 'flagIntensity',
    default: CLASSIC_FLAG.intensityPercent,
    valid: onScale(FLAG_INTENSITY_SCALE),
    group: 'gameplay',
    label: 'flag color strength',
    describe: 'how vivid the flag\u2019s magenta is: 100 is full-strength magenta, and lower values are paler, closer to the gray of a covered square',
    control: 'slider',
    scale: FLAG_INTENSITY_SCALE,
  },
  {
    field: 'mineStyle',
    default: 'classic',
    valid: (v) => MINE_STYLE_CHOICES.some(([id]) => id === v),
    group: 'gameplay',
    label: 'mine style',
    describe: 'how mines are drawn when a game is lost, in replays, and in help boards; each choice is shown as it looks on the board',
    control: 'choice',
    choices: MINE_STYLE_CHOICES,
  },
  {
    field: 'trialGiveOpening',
    default: false,
    valid: (v) => typeof v === 'boolean',
    group: 'gameplay',
    label: 'trial: open a starting cell',
    describe: 'each trial board begins with one predetermined cell already opened; off (default) = you make the first click on a covered board',
  },
];

// The RAM copy of the settings block (userdata 'settings').
let settings = null;

// Migration/defaulting is read-only: visiting either page never rewrites
// storage. Only known, valid fields reach RAM; object defaults and loaded
// objects are copied so editing one page cannot mutate the schema or input.
function settingsFrom(stored) {
  if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) stored = {};
  const filled = {};
  for (const s of SETTINGS_SCHEMA) {
    const raw = s.migrate ? s.migrate(stored)
      : Object.hasOwn(stored, s.field) ? stored[s.field] : s.default;
    const value = s.valid(raw) ? raw : s.default;
    filled[s.field] = structuredClone(s.mergeDefaults ? { ...s.default, ...value } : value);
  }
  return filled;
}

function saveSettings() {
  settings = settingsFrom(settings);
  if (settings.difficulty !== 'custom' && settings.playMode !== 'standard') {
    throw new Error('a preset board is played only in Standard, not ' + settings.playMode);
  }
  persistUserdata('settings', settings);
}

// Beginner, Intermediate, and Expert are each Standard with the default
// generator, and every other mode plays on the custom board (creator
// decision 2026-10-20). A block saved before then may pair a preset with
// another mode; it continues as that mode on the custom board at the
// preset's size, the board its stored history is already keyed by.
function presetModeAsCustom(block) {
  if (block.difficulty === 'custom' || block.playMode === 'standard') return block;
  const board = { ...DIFFICULTIES[block.difficulty] };
  return { ...block, difficulty: 'custom', customBoard: board,
    customBoardDraft: Object.fromEntries(Object.entries(board).map(([k, v]) => [k, String(v)])) };
}

// Invalid settings do not make game history unusable. Keep unknown fields on
// import for old migration inputs, but exports contain only the current,
// documented settings schema.
function cleanTransferredSettings(source, preserveUnknown) {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) {
    return { settings: null, skippedFields: 0 };
  }
  const cleaned = preserveUnknown ? { ...source } : {};
  let skippedFields = 0;
  for (const field of SETTINGS_SCHEMA) {
    if (!Object.hasOwn(source, field.field)) continue;
    if (field.valid(source[field.field])) cleaned[field.field] = source[field.field];
    else {
      delete cleaned[field.field];
      skippedFields++;
    }
  }
  return { settings: cleaned, skippedFields };
}

// Edits use one validated path. Object-valued preferences are replaced as a
// unit so saved data never shares mutable nested objects with a control.
function updateSettings(patch) {
  for (const [field, value] of Object.entries(patch)) {
    const definition = SETTINGS_SCHEMA.find((s) => s.field === field);
    if (!definition || !definition.valid(value)) throw new Error('invalid preference: ' + field);
  }
  Object.assign(settings, structuredClone(patch));
  saveSettings();
}

function loadSettings(got) {
  const stored = got.settings === undefined ? {} : got.settings;
  const carryStates = got.states !== undefined && !(preferenceObject(stored) && Object.hasOwn(stored, 'playerStates'));
  settings = presetModeAsCustom(settingsFrom(carryStates ? { ...stored, playerStates: got.states } : stored));
  if (got.states !== undefined) consolidatePlayerStates(settings);
}

function exportPreferences() {
  return JSON.stringify(settingsFrom(settings), null, 2);
}

function importPreferences(text) {
  const source = JSON.parse(text);
  if (!preferenceObject(source)) throw new Error('preferences must be a JSON object');
  for (const [field, value] of Object.entries(source)) {
    const definition = SETTINGS_SCHEMA.find((s) => s.field === field);
    if (!definition) throw new Error('unknown preference: ' + field);
    if (!definition.valid(value)) throw new Error('invalid preference: ' + field);
  }
  settings = presetModeAsCustom(settingsFrom({ ...settings, ...source }));
  saveSettings();
}

//-------CELL NUMBERS-------

// Draws a revealed cell's adjacent-count glyph per settings.numberDisplay
// (digits, letters A–H, or a color-only dot; the cell's nN class carries
// the color). The game page paints its board with it, and the settings
// page its choice previews; it stays here with the schema because it
// renders a setting's value.
function paintCellGlyph(el, adjacent) {
  paintCountGlyph(el, adjacent, settings.numberDisplay);
}

// The flag as the player chose it; its size comes from setFlagSize.
function chosenFlagSvg() {
  return flagSvg(settings.flagStyle, settings.flagIntensity);
}

function paintCountGlyph(el, adjacent, numberDisplay) {
  el.innerHTML = '';
  if (adjacent <= 0) return;
  if (numberDisplay === 'dots') el.innerHTML = '<span class="num-dot"></span>';
  else if (numberDisplay === 'letters') el.textContent = String.fromCharCode(64 + adjacent);
  else el.textContent = adjacent;
}

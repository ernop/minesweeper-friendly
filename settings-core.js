'use strict';

//-------PERSONAL SETTINGS (one schema, one JSON-compatible stored object)-------

// Every persistent preference belongs to SETTINGS_SCHEMA. Both pages use
// this module to load, validate, default, migrate, clone, and save the same
// flat settings object in IndexedDB userdata['settings']. History backups
// carry that exact format under 'settings'; older fields remain compatible.
// Control 'none' means the editor lives on the game page, not a second store.
// Choices and bounds live here; generator definitions come from the shared
// generators.js registry, loaded before this module on both pages.

// Play mode is a second uniqueifier next to board size: rankings and
// history keys are per (board, play mode, board generator). Trial
// results never mix with the other modes' lists. Board lab is the
// non-play mode for exploring board generation: every board appears
// already solved, nothing is recorded.
const PLAY_MODES = [
  { id: 'standard', label: 'Standard' },
  {
    id: 'pregen-10-3bv-desc',
    label: 'pregen 10 boards and order by 3BV descending, assuming auto-click in upper right',
  },
  { id: 'uniform-ng', label: 'Uniform NG' },
  { id: 'single-path-ng', label: 'Single-path NG' },
  { id: 'proof-or-die', label: 'Proof-or-die' },
  { id: 'angelic', label: 'Angelic' },
  { id: 'endgame-drill', label: 'Endgame drill' },
  { id: 'trial', label: 'Trial' },
  { id: 'short-trial', label: 'Short trial' },
  { id: 'test-trial', label: 'Test trial' },
  { id: 'board-lab', label: 'Board lab' },
];
const PLAY_MODE_IDS = new Set(PLAY_MODES.map((m) => m.id));

// Selectable running-average lengths (seconds of accumulated play); see
// the session stats section. "5m" means five minutes of played time,
// never wall time. The selector lives on the session section itself, not
// on the settings page, so experimenting with it is one click.
const SESSION_LOOKBACK_CHOICES = [30, 60, 120, 300, 900];
// Per-game aggregation uses completed games as both denominator and
// lookback unit. Five games is the direct counterpart to the default
// five-minute played-time lookback.
const SESSION_GAME_LOOKBACK_CHOICES = [1, 3, 5, 10, 20, 50];

// Selectable session-stat window lengths (minutes of accumulated play).
// Same one-click doctrine: the selector lives on the session section.
// Retention (SESSION_KEEP_MS) always covers the largest choice, so
// switching to a longer window works immediately.
const SESSION_WINDOW_CHOICES = [1, 5, 10, 15, 30, 60, 180];

// Selectable source windows for the recent-placements summary (PRODUCT.md
// "Recent placements"): [id, label, windowStartMs(nowMs)]. Like the session
// lookback, the selector lives on the summary block itself. "today
// since 6am" treats 6am as the day boundary, so before 6am it reaches back
// to yesterday's 6am rather than reporting an empty morning.
const RECENT_PLACEMENTS_WINDOWS = [
  ['today', 'today', (now) => startOfDay(now)],
  ['today6am', 'today since 6am', (now) => {
    const d = new Date(now);
    d.setHours(6, 0, 0, 0);
    if (d.getTime() > now) d.setDate(d.getDate() - 1);
    return d.getTime();
  }],
  ['past10min', 'in the past 10 min', (now) => now - 600e3],
  ['past30min', 'in the past 30 min', (now) => now - 1800e3],
  ['pastHour', 'in the past hour', (now) => now - 3600e3],
  ['past2h', 'in the past 2 hours', (now) => now - 2 * 3600e3],
  ['past4h', 'in the past 4 hours', (now) => now - 4 * 3600e3],
  ['past24h', 'in the past 24h', (now) => now - 24 * 3600e3],
  ['pastWeek', 'in the past week', (now) => startOfDay(now, 6)],
];

// Drag bounds for the left stats panel: narrow enough to get out of the
// way, wide enough for a chart to be genuinely readable, never so wide
// it could swallow the board on a laptop screen.
const METRICS_PANEL_WIDTH_MIN = 220;
const METRICS_PANEL_WIDTH_MAX = 640;

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
  recentPlacements: true,
  boardShapeTables: true,
  largestIsland: false,
  averageCharts: true,
  streak: true,
  nearStreak: true,
  nearNearStreak: false,
  relationshipCharts: true,
});

const SHOWN_THINGS_OPTIONS = [
  ['gameStats', 'game stats', 'the label/value stats beside the board'],
  ['recentPlacements', 'recent placements', 'the leading summary of top-tenth ranks earned within a chosen recent window; lifetime always shows at least its closest rank'],
  ['timeTables', 'time-window tablecharts', 'lifetime, calendar, rolling-window, and day-category rankings'],
  ['lastOneMinute', 'last 1 minute', 'the very short rolling time tablechart'],
  ['exact3BV', 'same-3BV tablechart', 'times on boards with exactly the same 3BV'],
  ['boardShapeTables', 'board-shape tablecharts', 'max number, islands, and zero-count rankings'],
  ['largestIsland', 'largest island', 'the largest-island stat and matching tablechart'],
  ['averageCharts', 'average-time charts', 'average solve time by clicks, 3BV, mouse path, board shape, click overhead, IOS, and path ratios'],
  ['streak', 'streak', 'consecutive-win ranking'],
  ['nearStreak', 'near-streak', 'win runs spanning at most one loss'],
  ['nearNearStreak', 'near-near-streak', 'win runs spanning at most two losses'],
  ['relationshipCharts', 'relationship charts', 'the raw win scatter plots at the bottom'],
];

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
  return 'fatal';
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
  ['left-panel', 'left panel'],
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

const CELL_SIZE_CHOICES = [16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 80, 96];

const SETTINGS_SCHEMA = [
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
    hint: 'a bare click into a truly unknowable pocket never kills you',
    describe: 'when you bare-click into a sealed pocket that no outside clue can ever resolve, that entry is guaranteed safe',
  },
  {
    field: 'collapseDuplicateCharts',
    default: true,
    valid: (v) => typeof v === 'boolean',
    group: 'after-game',
    label: 'collapse duplicate tablecharts',
    describe: 'when several time windows hold the exact same wins (e.g. every win this week happened today), show only the most specific chart in both the tablecharts and ranks-won summary (lifetime and past week always render); off = every window always renders its own chart',
  },
  {
    field: 'showMotionStatsDuringGame',
    default: true,
    valid: (v) => typeof v === 'boolean',
    group: 'left-panel',
    label: 'show motion stats during game',
    describe: 'the live motion panel on the left edge: mouse-dynamics values and their sparklines, recomputed once a second while you play (the panel\u2019s own \u00d7 tucks it away for the session; this switch turns it off for good)',
  },
  {
    field: 'showMotionStatsAfterGame',
    default: true,
    valid: (v) => typeof v === 'boolean',
    group: 'after-game',
    label: 'show motion stats after game ends',
    describe: 'when a game finishes, the canonical motion values, each with its over-the-game chart, inline at the bottom after the other charts',
  },
  {
    field: 'reportScope',
    default: 'fatal',
    valid: validReportScope,
    migrate: reportScopeFromStored,
    group: 'after-game',
    label: 'after each game, show me',
    describe: 'how much action analysis appears after games; fatal action only is the new-player default',
    control: 'choice',
    choices: REPORT_SCOPE_CHOICES,
  },
  {
    field: 'showSessionStats',
    default: true,
    valid: (v) => typeof v === 'boolean',
    group: 'left-panel',
    label: 'show session stats',
    describe: 'the recent-observations section at the top of the in-page left panel: mouse speed while playing, click / mistake-tagged-death / misclick / no-op-click / mine-marking / flag-removal rates, win-only unused-mark rates and their per-placed-mark share, exclusive report-category frequencies and measured magnitudes, the fastclick gap, and the game-endings percent lines; grouping uses played time for per-time rates or completed-game counts for per-game rates, while the horizontal window remains played time; changes are not assigned a cause',
  },
  {
    field: 'sessionLookbackSeconds',
    default: 300,
    valid: (v) => SESSION_LOOKBACK_CHOICES.includes(v),
    group: 'left-panel',
    label: 'session grouping length',
    describe: 'seconds of accumulated play in each running-average lookback or raw bucket; chosen with the selector on the session section itself',
    control: 'none',
  },
  {
    field: 'sessionLookbackGames',
    default: 5,
    valid: (v) => SESSION_GAME_LOOKBACK_CHOICES.includes(v),
    group: 'left-panel',
    label: 'session game grouping length',
    describe: 'completed games in each per-game running lookback or raw group; chosen with the selector on the session section itself',
    control: 'none',
  },
  {
    field: 'sessionAggregation',
    default: 'average',
    valid: (v) => v === 'average' || v === 'raw',
    group: 'left-panel',
    label: 'session grouping',
    describe: 'running average or independent raw groups, measured in played time or completed games according to the selected rate basis; chosen on the session section',
    control: 'none',
  },
  {
    field: 'sessionRateBasis',
    default: 'time',
    valid: (v) => v === 'time' || v === 'game',
    group: 'left-panel',
    label: 'session rate basis',
    describe: 'action and report-category values per played minute/second or per finished game; chosen on the session section',
    control: 'none',
  },
  {
    field: 'sessionModeScope',
    default: 'current',
    valid: (v) => v === 'current' || v === 'all',
    group: 'left-panel',
    label: 'session mode scope',
    describe: 'the exact current board/play-mode/generator history by default, or all modes together; chosen on the session section',
    control: 'none',
  },
  {
    field: 'sessionStartedAt',
    default: 0,
    valid: (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0,
    group: 'left-panel',
    label: 'session start',
    describe: 'persistent timestamp set by Clear session; older games remain in score history but stay outside session charts',
    control: 'none',
  },
  {
    field: 'sessionWindowMinutes',
    default: 60,
    valid: (v) => SESSION_WINDOW_CHOICES.includes(v),
    group: 'left-panel',
    label: 'session window',
    describe: 'minutes of accumulated play the session charts look back over; chosen with the selector on the session section itself',
    control: 'none',
  },
  {
    field: 'recentPlacementsWindow',
    default: 'today',
    valid: (v) => RECENT_PLACEMENTS_WINDOWS.some(([id]) => id === v),
    group: 'after-game',
    label: 'recent-placements window',
    describe: 'the recent window whose earned top ranks the placements summary reports; chosen with the selector on the summary itself',
    control: 'none',
  },
  {
    field: 'averageChartMode',
    default: 'average',
    valid: (v) => AVERAGE_CHART_MODES.some(([id]) => id === v),
    group: 'after-game',
    label: 'property-chart mode',
    describe: 'what the property charts plot per value: the average win time, every individual win time (the distribution), or the share of games won; chosen with the selector on the charts themselves',
    control: 'none',
  },
  {
    field: 'metricsPanelWidth',
    default: 316,
    valid: (v) => typeof v === 'number' && Number.isFinite(v) && v >= METRICS_PANEL_WIDTH_MIN && v <= METRICS_PANEL_WIDTH_MAX,
    group: 'left-panel',
    label: 'stats panel width',
    describe: 'px width of the left stats panel; set by dragging the panel\u2019s right edge, not from here',
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
    control: 'shown-things',
  },
  {
    field: 'playMode',
    default: 'standard',
    valid: (v) => PLAY_MODE_IDS.has(v),
    group: 'gameplay',
    label: 'play mode',
    describe: 'Standard, Pregen 10 by descending 3BV, Uniform NG, Single-path NG, Proof-or-die, Angelic, Endgame drill, Trial, Short trial, Test trial, or Board lab. Each mode stores and ranks its own results (Board lab records nothing).',
    control: 'none',
  },
  {
    field: 'boardGenerator',
    default: 'uniform',
    valid: (v) => typeof v === 'string' && BoardGenerators.SPECS.some((g) => g.id === v),
    group: 'gameplay',
    label: 'board generator',
    describe: 'the mine-placement algorithm, chosen with the Generator menu in the game\u2019s upper right (the menu lists them all); each generator + parameter combination keeps its own top score lists',
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
  persistUserdata('settings', settings);
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

//-------CELL ICONOGRAPHY-------

const FLAG_SVG = '<svg viewBox="0 0 16 16"><path d="M9 3 L9 8.5 L3.5 5.75 Z" fill="#ff0000"/><rect x="8.4" y="3" width="1.2" height="9" fill="#000"/><rect x="5" y="11.5" width="8" height="1.5" fill="#000"/><rect x="3.5" y="13" width="11" height="2" fill="#000"/></svg>';

const MINE_SVG_INNER = '<line x1="8" y1="1" x2="8" y2="15"/><line x1="1" y1="8" x2="15" y2="8"/><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/><circle cx="8" cy="8" r="4.6" stroke="none"/><rect x="6" y="6" width="2" height="2" fill="#ffffff" stroke="none"/>';
const MINE_SVG = '<svg viewBox="0 0 16 16" fill="#000" stroke="#000" stroke-width="1.4">' + MINE_SVG_INNER + '</svg>';
const WRONG_FLAG_SVG = '<svg viewBox="0 0 16 16" fill="#000" stroke="#000" stroke-width="1.4">' + MINE_SVG_INNER + '<path d="M2 2 L14 14 M14 2 L2 14" stroke="#ff0000" stroke-width="2"/></svg>';

// Draws a revealed cell's adjacent-count glyph per settings.numberDisplay
// (digits, letters A–H, or a color-only dot; the cell's nN class carries
// the color). Only the game page paints cells today; this stays here
// with the schema because it renders a setting's value.
function paintCellGlyph(el, adjacent) {
  el.innerHTML = '';
  if (adjacent <= 0) return;
  if (settings.numberDisplay === 'dots') el.innerHTML = '<span class="num-dot"></span>';
  else if (settings.numberDisplay === 'letters') el.textContent = String.fromCharCode(64 + adjacent);
  else el.textContent = adjacent;
}

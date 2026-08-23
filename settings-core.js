'use strict';

//-------PERSONAL SETTINGS (behavior switches, stored beside the history)-------

// Moved out of minesweeper.js on 2026-08-23 so settings.html (the full
// settings page) reads and writes the same definitions. Player-facing
// behavior switches ("settings", never "config" — that word is taken by
// the board parameters). Like GAME_RECORD_SCHEMA, this is the single
// definition of the settings block: settingsFrom fills absent fields from
// `default` (a stored block written before a setting existed simply
// predates it — absence means the player never changed it), importHistory
// validates an incoming block against `valid`, the settings page renders
// the controls from `group`/`label`/`hint`/`describe`, and exports carry
// the block under the reserved "settings" key — so the writer, the
// validator, the UI, and the documentation cannot drift apart.
//
// Some `valid` closures reference game-page globals (PLAY_MODE_IDS,
// SESSION_LOOKBACK_CHOICES, RECENT_PLACEMENTS_WINDOWS, METRICS_PANEL_WIDTH_*)
// that only minesweeper.js defines. That is deliberate: validation only
// ever runs on the game page (import), and the closures are late-bound.
// The settings page must never call a control-'none' field's valid().

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
  ['endVerdict', 'game-end verdict', 'the death judgement and Justice recap above the stats'],
  ['gameStats', 'game stats', 'the label/value stats beside the board'],
  ['timeTables', 'time-window tablecharts', 'lifetime, calendar, rolling-window, and day-category rankings'],
  ['lastOneMinute', 'last 1 minute', 'the very short rolling time tablechart'],
  ['exact3BV', 'same-3BV tablechart', 'times on boards with exactly the same 3BV'],
  ['recentPlacements', 'recent placements', 'which top-tenth ranks on the longer charts (time windows, day categories, same 3BV, board shape) were earned within a chosen recent window; lifetime always shows at least its closest rank'],
  ['boardShapeTables', 'board-shape tablecharts', 'max number, islands, and zero-count rankings'],
  ['largestIsland', 'largest island', 'the largest-island stat and matching tablechart'],
  ['averageCharts', 'average-time charts', 'average solve time by clicks, 3BV, and mouse path'],
  ['streak', 'streak', 'consecutive-win ranking'],
  ['nearStreak', 'near-streak', 'win runs spanning at most one loss'],
  ['nearNearStreak', 'near-near-streak', 'win runs spanning at most two losses'],
  ['relationshipCharts', 'relationship charts', 'the raw win scatter plots at the bottom'],
];

function validShownThings(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.entries(value).every(([key, enabled]) =>
      key in SHOWN_THINGS_DEFAULTS && typeof enabled === 'boolean');
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

const SETTINGS_SCHEMA = [
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
    describe: 'when several time windows hold the exact same wins (e.g. every win this week happened today), show only the most specific chart (lifetime and past week always render); off = every window always renders its own chart',
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
    field: 'showSessionStats',
    default: true,
    valid: (v) => typeof v === 'boolean',
    group: 'left-panel',
    label: 'show session stats',
    describe: 'the recent-observations section at the top of the in-page left panel: mouse speed while playing, click / avoidable-death / misclick / no-op-click / mine-marking / flag-removal rates, the fastclick gap, and the game-endings percent lines, each point a running average over a chosen lookback of actual play across games with wall-clock breaks removed; changes are not assigned a cause',
  },
  {
    field: 'sessionLookbackSeconds',
    default: 300,
    valid: (v) => SESSION_LOOKBACK_CHOICES.includes(v),
    group: 'left-panel',
    label: 'session running-average length',
    describe: 'seconds of accumulated play each charted session-stat point averages over (its trailing lookback \u2014 played time, never wall time); chosen with the selector on the session section itself',
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
    field: 'metricsPanelWidth',
    default: 316,
    valid: (v) => typeof v === 'number' && v >= METRICS_PANEL_WIDTH_MIN && v <= METRICS_PANEL_WIDTH_MAX,
    group: 'left-panel',
    label: 'stats panel width',
    describe: 'px width of the left stats panel; set by dragging the panel\u2019s right edge, not from here',
    control: 'none',
  },
  {
    field: 'shownThings',
    default: SHOWN_THINGS_DEFAULTS,
    valid: validShownThings,
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
    describe: 'Standard, Uniform NG, Single-path NG, Proof-or-die, Angelic, Trial, Short trial, or Test trial. Each mode stores and ranks its own results.',
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

function settingsFrom(stored) {
  const filled = {};
  for (const s of SETTINGS_SCHEMA) {
    if (s.field === 'shownThings') {
      filled[s.field] = {
        ...SHOWN_THINGS_DEFAULTS,
        ...(s.field in stored && validShownThings(stored[s.field]) ? stored[s.field] : {}),
      };
    } else {
      filled[s.field] = s.field in stored ? stored[s.field] : s.default;
    }
  }
  return filled;
}

function saveSettings() {
  persistUserdata('settings', settings);
}

//-------CELL ICONOGRAPHY (shared by the game board and the demo board)-------

const FLAG_SVG = '<svg viewBox="0 0 16 16"><path d="M9 3 L9 8.5 L3.5 5.75 Z" fill="#ff0000"/><rect x="8.4" y="3" width="1.2" height="9" fill="#000"/><rect x="5" y="11.5" width="8" height="1.5" fill="#000"/><rect x="3.5" y="13" width="11" height="2" fill="#000"/></svg>';

const MINE_SVG_INNER = '<line x1="8" y1="1" x2="8" y2="15"/><line x1="1" y1="8" x2="15" y2="8"/><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/><circle cx="8" cy="8" r="4.6" stroke="none"/><rect x="6" y="6" width="2" height="2" fill="#ffffff" stroke="none"/>';
const MINE_SVG = '<svg viewBox="0 0 16 16" fill="#000" stroke="#000" stroke-width="1.4">' + MINE_SVG_INNER + '</svg>';
const WRONG_FLAG_SVG = '<svg viewBox="0 0 16 16" fill="#000" stroke="#000" stroke-width="1.4">' + MINE_SVG_INNER + '<path d="M2 2 L14 14 M14 2 L2 14" stroke="#ff0000" stroke-width="2"/></svg>';

// Draws a revealed cell's adjacent-count glyph per settings.numberDisplay
// (digits, letters A–H, or a color-only dot; the cell's nN class carries
// the color). Shared by the game board and the settings page's demo
// board, so the demo can never drift from the real rendering.
function paintCellGlyph(el, adjacent) {
  el.innerHTML = '';
  if (adjacent <= 0) return;
  if (settings.numberDisplay === 'dots') el.innerHTML = '<span class="num-dot"></span>';
  else if (settings.numberDisplay === 'letters') el.textContent = String.fromCharCode(64 + adjacent);
  else el.textContent = adjacent;
}

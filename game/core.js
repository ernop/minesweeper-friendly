'use strict';

// Constants, the current game's state, and the page's DOM handles.
// The game/ scripts are classic scripts loaded in index.html order and
// share one global scope; this one loads first.

//-------CONSTANTS-------

// Play modes and persistent preference choices live in settings-core.js.

const LCD_MIN = -99;
const LCD_MAX = 999;
const TIMER_CAP_SECONDS = 999;
const RNG_VERSION = GameRandom.VERSION;
// One version string per board generator (generators.js); a record's
// boardVersion names the exact placement algorithm its seed replays
// through. The default generator's string predates the registry.
const BOARD_VERSION = BoardGenerators.byId(BoardGenerators.DEFAULT_ID).version;
const BOARD_VERSIONS = new Set(BoardGenerators.SPECS.map((g) => g.version));
const JUSTICE_VERSION = 'sealed-pocket-mercy-v2';
const JUSTICE_VERSIONS = new Set([
  'sealed-pocket-mercy-v1',
  JUSTICE_VERSION,
]);

// Seven-segment layout in a 13x23 viewBox. Segment -> polygon points.
const SEGMENT_POINTS = {
  A: '1,0 12,0 10,2 3,2',
  B: '13,1 13,11 11,9.5 11,3',
  C: '13,12 13,22 11,20 11,13.5',
  D: '1,23 3,21 10,21 12,23',
  E: '0,12 2,13.5 2,20 0,22',
  F: '0,1 2,3 2,9.5 0,11',
  G: '1.5,11.5 3,10.5 10,10.5 11.5,11.5 10,12.5 3,12.5',
};

const DIGIT_SEGMENTS = {
  '0': 'ABCDEF',
  '1': 'BC',
  '2': 'ABGED',
  '3': 'ABGCD',
  '4': 'FGBC',
  '5': 'AFGCD',
  '6': 'AFGEDC',
  '7': 'ABC',
  '8': 'ABCDEFG',
  '9': 'ABCFGD',
  '-': 'G',
};

// The status button shows a still dove (peace) during normal play,
// an olive branch on win, and a broken heart on loss.
const DOVE_BODY = '<path d="M6 9.5 Q6.5 5.8 10.5 6.3 Q14.5 6.8 16.5 9 Q20.5 10.5 24 9.5 L21.5 12 L23.5 14.5 Q17.5 18.5 12 17.5 Q7 16.5 6 12 Q5.6 10.6 6 9.5 Z" fill="#ffffff" stroke="#000" stroke-width="1.1"/>';
const DOVE_BEAK = '<path d="M6.2 8.8 L3 10 L6.2 11.2 Z" fill="#f0a020"/>';
const DOVE_EYE = '<circle cx="8.7" cy="8.8" r="0.75"/>';
const DOVE_WING_FOLDED = '<path d="M10.5 10.5 Q14.5 8.5 17.5 10 Q14.5 13.5 10.5 10.5 Z" fill="#dddddd" stroke="#000" stroke-width="0.9"/>';
const OLIVE_BRANCH = '<path d="M3 10.8 Q1.6 12.6 2.4 14.8" fill="none" stroke="#2e7d32" stroke-width="0.9"/><ellipse cx="1.7" cy="12.3" rx="1.4" ry="0.75" transform="rotate(-35 1.7 12.3)" fill="#43a047"/><ellipse cx="3.5" cy="13.9" rx="1.4" ry="0.75" transform="rotate(30 3.5 13.9)" fill="#43a047"/>';
const BROKEN_HEART = '<path d="M13 21.5 C5.5 15.5 4.5 9.5 8 7.3 C10.6 5.8 12.4 7.6 13 9.2 C13.6 7.6 15.4 5.8 18 7.3 C21.5 9.5 20.5 15.5 13 21.5 Z" fill="#d32f2f" stroke="#000" stroke-width="1"/><path d="M13 8.8 L11.6 11.5 L13.8 14 L12 17 L13.4 19.5" fill="none" stroke="#ffffff" stroke-width="1.3"/>';

const FACE_SVGS = {
  smile: faceSvg(DOVE_BODY + DOVE_WING_FOLDED + DOVE_EYE + DOVE_BEAK),
  dead: faceSvg(BROKEN_HEART),
  cool: faceSvg(DOVE_BODY + DOVE_WING_FOLDED + DOVE_EYE + DOVE_BEAK + OLIVE_BRANCH),
};

// FLAG_SVG / MINE_SVG / WRONG_FLAG_SVG live in settings-core.js with the
// rest of the cell iconography.

function faceSvg(features) {
  return '<svg viewBox="0 0 26 26">' + features + '</svg>';
}

//-------CORE STATE-------

let config = { ...DIFFICULTIES.beginner };
let cells = [];            // {mine, revealed, flagged, adjacent}
let cellElements = [];
let gameState = 'ready';   // ready | playing | won | lost | lab (Board lab display)
let minesPlaced = false;
let flagsCount = 0;
let revealedCount = 0;
let startTime = 0;
let finalTimeMs = 0;
let timerInterval = null;
let clickCount = 0;    // board clicks that changed something (reveal/flag/chord)
let chordClicks = 0;   // accepted chords among those (the chord share numerator)
let wastedClicks = 0;  // board clicks that changed nothing
let inputActionCount = 0; // every accepted board input, including no-ops
let misclicks = 0;     // board-changing actions contradicted by visible facts
let flagsPlaced = 0;   // flags the player placed (removals don't subtract)
let flagsRemoved = 0;  // flag states the player turned off; each placement
                       // and each removal is a separate board-changing click
let unusedCorrectFlags = 0; // win-only correct flags never consumed by a chord
let activeFlagEpisodes = new Map(); // cell index -> placement evaluation/use state
let flagEpisodes = []; // every placement, retained until the outcome is known
const LIKELY_MISCLICK_MAX_MS = 1000;
let actionEvaluations = []; // fatal action plus every earlier measured mistake
let gameSeed = null;    // 128-bit seed for placement and Justice redraws
let gameRandom = null;  // the one deterministic random stream for this game
let trialSession = null;   // userdata 'trial'; null when none stored
let trialPresentation = null; // current trial board, or null
let lastTrialReview = null;   // ended session waiting to be shown
let pregenBatch = null;       // ten seed-backed candidates in descending 3BV order
let pregenCurrent = null;     // rank/3BV of the candidate currently being played

// Press-preview state (left button held down)
let leftDown = false;
let pressedIndices = [];

// Mouse path length during the run (px). The position is tracked at all
// times so the first in-game segment starts from wherever the cursor
// already is, but distance only accumulates while playing.
let mousePathPx = 0;
let lastMouseX = null;
let lastMouseY = null;

//-------DOM-------

const boardElement = document.getElementById('board');
const faceButton = document.getElementById('face-button');
const mineCounter = document.getElementById('mine-counter');
const timerDisplay = document.getElementById('timer');
const resultSummary = document.getElementById('result-summary');
const resultStats = document.getElementById('result-stats');
const resultAnalysis = document.getElementById('result-analysis');
const pregenCharts = document.getElementById('pregen-charts');
const resultRanks = document.getElementById('result-ranks');
const gameArea = document.getElementById('game-area');
const gameFrame = document.getElementById('game-frame');
const scoresNav = document.getElementById('scores-nav');
const resultsBox = document.getElementById('results');
const gameDataColumn = document.getElementById('game-data-column');
const mainElement = document.querySelector('main');
const pageLayout = document.getElementById('page-layout');
const gameSidebar = document.getElementById('game-sidebar');
const gameSidebarButton = document.getElementById('game-sidebar-button');
const gameSidebarClose = document.getElementById('game-sidebar-close');
const topRight = document.getElementById('top-right');
const difficultyTabs = document.getElementById('difficulty-tabs');
const customForm = document.getElementById('custom-form');
const justiceLive = document.getElementById('justice-live');
const boardPositionButton = document.getElementById('board-position-btn');
const boardPositionPanel = document.getElementById('board-position-panel');
const boardPositionX = document.getElementById('board-position-x');
const boardPositionXNumber = document.getElementById('board-position-x-number');
const boardPositionY = document.getElementById('board-position-y');
const boardPositionYNumber = document.getElementById('board-position-y-number');
const boardPositionDragSurface = document.getElementById('board-position-drag-surface');

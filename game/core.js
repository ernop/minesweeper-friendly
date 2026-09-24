'use strict';

// The current game's state and the page's shared DOM handles. The game/
// scripts are classic scripts loaded in index.html order and share one
// global scope; this one loads first.

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
let actionEvaluations = []; // fatal action plus every earlier measured mistake
let gameSeed = null;    // 128-bit seed for placement and Justice redraws
let gameRandom = null;  // the one deterministic random stream for this game
// Frozen per board at newGame so a mid-board settings import cannot make
// the finished record disagree with the placement that actually ran.
let gameGenerator = null;
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
// The status line beside the backup controls carries every area's
// progress and failure messages.
const backupStatus = document.getElementById('backup-status');

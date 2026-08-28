'use strict';

//-------CONSTANTS-------

const DIFFICULTIES = {
  beginner: { width: 9, height: 9, mines: 10 },
  intermediate: { width: 16, height: 16, mines: 40 },
  expert: { width: 30, height: 16, mines: 99 },
};

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
  { id: 'trial', label: 'Trial' },
  { id: 'short-trial', label: 'Short trial' },
  { id: 'test-trial', label: 'Test trial' },
  { id: 'board-lab', label: 'Board lab' },
];
const PLAY_MODE_IDS = new Set(PLAY_MODES.map((m) => m.id));

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
let wastedClicks = 0;  // board clicks that changed nothing
let inputActionCount = 0; // every accepted board input, including no-ops
let misclicks = 0;     // board-changing actions contradicted by visible facts
let flagsPlaced = 0;   // flags the player placed (removals don't subtract)
let flagsRemoved = 0;  // flag states the player turned off; each placement
                       // and each removal is a separate board-changing click
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
const resultsBox = document.getElementById('results');
const mainElement = document.querySelector('main');
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
const boardPositionNote = document.getElementById('board-position-note');
const boardPositionDragSurface = document.getElementById('board-position-drag-surface');

//-------PERSISTENT BOARD POSITION (pure constraint solver)-------

function boardPositionRect(rect, x, y) {
  const width = rect.width === undefined ? rect.right - rect.left : rect.width;
  const height = rect.height === undefined ? rect.bottom - rect.top : rect.height;
  return {
    left: rect.left + x,
    top: rect.top + y,
    right: rect.left + x + width,
    bottom: rect.top + y + height,
    width,
    height,
  };
}

function boardPositionOverlapArea(a, b) {
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
    * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}

function boardPositionLayoutRect(rect, scrollX, scrollY, fixedAtViewportOrigin) {
  return boardPositionRect(
    rect,
    fixedAtViewportOrigin ? 0 : scrollX,
    fixedAtViewportOrigin ? 0 : scrollY);
}

// Find the collision-free offset nearest the player's preference. Horizontal
// bounds keep a board that fits inside the available main column; oversized
// boards retain their natural overflow. There is deliberately no lower bound:
// positive Y expands page flow, so a deeply lowered board remains scrollable.
function constrainBoardOffset(base, bounds, exclusions, preferredX, preferredY) {
  const gap = 8;
  const availableWidth = Math.max(0, bounds.right - bounds.left);
  const fitsHorizontally = base.width <= availableWidth;
  const minX = bounds.left - base.left;
  const maxX = bounds.right - base.right;
  const clampX = (x) => fitsHorizontally ? Math.max(minX, Math.min(maxX, x)) : x;
  const minY = bounds.top - base.top;
  const clampY = (y) => Math.max(minY, y);
  const xCandidates = [clampX(preferredX)];
  const yCandidates = [clampY(preferredY)];

  for (const exclusion of exclusions) {
    xCandidates.push(clampX(exclusion.left - gap - base.right));
    xCandidates.push(clampX(exclusion.right + gap - base.left));
    yCandidates.push(clampY(exclusion.top - gap - base.bottom));
    yCandidates.push(clampY(exclusion.bottom + gap - base.top));
  }

  let best = null;
  for (const x of new Set(xCandidates.map(Math.round))) {
    for (const y of new Set(yCandidates.map(Math.round))) {
      const placed = boardPositionRect(base, x, y);
      const overlap = exclusions.reduce(
        (sum, exclusion) => sum + boardPositionOverlapArea(placed, exclusion), 0);
      const distance = (x - preferredX) ** 2 + (y - preferredY) ** 2;
      const score = overlap * 1e9 + distance;
      if (best === null || score < best.score) best = { x, y, score, overlap };
    }
  }
  return { x: best.x, y: best.y, adjusted: best.x !== preferredX || best.y !== preferredY };
}

//-------PERSISTENT BOARD POSITION END-------

let appliedBoardOffsetX = 0;
let appliedBoardOffsetY = 0;
let boardLayoutFrame = null;

// Layout decisions belong to the page, not to the current scroll position.
// Ordinary elements therefore use stable document coordinates. The top-right
// chrome is fixed on wide screens, but its no-overlap footprint is treated as
// where it sits at scroll zero so scrolling can never make content chase it.
function boardPageRect(element) {
  return boardPositionLayoutRect(
    element.getBoundingClientRect(), window.scrollX, window.scrollY, false);
}

function boardChromeLayoutRect() {
  const rect = topRight.getBoundingClientRect();
  return boardPositionLayoutRect(
    rect,
    window.scrollX,
    window.scrollY,
    getComputedStyle(topRight).position === 'fixed');
}

function syncBoardPositionInputs() {
  const x = String(settings.boardOffsetX);
  const y = String(settings.boardOffsetY);
  boardPositionX.value = x;
  boardPositionXNumber.value = x;
  boardPositionY.value = y;
  boardPositionYNumber.value = y;
}

// The editor itself is fixed to the least occupied viewport corner. It moves
// out of the board's way instead of becoming another constraint that changes
// the position the player is trying to set.
function placeBoardPositionPanel() {
  if (boardPositionPanel.hidden) return;
  if (window.innerWidth <= 720) {
    boardPositionPanel.style.removeProperty('top');
    boardPositionPanel.style.removeProperty('right');
    boardPositionPanel.style.removeProperty('bottom');
    boardPositionPanel.style.removeProperty('left');
    return;
  }
  const margin = 14;
  const width = boardPositionPanel.offsetWidth;
  const height = boardPositionPanel.offsetHeight;
  const centerX = Math.max(margin, Math.round((window.innerWidth - width) / 2));
  const middleY = Math.max(margin, Math.round((window.innerHeight - height) / 2));
  const rightX = Math.max(margin, window.innerWidth - margin - width);
  const bottomY = Math.max(margin, window.innerHeight - margin - height);
  const candidates = [
    [margin, margin],
    [centerX, margin],
    [rightX, margin],
    [margin, middleY],
    [rightX, middleY],
    [margin, bottomY],
    [centerX, bottomY],
    [rightX, bottomY],
  ];
  const obstacles = [
    gameFrame.getBoundingClientRect(),
    topRight.getBoundingClientRect(),
    difficultyTabs.getBoundingClientRect(),
  ];
  if (!metricsPanel.hidden) obstacles.push(metricsPanel.getBoundingClientRect());
  if (resultSummary.textContent !== '' || resultStats.textContent !== '') {
    obstacles.push(resultsBox.getBoundingClientRect());
  }
  let best = null;
  for (const [left, top] of candidates) {
    const rect = {
      left, top, right: left + width, bottom: top + height, width, height,
    };
    const overlap = obstacles.reduce(
      (sum, obstacle) => sum + boardPositionOverlapArea(rect, obstacle), 0);
    if (best === null || overlap < best.overlap) best = { left, top, overlap };
  }
  boardPositionPanel.style.left = best.left + 'px';
  boardPositionPanel.style.top = best.top + 'px';
  boardPositionPanel.style.right = 'auto';
  boardPositionPanel.style.bottom = 'auto';
}

function applyBoardPosition() {
  if (settings === null) return;
  const current = boardPageRect(gameFrame);
  const base = boardPositionRect(current, -appliedBoardOffsetX, -appliedBoardOffsetY);
  const mainRect = boardPageRect(mainElement);
  const tabsRect = boardPageRect(difficultyTabs);
  const viewportRight = Math.max(8, window.innerWidth - 8);
  let left = Math.max(8, mainRect.left + 8);
  let right = Math.min(viewportRight, mainRect.right - 8);
  if (right < left) {
    left = mainRect.left;
    right = mainRect.right;
  }
  const exclusions = [];
  const chromeRect = boardChromeLayoutRect();
  if (chromeRect.width > 0 && chromeRect.height > 0) exclusions.push(chromeRect);
  const placed = constrainBoardOffset(base, {
    left,
    right,
    top: tabsRect.bottom + 8,
  }, exclusions, settings.boardOffsetX, settings.boardOffsetY);

  appliedBoardOffsetX = placed.x;
  appliedBoardOffsetY = placed.y;
  gameArea.style.setProperty('--board-position-applied-x', placed.x + 'px');
  gameArea.style.setProperty('--board-position-applied-y', placed.y + 'px');
  gameArea.style.setProperty(
    '--board-position-flow-clearance', Math.max(0, placed.y) + 'px');

  boardPositionDragSurface.style.left = gameFrame.offsetLeft + 'px';
  boardPositionDragSurface.style.top = gameFrame.offsetTop + 'px';
  boardPositionDragSurface.style.width = gameFrame.offsetWidth + 'px';
  boardPositionDragSurface.style.height = gameFrame.offsetHeight + 'px';
  placeBoardPositionPanel();
  if (!boardPositionPanel.hidden) {
    boardPositionNote.textContent = placed.adjusted
      ? 'Saved position is temporarily adjusted to keep required controls clear.'
      : 'Drag the highlighted board, or use its arrow keys. Shift moves 10 px.';
  }
}

function syncBoardLayout() {
  applyBoardPosition();
  syncResultsPlacement();
  syncJusticePlacement();
  syncResultClearance();
  recordLayoutIfMoved();
}

function scheduleBoardLayout() {
  if (boardLayoutFrame !== null) return;
  boardLayoutFrame = requestAnimationFrame(() => {
    boardLayoutFrame = null;
    syncBoardLayout();
  });
}

// Keep the compact stats flush with the available main column's right edge
// when that gutter is wide enough. With the metrics panel open (or on a
// narrow viewport), put them below the board instead of covering it.
// If the fixed top-right controls occupy the side layout's horizontal strip,
// start the stats below them.
function syncResultsPlacement() {
  resultsBox.style.removeProperty('--results-top-clearance');
  if (gameArea.classList.contains('trial-no-board')
      || (resultSummary.textContent === '' && resultStats.textContent === '')) {
    gameArea.classList.remove('results-below-board');
    return;
  }

  const frameRect = document.getElementById('game-frame').getBoundingClientRect();
  const mainRect = mainElement.getBoundingClientRect();
  const resultsWidth = resultsBox.getBoundingClientRect().width;
  const rightGutter = mainRect.right - frameRect.right;
  const belowBoard = rightGutter < resultsWidth + 16;
  gameArea.classList.toggle('results-below-board', belowBoard);
  if (belowBoard) return;

  const chromeRect = boardChromeLayoutRect();
  const resultRect = boardPageRect(resultsBox);
  const sharesRightStrip = resultRect.right > chromeRect.left - 8
    && resultRect.left < chromeRect.right + 8;
  if (sharesRightStrip && chromeRect.bottom + 8 > resultRect.top) {
    resultsBox.style.setProperty('--results-top-clearance',
      Math.ceil(chromeRect.bottom - resultRect.top + 8) + 'px');
  }
}

function syncJusticePlacement() {
  justiceLive.classList.remove('justice-left', 'justice-below');
  if (justiceLive.childElementCount === 0) return;
  const mainRect = boardPageRect(mainElement);
  const chromeRect = boardChromeLayoutRect();
  const resultsRect = boardPageRect(resultsBox);
  const resultsVisible = resultSummary.textContent !== '' || resultStats.textContent !== '';
  const collides = (rect) => rect.left < mainRect.left + 8 || rect.right > mainRect.right - 8
    || boardPositionOverlapArea(rect, chromeRect) > 0
    || (resultsVisible && boardPositionOverlapArea(rect, resultsRect) > 0);

  if (!collides(boardPageRect(justiceLive))) return;
  justiceLive.classList.add('justice-left');
  if (!collides(boardPageRect(justiceLive))) return;
  justiceLive.classList.remove('justice-left');
  justiceLive.classList.add('justice-below');
}

// The right-side stats are out of flow so they cannot move the board. If
// they extend below it, the separate report (or rankings when no report is
// shown) shifts down by the exact overhang.
function syncResultClearance() {
  pregenCharts.style.removeProperty('--result-overflow');
  resultAnalysis.style.removeProperty('--result-overflow');
  resultRanks.style.removeProperty('--result-overflow');
  if (gameArea.classList.contains('trial-no-board')) {
    return;
  }
  const floatingBottom = Math.max(
    resultsBox.getBoundingClientRect().bottom,
    justiceLive.childElementCount > 0
      ? justiceLive.getBoundingClientRect().bottom : -Infinity);
  const extra = Math.max(0,
    Math.ceil(floatingBottom - gameArea.getBoundingClientRect().bottom));
  if (extra > 0) {
    const target = !pregenCharts.hidden ? pregenCharts
      : resultAnalysis.childElementCount > 0 ? resultAnalysis : resultRanks;
    target.style.setProperty('--result-overflow', extra + 'px');
  }
}

//-------LCD DISPLAYS-------

function buildLcd(container) {
  for (let d = 0; d < 3; d++) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 13 23');
    for (const [name, points] of Object.entries(SEGMENT_POINTS)) {
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', points);
      poly.dataset.segment = name;
      svg.appendChild(poly);
    }
    container.appendChild(svg);
  }
}

function setLcd(container, value) {
  const clamped = Math.max(LCD_MIN, Math.min(LCD_MAX, value));
  if (container.dataset.value === String(clamped)) return;
  container.dataset.value = String(clamped);
  const text = clamped < 0
    ? '-' + String(-clamped).padStart(2, '0')
    : String(clamped).padStart(3, '0');
  const digits = container.querySelectorAll('svg');
  for (let d = 0; d < 3; d++) {
    const litSegments = DIGIT_SEGMENTS[text[d]];
    for (const poly of digits[d].querySelectorAll('polygon')) {
      poly.classList.toggle('on', litSegments.includes(poly.dataset.segment));
    }
  }
}

//-------BOARD HELPERS-------

function neighbors(index) {
  const x = index % config.width;
  const y = (index - x) / config.width;
  const result = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= config.width || ny < 0 || ny >= config.height) continue;
      result.push(ny * config.width + nx);
    }
  }
  return result;
}

// Mines are placed on the first reveal so that cell is never a mine
// (first-click safety, as on minesweeper.online standard mode).
function applyMineMap(mineAt) {
  if (mineAt.length !== cells.length) throw new Error('mine map does not match the board');
  for (let i = 0; i < cells.length; i++) cells[i].mine = !!mineAt[i];
  for (let i = 0; i < cells.length; i++) {
    cells[i].adjacent = cells[i].mine ? 0 : neighbors(i).filter((n) => cells[n].mine).length;
  }
  minesPlaced = true;
}

//-------BOARD GENERATORS (registry in generators.js)-------

// Which modes place mines with the selected board generator. Single-path
// NG carves corridor boards (its placer is the mode itself), and trial
// sessions build their fixed identities with the default generator.
function generatorAppliesToMode(mode) {
  return mode !== 'single-path-ng' && !Trial.isPlayMode(mode);
}

function boardLabActive() {
  return settings.playMode === 'board-lab';
}

function pregenActive() {
  return settings.playMode === 'pregen-10-3bv-desc';
}

// The generator the current settings select for the current mode: the
// chosen id with its stored parameter overrides filled from the schema
// defaults, or the default generator where the choice does not apply.
function activeGenerator() {
  if (!generatorAppliesToMode(settings.playMode)) return BoardGenerators.uniformGenerator();
  const id = settings.boardGenerator;
  return { id, params: BoardGenerators.paramsFrom(id, settings.boardGeneratorParams[id]) };
}

// Frozen per board at newGame so a mid-board settings import cannot make
// the finished record disagree with the placement that actually ran.
let gameGenerator = null;

function placeMines(safeIndex) {
  applyMineMap(BoardGenerators.place(
    gameGenerator, config.width, config.height, config.mines, safeIndex, gameRandom));
}

function ngAttempts() {
  const n = config.width * config.height;
  if (n <= 81) return 800;
  if (n <= 256) return 400;
  return 250;
}

function placeMinesForPlayMode(safeIndex) {
  const mode = settings.playMode;
  if (mode === 'standard' || mode === 'pregen-10-3bv-desc' || mode === 'angelic') {
    placeMines(safeIndex);
    return;
  }
  if (Trial.isPlayMode(mode)) {
    if (trialPresentation === null) throw new Error('trial presentation missing at placement');
    applyMineMap(trialPresentation.mines);
    return;
  }
  const pred = mode === 'uniform-ng' ? (r) => r.uniform
    : mode === 'single-path-ng' ? (r) => r.singlePath
    : (r) => r.solved;
  // NG modes generate-and-reject over the chosen generator's candidates,
  // so a colored-noise NG board is noise-shaped AND fully solvable.
  const placer = mode === 'single-path-ng'
    ? Solver.tunnelPlacement
    : (w, h, m, safe, rng) => BoardGenerators.place(gameGenerator, w, h, m, safe, rng);
  backupStatus.textContent = 'generating ' + playModeLabel() + ' board\u2026';
  let got;
  try {
    got = Solver.generate(
      config.width, config.height, config.mines, safeIndex, gameRandom, pred, ngAttempts(), placer);
  } catch (err) {
    backupStatus.textContent = err.message;
    throw err;
  }
  applyMineMap(got.mineAt);
  backupStatus.textContent = '';
}

//-------GAME FLOW-------

function newGame() {
  if (Trial.isPlayMode(settings.playMode) && trialIsActive()
      && (trialSession.width !== config.width
        || trialSession.height !== config.height
        || trialSession.mines !== config.mines
        || trialSessionPlayMode() !== settings.playMode)) {
    abandonTrial();
  }
  syncTrialBoardVisibility(trialPhase());
  // A restart mid-game abandons the board (no record, no trace), but the
  // time played and the motion were real: close the session play interval
  // so the session stats keep them. Useful-press gaps never span games.
  sessionPlayEnd();
  sessionLastUsefulPressAt = null;
  gameLastUsefulPressAt = null;
  gameFastclickGaps = [];
  actionEvaluations = [];
  justiceDetails = [];
  gameState = 'ready';
  minesPlaced = false;
  justiceEnabledForGame = null;
  flagsCount = 0;
  revealedCount = 0;
  clickCount = 0;
  wastedClicks = 0;
  inputActionCount = 0;
  misclicks = 0;
  flagsPlaced = 0;
  flagsRemoved = 0;
  finalTimeMs = 0;
  startTime = 0;
  mousePathPx = 0;
  justiceEvents = 0;
  guessEvents = [];
  oddsFailed = false;
  gameSeed = GameRandom.createSeed();
  gameRandom = GameRandom.fromSeed(gameSeed);
  gameGenerator = activeGenerator();
  justiceLive.textContent = '';
  clearInterval(timerInterval);
  timerInterval = null;
  leftDown = false;
  pressedIndices = [];

  cells = [];
  for (let i = 0; i < config.width * config.height; i++) {
    cells.push({ mine: false, revealed: false, flagged: false, adjacent: 0 });
  }

  document.documentElement.style.setProperty('--board-width', config.width);
  boardElement.textContent = '';
  cellElements = [];
  for (let i = 0; i < cells.length; i++) {
    const el = document.createElement('div');
    el.className = 'cell hidden';
    el.dataset.index = i;
    boardElement.appendChild(el);
    cellElements.push(el);
  }

  // Apply the saved preference after the rebuilt board has its final size,
  // but before beginTrace snapshots its initial viewport geometry.
  applyBoardPosition();
  beginTrace();
  beginMusicSampling();

  setLcd(mineCounter, config.mines);
  setLcd(timerDisplay, 0);
  setFace('smile');
  renderedResult = null;
  finalMotion = null;
  // The board rebuild above removed the path overlay's canvas node; the
  // controls hide with the finished game they belonged to.
  pathCanvas = null;
  replayFinishedCells = null;
  replayEnabled = false;
  replayStep = 0;
  renderPathView();
  resultSummary.textContent = '';
  resultStats.textContent = '';
  resultAnalysis.textContent = '';
  resultRanks.textContent = '';
  resultsBox.style.removeProperty('--results-top-clearance');
  syncResultClearance();
  if (Trial.isPlayMode(settings.playMode) && trialIsActive()) setupTrialBoard();
  else trialPresentation = null;
  if (pregenActive()) setupPregenBoard();
  else pregenCurrent = null;
  if (boardLabActive()) buildLabBoard();
  document.title = 'Minesweeper - ' + playModeLabel();
  renderTrialChrome();
  renderPregenChrome();
  renderPregenCharts();
  syncLabChrome();
}

//-------PREGENERATED HIGH-3BV MODE-------

const PREGEN_BATCH_SIZE = 10;

function pregenBatchKey() {
  return boardKey() + BoardGenerators.keySuffix(gameGenerator);
}

function buildPregenBatch(key) {
  backupStatus.textContent = 'generating and ranking 10 boards by 3BV\u2026';
  const seeds = [];
  for (let i = 0; i < PREGEN_BATCH_SIZE; i++) seeds.push(GameRandom.createSeed());
  let boards;
  try {
    boards = Pregen.rankSeeds({
      seeds,
      width: config.width,
      height: config.height,
      mineCount: config.mines,
      safeIndex: config.width - 1,
      generator: gameGenerator,
      randomFromSeed: GameRandom.fromSeed,
      place: BoardGenerators.place,
    });
  } catch (err) {
    backupStatus.textContent = 'board generation failed: ' + err.message;
    throw err;
  }
  pregenBatch = { key, boards, next: 0, startedAt: Date.now(), results: [] };
  backupStatus.textContent = '';
}

function setupPregenBoard() {
  const key = pregenBatchKey();
  if (pregenBatch === null || pregenBatch.key !== key
      || pregenBatch.next >= pregenBatch.boards.length) {
    buildPregenBatch(key);
  }
  const candidate = pregenBatch.boards[pregenBatch.next];
  pregenBatch.next++;
  pregenCurrent = {
    rank: pregenBatch.next,
    total: pregenBatch.boards.length,
    bv3: candidate.bv3,
  };

  // Regenerate the chosen candidate from its own seed. This consumes exactly
  // the placement portion of the stream, leaving Justice redraws replayable.
  gameSeed = candidate.seed;
  gameRandom = GameRandom.fromSeed(gameSeed);
  const opening = config.width - 1;
  const mineAt = BoardGenerators.place(
    gameGenerator, config.width, config.height, config.mines, opening, gameRandom);
  if (Pregen.board3BV(config.width, config.height, mineAt) !== candidate.bv3) {
    throw new Error('pregenerated board changed while being dealt');
  }
  applyMineMap(mineAt);
  floodReveal(opening);
  gameState = 'playing';
  justiceEnabledForGame = justiceAppliesToMode() && settings.justUniverse;
  startTimer();
  checkWin();
}

function renderPregenChrome() {
  const box = document.getElementById('pregen-progress');
  box.hidden = !pregenActive() || pregenCurrent === null;
  box.textContent = box.hidden
    ? ''
    : pregenCurrent.rank + ' / ' + pregenCurrent.total + ' \u00b7 3BV ' + pregenCurrent.bv3;
}

function buildPregenProgressTable(rows) {
  const panel = document.createElement('section');
  panel.className = 'pregen-progress-panel';
  const heading = document.createElement('h4');
  heading.textContent = 'challenge progress';
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const label of ['run', '3BV', 'time']) {
    const cell = document.createElement('th');
    cell.textContent = label;
    headRow.appendChild(cell);
  }
  head.appendChild(headRow);
  const body = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    if (row.outcome === 'loss') tr.classList.add('loss');
    if (row.latest) tr.classList.add('me');
    const run = document.createElement('td');
    run.textContent = String(row.run);
    const bv3 = document.createElement('td');
    bv3.textContent = String(row.bv3);
    const time = document.createElement('td');
    time.textContent = (row.timeMs / 1000).toFixed(3) + 's';
    if (row.outcome === 'loss') {
      const outcome = document.createElement('span');
      outcome.className = 'pregen-progress-outcome';
      outcome.textContent = ' loss';
      time.appendChild(outcome);
    }
    tr.append(run, bv3, time);
    body.appendChild(tr);
  }
  table.append(head, body);
  panel.append(heading, table);
  return panel;
}

function buildPregenChartPanel(label, wins, referenceMs) {
  const panel = document.createElement('section');
  panel.className = 'pregen-chart-panel';
  const heading = document.createElement('h4');
  heading.textContent = label;
  panel.appendChild(heading);
  if (wins.length < 2) {
    const waiting = document.createElement('p');
    waiting.className = 'pregen-chart-waiting';
    waiting.textContent = wins.length + ' / 2 wins needed';
    panel.appendChild(waiting);
    return panel;
  }

  const latest = wins.reduce((a, b) => a.endedAt > b.endedAt ? a : b);
  const byTimeThenEnd = [...wins]
    .sort((a, b) => a.timeMs - b.timeMs || a.endedAt - b.endedAt);
  const rank = byTimeThenEnd.indexOf(latest) + 1;
  const pairs = wins.map((record) => [record.bv3, secondsOf(record)]);
  panel.appendChild(buildScatter(
    wins,
    latest,
    (record) => record.bv3,
    secondsOf,
    '3BV',
    'time',
    rank + ' ' + label,
    (record) => ageInfo(referenceMs, record.endedAt),
    {
      trimY: true,
      trendLines: trendLinesFor([], pairs),
    },
  ));
  return panel;
}

function renderPregenCharts() {
  pregenCharts.textContent = '';
  const visible = pregenActive() && pregenBatch !== null && history !== null;
  pregenCharts.hidden = !visible;
  if (!visible) {
    syncResultClearance();
    return;
  }
  const records = history[modeKey()] || [];
  const scoped = Pregen.chartWins(
    records, pregenBatch.startedAt, startOfDay(Date.now()));
  const progress = Pregen.progressRows(pregenBatch.results);
  const referenceMs = Date.now();
  pregenCharts.append(
    buildPregenProgressTable(progress),
    buildPregenChartPanel('this challenge', scoped.challenge, referenceMs),
    buildPregenChartPanel('whole day', scoped.today, referenceMs),
  );
  syncResultClearance();
}

//-------BOARD LAB (the non-play mode for exploring board generation)-------

// The lab shows every board as if it had just been solved: safe cells
// open with their numbers, mines flagged, counters at their win values.
// No timer runs, no input reaches the cells, and nothing is recorded.
function buildLabBoard() {
  applyMineMap(BoardGenerators.place(
    gameGenerator, config.width, config.height, config.mines, null, gameRandom));
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].mine) {
      cells[i].flagged = true;
    } else {
      cells[i].revealed = true;
      revealedCount++;
    }
    updateCell(i);
  }
  flagsCount = config.mines;
  setLcd(mineCounter, 0);
  gameState = 'lab';
}

// The lab panel's slider rows are rebuilt only when the generator
// changes: a regeneration mid-drag must not replace the slider element
// under the pointer.
let labPanelGeneratorId = null;
let labControls = null;

function labSliderRow(labelText, title, min, max, step, value, onInput) {
  const row = document.createElement('label');
  row.className = 'lab-row';
  const name = document.createElement('span');
  name.className = 'lab-name';
  name.textContent = labelText;
  if (title !== '') name.title = title;
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.value = String(value);
  const readout = document.createElement('span');
  readout.className = 'lab-value';
  readout.textContent = String(value);
  slider.addEventListener('input', () => {
    readout.textContent = slider.value;
    onInput(Number(slider.value));
  });
  row.append(name, slider, readout);
  return { row, slider, readout };
}

// Classic winmine constraint, same as the custom form: mines fit with at
// least a 3x3 opening's worth of space (floor 1 for one-row boards).
function labMaxMines() {
  return Math.max(1, (config.width - 1) * (config.height - 1));
}

function buildLabPanel() {
  const panel = document.getElementById('board-lab-panel');
  panel.textContent = '';
  labControls = { params: {} };

  const note = document.createElement('p');
  note.id = 'board-lab-note';
  note.textContent = 'Every board is shown already solved. Nothing here is timed or recorded.';
  panel.appendChild(note);

  const sizeChanged = () => {
    if (config.mines > labMaxMines()) config.mines = labMaxMines();
    syncDifficultyTabs();
    newGame();
  };
  labControls.width = labSliderRow('width', '', 8, 100, 1, config.width, (v) => {
    config.width = v;
    sizeChanged();
  });
  labControls.height = labSliderRow('height', '', 1, 100, 1, config.height, (v) => {
    config.height = v;
    sizeChanged();
  });
  labControls.mines = labSliderRow('mines', '', 1, labMaxMines(), 1, config.mines, (v) => {
    config.mines = v;
    syncDifficultyTabs();
    newGame();
  });
  panel.append(labControls.width.row, labControls.height.row, labControls.mines.row);

  const spec = BoardGenerators.byId(settings.boardGenerator);
  const params = BoardGenerators.paramsFrom(spec.id, settings.boardGeneratorParams[spec.id]);
  for (const p of spec.params) {
    const control = labSliderRow(p.label, p.describe, p.min, p.max, p.step, params[p.key], (v) => {
      if (!(spec.id in settings.boardGeneratorParams)) {
        settings.boardGeneratorParams[spec.id] = {};
      }
      settings.boardGeneratorParams[spec.id][p.key] = v;
      saveSettings();
      newGame();
    });
    labControls.params[p.key] = control;
    panel.appendChild(control.row);
  }

  const remake = document.createElement('button');
  remake.type = 'button';
  remake.id = 'board-lab-new';
  remake.textContent = 'make new board';
  remake.addEventListener('click', () => newGame());
  panel.appendChild(remake);
  labPanelGeneratorId = spec.id;
}

// Size sliders track config (the difficulty tabs also change it); param
// sliders are the only writers of their values, so they are not re-set
// here — a generator change or settings import rebuilds the panel.
function syncLabPanelValues() {
  for (const [control, value] of [
    [labControls.width, config.width],
    [labControls.height, config.height],
    [labControls.mines, config.mines],
  ]) {
    control.slider.value = String(value);
    control.readout.textContent = String(value);
  }
  labControls.mines.slider.max = String(labMaxMines());
}

function syncLabChrome() {
  const panel = document.getElementById('board-lab-panel');
  const lab = boardLabActive();
  document.getElementById('scores-nav').hidden = lab;
  panel.hidden = !lab;
  if (!lab) {
    panel.textContent = '';
    labPanelGeneratorId = null;
    labControls = null;
    return;
  }
  if (labPanelGeneratorId !== settings.boardGenerator) buildLabPanel();
  else syncLabPanelValues();
}

function setupTrialBoard() {
  if (!trialIsActive()) {
    trialPresentation = null;
    return;
  }
  if (trialSession.nextIndex >= Trial.gameCount(trialSession)) {
    endTrial('completed');
    trialPresentation = null;
    return;
  }
  trialPresentation = Trial.presentation(trialSession, gameRandom);
  applyMineMap(trialPresentation.mines);
  if (settings.trialGiveOpening) {
    floodReveal(trialPresentation.firstClick);
    gameState = 'playing';
    startTimer();
    justiceEnabledForGame = settings.justUniverse;
    checkWin();
  }
}

const TRIAL_START_ARM_MS = 800;
let trialStartArmTimer = null;

function clearTrialStartArm() {
  if (trialStartArmTimer !== null) {
    clearTimeout(trialStartArmTimer);
    trialStartArmTimer = null;
  }
}

function startTrial() {
  if (!Trial.isPlayMode(settings.playMode) || trialIsActive()) return;
  lastTrialReview = null;
  if (gameRandom === null) {
    gameSeed = GameRandom.createSeed();
    gameRandom = GameRandom.fromSeed(gameSeed);
  }
  trialSession = Trial.createSession(
    boardKey(), config.width, config.height, config.mines, gameRandom, settings.playMode);
  persistUserdata('trial', trialSession);
  newGame();
}

function trialKindCopy(id) {
  const kind = Trial.kindOf(id);
  const games = kind.identities * kind.repeats;
  return playModeLabel(id) + '\n\n'
    + kind.identities + ' board' + (kind.identities === 1 ? '' : 's')
    + ', each in ' + kind.repeats + ' orientations (' + games + ' games).\n'
    + 'Same logical maps, different flips and rotations.\n'
    + 'You choose the first click. These games do not count toward Standard.';
}

function playModeOfTrial(session) {
  return session.playMode === undefined ? 'trial' : session.playMode;
}

function trialSessionPlayMode() {
  return playModeOfTrial(trialSession);
}

function trialIsActive() {
  return trialSession !== null && trialSession.endedHow === null
    && trialSessionPlayMode() === settings.playMode;
}

function trialReviewMatches() {
  return lastTrialReview !== null
    && lastTrialReview.endedHow
    && playModeOfTrial(lastTrialReview) === settings.playMode
    && lastTrialReview.width === config.width
    && lastTrialReview.height === config.height
    && lastTrialReview.mines === config.mines;
}

function trialPhase() {
  if (!Trial.isPlayMode(settings.playMode)) return 'none';
  if (trialIsActive()) return 'playing';
  if (trialReviewMatches()) return 'review';
  return 'lobby';
}

function trialBlocksPlay() {
  return Trial.isPlayMode(settings.playMode) && trialPhase() !== 'playing';
}

function endTrial(how) {
  if (!trialIsActive()) return;
  Trial.finishSession(trialSession, how);
  persistUserdata('trial', trialSession);
  lastTrialReview = trialSession;
  clearInterval(timerInterval);
  timerInterval = null;
}

function abandonTrial() {
  if (!trialIsActive()) return;
  Trial.finishSession(trialSession, 'quit');
  persistUserdata('trial', trialSession);
  lastTrialReview = null;
}

function syncTrialBoardVisibility(phase) {
  const hide = phase === 'lobby' || phase === 'review';
  document.getElementById('game-frame').hidden = hide;
  gameArea.classList.toggle('trial-no-board', hide);
  document.body.classList.toggle('trial-offboard', hide);
  resultsBox.hidden = hide;
  if (hide) resultRanks.style.removeProperty('--result-overflow');
}

function renderTrialChrome() {
  const stage = document.getElementById('trial-stage');
  const copy = document.getElementById('trial-copy');
  const verdict = document.getElementById('trial-verdict');
  const btn = document.getElementById('trial-start-btn');
  const box = document.getElementById('trial-progress');
  const phase = trialPhase();
  syncTrialBoardVisibility(phase);
  if (phase === 'none') {
    clearTrialStartArm();
    stage.hidden = true;
    verdict.hidden = true;
    box.hidden = true;
    box.textContent = '';
    return;
  }
  if (phase === 'playing') {
    clearTrialStartArm();
    stage.hidden = true;
    verdict.hidden = true;
    box.hidden = false;
    box.textContent = '';
    const label = document.createElement('span');
    label.textContent = trialSession.results.length + ' / ' + Trial.gameCount(trialSession);
    const quit = document.createElement('button');
    quit.type = 'button';
    quit.textContent = 'end trial';
    quit.addEventListener('click', () => {
      endTrial('quit');
      renderTrialChrome();
    });
    box.append(label, quit);
    return;
  }
  box.hidden = true;
  box.textContent = '';
  stage.hidden = false;
  if (phase === 'lobby') {
    clearTrialStartArm();
    copy.hidden = false;
    copy.textContent = trialKindCopy(settings.playMode);
    verdict.hidden = true;
    verdict.textContent = '';
    btn.hidden = false;
    btn.disabled = false;
    btn.textContent = 'start trial';
    resultSummary.textContent = '';
    resultStats.textContent = '';
    resultAnalysis.textContent = '';
    resultRanks.textContent = '';
    return;
  }
  btn.textContent = 'start another trial';
  btn.hidden = false;
  btn.disabled = true;
  clearTrialStartArm();
  trialStartArmTimer = setTimeout(() => {
    trialStartArmTimer = null;
    if (trialPhase() !== 'review') return;
    btn.disabled = false;
  }, TRIAL_START_ARM_MS);
  if (lastTrialReview) renderTrialReview(lastTrialReview);
}

function startTimer() {
  // Every transition into 'playing' passes through here, so this is the
  // one place the session stats learn a game is actually in progress.
  sessionPlayBegin();
  startTime = performance.now();
  timerInterval = setInterval(() => {
    setLcd(timerDisplay, Math.min(TIMER_CAP_SECONDS, Math.floor((performance.now() - startTime) / 1000)));
  }, 200);
}

function elapsedMs() {
  return startTime === 0 ? 0 : performance.now() - startTime;
}

// Skipping the rewrite when the face is unchanged is load-bearing: the
// document mouseup handler re-asserts 'smile' during ready/playing, and
// rewriting mid-click destroyed the svg under the pointer, so the
// browser dropped the click and the dove never restarted a running game.
let currentFaceName = null;
function setFace(name) {
  if (name === currentFaceName) return;
  currentFaceName = name;
  faceButton.innerHTML = FACE_SVGS[name];
}

function updateCell(i) {
  const cell = cells[i];
  const el = cellElements[i];
  if (cell.revealed) {
    el.className = 'cell revealed' + (cell.adjacent > 0 ? ' n' + cell.adjacent : '');
    paintCellGlyph(el, cell.adjacent);
  } else {
    el.className = 'cell hidden';
    el.innerHTML = cell.flagged ? FLAG_SVG : '';
  }
}

// Repaints every revealed cell when the number-display setting changes
// mid-board. Mines and wrong flags shown at game end are never
// `revealed`, so a repaint cannot clobber them.
function repaintRevealedCells() {
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].revealed) updateCell(i);
  }
}

function revealCell(index) {
  if (trialBlocksPlay()) return;
  const cell = cells[index];
  if (cell.revealed || cell.flagged) return;

  let firstReveal = false;
  if (!minesPlaced) {
    placeMinesForPlayMode(index);
    justiceEnabledForGame = justiceAppliesToMode() && settings.justUniverse;
    gameState = 'playing';
    startTimer();
    firstReveal = true;
  } else if (gameState === 'ready') {
    gameState = 'playing';
    startTimer();
    justiceEnabledForGame = justiceAppliesToMode() && settings.justUniverse;
    firstReveal = true;
  }

  const guessEvent = !firstReveal && guessLedgerAppliesToMode()
    ? noteGuess(index) : null;
  const action = settings.playMode === 'proof-or-die' && !firstReveal
    ? 'proof-open' : 'reveal';
  const actionEvaluation = evaluateRevealAction(
    index, firstReveal && revealedCount === 0, guessEvent, action);

  if (settings.playMode === 'proof-or-die' && !firstReveal) {
    const proof = Solver.classifyCell(playerView(), index);
    if (proof.kind !== 'safe' && !proof.complete) {
      backupStatus.textContent = 'The complete proof search reached its work limit; this click was not judged.';
      return;
    }
    if (proof.kind !== 'safe') {
      // Opening an unproven cell here is a deterministic rule death.
      lose([index], actionEvaluation);
      return;
    }
  } else if (settings.playMode === 'angelic' && !firstReveal) {
    const saved = Solver.forceSafe(playerView(), cells.map((c) => c.mine), index, gameRandom);
    if (saved === null) {
      // An angelic death can only be a visible-fact contradiction.
      lose([index], actionEvaluation);
      return;
    }
    applyMineMap(saved);
  } else if (!firstReveal) {
    attemptJustice(index);
  }
  if (cell.mine) {
    lose([index], actionEvaluation);
    return;
  }

  floodReveal(index);
  recordActionEvaluation(actionEvaluation, 'continued');
  checkWin();
}

function floodReveal(index) {
  const stack = [index];
  while (stack.length > 0) {
    const i = stack.pop();
    const cell = cells[i];
    if (cell.revealed || cell.flagged) continue;
    cell.revealed = true;
    revealedCount++;
    updateCell(i);
    if (cell.adjacent === 0) {
      for (const n of neighbors(i)) {
        if (!cells[n].revealed) stack.push(n);
      }
    }
  }
}

// Returns whether the click changed anything (false on a revealed cell).
function toggleFlag(index) {
  if (trialBlocksPlay()) return false;
  const cell = cells[index];
  if (cell.revealed) return false;
  if (gameState === 'ready' && minesPlaced) {
    gameState = 'playing';
    startTimer();
    justiceEnabledForGame = justiceAppliesToMode() && settings.justUniverse;
  }
  cell.flagged = !cell.flagged;
  flagsCount += cell.flagged ? 1 : -1;
  if (cell.flagged) flagsPlaced++;
  else flagsRemoved++;
  clickCount++;
  updateCell(index);
  setLcd(mineCounter, config.mines - flagsCount);
  return true;
}

// The cells a chord would open, or null when the click is a no-op.
function chordTargets(index) {
  const cell = cells[index];
  if (!cell.revealed || cell.adjacent === 0) return null;
  const around = neighbors(index);
  const flaggedCount = around.filter((n) => cells[n].flagged).length;
  if (flaggedCount !== cell.adjacent) return null;

  const toReveal = around.filter((n) => !cells[n].revealed && !cells[n].flagged);
  return toReveal.length === 0 ? null : toReveal;
}

function proofSearchBlocks(candidates, inputLabel) {
  if (settings.playMode !== 'proof-or-die') return false;
  const proof = Solver.classifyCells(playerView(), candidates);
  if (proof.complete || !proof.kinds.some((kind) => kind === 'unknown')) return false;
  backupStatus.textContent = 'The complete proof search reached its work limit; this '
    + inputLabel + ' was not judged.';
  return true;
}

// Left-click chord on a satisfied number opens all unflagged neighbors.
// Returns whether the click changed anything (a chord on a zero cell, an
// unsatisfied number, or a number with nothing left to open is a no-op).
function chord(index) {
  if (trialBlocksPlay()) return false;
  const toReveal = chordTargets(index);
  if (toReveal === null) return false;
  const actionEvaluation = evaluateChordAction(index, toReveal);
  clickCount++;

  if (settings.playMode === 'proof-or-die') {
    const view = playerView();
    const proof = Solver.classifyCells(view, toReveal);
    if (!proof.complete && proof.kinds.some((kind) => kind === 'unknown')) return false;
    if (proof.kinds.some((kind) => kind !== 'safe')) {
      // Chording over an unproven cell in proof-or-die is deterministic.
      lose(toReveal, actionEvaluation);
      return true;
    }
  } else if (settings.playMode === 'angelic') {
    let mines = cells.map((c) => c.mine);
    const view = playerView();
    for (const n of toReveal) {
      const saved = Solver.forceSafe(view, mines, n, gameRandom);
      if (saved === null) {
        // The chord opened a proven mine: contradicted known facts.
        lose([n], actionEvaluation);
        return true;
      }
      mines = saved;
    }
    applyMineMap(mines);
  }

  const hitMines = toReveal.filter((n) => cells[n].mine);
  if (hitMines.length > 0) {
    actionEvaluation.mistakes.push('chord-wrong-flag-outcome');
    actionEvaluation.evidence.hitMines = hitMines;
    lose(hitMines, actionEvaluation);
    return true;
  }
  for (const n of toReveal) floodReveal(n);
  recordActionEvaluation(actionEvaluation, 'continued');
  checkWin();
  return true;
}

function checkWin() {
  if (revealedCount !== cells.length - config.mines) return;
  gameState = 'won';
  // The unmarked-mines-at-win share (the "percent of mines unmarked
  // when winning" chart line): how many of the board's mines carry no
  // flag at the instant of winning, counted before the auto-flag sweep
  // below repaints them all flagged.
  let unflaggedMines = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].mine && !cells[i].flagged) unflaggedMines++;
  }
  sessionRecordEnd('win', unflaggedMines / config.mines);
  finish();
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].mine && !cells[i].flagged) {
      cells[i].flagged = true;
      updateCell(i);
    }
  }
  setLcd(mineCounter, 0);
  setFace('cool');
  reportResult('win');
}

function lose(hitIndices, evaluation) {
  recordActionEvaluation(evaluation, 'death');
  sessionRecordDeath(evaluationHasMistake(evaluation));
  sessionRecordEnd(sessionEndingKind(evaluation));
  gameState = 'lost';
  finish();
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const el = cellElements[i];
    if (cell.mine && !cell.flagged) {
      el.className = 'cell revealed';
      el.innerHTML = MINE_SVG;
    } else if (!cell.mine && cell.flagged) {
      el.className = 'cell revealed';
      el.innerHTML = WRONG_FLAG_SVG;
    }
  }
  for (const i of hitIndices) {
    cellElements[i].className = 'cell revealed mine-hit';
    cellElements[i].innerHTML = MINE_SVG;
  }
  setFace('dead');
  reportResult('loss');
}

function finish() {
  sessionPlayEnd();
  finalTimeMs = elapsedMs();
  clearInterval(timerInterval);
  timerInterval = null;
  clearPresses();
  showJusticeSurvivals();
}

//-------A JUST UNIVERSE (sealed-pocket mercy)-------

// Qualification happens before the hidden layout is consulted. Every bare
// click into a certified sealed pocket is one Justice event whether that
// cell was already clear or needed a conditional redraw. Chords never enter
// this path: a wrong flag is the player's mistake.
let justiceEnabledForGame = null; // frozen from the setting on first reveal
let justiceEvents = 0;            // qualifying sealed-pocket entries
let guessEvents = [];             // measured bare unproven clicks this game
let oddsFailed = false;           // a guess existed but odds could not be measured

function justiceAppliesToMode() {
  return settings.playMode === 'standard'
    || settings.playMode === 'pregen-10-3bv-desc'
    || Trial.isPlayMode(settings.playMode);
}

function playerView() {
  return {
    width: config.width,
    height: config.height,
    mines: config.mines,
    revealed: cells.map((c) => c.revealed),
    adjacent: cells.map((c) => c.adjacent),
  };
}

function revealIsMisclick(index) {
  return minesPlaced && Solver.isVisibleMisclick(
    playerView(), { kind: 'reveal', cell: index });
}

function flagChangeIsMisclick(index, removing) {
  return minesPlaced && Solver.isVisibleMisclick(
    playerView(), { kind: 'flag', cell: index, removing: removing });
}

function chordIsMisclick(index, toReveal) {
  return minesPlaced && Solver.isVisibleMisclick(playerView(), {
    kind: 'chord',
    opened: toReveal,
    flagged: neighbors(index).filter((n) => cells[n].flagged),
  });
}

function recordMisclick() {
  misclicks++;
}

function attemptJustice(index) {
  if (justiceEnabledForGame !== true) return false;
  const view = {
    width: config.width,
    height: config.height,
    mines: config.mines,
    revealed: cells.map((c) => c.revealed),
    adjacent: cells.map((c) => c.adjacent),
  };
  let certificate;
  let redrawn;
  try {
    certificate = Justice.certifyEntry(view, index);
    if (certificate === null) return false;
    redrawn = Justice.redrawEntry(
      certificate, index, cells.map((c) => c.mine), gameRandom);
  } catch (err) {
    backupStatus.textContent = 'justice solver failed: ' + err.message;
    throw err;
  }
  let mineTotal = 0;
  for (const mine of redrawn) if (mine) mineTotal++;
  if (mineTotal !== config.mines) throw new Error('justice redraw changed the mine total');
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i].revealed) continue;
    if (neighbors(i).filter((n) => redrawn[n]).length !== cells[i].adjacent) {
      throw new Error('justice redraw contradicts revealed cell ' + i);
    }
  }
  for (let i = 0; i < cells.length; i++) cells[i].mine = redrawn[i];
  for (let i = 0; i < cells.length; i++) {
    cells[i].adjacent = cells[i].mine ? 0 : neighbors(i).filter((n) => cells[n].mine).length;
  }
  if (cells[index].mine) throw new Error('justice entry remained mined');
  justiceEvents++;
  // Deliberately not recorded: whether this entry's cell was mined before
  // the redraw. The player's point of view is the only one that exists
  // (creator request 2026-08-23) — a forced flip is a forced flip.
  justiceDetails.push({
    type: certificate.type,
    clearWays: certificate.clearWays,
    totalWays: certificate.totalWays,
  });
  return true;
}

// The only thing shown beside the board at game end is the count of
// Justice survivals (creator request 2026-08-23). Guess-odds risk chips
// are withheld for now; they may return once they can be shown with a
// proper explanation. The measurements themselves are still recorded.
function showJusticeSurvivals() {
  if (justiceEvents === 0) return;
  const word = document.createElement('div');
  word.className = 'justice-live-word';
  word.textContent = justiceEvents === 1
    ? 'you won a forced coinflip'
    : 'you won ' + justiceEvents + ' forced coinflips';
  word.title = 'Bare entries into certified sealed pockets are forced '
    + 'coinflips that A Just Universe guarantees you win';
  justiceLive.appendChild(word);
  scheduleBoardLayout();
}

// The guess ledger only exists where the standard mine gamble is real.
// Angelic cannot kill an unproven click (risk chips there would be
// fiction), and proof-or-die kills unproven clicks deterministically —
// neither is a probabilistic guess against hidden mines.
function guessLedgerAppliesToMode() {
  return settings.playMode === 'standard'
    || settings.playMode === 'pregen-10-3bv-desc'
    || settings.playMode === 'uniform-ng'
    || settings.playMode === 'single-path-ng'
    || Trial.isPlayMode(settings.playMode);
}

function noteGuess(index) {
  let event;
  try {
    event = Odds.scoreGuess(playerView(), index, {
      considerJustice: justiceEnabledForGame === true,
    });
  } catch (err) {
    // A scoring failure must never block the reveal: announce, omit
    // this game's ledger, and let the click proceed.
    backupStatus.textContent = 'guess odds failed: ' + err.message;
    oddsFailed = true;
    return undefined;
  }
  if (event === null) return null;
  if (!event.measured) {
    oddsFailed = true;
    return undefined;
  }
  guessEvents.push(event);
  return event;
}

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
  'legacy-avoidable': 'legacy avoidable-death classification',
};

const ACTION_CATEGORY_SPECS = [
  { id: 'gameLoss', label: 'Game loss',
    records: 'the fatal action; a loss can be best-available play and is not automatically a mistake' },
  { id: 'gameRisk', label: 'Game risk',
    records: 'a survived action that increased the actual chance of losing under the active rules' },
  { id: 'timeLoss', label: 'Time loss',
    records: 'an input that made no board progress or moved visible state away from a proven fact; counts actions, not seconds or intent' },
  { id: 'lifeMaximization', label: 'Life maximization',
    records: 'an optional one-ply model comparison where another action had higher expected remaining life' },
  { id: 'measurementNotes', label: 'Measurement notes',
    records: 'legacy or incomplete evidence the app cannot classify more precisely' },
];

function reportScopeAllows(scope, category) {
  if (scope === 'none') return false;
  if (scope === 'fatal') return category === 'gameLoss';
  if (scope === 'risk') return category === 'gameLoss' || category === 'gameRisk';
  return scope === 'full';
}

const TIME_LOSS_MISTAKES = new Set([
  'flagged-proven-safe',
  'removed-proven-mine-flag',
  'chord-visible-contradiction',
  'no-op-click',
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
    if (delta === undefined || delta > 1e-12) return 'gameRisk';
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

// Positionless repetitions do not need one prose block per input. Group
// semantically identical entries at their first occurrence; positioned
// evidence remains individual so its action number stays attached to its
// diagram.
function aggregateReportEntries(entries) {
  const result = [];
  const groups = new Map();
  for (const entry of entries) {
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
  if (entry.category === 'gameRisk') {
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

// Per-event Justice details of the current game ({type, clearWays,
// totalWays}), pushed by attemptJustice for the end-of-game recap.
let justiceDetails = [];

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

//-------STATS (3BV, as measured on minesweeper.online)-------

function compute3BV() {
  return Pregen.board3BV(config.width, config.height, cells.map((cell) => cell.mine));
}

function computeBoardShape() {
  return BoardShape.of(config.width, config.height, cells.map((c) => c.mine));
}

function reportResult(outcome) {
  const shape = computeBoardShape();
  const record = {
    endedAt: Date.now(),
    outcome: outcome,
    timeMs: Math.round(finalTimeMs),
    bv3: compute3BV(),
    clicks: clickCount,
    wastedClicks: wastedClicks,
    misclicks: misclicks,
    flagsPlaced: flagsPlaced,
    flagsRemoved: flagsRemoved,
    mousePathPx: Math.round(mousePathPx),
    states: activeStateNames(),
    justice: justiceEvents,
    justiceEnabled: justiceEnabledForGame,
    seed: gameSeed,
    rngVersion: RNG_VERSION,
    boardVersion: BoardGenerators.byId(gameGenerator.id).version,
    justiceVersion: JUSTICE_VERSION,
    maxAdjacent: shape.maxAdjacent,
    hasSeven: shape.hasSeven,
    zeroCount: shape.zeroCount,
    islandCount: shape.islandCount,
    largestIsland: shape.largestIsland,
    playMode: settings.playMode,
    actionEvaluations: actionEvaluations,
  };
  // The non-default board generator this board was placed with; absent =
  // the default uniform generator (matching the key suffix convention).
  if (gameGenerator.id !== BoardGenerators.DEFAULT_ID) {
    record.generator = { id: gameGenerator.id, params: { ...gameGenerator.params } };
  }
  // Music state: true if any sample during this game heard audio playing,
  // false if every sample heard silence; no field at all when the base
  // system's endpoint never answered (not measured).
  if (musicObservations.length > 0) {
    record.musicPlaying = musicObservations.some((heard) => heard);
  }
  // Fastclick gap: the game's median gap between consecutive useful
  // presses made on the move with gaps under 1s (the session series'
  // qualification, over this one game). Absent when no gap qualified.
  const gameFastGap = sessionMedian(gameFastclickGaps);
  if (gameFastGap !== undefined) {
    record.fastclickGapMs = Math.round(gameFastGap);
  }
  if (!oddsFailed && guessLedgerAppliesToMode()) {
    record.guesses = guessEvents.length;
    record.guessIdealRisk = guessEvents.filter((e) => e.idealRisk).length;
    record.guessNonideal = guessEvents.filter((e) => !e.idealRisk).length;
    record.guessPerfect = guessEvents.filter((e) => e.perfectPlay).length;
    record.lifeLost = guessEvents.reduce((sum, e) => sum + e.lifeLost, 0);
    record.lifeNeedless = guessEvents.reduce((sum, e) => sum + e.lifeNeedless, 0);
    record.oddsVersion = Odds.VERSION;
  }
  if (Trial.isPlayMode(settings.playMode) && trialPresentation !== null) {
    record.identityIndex = trialPresentation.identityIndex;
    record.transform = trialPresentation.transform;
    record.trialStartedAt = trialSession.startedAt;
    record.givenOpening = settings.trialGiveOpening;
  }
  if (pregenActive() && pregenBatch !== null && pregenCurrent !== null) {
    pregenBatch.results.push({ run: pregenCurrent.rank, record });
  }
  const modeRecords = appendGameRecord(record);
  renderPregenCharts();
  if (Trial.isPlayMode(settings.playMode) && trialIsActive() && trialPresentation !== null) {
    Trial.recordResult(trialSession, {
      identityIndex: trialPresentation.identityIndex,
      transform: trialPresentation.transform,
      givenOpening: record.givenOpening,
      endedAt: record.endedAt,
      outcome: record.outcome,
      timeMs: record.timeMs,
      bv3: record.bv3,
      clicks: record.clicks,
      actionEvaluations: record.actionEvaluations,
    });
    if (trialSession.nextIndex >= Trial.gameCount(trialSession)) endTrial('completed');
    persistUserdata('trial', trialSession);
  }
  saveTrace(record);
  // The canonical metrics: the same computation the live panel runs, over
  // the now-complete trace, with the same wall-time definition the stored
  // trace carries (endedAt - startedAt). Snapshotted for the after-game
  // charts; the live panel's game is over, so it goes away.
  const finalMetrics = computeAllTraceMetrics(
    trace.t, trace.x, trace.y, trace.events, record.endedAt - trace.startedAt);
  appendTraceMetricsSeries(finalMetrics);
  finalMotion = { metrics: finalMetrics, series: metricsSeries };
  // The live per-game rows go away with their game; the session section
  // stays (it spans games), so the panel re-renders rather than hiding.
  renderMetricsPanel(null);
  renderResult(record, modeRecords);
  // The inspection controls appear with the finished board; a view left on
  // from the previous game renders this game's trace immediately.
  renderPathView();
}

// The result currently on screen ({record, modeRecords}), kept so a
// settings toggle can re-render it in place; null while no result shows.
let renderedResult = null;

let resultLayoutFrame = null;
if (typeof ResizeObserver !== 'undefined') {
  const resultLayoutObserver = new ResizeObserver(() => {
    if (renderedResult === null || resultLayoutFrame !== null) return;
    resultLayoutFrame = requestAnimationFrame(() => {
      resultLayoutFrame = null;
      syncBoardLayout();
    });
  });
  resultLayoutObserver.observe(mainElement);
  resultLayoutObserver.observe(topRight);
}

function evaluationCellName(cell, width) {
  return 'row ' + (Math.floor(cell / width) + 1) + ', column ' + (cell % width + 1);
}

function buildEvaluationPosition(evaluation) {
  if (evaluation.version !== ACTION_EVALUATION_VERSION || !evaluation.position) return null;
  const position = evaluation.position;
  if (!Number.isInteger(position.width) || !Number.isInteger(position.height)
      || position.width <= 0 || position.height <= 0
      || position.width * position.height > 100000
      || !Array.isArray(position.revealed) || !Array.isArray(position.flagged)) {
    return null;
  }
  const cellSize = 16;
  const crop = evaluationCropBounds(position, evaluation);
  const shownWidth = crop.colTo - crop.colFrom + 1;
  const shownHeight = crop.rowTo - crop.rowFrom + 1;
  const canvas = document.createElement('canvas');
  canvas.className = 'evaluation-board';
  canvas.width = shownWidth * cellSize;
  canvas.height = shownHeight * cellSize;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', crop.cropped
    ? 'Relevant board subset immediately before this action: rows '
      + (crop.rowFrom + 1) + ' through ' + (crop.rowTo + 1)
      + ', columns ' + (crop.colFrom + 1) + ' through ' + (crop.colTo + 1)
    : 'Visible board immediately before this action');
  const ctx = canvas.getContext('2d');
  const revealed = new Map(position.revealed);
  const flagged = new Set(position.flagged);
  const alternatives = new Map();
  for (const alternative of evaluation.alternatives || []) {
    for (const cell of alternative.cells) alternatives.set(cell, alternative.kind);
  }
  const selected = new Set(evaluation.selected || []);
  const numberColors = ['#555555', '#0000ff', '#008000', '#ff0000',
    '#000080', '#800000', '#008080', '#000000', '#808080'];
  ctx.font = 'bold 11px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let row = crop.rowFrom; row <= crop.rowTo; row++) {
    for (let col = crop.colFrom; col <= crop.colTo; col++) {
      const cell = row * position.width + col;
      const x = (col - crop.colFrom) * cellSize;
      const y = (row - crop.rowFrom) * cellSize;
      ctx.fillStyle = revealed.has(cell) ? '#f7f7f7' : '#c0c0c0';
      ctx.fillRect(x, y, cellSize, cellSize);
      ctx.strokeStyle = '#888888';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
      if (revealed.has(cell) && revealed.get(cell) > 0) {
        const number = revealed.get(cell);
        ctx.fillStyle = numberColors[number] || '#000000';
        ctx.fillText(String(number), x + cellSize / 2, y + cellSize / 2 + 0.5);
      } else if (flagged.has(cell)) {
        ctx.fillStyle = '#b3121b';
        ctx.fillText('\u2691', x + cellSize / 2, y + cellSize / 2);
      }
      if (alternatives.has(cell)) {
        const kind = alternatives.get(cell);
        ctx.strokeStyle = kind === 'safe-reveal' ? '#008000'
          : (kind === 'lower-risk-reveal' || kind === 'higher-modeled-life-reveal')
            ? '#0066cc' : '#d17a00';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
      }
      if (selected.has(cell)) {
        ctx.strokeStyle = '#d00000';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 1.5, y + 1.5, cellSize - 3, cellSize - 3);
      }
    }
  }
  const wrap = document.createElement('div');
  wrap.className = 'evaluation-position';
  if (crop.cropped) {
    const note = document.createElement('div');
    note.className = 'evaluation-crop-note';
    note.textContent = 'Relevant subset: rows ' + (crop.rowFrom + 1)
      + '\u2013' + (crop.rowTo + 1) + ', columns ' + (crop.colFrom + 1)
      + '\u2013' + (crop.colTo + 1) + ' of '
      + position.height + ' rows \u00d7 ' + position.width + ' columns.';
    wrap.appendChild(note);
  }
  const scroll = document.createElement('div');
  scroll.className = 'evaluation-board-scroll';
  scroll.appendChild(canvas);
  wrap.appendChild(scroll);
  const legend = document.createElement('div');
  legend.className = 'evaluation-legend';
  const selectedLegend = document.createElement('span');
  selectedLegend.className = 'evaluation-key evaluation-key-selected';
  const shortName = (cell) => 'r' + (Math.floor(cell / position.width) + 1)
    + 'c' + (cell % position.width + 1);
  const selectedCells = [...selected];
  selectedLegend.textContent = 'Selected'
    + (selectedCells.length > 0
      ? ': ' + selectedCells.slice(0, 4).map(shortName).join(', ')
        + (selectedCells.length > 4 ? ', \u2026' : '')
      : '');
  legend.appendChild(selectedLegend);
  for (const alternative of evaluation.alternatives || []) {
    const item = document.createElement('span');
    item.className = 'evaluation-key evaluation-key-' + alternative.kind;
    const alternativeCells = Array.isArray(alternative.cells)
      ? alternative.cells : [];
    const examples = alternativeCells.slice(0, 3).map(shortName);
    item.textContent = evaluationAlternativeLabel(alternative.kind) + ': '
      + alternativeCells.length + (alternativeCells.length === 1 ? ' cell' : ' cells')
      + (examples.length > 0 ? ' \u00b7 e.g. ' + examples.join(', ') : '');
    legend.appendChild(item);
  }
  wrap.appendChild(legend);
  return wrap;
}

function reportCategoryEnabled(category) {
  const scope = settings && settings.reportScope ? settings.reportScope : 'fatal';
  return reportScopeAllows(scope, category);
}

// Recheck the one proof-derived mistake that an older, deliberately
// incomplete prover could falsely assign. The saved position contains every
// revealed clue needed for a hidden-layout-independent correction.
function proofCorrectedEvaluation(evaluation) {
  if (!evaluation || evaluation.version !== ACTION_EVALUATION_VERSION
      || !evaluation.position || !Array.isArray(evaluation.mistakes)
      || !Array.isArray(evaluation.selected) || evaluation.selected.length === 0
      || !evaluation.mistakes.includes('opened-unproven-with-safe-move')) {
    return evaluation;
  }
  const position = evaluation.position;
  const size = position.width * position.height;
  const revealed = new Array(size).fill(false);
  const adjacent = new Array(size).fill(0);
  for (const pair of position.revealed || []) {
    if (!Array.isArray(pair) || !Number.isInteger(pair[0])
        || pair[0] < 0 || pair[0] >= size) return evaluation;
    revealed[pair[0]] = true;
    adjacent[pair[0]] = pair[1];
  }
  try {
    const facts = Justice.proveFacts({
      width: position.width,
      height: position.height,
      mines: position.mines,
      revealed,
      adjacent,
    }, Justice.rawClues({
      width: position.width,
      height: position.height,
      mines: position.mines,
      revealed,
      adjacent,
    }));
    if (!facts.complete
        || !(evaluation.selected || []).every((cell) => facts.get(cell) === 2)) {
      return evaluation;
    }
    return {
      ...evaluation,
      mistakes: evaluation.mistakes.filter(
        (mistake) => mistake !== 'opened-unproven-with-safe-move'),
      evidence: {
        ...(evaluation.evidence || {}),
        factsMeasured: true,
        knowledge: 'proven-safe',
        proofVersion: Justice.PROOF_VERSION,
        proofCorrection: 'rechecked-saved-position',
      },
    };
  } catch (err) {
    return evaluation;
  }
}

function evaluationForReport(evaluation) {
  const corrected = proofCorrectedEvaluation(evaluation);
  if (reportCategoryEnabled('lifeMaximization')) return corrected;
  return {
    ...corrected,
    mistakes: (Array.isArray(corrected.mistakes) ? corrected.mistakes : [])
      .filter((kind) => kind !== 'chose-lower-modeled-life'),
    alternatives: (Array.isArray(corrected.alternatives) ? corrected.alternatives : [])
      .filter((alternative) => alternative.kind !== 'higher-modeled-life-reveal'),
  };
}

// The action report is grouped by one exclusive primary category per action.
// Severity determines placement; lower-level mistake tags remain evidence.
// The centralized report sits below the board row, and trial reports reuse it.
function buildVerdictBlocks(record) {
  const wrap = document.createElement('div');
  wrap.className = 'result-verdicts';
  const detail = 'positions';
  const sections = new Map();
  const categorySpec = (id) =>
    ACTION_CATEGORY_SPECS.find((candidate) => candidate.id === id);
  const sectionFor = (category) => {
    if (sections.has(category)) return sections.get(category);
    const spec = categorySpec(category);
    const section = document.createElement('section');
    section.className = 'verdict-category verdict-category-' + category;
    const heading = document.createElement('h3');
    heading.className = 'verdict-category-title';
    heading.textContent = spec ? spec.label : category;
    if (spec) heading.title = spec.records;
    section.appendChild(heading);
    sections.set(category, section);
    wrap.appendChild(section);
    return section;
  };
  const block = (category, kindClass, titleText, bodyContent) => {
    const box = document.createElement('div');
    box.className = 'verdict-block ' + kindClass;
    const title = document.createElement('div');
    title.className = 'verdict-title';
    title.textContent = titleText;
    box.appendChild(title);
    if (detail !== 'summary' && bodyContent) {
      if (Array.isArray(bodyContent)) {
        const facts = document.createElement('div');
        facts.className = 'verdict-facts';
        for (const fact of bodyContent) {
          const line = document.createElement('div');
          line.className = 'verdict-fact';
          const label = document.createElement('span');
          label.className = 'verdict-fact-label';
          label.textContent = fact.label + ':';
          const value = document.createElement('span');
          value.textContent = fact.value;
          line.append(label, value);
          facts.appendChild(line);
        }
        box.appendChild(facts);
      } else {
        const body = document.createElement('div');
        body.className = 'verdict-body';
        body.textContent = bodyContent;
        box.appendChild(body);
      }
    }
    sectionFor(category).appendChild(box);
    return box;
  };
  const evaluations = record.actionEvaluations || [];
  const fatal = fatalEvaluationOf(record);
  if (fatal && reportCategoryEnabled('gameLoss')) {
    const shown = evaluationForReport(fatal);
    const kind = evaluationEndingKind(fatal);
    const box = block('gameLoss', 'verdict-' + (kind || 'unjudged'),
      'Fatal action: ' + actionEvaluationLabel(shown),
      actionEvaluationLines(shown));
    const position = detail === 'positions' ? buildEvaluationPosition(shown) : null;
    if (position) box.appendChild(position);
  } else if (!fatal && record.outcome === 'loss'
      && reportCategoryEnabled('gameLoss')) {
    block('gameLoss', 'verdict-unjudged', 'Fatal action: unjudged',
      'No action evidence was available for this loss.');
  }
  const reportEntries = [];
  for (const evaluation of evaluations) {
    const shown = evaluationForReport(evaluation);
    if (shown.result === 'death' || !evaluationHasMistake(shown)) continue;
    const category = actionEvaluationCategory(shown);
    if (!category || !reportCategoryEnabled(category)) continue;
    reportEntries.push({ evaluation, shown, category });
  }
  for (const entry of orderReportEntries(aggregateReportEntries(reportEntries))) {
    const { evaluation, shown, category } = entry;
    const positionless = shown.position === undefined;
    const title = positionless
      ? aggregateReportTitle(entry)
      : 'Action'
        + (typeof evaluation.actionNumber === 'number'
          ? ' ' + evaluation.actionNumber : '')
        + ': ' + actionEvaluationLabel(shown);
    const body = positionless
      ? (shown.action === 'no-op' ? null : (entry.text || actionEvaluationText(shown)))
      : actionEvaluationLines(shown);
    const box = block(category, 'verdict-mistake', title, body);
    const position = detail === 'positions' ? buildEvaluationPosition(shown) : null;
    if (position) box.appendChild(position);
  }
  if ((record.justice || 0) > 0 && reportCategoryEnabled('measurementNotes')) {
    const box = block('measurementNotes', 'verdict-justice', 'A Just Universe',
      justiceRecapText(record.justice));
    if (detail !== 'summary' && justiceDetails.length === record.justice) {
      const list = document.createElement('div');
      list.className = 'verdict-details';
      justiceDetails.forEach((detail, i) => {
        const line = document.createElement('div');
        line.textContent = justiceEventDetail(detail, i);
        list.appendChild(line);
      });
      box.appendChild(list);
    }
  }
  return wrap.childNodes.length > 0 ? wrap : null;
}

function buildReportScopeControl(onChange) {
  const label = document.createElement('label');
  label.className = 'report-scope-control';
  const text = document.createElement('span');
  text.textContent = 'After each game, show me:';
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'After each game, show me');
  for (const [value, optionLabel, description] of REPORT_SCOPE_CHOICES) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = optionLabel;
    option.title = description;
    option.selected = settings.reportScope === value;
    select.appendChild(option);
  }
  select.addEventListener('change', () => {
    settings.reportScope = select.value;
    // Keep old exports understandable, but reportScope is now authoritative.
    settings.shownThings.endVerdict = select.value !== 'none';
    saveSettings();
    onChange();
  });
  label.append(text, select);
  return label;
}

//-------RESULT PRESENTATION MODEL (pure; tests extract this span)-------

// Result surfaces share one semantic sequence. A section's order is product
// meaning, not an accident of DOM append order or the width at which flex
// items happen to wrap. The score viewer deliberately omits post-game-only
// action and motion detail; its reference record is context for the history,
// not a game that just happened.
const RESULT_PRESENTATION_PHASES = Object.freeze([
  { id: 'outcome', order: 10 },
  { id: 'facts', order: 20 },
  { id: 'analysis', order: 30, contexts: ['postGame'] },
  { id: 'placements', order: 40 },
  { id: 'rankings', order: 50 },
  { id: 'averages', order: 60 },
  { id: 'streaks', order: 70 },
  { id: 'relationships', order: 80 },
  { id: 'diagnostics', order: 90, contexts: ['postGame'] },
]);

const RESULT_CHART_SECTIONS = Object.freeze([
  { id: 'placements', phase: 'placements', label: null },
  { id: 'rankings', phase: 'rankings', label: 'rankings' },
  { id: 'averages', phase: 'averages', label: 'average time' },
  { id: 'streaks', phase: 'streaks', label: 'streaks' },
  { id: 'relationships', phase: 'relationships', label: 'relationships' },
  {
    id: 'diagnostics',
    phase: 'diagnostics',
    label: 'motion diagnostics',
    contexts: ['postGame'],
  },
]);

function resultPresentationPhases(context) {
  return RESULT_PRESENTATION_PHASES
    .filter((phase) => phase.contexts === undefined || phase.contexts.includes(context))
    .slice()
    .sort((a, b) => a.order - b.order);
}

function resultChartSections(context) {
  const phaseOrder = new Map(
    resultPresentationPhases(context).map((phase, index) => [phase.id, index]));
  return RESULT_CHART_SECTIONS
    .filter((section) =>
      section.contexts === undefined || section.contexts.includes(context))
    .slice()
    .sort((a, b) => phaseOrder.get(a.phase) - phaseOrder.get(b.phase));
}

//-------RESULT PRESENTATION DISPLAY-------

// Collect first, render second: call sites can compute related data together,
// while the model above remains the one authority for visible section order.
function createResultSectionCollector(context) {
  const specs = resultChartSections(context);
  const nodes = new Map(specs.map((spec) => [spec.id, []]));
  return {
    append(sectionId, node) {
      if (!nodes.has(sectionId)) {
        throw new Error('unknown result section: ' + sectionId);
      }
      nodes.get(sectionId).push(node);
    },
    appendAll(sectionId, additions) {
      for (const node of additions) this.append(sectionId, node);
    },
    renderInto(parent) {
      parent.textContent = '';
      for (const spec of specs) {
        const children = nodes.get(spec.id);
        if (children.length === 0) continue;
        const section = document.createElement('section');
        section.className = 'result-chart-section result-chart-section-' + spec.id;
        section.setAttribute('aria-label', spec.label || 'recent placements');
        if (spec.label !== null) {
          const heading = document.createElement('h3');
          heading.className = 'result-chart-section-title';
          heading.textContent = spec.label;
          section.appendChild(heading);
        }
        const items = document.createElement('div');
        items.className = 'result-chart-section-items';
        items.append(...children);
        section.appendChild(items);
        parent.appendChild(section);
      }
    },
  };
}

function renderResult(record, modeRecords, options = {}) {
  renderedResult = { record, modeRecords, options };
  const seconds = secondsOf(record);
  const actionSummary = actionCategorySummary(record.actionEvaluations);
  const fullAnalysis = settings.reportScope === 'full';
  const categoryStatRows = ACTION_CATEGORY_SPECS
    .filter((spec) => fullAnalysis && reportCategoryEnabled(spec.id)
      && actionSummary.counts[spec.id] > 0)
    .map((spec) => [
      spec.id === 'measurementNotes' ? spec.label : spec.label + ' actions',
      String(actionSummary.counts[spec.id]),
    ]);
  const categoryMagnitudeRows = [
    ...(reportCategoryEnabled('gameRisk') && actionSummary.excessRisk > 1e-12
      ? [['Excess game risk',
        (actionSummary.excessRisk * 100).toFixed(1) + 'pp']] : []),
    ...(reportCategoryEnabled('lifeMaximization')
        && actionSummary.modeledLifeGap > 1e-9
      ? [['Modeled life gap',
        actionSummary.modeledLifeGap.toFixed(3)]] : []),
  ];
  const summaryLead = options.historyView
    ? 'High scores'
    : (record.outcome === 'win' ? 'Win' : 'Loss');
  resultSummary.textContent = summaryLead + '\n' + boardDisplayLabel()
    + '\n' + playModeLabel()
    + (record.generator === undefined ? '' : '\n' + BoardGenerators.displayLabel(record.generator))
    + '\n' + (options.historyView ? 'Latest win · ' : '') + formatDate(record.endedAt);
  resultStats.textContent = '';
  resultAnalysis.textContent = '';
  const historyView = options.historyView === true;
  if (!historyView) {
    if (settings.reportScope === 'full') {
      resultAnalysis.appendChild(buildReportScopeControl(
        () => renderResult(record, modeRecords, options)));
    }
    if (settings.reportScope !== 'none') {
      const verdicts = buildVerdictBlocks(record);
      if (verdicts !== null) {
        resultAnalysis.appendChild(verdicts);
      }
    }
  }
  const statsGrid = document.createElement('div');
  statsGrid.id = 'stats-grid';
  // "Clicks over 3BV" only exists for wins: a lost board was never
  // finished, so the subtraction means nothing.
  for (const [label, value, valueClass] of [
    ['Time', seconds.toFixed(3) + 's', isMarkless(record) ? 'markless-time' : ''],
    ['3BV', String(record.bv3)],
    ...(record.maxAdjacent !== undefined ? [['Max number', String(record.maxAdjacent)]] : []),
    ...(record.zeroCount !== undefined ? [['Zeros', String(record.zeroCount)]] : []),
    ...(record.islandCount !== undefined ? [['Islands', String(record.islandCount)]] : []),
    ...(settings.shownThings.largestIsland && record.largestIsland !== undefined
      ? [['Largest island', String(record.largestIsland)]] : []),
    ['3BV/s', bvPerSecond(record).toFixed(4)],
    ['Clicks', String(record.clicks)],
    ...(fullAnalysis ? [['No-op clicks', String(record.wastedClicks)]] : []),
    ...(fullAnalysis && record.misclicks !== undefined
      ? [['Misclicks', String(record.misclicks)]] : []),
    ['Flags placed', isMarkless(record) ? '0 - markless' : String(record.flagsPlaced)],
    ...(fullAnalysis ? [['Flags removed', String(record.flagsRemoved)]] : []),
    // A Justice event is any qualifying sealed-pocket entry — a forced
    // coinflip the rule guarantees the player wins.
    ...(fullAnalysis && record.justice !== undefined
      ? [['Justice', String(record.justice)]] : []),
    ...(record.outcome === 'win'
      ? [['Clicks over 3BV', String(record.clicks - record.bv3)]]
      : []),
    ['Efficiency', efficiencyPercent(record) + '%'],
    ...(correctnessPercent(record) !== undefined
      ? [['Correctness', correctnessPercent(record) + '%']] : []),
    ...(throughputOf(record) !== undefined
      ? [['Throughput', throughputOf(record).toFixed(4)]] : []),
    ...(iosOf(record) !== undefined
      ? [['IOS', iosOf(record).toFixed(4)]] : []),
    ...(fullAnalysis && record.lifeLost !== undefined
      ? [['Life lost', record.lifeLost.toFixed(3)]] : []),
    ...(fullAnalysis && record.lifeNeedless !== undefined
      ? [['Life needless', record.lifeNeedless.toFixed(3)]] : []),
    ...(fullAnalysis && record.guesses !== undefined
      ? [['Guesses', formatGuesses(record)]] : []),
    ...categoryStatRows,
    ...categoryMagnitudeRows,
    ['Mouse path', record.mousePathPx + 'px'],
    ['Mouse speed', Math.round(record.mousePathPx / seconds) + 'px/s'],
    // The per-game forms of the session series, derived from stored
    // fields at display time (so they exist on historical games too);
    // fastclick gap is the one stored measurement among them.
    ...(seconds > 0
      ? [['Click rate', (record.clicks / seconds).toFixed(2) + '/s']] : []),
    // Per second since 2026-08-23, matching the session chart's unit
    // move; derived from the stored count, so every record old or new
    // shows the same unit with no migration.
    ...(fullAnalysis && seconds > 0 && 'wastedClicks' in record
      ? [['No-op rate', (record.wastedClicks / seconds).toFixed(2) + '/s']] : []),
    ...(fullAnalysis && seconds > 0 && record.misclicks !== undefined
      ? [['Misclick rate', (record.misclicks / (seconds / 60)).toFixed(1) + '/min']] : []),
    ...(seconds > 0 && record.flagsPlaced !== undefined
      ? [['Mark rate', (record.flagsPlaced / seconds).toFixed(2) + '/s']] : []),
    ...(fullAnalysis && seconds > 0 && record.flagsRemoved !== undefined
      ? [['Flag-removal rate', (record.flagsRemoved / (seconds / 60)).toFixed(1) + '/min']] : []),
    ...(record.fastclickGapMs !== undefined
      ? [['Fastclick gap', Math.round(record.fastclickGapMs) + 'ms']] : []),
    ['Path per click', Math.round(record.mousePathPx / record.clicks) + 'px'],
    ['Path per 3BV', Math.round(record.mousePathPx / record.bv3) + 'px'],
    // The states row appears only when the game carries at least one state
    // tag; a tagless game shows nothing rather than an empty row.
    ...(record.states.length > 0 ? [['States', record.states.join(', ')]] : []),
    ...(record.musicPlaying !== undefined
      ? [['Music', record.musicPlaying ? 'playing' : 'none']] : []),
  ]) {
    const labelCell = document.createElement('span');
    labelCell.className = 'stat-label';
    labelCell.textContent = label;
    const valueCell = document.createElement('span');
    valueCell.className = 'stat-value' + (valueClass ? ' ' + valueClass : '');
    valueCell.textContent = value;
    statsGrid.append(labelCell, valueCell);
  }
  if (settings.shownThings.gameStats) {
    if (historyView) {
      const heading = document.createElement('h3');
      heading.className = 'latest-win-stats-title';
      heading.textContent = 'latest win stats';
      resultStats.appendChild(heading);
    }
    resultStats.appendChild(statsGrid);
  }
  if (!historyView && settings.reportScope !== 'full') {
    resultStats.appendChild(buildReportScopeControl(
      () => renderResult(record, modeRecords, options)));
  }
  const resultSections = createResultSectionCollector(
    historyView ? 'scores' : 'postGame');
  resultRanks.classList.toggle(
    'sectioned-results',
    !Trial.isPlayMode(settings.playMode) || historyView);
  if (Trial.isPlayMode(settings.playMode) && !options.historyView) {
    resultRanks.textContent = '';
    renderTrialChrome();
  } else if (record.outcome === 'win') {
    renderRanks(record, modeRecords, options, resultSections);
  } else {
    resultRanks.textContent = '';
  }
  // The after-game motion charts, jammed inline after whatever other
  // bottom charts the outcome produced (all of them for a win, none for
  // a loss). Motion existed either way. Trial review has its own charts.
  if (settings.showMotionStatsAfterGame && finalMotion !== null && !options.historyView
      && !Trial.isPlayMode(settings.playMode)) {
    resultSections.appendAll('diagnostics', buildMotionStatsCharts());
  }
  if (!Trial.isPlayMode(settings.playMode) || options.historyView) {
    resultSections.renderInto(resultRanks);
  }
  syncBoardLayout();
}

//-------PLAY HISTORY (every finished game kept per mode)-------

// The game-record schema: one record per finished game, win or loss,
// holding only the primary measurements; every other displayed stat is
// derived from them at read time, never stored. This is the single
// definition of the record shape — reportResult writes the non-legacy
// fields, importHistory also accepts the explicitly marked legacy boundary
// fields, and the data-format card renders only the current examples and
// descriptions. wastedClicks and
// flagsPlaced joined the schema on 2026-08-19, flagsRemoved on 2026-08-20:
// all are always written now, but games recorded before they were measured
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
  { field: 'bv3', valid: isNumber, example: '10', describe: "the board's 3BV: minimum clicks to clear it" },
  { field: 'clicks', valid: isNumber, example: '19', describe: 'clicks that changed the board (reveals, flags, chords)' },
  { field: 'wastedClicks', valid: (v) => v === undefined || isNumber(v), example: '3', describe: 'board clicks that changed nothing; absent on games recorded before 2026-08-19' },
  { field: 'misclicks', valid: (v) => v === undefined || isNumber(v), example: '1', describe: 'board-changing actions contradicted by facts provable from the visible board at click time: opening a proven mine, flagging a proven safe, removing a proven-mine flag, or chording through a visible contradiction; independent of whether the action caused death; absent on games recorded before 2026-08-23' },
  { field: 'flagsPlaced', valid: (v) => v === undefined || isNumber(v), example: '0', describe: 'flags the player placed (win auto-flagging not counted); 0 = a markless game; absent on games recorded before 2026-08-19' },
  { field: 'flagsRemoved', valid: (v) => v === undefined || isNumber(v), example: '1', describe: 'flag states the player turned off; placement and removal are each board-changing clicks; the reason for removal is not observed; absent on games recorded before 2026-08-20' },
  { field: 'mousePathPx', valid: isNumber, example: '1182', describe: 'cursor travel while playing, px' },
  { field: 'fastclickGapMs', valid: (v) => v === undefined || isNumber(v), example: '218', describe: 'median gap between consecutive board-changing presses made on the move (cursor moving within 100ms before) with gaps under 1s; absent when no gap qualified or on games recorded before 2026-08-22' },
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
  { field: 'actionEvaluations', valid: validActionEvaluations, example: '[{"version":"action-evaluation-v1","action":"reveal","result":"continued","mistakes":["guessed-with-safe-move"],"evidence":{"proofVersion":"all-consistent-layouts-v1"}}]', describe: 'versioned evidence for the fatal action and every earlier measured reportable action: proof-engine version/completeness, exclusive report category derived from action/outcome, independent mistake tags, raw and protection-aware chosen/best risks, modeled-life values, highlighted alternatives, and (except compact no-op entries) the visible position before the action; [] means no recorded reportable action and no death; older records are normalized into this field on load/import' },
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

//-------SETTINGS SUPPORT (the schema itself lives in settings-core.js)-------

// The settings schema, groups, shown-things options, the RAM copy
// (`settings`), settingsFrom, and saveSettings all moved to
// settings-core.js on 2026-08-23, shared with the settings page. The
// constants below stay here because only game-page code (including the
// schema's late-bound valid() closures) ever reads them.

// Selectable running-average lengths (seconds of accumulated play); see
// the session stats section. "5m" means five minutes of played time,
// never wall time. The selector lives on the session section itself, not
// on the settings page, so experimenting with it is one click.
const SESSION_LOOKBACK_CHOICES = [30, 60, 120, 300, 900];

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
    if (!(field.field in source)) continue;
    if (field.valid(source[field.field])) cleaned[field.field] = source[field.field];
    else {
      delete cleaned[field.field];
      skippedFields++;
    }
  }
  return { settings: cleaned, skippedFields };
}

//-------PLAY HISTORY: TRANSFER CLEANING END-------

function secondsOf(record) {
  return record.timeMs / 1000;
}

function bvPerSecond(record) {
  return record.bv3 / secondsOf(record);
}

function efficiencyPercent(record) {
  return Math.round((record.bv3 / record.clicks) * 100);
}

// Effective / (effective + wasted). Absence of wastedClicks means the
// denominator was never measured, so this is undefined rather than 100%.
function correctnessPercent(record) {
  if (!('wastedClicks' in record)) return undefined;
  const total = record.clicks + record.wastedClicks;
  if (total === 0) return undefined;
  return Math.round((record.clicks / total) * 100);
}

// 3BV / effective clicks. Same quantity as efficiency, as a ratio.
// Wins only: a lost board was never finished, so the 3BV numerator is
// the whole board and the ratio would flatter a short loss.
function throughputOf(record) {
  if (record.outcome !== 'win' || record.clicks === 0) return undefined;
  return record.bv3 / record.clicks;
}

// log(3BV) / log(time in seconds). MSO blanks t≤1; we do the same.
// Wins only, same unfinished-board honesty as throughput.
function iosOf(record) {
  if (record.outcome !== 'win') return undefined;
  const t = secondsOf(record);
  if (!(t > 1) || !(record.bv3 > 0)) return undefined;
  return Math.log(record.bv3) / Math.log(t);
}

function formatGuesses(record) {
  if (record.guesses === 0) return '0';
  return record.guesses + ' · ' + record.guessIdealRisk + ' ideal · '
    + record.guessNonideal + ' off · ' + record.guessPerfect + ' perfect';
}

// A markless game: the player never placed a single flag. Records from
// before flagsPlaced was measured have it undefined and never qualify —
// the status is only claimed where it is known.
function isMarkless(record) {
  return record.flagsPlaced === 0;
}

// Local midnight `daysBack` days before the given moment.
function startOfDay(ms, daysBack = 0) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysBack);
  return d.getTime();
}

// Day-and-longer windows anchor at local midnights: "today" runs from the
// last midnight, "past week" from midnight 6 days back (7 calendar days),
// "this month"/"in <year>" from their calendar starts, and the rolling
// "in the last year" starts at the end of the day exactly 365 days prior.
// Sub-day windows stay purely rolling.
// Ordering concerns are deliberately separate:
// - displayOrder is where the tablechart appears;
// - dedupePriority is lower for the chart that claims a duplicate member set;
// - summaryTiePriority is higher for the broader/more significant row.
// "lifetime" and "past week" are additionally pinned by callers. Day
// categories (added in rankColumns) dedupe between "today" and "past week".
function rankWindows(nowMs) {
  const d = new Date(nowMs);
  return [
    { id: 'lifetime', label: 'lifetime', startMs: -Infinity,
      displayOrder: 10, dedupePriority: 12, summaryTiePriority: 12 },
    { id: 'calendar-year', label: 'in ' + d.getFullYear(),
      startMs: new Date(d.getFullYear(), 0, 1).getTime(),
      displayOrder: 20, dedupePriority: 10, summaryTiePriority: 10 },
    { id: 'rolling-year', label: 'in the last year',
      startMs: startOfDay(nowMs, 364),
      displayOrder: 30, dedupePriority: 11, summaryTiePriority: 11 },
    { id: 'calendar-month', label: 'this month',
      startMs: new Date(d.getFullYear(), d.getMonth(), 1).getTime(),
      displayOrder: 40, dedupePriority: 9, summaryTiePriority: 9 },
    { id: 'past-week', label: 'past week', startMs: startOfDay(nowMs, 6),
      displayOrder: 50, dedupePriority: 8, summaryTiePriority: 8 },
    { id: 'today', label: 'today', startMs: startOfDay(nowMs),
      displayOrder: 60, dedupePriority: 4, summaryTiePriority: 4 },
    { id: 'past-hour', label: 'past hour', startMs: nowMs - 3600e3,
      displayOrder: 70, dedupePriority: 3, summaryTiePriority: 3 },
    { id: 'past-15-min', label: 'past 15 min',
      startMs: nowMs - 15 * 60e3,
      displayOrder: 80, dedupePriority: 2, summaryTiePriority: 2 },
    { id: 'past-5-min', label: 'past 5 min', startMs: nowMs - 5 * 60e3,
      displayOrder: 90, dedupePriority: 1, summaryTiePriority: 1 },
    { id: 'past-1-min', label: 'past 1 min', startMs: nowMs - 60e3,
      displayOrder: 100, dedupePriority: 0, summaryTiePriority: 0 },
  ];
}

function difficultyDisplayName(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function boardDisplayLabel() {
  let board = 'Custom ' + config.width + 'x' + config.height + '-' + config.mines;
  for (const [name, d] of Object.entries(DIFFICULTIES)) {
    if (d.width === config.width && d.height === config.height && d.mines === config.mines) {
      board = difficultyDisplayName(name);
      break;
    }
  }
  return board;
}

function formatDate(timestampMs) {
  const d = new Date(timestampMs);
  const pad = (n) => String(n).padStart(2, '0');
  return WEEKDAY_NAMES[d.getDay()] + ' '
    + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Relative age in the largest sensible unit, split into count and unit so the
// counts can be right-aligned as their own column. h/d/w/y keep one decimal
// (including trailing .0); s/m/mo stay whole. Tenths-rounding that would
// display as the next unit's threshold promotes instead (23.95h → 1.0d).
function relativeAge(nowMs, thenMs) {
  const tenths = (n) => Math.round(n * 10) / 10;
  const seconds = Math.max(0, Math.round((nowMs - thenMs) / 1000));
  if (seconds < 60) return { count: seconds, unit: 's' };
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return { count: minutes, unit: 'm' };
  const hours = minutes / 60;
  const hoursTenth = tenths(hours);
  if (hoursTenth < 24) return { count: hoursTenth, unit: 'h' };
  const days = hours / 24;
  const daysTenth = tenths(days);
  if (daysTenth < 7) return { count: daysTenth, unit: 'd' };
  if (days < 30) return { count: tenths(days / 7), unit: 'w' };
  if (days < 365) return { count: Math.floor(days / 30), unit: 'mo' };
  return { count: tenths(days / 365), unit: 'y' };
}

function formatAgeCount(age) {
  return (age.unit === 'h' || age.unit === 'd' || age.unit === 'w' || age.unit === 'y')
    ? age.count.toFixed(1)
    : String(age.count);
}

// Each age unit's span in ms, matching relativeAge's boundaries. Used to
// place an age within its unit: frac runs 0 (just entered the unit) to 1
// (about to roll into the next), so scatter dots can fade with age inside
// a single color. Years cap at 10, beyond which everything is equally old.
const AGE_UNIT_SPANS = [
  ['s', 0, 60e3],
  ['m', 60e3, 3600e3],
  ['h', 3600e3, 864e5],
  ['d', 864e5, 7 * 864e5],
  ['w', 7 * 864e5, 30 * 864e5],
  ['mo', 30 * 864e5, 365 * 864e5],
  ['y', 365 * 864e5, 10 * 365 * 864e5],
];

function ageInfo(nowMs, thenMs) {
  const age = Math.max(0, nowMs - thenMs);
  for (const [unit, lo, hi] of AGE_UNIT_SPANS) {
    if (age < hi || unit === 'y') {
      return { unit, frac: Math.min(1, (age - lo) / (hi - lo)) };
    }
  }
}

//-------DAY CATEGORIES (weekday / weekend / US holidays)-------

function isWeekend(date) {
  return date.getDay() === 0 || date.getDay() === 6;
}

// US federal holidays (fixed dates plus the weekday-rule ones).
function isHoliday(date) {
  const m = date.getMonth();
  const day = date.getDate();
  const weekday = date.getDay();
  const nth = Math.ceil(day / 7);
  if (m === 0 && day === 1) return true;                       // New Year's Day
  if (m === 0 && weekday === 1 && nth === 3) return true;      // MLK Day
  if (m === 1 && weekday === 1 && nth === 3) return true;      // Presidents Day
  if (m === 4 && weekday === 1 && day >= 25) return true;      // Memorial Day
  if (m === 5 && day === 19) return true;                      // Juneteenth
  if (m === 6 && day === 4) return true;                       // Independence Day
  if (m === 8 && weekday === 1 && day <= 7) return true;       // Labor Day
  if (m === 10 && weekday === 4 && nth === 4) return true;     // Thanksgiving
  if (m === 11 && day === 25) return true;                     // Christmas
  return false;
}

// Columns for the current win: the rolling windows, plus lifetime-spanning
// categories the win itself belongs to (same weekday, weekend/weekday,
// holiday when today is one). Window columns carry their startMs; day
// categories have none — that absence is what marks them lifetime-spanning
// (the recent-placements strictly-longer rule reads it).
function rankColumns(referenceMs) {
  const columns = rankWindows(referenceMs).map((window) => ({
    ...window,
    filter: (s) => s.endedAt >= window.startMs,
  }));
  const winDate = new Date(referenceMs);
  const weekday = winDate.getDay();
  columns.push({
    id: 'weekday',
    label: 'on ' + WEEKDAY_NAMES[weekday] + 's',
    filter: (s) => new Date(s.endedAt).getDay() === weekday,
    displayOrder: 110,
    dedupePriority: 5,
    summaryTiePriority: 5,
  });
  const weekend = isWeekend(winDate);
  columns.push({
    id: weekend ? 'weekends' : 'weekdays',
    label: weekend ? 'on weekends' : 'on weekdays',
    filter: (s) => isWeekend(new Date(s.endedAt)) === weekend,
    displayOrder: 120,
    dedupePriority: 6,
    summaryTiePriority: 6,
  });
  if (isHoliday(winDate)) {
    columns.push({
      id: 'holidays',
      label: 'on holidays',
      filter: (s) => isHoliday(new Date(s.endedAt)),
      displayOrder: 130,
      dedupePriority: 7,
      summaryTiePriority: 7,
    });
  }
  return columns.sort((a, b) => a.displayOrder - b.displayOrder);
}

// Board-shape chart candidates for this win's finished-board family:
// {label, displayOrder, dedupePriority, summaryTiePriority, rows}. Older wins lacking a
// measurement stay off their list. Shared by the board-shape tablecharts
// and the recent-placements summary so the two chart sets cannot drift;
// the largestIsland display gate is applied at the tablechart render
// site, not here.
function boardShapeCandidates(record, wins) {
  const candidates = [];
  if (record.maxAdjacent === 8) {
    candidates.push({
      id: 'has-8',
      label: 'has 8',
      displayOrder: 10,
      dedupePriority: 0,
      summaryTiePriority: 0,
      rows: wins.filter((s) => s.maxAdjacent === 8),
    });
  }
  if (record.hasSeven === true) {
    candidates.push({
      id: 'has-7',
      label: 'has 7',
      displayOrder: 20,
      dedupePriority: 1,
      summaryTiePriority: 1,
      rows: wins.filter((s) => s.hasSeven === true),
    });
  }
  if (typeof record.maxAdjacent === 'number') {
    for (const cap of [4, 3, 2]) {
      if (record.maxAdjacent <= cap) {
        candidates.push({
          id: 'max-' + cap,
          label: 'max ' + cap,
          displayOrder: 70 - cap * 10,
          dedupePriority: cap,
          summaryTiePriority: cap,
          rows: wins.filter((s) => typeof s.maxAdjacent === 'number' && s.maxAdjacent <= cap),
        });
      }
    }
  }
  if (typeof record.islandCount === 'number') {
    candidates.push({
      id: 'islands',
      label: record.islandCount === 1 ? '1 island' : record.islandCount + ' islands',
      displayOrder: 80,
      dedupePriority: 10,
      summaryTiePriority: 10,
      rows: wins.filter((s) => s.islandCount === record.islandCount),
    });
  }
  if (typeof record.largestIsland === 'number') {
    candidates.push({
      id: 'largest-island',
      label: 'largest island ' + record.largestIsland,
      displayOrder: 90,
      dedupePriority: 11,
      summaryTiePriority: 11,
      rows: wins.filter((s) => s.largestIsland === record.largestIsland),
    });
  }
  if (typeof record.zeroCount === 'number') {
    candidates.push({
      id: 'zeros',
      label: record.zeroCount === 1 ? '1 zero' : record.zeroCount + ' zeros',
      displayOrder: 100,
      dedupePriority: 12,
      summaryTiePriority: 12,
      rows: wins.filter((s) => s.zeroCount === record.zeroCount),
    });
  }
  return candidates.sort((a, b) => a.displayOrder - b.displayOrder);
}

//-------RECENT PLACEMENTS: COMPUTATION (pure; tests extract this span)-------

// Canonical order for every time-ranked win list. Modern JavaScript's stable
// sort preserves history order only in the extremely rare case where both
// stored values are identical.
function compareRankedWins(a, b) {
  return a.timeMs - b.timeMs || a.endedAt - b.endedAt;
}

// English ordinal: 1st, 2nd, 3rd, 4th ... with the 11th/12th/13th rule.
function ordinal(n) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return n + 'th';
  return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
}

// Sorted ranks compressed into runs, the ordinal suffix only closing each
// run: [1, 3, 8, 9, 10, 11, 12] renders as "1st, 3rd, 8\u201312th".
function formatRankRuns(ranks) {
  const parts = [];
  for (let i = 0; i < ranks.length; i++) {
    let j = i;
    while (j + 1 < ranks.length && ranks[j + 1] === ranks[j] + 1) j++;
    parts.push(j > i ? ranks[i] + '\u2013' + ordinal(ranks[j]) : ordinal(ranks[i]));
    i = j;
  }
  return parts.join(', ');
}

// Progressive-disclosure dedupe shared by the tablecharts and their
// recent-placements summary. Candidates with the exact same member wins
// keep the lowest dedupePriority chart, except pinned charts are always
// kept and claim their duplicate sets before the ordinary candidates.
// `specificity` remains a compatibility fallback for extracted callers and
// old known-answer fixtures; production candidates use the explicit fields.
function rankDedupePriority(candidate) {
  return candidate.dedupePriority ?? candidate.specificity
    ?? Number.MAX_SAFE_INTEGER;
}

function rankSummaryTiePriority(candidate) {
  return candidate.summaryTiePriority ?? candidate.specificity
    ?? Number.MIN_SAFE_INTEGER;
}

function dedupeRankCandidates(candidates, pinnedLabels = []) {
  const signatureOf = (candidate) => candidate.wins
    .map((win) => win.endedAt)
    .sort((a, b) => a - b)
    .join('|');
  const kept = [];
  const keptSet = new Set();
  const seenSets = new Set();
  for (const label of pinnedLabels) {
    const pinned = candidates.find((candidate) => candidate.label === label);
    if (pinned === undefined) throw new Error('missing pinned rank chart: ' + label);
    kept.push(pinned);
    keptSet.add(pinned);
    seenSets.add(signatureOf(pinned));
  }
  for (const candidate of [...candidates]
    .sort((a, b) => rankDedupePriority(a) - rankDedupePriority(b))) {
    if (keptSet.has(candidate)) continue;
    const signature = signatureOf(candidate);
    if (seenSets.has(signature)) continue;
    seenSets.add(signature);
    kept.push(candidate);
  }
  return kept;
}

// The recent-placements rows (PRODUCT.md "Recent placements"). Each
// candidate names one tablechart: {label, ordering priorities, wins (that chart's
// member wins), startMs (present only on time windows — a window reports
// only when it starts strictly before the source window, since a window
// no longer than the source could only echo its own chart; membership
// charts like weekend/weekday and same-3BV span lifetime and always
// qualify), alwaysShowBest (lifetime's near-miss rule: when no rank is
// within the top tenth, report the single best source-window rank anyway,
// marked nearMiss, so how close it came stays visible)}. Within each
// chart, wins rank fastest-first (ties by earlier finish) and a rank r is
// reported only when it is earned within the source window and sits in
// the list's top tenth (r * 10 <= list length; a 9-win list reports
// nothing). Rows come back with the largest competitor pool first; ties
// put broader, more significant charts first. Each row is
// {label, ranks (ascending, 1-based), total, nearMiss, currentRank}.
function recentPlacementsSummary(candidates, sourceStartMs, currentRecord) {
  const rows = [];
  for (const c of candidates) {
    if (c.startMs !== undefined && !(c.startMs < sourceStartMs)) continue;
    const list = c.wins.slice().sort(compareRankedWins);
    const ranks = [];
    for (let i = 0; (i + 1) * 10 <= list.length; i++) {
      if (list[i].endedAt >= sourceStartMs) ranks.push(i + 1);
    }
    const currentIndex = currentRecord === undefined ? -1 : list.indexOf(currentRecord);
    const currentRank = currentIndex === -1 ? undefined : currentIndex + 1;
    if (ranks.length > 0) {
      rows.push({
        label: c.label,
        summaryTiePriority: rankSummaryTiePriority(c),
        ranks,
        total: list.length,
        nearMiss: false,
        currentRank: ranks.includes(currentRank) ? currentRank : undefined,
      });
    } else if (c.alwaysShowBest === true) {
      const best = list.findIndex((s) => s.endedAt >= sourceStartMs);
      if (best !== -1) {
        rows.push({
          label: c.label,
          summaryTiePriority: rankSummaryTiePriority(c),
          ranks: [best + 1],
          total: list.length,
          nearMiss: true,
          currentRank: best === currentIndex ? currentRank : undefined,
        });
      }
    }
  }
  rows.sort((a, b) =>
    b.total - a.total || b.summaryTiePriority - a.summaryTiePriority);
  return rows;
}

//-------RECENT PLACEMENTS: DISPLAY-------

// One summary block: which top-tenth ranks on the longer tablecharts —
// the time windows, the day categories, this game's same-3BV chart, and
// its board-shape charts — were earned within the chosen recent window.
// The window selector sits in the heading and persists as
// settings.recentPlacementsWindow; a change re-renders the result in
// place, like a settings-panel switch.
function buildRecentPlacements(record, wins, referenceMs, markReferenceRecord = true) {
  const [, chosenLabel, startOf] = RECENT_PLACEMENTS_WINDOWS
    .find(([id]) => id === settings.recentPlacementsWindow);
  const sourceStartMs = startOf(referenceMs);
  // Every chart this game is ranked on competes here (the general rule,
  // decided 2026-08-23): the time windows and day categories from
  // rankColumns (day categories carry no startMs — lifetime-spanning,
  // always longer than the source), this game's same-3BV chart, and its
  // board-shape charts — independent of which tablecharts are switched
  // on. The same setting and helper as the full tablecharts dedupe the
  // time/day and shape groups before all surviving rows are ordered by
  // competitor count (the shape priority offset breaks equal-count ties).
  let rankCandidates = rankColumns(referenceMs).map((column) => ({
    label: column.label,
    dedupePriority: column.dedupePriority,
    summaryTiePriority: column.summaryTiePriority,
    startMs: column.startMs,
    wins: wins.filter(column.filter),
    alwaysShowBest: column.label === 'lifetime',
  }));
  if (settings.collapseDuplicateCharts) {
    rankCandidates = dedupeRankCandidates(rankCandidates, ['lifetime', 'past week']);
  }
  const candidates = [...rankCandidates, {
    label: '3BV ' + record.bv3,
    dedupePriority: 13,
    summaryTiePriority: 13,
    wins: wins.filter((s) => s.bv3 === record.bv3),
  }];
  let shapeCandidates = boardShapeCandidates(record, wins)
    .map((candidate) => ({ ...candidate, wins: candidate.rows }));
  if (settings.collapseDuplicateCharts) {
    shapeCandidates = dedupeRankCandidates(shapeCandidates);
  }
  for (const c of shapeCandidates) {
    candidates.push({
      label: c.label,
      dedupePriority: 14 + c.dedupePriority,
      summaryTiePriority: 14 + c.summaryTiePriority,
      wins: c.wins,
    });
  }
  const rows = recentPlacementsSummary(
    candidates, sourceStartMs, markReferenceRecord ? record : undefined);

  const box = document.createElement('div');
  box.className = 'rank-list recent-placements';
  const heading = document.createElement('h4');
  heading.textContent = 'ranks won';
  heading.title = 'top ranks on every longer chart (time windows, day '
    + 'categories, this 3BV, this board\u2019s shape charts) that were earned '
    + chosenLabel + '; only ranks within the top tenth of a list count, '
    + 'except that lifetime shows its closest rank when none made the tenth';
  const select = document.createElement('select');
  select.className = 'recent-placements-select';
  select.title = 'the recent window whose earned top ranks are summarized';
  for (const [id, label] of RECENT_PLACEMENTS_WINDOWS) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = label;
    select.appendChild(option);
  }
  select.value = settings.recentPlacementsWindow;
  select.addEventListener('change', () => {
    settings.recentPlacementsWindow = select.value;
    saveSettings();
    if (renderedResult !== null) {
      renderResult(renderedResult.record, renderedResult.modeRecords, renderedResult.options);
    }
  });
  heading.appendChild(select);
  box.appendChild(heading);

  // Lifetime's near-miss rule reports whenever the source window has any
  // win at all, so an empty summary means exactly that: no wins yet.
  if (rows.length === 0) {
    const none = document.createElement('div');
    none.className = 'recent-placements-none';
    none.textContent = 'no wins ' + chosenLabel;
    box.appendChild(none);
    return box;
  }
  const grid = document.createElement('div');
  grid.className = 'recent-placements-grid';
  for (const row of rows) {
    const line = document.createElement('div');
    line.className = 'rank-row';
    if (row.nearMiss) {
      line.title = 'no top-tenth ' + row.label + ' rank was won ' + chosenLabel
        + '; this is the closest one';
    }
    const labelCell = document.createElement('span');
    labelCell.className = 'recent-window-cell';
    labelCell.textContent = row.label;
    line.appendChild(labelCell);
    const ranksCell = document.createElement('span');
    ranksCell.className = 'recent-ranks-cell'
      + (row.nearMiss ? ' recent-near-cell' : '');
    if (row.currentRank === undefined) {
      ranksCell.textContent = formatRankRuns(row.ranks);
    } else {
      const before = row.ranks.filter((rank) => rank < row.currentRank);
      const after = row.ranks.filter((rank) => rank > row.currentRank);
      if (before.length > 0) {
        const prefix = document.createElement('span');
        prefix.className = 'recent-rank-run';
        prefix.textContent = formatRankRuns(before) + ', ';
        ranksCell.appendChild(prefix);
      }
      const current = document.createElement('span');
      current.className = 'recent-current-rank';
      current.textContent = ordinal(row.currentRank);
      ranksCell.appendChild(current);
      if (after.length > 0) {
        const suffix = document.createElement('span');
        suffix.className = 'recent-rank-run';
        suffix.textContent = ', ' + formatRankRuns(after);
        ranksCell.appendChild(suffix);
      }
    }
    line.appendChild(ranksCell);
    const totalCell = document.createElement('span');
    totalCell.className = 'recent-of-cell';
    totalCell.textContent = 'of ' + row.total;
    line.appendChild(totalCell);
    grid.appendChild(line);
  }
  box.appendChild(grid);
  return box;
}

// Appends the finished game to its mode's history and returns that mode's
// full record list (the appended object included, so identity search works).
function appendGameRecord(record) {
  const key = modeKey();
  if (!(key in history)) history[key] = [];
  history[key].push(record);
  persistUserdata('history', history);
  return history[key];
}

// Visible slice of a ranked list, always the full 11 rows when the list has
// them (a constant row count keeps a chart's height stable across re-sorts,
// so reordering never reflows its neighbors). When my row sits within the
// top 11, the whole budget anchors at #1: the top 11 renders with my row in
// its true place. Otherwise the window centers on me — 5 above, 5 below —
// sliding upward when I'm near the bottom so the budget still fills.
function windowBounds(myIndex, length) {
  if (myIndex <= 10) return [0, Math.min(length, 11)];
  const end = Math.min(length, myIndex + 6);
  return [Math.max(0, end - 11), end];
}

// Average-time charts group wins by an input/performance value, then plot
// that value against the group's average solve time. This keeps the useful
// relationship from the former ranked tables without spending a column on
// sample count. Mouse path buckets at 100px; the rest group on exact
// integers.
const AVERAGE_SCATTER_SPECS = [
  { label: 'clicks', value: (s) => s.clicks, format: (v) => String(v) },
  { label: '3BV', value: (s) => s.bv3, format: (v) => String(v) },
  { label: 'mouse path', value: (s) => Math.round(s.mousePathPx / 100) * 100, format: (v) => v + 'px' },
];

// Every list renders its full 11-row window around the player's row (see
// windowBounds); a mediocre placement still shows its 5 neighbors above and
// below, at full opacity, since the placement itself is fresh information.
// The list ends with an "of N" footer completing the highlighted "#x": the
// rank fraction lives in the chart, not the heading.
function buildRankList(headingText, rowCount, myIndex, gridClass, buildRowCells) {
  const list = document.createElement('div');
  list.className = 'rank-list';
  if (headingText !== null) {
    const heading = document.createElement('h4');
    heading.textContent = headingText;
    list.appendChild(heading);
  }
  const grid = document.createElement('div');
  grid.className = gridClass;
  const [start, end] = windowBounds(myIndex, rowCount);
  for (let i = start; i < end; i++) {
    const row = document.createElement('div');
    row.className = i === myIndex ? 'rank-row me' : 'rank-row';
    for (const [cls, text] of buildRowCells(i)) {
      const cell = document.createElement('span');
      cell.className = cls;
      cell.textContent = text;
      row.appendChild(cell);
    }
    grid.appendChild(row);
  }
  list.appendChild(grid);
  // The "of N" only appears when rows are actually cut off below: if the
  // last row is visible, the list's end is already in view and the count
  // says nothing new. The footer line itself always renders (blank via
  // nbsp) so neighboring charts keep aligned heights.
  const total = document.createElement('div');
  total.className = 'rank-total';
  total.textContent = end < rowCount ? 'of ' + rowCount : '\u00a0';
  list.appendChild(total);
  return list;
}

// Tick positions for a scatter axis: a 1/2/5*10^k step sized to give at
// most `count` ticks across the range.
function niceTicks(min, max, count) {
  const span = max - min;
  if (span <= 0) return [min];
  const mag = Math.pow(10, Math.floor(Math.log10(span / count)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => span / s <= count);
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step / 1e6; v += step) ticks.push(v);
  return ticks;
}

// Minor tick positions between the labeled majors, so the inner divisions
// of a step are visible. Each major step splits into round parts — 4 for
// a 2·10^k or 4·10^k step, else 5 — and minors also extend past the
// outermost majors to the padded range edges. Major positions themselves
// are excluded.
function minorTicks(ticks, min, max) {
  if (ticks.length < 2) return [];
  const step = ticks[1] - ticks[0];
  const mant = Math.round(step / Math.pow(10, Math.floor(Math.log10(step) + 1e-9)));
  const perMajor = (mant === 2 || mant === 4) ? 4 : 5;
  const sub = step / perMajor;
  const first = Math.ceil((min - ticks[0]) / sub - 1e-9);
  const last = Math.floor((max - ticks[0]) / sub + 1e-9);
  const minors = [];
  for (let i = first; i <= last; i++) {
    if (((i % perMajor) + perMajor) % perMajor === 0) continue;
    minors.push(ticks[0] + i * sub);
  }
  return minors;
}

// Ticks for a date x-axis (epoch ms): a calendar step from minutes up to
// days, aligned to local wall-clock multiples, labeled HH:mm below a day
// and M/D from a day up. At most 5 ticks: HH:mm labels are the widest kind
// at the title-sized tick font, so more would collide.
function timeTicks(min, max) {
  const MIN = 60e3, HOUR = 3600e3, DAY = 864e5;
  const steps = [MIN, 5 * MIN, 15 * MIN, 30 * MIN, HOUR, 3 * HOUR, 6 * HOUR,
    12 * HOUR, DAY, 2 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 90 * DAY, 180 * DAY, 365 * DAY];
  const span = Math.max(max - min, 1);
  const step = steps.find((s) => span / s <= 5) || 365 * DAY;
  const offMs = new Date(min).getTimezoneOffset() * 60e3;
  const ticks = [];
  for (let t = Math.ceil((min - offMs) / step) * step + offMs; t <= max; t += step) ticks.push(t);
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmt = (t) => {
    const d = new Date(t);
    return step < DAY
      ? pad2(d.getHours()) + ':' + pad2(d.getMinutes())
      : (d.getMonth() + 1) + '/' + d.getDate();
  };
  return { ticks, fmt };
}

//-------TREND LINE (Theil–Sen, chosen 2026-08-22 from a fit sampling)-------

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Theil–Sen line y = a + b·x: the median slope over all point pairs,
// then the median intercept. Outlier games barely move it, unlike least
// squares. Returns null when no pair has distinct x.
function fitTheilSen(pairs) {
  const slopes = [];
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const dx = pairs[j][0] - pairs[i][0];
      if (dx !== 0) slopes.push((pairs[j][1] - pairs[i][1]) / dx);
    }
  }
  if (slopes.length === 0) return null;
  const b = median(slopes);
  return { a: median(pairs.map(([x, y]) => y - b * x)), b };
}

// The chart's trend lines, both dashed and colored by the existing
// color:recency sense of the age palette: the all-data fit in the
// deep-history teal (the years unit), today's fit in the hours blue.
// Either is omitted when its data can't support the fit. Each line
// carries its data's x-extent: a fit is never drawn beyond its own data
// (today's fit on a calendar axis is a segment at today, not a line
// extrapolated across the whole history).
function trendLinesFor(pairs, todayPairs) {
  const lines = [];
  for (const [data, cls] of [[pairs, 'trend-all'], [todayPairs, 'trend-today']]) {
    if (data.length < 2) continue;
    const fit = fitTheilSen(data);
    if (fit === null) continue;
    const xs = data.map((p) => p[0]);
    lines.push({ ...fit, cls, xMin: Math.min(...xs), xMax: Math.max(...xs) });
  }
  return lines;
}

// Unique ids for the per-chart SVG clip paths of the trend lines.
let trendClipSeq = 0;

// Small inline-SVG scatter plot: every win is a dot colored by its age unit
// (the same palette as rank-list ages, so time trends are scannable) and
// faded within that color by how deep into the unit it sits (a 6-day-old
// dot is paler than a 1-day-old one); this game is the black-ringed dot
// labeled with its today-rank. Shows relationships (e.g. does moving the
// mouse faster actually win games faster?) rather than rankings. There is
// no chart title: the terse axis labels, rendered at title size along
// with the tick values, name the chart. opts.timeAxis renders x as a local
// date/time axis; opts.idealLine draws the y = x diagonal (used where y has
// a hard floor at x, e.g. clicks can never beat 3BV). opts.trendLines
// (trendLinesFor output) draws each y = a + b·x entry clipped to the plot
// rect (a today-only fit can exit the all-data frame).
// ageInfoOf maps a win to its {unit, frac} age (see ageInfo).
// opts.trimY drops y-outliers above the Tukey fence (Q3 + 1.5·IQR — the
// box-plot whisker rule: scale-free, and quartiles barely move when an
// outlier appears) so one freak slow win can't stretch the whole axis.
// The me-dot is never dropped, and a corner note counts what's hidden.
function buildScatter(wins, me, fx, fy, xLabel, yLabel, meLabel, ageInfoOf, opts = {}) {
  const W = 270, H = 210, L = 54, R = 10, T = 10, B = 36;
  let shown = wins;
  let hiddenCount = 0;
  let hiddenMax = 0;
  // Quartiles need a few points to mean anything; below 8 wins the fence
  // is noise, so everything shows.
  if (opts.trimY && wins.length >= 8) {
    const sorted = wins.map(fy).sort((a, b) => a - b);
    const q = (p) => {
      const at = (sorted.length - 1) * p;
      const lo = Math.floor(at);
      return sorted[lo] + (at - lo) * ((sorted[lo + 1] ?? sorted[lo]) - sorted[lo]);
    };
    const fence = q(0.75) + 1.5 * (q(0.75) - q(0.25));
    const keep = (s) => fy(s) <= fence || s === me;
    shown = wins.filter(keep);
    hiddenCount = wins.length - shown.length;
    if (hiddenCount > 0) {
      hiddenMax = Math.max(...wins.filter((s) => !keep(s)).map(fy));
    }
  }
  const xs = shown.map(fx), ys = shown.map(fy);
  const pad = (min, max) => {
    const p = (max - min) * 0.04;
    return [min - p, max + p];
  };
  const [x0, x1] = opts.xDomain || pad(Math.min(...xs), Math.max(...xs));
  const [y0, y1] = opts.yDomain || pad(Math.min(...ys), Math.max(...ys));
  const px = (v) => x1 === x0 ? (L + W - R) / 2 : L + (v - x0) / (x1 - x0) * (W - L - R);
  const py = (v) => y1 === y0 ? (T + H - B) / 2 : H - B - (v - y0) / (y1 - y0) * (H - T - B);
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('class', 'scatter-svg');
  const el = (tag, attrs, text) => {
    const node = document.createElementNS(svgNS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    svg.appendChild(node);
    return node;
  };
  el('rect', { x: L, y: T, width: W - L - R, height: H - T - B, class: 'scatter-plot' });
  const tickFmt = (ticks) => {
    const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
    const dec = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
    return (v) => v.toFixed(dec);
  };
  // x caps at 6 ticks (the labels are title-sized, so a 7-tick x-axis can
  // collide with itself); y stacks vertically and takes the full 7.
  let xTicks, fmtX;
  if (opts.xTicks) {
    xTicks = opts.xTicks;
    fmtX = opts.formatX || tickFmt(xTicks);
  } else if (opts.timeAxis) {
    ({ ticks: xTicks, fmt: fmtX } = timeTicks(x0, x1));
  } else {
    xTicks = niceTicks(x0, x1, 6);
    fmtX = tickFmt(xTicks);
  }
  for (const v of xTicks) {
    el('line', { x1: px(v), y1: T, x2: px(v), y2: H - B, class: 'scatter-grid' });
    el('text', { x: px(v), y: H - B + 14, class: 'scatter-tick tick-x' }, fmtX(v));
  }
  const yTicks = niceTicks(y0, y1, 7), fmtY = tickFmt(yTicks);
  for (const v of yTicks) {
    el('line', { x1: L, y1: py(v), x2: W - R, y2: py(v), class: 'scatter-grid' });
    el('text', { x: L - 4, y: py(v) + 4, class: 'scatter-tick tick-y' }, fmtY(v));
  }
  // Minor tickmarks on the axis edges between the labeled divisions.
  // Skipped on the date axis, whose calendar steps (15 min, 3 h, 7 d...)
  // don't subdivide into round parts.
  if (!opts.timeAxis) {
    for (const v of minorTicks(xTicks, x0, x1)) {
      el('line', { x1: px(v), y1: H - B, x2: px(v), y2: H - B + 4, class: 'scatter-minor' });
    }
  }
  for (const v of minorTicks(yTicks, y0, y1)) {
    el('line', { x1: L - 4, y1: py(v), x2: L, y2: py(v), class: 'scatter-minor' });
  }
  if (opts.idealLine) {
    const t0 = Math.max(x0, y0);
    const t1 = Math.min(x1, y1);
    if (t0 < t1) {
      el('line', {
        x1: px(t0).toFixed(1), y1: py(t0).toFixed(1),
        x2: px(t1).toFixed(1), y2: py(t1).toFixed(1),
        class: 'scatter-ideal',
      });
    }
  }
  if (opts.trendLines && opts.trendLines.length > 0) {
    const clipId = 'trend-clip-' + trendClipSeq++;
    const make = (tag) => document.createElementNS(svgNS, tag);
    const defs = make('defs');
    const clip = make('clipPath');
    clip.setAttribute('id', clipId);
    const crect = make('rect');
    for (const [k, v] of Object.entries(
      { x: L, y: T, width: W - L - R, height: H - T - B })) crect.setAttribute(k, v);
    clip.appendChild(crect);
    defs.appendChild(clip);
    svg.appendChild(defs);
    const group = make('g');
    group.setAttribute('clip-path', 'url(#' + clipId + ')');
    svg.appendChild(group);
    for (const t of opts.trendLines) {
      const lo = Math.max(x0, t.xMin);
      const hi = Math.min(x1, t.xMax);
      if (lo >= hi) continue;
      const node = make('line');
      node.setAttribute('x1', px(lo).toFixed(1));
      node.setAttribute('y1', py(t.a + t.b * lo).toFixed(1));
      node.setAttribute('x2', px(hi).toFixed(1));
      node.setAttribute('y2', py(t.a + t.b * hi).toFixed(1));
      node.setAttribute('class', 'scatter-trend ' + t.cls);
      group.appendChild(node);
    }
  }
  const dot = (s, cls, r, opacity) => el('circle', {
    cx: px(fx(s)).toFixed(1), cy: py(fy(s)).toFixed(1), r, class: cls,
    'fill-opacity': opacity,
  });
  // The deeper into its age unit a win sits, the more washed-out its dot:
  // full color on entering the unit, fading to 30% at the far edge.
  for (const s of shown) {
    if (s === me) continue;
    if (opts.neutralDots) {
      dot(s, 'scatter-dot average-dot', '2.8', '0.8');
    } else {
      const age = ageInfoOf(s);
      dot(s, 'scatter-dot age-dot-' + age.unit, '2.2', (1 - 0.7 * age.frac).toFixed(2));
    }
  }
  if (me !== null) {
    const meClass = opts.neutralDots ? 'scatter-me average-dot' :
      'scatter-me age-dot-' + ageInfoOf(me).unit;
    dot(me, meClass, '3.5', '1');
    // Today-rank tag beside the me-dot; flips to the left near the right edge.
    if (meLabel) {
      const meX = px(fx(me));
      const flipLeft = meX > W - R - 50;
      el('text', {
        x: (flipLeft ? meX - 6 : meX + 6).toFixed(1),
        y: Math.max(T + 9, py(fy(me)) - 5).toFixed(1),
        class: 'scatter-me-label' + (flipLeft ? ' flip-left' : ''),
      }, meLabel);
    }
  }
  el('text', { x: L + (W - L - R) / 2, y: H - 4, class: 'scatter-axis-label' }, '\u2192 ' + xLabel);
  el('text', {
    transform: 'translate(12 ' + (T + (H - T - B) / 2) + ') rotate(-90)',
    class: 'scatter-axis-label',
  }, '\u2192 ' + yLabel);
  if (hiddenCount > 0) {
    el('text', { x: W - R - 3, y: T + 11, class: 'scatter-outlier-note' },
      '\u2191 ' + hiddenCount + ' outlier' + (hiddenCount === 1 ? '' : 's')
      + ', max ' + hiddenMax.toFixed(1));
  }

  const list = document.createElement('div');
  list.className = 'rank-list scatter';
  list.append(svg);
  return list;
}

// Bucket wins by the spec's value and average each bucket's solve time:
// the points the average charts plot.
function averagePoints(spec, wins) {
  const groups = new Map();
  for (const win of wins) {
    const key = spec.value(win);
    const group = groups.get(key) || {
      x: key, totalSeconds: 0, count: 0, newestEndedAt: -Infinity,
    };
    group.totalSeconds += secondsOf(win);
    group.count += 1;
    group.newestEndedAt = Math.max(group.newestEndedAt, win.endedAt);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    x: group.x,
    averageSeconds: group.totalSeconds / group.count,
    endedAt: group.newestEndedAt,
  }));
}

// One average chart: bucket averages as dots plus the Theil–Sen trend
// line — solid over all the plotted bucket averages, dashed over bucket
// averages recomputed from today's wins only — captioned with the fit's
// name and math.
function buildAverageScatter(spec, wins, record, historyView) {
  const points = averagePoints(spec, wins);
  const current = historyView
    ? null
    : points.find((point) => point.x === spec.value(record)) || null;
  const referenceMs = historyView ? Date.now() : record.endedAt;
  const asPairs = (pts) => pts.map((p) => [p.x, p.averageSeconds]);
  const todayStart = startOfDay(referenceMs);
  const todayPairs = asPairs(
    averagePoints(spec, wins.filter((w) => w.endedAt >= todayStart)));
  return buildScatter(
    points, current, (point) => point.x, (point) => point.averageSeconds,
    spec.label, 'average time', '',
    (point) => ageInfo(referenceMs, point.endedAt),
    { trendLines: trendLinesFor(asPairs(points), todayPairs) });
}

function trialTimeAgeRow(nowRecord, list) {
  return (i) => {
    const age = relativeAge(nowRecord.endedAt, list[i].endedAt);
    const cells = [
      ['rank-cell', String(i + 1)],
      ['time-cell' + (isMarkless(list[i]) ? ' markless-time' : ''),
        (list[i].timeMs / 1000).toFixed(3) + 's'],
    ];
    if (age.count === 0 && age.unit === 's') {
      cells.push(['age-just-cell age-u-s', 'this']);
    } else {
      cells.push(['age-num-cell age-u-' + age.unit, formatAgeCount(age)]);
      cells.push(['age-unit-cell age-u-' + age.unit, age.unit]);
    }
    return cells;
  };
}

function renderTrialMidRanks(record, modeRecords) {
  const wins = modeRecords.filter((r) => r.outcome === 'win')
    .sort((a, b) => a.timeMs - b.timeMs || a.endedAt - b.endedAt);
  if (wins.length === 0) return;
  resultRanks.appendChild(buildRankList(
    playModeLabel() + ' ' + boardKey(),
    wins.length, wins.indexOf(record), 'rank-grid',
    trialTimeAgeRow(record, wins)));
}

const TRIAL_TRANSFORM_LABELS = {
  id: 'upright',
  rot90: 'turned 90°',
  rot180: 'turned 180°',
  rot270: 'turned 270°',
  flipH: 'flipped sideways',
  flipV: 'flipped upside-down',
  flipD: 'flipped on the diagonal',
  flipAD: 'flipped on the other diagonal',
};

function trialTransformLabel(name) {
  const label = TRIAL_TRANSFORM_LABELS[name];
  if (!label) throw new Error('unknown trial transform ' + name);
  return label;
}

function trialDeltaPhrase(seconds, base) {
  if (seconds === null || base === null) return null;
  const abs = Math.abs(seconds);
  if (abs < 0.05 || (base > 0 && abs / base < 0.05)) return 'about even';
  return (seconds > 0 ? abs.toFixed(2) + 's faster' : abs.toFixed(2) + 's slower');
}

function trialRepeatComparisonCopy(sum) {
  if (sum.identitiesWithTwoWins === 0) {
    return 'Not enough wins on the same board twice to compare meetings.';
  }
  const later = trialDeltaPhrase(sum.withinMean, sum.firstMeetings.meanTime);
  if (later === 'about even') {
    return 'Later meetings of the same board were about as fast as the first.';
  }
  return 'Later meetings of the same board were ' + later + ' than the first.';
}

function formatTrialMeetCell(value, kind) {
  if (value === null || value === undefined) return '—';
  if (kind === 'rate') return Math.round(value * 100) + '%';
  if (kind === 'time') return value.toFixed(2) + 's';
  if (kind === 'bvs') return value.toFixed(2);
  return String(value);
}

function appendTrialMeetTable(parent, showings) {
  const table = document.createElement('div');
  table.className = 'trial-meet-table';
  const header = ['', 'games', 'wins', 'mean time', '3BV/s'];
  for (const label of header) {
    const cell = document.createElement('span');
    cell.className = 'trial-meet-head';
    cell.textContent = label;
    table.appendChild(cell);
  }
  for (let i = 0; i < showings.length; i++) {
    const row = showings[i];
    const cells = [
      trialRunOrdinal(i),
      String(row.n),
      String(row.wins),
      formatTrialMeetCell(row.meanTime, 'time'),
      formatTrialMeetCell(row.meanBvS, 'bvs'),
    ];
    for (const text of cells) {
      const cell = document.createElement('span');
      cell.textContent = text;
      table.appendChild(cell);
    }
  }
  parent.appendChild(table);
}

function appendTrialSessionSummary(parent, summary) {
  const wrap = document.createElement('div');
  wrap.className = 'trial-session-summary';
  const head = document.createElement('div');
  head.className = 'overlay-chart-label';
  head.textContent = 'same board, by meeting (light → dark = earlier → later)';
  wrap.appendChild(head);
  appendNamedBars(wrap, 'mean win time (s)',
    summary.showings.map((s) => s.meanTime === null ? undefined : s.meanTime), SPARK_SMALL);
  appendNamedBars(wrap, 'mean win 3BV/s',
    summary.showings.map((s) => s.meanBvS === null ? undefined : s.meanBvS), SPARK_SMALL);
  appendNamedBars(wrap, 'win rate',
    summary.showings.map((s) => s.winRate === null ? undefined : s.winRate), SPARK_SMALL);
  appendTrialMeetTable(wrap, summary.showings);
  parent.appendChild(wrap);
}

function identitySummaryLine(group) {
  const wins = [];
  let losses = 0;
  for (const attempt of group.attempts) {
    if (attempt.outcome === 'win') wins.push(attempt.timeMs / 1000);
    else losses++;
  }
  let line = 'board ' + (group.identityIndex + 1)
    + ' · ' + group.attempts.length + ' meeting'
    + (group.attempts.length === 1 ? '' : 's')
    + ' · ' + wins.length + ' win' + (wins.length === 1 ? '' : 's');
  if (losses > 0) line += ' · ' + losses + ' loss' + (losses === 1 ? '' : 'es');
  if (settings.shownThings.relationshipCharts && wins.length >= 2) {
    const delta = wins[0] - wins[wins.length - 1];
    line += delta > 0.05
      ? ' · last ' + delta.toFixed(2) + 's faster'
      : delta < -0.05
        ? ' · last ' + (-delta).toFixed(2) + 's slower'
        : ' · last matched first';
  }
  return line;
}

function identityStartsOpen(group, playedCount) {
  if (playedCount <= 1) return true;
  for (const attempt of group.attempts) {
    if (attempt.outcome === 'loss') return true;
  }
  const wins = group.attempts.filter((a) => a.outcome === 'win');
  if (wins.length >= 2) {
    const first = wins[0].timeMs;
    const last = wins[wins.length - 1].timeMs;
    if (first > 0 && Math.abs(first - last) / first >= 0.2) return true;
  }
  return false;
}

function renderTrialReview(session) {
  const summary = Trial.sessionSummary(session);
  const copy = document.getElementById('trial-copy');
  const verdict = document.getElementById('trial-verdict');
  copy.hidden = false;
  copy.textContent = playModeLabel(session.playMode || 'trial')
    + ' ' + (session.endedHow === 'completed' ? 'complete' : 'ended')
    + '\n' + session.width + 'x' + session.height + '/' + session.mines
    + '\n' + session.results.length + ' / ' + Trial.gameCount(session);
  verdict.hidden = false;
  verdict.textContent = trialRepeatComparisonCopy(summary);
  resultSummary.textContent = '';
  resultStats.textContent = '';
  resultAnalysis.textContent = '';
  resultAnalysis.appendChild(buildReportScopeControl(
    () => renderTrialReview(session)));
  resultRanks.textContent = '';
  appendTrialSessionSummary(resultRanks, summary);
  const pendingOverlays = [];
  const groups = Trial.groupedResults(session);
  const playedCount = groups.filter((g) => g.attempts.length > 0).length;
  for (const group of groups) {
    if (group.attempts.length === 0) continue;
    const details = document.createElement('details');
    details.className = 'trial-identity';
    if (identityStartsOpen(group, playedCount)) details.open = true;
    const head = document.createElement('summary');
    head.textContent = identitySummaryLine(group);
    details.appendChild(head);
    const body = document.createElement('div');
    body.className = 'trial-identity-body';
    for (let i = 0; i < group.attempts.length; i++) {
      const attempt = group.attempts[i];
      const seconds = attempt.timeMs / 1000;
      const line = document.createElement('div');
      line.textContent = trialRunOrdinal(i) + '  ' + attempt.outcome + '  '
        + seconds.toFixed(3) + 's  3BV ' + attempt.bv3
        + '  ' + (attempt.bv3 / seconds).toFixed(3) + '/s  '
        + trialTransformLabel(attempt.transform);
      body.appendChild(line);
      if (Array.isArray(attempt.actionEvaluations)
          && attempt.actionEvaluations.length > 0) {
        const report = buildVerdictBlocks({
          outcome: attempt.outcome,
          actionEvaluations: attempt.actionEvaluations,
        });
        if (report) {
          const actionDetails = document.createElement('details');
          actionDetails.className = 'trial-action-report';
          const actionHead = document.createElement('summary');
          actionHead.textContent = 'action report';
          actionDetails.append(actionHead, report);
          body.appendChild(actionDetails);
        }
      }
    }
    if (group.attempts.length >= 2) {
      appendOverlayLegend(body, group.attempts);
      appendTrialAttemptCharts(body, group.attempts);
      pendingOverlays.push({ group: group, box: body, details: details });
    }
    details.appendChild(body);
    resultRanks.appendChild(details);
  }
  if (pendingOverlays.length > 0) {
    loadTracesByEndedAt(session.results.map((r) => r.endedAt), (traces) => {
      if (lastTrialReview !== session) return;
      for (const item of pendingOverlays) {
        const fill = () => {
          if (item.filled) return;
          item.filled = true;
          appendTrialOverlays(item.box, session, item.group, traces);
        };
        if (item.details.open) fill();
        else {
          item.details.addEventListener('toggle', () => {
            if (item.details.open) fill();
          });
        }
      }
    });
  }
}

// Light → dark is earlier → later. One hue family so the order is
// readable without the legend.
const TRIAL_RUN_COLORS = ['#e8b84a', '#e07020', '#b82c14', '#2a0e0c'];
const TRIAL_RUN_ORDINALS = ['1st', '2nd', '3rd', '4th'];

function trialAttemptColor(i) {
  return TRIAL_RUN_COLORS[i % TRIAL_RUN_COLORS.length];
}

function trialRunOrdinal(i) {
  return TRIAL_RUN_ORDINALS[i] || String(i + 1);
}

function trialRunAgeLabel(i, lastIndex) {
  if (i === 0) return 'earliest';
  if (i === lastIndex) return 'latest';
  return trialRunOrdinal(i);
}

function appendOverlayLegend(box, attempts) {
  const legend = document.createElement('div');
  legend.className = 'overlay-legend';
  const last = attempts.length - 1;
  for (let i = 0; i < attempts.length; i++) {
    const item = document.createElement('span');
    const swatch = document.createElement('span');
    swatch.className = 'overlay-swatch';
    swatch.style.background = trialAttemptColor(i);
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(
      trialRunAgeLabel(i, last) + '  '
      + trialTransformLabel(attempts[i].transform)
      + '  ' + attempts[i].outcome));
    legend.appendChild(item);
  }
  box.appendChild(legend);
}

function appendNamedBars(box, label, values, size) {
  const name = document.createElement('div');
  name.className = 'overlay-chart-label';
  name.textContent = label;
  box.appendChild(name);
  box.appendChild(buildBarChart(values, size));
}

function winOnly(attempt, value) {
  return attempt.outcome === 'win' ? value : undefined;
}

function appendTrialAttemptCharts(box, attempts) {
  appendNamedBars(box, 'time (s)',
    attempts.map((a) => winOnly(a, a.timeMs / 1000)), SPARK_SMALL);
  appendNamedBars(box, '3BV/s',
    attempts.map((a) => winOnly(a, a.bv3 / (a.timeMs / 1000))), SPARK_SMALL);
  appendNamedBars(box, 'clicks', attempts.map((a) => a.clicks), SPARK_SMALL);
  appendNamedBars(box, 'efficiency',
    attempts.map((a) => winOnly(a, a.clicks > 0 ? a.bv3 / a.clicks : undefined)), SPARK_SMALL);
}

function loadTracesByEndedAt(endedAts, done) {
  if (db === null) storageFailure('trial overlays failed: database is not open');
  const tx = db.transaction(TRACE_STORE);
  tx.onerror = () => storageFailure('trial overlay load failed: ' + tx.error);
  const store = tx.objectStore(TRACE_STORE);
  const traces = new Map();
  for (const endedAt of endedAts) {
    const request = store.get(endedAt);
    request.onsuccess = () => {
      if (request.result !== undefined) traces.set(endedAt, request.result);
    };
  }
  tx.oncomplete = () => done(traces);
}

function presentedBoard(session, attempt) {
  const identity = session.identities[attempt.identityIndex];
  return {
    mines: Trial.applyMines(identity.mines, session.width, session.height, attempt.transform),
    firstClick: Trial.mapIndex(identity.firstClick, session.width, session.height, attempt.transform),
  };
}

function appendTrialOverlays(box, session, group, traces) {
  const runs = [];
  for (let i = 0; i < group.attempts.length; i++) {
    const stored = traces.get(group.attempts[i].endedAt);
    if (stored === undefined) continue;
    const board = presentedBoard(session, group.attempts[i]);
    const progress = Trial.replayProgress(
      session.width, session.height, board.mines, board.firstClick, stored.events,
      { givenOpening: group.attempts[i].givenOpening !== false });
    const samples = {
      t: Array.from(stored.sampleT),
      x: Array.from(stored.sampleX),
      y: Array.from(stored.sampleY),
    };
    const wall = stored.endedAt - stored.startedAt;
    runs.push({
      colorIndex: i,
      progress: progress,
      path: Trial.runningPath(samples.t, samples.x, samples.y),
      speed: Trial.runningSpeed(samples.t, samples.x, samples.y),
      board: Trial.identityBoardSamples(
        samples.t, samples.x, samples.y, stored.events,
        group.attempts[i].transform, session.width, session.height),
      metrics: computeAllTraceMetrics(samples.t, samples.x, samples.y, stored.events, wall),
    });
  }
  if (runs.length < 2) return;

  const overlayHead = document.createElement('div');
  overlayHead.className = 'overlay-chart-label';
  overlayHead.textContent = 'overlaid in time (light = earlier · dark = later)';
  box.appendChild(overlayHead);
  appendOverlayLegend(box, group.attempts);

  const overlay = (label, pick) => {
    const name = document.createElement('div');
    name.className = 'overlay-chart-label';
    name.textContent = label;
    box.appendChild(name);
    box.appendChild(buildOverlaySparkline(runs.map((run) => pick(run)), SPARK_LARGE));
  };
  overlay('open squares', (run) => ({
    colorIndex: run.colorIndex, tMs: run.progress.tMs, values: run.progress.opened,
  }));
  overlay('squares unopened', (run) => ({
    colorIndex: run.colorIndex, tMs: run.progress.tMs, values: run.progress.unopened,
  }));
  overlay('flags', (run) => ({
    colorIndex: run.colorIndex, tMs: run.progress.tMs, values: run.progress.flags,
  }));
  overlay('mines unmarked', (run) => ({
    colorIndex: run.colorIndex, tMs: run.progress.tMs, values: run.progress.unmarked,
  }));
  overlay('cursor path (px)', (run) => ({
    colorIndex: run.colorIndex, tMs: run.path.tMs, values: run.path.values,
  }));
  appendTrialSpeedOverlay(box, runs);
  overlay('cursor x (identity px)', (run) => ({
    colorIndex: run.colorIndex, tMs: run.board.tMs, values: run.board.x,
  }));
  overlay('cursor y (identity px)', (run) => ({
    colorIndex: run.colorIndex, tMs: run.board.tMs, values: run.board.y,
  }));

  for (const groupDef of TRACE_METRIC_GROUPS) {
    const head = document.createElement('div');
    head.className = 'overlay-chart-label';
    head.textContent = groupDef.name;
    box.appendChild(head);
    for (const display of groupDef.displays) {
      const values = runs.map((run) => displayableNumber(display.of(run.metrics)));
      if (values.every((v) => v === undefined)) continue;
      appendNamedBars(box, display.label, values, SPARK_SMALL);
    }
  }
}

let trialSpeedBucketMs = 200;

function speedOverlayRuns(runs, widthMs) {
  return runs.map((run) => {
    const bucketed = Trial.bucketSeries(run.speed.tMs, run.speed.values, widthMs);
    return { colorIndex: run.colorIndex, tMs: bucketed.tMs, values: bucketed.values };
  });
}

function appendTrialSpeedOverlay(box, runs) {
  const name = document.createElement('div');
  name.className = 'overlay-chart-label';
  name.textContent = 'cursor speed (px/s)';
  box.appendChild(name);
  const controls = document.createElement('div');
  controls.className = 'trial-speed-bucket';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '800';
  slider.step = '25';
  slider.value = String(trialSpeedBucketMs);
  const readout = document.createElement('span');
  const syncReadout = () => {
    readout.textContent = trialSpeedBucketMs === 0
      ? 'raw samples'
      : trialSpeedBucketMs + ' ms average';
  };
  syncReadout();
  controls.append(slider, readout);
  box.appendChild(controls);
  const host = document.createElement('div');
  host.className = 'trial-speed-chart';
  box.appendChild(host);
  const redraw = () => {
    host.textContent = '';
    host.appendChild(buildOverlaySparkline(speedOverlayRuns(runs, trialSpeedBucketMs), SPARK_LARGE));
  };
  slider.addEventListener('input', () => {
    trialSpeedBucketMs = Number(slider.value);
    syncReadout();
    redraw();
  });
  redraw();
}

function overlayQuantile(sorted, q) {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

// Tukey fences, but never tighter than the 5th–95th so a mostly-still
// cursor does not hide ordinary flicks. Extreme sample-to-sample speeds
// (a 13k px/s spike from a tiny dt) stay off the axis.
function overlayAxisBounds(values) {
  const xs = [];
  for (const v of values) {
    if (v === undefined || !Number.isFinite(v)) continue;
    xs.push(v);
  }
  xs.sort((a, b) => a - b);
  if (xs.length === 0) return null;
  if (xs.length < 8) return { min: xs[0], max: xs[xs.length - 1] };
  const q1 = overlayQuantile(xs, 0.25);
  const q3 = overlayQuantile(xs, 0.75);
  const fence = 1.5 * (q3 - q1);
  let min = Math.min(q1 - fence, overlayQuantile(xs, 0.05));
  let max = Math.max(q3 + fence, overlayQuantile(xs, 0.95));
  min = Math.max(min, xs[0]);
  max = Math.min(max, xs[xs.length - 1]);
  return { min: min, max: max };
}

function buildOverlaySparkline(runs, size) {
  const { width, height, left, bottom } = size;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  const frame = document.createElementNS(SVG_NS, 'rect');
  frame.setAttribute('class', 'spark-frame');
  frame.setAttribute('x', left);
  frame.setAttribute('y', 1);
  frame.setAttribute('width', width - left - 1);
  frame.setAttribute('height', height - bottom - 2);
  svg.appendChild(frame);

  const pooled = [];
  let tEnd = 0;
  for (const run of runs) {
    if (run.tMs.length > 0 && run.tMs[run.tMs.length - 1] > tEnd) {
      tEnd = run.tMs[run.tMs.length - 1];
    }
    for (const v of run.values) pooled.push(v);
  }
  const bounds = overlayAxisBounds(pooled);
  if (bounds === null) return svg;
  let min = bounds.min;
  let max = bounds.max;
  const labelMin = min;
  const labelMax = max;
  if (min === max) { min -= 0.5; max += 0.5; }

  const yTop = 2;
  const yBot = height - bottom - 2;
  const xOf = (t) => left + (tEnd > 0 ? (t / tEnd) * (width - left - 3) : 0) + 1;
  const yOf = (v) => {
    const clamped = Math.min(max, Math.max(min, v));
    const y = yTop + (1 - (clamped - min) / (max - min)) * (yBot - yTop);
    return y;
  };

  for (const run of runs) {
    let d = '';
    let pen = false;
    let lastX = null;
    let lastY = null;
    for (let i = 0; i < run.values.length; i++) {
      if (run.values[i] === undefined) { pen = false; continue; }
      lastX = xOf(run.tMs[i]);
      lastY = yOf(run.values[i]);
      d += (pen ? 'L' : 'M') + lastX.toFixed(1) + ' ' + lastY.toFixed(1);
      pen = true;
    }
    if (d === '') continue;
    const line = document.createElementNS(SVG_NS, 'path');
    line.setAttribute('class', 'spark-line spark-line-' + run.colorIndex);
    line.setAttribute('d', d);
    svg.appendChild(line);
    if (lastX !== null) {
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('class', 'spark-dot spark-dot-' + run.colorIndex);
      dot.setAttribute('cx', lastX.toFixed(1));
      dot.setAttribute('cy', lastY.toFixed(1));
      dot.setAttribute('r', size.dotR);
      svg.appendChild(dot);
    }
  }

  const textAt = (x, y, anchor, content) => {
    const el = document.createElementNS(SVG_NS, 'text');
    el.setAttribute('class', size.labelClass);
    el.setAttribute('x', x);
    el.setAttribute('y', y);
    el.setAttribute('text-anchor', anchor);
    el.textContent = content;
    svg.appendChild(el);
  };
  textAt(left - 2, 8, 'end', sparkAxisNumber(labelMax));
  textAt(left - 2, height - bottom - 1, 'end', sparkAxisNumber(labelMin));
  textAt(left, height - 1, 'start', '0');
  textAt(width - 2, height - 1, 'end', (tEnd / 1000).toFixed(0) + 's');
  return svg;
}

function buildBarChart(values, size) {
  const { width, height, left, bottom } = size;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  const frame = document.createElementNS(SVG_NS, 'rect');
  frame.setAttribute('class', 'spark-frame');
  frame.setAttribute('x', left);
  frame.setAttribute('y', 1);
  frame.setAttribute('width', width - left - 1);
  frame.setAttribute('height', height - bottom - 2);
  svg.appendChild(frame);

  let min = 0;
  let max = -Infinity;
  let defined = 0;
  for (const v of values) {
    if (v === undefined) continue;
    defined++;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (defined === 0) return svg;
  const labelMax = max;
  if (min === max) { max = min === 0 ? 1 : max * 1.1; }

  const plotLeft = left + 1;
  const plotWidth = width - left - 3;
  const plotTop = 2;
  const plotHeight = height - bottom - 4;
  const yOf = (v) => plotTop + (1 - (v - min) / (max - min)) * plotHeight;
  const baseline = yOf(0);
  const slot = plotWidth / values.length;

  const textAt = (x, y, anchor, content) => {
    const el = document.createElementNS(SVG_NS, 'text');
    el.setAttribute('class', size.labelClass);
    el.setAttribute('x', x);
    el.setAttribute('y', y);
    el.setAttribute('text-anchor', anchor);
    el.textContent = content;
    svg.appendChild(el);
  };

  for (let i = 0; i < values.length; i++) {
    if (values[i] === undefined) continue;
    const barW = Math.max(4, slot * 0.6);
    const cx = plotLeft + (i + 0.5) * slot;
    const y = yOf(values[i]);
    const bar = document.createElementNS(SVG_NS, 'rect');
    bar.setAttribute('class', 'spark-bar spark-bar-' + (i % 4));
    bar.setAttribute('x', (cx - barW / 2).toFixed(1));
    bar.setAttribute('y', Math.min(y, baseline).toFixed(1));
    bar.setAttribute('width', barW.toFixed(1));
    bar.setAttribute('height', Math.max(1, Math.abs(baseline - y)).toFixed(1));
    svg.appendChild(bar);
    textAt(cx, height - 1, 'middle', trialRunOrdinal(i));
  }
  textAt(left - 2, 8, 'end', sparkAxisNumber(labelMax));
  textAt(left - 2, height - bottom - 1, 'end', sparkAxisNumber(min));
  return svg;
}

function renderRanks(record, modeRecords, options = {}, sections) {
  const wins = modeRecords.filter((r) => r.outcome === 'win');
  const historyView = options.historyView === true;
  const referenceMs = historyView ? Date.now() : record.endedAt;
  const selectedIndex = (list) => historyView ? -1 : list.indexOf(record);
  // Row builder shared by every time-ranked list: rank, solve time, and the
  // win's age split into count and unit cells (or a single "this" marking
  // the game that just finished).
  const timeAgeRow = (list) => (i) => {
    const age = relativeAge(referenceMs, list[i].endedAt);
    const cells = [
      ['rank-cell', String(i + 1)],
      // Markless games carry a small (m) before their time (CSS ::before).
      ['time-cell' + (isMarkless(list[i]) ? ' markless-time' : ''),
        (list[i].timeMs / 1000).toFixed(3) + 's'],
    ];
    if (!historyView && list[i] === record) {
      cells.push(['age-just-cell age-u-s', 'this']);
    } else {
      cells.push(['age-num-cell age-u-' + age.unit, formatAgeCount(age)]);
      cells.push(['age-unit-cell age-u-' + age.unit, age.unit]);
    }
    return cells;
  };
  // Progressive disclosure (the collapseDuplicateCharts setting, on by
  // default): two lists holding the exact same wins would render
  // identically, so only the most specific one of each such group is shown,
  // and broader charts appear on their own once history spreads across
  // enough hours/days/weekdays to make them differ. Exception: "lifetime"
  // and "past week" (2026-08-22) always render, and claim their content
  // first, so any window holding the exact same wins collapses into one
  // of them rather than the other way around. Switched off, every window
  // renders its own chart regardless of duplication.
  const candidates = rankColumns(referenceMs)
    .filter((column) => settings.shownThings.lastOneMinute || column.label !== 'past 1 min')
    .map((column) => {
      const inWindow = wins.filter(column.filter).sort(compareRankedWins);
      return {
        label: column.label,
        displayOrder: column.displayOrder,
        dedupePriority: column.dedupePriority,
        summaryTiePriority: column.summaryTiePriority,
        column,
        inWindow,
        wins: inWindow,
      };
    });
  const kept = new Set(candidates);
  if (settings.collapseDuplicateCharts) {
    kept.clear();
    for (const candidate of dedupeRankCandidates(candidates, ['lifetime', 'past week'])) {
      kept.add(candidate);
    }
  }
  if (settings.shownThings.timeTables) {
    for (const c of candidates) {
      if (!kept.has(c)) continue;
      const { column, inWindow } = c;
      sections.append('rankings', buildRankList(
        column.label,
        inWindow.length, selectedIndex(inWindow), 'rank-grid',
        timeAgeRow(inWindow)));
    }
  }

  // Best times on boards of this exact 3BV: the fairest time comparison,
  // since only equally-hard layouts compete.
  if (settings.shownThings.exact3BV) {
    const sameBv = wins.filter((s) => s.bv3 === record.bv3)
      .sort(compareRankedWins);
    sections.append('rankings', buildRankList(
      '3BV ' + record.bv3,
      sameBv.length, selectedIndex(sameBv), 'rank-grid',
      timeAgeRow(sameBv)));
  }

  // Recent placements (requested 2026-08-23): which top-tenth ranks on
  // the longer charts were earned within the chosen recent window.
  if (settings.shownThings.recentPlacements) {
    sections.append('placements',
      buildRecentPlacements(record, wins, referenceMs, !historyView));
  }

  // Board-shape time lists: this win's finished-board family only.
  // Older wins that lack the measurement stay off the list. Nested
  // filters (max 2 ⊂ max 3 ⊂ max 4) collapse under the same setting
  // as the window charts, most specific first.
  const shapeCandidates = boardShapeCandidates(record, wins)
    .filter((candidate) => settings.shownThings.largestIsland
      || !candidate.label.startsWith('largest island '));
  const shapeKept = new Set(shapeCandidates);
  if (settings.collapseDuplicateCharts) {
    shapeKept.clear();
    const dedupeCandidates = shapeCandidates
      .map((candidate) => ({ ...candidate, wins: candidate.rows }));
    for (const candidate of dedupeRankCandidates(dedupeCandidates)) {
      shapeKept.add(shapeCandidates.find((original) => original.label === candidate.label));
    }
  }
  if (settings.shownThings.boardShapeTables) {
    for (const c of shapeCandidates) {
      if (!shapeKept.has(c)) continue;
      const inWindow = c.rows.slice().sort(compareRankedWins);
      sections.append('rankings', buildRankList(
        c.label,
        inWindow.length, selectedIndex(inWindow), 'rank-grid',
        timeAgeRow(inWindow)));
    }
  }

  if (settings.shownThings.averageCharts && wins.length >= 2) {
    for (const spec of AVERAGE_SCATTER_SPECS) {
      sections.append('averages',
        buildAverageScatter(spec, wins, record, historyView));
    }
  }

  // Streak lists: wins in chronological runs split by losses. A k-loss
  // streak joins k+1 adjacent runs; the streak ending in this win is "me".
  // modeRecords is chronological (appended in play order; import re-sorts).
  const runs = [[]];
  for (const r of modeRecords) {
    if (r.outcome === 'win') runs[runs.length - 1].push(r.endedAt);
    else runs.push([]);
  }
  for (const [label, slack] of [['streak', 0], ['near-streak', 1], ['near-near-streak', 2]]) {
    if (label === 'streak' && !settings.shownThings.streak) continue;
    if (label === 'near-streak' && !settings.shownThings.nearStreak) continue;
    if (label === 'near-near-streak' && !settings.shownThings.nearNearStreak) continue;
    const span = Math.min(slack + 1, runs.length);
    // Each window of `span` adjacent runs is trimmed to its nonempty core
    // (consecutive losses leave empty runs that pad windows). Identical
    // cores are deduped and cores strictly inside a wider core are dropped,
    // so a sub-streak never appears alongside the wider streak containing
    // it. Windows that merely overlap (sharing a middle run across two
    // different losses) are distinct streaks and both stay.
    const cores = new Map(); // 'a-b' -> {a, b} inclusive run-index range
    for (let i = 0; i + span <= runs.length; i++) {
      let a = -1, b = -1;
      for (let j = i; j < i + span; j++) {
        if (runs[j].length === 0) continue;
        if (a === -1) a = j;
        b = j;
      }
      if (a === -1) continue;
      cores.set(a + '-' + b, { a, b });
    }
    const allCores = [...cores.values()];
    const segments = allCores
      .filter((c) => !allCores.some((o) => o.a <= c.a && c.b <= o.b && (o.a < c.a || o.b > c.b)))
      .map(({ a, b }) => {
        const winsAt = runs.slice(a, b + 1).flat();
        return { len: winsAt.length, end: winsAt[winsAt.length - 1], current: b === runs.length - 1 };
      });
    segments.sort((a, b) => b.len - a.len || b.end - a.end);
    const myIndex = historyView ? -1 : segments.findIndex((seg) => seg.current);
    sections.append('streaks', buildRankList(
      label,
      segments.length, myIndex, 'rank-grid',
      (i) => {
        const seg = segments[i];
        const age = relativeAge(referenceMs, seg.end);
        const cells = [
          ['rank-cell', String(i + 1)],
          ['time-cell', seg.len + (seg.len === 1 ? ' win' : ' wins')],
        ];
        if (!historyView && seg.current) {
          cells.push(['age-just-cell age-u-s', 'this']);
        } else {
          cells.push(['age-num-cell age-u-' + age.unit, formatAgeCount(age)]);
          cells.push(['age-unit-cell age-u-' + age.unit, age.unit]);
        }
        return cells;
      }));
  }

  // Scatter plots at the very bottom, each raw win value against win time
  // (or clicks). Needs at least 2 wins to have a spread. These are the
  // "relationship charts": the switch had described them all along but
  // never actually gated them until 2026-08-23.
  if (settings.shownThings.relationshipCharts && wins.length >= 2) {
    const todayStart = startOfDay(record.endedAt);
    const todayRank = wins
      .filter((s) => s.endedAt >= todayStart)
      .sort(compareRankedWins)
      .indexOf(record) + 1;
    const meLabel = todayRank + ' today';
    const highlighted = historyView ? null : record;
    const ageInfoOf = (s) => ageInfo(referenceMs, s.endedAt);
    const hourOfDay = (s) => {
      const d = new Date(s.endedAt);
      return d.getHours() + d.getMinutes() / 60;
    };
    // The same Theil–Sen trend pair as the average charts, fit on all
    // wins and on today's (local midnight of referenceMs, like the
    // average charts) — always on the untrimmed values, even where trimY
    // hides outliers from display (the fit resists outliers by
    // construction). Not on "time of day" (a straight line on a circular
    // axis would mislead) nor "no-op clicks" (tied small-integer x
    // leaves too few effective slopes).
    const trendTodayWins = wins.filter((s) => s.endedAt >= startOfDay(referenceMs));
    const trendOpts = (fx, fy) => ({
      trendLines: trendLinesFor(
        wins.map((s) => [fx(s), fy(s)]),
        trendTodayWins.map((s) => [fx(s), fy(s)])),
    });
    const endedAtOf = (s) => s.endedAt;
    const bv3Of = (s) => s.bv3;
    const clicksOf = (s) => s.clicks;
    // Axis labels stay terse — one or two words, no units or asides; the
    // tick values carry the scale. "date" spreads wins across the calendar;
    // "time of day" folds every win onto one 24-hour clock, exposing the
    // daily rhythm instead of the long-term trend.
    const appendScatter = (svg) => sections.append('relationships', svg);
    appendScatter(buildScatter(
      wins, highlighted, endedAtOf, secondsOf,
      'date', 'time', meLabel, ageInfoOf,
      { timeAxis: true, trimY: true, ...trendOpts(endedAtOf, secondsOf) }));
    appendScatter(buildScatter(
      wins, highlighted, hourOfDay, secondsOf,
      'time of day', 'time', meLabel, ageInfoOf,
      { xDomain: [0, 24], xTicks: [0, 4, 8, 12, 16, 20, 24], trimY: true }));
    appendScatter(buildScatter(
      wins, highlighted, bv3Of, secondsOf,
      '3BV', 'time', meLabel, ageInfoOf,
      { trimY: true, ...trendOpts(bv3Of, secondsOf) }));
    appendScatter(buildScatter(
      wins, highlighted, bv3Of, clicksOf,
      '3BV', 'clicks', meLabel, ageInfoOf,
      { idealLine: true, ...trendOpts(bv3Of, clicksOf) }));
    // Only wins that carry the wastedClicks measurement (recorded since
    // 2026-08-19) can appear on its chart.
    const withWasted = wins.filter((s) => 'wastedClicks' in s);
    if (withWasted.length >= 2) {
      appendScatter(buildScatter(
        withWasted, historyView ? null : record, (s) => s.wastedClicks, secondsOf,
        'no-op clicks', 'time', meLabel, ageInfoOf, { trimY: true }));
    }
    const legend = document.createElement('div');
    legend.className = 'scatter-legend';
    legend.appendChild(document.createTextNode('dot color = how long ago that win was (dots fade as they age within a color):'));
    for (const [unit, name] of [['s', 'seconds'], ['m', 'minutes'], ['h', 'hours'],
      ['d', 'days'], ['w', 'weeks'], ['mo', 'months'], ['y', 'years']]) {
      const item = document.createElement('span');
      item.className = 'legend-item age-u-' + unit;
      item.textContent = name;
      legend.appendChild(item);
    }
    sections.append('relationships', legend);
  }
}

//-------PERSISTENT STORAGE (shared machinery lives in storage.js)-------

// The database open, upgrade path, readAllUserdata, and persistUserdata
// moved to storage.js on 2026-08-23, shared with the settings page. This
// page supplies the two hooks storage.js calls: storageFailure and
// userdataReady. Traces are far too large for RAM and are written
// straight to their store (see the trace section below).

// A failure to open the database or to persist data is a bug to fix, not a
// mode to tolerate: announce where the player can see it, and throw.
function storageFailure(what) {
  backupStatus.textContent = what;
  const startupStatus = document.getElementById('startup-status');
  if (document.documentElement.classList.contains('game-booting') && startupStatus !== null) {
    startupStatus.textContent = 'Could not load your saved game. ' + what;
    startupStatus.classList.add('startup-error');
    document.body.removeAttribute('aria-busy');
  }
  throw new Error(what);
}

// Reads every userdata kind into its RAM object, then finishes startup:
// init() builds the states panel and the first board, all of which read RAM.
function userdataReady() {
  readAllUserdata((got) => {
    // An absent kind is a player who never stored it, not an error.
    const loaded = normalizeHistory(got.history === undefined ? {} : got.history);
    history = loaded.history;
    if (loaded.changed) persistUserdata('history', history);
    settings = settingsFrom(got.settings === undefined ? {} : got.settings);
    playerStates = got.states === undefined
      ? DEFAULT_STATE_NAMES.map((name) => ({ name, active: false }))
      : got.states;
    trialSession = got.trial === undefined ? null : got.trial;
    init();
  });
}

//-------RAW INPUT TRACE (full per-game cursor and click stream)-------

// Decided 2026-08-20 (PRODUCT.md "Raw input traces"): every finished game
// keeps its complete input stream — cursor samples, button events, board
// geometry — as the ground truth behind all motion metrics. Scalar record
// fields summarize; the trace is what lets any future metric be computed
// over past games too. Traces live in their own store, keyed by endedAt
// exactly like the history records, and are never held in RAM.
//
// A trace runs from board creation (newGame) to finish. Pre-first-click
// movement is warmup and is real data, so sampling covers 'ready' as well
// as 'playing'; post-game movement belongs to no game and is not captured.
// Timestamps are ms relative to the trace's start (startedAt holds the
// absolute epoch ms). layout events snapshot the board's bounding rect,
// re-recorded on scroll, resize, and zoom, so every (x,y) sample stays
// mappable to a board cell forever.

let trace = null;

function beginTrace() {
  trace = {
    startedAt: Date.now(),
    t0: performance.now(),
    t: [], x: [], y: [],   // cursor samples, one entry per mousemove
    events: [],            // button, layout, and decision events
  };
  recordLayout();
  // The metrics panel flips back to live immediately with fresh series:
  // the previous game's final values and sparklines must not linger over
  // a running trace.
  beginTraceMetricsSeries();
  renderLiveTraceMetrics();
}

// trace is null between script load and the first newGame() (init() awaits
// IndexedDB first), and gameState is born 'ready' — so a mousemove in that
// window must not count as tracing.
function tracing() {
  return trace !== null && (gameState === 'ready' || gameState === 'playing');
}

// Board geometry snapshot: with the rect and the board's cell dimensions,
// any sample (x,y) maps to a cell index offline.
function recordLayout() {
  const rect = boardElement.getBoundingClientRect();
  trace.events.push({
    t: performance.now() - trace.t0,
    kind: 'layout',
    left: rect.left, top: rect.top, width: rect.width, height: rect.height,
    boardWidth: config.width, boardHeight: config.height,
  });
}

// The board also moves when content around it appears or disappears —
// the metrics panel showing, hiding, collapsing, or being drag-resized
// shifts the centered column — and no scroll, resize, or zoom event
// fires then. Rather than enumerating movers, the recorder compares the
// live rect to the last recorded one wherever the trace is already
// touched: before every button event (clicks always map exactly) and in
// renderMetricsPanel (the known mover's own render path, which the
// live-metrics tick also reaches once a second as a catch-all).
function recordLayoutIfMoved() {
  if (!tracing()) return;
  let last = null;
  for (let i = trace.events.length - 1; i >= 0; i--) {
    if (trace.events[i].kind === 'layout') {
      last = trace.events[i];
      break;
    }
  }
  const rect = boardElement.getBoundingClientRect();
  if (last !== null && rect.left === last.left && rect.top === last.top
      && rect.width === last.width && rect.height === last.height) return;
  recordLayout();
}

// kind: 'ldown' | 'lup' | 'rdown'. index is the board cell the event hit,
// or null (an 'lup' released off the cells while the button was down).
function traceEvent(kind, event, index) {
  recordLayoutIfMoved();
  trace.events.push({
    t: performance.now() - trace.t0,
    atMs: gameState === 'playing' ? elapsedMs() : 0,
    kind: kind,
    x: event.clientX,
    y: event.clientY,
    index: index,
  });
}

// Every accepted board action gets one exact pre-action player view and the
// choices measured from it. This belongs in the raw trace: it is the durable
// time-aligned source for replay and later decision analysis, while the game
// record keeps only the reportable mistake subset.
function traceDecision(evaluation) {
  if (!tracing()) return;
  let input;
  for (let i = trace.events.length - 1; i >= 0; i--) {
    const event = trace.events[i];
    if ((event.kind === 'lup' || event.kind === 'rdown')
        && event.index !== null) {
      input = event;
      break;
    }
  }
  if (input === undefined) {
    throw new Error('accepted board action has no input trace event');
  }
  evaluation.atMs = input.atMs;
  // No-op report entries deliberately stay compact in scalar history. Their
  // unchanged pre-action board is added only to the raw trace copy needed by
  // replay, never back onto the persisted report object.
  const traceEvaluation = evaluation.position === undefined
    ? { ...evaluation, position: visiblePositionSnapshot() }
    : evaluation;
  trace.events.push({
    t: input.t,
    kind: 'decision',
    x: input.x,
    y: input.y,
    evaluation: traceEvaluation,
  });
}

// Stored trace: identity fields matching the game record, plus the sample
// arrays as typed arrays (compact; IndexedDB stores them natively).
function saveTrace(record) {
  if (db === null) storageFailure('trace not saved: database is not open');
  const stored = {
    endedAt: record.endedAt,
    mode: modeKey(),
    outcome: record.outcome,
    justiceEnabled: record.justiceEnabled,
    seed: record.seed,
    rngVersion: record.rngVersion,
    boardVersion: record.boardVersion,
    justiceVersion: record.justiceVersion,
    startedAt: trace.startedAt,
    sampleT: Float64Array.from(trace.t),
    sampleX: Float32Array.from(trace.x),
    sampleY: Float32Array.from(trace.y),
    events: trace.events,
  };
  const tx = db.transaction(TRACE_STORE, 'readwrite');
  tx.objectStore(TRACE_STORE).put(stored);
  tx.onerror = () => storageFailure('trace save failed: ' + tx.error);
}

//-------PATH REPLAY: COMPUTATION-------

// The same Tukey inner-fence rule used by the lower scatter charts keeps an
// extreme pause or coalesced burst from flattening every local color
// difference. Values remain data; only the display range is trimmed.
function pathDisplayRange(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return undefined;
  const q = (p) => {
    const at = (sorted.length - 1) * p;
    const lo = Math.floor(at);
    const hi = Math.ceil(at);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
  };
  let shown = sorted;
  if (sorted.length >= 8) {
    const q1 = q(0.25);
    const q3 = q(0.75);
    const iqr = q3 - q1;
    const low = q1 - 1.5 * iqr;
    const high = q3 + 1.5 * iqr;
    shown = sorted.filter((value) => value >= low && value <= high);
  }
  let min = shown[0];
  let max = shown[shown.length - 1];
  return {
    min,
    max,
    trimmed: sorted.length - shown.length,
  };
}

function pathDecisionEvents(events) {
  return events
    .filter((event) => event.kind === 'decision'
      && event.evaluation && event.evaluation.position)
    .sort((a, b) => a.t - b.t);
}

function pathClickEvents(events) {
  return events
    .filter((event) => (event.kind === 'lup' || event.kind === 'rdown')
      && Number.isFinite(event.x) && Number.isFinite(event.y))
    .sort((a, b) => a.t - b.t);
}

function pathDecisionProgress(decision) {
  const position = decision.evaluation.position;
  const safeCells = position.width * position.height - position.mines;
  return safeCells > 0 ? position.revealed.length / safeCells : 0;
}

function pathDecisionIsLessUseful(decision) {
  return Array.isArray(decision.evaluation.mistakes)
    && decision.evaluation.mistakes.length > 0;
}

// Context roles for each run of less-useful actions. The useful action before
// a run and the next useful action after it stay visible, so the overlay shows
// a complete measurable episode rather than disconnected red fragments.
function pathLessUsefulRoles(decisions) {
  const roles = decisions.map(() => ({ before: false, less: false, after: false }));
  let i = 0;
  while (i < decisions.length) {
    if (!pathDecisionIsLessUseful(decisions[i])) {
      i++;
      continue;
    }
    if (i > 0) roles[i - 1].before = true;
    while (i < decisions.length && pathDecisionIsLessUseful(decisions[i])) {
      roles[i].less = true;
      i++;
    }
    if (i < decisions.length) roles[i].after = true;
  }
  return roles;
}

// Uncertain reasonable-choice cells become connected areas for replay
// callouts. Eight-neighbor connectivity matches the way a Minesweeper pocket
// reads visually; deterministic ordering keeps side labels stable.
function pathChoiceAreas(evaluation) {
  const position = evaluation.position;
  if (!position) return [];
  const width = position.width;
  const height = position.height;
  const areas = [];
  for (const choice of evaluation.choices || []) {
    if (!(typeof choice.risk === 'number' && choice.risk > 0 && choice.risk < 1)
        || !Array.isArray(choice.cells)) continue;
    const remaining = new Set(choice.cells.filter((cell) =>
      Number.isInteger(cell) && cell >= 0 && cell < width * height));
    while (remaining.size > 0) {
      const first = Math.min(...remaining);
      remaining.delete(first);
      const cells = [];
      const queue = [first];
      while (queue.length > 0) {
        const cell = queue.pop();
        cells.push(cell);
        const x = cell % width;
        const y = Math.floor(cell / width);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            const neighbor = ny * width + nx;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height
                && remaining.delete(neighbor)) queue.push(neighbor);
          }
        }
      }
      cells.sort((a, b) => a - b);
      areas.push({ kind: choice.kind, risk: choice.risk, cells });
    }
  }
  return areas.sort((a, b) => a.cells[0] - b.cells[0]);
}

function pathRiskLabel(risk) {
  if (Math.abs(risk - 0.5) <= 1e-12) return '50/50';
  const pct = risk * 100;
  if (pct < 0.1) return '<0.1% mine';
  if (pct > 99.9) return '>99.9% mine';
  const shown = Math.round(pct * 10) / 10;
  return (Number.isInteger(shown) ? shown.toFixed(0) : shown.toFixed(1)) + '% mine';
}

function pathHeatColor(value, range) {
  if (range.max <= range.min) return 'hsl(110, 88%, 42%)';
  const fraction = Math.max(0, Math.min(1,
    (value - range.min) / (range.max - range.min)));
  return 'hsl(' + (220 * (1 - fraction)).toFixed(1) + ', 88%, 42%)';
}

//-------PATH REPLAY: DISPLAY-------

// The just-finished trace remains in RAM until the next board. Its decision
// events are also persisted in the trace store, preserving exact player-view
// positions and measured choices for future historical analysis.
const PATH_VIEW_IDS = new Set([
  'off', 'raw-path', 'click-locations',
  'movement-speed', 'click-speed', 'progress', 'less-useful',
]);
let pathView = 'off';
let replayEnabled = false;
let pathCanvas = null;
let pathResizeObserver = null;
let replayFinishedCells = null;
let replayStep = 0;
const pathViewControl = document.getElementById('path-view-control');
const pathViewButtons = [...pathViewControl.querySelectorAll('[data-path-view]')];
const pathViewLegend = document.getElementById('path-view-legend');
const replayToggle = document.getElementById('replay-toggle');
const replayControls = document.getElementById('replay-controls');
const replayPrevious = document.getElementById('replay-prev');
const replayNext = document.getElementById('replay-next');
const replayStatus = document.getElementById('replay-status');

function pathViewAvailable() {
  return (gameState === 'won' || gameState === 'lost')
    && trace !== null
    && !document.getElementById('game-frame').hidden;
}

function renderPathViewControls() {
  const available = pathViewAvailable();
  pathViewControl.hidden = !available;
  for (const button of pathViewButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.pathView === pathView));
  }
  replayToggle.setAttribute('aria-pressed', String(replayEnabled));
  replayControls.hidden = !replayEnabled || !available;
}

// One mapper per drawing pass: points arrive in trace-time order, so the
// active layout event only ever advances.
function pathPointMapper(width, height) {
  const layouts = trace.events.filter((e) => e.kind === 'layout');
  let i = 0;
  return (t, x, y) => {
    while (i + 1 < layouts.length && layouts[i + 1].t <= t) i++;
    const geometry = layouts[i];
    return [
      (x - geometry.left) / geometry.width * width,
      (y - geometry.top) / geometry.height * height,
    ];
  };
}

function removePathCanvas() {
  if (pathCanvas !== null) {
    pathCanvas.remove();
    pathCanvas = null;
  }
}

function removeReplayCallouts() {
  const old = document.getElementById('replay-choice-areas');
  if (old !== null) old.remove();
}

// Labels uncertain connected choice areas just outside the board, with elbow
// leaders back to the actual cells. Vertical packing prevents nearby pockets'
// labels from hiding one another.
function renderReplayChoiceAreas(evaluation) {
  removeReplayCallouts();
  const areas = pathChoiceAreas(evaluation);
  if (areas.length === 0) return;
  const boardRect = boardElement.getBoundingClientRect();
  const resultsVisible = resultSummary.textContent !== '' || resultStats.textContent !== '';
  const resultRect = resultsVisible ? resultsBox.getBoundingClientRect() : null;
  const rightBlocked = resultRect !== null
    && resultRect.left < boardRect.right + 150
    && resultRect.right > boardRect.right
    && resultRect.top < boardRect.bottom
    && resultRect.bottom > boardRect.top;
  const rightRoom = window.innerWidth - boardRect.right;
  const leftRoom = boardRect.left;
  const onRight = (!rightBlocked && rightRoom >= 150) || leftRoom < 150;
  const placed = areas.map((area) => {
    const rects = area.cells.map((cell) => cellElements[cell].getBoundingClientRect());
    return {
      area,
      anchorX: onRight
        ? Math.max(...rects.map((rect) => rect.right - boardRect.left))
        : Math.min(...rects.map((rect) => rect.left - boardRect.left)),
      anchorY: rects.reduce((sum, rect) =>
        sum + rect.top + rect.height / 2 - boardRect.top, 0) / rects.length,
    };
  }).sort((a, b) => a.anchorY - b.anchorY);
  const gap = 22;
  let nextY = 10;
  for (const item of placed) {
    item.labelY = Math.max(nextY, Math.min(boardRect.height - 10, item.anchorY));
    nextY = item.labelY + gap;
  }
  for (let i = placed.length - 2; i >= 0; i--) {
    placed[i].labelY = Math.min(placed[i].labelY, placed[i + 1].labelY - gap);
  }

  const layer = document.createElement('div');
  layer.id = 'replay-choice-areas';
  layer.className = onRight ? 'on-right' : 'on-left';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(boardRect.width));
  svg.setAttribute('height', String(boardRect.height));
  svg.setAttribute('aria-hidden', 'true');
  layer.appendChild(svg);
  for (const item of placed) {
    const edgeX = onRight ? boardRect.width + 4 : -4;
    const labelX = onRight ? boardRect.width + 9 : -9;
    const line = document.createElementNS(SVG_NS, 'polyline');
    line.setAttribute('points', [
      item.anchorX + ',' + item.anchorY,
      edgeX + ',' + item.anchorY,
      edgeX + ',' + item.labelY,
      labelX + ',' + item.labelY,
    ].join(' '));
    line.setAttribute('class', 'replay-area-leader');
    svg.appendChild(line);
    const label = document.createElement('span');
    label.className = 'replay-area-label';
    if (onRight) label.style.left = (boardRect.width + 11) + 'px';
    else label.style.right = (boardRect.width + 11) + 'px';
    label.style.top = (item.labelY - 9) + 'px';
    label.textContent = pathRiskLabel(item.area.risk)
      + ' · ' + item.area.cells.length + ' cell'
      + (item.area.cells.length === 1 ? '' : 's');
    layer.appendChild(label);
  }
  boardElement.appendChild(layer);
}

function restoreFinishedBoard() {
  removeReplayCallouts();
  if (replayFinishedCells === null) return;
  for (let i = 0; i < cellElements.length; i++) {
    cellElements[i].className = replayFinishedCells[i].className;
    cellElements[i].innerHTML = replayFinishedCells[i].innerHTML;
  }
  replayFinishedCells = null;
}

function replayChoiceCells(evaluation) {
  return [...new Set((evaluation.choices || [])
    .flatMap((choice) => Array.isArray(choice.cells) ? choice.cells : []))];
}

function renderReplayFrame() {
  const decisions = pathDecisionEvents(trace.events);
  if (decisions.length === 0) {
    replayStatus.textContent = 'no decision frames';
    replayPrevious.disabled = true;
    replayNext.disabled = true;
    renderPathOverlay();
    return;
  }
  if (replayFinishedCells === null) {
    replayFinishedCells = cellElements.map((element) => ({
      className: element.className,
      innerHTML: element.innerHTML,
    }));
  }
  replayStep = Math.max(0, Math.min(decisions.length - 1, replayStep));
  const evaluation = decisions[replayStep].evaluation;
  const position = evaluation.position;
  const revealed = new Map(position.revealed || []);
  const flagged = new Set(position.flagged || []);
  const choices = new Set(replayChoiceCells(evaluation));
  const selected = new Set(evaluation.selected || []);
  for (let i = 0; i < cellElements.length; i++) {
    const element = cellElements[i];
    if (revealed.has(i)) {
      const adjacent = revealed.get(i);
      element.className = 'cell revealed' + (adjacent > 0 ? ' n' + adjacent : '');
      paintCellGlyph(element, adjacent);
    } else {
      element.className = 'cell hidden';
      element.innerHTML = flagged.has(i) ? FLAG_SVG : '';
    }
    if (choices.has(i)) element.classList.add('replay-choice');
    if (selected.has(i)) element.classList.add('replay-selected');
  }
  renderReplayChoiceAreas(evaluation);
  const choiceCount = choices.size;
  const atSeconds = Number.isFinite(evaluation.atMs)
    ? (evaluation.atMs / 1000).toFixed(2) + 's' : 'before timer';
  replayStatus.textContent = (replayStep + 1) + '/' + decisions.length
    + ' · ' + atSeconds + ' · ' + evaluation.action
    + ' · ' + choiceCount + ' measured choice' + (choiceCount === 1 ? '' : 's');
  replayPrevious.disabled = replayStep === 0;
  replayNext.disabled = replayStep === decisions.length - 1;
  renderPathOverlay();
}

function pathSegments(decisions) {
  const segments = [];
  let nextDecision = 0;
  for (let i = 1; i < trace.t.length; i++) {
    while (decisions.length > 0 && nextDecision + 1 < decisions.length
        && decisions[nextDecision].t < trace.t[i]) {
      nextDecision++;
    }
    const decision = decisions[nextDecision] || null;
    const dt = trace.t[i] - trace.t[i - 1];
    if (dt <= 0) continue;
    let value;
    if (pathView === 'movement-speed') {
      value = Math.hypot(
        trace.x[i] - trace.x[i - 1],
        trace.y[i] - trace.y[i - 1]) * 1000 / dt;
    } else if (pathView === 'click-speed' && decision !== null && nextDecision > 0) {
      const gap = decision.t - decisions[nextDecision - 1].t;
      if (gap > 0) value = 1000 / gap;
    } else if (pathView === 'progress' && decision !== null) {
      value = pathDecisionProgress(decision);
    }
    segments.push({
      from: i - 1,
      to: i,
      decision,
      decisionIndex: nextDecision,
      value,
    });
  }
  return segments;
}

function pathTimeColor(t, endT) {
  const fraction = endT > 0 ? Math.max(0, Math.min(1, t / endT)) : 0;
  return 'hsl(211, 85%, ' + (78 - 56 * fraction).toFixed(1) + '%)';
}

function resetPathLegend() {
  pathViewLegend.replaceChildren();
  pathViewLegend.hidden = true;
}

function appendPathLegendRow(title, keys, note) {
  const row = document.createElement('div');
  row.className = 'path-legend-row';
  const heading = document.createElement('span');
  heading.className = 'path-legend-title';
  heading.textContent = title;
  row.appendChild(heading);
  for (const key of keys) {
    const item = document.createElement('span');
    item.className = 'path-legend-key';
    const swatch = document.createElement('span');
    swatch.className = 'path-legend-swatch' + (key.dot ? ' dot' : '');
    swatch.style.background = key.color;
    const label = document.createElement('span');
    label.textContent = key.label;
    item.append(swatch, label);
    row.appendChild(item);
  }
  if (note) {
    const noteEl = document.createElement('span');
    noteEl.className = 'path-legend-note';
    noteEl.textContent = note;
    row.appendChild(noteEl);
  }
  pathViewLegend.appendChild(row);
  pathViewLegend.hidden = false;
}

function appendPathGradientLegend(title, range, format, options = {}) {
  if (range === undefined) {
    appendPathLegendRow(title, [], 'not enough measured movement');
    return;
  }
  if (range.max <= range.min) {
    appendPathLegendRow(title, [{
      color: options.time ? 'hsl(211, 85%, 50%)' : pathHeatColor(range.min, range),
      label: format(range.min),
    }], 'all measured segments have the same value');
    return;
  }
  const row = document.createElement('div');
  row.className = 'path-legend-row';
  const heading = document.createElement('span');
  heading.className = 'path-legend-title';
  heading.textContent = title;
  const scale = document.createElement('span');
  scale.className = 'path-gradient-scale';
  const low = document.createElement('span');
  low.textContent = format(range.min);
  const barWrap = document.createElement('span');
  const bar = document.createElement('span');
  bar.className = 'path-gradient-bar'
    + (options.time ? ' path-time-gradient' : '');
  const mid = document.createElement('span');
  mid.className = 'path-gradient-mid';
  mid.textContent = format((range.min + range.max) / 2);
  barWrap.append(bar, mid);
  const high = document.createElement('span');
  high.textContent = format(range.max);
  scale.append(low, barWrap, high);
  row.append(heading, scale);
  if (range.trimmed > 0) {
    const note = document.createElement('span');
    note.className = 'path-legend-note';
    note.textContent = range.trimmed + ' extreme segment'
      + (range.trimmed === 1 ? '' : 's') + ' clipped to the shown color range';
    row.appendChild(note);
  }
  pathViewLegend.appendChild(row);
  pathViewLegend.hidden = false;
}

function appendReplayLegend() {
  if (!replayEnabled) return;
  appendPathLegendRow('decision-time board', [
    { color: '#25a55f', label: 'measured choices' },
    { color: '#f1a208', label: 'selected', dot: true },
    { color: '#7256a8', label: 'uncertain area → side risk label' },
  ]);
}

function renderPathOverlay() {
  removePathCanvas();
  resetPathLegend();
  if (!pathViewAvailable()) return;
  const decisions = pathDecisionEvents(trace.events);
  if (pathView === 'off') {
    appendReplayLegend();
    return;
  }
  if (decisions.length === 0 && pathView !== 'raw-path') {
    appendPathLegendRow('path', [], 'no recorded decision locations');
    appendReplayLegend();
    return;
  }
  const rect = boardElement.getBoundingClientRect();
  const canvas = document.createElement('canvas');
  canvas.id = 'path-canvas';
  // The layout events measured the board's border box; absolute children
  // are placed relative to the padding box, so the canvas backs out by
  // the border widths to cover exactly what was measured.
  canvas.style.left = -boardElement.clientLeft + 'px';
  canvas.style.top = -boardElement.clientTop + 'px';
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  const scale = window.devicePixelRatio;
  canvas.width = Math.round(rect.width * scale);
  canvas.height = Math.round(rect.height * scale);
  boardElement.appendChild(canvas);
  pathCanvas = canvas;
  if (pathResizeObserver === null) {
    pathResizeObserver = new ResizeObserver(() => {
      if (pathCanvas === null) return;
      if (replayEnabled) renderReplayFrame();
      else renderPathOverlay();
    });
    pathResizeObserver.observe(boardElement);
  }
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  const segments = pathSegments(decisions);
  const endT = trace.t.length === 0 ? 0 : trace.t[trace.t.length - 1];
  const cutoff = replayEnabled && decisions.length > 0
    ? decisions[Math.max(0, Math.min(decisions.length - 1, replayStep))].t
    : Infinity;
  const range = pathView === 'progress'
    ? { min: 0, max: 1, trimmed: 0 }
    : pathDisplayRange(segments.map((segment) => segment.value));
  if (pathView === 'movement-speed') {
    appendPathGradientLegend('movement speed', range,
      (value) => Math.round(value) + ' px/s');
  } else if (pathView === 'click-speed') {
    appendPathGradientLegend('click speed', range,
      (value) => value.toFixed(2) + '/s');
  } else if (pathView === 'progress') {
    appendPathGradientLegend('game progress', range,
      (value) => Math.round(value * 100) + '% uncovered');
  } else if (pathView === 'raw-path') {
    appendPathGradientLegend('raw path · elapsed trace time',
      { min: 0, max: endT, trimmed: 0 },
      (value) => (value / 1000).toFixed(1) + 's', { time: true });
    appendPathLegendRow('click markers', [
      { color: '#174ea6', label: 'left-button release', dot: true },
      { color: '#c62828', label: 'right-button press', dot: true },
    ]);
  } else if (pathView === 'click-locations') {
    appendPathLegendRow('numbered click locations', [
      { color: '#174ea6', label: 'left-button release', dot: true },
      { color: '#c62828', label: 'right-button press', dot: true },
    ], 'numbers are raw input order');
  } else if (pathView === 'less-useful') {
    const count = decisions.filter(pathDecisionIsLessUseful).length;
    appendPathLegendRow('less-useful episodes', [
      { color: '#174ea6', label: 'last useful click', dot: true },
      { color: '#d95f02', label: 'mistake-tagged action / path' },
      { color: '#2e7d32', label: 'next useful action / path' },
    ], count + ' mistake-tagged action' + (count === 1 ? '' : 's')
      + ' · time labels measure each action-to-action segment');
  }
  appendReplayLegend();
  ctx.lineWidth = pathView === 'raw-path' ? 3 : 4.25;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const mapper = pathPointMapper(rect.width, rect.height);
  const mappedPoints = trace.t.map((t, i) => mapper(t, trace.x[i], trace.y[i]));
  const lessRoles = pathLessUsefulRoles(decisions);
  for (const segment of segments) {
    if (trace.t[segment.to] > cutoff) continue;
    const role = lessRoles[segment.decisionIndex];
    const show = pathView === 'raw-path'
      || (pathView === 'less-useful'
        ? role && (role.less || role.after)
        : pathView !== 'click-locations' && Number.isFinite(segment.value));
    if (!show) continue;
    if (pathView === 'raw-path') {
      ctx.strokeStyle = pathTimeColor(trace.t[segment.to], endT);
    } else if (pathView === 'less-useful') {
      ctx.strokeStyle = role.less ? '#d95f02' : '#2e7d32';
    } else {
      ctx.strokeStyle = pathHeatColor(segment.value, range);
    }
    ctx.beginPath();
    ctx.moveTo(mappedPoints[segment.from][0], mappedPoints[segment.from][1]);
    ctx.lineTo(mappedPoints[segment.to][0], mappedPoints[segment.to][1]);
    ctx.stroke();
  }
  const dotMapper = pathPointMapper(rect.width, rect.height);
  const drawDot = (x, y, color, radius = 4) => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  };
  const drawLabel = (x, y, text, color) => {
    ctx.font = 'bold 10px Arial, sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(text, x + 6, y - 5);
    ctx.fillStyle = color;
    ctx.fillText(text, x + 6, y - 5);
  };
  if (pathView === 'raw-path' || pathView === 'click-locations') {
    const clicks = pathClickEvents(trace.events);
    const clickMapper = pathPointMapper(rect.width, rect.height);
    for (let i = 0; i < clicks.length; i++) {
      const click = clicks[i];
      if (click.t > cutoff) continue;
      const [x, y] = clickMapper(click.t, click.x, click.y);
      const color = click.kind === 'rdown' ? '#c62828' : '#174ea6';
      drawDot(x, y, color, pathView === 'click-locations' ? 4.5 : 4);
      if (pathView === 'click-locations') drawLabel(x, y, String(i + 1), color);
    }
  }
  for (let i = 0; i < decisions.length; i++) {
    const decision = decisions[i];
    if (decision.t > cutoff) continue;
    const role = lessRoles[i];
    const showDot = pathView === 'less-useful'
      && (role.before || role.less || role.after);
    if (!showDot) continue;
    const [x, y] = dotMapper(decision.t, decision.x, decision.y);
    const color = role.less ? '#d95f02' : role.after ? '#2e7d32' : '#174ea6';
    drawDot(x, y, color);
    if (i > 0 && (role.less || role.after)) {
      const gap = decision.t - decisions[i - 1].t;
      drawLabel(x, y, gap < 1000 ? Math.round(gap) + 'ms'
        : (gap / 1000).toFixed(2) + 's', color);
    }
  }
}

function renderPathView() {
  if (!replayEnabled) restoreFinishedBoard();
  removePathCanvas();
  renderPathViewControls();
  if (replayEnabled && pathViewAvailable()) {
    renderReplayFrame();
  } else {
    removeReplayCallouts();
    renderPathOverlay();
  }
}

for (const button of pathViewButtons) {
  button.addEventListener('click', () => {
    const id = button.dataset.pathView;
    if (!PATH_VIEW_IDS.has(id)) throw new Error('unknown path view: ' + id);
    pathView = id;
    renderPathView();
  });
}

replayToggle.addEventListener('click', () => {
  replayEnabled = !replayEnabled;
  if (replayEnabled) {
    const decisions = pathDecisionEvents(trace.events);
    replayStep = Math.max(0, decisions.length - 1);
  }
  renderPathView();
});

replayPrevious.addEventListener('click', () => {
  replayStep--;
  renderReplayFrame();
});

replayNext.addEventListener('click', () => {
  replayStep++;
  renderReplayFrame();
});

document.addEventListener('keydown', (event) => {
  if (!replayEnabled || !pathViewAvailable()) return;
  if (event.target instanceof HTMLElement
      && event.target.matches(
        'input, select, textarea, button, [contenteditable], [tabindex]')) return;
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    replayStep--;
    renderReplayFrame();
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    replayStep++;
    renderReplayFrame();
  }
});

//-------MUSIC STATE (was audio playing, asked of the machine's base system)-------

// The page cannot observe system audio; the machine's resident
// ProjectLauncher can (PipeWire) and serves a cached boolean at
// localhost/api/is-music-playing, rechecked there at most once a minute.
// Polled continuously while the page is open: the live indicator is a
// statement about the machine right now and must appear/disappear when
// the music starts/stops even between games. Polling faster than the
// base system's own minute only tracks its cache, so a change can show
// up to ~75s late (poll interval + cache age), typically under a minute.
// reportResult stores musicPlaying = true if any sample during the game
// heard audio, false if every sample heard silence, and no field at all
// when the endpoint never answered (any other machine, launcher down):
// absence means "not measured", the usual rule, so the record cannot lie
// on origins where no base system exists.
const MUSIC_ENDPOINT = 'http://localhost/api/is-music-playing';
const MUSIC_SAMPLE_EVERY_MS = 15000;
let musicObservations = [];
// The latest answer, for the live indicator: true/false = measured,
// null = the endpoint is not answering. Unknown shows nothing — it is
// never displayed as silence.
let musicNow = null;
const musicIndicator = document.getElementById('music-indicator');

function renderMusicIndicator() {
  musicIndicator.hidden = musicNow !== true;
}

function sampleMusic() {
  fetch(MUSIC_ENDPOINT, { signal: AbortSignal.timeout(3000) })
    .then((response) => {
      if (!response.ok) throw new Error('is-music-playing: http ' + response.status);
      return response.json();
    })
    .then((data) => {
      musicNow = data.is_music_playing === true;
      // A game's observations are the answers that arrive while it runs;
      // an answer is at most seconds old, so it belongs to the board now
      // in play. One landing after the game ended is display-only — the
      // record was already written.
      if (tracing()) musicObservations.push(musicNow);
      renderMusicIndicator();
    })
    .catch(() => {
      // No base system answered from this origin: unknown, not silence.
      // Running games are simply not measured (no musicPlaying field).
      musicNow = null;
      renderMusicIndicator();
    });
}

function beginMusicSampling() {
  musicObservations = [];
  sampleMusic();
}

setInterval(sampleMusic, MUSIC_SAMPLE_EVERY_MS);

//-------TRACE METRICS: COMPUTATION (pure; shared by live and final)-------

// The session-level mouse-dynamics features, computed in-page from the
// trace. Definitions and literature sources are those of
// analysis/biometrics/extract_features.py — the two implementations are
// kept in step (the harness in agents.md compares them on the synthetic
// trace), so a number shown here means exactly what the offline pipeline
// would compute for it.
//
// One pure function does all computing, on two schedules:
// - live: every LIVE_METRICS_EVERY_MS while the trace runs, over the
//   samples so far, into the #metrics-bar strip at the bottom of the
//   screen;
// - final: once from reportResult, over the finished trace — the
//   canonical values, marked "final" on the strip. Same function,
//   complete data: live and final can never disagree in definition,
//   only in how much of the game they have seen.
//
// A value whose formula needs more data than the trace has yet (no
// strokes, no completed click, zero wall time) is undefined, rendered as
// an en dash — "not yet measurable", never a made-up zero.

// A stroke is a movement bout: event-driven mousemove sampling emits
// nothing while the cursor rests, so a gap >= STROKE_GAP_MS between
// consecutive samples separates two bouts.
const STROKE_GAP_MS = 100;
const LIVE_METRICS_EVERY_MS = 1000;

function traceMetricsMean(values) {
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

// Map an angle difference into (-pi, pi] (JS % keeps the sign, so the
// negative branch needs the extra turn).
function wrapAngle(a) {
  let r = (a + Math.PI) % (2 * Math.PI);
  if (r < 0) r += 2 * Math.PI;
  return r - Math.PI;
}

// Features of one movement bout, samples [a, b). A feature whose formula
// needs more points (or displacement) than the bout has is absent.
function strokeMetrics(t, x, y, a, b) {
  const count = b - a;
  const m = { durationMs: t[b - 1] - t[a] };
  if (count < 2) return m;

  let path = 0;
  const speeds = [];     // px/ms per segment
  const tMid = [];       // segment midpoint times, for the kinematic chain
  const thetas = [];     // heading per moving (nonzero-length) segment
  const thetaTMid = [];
  for (let i = a + 1; i < b; i++) {
    const dt = t[i] - t[i - 1];
    const dx = x[i] - x[i - 1];
    const dy = y[i] - y[i - 1];
    const len = Math.hypot(dx, dy);
    path += len;
    speeds.push(len / dt);
    tMid.push((t[i] + t[i - 1]) / 2);
    if (len > 0) {
      thetas.push(Math.atan2(dy, dx));
      thetaTMid.push((t[i] + t[i - 1]) / 2);
    }
  }
  m.pathLengthPx = path;
  // Gamboa & Fred 2004: straightness = chord / path, in [0, 1].
  const chord = Math.hypot(x[b - 1] - x[a], y[b - 1] - y[a]);
  if (path > 0) m.straightness = chord / path;
  m.speedMeanPxPerMs = traceMetricsMean(speeds);
  let speedMax = 0;
  for (const s of speeds) if (s > speedMax) speedMax = s;
  m.speedMaxPxPerMs = speedMax;

  // Kinematic chain on segment midpoints: a_i = dv/dt, j_i = da/dt.
  if (count >= 3) {
    const accels = [];
    const accelTMid = [];
    for (let i = 1; i < speeds.length; i++) {
      accels.push((speeds[i] - speeds[i - 1]) / (tMid[i] - tMid[i - 1]));
      accelTMid.push((tMid[i] + tMid[i - 1]) / 2);
    }
    if (count >= 4) {
      const jerks = [];
      for (let i = 1; i < accels.length; i++) {
        jerks.push(Math.abs((accels[i] - accels[i - 1]) / (accelTMid[i] - accelTMid[i - 1])));
      }
      m.jerkMeanPxPerMs3 = traceMetricsMean(jerks);
    }
  }

  // Angular velocity over headings; defined only where the cursor displaced.
  if (thetas.length >= 2) {
    const omegas = [];
    for (let i = 1; i < thetas.length; i++) {
      omegas.push(Math.abs(wrapAngle(thetas[i] - thetas[i - 1]) / (thetaTMid[i] - thetaTMid[i - 1])));
    }
    m.angularVelocityMeanRadPerMs = traceMetricsMean(omegas);
  }
  return m;
}

// Mean over strokes of a per-stroke feature, over the strokes where it is
// defined; undefined when no stroke measured it.
function strokesMean(strokes, key) {
  const values = [];
  for (const s of strokes) if (s[key] !== undefined) values.push(s[key]);
  return values.length > 0 ? traceMetricsMean(values) : undefined;
}

function computeTraceMetrics(sampleT, sampleX, sampleY, events, wallDurationMs) {
  const n = sampleT.length;

  const strokes = [];
  let start = 0;
  for (let i = 1; i <= n; i++) {
    if (i === n || sampleT[i] - sampleT[i - 1] >= STROKE_GAP_MS) {
      strokes.push(strokeMetrics(sampleT, sampleX, sampleY, start, i));
      start = i;
    }
  }

  let movementMs = 0;
  for (const s of strokes) movementMs += s.durationMs;
  // Total path over ALL consecutive samples — the jumps across stroke gaps
  // are travel too (the measurement principle: fruitless motion existed).
  let totalPathPx = 0;
  for (let i = 1; i < n; i++) {
    totalPathPx += Math.hypot(sampleX[i] - sampleX[i - 1], sampleY[i] - sampleY[i - 1]);
  }
  let speedMaxPxPerMs;
  for (const s of strokes) {
    if (s.speedMaxPxPerMs !== undefined
        && (speedMaxPxPerMs === undefined || s.speedMaxPxPerMs > speedMaxPxPerMs)) {
      speedMaxPxPerMs = s.speedMaxPxPerMs;
    }
  }

  // Click features from the button-event stream. Pairing rule: each
  // 'ldown' matches the next 'lup'; an 'lup' with no open 'ldown' began
  // off the board cells and completes no measured click. Pause-and-click
  // (Zheng et al. CCS 2011): stillness between the last movement sample
  // and each press, left and right pooled.
  let leftClickCount = 0;
  let rightClickCount = 0;
  const holdsMs = [];
  const pausesMs = [];
  let openLdownT = null;
  let si = 0; // events and samples are both time-ordered
  for (const ev of events) {
    if (ev.kind === 'layout') continue;
    if (ev.kind === 'ldown' || ev.kind === 'rdown') {
      while (si < n && sampleT[si] <= ev.t) si++;
      if (si > 0) pausesMs.push(ev.t - sampleT[si - 1]);
    }
    if (ev.kind === 'ldown') {
      openLdownT = ev.t;
    } else if (ev.kind === 'lup') {
      if (openLdownT !== null) {
        holdsMs.push(ev.t - openLdownT);
        openLdownT = null;
        leftClickCount++;
      }
    } else if (ev.kind === 'rdown') {
      rightClickCount++;
    }
  }

  return {
    wallDurationMs: wallDurationMs,
    sampleCount: n,
    strokeCount: strokes.length,
    movementMs: movementMs,
    // Survey vocabulary (arXiv:2208.09061): share of the game spent with
    // the cursor still.
    silenceRatio: wallDurationMs > 0 ? 1 - movementMs / wallDurationMs : undefined,
    totalPathPx: totalPathPx,
    speedMeanPxPerMs: strokesMean(strokes, 'speedMeanPxPerMs'),
    speedMaxPxPerMs: speedMaxPxPerMs,
    straightness: strokesMean(strokes, 'straightness'),
    jerkMeanPxPerMs3: strokesMean(strokes, 'jerkMeanPxPerMs3'),
    angularVelocityMeanRadPerMs: strokesMean(strokes, 'angularVelocityMeanRadPerMs'),
    leftClickCount: leftClickCount,
    rightClickCount: rightClickCount,
    clickDurationMeanMs: holdsMs.length > 0 ? traceMetricsMean(holdsMs) : undefined,
    pauseAndClickMeanMs: pausesMs.length > 0 ? traceMetricsMean(pausesMs) : undefined,
  };
}

// Sample standard deviation (n-1 denominator, R's sd()); NaN below two
// values, like R.
function traceMetricsSampleSd(values) {
  const n = values.length;
  if (n < 2) return NaN;
  const mean = traceMetricsMean(values);
  let ss = 0;
  for (const v of values) ss += (v - mean) * (v - mean);
  return Math.sqrt(ss / (n - 1));
}

// Mean over segments/movements of a per-item feature, over the items
// where it is defined; undefined when none measured it. NaN values (an
// item measured it but the formula degenerated, e.g. sample entropy with
// no matching windows) propagate into the mean, exactly as R's mean()
// does — the display layer renders NaN as "not measurable".
function itemsMean(items, key) {
  const values = [];
  for (const it of items) if (it[key] !== undefined) values.push(it[key]);
  return values.length > 0 ? traceMetricsMean(values) : undefined;
}

//-------TRACE METRICS: SEGMENTATION (inter-click movements)-------

// The psychometric and clinical systems both analyze inter-click
// segments: the trajectory from the previous click (or trace start) to
// the next click, the click being the segment's response. This is the
// exact trial construction of analysis/mousetrap/trace_measures.R: a
// click is an 'lup' or 'rdown' event; the segment gets the previous
// click's point prepended (that is where the cursor stood) and the
// click's own point appended unless a sample already sits on that
// instant; segments with fewer than SEGMENT_MIN_SAMPLES points carry too
// little trajectory to measure and are skipped, like the R script skips
// them.
const SEGMENT_MIN_SAMPLES = 5;

function traceSegments(sampleT, sampleX, sampleY, events) {
  const segments = [];
  let lower = -Infinity;
  let prev = null;
  let si = 0; // events and samples are both time-ordered
  for (const ev of events) {
    if (ev.kind !== 'lup' && ev.kind !== 'rdown') continue;
    const t = [];
    const x = [];
    const y = [];
    const rawT = []; // actual mousemove times in the window, for pauses
    let rawOffset = 0; // index in t/x/y where the raw samples start
    if (prev !== null) { t.push(prev.t); x.push(prev.x); y.push(prev.y); rawOffset = 1; }
    while (si < sampleT.length && sampleT[si] <= ev.t) {
      if (sampleT[si] > lower) {
        t.push(sampleT[si]);
        x.push(sampleX[si]);
        y.push(sampleY[si]);
        rawT.push(sampleT[si]);
      }
      si++;
    }
    if (t.length === 0 || t[t.length - 1] < ev.t) {
      t.push(ev.t);
      x.push(ev.x);
      y.push(ev.y);
    }
    if (t.length >= SEGMENT_MIN_SAMPLES) {
      const t0 = t[0];
      segments.push({
        startT: t0,                      // trace time of the segment start
        t: t.map((v) => v - t0),         // segment-relative, like mousetrap
        x: x,
        y: y,
        rawT: rawT,                      // trace time (not rebased)
        rawOffset: rawOffset,            // rawT[i] is the point at t/x/y[rawOffset + i]
        click: ev,
      });
    }
    lower = ev.t;
    prev = ev;
  }
  return segments;
}

//-------TRACE METRICS: PSYCHOMETRIC (mousetrap measures per segment)-------

// An exact port of the mousetrap R package pipeline (Kieslich et al.) as
// analysis/mousetrap/trace_measures.R applies it: mt_derivatives ->
// mt_measures -> mt_time_normalize -> mt_sample_entropy, per inter-click
// segment, then per-game means. Ported from the installed package source
// (mousetrap 3.2.x), verified value-for-value against Rscript on the
// synthetic trace (tests/metrics-mousetrap-parity.js).

// Signed deviation of each point from the idealized straight line from
// the first to the last point (mt_deviations / points_on_ideal): distance
// to the orthogonal projection on the infinite line, negative where the
// ideal point lies below the actual one in y, all negated when the
// trajectory runs downward in y.
function mtDevIdeal(x, y) {
  const n = x.length;
  const dev = new Array(n);
  const sx = x[0];
  const sy = y[0];
  const ex = x[n - 1];
  const ey = y[n - 1];
  if (sx === ex && sy === ey) { dev.fill(0); return dev; }
  const dx = ex - sx;
  const dy = ey - sy;
  const len2 = dx * dx + dy * dy;
  for (let i = 0; i < n; i++) {
    const u = ((x[i] - sx) * dx + (y[i] - sy) * dy) / len2;
    const ix = sx + u * dx;
    const iy = sy + u * dy;
    let d = Math.hypot(ix - x[i], iy - y[i]);
    if (iy > y[i]) d = -d;
    dev[i] = d;
  }
  if (sy > ey) for (let i = 0; i < n; i++) dev[i] = -dev[i];
  return dev;
}

// mousetrap:::count_changes with threshold 0: merge consecutive nonzero
// position changes into same-sign runs; flips = runs - 1 (0 when the
// coordinate never moved).
function mtCountFlips(pos) {
  let runs = 0;
  let lastSign = 0;
  for (let i = 1; i < pos.length; i++) {
    const d = pos[i] - pos[i - 1];
    if (d === 0) continue;
    const sign = d > 0 ? 1 : -1;
    if (sign !== lastSign) { runs++; lastSign = sign; }
  }
  return runs > 0 ? runs - 1 : 0;
}

// mt_measures + mt_derivatives on one segment (rebased t). Includes the
// leading padded zero mousetrap stores in the vel/acc columns, hence the
// maxima never go below 0.
function mtSegmentMeasures(t, x, y) {
  const n = t.length;
  const dev = mtDevIdeal(x, y);

  let madIdx = 0;
  let adSum = 0;
  for (let i = 0; i < n; i++) {
    if (Math.abs(dev[i]) > Math.abs(dev[madIdx])) madIdx = i;
    adSum += dev[i];
  }

  // AUC: pracma::polyarea's shoelace over the closed point polygon
  // (counterclockwise positive), then mousetrap's orientation flip so
  // that curvature away from the ideal line is positive.
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area2 += x[i] * y[j] - x[j] * y[i];
  }
  let auc = area2 / 2;
  if ((y[n - 1] > y[0] && x[n - 1] > x[0]) || (y[n - 1] < y[0] && x[n - 1] < x[0])) {
    auc = -auc;
  }

  // initiation_time: timestamp of the sample before the first one that
  // has moved away from the start; RT when nothing ever moved.
  let initiationTimeMs = t[n - 1];
  for (let i = 1; i < n; i++) {
    if (x[i] !== x[0] || y[i] !== y[0]) { initiationTimeMs = t[i - 1]; break; }
  }

  // idle_time over position-constant steps; mousetrap's two degenerate
  // branches (never idle -> first timestamp, which is 0 after rebasing;
  // always idle -> RT).
  let constCount = 0;
  let idleSum = 0;
  for (let i = 1; i < n; i++) {
    if (x[i] === x[i - 1] && y[i] === y[i - 1]) {
      constCount++;
      idleSum += t[i] - t[i - 1];
    }
  }
  let idleTimeMs;
  if (constCount === 0) idleTimeMs = t[0];
  else if (constCount === n - 1) idleTimeMs = t[n - 1];
  else idleTimeMs = idleSum;

  // mt_derivatives: vel over each step; acc = diff(vel) over the step
  // times (not midpoints — mousetrap's own convention).
  const vel = [];
  for (let i = 1; i < n; i++) {
    vel.push(Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]) / (t[i] - t[i - 1]));
  }
  let velMax = 0;
  for (const v of vel) if (v > velMax) velMax = v;
  let accMax = 0;
  for (let i = 1; i < vel.length; i++) {
    const a = (vel[i] - vel[i - 1]) / (t[i] - t[i - 1]);
    if (a > accMax) accMax = a;
  }

  return {
    mad: dev[madIdx],
    ad: adSum / n,
    auc: auc,
    xFlips: mtCountFlips(x),
    yFlips: mtCountFlips(y),
    initiationTimeMs: initiationTimeMs,
    idleTimeMs: idleTimeMs,
    velMaxPxPerMs: velMax,
    accMaxPxPerMs2: accMax,
    rtMs: t[n - 1],
  };
}

// mt_time_normalize: linear interpolation at nsteps equally spaced
// timestamps from first to last (R's approx(..., n = nsteps)).
function mtTimeNormalize(t, vals, nsteps) {
  const n = t.length;
  const out = new Array(nsteps);
  const t0 = t[0];
  const t1 = t[n - 1];
  let j = 0;
  for (let s = 0; s < nsteps; s++) {
    const tt = t0 + ((t1 - t0) * s) / (nsteps - 1);
    while (j < n - 2 && t[j + 1] < tt) j++;
    out[s] = vals[j] + (vals[j + 1] - vals[j]) * ((tt - t[j]) / (t[j + 1] - t[j]));
  }
  return out;
}

// mt_sample_entropy (m = 3, use_diff = TRUE) on a time-normalized x
// series: window-match counting over the first differences, dropping the
// last m-window exactly like the package does. NaN when no m-windows
// match within r (R's -log(0/0)).
function mtSampleEntropy(tnX, r, m) {
  const dx = [];
  for (let i = 1; i < tnX.length; i++) dx.push(tnX[i] - tnX[i - 1]);
  const windows = dx.length - m; // (length - m + 1) minus the dropped last
  let matchesM = 0;
  let matchesM1 = 0;
  for (let i = 0; i < windows - 1; i++) {
    for (let j = i + 1; j < windows; j++) {
      let maxd = 0;
      for (let k = 0; k < m; k++) {
        const d = Math.abs(dx[i + k] - dx[j + k]);
        if (d > maxd) maxd = d;
      }
      if (maxd <= r) {
        matchesM++;
        if (Math.max(maxd, Math.abs(dx[i + m] - dx[j + m])) <= r) matchesM1++;
      }
    }
  }
  return -Math.log(matchesM1 / matchesM);
}

const MT_TIME_NORMALIZE_STEPS = 101;
const MT_SAMPLE_ENTROPY_M = 3;

// Per-game means of the key mousetrap measures over the game's
// inter-click segments (the same key list trace_measures.R aggregates).
// The entropy tolerance radius r pools the time-normalized x-differences
// of this game's segments (0.2 * their sample SD) — the game is the
// pooling unit, in-page and offline alike, so a game's value never
// depends on which other games happen to sit in the same export.
function computePsychometrics(sampleT, sampleX, sampleY, events) {
  const segments = traceSegments(sampleT, sampleX, sampleY, events);
  if (segments.length === 0) return { segmentCount: 0 };
  const per = segments.map((seg) => mtSegmentMeasures(seg.t, seg.x, seg.y));

  const tn = segments.map((seg) => mtTimeNormalize(seg.t, seg.x, MT_TIME_NORMALIZE_STEPS));
  const pooledDiffs = [];
  for (const xs of tn) {
    for (let i = 1; i < xs.length; i++) pooledDiffs.push(xs[i] - xs[i - 1]);
  }
  const r = 0.2 * traceMetricsSampleSd(pooledDiffs);
  for (let i = 0; i < per.length; i++) {
    per[i].sampleEntropy = mtSampleEntropy(tn[i], r, MT_SAMPLE_ENTROPY_M);
  }

  return {
    segmentCount: segments.length,
    mad: itemsMean(per, 'mad'),
    ad: itemsMean(per, 'ad'),
    auc: itemsMean(per, 'auc'),
    xFlips: itemsMean(per, 'xFlips'),
    yFlips: itemsMean(per, 'yFlips'),
    initiationTimeMs: itemsMean(per, 'initiationTimeMs'),
    idleTimeMs: itemsMean(per, 'idleTimeMs'),
    velMaxPxPerMs: itemsMean(per, 'velMaxPxPerMs'),
    accMaxPxPerMs2: itemsMean(per, 'accMaxPxPerMs2'),
    sampleEntropy: itemsMean(per, 'sampleEntropy'),
    rtMs: itemsMean(per, 'rtMs'),
  };
}

//-------TRACE METRICS: CLINICAL (Hevelius-style movement features)-------

// The cursor-only subset of the Hevelius 32 (Gajos et al., Movement
// Disorders 2020; definitions and mapping in reference/hevelius/
// FEATURES.md), per inter-click movement (assumption A1: the same
// segments as the psychometric system), aggregated as per-game means over
// the movements where each feature is defined.
//
// Kinematic pipeline, deliberately close to Hevelius's published one:
// resample the trajectory at 100 Hz by linear interpolation, derive
// speed, then acceleration, then jerk, each low-pass filtered at 7 Hz
// with a Kaiser-window FIR (40 dB stopband, the published spec). One
// documented deviation: Hevelius additionally smooths positions with a
// Kalman filter whose parameters the papers do not state, so positions
// here go unsmoothed and the 7 Hz FIR carries all the smoothing.
//
// Not computed in-page: the block-variability features (CoV/SD across
// movements of equal difficulty — our movements have continuously varying
// distance, so those need difficulty residualization first, a modeling
// layer that belongs offline), and click duration (feature 24), which is
// the biometrics set's "hold" row already.
const HEVELIUS_DT_MS = 10;              // 100 Hz resample grid
const HEVELIUS_PAUSE_MS = 100;          // a pause: >= 100 ms between raw events
const HEVELIUS_SUB_START_PXMS = 0.1;    // submovement starts: speed crosses 100 px/s
const HEVELIUS_SUB_QUALIFY_PXMS = 0.5;  // ... and counts only if it reaches 500 px/s

// Modified Bessel function I0 by power series (converges fast for the
// small arguments a Kaiser window uses).
function besselI0(v) {
  let sum = 1;
  let term = 1;
  for (let k = 1; k <= 25; k++) {
    term *= (v / (2 * k)) * (v / (2 * k));
    sum += term;
  }
  return sum;
}

// Windowed-sinc low-pass FIR taps, Kaiser window, normalized to unity DC
// gain. Beta 3.3953 is the Kaiser formula's value for 40 dB stopband
// attenuation; 21 taps spans 0.2 s at 100 Hz.
function kaiserLowpassTaps(numTaps, cutoffHz, sampleHz, beta) {
  const taps = new Array(numTaps);
  const mid = (numTaps - 1) / 2;
  const fc = cutoffHz / sampleHz;
  const denom = besselI0(beta);
  let sum = 0;
  for (let i = 0; i < numTaps; i++) {
    const k = i - mid;
    const sinc = k === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * k) / (Math.PI * k);
    const frac = k / mid;
    taps[i] = sinc * (besselI0(beta * Math.sqrt(1 - frac * frac)) / denom);
    sum += taps[i];
  }
  for (let i = 0; i < numTaps; i++) taps[i] /= sum;
  return taps;
}

const HEVELIUS_FIR = kaiserLowpassTaps(21, 7, 100, 3.3953);

// Zero-phase FIR by symmetric convolution, holding the endpoints past the
// edges (replicate padding) so short movements are not shortened.
function firFilter(values, taps) {
  const n = values.length;
  const half = (taps.length - 1) / 2;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = 0; k < taps.length; k++) {
      let idx = i + k - half;
      if (idx < 0) idx = 0;
      else if (idx >= n) idx = n - 1;
      acc += values[idx] * taps[k];
    }
    out[i] = acc;
  }
  return out;
}

// Linear resample of (t, x, y) onto a uniform dtMs grid from t[0].
function resampleUniform(t, x, y, dtMs) {
  const n = t.length;
  const steps = Math.max(2, Math.floor((t[n - 1] - t[0]) / dtMs) + 1);
  const xs = new Array(steps);
  const ys = new Array(steps);
  let j = 0;
  for (let s = 0; s < steps; s++) {
    const tt = t[0] + s * dtMs;
    while (j < n - 2 && t[j + 1] < tt) j++;
    const frac = Math.min(1, Math.max(0, (tt - t[j]) / (t[j + 1] - t[j])));
    xs[s] = x[j] + (x[j + 1] - x[j]) * frac;
    ys[s] = y[j] + (y[j + 1] - y[j]) * frac;
  }
  return { xs, ys, steps };
}

// The board cell rect for a click, from the latest layout snapshot at or
// before the click; null when the click hit no cell or no layout with
// nonzero cell size is known.
function cellRectAt(layout, index) {
  if (layout === null || index === null || index === undefined) return null;
  if (!(layout.width > 0) || !(layout.height > 0)) return null;
  const cellW = layout.width / layout.boardWidth;
  const cellH = layout.height / layout.boardHeight;
  const col = index % layout.boardWidth;
  const row = Math.floor(index / layout.boardWidth);
  return {
    left: layout.left + col * cellW,
    top: layout.top + row * cellH,
    width: cellW,
    height: cellH,
  };
}

// Merge intervals and total their overlap with [lo, hi].
function overlapMs(intervals, lo, hi) {
  const clipped = intervals
    .map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)])
    .filter(([a, b]) => b > a)
    .sort((p, q) => p[0] - q[0]);
  let total = 0;
  let curLo = null;
  let curHi = null;
  for (const [a, b] of clipped) {
    if (curLo === null || a > curHi) {
      if (curLo !== null) total += curHi - curLo;
      curLo = a;
      curHi = b;
    } else if (b > curHi) {
      curHi = b;
    }
  }
  if (curLo !== null) total += curHi - curLo;
  return total;
}

// Features of one movement. seg times are segment-relative except rawT
// (trace time); helper inputs carry the segment's button intervals and
// press event (trace time) and the target rect at click time.
function heveliusMovement(seg, buttonIntervals, pressT, targetRect) {
  const m = {};
  const relT = seg.t;
  const n = relT.length;
  m.movementTimeMs = relT[n - 1]; // feature 1 (A4: includes deduction time)

  // Pauses (>= 100 ms between raw mousemove events) within the movement:
  // features 31, 32. Hevelius defines the longest pause as 0 when none
  // occurred, so these exist whenever the movement has raw samples.
  const pauses = []; // [startT, endT] in trace time
  for (let i = 1; i < seg.rawT.length; i++) {
    if (seg.rawT[i] - seg.rawT[i - 1] >= HEVELIUS_PAUSE_MS) {
      pauses.push([seg.rawT[i - 1], seg.rawT[i]]);
    }
  }
  if (seg.rawT.length > 0) {
    m.pauseCount = pauses.length;
    m.longestPauseMs = 0;
    for (const [a, b] of pauses) if (b - a > m.longestPauseMs) m.longestPauseMs = b - a;
  }

  // Execution time (3): first to last raw mousemove, minus time the left
  // button was held; without pauses (4): additionally minus the union of
  // pause intervals (a pause while the button was held counts once).
  let execMs;
  let execNoPauseMs;
  if (seg.rawT.length >= 2) {
    const first = seg.rawT[0];
    const last = seg.rawT[seg.rawT.length - 1];
    execMs = last - first - overlapMs(buttonIntervals, first, last);
    execNoPauseMs = last - first
      - overlapMs(buttonIntervals.concat(pauses), first, last);
    m.executionTimeMs = execMs;
    m.executionTimeNoPausesMs = execNoPauseMs;
  }

  // Kinematics on the 100 Hz resampled, 7 Hz low-passed chain.
  const { xs, ys, steps } = resampleUniform(relT, seg.x, seg.y, HEVELIUS_DT_MS);
  const speedRaw = new Array(steps - 1);
  for (let i = 1; i < steps; i++) {
    speedRaw[i - 1] = Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]) / HEVELIUS_DT_MS;
  }
  const speed = firFilter(speedRaw, HEVELIUS_FIR);
  let peakIdx = 0;
  for (let i = 1; i < speed.length; i++) if (speed[i] > speed[peakIdx]) peakIdx = i;
  m.peakSpeedPxPerMs = speed[peakIdx]; // feature 7

  let accel = [];
  let jerk = [];
  if (speed.length >= 2) {
    const accelRaw = new Array(speed.length - 1);
    for (let i = 1; i < speed.length; i++) {
      accelRaw[i - 1] = (speed[i] - speed[i - 1]) / HEVELIUS_DT_MS;
    }
    accel = firFilter(accelRaw, HEVELIUS_FIR);
    let accMax = accel[0];
    for (const a of accel) if (a > accMax) accMax = a;
    m.peakAccelPxPerMs2 = accMax; // feature 9
    if (accel.length >= 2) {
      const jerkRaw = new Array(accel.length - 1);
      for (let i = 1; i < accel.length; i++) {
        jerkRaw[i - 1] = (accel[i] - accel[i - 1]) / HEVELIUS_DT_MS;
      }
      jerk = firFilter(jerkRaw, HEVELIUS_FIR);
    }
  }

  // Submovement decomposition (fig S2 thresholds) on the smoothed speed.
  const subs = []; // {start, end} as speed indices (end exclusive)
  let subStart = null;
  let subPeak = 0;
  for (let i = 0; i < speed.length; i++) {
    if (subStart === null) {
      if (speed[i] >= HEVELIUS_SUB_START_PXMS) { subStart = i; subPeak = speed[i]; }
    } else {
      if (speed[i] > subPeak) subPeak = speed[i];
      if (speed[i] < HEVELIUS_SUB_START_PXMS) {
        if (subPeak >= HEVELIUS_SUB_QUALIFY_PXMS) subs.push({ start: subStart, end: i });
        subStart = null;
        subPeak = 0;
      }
    }
  }
  if (subStart !== null && subPeak >= HEVELIUS_SUB_QUALIFY_PXMS) {
    subs.push({ start: subStart, end: speed.length });
  }
  m.submovementCount = subs.length; // Table S4's 33rd input
  let main = null;
  for (const sub of subs) {
    if (peakIdx >= sub.start && peakIdx < sub.end) { main = sub; break; }
  }
  if (main !== null) {
    // Feature 21's numeric value is unstated in the papers (see
    // FEATURES.md "Definition status"); this uses its duration.
    m.mainSubmovementMs = (main.end - main.start) * HEVELIUS_DT_MS;
    // Fraction of the main submovement spent accelerating (30), read on
    // the smoothed speed within the submovement.
    let speedPeakInSub = main.start;
    for (let i = main.start; i < main.end; i++) {
      if (speed[i] > speed[speedPeakInSub]) speedPeakInSub = i;
    }
    if (main.end - main.start > 0) {
      m.mainSubAcceleratingFraction =
        (speedPeakInSub - main.start) / (main.end - main.start);
    }
    if (targetRect !== null) {
      const cx = targetRect.left + targetRect.width / 2;
      const cy = targetRect.top + targetRect.height / 2;
      // The sub's end index in position space: speed[i] spans positions
      // i..i+1, so the submovement ends at position index main.end.
      const endPos = Math.min(main.end, steps - 1);
      const startPos = Math.min(main.start, steps - 1);
      m.mainSubEndDistPx = Math.hypot(xs[endPos] - cx, ys[endPos] - cy); // feature 11
      // Fraction of the remaining distance to the target covered along
      // the task axis (12); can exceed 1 on overshoot.
      const ax = seg.x[n - 1] - seg.x[0];
      const ay = seg.y[n - 1] - seg.y[0];
      const axisLen = Math.hypot(ax, ay);
      if (axisLen > 0) {
        const ux = ax / axisLen;
        const uy = ay / axisLen;
        const proj = (px, py) => px * ux + py * uy;
        const remaining = proj(cx, cy) - proj(xs[startPos], ys[startPos]);
        if (remaining !== 0) {
          m.mainSubFractionCovered =
            (proj(xs[endPos], ys[endPos]) - proj(xs[startPos], ys[startPos])) / remaining;
        }
      }
    }
  }

  // Task-axis path statistics (13-17, 19, 20) on the actual pointer
  // samples; the axis is the start-to-end cursor line, signed deviation
  // as in mtDevIdeal.
  const dev = mtDevIdeal(seg.x, seg.y);
  let maxDev = 0;
  let absSum = 0;
  let devSum = 0;
  for (const d of dev) {
    if (Math.abs(d) > maxDev) maxDev = Math.abs(d);
    absSum += Math.abs(d);
    devSum += d;
  }
  m.maxAxisDeviationPx = maxDev;                    // 13
  m.movementVariabilityPx = traceMetricsSampleSd(dev); // 14 (SD of deviations)
  m.movementErrorPx = absSum / n;                   // 15
  m.movementOffsetPx = devSum / n;                  // 16
  let crossings = 0;
  let lastSide = 0;
  for (const d of dev) {
    if (d === 0) continue;
    const side = d > 0 ? 1 : -1;
    if (lastSide !== 0 && side !== lastSide) crossings++;
    lastSide = side;
  }
  m.axisCrossings = crossings;                      // 17
  m.directionChanges = mtCountFlips(dev);           // 19 (orthogonal component)
  const axisProj = new Array(n);
  {
    const ax = seg.x[n - 1] - seg.x[0];
    const ay = seg.y[n - 1] - seg.y[0];
    const axisLen = Math.hypot(ax, ay);
    for (let i = 0; i < n; i++) {
      axisProj[i] = axisLen > 0
        ? ((seg.x[i] - seg.x[0]) * ax + (seg.y[i] - seg.y[0]) * ay) / axisLen
        : 0;
    }
  }
  m.orthogonalDirectionChanges = mtCountFlips(axisProj); // 20 (parallel component)

  // Target re-entries (18) and verification time (22), when the target
  // rect is known. Verification: last raw move at or before the press
  // that sat inside the target, to the press.
  if (targetRect !== null) {
    const inside = (px, py) => px >= targetRect.left
      && px < targetRect.left + targetRect.width
      && py >= targetRect.top
      && py < targetRect.top + targetRect.height;
    let entries = 0;
    let wasInside = false;
    for (let i = 0; i < n; i++) {
      const now = inside(seg.x[i], seg.y[i]);
      if (now && !wasInside) entries++;
      wasInside = now;
    }
    if (entries > 0) m.targetReentries = entries - 1; // re-entries exclude the first entry
    if (pressT !== null) {
      let lastMoveT = null;
      let lastInside = false;
      for (let i = 0; i < seg.rawT.length; i++) {
        if (seg.rawT[i] > pressT) break;
        lastMoveT = seg.rawT[i];
        const pi = seg.rawOffset + i;
        lastInside = inside(seg.x[pi], seg.y[pi]);
      }
      if (lastMoveT !== null && lastInside) m.verificationTimeMs = pressT - lastMoveT;
    }
  }

  // Normalized jerk (28) and without pauses (29): (ET_np)^3 / v_peak^2
  // times the integral of squared jerk; 29 drops integrand samples lying
  // inside a pause. ET is execution time without pauses in both, per the
  // published formula.
  if (jerk.length > 0 && execNoPauseMs !== undefined && m.peakSpeedPxPerMs > 0) {
    let integral = 0;
    let integralNoPause = 0;
    for (let i = 0; i < jerk.length; i++) {
      const contrib = jerk[i] * jerk[i] * HEVELIUS_DT_MS;
      integral += contrib;
      // jerk[i] sits at resample step i (trace time seg.startT + i*dt,
      // up to the chain's small alignment); paused spans contribute no
      // real motion, so 29 excludes them.
      const tAbs = seg.startT + i * HEVELIUS_DT_MS;
      let paused = false;
      for (const [a, b] of pauses) {
        if (tAbs >= a && tAbs <= b) { paused = true; break; }
      }
      if (!paused) integralNoPause += contrib;
    }
    const scale = Math.pow(execNoPauseMs, 3) / (m.peakSpeedPxPerMs * m.peakSpeedPxPerMs);
    m.normalizedJerk = scale * integral;
    m.normalizedJerkNoPauses = scale * integralNoPause;
  }

  return m;
}

function computeHevelius(sampleT, sampleX, sampleY, events) {
  const segments = traceSegments(sampleT, sampleX, sampleY, events);
  if (segments.length === 0) return { movementCount: 0 };

  // Walk events once, tracking the current layout and pairing each
  // segment's ending click with its press and the button-held intervals
  // inside the segment window.
  const per = [];
  for (const seg of segments) {
    const windowLo = seg.startT;
    const windowHi = seg.click.t;
    let layout = null;
    let pressT = null;
    const buttonIntervals = [];
    let openDown = null;
    for (const ev of events) {
      if (ev.t > windowHi) break;
      if (ev.kind === 'layout') { layout = ev; continue; }
      if (ev.kind === 'ldown') {
        openDown = ev.t;
        if (seg.click.kind === 'lup' && ev.t >= windowLo) pressT = ev.t;
      } else if (ev.kind === 'lup' && openDown !== null) {
        buttonIntervals.push([openDown, ev.t]);
        openDown = null;
      } else if (ev.kind === 'rdown' && ev === seg.click) {
        pressT = ev.t;
      }
    }
    if (openDown !== null) buttonIntervals.push([openDown, windowHi]);
    const targetRect = cellRectAt(layout, seg.click.index);
    per.push(heveliusMovement(seg, buttonIntervals, pressT, targetRect));
  }

  // Click slip (26): distance between press and release of each completed
  // left click, from the event stream directly (independent of segments).
  const slips = [];
  let down = null;
  for (const ev of events) {
    if (ev.kind === 'ldown') down = ev;
    else if (ev.kind === 'lup' && down !== null) {
      slips.push(Math.hypot(ev.x - down.x, ev.y - down.y));
      down = null;
    }
  }

  return {
    movementCount: segments.length,
    movementTimeMs: itemsMean(per, 'movementTimeMs'),
    executionTimeMs: itemsMean(per, 'executionTimeMs'),
    executionTimeNoPausesMs: itemsMean(per, 'executionTimeNoPausesMs'),
    peakSpeedPxPerMs: itemsMean(per, 'peakSpeedPxPerMs'),
    peakAccelPxPerMs2: itemsMean(per, 'peakAccelPxPerMs2'),
    submovementCount: itemsMean(per, 'submovementCount'),
    mainSubmovementMs: itemsMean(per, 'mainSubmovementMs'),
    mainSubEndDistPx: itemsMean(per, 'mainSubEndDistPx'),
    mainSubFractionCovered: itemsMean(per, 'mainSubFractionCovered'),
    mainSubAcceleratingFraction: itemsMean(per, 'mainSubAcceleratingFraction'),
    maxAxisDeviationPx: itemsMean(per, 'maxAxisDeviationPx'),
    movementVariabilityPx: itemsMean(per, 'movementVariabilityPx'),
    movementErrorPx: itemsMean(per, 'movementErrorPx'),
    movementOffsetPx: itemsMean(per, 'movementOffsetPx'),
    axisCrossings: itemsMean(per, 'axisCrossings'),
    directionChanges: itemsMean(per, 'directionChanges'),
    orthogonalDirectionChanges: itemsMean(per, 'orthogonalDirectionChanges'),
    targetReentries: itemsMean(per, 'targetReentries'),
    verificationTimeMs: itemsMean(per, 'verificationTimeMs'),
    normalizedJerk: itemsMean(per, 'normalizedJerk'),
    normalizedJerkNoPauses: itemsMean(per, 'normalizedJerkNoPauses'),
    pauseCount: itemsMean(per, 'pauseCount'),
    longestPauseMs: itemsMean(per, 'longestPauseMs'),
    clickSlipPx: slips.length > 0 ? traceMetricsMean(slips) : undefined,
  };
}

//-------TRACE METRICS: WASTE (survey Tier 1/2 whole-game measures)-------

// The survey's own proposals (reference/mouse-motion-metrics.md, Tier
// 1/2), computed over the whole trace rather than per segment. The
// threshold constants are definitional parts of each metric.
const WASTE_PAUSE_MS = 250;      // a whole-game pause: >= 250 ms between samples
const WASTE_TURN_LEG_PX = 8;     // heading legs must displace this far
const FEINT_DWELL_MS = 300;      // a feint: dwell this long, then leave clickless

function computeWasteMetrics(sampleT, sampleX, sampleY, events) {
  const n = sampleT.length;

  // Pauses over the whole game (>= 250 ms between consecutive samples):
  // count, total, longest. Distinct from the Hevelius per-movement 100 ms
  // pauses — this is the "time paused" the survey proposed.
  let pauseCount = 0;
  let pausedMs = 0;
  let longestPauseMs = 0;
  for (let i = 1; i < n; i++) {
    const gap = sampleT[i] - sampleT[i - 1];
    if (gap >= WASTE_PAUSE_MS) {
      pauseCount++;
      pausedMs += gap;
      if (gap > longestPauseMs) longestPauseMs = gap;
    }
  }

  // Wander ratio: total cursor travel over the sum of straight lines
  // between consecutive clicks (1.0 = perfectly direct all game). The
  // fruitless travel stays in the numerator — that is the point.
  let totalPathPx = 0;
  for (let i = 1; i < n; i++) {
    totalPathPx += Math.hypot(sampleX[i] - sampleX[i - 1], sampleY[i] - sampleY[i - 1]);
  }
  let clickTravelPx = 0;
  let prevClick = null;
  for (const ev of events) {
    if (ev.kind !== 'lup' && ev.kind !== 'rdown') continue;
    if (prevClick !== null) {
      clickTravelPx += Math.hypot(ev.x - prevClick.x, ev.y - prevClick.y);
    }
    prevClick = ev;
  }

  // Direction changes: heading reversals of more than 90 degrees between
  // consecutive movement legs of >= 8 px each (the length floor keeps
  // pixel jitter out) — the x-flips analog on an open 2D board.
  let dirChanges = 0;
  let legDx = 0;
  let legDy = 0;
  let prevLegDx = null;
  let prevLegDy = null;
  for (let i = 1; i < n; i++) {
    legDx += sampleX[i] - sampleX[i - 1];
    legDy += sampleY[i] - sampleY[i - 1];
    if (Math.hypot(legDx, legDy) >= WASTE_TURN_LEG_PX) {
      if (prevLegDx !== null && prevLegDx * legDx + prevLegDy * legDy < 0) {
        dirChanges++;
      }
      prevLegDx = legDx;
      prevLegDy = legDy;
      legDx = 0;
      legDy = 0;
    }
  }

  // Feints: the cursor enters a board cell, stays over it for >= 300 ms
  // (entry to exit, exit observed), and no click happens during the
  // stay — approached, did nothing, left. An unfinished stay at trace end
  // has no exit and is not counted. The survey draft said "hidden cell";
  // the trace does not carry cell reveal state, so this counts dwells
  // over any board cell (the deviation is documented in the survey file).
  let feintCount = 0;
  {
    let layout = null;
    let li = 0; // next event to process for layout/click bookkeeping
    let curCell = null;
    let enterT = 0;
    let clickedDuring = false;
    for (let i = 0; i < n; i++) {
      // Events up to this sample: track layout changes and clicks.
      while (li < events.length && events[li].t <= sampleT[i]) {
        const ev = events[li];
        if (ev.kind === 'layout') layout = ev;
        else if (ev.kind === 'lup' || ev.kind === 'rdown') clickedDuring = true;
        li++;
      }
      let cell = null;
      if (layout !== null && layout.width > 0 && layout.height > 0) {
        const col = Math.floor((sampleX[i] - layout.left) / (layout.width / layout.boardWidth));
        const row = Math.floor((sampleY[i] - layout.top) / (layout.height / layout.boardHeight));
        if (col >= 0 && col < layout.boardWidth && row >= 0 && row < layout.boardHeight) {
          cell = row * layout.boardWidth + col;
        }
      }
      if (cell !== curCell) {
        if (curCell !== null && !clickedDuring && sampleT[i] - enterT >= FEINT_DWELL_MS) {
          feintCount++;
        }
        curCell = cell;
        enterT = sampleT[i];
        clickedDuring = false;
      }
    }
  }

  return {
    pauseCount: pauseCount,
    pausedMs: pausedMs,
    longestPauseMs: longestPauseMs,
    wanderRatio: clickTravelPx > 0 ? totalPathPx / clickTravelPx : undefined,
    dirChanges: dirChanges,
    feintCount: feintCount,
  };
}

//-------TRACE METRICS: CLICK CADENCE (press-to-press timing)-------

// Click-timing measures over button presses ('ldown' and 'rdown' — the
// motor acts; a release belongs to the same act). Wasted presses count
// the same as effective ones (the measurement principle) — the trace
// records the hand, not the board effect. The threshold constants are
// definitional parts of each metric.
const CADENCE_BURST_GAP_MS = 250;     // a burst gap: successive presses closer than this
const CADENCE_MOVING_WINDOW_MS = 100; // on the move: a cursor sample within this window before the press
const CADENCE_PEAK_WINDOW_MS = 1000;  // the rolling window for peak press rate

function computeClickCadence(sampleT, events) {
  const presses = [];
  for (const ev of events) {
    if (ev.kind === 'ldown' || ev.kind === 'rdown') presses.push(ev.t);
  }
  const m = {};
  if (presses.length > 0) {
    // Peak rate: the most presses inside any rolling window, two-pointer
    // over the chronological press times.
    let peak = 1;
    let lo = 0;
    for (let hi = 0; hi < presses.length; hi++) {
      while (presses[hi] - presses[lo] > CADENCE_PEAK_WINDOW_MS) lo++;
      if (hi - lo + 1 > peak) peak = hi - lo + 1;
    }
    m.peakPressesPerSec = peak / (CADENCE_PEAK_WINDOW_MS / 1000);
    // On the move: samples exist only while the cursor moves, so a press
    // with a sample inside the window before it was made mid-motion.
    let moving = 0;
    let si = 0;
    for (const t of presses) {
      while (si < sampleT.length && sampleT[si] <= t) si++;
      if (si > 0 && t - sampleT[si - 1] <= CADENCE_MOVING_WINDOW_MS) moving++;
    }
    m.movingPressShare = moving / presses.length;
  }
  if (presses.length >= 2) {
    const gaps = [];
    for (let i = 1; i < presses.length; i++) gaps.push(presses[i] - presses[i - 1]);
    gaps.sort((a, b) => a - b);
    // Quartiles by linear interpolation; p <= 0.75 and 2+ gaps keep the
    // interpolation index strictly inside the array.
    const q = (p) => {
      const at = (gaps.length - 1) * p;
      const lo2 = Math.floor(at);
      return gaps[lo2] + (at - lo2) * (gaps[lo2 + 1] - gaps[lo2]);
    };
    const median = q(0.5);
    m.gapMedianMs = median;
    // Two presses at one timestamp (both buttons in the same ms) can zero
    // the median; a ratio over zero is genuinely not measurable.
    m.gapSpreadRatio = median > 0 ? (q(0.75) - q(0.25)) / median : undefined;
    m.fastestGapMs = gaps[0];
    m.burstGapShare = gaps.filter((g) => g < CADENCE_BURST_GAP_MS).length / gaps.length;
  }
  return m;
}

//-------TRACE METRICS: ALL SYSTEMS COMBINED-------

// The object the display layer consumes: all four measurement systems
// over the same trace. The psychometric and clinical systems only see
// completed inter-click segments, so their values change only when a
// click lands — the live schedule exploits that (renderLiveTraceMetrics
// caches them between clicks).
function computeAllTraceMetrics(sampleT, sampleX, sampleY, events, wallDurationMs) {
  return {
    wallDurationMs: wallDurationMs,
    bio: computeTraceMetrics(sampleT, sampleX, sampleY, events, wallDurationMs),
    psych: computePsychometrics(sampleT, sampleX, sampleY, events),
    hev: computeHevelius(sampleT, sampleX, sampleY, events),
    waste: computeWasteMetrics(sampleT, sampleX, sampleY, events),
    cad: computeClickCadence(sampleT, events),
  };
}

//-------TRACE METRICS: DISPLAY (the #metrics-panel column)-------

const metricsPanel = document.getElementById('metrics-panel');
const metricsPanelContent = document.getElementById('metrics-panel-content');

// The displayed metrics, grouped by measurement system. Each display:
// label; calc (how the value is computed, exactly); records (a literal
// description of the observation, without assigning a cause); of, the numeric extractor over
// the combined metrics object of computeAllTraceMetrics (undefined or
// NaN = not measurable on this trace, rendered as an en dash and a gap
// in the sparkline); fmt, the formatter for the extracted number. calc
// and records appear together as the row's hover tooltip. Not everything
// computed is displayed (the clinical system computes more features than
// shown); per-stage configurability of what appears is planned.
const TRACE_METRIC_GROUPS = [
  { key: 'bio', name: 'dynamics', definition:
      'behavioral-biometrics session features over movement bouts '
      + '(same definitions as the offline extractor)',
    displays: [
      { label: 'strokes',
        calc: 'number of movement bouts: consecutive cursor samples chain into '
          + 'one bout, and a gap of 100ms or more between samples starts the next',
        records: 'how many movement bouts the 100ms gap rule divided the sampled '
          + 'cursor path into; it does not identify why gaps occurred',
        of: (m) => m.bio.strokeCount, fmt: (v) => String(v) },
      { label: 'moving',
        calc: 'sum of bout durations (first to last sample of each bout)',
        records: 'the sampled time spanned by movement bouts; time outside those '
          + 'bouts is excluded, without assigning either span a cognitive cause',
        of: (m) => m.bio.movementMs, fmt: (v) => (v / 1000).toFixed(1) + 's' },
      { label: 'silence',
        calc: '1 minus moving time over wall-clock game time',
        records: 'the fraction of wall-clock game time outside movement bouts; '
          + 'the trace does not reveal what the player was doing during that time',
        of: (m) => m.bio.silenceRatio, fmt: (v) => Math.round(v * 100) + '%' },
      { label: 'path',
        calc: 'sum of distances between every consecutive pair of cursor '
          + 'samples, jumps across pauses included — fruitless travel counts',
        records: 'total cursor travel in viewport pixels over the sampled trace; '
          + 'the value alone does not identify why it differs between games',
        of: (m) => m.bio.totalPathPx, fmt: (v) => Math.round(v) + 'px' },
      { label: 'speed',
        calc: 'each bout\u2019s mean of its sample-to-sample speeds, then the '
          + 'mean over bouts',
        records: 'the mean sampled cursor speed within bouts, first averaged per '
          + 'bout and then across bouts; it is descriptive, not causal',
        of: (m) => m.bio.speedMeanPxPerMs, fmt: (v) => Math.round(v * 1000) + 'px/s' },
      { label: 'peak speed',
        calc: 'the single fastest sample-to-sample speed in any bout',
        records: 'the largest single sample-to-sample cursor speed observed in '
          + 'any measured bout of this game',
        of: (m) => m.bio.speedMaxPxPerMs, fmt: (v) => Math.round(v * 1000) + 'px/s' },
      { label: 'straightness',
        calc: 'per bout, straight-line distance from its start to its end '
          + 'divided by the distance actually traveled (1 = a perfect line); '
          + 'mean over bouts',
        records: 'the geometric directness of each bout from its sampled start '
          + 'to end; it does not identify planning, searching, or fatigue',
        of: (m) => m.bio.straightness, fmt: (v) => v.toFixed(2) },
      { label: 'jerk',
        calc: 'per bout, the mean absolute rate of change of acceleration '
          + '(third derivative of position along the path, px/ms\u00b3, from '
          + 'segment-midpoint speeds); mean over bouts',
        records: 'the mean absolute third-derivative quantity computed from the '
          + 'sampled path; this app does not infer its cause or diagnose tremor',
        of: (m) => m.bio.jerkMeanPxPerMs3, fmt: (v) => v.toFixed(4) },
      { label: 'turn rate',
        calc: 'per bout, the mean absolute change of movement heading per ms '
          + '(rad/ms) between successive moving steps; mean over bouts',
        records: 'the mean absolute rate at which sampled movement heading '
          + 'changed within bouts; no identity or hardware conclusion is implied',
        of: (m) => m.bio.angularVelocityMeanRadPerMs, fmt: (v) => v.toFixed(3) },
      { label: 'left clicks',
        calc: 'completed left clicks: a press and its release both on the trace',
        records: 'completed left-button press/release pairs found in the trace; '
          + 'this is independent of whether the board state changed',
        of: (m) => m.bio.leftClickCount, fmt: (v) => String(v) },
      { label: 'right clicks',
        calc: 'right-button presses (flag actions)',
        records: 'right-button presses found in the trace, including presses '
          + 'whether or not their board effect was later undone',
        of: (m) => m.bio.rightClickCount, fmt: (v) => String(v) },
      { label: 'hold',
        calc: 'mean time from left-button press to its release',
        records: 'mean elapsed time from left-button press to release; this '
          + 'game does not use it to infer cognition, health, or diagnosis',
        of: (m) => m.bio.clickDurationMeanMs, fmt: (v) => Math.round(v) + 'ms' },
      { label: 'pause-and-click',
        calc: 'for each press, the stillness between the last cursor movement '
          + 'and the press; mean over presses',
        records: 'mean elapsed time from the last sampled cursor movement to '
          + 'the following press; the reason for stillness is not observed',
        of: (m) => m.bio.pauseAndClickMeanMs, fmt: (v) => Math.round(v) + 'ms' },
    ] },
  { key: 'waste', name: 'path and no-action events', definition:
      'whole-game path ratios, sample gaps, direction reversals, and cell '
      + 'dwell-without-click counts',
    displays: [
      { label: 'wander',
        calc: 'total cursor travel divided by the sum of straight lines '
          + 'between consecutive click positions (1.0 = perfectly direct '
          + 'all game)',
        records: 'sampled cursor distance relative to straight lines between '
          + 'successive click positions; the excess distance has no assigned cause',
        of: (m) => m.waste.wanderRatio, fmt: (v) => v.toFixed(2) + '\u00d7' },
      { label: 'pauses',
        calc: 'count of gaps of 250ms or more between consecutive cursor '
          + 'samples over the whole game',
        records: 'the number of consecutive cursor-sample gaps at least 250ms '
          + 'long; it does not identify why the gaps occurred',
        of: (m) => m.waste.pauseCount, fmt: (v) => String(v) },
      { label: 'paused',
        calc: 'total time inside those 250ms-or-longer gaps',
        records: 'the summed duration of cursor-sample gaps at least 250ms long',
        of: (m) => m.waste.pausedMs, fmt: (v) => (v / 1000).toFixed(1) + 's' },
      { label: 'longest pause',
        calc: 'the single longest such gap',
        records: 'the longest cursor-sample gap of at least 250ms in the game; '
          + 'the trace does not identify what happened during it',
        of: (m) => m.waste.longestPauseMs, fmt: (v) => (v / 1000).toFixed(1) + 's' },
      { label: 'turnarounds',
        calc: 'heading reversals of more than 90\u00b0 between consecutive '
          + 'movement legs of at least 8px each (the length floor keeps pixel '
          + 'jitter out)',
        records: 'the count of qualifying sampled heading reversals; a reversal '
          + 'does not by itself establish a changed plan or confusion',
        of: (m) => m.waste.dirChanges, fmt: (v) => String(v) },
      { label: 'feints',
        calc: 'times the cursor entered a board cell, stayed 300ms or more, '
          + 'then left it without any click during the stay',
        records: 'cell visits lasting at least 300ms that ended without a click '
          + 'in that cell; intention and hesitation are not observed',
        of: (m) => m.waste.feintCount, fmt: (v) => String(v) },
    ] },
  { key: 'cad', name: 'click timing', definition:
      'press-to-press rhythm over all button presses, left and right '
      + 'together; wasted presses count the same as effective ones — the '
      + 'trace records the hand, not the board effect',
    displays: [
      { label: 'click gap',
        calc: 'median time between consecutive button presses over the '
          + 'whole game',
        records: 'the median elapsed time between consecutive button presses; '
          + 'it does not separate reading, deciding, and movement',
        of: (m) => m.cad.gapMedianMs, fmt: (v) => Math.round(v) + 'ms' },
      { label: 'gap spread',
        calc: 'interquartile range of those gaps divided by their median',
        records: 'the spread of press gaps relative to their median: 0 means '
          + 'the measured gaps are equal, and larger values mean more dispersion',
        of: (m) => m.cad.gapSpreadRatio, fmt: (v) => v.toFixed(2) + '\u00d7' },
      { label: 'fastest gap',
        calc: 'the single shortest press-to-press gap of the game',
        records: 'the shortest elapsed time observed between two consecutive '
          + 'button presses in this game',
        of: (m) => m.cad.fastestGapMs, fmt: (v) => Math.round(v) + 'ms' },
      { label: 'peak rate',
        calc: 'the most presses inside any rolling 1-second window',
        records: 'the largest number of button presses observed in any rolling '
          + 'one-second interval of this game',
        of: (m) => m.cad.peakPressesPerSec, fmt: (v) => v + '/s' },
      { label: 'burst share',
        calc: 'share of press-to-press gaps under 250ms',
        records: 'the fraction of measured press-to-press gaps shorter than '
          + '250ms; it does not establish fluency or intent',
        of: (m) => m.cad.burstGapShare, fmt: (v) => Math.round(v * 100) + '%' },
      { label: 'on the move',
        calc: 'share of presses with a cursor sample in the 100ms before '
          + 'the press (samples exist only while the cursor moves)',
        records: 'the fraction of presses preceded by a cursor-movement sample '
          + 'within 100ms; it does not identify the reason for that timing',
        of: (m) => m.cad.movingPressShare, fmt: (v) => Math.round(v * 100) + '%' },
    ] },
  { key: 'psych', name: 'trajectory geometry', definition:
      'mousetrap-formula trajectory measures per inter-click segment '
      + '(exact port of the R package), reported as means over segments; '
      + 'the game does not infer mental states from them',
    displays: [
      { label: 'segments',
        calc: 'number of inter-click trajectories measured: previous click to '
          + 'next click, needing at least 5 trajectory points',
        records: 'the number of qualifying inter-click trajectories included '
          + 'in the trajectory and movement means below',
        of: (m) => m.psych.segmentCount, fmt: (v) => String(v) },
      { label: 'MAD',
        calc: 'per segment, the signed maximum deviation of the path from the '
          + 'ideal straight line joining segment start to its click; mean over '
          + 'segments',
        records: 'the signed largest deviation from the start-to-click line, '
          + 'averaged over segments; conflict or attraction is not inferred',
        of: (m) => m.psych.mad, fmt: (v) => Math.round(v) + 'px' },
      { label: 'AUC',
        calc: 'per segment, the signed area enclosed between the actual path '
          + 'and that ideal line (shoelace formula, negative when the path '
          + 'bows the other way); mean over segments',
        records: 'the signed area between each sampled segment and its '
          + 'start-to-click line, averaged over segments',
        of: (m) => m.psych.auc, fmt: (v) => sparkAxisNumber(v) + 'px\u00b2' },
      { label: 'AD',
        calc: 'per segment, the mean signed deviation over all path points; '
          + 'mean over segments',
        records: 'the signed mean deviation from the start-to-click line over '
          + 'all path samples, averaged over segments',
        of: (m) => m.psych.ad, fmt: (v) => Math.round(v) + 'px' },
      { label: 'x-flips',
        calc: 'per segment, reversals of horizontal movement direction '
          + '(consecutive moves merge into same-direction runs; flips = runs '
          + 'minus 1); mean over segments',
        records: 'horizontal direction-run reversals in each sampled segment, '
          + 'averaged over segments; they do not prove a change of mind',
        of: (m) => m.psych.xFlips, fmt: (v) => v.toFixed(1) },
      { label: 'y-flips',
        calc: 'the same, vertically',
        records: 'vertical direction-run reversals in each sampled segment, '
          + 'averaged over segments',
        of: (m) => m.psych.yFlips, fmt: (v) => v.toFixed(1) },
      { label: 'initiation',
        calc: 'per segment, time from the segment\u2019s start until the '
          + 'cursor first moves; mean over segments',
        records: 'elapsed time from the segment start to its first sampled '
          + 'cursor movement; the app cannot partition its causes',
        of: (m) => m.psych.initiationTimeMs, fmt: (v) => Math.round(v) + 'ms' },
      { label: 'idle',
        calc: 'per segment, total time of steps where the position did not '
          + 'change; mean over segments',
        records: 'sampled no-position-change time inside each segment, averaged '
          + 'over segments',
        of: (m) => m.psych.idleTimeMs, fmt: (v) => (v / 1000).toFixed(1) + 's' },
      { label: 'vel max',
        calc: 'per segment, the peak point-to-point velocity; mean over '
          + 'segments',
        records: 'the maximum point-to-point cursor speed in each segment, '
          + 'averaged over segments',
        of: (m) => m.psych.velMaxPxPerMs, fmt: (v) => Math.round(v * 1000) + 'px/s' },
      { label: 'acc max',
        calc: 'per segment, the peak increase of velocity per ms; mean over '
          + 'segments',
        records: 'the maximum sampled increase in velocity per millisecond in '
          + 'each segment, averaged over segments',
        of: (m) => m.psych.accMaxPxPerMs2, fmt: (v) => v.toFixed(4) },
      { label: 'entropy',
        calc: 'per segment, sample entropy (m=3) of the differenced x '
          + 'trajectory after resampling to 101 equal time steps; the '
          + 'tolerance r is 0.2 \u00d7 the SD pooled over this game\u2019s '
          + 'segments; mean over segments',
        records: 'sample entropy of the resampled differenced x trajectory, '
          + 'averaged over segments; it does not diagnose restlessness',
        of: (m) => m.psych.sampleEntropy, fmt: (v) => v.toFixed(2) },
      { label: 'segment time',
        calc: 'per segment, time from its start to its click (mousetrap\u2019s '
          + 'RT); mean over segments',
        records: 'total elapsed time from one click to the next for qualifying '
          + 'segments; movement and nonmovement time are not separated',
        of: (m) => m.psych.rtMs, fmt: (v) => (v / 1000).toFixed(1) + 's' },
    ] },
  { key: 'hev', name: 'movement geometry', definition:
      'Hevelius-formula movement features per inter-click movement '
      + '(100Hz resample, 7Hz low-pass; see reference/hevelius/FEATURES.md), '
      + 'reported as means over movements; this game makes no clinical inference',
    displays: [
      { label: 'execution',
        calc: 'per movement, time from its first to its last mousemove, with '
          + 'time the button was held excluded; mean over movements',
        records: 'elapsed time from the first to last sampled movement, with '
          + 'button-hold time excluded, averaged over movements',
        of: (m) => m.hev.executionTimeMs, fmt: (v) => (v / 1000).toFixed(2) + 's' },
      { label: 'exec no pauses',
        calc: 'execution time with mid-movement stops of 100ms or more also '
          + 'subtracted',
        records: 'execution time after subtracting sampled gaps of at least '
          + '100ms; the app does not assign those gaps a cause',
        of: (m) => m.hev.executionTimeNoPausesMs, fmt: (v) => (v / 1000).toFixed(2) + 's' },
      { label: 'peak speed*',
        calc: 'per movement, the maximum of the smoothed speed (trajectory '
          + 'resampled at 100Hz, speed low-passed at 7Hz); mean over movements',
        records: 'the maximum low-pass-filtered speed in each movement, '
          + 'averaged over movements',
        of: (m) => m.hev.peakSpeedPxPerMs, fmt: (v) => Math.round(v * 1000) + 'px/s' },
      { label: 'peak accel',
        calc: 'per movement, the maximum of the smoothed acceleration; mean '
          + 'over movements',
        records: 'the maximum low-pass-filtered acceleration in each movement, '
          + 'averaged over movements',
        of: (m) => m.hev.peakAccelPxPerMs2, fmt: (v) => v.toFixed(4) },
      { label: 'submovements',
        calc: 'per movement, count of speed pulses that cross 100px/s and '
          + 'reach at least 500px/s before dropping back; mean over movements',
        records: 'the number of speed pulses meeting the stated thresholds in '
          + 'each movement, averaged over movements; no cause is assigned',
        of: (m) => m.hev.submovementCount, fmt: (v) => v.toFixed(1) },
      { label: 'main sub',
        calc: 'duration of the submovement containing the movement\u2019s '
          + 'peak speed; mean over movements',
        records: 'the duration of the threshold-defined speed pulse containing '
          + 'peak speed, averaged over movements',
        of: (m) => m.hev.mainSubmovementMs, fmt: (v) => Math.round(v) + 'ms' },
      { label: 'sub end dist',
        calc: 'distance from the clicked cell\u2019s center at the moment the '
          + 'main submovement ends; mean over movements',
        records: 'distance from the clicked cell center when the main '
          + 'threshold-defined speed pulse ended, averaged over movements',
        of: (m) => m.hev.mainSubEndDistPx, fmt: (v) => Math.round(v) + 'px' },
      { label: 'axis dev',
        calc: 'per movement, the maximum distance of the path from the task '
          + 'axis (the straight line joining the movement\u2019s start and '
          + 'end); mean over movements',
        records: 'the maximum sampled perpendicular distance from the '
          + 'start-to-end axis, averaged over movements',
        of: (m) => m.hev.maxAxisDeviationPx, fmt: (v) => Math.round(v) + 'px' },
      { label: 'movement error',
        calc: 'per movement, the average absolute distance of the path from '
          + 'the task axis; mean over movements',
        records: 'the mean absolute sampled distance from the start-to-end '
          + 'axis in each movement, averaged over movements',
        of: (m) => m.hev.movementErrorPx, fmt: (v) => Math.round(v) + 'px' },
      { label: 'axis crossings',
        calc: 'per movement, times the path crossed the task axis; mean over '
          + 'movements',
        records: 'the number of sampled crossings of the start-to-end axis in '
          + 'each movement, averaged over movements; no cause is assigned',
        of: (m) => m.hev.axisCrossings, fmt: (v) => v.toFixed(1) },
      { label: 'norm jerk',
        calc: 'per movement, dimensionless (execution time without '
          + 'pauses)\u00b3 \u00f7 peak speed\u00b2 \u00d7 the integral of '
          + 'squared jerk, pause spans excluded from the integral; mean over '
          + 'movements',
        records: 'the stated dimensionless jerk integral after excluding '
          + 'pause spans, averaged over movements; it is not a diagnosis',
        of: (m) => m.hev.normalizedJerkNoPauses, fmt: (v) => sparkAxisNumber(v) },
      { label: 'click slip',
        calc: 'distance the cursor slid between button press and release; '
          + 'mean over completed left clicks',
        records: 'cursor distance between left-button press and release, '
          + 'averaged over completed left clicks',
        of: (m) => m.hev.clickSlipPx, fmt: (v) => v.toFixed(1) + 'px' },
      { label: 'verification',
        calc: 'time between the last movement inside the clicked cell and the '
          + 'button press; mean over movements where the cursor ended inside '
          + 'the cell',
        records: 'elapsed time from the last sampled movement inside the '
          + 'clicked cell to its button press; purpose is not observed',
        of: (m) => m.hev.verificationTimeMs, fmt: (v) => Math.round(v) + 'ms' },
      { label: 're-entries',
        calc: 'times the pointer left the clicked cell and came back before '
          + 'the click; mean over movements with a known target cell',
        records: 'the number of times the pointer left and re-entered the '
          + 'eventual clicked cell before the click, averaged over movements',
        of: (m) => m.hev.targetReentries, fmt: (v) => v.toFixed(1) },
    ] },
];

// Series keys must be unique across groups (labels repeat, e.g. "peak
// speed"); group key + label is the identity of a displayed series.
function metricSeriesKey(group, display) {
  return group.key + ':' + display.label;
}

// A displayed number: NaN means a formula was computed but degenerated
// (e.g. sample entropy with no matching windows) — for display both are
// one thing: not measurable here.
function displayableNumber(v) {
  return v === undefined || Number.isNaN(v) ? undefined : v;
}

// The per-game history of every displayed value, one entry per render
// (about one per second, plus the final render), feeding the sparklines.
// Display-side state only: nothing here is stored anywhere.
let metricsSeries = null;

function beginTraceMetricsSeries() {
  const byKey = new Map();
  for (const group of TRACE_METRIC_GROUPS) {
    for (const display of group.displays) {
      byKey.set(metricSeriesKey(group, display), []);
    }
  }
  metricsSeries = { tMs: [], byKey: byKey };
  liveSegmentCache = { clickEvents: -1, psych: null, hev: null };
}

// Compact numeric form for sparkline axis labels; the units live in the
// value column of the same row.
function sparkAxisNumber(v) {
  if (Math.abs(v) >= 10000) return (v / 1000).toPrecision(3) + 'k';
  if (Math.abs(v) >= 100) return String(Math.round(v));
  if (v === 0) return '0';
  return v.toPrecision(2);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// Chart geometries: small for the live panel's rows, large for the
// after-game charts inline at the page bottom.
const SPARK_SMALL = { width: 150, height: 46, left: 34, bottom: 11, dotR: 1.7, labelClass: 'spark-label' };
const SPARK_LARGE = { width: 230, height: 130, left: 40, bottom: 14, dotR: 2.5, labelClass: 'spark-label spark-label-big' };

// A tallish per-metric chart of the value over the game: y axis labeled
// with the series min and max, x axis from 0 to the latest elapsed
// seconds. Gaps (spans where the value was not yet measurable) break the
// line rather than being bridged.
function buildSparkline(tMs, values, size) {
  const { width, height, left, bottom } = size;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);

  const frame = document.createElementNS(SVG_NS, 'rect');
  frame.setAttribute('class', 'spark-frame');
  frame.setAttribute('x', left);
  frame.setAttribute('y', 1);
  frame.setAttribute('width', width - left - 1);
  frame.setAttribute('height', height - bottom - 2);
  svg.appendChild(frame);

  let min = Infinity;
  let max = -Infinity;
  let defined = 0;
  for (const v of values) {
    if (v === undefined) continue;
    defined++;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (defined === 0) return svg; // frame only: nothing measurable yet
  // A flat series draws mid-chart, but its axis labels stay the true
  // value — the padding is chart geometry, not data.
  const labelMin = min;
  const labelMax = max;
  if (min === max) { min -= 0.5; max += 0.5; }

  const tEnd = tMs[tMs.length - 1];
  const xOf = (t) => left + (tEnd > 0 ? (t / tEnd) * (width - left - 3) : 0) + 1;
  const yOf = (v) => 1 + (1 - (v - min) / (max - min)) * (height - bottom - 4) + 1;

  let d = '';
  let pen = false; // whether the previous point existed (draw vs move)
  let lastX = null;
  let lastY = null;
  for (let i = 0; i < values.length; i++) {
    if (values[i] === undefined) { pen = false; continue; }
    lastX = xOf(tMs[i]);
    lastY = yOf(values[i]);
    d += (pen ? 'L' : 'M') + lastX.toFixed(1) + ' ' + lastY.toFixed(1);
    pen = true;
  }
  const line = document.createElementNS(SVG_NS, 'path');
  line.setAttribute('class', 'spark-line');
  line.setAttribute('d', d);
  svg.appendChild(line);
  const dot = document.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('class', 'spark-dot');
  dot.setAttribute('cx', lastX.toFixed(1));
  dot.setAttribute('cy', lastY.toFixed(1));
  dot.setAttribute('r', size.dotR);
  svg.appendChild(dot);

  const textAt = (x, y, anchor, content) => {
    const el = document.createElementNS(SVG_NS, 'text');
    el.setAttribute('class', size.labelClass);
    el.setAttribute('x', x);
    el.setAttribute('y', y);
    el.setAttribute('text-anchor', anchor);
    el.textContent = content;
    svg.appendChild(el);
  };
  textAt(left - 2, 8, 'end', sparkAxisNumber(labelMax));
  textAt(left - 2, height - bottom - 1, 'end', sparkAxisNumber(labelMin));
  textAt(left, height - 1, 'start', '0');
  textAt(width - 2, height - 1, 'end', (tEnd / 1000).toFixed(0) + 's');
  return svg;
}

function appendTraceMetricsSeries(metrics) {
  metricsSeries.tMs.push(metrics.wallDurationMs);
  for (const group of TRACE_METRIC_GROUPS) {
    for (const display of group.displays) {
      metricsSeries.byKey.get(metricSeriesKey(group, display))
        .push(displayableNumber(display.of(metrics)));
    }
  }
}

// One metric as label + current value + chart of its series.
function buildMetricRow(group, display, metrics, series, size, rowClass) {
  const value = displayableNumber(display.of(metrics));
  const row = document.createElement('div');
  row.className = rowClass;
  const head = document.createElement('div');
  head.className = 'metric-head';
  const labelEl = document.createElement('span');
  labelEl.className = 'metric-label';
  labelEl.textContent = display.label;
  const valueEl = document.createElement('span');
  valueEl.className = 'metric-value';
  valueEl.textContent = value === undefined ? '\u2013' : display.fmt(value);
  head.append(labelEl, valueEl);
  row.appendChild(head);
  row.appendChild(buildSparkline(
    series.tMs, series.byKey.get(metricSeriesKey(group, display)), size));
  return row;
}

// The section header naming a measurement system, shared by the live
// panel and the after-game charts.
function buildMetricsGroupHead(group) {
  const head = document.createElement('div');
  head.className = 'metrics-group-head';
  head.textContent = group.name;
  return head;
}

// Whether the player tucked the live panel away with its own toggler.
// Session-only display state: the persistent switch is the
// showMotionStatsDuringGame setting.
let metricsPanelCollapsed = false;

// The metrics of the latest render, so toggler clicks and settings
// changes can redraw the panel without waiting for the next tick.
let lastLiveMetrics = null;

// The left panel hosts two things: the session section (always, while its
// setting is on — it spans games) and the live per-game rows (only while a
// trace runs and that setting is on). metrics === null means "no live
// rows": between games the panel still renders for the session section.
// Rendering the panel is what shows, hides, collapses, or resizes it —
// the layout changes that move the centered board without any scroll or
// resize event — so every render ends with a geometry check. The
// live-metrics tick passes through here too, making this the once-a-
// second catch-all for any other content-driven board movement.
function renderMetricsPanel(metrics) {
  renderMetricsPanelContent(metrics);
  syncBoardLayout();
}

function renderMetricsPanelContent(metrics) {
  // Any explicit rebuild retires the SVG that owns an open win tooltip.
  // Ordinary once-a-second rebuilds pause while a real pointer hovers a
  // chart, so this is cleanup rather than visible tooltip flicker.
  hideSessionWinTooltip();
  const showSession = settings.showSessionStats;
  const showLive = settings.showMotionStatsDuringGame
    && metrics !== null && tracing();
  if (!showSession && !showLive) {
    metricsPanel.hidden = true;
    return;
  }
  // The panel redraws live values once a second. Replacing its children
  // must not throw a reader back to the top of the independently scrolling
  // panel.
  const savedScrollTop = metricsPanelContent.scrollTop;
  metricsPanel.hidden = false;
  metricsPanelContent.textContent = '';
  for (const oldGrip of metricsPanel.querySelectorAll('.metrics-resize')) oldGrip.remove();
  metricsPanel.classList.toggle('collapsed', metricsPanelCollapsed);
  // The dragged width applies only expanded; collapsed shrinks to its chip.
  metricsPanel.style.width = metricsPanelCollapsed
    ? '' : settings.metricsPanelWidth + 'px';

  if (metricsPanelCollapsed) {
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'metrics-toggle';
    restore.textContent = 'stats \u25b8';
    restore.title = 'show the session / live motion stats panel again';
    restore.addEventListener('click', () => {
      metricsPanelCollapsed = false;
      refreshMetricsPanel();
    });
    metricsPanelContent.appendChild(restore);
    return;
  }

  const head = document.createElement('div');
  head.className = 'metrics-panel-head';
  const hide = document.createElement('button');
  hide.type = 'button';
  hide.className = 'metrics-toggle';
  hide.textContent = '\u00d7';
  hide.title = 'tuck this panel away for now (the "show session stats" and "show motion stats during game" settings turn its parts off for good)';
  hide.addEventListener('click', () => {
    metricsPanelCollapsed = true;
    refreshMetricsPanel();
  });
  if (showLive) {
    const phaseEl = document.createElement('span');
    phaseEl.className = 'metric-phase';
    phaseEl.textContent = 'live';
    head.appendChild(phaseEl);
  }
  head.appendChild(hide);
  metricsPanelContent.appendChild(head);
  metricsPanel.appendChild(buildMetricsResizeGrip());

  // The session and live sections each sit in their own wrapper (all
  // panel CSS selects by descendant, so the extra div changes nothing).
  if (showSession) {
    const sessionWrap = document.createElement('div');
    appendSessionSection(sessionWrap);
    metricsPanelContent.appendChild(sessionWrap);
  }
  if (!showLive) {
    metricsPanelContent.scrollTop = savedScrollTop;
    return;
  }
  const liveWrap = document.createElement('div');
  for (const group of TRACE_METRIC_GROUPS) {
    liveWrap.appendChild(buildMetricsGroupHead(group));
    for (const display of group.displays) {
      liveWrap.appendChild(buildMetricRow(
        group, display, metrics, metricsSeries, SPARK_SMALL, 'metric-row'));
    }
  }
  metricsPanelContent.appendChild(liveWrap);
  metricsPanelContent.scrollTop = savedScrollTop;
}

// The panel's right-edge drag grip. Its move/up listeners live on the
// document, so per-frame panel rebuilds during a drag do not interrupt it.
// Width and chart geometry both follow the pointer on the next animation
// frame; release persists the final width.
function buildMetricsResizeGrip() {
  const grip = document.createElement('div');
  grip.className = 'metrics-resize';
  grip.title = 'drag to resize the stats panel';
  grip.setAttribute('role', 'separator');
  grip.setAttribute('aria-label', 'resize stats panel');
  grip.setAttribute('aria-orientation', 'vertical');
  grip.setAttribute('aria-valuemin', String(METRICS_PANEL_WIDTH_MIN));
  grip.setAttribute('aria-valuemax', String(METRICS_PANEL_WIDTH_MAX));
  grip.setAttribute('aria-valuenow', String(settings.metricsPanelWidth));
  grip.tabIndex = 0;
  grip.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    settings.metricsPanelWidth = Math.min(METRICS_PANEL_WIDTH_MAX,
      Math.max(METRICS_PANEL_WIDTH_MIN, settings.metricsPanelWidth + direction * 10));
    saveSettings();
    refreshMetricsPanel();
  });
  grip.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = settings.metricsPanelWidth;
    let renderFrame = null;
    const move = (ev) => {
      settings.metricsPanelWidth = Math.min(METRICS_PANEL_WIDTH_MAX,
        Math.max(METRICS_PANEL_WIDTH_MIN, Math.round(startWidth + ev.clientX - startX)));
      metricsPanel.style.width = settings.metricsPanelWidth + 'px';
      if (renderFrame === null) {
        renderFrame = requestAnimationFrame(() => {
          renderFrame = null;
          refreshMetricsPanel();
        });
      }
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      if (renderFrame !== null) cancelAnimationFrame(renderFrame);
      saveSettings();
      refreshMetricsPanel();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });
  return grip;
}

// The finished game's canonical metrics and its full series, snapshotted
// at game end for the after-game charts (see buildMotionStatsCharts);
// null while no finished game is on screen. beginTrace replaces
// metricsSeries with a fresh object, so these references stay the ended
// game's own.
let finalMotion = null;

// The after-game display: one semantic subgroup per measurement system.
// Each subgroup owns its heading and responsive chart row, so viewport
// wrapping can never mix the tail of one system with the next one.
// Canonical values: same computation as live, complete trace.
function buildMotionStatsCharts() {
  const nodes = [];
  for (const group of TRACE_METRIC_GROUPS) {
    const section = document.createElement('section');
    section.className = 'motion-metric-group';
    section.appendChild(buildMetricsGroupHead(group));
    const items = document.createElement('div');
    items.className = 'motion-metric-group-items';
    for (const display of group.displays) {
      items.appendChild(buildMetricRow(
        group, display, finalMotion.metrics, finalMotion.series, SPARK_LARGE,
        'metric-row motion-chart'));
    }
    section.appendChild(items);
    nodes.push(section);
  }
  return nodes;
}

// Applies the panel-affecting settings immediately (called on any settings
// change; ticks would apply them within a second anyway). Between games
// the live metrics are absent by definition, not merely stale.
function refreshMetricsPanel() {
  renderMetricsPanel(tracing() ? lastLiveMetrics : null);
}

// The segment-based systems (psychometric, clinical) only see completed
// inter-click segments, so their values cannot change between clicks;
// the live schedule recomputes them only when the trace's click count
// moves, and recomputes the whole-trace systems every tick.
let liveSegmentCache = { clickEvents: -1, psych: null, hev: null };

function renderLiveTraceMetrics() {
  const wallMs = Date.now() - trace.startedAt;
  let clickEvents = 0;
  for (const ev of trace.events) {
    if (ev.kind === 'lup' || ev.kind === 'rdown') clickEvents++;
  }
  if (clickEvents !== liveSegmentCache.clickEvents) {
    liveSegmentCache = {
      clickEvents: clickEvents,
      psych: computePsychometrics(trace.t, trace.x, trace.y, trace.events),
      hev: computeHevelius(trace.t, trace.x, trace.y, trace.events),
    };
  }
  const metrics = {
    wallDurationMs: wallMs,
    bio: computeTraceMetrics(trace.t, trace.x, trace.y, trace.events, wallMs),
    psych: liveSegmentCache.psych,
    hev: liveSegmentCache.hev,
    waste: computeWasteMetrics(trace.t, trace.x, trace.y, trace.events),
    cad: computeClickCadence(trace.t, trace.events),
  };
  appendTraceMetricsSeries(metrics);
  lastLiveMetrics = metrics;
  renderMetricsPanel(metrics);
}

setInterval(() => {
  // Never rebuild the panel under the player's open control: the ticker
  // replacing the DOM while the bucket dropdown was open closed it
  // before a choice could land. Focus inside the panel means a control
  // is in use; the control's own change handler re-renders explicitly
  // (which replaces the control and releases focus), and clicking
  // anywhere else blurs it, so the ticker resumes within a second. A
  // hovered chart likewise stays still while its instant win tooltip is
  // being inspected; moving off it resumes updates.
  if (metricsPanel.contains(document.activeElement)
      || metricsPanel.querySelector('.session-chart:hover')) return;
  if (tracing()) renderLiveTraceMetrics();
  // Between games the session section still redraws for UI consistency;
  // its cumulative-play axis correctly stays fixed while nothing is played.
  else renderMetricsPanel(null);
}, LIVE_METRICS_EVERY_MS);

//-------SESSION STATS: COMPUTATION (pure; cross-game running averages)-------

// The recent-observations section (PRODUCT.md "Session stats"): running
// averages over recent actual play, across games, losses and abandoned
// boards included — but only over time a game was actually in progress
// (first reveal to game end), never travel to the restart button or
// between-game idling. Two layers: sessionBucketSeries chops the played
// timeline into fixed buckets and sums each; sessionRunningSeries rolls a
// trailing-lookback window over fine (SESSION_STEP_MS) buckets, so each
// charted point is "the average over the last N minutes of play" — N of
// played time, never wall time. These are observations only; this code
// does not infer mood, condition, play style, or any cause for a change.
//
// Everything here is pure over an event list so it is testable in Node
// (tests/session-buckets-test.js extracts this span). Events, all wall
// clock ms:
// - {kind:'play', from, to} — a finished span of in-progress play; the
//   currently running span is passed separately as opts.openPlayFrom.
// - {kind:'move', at, px} — cursor travel while playing, coalesced into
//   ~1s cells (the sample step is 10s, so cell granularity is invisible).
// - {kind:'press', at, useful, flag, misclick, moving, gapMs} — one board press.
//   useful = it changed the board; flag = it placed a flag; moving = a
//   cursor move landed within 100ms before it (the cadence definition);
//   misclick = the board-changing action contradicted a visible-board fact;
//   gapMs = time since the previous useful press of the same game
//   (undefined on each game's first useful press).
// - {kind:'death', at, mistake} — a lost game; mistake says whether the
//   fatal action carried at least one recorded mistake tag.
// - {kind:'end', at, end, winUnmarked} — a finished game's ending: 'win',
//   a fatal-action status kind (see FATAL_STATUS_LABELS), a legacy
//   verdict kind (see DEATH_KIND_LABELS), or 'other' for an unjudged
//   loss. On a measured win, winUnmarked is the share of the board's
//   mines carrying no flag at the winning instant (0..1); absent
//   otherwise. Feeds the game-endings fraction lines.
// - {kind:'game', modeKey, from, to, px, useful, wasted, misclicks, flags, fatalMistake, fastGapMs, end, winUnmarked}
//   — a whole finished game backfilled from its stored record (games
//   played before this page load; see sessionBackfillFromHistory). Its
//   totals spread across its span proportionally to each bucket's
//   overlap — a bucket-level approximation where live events are exact —
//   its play time counts like a 'play' interval, a mistake-tagged death and the
//   ending land in the bucket the game ended in, and the stored per-game
//   fastclick median contributes one gap sample to each bucket it overlaps.
// The running-average sample step: one charted point per this much
// accumulated play. Finer would redraw sub-pixel wiggles; coarser would
// visibly stairstep the shortest (30s) lookback.
const SESSION_STEP_MS = 10 * 1000;
// Retention always covers the largest selectable window plus the largest
// selectable lookback (see SESSION_WINDOW_CHOICES / SESSION_LOOKBACK_CHOICES),
// so switching either to its longest works at once.
const SESSION_WINDOW_MAX_MS = 3 * 60 * 60 * 1000;
const SESSION_LOOKBACK_MAX_MS = 15 * 60 * 1000;
const SESSION_KEEP_MS =
  SESSION_WINDOW_MAX_MS + SESSION_LOOKBACK_MAX_MS + 5 * 60 * 1000; // + slack
const SESSION_MOVE_COALESCE_MS = 1000;
const SESSION_MOVING_PRESS_MS = 100; // press "on the move" (same as cadence)
// A useful-press gap this short qualifies for the fastclick median.
// This is a timing filter only; it assigns no cause to the interval.
const FASTCLICK_MAX_GAP_MS = 1000;
// A bucket needs at least this much in-progress play before its rates are
// measurable: dividing one death by the 50ms sliver of play at a bucket's
// edge prints a 1200/min absurdity that reads as data. Under a second of
// evidence is no evidence — the bucket shows an en dash instead.
const SESSION_MIN_PLAY_MS = 1000;

// Every game ending files into exactly one of these kinds: 'win', a
// modern fatal-action status (the FATAL_STATUS_LABELS keys — the exact
// categories the after-game report uses for its reasons for losing), a
// legacy-imported record's five-way verdict kept as provenance (the
// DEATH_KIND_LABELS keys), or 'other' — an unjudged loss. The endings
// chart draws one cumulative percent line per kind.
const SESSION_END_KINDS = [
  'win',
  'guess-min', 'guess-higher', 'guess-unmeasured', 'guess-safe',
  'mine-safe', 'mine-forced', 'proof-safe', 'proof-forced',
  'angel', 'forced', 'needless', 'mine', 'chord',
  'other',
];

function sessionMedian(values) {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Selects the newest games by accumulated played duration. Their wall ages
// and the breaks between them are deliberately irrelevant.
function sessionHistorySlice(games, keepMs) {
  let keepFrom = games.length;
  let keptPlayMs = 0;
  while (keepFrom > 0 && keptPlayMs < keepMs) {
    keepFrom--;
    keptPlayMs += games[keepFrom].to - games[keepFrom].from;
  }
  let playOffsetMs = 0;
  for (let i = 0; i < keepFrom; i++) {
    playOffsetMs += games[i].to - games[i].from;
  }
  return { games: games.slice(keepFrom), playOffsetMs };
}

// Keep enough recent play for the all-modes view and independently for
// every exact mode. This prevents a frequently played mode from pushing a
// less frequent current mode out of its selectable played-time window.
function sessionRetainedEvents(events, keepMs) {
  const spans = events
    .filter((ev) => (ev.kind === 'play' || ev.kind === 'game') && ev.to > ev.from)
    .sort((a, b) => a.to - b.to);
  const retained = new Set(sessionHistorySlice(spans, keepMs).games);
  const byMode = new Map();
  for (const span of spans) {
    const key = span.modeKey || '';
    if (!byMode.has(key)) byMode.set(key, []);
    byMode.get(key).push(span);
  }
  for (const modeSpans of byMode.values()) {
    for (const span of sessionHistorySlice(modeSpans, keepMs).games) retained.add(span);
  }
  const modeCutoffs = new Map();
  for (const span of retained) {
    const key = span.modeKey || '';
    modeCutoffs.set(key, Math.min(modeCutoffs.get(key) ?? Infinity, span.from));
  }
  return events.filter((ev) => {
    if (ev.kind === 'play' || ev.kind === 'game') return retained.has(ev);
    const cutoff = modeCutoffs.get(ev.modeKey || '');
    // An active game's point events exist before its play span is closed.
    // With no finished span for that mode yet, they must all survive.
    return cutoff === undefined || ev.at >= cutoff;
  });
}

function sessionEventsForMode(events, exactModeKey, scope) {
  return scope === 'all'
    ? events
    : events.filter((ev) => ev.modeKey === exactModeKey);
}

// The mine count encoded in a mode key ("30x16/99" or "30x16/99@standard").
function minesOfModeKey(key) {
  const mines = Number(key.split('@')[0].split('/')[1]);
  return Number.isFinite(mines) && mines > 0 ? mines : undefined;
}

// The share of the board's mines carrying no flag when a stored win
// ended, derived (never stored) from the flag counters: a flagged cell
// cannot be revealed, so at a win every flag still on the board provably
// sits on a mine, and flags-on-board = flagsPlaced - flagsRemoved. Not
// measured when the counters predate their fields — a nonzero
// flagsPlaced without flagsRemoved coverage cannot give the net.
function recordWinUnmarkedShare(record, mines) {
  if (record.outcome !== 'win' || mines === undefined) return undefined;
  if (typeof record.flagsPlaced !== 'number') return undefined;
  if (record.flagsPlaced !== 0 && typeof record.flagsRemoved !== 'number') {
    return undefined;
  }
  const onBoard = record.flagsPlaced - (record.flagsRemoved || 0);
  return Math.min(1, Math.max(0, (mines - onBoard) / mines));
}

// Collapses all play spans onto one cumulative-play timeline, then buckets
// that timeline. Wall-clock gaps consume no x distance and no bucket time:
// ten played seconds, a five-minute break, and twenty more played seconds
// are one contiguous thirty-second run here. playOffsetMs is the cumulative
// duration of older spans pruned from RAM, preserving bucket alignment.
// Finished buckets are anchored to cumulative played-time multiples; only
// the current partial bucket changes while play continues.
function sessionBucketSeries(events, opts) {
  const spans = [];
  for (const ev of events) {
    if ((ev.kind === 'play' || ev.kind === 'game') && ev.to > ev.from) {
      spans.push({ from: ev.from, to: ev.to, game: ev.kind === 'game' ? ev : null });
    }
  }
  if (typeof opts.openPlayFrom === 'number' && opts.nowMs > opts.openPlayFrom) {
    spans.push({ from: opts.openPlayFrom, to: opts.nowMs, game: null });
  }
  spans.sort((a, b) => a.from - b.from || a.to - b.to);

  let playCursor = opts.playOffsetMs || 0;
  for (const span of spans) {
    span.playFrom = playCursor;
    span.playTo = playCursor + span.to - span.from;
    playCursor = span.playTo;
  }
  const playNowMs = playCursor;
  const windowFrom = playNowMs - opts.windowMs;
  const startPlayMs = Math.floor(windowFrom / opts.bucketMs) * opts.bucketMs;
  const bucketCount = Math.max(1, Math.ceil((playNowMs - startPlayMs) / opts.bucketMs));
  const bucketAt = (playAt) => Math.floor((playAt - startPlayMs) / opts.bucketMs);

  const playMs = new Array(bucketCount).fill(0);
  const movePx = new Array(bucketCount).fill(0);
  const useful = new Array(bucketCount).fill(0);
  const wasted = new Array(bucketCount).fill(0);
  const misclickPlayMs = new Array(bucketCount).fill(0);
  const misclickCount = new Array(bucketCount).fill(0);
  const flags = new Array(bucketCount).fill(0);
  const unflags = new Array(bucketCount).fill(0);
  const avoidableDeaths = new Array(bucketCount).fill(0);
  const categoryCounts = Object.fromEntries(ACTION_CATEGORY_SPECS.map((spec) =>
    [spec.id, new Array(bucketCount).fill(0)]));
  const excessRisk = new Array(bucketCount).fill(0);
  const modeledLifeGap = new Array(bucketCount).fill(0);
  const fastGaps = Array.from({ length: bucketCount }, () => []);
  const endCounts = SESSION_END_KINDS.map(() => new Array(bucketCount).fill(0));
  // Exact game-end instants stay separate from the bucketed aggregates so
  // every session chart can mark wins and each kind of loss at the true
  // played-time coordinate with the endings chart's semantic color.
  const gameEnds = [];
  const wins = [];
  const addGameEnd = (playAt, ev) => {
    if (playAt < windowFrom || playAt > playNowMs) return;
    const marker = {
      playAt,
      end: ev.end,
      timeMs: ev.timeMs,
      boardKey: ev.boardKey,
      endedAt: ev.endedAt === undefined ? (ev.at === undefined ? ev.to : ev.at) : ev.endedAt,
    };
    gameEnds.push(marker);
    if (ev.end === 'win') wins.push(marker);
  };
  // The unmarked-mines-at-win inputs: per bucket, the sum of measured
  // wins' unmarked-mine shares and how many wins carried the measurement
  // (wins recorded before flag counting stay out of both).
  const winUnmarkedSum = new Array(bucketCount).fill(0);
  const winUnmarkedWins = new Array(bucketCount).fill(0);
  const countEnd = (i, end, winUnmarked) => {
    if (i < 0 || i >= bucketCount) return;
    const k = SESSION_END_KINDS.indexOf(end);
    endCounts[k >= 0 ? k : SESSION_END_KINDS.indexOf('other')][i]++;
    if (end === 'win' && typeof winUnmarked === 'number') {
      winUnmarkedSum[i] += winUnmarked;
      winUnmarkedWins[i]++;
    }
  };

  const eachPlayOverlap = (from, to, take) => {
    from = Math.max(from, windowFrom);
    to = Math.min(to, playNowMs);
    for (let i = Math.max(0, bucketAt(from)); i < bucketCount; i++) {
      const bucketFrom = startPlayMs + i * opts.bucketMs;
      if (bucketFrom >= to) break;
      take(i, Math.min(to, bucketFrom + opts.bucketMs) - Math.max(from, bucketFrom));
    }
  };

  for (const span of spans) {
    const ev = span.game;
    const spanMs = span.playTo - span.playFrom;
    eachPlayOverlap(span.playFrom, span.playTo, (i, overlapMs) => {
      playMs[i] += overlapMs;
      if (ev === null || typeof ev.misclicks === 'number') {
        misclickPlayMs[i] += overlapMs;
      }
      if (ev !== null) {
        const share = overlapMs / spanMs;
        movePx[i] += ev.px * share;
        useful[i] += ev.useful * share;
        wasted[i] += ev.wasted * share;
        if (typeof ev.misclicks === 'number') {
          misclickCount[i] += ev.misclicks * share;
        }
        flags[i] += ev.flags * share;
        unflags[i] += (ev.unflags || 0) * share;
        if (ev.categoryCounts) {
          for (const spec of ACTION_CATEGORY_SPECS) {
            categoryCounts[spec.id][i] += (ev.categoryCounts[spec.id] || 0) * share;
          }
          excessRisk[i] += (ev.excessRisk || 0) * share;
          modeledLifeGap[i] += (ev.modeledLifeGap || 0) * share;
        }
        if (typeof ev.fastGapMs === 'number') fastGaps[i].push(ev.fastGapMs);
      }
    });
    if (ev !== null && ev.fatalMistake === true) {
      const i = bucketAt(span.playTo - 1e-6);
      if (i >= 0 && i < bucketCount) avoidableDeaths[i]++;
    }
    // The ending lands in the bucket containing the game's final instant,
    // like the classified death above.
    if (ev !== null && typeof ev.end === 'string') {
      countEnd(bucketAt(span.playTo - 1e-6), ev.end, ev.winUnmarked);
      addGameEnd(span.playTo, ev);
    }
  }

  // Maps a live wall-clock event into its containing compressed play span.
  // The first press can precede sessionPlayBegin by a few milliseconds;
  // attach that one to the immediately following span.
  const playAtWallTime = (at) => {
    for (const span of spans) {
      if (at >= span.from && at <= span.to) {
        return Math.min(span.playTo - 1e-6, span.playFrom + at - span.from);
      }
      if (at < span.from && span.from - at <= 100) return span.playFrom;
      if (at < span.from) break;
    }
    return null;
  };

  for (const ev of events) {
    if (ev.kind === 'play' || ev.kind === 'game') continue;
    const playAt = playAtWallTime(ev.at);
    if (playAt === null || playAt < windowFrom || playAt > playNowMs) continue;
    const i = bucketAt(playAt);
    if (i < 0 || i >= bucketCount) continue;
    if (ev.kind === 'move') {
      movePx[i] += ev.px;
    } else if (ev.kind === 'press') {
      if (ev.useful) useful[i]++;
      else wasted[i]++;
      if (ev.misclick) misclickCount[i]++;
      if (ev.flag) flags[i]++;
      if (ev.unflag) unflags[i]++;
      if (ev.useful && ev.moving && ev.gapMs !== undefined
          && ev.gapMs <= FASTCLICK_MAX_GAP_MS) {
        fastGaps[i].push(ev.gapMs);
      }
    } else if (ev.kind === 'death' && ev.mistake === true) {
      avoidableDeaths[i]++;
    } else if (ev.kind === 'evaluation') {
      if (categoryCounts[ev.category]) categoryCounts[ev.category][i]++;
      excessRisk[i] += ev.excessRisk || 0;
      modeledLifeGap[i] += ev.modeledLifeGap || 0;
    } else if (ev.kind === 'end') {
      countEnd(i, ev.end, ev.winUnmarked);
      addGameEnd(playAt, ev);
    }
  }
  gameEnds.sort((a, b) => a.playAt - b.playAt);
  wins.sort((a, b) => a.playAt - b.playAt);

  // Game endings are exposed both as cumulative fractions (for running
  // averages) and independent per-bucket fractions (for raw grouping).
  // A fraction of no finished games is undefined, never zero.
  const endFractions = {};
  const rawEndFractions = {};
  for (const kind of SESSION_END_KINDS) {
    endFractions[kind] = new Array(bucketCount).fill(undefined);
    rawEndFractions[kind] = new Array(bucketCount).fill(undefined);
  }
  const endGames = new Array(bucketCount).fill(0);
  const rawEndGames = new Array(bucketCount).fill(0);
  const winUnmarkedFraction = new Array(bucketCount).fill(undefined);
  const rawWinUnmarkedFraction = new Array(bucketCount).fill(undefined);
  {
    const cumulative = new Array(SESSION_END_KINDS.length).fill(0);
    let total = 0;
    let unmarkedSum = 0;
    let unmarkedWins = 0;
    for (let i = 0; i < bucketCount; i++) {
      const bucketGames = endCounts.reduce((sum, counts) => sum + counts[i], 0);
      rawEndGames[i] = bucketGames;
      if (bucketGames > 0) {
        for (let k = 0; k < SESSION_END_KINDS.length; k++) {
          rawEndFractions[SESSION_END_KINDS[k]][i] = endCounts[k][i] / bucketGames;
        }
      }
      if (winUnmarkedWins[i] > 0) {
        rawWinUnmarkedFraction[i] = winUnmarkedSum[i] / winUnmarkedWins[i];
      }
      for (let k = 0; k < SESSION_END_KINDS.length; k++) {
        cumulative[k] += endCounts[k][i];
        total += endCounts[k][i];
      }
      endGames[i] = total;
      if (total > 0) {
        for (let k = 0; k < SESSION_END_KINDS.length; k++) {
          endFractions[SESSION_END_KINDS[k]][i] = cumulative[k] / total;
        }
      }
      unmarkedSum += winUnmarkedSum[i];
      unmarkedWins += winUnmarkedWins[i];
      if (unmarkedWins > 0) winUnmarkedFraction[i] = unmarkedSum / unmarkedWins;
    }
  }

  const centers = [];
  const speedPxPerSec = [];
  const clicksPerSec = [];
  const avoidablePerMin = [];
  const wastedPerMin = [];
  const misclicksPerMin = [];
  const flagsPerSec = [];
  const mismarksPerMin = [];
  const fastclickGapMs = [];
  const categoryPerMin = Object.fromEntries(
    ACTION_CATEGORY_SPECS.map((spec) => [spec.id, []]));
  const excessRiskPctPerMin = [];
  const modeledLifeGapPerMin = [];
  const usefulPerGame = [];
  const wastedPerGame = [];
  const misclicksPerGame = [];
  const flagsPerGame = [];
  const mismarksPerGame = [];
  const avoidablePerGame = [];
  const categoryPerGame = Object.fromEntries(
    ACTION_CATEGORY_SPECS.map((spec) => [spec.id, []]));
  const excessRiskPctPerGame = [];
  const modeledLifeGapPerGame = [];
  for (let i = 0; i < bucketCount; i++) {
    centers.push(startPlayMs + (i + 0.5) * opts.bucketMs);
    const playedSec = playMs[i] / 1000;
    const enough = playMs[i] >= SESSION_MIN_PLAY_MS;
    speedPxPerSec.push(enough ? movePx[i] / playedSec : undefined);
    clicksPerSec.push(enough ? useful[i] / playedSec : undefined);
    avoidablePerMin.push(enough ? avoidableDeaths[i] / (playedSec / 60) : undefined);
    wastedPerMin.push(enough ? wasted[i] / (playedSec / 60) : undefined);
    const misclickPlayedSec = misclickPlayMs[i] / 1000;
    misclicksPerMin.push(misclickPlayMs[i] >= SESSION_MIN_PLAY_MS
      ? misclickCount[i] / (misclickPlayedSec / 60) : undefined);
    flagsPerSec.push(enough ? flags[i] / playedSec : undefined);
    mismarksPerMin.push(enough ? unflags[i] / (playedSec / 60) : undefined);
    for (const spec of ACTION_CATEGORY_SPECS) {
      categoryPerMin[spec.id].push(enough
        ? categoryCounts[spec.id][i] / (playedSec / 60) : undefined);
    }
    excessRiskPctPerMin.push(enough
      ? 100 * excessRisk[i] / (playedSec / 60) : undefined);
    modeledLifeGapPerMin.push(enough
      ? modeledLifeGap[i] / (playedSec / 60) : undefined);
    const games = rawEndGames[i];
    usefulPerGame.push(games > 0 ? useful[i] / games : undefined);
    wastedPerGame.push(games > 0 ? wasted[i] / games : undefined);
    misclicksPerGame.push(games > 0 ? misclickCount[i] / games : undefined);
    flagsPerGame.push(games > 0 ? flags[i] / games : undefined);
    mismarksPerGame.push(games > 0 ? unflags[i] / games : undefined);
    avoidablePerGame.push(games > 0 ? avoidableDeaths[i] / games : undefined);
    for (const spec of ACTION_CATEGORY_SPECS) {
      categoryPerGame[spec.id].push(games > 0
        ? categoryCounts[spec.id][i] / games : undefined);
    }
    excessRiskPctPerGame.push(games > 0 ? 100 * excessRisk[i] / games : undefined);
    modeledLifeGapPerGame.push(games > 0 ? modeledLifeGap[i] / games : undefined);
    fastclickGapMs.push(sessionMedian(fastGaps[i]));
  }
  return {
    startPlayMs, bucketMs: opts.bucketMs, playNowMs,
    windowMs: opts.windowMs, centers, playMs,
    speedPxPerSec, clicksPerSec, avoidablePerMin, wastedPerMin, misclicksPerMin, flagsPerSec,
    mismarksPerMin, fastclickGapMs, endFractions, endGames, winUnmarkedFraction,
    rawEndFractions, rawEndGames, rawWinUnmarkedFraction,
    wins, gameEnds,
    categoryPerMin, excessRiskPctPerMin, modeledLifeGapPerMin,
    usefulPerGame, wastedPerGame, misclicksPerGame, flagsPerGame,
    mismarksPerGame, avoidablePerGame, categoryPerGame,
    excessRiskPctPerGame, modeledLifeGapPerGame,
    // The raw per-bucket accumulations behind the rates, for layers that
    // aggregate across buckets (sessionRunningSeries) — rates can't be
    // re-averaged without their weights.
    sums: { playMs, movePx, useful, wasted, misclickPlayMs, misclickCount,
      flags, unflags, avoidableDeaths, categoryCounts, excessRisk,
      modeledLifeGap, fastGaps, endCounts, winUnmarkedSum, winUnmarkedWins },
  };
}

// Independent played-time buckets. Rates use only each bucket's own raw
// totals; ending percentages likewise describe that bucket rather than the
// cumulative window. The selected grouping length is still played time.
function sessionRawSeries(events, opts) {
  const raw = sessionBucketSeries(events, {
    nowMs: opts.nowMs,
    bucketMs: opts.bucketMs,
    windowMs: opts.windowMs,
    openPlayFrom: opts.openPlayFrom,
    playOffsetMs: opts.playOffsetMs,
  });
  return {
    ...raw,
    stepMs: opts.bucketMs,
    lookbackMs: opts.bucketMs,
    endFractions: raw.rawEndFractions,
    endGames: raw.rawEndGames,
    winUnmarkedFraction: raw.rawWinUnmarkedFraction,
  };
}

// The trailing running average the charts actually show: one sample per
// SESSION_STEP_MS of accumulated play, each averaging the lookback of
// played time behind it ("5m" = five played minutes, never wall time).
// Built as rolling prefix-sum windows over sessionBucketSeries' fine
// buckets, so a finished sample never changes as play continues — only
// the newest, still-accumulating one does — and a young session simply
// averages the play that exists so far. Rates divide by the played time
// actually covered, and under SESSION_MIN_PLAY_MS of it stays undefined.
// The endings fractions ignore the lookback entirely: they remain each
// kind's cumulative share of the games finished so far in the chart
// window, resampled at the same positions.
// opts: {nowMs, stepMs, lookbackMs, windowMs, openPlayFrom, playOffsetMs}.
function sessionRunningSeries(events, opts) {
  const fine = sessionBucketSeries(events, {
    nowMs: opts.nowMs,
    bucketMs: opts.stepMs,
    // Reach one lookback past the chart window so the earliest visible
    // sample still averages its full trailing lookback.
    windowMs: opts.windowMs + opts.lookbackMs,
    openPlayFrom: opts.openPlayFrom,
    playOffsetMs: opts.playOffsetMs,
  });
  const sums = fine.sums;
  const lookbackBuckets = Math.max(1, Math.round(opts.lookbackMs / opts.stepMs));
  const prefix = (arr) => {
    const p = new Array(arr.length + 1).fill(0);
    for (let i = 0; i < arr.length; i++) p[i + 1] = p[i] + arr[i];
    return p;
  };
  const pPlay = prefix(sums.playMs);
  const pMove = prefix(sums.movePx);
  const pUseful = prefix(sums.useful);
  const pWasted = prefix(sums.wasted);
  const pMisPlay = prefix(sums.misclickPlayMs);
  const pMis = prefix(sums.misclickCount);
  const pFlags = prefix(sums.flags);
  const pUnflags = prefix(sums.unflags);
  const pAvoidable = prefix(sums.avoidableDeaths);
  const pGames = prefix(sums.endCounts.reduce((totals, counts) =>
    totals.map((total, i) => total + counts[i]),
  new Array(sums.playMs.length).fill(0)));
  const pCategoryCounts = Object.fromEntries(ACTION_CATEGORY_SPECS.map((spec) =>
    [spec.id, prefix(sums.categoryCounts[spec.id])]));
  const pExcessRisk = prefix(sums.excessRisk);
  const pModeledLifeGap = prefix(sums.modeledLifeGap);
  const roll = (p, k) => p[k + 1] - p[Math.max(0, k - lookbackBuckets + 1)];

  const windowFrom = fine.playNowMs - opts.windowMs;
  const centers = [];
  const playMs = [];
  const speedPxPerSec = [];
  const clicksPerSec = [];
  const avoidablePerMin = [];
  const wastedPerMin = [];
  const misclicksPerMin = [];
  const flagsPerSec = [];
  const mismarksPerMin = [];
  const fastclickGapMs = [];
  const categoryPerMin = Object.fromEntries(
    ACTION_CATEGORY_SPECS.map((spec) => [spec.id, []]));
  const excessRiskPctPerMin = [];
  const modeledLifeGapPerMin = [];
  const usefulPerGame = [];
  const wastedPerGame = [];
  const misclicksPerGame = [];
  const flagsPerGame = [];
  const mismarksPerGame = [];
  const avoidablePerGame = [];
  const categoryPerGame = Object.fromEntries(
    ACTION_CATEGORY_SPECS.map((spec) => [spec.id, []]));
  const excessRiskPctPerGame = [];
  const modeledLifeGapPerGame = [];
  const endFractions = {};
  for (const kind of SESSION_END_KINDS) endFractions[kind] = [];
  const endGames = [];
  const winUnmarkedFraction = [];
  const endCumulative = new Array(SESSION_END_KINDS.length).fill(0);
  let endTotal = 0;
  let unmarkedSum = 0;
  let unmarkedWins = 0;
  for (let k = 0; k < sums.playMs.length; k++) {
    // The sample sits at its fine bucket's right edge; the newest one
    // rides the current play position instead.
    const pos = Math.min(fine.startPlayMs + (k + 1) * opts.stepMs, fine.playNowMs);
    if (pos < windowFrom) continue; // lookback-only reach, not charted
    for (let j = 0; j < SESSION_END_KINDS.length; j++) {
      endCumulative[j] += sums.endCounts[j][k];
      endTotal += sums.endCounts[j][k];
    }
    unmarkedSum += sums.winUnmarkedSum[k];
    unmarkedWins += sums.winUnmarkedWins[k];
    centers.push(pos);
    const playedMs = roll(pPlay, k);
    const playedSec = playedMs / 1000;
    const enough = playedMs >= SESSION_MIN_PLAY_MS;
    playMs.push(playedMs);
    speedPxPerSec.push(enough ? roll(pMove, k) / playedSec : undefined);
    clicksPerSec.push(enough ? roll(pUseful, k) / playedSec : undefined);
    avoidablePerMin.push(enough ? roll(pAvoidable, k) / (playedSec / 60) : undefined);
    wastedPerMin.push(enough ? roll(pWasted, k) / (playedSec / 60) : undefined);
    const misPlayedMs = roll(pMisPlay, k);
    misclicksPerMin.push(misPlayedMs >= SESSION_MIN_PLAY_MS
      ? roll(pMis, k) / (misPlayedMs / 60000) : undefined);
    flagsPerSec.push(enough ? roll(pFlags, k) / playedSec : undefined);
    mismarksPerMin.push(enough ? roll(pUnflags, k) / (playedSec / 60) : undefined);
    for (const spec of ACTION_CATEGORY_SPECS) {
      categoryPerMin[spec.id].push(enough
        ? roll(pCategoryCounts[spec.id], k) / (playedSec / 60) : undefined);
    }
    excessRiskPctPerMin.push(enough
      ? 100 * roll(pExcessRisk, k) / (playedSec / 60) : undefined);
    modeledLifeGapPerMin.push(enough
      ? roll(pModeledLifeGap, k) / (playedSec / 60) : undefined);
    const games = roll(pGames, k);
    usefulPerGame.push(games > 0 ? roll(pUseful, k) / games : undefined);
    wastedPerGame.push(games > 0 ? roll(pWasted, k) / games : undefined);
    misclicksPerGame.push(games > 0 ? roll(pMis, k) / games : undefined);
    flagsPerGame.push(games > 0 ? roll(pFlags, k) / games : undefined);
    mismarksPerGame.push(games > 0 ? roll(pUnflags, k) / games : undefined);
    avoidablePerGame.push(games > 0 ? roll(pAvoidable, k) / games : undefined);
    for (const spec of ACTION_CATEGORY_SPECS) {
      categoryPerGame[spec.id].push(games > 0
        ? roll(pCategoryCounts[spec.id], k) / games : undefined);
    }
    excessRiskPctPerGame.push(games > 0
      ? 100 * roll(pExcessRisk, k) / games : undefined);
    modeledLifeGapPerGame.push(games > 0
      ? roll(pModeledLifeGap, k) / games : undefined);
    const gaps = [];
    for (let j = Math.max(0, k - lookbackBuckets + 1); j <= k; j++) {
      gaps.push(...sums.fastGaps[j]);
    }
    fastclickGapMs.push(sessionMedian(gaps));
    endGames.push(endTotal);
    for (let j = 0; j < SESSION_END_KINDS.length; j++) {
      endFractions[SESSION_END_KINDS[j]].push(
        endTotal > 0 ? endCumulative[j] / endTotal : undefined);
    }
    winUnmarkedFraction.push(
      unmarkedWins > 0 ? unmarkedSum / unmarkedWins : undefined);
  }
  return {
    stepMs: opts.stepMs, lookbackMs: opts.lookbackMs,
    playNowMs: fine.playNowMs, windowMs: opts.windowMs,
    centers, playMs,
    speedPxPerSec, clicksPerSec, avoidablePerMin, wastedPerMin,
    misclicksPerMin, flagsPerSec, mismarksPerMin, fastclickGapMs,
    categoryPerMin, excessRiskPctPerMin, modeledLifeGapPerMin,
    usefulPerGame, wastedPerGame, misclicksPerGame, flagsPerGame,
    mismarksPerGame, avoidablePerGame, categoryPerGame,
    excessRiskPctPerGame, modeledLifeGapPerGame,
    endFractions, endGames, winUnmarkedFraction,
    gameEnds: fine.gameEnds.filter((game) =>
      game.playAt >= windowFrom && game.playAt <= fine.playNowMs),
    wins: fine.wins.filter((win) =>
      win.playAt >= windowFrom && win.playAt <= fine.playNowMs),
  };
}

// Auto-range a session chart around the values it actually shows. Zero is
// no longer a mandatory floor: a positive series can use the plot's height
// to expose its variation. A measured zero remains in range, nonnegative
// data never gets a meaningless negative floor, and a flat series receives
// enough symmetric room to remain visible.
function sessionYDomain(values) {
  const measured = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (measured.length === 0) return { min: 0, max: 1 };
  const min = Math.min(...measured);
  const max = Math.max(...measured);
  if (min === max) {
    if (min === 0) return { min: 0, max: 1 };
    const pad = Math.max(Math.abs(min) * 0.08, 1e-6);
    return { min: min - pad, max: max + pad };
  }
  const pad = (max - min) * 0.08;
  return {
    min: min >= 0 ? Math.max(0, min - pad) : min - pad,
    max: max + pad,
  };
}

//-------SESSION STATS: RECORDING (event capture into RAM)-------

// Live events are RAM-only, but the window survives reloads: on load,
// sessionBackfillFromHistory reconstructs the last hour of play from stored game
// records (one coarse 'game' event per record), so a reload mid-session
// keeps the running averages. Stored traces and records remain the
// ground truth every value here could be recomputed from.
let sessionEvents = [];
let sessionPlayOffsetMs = 0;
let sessionPlayFrom = null;          // Date.now() when 'playing' began, or null
let sessionPlayModeKey = null;       // exact mode frozen when the span begins
let sessionLastMoveAt = 0;           // wall time of the last cursor move
let sessionLastUsefulPressAt = null; // resettable session-only click gap
let gameLastUsefulPressAt = null;    // never reset by Clear session
let gameFastclickGaps = [];          // this game's qualifying gaps, for the
                                     // per-game fastclickGapMs record field

function sessionEventModeKey() {
  return sessionPlayModeKey === null ? modeKey() : sessionPlayModeKey;
}

function sessionPrune(nowMs) {
  sessionEvents = sessionRetainedEvents(sessionEvents, SESSION_KEEP_MS);
}

function sessionPlayBegin() {
  if (sessionPlayFrom !== null) return;
  sessionPlayFrom = Date.now();
  sessionPlayModeKey = modeKey();
}

function sessionPlayEnd() {
  if (sessionPlayFrom === null) return;
  sessionEvents.push({
    kind: 'play',
    modeKey: sessionPlayModeKey,
    from: sessionPlayFrom,
    to: Date.now(),
  });
  sessionPlayFrom = null;
  sessionPlayModeKey = null;
}

// Cursor travel while playing, coalesced: consecutive movement within the
// same ~1s cell mutates the latest event instead of pushing a new one, so
// an hour of play stays a few thousand events, not a million.
function sessionRecordMove(px) {
  const now = Date.now();
  const last = sessionEvents[sessionEvents.length - 1];
  if (last !== undefined && last.kind === 'move'
      && last.modeKey === sessionEventModeKey()
      && now - last.at < SESSION_MOVE_COALESCE_MS) {
    last.px += px;
    return;
  }
  sessionEvents.push({ kind: 'move', modeKey: sessionEventModeKey(), at: now, px: px });
}

function sessionRecordPress(useful, flagPlaced, flagRemoved, misclick) {
  const now = Date.now();
  const press = {
    kind: 'press',
    modeKey: sessionEventModeKey(),
    at: now,
    useful: useful,
    flag: flagPlaced,
    unflag: flagRemoved === true,
    misclick: misclick === true,
    moving: now - sessionLastMoveAt <= SESSION_MOVING_PRESS_MS,
    gapMs: undefined,
  };
  if (useful) {
    if (sessionLastUsefulPressAt !== null) press.gapMs = now - sessionLastUsefulPressAt;
    sessionLastUsefulPressAt = now;
    // The same qualification the bucketed series uses, collected per game
    // for the record's fastclickGapMs (its median).
    const gameGapMs = gameLastUsefulPressAt === null
      ? undefined : now - gameLastUsefulPressAt;
    gameLastUsefulPressAt = now;
    if (press.moving && gameGapMs !== undefined
        && gameGapMs <= FASTCLICK_MAX_GAP_MS) {
      gameFastclickGaps.push(gameGapMs);
    }
  }
  sessionEvents.push(press);
}

function sessionRecordDeath(mistake) {
  sessionEvents.push({
    kind: 'death', modeKey: sessionEventModeKey(), at: Date.now(), mistake: mistake,
  });
}

function sessionRecordEvaluation(evaluation) {
  const category = actionEvaluationCategory(evaluation);
  if (!category) return;
  sessionEvents.push({
    kind: 'evaluation',
    modeKey: sessionEventModeKey(),
    at: Date.now(),
    category,
    excessRisk: category === 'gameRisk'
      ? (evaluationRiskDelta(evaluation) || 0) : 0,
    modeledLifeGap: Array.isArray(evaluation.mistakes)
      && evaluation.mistakes.includes('chose-lower-modeled-life')
      ? (evaluationLifeGap(evaluation) || 0) : 0,
  });
}

// One ending per finished game ('win', a fatal-action status kind, a
// legacy verdict kind, or 'other'), recorded while the play span is
// still open so it lands inside it. On a win, winUnmarked carries the
// share of the board's mines that had no flag at the winning instant.
function sessionRecordEnd(end, winUnmarked) {
  const now = Date.now();
  const event = { kind: 'end', modeKey: sessionEventModeKey(), at: now, end: end };
  if (typeof winUnmarked === 'number') event.winUnmarked = winUnmarked;
  if (end === 'win') {
    event.timeMs = elapsedMs();
    event.boardKey = boardKey();
    event.endedAt = now;
  }
  sessionEvents.push(event);
}

// Starts a player-chosen observation session without deleting any scores or
// traces. The timestamp persists, so reload backfill cannot reintroduce old
// games. If a game is active, only its post-clear live events remain; that
// partial game is intentionally not reconstructed after a later reload.
function clearSession() {
  const now = Date.now();
  settings.sessionStartedAt = now;
  saveSettings();
  sessionEvents = [];
  sessionPlayOffsetMs = 0;
  sessionLastUsefulPressAt = null;
  if (sessionPlayFrom !== null) {
    sessionPlayFrom = now;
    sessionPlayModeKey = modeKey();
  }
  refreshMetricsPanel();
}

// Rebuilds enough cumulative play from stored game records to cover the
// chart window plus retention slack. It scans backward by game duration,
// not wall age: a one-hour play window may reach days back across breaks.
// Called once from init(), before any live event can exist.
// Bucket-level approximation: a record holds totals, not timestamps, so
// the totals spread evenly over the game's span — the traces hold the
// exact timing if a finer backfill is ever wanted. Fields that joined
// the schema later may be absent on old records.
function sessionBackfillFromHistory() {
  const games = [];
  for (const [historyModeKey, records] of Object.entries(history)) {
    const mines = minesOfModeKey(historyModeKey);
    for (const record of records) {
      if (record.timeMs <= 0) continue;
      const from = record.endedAt - record.timeMs;
      // A game crossing a Clear-session boundary has no honest stored
      // post-boundary split, so only wholly new games are reconstructed.
      if (from < settings.sessionStartedAt) continue;
      const actionSummary = actionCategorySummary(record.actionEvaluations);
      games.push({
        kind: 'game',
        modeKey: historyModeKey,
        from,
        to: record.endedAt,
        px: record.mousePathPx,
        useful: record.clicks,
        wasted: record.wastedClicks || 0,
        misclicks: record.misclicks,
        flags: record.flagsPlaced || 0,
        unflags: record.flagsRemoved || 0,
        fatalMistake: evaluationHasMistake(fatalEvaluationOf(record)),
        categoryCounts: actionSummary.counts,
        excessRisk: actionSummary.excessRisk,
        modeledLifeGap: actionSummary.modeledLifeGap,
        fastGapMs: record.fastclickGapMs,
        end: record.outcome === 'win' ? 'win'
          : sessionEndingKind(fatalEvaluationOf(record)),
        winUnmarked: recordWinUnmarkedShare(record, mines),
        timeMs: record.timeMs,
        boardKey: historyModeKey.split('@')[0],
        endedAt: record.endedAt,
      });
    }
  }
  games.sort((a, b) => a.to - b.to);
  sessionPlayOffsetMs = 0;
  sessionEvents.unshift(...sessionRetainedEvents(games, SESSION_KEEP_MS));
}

//-------SESSION STATS: DISPLAY (top section of the left panel)-------

const SESSION_GROUP = {
  name: 'session',
};

// Titles carry the unit (decided 2026-08-23, afternoon): "mouse speed
// px/s" sits flush on its plot and says everything the removed rotated
// y-axis caption used to say, without the sideways read or the lost
// horizontal space. Series with distinct units keep solo charts; the six
// legacy action rates share two unit-grouped plots, and enabled report
// categories share a third per-minute plot.
const SESSION_METRIC_SPECS = [
  { label: 'mouse speed px/s',
    calc: 'cursor px traveled while a game was in progress over the '
      + 'trailing lookback of play, divided by its in-progress seconds; '
      + 'abandoned games count, between-game movement never does',
    records: 'cursor travel per in-progress second, averaged over the '
      + 'trailing lookback; a change in the series has no assigned cause',
    of: (b, i) => b.speedPxPerSec[i], fmt: (v) => Math.round(v) + 'px/s' },
  { label: 'fastclick gap ms',
    calc: 'median gap between consecutive useful presses of the same game '
      + 'when the press was made on the move (cursor moving within 100ms '
      + 'before it) and the gap was under 1s',
    records: 'the median qualifying press-to-press interval within the '
      + 'trailing lookback; only the timing rule above is observed',
    of: (b, i) => b.fastclickGapMs[i], fmt: (v) => Math.round(v) + 'ms' },
  { label: 'excess game risk pp/m', category: 'gameRisk',
    calc: 'sum of the extra immediate loss probability chosen by survived '
      + 'game-risk actions over the trailing played-time lookback, divided '
      + 'by played minutes; protection rules are applied before comparing',
    records: 'percentage points of additional immediate loss probability '
      + 'per played minute; it is a probability sum, not observed deaths',
    of: (b, i) => b.excessRiskPctPerMin[i],
    fmt: (v) => v.toFixed(2) + 'pp/m',
    gameLabel: 'excess game risk pp/game',
    gameOf: (b, i) => b.excessRiskPctPerGame[i],
    gameFmt: (v) => v.toFixed(2) + 'pp/game' },
  { label: 'modeled life gap /m', category: 'lifeMaximization',
    calc: 'sum of the one-ply best-minus-selected expected-remaining-life '
      + 'gaps over the trailing played-time lookback, divided by played minutes',
    records: 'the optional model-relative expected-life gap per played minute; '
      + 'it is not a claim about player intent or long-horizon optimality',
    of: (b, i) => b.modeledLifeGapPerMin[i],
    fmt: (v) => v.toFixed(3) + '/m',
    gameLabel: 'modeled life gap /game',
    gameOf: (b, i) => b.modeledLifeGapPerGame[i],
    gameFmt: (v) => v.toFixed(3) + '/game' },
];

// The action-rates charts (combined 2026-08-23 afternoon; split by unit
// that evening): the six per-play-time rates draw as two shared plots —
// every /m series in one chart, every /s series in another — so lines
// on a chart are directly comparable and neither unit's scale squashes
// the other's. Each series keeps the unit that gives it a meaty,
// visible value under the stated choose-what-reads-best rule. No-op
// clicks moved /m -> /s on 2026-08-23 (user call, "to improve
// distribution"): its ~19/m line towered over the other /m rates and
// squashed them against the floor, while as ~0.3/s it sits comfortably
// on the /s chart's 0..1 scale next to click rate. fmt is the bare
// number; displays append the unit.
const SESSION_RATE_SPECS = [
  { label: 'flag removals', unit: '/m', color: '#00838f',
    calc: 'flags taken back per in-progress minute (win auto-flagging and '
      + 'flags left standing are not counted, only the removal itself)',
    records: 'flags removed per in-progress minute over the trailing lookback; '
      + 'the record does not reveal why a flag was removed',
    of: (b, i) => b.mismarksPerMin[i],
    gameOf: (b, i) => b.mismarksPerGame[i], fmt: (v) => v.toFixed(1) },
  { label: 'mine marking', unit: '/s', color: '#388e3c',
    calc: 'flags placed per in-progress second (removals don\u2019t '
      + 'subtract; the win\u2019s auto-flagging is not yours and never '
      + 'counts)',
    records: 'flags placed per in-progress second over the trailing lookback; '
      + 'confidence, caution, and intent are not observed',
    of: (b, i) => b.flagsPerSec[i],
    gameOf: (b, i) => b.flagsPerGame[i], fmt: (v) => v.toFixed(2) },
  { label: 'misclicks', unit: '/m', color: '#d32f2f',
    calc: 'board-changing actions contradicted by facts provable from the '
      + 'visible board at click time, per in-progress minute: opening a proven '
      + 'mine, flagging a proven safe, removing a proven-mine flag, or chording '
      + 'through a visible contradiction',
    records: 'visible-board contradictions, independently of outcome; a fatal '
      + 'fatal visible contradiction also appears in deaths with mistakes, while a wrong flag can be nonfatal',
    of: (b, i) => b.misclicksPerMin[i],
    gameOf: (b, i) => b.misclicksPerGame[i], fmt: (v) => v.toFixed(1) },
  { label: 'no-op clicks', unit: '/s', color: '#e8a000',
    calc: 'board clicks that changed nothing (chords on unsatisfied or '
      + 'empty numbers, left-clicks on flags, right-clicks on revealed '
      + 'cells), per in-progress second',
    records: 'clicks that changed no board state per in-progress second; '
      + 'the record does not distinguish among possible causes',
    // The series stores per-minute; the spec converts for display.
    of: (b, i) => b.wastedPerMin[i] === undefined
      ? undefined : b.wastedPerMin[i] / 60,
    gameOf: (b, i) => b.wastedPerGame[i],
    fmt: (v) => v.toFixed(2) },
  { label: 'deaths with mistakes', unit: '/m', color: '#7b1fa2',
    calc: 'deaths whose fatal action carries at least one recorded mistake '
      + 'tag (for example, opening a proven mine, guessing while a safe move '
      + 'was available, or choosing higher risk), per in-progress minute',
    records: 'fatal actions with one or more evidence-backed mistake tags '
      + 'per in-progress minute; it does not identify intent or mental state',
    of: (b, i) => b.avoidablePerMin[i],
    gameOf: (b, i) => b.avoidablePerGame[i], fmt: (v) => v.toFixed(2) },
  { label: 'click rate', unit: '/s', color: '#1565c0',
    calc: 'board clicks that changed something (reveals, flags, chords) '
      + 'per in-progress second; no-op clicks are excluded — they have '
      + 'their own line',
    records: 'board-changing clicks per in-progress second over the trailing '
      + 'lookback; it does not measure decisions or identify why the rate changed',
    of: (b, i) => b.clicksPerSec[i],
    gameOf: (b, i) => b.usefulPerGame[i], fmt: (v) => v.toFixed(2) },
];

const SESSION_CATEGORY_RATE_SPECS = [
  { category: 'gameLoss', label: 'game loss', unit: '/m', color: '#8f1f0e',
    calc: 'fatal actions per played minute, whether avoidable, forced, protected, or unjudged',
    records: 'games ending in a fatal action per played minute; the category does not itself call the action a mistake',
    of: (b, i) => b.categoryPerMin.gameLoss[i],
    gameOf: (b, i) => b.categoryPerGame.gameLoss[i], fmt: (v) => v.toFixed(2) },
  { category: 'gameRisk', label: 'game risk', unit: '/m', color: '#d06a00',
    calc: 'survived actions that added actual immediate loss probability under the active rules, per played minute',
    records: 'nonfatal risk-increasing actions per played minute; magnitude has its own excess-game-risk chart',
    of: (b, i) => b.categoryPerMin.gameRisk[i],
    gameOf: (b, i) => b.categoryPerGame.gameRisk[i], fmt: (v) => v.toFixed(2) },
  { category: 'timeLoss', label: 'time loss', unit: '/m', color: '#1682b8',
    calc: 'no-progress inputs and visible board-state regressions per played minute',
    records: 'classified time-loss actions per played minute; no duration or intent is inferred',
    of: (b, i) => b.categoryPerMin.timeLoss[i],
    gameOf: (b, i) => b.categoryPerGame.timeLoss[i], fmt: (v) => v.toFixed(2) },
  { category: 'lifeMaximization', label: 'life maximization', unit: '/m', color: '#8651ad',
    calc: 'actions with a positive one-ply expected-remaining-life gap per played minute',
    records: 'optional model-relative opportunities per played minute; magnitude has its own modeled-life-gap chart',
    of: (b, i) => b.categoryPerMin.lifeMaximization[i],
    gameOf: (b, i) => b.categoryPerGame.lifeMaximization[i], fmt: (v) => v.toFixed(2) },
  { category: 'measurementNotes', label: 'measurement notes', unit: '/m', color: '#777777',
    calc: 'actions whose stored evidence is legacy or incomplete, per played minute',
    records: 'unclassified evidence notes per played minute, not mistakes',
    of: (b, i) => b.categoryPerMin.measurementNotes[i],
    gameOf: (b, i) => b.categoryPerGame.measurementNotes[i], fmt: (v) => v.toFixed(2) },
];

function sessionRateSpecsForBasis(specs) {
  if (settings.sessionRateBasis !== 'game') return specs;
  return specs.map((spec) => ({ ...spec, unit: '/game', of: spec.gameOf }));
}

function sessionMetricSpecForBasis(spec) {
  if (settings.sessionRateBasis !== 'game' || !spec.gameOf) return spec;
  return { ...spec, label: spec.gameLabel, of: spec.gameOf, fmt: spec.gameFmt };
}

// The game-endings lines: one cumulative percent line per ending kind,
// in one chart (PRODUCT.md "Game-end evaluation"). Loss labels are the
// report's fatal-action wording verbatim (FATAL_STATUS_LABELS), so the
// chart's categories are exactly the report's reasons for losing;
// legacy-imported verdicts keep their old five-way lines as dashed
// provenance; 'win' leads, 'other' is an unjudged loss. The
// "percent of mines unmarked when winning" line is a different quantity
// on the same percent axis (see appendSessionEndingsRow), drawn dotted
// with its own series accessor. The color travels inline (line stroke, last-point dot
// fill, legend swatch), so the three can never disagree.
const SESSION_END_SPECS = [
  { kind: 'win', label: 'win', color: '#2e7d32' },
  { kind: 'win-unmarked', label: 'percent of mines unmarked when winning',
    color: '#0f9b8e', dash: '2 3', series: (b) => b.winUnmarkedFraction },
  { kind: 'guess-min', label: FATAL_STATUS_LABELS['guess-min'], color: '#b8860b' },
  { kind: 'guess-higher', label: FATAL_STATUS_LABELS['guess-higher'], color: '#d95f02' },
  { kind: 'guess-unmeasured', label: FATAL_STATUS_LABELS['guess-unmeasured'], color: '#9a6b2f' },
  { kind: 'guess-safe', label: FATAL_STATUS_LABELS['guess-safe'], color: '#c62828' },
  { kind: 'mine-safe', label: FATAL_STATUS_LABELS['mine-safe'], color: '#8e1111' },
  { kind: 'mine-forced', label: FATAL_STATUS_LABELS['mine-forced'], color: '#b71c1c' },
  { kind: 'proof-safe', label: FATAL_STATUS_LABELS['proof-safe'], color: '#8e1111' },
  { kind: 'proof-forced', label: FATAL_STATUS_LABELS['proof-forced'], color: '#d95f02' },
  { kind: 'angel', label: DEATH_KIND_LABELS.angel + ' (legacy)', color: '#b8860b', dash: '6 3' },
  { kind: 'forced', label: DEATH_KIND_LABELS.forced + ' (legacy)', color: '#b8860b', dash: '6 3' },
  { kind: 'needless', label: DEATH_KIND_LABELS.needless + ' (legacy)', color: '#c62828', dash: '6 3' },
  { kind: 'mine', label: DEATH_KIND_LABELS.mine + ' (legacy)', color: '#8e1111', dash: '6 3' },
  { kind: 'chord', label: DEATH_KIND_LABELS.chord + ' (legacy)', color: '#a51e36', dash: '6 3' },
  { kind: 'other', label: 'unjudged loss', color: '#999999' },
];

// A session chart is a real chart, not a sparkline (decided 2026-08-22):
// the scatter plots' visual grammar — light gridlines, 1/2/5-step y
// ticks with minor tickmarks, played-time x ticks — at panel width.
// Neither axis carries a caption (x dropped earlier 2026-08-23, the
// rotated y caption that afternoon): the "-15m … now" x ticks already
// say "played time ago", and the row title carries the unit ("mouse
// speed px/s") sitting flush on the plot's top edge (T is the few px
// that keep a top gridline label inside the svg). The y range follows
// the measured values with modest padding rather than being forced to
// start at 0; x is the fixed played-time window ending at the current
// cumulative play coordinate. Breaks have already been removed.
// Unmeasurable points break the line, never bridged. Width follows the
// panel's dragged width (its grip, see
// buildMetricsResizeGrip): the chart fills the panel's content box —
// width minus the 16px padding and 2px border of the border-box panel.
const SESSION_CHART = { H: 150, L: 54, R: 8, T: 5, B: 22 };

// X-tick label for "this long of accumulated play ago". Whole hours stay
// whole; a 3h window's quarter ticks need the decimal (-2.3h, -1.5h).
function sessionAgoLabel(agoMs) {
  if (agoMs < 1) return 'now';
  if (agoMs >= 60 * 60 * 1000) {
    const hours = agoMs / (60 * 60 * 1000);
    return '-' + (Number.isInteger(hours) ? hours.toFixed(0) : hours.toFixed(1)) + 'h';
  }
  return '-' + Math.round(agoMs / 60000) + 'm';
}

let sessionWinTooltip = null;
let sessionWinTooltipChart = null;

function sessionWinBoardLabel(key) {
  const match = /^(\d+)x(\d+)\/(\d+)/.exec(String(key || ''));
  return match === null
    ? 'board size unavailable'
    : match[1] + '\u00d7' + match[2] + ' \u00b7 ' + match[3] + ' mines';
}

function getSessionWinTooltip() {
  if (sessionWinTooltip !== null) return sessionWinTooltip;
  sessionWinTooltip = document.createElement('div');
  sessionWinTooltip.className = 'session-win-tooltip';
  sessionWinTooltip.hidden = true;
  document.body.appendChild(sessionWinTooltip);
  return sessionWinTooltip;
}

function hideSessionWinTooltip(chart) {
  if (chart !== undefined && sessionWinTooltipChart !== chart) return;
  if (sessionWinTooltip !== null) sessionWinTooltip.hidden = true;
  sessionWinTooltipChart = null;
}

// Thin game-end lines are shared by every session chart. Wins are green;
// losses reuse the endings chart's correctness-aware colors. Hover is handled
// once by the SVG, with nearest-line lookup for deterministic overlaps.
function appendSessionGameMarkers(svg, buckets, geometry, px) {
  const gameEnds = Array.isArray(buckets.gameEnds)
    ? buckets.gameEnds
    : (Array.isArray(buckets.wins)
      ? buckets.wins.map((win) => ({ ...win, end: 'win' })) : []);
  if (gameEnds.length === 0) return;
  const endingSpec = (end) => SESSION_END_SPECS.find(
    (spec) => spec.kind === end && spec.series === undefined)
      || SESSION_END_SPECS.find((spec) => spec.kind === 'other');
  const lines = gameEnds.map((game) => {
    const line = document.createElementNS(SVG_NS, 'line');
    const x = px(game.playAt).toFixed(1);
    line.setAttribute('x1', x);
    line.setAttribute('x2', x);
    line.setAttribute('y1', geometry.top);
    line.setAttribute('y2', geometry.bottom);
    line.setAttribute('class', 'session-game-line');
    line.setAttribute('stroke', endingSpec(game.end).color);
    svg.appendChild(line);
    return line;
  });
  let active = -1;
  const clearActive = () => {
    if (active >= 0) lines[active].classList.remove('active');
    active = -1;
  };
  svg.addEventListener('pointermove', (event) => {
    const bounds = svg.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const x = (event.clientX - bounds.left) * geometry.width / bounds.width;
    const y = (event.clientY - bounds.top) * geometry.height / bounds.height;
    if (x < geometry.left || x > geometry.right
        || y < geometry.top || y > geometry.bottom) {
      clearActive();
      hideSessionWinTooltip(svg);
      return;
    }
    let nearest = -1;
    let nearestDistance = Infinity;
    for (let i = 0; i < gameEnds.length; i++) {
      const distance = Math.abs(px(gameEnds[i].playAt) - x);
      if (distance < nearestDistance) {
        nearest = i;
        nearestDistance = distance;
      }
    }
    // Six screen pixels is easy to acquire without turning the whole chart
    // into a tooltip trigger when game-end lines are sparse.
    const hitDistance = 6 * geometry.width / bounds.width;
    if (nearest < 0 || nearestDistance > hitDistance) {
      clearActive();
      hideSessionWinTooltip(svg);
      return;
    }
    if (active !== nearest) {
      clearActive();
      active = nearest;
      lines[active].classList.add('active');
      const game = gameEnds[active];
      const spec = endingSpec(game.end);
      const tooltip = getSessionWinTooltip();
      const result = document.createElement('div');
      result.className = 'session-win-tooltip-result';
      result.style.color = spec.color;
      result.textContent = spec.label + ' \u00b7 '
        + (typeof game.timeMs === 'number'
          ? (game.timeMs / 1000).toFixed(3) + 's'
          : 'time unavailable') + ' \u00b7 ' + sessionWinBoardLabel(game.boardKey);
      tooltip.replaceChildren(result);
      if (typeof game.endedAt === 'number') {
        const when = document.createElement('div');
        when.className = 'session-win-tooltip-when';
        when.textContent = formatDate(game.endedAt);
        tooltip.appendChild(when);
      }
      tooltip.hidden = false;
      sessionWinTooltipChart = svg;
    }
    const tooltip = getSessionWinTooltip();
    const gap = 9;
    const left = Math.min(event.clientX + gap,
      window.innerWidth - tooltip.offsetWidth - 5);
    const top = Math.max(5, event.clientY - tooltip.offsetHeight - gap);
    tooltip.style.left = Math.max(5, left) + 'px';
    tooltip.style.top = top + 'px';
  });
  svg.addEventListener('pointerleave', () => {
    clearActive();
    hideSessionWinTooltip(svg);
  });
}

function buildSessionChart(buckets, spec) {
  const { H, L, R, T, B } = SESSION_CHART;
  const W = settings.metricsPanelWidth - 18;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'session-chart');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  const el = (tag, attrs, text) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    svg.appendChild(node);
    return node;
  };
  el('rect', { x: L, y: T, width: W - L - R, height: H - T - B, class: 'scatter-plot' });

  const values = buckets.centers.map((_, i) => displayableNumber(spec.of(buckets, i)));

  const x0 = buckets.playNowMs - buckets.windowMs;
  const x1 = buckets.playNowMs;
  const yDomain = sessionYDomain(values);
  const y0 = yDomain.min;
  const y1 = yDomain.max;
  const px = (t) => L + ((Math.min(Math.max(t, x0), x1) - x0) / (x1 - x0)) * (W - L - R);
  const py = (v) => H - B - ((v - y0) / (y1 - y0)) * (H - T - B);

  const xTicks = Array.from({ length: 5 },
    (_, i) => x0 + (x1 - x0) * i / 4);
  for (const v of xTicks) {
    el('line', { x1: px(v), y1: T, x2: px(v), y2: H - B, class: 'scatter-grid' });
    // A tick near the right edge keeps its centered label inside the svg.
    el('text', { x: Math.min(px(v), W - 17), y: H - B + 13, class: 'scatter-tick tick-x' },
      sessionAgoLabel(x1 - v));
  }
  const yTicks = niceTicks(y0, y1, 4);
  const yStep = yTicks.length > 1 ? yTicks[1] - yTicks[0] : 1;
  const yDec = yStep >= 1 ? 0 : yStep >= 0.1 ? 1 : 2;
  for (const v of yTicks) {
    el('line', { x1: L, y1: py(v), x2: W - R, y2: py(v), class: 'scatter-grid' });
    el('text', { x: L - 4, y: py(v) + 4, class: 'scatter-tick tick-y' }, v.toFixed(yDec));
  }
  for (const v of minorTicks(yTicks, y0, y1)) {
    el('line', { x1: L - 4, y1: py(v), x2: L, y2: py(v), class: 'scatter-minor' });
  }
  appendSessionGameMarkers(svg, buckets, {
    width: W, height: H, left: L, right: W - R, top: T, bottom: H - B,
  }, px);

  let d = '';
  let pen = false;
  let lastX = null;
  let lastY = null;
  let lastValue = null;
  for (let i = 0; i < values.length; i++) {
    if (values[i] === undefined) { pen = false; continue; }
    lastX = px(buckets.centers[i]);
    lastY = py(values[i]);
    lastValue = values[i];
    d += (pen ? 'L' : 'M') + lastX.toFixed(1) + ' ' + lastY.toFixed(1);
    pen = true;
  }
  if (lastX !== null) {
    el('path', { class: 'spark-line', d: d });
    el('circle', { class: 'spark-dot', cx: lastX.toFixed(1), cy: lastY.toFixed(1), r: 3 });
    const putLeft = lastX > W - 80;
    const labelY = lastY < T + 14 ? lastY + 16 : lastY - 6;
    el('text', {
      x: (lastX + (putLeft ? -7 : 7)).toFixed(1),
      y: labelY.toFixed(1),
      class: 'session-point-value',
      'text-anchor': putLeft ? 'end' : 'start',
    }, spec.fmt(lastValue));
  }
  return svg;
}

// The game-endings chart: the session chart's visual grammar with a fixed
// 0–100% y axis and one line per ending kind. Unlike the auto-ranged
// measurement charts, this composition keeps its full meaningful domain.
// Kinds that never occurred
// in the window stay off the chart (a page of flat zeros hides the real
// lines); 'win' always draws once any game has ended, because a 0% win
// line is itself the reading. The legend below the chart carries each
// drawn kind's color and current percentage.
function buildSessionEndingsChart(buckets) {
  const { H, L, R, T, B } = SESSION_CHART;
  const W = settings.metricsPanelWidth - 18;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'session-chart');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  const el = (tag, attrs, text) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    svg.appendChild(node);
    return node;
  };
  el('rect', { x: L, y: T, width: W - L - R, height: H - T - B, class: 'scatter-plot' });

  const x0 = buckets.playNowMs - buckets.windowMs;
  const x1 = buckets.playNowMs;
  const px = (t) => L + ((Math.min(Math.max(t, x0), x1) - x0) / (x1 - x0)) * (W - L - R);
  const py = (pct) => H - B - (pct / 100) * (H - T - B);

  const xTicks = Array.from({ length: 5 }, (_, i) => x0 + (x1 - x0) * i / 4);
  for (const v of xTicks) {
    el('line', { x1: px(v), y1: T, x2: px(v), y2: H - B, class: 'scatter-grid' });
    el('text', { x: Math.min(px(v), W - 17), y: H - B + 13, class: 'scatter-tick tick-x' },
      sessionAgoLabel(x1 - v));
  }
  for (const pct of [0, 25, 50, 75, 100]) {
    el('line', { x1: L, y1: py(pct), x2: W - R, y2: py(pct), class: 'scatter-grid' });
    el('text', { x: L - 4, y: py(pct) + 4, class: 'scatter-tick tick-y' }, String(pct));
  }
  appendSessionGameMarkers(svg, buckets, {
    width: W, height: H, left: L, right: W - R, top: T, bottom: H - B,
  }, px);
  const drawn = [];
  const anyGames = buckets.endGames.some((count) => count > 0);
  for (const spec of SESSION_END_SPECS) {
    const series = spec.series ? spec.series(buckets) : buckets.endFractions[spec.kind];
    const latest = latestDefined(buckets, (b, i) => series[i]);
    const occurred = series.some((value) => typeof value === 'number' && value > 0);
    // Never-occurred endings stay off the chart, except the win line,
    // which draws once any game ended (a 0% win line is itself the
    // reading) — and likewise the unmarked-mines-at-win line draws
    // once any win measured it (flagging every mine is a reading too).
    const show = anyGames && (spec.kind === 'win'
      || (spec.kind === 'win-unmarked'
        ? latest !== undefined
        : occurred));
    if (!show) continue;
    let d = '';
    let pen = false;
    let lastX = null;
    let lastY = null;
    for (let i = 0; i < buckets.centers.length; i++) {
      const v = displayableNumber(series[i]);
      if (v === undefined) { pen = false; continue; }
      lastX = px(buckets.centers[i]);
      lastY = py(v * 100);
      d += (pen ? 'L' : 'M') + lastX.toFixed(1) + ' ' + lastY.toFixed(1);
      pen = true;
    }
    if (lastX === null) continue;
    const pathAttrs = { class: 'end-line', stroke: spec.color, d: d };
    if (spec.dash) pathAttrs['stroke-dasharray'] = spec.dash;
    el('path', pathAttrs);
    // A last-point dot keeps a one-bucket series visible (a path with a
    // single point draws nothing).
    el('circle', {
      class: 'end-dot', fill: spec.color, r: 2.5,
      cx: lastX.toFixed(1), cy: lastY.toFixed(1),
    });
    drawn.push({ spec, latest });
  }
  return { svg, drawn };
}

// An action-rates chart: every SESSION_RATE_SPECS series of one unit in
// one plot. The shared numeric scale auto-ranges around all measured
// lines, with readable 1/2/5 ticks labeled with the chart's unit. Each
// line ends in a dot with its current value floating to the point's
// left in the line's own color (nudged apart when lines end close
// together).
const SESSION_RATES_CHART = { H: 170, L: 54, R: 8, T: 5, B: 22 };

// Place long current-value labels throughout the plot rather than stacking
// every one against the right edge. Candidate boxes are scored for overlap,
// covered data points, leader length, and repeated horizontal position.
function sessionRateLabelLayout(labels, bounds) {
  const textHeight = 12;
  const plotWidth = bounds.right - bounds.left;
  const allPoints = labels.flatMap((label) => label.points);
  const placed = [];
  const overlapArea = (a, b) =>
    Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
      * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  for (const [order, label] of [...labels].sort((a, b) => a.y - b.y).entries()) {
    const width = Math.min(plotWidth - 4, label.text.length * 6.15);
    const candidates = [];
    const preferredBaseline = clamp(label.y + 4, bounds.top + textHeight, bounds.bottom);
    const baselines = [preferredBaseline];
    for (let y = bounds.top + textHeight; y <= bounds.bottom; y += textHeight + 1) {
      baselines.push(y);
    }
    const targetCenter = bounds.left + plotWidth
      * (0.2 + ((order * 0.37) % 0.6));
    for (const baseline of new Set(baselines.map(Math.round))) {
      for (let step = 0; step <= 6; step++) {
        const center = bounds.left + width / 2
          + (plotWidth - width) * step / 6;
        const box = {
          left: center - width / 2,
          right: center + width / 2,
          top: baseline - textHeight,
          bottom: baseline + 2,
        };
        const collision = placed.reduce(
          (sum, prior) => sum + overlapArea(box, prior.box), 0);
        const coveredPoints = allPoints.filter((point) =>
          point.x >= box.left - 2 && point.x <= box.right + 2
            && point.y >= box.top - 2 && point.y <= box.bottom + 2).length;
        const connectorX = clamp(label.x, box.left, box.right);
        const connectorY = clamp(label.y, box.top, box.bottom);
        const leaderLength = Math.hypot(
          connectorX - label.x, connectorY - label.y);
        const repeatedX = placed.reduce((sum, prior) =>
          sum + Math.max(0, 70 - Math.abs(center - prior.center)), 0);
        candidates.push({
          x: center,
          y: baseline,
          anchor: 'middle',
          box,
          center,
          connectorX,
          connectorY,
          score: collision * 1e6 + coveredPoints * 1800
            + leaderLength * 0.7 + Math.abs(center - targetCenter) * 0.08
            + Math.abs(baseline - label.y) * 0.15 + repeatedX * 0.4,
        });
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    placed.push({ ...label, ...candidates[0] });
  }
  return placed;
}

function buildSessionRatesChart(buckets, specs, unit) {
  const { H, L, R, T, B } = SESSION_RATES_CHART;
  const W = settings.metricsPanelWidth - 18;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'session-chart');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  const el = (tag, attrs, text) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    svg.appendChild(node);
    return node;
  };
  el('rect', { x: L, y: T, width: W - L - R, height: H - T - B, class: 'scatter-plot' });

  const values = [];
  for (const spec of specs) {
    for (let i = 0; i < buckets.centers.length; i++) {
      const v = displayableNumber(spec.of(buckets, i));
      if (v !== undefined) values.push(v);
    }
  }
  const yDomain = sessionYDomain(values);
  const y0 = yDomain.min;
  const y1 = yDomain.max;

  const x0 = buckets.playNowMs - buckets.windowMs;
  const x1 = buckets.playNowMs;
  const px = (t) => L + ((Math.min(Math.max(t, x0), x1) - x0) / (x1 - x0)) * (W - L - R);
  const py = (v) => H - B - ((v - y0) / (y1 - y0)) * (H - T - B);

  const xTicks = Array.from({ length: 5 }, (_, i) => x0 + (x1 - x0) * i / 4);
  for (const v of xTicks) {
    el('line', { x1: px(v), y1: T, x2: px(v), y2: H - B, class: 'scatter-grid' });
    el('text', { x: Math.min(px(v), W - 17), y: H - B + 13, class: 'scatter-tick tick-x' },
      sessionAgoLabel(x1 - v));
  }
  const yTicks = niceTicks(y0, y1, 5);
  const yStep = yTicks.length > 1 ? yTicks[1] - yTicks[0] : 1;
  const yDec = Math.min(6, Math.max(0, -Math.floor(Math.log10(yStep) + 1e-9)));
  for (const v of yTicks) {
    el('line', { x1: L, y1: py(v), x2: W - R, y2: py(v), class: 'scatter-grid' });
    const shown = Math.abs(v) < Math.pow(10, -yDec) / 2 ? 0 : v;
    el('text', { x: L - 4, y: py(v) + 4, class: 'scatter-tick tick-y' },
      shown.toFixed(yDec) + unit);
  }
  for (const v of minorTicks(yTicks, y0, y1)) {
    el('line', { x1: L - 4, y1: py(v), x2: L, y2: py(v), class: 'scatter-minor' });
  }
  appendSessionGameMarkers(svg, buckets, {
    width: W, height: H, left: L, right: W - R, top: T, bottom: H - B,
  }, px);

  const drawn = [];
  const pointLabels = [];
  for (const spec of specs) {
    const points = [];
    let d = '';
    let pen = false;
    for (let i = 0; i < buckets.centers.length; i++) {
      const v = displayableNumber(spec.of(buckets, i));
      if (v === undefined) { pen = false; continue; }
      const x = px(buckets.centers[i]);
      const y = py(v);
      points.push({ x, y, v });
      d += (pen ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
      pen = true;
    }
    const lastPoint = points[points.length - 1];
    drawn.push({ spec, latest: lastPoint === undefined ? undefined : lastPoint.v });
    if (lastPoint === undefined) continue;
    el('path', { class: 'end-line', stroke: spec.color, d: d });
    el('circle', {
      class: 'end-dot', fill: spec.color, r: 2.5,
      cx: lastPoint.x.toFixed(1), cy: lastPoint.y.toFixed(1),
    });
    pointLabels.push({
      x: lastPoint.x, y: lastPoint.y, spec,
      points,
      text: spec.label + ' ' + spec.fmt(lastPoint.v) + spec.unit,
    });
  }

  // Current values remain direct labels in their series colors, but a
  // collision/occlusion pass distributes them across open parts of the plot.
  // Fine leader lines keep every moved value explicitly tied to its endpoint.
  for (const lab of sessionRateLabelLayout(pointLabels, {
    left: L + 2, right: W - R - 2, top: T + 1, bottom: H - B - 2,
  })) {
    el('line', {
      x1: lab.x.toFixed(1), y1: (lab.y - 4).toFixed(1),
      x2: lab.connectorX.toFixed(1), y2: lab.connectorY.toFixed(1),
      stroke: lab.spec.color, class: 'rate-label-leader',
    });
    el('text', {
      x: lab.x.toFixed(1),
      y: lab.y.toFixed(1),
      fill: lab.spec.color,
      class: 'rate-point-value',
      'text-anchor': lab.anchor,
    }, lab.text);
  }
  return { svg, drawn };
}

// An action-rates row: one unit's chart, each line naming itself at its
// endpoint without a legend or hover essay.
function appendSessionRatesRow(
  container, buckets, unit, sourceSpecs = SESSION_RATE_SPECS,
  label = 'action rates') {
  const specs = sessionRateSpecsForBasis(sourceSpecs)
    .filter((spec) => spec.unit === unit);
  if (specs.length === 0) return;
  const row = document.createElement('div');
  row.className = 'metric-row session-metric-row';
  const headRow = document.createElement('div');
  headRow.className = 'metric-head';
  const labelEl = document.createElement('span');
  labelEl.className = 'metric-label';
  labelEl.textContent = label + unit;
  headRow.appendChild(labelEl);
  row.appendChild(headRow);
  const { svg, drawn } = buildSessionRatesChart(buckets, specs, unit);
  row.appendChild(svg);
  // Every drawn line names itself at its endpoint, so there is no
  // legend; an empty window still explains itself.
  if (!drawn.some(({ latest }) => latest !== undefined)) {
    const empty = document.createElement('div');
    empty.className = 'session-end-legend session-end-empty';
    empty.textContent = 'nothing measurable in the window yet';
    row.appendChild(empty);
  }
  container.appendChild(row);
}

// The shown number is the newest measurable sample's value: the running
// average ending at the current play position.
function latestDefined(buckets, of) {
  for (let i = buckets.centers.length - 1; i >= 0; i--) {
    const v = displayableNumber(of(buckets, i));
    if (v !== undefined) return v;
  }
  return undefined;
}

function appendSessionSection(container) {
  const head = buildMetricsGroupHead(SESSION_GROUP);
  container.appendChild(head);
  const controls = document.createElement('div');
  controls.className = 'session-controls';
  const choice = (ariaLabel, options, value, onChange) => {
    const select = document.createElement('select');
    select.className = 'session-control';
    select.setAttribute('aria-label', ariaLabel);
    for (const [id, label] of options) {
      const option = document.createElement('option');
      option.value = String(id);
      option.textContent = label;
      select.appendChild(option);
    }
    select.value = String(value);
    select.addEventListener('change', () => onChange(select.value));
    controls.appendChild(select);
  };
  choice('Session grouping method', [
    ['average', 'running average'],
    ['raw', 'raw buckets'],
  ], settings.sessionAggregation, (value) => {
    settings.sessionAggregation = value;
    saveSettings();
    refreshMetricsPanel();
  });
  const intervalOptions = [];
  for (const seconds of SESSION_LOOKBACK_CHOICES) {
    intervalOptions.push([seconds,
      (seconds < 60 ? seconds + 's' : (seconds / 60) + 'm') + ' groups']);
  }
  choice('Played-time grouping length', intervalOptions,
    settings.sessionLookbackSeconds, (value) => {
    settings.sessionLookbackSeconds = Number(value);
    saveSettings();
    refreshMetricsPanel();
  });
  choice('Session rate basis', [
    ['time', 'per played time'],
    ['game', 'per game'],
  ], settings.sessionRateBasis, (value) => {
    settings.sessionRateBasis = value;
    saveSettings();
    refreshMetricsPanel();
  });
  choice('Session mode scope', [
    ['current', 'this mode'],
    ['all', 'all modes'],
  ], settings.sessionModeScope, (value) => {
    settings.sessionModeScope = value;
    saveSettings();
    refreshMetricsPanel();
  });
  const windowOptions = [];
  for (const minutes of SESSION_WINDOW_CHOICES) {
    windowOptions.push([minutes,
      (minutes < 60 ? minutes + 'm' : (minutes / 60) + 'h') + ' window']);
  }
  choice('Session played-time window', windowOptions,
    settings.sessionWindowMinutes, (value) => {
    settings.sessionWindowMinutes = Number(value);
    saveSettings();
    refreshMetricsPanel();
  });
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'session-clear';
  clear.textContent = 'clear session';
  clear.addEventListener('click', clearSession);
  controls.appendChild(clear);
  container.appendChild(controls);

  const now = Date.now();
  sessionPrune(now);
  const exactModeKey = modeKey();
  const scopedEvents = sessionEventsForMode(
    sessionEvents, exactModeKey, settings.sessionModeScope);
  const includeOpenPlay = sessionPlayFrom !== null
    && (settings.sessionModeScope === 'all' || sessionPlayModeKey === exactModeKey);
  const seriesOptions = {
    nowMs: now,
    windowMs: settings.sessionWindowMinutes * 60 * 1000,
    openPlayFrom: includeOpenPlay ? sessionPlayFrom : undefined,
    playOffsetMs: sessionPlayOffsetMs,
  };
  const buckets = settings.sessionAggregation === 'raw'
    ? sessionRawSeries(scopedEvents, {
      ...seriesOptions,
      bucketMs: settings.sessionLookbackSeconds * 1000,
    })
    : sessionRunningSeries(scopedEvents, {
      ...seriesOptions,
      stepMs: SESSION_STEP_MS,
      lookbackMs: settings.sessionLookbackSeconds * 1000,
    });
  appendSessionEndingsRow(container, buckets);
  if (settings.sessionRateBasis === 'game') {
    appendSessionRatesRow(container, buckets, '/game');
  } else {
    appendSessionRatesRow(container, buckets, '/m');
    appendSessionRatesRow(container, buckets, '/s');
  }
  const categorySpecs = SESSION_CATEGORY_RATE_SPECS
    .filter((spec) => reportCategoryEnabled(spec.category));
  appendSessionRatesRow(container, buckets,
    settings.sessionRateBasis === 'game' ? '/game' : '/m',
    categorySpecs, 'report categories');
  for (const sourceSpec of SESSION_METRIC_SPECS) {
    const spec = sessionMetricSpecForBasis(sourceSpec);
    if (spec.category && !reportCategoryEnabled(spec.category)) continue;
    const row = document.createElement('div');
    row.className = 'metric-row session-metric-row';
    const headRow = document.createElement('div');
    headRow.className = 'metric-head';
    const labelEl = document.createElement('span');
    labelEl.className = 'metric-label';
    labelEl.textContent = spec.label;
    headRow.appendChild(labelEl);
    row.appendChild(headRow);
    row.appendChild(buildSessionChart(buckets, spec));
    container.appendChild(row);
  }
}

// The game-endings row: cumulative percentages in running-average mode,
// independent bucket percentages in raw mode, with a semantic color legend.
function appendSessionEndingsRow(container, buckets) {
  const row = document.createElement('div');
  row.className = 'metric-row session-metric-row';
  const headRow = document.createElement('div');
  headRow.className = 'metric-head';
  const labelEl = document.createElement('span');
  labelEl.className = 'metric-label';
  labelEl.textContent = 'game endings %';
  headRow.appendChild(labelEl);
  row.appendChild(headRow);
  const { svg, drawn } = buildSessionEndingsChart(buckets);
  row.appendChild(svg);
  if (drawn.length > 0) {
    const legend = document.createElement('div');
    legend.className = 'session-end-legend';
    for (const { spec, latest } of drawn) {
      const item = document.createElement('span');
      item.className = 'end-legend-item';
      const swatch = document.createElement('span');
      swatch.className = 'end-swatch';
      swatch.style.background = spec.color;
      const text = document.createElement('span');
      text.textContent = spec.label + ' '
        + (latest === undefined ? '0' : Math.round(latest * 100)) + '%';
      item.append(swatch, text);
      legend.appendChild(item);
    }
    row.appendChild(legend);
  } else {
    const empty = document.createElement('div');
    empty.className = 'session-end-legend session-end-empty';
    empty.textContent = 'no finished games in the window yet';
    row.appendChild(empty);
  }
  container.appendChild(row);
}

//-------PLAYER STATES (session tags stamped onto finished games)-------

// The player keeps a personal list of state tags ("sleepy", "new mouse", ...)
// and toggles which ones currently apply; every finished game records the
// active set (see reportResult), so life circumstances can be correlated
// with results later. Editing the list only shapes future games — past
// records keep whatever states they were stamped with.
const DEFAULT_STATE_NAMES = ['sleepy', 'just woke up', 'inebriated'];

// The RAM copy (userdata 'states'): [{name, active}] in display order. A
// new player gets the default options to choose from, none active (see
// userdataReady); the list is only persisted once the player changes
// something.
let playerStates = null;

function savePlayerStates() {
  persistUserdata('states', playerStates);
}

function activeStateNames() {
  return playerStates.filter((s) => s.active).map((s) => s.name);
}

const statesChips = document.getElementById('states-chips');
const statesAddBtn = document.getElementById('states-add-btn');
const statesMenu = document.getElementById('states-menu');
const statesOptions = document.getElementById('states-options');
const statesAddForm = document.getElementById('states-add-form');
const statesAddInput = document.getElementById('states-add-input');
const statesStatus = document.getElementById('states-status');

// Only ACTIVE states are visible: each is a chip, and clicking it takes the
// state off. Everything inactive lives out of sight behind the "+ state"
// button, whose menu lists the inactive options (click one to put it on,
// its x to delete it from the list) plus the new-state field. An untagged
// session shows nothing but the one small button.
function renderStates() {
  statesChips.textContent = '';
  for (const state of playerStates) {
    if (!state.active) continue;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'state-chip';
    chip.title = 'click to take this state off (future games only)';
    chip.textContent = state.name + ' \u00d7';
    chip.addEventListener('click', () => {
      state.active = false;
      savePlayerStates();
      renderStates();
    });
    statesChips.appendChild(chip);
  }
  statesOptions.textContent = '';
  for (const state of playerStates) {
    if (state.active) continue;
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'state-option';
    option.textContent = state.name;
    option.addEventListener('click', () => {
      state.active = true;
      setStatesMenuOpen(false);
      savePlayerStates();
      renderStates();
    });
    const remove = document.createElement('span');
    remove.className = 'state-remove';
    remove.textContent = '\u00d7';
    remove.title = 'delete from the list (past games keep their recorded states)';
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      playerStates = playerStates.filter((s) => s !== state);
      savePlayerStates();
      renderStates();
    });
    option.appendChild(remove);
    statesOptions.appendChild(option);
  }
}

// Every open/close goes through here so the button always shows its
// pressed ("open") state while the menu is up (the settings panel's
// helper is the same shape). Esc and outside-click closing live with the
// settings panel's handlers.
function setStatesMenuOpen(open) {
  statesMenu.hidden = !open;
  statesAddBtn.classList.toggle('open', open);
}

statesAddBtn.addEventListener('click', () => {
  setStatesMenuOpen(statesMenu.hidden);
  statesStatus.textContent = '';
});

document.getElementById('states-close').addEventListener('click', () => setStatesMenuOpen(false));

// A state created here goes on immediately (typing it mid-session means
// "I am in this state now"); one chip-click takes it off.
statesAddForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = statesAddInput.value.trim();
  if (name === '') {
    statesStatus.textContent = 'state name is empty';
    return;
  }
  if (playerStates.some((s) => s.name === name)) {
    statesStatus.textContent = '"' + name + '" already exists';
    return;
  }
  playerStates.push({ name, active: true });
  savePlayerStates();
  statesAddInput.value = '';
  setStatesMenuOpen(false);
  renderStates();
});

//-------PRESS PREVIEW (held left button)-------

function clearPresses() {
  for (const i of pressedIndices) updateCell(i);
  pressedIndices = [];
}

function pressAt(index) {
  clearPresses();
  if (gameState === 'won' || gameState === 'lost') return;
  const cell = cells[index];
  let targets = [];
  if (!cell.revealed && !cell.flagged) {
    targets = [index];
  } else if (cell.revealed && cell.adjacent > 0) {
    targets = neighbors(index).filter((n) => !cells[n].revealed && !cells[n].flagged);
  }
  for (const i of targets) {
    cellElements[i].className = 'cell pressed';
    pressedIndices.push(i);
  }
}

//-------EVENTS-------

function cellIndexFromEvent(event) {
  const el = event.target.closest('.cell');
  return el === null ? null : Number(el.dataset.index);
}

boardElement.addEventListener('mousedown', (event) => {
  if (event.button !== 0) return;
  if (trialBlocksPlay() || boardLabActive()) return;
  if (gameState === 'won' || gameState === 'lost') return;
  const index = cellIndexFromEvent(event);
  if (index === null) return;
  traceEvent('ldown', event, index);
  leftDown = true;
  pressAt(index);
});

boardElement.addEventListener('mouseover', (event) => {
  if (!leftDown) return;
  const index = cellIndexFromEvent(event);
  if (index !== null) pressAt(index);
});

boardElement.addEventListener('mouseup', (event) => {
  if (event.button !== 0 || !leftDown) return;
  const index = cellIndexFromEvent(event);
  if (index === null) return;
  if (trialBlocksPlay() || boardLabActive()
      || gameState === 'won' || gameState === 'lost') return;
  // Logged before acting so a game-ending click is inside its own trace.
  traceEvent('lup', event, index);
  inputActionCount++;
  const cell = cells[index];
  if (!cell.revealed && !cell.flagged) {
    if (gameState === 'playing' && proofSearchBlocks([index], 'click')) {
      inputActionCount--;
      return;
    }
    clickCount++;
    const misclick = revealIsMisclick(index);
    if (misclick) recordMisclick();
    // Recorded before the reveal so a fatal click's press event precedes
    // its death event in the session log.
    sessionRecordPress(true, false, false, misclick);
    revealCell(index);
  } else if (cell.revealed) {
    const targets = chordTargets(index);
    if (targets === null) {
      wastedClicks++;
      sessionRecordPress(false, false, false, false);
      recordActionEvaluation(evaluateNoOpAction(index, 'chord-unavailable'), 'continued');
    } else {
      if (proofSearchBlocks(targets, 'chord')) {
        inputActionCount--;
        return;
      }
      const misclick = chordIsMisclick(index, targets);
      if (misclick) recordMisclick();
      // Record before acting because a contradicted chord can end the game.
      sessionRecordPress(true, false, false, misclick);
      chord(index);
    }
  } else {
    // Left-clicking a flagged cell does nothing.
    wastedClicks++;
    sessionRecordPress(false, false, false, false);
    recordActionEvaluation(evaluateNoOpAction(index, 'left-clicked-flag'), 'continued');
  }
});

document.addEventListener('mouseup', (event) => {
  if (event.button !== 0) return;
  // Releases on a cell were already logged by the board handler above
  // (it runs first on the bubble path); this catches the rest — a press
  // dragged off the cells and released, still a real input event.
  if (leftDown && tracing() && cellIndexFromEvent(event) === null) {
    traceEvent('lup', event, null);
  }
  leftDown = false;
  clearPresses();
});

document.addEventListener('mousemove', (event) => {
  sessionLastMoveAt = Date.now();
  if (lastMouseX !== null && gameState === 'playing') {
    const px = Math.hypot(event.clientX - lastMouseX, event.clientY - lastMouseY);
    mousePathPx += px;
    sessionRecordMove(px);
  }
  lastMouseX = event.clientX;
  lastMouseY = event.clientY;
  if (tracing()) {
    const t = performance.now() - trace.t0;
    const last = trace.t.length - 1;
    if (last >= 0 && trace.t[last] === t) {
      // performance.now() is precision-reduced (Chromium quantizes to
      // ~100us), so two mousemove events can carry the same timestamp.
      // At the timer's resolution both positions exist "at the same
      // time"; the sample for that instant is the latest known position.
      // Keeping both entries would put dt = 0 into every rate (speed,
      // jerk = distance/0 = Infinity) and violate the trace invariant the
      // offline extractor validates: sampleT strictly increasing.
      trace.x[last] = event.clientX;
      trace.y[last] = event.clientY;
    } else {
      trace.t.push(t);
      trace.x.push(event.clientX);
      trace.y.push(event.clientY);
    }
  }
});

boardElement.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  if (trialBlocksPlay() || boardLabActive()
      || gameState === 'won' || gameState === 'lost') return;
  const index = cellIndexFromEvent(event);
  if (index === null) return;
  traceEvent('rdown', event, index);
  inputActionCount++;
  const removing = cells[index].flagged;
  const misclick = !cells[index].revealed && flagChangeIsMisclick(index, removing);
  const actionEvaluation = !cells[index].revealed
    ? evaluateFlagAction(index, removing) : null;
  if (!toggleFlag(index)) {
    wastedClicks++;
    sessionRecordPress(false, false, false, false);
    recordActionEvaluation(evaluateNoOpAction(index, 'flagged-revealed-cell'), 'continued');
  } else {
    if (misclick) recordMisclick();
    // A removal is still a useful press (it changed the board); only a
    // placement feeds the mine-marking rate, only a removal feeds the
    // flag-removal rate.
    sessionRecordPress(true, cells[index].flagged, !cells[index].flagged, misclick);
    recordActionEvaluation(actionEvaluation, 'continued');
  }
});

// Swallow near misses around the board so an imprecise flag click does not
// open the browser menu. Right-clicks elsewhere on the page remain normal.
document.addEventListener('contextmenu', (event) => {
  const buffer = 20;
  const rect = boardElement.getBoundingClientRect();
  const nearBoard = event.clientX >= rect.left - buffer
    && event.clientX <= rect.right + buffer
    && event.clientY >= rect.top - buffer
    && event.clientY <= rect.bottom + buffer;
  if (nearBoard) event.preventDefault();
});

// The board can shift under the viewport coordinate system; every such
// change gets a fresh layout event so samples stay mappable to cells.
document.addEventListener('scroll', () => {
  if (tracing()) recordLayout();
});
window.addEventListener('resize', () => {
  applyBoardPosition();
  if (tracing()) recordLayout();
  syncResultsPlacement();
  syncJusticePlacement();
  syncResultClearance();
});

function requestNewGame() {
  if (trialPhase() === 'lobby' || trialPhase() === 'review') return;
  if (trialIsActive() && trialPresentation !== null
      && gameState !== 'won' && gameState !== 'lost') {
    Trial.skipPresentation(trialSession);
    persistUserdata('trial', trialSession);
    trialPresentation = null;
    if (trialSession.nextIndex >= Trial.gameCount(trialSession)) {
      endTrial('completed');
      renderTrialChrome();
      return;
    }
  }
  newGame();
}

// Anywhere on the top panel (face button included, since it bubbles) restarts.
document.getElementById('top-panel').addEventListener('click', requestNewGame);
document.getElementById('trial-start-btn').addEventListener('click', startTrial);

document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || ['INPUT', 'TEXTAREA', 'BUTTON', 'A'].includes(event.target.tagName)) return;
  event.preventDefault();
  requestNewGame();
});

//-------DIFFICULTY TABS-------

for (const tab of document.querySelectorAll('#difficulty-tabs a')) {
  tab.addEventListener('click', (event) => {
    event.preventDefault();
    for (const t of document.querySelectorAll('#difficulty-tabs a')) t.classList.remove('active');
    tab.classList.add('active');
    const name = tab.dataset.difficulty;
    if (name === 'custom') {
      // In the Board lab the sliders are the custom control; the form
      // stays hidden and the current size simply remains.
      if (!boardLabActive()) {
        customForm.hidden = false;
        customForm.requestSubmit();
      }
    } else {
      customForm.hidden = true;
      config = { ...DIFFICULTIES[name] };
      newGame();
    }
  });
}

function showScoresForCurrentMode() {
  const modeRecords = history[modeKey()] || [];
  const wins = modeRecords.filter((record) => record.outcome === 'win');
  if (wins.length === 0) {
    renderedResult = null;
    resultSummary.textContent = 'High scores\n' + boardDisplayLabel()
      + '\n' + playModeLabel()
      + (gameGenerator.id === BoardGenerators.DEFAULT_ID
        ? '' : '\n' + BoardGenerators.displayLabel(gameGenerator))
      + '\nNo wins yet';
    resultStats.textContent = '';
    resultAnalysis.textContent = '';
    resultRanks.textContent = '';
    syncBoardLayout();
    return;
  }
  const latest = wins.reduce((a, b) => a.endedAt > b.endedAt ? a : b);
  renderResult(latest, modeRecords, { historyView: true });
}

document.getElementById('see-scores-btn').addEventListener('click', showScoresForCurrentMode);

customForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const width = Math.max(8, Math.min(100, Number(document.getElementById('custom-width').value)));
  const height = Math.max(1, Math.min(100, Number(document.getElementById('custom-height').value)));
  // Classic winmine constraint: mines fit with at least a 3x3 opening's worth of space.
  const maxMines = (width - 1) * (height - 1);
  const mines = Math.max(1, Math.min(maxMines, Number(document.getElementById('custom-mines').value)));
  document.getElementById('custom-width').value = width;
  document.getElementById('custom-height').value = height;
  document.getElementById('custom-mines').value = mines;
  config = { width, height, mines };
  newGame();
});

//-------ZOOM-------

function setBoardPositionPreference(x, y, persist) {
  settings.boardOffsetX = Math.max(-2000, Math.min(2000, Math.round(x)));
  settings.boardOffsetY = Math.max(-1000, Math.min(2000, Math.round(y)));
  syncBoardPositionInputs();
  syncBoardLayout();
  if (persist) saveSettings();
}

function setBoardPositionEditing(open) {
  boardPositionPanel.hidden = !open;
  boardPositionDragSurface.hidden = !open;
  boardPositionButton.setAttribute('aria-expanded', String(open));
  syncBoardLayout();
  if (open) boardPositionDragSurface.focus({ preventScroll: true });
  else boardPositionButton.focus({ preventScroll: true });
}

function bindBoardPositionInput(range, number, axis) {
  const apply = (source, persist) => {
    if (source.value === '' || !Number.isFinite(Number(source.value))) return;
    const value = Number(source.value);
    const x = axis === 'x' ? value : settings.boardOffsetX;
    const y = axis === 'y' ? value : settings.boardOffsetY;
    setBoardPositionPreference(x, y, persist);
  };
  range.addEventListener('input', () => apply(range, false));
  range.addEventListener('change', () => apply(range, true));
  number.addEventListener('change', () => apply(number, true));
}

function initBoardPositionControls() {
  syncBoardPositionInputs();
  boardPositionButton.addEventListener('click', () => {
    setBoardPositionEditing(boardPositionPanel.hidden);
  });
  document.getElementById('board-position-done').addEventListener('click', () => {
    setBoardPositionEditing(false);
  });
  document.getElementById('board-position-reset').addEventListener('click', () => {
    setBoardPositionPreference(0, 0, true);
  });
  bindBoardPositionInput(boardPositionX, boardPositionXNumber, 'x');
  bindBoardPositionInput(boardPositionY, boardPositionYNumber, 'y');

  boardPositionDragSurface.addEventListener('keydown', (event) => {
    const deltas = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (!(event.key in deltas)) {
      if (event.key === 'Escape') setBoardPositionEditing(false);
      return;
    }
    event.preventDefault();
    const scale = event.shiftKey ? 10 : 1;
    const [dx, dy] = deltas[event.key];
    setBoardPositionPreference(
      settings.boardOffsetX + dx * scale,
      settings.boardOffsetY + dy * scale,
      true);
  });

  boardPositionDragSurface.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const preferenceX = settings.boardOffsetX;
    const preferenceY = settings.boardOffsetY;
    const move = (ev) => {
      setBoardPositionPreference(
        preferenceX + ev.clientX - startX,
        preferenceY + ev.clientY - startY,
        false);
    };
    const up = (ev) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      move(ev);
      saveSettings();
      boardPositionDragSurface.focus({ preventScroll: true });
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });

  boardPositionPanel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setBoardPositionEditing(false);
  });

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(scheduleBoardLayout);
    observer.observe(topRight);
    observer.observe(gameFrame);
    observer.observe(resultsBox);
    observer.observe(justiceLive);
    observer.observe(difficultyTabs);
    observer.observe(metricsPanel);
  }
}

document.getElementById('zoom-select').addEventListener('change', (event) => {
  document.documentElement.style.setProperty('--cell-size', event.target.value + 'px');
  applyBoardPosition();
  if (tracing()) recordLayout();
  syncResultsPlacement();
  syncJusticePlacement();
  syncResultClearance();
});

//-------BACKUP (export / import of the play history)-------

const backupStatus = document.getElementById('backup-status');
const importPanel = document.getElementById('import-panel');
const importText = document.getElementById('import-text');
const importFileInput = document.getElementById('import-file-input');
const exportFileLink = document.getElementById('export-file');

document.getElementById('export-btn').addEventListener('click', () => {
  // The reserved "settings" key rides along with the mode lists; it can
  // never collide with a mode key (those are always WxH/M@playMode).
  const games = cleanTransferredHistory(history);
  const exportedSettings = cleanTransferredSettings(settings, false);
  const json = JSON.stringify({
    settings: exportedSettings.settings || {},
    ...games.history,
  });
  const cleanup = [];
  if (games.skippedRecords > 0) cleanup.push('omitted ' + games.skippedRecords + ' malformed games');
  if (games.skippedLists > 0) cleanup.push('omitted ' + games.skippedLists + ' malformed lists');
  if (games.repairedFields + exportedSettings.skippedFields > 0) {
    cleanup.push('discarded ' + (games.repairedFields + exportedSettings.skippedFields)
      + ' invalid fields');
  }
  const status = 'export copied to clipboard (' + games.gameCount + ' games)'
    + (cleanup.length > 0 ? '; ' + cleanup.join(', ') : '');
  navigator.clipboard.writeText(json).then(
    () => { backupStatus.textContent = status; },
    (err) => { backupStatus.textContent = 'clipboard copy failed: ' + err.message; },
  );
  if (exportFileLink.href) URL.revokeObjectURL(exportFileLink.href);
  exportFileLink.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  exportFileLink.download = 'minesweeper-friendly-history-' + new Date().toISOString().slice(0, 10) + '.json';
  exportFileLink.hidden = false;
});

// Traces export as a JSON array of per-game trace objects (typed arrays
// converted back to plain arrays), download-only — traces are far too
// large for the clipboard. Consumed by the offline analysis pipelines
// (see analysis/ and agents.md).
const exportTracesLink = document.getElementById('export-traces-file');

document.getElementById('export-traces-btn').addEventListener('click', () => {
  if (db === null) storageFailure('trace export failed: database is not open');
  const request = db.transaction(TRACE_STORE).objectStore(TRACE_STORE).getAll();
  request.onerror = () => storageFailure('trace export failed: ' + request.error);
  request.onsuccess = () => {
    const games = request.result.map((s) => ({
      ...s,
      sampleT: Array.from(s.sampleT),
      sampleX: Array.from(s.sampleX),
      sampleY: Array.from(s.sampleY),
    }));
    const json = JSON.stringify(games);
    if (exportTracesLink.href) URL.revokeObjectURL(exportTracesLink.href);
    exportTracesLink.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    exportTracesLink.download = 'minesweeper-friendly-traces-' + new Date().toISOString().slice(0, 10) + '.json';
    exportTracesLink.hidden = false;
    backupStatus.textContent = games.length + ' traces ready (' + (json.length / 1048576).toFixed(1) + ' MB)';
  };
});

// Merges an exported history into the stored one. endedAt identifies a
// record within a mode (one player cannot finish two games of the same mode
// in the same millisecond), so re-importing the same blob is a no-op. The
// reserved "settings" key (exports since 2026-08-20; absent on older
// exports) carries the settings block, whose known fields overwrite the
// stored settings. Malformed optional fields are discarded and malformed
// records or lists are skipped, so one damaged item never prevents the rest
// of a backup from being recovered.
function importHistory(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    backupStatus.textContent = 'import failed: ' + err.message;
    return;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    backupStatus.textContent = 'import failed: the export is not an object';
    return;
  }
  let importedSettings = null;
  let skippedSettings = 0;
  let malformedSettings = 0;
  if ('settings' in parsed) {
    const cleaned = cleanTransferredSettings(parsed.settings, true);
    importedSettings = cleaned.settings;
    skippedSettings = cleaned.skippedFields;
    if (importedSettings === null) malformedSettings = 1;
  }
  const transfer = cleanTransferredHistory(parsed);
  const incoming = transfer.history;
  let added = 0;
  let dups = 0;
  for (const [mode, list] of Object.entries(incoming)) {
    if (!(mode in history)) history[mode] = [];
    const seen = new Set(history[mode].map((r) => r.endedAt));
    for (const r of list) {
      if (seen.has(r.endedAt)) {
        dups += 1;
        continue;
      }
      seen.add(r.endedAt);
      history[mode].push(r);
      added += 1;
    }
    // Merged-in records restore the chronological-order invariant.
    history[mode].sort((a, b) => a.endedAt - b.endedAt);
  }
  persistUserdata('history', history);
  let settingsNote = '';
  if (importedSettings !== null) {
    settings = settingsFrom({ ...settings, ...importedSettings });
    saveSettings();
    repaintRevealedCells();
    document.getElementById('play-mode-select').value = settings.playMode;
    document.getElementById('board-generator-select').value = settings.boardGenerator;
    refreshGeneratorSelect();
    // Imported generator parameters may differ from the sliders on
    // screen; force the lab panel to rebuild with the imported values.
    labPanelGeneratorId = null;
    syncLabChrome();
    settingsNote = ', applied settings';
  }
  const skipped = [];
  if (transfer.skippedRecords > 0) skipped.push(transfer.skippedRecords + ' malformed games');
  if (transfer.skippedLists > 0) skipped.push(transfer.skippedLists + ' malformed lists');
  if (malformedSettings > 0) skipped.push('malformed settings');
  if (transfer.repairedFields + skippedSettings > 0) {
    skipped.push((transfer.repairedFields + skippedSettings) + ' invalid fields');
  }
  backupStatus.textContent = 'imported ' + added + ' new games, skipped ' + dups + ' duplicates'
    + (skipped.length > 0 ? ', ' + skipped.join(', ') : '') + settingsNote;
  importPanel.hidden = true;
  importText.value = '';
}

document.getElementById('import-btn').addEventListener('click', () => {
  importPanel.hidden = !importPanel.hidden;
});

const formatPanel = document.getElementById('format-panel');

document.getElementById('format-btn').addEventListener('click', () => {
  formatPanel.hidden = !formatPanel.hidden;
});

//-------SETTINGS ENTRY (the full page settings.html holds the controls)-------

// The in-page settings drawer became a full page on 2026-08-23: the
// "settings" opener in the top-right is now a plain link to settings.html
// (see index.html), which shares this page's schema (settings-core.js)
// and database (storage.js). Changes save straight to the shared
// database; this page reads them fresh on every load, and the return
// trip from settings.html is a load.

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!statesMenu.hidden) setStatesMenuOpen(false);
});

// A click outside the open states menu closes it; the menu's own button
// is excluded because its handler already toggles.
document.addEventListener('click', (event) => {
  if (!statesMenu.hidden
      && !statesMenu.contains(event.target) && !statesAddBtn.contains(event.target)) {
    setStatesMenuOpen(false);
  }
});

// The data-format reference card, generated from GAME_RECORD_SCHEMA and
// DIFFICULTIES so it always matches what the code writes and accepts.
function buildFormatPanel() {
  const block = (headingText) => {
    const div = document.createElement('div');
    div.className = 'format-block';
    const heading = document.createElement('h4');
    heading.textContent = headingText;
    div.appendChild(heading);
    formatPanel.appendChild(div);
    return div;
  };

  const exportBlock = block('the whole export');
  const beginnerKey = modeKeyOf(DIFFICULTIES.beginner, 'standard');
  const intermediateKey = modeKeyOf(DIFFICULTIES.intermediate, 'standard');
  const keyColumn = (key) => ('"' + key + '":').padEnd(intermediateKey.length + 4);
  const pre = document.createElement('pre');
  pre.textContent = '{\n  ' + keyColumn('settings') + '{ \u2026the settings panel\u2019s switches\u2026 },\n  '
    + keyColumn(beginnerKey) + '[ \u2026one record per finished game\u2026 ],\n  '
    + keyColumn(intermediateKey) + '[ \u2026 ]\n}';
  const namedModes = Object.entries(DIFFICULTIES)
    .map(([name, d]) => boardKeyOf(d) + ' = ' + difficultyDisplayName(name))
    .join(', ');
  const exportNote = document.createElement('p');
  exportNote.textContent = 'One list per board and play mode, keyed by width\u00d7height/mines@mode ('
    + namedModes + '; modes: ' + PLAY_MODES.map((m) => m.id).join(', ')
    + '). Keys without @ are Standard. Records sit in play order, wins and losses alike. The reserved '
    + '"settings" key carries the settings panel\u2019s switches; importing applies them '
    + '(absent on exports from before 2026-08-20).';
  exportBlock.append(pre, exportNote);

  const recordBlock = block('each game record');
  const table = document.createElement('table');
  const storedFields = GAME_RECORD_SCHEMA.filter((field) => !field.legacy);
  for (const f of storedFields) {
    const row = document.createElement('tr');
    for (const text of [f.field, f.example, f.describe]) {
      const cell = document.createElement('td');
      cell.textContent = text;
      row.appendChild(cell);
    }
    table.appendChild(row);
  }
  const recordNote = document.createElement('p');
  recordNote.textContent = 'Only these ' + storedFields.length + ' measurements are stored. '
    + 'Everything else on the win screen (3BV/s, clicks over 3BV, efficiency, correctness, '
    + 'throughput, IOS, mouse speed, path per click, path per 3BV, every rank and chart) is '
    + 'recomputed from them at display time.';
  recordBlock.append(table, recordNote);
}

document.getElementById('import-apply').addEventListener('click', () => importHistory(importText.value));

document.getElementById('import-open').addEventListener('click', () => importFileInput.click());

importFileInput.addEventListener('change', () => {
  const file = importFileInput.files[0];
  if (file) file.text().then(importHistory);
  importFileInput.value = '';
});

//-------INIT-------

// Static chrome builds immediately; everything that reads userdata waits
// in init, which userdataReady calls once the RAM copies are filled.
buildLcd(mineCounter);
buildLcd(timerDisplay);
buildFormatPanel();

function buildPlayModeSwitcher() {
  const select = document.getElementById('play-mode-select');
  select.textContent = '';
  for (const mode of PLAY_MODES) {
    const option = document.createElement('option');
    option.value = mode.id;
    option.textContent = mode.label;
    select.appendChild(option);
  }
  select.value = settings.playMode;
  select.disabled = false;
  select.addEventListener('change', () => setPlayMode(select.value));
}

function setPlayMode(id) {
  if (!PLAY_MODE_IDS.has(id)) throw new Error('unknown play mode ' + id);
  if (id === settings.playMode) return;
  if (Trial.isPlayMode(settings.playMode) && trialIsActive()) abandonTrial();
  if (pregenActive() || id === 'pregen-10-3bv-desc') pregenBatch = null;
  lastTrialReview = null;
  settings.playMode = id;
  saveSettings();
  document.getElementById('play-mode-select').value = id;
  refreshGeneratorSelect();
  // The custom form's visibility depends on the mode (the Board lab's
  // sliders replace it), not only on the matched difficulty.
  syncDifficultyTabs();
  newGame();
}

function buildBoardGeneratorSwitcher() {
  const select = document.getElementById('board-generator-select');
  select.textContent = '';
  for (const spec of BoardGenerators.SPECS) {
    const option = document.createElement('option');
    option.value = spec.id;
    option.textContent = spec.label;
    option.title = spec.describe;
    select.appendChild(option);
  }
  select.value = settings.boardGenerator;
  select.addEventListener('change', () => setBoardGenerator(select.value));
  refreshGeneratorSelect();
}

function setBoardGenerator(id) {
  BoardGenerators.byId(id); // throws on an unknown id
  if (id === settings.boardGenerator) return;
  settings.boardGenerator = id;
  saveSettings();
  document.getElementById('board-generator-select').value = id;
  newGame();
}

// The generator menu is live only in modes that place mines with it;
// single-path NG carves its own corridor boards and trial sessions use
// fixed identities, so there the menu is disabled rather than lying.
function refreshGeneratorSelect() {
  const select = document.getElementById('board-generator-select');
  const applies = generatorAppliesToMode(settings.playMode);
  select.disabled = !applies;
  select.title = applies
    ? '' : playModeLabel() + ' builds its boards its own way; the generator applies in the other modes';
}

function syncDifficultyTabs() {
  let matched = 'custom';
  for (const [name, d] of Object.entries(DIFFICULTIES)) {
    if (d.width === config.width && d.height === config.height && d.mines === config.mines) {
      matched = name;
      break;
    }
  }
  for (const tab of document.querySelectorAll('#difficulty-tabs a')) {
    tab.classList.toggle('active', tab.dataset.difficulty === matched);
  }
  customForm.hidden = matched !== 'custom' || boardLabActive();
}

function init() {
  buildPlayModeSwitcher();
  buildBoardGeneratorSwitcher();
  renderStates();
  initBoardPositionControls();
  // The history RAM is filled now and nothing has been played yet: the
  // one safe moment to rebuild the session window from stored records.
  sessionBackfillFromHistory();
  if (Trial.isPlayMode(settings.playMode) && trialSession
      && trialSessionPlayMode() === settings.playMode) {
    config = {
      width: trialSession.width,
      height: trialSession.height,
      mines: trialSession.mines,
    };
    syncDifficultyTabs();
    if (trialSession.endedHow !== null) lastTrialReview = trialSession;
  }
  newGame();
  const startupStatus = document.getElementById('startup-status');
  startupStatus.textContent = 'Ready.';
  faceButton.disabled = false;
  boardElement.removeAttribute('aria-busy');
  boardElement.removeAttribute('aria-describedby');
  document.body.removeAttribute('aria-busy');
  document.documentElement.classList.remove('game-booting');
}

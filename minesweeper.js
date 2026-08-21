'use strict';

//-------CONSTANTS-------

const DIFFICULTIES = {
  beginner: { width: 9, height: 9, mines: 10 },
  intermediate: { width: 16, height: 16, mines: 40 },
  expert: { width: 30, height: 16, mines: 99 },
};

// Play mode is a second uniqueifier next to board size: rankings and
// history keys are per (board, play mode). Trial results never mix
// with the other modes' lists.
const PLAY_MODES = [
  { id: 'standard', label: 'Standard' },
  { id: 'uniform-ng', label: 'Uniform NG' },
  { id: 'single-path-ng', label: 'Single-path NG' },
  { id: 'proof-or-die', label: 'Proof-or-die' },
  { id: 'angelic', label: 'Angelic' },
  { id: 'trial', label: 'Trial' },
];
const PLAY_MODE_IDS = new Set(PLAY_MODES.map((m) => m.id));

const LCD_MIN = -99;
const LCD_MAX = 999;
const TIMER_CAP_SECONDS = 999;
const RNG_VERSION = GameRandom.VERSION;
const BOARD_VERSION = 'uniform-first-safe-fisher-yates-v1';
const JUSTICE_VERSION = 'sealed-pocket-mercy-v1';

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

// The status button shows a dove (peace) instead of the classic smiley:
// idle dove, startled flap while pressing, olive branch on win, and a
// broken heart on loss.
const DOVE_BODY = '<path d="M6 9.5 Q6.5 5.8 10.5 6.3 Q14.5 6.8 16.5 9 Q20.5 10.5 24 9.5 L21.5 12 L23.5 14.5 Q17.5 18.5 12 17.5 Q7 16.5 6 12 Q5.6 10.6 6 9.5 Z" fill="#ffffff" stroke="#000" stroke-width="1.1"/>';
const DOVE_BEAK = '<path d="M6.2 8.8 L3 10 L6.2 11.2 Z" fill="#f0a020"/>';
const DOVE_EYE = '<circle cx="8.7" cy="8.8" r="0.75"/>';
const DOVE_EYE_WIDE = '<circle cx="8.7" cy="8.8" r="1.15" fill="none" stroke="#000" stroke-width="0.7"/><circle cx="8.7" cy="8.8" r="0.55"/>';
const DOVE_WING_FOLDED = '<path d="M10.5 10.5 Q14.5 8.5 17.5 10 Q14.5 13.5 10.5 10.5 Z" fill="#dddddd" stroke="#000" stroke-width="0.9"/>';
const DOVE_WING_RAISED = '<path d="M12 9.5 Q13 3.5 18.5 4 Q16.5 8.5 12 9.5 Z" fill="#dddddd" stroke="#000" stroke-width="0.9"/>';
const OLIVE_BRANCH = '<path d="M3 10.8 Q1.6 12.6 2.4 14.8" fill="none" stroke="#2e7d32" stroke-width="0.9"/><ellipse cx="1.7" cy="12.3" rx="1.4" ry="0.75" transform="rotate(-35 1.7 12.3)" fill="#43a047"/><ellipse cx="3.5" cy="13.9" rx="1.4" ry="0.75" transform="rotate(30 3.5 13.9)" fill="#43a047"/>';
const BROKEN_HEART = '<path d="M13 21.5 C5.5 15.5 4.5 9.5 8 7.3 C10.6 5.8 12.4 7.6 13 9.2 C13.6 7.6 15.4 5.8 18 7.3 C21.5 9.5 20.5 15.5 13 21.5 Z" fill="#d32f2f" stroke="#000" stroke-width="1"/><path d="M13 8.8 L11.6 11.5 L13.8 14 L12 17 L13.4 19.5" fill="none" stroke="#ffffff" stroke-width="1.3"/>';

const FACE_SVGS = {
  smile: faceSvg(DOVE_BODY + DOVE_WING_FOLDED + DOVE_EYE + DOVE_BEAK),
  ooh: faceSvg(DOVE_BODY + DOVE_WING_RAISED + DOVE_EYE_WIDE + DOVE_BEAK),
  dead: faceSvg(BROKEN_HEART),
  cool: faceSvg(DOVE_BODY + DOVE_WING_FOLDED + DOVE_EYE + DOVE_BEAK + OLIVE_BRANCH),
};

const FLAG_SVG = '<svg viewBox="0 0 16 16"><path d="M9 3 L9 8.5 L3.5 5.75 Z" fill="#ff0000"/><rect x="8.4" y="3" width="1.2" height="9" fill="#000"/><rect x="5" y="11.5" width="8" height="1.5" fill="#000"/><rect x="3.5" y="13" width="11" height="2" fill="#000"/></svg>';

const MINE_SVG_INNER = '<line x1="8" y1="1" x2="8" y2="15"/><line x1="1" y1="8" x2="15" y2="8"/><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/><circle cx="8" cy="8" r="4.6" stroke="none"/><rect x="6" y="6" width="2" height="2" fill="#ffffff" stroke="none"/>';
const MINE_SVG = '<svg viewBox="0 0 16 16" fill="#000" stroke="#000" stroke-width="1.4">' + MINE_SVG_INNER + '</svg>';
const WRONG_FLAG_SVG = '<svg viewBox="0 0 16 16" fill="#000" stroke="#000" stroke-width="1.4">' + MINE_SVG_INNER + '<path d="M2 2 L14 14 M14 2 L2 14" stroke="#ff0000" stroke-width="2"/></svg>';

function faceSvg(features) {
  return '<svg viewBox="0 0 26 26">' + features + '</svg>';
}

//-------CORE STATE-------

let config = { ...DIFFICULTIES.beginner };
let cells = [];            // {mine, revealed, flagged, adjacent}
let cellElements = [];
let gameState = 'ready';   // ready | playing | won | lost
let minesPlaced = false;
let flagsCount = 0;
let revealedCount = 0;
let startTime = 0;
let finalTimeMs = 0;
let timerInterval = null;
let clickCount = 0;    // board clicks that changed something (reveal/flag/chord)
let wastedClicks = 0;  // board clicks that changed nothing
let flagsPlaced = 0;   // flags the player placed (removals don't subtract)
let flagsRemoved = 0;  // flags the player took back; each removal means the
                       // placement + removal pair (2 clicks) netted nothing —
                       // the second kind of waste besides no-op clicks
let gameSeed = null;    // 128-bit seed for placement and Justice redraws
let gameRandom = null;  // the one deterministic random stream for this game
let trialSession = null;   // userdata 'trial'; null when none stored
let trialPresentation = null; // current trial board, or null
let lastTrialReview = null;   // ended session waiting to be shown
let holdTrialAfterEnd = false; // one newGame after quit does not start another

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
const resultRanks = document.getElementById('result-ranks');
const customForm = document.getElementById('custom-form');
const justiceLive = document.getElementById('justice-live');

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

function placeMines(safeIndex) {
  applyMineMap(Solver.randomPlacement(
    config.width, config.height, config.mines, safeIndex, gameRandom));
}

function ngAttempts() {
  const n = config.width * config.height;
  if (n <= 81) return 800;
  if (n <= 256) return 400;
  return 250;
}

function placeMinesForPlayMode(safeIndex) {
  const mode = settings.playMode;
  if (mode === 'standard' || mode === 'angelic') {
    placeMines(safeIndex);
    return;
  }
  if (mode === 'trial') {
    if (trialPresentation === null) throw new Error('trial presentation missing at placement');
    applyMineMap(trialPresentation.mines);
    return;
  }
  const pred = mode === 'uniform-ng' ? (r) => r.uniform
    : mode === 'single-path-ng' ? (r) => r.singlePath
    : (r) => r.solved;
  const placer = mode === 'single-path-ng' ? Solver.tunnelPlacement : Solver.randomPlacement;
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
  if (settings.playMode === 'trial' && trialIsActive()
      && (trialSession.width !== config.width
        || trialSession.height !== config.height
        || trialSession.mines !== config.mines)) {
    endTrial('quit');
  }
  gameState = 'ready';
  minesPlaced = false;
  justiceEnabledForGame = null;
  flagsCount = 0;
  revealedCount = 0;
  clickCount = 0;
  wastedClicks = 0;
  flagsPlaced = 0;
  flagsRemoved = 0;
  finalTimeMs = 0;
  startTime = 0;
  mousePathPx = 0;
  justiceEvents = 0;
  gameSeed = GameRandom.createSeed();
  gameRandom = GameRandom.fromSeed(gameSeed);
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

  beginTrace();

  setLcd(mineCounter, config.mines);
  setLcd(timerDisplay, 0);
  setFace('smile');
  renderedResult = null;
  finalMotion = null;
  resultSummary.textContent = '';
  resultStats.textContent = '';
  resultRanks.textContent = '';
  if (settings.playMode === 'trial') setupTrialBoard();
  else trialPresentation = null;
  refreshSettingsPanel();
  renderTrialProgress();
  document.title = 'Minesweeper - ' + playModeLabel();
  if (settings.playMode === 'trial' && lastTrialReview && lastTrialReview.endedHow
      && trialPresentation === null) {
    renderTrialReview(lastTrialReview);
  }
}

function setupTrialBoard() {
  if (holdTrialAfterEnd) {
    holdTrialAfterEnd = false;
    trialPresentation = null;
    return;
  }
  ensureTrialSession();
  trialPresentation = Trial.presentation(trialSession, gameRandom);
  applyMineMap(trialPresentation.mines);
  floodReveal(trialPresentation.firstClick);
  gameState = 'playing';
  startTimer();
  justiceEnabledForGame = false;
  checkWin();
}

function ensureTrialSession() {
  const key = boardKey();
  if (trialSession
    && trialSession.endedHow === null
    && trialSession.boardKey === key
    && trialSession.width === config.width
    && trialSession.height === config.height
    && trialSession.mines === config.mines) {
    return;
  }
  trialSession = Trial.createSession(key, config.width, config.height, config.mines, gameRandom);
  persistUserdata('trial', trialSession);
}

function trialIsActive() {
  return trialSession !== null && trialSession.endedHow === null;
}

function endTrial(how) {
  if (!trialIsActive()) return;
  Trial.finishSession(trialSession, how);
  persistUserdata('trial', trialSession);
  lastTrialReview = trialSession;
  if (how === 'quit') holdTrialAfterEnd = true;
}

function renderTrialProgress() {
  const box = document.getElementById('trial-progress');
  if (settings.playMode !== 'trial' || !trialIsActive()) {
    box.hidden = true;
    box.textContent = '';
    return;
  }
  box.hidden = false;
  box.textContent = '';
  const label = document.createElement('span');
  label.textContent = trialSession.results.length + ' / ' + Trial.GAMES;
  const quit = document.createElement('button');
  quit.type = 'button';
  quit.textContent = 'end trial';
  quit.addEventListener('click', () => {
    endTrial('quit');
    newGame();
    if (lastTrialReview) renderTrialReview(lastTrialReview);
  });
  box.append(label, quit);
}

function startTimer() {
  startTime = performance.now();
  timerInterval = setInterval(() => {
    setLcd(timerDisplay, Math.min(TIMER_CAP_SECONDS, Math.floor((performance.now() - startTime) / 1000)));
  }, 200);
}

function elapsedMs() {
  return startTime === 0 ? 0 : performance.now() - startTime;
}

function setFace(name) {
  faceButton.innerHTML = FACE_SVGS[name];
}

function updateCell(i) {
  const cell = cells[i];
  const el = cellElements[i];
  if (cell.revealed) {
    el.className = 'cell revealed' + (cell.adjacent > 0 ? ' n' + cell.adjacent : '');
    el.innerHTML = '';
    if (cell.adjacent > 0) el.textContent = cell.adjacent;
  } else {
    el.className = 'cell hidden';
    el.innerHTML = cell.flagged ? FLAG_SVG : '';
  }
}

function revealCell(index) {
  const cell = cells[index];
  if (cell.revealed || cell.flagged) return;

  let firstReveal = false;
  if (!minesPlaced) {
    placeMinesForPlayMode(index);
    justiceEnabledForGame = settings.playMode === 'standard' && settings.justUniverse;
    gameState = 'playing';
    startTimer();
    refreshSettingsPanel();
    firstReveal = true;
  }

  if (settings.playMode === 'proof-or-die' && !firstReveal) {
    if (!Solver.isProvenSafe(playerView(), index)) {
      lose([index]);
      return;
    }
  } else if (settings.playMode === 'angelic' && !firstReveal) {
    const saved = Solver.forceSafe(playerView(), cells.map((c) => c.mine), index, gameRandom);
    if (saved === null) {
      lose([index]);
      return;
    }
    applyMineMap(saved);
  } else if (!firstReveal) {
    attemptJustice(index);
  }
  if (cell.mine) {
    lose([index]);
    return;
  }

  floodReveal(index);
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
  const cell = cells[index];
  if (cell.revealed) return false;
  cell.flagged = !cell.flagged;
  flagsCount += cell.flagged ? 1 : -1;
  if (cell.flagged) flagsPlaced++;
  else flagsRemoved++;
  clickCount++;
  updateCell(index);
  setLcd(mineCounter, config.mines - flagsCount);
  return true;
}

// Left-click chord on a satisfied number opens all unflagged neighbors.
// Returns whether the click changed anything (a chord on a zero cell, an
// unsatisfied number, or a number with nothing left to open is a no-op).
function chord(index) {
  const cell = cells[index];
  if (!cell.revealed || cell.adjacent === 0) return false;
  const around = neighbors(index);
  const flaggedCount = around.filter((n) => cells[n].flagged).length;
  if (flaggedCount !== cell.adjacent) return false;

  const toReveal = around.filter((n) => !cells[n].revealed && !cells[n].flagged);
  if (toReveal.length === 0) return false;
  clickCount++;

  if (settings.playMode === 'proof-or-die') {
    const view = playerView();
    if (toReveal.some((n) => !Solver.isProvenSafe(view, n))) {
      lose(toReveal);
      return true;
    }
  } else if (settings.playMode === 'angelic') {
    let mines = cells.map((c) => c.mine);
    const view = playerView();
    for (const n of toReveal) {
      const saved = Solver.forceSafe(view, mines, n, gameRandom);
      if (saved === null) {
        lose([n]);
        return true;
      }
      mines = saved;
    }
    applyMineMap(mines);
  }

  const hitMines = toReveal.filter((n) => cells[n].mine);
  if (hitMines.length > 0) {
    lose(hitMines);
    return true;
  }
  for (const n of toReveal) floodReveal(n);
  checkWin();
  return true;
}

function checkWin() {
  if (revealedCount !== cells.length - config.mines) return;
  gameState = 'won';
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

function lose(hitIndices) {
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
  finalTimeMs = elapsedMs();
  clearInterval(timerInterval);
  timerInterval = null;
  clearPresses();
  refreshSettingsPanel();
}

//-------A JUST UNIVERSE (sealed-pocket mercy)-------

// Qualification happens before the hidden layout is consulted. Every bare
// click into a certified sealed pocket is one Justice event whether that
// cell was already clear or needed a conditional redraw. Chords never enter
// this path: a wrong flag is the player's mistake.
let justiceEnabledForGame = null; // frozen from the setting on first reveal
let justiceEvents = 0;            // qualifying sealed-pocket entries

function playerView() {
  return {
    width: config.width,
    height: config.height,
    mines: config.mines,
    revealed: cells.map((c) => c.revealed),
    adjacent: cells.map((c) => c.adjacent),
  };
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
  announceJustice(certificate);
  return true;
}

function announceJustice(certificate) {
  const word = document.createElement('div');
  word.className = 'justice-live-word';
  word.textContent = 'JUSTICE';
  word.title = 'Guaranteed entry into a certified sealed '
    + certificate.type + ' pocket (' + certificate.clearWays + '/'
    + certificate.totalWays + ' clear)';
  justiceLive.appendChild(word);
}

//-------STATS (3BV, as measured on minesweeper.online)-------

function compute3BV() {
  const seen = new Array(cells.length).fill(false);
  let count = 0;
  // Each connected zero-region (plus its numbered border) costs one click.
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].mine || seen[i] || cells[i].adjacent !== 0) continue;
    count++;
    seen[i] = true;
    const stack = [i];
    while (stack.length > 0) {
      const j = stack.pop();
      for (const n of neighbors(j)) {
        if (cells[n].mine || seen[n]) continue;
        seen[n] = true;
        if (cells[n].adjacent === 0) stack.push(n);
      }
    }
  }
  // Every remaining number not touching a zero-region costs one click.
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i].mine && !seen[i]) count++;
  }
  return count;
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
    flagsPlaced: flagsPlaced,
    flagsRemoved: flagsRemoved,
    mousePathPx: Math.round(mousePathPx),
    states: activeStateNames(),
    justice: justiceEvents,
    justiceEnabled: justiceEnabledForGame,
    seed: gameSeed,
    rngVersion: RNG_VERSION,
    boardVersion: BOARD_VERSION,
    justiceVersion: JUSTICE_VERSION,
    maxAdjacent: shape.maxAdjacent,
    hasSeven: shape.hasSeven,
    zeroCount: shape.zeroCount,
    islandCount: shape.islandCount,
    largestIsland: shape.largestIsland,
    playMode: settings.playMode,
  };
  if (settings.playMode === 'trial' && trialPresentation !== null) {
    record.identityIndex = trialPresentation.identityIndex;
    record.transform = trialPresentation.transform;
    record.trialStartedAt = trialSession.startedAt;
  }
  const modeRecords = appendGameRecord(record);
  if (settings.playMode === 'trial' && trialIsActive() && trialPresentation !== null) {
    Trial.recordResult(trialSession, {
      identityIndex: trialPresentation.identityIndex,
      transform: trialPresentation.transform,
      endedAt: record.endedAt,
      outcome: record.outcome,
      timeMs: record.timeMs,
      bv3: record.bv3,
      clicks: record.clicks,
    });
    if (trialSession.nextIndex >= Trial.GAMES) endTrial('completed');
    persistUserdata('trial', trialSession);
    renderTrialProgress();
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
  metricsPanel.hidden = true;
  renderResult(record, modeRecords);
}

// The result currently on screen ({record, modeRecords}), kept so a
// settings toggle can re-render it in place; null while no result shows.
let renderedResult = null;

function renderResult(record, modeRecords) {
  renderedResult = { record, modeRecords };
  const seconds = secondsOf(record);
  resultSummary.textContent = (record.outcome === 'win' ? 'Win' : 'Loss')
    + '\n' + modeLabel() + '\n' + formatDate(record.endedAt);
  resultStats.textContent = '';
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
    ...(record.largestIsland !== undefined ? [['Largest island', String(record.largestIsland)]] : []),
    ['3BV/s', bvPerSecond(record).toFixed(4)],
    ['Clicks', String(record.clicks)],
    ['Wasted clicks', String(record.wastedClicks)],
    ['Flags placed', isMarkless(record) ? '0 - markless' : String(record.flagsPlaced)],
    ['Flags removed', String(record.flagsRemoved)],
    // A Justice event is any qualifying sealed-pocket entry, whether the
    // hidden witness was already clear or needed a redraw.
    ...(record.justice !== undefined ? [['Justice', String(record.justice)]] : []),
    ...(record.outcome === 'win'
      ? [['Clicks over 3BV', String(record.clicks - record.bv3)]]
      : []),
    ['Efficiency', efficiencyPercent(record) + '%'],
    ['Mouse path', record.mousePathPx + 'px'],
    ['Mouse speed', Math.round(record.mousePathPx / seconds) + 'px/s'],
    ['Path per click', Math.round(record.mousePathPx / record.clicks) + 'px'],
    ['Path per 3BV', Math.round(record.mousePathPx / record.bv3) + 'px'],
    // The states row appears only when the game carries at least one state
    // tag; a tagless game shows nothing rather than an empty row.
    ...(record.states.length > 0 ? [['States', record.states.join(', ')]] : []),
  ]) {
    const labelCell = document.createElement('span');
    labelCell.className = 'stat-label';
    labelCell.textContent = label;
    const valueCell = document.createElement('span');
    valueCell.className = 'stat-value' + (valueClass ? ' ' + valueClass : '');
    valueCell.textContent = value;
    statsGrid.append(labelCell, valueCell);
  }
  resultStats.appendChild(statsGrid);
  if (settings.playMode === 'trial') {
    resultRanks.textContent = '';
    if (lastTrialReview && lastTrialReview.endedHow) {
      renderTrialReview(lastTrialReview);
    } else if (record.outcome === 'win' || record.outcome === 'loss') {
      renderTrialMidRanks(record, modeRecords);
    }
  } else if (record.outcome === 'win') {
    renderRanks(record, modeRecords);
  } else {
    resultRanks.textContent = '';
  }
  // The after-game motion charts, jammed inline after whatever other
  // bottom charts the outcome produced (all of them for a win, none for
  // a loss). Motion existed either way.
  if (settings.showMotionStatsAfterGame && finalMotion !== null) {
    const brk = document.createElement('div');
    brk.className = 'flex-break';
    resultRanks.appendChild(brk);
    for (const chart of buildMotionStatsCharts()) resultRanks.appendChild(chart);
  }
}

//-------PLAY HISTORY (every finished game kept per mode)-------

// The game-record schema: one record per finished game, win or loss,
// holding only the primary measurements; every other displayed stat is
// derived from them at read time, never stored. This is the single
// definition of the record shape — reportResult writes exactly these
// fields, importHistory validates candidates against `valid`, and the
// data-format card renders `example` and `describe` — so the writer, the
// validator, and the documentation cannot drift apart. wastedClicks and
// flagsPlaced joined the schema on 2026-08-19, flagsRemoved on 2026-08-20:
// all are always written now, but games recorded before they were measured
// lack them, so absence is valid ("not measured"); displays that need them
// use only records that carry them.
const isNumber = (v) => typeof v === 'number';
const GAME_RECORD_SCHEMA = [
  { field: 'endedAt', valid: isNumber, example: '1787201223496', describe: 'when the game finished (Unix epoch, ms)' },
  { field: 'outcome', valid: (v) => v === 'win' || v === 'loss', example: '"win"', describe: '"win" or "loss"' },
  { field: 'timeMs', valid: isNumber, example: '6705', describe: 'solve time in ms (shown as 6.705s)' },
  { field: 'bv3', valid: isNumber, example: '10', describe: "the board's 3BV: minimum clicks to clear it" },
  { field: 'clicks', valid: isNumber, example: '19', describe: 'clicks that changed the board (reveals, flags, chords)' },
  { field: 'wastedClicks', valid: (v) => v === undefined || isNumber(v), example: '3', describe: 'board clicks that changed nothing; absent on games recorded before 2026-08-19' },
  { field: 'flagsPlaced', valid: (v) => v === undefined || isNumber(v), example: '0', describe: 'flags the player placed (win auto-flagging not counted); 0 = a markless game; absent on games recorded before 2026-08-19' },
  { field: 'flagsRemoved', valid: (v) => v === undefined || isNumber(v), example: '1', describe: 'flags the player took back; each removal = a place+remove pair (2 clicks) that netted nothing; absent on games recorded before 2026-08-20' },
  { field: 'mousePathPx', valid: isNumber, example: '1182', describe: 'cursor travel while playing, px' },
  { field: 'states', valid: (v) => v === undefined || (Array.isArray(v) && v.every((s) => typeof s === 'string')), example: '["sleepy"]', describe: 'player-defined state tags active when the game finished (see the states panel); absent on games recorded before 2026-08-20' },
  { field: 'justice', valid: (v) => v === undefined || isNumber(v), example: '1', describe: 'bare entries into certified sealed pockets that Justice guaranteed safe; absent on games recorded before 2026-08-20' },
  { field: 'justiceEnabled', valid: (v) => v === undefined || typeof v === 'boolean', example: 'true', describe: 'whether "a just universe" was frozen on for this game at its first reveal; absent on earlier games' },
  { field: 'seed', valid: (v) => v === undefined || (typeof v === 'string' && /^[0-9a-f]{32}$/.test(v)), example: '"2f4c5a107ad399e681137b2dc51490aa"', describe: '128-bit seed for initial placement and Justice redraws; absent on earlier games' },
  { field: 'rngVersion', valid: (v) => v === undefined || v === RNG_VERSION, example: '"' + RNG_VERSION + '"', describe: 'algorithm that turns seed into the game random stream; absent on earlier games' },
  { field: 'boardVersion', valid: (v) => v === undefined || v === BOARD_VERSION, example: '"' + BOARD_VERSION + '"', describe: 'first-click-safe board placement algorithm used with the seed; absent on earlier games' },
  { field: 'justiceVersion', valid: (v) => v === undefined || v === JUSTICE_VERSION, example: '"' + JUSTICE_VERSION + '"', describe: 'sealed-pocket certification and redraw contract; absent on earlier games' },
  { field: 'maxAdjacent', valid: (v) => v === undefined || isNumber(v), example: '4', describe: 'highest adjacent-mine number on the finished board; absent on games recorded before 2026-08-21' },
  { field: 'hasSeven', valid: (v) => v === undefined || typeof v === 'boolean', example: 'true', describe: 'whether the finished board contains at least one 7; absent on earlier games' },
  { field: 'zeroCount', valid: (v) => v === undefined || isNumber(v), example: '41', describe: 'how many finished-board cells have adjacent-mine count 0; absent on earlier games' },
  { field: 'islandCount', valid: (v) => v === undefined || isNumber(v), example: '6', describe: '8-connected mine components on the finished board (diagonals count, edges empty); absent on earlier games' },
  { field: 'largestIsland', valid: (v) => v === undefined || isNumber(v), example: '5', describe: 'mine count in the largest 8-connected mine component; 0 if no mines; absent on earlier games' },
  { field: 'playMode', valid: (v) => v === undefined || PLAY_MODE_IDS.has(v), example: '"standard"', describe: 'play mode this game was under; absent on games recorded before 2026-08-21' },
  { field: 'identityIndex', valid: (v) => v === undefined || isNumber(v), example: '3', describe: 'trial board identity (0-24); absent outside trial' },
  { field: 'transform', valid: (v) => v === undefined || typeof v === 'string', example: '"rot90"', describe: 'isometry applied to the trial identity for this presentation' },
  { field: 'trialStartedAt', valid: (v) => v === undefined || isNumber(v), example: '1787201223496', describe: 'when the enclosing trial session began' },
];

// Records are grouped by mode key and kept in chronological order. The RAM
// copy of the whole history (userdata 'history', filled by loadUserdata);
// scalar records are small enough that all of them stay in RAM — revisit
// only if that ever stops being true.
let history = null;

//-------PERSONAL SETTINGS (behavior switches, stored beside the history)-------

// Player-facing behavior switches ("settings", never "config" — that word
// is taken by the board parameters). Like GAME_RECORD_SCHEMA, this is the
// single definition of the settings block: settingsFrom fills absent fields
// from `default` (a stored block written before a setting existed simply
// predates it — absence means the player never changed it), importHistory
// validates an incoming block against `valid`, buildSettingsPanel renders
// the controls from `label`/`describe`, and exports carry the block under
// the reserved "settings" key — so the writer, the validator, the UI, and
// the documentation cannot drift apart.
const SETTINGS_SCHEMA = [
  {
    field: 'justUniverse',
    default: true,
    valid: (v) => typeof v === 'boolean',
    label: 'a just universe',
    describe: 'when you bare-click into a sealed pocket that no outside clue can ever resolve, that entry is guaranteed safe',
    // A "?" beside the name raises this page on hover (examples of what
    // counts as truly forced and what does not).
    helpFile: 'just-universe-help.html',
  },
  {
    field: 'collapseDuplicateCharts',
    default: true,
    valid: (v) => typeof v === 'boolean',
    label: 'collapse duplicate tablecharts',
    describe: 'when several time windows hold the exact same wins (e.g. every win this week happened today), show only the most specific chart; off = every window always renders its own chart',
  },
  {
    field: 'showMotionStatsDuringGame',
    default: true,
    valid: (v) => typeof v === 'boolean',
    label: 'show motion stats during game',
    describe: 'the live motion panel on the left edge: mouse-dynamics values and their sparklines, recomputed once a second while you play (the panel\u2019s own \u00d7 tucks it away for the session; this switch turns it off for good)',
  },
  {
    field: 'showMotionStatsAfterGame',
    default: true,
    valid: (v) => typeof v === 'boolean',
    label: 'show motion stats after game ends',
    describe: 'when a game finishes, the canonical motion values, each with its over-the-game chart, inline at the bottom after the other charts',
  },
  {
    field: 'playMode',
    default: 'standard',
    valid: (v) => PLAY_MODE_IDS.has(v),
    label: 'play mode',
    describe: 'Standard, Uniform NG, Single-path NG, Proof-or-die, Angelic, or Trial. Each mode stores and ranks its own results.',
    control: 'none',
  },
];

// The RAM copy of the settings block (userdata 'settings').
let settings = null;

function settingsFrom(stored) {
  const filled = {};
  for (const s of SETTINGS_SCHEMA) {
    filled[s.field] = s.field in stored ? stored[s.field] : s.default;
  }
  return filled;
}

function saveSettings() {
  persistUserdata('settings', settings);
}

// A stored mode is board parameters plus play mode. Named difficulty
// labels are display-only (see modeLabel). Keys without @ are the
// pre-2026-08-21 shape and mean Standard.
function boardKeyOf(params) {
  return params.width + 'x' + params.height + '/' + params.mines;
}

function boardKey() {
  return boardKeyOf(config);
}

function modeKeyOf(params, playMode) {
  return boardKeyOf(params) + '@' + playMode;
}

function modeKey() {
  return modeKeyOf(config, settings.playMode);
}

function playModeLabel(id) {
  const spec = PLAY_MODES.find((m) => m.id === (id || settings.playMode));
  return spec ? spec.label : String(id);
}

function normalizeHistoryKey(key) {
  return key.includes('@') ? key : key + '@standard';
}

function normalizeHistory(raw) {
  const out = {};
  let changed = false;
  for (const [key, list] of Object.entries(raw)) {
    const norm = normalizeHistoryKey(key);
    if (norm !== key) changed = true;
    if (!out[norm]) out[norm] = [];
    const seen = new Set(out[norm].map((r) => r.endedAt));
    for (const r of list) {
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

function secondsOf(record) {
  return record.timeMs / 1000;
}

function bvPerSecond(record) {
  return record.bv3 / secondsOf(record);
}

function efficiencyPercent(record) {
  return Math.round((record.bv3 / record.clicks) * 100);
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
// [label, windowStartMs, specificity]. Lower specificity = narrower window;
// when two lists contain the exact same wins only the most specific
// survives (see renderRanks), so broad charts appear gradually as history
// spreads out. Day categories (added in rankColumns) sit at 5-7, between
// "today" and "past week".
function rankWindows(nowMs) {
  const d = new Date(nowMs);
  return [
    ['lifetime', -Infinity, 12],
    ['in ' + d.getFullYear(), new Date(d.getFullYear(), 0, 1).getTime(), 10],
    ['in the last year', startOfDay(nowMs, 364), 11],
    ['this month', new Date(d.getFullYear(), d.getMonth(), 1).getTime(), 9],
    ['past week', startOfDay(nowMs, 6), 8],
    ['today', startOfDay(nowMs), 4],
    ['past hour', nowMs - 3600e3, 3],
    ['past 15 min', nowMs - 15 * 60e3, 2],
    ['past 5 min', nowMs - 5 * 60e3, 1],
    ['past 1 min', nowMs - 60e3, 0],
  ];
}

function difficultyDisplayName(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function modeLabel() {
  let board = 'Custom ' + config.width + 'x' + config.height + '-' + config.mines;
  for (const [name, d] of Object.entries(DIFFICULTIES)) {
    if (d.width === config.width && d.height === config.height && d.mines === config.mines) {
      board = difficultyDisplayName(name);
      break;
    }
  }
  return board + ' \u00b7 ' + playModeLabel();
}

function formatDate(timestampMs) {
  const d = new Date(timestampMs);
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
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
// holiday when today is one).
function rankColumns(record) {
  const columns = rankWindows(record.endedAt).map(([label, startMs, specificity]) => ({
    label: label,
    filter: (s) => s.endedAt >= startMs,
    specificity: specificity,
  }));
  const winDate = new Date(record.endedAt);
  const weekday = winDate.getDay();
  columns.push({
    label: 'on ' + WEEKDAY_NAMES[weekday] + 's',
    filter: (s) => new Date(s.endedAt).getDay() === weekday,
    specificity: 5,
  });
  const weekend = isWeekend(winDate);
  columns.push({
    label: weekend ? 'on weekends' : 'on weekdays',
    filter: (s) => isWeekend(new Date(s.endedAt)) === weekend,
    specificity: 6,
  });
  if (isHoliday(winDate)) {
    columns.push({
      label: 'on holidays',
      filter: (s) => isHoliday(new Date(s.endedAt)),
      specificity: 7,
    });
  }
  return columns;
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

// Rankaverage charts: wins grouped by a stat's value, ranked by the group's
// average solve time. Each row shows rank, value, average, and win count; a
// final row aligned under the average-time column notes how this win moved
// its own group's average. 3BV/s buckets
// at 2 decimals, mouse path at 100px, mouse speed at 10px/s; the rest group
// on exact integers.
const RANKAVERAGE_SPECS = [
  { label: 'efficiency', value: efficiencyPercent, format: (v) => v + '%' },
  { label: 'clicks', value: (s) => s.clicks, format: (v) => String(v) },
  { label: '3BV', value: (s) => s.bv3, format: (v) => String(v) },
  { label: '3BV/s', value: (s) => Number(bvPerSecond(s).toFixed(2)), format: (v) => v.toFixed(2) },
  { label: 'mouse path', value: (s) => Math.round(s.mousePathPx / 100) * 100, format: (v) => v + 'px' },
  { label: 'mouse speed', value: (s) => Math.round(s.mousePathPx / secondsOf(s) / 10) * 10, format: (v) => v + 'px/s' },
];

// Every list renders its full 11-row window around the player's row (see
// windowBounds); a mediocre placement still shows its 5 neighbors above and
// below, at full opacity, since the placement itself is fresh information.
// The list ends with an "of N" footer completing the highlighted "#x": the
// rank fraction lives in the chart, not the heading. headingText may be
// null for charts whose column headers do the naming. sortHeader, when
// given, renders a row of subtle clickable column headers above the data
// ({cls, text, active, onClick} each).
function buildRankList(headingText, rowCount, myIndex, gridClass, buildRowCells, sortHeader) {
  const list = document.createElement('div');
  list.className = 'rank-list';
  if (headingText !== null) {
    const heading = document.createElement('h4');
    heading.textContent = headingText;
    list.appendChild(heading);
  }
  const grid = document.createElement('div');
  grid.className = gridClass;
  if (sortHeader) {
    const row = document.createElement('div');
    row.className = 'rank-row sort-row';
    for (const { cls, text, active, onClick } of sortHeader) {
      const cell = document.createElement('span');
      cell.className = cls + ' sort-cell' + (active ? ' active' : '');
      cell.textContent = text;
      const plain = text.replace(/[\u25be\u25b4]/g, '').trim();
      cell.title = 'sort by ' + (plain === '#' ? 'rank' : plain);
      cell.addEventListener('click', onClick);
      row.appendChild(cell);
    }
    grid.appendChild(row);
  }
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
  // nbsp) so toggling between sort orders that do and don't reach the last
  // row cannot change the chart's height.
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

// Small inline-SVG scatter plot: every win is a dot colored by its age unit
// (the same palette as rank-list ages, so time trends are scannable) and
// faded within that color by how deep into the unit it sits (a 6-day-old
// dot is paler than a 1-day-old one); this game is the black-ringed dot
// labeled with its today-rank. Shows relationships (e.g. does moving the
// mouse faster actually win games faster?) rather than rankings. There is
// no chart title: the terse axis labels, rendered at title size along
// with the tick values, name the chart. opts.timeAxis renders x as a local
// date/time axis; opts.idealLine draws the y = x diagonal (used where y has
// a hard floor at x, e.g. clicks can never beat 3BV). ageInfoOf maps a win
// to its {unit, frac} age (see ageInfo).
function buildScatter(wins, me, fx, fy, xLabel, yLabel, meLabel, ageInfoOf, opts = {}) {
  const W = 270, H = 210, L = 54, R = 10, T = 10, B = 36;
  const xs = wins.map(fx), ys = wins.map(fy);
  const pad = (min, max) => {
    const p = (max - min) * 0.04;
    return [min - p, max + p];
  };
  const [x0, x1] = pad(Math.min(...xs), Math.max(...xs));
  const [y0, y1] = pad(Math.min(...ys), Math.max(...ys));
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
  if (opts.timeAxis) {
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
  const dot = (s, cls, r, opacity) => el('circle', {
    cx: px(fx(s)).toFixed(1), cy: py(fy(s)).toFixed(1), r, class: cls,
    'fill-opacity': opacity,
  });
  // The deeper into its age unit a win sits, the more washed-out its dot:
  // full color on entering the unit, fading to 30% at the far edge.
  for (const s of wins) {
    if (s === me) continue;
    const age = ageInfoOf(s);
    dot(s, 'scatter-dot age-dot-' + age.unit, '2.2', (1 - 0.7 * age.frac).toFixed(2));
  }
  dot(me, 'scatter-me age-dot-' + ageInfoOf(me).unit, '3.5', '1');
  // Today-rank tag beside the me-dot; flips to the left near the right edge.
  const meX = px(fx(me));
  const flipLeft = meX > W - R - 50;
  el('text', {
    x: (flipLeft ? meX - 6 : meX + 6).toFixed(1),
    y: Math.max(T + 9, py(fy(me)) - 5).toFixed(1),
    class: 'scatter-me-label' + (flipLeft ? ' flip-left' : ''),
  }, meLabel);
  el('text', { x: L + (W - L - R) / 2, y: H - 4, class: 'scatter-axis-label' }, '\u2192 ' + xLabel);
  el('text', {
    transform: 'translate(12 ' + (T + (H - T - B) / 2) + ') rotate(-90)',
    class: 'scatter-axis-label',
  }, '\u2192 ' + yLabel);

  const list = document.createElement('div');
  list.className = 'rank-list scatter';
  list.append(svg);
  return list;
}

// How this win moved the average time of its own bucket (the average over
// all wins sharing this bucketed value), before vs after this game. Returns
// class + text for a cell rendered in the average-time column.
function avgDelta(spec, record, wins) {
  const bucket = spec.value(record);
  const inBucket = wins.filter((s) => spec.value(s) === bucket);
  const avg = (list) => list.reduce((sum, s) => sum + s.timeMs, 0) / list.length;
  const fmt = (ms) => (ms / 1000).toFixed(3) + 's';
  const before = inBucket.filter((s) => s !== record);
  if (before.length === 0) return { className: 'delta-new', text: 'new' };
  const prevAvg = avg(before);
  const newAvg = avg(inBucket);
  // Classify at display precision: a shift that rounds to 0.000s is
  // unchanged. The sign is the real direction of the average time ("-" =
  // it fell, "+" = it rose); the color says whether that's good (green)
  // or bad (red).
  const shift = fmt(Math.abs(newAvg - prevAvg));
  if (shift === '0.000s') return { className: 'delta-same', text: '=' };
  if (newAvg < prevAvg) return { className: 'delta-improved', text: '-' + shift };
  return { className: 'delta-worsened', text: '+' + shift };
}

// The player's chosen row order for each rankaverage chart, keyed by the
// stat label and persisted so a preference survives reloads. An entry is
// {key, dir}; a missing entry means the natural rank order. The RAM copy
// (userdata 'rankavgSort').
let rankavgSorts = null;

function saveRankavgSort(label, sort) {
  if (sort === null) delete rankavgSorts[label];
  else rankavgSorts[label] = sort;
  persistUserdata('rankavgSort', rankavgSorts);
}

// One rankaverage tablechart. It carries no title — the value column's
// header names the stat. Clicking a column header cycles its sort:
// ascending, then descending, then back to the natural rank order (by the
// bucket's average time). Sorting only reorders rows — each
// row keeps its true by-average rank number — and the 11-row window stays
// centered on this game's bucket. Every comparator ends in a deterministic
// tie-break, so a given history renders the same way every time.
function buildRankavgList(spec, record, wins) {
  const groups = new Map(); // bucketed value -> { count, totalMs }
  for (const s of wins) {
    const v = spec.value(s);
    const g = groups.get(v) || { count: 0, totalMs: 0 };
    g.count += 1;
    g.totalMs += s.timeMs;
    groups.set(v, g);
  }
  const avgMs = (v) => groups.get(v).totalMs / groups.get(v).count;
  const ascComparators = {
    rank: (a, b) => avgMs(a) - avgMs(b) || a - b,
    value: (a, b) => a - b,
    time: (a, b) => avgMs(a) - avgMs(b) || a - b,
    count: (a, b) => groups.get(a).count - groups.get(b).count || avgMs(a) - avgMs(b) || a - b,
  };
  const byAvg = [...groups.keys()].sort(ascComparators.rank);
  const rankOf = (v) => byAvg.indexOf(v) + 1;
  // Only a well-formed {key, dir} counts; anything else (including entries
  // from older versions of this code) falls back to the natural order.
  const saved = rankavgSorts[spec.label];
  const sort = saved && typeof saved === 'object' && saved.key in ascComparators
    && (saved.dir === 'asc' || saved.dir === 'desc') ? saved : null;
  const order = [...byAvg];
  if (sort !== null) {
    order.sort(ascComparators[sort.key]);
    if (sort.dir === 'desc') order.reverse();
  }
  const myIndex = order.indexOf(spec.value(record));
  let list;
  const arrow = { desc: ' \u25be', asc: ' \u25b4' };
  const sortHeader = [
    ['rank-cell', '#', 'rank'],
    ['val-cell', spec.label, 'value'],
    ['avg-cell', 'avg', 'time'],
    ['cnt-cell', 'count', 'count'],
  ].map(([cls, text, key]) => {
    const active = sort !== null && sort.key === key;
    return {
      cls,
      text: text + (active ? arrow[sort.dir] : ''),
      active,
      onClick: () => {
        const next = !active ? { key, dir: 'asc' }
          : sort.dir === 'asc' ? { key, dir: 'desc' }
          : null;
        saveRankavgSort(spec.label, next);
        const fresh = buildRankavgList(spec, record, wins);
        // Freeze the box at its pre-click width (the row count, and so the
        // height, is already constant — see windowBounds) so re-sorting
        // never reflows the whole row of tablecharts around this one.
        fresh.style.width = list.getBoundingClientRect().width + 'px';
        list.replaceWith(fresh);
      },
    };
  });
  list = buildRankList(
    null,
    order.length, myIndex, 'rankavg-grid',
    (i) => [
      ['rank-cell', '#' + rankOf(order[i])],
      ['val-cell', spec.format(order[i])],
      ['avg-cell', (avgMs(order[i]) / 1000).toFixed(3) + 's'],
      ['cnt-cell', groups.get(order[i]).count + '\u00d7'],
    ],
    sortHeader);
  // The delta is a time, so it rides the grid as one more row with its
  // text in the average-time column, aligning under the times above it.
  const delta = avgDelta(spec, record, wins);
  const deltaRow = document.createElement('div');
  deltaRow.className = 'rank-row';
  for (const [cls, text] of [
    ['rank-cell', ''],
    ['val-cell', ''],
    ['avg-cell rank-delta ' + delta.className, delta.text],
    ['cnt-cell', ''],
  ]) {
    const cell = document.createElement('span');
    cell.className = cls;
    cell.textContent = text;
    deltaRow.appendChild(cell);
  }
  list.querySelector('.rankavg-grid').appendChild(deltaRow);
  return list;
}

function trialTimeAgeRow(nowRecord, list) {
  return (i) => {
    const age = relativeAge(nowRecord.endedAt, list[i].endedAt);
    const cells = [
      ['rank-cell', '#' + (i + 1)],
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
    'trial ' + boardKey(),
    wins.length, wins.indexOf(record), 'rank-grid',
    trialTimeAgeRow(record, wins)));
}

function renderTrialReview(session) {
  resultSummary.textContent = 'Trial '
    + (session.endedHow === 'completed' ? 'complete' : 'ended')
    + '\n' + session.width + 'x' + session.height + '/' + session.mines
    + '\n' + session.results.length + ' / ' + Trial.GAMES;
  resultStats.textContent = '';
  resultRanks.textContent = '';
  const groups = Trial.groupedResults(session);
  for (const group of groups) {
    if (group.attempts.length === 0) continue;
    const box = document.createElement('div');
    box.className = 'trial-identity';
    const head = document.createElement('h3');
    head.textContent = 'board ' + (group.identityIndex + 1)
      + ' \u00b7 ' + group.attempts.length + ' attempt'
      + (group.attempts.length === 1 ? '' : 's');
    box.appendChild(head);
    const winTimes = [];
    const winBvps = [];
    for (let i = 0; i < group.attempts.length; i++) {
      const attempt = group.attempts[i];
      const seconds = attempt.timeMs / 1000;
      const line = document.createElement('div');
      line.textContent = (i + 1) + '. ' + attempt.outcome + '  '
        + seconds.toFixed(3) + 's  3BV ' + attempt.bv3
        + '  ' + (attempt.bv3 / seconds).toFixed(3) + '/s  '
        + attempt.transform;
      box.appendChild(line);
      if (attempt.outcome === 'win') {
        winTimes.push(seconds);
        winBvps.push(attempt.bv3 / seconds);
      }
    }
    if (winTimes.length >= 2) {
      const note = document.createElement('div');
      const delta = winTimes[0] - winTimes[winTimes.length - 1];
      note.textContent = delta > 0
        ? ('last win ' + delta.toFixed(3) + 's faster than first')
        : delta < 0
          ? ('last win ' + (-delta).toFixed(3) + 's slower than first')
          : 'last win matched the first';
      box.appendChild(note);
      box.appendChild(buildSparkline(
        winTimes.map((_, i) => i * 1000), winTimes, SPARK_SMALL));
      const bvNote = document.createElement('div');
      bvNote.textContent = '3BV/s';
      box.appendChild(bvNote);
      box.appendChild(buildSparkline(
        winBvps.map((_, i) => i * 1000), winBvps, SPARK_SMALL));
    }
    resultRanks.appendChild(box);
  }
}

function renderRanks(record, modeRecords) {
  resultRanks.textContent = '';
  const wins = modeRecords.filter((r) => r.outcome === 'win');
  // Ranking order everywhere: fastest first, ties broken by earlier finish.
  const byTimeThenEnd = (a, b) => a.timeMs - b.timeMs || a.endedAt - b.endedAt;
  // Row builder shared by every time-ranked list: rank, solve time, and the
  // win's age split into count and unit cells (or a single "this" marking
  // the game that just finished).
  const timeAgeRow = (list) => (i) => {
    const age = relativeAge(record.endedAt, list[i].endedAt);
    const cells = [
      ['rank-cell', '#' + (i + 1)],
      // Markless games carry a small (m) before their time (CSS ::before).
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
  // Progressive disclosure (the collapseDuplicateCharts setting, on by
  // default): two lists holding the exact same wins would render
  // identically, so only the most specific one of each such group is shown,
  // and broader charts appear on their own once history spreads across
  // enough hours/days/weekdays to make them differ. Switched off, every
  // window renders its own chart regardless of duplication.
  const candidates = rankColumns(record).map((column) => ({
    column,
    inWindow: wins.filter(column.filter).sort(byTimeThenEnd),
  }));
  const kept = new Set(candidates);
  if (settings.collapseDuplicateCharts) {
    const seenSets = new Set();
    kept.clear();
    for (const c of [...candidates].sort((a, b) => a.column.specificity - b.column.specificity)) {
      const signature = c.inWindow.map((s) => s.endedAt).join('|');
      if (seenSets.has(signature)) continue;
      seenSets.add(signature);
      kept.add(c);
    }
  }
  for (const c of candidates) {
    if (!kept.has(c)) continue;
    const { column, inWindow } = c;
    // `record` is an element of modeRecords, so identity search finds it.
    const myIndex = inWindow.indexOf(record);
    resultRanks.appendChild(buildRankList(
      column.label,
      inWindow.length, myIndex, 'rank-grid',
      timeAgeRow(inWindow)));
  }

  // Best times on boards of this exact 3BV: the fairest time comparison,
  // since only equally-hard layouts compete.
  const sameBv = wins.filter((s) => s.bv3 === record.bv3).sort(byTimeThenEnd);
  resultRanks.appendChild(buildRankList(
    '3BV ' + record.bv3,
    sameBv.length, sameBv.indexOf(record), 'rank-grid',
    timeAgeRow(sameBv)));

  // Board-shape time lists: this win's finished-board family only.
  // Older wins that lack the measurement stay off the list. Nested
  // filters (max 2 ⊂ max 3 ⊂ max 4) collapse under the same setting
  // as the window charts, most specific first.
  const shapeCandidates = [];
  if (record.maxAdjacent === 8) {
    shapeCandidates.push({
      label: 'has 8',
      specificity: 0,
      rows: wins.filter((s) => s.maxAdjacent === 8),
    });
  }
  if (record.hasSeven === true) {
    shapeCandidates.push({
      label: 'has 7',
      specificity: 1,
      rows: wins.filter((s) => s.hasSeven === true),
    });
  }
  if (typeof record.maxAdjacent === 'number') {
    for (const cap of [4, 3, 2]) {
      if (record.maxAdjacent <= cap) {
        shapeCandidates.push({
          label: 'max ' + cap,
          specificity: cap,
          rows: wins.filter((s) => typeof s.maxAdjacent === 'number' && s.maxAdjacent <= cap),
        });
      }
    }
  }
  if (typeof record.islandCount === 'number') {
    shapeCandidates.push({
      label: record.islandCount === 1 ? '1 island' : record.islandCount + ' islands',
      specificity: 10,
      rows: wins.filter((s) => s.islandCount === record.islandCount),
    });
  }
  if (typeof record.largestIsland === 'number') {
    shapeCandidates.push({
      label: 'largest island ' + record.largestIsland,
      specificity: 11,
      rows: wins.filter((s) => s.largestIsland === record.largestIsland),
    });
  }
  if (typeof record.zeroCount === 'number') {
    shapeCandidates.push({
      label: record.zeroCount === 1 ? '1 zero' : record.zeroCount + ' zeros',
      specificity: 12,
      rows: wins.filter((s) => s.zeroCount === record.zeroCount),
    });
  }
  const shapeKept = new Set(shapeCandidates);
  if (settings.collapseDuplicateCharts) {
    const seenSets = new Set();
    shapeKept.clear();
    for (const c of [...shapeCandidates].sort((a, b) => a.specificity - b.specificity)) {
      const signature = c.rows.map((s) => s.endedAt).join('|');
      if (seenSets.has(signature)) continue;
      seenSets.add(signature);
      shapeKept.add(c);
    }
  }
  for (const c of shapeCandidates) {
    if (!shapeKept.has(c)) continue;
    const inWindow = c.rows.slice().sort(byTimeThenEnd);
    resultRanks.appendChild(buildRankList(
      c.label,
      inWindow.length, inWindow.indexOf(record), 'rank-grid',
      timeAgeRow(inWindow)));
  }

  for (const spec of RANKAVERAGE_SPECS) {
    resultRanks.appendChild(buildRankavgList(spec, record, wins));
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
    const myIndex = segments.findIndex((seg) => seg.current);
    resultRanks.appendChild(buildRankList(
      label,
      segments.length, myIndex, 'rank-grid',
      (i) => {
        const seg = segments[i];
        const age = relativeAge(record.endedAt, seg.end);
        const cells = [
          ['rank-cell', '#' + (i + 1)],
          ['time-cell', seg.len + (seg.len === 1 ? ' win' : ' wins')],
        ];
        if (age.count === 0 && age.unit === 's') {
          cells.push(['age-just-cell age-u-s', 'this']);
        } else {
          cells.push(['age-num-cell age-u-' + age.unit, formatAgeCount(age)]);
          cells.push(['age-unit-cell age-u-' + age.unit, age.unit]);
        }
        return cells;
      }));
  }

  // Scatter plots at the very bottom: primary measurements first (3BV and
  // mouse path against win time), then derived mouse metrics. Needs at
  // least 2 wins to have a spread.
  if (wins.length >= 2) {
    const brk = document.createElement('div');
    brk.className = 'flex-break';
    resultRanks.appendChild(brk);
    const todayStart = startOfDay(record.endedAt);
    const todayRank = wins
      .filter((s) => s.endedAt >= todayStart)
      .sort(byTimeThenEnd)
      .indexOf(record) + 1;
    const meLabel = '#' + todayRank + ' today';
    const ageInfoOf = (s) => ageInfo(record.endedAt, s.endedAt);
    const hourOfDay = (s) => {
      const d = new Date(s.endedAt);
      return d.getHours() + d.getMinutes() / 60;
    };
    // Axis labels stay terse — one or two words, no units or asides; the
    // tick values carry the scale. "date" spreads wins across the calendar;
    // "time of day" folds every win onto one 24-hour clock, exposing the
    // daily rhythm instead of the long-term trend.
    resultRanks.appendChild(buildScatter(
      wins, record, (s) => s.endedAt, secondsOf,
      'date', 'time', meLabel, ageInfoOf, { timeAxis: true }));
    resultRanks.appendChild(buildScatter(
      wins, record, hourOfDay, secondsOf,
      'time of day', 'time', meLabel, ageInfoOf));
    resultRanks.appendChild(buildScatter(
      wins, record, (s) => s.bv3, secondsOf,
      '3BV', 'time', meLabel, ageInfoOf));
    resultRanks.appendChild(buildScatter(
      wins, record, (s) => s.bv3, (s) => s.clicks,
      '3BV', 'clicks', meLabel, ageInfoOf,
      { idealLine: true }));
    // Only wins that carry the wastedClicks measurement (recorded since
    // 2026-08-19) can appear on its chart.
    const withWasted = wins.filter((s) => 'wastedClicks' in s);
    if (withWasted.length >= 2) {
      resultRanks.appendChild(buildScatter(
        withWasted, record, (s) => s.wastedClicks, bvPerSecond,
        'wasted clicks', '3BV/s', meLabel, ageInfoOf));
    }
    resultRanks.appendChild(buildScatter(
      wins, record, (s) => s.mousePathPx, secondsOf,
      'mouse path', 'time', meLabel, ageInfoOf));
    resultRanks.appendChild(buildScatter(
      wins, record, (s) => s.mousePathPx / secondsOf(s), secondsOf,
      'mouse speed', 'time', meLabel, ageInfoOf));
    resultRanks.appendChild(buildScatter(
      wins, record, (s) => s.mousePathPx / secondsOf(s), efficiencyPercent,
      'mouse speed', 'efficiency', meLabel, ageInfoOf));
    resultRanks.appendChild(buildScatter(
      wins, record, (s) => s.mousePathPx / s.clicks, efficiencyPercent,
      'path per click', 'efficiency', meLabel, ageInfoOf));
    resultRanks.appendChild(buildScatter(
      wins, record, (s) => s.mousePathPx / s.bv3, secondsOf,
      'path per 3BV', 'time', meLabel, ageInfoOf));
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
    resultRanks.appendChild(legend);
  }
}

//-------PERSISTENT STORAGE (one IndexedDB database: userdata + traces)-------

// All storage moved from localStorage into IndexedDB on 2026-08-20. One
// database holds two stores: 'userdata' (play history, settings, rankavg
// sorts, player states — one entry per kind) and 'traces' (see the trace
// section below). Userdata is RAM-first: loadUserdata reads every kind
// into its RAM object once at startup, all reads and mutations work on RAM
// synchronously, and each mutation calls persistUserdata — an async
// fire-and-forget write of that kind's whole RAM object. IndexedDB
// structured-clones the value at put() time, so RAM mutations after the
// call cannot race the write. Traces are far too large for RAM and are
// written straight to their store, one entry per game.

const DB_NAME = 'minesweeper-friendly';
const TRACE_STORE = 'traces';
const USERDATA_STORE = 'userdata';
const USERDATA_KINDS = ['history', 'settings', 'rankavgSort', 'states', 'trial'];

let db = null;

// A failure to open the database or to persist data is a bug to fix, not a
// mode to tolerate: announce where the player can see it, and throw.
function storageFailure(what) {
  backupStatus.textContent = what;
  throw new Error(what);
}

// Where each userdata kind lived before 2026-08-20. The version-2 upgrade
// below carries the data over exactly once (the upgrade only ever runs
// once per origin); deletable once every player's origin has upgraded.
const LEGACY_LOCALSTORAGE_KEYS = {
  history: 'minesweeper-friendly.history',
  settings: 'minesweeper-friendly.settings',
  rankavgSort: 'minesweeper-friendly.rankavgSort',
  states: 'minesweeper-friendly.states',
};

const dbRequest = indexedDB.open(DB_NAME, 2);
dbRequest.onupgradeneeded = (event) => {
  const upgraded = event.target.result;
  if (event.oldVersion < 1) upgraded.createObjectStore(TRACE_STORE, { keyPath: 'endedAt' });
  if (event.oldVersion < 2) {
    const store = upgraded.createObjectStore(USERDATA_STORE);
    const moved = [];
    for (const [kind, storageKey] of Object.entries(LEGACY_LOCALSTORAGE_KEYS)) {
      const raw = localStorage.getItem(storageKey);
      if (raw === null) continue;
      store.put(JSON.parse(raw), kind);
      moved.push(storageKey);
    }
    // The old keys disappear only after the carried-over data is committed.
    event.target.transaction.addEventListener('complete', () => {
      for (const storageKey of moved) localStorage.removeItem(storageKey);
    });
  }
};
dbRequest.onsuccess = (event) => {
  db = event.target.result;
  loadUserdata();
};
dbRequest.onerror = () => storageFailure('database failed to open: ' + dbRequest.error);

// Reads every userdata kind into its RAM object, then finishes startup:
// init() builds the settings panel, the states panel, and the first board,
// all of which read RAM.
function loadUserdata() {
  const tx = db.transaction(USERDATA_STORE);
  tx.onerror = () => storageFailure('userdata load failed: ' + tx.error);
  const store = tx.objectStore(USERDATA_STORE);
  const got = {};
  for (const kind of USERDATA_KINDS) {
    const request = store.get(kind);
    request.onsuccess = () => { got[kind] = request.result; };
  }
  tx.oncomplete = () => {
    // An absent kind is a player who never stored it, not an error.
    const loaded = normalizeHistory(got.history === undefined ? {} : got.history);
    history = loaded.history;
    if (loaded.changed) persistUserdata('history', history);
    settings = settingsFrom(got.settings === undefined ? {} : got.settings);
    rankavgSorts = got.rankavgSort === undefined ? {} : got.rankavgSort;
    playerStates = got.states === undefined
      ? DEFAULT_STATE_NAMES.map((name) => ({ name, active: false }))
      : got.states;
    trialSession = got.trial === undefined ? null : got.trial;
    init();
  };
}

// Persists one userdata kind's RAM object. Fire-and-forget: RAM is already
// current, so nothing waits on the disk write.
function persistUserdata(kind, value) {
  if (db === null) storageFailure(kind + ' not saved: database is not open');
  const tx = db.transaction(USERDATA_STORE, 'readwrite');
  tx.objectStore(USERDATA_STORE).put(value, kind);
  tx.onerror = () => storageFailure(kind + ' save failed: ' + tx.error);
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
    events: [],            // button + layout events, see traceEvent/recordLayout
  };
  recordLayout();
  // The metrics panel flips back to live immediately with fresh series:
  // the previous game's final values and sparklines must not linger over
  // a running trace.
  beginTraceMetricsSeries();
  renderLiveTraceMetrics();
}

function tracing() {
  return gameState === 'ready' || gameState === 'playing';
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

// kind: 'ldown' | 'lup' | 'rdown'. index is the board cell the event hit,
// or null (an 'lup' released off the cells while the button was down).
function traceEvent(kind, event, index) {
  trace.events.push({
    t: performance.now() - trace.t0,
    kind: kind,
    x: event.clientX,
    y: event.clientY,
    index: index,
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
  };
}

//-------TRACE METRICS: DISPLAY (the #metrics-panel column)-------

const metricsPanel = document.getElementById('metrics-panel');

// The displayed metrics, grouped by measurement system. Each display:
// label; calc (how the value is computed, exactly); use (what it is good
// for and in what context — the literature's reading plus this project's
// multi-timescale self-tracking angle); of, the numeric extractor over
// the combined metrics object of computeAllTraceMetrics (undefined or
// NaN = not measurable on this trace, rendered as an en dash and a gap
// in the sparkline); fmt, the formatter for the extracted number. calc
// and use appear together as the row's hover tooltip. Not everything
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
        use: 'how many separate hand movements the game took. Stop-and-go play '
          + 'raises it; fluent sweeps lower it. A per-game baseline for hesitancy '
          + 'across days and states',
        of: (m) => m.bio.strokeCount, fmt: (v) => String(v) },
      { label: 'moving',
        calc: 'sum of bout durations (first to last sample of each bout)',
        use: 'pure motor time, as opposed to thinking time. With path it gives '
          + 'true moving speed, undiluted by deliberation',
        of: (m) => m.bio.movementMs, fmt: (v) => (v / 1000).toFixed(1) + 's' },
      { label: 'silence',
        calc: '1 minus moving time over wall-clock game time',
        use: 'share of the game spent with the cursor still — thinking, reading '
          + 'the board, or resting. A standard mouse-dynamics feature; here it '
          + 'tracks deliberation vs fluency (fatigue, brain fog, warm-up)',
        of: (m) => m.bio.silenceRatio, fmt: (v) => Math.round(v * 100) + '%' },
      { label: 'path',
        calc: 'sum of distances between every consecutive pair of cursor '
          + 'samples, jumps across pauses included — fruitless travel counts',
        use: 'gross motor output of the game. Shifts with hardware and '
          + 'sensitivity changes (tag those with a state like "new mouse"), and '
          + 'feeds wander and the path-per-click stats',
        of: (m) => m.bio.totalPathPx, fmt: (v) => Math.round(v) + 'px' },
      { label: 'speed',
        calc: 'each bout\u2019s mean of its sample-to-sample speeds, then the '
          + 'mean over bouts',
        use: 'overall tempo of hand movement. Rises with warm-up within a '
          + 'session; sensitive to mouse/DPI changes, so it profiles the setup '
          + 'as much as the player — read alongside turn rate, which does not',
        of: (m) => m.bio.speedMeanPxPerMs, fmt: (v) => Math.round(v * 1000) + 'px/s' },
      { label: 'peak speed',
        calc: 'the single fastest sample-to-sample speed in any bout',
        use: 'ballistic capability — the flick, not the cruise. Less diluted '
          + 'by careful stretches than the mean; declines with age in pointing '
          + 'studies, so a long-horizon tracking target',
        of: (m) => m.bio.speedMaxPxPerMs, fmt: (v) => Math.round(v * 1000) + 'px/s' },
      { label: 'straightness',
        calc: 'per bout, straight-line distance from its start to its end '
          + 'divided by the distance actually traveled (1 = a perfect line); '
          + 'mean over bouts',
        use: 'movement efficiency and planning: low values mean curved, '
          + 'corrected, or searching motion. Drops under unfamiliarity and '
          + 'fatigue',
        of: (m) => m.bio.straightness, fmt: (v) => v.toFixed(2) },
      { label: 'jerk',
        calc: 'per bout, the mean absolute rate of change of acceleration '
          + '(third derivative of position along the path, px/ms\u00b3, from '
          + 'segment-midpoint speeds); mean over bouts',
        use: 'movement smoothness. Elevated jerk marks corrections, tremor, '
          + 'fatigue, or unfamiliarity — the clinical literature\u2019s '
          + 'smoothness family, on raw bouts',
        of: (m) => m.bio.jerkMeanPxPerMs3, fmt: (v) => v.toFixed(4) },
      { label: 'turn rate',
        calc: 'per bout, the mean absolute change of movement heading per ms '
          + '(rad/ms) between successive moving steps; mean over bouts',
        use: 'the curvature family — the most person-identifying and most '
          + 'hardware-stable features in mouse biometrics (Zheng et al.). The '
          + 'best candidate for a signature that survives a mouse change',
        of: (m) => m.bio.angularVelocityMeanRadPerMs, fmt: (v) => v.toFixed(3) },
      { label: 'left clicks',
        calc: 'completed left clicks: a press and its release both on the trace',
        use: 'activity volume, and a cross-check of the game\u2019s own click '
          + 'counter from an independent recording path',
        of: (m) => m.bio.leftClickCount, fmt: (v) => String(v) },
      { label: 'right clicks',
        calc: 'right-button presses (flag actions)',
        use: 'flagging style: markless play shows 0; heavy flaggers run high. '
          + 'Style shifts over months are real signal',
        of: (m) => m.bio.rightClickCount, fmt: (v) => String(v) },
      { label: 'hold',
        calc: 'mean time from left-button press to its release',
        use: 'purely motor — no thinking can hide in it. Click duration is one '
          + 'of Hevelius\u2019 strongest ataxia/parkinsonism separators and has '
          + 'good test-retest reliability: a prime longitudinal health metric',
        of: (m) => m.bio.clickDurationMeanMs, fmt: (v) => Math.round(v) + 'ms' },
      { label: 'pause-and-click',
        calc: 'for each press, the stillness between the last cursor movement '
          + 'and the press; mean over presses',
        use: 'the commitment lag: arrived, then hesitated how long before '
          + 'acting? Separates decision lag from travel time — the "lag" the '
          + 'biometrics literature uses to identify users',
        of: (m) => m.bio.pauseAndClickMeanMs, fmt: (v) => Math.round(v) + 'ms' },
    ] },
  { key: 'waste', name: 'waste', definition:
      'whole-game waste measures (the survey\u2019s Tier 1/2 proposals); '
      + 'fruitless effort is counted, never subtracted away',
    displays: [
      { label: 'wander',
        calc: 'total cursor travel divided by the sum of straight lines '
          + 'between consecutive click positions (1.0 = perfectly direct '
          + 'all game)',
        use: 'the purest wasted-motion number: how much extra distance the '
          + 'hand covered beyond what the clicks required. Scanning, searching, '
          + 'and second-guessing all raise it; expertise lowers it',
        of: (m) => m.waste.wanderRatio, fmt: (v) => v.toFixed(2) + '\u00d7' },
      { label: 'pauses',
        calc: 'count of gaps of 250ms or more between consecutive cursor '
          + 'samples over the whole game',
        use: 'how often play stalls. More, shorter pauses read differently '
          + 'than one long freeze — see longest pause',
        of: (m) => m.waste.pauseCount, fmt: (v) => String(v) },
      { label: 'paused',
        calc: 'total time inside those 250ms-or-longer gaps',
        use: 'total stalled time — the coarse-grained "time paused" companion '
          + 'to silence (which uses the finer 100ms bout gap)',
        of: (m) => m.waste.pausedMs, fmt: (v) => (v / 1000).toFixed(1) + 's' },
      { label: 'longest pause',
        calc: 'the single longest such gap',
        use: 'the hardest deduction of the game — or a distraction. The '
          + '"stuck" moment, worth correlating with board difficulty and states',
        of: (m) => m.waste.longestPauseMs, fmt: (v) => (v / 1000).toFixed(1) + 's' },
      { label: 'turnarounds',
        calc: 'heading reversals of more than 90\u00b0 between consecutive '
          + 'movement legs of at least 8px each (the length floor keeps pixel '
          + 'jitter out)',
        use: 'went one way, changed plan, went another — the open-board analog '
          + 'of the x-flips "change of mind" measure. Confusion and re-planning '
          + 'made countable',
        of: (m) => m.waste.dirChanges, fmt: (v) => String(v) },
      { label: 'feints',
        calc: 'times the cursor entered a board cell, stayed 300ms or more, '
          + 'then left it without any click during the stay',
        use: 'approach-abandon: considered acting and backed off. Real spent '
          + 'effort that no click records — a direct hesitation counter, the '
          + 'measurement principle in action',
        of: (m) => m.waste.feintCount, fmt: (v) => String(v) },
    ] },
  { key: 'psych', name: 'psychometric', definition:
      'mousetrap decision-research measures per inter-click segment '
      + '(exact port of the R package), means over segments',
    displays: [
      { label: 'segments',
        calc: 'number of inter-click trajectories measured: previous click to '
          + 'next click, needing at least 5 trajectory points',
        use: 'the sample size behind every psychometric and clinical mean '
          + 'below — small counts mean noisy means',
        of: (m) => m.psych.segmentCount, fmt: (v) => String(v) },
      { label: 'MAD',
        calc: 'per segment, the signed maximum deviation of the path from the '
          + 'ideal straight line joining segment start to its click; mean over '
          + 'segments',
        use: 'decision research reads the bow of a path as attraction toward '
          + 'an option not chosen: large magnitude = conflicted approach. Track '
          + 'against uncertainty (guessy boards) and states',
        of: (m) => m.psych.mad, fmt: (v) => Math.round(v) + 'px' },
      { label: 'AUC',
        calc: 'per segment, the signed area enclosed between the actual path '
          + 'and that ideal line (shoelace formula, negative when the path '
          + 'bows the other way); mean over segments',
        use: 'the whole-path conflict measure; correlates .8-.9 with MAD, so '
          + 'they mostly confirm each other — divergence itself is interesting',
        of: (m) => m.psych.auc, fmt: (v) => sparkAxisNumber(v) + 'px\u00b2' },
      { label: 'AD',
        calc: 'per segment, the mean signed deviation over all path points; '
          + 'mean over segments',
        use: 'persistent drift to one side of the ideal line rather than a '
          + 'single bow — systematic bias in approach paths',
        of: (m) => m.psych.ad, fmt: (v) => Math.round(v) + 'px' },
      { label: 'x-flips',
        calc: 'per segment, reversals of horizontal movement direction '
          + '(consecutive moves merge into same-direction runs; flips = runs '
          + 'minus 1); mean over segments',
        use: 'the classic "changes of mind" count from mouse-tracking: each '
          + 'flip is a mid-flight reversal. Decision instability, hesitancy',
        of: (m) => m.psych.xFlips, fmt: (v) => v.toFixed(1) },
      { label: 'y-flips',
        calc: 'the same, vertically',
        use: 'as x-flips; on a 2D board both axes carry the signal, unlike the '
          + 'two-choice lab task where x is the option axis',
        of: (m) => m.psych.yFlips, fmt: (v) => v.toFixed(1) },
      { label: 'initiation',
        calc: 'per segment, time from the segment\u2019s start until the '
          + 'cursor first moves; mean over segments',
        use: 'how long before the hand launches — planning or re-orienting '
          + 'time after each click. The esports reaction-time analog, and in '
          + 'minesweeper it also absorbs deduction time',
        of: (m) => m.psych.initiationTimeMs, fmt: (v) => Math.round(v) + 'ms' },
      { label: 'idle',
        calc: 'per segment, total time of steps where the position did not '
          + 'change; mean over segments',
        use: 'stalling inside an approach (as opposed to before it): stop-offs '
          + 'en route to the click',
        of: (m) => m.psych.idleTimeMs, fmt: (v) => (v / 1000).toFixed(1) + 's' },
      { label: 'vel max',
        calc: 'per segment, the peak point-to-point velocity; mean over '
          + 'segments',
        use: 'per-decision ballistic speed. Same family as peak speed above '
          + 'but averaged per approach, so one wild flick cannot dominate it',
        of: (m) => m.psych.velMaxPxPerMs, fmt: (v) => Math.round(v * 1000) + 'px/s' },
      { label: 'acc max',
        calc: 'per segment, the peak increase of velocity per ms; mean over '
          + 'segments',
        use: 'launch force — how hard movements start. Age- and '
          + 'impairment-sensitive in the clinical literature',
        of: (m) => m.psych.accMaxPxPerMs2, fmt: (v) => v.toFixed(4) },
      { label: 'entropy',
        calc: 'per segment, sample entropy (m=3) of the differenced x '
          + 'trajectory after resampling to 101 equal time steps; the '
          + 'tolerance r is 0.2 \u00d7 the SD pooled over this game\u2019s '
          + 'segments; mean over segments',
        use: 'spatiotemporal disorder — how unpredictable the path is moment '
          + 'to moment. Only ~.5 correlated with flips, so it catches '
          + 'restlessness the flip counts miss',
        of: (m) => m.psych.sampleEntropy, fmt: (v) => v.toFixed(2) },
      { label: 'segment time',
        calc: 'per segment, time from its start to its click (mousetrap\u2019s '
          + 'RT); mean over segments',
        use: 'the full think-plus-travel cycle per decision. In minesweeper '
          + 'this is dominated by deduction, so read it as decision pace, not '
          + 'motor speed',
        of: (m) => m.psych.rtMs, fmt: (v) => (v / 1000).toFixed(1) + 's' },
    ] },
  { key: 'hev', name: 'clinical', definition:
      'Hevelius-style motor features per inter-click movement '
      + '(100Hz resample, 7Hz low-pass; see reference/hevelius/FEATURES.md), '
      + 'means over movements',
    displays: [
      { label: 'execution',
        calc: 'per movement, time from its first to its last mousemove, with '
          + 'time the button was held excluded; mean over movements',
        use: 'the purest "how long does the hand take" number gameplay '
          + 'offers: it starts at the first move, so pre-movement deliberation '
          + 'is excluded. Good test-retest reliability in Hevelius',
        of: (m) => m.hev.executionTimeMs, fmt: (v) => (v / 1000).toFixed(2) + 's' },
      { label: 'exec no pauses',
        calc: 'execution time with mid-movement stops of 100ms or more also '
          + 'subtracted',
        use: 'motor transport time cleansed of mid-flight thinking — the ET '
          + 'that normalized jerk is built on. The gap between the two '
          + 'execution rows is itself a hesitation measure',
        of: (m) => m.hev.executionTimeNoPausesMs, fmt: (v) => (v / 1000).toFixed(2) + 's' },
      { label: 'peak speed*',
        calc: 'per movement, the maximum of the smoothed speed (trajectory '
          + 'resampled at 100Hz, speed low-passed at 7Hz); mean over movements',
        use: 'the clearest documented aging signal in Hevelius (declines '
          + 'steadily with age) — the single best feature for multi-year '
          + 'self-tracking. Smoothing makes it robust to sensor noise',
        of: (m) => m.hev.peakSpeedPxPerMs, fmt: (v) => Math.round(v * 1000) + 'px/s' },
      { label: 'peak accel',
        calc: 'per movement, the maximum of the smoothed acceleration; mean '
          + 'over movements',
        use: 'burst strength at movement launch; part of the noise-to-force '
          + 'family Hevelius used to separate patient groups',
        of: (m) => m.hev.peakAccelPxPerMs2, fmt: (v) => v.toFixed(4) },
      { label: 'submovements',
        calc: 'per movement, count of speed pulses that cross 100px/s and '
          + 'reach at least 500px/s before dropping back; mean over movements',
        use: 'healthy fast pointing is one ballistic pulse plus at most one '
          + 'correction; more pulses mean corrections — impairment, '
          + 'unfamiliarity, or fatigue. A core clinical smoothness count',
        of: (m) => m.hev.submovementCount, fmt: (v) => v.toFixed(1) },
      { label: 'main sub',
        calc: 'duration of the submovement containing the movement\u2019s '
          + 'peak speed; mean over movements',
        use: 'the ballistic core of each movement. (Hevelius weights this '
          + 'feature in its models without publishing the exact quantity; '
          + 'duration is this project\u2019s documented choice)',
        of: (m) => m.hev.mainSubmovementMs, fmt: (v) => Math.round(v) + 'ms' },
      { label: 'sub end dist',
        calc: 'distance from the clicked cell\u2019s center at the moment the '
          + 'main submovement ends; mean over movements',
        use: 'primary-movement accuracy: how much distance was left for '
          + 'corrections after the big pulse. One of the features that '
          + 'separated patients from controls in Hevelius',
        of: (m) => m.hev.mainSubEndDistPx, fmt: (v) => Math.round(v) + 'px' },
      { label: 'axis dev',
        calc: 'per movement, the maximum distance of the path from the task '
          + 'axis (the straight line joining the movement\u2019s start and '
          + 'end); mean over movements',
        use: 'worst-case path control per movement — the MacKenzie pointing '
          + 'accuracy family. Big deviations mean detours, not jitter',
        of: (m) => m.hev.maxAxisDeviationPx, fmt: (v) => Math.round(v) + 'px' },
      { label: 'movement error',
        calc: 'per movement, the average absolute distance of the path from '
          + 'the task axis; mean over movements',
        use: 'gross straightness of transport: how far, on average, the hand '
          + 'strayed from the direct line. Steadier than the max',
        of: (m) => m.hev.movementErrorPx, fmt: (v) => Math.round(v) + 'px' },
      { label: 'axis crossings',
        calc: 'per movement, times the path crossed the task axis; mean over '
          + 'movements',
        use: 'oscillation around the intended line — weaving. Tremor and '
          + 'over-correction both raise it',
        of: (m) => m.hev.axisCrossings, fmt: (v) => v.toFixed(1) },
      { label: 'norm jerk',
        calc: 'per movement, dimensionless (execution time without '
          + 'pauses)\u00b3 \u00f7 peak speed\u00b2 \u00d7 the integral of '
          + 'squared jerk, pause spans excluded from the integral; mean over '
          + 'movements',
        use: 'THE smoothness measure: Hevelius\u2019 strongest ataxia '
          + 'separator (z 3.2-3.6), good reliability, and built to be nearly '
          + 'independent of movement difficulty — which suits uncontrolled '
          + 'gameplay distances. Watch it against fatigue and states',
        of: (m) => m.hev.normalizedJerkNoPauses, fmt: (v) => sparkAxisNumber(v) },
      { label: 'click slip',
        calc: 'distance the cursor slid between button press and release; '
          + 'mean over completed left clicks',
        use: 'purely motor, no assumptions, elevated in ataxia: did the hand '
          + 'hold still through the click? Cheap to compute over every stored '
          + 'trace, so ideal for backfilled long-run tracking',
        of: (m) => m.hev.clickSlipPx, fmt: (v) => v.toFixed(1) + 'px' },
      { label: 'verification',
        calc: 'time between the last movement inside the clicked cell and the '
          + 'button press; mean over movements where the cursor ended inside '
          + 'the cell',
        use: 'the look-before-committing window. In the clinic it is visual '
          + 'verification; in minesweeper it also contains safety re-checking, '
          + 'so read it as care, not just motor settling',
        of: (m) => m.hev.verificationTimeMs, fmt: (v) => Math.round(v) + 'ms' },
      { label: 're-entries',
        calc: 'times the pointer left the clicked cell and came back before '
          + 'the click; mean over movements with a known target cell',
        use: 'target acquisition instability — overshoot-and-return at the '
          + 'destination. Noisier here than in the lab task, since neighboring '
          + 'cells are plausible targets too',
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

// One metric as label + current value + chart of its series. The hover
// tooltip is the metric's full explanation: how the value is calculated,
// then what it is used for and in what context.
function buildMetricRow(group, display, metrics, series, size, rowClass) {
  const value = displayableNumber(display.of(metrics));
  const row = document.createElement('div');
  row.className = rowClass;
  row.title = 'HOW: ' + display.calc + '.\n\nUSE: ' + display.use + '.'
    + (value === undefined ? '\n\n(not yet measurable on this trace)' : '');
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
  head.title = group.definition;
  return head;
}

// Whether the player tucked the live panel away with its own toggler.
// Session-only display state: the persistent switch is the
// showMotionStatsDuringGame setting.
let metricsPanelCollapsed = false;

// The metrics of the latest render, so toggler clicks and settings
// changes can redraw the panel without waiting for the next tick.
let lastLiveMetrics = null;

function renderMetricsPanel(metrics) {
  if (!settings.showMotionStatsDuringGame) {
    metricsPanel.hidden = true;
    return;
  }
  metricsPanel.hidden = false;
  metricsPanel.textContent = '';
  metricsPanel.classList.toggle('collapsed', metricsPanelCollapsed);

  if (metricsPanelCollapsed) {
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'metrics-toggle';
    restore.textContent = 'motion \u25b8';
    restore.title = 'show the live motion stats panel again';
    restore.addEventListener('click', () => {
      metricsPanelCollapsed = false;
      renderMetricsPanel(lastLiveMetrics);
    });
    metricsPanel.appendChild(restore);
    return;
  }

  const head = document.createElement('div');
  head.className = 'metrics-panel-head';
  const phaseEl = document.createElement('span');
  phaseEl.className = 'metric-phase';
  phaseEl.textContent = 'live';
  phaseEl.title = 'recomputed over the trace so far, once a second';
  const hide = document.createElement('button');
  hide.type = 'button';
  hide.className = 'metrics-toggle';
  hide.textContent = '\u00d7';
  hide.title = 'tuck this panel away for now (the "show motion stats during game" setting turns it off for good)';
  hide.addEventListener('click', () => {
    metricsPanelCollapsed = true;
    renderMetricsPanel(lastLiveMetrics);
  });
  head.append(phaseEl, hide);
  metricsPanel.appendChild(head);

  for (const group of TRACE_METRIC_GROUPS) {
    metricsPanel.appendChild(buildMetricsGroupHead(group));
    for (const display of group.displays) {
      metricsPanel.appendChild(buildMetricRow(
        group, display, metrics, metricsSeries, SPARK_SMALL, 'metric-row'));
    }
  }
}

// The finished game's canonical metrics and its full series, snapshotted
// at game end for the after-game charts (see buildMotionStatsCharts);
// null while no finished game is on screen. beginTrace replaces
// metricsSeries with a fresh object, so these references stay the ended
// game's own.
let finalMotion = null;

// The after-game display: one large chart per metric, appended inline
// after the other bottom charts (renderResult), grouped by measurement
// system with a labeled break before each group. Canonical values: same
// computation as live, complete trace.
function buildMotionStatsCharts() {
  const nodes = [];
  for (const group of TRACE_METRIC_GROUPS) {
    const brk = document.createElement('div');
    brk.className = 'flex-break';
    nodes.push(brk);
    nodes.push(buildMetricsGroupHead(group));
    const brk2 = document.createElement('div');
    brk2.className = 'flex-break';
    nodes.push(brk2);
    for (const display of group.displays) {
      nodes.push(buildMetricRow(
        group, display, finalMotion.metrics, finalMotion.series, SPARK_LARGE,
        'metric-row motion-chart'));
    }
  }
  return nodes;
}

// Applies the showMotionStatsDuringGame setting to a running game
// immediately (called on any settings change; ticks would apply it
// within a second anyway).
function refreshMetricsPanel() {
  if (trace !== null && tracing()) renderMetricsPanel(lastLiveMetrics);
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
  };
  appendTraceMetricsSeries(metrics);
  lastLiveMetrics = metrics;
  renderMetricsPanel(metrics);
}

setInterval(() => {
  if (trace !== null && tracing()) renderLiveTraceMetrics();
}, LIVE_METRICS_EVERY_MS);

//-------PLAYER STATES (session tags stamped onto finished games)-------

// The player keeps a personal list of state tags ("sleepy", "new mouse", ...)
// and toggles which ones currently apply; every finished game records the
// active set (see reportResult), so life circumstances can be correlated
// with results later. Editing the list only shapes future games — past
// records keep whatever states they were stamped with.
const DEFAULT_STATE_NAMES = ['sleepy', 'just woke up', 'inebriated'];

// The RAM copy (userdata 'states'): [{name, active}] in display order. A
// new player gets the default options to choose from, none active (see
// loadUserdata); the list is only persisted once the player changes
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
      statesMenu.hidden = true;
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

statesAddBtn.addEventListener('click', () => {
  statesMenu.hidden = !statesMenu.hidden;
  statesStatus.textContent = '';
});

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
  statesMenu.hidden = true;
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
  if (gameState === 'won' || gameState === 'lost') return;
  const index = cellIndexFromEvent(event);
  if (index === null) return;
  traceEvent('ldown', event, index);
  leftDown = true;
  setFace('ooh');
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
  if (gameState === 'won' || gameState === 'lost') return;
  // Logged before acting so a game-ending click is inside its own trace.
  traceEvent('lup', event, index);
  const cell = cells[index];
  if (!cell.revealed && !cell.flagged) {
    clickCount++;
    revealCell(index);
  } else if (cell.revealed) {
    if (!chord(index)) wastedClicks++;
  } else {
    // Left-clicking a flagged cell does nothing.
    wastedClicks++;
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
  if (gameState === 'ready' || gameState === 'playing') setFace('smile');
});

document.addEventListener('mousemove', (event) => {
  if (lastMouseX !== null && gameState === 'playing') {
    mousePathPx += Math.hypot(event.clientX - lastMouseX, event.clientY - lastMouseY);
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
  if (gameState === 'won' || gameState === 'lost') return;
  const index = cellIndexFromEvent(event);
  if (index === null) return;
  traceEvent('rdown', event, index);
  if (!toggleFlag(index)) wastedClicks++;
});

// The board can shift under the viewport coordinate system; every such
// change gets a fresh layout event so samples stay mappable to cells.
document.addEventListener('scroll', () => {
  if (tracing()) recordLayout();
});
window.addEventListener('resize', () => {
  if (tracing()) recordLayout();
});

// Anywhere on the top panel (face button included, since it bubbles) restarts.
document.getElementById('top-panel').addEventListener('click', newGame);

document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || ['INPUT', 'TEXTAREA', 'BUTTON', 'A'].includes(event.target.tagName)) return;
  event.preventDefault();
  newGame();
});

//-------DIFFICULTY TABS-------

for (const tab of document.querySelectorAll('#difficulty-tabs a')) {
  tab.addEventListener('click', (event) => {
    event.preventDefault();
    for (const t of document.querySelectorAll('#difficulty-tabs a')) t.classList.remove('active');
    tab.classList.add('active');
    const name = tab.dataset.difficulty;
    if (name === 'custom') {
      customForm.hidden = false;
      customForm.requestSubmit();
    } else {
      customForm.hidden = true;
      config = { ...DIFFICULTIES[name] };
      newGame();
    }
  });
}

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

document.getElementById('zoom-select').addEventListener('change', (event) => {
  document.documentElement.style.setProperty('--cell-size', event.target.value + 'px');
  if (tracing()) recordLayout();
});

//-------BACKUP (export / import of the play history)-------

const backupStatus = document.getElementById('backup-status');
const importPanel = document.getElementById('import-panel');
const importText = document.getElementById('import-text');
const importFileInput = document.getElementById('import-file-input');
const exportFileLink = document.getElementById('export-file');

function gameCount(history) {
  return Object.values(history).reduce((n, list) => n + list.length, 0);
}

document.getElementById('export-btn').addEventListener('click', () => {
  // The reserved "settings" key rides along with the mode lists; it can
  // never collide with a mode key (those are always WxH/M@playMode).
  const json = JSON.stringify({ settings, ...history });
  navigator.clipboard.writeText(json).then(
    () => { backupStatus.textContent = 'export copied to clipboard (' + gameCount(history) + ' games)'; },
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
// stored settings. The whole blob — settings included — is validated
// before anything is written.
function importHistory(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    backupStatus.textContent = 'import failed: ' + err.message;
    return;
  }
  let importedSettings = null;
  if ('settings' in parsed) {
    importedSettings = parsed.settings;
    delete parsed.settings;
    const malformed = importedSettings === null || typeof importedSettings !== 'object'
      || SETTINGS_SCHEMA.some((s) => s.field in importedSettings && !s.valid(importedSettings[s.field]));
    if (malformed) {
      backupStatus.textContent = 'import failed: "settings" is not a valid settings block';
      return;
    }
  }
  const incoming = {};
  for (const [mode, list] of Object.entries(parsed)) {
    if (!Array.isArray(list)) {
      backupStatus.textContent = 'import failed: "' + mode + '" is not an array of game records';
      return;
    }
    for (const r of list) {
      const malformed = r === null || typeof r !== 'object'
        || GAME_RECORD_SCHEMA.some((f) => !f.valid(r[f.field]));
      if (malformed) {
        backupStatus.textContent = 'import failed: "' + mode + '" contains a malformed game record';
        return;
      }
    }
    const key = normalizeHistoryKey(mode);
    if (!incoming[key]) incoming[key] = [];
    incoming[key].push(...list);
  }
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
    for (const s of SETTINGS_SCHEMA) {
      if (s.field in importedSettings) settings[s.field] = importedSettings[s.field];
    }
    saveSettings();
    refreshSettingsPanel();
    document.getElementById('play-mode-select').value = settings.playMode;
    settingsNote = ', applied settings';
  }
  backupStatus.textContent = 'imported ' + added + ' new games, skipped ' + dups + ' duplicates' + settingsNote;
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

//-------SETTINGS PANEL-------

const settingsPanel = document.getElementById('settings-panel');

document.getElementById('settings-btn').addEventListener('click', () => {
  settingsPanel.hidden = !settingsPanel.hidden;
});

// One checkbox row per SETTINGS_SCHEMA entry. A change saves immediately
// and re-renders the result on screen (if any), so the effect is visible
// without finishing another game.
function buildSettingsPanel() {
  for (const s of SETTINGS_SCHEMA) {
    if (s.control === 'none') continue;
    const row = document.createElement('label');
    row.className = 'setting-row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.dataset.field = s.field;
    box.checked = settings[s.field];
    box.addEventListener('change', () => {
      if (s.field === 'justUniverse' && gameState === 'playing') {
        box.checked = settings[s.field];
        return;
      }
      settings[s.field] = box.checked;
      saveSettings();
      if (renderedResult !== null) renderResult(renderedResult.record, renderedResult.modeRecords);
      refreshMetricsPanel();
    });
    const name = document.createElement('span');
    name.className = 'setting-name';
    name.textContent = s.label;
    const describe = document.createElement('span');
    describe.className = 'setting-describe';
    describe.textContent = s.describe;
    if (s.helpFile !== undefined) {
      // A "?" that raises the setting's help page (an iframe popover to the
      // panel's left) while hovered — over the "?" or the page itself.
      const help = document.createElement('span');
      help.className = 'setting-help';
      help.textContent = '?';
      const pop = document.createElement('div');
      pop.className = 'setting-help-pop';
      pop.hidden = true;
      const frame = document.createElement('iframe');
      frame.src = s.helpFile;
      frame.title = s.label + ' — help';
      pop.appendChild(frame);
      let hideTimer = null;
      const show = () => { clearTimeout(hideTimer); pop.hidden = false; };
      const hide = () => { hideTimer = setTimeout(() => { pop.hidden = true; }, 250); };
      for (const el of [help, pop]) {
        el.addEventListener('mouseenter', show);
        el.addEventListener('mouseleave', hide);
      }
      // Inside the row's <label>: interacting with the "?" or the page must
      // not toggle the checkbox.
      help.addEventListener('click', (event) => event.preventDefault());
      pop.addEventListener('click', (event) => event.preventDefault());
      row.append(box, name, help, describe, pop);
    } else {
      row.append(box, name, describe);
    }
    settingsPanel.appendChild(row);
  }
}

// Re-syncs the checkboxes after an import replaces settings.
function refreshSettingsPanel() {
  for (const box of settingsPanel.querySelectorAll('input[type=checkbox]')) {
    box.checked = settings[box.dataset.field];
    const locked = box.dataset.field === 'justUniverse' && gameState === 'playing';
    box.disabled = locked;
    box.title = locked ? 'A just universe is fixed from the first reveal until this game ends.' : '';
  }
}

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
  for (const f of GAME_RECORD_SCHEMA) {
    const row = document.createElement('tr');
    for (const text of [f.field, f.example, f.describe]) {
      const cell = document.createElement('td');
      cell.textContent = text;
      row.appendChild(cell);
    }
    table.appendChild(row);
  }
  const recordNote = document.createElement('p');
  recordNote.textContent = 'Only these ' + GAME_RECORD_SCHEMA.length + ' measurements are stored. '
    + 'Everything else on the win screen (3BV/s, clicks over 3BV, efficiency, mouse speed, '
    + 'path per click, path per 3BV, every rank and chart) is recomputed from them at display time.';
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
// in init, which loadUserdata calls once the RAM copies are filled.
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
  select.addEventListener('change', () => setPlayMode(select.value));
}

function setPlayMode(id) {
  if (!PLAY_MODE_IDS.has(id)) throw new Error('unknown play mode ' + id);
  if (id === settings.playMode) return;
  if (settings.playMode === 'trial' && trialIsActive()) endTrial('quit');
  settings.playMode = id;
  if (id !== 'trial') holdTrialAfterEnd = false;
  saveSettings();
  document.getElementById('play-mode-select').value = id;
  newGame();
  if (lastTrialReview && lastTrialReview.endedHow === 'quit') {
    renderTrialReview(lastTrialReview);
  }
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
  customForm.hidden = matched !== 'custom';
}

function init() {
  buildSettingsPanel();
  buildPlayModeSwitcher();
  renderStates();
  if (settings.playMode === 'trial' && trialSession && trialSession.endedHow === null) {
    config = {
      width: trialSession.width,
      height: trialSession.height,
      mines: trialSession.mines,
    };
    syncDifficultyTabs();
  }
  newGame();
}

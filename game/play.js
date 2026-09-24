'use strict';

// One game on the board: the top panel (LCDs and face), board helpers, the
// board generator glue and Generator menu, the new-game flow, reveal / flag /
// chord, win and loss, and A just universe (sealed-pocket mercy, misclick
// facts, the guess ledger).

//-------TOP PANEL (LCD digits, face icons)-------

const LCD_MIN = -99;
const LCD_MAX = 999;
const TIMER_CAP_SECONDS = 999;

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

function faceSvg(features) {
  return '<svg viewBox="0 0 26 26">' + features + '</svg>';
}

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

// The generator the current settings select for the current mode: the
// chosen id with its stored parameter overrides filled from the schema
// defaults, or the default generator where the choice does not apply.
function activeGenerator() {
  if (!generatorAppliesToMode(settings.playMode)) return BoardGenerators.uniformGenerator();
  const id = settings.boardGenerator;
  return { id, params: BoardGenerators.paramsFrom(id, settings.boardGeneratorParams[id]) };
}

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

//-------GAME FLOW-------

// A game end first updates the board and face. The result pipeline clones and
// persists history, recomputes trace metrics, and builds every post-game
// chart; doing all of that in the ending input task prevents the browser
// from painting the already-updated board and final time. A frame callback
// followed by a timer crosses a paint boundary before that work begins.
// The fallback also finalizes promptly if animation frames are throttled.
let pendingResultOutcome = null;
let pendingResultEndedAt = null;
let pendingResultFrame = null;
let pendingResultTimer = null;
let pendingResultFallbackTimer = null;

function flushPendingResult() {
  if (pendingResultOutcome === null) return;
  const outcome = pendingResultOutcome;
  const endedAt = pendingResultEndedAt;
  pendingResultOutcome = null;
  pendingResultEndedAt = null;
  if (pendingResultFrame !== null) cancelAnimationFrame(pendingResultFrame);
  if (pendingResultTimer !== null) clearTimeout(pendingResultTimer);
  if (pendingResultFallbackTimer !== null) clearTimeout(pendingResultFallbackTimer);
  pendingResultFrame = null;
  pendingResultTimer = null;
  pendingResultFallbackTimer = null;
  reportResult(outcome, endedAt);
}

function renderImmediateGameEnd(outcome, endedAt) {
  setResultSummary(outcome === 'win' ? 'Win' : 'Loss',
    gameGenerator.id === BoardGenerators.DEFAULT_ID ? null : BoardGenerators.displayLabel(gameGenerator),
    formatDate(endedAt));
  clearResultStats();
  resultAnalysis.textContent = '';
  resultRanks.textContent = '';

  const statsGrid = document.createElement('div');
  statsGrid.id = 'stats-grid';
  statsGrid.className = 'immediate-stats';
  statsGrid.setAttribute('aria-label', 'Final time');
  const label = document.createElement('span');
  label.className = 'stat-label';
  label.textContent = 'Time';
  const value = document.createElement('span');
  value.className = 'stat-value';
  value.textContent = (finalTimeMs / 1000).toFixed(3) + 's';
  statsGrid.append(label, value);
  resultStats.appendChild(statsGrid);

  const loading = document.createElement('div');
  loading.className = 'result-loading';
  loading.setAttribute('role', 'status');
  loading.textContent = 'loading scores and report\u2026';
  resultRanks.appendChild(loading);
  // Show the result in its reserved column before this task paints.
  syncBoardLayout();
}

function reportResultAfterPaint(outcome) {
  if (pendingResultOutcome !== null) flushPendingResult();
  const endedAt = Date.now();
  pendingResultOutcome = outcome;
  pendingResultEndedAt = endedAt;
  renderImmediateGameEnd(outcome, endedAt);
  pendingResultFallbackTimer = setTimeout(flushPendingResult, 250);
  pendingResultFrame = requestAnimationFrame(() => {
    pendingResultFrame = null;
    pendingResultTimer = setTimeout(flushPendingResult, 0);
  });
}

function newGame() {
  // Preserve the just-finished game's mutable state if a programmatic restart
  // arrives in the brief post-paint finalization window.
  flushPendingResult();
  rememberPreference('resultView', 'game');
  rememberPreference('replayPosition', { endedAt: null, step: 0 });
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
  chordClicks = 0;
  wastedClicks = 0;
  inputActionCount = 0;
  misclicks = 0;
  flagsPlaced = 0;
  flagsRemoved = 0;
  unusedCorrectFlags = 0;
  activeFlagEpisodes = new Map();
  flagEpisodes = [];
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
  replayReview.open = settings.panels.replay;
  replayStep = 0;
  cancelReplayPrecompute();
  replaySolverCache.clear();
  replaySlider.max = '0';
  lastPathState = null;
  hidePathTooltip();
  renderPathView();
  resultSummary.textContent = '';
  clearResultStats();
  resultAnalysis.textContent = '';
  resultRanks.textContent = '';
  syncResultClearance();
  if (Trial.isPlayMode(settings.playMode) && trialIsActive()) setupTrialBoard();
  else trialPresentation = null;
  if (pregenActive()) setupPregenBoard();
  else pregenCurrent = null;
  if (boardLabActive()) buildLabBoard();
  if (endgameDrillActive()) setupEndgameDrill();
  else drillCurrent = null;
  document.title = 'Minesweeper - ' + playModeLabel();
  renderTrialChrome();
  renderPregenChrome();
  renderDrillChrome();
  renderPregenCharts();
  syncLabChrome();
  syncGameSidebar();
}

//-------BOARD PLAY (timer, face, reveal, flag, chord, win, loss)-------

function startTimer() {
  // Every transition into 'playing' passes through here, so this is the
  // one place the session stats learn a game is actually in progress.
  sessionPlayBegin();
  startTime = performance.now();
  let shownSeconds = -1;
  timerInterval = setInterval(() => {
    const seconds = Math.floor((performance.now() - startTime) / 1000);
    if (seconds === shownSeconds) return;
    shownSeconds = seconds;
    setLcd(timerDisplay, Math.min(TIMER_CAP_SECONDS, seconds));
    scheduleMetricsUpdate({ elapsed: true });
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

// FLAG_SVG / MINE_SVG / WRONG_FLAG_SVG live in settings-core.js with the
// rest of the cell iconography.
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

function beginFlagEpisode(index, evaluation) {
  const episode = {
    index,
    evaluation,
    usedByChord: false,
    mineWhenClosed: undefined,
    endedBy: undefined,
  };
  activeFlagEpisodes.set(index, episode);
  flagEpisodes.push(episode);
}

function finishFlagEpisode(index, reason) {
  const episode = activeFlagEpisodes.get(index);
  if (episode === undefined) return;
  activeFlagEpisodes.delete(index);
  episode.mineWhenClosed = cells[index].mine;
  episode.endedBy = reason;
}

function finishOpenFlagEpisodes(won) {
  for (const index of [...activeFlagEpisodes.keys()]) {
    finishFlagEpisode(index, 'game-ended');
  }
  if (!won) return;
  for (const episode of flagEpisodes) {
    if (episode.usedByChord || episode.mineWhenClosed !== true) continue;
    unusedCorrectFlags++;
    const evaluation = episode.evaluation;
    if (!evaluation.mistakes.includes('unused-correct-flag')) {
      evaluation.mistakes.push('unused-correct-flag');
      evaluation.evidence.unusedFlagEndedBy = episode.endedBy;
    }
    if (!actionEvaluations.includes(evaluation)) {
      actionEvaluations.push(evaluation);
      sessionRecordEvaluation(evaluation);
    }
  }
}

function markChordFlagUsage(index) {
  for (const neighbor of neighbors(index)) {
    if (!cells[neighbor].flagged) continue;
    const episode = activeFlagEpisodes.get(neighbor);
    if (episode !== undefined) episode.usedByChord = true;
  }
}

function cellsTouch(a, b) {
  const ax = a % config.width;
  const ay = Math.floor(a / config.width);
  const bx = b % config.width;
  const by = Math.floor(b / config.width);
  return a !== b && Math.abs(ax - bx) <= 1 && Math.abs(ay - by) <= 1;
}

// Post-hoc physical-misclick heuristic. It deliberately supplements rather
// than replaces the exact fatal status: a still-active flag on an actual safe
// cell, placed under one second before an adjacent fatal chord/reveal.
const LIKELY_MISCLICK_MAX_MS = 1000;
function annotateLikelyMisclickDeath(evaluation) {
  if (!evaluation || evaluation.result === 'death') return;
  const target = evaluation.action === 'chord'
    ? evaluation.triggerCell : evaluation.selected[0];
  if (!Number.isInteger(target)) return;
  let best;
  for (const episode of activeFlagEpisodes.values()) {
    const flag = episode.index;
    const gapMs = evaluation.atMs - episode.evaluation.atMs;
    if (!cells[flag].flagged || cells[flag].mine || gapMs < 0
        || gapMs >= LIKELY_MISCLICK_MAX_MS || !cellsTouch(flag, target)) continue;
    if (best === undefined || gapMs < best.gapMs) best = { flag, gapMs };
  }
  if (best === undefined) return;
  evaluation.mistakes.push('likely-misclick-after-wrong-flag');
  evaluation.evidence.likelyMisclick = {
    reason: 'recent-adjacent-wrong-flag',
    flagCell: best.flag,
    targetCell: target,
    gapMs: best.gapMs,
  };
}

// Returns whether the click changed anything (false on a revealed cell).
function toggleFlag(index, evaluation) {
  if (trialBlocksPlay()) return false;
  const cell = cells[index];
  if (cell.revealed) return false;
  if (gameState === 'ready' && minesPlaced) {
    gameState = 'playing';
    startTimer();
    justiceEnabledForGame = justiceAppliesToMode() && settings.justUniverse;
  }
  if (cell.flagged) finishFlagEpisode(index, 'flag-removed');
  cell.flagged = !cell.flagged;
  if (cell.flagged) beginFlagEpisode(index, evaluation);
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
  // Even on an endgame drill's pre-opened numbers a chord cannot be the
  // first game-starting input: an accepted chord needs its flags placed
  // first, and the first flag already moved ready -> playing.
  const actionEvaluation = evaluateChordAction(index, toReveal);
  markChordFlagUsage(index);
  clickCount++;
  chordClicks++;

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
  reportResultAfterPaint('win');
}

function lose(hitIndices, evaluation) {
  annotateLikelyMisclickDeath(evaluation);
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
  reportResultAfterPaint('loss');
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

// Per-event Justice details of the current game ({type, clearWays,
// totalWays}), pushed by attemptJustice for the end-of-game recap.
let justiceDetails = [];

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
    // Drills are dealt deducible, so any measured guess was unforced —
    // exactly the training signal the mode exists for.
    || settings.playMode === 'endgame-drill'
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

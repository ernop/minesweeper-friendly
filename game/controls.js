'use strict';

// Board input and page controls: press preview, mouse and keyboard events,
// the new-game shortcut, the game choice (the three presets, the other modes
// menu, the custom board form), and the see-scores button.

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
  if (!cell.revealed && !cell.flagged && !chordGesture) {
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

// Ordinarily the queued timer completes before another human input. If it
// does not, finalize while the just-finished board/config are still intact,
// before that next input can change them.
document.addEventListener('pointerdown', flushPendingResult, true);
document.addEventListener('keydown', flushPendingResult, true);
// A tab hidden or unloaded inside the deferral window must not lose the
// finished game: persist immediately rather than waiting on a frame that
// may never come.
document.addEventListener('visibilitychange', (event) => {
  tracePageEvent(event);
  if (document.visibilityState === 'hidden') {
    flushPendingResult();
    savePlaySpanProgress();
    cancelMetricsUpdate();
  } else if (tracing()) {
    scheduleMetricsUpdate({ elapsed: true });
  }
});
window.addEventListener('pagehide', (event) => {
  tracePageEvent(event);
  flushPendingResult();
  savePlaySpanProgress();
});
window.addEventListener('pageshow', tracePageEvent);
window.addEventListener('focus', tracePageEvent);
window.addEventListener('blur', tracePageEvent);
document.addEventListener('mousedown', traceRightButton, true);
document.addEventListener('mouseup', traceRightButton, true);

//-------CHORDING: LEFT CLICK, BOTH BUTTONS, AND THE 1.5 CLICK-------

// Chording works the way the official game does it and the way this clone
// always has: a left click on a satisfied number, or both buttons held
// together over it. A right press flags at once (the press, not the release),
// so the 1.5 click — right press to flag, keep holding, slide onto the number,
// press left, release — flags and chords in one motion. Once both buttons have
// been down together the gesture is a chord: its left release never reveals.

function joinChordGesture() {
  chordGesture = true;
  if (pendingRightPress !== null) {
    pendingRightPress.logged.chordGesture = true;
    pendingRightPress = null;
  }
}

// A board-changing press: its gap since the previous one counts toward the
// fastclick gap when it is short and made on the move.
function recordUsefulPress() {
  const now = Date.now();
  if (lastUsefulPressAt !== null && now - lastUsefulPressAt <= FASTCLICK_MAX_GAP_MS
      && now - lastCursorMoveAt <= CADENCE_MOVING_WINDOW_MS) {
    fastclickGaps.push(now - lastUsefulPressAt);
  }
  lastUsefulPressAt = now;
}

function recordNoOp(index, reason) {
  wastedClicks++;
  recordActionEvaluation(evaluateNoOpAction(index, reason), 'continued');
}

// A right press on an open cell that ended without a left press joining it
// changed nothing: count it as the no-op it was, at the time it happened.
function settlePendingRightPress() {
  if (pendingRightPress === null) return;
  const { evaluation } = pendingRightPress;
  pendingRightPress = null;
  wastedClicks++;
  recordActionEvaluation(evaluation, 'continued');
}

function flagCell(index) {
  const removing = cells[index].flagged;
  const misclick = flagChangeIsMisclick(index, removing);
  const actionEvaluation = evaluateFlagAction(index, removing);
  toggleFlag(index, actionEvaluation);
  if (misclick) recordMisclick();
  // A removal is still a useful press: it changed the board.
  recordUsefulPress();
  recordActionEvaluation(actionEvaluation, 'continued');
}

function rightPress(event) {
  if (trialBlocksPlay() || boardLabActive() || playLimitBlocksStart()
      || gameState === 'won' || gameState === 'lost') return;
  const index = cellIndexFromEvent(event);
  if (index === null) return;
  // A refused input is never traced, as while a board is closed.
  if (!leftDown && !cells[index].revealed && !cells[index].flagged && flagPlacementBlocked()) {
    showFlagRefused();
    return;
  }
  settlePendingRightPress();
  const logged = traceEvent('rdown', event, index);
  inputActionCount++;
  if (leftDown) {
    logged.chordGesture = true;
    chordGesture = true;
    pressAt(index);
    return;
  }
  if (cells[index].revealed) {
    pendingRightPress = { logged, evaluation: evaluateNoOpAction(index, 'flagged-revealed-cell') };
    return;
  }
  flagCell(index);
}

function chordFromNumber(index) {
  const targets = chordTargets(index);
  if (targets === null) {
    recordNoOp(index, chordUnavailableReason(index));
    return;
  }
  if (proofSearchBlocks(targets, 'chord')) {
    inputActionCount--;
    return;
  }
  const misclick = chordIsMisclick(index, targets);
  if (misclick) recordMisclick();
  recordUsefulPress();
  chord(index);
}

boardElement.addEventListener('mousedown', (event) => {
  if (event.button === 2) {
    rightPress(event);
    return;
  }
  if (event.button !== 0) return;
  if (trialBlocksPlay() || boardLabActive() || playLimitBlocksStart()) return;
  if (gameState === 'won' || gameState === 'lost') return;
  const index = cellIndexFromEvent(event);
  if (index === null) return;
  traceEvent('ldown', event, index);
  leftDown = true;
  if ((event.buttons & 2) !== 0) joinChordGesture();
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
  if (trialBlocksPlay() || boardLabActive() || playLimitBlocksStart()
      || gameState === 'won' || gameState === 'lost') return;
  // Logged before acting so a game-ending click is inside its own trace.
  const logged = traceEvent('lup', event, index);
  inputActionCount++;
  const cell = cells[index];
  if (chordGesture) {
    logged.chordGesture = true;
    if (cell.revealed) chordFromNumber(index);
    else recordNoOp(index, 'chord-over-covered');
    return;
  }
  if (!cell.revealed && !cell.flagged) {
    if (gameState === 'playing' && proofSearchBlocks([index], 'click')) {
      inputActionCount--;
      return;
    }
    clickCount++;
    const misclick = revealIsMisclick(index);
    if (misclick) recordMisclick();
    recordUsefulPress();
    revealCell(index);
  } else if (cell.revealed) {
    chordFromNumber(index);
  } else {
    // Left-clicking a flagged cell does nothing.
    recordNoOp(index, 'left-clicked-flag');
  }
});

document.addEventListener('mouseup', (event) => {
  if (event.button === 2) {
    settlePendingRightPress();
    if (!leftDown) {
      chordGesture = false;
      clearPresses();
    }
    return;
  }
  if (event.button !== 0) return;
  // Releases on a cell were already logged by the board handler above
  // (it runs first on the bubble path); this catches the rest — a press
  // dragged off the cells and released, still a real input event.
  if (leftDown && tracing() && cellIndexFromEvent(event) === null) {
    traceEvent('lup', event, null);
  }
  leftDown = false;
  // Still holding right: the next left press chords again.
  chordGesture = chordGesture && (event.buttons & 2) !== 0;
  clearPresses();
});

document.addEventListener('mousemove', (event) => {
  lastCursorMoveAt = Date.now();
  if (lastMouseX !== null && gameState === 'playing') {
    mousePathPx += Math.hypot(event.clientX - lastMouseX, event.clientY - lastMouseY);
  }
  lastMouseX = event.clientX;
  lastMouseY = event.clientY;
  if (tracing()) traceMove(event);
});

// The right press already acted; the browser menu never opens on the board.
// (Browsers fire contextmenu on the press on Linux and macOS and on the release
// on Windows, which is why flagging does not wait for it.)
boardElement.addEventListener('contextmenu', (event) => {
  event.preventDefault();
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
  placeBoardPositionPanel();
  if (tracing()) recordLayout();
});
window.addEventListener('resize', () => {
  applyBoardPosition();
  if (tracing()) recordLayout();
  syncJusticePlacement();
  placeBoardSides();
  syncResultClearance();
});

function requestNewGame() {
  if (document.documentElement.classList.contains('game-booting')) return;
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

// A focused link is not excluded: Space never activates a link, its default
// only scrolls the page, and a difficulty tab keeps focus after its click.
document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || ['INPUT', 'TEXTAREA', 'BUTTON'].includes(event.target.tagName)) return;
  event.preventDefault();
  requestNewGame();
});

//-------GAME CHOICE (presets, other modes, custom board) AND THE SCORES BUTTON-------

// Beginner, Intermediate, and Expert each choose a whole game: that board,
// Standard, and the default generator, with nothing more to set. Every other
// choice is a mode from the other modes menu, played on the custom board;
// only then does the mode options row appear, holding the board size, the
// generator where the mode uses one, and the mode's own progress.
function syncGameChoice() {
  const custom = settings.difficulty === 'custom';
  for (const tab of difficultyTabs.querySelectorAll('a')) {
    tab.classList.toggle('active', tab.dataset.difficulty === settings.difficulty);
  }
  playModeSelect.value = custom ? settings.playMode : '';
  playModeSelect.classList.toggle('active', custom);
  modeOptions.hidden = !custom;
  boardGeneratorChoice.hidden = !generatorAppliesToMode(settings.playMode);
}

// Every game choice goes through here. Leaving a mode ends what it holds (an
// active trial, the pregen batch) before the next board deals.
function chooseGame(difficulty, playMode) {
  if (playMode !== settings.playMode) {
    if (Trial.isPlayMode(settings.playMode) && trialIsActive()) abandonTrial();
    if (pregenActive() || playMode === 'pregen-10-3bv-desc') pregenBatch = null;
    lastTrialReview = null;
  }
  updateSettings({ difficulty, playMode });
  config = boardFromPreferences();
  syncGameChoice();
  newGame();
}

for (const tab of difficultyTabs.querySelectorAll('a')) {
  tab.addEventListener('click', (event) => {
    event.preventDefault();
    chooseGame(tab.dataset.difficulty, 'standard');
  });
}

document.getElementById('see-scores-btn').addEventListener('click', showScoresForCurrentMode);

customForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const width = Math.max(8, Math.min(100, Number(document.getElementById('custom-width').value)));
  const height = Math.max(1, Math.min(100, Number(document.getElementById('custom-height').value)));
  // Classic winmine constraint: mines fit with at least a 3x3 opening's worth of space.
  const maxMines = Math.max(1, (width - 1) * (height - 1));
  const mines = Math.max(1, Math.min(maxMines, Number(document.getElementById('custom-mines').value)));
  document.getElementById('custom-width').value = width;
  document.getElementById('custom-height').value = height;
  document.getElementById('custom-mines').value = mines;
  config = { width, height, mines };
  rememberCustomBoard();
  newGame();
});

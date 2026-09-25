'use strict';

// Board input and page controls: press preview, mouse and keyboard events,
// the new-game shortcut, difficulty tabs, the custom board form, and the
// see-scores button.

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

// Ordinarily the queued timer completes before another human input. If it
// does not, finalize while the just-finished board/config are still intact,
// before that next input can change them.
document.addEventListener('pointerdown', flushPendingResult, true);
document.addEventListener('keydown', flushPendingResult, true);
// A tab hidden or unloaded inside the deferral window must not lose the
// finished game: persist immediately rather than waiting on a frame that
// may never come.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    flushPendingResult();
    cancelMetricsUpdate();
  } else if (settings !== null) {
    scheduleMetricsUpdate({ elapsed: tracing(), session: true });
  }
});
window.addEventListener('pagehide', flushPendingResult);

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
    scheduleMetricsUpdate({ trace: true });
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
  if (!toggleFlag(index, actionEvaluation)) {
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
  placeBoardPositionPanel();
  if (tracing()) recordLayout();
});
window.addEventListener('resize', () => {
  applyBoardPosition();
  if (tracing()) recordLayout();
  syncJusticePlacement();
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

document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || ['INPUT', 'TEXTAREA', 'BUTTON', 'A'].includes(event.target.tagName)) return;
  event.preventDefault();
  requestNewGame();
});

//-------DIFFICULTY TABS, CUSTOM BOARD, AND THE SCORES BUTTON-------

function syncDifficultyTabs() {
  const matched = settings.difficulty;
  for (const tab of document.querySelectorAll('#difficulty-tabs a')) {
    tab.classList.toggle('active', tab.dataset.difficulty === matched);
  }
  customForm.hidden = matched !== 'custom' || boardLabActive();
}

for (const tab of document.querySelectorAll('#difficulty-tabs a')) {
  tab.addEventListener('click', (event) => {
    event.preventDefault();
    for (const t of document.querySelectorAll('#difficulty-tabs a')) t.classList.remove('active');
    tab.classList.add('active');
    const name = tab.dataset.difficulty;
    updateSettings({ difficulty: name });
    if (name === 'custom') {
      config = { ...settings.customBoard };
      // In the Board lab the sliders are the custom control; the form
      // stays hidden and the current size simply remains.
      if (!boardLabActive()) {
        customForm.hidden = false;
        customForm.requestSubmit();
      } else {
        newGame();
      }
    } else {
      customForm.hidden = true;
      config = { ...DIFFICULTIES[name] };
      newGame();
    }
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
  syncDifficultyTabs();
  newGame();
});

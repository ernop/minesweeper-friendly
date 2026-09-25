'use strict';

// The schema owns values; this module binds them to game controls. Restoring
// the UI never counts as an edit, and unavailable controls keep their choices.
let preferenceUIReady = false;
let restoringPreferenceView = false;
let preferenceScrollTimer = null;
let restoredAnalysisReady = Promise.resolve();
let waitingForRestoredLayout = false;

function rememberPreference(field, value) {
  if (!preferenceUIReady || restoringPreferenceView) return;
  if (JSON.stringify(settings[field]) !== JSON.stringify(value)) updateSettings({ [field]: value });
}

function rememberPanel(key, open) {
  rememberPreference('panels', { ...settings.panels, [key]: open });
}

function boardFromPreferences() {
  return { ...(settings.difficulty === 'custom' ? settings.customBoard : DIFFICULTIES[settings.difficulty]) };
}

function rememberCustomBoard() {
  updateSettings({ difficulty: 'custom', customBoard: { ...config },
    customBoardDraft: Object.fromEntries(Object.entries(config).map(([k, v]) => [k, String(v)])) });
}

function bindTrialSection(element, key, initiallyOpen) {
  element.open = Object.hasOwn(settings.trialSections, key) ? settings.trialSections[key] : initiallyOpen;
  element.addEventListener('toggle', () => {
    if (!element.isConnected) return;
    rememberPreference('trialSections', { ...settings.trialSections, [key]: element.open });
  });
}

function syncReviewPreferences() {
  if (!pathViewAvailable()) return;
  replayReview.open = settings.panels.replay;
  const options = document.getElementById('review-options');
  if (settings.panels.reviewOptions && !options.matches(':popover-open')) options.showPopover();
}

function flushViewPosition() {
  clearTimeout(preferenceScrollTimer);
  preferenceScrollTimer = null;
  if (!preferenceUIReady || restoringPreferenceView || waitingForRestoredLayout) return;
  const active = document.activeElement;
  rememberPreference('viewPosition', {
    pageX: Math.max(0, window.scrollX), pageY: Math.max(0, window.scrollY),
    metricsX: Math.max(0, metricsPanelContent.scrollLeft),
    metricsY: Math.max(0, metricsPanelContent.scrollTop),
    focusId: active && active.id ? active.id : null,
  });
}

function initGamePreferences() {
  restoringPreferenceView = true;
  const saved = structuredClone(settings.viewPosition);
  setBoardPositionEditing(settings.panels.boardPosition);
  setStatesMenuOpen(settings.panels.states);
  importPanel.hidden = !settings.panels.importHistory;
  formatPanel.hidden = !settings.panels.dataFormat;
  replayReview.open = settings.panels.replay;
  document.getElementById('review-display').open = settings.panels.reviewDisplay;
  importText.value = settings.drafts.historyImport;
  statesAddInput.value = settings.drafts.stateName;
  if (settings.panels.gameDetails && pageLayout.classList.contains('compact-sidebar')) gameSidebar.showPopover();
  syncReviewPreferences();

  const reviewDisplay = document.getElementById('review-display');
  reviewDisplay.addEventListener('toggle', () => rememberPanel('reviewDisplay', reviewDisplay.open));
  for (const [element, key] of [[gameSidebar, 'gameDetails'], [document.getElementById('review-options'), 'reviewOptions']]) {
    element.addEventListener('toggle', () => {
      if (key === 'gameDetails' && !pageLayout.classList.contains('compact-sidebar')) return;
      if (key === 'reviewOptions' && !pathViewAvailable()) return;
      rememberPanel(key, element.matches(':popover-open'));
    });
  }
  for (const [element, field] of [[statesAddInput, 'stateName'], [importText, 'historyImport']]) {
    element.addEventListener('input', () => rememberPreference('drafts', { ...settings.drafts, [field]: element.value }));
  }
  for (const field of ['width', 'height', 'mines']) {
    const element = document.getElementById('custom-' + field);
    element.addEventListener('input', () => rememberPreference('customBoardDraft', { ...settings.customBoardDraft, [field]: element.value }));
  }
  const queueScroll = () => {
    if (!preferenceUIReady || restoringPreferenceView) return;
    clearTimeout(preferenceScrollTimer);
    preferenceScrollTimer = setTimeout(flushViewPosition, 150);
  };
  window.addEventListener('scroll', queueScroll, { passive: true });
  metricsPanelContent.addEventListener('scroll', queueScroll, { passive: true });
  document.addEventListener('focusin', queueScroll);
  window.addEventListener('pagehide', flushViewPosition);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushViewPosition(); });
  // Controls become available after their own layout. A saved report can
  // finish later; restore its scroll only if the player has not interacted.
  waitingForRestoredLayout = true;
  const inputEvents = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
  const cancelSavedScroll = () => {
    waitingForRestoredLayout = false;
    for (const name of inputEvents) document.removeEventListener(name, cancelSavedScroll, true);
  };
  for (const name of inputEvents) document.addEventListener(name, cancelSavedScroll, { capture: true, passive: true });
  const restoreScroll = () => {
    const focused = saved.focusId === null ? null : document.getElementById(saved.focusId);
    if (focused && focused.checkVisibility()) focused.focus({ preventScroll: true });
    metricsPanelContent.scrollLeft = saved.metricsX;
    metricsPanelContent.scrollTop = saved.metricsY;
    window.scrollTo(saved.pageX, saved.pageY);
  };
  restoredAnalysisReady.then(() => new Promise(requestAnimationFrame)).then(() => {
    if (waitingForRestoredLayout) restoreScroll();
    cancelSavedScroll();
  }).catch(analysisFailure);
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
    restoringPreferenceView = false;
    preferenceUIReady = true;
    resolve();
  })));

}

function rememberReplayPosition() {
  if (!pathViewAvailable() || !renderedResult) return;
  rememberPreference('replayPosition', { endedAt: renderedResult.record.endedAt, step: replayStep });
}

async function restorePreferredResult() {
  if (settings.resultView === 'scores') {
    restoredAnalysisReady = Promise.resolve(showScoresForCurrentMode());
    return;
  }
  const endedAt = settings.replayPosition.endedAt;
  if (endedAt === null || trialIsActive() || boardLabActive()) return;
  const modeRecords = history[modeKey()] || [];
  const record = modeRecords.find((r) => r.endedAt === endedAt);
  if (!record) {
    backupStatus.textContent = 'Saved replay is not present in this game history.';
    return;
  }
  const stored = await new Promise((resolve, reject) => {
    const request = db.transaction(TRACE_STORE).objectStore(TRACE_STORE).get(endedAt);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (!stored || !stored.finalBoard) {
    backupStatus.textContent = 'Saved game has no completed-board replay snapshot.';
    return;
  }
  clearInterval(timerInterval);
  timerInterval = null;
  cells = structuredClone(stored.finalBoard.cells);
  gameState = record.outcome === 'win' ? 'won' : 'lost';
  finalTimeMs = record.timeMs;
  gameSeed = record.seed;
  gameGenerator = record.generator || BoardGenerators.uniformGenerator();
  flagsCount = cells.filter((c) => c.flagged).length;
  revealedCount = cells.filter((c) => c.revealed).length;
  trace = { startedAt: stored.startedAt, t0: performance.now() - (stored.endedAt - stored.startedAt),
    t: Array.from(stored.sampleT), x: Array.from(stored.sampleX), y: Array.from(stored.sampleY), events: stored.events };
  for (let i = 0; i < cells.length; i++) {
    updateCell(i);
    if (gameState === 'lost' && cells[i].mine && !cells[i].flagged) {
      cellElements[i].className = 'cell revealed';
      cellElements[i].innerHTML = MINE_SVG;
    } else if (gameState === 'lost' && !cells[i].mine && cells[i].flagged) {
      cellElements[i].className = 'cell revealed';
      cellElements[i].innerHTML = WRONG_FLAG_SVG;
    }
  }
  for (const i of stored.finalBoard.hitIndices) {
    cellElements[i].className = 'cell revealed mine-hit';
    cellElements[i].innerHTML = MINE_SVG;
  }
  setFace(gameState === 'won' ? 'cool' : 'dead');
  setLcd(timerDisplay, Math.min(TIMER_CAP_SECONDS, Math.floor(record.timeMs / 1000)));
  setLcd(mineCounter, gameState === 'won' ? 0 : config.mines - flagsCount);
  beginTraceMetricsSeries();
  const restoredTrace = trace;
  const revision = resultViewRevision;
  renderImmediateGameEnd(record.outcome, record.endedAt);
  renderedResult = { record, modeRecords, options: {} };
  const key = modeKey();
  const needBoardMetrics = record.playMode !== 'endgame-drill' && !hasBoardMeasurements(record);
  const needZini = record.playMode !== 'endgame-drill' && record.zini === undefined;
  const boardState = { status: 'running' };
  if (needBoardMetrics || needZini) boardMetricJobs.set(record, boardState);
  restoredAnalysisReady = analysisTask('reports', 'restore-trace', { ...stored,
    measurementPlan: { width: config.width, height: config.height, mines: cells.map((cell) => cell.mine),
      drill: record.playMode === 'endgame-drill', needBoardMetrics, needZini,
      needCadence: record.cadenceSpread === undefined },
  }).then(async (restored) => {
    if (Object.keys(restored.measurements).length) {
      Object.assign(record, restored.measurements);
      if (history[key]?.includes(record)) persistUserdata('history', history);
    }
    boardState.status = 'done';
    if (trace !== restoredTrace || revision !== resultViewRevision) return;
    metricsSeries = restored.series;
    finalMotion = { metrics: restored.metrics, series: metricsSeries, spatial: restored.spatial };
    renderMetricsPanel(null);
    await renderResult(record, modeRecords);
  });
  restoredAnalysisReady.catch((error) => {
    boardState.status = 'error'; boardState.error = error.message;
    analysisFailure(error);
  });
  replayStep = Math.min(settings.replayPosition.step, replayDecisionCount());
  replayEnabled = settings.panels.replay && replayStep < replayDecisionCount();
  renderPathView();
  if (replayEnabled) scheduleReplayPrecompute();
}

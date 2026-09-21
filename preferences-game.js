'use strict';

// The schema owns values; this module binds them to game controls. Restoring
// the UI never counts as an edit, and unavailable controls keep their choices.
let preferenceUIReady = false;
let restoringPreferenceView = false;
let preferenceScrollTimer = null;

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
  if (!preferenceUIReady || restoringPreferenceView) return;
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
  // Wait for initial layout, including restored reports and panels, before
  // applying scroll. Capturing earlier would overwrite the saved offsets.
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
    const focused = saved.focusId === null ? null : document.getElementById(saved.focusId);
    if (focused && focused.checkVisibility()) focused.focus({ preventScroll: true });
    metricsPanelContent.scrollLeft = saved.metricsX;
    metricsPanelContent.scrollTop = saved.metricsY;
    window.scrollTo(saved.pageX, saved.pageY);
    requestAnimationFrame(() => {
      restoringPreferenceView = false;
      preferenceUIReady = true;
      resolve();
    });
  })));
}

function rememberReplayPosition() {
  if (!pathViewAvailable() || !renderedResult) return;
  rememberPreference('replayPosition', { endedAt: renderedResult.record.endedAt, step: replayStep });
}

async function restorePreferredResult() {
  if (settings.resultView === 'scores') {
    showScoresForCurrentMode();
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
  let restoredSamples = 0;
  for (const at of stored.metricSampleTimes) {
    const end = trace.t.findIndex((t) => t > at);
    const count = end < 0 ? trace.t.length : end;
    appendTraceMetricsSeries(computeAllTraceMetrics(
      trace.t.slice(0, count), trace.x.slice(0, count), trace.y.slice(0, count),
      trace.events.filter((event) => event.t <= at), at));
    if (++restoredSamples % 10 === 0) await new Promise(requestAnimationFrame);
  }
  finalMotion = {
    metrics: computeAllTraceMetrics(trace.t, trace.x, trace.y, trace.events, stored.endedAt - stored.startedAt),
    series: metricsSeries, spatial: computeSpatialBias(trace.events),
  };
  renderMetricsPanel(null);
  renderResult(record, modeRecords);
  replayStep = Math.min(settings.replayPosition.step, replayDecisionCount());
  replayEnabled = settings.panels.replay && replayStep < replayDecisionCount();
  renderPathView();
  if (replayEnabled) scheduleReplayPrecompute();
}

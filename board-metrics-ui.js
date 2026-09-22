'use strict';

// Results belong to the captured record, never the game active at worker reply.
const boardMetricJobs = new WeakMap();
const boardMetricQueue = [];
let boardMetricWorkerBusy = false;
let boardMetricJobId = 0;
const boardMetricBackfills = new Set();

function boardMetricHistoryKey(record) {
  return Object.keys(history || {}).find((key) => history[key].includes(record));
}

function hasBoardMeasurements(record) {
  return record.boardMetrics?.version === BoardMetrics.VERSION
    && Number.isFinite(record.boardMetrics.workSpread) && Number.isSafeInteger(record.hzini)
    && BoardMetrics.hasFractions(record.boardMetrics);
}

function eligibleBoardWins(key) {
  return (history[key] || []).filter((record) => record.outcome === 'win'
    && record.playMode !== 'endgame-drill'
    && (!record.boardMetrics || record.boardMetrics.version === BoardMetrics.VERSION));
}

function unmeasuredBoardWins(key) {
  return eligibleBoardWins(key).filter((record) => !hasBoardMeasurements(record)
    && !boardMetricJobs.has(record));
}

// Completed records are the source of truth, so reload/resume needs no saved
// cursor or all-or-nothing batch commit. Missing traces remain unmeasured.
function boardMetricBackfillProgress(key) {
  const wins = eligibleBoardWins(key);
  const progress = { total: wins.length, measured: 0, unavailable: 0, failed: 0, active: 0 };
  for (const record of wins) {
    const state = boardMetricJobs.get(record);
    if (hasBoardMeasurements(record)) progress.measured++;
    else if (state?.status === 'unavailable') progress.unavailable++;
    else if (state?.status === 'error') progress.failed++;
    else if (state && ['loading', 'running'].includes(state.status)) progress.active++;
  }
  progress.checked = progress.measured + progress.unavailable + progress.failed;
  progress.remaining = progress.total - progress.checked;
  return progress;
}

function continueBoardMetricBackfill(key) {
  if (!boardMetricBackfills.has(key)) return;
  // At most one backfill job per mode is in flight, even when a foreground
  // result completes while an older trace is being loaded.
  if ((history[key] || []).some((record) => {
    const state = boardMetricJobs.get(record);
    return state && ['loading', 'running'].includes(state.status);
  })) return;
  const next = unmeasuredBoardWins(key)[0];
  if (next) requestBoardMetrics(next);
  else boardMetricBackfills.delete(key);
}

function refreshBoardMetricView(record) {
  if (renderedResult === null || !renderedResult.modeRecords.includes(record)) return;
  const { record: shown, modeRecords, options } = renderedResult;
  const x = window.scrollX, y = window.scrollY;
  renderResult(shown, modeRecords, options);
  window.scrollTo(x, y);
}

function runBoardMetricQueue() {
  if (boardMetricWorkerBusy || !boardMetricQueue.length) return;
  const job = boardMetricQueue.shift();
  boardMetricWorkerBusy = true;
  let worker;
  let finished = false;
  const finish = (result, error) => {
    if (finished) return;
    finished = true;
    if (worker) worker.terminate();
    if (result) {
      // Preserve previously recorded research measurements in exports, but
      // only the selected board characteristics drive the live display.
      job.record.boardMetrics = { ...job.record.boardMetrics, ...result.boardMetrics };
      job.record.hzini = result.hzini;
      job.state.status = 'done';
      if (history[job.key] && history[job.key].includes(job.record)) persistUserdata('history', history);
    } else {
      job.state.status = 'error'; job.state.error = error;
    }
    boardMetricWorkerBusy = false;
    continueBoardMetricBackfill(job.key);
    refreshBoardMetricView(job.record);
    runBoardMetricQueue();
  };
  try {
    worker = new Worker('board-metrics-worker.js?v=20260921-visible-zero-one');
    worker.onmessage = ({ data }) => {
      if (data.id === job.id) finish(data.result, data.error);
    };
    worker.onerror = (event) => { event.preventDefault(); finish(null, event.message); };
    worker.postMessage({ id: job.id, ...job.board });
  } catch (error) { finish(null, error.message); }
}

function requestBoardMetrics(record, snapshot) {
  if (record.playMode === 'endgame-drill') return;
  const previous = boardMetricJobs.get(record);
  if (previous || hasBoardMeasurements(record)
      || (record.boardMetrics && record.boardMetrics.version !== BoardMetrics.VERSION)) return;
  const key = boardMetricHistoryKey(record);
  if (!key) return; // RAM-only renderer fixtures never write or read history.
  const shape = /^(\d+)x(\d+)\//.exec(key);
  if (!shape) return;
  const state = { status: 'loading' };
  boardMetricJobs.set(record, state);
  const enqueue = (saved) => {
    if (!saved || saved.width * saved.height !== saved.mines.length) {
      state.status = 'unavailable'; continueBoardMetricBackfill(key);
      refreshBoardMetricView(record); return;
    }
    state.status = 'running';
    boardMetricQueue.push({ id: ++boardMetricJobId, record, key, state, board: saved });
    runBoardMetricQueue();
  };
  if (snapshot) { enqueue(snapshot); return; }
  if (db === null) { state.status = 'unavailable'; return; }
  const request = db.transaction(TRACE_STORE).objectStore(TRACE_STORE).get(record.endedAt);
  request.onsuccess = () => {
    const stored = request.result;
    const saved = stored && stored.mode === key && stored.finalBoard?.cells;
    enqueue(saved ? { width: Number(shape[1]), height: Number(shape[2]),
      mines: saved.map((cell) => cell.mine) } : null);
  };
  request.onerror = () => {
    state.status = 'error'; state.error = 'Could not read the saved board.';
    continueBoardMetricBackfill(key);
    refreshBoardMetricView(record);
  };
}

function buildBoardMetricStatus(record) {
  if (record.playMode === 'endgame-drill') return null;
  const box = document.createElement('div');
  box.className = 'board-metric-status';
  const job = boardMetricJobs.get(record);
  if (job && ['running', 'loading', 'unavailable'].includes(job.status)) {
    const status = document.createElement('div');
    status.setAttribute('role', 'status');
    status.textContent = job.status === 'unavailable'
      ? 'Saved board unavailable for new measurements.' : 'Calculating board measurements…';
    box.appendChild(status);
  }
  if (job?.status === 'error') {
    const error = document.createElement('div');
    error.setAttribute('role', 'alert');
    error.textContent = 'Board measurement failed: ' + job.error;
    box.appendChild(error);
  }
  const key = boardMetricHistoryKey(record);
  if (settings.shownThings.boardMetricFacts && key && eligibleBoardWins(key).length) {
    const progress = boardMetricBackfillProgress(key);
    const running = boardMetricBackfills.has(key);
    const count = unmeasuredBoardWins(key).length;
    if (count || running || progress.active) {
      const panel = document.createElement('div');
      panel.className = 'board-metric-backfill-panel';
      const meter = document.createElement('progress');
      meter.max = progress.total; meter.value = progress.checked;
      meter.setAttribute('aria-label', 'Saved wins checked for board measurements');
      const summary = document.createElement('span');
      summary.className = 'board-metric-backfill-summary';
      summary.setAttribute('aria-live', 'polite');
      summary.textContent = progress.checked + '/' + progress.total + ' checked · '
        + progress.measured + ' measured'
        + (progress.unavailable ? ' · ' + progress.unavailable
          + (progress.unavailable === 1 ? ' saved board unavailable' : ' saved boards unavailable') : '')
        + (progress.failed ? ' · ' + progress.failed + ' failed' : '')
        + (progress.remaining ? ' · ' + progress.remaining + ' remaining' : ' · complete');
      const status = document.createElement('span');
      status.className = 'board-metric-backfill-status';
      status.textContent = running ? 'Calculating…'
        : progress.active ? 'Finishing current board…'
        : progress.remaining && progress.checked ? 'Paused' : '';
      panel.append(meter, summary, status);
      panel.title = 'Each completed win is saved and immediately joins its rank tables. Resume, including after a reload, calculates only missing measurements, including the corrected visible 0–1 count. Counts cover full-board wins with supported measurement versions in the current mode. Unavailable saved boards stay unmeasured.';
      if (count || running) {
        const button = document.createElement('button');
        button.className = 'board-metric-backfill';
        button.type = 'button';
        button.textContent = running ? 'Stop backfill'
          : (progress.checked ? 'Resume backfill (' : 'Backfill saved wins (') + count + ')';
        button.title = 'Calculate missing board characteristics, including corrected visible 0–1 counts, from saved final-board traces. Stopping saves the current board and pauses before the next.';
        button.addEventListener('click', () => {
          if (boardMetricBackfills.has(key)) boardMetricBackfills.delete(key);
          else { boardMetricBackfills.add(key); continueBoardMetricBackfill(key); }
          refreshBoardMetricView(record);
        });
        panel.appendChild(button);
      }
      box.appendChild(panel);
    }
    if (progress.failed) {
      const error = document.createElement('div');
      error.className = 'board-metric-backfill-error';
      error.setAttribute('role', 'alert');
      const messages = eligibleBoardWins(key).map((r) => boardMetricJobs.get(r))
        .filter((state) => state?.status === 'error').map((state) => state.error);
      error.textContent = 'Backfill failed: ' + [...new Set(messages)].join('; ');
      box.appendChild(error);
    }
  }
  return box.childElementCount ? box : null;
}

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
    worker = new Worker('board-metrics-worker.js?v=20260921-board-fractions');
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

function buildBoardMetricFacts(record) {
  if (record.playMode === 'endgame-drill') return null;
  const box = document.createElement('div');
  box.className = 'board-metric-facts';
  const metrics = record.boardMetrics?.version === BoardMetrics.VERSION ? record.boardMetrics : null;
  const job = boardMetricJobs.get(record);
  const pending = job && ['running', 'loading'].includes(job.status);
  const missing = pending ? 'Calculating…'
    : job?.status === 'unavailable' ? 'Saved board unavailable'
    : job?.status === 'error' ? 'Calculation failed: ' + job.error : 'Not measured';
  const add = (label, value, help, extra) => {
    const item = document.createElement('div');
    item.className = 'board-metric-fact';
    const heading = document.createElement('h4');
    heading.appendChild(chartHelpButton(help, label));
    const number = document.createElement('div');
    number.className = 'board-metric-value'; number.textContent = value;
    item.append(heading, number);
    if (extra) {
      const detail = document.createElement('div');
      detail.className = 'board-metric-detail'; detail.textContent = extra;
      item.appendChild(detail);
    }
    box.appendChild(item);
    return item;
  };
  const hzini = record.hzini;
  add('HZiNi', Number.isSafeInteger(hzini) ? hzini + ' clicks' : missing, [
    'Human ZiNi is the action count of a fixed opening-first solve with full board knowledge. The same oriented board always gives the same integer.',
    'Open each zero region once. Then choose the revealed clue with the greatest nonnegative saving: covered safe neighbors minus unflagged mine neighbors minus one chord. Flag its missing mines and chord it. If none qualifies, reveal the next safe cell. Ties and direct reveals scan down columns, left to right.',
    'Each reveal, flag placement, and chord counts once. This measures that procedure, rather than the global minimum over all possible procedures. The HZiNi table ranks your times on boards with the same count.',
  ]);
  add('3BV spread', metrics ? metrics.workSpread.toFixed(3) + ' cells' : missing, [
    'How spread out the board’s 3BV work is, measured in cell widths. Larger values mean the work points are more widely spread.',
    'Each zero region contributes one point at the mean position of its zero squares. Each safe square outside all zero openings contributes its own center. All points have equal weight. The value is the root-mean-square distance of these points from their mean position.',
    'The time table compares boards in the same 0.5-cell band. The displayed board value is a single measurement; the table band groups nearby measurements.',
  ]);
  for (const [field, label, help] of [
    ['zeroOneCells', '0–1 share', 'The fraction of all safe squares whose clue is zero or one. Blank zero squares count; mines do not. The time table compares exactly the same fraction, before display rounding.'],
    ['zeroOpenedCells', 'zero-opening coverage', 'The fraction of all safe squares exposed after opening every zero region, including bordering numbers of any value. Shared borders count once. This stops after automatic flooding, before deductions or chords. With no zeros the coverage is 0%. The time table compares exactly the same fraction, before display rounding.'],
  ]) {
    const fraction = boardFractionOf(record, field);
    add(label, fraction === undefined ? missing : formatBoardShare(fraction), help,
      fraction === undefined ? null : metrics[field] + ' of ' + metrics.safeCells + ' safe cells');
  }
  if (job?.status === 'error') {
    const error = document.createElement('div');
    error.setAttribute('role', 'alert');
    error.textContent = 'Board measurement failed: ' + job.error;
    box.appendChild(error);
  }
  const key = boardMetricHistoryKey(record);
  if (key && eligibleBoardWins(key).length) {
    const progress = boardMetricBackfillProgress(key);
    const running = boardMetricBackfills.has(key);
    const count = unmeasuredBoardWins(key).length;
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
    panel.title = 'Each completed win is saved and immediately joins its rank tables. Resume, including after a reload, calculates only missing measurements. Counts cover full-board wins with supported measurement versions in the current mode. Unavailable saved boards stay unmeasured.';
    if (count || running) {
      const button = document.createElement('button');
      button.className = 'board-metric-backfill';
      button.type = 'button';
      button.textContent = running ? 'Stop backfill'
        : (progress.checked ? 'Resume backfill (' : 'Backfill saved wins (') + count + ')';
      button.title = 'Calculate missing board characteristics from saved final-board traces. Stopping saves the current board and pauses before the next.';
      button.addEventListener('click', () => {
        if (boardMetricBackfills.has(key)) boardMetricBackfills.delete(key);
        else { boardMetricBackfills.add(key); continueBoardMetricBackfill(key); }
        refreshBoardMetricView(record);
      });
      panel.appendChild(button);
    }
    if (progress.failed) {
      const error = document.createElement('div');
      error.className = 'board-metric-backfill-error';
      error.setAttribute('role', 'alert');
      const messages = eligibleBoardWins(key).map((r) => boardMetricJobs.get(r))
        .filter((state) => state?.status === 'error').map((state) => state.error);
      error.textContent = 'Backfill failed: ' + [...new Set(messages)].join('; ');
      panel.appendChild(error);
    }
    box.appendChild(panel);
  }
  return box;
}

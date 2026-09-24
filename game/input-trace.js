'use strict';

// The raw input trace: each game's cursor samples, button events, and board
// layout, saved per game as the measurement ground truth.

//-------RAW INPUT TRACE (full per-game cursor and click stream)-------

// Decided 2026-08-20 (docs/product/storage-and-history.md "Raw input
// traces"): every finished game keeps its complete input stream — cursor
// samples, button events, board geometry — as the ground truth behind all
// motion metrics. Scalar record
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
  scheduleMetricsUpdate({ trace: true });
}

// The board also moves when content around it appears or disappears —
// the metrics panel showing, hiding, collapsing, or being drag-resized
// shifts the centered column — and no scroll, resize, or zoom event
// fires then. Rather than enumerating movers, the recorder compares the
// live rect to the last recorded one wherever the trace is already
// touched: before every button event (clicks always map exactly) and after
// ResizeObserver schedules a layout pass for a real geometry change.
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
  scheduleMetricsUpdate({ trace: true });
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
  scheduleMetricsUpdate({ trace: true });
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
    metricSampleTimes: metricsSeries.tMs,
    finalBoard: { cells: structuredClone(cells), hitIndices: cellElements.flatMap((el, i) => el.classList.contains('mine-hit') ? [i] : []) },
    sampleT: Float64Array.from(trace.t),
    sampleX: Float32Array.from(trace.x),
    sampleY: Float32Array.from(trace.y),
    events: trace.events,
  };
  const tx = db.transaction(TRACE_STORE, 'readwrite');
  tx.objectStore(TRACE_STORE).put(stored);
  tx.oncomplete = () => boardMetricSourcesChanged(stored.mode);
  tx.onerror = () => storageFailure('trace save failed: ' + tx.error);
}

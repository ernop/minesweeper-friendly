'use strict';

// The raw input trace: each game's cursor samples, button events, and board
// layout, saved per game as the measurement ground truth.

//-------RAW INPUT TRACE (full per-game cursor and click stream)-------

// Decided 2026-08-20 (docs/product/storage-and-history.md "Raw input
// traces"): every finished game keeps its sampled input stream — cursor
// samples, button events, board geometry — as the ground truth behind all
// motion metrics. Scalar record
// fields summarize; the trace is what lets any future metric be computed
// over past games too. Traces live in their own store, keyed by endedAt
// exactly like the history records; only the active trace stays in RAM.
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
    sourceT: [], sampleTrusted: [],
    t: [], x: [], y: [],
    mergedSample: [], mergedX: [], mergedY: [], mergedSourceT: [], mergedTrusted: [],
    initialPageState: tracePageState(),
    environment: observedEnvironment(),
    events: [],
  };
  recordLayout();
  // Fresh series and an immediate first sample: the previous game's final
  // values and sparklines must not stay over a running trace.
  beginTraceMetricsSeries();
  renderLiveTraceMetrics();
}

// trace is null between script load and the first newGame() (init() awaits
// IndexedDB first), and gameState is born 'ready' — so a mousemove in that
// window must not count as tracing.
function tracing() {
  return trace !== null && (gameState === 'ready' || gameState === 'playing');
}

// Event.timeStamp is browser event creation time, not a hardware timestamp.
// Keep it separate from handler receipt time, including negative source times
// when an event was created before this trace began and delivered afterwards.
function traceEventSource(event) {
  if (!Number.isFinite(event.timeStamp)) {
    throw new Error('Input trace: invalid timestamp for ' + event.type);
  }
  return {
    sourceT: event.timeStamp - trace.t0,
    sourceType: event.type,
    isTrusted: event.isTrusted,
  };
}

function tracePageState() {
  return { visibilityState: document.visibilityState, hasFocus: document.hasFocus() };
}

function tracePageEvent(event) {
  if (!tracing()) return;
  trace.events.push({
    t: performance.now() - trace.t0,
    kind: 'page-state',
    ...traceEventSource(event),
    ...tracePageState(),
    ...((event.type === 'pagehide' || event.type === 'pageshow')
      ? { persisted: event.persisted } : {}),
  });
}

// Since 2026-09-26 the action stream's rdown is the board's right press itself
// (earlier it was the context-menu event, which Windows fires on release).
// These independently observed transitions still record every physical right
// press and release, on the board or off it.
function traceRightButton(event) {
  if (!tracing() || event.button !== 2) return;
  recordLayoutIfMoved();
  const t = performance.now() - trace.t0;
  trace.events.push({
    t, kind: event.type === 'mousedown' ? 'right-button-down' : 'right-button-up',
    ...traceEventSource(event),
    x: event.clientX, y: event.clientY,
    buttons: event.buttons,
    index: cellIndexFromEvent(event),
  });
}

function liveMergedObservations() {
  return { sample: trace.mergedSample, x: trace.mergedX, y: trace.mergedY };
}

function traceMove(event) {
  const t = performance.now() - trace.t0;
  const source = traceEventSource(event);
  // At the precision saveTrace stores (Float32Array), so the live charts,
  // the record's path, and a restored trace all add the same coordinates.
  const x = Math.fround(event.clientX);
  const y = Math.fround(event.clientY);
  const last = trace.t.length - 1;
  if (last >= 0 && trace.t[last] === t) {
    // Samples need strictly increasing receipt times, so the latest of the
    // observations received at one instant is the sample. The ones it
    // replaces are kept beside the samples, in order, with the sample's
    // index: the cursor traveled through them (sampleTravelPx).
    trace.mergedSample.push(last);
    trace.mergedX.push(trace.x[last]);
    trace.mergedY.push(trace.y[last]);
    trace.mergedSourceT.push(trace.sourceT[last]);
    trace.mergedTrusted.push(trace.sampleTrusted[last]);
    trace.x[last] = x;
    trace.y[last] = y;
    trace.sourceT[last] = source.sourceT;
    trace.sampleTrusted[last] = source.isTrusted;
  } else {
    trace.t.push(t);
    trace.x.push(x);
    trace.y.push(y);
    trace.sourceT.push(source.sourceT);
    trace.sampleTrusted.push(source.isTrusted);
  }
  scheduleMetricsUpdate({ trace: true });
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
// a docked column or the mode options row showing or hiding — and no
// scroll, resize, or zoom event fires then. Rather than enumerating movers, the recorder compares the
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
// 'rdown' is the right press, which flags a covered cell. `chordGesture: true`
// marks a right press that was part of a both-button chord and the left
// release that attempted that chord (game/controls.js); such a release never
// reveals. Returns the logged event.
function traceEvent(kind, event, index) {
  recordLayoutIfMoved();
  const logged = {
    t: performance.now() - trace.t0,
    atMs: gameState === 'playing' ? elapsedMs() : 0,
    kind: kind,
    ...traceEventSource(event),
    buttons: event.buttons,
    x: event.clientX,
    y: event.clientY,
    index: index,
  };
  trace.events.push(logged);
  scheduleMetricsUpdate({ trace: true });
  return logged;
}

// The input an accepted board action answers: the latest release or right
// press on a cell.
function latestBoardInput() {
  for (let i = trace.events.length - 1; i >= 0; i--) {
    const event = trace.events[i];
    if ((event.kind === 'lup' || event.kind === 'rdown') && event.index !== null) return event;
  }
  throw new Error('accepted board action has no input trace event');
}

// Every accepted board action gets one exact pre-action player view and the
// choices measured from it. This belongs in the raw trace: it is the durable
// time-aligned source for replay and later decision analysis, while the game
// record keeps only the reportable mistake subset.
function traceDecision(evaluation) {
  if (!tracing()) return;
  const input = latestBoardInput();
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

// Capture version 2 (2026-10-26) saves each decision's board and square
// lists as strings (positionNumbers in game/evaluation.js). Version 3
// (2026-10-27) keeps the cursor observations a sample replaced (`merged*`)
// in place of how many it replaced (`sampleMergeCount`).
const TRACE_CAPTURE_VERSION = 3;

// Traces saved before capture version 2 keep their decisions' boards and
// square lists as arrays. Temporary, with stringFormatEvaluation (BACKLOG.md,
// "Board strings: step 2").
function stringFormatTraceEvents(stored) {
  if (stored.captureVersion >= 2) return stored.events;
  return stored.events.map((event) => event.kind === 'decision'
    ? { ...event, evaluation: stringFormatEvaluation(event.evaluation) } : event);
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
    captureVersion: TRACE_CAPTURE_VERSION,
    clock: { timeOriginMs: performance.timeOrigin, traceStartMs: trace.t0 },
    initialPageState: trace.initialPageState,
    environment: trace.environment,
    sampleSourceT: Float64Array.from(trace.sourceT),
    sampleTrusted: Uint8Array.from(trace.sampleTrusted),
    mergedSample: Uint32Array.from(trace.mergedSample),
    mergedX: Float32Array.from(trace.mergedX),
    mergedY: Float32Array.from(trace.mergedY),
    mergedSourceT: Float64Array.from(trace.mergedSourceT),
    mergedTrusted: Uint8Array.from(trace.mergedTrusted),
    metricSampleTimes: [...metricsSeries.tMs, record.endedAt - trace.startedAt],
    finalBoard: { cells: structuredClone(cells), hitIndices: cellElements.flatMap((el, i) => el.classList.contains('mine-hit') ? [i] : []) },
    sampleT: Float64Array.from(trace.t),
    sampleX: Float32Array.from(trace.x),
    sampleY: Float32Array.from(trace.y),
    events: trace.events,
  };
  const tx = db.transaction(TRACE_STORE, 'readwrite');
  tx.objectStore(TRACE_STORE).put(stored);
  tx.oncomplete = () => {
    boardMetricSourceSaved(stored.mode, stored.endedAt);
    switchCostSourcesChanged(stored.mode);
    requestArchiveSync();
  };
  tx.onerror = () => storageFailure('trace save failed: ' + tx.error);
}

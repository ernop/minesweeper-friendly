'use strict';
// Known-answer checks for the raw-input-trace layout recording in
// game/input-trace.js (extracted between its section markers): the initial
// layout event at beginTrace, and recordLayoutIfMoved — the geometry
// comparison that re-records when the board moved without a scroll,
// resize, or zoom event (e.g. the metrics panel appearing shifts the
// centered column), including the re-record before every button event.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.join(__dirname, '..');
const source = require('./game-source.js').source;
const start = source.indexOf('//-------RAW INPUT TRACE');
const end = source.indexOf('//-------PATH REPLAY');
if (start < 0 || end < 0 || end <= start) {
  throw new Error('raw input trace span markers not found');
}
const span = source.slice(start, end);

// The span reads these game globals; the test owns them.
let boardRect = { left: 100, top: 50, width: 200, height: 200 };
global.boardElement = { getBoundingClientRect: () => ({ ...boardRect }) };
global.config = { width: 9, height: 9 };
global.gameState = 'ready';
let nowMs = 1000;
global.performance = { now: () => nowMs, timeOrigin: 1699999999000 };
let focused = true;
global.document = { visibilityState: 'visible', hasFocus: () => focused };
global.cellIndexFromEvent = () => null;
global.observedEnvironment = () => ({ devicePixelRatio: 1, screenWidth: 1920, screenHeight: 1080,
  viewportWidth: 1600, viewportHeight: 900, userAgent: 'trace-layout-test' });
global.Date = Object.assign(function () {}, Date, { now: () => 1700000000000 });
// beginTrace's metrics-panel hookups are display machinery, inert here.
global.beginTraceMetricsSeries = () => {};
global.renderMetricsPanel = () => {};
global.renderLiveTraceMetrics = () => {};
global.scheduleMetricsUpdate = () => {};

vm.runInThisContext(span, { filename: 'raw-input-trace-span.js' });

let failures = 0;
function check(name, ok) {
  if (!ok) failures++;
  console.log((ok ? '  ok  ' : 'FAIL  ') + name);
}
const layouts = () => trace.events.filter((e) => e.kind === 'layout');

beginTrace();
check('beginTrace records one layout event', layouts().length === 1);
check('beginTrace captures the observed environment',
  trace.environment.userAgent === 'trace-layout-test' && trace.environment.viewportWidth === 1600);
check('initial layout carries the board rect',
  layouts()[0].left === 100 && layouts()[0].top === 50
  && layouts()[0].width === 200 && layouts()[0].height === 200);

nowMs = 1010;
recordLayoutIfMoved();
check('unmoved board records nothing', layouts().length === 1);

// The board shifts (content around it changed) — no scroll/resize/zoom.
boardRect = { left: 983, top: 50, width: 200, height: 200 };
nowMs = 1020;
recordLayoutIfMoved();
check('moved board re-records', layouts().length === 2);
check('re-record carries the new rect', layouts()[1].left === 983);

nowMs = 1030;
recordLayoutIfMoved();
check('second check after the same move records nothing',
  layouts().length === 2);

// A button event after another shift: the layout re-record must precede
// the button event so every event maps through current geometry.
boardRect = { left: 983, top: 120, width: 200, height: 200 };
nowMs = 1040;
traceEvent('lup', { clientX: 1000, clientY: 200, timeStamp: 1035,
  type: 'mouseup', buttons: 0, isTrusted: true }, 5);
const events = trace.events;
check('traceEvent re-records first', layouts().length === 3);
check('layout precedes its button event',
  events[events.length - 2].kind === 'layout'
  && events[events.length - 1].kind === 'lup');
check('event timestamps stay non-decreasing',
  events.every((e, i) => i === 0 || e.t >= events[i - 1].t));
const evaluation = {
  action: 'reveal',
  atMs: 999,
  position: { width: 9, height: 9, mines: 10, revealed: [], flagged: [] },
};
traceDecision(evaluation);
const decision = events[events.length - 1];
check('accepted action records a decision event', decision.kind === 'decision');
check('decision is aligned to its physical input timestamp',
  decision.t === events[events.length - 2].t);
check('decision keeps exact input coordinates',
  decision.x === 1000 && decision.y === 200);
check('decision uses input-time game clock',
  decision.evaluation.atMs === 0);

// Size changes count as movement too (zoom without the zoom handler).
boardRect = { left: 983, top: 120, width: 296, height: 296 };
nowMs = 1050;
recordLayoutIfMoved();
check('resized board re-records', layouts().length === 4);

check('initial page state is measured',
  trace.initialPageState.visibilityState === 'visible' && trace.initialPageState.hasFocus);
const input = trace.events.find(e => e.kind === 'lup');
check('source event time remains separate from receipt time',
  input.sourceT === 35 && input.t === 40 && input.sourceType === 'mouseup');
check('button state and source trust are retained', input.buttons === 0 && input.isTrusted);

nowMs = 1052;
traceMove({ timeStamp: 1041, type: 'mousemove', clientX: 10, clientY: 20, isTrusted: true });
traceMove({ timeStamp: 1042, type: 'mousemove', clientX: 11, clientY: 21, isTrusted: false });
nowMs = 1054;
traceMove({ timeStamp: 1043, type: 'mousemove', clientX: 12, clientY: 22, isTrusted: true });
check('equal receipt times retain the latest point and its provenance',
  trace.t.length === 2 && trace.x[0] === 11 && trace.y[0] === 21
  && trace.sourceT[0] === 42 && trace.sampleTrusted[0] === false);
check('merged observations are counted explicitly',
  trace.sampleMergeCount.join(',') === '2,1');
check('source and receipt samples use the same trace origin',
  trace.t[1] === 54 && trace.sourceT[1] === 43);

nowMs = 1055;
traceRightButton({ button: 2, buttons: 2, timeStamp: 1053, type: 'mousedown',
  clientX: 20, clientY: 30, isTrusted: true });
traceRightButton({ button: 2, buttons: 0, timeStamp: 1054, type: 'mouseup',
  clientX: 20, clientY: 30, isTrusted: true });
check('right transitions remain separate from flag-action triggers',
  trace.events.filter(e => e.kind.startsWith('right-button-')).length === 2
  && !trace.events.some(e => e.kind === 'rdown'));
check('physical right releases outside the board are recorded',
  trace.events.at(-1).kind === 'right-button-up' && trace.events.at(-1).index === null);
focused = false;
document.visibilityState = 'hidden';
tracePageEvent({ timeStamp: 1054, type: 'visibilitychange', isTrusted: true });
check('interruption stores the observed state and source time',
  trace.events.at(-1).visibilityState === 'hidden' && !trace.events.at(-1).hasFocus
  && trace.events.at(-1).sourceT === 54 && trace.events.at(-1).t === 55);
tracePageEvent({ timeStamp: 1054, type: 'pagehide', persisted: true, isTrusted: true });
check('page lifecycle retains browser cache state', trace.events.at(-1).persisted === true);
check('enriched events remain in receipt order',
  trace.events.every((e, i) => i === 0 || e.t >= trace.events[i - 1].t));

// Outside a running trace nothing records.
global.gameState = 'won';
boardRect = { left: 0, top: 0, width: 296, height: 296 };
nowMs = 1060;
recordLayoutIfMoved();
const finishedEventCount = trace.events.length;
tracePageEvent({ timeStamp: 1060, type: 'focus', isTrusted: true });
traceRightButton({ button: 2, timeStamp: 1060, type: 'mouseup' });
check('no record after game end', layouts().length === 4
  && trace.events.length === finishedEventCount);

console.log(failures === 0
  ? 'trace-layout: all checks passed'
  : failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);

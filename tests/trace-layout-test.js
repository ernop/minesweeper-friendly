'use strict';
// Known-answer checks for the raw-input-trace layout recording in
// minesweeper.js (extracted between its section markers): the initial
// layout event at beginTrace, and recordLayoutIfMoved — the geometry
// comparison that re-records when the board moved without a scroll,
// resize, or zoom event (e.g. the metrics panel appearing shifts the
// centered column), including the re-record before every button event.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'minesweeper.js'), 'utf8');
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
global.performance = { now: () => nowMs };
global.Date = Object.assign(function () {}, Date, { now: () => 1700000000000 });
// beginTrace's metrics-panel hookups are display machinery, inert here.
global.beginTraceMetricsSeries = () => {};
global.renderLiveTraceMetrics = () => {};

vm.runInThisContext(span, { filename: 'raw-input-trace-span.js' });

let failures = 0;
function check(name, ok) {
  if (!ok) failures++;
  console.log((ok ? '  ok  ' : 'FAIL  ') + name);
}
const layouts = () => trace.events.filter((e) => e.kind === 'layout');

beginTrace();
check('beginTrace records one layout event', layouts().length === 1);
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
traceEvent('lup', { clientX: 1000, clientY: 200 }, 5);
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

// Outside a running trace nothing records.
global.gameState = 'won';
boardRect = { left: 0, top: 0, width: 296, height: 296 };
nowMs = 1060;
recordLayoutIfMoved();
check('no record after game end', layouts().length === 4);

console.log(failures === 0
  ? 'trace-layout: all checks passed'
  : failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);

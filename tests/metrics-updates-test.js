'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'minesweeper.js'), 'utf8');
const start = source.indexOf('// Settings, resize, and session-clear actions');
const end = source.indexOf('//-------SESSION STATS: COMPUTATION', start);
let now = 1000;
let nextId = 0;
let activeTrace = true;
let computations = 0;
const frames = new Map();
const timeouts = new Map();
const renders = [];
const samples = [];
const context = vm.createContext({
  performance: { now: () => now },
  Date: { now: () => now },
  document: { hidden: false },
  settings: { sessionRateBasis: 'time' },
  sessionPlayFrom: 0,
  sessionChartsDirty: false,
  lastLiveMetrics: null,
  trace: { startedAt: 0, t: [], x: [], y: [], events: [] },
  tracing: () => activeTrace,
  renderMetricsPanel: (metrics) => renders.push(metrics),
  appendTraceMetricsSeries: (metrics) => samples.push(metrics),
  traceSilenceRatio: (movementMs, wallMs) => wallMs > 0 ? 1 - movementMs / wallMs : undefined,
  requestAnimationFrame: (fn) => { frames.set(++nextId, fn); return nextId; },
  cancelAnimationFrame: (id) => frames.delete(id),
  setTimeout: (fn, delay) => { timeouts.set(++nextId, { fn, at: now + delay }); return nextId; },
  clearTimeout: (id) => timeouts.delete(id),
  setInterval: () => { throw new Error('Metrics must not install a repeating refresh'); },
});
for (const name of ['computeTraceMetrics', 'computePsychometrics', 'computeHevelius',
  'computeWasteMetrics', 'computeClickCadence', 'computeQueueMetrics',
  'computeRecoveryMetrics', 'computeFittsMetrics']) {
  context[name] = () => { computations++; return { movementMs: 100 }; };
}
vm.runInContext(source.slice(start, end), context);
const run = (code) => vm.runInContext(code, context);
const flushFrame = () => {
  const callbacks = [...frames.values()];
  frames.clear();
  for (const fn of callbacks) fn();
};
const advance = (ms) => {
  now += ms;
  for (const [id, task] of timeouts) {
    if (task.at <= now) { timeouts.delete(id); task.fn(); }
  }
  flushFrame();
};
assert.equal(frames.size + timeouts.size, 0, 'loading installs no metrics work');
run('for (let i = 0; i < 100; i++) scheduleMetricsUpdate({ trace: true, session: true })');
assert.equal(frames.size, 1, 'an input burst queues one frame');
flushFrame();
assert.equal(samples.length, 1);
assert.equal(context.sessionChartsDirty, true);
assert.equal(frames.size + timeouts.size, 0, 'the update never schedules itself');
advance(5000);
assert.equal(samples.length, 1, 'idle time produces no samples or render work');
const beforeElapsed = computations;
run('scheduleMetricsUpdate({ elapsed: true })');
flushFrame();
assert.equal(computations, beforeElapsed, 'elapsed time reuses all input computations');
assert.equal(samples.at(-1).bio.silenceRatio, 1 - 100 / now);
run('for (let i = 0; i < 100; i++) scheduleMetricsUpdate({ trace: true })');
assert.equal(timeouts.size, 1, 'rapid follow-up input shares one trailing task');
assert.equal(frames.size, 0);
advance(250);
assert.equal(samples.length, 3, 'the trailing sample includes the queued input');
run('scheduleMetricsUpdate({ trace: true }); cancelMetricsUpdate()');
assert.equal(frames.size + timeouts.size, 0, 'cancellation removes pending work');
context.document.hidden = true;
run('scheduleMetricsUpdate({ trace: true })');
assert.equal(frames.size + timeouts.size, 0, 'hidden documents do not schedule rendering');
context.document.hidden = false;
run('scheduleMetricsUpdate()');
advance(250);
assert.equal(samples.length, 4, 'showing the page consumes retained dirty input');
activeTrace = false;
const finalSamples = samples.length;
run('scheduleMetricsUpdate({ session: true })');
advance(250);
assert.equal(samples.length, finalSamples, 'session changes cannot sample a finished trace');
assert.equal(renders.at(-1), null);
advance(5000);
assert.equal(frames.size + timeouts.size, 0, 'finished games leave no refresh loop');
console.log('metrics-updates: scheduling, caching, visibility, and idle checks passed');

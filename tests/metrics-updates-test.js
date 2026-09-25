'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = require('./game-source.js').source;
const start = source.indexOf('function refreshMetricsPanel()');
const end = source.indexOf('//-------SESSION STATS: COMPUTATION', start);
assert(start >= 0 && end > start, 'metrics computation section is present');
let now = 1000;
let nextId = 0;
let activeTrace = true;
const jobs = [];
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
  analysisTask: (lane, kind, payload) => new Promise((resolve) => jobs.push({ lane, kind, payload, resolve })),
  analysisFailure: (error) => { throw error; },
  requestAnimationFrame: (fn) => { frames.set(++nextId, fn); return nextId; },
  cancelAnimationFrame: (id) => frames.delete(id),
  setTimeout: (fn, delay) => { timeouts.set(++nextId, { fn, at: now + delay }); return nextId; },
  clearTimeout: (id) => timeouts.delete(id),
  setInterval: () => { throw new Error('Metrics must not install a repeating refresh'); },
});
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
async function reply() {
  const job = jobs.shift();
  job.resolve({ wallDurationMs: job.payload.wallMs, bio: { movementMs: 100 } });
  await Promise.resolve();
}
(async () => {
assert.equal(frames.size + timeouts.size, 0, 'loading installs no metrics work');
run('for (let i = 0; i < 100; i++) scheduleMetricsUpdate({ trace: true, session: true })');
assert.equal(frames.size, 1, 'an input burst queues one frame');
flushFrame();
assert.equal(jobs.length, 1);
assert.equal(samples.length, 0, 'metrics wait for the worker; no synchronous computation');
assert.equal(jobs[0].lane, 'live');
run('trace.t.push(1); trace.x.push(2); trace.y.push(3); scheduleMetricsUpdate({trace:true})');
advance(250);
assert.equal(jobs.length, 1, 'one sample in flight even when more input arrives');
await reply();
assert.equal(samples.length, 1);
flushFrame();
assert.equal(jobs.length, 1, 'dirty input follows the completed sample');
assert.equal(jobs[0].payload.t.length, 1);
await reply();
advance(5000);
assert.equal(jobs.length, 0, 'idle time produces no analysis work');
run('scheduleMetricsUpdate({ elapsed: true })');
flushFrame();
assert.equal(jobs[0].payload.t.length, 0, 'elapsed samples send no old input');
await reply();
run('scheduleMetricsUpdate({ trace: true }); cancelMetricsUpdate()');
assert.equal(frames.size + timeouts.size, 0, 'cancellation removes scheduled work');
context.document.hidden = true;
run('scheduleMetricsUpdate({ trace: true })');
assert.equal(frames.size + timeouts.size, 0, 'hidden documents do not schedule rendering');
context.document.hidden = false;
run('scheduleMetricsUpdate()');
advance(250);
assert.equal(jobs.length, 1, 'showing the page consumes retained dirty input');
const beforeStale = samples.length;
run('liveMetricsGeneration++');
await reply();
assert.equal(samples.length, beforeStale, 'late samples never modify the next game');
activeTrace = false;
run('scheduleMetricsUpdate({ session: true })');
advance(250);
assert.equal(jobs.length, 0, 'session changes cannot sample a finished trace');
assert.equal(renders.at(-1), null);
advance(5000);
assert.equal(frames.size + timeouts.size, 0, 'finished games leave no refresh loop');
console.log('metrics-updates: worker backpressure, delta transport, stale replies, visibility, and idle checks passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });

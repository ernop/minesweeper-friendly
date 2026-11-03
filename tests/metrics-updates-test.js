'use strict';

const assert = require('node:assert/strict');
const vm = require('node:vm');
const source = require('./game-source.js').source;
const start = source.indexOf('//-------MOTION STATS: SAMPLING SCHEDULE');
const end = source.indexOf('//-------', start + 1);
assert(start >= 0 && end > start, 'motion stats sampling schedule is present');
let now = 1000;
let nextId = 0;
let activeTrace = true;
const jobs = [];
const frames = new Map();
const timeouts = new Map();
let renders = 0;
const samples = [];
const context = vm.createContext({
  performance: { now: () => now },
  Date: { now: () => now },
  document: { hidden: false },
  settings: { panels: { motionStats: true } },
  lastLiveMetrics: null,
  trace: { startedAt: 0, t: [], x: [], y: [], mergedSample: [], mergedX: [], mergedY: [], events: [] },
  tracing: () => activeTrace,
  renderMotionStats: () => { renders++; },
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
  job.resolve(job.payload.sampleTimes.map((at) => ({ wallDurationMs: at, bio: { movementMs: 100 } })));
  await Promise.resolve();
}
const sampleTimes = () => run('metricSampleTimes.length');
(async () => {
assert.equal(frames.size + timeouts.size, 0, 'loading installs no metrics work');
run('for (let i = 0; i < 100; i++) scheduleMetricsUpdate({ trace: true })');
assert.equal(frames.size, 1, 'an input burst queues one frame');
flushFrame();
assert.equal(jobs.length, 1);
assert.equal(samples.length, 0, 'metrics wait for the worker; no synchronous computation');
assert.equal(jobs[0].lane, 'reports', 'the live feed goes to the worker that judges the game at its end');
assert.deepEqual([...jobs[0].payload.sampleTimes], [1000], 'the job computes at the sample time taken');
run('trace.t.push(1); trace.x.push(2); trace.y.push(3); scheduleMetricsUpdate({trace:true})');
advance(250);
assert.equal(jobs.length, 1, 'one job in flight even when more input arrives');
assert.equal(sampleTimes(), 2, 'the sample time is taken while the job computes');
await reply();
assert.equal(samples.length, 1);
assert.equal(renders, 1, 'each reply renders the motion stats once');
assert.equal(jobs.length, 1, 'the sample taken meanwhile follows the reply');
assert.equal(jobs[0].payload.t.length, 1);
assert.deepEqual([...jobs[0].payload.sampleTimes], [1250]);
await reply();
advance(5000);
assert.equal(jobs.length, 0, 'idle time produces no analysis work');
// An observation received at the instant of a sample already sent replaced
// it: that sample goes again, with the observation it replaced.
run('trace.mergedSample.push(0); trace.mergedX.push(2); trace.mergedY.push(3); trace.x[0] = 4;'
  + ' trace.t.push(5); trace.x.push(6); trace.y.push(7); scheduleMetricsUpdate({ trace: true })');
advance(250);
assert.deepEqual([jobs[0].payload.fromSample, jobs[0].payload.t, jobs[0].payload.x, jobs[0].payload.y],
  [0, [1, 5], [4, 6], [3, 7]]);
assert.deepEqual({ ...jobs[0].payload.merged }, { sample: [0], x: [2], y: [3] });
await reply();
advance(5000);
run('scheduleMetricsUpdate({ elapsed: true })');
flushFrame();
assert.equal(jobs[0].payload.t.length, 0, 'elapsed samples send no old input');
await reply();
// A closed section takes the sample times the saved trace keeps and runs
// nothing; opening it computes every one of them in one job.
context.settings.panels.motionStats = false;
const closedFrom = sampleTimes();
for (let i = 0; i < 3; i++) {
  run('trace.t.push(' + (100 + i) + '); trace.x.push(1); trace.y.push(1); scheduleMetricsUpdate({ trace: true })');
  advance(250);
}
assert.equal(sampleTimes(), closedFrom + 3, 'a closed section still takes sample times');
assert.equal(jobs.length, 0, 'a closed section posts no analysis work');
context.settings.panels.motionStats = true;
run('renderLiveTraceMetrics()');
assert.equal(jobs.length, 1, 'opening the section posts one job');
assert.equal(jobs[0].payload.sampleTimes.length, 3, 'that job computes every sample time taken while closed');
assert.equal(jobs[0].payload.t.length, 3, 'with the samples recorded meanwhile');
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
run('scheduleMetricsUpdate({ trace: true })');
advance(250);
assert.equal(jobs.length, 0, 'a finished trace is not sampled');
advance(5000);
assert.equal(frames.size + timeouts.size, 0, 'finished games leave no refresh loop');
console.log('metrics-updates: worker backpressure, delta transport, closed-section sampling, catch-up, stale replies, visibility, and idle checks passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });

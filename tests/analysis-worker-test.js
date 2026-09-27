'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const replies = [];
const context = vm.createContext({ self: { postMessage: (value) => replies.push(structuredClone(value)) } });
context.importScripts = (...files) => {
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file.split('?')[0]), 'utf8'), context, { filename: file });
};
vm.runInContext(fs.readFileSync(path.join(root, 'analysis-worker.js'), 'utf8'), context);
let id = 0;
const task = (kind, payload) => {
  context.self.onmessage({ data: { id: ++id, kind, payload: structuredClone(payload) } });
  const response = replies.pop();
  assert.equal(response.id, id);
  if (response.error) throw new Error(response.error);
  return response.result;
};
const fixtures = JSON.parse(fs.readFileSync(path.join(root, 'analysis/biometrics/synthetic-trace.json'), 'utf8'));
let snapshots = 0;
for (const [traceId, fixture] of fixtures.entries()) {
  const stored = { ...fixture, sampleT: Float64Array.from(fixture.sampleT),
    sampleX: Float64Array.from(fixture.sampleX), sampleY: Float64Array.from(fixture.sampleY), metricSampleTimes: [],
    measurementPlan: { drill: true, needCadence: false } };
  const duration = stored.endedAt - stored.startedAt;
  let samples = 0, events = 0;
  context.reference = structuredClone(stored);
  for (let at = 0; at <= duration; at += 250) {
    let endSample = samples, endEvent = events;
    while (endSample < stored.sampleT.length && stored.sampleT[endSample] <= at) endSample++;
    while (endEvent < stored.events.length && stored.events[endEvent].t <= at) endEvent++;
    const actual = task('live-trace', { traceId, wallMs: at,
      t: stored.sampleT.slice(samples, endSample), x: stored.sampleX.slice(samples, endSample),
      y: stored.sampleY.slice(samples, endSample), events: stored.events.slice(events, endEvent) });
    context.at = at;
    const expected = structuredClone(vm.runInContext(`computeAllTraceMetrics(reference.sampleT.filter(t => t <= at),
      reference.sampleX.slice(0, reference.sampleT.filter(t => t <= at).length),
      reference.sampleY.slice(0, reference.sampleT.filter(t => t <= at).length),
      reference.events.filter(e => e.t <= at), at)`, context));
    assert.deepEqual(actual, expected);
    stored.metricSampleTimes.push(at);
    samples = endSample; events = endEvent; snapshots++;
  }
  context.reference = structuredClone(stored);
  const restored = task('restore-trace', stored);
  const expectedSeries = structuredClone(vm.runInContext(`(() => {
    const result = createMetricSeries();
    for (const at of reference.metricSampleTimes) {
      const count = reference.sampleT.filter(t => t <= at).length;
      appendMetricSeries(result, computeAllTraceMetrics(reference.sampleT.slice(0,count),
        reference.sampleX.slice(0,count), reference.sampleY.slice(0,count),
        reference.events.filter(e => e.t <= at), at));
    }
    return result;
  })()`, context));
  assert.deepEqual(restored.series, expectedSeries);
}
// A 3x2 win with the mine at the top left:  * 1 0 / 1 1 0. Opening the right
// column floods it; the flag on the mine then serves one chord on the top 1,
// which opens a single cell. That flag counts: a direct click would do.
{
  const events = [
    { kind: 'lup', index: 2, t: 1000, atMs: 0 },
    { kind: 'rdown', index: 0, t: 1400, atMs: 400 },
    { kind: 'lup', index: 1, t: 1800, atMs: 800 },
  ];
  const plan = { width: 3, height: 2, mines: [true, false, false, false, false, false], drill: false,
    needZini: false, needBoardMetrics: false, needCadence: false, needFlagUse: true,
    trace: { t: [1000, 1800], x: [5, 20], y: [5, 5], events, wallMs: 800 } };
  assert.equal(task('finished-game', plan).measurements.flagsWithoutMultiCellChord, 1);
  const redrawn = { ...plan, mines: [false, false, false, true, false, false] };
  assert.equal('flagsWithoutMultiCellChord' in task('finished-game', redrawn).measurements, false,
    'inputs that do not replay to the final board store nothing');
  assert.equal('flagsWithoutMultiCellChord' in task('finished-game', { ...plan, needFlagUse: false }).measurements, false);
}
assert.deepEqual(task('trends', { pairs: [[0, 1], [1, 3], [2, 5]], todayPairs: [] }),
  [{ a: 1, b: 2, cls: 'trend-all', xMin: 0, xMax: 2 }]);
assert.throws(() => task('invalid-analysis-kind', {}), /Unknown analysis task/);
console.log(`analysis-worker: DOM-free initialization, ${snapshots} streamed snapshots, full-prefix restoration parity, flags no multi-cell chord used, exact trends, and task errors passed`);

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
  const merged = fixture.captureVersion >= 3
    ? { sample: fixture.mergedSample, x: fixture.mergedX, y: fixture.mergedY } : { sample: [], x: [], y: [] };
  const stored = { ...fixture, sampleT: Float64Array.from(fixture.sampleT),
    sampleX: Float64Array.from(fixture.sampleX), sampleY: Float64Array.from(fixture.sampleY), metricSampleTimes: [],
    merged, measurementPlan: { drill: true, needCadence: false } };
  const duration = stored.endedAt - stored.startedAt;
  let samples = 0, events = 0, mergedCount = 0;
  context.reference = structuredClone(stored);
  for (let at = 0; at <= duration; at += 250) {
    let endSample = samples, endEvent = events;
    while (endSample < stored.sampleT.length && stored.sampleT[endSample] <= at) endSample++;
    while (endEvent < stored.events.length && stored.events[endEvent].t <= at) endEvent++;
    let endMerged = mergedCount;
    while (endMerged < merged.sample.length && merged.sample[endMerged] < endSample) endMerged++;
    const actual = task('live-trace', { traceId, wallMs: at, fromSample: samples,
      t: stored.sampleT.slice(samples, endSample), x: stored.sampleX.slice(samples, endSample),
      y: stored.sampleY.slice(samples, endSample),
      merged: { sample: merged.sample.slice(mergedCount, endMerged), x: merged.x.slice(mergedCount, endMerged),
        y: merged.y.slice(mergedCount, endMerged) },
      events: stored.events.slice(events, endEvent) });
    context.at = at;
    const expected = structuredClone(vm.runInContext(`(() => {
      const count = reference.sampleT.filter(t => t <= at).length;
      const x = reference.sampleX.slice(0, count), y = reference.sampleY.slice(0, count);
      return computeAllTraceMetrics(reference.sampleT.slice(0, count), x, y,
        sampleTravelPx(x, y, reference.merged), reference.events.filter(e => e.t <= at), at);
    })()`, context));
    assert.deepEqual(actual, expected);
    stored.metricSampleTimes.push(at);
    samples = endSample; events = endEvent; mergedCount = endMerged; snapshots++;
  }
  context.reference = structuredClone(stored);
  const restored = task('restore-trace', stored);
  const expectedSeries = structuredClone(vm.runInContext(`(() => {
    const result = createMetricSeries();
    for (const at of reference.metricSampleTimes) {
      const count = reference.sampleT.filter(t => t <= at).length;
      const x = reference.sampleX.slice(0,count), y = reference.sampleY.slice(0,count);
      appendMetricSeries(result, computeAllTraceMetrics(reference.sampleT.slice(0,count), x, y,
        sampleTravelPx(x, y, reference.merged), reference.events.filter(e => e.t <= at), at));
    }
    return result;
  })()`, context));
  assert.deepEqual(restored.series, expectedSeries);
}
// Ranks won reads the mode's records with their losses, so streaks report.
{
  const now = 1000 * 864e5;
  const win = (endedAt) => ({ outcome: 'win', endedAt, timeMs: 9000 });
  const records = [];
  for (let i = 0; i < 9; i++) records.push(win(now - 864e5 + 2 * i), { outcome: 'loss', endedAt: now - 864e5 + 2 * i + 1 });
  records.push(win(now - 2), win(now - 1), win(now));
  const rows = task('recent-placements', { records, referenceMs: now, sourceStartMs: now - 60e3,
    recordEndedAt: now, boardEndedAt: now, otherBoards: false, collapseDuplicates: true });
  const streak = rows.find((row) => row.label === 'streak');
  assert.deepEqual([streak.ranks, streak.total, streak.currentRank], [[1], 10, 1]);
}
// Board categories come from the shown win alone unless other session
// boards are on.
{
  const now = 1000 * 864e5;
  const records = [];
  for (let i = 0; i < 9; i++) {
    records.push({ outcome: 'win', endedAt: now - 864e5 * (i + 2), timeMs: 20000 + i, bv3: 30 },
      { outcome: 'win', endedAt: now - 864e5 * (i + 2) + 1, timeMs: 20000 + i, bv3: 40 });
  }
  records.sort((a, b) => a.endedAt - b.endedAt);
  records.push({ outcome: 'win', endedAt: now - 1, timeMs: 9000, bv3: 30 },
    { outcome: 'win', endedAt: now, timeMs: 9500, bv3: 40 });
  const labels = (otherBoards) => task('recent-placements', { records, referenceMs: now,
    sourceStartMs: now - 60e3, recordEndedAt: now, boardEndedAt: now, otherBoards, collapseDuplicates: true })
    .map((row) => row.label).filter((label) => label.startsWith('3BV '));
  assert.deepEqual(labels(false), ['3BV 40']);
  assert.deepEqual(labels(true), ['3BV 30', '3BV 40']);
}
assert.deepEqual(task('trends', { pairs: [[0, 1], [1, 3], [2, 5]], todayPairs: [] }),
  [{ a: 1, b: 2, cls: 'trend-all', xMin: 0, xMax: 2 }]);
assert.throws(() => task('invalid-analysis-kind', {}), /Unknown analysis task/);
console.log(`analysis-worker: DOM-free initialization, ${snapshots} streamed snapshots (one trace with merged observations), full-prefix restoration parity, ranks won with streaks and the shown win's board categories, exact trends, and task errors passed`);

'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../game/trace-metrics.js'), 'utf8');
const model = vm.runInThisContext('(() => {' + source
  + ';return { computeAllTraceMetrics, createTraceMetricComputer }; })()');
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, '../analysis/biometrics/synthetic-trace.json'), 'utf8'));
let comparisons = 0;
for (const fixture of fixtures) {
  const compute = model.createTraceMetricComputer();
  const t = Float64Array.from(fixture.sampleT), x = Float64Array.from(fixture.sampleX), y = Float64Array.from(fixture.sampleY);
  const events = [];
  let sampleCount = 0, eventCount = 0;
  for (let at = 0; at <= fixture.endedAt - fixture.startedAt; at += 50) {
    while (sampleCount < t.length && t[sampleCount] <= at) sampleCount++;
    while (eventCount < fixture.events.length && fixture.events[eventCount].t <= at) events.push(fixture.events[eventCount++]);
    const args = [t.subarray(0, sampleCount), x.subarray(0, sampleCount), y.subarray(0, sampleCount), events, at];
    assert.deepEqual(compute(...args), model.computeAllTraceMetrics(...args));
    comparisons++;
  }
}
// Instrument only the expensive segment functions; elapsed/input snapshots
// between clicks must share them, while the next completed click invalidates.
const context = vm.createContext({ calls: 0 });
vm.runInContext(source + `
const psych = computePsychometrics, hev = computeHevelius;
computePsychometrics = (...args) => { calls++; return psych(...args); };
computeHevelius = (...args) => { calls++; return hev(...args); };
const compute = createTraceMetricComputer();
const events = [];
compute([], [], [], events, 0);
for (let i = 1; i < 100; i++) compute([], [], [], events, i);
`, context);
assert.equal(context.calls, 2);
vm.runInContext("events.push({kind:'rdown',t:100,x:1,y:2,index:null}); compute([],[],[],events,100);", context);
assert.equal(context.calls, 4);
console.log(`trace metric cache: ${comparisons} snapshots match full computation; completed-click invalidation passed`);

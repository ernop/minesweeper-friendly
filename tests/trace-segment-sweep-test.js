'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../game/trace-metrics.js'), 'utf8');
const model = vm.runInThisContext('(() => {' + source + `
  const original = heveliusMovement;
  const measured = [];
  heveliusMovement = (...args) => {
    const result = original(...args); measured.push(result); return result;
  };
  return { computeHevelius, traceSegments, cellRectAt, measure: original, measured };
})()`);
let seed = 421;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
let movements = 0;
for (let trial = 0; trial < 120; trial++) {
  const t = [], x = [], y = [], events = [];
  let now = 0;
  for (let click = 0; click < 40; click++) {
    const count = Math.floor(random() * 15);
    for (let sample = 0; sample < count; sample++) {
      now += 10; t.push(now); x.push(random() * 270); y.push(random() * 270);
    }
    const action = { t: now, x: random() * 270, y: random() * 270, index: click % 81 };
    if (click % 7 === 0) events.push({ kind: 'layout', t: now,
      left: 0, top: 0, width: 270, height: 270, boardWidth: 9, boardHeight: 9 });
    events.push({ ...action, kind: 'ldown' });
    if (click % 3 === 0) events.push({ ...action, kind: 'rdown' });
    events.push({ ...action, kind: 'lup', t: now + (click % 2 ? 5 : 0) });
    now += 5;
  }
  model.measured.length = 0;
  model.computeHevelius(t, x, y, events);
  const segments = model.traceSegments(t, x, y, events);
  assert.equal(model.measured.length, segments.length);
  for (const [index, segment] of segments.entries()) {
    let layout = null, down = null, press = null;
    const intervals = [];
    for (const event of events) {
      if (event.t > segment.click.t) break;
      if (event.kind === 'layout') layout = event;
      if (event.kind === 'ldown') {
        down = event.t;
        if (segment.click.kind === 'lup' && event.t >= segment.startT) press = event.t;
      } else if (event.kind === 'lup' && down !== null) {
        intervals.push([down, event.t]); down = null;
      } else if (event.kind === 'rdown' && event === segment.click) press = event.t;
    }
    if (down !== null) intervals.push([down, segment.click.t]);
    assert.deepEqual(model.measured[index], model.measure(segment, intervals, press,
      model.cellRectAt(layout, segment.click.index)));
    movements++;
  }
}
console.log(`trace segment sweep: ${movements} movements match independent event-window evaluation`);

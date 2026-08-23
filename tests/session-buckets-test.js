'use strict';
// Known-answer tests for the session-stats bucket aggregation in
// minesweeper.js: constructed cross-game event lists whose per-bucket
// speeds, rates, and fastclick medians are known analytically.
//
// Usage: node tests/session-buckets-test.js

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const repo = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'minesweeper.js'), 'utf8');
const startIdx = source.indexOf('//-------SESSION STATS: COMPUTATION');
const endIdx = source.indexOf('//-------SESSION STATS: RECORDING');
if (startIdx === -1 || endIdx === -1) throw new Error('section markers not found');
vm.runInThisContext(source.slice(startIdx, endIdx));

let checks = 0;
function assertClose(name, actual, want, tol) {
  checks++;
  if (actual === undefined || Math.abs(actual - want) > tol) {
    throw new Error(`${name}: got ${actual}, want ${want} (tol ${tol})`);
  }
}
function assertEq(name, actual, want) {
  checks++;
  if (actual !== want) throw new Error(`${name}: got ${actual}, want ${want}`);
}
function assertUndefined(name, actual) {
  checks++;
  if (actual !== undefined) throw new Error(`${name}: got ${actual}, want undefined`);
}

// A 1-hour window of 1-minute buckets ending at now. Bucket i covers
// [start + i*60000, start + (i+1)*60000) with start = now - 3600000;
// bucket 59 is the newest.
const NOW = 10 * 3600 * 1000;
const START = NOW - 3600 * 1000;
const bucketFrom = (i) => START + i * 60000;
const opts = { nowMs: NOW, bucketMs: 60000, windowMs: 3600 * 1000 };

const press = (at, useful, flag, moving, gapMs) =>
  ({ kind: 'press', at, useful, flag, moving, gapMs });

// ---- Test 1: one fully played bucket with every event kind ----
// Bucket 10 is played for its whole 60s. 1200px of travel -> 20px/s.
// 3 wasted presses -> 3/min. 2 flag placements -> 2/60 per s. 1 stupid
// death + 1 honest + 1 unmeasured -> 1/min (only stupid === true counts).
// Fastclick gaps among useful moving presses under 1s: 200, 300, 400
// -> median 300; a 5000ms gap and a non-moving 250ms gap must not count.
{
  const b10 = bucketFrom(10);
  const events = [
    { kind: 'play', from: b10, to: b10 + 60000 },
    { kind: 'move', at: b10 + 1000, px: 700 },
    { kind: 'move', at: b10 + 30000, px: 500 },
    press(b10 + 2000, false, false, true, undefined),
    press(b10 + 3000, false, false, false, undefined),
    press(b10 + 4000, false, false, true, undefined),
    press(b10 + 5000, true, true, true, undefined),   // first useful: no gap
    press(b10 + 5200, true, false, true, 200),
    press(b10 + 5500, true, false, true, 300),
    press(b10 + 5900, true, false, true, 400),
    press(b10 + 10900, true, true, true, 5000),       // too long: not a fastclick
    press(b10 + 11150, true, false, false, 250),      // not moving: not a fastclick
    { kind: 'death', at: b10 + 20000, stupid: true },
    { kind: 'death', at: b10 + 40000, stupid: false },
    { kind: 'death', at: b10 + 50000, stupid: undefined },
  ];
  const s = sessionBucketSeries(events, opts);
  assertEq('t1 bucketCount', s.centers.length, 60);
  assertClose('t1 playMs', s.playMs[10], 60000, 1e-9);
  assertClose('t1 speed', s.speedPxPerSec[10], 20, 1e-9);
  // Useful presses: the 6 flagged useful ones (wasted presses excluded).
  assertClose('t1 clicksPerSec', s.clicksPerSec[10], 6 / 60, 1e-9);
  assertClose('t1 wastedPerMin', s.wastedPerMin[10], 3, 1e-9);
  assertClose('t1 flagsPerSec', s.flagsPerSec[10], 2 / 60, 1e-9);
  assertClose('t1 stupidPerMin', s.stupidPerMin[10], 1, 1e-9);
  assertClose('t1 fastclickGap', s.fastclickGapMs[10], 300, 1e-9);
  // A bucket with no play and no presses is undefined everywhere.
  assertUndefined('t1 empty speed', s.speedPxPerSec[11]);
  assertUndefined('t1 empty clicks', s.clicksPerSec[11]);
  assertUndefined('t1 empty wasted', s.wastedPerMin[11]);
  assertUndefined('t1 empty stupid', s.stupidPerMin[11]);
  assertUndefined('t1 empty flags', s.flagsPerSec[11]);
  assertUndefined('t1 empty fastclick', s.fastclickGapMs[11]);
}

// ---- Test 2: a play interval straddling bucket edges ----
// Play runs from 30s into bucket 20 to 15s into bucket 22:
// 30s + 60s + 15s. Rates divide by each bucket's own played time:
// one wasted press in bucket 20's 30s -> 2/min.
{
  const events = [
    { kind: 'play', from: bucketFrom(20) + 30000, to: bucketFrom(22) + 15000 },
    press(bucketFrom(20) + 40000, false, false, false, undefined),
  ];
  const s = sessionBucketSeries(events, opts);
  assertClose('t2 playMs b20', s.playMs[20], 30000, 1e-9);
  assertClose('t2 playMs b21', s.playMs[21], 60000, 1e-9);
  assertClose('t2 playMs b22', s.playMs[22], 15000, 1e-9);
  assertClose('t2 wastedPerMin b20', s.wastedPerMin[20], 2, 1e-9);
  assertClose('t2 wastedPerMin b21', s.wastedPerMin[21], 0, 1e-9);
}

// ---- Test 3: the open (still-running) play interval ----
// openPlayFrom 90s ago covers the last 1.5 buckets: 30s in bucket 58,
// all of bucket 59. 600px moved 20s ago (bucket 59) -> 10px/s there,
// 0px/s in bucket 58 (played but motionless: a real 0, not a gap).
{
  const events = [
    { kind: 'move', at: NOW - 20000, px: 600 },
  ];
  const s = sessionBucketSeries(events, { ...opts, openPlayFrom: NOW - 90000 });
  assertClose('t3 playMs b58', s.playMs[58], 30000, 1e-9);
  assertClose('t3 playMs b59', s.playMs[59], 60000, 1e-9);
  assertClose('t3 speed b59', s.speedPxPerSec[59], 10, 1e-9);
  assertClose('t3 speed b58', s.speedPxPerSec[58], 0, 1e-9);
  assertUndefined('t3 speed b57', s.speedPxPerSec[57]);
}

// ---- Test 4: events outside the window are ignored, edges clamp ----
// A play interval reaching back before the window start only counts its
// in-window overlap; presses older than the window vanish entirely.
{
  const events = [
    { kind: 'play', from: START - 120000, to: START + 30000 },
    press(START - 60000, false, false, false, undefined),
    press(START + 10000, false, false, false, undefined),
  ];
  const s = sessionBucketSeries(events, opts);
  assertClose('t4 playMs b0', s.playMs[0], 30000, 1e-9);
  assertClose('t4 wastedPerMin b0', s.wastedPerMin[0], 2, 1e-9); // 1 press / 0.5min
  const totalPlay = s.playMs.reduce((a, b) => a + b, 0);
  assertClose('t4 no play elsewhere', totalPlay, 30000, 1e-9);
}

// ---- Test 4b: slivers of play are no evidence ----
// A bucket with under SESSION_MIN_PLAY_MS (1s) of play must not print
// rates: one death over a 500ms sliver is an absurdity, not a reading.
{
  const b30 = bucketFrom(30);
  const events = [
    { kind: 'play', from: b30, to: b30 + 500 },
    { kind: 'death', at: b30 + 400, stupid: true },
  ];
  const s = sessionBucketSeries(events, opts);
  assertClose('t4b playMs', s.playMs[30], 500, 1e-9);
  assertUndefined('t4b stupidPerMin', s.stupidPerMin[30]);
  assertUndefined('t4b speed', s.speedPxPerSec[30]);
  assertUndefined('t4b clicks', s.clicksPerSec[30]);
  assertUndefined('t4b wasted', s.wastedPerMin[30]);
}

// ---- Test 5: sessionMedian on even counts and empties ----
{
  assertUndefined('t5 empty median', sessionMedian([]));
  assertClose('t5 odd median', sessionMedian([300, 100, 200]), 200, 1e-9);
  assertClose('t5 even median', sessionMedian([100, 400, 200, 300]), 250, 1e-9);
}

// ---- Test 6: bucket sizes divide the window into the right counts ----
{
  for (const [bucketMs, want] of [[10000, 360], [30000, 120], [60000, 60], [300000, 12]]) {
    const s = sessionBucketSeries([], { nowMs: NOW, bucketMs, windowMs: 3600 * 1000 });
    assertEq(`t6 count ${bucketMs}`, s.centers.length, want);
  }
}

console.log(`session-buckets: all ${checks} checks passed`);

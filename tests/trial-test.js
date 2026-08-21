'use strict';

const Trial = require('../trial.js');

let failures = 0;
function check(name, condition) {
  if (condition) console.log('  ok  ' + name);
  else {
    failures++;
    console.log('FAIL  ' + name);
  }
}

check('square boards get all 8 isometries', Trial.transformsFor(9, 9).length === 8);
check('rectangular boards get 4 isometries', Trial.transformsFor(30, 16).length === 4);

check('rot180 is an involution on 3x2', (() => {
  const mines = [true, false, false, false, true, false];
  const once = Trial.applyMines(mines, 3, 2, 'rot180');
  const twice = Trial.applyMines(once, 3, 2, 'rot180');
  return twice.every((v, i) => v === mines[i]);
})());

check('rot90 cycles a square corner', (() => {
  const mines = [
    true, false, false,
    false, false, false,
    false, false, false,
  ];
  const a = Trial.applyMines(mines, 3, 3, 'rot90');
  return a[2] === true && a[0] === false;
})());

check('schedule is 100 slots, 4 of each identity', (() => {
  let x = 0.3;
  const rng = () => { x = (x * 1.618 + 0.17) % 1; return x; };
  const slots = Trial.buildSchedule(rng);
  if (slots.length !== Trial.GAMES) return false;
  const counts = new Array(Trial.IDENTITIES).fill(0);
  for (const id of slots) counts[id]++;
  return counts.every((c) => c === Trial.REPEATS);
})());

check('short-trial schedule is 16 slots, 4 of each of 4 identities', (() => {
  let x = 0.3;
  const rng = () => { x = (x * 1.618 + 0.17) % 1; return x; };
  const kind = Trial.kindOf('short-trial');
  const slots = Trial.buildSchedule(rng, kind.identities, kind.repeats);
  if (slots.length !== 16) return false;
  const counts = new Array(kind.identities).fill(0);
  for (const id of slots) counts[id]++;
  return counts.every((c) => c === kind.repeats);
})());

check('test-trial is one identity and four games', (() => {
  let x = 0.2;
  const rng = () => { x = (x * 1.51 + 0.09) % 1; return x; };
  const session = Trial.createSession('3x3/2', 3, 3, 2, rng, 'test-trial');
  return session.identities.length === 1 && Trial.gameCount(session) === 4
    && new Set(session.identities[0].transforms).size === 4;
})());

check('short-trial session has 4 identities', (() => {
  let x = 0.2;
  const rng = () => { x = (x * 1.51 + 0.09) % 1; return x; };
  const session = Trial.createSession('3x3/2', 3, 3, 2, rng, 'short-trial');
  return session.playMode === 'short-trial'
    && session.identities.length === 4
    && Trial.gameCount(session) === 16;
})());

function minGap(slots) {
  const last = new Map();
  let gap = Infinity;
  for (let i = 0; i < slots.length; i++) {
    if (last.has(slots[i])) gap = Math.min(gap, i - last.get(slots[i]));
    last.set(slots[i], i);
  }
  return gap;
}

check('schedule keeps the same identity away from its other showings', (() => {
  let x = 0.3;
  const rng = () => { x = (x * 1.618 + 0.17) % 1; return x; };
  const short = Trial.buildSchedule(rng, 4, 4);
  const full = Trial.buildSchedule(rng, 25, 4);
  return minGap(short) >= 2 && minGap(full) >= 8;
})());

check('each identity gets four distinct transforms', (() => {
  let x = 0.2;
  const rng = () => { x = (x * 1.51 + 0.09) % 1; return x; };
  const session = Trial.createSession('9x9/10', 9, 9, 10, rng, 'short-trial');
  return session.identities.every((id) => {
    const names = new Set(id.transforms);
    return id.transforms.length === 4 && names.size === 4;
  });
})());

check('presentations of one identity do not reuse a transform', (() => {
  let x = 0.11;
  const rng = () => { x = (x * 1.37 + 0.19) % 1; return x; };
  const session = Trial.createSession('9x9/10', 9, 9, 10, rng, 'short-trial');
  const seen = new Map();
  while (session.nextIndex < session.schedule.length) {
    const pres = Trial.presentation(session, rng);
    if (!seen.has(pres.identityIndex)) seen.set(pres.identityIndex, new Set());
    const used = seen.get(pres.identityIndex);
    if (used.has(pres.transform)) return false;
    used.add(pres.transform);
    Trial.recordResult(session, { identityIndex: pres.identityIndex, transform: pres.transform });
  }
  return [...seen.values()].every((used) => used.size === 4);
})());

check('session presentation maps first click with the mines', (() => {
  let x = 0.2;
  const rng = () => { x = (x * 1.51 + 0.09) % 1; return x; };
  const session = Trial.createSession('3x3/2', 3, 3, 2, rng);
  const pres = Trial.presentation(session, rng);
  const mines = pres.mines.filter(Boolean).length;
  return mines === 2 && pres.mines[pres.firstClick] === false;
})());

check('replayProgress counts opening then a reveal and a flag', (() => {
  const mines = [true, false, false, false];
  const events = [
    { t: 100, kind: 'rdown', index: 0 },
    { t: 250, kind: 'lup', index: 1 },
  ];
  const p = Trial.replayProgress(2, 2, mines, 3, events);
  return p.opened[0] === 1
    && p.flags[0] === 0
    && p.flags[1] === 1
    && p.opened[2] === 2
    && p.flags[2] === 1
    && p.unopened[0] === 2
    && p.unopened[2] === 1
    && p.unmarked[0] === 1
    && p.unmarked[1] === 0;
})());

check('replay without a given opening starts covered', (() => {
  const mines = [true, false, false, false];
  const p = Trial.replayProgress(2, 2, mines, 3, [
    { t: 40, kind: 'lup', index: 3 },
  ], { givenOpening: false });
  return p.opened[0] === 0 && p.opened[1] === 1;
})());

check('invertPointEdge undoes every square isometry', (() => {
  const names = Trial.transformsFor(9, 9);
  for (const name of names) {
    const [x, y] = Trial.mapPointEdge(2.25, 6.5, 9, 9, name);
    const back = Trial.invertPointEdge(x, y, 9, 9, name);
    if (Math.abs(back[0] - 2.25) > 1e-9 || Math.abs(back[1] - 6.5) > 1e-9) return false;
  }
  return true;
})());

check('bucketSeries of 0 is a copy of the raw series', (() => {
  const raw = Trial.bucketSeries([0, 10, 20], [1, 3, 5], 0);
  return raw.tMs.length === 3 && raw.values[1] === 3;
})());

check('bucketSeries averages a 20ms window', (() => {
  const b = Trial.bucketSeries([0, 10, 20, 30], [10, 20, 30, 50], 20);
  return b.values.length === 2
    && Math.abs(b.values[0] - 15) < 1e-9
    && Math.abs(b.values[1] - 40) < 1e-9;
})());

check('runningPath accumulates distance', (() => {
  const p = Trial.runningPath([0, 10, 20], [0, 3, 3], [0, 4, 8]);
  return p.values[0] === 0 && p.values[1] === 5 && p.values[2] === 9;
})());

function fakeAttempt(id, timeMs, outcome) {
  return {
    identityIndex: id,
    transform: 'id',
    endedAt: timeMs,
    outcome: outcome,
    timeMs: timeMs,
    bv3: 10,
    clicks: 12,
  };
}

check('sessionSummary: later meetings faster is a within-identity drop', (() => {
  const session = {
    identities: [{}, {}],
    results: [
      fakeAttempt(0, 10000, 'win'),
      fakeAttempt(1, 10000, 'win'),
      fakeAttempt(0, 6000, 'win'),
      fakeAttempt(1, 6000, 'win'),
    ],
  };
  const sum = Trial.sessionSummary(session);
  return sum.showings[0].meanTime === 10
    && sum.showings[1].meanTime === 6
    && sum.identitiesWithTwoWins === 2
    && Math.abs(sum.withinMean - 4) < 1e-9;
})());

check('sessionSummary: withinMean averages first-to-last win deltas', (() => {
  const session = {
    identities: [{}, {}],
    results: [
      fakeAttempt(0, 10000, 'win'),
      fakeAttempt(0, 8000, 'win'),
      fakeAttempt(1, 6000, 'win'),
      fakeAttempt(1, 4800, 'win'),
    ],
  };
  const sum = Trial.sessionSummary(session);
  return Math.abs(sum.withinMean - 1.6) < 1e-9;
})());

check('skipPresentation advances without recording', (() => {
  let x = 0.2;
  const rng = () => { x = (x * 1.51 + 0.09) % 1; return x; };
  const session = Trial.createSession('3x3/2', 3, 3, 2, rng, 'test-trial');
  Trial.skipPresentation(session);
  return session.nextIndex === 1 && session.results.length === 0;
})());

check('sessionSummary: one identity still reports a first-to-last delta', (() => {
  const session = {
    identities: [{}],
    results: [
      fakeAttempt(0, 9000, 'win'),
      fakeAttempt(0, 7000, 'win'),
      fakeAttempt(0, 7000, 'win'),
      fakeAttempt(0, 5000, 'win'),
    ],
  };
  const sum = Trial.sessionSummary(session);
  return sum.identitiesPlayed === 1 && Math.abs(sum.withinMean - 4) < 1e-9;
})());

if (failures) {
  console.log(failures + ' failed');
  process.exit(1);
}
console.log('all ok');

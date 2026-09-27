'use strict';

// Self-check protocol definitions, scoring, validation, and backup format.
// The freeze checks fail on any edit to a released protocol: a change must
// ship under a new protocol id instead (docs/product/self-check.md).

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const repo = path.join(__dirname, '..');
vm.runInThisContext(fs.readFileSync(path.join(repo, 'observation-context.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(repo, 'self-check-core.js'), 'utf8'));

let checks = 0;
function check(name, fn) {
  try {
    fn();
  } catch (error) {
    error.message = name + ': ' + error.message;
    throw error;
  }
  checks++;
}

check('the retired 3-minute test is frozen for reading its checks', () => {
  assert.deepEqual({ ...VIGILANCE_PROTOCOL }, {
    id: 'vigilance-3min-v1',
    durationMs: 180000,
    isiMinMs: 1000,
    isiMaxMs: 4000,
    feedbackMs: 1000,
    timeoutMs: 30000,
    falseStartBelowMs: 100,
    lapseFromMs: 355,
  });
  assert.equal(Object.isFrozen(VIGILANCE_PROTOCOL), true);
});

check('the alertness test is frozen', () => {
  assert.deepEqual({ ...ALERTNESS_PROTOCOL }, {
    id: 'alertness-10-v1',
    stimulusCount: 10,
    isiMinMs: 1000,
    isiMaxMs: 4000,
    feedbackMs: 1000,
    timeoutMs: 30000,
    falseStartBelowMs: 100,
    lapseFromMs: 355,
  });
  assert.equal(Object.isFrozen(ALERTNESS_PROTOCOL), true);
  assert.deepEqual(Object.keys(ALERTNESS_PROTOCOLS), ['alertness-10-v1', 'vigilance-3min-v1'],
    'the retired 3-minute test stays readable');
  assert.equal(Object.isFrozen(ALERTNESS_PROTOCOLS), true);
});

check('released sleepiness scale is frozen', () => {
  assert.equal(SLEEPINESS_SCALE.id, 'kss-9-v1');
  assert.equal(SLEEPINESS_SCALE.question, 'How sleepy do you feel right now?');
  assert.deepEqual([...SLEEPINESS_SCALE.labels], [
    'extremely alert',
    'very alert',
    'alert',
    'rather alert',
    'neither alert nor sleepy',
    'some signs of sleepiness',
    'sleepy, but no effort to keep awake',
    'sleepy, some effort to keep awake',
    'very sleepy, great effort to keep awake, fighting sleep',
  ]);
  assert.equal(Object.isFrozen(SLEEPINESS_SCALE.labels), true);
});

check('intervals span 1-4 s', () => {
  for (const protocol of Object.values(ALERTNESS_PROTOCOLS)) {
    assert.equal(drawVigilanceIsiMs(protocol, 0), 1000);
    assert.equal(drawVigilanceIsiMs(protocol, 0.5), 2500);
    assert.equal(drawVigilanceIsiMs(protocol, 1 - 2 ** -32) < 4000, true);
  }
});

check('scores follow the frozen thresholds', () => {
  const score = scoreVigilance({
    protocol: 'vigilance-3min-v1',
    trials: [
      { isiMs: 1500, onsetT: 1000, responseT: 1250 },
      { isiMs: 1500, onsetT: 5000, responseT: 5400 },
      { isiMs: 1500, onsetT: 9000, responseT: 9050 },
      { isiMs: 1500, onsetT: 12000, timedOut: true },
      { isiMs: 1500, onsetT: 50000, responseT: 50300 },
    ],
    earlyPresses: [{ t: 700, receiptT: 701 }, { t: 800, receiptT: 802 }],
  });
  assert.equal(score.stimulusCount, 5);
  assert.equal(score.reactionCount, 3);
  assert.equal(score.anticipationCount, 1);
  assert.equal(score.earlyPressCount, 2);
  assert.equal(score.falseStartCount, 3);
  assert.equal(score.timeoutCount, 1);
  assert.equal(score.lapseCount, 2);
  assert.equal(score.medianReactionMs, 300);
  assert.equal(Math.abs(score.meanResponseSpeedPerSec - (4 + 1000 / 300 + 2.5) / 3) < 1e-12, true);
  assert.equal(score.slowestTenthSpeedPerSec, 2.5);
  assert.equal(score.fastestTenthReactionMs, 250);
});

check('threshold boundaries', () => {
  for (const protocol of Object.keys(ALERTNESS_PROTOCOLS)) {
    const at = (reactionMs) => scoreVigilance({
      protocol, trials: [{ isiMs: 1000, onsetT: 0, responseT: reactionMs }], earlyPresses: [],
    });
    assert.equal(at(100).falseStartCount, 0);
    assert.equal(at(99.9).falseStartCount, 1);
    assert.equal(at(355).lapseCount, 1);
    assert.equal(at(354.9).lapseCount, 0);
  }
});

check('no reactions leaves speeds unmeasured', () => {
  const score = scoreVigilance({
    protocol: 'vigilance-3min-v1', trials: [{ isiMs: 1000, onsetT: 0, timedOut: true }], earlyPresses: [],
  });
  assert.equal(score.medianReactionMs, undefined);
  assert.equal(score.meanResponseSpeedPerSec, undefined);
  assert.equal(score.lapseCount, 1);
});

function validCheck(overrides = {}) {
  return {
    startedAt: 1790000000000,
    endedAt: 1790000200000,
    timeZone: 'America/Los_Angeles',
    utcOffsetMin: -420,
    occasion: 'routine',
    sleepiness: { scale: 'kss-9-v1', rating: 4 },
    environment: { devicePixelRatio: 1, screenWidth: 2560, screenHeight: 1440,
      viewportWidth: 2400, viewportHeight: 1300, userAgent: 'test agent' },
    vigilance: {
      protocol: 'vigilance-3min-v1',
      status: 'complete',
      timeOriginMs: 1790000000500.25,
      startT: 5000,
      endT: 185020,
      trials: [
        { isiMs: 2000, onsetT: 7003, nextFrameT: 7020, responseT: 7290, receiptT: 7292, pointerType: 'mouse' },
        { isiMs: 3999.5, onsetT: 11300, nextFrameT: 11317, timedOut: true },
      ],
      earlyPresses: [{ t: 9000, receiptT: 9001 }],
      frameCount: 10800,
      frameIntervalMedianMs: 16.67,
    },
    ...overrides,
  };
}

function withVigilance(changes) {
  const base = validCheck();
  return { ...base, vigilance: { ...base.vigilance, ...changes } };
}

check('a complete check validates', () => {
  assert.equal(validSelfCheck(validCheck()), true);
  assert.equal(validSelfCheck(validCheck({ sleepHoursPast24h: 7.5, note: 'after a long run' })), true);
  assert.equal(validSelfCheck(validCheck({ occasion: 'extra' })), true);
  // A wall-clock adjustment during the check is a truthful record, not damage.
  assert.equal(validSelfCheck(validCheck({ endedAt: 1789999999999 })), true);
  assert.equal(validSelfCheck(validCheck({ timeZone: 'UTC', utcOffsetMin: 0 })), true);
});

check('malformed checks are rejected', () => {
  const rejected = [
    validCheck({ timeZone: '' }),
    validCheck({ utcOffsetMin: 30.5 }),
    validCheck({ occasion: 'daily' }),
    validCheck({ sleepiness: { scale: 'kss-9-v1', rating: 0 } }),
    validCheck({ sleepiness: { scale: 'kss-9-v1', rating: 10 } }),
    validCheck({ sleepiness: { scale: 'kss-9-v1', rating: 2.5 } }),
    validCheck({ sleepiness: { scale: 'kss-9-v2', rating: 4 } }),
    validCheck({ sleepHoursPast24h: 25 }),
    validCheck({ note: '' }),
    validCheck({ environment: undefined }),
    validCheck({ timeZone: 'Mars/Olympus_Mons' }),
    withVigilance({ protocol: 'vigilance-3min-v2' }),
    withVigilance({ status: 'complete', interruption: { type: 'blur', t: 9 } }),
    withVigilance({ status: 'interrupted' }),
    withVigilance({ status: 'interrupted', interruption: { type: 'nap', t: 9 } }),
    withVigilance({ trials: [{ isiMs: 4000, onsetT: 1, responseT: 300, receiptT: 301, pointerType: 'mouse' }] }),
    withVigilance({ trials: [{ isiMs: 2000, onsetT: 1, responseT: 300, receiptT: 301, pointerType: 'mouse', timedOut: true }] }),
    withVigilance({ trials: [{ isiMs: 2000, onsetT: 1 }] }),
    withVigilance({ trials: [{ isiMs: 2000, onsetT: 10, nextFrameT: 10 }] }),
    withVigilance({ frameCount: -1 }),
    withVigilance({ endT: 4000 }),
  ];
  rejected.forEach((candidate, i) => assert.equal(validSelfCheck(candidate), false, 'case ' + i));
});

check('a complete short test holds exactly its 10 stimuli', () => {
  const answered = (i) => ({ isiMs: 2000, onsetT: 7000 + i * 3000, responseT: 7280 + i * 3000,
    receiptT: 7282 + i * 3000, pointerType: 'mouse' });
  const short = (count, status = 'complete') => withVigilance({
    protocol: 'alertness-10-v1', status, endT: 40000,
    ...(status === 'interrupted' ? { interruption: { type: 'escape', t: 30000 } } : {}),
    trials: Array.from({ length: count }, (_, i) => answered(i)),
  });
  assert.equal(validSelfCheck(short(10)), true);
  assert.equal(validSelfCheck(short(9)), false);
  assert.equal(validSelfCheck(short(11)), false);
  assert.equal(validSelfCheck(short(4, 'interrupted')), true);
  assert.equal(validSelfCheck(short(11, 'interrupted')), false);
  assert.equal(scoreVigilance(short(10).vigilance).reactionCount, 10);
});

check('only a stop may leave the last stimulus unanswered', () => {
  const stopped = (trials) => withVigilance({
    status: 'interrupted', interruption: { type: 'escape', t: 12000 }, trials,
  });
  const answered = { isiMs: 2000, onsetT: 7003, responseT: 7290, receiptT: 7292, pointerType: 'mouse' };
  const showing = { isiMs: 2000, onsetT: 11000 };
  assert.equal(validSelfCheck(stopped([answered, showing])), true);
  assert.equal(validSelfCheck(stopped([showing, answered])), false);
  assert.equal(validSelfCheck(stopped([])), true);
});

check('backup file round trip keeps valid checks and counts the rest', () => {
  const file = selfCheckFile([validCheck(), { broken: true }], 1790000300000);
  const read = readSelfCheckFile(JSON.parse(JSON.stringify(file)));
  assert.equal(read.selfChecks.length, 1);
  assert.equal(read.rejectedCount, 1);
  assert.deepEqual(read.selfChecks[0], validCheck());
  assert.throws(() => readSelfCheckFile({ format: 'other', formatVersion: 1, selfChecks: [] }), /not a self-check backup/);
  assert.throws(() => readSelfCheckFile({ ...file, formatVersion: 2 }), /unsupported self-check backup version/);
  assert.throws(() => readSelfCheckFile({ ...file, selfChecks: null }), /no selfChecks list/);
});

check('baseline uses the last ten earlier complete routine checks', () => {
  const at = (startedAt, reactionMs, occasion = 'routine', status = 'complete') => {
    const base = validCheck({ startedAt, endedAt: startedAt + 1, occasion });
    return { ...base, vigilance: { ...base.vigilance, status,
      ...(status === 'interrupted' ? { interruption: { type: 'blur', t: 1 } } : {}),
      trials: [{ isiMs: 2000, onsetT: 0, responseT: reactionMs, receiptT: reactionMs + 1, pointerType: 'mouse' }],
      earlyPresses: [] } };
  };
  const history = [];
  for (let i = 0; i < 12; i++) history.push(at(1000 + i, 200 + i * 10));
  history.push(at(2000, 900, 'extra'));
  history.push(at(2001, 950, 'routine', 'interrupted'));
  history.push(at(3000, 990));
  const baseline = routineBaseline(history, 2500, 'vigilance-3min-v1');
  assert.equal(baseline.checkCount, 10);
  // Reactions 220..310 ms: the two oldest (200, 210) fall outside the ten.
  assert.equal(baseline.medianReactionMs, 265);
  assert.equal(baseline.lapseCount, 0);
  assert.equal(routineBaseline(history, 1000, 'vigilance-3min-v1').checkCount, 0);
  assert.equal(routineBaseline(history, 1000, 'vigilance-3min-v1').medianReactionMs, undefined);
});

check('baselines never mix the two tests', () => {
  const at = (startedAt, reactionMs, protocol) => {
    const base = validCheck({ startedAt, endedAt: startedAt + 1 });
    return { ...base, vigilance: { ...base.vigilance, protocol,
      trials: [{ isiMs: 2000, onsetT: 0, responseT: reactionMs, receiptT: reactionMs + 1, pointerType: 'mouse' }],
      earlyPresses: [] } };
  };
  const history = [at(1000, 250, 'vigilance-3min-v1'), at(1001, 400, 'alertness-10-v1'), at(1002, 420, 'alertness-10-v1')];
  assert.equal(routineBaseline(history, 2000, 'vigilance-3min-v1').medianReactionMs, 250);
  assert.equal(routineBaseline(history, 2000, 'alertness-10-v1').medianReactionMs, 410);
  assert.equal(routineBaseline(history, 2000, 'alertness-10-v1').checkCount, 2);
});

console.log('self-check-core: all ' + checks + ' checks passed');

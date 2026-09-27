'use strict';

// Self-check protocols, pure: the frozen sleepiness scale and alertness
// test, their scoring, stored-record validation, and the backup file format.
// Shared by self-check-page.js and tests/self-check-core-test.js; no DOM.
// Depends on observation-context.js for the context validators.
//
// A protocol id names one exact instrument. Changing any wording, parameter,
// input, or scoring rule means a new id that replaces the old one outright
// (docs/product/self-check.md "Protocol versions").

//-------SLEEPINESS RATING (Karolinska Sleepiness Scale)-------

// Akerstedt & Gillberg 1990, the nine-step version with every step labeled.
const SLEEPINESS_SCALE = Object.freeze({
  id: 'kss-9-v1',
  question: 'How sleepy do you feel right now?',
  labels: Object.freeze([
    'extremely alert',
    'very alert',
    'alert',
    'rather alert',
    'neither alert nor sleepy',
    'some signs of sleepiness',
    'sleepy, but no effort to keep awake',
    'sleepy, some effort to keep awake',
    'very sleepy, great effort to keep awake, fighting sleep',
  ]),
});

//-------ALERTNESS TEST (10 counters)-------

// The one alertness test (the player, 2026-09-26: three minutes is far too
// long; one version of at most 10 data points). Rules of the brief
// psychomotor vigilance test (PVT-B; Basner, Mollicone & Dinges 2011): 1-4 s
// from each response to the next stimulus, lapses from 355 ms, reactions under
// 100 ms are false starts; it ends after its 10th stimulus, about 30 s. This
// web version answers with the primary mouse button and dates each stimulus by
// the animation frame that displays it, so its values compare with its own
// history, not with laboratory PVT hardware.
const ALERTNESS_PROTOCOL = Object.freeze({
  id: 'alertness-10-v1',
  stimulusCount: 10,
  isiMinMs: 1000,
  isiMaxMs: 4000,
  feedbackMs: 1000,
  timeoutMs: 30000,
  falseStartBelowMs: 100,
  lapseFromMs: 355,
});

// Why a test stopped early: the page lost the player's attention or the
// player asked to stop. Stopped tests are stored and never scored.
const VIGILANCE_INTERRUPTIONS = Object.freeze({
  visibilitychange: 'tab hidden',
  blur: 'window lost focus',
  pagehide: 'page closed',
  escape: 'Esc pressed',
});

// unitRandom is uniform on [0, 1).
function drawVigilanceIsiMs(unitRandom) {
  return ALERTNESS_PROTOCOL.isiMinMs + unitRandom * (ALERTNESS_PROTOCOL.isiMaxMs - ALERTNESS_PROTOCOL.isiMinMs);
}

function selfCheckMean(values) {
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

function selfCheckMedian(values) {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Every score derives from the stored observations at read time. A reaction
// is the response's event time minus the stimulus frame time; the slowest and
// fastest tenths hold ceil(n / 10) reactions.
function scoreVigilance(vigilance) {
  const p = ALERTNESS_PROTOCOL;
  const reactionsMs = [];
  let anticipationCount = 0;
  let timeoutCount = 0;
  for (const trial of vigilance.trials) {
    if (trial.timedOut === true) {
      timeoutCount++;
    } else if (trial.responseT !== undefined) {
      const reactionMs = trial.responseT - trial.onsetT;
      if (reactionMs < p.falseStartBelowMs) anticipationCount++;
      else reactionsMs.push(reactionMs);
    }
  }
  reactionsMs.sort((a, b) => a - b);
  const speedsPerSec = reactionsMs.map((ms) => 1000 / ms);
  const tenth = Math.ceil(reactionsMs.length / 10);
  const measured = reactionsMs.length > 0;
  return {
    stimulusCount: vigilance.trials.length,
    reactionCount: reactionsMs.length,
    anticipationCount,
    earlyPressCount: vigilance.earlyPresses.length,
    falseStartCount: anticipationCount + vigilance.earlyPresses.length,
    timeoutCount,
    lapseCount: reactionsMs.filter((ms) => ms >= p.lapseFromMs).length + timeoutCount,
    medianReactionMs: selfCheckMedian(reactionsMs),
    meanResponseSpeedPerSec: measured ? selfCheckMean(speedsPerSec) : undefined,
    slowestTenthSpeedPerSec: measured ? selfCheckMean(speedsPerSec.slice(-tenth)) : undefined,
    fastestTenthReactionMs: measured ? selfCheckMean(reactionsMs.slice(0, tenth)) : undefined,
  };
}

// The comparison for a check: earlier complete routine checks only, because
// extra checks are taken when circumstances prompt them.
const SELF_CHECK_BASELINE_COUNT = 10;

function routineBaseline(selfChecks, beforeStartedAt) {
  const earlier = selfChecks
    .filter((check) => check.occasion === 'routine' && check.vigilance.status === 'complete'
      && check.startedAt < beforeStartedAt)
    .sort((a, b) => a.startedAt - b.startedAt)
    .slice(-SELF_CHECK_BASELINE_COUNT);
  const scores = earlier.map((check) => scoreVigilance(check.vigilance));
  const medianOf = (key) => selfCheckMedian(scores.map((s) => s[key]).filter((v) => v !== undefined));
  return {
    checkCount: earlier.length,
    medianReactionMs: medianOf('medianReactionMs'),
    meanResponseSpeedPerSec: medianOf('meanResponseSpeedPerSec'),
    lapseCount: medianOf('lapseCount'),
    falseStartCount: medianOf('falseStartCount'),
    stimulusCount: medianOf('stimulusCount'),
  };
}

//-------STORED RECORD VALIDATION-------

const SELF_CHECK_OCCASIONS = Object.freeze(['routine', 'extra']);

function selfCheckFinite(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function selfCheckObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function validVigilanceTrial(trial) {
  const p = ALERTNESS_PROTOCOL;
  if (!selfCheckObject(trial)) return false;
  if (!(selfCheckFinite(trial.isiMs) && trial.isiMs >= p.isiMinMs && trial.isiMs < p.isiMaxMs)) return false;
  if (!selfCheckFinite(trial.onsetT)) return false;
  if (trial.nextFrameT !== undefined
      && !(selfCheckFinite(trial.nextFrameT) && trial.nextFrameT > trial.onsetT)) return false;
  const responded = trial.responseT !== undefined;
  if (responded) {
    if (!selfCheckFinite(trial.responseT) || !selfCheckFinite(trial.receiptT)
        || typeof trial.pointerType !== 'string') return false;
  } else if (trial.receiptT !== undefined || trial.pointerType !== undefined) {
    return false;
  }
  return trial.timedOut === undefined || (trial.timedOut === true && !responded);
}

function vigilanceTrialResolved(trial) {
  return trial.responseT !== undefined || trial.timedOut === true;
}

function validVigilance(vigilance) {
  if (!selfCheckObject(vigilance) || vigilance.protocol !== ALERTNESS_PROTOCOL.id) return false;
  if (vigilance.status === 'interrupted') {
    const stop = vigilance.interruption;
    if (!selfCheckObject(stop) || !(stop.type in VIGILANCE_INTERRUPTIONS)
        || !selfCheckFinite(stop.t)) return false;
  } else if (vigilance.status !== 'complete' || vigilance.interruption !== undefined) {
    return false;
  }
  if (!selfCheckFinite(vigilance.timeOriginMs) || !selfCheckFinite(vigilance.startT)
      || !selfCheckFinite(vigilance.endT) || vigilance.endT < vigilance.startT) return false;
  if (!Array.isArray(vigilance.trials) || !vigilance.trials.every(validVigilanceTrial)) return false;
  if (vigilance.status === 'complete' ? vigilance.trials.length !== ALERTNESS_PROTOCOL.stimulusCount
    : vigilance.trials.length > ALERTNESS_PROTOCOL.stimulusCount) return false;
  // Only a stop can leave the stimulus on screen unanswered.
  const mustResolve = vigilance.status === 'complete'
    ? vigilance.trials : vigilance.trials.slice(0, -1);
  if (!mustResolve.every(vigilanceTrialResolved)) return false;
  if (!Array.isArray(vigilance.earlyPresses) || !vigilance.earlyPresses.every((press) =>
    selfCheckObject(press) && selfCheckFinite(press.t) && selfCheckFinite(press.receiptT))) return false;
  if (!Number.isInteger(vigilance.frameCount) || vigilance.frameCount < 0) return false;
  return vigilance.frameIntervalMedianMs === undefined
    || (selfCheckFinite(vigilance.frameIntervalMedianMs) && vigilance.frameIntervalMedianMs > 0);
}

// startedAt and endedAt are wall-clock readings; a clock adjustment during a
// check can put endedAt first. Durations come from the vigilance clock.
function validSelfCheck(check) {
  if (!selfCheckObject(check)) return false;
  if (!selfCheckFinite(check.startedAt) || !selfCheckFinite(check.endedAt)) return false;
  if (!validTimeZoneName(check.timeZone) || !validUtcOffsetMin(check.utcOffsetMin)) return false;
  if (!SELF_CHECK_OCCASIONS.includes(check.occasion)) return false;
  const sleepiness = check.sleepiness;
  if (!selfCheckObject(sleepiness) || sleepiness.scale !== SLEEPINESS_SCALE.id
      || !Number.isInteger(sleepiness.rating)
      || sleepiness.rating < 1 || sleepiness.rating > SLEEPINESS_SCALE.labels.length) return false;
  if (check.sleepHoursPast24h !== undefined && !(selfCheckFinite(check.sleepHoursPast24h)
      && check.sleepHoursPast24h >= 0 && check.sleepHoursPast24h <= 24)) return false;
  if (check.note !== undefined && !(typeof check.note === 'string' && check.note.length > 0)) return false;
  if (!validObservedEnvironment(check.environment)) return false;
  return validVigilance(check.vigilance);
}

//-------BACKUP FILE-------

const SELF_CHECK_FILE_FORMAT = 'minesweeper-friendly-self-checks';
const SELF_CHECK_FILE_VERSION = 1;

function selfCheckFile(selfChecks, exportedAt) {
  return {
    format: SELF_CHECK_FILE_FORMAT,
    formatVersion: SELF_CHECK_FILE_VERSION,
    exportedAt,
    selfChecks,
  };
}

// A file that is not a self-check backup is an error; individual invalid
// checks inside a real backup are rejected and counted so the rest survive.
function readSelfCheckFile(parsed) {
  if (!selfCheckObject(parsed) || parsed.format !== SELF_CHECK_FILE_FORMAT) {
    throw new Error('not a self-check backup file');
  }
  if (parsed.formatVersion !== SELF_CHECK_FILE_VERSION) {
    throw new Error('unsupported self-check backup version: ' + parsed.formatVersion);
  }
  if (!Array.isArray(parsed.selfChecks)) throw new Error('self-check backup has no selfChecks list');
  const selfChecks = parsed.selfChecks.filter(validSelfCheck);
  return { selfChecks, rejectedCount: parsed.selfChecks.length - selfChecks.length };
}

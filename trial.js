'use strict';

if (typeof Solver === 'undefined') {
  globalThis.Solver = require('./solver.js');
}

// Trial sessions: hidden board identities, each shown several times
// under a random grid isometry so the player cannot tell a repeat
// from a new board. Full trial is 25×4; short trial is 4×4.

const KINDS = {
  trial: { identities: 25, repeats: 4 },
  'short-trial': { identities: 4, repeats: 4 },
  'test-trial': { identities: 1, repeats: 4 },
};

function kindOf(playMode) {
  const kind = KINDS[playMode];
  if (!kind) throw new Error('not a trial play mode: ' + playMode);
  return kind;
}

function isPlayMode(playMode) {
  return playMode in KINDS;
}

const TRIAL_IDENTITIES = KINDS.trial.identities;
const TRIAL_REPEATS = KINDS.trial.repeats;
const TRIAL_GAMES = TRIAL_IDENTITIES * TRIAL_REPEATS;

const SQUARE_TRANSFORMS = [
  'id', 'rot90', 'rot180', 'rot270', 'flipH', 'flipV', 'flipD', 'flipAD',
];
const RECT_TRANSFORMS = ['id', 'rot180', 'flipH', 'flipV'];

function transformsFor(width, height) {
  return width === height ? SQUARE_TRANSFORMS : RECT_TRANSFORMS;
}

function mapPoint(x, y, width, height, name) {
  switch (name) {
    case 'id': return [x, y];
    case 'rot90': return [height - 1 - y, x];
    case 'rot180': return [width - 1 - x, height - 1 - y];
    case 'rot270': return [y, width - 1 - x];
    case 'flipH': return [width - 1 - x, y];
    case 'flipV': return [x, height - 1 - y];
    case 'flipD': return [y, x];
    case 'flipAD': return [height - 1 - y, width - 1 - x];
    default: throw new Error('unknown trial transform ' + name);
  }
}

const INVERSE_TRANSFORM = {
  id: 'id',
  rot90: 'rot270',
  rot180: 'rot180',
  rot270: 'rot90',
  flipH: 'flipH',
  flipV: 'flipV',
  flipD: 'flipD',
  flipAD: 'flipAD',
};

// Continuous board coordinates, origin top-left, x in [0, width],
// y in [0, height]. Inverse of a presentation isometry puts every
// run of an identity back on the same axes.
function mapPointEdge(x, y, width, height, name) {
  switch (name) {
    case 'id': return [x, y];
    case 'rot90': return [height - y, x];
    case 'rot180': return [width - x, height - y];
    case 'rot270': return [y, width - x];
    case 'flipH': return [width - x, y];
    case 'flipV': return [x, height - y];
    case 'flipD': return [y, x];
    case 'flipAD': return [height - y, width - x];
    default: throw new Error('unknown trial transform ' + name);
  }
}

function invertPointEdge(x, y, width, height, name) {
  const inverse = INVERSE_TRANSFORM[name];
  if (inverse === undefined) throw new Error('unknown trial transform ' + name);
  return mapPointEdge(x, y, width, height, inverse);
}

function mapIndex(index, width, height, name) {
  const x = index % width;
  const y = (index - x) / width;
  const mapped = mapPoint(x, y, width, height, name);
  const outW = (name === 'rot90' || name === 'rot270' || name === 'flipD' || name === 'flipAD')
    ? height : width;
  return mapped[1] * outW + mapped[0];
}

function applyMines(mineAt, width, height, name) {
  if (width !== height && (name === 'rot90' || name === 'rot270' || name === 'flipD' || name === 'flipAD')) {
    throw new Error('transform ' + name + ' needs a square board');
  }
  const out = new Array(mineAt.length).fill(false);
  for (let i = 0; i < mineAt.length; i++) {
    if (mineAt[i]) out[mapIndex(i, width, height, name)] = true;
  }
  return out;
}

function pick(rng, list) {
  if (list.length === 0) throw new Error('cannot pick from an empty list');
  return list[Math.floor(rng() * list.length)];
}

function pickDistinctTransforms(rng, width, height, count) {
  const pool = transformsFor(width, height).slice();
  if (count > pool.length) {
    throw new Error('need ' + count + ' distinct transforms, have ' + pool.length);
  }
  shuffleInPlace(pool, rng);
  return pool.slice(0, count);
}

function shuffleInPlace(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

function buildSchedule(rng, identities, repeats) {
  identities = identities === undefined ? TRIAL_IDENTITIES : identities;
  repeats = repeats === undefined ? TRIAL_REPEATS : repeats;
  const remaining = new Array(identities).fill(repeats);
  const slots = [];
  const minGap = Math.max(2, Math.floor(identities / 2));
  const total = identities * repeats;
  while (slots.length < total) {
    const recent = new Set(slots.slice(-minGap));
    let candidates = [];
    for (let id = 0; id < identities; id++) {
      if (remaining[id] > 0 && !recent.has(id)) candidates.push(id);
    }
    if (candidates.length === 0) {
      for (let id = 0; id < identities; id++) {
        if (remaining[id] > 0) candidates.push(id);
      }
    }
    let most = 0;
    for (const id of candidates) if (remaining[id] > most) most = remaining[id];
    candidates = candidates.filter((id) => remaining[id] === most);
    const id = pick(rng, candidates);
    slots.push(id);
    remaining[id]--;
  }
  return slots;
}

function createSession(boardKey, width, height, mineCount, rng, playMode) {
  playMode = playMode === undefined ? 'trial' : playMode;
  const kind = kindOf(playMode);
  const identities = [];
  for (let i = 0; i < kind.identities; i++) {
    const firstClick = Math.floor(rng() * (width * height));
    identities.push({
      mines: Solver.randomPlacement(width, height, mineCount, firstClick, rng),
      firstClick: firstClick,
      transforms: pickDistinctTransforms(rng, width, height, kind.repeats),
    });
  }
  return {
    playMode: playMode,
    boardKey: boardKey,
    width: width,
    height: height,
    mines: mineCount,
    identities: identities,
    schedule: buildSchedule(rng, kind.identities, kind.repeats),
    nextIndex: 0,
    results: [],
    startedAt: Date.now(),
    endedAt: null,
    endedHow: null,
  };
}

function gameCount(session) {
  return session.schedule.length;
}

function transformForPresentation(session, identityIndex, seen, rng) {
  const identity = session.identities[identityIndex];
  if (identity.transforms !== undefined && identity.transforms[seen] !== undefined) {
    return identity.transforms[seen];
  }
  const pool = transformsFor(session.width, session.height);
  const used = new Set();
  for (const result of session.results) {
    if (result.identityIndex === identityIndex) used.add(result.transform);
  }
  const left = pool.filter((name) => !used.has(name));
  return pick(rng, left.length > 0 ? left : pool);
}

function presentation(session, rng) {
  if (session.nextIndex >= session.schedule.length) return null;
  const identityIndex = session.schedule[session.nextIndex];
  const identity = session.identities[identityIndex];
  let seen = 0;
  for (let i = 0; i < session.nextIndex; i++) {
    if (session.schedule[i] === identityIndex) seen++;
  }
  const transform = transformForPresentation(session, identityIndex, seen, rng);
  return {
    identityIndex: identityIndex,
    transform: transform,
    mines: applyMines(identity.mines, session.width, session.height, transform),
    firstClick: mapIndex(identity.firstClick, session.width, session.height, transform),
  };
}

function recordResult(session, payload) {
  session.results.push(payload);
  session.nextIndex += 1;
}

function skipPresentation(session) {
  if (session.nextIndex >= session.schedule.length) {
    throw new Error('no trial presentation to skip');
  }
  session.nextIndex += 1;
}

function finishSession(session, how) {
  session.endedAt = Date.now();
  session.endedHow = how;
}

function replayProgress(width, height, mineAt, firstClick, events, opts) {
  opts = opts || {};
  const adjacent = Solver.adjacentMap(width, height, mineAt);
  const revealed = opts.givenOpening === false
    ? new Array(mineAt.length).fill(false)
    : Solver.floodOpening(width, height, adjacent, mineAt, firstClick);
  const flagged = new Array(mineAt.length).fill(false);
  let opened = 0;
  for (let i = 0; i < revealed.length; i++) if (revealed[i]) opened++;
  let flags = 0;
  let mineCount = 0;
  for (let i = 0; i < mineAt.length; i++) if (mineAt[i]) mineCount++;
  const safeTotal = mineAt.length - mineCount;
  const tMs = [0];
  const openedAt = [opened];
  const flagsAt = [flags];
  const unopenedAt = [safeTotal - opened];
  const unmarkedAt = [mineCount];
  let dead = false;

  function openedNow() {
    let n = 0;
    for (let i = 0; i < revealed.length; i++) if (revealed[i]) n++;
    return n;
  }

  function reveal(index) {
    if (dead || revealed[index] || flagged[index]) return;
    if (mineAt[index]) {
      dead = true;
      return;
    }
    const stack = [index];
    while (stack.length > 0) {
      const i = stack.pop();
      if (revealed[i] || mineAt[i] || flagged[i]) continue;
      revealed[i] = true;
      if (adjacent[i] === 0) {
        for (const nb of Solver.neighbors(i, width, height)) stack.push(nb);
      }
    }
  }

  function chord(index) {
    if (!revealed[index] || adjacent[index] === 0) return;
    const around = Solver.neighbors(index, width, height);
    let aroundFlags = 0;
    for (const n of around) if (flagged[n]) aroundFlags++;
    if (aroundFlags !== adjacent[index]) return;
    for (const n of around) {
      if (!revealed[n] && !flagged[n]) reveal(n);
    }
  }

  function unmarkedNow() {
    let n = 0;
    for (let i = 0; i < mineAt.length; i++) if (mineAt[i] && !flagged[i]) n++;
    return n;
  }

  function stamp(t) {
    opened = openedNow();
    tMs.push(t);
    openedAt.push(opened);
    flagsAt.push(flags);
    unopenedAt.push(safeTotal - opened);
    unmarkedAt.push(unmarkedNow());
  }

  for (const ev of events) {
    if (dead) break;
    if (ev.kind === 'rdown' && ev.index !== null && ev.index !== undefined) {
      if (!revealed[ev.index]) {
        flagged[ev.index] = !flagged[ev.index];
        flags += flagged[ev.index] ? 1 : -1;
        stamp(ev.t);
      }
    } else if (ev.kind === 'lup' && ev.index !== null && ev.index !== undefined) {
      if (!revealed[ev.index] && !flagged[ev.index]) {
        reveal(ev.index);
        stamp(ev.t);
      } else if (revealed[ev.index]) {
        const before = openedNow();
        chord(ev.index);
        if (dead || openedNow() !== before) stamp(ev.t);
      }
    }
  }
  return {
    tMs: tMs,
    opened: openedAt,
    flags: flagsAt,
    unopened: unopenedAt,
    unmarked: unmarkedAt,
  };
}

function runningPath(sampleT, sampleX, sampleY) {
  const tMs = [];
  const path = [];
  let acc = 0;
  for (let i = 0; i < sampleT.length; i++) {
    if (i > 0) acc += Math.hypot(sampleX[i] - sampleX[i - 1], sampleY[i] - sampleY[i - 1]);
    tMs.push(sampleT[i]);
    path.push(acc);
  }
  return { tMs: tMs, values: path };
}

function runningSpeed(sampleT, sampleX, sampleY) {
  const tMs = [];
  const values = [];
  for (let i = 1; i < sampleT.length; i++) {
    const dt = sampleT[i] - sampleT[i - 1];
    tMs.push(sampleT[i]);
    values.push(dt > 0
      ? Math.hypot(sampleX[i] - sampleX[i - 1], sampleY[i] - sampleY[i - 1]) / dt * 1000
      : undefined);
  }
  return { tMs: tMs, values: values };
}

// Mean of defined samples in successive time windows. widthMs <= 0
// returns the raw series. Empty windows are omitted (a pause gap).
function bucketSeries(tMs, values, widthMs) {
  if (widthMs <= 0) return { tMs: tMs.slice(), values: values.slice() };
  if (tMs.length === 0) return { tMs: [], values: [] };
  const t0 = tMs[0];
  const t1 = tMs[tMs.length - 1];
  const outT = [];
  const outV = [];
  let i = 0;
  for (let start = t0; start <= t1; start += widthMs) {
    const end = start + widthMs;
    while (i < tMs.length && tMs[i] < start) i++;
    let sum = 0;
    let n = 0;
    let j = i;
    while (j < tMs.length && tMs[j] < end) {
      const v = values[j];
      if (v !== undefined && Number.isFinite(v)) {
        sum += v;
        n++;
      }
      j++;
    }
    if (n > 0) {
      outT.push(start + widthMs / 2);
      outV.push(sum / n);
    }
  }
  return { tMs: outT, values: outV };
}

function boardRelativeSamples(sampleT, sampleX, sampleY, events) {
  let layout = null;
  let ei = 0;
  const tMs = [];
  const x = [];
  const y = [];
  for (let i = 0; i < sampleT.length; i++) {
    while (ei < events.length && events[ei].t <= sampleT[i]) {
      if (events[ei].kind === 'layout') layout = events[ei];
      ei++;
    }
    if (layout === null) continue;
    tMs.push(sampleT[i]);
    x.push(sampleX[i] - layout.left);
    y.push(sampleY[i] - layout.top);
  }
  return { tMs: tMs, x: x, y: y };
}

function identityBoardSamples(sampleT, sampleX, sampleY, events, transform, width, height) {
  let layout = null;
  let ei = 0;
  const tMs = [];
  const x = [];
  const y = [];
  for (let i = 0; i < sampleT.length; i++) {
    while (ei < events.length && events[ei].t <= sampleT[i]) {
      if (events[ei].kind === 'layout') layout = events[ei];
      ei++;
    }
    if (layout === null) continue;
    const cellW = layout.width / (layout.boardWidth || width);
    const cellH = layout.height / (layout.boardHeight || height);
    const presentedX = (sampleX[i] - layout.left) / cellW;
    const presentedY = (sampleY[i] - layout.top) / cellH;
    const ident = invertPointEdge(
      presentedX, presentedY, width, height, transform);
    tMs.push(sampleT[i]);
    x.push(ident[0] * cellW);
    y.push(ident[1] * cellH);
  }
  return { tMs: tMs, x: x, y: y };
}

function groupedResults(session) {
  const groups = [];
  for (let id = 0; id < session.identities.length; id++) {
    const attempts = session.results.filter((r) => r.identityIndex === id);
    groups.push({ identityIndex: id, attempts: attempts });
  }
  return groups;
}

function meanOf(xs) {
  if (xs.length === 0) return null;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function attemptSeconds(attempt) {
  return attempt.timeMs / 1000;
}

function attemptBvS(attempt) {
  const seconds = attempt.timeMs / 1000;
  return seconds > 0 ? attempt.bv3 / seconds : null;
}

function statsOfAttempts(attempts) {
  const winTimes = [];
  const winBvS = [];
  let wins = 0;
  for (const attempt of attempts) {
    if (attempt.outcome !== 'win') continue;
    wins++;
    winTimes.push(attemptSeconds(attempt));
    const bvs = attemptBvS(attempt);
    if (bvs !== null) winBvS.push(bvs);
  }
  return {
    n: attempts.length,
    wins: wins,
    losses: attempts.length - wins,
    winRate: attempts.length === 0 ? null : wins / attempts.length,
    meanTime: meanOf(winTimes),
    meanBvS: meanOf(winBvS),
  };
}

// Meeting-index aggregates. withinMean is seconds faster on the last
// win vs the first win of an identity (positive = later faster).
function sessionSummary(session) {
  const groups = groupedResults(session);
  let maxShow = 0;
  for (const group of groups) {
    if (group.attempts.length > maxShow) maxShow = group.attempts.length;
  }
  const showings = [];
  for (let k = 0; k < maxShow; k++) {
    const bucket = [];
    for (const group of groups) {
      if (group.attempts[k] !== undefined) bucket.push(group.attempts[k]);
    }
    showings.push(statsOfAttempts(bucket));
  }

  const firstMeetings = [];
  const laterMeetings = [];
  const withinDeltas = [];
  let identitiesPlayed = 0;
  for (const group of groups) {
    if (group.attempts.length === 0) continue;
    identitiesPlayed++;
    firstMeetings.push(group.attempts[0]);
    for (let i = 1; i < group.attempts.length; i++) laterMeetings.push(group.attempts[i]);
    const winTimes = [];
    for (const attempt of group.attempts) {
      if (attempt.outcome === 'win') winTimes.push(attemptSeconds(attempt));
    }
    if (winTimes.length >= 2) {
      withinDeltas.push(winTimes[0] - winTimes[winTimes.length - 1]);
    }
  }

  return {
    identitiesPlayed: identitiesPlayed,
    identitiesWithTwoWins: withinDeltas.length,
    showings: showings,
    firstMeetings: statsOfAttempts(firstMeetings),
    laterMeetings: statsOfAttempts(laterMeetings),
    withinMean: meanOf(withinDeltas),
  };
}

const Trial = {
  KINDS: KINDS,
  IDENTITIES: TRIAL_IDENTITIES,
  REPEATS: TRIAL_REPEATS,
  GAMES: TRIAL_GAMES,
  kindOf: kindOf,
  isPlayMode: isPlayMode,
  gameCount: gameCount,
  transformsFor: transformsFor,
  mapIndex: mapIndex,
  applyMines: applyMines,
  pickDistinctTransforms: pickDistinctTransforms,
  transformForPresentation: transformForPresentation,
  buildSchedule: buildSchedule,
  createSession: createSession,
  presentation: presentation,
  recordResult: recordResult,
  skipPresentation: skipPresentation,
  finishSession: finishSession,
  groupedResults: groupedResults,
  sessionSummary: sessionSummary,
  replayProgress: replayProgress,
  runningPath: runningPath,
  runningSpeed: runningSpeed,
  bucketSeries: bucketSeries,
  boardRelativeSamples: boardRelativeSamples,
  identityBoardSamples: identityBoardSamples,
  invertPointEdge: invertPointEdge,
  mapPointEdge: mapPointEdge,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Trial;

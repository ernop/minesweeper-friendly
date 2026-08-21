'use strict';

if (typeof Solver === 'undefined') {
  globalThis.Solver = require('./solver.js');
}

// Trial sessions: 25 board identities, each shown 4 times under a random
// grid isometry so the player cannot tell a repeat from a new board.

const TRIAL_IDENTITIES = 25;
const TRIAL_REPEATS = 4;
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
  return list[Math.floor(rng() * list.length)];
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

function buildSchedule(rng) {
  const slots = [];
  for (let id = 0; id < TRIAL_IDENTITIES; id++) {
    for (let r = 0; r < TRIAL_REPEATS; r++) slots.push(id);
  }
  shuffleInPlace(slots, rng);
  for (let i = 2; i < slots.length; i++) {
    if (slots[i] === slots[i - 1] && slots[i] === slots[i - 2]) {
      for (let j = i + 1; j < slots.length; j++) {
        if (slots[j] !== slots[i]) {
          const tmp = slots[i];
          slots[i] = slots[j];
          slots[j] = tmp;
          break;
        }
      }
    }
  }
  return slots;
}

function createSession(boardKey, width, height, mineCount, rng) {
  const identities = [];
  for (let i = 0; i < TRIAL_IDENTITIES; i++) {
    const firstClick = Math.floor(rng() * (width * height));
    identities.push({
      mines: Solver.randomPlacement(width, height, mineCount, firstClick, rng),
      firstClick: firstClick,
    });
  }
  return {
    boardKey: boardKey,
    width: width,
    height: height,
    mines: mineCount,
    identities: identities,
    schedule: buildSchedule(rng),
    nextIndex: 0,
    results: [],
    startedAt: Date.now(),
    endedAt: null,
    endedHow: null,
  };
}

function presentation(session, rng) {
  if (session.nextIndex >= session.schedule.length) return null;
  const identityIndex = session.schedule[session.nextIndex];
  const identity = session.identities[identityIndex];
  const transform = pick(rng, transformsFor(session.width, session.height));
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

function finishSession(session, how) {
  session.endedAt = Date.now();
  session.endedHow = how;
}

function groupedResults(session) {
  const groups = [];
  for (let id = 0; id < session.identities.length; id++) {
    const attempts = session.results.filter((r) => r.identityIndex === id);
    groups.push({ identityIndex: id, attempts: attempts });
  }
  return groups;
}

const Trial = {
  IDENTITIES: TRIAL_IDENTITIES,
  REPEATS: TRIAL_REPEATS,
  GAMES: TRIAL_GAMES,
  transformsFor: transformsFor,
  mapIndex: mapIndex,
  applyMines: applyMines,
  buildSchedule: buildSchedule,
  createSession: createSession,
  presentation: presentation,
  recordResult: recordResult,
  finishSession: finishSession,
  groupedResults: groupedResults,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Trial;

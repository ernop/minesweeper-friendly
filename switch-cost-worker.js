'use strict';

// The stats panel's switch cost off the page thread: reads the saved traces
// of the latest standard games straight from IndexedDB, replays them, and
// fits the estimate (switch-cost.js). It only reads. The page's storage.js
// owns opening and upgrading the database and sends its name and version
// with the candidate games, newest first. Each saved game's transitions stay
// in this worker's memory for the page's lifetime, so a finished game costs
// one trace read, not a window's worth.

// solver.js builds on Justice, so justice.js loads first (as in training-worker.js).
importScripts('justice.js?v=20260926-fast-evidence', 'rng.js', 'solver.js?v=20260823-exact-solver',
  'training-core.js?v=20260928-switch-cost', 'switch-cost.js?v=20260928-switch-cost');

const switchCostDeps = {
  training: TrainingCore,
  randomPlacement: Solver.randomPlacement,
  fromSeed: GameRandom.fromSeed,
  rngVersion: GameRandom.VERSION,
};
// endedAt -> { endedAt, rows } for saved traces; games without a saved trace
// are read again next time, because a just-finished game's trace may not
// have been committed when an earlier request listed it.
const switchCostGames = new Map();

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openSavedDatabase(database) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database.name, database.version);
    // Reachable only if the database was deleted after the page opened it.
    // Creating an empty one here would hide the game's schema from it.
    request.onupgradeneeded = () => {
      request.transaction.abort();
      reject(new Error('the saved-game database disappeared while this page was loading; reload the game'));
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function savedGame(db, database, candidate) {
  if (switchCostGames.has(candidate.endedAt)) return switchCostGames.get(candidate.endedAt);
  const trace = await requestResult(db.transaction(database.traceStore)
    .objectStore(database.traceStore).get(candidate.endedAt));
  if (trace === undefined) return null;
  const game = { endedAt: candidate.endedAt,
    rows: SwitchCost.gameRows(trace, candidate.outcome, SwitchCost.KEYS[candidate.key], switchCostDeps).rows };
  switchCostGames.set(candidate.endedAt, game);
  return game;
}

// The analysis-client lane protocol: { id, kind, payload } in, { id, result }
// or { id, error } out. The one kind, 'estimate', carries the database
// identity and the candidate games.
self.onmessage = async ({ data: { id, kind, payload } }) => {
  try {
    if (kind !== 'estimate') throw new Error('Unknown switch cost task: ' + kind);
    const { database, candidates } = payload;
    const db = await openSavedDatabase(database);
    let games;
    try {
      games = await SwitchCost.window(candidates, (candidate) => savedGame(db, database, candidate));
    } finally {
      db.close();
    }
    self.postMessage({ id, result: SwitchCost.fit(games) });
  } catch (error) {
    self.postMessage({ id, error: kind + ': ' + error.message });
  }
};

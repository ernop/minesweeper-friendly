'use strict';

// The session stats' switch cost off the page thread: reads the saved traces
// of standard games straight from IndexedDB, replays them, and fits the
// estimate (switch-cost.js) for two pools, the session window's games and the
// latest 500. It only reads. The page's storage.js owns opening and upgrading
// the database and sends its name and version with the candidate games,
// newest first, and the session window's start. Each saved game's transitions
// stay in this worker's memory for the page's lifetime, so a finished game
// costs one trace read, not a window's worth.

// solver.js builds on Justice, so justice.js loads first (as in training-worker.js).
importScripts('justice.js?v=20260926-fast-evidence', 'rng.js', 'solver.js?v=20260823-exact-solver',
  'training-core.js?v=20260928-switch-cost', 'switch-cost.js?v=20261008-session-row');

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
// The previous request's fits, keyed by their games' end times. Saved rows
// never change, so the same games give the same fit: picking another session
// leaves the latest 500 games, and their fit, as they were.
let previousFits = new Map();

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
// identity, the candidate games, and the session window's start, and answers
// { session, latest }, one SwitchCost.fit result per pool.
self.onmessage = async ({ data: { id, kind, payload } }) => {
  try {
    if (kind !== 'estimate') throw new Error('Unknown switch cost task: ' + kind);
    const { database, candidates, sessionFromMs } = payload;
    const db = await openSavedDatabase(database);
    const gameOf = (candidate) => savedGame(db, database, candidate);
    let latest;
    let session;
    try {
      latest = await SwitchCost.window(candidates, gameOf);
      session = await SwitchCost.since(candidates, sessionFromMs, gameOf);
    } finally {
      db.close();
    }
    const fits = new Map();
    const fitOf = (games) => {
      const key = games.map((game) => game.endedAt).join(' ');
      if (!fits.has(key)) fits.set(key, previousFits.has(key) ? previousFits.get(key) : SwitchCost.fit(games));
      return fits.get(key);
    };
    const result = { session: fitOf(session), latest: fitOf(latest) };
    previousFits = fits;
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: kind + ': ' + error.message });
  }
};

'use strict';

// Game data's switch cost line off the page thread: reads the saved traces
// of standard games straight from IndexedDB, replays them, and fits the
// estimate (switch-cost.js) for three pools, the session window's games, the
// latest 500, and the 500 before those, then prices the shown game's switches
// at the latest 500's estimate. It only reads. The page's storage.js owns
// opening and upgrading the database and sends its name and version with the
// candidate games, newest first, the session window's start, and the shown
// game's end time. Each saved game's transitions stay in this worker's memory
// for the page's lifetime, so a finished game costs one trace read, not a
// window's worth.

// solver.js builds on Justice, so justice.js loads first (as in training-worker.js).
importScripts('justice.js?v=20261026-move-hierarchy', 'rng.js', 'solver.js?v=20261021-ng-removed',
  'training-core.js?v=20261015-click-share', 'switch-cost.js?v=20261020-switch-cost-per-game');

const switchCostDeps = {
  training: TrainingCore,
  randomPlacement: Solver.randomPlacement,
  fromSeed: GameRandom.fromSeed,
  rngVersion: GameRandom.VERSION,
};
// endedAt -> { endedAt, key, rows } for saved traces; games without a saved trace
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
  const game = { endedAt: candidate.endedAt, key: candidate.key,
    rows: SwitchCost.gameRows(trace, candidate.outcome, SwitchCost.KEYS[candidate.key], switchCostDeps).rows };
  switchCostGames.set(candidate.endedAt, game);
  return game;
}

// The analysis-client lane protocol: { id, kind, payload } in, { id, result }
// or { id, error } out. The one kind, 'estimate', carries the database
// identity, the candidate games, the session window's start, and the shown
// game's end time (null when no game data shows), and answers { session,
// latest, earlier, shown }: per pool a SwitchCost.fit result with its
// `perGame` (SwitchCost.perGame), and the shown game's SwitchCost.game at the
// latest 500's estimate, with its endedAt; shown is null when that game is
// not a counted one: not a standard game, no saved trace, or no timed move.
self.onmessage = async ({ data: { id, kind, payload } }) => {
  try {
    if (kind !== 'estimate') throw new Error('Unknown switch cost task: ' + kind);
    const { database, candidates, sessionFromMs, shownEndedAt } = payload;
    const db = await openSavedDatabase(database);
    const gameOf = (candidate) => savedGame(db, database, candidate);
    let windows;
    let session;
    let shownGame = null;
    try {
      windows = await SwitchCost.windows(candidates, gameOf);
      session = await SwitchCost.since(candidates, sessionFromMs, gameOf);
      const shownCandidate = candidates.find((candidate) => candidate.endedAt === shownEndedAt);
      const game = shownCandidate === undefined ? null : await gameOf(shownCandidate);
      if (game !== null && game.rows.length > 0) shownGame = game;
    } finally {
      db.close();
    }
    const fits = new Map();
    const fitOf = (games) => {
      const key = games.map((game) => game.endedAt).join(' ');
      if (!fits.has(key)) {
        if (previousFits.has(key)) fits.set(key, previousFits.get(key));
        else {
          const fit = SwitchCost.fit(games);
          fits.set(key, { ...fit, perGame: SwitchCost.perGame(games, fit) });
        }
      }
      return fits.get(key);
    };
    const latest = fitOf(windows.latest);
    const result = { session: fitOf(session), latest, earlier: fitOf(windows.earlier),
      shown: shownGame === null ? null : { endedAt: shownGame.endedAt, ...SwitchCost.game(shownGame.rows, latest) } };
    previousFits = fits;
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: kind + ': ' + error.message, stack: error.stack });
  }
};

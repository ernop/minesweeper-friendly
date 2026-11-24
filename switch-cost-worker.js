'use strict';

// Training page's button switch cost off the page thread: reads the saved
// records and traces of flagged standard games straight from IndexedDB,
// replays them, filters to short-range flag/chord transitions (at most
// SwitchCost.MAX_CELLS squares apart), and fits the latest and earlier
// 500-game windows (switch-cost.js) plus their two-sample comparison.
// It only reads. The page's storage.js owns opening and upgrading the
// database and sends its names and version.

// solver.js builds on GuardianAngel, so guardian-angel.js loads first (as in training-worker.js).
importScripts('guardian-angel.js?v=20261123-guardian-angel-2', 'rng.js', 'solver.js?v=20261123-guardian-angel',
  'training-core.js?v=20261123-guardian-angel', 'switch-cost.js?v=20261124-switch-cost-w1');

const switchCostDeps = {
  training: TrainingCore,
  randomPlacement: Solver.randomPlacement,
  fromSeed: GameRandom.fromSeed,
  rngVersion: GameRandom.VERSION,
};

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

// Judged standard games across Beginner, Intermediate, and Expert that placed
// at least one flag (no-mark and flag-blocked games excluded), newest first.
async function readFlaggedStandardCandidates(db, database) {
  const store = db.transaction(database.recordStore).objectStore(database.recordStore);
  let totalStandardGames = 0;
  const candidates = [];
  for (const key of Object.keys(SwitchCost.KEYS)) {
    const records = await requestResult(store.getAll(
      IDBKeyRange.bound([key, -Infinity], [key, Infinity])));
    for (const record of records) {
      if (record.evaluationPending === true) continue;
      totalStandardGames++;
      if (record.flagsPlaced > 0 && !record.flagsBlocked) {
        candidates.push({ endedAt: record.endedAt, key, outcome: record.outcome });
      }
    }
  }
  candidates.sort((a, b) => b.endedAt - a.endedAt);
  return { totalStandardGames, candidates };
}

async function savedGame(db, database, candidate) {
  const trace = await requestResult(db.transaction(database.traceStore)
    .objectStore(database.traceStore).get(candidate.endedAt));
  if (trace === undefined) return null;
  const allRows = SwitchCost.gameRows(trace, candidate.outcome, SwitchCost.KEYS[candidate.key], switchCostDeps).rows;
  return { endedAt: candidate.endedAt, key: candidate.key, rows: SwitchCost.shortRangeRows(allRows) };
}

self.onmessage = async ({ data: { database } }) => {
  try {
    const db = await openSavedDatabase(database);
    let totalStandardGames;
    let candidates;
    let windows;
    try {
      ({ totalStandardGames, candidates } = await readFlaggedStandardCandidates(db, database));
      windows = await SwitchCost.windows(candidates, (candidate) => savedGame(db, database, candidate));
    } finally {
      db.close();
    }
    const fitPool = (games) => {
      const fit = SwitchCost.fit(games);
      return { ...fit, perGame: SwitchCost.perGame(games, fit) };
    };
    const latest = fitPool(windows.latest);
    const earlier = fitPool(windows.earlier);
    self.postMessage({
      switchCost: {
        windowGames: SwitchCost.WINDOW_GAMES,
        minGames: SwitchCost.MIN_GAMES,
        maxCells: SwitchCost.MAX_CELLS,
        totalStandardGames,
        totalFlaggedGames: candidates.length,
        latest,
        earlier,
        comparison: SwitchCost.compare(latest, earlier),
      },
    });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};

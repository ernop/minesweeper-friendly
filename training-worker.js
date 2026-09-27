'use strict';

// Training summary off the page thread: reads the saved history and the
// latest Expert wins' traces straight from IndexedDB, replays them, and
// posts the summary. It only reads. The page's storage.js owns opening and
// upgrading the database and sends the names and version it opened.

importScripts('justice.js?v=20260926-fast-evidence', 'solver.js?v=20260823-exact-solver', 'rng.js',
  'game/evaluation.js?v=20260926-noop-reasons', 'training-core.js?v=20260927-openings');

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

async function readTrainingInput(database) {
  const db = await openSavedDatabase(database);
  try {
    const records = await requestResult(db.transaction(database.recordStore)
      .objectStore(database.recordStore)
      .getAll(IDBKeyRange.bound([TrainingCore.KEY, -Infinity], [TrainingCore.KEY, Infinity])));
    if (records.length === 0) return { records: null, traces: [] };
    const recentWins = records.filter((r) => r.outcome === 'win')
      .sort((a, b) => a.endedAt - b.endedAt).slice(-TrainingCore.RECENT_WINS);
    const traceStore = db.transaction(database.traceStore).objectStore(database.traceStore);
    const traces = await Promise.all(recentWins.map((r) => requestResult(traceStore.get(r.endedAt))));
    return { records, traces };
  } finally {
    db.close();
  }
}

const trainingDeps = {
  randomPlacement: Solver.randomPlacement,
  fromSeed: GameRandom.fromSeed,
  rngVersion: GameRandom.VERSION,
  fatalKindOf: (record) => {
    const fatal = fatalEvaluationOf(record);
    return fatal === undefined || fatal.legacy ? undefined : fatalActionStatusKind(fatal);
  },
};

self.onmessage = async ({ data: { database } }) => {
  try {
    const { records, traces } = await readTrainingInput(database);
    self.postMessage({ summary: records === null ? null : TrainingCore.summary(records, traces, trainingDeps) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};

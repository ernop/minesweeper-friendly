'use strict';

// Training summary off the page thread: reads the saved history and the
// latest Expert wins' traces straight from IndexedDB, replays them, and
// posts the summary. It only reads. The page's storage.js owns opening and
// upgrading the database and sends the names and version it opened.

importScripts('guardian-angel.js?v=20261123-guardian-angel-2', 'coach.js?v=20261125-coach-m1',
  'solver.js?v=20261123-guardian-angel', 'rng.js',
  'game/evaluation.js?v=20261127-tom-replay', 'game-data.js?v=20261125-rank-r1',
  'training-core.js?v=20261125-mindmap-1');

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

// A game whose evaluation is pending (the game page saves it before judging
// it, and judges it at its next load if it closed first) is not counted
// until it is judged.
async function readTrainingInput(database) {
  const db = await openSavedDatabase(database);
  try {
    const store = db.transaction(database.recordStore).objectStore(database.recordStore);
    const records = (await requestResult(
      store.getAll(IDBKeyRange.bound([TrainingCore.KEY, -Infinity], [TrainingCore.KEY, Infinity]))))
      .filter((record) => record.evaluationPending !== true);
    const allKeys = await requestResult(store.getAllKeys());
    const coachHistoryKeys = [...new Set(allKeys
      .map((entry) => entry[0])
      .filter((historyKey) => typeof historyKey === 'string' && historyKey.includes('@coach-')))];
    const coachLists = await Promise.all(coachHistoryKeys.map((historyKey) =>
      requestResult(store.getAll(IDBKeyRange.bound([historyKey, -Infinity], [historyKey, Infinity])))));
    const coachRecords = coachLists.flat().filter((record) => record.evaluationPending !== true);
    if (records.length === 0 && coachRecords.length === 0) {
      return { records: null, coachRecords: [], traces: [] };
    }
    const recentWins = records.filter((r) => r.outcome === 'win')
      .sort((a, b) => a.endedAt - b.endedAt).slice(-TrainingCore.RECENT_WINS);
    const traceStore = db.transaction(database.traceStore).objectStore(database.traceStore);
    const traces = await Promise.all(recentWins.map((r) => requestResult(traceStore.get(r.endedAt))));
    return { records, coachRecords, traces };
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
    const { records, coachRecords, traces } = await readTrainingInput(database);
    self.postMessage({
      summary: records === null ? null : TrainingCore.summary(records, traces, trainingDeps, coachRecords),
    });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};

'use strict';

// Cross-size trace mind-map off the page thread: reads recent traced Standard
// wins across Beginner, Intermediate, and Expert from IndexedDB, runs exact
// level-by-level proof analysis and pointer-trace reconstruction (mind-map.js),
// and posts the highlights, ranked traits, visual technique catalog, and
// recent Expert game thinking traces. Read-only.

importScripts('guardian-angel.js?v=20261123-guardian-angel-2', 'rng.js',
  'solver.js?v=20261123-guardian-angel', 'coach.js?v=20261125-coach-m1',
  'game-data.js?v=20261125-rank-r1', 'training-core.js?v=20261125-mindmap-1',
  'mind-map.js?v=20261125-mindmap-1');

const mindMapDeps = {
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
    request.onupgradeneeded = () => {
      request.transaction.abort();
      reject(new Error('the saved-game database disappeared while this page was loading; reload the game'));
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readMindMapInput(database) {
  const db = await openSavedDatabase(database);
  try {
    const entries = Object.entries(MindMap.KEYS);
    const recordStore = db.transaction(database.recordStore).objectStore(database.recordStore);
    const recordLists = await Promise.all(entries.map(([key]) =>
      requestResult(recordStore.getAll(IDBKeyRange.bound([key, -Infinity], [key, Infinity])))));

    const picks = [];
    let expertRecords = [];
    entries.forEach(([, spec], idx) => {
      const records = recordLists[idx].filter((r) => r.evaluationPending !== true);
      if (spec.level === 'Expert') expertRecords = records;
      const wins = records.filter((r) => r.outcome === 'win')
        .sort((a, b) => a.endedAt - b.endedAt)
        .slice(-MindMap.SAMPLE_CAPS[spec.level]);
      const cap = wins.length;
      wins.forEach((record, i) => {
        picks.push({
          record,
          spec,
          isRecentExpert: spec.level === 'Expert' && (cap - i <= MindMap.RECENT_EXPERT_TRACES),
        });
      });
    });

    if (picks.length === 0) return { picks: [], traces: [], expertRecords };
    const traceStore = db.transaction(database.traceStore).objectStore(database.traceStore);
    const traces = await Promise.all(picks.map((p) => requestResult(traceStore.get(p.record.endedAt))));
    return { picks, traces, expertRecords };
  } finally {
    db.close();
  }
}

self.onmessage = async ({ data: { database } }) => {
  try {
    const { picks, traces, expertRecords } = await readMindMapInput(database);
    const analyzed = [];
    for (let i = 0; i < picks.length; i++) {
      const trace = traces[i];
      if (trace === undefined) continue;
      const { record, spec, isRecentExpert } = picks[i];
      const result = MindMap.analyzeGame(record, trace, spec, mindMapDeps, {
        scanPointer: spec.level === 'Expert',
        captureCrops: isRecentExpert,
        buildEpisodes: isRecentExpert,
      });
      if (result !== null) analyzed.push(result);
    }
    self.postMessage({
      mindMap: analyzed.length === 0 ? null : MindMap.summarize(analyzed, expertRecords),
    });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};

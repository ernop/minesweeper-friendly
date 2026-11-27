'use strict';

// Cross-size trace mind-map off the page thread: reads recent traced Standard
// wins across Beginner, Intermediate, and Expert from IndexedDB, runs exact
// level-by-level proof analysis and pointer-trace reconstruction (mind-map.js),
// and posts the highlights, ranked traits, visual technique catalog, and
// recent Expert game thinking traces. Read-only.

importScripts('guardian-angel.js?v=20261123-guardian-angel-2', 'rng.js',
  'solver.js?v=20261123-guardian-angel', 'coach.js?v=20261125-coach-m1',
  'game-data.js?v=20261125-rank-r1', 'training-core.js?v=20261125-mindmap-1',
  'mind-map.js?v=20261127-mentation-nav');

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
    const lossPicks = [];
    let expertRecords = [];
    entries.forEach(([, spec], idx) => {
      const records = recordLists[idx].filter((r) => r.evaluationPending !== true);
      if (spec.level === 'Expert') {
        expertRecords = records;
        const lateLosses = records
          .filter((r) => r.outcome === 'loss' && r.timeMs >= MindMap.LOSS_MIN_MS)
          .sort((a, b) => a.endedAt - b.endedAt)
          .slice(-MindMap.SAMPLE_CAPS.ExpertLoss);
        for (const record of lateLosses) {
          lossPicks.push({ record, spec });
        }
      }
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

    if (picks.length === 0 && lossPicks.length === 0) {
      return { picks: [], traces: [], lossPicks: [], lossTraces: [], expertRecords };
    }
    const traceStore = db.transaction(database.traceStore).objectStore(database.traceStore);
    const [traces, lossTraces] = await Promise.all([
      Promise.all(picks.map((p) => requestResult(traceStore.get(p.record.endedAt)))),
      Promise.all(lossPicks.map((p) => requestResult(traceStore.get(p.record.endedAt)))),
    ]);
    return { picks, traces, lossPicks, lossTraces, expertRecords };
  } finally {
    db.close();
  }
}

async function readSingleTrace(database, endedAt) {
  const db = await openSavedDatabase(database);
  try {
    const traceStore = db.transaction(database.traceStore).objectStore(database.traceStore);
    return await requestResult(traceStore.get(endedAt));
  } finally {
    db.close();
  }
}

self.onmessage = async ({ data }) => {
  if (data && data.action === 'inspect') {
    const { database, record, spec, requestId } = data;
    try {
      const trace = await readSingleTrace(database, record.endedAt);
      if (trace === undefined) {
        self.postMessage({ action: 'inspect', requestId, error: 'No saved trace found for this game.' });
        return;
      }
      const inspection = MindMap.inspectGame(record, trace, spec, mindMapDeps);
      if (inspection === null) {
        self.postMessage({ action: 'inspect', requestId, error: 'Saved trace could not be replayed on this board.' });
        return;
      }
      self.postMessage({ action: 'inspect', requestId, inspection });
    } catch (error) {
      self.postMessage({ action: 'inspect', requestId, error: error.message });
    }
    return;
  }

  try {
    const { database } = data;
    const { picks, traces, lossPicks, lossTraces, expertRecords } = await readMindMapInput(database);
    const analyzed = [];
    const inspectableWins = [];
    for (let i = 0; i < picks.length; i++) {
      const trace = traces[i];
      if (trace === undefined) continue;
      const { record, spec, isRecentExpert } = picks[i];
      const result = MindMap.analyzeGame(record, trace, spec, mindMapDeps, {
        scanPointer: spec.level === 'Expert',
        captureCrops: isRecentExpert,
        buildEpisodes: isRecentExpert,
      });
      if (result !== null) {
        analyzed.push(result);
        inspectableWins.push({
          endedAt: record.endedAt,
          outcome: 'win',
          timeMs: record.timeMs,
          bv3: record.bv3,
          bvs: record.bv3 / (record.timeMs / 1000),
          boardChangingClicks: record.boardChangingClicks,
          noOpClicks: record.noOpClicks,
          seed: record.seed,
          rngVersion: record.rngVersion,
          boardVersion: record.boardVersion,
          spec,
        });
      }
    }

    const analyzedLosses = [];
    const inspectableLosses = [];
    for (let i = 0; i < lossPicks.length; i++) {
      const trace = lossTraces[i];
      if (trace === undefined) continue;
      const { record, spec } = lossPicks[i];
      const lossRes = MindMap.analyzeLoss(record, trace, spec, mindMapDeps);
      if (lossRes !== null) {
        analyzedLosses.push(lossRes);
        inspectableLosses.push({
          endedAt: record.endedAt,
          outcome: 'loss',
          timeMs: record.timeMs,
          bv3: record.bv3,
          bvs: record.bv3 / (record.timeMs / 1000),
          boardChangingClicks: record.boardChangingClicks,
          noOpClicks: record.noOpClicks,
          seed: record.seed,
          rngVersion: record.rngVersion,
          boardVersion: record.boardVersion,
          spec,
        });
      }
    }

    const sortNewest = (a, b) => b.endedAt - a.endedAt;
    const inspectableGames = [
      ...inspectableWins.filter((g) => g.spec.level === 'Expert').sort(sortNewest).slice(0, MindMap.RECENT_EXPERT_TRACES),
      ...inspectableLosses.sort(sortNewest).slice(0, MindMap.RECENT_LOSS_TRACES),
      ...inspectableWins.filter((g) => g.spec.level === 'Intermediate').sort(sortNewest).slice(0, 6),
      ...inspectableWins.filter((g) => g.spec.level === 'Beginner').sort(sortNewest).slice(0, 6),
    ];

    self.postMessage({
      mindMap: analyzed.length === 0 ? null : MindMap.summarize(analyzed, expertRecords, analyzedLosses, inspectableGames),
    });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};

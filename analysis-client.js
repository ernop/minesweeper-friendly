"use strict";

const analysisLanes = new Map();
let analysisRequestId = 0;

function analysisFailure(error) {
  const message = 'Analysis failed: ' + error.message;
  backupStatus.textContent = message;
  backupStatus.setAttribute('role', 'alert');
  throw error;
}

async function analysisTask(lane, kind, payload) {
  let state = analysisLanes.get(lane);
  if (!state) {
    const worker = new Worker('analysis-worker.js?v=20260925-worker-analysis');
    state = { worker, pending: new Map(), error: null };
    analysisLanes.set(lane, state);
    worker.onmessage = ({ data }) => {
      const request = state.pending.get(data.id);
      if (!request) throw new Error('Unknown analysis reply ' + data.id);
      state.pending.delete(data.id);
      if (data.error) request.reject(new Error(data.error));
      else request.resolve(data.result);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      state.error = new Error(lane + ' worker: ' + event.message);
      worker.terminate();
      for (const request of state.pending.values()) request.reject(state.error);
      state.pending.clear();
      analysisFailure(state.error);
    };
  }
  if (state.error) return Promise.reject(state.error);
  return new Promise((resolve, reject) => {
    const id = ++analysisRequestId;
    state.pending.set(id, { resolve, reject });
    try { state.worker.postMessage({ id, kind, payload }); }
    catch (error) { state.pending.delete(id); reject(error); }
  });
}

// Rendering yields to input between sections; workers own the calculations.
const ANALYSIS_PRESENTATION_BUDGET_MS = 4;
let analysisPresentationStartedAt = 0;
function yieldAnalysisPresentation() {
  if (performance.now() - analysisPresentationStartedAt < ANALYSIS_PRESENTATION_BUDGET_MS) return Promise.resolve();
  return new Promise((resolve) => setTimeout(() => {
    analysisPresentationStartedAt = performance.now();
    resolve();
  }, 0));
}

// Reports need scalar game facts and the small board-measurement object.
// Raw action evidence belongs to replay, not every ranking-worker message.
function analysisRecord(record) {
  return Object.fromEntries(Object.entries(record).filter(([key, value]) =>
    key === 'boardMetrics' || value === null || typeof value !== 'object'));
}

function analysisRecordSnapshot(record, records, options = {}) {
  const facts = new Map(records.map((entry) => [entry, analysisRecord(entry)]));
  const fact = (entry) => facts.has(entry) ? facts.get(entry) : analysisRecord(entry);
  return { record: fact(record), records: records.map((entry) => facts.get(entry)),
    options: { ...options, ...(options.boardRecord ? { boardRecord: fact(options.boardRecord) } : {}) } };
}

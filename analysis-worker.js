"use strict";

importScripts('trend-fit.js?v=20260925-worker-analysis',
  'game/trace-metrics.js?v=20261107-one-move-line',
  'game/evaluation.js?v=20261107-one-move-line',
  'game-data.js?v=20261027-field-names', 'game/metric-definitions.js?v=20261107-one-move-line',
  'board-shape.js?v=20261020-no-left-panel', 'zini.js?v=20261020-no-left-panel', 'board-metrics.js?v=20261020-no-left-panel',
  'game/rankings.js?v=20261107-one-move-line',
  'game/charts.js?v=20261107-one-move-line', 'game/game-data-chart.js?v=20261107-one-move-line',
  'justice.js?v=20261103-worker-evaluation', 'odds.js?v=20261103-worker-evaluation', 'board-icons.js?v=20261105-glyph-sizes',
  'game/replay-model.js?v=20261107-one-move-line',
  'during-game.js?v=20261103-worker-evaluation');

let config;

// The latest finished or restored game's trace and final board, and the
// during-the-game model built from them on first request: the rows read the
// game by its endedAt, so the after-game window clones the trace only once.
let duringGameSource = null;
let duringGameModel = null;

function holdDuringGameSource(source) {
  duringGameSource = source;
  duringGameModel = null;
}

function heldDuringGameSource(gameId) {
  if (duringGameSource === null || duringGameSource.id !== gameId) {
    throw new Error('game ' + gameId + ' is not the latest finished or restored game');
  }
  return duringGameSource;
}

function heldDuringGameModel(data) {
  const source = heldDuringGameSource(data.gameId);
  if (duringGameModel === null) {
    duringGameModel = DuringGame.model({ ...source, timeMs: data.timeMs, outcome: data.outcome });
  }
  return duringGameModel;
}

// The flags standing when the game ended: the last decision's board and that
// decision's own flag change.
function standingFlags(events) {
  const decisions = pathDecisionEvents(events);
  const last = decisions[decisions.length - 1].evaluation;
  const flagged = positionFlags(last.position);
  if (last.action === 'flag-place') flagged.add(last.selected[0]);
  if (last.action === 'flag-remove') flagged.delete(last.selected[0]);
  return [...flagged];
}

// The game being played, as the open motion stats section's feed sends it:
// its trace so far, and the samples and events the latest value it computed
// covered with that value. Nothing else runs during play.
let liveGame = null;

function liveGameOf(traceId) {
  if (liveGame === null || liveGame.id !== traceId) {
    liveGame = { id: traceId, t: [], x: [], y: [], merged: { sample: [], x: [], y: [] }, events: [],
      computer: createTraceMetricComputer(), latest: null };
  }
  return liveGame;
}

// The live game's trace metrics at a sample time, from the samples and
// events up to it. Time alone passing reuses the latest value with the new
// wall time.
function liveMetricsAt(game, at, travel) {
  let samples = game.t.length;
  while (samples > 0 && game.t[samples - 1] > at) samples--;
  let events = game.events.length;
  while (events > 0 && game.events[events - 1].t > at) events--;
  const latest = game.latest;
  const metrics = latest !== null && latest.samples === samples && latest.events === events
    ? { ...latest.metrics, wallDurationMs: at, bio: { ...latest.metrics.bio,
      wallDurationMs: at, silenceRatio: traceSilenceRatio(latest.metrics.bio.movementMs, at) } }
    : game.computer(game.t.slice(0, samples), game.x.slice(0, samples), game.y.slice(0, samples),
      travel.slice(0, samples), game.events.slice(0, events), at);
  game.latest = { samples, events, metrics };
  return metrics;
}

// The held game's trace metrics at each of its sample times: the motion
// stats series, computed when the open section first shows the game.
function metricSeriesAt(source, sampleTimes) {
  const t = Float64Array.from(source.t);
  const x = Float64Array.from(source.x);
  const y = Float64Array.from(source.y);
  const travel = sampleTravelPx(x, y, source.merged);
  const computer = createTraceMetricComputer();
  const includedEvents = [], series = createMetricSeries();
  let samples = 0, eventIndex = 0;
  for (const at of sampleTimes) {
    while (samples < t.length && t[samples] <= at) samples++;
    while (eventIndex < source.events.length && source.events[eventIndex].t <= at) {
      includedEvents.push(source.events[eventIndex++]);
    }
    appendMetricSeries(series, computer(t.subarray(0, samples), x.subarray(0, samples),
      y.subarray(0, samples), travel.subarray(0, samples), includedEvents, at));
  }
  return series;
}

function analyzeTrace(data) {
  const { t, x, y, merged, events, wallMs } = data;
  return { metrics: computeAllTraceMetrics(t, x, y, sampleTravelPx(x, y, merged), events, wallMs),
    spatial: computeSpatialBias(events) };
}

// The record's measurements the plan asks for, of the game the worker holds
// as gameId. Move habits and the fastclick gap come from the
// during-the-game model, which the live perf charts then reuse.
function finishedMeasurements(plan, metrics, gameId) {
  const measurements = {};
  if (!plan.drill) {
    if (plan.needZini) measurements.zini = Zini.zini(plan.width, plan.height, plan.mines);
    if (plan.needBoardMetrics) Object.assign(measurements, BoardMetrics.analyze(plan.width, plan.height, plan.mines));
  }
  if (plan.needCadence && Number.isFinite(metrics.cad.gapSpreadRatio)) {
    measurements.cadenceSpread = metrics.cad.gapSpreadRatio;
  }
  if (plan.needMoveHabits) {
    Object.assign(measurements, DuringGame.moveHabits(heldDuringGameModel({ gameId, timeMs: plan.timeMs, outcome: plan.outcome })));
  }
  if (plan.needFastclickGap) {
    Object.assign(measurements, DuringGame.fastclickGap(heldDuringGameModel({ gameId, timeMs: plan.timeMs, outcome: plan.outcome })));
  }
  if (plan.needGivenOpeningBv3) {
    const solved = DuringGame.bv3SolvedAtStart(plan.width, plan.height, plan.mines, duringGameSource.events);
    if (solved !== undefined) measurements.givenOpeningBv3 = solved;
  }
  return measurements;
}

function analyze(kind, data) {
  switch (kind) {
    case 'trends': return fitTrendLines(data.pairs, data.todayPairs);
    case 'scatter': return scatterPlotData(data.points, data.trimY);
    case 'trace': return analyzeTrace(data);
    // A game at its end, or at the next load when its page closed first
    // (completePendingGames): its decisions judged, then its measurements and
    // motion stats, every board proved once for all of them.
    case 'finished-game': {
      const proofs = DuringGame.positionProofs();
      const evaluation = completeGameEvaluations({ events: data.trace.events,
        justiceEnabled: data.justiceEnabled, guessLedger: data.guessLedger }, proofs);
      holdDuringGameSource({ id: data.gameId, width: data.width, height: data.height, mines: data.mines,
        justiceEnabled: data.justiceEnabled, t: data.trace.t, x: data.trace.x, y: data.trace.y,
        merged: data.trace.merged, events: data.trace.events,
        initialPageState: data.trace.initialPageState, proofs });
      const motion = analyzeTrace(data.trace);
      return { ...motion, evaluation, measurements: finishedMeasurements(data, motion.metrics, data.gameId) };
    }
    case 'live-trace': {
      const game = liveGameOf(data.traceId);
      // fromSample restarts at the last sample sent when a later observation
      // at its instant replaced it.
      for (const key of ['t', 'x', 'y']) {
        game[key].length = data.fromSample;
        for (const value of data[key]) game[key].push(value);
      }
      for (const key of ['sample', 'x', 'y']) {
        for (const value of data.merged[key]) game.merged[key].push(value);
      }
      for (const value of data.events) game.events.push(value);
      const travel = sampleTravelPx(game.x, game.y, game.merged);
      return data.sampleTimes.map((at) => liveMetricsAt(game, at, travel));
    }
    case 'motion-series': return metricSeriesAt(heldDuringGameSource(data.gameId), data.sampleTimes);
    case 'restore-trace': {
      const { sampleT: t, sampleX: x, sampleY: y, merged, events } = data;
      holdDuringGameSource({ id: data.endedAt, width: data.measurementPlan.width, height: data.measurementPlan.height,
        mines: data.measurementPlan.mines, justiceEnabled: data.justiceEnabled, t, x, y, merged, events,
        initialPageState: data.initialPageState, proofs: DuringGame.positionProofs() });
      const metrics = computeAllTraceMetrics(t, x, y, sampleTravelPx(x, y, merged), events, data.endedAt - data.startedAt);
      return { metrics, spatial: computeSpatialBias(events),
        measurements: finishedMeasurements(data.measurementPlan, metrics, data.endedAt) };
    }
    case 'during-game': return DuringGame.view(heldDuringGameModel(data), data.rows, data.average);
    case 'game-data-examples': {
      const m = heldDuringGameModel(data);
      const { width, height, mines, events } = duringGameSource;
      return GameData.examples(width, height, mines, m.recorded ? { events: m.events, flagged: standingFlags(events) } : null);
    }
    case 'ranks': {
      config = data.config;
      const { record, records, options, preferences, referenceMs } = data;
      const plan = resultRankPlan(record, records, options, preferences, referenceMs);
      const wins = records.filter((r) => r.outcome === 'win');
      const charts = (specs, mode) => specs.map((spec) => {
        if (!preferences.shownThings.averageCharts || wins.length < 2
            || (spec.setting && !preferences.shownThings[spec.setting])
            || (spec.setting === 'largestIsland' && !preferences.shownThings.boardShapeTables)) return null;
        return averageScatterData(spec, wins, records, record, options.historyView, mode, referenceMs);
      });
      plan.perfCharts = charts(PERF_CHART_SPECS, preferences.perfChartMode);
      plan.boardCharts = charts(BOARD_CHART_SPECS, preferences.boardChartMode);
      return plan;
    }
    case 'recent-placements': {
      const record = data.records.find((r) => r.endedAt === data.recordEndedAt);
      const boardWins = recentPlacementBoardWins(data.records, data.boardEndedAt, data.sourceStartMs, data.otherBoards);
      return recentPlacementsSummary(recentPlacementCandidates(data.records, data.referenceMs,
        data.sourceStartMs, boardWins, data.collapseDuplicates, data.noMarkTimeLabel), data.sourceStartMs, record);
    }
    case 'game-data': {
      const { record, records, preferences } = data;
      const wins = records.filter((r) => r.outcome === 'win');
      const comparisons = [...boardMetricCandidates([record], wins), ...boardShapeCandidates([record], wins)]
        .filter((c) => preferences.gameDataBoardTraits[c.measurementId]);
      return [...GameData.rows(record, records, preferences, data.config),
        ...boardTraitRankProfile(record, comparisons, records, preferences.sessionDefinition)];
    }
    case 'game-data-history': {
      const groups = GameData.history(data.records, data.endedAt, data.sessionDefinition, data.page, data.pageSize);
      return { total: groups.total, windows: groups.windows.map((group) => ({ endedAt: group.endedAt,
        stats: GameData.summary(group.records, data.metric, data.config) })) };
    }
    default: throw new Error('Unknown analysis task: ' + kind);
  }
}

self.onmessage = ({ data: { id, kind, payload } }) => {
  try { self.postMessage({ id, result: analyze(kind, payload) }); }
  catch (error) { self.postMessage({ id, error: kind + ': ' + error.message, stack: error.stack }); }
};

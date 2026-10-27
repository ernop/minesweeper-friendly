"use strict";

importScripts('trend-fit.js?v=20260925-worker-analysis',
  'game/trace-metrics.js?v=20261026-scatter-canvas',
  'game/evaluation.js?v=20261026-scatter-canvas',
  'game-data.js?v=20261026-planned-pairs', 'game/metric-definitions.js?v=20261026-scatter-canvas',
  'board-shape.js?v=20261020-no-left-panel', 'zini.js?v=20261020-no-left-panel', 'board-metrics.js?v=20261020-no-left-panel',
  'game/rankings.js?v=20261026-scatter-canvas',
  'game/charts.js?v=20261026-scatter-canvas', 'game/game-data-chart.js?v=20261026-scatter-canvas',
  'justice.js?v=20261026-move-hierarchy', 'odds.js?v=20261026-move-hierarchy', 'board-icons.js?v=20261015-flag-controls',
  'game/replay-model.js?v=20261026-scatter-canvas',
  'during-game.js?v=20261026-scatter-canvas');

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

function heldDuringGameModel(data) {
  if (duringGameSource === null || duringGameSource.id !== data.gameId) {
    throw new Error('game ' + data.gameId + ' is not the latest finished or restored game');
  }
  if (duringGameModel === null) {
    duringGameModel = DuringGame.model({ ...duringGameSource, timeMs: data.timeMs, outcome: data.outcome });
  }
  return duringGameModel;
}

// The flags standing when the game ended: the last decision's board and that
// decision's own flag change.
function standingFlags(events) {
  const decisions = pathDecisionEvents(events);
  const last = decisions[decisions.length - 1].evaluation;
  const flagged = new Set(last.position.flagged);
  if (last.action === 'flag-place') flagged.add(last.selected[0]);
  if (last.action === 'flag-remove') flagged.delete(last.selected[0]);
  return [...flagged];
}

// The game being played, as the live feed sends it: its trace so far, the
// trace metrics of it, and its positions' proofs. Each position is proved
// in a task of its own between messages, so the game's end finds nearly all
// of them proved and the model only reads them.
let liveGame = null;

function liveGameOf(traceId) {
  if (liveGame === null || liveGame.id !== traceId) {
    liveGame = { id: traceId, t: [], x: [], y: [], events: [], computer: createTraceMetricComputer(),
      metrics: null, proofs: DuringGame.positionProofs(), unproved: [], proving: false };
  }
  return liveGame;
}

function proveLivePositions(game) {
  if (game !== liveGame) return;
  game.proofs.of(game.unproved.shift());
  if (game.unproved.length > 0) setTimeout(proveLivePositions, 0, game);
  else game.proving = false;
}

function analyzeTrace(data) {
  const { t, x, y, events, wallMs } = data;
  return { metrics: computeAllTraceMetrics(t, x, y, events, wallMs),
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
  return measurements;
}

function analyze(kind, data) {
  switch (kind) {
    case 'trends': return fitTrendLines(data.pairs, data.todayPairs);
    case 'scatter': return scatterPlotData(data.points, data.trimY);
    case 'trace': return analyzeTrace(data);
    case 'finished-game': {
      holdDuringGameSource({ id: data.gameId, width: data.width, height: data.height, mines: data.mines,
        justiceEnabled: data.justiceEnabled, t: data.trace.t, x: data.trace.x, y: data.trace.y, events: data.trace.events,
        initialPageState: data.trace.initialPageState, proofs: liveGameOf(data.liveTraceId).proofs });
      const motion = analyzeTrace(data.trace);
      return { ...motion, measurements: finishedMeasurements(data, motion.metrics, data.gameId) };
    }
    case 'live-trace': {
      const game = liveGameOf(data.traceId);
      for (const key of ['t', 'x', 'y', 'events']) {
        for (const value of data[key]) game[key].push(value);
      }
      for (const event of pathDecisionEvents(data.events)) game.unproved.push(event.evaluation.position);
      if (game.unproved.length > 0 && !game.proving) {
        game.proving = true;
        setTimeout(proveLivePositions, 0, game);
      }
      game.metrics = game.metrics !== null && data.t.length === 0 && data.events.length === 0
        ? { ...game.metrics, wallDurationMs: data.wallMs, bio: { ...game.metrics.bio,
          wallDurationMs: data.wallMs, silenceRatio: traceSilenceRatio(game.metrics.bio.movementMs, data.wallMs) } }
        : game.computer(game.t, game.x, game.y, game.events, data.wallMs);
      return game.metrics;
    }
    case 'restore-trace': {
      const { sampleT: t, sampleX: x, sampleY: y, events, metricSampleTimes } = data;
      holdDuringGameSource({ id: data.endedAt, width: data.measurementPlan.width, height: data.measurementPlan.height,
        mines: data.measurementPlan.mines, justiceEnabled: data.justiceEnabled, t, x, y, events,
        initialPageState: data.initialPageState, proofs: DuringGame.positionProofs() });
      const computer = createTraceMetricComputer();
      const includedEvents = [], series = createMetricSeries();
      let samples = 0, eventIndex = 0;
      for (const at of metricSampleTimes) {
        while (samples < t.length && t[samples] <= at) samples++;
        while (eventIndex < events.length && events[eventIndex].t <= at) includedEvents.push(events[eventIndex++]);
        appendMetricSeries(series, computer(t.subarray(0, samples), x.subarray(0, samples),
          y.subarray(0, samples), includedEvents, at));
      }
      const metrics = computer(t, x, y, events, data.endedAt - data.startedAt);
      return { series, metrics, spatial: computeSpatialBias(events),
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

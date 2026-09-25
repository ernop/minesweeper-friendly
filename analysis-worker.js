"use strict";

importScripts('trend-fit.js?v=20260925-worker-analysis',
  'game/trace-metrics.js?v=20260925-worker-analysis',
  'game/evaluation.js?v=20260925-worker-analysis',
  'game/session-stats.js?v=20260925-worker-analysis',
  'game/metric-definitions.js?v=20260925-worker-analysis',
  'board-shape.js', 'zini.js', 'board-metrics.js?v=20260921-visible-zero-one',
  'game-data.js', 'game/rankings.js?v=20260925-worker-analysis',
  'game/charts.js?v=20260925-worker-analysis', 'game/game-data-chart.js?v=20260925-worker-analysis');

let config;

let liveTrace = null;
let liveComputer = null;
let liveMetrics = null;

function analyzeTrace(data) {
  const { t, x, y, events, wallMs } = data;
  return { metrics: computeAllTraceMetrics(t, x, y, events, wallMs),
    spatial: computeSpatialBias(events) };
}

function finishedMeasurements(plan, metrics) {
  const measurements = {};
  if (!plan.drill) {
    if (plan.needZini) measurements.zini = Zini.zini(plan.width, plan.height, plan.mines);
    if (plan.needBoardMetrics) Object.assign(measurements, BoardMetrics.analyze(plan.width, plan.height, plan.mines));
  }
  if (plan.needCadence && Number.isFinite(metrics.cad.gapSpreadRatio)) {
    measurements.cadenceSpread = Number(metrics.cad.gapSpreadRatio.toFixed(3));
  }
  return measurements;
}

function analyze(kind, data) {
  switch (kind) {
    case 'trends': return fitTrendLines(data.pairs, data.todayPairs);
    case 'scatter': return scatterPlotData(data.points, data.trimY);
    case 'trace': return analyzeTrace(data);
    case 'finished-game': {
      const motion = analyzeTrace(data.trace);
      return { ...motion, measurements: finishedMeasurements(data, motion.metrics) };
    }
    case 'live-trace': {
      if (liveTrace === null || liveTrace.id !== data.traceId) {
        liveTrace = { id: data.traceId, t: [], x: [], y: [], events: [] };
        liveComputer = createTraceMetricComputer();
        liveMetrics = null;
      }
      for (const key of ['t', 'x', 'y', 'events']) {
        for (const value of data[key]) liveTrace[key].push(value);
      }
      liveMetrics = liveMetrics !== null && data.t.length === 0 && data.events.length === 0
        ? { ...liveMetrics, wallDurationMs: data.wallMs, bio: { ...liveMetrics.bio,
          wallDurationMs: data.wallMs, silenceRatio: traceSilenceRatio(liveMetrics.bio.movementMs, data.wallMs) } }
        : liveComputer(liveTrace.t, liveTrace.x, liveTrace.y, liveTrace.events, data.wallMs);
      return liveMetrics;
    }
    case 'restore-trace': {
      const { sampleT: t, sampleX: x, sampleY: y, events, metricSampleTimes } = data;
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
        measurements: finishedMeasurements(data.measurementPlan, metrics) };
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
      const record = data.wins.find((r) => r.endedAt === data.recordEndedAt);
      return recentPlacementsSummary(recentPlacementCandidates(data.wins, data.referenceMs,
        data.sourceStartMs, data.collapseDuplicates), data.sourceStartMs, record);
    }
    case 'game-data': {
      const { record, records, preferences } = data;
      const wins = records.filter((r) => r.outcome === 'win');
      const comparisons = boardMetricCandidates([record], wins).filter((c) => preferences.shownThings[c.setting]);
      if (preferences.shownThings.boardShapeTables) comparisons.push(...boardShapeCandidates([record], wins)
        .filter((c) => preferences.shownThings.largestIsland || !c.label.startsWith('largest island ')));
      return [...performanceTimeRankProfile(record, records, preferences, data.config),
        ...boardTraitRankProfile(record, comparisons, records)]
        .map(({ help, ...row }) => ({ ...row, helpText: help?.(record) }));
    }
    case 'game-data-history': {
      const groups = GameData.history(data.records, data.endedAt, data.sessionDefinition, data.page, data.pageSize);
      return { total: groups.total, windows: groups.windows.map((group) => ({ endedAt: group.endedAt,
        stats: GameData.summary(group.records, data.metric, data.config) })) };
    }
    case 'session': {
      const { events, options, basis, aggregation, lookbackGames, lookbackSeconds } = data;
      return basis === 'game' ? sessionGameSeries(events, { ...options, aggregation, lookbackGames })
        : aggregation === 'raw' ? sessionRawSeries(events, { ...options, bucketMs: lookbackSeconds * 1000 })
          : sessionRunningSeries(events, { ...options, stepMs: SESSION_STEP_MS, lookbackMs: lookbackSeconds * 1000 });
    }
    default: throw new Error('Unknown analysis task: ' + kind);
  }
}

self.onmessage = ({ data: { id, kind, payload } }) => {
  try { self.postMessage({ id, result: analyze(kind, payload) }); }
  catch (error) { self.postMessage({ id, error: kind + ': ' + error.message }); }
};

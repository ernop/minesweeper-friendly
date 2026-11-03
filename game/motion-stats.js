'use strict';

// Motion stats: the trace metrics of the game on the board, in one open/close
// section at the page foot (docs/product/motion-stats.md). During play
// each value is a row with its sparkline, updated in place; once the game's
// final measurement is in, the same rows show the whole trace, followed by
// the Fitts curve and the spatial pace bias. Sample times are taken every
// game, open or closed: the saved trace keeps them. The reports worker
// computes the rows at them only while the section is open (creator
// 2026-11-03: no code runs during play that the player does not need), and a
// finished or restored game's when the section is first open on it.

//-------MOTION STATS: SAMPLES AND ROWS-------

// The values at the game's sample times the worker has computed for the open
// section, in order from the first. Display-side state only.
let metricsSeries = null;

function beginTraceMetricsSeries() {
  cancelMetricsUpdate();
  lastLiveMetrics = null;
  metricSampleTimes = [];
  metricsSeries = createMetricSeries();
  liveMetricsGeneration++;
  liveMetricsPending = false;
  liveMetricsTimeCursor = 0;
  liveMetricsSampleCursor = 0;
  liveMetricsMergedCursor = 0;
  liveMetricsEventCursor = 0;
}

function setMetricText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

function setMetricAttribute(element, name, value) {
  const text = String(value);
  if (element.getAttribute(name) !== text) element.setAttribute(name, text);
}

// A tallish per-metric chart of the value over the game: y axis labeled
// with the series min and max, x axis from 0 to the latest elapsed
// seconds. Gaps (spans where the value was not yet measurable) break the
// line rather than being bridged.
function buildSparkline(tMs, values, size) {
  const { width, height, left, bottom } = size;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  const add = (tag, attrs) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    svg.appendChild(node);
    return node;
  };
  add('rect', {
    class: 'spark-frame', x: left, y: 1,
    width: width - left - 1, height: height - bottom - 2,
  });
  const line = add('path', { class: 'spark-line' });
  const dot = add('circle', { class: 'spark-dot', r: size.dotR });
  const labels = [
    [left - 2, 8, 'end'],
    [left - 2, height - bottom - 1, 'end'],
    [left, height - 1, 'start'],
    [width - 2, height - 1, 'end'],
  ].map(([x, y, anchor]) => add('text', {
    class: size.labelClass, x, y, 'text-anchor': anchor,
  }));

  // Retain the SVG and its nodes: live samples change geometry and labels,
  // never the row that owns it.
  svg.updateSeries = (times, samples) => {
    let min = Infinity;
    let max = -Infinity;
    for (const value of samples) {
      if (value === undefined) continue;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    const empty = min === Infinity;
    for (const node of [line, dot, ...labels]) {
      setMetricAttribute(node, 'visibility', empty ? 'hidden' : 'visible');
    }
    if (empty) return;
    const labelMin = min;
    const labelMax = max;
    if (min === max) { min -= 0.5; max += 0.5; }
    const tEnd = times[times.length - 1];
    const xOf = (t) => left + (tEnd > 0 ? (t / tEnd) * (width - left - 3) : 0) + 1;
    const yOf = (v) => 1 + (1 - (v - min) / (max - min)) * (height - bottom - 4) + 1;
    let d = '';
    let pen = false;
    let lastX;
    let lastY;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i] === undefined) { pen = false; continue; }
      lastX = xOf(times[i]);
      lastY = yOf(samples[i]);
      d += (pen ? 'L' : 'M') + lastX.toFixed(1) + ' ' + lastY.toFixed(1);
      pen = true;
    }
    setMetricAttribute(line, 'd', d);
    setMetricAttribute(dot, 'cx', lastX.toFixed(1));
    setMetricAttribute(dot, 'cy', lastY.toFixed(1));
    const text = [sparkAxisNumber(labelMax), sparkAxisNumber(labelMin),
      '0', (tEnd / 1000).toFixed(0) + 's'];
    labels.forEach((label, i) => setMetricText(label, text[i]));
  };
  svg.updateSeries(tMs, values);
  return svg;
}

function appendTraceMetricsSeries(metrics) {
  appendMetricSeries(metricsSeries, metrics);
}

// One metric as label + current value + chart of its series.
function buildMetricRow(group, display, metrics, series, size, rowClass) {
  const row = document.createElement('div');
  row.className = rowClass;
  const head = document.createElement('div');
  head.className = 'metric-head';
  const labelEl = document.createElement('span');
  labelEl.className = 'metric-label';
  labelEl.appendChild(chartHelpButton(display.help, display.label));
  const valueEl = document.createElement('span');
  valueEl.className = 'metric-value';
  head.append(labelEl, valueEl);
  row.appendChild(head);
  const spark = buildSparkline(
    series.tMs, series.byKey.get(metricSeriesKey(group, display)), size);
  row.appendChild(spark);
  row.updateMetrics = (current, currentSeries) => {
    const value = displayableNumber(display.of(current));
    setMetricText(valueEl, value === undefined ? '\u2013' : display.fmt(value));
    spark.updateSeries(currentSeries.tMs,
      currentSeries.byKey.get(metricSeriesKey(group, display)));
  };
  row.updateMetrics(metrics, series);
  return row;
}

// The heading naming a measurement system. Headings without help (the Fitts
// curve's, the spatial grid's) stay plain text.
function buildMetricsGroupHead(group) {
  const head = document.createElement('div');
  head.className = 'metrics-group-head';
  if (group.help) head.appendChild(chartHelpButton(group.help, group.name));
  else head.textContent = group.name;
  return head;
}

// The latest live sample's metrics: what opening the section shows without
// taking another sample.
let lastLiveMetrics = null;

// The finished or restored game on screen: { gameId, metrics, spatial,
// sampleTimes, series }, its whole-trace metrics and its sample times, the
// series at them null until the open section asks for it
// (requestFinalMotionSeries); null while no finished game is on screen.
let finalMotion = null;

//-------MOTION STATS: THE SECTION (page foot)-------

// Built once by init, before the first board. The body holds either a line
// saying no game is on, or the charts: one group per measurement system,
// whose rows are built once and then updated in place from game to game,
// and after them the finished game's Fitts curve and spatial pace bias.
let motionStatsView = null;

function initMotionStats() {
  const { section, body, toggle } = buildStatSection('motionStats', 'motion stats');
  const idle = document.createElement('p');
  idle.className = 'motion-stats-idle';
  idle.textContent = 'No game in progress.';
  const charts = document.createElement('div');
  charts.className = 'motion-stats-charts';
  const groups = document.createElement('div');
  const extra = document.createElement('div');
  charts.append(groups, extra);
  motionStatsView = { body, idle, charts, groups, extra, rows: [], shownMetrics: null, extraFor: null };
  toggle.addEventListener('click', renderMotionStats);
  document.getElementById('motion-stats').appendChild(section);
  renderMotionStats();
}

// Nothing renders or computes while the section is closed; opening it renders
// the game as it is then, catching up on the sample times taken while it was
// closed. The live rows show while a game is traced, and a finished game keeps
// its last live values until its final measurement and series replace them.
// A new trace's first sample is one worker reply away, so until it comes the
// section keeps what it shows rather than flashing empty.
function renderMotionStats() {
  if (!tracing()) cancelMetricsUpdate();
  if (!settings.panels.motionStats) return;
  const view = motionStatsView;
  const final = tracing() ? null : finalMotion;
  if (final !== null && final.series === null) {
    requestFinalMotionSeries(final);
    return;
  }
  if (tracing()) renderLiveTraceMetrics();
  const metrics = final !== null ? final.metrics
    : tracing() || gameState === 'won' || gameState === 'lost' ? lastLiveMetrics : null;
  if (metrics === null) {
    if (!tracing() && view.body.firstChild !== view.idle) view.body.replaceChildren(view.idle);
    return;
  }
  const series = final !== null ? final.series : metricsSeries;
  if (view.rows.length === 0) {
    for (const group of TRACE_METRIC_GROUPS) {
      const section = document.createElement('section');
      section.className = 'motion-metric-group';
      const items = document.createElement('div');
      items.className = 'motion-metric-group-items';
      for (const display of group.displays) {
        const row = buildMetricRow(group, display, metrics, series, SPARK_LARGE, 'metric-row motion-chart');
        view.rows.push(row);
        items.appendChild(row);
      }
      section.append(buildMetricsGroupHead(group), items);
      view.groups.appendChild(section);
    }
  } else if (view.shownMetrics !== metrics) {
    for (const row of view.rows) row.updateMetrics(metrics, series);
  }
  view.shownMetrics = metrics;
  if (view.extraFor !== final) {
    view.extraFor = final;
    view.extra.replaceChildren(...(final === null ? []
      : [buildFittsCurveSection(final.metrics.fitts), buildSpatialBiasSection(final.spatial)]
        .filter((node) => node !== null)));
  }
  if (view.body.firstChild !== view.charts) view.body.replaceChildren(view.charts);
}

// A finished or restored game's series, from the worker that holds its trace
// (duringGameSourceId's game): the values at its sample times, then the whole
// trace's, which the rows show.
function requestFinalMotionSeries(final) {
  if (final.seriesRequested) return;
  final.seriesRequested = true;
  analysisTask('reports', 'motion-series', { gameId: final.gameId, sampleTimes: final.sampleTimes })
    .then((series) => {
      appendMetricSeries(series, final.metrics);
      final.series = series;
      if (finalMotion === final) renderMotionStats();
    }).catch(analysisFailure);
}

// The Fitts curve: this game's aimed movements as (index of difficulty,
// movement time) dots with the robust fit line. Under 8 movements a fit
// is noise, so the section is omitted.
function buildFittsCurveSection(fitts) {
  if (!fitts || !Array.isArray(fitts.pairs) || fitts.pairs.length < 8) return null;
  const section = document.createElement('section');
  section.className = 'motion-metric-group';
  section.appendChild(buildMetricsGroupHead({ name: 'Fitts curve' }));
  const idOf = (p) => p.id;
  const mtOf = (p) => p.mtMs;
  const scatter = buildScatter(
    fitts.pairs, null, idOf, mtOf,
    'difficulty (bits)', 'movement ms', null, null,
    {
      trimY: true,
      neutralDots: true,
      trendLines: trendLinesFor(fitts.pairs.map((p) => [p.id, p.mtMs]), []),
    });
  section.appendChild(scatter);
  section.analysisReady = scatter.analysisReady;
  return section;
}

// The spatial-bias heatmap: per board region (a 3x3 grid over the board),
// the median gap residual after the distance fit — how much slower (+ms,
// warm) or faster (-ms, cool) actions into that region ran than travel
// distance alone predicts. Distance normalization is what disentangles
// the region effect from where the previous click (or the opening square)
// happened to be.
function buildSpatialBiasSection(spatial) {
  if (!spatial || !Array.isArray(spatial.regions)) return null;
  const measured = spatial.regions.filter(
    (region) => region.medianResidualMs !== undefined);
  if (measured.length < 2) return null;
  const section = document.createElement('section');
  section.className = 'motion-metric-group';
  section.appendChild(buildMetricsGroupHead({ name: 'spatial pace bias' }));
  const grid = document.createElement('div');
  grid.className = 'spatial-bias-grid';
  const maxAbs = Math.max(
    1, ...measured.map((region) => Math.abs(region.medianResidualMs)));
  for (let rr = 0; rr < SPATIAL_REGIONS; rr++) {
    for (let rc = 0; rc < SPATIAL_REGIONS; rc++) {
      const region = spatial.regions[rr * SPATIAL_REGIONS + rc];
      const cell = document.createElement('div');
      cell.className = 'spatial-bias-cell';
      const value = document.createElement('span');
      value.className = 'spatial-bias-value';
      const count = document.createElement('span');
      count.className = 'spatial-bias-count';
      if (region.medianResidualMs === undefined) {
        value.textContent = '\u2013';
        count.textContent = region.count + ' clicks';
      } else {
        const ms = Math.round(region.medianResidualMs);
        value.textContent = (ms > 0 ? '+' : '') + ms + 'ms';
        count.textContent = region.count + (region.count === 1 ? ' click' : ' clicks');
        const strength = Math.min(1, Math.abs(ms) / maxAbs) * 0.55;
        cell.style.background = ms > 0
          ? 'rgba(211, 47, 47, ' + strength.toFixed(3) + ')'
          : 'rgba(46, 125, 50, ' + strength.toFixed(3) + ')';
      }
      cell.title = 'board region row ' + (rr + 1) + ', column ' + (rc + 1)
        + ': median gap residual over ' + region.count + ' action(s)';
      cell.append(value, count);
      grid.appendChild(cell);
    }
  }
  section.appendChild(grid);
  const caption = document.createElement('p');
  caption.className = 'spatial-bias-caption';
  caption.textContent = 'median action-gap residual after the robust '
    + 'gap-vs-distance fit (' + spatial.pairCount + ' action pairs; '
    + Math.round(spatial.bMsPerPx * 100) / 100 + ' ms/px): +ms = actions '
    + 'into this board region ran slower than travel distance predicts, '
    + '\u2212ms = faster. Regions follow the board, not the screen.';
  section.appendChild(caption);
  return section;
}

//-------MOTION STATS: SAMPLING SCHEDULE-------

// Input can arrive much faster than these full-trace computations should
// run. A single trailing task coalesces bursts; it never schedules itself.
// The existing game clock supplies elapsed-time changes only during play.
const METRICS_SAMPLE_MIN_MS = 250;
let metricsUpdateFrame = null;
let metricsUpdateTimeout = null;
let metricsTraceDirty = false;
let metricsElapsedDirty = false;
let lastMetricsSampleAt = -Infinity;
// The game's sample times (ms since its trace began), taken on coalesced
// input and active-game clock changes.
let metricSampleTimes = [];

function cancelMetricsUpdate() {
  if (metricsUpdateFrame !== null) cancelAnimationFrame(metricsUpdateFrame);
  if (metricsUpdateTimeout !== null) clearTimeout(metricsUpdateTimeout);
  metricsUpdateFrame = null;
  metricsUpdateTimeout = null;
}

function scheduleMetricsUpdate(changed = {}) {
  if (changed.trace) metricsTraceDirty = true;
  if (changed.elapsed) metricsElapsedDirty = true;
  if (document.hidden || metricsUpdateFrame !== null || metricsUpdateTimeout !== null) return;
  const requestFrame = () => {
    metricsUpdateTimeout = null;
    metricsUpdateFrame = requestAnimationFrame(flushMetricsUpdate);
  };
  const delay = Math.max(0, METRICS_SAMPLE_MIN_MS - (performance.now() - lastMetricsSampleAt));
  if (delay > 0) metricsUpdateTimeout = setTimeout(requestFrame, delay);
  else requestFrame();
}

function flushMetricsUpdate() {
  metricsUpdateFrame = null;
  if (document.hidden) return;
  const changed = metricsTraceDirty || metricsElapsedDirty;
  metricsTraceDirty = false;
  metricsElapsedDirty = false;
  if (tracing() && changed) takeMetricsSample();
}

function takeMetricsSample() {
  lastMetricsSampleAt = performance.now();
  metricSampleTimes.push(Date.now() - trace.startedAt);
  renderLiveTraceMetrics();
}

// The open section's rows during play. At most one job is in flight; each
// sends only the samples, observations, events, and sample times appended
// since the one before, so the first job after the section opens catches up
// on every sample time taken while it was closed, and the one after a reply
// on those taken while it was computed.
let liveMetricsGeneration = 0;
let liveMetricsPending = false;
let liveMetricsTimeCursor = 0;
let liveMetricsSampleCursor = 0;
let liveMetricsMergedCursor = 0;
let liveMetricsEventCursor = 0;

function renderLiveTraceMetrics() {
  if (!settings.panels.motionStats || liveMetricsPending
      || liveMetricsTimeCursor === metricSampleTimes.length) return;
  const generation = liveMetricsGeneration;
  const currentTrace = trace;
  // An observation at the instant of the last sample sent replaced it, so
  // that sample goes again.
  const fromSample = Math.min(liveMetricsSampleCursor,
    ...trace.mergedSample.slice(liveMetricsMergedCursor));
  const payload = {
    traceId: generation,
    fromSample,
    t: trace.t.slice(fromSample),
    x: trace.x.slice(fromSample),
    y: trace.y.slice(fromSample),
    merged: { sample: trace.mergedSample.slice(liveMetricsMergedCursor),
      x: trace.mergedX.slice(liveMetricsMergedCursor), y: trace.mergedY.slice(liveMetricsMergedCursor) },
    events: trace.events.slice(liveMetricsEventCursor),
    sampleTimes: metricSampleTimes.slice(liveMetricsTimeCursor),
  };
  liveMetricsTimeCursor = metricSampleTimes.length;
  liveMetricsSampleCursor = trace.t.length;
  liveMetricsMergedCursor = trace.mergedSample.length;
  liveMetricsEventCursor = trace.events.length;
  liveMetricsPending = true;
  analysisTask('reports', 'live-trace', payload).then((points) => {
    if (generation !== liveMetricsGeneration) return;
    liveMetricsPending = false;
    if (trace !== currentTrace || !tracing()) return;
    for (const metrics of points) appendTraceMetricsSeries(metrics);
    lastLiveMetrics = points[points.length - 1];
    renderLiveTraceMetrics();
    renderMotionStats();
  }).catch(analysisFailure);
}

'use strict';

// The left stats panel: its session heading, live trace-metric rows and
// sparklines, the after-game motion charts, and update scheduling.

//-------TRACE METRICS: DISPLAY (the #metrics-panel column)-------

const metricsPanel = document.getElementById('metrics-panel');
const metricsPanelContent = document.getElementById('metrics-panel-content');

// The per-game history of every displayed value, sampled on coalesced input
// and active-game clock changes, plus the final measurement.
// Display-side state only: nothing here is stored anywhere.
let metricsSeries = null;

function beginTraceMetricsSeries() {
  cancelMetricsUpdate();
  lastLiveMetrics = null;
  sessionChartsDirty = true;
  metricsSeries = createMetricSeries();
  liveMetricsGeneration++;
  liveMetricsPending = false;
  liveMetricsSampleCursor = 0;
  liveMetricsEventCursor = 0;
}

function setMetricText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

function setMetricAttribute(element, name, value) {
  const text = String(value);
  if (element.getAttribute(name) !== text) element.setAttribute(name, text);
}

function setMetricHidden(element, hidden) {
  if (element.hidden !== hidden) element.hidden = hidden;
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
  // never the row or the scroll container that owns it.
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
  labelEl.textContent = display.label;
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

// The section header naming a measurement system, shared by the live
// panel and the after-game charts.
function buildMetricsGroupHead(group) {
  const head = document.createElement('div');
  head.className = 'metrics-group-head';
  head.textContent = group.name;
  return head;
}

// The metrics of the latest render, so toggler clicks and settings
// changes can update the panel without taking another input sample.
let lastLiveMetrics = null;

// Controls and live rows retain their DOM identity for the page session.
// Data updates never clear the scroll container or trigger board layout;
// ResizeObserver handles actual changes in the panel's dimensions.
let metricsPanelView = null;
let sessionChartsDirty = true;

function renderMetricsPanel(metrics) {
  if (!tracing()) cancelMetricsUpdate();
  renderMetricsPanelContent(metrics);
}

function renderMetricsPanelContent(metrics) {
  const showSession = settings.showSessionStats;
  const showLive = settings.showMotionStatsDuringGame
    && metrics !== null && tracing();
  if (metricsPanelView === null) {
    const head = document.createElement('div');
    head.className = 'metrics-panel-head';
    const phase = document.createElement('span');
    phase.className = 'metric-phase';
    phase.textContent = 'live';
    const hide = document.createElement('button');
    hide.type = 'button';
    hide.className = 'metrics-toggle';
    hide.textContent = '\u00d7';
    hide.title = 'collapse the stats panel; this choice is saved';
    hide.addEventListener('click', () => {
      updateSettings({ metricsPanelCollapsed: true });
      refreshMetricsPanel();
    });
    head.append(phase, hide);
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'metrics-toggle';
    restore.textContent = 'stats \u25b8';
    restore.title = 'show the session / live motion stats panel again';
    restore.addEventListener('click', () => {
      updateSettings({ metricsPanelCollapsed: false });
      refreshMetricsPanel();
    });
    // The session heading holds the page's one session picker, so it stays in
    // every panel state, collapsed or with session stats switched off: ranks
    // won and game data still use the session. The panel never disappears.
    const sessionHead = buildMetricsGroupHead(SESSION_GROUP);
    sessionHead.classList.add('session-scope-head');
    sessionHead.appendChild(buildSessionScopeSelect());
    const session = document.createElement('div');
    const live = document.createElement('div');
    const grip = buildMetricsResizeGrip();
    metricsPanelContent.append(restore, head, sessionHead, session, live);
    metricsPanel.appendChild(grip);
    setMetricHidden(metricsPanel, false);
    metricsPanelView = {
      head, phase, restore, session, live, grip,
      sessionControlsKey: null, sessionCharts: null, liveRows: [], metrics: null,
    };
  }
  const view = metricsPanelView;
  metricsPanel.classList.toggle('collapsed', settings.metricsPanelCollapsed);
  const width = settings.metricsPanelCollapsed ? '' : settings.metricsPanelWidth + 'px';
  if (metricsPanel.style.width !== width) metricsPanel.style.width = width;
  setMetricHidden(view.restore, !settings.metricsPanelCollapsed);
  setMetricHidden(view.head, settings.metricsPanelCollapsed);
  setMetricHidden(view.grip, settings.metricsPanelCollapsed);
  setMetricHidden(view.phase, !showLive);
  setMetricHidden(view.session, settings.metricsPanelCollapsed || !showSession);
  setMetricHidden(view.live, settings.metricsPanelCollapsed || !showLive);
  setMetricAttribute(view.grip, 'aria-valuenow', settings.metricsPanelWidth);
  if (settings.metricsPanelCollapsed) return;

  if (showSession) {
    const controlsKey = JSON.stringify([
      settings.sessionAggregation, settings.sessionRateBasis,
      settings.sessionLookbackGames, settings.sessionLookbackSeconds,
      settings.sessionModeScope, settings.sessionDefinition,
    ]);
    if (view.sessionControlsKey !== controlsKey) {
      // Only an explicit settings change alters the control structure. A new
      // session definition rebuilds here too, not through the hover-deferred
      // path: the picker's option list closes over these charts, and charts
      // of the previous window must not linger under the pointer.
      const content = document.createDocumentFragment();
      view.sessionCharts = appendSessionSection(content);
      view.session.replaceChildren(content);
      view.sessionControlsKey = controlsKey;
      const resumeCharts = () => {
        if (sessionChartsDirty) scheduleMetricsUpdate({ session: true });
      };
      view.sessionCharts.addEventListener('mouseleave', resumeCharts);
      view.sessionCharts.addEventListener('focusout', resumeCharts);
      sessionChartsDirty = false;
    } else if (sessionChartsDirty
        && !view.sessionCharts.matches(':hover')
        && !view.sessionCharts.contains(document.activeElement)) {
      const content = document.createDocumentFragment();
      const generation = (view.sessionGeneration || 0) + 1;
      view.sessionGeneration = generation;
      const target = view.sessionCharts;
      sessionChartsDirty = false;
      appendSessionCharts(content).then(() => {
        if (metricsPanelView !== view || view.sessionCharts !== target
            || view.sessionGeneration !== generation) return;
        hideSessionGameTooltip();
        const scrollTop = metricsPanelContent.scrollTop;
        target.replaceChildren(content);
        metricsPanelContent.scrollTop = scrollTop;
      }).catch(analysisFailure);
    }
  }
  if (showLive && view.metrics !== metrics) {
    if (view.liveRows.length === 0) {
      const content = document.createDocumentFragment();
      for (const group of TRACE_METRIC_GROUPS) {
        content.appendChild(buildMetricsGroupHead(group));
        for (const display of group.displays) {
          const row = buildMetricRow(
            group, display, metrics, metricsSeries, SPARK_SMALL, 'metric-row');
          view.liveRows.push(row);
          content.appendChild(row);
        }
      }
      view.live.appendChild(content);
    } else {
      for (const row of view.liveRows) row.updateMetrics(metrics, metricsSeries);
    }
    view.metrics = metrics;
  }
}

// The panel's right-edge drag grip and its listeners survive data updates.
// Width and chart geometry both follow the pointer on the next animation
// frame; release persists the final width.
function buildMetricsResizeGrip() {
  const grip = document.createElement('div');
  grip.className = 'metrics-resize';
  grip.title = 'drag to resize the stats panel';
  grip.setAttribute('role', 'separator');
  grip.setAttribute('aria-label', 'resize stats panel');
  grip.setAttribute('aria-orientation', 'vertical');
  grip.setAttribute('aria-valuemin', String(METRICS_PANEL_WIDTH_MIN));
  grip.setAttribute('aria-valuemax', String(METRICS_PANEL_WIDTH_MAX));
  grip.setAttribute('aria-valuenow', String(settings.metricsPanelWidth));
  grip.tabIndex = 0;
  grip.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    settings.metricsPanelWidth = Math.min(METRICS_PANEL_WIDTH_MAX,
      Math.max(METRICS_PANEL_WIDTH_MIN, settings.metricsPanelWidth + direction * 10));
    saveSettings();
    refreshMetricsPanel();
  });
  grip.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = settings.metricsPanelWidth;
    let renderFrame = null;
    const move = (ev) => {
      settings.metricsPanelWidth = Math.min(METRICS_PANEL_WIDTH_MAX,
        Math.max(METRICS_PANEL_WIDTH_MIN, Math.round(startWidth + ev.clientX - startX)));
      metricsPanel.style.width = settings.metricsPanelWidth + 'px';
      if (renderFrame === null) {
        renderFrame = requestAnimationFrame(() => {
          renderFrame = null;
          refreshMetricsPanel();
        });
      }
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      if (renderFrame !== null) cancelAnimationFrame(renderFrame);
      saveSettings();
      refreshMetricsPanel();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });
  return grip;
}

// The finished game's canonical metrics and its full series, snapshotted
// at game end for the after-game charts (see buildMotionStatsCharts);
// null while no finished game is on screen. beginTrace replaces
// metricsSeries with a fresh object, so these references stay the ended
// game's own.
let finalMotion = null;

// The after-game display: one semantic subgroup per measurement system.
// Each subgroup owns its heading and responsive chart row, so viewport
// wrapping can never mix the tail of one system with the next one.
// Canonical values: same computation as live, complete trace.
async function buildMotionStatsCharts(motion, isCurrent) {
  const nodes = [];
  for (const group of TRACE_METRIC_GROUPS) {
    const section = document.createElement('section');
    section.className = 'motion-metric-group';
    section.appendChild(buildMetricsGroupHead(group));
    const items = document.createElement('div');
    items.className = 'motion-metric-group-items';
    for (const display of group.displays) {
      items.appendChild(buildMetricRow(
        group, display, motion.metrics, motion.series, SPARK_LARGE,
        'metric-row motion-chart'));
      await yieldAnalysisPresentation();
      if (!isCurrent()) return [];
    }
    section.appendChild(items);
    nodes.push(section);
  }
  const fittsChart = buildFittsCurveSection(motion.metrics.fitts);
  if (fittsChart !== null) nodes.push(fittsChart);
  const spatialChart = buildSpatialBiasSection(motion.spatial);
  if (spatialChart !== null) nodes.push(spatialChart);
  return nodes;
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

// Settings and resize actions invalidate the chart view.
// Ordinary samples leave the controls and panel structure mounted.
function refreshMetricsPanel() {
  sessionChartsDirty = true;
  renderMetricsPanel(tracing() ? lastLiveMetrics : null);
}

// Input can arrive much faster than these full-trace computations should
// run. A single trailing task coalesces bursts; it never schedules itself.
// The existing game clock supplies elapsed-time changes only during play.
const METRICS_SAMPLE_MIN_MS = 250;
let metricsUpdateFrame = null;
let metricsUpdateTimeout = null;
let metricsTraceDirty = false;
let metricsElapsedDirty = false;
let lastMetricsSampleAt = -Infinity;

function cancelMetricsUpdate() {
  if (metricsUpdateFrame !== null) cancelAnimationFrame(metricsUpdateFrame);
  if (metricsUpdateTimeout !== null) clearTimeout(metricsUpdateTimeout);
  metricsUpdateFrame = null;
  metricsUpdateTimeout = null;
}

function scheduleMetricsUpdate(changed = {}) {
  if (changed.trace) metricsTraceDirty = true;
  if (changed.elapsed) metricsElapsedDirty = true;
  if (changed.session || (changed.elapsed && sessionPlayFrom !== null
      && settings.sessionRateBasis === 'time')) sessionChartsDirty = true;
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
  const inputChanged = metricsTraceDirty;
  const elapsedChanged = metricsElapsedDirty;
  metricsTraceDirty = false;
  metricsElapsedDirty = false;
  if (tracing() && (inputChanged || elapsedChanged)) {
    renderLiveTraceMetrics(inputChanged);
  } else {
    renderMetricsPanel(tracing() ? lastLiveMetrics : null);
  }
}

// At most one sample is in flight. Input arriving meanwhile stays dirty,
// so the next request sends only the appended samples/events for this game.
let liveMetricsGeneration = 0;
let liveMetricsPending = false;
let liveMetricsSampleCursor = 0;
let liveMetricsEventCursor = 0;

function renderLiveTraceMetrics() {
  if (liveMetricsPending) { metricsTraceDirty = true; return; }
  const generation = liveMetricsGeneration;
  const currentTrace = trace;
  const payload = {
    traceId: generation,
    t: trace.t.slice(liveMetricsSampleCursor),
    x: trace.x.slice(liveMetricsSampleCursor),
    y: trace.y.slice(liveMetricsSampleCursor),
    events: trace.events.slice(liveMetricsEventCursor),
    wallMs: Date.now() - trace.startedAt,
  };
  liveMetricsSampleCursor = trace.t.length;
  liveMetricsEventCursor = trace.events.length;
  liveMetricsPending = true;
  lastMetricsSampleAt = performance.now();
  analysisTask('live', 'live-trace', payload).then((metrics) => {
    if (generation !== liveMetricsGeneration) return;
    liveMetricsPending = false;
    if (trace !== currentTrace || !tracing()) return;
    appendTraceMetricsSeries(metrics);
    lastLiveMetrics = metrics;
    renderMetricsPanel(metrics);
    if (metricsTraceDirty || metricsElapsedDirty) scheduleMetricsUpdate();
  }).catch(analysisFailure);
}

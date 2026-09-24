# Trace metrics panel — implementation notes

Spec: [docs/product/trace-metrics-panel.md](../product/trace-metrics-panel.md). Index: [AGENTS.md](../../AGENTS.md).

- Trace metrics ([Trace metrics panel](../product/trace-metrics-panel.md)): the pure sections
  between the "TRACE METRICS: COMPUTATION" and "TRACE METRICS: DISPLAY"
  markers (no DOM; Node harnesses extract exactly this span) implement
  all five measurement systems over a trace:
  - `computeTraceMetrics` — the biometrics session set, a JS port of
    `analysis/biometrics/extract_features.py`;
  - `traceSegments` — the shared inter-click segmentation, the exact
    trial construction of `analysis/mousetrap/trace_measures.R`
    ('lup'/'rdown' events end segments; previous click point prepended,
    click point appended, < 5 points skipped);
  - `computePsychometrics` — an exact port of the mousetrap R package's
    mt_derivatives/mt_deviations/mt_measures/mt_time_normalize/
    mt_sample_entropy path, transcribed from the installed package
    source (deparse dumps; includes quirks like the padded leading zero
    in vel/acc, pracma::polyarea's ccw-positive shoelace with the
    orientation flip, and which.max tie-breaking). The entropy radius r
    pools per game — trace_measures.R was changed the same day to run
    its pipeline per game so offline matches;
  - `computeHevelius` — the cursor-only Hevelius features per movement
    (FEATURES.md mapping; 100 Hz linear resample, 7 Hz Kaiser-FIR
    (21 taps, beta 3.3953, unity DC gain, replicate padding) speed/acc/
    jerk chain; submovement thresholds 100/500 px/s; documented
    deviation: no Kalman position smoothing, params unpublished);
  - `computeWasteMetrics` — the survey Tier 1/2 whole-game measures
    (250 ms pauses, wander ratio, 8 px/90° turnarounds, 300 ms feints
    via the layout events' cell mapping);
  - `computeClickCadence` — press-to-press click timing over 'ldown' +
    'rdown' events (2026-08-22): gap quartiles (median + IQR/median
    spread), fastest gap, peak presses in a rolling 1 s window, share of
    gaps under 250 ms, share of presses with a cursor sample within
    100 ms before the press;
  - `computeAllTraceMetrics` — the combined {bio, psych, hev, waste,
    cad} object the display consumes.
  The DISPLAY section holds `TRACE_METRIC_GROUPS` (per system: key,
  name, definition, displays of {label, calc, records, of, fmt} — calc and
  records render as the row's "HOW:/RECORDS:" hover tooltip; series identity is
  metricSeriesKey = group key + label; not everything
  computed is displayed), `metricsSeries` (reset by
  `beginTraceMetricsSeries` from `beginTrace`),
  `buildSparkline(tMs, values, size)` with SPARK_SMALL/SPARK_LARGE
  geometries, `buildMetricRow`/`buildMetricsGroupHead` shared by both
  displays, and `displayableNumber` (undefined and NaN both render as
  the en dash). Live: `scheduleMetricsUpdate` invalidates from trace/session
  mutations and the existing active-game clock. One trailing task coalesces
  input bursts (250ms minimum sample spacing), then draws on an animation
  frame; it never reschedules itself. `renderLiveTraceMetrics` appends to
  the series even with the panel off. `liveSegmentCache` recomputes psych/hev
  only when the click-event count changes; elapsed-only updates reuse all
  input computations and derive `traceSilenceRatio` from the new duration.
  `renderMetricsPanel(metrics)` maintains `#metrics-panel` as
  session section (settings.showSessionStats) + live per-game rows
  (settings.showMotionStatsDuringGame, only while tracing with metrics
  non-null — null means "no live rows", the between-games render);
  `metricsPanelView` retains controls, rows, SVGs, and the resize grip;
  `updateMetrics`/`updateSeries` mutate only live text and geometry.
  `metricsPanelCollapsed` + `lastLiveMetrics` implement the panel's own
  × / "stats ▸" session toggler; `refreshMetricsPanel` (called from the
  settings change handler) applies the settings mid-game and between
  games. Game-end transition: `lose` paints the mine-hit board and dead face,
  while `checkWin` paints the completed marks, counter, and cool face; both
  then use `reportResultAfterPaint`, which synchronously renders only the
  outcome, exact final time, and loading status (ending with the same
  `syncBoardLayout` renderResult uses, so the shell's one frame is placed
  correctly) before crossing a requestAnimationFrame + timer paint boundary.
  `reportResult` then persists, computes metrics, and replaces that shell
  with the complete result. The game-end timestamp is captured before
  deferral. A 250ms fallback covers throttled frames, while the next
  pointer/key input, `newGame`, hidden-visibility, and pagehide all flush
  pending finalization before mutable game state can change or the page can
  unload with an unsaved record. Final:
  `reportResult` computes
  `computeAllTraceMetrics` with wall time endedAt - trace.startedAt (the
  stored trace's definition), snapshots `finalMotion` {metrics, series},
  and re-renders the panel session-only (the live rows' game is over;
  the panel itself persists); `renderResult` appends `buildMotionStatsCharts()`
  (grouped .motion-chart rows with labeled breaks, SPARK_LARGE) to
  `#result-ranks` when settings.showMotionStatsAfterGame — so a settings
  toggle re-renders them via the existing renderedResult re-render.
  `newGame` nulls `finalMotion` with `renderedResult`.
  Verification (all checked in under tests/, all extract the computation
  span by its markers):
  - `tests/metrics-biometrics-parity.js` — vs the checked-in Python
    output (`synthetic-features.json`), tolerance 1e-9;
  - `tests/metrics-mousetrap-parity.js` — vs the actual R package via
    Rscript on the checked-in synthetic trace plus a freshly randomized
    one per run (needs `~/analysis-envs/r-mousetrap`; fails loudly, never
    skips), tolerance 1e-8 on all 11 per-game means;
  - `tests/metrics-hevelius-test.js` — known-answer constructed
    movements (no runnable Hevelius reference exists; note: the 7 Hz
    FIR's side lobes legitimately overshoot ~1.5% at moving-to-still
    step edges, so exact-value tests must end movements at the click);
  - `tests/metrics-cadence-test.js` — known-answer press sequences for
    the click-cadence metrics (gap quartiles, peak window, moving-press
    share, not-measurable cases);
  - `tests/metrics-queue-recovery-test.js` — known-answer traces for
    `computeQueueMetrics` (the feint-rule dwell registry, leave-to-click
    waits) and `computeRecoveryMetrics` (median-gap baseline,
    post-mistake gap ratio, recovery-action counts);
  - `tests/metrics-fitts-spatial-test.js` — known-answer traces for
    `computeFittsMetrics` (ID, MT, throughput, the 8px minimum) and
    `computeSpatialBias` (Theil–Sen distance fit, per-region residual
    medians);
  - `tests/session-buckets-test.js` — known-answer event lists for the
    session-stats bucketing (extracts the SESSION STATS: COMPUTATION
    span; cumulative-play compaction across wall-clock breaks, per-bucket
    rates, open intervals, history retention, the 1s minimum-play rule,
    medians).
  If any implementation's definitions change, change its counterpart and
  rerun. `tests/metrics-updates-test.js` checks scheduler coalescing, elapsed
  caching, visibility, and the absence of idle work;
  `tests/metrics-updates-test.html` checks real DOM identity, focus, scroll,
  idle mutations, and game lifecycle on the test origin.
  Node-harness caution: the music sampler's setInterval keeps a bare
  `node` process alive — full-game harnesses must wrap global.setInterval
  to `.unref()` the handle (or extract only the computation section).

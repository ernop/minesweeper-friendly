# Motion stats — implementation notes

Spec: [docs/product/motion-stats.md](../product/motion-stats.md). Index: [AGENTS.md](../../AGENTS.md).

- Trace metrics ([Motion stats](../product/motion-stats.md)): the pure sections
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
    via the layout events' cell mapping: `layoutCellGrid` insets the cell
    grid by the board's bevel, an eighth of a cell, because layout events
    measure the border box; before 2026-09-26 the border box itself was
    treated as the grid, which put 3.25% of recorded clicks in a neighboring
    cell);
  - `computeClickCadence` — press-to-press click timing over 'ldown' +
    'rdown' events (2026-08-22): gap quartiles (median + IQR/median
    spread), fastest gap, peak presses in a rolling 1 s window, share of
    gaps under 250 ms, share of presses with a cursor sample within
    100 ms before the press;
  - `computeAllTraceMetrics` — the combined {bio, psych, hev, waste,
    cad} object the display consumes.
  `game/metric-definitions.js` holds `TRACE_METRIC_GROUPS` (per system: key,
  name, help, displays of {label, help, of, fmt}; series identity is
  metricSeriesKey = group key + label; not everything computed is
  displayed). A display of a game data measurement (cadence spread) is
  `catalogMetricDisplay(id, of)`, its label, help, and format from
  `GameData.metrics` ([measurement catalog](measurement-catalog.md)). `game/motion-stats.js` holds the rest: `metricsSeries` (reset
  by `beginTraceMetricsSeries` from `beginTrace`), `buildSparkline(tMs,
  values, size)` with the SPARK_LARGE geometry from `game/charts.js`,
  and `buildMetricRow` and `buildMetricsGroupHead` (each label is a
  `chartHelpButton(help, label)`, so the label text is the help trigger;
  headings without help, the Fitts curve and spatial grid, stay plain
  text); values pass through `displayableNumber` in `game/charts.js`
  (undefined and NaN both render as the en dash). Live: `scheduleMetricsUpdate` invalidates from trace mutations
  (`game/input-trace.js`) and the active game's clock (`game/play.js`,
  `game/controls.js`). One trailing task coalesces input bursts (250ms
  minimum sample spacing), then dispatches to the live worker; it never
  polls while idle. Replies append the sampled metrics to `metricsSeries`,
  set `lastLiveMetrics`, and call `renderMotionStats`. Sampling runs with
  the section open or closed, because `saveTrace` stores the sample times.
  `createTraceMetricComputer` in the worker recomputes psych/hev only when
  the click-event count changes; elapsed-only updates reuse all input
  computations and derive `traceSilenceRatio` from the new duration.
  The section: `initMotionStats` (from `init`, before the first board)
  builds it with `buildStatSection('motionStats', 'motion stats')` into
  `#motion-stats`, after `#result-ranks`; the title toggles
  `settings.panels.motionStats` and re-renders. `renderMotionStats` draws
  nothing while the section is closed. Open, it shows `finalMotion` once a
  finished game's final measurement is in, else `lastLiveMetrics` while
  tracing or on a just-finished board, else "No game in progress." A new
  trace keeps the previous rows until its first reply, so that line shows
  only before a page's first sample. The rows (`.motion-chart`, grouped
  per `TRACE_METRIC_GROUPS` entry) are built once and then updated in
  place through each row's `updateMetrics`; the Fitts curve and spatial
  bias grid are rebuilt only when `finalMotion` changes.
  Game-end transition: `lose` paints the mine-hit board and dead face,
  while `checkWin` paints only the cool face (the board and mine counter
  keep the player's own flags); both
  then use `reportResultAfterPaint`, which renders nothing in the ending
  input's task. After one requestAnimationFrame + timer paint boundary
  (`afterNextPaint`), `showPendingResultShell` renders the outcome, exact
  final time, and loading status (ending with the same `syncBoardLayout`
  renderResult uses, so the shell's first frame is placed correctly); a second
  boundary precedes `flushPendingResult`, which shows the shell first if an
  earlier flush arrived inside the window.
  `reportResult` then persists the captured primary facts and dispatches
  analysis. The worker reply supplies metrics before asynchronous report
  presentation replaces that shell, if its view is still current. The game-end timestamp is captured before
  deferral. A 250ms fallback covers throttled frames, while the next
  pointer/key input, `newGame`, hidden-visibility, and pagehide all flush
  pending finalization before mutable game state can change or the page can
  unload with an unsaved record. Final:
  the finished-game worker computes
  `computeAllTraceMetrics` with wall time endedAt - trace.startedAt (the
  stored trace's definition); `reportResult` appends that final sample to
  the finished game's series and sets `finalMotion` {metrics, series,
  spatial} before rendering the result. `newGame` nulls `finalMotion` with
  `renderedResult`.
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
  If any implementation's definitions change, change its counterpart and
  rerun. `tests/metrics-updates-test.js` checks scheduler coalescing, elapsed
  caching, visibility, and the absence of idle work;
  `tests/metrics-updates-test.html` checks the open section's real DOM
  identity, focus, scroll, idle mutations, and game lifecycle on the test
  origin.
  Node-harness caution: the music sampler's setInterval keeps a bare
  `node` process alive — full-game harnesses must wrap global.setInterval
  to `.unref()` the handle (or extract only the computation section).

- Hevelius event metadata uses a single chronological sweep through events and
  nonoverlapping movement segments: O(E+C) preparation for E events/C clicks,
  instead of rescanning every event prefix per segment. Kinematic and entropy
  computations retain their definitions and costs. `createTraceMetricComputer`
  scans new events once and caches completed-segment systems until the next
  completed click. Restore uses typed-array views and advancing event/sample
  cursors, then projects only display series in the worker. It still calculates
  whole-prefix measurements at stored sample times; this is not a claim of
  linear total trace reconstruction. `tests/trace-segment-sweep-test.js` and
  `tests/trace-metric-cache-test.js` check independent window/caching parity.
- Live requests have one job in flight and transfer only trace deltas; idle
  elapsed updates reuse computed input features in the worker. Final time is appended to
  the stored sample schedule before dispatch. The spatial-bias fitter uses
  the same exact `trend-fit.js` algorithm as all other trend lines.

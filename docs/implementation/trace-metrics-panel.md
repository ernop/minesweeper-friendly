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
  name, help, displays of {label, help, of, fmt}; `buildMetricRow` and
  `buildMetricsGroupHead` render each label as a `chartHelpButton(help,
  label)`, so the label text is the help trigger, and headings without help
  (session, Fitts curve, spatial grid) stay plain text; series identity is
  metricSeriesKey = group key + label; not everything
  computed is displayed), `metricsSeries` (reset by
  `beginTraceMetricsSeries` from `beginTrace`),
  `buildSparkline(tMs, values, size)` with SPARK_SMALL/SPARK_LARGE
  geometries, `buildMetricRow`/`buildMetricsGroupHead` shared by both
  displays, and `displayableNumber` (undefined and NaN both render as
  the en dash). Live: `scheduleMetricsUpdate` invalidates from trace/session
  mutations and the existing active-game clock. One trailing task coalesces
  input bursts (250ms minimum sample spacing), then dispatches to the live worker; it never polls while idle. Replies
  append the sampled metrics and update the mounted view. `renderLiveTraceMetrics` appends to
  the series even with the panel off. `createTraceMetricComputer` in the worker recomputes psych/hev
  only when the click-event count changes; elapsed-only updates reuse all
  input computations and derive `traceSilenceRatio` from the new duration.
  `renderMetricsPanel(metrics)` maintains `#metrics-panel` as the
  always-shown session heading with the page's one session picker +
  the switch-cost row and the session section (both
  settings.showSessionStats) + live per-game rows
  (settings.showMotionStatsDuringGame, only while tracing with metrics
  non-null — null means "no live rows", the between-games render); the
  panel is unhidden on its first render and never hidden again;
  `metricsPanelView` retains controls, rows, SVGs, and the resize grip;
  `updateMetrics`/`updateSeries` mutate only live text and geometry.
  `metricsPanelCollapsed` + `lastLiveMetrics` implement the panel's own
  × / "stats ▸" session toggler; `refreshMetricsPanel` (called from the
  settings change handler) applies the settings mid-game and between
  games. Game-end transition: `lose` paints the mine-hit board and dead face,
  while `checkWin` paints the completed marks, counter, and cool face; both
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
  elapsed updates reuse computed input features in the worker. Game-end
  cadence is shared with the session ending event. Final time is appended to
  the stored sample schedule before dispatch. The spatial-bias fitter uses
  the same exact `trend-fit.js` algorithm as all other trend lines.

## Switch cost row (2026-09-28 section; session row 2026-10-08)

Spec: [Switching](../product/trace-metrics-panel.md#switching-creator-request-and-approval-2026-09-28).

- `switch-cost.js` (pure; the page loads it for `SwitchCost.KEYS`,
  `WINDOW_GAMES`, and `MIN_GAMES`; the worker and Node tests run it):
  - `gameRows(trace, outcome, board, deps)` replays the game with
    `deps.training.replay` (TrainingCore) and its `beforeInput` hook, which
    records progress and the single-number offers (chordable numbers,
    proven-safe cells, proven mines) before every input. Each left release is
    paired with its latest left press, in `TrainingCore.boardInputs` order;
    rows are consecutive move pairs timed press to press within 40-5,000 ms.
    Distance is between the two press positions when the layout rect is the
    same at both presses, else between cell centres; the cell size comes from
    the last layout event with the eighth-of-a-cell bevel.
  - `window(candidates, gameOf)` walks newest first to 500 games with a
    transition, loading no candidate past the window (`gameOf` may be async).
  - `since(candidates, fromMs, gameOf)` walks newest first through every
    candidate that ended at or after `fromMs` (inclusive, as
    `SessionScope.bounds`) and keeps those with a transition, however many;
    it loads no candidate that ended earlier.
  - `fit(games)` builds P1's 20 columns in the study's order. Each spline
    uses the natural cubic basis x, d_k - d_{K-1} (ESL 5.4-5.5), which spans
    patsy's `cr` space less the constant the game intercepts absorb. It
    demeans by game, solves by Householder QR in column order (a column that
    earlier ones already span is left out, as the study's fit did), and
    returns beta, the CR1 standard error by game with the study's correction
    g/(g-1) x (n-1)/(n-p), the percentage and its 95% interval, ms at the
    median switch interval, and the switch share. Under `MIN_GAMES` (30) the
    status is `too-few-games`; unidentifiable data give `not-measurable`.
  - `knots` places patsy's knots on distinct values within `KNOT_TOLERANCE`
    (1e-9): with exact distinct doubles, last-bit differences between numpy's
    and V8's `log2`/`hypot` moved the Fitts knots (1.46084/1.94262 against
    1.46115/1.92487 on the same 25,970 rows) and the estimate by 0.012
    points. Percentiles reproduce numpy's two-sided linear interpolation.
- `training-core.js`: replay steps carry `opened` and `openedZeros` (cells
  the input opened, empty ones among them); `beforeInput(event, view)` sees
  the visible board before each input and its return value becomes
  `step.before`; `boardInputs` is exported.
- `switch-cost-worker.js` is `analysisTask`'s `switch-cost` lane
  (`startAnalysisWorker` in `analysis-client.js`; one task kind, `estimate`,
  payload `{ database, candidates, sessionFromMs }`, reply
  `{ session, latest }`, one `fit` result per pool). It opens the database
  with the page's name and version as `training-worker.js` does, reads each
  trace in its own transaction, keeps every saved game's rows for the page's
  lifetime, and does not remember a missing trace (a just-finished game's
  trace may not be committed when an earlier request lists it). It keeps the
  previous reply's fits keyed by their games' end times, so a pool whose
  games did not change (the latest 500 when another session is picked, or
  the session when both pools hold the same games) is not fitted again.
  `solver.js` needs `justice.js` loaded first.
- `game/metrics-panel.js`, section "SWITCH COST":
  - `buildSwitchCostRow`: built once with the panel and placed right after
    the session heading. A table whose header row names `SWITCH_COST_POOLS`
    and whose one body row holds the label (`chartHelpButton`) and a cell
    per pool; its `updateFits` changes only those cells' text, with a true
    minus sign, and closes an open card.
  - `fillSwitchCostCard`: `SWITCH_COST_DETAILS` per pool, a sentence per
    `not-measurable` pool, the definition, and which games count.
  - `switchCostCandidates`: the three keys' records, newest first.
  - `refreshSwitchCost`: while the row is hidden (`switchCostShown`: session
    stats on and the panel open) it only sets `switchCostStale`. Otherwise
    one request in flight and one rerun queued; `switchCostRequest` keeps the
    request's candidates, its session start, and how many candidates ended
    inside the window. Failures go through `analysisFailure`.
  - `keepSwitchCostCurrent`: called by `renderMetricsPanelContent` whenever
    it shows the session stats. It runs a stale refresh, or one when the
    session window now holds a different number of the request's
    candidates (another session picked, or the window's start passing a
    game).
  - `switchCostSourcesChanged`: called when `saveTrace` completes. `init`
    calls `refreshSwitchCost` after startup.
- `style.css`, `.switch-cost-table`: the value cells are `width: 6ch` with
  `box-sizing: content-box`, since the page's global border-box would put
  the padding inside the six characters, and the label column, the only one
  without a width, takes the slack. With the label column at `width: 100%`
  instead, Chromium sizes the value columns to their content alone, so a
  dash and an estimate differ in width.
- Verification: `tests/switch-cost-test.js` (known-answer transitions from a
  hand-built game, numpy knots, the fit against `tests/switch-cost-reference.json`
  within 1e-9, coverage of the fixture's planted effect, window and session
  rules); `tests/training-core-test.js` (the replay additions);
  `tests/switch-cost-browser-check.js`: hidden, with nothing read, while
  session stats are off; the row directly under the picker; both pools' fits
  from IndexedDB equal Node's within 1e-12 over the past 4 hours, the past
  hour, the past 10 minutes, and the past hour ten minutes later (a shifted
  `Date.now`); the rendered row and card; a finished game joining both
  pools; hiding with the panel and with session stats; row heights and value
  widths unchanged through replies and at 220, 640, and 316 px. It serves
  the working tree by request routing under 8099, so it needs no server, and
  runs in Chromium only: Firefox does not route the requests a worker makes
  itself (`importScripts`). An optional third argument saves a screenshot of
  the panel's top with the card open. After a fixture or estimator change,
  regenerate the reference: `node tests/switch-cost-fixture.js ROWS.jsonl` then
  `python analysis/switch-cost/reference.py ROWS.jsonl tests/switch-cost-reference.json`.
- Real-data parity (2026-09-28, the study's latest 500 standard games,
  25,970 transitions, the same window by end time as by start time): in-game
  +7.383% (+6.371 to +8.405), 17.9 ms per switch, 53.62% of moves switching;
  `analysis/switch-cost/reference.py` on the same rows agrees to 4e-13; the
  study's own run with exact-double knots gave +7.382% (+6.370 to +8.405).
  Node timing on this machine: rows for all 3,220 traces 0.52 s, the fit
  0.06 s.

# minesweeper-friendly — Agent Index

Start here. This is the master index for the project.

## What this project is

A minesweeper project growing out of research into solver-aware game modes
(2026-08-19 session). Reference point: minesweeper.online's "no guessing" (NG)
mode, where the generator verifies with a logical solver that every board is
completable without guessing.

The design axis mapped so far, ordered by who bears the burden of ambiguity:

1. Naive random — mines fixed, no guarantees.
2. First-click safe — standard mode today; opening never kills.
3. No-guess (NG) — a complete logical path is guaranteed at generation time
   (minesweeper.online NG, Simon Tatham's Mines).
4. Evil NG — additionally guarantees a difficulty floor (at least one advanced
   deduction per board).
5. Graded NG (unbuilt: score by hardest required technique, as Sudoku
   grading does). Built 2026-08-21: uniform-hardness NG, single-path NG,
   proof-or-die NG (opening a not-provably-safe cell kills even if empty).
6. Kaboom (pwmarcz.pl/kaboom) — adversarial: mines stay unfixed; any unforced
   guess is a mine, forced guesses are always safe. Unbuilt.
7. The angelic dual of Kaboom: any guess consistent with your information
   succeeds; you die only by contradicting known facts. First step
   implemented 2026-08-20 as "A just universe" (PRODUCT.md): certified
   sealed-pocket entries are guaranteed safe; open-field gambles and all
   chords stay deadly. The rest of the dual is the Angelic play mode
   (2026-08-21): a cell that is not a proven mine is made safe.

The repo name points at entry 7 and its neighbors: variants friendlier than
standard play.

Unbuilt work lives in one file: [BACKLOG.md](BACKLOG.md). That is the
place for generation ideas, deferred product, and requested rank lists
that are not in the game yet. Do not leave new ideas only in chat.

App-wide UI rules (simplicity first, captions must earn their place,
hover changes nothing, layout stability, clear ways in and out) live in
PRODUCT.md "UI doctrine" — read it before building or reshaping any
surface.

Solver logic tiers (what "solvable" means): (a) direct clue counting;
(b) arbitrary overlap-difference deduction (strict subsets and named
patterns are special cases); (c) exhaustive frontier-component constraint
search joined through the global mine count and unconstrained sea.
Completed tier-(c) results capture every fact common to all layouts
consistent with the player's visible information. NG generation is generate → solve → reject/repair →
repeat. One derived result from the session: a 1-2…2-1 wall chain with k twos
is fully forced unless k ≡ 0 (mod 3), in which case only every third cell is a
forced mine.

## State

Runtime: `index.html` + `style.css` + pure `rng.js` / `justice.js` /
`board-shape.js` / `solver.js` / `generators.js` / `odds.js` /
`trial.js` + shared `storage.js` / `settings-core.js` +
`minesweeper.js`, no dependencies, no build step. The settings page is `settings.html` + `settings-page.js`,
loading the same `style.css`, `storage.js`, and `settings-core.js` (both
pages must load storage.js and settings-core.js before their own script).
Serve with `python3 -m http.server 8018 --bind 127.0.0.1` and open exactly
`http://127.0.0.1:8018/`.

**`PRODUCT.md` is the canonical spec of every product and UI decision**
(board chrome, layout rules, rank lists, rankaverages, streaks, scatters,
backup). Read it before changing behavior; keep it and the code in sync in
the same change. Below is only the implementation mapping.

Implementation notes:

- Storage (PRODUCT.md "Storage"): one IndexedDB database
  (`minesweeper-friendly`, version 2), two stores. The open, upgrade,
  `readAllUserdata`, and `persistUserdata` live in `storage.js`
  (2026-08-23, shared with the settings page); each page defines two
  late-bound hooks: `storageFailure(what)` (announce + throw) and
  `userdataReady()` (called once BOTH the db is open and the document's
  scripts have run — the open can otherwise race the later `<script>`
  fetches and call a hook that does not exist yet). `userdata` holds one
  entry per kind — 'history', 'settings', 'rankavgSort', 'states',
  'trial' (`USERDATA_KINDS`); `traces` holds one entry per game. Userdata
  is RAM-first: the game page's `userdataReady` fills the RAM objects
  (`history`, `settings`, `rankavgSorts`, `playerStates`) via
  `readAllUserdata`, then calls `init()` (states panel, first board —
  everything that reads userdata waits there; only static chrome builds
  at parse). All reads/mutations touch RAM synchronously; every mutation
  calls `persistUserdata(kind, ramObject)`, an async fire-and-forget
  put (IndexedDB clones at put() time, so later RAM mutations cannot
  race). The game page's `storageFailure` announces in #backup-status;
  the settings page's in #settings-status — no silent storage loss.
  The version-2 upgrade carries the pre-2026-08-20 localStorage keys
  (`LEGACY_LOCALSTORAGE_KEYS`) into `userdata` once, removing them after
  the upgrade transaction commits; deletable once every player's origin
  has upgraded. Cross-page consistency: each page reads settings fresh
  at load and writes through immediately; the game and settings pages
  are never open as two live views of the same RAM.
- History: userdata 'history' maps mode key to a
  chronological array of game records, one per finished game:
  {endedAt, outcome: 'win'|'loss', timeMs, bv3, clicks, wastedClicks,
  misclicks, flagsPlaced, flagsRemoved, mousePathPx, states, justice,
  justiceEnabled, seed, rngVersion, boardVersion, justiceVersion,
  maxAdjacent, hasSeven, zeroCount, islandCount, largestIsland,
  playMode, identityIndex, transform, trialStartedAt, guesses,
  guessIdealRisk, guessNonideal, guessPerfect, lifeLost, lifeNeedless,
  oddsVersion, actionEvaluations,
  fastclickGapMs, musicPlaying} —
  (`justiceSaves` is historical: written only during part of 2026-08-23,
  no longer recorded or shown; the schema still accepts it) —
  primary measurements only
  (later-added fields may be absent on earlier records; see
  `GAME_RECORD_SCHEMA`). The mode key is the top score key: board
  parameters, play mode, and board generator (`modeKey()`, e.g.
  `9x9/10@standard`, or with a non-default generator
  `9x9/10@standard+pink-noise(alpha=1,scale=8,contrast=2)`); keys
  without `@` mean Standard, keys without `+` mean the default uniform
  generator. Difficulty names are display-only. Timestamps are epoch
  ms; all calendar math is done in the viewer's local timezone at read
  time. This schema replaced the `scores.v1`/`losses.v1` pair
  (2026-08-19, data-structure rectification); the old keys are not read
  and any data under them is ignored.
- Derived metrics (3BV/s, efficiency %, correctness %, throughput, IOS,
  mouse speed, path/click, path/3BV) are computed at read time via
  `secondsOf`/`bvPerSecond`/`efficiencyPercent`/`correctnessPercent`/
  `throughputOf`/`iosOf`, never stored. Correctness needs `wastedClicks`
  (absent = unmeasured). Throughput and IOS are wins-only; IOS is also
  blank when time ≤ 1s.
- `mousePathPx`: cursor distance accumulated on document mousemove only
  while `gameState === 'playing'`.
- Raw input traces (PRODUCT.md "Raw input traces"): `beginTrace` (end of
  newGame's board build) starts {startedAt, t0, t/x/y sample arrays,
  events}; the document mousemove handler appends a sample per move while
  `tracing()` (ready or playing). `traceEvent` logs 'ldown'/'lup'/'rdown'
  from the board handlers (document mouseup catches off-cell releases,
  index null); `recordLayout` logs board-geometry events (newGame,
  scroll, resize, zoom), and `recordLayoutIfMoved` (2026-08-23)
  re-records whenever the board's rect differs from the last layout
  event — called from `traceEvent` and from the `renderMetricsPanel`
  wrapper (the panel appearing/collapsing/resizing is the known
  no-event board mover; the live-metrics tick reaches it once a second
  as the catch-all). `node tests/trace-layout-test.js` freezes these
  rules. `saveTrace` (called from reportResult) puts
  {endedAt, mode, outcome, startedAt, sampleT/sampleX/sampleY as typed
  arrays, events} into the `traces` store, keyPath endedAt (never held
  in RAM — far too large). Failures go through `storageFailure`
  (#backup-status + throw) — no silent trace loss. "export traces"
  (#export-traces-btn + #export-traces-file) downloads every trace as a
  JSON array with the typed arrays converted back to plain arrays.
- Path replay views (PRODUCT.md "Path replay views"): `#path-view-btn`
  (in `#scores-nav`) cycles `pathView` off → moves → clicks;
  `renderPathOverlay` draws `#path-canvas` (absolute over `#board`,
  pointer-events none, covering the border box the layout events
  measured) from the RAM trace of the game just finished —
  `pathPointMapper` walks the layout events so each point maps through
  the geometry at its trace time; a lazily created ResizeObserver on
  `#board` redraws on zoom. `reportResult` renders button + overlay
  after `renderResult`; `newGame` nulls `pathCanvas` (the board rebuild
  removed the node) and re-hides the button; `pathViewAvailable` also
  requires `#game-frame` visible (trial off-board phases). Nothing is
  persisted.
- Offline analysis lives under `analysis/` (inputs: the exported trace
  JSON). `analysis/mousetrap/trace_measures.R` computes psychometric
  mouse-tracking measures per inter-click segment; it runs on the R env
  at `~/analysis-envs/r-mousetrap` (created 2026-08-20 with micromamba at
  `~/.local/bin/micromamba` — this machine has no system R and no
  passwordless sudo; mousetrap itself compiled from CRAN, its heavy deps
  installed as conda-forge binaries). `analysis/biometrics/` holds the
  mouse-dynamics feature extractor with its own venv.
- Trace metrics (PRODUCT.md "Trace metrics panel"): the pure sections
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
  the en dash). Live: a top-level setInterval (LIVE_METRICS_EVERY_MS)
  runs `renderLiveTraceMetrics` while `tracing()` — it always appends to
  the series (so the after-game charts exist even with the panel off);
  `liveSegmentCache` recomputes the segment-based systems (psych, hev)
  only when the trace's click-event count changes, whole-trace systems
  every tick; `renderMetricsPanel(metrics)` renders `#metrics-panel` as
  session section (settings.showSessionStats) + live per-game rows
  (settings.showMotionStatsDuringGame, only while tracing with metrics
  non-null — null means "no live rows", the between-games render);
  `metricsPanelCollapsed` + `lastLiveMetrics` implement the panel's own
  × / "stats ▸" session toggler; `refreshMetricsPanel` (called from the
  settings change handler) applies the settings mid-game and between
  games. Final: `reportResult` computes
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
  - `tests/session-buckets-test.js` — known-answer event lists for the
    session-stats bucketing (extracts the SESSION STATS: COMPUTATION
    span; cumulative-play compaction across wall-clock breaks, per-bucket
    rates, open intervals, history retention, the 1s minimum-play rule,
    medians).
  If any implementation's definitions change, change its counterpart and
  rerun. Node-harness caution: the top-level setInterval keeps a bare
  `node` process alive — full-game harnesses must wrap global.setInterval
  to `.unref()` the handle (or extract only the computation section).
- Trace timestamp invariant (PRODUCT.md "Raw input traces"): the document
  mousemove recorder coalesces events whose precision-reduced
  performance.now() equals the previous sample's (latest position wins),
  so sampleT is strictly increasing by construction. This is what keeps
  every dt > 0 (no Infinity speeds/jerk in the metrics panel — the
  2026-08-20 bug) and satisfies the offline extractor's validation.
  Simulated-input tests must dispatch mousemoves with real delays
  (~12ms sleeps) or they exercise exactly this coalescing path.
- `clickCount` counts only effective clicks; `wastedClicks` counts board
  clicks that changed nothing — `toggleFlag` and `chord` return whether
  they had an effect, and the mouseup/contextmenu handlers count the
  falses plus left-clicks on flagged cells. Stored on the record since
  2026-08-19; `GAME_RECORD_SCHEMA` accepts its absence (older records),
  and the wasted-clicks scatter filters to wins that carry it.
- `misclicks` counts board-changing actions contradicted by facts provable
  from the visible board at input time. `Solver.isVisibleMisclick` owns
  the pure classification: reveal of a certain mine, placement on a
  proven safe, removal from a certain mine, or a chord whose opened set
  contains a certain mine / flagged set contains a proven safe. The
  mouseup/contextmenu handlers classify and increment before acting so a
  fatal action reaches `reportResult`; `newGame` resets it. Stored since
  2026-08-23; older records omit it. A fatal misclick can also carry one
  or more tags in `actionEvaluations`; the count and evidence ledger are
  independent measurements.
- `flagsPlaced` counts flag placements by the player (removals don't
  subtract; the win auto-flagging in `checkWin` bypasses `toggleFlag` and
  is not counted). `isMarkless(record)` derives the markless status
  (flagsPlaced === 0); records from before the measurement have it
  undefined and never qualify. Same absence rules as wastedClicks.
  Display: the `.markless-time` class on a time cell draws a small
  olive-green "(m)" before the time via CSS `::before` — applied in
  `timeAgeRow` (every time-ranked list) and the stats table's Time row.
- `flagsRemoved` counts flag removals by the player (both branches live in
  `toggleFlag`). It stays separate from no-op clicks because removal
  changed the board; its reason is not inferred. Same absence rules as
  wastedClicks (absent before 2026-08-20).
- Session stats (PRODUCT.md "Session stats"): three marker-delimited
  spans in minesweeper.js. COMPUTATION (pure, Node-extractable):
  `sessionBucketSeries(events, {nowMs, bucketMs, windowMs, openPlayFrom,
  playOffsetMs})` compacts a wall-clock event list into cumulative played
  time, removing every between-play gap, then buckets it
  ({kind:'play',from,to} finished play
  spans, {kind:'move',at,px} ~1s-coalesced cursor travel while playing,
  {kind:'press',at,useful,flag,unflag,misclick,moving,gapMs},
  {kind:'death',at,mistake}, and
  {kind:'evaluation',at,category,excessRisk,modeledLifeGap}) into the eight legacy series (speed, click rate,
  mistake-tagged deaths/min, misclicks/min, no-ops/min, flags/s,
  flag-removals/min, fastclick gap), five exclusive report-category rates,
  and the excess-risk / modeled-life magnitudes, plus raw per-bucket `sums`.
  `sessionRunningSeries(events, {nowMs, stepMs, lookbackMs, windowMs,
  openPlayFrom, playOffsetMs})` — what the charts show since 2026-08-23 —
  layers trailing running averages over it: fine SESSION_STEP_MS (10s)
  buckets, prefix-sum rolling windows of lookbackMs of played time, one
  sample per step (the newest rides the current play position; finished
  samples never change), rates divided by the played time actually
  covered, fastclick median pooled over the lookback's gaps, endings
  fractions and the wins' unmarked-mine average (`winUnmarkedFraction`,
  measured wins only) cumulative over the chart window and ignoring the
  lookback. Ending kinds (SESSION_END_KINDS) are win, the modern
  fatal-action statuses (`sessionEndingKind` in the verdict section —
  the report's exact loss categories), the five legacy verdicts as
  provenance, and 'other'.
  Constants FASTCLICK_MAX_GAP_MS (1s), SESSION_MIN_PLAY_MS (1s — rates
  over a sliver of covered play are undefined, not absurd),
  SESSION_KEEP_MS (max window + max lookback + slack). RECORDING (RAM only):
  `sessionEvents` pruned to SESSION_KEEP_MS of played duration by
  `sessionPrune`; `sessionPlayOffsetMs` preserves cumulative bucket
  alignment after older events leave RAM;
  `sessionPlayBegin` hooks `startTimer` (every transition into
  'playing' passes there), `sessionPlayEnd` hooks `finish` and the top
  of `newGame` (abandoned boards close their interval — the time was
  real); `sessionRecordMove` taps the document mousemove handler beside
  mousePathPx; `sessionRecordPress(useful, flagPlaced, flagRemoved,
  misclick)` taps the board
  mouseup and contextmenu handlers beside the wastedClicks counting
  (`sessionLastUsefulPressAt` resets in newGame so gaps never span
  games; `sessionLastMoveAt` gives the 100ms moving flag); it also
  collects this game's qualifying gaps into `gameFastclickGaps` (reset
  in newGame), whose median `reportResult` stores as the record's
  `fastclickGapMs` (win or loss; absent when nothing qualified — the
  per-game click, no-op, misclick, and mark rates derive from stored
  fields); `sessionRecordDeath` is called from
  `lose`; `sessionRecordEvaluation` is called by
  `recordActionEvaluation` for every retained live evaluation.
  `sessionBackfillFromHistory` (called once from init, after
  userdataReady fills history and before any live event) scans records of
  every mode backward until enough actual play is retained, regardless of
  wall age, and rebuilds them as {kind:'game'} events —
  totals and `actionCategorySummary` spread by bucket overlap in
  sessionBucketSeries, death in the
  bucket containing to − 1 (an end on a bucket boundary must not spill
  into the next bucket), stored fastclick median as one gap sample per
  overlapped bucket, a stored win's unmarked-mine share derived (never
  stored) by `recordWinUnmarkedShare(record, minesOfModeKey(key))` from
  flagsPlaced − flagsRemoved (live wins count unflagged mines in
  checkWin before the auto-flag sweep and pass the share to
  `sessionRecordEnd('win', share)`); live and backfill cannot overlap
  because every backfilled game ended before the page load. DISPLAY: `SESSION_GROUP` +
  `SESSION_METRIC_SPECS` (solo rows: mouse speed, fastclick gap, and the
  enabled excess-risk / modeled-life magnitude charts;
  label carries the unit and sits flush on the plot — no axis captions,
  the "-15m … now" x ticks speak for themselves) +
  `SESSION_RATE_SPECS` (the six action rates, each with unit '/m' or
  '/s' — chosen for meaty values; no-op clicks charts /s since
  2026-08-23 by dividing the stored per-minute series by 60 in its
  spec — color, and bare-number fmt) plus
  `SESSION_CATEGORY_RATE_SPECS` (one `/m` line per enabled exclusive
  report category), rendered
  by `buildSessionChart` / `buildSessionRatesChart(buckets, specs, unit)`
  + `appendSessionRatesRow(container, buckets, unit)` (two unit-grouped
  plots right after endings — "action rates/m" then "action rates/s",
  split 2026-08-23 evening so neither unit's magnitudes squash the
  other's: each a 0-rooted integer scale with unit-suffixed ticks whose
  ceiling comes from `rateScaleCeiling(max, remembered)` (computation
  section, tested in session-buckets-test): the 1-2-5-10 ladder via
  `rateScaleStep`, growing immediately, shrinking only when max fits
  80% of a lower step, remembered per chart key in the RAM-only
  `sessionRateScaleMemory` map; no legend — each line's name+value+unit floats
  at its endpoint in the line's color, cascade-nudged apart preserving
  line order, with HOW/RECORDS as hover titles on lines and labels),
  `latestDefined` (measurability),
  `appendSessionSection` (renders into the panel top, hosts the
  running-average <select> writing settings.sessionLookbackSeconds and
  the window <select> writing settings.sessionWindowMinutes;
  SESSION_LOOKBACK_CHOICES and SESSION_WINDOW_CHOICES live beside
  SETTINGS_SCHEMA's constants in minesweeper.js). The live-metrics
  setInterval redraws the panel while active play advances;
  `renderMetricsPanel` snapshots/restores `#metrics-panel-content`'s
  scrollTop so
  periodic replacement cannot push the reader away from lower charts.
- Action evidence (PRODUCT.md "Game-end evaluation"):
  `evaluateRevealAction`, `evaluateChordAction`, `evaluateFlagAction`, and
  `evaluateNoOpAction`
  capture the visible board before mutation, independent mistake tags,
  chosen/best raw and protection-aware actual risk, one-ply expected-life
  values, no-op reason, and highlighted alternatives. Compact no-op
  evaluations deliberately omit a board snapshot.
  `actionEvaluationCategory` assigns exactly one primary category in
  severity order (`gameLoss`, `gameRisk`, `timeLoss`,
  `lifeMaximization`, `measurementNotes`); actual-risk delta, not raw
  odds alone, determines survived game risk. `actionCategorySummary`
  supplies category frequencies and magnitudes to session backfill.
  `recordActionEvaluation` keeps every nonfatal tagged
  action; `lose(hitIndices, evaluation)` always keeps the fatal action.
  `reportResult` writes only the versioned `actionEvaluations` array.
  `renderResult` puts `buildVerdictBlocks` in the centered, responsive
  `#result-analysis` below the board (never the 320px stat sidebar);
  the builder groups each action once by primary category and obeys
  `settings.reportScope` through `reportScopeAllows`: none, fatal-only
  (new-player default), fatal+risk, or full. `buildReportScopeControl`
  renders the same persistent choice directly above the current report and
  re-renders immediately; the settings page shares `REPORT_SCOPE_CHOICES`.
  Every direct reveal is evaluated before opening whether or not the player
  ever flags or chords. `buildVerdictBlocks` returns `null` when no enabled
  category has content; it never manufactures an empty-success measurement
  note.
  `orderReportEntries` fixes section order at fatal, game risk, time loss,
  life maximization, then notes; survived game-risk actions sort by highest
  selected actual death probability, then excess risk, while other sections
  retain action order. Winning records use this same path and therefore
  show survived risky actions at risk/full scope without inventing a fatal block.
  Life-model secondary prose/alternatives appear only at full scope.
  `aggregateReportEntries` collapses semantically identical
  positionless entries into reason-specific counts while positioned
  entries stay individual. `actionEvaluationLines` turns positioned
  reports into compact labeled difference/value rows, merging identical
  raw/active risk and stating model ties once. `evaluationCropBounds`
  excludes large alternative sets from its bounds and crops uniform
  covered remainder to visible/flagged/selected/trigger cells plus two
  context cells; `buildEvaluationPosition` labels and draws that source
  range without revealing hidden mines. Trial result payloads copy the ledger, and
  `renderTrialReview` exposes the same blocks under each run's nested
  action report. `fatalActionStatusKind` is the single fatal-action
  classifier: `fatalActionStatusLabel` looks its kind up in
  FATAL_STATUS_LABELS for the report, and `sessionEndingKind` returns
  the same kind for the endings chart (legacy records keep their stored
  five-way verdict as provenance), so chart categories and report
  wording can never disagree. `evaluationEndingKind` remains only as
  the old five-way view for the report's legacy labels and verdict
  styling; modern chords classify
  by proven/needless/forced mine-opening evidence, while only legacy chord
  provenance keeps the dedicated chord line. `normalizeGameRecord`
  runs inside history load and import: it converts `stupidDeath`,
  `deathKind`, `deathRisk`, and `deathBestRisk` to an explicitly
  provenance-marked fatal evaluation, deletes all four fields, and causes
  normalized history to be persisted. `proofCorrectedEvaluation` also
  reruns saved-position entries carrying the old
  `opened-unproven-with-safe-move` tag; a complete proof that the selected
  cell was safe removes and persists that obsolete tag. A pre-ledger win becomes a
  `pre-action-evaluation-coverage` measurement note instead of an
  invented clean ledger. Runtime code never reads the old fields.
- Music state (PRODUCT.md "Music playing"): `sampleMusic` fetches
  `MUSIC_ENDPOINT` (http://localhost/api/is-music-playing — the resident
  ProjectLauncher at `~/proj/mybrowser/utilities/caddy/launcher/launcher.py`,
  proxied by Caddy from :80 to :8787, answering from PipeWire with a 60s
  cache and `Access-Control-Allow-Origin: *`: true = `pw-dump` shows a
  running output stream (speech-dispatcher excluded) AND a ~0.5s
  `pw-record` probe of the default sink's monitor has RMS ≥ -60 dBFS,
  because paused/idle web players can hold a running stream of silence;
  Firefox exempts
  http://localhost from mixed-content blocking, so the GitHub Pages origin
  can fetch it too). `beginMusicSampling` (called from newGame beside
  beginTrace) resets `musicObservations` and samples once; a top-level
  setInterval (`MUSIC_SAMPLE_EVERY_MS`, 15s) polls continuously — not
  only during games — because `musicNow` also drives the live indicator
  (`#music-indicator`, the olive "music" chip in `#top-right`, rendered
  by `renderMusicIndicator`; hidden unless the latest answer is exactly
  true, so unknown never displays as silence). An answer is pushed onto
  `musicObservations` only while `tracing()` — it is at most seconds old,
  so it belongs to the board now in play; one landing after game end is
  display-only. `reportResult` writes `musicPlaying` (any-sample-true)
  only when at least one answer arrived during the game — a failed fetch
  sets `musicNow` null and produces no observation, because
  unreachable-endpoint is the designed "not measured" state on foreign
  origins, not a hidden error.
- Player states (PRODUCT.md "Player states"): userdata 'states' holds
  `[{name, active}]` in display order; absent entry = new player,
  `userdataReady` fills `playerStates` with the `DEFAULT_STATE_NAMES`
  options (none active) and nothing is persisted until the player
  changes something. `activeStateNames()` is stamped
  onto every record as `states` (always written, `[]` when none active;
  absent on pre-2026-08-20 records, same absence rules as wastedClicks).
  UI: `#states` lives in `#top-right`, the fixed screen-chrome cluster
  pinned to the viewport's upper-right (shared with `#settings-btn`);
  fixed positioning means it occupies no layout space and never moves
  the board. Only active
  states render (chips; click = take off); `#states-add-btn` (a real
  bordered button holding a pressed `.open` look while the menu is up,
  2026-08-23) toggles
  `#states-menu` through `setStatesMenuOpen`, which lists the inactive
  options (click = put on, its
  `.state-remove` x = delete from list) plus the add form (a created
  state activates immediately) under a `#states-menu-head` header whose
  `#states-close` ×, Esc, and outside clicks all close it. `renderStates`
  rebuilds both chips and menu options.
- Rank list machinery: `rankWindows` (time windows + `specificity` for
  progressive disclosure), `rankColumns` (adds day categories, `isHoliday`),
  `windowBounds` (11-row windowing), `buildRankList` (shared renderer,
  always the full window), `relativeAge` / `formatAgeCount` + `.age-u-*`
  classes (age display and unit colors, shared with the scatter legend;
  h/d/w/y counts are one decimal including .0).   Board-shape lists
  (`has 8` / `has 7` / `max N` / `N islands` / `largest island N` /
  `N zeros`) are defined once in `boardShapeCandidates(record, wins)`
  (shared with the recent-placements summary) and rendered in
  `renderRanks` from the finished-board scalars computed by
  `board-shape.js` (`BoardShape.of`) at `reportResult`.
  `node tests/board-shape-test.js` freezes the neighborhood and island
  rules.
- Recent placements (PRODUCT.md "Recent placements"): the pure span
  between the "RECENT PLACEMENTS: COMPUTATION" and ": DISPLAY" markers —
  `ordinal`, `formatRankRuns` (run compression), `recentPlacementsSummary`
  over candidates {label, specificity, wins, startMs (time windows only:
  the strictly-longer rule; membership charts omit it and always
  qualify), alwaysShowBest (lifetime's near-miss rule, rows flagged
  nearMiss)} — computes the rows; `RECENT_PLACEMENTS_WINDOWS` (beside
  SESSION_LOOKBACK_CHOICES) defines the source-window choices, whose
  selector on the block's heading writes
  `settings.recentPlacementsWindow` (schema control 'none') and
  re-renders `renderedResult`; `buildRecentPlacements(record, wins,
  referenceMs)` builds the candidates — `rankColumns` (window columns
  carry startMs; day categories don't and so always qualify), this
  game's same-3BV chart, and `boardShapeCandidates(record, wins)` (the
  extracted shape-chart definitions the board-shape tablecharts also
  render from; the summary ignores the largestIsland display gate) —
  and renders the block in `renderRanks` right after the exact-3BV
  list, gated by shownThings.recentPlacements; nearMiss rows render the
  rank muted (`.recent-near-cell`). `dedupeRankCandidates` is shared
  with the full time/day and board-shape tablecharts, so the summary
  obeys `collapseDuplicateCharts` with the same pinned lifetime/week
  and most-specific-shape rules. Summary rows sort by competitor count
  descending, then broader specificity; the exact current record's
  ordinal carries `.recent-current-rank`, matching the full tablechart's
  bold light-blue current-row treatment.
  `node tests/recent-placements-test.js` freezes the formatting and
  summary rules.
- Rankaverages: `RANKAVERAGE_SPECS` (bucketing per stat), `avgDelta`
  (sign/color convention; rendered as a final grid row whose text sits in
  the average-time column).
- Streaks: run-splitting and the core-trim/dedupe/domination filter are in
  `renderRanks`; see PRODUCT.md for the double-counting rationale.
- Scatters: `buildScatter` + `niceTicks` (`timeTicks` for the date axis;
  `minorTicks` adds edge tickmarks between labeled divisions, skipped on
  the date axis), appended after a `.flex-break`; dots colored by age unit (`.age-dot-*`),
  the current game ringed and tagged with its today-rank, on-chart axis
  labels, legend appended last. Options: `timeAxis` (local calendar
  x-ticks), `idealLine` (y = x dashed floor), `trendLines`
  (`trendLinesFor`: the Theil–Sen line fit twice — all data in the age
  palette's years teal, today only in its hours blue, both dashed —
  clipped to the plot rect, drawn only across its own fit's x-range,
  no caption; on the average charts and the date / 3BV-time /
  3BV-clicks raw plots, always fit on untrimmed values — chosen
  2026-08-22 from a five-fit sampling, see PRODUCT.md "Average-time
  charts" and "Scatter plots").
- Layout: `#results` (summary + `#stats-grid` only) stays absolutely
  positioned flush with the available `main` column's right edge using
  main-container `cqw`, not viewport width. `syncResultsPlacement` measures
  the fixed `#top-right` controls and adds only enough top clearance to
  keep the stats below them while preserving that right alignment.
  `syncResultClearance` moves the separate report/rank flow below any
  stats overhang.
  A `ResizeObserver` re-evaluates main/chrome resizing and
  `html { scrollbar-gutter: stable }` protects board centering.
- Personal settings (PRODUCT.md "Personal settings"): the RAM `settings`
  object lives in `settings-core.js` (userdata 'settings', filled by each
  page's `userdataReady` via `settingsFrom`, which fills absent fields
  from `SETTINGS_SCHEMA` defaults). `SETTINGS_SCHEMA`, `SETTINGS_GROUPS`,
  `SHOWN_THINGS_*`, `REPORT_SCOPE_CHOICES`,
  `NUMBER_DISPLAY_CHOICES`, `settingsFrom`,
  `saveSettings`, the cell iconography SVGs, and `paintCellGlyph` all
  live in `settings-core.js`, shared by both pages. Caution: some schema
  `valid` closures reference game-page globals (PLAY_MODE_IDS etc.) —
  they are late-bound and only ever called by the game page's import
  validation; the settings page must not call a control-'none' field's
  valid().   The controls themselves are `settings.html` +
  `settings-page.js` (2026-08-23; the in-page drawer is gone):
  `#settings-btn` on the game page is now a plain `<a>` to settings.html.
  The page (the demo world is gone; see PRODUCT.md) has a slim
  `#settings-titlebar`, then centered `#settings-layout`: top return link,
  page title + automatic-save note, `#settings-column`, and bottom return
  link. Esc navigates back too. `buildSettingsColumn` renders one
  `.settings-group` panel per `SETTINGS_GROUPS` entry. Each switch from
  `buildSettingRow` is one wide label with its name left, checkbox at the
  far right, and the rare schema `hint` in a dedicated middle column
  (only `justUniverse`); `describe` remains the name's title tooltip.
  `buildChoiceRow` puts its radio group to the right of the setting name.
  `buildShownThings` lays its many switches out as a compact two-column
  option grid, collapsing responsively. A change just saves; the static
  note beside the page title explains the absent save button. No hover
  behavior at all — no hover-injected or
  hover-swapped text, ever (two note mechanisms were removed for this on
  2026-08-23). The game page has no region tagging and no hover
  controls: the `#region-hide-chip` mechanism (hover a result section,
  click "hide ×" to switch it off) and the `tagSettingRegion` markers
  feeding it were removed later on 2026-08-23 — hiding things is the
  settings page's job (see PRODUCT.md "Personal settings").
  `numberDisplay` (digits / letters / dots, drawn in `updateCell` via
  `paintCellGlyph`) repaints in place on settings import
  (`repaintRevealedCells`). The raw scatter block is gated by
  shownThings.relationshipCharts since 2026-08-23. Exports carry the
  block under the reserved top-level `"settings"` key; `importHistory`
  validates it with the rest of the blob and applies known fields.
  `reportScopeFromStored` maps the retired `shownThings.endVerdict` /
  `reportCategories` forms to the nearest tier; explicit modern
  `reportScope` always wins.
  `justUniverse` is frozen into `justiceEnabledForGame` at first reveal —
  a change on the settings page applies from the next game (the old
  drawer's mid-game lock UI retired with the drawer).
  `collapseDuplicateCharts` gates the progressive-disclosure dedupe in
  `renderRanks` ("lifetime" is exempt: always shown, and identical
  windows collapse into it).
- A just universe (PRODUCT.md "A just universe"): the judge and redraw
  are `justice.js` — pure logic on a view {width, height, mines,
  revealed[], adjacent[]} (flags invisible by design), exporting the
  `Justice` global / CommonJS module, loaded before `minesweeper.js` in
  `index.html`. Exact player rule: a bare click into a certified pocket
  that no outside clue can ever resolve is guaranteed safe. Qualification
  is hidden-layout-independent: `certifyEntry(view, clicked)` receives no
  witness. `certifyEntries(view, entries)` is the batched equivalent used
  by guess scoring: it builds one visible constraint structure and checks
  each frontier/sea component once, avoiding an Expert-sized structure
  rebuild for every covered cell on the click-critical path. Certification
  runs `proveFacts` (direct counts, general overlap subtraction,
  then exhaustive component search coupled by total mines and sea),
  `buildStructure` (residual clue components plus
  8-connected sea components), then recognizes one compact family:
  `cardinalityShape` (every k-of-n layout), `complementShape` (a connected
  spanning x+y=1 graph whose two equal-total bipartition layouts satisfy
  every residual clue), or one sealed sea remnant whose count is fixed by
  cardinality/complement frontier templates. Covered external cells must
  be proved mines or receive an invariant pocket contribution. Whole
  residual components are used; v1 never searches arbitrary pocket subsets.
  Unsupported asymmetric/exotic ambiguity is outside the product rule.
  This replaced two model-enumeration implementations on 2026-08-20: the
  first hung mid-game; the second's sparse benchmark falsely supported a
  universal <3ms claim, while a deterministic 40-variable sealed
  constraint family exposed 1,048,576 layouts and took ~693ms. The current
  certificate-shape judge itself enumerates no ambiguous pocket layouts.
  Its canonical proof prepass now has a deterministic two-million-node
  ceiling and returns a Map annotated with `complete`, `visits`, and
  `method`; over-limit results retain only sound facts and cannot justify a
  negative player judgement. One visible-position cache avoids repeating
  the same exact proof across click scoring, reports, and mode rules.
  `redrawEntry(certificate, clicked, currentMines, random)` consults the
  witness only after certification: an already-clear entry returns it
  unchanged; a mined cardinality/sea entry directly samples k locations
  excluding the click; a mined complement entry switches partitions.
  Game side: only `revealCell` calls `attemptJustice(index)`, before its
  mine test and never on the first reveal. `chord` never calls Justice;
  wrong flags remain fatal. Every qualifying entry increments
  `justiceEvents` regardless of whether redraw occurred and pushes a
  {type, clearWays, totalWays} detail onto `justiceDetails` (reset in
  newGame; feeds the end-game recap). Whether the entry's cell was mined
  before the redraw is deliberately not tracked past the redraw itself:
  the player's point of view is the only one that exists (creator
  directive 2026-08-23) — recap, details, stats, and record never reveal
  or refer to an "actual" mine reality, and the historical `justiceSaves`
  field stopped being written the same day it was added. When
  `finish()` runs, `showJusticeSurvivals` attaches one
  `.justice-live-word` chip to #justice-live at the board's right,
  wording the count as "you won a forced coinflip" (pluralized) —
  nothing pops up mid-game, and no chip appears when the count is zero
  (2026-08-23). `reportResult` stores `justice`,
  `justiceEnabled`, `seed`, `rngVersion`, `boardVersion`,
  and `justiceVersion`; rankings intentionally remain mixed (confirmed
  as the product 2026-08-23, no longer a deferral). `rng.js`
  exports `GameRandom`: `createSeed` obtains 128
  bits from `crypto.getRandomValues`, and `fromSeed` implements
  `xoshiro128ss-v1`, the single stream used by `placeMines` and Justice.
  Initial-board replay needs mode + first click + seed + RNG/board versions;
  Justice replay also needs the input trace and Justice version.
  just-universe-help.html is a standalone explainer document (its "?"
  popover on the settings row was removed in the 2026-08-23 caption
  purge; the schema no longer carries `helpFile`). Correctness:
  `node tests/justice-test.js`
  (deterministic fixtures including safe-entry counting semantics and the
  chord-origin rule); `node tests/rng-test.js` freezes the RNG version's
  output sequence; scale: `node tests/justice-bench.js` (100x100 boards,
  10,000-cell structural proof and direct redraw; no timing threshold).
- Guess ledger (PRODUCT.md "Guess ledger"): `odds.js` enumerates remaining
  consistent layouts on residual clue components (budget 22 vars /
  250000 visits) plus a binomial sea, then scores a bare unproven click.
  `analyzeView(view, opts)` can pass proof options through
  `Justice.buildStructure`; one-ply hypothetical next positions cap the
  canonical proof prepass at 80000 visits so up to forty branches cannot
  each consume the two-million-visit gameplay budget. Incomplete proof
  facts stay sound, and residual odds either complete or remain unmeasured.
  `noteGuess` runs from `revealCell` after the first-click path and
  before Justice, gated by `guessLedgerAppliesToMode()` (standard,
  trial modes, uniform/single-path NG — modes where hidden mines
  really kill; angelic and proof-or-die record nothing, their ledger
  fields stay absent), so the p is the player's
  information, not the post-mercy board. Proven-safe clicks and clicks
  with enumerated p(mine) = 0 return null (not a guess). Over-budget returns `{measured: false}` and
  `oddsFailed` omits the whole ledger from that record — no invented
  odds; a thrown scoring error does the same and never blocks the
  reveal. `scoreGuess` stores absolute p (`lifeLost`), excess over min p
  (`lifeNeedless`), `idealRisk`, and one-ply expected remaining life
  (`perfectPlay`). A covered proven-safe cell makes min p 0, so any
  guess is fully needless. The per-guess risk chips that once showed
  these numbers beside the board were withheld on 2026-08-23 (creator
  request: reintroduce only with a proper explanation); the ledger
  itself is unchanged. `node tests/odds-test.js` includes a seeded
  brute-force parity section: on random small boards every consistent
  layout is enumerated and `analyzeView` probabilities must match it
  exactly.
- Play modes (PRODUCT.md "Play modes"): `settings.playMode` plus history
  key `WxH/M@id`. `solver.js` grades NG boards (`analyze` /
  `generate`) and decides proof-or-die / angelic clicks. `trial.js`
  holds the 25×4 and 4×4 sessions, dihedral maps, identity grouping,
  and replay of opens/flags from stored traces for overlay charts.
  `node tests/solver-test.js` and `node tests/trial-test.js`.
- Board generators (PRODUCT.md "Board generators and top score keys"):
  `generators.js` is the pure registry (`BoardGenerators` global /
  CommonJS module, loaded after solver.js — its uniform entry delegates
  to `Solver.randomPlacement`): per generator an id, menu label,
  `version` (the record's `boardVersion` string), a parameter schema
  ({key, label, min/max/step, default, describe}), and `place(width,
  height, mineCount, safeIndex, rng, params)`; `safeIndex` is null in
  the Board lab (no first click). Seven generators (2026-08-25): pink
  noise = fractal value-noise field (persistence 2^(−alpha/2) gives
  spectral slope alpha; `stretch` = log2 x:y anisotropy) +
  Efraimidis-Spirakis weighted sampling (`weightedSampleInto`); blue
  noise = Mitchell best-candidate (`bestCandidatePlace`, O(n)-per-mine
  nearest-distance relax, pluggable score); green noise = one band-pass
  octave, weighted; stippled = red-noise density field × best-candidate
  distance score; letterforms = seed-drawn letters from the built-in
  5×7 `LETTERFORMS` font as exp-weights; patriotic = exact
  area-proportional star-field canton (best-candidate) + alternating
  stripe weights. Game
  side: `settings.boardGenerator` + `settings.boardGeneratorParams`
  (per-generator overrides, deep-copied in `settingsFrom`), the
  `#board-generator-select` menu (`buildBoardGeneratorSwitcher`,
  disabled via `generatorAppliesToMode` in single-path NG and trials),
  `gameGenerator` frozen per board in `newGame`, `topScoreKeyOf` /
  `BoardGenerators.keySuffix` for the history key, and the record's
  `generator` field (absent = default). Board lab (`playMode
  'board-lab'`, `gameState 'lab'`): `buildLabBoard` deals a solved-view
  board with no records, traces, or timer; `buildLabPanel` /
  `syncLabChrome` render the size + parameter sliders (`#board-lab-panel`;
  rebuild only on generator change so a drag never loses its slider).
  `node tests/generators-test.js` freezes placement invariants,
  key-suffix canonical form, validation, and the statistical
  signatures (pink clusters, blue spreads).
- Rankaverage sort persistence: userdata 'rankavgSort' maps stat label to
  {key, dir} (absent = natural rank order); written by the sort-header
  click cycle in `buildRankavgList` (asc → desc → none).
- Backup: `#backup` controls; `importHistory` validates the whole blob
  before writing (arrays of well-formed records only, loud error naming the
  offending mode otherwise), dedupes by `endedAt` within each mode, and
  re-sorts each mode chronologically after a merge. Export writes with
  `navigator.clipboard` only; a rejection surfaces its error message.
  `#format-panel` (toggled by `#format-btn`) is the data-format reference
  card, generated at init by `buildFormatPanel` from `GAME_RECORD_SCHEMA`
  and `DIFFICULTIES` — the same schema `importHistory` validates against —
  so the card, the validator, and the writer cannot drift apart.

Hosting: public GitHub repo `ernop/minesweeper-friendly`; GitHub Pages serves
the playable game from the master branch root at
https://ernop.github.io/minesweeper-friendly/ and redeploys on every push.

## Local tooling and verification (this machine, learned 2026-08-19)

- Serving: `python3 -m http.server 8018 --bind 127.0.0.1` and
  `http://127.0.0.1:8018/` are the canonical local server and exact play
  origin — no improvised hosts or ports (decided 2026-08-22; sessions had
  used 8000, 8099, ...). If that origin is already serving, use the running
  server. Browser storage (IndexedDB, and localStorage before 2026-08-20) is
  per-origin: `localhost:8018` is a different, incorrect score store even
  though it reaches the same machine. `http://127.0.0.1:8018/` is the
  player's real origin. Agent verification
  also runs on 8018 whenever it persists nothing (RAM-only injections
  plus an in-page render, reading, screenshots — `persistUserdata` and
  `saveTrace` untouched). Anything that writes storage — imports, played
  test games, settings changes — runs on `http://127.0.0.1:8099/`, the
  single permanent test origin (junk history expected there), never on any
  other origin.
- Headless browsing (state as of 2026-08-23): no system chromium /
  google-chrome, and `/usr/bin/firefox` is an uninstalled snap stub that
  only prints "snap install firefox" — but Playwright browser builds now
  live under `~/.cache/ms-playwright` (chromium headless shell included),
  installed during an agent verification session. A working harness sits
  in `/tmp/mines-smoke` (puppeteer-core against
  `~/.cache/ms-playwright/chromium_headless_shell-*/.../chrome-headless-shell`,
  launched with `--no-sandbox` — the AppArmor userns restriction forbids
  the sandbox). /tmp is wipeable; reinstalling is one `npm i
  puppeteer-core` plus that executablePath. The Cursor IDE browser (MCP
  server `cursor-ide-browser`) also works when registered, but it exists
  only while an IDE browser tab is open and can disappear mid-session,
  so check availability before planning around it.
- Running game code without a browser: load `minesweeper.js` in Node via
  `vm.runInThisContext`, not `eval` (the file's 'use strict' makes eval
  declarations local, so nothing would be defined). Required shims:
  `document` with `getElementById` (memoize one stub element per id),
  `createElement`/`createElementNS`, `querySelectorAll`,
  `documentElement.style.setProperty`, `addEventListener`; stub elements
  with textContent/innerHTML/hidden/value/dataset, `style.setProperty`,
  `setAttribute`, `addEventListener`, `appendChild`/`append`,
  `querySelector`/`querySelectorAll` (must return 3 elements — `setLcd`
  iterates 3 digit svgs), `classList`, `requestSubmit`,
  `getBoundingClientRect` (trace layout events); globals `localStorage`
  (still required — the version-2 upgrade reads the legacy keys),
  `navigator.clipboard.writeText` (define via Object.defineProperty —
  Node 22 has a global navigator getter),
  `URL.createObjectURL`/`revokeObjectURL`, `performance.now`,
  `window.addEventListener`, and a working `indexedDB` shim: `open`
  fires onupgradeneeded (with `event.oldVersion`,
  `event.target.transaction` supporting addEventListener('complete'))
  then onsuccess on a microtask; `createObjectStore` supports both
  keyPath ('traces') and out-of-line keys ('userdata');
  `transaction(...).objectStore(...)` supports put/get/getAll with
  request onsuccess on a microtask and transaction oncomplete firing
  after all request callbacks (a timer works, since microtasks run
  first). Startup is async — the db open (in storage.js, which the
  harness must load first along with settings-core.js) leads to
  `userdataReady` then `init()`, and `userdataReady` also waits for
  `document.readyState`, so a DOM shim must report it past 'loading'; the
  harness must await (~a timer tick) after loading the
  scripts before touching game state. Since 2026-08-20 the game's
  top-level bindings (history, cells, ...) are reachable from follow-up
  `vm.runInThisContext` snippets, which is how a harness asserts on RAM
  state. This approach ran the real `importHistory` end-to-end for the
  2026-08-19 legacy-history conversion, and the full 2026-08-20
  localStorage-to-IndexedDB migration (fresh start + carried-over data,
  a played game persisting record and trace, import write-through).
- Quick checks: `node --check minesweeper.js` for JS syntax; a small
  python3 `html.parser` walker for tag balance in `index.html` (void tags:
  meta, link, input, br, hr, img). Node v22 is installed and fine for
  one-shot data conversion scripts.
- Deploys: `gh` CLI is installed and authenticated. Every push to master
  triggers the "pages build and deployment" workflow; `gh run list` /
  `gh run watch <id> --exit-status` confirm it, and the live site can be
  spot-checked with `curl https://ernop.github.io/minesweeper-friendly/...`.

Promotion: `promo/PROMO.md` is the promotional page — player-facing pitch
only, nothing technical — with `promo/win-screen-2026-08-19.png` as its hero
image. Keep it free of implementation detail.
`promo/win-screen-2026-08-19-full-layout.png` (current layout: stats beside
the board, charts below) is the README's screenshot.

Friendly modes implemented so far: "A just universe" (2026-08-20; see
PRODUCT.md and the implementation bullet above). Everything not built —
NG and the rest of the design axis, board-shape time lists, deferred
Justice ranking split, leftover motion work — is listed in
[BACKLOG.md](BACKLOG.md).

## Reference material

- `reference/mouse-motion-metrics.md` — 2026-08-20 survey of mouse-motion
  characterization across psychometrics, biometrics, clinical assessment,
  and esports, with a tiered proposal for per-game measurements. All four
  systems are implemented in-page since 2026-08-20 (PRODUCT.md "Trace
  metrics panel"): the biometrics session set, the mousetrap psychometric
  measures, the Hevelius-style clinical features, and the survey's own
  Tier 1/2 waste measures. The offline pipelines under `analysis/` remain
  the reference implementations where they exist.
- `reference/hevelius/` — 2026-08-20 deep dive on Hevelius (Gajos et al.,
  mouse-based motor assessment, 32 trajectory features): papers,
  supplementary methods, and `FEATURES.md`, which enumerates all 32 feature
  definitions with a mapping onto our raw input traces (named assumptions,
  computability classification, normalization and longitudinal notes).
- `reference/esports-mouse-training.md` — 2026-08-20 survey of out-of-game
  aim-training tools (KovaaK's, Aimlabs, Voltaic, Aimer7), documented pro
  usage, uptake and persistence numbers, and the peer-reviewed evidence on
  efficacy; every number labeled documented / company claim / tracker
  estimate / community claim.
- `reference/minesweeper-online-ng-medium-2026-08-19.png` — minesweeper.online
  NG mode (Medium), showing the given starting position (green X) and
  difficulty tabs Easy/Medium/Hard/Evil.
- Pattern catalog: https://minesweeper.online/help/patterns
- Gameplay/3BV/NG help: https://minesweeper.online/help/gameplay
- Kaboom design writeup: https://pwmarcz.pl/blog/kaboom/
- Probabilistic solver: https://github.com/mrgriscom/minesweepr

## Rules for agents

Condensed from `~/proj/mybrowser/.cursor/rules/` (canonical source; read
`00-absolute-rules.mdc` there for the full text) and `~/proj/agents.md`.

### The Anti-Fallback Principle

This is a global principle. It governs every layer — library code, APIs, data
handling, configuration, infrastructure, tooling, UI — not just imports.
Anywhere a component can fail, it must fail loudly and visibly, never continue
in a reduced or substituted mode.

There is only the primary path. Any fallback is banned. When the primary path
cannot do its job, stop and raise a loud, visible error that names what failed
and where — never a backup path, a default value, a retry, or a degraded mode.
Repair the primary path. A system must not contain a component whose absence
it is built to tolerate; if you find yourself writing "works without X," X was
not optional — its failure is a crash, not a mode.

Why: a fallback hides the original mistake. Execution keeps going, so the
failure surfaces later and far from its cause, and debugging costs about twice
as long because you must first discover that a fallback swallowed the error.
The design target is the inverse: the system should always be one mistake away
from a huge, visible crash, so every mistake announces itself where it happens.

The test for any error-handling code: does it let execution continue toward a
wrong-but-quiet result (fallback — banned), or does it halt and show the
failure (error — required)? Re-raising a caught exception verbatim, or a
missing-config check that exits pointing at the fix, is failing visibly —
that is the rule, not an exception to it.

Banned, non-exhaustively:

- Defensive imports (`try: import x / except ImportError`). Import directly;
  if it fails, fix `requirements.txt`, never wrap in try/except.
- Config-detection chains (storage → file A → file B → baked default). Read
  the one authoritative source; if missing or invalid, error.
- Trying multiple external tools until one works.
- `tryAscertainValue` patterns checking field_a, then field_b, then field_c.
- Catch-and-default / catch-and-continue: `try { x } catch { return [] }`, or
  `value ?? DEFAULT` where a missing value is a bug.
- Retry loops papering over an intermittent failure instead of fixing its
  cause.
- UI "graceful degradation" that hides a backend error behind a generic
  offline/empty state. Render the actual status code and body.
- The fix is always to improve the single upstream source, never to add
  downstream alternatives.

### Design requirements

Recorded 2026-08-19 during the play-history design review. These govern every
design in this repo and extend the Anti-Fallback Principle above.

1. Perfect design, zero compromises. A tolerated known defect is a bug in the
   design, not a trade-off.
2. Ideal-world assumptions: there are no legacy problems, legacy users, or
   support burdens. No fallbacks (see above) and no belt-and-suspenders:
   never guard a state the system cannot reach — if a state is impossible,
   the guard is banned; if it is possible, it must be handled truthfully.
   Schema changes carry no migration shims or forward version provisioning;
   change the schema and the code together.
3. Proper names, always. A name states exactly what the thing is, with units
   and reference points where they disambiguate (`timeMs`, `endedAt`). One
   term per concept.
4. Always the most efficient way possible — computation, storage,
   implementation effort. Store each primary fact exactly once; derive
   everything else at read time.
5. No component ever lies in any message it emits — UI text, stored records,
   return values. Every value shown or stored is exactly the fact it claims:
   no sentinel values standing in for "unknown" or "impossible", no rounded
   copy that can disagree with its source, no display string doing double
   duty as an identifier.
6. Components are relatively independent. Storage does not produce UI
   strings; presentation does not define storage keys; a component's
   interface is data, not another component's formatting.
7. Correct division of concepts: nothing duplicated, nothing that is one
   thing split, nothing that is two things merged. Storing a derived value
   next to its primaries is duplication.

Refinement to 4 and 7 (2026-08-20, decided with the user): "store each
primary fact exactly once" means store every independently MEASURED
quantity directly and straightforwardly; derive at read time only what is
a pure, definition-stable function of stored facts (3BV/s from bv3 and
timeMs). Never store a measured value only as a remainder to be
reconstructed by subtracting one stored value from another — if the two
measurements' windows or thresholds differ even at the edges, the
reconstruction lies. The duplication rule 7 bans is two copies of the
same fact; two related measurements are not copies. Since raw traces
became the stored ground truth (PRODUCT.md "Raw input traces"), per-game
scalars are summaries of the trace and definitions can be recomputed
retroactively; when in doubt, add the straightforward scalar rather than
a clever reconstruction.

### Configuration

- Never use environment variables for configuration.
- `settings.json` (gitignored) holds keys/secrets; `settings.example.json`
  (checked in) is the template. Code reads the config file, not `os.environ`.
- Never commit credentials; placeholders like `YOUR_API_KEY_HERE` in docs.

### Communication

- No emojis anywhere — files, responses, commits.
- No relationship-management speech: no praise, validation, verdicts on the
  user's statements ("You're right"), reassurance, or servile offers. Present
  analysis; agreement is its conclusion, not its opening.
- Preserve the epistemic status of the user's words — a claim stays a claim,
  neither upgraded ("brilliant insight") nor downgraded ("instinct", "hunch").
- Banned words/phrasings: "honest(ly)" framing, "heads-up", "wrinkle",
  "lands/land" for "is done", "say the word", "walk you through", empty
  intensifiers ("genuinely", "really", "actually" as filler), smell words
  ("cruft", "hacky", "code smell", "bloat", "footgun", "overengineered",
  "elegant", "clean code" as praise). State concrete pros and cons instead.
- Put meaning in statements, not in a word's connotation. If something is
  risky or costly, say so and why.
- Report status straight: what is done, what is not; name issues as issues.
- Be terse; present alternatives as labeled options, not padded prose. Do the
  task, report, stop — but do obvious follow-up housekeeping without asking.
- When uncertain whether a recommendation suffices, investigate and resolve
  the uncertainty before answering; return an answer, not a basic/ironclad
  menu.

### Code style

- Comments explain why, not what. No comments that restate the function name.
- Type hints in Python; `pathlib.Path` for paths; constants for magic values.
- One term per concept; unify immediately when dual terminology appears.
- Filenames we create: `[A-Za-z0-9._-]` only — no spaces or metacharacters.

### Structural fixes only

"The agent will remember/try harder next time" is not a fix — future sessions
start from the same weights and files. Valid fixes change the code path, the
checked-in rule files, or an injected hook so the correct behavior is the
default. Durable facts go in checked-in files linked from an agents.md, never
in an agent's private memory.

### Cost-efficiency

Prevent problem classes at the earliest, cheapest point (linter rule,
pre-commit hook, script) rather than repeatedly hand-fixing instances. If
grep or a script can do it, don't spend model time on it.

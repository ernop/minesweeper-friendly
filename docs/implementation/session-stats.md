# Session stats — implementation notes

Spec: [docs/product/session-stats.md](../product/session-stats.md). Index: [AGENTS.md](../../AGENTS.md).

- Session stats ([Session stats](../product/session-stats.md)): a player-controlled observation
  tool. `SessionScope` in game-data.js owns the single page-wide wall-clock
  window (`sessionDefinition`, default `SessionScope.defaultId` = today),
  shared with game data and ranks won. No independent window or Clear-session
  override remains.
  `settings.sessionAggregation` chooses trailing averages or disjoint groups.
  `settings.sessionRateBasis` chooses time-normalized values using
  `sessionLookbackSeconds`, or per-finished-game values using
  `sessionLookbackGames`; `sessionGameSeries` then produces rolling or
  disjoint N-game groups while retaining the played-time x axis.
  `settings.sessionModeScope` defaults to the exact current
  board/play-mode/generator key rather than all modes. Every live and
  backfilled event carries `modeKey`; retention covers every mode inside
  `SessionScope.earliest(now)`. The shared wall boundary clips live/play spans
  and prorates backfilled counters over the original game duration. The UI exposes all choices directly,
  has one session heading, no HOW/RECORDS chart hover essays, and uses
  evaluation-semantic ending colors (green/gold/orange/red/grey).
  `likelyMisclick` travels on live/backfilled end summaries and game markers;
  `likelyMisclickFraction` is a magenta dotted, overlapping subset of all
  finished games, computed for cumulative played-time, raw, and N-game
  groupings without changing the exclusive technical ending denominator.
  Three marker-delimited
  spans in game/session-stats.js (COMPUTATION, RECORDING) and
  game/session-charts.js (DISPLAY). COMPUTATION (pure, Node-extractable):
  `sessionBucketSeries(events, {nowMs, bucketMs, windowMs, openPlayFrom,
  playOffsetMs})` compacts a wall-clock event list into cumulative played
  time, removing every between-play gap, then buckets it
  ({kind:'play',from,to} finished play
  spans, {kind:'move',at,px} ~1s-coalesced cursor travel while playing,
  {kind:'press',at,useful,flag,unflag,misclick,moving,gapMs},
  {kind:'death',at,mistake}, and
  {kind:'evaluation',at,category,excessRisk,modeledLifeGap}) into nine core series (speed, click rate,
  mistake-tagged deaths/min, misclicks/min, no-ops/min, flags/s,
  flag-removals/min, unused-marks/min, fastclick gap), five exclusive report-category rates,
  and the excess-risk / modeled-life magnitudes, plus raw per-bucket `sums`
  and `playSpans` (the play↔wall mapping, carried through all three series
  shapes). `sessionWallSections(playSpans, playFrom, playTo)` (pure, same
  span) cuts the visible window into wall-clock sections, splitting at
  local midnight and at resumes after ≥SESSION_SECTION_BREAK_MS (15m);
  DISPLAY renders it as the "when this play happened" strip
  (`appendSessionWhenRow`: per-day fills, in-block labels with fallbacks,
  full summary row) and dashed `appendSessionDayBoundaries` day-change
  marks on every session chart.
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
  `sessionGameSeries(events, {lookbackGames, aggregation, ...})` takes the
  completed game summaries attached to exact game-end markers: running mode
  samples the last N games at each ending, raw mode forms disjoint N-game
  groups, optional fields average measured games only, and open games produce
  no premature sample.
  Constants FASTCLICK_MAX_GAP_MS (1s), SESSION_MIN_PLAY_MS (1s — rates
  over a sliver of covered play are undefined, not absurd),
  and SESSION_STEP_MS (10s samples). RECORDING (RAM only):
  `sessionPrune` retains the largest shared wall-clock window;
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
  `SESSION_METRIC_SPECS` (solo rows: cadence spread and the
  excess-risk / modeled-life magnitude charts;
  label carries the unit and sits flush on the plot — no axis captions,
  the "-15m … now" x ticks speak for themselves) +
  `SESSION_SPEED_GAP_SPECS` (mouse speed + fastclick gap sharing one
  two-line chart since 2026-08-30, rendered through the rates-chart
  machinery with `rawSpecs` so the per-game basis never remaps them;
  endpoint labels carry their own units over a bare shared axis) +
  `SESSION_RATE_SPECS` (the six action rates, each with unit '/m' or
  '/s' — chosen for meaty values; no-op clicks charts /s since
  2026-08-23 by dividing the stored per-minute series by 60 in its
  spec — color, and bare-number fmt) plus
  `SESSION_CATEGORY_RATE_SPECS` (one `/m` line per exclusive report
  category; session diagnostics intentionally ignore the after-game
  `reportScope`; an optional `textColor` overrides `color` for text, so
  gray series such as measurement notes and unjudged endings never draw
  gray text, and `SESSION_END_SPECS` entries whose color is under 4.5:1 on
  white carry `textChip`, which puts their marker tooltip text on a black
  chip), rendered
  by `buildSessionChart` / `buildSessionRatesChart(buckets, specs, unit)`
  + `appendSessionRatesRow(container, buckets, unit)` (two unit-grouped
  plots right after endings — "action rates/m" then "action rates/s",
  split 2026-08-23 evening so neither unit's magnitudes squash the
  other's: solo and combined-rate y axes auto-range through
  `sessionYDomain` around their measured values with modest padding
  instead of being forced to start at zero (a measured zero stays in
  range; the endings chart auto-ranges 0→just above its highest line,
  capped at 100, since 2026-08-30 — no longer a fixed 0–100% domain);
  1/2/5 unit-suffixed ticks come from `niceTicks`; no legend —
  `sessionRateLabelLayout` greedily distributes each full current
  name+value+unit label across low-occlusion plot positions and a fine
  color-matched leader ties it to the still-visible endpoint dot; labels avoid
  one another and minimize covered data, with no HOW/RECORDS hover essays).
  `appendSessionGameMarkers` draws every exact `gameEnds` instant, using the
  matching `SESSION_END_SPECS` color (green only for wins) and a compact
  tooltip with duration, local time of day, and `sessionGamePlacement`'s
  current lifetime rank within `history[marker.modeKey]`; #1 is `PB`, and
  rank/total <= 10% with at least ten saved wins is `top 10%` (never WR/global,
  because no worldwide leaderboard is available),
  `latestDefined` (measurability),
  `appendSessionSection` (renders below the persistent session heading and
  hosts the grouping <select> writing `settings.sessionLookbackSeconds` in
  played-time mode or `settings.sessionLookbackGames` in per-game mode.
  Grouping choices live beside SETTINGS_SCHEMA; `SessionScope.choices` is the
  shared window catalog). The heading itself (`.session-scope-head`, built once
  in `renderMetricsPanelContent`) carries the page's one window picker from
  `buildSessionScopeSelect`, whose change calls `setSessionDefinition`. It is
  never hidden, so `#metrics-panel` stays visible in every state after its
  first render; `sessionDefinition` stays in the session controls key so a
  new window rebuilds the charts at once rather than waiting out the
  hover deferral. Session mutations mark
  `sessionChartsDirty`; `appendSessionCharts` replaces only the chart region,
  preserving `#metrics-panel-content`'s scrollTop. Controls stay mounted
  during data updates. Hover/focus holds chart replacement until leave/out
  events, while trace sampling continues. There is no idle refresh loop.

# Session stats (decided 2026-08-22; player-controlled session revised 2026-08-28)

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/session-stats.md](../implementation/session-stats.md).

The recent-observations section uses the same page-wide session definition as
records won and game data: `sessionDefinition`, default last hour of wall-clock
time. The page chooser and selectors in all three surfaces edit that one
preference. Choices are last 10/30 minutes, last 1/2/4/24 hours, today, today
since 6am, and last 7 calendar days. Live stats end at now; historical game
comparisons end at the selected game's completion. The former independent
played-time window and Clear-session override are removed.

Wall-clock membership and aggregation units are separate. Breaks compress out
of the plotted x axis, rates still divide by actual play, and grouping controls
still choose played-time lookbacks or completed-game counts within the shared
window. Per-time spans/events clip at its boundary; whole-game counts are
prorated over original durations. Per-game summaries count finished games
inside the same boundary. No old lookback observations leak across it.

- **Grouping:** `running average` (default) retains a trailing average;
  `raw buckets` shows independent values for each disjoint group. With the
  per-played-time basis, 30s / 1m / 2m / 5m / 15m is the running lookback
  or raw bucket width in accumulated game-play time. With the per-game
  basis, the control instead reads 1 / 3 / 5 / 10 / 20 / 50 completed
  games and that count is the running lookback or raw group size. An
  unfinished game never enters a per-game sample.
- **Rate basis:** `per played time` (default) keeps the readable `/m` and `/s`
  action/report charts. `per game` puts those values on one `/game` chart,
  dividing each N-game group by its measured finished games. Mouse speed and
  fastclick gap keep their intrinsic px/s and ms units but use the same
  completed-game lookback; game-ending percentages describe that N-game
  group. The x axis compresses played time within the shared wall-clock window in both modes.
- **Mode scope:** `this mode` is the default and means the exact current board
  dimensions/mine count + play mode + generator/parameters—the same key used
  for score history. `all modes` deliberately combines every retained mode.
  All modes retain the largest selectable wall-clock window; the category filter does not change its boundaries.
- **Real-world provenance ("when this play happened", 2026-08-30):** the
  compressed play axis hides when the play actually occurred, so a strip
  above the charts — same width, margins, and x mapping, so its sections
  line up column-for-column with every chart below — cuts the visible
  window into wall-clock sections. A new section starts wherever play
  resumed after a real break of ≥15 minutes, and always at local midnight,
  so a 60m window that is 30m today + 30m yesterday reads as exactly that.
  Blocks from the same calendar day share one fill color (palette cycles
  per distinct day); each block is labeled inside with as much of
  "day start–end" as fits (falling back to the time range, then the start
  time, then nothing). A summary row underneath always carries every
  section in full: day ("today" / "yesterday" / "Fri, Aug 28"), wall-clock
  range, played amount, and either the break before it ("after 14h away")
  or "continues past midnight" when the split is only the date change.
  Sub-second slivers created by the window edge clipping an old span are
  not listed. Every session chart additionally draws a dashed vertical
  mark where the play crosses into another calendar day, aligned with the
  strip's color changes. The play↔wall mapping (`playSpans`) is carried by
  all three series shapes (running, raw, per-game) from
  `sessionBucketSeries`; `sessionWallSections` is the pure section cutter.
- **Presentation:** the panel shows the word `session` once. Chart rows and
  lines do not carry HOW/RECORDS hover essays; direct labels and values are
  the interface. Multi-series rate labels keep their endpoint dots but are
  distributed across open plot regions, with fine color-matched leaders back
  to the current point; placement avoids other labels and minimizes covered
  data instead of stacking every value over the chart's right edge. Thin
  vertical markers identify every finished game—not only wins—and reuse the
  game-ending palette so each result communicates its evaluated severity:
  green is a win,
  gold is an unavoidable/minimum-risk death, orange is an inferior or
  rule-breaking forced choice, red is an avoidable/proven-wrong action, and
  grey is unjudged (its marker tooltip text is black). The three lightest
  ending colors (early-game guess yellow `#c9a227`, minimum-risk gold
  `#b8860b`, higher-risk orange `#d95f02`) measure under 4.5:1 on white, so
  their tooltip text sits on a black chip, following the creator's seconds
  age-unit choice (2026-09-23). Marker hover is
  intentionally compact: finish duration,
  current lifetime rank among the player's saved wins for that exact mode,
  time of day (no full date), and a `likely misclick` badge when that
  independent inference applies. A #1 finish earns `PB`; a finish in the best
  10% of at least ten saved wins earns `top 10%`. No worldwide rank or WR
  claim appears because the app has no global leaderboard data. The
  unmarked-mines-on-win measurement remains teal. The magenta dotted `likely
  misclick deaths` line is the inferred subset divided by all finished games
  in the same running, raw, or N-game group. It may overlap any technical
  loss line, so those exact ending percentages remain intact.

- Scope: only time a game was actually in progress (first reveal — or
  first flag once mines exist — to game end). Losses count. Abandoned
  boards count too (the restart threw away the record, not the time the
  player spent); their play interval closes when the restart happens.
  Travel to the restart button and between-game idling are nobody's
  statistic.
- The series, in the panel's recent-observations section (since
  2026-08-23 the six action rates share two unit-grouped charts —
  see "The action-rates charts" below; since 2026-08-30 mouse speed and
  the fastclick gap also share one two-line chart, their magnitudes both
  living in the same few-hundreds range, with each endpoint label naming
  its own series and unit — "mouse speed 916px/s", "fastclick gap 240ms" —
  over a bare shared axis; game endings keeps its own chart):
  - **mouse speed** — px of cursor travel while playing over in-progress
    seconds, px/s.
  - **click rate** — board clicks that changed something (reveals,
    flags, chords) per in-progress second; no-op clicks excluded (they
    have their own row). It does not partition decision and movement time.
  - **deaths with mistakes** — fatal actions carrying at least one
    evidence-backed mistake tag per in-progress minute; untagged deaths
    do not count.
  - **misclicks** — the visible-state contradiction definition above per
    in-progress minute, whether or not the action ended the game.
  - **no-op clicks** — clicks that changed no board state per
    in-progress second (stored under the legacy field name
    `wastedClicks`; charted /m until 2026-08-23, see the action-rates
    charts below).
  - **fastclick gap** — median gap between consecutive board-changing presses of
    the same game, counting only presses made on the move (a cursor
    sample within 100ms before, the cadence definition) with gaps under
    1s. It records only that filtered timing distribution.
  - **cadence spread** (added 2026-08-30) — interquartile range of
    useful-press gaps within the lookback divided by their median, the
    same dispersion measure as the per-game `cadenceSpread` field; 0 is
    metronomic, larger is burstier, losses and wins both contribute.
    Live play contributes raw gaps; games backfilled from history cannot
    (records hold no press timestamps), so per-time backfilled spans
    leave the series unmeasured while the per-game basis medians each
    game's stored spread instead. Needs at least two gaps.
  - **mine marking** — flags placed per in-progress second (removals
    don't subtract; win auto-flagging never counts).
  - **flag removals** (added 2026-08-22, same evening) — flags taken
    back per in-progress minute. Counts the removal, not the placement;
    flags left standing are invisible here, and the reason for removal
    is not observed.
    Backfills from the stored per-game `flagsRemoved` count, and the
    stats table shows the per-game form as "Flag-removal rate" beside the
    existing "Flags removed" count.
  - **game endings** (added 2026-08-23; labels and axis reworked
    2026-08-30) — not a rate: one chart of cumulative percent lines, one
    per ending kind, each the kind's share of the games finished so far
    in the window, with a color legend of current shares. Chart labels
    are compact forms prefixed **"died: "** for every death ending
    ("died: likely misclick", "died: clicked forced mine despite
    available safe move", "died: unjudged", legacy verdicts as "died: …
    (legacy)"), so the losses read as one family; the after-game report
    keeps its sentence wording (`FATAL_STATUS_LABELS`), and the two can
    never disagree because both derive from `fatalActionStatusKind`. The
    y axis auto-ranges to just above the highest plotted line (capped at
    100, floored at 10) instead of always spanning 0–100. The dotted
    "percent of mines unmarked when winning" line (the wins' average
    share of mines left unflagged at the winning instant) draws in a
    deliberately un-endings blue (#1565c0), and "percent of placed marks
    unused when winning" in purple (#7b1fa2), so neither is misread as
    an ending share. See [Game-end evaluation](game-end-evaluation.md).
  - **report categories** (added 2026-08-23; scope independence decided
    2026-08-29) — one per-minute line for every exclusive action-report
    category: game loss, game risk, time loss, life maximization, and
    measurement notes. Session diagnostics always show all category lines
    and their magnitude charts; `reportScope` controls only the after-game
    report and never hides session series. This keeps the observation
    history complete by mistake type without forcing a more verbose
    post-game report.
  - **excess game risk** — sum of the extra immediate loss probability
    on survived game-risk actions per played minute, in percentage
    points/minute. Active protection rules are applied first; this is a
    probability sum, not a count of observed deaths.
  - **modeled life gap** — sum of one-ply
    best-minus-selected expected-remaining-life gaps per played minute.
    It appears only when the optional life-maximization category is on.
- Running averages and raw buckets: `sessionLookbackSeconds` (30s / 1m / 2m /
  5m / 15m, default 5m) chooses played time per group, not session membership.
  `sessionAggregation` chooses trailing averages or disjoint buckets. Per-game
  mode uses `sessionLookbackGames` (1 / 3 / 5 / 10 / 20 / 50, default 5).
  All three aggregate only observations in the shared session window. Spans
  join onto a cumulative-play timeline within it; samples remain at 10-second
  steps of actual play. A wall-clock break can age observations out of the
  shared window even though it adds no played time.
- Honesty rules: a point whose lookback covers under one second of
  in-progress play shows an en dash — one death over a 50ms sliver is
  an absurdity, not a reading. Unmeasurable points are gaps in the
  line, never bridged; a played-but-motionless stretch's speed is a
  real 0.
- The newest measurable sample's value — the running average ending at
  the current play position — is labeled directly beside its plotted
  point, rather than detached from the data in the title row.
- Storage: live events stay in RAM. On startup all modes' saved records inside
  the largest selectable shared wall-clock window are backfilled. Retention
  uses wall age, not accumulated play, and no hidden Clear-session boundary.
  The backfill inclusion rule
  (stated explicitly 2026-08-22, late evening, and verified with a live
  loss + reload): wins and losses backfill alike, each with its full
  played time — a loss's record carries its duration, counts, and death
  exactly as a win's carries its counts. Losing an abandoned board's
  time is acceptable; missing a loss is not. Abandoned boards produce
  no record and so cannot be backfilled: their played time is kept live
  but honestly lost across a reload — the one accepted gap. Every mode
  backfills into RAM, but `sessionModeScope` defaults display to the exact
  current history key; the player can choose all modes.
  Backfill is span-level approximate where live capture is exact: a
  record holds totals, not timestamps, so each game's totals (including
  report-category counts and their risk/life magnitudes) spread
  evenly over its span, its mistake-tagged fatal action lands at the
  played instant it ended, and its stored per-game fastclick median
  stands in for that span's gaps. The traces hold exact timing if a finer
  backfill is ever wanted. Newer per-game persistence includes the
  `fastclickGapMs` (2026-08-22), plus `misclicks` and the canonical
  `actionEvaluations` ledger (2026-08-23, feeding both mistake-tagged
  deaths and derived game-ending lines);
  every series also has a per-game form in the stats table — click,
  no-op, misclick, mark, and flag-removal rates derived from stored counts,
  mouse speed as before, the fastclick gap from its stored field.
- Display: the section renders at the top of the left metrics panel,
  always (not just during games), under one "session" header with compact
  controls and no HOW/RECORDS hover essays. The
  `showSessionStats` setting (default on) turns it off; the panel's ×
  chip tucks it away with the rest.
- Charts: real charts, not sparklines (decided 2026-08-22, same
  evening) — the scatter plots' visual grammar at panel width (the
  panel widened to fit): plot frame, light gridlines, 1/2/5-step y
  ticks with minor tickmarks, relative played-time x ticks (`-1h` through
  `now`). The y axis
  always starts at 0 (every series is nonnegative; an auto-zoomed
  floor turned small wiggles into drama). Titles are black, larger,
  close to and left-aligned with the plot area; session-axis text is
  12px bold for legibility. Each newest point carries its formatted
  value directly.
- No axis captions (both dropped 2026-08-23): the "→ accumulated play
  time" x caption went in the morning — the "-15m … now" tick labels
  already say "played time ago" — and the rotated y-axis unit caption
  went that afternoon. The unit moved into the row title, which now
  reads name + unit ("mouse speed px/s", "fastclick gap ms", "game
  endings %") and sits flush on the plot's top edge (the title-to-chart
  gap reduced until nothing separates them); the sideways read and the
  caption's horizontal cost are gone.
- The action-rates charts (combined 2026-08-23 afternoon; split by
  unit that evening): the six per-play-time rates draw as two shared
  charts right after game endings, replacing their six solo charts.
  "action rates/m" holds every per-minute series — flag removals,
  misclicks, deaths with mistakes — and "action rates/s" the per-second
  trio, mine marking, click rate, and no-op clicks, so the lines on a
  chart are directly comparable and neither unit's magnitudes squash
  the other's (the single dual-axis chart tried first put a ~20/m no-op
  line and a ~1/s marking line on one numeric scale, flattening the
  small movers). Each chart's scale is rooted at 0; the ceiling sits
  on the 1-2-5-10 ladder (1, 2, 5, 10, 20, 50…) rather than ceil(max),
  a stability request (2026-08-23: "I hate when we're pushing up into
  new territory and shrinking, or the false appearance nothing is
  changing"). The scale grows the moment a line needs more room —
  data never clips — and then holds through the whole climb inside
  that step; it shrinks only when the tallest shown value fits within
  80% of a lower step, so a peak leaving the window or a value
  hovering at a boundary cannot flap the scale. The ceiling is
  remembered per chart in RAM only; a reload re-derives it from the
  backfilled window. The accepted trade-off: up to ~2.5× headroom
  above the tallest line, and the same data can draw at different
  scales depending on what the chart showed before — the labeled
  ticks always state the scale in force. Integer ticks stepped
  1/2/5/10… stay readable, each labeled with the chart's unit
  ("0/m, 1/m, 2/m…"). Each series keeps
  the unit that gives it a meaty, clearly visible value (the choice
  delegated in the original request): click rate, mine marking, and
  no-op clicks read as /s; misclicks, deaths with mistakes, and flag
  removals as /m. No-op clicks changed unit twice: sketched /s,
  implemented /m because ~3/m beat ~0.05/s pinned to the floor, then
  moved back to /s later on 2026-08-23 (user call, "to improve
  distribution") once real sessions showed its ~19/m line towering
  over the other /m rates and squashing them against the floor, while
  at ~0.3/s it sits comfortably beside click rate on the /s scale.
  Each line has its own color and ends in
  a dot, and labels itself directly (2026-08-23, evening): its name,
  current value, and unit float together to the endpoint's left in the
  line's color, nudged apart when endpoints crowd while preserving the
  lines' top-to-bottom order, so reading never needs legend matching —
  the rates charts have no legend at all. Mid-line name placement was tried
  first and rejected: several near-zero rates share a tight band, so a
  name-sized box rarely had a clear spot and the design would have
  degenerated into a legend fallback most of the time. Mouse speed
  (px/s) and fastclick gap (ms) kept solo charts until 2026-08-30, when
  they merged into one "mouse speed & fastclick gap" chart: their
  magnitudes overlap (hundreds of px/s, hundreds of ms), each endpoint
  label already names its series and unit, and the shared axis stays
  bare. The pair measures identically on either rate basis, so it skips
  the per-game remap.
- Per-game rate precision (2026-08-30): on the per-game basis every rate
  label shows one decimal — whole-game magnitudes don't need two.
- Series spotlight on hover (2026-08-30, for every multi-line chart):
  hovering a legend entry (game endings) or an endpoint value label (the
  rates charts, the combined speed/gap chart) fades every other series
  to near-invisible and thickens the hovered line, via
  `bindSeriesHighlight`.
- Chart help buttons (2026-08-30): every session chart's name, and every
  titled property/relationship chart header, carries a small circled (?)
  after the name. Hover, focus, or click shows a plain-language
  explanation of the metric — built from each spec's `calc`/`records`
  text for the standard series, and hand-written rich explainers for
  **excess game risk** and **modeled life gap**, each with a miniature
  realistic board fragment (classic covered bevels, the digit palette,
  the real mine glyph, probability notes on the cells) walking through a
  concrete example (17%/33%/50% frontier → opening the 50% cell is +33pp
  excess risk; survival scores 1.00 vs 0.75 → a 0.25 life gap). One
  shared body-level tip element serves all buttons, fixed-positioned
  beside the active button and clamped to the viewport, because an
  inline tip would be clipped by the scrollable panel; pure black text
  on white per the contrast rule.
- Resizable (added 2026-08-22, live behavior revised 2026-08-23): the
  in-page panel's right edge is a drag grip. Dragging resizes the panel
  and recomputes chart geometry on every animation frame, so the contents
  track the pointer rather than catching up on release.
  The width persists as the `metricsPanelWidth` setting (default 316px,
  clamped 220–640); collapsing to the corner chip ignores it.
- Session charts update when session data, grouping, scope, or dimensions
  change. Their controls and scroll container stay mounted; live metric rows
  and sparkline SVG nodes update in place. Chart replacement is confined to
  the session chart region and preserves its reader's scroll position.
  Hovered/focused charts defer replacement until pointer leave/focus out,
  without pausing measurement capture. Hidden documents defer drawing until
  they become visible. No independent timer rebuilds the panel or page.

# Trace metrics panel (decided 2026-08-20; vertical with sparklines later the same day, replacing the first bottom-strip form; live/final split into panel/bottom-charts with settings later still)

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/trace-metrics-panel.md](../implementation/trace-metrics-panel.md).

- The session-level mouse-dynamics features are computed in-page from the
  trace and shown both live and canonically, in two places:
  - LIVE (the panel): while a trace runs (board shown through game end),
    a vertical panel at the left samples changes to the input trace,
    coalescing bursts into at most four computations per second, and updates
    existing value and sparkline nodes. It is marked "live" in bold black
    (grey until the 2026-09-23 no-gray-text sweep). The
    active game's clock advances elapsed-time measurements using cached
    input computations; ready boards and finished games have no idle stats
    timer. Live numbers are transient
    readings of an unfinished trace. The live rows go away when the game
    finishes; the panel itself stays, because since 2026-08-22 it also
    hosts the session stats section (see [Session stats](session-stats.md)), which spans
    games.
  - FINAL (the after-game charts): the moment a game finishes, the same
    computation runs once over the complete trace, and each metric
    renders as a larger chart inline at the page bottom, after whatever
    other bottom charts the outcome produced (rank lists and scatters for
    a win, nothing else for a loss — motion existed either way). These
    are the canonical values: same code as live, complete data, and the
    same wall-time definition the stored trace carries
    (endedAt - startedAt) — live and final can never disagree in
    definition, only in how much of the game they saw.
- Two settings govern the two stages (see [Personal settings](settings.md); both default
  on): "show motion stats during game" (the live panel) and "show motion
  stats after game ends" (the bottom charts). Toggling either applies
  immediately — the panel updates mid-game, the bottom charts appear or
  vanish on the shown result. Finer stage-by-stage configurability of
  what is shown when is planned, not built.
- The panel also carries its own small × toggler in its top-right:
  clicking it tucks the panel down to a "stats ▸" chip in the same
  corner (renamed from "motion ▸" when the session section moved in,
  2026-08-22), and the chip click brings it back. The collapsed state is
  the saved `metricsPanelCollapsed` preference. Since 2026-09-23 the
  session heading, which holds the page's one session picker, stays under
  the chip, and the panel no longer disappears when both stats stages are
  off ([One session definition](game-data.md#one-session-definition)).
- One row per metric: the name, the current value, and a sparkline chart
  of the value's evolution over this game (one point per live sample
  plus the final one). The sparkline carries labeled axes: y is the
  series min and max (a flat series draws mid-chart but labels its true
  value — the padding is chart geometry, not data), x runs 0 to the
  elapsed seconds. Spans where the value was not yet measurable are gaps
  in the line, never bridged. The after-game charts are the same rows at
  chart size (230x130 vs the panel's 150x46).
- Eight measurement systems, each a labeled section of the panel and of
  the after-game charts (decided 2026-08-20, when the three researched
  systems beyond the first were reimplemented in-page; click timing
  added 2026-08-22; queued clicks, pace recovery, and aimed movement
  added 2026-08-30). Every row
  carries a two-part explanation as its hover tooltip — "HOW", exactly
  how the value is calculated, and "RECORDS", a literal description of
  the observation without assigning a cause; each section header explains
  its system the same way. The sections:
  - DYNAMICS — the behavioral-biometrics session set over movement bouts
    (a pause of 100ms or more separates bouts): strokes, moving, silence
    (share of the game with the cursor still), path, speed (mean of
    per-stroke mean speeds), peak speed, straightness (chord/path),
    jerk (mean |da/dt|, px/ms³), turn rate (rad/ms), left clicks, right
    clicks, hold (mean button-down time), pause-and-click (mean stillness
    before a press). Definitions are exactly those of the offline
    extractor (`analysis/biometrics/extract_features.py`).
  - WASTE — the survey's own whole-game proposals
    (reference/mouse-motion-metrics.md Tier 1/2): wander (total travel
    over the straight lines between consecutive clicks; 1.0 = perfectly
    direct), pauses / paused / longest pause (stops of 250ms or more),
    turnarounds (heading reversals over 90° between movement legs of 8px
    or more), feints (dwelled 300ms or more over a cell, then left it
    without clicking). These are event definitions, not claims about
    intention.
  - CLICK TIMING — press-to-press cadence over all button presses, left
    and right together (added 2026-08-22): click gap (median gap between
    consecutive presses), gap spread (interquartile range over median —
    near 0 = metronomic, systematic clicking; high = rapid-fire runs
    mixed with long stalls), fastest gap, peak rate (most presses in any
    rolling 1-second window), burst share (share of gaps under 250ms),
    on the move (share of presses with a cursor sample in the 100ms
    before the press — clicking without stopping). The press is the
    unit: a wasted click is the same motor act as an effective one, and
    the trace records the hand, not the board effect (the measurement
    principle again).
  - TRAJECTORY GEOMETRY — mousetrap-formula measures (Kieslich et al.)
    per inter-click segment, means over segments: segments, MAD,
    AUC, AD, x-flips, y-flips, initiation, idle, vel max, acc max,
    sample entropy, segment time. An exact port of the R package as
    `analysis/mousetrap/trace_measures.R` applies it, verified
    value-for-value against Rscript (see [docs/implementation/trace-metrics-panel.md](../implementation/trace-metrics-panel.md)).
  - MOVEMENT GEOMETRY — Hevelius-formula movement features (Gajos et al. 2020;
    reference/hevelius/FEATURES.md) per inter-click movement, means over
    movements: execution, exec no pauses, peak speed, peak accel,
    submovements, main sub, sub end dist, axis dev, movement error, axis
    crossings, norm jerk (without pauses), click slip, verification,
    re-entries. More features are computed than displayed (offsets,
    variability, direction changes, normalized jerk with pauses, the
    submovement fractions); per-stage display configurability is
    planned. The block-variability features (CoV across
    equal-difficulty movements) are offline-only: they need difficulty
    residualization first.
  - QUEUED CLICKS (2026-08-30) — the observable hover-then-later-click
    queue: clicks whose cell the cursor had already dwelt over earlier (a
    clickless stay of 300ms or more, the feint rule) and came back to
    click at least 500ms after leaving. Rows: queued clicks, queued share
    (over all cell-targeted actions), queue wait (median leave-to-click
    interval), longest wait. Whether the cell was already provable at
    dwell time is not measured; the reason for the delay is not observed.
  - PACE RECOVERY (2026-08-30, the post-event pace-delta quantification)
    — how the action pace responds to this game's own recorded surviving
    mistakes (no-op clicks, misclicks, judged guesses — whatever the
    evaluator tagged; deaths have no post-pace and are excluded),
    measured against the game's median accepted-action gap. Rows:
    mistakes measured, post-mistake gap (next gap over median gap,
    median over mistakes; 1.0 = no measurable slowdown), recovery
    actions (consecutive following gaps above 1.5× the median before one
    returns within it, median over mistakes; 0 = the very next action
    was already back at pace).
  - AIMED MOVEMENT (Fitts, 2026-08-30) — Fitts' law over the game's
    aimed movements: per press at least 8px from the previous press with
    a cursor sample between them, index of difficulty
    log2(distance/cell size + 1) against movement time. Rows: movements,
    throughput (mean ID/MT, bits per second — it describes this game's
    movements, not the player's capacity). The after-game charts add a
    Fitts curve: an ID-versus-movement-time scatter of this game's
    movements with a Theil–Sen fit, the classic aimed-movement plot.
  - SPATIAL BIAS (2026-08-30, after-game only — it needs the whole
    game): does the hand serve some board regions slower than others?
    Confronts the false "conservation principle" — the board's rules are
    everywhere-identical, but a mouse is not a spatially uniform device.
    Each accepted board action is timed against the previous one and
    regressed (Theil–Sen) on the pixel distance between them, which
    normalizes away the travel itself and, with it, any relationship to
    where the previous click or starting square was; each action's
    residual (measured minus distance-predicted gap) lands in a 3×3
    board-region grid rendered as a signed heatmap (red = slower than
    distance predicts, green = faster, shaded by magnitude, with
    per-region action counts; an unvisited region shows a dash). Needs
    at least 8 timed pairs and at least 2 measured regions; the Fitts
    curve likewise needs at least 8 movements.
- An inter-click segment (the trajectory- and movement-geometry unit) runs from
  the previous click to the next, the click being the segment's response
  — the exact trial construction of the offline R pipeline; segments
  with fewer than 5 trajectory points are unmeasurable and skipped.
  Segment values change only when a click lands, so the live schedule
  recomputes those two systems when new clicks enter a sample and the
  whole-trace systems when input changes. Elapsed-only updates reuse the
  input measurements and derive the silence share from the new duration.
- A value whose formula needs more data than the trace has yet (no
  strokes, no completed click, no measurable segment, zero wall time)
  shows as an en dash with a "not yet measurable" tooltip — never a
  made-up zero. A formula that computes but degenerates (sample entropy
  with no matching windows yields NaN, as in R) displays the same way:
  not measurable here.
- The panel is display only: nothing new is stored. The trace remains the
  ground truth, per-game scalar records are unchanged, and the panel's
  values are recomputable from the stored trace forever.
- The panel is an in-page left column: it consumes layout width and never
  covers the board or page content. It is sticky within its column and
  scrolls itself when the viewport is shorter than its rows.

Session chart startup geometry (2026-09-07): the played-time provenance
strip reserves its space even before any play exists. Ending legends keep
a bounded scroll area, and rate charts retain the empty-note line's space
when data arrives. The sidebar reserves its scrollbar gutter. The first
play span, measured action, and completed game must not move other charts.

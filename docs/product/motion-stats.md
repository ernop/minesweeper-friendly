# Motion stats (trace metrics decided 2026-08-20; one open/close section at the page foot since 2026-10-20)

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/motion-stats.md](../implementation/motion-stats.md).

- Where (creator decision 2026-10-20). The measurements first showed live
  in a left panel during play (2026-08-20) and as charts at the page bottom
  after the game. When the whole left panel was removed
  ([Session stats](session-stats.md) records the decision), the creator
  said (verbatim): "for now, let's move the live-motion ones down to the
  bottom area and let the user open/close it as wanted." They are one
  section, "motion stats", at the page foot: after the result sections,
  before the backup and settings rows. Its title opens and closes it like every section
  title; it starts closed (`panels.motionStats`), and the choice is saved.
  The creator asked for this on 2026-10-22 ("make "motion stats" closed by
  default"); it was already the default, and that player's saved choice
  was closed too.
- During a game (board shown through game end) each row updates in place
  from live samples of the input trace, coalesced to at most four
  computations per second. The active game's clock advances elapsed-time
  measurements from cached input computations; ready boards and finished
  games have no idle stats timer. These numbers are transient readings of
  an unfinished trace.
- When the game finishes, the same computation runs once over the complete
  trace, and the same rows show its values, followed by the Fitts curve and
  the spatial bias grid. These are the canonical values: same code as live,
  complete data, and the same wall-time definition the stored trace carries
  (endedAt - startedAt), so live and final can never disagree in
  definition, only in how much of the game they saw. They stay until the
  next game's first sample replaces them. Until a page's first sample, the
  open section says "No game in progress."
- Sampling runs every game, open or closed, because the saved trace keeps
  the sample times. Closed, the section draws nothing; opening it draws the
  game as it is then.
- Removed with the panel (2026-10-20): its × / "stats ▸" toggler and drag
  grip with their saved collapse state and width, the settings "show motion
  stats during game" and "motion charts", and the after-game charts' own
  place at the page bottom.
- The rows wrap left to right across the main column, as many per line as
  fit, each group under its heading.
- One row per metric: the name, the current value, and a sparkline chart
  of the value's evolution over this game (one point per live sample
  plus the final one). The sparkline carries labeled axes: y is the
  series min and max (a flat series draws mid-chart but labels its true
  value — the padding is chart geometry, not data), x runs 0 to the
  elapsed seconds. Spans where the value was not yet measurable are gaps
  in the line, never bridged. Each row's chart is 230x130.
- Eight measurement systems, each a labeled group of the section
  (decided 2026-08-20, when the three researched
  systems beyond the first were reimplemented in-page; click timing
  added 2026-08-22; queued clicks, pace recovery, and aimed movement
  added 2026-08-30). Every row name and every section header opens a
  short explanation on hover, focus, or click; the name itself is the
  trigger, marked by a dotted underline, and the popup never moves the
  rows. Each explanation is one or two plain sentences: what the number
  is, then only the defining detail or a caveat that prevents a likely
  misreading (user direction 2026-09-26: "write them well without
  clutter"; this replaced the earlier two-part HOW/RECORDS text, which the
  panel had stopped displaying). A group heading states its shared unit
  or rule once, so its rows do not repeat it. The groups:
  - DYNAMICS — the behavioral-biometrics session set over movement bouts
    (a pause of 100ms or more separates bouts): strokes, moving, silence
    (share of the game with the cursor still), path, moving speed (mean of
    per-stroke mean speeds; "speed" until 2026-10-07, renamed so it is not
    read as game data's "mouse speed", which is path per second of play,
    pauses included), peak speed, straightness (chord/path),
    jerk (mean |da/dt|, px/ms³), turn rate (rad/ms), left clicks, right
    clicks, hold (mean button-down time), pause-and-click (mean stillness
    before a press). Definitions are exactly those of the offline
    extractor (`analysis/biometrics/extract_features.py`). Path, the
    speeds, and the path under straightness add the cursor's travel
    through the positions merged into each sample (since 2026-10-27;
    [Storage](storage-and-history.md), "Capture provenance v1"), the
    travel game data's path and the live perf charts' mouse speed add;
    headings and turn rate read the steps between samples.
  - PATH AND NO-ACTION EVENTS ("waste" until 2026-08-23, renamed with the
    other wording of measurements as observations) — the survey's own
    whole-game proposals
    (reference/mouse-motion-metrics.md Tier 1/2): wander (total travel
    over the straight lines between consecutive clicks; travel before the
    first click is in the total, so 1.0 does not mean perfectly direct —
    a known window mismatch on the roadmap), pauses / paused / longest
    pause (stops of 250ms or more),
    turnarounds (heading reversals over 90° between movement legs of 8px
    or more), feints (dwelled 300ms or more over a cell, then left it
    without clicking). These are event definitions, not claims about
    intention.
  - CLICK TIMING — press-to-press cadence over all button presses, left
    and right together (added 2026-08-22): click gap (median gap between
    consecutive presses), cadence spread (interquartile range over median,
    the same value game data and the live perf charts call cadence spread,
    shown with the measurement catalog's name and definition since
    2026-10-26 ([Measurement catalog](measurement-catalog.md));
    "gap spread" until 2026-10-07 —
    near 0 = metronomic, systematic clicking; high = rapid-fire runs
    mixed with long stalls), fastest gap, peak rate (most presses in any
    rolling 1-second window), burst share (share of gaps under 250ms),
    on the move (share of presses with a cursor sample in the 100ms
    before the press — clicking without stopping). The press is the
    unit: a wasted click is the same motor act as an effective one, and
    the trace records the hand, not the board effect (the measurement
    principle again). A right press here is the right-button press on a
    board cell, whatever it did (since 2026-09-26; before that it was the
    browser's context-menu event, which Windows fires at the release).
  - TRAJECTORY GEOMETRY — mousetrap-formula measures (Kieslich et al.)
    per inter-click segment, means over segments: segments, MAD,
    AUC, AD, x-flips, y-flips, initiation, idle, vel max, acc max,
    sample entropy, segment time. An exact port of the R package as
    `analysis/mousetrap/trace_measures.R` applies it, verified
    value-for-value against Rscript (see [docs/implementation/motion-stats.md](../implementation/motion-stats.md)).
    Like the Hevelius group below, it runs its published algorithm over the
    timestamped samples alone: the positions merged into a sample carry no
    time of their own, so they cannot join a time series.
  - MOVEMENT GEOMETRY — Hevelius-formula movement features (Gajos et al. 2020;
    reference/hevelius/FEATURES.md) per inter-click movement, means over
    movements: execution, exec no pauses, smoothed peak speed ("peak
    speed*" until 2026-10-07; the asterisk only told it apart from
    DYNAMICS' raw peak speed), peak accel,
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
    movements, not the player's capacity). A finished game adds a
    Fitts curve: an ID-versus-movement-time scatter of this game's
    movements with a Theil–Sen fit, the classic aimed-movement plot.
  - SPATIAL BIAS (2026-08-30, finished games only — it needs the whole
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
- The section is display only: nothing new is stored. The trace remains the
  ground truth, per-game scalar records are unchanged, and the section's
  values are recomputable from the stored trace forever.

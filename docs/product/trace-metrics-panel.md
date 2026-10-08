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
  added 2026-08-30). Every row name and every section header opens a
  short explanation on hover, focus, or click; the name itself is the
  trigger, marked by a dotted underline, and the popup never moves the
  rows. Each explanation is one or two plain sentences: what the number
  is, then only the defining detail or a caveat that prevents a likely
  misreading (user direction 2026-09-26: "write them well without
  clutter"; this replaced the earlier two-part HOW/RECORDS text, which the
  panel had stopped displaying). A section header states its shared unit
  or rule once, so its rows do not repeat it. The sections:
  - DYNAMICS — the behavioral-biometrics session set over movement bouts
    (a pause of 100ms or more separates bouts): strokes, moving, silence
    (share of the game with the cursor still), path, moving speed (mean of
    per-stroke mean speeds; "speed" until 2026-10-07, renamed so it is not
    read as game data's "mouse speed", which is path per second of play,
    pauses included), peak speed, straightness (chord/path),
    jerk (mean |da/dt|, px/ms³), turn rate (rad/ms), left clicks, right
    clicks, hold (mean button-down time), pause-and-click (mean stillness
    before a press). Definitions are exactly those of the offline
    extractor (`analysis/biometrics/extract_features.py`).
  - WASTE — the survey's own whole-game proposals
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
    the same value game data and the session charts call cadence spread;
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
    value-for-value against Rscript (see [docs/implementation/trace-metrics-panel.md](../implementation/trace-metrics-panel.md)).
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

## Switching (creator request and approval, 2026-09-28)

Creator request (verbatim): "what about a new type of user perf stat for
"frequency of switching button presses"? i.e. from going between "marking"
mode and "chording" or "clicking"? that swap reaquires some mental work
compared to continuing doing the current action (e.g. mark mark vs mark
chord) etc. maybe explore this statistically and see if you notice
patterns?" The study ([reference/mode-switch-2026-09-28.md](../../reference/mode-switch-2026-09-28.md))
proposed one stat; the creator approved it the same day: "yes let's at lesat
create the perf stat(s) for this and apply, release them,".

- **Where.** A "switching" section of the stats panel, between the session
  charts and the live rows (the live rows come and go with each game;
  nothing above them moves). It shows whenever the panel is open and hides
  with it. It is never shown per game: one game has too few presses to
  measure the cost (split-half reliability of a per-game estimate about
  0.05 in the study), so every value pools many games.
- **Rows** (one line each; each label opens its explanation):
  - switch cost, for example "+7.4% (+6.4 to +8.4)": how much longer the
    next press takes after changing buttons (flag versus click or chord)
    than after repeating the same move over the same distance at the same
    point in the game; in brackets, the 95% interval.
  - per switch, "+18ms": the same extra time at the median press-to-press
    time of the pooled games' switches.
  - moves that switch, "54%": share of consecutive moves that change
    buttons.
  - games, "500": games pooled.
- **Games pooled.** The latest standard games on the three standard boards
  (Beginner, Intermediate, and Expert with Standard play and the default
  generator) that have a saved trace and at least one timed transition, up
  to 500. Other play modes, custom boards, and other generators stay out:
  the study measured standard play only. Under 30 such games the three
  value rows show the en dash and the games row the count.
- **Estimate** (the study's pre-registered model P1). A transition is two
  consecutive board inputs that are both moves (reveal, chord, flag) with no
  other input between them, the first not the game-starting reveal, timed
  press to press (a left move by its left press, a flag by its right press)
  and kept when 40 ms to 5 s apart. Least squares on the log interval with
  one intercept per game; terms for the previous and the next move type,
  the button switch, the same-button change between reveal and chord,
  natural cubic splines of travel distance (Fitts index), of the cells the
  previous move opened, and of board progress; whether the previous move
  opened an empty region; whether single-number logic offered the next
  target; and how many chordable numbers, proven-safe cells, and proven
  mines the visible board showed. The interval is cluster-robust by game.
  Spline knots follow patsy's rule (extremes plus equally spaced
  percentiles of the distinct values) with values within 1e-9 counted as
  one, so the value does not depend on how an engine rounds the last bit
  of a distance (the exact rule moved knots between numpy and JavaScript).
- **Updates.** Computed from the saved traces when the page loads, so the
  existing history counts at once without new play, and again after each
  standard game's trace is saved. Nothing new is stored.
- **Not shown, by decision:** a per-game switch cost or switch index (noise
  at one game), the raw switch rate as a performance measure (it mostly
  restates how often the player flags, and the rate relative to chance did
  not track speed), and breakdowns by direction or distance (in the
  study, not panel stats; see [BACKLOG.md](../../BACKLOG.md)).
- **Reading.** The pooled value is a summary, not the cost of every switch:
  in the study the cost sat in moves of one or two cells, vanished at three
  or more, and was about 13 ms for flag and chord pairs, larger where a
  reveal was involved.

# Measurement purpose (decided 2026-08-20)

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/offline-analysis.md](../implementation/offline-analysis.md).

The point of all per-game measurement — scalar stats, raw input traces,
and state tags — is to preserve observations that can be compared within
one player over minutes, days, and longer periods. The game records what
happened; it does not infer why a value changed. A state tag permits later
grouping by that self-reported context, but neither a tag nor a correlation
establishes a cause. Motion and gameplay measurements are not diagnoses,
health assessments, personality traits, or proven measures of fatigue,
attention, confidence, expertise, or cognition.

Questions about learning, equipment, health, or other circumstances are
research hypotheses until tested against the stored observations with an
explicit analysis and appropriate controls.
This is why measurements favor completeness over compactness, why raw
traces are kept (a metric invented years from now must be computable over
today's games), and why spent effort is never dropped (see the
measurement principle in reference/mouse-motion-metrics.md).

## Lifelong self-measurement (creator direction, 2026-09-26)

The creator asks to turn the project into something usable "over years and
decades to measure and check all aspects of myself". This is now the governing
purpose; the later sections describe measurement layers that serve it.

**Coverage.** Mouse play and short standardized tasks can track:
- aimed hand movement (speed, precision, corrections, consistency);
- processing and reasoning speed;
- sustained alertness;
- decision and risk style;
- learning, and fatigue within a session;
- how each of these varies with sleep, time of day, season, health, and age.

Strength, balance, gait, cardiovascular fitness, and body composition need
other instruments. Their data joins these records by UTC time and time zone;
it is never inferred from cursor data.

**Rules for decades:**

1. **Two measurement streams.**
   - Free play is dense and natural, but its instrument keeps changing (game
     code, browser, hardware), so on its own it cannot compare one decade with
     another.
   - Short frozen reference checks are the ruler: the [self-check](self-check.md)
     keeps the same stimuli, timing, input, and scoring for as long as its data
     exists.
   - A play measure becomes trustworthy only after it is shown to track the
     checks.
2. **Frozen protocols.** A released protocol id is never edited. A change ships
   under a new id, and old and new run side by side for a bridging period so
   their offset is measured.
3. **Context travels with every observation:**
   - UTC time, plus the IANA time zone and the offset then in force;
   - screen, viewport, and browser facts;
   - the protocol or capture version;
   - physical setup facts the browser cannot see (mouse, DPI, pointer
     acceleration, hand), which are declared, never guessed.
4. **Paired self-report.** Every check starts with a graded sleepiness rating.
   The occasion (routine or extra) is stored, because extra checks are chosen
   by circumstance and would bias a baseline.
5. **Nothing lost.**
   - Every attempt, full-rate input, and every check must be kept (restarted
     games and full-rate input are on the roadmap).
   - The browser database is only a working copy. The archive folder keeps
     documented open files outside the browser.
   - Absent means not measured.
6. **Low burden.** A check stays under five minutes, the only required answer is
   one click, and everything else is optional. Adherence over years matters
   more than any single measurement.
7. **Like-for-like comparison.**
   - Change is judged against the person's own baseline under the same protocol
     version and setup, accounting for practice, time of day, and board
     difficulty.
   - The day, not the trial, is the independent unit.
   - A measure becomes a reported indicator of a state only after this
     person's data shows both its day-to-day reliability and its association
     with independent reports, such as sleepiness ratings.

**Built 2026-09-26:**
- self-check v1: a sleepiness rating plus a 3-minute alertness test, with
  history and backup; the same day the creator replaced the 3-minute test with
  a single 10-counter test (about 30 s);
- the time zone on every new finished-game record;
- screen and browser facts on every new trace, and input provenance
  ([capture v1](storage-and-history.md#capture-provenance-v1-2026-09-26));
- the [archive folder](storage-and-history.md#archive-folder-creator-direction-2026-09-26):
  every record, trace, and self-check written automatically, once, as
  documented gzip JSON files in a folder the player chooses, outside the
  browser;
- a persistent-storage request, so the browser does not evict the database
  under disk pressure.

The rest is the ordered roadmap in [BACKLOG.md](../../BACKLOG.md#lifelong-self-measurement-roadmap-creator-2026-09-26).

## Behavioral signatures and state research (requested 2026-08-30)

The longitudinal analysis purpose includes characterizing repeatable play
tendencies within this player and testing whether measured behavior can
predict a self-reported state. The requested analysis surfaces are not built
yet; their concrete backlog is in `BACKLOG.md` under "Longitudinal behavior
and state analysis."

- Every analysis must support both whole-session summaries and trailing
  played-time chunks inside the current session. At minimum each grouping
  reports games, wins, win rate, accumulated play time, mouse speed, useful
  click rate and fastclick gap, with robust center/spread and measured sample
  coverage. Additional motion, error, action, and risk measures join the same
  grouping when present.
- A play signature is multidimensional: movement/click cadence and geometry;
  no-op, contradiction, and fatal-action patterns; marking/chording style;
  and the rate, risk rank, one-ply quality, and context of guesses. A total
  score must not erase the component values that identify how two signatures
  differ.
- State classification is a supervised within-person research result, not an
  inference from a suggestive curve. Train on explicit state labels, evaluate
  on held-out whole sessions, report class balance, uncertainty, calibration,
  and errors, and compare against time-of-day/session-position baselines.
  Until that validation exists, the UI may show associations but may not say
  that motion or gameplay detected a physical, physiological, cognitive, or
  clinical state.
- Guess behavior must be analyzed against more than one objective. Immediate
  minimum mine risk and one-ply expected remaining life describe per-instance
  survival quality; wins per wall-clock hour, attempts per hour, expected
  time to the next win, and cumulative progress/risk describe exposure-time
  optimization. A player may rationally accept lower per-game win probability
  to restart faster, especially on larger boards, so that policy must not be
  mislabeled as declining sophistication.
- Difficulty comparisons remain stratified by exact board, mode, generator,
  and measurement era. Analyses then test whether guess policy changes with
  level, date, session position, and recent state rather than treating the
  pooled game mix as a player trait.

Clarified 2026-08-20: the motion metrics measure the outer physical
world — the layer where the player actually interacts with the mouse and
generates movements — not the inner cognitive one. Concretely, every
inter-click movement is anchored at the last click before it, regardless
of how long before that its destination had been revealed or become
deducible; when the player's intention for a move was actually born
(at the enabling reveal, during earlier work, on committing after the
previous click, or on re-verifying at arrival) is private and is
deliberately not guessed at. A cell that gets resolved indirectly by
separate processes (a flood fill or a chord from elsewhere) simply
produces no movement and no work items — correct, because no physical
interaction happened there. The full birth-time analysis, including the
uneven thinking-contamination it implies and the computable refinements
left for later, is in reference/mouse-motion-metrics.md ("Goal birth
time and segment anchoring").

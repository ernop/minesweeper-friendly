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

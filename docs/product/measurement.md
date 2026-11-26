# Measurement purpose

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/offline-analysis.md](../implementation/offline-analysis.md).

## Core measurement doctrine

Per-game scalars, raw input traces, and state tags preserve within-player observations for comparison over minutes, days, and years.

- **Observe, never infer cause:** the game records what happened, not why. State tags enable grouping by self-reported context, never causal proof; gameplay and motion measures are not diagnoses or proven indicators of fatigue, attention, or cognition until validated by explicit within-person analysis.
- **Completeness over compactness:** raw traces are kept permanently so metrics invented years later remain computable over past games, and spent effort (such as no-ops) is never dropped.
- **Outer physical layer:** motion metrics measure observable hand-to-mouse interaction anchored at the preceding click, deliberately not guessing private cognitive birth times (see `reference/mouse-motion-metrics.md`). Indirectly cleared cells (flood fills, chords) generate no separate movement.

## Lifelong self-measurement

The governing longitudinal goal: an instrument usable across years and decades to track motor control, reasoning speed, alertness, decision/risk style, learning, and within-session fatigue across sleep, time of day, season, health, and age. External physiological channels (strength, cardiovascular, heart rate) join records by UTC timestamp and time zone — never inferred from cursor data.

### Seven rules for multi-decade validity
1. **Two streams:** free play is dense and natural but changes with software/hardware; short frozen reference checks ([Self-check](self-check.md)) provide the invariant ruler that calibrates gameplay metrics.
2. **Frozen protocols:** never edit a released protocol id; ship changes under a new id with a bridging period so offsets can be measured.
3. **Context travels with every observation:** UTC timestamp, IANA time zone and UTC offset, screen/viewport/browser facts, protocol/capture version, and declared (never guessed) physical setup facts.
4. **Paired self-report:** every check starts with a graded sleepiness rating and stores `routine` vs. `extra` occasion so circumstance-prompted checks never skew baselines.
5. **Nothing lost:** IndexedDB is a working copy backed by write-once open files in the [archive folder](storage-and-history.md#archive-folder) plus `navigator.storage.persist()`; absent always means `"not measured"`.
6. **Low burden:** checks stay short (~30 s, well under 5 min) with minimal required input so multi-year adherence holds.
7. **Like-for-like comparison:** judge change against personal baselines under the same protocol and setup, treating the day (not the individual trial) as the independent unit and requiring day-to-day reliability plus association with independent reports before treating any measure as a state indicator.

**Shipped foundations:** [Self-check](self-check.md) (`kss-9-v1` + `alertness-10-v1`), per-record `timeZone`/`utcOffsetMin`, trace `environment` + [capture provenance](storage-and-history.md#capture-provenance), automatic write-once [archive folder](storage-and-history.md#archive-folder), and persistent storage request. Remaining longitudinal roadmap lives in [BACKLOG.md](../../BACKLOG.md#lifelong-self-measurement-and-longitudinal-research).

## Behavioral signatures and state research

Requirements governing upcoming longitudinal analysis views ([BACKLOG.md](../../BACKLOG.md#lifelong-self-measurement-and-longitudinal-research)):

- **Session and trailing played-time views:** support both whole-session summaries and trailing played-time chunks (games, wins, win rate, play time, mouse speed, click rate, fastclick gap, with robust center/spread and coverage).
- **Multidimensional play signature:** preserve separate dimensions (cadence/geometry, error grammar, marking/chording style, guess policy) without collapsing them into one opaque score.
- **Held-out state classification:** train supervised within-person models on explicit labels, evaluate on held-out whole sessions against time-of-day/session-position baselines, and report calibration and errors. Until validated, UI may show associations only — never claim to detect physical or cognitive states.
- **Competing guess objectives:** evaluate guesses both for per-game survival (minimum immediate risk, one-move life) and exposure-time throughput (wins/hour, expected time to next win) — faster-resetting strategies on large boards must not be mislabeled as poorer play.
- **Stratified baselines:** keep comparisons stratified by exact board size, mode, generator, and measurement era.

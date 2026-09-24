# Reference material

Research notes and external references. Index: [AGENTS.md](../AGENTS.md).

- `reference/mouse-motion-metrics.md` — 2026-08-20 survey of mouse-motion
  characterization across psychometrics, biometrics, clinical assessment,
  and esports, with a tiered proposal for per-game measurements. All four
  systems are implemented in-page since 2026-08-20 ([Trace
  metrics panel](../docs/product/trace-metrics-panel.md)): the biometrics session set, the mousetrap psychometric
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
- `reference/board-metric-definitions.md` — 2026-09-21 definitions and
  reference calculations for fixed board measures (3BV, exact minimum chord
  clicks versus ZiNi heuristics, work spread, clue-width closure), with the
  executable `board-metric-calculators.js` and research-only
  `board-metric-searches.js` (C*/RCW); neither is loaded by the game.
- `reference/board-difficulty-review.md` — 2026-09-21 review separating board
  rarity, conditional solve performance, workload, logic, and chance, with
  primary online sources and proposed measurements.
- `reference/board-structure-research.md` — 2026-09-21 review of the 0–1
  share, zero-opening coverage, and declined deduction-coverage descriptors;
  `board-structure-metrics.js` holds its exact research calculators.
- `reference/ranks-won-review.md` — 2026-09-21 ranks-won visibility review
  and the period-summary scope decision that followed it.
- `reference/replay-experiment.md` — design notes (unbuilt) for covert
  replays inside ordinary play and the skill/luck decomposition.
- Pattern catalog: https://minesweeper.online/help/patterns
- Gameplay/3BV/NG help: https://minesweeper.online/help/gameplay
- Kaboom design writeup: https://pwmarcz.pl/blog/kaboom/
- Probabilistic solver: https://github.com/mrgriscom/minesweepr

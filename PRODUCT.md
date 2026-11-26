# minesweeper-friendly — Product & UI Decisions

Canonical record of every product and UI decision, one file per area under
`docs/product/`. If behavior and a section file disagree, one of them is a bug:
fix the code or fix that file in the same change. Implementation notes (function
and key names) live in the matching `docs/implementation/` file;
[AGENTS.md](AGENTS.md) maps every area to both. Player-facing pitch in
`promo/PROMO.md`; unbuilt work in [BACKLOG.md](BACKLOG.md).

## Product goals

Long-term vision:

1. **The world's best play-mode Minesweeper for players:** faithful standard
   mechanics and crisp classic-Windows feel, ultra-low latency, effortless
   clarity, and solver-aware play variants (the design axis is mapped in
   [docs/product/design-axis.md](docs/product/design-axis.md); Guardian Angel
   is specified in [docs/product/guardian-angel.md](docs/product/guardian-angel.md);
   removed no-guess modes are noted in
   [docs/product/play-modes.md](docs/product/play-modes.md)).
2. **Integrated intelligence and inventive self-training:** continually
   research, discover, and invent better methods to model how a player reads,
   thinks, moves, and decides, and turn those discoveries into effective,
   empirically verified ways to self-train — treating specific drills,
   coaching detectors, and experiments as testable hypotheses to evolve or
   replace as new findings emerge.
3. **Play naturally rising into stats, self-understanding, and fun
   record-keeping:** ordinary play organically feeds lucid rankings, personal
   records, automatic highlights, visual replays, and lifelong self-measurement
   without cluttering play or feeling like homework.

Standing defaults and hosting:

- The public game is https://minesweeper-friendly.fuseki.net/ . Every push
  to `master` releases that site. GitHub Pages redirects visitors there. The
  page footer links back to the hosted site.
- Default difficulty is Beginner.

## Sections

### Foundations

- [docs/product/hosting.md](docs/product/hosting.md) — Independent Fuseki application hosting, browser-origin isolation, release boundaries, and hosted play statistics.
- [docs/product/design-axis.md](docs/product/design-axis.md) — Ambiguity design axis from naive random to the angelic dual of Kaboom, exact deduction levels (counting, overlap, all numbers, mine total), and the six-level move hierarchy.
- [docs/product/ui-doctrine.md](docs/product/ui-doctrine.md) — App-wide UI principles and invariants (simplicity first, visual grammar, pure black text, compact aligned numbers, player words, no narrated marks, optional hidden help, hover/layout stability, one-step global vs. local options, visible errors). Read before building or reshaping any surface.
- [docs/product/board-and-layout.md](docs/product/board-and-layout.md) — Classic skin and board ergonomics, startup readiness and latency budgets, navigation rows, and the board-first adaptive layout where the board never moves.

### Play

- [docs/product/play-modes.md](docs/product/play-modes.md) — Mode selection and every mode (Standard, 3BV countdown, Angelic, Endgame drill, Coaching practice modes, Trials, Board lab, removed no-guess compatibility) plus the visible-information solver.
- [docs/product/board-generators.md](docs/product/board-generators.md) — Generator selection, placement algorithms, and top score keys.
- [docs/product/guardian-angel.md](docs/product/guardian-angel.md) — Exact structural forced-guess protection (plain clicks into guesses nothing else on the board could ever settle; open-field gambles and chords stay deadly).

### After a game

- [docs/product/game-end-evaluation.md](docs/product/game-end-evaluation.md) — Off-thread action judgment against pre-click visible positions, independent evidence dimensions, exclusive report taxonomy, loss types, win types, and session result kinds.
- [docs/product/results.md](docs/product/results.md) — Canonical presentation order (exact pagetables before point charts), collapsible openers, local view configuration, score/old-game views, and progressive worker delivery.
- [docs/product/game-data.md](docs/product/game-data.md) — Percentile band and distributions chart in the details dock, comparison pools, scoped rows, hover cards with example boards, and the shared session definition.
- [docs/product/during-game.md](docs/product/during-game.md) — Live perf charts heading the details dock: progress, moves available, event tracks (clicks, jumps, pauses), relative-to-whole-game lines, hover board scrubbing, and replay locking.
- [docs/product/rankings.md](docs/product/rankings.md) — Time-window, day-category, board-family, and streak rank tables, full score lists with old-game review, no-mark filtering, rank highlights, session summary and 3-band results partition, ranks won in session, and relative ages.
- [docs/product/charts.md](docs/product/charts.md) — Property charts (`your perf` in `ms / 3BV` and `board traits` in seconds with average/distribution/winrate modes), relationship scatters, and exact worker-run Theil–Sen fits.
- [docs/product/replay.md](docs/product/replay.md) — Post-game video-style replay transport, six solver/click board overlays, six cursor path views, and the interpretive legend.

### Measurement

- [docs/product/measurement.md](docs/product/measurement.md) — Within-player measurement doctrine, lifelong self-measurement rules, and behavioral-signature research requirements.
- [docs/product/self-check.md](docs/product/self-check.md) — Frozen ~30 s reference check (`kss-9-v1` sleepiness + `alertness-10-v1` 10-counter alertness test) for multi-decade comparability.
- [docs/product/measurement-catalog.md](docs/product/measurement-catalog.md) — Single canonical definition (`GameData.metrics`) for every performance measurement across all surfaces plus bidirectional Game Data ↔ live perf hover links.
- [docs/product/per-game-stats.md](docs/product/per-game-stats.md) — Stored primary counters, schema-boundary dates, derived rates, board benchmarks and backfill, timing/movement stats, misclicks, exact guess ledger, reproducibility, and local music polling.
- [docs/product/motion-stats.md](docs/product/motion-stats.md) — Collapsible page-foot mouse-dynamics systems (closed by default, computed off-thread only while open) plus finished-game Fitts curve and Spatial Bias heatmap.
- [docs/product/session-stats.md](docs/product/session-stats.md) — Archive of the retired left session panel, where each component moved, and reusable time-series chart ideas.
- [docs/product/player-states.md](docs/product/player-states.md) — Self-reported context tag pills, `edit states` floating popover, and 45-minute quick state sampling (`focus` / `pace`).

### Training

- [docs/product/training.md](docs/product/training.md) — Sub-60 Expert training plan, cumulative stages and targets, read-only `training.html` dashboard (traits, cross-size trace mind-map, coaching transfer, time breakdown, pooled button switch cost, openings, and paired state-tag experiments).
- [docs/product/problems.md](docs/product/problems.md) — Timed corpus pattern problems (`problems-v2`) with skill-level ladders, `last-flag-v1` 1.5-click drill, and frozen `pointing-v1` Fitts pointing test on `problems.html`.

### Settings and data

- [docs/product/settings.md](docs/product/settings.md) — Schema-driven preferences (`SETTINGS_SCHEMA`), global (`settings.html`) vs. local (game page) option split, defaults, and separate preference transfer.
- [docs/product/play-limits.md](docs/product/play-limits.md) — Voluntary daily play limits per 4:00 play day with two confirmations, 2-minute loosening lock, and default half-again no-flags-first penalty.
- [docs/product/storage-and-history.md](docs/product/storage-and-history.md) — IndexedDB stores, schema boundaries, raw input traces and provenance, history backup, and automatic write-once archive folder sync.

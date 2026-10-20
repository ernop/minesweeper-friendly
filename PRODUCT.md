# minesweeper-friendly — Product & UI Decisions

Canonical record of every product and UI decision made to date, one file
per area under `docs/product/`. If behavior and a section file disagree,
one of them is a bug: fix the code or fix that file in the same change.
Implementation notes (function and key names) live in the matching
`docs/implementation/` file; [AGENTS.md](AGENTS.md) maps every area to
both. Player-facing pitch in `promo/PROMO.md`; unbuilt work in
[BACKLOG.md](BACKLOG.md).

## Product goals

- Start from a faithful clone of minesweeper.online's standard mode: same
  mechanics, same classic-Windows look.
- Grow toward friendlier variants (no-guess and beyond; the design axis is
  mapped in [docs/product/design-axis.md](docs/product/design-axis.md)).
  First variant implemented 2026-08-20: "A just universe"
  ([docs/product/just-universe.md](docs/product/just-universe.md)).
- The public game is https://minesweeper-friendly.fuseki.net/ . Every push
  to master releases that site. GitHub Pages still publishes the repository
  and redirects visitors there. The page links back to the repo via a subtle
  footer.
- Default difficulty is Beginner.

## Sections

Quoted names are the headings each file took over from the former
single-file spec; older references cite them as `PRODUCT.md "Heading"`.

### Foundations

- [docs/product/hosting.md](docs/product/hosting.md) — Independent Fuseki application hosting, browser-origin isolation, release boundaries, and the hosted site's play statistics.

- [docs/product/design-axis.md](docs/product/design-axis.md) — The friendliness axis from naive random to the angelic dual of Kaboom, and the solver logic tiers behind "solvable".
- [docs/product/ui-doctrine.md](docs/product/ui-doctrine.md) — App-wide directives (simplicity first, defaults show nothing extra, global configuration in one place, useful optional help, no hover reflow, unshortened legend labels, layout stability). Read before building or reshaping any surface. Section: "UI doctrine".
- [docs/product/board-and-layout.md](docs/product/board-and-layout.md) — The classic skin and board chrome, the game setup rows, top bar, settings row, and footer, and the page columns around a board that never moves. Sections: "Board and chrome", "Game setup, top bar, settings row, and footer", "Layout: the board never moves".

### Play

- [docs/product/play-modes.md](docs/product/play-modes.md) — Choosing a mode (preset links, the other modes menu) and every mode (Standard, the NG variants, Proof-or-die, Angelic, Endgame drill, trials, Pregen 10, Board lab), with the visible-information solver. Section: "Play modes".
- [docs/product/board-generators.md](docs/product/board-generators.md) — The Generator menu, each generator, and the top score keys that rankings are stored under. Section: "Board generators and top score keys".
- [docs/product/just-universe.md](docs/product/just-universe.md) — Sealed-pocket mercy. Certified pocket entries are safe; open-field gambles and chords stay deadly. Section: "A just universe".

### After a game

- [docs/product/game-end-evaluation.md](docs/product/game-end-evaluation.md) — Every action judged against the position visible before it, with the evidence ledger, verdicts, and reported endings. Section: "Game-end evaluation".
- [docs/product/results.md](docs/product/results.md) — The one order for post-game and score-view output (outcome, tables, then point charts). Section: "Result presentation and ordering".
- [docs/product/game-data.md](docs/product/game-data.md) — The performance chart beside the board, its shared session definition, ranking direction, catalog, removed fields, and the optional switch cost line.
- [docs/product/during-game.md](docs/product/during-game.md) — How the game just played unfolded on its own clock: a progress chart, one chart of every measured line against its own whole-game value, and event tracks (clicks, jumps, pauses) on one time axis, with the hovered line's value, the board at that moment, and a replay link. The block "live perf charts" at the head of the game data column.
- [docs/product/rankings.md](docs/product/rankings.md) — Time-window and day-category rank lists, row highlights, the recent-placements summary, relative ages, and streaks. Sections: "Rank lists", "Rank highlights", "Recent placements", "Relative age display", "Streak lists".
- [docs/product/charts.md](docs/product/charts.md) — Grouped average-time scatters, the relationship scatter plots, and the retired rankaverage tables. Sections: "Average-time charts", "Scatter plots", "Retired rankaverage charts".
- [docs/product/replay.md](docs/product/replay.md) — After-game path and choice replay (overlays, history slider, solver overlays, legends, chords, off-screen durations). Section: "Path and choice replay views".

### Measurement

- [docs/product/measurement.md](docs/product/measurement.md) — Why games are measured (comparison within one player, no causal inference), the lifelong self-measurement design, and the behavioral-signature research. Section: "Measurement purpose".
- [docs/product/self-check.md](docs/product/self-check.md) — The frozen reference check (sleepiness rating plus a 10-counter alertness test) for comparison over years: protocols, versioning, stored record, result, history, and backup.
- [docs/product/per-game-stats.md](docs/product/per-game-stats.md) — The fields recorded per finished game, derived rates, board measurements and backfill, the guess ledger, and music playing. Section: "Per-game stats".
- [docs/product/motion-stats.md](docs/product/motion-stats.md) — Mouse-dynamics features computed from the trace, live during the game and final after it, in one open/close section at the page foot. Section: "Motion stats".
- [docs/product/session-stats.md](docs/product/session-stats.md) — The left stats panel's session charts, removed 2026-10-20: the creator's decision, where each part went, and the chart ideas worth reusing. Section: "Session stats".
- [docs/product/player-states.md](docs/product/player-states.md) — Self-reported context tags stored on finished games. Section: "Player states".

### Training

- [docs/product/training.md](docs/product/training.md) — The plan toward an Expert win under 60 seconds (stages, rules, targets, session routine) and the read-only training page that measures the player against it; the situation and memorization comparison with players at every level.
- [docs/product/problems.md](docs/product/problems.md) — Minesweeper problems: timed real moments from strong players' games, classed by the rule the new number needs, with the player's thinking time against every level.

### Settings and data

- [docs/product/settings.md](docs/product/settings.md) — The settings page and every preference. Section: "Personal settings".
- [docs/product/play-limits.md](docs/product/play-limits.md) — Daily play limits the player sets on themself (play time, games, games per level, a stop time) per 4:00 play day, with two confirmations and the 2-minute loosening lock; reaching one first takes away flags for half the limit again by default, then closes the board.
- [docs/product/storage-and-history.md](docs/product/storage-and-history.md) — The IndexedDB stores, raw input traces, play history with backup, and the automatic archive folder outside the browser. Sections: "Storage", "Raw input traces", "Play history and backup", "Archive folder".

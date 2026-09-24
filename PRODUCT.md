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
- A playable version is always live at
  https://ernop.github.io/minesweeper-friendly/ — the public repo redeploys
  GitHub Pages on every push. The page links back to the repo via a subtle
  footer.
- Default difficulty is Beginner.

## Sections

Quoted names are the headings each file took over from the former
single-file spec; older references cite them as `PRODUCT.md "Heading"`.

### Foundations

- [docs/product/design-axis.md](docs/product/design-axis.md) — The friendliness axis from naive random to the angelic dual of Kaboom, and the solver logic tiers behind "solvable".
- [docs/product/ui-doctrine.md](docs/product/ui-doctrine.md) — App-wide directives (simplicity first, useful optional help, no hover reflow, unshortened legend labels, layout stability). Read before building or reshaping any surface. Section: "UI doctrine".
- [docs/product/board-and-layout.md](docs/product/board-and-layout.md) — The classic skin and board chrome, and the page columns around a board that never moves. Sections: "Board and chrome", "Layout: the board never moves".

### Play

- [docs/product/play-modes.md](docs/product/play-modes.md) — The Mode menu and every mode (Standard, the NG variants, Proof-or-die, Angelic, Endgame drill, trials, Pregen 10, Board lab), with the visible-information solver. Section: "Play modes".
- [docs/product/board-generators.md](docs/product/board-generators.md) — The Generator menu, each generator, and the top score keys that rankings are stored under. Section: "Board generators and top score keys".
- [docs/product/just-universe.md](docs/product/just-universe.md) — Sealed-pocket mercy. Certified pocket entries are safe; open-field gambles and chords stay deadly. Section: "A just universe".

### After a game

- [docs/product/game-end-evaluation.md](docs/product/game-end-evaluation.md) — Every action judged against the position visible before it, with the evidence ledger, verdicts, and reported endings. Section: "Game-end evaluation".
- [docs/product/results.md](docs/product/results.md) — The one order for post-game and score-view output (outcome, tables, then point charts). Section: "Result presentation and ordering".
- [docs/product/game-data.md](docs/product/game-data.md) — The performance chart beside the board, its shared session definition, ranking direction, catalog, and removed fields.
- [docs/product/rankings.md](docs/product/rankings.md) — Time-window and day-category rank lists, row highlights, the recent-placements summary, relative ages, and streaks. Sections: "Rank lists", "Rank highlights", "Recent placements", "Relative age display", "Streak lists".
- [docs/product/charts.md](docs/product/charts.md) — Grouped average-time scatters, the relationship scatter plots, and the retired rankaverage tables. Sections: "Average-time charts", "Scatter plots", "Retired rankaverage charts".
- [docs/product/replay.md](docs/product/replay.md) — After-game path and choice replay (overlays, history slider, solver overlays, legends, chords, off-screen durations). Section: "Path and choice replay views".

### Measurement

- [docs/product/measurement.md](docs/product/measurement.md) — Why games are measured (comparison within one player, no causal inference), and the behavioral-signature research. Section: "Measurement purpose".
- [docs/product/per-game-stats.md](docs/product/per-game-stats.md) — The fields recorded per finished game, derived rates, board measurements and backfill, the guess ledger, and music playing. Section: "Per-game stats".
- [docs/product/trace-metrics-panel.md](docs/product/trace-metrics-panel.md) — Mouse-dynamics features computed from the trace, live in the left panel and final in the bottom charts. Section: "Trace metrics panel".
- [docs/product/session-stats.md](docs/product/session-stats.md) — The recent-observations section, its player-chosen session window, and the action-rates charts. Section: "Session stats".
- [docs/product/player-states.md](docs/product/player-states.md) — Self-reported context tags stored on finished games. Section: "Player states".

### Settings and data

- [docs/product/settings.md](docs/product/settings.md) — The settings page and every preference. Section: "Personal settings".
- [docs/product/storage-and-history.md](docs/product/storage-and-history.md) — The IndexedDB stores, raw input traces, and play history with backup. Sections: "Storage", "Raw input traces", "Play history and backup".

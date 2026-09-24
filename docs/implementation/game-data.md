# Game data — implementation notes

Spec: [docs/product/game-data.md](../product/game-data.md). Index: [AGENTS.md](../../AGENTS.md).

- Game data (2026-09-23): [complete design and removed-field inventory](../product/game-data.md).
  `game-data.js` owns shared metric formulas, GameData catalog/rows/history/domain,
  and SessionScope choices/bounds/records. `settings-core.js` depends on it.
  `performanceTimeRankProfile` adds presentation standing labels; `boardTraitRankProfile`
  ranks actual scalar trait values with specified preferred directions.
  `buildBoardTimeRankProfile` renders chart/config/history; `renderRanks` puts
  it in `#game-data-column` when docked, else `#result-stats`.
  `GameData.rankedRow` sets `percentile` to 100 × (rank − 1) ÷ (count − 1)
  (best 0%), and gives performance rows `name`, `scopeText` ("(session)",
  "(life)", "(day)"), `trait` = name + scope word (the `data-trait` value),
  and `label` = name, value, scope word. `boardTraitValueLabel` renders
  `.board-trait-name`, `.board-trait-value`, then `.board-trait-scope`.
  Configuration has independent session/lifetime columns with mixed/all controls;
  `gameDataSessionMetrics`, `gameDataLifetimeMetrics`, `gameDataDayTime`, and
  `gameDataShowValues` use the shared persistent preference schema.
  `GameData.defaults` is per scope: `lifetime` from each metric's `default`,
  `session` all off.
  `boardTraitLabelLayout` fits measured label heights to exact percentile points;
  ResizeObserver responds to width/value changes. `buildBoardTraitLine` owns
  the side headings; its `placeBand` measures one-line label widths under
  `.board-trait-line-measuring` and sets `--band-x` on the figure from
  `boardTraitBandCenter`. Band, leaders, dots, labels, side headings, and the
  singleton note all position from `--band-x`. The chart fills its column's
  width and the height left for it (`fitGameDataToSidebar`), autozooms with
  outward decile bounds, and keeps absolute colors. Only the plot scrolls if
  selections cannot fit readably.
  Shared chart help uses one owned manual popover, so it stays above compact
  sidebar content and old blur/leave events cannot hide another item's help.
  `setSessionDefinition` updates all mirrored selectors and scope-dependent
  nodes without rebuilding the board. Historical pages derive twenty overlapping
  session windows at a time from primary records; no stored aggregates.
  Pure checks: tests/game-data-test.js, tests/recent-placements-test.js,
  tests/session-buckets-test.js. Browser checks: tests/board-time-profile-browser-check.js.

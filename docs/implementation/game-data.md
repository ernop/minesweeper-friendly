# Game data — implementation notes

Spec: [docs/product/game-data.md](../product/game-data.md). Index: [AGENTS.md](../../AGENTS.md).

- Game data (2026-09-23, band rebuilt 2026-10-07): [complete design and removed-field inventory](../product/game-data.md).
  `game-data.js` owns shared metric formulas, the GameData catalog (one
  `name`, `format`, `help`, direction, and `allOutcomes` per measurement),
  rows, history, domain, and SessionScope choices/bounds/records.
  `settings-core.js` depends on it.
- Rows: `GameData.rows(record, records, preferences, params)` ranks every
  chosen measurement (`preferences.gameDataMetrics`) against lifetime and the
  session, and time against the trailing 24 hours when `gameDataDayTime`.
  `GameData.rankedRow` omits a pool with fewer than two eligible measured
  games (2026-09-26). A row carries `id` (`metricId.scope`), `metricId`,
  `scope` (`lifetime`, `session`, `day`), `name`, `value`, `valueText`,
  `rank`, `firstRank`/`lastRank` (a tie's span), `total`, `counted` (wins,
  games, boards), `allEqual`, `percentile` (100 × (rank − 1) ÷ (count − 1),
  best 0%; 50 for constant non-time values), and `helpText` (the definition,
  then one rank sentence). `boardTraitRankProfile` (game/game-data-chart.js)
  ranks this board's scalar traits against every earlier board through the
  same `rankedRow`, side `board`, scope `lifetime`.
- Distributions: `GameData.addDistributions` gives each row
  `distribution`: the measurement's axis (`axisOf`: one bin per value for
  integers spanning at most 60 values, otherwise 36 bins over the lifetime
  1st–99th percentiles, always including this game), `counts`, `standing`
  per bin (the mean percentile of the bin's games, ties sharing their mean
  rank; null when empty), `outside` (values beyond the axis, counted but
  never drawn into an edge bin), and at most five `labels`. Every pool of one
  measurement shares the lifetime axis, so its strips line up; the lifetime
  row also carries `sessionValues` for the session ticks.
- All of this runs in the analysis worker's `game-data` job
  (analysis-worker.js), which posts plain rows; the page never computes
  ranks or histograms. `buildBoardTimeRankProfile(record, records)` owns a
  view generation so a slower reply cannot replace a newer view.
- Band: `gameDataItems` groups rows into one item per measurement with a row
  per pool. `buildGameDataBand(rows, pool, valuesShown)` builds `.game-data-row`
  buttons (cells `.game-data-name`, `.game-data-value`, `.game-data-pct`
  with `data-pool`) and lays them out in `layout()`: it measures every
  column at its natural width, then takes the first plan that fits:
  side by side with both pool columns, side by side with one
  (`data-pool-columns="1"`, the session column hidden), stacked with two,
  stacked with one; otherwise the narrowest plan scrolls inside the band.
  `boardTraitLabelLayout` fits rows to exact percentile points; leaders and
  `.game-data-dot` mark each point. `standingColor` interpolates
  `STANDING_BAR_STOPS` (bar) or `STANDING_MARK_STOPS` (histogram bars,
  chips): green, neutral, red. `settings.gameDataBandPool` picks the plotted
  pool through the `.game-data-pool-switch` buttons.
- Card and distributions: `fillGameDataCard` fills the shared help tip with
  the title, `gameDataRankText` per pool, the definition, and
  `gameDataHistogram(row, true)`; the tip is the one owned manual popover,
  so it never reflows the page. `buildGameDataDistributions` renders the
  `settings.gameDataDistributions` mode: `.game-data-dist-section`s in one
  `.game-data-distributions` grid with subgrid rows, so every strip shares
  one column.
- Chart linkage: `buildAverageScatter(spec, model, gameDataRows)` sets
  `data-measurement` from the spec's `measurementId` and adds
  `gameDataChartChip(row)` for the lifetime row; `renderRanks` awaits the
  game-data job before building charts so the chips exist. Hover and focus
  on a band or distribution row call `linkGameDataCharts`, which toggles
  `.game-data-linked` on those charts.
- Configuration: one checkbox per measurement plus "all performance
  measurements" and the 24-hour time switch. Preferences: `gameDataMetrics`
  (one map; `gameDataMetricsFromStored` carries over the former
  `gameDataLifetimeMetrics`/`gameDataSessionMetrics`, a measurement shown in
  either staying shown), `gameDataBandPool`, `gameDataDistributions`,
  `gameDataDayTime`, and `gameDataShowValues`, all in the shared persistent
  schema.
- Session: `SessionScope.defaultId` ('today') is the one default: the
  settings schema and `GameData.defaultsForView` both read it.
  `buildSessionScopeSelect` builds the only picker
  (`#session-definition-select`, accessible name "session") once, inside
  the stats panel's persistent `.session-scope-head`. `setSessionDefinition`
  saves it and dispatches `session-scope-change` to every
  `[data-session-scope-view]` node (game data, the session summary, and ranks
  won), which rebuild in place without rebuilding the board. Historical pages
  derive twenty overlapping session windows at a time from primary records;
  no stored aggregates.
- Checks: tests/game-data-test.js (rows, ties, standing, distributions),
  tests/recent-placements-test.js, tests/session-buckets-test.js, and
  tests/board-time-profile-browser-check.js (columns, responsive plans,
  card, distributions, linkage, one picker, configuration).

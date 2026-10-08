# Game data — implementation notes

Spec: [docs/product/game-data.md](../product/game-data.md). Index: [AGENTS.md](../../AGENTS.md).

- Game data (2026-09-23, band rebuilt 2026-10-07, panel and cards revised 2026-10-08): [complete design and removed-field inventory](../product/game-data.md).
  `game-data.js` owns shared metric formulas, the GameData catalog (one
  `name`, `format`, `help`, `explain`, direction, and `allOutcomes` per
  measurement), rows, history, domain, and SessionScope choices/bounds/records.
  `settings-core.js` depends on it.
- Rows: `GameData.rows(record, records, preferences, params)` ranks every
  chosen measurement (`preferences.gameDataMetrics`) against lifetime and the
  session, and time against the trailing 24 hours when `gameDataDayTime`.
  `GameData.rankedRow` omits a pool with fewer than two eligible measured
  games (2026-09-26). A row carries `id` (`metricId.scope`), `metricId`,
  `scope` (`lifetime`, `session`, `day`), `name`, `value`, `valueText`,
  `rank`, `firstRank`/`lastRank` (a tie's span), `better` (other games
  ranked better, an equal time set earlier included), `tiedOthers` (other
  games with an equal value; always 0 for time), `total`, `counted` (wins,
  games, boards), `allEqual`, `percentile` (100 × (better + tiedOthers ÷ 2)
  ÷ (total − 1), best 0%; 50 for constant non-time values), and `helpText`
  (the definition, then the standing sentence with that arithmetic).
  `boardTraitRankProfile` (game/game-data-chart.js) ranks this board's
  scalar traits against every earlier board and against the session's
  boards through the same `rankedRow`, side `board`, scopes `lifetime` and
  `session`, and adds `example` (the miniature board's id, or undefined).
- Calculations: each catalog entry's `explain(record, params, value)` and
  each board trait's `explain(record)` (`BOARD_METRIC_TABLES` and the shape
  families in game/rankings.js) print this game's worked calculation from
  its stored fields; `addDistributions` puts it on the lifetime row as
  `calculation`. The share traits also declare `step(record)`, one safe
  cell (`boardShareStep`).
- Distributions: `GameData.addDistributions(poolRows, valuesByScope,
  sessionValues, format, calculation, step)` gives each row `distribution`
  on one axis per measurement (`axisOf`): a discrete measurement (whole
  values, found from the data, or a declared `step`) bins whole groups of
  possible values, one per bin up to 60 values, otherwise `perBin` values per
  bin for about 36 bins, centered; continuous measurements get 36 bins. The
  range is the lifetime 1st–99th percentiles when wider than 60 values,
  always including this game and the session values. Each distribution has
  `lo`, `hi`, `bins`, `step` (null when continuous), `perBin`, `counts`,
  `standing` per bin (the mean percentile of the bin's games, ties sharing
  their mean rank; null when empty), `outside` (values beyond the axis,
  counted but never drawn into an edge bin), `labels` (at most six round
  values, `axisLabels`), `binText` (what one bar covers), and, for a pool of
  at most `DOT_POOL` (30) games, its sorted `values`. The lifetime row also
  carries `sessionValues` for the lifetime card's session ticks.
- All of this runs in the analysis worker's `game-data` job
  (analysis-worker.js), which posts plain rows; the page never computes
  ranks or histograms. `buildBoardTimeRankProfile(record, records)` owns a
  view generation so a slower reply cannot replace a newer view.
- Band: `gameDataItems` groups rows into one item per measurement with a row
  per pool. `buildGameDataBand(rows, pool, valuesShown, sideHelp)` builds
  `.game-data-row` buttons (cells `.game-data-name`, `.game-data-value`,
  `.game-data-pct` with `data-pool`); both sides plot `pool`, and an item
  without that pool's row goes into the `.game-data-unplotted` note. Side
  titles are `chartHelpButton` labels holding `sideHelp`. `layout()`
  measures every column at scale 1 (`measure`), computes each plan's needed
  width and height (`geometry`: side by side with both pool columns, with
  one (`data-pool-columns="1"`), stacked with two, stacked with one), takes
  the plan with the largest fit (min of 1, width ratio, height ratio; the
  earlier plan on a tie), and sets `--game-data-scale` on the band, re-
  measuring until it fits. Band text sizes are ems of the band's font, and
  the bar, leader, and gap constants are multiplied by the scale, so the
  band (overflow hidden) never scrolls. Titles center over their side's
  columns. `boardTraitLabelLayout` fits rows to exact percentile points;
  leaders and `.game-data-dot` mark each point. `standingColor`
  interpolates `STANDING_BAR_STOPS` (bar) or `STANDING_MARK_STOPS`
  (histogram marks, chips): green, neutral, red.
- Card: `fillGameDataCard(tip, item, scope)` fills the shared help tip for
  one pool (the band passes the points switch's pool; a distributions row
  passes its section's): title, definition, `calculation`,
  `gameDataExampleBoard(example)`, direction, the pool's standing sentence,
  `gameDataHistogram(row, true)`, the key, the time card's day sentence, and
  the linked chart. The tip is the one owned manual popover, so it never
  reflows the page. `gameDataHistogram` draws bars, or for a row whose
  distribution carries `values`, one dot per game at its value, stacked
  where dots touch and colored by that game's standing in the pool; card
  size adds the "better" end and round labels. `GAME_DATA_EXAMPLE` is the
  fixed 8 × 6 board; its captions' counts are computed from it.
- Distributions view: `buildGameDataDistributions(rows)` renders the
  `settings.gameDataDistributions` mode as `.game-data-dist-section`s in one
  `.game-data-distributions` grid with subgrid rows, so every strip shares
  one column, and returns `layout()`, which fits the view by lowering
  `--game-data-strip` from 26 px to 10 px, then `--game-data-scale`.
  `observeFit` reruns either view's layout on every resize.
- Options: one `.game-data-controls` row under the chart view: the
  `.game-data-pool-switch` buttons (`settings.gameDataBandPool`, hidden in
  distributions mode), the "show distributions" and "show values"
  checkboxes (`data-option`), and the "configure" and "session history"
  openers (`data-view`, which returning focuses). Subviews start with a
  `figcaption` back button and end with another.
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
- Checks: tests/game-data-test.js (rows, standing arithmetic, calculations,
  ties, standing, binning of whole and share values, labels), tests/recent-
  placements-test.js (board-trait pools, share bins, calculations),
  tests/session-buckets-test.js, and tests/board-time-profile-browser-check.js
  (no heading, options row, centered titles, no scrolling at five widths,
  regular-weight numbers, no help cursor, cards in both pool modes with dots,
  distributions fit, linkage, one picker, configuration).

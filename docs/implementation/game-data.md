# Game data — implementation notes

Spec: [docs/product/game-data.md](../product/game-data.md). Index: [AGENTS.md](../../AGENTS.md).

- Game data (2026-09-23, band rebuilt 2026-10-07, panel and cards revised 2026-10-08): [complete design and removed-field inventory](../product/game-data.md).
  `game-data.js` owns shared metric formulas, the GameData catalog (one
  `name`, `format`, direction, and `allOutcomes` per measurement, and a
  `help` definition only where the name and unit leave it open), rows,
  history, domain, and SessionScope choices/bounds/records. Board traits
  keep their table `help(record)` in `BOARD_METRIC_TABLES` and the shape
  families (game/rankings.js), since the "This board" tables show it;
  `selfEvident: true` (3BV, max number, zeros) keeps its first line off the
  game data card.
  `settings-core.js` depends on it.
- Rows: `GameData.rows(record, records, preferences, params)` ranks every
  chosen measurement (`preferences.gameDataMetrics`) against lifetime and the
  session (the trailing-24-hours `day` pool and its `gameDataDayTime`
  preference were removed 2026-10-08).
  `GameData.rankedRow` omits a pool with fewer than two eligible measured
  games (2026-09-26). A row carries `id` (`metricId.scope`), `metricId`,
  `scope` (`lifetime`, `session`), `name`, `value`, `valueText`,
  `rank`, `firstRank`/`lastRank` (a tie's span), `better` (other games
  ranked better, an equal time set earlier included), `tiedOthers` (other
  games with an equal value; always 0 for time), `total`, `counted` (wins,
  games, boards), `allEqual`, `percentile` (100 × (better + tiedOthers ÷ 2)
  ÷ (total − 1), best 0%; 50 for constant non-time values), `definition`
  (the catalog `help`, undefined for a self-evident measurement), and
  `standingText`, the rank alone ("19th of 1,201 wins", "tied 3rd–5th of
  56 games", "all 50 boards have this value"): no pool description and no
  arithmetic (creator 2026-10-08).
  `boardTraitRankProfile` (game/game-data-chart.js) ranks this board's
  scalar traits against every earlier board and against the session's
  boards through the same `rankedRow`, side `board`, scopes `lifetime` and
  `session`, its definition `help(record)[0]` unless `selfEvident`. The
  share traits also declare `step(record)`, one safe cell
  (`boardShareStep`).
- Distributions: `GameData.addDistributions(poolRows, valuesByScope,
  sessionValues, format, step)` gives each row `distribution`
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
  values, `axisLabels`), `binText` (what one bar covers, a sentence such as
  "Each bar spans 4 values."), and, for a pool of
  at most `DOT_POOL` (30) games, its sorted `values`. The lifetime row also
  carries `sessionValues` for the lifetime card's session ticks.
- All of this runs in the analysis worker's `game-data` job
  (analysis-worker.js), which posts plain rows; the page never computes
  ranks or histograms. `buildBoardTimeRankProfile(record, records)` owns a
  view generation so a slower reply cannot replace a newer view.
- Band: `gameDataItems` groups rows into one item per measurement with a row
  per pool. `buildGameDataBand(rows, pool, valuesShown)` builds
  `.game-data-row` buttons (cells `.game-data-name`, `.game-data-value`,
  `.game-data-pct` with `data-pool`); both sides plot `pool`, and an item
  without that pool's row goes into the `.game-data-unplotted` note. Side
  titles are `chartHelpButton` labels holding `GAME_DATA_SIDE_HELP[side]`,
  which says only what that side's percentages are. `layout()`
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
  passes its section's) with only what the row does not show: the pool's
  label and `standingText` (`.game-data-card-standing`),
  `gameDataHistogram(row, true)`, a one-line key (`binText` or "One dot per
  win.", the session ticks, the green line, games not drawn), and last the
  `definition` when there is one. The tip is the
  one owned manual popover, so it never reflows the page. The chart chip's
  `title` is the same pool label and `standingText`. `gameDataHistogram`
  draws bars, or for a row whose distribution carries `values`, one dot per
  game at its value, stacked where dots touch and colored by that game's
  standing in the pool; card size adds the "better" end and round labels.
- Distributions view: `buildGameDataDistributions(rows, pools)` renders the
  `settings.gameDataDistributions` mode as `.game-data-dist-section`s
  (`data-side`, `data-pool`), each side's sections in `pools` order
  (`settings.gameDataDistributionPools`: `['lifetime']`, `['session']`, or
  both), in one `.game-data-distributions` grid with subgrid rows, so every
  strip shares one column. Without lifetime it opens with
  `gameDataUnrankedNote(items)`, the band's session note. It returns
  `layout()`, which fits the width with `--game-data-scale`, then binary
  searches `--game-data-strip` for the tallest strip whose content fits the
  box's height, shrinking `--game-data-scale` only when 10 px strips
  overflow. The content height is measured from the first child to the key:
  the box's height comes from its column, and `scrollHeight` never reports
  less than the box. When the height changed, `layout` redraws every strip
  with `gameDataHistogram(row, false, stripPx)`, whose vertical units are px
  (marks at full size from `GAME_DATA_STRIP_FULL_MARKS`, 26 px, up).
  `observeFit` reruns either view's layout on every resize.
- Options: one `.game-data-controls` row under the chart view: the
  `.game-data-pool-switch` from `poolSwitch(label, field, choices)`
  ("points" for `settings.gameDataBandPool` under the band, "sections" for
  `settings.gameDataDistributionPools` under the distributions), the "show
  distributions" and "show values" checkboxes (`data-option`), and the
  "configure" and "session history" openers (`data-view`, which returning
  focuses). Subviews start with a `figcaption` back button and end with
  another.
- Chart linkage: `buildAverageScatter(spec, model, gameDataRows)` sets
  `data-measurement` from the spec's `measurementId` and adds
  `gameDataChartChip(row)` for the lifetime row; `renderRanks` awaits the
  game-data job before building charts so the chips exist. Hover and focus
  on a band or distribution row call `linkGameDataCharts`, which toggles
  `.game-data-linked` on those charts: a `--this-game` ring with black edges
  (two box-shadows plus a 1px outline, so it never reflows). The histogram's
  this-game mark is two lines, `.game-data-histogram-this-edge` (black,
  wider) under `.game-data-histogram-this` (`--this-game`).
- Configuration: one checkbox per measurement plus "all performance
  measurements". Preferences: `gameDataMetrics`
  (one map; `gameDataMetricsFromStored` carries over the former
  `gameDataLifetimeMetrics`/`gameDataSessionMetrics`, a measurement shown in
  either staying shown), `gameDataBandPool`, `gameDataDistributions`,
  `gameDataDistributionPools`, and `gameDataShowValues`, all in the shared
  persistent schema.
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
- Checks: tests/game-data-test.js (rows, ties, rank text without pool
  descriptions or arithmetic, which measurements have definitions and how
  long they are, binning of whole and share values, labels), tests/recent-
  placements-test.js (board-trait pools, share bins, definitions),
  tests/session-buckets-test.js, and tests/board-time-profile-browser-check.js
  (no heading, options row, centered titles, no scrolling at five widths,
  regular-weight numbers, no help cursor, cards in both pool modes opening
  with the rank, dots, distributions fit, linkage, one picker,
  configuration).

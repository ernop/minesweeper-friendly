# Game data — implementation notes

Spec: [docs/product/game-data.md](../product/game-data.md). Index: [AGENTS.md](../../AGENTS.md).

- Game data (2026-09-23, band rebuilt 2026-10-07, panel and cards revised 2026-10-08): [complete design and removed-field inventory](../product/game-data.md).
  `game-data.js` owns shared metric formulas, the GameData catalog (one
  `name`, `format`, direction, and `allOutcomes` per measurement, and a
  `help` definition only where the name and unit leave it open), rows,
  history, domain, and SessionScope choices/bounds/records. A board trait's
  definition is `BOARD_TRAIT_DEFINITIONS[id]` (game/rankings.js, beside
  `BOARD_TRAIT_NAMES`); its "This board" table's `help(record)` in
  `BOARD_METRIC_TABLES` or the shape families opens with it. 3BV, max
  number, and zeros have no entry, so their cards and configure rows show
  none, and their tables keep their own help.
  `settings-core.js` depends on it.
- Rows: `GameData.rows(record, records, preferences, params)` ranks every
  chosen measurement (`preferences.gameDataMetrics`) against lifetime and the
  session (the trailing-24-hours `day` pool and its `gameDataDayTime`
  preference were removed 2026-10-08). `params` is the game's board `config`
  (STNB and unflagged mine share read it; callers always pass it). A
  catalog measurement whose values are a share of a fixed count declares
  `step(params)`, passed to `addDistributions` (unflagged mine share: one
  mine, `1 / params.mines`).
  `GameData.rankedRow` omits a pool with fewer than two eligible measured
  games (2026-09-26). A row carries `id` (`metricId.scope`), `metricId`,
  `scope` (`lifetime`, `session`), `name`, `value`, `valueText`,
  `rank`, `firstRank`/`lastRank` (a tie's span), `better` (other games
  ranked better, an equal time set earlier included), `tiedOthers` (other
  games with an equal value; always 0 for time), `total`, `allEqual`,
  `percentile` (100 × (better + tiedOthers ÷ 2) ÷ (total − 1), best 0%; 50
  for constant non-time values), `definition` (the catalog `help`,
  undefined for a self-evident measurement), and `standingText`, the rank
  alone ("19th of 1,201 wins", "tied 3rd–5th of 56 games", "all 50 boards
  have this value"), its population word `rankedRow`'s `counted` argument
  (wins, games, boards): no pool description and no arithmetic (creator
  2026-10-08).
  `boardTraitRankProfile` (game/game-data-chart.js) ranks this board's
  scalar traits against every earlier board and against the session's
  boards through the same `rankedRow`, side `board`, scopes `lifetime` and
  `session`, its definition `BOARD_TRAIT_DEFINITIONS[measurementId]`. The
  share traits also declare `step(record)`, one safe cell
  (`boardShareStep`). The worker's `game-data` job passes it the
  `boardMetricCandidates` and `boardShapeCandidates` comparisons whose
  `measurementId` is on in `preferences.gameDataBoardTraits` (the has-7/8
  and max-number-cap families have none); the This board table switches
  no longer enter (2026-10-14).
- Distributions: `GameData.addDistributions(poolRows, valuesByScope,
  format, step)` gives each row `distribution`
  on one axis per measurement (`axisOf`): a discrete measurement (whole
  values, found from the data, or a declared `step`) bins whole groups of
  possible values, one per bin up to 60 values, otherwise `perBin` values per
  bin for about 36 bins, centered; continuous measurements get 36 bins. The
  range is `drawnRange`: the Tukey fence Q1 − 1.5·IQR through Q3 + 1.5·IQR
  of the lifetime values, tightened to the most extreme values still inside
  it. Fewer than 8 values keep the full range. A zero interquartile range
  uses the narrowest window holding 90% of the values. This game does not
  extend it; `gameDataStrip` clamps the pin past the fence to the strip's
  edge. Bar height is `count / most` of the
  strip; when the tallest bar is at least 6× the next, that next bar is
  drawn at half height and shorter bars keep their ratios to it. Each distribution has
  `lo`, `hi`, `bins`, `step` (null when continuous), `perBin`, `counts`,
  `standing` per bin (the mean percentile of the bin's games, ties sharing
  their mean rank; null when empty; values beyond the axis are never drawn
  into an edge bin), `labels` (at most six round values, `axisLabels`),
  and, for a pool of at most `DOT_POOL` (30) games, its sorted `values`.
  Until 2026-10-20 the lifetime row also carried `sessionValues` for
  session ticks under its axis.
- All of this runs in the analysis worker's `game-data` job
  (analysis-worker.js), which posts plain rows; the page never computes
  ranks or histograms. `buildBoardTimeRankProfile(record, records)` owns a
  view generation so a slower reply cannot replace a newer view.
- Board name: none in either view since 2026-10-20 (the preset links show
  the board). Pool text everywhere is `gameDataPoolLabel(scope)`.
- Band: `gameDataItems` groups rows into one item per measurement with a row
  per pool. `buildGameDataBand(rows, pool, valuesShown, titles)`
  builds `.game-data-row` buttons (cells `.game-data-name`,
  `.game-data-value`, `.game-data-pct` with `data-pool`) under
  `.game-data-column-heads`; both `.game-data-name` heads are empty. Both sides plot `pool`, and an
  item without that pool's row goes into the `.game-data-unplotted` note.
  Side titles (`titles`, one per side with rows) come from
  `gameDataSideTitle`: a `.game-data-side-title` holding a
  `.stat-section-toggle` that flips `settings.panels.gamePerformance` or
  `.boardTraits` (`GAME_DATA_SIDES`, `gameDataSideOpen`); no (?) since
  2026-10-20. `layout()` reads the open state each time: the drawn
  sides are the open ones with plotted rows, and the note and the zoom
  domain come from them. With none drawn the titles share one wrapping
  `.game-data-titles` line. Otherwise it measures every column at scale 1
  (`measure`; a closed side measures only its title), computes each plan's
  needed width and height (`geometry`: side by side with both pool columns,
  with one (`data-pool-columns="1"`), and, with both sides drawn, stacked
  with two, stacked with one; a closed side's span is its title's width,
  and a title wider than its columns adds its overhang on both sides),
  takes the plan with the largest fit (min of 1, width ratio, height ratio;
  the earlier plan on a tie), and sets `--game-data-scale` on the band,
  re-measuring until it fits. Band text sizes are ems of the band's font,
  and the bar, leader, and gap constants are multiplied by the scale, so the
  band (overflow hidden) never scrolls. Titles center over their side's
  columns; a closed side's title sits beside the bar on its side. Laying out
  moves the band's nodes, so `restoreGameDataFocus` gives the focus back to
  the toggle or row that held it. `boardTraitLabelLayout` fits rows to exact percentile points;
  leaders and `.game-data-dot` mark each point. `standingColor`
  interpolates `STANDING_BAR_STOPS` (bar) or `STANDING_MARK_STOPS`
  (histogram marks, chips): green, neutral, red.
- Strip: `gameDataStrip(row, width, height, scale)` draws one pool's
  distribution as an SVG of exactly `width` x `height` px; `GAME_DATA_STRIP`
  holds its sizes in px at scale 1 (pin 5, minimum plot 7, tick 3, label
  9, dots 8 down to `smallestDot` 4, bars at most `barWidest` 24), and
  `GAME_DATA_STRIP_SHORTEST` (25) is the shortest strip. A distribution
  carrying `values` draws one dot per game, stacked where dots touch,
  shrinking the dots to fit the plot; when even 4 px dots overflow, and
  for every larger pool, it draws the bars. This game's dot, or the bin
  holding its value, is `.game-data-strip-this` (`--this-game` fill, black
  stroke) under `.game-data-strip-pin`. Tick labels sit at the
  distribution's `labels`, measured with `chartTextWidth`; a label whose
  box comes within 6 px (at scale 1) of the last drawn one is skipped with
  its tick. For a `higher` row its `x` runs from `hi` at the left to `lo`
  and bin `i` takes slot `bins − 1 − i`, so every strip has its better end
  on the left (2026-10-11); the worker's distributions keep value order.
- Card: `fillGameDataCard(tip, item, scope, withStrip)` fills the shared
  help tip for one pool (the band passes the points switch's pool and
  `withStrip`; a distributions row passes its section's, without the
  strip it already shows) with only what the row does not show: the pool's
  label and `standingText` (`.game-data-card-standing`), the strip at
  `GAME_DATA_CARD_STRIP` (314 x 72) when `withStrip`, the example board
  and its key, and last the `definition` when there is one; no key line for
  the strip (removed 2026-10-08). The tip is the one owned manual popover,
  so it never reflows the page. The chart chip's `title` is the same pool
  label and `standingText`.
- Example boards: `requestGameDataExamples(record)`, called when
  `buildBoardTimeRankProfile` builds a win's panel, sets `gameDataGameId`
  and, when `duringGameAvailable(record)` and the game is not an Endgame
  drill, asks the reports worker's `game-data-examples` task once per game
  (`{gameId, timeMs, outcome}`; the worker reads its held
  `duringGameSource` and model, as the live perf charts do, and returns
  `GameData.examples(width, height, mines, play)`). `GameData.examples`
  (game-data.js) measures the board with `BoardMetrics.board`,
  `BoardShape.islands`, and `Zini.ziniActions`/`hziniActions` (each
  action's `kind` and row-major `cell`), and, when the trace has recorded
  decisions, takes misclicks, no-op clicks, and unused flags from the
  model's events and the flags standing at the end from the last decision
  (`standingFlags` in analysis-worker.js). `gameDataExampleFor(item)` maps a
  performance measurement to its example (`GAME_DATA_EXAMPLE_OF`) and a
  board trait to its own, and answers only while the examples are the shown
  panel's game and the page still holds that game's board
  (`duringGameSourceId`). `gameDataExampleBoard(example)` copies
  `finishedBoardCells()` into a `.game-data-example-board` grid at its own
  `--cell-size` (`GAME_DATA_EXAMPLE_FIT`), painting each uncovered mine
  without a flag (`cells[i].mine`) as `mineSvg(settings.mineStyle)`, and
  marks squares with `.game-data-example-shade` (the square's background),
  `.game-data-example-ring` (`::after`), or a `.game-data-example-dot-mark`
  child; 3BV spread adds a `.game-data-example-spread` SVG of its work
  points and spread circle. `GAME_DATA_EXAMPLE_COUNTS` builds the key
  (`gameDataExampleKey`), with `countPhrase` (game/charts.js) for nouns.
- Distributions view: `buildGameDataDistributions(rows, pools, titles)`
  renders the `settings.gameDataDistributions` mode as each side's
  `.game-data-side-title` on a line of its own spanning the grid, then,
  while that side is open, its `.game-data-dist-section`s (`data-side`,
  `data-pool`) in `pools` order (`settings.gameDataDistributionPools`:
  `['lifetime']`, `['session']`, or both). Each section opens with a
  `.game-data-dist-head` whose name and strip cells are empty and whose
  value and percent cells read "value" and the pool label (0.9167em bold).
  Everything sits in one
  `.game-data-distributions` grid with subgrid rows, so every strip of both
  sides shares one column. `arrange()` rebuilds the children only when a
  side opens or closes; without lifetime they open with
  `gameDataUnrankedNote` over the open sides' items, the band's session
  note. It returns `layout()`, which arranges, fits the width with
  `--game-data-scale`, then binary searches `--game-data-strip` for the
  tallest strip whose content fits the box's height, shrinking
  `--game-data-scale` only when the shortest strip overflows; while it
  shrinks the strip stays at `GAME_DATA_STRIP_SHORTEST` times the scale.
  The content height
  is measured from the box's top to the last child (the last section, whose
  bottom margin is zero, or a closed side's title): the box's height comes
  from its column, and `scrollHeight` never reports less than the box.
  `draw(strip, scale)` then measures the strip column's width (every strip
  shares it) and redraws each open side's strip whose drawn width, height,
  or scale differs with `gameDataStrip`. `.game-data-strip` clips its SVG,
  so a strip drawn for a wider column cannot widen the grid before the
  next layout redraws it.
  `observeFit` reruns either view's layout on every resize. Both views sit
  in one `.game-data-section`, `open` while either side is open, with
  `data-open-sides` for `fitGameDataToSidebar`; a toggle refits the column
  and lays the view out at once.
- Options: one `.game-data-controls` row under the chart view: the
  `.game-data-pool-switch` from `poolSwitch(label, field, choices)`
  ("points" for `settings.gameDataBandPool` under the band, "pools" for
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
  (two box-shadows plus a 1px outline, so it never reflows). Rows take no
  hover background (2026-10-20); `:focus-visible` keeps a 1px outline.
- Configuration: `selectionList(title, allLabel, nameHead, field, entries)`
  builds one list per side, each an "all …" checkbox over a table with one
  checkbox per entry (`aria-label` its name) and the name as a
  `chartHelpButton` where the entry has a definition: performance
  measurements (`gameDataMetrics`, entries `GameData.metrics`), then board
  traits (`gameDataBoardTraits`, ids in `GAME_DATA_BOARD_TRAIT_DEFAULTS`
  order, names `BOARD_TRAIT_NAMES`, definitions `BOARD_TRAIT_DEFINITIONS`).
  Any change sets `rows = null`, so the chart asks the worker again. With
  no rows and nothing on in either map, the chart's note names that
  instead of the two-game minimum. Preferences: `gameDataMetrics`
  (one map; `gameDataMetricsFromStored` carries over the former
  `gameDataLifetimeMetrics`/`gameDataSessionMetrics`, a measurement shown in
  either staying shown), `gameDataBoardTraits` (settings-core.js; defaults
  `GAME_DATA_BOARD_TRAIT_DEFAULTS`; a stored profile without it starts
  from its stored `shownThings` through `gameDataBoardTraitsFromStored`:
  `exact3BV`, `exactZiNi`, `exactMaxNumber`, `exactHZiNi`,
  `workSpreadTable`, `zeroOneShareTable`, `zeroOpeningTable`;
  `boardShapeTables` for islands and zeros, and with `largestIsland` for
  largest island), `gameDataBandPool`, `gameDataDistributions`,
  `gameDataDistributionPools`, and `gameDataShowValues`, all in the shared
  persistent schema.
- Session: `SessionScope.defaultId` ('today') is the one default: the
  settings schema and `GameData.defaultsForView` both read it.
  The only picker is the static `#session-definition-select` (accessible
  name "session") in `#top-bar`; `initSessionScopeSelect` fills its options
  from `SessionScope.choices` and enables it during `init`. `setSessionDefinition`
  saves it and dispatches `session-scope-change` to every
  `[data-session-scope-view]` node (game data, the session summary, and ranks
  won), which rebuild in place without rebuilding the board. Historical pages
  derive twenty overlapping session windows at a time from primary records;
  no stored aggregates.
- Checks: tests/game-data-test.js (rows, ties, rank text without pool
  descriptions or arithmetic, which measurements have definitions and how
  long they are, binning of whole and share values, labels), tests/recent-
  placements-test.js (board-trait pools, share bins, definitions),
  tests/session-buckets-test.js, tests/chart-captions-test.js (no shipped
  text narrates chart marks), and tests/board-time-profile-browser-check.js
  (no heading, options row, centered titles, no scrolling at five widths,
  regular-weight numbers, no help cursor, cards in both pool modes opening
  with the rank and holding no key, dots, every strip and card running green
  to red from left to right with a higher-is-better card's labels
  descending, distributions fit with nothing but sections and the note,
  linkage, one picker, configuration, including the board-trait list, its
  independence from the table switches, and the nothing-chosen note), and
  tests/settings-state-test.js (`gameDataBoardTraits` defaults and the
  carryover from `shownThings`).

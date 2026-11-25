# Game data — implementation notes

Spec: [docs/product/game-data.md](../product/game-data.md). Index: [AGENTS.md](../../AGENTS.md).

- Game data (2026-09-23, band rebuilt 2026-10-07, panel and cards revised 2026-10-08, unified to one comparison pool 2026-11-23): [complete design and removed-field inventory](../product/game-data.md).
  `game-data.js` owns shared metric formulas, `startOfDay`, the board-trait
  grouping helpers (`boardFractionOf`, `boardShareGroup`, `boardSpreadGroup`,
  `BOARD_TRAIT_NAMES`), the GameData catalog (one `name`, `format`,
  direction, and `allOutcomes` per measurement, and a `help` definition only
  where the name and unit leave it open; every surface reads it,
  [measurement catalog](measurement-catalog.md)), the unified comparison pool
  registry (`GameData.pools`, `GameData.DEFAULT_POOL = 'all'`, `poolSpec`,
  `isValidPool`, `timeWindowStart`, `boardMatchSpec`, `boardTraitPoolId`,
  `poolAt`), rows, history, domain, and SessionScope choices/bounds/records.
  `game/rankings.js` reads `startOfDay`, `GameData.timeWindowStart`, and
  `GameData.boardMatchSpec` so rank windows and This board tables share the
  exact boundaries and buckets with game data. A board trait's definition is
  `BOARD_TRAIT_DEFINITIONS[id]` (game/rankings.js); its "This board" table's
  `help(record)` in `BOARD_METRIC_TABLES` or the shape families opens with
  it. 3BV, max number, and zeros have no entry, so their cards and configure
  rows show none, and their tables keep their own help. `settings-core.js`
  depends on `game-data.js`.
- Per-minute and report rows (2026-10-20): `perMinute(field)` and
  `actionRate(read)` beside `perSecond` build the nine optional rows.
  Records reach the worker as `analysisRecord` facts, which carry no
  evaluation ledger, so a catalog entry with `actionSummary: true` reads
  `r.actionSummary` instead: `gameDataAnalysisRecords(records, metricIds)`
  (game/game-data-chart.js) attaches it only when such a measurement is
  among `metricIds`, from `gameDataActionSummary(record)`, memoized per
  record in a WeakMap: `actionCategorySummary(record.actionEvaluations)`,
  or none when any evaluation's `actionEvaluationCategory` is
  `measurementNotes` (pre-ledger games normalize to a legacy coverage
  evaluation, which is one). The game data task passes the shown
  measurements; the session history task passes its one measurement.
- Rows: `GameData.rows(record, records, preferences, params, referenceMs)`
  resolves the chosen base pool (`preferences.gameDataPool`: `'all'`,
  `'session'`, a time window `'past-hour'` / `'today'` / `'past-week'` /
  `'calendar-month'` / `'calendar-year'` / `'rolling-year'`, or a
  board-match pool `'board:<traitId>'`) and any extra scoped rows
  (`preferences.gameDataScopedRows`, array of `{metric, pool}` pairs, added
  2026-11-24) via a cached `GameData.poolAt` lookup. For each catalog
  measurement in order, it emits the base row (when enabled in
  `preferences.gameDataMetrics`) followed by any scoped rows for that
  measurement in canonical `GameData.pools` order, suppressing a scoped row
  whose `pool` equals `preferences.gameDataPool` while the base row is also
  shown. Scoped rows set `scoped: true` and `name: spec.name + ' · ' +
  poolLabel`, and carry their own `scope`, `poolLabel`, and `distribution`
  (board-match scoped rows draw on their own axis; time-window scoped rows
  share the cached all-games values for their axis). `params` is the game's
  board `config` (STNB and unflagged mine share read it; callers always pass
  it). A catalog measurement whose values are a share of a fixed count
  declares `step(params)`, passed to `addDistribution` (unflagged mine share:
  one mine, `1 / params.mines`).
  `GameData.rankedRow` omits a measurement with fewer than two eligible
  measured games in the pool (2026-09-26). A row carries `id`
  (`metricId.scope`), `metricId`, `scope`, `poolLabel`, `name`, `value`,
  `valueText`, `rank`, `firstRank`/`lastRank` (a tie's span), `better`
  (other games ranked better, an equal time set earlier included),
  `tiedOthers` (other games with an equal value; always 0 for time), `total`,
  `allEqual`, `percentile` (100 × (better + tiedOthers ÷ 2) ÷ (total − 1),
  best 0%; 50 for constant non-time values), `definition` (the catalog
  `help`, undefined for a self-evident measurement), `standingText` ("19th of
  1,201 wins", "tied 3rd–5th of 56 games", "all 50 won boards have this
  value"), and `compactRankText` ("1st / 29", "2nd / 29 (tie)", "all 50" —
  farthest-up competition ordinal with trailing `(tie)` on ties, 2026-11-25).
  `GameData.formatPercentile(percentile)` formats tail-aware percentages
  (2026-11-24: `0%` strictly for `0`, `100%` strictly for `100`, one
  significant tail digit inside `(0, 1)` and `(99, 100)`, rounded integer in
  `[1, 99]`). `GameData.domain(rows)`, `GameData.barFraction(p, domain)`, and
  `GameData.barTicks(domain, plotHeight, scale)` own the symmetric regularized
  logit bar scale (`BAR_LOGIT_EPSILON = 0.1`), logit-space autozoom, and
  priority-ordered non-overlapping bar ticks (`1st`, `last`, and milestone `%`).
  `boardTraitRankProfile(record, comparisons, records, poolId,
  sessionDefinition, referenceMs)` (game/game-data-chart.js) ranks this
  board's scalar traits through the same `rankedRow`, side `board`, against
  won boards (`allOutcomes: false`, `counted = 'won boards'`, filtering
  distribution values to `outcome === 'win'`, creator 2026-11-24), using
  `GameData.boardTraitPoolId(poolId)` (`poolId` for `'all'` and time windows;
  `'all'` whenever a board-match pool is picked), its definition
  `BOARD_TRAIT_DEFINITIONS[measurementId]`. The share traits also declare
  `step(record)`, one safe cell (`boardShareStep`). The worker's `game-data`
  job passes it the `boardMetricCandidates` and `boardShapeCandidates`
  comparisons whose `measurementId` is on in `preferences.gameDataBoardTraits`
  (the has-7/8 and max-number-cap families have none); the This board table
  switches no longer enter (2026-10-14).
- Distributions: `GameData.addDistribution(row, values, axisValues, format,
  step)` gives a row `distribution` on `axisOf(axisValues, step)`: time
  windows (including session) pass the all-games values as `axisValues` so
  their strips sit on the all-games axis; board-match pools pass their own
  `values` so a narrow same-3BV pool fills its strip. A discrete measurement
  (whole values, found from the data, or a declared `step`) bins whole groups
  of possible values, one per bin up to 60 values, otherwise `perBin` values
  per bin for about 36 bins, centered; continuous measurements get 36 bins.
  The range is `drawnRange`: the Tukey fence Q1 − 1.5·IQR through
  Q3 + 1.5·IQR of `axisValues`, tightened to the most extreme values still
  inside it. Fewer than 8 values keep the full range. A zero interquartile
  range uses the narrowest window holding 90% of the values. This game does
  not extend it; `gameDataStrip` clamps the pin past the fence to the strip's
  edge. Bar height is `count / most` of the strip; when the tallest bar is at
  least 6× the next, that next bar is drawn at half height and shorter bars
  keep their ratios to it. Each distribution has `lo`, `hi`, `bins`, `step`
  (null when continuous), `perBin`, `counts`, `standing` per bin (the mean
  percentile of the bin's games, ties sharing their mean rank; null when
  empty; values beyond the axis are never drawn into an edge bin), `labels`
  (at most six round values, `axisLabels`), and, for a pool of at most
  `DOT_POOL` (30) games, its sorted `values`.
- All of this runs in the analysis worker's `game-data` job
  (analysis-worker.js), which posts plain rows; the page never computes
  ranks or histograms. `buildBoardTimeRankProfile(record, records)` owns a
  view generation so a slower reply cannot replace a newer view.
- Board name: none in either view since 2026-10-20 (the preset links show
  the board). Pool text everywhere is `gameDataPoolLabel(row.scope,
  row.poolLabel)` (`'no-mark'`, `'no-mark session'`, or `'<label> · no-mark'`
  for a no-mark win).
- Band: `buildGameDataBand(rows, valuesShown, titles)` builds one
  `.game-data-row` button per row without side `%` columns (2026-11-24):
  performance rows hold `.game-data-name` and `.game-data-value` (using
  `gameDataDisplayValue` so scoped rows show `compactRankText` when their base
  measurement is also shown, else `valueText`) under `[poolLabel, "value"]`;
  board-trait rows hold `.game-data-name`, `.game-data-value`, and
  `.game-data-rank` (`compactRankText`, left-aligned with trailing `(tie)`
  rendered smaller in `.game-data-tie`) under `[won-boards pool label, "value",
  "rank"]`. Side titles (`titles`, one per side with rows) come from
  `gameDataSideTitle`: a `.game-data-side-title` holding a
  `.stat-section-toggle` that flips `settings.panels.gamePerformance` or
  `.boardTraits` (`GAME_DATA_SIDES`, `gameDataSideOpen`); no (?) since
  2026-10-20. `layout()` reads the open state each time: the drawn sides are
  the open ones with rows, and the logit zoom domain (`GameData.domain`) comes
  from them. With none drawn the titles share one wrapping `.game-data-titles`
  line. Otherwise it measures every column at scale 1 (`measure`; a closed side
  measures only its title), computes each plan's needed width and height
  (`geometry`: side by side around one bar, and, with both sides drawn,
  stacked; a closed side's span is its title's width, and a title wider than
  its columns adds its overhang on both sides), takes the plan with the largest
  fit (min of 1, width ratio, height ratio; side-by-side on a tie), and sets
  `--game-data-scale` on the band, re-measuring until it fits. Band text sizes
  are ems of the band's font, and the bar (`GAME_DATA_BAR_WIDTH = 40`), leader
  (`GAME_DATA_LEADER_WIDTH = 14`, stretched by up to `GAME_DATA_LEADER_EXTRA =
  440` across drawn sides to fill available horizontal width before centering
  any remainder), and gap constants are multiplied by the scale, so the band
  (overflow hidden) never scrolls. Titles center over their side's columns; a
  closed side's title sits beside the bar on its side (keeping the tight
  `g.leader` gap). Laying out moves the band's nodes, so `restoreGameDataFocus`
  gives the focus back to the toggle or row that held it.
  `boardTraitLabelLayout` fits rows to exact logit positions
  (`GameData.barFraction`); leaders (with a scaled label-side horizontal stub)
  and `.game-data-dot` mark each point, `rowMarks` spotlights the hovered or
  focused row's leader and dot via `data-row-focus` / `data-active`,
  `GameData.barTicks` draws non-overlapping `.game-data-decile` labels inside
  the bar, and `standingColor` interpolates `STANDING_BAR_STOPS` at
  `GAME_DATA_BAR_GRADIENT_ANCHORS` mapped by `GameData.barFraction` so green,
  white, and red keep their absolute percentile meaning on the non-linear bar.
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
- Card: `fillGameDataCard(tip, row, withStrip)` fills the shared help tip
  for the row's pool (the band passes `withStrip`; a distributions row passes
  `false`, without the strip it already shows) with only what the row does
  not show: the pool's label and `standingText` (plus `' · ' +
  gameDataPercentText(row)` when `withStrip`, since band rows omit `%`),
  the strip at `GAME_DATA_CARD_STRIP` (314 x 72) when `withStrip`, the
  example board and its key, and last the `definition` when there is one; no
  key line for the strip (removed 2026-10-08). The tip is the one owned
  manual popover, so it never reflows the page. The chart chip's `title` is
  the same pool label and `standingText`.
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
  `finishedBoardCells()` (the board's elements, or while the replay paints
  a frame its saved `{className, innerHTML}` copy, so it reads only those
  two; until 2026-10-26 it read `classList`, which the copy lacks, and a
  card opened with the replay away from the finished board threw) into a
  `.game-data-example-board` grid at its own
  `--cell-size` (`GAME_DATA_EXAMPLE_FIT`), painting each uncovered mine
  without a flag (`cells[i].mine`) as `mineSvg(settings.mineStyle)`, and
  marks squares with `.game-data-example-shade` (the square's background),
  `.game-data-example-ring` (`::after`), or a `.game-data-example-dot-mark`
  child; 3BV spread adds a `.game-data-example-spread` SVG of its work
  points and spread circle. `GAME_DATA_EXAMPLE_COUNTS` builds the key
  (`gameDataExampleKey`), with `countPhrase` (game/charts.js) for nouns.
- Distributions view: `buildGameDataDistributions(rows, titles)` renders the
  `settings.gameDataDistributions` mode as each side's
  `.game-data-side-title` on a line of its own spanning the grid, then, while
  that side is open, its one `.game-data-dist-section` (`data-side`,
  `data-pool`). Each section opens with a `.game-data-dist-head` whose name,
  value, strip, and percent cells read the pool label, `"value"`, empty, and
  `"%"` (0.9167em bold). Everything sits in one `.game-data-distributions`
  grid with subgrid rows, so every strip of both sides shares one column.
  `arrange()` rebuilds the children only when a side opens or closes. It
  returns `layout()`, which arranges, fits the width with
  `--game-data-scale`, then binary searches `--game-data-strip` for the
  tallest strip whose content fits the box's height, shrinking
  `--game-data-scale` only when the shortest strip overflows; while it
  shrinks the strip stays at `GAME_DATA_STRIP_SHORTEST` times the scale. The
  content height is measured from the box's top to the last child (the last
  section, whose bottom margin is zero, or a closed side's title): the box's
  height comes from its column, and `scrollHeight` never reports less than
  the box. `draw(strip, scale)` then measures the strip column's width (every
  strip shares it) and redraws each open side's strip whose drawn width,
  height, or scale differs with `gameDataStrip`. `.game-data-strip` clips its
  SVG, so a strip drawn for a wider column cannot widen the grid before the
  next layout redraws it. `observeFit` reruns either view's layout on every
  resize. Both views sit in one `.game-data-section`, `open` while either
  side is open, with `data-open-sides` for `fitGameDataToSidebar`; a toggle
  refits the column and lays the view out at once.
- Options: one `.game-data-controls` row under the chart view: the
  `.game-data-pool-select` `"compared with"` `.ui-select` from `poolSelect()`
  for `settings.gameDataPool` (grouping `all games` and `session`, then `time
  window`, then `this board`), the "show distributions" and "show values"
  checkboxes (`data-option`), and the "configure" and "session history"
  openers (`data-view`, which returning focuses). Subviews start with a
  `figcaption` back button and end with another.
- Chart linkage: `buildAverageScatter(spec, model, gameDataRows)` sets
  `data-measurement` from the spec's `measurementId` and adds
  `gameDataChartChip(row)` for the matching base (`!r.scoped`) row in
  `gameDataRows`; `renderRanks` awaits the game-data job before building
  charts so the chips exist. Hover and focus on a band or distribution row
  call `linkMeasurements([metricId], 'gameData', gameDataCrossLink(row))`,
  which toggles `.game-data-linked` on those charts (a `--this-game` ring with
  black edges — two box-shadows plus a 1px outline, so it never reflows), rings
  paired rows across the bar (`data-scoped-trait` performance rows ↔ matching
  `board` trait rows in both directions, creator 2026-11-24), and spotlights
  the measurement in the live perf charts; their lines and legend entries ring
  performance rows the same way
  ([measurement catalog](measurement-catalog.md), "Hover link"). Rows take
  no hover background (2026-10-20); `:focus-visible` keeps a 1px outline.
- Configuration: `selectionList(title, allLabel, nameHead, field, entries)`
  builds the `performance measurements` (`gameDataMetrics`, entries
  `GameData.metrics`) and `board traits` (`gameDataBoardTraits`, ids in
  `GAME_DATA_BOARD_TRAIT_DEFAULTS` order, names `BOARD_TRAIT_NAMES`,
  definitions `BOARD_TRAIT_DEFINITIONS`) lists, each with `data-config-section`.
  Between them sit `time in specific pools` (one-click checkboxes over
  `GameData.scopedPools` toggling `{metric: 'time', pool}` entries in
  `settings.gameDataScopedRows`, plus an `all time pools` toggle) and `other
  scoped measurements` (an inline measurement + pool `.ui-select` adder and
  removable list for any non-`time` metric × pool). Any change sets
  `rows = null`, so the chart asks the worker again. `gameDataAnalysisRecords`
  inspects both `gameDataMetrics` and `gameDataScopedRows` when attaching
  `actionSummary`, and `session-scope-change` invalidates `rows` whenever
  either `gameDataPool === 'session'` or a scoped row uses `'session'`. With
  no rows and nothing on in `gameDataMetrics`, `gameDataBoardTraits`, or
  `gameDataScopedRows`, the chart's note names that instead of the two-game
  minimum. Preferences: `gameDataMetrics` (one map; `gameDataMetricsFromStored`
  carries over the former `gameDataLifetimeMetrics`/`gameDataSessionMetrics`,
  a measurement shown in either staying shown, and renames the 2026-10-26 ids
  through `withCurrentMeasurementIds`), `gameDataBoardTraits` (settings-core.js;
  defaults `GAME_DATA_BOARD_TRAIT_DEFAULTS`; a stored profile without it
  starts from its stored `shownThings` through `gameDataBoardTraitsFromStored`:
  `exact3BV`, `exactZiNi`, `exactMaxNumber`, `exactHZiNi`, `workSpreadTable`,
  `zeroOneShareTable`, `zeroOpeningTable`; `boardShapeTables` for islands and
  zeros, and with `largestIsland` for largest island), `gameDataPool`
  (default `'all'`; `gameDataPoolFromStored` migrates retired
  `gameDataBandPool`/`gameDataDistributionPools`), `gameDataScopedRows`
  (default `[]`, validated by `validGameDataScopedRows`),
  `gameDataDistributions`, and `gameDataShowValues`, all in the shared
  persistent schema.
- Session: `SessionScope.defaultId` ('today') is the one default: the
  settings schema and `GameData.defaultsForView` both read it.
  The only picker is the static `#session-definition-select` (accessible
  name "session") in `#settings-row` at the page foot (2026-10-20; in
  `#top-bar` from 2026-10-14); `initSessionScopeSelect` fills its options
  from `SessionScope.choices` and enables it during `init`. `setSessionDefinition`
  saves it, dispatches `session-scope-change` to every
  `[data-session-scope-view]` node (game data, the session summary, and ranks
  won), which rebuild in place without rebuilding the board, and calls
  `keepSwitchCostCurrent`, so the switch cost's session pool follows the
  window without waiting for game data's redraw. Historical pages
  derive twenty overlapping session windows at a time from primary records;
  no stored aggregates.
- Checks: tests/game-data-test.js (rows, ties, rank text without pool
  descriptions or arithmetic, which measurements have definitions and how
  long they are, binning of whole and share values, labels), tests/recent-
  placements-test.js (board-trait pools, share bins, definitions),
  tests/unused-mark-test.js (the per-minute rows), tests/chart-captions-test.js (no shipped
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

## Switch cost line (2026-09-28 estimator; under game data since 2026-10-20)

Spec: [Switch cost line](../product/game-data.md#switch-cost-line-creator-request-and-approval-2026-09-28-under-game-data-since-2026-10-20).

- `switch-cost.js` (pure; the page loads it for `SwitchCost.KEYS`,
  `WINDOW_GAMES`, and `MIN_GAMES`; the worker and Node tests run it):
  - `gameRows(trace, outcome, board, deps)` replays the game with
    `deps.training.replay` (TrainingCore) and its `beforeInput` hook, which
    records progress and the single-number offers (chordable numbers,
    proven-safe cells, proven mines) before every input. Each left release is
    paired with its latest left press, in `TrainingCore.boardInputs` order;
    rows are consecutive move pairs timed press to press within 40-5,000 ms.
    Distance is between the two press positions when the layout rect is the
    same at both presses, else between cell centres; the cell size comes from
    the last layout event with the eighth-of-a-cell bevel.
  - `windows(candidates, gameOf)` walks newest first to 500 games with a
    transition (`latest`), then 500 more (`earlier`), loading no candidate
    past the earlier window (`gameOf` may be async).
  - `since(candidates, fromMs, gameOf)` walks newest first through every
    candidate that ended at or after `fromMs` (inclusive, as
    `SessionScope.bounds`) and keeps those with a transition, however many;
    it loads no candidate that ended earlier.
  - `fit(games)` builds P1's 20 columns in the study's order. Each spline
    uses the natural cubic basis x, d_k - d_{K-1} (ESL 5.4-5.5), which spans
    patsy's `cr` space less the constant the game intercepts absorb. It
    demeans by game, solves by Householder QR in column order (a column that
    earlier ones already span is left out, as the study's fit did), and
    returns beta, the CR1 standard error by game with the study's correction
    g/(g-1) x (n-1)/(n-p), the percentage and its 95% interval, ms at the
    median switch interval, and the switch share. Under `MIN_GAMES` (30) the
    status is `too-few-games`; unidentifiable data give `not-measurable`.
  - `timeMs(rows, beta)` prices switches: the sum over switched rows of
    interval x (1 - e^-beta), the interval less what it would have taken
    without the switch (the same rule as `msPerSwitch`). `perGame(games,
    fit)` gives per board key the pool's games and their mean `timeMs` at
    the pool's own beta (null unless measured); `game(rows, fit)` gives one
    game's transitions, switches, and `costMs` at a measured fit. The
    per-game regression (`gameFit`, `gameMeasurements`, partly built
    2026-10-08 and never wired) was removed on 2026-10-20.
  - `knots` places patsy's knots on distinct values within `KNOT_TOLERANCE`
    (1e-9): with exact distinct doubles, last-bit differences between numpy's
    and V8's `log2`/`hypot` moved the Fitts knots (1.46084/1.94262 against
    1.46115/1.92487 on the same 25,970 rows) and the estimate by 0.012
    points. Percentiles reproduce numpy's two-sided linear interpolation.
- `training-core.js`: replay steps carry `opened` and `openedZeros` (cells
  the input opened, empty ones among them); `beforeInput(event, view)` sees
  the visible board before each input and its return value becomes
  `step.before`; `boardInputs` is exported.
- Switch cost (`switch-cost.js`, `switch-cost-worker.js`): moved from the game
  page to `training.html` on 2026-11-24 (Option W1; `game/switch-cost-line.js`,
  `gameDataSwitchCost`, and the `switch-cost` lane in `analysis-client.js` were
  removed). See [Training page implementation](training.md#button-switch-cost).
  `switch-cost.js` still keeps `gameRows` emitting all transitions (plus
  `cellDistance`) so `tests/switch-cost-reference.json` parity with
  `analysis/switch-cost/reference.py` remains intact, and adds
  `MAX_CELLS = 2`, `shortRangeRows`, `msPerSwitchLow`/`High`, and `compare`.
- Per-game `flagChordGap` (`flag→chord gap`, added 2026-11-24): catalog entry
  in `game-data.js` (`allOutcomes: true`, `higher: false`, `default: true`,
  gated on `r.flagsPlaced > 0 && !r.flagsBlocked && Number.isFinite(r.flagChordGapMs)`),
  computed by `DuringGame.flagChordPairsOf` / `DuringGame.flagChordGap` in
  `during-game.js` and `finishedMeasurements` (`needFlagChordGap`) in
  `analysis-worker.js`, stored as `flagChordGapMs` (`game/history.js`),
  backfilled on restore (`preferences-game.js`), and included in
  `PERF_CHART_SPECS` (`game/charts.js`) and `buildGameStats` (`game/results.js`).
- Real-data parity (2026-09-28, the study's latest 500 standard games,
  25,970 transitions, the same window by end time as by start time): in-game
  +7.383% (+6.371 to +8.405), 17.9 ms per switch, 53.62% of moves switching;
  `analysis/switch-cost/reference.py` on the same rows agrees to 4e-13; the
  study's own run with exact-double knots gave +7.382% (+6.370 to +8.405).
  Node timing on this machine: rows for all 3,220 traces 0.52 s, the fit
  0.06 s.

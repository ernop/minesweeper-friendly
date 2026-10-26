# Game data — implementation notes

Spec: [docs/product/game-data.md](../product/game-data.md). Index: [AGENTS.md](../../AGENTS.md).

- Game data (2026-09-23, band rebuilt 2026-10-07, panel and cards revised 2026-10-08): [complete design and removed-field inventory](../product/game-data.md).
  `game-data.js` owns shared metric formulas, the GameData catalog (one
  `name`, `format`, direction, and `allOutcomes` per measurement, and a
  `help` definition only where the name and unit leave it open; every
  surface reads it, [measurement catalog](measurement-catalog.md)), rows,
  history, domain, and SessionScope choices/bounds/records. A board trait's
  definition is `BOARD_TRAIT_DEFINITIONS[id]` (game/rankings.js, beside
  `BOARD_TRAIT_NAMES`); its "This board" table's `help(record)` in
  `BOARD_METRIC_TABLES` or the shape families opens with it. 3BV, max
  number, and zeros have no entry, so their cards and configure rows show
  none, and their tables keep their own help.
  `settings-core.js` depends on it.
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
  on a band or distribution row call `linkMeasurements([metricId],
  'gameData')`, which toggles `.game-data-linked` on those charts: a
  `--this-game` ring with black edges (two box-shadows plus a 1px outline,
  so it never reflows), and spotlights the measurement in the live perf
  charts; their lines and legend entries ring performance rows the same way
  ([measurement catalog](measurement-catalog.md), "Hover link"). Rows take
  no hover background (2026-10-20); `:focus-visible` keeps a 1px outline.
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
  either staying shown, and renames the 2026-10-26 ids through
  `withCurrentMeasurementIds`), `gameDataBoardTraits` (settings-core.js; defaults
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
- `switch-cost-worker.js` is `analysisTask`'s `switch-cost` lane
  (`startAnalysisWorker` in `analysis-client.js`; one task kind, `estimate`,
  payload `{ database, candidates, sessionFromMs, shownEndedAt }`, reply
  `{ session, latest, earlier, shown }`: per pool a `fit` result with its
  `perGame`, and `shown`, the candidate ending at `shownEndedAt` as
  `game(rows, latest)` with its `endedAt`, or null when no candidate ends
  then or its trace is not saved). Saved games carry their key for
  `perGame`. It opens the database
  with the page's name and version as `training-worker.js` does, reads each
  trace in its own transaction, keeps every saved game's rows for the page's
  lifetime, and does not remember a missing trace (a just-finished game's
  trace may not be committed when an earlier request lists it). It keeps the
  previous reply's fits (with their `perGame`) keyed by their games' end
  times, so a pool whose games did not change (the latest 500 when another
  session is picked, or the session when it holds the same games as a
  window) is not fitted again.
  `solver.js` needs `justice.js` loaded first.
- `game/switch-cost-line.js` (page only, so the analysis worker's imports
  never reach it):
  - `buildSwitchCostLine(record)`: built by the game data task's chart
    view under the chart when `settings.gameDataSwitchCost` is on, for the
    game game data shows (`switchCostShownEndedAt`). One wrapping flex line:
    the label (`chartHelpButton`), "this game" and its value, then per
    `SWITCH_COST_POOLS` entry (session, latest, earlier) the pool name and a
    `.switch-cost-value`; its `updateFits` changes only those values' text,
    with a true minus sign, and closes an open card. "this game" shows only
    a reply whose `shown.endedAt` is the line's game
    (`switchCostShownGame`).
  - `fillSwitchCostCard`: `SWITCH_COST_DETAILS` per pool (the per-board rows
    from `DIFFICULTIES`' standard keys), a sentence per `not-measurable`
    pool, this game's sentence, the definition, how to read the earlier
    pool, and which games count. `switchCostSeconds` formats seconds in at
    most six characters.
  - `switchCostCandidates`: the three keys' records, newest first.
  - `refreshSwitchCost`: while `settings.gameDataSwitchCost` is off it only
    sets `switchCostStale`. Otherwise one request in flight and one rerun
    queued; `switchCostRequest` keeps the request's candidates, its session
    start, the shown game it priced, and how many candidates ended inside
    the window. Failures go through `analysisFailure`.
  - `keepSwitchCostCurrent`: called by `buildSwitchCostLine` and
    `setSessionDefinition`. It runs a stale refresh, or one when the line
    now sits under another game or the session window now holds a different
    number of the request's candidates (another session picked, or the
    window's start passing a game).
  - `switchCostSourcesChanged`: called when `saveTrace` completes. `init`
    calls `refreshSwitchCost` after startup.
  - Configure's checkbox for `gameDataSwitchCost` sits between the
    performance measurements and the board traits.
- `style.css`, `.switch-cost-value`: `min-width: 6ch`, 14px bold tabular
  digits, right-aligned, so every estimate under 100% either way and every
  cost under 100 s fits and a reply does not shift the line;
  `.switch-cost-pool` keeps each name with its value.
- Verification: `tests/switch-cost-test.js` (known-answer transitions from a
  hand-built game, numpy knots, the fit against `tests/switch-cost-reference.json`
  within 1e-9, coverage of the fixture's planted effect, a game's cost at a
  known estimate, per board, the windows and session rules);
  `tests/training-core-test.js` (the replay additions);
  `tests/switch-cost-browser-check.js`: nothing read while the line is off;
  en dashes and zero game counts with no saved games and under the minimum;
  the line directly under game data's chart, above its controls row; every
  pool's fit and per-board cost, and the shown game's cost, from IndexedDB
  equal Node's within 1e-12 over the past 4 hours, the past hour, the past
  10 minutes, and the past hour ten minutes later (a shifted `Date.now`);
  the rendered line and card; a finished game joining the session and the
  latest 500; turning the line off stops reading and turning it on catches
  up; the line wraps only between items and never overflows game data at
  any column width. It serves the
  working tree by request routing under 8099, so it needs no server, and
  runs in Chromium only: Firefox does not route the requests a worker makes
  itself (`importScripts`). An optional third argument saves a screenshot of
  the line with the card open. After a fixture or estimator change,
  regenerate the reference: `node tests/switch-cost-fixture.js ROWS.jsonl` then
  `python analysis/switch-cost/reference.py ROWS.jsonl tests/switch-cost-reference.json`.
- Real-data parity (2026-09-28, the study's latest 500 standard games,
  25,970 transitions, the same window by end time as by start time): in-game
  +7.383% (+6.371 to +8.405), 17.9 ms per switch, 53.62% of moves switching;
  `analysis/switch-cost/reference.py` on the same rows agrees to 4e-13; the
  study's own run with exact-double knots gave +7.382% (+6.370 to +8.405).
  Node timing on this machine: rows for all 3,220 traces 0.52 s, the fit
  0.06 s.

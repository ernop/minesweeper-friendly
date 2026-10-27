# Measurement catalog — implementation notes

Spec: [docs/product/measurement-catalog.md](../product/measurement-catalog.md). Index: [AGENTS.md](../../AGENTS.md).

## The catalog and its readers

- `GameData.metrics` (`game-data.js`) is the catalog: per measurement `id`,
  `name`, `help` (absent when the name and unit say it all), `format`,
  `higher`, `default`, `allOutcomes` (absent: wins only), `value(record,
  params)`, and where needed `actionSummary` and `step(params)`.
  `game-data.js` loads before every reader: on the game page, the settings
  page, and in `analysis-worker.js`'s `importScripts`, ahead of
  `game/metric-definitions.js` and `during-game.js`.
- Live perf charts (`during-game.js`): `measurementRow(id, row)` builds a
  catalog measurement's row from its drawing fields (`group`, `default`,
  `chart`, `color`, `data`), taking `name`, `help`, and `format` from the
  catalog and setting `measurements: [id]`; an unknown id throws. Event rows
  list in `measurements` the catalog ids counted over their events.
- Motion stats (`game/metric-definitions.js`): `catalogMetricDisplay(id,
  of)` gives a `TRACE_METRIC_GROUPS` display the catalog's name, help, and
  format (cadence spread). Tests that evaluate the source span from
  "TRACE METRICS: COMPUTATION" to "MOTION STATS: SAMPLES AND ROWS" load
  `game-data.js` first.
- Your-perf charts (`game/charts.js`): `steppedMetric(id, step, { percent
  })` reads the catalog's name and `value`, and sets `winBound` exactly when
  the measurement lacks `allOutcomes`. "clicks over 3BV" is not a catalog
  measurement and declares `winBound` itself.
- "this game" table (`buildGameStats`, `game/results.js`): `measurementRow(id)`
  and `shownMeasurement(record, id)` show a measurement under its catalog
  name and format, on wins only unless `allOutcomes`.
- The cadence spread relationship chart (`renderRanks`,
  `game/result-ranks.js`) takes its title and values from the catalog entry.

## One value

- The model's `plannedPairs` (`plannedPairsOf`, [Live perf charts](during-game.md),
  "Model") are the fastclick row's incidents, and `DuringGame.fastclickGap`
  gives the record their rounded median as `fastclickGapMs` with
  `fastclickGapVersion`, through `finishedMeasurements` in the reports
  worker. The catalog entry's `value` returns `fastclickGapMs` only when
  `fastclickGapVersion` is `FASTCLICK_GAP_VERSION` (exported by `GameData`;
  `game/history.js` accepts no other), so a value of the earlier
  definition is unmeasured everywhere, the offline history summary
  included (`analysis/history/summarize-history.js` loads `game-data.js`
  and reads the entry's `value`). The page's former counters
  (`lastCursorMoveAt`, `lastUsefulPressAt`, `fastclickGaps`,
  `recordUsefulPress`) and `FASTCLICK_MAX_GAP_MS` are gone.
- `gameValue(data, m)` (the legend value and the relative chart's 1×) is
  `valueOver(data, data.incidents, 0, m.timeMs, m.recordTimeMs)`: every
  incident, divided by the record's `timeMs` (`m.recordTimeMs`), with no
  minimum; a rate or speed of a 0 ms record is undefined. `windowValue`
  filters the window's incidents and keeps `MIN_WINDOW_MS`.
- `finishedMeasurements` (`analysis-worker.js`) stores `cadenceSpread` as
  `metrics.cad.gapSpreadRatio`, unrounded.

## Hover link

- `linkMeasurements(metricIds, from)` (`game/game-data-chart.js`) clears
  every `.game-data-linked`, marks the charts in `resultRanks` whose
  `data-measurement` is listed, and, unless `from` is `'gameData'`, the
  performance side's band rows (`.game-data-row[data-side="performance"]`)
  and distributions rows with that `data-measurement`; unless `from` is
  `'duringGame'`, it calls `duringGameSpotlight(metricIds)`.
- Band and distributions rows call it on `mouseenter` and focus with their
  `metricId`, and with `[]` on `mouseleave` and blur.
- `game/during-game-chart.js`: `duringGameSpotlight` is null until a block
  draws (`renderDuringGameCharts` resets it), then focuses every shown
  member whose `measurements` (`duringGameMeasurementsOf`) meet the ids.
  `focus(members)` sets `.series-focus` on each member's part SVG and `.hot`
  on its nodes. `pointFocus(member)`, called by legend entries
  (`mouseenter`, `mouseleave`, after a pick) and by pointer moves over a
  chart (`lineAt`'s nearest member; null over the tracks), focuses the
  member and calls `linkMeasurements` with its measurements and
  `'duringGame'`. A redraw (`layout`) refocuses the redrawn nodes.
- `style.css`: `.series-focus` fades lines, dots, ticks, and marks that are
  not `.hot` to 0.16 opacity; a linked game data row draws two inset
  box-shadows on its `.chart-help-label` (black, then `--this-game`), with
  its outline removed, so nothing reflows.

## Settings

`RENAMED_MEASUREMENT_IDS` and `withCurrentMeasurementIds(selection)`
(`settings-core.js`) rename the 2026-10-26 ids in a stored selection;
`gameDataMetricsFromStored` applies it to `gameDataMetrics` and to the
retired lifetime and session selections, and `duringGameRowsFromStored` to
`duringGameRows`.

## Tests

- `tests/during-game-test.js`: every catalog row's name, help, format, and
  measurements are the catalog's; every `measurements` id exists; the event
  rows' measurements; no other row or motion stats display takes a catalog
  name, and cadence spread's display is the catalog's; whole-game values on
  the record's time, under a second, and with every press; the fastclick
  gap's planned pairs on the creator's corner and on single pairs of
  clicks, and the same value in the record and the row; cadence spread
  unrounded through `finished-game`.
- `tests/game-data-test.js`: the catalog's board-changing click share,
  efficiency, and IOS formulas, and the fastclick gap read only under its
  current definition.
- `tests/settings-state-test.js`: the five renamed ids carry over in both
  selections.
- `tests/during-game-browser-check.js`: after a real win against one
  earlier win, 3BV/s, click rate, and fastclick gap read the same in the
  legend and game data, and the saved record names the fastclick gap's
  definition beside the legend's value; a reload of that record, made one
  of the earlier definition, measures it again to the same value; a row's
  hover spotlights its line or marks alone and
  lets go; a legend entry, an event row's entry, and the line under the
  pointer ring their rows. `tests/board-time-profile-browser-check.js`: a
  row's hover outlines its charts.

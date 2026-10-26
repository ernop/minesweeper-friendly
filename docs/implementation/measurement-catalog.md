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

- `DuringGame.fastclickGaps(decisions, sampleT)` returns `{atMs, gapMs}` for
  each board-changing decision (`BOARD_CHANGING`) whose gap from the one
  before is at most `FASTCLICK_MAX_GAP_MS` and whose latest cursor sample at
  or before it lies within `CADENCE_MOVING_WINDOW_MS`. The model keeps them
  as `fastclickGaps`, the fastclick row's incidents; `reportResult` stores
  `Math.round(medianOf(...))` of the same call on `pathDecisionEvents(
  trace.events)` and `trace.t` as `fastclickGapMs`. The final decision is
  in the trace by then: `recordActionEvaluation` traces it before
  `checkWin` or the loss. The page's former counters (`lastCursorMoveAt`,
  `lastUsefulPressAt`, `fastclickGaps`, `recordUsefulPress`) are gone.
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
  the record's time, under a second, with every press, and the fastclick
  gaps the record reads; cadence spread unrounded through `finished-game`.
- `tests/game-data-test.js`: the catalog's board-changing click share,
  efficiency, and IOS formulas.
- `tests/settings-state-test.js`: the five renamed ids carry over in both
  selections.
- `tests/during-game-browser-check.js`: after a real win against one
  earlier win, 3BV/s, click rate, and fastclick gap read the same in the
  legend and game data; a row's hover spotlights its line or marks alone and
  lets go; a legend entry, an event row's entry, and the line under the
  pointer ring their rows. `tests/board-time-profile-browser-check.js`: a
  row's hover outlines its charts.

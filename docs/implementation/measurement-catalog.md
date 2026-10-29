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
  measurement: its value is `clicksOverBv3Of` (`game-data.js`, over the 3BV
  the player solved; the "this game" table shows the same), and it declares
  `winBound` itself.
- Training (`training-core.js`): `trainingWinPace` takes 3BV/s and IOE from
  `bvPerSecond` and `ioeOf`; `training-worker.js` imports `game-data.js`
  before it. Trial review (`game/trial-review.js`): an attempt's 3BV/s and
  efficiency are `shownMeasurement(attempt, id)`, and `Trial.sessionSummary`
  receives that 3BV/s function.
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

## Divergences resolved 2026-10-27

- Record field names: `RENAMED_RECORD_FIELDS` and `renameRecordFields`
  (`storage.js`). The version-7 upgrade walks the records store with a
  cursor and rewrites each record that held an old name, then the trial
  session's attempts (userdata `trial`); the version-5 step renames each
  record before adding it, because its adds run after the version-7
  cursor's request. `cleanTransferredGameRecord` (`game/history.js`)
  renames before the schema check, so an earlier backup imports. The
  page's counters carry the field names (`boardChangingClicks`,
  `noOpClicks` in `game/core.js`). `ARCHIVE_FORMAT_VERSION` is 2, with a
  README paragraph on the renames. The offline history summary reads the
  new names; its output keys say `noOpClicksPerGame`. The rename map, the
  upgrade step, and the import call are step 1 of 2 ([BACKLOG.md](../../BACKLOG.md),
  "Record field names: step 2").
- Mouse path: `traceMove` (`game/input-trace.js`) keeps every observation a
  sample replaces in the `merged*` arrays; `saveTrace` stores them
  (`TRACE_CAPTURE_VERSION` 3). `sampleTravelPx(x, y, merged)`
  (`game/trace-metrics.js`) is each sample's travel, and every path sum
  and travel-over-time speed takes it: `computeTraceMetrics` (its total
  and `strokeMetrics`' bout path and speeds) and `computeWasteMetrics`
  (through `computeAllTraceMetrics` and `createTraceMetricComputer`, which
  take `travel` after `x, y`), `cursorPath` in `during-game.js`,
  `Trial.runningPath` and `runningSpeed`, the replay's `pathSegments` and
  `pathRoughSegments`, and the offline extractor's `sample_travel_px` and
  `stroke_features` (`analysis/biometrics/extract_features.py`).
  `computePsychometrics` (mousetrap) and `computeHevelius` keep the
  samples alone, as their reference algorithms do.
  `storedMergedObservations(stored)` reads them from a stored trace (none
  before version 3), `liveMergedObservations()` from the live one or from
  the trace `restorePreferredResult` rebuilds, which carries them too.
  Positions are stored as captured with `Math.fround`, so the live and
  restored sums agree to the bit.
  `reportResult` stores `mousePathPx = DuringGame.cursorTravelPx(...)` of
  the live trace; the page's mousemove counter is gone. The live trace
  payload (`renderLiveTraceMetrics`, `game/motion-stats.js`) sends the
  merged observations since the last send and restarts at `fromSample`:
  when an observation replaced a sample already sent, that sample goes
  again with its new position.
- Given opening: `hadGivenOpening(record)` and `solvedBv3Of(record)`
  (`game-data.js`) feed every 3BV-dividing formula; ZiNi and HZiNi
  efficiency return undefined on such games. `DuringGame.bv3SolvedBy`
  counts the 3BV a set of open squares has solved; `reportResult` stores it
  for the given opening's squares, and `finishedMeasurements` measures an
  older record's with `DuringGame.bv3SolvedAtStart` (plan field
  `needGivenOpeningBv3`).
- Restore (`preferences-game.js`): the plan asks for cadence spread every
  time, move habits without `movesMovedOn`, the fastclick gap off its
  current version, and the given opening's 3BV where missing; the record is
  saved only when a measured value differs from the stored one.

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
  efficiency, and IOS formulas, the fastclick gap read only under its
  current definition, and a given-opening trial game's measurements over
  the 3BV the player solved (unmeasured until that is known; none for ZiNi
  and HZiNi efficiency).
- `tests/during-game-test.js` also: each sample's travel through the
  observations it replaced, the record's path equal to the model's
  whole-game path, and the given opening's 3BV equal to the model's 3BV
  solved at the start. `tests/trace-layout-test.js` and
  `tests/trace-capture-browser-check.js`: the merged observations as
  captured, saved, and exported. `tests/metrics-biometrics-parity.js`:
  the path and bout features through merged observations, against the
  offline extractor; `tests/analysis-worker-test.js` streams them to the
  worker in pieces and restores them, equal to the whole computation;
  `tests/path-replay-test.js`: rough movement's pace is the travel.
- `tests/self-check-browser-check.js`: the version-7 renames from version
  3, both version-4 builds, and version 6, records and trial attempts;
  `tests/board-metrics-browser-check.js` from version 2;
  `tests/history-transfer-test.js` a backup with the old names.
- `tests/settings-state-test.js`: the five renamed ids carry over in both
  selections.
- `tests/during-game-browser-check.js`: after a real win against one
  earlier win, 3BV/s, click rate, and fastclick gap read the same in the
  legend and game data, and the saved record names the fastclick gap's
  definition beside the legend's value; the record's path equals the path
  worked out from its saved trace, to the last bit; a reload of that record,
  made one of the earlier fastclick gap definition and with a changed
  cadence spread, measures both again to the same values; a row's
  hover spotlights its line or marks alone and
  lets go; a legend entry, an event row's entry, and the line under the
  pointer ring their rows. `tests/board-time-profile-browser-check.js`: a
  row's hover outlines its charts.
- `tests/trial-opening-browser-check.js`: a trial given an opening and won
  with real mouse input keeps the setting and the opening's 3BV (counted
  independently from the squares it left open) in its record and the
  trial session's attempt; the trace gives the same; the "this game"
  table's 3BV/s divides only the 3BV the player solved; and a record saved
  without the opening's 3BV gets it again from its trace on restore.

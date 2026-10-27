# Point charts — implementation notes

Spec: [docs/product/charts.md](../product/charts.md). Index: [AGENTS.md](../../AGENTS.md).

- Property charts: `PERF_CHART_SPECS` and `BOARD_CHART_SPECS`,
  `averageEligibleWins`, `averagePoints`, and `buildAverageScatter`.
  Each group reads `settings.perfChartMode` or `settings.boardChartMode`.
  The section heading carries that group's selector (`chartModeSelect`).
  Board-shape specs exclude legacy records lacking their field; IOS excludes
  times at or below one second; path-ratio specs exclude zero denominators.
  `steppedMetric(id, step, { percent })` charts a GameData measurement
  with its catalog name and `value`: `percent` plots a share ×100 with
  `xTickUnit: '%'` and a step in percentage points; a null step keeps
  exact values (unflagged mine share, already one value per mine count).
  It sets `winBound` exactly when the catalog entry lacks `allOutcomes`
  (2026-10-26; [measurement catalog](measurement-catalog.md)); "clicks over
  3BV", not a catalog measurement, declares `winBound` itself.
  Bucket steps are in [Point charts](../product/charts.md). A board chart
  follows its tablechart `shownThings` switch. `tests/average-scatter-test.js`
  freezes both orders, metric definitions, eligibility, and aggregation.
  Chart titles take their names from the measurement's one source
  (2026-10-07): `steppedMetric` reads the GameData catalog for
  performance measurements, and board charts read `BOARD_TRAIT_NAMES`
  (game/rankings.js). A spec's `measurementId` names the game data row it
  plots; `buildAverageScatter` stamps it as `data-measurement` (the hook
  for `linkMeasurements`) and puts `gameDataChartChip(row)`, this game's
  value and lifetime standing, after the title.
- Scatters: `buildScatter` + `niceTicks` (`timeTicks` for the date axis;
  `minorTicks` adds edge tickmarks between labeled divisions, skipped on
  the date axis), emitted in the relationships section; the other games' dots
  painted on one canvas (`canvas.scatter-dots`, `paintScatterDots`) inside the
  chart's SVG (a `foreignObject` after the trend lines), colored by age unit
  (`SCATTER_AGE_DOT_FILLS`) or black (`neutralDots`), each with its own
  opacity so overlapping dots still darken as SVG circles did. As SVG
  circles (until 2026-10-26) every page layout walked each dot: 13,149 dots
  in 25 charts after the latency check's loss made a forced layout 51 ms in
  Firefox (11 ms with the canvas) and the freeze after a loss 75-78 ms
  (31-39 ms). Inside the SVG the canvas is painted with it, on the same
  device pixels as the axes at pixel ratios 1 and 2; a canvas beside the SVG
  sat a device pixel off at ratio 2 in Firefox, which places an SVG on whole
  CSS pixels and a canvas on whole device pixels. `renderPixelRatio`
  repaints every canvas when the ratio changes. The
  current game `.scatter-me` (`--this-game`, no age class) ringed and
  tagged with its today-rank, on-chart axis
  labels, legend appended last. Options: `timeAxis` (local calendar
  x-ticks), `idealLine` (y = x dashed floor), `trendLines`
  (`trendLinesFor`: the Theil–Sen line fit twice — all data in the age
  palette's years teal, today only in its hours blue, both dashed —
  clipped to the plot rect, drawn only across its own fit's x-range,
  no caption; on the average charts and the date / 3BV-time /
  3BV-clicks raw plots, always fit on untrimmed values — chosen
  2026-08-22 from a five-fit sampling, see [Average-time
  charts](../product/charts.md) and "Scatter plots").
- Retired rankaverage compatibility: storage still recognizes the old
  `rankavgSort` userdata kind during migration, but the runtime does not
  load, mutate, or export it.

- Exact fit implementation (2026-09-25): `trend-fit.js` selects the median
  intersection in the dual-line arrangement using inversion counts and rank
  sampling. It uses expected O(n log n) time and O(n) space, replacing
  enumeration/sorting of O(n²) slopes. Sampling narrows an interval; certified
  ranks determine the answer. Ambiguous floating-point slope comparisons use
  exact dyadic-integer determinants, preserving coincident-line/tie handling.
  The intercept remains median(y − bx). Algorithm reference:
  [Raymaekers, robslopes](https://journal.r-project.org/articles/RJ-2023-012/).
  `tests/theil-sen-test.js` compares 5,508 datasets with exhaustive pairwise
  results, including duplicate x, collinearity, large offsets, and subnormals.
- `averageScatterData` runs with ranking preparation in the worker, over the
  same frozen record/config/settings snapshot. `scatterPlotData` handles
  Tukey trimming and bounds there. `buildScatter` reserves its SVG geometry,
  then draws the model and fit asynchronously; its `analysisReady` promise
  joins the report collector. Late chart replies only touch their own detached
  nodes. Scatter drawing checks the presentation budget every 128 points.


## Lifetime scope and remaining cost (2026-09-26 review)

`renderRanks` takes the complete `history[modeKey()]` collection, whose key
combines board parameters, play mode, and generator. Raw relationship and
property-distribution trends use every eligible win in that collection, plus a
separate today subset. Average-mode fits operate on B occupied value buckets;
constructing those buckets still scans the N eligible wins. Winrate mode includes
losses in its buckets but does not fit a trend. Fitts and spatial-bias fits use
observations from one game's trace.

`analysis-worker.js` currently recomputes fits for each report request. There is
no history revision cache or incremental lifetime dataset in the worker. Repeated
view rendering and loss reports can repeat unchanged win-only fits. Raw fits cost
expected O(N log N) each; refitting after each of N successive wins therefore
accumulates O(N² log N) expected work for a fixed set of raw charts. Grouped charts
cost O(N + B log B) per model, before rendering. Record projection and structured
cloning still scale with the supplied history on the UI thread.

Candidate follow-up architecture, not implemented: keep worker datasets updated
by record deltas, cache exact models by data revision and fit scope, maintain
bucket sums/counts incrementally, and request chart calculations only when their
views need them. These remove repeated unchanged work; they do not turn the
current exact lifetime Theil–Sen fitter into an O(1) update. A fixed observation
window or different estimator would change the product's statistical definition.

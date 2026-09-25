# Point charts — implementation notes

Spec: [docs/product/charts.md](../product/charts.md). Index: [AGENTS.md](../../AGENTS.md).

- Property charts: `PERF_CHART_SPECS` and `BOARD_CHART_SPECS`,
  `averageEligibleWins`, `averagePoints`, and `buildAverageScatter`.
  Each group reads `settings.perfChartMode` or `settings.boardChartMode`.
  The section heading carries that group's selector (`chartModeSelect`).
  Board-shape specs exclude legacy records lacking their field; IOS excludes
  times at or below one second; path-ratio specs exclude zero denominators.
  Bucket steps are in [Point charts](../product/charts.md). A board chart
  follows its tablechart `shownThings` switch. `tests/average-scatter-test.js`
  freezes both orders, metric definitions, eligibility, and aggregation.
- Scatters: `buildScatter` + `niceTicks` (`timeTicks` for the date axis;
  `minorTicks` adds edge tickmarks between labeled divisions, skipped on
  the date axis), emitted in the relationships section; dots colored by age unit (`.age-dot-*`),
  the current game ringed and tagged with its today-rank, on-chart axis
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

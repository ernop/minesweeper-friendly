# Point charts

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/charts.md](../implementation/charts.md).

## Property charts (`your perf` and `board traits`)

Two groups following all exact pagetables (`rankings` and `This board`), matching [Game data](game-data.md)'s left/right split:

- **`Your perf` (`PERF_CHART_SPECS`, 10 orthogonal measurements):** `IOE`, `HZiNi efficiency`, `board-changing click share`, `click rate`, `fastclick gap`, `mouse speed`, `cadence spread`, `misclicks` (exact count), `unused flag share`, and `unflagged mine share`. Plots **ms / 3BV** (`timeMs / solvedBv3`) on y so `"lower is faster"` holds without 3BV board-size confounding. Redundant transforms (`3BV/s`, raw `clicks`, `path`, `efficiency`, `IOS`, `STNB`, per-time error rates) stay in `GameData.metrics` and exports rather than duplicating scatter axes.
- **`Board traits` (`BOARD_CHART_SPECS`, 10 traits):** `3BV`, `ZiNi`, `HZiNi`, `3BV spread`, `max number`, `islands`, `largest island`, `zeros`, `0–1 share`, and `zero-opening coverage`. Plots raw win time in seconds on y; each board chart follows its tablechart switch (`3BV spread` and `largest island` off by default).
- **Catalog parity:** every chart of a catalog measurement takes its name, values, and game scope directly from `GameData.metrics` ([Measurement catalog](measurement-catalog.md)). Charts require `>= 2` eligible wins (with positive solved 3BV for `ms / 3BV`); records lacking a measurement are excluded.
- **Grouping & axes:** integer counts (`misclicks`, board counts, `unflagged mine share`) group exactly; continuous/ratio metrics bucket cleanly (`IOE` `0.01`, `HZiNi efficiency` & `board-changing click share` `1 pp`, `fastclick gap` `10 ms`, `mouse speed` `50 px/s`, `click rate` & `cadence spread` `0.1`, `unused flag share` `5 pp`, `0–1 share` & `zero-opening coverage` whole %, `3BV spread` `0.5` cells). Headers name reading and grouping (`"ms / 3BV by IOE"`, `"time by 3BV"`, `"winrate by …"`), y-ticks carry units (`25s`, `600ms`, `40%`), percentage axes append `"%"`, and rotated y-axis captions are omitted.
- **Three-way mode switcher per group (`perfChartMode`, `boardChartMode`, beside each section title when open; [Results](results.md#collapsible-openers-and-local-configuration)):**
  - `average` — bucket average `ms / 3BV` or win time (dots colored by newest win in the bucket).
  - `distribution` — every win plotted individually with the same trend pair and Tukey y-outlier trimming as raw scatters.
  - `winrate` — percentage won across wins and losses; automatically omits `winBound` measurements (`IOE`, `HZiNi efficiency`, `unused flag share`, `unflagged mine share`).
- **Help `(? )` tips:** state only what titles/axes leave open (age color palette, teal/blue trend fits, small-sample `0%/100%` swings in winrate mode) without narrating dots or axes ([UI doctrine](ui-doctrine.md#numbers-labels-and-visual-clarity)).

## Relationship scatter plots

Eight raw-win plots in fixed order (gated by `shownThings.relationshipCharts`, requiring `>= 2` wins; measurement-gated plots require `>= 2` eligible wins and compute fits on their own subset):

1. `win time` vs. `date` (local calendar ticks: `HH:mm` below a day step, `M/D` above)
2. `win time` vs. `time of day` (`0–24` local clock; no trend line on circular axis)
3. `3BV` vs. `time`
4. `clicks` vs. `3BV` (dashed `y = x` minimum-click floor)
5. `no-op clicks` vs. `time` (no trend line on tied small integers)
6. `guesses` vs. `time` (no trend line)
7. `life lost` vs. `time` (guess-ledger wins)
8. `cadence spread` vs. `date`

- **Visual grammar:** no chart titles — terse axis labels (`→ time`, `→ 3BV`) and `12 px` bold ticks on `1/2/5` steps (up to 6 x-ticks, 5 on `date`, 7 on y) with minor tickmarks (omitted on `date`). Every win uses the relative-age palette (`s` fluorescent green, `m` green, `h` blue, `d` red, `w` navy, `mo` maroon, `y` teal) fading from `100%` to `30%` opacity across its unit span, keyed by a shared legend below. The current win renders as a larger black-ringed `--this-game` light-blue dot tagged `"#N today"` (flipping left near the right edge).

## Exact Theil–Sen trends and scaling

- **Exact all-pairs median fit:** $y = a + b x$ where $b$ is the median slope across all pairs (mean of middle pair on even counts, honoring tied x and duplicate observations) and $a = \text{median}(y - b x)$, fit on untrimmed values (resisting outliers). Served by one shared fitter across property, relationship, Fitts, and spatial-bias plots in workers ([Board and layout](board-and-layout.md#startup-readiness-and-responsiveness)).
- **Dual dashed lines:** teal (`years` hue) over all eligible data and blue (`hours` hue) over today's wins since local midnight (requiring `>= 2` buckets/points), clipped to the plot frame and spanning strictly their own x-range (never extrapolated). No math or color-key captions.
- **Scaling:** fits retain full unlimited per-key lifetime scope (never sampled approximations). Incremental scaling optimizations are tracked in [BACKLOG.md](../../BACKLOG.md#bugs-performance-and-infrastructure).
- **Retired rankaverage tables:** replaced by property scatter plots (`rankavgSort` remains recognized only by storage migration with no UI or runtime state).

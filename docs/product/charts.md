# Point charts

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/charts.md](../implementation/charts.md).

## Average-time charts

- One small scatter per grouping stat (`AVERAGE_SCATTER_SPECS`), in this
  order: clicks, 3BV, mouse path, zeros, islands, max number, clicks over
  3BV, IOS, path per click, and path per 3BV. Integer measurements group
  exactly; mouse path uses 100px buckets, IOS uses 0.01 buckets, and the two
  path ratios use 10px buckets. The grouped value is on x and that group's
  average solve time on y; dots are colored by the age of the group's newest
  win. A measurement-specific chart appears only when at least two wins have
  a finite value: older records missing board-shape facts are excluded, IOS
  excludes times at or below one second, and path ratios exclude zero
  denominators. This preserves the stored-data semantics and prevents
  undefined values from distorting an axis.
- Headers and modes (requested 2026-08-30): every property chart carries a
  header naming its reading and grouping ("time by clicks"), its y ticks
  carry the unit ("25s", "40%"), and the rotated y-axis caption is gone
  (the header + tick units already say it). The x axis label remains.
- A three-way **mode** selector rides each header and drives all property
  charts at once (`settings.averageChartMode`, chosen on the charts
  themselves like the recent-placements window):
  - **average** — the classic reading: each dot is a group's average win
    time.
  - **distribution** — every win is its own dot (value on x, that game's
    time on y), showing the full spread of times at each value, with the
    same trend pair and outlier trimming as the raw scatters.
  - **winrate** — all finished games (wins AND losses) group by the value;
    each dot is the percentage won. IOS sits this mode out (`winBound`):
    it is only defined for wins, so its winrate would read 100%
    everywhere. Loss records carry clicks/path/board-shape facts, so the
    other specs stay measurable.
- Each header also carries a (?) help button explaining the current mode
  (see "Chart help buttons" under [Session stats](session-stats.md)).
- Trend lines (decided 2026-08-22, chosen by eye from a five-fit
  sampling): the Theil–Sen line y = a + b·x — b is the median slope over
  all point pairs, a the median of y − b·x. Chosen over least squares
  because outlier games barely move it, and over a through-origin ratio
  line because solve time has a fixed per-game component. The line draws
  twice, both dashed (dashing marks them as fits, not data), colored by
  the same color:recency sense as the age dots: the fit over all plotted
  bucket averages in the years teal (deep history), the fit over bucket
  averages recomputed from today's wins only (local midnight, as
  everywhere) in the hours blue — today's line only appearing once today
  has at least 2 buckets.   Lines clip to the plot frame and span only
  their own fit's x-range (a fit is never extrapolated beyond its data).
  No caption: the fit-name/math caption and the color-key note ("teal =
  all data, blue = today only") were both dropped 2026-08-22 — the
  dashing marks the lines as fits and the color:recency sense already
  matches the age dots. The date, 3BV/time, and 3BV/clicks raw plots
  carry the same pair (see "Scatter plots").

## Scatter plots

- The relationships section has eight plots in fixed order: win time vs date
  (local date/time x-axis: minute-to-day calendar ticks, HH:mm labels below
  a day step, M/D above), win time vs hour of day (0–24 local), 3BV vs time,
  clicks vs 3BV (with the y = x floor drawn as a dashed line — a game on the
  line used only the board's minimum clicks), no-op clicks vs time (only
  wins carrying the `wastedClicks` measurement; appears once at least 2 do),
  and (2026-08-30, the guess-ledger and cadence scatters) guesses vs time
  (tied small-integer x, so no trend line, like no-op clicks), life lost
  vs time (guess-ledger wins only), and cadence spread over date. Each
  measurement-gated plot appears once at least 2 wins carry its field and
  computes its Theil–Sen trends on its own eligible subset, not the full
  win list. The section requires at least 2 wins.
- Every win is a dot colored by its relative-age unit, reusing the age
  palette (seconds = fluorescent green, minutes = green, hours = blue,
  days = red, weeks = navy, months = maroon, years = teal), so time
  trends are scannable at a glance. Within its unit color each dot also
  fades with age — full opacity on entering the unit down to 30% at its
  far edge, so a 6-day-old red dot is visibly paler than a 1-day-old one
  (2026-08-20). A shared legend below the plots spells out the mapping.
- The just-finished game is a larger black-ringed dot (colored like the
  rest, i.e. fluorescent green since it is seconds old) tagged with its
  rank among today's wins ("#N today"); the tag flips to the left when
  the dot is near the right edge.
- No chart titles (2026-08-20): the axis labels name the chart. Labels
  are terse — one or two words, no units or asides ("→ time", "→ 3BV",
  "→ mouse speed"); the tick values carry the scale. The two time charts
  are labeled "date" (calendar spread) and "time of day" (all wins folded
  onto one 24-hour clock).
- The whole section (plots and legend) is the "relationship charts"
  shown-thing. The switch had described these plots all along but never
  actually gated them (it only trimmed a trial summary line); repaired
  2026-08-23.
- Both axes carry real scales: tick labels at nice 1/2/5-step intervals
  with light gridlines. Ticks and axis labels render at heading size
  (12px bold, 2026-08-20), so the x axis caps at 6 ticks (5 on the date
  axis, whose HH:mm labels are widest) while y takes up to 7.
- Trend lines (2026-08-22): the date, 3BV/time, and 3BV/clicks plots
  carry the same Theil–Sen pair as the average-time charts (all data in
  the years teal, today only in the hours blue, both dashed, same
  caption). Fits always use the untrimmed values even where the trimmed
  axis hides outliers — Theil–Sen resists them by construction — and a
  line spans only its own data's x-range, never extrapolated beyond it,
  so today's line on the date plot is a short segment at the right edge
  (today's trajectory; the all-data slope there is seconds per day of
  practice). On 3BV/clicks the trend's gap above the y = x floor is the
  average click overhead per unit of board difficulty. No line on "time
  of day" (a straight line on a circular axis would mislead) or "wasted
  clicks" (tied small-integer x leaves too few effective slopes).
- Minor tickmarks (2026-08-22) sit on the axis edges between the labeled
  divisions so inner positions are readable: each labeled step splits into
  round parts (quarters for a 2- or 4-mantissa step, else fifths), also
  covering the padded range beyond the outermost labels. The date axis
  skips them (calendar steps don't subdivide into round parts).

## Retired rankaverage charts

The sortable rankaverage tables were replaced by the average-time
scatterplots: the plots retain the useful grouped-value/average-time
relationship with substantially less standing table ink. Their old
`rankavgSort` userdata kind remains recognized by the storage migration so
an existing database is not damaged, but it has no current visible control,
runtime state, export field, or result section.

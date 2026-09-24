# Rank tables

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/rankings.md](../implementation/rankings.md), [docs/implementation/board-metrics.md](../implementation/board-metrics.md).

## Rank lists (time windows and day categories)

- Windows, all in the viewer's local timezone: lifetime; "in <year>"
  (calendar year); "in the last year" (rolling: starts at the end of the
  day exactly 365 days ago); "this month" (calendar); "past week" (midnight
  6 days back); "today" (since last local midnight); past hour / 15 min /
  5 min / 1 min (rolling).
- Day categories: "on <weekday>s" (today's weekday), "on weekends" or "on
  weekdays" (whichever today is), "on holidays" (US federal, only when
  today is one), and "on the Nth" for the reference day of the month.
  The latter supports every date 1–31: e.g. "on the 21st" compares wins
  finished on the 21st of any month, across all years, using local finish
  dates. It follows the same reference-date, mode/generator, duplicate-
  collapsing, and time-table display rules as the other day categories.
  A heading tooltip explains the all-months membership. Both its full table
  and qualifying ranks-won entry derive from existing timestamps; no saved
  field or backfill is needed.
- Progressive disclosure: when several lists would contain the exact same
  set of scores, only the lowest `dedupePriority` renders (narrow windows,
  then day categories, then broad windows). Exception
  (2026-08-22, "past week" added to it later that day): "lifetime" and
  "past week" always render, and any window holding the exact same
  scores collapses into one of them — so a player whose whole history
  fits in one week sees "lifetime" and "past week" rather than a stack
  of identical month/year charts, and always has the week as a recent
  reference frame. A brand-new player sees the two pinned charts;
  broader ones appear as history spreads out. This is the
  `collapseDuplicateCharts` setting (see [Personal settings](settings.md)), on by
  default; switched off, every window always renders its own chart.
- Exact board comparisons: "3BV N", "ZiNi N", "HZiNi N", and "max number N"
  (the latter three added 2026-09-21) rank solve times among wins matching
  that one measured value. Maximum number means equality, unlike the
  existing "max 2/3/4" upper bounds. ZiNi uses the recorded greedy click
  benchmark; HZiNi uses the opening-first benchmark. Neither is a proven
  minimum. Missing measurements create no table and do not enter a comparison pool; drill records still
  omit ZiNi and HZiNi. Each table has an independent display switch, on by default.
  The 0–1 share and zero-opening coverage tables match values rounded to the
  nearest whole percentage point; 3BV spread uses the nearest 0.5 cell.
  All halfway ties round up. All three have default-on
  independent display switches and omit missing measurements.
  Like the original same-3BV table, these comparisons retain their
  names even when their member sets coincide with another table's.
  All standings remain visible, including median and last place. These
  are comparisons conditional on one feature, not proof that the boards
  have equal overall difficulty or that a result is difficulty-adjusted.
- Board-shape lists (2026-08-21), same row format, over timed wins of
  this mode whose finished board (after any Justice redraw) matches this
  game. Measured at game end and stored: `maxAdjacent`, `hasSeven`,
  `zeroCount`, `islandCount`, `largestIsland`. Absence on earlier
  records means not measured; those games stay off these lists.
  - "has 8" / "has 7" — at least one cell with that number.
  - "max 4" / "max 3" / "max 2" — no number higher than that cap.
    Nested; a max-2 board also qualifies for max 3 and max 4.
  - "N islands" — 8-connected mine components (diagonals count, edges
    empty, no wrap).
  - "largest island N" — mine count in the largest such component.
  - "N zeros" — cells whose adjacent-mine count is 0.
  Progressive disclosure uses the same setting as the window charts:
  identical member sets keep the most specific list (has 8, has 7,
  max 2, then max 3, then max 4, then the grouping lists).
- Row format: rank, time, relative age. Headings carry only the window
  name. With a selected result, the footer always names its rank, complete
  comparison pool, and percentage standing, e.g. "#32 of 1,080 · Top 3%"
  (2026-09-21). This includes short lists and last place. History views
  without a selection retain "N total" when rows are cut off below, and
  a blank line otherwise. Every footer reserves one line so clearing a
  selection does not resize the chart vertically.
- Age cells align by unit start (2026-08-30): the count column stays
  right-aligned and the unit letter column is left-aligned with a fixed
  2px gap, so "8.1 h" and "6 m" read as two clean columns.
  Right-aligning the unit had let wide glyphs ("m") hug their count
  while narrow ones ("h") floated apart.
- Windowing: always the full 11 rows when the list has them. If your rank
  is within the top 11, the list anchors at #1 and shows the top 11 with
  your row in its true place (a #8 placement draws #1-#11, never #3-#13).
  Otherwise the window centers on you — 5 above, 5 below — sliding upward
  near the bottom so the budget still fills.
- Every list always renders its full window at full opacity, wherever the
  placement falls: a mediocre rank still shows its 5 neighbors either side,
  because the placement itself is fresh information. (This replaced the
  earned-detail collapse, which greyed non-top placements to a single row.)

## Rank highlights (approved and built 2026-09-21)

- The selected result's row combines independent meanings: a thin blue
  left edge and “this” identify the latest game; a full-row tint indicates
  percentage standing; gold, silver, and bronze apply only to the rank
  number for first, second, and third. A single-result list is neutral and
  says “Only result”, with no podium color.
- Percentage colors use rank/list size, with successive bands at 1%, 2%,
  5%, 10%, 25%, 50%, and 90%. The strongest greens mark the top; middle
  placements are cool gray, the lower half warm gray, and the bottom 10%
  muted brown. Last place has a distinct brown tint and double underline
  on the rank number. Text remains black, bold, and fully readable at all
  standings; poor results are never hidden or faded to illegibility.
- In an odd-sized pool with more than one result, the exact middle rank
  (`2 * rank = N + 1`) says **Middle place** with the neutral cool-gray tint.
  It has equally many results ahead and behind: #2 of 3, #3 of 5, #51 of 101.
  It retains its absolute podium color where applicable. Including the middle
  result in the lower tail formerly produced labels such as “Bottom 67%”;
  the explicit middle label replaces those labels without changing rank.
- Percentage text names the upper tail when rank/list size is at most
  one half, otherwise the inclusive lower tail: (N - rank + 1)/N, apart from
  the exact middle and only/last-result labels above. Round
  outward to the next whole percent, or next tenth of a percent below 1%.
  Examples: #1 of 91 is Top 2%; #32 of 1,080 is Top 3%; #155 of 287 is
  Bottom 47%. Last place says “Last place”. The numeric pool size always
  remains visible, including small pools.
- Shared by time, exact-3BV, shape, streak, and trial ranking tables.
  A ranked position is required: the Pregen batch progress table lists
  deal order and keeps its existing plain blue current-row marker.
- In the compact ranks-won summary, every listed achievement receives its
  percentage tint and podium color, including earlier qualifying games at
  other 3BV values. A row's background uses its best reported placement;
  the fourth cell gives the percentage or percentage range of all ranks
  reported there. Ordinals use their own colors. Consecutive ranks compress
  only within the same tint/podium treatment; the current game's ordinal
  stays separate, with a blue edge and “this”. Earlier achievements retain
  the same emphasis without the current-game marker. This also applies in
  score/history views. Lifetime's near-miss placement keeps its standing
  treatment and explanatory tooltip.
- This changes presentation only. Ranking order, source-window selection,
  top-tenth eligibility, and duplicate collapsing are unchanged.

## Recent placements (requested and decided 2026-08-23; charts and the lifetime near-miss rule extended later the same day)

- One summary block, "ranks won in session", leading the below-board chart
  sections: for the session it reports, per longer chart, which of that
  chart's top ranks were earned within the session — e.g.
  "this month: 1st, 3rd, 8–12th / lifetime: 7th, 14th".
- Source window: the shared page-wide `sessionDefinition`, default today
  (since local midnight). The heading reads "ranks won in session" and has no
  selector of its own (user decision 2026-09-23: it "should merely say
  'session'"); the one picker is the stats panel's session heading at the
  upper left ([One session definition](game-data.md#one-session-definition)).
  The heading tooltip names the current window. Bounds come from the same
  `SessionScope` model; there is no independent recent-placements preference.
  Changing the session rebuilds only scope-dependent content in place.
- Only charts strictly longer than the source window report — a chart no
  longer than the source could only echo itself. For time windows,
  strictly longer means the window starts strictly earlier: with the
  source at the past hour, "today", "past week", "this month" and up
  qualify while "past hour" and shorter never do, and "today" as source
  (the default) excludes the "today" chart itself.
- Category scope (revised 2026-09-21): retain the current board size/mine
  count, play mode, and generator with its parameters. Retain the reference
  date's day categories (this weekday, weekend/weekday, holidays when today
  is one, and the day of the month). Within that scope, every exact 3BV, ZiNi, HZiNi, maximum clue,
  0–1 share, zero-opening coverage, 3BV-spread band, and measured board-shape
  category represented by a win in the selected period
  competes: has 8 / has 7 /
  max 2, 3, 4 / N islands / largest island N / N zeros. An earlier 3BV-41
  placement remains eligible after a 3BV-40 win. Each category compares
  against all its saved member wins, including those before the source
  period; the source selects which wins' placements are reported and which
  board categories are considered. Lifetime membership charts qualify as
  longer. The latest win controls only its highlight, not the board-category
  selection. The neighboring full tablecharts still use that win's exact
  measurements and shape. The summary ignores individual tablechart display
  switches, and shares its category definitions with the tablecharts
  (`boardMetricCandidates`, `boardShapeCandidates`, `rankColumns`).
  Unmeasured fields remain excluded. Exact-value and 3BV-spread comparisons
  remain independent of duplicate collapsing in the other families.
- The same `collapseDuplicateCharts` rule applies before the summary is
  computed: time/day charts use the pinned-lifetime-and-week progressive
  disclosure, and board-shape charts keep their most specific distinct
  member sets. Switching the setting off restores every candidate here
  just as it does in the full tablecharts.
- Only ranks within the top tenth of a list are reported (rank r
  qualifies when r × 10 ≤ list length): a 9-win list reports nothing, a
  200-win list reports ranks up to 20. Ranking order is the tablechart
  order — fastest first, ties by earlier finish.
- Lifetime always answers (added later on 2026-08-23): when the source
  window has wins but none reached lifetime's top tenth, the single best
  (closest) recent lifetime rank reports anyway, with its standing tint and
  an explanatory tooltip — how close the window came stays visible. Because
  of this rule, the block's one-line empty state means exactly "no wins
  in session" and says so.
- Row format: chart name, the earned ranks with compatible consecutive runs
  compressed ("8–12th", the ordinal suffix closing each run), "of N"
  naming the list length, and the reported ranks' percentage standing.
  Rows use a stable category order (revised 2026-09-21 for long sessions):
  time windows in full-table order starting with lifetime, then day categories,
  3BV, ZiNi, HZiNi, 3BV spread, exact maximum number, has-number, maximum-clue
  caps, mine-island count, largest island, zeros, 0–1 share, and zero-opening
  coverage. Board values within each family ascend numerically, including
  fractional spread groups. Comparison-pool sizes and earned ranks never
  reorder the categories. Duplicate collapsing and top-tenth eligibility
  still determine which rows exist. Rows remain contiguous across families,
  without white gaps or extra heading rows. Full-table order stays unchanged.
  Current and earlier achievements share the same tint and podium treatment;
  only the current game gets the blue edge and “this” (see Rank highlights).
- Gated by shownThings.recentPlacements (on by default).

## Relative age display

- Largest sensible unit, abbreviated, no "ago": s, m, h, d, w, mo, y.
  h, d, w, and y show one decimal place, including trailing .0 (1.0h,
  2.3d, 2.0w). s, m, and mo stay whole. Tenths-rounding that would
  display as the next unit's threshold promotes instead (23.95h → 1.0d).
- A 0-second age renders as "this" (the game that just finished), spanning
  the age columns, right-aligned so its right edge is flush with the other
  rows' age labels (2026-08-20; replaced the left-aligned "just now").
- The age (count + unit) is color-coded by unit: s = hyper-fluorescent
  green (#39ff14), bold on a small black chip; then the board-number
  palette: m = green, h = blue (the "1" blue), d = red (the game red),
  w = navy, mo = maroon, y = teal. The scatter legend uses the same
  colors. The chip is the creator's choice (2026-09-23): bold green on
  white had about 1.4:1 contrast.
- Your own row is bolded on its percentage-standing tint (see Rank
  highlights), with text overridden to black for readability. That
  override replaces the seconds chip too.

## Streak lists

- Three lists: "streak" (0 losses), "near-streak" (1 loss ok),
  "near-near-streak" (2 losses ok) — headings carry just these names, no
  parenthetical (2026-08-20). A k-loss streak is k+1 adjacent win-runs
  joined.
- No double counting: candidate windows are trimmed to their non-empty
  core; identical cores dedupe; a core strictly inside a wider core is
  dropped (consecutive losses otherwise re-list sub-streaks). Two streaks
  that merely overlap across different losses are both real and both stay.
- Ranked by length, then recency. Row: rank, "N wins", relative age of the
  streak's last win. The streak ending in this win is your row.

# Rank tables — implementation notes

Spec: [docs/product/rankings.md](../product/rankings.md). Index: [AGENTS.md](../../AGENTS.md).

- Rank list machinery: `rankWindows` (time windows with independent
  `displayOrder` and `dedupePriority`),
  `rankColumns` (adds weekday/weekend/holiday and day-of-month categories),
  `month-date` matches `new Date(record.endedAt).getDate()` to the reference
  date (1–31), labels it with `ordinal`, and exposes all-months help through
  `buildRankList`. It has display order 140, duplicate priority 4.5 (before
  weekday 5), lifetime membership, and no newly stored measurement.
  The other helpers are
  `windowBounds` (11-row windowing), `buildRankList` (shared renderer,
  always the full window), `relativeAge` / `formatAgeCount` + `.age-u-*`
  classes (age display and unit colors, shared with the scatter legend;
  h/d/w/y counts are one decimal including .0).   Board-shape lists
  (`has 8` / `has 7` / `max N` / `N islands` / `largest island N` /
  `N zeros`) are defined once in `boardShapeCandidates(referenceWins, wins)`
  (shared with the recent-placements summary) and rendered in
  `renderRanks` with `[record]` from the finished-board scalars computed by
  `board-shape.js` (`BoardShape.of`) at `reportResult`.
  `node tests/board-shape-test.js` freezes the neighborhood and island
  rules.
  `BOARD_METRIC_TABLES` / `boardMetricCandidates` define the independent
  same-3BV, same-greedy-ZiNi, and exact-maximum-clue time comparisons.
  They share category discovery between full tables and the summary, skip
  unmeasured values, retain all full-table standings, and keep their names
  outside the shape/time duplicate groups. `exact3BV`, `exactZiNi`, and
  `exactMaxNumber` are independent shownThings switches, default on. Each
  board table switch also gates its game-data board-trait marker (the
  `boardComparisons` list in `renderRanks`); `workSpreadTable` defaults off.
- Recent placements ([Recent placements](../product/rankings.md)): the pure span
  between the "RECENT PLACEMENTS: COMPUTATION" and ": DISPLAY" markers —
  `compareRankedWins`, `ordinal`, `formatRankRuns` (run compression),
  `recentPlacementsSummary`
  over candidates {label, dedupePriority, summaryOrder, wins, startMs (time windows only:
  the strictly-longer rule; membership charts omit it and always
  qualify), alwaysShowBest (lifetime's near-miss rule, rows flagged
  nearMiss)} — computes the rows. `SessionScope` supplies the shared source
  window and the heading selector calls `setSessionDefinition`.
  `buildRecentPlacements(record, wins, referenceMs, markReferenceRecord)` uses
  `recentPlacementCandidates`;
  `rankColumns` retains the reference date's day categories; window columns
  carry startMs. Every recent win contributes its exact 3BV, ZiNi, HZiNi,
  maximum-clue, rounded fraction/spread, and board-shape families through `boardMetricCandidates`
  and `boardShapeCandidates(recentWins, wins)`.
  Each category still ranks against the full supplied mode history. Grouping
  scans once per exact-value field; shape IDs contain their value. The summary
  ignores the largestIsland display gate. This period-wide board-category
  discovery (2026-09-21) prevents later boards hiding earlier placements.
  The builder emits the first item in the upper table collection, gated by
  shownThings.recentPlacements; nearMiss rows retain an explanatory tooltip.
  `dedupeRankCandidates` is shared
  with the full time/day and board-shape tablecharts, so the summary
  obeys `collapseDuplicateCharts` with the same pinned lifetime/week
  and most-specific-shape rules. `recentPlacementCandidates` sorts survivors
  by explicit `summaryOrder: [family, value]`; `recentPlacementsSummary`
  filters achievements while preserving that order. Families are time/day
  (0/1), 3BV/ZiNi/HZiNi/spread (2–5), exact max/has/caps (6–8), mine islands/
  largest island (9/10), then zeros/0–1 share/zero-opening coverage (11–13).
  Time/day use their full-table display order; board values ascend numerically.
  Pool size and rank never reorder rows. `BOARD_METRIC_TABLES.summaryGroup`
  and `boardShapeCandidates.summaryOrder` own board-family metadata; no
  display-label parsing. Rows stay contiguous across family boundaries, with
  no added gap. The exact current record's ordinal carries `.recent-current-rank`.
  `rankStanding(rank, total)` owns
  percentage labels, tint bands, and independent podium places;
  `applyRankHighlight` attaches the shared CSS metadata. `buildRankList`
  uses it on `.me`, with a rank/pool/percentage footer even for short lists;
  the compact summary colors every listed achievement, including earlier
  games. `recentPlacementRuns` splits compression at podium/tint boundaries
  and at the current ordinal, whose `.recent-current-rank` adds a blue edge
  and “this”. `.recent-row-ranked` takes the best reported rank's tint;
  `recentPlacementStanding` gives the fourth cell's percentage/range.
  One-result lists are neutral; last place stays visible. An odd pool's exact
  middle (`2 * rank === total + 1`, after only/last checks) has band `middle`,
  neutral tint, and label “Middle place”; its podium color remains independent.
  This avoids “Bottom 67%” for #2 of 3. These highlight
  rules (2026-09-21) do not change ranking or summary qualification.
  `node tests/recent-placements-test.js` freezes the formatting and
  summary rules; `node tests/result-presentation-test.js` freezes the
  cross-context section order.
- Rank-highlight browser verification:
  `node tests/rank-highlight-browser-check.js /path/to/playwright /path/to/chromium`
  uses an isolated profile on the permanent test origin, with renderer-only
  fixtures. It checks podium colors, percentage bands, compact-summary marking,
  low/last/only-result states, history without a selection, and 1680/1216/650px
  table layout, plus a long-session fixture with unequal pool sizes,
  contiguous numeric families and preserved current-rank marking. It checks
  gap-free summary rows, multiple table rows flowing beside the summary,
  non-overlapping later sections, and day-of-month heading help.
  The pure boundaries, rounding, stable category ordering under pool growth
  and history reversal, all 31 month dates, cross-month/year membership,
  leap day and local midnight live in recent-placements-test.
  It also exercises real `renderRanks` with a poor overall result at the
  median of its exact ZiNi/maximum-clue cohorts.
- Streaks: run-splitting and the core-trim/dedupe/domination filter are in
  `renderRanks`; see [Streak lists](../product/rankings.md) for the double-counting rationale.

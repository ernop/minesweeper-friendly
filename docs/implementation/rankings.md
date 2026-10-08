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
  h/d/w/y counts are one decimal including .0). Board-shape lists
  (`has an 8` / `has a 7` / `max number ≤ N` / `islands N` /
  `largest island N` / `zeros N`) are defined once in
  `boardShapeCandidates(referenceWins, wins)`
  (shared with the recent-placements summary) and rendered in
  `renderRanks` with `[record]` from the finished-board scalars computed by
  `board-shape.js` (`BoardShape.of`) at `reportResult`.
  `node tests/board-shape-test.js` freezes the neighborhood and island
  rules.
  `BOARD_TRAIT_NAMES` (2026-10-07) holds the one name of each board
  measurement; `BOARD_METRIC_TABLES`, `boardShapeCandidates`, and
  `BOARD_CHART_SPECS` in game/charts.js all read it, so table, game-data, and
  chart names cannot drift. A spec's `labelOf` names a grouped table by its
  range (`3BV spread 3.25–3.75 cells`).
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
  window. The "ranks won in session" heading has no selector; the box listens
  for `session-scope-change` from the one picker and rebuilds itself.
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
  The builder emits the second item in the upper table collection, after the
  session summary, gated by shownThings.recentPlacements; nearMiss rows retain
  an explanatory tooltip. `placeBoardSides` (game/layout.js) may move it right
  of the board ([layout notes](board-and-layout.md)).
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
  `rankStanding(rank, total)` owns percentage labels and standing bands
  (`top1` … `top50`, `middle`, `lower50`, `bottom10`, `last`, `only`);
  `applyRankHighlight(element, rank, total)` adds `.rank-highlight`,
  `data-rank-band`, and the title, and returns the standing. CSS maps each
  band to `--rank-tone` and `.rank-highlight` mixes it 85% with white into
  `--rank-tint` (2026-10-07: green good, red bad; no podium). `buildRankList`
  marks `.me` (its cells use `--this-game`, #39ff14, bold black) and writes
  the rank/pool/percentage footer even for short lists. In ranks won, rows
  carry no tint: `recentPlacementRuns` splits compression at band
  boundaries and at the current ordinal; each `.recent-rank-run` chip gets
  `applyRankHighlight` and `--rank-tint`, the current one
  `.recent-current-rank` (`--this-game`) and “this”; only a last-place chip keeps
  the double underline. `recentPlacementStanding` gives the fourth cell's
  percentage/range. An odd pool's exact middle (`2 * rank === total + 1`,
  after only/last checks) has band `middle` and label “Middle place”, which
  avoids “Bottom 67%” for #2 of 3. These highlight rules do not change
  ranking or summary qualification.
- Session summary (2026-10-07; [spec](../product/rankings.md#session-summary-requested-and-built-2026-10-07)):
  `sessionSummaryRows(historyByKey, from, to, difficultyKeys)` (the pure span
  "SESSION SUMMARY: COMPUTATION") returns one row per history key with games
  in the window: `{key, latest, games, wins, best, means}`, where `best` is
  the session's fastest win (`compareRankedWins`) with its rank and total
  among that key's wins up to the window's end, and `means[id]` is
  `{value, measured}` (or null) for each `SESSION_SUMMARY_MEANS` measurement
  (`time`, `bvPerSecond`, `ioe`), averaged over the session wins whose
  `GameData` value is finite. Rows follow `difficultyKeys`, then other keys
  alphabetically. It is a linear filter over saved records, so it runs on
  the page. `buildSessionSummary(record, referenceMs)` renders
  `.rank-list.session-summary` (heading "session", help naming the window)
  with `sessionSummaryTypeParts` (the board, and a variant naming a
  non-Standard mode and a non-default generator, in its own
  `.session-summary-variant` column only when some row has one; the grid's
  column count is set inline), a `.session-summary-rank` chip per best
  time, the three means in the catalog's formats, and an "all" row for more
  than one type. It carries `data-session-scope-view` and
  rebuilds itself on `session-scope-change`, then calls
  `scheduleBoardLayout` so its side placement follows its new width.
  `renderRanks` appends it first in the table collection, gated by
  shownThings.sessionSummary.
  `node tests/recent-placements-test.js` freezes the formatting and
  summary rules; `node tests/result-presentation-test.js` freezes the
  cross-context section order.
- Rank-highlight browser verification:
  `node tests/rank-highlight-browser-check.js /path/to/playwright /path/to/chromium`
  uses an isolated profile on the permanent test origin, with renderer-only
  fixtures. It checks this-game green rows without edge or podium,
  green standing chips, percentage bands, compact-summary marking, the
  session summary's rows and regeneration from the one picker,
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

- `streakRuns` stores each run's length and final timestamp, not arrays of all
  win times. `rankedStreaks` uses the monotonic endpoints of adjacent-run
  windows to eliminate contained intervals in one pass. Preparation is O(H)
  for H historical records; sorting R surviving runs is O(R log R), replacing
  quadratic containment comparisons. `tests/streak-rankings-test.js` checks
  49,149 exhaustive sequences and a 100,000-record history.
- `resultRankPlan` and recent-placement summaries execute in the ranking
  worker. Rank tables return counts, selected indexes, and the visible window;
  highlighting, labels, and section order stay in the renderer. Recent
  placements expose a pending status while their rows are calculated.

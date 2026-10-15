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
  classes (age display and unit colors; a rank row's sub-minute age that
  is not this game is minutes green with no chip, while the scatter
  legend keeps the fluorescent seconds chip;
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
  `exactMaxNumber` are independent shownThings switches, default on;
  `workSpreadTable` defaults off. They gate the tables and the board-trait
  charts, not game data's board-trait rows, which `gameDataBoardTraits`
  chooses since 2026-10-14 ([game data](game-data.md)).
- Recent placements ([Recent placements](../product/rankings.md)): the pure span
  between the "RECENT PLACEMENTS: COMPUTATION" and ": DISPLAY" markers —
  `compareRankedWins`, `ordinal`, `formatRankRuns` (run compression),
  `recentPlacementsSummary`
  over candidates {label, summaryOrder, ranked (the chart's entries in table
  order, each carrying the `endedAt` of the win that earned it), startMs
  (time windows only: the strictly-longer rule; membership charts and the
  streak lists omit it and always qualify), alwaysShowBest (lifetime's
  near-miss rule, rows flagged nearMiss)} — computes the rows. The current
  record's rank is the entry whose `endedAt` is its own. `SessionScope` supplies the shared source
  window. The "ranks won in session" heading has no selector; the box listens
  for `session-scope-change` from the one picker and rebuilds itself.
  `buildRecentPlacements(record, modeRecords, referenceMs, markReferenceRecord)`
  sends the mode's records in finish order to the worker's
  `recent-placements` task: wins as `analysisRecord`, losses as
  `{outcome, endedAt}`. A loss only breaks streaks; on the player's
  2026-10-07 Intermediate and Expert histories (2,795 and 2,214 games), full
  loss records added 15–18 ms of game-end mapping and copying, the two-field
  form about 1 ms (Node, 2026-10-10). The task finds the reference record
  among them by `recordEndedAt` and calls `recentPlacementCandidates`;
  `rankColumns` retains the reference date's day categories; window columns
  carry startMs. The task data also carries `boardEndedAt` (the shown
  record, always set, unlike `recordEndedAt`) and `otherBoards`
  (shownThings.recentPlacementsOtherBoards). `recentPlacementBoardWins`
  turns them into the `boardWins` argument of `recentPlacementCandidates`:
  the win finishing at `boardEndedAt` (none when the shown record is a loss
  in a mode without wins), or with `otherBoards` every win from
  `sourceStartMs` on. Those wins contribute their exact 3BV, ZiNi, HZiNi,
  maximum-clue, rounded fraction/spread, and board-shape families through
  `boardMetricCandidates` and `boardShapeCandidates(boardWins, wins)`.
  Each category still ranks against the full supplied mode history. Grouping
  scans once per exact-value field; shape IDs contain their value. The summary
  ignores the largestIsland display gate. The period-wide discovery
  (2026-09-21) was the default until 2026-10-14 and now sits behind the
  switch; the heading's help names which wins' boards are listed.
  The builder emits the second item in the upper table collection, after the
  session summary, gated by shownThings.recentPlacements; nearMiss rows retain
  an explanatory tooltip. `placeBoardSides` (game/layout.js) may move it right
  of the board ([layout notes](board-and-layout.md)).
  `dedupeRankCandidates` is shared
  with the full time/day and board-shape tablecharts, so the summary
  obeys `collapseDuplicateCharts` with the same pinned lifetime/week
  and most-specific-shape rules. `recentPlacementCandidates` dedupes on the
  member `wins`, sorts each survivor's wins with `compareRankedWins` into
  `ranked`, appends one candidate per `STREAK_TABLES` entry (its `ranked` is
  `rankedStreaks` in table order, each streak carrying its last win's
  `endedAt`), and sorts all
  by explicit `summaryOrder: [family, value]`; `recentPlacementsSummary`
  filters achievements while preserving that order. Families are time/day
  (0/1), streaks (2, by allowed losses), 3BV/ZiNi/HZiNi/spread (3–6), exact
  max/has/caps (7–9), mine islands/largest island (10/11), then zeros/0–1
  share/zero-opening coverage (12–14).
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
  carry no tint: `recentPlacementRuns(ranks, currentRank)` joins consecutive
  ranks and splits only at the current ordinal; each `.recent-rank-run` is
  plain bold black (no `applyRankHighlight`), the current one
  `.recent-current-rank` (`--this-game`) and “this”. Each row has five grid
  cells: name, ranks, `.recent-of-cell` (“of”), `.recent-total-cell` (the
  list size, right-aligned, tabular digits), and `.recent-standing-cell`.
  `rankStanding` also returns `side` and `percent` for percentage labels;
  `recentPlacementStanding` joins two different labels as
  `side percent – percent%`. An odd pool's exact middle (`2 * rank === total + 1`,
  after only/last checks) has band `middle` and label “Middle place”, which
  avoids “Bottom 67%” for #2 of 3. These highlight rules do not change
  ranking or summary qualification.
- Session summary (2026-10-07; [spec](../product/rankings.md#session-summary-requested-and-built-2026-10-07)):
  `sessionSummaryRows(historyByKey, from, to, difficultyKeys)` (the pure span
  "SESSION SUMMARY: COMPUTATION") returns one row per history key with games
  in the window: `{key, latest, games, wins, best, means, noMark}`, where `best` is
  the session's fastest win (`compareRankedWins`) with its rank and total
  among that key's wins up to the window's end, and `means[id]` is
  `{value, measured}` (or null) for each `SESSION_SUMMARY_MEANS` measurement
  (`time`, `bvPerSecond`, `ioe`), averaged over the session wins whose
  `GameData` value is finite. Rows follow `difficultyKeys`, then other keys
  alphabetically. It is a linear filter over saved records, so it runs on
  the page. `noMark` is true when every record of that key is markless.
  `buildSessionSummary(record, referenceMs, markCurrent, noMark)` renders
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
  Session results (2026-10-11 as loss types; wins added 2026-10-14): each
  row also carries `endings` (games per result: `winTypeOf(record)` for a
  win, `sessionEndingKind(fatalEvaluationOf(record))` for a loss as the
  session backfill files it, so they sum to `games`) and `likelyMisclicks`
  (losses per `likelyMisclickReasonsOf` reason). The span calls the verdict
  functions at run time, so its test loads the verdict span and justice.js.
  `buildSessionSummaryResults(rows)` groups rows by
  `sessionSummaryTypeParts(row).board` (every size played) into
  `.session-summary-results` under the main grid. One size: result, games,
  share of games. More than one: result, then that size's name and "share"
  per size, with `.session-summary-size` on each count column. Win types
  follow WIN_TYPE_LABELS order with the `SESSION_END_SPECS` win color
  (`.session-summary-win`); loss kinds follow SESSION_END_SPECS order with
  the spec's label and swatch (`.session-summary-loss`); then the reasons in
  LIKELY_MISCLICK_REASON_LABELS order. The first loss row and the first
  misclick row carry `.session-summary-group-first` (a rule above). Each
  share divides by that size's games. Gated by shownThings.sessionEndings.
  `lossTypeOf` memoizes per evaluation object (a WeakMap), so rebuilding the
  summary after each game classifies only the new loss.
  `node tests/recent-placements-test.js` freezes the formatting and
  summary rules, including streak rows across the session start, the
  current streak's chip, and their place after the day categories;
  `node tests/analysis-worker-test.js` runs the worker task with losses;
  `node tests/result-presentation-test.js` freezes the
  cross-context section order.
- No-mark wins (2026-10-14; [spec](../product/rankings.md#no-mark-wins-decided-2026-10-14)):
  `noMarkComparison(record, records)` keeps every record unless the result
  is a markless win, in which case it keeps `isMarkless` records of that
  same history key. `renderResultAsync` passes that list into `renderRanks`
  with `options.noMarkTimeLabel` from `noMarkTimeLabel()` ("top expert
  no-mark times", or the current board's name). `noMarkRankLabel` applies
  it to the lifetime list and suffixes every other list; streaks get a
  "no-mark " prefix. `noMarkSessionHistory` narrows only the result's own
  key, and only when `buildSessionSummary` is called with `noMark` set, so
  a loss keeps the shared session. Game data pool text is
  `gameDataPoolLabel`, switched by `gameDataNoMark` inside
  `buildBoardTimeRankProfile`. Known answers are in
  `tests/recent-placements-test.js`.
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
- Streaks: run-splitting (`streakRuns`) and the core-trim/dedupe/domination
  filter (`rankedStreaks`) are the "STREAK RANKINGS: COMPUTATION" span; see
  [Streak lists](../product/rankings.md) for the double-counting rationale.
  `STREAK_TABLES` (label, display setting, allowed losses) drives both
  `resultRankPlan` and `recentPlacementCandidates`, so ranks won uses the
  tables' ranks; only `resultRankPlan` reads the display setting.

- `streakRuns` stores each run's length and final timestamp, not arrays of all
  win times. `rankedStreaks` uses the monotonic endpoints of adjacent-run
  windows to eliminate contained intervals in one pass, then sorts by length,
  equal lengths by earlier last win. Preparation is O(H)
  for H historical records; sorting R surviving runs is O(R log R), replacing
  quadratic containment comparisons. `tests/streak-rankings-test.js` checks
  49,149 exhaustive sequences and a 100,000-record history.
- `resultRankPlan` and recent-placement summaries execute in the ranking
  worker. Rank tables return counts, selected indexes, and the visible window;
  highlighting, labels, and section order stay in the renderer. Recent
  placements expose a pending status while their rows are calculated.

# Result presentation — implementation notes

Spec: [docs/product/results.md](../product/results.md). Index: [AGENTS.md](../../AGENTS.md).

- Unified result presentation: the pure span between the "RESULT
  PRESENTATION MODEL" and "DISPLAY" markers defines semantic phase and chart
  section order for post-game and score contexts. `createResultSectionCollector`
  collects computed nodes and emits only nonempty sections in that order;
  each `.result-chart-section-items` wraps internally. A section with a
  heading gets `resultOpenerHead('h3', spec.id, spec.label, items)`: its
  title opens and closes the items as the panel named by the section id
  (`boardTables`, `perfCharts`, `boardCharts`, `relationships`), and the
  chart mode select follows the title in the head. The upper table
  collection (no heading) uses a CSS flow root holding at most three
  children, which `renderRanks` builds: `sessionTablesColumn` (a floated
  `.session-tables` holding the summary and ranks won, each a left float
  with `clear: left`), the loss's `.game-stats` (a left float), and
  `rankTablesGroup` (`.rank-tables`: a `div.stat-section-head` with the
  "rankings" title, panel `rankTables`, then `.rank-tables-body` with the
  time, category, and streak lists as inline blocks). The head is a flex
  box, so it sits beside the floats; the body's line boxes wrap the lists
  alongside them and then below. Any block placed beside the board
  (`.beside-board`, absolute) leaves the flow. The flow root contains the
  floats so later sections cannot overlap them; negative bottom margin
  offsets the table spacing at the section boundary, and a closed
  `.rank-tables` pads its bottom by that spacing (`:has()`). The summary,
  ranks won, and this game get their title from
  `resultTableOpener(table, panelKey, title, help)` (panels
  `sessionSummary`, `recentPlacements`, `gameStats`), which returns the
  body that takes the rest of the table.
  The invariant is
  sidebar outcome + game-data facts → tables (session summary, placements,
  time/category tables, all streak variants) → boardTables ("This board") → perfCharts ("your perf")
  → boardCharts ("board traits") → relationship scatters. Game data replaces regular winning stats in
  `#result-stats`, as one chart with "game summary perf" and
  "board traits" sides under live perf charts, outside the lower chart
  collector.
  `tests/result-presentation-test.js` checks this in both result contexts;
  `tests/session-placement-layout-fixture.js` checks the side placement,
  the column below the board, the rankings opener, and closed blocks
  keeping their places at four widths; `tests/board-time-profile-browser-check.js`
  clicks every opener closed, checking each title stays put, the help tip
  leaves its title uncovered, and the state survives a redraw and a reload.
- This game's stats (2026-10-26, [spec](../product/results.md#this-games-stats-creator-request-2026-10-26)):
  `buildGameStats(record)` in `game/results.js` builds the label/value table,
  a `.rank-list.game-stats` titled "this game" (an opener, panel
  `gameStats`) around a two-column `.game-stats-grid` (label `.stat-label`,
  value `.stat-value`).
  `renderResultAsync` builds it when `shownThings.gameStats` is on and the
  record is a loss, or a trial game outside the score viewer, and passes it
  to `renderRanks` as `gameStats`, which appends it to the tables section
  right after the session tables column; a trial game's result appends it to
  `#result-ranks` alone, in the trial's centered flex stream. While a result
  loads, `#stats-grid.immediate-stats` in `#result-stats` shows the final
  time only (`renderImmediateGameEnd`).
- The table shows each GameData catalog measurement through
  `measurementRow(id)` in `buildGameStats`: the catalog's name (first letter
  capitalized) and format. `shownMeasurement(record, id)` decides whether it shows: only on
  wins unless the metric is `allOutcomes` (2026-10-07), and only when finite.
  The play-statistics fields use the same function.
  Rows without a catalog measurement (counts, board facts, chord share, flag
  rate, Justice, ledger facts) keep their own formatting.

- `renderResult` returns a completion promise; a view revision invalidates
  older renders on restart or selection changes. `createResultSectionCollector`
  waits for node analysis promises before committing its ordered sections.
  Existing report controls stay mounted during recalculation. `reportResult`
  captures primary facts synchronously, persists them, and delegates heavy
  measurements to the report worker. Replies can enrich their saved record
  after a restart but cannot overwrite a newer game or score view.

# Result presentation — implementation notes

Spec: [docs/product/results.md](../product/results.md). Index: [AGENTS.md](../../AGENTS.md).

- Unified result presentation: the pure span between the "RESULT
  PRESENTATION MODEL" and "DISPLAY" markers defines semantic phase and chart
  section order for post-game and score contexts. `createResultSectionCollector`
  collects computed nodes and emits only nonempty sections in that order;
  each `.result-chart-section-items` wraps internally. The upper table
  collection uses a CSS flow root: the session summary floats left and ranks
  won floats left with `clear: left` under it, one column; other tables are
  inline blocks, wrapping alongside that column and then below. Either block
  placed beside the board (`.beside-board`, absolute) leaves the flow. The
  flow root contains the floats so later sections cannot overlap them;
  negative bottom margin offsets the table spacing at the section boundary.
  The invariant is
  sidebar outcome + game-data facts → tables (session summary, placements,
  time/category tables, all streak variants) → boardTables ("This board") → perfCharts ("your perf")
  → boardCharts ("board traits") → relationship scatters. Game data replaces regular winning stats in
  `#game-data-column` (or `#result-stats` when that column is not docked),
  outside the lower chart collector.
  `tests/result-presentation-test.js` checks this in both result contexts;
  `tests/session-placement-layout-fixture.js` checks the side placement and
  the column below the board at four widths.
- The label/value stats grid (losses, trials, history views) shows each
  GameData catalog measurement through `measurementRow(id)` in
  `renderResultAsync`: the catalog's name (first letter capitalized) and
  format, and only on wins unless the metric is `allOutcomes` (2026-10-07).
  Rows without a catalog measurement (counts, board facts, chord share, flag
  rate, Justice, ledger facts) keep their own formatting.

- `renderResult` returns a completion promise; a view revision invalidates
  older renders on restart or selection changes. `createResultSectionCollector`
  waits for node analysis promises before committing its ordered sections.
  Existing report controls stay mounted during recalculation. `reportResult`
  captures primary facts synchronously, persists them, and delegates heavy
  measurements to the report worker. Replies can enrich their saved record
  after a restart but cannot overwrite a newer game or score view.

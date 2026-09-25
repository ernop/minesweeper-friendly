# Result presentation — implementation notes

Spec: [docs/product/results.md](../product/results.md). Index: [AGENTS.md](../../AGENTS.md).

- Unified result presentation: the pure span between the "RESULT
  PRESENTATION MODEL" and "DISPLAY" markers defines semantic phase and chart
  section order for post-game and score contexts. `createResultSectionCollector`
  collects computed nodes and emits only nonempty sections in that order;
  each `.result-chart-section-items` wraps internally. The upper table
  collection uses a CSS flow root: ranks won floats left and other tables
  are inline blocks, wrapping alongside its remaining height and then below.
  The flow root contains the summary so later sections cannot overlap it;
  negative bottom margin offsets the table spacing at the section boundary.
  The invariant is
  sidebar outcome + game-data facts → tables (placements, time/category tables,
  all streak variants) → boardTables ("This board") → perfCharts ("your perf")
  → boardCharts ("board traits") → relationship scatters. Game data replaces regular winning stats in
  `#game-data-column` (or `#result-stats` when that column is not docked),
  outside the lower chart collector.
  `tests/result-presentation-test.js` checks this in both result contexts.

- `renderResult` returns a completion promise; a view revision invalidates
  older renders on restart or selection changes. `createResultSectionCollector`
  waits for node analysis promises before committing its ordered sections.
  Existing report controls stay mounted during recalculation. `reportResult`
  captures primary facts synchronously, persists them, and delegates heavy
  measurements to the report worker. Replies can enrich their saved record
  after a restart but cannot overwrite a newer game or score view.

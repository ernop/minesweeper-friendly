# Board measurements — implementation notes

Spec: [docs/product/per-game-stats.md](../product/per-game-stats.md), [docs/product/rankings.md](../product/rankings.md). Index: [AGENTS.md](../../AGENTS.md).

- Rigorous board-metric research: `reference/board-metric-definitions.md`
  defines 3BV, exact minimum chord clicks versus ZiNi heuristics, work spread
  and work-tree length, and a start-conditioned clue-width closure plus its
  board-only distribution over safe starts. The separate reference calculator
  is not loaded by the game. `tests/board-metric-definitions-test.js` checks
  hand-calculated examples, symmetry, bounds, monotone deduction coverage,
  all 63 non-full 3x2 layouts, and explicit exact-search size limits.
  Current production: `board-metrics.js` calculates 3BV spread, 0–1 share,
  and zero-opening coverage, and uses `zini.js` for Human ZiNi. The existing
  `hzini` field remains its sole primary value. `boardMetrics` stores versioned
  `workSpread`, `safeCells`, `zeroOpenedZeroOneCells`, and `zeroOpenedCells`; fraction
  values are derived. This board shows values in tablechart headings only;
  `buildRankList` accepts optional help and uses `chartHelpButton(help, label)`
  on those headings. Help contains definitions, precise measurements, and
  group rules. HZiNi efficiency stays win-only in Game stats
  (`hziniEfficiencyOf`). HZiNi matches exact integers; `boardShareGroup`
  rounds both fractions to the nearest whole percentage point using integer
  counts (halfway up); `boardSpreadGroup` rounds to the nearest 0.5 cell
  with `Math.round(2 * value) / 2`. There is no preliminary decimal rounding.
  Recorded measurements stay unchanged. Full tables and recent summaries
  share these groups through `BOARD_METRIC_TABLES` / `boardMetricCandidates`.
  `buildBoardMetricStatus` replaces the cards with calculation/error status
  and backfill progress; saved display key `boardMetricFacts` now controls
  only backfill progress. Status/error messages remain visible independently.
  First losses still render the measured table headings with empty win pools.
  Retired research fields remain stored but are not used by the display.
  `board-metrics-worker.js` performs calculations; `board-metrics-ui.js`
  serializes captured-record jobs and optional saved-win backfill from final
  traces. `hasBoardMeasurements` requires all four measurements, including
  the corrected zero-opened 0/1 numerator. Earlier `zeroOneCells` counted
  covered ones too: preserve that distinct historical field in exports,
  never use it in corrected comparisons, and backfill the missing
  `zeroOpenedZeroOneCells` from the final trace. Older HZiNi/spread-only
  records also qualify. Bulk backfill is initiated by the player.
  `boardMetricBackfillProgress` derives
  checked/total, measured, unavailable, failed, active, and remaining counts
  from history, the source catalog, and session-local jobs. The v3 traces index
  `boardsByModeAndSize` uses `[mode, finalBoard.cells.length]`; `loadBoardMetricSources`
  reads matching primary keys once per mode before offering bulk work. Absent
  boards cannot reappear as work on reload, and no persistent skip flags prevent
  restored traces from qualifying. `saveTrace` invalidates this catalog on commit
  through `boardMetricSourcesChanged`; pending batches wait for its refresh.
  Stop finishes the current board; Resume/Paused require an explicit Stop in
  this page. After reload the action is `Backfill saved wins` and still skips
  completed records. Each result is persisted
  separately and immediately eligible for ranks. Missing traces stay
  unmeasured; actual read/calculation errors display their messages. Hide
  the progress panel when no job is active and no unattempted record remains;
  retain actionable paused progress and show errors outside the panel.
  `tests/board-metrics-test.js` independently executes the documented HZiNi
  action rules on 511 small and 300 standard-size layouts. The exact
  opening-first minimum C₀* has a <=16-cell reference calculator, not a
  production scalar; HZiNi is explicitly not its global optimum.
  `reference/board-metric-searches.js` retains the C*/RCW research separately,
  verified by `tests/board-metric-searches-test.js`. No game script loads it.
  `tests/board-metrics-browser-check.js` covers real game completion, worker
  replies across mode switches, storage/reload, incremental backfill progress,
  partial-table use, pause/reload/resume, v2 index upgrades, repeated reloads
  after exhaustion, restored sources, exact cohorts, tooltips and layout.
  Research backing the two new fractions and the declined additional proposals: `reference/board-structure-research.md`
  defines 0–1 share and zero-opening coverage over safe cells, largest-opening
  share, remaining safe-work clusters, complete one-/two-equation deduction
  closure, synchronous rounds and mean coverage over all safe starts.
  `reference/board-structure-metrics.js` implements these exact research
  calculators; `tests/board-structure-metrics-test.js` compares pair inference
  against 8,704 exhaustive equation cases, structure on 511 boards, and
  complete closure/rounds against an independent tiny-board Boolean solver.

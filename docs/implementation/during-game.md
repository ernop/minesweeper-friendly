# During the game — implementation notes

Spec: [docs/product/during-game.md](../product/during-game.md). Index: [AGENTS.md](../../AGENTS.md).

## Files

- `during-game.js` (repository root, pure): `DuringGame`, the model, the
  row catalog, the averaging, and the hover lookup. It loads on the game
  page and the settings page before `settings-core.js` (whose
  `duringGameRows` and `duringGameAverage` schema entries read
  `DuringGame.defaults`, `DuringGame.AVERAGES`, and
  `DuringGame.DEFAULT_AVERAGE`), and in `analysis-worker.js`. At call time it
  uses `pathDecisionEvents`, `positionView`, and `squareDistance`
  (`game/replay-model.js`), `Justice`, `sessionMedian`,
  `SESSION_MOVING_PRESS_MS` and `SESSION_MIN_PLAY_MS`
  (`game/session-stats.js`), `FASTCLICK_MAX_GAP_MS`, and `GameData` formats.
- `game/during-game-chart.js` (after `game/game-data-chart.js`): the page
  side. `duringGameSourceId` names the game whose trace the reports worker
  holds; `buildDuringGameSection(record, isCurrent)` builds the section
  host, its head controls, and configure; `renderDuringGameRows` draws the
  grid and wires hover and the replay link; `drawDuringGameBoard` draws the
  hover card's board.
- `analysis-worker.js` imports `justice.js`, `board-icons.js` (whose
  `FLAG_COLOR` `game/replay-model.js` reads at load), `game/replay-model.js`,
  and `during-game.js`.

## Worker task and the held trace

The trace is cloned to the reports worker once. `finished-game` (with
`gameId: record.endedAt`, and the trace's `initialPageState`) and
`restore-trace` (with the stored trace) each keep `{id, width, height,
mines, t, x, y, events, initialPageState}` as the worker's
`duringGameSource` and drop the cached model. The page sets
`duringGameSourceId = record.endedAt` just before posting either
(`reportResult` in `game/results.js`, the restore path in
`preferences-game.js`); `duringGameAvailable(record)` gates the section on
it, so a record rendered without its trace in the worker (tests, the score
viewer) shows none.

`during-game` takes `{gameId, timeMs, outcome, rows, average}`. A `gameId`
other than the held source's throws. The first request builds
`DuringGame.model` and keeps it; changing rows or averaging only reruns
`DuringGame.view`. Both tasks run on the same `reports` lane, so the held
source is always the latest finished or restored game.

## Model

`DuringGame.model(game)` returns `{recorded: false}` for a trace without
decisions. Otherwise:

- Clock: the game clock starts at the median of `t - evaluation.atMs` over
  decisions after the first; the axis runs to the record time or the last
  decision, whichever is later.
- Pass 1, per decision in replay order (`pathDecisionEvents`): opened safe
  squares and solved 3BV units (`boardUnits` on the final layout: each zero
  region is one unit, each number touching none is one), flagged mines,
  and, whenever the revealed count changed, two proofs of the position
  before the action: the counting tier (`{subset: false, global: false,
  exact: false}`) and the full exact proof. Safe squares known, work areas,
  and the proven-safe list are null where the exact proof is incomplete.
- Pass 2: each action's gap, squares moved, cursor path, moving flag (the
  fastclick definition), no-op reason, misclick (recomputed from the exact
  proof as `Solver.isVisibleMisclick` judges it), guess, opening,
  wrong flag, flag removal (quick undo within `QUICK_UNDO_MS`), long gap
  (`LONG_GAP_MS`), and moves. "Near" is a zone stamp: every square within
  `NEAR_SQUARES` of what the previous board-changing action opened or
  marked. A move is a board-changing click outside that zone and not within
  `NEAR_SQUARES` of a proven-safe square in it; left work when such squares
  remained, moved on when none did; a fork when the exact proof's
  proven-safe squares formed 2 or more areas (`areasOf`, linking squares
  within `AREA_LINK_SQUARES`); came back when a later click reaches squares
  a left-work move left behind, still proven safe and unflagged.
- Window left: spans from the trace's `page-state` events and
  `initialPageState`. A trace without `initialPageState` (before capture
  version 1, 2026-09-26) recorded no page states: `pageStateRecorded` is
  false, the window-left row's data is `{kind: 'unrecorded'}`, and long-gap
  events carry no `windowLeft`.

Cost (2026-10-15, scripted Expert wins of 290–340 actions in Node):
about 120 ms for the model and 10–20 ms for a view of every row with the
rolling average. The result collector waits for the section's
`analysisReady`, so the lower result sections wait for it too; the reports
lane runs it after `finished-game`.

## Rows and averaging

`ROWS` entries hold `id`, `group`, `name`, `default`, `help`, `format`, and
`data(model)`, whose `kind` (progress, state, rate, ratio, value, speed,
events, unrecorded) decides drawing and averaging. Rows named like a game
data measurement take its format from `GameData.metrics`. `windowValue`
measures a row over a time window (undefined under `SESSION_MIN_PLAY_MS`);
`gameValue` is the right-hand whole-game value; `drawn` returns `steps`,
`events`, `ticks`, or `points`, plus `buckets` or a 241-point rolling
`line`. `view(model, rowIds, averageId)` adds each action's time, kind, and
square for the hover card and replay link. `valueAt(row, atMs,
toleranceMs)` answers the hover. Unknown rows and averages throw.

## Page

- `renderResultAsync` appends the section after the rank tables when
  `shownThings.duringGame` is on, outside the score viewer and trial play,
  and the trace is held. The result phase and section `duringGame` (order
  65, `postGame` only) sit between `boardTables` and `perfCharts`. The
  collector puts every node's `headControls` (here the averaging select,
  configure, and the help button) beside the section title.
- `renderDuringGameRows` throws if the page's replay frames and the view's
  actions differ in number: hover and the replay link index one by the
  other. A click calls `rememberPanel('replay', true)` before
  `setReplayStep`, because every replay render re-syncs the panel from
  `settings.panels.replay`.
- The section host's `ResizeObserver` redraws the plots at the plot
  column's width; the value column is a fixed 11ch, so hover changes no
  width.

## Tests

- `tests/during-game-test.js`: the model and rows inside the worker on
  hand-built boards (13×3 and 15×3) with worked-out proofs: progress, known
  squares, every event type including forks and came back, averaging, the
  worker round trip and its throws, window-left spans, and an unrecorded
  trace.
- `tests/during-game-browser-check.js PLAYWRIGHT_CORE_DIR CHROMIUM
  [SCREENSHOT_DIR]`: real games with real mouse input under the routed test
  origin: section order, rows and values, hover line, values, and card, the
  replay link, configure, averaging, restore after reload, a loss, and a
  390 px viewport.
- `tests/result-presentation-test.js` holds the section order; the settings
  tests load `during-game.js` before `settings-core.js`.

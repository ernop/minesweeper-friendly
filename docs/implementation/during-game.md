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
  holds. `buildDuringGameBlock(record, isCurrent)` builds the block: title,
  charts, the averaging and configure row (game data's
  `.game-data-controls`), and the configure view. `renderDuringGameCharts`
  draws `DuringGame.CHARTS` and the event lanes on one time axis and wires
  hover and the replay link. The board at a moment (`duringGameBoard`,
  `paintDuringGameBoard`, `placeDuringGameBoard`) and the card
  (`duringGameCard`, `placeDuringGameCard`) are body-level manual popovers,
  so they show above the Game details popover too; `hideDuringGameHover`
  closes both, and `clearResultStats` calls it.
- `game/replay-view.js` lends the board at a moment
  `paintReplayFrame(model, elements)`, which paints any list of squares, and
  `finishedBoardCells()`.
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
rolling average. `renderResultAsync` builds the block, which starts its
task, before `renderRanks`, so the reports lane (after `finished-game`)
runs it beside the rankings lane's tables. `renderRanks` waits for it after
the board tables, before game data and the charts.

## Rows and averaging

`CHARTS` lists the shared charts in order: `id`, `name`, `unit`, `scale`
('share' for a fixed 0 to 1, 'log', else linear from 0), and `percent`
(fractions labeled as percentages). `ROWS` entries hold `id`, `group`,
`name`, `default`, `help`, `format`, `chart` (every row but the events),
and `data(model)`, whose `kind` (progress, state, rate, ratio, value,
speed, events, unrecorded) decides drawing and averaging. Rows named like a game
data measurement take its format from `GameData.metrics`. `windowValue`
measures a row over a time window (undefined under `SESSION_MIN_PLAY_MS`);
`gameValue` is the right-hand whole-game value; `drawn` returns `steps`,
`events`, `ticks`, or `points`, plus `buckets` or a 241-point rolling
`line`. `view(model, rowIds, averageId)` adds each action's time, kind, and
square for the hover card and replay link. `valueAt(row, atMs,
toleranceMs)` answers the hover. Unknown rows and averages throw.

## Page

- `renderResultAsync` builds the block when `shownThings.duringGame` is on,
  outside the score viewer and trial play, and the trace is held, and hands
  it to `renderRanks` as `options.duringGame`. `renderRanks` keeps it out of
  the options it sends the rankings worker (a DOM node does not clone) and
  puts it first in `#result-stats`, in the same task as game data's frame.
  `buildDuringGameBlock` builds it with `buildStatSection('duringGame', …)`,
  so its title opens and closes it as the remembered panel
  `settings.panels.duringGame`; the charts, lanes, and controls sit in the
  section body.
- Charts: one SVG per chart under its HTML legend; the lanes are one SVG
  beside an HTML names column. `duringGameLeftMargin` measures every y tick
  label and every lane name with its count (canvas `measureText` in the CSS
  fonts), so every part's plot starts at the same x. The time axis takes
  `niceTicks` at about one tick per 56 px, labeled under the first and last
  parts. `duringGameScale` gives the y ticks: progress every 20%, gaps at
  powers of ten with minor ticks 2 to 9, the rest at 0, the middle, and the
  top. The block's `ResizeObserver` redraws at the column's width; legend
  values are whole-game values, so hover changes no width.
- Hover: `stepAt` turns the moment into a replay step, the first action
  after it, or the finished board within hover reach of the axis's end.
  The board is repainted only when its step or proven-safe set changes:
  `replayFrameModel` with no solver read, every mark but `selected`
  cleared, then `safe` on the proven-safe squares. Its squares are real
  `.cell` divs, so `paintCellGlyph`, `chosenFlagSvg`, and `mineSvg` apply
  the player's number display, flag style and color strength, and mine
  style, and `--flag-size` scales with the grid's own `--cell-size` (from
  a 400 x 300 px box, narrower in a narrow window, 6 to 24 px a square).
  The grid restates `--bevel-size`, which `:root` resolves at the page's
  square size. The head's min-width is measured once per game for its
  longest text, so the panel keeps its size.
- `renderDuringGameCharts` throws if the page's replay frames and the
  view's actions differ in number: hover and the replay link index one by
  the other. A click calls `rememberPanel('replay', true)` before
  `setReplayStep`, because every replay render re-syncs the panel from
  `settings.panels.replay`.

## Tests

- `tests/during-game-test.js`: the model and rows inside the worker on
  hand-built boards (13×3 and 15×3) with worked-out proofs: progress, known
  squares, every event type including forks and came back, averaging, the
  worker round trip and its throws, window-left spans, and an unrecorded
  trace.
- `tests/during-game-browser-check.js PLAYWRIGHT_CORE_DIR CHROMIUM
  [SCREENSHOT_DIR]`: real games with real mouse input under the routed test
  origin: the block at the head of the docked column, the charts and legend
  rows, one plot x and width for every part, the progress chart's labels,
  hover line, card, and the board in the player's number and flag style
  beside the block, fixed while the pointer moves, the finished board at
  the end, the long-gap lane's proven-safe ring, the replay link,
  configure, averaging, restore after reload, a loss, an 1100 px viewport
  (the block in the details column, the board beside it, the card inside
  the window), and a 390 px viewport (block first in the details popover,
  board clear of the chart and card).
- `tests/result-presentation-test.js` holds that no result section carries
  the block; the settings tests load `during-game.js` before
  `settings-core.js`.

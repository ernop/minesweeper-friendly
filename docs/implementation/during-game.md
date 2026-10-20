# During the game — implementation notes

Spec: [docs/product/during-game.md](../product/during-game.md). Index: [AGENTS.md](../../AGENTS.md).

## Files

- `during-game.js` (repository root, pure): `DuringGame`, the model, the
  row catalog, the averaging, and the hover lookup. It loads on the game
  page and the settings page before `settings-core.js` (whose
  `duringGameRows` and `duringGameAveraging` schema entries read
  `DuringGame.defaults`, `DuringGame.AVERAGES`, and
  `DuringGame.DEFAULT_AVERAGE`), and in `analysis-worker.js`. At call time it
  uses `pathDecisionEvents`, `positionView`, and `squareDistance`
  (`game/replay-model.js`), `Justice`, `medianOf`, `gapSpreadRatioOf`,
  `CADENCE_MOVING_WINDOW_MS`, and `FASTCLICK_MAX_GAP_MS` (`game/trace-metrics.js`),
  and `GameData` formats.
- `game/during-game-chart.js` (after `game/game-data-chart.js`): the page
  side. `duringGameSourceId` names the game whose trace the reports worker
  holds. `buildDuringGameBlock(record, isCurrent)` builds the block: title,
  charts, the averaging and configure row (game data's
  `.game-data-controls`), and the configure view. `renderDuringGameCharts`
  draws `DuringGame.CHARTS` and the event tracks (`DuringGame.TRACKS`) on
  one time axis and wires hover and the replay link. The board at a moment (`duringGameBoard`,
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
  `NEAR_SQUARES` of a proven-safe square in it; moved on when no such
  squares remained, else left easy work when the counting proof
  (`countingFactsAt`) marks one of them safe and left hard work when it
  marks none (counting's facts are always complete and inside the full
  proof's, so the split holds where the full proof stopped at its limit);
  every move carries its `gapMs`; a fork when the exact proof's
  proven-safe squares formed 2 or more areas (`areasOf`, linking squares
  within `AREA_LINK_SQUARES`); came back when a later click reaches squares
  a move left behind, still proven safe and unflagged. `movesJudged` is
  false when any move fell on a position whose exact proof was
  incomplete (its kind or fork unknown). Each
  action also carries its report `category` (`actionEvaluationCategory`),
  a game risk action its `riskDelta`, and a lower-modeled-life choice its
  `lifeGap`, the magnitudes `actionCategorySummary` sums for the record;
  `categoriesMeasured` is false when any action falls under measurement
  notes, and the report rows (`categoryRate`) are then `unrecorded`.
- Presses: every `ldown` and `rdown` on the game clock with its gap from
  the press before, as the trace's cadence counts them, for cadence spread.
- Window left: spans from the trace's `page-state` events and
  `initialPageState`. A trace without `initialPageState` (before capture
  version 1, 2026-09-26) recorded no page states: `pageStateRecorded` is
  false, the window-left row's data is `{kind: 'unrecorded'}`, and long-gap
  events carry no `windowLeft`.

`DuringGame.moveHabits(model)` gives the record's move habits (`movesRanOut`,
`movesLeftHardWork`, `movesLeftEasyWork`, `moveGapMedianMs` with
`medianOf` when there is a move, `forkMoves`, `forkMovesToNearestArea`),
or nothing for an unrecorded trace or when `movesJudged` is false.
`finishedMeasurements` in `analysis-worker.js` adds them when the plan's
`needMoveHabits` is set: always in `finished-game` (`reportResult` sends
`timeMs` and `outcome`), and in `restore-trace` when the record lacks
`movesRanOut` (`preferences-game.js`). It builds the held model through
`heldDuringGameModel`, so the live perf charts' first request reuses it.

Cost (2026-10-15, scripted Expert wins of 290–340 actions in Node):
about 120 ms for the model and 10–20 ms for a view of every row with the
rolling average; 2026-10-20, a scripted Expert win of 201 actions in
headless Chromium: 46–70 ms. Since 2026-10-20 the model is built inside
`finished-game`, before the first full result render, which therefore
comes that much later; the live perf charts then need only the view.
`renderResultAsync` builds the block, which starts its task, before
`renderRanks`, so the reports lane (after `finished-game`) runs it beside
the rankings lane's tables. `renderRanks` waits for it after the board
tables, before game data and the charts.

## Rows and averaging

`CHARTS` lists the two charts in order: `id`, `name`, and `scale`
('share' for progress's fixed 0 to 1, 'relative' for the chart of each
line against its whole-game value). `TRACKS` lists the event tracks as
`[id, name]`: clicks, jumps, pauses. `ROWS` entries hold `id`, `group`,
`name`, `default`, `help`, `format`, and either `chart` and a line
`color` unique within the chart, or (event rows) `track`, `mark` (a shape
in `DURING_GAME_MARKS`, unique within the track, or `band` or `bar` for a
span), and `color`; and `data(model)`, whose `kind` (progress, state,
rate, ratio, value, spread, speed, events, unrecorded) decides drawing and
averaging. `AVERAGES` lists the averaging choices in menu order;
`DEFAULT_AVERAGE` is `rolling-2`. Rows named like a game
data measurement take its format from `GameData.metrics`. `windowValue`
measures a row over a time window (undefined under `MIN_WINDOW_MS`; a
spread row takes `gapSpreadRatioOf` of the gaps inside it);
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
- Charts: one SVG per chart under its HTML legend; the tracks are one SVG
  beside an HTML names column, with one HTML legend under it whose entries
  draw each row's mark (`duringGameLegendMark`) beside its name and count.
  `duringGameLeftMargin` measures every y tick label and every track name
  (`chartTextWidth`, canvas `measureText` in the CSS fonts), so every
  part's plot starts at the same x. The time axis takes `niceTicks` at
  about one tick per 56 px, labeled under the first and last parts.
  `duringGameScale` gives the y scale: progress every 20%; the relative
  chart in whole doublings of 1× (`DURING_GAME_RATIO_LABELS`), as many each
  way as the farthest drawn ratio needs, clamped to 1 to
  `DURING_GAME_RELATIVE_DOUBLINGS` (3), its `reference` 1× drawn as
  `.during-game-reference`. `drawDuringGameChart` sets each member's `y`,
  its value's height, null when the row cannot be drawn (on the relative
  chart, a whole-game value that is not a positive number,
  `duringGameComparable`). `drawDuringGameTracks` draws each event as
  `duringGameMark`: a path for an instant, a band (long gaps) or a top bar
  (window left) for a span. The block's `ResizeObserver` redraws at the
  column's width; legend values are whole-game values, so hover changes no
  width.
- Card: `partAt` finds the chart or track under the pointer from the SVGs'
  boxes. Over a chart, `lineAt` picks the member whose drawn value at the
  moment (`DuringGame.valueAt`) lies nearest the pointer's height; the card
  gives its own value in its row's format, and `focus` spotlights it as the
  legend hover does. Over a track, the card names it and lists its events
  at the moment (`duringGameEventsAt`, `duringGameEventLines`).
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
  the other. A click calls `setReplayStep`; the transport under the board
  is always shown after a game, so there is no panel to open first (until
  2026-10-20 the click opened the remembered `settings.panels.replay`
  disclosure).

## Tests

- `tests/during-game-test.js`: the model and rows inside the worker on
  hand-built boards (13×3 and 15×3) with worked-out proofs: progress, known
  squares, every event type including both kinds of left work, forks, and
  came back, move habits and their round trip through `finished-game`,
  averaging, the worker round trip and its throws, window-left spans, and
  an unrecorded trace.
- `tests/settings-state-test.js`: a row choice saved for `leftWorkEvents`
  carries to `leftHardWorkEvents` and `leftEasyWorkEvents`
  (`duringGameRowsFromStored` in `settings-core.js`).
- `tests/during-game-browser-check.js PLAYWRIGHT_CORE_DIR CHROMIUM
  [SCREENSHOT_DIR]`: real games with real mouse input under the routed test
  origin: the block at the head of the docked column, titled "live perf
  charts", the 2 s rolling default, the progress chart, the relative chart
  (its lead, its one 1× line, its doubling labels), and the tracks, each
  legend in catalog order, one plot x and width for every part, the
  progress chart's labels, hover line, the card naming only the line under
  the pointer and spotlighting it, the board in the player's number and
  flag style beside the block, fixed while the pointer moves, the finished
  board at the end, the pauses track's long-gap card and proven-safe ring,
  the replay link, configure ("back to live perf charts"), raw averaging
  (rates as ticks only), restore after reload, a loss, an 1100 px viewport
  (the block in the details column, the board beside it, the card inside
  the window), and a 390 px viewport (block first in the details popover,
  board clear of the chart and card).
- `tests/result-presentation-test.js` holds that no result section carries
  the block; the settings tests load `during-game.js` before
  `settings-core.js`.

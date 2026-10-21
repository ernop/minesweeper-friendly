# During the game — implementation notes

Spec: [docs/product/during-game.md](../product/during-game.md). Index: [AGENTS.md](../../AGENTS.md).

## Files

- `during-game.js` (repository root, pure): `DuringGame`, the model, the
  row catalog, the averaging, the relative chart's scales, the hover
  lookup, and the legend picks. It loads on the game page and the settings
  page before `settings-core.js` (whose `duringGameRows`,
  `duringGameAveraging`, and `duringGameRelativeScale` schema entries read
  `DuringGame.defaults`, `DuringGame.AVERAGES`, `DuringGame.DEFAULT_AVERAGE`,
  `DuringGame.RELATIVE_SCALES`, and `DuringGame.DEFAULT_RELATIVE_SCALE`),
  and in `analysis-worker.js`. At call time it
  uses `pathDecisionEvents`, `positionView`, and `squareDistance`
  (`game/replay-model.js`), `Justice`, `medianOf`, `gapSpreadRatioOf`,
  `CADENCE_MOVING_WINDOW_MS`, and `FASTCLICK_MAX_GAP_MS` (`game/trace-metrics.js`),
  and `GameData` formats.
- `game/during-game-chart.js` (after `game/game-data-chart.js`): the page
  side. `duringGameSourceId` names the game whose trace the reports worker
  holds. `buildDuringGameBlock(record, isCurrent)` builds the block: title,
  charts, the averaging select, log scale checkbox, and configure row (game
  data's `.game-data-controls`), and the configure view.
  `renderDuringGameCharts` draws `DuringGame.CHARTS` and the event tracks
  (`DuringGame.TRACKS`) on one time axis, top to bottom in
  `DURING_GAME_PARTS` order (progress, the tracks, the relative chart), and
  wires the legends, the hover, and the replay link. The
  card (`duringGameCard`, `placeDuringGameCard`) is a body-level manual
  popover, so it shows above the Game details popover too;
  `hideDuringGameHover` closes it and ends the replay preview, and
  `clearResultStats` calls it. `duringGamePicksFor(endedAt)` holds each
  legend's picks for the game shown.
- `game/replay-view.js` gives the hover `previewReplayStep(step)` and
  `endReplayPreview()` ([replay implementation](replay.md)). Until
  2026-10-21 it lent a board beside the block `paintReplayFrame(model,
  elements)` for any list of squares; `paintReplayFrame` paints the board's
  own squares again.
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
`RELATIVE_SCALES` lists the relative chart's scales (`log`, `linear`);
`DEFAULT_RELATIVE_SCALE` is `log`. `legendPick(picked, rowId, rowIds)`
returns a legend's picked rows after a click on `rowId` (an empty set is
every row shown; a pick of a row not in `rowIds` drops out), and
`legendHides(picked, rowId, rowIds)` whether those picks hide a row.

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
  `duringGameLeftMargin` measures every y label either relative scale can
  draw (`duringGameScaleLabels`) and every track name (`chartTextWidth`,
  canvas `measureText` in the CSS fonts), so every part's plot starts at
  the same x whatever the scale and the legend picks. The time axis takes
  `niceTicks` at about one tick per 56 px, labeled under the first and last
  parts. `duringGameScale(chart, rows, relativeScale)` gives the y scale:
  progress every 20%; the relative chart on `log` in whole doublings of 1×
  (`DURING_GAME_RATIO_LABELS`), as many each way as the farthest drawn
  ratio needs, clamped to 1 to `DURING_GAME_RELATIVE_DOUBLINGS` (3); on
  `linear` from 0 to the farthest ratio of the rows' lines
  (`duringGameLineValues`: steps, buckets, rolling points, or the raw marks
  of a row that draws no line), clamped to `DURING_GAME_LINEAR_TOP` (2× to
  8×), on `niceTicks` with the next tick added when the last falls short
  and 1× inserted when the step is 2. Either way its `reference` 1× is drawn
  as `.during-game-reference`. `drawDuringGameChart` fits the scale to the
  members the legend shows at each draw and sets each member's `y`, its
  value's height, null when the row is hidden or cannot be drawn (on the
  relative chart, a whole-game value that is not a positive number,
  `duringGameComparable`). `drawDuringGameTracks` draws each shown event
  row's events as `duringGameMark`: a path for an instant, a band (long
  gaps) or a top bar (window left) for a span. The block's `ResizeObserver`
  redraws at the column's width, keeping the spotlight on the redrawn
  nodes; legend values are whole-game values, so hover changes no width.
  A part's height never depends on the width (`duringGamePlotBottom`,
  `duringGamePartHeight`), so each svg gets its final height when it is
  built: the worker's answer can arrive before the block is placed, when no
  width can be measured, and the first draw then happens inside that
  observer's callback. Until 2026-10-21 the svgs kept the browser's default
  150px height until then, so that draw shrank the block and the whole game
  data column (540 to 403 px after an Expert game at 1920 wide) inside the
  callback, and the browser reported "ResizeObserver loop completed with
  undelivered notifications"; the error bar surfaced it.
- Legends: each part (the two charts and the tracks, `DURING_GAME_TRACKS_ID`)
  keeps its members; `applyPicks` sets each member's `hidden` from
  `DuringGame.legendHides` and the entry's `.during-game-legend-off`. A
  click runs `DuringGame.legendPick` on the part's picks, then redraws only
  that part (`drawPart`) and spotlights the entry's row if it is shown.
  The picks object comes from `duringGamePicksFor(record.endedAt)`, one
  set per part, kept at module level so a rebuilt block for the same game
  keeps them; another game gets fresh empty sets. The log scale checkbox
  saves `duringGameRelativeScale` (`log` checked, `linear` not) and redraws
  the view last drawn (`drawn`, with the averaging it was built for) without
  a worker request.
- Card: `partAt` finds the chart or track under the pointer from the SVGs'
  boxes. Over a chart, `lineAt` picks the member whose drawn value at the
  moment (`DuringGame.valueAt`) lies nearest the pointer's height; the card
  gives its own value in its row's format, and `focus` spotlights it as the
  legend hover does. Over a track, the card names it and lists its shown
  rows' events at the moment (`duringGameEventsAt`, `duringGameEventLines`).
- Hover: `stepAt` turns the moment into a replay step, the first action
  after it, or the finished board within hover reach of the axis's end.
  Every pointer move within the time axis calls `previewReplayStep`, which
  paints the board's own replay frame as the transport does; leaving the
  charts or the axis runs `hide`, whose `hideDuringGameHover` calls
  `endReplayPreview`. Until 2026-10-21 a second board, its own grid of
  `.cell` squares in a body-level popover beside the block, showed the
  frame instead.
- `renderDuringGameCharts` throws if the page's replay frames and the
  view's actions differ in number: hover and the replay link index one by
  the other. A click over a part (`partAt` not null; a legend click is a
  pick) calls `setReplayStep`, which ends the preview where it is and
  saves it; the transport under the board is always shown after a game,
  so there is no panel to open first (until 2026-10-20 the click opened the
  remembered `settings.panels.replay` disclosure). When the compact
  `gameSidebar` popover is open, the click closes it and the card.

## Tests

- `tests/during-game-test.js`: the model and rows inside the worker on
  hand-built boards (13×3 and 15×3) with worked-out proofs: progress, known
  squares, every event type including both kinds of left work, forks, and
  came back, move habits and their round trip through `finished-game`,
  averaging, the worker round trip and its throws, window-left spans, an
  unrecorded trace, and the legend picks' click sequence.
- `tests/path-replay-test.js`: the replay preview stops playback, never
  saves a position, ends on the position it replaced, and a new game
  clears it; the player's own moves end it where they move.
- `tests/settings-state-test.js`: a row choice saved for `leftWorkEvents`
  carries to `leftHardWorkEvents` and `leftEasyWorkEvents`
  (`duringGameRowsFromStored` in `settings-core.js`).
- `tests/during-game-browser-check.js PLAYWRIGHT_CORE_DIR CHROMIUM
  [SCREENSHOT_DIR]`: real games with real mouse input under the routed test
  origin: the block at the head of the docked column, titled "live perf
  charts", the 2 s rolling default, the progress chart, the tracks, and the
  relative chart (its lead, its one 1× line, its doubling labels), in that
  order, each legend in catalog order, one plot x and width for every part, the
  progress chart's labels, hover line, the card naming only the line under
  the pointer and spotlighting it, no second board, the board itself at the
  hovered moment (the transport's step, slider, and status following, in
  the player's number and flag style, not saved), the finished board at
  the axis's end and on leaving, the pauses track's long-gap card and the
  board's proven-safe rings then, a click keeping its moment through
  leaving and a later hover, the legend picks (alone, added, removed, all
  again; the tracks' legend; plots in place), the linear scale (the log
  scale checkbox, averaging the one select; labels from 0×, picks kept,
  saved, restored after reload), configure ("back to
  live perf charts"), raw averaging (rates as ticks only), restore after
  reload, a loss, an 1100 px viewport (the board showing the moment, the
  card inside the window and clear of the board), and a 390 px viewport
  (block first in the details popover, the card inside the window, a click
  closing the popover at that moment).
- `tests/result-presentation-test.js` holds that no result section carries
  the block; the settings tests load `during-game.js` before
  `settings-core.js`.

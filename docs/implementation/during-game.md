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
  uses `pathDecisionEvents` (`game/replay-model.js`), `positionView` and
  `squareDistance` (`game/evaluation.js`), `Justice`, `Odds`
  (`analyzeView`, `winChances`), `medianOf`,
  `gapSpreadRatioOf`, and `STROKE_GAP_MS` (`game/trace-metrics.js`);
  at load it reads `GameData.metrics` for its catalog rows, so
  `game-data.js` loads first everywhere
  ([measurement catalog](measurement-catalog.md)).
- `game/during-game-chart.js` (after `game/game-data-chart.js`): the page
  side. `duringGameSourceId` names the game whose trace the reports worker
  holds. `buildDuringGameBlock(record, isCurrent)` builds the block: title,
  charts, the averaging select, log scale checkbox, and configure row (game
  data's `.game-data-controls`), and the configure view.
  `renderDuringGameCharts` draws `DuringGame.CHARTS` and the event tracks
  (`DuringGame.TRACKS`) on one time axis, top to bottom in
  `DURING_GAME_PARTS` order (progress, moves, the tracks, the relative
  chart), and
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
- `analysis-worker.js` imports `justice.js`, `odds.js` (the guess facts,
  since 2026-10-26), `board-icons.js` (whose `FLAG_COLOR`
  `game/replay-model.js` reads at load), `game/replay-model.js`, and
  `during-game.js`.

## Worker task and the held trace

The trace is cloned to the reports worker once. `finished-game` (with
`gameId: record.endedAt`, and the trace's `initialPageState`) and
`restore-trace` (with the stored trace) each keep `{id, width, height,
mines, justiceEnabled, t, x, y, events, initialPageState}` as the worker's
`duringGameSource` and drop the cached model. `justiceEnabled` is the
record's (`reportResult` sends it; the stored trace carries a copy), absent
on games from before it was recorded. The page sets
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

Positions are proved during play (2026-10-26). The motion stats' live feed
(`live-trace`, game/motion-stats.js) runs on the same `reports` lane and
sends each piece of the trace once; the worker keeps the game it belongs to
(`liveGame`, by `traceId`, the page's `liveMetricsGeneration`) with a
`DuringGame.positionProofs()` store, and proves each new decision's position
in its own task (`proveLivePositions`, one per `setTimeout`), so a request
waits behind at most one proof. `finished-game` names that game
(`liveTraceId`) and hands the store to its model, which proves only the
positions the feed never sent, usually the last. `restore-trace` starts an
empty store. A proof reads only the open numbers, and within one game they
only grow, so the count of open squares names the position.

## Model

`DuringGame.model(game)` returns `{recorded: false}` for a trace without
decisions. Otherwise:

- Clock: the game clock starts at the median of `t - evaluation.atMs` over
  decisions after the first; the axis runs to the record time or the last
  decision, whichever is later.
- Pass 1, per decision in replay order (`pathDecisionEvents`): opened safe
  squares and solved 3BV units (`boardUnits` on the final layout: each zero
  region is one unit, each number touching none is one), flagged mines,
  and, whenever the revealed count changed, the proof of the position
  before the action from the game's `positionProofs` store (one
  `Justice.proveLevels` per count of open squares, and the same facts by
  square): the full proof's facts (`factsAt`), each
  with the first deduction level proving it (`levelsAt`). `known` holds,
  per action, the covered unflagged squares proved safe and mines; the
  same by level id (`safeByLevel`, `minesByLevel`, from `countsByLevel`);
  the work areas and the proven-safe list; the mines counting proves within
  `NEAR_LAST_MOVE_STEPS` (5, rows plus columns) of the latest
  board-changing action's square (`targetCellOf`, a chord's number), null
  before the first; and the chordable numbers (`chordableCount`, flags
  checked against the final layout). The totals, the work areas and list,
  and the searching levels (all numbers, mine total) are null where the
  search stopped at its work limit.
- Move usefulness and distance, per action in pass 1 from the same proof:
  `mostBvPerClick` gives the most 3BV per click of each level's proven
  moves and of all (`known.mostBvPerClick`, `mostBvPerClickByLevel`):
  every proven-safe unflagged square (1 if `boardUnits` makes it a unit, a
  zero's region or an isolated number, else 0) and every open number
  whose covered neighbors are all facts with every flag on a proven mine
  and at least one safe square to open (distinct units over 1 plus its
  unflagged mines); a move's level is the hardest (`levelRank`) of its
  facts. `stepsToSafe` gives the rows-plus-columns steps from the last
  board-changing action's square to the nearest unflagged proven-safe
  square of each level and of all (`known.stepsToSafe`,
  `stepsToSafeByLevel`), null when squares are proven before any such
  action (a drill's dealt position). Both return `NO_MOVE` ('none') where
  there is no such move, which `stateSteps` turns into a step `{value:
  null, none: true}`; `view` marks a state row whose every step is none
  `noMoves`, and its legend entry says "none". A level is measured where
  the proof is complete or the level's proof is not a search
  (`levelMeasured`: `proof.exact === false`, counting and overlap), as in
  `countsByLevel`.
- Planned pairs (the fastclick gap's, `plannedPairs`):
  `plannedPairsOf(game.events, decisions, factsAt, game.t, width)`, one
  pass over the trace's events as recorded. It collects the `ldown` and
  `rdown` presses since the decision before each decision event;
  `pairClickOf` gives a board-changing click other than `flag-remove` its
  press time (a flag's latest `rdown`; else the latest `ldown`, or an
  earlier `rdown` marked `chordGesture`) and whether those presses were its
  own alone. Two such clicks from consecutive decision events pair when
  their squares (`targetCellOf`) are at `squareDistance` 1, the cursor did
  not rest (`restedBetween`: `STROKE_GAP_MS` without a sample) from the
  first's decision to the second's press when the first was in
  `OPENING_ACTIONS` (reveal, proof-open, chord), and `provenTogether` finds
  every `selected` square of both in `factsAt` of the first (1 for a flag,
  2 otherwise). It returns `{atMs, gapMs}` per pair (press to press, at the
  second click), or null when a pair's square was unproven under a proof
  with `complete` false. `DuringGame.fastclickGap(m)` turns them into the
  record's `fastclickGapVersion` (`GameData.FASTCLICK_GAP_VERSION`) and
  `fastclickGapMs` (rounded `medianOf`; absent with no pair or a null);
  the fastclick row draws them as a median `value` row, or `unrecorded`
  for null.
- Pass 2: each action's gap, squares moved, cursor path, no-op reason,
  misclick (recomputed from the exact
  proof as `Solver.isVisibleMisclick` judges it), guess, opening,
  wrong flag, flag removal (quick undo within `QUICK_UNDO_MS`), long gap
  (`LONG_GAP_MS`), and moves. "Near" is a zone stamp: every square within
  `NEAR_SQUARES` of what the previous board-changing action opened or
  marked. A move is a board-changing click outside that zone and not within
  `NEAR_SQUARES` of a proven-safe square in it; moved on when no such
  squares remained, else left easy work when counting proves one of them
  (`levelsAt`) and left hard work when it proves none (counting's facts
  come before any search, so the split holds where the search stopped at
  its limit);
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
- Guess facts (`guessFacts(k, cell)`, spread into each guess event): one
  `Justice.buildStructure(view, undefined, factsAt[k])` of the guess's
  position serves all of them, built from pass 1's proof (`provenFacts`;
  `proveLevels` and `proveFacts` prove the same facts, so no position is
  proved twice). `connected`: the square is in the structure's
  `frontierSet` (beside an open number). Where the evaluation's
  `evidence.oddsMeasured` is true (the guess ledger measured it, so the
  mode's mines move only under A just universe),
  `Odds.analyzeView(view, { structure })` gives `safestConnectedRisk`
  (the lowest `pMine` of an unproven square in `frontierSet`) and
  `safestUnconnectedRisk` (of the others), each absent when no such
  square exists. Where also `game.justiceEnabled === false`:
  `minesFixed: true`, and `Odds.winChances(view, odds, cell)` gives
  `winMeasured` and, when measured, `winChance` and `bestWinChance`
  (layouts won over layouts). Where `factsAt[k]` is complete and
  `Justice.certifyEntries(view, [cell], structure)` certifies the square:
  `unavoidable: true`, then a walk back over earlier decisions whose proof
  differs (`factsAt` repeats one proof object until the revealed count
  changes), while each certifies it (each with its own structure from
  its proof); a proof stopped at its work limit ends the walk with no
  `waitedMs`, else `waitedMs` runs from the start of the first certified
  decision (`known.startMs`) to the guess.
- `Odds.winChances(view, odds, cell)` (`odds.js`, `odds` the measured
  `analyzeView(view)`, which the caller has already): every layout it
  weighs (proven mines, one solution per component, every way of placing
  the rest in the sea; a count differing from `totalWeight` throws), each
  covered square's number in each layout, then a search over sets of
  layout ids. `settle` opens every square no layout in the set mines and
  splits the set square by square into one part per number shown; `wins`
  takes a settled set's best guess (squares mined in the same layouts are
  one choice, found by a sum of per-layout hash tags and compared in
  full; choices tried by survivors, pruned when they cannot beat the
  best), memoized by the set. It returns `{measured, layouts, chosenWins,
  bestWins}`, or `{measured: false}` once its work (layouts times covered
  squares, per set visited) passes `WIN_WORK_LIMIT` (100,000). On the
  simulated guesses below, 100,000 finished 29 of 197 Expert guesses, 19
  of 46 Intermediate, and 18 of 19 Beginner; 1,000,000 finished 43, 21,
  and 18, at up to 17 ms an Expert guess, the searches it could not
  finish taking most of that time.
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
headless Chromium: 46–70 ms; 2026-10-26, with every deduction level from
one `proveLevels` per position, 73–104 ms for scripted Expert wins of
281–344 actions in Node (a separate proof per level took 140–242 ms on the
same games). The guess facts, 2026-10-26, in Node on simulated games
guessing the lowest risk: `winChances` 0.12 ms a guess on average on
Expert (197 guesses, at most 1.3 ms), 0.25 ms on Intermediate (at most
3.3 ms), 0.43 ms on Beginner (at most 6.2 ms). The move hierarchy's whole
share on the latency check's Expert win (229 actions, nine guesses), in
the analysis worker: about 9 ms of the model's 80–90 ms in headless
Chromium (usefulness and distance about 5 ms, the guess facts about 4),
and about 6–7 ms of the check's `expertWinResultsMs` in Firefox (the
median of six runs against a copy without it). It was about 40 ms in
Chromium before each guess position got one structure from pass 1's
proof, shared by `analyzeView` and `certifyEntries`, and before
`buildStructure`'s sea fill stopped making a neighbor list per square
(identical output, about 40% faster). With the positions proved during
play (2026-10-26), `finished-game` on the latency check's Expert win takes
a median 49 ms in Node against 112 ms proving them after the game, with
identical measurements and rows (228 of 229 positions proved during play),
and replies 58-73 ms after it is posted in Firefox; the model's share,
every position proved, is about 24 ms.
Since 2026-10-20 the model is built inside
`finished-game`, before the first full result render, which therefore
comes that much later; the live perf charts then need only the view.
`renderResultAsync` builds the block, which starts its task, before
`renderRanks`, so the reports lane (after `finished-game`) runs it beside
the rankings lane's tables. `renderRanks` waits for it after the board
tables, before game data and the charts.

## Rows and averaging

`CHARTS` lists the three charts in order: `id`, `name`, and `scale`
('share' for progress's fixed 0 to 1, 'count' for the moves chart's raw
counts, 'relative' for the chart of each line against its whole-game
value). `TRACKS` lists the event tracks as
`[id, name]`: clicks, jumps, pauses. `ROWS` entries hold `id`, `group`,
`name`, `default`, `help`, `format`, and either `chart` and a line
`color` unique within the chart, or (event rows) `track`, `mark` (a shape
in `DURING_GAME_MARKS`, unique within the track, or `band` or `bar` for a
span), and `color`; and `data(model)`, whose `kind` (progress, state,
rate, ratio, value, spread, speed, events, unrecorded) decides drawing and
averaging. `AVERAGES` lists the averaging choices in menu order;
`DEFAULT_AVERAGE` is `rolling-2`. A game data measurement's row is
`measurementRow(id, row)`: `name`, `help`, and `format` from
`GameData.metrics` and `measurements: [id]`; an event row's `measurements`
lists the catalog ids counted over its events (the hover link's keys).
`valueOver(data, items, fromMs, toMs, durationMs)` computes a rate, ratio,
value, spread, or speed over given incidents. `windowValue`
measures a row over a time window (undefined under `MIN_WINDOW_MS`; a
spread row takes `gapSpreadRatioOf` of the gaps inside it);
`gameValue` is the right-hand whole-game value, every incident over the
record's `timeMs` (`m.recordTimeMs`) with no minimum, so it equals game
data's value; `drawn` returns `steps`,
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
- Charts: one SVG per chart over its HTML legend (2026-10-26; the legend
  came first until then); the tracks are one SVG
  beside an HTML names column, with one HTML legend under it whose entries
  draw each row's mark (`duringGameLegendMark`) beside its name and count.
  Parts sit 8px apart and a legend 1px under its svg, so it reads with its
  own part. `duringGameLeftMargin` measures every y label either relative
  scale can draw (`duringGameScaleLabels`: the ratios, and every tick
  either scale can draw times each comparable row's whole-game value in
  its format) and every track name (`chartTextWidth`,
  canvas `measureText` in the CSS fonts), so every part's plot starts at
  the same x whatever the scale, the legend picks, and the line in focus.
  The time axis takes
  `niceTicks` at about one tick per 56 px, labeled under the first and last
  parts. `duringGameScale(chart, rows, relativeScale)` gives the y scale:
  progress every 20%; the moves chart's counts from 0 on
  `duringGameCountTicks`, whole steps from `niceTicks` (about
  `DURING_GAME_COUNT_STEPS`, 4) repeated to the first at or past the
  highest drawn count, so a higher count never draws a lower top label and
  the margin measured from every row's values fits every pick; the
  relative chart on `log` in whole doublings of 1×
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
  `duringGameComparable`); it keeps the part's `scale`, its `tickLabels`
  (each tick with its text node), and its `lines`, the members drawing
  values against the scale (a rate in raw draws only ticks). On the
  relative chart `labelTicks` (in `renderDuringGameCharts`) picks the line
  whose values the labels give: the one member of `lines` in focus, else
  the only one, else none; `labelDuringGameTicks` writes each tick's label
  as `spec.format(tick * row.summary)`, or the scale's ratio label for
  none. It runs after the relative part is drawn and on every focus
  change. `drawDuringGameTracks` draws each shown event
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
- Legends: each part (the three charts and the tracks, `DURING_GAME_TRACKS_ID`)
  keeps its members; a chart's legend starts with its scale's
  `DURING_GAME_LEGEND_LEADS` entry ("whole game (1×)", "game average"), if
  any; `applyPicks` sets each member's `hidden` from
  `DuringGame.legendHides` and the entry's `.during-game-legend-off`. A
  click runs `DuringGame.legendPick` on the part's picks, then redraws only
  that part (`drawPart`) and spotlights the entry's row if it is shown.
  Entries and the chart hover go through `pointFocus(member)`, which
  spotlights the member and calls `linkMeasurements` with its
  `measurements`; `duringGameSpotlight` lets game data's rows spotlight
  members by measurement ([measurement catalog](measurement-catalog.md),
  "Hover link"). Names with a definition are `chartHelpButton`s
  (`duringGameRowName`), in the legends and the configure list.
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
  `endReplayPreview`. A pointer on a legend entry keeps that entry's
  spotlight, also left of the plots, outside the axis: the wider label
  column of 2026-10-26 put legends' first entries there, and the move
  handler had cleared their focus. Until 2026-10-21 a second board, its own grid of
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

- `tests/justice-test.js`, "Deduction levels": a board for each level
  with every square's first level worked out, the levels nested, and
  `proveLevels` against a separate proof per level there, on random
  constraint systems, and at the work limit.
- `tests/during-game-test.js`: the model and rows inside the worker on
  hand-built boards (13×3 and 15×3) with worked-out proofs: progress, known
  squares, the moves by level, near the last move, and chordable numbers,
  the moves chart's rows, colors, defaults, and count format, every event
  type including both kinds of left work, forks, and
  came back, move habits and their round trip through `finished-game`,
  planned pairs (the creator's corner on a 6×4 board, and one pair each
  for a 1.5 click, a rest, a two-button chord, a press between, a flag
  removal, and a proof at its work limit) and the fastclick gap's round
  trip through `finished-game`, the most 3BV per click and the steps to
  the nearest safe square on a 4×3 board solved by counting (a chord
  worth 1, 1.5, then 3 3BV per click as its mines are flagged; every
  other level none all game), the guess facts on a 6×2 50/50 nothing
  could ever settle (won, lost, under A just universe, and unmeasured by
  the ledger),
  averaging, the worker round trip and its throws, window-left spans, an
  unrecorded trace, the legend picks' click sequence, the catalog
  checks ([measurement catalog](measurement-catalog.md), "Tests"), and
  proofs made during play: a 4×3 game fed through `live-trace` up to its
  last decision, whose `finished-game` proves exactly one position, against
  a finish without the feed that proves all four, with identical
  measurements and every row's view.
- `tests/odds-test.js`, "win chances": two separate 50/50s (1 layout in 4
  won), an early Expert position past the work limit, and 60 random small
  positions against a brute-force game search that opens one square at a
  time, zeros cascading.
- `tests/path-replay-test.js`: the replay preview stops playback, never
  saves a position, ends on the position it replaced, and a new game
  clears it; the player's own moves end it where they move.
- `tests/settings-state-test.js`: a row choice saved for `leftWorkEvents`
  carries to `leftHardWorkEvents` and `leftEasyWorkEvents`, and one saved
  under a 2026-10-26 id to the new id (`duringGameRowsFromStored` in
  `settings-core.js`).
- `tests/during-game-browser-check.js PLAYWRIGHT_CORE_DIR CHROMIUM
  [SCREENSHOT_DIR]`: real games with real mouse input under the routed test
  origin: the block at the head of the docked column, titled "live perf
  charts", the 2 s rolling default, the progress chart, the moves chart (its
  "game average" lead, whole-count labels from 0, its default rows, a hover
  card naming one of them with its count), the tracks, and the relative
  chart (its lead, its one 1× line, its doubling labels), in that order,
  each legend in catalog order and under its part, one plot x and width for
  every part, the
  progress chart's labels, hover line, the card naming only the line under
  the pointer and spotlighting it, the relative chart's y labels in that
  line's values (1× its legend value) and back to ratios when it lets go,
  no second board, the board itself at the
  hovered moment (the transport's step, slider, and status following, in
  the player's number and flag style, not saved), the finished board at
  the axis's end and on leaving, the pauses track's long-gap card and the
  board's proven-safe rings then, a click keeping its moment through
  leaving and a later hover, the legend picks (alone, added, removed, all
  again; the tracks' legend; plots in place), the link with game summary
  perf (an earlier win held in memory gives game data a comparison: one
  value in both, a row's hover spotlighting its line or marks alone, lines
  and legend entries ringing their rows; the saved record's fastclick gap,
  its definition named, as the legend reads it, and measured again on a
  reload after being made one of the earlier definition), the linear scale (the log
  scale checkbox, averaging the one select; with one line picked, labels
  in its values from 0ms; with every line, ratios from 0×; picks kept,
  saved, restored after reload), configure ("back to
  live perf charts"), raw averaging (rates as ticks only), restore after
  reload, a loss, an 1100 px viewport (the board showing the moment, the
  card inside the window and clear of the board), and a 390 px viewport
  (block first in the details popover, the card inside the window, a click
  closing the popover at that moment).
- `tests/result-presentation-test.js` holds that no result section carries
  the block; the settings tests load `during-game.js` before
  `settings-core.js`.

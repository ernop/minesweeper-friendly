# Board position and page layout — implementation notes

Spec: [docs/product/board-and-layout.md](../product/board-and-layout.md). Index: [AGENTS.md](../../AGENTS.md).

- Startup readiness (2026-09-25): `index.html` begins with an empty board
  and “Preparing your game…” status. While `.game-booting` is present,
  `style.css` reserves the empty board's Beginner footprint and conceals
  `#game-frame` with `visibility: hidden`, so the real board remains
  measurable for saved layout restoration. `init` in `game/main.js` removes
  that class only after `newGame`, `restorePreferredResult`, and
  `initGamePreferences` finish their board/control setup; statistical report
  reconstruction continues independently in `restoredAnalysisReady`; the same transition reveals the frame and
  permits pointer input. `requestNewGame` in `game/controls.js` rejects
  restarts while booting, including Space before settings exist. Failures
  retain the concealed frame and use the existing visible startup error.
  `tests/startup-presentation-test.js` checks the static contract;
  `tests/startup-browser-check.js` holds script/result/preference restoration
  separately and verifies concealment, ignored early input, stable geometry,
  and a working first click/restart after readiness.
- Board position: `settings.boardOffsetX/Y` are independent persistent pixel
  preferences. `syncBoardLayout` calls `measureTopStage` once, updates
  `--stage-width` and `--board-frame-width` directly on `#replay-controls`
  (`syncReplayBounds`), calls `applyBoardPosition` **first** across the full
  `#top-stage` width, and only then docks `#game-sidebar` via
  `syncGameSidebar` — so the details dock never restricts board travel.
  `#game-area` (`width: max-content; margin-inline: auto;`) and
  `#game-frame` center in the full stage width; when the applied offset is
  `(0, 0)`, `applyBoardPosition` leaves the translation custom properties
  unset (CSS `var(..., 0px)` fallback) to avoid invalidating the board's
  cells. `boardPositionOffset` reads `--board-edge-inset` (8 px, cached from
  `#page-layout`) and computes the exact movable `[minX, maxX]` and `[minY,
  2000]` range; `syncBoardPositionInputs` updates `#board-position-x/y`
  range/number limits and their 5 labeled ticks (disabling an axis only when
  `min >= max`), and pointer/arrow edits start from `appliedBoardOffsetX/Y`
  with zero dead zone. The top bound is the inset below the lowest visible
  setup row (`#page-head`, `#mode-options`, `#board-lab-panel`).
  `boardPositionOffset` returns zero while `#game-area` has `.trial-no-board`.
  `boardPositionPanelRect` anchors the body-level position editor to the
  union of `#game-frame` and (when visible) `#replay-controls` within
  `visualViewport`. Clicking `#board-position-btn` passes
  `{ scrollToBoard: true }` to `setBoardPositionEditing`, scrolling
  `#game-frame` into view when it is off-screen; reloads with the editor
  open do not scroll.
- Layout (revised 2026-11-19: full-width board-first top stage + adaptive
  details dock + full-width after-board stack; refined 2026-11-24, Option L1):
  `#page-layout` is a single-column full-width container holding
  `<header id="page-head">` (`container-type: inline-size; container-name:
  page-head`, containing `#page-head-inner` with `#difficulty-tabs` and
  `#top-bar`: 3 columns `1fr auto 1fr` at `>= 1640px`, 2 columns `auto 1fr`
  at `1040–1639px`, and 2 rows below `1040px`) and `<main>`. `#top-bar` holds
  `#top-right` (archive chip + `#states` with `#play-context`,
  `#states-edit-btn`, and floating absolute `#states-menu`), `#scores-nav`
  (`#see-scores-btn`), `#play-limits-use`, `#play-limits-btn`, and
  `#settings-btn`. When docked `left`, `syncGameSidebar` sets
  `pageLayout.dataset.leftDock = 'true'` and `--left-dock-width`, shifting
  `#page-head`, `#mode-options`, and `#board-lab-panel` into the board's right
  flank (`margin-left: calc(var(--left-dock-width) + 18px); width: auto;`),
  and lifts `#game-sidebar` and `#details-resize` to the top of `#page-layout`
  via `--left-dock-top-lift` (`stageTop - pageLayoutTop`). `syncDetailsDockMaxHeight`
  and `syncResultClearance` both account for `appliedLeftDockLift`, and
  `syncGameSidebar` writes `--replay-room-width` directly on `#replay-controls`
  so the replay transport expands up to 620 px when symmetric room around the
  board permits without touching the dock.
  Inside `<main>`, `<div id="top-stage">` (`position: relative`) owns
  `#game-area`, `#details-resize`, and `<aside id="game-sidebar">`.
  `detailsDockPlacement` (pure, in the solver span of `game/layout.js`)
  computes free flanks left and right of the placed board's footprint
  (`max(frame.width, REPLAY_CONTROLS_MIN_WIDTH = 340)`), picking the wider
  flank (`right` on ties) when at least `--game-sidebar-min-width` (320 px)
  fits outside `DETAILS_DOCK_GAP` (18 px) and `window.innerWidth > 700`;
  otherwise `dock: 'below'` at full stage width. `syncGameSidebar` sets
  `topStage.dataset.detailsDock` (`right` / `left` / `below`; initialized to
  `right` in `index.html`), writes `--details-dock-width` directly on
  `#game-sidebar` and `#details-resize` and `--details-dock-max-height` on
  `#game-sidebar` (never on `#top-stage`, so resizing or switching boards
  does not restyle `#board`'s cells), and when `below` sets
  `topStage.dataset.belowColumns` to `'2'` when width `>= 900` and
  `#result-stats` has at least two children (live perf charts + game data
  side by side in CSS Grid), else `'1'`. The former `#game-sidebar-button`,
  `#game-sidebar-close`, `.compact-sidebar` popover mode, `placeBoardSides`,
  `.beside-board`, and `resultLayoutObserver` are removed; `panelsFromStored`
  in `settings-core.js` strips legacy `panels.gameDetails`.
  `#details-resize` sits on the board-facing edge of the docked sidebar
  (`right: calc(var(--details-dock-width) + 5.5px)` when docked right,
  `left: ...` when docked left), hidden when docked `below`; dragging or
  Left/Right keys update `settings.detailsColumnShare` within
  `[fit.minimum, fit.maximum]` without moving the board.
  A ResizeObserver on `#game-sidebar` passes `borderBoxSize[0].blockSize`
  via `requestAnimationFrame` to `syncResultClearance` (deferring the
  ancestor `#top-stage` `min-height` update to the next frame so it never
  triggers a Firefox `ResizeObserver loop completed with undelivered
  notifications` error), keeping `#details-resize` height and `#top-stage`
  `min-height` synced so `#result-analysis` and `#result-ranks` below never
  overlap the docked sidebar or Guardian Angel callouts. `syncDetailsDockMaxHeight`
  sets `--details-dock-max-height` to the full visible viewport height
  (`Math.max(480, Math.floor(window.innerHeight - (top - lift) - 16))`) so
  docked game data fills the available vertical room without a compact cap. A
  single ResizeObserver in `initBoardPositionControls` watches `#top-stage`
  width changes plus `#page-head`, `#mode-options`, `#board-lab-panel`,
  `#game-frame`, `#guardian-angel-live`, and `#board-position-panel` and schedules
  `syncBoardLayout`.
  The sidebar contains `#result-summary`, `#results`, and `#path-view-legend`
  (`#sidebar-controls` was removed on 2026-11-24 when `#top-right` and
  `#scores-nav` moved into `#top-bar`).
  Stat sections: `buildStatSection(panelKey, title)` (`game/results.js`)
  builds `.stat-section` with `panelToggle(panelKey, title, body, help)`.
  `resultOpenerHead(level, ...)` wraps `h3`/`h4.stat-section-title` around
  the button; `resultTableOpener(table, panelKey, title, help)` locks
  `min-width: min(100%, openWidth)` when closing an overview table and
  clears it on reopen so titles and siblings stay stationary.
  Panels `duringGame`, `gamePerformance`, `boardTraits`, and `resultAnalysis`
  default open (`settings-core.js`). `renderRanks` mounts live perf charts
  and `.board-time-profile-host` into `#result-stats`; `renderView()` in
  `game/game-data-chart.js` and `syncGameSidebar` call
  `fitGameDataToSidebar` (sizing to remaining dock height with
  `GAME_DATA_SIDE_MIN_HEIGHT = 240` per open side when docked, or matching
  the sibling live-perf height / readable height when docked below).
  `createResultSectionCollector` places sections in `#result-ranks` in
  model order as parts arrive ([Result presentation](results.md)).
- Game setup rows (2026-10-20; moved into `#page-head` on 2026-11-19):
  `nav#difficulty-tabs` holds the three preset links (`data-difficulty`)
  and `select#play-mode-select` (static, disabled with a loading option
  until `buildPlayModeSwitcher` in `game/play-modes.js` fills it from
  `init`: a hidden, disabled prompt option with value `''` reading "other
  modes", then one option per `PLAY_MODES` entry, `standard` labeled
  "Custom"). Directly under `#page-head` in `<main>`, `div#mode-options`
  holds `#custom-form`, `label#board-generator` with
  `#board-generator-select` (filled by `buildBoardGeneratorSwitcher` in
  `game/play.js`), and the mode progress spans `#trial-progress`,
  `#pregen-progress`, and `#endgame-drill-info`; `#board-lab-panel` follows
  it. Every game choice goes through `chooseGame(difficulty, playMode)`
  (`game/controls.js`). `syncGameChoice` marks the active preset link, sets
  the menu to the mode (or prompt), bolds it while custom, shows
  `#mode-options` only while custom, and hides `#board-generator` when
  `generatorAppliesToMode` is false. `activeGenerator` (`game/play.js`)
  returns the uniform generator for presets.
- Top bar: `div#top-bar` sits inside `header#page-head` (column 3 above
  1120 px, stacked above `#difficulty-tabs` at `<= 1120px`), holding
  `#play-limits-use` (hidden until a limit is set), `a#play-limits-btn`,
  and `a#settings-btn`. `.game-booting` blocks its pointer input like the
  other chrome. `tests/session-placement-layout-fixture.js` checks full-width
  board-first placement, adaptive right/left/below docking, the overview
  band, the rankings opener, and closed tables keeping their width across
  desktop, laptop, and narrow viewports.
- Settings row (2026-10-20): `div#settings-row` (`role="group"`, "Your
  settings") sits in `main` between `#backup` and `#site-footer`, a
  wrapping centered flex row of two `.settings-row-group` boxes:
  `label#session-picker` (`select#session-definition-select`, filled by
  `initSessionScopeSelect`) and `span#board-display` (`#zoom-label` with
  `#zoom-select`, `#board-position-btn`, and `#pixel-ratio`). `p#site-footer`
  links self-check.html, training.html, problems.html, and the hosted game.
  `renderPixelRatio` (`game/layout.js`, called from `initCellSizeControl`)
  writes `devicePixelRatio` rounded to two places into `#pixel-ratio-value`
  and listens once on `matchMedia('(resolution: <ratio>dppx)')`.
  `initCellSizeControl` calls `applyCellSize(false)` because `newGame` runs
  immediately after in `init` and lays out the built board once.
- Motion stats (2026-10-20; grid aligned 2026-11-19): `#motion-stats` sits
  in `main` after `#result-ranks` and before `#backup`; `initMotionStats`
  builds its open/close section with left-aligned `230px` metric grids and
  black-rule subheadings ([implementation](motion-stats.md)).
- `setBoardPositionEditing` focuses `#board-position-btn` only when it closes
  an editor that was open; `initGamePreferences` restoring a closed editor
  does not move focus.
- Replay legend and choice callouts: `renderPathOverlay` builds its legend
  into a detached fragment and replaces the live contents once, preventing
  transient collapse and scroll resets. Replay choice callouts measure
  visible stats and legend bounds to avoid overlapping the details dock.
  The root scrollbar gutter remains reserved so page growth cannot shift
  the board.
- Cell digits (2026-10-14): `.cell` in `style.css` sets `font-size` with
  `clamp()`: 0.66 of `--cell-size` up to 28 px, 0.94 from 40 px, the straight
  line through those two points between. `-webkit-text-stroke` is `1em / 17`,
  so the stroke follows the digit (the old `--cell-size / 26` at 28 px). No
  Arial is installed on the creator's PC, so Firefox draws the stack in
  Liberation Sans Bold (canvas `measureText` widths, 2026-10-14), whose digits
  are 0.68 em tall: 0.94 of the square makes them about two thirds of it.
- Flags (2026-10-15): `board-icons.js` holds `FLAG_COLOR` (`#ff00ff`, full
  strength), `FLAG_STYLES` (id, label, describe, `body(color)` spanning the
  whole 16-unit box), `CLASSIC_FLAG` (the settings defaults and what the
  problems page and judgment tool draw), `flagColor(intensityPercent)`
  (HSL at hue 300, saturation = strength, lightness 50% + (1 - strength) x
  25%), `flagSvg(styleId, intensityPercent)` (cached, class `flag`, throws on
  an unknown style), and `setFlagSize(sizePercent)`, which sets
  `--flag-size` on the root. `.cell.hidden > svg.flag` sizes the flag to
  `--cell-size x --flag-size` with `flex-shrink: 0`, so a flag wider than
  the bevel's 0.75 overflows evenly instead of squeezing; the child
  combinator leaves the replay's corner badge to its own rule.
  `chosenFlagSvg()` in `settings-core.js` draws `settings.flagStyle` at
  `settings.flagIntensity`; `updateCell` (`game/play.js`) and the replay
  frames, badge, and legend (`game/replay-view.js`) use it, and `init`
  (`game/main.js`) calls `setFlagSize(settings.flagSize)`. The replay's
  `mark-mine` encoding (`game/replay-model.js`) and the during-the-game
  chart read `FLAG_COLOR`, so `board-icons.js` loads before the `game/`
  scripts and in the analysis worker, and `tests/path-replay-test.js`
  loads it first.
- Mine styles (2026-10-15): `MINE_STYLES` in `board-icons.js` lists the five
  styles (id, label, describe, SVG body on the 16-unit square, `fullSize`).
  `mineSvg(id)` and `wrongFlagSvg(id)` return the prebuilt SVGs (the wrong
  flag is the body plus the red cross) and throw on an unknown id. A
  `fullSize` SVG carries class `mine-full-size`, which `.cell.revealed
  svg.mine-full-size` sizes to 0.92 of `--cell-size` (classic stays at the
  0.72 of `.cell svg`); a replay's proven mine on a closed square keeps the
  closed-square size. `lose` (`game/play.js`), `restorePreferredResult`
  (`preferences-game.js`), the replay frames (`game/replay-view.js`), and
  game data's example boards (`game/game-data-chart.js`) draw
  `settings.mineStyle`; the
  problems page and `analysis/judgment/judge.js` draw `'classic'`.
- Number and mine sizes (2026-11-05): `setNumberSize(sizePercent)` and
  `setMineSize(sizePercent)` in `board-icons.js` set `--number-size` and
  `--mine-size` on the root as fractions (100% is 1). `.cell` multiplies its
  `clamp()` font size by `--number-size`, and `.cell .num-dot` its 0.45 of
  `--cell-size`; `.cell svg` (0.72), `.cell.hidden svg` (0.62), and
  `.cell.revealed svg.mine-full-size` (0.92) multiply by `--mine-size`, so
  every board on every page follows them. Like `--flag-size`, neither has a
  stylesheet default: `init` (`game/main.js`) and `renderBoardLook`
  (`settings-page.js`) apply `settings.numberSize` and `settings.mineSize`,
  and the problems page and the judgment tool apply `OWN_SIZE_PERCENT`
  (100). At zoom 96 and number size 120%, Liberation Sans Bold's widest
  letter, G, is 0.88 of the square's width (Firefox, 2026-11-05). Because a
  large count's font line box extends above and below the cell even while the
  ink stays inside, `.cell.revealed` sets `overflow: clip` so a revealed
  number cannot steal clicks off the bottom of the square above it (leaving
  `.cell.hidden` unclipped for flags above 75%).

## Analysis execution and cost (2026-09-25)

`analysis-client.js` sends immutable structured-cloned snapshots to
`analysis-worker.js`. Persistent named queues separate live trace samples,
session aggregation, finished/reloaded reports, rankings, and scatter work.
The worker imports pure algorithms from the same files tested by Node; it
never invokes their DOM builders. Calculation errors return the task name
and error message; worker startup/runtime errors reject pending requests and
terminate that worker. `analysisFailure` exposes the failure as an alert.
There is no main-thread calculation substitute.

- `renderLiveTraceMetrics` permits one outstanding sample, coalesces new input,
  and sends only appended samples/events. Trace generations reject late replies.
- `reportResult` saves primary record/trace facts before returning, then sends
  the captured board and trace for metrics and ZiNi/HZiNi. The reply updates
  that record, even after a restart, but view revision and trace identity gate
  presentation. Restoring a saved trace computes any unfinished derived board
  measurements. Statistical completion is independent of starting another game.
- `renderRanks` requests worker models, each request in its own task, and
  each part shows when its model arrives. Tables receive only their
  visible 11-row windows. Messages strip raw action evidence from ranking
  inputs. Sections and motion rows yield against a 4ms presentation budget;
  scatter dots also check the budget every 128 points. DOM work stays on the
  main thread, proportional to the output being presented.
- Original synchronous primary capture, board updates, and IndexedDB cloning
  still consume UI time. History persistence still writes the whole history
  value; this change does not claim constant-time storage or rendering.

Measured locally with synthetic data against `7ca3198526ad345e74fe03fc1b6216c29ace6045`
(median of three Node runs, `tests/performance-benchmark.js`):

| Calculation | Size | Before | After |
| --- | ---: | ---: | ---: |
| Exact trend fit | 1,000 points | 254 ms | 22 ms |
| Exact trend fit | 2,000 points | 1,280 ms | 28 ms |
| Exact trend fit | 4,000 points | 6,329 ms | 64 ms |
| Near-near-streak | 20,000 records | 108 ms | 0.43 ms |
| Trace-series reconstruction | 80 clicks | 869 ms | 218 ms |

These compare computation, independent of worker transport. A separate browser
fixture with 2,000 historical records measured about 11ms for initial report
UI work; the previous synchronous report took about 206ms. Full report latency
includes asynchronous calculations and drawing, so those two numbers do not
claim an equivalent reduction in time until every chart is visible.

`tests/analysis-isolation-browser-check.js` blocks real worker loading while
playing, finishing, persisting, restarting, and restoring a saved board. It
checks late-result ownership and visible task errors. The large-history
browser fixture poisons main-thread calculation entry points so accidentally
calling them is a test failure.

The metrics column and its controls are constructed before the initial layout,
without waiting for a worker reply. Its first computed values fill that reserved
space (the box is `.idle`, invisible at full width, until the first live sample
arrives); worker latency cannot move the board after startup reveals it.

## Click-time evidence cost (2026-09-26)

Spec: [Input latency](../product/board-and-layout.md#startup-readiness-and-responsiveness).
Each board action runs, before it mutates the board, the visible-position
proof (misclick classification, evidence, and Guardian Angel all share one cached
proof), then guess scoring for reveals or `Odds.analyzeView` for flags and
chords. These run in the input handler. Measured in the browsers with real
input and an 80 MB (structured-clone) synthetic history, expert flags,
chords, and guesses were the slow inputs: in Firefox 10% of expert inputs
took over 200ms to paint, while ordinary reveals took under 20ms.

Cause: `analyzeView` rechecked every residual clue at every search node and
then visited every combination of component layouts, adding every sea cell
per combination; positions near its 250,000-visit budget cost about 250ms
(V8) to 600ms (SpiderMonkey), frequently only to return unmeasured. The
join now groups layouts by mine count ([per-game stats](per-game-stats.md))
and the proof search is flattened ([Guardian Angel](guardian-angel.md)).
Visit budgets, completeness, and every threshold decision are unchanged.

- Equivalence: 23,287 positions from seeded full games (9x9, 16x16, 30x16,
  30x24; reveals, guesses, flags, chords) give identical proofs, guess
  scores, Guardian Angel certificates, and odds (sums within 1e-9 relative; the
  former per-layout addition itself drifts up to about 3e-11).
  `node tests/performance-benchmark.js 7ca3198` repeats this on seeded
  games and reports totals and the slowest position.
- Firefox, 4,658 positions: expert flags over 100ms fell from 179 of 891 to
  3; guess p90 from 603ms to 4ms. Positions whose exact proof exhausts its
  2,000,000-node budget (about 1% of expert positions, all incomplete) fell
  from 425–1,116ms to 52–113ms for the whole action; that budget case is
  the remaining tail (V8 about 40ns per node). Since 2026-11-02 the proof
  counts layouts instead and has no budget: on 1,736 positions of
  simulated Expert games it took at most 3.7 ms in Node (the node search
  16.4 ms), every one complete.
- Benchmark (V8), expert 806 positions: 24,315ms → 389ms total; slowest
  position 316ms → 3.6ms.

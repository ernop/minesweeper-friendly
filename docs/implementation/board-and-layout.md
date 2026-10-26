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
  preferences. `applyBoardPosition` selects docked/compact details first, then
  constrains the applied offset to the main column without rewriting the
  saved preference. `#game-frame` always centers within `#game-area`
  (2026-10-07; the former `#page-layout.board-beside-game-data` resting place
  at the column's right edge is removed). `applyBoardPosition` bounds,
  `syncJusticePlacement` collisions, and `placeBoardSides` read the same
  `--board-edge-inset` (8px, on `#page-layout`), so a zero offset at the
  resting place is never clamped. The top bound is that inset below the
  lowest visible game setup row (`#difficulty-tabs`, `#mode-options`,
  `#board-lab-panel`). `boardPositionOffset` returns zero while `#game-area`
  has `.trial-no-board`: the hidden frame measures as an empty rect at the
  page origin, and constraining it grew the applied offset by the bounds on
  every layout pass, which pushed a trial lobby thousands of pixels off
  screen once the setup rows were observed (found 2026-10-20).
  `#board-position-reset` sets both offsets to zero. Results and
  legends are outside that translated area. The editor exposes drag,
  arrows, numeric inputs, and labeled sliders. Browser scroll regressions
  cover docked and compact details.
  `boardPositionPanelRect` anchors the editor to the board and constrains it
  to the visible viewport. The panel is a body child so board transforms and
  column containment cannot change its fixed coordinate system; scroll and
  visual-viewport changes update it without changing the board's layout.
- Layout (2026-09-07; one details column since 2026-10-17; the metrics
  column removed 2026-10-20): `#page-layout` owns two grid columns: main and
  a fluid `#game-sidebar`.
  `detailsColumnFit` (`game/layout.js`) returns whether it docks (the room
  beside the board frame (+16) holds `--game-sidebar-min-width`, 320px) and
  its width limits: that minimum, and the room left when main keeps
  `max(board + 16, MAIN_MIN_BESIDE_DETAILS)` (640px). `syncGameSidebar` sets
  `--game-sidebar-docked-width` to `detailsColumnWidth`: the setting
  `detailsColumnShare` (default 0.46, `settings-core.js`) times
  `window.innerWidth`, rounded, within those limits. Before the settings
  load, CSS reserves `--game-sidebar-width`, `max(320px, 46vw)`, the default
  share. The grip `#details-resize` (`index.html`, between `main` and the
  sidebar) is a grid item in the sidebar's cell, sticky like it, pulled
  12.5px left into the 18px column gap; a ResizeObserver on the sidebar
  copies its height on the next animation frame. The grip's height sizes the
  grid row, so it can resize `#page-layout`, which the result layout
  observer watches; copied inside the callback, that shallower resize could
  not be delivered in the same frame and the browser reported a
  "ResizeObserver loop", which the error bar showed (found 2026-10-26: the
  sidebar shrinking on a new game, and dragging the grip). `syncGameSidebar` hides it unless docked and sets its
  `aria-valuemin/max/now` (px). Pointerdown captures the pointer and reads
  `detailsColumnFit` once; each move stores the clamped width as
  `detailsColumnShare` and schedules one `syncBoardLayout` per frame, whose
  sidebar width change reaches the charts through their own ResizeObservers;
  `lostpointercapture` (after pointerup or pointercancel) saves the settings
  and lays out once more. Left/Right arrows step 10px and save. The former
  fourth column (`#game-data-column`,
  `.game-data-docked`, `placeGameData`, `gameDataColumnWanted`) is removed.
  The sidebar contains `#result-summary` (empty after a game, which
  `renderImmediateGameEnd` and `renderResult` clear; the High scores view's
  head from `setHighScoresSummary(note)`), `#sidebar-controls` (a wrapping
  flex row holding `#top-right`, the archive chip and `#states`, and
  `#scores-nav` with `#see-scores-btn`), `#results`, and
  `#path-view-legend` in normal flow, with independent scrolling. The
  replay's view toggles are in the transport under the board, not here
  (2026-10-21). It is reserved before game end.
  When the board and minimum column cannot fit together, `syncGameSidebar`
  removes the sidebar from the grid and makes it an auto popover opened by
  Game details. Results or legend visibility/height never enters that
  width decision. `#top-right` and `#states` are wrapping flex rows.
  Stat sections: `buildStatSection(panelKey, title)`
  (`game/results.js`) returns a `section.stat-section` whose title button
  (`.stat-section-toggle`, `aria-expanded`, `aria-controls`) flips the
  remembered panel `settings.panels[panelKey]` through `rememberPanel` and
  schedules a board layout; no (?) since 2026-10-20. Panels
  `duringGame`, `gamePerformance`, and `boardTraits` default open
  (`settings-core.js`); the last two are game data's sides, whose titles
  `gameDataSideTitle` (`game/game-data-chart.js`) builds as
  `.stat-section-toggle` buttons inside the chart. `renderRanks` mounts the
  during-game section and `.board-time-profile-host` into `#result-stats`;
  `clearResultStats` empties it and hides the during-the-game board and card.
  `syncGameSidebar` ends with `fitGameDataToSidebar`: in chart view it sets
  the game-data figure's height to the larger of the sidebar height below
  its offset and its fixed part (the options row) plus
  `GAME_DATA_SIDE_MIN_HEIGHT` (240px) per open side (the chart's
  `.game-data-section.open` and its `data-open-sides`); CSS (`flex: 1 1 0`)
  gives that height to the chart. With both sides closed the section drops
  `open`, the figure's height is cleared, and the chart is one line. The
  configure and history subviews take the room as one view, at least
  `GAME_DATA_SUBVIEW_MIN_HEIGHT` (480px). `#scores-nav` joins the layout
  ResizeObserver so its changes refit the chart.
  `syncBoardLayout` applies board position, Justice placement, the blocks
  beside the board, and callout clearance. `placeBoardSides` (2026-10-07)
  measures `.session-summary`, `.recent-placements`, and (2026-10-26)
  `.game-stats` inside `#result-ranks`, in that order, and gives each
  `.beside-board` (absolute in `main`, which is `position: relative`) with
  `left`/`top` only when its width fits between the board
  (`BOARD_SIDE_GAP`, 16px) and the main column's inset: the summary on the
  left only, ranks won on the right only, this game's stats on the first
  side the two leave free, the left first. The board's horizontal extent is
  the union of the frame and the visible `#replay-controls`, which is wider
  than a small board's frame. Tops align with the frame. Trial layouts
  without a board skip it. Stats left in the tables section whose inline
  top is below the section's items (they did not fit on the first line
  beside the floated summary and ranks won) get `.below-first-line`, a left
  float. The float lands where the line put them, but unlike the inline
  block it does not push every later table below itself, so lifetime and
  the rest still fill the room beside the summary. CSS alone cannot do
  both: a float cannot rise above an earlier float, so floated stats could
  never share the first line beside the summary, and the inline block
  holds back every table after it. Each pass first clears `.beside-board`,
  `.below-first-line`, and the offsets. `applyCellSize`
  and the window resize
  handler call it before `syncResultClearance`, which takes the lowest of
  the Justice callout and the `.beside-board` blocks as the overhang the
  first result section clears; the transport is inside `#game-area`, so the
  area's bottom already includes it. Stats and legend need no overhang
  margins, floating/below-board classes, or z-index fixes. `newGame` empties
  `#result-ranks`, so the side blocks leave with the old result.
  `syncBoardLayout` first copies `#game-frame`'s width into
  `--board-frame-width` on `#game-area`, which sizes the transport.
  ResizeObservers respond to the main column, page layout, and board frame
  (`game/results.js`), and in `game/layout.js` to the top bar, `#top-right`,
  `#scores-nav`, `#mode-options`, `#board-lab-panel`, the board frame,
  `#replay-controls`, the results box, the Justice callouts, the game
  choice row, and the position editor.
  Legend items retain their complete vertical encoding labels. Replay choice
  callouts measure visible stats and legend bounds to avoid the sidebar.
  `renderPathOverlay` builds its legend into a detached fragment and replaces
  the live contents once, preventing transient collapse and scroll resets.
  `createResultSectionCollector` appends every section to `#result-ranks` in
  model order. The `tables` section has `heading: false`: daily placements,
  time/category tables, and all streak variants share one left-aligned
  wrapping collection. `boardTables` follows, labeled "This board", with
  exact 3BV/ZiNi/maximum-clue and board-shape time tables. Both precede
  point-chart sections and retain individual table labels.
- Game setup rows (2026-10-20), the first children of `main`:
  `nav#difficulty-tabs` holds `#game-sidebar-button`, the three preset links
  (`data-difficulty`), and `select#play-mode-select` (static, disabled with
  a loading option until `buildPlayModeSwitcher` in `game/play-modes.js`
  fills it from `init`: a hidden, disabled prompt option with value `''`
  reading "other modes", then one option per `PLAY_MODES` entry, `standard`
  labeled "Custom"). `div#mode-options` holds `#custom-form`,
  `label#board-generator` with `#board-generator-select` (filled by
  `buildBoardGeneratorSwitcher` in `game/play.js`), and the mode progress
  spans `#trial-progress`, `#pregen-progress`, and `#endgame-drill-info`;
  `#board-lab-panel` follows it. Every game choice goes through
  `chooseGame(difficulty, playMode)` (GAME CHOICE section of
  `game/controls.js`): a preset link passes its difficulty and `standard`,
  the menu passes `custom` and its value. Leaving a mode abandons an active
  trial and drops the pregen batch, then it saves both settings, rebuilds
  `config` with `boardFromPreferences`, calls `syncGameChoice`, and starts a
  new game. `syncGameChoice` marks the active preset link, sets the menu to
  the mode (or the prompt), bolds it while custom, shows `#mode-options`
  only while custom, and hides `#board-generator` when
  `generatorAppliesToMode` is false. `activeGenerator` (`game/play.js`)
  returns the uniform generator for presets, so the stored generator choice
  applies only to custom games.
- Top bar: `div#top-bar` is the first child of `#page-layout`, a wrapping
  flex row aligned right holding `#play-limits-use` (plain text, hidden
  until a limit is set) and `a#settings-btn` (2026-10-21; in the settings
  row on 2026-10-20). From 2026-10-14 to 2026-10-20 it was a `nav` that
  also held the daily limits link, the session picker, settings, and the
  other pages menu. `.game-booting` blocks its pointer input like the
  other chrome.
- Settings row (2026-10-20): `div#settings-row` (`role="group"`, "Your
  settings") sits in `main` between `#backup` and `#site-footer`, a
  wrapping centered flex row of three `.settings-row-group` boxes
  (`inline-flex`, `nowrap`, so each wraps as a unit): `#play-limits-btn`
  (with `#settings-btn` until 2026-10-21); `label#session-picker` (a static
  `select#session-definition-select`, disabled with a loading option until
  `initSessionScopeSelect` in `game/rankings.js` fills it from
  `init`); and `span#board-display` (`#zoom-label` with `#zoom-select`,
  `#board-position-btn`, and `#pixel-ratio`). `.game-booting` blocks its
  pointer input like the other chrome. `p#site-footer` links
  self-check.html, training.html, problems.html, and the hosted game.
  `renderPixelRatio` (ZOOM section of `game/layout.js`, called
  from `initCellSizeControl`) writes `devicePixelRatio`, rounded to two
  places, into `#pixel-ratio-value`, then listens once on
  `matchMedia('(resolution: <ratio>dppx)')`, which stops matching when the
  browser zoom changes, and re-renders. Grid: two rows, `auto 1fr`; `main` spans
  both; the bar is row 1 of column 2, sticky at 12px; `#game-sidebar` is
  row 2, sticky at `12px + --top-bar-block` with its height reduced by it.
  `--top-bar-block` is `--top-bar-height` plus the 8px row gap;
  `syncGameSidebar` sets `--top-bar-height` from `topBar.offsetHeight` (the
  bar wraps in a narrow column) and the layout ResizeObserver watches the
  bar. In `.compact-sidebar` the bar is row 1 of the one column, static, and
  `main` row 2 (`--top-bar-block: 0`). Below 700px: bar row 1, main row 2.
  Without limits the bar holds only the settings button.
  `tests/session-placement-layout-fixture.js` checks the bar heads the right
  columns, or sits above main when compact, at four widths.
- Motion stats (2026-10-20): `#motion-stats` sits in `main` after
  `#result-ranks` and before `#backup`; `initMotionStats` builds its one
  open/close section ([implementation](motion-stats.md)).
- `setBoardPositionEditing` focuses `#board-position-btn` only when it closes
  an editor that was open; `initGamePreferences` restoring a closed editor
  no longer moves focus.
- Layout: `#results` (`#result-stats`: the stat sections, or `#stats-grid`
  with the final time while a result loads) is
  a normal-flow child of `#game-sidebar`, after the controls and before the
  legend. The two grid columns prevent overlaps.
  `syncGameSidebar` controls its compact popover
  and fits the game-data chart's height (see Layout 2026-09-07 above);
  no result-dependent gutter calculations or overhang margins remain.
  ResizeObserver tracks page/main/frame geometry; the root scrollbar gutter
  remains reserved so page growth cannot shift the board.
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
- `renderResult`/`renderRanks` await worker models. Tables receive only their
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

Spec: [Input latency](../product/board-and-layout.md#input-latency-user-report-2026-09-26).
Each board action runs, before it mutates the board, the visible-position
proof (misclick classification, evidence, and Justice all share one cached
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
and the proof search is flattened ([A just universe](just-universe.md)).
Visit budgets, completeness, and every threshold decision are unchanged.

- Equivalence: 23,287 positions from seeded full games (9x9, 16x16, 30x16,
  30x24; reveals, guesses, flags, chords) give identical proofs, guess
  scores, Justice certificates, and odds (sums within 1e-9 relative; the
  former per-layout addition itself drifts up to about 3e-11).
  `node tests/performance-benchmark.js 7ca3198` repeats this on seeded
  games and reports totals and the slowest position.
- Firefox, 4,658 positions: expert flags over 100ms fell from 179 of 891 to
  3; guess p90 from 603ms to 4ms. Positions whose exact proof exhausts its
  2,000,000-node budget (about 1% of expert positions, all incomplete) fell
  from 425–1,116ms to 52–113ms for the whole action; that budget case is
  the remaining tail (V8 about 40ns per node).
- Benchmark (V8), expert 806 positions: 24,315ms → 389ms total; slowest
  position 316ms → 3.6ms.

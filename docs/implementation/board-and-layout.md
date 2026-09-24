# Board position and page layout — implementation notes

Spec: [docs/product/board-and-layout.md](../product/board-and-layout.md). Index: [AGENTS.md](../../AGENTS.md).

- Board position: `settings.boardOffsetX/Y` are independent persistent pixel
  preferences. `applyBoardPosition` selects docked/compact details first, then
  constrains the applied offset to the main column without rewriting the
  saved preference. `#game-frame` centers within `#game-area` except under
  `#page-layout.board-beside-game-data`, which `syncGameSidebar` sets when
  the details column is docked and `gameDataColumnWanted()`; the frame then
  rests at `margin-inline: auto var(--board-edge-inset)`. `applyBoardPosition`
  bounds and `syncJusticePlacement` collisions read the same
  `--board-edge-inset` (8px, on `#page-layout`), so a zero offset at the
  resting place is never clamped. `#board-position-reset` sets both
  offsets to zero. Results and
  legends are outside that translated area. The editor exposes drag,
  arrows, numeric inputs, and labeled sliders. Browser scroll regressions
  cover docked and compact details and the independent metrics panel.
  `boardPositionPanelRect` anchors the editor to the board and constrains it
  to the visible viewport. The panel is a body child so board transforms and
  column containment cannot change its fixed coordinate system; scroll and
  visual-viewport changes update it without changing the board's layout.
- Layout (2026-09-07): `#page-layout` owns three grid columns: metrics, main,
  and a fluid `#game-sidebar` (2026-09-23: the preferred `--game-sidebar-width`
  is `clamp(320px, 30vw, 760px)`, registered with `@property` as a length so
  `syncGameSidebar` reads resolved pixels; it sets `--game-sidebar-docked-width`
  to the preferred width capped by the room beside the board, never below
  `--game-sidebar-min-width`, and docks only when that minimum fits).
  A fourth column, `#game-data-column` (2026-09-23), sits between main and
  the sidebar when `#page-layout.game-data-docked` is set: `syncGameSidebar`
  docks it when `gameDataColumnWanted()` (chart enabled, not a trial mode) and
  main keeps `max(board + 16, MAIN_MIN_WITH_GAME_DATA)` with the column at
  `GAME_DATA_MIN_WIDTH` or more and the sidebar at its minimum. It sets
  `--game-data-docked-width` (preferred registered `--game-data-width`,
  `clamp(360px, 24vw, 760px)`, capped by that room) and pins the sidebar to
  its minimum. `placeGameData` moves an existing `.board-time-profile-host`
  between `#result-stats` and the column when the layout changes;
  `clearResultStats` empties both wherever results are cleared.
  The sidebar contains `#top-right`, `#scores-nav`,
  `#results`, and `#path-view-legend` in normal flow, with independent scrolling. It is
  reserved before game end. `syncGameSidebar` compares the viewport, metrics
  width, and board frame width; when they cannot fit together, it removes the
  sidebar from the grid and makes it an auto popover opened by Game details.
  Results or legend visibility/height never enters that width decision.
  `#top-right` and `#states` are wrapping flex rows (selects share a row when
  they fit). `syncGameSidebar` ends with `fitGameDataToSidebar`, which sets
  the game-data figure's height to the sidebar height below its offset
  (minimum 480px) when the chart is in `#result-stats`; in the game data
  column CSS makes it fill the column. `#scores-nav` joins the layout
  ResizeObserver so its changes refit the chart.
  `syncBoardLayout` applies board position, Justice placement, and callout
  clearance. `syncResultClearance` considers only Justice; stats and legend
  need no overhang margins, floating/below-board classes, or z-index fixes.
  ResizeObserver responds to the main column, page layout, and board frame.
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
- Layout: `#results` (summary + `#stats-grid`) is a normal-flow child of
  `#game-sidebar`, after options and before the legend. The grid columns
  (three, or four with `#game-data-column`) prevent overlaps. `syncGameSidebar` controls its compact popover
  and fits the game-data chart's height (see Layout 2026-09-07 above);
  no result-dependent gutter calculations or overhang margins remain.
  ResizeObserver tracks page/main/frame geometry; the root scrollbar gutter
  remains reserved so page growth cannot shift the board.

# Path and choice replay views — implementation notes

Spec: [docs/product/replay.md](../product/replay.md). Index: [AGENTS.md](../../AGENTS.md).

- Path and choice replay views ([Path and choice replay views](../product/replay.md)):
  `#path-view-control` (in `#scores-nav`) exposes separate buttons for off,
  raw every-sample path, numbered raw click locations, movement speed, click
  speed, game progress, and less useful—never a dropdown.
  The game-history slider `#replay-slider` (inside collapsed sidebar Replay
  game; positions 0 … N = actions done, N = the finished board) drives
  `replayStep`; `setReplayStep` clamps it, derives `replayEnabled = step <
  count`, re-renders through `renderPathView`, and starts the solver
  precompute when the frames are first entered. `renderReplaySlider` owns
  range/thumb/‹ ›/end status; `renderReplayFrame` paints a frame. Any path
  mode combines with the shown pre-action board and is truncated at the
  chosen position without changing its full-game color scale.
  `renderPathOverlay` builds `#path-canvas` (absolute over `#board`,
  pointer-events none) and a `lastPathState` snapshot from the just-finished
  RAM trace; `paintPathCanvas` repaints from that state so legend hovers can
  spotlight without rebuilding anything. Continuous parameters get binned
  interpretive legends (`appendPathBinLegend` + pure `pathValueBins` /
  `pathBinIndex`): one chip per color class with its exact interval;
  chip hover spotlights those segments, and board mousemove hit-tests
  segments (`pathSegmentAtPoint`, listener on `#board` so the canvas stays
  input-inert) to show a `.path-tooltip` with the exact value and light the
  matching chip. Speed colors use `pathDisplayRange`'s Tukey-trimmed local
  range; a constant range renders its one real value instead of fabricated
  endpoints. `pathPointMapper` walks layout events so each point maps through
  its geometry at trace time. Sampling gaps ≥300ms (`pathTraceGaps`) draw as
  dashed connectors; those whose endpoints are ≥40px apart are 'away'
  (off-window) and get an on-path duration label. `pathClickActions` joins
  raw inputs to decision frames by exact event time, so click markers color
  chords (green) apart from plain left releases (blue) and right presses
  (red). Less-useful segments derive from decision mistake evidence and
  include the preceding/following useful boundary actions plus per-segment
  duration labels.
  Review mode
  paints each decision event's saved pre-action position into the real board
  DOM, marks measured choices and selection, and restores the exact finished
  markup on exit. It adds a game-history range slider (`#replay-slider`, with
  notch marks and numeric labels at the endpoints and quarters) that is
  equivalent to prev/next and shows the current action number in a label
  riding above its thumb (`#replay-slider-value`, `--thumb` 0–1), plus six
  independent overlay toggles
  (`#replay-overlay-control`, `replayOverlays`; moves + mines default on).
  Architecture (2026-09-04 review): everything review mode can draw is one
  table, `REPLAY_ENCODINGS` (PATH REPLAY: COMPUTATION span) — key → color,
  legend swatch form, complete legend wording. `applyReplayEncodingColors`
  publishes each color as `--replay-<key>` on `:root`; `style.css` reads
  only those variables for the `.cell.replay-<key>` rules; the canvas
  painter reads `REPLAY_ENCODINGS.<key>.color`; the legend renders the
  wording verbatim. A color or meaning changes in exactly one place.
  Per frame, `replayFrameModel(evaluation, solver, overlays)` (pure, DOM-free,
  frozen by `tests/path-replay-test.js`) returns per-cell
  `{revealed, adjacent, flagged, marks: Set<key>, badge}` plus
  `triggerCell`, `choiceCount`, `solverState` ('off' | 'exact' | 'bounded');
  `paintReplayFrame` only turns keys into classes and badges.
  `replayLegendRows(overlays, solverState)` and `replayStatusParts` are the
  pure legend/status models; `appendReplayLegend` / `renderReplayStatus`
  render them (`pathLegendSwatch` draws one swatch per form: line, dot,
  ring, dashed, dashed-thin, fill, flag, badge, crosshair, leader).
  Solver layers come from `replaySolverRead` (exact `Odds.analyzeView`
  enumeration; bounded `Justice.proveFacts` facts when over budget; a solver
  exception propagates — never shown as "too complex"), cached per decision
  index in `replaySolverCache`. `scheduleReplayPrecompute` fills that cache
  for every frame in 8 ms `setTimeout(0)` slices as soon as review mode is
  on (cancelled by `cancelReplayPrecompute` on toggle-off and new board), so
  slider scrubbing never waits on an enumeration.
  Solver deductions draw as dashed inner rings via `::after` (their own
  visual channel) while player-action marks stay on `box-shadow`, so both
  can coexist on one square. Encoding keys: `safe` (dashed green; flagged
  too — a dashed safe ring around a flag exposes a provably wrong flag),
  `chord-now` (dashed blue) with `chord-open` pale-green fill on the cells it
  opens, `mark-mine` (mini flag `.replay-flag-hint` on unflagged proven
  mines), `chord-after-marks` (dashed teal, combos opening ≥ 2 cells, also
  filling their opens) and `chord-after-marks-single` (thin 1 px dashed
  teal, the dominated 1-cell combo, no fill) — `replayMoveOptions` finds
  both chord kinds; `mine` (dashed red, the cell's own flag/mine glyph dimmed
  via `.cell.replay-mine > svg` so the hint stays full strength); `prob`
  (bottom-right `.replay-prob` badge, suppressed on a proven cell whose
  ring already states 0/100 — fact 1 with `mines` on, fact 2 with `moves`
  on); `choice` (solid purple inset ring, same hue as the pocket labels —
  it was a second green before, indistinguishable from `safe`); `trigger`
  (gold ring on `evaluation.triggerCell` for chords, the single selected
  cell otherwise) and `selected` (translucent gold wash via background-image
  + `color-mix`, stacking over the chord-open background-color).
  Canvas layers up to the shown moment: `pointless`/`purposeful` (hollow
  numbered rings, orange/black, `drawRingMarker`, so the glyph under the
  click spot stays readable), `movement` underlay (deep pink;
  `pathRoughSegments`: crawling under ¼ of the game's median moving pace or
  a >135° reversal), and the gold `crosshair` with a white action-kind pill
  centered just above the arms (never over the acted square; clamped to the
  canvas). The canvas survives path-off while review mode is active so
  those layers keep rendering. `pathChoiceAreas` groups uncertain
  reasonable choices into connected pockets; `#replay-choice-areas` draws
  leaders (`--replay-area`) to side labels with non-misleading mine risk and
  cell count, choosing left or right to avoid the result summary/viewport
  edge. Sidebar `#scores-nav` contains `#replay-review`, a native details
  disclosure collapsed for each new game, plus display options and scores.
  Its transport uses a full-width slider above four navigation buttons.
  Closing review restores the finished board; keyboard replay shortcuts only
  apply while the transport is visible. These controls take no space beneath
  the board and are outside its saved translation.

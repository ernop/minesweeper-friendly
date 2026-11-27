# Path and choice replay views

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/replay.md](../implementation/replay.md).

## Goal and transport

Let players inspect every decision, solver deduction, probability, and cursor movement of any finished game (current game, old game from a full score list, or restored reload) directly on the main board without duplicating the board or shifting page layout.

- **Transport placement:** appears directly beneath the board once a game ends, centered under the board (tracking board `position` offset, sized up to `620 px` within free flank room so `Overlays` and `Path` rows stay single-line whenever room allows, minimum `340 px`, never colliding with the details dock), and disappears when a new board starts or a trial lobby/review opens. No disclosure panel hides it.
- **Controls:** full-width action slider (`0 … N`, notch marks thinned above `60`, black labels at endpoints and quarters, floating thumb position label) above five tooltipped icon buttons (`Start`, `back`, `play/pause`, `forward`, `End`), followed by a fixed-height two-line status area, the two toggle rows (`Overlays`, `Path`), and the live **`Mentation`** row (`#replay-mentation`).
- **Mentation & Theory of Mind (`#replay-mentation` + `#replay-mentation-panel`, `mentation-v2`):** integrated directly into the Play Game Replay (the single replay surface for both just-finished games and historical games opened from score lists or via `?replay=<endedAt>&step=<k>` links from [Training & Mentation](training.md#training-page-traininghtml)). On every stepped frame `k`:
  - **1. Where you were looking & thinking (Attention simulation):** partitions active frontiers, maps cursor samples to board coordinates, simulates active visual focus (drawn as a soft blue dashed Attention Focus Halo on the board canvas), detects eyes-ahead transitions, attention tunnels (locking onto one cluster while easy counting moves wait in another region), cursor-assisted clue reading, working-memory chunk execution, and abandoned frontier checks (drawn as a dashed purple ring labeled `checked N ms`).
  - **2. Intent vs. execution (Misclick / Misread / False-belief classifier):** distinguishes spatial aim slips (edge clicks beside a proven-safe square, ready chord, or proven mine, drawn with a dashed amber intended-aim arrow), button-order / 1.5-click slips, counting misreads (e.g., 1-flag-short clue with a nearby distractor flag), false beliefs from earlier wrong flags, speculative ocean clicks, and deliberate moves.
  - **3. What was known & how it was known (Deduction proof):** states whether the move was Known Safe, Known Mine, Known Safe Chord, Unforced Guess, Forced Guess, Blunder, Wrong Flag, or No-op, names the exact witness clue number(s) `(col, row)` proving the square (or the missed safe square on an unforced guess), and highlights witness clues on the board with `.replay-witness`.
  - **4. Inline calibration (`userdata['mentationFeedback']`):** `Accurate` / `Partly right` / `Wrong` buttons, structured correction reasons, and optional note right inside `#replay-mentation-panel`, plus `<< Prev notable` / `Next notable >>` jump buttons in `#replay-mentation`.
- **Frame semantics:** position `N` restores the exact finished board; every earlier position `k` renders the player-visible board immediately before action `k + 1` with overlays and legend. Stepping or playing never changes transport height. Left/Right arrow keys step when no other interactive control has focus.
- **Playback:** plays at actual recorded inter-action intervals (`500 ms` hold on position `0` before the first click), stops at the finished board (`Play` at `End` restarts from `0`), and pauses immediately on any manual step, slider drag, hover preview from [live perf charts](during-game.md), or new game.
- **Live perf chart scrubbing:** hovering [live perf charts](during-game.md) previews that moment in place on the board, slider, status, and legend without overwriting saved replay position (restoring on mouse leave); clicking a chart or event track locks the replay to that moment.
- **Reload safety:** restoring a finished game from the trace store deals no live board underneath it, preventing accidental timer starts or false abandoned-board counts in auto-opening modes (`3BV countdown`, `Endgame drill`).

## Action marks and choice callouts

- **Active-action visuals:** solid purple rings mark the measured reasonable choice set (matching uncertain-group label color); a gold ring marks the acted square (for a chord, its number); a translucent gold wash marks squares the action changed; a gold crosshair with a white action-kind pill (clamped to the board above the crosshair) marks the exact input pixel even when path mode is off.
- **Status line:** highlights actions done, decision time, next action kind, and measured choice count (largest text: bold `16 px`), omitting the game's final time (already in the stats column). At the finished board, displays only action count and `"Finished board"`.
- **Uncertain-choice callouts:** connected groups of uncertain reasonable-choice cells draw leader lines to side labels naming exact mine probability (`50/50` strictly for exact 50%; other uncertain values never round to `0%`, `100%`, or `50/50`) and square count, choosing the side clear of the dock and viewport edge. Proven-safe choices show no callout.

## Board overlays (`Overlays` row)

Six independent persisted on/off switches directly at the transport foot (no settings-page copy). Solver deductions use dashed inner rings while player actions use solid inset rings/washes so both channels coexist on the same square without overwriting each other.

- **`available moves` (default on):** shows the player's full proven option set — dashed green ring on every covered proven-safe square (including flagged squares, exposing provably wrong flags); dashed blue ring on every satisfied safe chord; top-left mini flag badge (in the player's chosen flag style) on every unflagged proven mine; dashed teal ring on every number that becomes safely chordable once its proven mines are flagged (thick ring when opening `>= 2` cells with pale-green target tint; thin ring when opening `1` cell, marking the dominated two-input combo). Chords satisfied by a wrong flag are never marked safe.
- **`forced mines` (default on):** dashed red ring on every covered proven mine (plus dimmed mine glyph when unflagged; confirms existing flags).
- **`mine %` (default off):** bottom-right white badge showing exact mine probability (%) from unlimited layout counting (omitted where an active `available moves` or `forced mines` ring already states 0% or 100%).
- **`pointless clicks` / `purposeful clicks` (default off):** separate numbered hollow ring layers for mistake-tagged (orange) and clean (black) actions up to the displayed frame so cell numbers stay readable underneath.
- **`rough movement` (default off):** deep-pink underlay on cursor segments below `1/4` of the game's median moving pace or reversing direction by `> 135°`.
- **Caching & errors:** solver proofs cache per frame and precompute in short idle slices when review starts (clearing on new board). Solver errors surface visibly — never `"position too complex"`.

## Mouse path views (`Path` row)

Six mutually exclusive views (clicking an active view turns paths off; no separate `"off"` button; persisted in settings). Every point maps through the trace's recorded layout snapshots so paths remain accurate across mid-game scroll/zoom and post-game zoom changes, without intercepting board input. At earlier slider frames, paths truncate to the displayed position while keeping full-game color scales.

- **`raw path`:** `3 px` polyline through every cursor sample (warmup included), light-to-dark over time.
- **`click locations`:** numbered dots at raw left-release (blue), right-press (red), and detected chord (green, joined to accepted chord decision timestamps) positions.
- **`movement speed` / `click speed` / `game progress`:** `4.25 px` polylines colored blue (low) to red (high) across six discrete numeric interval chips (Tukey `1.5×IQR` display bounds once `>= 8` values exist; constant values report that single value). Movement speed includes merged co-timestamped travel ([Storage](storage-and-history.md#capture-provenance)). Silent stretches `>= 300 ms` render as dashed gray connectors (labeling off-screen `"away"` duration when endpoints are `>= 40 px` apart). Bidirectional hover spotlights segments from legend chips and shows exact nearest-segment values from board hover.
- **`less useful`:** shows complete episodes bounded by the prior useful action (blue), the mistake-tagged run (orange: no-ops, contradictions, avoidable/higher risk, lower one-move life — never a fatal minimum-risk forced guess alone), and the next useful action (green), labeling each action interval.

## Interpretive legend

- Lives at the bottom of the adaptive details dock (below live perf charts and Game Data, scrolling independently when docked beside the board) so changing frames or toggles never moves transport buttons, stats, or the board.
- Every visual encoding has its own unshortened line: `22 px` board-matched swatch, bold meaning headline, and smaller black detail line underneath, grouped under bold underlined titles.

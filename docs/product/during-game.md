# Live perf charts (during the game)

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/during-game.md](../implementation/during-game.md).

## Goal and placement

Show how progress, available moves, pace, move efficiency, and discrete events unfolded second-by-second through the finished game, linking every moment directly back to the main board's replay without duplicating the board.

- **Placement:** titled `live perf charts` (no `(? )` button), heading the details dock above [Game data](game-data.md) on wins and filling the dock on losses (or flowing full-width below the board when neither flank fits; [Board and layout](board-and-layout.md)). Shown after finished wins/losses and restored old games, not in High scores or trial review.
- **Layout stability and visibility:** the dock is reserved before game end so finishing never moves the board. Clicking the title collapses/expands the block (remembered across games, returning freed height to Game Data); the `live perf charts` display switch removes the block completely.
- **Off-thread computation:** computed once after game end in the reports worker (never during play), sharing incremental board proofs with [game-end evaluation](game-end-evaluation.md).

## Charts, scales, and legends

Four stacked parts share one game-seconds x-axis (first click to game end, aligned vertical gridlines, seconds labeled under the first and last parts). Any chart with no visible rows hides itself:

| Order | Part | Y axis / representation |
| --- | --- | --- |
| 1 | **Progress** | `0%` to `100%` (labeled every `20%`): `3BV solved`, `squares opened`, `mines flagged`. |
| 2 | **Moves available** | Raw count starting at `0` (step `1/2/5 × 10^k`, `<= 5` labels, `120 px` plot height); step lines showing board options between clicks. |
| 3 | **Event tracks** | Three horizontal lanes (`clicks`, `jumps`, `pauses`); instants draw as distinct shape + color marks, spans draw as bands/bars. |
| 4 | **Relative against whole game** | Pace, move usefulness/distance, board, and report rows plotted as value divided by whole-game value (`1×` black reference line). |

- **Log vs linear scale (`duringGameRelativeScale`):** controlled by the `log scale` checkbox in the options row (checked by default):
  - *Log (default):* doubling ticks (`⅛×`, `¼×`, `½×`, `1×`, `2×`, `4×`, `8×`), 1–3 doublings each way as needed; values beyond `3` doublings clamp at the edge and `0` sits on the floor. Series whose whole-game value is `0` or unmeasured draw no line (their legend still shows the value).
  - *Linear:* `0` on the floor up to `2×–8×` (step `½×`, `1×`, or `2×`, `<= 6` labels, always marking `1×`), clamping out-of-range spikes at the top so one outlier never flattens other lines.
  - Plot left edges reserve room for every ratio or native-unit label so switching scales or hovering never shifts plots horizontally.
- **Native unit y-axis on focus:** whenever one line on the relative chart is hovered/focused (via chart, legend, or its `game summary perf` row) or is the sole drawn line, the y-axis ticks relabel in that line's own units (`r × whole-game value`, e.g., `273ms` at `1×`) without moving ticks or lines.
- **Legends below each part:** each legend sits directly beneath its own part (`whole game (1×)` on the relative chart, `game average` on moves available, counts on event tracks), listing swatch/mark, name (definition on hover), and summary value.
- **Transient legend picks:** clicking a legend entry when all rows are shown solos that row; clicking another adds it; clicking a shown row hides it. Hiding the last visible row (or restoring the last hidden one) restores all rows, since showing none is useless. Hidden entries keep their place struck through; event tracks retain all three lanes to avoid vertical reflow. Picks persist across redraws for the current game and reset to all-shown on the next game.
- **Hover link with Game Data:** hovering a line or legend entry rings the matching `game summary perf` row (or rows counted over that event), and hovering a `game summary perf` row spotlights its matching line and event marks here ([Measurement catalog](measurement-catalog.md)).
- **Footer options row:** `averaging`, `log scale`, and `configure` sit in one compact row at the bottom.

## Hover preview and replay link

- **Vertical hairline and card:** hovering anywhere over the charts draws one vertical line through all parts and opens a compact card beside the pointer (avoiding the board) showing the timestamp and nearest visible line's native value (or track events at that moment, or `"nothing measured at this moment"` / `"none at this moment"`). The nearest line thickens while sibling lines fade.
- **In-place board preview:** while the pointer moves across the time axis, the main game board's replay scrubs live to the position immediately before the next click (shading that click's squares and keeping the player's board style and replay overlays; [Path and choice replay](replay.md)). The last `6 px` of the axis show the finished board. Hovering stops active playback; leaving the charts restores the replay's saved position without overwriting it.
- **Click to lock:** clicking a chart or event track commits the replay to that moment and scrolls the board into view if needed (clicking a legend toggles the series instead).

## Averaging

One options-row control (`duringGameAveraging`, default `2 s rolling average`) governs all averaged rows: rolling `2 s`, `5 s`, or `10 s` centered on each moment; `raw incidents`; or fixed `2 s`, `5 s`, or `10 s` buckets from first click.

- Raw incidents stay visible beneath averages (colored dots for measured values, foot ticks for rate incidents; rates in raw mode show ticks only).
- Buckets or windows spanning `< 1 s` of play show no value (avoiding noise over slivers of time); whole-game values have no minimum and match [Game data](game-data.md) exactly. Progress, board-state, and event rows do not average.

## Row catalog

Any row representing a catalog measurement uses its exact catalog name, definition, format, and whole-game value ([Measurement catalog](measurement-catalog.md)). Progress rows start from the initial state (a given opening counts as already solved). Moves-available and usefulness/distance rows read the board before each click using exact unlimited proofs (all deduction levels follow [Design axis](design-axis.md#deduction-levels), counting each square at the first level proving it; flags are player notes, not proof).

### Default-shown rows

| Row | Group | Definition |
| --- | --- | --- |
| `3BV solved` | progress | share of board 3BV solved (openings count once when any zero opens; isolated numbers count when opened) |
| `squares opened` | progress | share of safe squares opened |
| `mines flagged` | progress | share of mines carrying a flag (wrong flags on safe squares excluded) |
| `3BV/s` | pace | 3BV solved per second |
| `click rate` | pace | board-changing clicks per second |
| `action gaps` | pace | gap between consecutive board-changing clicks (averaged by median) |
| `fastclick gap` | pace | press-to-press ms of each planned pair at click 2 (averaged by median; [Per-game stats](per-game-stats.md#timing-cursor-and-movement-stats)) |
| `mouse speed` | pace | cursor travel per second including pauses (dots show speed between board-changing clicks) |
| `safe squares known` | moves available | covered, unflagged squares proven safe between clicks |
| `mines by counting` | moves available | covered, unflagged squares proven mined by single-number counting (level 1) |
| `mines by counting near the last move` | moves available | `mines by counting` within `<= 5` Manhattan steps of last board-changing click (none before click 1) |
| `chordable numbers` | moves available | open numbers with flags equal to their count, every adjacent flag on an actual mine, and `>= 1` covered neighbor |
| `most 3BV per click` | move usefulness & distance | best `3BV / click` among proven moves (opening a zero or isolated number = `1/1`; chord of a fully proven open number = distinct 3BV opened divided by `1 + unflagged adjacent mines`; `0` for edge-of-opening numbers; `none` when no proven move opens a square) |
| `steps to the nearest safe square` | move usefulness & distance | Manhattan steps from last board-changing click (chord = its number) to nearest covered, unflagged proven-safe square (none before click 1 or when none proven) |
| `squares moved between actions` | board | Chebyshev squares between consecutive board-changing clicks (averaged by mean) |

### Optional rows (off by default)

- **Pace & efficiency:** `efficiency`, `board-changing click share`, `IOE`, `no-op rate`, `misclick rate`, `path / click`, `path / 3BV`, `flag→chord gap`, `flag rate`, `flag-removal rate`, `cadence spread` (flagging rows unmeasured when `flagsPlaced === 0` or `flagsBlocked`).
- **Board:** `work areas` (separate clusters of proven-safe squares, merging squares `<= 2` Chebyshev steps apart).
- **Moves available:** `mines known`, plus first-level breakdowns: `safe by counting / overlap / all numbers / mine total` (summing to `safe squares known`) and `mines by overlap / all numbers / mine total` (summing with `mines by counting` to `mines known`).
- **Move usefulness & distance by level:** `most 3BV per click` and `steps to the nearest safe square` split by `counting`, `overlap`, `all numbers`, and `mine total` (a move's level is the hardest fact it needs).
- **Report categories:** `game risk rate`, `early guess rate`, `time loss rate`, `life maximization rate`, `excess game risk rate`, `modeled life gap rate` (each placed at the action's timestamp; `"not measured"` when the game carries measurement notes).

## Events and move characterization

`"Near"` a click in move events means within `<= 2` Chebyshev squares of anything that click opened or marked. A *move* (jump) is a board-changing click `>= 3` squares away.

| Track | Rows (mark) |
| --- | --- |
| `clicks` | `no-op clicks` (ring), `misclicks` (cross), `flags removed` (down triangle), `flags on safe squares` (up triangle), `guesses` (diamond), `openings` (square), `unused flags` (outlined up triangle) |
| `jumps` | `moved on` (chevron right), `left hard work` (outlined arrow right), `left easy work` (arrow right), `forks` (fork), `came back` (chevron left) |
| `pauses` | `long gaps` (span band), `window left` (top span bar) |

- **Default events (11):**
  - `no-op clicks`: reason named in card (e.g., `"number still short of flags"`).
  - `misclicks`: actions contradicted by visible proof (matching the game's misclick count).
  - `flags removed`: within `1 s` of placement labeled a quick undo.
  - `flags on safe squares`: flags placed where no mine existed.
  - `guesses`: opening an unproven square after click 1. Card reports connected (`beside open numbers`) vs disconnected (`away from open numbers`), chosen risk vs lowest overall/beside/away risks (from exact guess ledger), exact **perfect play's chance to win** (`Odds.winChances`, fixed-mine games without Guardian Angel only — splits board into independent mine-count components and multiplies exact win chances while skipping dead squares whose revealed number never varies across safe layouts; reports explicitly when the search hits its work limit rather than estimating), whether a proven-safe move existed, and — when Guardian Angel's test shows nothing else on the board could ever settle the guess — how long that state had persisted (plus time saved on a fixed-mine loss if taken immediately).
  - `long gaps`: `>= 1 s` between board-changing clicks; card reports proven-safe squares (total, counting, near last click), ending action, no-ops inside the gap, and whether the window lost focus.
  - `moved on`: jump `>= 3` squares after local proven-safe squares ran out.
  - `left hard work`: jump `>= 3` squares while local proven-safe squares remained (and not toward them), none provable by single-number counting.
  - `left easy work`: jump `>= 3` squares while single-number counting had proved at least one local square safe.
  - `forks`: move made while proven-safe squares lay in `>= 2` separate work areas; card names area count and whether the nearest area was chosen.
  - `window left`: window hidden or unfocused span (games saved before `2026-09-26` did not record focus loss and report `"not recorded"`).
- **Optional events (3, off by default):** `came back` (returning to proven-safe squares left earlier, with wait duration), `openings` (clicks opening a zero region), and `unused flags` (correct flags unused by any chord, wins only).
- **Move event cards** report elapsed time since the previous board-changing click, whether the move was a guess, distance to nearest proven-safe square, and (when leaving work) how many safe squares remained and how many were provable by counting. Per-game counts feed `moveHabits` ([Per-game stats](per-game-stats.md#timing-cursor-and-movement-stats)) and [Game data](game-data.md#catalog-directions-and-defaults).

## Configure

`configure` replaces the charts with one checklist grouped by `progress`, `moves available`, `move usefulness and distance`, `pace`, `board`, `report categories`, and `events`, with top/bottom back buttons and `Escape` to return. Selections persist immediately in `duringGameRows`, `duringGameAveraging`, and `duringGameRelativeScale`; legend picks stay transient per game.

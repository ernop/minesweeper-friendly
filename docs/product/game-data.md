# Game data and the shared session

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/game-data.md](../implementation/game-data.md).

## Goal

Show at a glance after a win where every measured aspect of your play ranks against your chosen comparison pool (`game summary perf`, left) and how unusual the board itself was among won boards (`board traits`, right), using one shared scale without scrolling or redundant stat blocks.

## Placement and layout

- **Where it appears:** on regular wins (and High scores' latest win), Game Data replaces the scalar statistics table and sits in the adaptive details dock beneath [live perf charts](during-game.md) (or flows full-width beside/under live perf charts below the board when neither flank fits; [Board and layout](board-and-layout.md)). Losses and trial runs keep scalar stats in the `this game` table because unfinished boards have no solve-time or efficiency rank.
- **One shared band:** `game summary perf` on the left and `board traits` on the right read against one shared vertical percentile bar. No top chart heading, no `(? )` buttons, and no repeated board/mode/generator names (the page header and pickers already show them). Solve time is the `time` row.
- **Collapsible sides:** each side's title toggles that side open or closed (remembered across reloads). A closed side collapses to its title beside the bar while the open side takes the space; with both closed, the chart collapses to a one-line bar holding the two titles.
- **No scrolling:** neither the band nor distributions view ever gains scrollbars at any viewport size. With both sides open, the band stays side-by-side when it fits and stacks `board traits` under `game summary perf` (each with its own bar on the right) whenever stacking requires less shrinking; text and geometry scale down together to fit.
- **Compact footer options:** one row beneath the chart holds the `compared with` picker, `distributions`, and `configure`. `show values` and `session history` live inside `configure` to keep narrow docks single-line. `configure` and `session history` provide top/bottom back buttons and close on `Escape`.

## Percentile band, columns, and ranking

- **Percentile formula:** every item sits at `100 × (rank − 1) / (measured count − 1)` — the share of other measured games that beat this one, so `0%` (best) is at the top and `100%` (worst) is at the bottom.
  - The current game counts in its pool. Measured ties share mean ordinal ranks, except solve-time ties which retain earlier-finish order. A constant pool has no ordering and sits neutrally at `50%`.
  - Comparisons require at least two measured games in the pool; otherwise the row is omitted silently (no placeholder notice). Missing values and undefined divisions are excluded, never converted to `0`.
- **Logit standing bar:** plotted on a symmetric regularized logit scale $\ln((p + 0.1) / (100 - p + 0.1))$ so near-record ranks (`1st`, `0.05%`, `0.1%`, `1%`) stay visually distinct from ordinary top-10% runs. Colored continuously green (better) through white to red (worse) at each percentile's true absolute standing color.
  - **Autozoom:** pads the visible points' logit range by `5%` (at least `0.35` logit units) and snaps outward to standard milestones (`0, 0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 95, 98, 99, 99.5, 99.8, 99.9, 99.95, 99.99, 100`). Labels (`1st`, `last`, decades, quartiles, finer zoomed ticks) place inside the bar in priority order, skipping collisions. Zooming never shifts absolute standing colors.
- **Tail-aware percentage formatting:** everywhere a Game Data percentage prints (band hover cards, distributions `%` column, chart chips, accessible labels), `0%` is reserved strictly for 1st (`p === 0`) and `100%` strictly for last (`p === 100`). Values inside `(0, 1)` and `(99, 100)` keep one significant tail digit (`0.4%`, `0.02%`, `99.6%`) so near-record runs never round down to `0%`.
- **Band columns and typography:** pure black regular-weight Arial on white, one line per row, tabular digits, values and ranks one size larger than names (no side `%` columns in band view; exact ranks and percentages appear on hover):
  - **`game summary perf` (left):** pool name, `value` (right-aligned). On a scoped performance row whose base measurement is also visible, `value` displays its compact competition rank in that pool (`1st / 29`, `2nd / 29 (tie)`, `all 29`) instead of repeating the measured number; if the base row is hidden, it shows the measured value.
  - **`board traits` (right):** won-boards pool name, `value` (right-aligned), `rank` (left-aligned farthest-up competition rank among won boards: `130th / 854`, `152nd / 412 (tie)`, `all 50`, keeping `(tie)` on the outer edge away from the bar; the bar dot marks the tie midpoint and hover shows the full tie span).
- **Leaders and spotlighting:** leaders connect each row to its exact point and dot on the bar (minimizing squared label displacement while exact dots never move), stretching outward across spare width to keep angles shallow. Hovering or focusing a row spotlights its leader and dot while fading other leaders and dots — never fading text labels and never adding a blue hover fill behind rows.

## Comparison pools and scoped rows

- **One `compared with` picker (`gameDataPool`, default `all games`):** drives both views and all hover cards. Every pool filters to the same board size, mine count, play mode, and generator (and only no-mark games on a no-mark win), through this game's finish (or through now in High scores and old-game review):
  - **all games** (`no-mark` on no-mark wins);
  - **session** (follows the page-wide session picker at the foot of the page);
  - **time windows** (matching rank-table boundaries): `past hour`, `today`, `past week`, `this month`, `in <year>`, `last 365 days`;
  - **this board** (matching This-board table buckets): `3BV`, `ZiNi`, `max number`, `HZiNi`, `3BV spread` (0.5-cell band), `0–1 share` (rounded whole %), `zero-opening coverage` (rounded whole %), `islands`, `largest island`, `zeros`.
- **Board-traits background:** ranks the board's own trait values among **won boards** in the chosen time window or session, or across **all won boards** whenever `all games` or a board-match pool is selected (ranking a trait inside its own matched bucket would always tie). Raw unrounded trait values rank without bucket rounding.
- **Scoped performance rows (`gameDataScopedRows`, default empty):** optional extra rows in `game summary perf` named `<measurement> · <pool>` (e.g., `time · 3BV 62`, `time · past week`, `click rate · islands 4`), each plotting its own dot on the band, its own hover card, and its own strip beneath its base measurement in distributions view. A scoped row whose pool matches the active `compared with` pool while its base row is shown is suppressed rather than plotted twice. Configured via `time in specific pools` (all 17 non-all pools) and `other scoped measurements`.

## Distributions view, strips, and hover cards

- **Better on the left:** every distribution strip and hover card puts its preferred end on the left. Higher-is-better measurements descend left-to-right (`3BV/s: 3, 2.5, 2, …`); lower-is-better measurements ascend normally. A row's percentage equals the share of games left of this game's pin. (Lower scatter/property charts keep standard ascending x-axes.)
- **Distributions view:** replaces the band with one aligned strip per row under `game summary perf` and `board traits` (columns: pool name, optional `value`, strip, `%`). Strips expand vertically to fill available height when fewer rows are shown; only if even the minimum strip height (`25 px`) overflows does text shrink with the strips.
- **Strip rendering:**
  - Pools of `<= 30` games draw a stacked dot plot at exact values (provided the tallest stack fits with `>= 4 px` dots); otherwise histogram bars (`<= 24 px` max bar width so constant pools stay narrow).
  - **Discrete vs continuous binning:** whole counts, integer milliseconds, and safe-cell shares bin whole groups of possible values (`<= 60` values get 1 bar each; wider ranges group equally to ~36 bars) so histograms never show comb artifacts. Continuous measurements use 36 equal bins.
  - **Linear clipped range:** x-axis spans Tukey whiskers `[Q1 − 1.5·IQR, Q3 + 1.5·IQR]` tightened inward to the furthest in-fence values (full range if `n < 8`; narrowest 90%-mass window if `IQR === 0`). Outliers past the fence are omitted from drawing (never folded into edge bins), while ranks still count every game and an out-of-fence current game pins to the edge. If the tallest bar is `>= 6×` the second tallest, the second bar draws at half strip height (shorter bars scaled proportionally) so point masses never crush the rest of the distribution.
  - Time-window pools (including `session`) draw on the all-games axis and bins so window shifts stay visible; board-match pools draw on their own axis and bins.
  - Every strip displays x-axis ticks and marks this game's dot or bar in `--this-game` light blue edged in black beneath a light-blue pin. No key line narrates the marks ([UI doctrine](ui-doctrine.md)).
- **Hover cards:** show only facts not already visible on the row (never repeating name/value, worked arithmetic, or mark legends):
  1. Exact pool rank (plus tail-aware `%` in band view).
  2. Pool distribution strip (band view only; distributions view already draws it inline).
  3. **This game's board** (when the measurement counts board items and the game has a saved board/trace; omitted in score viewer and Endgame drills), drawn in the player's chosen board style (`5–20 px`/cell) with marks and count key:

| Measurement | Marked on this game's board | Key |
| --- | --- | --- |
| `3BV`, `3BV/s`, `efficiency`, `IOE`, `IOS`, `STNB`, `path / 3BV` | each opening's squares (yellow), each number outside openings (ring) | N openings, M numbers outside them |
| `ZiNi`, `HZiNi`, and their efficiencies | solve's clicks (ring), chords (dot), flags (yellow) | N clicks, N chords, N flags |
| `max number` | squares holding it (yellow) | none |
| `3BV spread` | work points (dots), RMS spread circle around centroid | N work points, spread around center |
| `0–1 share` | 0s and 1s revealed by openings (yellow) | N of S safe squares |
| `zero-opening coverage` | squares revealed by openings (yellow) | N of S safe squares |
| `islands` | every mine (yellow) | none |
| `largest island` | mines in largest island (yellow) | none |
| `zeros` | every 0 (yellow) | none |
| `misclick rate` | each misclick's square (ring) | N misclicks |
| `no-op rate`, `board-changing click share` | each no-op click's square (ring) | N no-op clicks |
| `unused flag share` | each unused flag (yellow) | N unused flags |
| `unflagged mine share` | each unflagged mine at win (yellow) | N of M mines unflagged |
| `time before a move` | destination of each move (ring) | N moves |
| `moves leaving easy work` | move destinations (ring), proven-safe squares left (yellow) | N moves leaving easy work, M safe left |
| `forks to the nearest area` | destination of each fork move (ring) | N forks |

  4. Catalog definition, only where the name and unit leave the measurement open (`time`, `3BV/s`, `path / 3BV`, `path / click`, `3BV`, `max number`, and `zeros` omit one; [Measurement catalog](measurement-catalog.md)).
- **Tight chart linkage:**
  - Every lower your-perf and board-trait chart heading carries a standing-colored chip (`this <value> · <pct>`) with exact rank tooltip.
  - Hovering or focusing a Game Data row outlines matching lower charts, pairs board-scoped performance rows (`time · 3BV 62`) with their matching `board traits` row (`3BV`) across the bar (and vice versa), and spotlights matching lines/events in [live perf charts](during-game.md) (and vice versa).

## One session definition

- One page-wide setting (`sessionDefinition`) and one picker — in the settings row at the page foot ([Board and layout](board-and-layout.md)).
- **Default:** `today` (since local midnight — distinct from `last 24 hours`).
- **Choices:** last 10/30 minutes, last 1/2/4/24 hours, today, today since 6am, last 7 calendar days (local calendar boundaries, inclusive endpoints ending at the game's completion).
- **Single label:** Game Data, session history, session summary, and `ranks won in session` all read simply `"session"` with no local picker and update in place when the foot picker changes.

## Catalog, directions, and defaults

`configure` provides one-column checkboxes for performance measurements and board traits (independent of lower result-table switches), plus `time in specific pools`, `other scoped measurements`, `show values`, and `session history`. If nothing is checked on either list, the chart reads `"Nothing chosen to rank: choose measurements or board traits with configure."`. All measurement names, definitions, formats, and formulas come from `GameData.metrics` ([Measurement catalog](measurement-catalog.md)).

### Board traits (right side)

- **Shown by default (8):** `3BV` (lower), `ZiNi` (lower), `max number` (higher), `HZiNi` (lower), `0–1 share` (higher), `zero-opening coverage` (higher), `islands` (lower), `zeros` (higher).
- **Off by default (2):** `3BV spread` (lower), `largest island` (higher).
- Directions are declared preferences (more opening coverage, fewer benchmark clicks, mines clumped tightly), not causal difficulty claims.

### Performance measurements (left side)

- **Shown by default (13):**
  - *Lower is better:* `time`, `misclick rate`, `fastclick gap`, `flag→chord gap`, `no-op rate`, `unused flag share`, `time before a move`, `moves leaving easy work`.
  - *Higher is better:* `3BV/s`, `click rate`, `board-changing click share`, `mouse speed`, `unflagged mine share`.
- **Optional (off by default, 19):**
  - *Lower is better:* `path / 3BV`, `path / click`, `cadence spread`, plus the 9 rate metrics below.
  - *Higher is better:* `efficiency`, `IOE`, `ZiNi efficiency`, `HZiNi efficiency`, `IOS`, `STNB`, `forks to the nearest area`.

| Optional rate measurement (lower is better) | What it counts | Games |
| --- | --- | --- |
| `flag rate` | flags placed per second (unblocked, `flagsPlaced > 0`) | flagged wins and losses |
| `flag-removal rate` | flags removed per minute (unblocked, `flagsPlaced > 0`) | flagged wins and losses |
| `unused flag rate` | correct flags no chord used per minute (unblocked, `flagsPlaced > 0`) | flagged wins |
| `game risk rate` | report game-risk actions per minute | wins and losses |
| `early guess rate` | report early guesses per minute | wins and losses |
| `time loss rate` | report time-loss actions per minute | wins and losses |
| `life maximization rate` | report life-maximization moves per minute | wins and losses |
| `excess game risk rate` | summed extra immediate death probability (pp/min) | wins and losses |
| `modeled life gap rate` | summed one-move modeled life lost per minute | wins and losses |

- **Eligibility and boundaries:**
  - Completion-dependent metrics (`time`, `3BV/s`, efficiency family, `IOS`, `STNB`, `path / 3BV`, `unused flag share`, `unflagged mine share`, `unused flag rate`) compare **wins**; action, timing, move-habit, and report metrics compare **wins and losses**.
  - **Flag-activity guard:** `flag rate`, `flag-removal rate`, `unused flag rate`, `unused flag share`, and `flag→chord gap` require `flagsPlaced > 0 && !flagsBlocked` so no-mark play, daily-limit flag-blocked games, and quick 0-flag losses stay unmeasured rather than polluting flagging rates with `0`. `unflagged mine share` stays measured on every win (`100%` on markless wins; unmeasured on Endgame drills).
  - **Report-category guard:** games carrying measurement notes (older evaluator or legacy verdict) are unmeasured on the six report-category rates, never `0`.
  - **Excluded from good/bad ranking:** duplicate `throughput`, raw counts, chording share/style, state tags, music, per-game death indicators, and measurement notes.

## Historical tracking and button switch cost

- **Derived on demand:** no percentiles, session IDs, or redundant aggregates are stored in IndexedDB. `Session history` applies the active `sessionDefinition` at each saved finish, materializing one page (20 overlapping windows) at a time with finish date, wins/games, measured `n`, median, and IQR — explicitly labeled overlapping.
- **Button switch cost:** per-game flagging-to-chording speed is tracked directly via `flag→chord gap` in `game summary perf`; the pooled 500-game short-range button switch-cost regression lives on the Training page ([Training](training.md#button-switch-cost)).

# Rank tables

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/rankings.md](../implementation/rankings.md), [docs/implementation/board-metrics.md](../implementation/board-metrics.md).

## Rank lists (time windows, day categories, and board families)

All lists compare timed wins within the current board size, mine count, play mode, and generator (fastest first, ties ordered by earlier finish).

- **Time windows (viewer's local timezone):** `lifetime`, `in <year>` (calendar year), `in the last year` (rolling from end of day 365 days ago), `this month` (calendar), `past week` (midnight 6 days back), `today` (since local midnight), and rolling `past hour` / `15 min` / `5 min` / `1 min`.
- **Day categories:** `on <weekday>s`, `on weekends` or `on weekdays`, `on holidays` (US federal, when today is one), and `on the Nth` (dates `1–31` across all months and years, derived from finish timestamps).
- **Duplicate collapsing (`collapseDuplicateCharts`, default on):** when multiple time/day lists hold the exact same set of wins, only the lowest `dedupePriority` renders (narrow windows → day categories → broad windows). **Exception:** `lifetime` and `past week` always render and absorb identical sets, so new players always keep both an all-time and a recent frame. Turning `collapseDuplicateCharts` off renders every window independently.
- **Exact and bucketed board comparisons (`This board`):** independent default-on display switches; never collapsed into other tables even when member sets coincide; missing measurements and Endgame drill ZiNi/HZiNi are omitted:
  - Exact value: `3BV N`, `ZiNi N`, `HZiNi N`, `max number N` (exact equality, distinct from upper-bound caps).
  - Rounded groups (halfway ties round up): `0–1 share P%` and `zero-opening coverage P%` (nearest whole percentage point), `3BV spread A–B cells` (half-open 0.5-cell interval, e.g., `3.25–3.75 cells`, so the heading matches exact board values without contradiction).
  - These are conditional comparisons on one feature, not causal difficulty adjustments.
- **Board-shape lists:** over wins whose finished board (after any Guardian Angel redraw) carries measured `boardShape`: `has an 8`, `has a 7`, nested caps `max number ≤ 2` / `≤ 3` / `≤ 4`, `islands N` (8-connected mine components, no wrap), `largest island N`, and `zeros N`. Under `collapseDuplicateCharts`, identical member sets keep the most specific list (`has an 8` → `has a 7` → `max number ≤ 2` → `≤ 3` → `≤ 4` → grouping lists).
- **Consistent names and heading help:** every board measurement uses one canonical name everywhere (`max number`, `zero-opening coverage`, `islands` — never `MN` or `ZOC`). Every `This board` heading (except self-evident `has an 8` / `has a 7`) opens a one-sentence definition matching [Game data](game-data.md); rounded-group tooltips also state this board's exact value and bucket rule.
- **Row format, footer, and windowing:**
  - Columns: rank, time, relative age (count right-aligned, unit left-aligned with a `2 px` gap so wide and narrow unit letters align cleanly).
  - Footer reserves one line so toggling selection never reflows height: `#32 of 1,080 · Top 3%` (or `Only result` / `Middle place` / `Last place`) with a selected win, `N total` when truncated without selection, or blank.
  - Always renders `11` rows at full opacity when available (no greying or collapsing poor ranks): anchors at `#1–#11` whenever rank `<= 11`, otherwise centers `5` above and `5` below (sliding upward near the bottom to fill all 11 rows).

## Full score lists and old-game review

- **Opening full lists:** every game-row rank table holding at least one win (time windows, day categories, `This board` tables — across post-game, old-game, High scores, and post-loss views) acts as a clickable and keyboard-accessible button opening its full scrollable list modal (`Esc` or close button returns unchanged). Streak tables (runs of wins), trials, and Board lab do not open full lists.
- **Exact table snapshot:** the modal title gives the table's name and win count and freezes the exact pool, window/day boundary, and no-mark scope drawn by the table. Scrolls inside the modal under a sticky header, reserving scrollbar gutter width so vertical scrolling never triggers horizontal overflow. Current game highlights in `--this-game` light blue and opens scrolled and focused; High scores and post-loss views open at row 1 with no highlight.
- **Numeric alignment and units:** every numeric column prints its unit once in the header in parentheses (`time (s)`, `efficiency (%)`, `3BV spread (cells)`) and renders bare monospace numbers so bold rows stay flush with regular rows. Mixed-decimal columns pad decimal width uniformly so decimal points and ones digits align vertically; integer-only columns add no trailing space. Sort arrows sit on the left side of headers so right-aligned headers never shift when sorted.
- **Configurable columns and sorting:**
  - Columns include `date` (local `YYYY-MM-DD HH:MM`), `age`, every catalog performance metric (except `time`, always shown), and every board trait ([Measurement catalog](measurement-catalog.md)). Defaults: `date`, `age`, `3BV`, `3BV/s`, `efficiency`.
  - `columns` toggles a compact multi-column picker beside the list (`when` + `board traits` beside two-column `performance measurements`, collapsing to one column on narrow screens). Right-clicking any optional header offers `hide <column>`.
  - Clicking a header sorts best-first (fastest time, newest date, youngest age, preferred catalog direction); a second click reverses. Ties keep rank order; unmeasured values sort last. Column choices and sort persist across lists (hiding the sorted column resets to `time`).
- **Old-game review:** clicking a row (or `Enter`/`Space`; arrow keys move rows) opens that win as a full post-game view (finished board, replay transport, after-game report, live perf charts, Game Data, rank tables, charts, motion stats) and scrolls to the top. Games saved without a final board or replay stay in the list with a status message explaining why they cannot open.
  - **Evaluated as of now:** all windows, day categories, ages, comparison pools, session stats, and ranks won compute against today's current history and current session (never frozen at historical finish time). Streak tables mark no streak; scatter charts tag a today-rank only if the game finished today.
  - Details column header shows `"Old game"`, finish timestamp, and `"back to list"` (reopening the list in its preserved sort with the row focused; `Esc` returns to the old game). Reloading restores the old game at its replay position with `"back to list"` intact. Starting a new game leaves old-game review normally.

## No-mark wins

No-mark (`flagsPlaced === 0`, marked `(m)`) is a solving style on the current board, not a separate play mode or history key.

- **Filtered post-game records:** when the shown result is a no-mark win (including High scores when the latest win is no-mark), all time lists, day categories, `This board` tables, streaks, ranks won, charts, and Game Data filter strictly to no-mark games of that same key.
- **Naming:** lifetime list reads `top <board> no-mark times`; other lists append `· no-mark`; streaks read `no-mark streak` / `no-mark near-streak` / `no-mark near-near-streak` (flagged games neither enter nor break no-mark streaks); Game Data pools read `no-mark` and `no-mark session`.
- **Session summary:** keeps all other board types played in the session, narrows only the no-mark win's own type to finished no-mark games (variant `"no-mark"`), and omits abandoned counts for that type because abandoned boards do not record flag usage.
- **Flagged wins and losses:** stay on the shared lists (where no-mark wins still display `(m)`). Pre-`2026-08-19` games never count as no-mark.

## Rank highlights

- **This-game marker (`--this-game`, `#87cefa`):** bold black text on light blue across rank, time, and age (`"this"`). This is the row's sole marker — no left border stripe, podium color, or standing tint.
- **Green-neutral-red standing scale:** shared across session-summary rank chips, Game Data band/strips, and chart chips. Upper bands at `1%`, `2%`, `5%`, `10%`, `25%` run from strong green (`#1e9e4f`) to pale green; upper-half remainder, exact middle, and only result are neutral gray (`#e6e6e6`); lower half is pale red, bottom `10%` stronger red, last place strongest red (`#df6a6a`), rendered at 85% strength on white with bold black readable text at every standing.
- **Standing labels:**
  - `Only result` when `N === 1`; `Last place` when `rank === N` (`N > 1`); `Middle place` (neutral gray) when `2 × rank === N + 1` on odd `N > 1`.
  - Otherwise upper tail `Top X%` (`rank / N <= 0.5`) or inclusive lower tail `Bottom X%` (`(N − rank + 1) / N`), rounded outward to the next whole percent (or next tenth below `1%`). Pool size always stays visible.
- **`ranks won in session` styling:** rows are uncolored plain bold black text (every reported rank is already top-tenth, so green chips would repeat the standing column). Only the current game's rank wears a `--this-game` light-blue chip labeled `"this"`; consecutive non-current ranks compress across band boundaries.

## Session summary and results partition

Heading `"session"` (collapsible opener, gated by `shownThings.sessionSummary`), driven by the single page-wide `sessionDefinition` picker at the page foot ([One session definition](game-data.md#one-session-definition)) with no local picker. Sits left of the board in wide layout (`ranks won in session` on the right), otherwise leads the tables under the board.

### Session summary table

- One row per board type (history key) played in the session, ordered by standard difficulty then other boards; adds an `all` totals row when more than one type was played (empty session prints `"no games in session"`).
- Variant column (non-default play mode and/or generator) appears only when at least one row uses a non-default variant; `abandoned` column appears only when at least one row has abandoned boards.
- Columns: board type, `started` (finished + abandoned when play spans record endings; `"games"` otherwise), `wins`, optional `abandoned`, `win rate` (`wins / started`, matching the breakdown denominator), `best` time + standing-toned lifetime rank chip (`--this-game` when this win), `mean time`, `mean 3BV/s`, and `mean IOE` (averaged over measured wins of that type using catalog definitions). Types with only abandoned games still appear (`0` wins, `0%`).

### Session results partition (`shownThings.sessionEndings`)

Scoped strictly to the shown game's board type (same size, mines, mode, and generator; after a loss or in High scores, follows the board's latest win, or the loss itself if the board has no win).

- **Root line and 3-band proportional strip:** names the scope and denominator (`Expert — 20 games started`), directly above a 3-band 100% stacked bar aligned across all three taxonomy levels:
  - Band 1: `won` (muted green), `lost` (muted red), `abandoned` (neutral gray), printing labels only where space fits.
  - Band 2: worst-offense / abandonment-reason families, shaded by severity.
  - Band 3: specific leaves, highlighting only this game's leaf in `--this-game` light blue.
  - Hovering any strip segment or table row cross-highlights matching rows/segments in neutral gray with a crisp black inner border and zero reflow.
- **Spanning partition table:** columns `how it ended`, `offense / reason`, `type`, `games`, `session` (0–100% colored share gauge with black vertical marker at the leaf's lifetime share + rounded `%`, or `<1%` for nonzero values rounding to 0), and `lifetime` (share across all games of that type up to the shown game, abandoned included).
  - Every row is one leaf so `games` and `session` sum strictly to total and `100%` (confirmed by a `total` footer; `lifetime` footer stays blank because zero-session leaves are omitted).
  - Column 1 (`won`, `lost`, `abandoned`) spans vertically across its leaves with subtotal `count · %` and `(life %)`; `won` and `lost` always appear even at `0` (spanning columns 1–3).
  - Column 2 spans its Level-3 leaves with subtotal; Level-2 leaves with no children (`wrong flag made a mine look safe`, `won → guessed past a safe square`, `page closed in play`, `cut off by trial end`, `not judged`) span columns 2–3 cleanly with no staircase gaps.
  - Column 3 uses concise non-repetitive leaf labels omitting wording already stated by parent levels.
- **Outcome taxonomy:** follows [Game-end evaluation](game-end-evaluation.md#win-types-and-session-result-kinds) (least-to-worst offense ladder, then measurement gaps).
- **Abandoned boards** (tracked since `2026-10-20`; restart opening progress `safeRevealed` since `2026-11-25`): boards that entered play and never finished, subdivided into `restarted` (`in the opening` `< 10%` safe open, `after the opening` `>= 10%`, or `stage not recorded` pre-`2026-11-25`), `page closed in play`, and `cut off by trial end`. Active in-progress tabs are excluded; no-mark views omit abandoned rows.
- **Detached likely-misclick block:** non-additive loss subsets sit below the partition inside a dashed border (`likely misclicks (subset of the N losses, already counted above)`) listing `adjacent wrong flag placed under 1s before` and `left-clicked proven mine under 1s after a short-of-flags chord beside it` with `% of losses`, `% of started`, and `lifetime %`. Never enters partition totals.
- **This-game mark:** marks only this game's leaf cells (never spanned parent cells), Band 3 segment, and any matching likely-misclick row in `--this-game` light blue, bold black text, and right-aligned `this` inside the leaf label cell. After a loss, marks the loss even while the rest of the summary follows the board's latest win.

## Ranks won in session

Heading `"ranks won in session"` (collapsible opener, gated by `shownThings.recentPlacements`), driven by the page-wide `sessionDefinition`.

- **Qualifying charts:** every list strictly longer than the session window (time windows starting strictly earlier, reference-date day categories, lifetime streaks, and board categories), keeping the current board size, mines, mode, and generator, honoring `collapseDuplicateCharts`, and ignoring individual table display switches.
- **Board category scope:** by default only the shown win's own exact/bucketed/shape board categories compete. Enabling `shownThings.recentPlacementsOtherBoards` (`ranks on other session boards`, off by default) includes every board category represented by any win in the session so later unrelated boards do not hide earlier ranks.
- **Top-tenth threshold and lifetime near-miss:** reports ranks where `rank × 10 <= N`. Exception: if the session has wins but none reached lifetime's top tenth, lifetime still reports the single best recent rank with an explanatory tooltip, so the empty state `"no wins in session"` holds literally.
- **Streaks:** `streak`, `near-streak`, and `near-near-streak` report when the streak's *last win* fell inside the session, at its full length including pre-session wins (top-tenth rule applies; near-miss rule does not).
- **Row format and stable order:** chart name, compressed runs (`8–12th`, current game's rank separated as `--this-game` chip), right-aligned tabular `of N`, and percentage range stating prefix and `%` once (`Top 4 – 10%`). Rows render contiguously in fixed family order: time windows from `lifetime`, day categories, streaks, `3BV`, `ZiNi`, `HZiNi`, `3BV spread`, exact max number, has-number, max-clue caps, islands, largest island, zeros, `0–1 share`, and `zero-opening coverage`, ascending numerically within each family regardless of pool size or rank.

## Relative age display

- Largest sensible unit without `"ago"`: `s`, `m`, `mo` stay whole; `h`, `d`, `w`, `y` show one decimal including `.0` (`1.0h`, `2.3d`). Rounding that reaches the next unit's threshold promotes (`23.95h → 1.0d`).
- `0 s` renders right-aligned as `"this"` on the `--this-game` row.
- Unit color coding: rank-list records under 1 minute (other than this game) and `m` = green (`#008000`), `h` = blue, `d` = red, `w` = navy, `mo` = maroon, `y` = teal. Scatter plots keep hyper-fluorescent green (`#39ff14`, black chip in legend) for other `< 1 min` games while this game's dot is black-ringed `--this-game` light blue.

## Streak lists

- Three lists with bare headings: `streak` (0 losses), `near-streak` (1 loss), `near-near-streak` (2 losses). A `k`-loss streak joins `k + 1` adjacent win runs.
- Candidate windows trim to their non-empty core, deduplicate identical cores, and drop any core strictly contained inside a wider core; streaks merely overlapping across distinct losses both stay.
- Ranked by length descending; ties rank **earlier finish first** (the first run to reach length `N` holds its rank). Row format: rank, `N wins`, relative age of the streak's last win.

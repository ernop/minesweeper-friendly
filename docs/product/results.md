# Result presentation and ordering

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/results.md](../implementation/results.md).

## Core principles

- **First screen carries the result:** most play loops inspect only what fits without scrolling, then start the next board. The top stage (board, replay transport, and docked live perf charts + Game Data) holds the immediate post-game signal; full-width lower sections serve deeper review.
- **Exact pagetables before point charts:** every row-based lookup table (overview tables, time/day/streak rankings, `This board` tables) must precede every point-based chart (`your perf`, `board traits`, `relationships`) in both DOM and visual order. Responsive wrapping stays within each semantic section and never interleaves tables with point charts.
- **Semantic order, never arrival order:** section order answers progressively deeper player questions and is never inferred from async completion order or card width. `displayOrder` (full tables), `dedupePriority` (duplicate collapsing), and `summaryOrder` (ranks won) are independent concepts.

## Canonical presentation order

1. **Outcome header (High scores and Old game views only):** board, mode, generator, no-mark tag (when applicable), and tabular timestamp. Current finished games omit a redundant `"Win beginner."` banner in the details dock ([Board and layout](board-and-layout.md#board-first-adaptive-layout)).
2. **Adaptive details dock (beside or directly below the board):**
   - `live perf charts` after any finished game or old-game review (omitted in High scores and trials; [Live perf charts](during-game.md)).
   - `Game data` (`game summary perf` and `board traits`) after wins and in High scores ([Game data](game-data.md)). After a loss, the dock holds `live perf charts` alone.
3. **After-game report (`#result-analysis`, when enabled via `reportScope`):** full-width collapsible section (`after-game report`), capping individual verdict cards at a readable `680 px` measure under plain bold category titles ([Game-end evaluation](game-end-evaluation.md)).
4. **Overview row & `rankings` group (full width below top stage/report):**
   - Full-width wrapping overview row holding `session` ([Session summary](rankings.md#session-summary-and-results-partition)), `ranks won in session`, and (after a loss) `this game` stats side by side in DOM order (stacking cleanly on narrow screens; wide session table scrolls internally rather than widening the page).
   - Full-width `rankings` collapsible group directly below, wrapping time-window, day-category, and all streak tables (`streak`, `near-streak`, `near-near-streak`) together without a separate Streaks section heading.
   - No-mark wins filter all tables and charts to no-mark games of the same key (`top <board> no-mark times`); losses preserve existing win rankings without highlighting the loss as a ranked win.
5. **`This board`:** exact-benchmark and board-shape time tables for the reference board (empty sections omitted).
6. **`Your perf`:** left-side measurement property charts with their shared `average / distribution / winrate` control.
7. **`Board traits`:** right-side measurement property charts with their own `average / distribution / winrate` control.
8. **`Relationships`:** raw-win scatterplots.
9. **`Motion stats` (page foot):** collapsible mouse-dynamics section after all result sections, closed by default ([Motion stats](motion-stats.md)).

Chart sections (`your perf`, `board traits`, `relationships`) use left-aligned responsive CSS grids (`270 px` cards) whose plot boxes align across each row even when titles wrap.

## Collapsible openers and local configuration

- **Uniform openers:** every dock panel and lower result table/section (`after-game report`, `session`, `ranks won in session`, `this game`, `rankings`, `This board`, `your perf`, `board traits`, `relationships`, `motion stats`) toggles via an arrow before a bold title (right when closed, down when open) with a black rule underneath; state persists across reloads (all start open except `motion stats`).
- **Stationary layout on toggle:** closing an overview table locks its open width (`min-width: min(100%, openWidth)`) so siblings and titles never jump; closing any section shifts only content below it. Chart mode pickers sit beside `your perf` and `board traits` titles and hide when collapsed.
- **Title hover help:** `session` and `ranks won in session` carry dotted-underline hover/focus explanations on their titles that dismiss on click and open beside their anchor when neither below nor above fits.
- **Local view configuration:** right-clicking individual tables, charts, section heads, Game Data rows, live perf legend entries, or score-list headers offers `hide`/`remove` in place (Shift+right-click opens the browser menu). `configure` buttons beside `rankings` and `This board`, plus `configure results` in `#settings-row` at the page foot, open `<dialog id="results-config">` to toggle lower sections/tables/charts live.

## This game's stats

For losses and trial runs (which have no winning Game Data percentile band), scalar measurements render as the compact `this game` table (one label/value line per measurement, regular-weight label and bold tabular value, sized to its content, gated by `shownThings.gameStats`; [Per-game stats](per-game-stats.md)). On losses it sits in the overview row after `session` and `ranks won in session`; on trial runs it is the sole table under the board.

## Views: Score viewer vs. Post-game vs. Old game

- **High scores (`see scores`):** compares against the latest win (header names the win and timestamp; no `"this game"` row/dot highlights), omits after-game report, live perf charts, and motion stats; rolling rank windows evaluate as of now while Game Data pools end at the latest win.
- **Old game (opened from a full score list):** renders the complete post-game view (finished board, replay, report, live perf charts, Game Data, rankings, charts, motion stats) evaluated **as of now** against current history/session, headed by `"Old game"`, timestamp, and `"back to list"` ([Rank tables](rankings.md#full-score-lists-and-old-game-review)).

## Progressive delivery

Play and game-end responsiveness never wait on analytics:

1. On the ending click, the board's final state and dove status button paint immediately; outcome/time show one frame later while the area under the board displays `"loading results…"`.
2. The reports worker judges the finished game first (games join displayed history only once judged).
3. Each section then renders as soon as its worker data and all preceding sections in its column have arrived — live perf charts + Game Data in the details dock, and `session`/`ranks won` → `rankings` → `This board` → `your perf` → `board traits` → `relationships` below — keeping `"loading results…"` beneath the last placed section until complete.
4. Re-renders (changing chart mode, session picker, or backfill updates) keep existing sections mounted until replacements are ready, swapping without blanking or shrinking; board-metric backfill updates only its status box above `This board`.
5. Each worker request, session-results slice, and DOM table/chart render yields between chunks so the main thread stays free of long freezes ([Board and layout](board-and-layout.md#startup-readiness-and-responsiveness)).

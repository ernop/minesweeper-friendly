# Result presentation and ordering (unified 2026-08-27)

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/results.md](../implementation/results.md).

Post-game and score-view output share one semantic presentation model. Order
answers progressively deeper player questions; it is never inferred from DOM
append timing or from how many cards fit on a row:

1. **Outcome** — win/loss or High scores, board, mode, generator, date.
   Two lines (2026-09-23; formerly one item per line): the larger bold
   outcome followed by board · mode · generator in regular weight, then
   the date and time in bold tabular digits.
2. **Facts / game data** — the winning-game chart in its own column beside the board (or under its outcome context in the details column when that column cannot fit); losses and trials retain label/value stats.
3. **Analysis** — post-game action interpretation only.
4. **Tables** — the recent "ranks won" time-period summary first, then
   time/category and all consecutive/loss-tolerant streak tablecharts.
   They share one left-aligned wrapping collection with no section heading.
   Each table retains its own identifying label. Losses
   retain existing win history without marking the loss as a ranked win.
5. **This board** — the selected reference board's exact-benchmark and
   shape time tablecharts, in a separate named, left-aligned wrapping section.
   Empty sections are omitted. The period-wide ranks-won summary above still
   includes all qualifying board categories from its selected period.
6. **Your perf** — property charts for the left-side measurements, with that
   group's average / distribution / winrate control.
7. **Board traits** — property charts for the right-side measurements, with
   that group's own control. Exact-value time tables stay in This board, above
   both chart groups.
8. **Relationships** — raw-win scatterplots.
9. **Diagnostics** — post-game motion systems.

The compact percentile overview occupies the winning-game sidebar. All pagetables
and row-based data displays still precede the historical scatterplots.
This includes time/category tables such as "on
weekends", board-shape rankings, recent placements, streak, near-streak, and
near-near-streak; all of them appear before grouped average-time scatters and
raw relationship scatters. Keeping the denser lookup-oriented tables together
before visual correlation charts gives the page a stable transition from exact
records to graphical analysis.

The upper table collection fills the main column; This board and later sections
span its full width below. In the upper collection, ranks won floats at the left;
successive rows of period/day/streak tables flow alongside its remaining
height, then use the full width underneath. Narrow layouts wrap below it
when there is insufficient horizontal room. The section contains the float,
so This board and later chart sections begin below all upper tables. DOM
order is preserved, and table flow cannot mix tables with point charts.

The score viewer deliberately omits post-game action analysis and motion
diagnostics. Its reference record is explicitly the latest win, named alongside
the completion date above game data; ordinary ranking rows and plots have no
"this game" highlight. Ranking-table rolling windows use the time at which
scores are viewed; game-data comparisons end at that latest win. A post-game
loss has outcome, facts, enabled action analysis, and
motion diagnostics, and retains rankings from the latest win if one exists.

Chart eligibility, table display order, duplicate preference, and summary
order are separate concepts. Full tables use `displayOrder`; duplicate member
sets use `dedupePriority`. Summary candidates carry `summaryOrder` as a
category/value pair. Changing one must not silently change the others.

Property charts are two groups, your perf then board traits, each with its
own average / distribution / winrate control (creator decision 2026-09-23;
[Point charts](charts.md)). Calendar, day-category, and streak leaderboards
stay the time-placement collection above them. This board's exact-value
tables stay pagetables and still precede both chart groups.

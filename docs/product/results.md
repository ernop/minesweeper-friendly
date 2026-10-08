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
4. **Tables** — the session summary first, then the "ranks won in session"
   time-period summary, then time/category and all consecutive/loss-tolerant
   streak tablecharts (session summary added 2026-10-07). They share one
   left-aligned wrapping collection with no section heading. In the wide
   layout the session summary sits left of the board and ranks won right of
   it wherever each fits; they keep their places at the head of the
   collection's DOM order ([Layout](board-and-layout.md)). Each table retains
   its own identifying label. Losses retain existing win history without
   marking the loss as a ranked win.
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
span its full width below. In the upper collection, the session summary and
ranks won that are not beside the board float at the left as one column, the
summary on top and ranks won directly under it (2026-10-07); successive rows
of period/day/streak tables flow alongside that column's height, then use the
full width underneath. Narrow layouts wrap below it when there is
insufficient horizontal room. The section contains the floats, so This board
and later chart sections begin below all upper tables. DOM order is
preserved, nothing sits above or left of the summary, and table flow cannot
mix tables with point charts.

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

## The first screen carries the result (creator direction 2026-10-07)

What a player sees without scrolling matters almost exclusively, "perhaps,
80% weight". The creator's description of play: players "play the game for
a while, win/lose, review the screen they see without scrolling, then go to
next game. only rarely will they go down!" Result-view decisions are judged
first by the first screen at the player's real viewport (the creator's PC:
2560 x 970 browser viewport, wide layout); the scrolled sections serve the
occasional deeper look.

Built 2026-10-07 from the creator's review of the round-2 mockup ("Please
go forward with this!"):

- A session summary of games, wins, and win rate per board type, with each
  type's best session time and its lifetime rank, left of the board; ranks
  won in session, kept in its table form, right of the board; the board in
  the middle ([Session summary](rankings.md#session-summary-requested-and-built-2026-10-07),
  [Layout](board-and-layout.md)). On the creator's 2560 x 970 viewport this
  filled the area that was empty beside a Beginner board. Since 2026-10-08
  the summary also shows the session's mean time, 3BV/s, and IOE per type;
  that makes it too wide for the room left of a Beginner board at 2560, so
  it leads the tables under the board there, while ranks won stays right of
  the board.
- Rank colors: green good, red bad, light blue for this game's row, no edge
  or podium ([Rank highlights](rankings.md#rank-highlights-built-2026-09-21-recolored-2026-10-07)).
- Game data: uncolored labels in aligned columns, one row per measurement
  with session and lifetime percentages, a colored bar, a hover card with
  the distribution, a distributions mode with lifetime and session sections,
  and chart chips that link each chart to its row ([Game data](game-data.md)).
- One name per measurement across tables, game data, charts, and the
  label/value report ([Rank lists](rankings.md), [Per-game stats](per-game-stats.md)).
- One session picker, the upper-left one, regenerates every session surface
  in place.

Rejected 2026-10-07: the verdict rows of the first review mockup (Result,
Pace, Board, and Training lines under the board): "not a super fan really."

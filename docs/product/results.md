# Result presentation and ordering (unified 2026-08-27)

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/results.md](../implementation/results.md).

Post-game and score-view output share one semantic presentation model. Order
answers progressively deeper player questions; it is never inferred from DOM
append timing or from how many cards fit on a row. Each part shows as soon as
its data has arrived, in this order
([Results come in as their data arrives](#results-come-in-as-their-data-arrives-creator-decision-2026-11-03)):

1. **Outcome** — win/loss or High scores, board, mode, generator, date.
   Two lines (2026-09-23; formerly one item per line): the larger bold
   outcome followed by board · mode · generator in regular weight, then
   the date and time in bold tabular digits. A no-mark win adds "no-mark"
   on that context line ([No-mark wins](rankings.md#no-mark-wins-decided-2026-10-14)).
2. **Facts / game data** — the column beside the board (or the details column under the outcome context when that column cannot fit): "live perf charts" after any game, outside the score viewer and trials ([During the game](during-game.md)), then the winning-game chart ("game summary perf" and "board traits"). A loss's or a trial game's label/value stats are not in this column: they are the "this game" table (item 4; [This game's stats](#this-games-stats-creator-request-2026-10-26)).
3. **Analysis** — post-game action interpretation only.
4. **Tables** — the session summary first, then the "ranks won in session"
   time-period summary, then after a loss that game's "this game" stats
   (2026-10-26), then time/category and all consecutive/loss-tolerant
   streak tablecharts (session summary added 2026-10-07). They share one
   left-aligned wrapping collection with no section title; the time,
   category, and streak tables share one opener, "rankings"
   ([Openers](#openers-creator-request-2026-10-26)). In the wide
   layout the session summary sits left of the board and ranks won right of
   it wherever each fits, and "this game" takes a side neither holds, the
   left first, where it fits; they keep their places at the head of the
   collection's DOM order ([Layout](board-and-layout.md)). Each table retains
   its own identifying label. A no-mark win's tables, and the charts under
   them, list only no-mark games of that same board, mode, and generator;
   the lifetime time list is named "top expert no-mark times" (or that
   board's equivalent). Losses retain existing win history without
   marking the loss as a ranked win, and a loss keeps the shared lists.
5. **This board** — the selected reference board's exact-benchmark and
   shape time tablecharts, in a separate titled, left-aligned wrapping section.
   Empty sections are omitted. The period-wide ranks-won summary above still
   includes all qualifying board categories from its selected period.
6. **Your perf** — property charts for the left-side measurements, with that
   group's average / distribution / winrate control.
7. **Board traits** — property charts for the right-side measurements, with
   that group's own control. Exact-value time tables stay in This board, above
   both chart groups.
8. **Relationships** — raw-win scatterplots.
9. **Diagnostics** — post-game motion systems.

During the game's first build (2026-10-15) was a section here between This
board and your perf; the creator moved it the same day to lead the game data
column.

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
insufficient horizontal room. A loss's "this game" table, when not beside
the board, floats beside that column where it fits there, and otherwise at
the left under it (2026-10-26, when the rankings opener came; it had led the
first row of tables, as one of them). The "rankings" title takes the room
beside those tables, and its tables fill that room in rows, then the full
width underneath. The section contains the floats, so This board
and later chart sections begin below all upper tables. DOM order is
preserved, nothing sits above or left of the summary, and table flow cannot
mix tables with point charts.

## Openers (creator request 2026-10-26)

The creator, of the details column's titles that open and close with an
arrow: "just like the my perf & related 2 are open/closeable with the
little arrow, the other items like the session info and the grouped top x
times parts, also the "this baord" and the your perf sections too should
all adopt that same type of closer/openers."

Built the same day: every table and section of the result under the board
opens and closes by its title, the details column's opener (live perf
charts, game summary perf, board traits): an arrow, pointing right when
closed and down when open, before a bold title, with a black rule under
the title. Clicking the title opens or closes what it heads. Each one's
state is remembered across games and reloads, one per title; all start
open.

- The session summary ("session"), ranks won in session, and a loss's or
  trial game's "this game" each open and close alone.
- The time, category, and streak tables (lifetime, past week, today, the
  hour and minute windows, the day categories, streak, near-streak,
  near-near-streak) open and close together under one title, "rankings",
  the creator's "grouped top x times parts". It replaced the 2026-09-07
  rule of no heading over them; each table keeps its own label. One
  opener per table was the alternative not taken: it would add as many
  titles as tables to a collection the creator calls one group.
- This board, your perf, board traits, and relationships each open and
  close as a whole. The your perf and board traits chart choice (average,
  distribution, winrate) stays beside the title and shows only while its
  section is open. These titles are no longer upper case.
- A table beside the board keeps its place when closed: its title stays
  where it was, and opening it again fills the same place. Whether a table
  sits beside the board is decided by its open width, closed or not.
  Closing a table or section moves only what comes after it.
- The session summary's and ranks won's explanations moved to their
  titles: hovering the title, or focusing it by keyboard, shows the
  explanation; the dotted underline that marks a help label marks them.
  The click that opens or closes puts it away. A help tip never covers
  what it explains (anywhere on the page): where it fits neither below
  nor above, it opens beside it. Before, a tall tip could cover its own
  label, which then lost the pointer to it and flickered.

The score viewer deliberately omits post-game action analysis, during the
game, and motion diagnostics. Its reference record is explicitly the latest win, named alongside
the completion date above game data; ordinary ranking rows and plots have no
"this game" highlight. Ranking-table rolling windows use the time at which
scores are viewed; game-data comparisons end at that latest win. A post-game
loss has outcome, facts, enabled action analysis, its own "this game" stats,
and motion diagnostics, and retains rankings from the latest win if one
exists.

## This game's stats (creator request 2026-10-26)

The creator's review of the label/value panel (Time, 3BV, ZiNi, Max number,
Zeros, Islands, Clicks, Flags placed, ...) that a loss showed at the bottom
of the details column: "i think it's too wide. can it be made into just
another infopanel similar to the lifetime, this month, or session blocks,
and also flowing up as possible?" It spanned the whole column, labels at its
left edge and values at its right.

Built the same day: the panel is the "this game" table, one of the tables
under the board (item 4), as wide as its rows, one line per measurement,
labels in regular weight and values in bold tabular digits. It follows the
session summary and ranks won in DOM order, ahead of every rank table, and
rises as high as the layout allows: beside the board where a side is free
and it fits, otherwise at the head of the tables under the board. Its rows,
their names, and the "loss and trial stats" display setting that shows it
are unchanged ([Per-game stats](per-game-stats.md)). A trial game's stats are
the same table, the only one in its result area under (or beside) the board.

Tradeoff recorded: beside a Beginner or Intermediate board at the creator's
2560 x 970 viewport the table is on the first screen, but an Expert board
leaves no side room, so there it sits under the board, below the first
screen, where the details column used to show the panel without scrolling.

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
- Rank colors: green good, red bad, the this-game light blue for this
  game's row (fluorescent green from 2026-10-08 to 2026-10-15), no edge
  or podium ([Rank highlights](rankings.md#rank-highlights-built-2026-09-21-recolored-2026-10-07)).
- Game data: uncolored labels in aligned columns, one row per measurement
  with session and lifetime percentages, a colored bar, a hover card with
  the distribution, a distributions mode with lifetime and session sections,
  and chart chips that link each chart to its row ([Game data](game-data.md)).
- One name per measurement across tables, game data, charts, and the
  label/value report ([Rank lists](rankings.md), [Per-game stats](per-game-stats.md)).
- One session picker, in the settings row at the page foot (in the top bar
  at the upper right from 2026-10-14, the upper-left one before),
  regenerates every session surface in place.

Rejected 2026-10-07: the verdict rows of the first review mockup (Result,
Pace, Board, and Training lines under the board): "not a super fan really."

## Results come in as their data arrives (creator decision 2026-11-03)

The creator, after the game-end judgment moved off the click and the full
results of a long Expert win took about 210 ms: "for post-win, where we're
going to be calculating stuff, let's just display things as they come in, so
nothing blocks other stuff, if possible. taht way during-game play speed is
totally unimpacted; the display of the result (win/die) is unaffected, and
AFTER t hat, data comes in. that sounds good. let's think about how to do
that; as long as the user isn't blocked, budgets can be raised."

Built the same day:

- The win or loss shows at the click: the face, the opened board, and the
  final time in the details column. Nothing about it waits for analysis.
- Every result part needs the judgment of the game's decisions, which the
  reports worker makes after the game
  ([Game-end evaluation](game-end-evaluation.md)): the game joins the history
  only once judged. Until then the area under the board says "loading
  results…".
- From the judgment on, each part shows as soon as its data is in, without
  waiting for the rest: under the board the session summary with ranks won,
  the rankings, This board, your perf, board traits, and relationships, in
  that order; the details column (live perf charts above game data) on its
  own, once live perf charts are drawn. The details column keeps the final
  time until then.
- Nothing shown moves for what comes later. A part is placed only once it and
  every part before it in its column are in, so each new part appears after
  what is already shown. "loading results…" stays after the last part shown
  until the last part is in.
- A result shown again (a chart choice, a backfilled board's measurements, a
  session change) keeps each section on screen until its replacement is
  whole, then swaps it, so no section blanks or shrinks in between. Changes
  of the board measurements' status (the saved-board check, backfill
  progress, a board that cannot be measured) refill only the status box
  above This board's tables, never the whole result.
- No step of the result's own work holds the page long: each request to the
  workers and the session summary are built in their own task, the session
  results file the board type's earlier games a slice at a time while the
  reports worker judges the game, and the sections yield between tables and
  between charts. Play is never blocked; the
  latency check holds the winning click, and the freeze in the two seconds
  after it, to tight limits, and only the time to the full results was raised
  ([Input latency](board-and-layout.md#input-latency-user-report-2026-09-26)).

On the latency check's Expert win (Firefox, the PC; the game places one
flag, so its results rank it among the history's 1,576 Expert wins and draw
every chart) the judgment arrives 150-160 ms after the winning click. Live
perf charts and game data show 45-55 ms after it, the session summary and
ranks won 65-80 ms after it, the rankings and This board 110-150 ms after
it, and the charts follow until relationships, 235-260 ms after it: the full
results 390-430 ms after the click. Before, every part waited for the
slowest and all appeared together: 492-527 ms after the click in four runs
alternating with the new code, which took 403-439 in those runs. The longest
freeze after the win is the frame that first draws live perf charts, about
27 ms, as before; in those runs the check's freeze after the win read 32-41
ms against 37-61 for the code before, and after a lost game 27-30 against
34-45.

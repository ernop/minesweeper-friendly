# During the game (requested 2026-10-15)

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation
notes: [docs/implementation/during-game.md](../implementation/during-game.md).

## Request

Creator request 2026-10-15: beside "your perf" (each measurement as one
value for the whole game) and the game stats, a deeper kind of perf: how the
measurements moved during the game. "perf now has the average fastclick gap
for the whole game; but this new type of chart has values either raw incident
by incident during the game, or else with sub-averages (in say 5s buckets,
and/or rolling averages)." Most current perf measurements get an in-game
row; new rows show progress, "how i'm progressing at marking 100% of mines by
time, opening squares". An events view shows detected events: the known ones
("mark/unmark same sq (misclick), or pointlessly click somewhere") and new
ones: moments where "the user actually had two choices for which way to go"
and chose one, and when local work "peters out" and the player makes "a big
move to the other side of the board", a decision in which "individuals would
vary a lot". Rows are toggleable, like the game data measurements and board
traits. The purpose is the project's: to "fully understand, see, and
eventually train and see into and help me to optimize my play"
([Measurement purpose](measurement.md)).

## Placement

A result section named "during the game", after the This board tables and
before the your-perf charts ([Result presentation](results.md)). It plots
individual points, so it follows every table. It describes the game that
just ended or the saved game whose replay is restored, so it appears after
a game and not in the score viewer or trial review. The "during the game"
switch in the result sections' Charts group hides it.

## Layout

- One time axis shared by every row: game seconds from the first click to
  the end of the game, labeled under the rows. A row's x position is the
  same moment in every row.
- Each row is one line: its name at the left (a button that shows the row's
  definition), its plot in the middle, and its whole-game value at the right,
  the most legible text in the row.
- Value rows (progress, pace, board) are short charts; event rows are thin
  lanes of marks, with a pause or an absence drawn as a bar over its span.
  A chart row's scale runs from 0 to a round top (1, 2, or 5 times a power
  of ten), written at its top left; a rate row in raw shows only its
  incident ticks and no scale.
- Hover anywhere over the rows draws one vertical line through all of them.
  While it is there, the right-hand column shows each row's value at that
  moment and its header shows the moment; leaving restores the whole-game
  values. The value cells keep a fixed width, so nothing moves.
- The hover card floats beside the pointer, on the side toward the far half
  of the plot, so the value column answering the same moment stays in view.
  It shows the board as it was at that moment (the replay's frame:
  the position before the next click, with that click's square outlined),
  and lists the events at that moment in words, such as "left 3 proven-safe
  squares; jumped 9 squares" or "1.8 s pause; 4 proven-safe squares known".
  Squares an event concerns (the ones left behind, or every proven-safe
  square during a pause) are marked on that board.
- A click on the rows opens the replay at that moment and keeps the replay
  panel open, as opening it by hand does.

## Averaging

One choice in the section's head applies to every averaged row: raw
incidents, fixed 2, 5, or 10 second buckets counted from the first click, or
a rolling average over 2, 5, or 10 seconds centered on each moment. The
default is 5 second buckets. Raw incidents stay drawn as small marks under
an average. A bucket or window with under one second of play shows no
value, as in the session stats: a rate over a sliver of time is not
evidence. Progress, board-state, and event rows have no average.

## Rows

A row that shares a game data measurement's name keeps that measurement's
definition and format, measured over the bucket or window instead of the
whole game, so its whole-game value matches the game data value (to the
millisecond for the fastclick gap). On the right, a progress row shows its
final share, a board row its average over time, a rate or ratio the whole
game's, an incident row its median or mean, and an event row its count.

Shown by default:

| Row | Group | Definition |
| --- | --- | --- |
| 3BV solved | progress | share of the board's 3BV done by each moment; an opening counts once, when any of its zeros opens; a number touching no opening counts when it opens |
| squares opened | progress | share of the board's safe squares open |
| mines flagged | progress | share of the board's mines carrying a flag; flags on safe squares do not count |
| 3BV/s | pace | 3BV solved per second |
| click rate | pace | board-changing clicks per second |
| action gaps | pace | time from one board-changing click to the next (log scale); averages take the median |
| fastclick gap | pace | gaps of 1 s or less ending in a click made while the cursor was moving, as game data defines it; averages take the median |
| mouse speed | pace | cursor travel per second, pauses included; each dot is the speed between two board-changing clicks |
| safe squares known | board | covered squares the visible board had proved safe, between clicks |
| squares moved | board | squares (in any direction) from each board-changing click to the one before; averages take the mean |

Off by default: efficiency, board-changing click share, IOE, no-op rate,
misclick rate, path / click, path / 3BV (each as game data defines it);
safe by counting (the safe squares known that counting single numbers
proves, the quickest kind to see); work areas (separate places holding
proven-safe squares, squares at most 2 apart counting as one place).

A progress row starts from what the board showed at the first action, so a
given opening counts as already done. Safe squares known and work areas say
nothing where the prover stopped at its work limit; safe by counting is
always measured.

## Events

Each event row is a lane. "Near" a click means within 2 squares, in any
direction, of anything that click opened or marked.

Shown by default:

- **no-op clicks** — clicks that changed nothing, with the reason in the
  card ("number still short of flags").
- **misclicks** — actions the visible board had already proved wrong:
  opening a proven mine, flagging a proven-safe square, removing a proven
  mine's flag, or a chord against the proof. The same judgment as the
  game's misclick count.
- **flags removed** — a flag taken off; within 1 second of placing it, a
  quick undo (the mark/unmark of the request).
- **flags on safe squares** — a flag placed where no mine was.
- **guesses** — opening a square the visible board had not proved safe,
  after the first click; the card gives its mine risk and the lowest
  available, and says when a proven-safe square was available.
- **long gaps** — 1 second or more between board-changing clicks, drawn over
  the gap. The card says how many proven-safe squares were known (in all, by
  counting, and near the previous click), what ended the pause, how many
  no-op clicks fell inside it, and whether the window was left.
- **moved on** — a jump of 3 or more squares from everything the previous
  board-changing click opened or marked, after the proven-safe squares near
  it had run out: the local work petered out and the player went elsewhere.
- **left work** — the same jump made while proven-safe squares near the
  previous click were still unopened (and not toward them).
- **forks** — a move (moved on or left work) made while proven-safe squares
  lay in 2 or more separate places: a choice of where to go next. The card
  says how many places there were and whether the player went to the
  nearest one.
- **window left** — the game's window hidden or out of focus, drawn over the
  span. Games saved before 26 September 2026 did not record it; their lane
  says "not recorded for this game" and shows no count, and their long gaps
  say nothing about the window.

Off by default:

- **came back** — a move back to proven-safe squares an earlier left-work
  move left behind, with how long they waited.
- **openings** — a click that opened a zero region.
- **unused flags** — a correct flag no chord used, at its placement; known
  only on wins.

Every move event's card also says whether the move was a guess and how far
the nearest proven-safe square was. Moves and forks need the exact proof;
where the prover stopped at its work limit, only "left work" can still be
judged, from the squares it did prove.

The thresholds (2 squares near, 3 squares a jump, 1 second a long gap, 1
second a quick undo) are first choices to be checked against the creator's
games ([BACKLOG.md](../../BACKLOG.md)).

## Configure

"configure" in the section's head replaces the rows with one checklist of
every row, grouped as progress, pace, board, events, with back buttons at
its top and bottom; Escape also returns. Choices apply at once and persist
in the settings (`duringGameRows`); the averaging choice persists as
`duringGameAverage`.

## Built and requested

Built 2026-10-15: everything above. Requested but not built yet, in
[BACKLOG.md](../../BACKLOG.md): forks inside one work area (several ways
forward from the same frontier) and cross-game summaries of the move and
fork habits. Proposed there with them: threshold calibration, rows plotted
against progress instead of time, the cadence-spread row, and live rows
during play.

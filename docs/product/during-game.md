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

## Revision of the first build (creator 2026-10-15)

Of the first build, a section among the lower result sections, with a
screenshot of the game data distributions view: "I think during the game
should be the one on the right, above the attached image. ... the new
"during the game" block should be above THIS one, got it? so it's "during
this game second by second", "your perf totals for this game", then "board
traits"." Then: "for during the game, consult the 'session stats' - this is
analogous to that. But keep your new code in the new place. also make these
changes to it: a few of the items which progress from 0-100% can reuse the
same chart. that chart shall have useful x-axis tics and labels ofc. same for
y axis, not just 0 and 100%." On hover: "the mouseover should show the value
at that moment along with the board status. the area the board status
appears shall not be relative to the mouse, though - it should rather appear
somewhere either to the right (preferred) or left if needed of this space at
a fixed height. so the MOUSEOVER shows the value of the series we're above at
that moment, and also any mousing over any series will cause the board state
at that position to be shown, too, autoadjusting. and ofc all board uis such
as this should obey the board style choices the user has entered in their
config too!" And: "the datarows here are of many new types so it's okay to
use new viz styles for them as you've done. but when we're not needing a new
style and an old one would work, consider using it to reduce variability".
The same message renamed game data's sections ([Game data](game-data.md#section-titles-creator-2026-10-15)).
Everything below follows it; the first build's layout (one row per
measurement with a small scale label at its top left, values in a column at
the right, a card with a small board following the pointer) is gone.

## Placement

- A stat section titled "during this game, second by second" heads the
  details column's statistics beside the board: it sits above game data's
  one chart, whose sides are "your performance this game" and "board
  traits" ([Game data](game-data.md)), or above a lost game's statistics. Its title
  opens and closes it, remembered across games; closed, it gives its height
  to game data ([Layout](board-and-layout.md), creator 2026-10-17). From
  2026-10-15 to 2026-10-17 it led a separate game data column.
- The block is not among the lower result sections (the first build put it
  between This board and your perf).
- It describes the game that just ended, won or lost, or the saved game whose
  replay is restored, so it appears after a game and not in the score viewer
  or trial review.
- The details column is reserved before the game ends, so finishing a game
  never moves the board.
- The "during this game, second by second" switch hides it. It sits in the
  result sections' This game group, just before game data, the order the
  column shows them (the first build's switch was in the Charts group).
  Closing the section by its title keeps it on the page, one line high;
  the switch removes it.

## Charts

- Charts follow the session stats' grammar ([Session stats](session-stats.md)):
  a framed plot with light gridlines, y ticks labeled in bold black with
  minor tick marks between them, the y axis rooted at 0 with its top on the
  1-2-5-10 ladder, and each line in its series' color. Hovering a line's
  legend entry spotlights it: the line thickens and the chart's other lines
  fade.
- Y labels: the progress chart every 20%, the gaps chart at every power of
  ten, and every other chart at zero, the middle, and the top, the most its
  short plot holds without crowding.
- Rows that share a unit share one chart, so its lines compare directly.
  A chart draws only its shown rows and disappears when none are shown.

  | Chart | Rows | Y axis |
  | --- | --- | --- |
  | progress | 3BV solved, squares opened, mines flagged | 0% to 100%, labeled every 20% |
  | rates per second | 3BV/s, click rate, no-op rate | per second |
  | rates per minute | misclick rate | per minute |
  | gaps | action gaps, fastclick gap | log scale: 10ms, 100ms, 1s, 10s |
  | mouse speed | mouse speed | px/s |
  | efficiency and click share | efficiency, board-changing click share | percent |
  | IOE | IOE | ratio |
  | path | path / click, path / 3BV | px |
  | safe squares known | safe squares known, safe by counting | squares |
  | squares moved | squares moved | squares |
  | work areas | work areas | places |

  The gaps chart is the one log scale: gaps run from tens of milliseconds
  to many seconds, and one long pause on a linear scale would flatten every
  other gap against the floor.
- Above each chart one line names its lines: a swatch in the line's color,
  the row's name (it shows the row's definition on hover), and its
  whole-game value, the most legible text there.
- One time axis: every plot spans the same width, game seconds from the first
  click to the end of the game, with vertical gridlines at the same seconds
  in every chart. The seconds are labeled under the first chart and under
  the last.
- Event rows are a new kind of row, so they keep their own look: thin lanes
  of marks under the charts, a pause or an absence drawn as a bar over its
  span, a death in red. Each lane's name sits at its left with its count in
  bold, and the lanes share the charts' time axis.
- "averaging" and "configure" sit in one small row at the bottom of the
  block, as game data's options do.

## Hover and the board at that moment

- Hover anywhere over the charts draws one vertical line through all of
  them.
- A small card beside the pointer shows the moment and the values of the
  chart under the pointer at that moment: each line's name and value, or,
  over an event lane, that lane's events at that moment in words, such as
  "left 3 proven-safe squares unopened; jumped 9 squares" or "1.8 s pause,
  ended by a reveal". It opens on the side of the pointer away from the
  board below, so it never covers it.
- The board as it was at that moment appears beside the block, to its right
  when the window has room, else to its left, with its top level with the
  block's top (kept inside the window). It does not follow the pointer; only
  its content follows the moment. A window too narrow for either side (a
  phone, where the block fills the width) has no place beside the block, so
  the board sits at the window's top or bottom, whichever half the pointer
  is not in, and never covers the chart being read; it moves only when the
  pointer crosses the window's middle. Built 2026-10-15, when the first
  narrow build put it over the charts. It is the replay's frame: the position
  before the next click, with that click's squares shaded as the replay
  shades them. The last click ends the game, so the axis's last 6 pixels
  (the hover's reach) show the finished board. Squares the
  hovered events concern (the ones left behind, or every proven-safe square
  during a pause) carry the replay's proven-safe ring. Its head line names
  the moment and the next click, its square named as the game report names
  squares ("4.2 s · next: a reveal at row 2, column 4"). The head is sized
  for the game's longest, so the board keeps its size and place while the
  pointer moves.
- That board is drawn with the game board's own squares and follows the
  player's board settings: number display, flag style, flag size, flag
  color strength, and mine style ([Personal settings](settings.md)). Its
  squares are sized to fit a 400 x 300 px box (narrower in a narrow
  window), up to 24 px.
- A click on the charts opens the replay at that moment and keeps the replay
  panel open, as opening it by hand does.

## Averaging

One choice in the options row applies to every averaged row: raw incidents,
fixed 2, 5, or 10 second buckets counted from the first click, or a rolling
average over 2, 5, or 10 seconds centered on each moment. The default is 5
second buckets. Raw incidents stay drawn under an average: dots in the
line's color for measured values, and short ticks at the plot's foot for
rate incidents. A rate chart in raw draws only its ticks and no scale. A
bucket or window with under one second of play shows no value, as in the
session stats: a rate over a sliver of time is not evidence. Progress,
board-state, and event rows have no average.

## Rows

A row that shares a game data measurement's name keeps that measurement's
definition and format, measured over the bucket or window instead of the
whole game, so its whole-game value matches the game data value (to the
millisecond for the fastclick gap). In its legend entry, a progress row
shows its final share, a board row its average over time, a rate or ratio
the whole game's, and an incident row its median or mean; an event lane
shows its count.

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

"configure" in the options row replaces the charts with one checklist of
every row, grouped as progress, pace, board, events, with back buttons at
its top and bottom; Escape also returns. Choices apply at once and persist
in the settings (`duringGameRows`); the averaging choice persists as
`duringGameAverage`.

## Built and requested

Built 2026-10-15: a first build, then the same day everything above.
Requested but not built yet, in [BACKLOG.md](../../BACKLOG.md): forks inside
one work area (several ways forward from the same frontier) and cross-game
summaries of the move and fork habits. Proposed there with them: threshold
calibration, rows plotted against progress instead of time, the
cadence-spread row, and live rows during play.

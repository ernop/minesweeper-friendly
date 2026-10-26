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
The same message renamed game data's sections ([Game data](game-data.md#section-titles-creator-2026-10-15-revised-2026-10-20)).
Everything below follows it; the first build's layout (one row per
measurement with a small scale label at its top left, values in a column at
the right, a card with a small board following the pointer) is gone.

## Revision (creator 2026-10-20)

Creator, verbatim: "rename the first section from "during this game, second
by second" to "live perf charts"". Of the averaging menu: "the default
setting for all of thsees shall be "2s rolling average" but it shall follow
whatever the users chatnes it to." Of the charts: "let's tihnk of a logical
way to combine or convey the information from all the middle, solitary line
cahrst. e.g. from 3bv/s, click rate, action gaps, mouse speed, safe sq
known, squares moved (should be " - between actions". can we combine them
and make it so that as we mouseover, we see the specific data baout the
specific line we are mousing over at that point including the actual
value?" Of the event lanes: "the lower section with data on no-op clicks,
misclicks, flags removed. let's think creatively and also consult other ui
manuals and things like that; maybe we can figure out another method of
displaying this data which is meaningful yet also compact?" And of the
section's (?) and game data's two side titles' (?): "remove all three (?)
buttosn and mouseovers entirely, not replacing orputting the removed text
anywhere; it merely wil lbe gone."

Built the same day:

- The section is titled "live perf charts", with no (?) on its title.
- The averaging default is a 2 s rolling average, for everyone once; the
  player's choice persists after that (Averaging, below).
- The pace and board rows share one chart, each line drawn against its own
  whole-game value (Charts, below). Their units differ (per second,
  milliseconds, px/s, squares), so no shared axis of raw values exists; the
  ratio to the game's own value has no unit, and it shows where in the game
  each measure ran above or below its own level.
- Hover over a chart names the one line nearest the pointer with its value
  at that moment.
- "squares moved" is "squares moved between actions".
- The event lanes, one per row, became three tracks of marks with one
  legend. The practice consulted: a profiler's category tracks with details
  on hover (the Chrome DevTools Performance panel), event-timeline glyphs
  that differ in shape first and color second so they stay apart when
  printed or for color-blind readers (swimmer plots in clinical timelines;
  timeline design guides), and instants drawn as marks but spans as bands
  (Grafana's annotations).

## Revision (creator 2026-10-21)

Creator, verbatim, of the board that appeared beside the block on hover:
"what if instead of a popup, we just scrolled within the jsut-ended game
review setup, instantly, to that point? that way we don't duplicate teh
baord." Of the second chart's doubling scale: "can there be a way to toggle
this charts' viz between log and linear?" And of the legends: "clicking a
label toggles enable/disable for its viz. when all are viz ==true (the
default), clicking one shows ONLY it. clicking another adds that other to
the viz (so there would be two). clicking one, then clicking it again,
reverts to "all are shown" (since showing NONE at all is pointless). make
sense? and this should apply to both the top chart with 3BV/s, and also the
2nd one with "action gaps" where you should also add a similar list of
labels. yes i know this changes what i said before, I intend to change my
prior rules."

Built the same day:

- Hover moves the replay under the board to the moment under the pointer,
  and the board beside the block is gone (Hover and the board at that
  moment, below). This replaces the 2026-10-15 request for the board status
  "to the right (preferred) or left if needed of this space at a fixed
  height".
- "scale" in the options row switches the second chart between log, the
  doubling scale, and linear (Charts, below).
- Every legend entry in the block is also its row's switch (Legend picks,
  below). The message names "the top chart with 3BV/s" and "the 2nd one
  with "action gaps"", adding a list of labels to the second. The progress
  chart, the second chart (where 3BV/s and action gaps both are), and the
  event tracks each already had one legend listing its rows with their
  whole-game values, so the rule applies to all three legends and no list
  was added.

Later the same day, verbatim: "make the "log/linear" control a boolean click
toggler, not ad ropdown." And: "move the chart which has 3BV/s to the 3rd
position, from its current 2nd position, within live perf charts."

Built the same day:

- The scale is one "log scale" checkbox in the options row, checked by
  default; unchecked draws the linear scale. It replaces the "scale" select
  built that morning, and a choice saved with the select carries over
  (`duringGameRelativeScale`, `log` or `linear`).
- The chart against the whole game, the one with 3BV/s, moved from second to
  third: top to bottom the block shows the progress chart, the event tracks,
  then that chart (Charts, below).

## Revision (creator 2026-10-26)

Creator, verbatim: "within the live perf charts lets add a raw numerical
counter for every moment of the game show shows the count of moves
available, by type: 1. markable mines by simple means (not whole-board
based calculations) 2. the prior, but only near the last move (within dist
5 manhattan distance) (1 & 2 should be straight clear calculations e.g. a 2
with only 2 neighbors, so its obvious." The same message asked for a
"well-bordered complexity leel system" for knowing facts about the board;
that part is quoted, with the levels built from it, in
[Design axis](design-axis.md), "Deduction levels". It ends: "the 3rd new
metric should be similar, but for "chordable tile count" such as a 1 with
multiple uknnown adjacent squares, and one already marked mine, so it's
ready to be clicked. by using these new metrics, i can see the options the
player has, as they increase/decrease through the game."

Built the same day:

- A third chart, the moves available chart (named after its rows' group
  in configure), second in the block, above the event tracks: raw counts
  on a count axis, each line a step that holds what the board offered from
  one click to the next (Charts, below).
- Its rows (Rows, below), shown by default: mines by counting (the first
  request), mines by counting near the last move (the second), chordable
  numbers (the third), and safe squares known. Off by default: mines
  known, and the safe squares and the mines each deduction level is the
  first to prove.
- Choices made in building it, for the creator to change:
  - "Simple means" is the first deduction level, counting single numbers.
    Each square counts at the first level proving it, so a kind's level
    rows add up to its known row.
  - The levels read only open numbers and the board's mine count; a flag
    is the player's note, not proof. A "markable" mine is covered and
    unflagged.
  - Near the last move: at most 5 steps, a step one square across or down,
    from the square of the last click that changed the board (a chord's:
    its number); none before the first such click.
  - A chordable number has as many flags beside it as its number, every
    flag on a mine, and a covered square left for the chord to open. A
    number with a wrong flag beside it is not counted: its chord loses.
  - Safe squares known moved from the chart against the whole game, where
    the 2026-10-20 revision had combined it with the pace lines, to the
    moves chart beside the other counts. The chart against the whole game
    is fourth, still under the tracks.

## Placement

- A stat section titled "live perf charts" heads the details column's
  statistics beside the board: it sits above game data's one chart, whose
  sides are "game summary perf" and "board traits"
  ([Game data](game-data.md)), or above a lost game's statistics. Its title
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
- The "live perf charts" switch hides it. It sits in the result sections'
  This game group, just before game data, the order the column shows them
  (the first build's switch was in the Charts group). Closing the section
  by its title keeps it on the page, one line high; the switch removes it.

## Charts

- Charts keep the grammar first built for the session stats ([Session stats](session-stats.md)):
  a framed plot with light gridlines, y ticks labeled in bold black, and each
  line in its series' color. Hovering a line's legend entry spotlights it:
  the line thickens and the chart's other lines fade. Clicking it chooses
  which lines show (Legend picks, below).
- Top to bottom: the progress chart, the moves available chart, the event
  tracks, then the chart against the whole game (the moves chart since
  2026-10-26; the chart against the whole game moved below the tracks on
  2026-10-21, from second).
- Three charts, each drawing only its shown rows and disappearing when none
  are shown:

  | Chart | Rows | Y axis |
  | --- | --- | --- |
  | progress | 3BV solved, squares opened, mines flagged | 0% to 100%, labeled every 20% |
  | moves available | the counts of moves the board offered | a count from 0 |
  | against the whole game | every pace, board, and report row | the line's value divided by its whole-game value, on a doubling (log) scale or a linear one |

- The moves chart's axis starts at 0 and steps by 1, 2, or 5 times a power
  of ten, at most five labels, up to the first label at or past the
  highest count its shown lines reach (at least 1). Its plot is 120 pixels
  high, the height of the chart against the whole game, so counts a few
  apart stay apart.

- The scale of the chart against the whole game is log by default and
  doubles at each label: 1×
  is the line's whole-game value, drawn as a black line across the plot,
  and ½×, ¼×, ⅛× below it and 2×, 4×, 8× above it. It runs as many
  doublings each way as its farthest value needs, at least one and at most
  three; a value past three doublings is drawn at the edge, and zero on the
  floor. A line whose whole-game value is zero, or not measured, has nothing
  to be measured against and is not drawn; its legend entry still gives the
  value.
- Its linear scale (creator 2026-10-21; the "log scale" checkbox in the
  options row chooses it when unchecked) runs from 0 on the floor to the farthest value its lines
  draw (in raw, which draws no lines, its farthest incident), at least 2×
  and at most 8×, rounded up to a label. The labels step by ½×, 1×, or 2×,
  at most six of them, and 1× is always labeled and drawn as the black
  line. A raw dot or a value past the top is drawn at the edge, as past 8×
  on the log scale: fitting the dots would let one far incident flatten
  every line. Either scale leaves every plot in the same place: the plots'
  left edge has room for every label either scale can draw. The choice
  persists (`duringGameRelativeScale`).
- Legend picks (creator 2026-10-21): clicking a legend entry chooses which
  of its part's rows show. With all shown, the default, a click shows that
  row alone; a click on another adds it, and a second click on a shown one
  removes it. Removing the last one shown, or adding back the last one
  hidden, shows them all again, since showing none is pointless. Each
  chart and the event tracks choose for themselves. A hidden row's entry
  keeps its place, its swatch or mark, and its whole-game value, with its
  name struck through; hovering it spotlights nothing. The moves chart and
  the chart against the whole game fit their scales to the lines shown; the
  event tracks keep all three lanes when a lane's marks are hidden, so
  nothing below moves. The picks hold for the game shown, through every
  redraw of its block (averaging, scale, configure, the result drawn again
  as its measurements finish), and start over, all shown, with the next
  game. Configure still decides which rows the block has at all.
- Above each chart one line names its lines: a swatch in the line's color,
  the row's name (it shows the row's definition on hover), and its
  whole-game value, the most legible text there. The line of the chart
  against the whole game starts with "whole game (1×)", in bold, so the
  values beside the names read as the 1× each line is measured against;
  the moves chart's starts with "game average", since its values are each
  count's average over the game's time, which the plot does not mark.
- One time axis: every plot spans the same width, game seconds from the first
  click to the end of the game, with vertical gridlines at the same seconds
  in every chart. The seconds are labeled under the first part and under
  the last.
- Event tracks sit between the moves chart and the chart against the whole
  game, on the same time axis: three thin
  tracks named at their left, "clicks", "jumps", and "pauses", holding every
  shown event row's marks by what the events are about (Events, below).
  Each row's mark differs in shape within its track and in color: an instant
  is a small shape at its moment, a long gap a band through the pauses
  track over its span, and the window left a bar along that track's top
  over its span. One legend under the tracks lists every shown event row:
  its mark, its name (its definition on hover), and its count.
- "averaging", "log scale", and "configure" sit in one small row at the
  bottom of the block, as game data's options do.

## Hover and the board at that moment

- Hover anywhere over the charts draws one vertical line through all of
  them.
- A small card beside the pointer shows the moment and, over a chart, the
  one line nearest the pointer: its swatch, its name, and its value then
  (on the chart against the whole game, the line's own value, not its
  ratio). That line
  comes forward and the chart's other lines fade. Where no line has a value
  at that moment the card says "nothing measured at this moment". Over an
  event track the card names the track and gives its events at that moment
  in words, such as "left 3 proven-safe squares unopened; jumped 9 squares"
  or "1.8 s pause, ended by a reveal", or "none at this moment". Only the
  rows the legends show count (Legend picks, above). The card opens right of
  the pointer, away from the board left of the column, or left of it where
  the window has no room; above the pointer where there is room, else
  below.
- The board itself shows that moment (creator 2026-10-21, replacing the
  board shown beside the block from 2026-10-15). While the pointer is over
  the charts within their time axis, the replay under the board moves at
  once to the moment under the pointer: the position before the next click,
  with that click's squares shaded, and the replay's overlays, slider,
  status line, and legend, all as the transport shows them and in the
  player's board settings ([Path and choice replay](replay.md)). The last
  click ends the game, so the axis's last 6 pixels (the hover's reach) show
  the finished board. Hovering stops playback.
- Leaving the charts, or their time axis, returns the board to the replay's
  own position: the finished board after a game, or wherever the transport
  or a click left it. A hovered moment is never saved as the replay's
  position.
- A click on a chart or an event track keeps its moment: the replay stays
  there after the pointer leaves, saved as the transport's moves are, and
  the board scrolls into view if the page had scrolled it away. In the
  compact layout the Game details popover covers the board, so the click
  also closes it. A click on a legend is a legend pick, not a move.
- Gone with the board beside the block: its head line (the transport's
  status names the moment and the next click instead), its fixed size and
  place, and the proven-safe ring on only the squares the hovered events
  concern (the ones a move left behind, or every proven-safe square during
  a pause). Under the replay's "available moves" overlay, on by default,
  every proven-safe square of the moment is ringed, so the squares a move
  left behind are among them but not set apart
  ([BACKLOG.md](../../BACKLOG.md)).

## Averaging

One choice in the options row applies to every averaged row, listed in this
order: a rolling average over 2, 5, or 10 seconds centered on each moment,
raw incidents, or fixed 2, 5, or 10 second buckets counted from the first
click. The default is the 2 second rolling average (creator 2026-10-20; it
was 5 second buckets). Raw incidents stay drawn under an average: dots in
the line's color for measured values, and short ticks at the plot's foot
for rate incidents. A rate in raw draws only its ticks. A bucket or window
with under one second of play shows no value, the rule the session stats
used: a rate over a sliver of time is not evidence. Progress, board-state, and
event rows have no average.

## Rows

A row that shares a game data measurement's name keeps that measurement's
definition and format, measured over the bucket or window instead of the
whole game, so its whole-game value matches the game data value (to the
millisecond for the fastclick gap). In its legend entry, a progress row
shows its final share, a moves or board row its average over time, a rate
or ratio the whole game's, and an incident row its median or mean; an event
row shows its count.

Shown by default:

| Row | Group | Definition |
| --- | --- | --- |
| 3BV solved | progress | share of the board's 3BV done by each moment; an opening counts once, when any of its zeros opens; a number touching no opening counts when it opens |
| squares opened | progress | share of the board's safe squares open |
| mines flagged | progress | share of the board's mines carrying a flag; flags on safe squares do not count |
| 3BV/s | pace | 3BV solved per second |
| click rate | pace | board-changing clicks per second |
| action gaps | pace | time from one board-changing click to the next; averages take the median |
| fastclick gap | pace | gaps of 1 s or less ending in a click made while the cursor was moving, as game data defines it; averages take the median |
| mouse speed | pace | cursor travel per second, pauses included; each dot is the speed between two board-changing clicks |
| safe squares known | moves available | covered, unflagged squares the visible board had proved safe, between clicks |
| mines by counting | moves available | covered, unflagged squares counting single numbers proves mines, one number at a time, as a 2 with only two covered squares beside it |
| mines by counting near the last move | moves available | the mines by counting at most 5 steps (one square across or down each) from the last board-changing click; none before the first |
| chordable numbers | moves available | open numbers with as many flags beside them as their number, every flag on a mine, and a covered square left beside them |
| squares moved between actions | board | squares (in any direction) from each board-changing click to the one before; averages take the mean |

Off by default: efficiency, board-changing click share, IOE, no-op rate,
misclick rate, path / click, path / 3BV (each as game data defines it);
work areas (separate places holding proven-safe squares, squares at most 2
apart counting as one place); and in the moves available group, mines known
(covered, unflagged squares the visible board had proved mines) and the
squares each deduction level is the first to prove, safe and mines apart:
safe by counting, safe by overlap, safe by all numbers, safe by the mine
total, mines by overlap, mines by all numbers, and mines by the mine total
([Design axis](design-axis.md), "Deduction levels"). A square counts at one
level only, so the four safe rows add up to the safe squares known and the
four mine rows to the mines known.

Off by default since 2026-10-20, when the left stats panel was removed and
the creator asked for its measurements as optional rows ("same for all,
actually"; [Session stats](session-stats.md)), each as game data defines it
([Catalog and configuration](game-data.md#catalog-and-configuration)):

| Row | Group | Definition |
| --- | --- | --- |
| flag rate | pace | flags placed per second; removals do not subtract |
| flag-removal rate | pace | flags taken back per minute |
| cadence spread | pace | the width of the middle half of the gaps between all button presses divided by their median; raw shows each press as a tick |
| game risk rate | report categories | the report's game risk actions per minute |
| early guess rate | report categories | the report's early guesses per minute |
| time loss rate | report categories | the report's time loss actions per minute |
| life maximization rate | report categories | the report's life maximization moves per minute |
| excess game risk | report categories | the game risk actions' extra chance of losing over the safest available move, in percentage points per minute |
| modeled life gap | report categories | the expected remaining life the one-move survival model saw given up, per minute |

A report row counts each action when it took effect, in the category the
after-game report files it under. A game with any action filed under
measurement notes (judged by an older evaluator) has no measured counts:
its report rows draw no line, and their legend entries say "not measured".

A progress row starts from what the board showed at the first action, so a
given opening counts as already done. The moves rows count the board as it
stood before each click. Safe squares known, mines known, work areas, and
the all-numbers and mine-total rows say nothing where the prover's search
stopped at its work limit; the counting and overlap rows are always
measured, and chordable numbers always.

## Events

Each event row has its mark on one of the three tracks. "Near" a click
means within 2 squares, in any direction, of anything that click opened or
marked.

| Track | Rows (mark) |
| --- | --- |
| clicks | no-op clicks (ring), misclicks (cross), flags removed (down triangle), flags on safe squares (up triangle), guesses (diamond), openings (square), unused flags (outlined up triangle) |
| jumps | moved on (chevron right), left hard work (outlined arrow right), left easy work (arrow right), forks (fork), came back (chevron left) |
| pauses | long gaps (band over the gap), window left (bar along the track's top) |

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
  it had run out: the local work ended and the player went elsewhere.
- **left hard work** — the same jump made while proven-safe squares near
  the previous click were still unopened (and not toward them), none of
  which counting a single number proves: only numbers taken together
  prove them, so the local work had turned slow.
- **left easy work** — the same jump made while counting a single number
  had proved at least one of those squares safe.
- **forks** — a move (moved on or left either kind of work) made while
  proven-safe squares lay in 2 or more separate places: a choice of where
  to go next. The card says how many places there were and whether the
  player went to the nearest one.
- **window left** — the game's window hidden or out of focus, drawn over the
  span. Games saved before 26 September 2026 did not record it; their legend
  entry says "not recorded", the card over the pauses track says "window
  left: not recorded for this game", and their long gaps say nothing about
  the window.

Off by default:

- **came back** — a move back to proven-safe squares an earlier move that
  left work left behind, with how long they waited.
- **openings** — a click that opened a zero region.
- **unused flags** — a correct flag no chord used, at its placement; known
  only on wins.

Every move event's card says how long after the previous board-changing
click the move came ("moved on after 1.4 s"), whether it was a guess, and
how far the nearest proven-safe square was; a move that left work says how
many proven-safe squares it left and how many of them counting proved
("left hard work after 2.3 s: 2 proven-safe squares unopened, none by
counting"). Moves and forks need the exact proof; where the prover stopped
at its work limit, only leaving work can still be judged, from the squares
it did prove, hard or easy alike: counting's proof is always complete.

### Move characterization and habits (creator request 2026-10-20)

The creator asked to build "move habits and characterization of moves, when
ih ave to move since local direction ends OR becomes very slow". Each move
gets its reason: the local work ended (moved on), it had turned slow (left
hard work: what remained needed numbers taken together), or the player left
work counting alone would have done (left easy work), with the time it took
to move and where it went (a guess, the nearest place with proven-safe
squares, or another place). Built the same day:

- The split of the former "left work" event into left hard work and left
  easy work (above). A row choice saved before the split carries to both.
- Per-game habits, stored on every game record from now on, wins and losses
  alike ([Per-game stats](per-game-stats.md), "Move habits"): the moves of
  each kind, the median time before a move, and the forks and how many went
  to the nearest place.
- Game data ranks three of them against lifetime and the session
  ([Game data](game-data.md), "Catalog and configuration"): time before a
  move and moves leaving easy work, shown by default, and forks to the
  nearest area, off by default.

Games saved earlier get their habits when their result is next restored on
the game page; a backfill of every saved game is in
[BACKLOG.md](../../BACKLOG.md).

The thresholds (2 squares near, 3 squares a jump, 1 second a long gap, 1
second a quick undo) are first choices to be checked against the creator's
games ([BACKLOG.md](../../BACKLOG.md)).

## Configure

"configure" in the options row replaces the charts with one checklist of
every row, grouped as progress, moves available, pace, board, report
categories, events,
with back buttons at
its top and bottom ("back to live perf charts"); Escape also returns.
Choices apply at once and persist in the settings (`duringGameRows`); the
averaging choice persists as `duringGameAveraging` (renamed from
`duringGameAverage` on 2026-10-20, so the new default reached every player
once), and the "log scale" checkbox as `duringGameRelativeScale` (`log` or
`linear`). Legend
picks are not saved: they last as long as the game shown (Charts, above).

## Built and requested

Built 2026-10-15: a first build, then the same day the 2026-10-15
revision; the 2026-10-20 revision the day it was asked, and the move
characterization and habits (above) later that day; the 2026-10-21 and
2026-10-26 revisions the days they were asked. Requested but not built
yet, in [BACKLOG.md](../../BACKLOG.md): forks inside one work area (several
ways forward from the same frontier) and the habits of games saved before
2026-10-20. Proposed there with them: threshold calibration, rows plotted
against progress instead of time, and live rows during play.
The cadence-spread row proposed there was built on 2026-10-20 with the
other rows from the left panel.

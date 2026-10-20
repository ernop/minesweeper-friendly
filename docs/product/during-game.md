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
  the line thickens and the chart's other lines fade.
- Two charts, each drawing only its shown rows and disappearing when none
  are shown:

  | Chart | Rows | Y axis |
  | --- | --- | --- |
  | progress | 3BV solved, squares opened, mines flagged | 0% to 100%, labeled every 20% |
  | against the whole game | every pace, board, and report row | the line's value divided by its whole-game value, on a doubling scale |

- The second chart's scale doubles at each label: 1× is the line's
  whole-game value, drawn as a black line across the plot, and ½×, ¼×, ⅛×
  below it and 2×, 4×, 8× above it. It runs as many doublings each way as
  its farthest value needs, at least one and at most three; a value past
  three doublings is drawn at the edge, and zero on the floor. A line whose
  whole-game value is zero, or not measured, has nothing to be measured
  against and is not drawn; its legend entry still gives the value.
- Above each chart one line names its lines: a swatch in the line's color,
  the row's name (it shows the row's definition on hover), and its
  whole-game value, the most legible text there. The second chart's line
  starts with "whole game (1×)", in bold, so the values beside the names
  read as the 1× each line is measured against.
- One time axis: every plot spans the same width, game seconds from the first
  click to the end of the game, with vertical gridlines at the same seconds
  in every chart. The seconds are labeled under the first chart and under
  the last part, the event tracks.
- Event tracks sit under the charts, on the same time axis: three thin
  tracks named at their left, "clicks", "jumps", and "pauses", holding every
  shown event row's marks by what the events are about (Events, below).
  Each row's mark differs in shape within its track and in color: an instant
  is a small shape at its moment, a long gap a band through the pauses
  track over its span, and the window left a bar along that track's top
  over its span. One legend under the tracks lists every shown event row:
  its mark, its name (its definition on hover), and its count.
- "averaging" and "configure" sit in one small row at the bottom of the
  block, as game data's options do.

## Hover and the board at that moment

- Hover anywhere over the charts draws one vertical line through all of
  them.
- A small card beside the pointer shows the moment and, over a chart, the
  one line nearest the pointer: its swatch, its name, and its value then
  (on the second chart, the line's own value, not its ratio). That line
  comes forward and the chart's other lines fade. Where no line has a value
  at that moment the card says "nothing measured at this moment". Over an
  event track the card names the track and gives its events at that moment
  in words, such as "left 3 proven-safe squares unopened; jumped 9 squares"
  or "1.8 s pause, ended by a reveal", or "none at this moment". It opens on
  the side of the pointer away from the board below, so it never covers it.
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
- A click on the charts moves the replay under the board to that moment
  (and stops its playback, as any other move does;
  [Path and choice replay](replay.md)).

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
shows its final share, a board row its average over time, a rate or ratio
the whole game's, and an incident row its median or mean; an event row
shows its count.

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
| safe squares known | board | covered squares the visible board had proved safe, between clicks |
| squares moved between actions | board | squares (in any direction) from each board-changing click to the one before; averages take the mean |

Off by default: efficiency, board-changing click share, IOE, no-op rate,
misclick rate, path / click, path / 3BV (each as game data defines it);
safe by counting (the safe squares known that counting single numbers
proves, the quickest kind to see); work areas (separate places holding
proven-safe squares, squares at most 2 apart counting as one place).

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
given opening counts as already done. Safe squares known and work areas say
nothing where the prover stopped at its work limit; safe by counting is
always measured.

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
every row, grouped as progress, pace, board, report categories, events,
with back buttons at
its top and bottom ("back to live perf charts"); Escape also returns.
Choices apply at once and persist in the settings (`duringGameRows`); the
averaging choice persists as `duringGameAveraging` (renamed from
`duringGameAverage` on 2026-10-20, so the new default reached every player
once).

## Built and requested

Built 2026-10-15: a first build, then the same day the 2026-10-15
revision; the 2026-10-20 revision the day it was asked, and the move
characterization and habits (above) later that day. Requested but not built
yet, in [BACKLOG.md](../../BACKLOG.md): forks inside one work area (several
ways forward from the same frontier) and the habits of games saved before
2026-10-20. Proposed there with them: threshold calibration, rows plotted
against progress instead of time, and live rows during play.
The cadence-spread row proposed there was built on 2026-10-20 with the
other rows from the left panel.

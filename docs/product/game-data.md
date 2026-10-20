# Game data and the shared session

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/game-data.md](../implementation/game-data.md).

Confirmed and implemented 2026-09-23. This records the user's successive
requirements and clarifications; it supersedes the earlier compact chart draft.

## Position and presentation

For regular wins, game data replaces the scalar statistics grid. Since
2026-10-17 it lives in the one details column right of the board (creator:
"make the entire rightside (two columns) into one"; [Layout: the board never
moves](board-and-layout.md)), below "live perf charts" (titled "during
this game, second by second" until 2026-10-20; creator 2026-10-15: "so it's
"during this game second by second", "your perf totals for this game", then
"board traits""; [During the game](during-game.md)), and takes the column
height left below the outcome line, the controls, and live perf charts.
After a loss live perf charts and the loss's statistics fill the column
instead. From 2026-09-23 to
2026-10-17 game data had its own
full-height column between the board and a 320px details column (user
decision 2026-09-23: "a full-height column right next to the board"), which
the creator found "too compressed" on a laptop. Where the column cannot dock,
everything goes into the Game details popover in the same order.
It is not repeated among the lower ranking charts. Losses and trial games
retain their scalar statistics because an unfinished board has no completed
solve-time or efficiency rank. High scores uses its latest winning game.

The chart supports only one vertical band: "game summary perf" (titled
"your perf" until 2026-10-15 and "your performance this game" until
2026-10-20, creator: "rename the 2nd section to "game summary perf"") on the
left and "board traits" on the
right, both read against one percentile bar (creator 2026-10-17, after the
first one-column build had split them into two stat sections with a band
each: "its necessary / hoped for that "board traits" and "your perf" share
the same percentile distribution chart"). Each side's title is the button
that opens and closes that side, remembered across games and reloads
(creator 2026-10-17, of the details column's stat sections: "each of those
shall be toggleable open/closed so that we use space well"). A closed side
keeps only its title, beside the bar on its own side, and the open side
keeps the bar and takes the room; with both closed the chart is one line
holding the two titles. Use Arial typography, white background, and
ordinary controls. The separate "This win" and time caption is removed;
solve time is the "time" row.

Rows and columns (creator review 2026-10-07, built the same day; the creator:
"game-data band is nice", then of the round-2 mockup "your changes to the
vbar for percentiles look great, as does your mouseover distribution. let's
do that!"; revised 2026-10-08, below):

- One row per measurement, in aligned columns: your perf reads name, value,
  session %, lifetime %; board traits read %, name, value. Column heads name
  the performance pools ("session", "lifetime") and "value"; the board
  side's percentage column has no head, and neither side's name column has
  one (Board name, below). This replaced one label per pool with
  "(session)" and "(day)" suffixes, which doubled the left side's labels.
- Labels are black and uncolored. Names, values, and percentages are all
  regular weight; values and the plotted percentage are one size larger
  than names, right-aligned in tabular digits, so the measured values stay
  the most legible text. Every row is one line.
- The bar carries the color: green (better) through white to red (worse),
  with its decile labels printed inside it in black. Leaders run from each
  row to its exact point on the bar's edge, where a dot marks it.
- "points: lifetime | session" picks which pool places the dots on both
  sides, which percentage the board side shows, and which pool every card
  shows (below). The session column appears once any performance row has a
  session rank. A row without a rank in the chosen pool is listed in a note
  above the band ("Not ranked in this session yet: …").
- Names are the standard names (one name per measurement, creator direction
  2026-10-07): "max number", "zero-opening coverage", "islands", never MN or
  ZOC.
- Responsive: both sides share one row with both percentage columns while
  they fit, then drop the session column (the points switch still offers
  it), then, with both sides open, stack board traits under your perf with
  two columns and then one. The band never scrolls: of these layouts it
  takes the one that needs the least shrinking (the earlier one on a tie)
  and scales its text and geometry together to fit its box. A title wider
  than its columns stays centered over them, and the band's width keeps
  room for it (2026-10-17, when the titles gained their open/close arrows).

Revision 2026-10-08 (creator, of the band at 2560 px: "top 'game data' -
remove. options - condense top options and bottom options, out of the way.
your perf and board traits - center, each above their side of the viz.
remove 'boards' from right side ... remove the bolding of the numbers - no
point to it", "we should be careful not to allow this part of the UI to gain
any kind of vscroll bar or hscroll bar", and "the mouse shall not change to
the '?' mark"), built the same day:

- No chart heading. The band starts with "game summary perf" and "board
  traits" (Section titles, below), each centered over its own side's
  columns. Since 2026-10-17 each title opens and closes its side. A (?)
  beside each title opened help saying what its side's percentages are
  (the share of the other games or boards that ranked better, a tie
  counting as half; for board traits, better meaning each trait's declared
  preferred end) until 2026-10-20, when the creator removed both, with
  their text, and the live perf charts' (?): "remove all three (?) buttosn
  and mouseovers entirely, not replacing orputting the removed text
  anywhere; it merely wil lbe gone." Until 2026-10-17 the title itself
  opened the help.
- Every chart option sits in one small wrapping row under the data:
  points switch (in distributions mode the pools switch, below, takes
  its place), "show distributions", "show values", "configure", and
  "session history". Configuration and session history keep a "back to
  game data" button at their top and bottom.
- Nothing in the band or the distributions view scrolls, at any panel or
  window size: both scale to fit (below). Configuration and session history
  take their natural height. The details column's own scrolling, when its
  contents need more than the window's height, is unchanged.
- No help affordance changes the pointer to the question-mark help cursor
  ([UI doctrine](ui-doctrine.md)).

Geometry (layout pass 2026-09-23, after the user found the chart "crushed
and badly displayed" in a fixed 320px column; heights revised 2026-10-17):
the chart uses the whole width of the fluid details column
([Layout: the board never moves](board-and-layout.md)). It fills the height
left below the controls and live perf charts, so its
options row stays on screen, keeping at least 240px per open side (480px
with both); the column scrolls below that. Configuration and session
history take that height as one view, at least 480px. The
bar is 32px wide at full size (it scales with the band); rows are fitted to
their exact points with minimum squared displacement, and exact percentile
points never move. Text is pure black on white, including ticks, controls,
and disabled buttons.

Hover card (built 2026-10-07; rebuilt 2026-10-08, then cut back the same
day). The creator first asked that each card "explain what the
number/stat/perf item is and really show how it is calculated exactly",
then that it follow the points switch ("in session mode, the bars etc.
should reflect SESSION info"). Of the rebuilt time card the creator then
said: "I confirm that the first 4 lines are useless since they just state
what the user already knows/has on screen. also remove stuff like 'with
these boards settings' which are obvious. dont include that pointless
actual division equation please. Get the point? please just cut all the
fluff here for all mouseovers around here". So a card holds only what the
row and the panel do not already show or say. Hovering or focusing a row
opens it over the band, never reflowing it; the row itself takes no hover
background (creator 2026-10-20: "entirely remove the blue-background when
mousing over effect"), and keyboard focus keeps an outline. In order:

1. The chosen pool's rank, the card's largest text: "lifetime: 19th of
   1,201 wins", "session: tied 3rd–5th of 56 games", or for a constant
   pool "lifetime: all 50 boards have this value". The population word is
   wins, games, or boards.
2. In the band only, the pool's games on the measurement's axis, drawn as
   the distributions view's strips are (Strips and example boards, below).
   A distributions row already shows its strip, so its card does not draw
   it again (creator 2026-10-20: "if mousing over shows more detail, but
   the space given to that mouseover popup is smaller than the original
   allocated space, yet it's more detailed, that's weird. why not just
   always show the better version"). No key line names the marks (removed
   2026-10-08, below).
3. This game's board showing what the measurement counts, with a key of
   counts, where the measurement has one (Strips and example boards,
   below).
4. Last, a definition, only where the name and unit leave the measurement
   open, and never opening with its name: misclick rate, fastclick gap,
   click rate, efficiency, no-op rate, board-changing click share, IOE, ZiNi and HZiNi
   efficiency, IOS, STNB, mouse speed, cadence spread, unused flag share,
   unflagged mine share,
   and the board traits ZiNi, HZiNi, 3BV spread, 0–1 share, zero-opening
   coverage, islands, and largest island. Time, 3BV/s, path / 3BV, path /
   click, 3BV, max number, and zeros have
   none. The configuration list shows the same definitions.

Removed by the cut (2026-10-08): the name-and-value title, the "This is …"
plain sentence (added earlier the same day in answer to the creator's
"also, things like the mouseover chart for 'time' saying 'this is your time
from start to the win'"), definitions of self-evident measurements, this
game's worked calculation, the example boards (back since 2026-10-20, drawn
from this game's own board), the direction sentence (the
histogram's "better →" stayed until 2026-10-11, below), the pool descriptions "so far with these
board settings" and "this session (last hour)", the percentage arithmetic
("17 ÷ 123 = 13.8%"), and the "Chart below" line (hovering still outlines
that chart). Every pool holds only games with this game's board settings,
and the row already shows the name, value, and percentage.

Removed later the same day (creator: "'Green line: this game. Ticks under a
lifetime or board strip: this session's games.' and similar rather
pointless text shall not appear in this project, please"): the card's key
line ("One bar per value.", "Each bar spans 0.834s.", "One dot per win.",
"Ticks: this session's wins.", "Green line: this game.") and the line under
the distributions strips ("Green line: this game. Ticks under a lifetime
strip: this session's games."). The key's last part, a count of games
beyond the 1st–99th percentiles ("2 wins beyond the 1st–99th percentiles
are not drawn."), went with it: the rank above the chart counts every game,
and the count only described the drawing. The marks are unchanged
([UI doctrine](ui-doctrine.md), "No narrated marks").

The chosen pool is the points switch's: in session mode the rank, dots or
bars, and their colors all come from this session's games with these board
settings (same size, mines, mode, generator), up to this game, under the
one session definition; the lifetime mode uses every such game so far.
Wins-only measurements count the session's wins, action
measurements its wins and losses, board traits its boards. Both modes share
the measurement's lifetime axis and bins, so switching modes shows where
the session sits in the lifetime range. A session game past that range
is not drawn. A session pool needs two measured games, like any pool;
with fewer, the row has no session point and the note above the band lists
it. A small session (most are) draws one dot per game.

Better on the left (creator decision 2026-10-11, built the same day to try
it). On 2026-10-08 the creator asked about the mixed sides ("some have
good(green) on left, others on right. I do know the reason for that though
and it makes sense too"), and each axis kept its numeric order while the card
printed "better →" or "← better". On 2026-10-10 the creator asked "what if we
flipped (left/right) some of the distributions, so that rather than some
being left-green, right-red, and others revesred, they all had this
property, that the green end of the distribution were drawn on the left
side?", and of the resulting proposal: "I mean, i don't think this logically
is good at all. let's try this please."

- Every strip and card draws its better end on the left. A higher-is-better
  measurement's axis runs from its highest value at the left to its lowest
  at the right, so its axis labels descend (3BV/s: 3, 2.5, 2, …);
  lower-is-better measurements, time among them, keep their numeric order.
- A column of strips reads by position alone. A row's percentage, the share
  of the other games that ranked better, is the share of its strip's games
  left of the line (a tie counting half), and the best comes first, as in
  the band, whose 0% is at the top.
- The card's "better →" / "← better" is removed: it would read "← better"
  on every card.
- The your-perf and board-trait charts keep numeric order on x (their tick
  values and trend lines read that way), so a mirrored row's strip runs
  opposite to the chart its hover outlines.

Bins (creator question 2026-10-08: "how do we choose bucketsize? i saw what
might be artifacting on our 3bv count ones"). It was an artifact: whole
counts spanning more than 60 values went into 36 equal bins whose width
was not a whole number, so bins alternately held one or two possible
values and the 3BV histogram drew a comb that was not in the data (the
0–1 share and zero-opening coverage histograms, steps of one safe cell,
had the same fault). Since 2026-10-08 a discrete measurement bins whole
groups of its possible values: whole counts and whole milliseconds (step
1), and the two shares of safe cells (step one cell, the same for every
board with these settings). Up to 60 possible values get one bar each;
wider ranges get equally many values per bar, for about 36 bars.
Continuous measurements keep 36 equal bins. Axis labels sit at round
values.

Drawn range (creator 2026-10-11, of the misclick strip and the other
strips flattened the same way: "so compressed horizontally i'm having
trouble seeing the actual meaningful part"). A log axis was considered
and not used. The tail that flattens a strip is not a smooth
multiplicative scale — a per-minute rate in particular explodes on a game
that lasted a few seconds — and a log axis would still spend most of an
unlabeled strip on that tail, while a bar would stop covering a fixed
interval. The strip stays linear. Its range is the box-plot whisker, the
same fence path colors and the scatter y-axes use: Q1 − 1.5·IQR through
Q3 + 1.5·IQR, then in to the most extreme values that still fall inside,
so the axis is not padded with empty bins out to the fence itself. Fewer
than 8 values leave the fence unstable, and the whole range is drawn.
When the interquartile range is 0, at least half the values are one
number and there is no whisker; the narrowest window that still holds
90% of the values is drawn, so a point mass keeps the tail beside it
instead of the strip collapsing onto the mass. Values past the fence are
not drawn and are not folded into an edge bin. The rank still counts
every game. This game does not stretch the axis; its pin past the fence
sits on that edge. The value column still shows the untrimmed number. Bar height stays proportional to the count,
except when the tallest bar is at least six times the next: that next bar
is drawn at half the strip and shorter bars keep their ratios to it, so a
point mass (most games at one value) does not flatten every other bar to
a pixel. The tallest bar stays the tallest.

Distributions mode (built 2026-10-07; the creator: "switch distributions
mode is incredible, too!", and "showing both optionally is good. e.g. in the
distribution mode ui there would just be a section for 'session' and another
for 'lifetime'"): the saved "show distributions" checkbox replaces the bar
with one strip per measurement in sections. Each row reads name, value
(when shown), its strip, and the percentage. All strips share one left edge and width across sections, and
a measurement keeps its catalog position in every section. A row's card
shows its own section's pool.

Pools switch and strips that fill the height (creator 2026-10-08, of the
distributions view: "for this ui, i also still want the same ability to
choose to show lifetime/session or both. plus, i want if i remove items
then the remaining ones should expand vertically to fill the space! it's
vital, since that way i can see things more nicely"), built the same day:

- "pools: lifetime | session | both" takes the points switch's place in
  the options row while distributions are shown; saved, default both. It
  was labeled "sections" until 2026-10-17, when the details column gained
  stat sections that open and close. Like the points switch it applies to
  your perf and board traits alike: each chosen pool gets a group under
  each side's title, in the order your perf against lifetime, your perf
  against the session, board traits against lifetime, board traits against
  the session. Each group's percentage head names its pool, and nothing
  else does (Section titles, below). (Until 2026-10-08 the view always
  showed your perf against both pools and board traits against lifetime
  only.)
- No strip ticks the session's games under its axis (until 2026-10-20 the
  lifetime strips did): the session's own strip shows them on the same
  axis, and the axis now carries its x ticks. No key under the strips names
  the marks (removed 2026-10-08, Hover card above). With the session alone,
  measurements without a session rank are listed in the note above the
  strips ("Not ranked in this session yet: …") instead of vanishing.
- The strips take all the height the rows leave: every strip gets the
  tallest height at which the view still fits its box, so hiding
  measurements (configure), a pool (the pools switch), or a side (its
  title) makes the remaining strips taller. The text keeps its size; only
  when even the shortest strip (25 px: pin, plot, ticks, and their labels)
  does not fit does the view shrink, its text and strips together. The view
  never scrolls (2026-10-08). The plot takes the extra height; the pin,
  ticks, and labels keep their size.

Board name (creator request 2026-10-15, built the same day; removed
2026-10-20): "dosession timings (in distribution view) include ONLYthat
sizze game? i thinkthey should. e.g. beginner, intermed etc. ) make it
clear to users with a subtle indicator too." They already did: every pool,
lifetime and session, on both sides and in both views, holds only games
with this game's board settings (size and mines, mode, and generator), and
a no-mark win's pools only its no-mark games
([No-mark wins](rankings.md#no-mark-wins-decided-2026-10-14)).

- From 2026-10-15 to 2026-10-20 the indicator was the board's name
  ("Beginner", "Intermediate", "Expert", or "Custom 20x20-60") heading one
  name column per view. The creator then removed it: "remove duplicated
  text "intermediate" hey, let's talk. why did this come bakc? it
  shouyldn't have. there is already a visible-on-the screen indicator that
  we are in intermediate mode. it's the fact that Intermediate is already
  highlighted on top of the whole entire screen! in general, let's avoid
  copying data from a canonical, visible location, to some other smaller
  lcoation for "convenience"." It had come back through the 2026-10-15
  request above. The highlighted preset link, or the other modes menu and
  the mode options row for any other board, is the indicator; no head
  repeats it ([UI doctrine](ui-doctrine.md), "No copies of a visible
  fact").
- Mode and generator were never repeated in the heads: their pickers show
  them (creator 2026-10-19: "no need to name mode, it's in the picker.").
- The distributions view's percentage heads and row labels use the pool
  names, so a no-mark win's groups read "no-mark" and "no-mark session" as
  the band's heads do. Until 2026-10-15 they read "lifetime" and "session"
  even there, against the No-mark wins rule.

### Section titles (creator 2026-10-15; revised 2026-10-20)

"the section labels are wrong. The top which says "session" beginner shoulds
say "your performance this game, within this session"", in the same message
that put "during this game, second by second" above game data and named the
column's order: "during this game second by second", "your perf totals for
this game", then "board traits" ([During the game](during-game.md)). On
2026-10-20: "rename the 2nd section to "game summary perf"", "someone added
back in "within your lifetime" to each distribution section again. remove
that agani.", and "remove topline "your games" which is pointless". Now:

- Both views: "game summary perf" over the performance side and "board
  traits" over the board side; each title is the button that opens and
  closes its side (since 2026-10-17). In the distributions view each heads
  its side's groups.
- Distributions view: a group has no title of its own. Its column heads
  are "value" and the pool ("lifetime", "session", "no-mark", "no-mark
  session"); the name and strip columns have no head. With both pools
  shown, the pool head is what tells a side's two groups apart. From
  2026-10-15 each group's title joined side and pool ("your performance
  this game, within this session"), from 2026-10-17 a pool phrase ("within
  your lifetime", "within this session") titled each group when both pools
  were shown, and a "your games" head named the strip column, until the
  creator removed both on 2026-10-20.
- The band: the performance side's columns name both pools; the board
  side's percentage column has no head.

### Strips and example boards (creator 2026-10-20)

Creator, verbatim: "redo the vertical "two horizontal blue black bars bewteen
blue" indicator which i don't get what it means at all", "on the mouseover
of each distribution, entirely remove the blue-background when mousing over
effect. and rather than re-drawing the entire distribution in some other new
way, why aren't we just using that way to draw it in the first place? like,
if mousing over shows more detail, but the spasce given to that mouseover
popup is smaller than the original allocated space, yet it's more
detiale,d that's weird. why not just always show th better version and not
have any mouseover? if mouseover isn't adding anything? actually, mouseover
can have a function - many of them have text + (should ahve visible UI
examples of what the nmber or trairt means (using mine boadr drawing code
which uses the same exact visual styule as the suers' currently chosen
board style!)). those board trait inline sparkline charst MUST have xticks,
come on!" Built the same day:

- A strip is drawn at its row's own size in pixels, not stretched to it,
  and is the full drawing: a pool of at most 30 games draws one dot per
  game at its exact value (touching dots stack) when its tallest stack
  fits the strip with dots at least 4 px wide; otherwise, and for a larger
  pool, bars count the games per value range. Dots and bars are colored by
  standing, as before. No bar is wider than 24 px at full size, so a pool
  holding one value is one bar at that value, not a bar across the strip.
- X ticks: every strip has tick marks under its axis with their values,
  9 px at full size; a label that would crowd the one to its left is left
  out, with its tick. The band's cards draw the same strip at card size.
- This game: its own dot, or the bar holding its value, in the this-game
  light blue edged in black, under a small light blue pin at its exact
  value. The pin replaced a full-height light blue line between two black
  edge lines, which the creator could not read. A game past the fence pins
  the axis end.
- The card adds this game's board where the measurement counts something
  on it: the finished board as the game board shows it, drawn with the game
  board's own squares in the player's board style (number display, flag
  style, flag size, flag color strength, mine style), every mine no flag
  covers shown as a mine, sized to fit the card (5 to 20 px a square). Marks
  on its squares show what the measurement counts: a yellow square
  background, a magenta ring, a small magenta dot in a square's corner, and
  for 3BV spread its work points as magenta dots with a magenta circle of
  the spread around their center. A key under the board gives each mark's
  count where the name and value do not already give it:

  | Measurement | Marked | Key |
  | --- | --- | --- |
  | 3BV, and 3BV/s, efficiency, IOE, IOS, STNB, path / 3BV | each opening's squares (yellow), each number outside every opening (ring) | N openings, M numbers outside them |
  | ZiNi, HZiNi, and their efficiencies | the solve's clicks (ring), chords (dot), flags (yellow) | N clicks, N chords, N flags |
  | max number | the squares holding it (yellow) | none |
  | 3BV spread | work points, their spread around the center | N work points, their spread around the center |
  | 0–1 share | 0s and 1s the openings reveal (yellow) | N of S safe squares |
  | zero-opening coverage | squares the openings reveal (yellow) | N of S safe squares |
  | islands | every mine (yellow), so touching groups read as islands | none |
  | largest island | its mines (yellow) | none |
  | zeros | every 0 (yellow) | none |
  | misclick rate | each misclick's square (ring) | N misclicks |
  | no-op rate, board-changing click share | each no-op click's square (ring) | N no-op clicks |
  | unused flag share | each unused flag (yellow) | N unused flags |
  | unflagged mine share | each mine without a flag at the end (yellow) | N of M mines unflagged |

  Time, click rate, fastclick gap, mouse speed, path / click, and cadence
  spread count nothing on the board and have no example. A no-op click
  with no square (outside the board) is counted in the key but not marked.
  The examples need this game's board and trace, so they appear only for
  the game just played or restored, not in the score viewer, and not for
  an Endgame drill, whose measurements cover only its remnant; a trace
  without recorded clicks has the board traits' examples only.
- The 2026-10-08 cut removed example boards from the cards as fluff
  (Hover card, above). These are this game's own board, not a generic
  illustration, so they show the measured thing rather than restating the
  screen ([UI doctrine](ui-doctrine.md), "No fluff in mouseovers").

Linkage to the charts (creator: "this linkage should be very tight and
clear"): each your-perf and board-trait chart heading carries a chip, "this
1.784 · 55%", with this game's value and lifetime standing on the standing
color; its tooltip is the card's rank ("lifetime: 19th of 1,201 wins").
Hovering or focusing a game-data row outlines the charts that plot the same
measurement.

The user intends game data to supersede many other result elements. Label
wording and placement beside the board were settled on 2026-09-23 (above).
Which elements it replaces is deferred ("later"); BACKLOG.md "Game data as
the primary result surface" tracks it.

Autozoom includes every visible point plus 5% of the occupied range (minimum
2 percentage points), rounded outward to 10% ticks and bounded to 0–100%.
An occupied region ending at 43% therefore ends at 50%, never a clipping 40%.
All visible deciles are labeled. Green, white, and red retain their
absolute rank meaning when zooming; a 40% endpoint does not become red.

"show values" (formerly "show actual value") is a saved checkbox in the
options row. It immediately toggles the value column. Values are this
game's measurements, not the aggregate of the chosen comparison pool. Hiding
them changes neither rankings nor the zoom range. Hovering, focusing, or
clicking a row still opens its card.

## One session definition

There is exactly one page-wide setting, `sessionDefinition`, and exactly one
picker for it (user decision 2026-09-23: "there shall only be one session
length picker? i think it should be in the upper left"). Requested behavior,
all implemented the same day:

- **Where the picker is.** In the settings row at the page foot, labeled
  "session", with the rest of the player's global configuration (creator
  2026-10-20: "all usre-specific global configuration should be in the same
  place";
  [Settings row](board-and-layout.md#game-setup-top-bar-settings-row-and-footer)).
  From 2026-10-14 it was in the top bar at the page's upper right (creator
  request: "move the session definition to the upper right fully; there's
  no point to having it as the single only thing in the UL!").
  It reads "session today". The switch cost line's session estimate
  follows it ([Switch cost line](#switch-cost-line-creator-request-and-approval-2026-09-28-under-game-data-since-2026-10-20)).
  From 2026-09-23 to 2026-10-14 it was the value of the "session" heading
  at the top of the left stats panel, removed on 2026-10-20
  ([Session stats](session-stats.md)). The former top-of-board-column
  chooser and the mirrored selectors in session stats, ranks won, and game
  data are removed.
- **Default "today".** Today means back to the most recent local midnight
  (the user: "meaning back in time to midnight the night before"). It does
  not mean the last 24 hours, which stays a separate choice.
- **The other surfaces merely say "session".** Game data's session
  comparisons, its session history, the session summary, and "ranks won in
  session" use the one picked value and carry no picker or window name of
  their own; changing the picker regenerates each in place. The user:
  "Both the latter things should merely say 'session' and the value used
  should be the single one picked in the dropdown!" The session summary's
  and ranks won's help tooltips name the current window and point to the
  picker; game data's no longer do (2026-10-08, Hover card above): the
  picker shows the window.

Saved preferences are stored in full, so a profile saved under the old
last-hour default keeps "last hour" until the picker is changed once.
The former independent recent-placements and played-time window
preferences and Clear-session override are removed.

Choices: last 10/30 minutes, last 1/2/4/24 hours, today, today since 6am, and
last 7 calendar days. Calendar boundaries use local time. The shared
`SessionScope.bounds` and `SessionScope.records` implement inclusive endpoints.
Completed-game comparisons and historical session windows end at that
game's completion, excluding future records; the switch cost line's session
estimate ends at now. The ranks-won summary retains its selected
report/reference date. Endpoints at the cutoff remain eligible.

## Ranking and direction

The graph places each item at `100 × (rank − 1) / (measured count − 1)`: the
share of the other measured games that beat this one. The best in its pool is
0% at the top of the chart and the worst is 100% at the bottom (user decision
2026-09-23, replacing the earlier top-share `100 × rank / count`, whose first
place showed 100/N%: "if my number here was highest the entire session, the
value would be 0%, i.e. I was the best"). Rank 2 of 3 is 50%.
The selected game counts in its comparison population. All measured ties
share mean ordinal ranks except solve-time ties, which retain earlier-finish
order. A constant metric has no preference ordering and is shown neutrally
at 50%. Comparisons require at least two eligible measured games, including
the selected game. With fewer measurements, omit the statistic entirely:
no point, label, "Only one measured game:" section, or replacement notice
(user request 2026-09-26). Apply this per metric and pool, to lifetime,
session, and board-trait comparisons; other eligible rows remain visible.
Missing facts and undefined divisions are excluded, never converted to zero.

Every item's card is listed under "Hover card" above: the chosen pool's
rank, its games on the measurement's axis, and a definition only where the name leaves the measurement open. The worked
calculations, example boards, and percentage arithmetic added earlier on
2026-10-08 were cut the same day as fluff; the 2026-09-26 direction "write
them well without clutter" holds. The side titles' help states the
position formula once. This chart does not estimate correlations or
attribute time to board traits.

Each performance row ranks **this game's** metric against both lifetime and
session history of the same size, mine count, play mode, and generator.
Historical comparisons end at the selected game. A third comparison, time
against wins in the trailing 24 hours, was removed on 2026-10-08 (creator:
"we have sssion, we have alltime. what is this 24hrs? seems unnecessary"):
the session picker's "last 24 hours" choice covers that window.

Right-side markers rank **board values themselves**, not solve times within
matched-trait pools. Background is measured completed boards in the same
category through this game's finish, including measured losses: every such
board so far, or (points switch on session, since 2026-10-08) the session's
boards. Preferred
ends (creator decision 2026-09-23): higher 0–1 share, zero count, max
number, largest island, and zero-opening coverage; lower 3BV,
ZiNi, HZiNi, 3BV spread, and island count. A preferred board opens a lot
from zeros, needs fewer benchmark clicks, and keeps its mines in one dense
clump that can show a high number. These are declared preferences, not
claims about a trait's causal difficulty.
Raw spread/share measurements rank without rounded comparison buckets.
Which traits get markers is chosen in configure (Catalog and configuration,
below), apart from the This board tablecharts since 2026-10-14; until then
each marker followed its tablechart's shown-things switch. The 3BV spread
marker is off by default (user decision 2026-09-23: "i don't think we need
to show 3bv spread by default"), as is largest island.
Binary clue-presence and capped max-number table families do not duplicate
the max number row. Identical time-table memberships do not collapse distinct scalar
traits on this chart. Matching-board solve-time tables remain a separate analysis.

Left-side performance directions: lower time, misclick rate, fastclick
gap, no-op rate, path, cadence spread, unused flag share, and the nine
measurements added 2026-10-20 (Catalog and configuration, below); higher
3BV/s, click rate, the efficiency family, board-changing click share, IOS,
STNB, mouse speed, and unflagged mine share.

## Catalog and configuration

The in-element configuration screen is one column of checkboxes, one per
measurement (2026-10-07; formerly separate session and lifetime columns,
replaced when every row came to show both): each chosen measurement is
compared with both lifetime and the session. An "all performance
measurements" checkbox sets them all; a mixed selection shows an
indeterminate state. Each choice, the plotted pool, distributions mode, and value
visibility persist in the common preference schema and export. A saved
profile's former selections carry over: a measurement either former column
showed stays shown. Back buttons and Escape return to the chart.

Board traits in configure (creator request 2026-10-14: "'configure' below
the distributions list should also let me configure any/all/some board
traits viz status too"; built the same day):

- Under the performance measurements, a "board traits" list has one
  checkbox per trait in the board side's row order: 3BV, ZiNi, max number,
  HZiNi, 3BV spread, 0–1 share, zero-opening coverage, islands, largest
  island, zeros. An "all board traits" checkbox sets them all; a mixed
  selection shows it indeterminate. A trait whose card has a definition
  opens it from its name, as the performance list does.
- Each choice decides whether that trait gets a row on the board-traits
  side, in the band and the distributions alike, and persists in the
  preference schema and export.
- It is its own choice. Until then a trait's row followed its This board
  tablechart's switch (same-3BV, same-ZiNi, and the rest, the board-shape
  switch for islands and zeros, and that and the largest-island switch for
  largest island). Now configure decides what game data ranks, and the
  result-section switches decide only which tables and board-trait charts
  show.
- Defaults are what the switches showed by default: every trait except 3BV
  spread and largest island. A profile saved before 2026-10-14 starts from
  what its own switches showed, so its game data does not change.
- With nothing chosen on either list, the chart says "Nothing chosen to
  rank: choose measurements or board traits with configure." instead of the
  two-game minimum, which would not be the reason.

The configuration tables' column heads ("measurement" or "trait", and
"shown") are 14px over 12px rows, so they outrank the text beneath them.

Defaults (user decision 2026-09-23, from a screenshot of the creator's own
configuration: "the attached image also is the defaults we should show for
leftside"): time, misclick rate, fastclick gap, 3BV/s, click rate, no-op
rate, board-changing click share, mouse speed, and unused flag share; since 2026-10-07
each also compares with the session. Optional:
efficiency, path / 3BV, IOE, ZiNi efficiency, HZiNi efficiency, IOS, STNB,
path / click, cadence spread, and (since 2026-10-20) the nine measurements
below. Before this, both scopes defaulted to time, misclick rate,
fastclick gap, 3BV/s, click rate, efficiency, no-op rate, and path / 3BV.
Preferences are saved in full, so a profile that has saved any preference
keeps its selections; the defaults reach new profiles.

Added 2026-10-10 at the creator's request ("we need some way of tracking and
evaluating a perf stat for 'fraction of mines which never needed to be
marked'"): **unflagged mine share**, on by default, placed after unused flag
share. It is the share of the board's mines with no flag on them when the
game was won: the mine counter at the win divided by the mine count, since
the won board keeps only the player's own flags
([Board chrome](board-and-layout.md)). Higher ranks better: the player
finished while flagging fewer of the mines. A markless win is 100%. The
creator asked for it as a performance measure, so it takes a direction,
unlike flagging volume in general (below). It is derived, never stored, from the
record's flag counters: a flagged cell cannot be opened, so at a win every
standing flag sits on a mine, and `flagsPlaced − flagsRemoved` flags stand.
Every saved win since the removal counter (2026-08-20) is therefore measured
retroactively, as are markless wins since 2026-08-19. Losses, Endgame drills
(their mines outside the remnant were never in play), and wins recorded
before the counters are unmeasured. Its histogram bins one bar per possible
count of unflagged mines (step 1 ÷ the mine count). It also has a your-perf
property chart and a row in the label/value table, and it is the per-game
form of the session endings chart's "percent of mines unflagged when
winning" line (removed with the left panel on 2026-10-20), which derived
each win's share with the same definition. "Never needed" is read as "not
flagged at the win": a flag that no chord used still counts as flagged here,
and unused flag share measures those flags.

Added 2026-10-20, when the left stats panel was removed
([Session stats](session-stats.md)): the creator asked that its per-game
charts, and then everything in it ("same for all, actually"), be optional
rows the player can add or remove in the right-side sections. Nine
measurements joined the catalog, all off by default and all ranking lower
as better:

| Measurement | What it counts | Games |
| --- | --- | --- |
| flag rate | flags placed per second of play; removals do not subtract, and the automatic flags at a win do not count | wins and losses |
| flag-removal rate | flags taken back, per minute | wins and losses |
| unused flag rate | correct flags no chord used, per minute | wins |
| game risk rate | the report's game risk actions, per minute | wins and losses |
| early guess rate | the report's early guesses, per minute | wins and losses |
| time loss rate | the report's time loss actions, per minute | wins and losses |
| life maximization rate | the report's life maximization moves, per minute | wins and losses |
| excess game risk | the game risk actions' extra chance of losing over the safest available move, summed, in percentage points per minute | wins and losses |
| modeled life gap | the expected remaining life the one-move survival model saw given up in life maximization moves, summed, per minute | wins and losses |

The categories are the report's exclusive ones ([Game-end
evaluation](game-end-evaluation.md)), counted whatever the after-game
report's scope shows. A game with any measurement note among its actions (an
older evaluator version, a legacy verdict, a game saved before the ledger)
is unmeasured for the last six rows, never counted as zero. The directions
are declared preferences: a lower flag rate follows unflagged mine share's
preference for flagging fewer mines, a removed flag was wrong or not needed,
and each category is a kind of mistake. Not carried over, by decision: game
loss and deaths with mistakes per minute and "died: likely misclick" (a game
has at most one death, so per game these are yes-or-no facts, which the
session results and the after-game report show), and measurement notes per
minute (old evidence, not performance).

Completion-dependent metrics (time, 3BV/s, efficiency variants, IOS/STNB,
path / 3BV, unused flag share, unflagged mine share, unused flag rate)
compare wins. Observable action/error/timing metrics (misclicks, no-ops,
click rate, fastclick gap, board-changing click share, mouse speed, path /
click, cadence spread, and the other eight added 2026-10-20) compare
measured wins and losses.
Their directional wording describes that metric, not overall player skill.
Faster click/mouse activity is not inherently more efficient; less cadence
spread means more regular timing; unused flags measure observed chord use,
not mental use. Literal double-click speed is not measured by fastclick gap.

Throughput duplicates efficiency, so it is not a second rank. Raw counts,
chording style, context tags, and music have no unambiguous preferred rank
direction; they are not forced onto this good/bad axis. Flag rate ranks only
by the declared preference above and only when the player adds it.

## Historical tracking

`game-data.js` owns the shared metric formulas, metric registry, session
boundaries, ranking, zoom, and paginated historical-window summaries. Saved primary game records remain
the source of truth; no percentile, session ID, or redundant aggregate is
stored. Old records participate wherever the required facts were measured.

"Session history" applies the current global definition at each saved game
finish. Each row shows finish date, wins/games, measured n, median, and middle
50% of the selected metric. These windows overlap and are explicitly labeled;
they are not independent sessions. A median of per-game fastclick medians is
not a pooled press-gap median. Only one requested page (20 windows) is
materialized. A future person-to-person model still needs explicit identity
and belongs in the separate correlation backlog.

## Facts removed from the winning-game block

Retained above the chart: Win/High scores, difficulty/board, mode, generator,
and completion date.

No longer displayed by this replacement (still in saved records or derivable):
- Click count, flags placed, clicks over 3BV, and total path.
- Chord share (activity/style, no preferred ranking direction). Flag rate,
  dropped here for the same reason, returned on 2026-10-20 as an optional
  row with a declared direction (Catalog and configuration).
- Unused-flags absolute count and placed-flag denominator; unused flag share
  keeps the percentage, not those two counts.
- State tags and music-playing status.
- Separate throughput value: the same fact is represented by efficiency.
- When full report scope previously exposed them: raw no-op/misclick counts,
  flag removals/rate, Justice count, guess/life-ledger facts, and report-category
  counts/magnitudes. Their report/trace/session sources are not erased. The
  flag-removal rate and the report categories' rates and magnitudes returned
  on 2026-10-20 as optional rows.

Still available in configuration but off initially: efficiency, path / 3BV,
IOE, ZiNi and HZiNi efficiency, IOS, STNB, path / click, cadence spread, and
the nine measurements added 2026-10-20. This inventory is for the user's next placement
choices; it is not approval to add unrelated ranking directions.

## Switch cost line (creator request and approval 2026-09-28; under game data since 2026-10-20)

Creator request (verbatim): "what about a new type of user perf stat for
"frequency of switching button presses"? i.e. from going between "marking"
mode and "chording" or "clicking"? that swap reaquires some mental work
compared to continuing doing the current action (e.g. mark mark vs mark
chord) etc. maybe explore this statistically and see if you notice
patterns?" The study ([reference/mode-switch-2026-09-28.md](../../reference/mode-switch-2026-09-28.md))
proposed one stat; the creator approved it the same day: "yes let's at lesat
create the perf stat(s) for this and apply, release them,".

Session row (creator request, 2026-10-08, verbatim): "this entire sections
seems weird. the switching stuff should really be made into a normal perf
stat right? once that's done we can think about where this session definition
chooser really belings, right?" Asked "Should I build the session row as
described? I recommend yes.", the creator answered "YES". The four-row
switching section became one row of the session stats.

Under game data (2026-10-20): when the left stats panel was removed, the
creator asked that everything in it be an option in the right-side sections
("same for all, actually"). The recommendation, one optional line under
game data's chart opening the same card, was followed.

- **Where.** One line directly under game data's chart, shown when
  configure's "switch cost, over the session and the latest 500 standard
  games" is checked (`gameDataSwitchCost`, off by default). It shows with
  game data, which appears after wins. Nothing is read while it is switched
  off. It is never shown per game: one game has too few presses to measure
  the cost (split-half reliability of a per-game estimate about 0.05 in the
  study), so every value pools many games.
- **The line.** "switch cost", then each pool's name and estimate: how much
  longer the next press takes after changing buttons, as a signed percent
  such as "+7.4%":
  - **session**: the standard games that ended in the page-wide session
    window ([One session definition](#one-session-definition)), however
    many.
  - **latest 500**: the latest 500 standard games, whenever played.

  A pool with fewer than 30 games, or whose moves cannot separate switching
  from the model's other terms, shows the en dash. The estimates are bold
  and larger than the names, in fixed-width digits; a reply never resizes
  the line.
- **Why "latest 500", not "lifetime".** The long-run pool holds at most the
  latest 500 games, the window approved on 2026-09-28, so "lifetime" would be
  false for any player with more games than that. A true lifetime pool was
  not chosen: every page load would replay every saved trace, a cost that
  grows without limit, and years of old play would outweigh how the hand
  works now.
- **The card.** The label opens it on hover, focus, or click. Per pool:
  95% interval ("+6.4 to +8.4%"); per switch, the same extra time in
  milliseconds at the median press-to-press time of the pooled switches
  ("+18ms"); moves that switch, the share of consecutive moves that change
  buttons ("54%"); and games, the count pooled. Then what the estimate is,
  and which games count, with the 30-game minimum. A pool whose data cannot
  measure it gets one sentence saying so. A reply closes an open card, which
  would otherwise still show the previous values.
- **Games pooled.** Standard games on the three standard boards (Beginner,
  Intermediate, and Expert with Standard play and the default generator)
  that have a saved trace and at least one timed transition. Other play
  modes, custom boards, and other generators stay out: the study measured
  standard play only.
- **Estimate** (the study's pre-registered model P1). A transition is two
  consecutive board inputs that are both moves (reveal, chord, flag) with no
  other input between them, the first not the game-starting reveal, timed
  press to press (a left move by its left press, a flag by its right press)
  and kept when 40 ms to 5 s apart. Least squares on the log interval with
  one intercept per game; terms for the previous and the next move type,
  the button switch, the same-button change between reveal and chord,
  natural cubic splines of travel distance (Fitts index), of the cells the
  previous move opened, and of board progress; whether the previous move
  opened an empty region; whether single-number logic offered the next
  target; and how many chordable numbers, proven-safe cells, and proven
  mines the visible board showed. The interval is cluster-robust by game.
  Spline knots follow patsy's rule (extremes plus equally spaced
  percentiles of the distinct values) with values within 1e-9 counted as
  one, so the value does not depend on how an engine rounds the last bit
  of a distance (the exact rule moved knots between numpy and JavaScript).
- **Updates.** Computed from the saved traces when the line is switched on
  (at page load when it is on), so the existing history counts at once
  without new play; again after each standard game's trace is saved; when
  another session is picked; and, whenever the line is built, if the
  window's start has passed one of the pooled games since the last
  estimate. The line has no timer of its own. Nothing new is stored.
- **Not shown, by decision:** a per-game switch cost or switch index (noise
  at one game), the raw switch rate as a performance measure (it mostly
  restates how often the player flags, and the rate relative to chance did
  not track speed), and breakdowns by direction or distance (in the study,
  not on the page; see [BACKLOG.md](../../BACKLOG.md)).
- **Reading.** The pooled value is a summary, not the cost of every switch:
  in the study the cost sat in moves of one or two cells, vanished at three
  or more, and was about 13 ms for flag and chord pairs, larger where a
  reveal was involved.
- **Superseded forms.** From 2026-09-28 to 2026-10-08, a "switching"
  section of four rows between the session charts and the live rows of the
  left panel, over the latest 500 games only: "switch cost +7.4% (+6.4 to
  +8.4)", "per switch +18ms", "moves that switch 54%", "games 500". From
  2026-10-08 to 2026-10-20, one row of the session stats directly under the
  session heading, in a two-column table under a line naming the columns,
  shown with the session stats and hidden with the collapsed panel.

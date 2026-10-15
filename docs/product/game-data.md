# Game data and the shared session

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/game-data.md](../implementation/game-data.md).

Confirmed and implemented 2026-09-23. This records the user's successive
requirements and clarifications; it supersedes the earlier compact chart draft.

## Position and presentation

For regular wins, game data replaces the scalar statistics grid. It has its
own full-height column between the board column and the details column (user
decision 2026-09-23: "a full-height column right next to the board"). That
column is reserved before the game ends, so the board never moves, and it is
empty during play (user decision: "empty"). Since 2026-10-15 the column
opens with "during this game, second by second", the game just played on its
own clock, and game data follows it (creator: "so it's "during this game
second by second", "your perf totals for this game", then "board traits"";
[During the game](during-game.md)); after a loss that block is all it holds.
When the page cannot fit the column ([Layout: the board never moves](board-and-layout.md) gives the rule),
the chart goes into the details column under the outcome, board size,
mode/generator, and completion date, or into the Game details popover, with
the during-the-game block above it.
It is not repeated among the lower ranking charts. Losses and trial games
retain their scalar statistics because an unfinished board has no completed
solve-time or efficiency rank. High scores uses its latest winning game.

The chart supports only one vertical band: "your performance this game"
(titled "your perf" until 2026-10-15) on the left and "board traits" on the
right. Use Arial typography, white background, and
ordinary controls. The separate "This win" and time caption is removed;
solve time is the "time" row.

Rows and columns (creator review 2026-10-07, built the same day; the creator:
"game-data band is nice", then of the round-2 mockup "your changes to the
vbar for percentiles look great, as does your mouseover distribution. let's
do that!"; revised 2026-10-08, below):

- One row per measurement, in aligned columns: your perf reads name, value,
  session %, lifetime %; board traits read %, name, value. Column heads name
  the performance pools ("session", "lifetime") and "value"; the board
  side's percentage column has no head. The performance side's name column
  is headed by the board's name ("Beginner"), and the board side's name
  column by nothing, so the name appears once (Board name, below). This
  replaced one label per pool
  with "(session)" and "(day)" suffixes, which doubled the left side's labels.
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
  it), then stack board traits under your perf with two columns and then
  one. The band never scrolls: of these layouts it takes the one that needs
  the least shrinking (the earlier one on a tie) and scales its text and
  geometry together to fit its box.

Revision 2026-10-08 (creator, of the band at 2560 px: "top 'game data' -
remove. options - condense top options and bottom options, out of the way.
your perf and board traits - center, each above their side of the viz.
remove 'boards' from right side ... remove the bolding of the numbers - no
point to it", "we should be careful not to allow this part of the UI to gain
any kind of vscroll bar or hscroll bar", and "the mouse shall not change to
the '?' mark"), built the same day:

- No chart heading. The band starts with "your performance this game" and
  "board traits" (Section titles, below), each centered over its own side's
  columns. Each title's help says only
  what its side's percentages are, which nothing else on the panel says:
  the share of the other games (or boards) that ranked better, a tie
  counting as half, 0% the best; for board traits, that better is each
  trait's declared preferred end, not a measured difficulty. Since the cut
  of 2026-10-08 (Hover card, below) it no longer repeats the pools, the
  session window, the points switch, the zoom, or the two-game minimum,
  which the panel itself shows.
- Every chart option sits in one small wrapping row under the data:
  points switch (in distributions mode the sections switch, below, takes
  its place), "show distributions", "show values", "configure", and
  "session history". Configuration and session history keep a "back to
  game data" button at their top and bottom.
- Nothing in the band or the distributions view scrolls, at any panel or
  window size: both scale to fit (below). Configuration and session history
  take their natural height. The container's own scrolling (the game data
  column below 504 px of window height, the details column) is unchanged.
- No help affordance changes the pointer to the question-mark help cursor
  ([UI doctrine](ui-doctrine.md)).

Geometry (layout pass 2026-09-23, after the user found the chart "crushed
and badly displayed" in a fixed 320px column; still current): the chart uses
the whole width of its column, the game data column when docked, otherwise
the fluid details column ([Layout: the board never moves](board-and-layout.md)).
In the game data column it is the column's full viewport height (at least
480px; the column scrolls below that). In the details column it fills the
height left below the setup controls, scores navigation, and outcome
summary, so its bottom controls stay on screen, again at least 480px. The
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
opens it over the band, never reflowing it. In order:

1. The chosen pool's rank, the card's largest text: "lifetime: 19th of
   1,201 wins", "session: tied 3rd–5th of 56 games", or for a constant
   pool "lifetime: all 50 boards have this value". The population word is
   wins, games, or boards.
2. The pool's games on the measurement's axis, its better end on the left
   (since 2026-10-11, below): bars per value range for a
   pool of more than 30 games, one dot per game at its exact value for 30 or
   fewer (touching dots stack), each colored by standing within that pool
   (green better, red worse); the this-game light blue line, edged in
   black, marks this game; the
   lifetime card ticks the session's games under the axis. No key line
   names the marks (removed 2026-10-08, below).
3. Last, a definition, only where the name and unit leave the measurement
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
game's worked calculation, the example boards, the direction sentence (the
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
  at the right, so its card's axis labels descend (3BV/s: 3, 2.5, 2, …);
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
every game. This game and the session's games do not stretch the axis; a
this-game line past the fence sits on that edge. The value column still
shows the untrimmed number. Bar height stays proportional to the count,
except when the tallest bar is at least six times the next: that next bar
is drawn at half the strip and shorter bars keep their ratios to it, so a
point mass (most games at one value) does not flatten every other bar to
a pixel. The tallest bar stays the tallest.

Distributions mode (built 2026-10-07; the creator: "switch distributions
mode is incredible, too!", and "showing both optionally is good. e.g. in the
distribution mode ui there would just be a section for 'session' and another
for 'lifetime'"): the saved "show distributions" checkbox replaces the bar
with one strip per measurement in sections. Each row reads name, value
(when shown), the strip histogram with the same marks as the card, and the
percentage. All strips share one left edge and width across sections, and
a measurement keeps its catalog position in every section. A row's card
shows its own section's pool.

Sections switch and strips that fill the height (creator 2026-10-08, of the
distributions view: "for this ui, i also still want the same ability to
choose to show lifetime/session or both. plus, i want if i remove items
then the remaining ones should expand vertically to fill the space! it's
vital, since that way i can see things more nicely"), built the same day:

- "sections: lifetime | session | both" takes the points switch's place in
  the options row while distributions are shown; saved, default both. Like
  the points switch it applies to your perf and board traits alike: each
  chosen pool gets a your-perf section and a board-traits section, in the
  order your perf against lifetime, your perf against the session, board
  traits against lifetime, board traits against the session. Each
  section's percentage head names its pool, and its title says what it
  compares (Section titles, below). (Until then the view always
  showed your perf against both pools and board traits against lifetime
  only.)
- Only lifetime strips tick the session's games. No key under the strips
  names the marks (removed 2026-10-08, Hover card above). With the
  session alone, measurements without a session rank are listed in the
  band's note above the strips ("Not ranked in this session yet: …")
  instead of vanishing.
- The strips take all the height the rows leave: every strip gets the
  tallest height at which the view still fits its box, so hiding
  measurements (configure) or a pool (the sections switch) makes the
  remaining strips taller. The text keeps its size; only when even 10 px
  strips do not fit does it shrink. The view never scrolls (2026-10-08).
  The bars take the extra height: the axis gap and the 5 px ticks keep
  their size on strips 26 px or taller and shrink in proportion on shorter
  ones.

Board name (creator request 2026-10-15, built the same day): "dosession
timings (in distribution view) include ONLYthat sizze game? i thinkthey
should. e.g. beginner, intermed etc. ) make it clear to users with a subtle
indicator too." They already did: every pool, lifetime and session, on
both sides and in both views, holds only games with this game's board
settings (size and mines, mode, and generator), and a no-mark win's pools
only its no-mark games ([No-mark wins](rankings.md#no-mark-wins-decided-2026-10-14)).
The indicator:

- The board's name as the outcome line gives it: "Beginner",
  "Intermediate", "Expert", or "Custom 20x20-60", once per view (creator
  2026-10-15: "you should not repeat "beginner" above every section too!
  that's bad."). In the distributions view it heads the first section's
  name column; in the band it heads the performance side's name column.
  The other name columns have no head. It is set like the other heads
  (smaller than the title, bold, black), never as a sentence: the cut of
  2026-10-08 removed "so far with these board settings" from the cards as
  fluff (Hover card, above). From its first build until that message it
  followed every section title ("session Beginner", "board traits
  Beginner") and headed both of the band's name columns.
- The band carries it too, though the request named the distributions
  view: both views show the same pools under the same "lifetime" and
  "session" heads.
- Mode and generator are not repeated. They stay on the outcome line beside
  the chart, as in the no-mark list titles ("top expert no-mark times",
  [No-mark wins](rankings.md#no-mark-wins-decided-2026-10-14)), so every
  head stays one line in the narrowest docked column (360 px), whose strip
  column is 100 px wide: "your Intermediate games" already wraps there, and
  the Pregen 10 mode's name alone runs past 80 characters. Open to the
  creator: naming the mode in the heads when it is not Standard.
- With it, the distributions view's section titles, percentage heads, and
  row labels use the pool names, so a no-mark win's sections read
  "no-mark" and "no-mark session" as the band's heads do. Until 2026-10-15
  they read "lifetime" and "session" even there, against the No-mark wins
  rule.

### Section titles (creator 2026-10-15)

"the section labels are wrong. The top which says "session" beginner shoulds
say "your performance this game, within this session"", in the same message
that put "during this game, second by second" above game data and named the
column's order: "during this game second by second", "your perf totals for
this game", then "board traits" ([During the game](during-game.md)). Built
the same day:

- Distributions view: a performance section is titled "your performance
  this game, within this session" or "your performance this game, within
  your lifetime"; a no-mark win's read "within this session's no-mark games"
  and "within your no-mark games". A board-trait section ends with the same
  pool phrase ("board traits, within this session"): with both pools shown
  there are two board-trait sections, and a bare "board traits" over each
  left only the small pool head on the right to tell them apart. The
  creator's message named the section "board traits" while viewing one
  pool; the pool phrase extends that name rather than replacing it.
- The band: "your performance this game" over the performance side (its
  columns name both pools) and "board traits" over the board side.
- A distributions section's title has a line of its own above the column
  heads ("value", "your games", and the pool), and it wraps rather than
  widening the name column: a title that wide would squeeze every strip.

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

- **Where the picker is.** In the top bar at the page's upper right, labeled
  "session" (creator request 2026-10-14: "move the session definition to the
  upper right fully; there's no point to having it as the single only thing
  in the UL!"; [Top bar](board-and-layout.md#layout-the-board-never-moves)).
  It reads "session today" and stays whatever the stats panel shows,
  including when the panel is collapsed or gone. The session stats reflect
  it, including the switch-cost row's session column (2026-10-08). From
  2026-09-23 to 2026-10-14 it was the value of the "session" heading at the
  top of the left stats panel, at the upper left, and kept that panel present
  with session stats off. The former top-of-board-column chooser and the
  mirrored selectors in session stats, ranks won, and game data are removed.
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
Live session stats end at now. Completed-game comparisons and historical
session windows end at that game's completion, excluding future records.
The ranks-won summary retains its selected report/reference date.

This controls the *membership window*. The left panel may still compress
breaks out of its x axis and divide by actual played time. Its running
lookback/raw grouping length, time/game rate basis, and exact-mode/all-modes
choice remain aggregation controls, not competing definitions of session.
Per-time series clip play spans and live events at the shared wall boundary;
backfilled counts are prorated over the original whole-game duration.
Per-game summaries use completed games in the window. Endpoints at the cutoff
remain eligible. Stored and live events cannot leak older activity into a
lookback. Retention covers the largest selectable wall window in every mode.

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
them well without clutter" holds. The side titles' help states the position
formula once. This chart does not estimate correlations or attribute time to
board traits.

Each left-side row ranks **this game's** metric against both lifetime and
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

Left-side performance directions are unchanged: lower time, misclick rate,
fastclick gap, no-op rate, path, cadence spread, and unused flag share;
higher 3BV/s, click rate, the efficiency family, board-changing click share, IOS, STNB,
mouse speed, and unflagged mine share.

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
path / click, and cadence spread. Before this, both scopes defaulted to time, misclick rate,
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
winning" line ([Game-end evaluation](game-end-evaluation.md)), which derives
each win's share with the same definition. "Never needed" is read as "not
flagged at the win": a flag that no chord used still counts as flagged here,
and unused flag share measures those flags.

Completion-dependent metrics (time, 3BV/s, efficiency variants, IOS/STNB,
path / 3BV, unused flag share, unflagged mine share) compare wins. Observable action/error/timing
metrics (misclicks, no-ops, click rate, fastclick gap, board-changing click share, mouse
speed, path / click, cadence spread) compare measured wins and losses.
Their directional wording describes that metric, not overall player skill.
Faster click/mouse activity is not inherently more efficient; less cadence
spread means more regular timing; unused flags measure observed chord use,
not mental use. Literal double-click speed is not measured by fastclick gap.

Throughput duplicates efficiency, so it is not a second rank. Raw counts,
marking/chording style, context tags, and music have no unambiguous preferred
rank direction; they are not forced onto this good/bad axis. Report-only
risk/proof-model magnitudes remain in their explanatory analysis surfaces.

## Historical tracking

`game-data.js` owns the shared metric formulas, metric registry, session
boundaries, ranking, zoom, and paginated historical-window summaries. The
normal stats panel reuses these formulas. Saved primary game records remain
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
- Chord share and flag rate (activity/style, no preferred ranking direction).
- Unused-flags absolute count and placed-flag denominator; unused flag share
  keeps the percentage, not those two counts.
- State tags and music-playing status.
- Separate throughput value: the same fact is represented by efficiency.
- When full report scope previously exposed them: raw no-op/misclick counts,
  flag removals/rate, Justice count, guess/life-ledger facts, and report-category
  counts/magnitudes. Their report/trace/session sources are not erased.

Still available in configuration but off initially: efficiency, path / 3BV,
IOE, ZiNi and HZiNi efficiency, IOS, STNB, path / click, and cadence spread. This inventory is for the user's next placement
choices; it is not approval to add unrelated ranking directions.

# Game data and the shared session

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/game-data.md](../implementation/game-data.md).

Confirmed and implemented 2026-09-23. This records the user's successive
requirements and clarifications; it supersedes the earlier compact chart draft.

## Position and presentation

For regular wins, game data replaces the scalar statistics grid. It has its
own full-height column between the board column and the details column (user
decision 2026-09-23: "a full-height column right next to the board"). That
column is reserved before the game ends, so the board never moves, and it is
empty during play and after losses (user decision: "empty"). When the page
cannot fit it ([Layout: the board never moves](board-and-layout.md) gives the rule),
the chart goes into the details column under the outcome, board size,
mode/generator, and completion date, or into the Game details popover.
It is not repeated among the lower ranking charts. Losses and trial games
retain their scalar statistics because an unfinished board has no completed
solve-time or efficiency rank. High scores uses its latest winning game.

The chart supports only one vertical band: "your perf" on the left and
"board traits" on the right. Use Arial typography, white background, and
ordinary controls. The separate "This win" and time caption is removed;
solve time is the "time" row.

Rows and columns (creator review 2026-10-07, built the same day; the creator:
"game-data band is nice", then of the round-2 mockup "your changes to the
vbar for percentiles look great, as does your mouseover distribution. let's
do that!"; revised 2026-10-08, below):

- One row per measurement, in aligned columns: your perf reads name, value,
  session %, lifetime %; board traits read %, name, value. Column heads name
  the performance pools ("session", "lifetime") and "value"; the board
  side's percentage column has no head. This replaced one label per pool
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

- No chart heading. The band starts with "your perf" and "board traits",
  each centered over its own side's columns. Each title's help says only
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
2. The pool's games on the measurement's axis: bars per value range for a
   pool of more than 30 games, one dot per game at its exact value for 30 or
   fewer (touching dots stack), each colored by standing within that pool
   (green better, red worse); the this-game green line, edged in black,
   marks this game; "better →" or "← better" names the better end; the
   lifetime card ticks the session's games under the axis. No key line
   names the marks (removed 2026-10-08, below).
3. Last, a definition, only where the name and unit leave the measurement
   open, and never opening with its name: misclick rate, fastclick gap,
   click rate, efficiency, no-op rate, correctness, IOE, ZiNi and HZiNi
   efficiency, IOS, STNB, mouse speed, cadence spread, unused flag share,
   and the board traits ZiNi, HZiNi, 3BV spread, 0–1 share, zero-opening
   coverage, islands, and largest island. Time, 3BV/s, path / 3BV, path /
   click, flags no multi-cell chord used, 3BV, max number, and zeros have
   none. The configuration list shows the same definitions.

Removed by the cut (2026-10-08): the name-and-value title, the "This is …"
plain sentence (added earlier the same day in answer to the creator's
"also, things like the mouseover chart for 'time' saying 'this is your time
from start to the win'"), definitions of self-evident measurements, this
game's worked calculation, the example boards, the direction sentence (the
histogram's "better →" stays), the pool descriptions "so far with these
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
the measurement's lifetime axis and bins (extended to include every
session game), so switching modes shows where the session sits in the
lifetime range. A session pool needs two measured games, like any pool;
with fewer, the row has no session point and the note above the band lists
it. A small session (most are) draws one dot per game.

Green on the left or the right (creator question 2026-10-08: "some have
good(green) on left, others on right. I do know the reason for that though
and it makes sense too"): the axis keeps the measurement's own numeric
order, and the card names the better end on the histogram itself instead of
reversing axes for lower-is-better measurements.

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
Continuous measurements keep 36 equal bins. The range is the lifetime range,
trimmed to its 1st–99th percentiles when wider than 60 values, always
including this game and the session's games. Axis labels sit at round
values.

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
  section's percentage head names its pool. (Until then the view always
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

- **Where the picker is.** The picker is the value of the "session" heading
  at the top of the left stats panel, the page's upper-left corner. It reads
  "SESSION today". The session stats in that panel reflect it, including the
  switch-cost row's session column (2026-10-08). The heading
  and its picker stay in every panel state. When the panel is collapsed they
  sit under the "stats ▸" chip. When session stats are switched off the panel
  keeps only this heading. Ranks won and game data still use the session in
  both cases. The former top-of-board-column chooser and the mirrored
  selectors in session stats, ranks won, and game data are removed.
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
Each board-trait marker follows its tablechart's shown-things switch. The
3BV-spread tablechart, and with it the 3BV spread marker, is off by default
(user decision 2026-09-23: "i don't think we need to show 3bv spread by
default").
Binary clue-presence and capped max-number table families do not duplicate
the max number row. Identical time-table memberships do not collapse distinct scalar
traits on this chart. Matching-board solve-time tables remain a separate analysis.

Left-side performance directions are unchanged: lower time, misclick rate,
fastclick gap, no-op rate, path, cadence spread, unused flag share, and flags
no multi-cell chord used;
higher 3BV/s, click rate, the efficiency family, correctness, IOS, STNB,
and mouse speed.

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

Defaults (user decision 2026-09-23, from a screenshot of the creator's own
configuration: "the attached image also is the defaults we should show for
leftside"): time, misclick rate, fastclick gap, 3BV/s, click rate, no-op
rate, correctness, mouse speed, and unused flag share; since 2026-10-07
each also compares with the session. Optional:
efficiency, path / 3BV, IOE, ZiNi efficiency, HZiNi efficiency, IOS, STNB,
path / click, and cadence spread. Before this, both scopes defaulted to time, misclick rate,
fastclick gap, 3BV/s, click rate, efficiency, no-op rate, and path / 3BV.
Preferences are saved in full, so a profile that has saved any preference
keeps its selections; the defaults reach new profiles.

Added 2026-09-27 for the training plan's per-game feedback: **flags no
multi-cell chord used**, on by default in the lifetime scope. It counts a
win's flags standing at the end that no chord opening two or more squares used
(`flagsWithoutMultiCellChord`; each could have been one direct click or
nothing), the per-game form of stage 1's target of 10 or fewer
([Training](training.md)). A saved selection map is laid over the defaults, so
existing profiles see the new metric on and keep every earlier choice.

Completion-dependent metrics (time, 3BV/s, efficiency variants, IOS/STNB,
path / 3BV, unused flag share, flags no multi-cell chord used) compare wins. Observable action/error/timing
metrics (misclicks, no-ops, click rate, fastclick gap, correctness, mouse
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

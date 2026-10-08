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

The chart supports only one vertical band: "game data", "your perf" on the
left, and "board traits" on the right. Use Arial typography, white
background, and ordinary controls. The separate "This win" and time caption
is removed; solve time is the "time" row.

Rows and columns (creator review 2026-10-07, built the same day; the creator:
"game-data band is nice", then of the round-2 mockup "your changes to the
vbar for percentiles look great, as does your mouseover distribution. let's
do that!"):

- One row per measurement, in aligned columns: your perf reads name, value,
  session %, lifetime %; board traits read boards %, name, value. Column
  heads name the pools ("session", "lifetime", "boards") and "value". This
  replaced one label per pool with "(session)" and "(day)" suffixes, which
  doubled the left side's labels.
- Labels are black and uncolored; names are regular weight and values bold,
  so the measured values are the most legible text. Every row is one line.
- The bar carries the color: green (better) through white to red (worse),
  with its decile labels printed inside it in black. Leaders run from each
  row to its exact point on the bar's edge, where a dot marks it.
- "points: lifetime | session" picks which pool places the performance
  dots; board traits always rank against every earlier board. The session
  column appears once any performance row has a session rank.
- Names are the standard names (one name per measurement, creator direction
  2026-10-07): "max number", "zero-opening coverage", "islands", never MN or
  ZOC.
- Responsive: both sides share one row with both percentage columns while
  they fit, then drop the session column (the points switch still offers
  it), then stack board traits under your perf with two columns and then
  one; at the narrowest widths the band scrolls inside its own box.

Geometry (layout pass 2026-09-23, after the user found the chart "crushed
and badly displayed" in a fixed 320px column; still current): the chart uses
the whole width of its column, the game data column when docked, otherwise
the fluid details column ([Layout: the board never moves](board-and-layout.md)).
In the game data column it is the column's full viewport height (at least
480px; the column scrolls below that). In the details column it fills the
height left below the setup controls, scores navigation, and outcome
summary, so its bottom controls stay on screen, again at least 480px. The
bar is 32px wide; rows are fitted to their exact points with minimum
squared displacement, and exact percentile points never move. Text is pure
black on white, including ticks, controls, and disabled buttons.

Hover card (built 2026-10-07): hovering or focusing a row opens a card over
the band, never reflowing it. It shows the measurement and this game's value,
this game's rank in each pool ("18th of 124 wins so far", ties as "tied
3–5th", a constant pool as "all N … equal") with its percentage, the
definition, and a histogram of the lifetime pool on the measurement's own
axis: bars count games per value range and are colored by the mean standing
of their games (green better, red worse), a blue line marks this game, and
ticks mark the session's games.

Distributions mode (built 2026-10-07; the creator: "switch distributions
mode is incredible, too!", and "showing both optionally is good. e.g. in the
distribution mode ui there would just be a section for 'session' and another
for 'lifetime'"): the saved "show distributions" checkbox replaces the bar
with one strip per measurement in sections: lifetime, session, last 24 hours
(time only), and board traits. Each row reads name, value (when shown), the
strip histogram with the same marks as the card, and the percentage. All
strips share one left edge and width across sections, and a measurement
keeps its catalog position in every section.

Linkage to the charts (creator: "this linkage should be very tight and
clear"): each your-perf and board-trait chart heading carries a chip, "this
1.784 · 55%", with this game's value and lifetime standing on the standing
color. Hovering or focusing a game-data row outlines the charts that plot
the same measurement.

The user intends game data to supersede many other result elements. Label
wording and placement beside the board were settled on 2026-09-23 (above).
Which elements it replaces is deferred ("later"); BACKLOG.md "Game data as
the primary result surface" tracks it.

Autozoom includes every visible point plus 5% of the occupied range (minimum
2 percentage points), rounded outward to 10% ticks and bounded to 0–100%.
An occupied region ending at 43% therefore ends at 50%, never a clipping 40%.
All visible deciles are labeled. Green, white, and red retain their
absolute rank meaning when zooming; a 40% endpoint does not become red.

"show actual value" is a saved bottom checkbox. It immediately toggles the
value column. Values are this game's measurements,
not the aggregate of the chosen comparison pool. Hiding them changes neither
rankings nor the zoom range. Hover/focus/click still explains the item.

## One session definition

There is exactly one page-wide setting, `sessionDefinition`, and exactly one
picker for it (user decision 2026-09-23: "there shall only be one session
length picker? i think it should be in the upper left"). Requested behavior,
all implemented the same day:

- **Where the picker is.** The picker is the value of the "session" heading
  at the top of the left stats panel, the page's upper-left corner. It reads
  "SESSION today". The session stats in that panel reflect it. The heading
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
  should be the single one picked in the dropdown!" Their help tooltips
  name the current window and point to the picker.

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
session, day, and board-trait comparisons; other eligible rows remain visible.
Missing facts and undefined divisions are excluded, never converted to zero.

Every item's tooltip has two short parts (user direction 2026-09-26:
"write them well without clutter"). First, the measurement's definition in
one or two plain sentences, the same text the configuration table shows.
Second, one sentence naming the rank, the counted population and window,
the preferred direction, and the resulting position, for example "Rank 3
of 57 wins so far with these board settings. Lower values rank first; 0%
is the best, and this sits at 3.6%." Ties read "Tied for ranks 3–5 of …";
a constant metric reads "All N … have the same value, so it sits at 50%."
The position formula, the tie rules, the pool definition (same size, mines,
mode, and generator, up to this game), and the pools are explained once, in
the chart heading's help, instead of in every item.
This replaced a four-part tooltip that repeated the label and the formula
with a worked calculation. This chart does not estimate correlations or
attribute time to board traits.

Each left-side row ranks **this game's** metric against both lifetime and
session history of the same size, mine count, play mode, and generator.
Time also ranks against wins in the trailing 24 hours, crossing midnight;
that comparison has its own switch, shows in the time card and the
distributions (the 614 px column cannot fit a third percentage column), and
is not the session (whose default, today, starts at local midnight).
Historical comparisons end at the selected game.

Right-side markers rank **board values themselves**, not solve times within
matched-trait pools. Background is measured completed boards in the same
category through this game's finish, including measured losses. Preferred
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
indeterminate state. "also rank time against the last 24 hours" keeps the
day comparison. Each choice, the plotted pool, distributions mode, and value
visibility persist in the common preference schema and export. A saved
profile's former selections carry over: a measurement either former column
showed stays shown. Back buttons and Escape return to the chart.

Defaults (user decision 2026-09-23, from a screenshot of the creator's own
configuration: "the attached image also is the defaults we should show for
leftside"): time, misclick rate, fastclick gap, 3BV/s, click rate, no-op
rate, correctness, mouse speed, and unused flag share, plus the 24-hour time
comparison; since 2026-10-07 each also compares with the session. Optional:
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

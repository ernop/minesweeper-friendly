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
left, and "board traits" on the right. Use Arial typography,
regular-weight 12px labels, white background, ordinary controls, and square
pastel highlights. The separate "This win" and time caption is removed;
solve time is available on "time (life)", "time (session)", and "time (day)".
MN means max number; ZOC means zero-opening coverage, both expanded in help.

Label wording (user decision 2026-09-23). A your-perf label is the
measurement name, this game's value, and then the comparison pool as a
trailing word: "3BV/s 1.600 (session)", "time 44.382s (life)", "time 44.382s
(day)" ("(day)" confirmed over "(24h)" the same day). With values hidden it
reads "3BV/s (session)". The user rejected
leading scope words such as "session 3BV/s" because the label describes this
game's number; the pool word only says what it is ranked against. The
configuration table keeps its "session" and "lifetime" column headings.
Board-trait labels have no pool word.

Layout pass (2026-09-23). The user found the chart "crushed and badly
displayed" in a fixed 320px column, with labels that did not "match" their
points: two-line labels pushed far from their markers along tangled leaders,
and the chart ran below the screen. Geometry now:

- Width: the chart uses the whole width of its column: the game data column
  when docked, otherwise the fluid details column ([Layout: the
  board never moves](board-and-layout.md)).
- Height: in the game data column the chart is the column's full viewport
  height (at least 480px; the column scrolls below that). In the details
  column it fills the height left below the setup controls, scores
  navigation, and outcome summary, so its bottom controls stay on screen,
  again keeping at least 480px. Outside both (test fixtures) it is viewport
  minus 48px. The plot alone scrolls when the configured collection cannot
  fit at readable size.
- Band position: labels are measured at their natural one-line widths. The
  band stays centered while both sides fit, moves toward the narrower side
  when one side needs more room, and only when both sides together exceed the
  width do they share it in proportion to their widest labels and wrap.
  "your perf" and "board traits" align with their label columns and keep one
  line only when that costs no data label its single line.
- The band is 32px wide. Label centers are fitted independently per side to
  minimize squared displacement, using their measured heights plus 2px
  separation. Exact percentile points never move. Labels are 14px from the
  band; displaced labels have explicit leaders, emphasized at 2px stroke
  above 8px displacement. Endpoint padding is only what labels and ticks
  need, not an extra blank region.
- Text is pure black on white, including ticks, the singleton note, controls,
  and disabled buttons (no gray or opacity dimming). Regular-weight Arial:
  "game data" 16px, side headings 14px, labels 12px.

The user intends game data to supersede many other result elements. Label
wording and placement beside the board were settled on 2026-09-23 (above).
Which elements it replaces is deferred ("later"); BACKLOG.md "Game data as
the primary result surface" tracks it.

Autozoom includes every visible point plus 5% of the occupied range (minimum
2 percentage points), rounded outward to 10% ticks and bounded to 0–100%.
An occupied region ending at 43% therefore ends at 50%, never a clipping 40%.
All visible deciles are labeled. Light green, blue, and red retain their
absolute rank meaning when zooming; a 40% endpoint does not become red.

"show actual value" is a saved bottom checkbox. It immediately toggles values
beside all plotted and unranked labels. Values are this game's measurements,
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
- **The other surfaces merely say "session".** Game data's (session)
  comparisons, its session history, and "ranks won in session" use the one
  picked value and carry no picker or window name of their own. The user:
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
at 50%. A singleton has no comparative point and is listed separately.
Missing facts and undefined divisions are excluded, never converted to zero.

Every item's tooltip states the actual ranked quantity, preferred direction,
comparison scope, eligible outcomes and measured count, tie rule, formula,
and resulting position (or singleton/constant exception). This chart does
not estimate correlations or attribute time to board traits.

Each left-side marker ranks **this game's** metric against either lifetime
or session history of the same size, mine count, play mode, and generator.
Lifetime and session markers are independently configurable. "time (day)"
ranks this solve time against wins in the trailing 24 hours, crossing midnight;
it has its own switch and is not the session (whose default, today, starts at
local midnight). Historical comparisons end at the selected game.

Right-side markers rank **board values themselves**, not solve times within
matched-trait pools. Background is measured completed boards in the same
category through this game's finish, including measured losses. The user's
preferred directions are higher 0–1 share and zero count; lower islands,
ZOC, 3BV, and MN. ZiNi, HZiNi, spread, and largest island also default lower.
These are declared preferences, not claims about a trait's causal difficulty.
Raw spread/share measurements rank without rounded comparison buckets.
Each board-trait marker follows its tablechart's shown-things switch. The
3BV-spread tablechart, and with it the 3BV spread marker, is off by default
(user decision 2026-09-23: "i don't think we need to show 3bv spread by
default").
Binary clue-presence and capped-MN table families do not duplicate the MN
marker. Identical time-table memberships do not collapse distinct scalar
traits on this chart. Matching-board solve-time tables remain a separate analysis.

## Catalog and configuration

The in-element configuration screen has measurement names plus **session**
and **lifetime** checkbox columns. Column checkboxes set all metrics in that
scope; an "all performance metrics" checkbox sets both. Mixed selections
show an indeterminate state. Each individual choice, day-time visibility,
and value visibility persist in the common preference schema and export.
Back buttons and Escape return to the chart.

Defaults (user decision 2026-09-23, from a screenshot of the creator's own
configuration: "the attached image also is the defaults we should show for
leftside"): lifetime comparisons for time, misclick rate, fastclick gap, 3BV/s,
click rate, no-op rate, correctness, mouse speed, and unused mark share, plus
time (day); no session comparisons. Optional in either scope: efficiency,
path / 3BV, IOE, ZiNi efficiency, HZiNi efficiency, IOS, STNB, path / click,
and cadence spread. Before this, both scopes defaulted to time, misclick rate,
fastclick gap, 3BV/s, click rate, efficiency, no-op rate, and path / 3BV.
Preferences are saved in full, so a profile that has saved any preference
keeps its selections; the defaults reach new profiles.

Completion-dependent metrics (time, 3BV/s, efficiency variants, IOS/STNB,
path / 3BV, unused mark share) compare wins. Observable action/error/timing
metrics (misclicks, no-ops, click rate, fastclick gap, correctness, mouse
speed, path / click, cadence spread) compare measured wins and losses.
Their directional wording describes that metric, not overall player skill.
Faster click/mouse activity is not inherently more efficient; less cadence
spread means more regular timing; unused marks measure observed chord use,
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
- Click count, flags placed, clicks over 3BV, and total mouse path.
- Chord share and mark rate (activity/style, no preferred ranking direction).
- Unused-marks absolute count and placed-mark denominator; optional unused
  mark share keeps the percentage, not those two counts.
- State tags and music-playing status.
- Separate throughput value: the same fact is represented by efficiency.
- When full report scope previously exposed them: raw no-op/misclick counts,
  flag removals/rate, Justice count, guess/life-ledger facts, and report-category
  counts/magnitudes. Their report/trace/session sources are not erased.

Still available in configuration but off initially: efficiency, path / 3BV,
IOE, ZiNi and HZiNi efficiency, IOS, STNB, path / click, cadence spread, and
every session comparison. This inventory is for the user's next placement
choices; it is not approval to add unrelated ranking directions.

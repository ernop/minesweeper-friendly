# minesweeper-friendly — Product & UI Decisions

Canonical record of every product and UI decision made to date (2026-08-19
session). If behavior and this file disagree, one of them is a bug: fix the
code or fix this file in the same change. Implementation notes (function and
key names) live in `agents.md`; player-facing pitch in `promo/PROMO.md`.

## Product goals

- Start from a faithful clone of minesweeper.online's standard mode: same
  mechanics, same classic-Windows look.
- Grow toward friendlier variants (no-guess and beyond; the design axis is
  mapped in `agents.md`). Not yet implemented.
- A playable version is always live at
  https://ernop.github.io/minesweeper-friendly/ — the public repo redeploys
  GitHub Pages on every push. The page links back to the repo via a subtle
  footer.
- Default difficulty is Beginner.

## Board and chrome

- Classic Windows minesweeper skin; every icon is inline SVG; no
  dependencies, no build step.
- Cell numbers use a chunky face (Arial Black stack); the classic
  number-color palette (1 blue, 2 green, 3 red, ...).
- The status button is a dove (symbol of peace and kindness), not a smiley:
  idle; startled flap while a cell is pressed; olive branch on win; broken
  heart on loss.
- Clicking anywhere in the titlebar (the whole top panel, not just the
  dove) restarts. Space bar also restarts, except when focus is in an
  input, textarea, button, or link.
- LCD counters are red seven-segment with visible gaps between digits (the
  digits must not crowd together).
- Zoom control: 16-32 px cell sizes.
- Mechanics: first click never a mine; flood fill; right-click flags;
  left-click chording with press preview; win auto-flags remaining mines;
  loss shows the red hit cell and crossed-out wrong flags.

## Layout: the board never moves

- The board is the anchor. Nothing that appears or disappears may shift it,
  ever.
- The win summary (three lines: outcome, mode, end date-time) + stats table
  are the ONLY things on the board's row: absolutely positioned at the far
  right of the row (right edge pinned near the viewport's, 2026-08-20),
  vertically centered against the frame, 320px wide. They appear and
  disappear without occupying layout space.
- Everything else (rank lists, rankaverages, streaks, scatter plots) sits
  below the board in normal flow.
- The scrollbar gutter is always reserved so a tall results area cannot
  change the viewport width and nudge the centered board.
- The results area echoes the in-game numeral face (Arial Black stack).

## Measurement purpose (decided 2026-08-20)

The point of all per-game measurement — the scalar stats, the raw input
traces, the states tags — is to detect and characterize differences
within one changing player, on every timescale at once:

- minute by minute, as they warm up within a session;
- day by day, as they learn, or are tired, sick, brain-fogged, have or
  haven't exercised, and everything else the states tags can name;
- month by month, year by year, decade by decade, to characterize
  learning curves, aging, recovery, and overall health.

Anything minesweeper data might relate to in that concern is in scope.
This is why measurements favor completeness over compactness, why raw
traces are kept (a metric invented years from now must be computable over
today's games), and why spent effort is never dropped (see the
measurement principle in reference/mouse-motion-metrics.md).

## Per-game stats

Recorded per finished game, win or loss, primary measurements only: end
date, outcome, time (ms precision, shown as seconds to 3 decimals), 3BV,
clicks, wasted clicks, flags placed, flags removed, mouse path (px of
cursor travel, accumulated only while the game is in progress). The stored click count includes only
clicks that changed the board (reveals, flags, chords). Everything else is
derived at display time: 3BV/s (4 decimals), clicks over 3BV (clicks minus
3BV; wins only — a lost board was never finished, so the subtraction means
nothing), efficiency %, mouse speed (px/s), path per click, path per 3BV.
Shown as a label/value table for wins and losses alike; a loss shows no
rank output at all (losses split win streaks and feed lifetime totals, but
are not ranked).

Wasted clicks — board clicks that changed nothing (chord attempts on
unsatisfied or empty numbers, left-clicks on flagged cells, right-clicks
on revealed cells) — joined the record schema on 2026-08-19 (decided
2026-08-19: tolerate absence going forward). Games recorded before the
measurement existed simply lack the field: absence means "not measured"
and is valid on import (a present value must be a number); displays that
need the value use only records that carry it. Every game recorded from
now on has it.

Flags placed — how many flags the player set during the game (removing a
flag doesn't subtract; the auto-flagging of remaining mines on a win is
not the player's doing and is not counted) — joined the schema on
2026-08-19 under the same absence rules as wasted clicks. A game with
zero flags placed holds the special status "markless": the stats table's
"Flags placed" row reads "0 - markless", and wherever an individual game's
time appears in a table chart (rank-list time cells, the stats table's
Time row) a small olive-green "(m)" precedes it. Aggregate times
(rankaverage group averages, delta rows) carry no marker, since they mix
games. Records from before the
measurement never claim the status, since for them it is unknown.

Flags removed — how many flags the player took back — joined the schema
on 2026-08-20 under the same absence rules. This is the second kind of
waste, distinct from wasted clicks: the place and the remove each changed
the board (both count as effective clicks, and the placement still counts
in flags placed), but the pair netted nothing, so every removal marks 2
clicks of retracted work. It is kept as its own measurement rather than
folded into wasted clicks because the two wastes mean different things —
a wasted click is a motor slip (clicking where nothing can happen), a
removed flag is a changed mind.

States — the player's state tags active at the moment the game finished
(see "Player states" below) — joined the schema on 2026-08-20. Every game
recorded from now on carries the field (an empty list when nothing was
active); games from before it existed lack it, same absence rules as
wasted clicks. The stats table shows a "States" row only when the game
carries at least one tag.

## Player states

- The player keeps a personal list of state tags describing their
  situation — sleepiness, mood, hardware ("bad mouse"), location — so
  they can later correlate life circumstances with results.
- Only ACTIVE states are visible. Each shows as a chip (the me-row
  highlight: bold black on light blue, with a trailing x); clicking a
  chip takes the state off. An untagged session shows nothing but one
  small "+ state" button, which carries a hover tooltip explaining the
  feature.
- The "+ state" button opens a menu of the inactive options: clicking a
  name puts it on (and closes the menu). The menu also manages the list
  itself: an x beside each option deletes it outright, and a text field
  at the bottom creates a new state — a created state goes on
  immediately, since typing it mid-session means "I am in this state
  now". Duplicate or empty names are refused with a visible message.
- A new player's menu offers three suggested options: sleepy, just woke
  up, inebriated — none active.
- The active set is stamped onto each game record at the moment it
  finishes (win or loss).
- Editing the list never touches past games: records keep exactly the
  states they were stamped with, even if a state is later removed.
- The states panel sits in the screen's upper-right corner (2026-08-20;
  it previously hung off the board's left edge), sharing a fixed cluster
  with the settings button. Fixed to the viewport, it occupies no layout
  space — using it never moves the board — and stays visible while
  scrolling the charts.

## Rank lists (time windows and day categories)

- Windows, all in the viewer's local timezone: lifetime; "in <year>"
  (calendar year); "in the last year" (rolling: starts at the end of the
  day exactly 365 days ago); "this month" (calendar); "past week" (midnight
  6 days back); "today" (since last local midnight); past hour / 15 min /
  5 min / 1 min (rolling).
- Day categories: "on <weekday>s" (today's weekday), "on weekends" or "on
  weekdays" (whichever today is), "on holidays" (US federal, only when
  today is one).
- Progressive disclosure: when several lists would contain the exact same
  set of scores, only the most specific renders (specificity: narrow
  windows, then day categories, then broad windows). A brand-new player
  sees a single chart; broader ones appear as history spreads out. This is
  the `collapseDuplicateCharts` setting (see Personal settings), on by
  default; switched off, every window always renders its own chart.
- Also one non-window list: "3BV N" — every win
  whose board had exactly this game's 3BV, the fairest time comparison
  (2026-08-20). Same row format as the window lists.
- Row format: rank, time, relative age. Headings carry only the window
  name; the rank fraction lives in the chart itself — your row's "#x"
  plus an "of N" footer line, shown only when rows are actually cut off
  below (if the last row is visible the end is already in view). The
  footer line always occupies its height, blank when unneeded, so its
  appearing can never resize a chart (2026-08-20).
- Windowing: always the full 11 rows when the list has them. If your rank
  is within the top 11, the list anchors at #1 and shows the top 11 with
  your row in its true place (a #8 placement draws #1-#11, never #3-#13).
  Otherwise the window centers on you — 5 above, 5 below — sliding upward
  near the bottom so the budget still fills (a constant row count also
  keeps chart heights stable across rankaverage re-sorts, 2026-08-20).
- Every list always renders its full window at full opacity, wherever the
  placement falls: a mediocre rank still shows its 5 neighbors either side,
  because the placement itself is fresh information. (This replaced the
  earned-detail collapse, which greyed non-top placements to a single row.)

## Relative age display

- Largest sensible unit, abbreviated, no "ago": s, m, h, d, w, mo, y.
- A 0-second age renders as "this" (the game that just finished), spanning
  the age columns, right-aligned so its right edge is flush with the other
  rows' age labels (2026-08-20; replaced the left-aligned "just now").
- The age (count + unit) is color-coded by unit: s = hyper-fluorescent
  green (#39ff14, always bolded — too light to read at normal weight);
  then the board-number palette: m = green, h = blue (the "1" blue),
  d = red (the game red), w = navy, mo = maroon, y = teal.
- Your own row is bolded on a tasteful light-blue highlight (#d8ebfa),
  with text overridden to black for readability (unit colors would be
  unreadable on the highlight).

## Rankaverage charts

- One per grouping stat: efficiency (exact %), clicks (exact), 3BV (exact),
  3BV/s (0.01 buckets), mouse path (100px buckets), mouse speed (10px/s
  buckets). There are NO separate rankcount charts and no exact-match
  "same 3BV/clicks/efficiency" columns — the rankaverage's x-count column
  and value grouping cover those.
- Row format: rank, grouped value, that group's average solve time, win
  count in the group. Ranked best (lowest) average first. The count is
  written with a trailing multiplication sign ("12x") and right-aligned,
  so ones/tens/hundreds places line up down the column.
- No chart title: a header row of clickable column names does the naming,
  with the value column's header carrying the stat name at heading size
  and weight while its neighbors ("#", "avg", "count") stay pale
  (2026-08-20).
- Sortable (2026-08-20): clicking a column header cycles ascending (▴),
  descending (▾), then back to the natural rank order. Sorting only
  reorders rows — every row keeps its true by-average rank number — and
  the window stays centered on this game's bucket. The chosen order
  persists per chart (userdata `rankavgSort`, entries {key, dir},
  absent = natural) and every comparator ends in a
  deterministic tie-break, so a given history always renders the same way.
  Re-sorting freezes the chart at its pre-click width so reordering never
  reflows the charts around it.
- Delta row, minimal text only: how this win moved its own group's
  average. Because the delta is a time, it renders as the chart's last
  grid row with its text in the average-time column, exactly aligned
  under the times above it. The SIGN is the true numeric direction of the
  average time ("-0.024s" = it fell, "+0.462s" = it rose); the COLOR is
  the judgment: green = good (average fell), red = bad (rose), gray "=" =
  unchanged at display precision (a shift rounding to 0.000s is never
  "worsened"), blue "new" = first game in that group. Green always means
  good, red always means bad.

## Streak lists

- Three lists: "streak" (0 losses), "near-streak" (1 loss ok),
  "near-near-streak" (2 losses ok) — headings carry just these names, no
  parenthetical (2026-08-20). A k-loss streak is k+1 adjacent win-runs
  joined.
- No double counting: candidate windows are trimmed to their non-empty
  core; identical cores dedupe; a core strictly inside a wider core is
  dropped (consecutive losses otherwise re-list sub-streaks). Two streaks
  that merely overlap across different losses are both real and both stay.
- Ranked by length, then recency. Row: rank, "N wins", relative age of the
  streak's last win. The streak ending in this win is your row.

## Scatter plots

- At the very bottom, ten plots, grouped time-trend first, then board,
  then mouse: win time vs date (local date/time x-axis: minute-to-day
  calendar ticks, HH:mm labels below a day step, M/D above), win time vs
  hour of day (0-24 local), 3BV vs time, clicks vs 3BV (with the y = x
  floor drawn as a dashed line — a game on the line used only the board's
  minimum clicks), wasted clicks vs 3BV/s (only wins carrying the
  wastedClicks measurement; appears once at least 2 do), mouse path vs
  time, mouse speed vs time, mouse speed vs efficiency, path per click vs
  efficiency, path per 3BV vs time. Requires at least 2 wins.
- Every win is a dot colored by its relative-age unit, reusing the age
  palette (seconds = fluorescent green, minutes = green, hours = blue,
  days = red, weeks = navy, months = maroon, years = teal), so time
  trends are scannable at a glance. Within its unit color each dot also
  fades with age — full opacity on entering the unit down to 30% at its
  far edge, so a 6-day-old red dot is visibly paler than a 1-day-old one
  (2026-08-20). A shared legend below the plots spells out the mapping.
- The just-finished game is a larger black-ringed dot (colored like the
  rest, i.e. fluorescent green since it is seconds old) tagged with its
  rank among today's wins ("#N today"); the tag flips to the left when
  the dot is near the right edge.
- No chart titles (2026-08-20): the axis labels name the chart. Labels
  are terse — one or two words, no units or asides ("→ time", "→ 3BV",
  "→ mouse speed"); the tick values carry the scale. The two time charts
  are labeled "date" (calendar spread) and "time of day" (all wins folded
  onto one 24-hour clock).
- Both axes carry real scales: tick labels at nice 1/2/5-step intervals
  with light gridlines. Ticks and axis labels render at heading size
  (12px bold, 2026-08-20), so the x axis caps at 6 ticks (5 on the date
  axis, whose HH:mm labels are widest) while y takes up to 7.

## Storage (decided 2026-08-20)

- All persistent data lives in one IndexedDB database
  (`minesweeper-friendly`, version 2) with two stores: `userdata` (play
  history, settings, rankaverage sort preferences, player states — one
  entry per kind) and `traces` (one entry per finished game).
- Userdata is RAM-first: every kind is read into RAM once at startup, all
  reads and mutations work on the RAM copy synchronously, and each
  mutation immediately persists that kind's whole RAM object with an
  async fire-and-forget write. Everything the player sees is rendered
  from RAM; nothing waits on the disk. Keeping all userdata in RAM is
  fine because scalar records are tiny — revisit only if that ever stops
  being true. Traces are far too large for RAM and are written straight
  to their store (see Raw input traces).
- A failure to open the database or to persist anything is announced in
  the backup status line and thrown — never tolerated silently.
- Before 2026-08-20 the userdata lived in localStorage; the version-2
  database upgrade carries those keys over exactly once and then removes
  them, so existing players (including on the public GitHub Pages origin)
  keep their history without doing anything.

## Raw input traces (decided 2026-08-20)

- Every finished game (win and loss) keeps its complete input stream as
  the ground truth behind all motion metrics: cursor samples (relative ms
  timestamp, x, y for every mousemove), button events ('ldown'/'lup'/
  'rdown' with position and the board cell index hit, or null for a press
  released off the cells), and layout events (the board's bounding rect
  and dimensions, re-recorded on scroll, resize, and zoom, so every
  sample maps to a board cell forever).
- A trace runs from board creation to finish: pre-first-click movement is
  warmup and is real data, so capture covers the ready state, not just
  play. Post-game movement belongs to no game and is not captured.
  Abandoned boards (restarted mid-game) produce no record and no trace.
- Sample timestamps are strictly increasing, by construction (decided
  2026-08-20): browsers reduce performance.now() precision (Chromium
  quantizes to ~100µs), so two mousemove events can read the same
  timestamp. Such events are one sample — the latest position at that
  instant — because at the timer's resolution the two positions are not
  ordered in time, and a zero time step would put Infinity into every
  rate computed from the trace. Every consumer (the metrics panel, the
  offline extractors) may rely on this invariant.
- Traces live in their own store (`traces`, keyed by endedAt exactly like
  history records; see Storage) and are never held in RAM — they are far
  too large for that. Nothing is pruned.
- Scalar record fields are summaries; the trace is what lets any future
  metric be computed over past games retroactively. Failure to capture or
  save a trace is announced visibly and thrown, never tolerated.
- An "export traces" button beside the backup controls downloads all
  traces as one JSON file (download only — far too large for the
  clipboard) for the offline analysis pipelines under `analysis/`.
- Recording overhead, measured 2026-08-20: ~100ns per mousemove event and
  <0.5ms of typed-array conversion at save time — imperceptible.

## Trace metrics panel (decided 2026-08-20; vertical with sparklines
## later the same day, replacing the first bottom-strip form; live/final
## split into panel/bottom-charts with settings later still)

- The session-level mouse-dynamics features are computed in-page from the
  trace and shown both live and canonically, in two places:
  - LIVE (the panel): while a trace runs (board shown through game end),
    a vertical panel fixed to the left edge recomputes once a second over
    the samples so far, marked "live" in grey. Live numbers are transient
    readings of an unfinished trace. The panel is the live display only;
    it goes away when the game finishes.
  - FINAL (the after-game charts): the moment a game finishes, the same
    computation runs once over the complete trace, and each metric
    renders as a larger chart inline at the page bottom, after whatever
    other bottom charts the outcome produced (rank lists and scatters for
    a win, nothing else for a loss — motion existed either way). These
    are the canonical values: same code as live, complete data, and the
    same wall-time definition the stored trace carries
    (endedAt - startedAt) — live and final can never disagree in
    definition, only in how much of the game they saw.
- Two settings govern the two stages (see Personal settings; both default
  on): "show motion stats during game" (the live panel) and "show motion
  stats after game ends" (the bottom charts). Toggling either applies
  immediately — the panel updates mid-game, the bottom charts appear or
  vanish on the shown result. Finer stage-by-stage configurability of
  what is shown when is planned, not built.
- The live panel also carries its own small × toggler in its top-right:
  clicking it tucks the panel down to a "motion ▸" chip in the same
  corner, and the chip click brings it back. This is session-only
  display state — the persistent switch is the setting.
- One row per metric: the name, the current value, and a sparkline chart
  of the value's evolution over this game (one point per live recompute
  plus the final one). The sparkline carries labeled axes: y is the
  series min and max (a flat series draws mid-chart but labels its true
  value — the padding is chart geometry, not data), x runs 0 to the
  elapsed seconds. Spans where the value was not yet measurable are gaps
  in the line, never bridged. The after-game charts are the same rows at
  chart size (230x130 vs the panel's 150x46).
- The metrics, top to bottom (each row carries its definition as a hover
  tooltip): strokes (movement bouts; a pause of 100ms or more separates
  bouts), moving (time the cursor spent in motion), silence (share of the
  game with the cursor still), path (total cursor travel in the trace),
  speed (mean of per-stroke mean speeds), peak speed (fastest
  sample-to-sample speed), straightness (chord/path per stroke, mean),
  jerk (mean |da/dt|, px/ms³), turn rate (mean |heading change|, rad/ms),
  left clicks, right clicks, hold (mean button-down time),
  pause-and-click (mean stillness before a press).
- The definitions are exactly those of the offline extractor
  (`analysis/biometrics/extract_features.py`, sources cited there); the
  two implementations are kept in step by a parity harness that compares
  them on the checked-in synthetic trace (see agents.md). A number on the
  panel means exactly what the offline pipeline would compute.
- A value whose formula needs more data than the trace has yet (no
  strokes, no completed click, zero wall time) shows as an en dash with a
  "not yet measurable" tooltip — never a made-up zero.
- The panel is display only: nothing new is stored. The trace remains the
  ground truth, per-game scalar records are unchanged, and the panel's
  values are recomputable from the stored trace forever.
- The panel is fixed-positioned (it never moves the board) and scrolls
  itself when the viewport is shorter than its rows.

## Personal settings (decided 2026-08-20)

- A schema-driven settings system for player-facing behavior switches:
  `SETTINGS_SCHEMA` is the single definition (field, default, validity,
  label, description); the loader, the import validator, the settings
  panel UI, and the data-format card all derive from it. Named "settings",
  never "config" — that word is the board parameters.
- Stored beside the history (userdata `settings`; see Storage). Absent
  entry or absent field = the default (the player never changed it);
  nothing is persisted until they do.
- Exports carry the block under the reserved top-level `"settings"` key
  (it can never collide with a mode key, which is always WxH/M); importing
  a blob applies its settings after validation. Exports from before
  2026-08-20 simply lack the key.
- A "settings" button in the screen's upper-right corner (the fixed
  cluster it shares with the states tags, 2026-08-20; it debuted among the
  backup controls earlier that day) opens the panel as a small in-page
  dropdown right below — never a modal, so the page stays fully visible
  and interactive. One checkbox per switch with its full description; a
  change saves immediately and re-renders the result on screen, so the
  player watches the meaning of the change while the panel stays open.
- Settings so far: `collapseDuplicateCharts` (default on) — the rank
  lists' progressive disclosure switch (see Rank lists);
  `showMotionStatsDuringGame` and `showMotionStatsAfterGame` (both
  default on) — the two stages of the trace metrics display (see Trace
  metrics panel).

## Play history and backup

- Every finished game (win and loss) is kept forever (userdata `history`;
  see Storage), grouped by mode; nothing is pruned. A mode is identified
  by its board parameters (e.g. `9x9/10`), never by its display name.
- Export/import as a JSON map of mode to game records, plus the reserved
  `"settings"` key (see Personal settings): copy to clipboard, save to
  file, paste in, or open from file — subtle controls out of the way of
  play. The blob is validated in full — settings included — before
  anything is written; a malformed blob imports nothing and says why.
  Records dedupe by end timestamp, so repeated imports are no-ops.
- A "data format" button beside the backup controls raises a reference
  card: the export's overall shape (the settings block plus one mode-keyed
  list per board) and a field-by-field table of the per-game record fields
  with example values and units, plus the note that every other displayed
  stat is derived from them at display time. The card is generated from
  the same field definitions the importer validates against, so it cannot
  lie about the real format.

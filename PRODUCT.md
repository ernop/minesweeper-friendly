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
  are the ONLY things beside the board: absolutely positioned to the right,
  vertically centered against the frame, 320px wide. They appear and
  disappear without occupying layout space.
- Everything else (rank lists, rankaverages, streaks, scatter plots) sits
  below the board in normal flow.
- The scrollbar gutter is always reserved so a tall results area cannot
  change the viewport width and nudge the centered board.
- The results area echoes the in-game numeral face (Arial Black stack).

## Per-game stats

Recorded per finished game, win or loss, primary measurements only: end
date, outcome, time (ms precision, shown as seconds to 3 decimals), 3BV,
clicks, mouse path (px of cursor travel, accumulated only while the game is
in progress). Everything else is derived at display time: 3BV/s (4
decimals), efficiency %, mouse speed (px/s), path per click, path per 3BV.
Shown as a label/value table for wins and losses alike; a loss shows no
rank output at all (losses split win streaks and feed lifetime totals, but
are not ranked).

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
  sees a single chart; broader ones appear as history spreads out.
- Row format: rank, time, relative age.
- Windowing: 11 rows max. If your rank is within the top 11, the list
  anchors at #1 and shows the top 11 with your row in its true place
  (a #8 placement draws #1-#11, never #3-#13). Only when #1 is out of
  reach does the window center on you: 5 nearest faster and 5 nearest
  slower entries.
- Every list always renders its full window at full opacity, wherever the
  placement falls: a mediocre rank still shows its 5 neighbors either side,
  because the placement itself is fresh information. (This replaced the
  earned-detail collapse, which greyed non-top placements to a single row.)

## Relative age display

- Largest sensible unit, abbreviated, no "ago": s, m, h, d, w, mo, y.
- A 0-second age renders as "just now", left-aligned, spanning the age
  columns.
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

- Three lists: streak (0 losses), near-streak (1 loss ok), near-near-streak
  (2 losses ok). A k-loss streak is k+1 adjacent win-runs joined.
- No double counting: candidate windows are trimmed to their non-empty
  core; identical cores dedupe; a core strictly inside a wider core is
  dropped (consecutive losses otherwise re-list sub-streaks). Two streaks
  that merely overlap across different losses are both real and both stay.
- Ranked by length, then recency. Row: rank, "N wins", relative age of the
  streak's last win. The streak ending in this win is your row.

## Scatter plots

- At the very bottom, three plots relating derived mouse metrics to
  outcomes: mouse speed vs time, path per click vs efficiency, path per
  3BV vs time. Requires at least 2 wins.
- Every win is a dot colored by its relative-age unit, reusing the age
  palette (seconds = fluorescent green, minutes = green, hours = blue,
  days = red, weeks = navy, months = maroon, years = teal), so time
  trends are scannable at a glance. A shared legend below the plots
  spells out the mapping.
- The just-finished game is a larger black-ringed dot (colored like the
  rest, i.e. fluorescent green since it is seconds old) tagged with its
  rank among today's wins ("#N today"); the tag flips to the left when
  the dot is near the right edge.
- Both axes carry real scales: tick labels at nice 1/2/5-step intervals
  (up to 7) with light gridlines, plus a spelled-out axis label naming
  the metric and unit on the chart itself ("→ mouse speed (px/s)" under
  the x axis, and the same form rotated along the y axis).

## Play history and backup

- Every finished game (win and loss) is kept forever in localStorage,
  grouped by mode; nothing is pruned. A mode is identified by its board
  parameters (e.g. `9x9/10`), never by its display name.
- Export/import as a JSON map of mode to game records: copy to clipboard,
  save to file, paste in, or open from file — subtle controls out of the
  way of play. The blob is validated in full before anything is written;
  a malformed blob imports nothing and says why. Records dedupe by end
  timestamp, so repeated imports are no-ops.

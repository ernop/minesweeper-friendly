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
- The win summary line + stats table are the ONLY things beside the board:
  absolutely positioned to the right, vertically centered against the
  frame, 320px wide (wide enough that the summary stays on one line). They
  appear and disappear without occupying layout space.
- Everything else (rank lists, rankaverages, streaks, scatter plots) sits
  below the board in normal flow.
- The scrollbar gutter is always reserved so a tall results area cannot
  change the viewport width and nudge the centered board.
- The results area echoes the in-game numeral face (Arial Black stack).

## Per-game stats

Recorded per win: date, time (ms precision, shown as seconds to 3
decimals), 3BV, 3BV/s (4 decimals), clicks, efficiency %, mouse path (px of
cursor travel, accumulated only while the game is in progress). Derived at
display time: mouse speed (px/s), path per click, path per 3BV. Shown as a
label/value table. Losses are recorded as bare timestamps, used only to
split win streaks; a loss shows no rank output at all.

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
- Windowing: 11 rows max — 5 above and 5 below your row; when 1st place is
  within the 5 above, anchor at the top and grow downward instead.
- Earned detail: the full window renders only when your placement is in
  the numerical top 10 OR within 10% of the best entry's value (time for
  score lists, bucket average for rankaverages, length for streaks).
  Otherwise the list collapses to its heading plus your own row, greyed to
  45% opacity with no bold or highlight. A #60-of-70 game shows almost
  nothing.

## Relative age display

- Largest sensible unit, abbreviated, no "ago": s, m, h, d, w, mo, y.
- A 0-second age renders as "just now", left-aligned, spanning the age
  columns.
- The age (count + unit) is color-coded by unit: s = hyper-fluorescent
  green (#39ff14); then the board-number palette: m = green, h = blue
  (the "1" blue), d = red (the game red), w = navy, mo = maroon, y = teal.
- Your own row is bolded on a tasteful light-blue highlight (#d8ebfa),
  with text overridden to black for readability (unit colors would be
  unreadable on the highlight).

## Rankaverage charts

- One per grouping stat: efficiency (exact %), clicks (exact), 3BV (exact),
  3BV/s (0.01 buckets), mouse path (100px buckets), mouse speed (10px/s
  buckets). There are NO separate rankcount charts and no exact-match
  "same 3BV/clicks/efficiency" columns — the rankaverage's x-count column
  and value grouping cover those.
- Row format: rank, grouped value, that group's average solve time,
  x-count of wins in the group. Ranked best (lowest) average first.
- Delta caption under each chart, minimal text only: how this win moved
  its own group's average. The SIGN is the true numeric direction of the
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
  3BV vs time.
- Every path-recorded win is a gray dot; the just-finished game is a
  larger red dot. Requires at least 2 path-recorded wins.
- Both axes carry real scales: tick labels at nice 1/2/5-step intervals
  (up to 7) with light gridlines; units go in a small caption below
  ("→ px/s ↑ s").

## Score history and backup

- All wins are kept forever, per mode, in localStorage; nothing is pruned.
- Export/import as a JSON blob `{ wins, losses }`: copy to clipboard, save
  to file, paste in, or open from file — subtle controls out of the way of
  play. Import dedupes (a win with the same date+time values is a dup;
  losses dedupe by timestamp), so repeated imports are no-ops. Older
  wins-only blobs still import.

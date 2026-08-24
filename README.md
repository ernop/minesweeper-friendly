# minesweeper-friendly

**Play now: https://ernop.github.io/minesweeper-friendly/**

Minesweeper variant project. Standard first-click-safe play, plus Uniform NG,
Single-path NG, Proof-or-die, Angelic, a 100-game Trial of 25 hidden boards
shown four times each, Short trial (4 boards × 4), and Test trial (1 board
× 4). The Mode menu is in the upper right; each mode keeps its own rankings.

![A won Beginner game: stats beside the board, rank charts and streak lists below](promo/win-screen-2026-08-19-full-layout.png)

## Run

No dependencies, no build step. Open `index.html` in a browser, or:

```bash
python3 -m http.server 8018
```

then http://localhost:8018/

## Controls

- Left click: reveal a cell (first click is never a mine)
- Right click: place/remove a flag
- Left click on a satisfied number: chord (open all unflagged neighbors)
- Face button or space bar: new game
- Tabs: Beginner 9x9/10 (default), Intermediate 16x16/40, Expert 30x16/99, Custom
- Upper-right Mode menu: Standard, Uniform NG, Single-path NG, Proof-or-die, Angelic, Trial, Short trial, Test trial

## Solver

Proofs use every mine layout consistent with the revealed numbers and total
mine count, not a fixed catalog of Minesweeper patterns. The engine solves
connected frontier constraints, combines their mine totals with the
unconstrained board, and marks a cell only when every valid layout agrees.
Flags and the hidden board are never treated as player knowledge. If the
explicit search budget is exhausted, the result is reported as incomplete;
the game does not turn that engine limit into a criticism or Proof-or-die
death.

## Play history

Every finished game, win or loss, is kept per mode in the browser's
IndexedDB (loaded into RAM at startup; persisted asynchronously). Each
record stores only the primary measurements — end date, outcome, time, 3BV,
clicks, mouse path (total cursor distance in px from first click to game
end), and the finished board's max number, sevens, zeros, and mine
islands; derived stats (3BV/s, efficiency, correctness, throughput, IOS,
mouse speed, and the rest) are
computed at display time. After each win the result panel shows the full
stats plus one ranked-list column per time window. Day-and-longer windows anchor to your
local calendar: "today" since last midnight, "past week" since midnight six
days back, "this month" and "in <year>" since their calendar starts, and
"in the last year" since the end of the day exactly 365 days prior; hour /
15 min / 5 min / 1 min windows roll continuously. Then day-category columns:
all scores set on
today's weekday ("on Wednesdays"), on weekends or weekdays (whichever today
is), and on US federal holidays when today is one. Columns reveal
themselves gradually: a chart only appears once it would actually differ —
if every game you've played was today, "this month" and "past week" would
just repeat "today", so they stay hidden until your history spreads out
enough to make them distinct. The one constant is "lifetime": it always
shows, and any window that matches it exactly folds into it.
After a win there are also lists for boards that match this one's 3BV,
highest number (has an 8, has a 7, or no number above 4 / 3 / 2),
mine-island count, largest mine-island, and zero count.
Average-time scatter plots group your wins by efficiency, clicks, 3BV,
3BV/s (2 decimals), mouse path (nearest 100px), and mouse speed (nearest
10px/s), then plot each value against its group's average solve time.
The stats themselves (time, 3BV, 3BV/s, clicks, efficiency, correctness,
throughput, IOS, mouse path,
mouse speed, path per click, path per 3BV, plus the per-game forms of the
session series: click rate, no-op rate, misclick rate, mark rate — derived
from stored counts — and the stored fastclick gap)
render as a small label/value table beside the board, including no-op
clicks (board clicks that changed nothing — stored as `wastedClicks`
since
2026-08-19; older records lack the measurement), flags placed (same
recording rules; a zero-flag game earns the special status "markless",
shown right in the row and as a small "(m)" before that game's time in
every rank list) and, for wins, clicks over
3BV (clicks beyond the board's minimum). The after-game report groups each
action once by severity: game loss, game risk, time loss, optional
one-ply life maximization, or measurement notes. New players see only the
fatal action after a loss (a win has none at that default scope). Risk/full
scope reports still show needless or higher-risk actions from games the
player won. Reports put the fatal action first, then sort survived risks by
highest selected actual death probability; lower-severity sections follow.
The inline “After each
game, show me” selector switches persistently among nothing, fatal only,
fatal plus risky actions, and full analysis. Full analysis explains the independent
facts (for example, proven mine plus a safe alternative), quantifies actual
risk after protection rules, and presents only the dimensions that differ
as short labeled facts. Saved positions crop away uniform covered remainder
while naming the shown row/column range; selected and alternative cells stay
highlighted. Bare reveals are evaluated without requiring flags or chords;
if nothing qualifies under the selected scope, no empty report card appears.
At the bottom, seven small
scatter plots chart every win: win time vs date, win time vs hour of day,
3BV vs time, clicks vs 3BV (with the clicks = 3BV floor drawn in), no-op
clicks vs 3BV/s, mouse path vs time, and mouse speed vs time — so
you can compare those recorded values over time. Each axis carries a spelled-out label with
units; dots are colored by how long ago each win was (same palette as the
rank-list ages, with a legend below), and your newest game is the
black-ringed dot tagged with its rank among today's wins. Streak lists rank
your win runs: "streak" (consecutive wins), "near-streak" (runs spanning at
most 1 loss), and "near-near-streak" (at most 2), each row showing length
and how long ago the streak's last win was; recorded losses split the
streaks. Each list windows around your row, 11 rows max: when you rank in
the top 11 the list simply shows the top 11 with your row in place;
otherwise it centers on you with the 5 nearest entries either side. Rows
show rank (without a leading "#"), fixed-width time, and a relative age
("43s", "5m", "2.0w"; the brand-new score
says "just now").

The in-page left column carries live self-observation without covering
the board. During a game it
shows per-game motion metrics recomputed once a second; on top, always, a
"session" section charts the last hour of actual play across games (losses
and abandoned boards included): mouse
speed, board-changing clicks per second, deaths with recorded mistake
tags per minute (fatal actions such as opening a proven mine or guessing
while a guaranteed-safe move was available), misclicks per minute
(board-changing actions contradicted by facts provable from the visible
board, fatal or nonfatal), no-op clicks per second,
the fastclick gap (when you're clicking usefully on the move, how fast the
qualifying press intervals are), flags placed per second, and flags removed
per minute. It also charts enabled report-category frequencies, excess
protection-aware game risk, and the optional modeled-life gap. Breaks
consume no chart time: history is scanned as far back as needed to fill each
selectable played-time lookback (30s to 15m). Each chart
uses a one-hour accumulated-play axis, black plot-aligned titles, readable
axes, and the newest value labeled at its point. The panel preserves its scroll position
through its once-a-second redraw. These are observations, not explanations: the app
does not infer fatigue, attention, hardware trouble, judgment, or any other
cause from a change in a line. The
window survives a reload: on startup records are scanned backward until
the last hour of play is rebuilt, so closing the tab doesn't wipe the
running averages.

The home-page score buttons open the same full result view for Beginner,
Intermediate, or Expert without requiring a new game; historical views have
no "this" marker. The settings page's "shown things" group (the
"settings" button top-right leads there) controls each result section. The
last-1-minute list, largest-island items, and near-near-streak list start
hidden.

Backup: subtle "export history" / "import history" controls under the
results. Export copies the full history JSON to the clipboard (with a
save-to-file option); import accepts pasted JSON or a file, validates the
whole blob before writing anything, and merges with dedupe by each record's
end timestamp, so re-importing the same blob is always safe. Ages are
color-coded by unit following the board-number palette: seconds
fluorescent green (always bold), minutes green, hours blue, days red, then
navy/maroon/teal for weeks/months/years. Losses show the same stats table
as wins and are recorded in full; they are not ranked.

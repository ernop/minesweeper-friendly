# minesweeper-friendly

**Play now: https://ernop.github.io/minesweeper-friendly/**

Minesweeper variant project. Current contents: a clone of minesweeper.online's
standard mode. Planned: friendlier variants along the solver-aware design axis
(see `agents.md`).

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

## Scores

Every win is kept in localStorage per mode (date, time, 3BV, 3BV/s, clicks,
efficiency, and mouse path: total cursor distance in px from first click to
game end). After each win the result panel shows the full stats plus one
ranked-list column per time window. Day-and-longer windows anchor to your
local calendar: "today" since last midnight, "past week" since midnight six
days back, "this month" and "in <year>" since their calendar starts, and
"in the last year" since the end of the day exactly 365 days prior; hour /
15 min / 5 min / 1 min windows roll continuously. Then day-category columns:
all scores set on
today's weekday ("on Wednesdays"), on weekends or weekdays (whichever today
is), and on US federal holidays when today is one. Four more columns rank the
win among similar games: 3BV/s within 10% of this win's, and exact matches on
3BV, efficiency, and click count. Rankcount charts list every distinct value
of efficiency, clicks, 3BV, and 3BV/s (2 decimals) best-first with how many
wins hit each, your row bolded. Beside each is a rankaverage chart: the same
groups ranked by their average solve time, each row showing the value, the
group's average time, and its win count. Each list windows around your row: when 1st
place is within 10 rows above you the list anchors at the top and grows
downward (21 rows total); otherwise it shows 5 rows either side. Rows show
rank, time, and a relative age ("43s", "5m", "2w"; the brand-new score says
"just now"). Ages are color-coded by unit following the board-number
palette: seconds ultralight blue, minutes green, hours blue, days red, then
navy/maroon/teal for weeks/months/years. Losses show stats but are not
recorded.

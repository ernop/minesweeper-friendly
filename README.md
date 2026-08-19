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
- Tabs: Beginner 9x9/10, Intermediate 16x16/40, Expert 30x16/99, Custom

## Scores

Every win is kept in localStorage per mode (date, time, 3BV, 3BV/s, clicks,
efficiency). After each win the result panel shows the full stats plus one
ranked-list column per time window (lifetime, past year, month, week, day,
hour, 15 min, 5 min, 1 min) plus day-category columns: all scores set on
today's weekday ("on Wednesdays"), on weekends or weekdays (whichever today
is), and on US federal holidays when today is one. Each column shows up to 10
scores above yours, your new score bolded, and up to 10 below, with rank,
time, and a relative age ("43 seconds ago", "5 minutes ago", "2 weeks ago",
"3 years ago"). Losses show stats but are not recorded.

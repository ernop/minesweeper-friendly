# Minesweeper problems (requested 2026-09-26)

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/problems.md](../implementation/problems.md).
Why and how it fits the training plan: [training.md](training.md#situations-memorization-and-problems-requested-2026-09-26-evening).

User requests (2026-09-26): "Minesweeper problems" with a set starting mouse
position, each beginning just as a square opens, taken from the real games of
high-level players; identify each pattern or logic situation, see how players
of all levels handle it, place the player's level, and show how to move up.
Later the same day: "situation classes and problems, that's really what you
got to get here. We definitely do need to create this website". The user takes
the problems and evaluations as they are created.

Built the same day as version 1: `problems.html`, opened from a "problems"
button in the game page's upper-right cluster, part of the game site (see
[Hosting](#hosting)).

## A problem

A real moment from a replay of a strong Expert game, just before the player
opened a square whose number made one to four covered squares provably safe.

- The board is exactly what that player saw before the click: opened squares,
  numbers, and their flags. The start square is the square they opened; the
  ring's dot marks where their cursor was inside it when they clicked.
- **Answer squares** are the squares the new number makes provable, by any
  logic, that were not provable before it: the safe ones must be opened, the
  mines may be flagged. The full solver confirmed each problem's answer set
  when the bank was built, and the build rejects moments where the new number
  also enables a harder deduction, so every answer is settled by the rule the
  problem's class names.
- **Classes** (the situation classes): "one number at a time" (single-number
  counting, repeated, settles every answer square), and two-number rule
  families: the two numbers of the pairwise difference rule that settle the
  answer, written as the mines each still needs, with whether either number
  touches the board edge. The page names them in words: "1-1 rule", "1-1 rule
  at the edge", "1-2 rule". A family becomes a class once the replay corpus
  holds at least 20 judged fresh moves of it (see the analysis in
  [training.md](training.md#situations-memorization-and-problems-requested-2026-09-26-evening)).
  Version 1 has four classes and 40 problems each.

## Protocol `problems-v2`

A released protocol id names one exact procedure. Any change to these values
or to how an attempt runs ships under a new id; `tests/problems-core-test.js`
freezes them.

User review (2026-09-26, evening): the board is big, and the wait-and-reorient
step before each problem is a lot; "box" the area of interest so the player
knows to open that area as fast as possible. `problems-v2` adds the **focus
box**: an orange outline around the start square and every answer square, one
square wider on each side (so the numbers that decide them are inside),
clipped to the board, shown from the moment the problem appears through the
result. It is the only difference from `problems-v1`. Because the box shortens
the search, attempts made under `problems-v1` stay in the history but are left
out of the ladders, and the home page says how many.

1. The board shows only covered squares, the focus box, and a ring around the
   start square.
2. When the cursor enters the start square, the real board appears. If the
   cursor leaves the square, the board is covered again and the wait starts
   over.
3. After the cursor has stayed in the start square for 1 second, the start
   square opens by itself. Time zero is the timestamp of the animation frame
   that first draws the new number.
4. The player opens every safe answer square. Clicks work as in the game: left
   release opens a covered square or chords a number; a right press flags or
   unflags at once; with both buttons down the left release chords and never
   opens a covered square, so the 1.5 click works.
5. The attempt ends when every safe answer square is open (solved), a mine
   opens (mine), 20 seconds pass (timeout), Esc is pressed (stopped; the set
   ends), or the tab is hidden or the window loses focus (interrupted).

Why the preview instead of a start click (decision, 2026-09-26): a start
click would leave the player free to study the board for as long as they like
and precompute every answer except the new number. The original player had
seen the region only for their last few moves. A fixed 1-second view of the
board with the cursor already on the start square approximates that and is the
same for every attempt; the square then opens "just as" it did in the game.

## Measures

Derived when shown, never stored:

- **First answer:** the first click that aims at an answer square: opening
  one, chording a number into one, or flagging an answer mine. A chain opening
  from some other square that happens to reach an answer square is not an
  answer. Its time splits into thinking and moving.
- **Thinking:** time from zero until the cursor has moved a quarter of a
  square from where it was, plus the time it rests on the first answered
  square before the click. The same split as the replay analysis, so it
  compares with the level medians.
- **Moving:** the travel between those two parts.
- **Total:** the time the last safe answer square opened.
- **Extra clicks:** clicks that changed something but were not answers.
  Version 1 does not judge whether such a click was provable from other
  numbers or a guess.

## Display

User review (2026-09-26, after the first version): the answers and display
were too wordy; every column must be unmistakable; a placement among levels
of other players must be vertical with the best on top, in the style of the
game data chart's 0-100% band; the player's own number must stand out in the
player's color among the others; the 3BV/s level numbers must read as skill
levels with the player shown where they fit; and the layout must show things
directly instead of making the player hold information in memory. The
display below implements that.

- **Where you fit** is a **ladder**: the game data band turned into a time
  scale, fastest at the top, with the band's green-to-red gradient and tick
  style. Every skill level with enough corpus moves sits at its exact median
  thinking time; its label reads the time in bold, then the level ("3.5+
  3BV/s"). The player's mark sits among them in the game's me-row look (bold
  black on light blue with the dark blue edge). Labels keep their order and
  move apart only as far as needed, with leaders to their exact points. Levels
  with fewer than 10 corpus moves are named under the ladder as "Too few games
  yet". The rule's definition is in the title's (?) tip.
- **Start a set:** one line of instructions, "Start 20 problems", and the
  square size (16, 20, 24, 28, or 32 px; saved). A set holds 5 one-number
  problems and 15 from the pattern classes in turn, each the least-attempted
  problem of its class, in random order.
- **During a set:** the page chrome is hidden; the head line shows "Problem N
  of 20" and one instruction whose line keeps its height. After each problem,
  beside the board: thinking, moving, and total as the largest text (extra
  clicks when there were any); the ladder for the problem's rule with the
  player's thinking time on it ("You") and the original player's ("Original
  player", italic, when they answered with their very next click); a key for
  the dashed answer squares on the board (green safe, red mine; the start
  square outlined). Enter or the button goes on; "End set" or Esc stops.
- **Set finished:** one row per attempt: rule, result, thinking, total.
- **Home:** one ladder per rule side by side, each with "N of M solved" and
  the player's median over solved problems as "You"; then the latest 30
  attempts (when, rule, result, thinking, total, extra clicks).
- Values are the most legible text: bold, tabular, larger than their labels.
  No gray text; the layout uses the full width.

## Last-flag drill `last-flag-v1` (built 2026-09-26 night)

The most common wasted click in the player's saved Expert wins is a chord
tried one flag early (about 26 per win): click the number, place its last
flag, click again. This drill practices doing both in one motion, the 1.5
click. On the problems page, in its own card.

- **Positions:** 60 real moments from the replay corpus, one per game, from
  the fastest games: a player flagged a mine and with the very next click
  chorded a number that flag completed. The number was exactly one flag short,
  its missing mine provable at that moment, and it still had safe squares to
  open. The ring sits where that player's cursor was at their previous click.
- **Run:** a drill is 10 positions, the least practiced first. Resting the
  cursor on the ring shows the board in the next animation frame (time zero),
  with the focus box around the number. The task: open the number's safe
  squares. Any method counts; the 1.5 click (right press on the mine, keep
  holding, slide onto the number, left press) does it in two clicks and one
  motion. A mine ends the position; 10 seconds is a timeout.
- **Result:** time until the squares are open, clicks, and whether a
  both-button chord opened them (the 1.5 click), with the original player's
  time from their previous click to the chord. The home card shows positions
  tried and solved, the median time, and how often the 1.5 click was used.
- **Stored attempt** (store `drillAttempts`, keyed by `startedAt`): like a
  problem attempt, with `protocol` `last-flag-v1`, `positionId` instead of
  `problemId` and `classId`, no preview time, and actions whose both-button
  chords carry `gesture: true` (problem attempts record the same mark since
  this change).

## Pointing test `pointing-v1` (plan v2, built 2026-09-26 night)

The hand alone, apart from reading the board: how fast and how accurately the
player moves to a square and presses it. On the problems page, in its own
card.

- **Route:** from the start square (column 15, row 8), 24 moves of 2 to 13
  squares in every direction (9 of 2-4 squares, 9 of 4-8, 6 longer), the same
  every run so runs compare over years. `tests/problems-core-test.js` freezes
  it.
- **Run:** the board shows covered squares and a ring on the start square.
  Pressing the start square starts the run; each target square turns blue in
  the animation frame after the previous press, and that frame's timestamp is
  when it was shown. A press on the target counts at the press (mouse button
  down); a press elsewhere while a target shows is a miss; presses between a
  press and the next frame count for nothing. Esc stops (saved as stopped); a
  hidden tab or unfocused window interrupts.
- **Measures (derived when shown):** per target, movement time (shown to
  press), reaction, travel, and hover by the problems page's split; the press's
  offset from the square's center; misses. Over the run: medians by move
  length, the least-squares line of movement time against Fitts's index of
  difficulty log2(distance + 1) with a target one square wide, throughput (mean
  index over movement seconds, bits per second), total misses, and the spread
  of press positions.
- **Display:** time per target, throughput, and misses as the largest text,
  then one ladder per move length (2-4, 4-8, 8+ squares) placing the run's
  median travel among the skill levels' median in-game travel for moves of that
  length. The home card shows the latest complete run the same way.
- **Stored run** (store `pointingRuns`, keyed by `startedAt`): `startedAt`,
  `protocol`, `cellPx`, `timeOriginMs`, `startT`, `endT`, `outcome`
  (`complete`, `abandoned`, `interrupted`), `targets[]` (`shownT`, `pressT`,
  press `x`, `y` in squares, `misses[]` of `{ t, x, y }`), and the cursor
  `samples`. The backup file (format version 2) carries runs beside attempts.

## Stored attempt

One record per attempt in the page's own IndexedDB database
`minesweeper-problems` (store `attempts`, keyed by `startedAt`), separate from
the game's database so the two never depend on each other's versions. A stopped or
interrupted attempt is stored with that outcome; one that never reached time
zero stores nothing.

| Field | Meaning |
| --- | --- |
| `startedAt` | Unix epoch ms of time zero |
| `protocol` | `problems-v2` (`problems-v1` for attempts made before the focus box) |
| `bankId`, `problemId`, `classId` | the bank it was made with, the problem, and its class then |
| `setStartedAt` | epoch ms the set began |
| `cellPx` | square size in px |
| `timeOriginMs`, `previewT`, `startT`, `endT` | the page clock's epoch anchor; when the cursor entered the start square, time zero, and the end, on that clock |
| `outcome` | `solved`, `mine`, `timeout`, `abandoned` (stopped), or `interrupted` |
| `actions[]` | `{ t, kind, cell }`: ms after time zero, `reveal`, `chord`, `flag`, or `unflag`, and the square |
| `samples` | `{ t[], x[], y[] }`: cursor positions in squares from the board's top-left corner, from the preview on, t in ms after time zero |

Loading validates every record and fails visibly if one is malformed. A
problem id names one moment of one replay, so attempts keep counting in the
profile under their problem's current class after the bank is rebuilt; attempts
at problems a new bank lacks are listed but not profiled.

## Backup

Export writes `{ format: "minesweeper-problems-attempts", formatVersion: 3,
exportedAt, attempts, pointingRuns, drillAttempts }`. Import merges each list
by `startedAt`, keeps each item once, and rejects invalid items with a visible
count.

## Hosting

Decision (creator, 2026-09-26 evening): the problems page stays a subpage of
the Minesweeper site, not a subdomain of its own (the earlier request named a
separate fuseki.net host). It ships in the game's release at
`https://minesweeper-friendly.fuseki.net/problems.html` and at `/problems.html`
on the player's local origin; like every page it loads `pages-redirect.js`
first, so GitHub Pages visitors are sent to the site.

## Not built

Exact judgement of clicks outside the answer squares (provable or a guess),
adaptive scheduling by class, mine-answer problems, problems from the player's
own games, and archive-folder copies: [BACKLOG.md](../../BACKLOG.md#minesweeper-problems).

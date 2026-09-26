# Minesweeper problems (requested 2026-09-26)

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/problems.md](../implementation/problems.md).
Why and how it fits the training plan: [training.md](training.md#situations-memorization-and-problems-requested-2026-09-26-evening).

User requests (2026-09-26): "Minesweeper problems" with a set starting mouse
position, each beginning just as a square opens, taken from the real games of
high-level players; identify each pattern or logic situation, see how players
of all levels handle it, place the player's level, and show how to move up.
Later the same day: "situation classes and problems, that's really what you
got to get here. We definitely do need to create this website", to be hosted
at a Minesweeper-problems subdomain of fuseki.net (the transcribed request
reads "mindsweeper problems dot forsake you dot net"). The user takes the
problems and evaluations as they are created.

Built the same day as version 1: `problems.html`, opened from a "problems"
button in the game page's upper-right cluster. It is live wherever the game is
deployed (`/problems.html`). The dedicated subdomain is not set up; see
[Hosting](#hosting).

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

## Protocol `problems-v1`

A released protocol id names one exact procedure. Any change to these values
or to how an attempt runs ships under a new id; `tests/problems-core-test.js`
freezes them.

1. The board shows only covered squares and a ring around the start square.
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

- **Thinking:** time from zero until the cursor has moved a quarter of a
  square from where it was, plus the time it rests on the first answered
  square before the click. The same split as the replay analysis, so it
  compares with the level medians.
- **Moving:** the travel between those two parts.
- **First answer:** the time of the first click that aims at an answer square:
  opening one, chording a number into one, or flagging an answer mine. A chain
  opening from some other square that happens to reach an answer square is not
  an answer.
- **All squares:** the time the last safe answer square opened.
- **Clicks outside the new number's squares:** clicks that changed something
  but were not answers. Version 1 does not judge whether such a click was
  provable from other numbers or a guess.

## Display

- **Start a set:** the explanation, "Start 20 problems", and the square size
  (16, 20, 24, 28, or 32 px; saved). A set holds 5 one-number problems and 15
  from the pattern classes in turn, each the least-attempted problem of its
  class, in random order.
- **During a set:** the page chrome is hidden; the head line shows "Problem N
  of 20" and one instruction whose line keeps its height. After each problem:
  the board with the answer squares dashed (green safe, red mines) and the
  start square outlined; thinking, moving, first answer, and all squares as
  the largest text; the class name and its rule in words; one row of level
  medians for the class beside the player's median; and what the original
  player did (their answer time and thinking, or that they did something else
  first). Enter or the button goes on; "End set" or Esc stops.
- **Set finished:** one row per attempt.
- **Your thinking time by rule:** per class, solved of attempted, the player's
  median thinking over solved attempts, and each level's median thinking for
  fresh moves of that class in the replay corpus. A level's cell is green when
  its median is at or above the player's, and shows a dash when fewer than 10
  corpus moves stand behind it; hovering shows the count.
- **Recent attempts:** the latest 30, newest first.
- Values are the most legible text: bold, tabular, larger than their labels.
  No gray text; the layout uses the full width.

## Stored attempt

One record per attempt in the page's own IndexedDB database
`minesweeper-problems` (store `attempts`, keyed by `startedAt`), so the page
works the same on the game's origin and on a host of its own. A stopped or
interrupted attempt is stored with that outcome; one that never reached time
zero stores nothing.

| Field | Meaning |
| --- | --- |
| `startedAt` | Unix epoch ms of time zero |
| `protocol` | `problems-v1` |
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

Export writes `{ format: "minesweeper-problems-attempts", formatVersion: 1,
exportedAt, attempts }`. Import merges by `startedAt`, keeps each attempt once,
and rejects invalid attempts with a visible count.

## Hosting

Requested: the page at its own fuseki.net subdomain. Version 1 ships inside
the game's release, so it is live at
`https://minesweeper-friendly.fuseki.net/problems.html`; like every page it
loads `pages-redirect.js` first, so GitHub Pages visitors are sent there.
The dedicated hostname needs a DNS record at the fuseki.net registrar and a
TLS certificate and nginx site on the Fuseki server, outside this repository;
[BACKLOG.md](../../BACKLOG.md#minesweeper-problems) lists the steps.

## Not built

Exact judgement of clicks outside the answer squares (provable or a guess),
adaptive scheduling by class, mine-answer problems, problems from the player's
own games, and archive-folder copies: [BACKLOG.md](../../BACKLOG.md#minesweeper-problems).

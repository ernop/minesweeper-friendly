# Training toward an Expert win under 60 seconds (requested 2026-09-26)

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/training.md](../implementation/training.md).
Evidence and the measured diagnosis: [reference/expert-speed-training-2026-09-26.md](../../reference/expert-speed-training-2026-09-26.md).

User request (2026-09-26): "I want to get my minesweeper skill way up, til I
can break sub 60s for expert. Can you please make a plan and training system
for this after careful research and thought?"

Built the same day: the plan below and a read-only training page that
measures the player against it. The plan's rules and targets are decisions
made from the player's saved games and the cited sources; they are not
measurements and can be revised.

## Redo requested: measure against real players first (2026-09-26, afternoon)

The user asked to redo the plan as a teaching, learning, and skill-breakdown
evaluation done "like a true scientist":

- **Exact comparison.** Use the full movement and timing history of the
  player's games and the thousands of expert games published online to find
  exactly how the player compares with strong players, including players who
  already hold the target time.
- **Subskills.** Break the game into subskills and practice specific pattern
  skills and error types intensely, not only endgames. Reason about it as
  guiding a robot hand like the player's (its misclick rate, its speed): how
  to guide it, and how to find out its properties.
- **Minesweeper problems.** Problems taken from real games of high-level
  players, each beginning just as a square opens, with a set starting mouse
  position. Identify each pattern or logic situation, look at how players of
  all levels handle it, find commonalities among high-level players, place the
  player's level per situation, and show how to move up.
- **Collaboration.** Getting the needed test data is to be worked out with the
  user, and the user will take the tests and evaluations as they are created.
- **Chord binding.** Left-click chording in this clone was an arbitrary choice;
  the user is not attached to it.

Decisions (this change): the morning's stage plan below stays on the training
page as a provisional economy dashboard; its stages are not final until the
comparison study ranks the subskills. The study design, data sources, and pilot
results are in
[reference/skill-comparison-2026-09-26.md](../../reference/skill-comparison-2026-09-26.md).
Chord binding (revised the same afternoon): the user pointed out that
both-button chording and the 1.5 click are part of the official game and were
left out by oversight, so both are now standard behavior beside left-click
chording ([board rules](board-and-layout.md)); keyboard keys as buttons remains
only a possible experiment.

### Plan v2 (requested; not built unless marked)

1. **Measure the player's hand and eyes.** From existing traces (built as the
   offline pilot, `analysis/skill-comparison/`): per input, the reaction before
   the cursor moves, travel, hover on the target, distance, and action kind;
   economy per 3BV; pauses. Then a pointing test on the real board grid
   (targets at set distances and directions) for the hand's travel-time law,
   endpoint accuracy, and misclick rate.
2. **Measure strong players the same way.** A cross-level corpus of published
   expert replays, converted to the same per-input format (pilot built).
3. **Rank the gaps.** Replace one component at a time in the player's own
   games with a faster level's values for the same situations, and rank
   subskills by seconds saved.
4. **Situation classes.** Annotate every input with the logic it needed (from
   the solver) and a local pattern signature, then compare latency and choices
   per class across levels and place the player in each class. Built as an
   offline analysis; see the next section.
5. **Minesweeper problems.** Positions from real games, starting as the
   original player's square opens with the cursor on it; the task is what the
   new number proves. Scored against the original player and the corpus
   levels in the same class. Built as version 1:
   [problems.md](problems.md). The start changed from a click on a start dot
   to a timed one-second view (reason in that spec).
6. **Train and test transfer.** Train the top-ranked subskills with adaptive
   problems and drills; check each against real Expert games; repeat every test
   to establish its reliability before using it to judge training.

## Situations, memorization, and problems (requested 2026-09-26, evening)

User requests, same day:

- Support the 1.5 click; its absence was an oversight (built:
  [board rules](board-and-layout.md)).
- Use normal terms, or define a term where it is first used; fix defects found
  in a comparison instead of listing them.
- Board luck is already quantified by the project; do not present it as new.
- Build the situation classes and the problems, and the problems website.
- Identify all common logic output sequences (a corner, a straight side reading
  1-2-2-1, and the like) in any rotation, transform, or inversion; measure them
  by level, from the best players to far below the user; quantify how much of
  each level's play is memorized (executed very fast) versus worked out as it
  goes; and say whether the user memorizes more, the same, or less than the
  average player at the same speed. The user expects pros to have a larger
  memorized scope, that memorized patterns are faster, and that they allow
  skipping flags.
- Do this for several traits: the trait least developed relative to the
  user's level is presumably the easiest to advance to that level's standard.

Built (offline analysis `analysis/skill-comparison/situations.js`, method in
[reference/skill-comparison-2026-09-26.md](../../reference/skill-comparison-2026-09-26.md)):

- Every reveal and flag in the corpus and in the user's games is classed by the
  logic it needed (the game's proof engine at one-number, two-number, and full
  strength) and, for two-number moves, by pattern: the exact local
  configuration, the straight-edge run (a 1-2-2-1 along a flat side reads
  "1uuu 2uuu 2uuu 1uuu"), and the family (the two numbers' remaining mine
  counts, what the rule proves, and whether the edge is involved).
- **Inversion** is read as mirror images: patterns match under all 8
  rotations and reflections. Mine-for-safe complements stay separate classes,
  because they show different numbers.
- **Memorized** is measured, not assumed: a fresh two-number move (made right
  after the move that revealed its information) is *fluent* when its thinking
  time, meaning the reaction before the cursor moves plus the hover before the
  click, is within 60 ms of the same player's median fresh one-number reveal.
- **Level comparison:** the corpus is stratified into seven 3BV/s levels from
  1.0 to above 3.5 (about 50 games each, at most 3 per player). The user is
  compared with the average game at the user's speed, interpolated between the
  two levels around it, with 95% bootstrap intervals over games. Efficiency
  uses effective clicks only, because replay parsers count the right half of a
  both-button chord as a click that changed nothing.

Results (357 corpus games and the user's 80 traced wins at median 1.77 3BV/s;
refreshed as the corpus grows):

| Trait | You | Average game at your speed | Gap worth |
| --- | --- | --- | --- |
| Effective clicks per 3BV | 1.39 | 1.23 | 11 s per game (9 to 13) |
| Flags that open at most one square through their chords, per 3BV | 0.18 | 0.09 | about 16 clicks per game |
| Extra thinking on fresh two-number patterns | +34 ms | -10 ms | 0.2 s per game |
| Fresh two-number moves at single-number speed (fluent) | 64% | 79% | |
| Fresh pattern moves made without flagging first | 72% | 86% | |
| Pausing (time past 1 s in a gap), per game | 5.2 s | 4.9 s | none (interval spans zero) |
| Reading one number (thinking time) | 196 ms | 274 ms | you are faster |
| Cursor travel, 2-6 square moves | 172 ms | 219 ms | you are faster |

- Memorization answer: **less** than the average player at the user's speed.
  The expectation that the best players memorize more is not supported in this
  measure: every level, from 1.0 3BV/s up, makes fresh two-number moves at its
  own single-number speed (fluent share between 74% and 86% with no steady
  trend; extra thinking about 0 ms). What rises with level is reading speed as
  a whole, patterns included (single-number thinking 330 ms at the slowest
  level, 160 ms at the fastest). Only the user's games show a separate pattern
  cost (+34 ms). Its direct time cost is small because fresh pattern moves are
  rare (about 5 per game).
- Least developed trait relative to level: **click efficiency**, driven by
  flags that do not pay for themselves (a flag plus a chord that opens one
  square is two clicks where one direct click does) and chords that open one
  square (0.34 per 3BV against 0.13). This matches the user's expectation that
  memorized patterns let a player skip flags: the user flags fresh patterns
  first more often than the level average.
- Consequence for the plan: stage 1 (inputs) stays first and now has the flag
  measure above; the problems page trains the two-number families where the
  user's fluency trails (the 1-1 rules carry most fresh pattern moves).

## Plan v2 in progress (requested 2026-09-26, night)

User requests: do plan v2; think about experiments to run; push on the training
ideas in the backlog after looking at the player's rendered stats at every
level; keep collecting many more replays and store them logically forever; and
on the problems page, box the area of interest (built: [problems.md](problems.md)).

### Gap ranking (built: `analysis/skill-comparison/gaps.js`)

Each of the player's 80 traced wins is rebuilt with one skill at a time set to
a faster level's mean for the same situation (thinking time by kind of move,
logic, and freshness; travel by distance; long pauses per 3BV; effective clicks
per 3BV). Means, not medians, because the player's own totals include their
slow moves. Seconds saved per game (357-game corpus, refreshed as it grows):

| Skill set to | next level (1.95 3BV/s) | 2.84 3BV/s | 3.28 3BV/s |
| --- | --- | --- | --- |
| Clicks per 3BV | 10.4 | 13.9 | 17.0 |
| Thinking | -1.1 | 10.8 | 13.4 |
| Travel | -1.9 | 10.0 | 13.6 |
| Long pauses | 1.9 | 2.0 | 2.0 |
| All together (median game, from 101.3 s) | 91.3 s | 67.5 s | 60.3 s |

Clicks come first; thinking and travel then matter equally for sub-60.

### What the player's saved games show (2026-09-26)

From the rendered High scores views and the records behind them (6,679 games):
Beginner best 2.82 s (1,251 wins); Intermediate best 20.76 s (1,072 wins);
Expert best 71.03 s, with 50 wins in the last 509 Expert games. Expert times
have been flat since late August. In the latest 80 traced Expert wins:

- **Clicks that change nothing: about 41 per game.** 26 are clicks on a number
  exactly one flag short (a chord attempted before its last flag), 3.7 on
  numbers two or more flags short, 8 on finished numbers with nothing left to
  open, 2 on flags.
- **Late losses:** of games that reach 20 s, 27% are won. The fatal click's
  recorded mistakes are mostly flag-related: chording over a wrong flag (40 of
  138 late deaths in 14 days), a chord contradicting the visible numbers (37),
  a likely misclick after a wrong flag (34), and opening a proven mine (36).

The heavy flag-and-chord style (100 flags and 112 chords per win) therefore
costs both clicks and wins. The 1.5 click, now supported, removes the most
common waste directly: the last flag and the chord become one motion.

### Experiments (designs; the player runs them, the analysis reads them)

Each runs in alternating blocks (A B A B ...) of 20 Expert games on the same
days, tagged with a player state naming the condition, so time-of-day and
day-to-day form spread over both conditions. The decision rule is fixed in
advance: adopt B when its block median time is lower in at least three of four
block pairs and its win rate among games that reach 20 s is not lower.

1. **The 1.5 click for the last flag.** A: as usual. B: whenever a number is
   one flag short, flag the mine with the right button, keep holding, and chord
   with the left. Measures: clicks on numbers one flag short (expected near 0),
   clicks per 3BV, time, late win rate.
2. **Flag only when a chord pays.** B: flag a mine only when the chord it
   enables opens two or more squares; otherwise click the safe squares
   directly. Measures: low-value flags, wrong flags, flag-related late deaths,
   clicks per 3BV, time.
3. **Square size.** 16 px against the player's usual size. Measures: travel per
   distance, misclicks, time.
4. **Problems transfer.** Train two rule families daily on the problems page
   for two weeks and leave one untrained; compare in-game fluency (fresh
   two-number moves at single-number speed) on trained and untrained families
   before and after, from the traces.
5. **Focus box.** Problem thinking times with the box (`problems-v2`) against
   the 45 attempts made without it (`problems-v1`), on the same rules.
6. **Warm-up and alertness (observational).** Time and win rate by position
   in the session, and by the self-check taken before the session.

## Diagnosis the plan is built on (measured 2026-09-26)

From 1,692 Expert games through 2026-09-26 (details and method in the
reference): best 71.031 s; median win about 98 s at 1.78 3BV/s. Time is
inputs × seconds per input, about 276 × 0.347 s, so 3BV/s is IOE (3BV per
input, no-ops included: 0.63) divided by seconds per input. Replayed wins spend about 36%
of their time placing flags, 19% on chords that open one cell, and 12% on
clicks that change nothing. Deleting the removable inputs' time from the same
wins gives a median of about 68 s. Only a quarter of games that reach 20 s are
won, and most of the rest are lost with a proven-safe move available.
Correction (same afternoon): this section first said the hand was already fast
enough. The replay comparison contradicts it: sub-60 players also spend about
40% less time per input (213 vs 358 ms), from travel, hover, reaction, and pauses
(reference/skill-comparison-2026-09-26.md).

## The plan

Principle shown on the page: time is inputs × seconds per input; players who
break 60 s need about a fifth fewer inputs per board and spend about 40% less
time per input; the stages start with inputs (no new speed needed), then stop
losing started runs, then read and move faster, until the comparison study
ranks the speed components. Rules from earlier stages stay on.

**Every session**

- 45–60 minutes on most days; split more practice into two sessions hours
  apart (daily dose and spacing evidence).
- 5 minutes of Intermediate warm-up with the current stage's rules, then
  Expert blocks of about 10 minutes, one rule in focus per block.
- Open in a corner. If the corner shows a number, restart with Space instead
  of guessing.
- Keep mouse, sensitivity, and zoom fixed; tag any change with a state.
- Stop when a block is clearly worse than the session's best block, or after
  two avoidable deaths in a row in games past 20 s; do not wait to feel tired
  (performance falls across consecutive games before fatigue is noticed).
- Check the training page at the end of each session.

**1. Stop wasting inputs.** Click a number only when all of its mines are
flagged and it still has covered neighbors; never click to test a chord.
Flag and chord only when the chord opens more cells than the flags it needs
(one flag for two or more cells, two for three or more), otherwise click the
safe cells; when equal, flag. Never flag a mine no chord will use. When
several numbers could open the same cells, chord the one that opens the most.
Expect a few slower sessions; judge them by IOE. The game data column's IOE, no-op
rate, and unused mark share give per-game feedback.

**2. Finish the runs you start.** Chord only over proven flags. Before any
guess, scan the whole board for a safe move; take a truly forced guess at
once. Remove a noticed wrong flag before chording near it. Drill 5 minutes of
Endgame drill a day; if conversion stalls, 10 Intermediate Proof-or-die games.

**3. Read and move faster.** Read with the eyes, not the cursor: move only
toward an already-solved cell and solve the next area while clicking the
current one; clear in one sweep direction; after each session replay the
slowest win with the click-speed path view and name the pattern behind each
long pause; learn those patterns from the minesweeper.online pattern catalog;
use Intermediate blocks for volume.

**4. Win under 60 seconds.** The first sub-60 usually comes on a board of
about 150 3BV or less (about one Expert board in nine) once the median win is
near 70 s; at the stage 3 target it becomes routine. Keep all rules on and
keep finishing games.

## Stage targets (decisions)

| Stage | Measure | Target | Why this value |
| --- | --- | --- | --- |
| 1 | IOE (3BV per input, no-ops included), median of the latest 20 wins | at least 0.91 | the removable-input arithmetic on this player's own wins gives 0.92 (1.09 inputs per 3BV) |
| 1 | no-op clicks per win, median of the latest 20 wins | at most 5 | test-chord and finished-number clicks should vanish |
| 1 | flags no multi-cell chord used, per win, median of replayed latest wins | at most 10 | every such flag costs an input a direct click avoids |
| 2 | games reaching 20 s that are won, latest 60 such games | at least 45% | the 41% solver ceiling is from the first click; runs past the opening convert higher |
| 2 | losses after 20 s with a safe move available (share of classified losses) | at most 35% | most losses should be forced guesses, not misreads |
| 2 | wrong flags per win, mean of replayed latest wins | at most 0.5 | each wrong flag risks a chord death |
| 3 | pauses over 1 s per win, median of replayed latest wins | at most 4 | halves the current reading stops |
| 3 | median 3BV/s of the latest 20 wins | at least 2.8 | about a 62 s median on a 173-3BV board |
| 4 | wins under 60 s | at least 1 | the goal |

A stage is complete when every measure meets its target; the current stage is
the first incomplete one. Achieving the goal does not wait for earlier stages.

## Training page

- Opens from a bordered "training" button in the game page's upper-right
  cluster beside settings; `training.html`. Return-to-game
  links at the top and bottom; Esc also returns.
- Read-only: it never writes storage or settings. Every load computes the
  summary afresh off the page thread from the saved history and traces; a
  status line names the game count and time and says to reload after playing.
- Scope: Standard Expert with the default generator (`30x16/99@standard`)
  only. Other keys never mix in.
- Sections in order: **Now** (cards listed below), **Stages** (each measure's current value, target, met, and the
  sample it was measured over; the current stage outlined), **Where the time
  goes in your latest wins**, **The plan** (the text above; the current stage's
  block outlined; readable even with no games), **Week by week**. The Now cards
  are best Expert win (with its 3BV and date), median win, median 3BV/s, IOE,
  seconds per input, wins under 60 s, and current stage, each with the sample
  it describes.
- Empty state: with no saved Expert games the measured sections stay hidden
  and the status says so. Failures show in the status line with their message.

### Definitions

- **Inputs:** board-changing clicks plus no-op clicks (`clicks + wastedClicks`).
  **IOE** is 3BV / inputs, the same quantity as the game data column's IOE, so
  3BV/s = IOE / seconds per input. Records from before no-op clicks were
  measured are left out of input medians.
- **Seconds per input:** win time divided by inputs.
- **Run:** a game that lasted at least 20 s (past the opening). Conversion is
  wins among the latest 60 runs.
- **Avoidable loss:** fatal status `mine-safe` or `guess-safe` from the game's
  own classifier (a proven-safe move existed). Legacy and unclassified losses
  are excluded from the share's denominator and the sample size says so.
- **Time budget:** the latest 20 wins' traces are replayed with the game's click
  rules. Each input gets the gap since the previous input; the game-starting
  reveal and anything before it are untimed. Rows are the input kinds; values
  are means per win so the parts add up to the total.
- **Flag classes:** used by a chord that opened two or more cells; used only by
  chords that opened one cell; never used; removed again; on a safe cell.
- **Removable inputs:** every no-op click, every flag removed again together
  with its removal, every flag no chord used, and every flag used only by
  one-cell chords.
- **The same wins without those inputs' time:** each win's time minus the
  gaps before its removable inputs, labeled as arithmetic on the recorded
  games, not a prediction.
- **Pauses:** gaps over 1 s before an input.
- **Wrong flags:** flag placements on cells that are safe in the replayed
  layout (post-game truth, never shown during play).
- **Coverage:** a win without a saved trace, without a rebuildable board, or
  whose replay diverged (a Justice redraw on a board rebuilt from its seed)
  is counted and named, never estimated.
- **Weeks:** Monday-based local calendar weeks, newest first: games, wins,
  best, median win, median 3BV/s, IOE, seconds per input, and runs won.

## Not built

Follow-ons are in [BACKLOG.md](../../BACKLOG.md) under "Training toward
Expert sub-60".

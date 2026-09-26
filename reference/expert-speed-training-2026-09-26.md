# Expert under 60 seconds: evidence and personal analysis (2026-09-26)

The research behind the training plan in
[docs/product/training.md](../docs/product/training.md). The user asked for
"a plan and training system" to break 60 seconds on Expert "after careful
research and thought". Two inputs shaped it: this player's saved games, and
what the Minesweeper community and the skill-acquisition literature say.

Epistemic labels: [measured] = computed here from the player's saved games;
[documented] = primary source (official page, paper, published solver data);
[community claim] = experienced players' advice without published data.

## 1. The player's saved games (measured 2026-09-26)

Source: the live IndexedDB of `https://ernop.github.io` (where the player
plays; the local `127.0.0.1:8018` origin had no games after 2026-09-07),
copied and decoded read-only. 1,692 Expert games (`30x16/99@standard`) from
2026-08-19 to 2026-09-26; 995 have saved input traces.

**Level.** 163 wins (9.6%). Best 71.031 s (3BV 131, 2026-09-07). Median win
99.6 s; median 3BV/s 1.74, max 2.40. Blocks of 20 wins moved from a median
of 1.67 3BV/s (2026-08-19 to 08-22) to 1.78–1.82 in September: about +0.1
3BV/s over five weeks and 160 wins. Intermediate median win 34.7 s (best
20.8 s); Beginner 8.2 s. [measured]

**Board luck.** Expert 3BV over all 1,692 games: mean 174, median 173, 10th
percentile 150, 25th 160. A published 10-million-game run gives mean 173.9.
[measured; documented, JSMinesweeper author's profile]

**Time = inputs × seconds per input.** The latest 20 wins average about 276
inputs (board-changing clicks plus no-op clicks) at a median 0.347 s each,
1.59 inputs per 3BV: a median IOE (3BV per input, the game data column's
definition) of 0.63. [measured]

**Replay of every input.** Each trace was replayed on its board (the saved
final board, or the board rebuilt from the stored seed and first click with
the game's own `rng.js` and `solver.js`). 973 of 995 traces reproduced their
recorded outcome exactly; the other 22 were changed by a Justice redraw and
were excluded, not approximated. Over 77 replayed wins, a typical 100 s win
spent [measured]:

| Input | Per win | Seconds |
| --- | --- | --- |
| flag placed on a mine | 99.5 | 35.9 |
| chord that opened one cell | 58.8 | 19.0 |
| chord that opened two or more cells | 51.2 | 16.5 |
| left click on a covered cell | 26.5 | 14.3 |
| click on a number still missing a flag | 26.8 | 9.2 |
| click on a number with nothing left to open | 8.3 | 2.2 |
| wrong flags, flag removals, other no-op clicks | 11.6 | 3.9 |

53% of chords opened exactly one cell. Pauses over 1 s: 7.6 per win,
12.8 s. The median gap between inputs was 276 ms (10th percentile 191 ms):
the hand is not the bottleneck. [measured]

Of the underflagged number clicks, 89% were one flag short and the median
gap before them was 269 ms: reflexive "does it chord?" clicks in rhythm, not
slow deliberate ones. [measured]

**Removable inputs.** Removing only inputs that a cheaper sequence of the same
moves would not need (every no-op; every flag removed again, with its removal;
every standing flag no chord used; every standing flag used only by one-cell
chords, whose target a direct click opens for the same one input) leaves 191
of 284 inputs per win (1.09 per 3BV, IOE 0.92). Deleting those inputs' gaps from the
recorded wins gives a median of 68.4 s, and 9 of 77 wins (11.7%) under 60 s,
best 48.9 s. This is arithmetic on recorded games, not a prediction: fewer
flags can slow reading, and choosing which flags pay also costs thought.
[measured]

**Runs thrown away.** Of 638 games that lasted at least 20 s, 163 (25.5%)
were won. Under the game's own fatal-status classifier
(`fatalActionStatusKind`), 70% of the 475 losses among them came while a
proven-safe move was available (44.0% opened a proven mine, 26.1% guessed);
84% of the losses that have a modern classification. Among the latest 400
games: 90 of 113 such losses (80%). Losses after 30 s alone consumed about
7 hours. A chord over a wrong flag was the largest single cause late in games
(23–30% of losses after 10 s). Winning games averaged 1.7–2.0 wrong flags
placed and removed. [measured]

**Openings.** 96% of first clicks were in a corner; 47% of those opened a
zero (the theoretical rate is about 50%). Wins after an opening: 64 of 453
(14.1%); after a numbered first click: 13 of 520 (2.5%). Losses under 10 s
cost 0.5 hours in total, so early guessing costs attempts more than time.
[measured]

**Style evidence inside this history.** 110 Beginner wins with no flags were
slower than flagged ones (1.52 vs 1.89 3BV/s) because the input rate fell
from 3.3 to 2.2 per second. The flag-and-chord rhythm is fast; switching to
pure no-flag play would give that up. The comparison is uncontrolled (other
dates and conditions). [measured]

**No usable effect** of minutes into a session, time of day, or the two
mouse tags on conversion or 3BV/s: differences were within noise or
confounded with practice date. [measured]

## 2. Minesweeper community and solver evidence

- **Definitions.** 3BV is the minimum left clicks to clear a board; IOE =
  3BV / total clicks; throughput = 3BV / effective clicks; correctness =
  effective / total clicks; ZiNi variants are flagger minimums.
  [documented, minesweepergame.com statistics]
- **Efficient flagging.** "The first rule is to never flag a mine unless you
  are going to chord on it to open more squares"; chord only on numbers that
  clear squares; switch between flagging and no-flag locally (low numbers
  favor chording, high numbers favor direct clicks); practice slowly at first
  for efficiency. [documented, minesweepergame.com efficiency strategy]
- **The counting rule.** Flag and chord when the chord clears more cells than
  the flags it needs (one flag for two clears, two for three); otherwise click
  directly; when equal, flag, because a flag may serve later chords, and flags
  with more uncleared neighbors are the most reusable. [community claim,
  "Minesweeper: How to play fast AND efficiently" parts 1 and 2, YouTube]
- **At the 60-second wall.** Players report needing a board under about 150
  3BV with few openings and no forced guess; cutting from 30–40 flags to
  15–20 kept efficiency near maximum; cleaner mouse paths without back and
  forth; one warns that pure no-flag practice builds a different strategy.
  [community claim, r/Minesweeper "Anyone feeling a wall at 60 second?"]
- **Clicks per second is not the limit.** Sub-60 is reported at under 2
  clicks/s; at 3 clicks/s a 130-3BV board needs about 70% efficiency; the
  advice is efficiency first. [community claim, r/Minesweeper "How realistic
  is a sub 60 expert clear?"] Top Expert records are about 90% left clicks
  with 10–15 flags. [community claim, r/Minesweeper "Is there a way to know
  when it's faster to flag or not to flag?"]
- **Rules of this clone and minesweeper.online Standard.** The first click is
  safe but not guaranteed to open; chording is a left click on a satisfied
  number (configurable there); minesweeper.online ranks Expert games only at
  3BV 100 or more. [documented, minesweeper.online gameplay help and
  docs/product/design-axis.md]
- **Win-rate ceiling.** David Hill's Java solver wins 41% of classic Expert
  games (safe corner start) and 54.3% with a guaranteed opening; 41.043% over
  10 million classic games; a classic Expert win needs 3.3 guesses on
  average. [documented, JSMinesweeper README and author's published results]

## 3. Skill-acquisition evidence

- **Deliberate practice** (structured activity designed to improve performance)
  explained 26% of performance variance in games (r = .51), more than music,
  sports, education, or professions, and most in predictable task
  environments; 24% for games after the 2018 corrigendum. Important, not
  everything. [documented, Macnamara, Hambrick & Oswald 2014, Psychological
  Science 25:1608–1618, doi:10.1177/0956797614535810]
- **Spacing and exploration in an online game** (N = 854,064): players who
  split their first ten plays over more than 24 hours scored higher later
  (d = 0.11); the 24-hour spacing benefit was about 50% extra practice at that
  stage;   greater variation in early scores went with higher later scores
  (r = 0.59), read as exploration before exploitation. Observational.
  [documented, Stafford & Dewar 2014, Psychological Science 25:511–518,
  doi:10.1177/0956797613511466] The exploration result did not replicate in
  Destiny data (Stafford et al. 2017, CogSci), while spacing did; breaks
  containing sleep were no better than equal daytime breaks (Stafford &
  Haasnoot 2017, Topics in Cognitive Science, doi:10.1111/tops.12232). †
- **Daily dose in a mouse-aiming game** (Aim Lab, N = 7,174): the next-day
  benefit peaked near one hour of play a day, with about 90% of it by 30–50
  minutes; about 40% of a day's gain was retained after day 10; accuracy
  saturated within days while the speed-accuracy product kept improving through
  day 60. Summarized in `reference/esports-mouse-training.md`. [documented,
  Listman et al. 2021, Frontiers in Human Neuroscience,
  doi:10.3389/fnhum.2021.777779]

- **More from a delegated research pass (†, sources in that pass's
  citations; not individually re-fetched here):**
  - Expert 3BV over 10¹² random boards: mean 173.6, SD 19.4; 11.6% of boards
    at 150 or less, 4.0% at 140 or less (minesweepergame.com forum t=1225).
    This matches the player's own 10th percentile of 150.
  - Documented paths to a first sub-60: about 7 months from sub-70 to sub-60
    (minesweeper.online profile of haru.), about a year from 96 s to 55 s
    (Stephan Bechtel's published record, where sub-60s were about 2% of wins
    at a 75–80 s median), and "after 507 days" (r/Minesweeper).
  - "Safety chords" (clicking a number to check it) are the first habit
    efficiency guides remove; the 1.5-click technique serves two-button
    chording and does not apply to this clone's single left-click chord.
  - One 1-hour session a day was the most efficient typing-training schedule
    (Baddeley & Longman 1978); play quality falls across consecutive matches
    before players report fatigue (Bikas et al. 2023; Matsui et al. 2024).
  - Task-level feedback helps on average but 38% of feedback interventions
    hurt, mostly when aimed at the person (Kluger & DeNisi 1996); practising
    faster than comfortable has no primary study behind it (the "OK plateau"
    and the 10–15% typing experiment trace to a popular book, Foer 2011).
  - Timed recognition drills cut classification times sharply (Kellman &
    Kaiser 1994) and interleaving look-alike categories helps (Brunmair &
    Richter 2019), but far transfer is near zero (Sala & Gobet 2017): drills
    should come from positions in the player's own games.

## 4. How the evidence became the plan

- **Economy first.** The measured gap from about 98 s to 60 s is mostly inputs
  (87 removable per win), not hand speed; primary strategy sources put
  "never flag unless you chord" first. Stage 1 targets IOE 0.91 (1.10 inputs
  per 3BV), the value the removable-input arithmetic gives on this player's
  own wins.
- **Keep flag-and-chord; do not switch to no-flag.** This player's no-flag
  games were slower, sources warn that pure no-flag practice trains a
  different strategy, and efficient flaggers match no-flag efficiency.
  The counting rule removes the waste while keeping the fast rhythm.
- **Then conversion.** With 25% of started runs won and most of the rest lost
  with a safe move available, every run finished multiplies the chances at a
  low-3BV board. Stage 2 uses the same fatal classifier as the game's report.
- **Speed last.** Once waste is gone, pauses (8 per win, 14 s) and reading
  speed are the remaining time. Stage 3's 2.8 3BV/s at IOE 0.91 means about
  0.325 s per input and a median win near 62 s on a 173-3BV board.
- **Restart numbered starts.** A numbered first click produced 2.5% wins
  against 14.1%; a restart costs about a second and leaves no record.
- **Dose and spacing.** 45–60 minutes most days, split when longer, following
  the dose-response and spacing results.
- **Rejected:** grinding more Expert games unchanged (five weeks moved 3BV/s
  by about 0.1); speed drills before economy (the hands already average
  0.35 s per input); an immediate switch to no-flag play (see above).

## Sources

- https://minesweepergame.com/statistics.php
- https://minesweepergame.com/strategy/efficiency.php
- https://minesweepergame.com/strategy/no-flags.php
- https://minesweeper.online/help/gameplay
- https://minesweeper.online/help/patterns
- https://www.youtube.com/watch?v=waNprVuduEE and https://www.youtube.com/watch?v=jKRydA5zqzI
  ("Minesweeper: How to play fast AND efficiently", parts 1 and 2)
- https://www.youtube.com/watch?v=TX9kKhFjWok ("How to get faster at Minesweeper")
- https://www.reddit.com/r/Minesweeper/comments/pnhm74/anyone_feeling_a_wall_at_60_second/
- https://www.reddit.com/r/Minesweeper/comments/1t864ve/how_realistic_is_a_sub_60_expert_clear/
- https://www.reddit.com/r/Minesweeper/comments/ewko7n/is_there_a_way_to_know_when_its_faster_to_flag_or/
- https://github.com/DavidNHill/JSMinesweeper and https://minesweeper.online/player/567348
- https://doi.org/10.1177/0956797614535810 (Macnamara, Hambrick & Oswald 2014)
- https://doi.org/10.1177/0956797613511466 and
  https://eprints.whiterose.ac.uk/id/eprint/83582/ (Stafford & Dewar 2014)
- https://doi.org/10.3389/fnhum.2021.777779 (Listman et al. 2021)

# Switching between marking and clicking: study (2026-09-28)

The study behind the stats panel's switch cost
([Switching](../docs/product/trace-metrics-panel.md#switching-creator-request-and-approval-2026-09-28)).
Creator question: does switching between marking (flag, right button) and
clicking or chording (left button) cost time, and is its frequency a useful
performance stat?

## Data and timing

- The player's traces on the development machine (one player): 2,548
  standard games on the three standard boards, 2026-08-20 to 2026-09-26, in
  43 sessions, with 90,798 timed transitions. Left out: games without a seed
  (246), replays that diverged under Justice redraws (46), other play modes.
- 3,498 Expert wins by 545 players from the saolei.wang replay corpus
  (Arbiter replays, 10 ms), for a between-player check.
- Timing: handler times at 1 ms (Firefox). Where the browser's event time is
  recorded (the newest games), the page adds a median 1 ms (99th percentile
  3-4 ms). 99.92% of recorded button positions lie inside their cell.

## Design

The primary model, secondary analyses, and a smallest effect of interest (3%)
were written down before any interval statistic was computed. Exploratory
patterns were looked for in half of the games (split by game) and each was
tested once on the other half.

A transition is two consecutive board inputs that are both moves (reveal,
chord, flag) with no other input between them, timed press to press and kept
within 40 ms to 5 s. Model P1: least squares on the log interval with game
fixed effects; previous and next move type; the button switch S and the
same-button change of move T; splines of the Fitts index, of the cells the
previous move opened, and of board progress; whether the previous move opened
an empty region; whether single-number logic offered the next target; and
what the visible board offered. Errors are clustered by session.

## Results

- **Switching costs time.** A button switch lengthens the interval by 8.4%
  (95% 7.7 to 9.1), about 20 ms. Every subgroup gave 7.4% to 9.5%, every
  specification 8.3% to 15.4% (the high end without covariates: switches are
  longer moves).
- **The next move dominates.** A chord starts 64-98 ms sooner than a flag,
  so flag then chord (254 ms adjusted) is faster than flag then flag
  (318 ms). The switch cost shows only with the next move held fixed.
- **Distance** (confirmed on the held-out half). Within 2 cells +11.1% (10.0
  to 12.2); 3 or more cells +0.6% (-1.1 to 2.4). A chord opens every covered
  neighbour of its number, so chord then flag cannot occur at 1 cell.
- **Flag and chord pairs** (88% of switches) cost about 13 ms: flag then
  chord +4.3% at 1 cell and +17.5% at 2; chord then flag +6.7% at 2 cells;
  nothing measurable at 3 or more. Switches that involve a reveal cost 20% to
  55%, and reveal to chord on the same button costs +20.7%, so that part is
  about reveals, not buttons.
- **Where the time goes.** The extra time is spread over the pause before
  moving (+8 ms), the movement (+7 ms), and the dwell on the target (+7 ms).
  This fits preparation done in parallel with moving, the task-switching
  preparation effect (Rogers and Monsell 1995; Meiran 1996; Monsell 2003).
- **Other held-out confirmations.** The cost remains when the next target
  was already available before the previous move (+10.9%), and it shrinks as
  the board fills.
- **Frequency.** The per-game switch rate (median 52% to 55%) mostly follows
  how often the player flags. Switching relative to chance (about 1.1 times)
  did not track speed on won games. A single game's switch cost or switch
  index has split-half reliability near zero.
- **Other players.** Alternation relative to chance was unrelated to speed
  across players (Spearman -0.01, 95% -0.13 to 0.12). At equal flag share,
  faster players alternated more (+0.37, 0.23 to 0.48), and faster players
  flag much less (-0.66).

## What was built

The panel pools the latest 500 standard games with P1 (game fixed effects,
game-clustered errors; details in the spec). On the study's latest 500 games
it reads +7.4% (+6.4 to +8.4), +18 ms per switch, 54% of moves switching.
The independent reference fit (`analysis/switch-cost/reference.py`) matches
the game's to 4e-13 on those games.

## Limitations

- One player on one setup. The corpus is another population with another
  chord technique (both buttons).
- The player chooses when to switch, so the estimates are associations given
  the measured covariates, not an assigned-switch experiment.
- Transition types have different distance profiles, so the pooled value is
  a weighted summary. The sign and the distance pattern are the robust
  findings.
- Handler times include page delay, which only the newest games measure.

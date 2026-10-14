# Judgment problems — judging the player's own games

Creator request 2026-10-14: "let's make a new type of problem! let's
actually iteratively do this. please select tons of interesting losses/wins
and for each one, show 1 or more specific interesting situations (either the
moment of loss, or other moments) and then quiz the user about how this game
should be judged?" A win can still hide a bad choice: "if they COULD have
done something safe & probably useful but rather chose to guess, that'll be
bad, and the right answer would reflect that". At least 100 problems of every
kind, so the answers can settle how to sort every game started into its
outcome (BACKLOG.md, "Game results as one tree per board type").

## Run

```
node analysis/judgment/build-problems.js <minesweeper-friendly-history-*.json> \
     [--out analysis/judgment/judgment-problems.json] [--survey]
```

Then open `http://127.0.0.1:8018/analysis/judgment/judge.html` on the local
origin. `--survey` prints how many games each kind could draw from and writes
nothing. Node only, standard library plus the game's own `justice.js`,
`odds.js`, `solver.js`, `rng.js`, and the `GAME-END EVALUATION: VERDICT` span
of `game/evaluation.js`. On the 2026-10-11 export (6,817 games with full
evidence) a build takes about 3 s and writes 163 problems (1.1 MB).

The bank, `judgment-problems.json` beside the page, is committed: answers
refer to its problems, so every version they were given against stays in git
history (`bankId` names the version). The games and the creator's judgments
are not private (creator, 2026-10-14: "its only me doing this and my
minesweeper opinions are rather public"). Only the creator answers, so the
page stays out of `deploy/runtime-files.json` and the hosted site. The page
fails with the build command when the bank is missing.

## A problem

One game: its board size, result, date, game time, and 3BV, then up to three
moves from its saved action evaluations, each shown on the visible board
before the move (the move's square ringed in magenta; for a chord, the
number, with the squares it opened shaded). A loss always includes its fatal
move. A clean win has no saved moves, so it shows its final board, rebuilt
from the seed (only games without a Just Universe redraw).

Questions: for every move, best available, fine, poor, blunder, or can't
tell; for the game, a category (losses: known death, unnecessary gamble,
worse gamble, best gamble, trusted a guessed flag; wins: clean, clean with
forced guesses, won despite a worse gamble, won despite an unnecessary
gamble; both: none of these), how much of the result came from the player's
choices, and a note. Enter shows the analysis, then the next problem.

The analysis prints every covered square's mine chance on the boards (the
lowest in blue), rings proven-safe squares green, proven mines red, the
lowest-risk squares blue and the squares the one-step model rates more
informative orange when there are at most 12, and crosses flags the numbers
contradict. Each move lists what it was judged as, the risk taken and the
lowest available, proof levels, the avoidable share of the risk, the one-step
model, flags, likely misclicks, and the game's own tags. The game lists the
proposed category (the dashed ring among the answers), the share or avoidable
risk, the guess count, what the game's report says today, and the kind the
problem was picked as.

## How problems are picked

`STRATA` in the builder names 45 kinds of game: losses on a proven mine by
proof level and phase, with no safe square, at the last squares, after a
wrong-flag slip or a wrong-button click, through a contradicted flag, on a
guessed flag; needless guesses by proof level, phase, and size of risk;
riskier guesses fast or slow in the opening, barely riskier, near or far
mid-game, in the endgame, or rated more informative; the lowest-risk guess
in each phase and the endgame coin flip; deaths after surviving avoidable
risk or through an earlier wrong flag; and the matching kinds of win, plus
clean wins. Scarce kinds choose first; each kind's quota spreads over the
three sizes and over its range (smallest to largest risk ratio, for example).
The order of problems is a fixed shuffle.

## Measurement notes

- Records saved before 2026-10-11 stored the one-step expected life as a bare
  survival tie where the model never ran (`odds.js` now omits it). The builder
  recomputes the comparison from the saved position with the game's own
  `Odds.scoreGuess` call, so only real comparisons appear.
- The guess ledger's `lifeLost` and `lifeNeedless` deliberately keep raw mine
  chances under A Just Universe ([per-game stats](../../docs/product/per-game-stats.md),
  "Life lost"), and every game in the bank had it on. A win's machine figure
  is therefore the avoidable risk of its saved riskier guesses, each under
  the active rules, not a share of the ledger.
- The time since the previous move is known only when that move was saved too
  (or for the second move, timed from the first click), so timing picks only
  the opening's riskier guesses.

## Answers

Answers save on every change in this browser's IndexedDB
(`minesweeper-judgments`, store `answers`, one record per problem keyed by its
game, `<board key>|<endedAt>`, so they survive a rebuilt bank). Each record
keeps the answer as first given before the analysis (`blind`) and as it stands
(`answer`: `ratings` by move number, `category`, `share`, `note`). Export
answers downloads `minesweeper-judgment-answers-<date>.json`
(`format: 'minesweeper-judgment-answers'`, version 1). Every export holds all
the answers so far, so the latest is committed as `judgment-answers.json`
beside the bank, replacing the one before.

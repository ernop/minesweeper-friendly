# JSMinesweeper review (2026-11-02)

David N Hill's JSMinesweeper, https://github.com/DavidNHill/JSMinesweeper,
read at commit `c30bd65` (2026-10-04, "Added ability to see probability
breakdown by value"), MIT license. It is a player and an analyzer of any
position the user builds, with a solver that suggests or plays moves. Its
README reports a 41% win rate for the Java original on classic Expert
(safe start in a corner) and 54.3% with an opening start at (3,3); the
JavaScript version is described as slightly weaker. The files read:
`solver_probability_engine.js`, `solver_main.js`, `BruteForceAnalysis.js`,
`Brute_force.js`, `FiftyFiftyHelper.js`, `LongTermRiskHelper.js`,
`EfficiencyHelper.js`, `SolutionCounter.js`, `main.js`,
`MinesweeperGame.js`, `index.html`, and `README.md`.

The creator asked for the review and for its "proper, logical, and not-random
nor artificially limited system of calculation of best moves" to be brought
into this game (2026-11-02). What was taken is described below and in the
area files it changed; the traits not taken are in [BACKLOG.md](../BACKLOG.md),
"JSMinesweeper traits not built". No code was copied: the method was
reimplemented in `justice.js` to this repository's terms and rules.

## How it calculates

- **Trivial analysis.** A number with all its mines found clears its other
  squares; a number with room only for its mines marks them.
- **Probability engine** (`solver_probability_engine.js`). Exact, with no
  work limit. Covered squares beside exactly the same revealed numbers form
  one box; numbers ("witnesses") are processed in an order that keeps few
  of them open at once; partial layouts that leave every open number the
  same need merge into one count; counts are BigInts by mine count, joined
  with the squares no number touches by binomials. Its cost grows with how
  many revealed numbers string together, not with the number of layouts
  (its README: 50x50/500 is fine, 100x100/2500 may struggle). Deciding
  whether a position is consistent is NP-complete (Kaye 2000), so no exact
  method avoids a bad worst case.
- **Dead squares.** A covered square that is a mine in every layout, or
  shows the same number in every layout that leaves it safe, is "dead": it
  teaches nothing, and choosing one is never correct while a square that
  can teach something remains.
- **50/50 detection** (`FiftyFiftyHelper.js`). By patterns: extended
  two-square 50/50s, enclosed 2x2 boxes holding 2 mines, and two-square
  and 2x2 pseudo-50/50s (squares either safe or part of a 50/50). Its README
  says it cannot find extended pseudo-50/50s. Such guesses are taken first,
  since waiting cannot improve them.
- **Guess choice** (`solver_main.js`, `tieBreak`, `secondarySafetyAnalysis`).
  Candidates are the squares within 0.1 of the best survival chance among
  squares that can still teach something (its README says within 10%),
  plus squares that affect a 50/50 (long-term risk,
  `LongTermRiskHelper.js`). For each candidate the engine is rerun for each
  number it could show, giving:
  - secondary safety: the chance of surviving this guess and then the
    safest square that can still teach something;
  - progress: the chance the next position has a proven-safe square;
  - blended safety: the safest and second-safest next squares weighted
    4 to 1, scaled by a 50/50 influence factor.
  The score is blended safety × (1 + progress × 0.2). The weights are
  tuned by experiment, not derived from an objective ("not perfect but has
  been empirically shown to provide better results than merely picking the
  safest tile"). A candidate whose best possible score falls below the best
  found is skipped.
- **Perfect play** (`BruteForceAnalysis.js`, `Brute_force.js`). Plays every
  sequence of guesses against every remaining layout and returns the best
  guess and the exact chance to win. It runs only while fewer than 1,000
  layouts remain in play (`PLAY_BFDA_THRESHOLD`; its README says 750); its
  analyzer has a setting from 0 to 20,000 (5,000 by default). Listing the
  layouts stops after 75,000,000 cycles and the search after 100,000,000
  nodes; past any of these the guess choice above decides. Dead squares
  and pruning are options there.
- **Efficiency** (`EfficiencyHelper.js`). Play styles that choose flags and
  chords to minimize clicks, with or without chording.
- **Other features.** No-guess board generation, fast mode (trivial moves
  played automatically), hints, auto play, seeds, MBF and ABF board files
  (MinesweeperX and Arbiter formats), positions in the URL, and, since
  2026-10-04, each square's chance of showing each number.

## Compared with this game before 2026-11-02

- **Odds.** `odds.js` listed layouts one by one, up to 22 squares per group
  or 250,000 steps, and recorded "not measured" beyond. On the guesses of
  simulated Expert games in `tests/win-chances-bench.js`, 121 of 387 had no
  odds.
- **Proofs.** The exact level of the move hierarchy (`Justice.proveLevels`)
  searched with a 2,000,000-visit limit; past it, the level and the levels
  above it were unmeasured at that moment.
- **One-move life** (the guess ledger's "perfect play"; JSMinesweeper's
  secondary safety, taken over every covered square). Scored exactly only
  where every covered neighbor of the square was proven or in its group,
  and up to 40 undecided squares; elsewhere it used an average-density
  estimate or bare survival, and on forced-guess endgames its verdict was
  wrong for 7.8% of Intermediate and 11.4% of Expert guesses (measured
  2026-10-22).
- **Perfect play's chance to win** (`Odds.winChances`, the live perf
  charts' guess card). Exact, split into independent parts since
  2026-10-27, and limited to 100,000 units of work; JSMinesweeper limits
  the same search to 1,000 layouts in play.
- **Guesses nothing could settle.** A just universe's certification
  (`Justice.certifyEntries`) decides exactly whether anything on the board
  could ever settle a square, which covers the 50/50 and pseudo-50/50
  patterns, extended ones included.

## Taken on 2026-11-02

- **The exact counter** (`justice.js`, "LAYOUT COUNTS"): one counter for
  the proof, the odds, and one-move life, with no work limit. The proof's
  facts are the boxes counted mine-free or full. Every guess is measured
  (`guess-ledger-v3`). Notes: [per-game stats](../docs/implementation/per-game-stats.md),
  "Guess ledger"; [play modes](../docs/product/play-modes.md); [design
  axis](../docs/product/design-axis.md), "Move hierarchy".
- **Exact one-move life for every covered square.** Not limited to squares
  near the safest: a square is skipped only when its survival chance is
  below the best value found, which bounds its value exactly. Ties are
  decided by exact counts. A median 0.6 ms and at most 15 ms an Expert
  guess in Node. Since 2026-11-03 it runs at game end in the reports
  worker, with the rest of the judgment, never on the click
  ([Game-end evaluation](../docs/product/game-end-evaluation.md), "When it
  is judged"). JSMinesweeper scores guesses during play because it
  recommends moves; this game only judges them afterwards.
- **Dead squares in perfect play's search** (`Odds.winChances`): the
  search never guesses a dead square, and a part with no live square left
  wins exactly one of its layouts. On the guesses of
  `tests/win-chances-bench.js` it computes 116 of 387 Expert guesses where
  the published release computed 89, agreeing exactly on every guess both
  compute ([live perf charts notes](../docs/implementation/during-game.md)).

## Not taken, and why

- **The blended guess score.** A weighted heuristic, not a fact any count
  defines, so it cannot be shown as the best move under design requirement
  8 (exact values). This game measures exact objectives instead: survival,
  one-move life, and perfect play's chance to win.
- **Pattern-based 50/50 detection.** A just universe's certification is
  exact and covers more cases.
- **No-guess generation.** The creator removed the no-guess modes on
  2026-10-21.
- **Hints, auto play, fast mode.** The game measures the player's own play;
  moves the game makes or suggests during a game would change what is
  measured. Not proposed; the creator's to decide.
- **A higher limit on perfect play's search.** JSMinesweeper limits it more
  tightly than this game does. Raising this game's limit is a creator
  decision ([BACKLOG.md](../BACKLOG.md), "Deeper than one-move perfect
  play", with the 2026-11-03 timing of 4,703 saved guesses: 1,000 times
  the limit computes 2 to 4 more guesses in 100 at up to 18 s a guess).

# Design axis and solver tiers

Product spec section; index: [PRODUCT.md](../../PRODUCT.md).

A minesweeper project growing out of research into solver-aware game modes
(2026-08-19 session). Reference point: minesweeper.online's "no guessing" (NG)
mode, where the generator verifies with a logical solver that every board is
completable without guessing.

The design axis mapped so far, ordered by who bears the burden of ambiguity:

1. Naive random — mines fixed, no guarantees.
2. First-click safe — standard mode today; opening never kills.
3. No-guess (NG) — a complete logical path is guaranteed at generation time
   (minesweeper.online NG, Simon Tatham's Mines).
4. Evil NG — additionally guarantees a difficulty floor (at least one advanced
   deduction per board).
5. Graded NG (unbuilt: score by hardest required technique, as Sudoku
   grading does). Built 2026-08-21: uniform-hardness NG, single-path NG,
   proof-or-die NG (opening a not-provably-safe cell kills even if empty).
6. Kaboom (pwmarcz.pl/kaboom) — adversarial: mines stay unfixed; any unforced
   guess is a mine, forced guesses are always safe. Unbuilt.
7. The angelic dual of Kaboom: any guess consistent with your information
   succeeds; you die only by contradicting known facts. First step
   implemented 2026-08-20 as "A just universe" ([just-universe.md](just-universe.md)): certified
   sealed-pocket entries are guaranteed safe; open-field gambles and all
   chords stay deadly. The rest of the dual is the Angelic play mode
   (2026-08-21): a cell that is not a proven mine is made safe.

The repo name points at entry 7 and its neighbors: variants friendlier than
standard play.

## Solver logic tiers

Solver logic tiers (what "solvable" means): (a) direct clue counting;
(b) arbitrary overlap-difference deduction (strict subsets and named
patterns are special cases); (c) exhaustive frontier-component constraint
search joined through the global mine count and unconstrained sea.
Completed tier-(c) results capture every fact common to all layouts
consistent with the player's visible information. NG generation is generate → solve → reject/repair →
repeat. One derived result from the session: a 1-2…2-1 wall chain with k twos
is fully forced unless k ≡ 0 (mod 3), in which case only every third cell is a
forced mine.

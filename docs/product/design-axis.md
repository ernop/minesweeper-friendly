# Design axis and deduction levels

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
   grading does). Uniform NG, Single-path NG, and Proof-or-die were built
   2026-08-21 and removed 2026-10-21 with the generate-and-reject method that
   made their boards ([play-modes.md](play-modes.md), "No-guess modes").
6. Kaboom (pwmarcz.pl/kaboom) — adversarial: mines stay unfixed; any unforced
   guess is a mine, forced guesses are always safe. Unbuilt.
7. The angelic dual of Kaboom: any guess consistent with your information
   succeeds; you die only by contradicting known facts. First step
   implemented 2026-08-20 as "A just universe" ([just-universe.md](just-universe.md)): clicks
   into a guess that nothing else on the board could ever settle are
   guaranteed safe; open-field gambles and all
   chords stay deadly. The rest of the dual is the Angelic play mode
   (2026-08-21): a cell that is not a proven mine is made safe.

The repo name points at entry 7 and its neighbors: variants friendlier than
standard play.

## Deduction levels

The deduction levels grade how hard a fact of the visible board is to
know, and together they define "solvable": what the last level proves is
every fact common to all layouts consistent with the player's visible
information. They replace the solver logic tiers of 2026-08-19, whose
tier (c), exhaustive search joined through the mine total, is split into
levels 3 and 4.

Creator request 2026-10-26, verbatim, with the live perf charts' moves
available ([During the game](during-game.md), "Revision (creator
2026-10-26)"): "ov erall we need to logicallyc haracterize the difficulty
of "knowing" different knowable things about the board. t aht is ,
"marking a 1 which only adjoins oner empty square" is the easiest type.
2nd level complexity might be for this side shapee:

```
unknown ^^^
1 2 2 1
0 0 0 0
```

the line marked "unkonwdn" is resolvable as "open, mine, mine, open' but
this is not as simple as t he prior type. we should construct a
well-bordered complexity leel system and develop ths further. higher
levels include thins like realizing whole-board implications; middler
level difficulty would be things like collecting disparate distant facts
aabout empty/open andnot icing multi-step contradictions. as the
whole-board calc is np-complette, they can be complex. still, our
actualboards are small enough that we shan't be put off by that and
rather should bully our way through."

Each level adds one kind of reasoning to the level before it, so each
proves every fact the levels below it prove. A fact's level is the first
level that proves it. The levels read only the open numbers and the
board's mine count: a flag is the player's note, not proof. Every level is
computed exactly, the last two by searching every layout (no estimate, no
sampling); a search that reaches its work limit leaves its level, and the
levels above it, unmeasured rather than guessed.

1. **Counting**: one number at a time. A number whose covered squares
   must all be mines (as many as its count, less the mines already proven
   beside it) proves them mines; a number with all its mines proven proves
   its other covered squares safe; repeated while it proves more. A 1 with
   one covered square beside it, or a 2 with two, is counting.
2. **Overlap**: counting, plus comparing any two numbers whose covered
   squares overlap. The squares they share hold no more mines than the
   second number still needs, so the first number's own squares hold at
   least the difference of the two; when that difference equals how many
   own squares it has, they are all mines and the second number's own
   squares are all safe. A number whose squares lie inside another's is one
   case. The creator's wall is level 2: the
   left 1 covers the first two squares and the 2 beside it the first three,
   so the third holds a mine; the right side gives the second the same way;
   then each 1 has its mine, and the end squares are safe. (A 1 2…2 1 wall
   with k twos is fully forced unless k ≡ 0 (mod 3), when only every third
   square is a forced mine; result of 2026-08-19.)
3. **All numbers**: every layout of mines all the numbers allow together,
   whatever its mine count. A square that is a mine in every such layout,
   or safe in every one, is known, however far apart the numbers proving
   it lie and however many steps its contradiction takes. The search runs
   per group of covered squares the numbers link, exhaustively.
4. **Mine total**: only the layouts that also hold the board's mine count.
   It decides between layouts whose mine counts differ, and it can prove
   squares no number touches.

Worked examples, from the tests (`tests/justice-test.js`, "Deduction
levels"); letters are covered squares, a dot an open zero:

```
2 a 1 .      Level 3. The two top numbers give b by overlap (a + c = 1
b c 2 1      inside a + b + c = 2). The middle 2 covers a, c, d, e, f;
2 d e f      the 1 above it puts one mine in a and c, the 1 at its right
             one in e and f: that is both of its mines, so d is safe, then
             c is a mine and a safe. Three numbers together prove d; no
             two do. e and f stay unknown even with the mine total.

. . 1 2 a    Level 4, with 2 mines on the board. Counting proves the mine
. . 1 * b    between the 1s; each 2 then needs one more mine, either b
. . 1 2 c    alone or a and c both. Only the board's 2 mines rule out a
             and c.
```

How often each level is needed, measured 2026-10-26 with the prover on
simulated games (every proven-safe square opened, otherwise a random
square not proven a mine; each position's facts counted at the first level
proving them):

| Board | Positions | Counting | Overlap | All numbers | Mine total |
| --- | --- | --- | --- | --- | --- |
| Expert, 40 games | 777 | 94.8% | 4.93% | 0.17% | 0.09% |
| Intermediate, 100 games | 928 | 93.1% | 5.91% | 0.10% | 0.91% |
| Beginner, 200 games | 858 | 85.8% | 7.73% | 0.11% | 6.34% |

No search reached its work limit: on boards this size the exhaustive
search is cheap, as the creator expected. All four levels, computed in one
pass, took 0.03 ms per position on average on Beginner and 0.14 ms on
Expert. Level 3 matched an independent brute-force search at every
position whose linked groups were small enough for one (2,491 of 2,563).

Where they are used: the live perf charts count the moves available by
level ([During the game](during-game.md)). The game-end evaluation's
stored proof tiers keep three grades: `counting` and `overlap` are levels 1
and 2, and `whole-board` is levels 3 and 4 together
([Game-end evaluation](game-end-evaluation.md)); telling those two apart
there is a proposal in [BACKLOG.md](../../BACKLOG.md).

# Design axis, deduction levels, and move hierarchy

Product spec section; index: [PRODUCT.md](../../PRODUCT.md).

## Ambiguity design axis

Ordered by who bears the burden of ambiguity on a board:

1. **Naive random** — mines fixed, no guarantees.
2. **First-click safe** — Standard mode; the opening never kills.
3. **No-guess (NG)** — generator guarantees a complete logical path at generation time.
4. **Evil NG** — adds a minimum deduction-difficulty floor per board.
5. **Graded NG** — scores boards by hardest required technique (earlier reject-sampled NG modes were removed on `2026-10-21`; [Play modes](play-modes.md#removed-no-guess-modes-legacy-history-compatibility)).
6. **Kaboom** (unbuilt) — adversarial unfixed mines: unforced guesses kill, forced guesses survive.
7. **Angelic dual of Kaboom** — guesses consistent with visible information succeed; death occurs only by contradicting known facts. [Guardian Angel](guardian-angel.md) covers clicks into guesses nothing else on the board could ever settle (open-field gambles and chords stay deadly); [Angelic mode](play-modes.md#angelic-angelic) extends protection to every non-proven-mine click.

## Deduction levels

Four cumulative, exact complexity grades (`GuardianAngel.DEDUCTION_LEVELS`) defining how hard each fact of the visible board is to know and what `"solvable"` means. Each level includes all facts proved by earlier levels; a fact's level is the first level proving it. Proofs read only open numbers and the board mine total (flags are player notes, never proof) and run with no work limit via exact frontier layout counting ([Play modes](play-modes.md#visible-information-solver)):

1. **Counting:** single-number reasoning repeated to closure. A number whose remaining mine count equals its remaining covered neighbors proves them mines; a number with all mines proven proves its other covered neighbors safe.
2. **Overlap:** counting plus pairwise comparison of any two overlapping numbers. If number A's remaining need minus number B's remaining need equals A's exclusive covered squares, A's exclusive squares are all mines and B's exclusive squares are all safe (includes subset constraints and `1-2-2-1` walls; a `1-2…2-1` wall with $k$ twos is fully forced unless $k \equiv 0 \pmod 3$, where every third square is a forced mine).
3. **All numbers:** every consistent mine layout allowed by all open numbers per connected frontier component, ignoring the global mine total — captures arbitrary multi-clue chains and distant contradictions.
4. **Mine total:** restricts layouts to those matching the board's total mine count, deciding between differing component mine totals and proving squares untouched by open numbers.

Worked examples (`tests/guardian-angel-test.js`):

```
2 a 1 .      Level 3 (All numbers). Overlap gives b; the top 1 holds 1 mine in
b c 2 1      {a, c} and the right 1 holds 1 in {e, f}, supplying both mines of
2 d e f      the center 2, so d is safe, then c is a mine and a is safe.

. . 1 2 a    Level 4 (Mine total = 2). Counting proves the mine between the 1s;
. . 1 * b    each 2 needs one more mine: either {b} or {a, c}. Only the global
. . 1 2 c    mine count of 2 rules out {a, c}.
```

- **Where used:** [live perf charts](during-game.md) count available moves across all 4 levels; [game-end evaluation](game-end-evaluation.md#loss-types) persists 3 proof tiers (`counting`, `overlap`, and combined `whole-board` for levels 3–4). Simulated games show ~86–95% of proven facts resolve at Counting, ~5–8% at Overlap, and <1% at All numbers (Mine total ~0.1% on Expert up to ~6% on Beginner).

## Move hierarchy

Six progressively stronger criteria characterizing every move available at any board state:

1. **Proven moves:** squares provably safe or mined, graded by the four deduction levels above (built: [live perf charts](during-game.md)).
2. **Most useful proven moves:** among proven moves, those yielding the highest `3BV / click` (counting required unflagged mines as clicks for chords). Built: per-moment `most 3BV per click`, `chordable numbers`, and whole-board `ZiNi`/`HZiNi` benchmarks ([Per-game stats](per-game-stats.md)). Unbuilt: scoring each individual player click against the best `3BV / click` ([BACKLOG.md](../../BACKLOG.md#analytics-results-rankings-and-limits)).
3. **Harder proven moves (count, distance, usefulness):** at each deduction level, how many proven moves exist, Manhattan steps from the last board-changing click to the nearest proven-safe square, and best `3BV / click` (built: [live perf charts](during-game.md)).
4. **Hardest deductions:** levels 3 (`all numbers`) and 4 (`mine total`) (built; finer sub-grades in [BACKLOG.md](../../BACKLOG.md#analytics-results-rankings-and-limits)).
5. **Guesses (opening an unproven square):**
   - *Connected vs. disconnected:* beside open numbers vs. away from them (reported with lowest risk in each set on live perf guess cards).
   - *Immediate survival:* lowest mine probability (`ideal-risk` and `lifeNeedless` in [Per-game stats](per-game-stats.md#action-accuracy-misclicks-and-guess-ledger)).
   - *Multi-step win probability with perfect play:* may accept higher immediate risk for higher global win chance. Built exact one-move survival (`guessPerfect`) for every guess, plus exact full-game win chance (`Odds.winChances`, factoring independent components and skipping dead squares) on live perf guess cards wherever it finishes within its `10^5` search budget (reporting explicitly if budget-stopped rather than estimating).
6. **Output per hour ("anthropic principle of move choices"):** among otherwise equal moves, prefer moves that either settle doomed/forced states sooner so the next game starts faster, or yield information that helps the player solve faster. Built for settling sooner: live perf guess cards report when nothing else on the board could settle a guess, how long it waited, and time saved on fixed-mine losses if taken immediately (also reflected in training rules: restart numbered corner openings and take truly forced guesses immediately). Unbuilt: information-usefulness tie-break and output-per-hour move scoring ([BACKLOG.md](../../BACKLOG.md#analytics-results-rankings-and-limits)).

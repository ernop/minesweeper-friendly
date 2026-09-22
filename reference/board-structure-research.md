# Exact board descriptors: fractions, structure, and deduction coverage

Research review, 2026-09-21, following the creator's examples of the fraction
of zeros and ones, and the fraction exposed after clicking every zero.
These proposals are new measurements for this app, not claims of newly
discovered mathematics or established Minesweeper terminology.

## Current status

- **Implemented:** 3BV spread, Human ZiNi, 0–1 share, and zero-opening
  coverage time tables in This board, with values in their headings. HZiNi efficiency
  is separately shown in Game stats. HZiNi itself was already measured;
  adding its table did not invent a new board property. Existing 3BV,
  zeros, clues and mine islands remain. Saved-win backfill shows progress
  and supports partially completed batches across pause/resume and reload.
- **Exact small-board reference only:** the globally optimal opening-first
  click count C₀*. The general production optimizer is still unbuilt.
- **Declined for the current UI:** largest-opening share, remaining work
  clusters, and exact one-/two-clue deduction coverage/depth/all-start
  profiles. Their tested calculators remain research; they are not queued
  additions. Only the two requested fractions from this review were selected.

The executable definitions are in [board-structure-metrics.js](board-structure-metrics.js).
All results are completed counts or rational fractions. There is no proof
range, random seed, chosen scan direction, runtime cutoff, guess policy,
simulated death, hint count, or actual player trace in their definitions.

## 1. Shared conventions

Use a fixed finished board, eight-neighbor adjacency, clipped edges, no wrap.
Let S be the nonempty set of safe cells and N=|S|. Let n(v) be the adjacent
mine count at safe cell v, and H_j={v in S : n(v)=j}. In a mode that changes
mine positions, these describe the finished layout.

**The denominator is safe cells**, because these are the cells that must be
revealed to win. Each fraction means “of safe cells,” not a performance
percentile or a fraction of all grid locations including mines. If the latter
is desired, its distinct value is `safe-cell fraction * N/(width*height)`.
Within one board-size/mine-count score key that conversion is constant.

Keep integer counts and the declared denominator; round only presentation.
A repeat calculation, rotation, reflection, or different enumeration order
must give the same result. These are measurements of specified properties;
none is automatically an overall difficulty score.

## 2. The two requested fractions

### 0–1 share

    P₀₁(B) = (|H₀| + |H₁|) / N.

Count safe cells whose actual clue is zero or one. Include zeros even if the
game draws them blank. Exclude mines. Calculate by scanning the clue counts;
no solver is required. This answers how much of the safe board consists of
the two lowest clues. A large value need not guarantee an easy logical solve.

### Zero-opening coverage

Let Z=H₀. Define

    R₀ = Z union {v in S : v is adjacent to at least one member of Z}.
    P₀(B) = |R₀| / N.

Equivalently, click one still-covered zero in each zero component and take
the union of all resulting zero-and-number floods. Clicking every zero gives
the same revealed set; already-open clicks do not expand it. Shared numbered
borders count once. This includes every exposed number, not only ones.

**No subsequent deduction, flagging, or chording is included.** This is the
immediately exposed fraction; it does not count a covered cell just because
its safety or number might be deducible. With no zeros the value is 0. With
no mines the value is 1. A direct membership scan or flood union both compute
the same count in linear time.

The no-chord work identity supplies an independent cross-check. If O is the
number of zero components and U=S\R₀, then

    3BV = O + |U|,
    P₀ = 1 - (3BV - O)/N.

Thus this fraction is closely related to existing workload, but 3BV alone
does not specify it without opening count. Its complement is remaining work
share, not another independent measurement.

### Small exact examples

| Fixed board | Safe cells | 0–1 share | Zero-opening coverage | Largest-opening share |
| --- | ---: | ---: | ---: | ---: |
| Empty 3×3 | 9 | 9/9 | 9/9 | 9/9 |
| 3×3, one corner mine | 8 | 8/8 | 8/8 | 8/8 |
| 3×3, one center mine | 8 | 8/8 | 0/8 | 0/8 |
| 3×3, mines at upper right and lower left | 7 | 6/7 | 7/7 | 4/7 |
| 2×2, one corner mine | 3 | 3/3 | 0/3 | 0/3 |

The corner-versus-center example separates the creator's two properties:
both have 100% zeros-and-ones, but automatic opening coverage is 100% versus
0%. In the two-mine example, two openings of size 4 share their center clue:
the union is 7, not 8. These examples are checked by the reference tests.

## 3. Further exact structural measurements

**Largest-opening share.** For each zero component i, let O_i be its entire
zero-and-number flood. Define `max_i |O_i| / N`, and explicitly define it as
0 when no zero exists. This is the greatest fraction exposed by one zero
click. It distinguishes one broad opening from several small openings even
when their union covers the same fraction. The chosen starting position does
not enter: all openings are examined and the maximum value is unique.

**Remaining work clusters.** Form the graph on U=S\R₀, joining cells that
touch horizontally, vertically, or diagonally. Count its connected components,
and the size of its largest component (0 for the empty graph). These are
clusters of safe cells requiring individual no-chord work, distinct from
the existing mine islands. They measure how fragmented the remaining work
is. A cluster count is not the minimum number of cursor visits or proof that
a cluster is logically isolated.

**Work-tree length.** The existing research definition uses the minimum
spanning-tree length on the specified 3BV work points. It supplies a separate
spatial descriptor from RMS work spread and has a polynomial exact graph
algorithm. Different optimal trees can tie but have the same length. It
remains a geometric descriptor, not a minimum playable mouse route.

These are preferable initial additions to a composite “difficulty index”:
each has a short interpretation, a unique calculation, and no fitted weights.
Clue histograms, normalized clue variance and other spatial summaries are
also definable, but we should select them for information they add rather
than multiply correlated labels.

## 4. A rigorous logic profile without guessing

The useful change from the retired RCW search is to **fix the allowed reasoning
rule, then compute its closure completely**. Computing exactly what a fixed
one-/two-equation rule proves is a different question from searching for the
minimum number of equations sufficient for arbitrary inference.

For k=1 or k=2, use this exact procedure:

1. Initially reveal R₀, the union of all zero floods. No mines are initially
   known. The reasoner receives only the revealed clues and total mine count;
   it does not receive additional constraints from the seed-selection promise
   that all zeros were chosen.
2. At the beginning of a round, create each revealed cell's original clue
   equation on currently unknown cells. Substitute known mine/safe statuses.
   Also create the remaining global mine-count equation; it counts as **one**
   equation when selecting a subset.
3. Consider every set of at most k equations. For that subset alone, find
   every unknown cell whose Boolean mine value is the same in all satisfying
   assignments. Take the union of those single-cell facts over all subsets.
   Equations outside the subset do not filter its assignments.
4. Apply all these facts simultaneously: record every proved mine and reveal
   every proved-safe cell, including normal zero floods. New observations and
   substitutions become available only in the next round. Retain proved cell
   statuses, not extra derived multi-cell equations, between rounds.
5. Stop when all safe cells are exposed, or a whole round proves nothing new.
   No guess is made. Count only productive rounds, including a round that
   proves mines but no safe cells.

Let R_k be the final revealed set. The scalar is

    k-clue reveal coverage P_k(B) = |R_k| / N.

It follows that `P₀ <= P₁ <= P₂ <= 1`. `P₂-P₁` is the additional fraction
that the two-equation rule unlocks. The corresponding number D_k of productive
parallel rounds records the defined process's dependency depth. Always assess
depth alongside coverage: zero rounds may mean immediate completion or no
deductive progress. Neither quantity counts hints given to a player.

This procedure terminates because every productive round establishes a new
cell status. Every subset is examined and updates are simultaneous, so scan
order, choice among available moves, rotations and reflections cannot affect
the result. The global counter and round convention are part of the definition.
The labels must retain k; a two-clue stall is not proof of forced guessing.

### Why the pair calculation is exact and inexpensive

For two equations `sum(A)=a` and `sum(B)=b`, partition their cells into
A\B, I=A∩B, and B\A. If t is the number of mines in I, the exact feasible
integer interval is

    L = max(0, a-|A\B|, b-|B\A|),
    H = min(|I|, a, b).

The other two group counts are a-t and b-t. All cells in a group are
exchangeable under these two equations. A group is entirely safe when its
maximum feasible count is 0, and entirely mined when its minimum equals its
size. Otherwise no individual cell in that group is forced by the pair.
Every integer t in the interval admits assignments, so this recovers **all**
single-cell consequences of the pair. The interval is internal exact algebra,
not a range displayed as the board metric.

The implementation uses these formulas, not a search stopped after a time
budget. It completes the declared rule for ordinary board sizes. This is an
exact restricted-rule descriptor, not an approximation labelled full inference.

### Removing the all-zero starting assumption

Zero-free boards all have P₀=P₁=P₂=0 under that seed. This is a real property
of the specified experiment, but it does not distinguish their logic after a
first reveal. An exact symmetric alternative is **mean safe-start two-clue
coverage**:

    Q₂(B) = sum_{s in S} |R₂(B,s)| / N².

Run the same complete rule starting separately from the normal flood of each
safe cell s, rather than R₀. Weight every safe starting cell equally, including
each zero in a large region. Average the revealed fractions. There is no
preferred corner, best-start cherry-picking, random sample, or guess policy.
Tied choices do not occur. The result is one exact rational number.

For a 3×3 center-mine board Q₂=64/64=100%; for a 2×2 corner-mine board
Q₂=3/9=1/3. It measures average deductive reach from a safe start, **not** the
probability of surviving a random first click, the fraction of starts that
fully solve, or optimal completion probability. Those would be different
quantities. A zero-start-only generator could use a separately named
zero-conditioned version, but must not mix it with this one.

## 5. Research grounding and verification

[A Phase Transition in Minesweeper](https://drops.dagstuhl.de/storage/00lipics/lipics-vol157-fun2021/LIPIcs.FUN.2021.12/LIPIcs.FUN.2021.12.pdf)
examines inference involving limited sets of clues and compares their reach
with SAT inference. This supports studying a hierarchy of reasoning rules.
Our all-zero seed, simultaneous closure, pair-complete formula and safe-start
average are explicitly specified here; they are not claimed to be that
paper's exact score or algorithm.

[The Bullets Puzzle](https://cdn.aaai.org/ojs/21561/21561-13-25574-1-2-20220628.pdf)
separates single-clue, multiple-clue and global-count reasoning in a
paper-and-pencil variant. It also makes clear that computational hardness
and human puzzle quality are different objectives. We do not adopt its
subjectively weighted composite energy as an inherent difficulty number.

The reference tests compare the pair formulas with Boolean enumeration for
all 8,704 realizable equation pairs over five variables; check structure and
reflection invariance on all 511 non-full 3×3 layouts; and compare evolving
closure and round counts with the independent exhaustive reference on every
safe start of all 63 non-full 3×2 layouts. Shared borders, no zeros, no mines,
and no 0/1 clues have explicit cases.

Run:

```sh
node tests/board-structure-metrics-test.js
node reference/board-structure-metrics.js '..*' '...' '*..'
```

An illustrative smoke calculation on one synthetic uniform layout at each
standard size completed both structural and local-closure calculations in
about 2–6 ms, and the exhaustive safe-start mean in about 8–222 ms on this
machine. These are three feasibility checks, not a timing guarantee or a
study of the player's performance. Exact count outputs were:

| Shape | 0–1 cells / safe cells | Zero-opened / safe cells | One-clue revealed | Two-clue revealed | One-/two-clue rounds | Q₂ numerator/denominator |
| --- | --- | --- | ---: | ---: | --- | --- |
| 9×9/10 | 51/71 | 57/71 | 71 | 71 | 6 / 2 | 1656/5041 |
| 16×16/40 | 149/216 | 163/216 | 216 | 216 | 11 / 4 | 13202/46656 |
| 30×16/99 | 199/381 | 195/381 | 358 | 375 | 15 / 8 | 15597/145161 |

For reproducibility: use one unsigned 32-bit LCG starting at 20260921,
updating by `(1664525*state + 1013904223) mod 2^32`; divide by 2^32.
For each shape in table order, shuffle row-major cell indices by descending
Fisher–Yates (`j=floor(random*(i+1))`), place mines in the first M shuffled
positions, and retain RNG state between shapes. No start protection,
redraw, or player records enter this synthetic example.

## 6. Current product decision

The creator selected **0–1 share** and **zero-opening coverage**, now implemented
as exact board facts and matching time tables. The other descriptors in this
review were declined for the current UI; their calculators remain research.

Board fractions stay visually and verbally separate from time-rank percentiles.
A board can have 80% opening coverage and a 50th-percentile solve; these answer
different questions. The fractions' time comparisons now round to the nearest
whole percentage point, halfway up, while recorded counts remain exact.
3BV spread rounds to the nearest 0.5 cell. Definitions and more precise
measurements appear on heading mouseovers; standalone cards are removed.
The same grouping and period-summary policy applies, and full tables retain ordinary/poor standings
and sample size. Missing fields never enter a comparison pool. Backfill from
saved final layouts persists each completed record and immediately enables its
comparisons, with progress and Stop/Resume controls across reloads.

No descriptor is a validated all-purpose difficulty score. Testing whether it
improves prediction beyond 3BV/HZiNi on held-out games remains research. Actual
player time, clicks, and mistakes are outcomes, not inputs to these board facts.

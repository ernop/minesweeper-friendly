# Fixed board measures: definitions and calculations

Research and reference calculations, 2026-09-21. Existing comparison tables
are implemented in the **This board** section. The game adds 3BV spread,
Human ZiNi, 0–1 share, and zero-opening coverage time tables;
HZiNi efficiency appears separately in Game stats. C*/RCW searches remain
research only. The [structural-fraction review](board-structure-research.md)
defines the two implemented fractions and the further closure descriptors
that the creator declined for the current UI.
Names explicitly marked **proposed** are definitions for this project, not
claims of an established Minesweeper standard.

## 1. Common domain and click rules

A board B is a finite w by h grid, with fixed mine set M and nonempty safe
set S. Coordinates are cell centers (x,y), x=0..w-1 and y=0..h-1. Adjacency
is the eight surrounding cells, clipped at the edges, with no wrapping.
The clue n(v) is the number of mines adjacent to safe cell v.

The benchmark board begins fully covered, with no flags. A win means every
safe cell is revealed; mines need not be flagged. A reveal, one flag placement,
or one chord each costs **one game action**, irrespective of the physical
mouse-button implementation. Revealing a zero automatically reveals its
entire connected zero region and bordering safe numbers at no extra cost.

These are fixed-board, perfect-knowledge click benchmarks. They do not charge
for finding or proving the moves, and the full layout may be used to optimize
them. No first-click relocation, automatic starting move, autoflagging,
redraw, guess protection, or partial-board drill is included in this model.
Those require separately named measures with their rule/starting-state inputs.
In a mode that redraws mines, applying these definitions to the final board
describes that final layout, not necessarily the board encountered throughout
the solve.

## 2. Minimum clicks without chording: 3BV

**Established name:** Bechtel's Board Benchmark Value, **3BV**.

Let Z={v in S : n(v)=0}, and let Z_1,...,Z_o be its eight-connected components.
Let O_i be Z_i together with every safe cell adjacent to Z_i: the complete
set revealed by clicking a zero in that component. Let

    U = S \ (O_1 union ... union O_o).
    3BV(B) = o + |U|.

Each zero component requires at least one direct click when chords are
forbidden. Every safe cell outside all openings requires its own click.
Clicking one zero per component and then each member of U attains the bound,
so this is an exact minimum, not a statistical estimate. Shared numbered
borders of two openings do not count as independent work.

Calculation: count clues, flood-fill zero components, mark the union of their
flood sets, then count unmarked safe cells. With bounded-degree adjacency this
is O(w*h) time and storage. With no zeros it is |S|; if one opening reveals
everything it is 1. The first reveal counts. A prescribed starting click can
waste a click on an opening's numbered border, so an exact minimum with that
prescribed start is a separate quantity, not automatically the same 3BV.

Minesweeper Online defines 3BV as the minimum clicks without flags; the
no-chord, perfect-knowledge model above makes the operations explicit.
[Primary gameplay documentation](https://minesweeper.online/help/gameplay).

## 3. With chording: exact minimum and ZiNi are distinct

**Proposed exact name:** **Minimum clicks with chording**, C*(B).

A state is (R,F), where R is the set of revealed safe cells and F is a subset
of the mines that have been flagged. From the empty state allow these unit-cost
transitions:

1. Reveal any unrevealed safe cell; apply its zero flood if applicable.
2. Flag any unflagged mine.
3. Chord an already revealed positive clue v when all its neighboring mines
   are flagged and at least one neighboring safe cell is still covered.
   Reveal every covered safe neighbor and all zero floods they trigger.

    C*(B) = minimum number of transitions reaching R=S.

Correct flags alone suffice for an optimal successful solution: a wrong flag
cannot enable a successful chord (matching the clue count would leave a real
adjacent mine unflagged), cannot reveal a safe cell, and costs an action.
Removing correct flags cannot assist any of these transitions. Thus excluding
wrong flags, flag removal, and no-op clicks does not exclude an optimum under
these rules.

Calculation: breadth-first search over these states, or an exact shortest-path
or optimization formulation that proves its lower and upper bounds meet.
Because safe cells only reveal and mines only gain flags, there are at most
2^(w*h) states in this simple formulation. That is a finite exact algorithm,
not a claim that full-size boards are affordable to enumerate. A found route
without a completed optimality proof gives an upper bound, not C*.

**Existing benchmarks:** Greedy ZiNi G(B), and Human ZiNi H(B), are counts of
the routes constructed by their named algorithms. Human ZiNi opens every
opening first and restricts its greedy chord choices to exposed clues. Our
`zini.js` fixes the greedy tie order (column-major), so its results are
repeatable for the same oriented board. A rotated board can change a greedy
tie outcome; the exact C* does not depend on orientation. HZiNi is not a
proof that its hypothetical actions are logically discoverable by a player.

    C*(B) <= 3BV(B)
    C*(B) <= G(B)
    C*(B) <= H(B).

No universal ordering between the two heuristic outputs is assumed. A
heuristic being below another heuristic does not prove optimality. If future
algorithms change, distinguish their results instead of pooling unlike ZiNi
definitions in one exact-value table.

The maintained ms_toollib documents deterministic greedy, human, and randomized
ZiNi algorithms. These support the algorithm distinctions; the exact
shortest-path definition above is our explicit specification.
[ms_toollib API](https://docs.rs/ms_toollib/latest/ms_toollib/),
[Human ZiNi definition](https://docs.rs/ms_toollib/latest/ms_toollib/fn.cal_hzini.html).

## 4. Spatial dispersion: 3BV spread

**UI name:** **3BV spread**, WS(B), measured in cell spacings. Earlier research
called this work spread; the stored field remains `workSpread`.

Construct a multiset of points P representing the 3BV work units:

- For every member of U, use that cell's center as one point.
- For every zero component Z_i, use the arithmetic mean of its zero-cell
  centers as one point. Do not include its numbered border in this centroid.
- Every point has weight 1, regardless of the number of cells in an opening.
  Keep coincident points as separate work units.

There are K=3BV(B) points. Define

    mean = (1/K) * sum_i p_i
    WS(B) = sqrt((1/K) * sum_i ||p_i - mean||^2).

This is the ordinary two-dimensional **standard distance** applied to our
specified work-point construction. Standard distance is an established
spatial-dispersion statistic; using these particular Minesweeper work points
is our proposal. [Esri's formula](https://doc.esri.com/en/arcgis-pro/latest/tool-reference/spatial-statistics/h-how-standard-distance-spatial-statistic-works.html).

Optional cross-size normalization:

    D = sqrt((w-1)^2 + (h-1)^2)
    normalized work spread = 100 * WS(B) / D, expressed as % of board diagonal.

For a one-cell board define this normalized value as 0. For one work point,
WS=0. Rotation, reflection, translation, click order, mouse resolution, and
the player's play do not affect WS. Calculate centroids and variance in O(w*h)
time. Use the population divisor K, not the sample divisor K-1.

Interpretation: how widely the independent no-chord work is distributed.
A zero-component centroid need not itself be a clickable zero. Consequently
WS measures geometric spread, not a realizable cursor path, minimum travel,
number of logical steps, or expected time. Different clusters can have the
same WS, and one huge opening has WS=0 because it is only one work unit.

**Complementary proposed name:** **Work-tree length**, WTL(B).

On the same point multiset P, construct the complete graph whose edge weight
between p_i and p_j is their Euclidean distance. WTL is the sum of edge weights
in a minimum spanning tree; WTL=0 for K=1. Several optimal trees can tie but
their length is identical. Prim's algorithm computes it in O(K^2) time and
O(K) auxiliary memory for an implicit complete graph. It captures the length
needed to connect the work centers, including gaps between clusters. It is
not a cursor-route minimum or a lower bound for a route to real opening
cells. It also grows with workload, so comparison alongside 3BV is useful.

## 5. Logical deduction: Required clue width

Logical information depends on what has been exposed. A bare mine layout
cannot specify the difficulty of one actual solve without a starting
observation. We define a precise start-conditioned measure, then eliminate
the arbitrary starting-cell choice by reporting a distribution over **all**
safe starts.

**Proposed name:** **Required clue width**, RCW(B,s), for safe start s.

Rules: standard fixed board, known total mine count, no extra information
from generation promises (including a no-guess promise), and ordinary zero
flooding. Reveal s and its flood initially, without asking for a proof of the
first click. This initial observation is not a deduction round.

For a chosen nonnegative integer k, run the following k-clue closure:

1. Maintain revealed safe cells R and already proved mines F. All other
   cells have unknown Boolean mine variables x_v. Flags placed by a player
   are not inputs.
2. Each revealed clue supplies its equation over unknown neighbors, after
   subtracting proved adjacent mines. The global counter supplies one more
   equation: sum of all unknown mine variables equals |M|-|F|.
3. For **every subset Q of at most k of these equations**, consider all
   Boolean assignments satisfying Q and the known facts. Equations outside
   Q impose no restriction. The global counter counts as one equation if
   used; it is not supplied free to every local deduction.
4. A cell is proved safe/mined if there exists such a subset Q for which
   **every** satisfying assignment has x_v respectively 0/1. Find **all**
   such facts from the same state, then simultaneously add all proved mines
   to F and reveal all proved safe cells and their zero floods. This is one
   deduction round.
5. Repeat until all safe cells are revealed, or a round would add no facts.

Past proved cell facts are available freely; arbitrarily complicated derived
equations are not carried forward as if they were single original clues.
Within a round, do not use the new facts until the next round. These rules
remove scan-order and arbitrary choice-of-next-move effects.

    RCW(B,s) = smallest k for which k-clue closure reveals all safe cells.

An opening that already wins has RCW=0. RCW=1 means iterative single-equation
counting, with the mine counter as an available single equation, suffices.
RCW=2 permits exact interactions between pairs of equations, repeatedly;
it does not claim the human only thinks twice. Larger values measure how
many constraints must sometimes be combined, not time or total proof length.

If closure with **all** available constraints stops before completion,
RCW is undefined and the status is **guess required from this start**. Since
this process opens all provably safe cells, choosing a different order among
safe deductions cannot rescue it. This statement assumes exact complete
inference and the stated information model. A timeout or bounded solver
failure must instead say **not computed**; it proves no need to guess.

Calculation: for k=0,1,...,w*h+1, restart closure from the same first opening.
Test a proposed fact with SAT/constraint solving: x_v=0 is forced exactly
when Q plus x_v=1 is unsatisfiable, and conversely for a mine. The reference
implementation enumerates Boolean assignments instead. There are at most
sum_(j=0)^k binomial(c,j) subsets per round for c current constraints, each
with a potentially exponential consistency calculation. Exact full-size
profiles therefore belong in a worker/offline analysis until their runtime
is characterized; raw CPU time is not the definition of difficulty.

Companion outputs, all at fixed k:

- **Deduction rounds DR_k(B,s):** number of simultaneous fact-update rounds
  before completion or stalling; include rounds that only prove mines.
- **Deduction coverage DC_k(B,s):** fraction of initially covered safe cells
  eventually revealed by closure. If the initial opening wins, define it as
  1. Record remaining safe-cell count as well. Stalling is explicitly shown.

The particular RCW closure is our proposal. Its research precedent is Neller
and Tran's *The Bullets Puzzle* (AAAI 2022), whose future-work section proposes
classifying deductions by their minimum required clue count. Their published
puzzle-quality objective is subjective; it is not a validated human-time
model or this exact dynamic-game definition.
[Primary paper, especially p. 6](https://cdn.aaai.org/ojs/21561/21561-13-25574-1-2-20220628.pdf).

## 6. A fixed logical profile of the board alone

**Proposed name:** **Clue-width start profile**, CWSP(B).

Run RCW(B,s) for every s in S, weighting every safe cell equally. An opening
containing many zeros therefore appears for multiple possible starting cells;
do not silently replace this distribution with equal weighting per opening.
Report counts/fractions at widths 0,1,2,... and a separate guess-required
fraction. These depend solely on the board and the declared rules, are
unchanged by rotations/reflections, and do not depend on the player's start.

Useful numeric projections are:

    k-clue start coverage C_k(B) = |{s in S : RCW(B,s) <= k}| / |S|
    logic-solvable start coverage C_all(B) = |{s in S : RCW(B,s) exists}| / |S|.

For example, **two-clue start coverage** is 100*C_2 percent. Low C_2 can mean
complex reasoning or unavoidable ambiguity; C_all distinguishes them. These
are percentages of safe starting cells, not percentiles among boards and
not a human or optimal-policy win probability. A mandatory zero-start game
would need its own explicitly zero-conditioned distribution.

To compare the actual play's logical demands, also show RCW at its actual
first reveal. Using only the easiest opening's RCW would conceal harder
starts. Averaging a made-up numeric penalty for guess-required starts would
mix reasoning complexity and chance; the profile keeps them separate.

## 7. Exact, reproducible examples

`*` denotes a mine; `.` a safe cell. All examples use the rules above.

| Board | 3BV | Exact C* | Greedy ZiNi | Human ZiNi | Work spread | Work-tree length | Clue-width start profile |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Empty 3x3 | 1 | 1 | 1 | 1 | 0 cells | 0 cells | All 9 safe starts: width 0 |
| 3x3, center mine | 8 | 5 | 5 | 6 | sqrt(3/2) = 1.224745 cells | 7 cells | All 8 safe starts: width 2 |
| 2x2, one corner mine | 3 | 3 | 3 | 3 | 2/3 cell | 2 cells | All 3 safe starts require a guess |

The center-mine example is revealing: it has no zeros, high no-chord workload
for its size, substantial chord savings, and no forced guessing after any
safe start when the global mine count is available. From a corner clue, the
clue plus global counter prove every non-neighbor safe; their revealed clues
finish the deduction. A single equation alone cannot make the first progress.

Run:

```sh
node reference/board-metric-calculators.js '...' '.*.' '...'
node tests/board-metric-definitions-test.js
```

The exported geometry calculator accepts arbitrary board sizes. Exact chord
search explicitly limits this reference implementation to 16 cells, and
logical enumeration to 9 cells. It throws outside those limits. No approximate
result is substituted. The command-line combined example requires at most
9 cells because it includes the full start profile. Tests cover known
examples and every non-full 3x2 mine layout, including independent production
3BV comparison, exact/heuristic bounds, reflection invariance, increasing
coverage with k, and explicit search limits.

## 8. Product boundary

The game groups board-conditioned solve-time tables under **This board**:
exact 3BV, ZiNi, HZiNi, maximum number, high-clue presence, low-clue caps,
zero count, mine-island count, and enabled largest-island size. Period
summary, date/category, and streak tables stay above; all table sections
precede scatterplots. HZiNi, 3BV spread, 0–1 share, and zero-opening coverage
appear in tablechart headings, with definitions and precise values on
mouseover/focus. HZiNi matches exact integers; fractions round to the nearest
whole percentage point and 3BV spread to the nearest 0.5 cell, halfway upward. Work-tree
length and logical profiles were declined for the current UI and remain research.

## 9. Fixed opening-first benchmark and exact opening-first minimum

The current requirement is a single reproducible board-workload number,
without a proof interval, hint count, guess count, or simulated mine hits.
Two different quantities must not be conflated:

- **Opening-first chord benchmark (HZiNi)** is the exact count produced by
  the fully specified procedure below. It is already stored as `hzini` and
  now has a same-value solve-time table in This board.
- **Opening-first minimum clicks**, C₀*(B), is the globally smallest count
  under the prescribed opening-first restriction. Its mathematical definition
  and tiny-board exact calculator are below. HZiNi is not a substitute proof
  of this minimum; a scalable exact production calculation is still unbuilt.

### Human ZiNi: complete procedure

Use the fixed finished board B, with its actual orientation, perfect mine
knowledge, all safe cells covered, and no flags. Each direct reveal, each
flag placement, and each chord costs **one action**. A chord is one action
regardless of its mouse-button gesture. Zero floods cost no additional actions.

1. Visit cells in **column-major order**: top to bottom within a column, then
   the next column to the right. Directly reveal each still-covered zero.
   Normal flooding opens its entire 8-connected zero region and numbered
   border. This charges **one click per zero region**, not per zero cell.
   Shared numbered borders are never counted twice. Finish this phase before
   considering any chord. If there are no zeros, this phase costs zero.
2. If all safe cells are exposed, stop. For each already-revealed positive
   clue v, compute from the present state:

       gain(v) = covered safe neighbors(v)
                 - unflagged mine neighbors(v) - 1.

   The last term pays for the chord. All zeros are already open, so each
   remaining safe neighbor needs one direct reveal without chording.
3. If any clue has gain >= 0, choose the greatest gain. Break ties using the
   same column-major order. Flag every as-yet-unflagged neighboring mine,
   charging one per flag, then chord that clue once, charging one. Existing
   correct flags can be reused for later chords for free.
4. If every clue has negative gain, reveal the first covered safe cell in
   column-major order, charging one click. Return to step 2.
5. Stop as soon as all safe cells are open. Do not charge for marking remaining
   mines. Never flag a safe cell, remove a flag, or count a no-op action.

The result is the integer

    H(B) = opening reveals + later direct reveals + flag placements + chords.

Every step is specified, including zero-gain chords, the absence of openings,
and ties. Every loop opens at least one safe cell, so it terminates. No player's
start, hints, deduction ability, flags, trace, timing, or Justice setting enters
this function. It does not claim that a human can know every chosen safe cell.
Column-major order is the existing community implementation's convention;
changing it would change the benchmark and invalidate pooling with old values.
Rotation/reflection may change HZiNi because they change tie and direct-reveal
order. Recalculating the same oriented board cannot change its value.

This procedure is greedy, **not globally optimal**: a 3×3 board with only its
center mined has HZiNi 6 (one direct reveal, one flag, four chords), while its
opening-first true minimum is 5. There are no zeros on that example, so opening
all zeros first cannot remove the distinction. “Exact benchmark count” means
exactly following a defined algorithm, not proving the best possible route.

The primary community descriptions call ZiNi a flagging-click benchmark and
Human ZiNi the opening-first variant. Neither greedy algorithm is a general
optimality proof. [Human ZiNi implementation documentation](https://docs.rs/ms_toollib/latest/ms_toollib/fn.cal_hzini.html),
[Board Museum's ZiNi calculator and examples](https://www.mzrg.com/js/mbm/zini.html).

### The user's globally optimal version

Let O(B) be the number of zero components, and R₀ the union of their full
zero-and-border floods. Let d_B(R,F) be the shortest remaining action distance
to revealing every safe cell, under the exact transitions in section 3.
Then the single integer defined by the requested procedure is

    C₀*(B) = O(B) + d_B(R₀, empty flag set).

Every opening click counts. Which zero represents a region and the order of
opening regions cannot affect R₀ or O. Subsequent direct reveals **must remain
allowed**: a board with no zeros, or an isolated numbered area, could otherwise
have no way to start or finish. Tied optimal routes all have the same count;
there is no tie-break parameter in the resulting value. It satisfies

    C*(B) <= C₀*(B) <= H(B) <= 3BV(B).

The value exists for every board with a safe cell, is invariant under rotation
and reflection, and has an exact finite calculation: unit-cost breadth-first
search starting at (R₀, empty flags) with initial cost O. The independent
`openingFirstMinimumClicks` reference calculator implements that search for
boards of at most 16 cells. Larger inputs throw explicitly; it never outputs
a range or an approximation. Opening zeros first reduces the state space for
many boards but leaves the general optimization problem on boards without
zeros unchanged. The production interface does not label HZiNi as C₀*.

### Performance comparisons and storage

An `HZiNi N` table ranks the player's winning times on boards with exactly that
benchmark, within the current size/mine-count, play-mode, and generator key.
The table shows every placement, including average and worst. The period-wide
summary includes qualifying earlier HZiNi values even if they differ from the
latest board. Its existing top-tenth qualification remains unchanged.

    HZiNi efficiency = 100 * H(B) / player's board-changing clicks.

This percentage appears in Game stats, separate from board characteristics.
It is derived on wins only and only with a positive denominator.
It can exceed 100% when the player beats the greedy benchmark. It is neither
a rank percentile nor a fraction of a proved optimum. Failed games receive no
completion-efficiency percentage. All board measurements use the final fixed
layout; play modes that alter mines may have exposed different earlier layouts.

3BV spread remains the single scalar in section 4. Keep its unrounded cell
value and group time comparisons by `round(2 * WS) / 2`, halfway up, with
no preliminary decimal rounding. A centered group g covers [g−0.25,g+0.25),
clipped at zero. The heading gives g with one decimal; the tooltip gives
WS with three decimals and its definition.

For 0–1 share, let R₀ be the union of all zero floods. Its numerator counts
only cells in R₀ whose clue is zero or one; covered ones do not count.
Zero-opening coverage counts every cell in R₀, including higher clues.
Both use all safe cells as the denominator. No zero means both counts are
zero, regardless of how many covered ones exist.

The fractions retain exact safe-cell numerator n and denominator d. Their
time-table group is the nearest whole percentage point, computed as
`floor((200*n+d)/(2*d))` so exact halfway ties always round upward. Group
p covers [p−0.5,p+0.5) percent, clipped to [0,100]. The heading shows p%;
the tooltip shows exact n/d and a percentage to three decimals. Full tables
and period summaries use the same groups and retain qualifying earlier wins.
No standalone metric cards remain; backfill progress stays available. This
changes comparisons, never the primary measurements or their definitions.

`board-metrics.js` computes 3BV spread, both fractions' primary counts, and
Human ZiNi; `zini.js` remains the single production implementation of the ZiNi
procedures. The worker returns `hzini` for the existing primary record field
and `{version:1, workSpread, safeCells, zeroOpenedZeroOneCells, zeroOpenedCells}` for
`boardMetrics`. Neither HZiNi nor the fractions are duplicated in storage.
Existing HZiNi records immediately join the comparison table; fraction tables
require their measured numerator and safe-cell denominator. Earlier optional chord/logic
measurements remain preserved in saved data and exports, but are neither
computed nor displayed nor used in comparison tables. The earlier
`zeroOneCells` whole-board count also remains preserved but never enters the
corrected 0–1 comparison. Its presence does not satisfy the new measurement;
backfill calculates the distinct visible count from the saved board.

New games analyze their captured final board. Older records use their saved
final-board trace for missing measurements, with explicit unavailability if
the trace is absent. There is no invented historical value or reconstructed
generator output. Worker replies amend only their captured history record,
even after a mode switch or new game. The player's `Backfill saved wins` click fills missing
measurements for the current mode one at a time, including old HZiNi/spread
records missing the new counts or retaining only the obsolete whole-board
0–1 count. Progress shows checked/total, measured,
unavailable, failed, and remaining counts. `Stop backfill` lets the current
board finish. Each completion is saved separately and immediately joins its
tables. `Resume backfill` skips completed records, including after reload;
there is no all-or-nothing batch or saved cursor. Missing traces remain
unmeasured, and failures display their errors. Unavailable/error checks are
session-local. The progress panel disappears when no job is active and no
unattempted record remains, including when some boards were unavailable.
Paused operations with work left retain their controls; actual errors remain
visible outside the panel. Endgame drills omit whole-board measures.

Verification executes the stated HZiNi procedure independently, recomputing
every gain from revealed cells and flags instead of copying the production
premium bookkeeping. It checks all 511 non-full 3×3 layouts and 300 larger
layouts, including the exact counts of each action type. Tiny-board C₀*
checks verify its bounds and reflection invariance. Browser checks cover
finished-board calculation, old HZiNi records, persistence, stale replies,
backfill progress, partial-table use, pause/reload/resume, comparison pools,
efficiency, definitions on mouseover/focus, and desktop/narrow layout.

## 10. Retired upper-left simulation: research only

This simulation was prototyped, then removed from the live interface following
the requirement for single completed workload counts. Its definition and
executable research code remain for reproducibility; it is not a current
board score. No hint count or simulated guess/mine-hit card is shown.

### Canonical simulation

1. Start on the upper-left cell (row 0, column 0), with a fully covered fixed
   board and known total mine count. A safe observation receives its normal
   zero flood. A mined observation becomes a known mine and increments the
   simulated mine-hit count. **Never relocate the mine or skip that choice.**
2. Exhaust the deductions possible from the current observations. A deduction
   round uses the smallest positive clue width that can establish any new
   cell facts; apply all facts available at that width simultaneously, then
   repeat from width 1. A revealed original clue and the total mine counter
   each count as one equation. Known cell facts are free substitutions.
3. If complete inference proves no new cell facts and safe cells remain,
   choose the cell with the smallest **next-click mine probability** among
   all covered, not-proved-mine cells. Calculate the posterior under a uniform
   distribution over all mine layouts satisfying the visible clues, observed
   mines, and total mine count. No hidden actual mine locations enter the
   choice. Break exact probability ties by row-major index: left to right,
   then top to bottom. Read only the selected cell's actual outcome.
4. Count a selected mine as a hit and continue analysis with that known mine;
   otherwise reveal the selected safe cell and its zero flood. Return to
   deduction. Stop once every safe cell is exposed.

The research **RCW · upper-left simulation** is the greatest required clue
width across these deduction phases. Equivalently, each phase's width is the
smallest k whose k-clue closure reaches that phase's complete logical closure;
the final phase stops at a win. Guesses are only made after complete closure,
so changing the order of proved-safe observations cannot choose an earlier
guess. The board layout never changes, including after a mine hit.

This is a new, explicitly named profile, distinct from the no-guess RCW(B,s)
in section 5. A width of 0 can mean that the simulation needed only guesses,
as well as that an opening immediately won. Therefore always show its guess
and mine-hit counts alongside the width. The fixed first click is excluded
from the guess count; its mine hit is included in mine hits and labeled
`opening hit`. Subsequent known-safe revelations are not guesses.

Minimizing immediate death probability is the exact policy here. It is **not**
a claim of maximum whole-game win probability: a riskier informative move
can sometimes improve later prospects. Generator-specific promises and
nonuniform priors, player flags, Justice, and first-click safety/redraw rules
are not extra information in this fixed-board benchmark.


The archived `reference/board-metric-searches.js` uses grouped exact model
counting and BigInt probability comparisons, and also contains the general
C* cost-bounded search. Deterministic work limits can stop either proof; its
bounds and incomplete statuses are research outputs only. The game does not
load this module. `tests/board-metric-searches-test.js` checks its searches
against independent exhaustive models and click sequences on small boards.

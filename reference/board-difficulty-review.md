# Board difficulty and expected performance — 2026-09-21

Follow-up: [rigorous definitions and executable reference calculations](board-metric-definitions.md)
specify click minima, spatial measures, and a fixed logical profile. The full
board-comparison tablecharts now occupy their own "This board" section.
The later [structural-fraction review](board-structure-research.md) focuses on
the creator's zero/one fraction and automatic zero-flood coverage, with exact
research calculators and further deduction-coverage proposals.

The requested distinction: an overall slow solve can be typical or strong
for boards with the same workload or structure. Board descriptors help choose
a relevant comparison, but no single descriptor establishes equal difficulty.

## Implemented in this change

Exact `ZiNi N`, `HZiNi N`, and `max number N` solve-time tablecharts, alongside `3BV N`.
Maximum number is equality, distinct from the existing max-2/3/4 upper bounds.
All full-table standings remain visible, including ordinary and last-place
results. Each exact family has a default-on display switch. Period summaries
consider every measured value represented by recent wins, independently of
which full tables are shown, retaining their existing top-tenth qualification.
Exact families retain their identities when comparison pools coincide.

These exact-value tables use existing saved measurements. Unmeasured
records are excluded. The follow-up adds HZiNi, 3BV spread, 0–1 share, and
zero-opening coverage cards with definitions on mouseover/focus. HZiNi
efficiency is performance in Game stats. The fractions match unrounded values;
3BV spread uses half-cell time bands. Saved-win backfill has progress,
Stop/Resume, and immediate partial results that survive reload. C* bounds and
the canonical logical simulation were removed from the
live display in favor of completed workload scalars. The requested globally
optimal opening-first count C₀* has a precise definition and a tiny-board
reference calculator; HZiNi is not its proved optimum. See the rigorous
definitions linked above.
ZiNi remains absent for partial-board Endgame drills. These are the finished
board's facts; modes that redraw mines can change the board during play.

## Three questions the interface should distinguish

1. **How unusual is this board?** Distribution of a board feature among
   boards from this size, mine count, mode, generator, and starting rule.
   A high percentile for maximum clue means a high maximum clue, not a
   proven high difficulty. Rarity could instead mean the frequency of an
   exact value or joint feature pattern; that is a different statistic.
2. **How did this solve compare?** Time rank among the player's completed
   wins matching a descriptor. This is what the current tablecharts answer.
   At the median, the solve was typical for that comparison pool even if it
   was slow overall. These are personal-history ranks, not worldwide ranks.
3. **How did this solve compare with an expected time for this board?**
   A fitted multifeature prediction with uncertainty, tested on games not
   used to fit it. This is a future model, not something the current tables
   already measure. Separate tables match each feature individually, not
   their intersection.

For example, an illustrative 195th of 200 overall and 5th of 10 at ZiNi 50
shows the distinction directly. The small conditional pool should stay visible.
It supports "typical among these wins," not a precise skill estimate.

## Existing measures and online precedents

| Measure | What it describes | What it leaves out |
| --- | --- | --- |
| 3BV | Required left-click workload with perfect knowledge, allowing zero floods but no chords | Deduction difficulty, useful chords, guessing, travel |
| Greedy ZiNi | Click count of a specified flags-and-chords strategy | Guaranteed optimum, logical accessibility, thinking time |
| Human ZiNi (already stored here) | Opens all openings first, then uses the greedy strategy through exposed clues | Still no complete measure of human reasoning difficulty |
| Opening count (Op) | Number of 8-connected zero regions | The sizes of those regions and what their borders reveal |
| Maximum clue, clue histogram | Number-pattern composition | High clues need not be difficult; a visible 8 fixes all its neighbors |
| Our mine islands and largest mine island | Connectivity and concentration of mines | Structure of the safe work remaining and its deductions |

Minesweeper Online documents 3BV as a minimum left-click measure and says its
higher NG difficulties use more complex logical patterns. That supports
treating workload and logic as separate dimensions.
[Gameplay documentation](https://minesweeper.online/help/gameplay).

The maintained ms_toollib API implements greedy, human, and randomized ZiNi,
opening counts, clue counts, probability analysis, and solvability checks.
Its Human ZiNi definition specifies the opening-first strategy. Our fixed
greedy implementation is an upper bound on the optimal action count, not a
certified minimum. Keep the algorithm fixed when comparing recorded values.
[API](https://docs.rs/ms_toollib/latest/ms_toollib/),
[Human ZiNi](https://docs.rs/ms_toollib/latest/ms_toollib/fn.cal_hzini.html),
[openings](https://docs.rs/ms_toollib/latest/ms_toollib/fn.cal_op.html).

David Hill's solver distinguishes trivial deductions, exact probability
analysis, unavoidable 50/50s, progress probability, and longer-horizon winning
chances. Its documented exact endgame analysis can compute optimal winning
probabilities in sufficiently small positions. This supplies concrete
precedents for measuring ambiguity and information gain separately from
click workload; it does not furnish a universal board difficulty score.
[Solver description](https://github.com/DavidNHill/JSMinesweeper/blob/master/README.md).

## Proposed measurements to evaluate

These are design proposals. Their predictive usefulness for this player has
not been measured.

1. **Opening structure.** Count zero regions; record each region's zero
   count and flood-revealed safe-cell count, including its numbered border.
   Shared border cells count in each opening's individual size, but only once
   in the union. Count safe cells outside that union: together with opening
   count they account for 3BV. Derive largest-opening share and related
   summaries rather than storing redundant copies. Equal zero counts can
   hide one large opening versus several small ones.
2. **Chord savings.** Derive `3BV - ZiNi` and `3BV / ZiNi`, and the Human
   ZiNi counterparts. They describe savings found by a benchmark strategy,
   not maximum achievable savings. Start with Human ZiNi comparisons because
   the scalar is already stored; compare usefulness against greedy ZiNi.
3. **Safe-cell work clusters.** Connected components of safe numbered cells
   outside every opening, with declared adjacency. Distinguish these from
   our current mine islands. Count, largest size, and dispersion may explain
   scanning and movement that mine clustering alone misses.
4. **Deduction profile.** Under a fixed solver and starting cell, count
   stages requiring direct counting, overlapping constraints, or exact
   reasoning. Track hardest required stage and serial deduction depth.
   Our solver already emits count/overlap/exact steps; its path-specific
   report needs a defined evaluation policy before comparing boards.
5. **Progress bottlenecks.** Under that same policy, measure how often only
   one safe continuation is available, the minimum available-safe-move
   count, and how much progress each deduction unlocks. These describe how
   constrained the solve is; they are not facts about every possible path.
6. **Ambiguity burden.** Detect genuinely unavoidable interchangeable mine
   placements, and evaluate guess safety and information gain. Use exact
   optimal completion probability only when actually computed; otherwise
   name the solver policy and report its limits. Observing that a player
   guessed is not evidence that the board required it. Multiplying the
   survival probabilities along one successful trace does not compute the
   board's optimal win probability across all possible branches.
7. **Spatial work dispersion.** Measure spread and separation of required
   targets in board-cell units, or distance for a specified benchmark route.
   A route through the omniscient board is a motor-work proxy, not a route
   known to be available to a human. Do not use the player's actual mouse
   travel as an inherent board characteristic.

Global mine density and board dimensions are useful when comparing board
configurations, but are constant within our existing score keys. Local
density variation, edge/corner mine concentration, and the full clue
histogram may contribute within a key; no direction of difficulty is assumed.

## Measurement and interpretation rules

- Pure layout facts need no player's decisions. Logic and probability need
  a starting position, rules, solver version, and evaluation policy. An
  actual-trace statistic mixes board demands with the player's choices.
- Maximum clue is a coarse structural descriptor. A single 8 is locally
  easy once exposed; broad claims that larger clues mean harder reasoning
  would need evidence. The same caution applies to mine-island counts.
- Board rarity must not be estimated from winning boards alone and called
  the generator's distribution. Completed-game samples omit abandoned
  boards too. Sample the declared generator/start rule for generator-wide
  rarity, or label the observed-history population explicitly.
- Time ranks among wins answer performance conditional on winning.
  Completion probability and lost-game behavior need their own analysis.
- Exact multidimensional matching quickly yields tiny pools. Keep simple
  single-feature tables readable; evaluate smoothing or a fitted model on
  held-out games before presenting an adjusted-performance score.
- Use only board/start/rule features to predict expected difficulty. Actual
  time, excess clicks, misclicks, and pauses are solve outcomes; including
  them as inputs would explain away the performance being assessed.
- For a future expected-time model, state whether the baseline is lifetime
  or recent play, exclude the evaluated game from training, display sample
  support and a prediction range, and account for changes in player speed.

The creator selected the two fractions and declined the additional structural
and logical proposals for the current UI. Evaluating descriptors against
held-out solve times before combining them into an expected-time score remains
research, not an approved extension.

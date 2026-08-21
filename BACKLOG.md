# Unbuilt work

Single list of what exists as an idea and is not in the product yet.
Implemented behavior stays in `PRODUCT.md`. This file is the place to add
the next request; do not leave new ideas only in chat.

Status labels: **creator** = the creator asked for it; **mapped** = named
on the design axis or in a research note, not requested as a build.

## Board-shape time lists (built 2026-08-21)

The lists themselves are in the product (PRODUCT.md "Rank lists").
Generation that aims at the same families is still unbuilt; see below.

## Generation (not built)

Today's generator is first-click-safe random placement (`agents.md`
design-axis entry 2). Nothing below exists.

### Solver-aware modes (mapped)

From the design axis in `agents.md`. NG generation is generate → solve →
reject/repair → repeat. Solver tiers already named: (a) trivial
counting, (b) subset subtraction / named patterns, (c) full constraint
enumeration including the global mine count. Derived session result: a
1-2…2-1 wall chain with k twos is fully forced unless k ≡ 0 (mod 3).

- **No-guess (NG) as its own menu mode.** Uniform / single-path /
  proof-or-die already generate NG boards (PRODUCT.md "Play modes").
  A separate unlabeled "any NG" item is not in the menu.
- **Evil NG.** NG plus a difficulty floor: at least one advanced
  deduction per board.
- **Graded NG.** Score each board by the hardest required technique, as
  Sudoku grading does. Uniform-hardness NG is built (one grade for every
  step); a visible grade label / picker is not.
- **Kaboom.** Mines stay unfixed; any unforced guess is a mine, forced
  guesses are always safe.
- **Justice v1 family expansion.** Asymmetric or exotic sealed structure
  still refused. Angelic mode (2026-08-21) is the rest of the dual for
  play: any cell that is not a proven mine is made safe. Expanding
  Justice certificates is a further step.

minesweeper.online NG also gives a starting position (green X). That
opening style is not built here.

### Boards shaped like the lists above (creator interest, 2026-08-21)

Generation that aims at the same families the new lists rank:

- force or forbid an 8, a 7, or a chosen max number (2 / 3 / 4)
- target a chosen island count
- target a chosen largest-island size
- target a chosen zero count

## Deferred product (already decided, not built)

- **Separate Justice-on and Justice-off rankings.** Explicitly deferred
  2026-08-20; lists still mix both.
- **Per-stage motion-stat configurability.** Which metrics appear live
  vs after the game. Two on/off settings exist; finer control does not.
- **Hevelius features computed but not shown.** Offsets, variability,
  direction changes, normalized jerk with pauses, submovement fractions.
  Same per-stage display question.
- **Hevelius block-variability (CoV).** Offline-only until movements are
  residualized against log2 distance and log2 width
  (`reference/hevelius/FEATURES.md` assumption A3).
- **Hevelius Kalman position smoothing.** Papers do not publish the
  filter parameters; the in-page port skips it (documented deviation).
- **CHI 2012 deliberate-movement filter.** Would isolate queued
  point-and-click returns as the clean motor trials inside ordinary
  play. Researched, not built.
- **Goal-birth refinements** (`reference/mouse-motion-metrics.md`):
  final-approach onset from the last movement bout into the click;
  deducible-since timestamps (needs a solver replay) and the queue
  metrics that sit on them. Anchoring at the previous click is the
  decided measurement, not a stand-in for these.
- **Trace-only metrics named in the survey and not ported:** tremor
  spectrum (4–6 Hz band power), overshoot analysis, Fitts throughput
  curves. Raw traces are stored so these can be added later.

## Research designs (creator, not built)

- **Secret replay experiment** (2026-08-19 discussion;
  `reference/replay-experiment.md`): covert re-serves of transformed
  earlier boards inside ordinary Standard play, lag as the independent
  variable (1 game to 1 week) to fit the memory-boost decay curve;
  implicit-memory fingerprints (click-sequence match under the
  transform, time-to-first-deduction); a skill/luck variance split
  (within- vs between-identity). Trial / Short trial are the overt
  instrument; this is the covert, long-lag complement.

## Already true, so they are not backlog

- First-click-safe standard play; classic chrome; history; rank windows;
  "3BV N"; board-shape time lists (has 8 / has 7 / max 4 / max 3 /
  max 2 / islands / largest island / zeros); rankaverages; streaks; ten
  scatters; markless; states; settings; traces; four in-page motion
  systems; "A just universe" v1; play-mode switcher; Uniform NG;
  Single-path NG; Proof-or-die; Angelic; Trial (25 identities × 4
  isometries, trial-only time list, identity-grouped review).
- Waste metrics (pauses, wander, turnarounds, feints) and the
  biometrics / mousetrap / Hevelius-style displays. The Tier 1/2
  "store a scalar per metric" framing is obsolete: the trace is the
  ground truth.

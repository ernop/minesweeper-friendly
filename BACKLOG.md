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

The board-generator registry exists (2026-08-25, PRODUCT.md "Board
generators and top score keys"): Default, Pink noise, and Blue noise,
each parameterized, chosen from the upper-right Generator menu, with
per-key rankings and the Board lab exploration mode. Everything below
is still unbuilt.

### More board generators (creator, 2026-08-25)

Built the same day (PRODUCT.md "Board generators and top score keys"):
pink noise (with the anisotropy stretch parameter), blue noise, green
noise, stippled, letterforms, and patriotic. Still unbuilt:

- **Threshold blobs.** Cut the noise field at a level and fill the
  super-threshold region with mines (hard blob edges instead of the
  built proportional weighting) — parameterized by edge softness.
- **Toroidal wrap.** Periodic noise/distance so the board tiles;
  matters for future wrapped-board modes.
- **Black noise.** The audio-taxonomy color not yet represented:
  almost-everywhere emptiness with rare tight bursts — most of the
  board minefree, a few dense pockets. (Violet noise, blue's steeper
  sibling, is effectively reachable by raising blue's spread and is
  not planned as its own entry.)
- **Words in letterforms.** The letterforms generator draws random
  letters; a chosen word (part of the key, so each word ranks
  separately) is the natural next step.
- **More flags and emblems.** Patriotic is stars-and-stripes; other
  flag geometries (tricolors, crosses, circles) are the same
  region-allocation pattern with different regions.
- **Combined modes and sizes.** More modes that combine generators
  with the NG/graded predicates, and new board sizes as their own
  ranked keys — the top score key already carries all of it.

### Solver-aware modes (mapped)

From the design axis in `agents.md`. NG generation is generate → solve →
reject/repair → repeat. Solver tiers are now implemented as (a) direct
counting, (b) arbitrary overlap-difference deduction, and (c) exhaustive
frontier-component search joined through the global mine count and sea.
This is layout-consistency solving, not a finite named-pattern catalog.
Derived session result: a
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

- **Separate Justice-on and Justice-off rankings: decided against
  (2026-08-23).** Originally deferred 2026-08-20. The creator confirmed
  the mixed lists are the product: Justice stays on and its games rank
  within the same lists. Not open for revisiting without a new explicit
  request.
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
- **Guess-ledger ranks and scatters.** Life lost / needless / perfect-play
  counts are stored per game; no rank list or scatter uses them yet.
- **Deeper than one-ply perfect play.** Current `guessPerfect` is
  expected remaining life after one number observation. A full
  remaining-game-tree win probability would need another budget and a
  visible failure mode; do not silently degrade to min-p.
- **IOE as 3BV / total clicks** (effective + wasted). Efficiency /
  throughput already use effective clicks only. The clone's IOE is the
  missing total-click cousin.
- **ZiNi / HZiNi, STNB.** Board-fact click lower bounds and the
  minesweeper.online QG-normalized standing; not requested for this
  pass.
- **Which-song detail on the music state: decided against (2026-08-22).**
  The boolean `musicPlaying` is built (PRODUCT.md "Music playing").
  PipeWire also exposes each stream's `media.name` (Firefox: the playing
  tab's media title), so song titles are technically reachable, but the
  creator decided titles are never stored: they are personal data that
  would live forever in records and exports. Not open for revisiting
  without a new explicit request. MPRIS (artist/album) is absent for
  this Firefox; would need a player that registers one.

## Session stats follow-ons (creator direction, 2026-08-22)

The session section (PRODUCT.md "Session stats") is built: mouse speed,
mistake-tagged-death / visible-state-misclick / no-op-click / mine-marking / flag-removal rates and
fastclick gap, bucketed over a sliding hour of actual play with wall-clock
breaks removed. It displays observations;
causes, mental states, and traits are not inferred. Context-tag associations
would require explicit analysis. Not built yet:

- **Finer backfill from traces.** Record-based backfill on reload is
  built (2026-08-22, same evening; played-time scan revised 2026-08-23):
  stored records are scanned backward until the last hour of played
  duration is filled, with totals spread evenly over each game's span. The traces hold
  exact press/movement timing if bucket-faithful backfill is ever
  wanted; abandoned boards leave no record and stay lost across
  reloads either way.
- **Longer windows and cross-session views.** An hour is the floor the
  creator asked for; day-scale charts or overlays of different days
  would show repeatability and differences without assigning their cause.
- **State-tag overlays.** Mark the session charts where a state tag went
  on or off ("sleepy" starts here), so the tags and the curves can be
  read against each other.
- **More measurements.** Candidates in the same spirit: lowest-risk-death
  rate alongside mistake-tagged-death rate, justice events per minute, chord
  share, pre-press stillness trends, and guess-ledger life-lost per minute.
- **Chart value readout (mapped, 2026-08-23).** The rates charts label
  only the newest value; a hover crosshair reading every line at any
  x would expose history without more standing ink.
- **Solo-chart scale stability (mapped, 2026-08-23).** The rates
  charts got ladder ceilings with shrink hysteresis (PRODUCT.md "The
  action-rates charts"); the solo session charts (mouse speed,
  fastclick gap, magnitudes) still rescale to max×1.08 every sample.
  The 1-2-5-10 ladder is coarse for their magnitudes (a 300ms gap
  pinned under a 500 ceiling wastes 40% of the plot), so extending
  stability there needs a finer ladder or another rule.
- **Full historical action-evidence backfill.** Legacy death booleans and
  five-way verdicts are normalized immediately, but old records lack the
  saved visible position and earlier nonfatal mistakes. Deterministic board
  replay plus stored traces may be able to reconstruct some of that
  evidence offline; uncertainty must remain explicit.

## Path replay follow-ons (mapped, 2026-08-23)

The after-game path views are built (PRODUCT.md "Path replay views"):
a button below the finished board cycles off → moves → clicks, drawn
from the RAM trace of the game just ended. Not built:

- **Historical replay from the traces store.** Every finished game's
  trace is persisted; a viewer that loads a past game's trace (and
  redraws its board from seed + mode + first click) could show any
  game's path, not just the last one.
- **Animated playback.** The stored timestamps allow replaying the
  cursor in real or scaled time rather than a static polyline.
- **Off-board excursions.** The overlay canvas covers the board only,
  so movement that left the board clips at its edge; a wider canvas
  would show the full excursion (e.g. travel to the face button).

## Research designs (creator, not built)

- **Secret replay experiment** (2026-08-19 discussion;
  `reference/replay-experiment.md`): covert re-serves of transformed
  earlier boards inside ordinary Standard play, lag as the scheduled
  variable (1 game to 1 week) to estimate repeat-associated change;
  candidate repeat measurements (click-sequence match under the
  transform, time-to-first-deduction); and within- vs between-identity
  variance. Calling any effect memory, skill, or luck requires controls
  beyond board identity. Trial / Short trial are the overt
  instrument; this is the covert, long-lag complement.

## Already true, so they are not backlog

- First-click-safe standard play; classic chrome; history; rank windows;
  "3BV N"; board-shape time lists (has 8 / has 7 / max 4 / max 3 /
  max 2 / islands / largest island / zeros); average-time charts; streaks;
  five relationship scatters; markless; states; settings; traces; four in-page motion
  systems; "A just universe" v1; play-mode switcher; Uniform NG;
  Single-path NG; Proof-or-die; Angelic; Trial (25 identities × 4
  isometries, lobby → start → repeat-comparison review); Short
  trial (4 × 4); Test trial (1 × 4); correctness / throughput / IOS
  (derived); guess ledger (life lost, needless, ideal-risk, one-ply
  perfect play); board generators (Default / Pink noise / Blue noise /
  Green noise / Stippled / Letterforms / Patriotic, per-key rankings
  via the top score key, Board lab exploration mode);
  music-playing state (boolean asked of the local base
  system); versioned action-evaluation ledger with exclusive game-loss /
  game-risk / time-loss / optional life-maximization / measurement-note
  report groups, four persistent none / fatal / risk / full display tiers
  (fatal-only new-player default), protection-aware risk magnitudes,
  explanations/position snapshots, and immediate legacy death-field
  normalization; the session stats
  section (bucketed sliding-hour-of-play series, in-page left column).
- Waste metrics (pauses, wander, turnarounds, feints) and the
  biometrics / mousetrap / Hevelius-style displays. The Tier 1/2
  "store a scalar per metric" framing is obsolete: the trace is the
  ground truth.
- Path replay views (2026-08-23): the after-game moves/clicks overlay
  on the finished board, with the layout-drift re-record fix in the
  trace recorder that it exposed (PRODUCT.md "Path replay views" and
  "Raw input traces").

# Unbuilt work

Single list of what exists as an idea and is not in the product yet.
Implemented behavior stays in the product spec (`PRODUCT.md` indexes its
section files). This file is the place to add the next request; do not
leave new ideas only in chat.

Status labels: **creator** = the creator asked for it; **mapped** = named
on the design axis or in a research note, not requested as a build.

## Game data as the primary result surface (creator, 2026-09-23)

The creator likes the game-data band and hopes it can "supercede so many
other UI elements", said the page layout is "not very standardized nor
efficient", and asked that the chart not be crushed and that "the labels
must match better". Built the same day: fluid details column, compact setup
rows, a chart filling the remaining column height, and one-line labels
placed from measured widths (docs/product/game-data.md "Layout pass").

Decided and built later that day. Labels end with their pool word ("3BV/s
1.600 (session)", "(life)", "(day)"). The best in a pool is 0%, using
100 × (rank − 1) ÷ (count − 1). The chart has its own full-height column
beside the board column, empty during play. The board rests beside the
game data column and the saved position counts from there; the later
answer "Sit right next to the game data column" replaced the earlier "keep
centering" (docs/product/board-and-layout.md "Layout: the board never
moves"). Superseding other elements waits ("later"). The page-wide
standardization sweep was approved ("all"). Still open:

- **What it supersedes.** Each left-side time marker is the same comparison
  as a time table's "this" row: lifetime time and the lifetime table, session
  time and the session's time table ("today" under the default session),
  day time and the trailing-24-hours table. The chart gives rank and top
  share but not the neighboring times,
  cross-category achievements (ranks won), or the scatterplots. Options:
  hide tables whose standing the chart already shows, link a label to its
  table, or keep tables as the detailed layer.
- **Shared vocabulary.** Chart "time (session)" / "time (day)" versus table
  headings "today" / "last 24 hours"; the board-side "3BV 71" ranks this
  board's 3BV among boards, while the "3BV 71" This-board table ranks solve
  times among 3BV-71 wins, so the same text names different quantities.
- **One label per measurement.** Lifetime, session, and day markers of one
  measurement repeat the same value ("time 44.382s (life)", "time 44.382s
  (session)"). A single label with one marker per scope would roughly halve
  the left side's labels. For now the creator chose only the trailing pool
  word ("right now we just add the word (session) or (life)").
- **Standardization sweep (approved "all"; built 2026-09-23).** No gray text
  remains, the primary containers are fluid, headings outrank their body
  text, and the outcome summary takes two lines ([UI doctrine](docs/product/ui-doctrine.md),
  [Result presentation and ordering](docs/product/results.md), and [Personal settings](docs/product/settings.md)). The seconds
  age green `#39ff14` (about 1.4:1 on white) now sits on a black chip, the
  creator's choice over a darker green. The same chip now carries the
  session tooltip text of the three ending colors under 4.5:1 on white
  (yellow, gold, orange). The trailing-24-hours pool word stays "(day)".
  Still open:
  - "see scores" sits alone on its row only when no replay trace exists
    (history views); after a live game it shares the row with Replay game.

## Ranks-won visibility and rank appearance (creator, 2026-09-21)

Review why the selected period omits earlier achievements in categories other
than the latest win's, especially 3BV 41 after a 3BV-40 win. The complete
[visibility review](reference/ranks-won-review.md) records the affected families,
independent cutoff/scope/collapse rules, verified interactions, and options.
Built: all 3BV and measured shape categories represented by wins in the selected
period now compete, within the current board-size/play-mode/generator key and
reference date's day-category scope. Full tablecharts retain their per-game
scope. [Recent placements](docs/product/rankings.md) records the resulting policy.

Appearance approved and built the same day: independent podium rank numbers
and full-row percentage tints, readable low/last/only-result states, a latest-game
edge, and explicit percentage/list-size labels. The same treatment reaches
all qualifying ordinals in the compact summary, including earlier games at
other 3BV values; blue edges and “this” identify the current one. [Rank highlights](docs/product/rankings.md) records
the implemented design; the alternative underline and uniform-blue treatments
from the comparison were not selected.

Still undecided: first-place exceptions for small pools, preservation of
collapsed category names, eligibility before duplicate collapsing, and current
standings versus achievements when earned. These rules were not changed by
the category-scope revision.

## Board-shape time lists (built 2026-08-21)

The lists themselves are in the product ([Rank lists](docs/product/rankings.md)).
Generation that aims at the same families is still unbuilt; see below.

## Board difficulty and expected performance (creator review, 2026-09-21)

Exact-ZiNi, HZiNi, and exact-maximum-clue time tablecharts are built, alongside 3BV,
with all standings visible and qualifying period-wide summary entries.
The [board difficulty review](reference/board-difficulty-review.md) separates
board rarity, conditional solve performance, workload, logic, and chance,
with primary online sources and explicitly proposed measurements.

**Built after this review:** HZiNi and 3BV spread time tables, HZiNi
win efficiency in Game stats, and the two requested exact fractions:
0–1 share = zeros and ones revealed by opening every zero / all safe cells
(covered ones excluded, clarified by the creator); zero-opening
coverage = the union of all zero floods including numbered borders counted
once / all safe cells. Both fractions now group time comparisons by the
nearest whole percentage point; 3BV spread uses the nearest 0.5 cell. Halfway
ties round up and recorded measurements retain full precision. Values appear
only in tablechart headings, with definitions and precise measurements on
mouseover/focus. These groupings also drive qualifying period-wide summaries.
Board fractions remain distinct from rank percentiles.
Saved-win backfill handles partial old measurements and shows progress,
Stop/Resume, unavailable/error counts, and immediately usable saved results
that survive reload. Old whole-board 0–1 counts are excluded until the player
backfills the corrected visible count. Exhausted backfill operations hide
their progress panel; actual errors stay visible. See [Per-game stats](docs/product/per-game-stats.md) for the
implemented behavior.

**Recurring backfill prompt (creator report and fix request, built 2026-09-23):**
Completed batches returned after reload because missing-board checks were
session-local. Backfill now queries the saved-board index before offering work,
excluding unavailable layouts without permanently marking games as skipped.
Restored traces become eligible again. Resume/Paused now require an explicit
Stop in the current page; reload offers any real remaining work as
`Backfill saved wins`. Browser regression covers the v2 database upgrade,
repeated reloads after exhaustion, and restoring a missing source board.
[Per-game stats](docs/product/per-game-stats.md) records the implemented policy.

**Declined for the current UI:** the creator asked to skip the other proposals,
including largest-opening share, remaining work clusters, deduction coverage/
depth, all-start logical profiles, and work-tree length. Their definitions and
tested calculators remain research, not queued implementation:
[structural-fraction review](reference/board-structure-research.md) and
[rigorous metric definitions](reference/board-metric-definitions.md).
Retired C*/RCW searches are outside the game's runtime.

A multifeature expected-time model also remains research. It needs held-out
validation, adequate sample sizes, a declared reference period, and separate
treatment of wins/losses. Actual time, clicks, mistakes, and pauses must not
be inputs to an allegedly board-only difficulty adjustment.

**Still unbuilt:** a scalable exact production calculation of the creator's
opening-first global minimum C₀*(B) = opening count + minimum remaining actions
after all zero floods. Its exact <=16-cell reference calculator and complete
definition exist. Opening zeros first does not remove the general optimization
problem on zero-free boards. HZiNi is a separate fixed greedy benchmark, not
a proved C₀*. No range or heuristic may be labeled the global minimum.
An optimal whole-game survival policy also remains research. No additional
metric implementation is approved by the retained research proposals.

## Recent and per-person trait–performance correlations (creator, 2026-09-23)

Identify which board descriptors are most associated with this person's
time performance now, and how that association differs by person. The
game-data visualization ranks this game's performance within lifetime/session
history and its board values in preferred directions. It does not compute
correlations or attribute solve time to traits. Historical session windows
now use the page's one session picker and derive summaries from existing records.

Existing history already collects primary trait measurements, solve time,
completion date, and the size/mine-count/mode/generator score key. Derive
correlation results from those facts rather than storing duplicate percentile
snapshots. The analysis still needs an explicit recent-period choice,
adequate measured samples, treatment of ties and missing values, and a
distinction between association, independent effects, and changes in player
speed over time. Per-person comparison needs explicit player attribution;
the current history store has no player identifier, and state tags must not
be silently treated as identities. No account tracking, cross-person data
collection, or fitted correlation view is implemented by the trait-line UI.

## Record-review improvements (mapped, 2026-09-21)

Proposals from the creator-requested thread audit; not approved implementation.
The compact gapless summary, surrounding table flow, and local day-of-month
comparisons are built. The earlier open ranking-policy choices and exact
opening-first click optimizer are tracked above.

- **Inspect an achievement's game.** Activate an individual recent rank to
  open its original finished game and matching comparison table, including
  earlier board categories absent from the currently displayed game. A
  compressed rank range first exposes its individual games. Preserve the
  summary's period, score key, and return scroll position. Saved-board replay
  needs that game's trace; do not imply an unavailable board can be restored.
  This is the first suggested addition because retained achievements should
  be directly inspectable.
- **See the cells behind a board metric.** A small separate finished-board
  preview can highlight the 0/1 cells revealed by all zero openings, the full
  union of zero openings, or the 3BV
  work points and their center. Associate it with the inspected record, which
  may differ from the active unfinished board. Reuse the exact existing
  definitions, keep help accessible by keyboard, and do not reflow the page
  on hover or add another permanent values list.
- **Compare time with the group's median.** Optional detail beside a board
  comparison can state seconds faster/slower than the median of that table's
  saved wins, with its sample count. Use the arithmetic mean of the two
  central times for an even count. This describes the same observed comparison
  pool as the rank; it is not an overall board-difficulty estimate or a
  prediction. It supplies magnitude where a rank alone gives only position.

## Generation (not built)

The board-generator registry exists (2026-08-25, [Board
generators and top score keys](docs/product/board-generators.md)): Default, Pink noise, and Blue noise,
each parameterized, chosen from the upper-right Generator menu, with
per-key rankings and the Board lab exploration mode. Everything below
is still unbuilt.

### More board generators (creator, 2026-08-25)

Built the same day ([Board generators and top score keys](docs/product/board-generators.md)):
pink noise (with the anisotropy stretch parameter), blue noise, green
noise, stippled, letterforms, and patriotic (the last removed
2026-08-30). Still unbuilt:

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
- **Flags and emblems.** The removed patriotic generator was
  stars-and-stripes; flag geometries generally (tricolors, crosses,
  circles) are a region-allocation pattern with different regions.
- **Combined modes and sizes.** More modes that combine generators
  with the NG/graded predicates, and new board sizes as their own
  ranked keys — the top score key already carries all of it.

### Solver-aware modes (mapped)

From the design axis in [docs/product/design-axis.md](docs/product/design-axis.md). NG generation is generate → solve →
reject/repair → repeat. Solver tiers are now implemented as (a) direct
counting, (b) arbitrary overlap-difference deduction, and (c) exhaustive
frontier-component search joined through the global mine count and sea.
This is layout-consistency solving, not a finite named-pattern catalog.
Derived session result: a
1-2…2-1 wall chain with k twos is fully forced unless k ≡ 0 (mod 3).

- **No-guess (NG) as its own menu mode.** Uniform / single-path /
  proof-or-die already generate NG boards ([Play modes](docs/product/play-modes.md)).
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
- **Which-song detail on the music state: decided against (2026-08-22).**
  The boolean `musicPlaying` is built ([Music playing](docs/product/per-game-stats.md)).
  PipeWire also exposes each stream's `media.name` (Firefox: the playing
  tab's media title), so song titles are technically reachable, but the
  creator decided titles are never stored: they are personal data that
  would live forever in records and exports. Not open for revisiting
  without a new explicit request. MPRIS (artist/album) is absent for
  this Firefox; would need a player that registers one.

## Longitudinal behavior and state analysis (creator, 2026-08-30)

Build an analysis surface over history plus traces. It must keep exact
board/mode/generator and measurement-era strata visible and make sample
coverage explicit. The measurement and interpretation requirements are
canonical in [Behavioral signatures and state research](docs/product/measurement.md).

Data layer built 2026-09-04: `analysis/history/summarize-history.js`
regenerates the stratified summary offline (sessions with early/late
halves, per-key/per-day trends, loss taxonomy in the report's wording,
guess policy, luck calibration, state/music contrasts; see
`analysis/history/NOTES.md`). The in-app surfaces below remain unbuilt; the
script's JSON is the intended input for their first versions.

- **Per-session and trailing-chunk summaries.** For every completed or current
  session and every selectable recent played-time chunk, prominently show
  games, wins, win rate, and accumulated play time. Beside them show robust
  center/spread and measured n for mouse speed (px/s), useful click rate (/s),
  fastclick gap (ms), path per click, and the available trace-derived movement,
  pause, click-hold, and verification measures. A chunk with no finished game
  has no win-rate reading; it is not 0%.
- **Session comparison views.** Small multiples align sessions at first play;
  paired early/late summaries expose warm-up or degradation; rolling windows
  show the latest state without letting long high-volume sessions become
  thousands of false independent samples. Calendar-day and whole-session
  uncertainty are computed with day/session as the resampling unit.
- **Behavioral tendency signature.** Preserve separate dimensions for useful
  click cadence, movement speed/path geometry, marking/chording style,
  same-cell no-op bursts, visible-fact contradictions, fatal-action types,
  and guess policy. Show rates as well as counts so board exposure and
  truncated losses do not masquerade as tendencies.
- **Error grammar.** Break no-ops into unavailable chord, click-on-flag, and
  flag-on-revealed-cell; separate visible-state contradictions from the
  narrower likely physical-misclick inference; show repeated same-cell bursts,
  action order, board region, and eventual outcome. Sequence analysis sorts
  action evaluations by `atMs` rather than trusting historical array order.
- **Guess-policy progression.** By exact level and over date/session position,
  chart the shares and risk magnitudes of guaranteed-safe alternatives
  ignored, minimum-risk guesses, higher-risk guesses, one-ply model-best
  choices, and model disagreements. Add information-gain/deeper-horizon
  measures only when their definitions and coverage are explicit.
- **Competing optimization objectives.** Put per-game win probability beside
  wins per wall-clock hour, attempts per hour, expected time to the next win,
  and progress/risk per played hour. Test whether higher levels produce a
  shift from per-instance survival toward rapid exposure/restart policy; do
  not call that less sophisticated unless it is worse under the objective
  being evaluated.
- **State association and classification.** Compare explicitly labeled states
  with session-matched controls, then evaluate any classifier on held-out
  whole sessions against time-of-day and session-position baselines. Report
  class counts, calibration, confusion/errors, and uncertainty. One player's
  data can test within-player state prediction; identifying different people
  requires labeled data from multiple people and a separate consented study.
- **Priority visuals.** Session-aligned metric ribbons; trailing-chunk stat
  strips; speed/accuracy/risk frontiers; full-text fatal-status composition;
  risk-calibration curves; guess-policy shares by level; same-cell no-op burst
  rasters; and held-out state-classifier calibration/confusion views.

## Session stats follow-ons (creator direction, 2026-08-22)

The session section ([Session stats](docs/product/session-stats.md)) is built: mouse speed,
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
  charts got ladder ceilings with shrink hysteresis ([The
  action-rates charts](docs/product/session-stats.md)); the solo session charts (mouse speed,
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

The after-game path views are built ([Path replay views](docs/product/replay.md)):
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

## Space during startup (known issue, confirmed 2026-09-23)

Present before the `game/` split: pressing Space while the page is still
booting throws "Cannot read properties of null (reading 'playMode')",
because the Space shortcut calls `requestNewGame` before settings have
loaded. `.game-booting` already blocks pointer input to the loading
chrome; the keyboard shortcut has no equivalent guard.

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
  Green noise / Stippled / Letterforms, per-key rankings
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
  trace recorder that it exposed ([Path replay views](docs/product/replay.md) and
  [Raw input traces](docs/product/storage-and-history.md)).

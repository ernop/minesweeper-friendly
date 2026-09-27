# Unbuilt work

Single list of what exists as an idea and is not in the product yet.
Implemented behavior stays in the product spec (`PRODUCT.md` indexes its
section files). This file is the place to add the next request; do not
leave new ideas only in chat.

Status labels: **creator** = the creator asked for it; **mapped** = named
on the design axis or in a research note, not requested as a build.

## Training toward Expert sub-60 (creator, 2026-09-26)

The plan and the read-only training page are built
([Training](docs/product/training.md)). The creator then asked for plan v2:
measure against real players first, break play into subskills, and build
"Minesweeper problems" from real positions (same file, "Redo requested").
Unbuilt parts of plan v2 (creator):

- **Corpus at scale.** Built: a 3BV/s-stratified saolei.wang sample (about 50
  games per level, at most 3 per player), growing to about 150 per level. Still
  open: board difficulty in the model (3BV, openings).
- **Situation annotation.** Built (`analysis/skill-comparison/situations.js`;
  results in [Training](docs/product/training.md#situations-memorization-and-problems-requested-2026-09-26-evening)).
- **Gap ranking.** Replace one component at a time (reaction, travel, hover,
  economy, pauses) in the player's own games with a faster level's values for
  the same situations; rank subskills by seconds saved. The situation analysis
  prices each trait's gap from the player's counts; the counterfactual replay
  is still open.
- **Pointing test.** Built as `pointing-v1` on the problems page
  ([problems.md](docs/product/problems.md)). Open: a within-player zoom block
  comparing runs at 16 px and the usual square size.
- **Minesweeper problems.** Version 1 built; follow-ons under
  [Minesweeper problems](#minesweeper-problems).
- **Level placement.** Built at the level of the average game at the player's
  speed with bootstrap intervals. Still open: a per-class model with player
  effects, once the corpus holds enough fresh moves per class and level.
- **Keyboard keys as mouse buttons (mapped).** minesweeper.online lets keys act
  as the buttons, separating clicking from aiming; a candidate for alternating
  blocks. Both-button chording and the 1.5 click are built as standard behavior
  (2026-09-26), and the trace-metrics cell-geometry defect found by the
  comparison is fixed.

Earlier proposals, still open:

- **Per-game economy feedback.** After each Expert win, show that game's
  removable inputs, one-cell chords, and flags no multi-cell chord used, so
  every attempt gets immediate feedback instead of a page visit. Compute it in
  the analysis worker from the finished trace.
- **Opening statistics.** First-click position, opening rate, and wins after an
  opening versus a numbered start, from a per-record first-reveal fact or a
  worker replay of all traces. Today these numbers exist only in the dated
  reference analysis.
- **Drills aimed at the stages.** A timed recognize-and-click drill over local
  positions taken from the player's own long pauses and misreads, shown in all
  rotations and reflections with look-alike patterns mixed together (far
  transfer from generic drills is near zero); a mid-game sprint (a
  deduction-only mid-game position, the Endgame drill's larger sibling);
  full-length Expert no-guess practice if generation cost allows.
- **Technique comparisons.** Matched blocks comparing two styles (for example
  counted flagging versus no-flag) on IOE, seconds per input, and
  conversion, with block-level uncertainty.
- **Intermediate on the page.** The warm-up level's economy and pace beside
  Expert.
- **Board-adjusted pace and plateau detection.** 3BV/s rises with board 3BV, so
  weekly trends should also show pace adjusted for 3BV (and openings) beside
  the raw medians. Call a plateau only when changepoint detection finds no
  recent upward phase and an equivalence test puts the recent slope below the
  smallest improvement that matters (sources in the training reference).
- **Target review.** The stage targets came from the 2026-09-26 history;
  revisit them once Stage 1 completes.

## Minesweeper problems

Version 1 is built ([Minesweeper problems](docs/product/problems.md)). Open:

- **Own subdomain (creator request, 2026-09-26).** Serve the page at a
  Minesweeper-problems subdomain of fuseki.net (transcribed as "mindsweeper
  problems dot forsake you dot net"; `minesweeper-problems.fuseki.net` by the
  existing naming). Steps outside this repository, following the procedure
  that launched `minesweeper-friendly.fuseki.net`: a DreamHost A record to
  146.190.147.109, a Let's Encrypt certificate, and an nginx site in the
  Fuseki repository (`setup/nginx/`) whose root is the same release directory,
  with `index problems.html`. The page keeps its own database, so a separate
  origin needs no storage change; attempts made on the game's origin stay there
  unless exported and imported. On that host the return-to-game link must
  point at the game's own host, whose origin holds the player's history.
- **Exact click judgement.** Judge each click outside the answer squares in a
  worker: provable from other numbers at that moment, or a guess.
- **Adaptive scheduling.** Choose classes by the player's gap to the next level
  and repeat missed problems after spaced intervals.
- **More classes.** Mine-answer problems (the answer is a flag or a chord), the
  two-number families that reach 20 judged corpus moves as the corpus grows,
  and straight-edge runs as their own classes.
- **Problems from the player's own games,** timed against the player's in-game
  response to the same moment.
- **Archive folder.** Write each attempt to the archive folder like
  self-checks.

## Fuseki hosting (creator, 2026-09-26)

Add Minesweeper under the Fuseki project site with independent, isolated
hosting; [the hosting specification](docs/product/hosting.md) and
[implementation plan/status](docs/implementation/hosting.md) own the detail.
Live at https://minesweeper-friendly.fuseki.net/ since 2026-09-26; every
verified master push is released. Voice-Wei origin migration must preserve its
saved browser data and deliberate authenticated Articles integration.
Nectaris Remake is requested for later: prepare the same deployment contract,
then audit its runtime artifact and origin requirements before launch.

Generic multi-project hosting gaps are tracked in
[Fuseki's roadmap](https://github.com/ernop/fuseki4_ai/blob/master/docs/todo.md#independent-apps-2026-09-26).
(Music detection is local-only since 2026-09-26; see
[Music playing](docs/product/per-game-stats.md).)

## Long-history trend cost (creator concern, 2026-09-26)

The user asks whether fits cover every retained game and notes that O(n log n)
still grows. The worker/exact-selection change is built; bounded lifetime cost
is not. See [Point charts — Lifetime growth concern](docs/product/charts.md#lifetime-growth-concern-2026-09-26)
and [the current scope and cost](docs/implementation/charts.md#lifetime-scope-and-remaining-cost-2026-09-26-review).

Investigate worker-owned history updated by deltas, exact model caches keyed by
data revision/scope, incremental bucket aggregates, and calculating charts when
their views need them. Measure history cloning, repeated loss/view renders, new
wins, startup, and imports separately. Preserve the existing lifetime coverage
and exact estimator unless the creator selects a statistical-definition change;
no cap, sampling, or reduced refresh frequency has been approved.

## Input latency follow-ons (creator report, 2026-09-26)

The creator reported laggy clicks on the GitHub Pages site in Firefox, from
the first square on ([Input latency](docs/product/board-and-layout.md#input-latency-user-report-2026-09-26)).
Built: exact, faster click-time proof and odds evidence, session charts
that redraw once per session step during a game, and one stored record per
game instead of rewriting the whole history twice per game. Not built:

1. **Proof-budget tail.** About 1% of expert positions exhaust the exact
   proof's 2,000,000-node budget (about 90ms in Firefox, every click on
   them) and end incomplete. A memoized frontier search would finish them
   in milliseconds but would complete proofs the current rule leaves
   incomplete, changing Justice, misclick, and evidence results; that needs
   a proof-version decision.
2. **Evidence off the input path.** Odds and misclick evidence could move to
   a worker, but the exact proof stays synchronous because A Just Universe
   needs it before revealing, and game-end finalization would have to wait
   for the last action's evidence. After item 1 this would save only a few
   milliseconds per click.
3. **Remaining freezes found by attributed measurement (2026-09-26).** In
   Firefox with the stats panel open, all measured as our own code:
   - After a game, the report arrives in tasks of 60-160ms: `renderResult`
     work between yields, the trace copy in `saveTrace` (about 45ms on
     expert), and a forced layout of the whole finished report when
     `renderResultAsync` ends with `syncBoardLayout` (58-94ms; once 783ms).
     Inserting sections progressively, or skipping offscreen sections'
     layout, would split the layout; both change how the report appears,
     so they await a creator decision.
   - Switching board size while a report is shown takes about 200ms: the
     forced layout in `newGame`'s `syncGameSidebar`.
   - Some expert clicks take 57-92ms in the misclick check, where the exact
     proof exhausts its work budget (item 1).
4. **Waste the latency check measures (2026-09-26).** Our own handlers, in
   Firefox, with no report shown: a new intermediate game takes 26-28ms of
   work (8ms in Chromium) to build 256 cells, and switching to expert takes
   20-21ms. The largest freeze in the two seconds after a game ends is
   82-91ms (the report tasks in item 3). The creator's rule is that time with
   no logical reason to exist is waste; cutting these lowers the limits in
   `tests/latency-budgets.json`.
   Occasional spike (2026-09-26): one latency run in nine on the same code
   measured switching to expert at 45ms of work (usual 15-23ms; master
   showed 17-21ms over the same alternating runs). Not yet attributed; a
   profile of a spiking run would show whether it is garbage collection or
   background analysis landing during the switch.

## Game data as the primary result surface (creator, 2026-09-23)

The creator likes the game-data band and hopes it can "supercede so many
other UI elements", said the page layout is "not very standardized nor
efficient", and asked that the chart not be crushed and that "the labels
must match better". Built the same day: fluid details column, compact setup
rows, a chart filling the remaining column height, and one-line labels
placed from measured widths (docs/product/game-data.md "Layout pass").

Decided and built later that day, with label simplification on 2026-09-26:
lifetime is implicit ("3BV/s 1.600"), while narrower comparisons retain
"(session)" or "(day)". Comparisons with fewer than two eligible measured
games are omitted, including the former one-game section
([Game data](docs/product/game-data.md)). The best in a pool is 0%, using
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
  measurement repeat the same value ("time 44.382s", "time 44.382s
  (session)"). A single label with one marker per scope would roughly halve
  the left side's labels. The 2026-09-26 revision removes the lifetime suffix;
  combining multiple scopes under one measurement label remains unbuilt.
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
  (nothing is the new-player default), protection-aware risk magnitudes,
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

## Lifelong self-measurement roadmap (creator, 2026-09-26)

The creator asks for something usable "over years and decades to measure and
check all aspects of myself". Purpose and rules:
[Lifelong self-measurement](docs/product/measurement.md#lifelong-self-measurement-creator-direction-2026-09-26).
Built first on 2026-09-26:
- [self-check v1](docs/product/self-check.md): a sleepiness rating plus a
  10-counter alertness test (it replaced the first 3-minute test, which the
  creator found too long), with history and backup;
- the time zone on finished-game records;
- screen and browser facts on traces, and input provenance
  ([capture v1](docs/product/storage-and-history.md#capture-provenance-v1-2026-09-26):
  browser event times, focus and visibility changes, and physical right-button
  press and release);
- the [automatic archive folder](docs/product/storage-and-history.md#archive-folder-creator-direction-2026-09-26);
- a persistent-storage request.

Remaining, in priority order (earlier items prevent irreversible loss):

1. **Nothing lost.**
   - **Archive import.** Rebuild a browser database from an archive folder,
     for a new machine or profile. Writing is built.
   - **Every attempt.** Restarted and abandoned boards keep a record and a
     partial trace with an explicit end reason, checkpointed during play, so
     practice exposure and between-game intervals become countable. Never
     relabel a restart as a loss.
   - **Full-rate pointer capture.**
     - Pointer Events with every coalesced sample, and event time as the sample
       clock. Chromium's `mousemove` stream delivers one sample per display
       frame.
     - Physical press and release for both buttons anywhere, including
       cancellations, each linked to the game action it caused.
     - The paint time of each board change.
     - Pointer exit and re-entry.
     - Replace capture v1's per-sample trust and merge arrays.
     - Store each action's board changes instead of the full visible board
       before every action, which is half of every trace (measured
       2026-09-26). Replay and analysis rebuild positions by applying the
       changes in order.
   - **Declared setup registry.** Mouse, DPI, pointer speed and acceleration,
     hand, display, and a per-display pixels-per-millimetre calibration, with
     change events stamped onto games and checks.
   - **Timestamped state-tag changes**, and a standalone sleepiness rating
     during play sessions.
2. **More frozen checks.** Each is 90 s or less, under the self-check
   versioning rules:
   - an aimed-pointing test (fixed amplitudes and widths in millimetres after
     calibration);
   - a deduction test from a fixed generator, with parallel forms stratified
     by solver tier, so no position repeats but difficulty matches;
   - a processing-speed task, only if those two leave a gap.
3. **Gameplay as a calibrated passive measure.**
   - The provability replay: when each cell became provable from the visible
     board, and time to action, by solver tier.
   - A split between hand slips and decision errors.
   - Per-movement tables in place of per-game means.
   - Fix or retire the trace stats with known formula defects: wander's window
     mismatch, signed MAD/AUC/AD that cancel, recovery runs cut off by the
     game's end, and idle under event-driven sampling.
   - Then regroup the displayed core by dimension and rename. The popups were
     rewritten short on 2026-09-26 (docs/product/ui-doctrine.md, "Stat
     explanations"); update each one as its stat is renamed, fixed, or retired.
   - Local-time groupings use the recorded time zone.
4. **Long-horizon views.**
   - A "me over time" page: daily values, personal baseline bands, change
     detection, time-of-day and seasonal profiles, and annotations for setup
     and protocol changes and notes.
   - Automatic reports of day-to-day reliability, and of associations among
     checks, ratings, and play.
   - Charts for self-check history.
5. **Optional body channels.** Heart rate and beat-to-beat intervals from a
   chest strap through the local base system (the music endpoint's pattern),
   then others as the creator chooses. Each joins the rest by time; none is
   inferred from cursor data.

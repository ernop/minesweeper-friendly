# Characterizing mouse motion beyond total speed — research survey

Compiled 2026-08-20 from four literatures that all profile people through
cursor movement: psychometric mouse-tracking, behavioral biometrics
(mouse dynamics), clinical motor assessment, and esports/HCI kinematics.
Purpose: a menu of candidate per-game measurements for this project. The
formulas record cursor geometry and timing; they do not by themselves reveal
the player's cause, intention, cognitive state, expertise, health, or hardware.
Findings cited below belong to the cited studies' tasks and populations and
are hypotheses—not validations—for Minesweeper data. Implementation status (updated
later on 2026-08-20): all four systems now run in-page over the raw trace
and display live plus canonically at game end (PRODUCT.md "Trace metrics
panel") — the biometrics session set, the mousetrap psychometric
measures (exact port, R-verified), the Hevelius-style clinical features
(FEATURES.md mapping), and this file's own Tier 1/2 proposals in their
trace-computed form (see the Tier 1/2 notes below).

## Measurement principle: spent effort is never a no-op

Decided 2026-08-20, binding on every metric in this file: an action the
player retracts (flag then unflag) and movement that leads to nothing
(approach, hover, leave) are real expenditures of time and motion. They
existed. Every metric must record them as positive events — counted,
timed, annotated — and no metric may subtract, drop, or average them
away. "Waste" metrics label such effort as waste; they never delete it
from the underlying totals (clicks, path, time). The implemented
example: a removed flag stays in `clicks` and `flagsPlaced`, and the
retraction itself is noted in `flagsRemoved`; `mousePathPx` keeps every
pixel of fruitless travel, and the proposed wander ratio and feintCount
annotate that travel rather than filter it.

## What each field measures and calls things

### Psychometric mouse-tracking (decision research)

The MouseTracker / mousetrap tradition (Freeman & Ambady 2010; Stillman
2018 TiCS review; Kieslich et al., mousetrap R package) records cursor
trajectories in controlled choice tasks. Those studies interpret some
trajectory differences in relation to conflict; this project only reuses
the formulas:

- Maximum absolute deviation (MAD) and area under the curve (AUC):
  how far the actual path bows away from the straight line from movement
  start to the click. Interpreted as attraction toward the option not
  chosen — conflict between candidate moves. MAD and AUC correlate
  r = .8-.9; one of them suffices.
- x-flips: number of direction reversals along the axis separating the
  options. Read as changes of mind / decision instability.
- Sample entropy: unpredictability of the trajectory over time —
  spatiotemporal disorder. Correlates only ~.5 with flips, so it captures
  something flips miss.
- Velocity/acceleration profiles over normalized time: when in the
  movement the commitment happened.

Minesweeper mapping: each inter-click segment is an observable path from
one click to the next. Deviation-from-straight and reversal counts are
computable per segment; calling that segment a decision or hesitation would
require evidence not present in the trace.

### Behavioral biometrics (mouse dynamics)

Used for user authentication and bot detection (Zheng et al. CCS'11;
mouse-dynamics surveys 2022-2025). Their standard feature vocabulary:

- Pause-and-click: time between the end of movement and the click.
  ("Lag" before committing.)
- Number of pauses, paused time, paused ratio (share of a session spent
  not moving) — often called the silence ratio.
- Click duration: mousedown-to-mouseup time.
- Speed, per-axis velocity, acceleration, jerk, angular velocity.
- Curvature and curvature distance (ratio of chord length to
  perpendicular deviation for consecutive point triples) — path shape,
  the single most user-identifying family of features in Zheng et al.
- Stroke segmentation: movement bouts split by silences; features
  computed per stroke.

The cited biometrics studies report hardware/platform differences in some
speed and pause features and greater cross-platform stability for some
angle features under their conditions. This project has not established
either result. A "new mouse" tag merely records context for later analysis;
it is not a control and does not prove that hardware caused a change.

### Clinical motor assessment (health profiling)

Controlled clinical tasks have used mouse trajectories in models of
Parkinsonism, ataxia, tremor, and fatigue (Hevelius tool, Gajos et al.,
Movement Disorders 2020; INRIA tremor-detection 2020; submovement studies).
Those validations do not transfer automatically to ordinary Minesweeper;
this project performs no clinical inference:

- Hevelius extracts 32 features from target-directed mouse movements;
  the ones that separated patients from controls: movement time,
  number and duration of pauses, click duration, distance from target at
  the end of the primary submovement, normalized jerk (movement
  smoothness), noise-to-force ratio.
- Submovement count: healthy fast movement is one ballistic pulse plus
  at most one correction; impairment (or unfamiliarity, or fatigue)
  shows as more submovements, detected as acceleration or jerk
  zero-crossings.
- Tremor: cited work examines 4-6 Hz oscillation superimposed on the path.
  A state tag such as "sleepy" or "inebriated" is only a self-reported
  grouping variable; any association would need to be tested.

### Esports / HCI kinematics

Aim Lab (Frontiers in Human Neuroscience 2022), Aiming.Pro metrics,
Fitts's law pointing research:

- Reaction time: stimulus onset to movement start. Minesweeper has no
  observed instruction or goal-onset equivalent; it can only record elapsed
  time from an observable board event or preceding click.
- Path efficiency: straight-line distance to target divided by actual
  path length. The exact formalization of "wasted motion".
- Overshoot/undershoot: passing the target and coming back vs clicking
  short, split by movement direction.
- Initial movement angle vs target direction: the angular difference
  between the first sampled movement and the eventual click direction.
  It does not establish that a plan changed.
- Fitts's law throughput: effective bits/s of pointing, from target
  distance and size vs movement time. Cell size is fixed here, so
  throughput reduces to distance-vs-time curves per click.
- Expertise signature: experts show shorter reaction times, faster peak
  speed, and fewer corrective submovements — not just higher average
  speed.

## The user's asks, translated

| Ask | Literature name | Concrete metric |
| --- | --- | --- |
| stddev of speed | speed variability | RMS/stddev of segment speed |
| lag | pause-and-click | stillness time immediately before each click |
| time paused | paused ratio / silence ratio | total ms not moving while playing; pause count; longest pause |
| time confused | x-flips, submovement count, hover-abandon | direction reversals; approaches that end without a click |
| wasted motion | path efficiency (inverse) | mouse path ÷ sum of straight lines between consecutive clicks |

## Proposal shaped to this project's storage rules

Constraint recap (agents.md design rules): store primary facts once,
derive at read time, small scalars per record, no raw traces in the
game record.

Status (2026-08-20): the Tier 1/2 ideas below are implemented as
trace-computed display metrics (computeWasteMetrics in minesweeper.js,
the "waste" section of the metrics panel), not as stored record fields —
the raw trace decision (Tier 3) made the store-a-scalar-per-metric
framing moot, since every value is recomputable from the trace forever.
Implemented from the trace: pauses/paused/longest pause (250 ms bar),
wander ratio, turnarounds (dirChanges), feints. One definitional
deviation: the feint proposal below says "hidden cell", but the trace
does not carry cell reveal state, so the implemented feint counts a
clickless dwell-then-leave over any board cell. Not implemented:
`mouseActiveMs`/`speedSqPxMs` as record fields (the biometrics set's
moving time and speed stats cover the same ground from the trace) and
the survey's `submovementCount` sketch (superseded by the Hevelius
submovement decomposition, thresholds 100/500 px/s, in the clinical
set).

### Tier 1 — running aggregates, no trace needed

Each is a single number accumulated during play (like mousePathPx today)
and stored as a primary measurement; everything else derives:

1. `mouseActiveMs` — ms spent actually moving (mousemove gaps < 100 ms
   chain into one bout). Derives: idle time = timeMs - mouseActiveMs,
   silence ratio, and true moving speed = mousePathPx / mouseActiveMs
   (today's "mouse speed" divides by total time, so nonmovement time is
   included in its denominator; the trace does not identify that time as
   thinking).
2. `pauseCount` and `longestPauseMs` — pauses = gaps >= 250 ms while
   playing. Derives mean pause length. The reason for a pause is not
   observed.
3. `clickTravelPx` — sum of straight-line distances between consecutive
   click positions. Derives wander ratio = mousePathPx / clickTravelPx
   (1.0 = the straight-line minimum between the observed click positions;
   excess path has no assigned cause).
4. `dirChanges` — heading reversals > 90 degrees between movement
   segments of >= 8 px each (the length floor keeps pixel jitter out).
   The x-flips analog on an open 2D board.
5. `speedSqPxMs` — sum over samples of (segment speed squared × segment
   duration). With mousePathPx and mouseActiveMs this derives RMS speed
   and stddev of speed at read time; nothing else stored.
6. `preClickStillMs` — total stillness time immediately preceding each
   effective click (pause-and-click). Derives mean lag per click:
   pre-press stillness separated from sampled travel; it does not isolate
   a decision process.

### Tier 2 — event detection during play, still scalar outputs

7. `feintCount` — cursor dwells >= 300 ms over a hidden cell, then leaves
   without clicking within that dwell. It records that event without
   inferring whether the player intended to click.
8. `submovementCount` — acceleration zero-crossings within movement
   bouts. Clinical studies have used related measures, but this project
   does not infer fatigue or impairment from the count.
   Requires velocity differentiation with light smoothing; thresholds
   need tuning against real play before the definition is frozen into
   the schema.

### Tier 3 — requires the raw trace (DECIDED and implemented 2026-08-20)

Sample entropy, MAD/AUC per segment, tremor spectrum (4-6 Hz band
power), overshoot analysis, Fitts throughput curves all need the
(t, x, y) series. Raw traces are now captured for every finished game
and stored in IndexedDB (see PRODUCT.md "Raw input traces"), which
sidesteps localStorage's ~5 MB cap. The deciding argument held:
aggregate definitions freeze at record time, while a stored trace lets
any future metric apply retroactively. Offline pipelines live under
analysis/ (mousetrap measures per inter-click segment; biometrics
feature extraction). Since 2026-08-20 all four systems are also computed
in-page from the trace and displayed live during play plus canonically
at game end (PRODUCT.md "Trace metrics panel"): the biometrics session
set (parity-checked against the Python extractor), the mousetrap
psychometric measures (exact port, parity-checked value-for-value
against the R package on randomized traces), the Hevelius-style clinical
features (known-answer tested; no runnable reference exists), and the
Tier 1/2 waste measures above. Harnesses: tests/metrics-*.js.

### Interactions with existing features

- Every Tier 1/2 metric joins the schema under the established absence
  rules (absent = not measured, valid on import).
- The states panel supplies self-reported grouping variables. Comparisons
  such as silence ratio by "sleepy" or speed by "new mouse" are untested
  hypotheses here; correlation would not establish causation.
- Threshold constants (100 ms bout gap, 250 ms pause, 300 ms dwell,
  8 px segment floor, 90 degrees reversal) are definitional parts of
  each metric: changing one later changes the metric's meaning, so they
  must be fixed before the field enters the schema and named in its
  `describe` string.

## Goal birth time and segment anchoring (decided 2026-08-20)

Every literature ported here measures movement against an *instructed*
goal: a target appears (that is t = 0) and the participant is told to
click it. Gameplay has no such instruction — the goal is born inside the
player's head at some unobservable moment. Working through a concrete
scenario settled how this project handles that.

The scenario: a click reveals two usable frontiers, A and B. The player
works A's chain of clicks quickly and well, then returns across the
board and clicks B (call that move C). When was the goal of C born?
Four defensible answers, possibly minutes apart:

1. Information birth — the original reveal that exposed B. From that
   instant B's deduction was available in the world. This is the closest
   analog to the lab's "target onset" (in the lab, availability and
   instruction are fused into one stimulus).
2. Deduction — the private moment the player worked out that B is safe.
   Cognition runs in parallel with motor execution, so this may happen
   *during* the A-chain. No trace can observe it.
3. Commitment — the moment after the last A click when the player
   decided "now B."
4. Re-verification — a possible second deduction on arrival at B,
   visible only as pre-click stillness.

DECIDED: movements are anchored at the last click before them (the A1
segmentation), regardless of how long before that the destination had
been revealed or become deducible — i.e. the code's operational answer
is "birth = commitment," candidate 3, and candidates 1, 2, and 4 are
deliberately not guessed at. The reason is the measurement purpose: this
system characterizes the outer physical world, where the player actually
interacts with the mouse and generates movements — not the inner
cognitive one. Intention is private; anchoring at observable clicks
keeps every number a statement about physical interaction. Consistently,
a cell resolved indirectly by separate processes (flood fill, a chord
from elsewhere) produces no movement, no segment, and no work items at
all — correct, because no physical interaction happened there.

Two consequences worth remembering when reading the numbers:

- Unobserved cognition may occupy different amounts of different segments.
  The trace cannot determine whether a return was queued, whether thinking
  occurred earlier, or whether a deduction was fresh. Per-game means mix
  segments with unknown internal timing.
- A deliberate-movement classifier inspired by CHI 2012 could be tested,
  but its labels and validity in Minesweeper would need independent
  validation; it cannot be assumed to identify queued returns.

Computable refinements, researched, NOT built:

- Final-approach onset (trace-only): define the start of the last
  movement bout that terminates in the click as "the run at the
  target," and measure initiation/transport from there instead of from
  the previous click. Handles both the wandering case and the queued
  return correctly.
- Deducible-since timestamps (needs a solver replay): stamp, per cell,
  when it first became provably safe/mined — the observable surrogate
  for information birth (candidate 1). Gives opportunity latency =
  click time − deducible-since, decomposable into visible transport
  plus invisible cognition-and-queueing.
- Queue metrics built on that: how long discovered-but-pending
  frontiers wait and their clearing order. Associations with state tags
  would be hypotheses to test. No ported
  literature measures this — their tasks have one instructed goal at a
  time; minesweeper naturally has a queue.

## Sources

- Stillman, Shen & Ferguson 2018, "How Mouse-tracking Can Advance Social
  Cognitive Theory", Trends in Cognitive Sciences.
- Kieslich et al., mousetrap package tutorial (Behavior Research
  Methods 2025) — MAD/AUC/AD definitions, flips, sample entropy.
- Zheng, Paloski & Wang, CCS 2011 — angle-based mouse-dynamics metrics,
  pause-and-click, platform-independence of curvature features.
- "Mouse Dynamics Behavioral Biometrics: A Survey" (arXiv 2208.09061)
  and Computers & Security 2025 survey — the standard feature vocabulary.
- Gajos et al. 2020, "Computer Mouse Use Captures Ataxia and
  Parkinsonism" (Hevelius, 32 features), Movement Disorders.
- INRIA 2020 tremor detection from cursor data; PMC 2025 submovement
  study (acceleration/jerk zero-crossings, PD vs controls).
- "Assessment of human expertise and movement kinematics in first-person
  shooter games", Frontiers in Human Neuroscience 2022 (Aim Lab).
- Aiming.Pro metrics help — path efficiency, over/undershoot, initial
  movement angle, per-shot trends.

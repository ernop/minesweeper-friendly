# Characterizing mouse motion beyond total speed — research survey

Compiled 2026-08-20 from four literatures that all profile people through
cursor movement: psychometric mouse-tracking, behavioral biometrics
(mouse dynamics), clinical motor assessment, and esports/HCI kinematics.
Purpose: a menu of candidate per-game measurements for this project, each
tied to what it reveals about the player. Implementation status (updated
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
2018 TiCS review; Kieslich et al., mousetrap R package) records the
cursor en route to a choice and reads hesitation and conflict out of the
trajectory:

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

Minesweeper mapping: each inter-click segment is a decision about where
to click next. Deviation-from-straight and reversal counts are directly
computable per segment.

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

Notable finding: speed and pause features shift with hardware/platform;
angle-based features are stable per person across platforms. For this
project that means speed metrics will move when the player changes mouse
(a states tag like "new mouse" is the control), while curvature-family
metrics track the player.

### Clinical motor assessment (health profiling)

Mouse trajectories detect and grade Parkinsonism, ataxia, tremor, and
fatigue (Hevelius tool, Gajos et al., Movement Disorders 2020; INRIA
tremor-detection 2020; submovement studies):

- Hevelius extracts 32 features from target-directed mouse movements;
  the ones that separated patients from controls: movement time,
  number and duration of pauses, click duration, distance from target at
  the end of the primary submovement, normalized jerk (movement
  smoothness), noise-to-force ratio.
- Submovement count: healthy fast movement is one ballistic pulse plus
  at most one correction; impairment (or unfamiliarity, or fatigue)
  shows as more submovements, detected as acceleration or jerk
  zero-crossings.
- Tremor: 4-6 Hz oscillation superimposed on the path; even healthy
  people show elevated physiological tremor under fatigue or alcohol —
  which is exactly what the states tags ("sleepy", "inebriated") could
  correlate against.

### Esports / HCI kinematics

Aim Lab (Frontiers in Human Neuroscience 2022), Aiming.Pro metrics,
Fitts's law pointing research:

- Reaction time: stimulus onset to movement start. Minesweeper analog:
  board changes after a reveal → how long until the cursor starts moving
  toward the next click.
- Path efficiency: straight-line distance to target divided by actual
  path length. The exact formalization of "wasted motion".
- Overshoot/undershoot: passing the target and coming back vs clicking
  short, split by movement direction.
- Initial movement angle vs target direction: did the hand start toward
  the eventual click or somewhere else first ("went one way, changed
  plan, went another way").
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
   (today's "mouse speed" divides by total time, so thinking time
   dilutes it).
2. `pauseCount` and `longestPauseMs` — pauses = gaps >= 250 ms while
   playing. Derives mean pause length. Longest pause is the "stuck on a
   deduction" moment.
3. `clickTravelPx` — sum of straight-line distances between consecutive
   click positions. Derives wander ratio = mousePathPx / clickTravelPx
   (1.0 = perfectly direct all game; the pure "wasted motion" number).
4. `dirChanges` — heading reversals > 90 degrees between movement
   segments of >= 8 px each (the length floor keeps pixel jitter out).
   The x-flips analog on an open 2D board.
5. `speedSqPxMs` — sum over samples of (segment speed squared × segment
   duration). With mousePathPx and mouseActiveMs this derives RMS speed
   and stddev of speed at read time; nothing else stored.
6. `preClickStillMs` — total stillness time immediately preceding each
   effective click (pause-and-click). Derives mean lag per click:
   decision lag separated from travel.

### Tier 2 — event detection during play, still scalar outputs

7. `feintCount` — approaches that die: cursor dwells >= 300 ms over a
   hidden cell, then leaves without clicking anything within that dwell.
   Direct "moved there, did nothing, went elsewhere" counter.
8. `submovementCount` — acceleration zero-crossings within movement
   bouts. Smoothness/fatigue marker from the clinical literature.
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
- The states panel is the natural experiment layer: silence ratio vs
  "sleepy", dirChanges and submovements vs "inebriated", speed stddev vs
  "new mouse" are exactly the correlations the clinical and biometrics
  literatures found to be real.
- Threshold constants (100 ms bout gap, 250 ms pause, 300 ms dwell,
  8 px segment floor, 90 degrees reversal) are definitional parts of
  each metric: changing one later changes the metric's meaning, so they
  must be fixed before the field enters the schema and named in its
  `describe` string.

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

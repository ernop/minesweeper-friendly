# Hevelius: the 32 movement features and their mapping to our traces

Hevelius (Gajos, Reinecke, Donovan, Stephen, Hung, Schmahmann, Gupta;
Movement Disorders 2020, doi 10.1002/mds.27915) is a web-based pointing task:
click a sequence of circular targets with a mouse. It records the full pointer
trajectory per movement and computes 32 measures, reported as age-specific
z-scores against normative data from 229,017 online volunteers (LabintheWild).

All 32 definitions below are verbatim (lightly re-punctuated) from Table S1 of
the paper's Supplementary Methods (`gajos2020-supplementary-appendix-s1.docx`,
extracted to `gajos2020-supplementary-methods-extracted.txt`). The same list
appears as Appendix A of the 2023 TACCESS follow-up
(`pandey2023-hevelius-at-home-ataxia-telangiectasia-taccess.pdf`), which is the
most complete public description of the system. Definition count recovered:
32 of 32, with two caveats in "Definition status" below.

## Files in this directory

- `gajos2020-computer-mouse-ataxia-parkinsonism-authors-version.pdf` — main
  paper, authors' version (kgajos.seas.harvard.edu).
- `gajos2020-supplementary-appendix-s1.docx` — Supplementary Methods, the
  primary source: task design, preprocessing, Table S1 (feature definitions),
  Table S2 (per-feature z-scores by phenotype), S3, S4 (model weights).
  From PMC7028247 via Europe PMC; article license CC BY.
- `gajos2020-supplementary-methods-extracted.txt` — text extraction of the
  above with the formula images transcribed.
- `gajos2020-supp-fig-s1-movement-components.png`,
  `gajos2020-supp-fig-s2-submovement-thresholds.png` — figures S1/S2.
- `gajos2020-mds27915-fulltext-pmc.xml` — full text XML (Europe PMC).
- `pandey2023-hevelius-at-home-ataxia-telangiectasia-taccess.pdf` — TACCESS
  2023 (doi 10.1145/3581790): at-home unsupervised use with children with
  ataxia-telangiectasia; self-contained system description; per-feature
  test-retest reliability (its Table 3); updated BARS model (Appendix B).
- `lin2024-hevelius-report-assets.pdf`, `lin2024-hevelius-report-arxiv-2409.06088.pdf`
  — ASSETS 2024 "Hevelius Report" (doi 10.1145/3663548.3688490): Streamlit
  visualization of Hevelius output for clinicians; groups the 32 features into
  clinical concepts via factor analysis.
- `eklund2023-ankle-submovements-mouse-adult-ataxias-braincomms.pdf` — Brain
  Communications 2023 (doi 10.1093/braincomms/fcad064): Hevelius mouse use +
  wearable ankle submovements vs patient-reported function in adult ataxias.
- `burke2026-als-digital-remote-assessment-jmir.pdf` — JMIR Formative 2026
  (doi 10.2196/85142): longitudinal remote motor+speech assessment in ALS
  using Hevelius, from the same MGH lab.
- `gajos2012-pointing-performance-in-situ-chi.pdf` — CHI 2012 (doi
  10.1145/2208636.2208733): classifiers separating deliberate targeted mouse
  movements from other in-situ movement — directly relevant to extracting
  Hevelius-grade movements from gameplay rather than a dedicated task.
- `wobbrock2008-goal-crossing-submovements-taccess.pdf` — TACCESS 2008: the
  submovement-analysis lineage Hevelius cites for its decomposition.
- `neurobooth/hevelius_task.py` — from github.com/neurobooth/neurobooth-os
  (MGH Neurobooth platform): a PsychoPy re-implementation of the Hevelius
  task presentation. Task only; no feature extraction.

## System availability

- Papers and supplement: public (above).
- Source code of the web task and of the 32-feature extraction pipeline: not
  published. Searched GitHub (repo and code search: all "hevelius" repos are
  an unrelated astronomy project; kgajos's only public repo is unrelated),
  the Gajos lab site (kgajos.seas.harvard.edu — project page "Quantifying
  Motor Impairments" links papers only), and the Gupta lab (Laboratory for
  Deep Neurophenotyping, MGH — no code or hosted instance listed).
- Only public code artifact: the Neurobooth task re-implementation above.
- Hosted instance: none found. The normative study ran on LabintheWild.org;
  labinthewild.org/studies/mouse/ now redirects to a 404 and no mouse study
  is listed on the LabintheWild front page today.

## Prerequisite definitions (from the Supplementary Methods)

Preprocessing per movement, applied before any feature is computed:

1. Translate and rotate the trajectory so the movement starts at the origin
   and ends on the x-axis.
2. Resample at 100 Hz (10 ms intervals).
3. Smooth positions with a Kalman filter.
4. Speed = discrete derivative of smoothed 2D position, then a 7 Hz low-pass
   FIR filter (40 dB stopband attenuation, Kaiser window). Acceleration and
   jerk: repeat derivative + same filter.

Movement decomposition (fig S1): initiation time (target onset to first mouse
move event), execution time (first to last mouse move event), verification
time (inside the target, last move event to mouse down), click (mouse down to
mouse up). A pause is a break of >= 100 ms in the raw mouse move events.

Submovements (fig S2): a submovement starts when speed crosses 100 px/s
upward, counted only if speed subsequently reaches >= 500 px/s; it ends when
speed falls below 100 px/s. The main submovement is the one containing the
maximum speed.

Task axis: the straight line linking the cursor positions at the start and at
the end of the movement (not the line to the target center).

Task shape: blocks of 9 targets (first positions the cursor, 8 are scored);
target diameter and inter-target distance fixed within a block, varying
across blocks; index of difficulty ID = log2(D/W + 1) between 2.2 and 4.8.
"Variability" features are computed over the trials of one block, i.e. over
movements of identical nominal difficulty.

## Our trace, and the assumptions used in the mapping

Per finished game (PRODUCT.md "Raw input traces", IndexedDB `traces`):
`sampleT` (ms, relative), `sampleX`, `sampleY` (viewport px), one entry per
raw mousemove — the same raw stream Hevelius records, so pauses (gaps in raw
events) are observable identically; plus `events`: {t, kind:
'ldown'|'lup'|'rdown'|'layout', x, y, index}, where index is the board cell
hit and layout events snapshot the board rect and cell size, so any (x,y)
maps to a cell. Reveals and chords execute on mouseup; flags on contextmenu
(rdown; no rup is recorded).

Named assumptions:

- A1 (segmentation): a "movement" is the segment from the previous effective
  board click's mouseup (game start for the first) to the current effective
  click's mouseup. Hevelius trials start at target onset; a minesweeper
  "target" only becomes decidable after the player deduces it, at an
  unobservable time inside the segment. Segments containing thinking or
  wandering are not Hevelius-grade pointing movements; a filter for
  deliberate target-directed segments is required (the CHI 2012 paper is the
  template for exactly this). Affirmed as the deliberate design 2026-08-20:
  anchoring at the last click, agnostic to when the destination became
  available or was deduced, is what keeps every number a statement about
  the physical interaction layer rather than a guess at private intention —
  the full birth-time taxonomy (information birth / deduction / commitment /
  re-verification) and the computable refinements deferred for later are in
  reference/mouse-motion-metrics.md, "Goal birth time and segment
  anchoring".
- A2 (intent): the clicked cell is the intended target; target center = cell
  center and target region = cell rect via the layout events. False for
  mis-clicks (cf. wastedClicks) and approximate for chords. Hevelius targets
  are circles; ours are squares.
- A3 (difficulty normalization): Hevelius computes variability (CoV/SD)
  within a block of fixed D and W. Our movements mix distances continuously,
  so raw within-game CoV measures the board layout, not the player.
  Variability features require first residualizing each per-movement value
  against log2 d and log2 w (Hevelius's own baseline regression, see
  "Normalization" below), then taking CoV of residual-corrected values.
- A4 (decision-time contamination): any feature whose definition includes
  time not strictly inside cursor motion — movement time, verification time,
  pauses — absorbs minesweeper deduction time, which Hevelius's "as fast and
  accurate as possible" instruction excludes by design. Note (2026-08-20):
  the contamination is uneven across segments — a return to a goal deduced
  earlier (thinking prepaid during other work) is nearly pure transport,
  while a fresh-deduction segment is soaked; per-game means mix both. See
  the birth-time section of reference/mouse-motion-metrics.md.

Classification legend: direct = computable from the trace as defined;
A-n = computable under the named assumption(s); the pipeline (resample,
Kalman, FIR) is implementable from the published description and is assumed
throughout for kinematic quantities.

## The 32 features

1. **Movement time.** Complete movement time from target onset to the end of
   the successful click on the target.
   Ours: A1 + A4 — no target onset exists; segment start stands in for it,
   and deduction time is included.
2. **Movement time variability.** Coefficient of variation of movement times
   in a block of trials.
   Ours: A1 + A3 + A4.
3. **Execution time.** Time from the first to the last mouse movement
   (excluding any movement while the mouse button was pressed — see Click
   slip).
   Ours: A1. First/last mousemove within the segment; button-down intervals
   excluded via ldown/lup timestamps.
4. **Execution time without pauses.** Like execution time, but excludes
   pauses of 100 ms or longer.
   Ours: A1. Pause detection is identical (raw-event gaps).
5. **Execution time variability.** CoV of execution times in a block.
   Ours: A1 + A3.
6. **Execution time variability (without pauses).** CoV of execution times
   without pauses in a block.
   Ours: A1 + A3.
7. **Peak speed.** The maximum (smoothed) speed recorded during a movement.
   Ours: A1.
8. **Peak speed variability.** CoV of peak speeds in a block.
   Ours: A1 + A3 (peak speed scales strongly with distance).
9. **Peak acceleration.** The maximum (smoothed) acceleration during a
   movement.
   Ours: A1.
10. **Peak acceleration variability.** CoV of peak accelerations in a block.
    Ours: A1 + A3.
11. **Distance from target center at end of main submovement.** The 2D
    distance from the pointer location at the end of the main submovement to
    the target center.
    Ours: A1 + A2 (target center = clicked cell center).
12. **Fraction of remaining distance to the target center covered in main
    submovement.** The fraction of the remaining distance along the task axis
    covered during the main submovement; can exceed 1 on overshoot.
    Ours: A1 + A2.
13. **Maximum deviation from task axis.** The maximum distance of the pointer
    from the task axis during a movement.
    Ours: A1 (task axis needs only the cursor start/end points).
14. **Movement variability.** The standard deviation of the distance of the
    actual path from the task axis. [MacKenzie et al. 2001]
    Ours: A1.
15. **Movement error.** The average absolute distance of the pointer from the
    task axis — how far, grossly, the trajectory was from a straight line.
    Ours: A1.
16. **Movement offset.** The average signed distance of the pointer from the
    task axis; large magnitude means the path falls mostly on one side.
    Ours: A1.
17. **Task axis crossings.** The number of times the pointer crossed the task
    axis during the movement.
    Ours: A1.
18. **Target re-entries.** The number of times the pointer leaves the target
    and re-enters it before the start of the click.
    Ours: A1 + A2 (target region = clicked cell rect; adjacent cells are also
    plausible intended targets, so this is noisier than in Hevelius).
19. **Movement direction changes.** The number of times the movement
    component orthogonal to the task axis changes sign.
    Ours: A1.
20. **Orthogonal direction changes.** The number of times the movement
    component parallel to the task axis changes sign.
    Ours: A1.
21. **Main submovement.** The submovement with the highest peak speed.
    Ours: A1, plus the interpretation caveat below (the numeric value of this
    "measure" is not stated; see "Definition status").
22. **Verification time.** The interval between the end of movement inside a
    target and the beginning of the click (mouse button press).
    Ours: A1 + A2 + A4 — in minesweeper this window contains safety
    re-checking, i.e. cognition, not just visual verification.
23. **Verification time variability.** Standard deviation (not CoV) of
    verification times in a block.
    Ours: A1 + A2 + A3 + A4.
24. **Click duration.** The time between mouse button press and release
    during the correct click on the target.
    Ours: direct — ldown to lup on the same cell. Left clicks only: rdown has
    no recorded release, so flag clicks have no duration.
25. **Click duration variability.** Standard deviation of click durations in
    a block.
    Ours: direct per game (click duration is nearly task-independent; A3
    formally, negligibly).
26. **Click slip.** Distance between the points where the button was pressed
    and released during the click on the target.
    Ours: direct — 2D distance between ldown and lup coordinates. Left clicks
    only.
27. **Noise-to-force ratio.** The SD (over all trials in a block) of the
    distance from the target center at the end of the first submovement,
    divided by the mean of peak accelerations. [Walker et al. 1997]
    Ours: A1 + A2 + A3.
28. **Normalized jerk.** Dimensionless:
    normalized jerk = (ET)^3 / v_max^2 * integral of (da/dt)^2 dt,
    where da/dt is jerk, ET is execution time without pauses, v_max is peak
    speed. (TACCESS notes they chose peak over mean speed because it
    correlated less with the index of difficulty.)
    Ours: A1.
29. **Normalized jerk without pauses.** Like normalized jerk, but excludes
    parts of the movement where the pointer was paused >= 100 ms.
    Ours: A1.
30. **Fraction of the main submovement spent accelerating.** Time from
    submovement start to peak acceleration, divided by submovement duration.
    Ours: A1.
31. **Number of pauses.** Number of pauses of 100 ms or longer.
    Ours: A1 + A4 — in gameplay, pauses are dominated by thinking. Within
    filtered target-directed segments the motor meaning partially survives.
32. **Duration of the longest pause.** 0 ms if no pause occurred.
    Ours: A1 + A4, as above.

None of the 32 is strictly uncomputable from our trace; the honest gradient
is direct (24-26) -> cursor-only under segmentation (3-10, 13-17, 19-21,
28-30) -> target-dependent (11, 12, 18, 22, 23, 27) -> decision-time
contaminated (1, 2, 22, 23, 31, 32). What is NOT reproducible is the
z-scoring layer: the normative dataset (229k participants) is not public, so
Hevelius-comparable absolute z-scores are unobtainable. For within-person
longitudinal use we do not need it — the person is their own baseline.

## Definition status (n of 32, and two caveats)

Recovered: 32 of 32 entries of Table S1, verbatim, cross-checked against the
identical Appendix A of the TACCESS 2023 paper. Caveats:

1. "Main submovement" (feature 21) is defined only as a designation ("the
   submovement with the highest peak speed"), yet it appears as a numeric
   measure with weights in Table S4 and the TACCESS BARS model (weight
   0.0820) and in the TACCESS reliability table. The quantity actually
   computed (presumably its duration) is stated nowhere I found: checked the
   supplement, both TACCESS versions, and the Hevelius Report paper.
2. Table S4 additionally lists "Number of submovements" as a model input —
   a 33rd measure name with no definition entry in Table S1 (the count is
   implied by the submovement rules above).

## Normalization across devices, screens, ages, and sessions

Everything is in CSS pixels; there is no physical-unit (DPI/gain)
normalization. Robustness comes from the statistical layer instead:

- Task-property regression: per measure, per-block averages are Box-Cox
  transformed, then regressed on log2(distance) and log2(target size) (the
  TACCESS version adds a task-type term: reciprocal vs one-at-a-time). A
  test-taker's z-score is (observed − regression estimate) / SD of residuals
  for that age. This is what makes scores nominally independent of target
  size, distance, and screen — and it is the mechanism we would borrow for
  A3 (minesweeper movements have continuously varying d with fixed w).
- Age: separate regression per age year; z-scores smoothed across ages by
  locally weighted linear regression (lambda = 5). Age-specific z-scores are
  the paper's device for separating disease from development/aging. For our
  multi-year self-tracking, aging is signal, not confound: track raw
  (difficulty-normalized) values, not age-relative ones.
- Devices: TACCESS states participants' own computers (different mice, gain,
  pixel ratios) did not substantially affect the measures as long as a mouse
  was used. Our player-states mechanism can stamp device changes explicitly.
- Session structure and warmup: in-clinic, the first 2 blocks are practice
  and excluded from analysis; the first trial of each block only positions
  the cursor and is excluded. Within-session warmup is real and Hevelius
  handles it by exclusion — for our per-game series, early-session games can
  be tagged rather than dropped.
- Session length and aggregation: the task is 8 scored blocks of 9 targets,
  2-6 min in clinic. Z-scores are computed per block, then averaged. At home
  (TACCESS): single-session test-retest reliability was only moderate;
  median of 2 consecutive sessions -> good (ICC >= .75); median of 4 ->
  excellent for A-T (ICC >= .90). They recommend medians of >= 3 sessions in
  unsupervised settings and used no outlier removal at home (medians absorb
  outliers); the normative pipeline removed values > 5 x IQR(10-90) from the
  median.
- Day-to-day state: caregiver/participant reports of mood, fatigue, and
  sleep did not significantly explain session-to-session variability in
  estimated scores (TACCESS Table 4) — relevant to our states feature: the
  interesting variance may sit in the residual, not the self-report.
- Per-feature reliability (TACCESS Table 3): good ICC in both A-T and
  healthy children at 2-session aggregation for movement time, number of
  pauses, duration of longest pause, execution time, click duration, and
  normalized jerk. Poor ICC even at 4-session aggregation for movement
  offset, movement error, movement variability, peak acceleration
  variability, max deviation from task axis, and main submovement.

## Five most promising features for our longitudinal use

Criteria: test-retest reliability (TACCESS Table 3), immunity to the
decision-time confound (A4), computability from our trace with the fewest
assumptions, and demonstrated sensitivity (Table S2 z-scores; age curves in
fig S3).

1. Execution time (per movement, difficulty-normalized; feature 3, with 4).
   Good ICC; starts at the first mousemove so it excludes pre-movement
   deliberation; the purest "how long does the hand take" number available
   from gameplay.
2. Click duration (24). Good ICC, purely motor, computable directly, zero
   dependence on segmentation or targets; large effects in both ataxia and
   parkinsonism (Table S2).
3. Normalized jerk without pauses (29). Good ICC; the strongest separator in
   Table S2 (z 3.2-3.6 in ataxia, 1.4 in parkinsonism); cursor-only;
   designed to be minimally correlated with task difficulty, which suits our
   uncontrolled d.
4. Peak speed (7). Cursor-only, robust to segmentation edge noise, and the
   clearest documented aging signal (declines with age, fig S3) — the
   feature most aligned with multi-year tracking.
5. Click slip (26). Direct, purely motor, unaffected by every named
   assumption; elevated in ataxia; cheap to compute and to backfill over all
   stored traces.

Runner-up: number of pauses / longest pause (31, 32) — good ICC in Hevelius,
but in minesweeper pauses measure thinking (A4); only usable within strictly
filtered target-directed segments.

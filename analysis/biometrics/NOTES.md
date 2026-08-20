# Mouse-dynamics feature extraction — library survey and extractor

2026-08-20. Task: find an installable open-source mouse-dynamics
feature-extraction library and run it over gameplay traces.

## Survey result: no installable library exists

Everything findable on PyPI, npm, and GitHub was evaluated. Nothing is
both installable today and able to extract the classical mouse-dynamics
feature set from raw (t, x, y, button-event) streams. Per the task's
no-stub rule, the feature set is implemented directly in
`extract_features.py` (formulas and sources in its module docstring and
inline comments).

Evaluated and rejected:

- PyPI names `mouse-dynamics`, `mousedynamics`, `mouse_dynamics`,
  `mouse-biometrics`, `mousefeatures`, `cursor-dynamics`: 404 — no such
  packages. Same names on npm: not found.
- `behavioral-biometrics` (PyPI 0.1.1, 2025-01): template-placeholder
  upload — homepage is `github.com/yourusername/hash_generator`, no
  description. Junk.
- `squeak` 0.2.0 (PyPI, EoinTravers/Squeak) — the one real psychometric
  mouse-tracking package on PyPI (MAD, AUC, x-flips, sample entropy).
  Last release 2015-05; Python 2 only (`print` statement at main.py:804
  is a Python 3 syntax error). Not installable today.
- `silphe` 0.1.0 (PyPI, 2025) — installable, pure stdlib, quantifies
  visuomotor signatures (Fitts fit, tremor, tracking lag). Rejected for
  fit: its analysis API (`acquire_stats`, `hold_stats`, `lag_scan`,
  `session_signature`) consumes trials from its own calibration game,
  with known target positions and task labels (acquire/track/hold).
  It cannot consume a free-play (t, x, y, button) stream.
- `margitantal68/mouse_dynamics_balabit_chaoshen_dfl` (GitHub) — the
  repo behind "Intrusion Detection Using Mouse Dynamics" (39 features,
  Balabit/ChaoShen/DFL). Contains only precomputed feature CSVs plus
  classifier evaluation; the raw-stream extraction code is not in it.
- `anonymousscience/MouseDynamics` (GitHub, same research group) — the
  actual raw-to-features research code. Rejected: no packaging metadata
  (not pip-installable), no license file, hardcoded Balabit CSV column
  names and directory layout, and defects (two `histogram` definitions
  in features.py where the second silently shadows the first).
- `margitantal68/sapimouse`, `sapiagent`, `norbertFejer/AFE_Project`
  (SapiMouse/DFL group) — deep-learning pipelines; "features" are
  |dx|,|dy| blocks of 128 fed to a CNN, or learned embeddings. No
  interpretable feature extraction.
- `EnergizeStatistics/user-authentication-mouse-behavior`,
  `smartyrad/Wikimedia_Mouseclick_features` (GitHub) — the action-level
  features are right (speed, efficiency, curvature, angular velocity)
  but both are single Jupyter notebooks around Balabit CSVs, not
  installable libraries.
- `mousetrap` (R, Kieslich et al.) — the one mature, maintained library
  in the space; out of scope (R, not Python/JS), and aimed at two-choice
  psychometric paradigms (MAD/AUC toward response alternatives), not
  biometric feature vocabularies.
- `traja` 25.0.1, `tsfel`, `movingpandas` (PyPI) — maintained generic
  trajectory/time-series feature tools; no notion of button events,
  strokes, pause-and-click, or the Zheng curvature features. Using one
  would still mean writing all the mouse-dynamics logic by hand on top.
- GitHub searches for "mouse dynamics" / "mouse dynamics biometrics" in
  Python: everything else is unpackaged student or research code at
  0-27 stars, mostly classifier experiments on the same datasets.

Installed into `.venv`: numpy 2.5.2 only (`requirements.txt`), as the
numerical backbone of our own extractor. Python 3.14.4 venv at
`analysis/biometrics/.venv`, nothing system-wide.

## What extract_features.py extracts

Input: the game's traces export — a JSON array of per-game objects
`{endedAt, mode, outcome, startedAt, sampleT, sampleX, sampleY, events}`
(exactly what the "export traces" button in the game produces; the
synthetic generator writes the same shape).

Segmentation: samples split into strokes (movement bouts) at
inter-sample gaps >= 100 ms — event-driven sampling emits nothing while
the cursor is still (Gamboa & Fred 2004 strokes; the 100 ms bout gap
from reference/mouse-motion-metrics.md).

Per stroke:

- `sampleCount`, `startMs`, `durationMs`
- `pathLengthPx`, `chordLengthPx`, `straightness` = chord/path
  (Gamboa & Fred 2004)
- `directionRad` — overall travel bearing (Ahmed & Traore 2007)
- `speedPxPerMs` mean/std/max; `velocityXPxPerMs`, `velocityYPxPerMs`
  mean/std (Ahmed & Traore 2007; Zheng et al. CCS 2011)
- `accelerationPxPerMs2`, `jerkPxPerMs3` mean/std/max of magnitude
  (Zheng et al.; Gajos et al. 2020 Hevelius)
- `angularVelocityRadPerMs` mean/std/max of magnitude
  (Gamboa & Fred 2004)
- `curvatureAngleRad` — angle at B for consecutive triples (A,B,C);
  `curvatureDistance` — dist(A,C) / perpendicular distance of B from
  line AC, over non-collinear triples (Zheng et al. CCS 2011, sec 3.1)

A feature whose formula needs more points or displacement than a stroke
has is absent for that stroke, never defaulted.

Clicks (from the event stream):

- `clickDurationMs` — ldown-to-lup hold time (Hevelius; surveys)
- `pauseAndClickMs` — stillness between last movement sample and each
  press, left and right (Zheng et al. CCS 2011)
- counts: `leftClickCount`, `rightClickCount`, `unpairedLupCount`
  (press began off the cells — the recorder stores only on-cell downs),
  `unpairedLdownCount`

Session:

- `wallDurationMs`, `sampleCount`, `strokeCount`, `movementMs`,
  `totalPathPx`
- `silenceRatio` = 1 - movementMs/wallDurationMs (survey vocabulary,
  arXiv:2208.09061)
- `strokeAggregates` — mean/std over strokes of every per-stroke
  feature (of the per-stroke mean for distribution features), with `n`
  = strokes where the feature was defined

## How to run

    cd analysis/biometrics
    .venv/bin/python extract_features.py TRACES.json > features.json

TRACES.json is a traces export from the game (or
`synthetic-trace.json`). Output is a JSON array, one object per game.
Malformed input raises with the game index and defect named; nothing is
skipped or defaulted.

Regenerate the synthetic fixture (seeded, byte-reproducible):

    .venv/bin/python make_synthetic_trace.py

## Synthetic end-to-end run (2026-08-20)

`make_synthetic_trace.py` simulates 6 point-and-click movements
(quadratic-Bezier curved paths, minimum-jerk speed profile, 8-16 ms
sampling = 62.5-125 Hz, 0.3-1.2 s thinking pauses, 4 left clicks with
60-120 ms holds, 2 right clicks): 359 samples, 11 events, 10.6 s.

Extraction found exactly 6 strokes. Selected output:

- session: silenceRatio 0.610, movementMs 4138 of 10622, totalPathPx 1502
- clicks: 4 left + 2 right, clickDurationMs mean 87.9 std 19.8,
  pauseAndClickMs mean 138.5 (matches the simulated 40-160 ms settle)
- stroke aggregates (mean over 6 strokes): speed 0.405 px/ms,
  straightness 0.948 (paths bowed 8-25% as simulated), curvatureAngleRad
  2.59 (near pi = mostly straight sampling triples), curvatureDistance
  107.4, angularVelocity 0.050 rad/ms, jerk 0.0014 px/ms^3

Full output: `synthetic-features.json` (checked in alongside
`synthetic-trace.json`).

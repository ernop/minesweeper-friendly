# Motion stats

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/motion-stats.md](../implementation/motion-stats.md).

## Goal, placement, and cost isolation

Display trace-derived mouse-dynamics systems for the active or just-finished game in one collapsible section (`motion stats`) at the page foot (after all result sections, before backup and settings rows) without impacting play speed.

- **Closed by default (`panels.motionStats`):** toggles via its arrow opener (state persisted). While closed, **no motion calculation or drawing runs** (trace capture still runs so historical traces stay complete). Opening mid-game computes all samples taken so far in one worker job; opening after a game computes final whole-trace values and sample series on demand.
- **Live vs. final canonical identity:** while open during play, samples coalesce to `<= 4/s` in the reports worker (elapsed-only ticks advance duration-derived values from cached input stats; idle ready/finished boards run no timer). At finish, the exact same code runs once over the complete trace (`endedAt - startedAt`) and appends the Fitts curve and Spatial Bias heatmap, staying on screen until the next game's first sample. Display-only — stores no extra per-game scalars.
- **Unmeasurable values:** when a formula lacks required inputs (no strokes, no clicks, `< 5` segment points, zero wall time, or `NaN`), displays an en dash (`—`) with a `"not yet measurable"` tooltip — never a fabricated `0`.

## Layout and metric cards

- Left-aligned responsive grid (`230 px` cards) grouped under bold black-rule system headings.
- Each metric card shows name, current value, and a `230 × 130` sparkline over elapsed game seconds (y-axis min/max; flat series draws mid-chart labeled with its true value; unmeasurable spans leave gaps, never bridged).
- Every metric name and group heading carries a dotted-underline 1–2 sentence hover/focus explanation without shifting layout (group headings state shared rules/units once).

## Measurement systems

Seven live systems plus finished-game Spatial Bias (mousetrap trajectory geometry remains offline in `analysis/mousetrap/trace_measures.R` and is not shown in-page):

1. **DYNAMICS (behavioral biometrics over movement bouts split by `>= 100 ms` pauses; exact parity with `analysis/biometrics/extract_features.py`):** strokes, moving, silence share, path, moving speed (mean per-stroke speed, distinct from Game Data's whole-game `mouse speed`), peak speed, straightness (`chord / path`), jerk (`mean |da/dt|`), turn rate (`rad/ms`), left clicks, right clicks, hold duration, pause-and-click stillness. Path and speeds include merged co-timestamped observations ([Storage](storage-and-history.md#capture-provenance)); headings and turn rate use timestamped samples.
2. **PATH AND NO-ACTION EVENTS (descriptive observations, never claims of intent):** wander (total travel over straight-line inter-click sum; currently includes pre-first-click warmup), pauses / paused share / longest pause (`>= 250 ms` stops), turnarounds (`> 90°` reversals between `>= 8 px` legs), feints (`>= 300 ms` dwell over a cell left without clicking).
3. **CLICK TIMING (all left and right board presses, effective and no-op alike):** click gap (median), `cadence spread` (`IQR / median`, sharing its name and definition with [Measurement catalog](measurement-catalog.md)), fastest gap, peak rate (max presses in any rolling `1 s` window), burst share (`< 250 ms` gaps), on the move (presses with a cursor sample in the prior `100 ms`). Right presses measure physical button down (`2026-09-26` onward; earlier traces used context-menu events).
4. **MOVEMENT GEOMETRY (Hevelius features over inter-click segments with `>= 5` timestamped samples; `reference/hevelius/FEATURES.md`):** execution, exec no pauses, smoothed peak speed, peak accel, submovements, main sub, sub end dist, axis dev, movement error, axis crossings, norm jerk (without pauses), click slip, verification, re-entries. Runs strictly on timestamped samples (merged points have no distinct timestamp); block-variability CoV remains offline-only.
5. **QUEUED CLICKS:** clicks on a cell previously dwelt over (`>= 300 ms` without clicking) and returned to `>= 500 ms` after leaving — queued clicks, queued share, median queue wait, longest wait.
6. **PACE RECOVERY:** pace delta after surviving evaluator-tagged mistakes against the game's median accepted-action gap — mistakes measured, post-mistake gap ratio (`1.0` = no slowdown), recovery actions (consecutive gaps `> 1.5×` median).
7. **AIMED MOVEMENT (Fitts' law):** presses `>= 8 px` from prior press with an intervening cursor sample — movements, throughput (`mean ID / MT`, bits/s, with `ID = log2(distance / cellSize + 1)`). Finished games with `>= 8` movements add an ID-vs-movement-time scatter with Theil–Sen fit.
8. **SPATIAL BIAS (finished games only, `>= 8` timed pairs and `>= 2` visited regions):** Theil–Sen regression of inter-action gaps on pixel distance, plotting mean signed residuals across a `3 × 3` board-region heatmap (red = slower than distance predicts, green = faster, with per-region action counts).

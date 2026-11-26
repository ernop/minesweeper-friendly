# Mind-mapping, Coach Evaluation, Peak Trend, and Focused Practice Research (2026-11-25)

Empirical follow-up to [deep-performance-review-2026-11-25.md](deep-performance-review-2026-11-25.md),
built from the creator's live IndexedDB archive (`12,752` games through
2026-11-25 19:00 local time, including the first `23` Coach-mode games and
`450` recent traced Standard wins across Beginner, Intermediate, and Expert)
plus cognitive and motor skill-acquisition literature on concentrated
micro-skill training.

## 1. Weekly top-3 3BV/s peak trend

Metric: `average(fastest 3 Standard wins in that Monday-based week)` for every
week with at least 3 wins (`435` Expert wins across 14 qualifying weeks,
`1,841` Intermediate wins across 15 weeks, `2,014` Beginner wins across 13
weeks).

| Level | Early high-volume weeks | Peak weeks | Recent (`2026-11-23` wk) |
| --- | --- | --- | --- |
| Expert | Aug 17: `1.982` (`n=30`), Aug 24: `2.158` (`n=63`) | Oct 05: `2.249` (`n=100`), Oct 12: `2.214` (`n=15`), Oct 19: `2.206` (`n=50`) | `2.022` (`n=8`, max `2.177`) |
| Intermediate | Aug 17: `2.413` (`n=271`), Aug 24: `2.626` (`n=399`) | Oct 12: `2.699` (`n=97`, max `2.874`), Oct 19: `2.686` (`n=161`) | `2.525` (`n=103`, max `2.568`) |
| Beginner | Aug 17: `3.455` (`n=812`), Aug 24: `3.312` (`n=231`) | Sep 21: `3.663` (`n=173`), Oct 05: `3.659` (`n=312`), Oct 12: `3.636` (`n=143`, max `4.475`) | `3.278` (`n=155`, max `3.480`) |

Expert `>= 2.0 3BV/s` win share by month:

- August: `5.4%` (`5 / 93` wins)
- September: `8.7%` (`8 / 92` wins)
- October: `19.4%` (`40 / 206` wins)
- November (through Nov 25): `11.4%` (`5 / 44` wins)
- Lifetime total: `58` Expert wins `>= 2.0 3BV/s`, `27` wins `>= 2.1 3BV/s`.

Conclusion: the player's upper tail expanded from August to October
(fourfold rise in `>= 2.0` share, five consecutive weeks of `2.097–2.249`
weekly top-3 average from Oct 05 through Nov 02), while weekly medians stayed
nearly flat (`1.70–1.83`). Low-volume weeks (`n < 10`, such as Nov 09 `n=3`
and Nov 16 `n=8`) depress raw top-3 averages mechanically through order-statistic
sample size.

## 2. Evaluation of initial Coach-mode games (2026-11-25)

`23` games played on the first day of live testing (`13` `coach-no-waste`, `6`
`coach-scan-shield`, `2` `coach-early-bail`, `2` `coach-full`):

- `Coach: No-waste` produced a `109.29 s` win (`3BV 181`, `IOE 0.67`) and a
  `133.5 s` near-win (`IOE 0.72`) — already above the `0.61` Standard Expert
  IOE baseline.
- `Coach: Scan shield` produced two Expert wins (`98.8 s` and `124.6 s`, each
  with `2` shield saves and `2` wrong-flag warnings).
- `Coach: Early bail` logged only `1 / 47` fast bails, confirming the creator's
  critique that highlighting cells to click did not align with how the player
  reads and decides.

Forensic classification of all `132` no-op clicks across the `15`
`coach-no-waste` and `coach-full` games:

| Root cause | Count | Share |
| --- | --- | --- |
| Habit test-chord or miscount (clicked unsatisfied number) | 44 | 33.3% |
| Premature chord before placing its missing flag (`< 650 ms`) | 18 | 13.6% |
| Finished-number / blank recheck (no adjacent target clicked next) | 15 | 11.4% |
| **Subtotal: habit, checking, and sequencing** | **77** | **58.3%** |
| Button / cursor slip on flag or open cell (`17` right-on-open, `11` left-on-flag) | 28 | 21.2% |
| 1-cell-off physical miss (real adjacent target clicked within `450 ms`) | 17 | 12.9% |
| Double-tap / bounce (`< 220 ms`) | 10 | 7.6% |
| **Subtotal: physical precision and button slips** | **55** | **41.7%** |

Non-no-op waste in the same `15` games: `144` low-value flags (`112` 1-cell
flags + `32` unused flags), `177` 1-cell chords (`83` = `46.9%` on opening
rims), and `0 / 197` 1.5-clicks on short-range flag→chord pairs.

## 3. Cross-size technique and pattern speed map (`450` Standard wins)

Replayed `150` Beginner + `150` Intermediate + `150` Expert traced Standard
wins through the exact board state and proof tiers to measure per-technique
press-to-press gap, reaction time, hover dwell, fluency (`<= 240 ms`), and
slow-tail share (`>= 600 ms`).

Key finding confirming the creator's hypothesis: core sub-move latencies are
nearly invariant across Beginner, Intermediate, and Expert, so pooling traces
across all three board sizes multiplies statistical power for tracking learning
over days and sessions.

| Technique | Beg med (ms) | Int med (ms) | Exp med (ms) | Exp p90 (ms) | Exp `>= 600 ms` | Exp `n` |
| --- | --- | --- | --- | --- | --- | --- |
| `flag-overlap-chain` | — | 310 | 790 | 1232 | 66% | 35 |
| `reveal-guess-or-wb` | 372 | 372 | 572 | 2211 | 47% | 527 |
| `reveal-edge-1-2-1` | — | 652 | 492 | 952 | 47% | 45 |
| `flag-1-2-interior` | 367 | 363 | 489 | 1100 | 38% | 528 |
| `flag-edge-1-2-2-1` | 377 | 454 | 476 | 902 | 27% | 62 |
| `reveal-overlap-chain` | 325 | 430 | 449 | 1084 | 31% | 62 |
| `flag-edge-1-2-1` | 267 | 417 | 436 | 984 | 30% | 256 |
| `reveal-1-2-interior` | — | 434 | 412 | 642 | 12% | 328 |
| `reveal-1-2-wall` | 444 | 471 | 408 | 692 | 15% | 68 |
| `reveal-counting-noflag` | 363 | 412 | 401 | 1273 | 32% | 1319 |
| `reveal-1-1-wall` | 332 | 362 | 362 | 732 | 19% | 795 |
| `flag-1-2-wall` | 310 | 361 | 352 | 762 | 17% | 228 |
| `reveal-1-1-interior` | 333 | 363 | 345 | 872 | 22% | 1352 |
| `flag-counting-chain` | 292 | 317 | 331 | 832 | 21% | 324 |
| `flag-exhaustive-1` | 336 | 312 | 292 | 563 | 8% | 2238 |
| `reveal-counting-after-flag` | 284 | 292 | 291 | 662 | 13% | 530 |
| `flag-exhaustive-2` | 262 | 273 | 270 | 531 | 7% | 4251 |
| `flag-exhaustive-3` | 272 | 270 | 261 | 561 | 8% | 3770 |
| `chord-multi` | 254 | 272 | 257 | 451 | 5% | 7402 |
| `chord-single-rim` | 253 | 266 | 255 | 433 | 5% | 3672 |
| `chord-single-other` | 252 | 264 | 255 | 454 | 5% | 4692 |
| `flag-exhaustive-4` (all flags) | 232 | 263 | 252 | 552 | 8% | 2076 |
| `flag-exhaustive-5+` (all flags) | 267 | 277 | 250 | 563 | 8% | 603 |

Notable findings:

- **Sight-recognition gap even on straight-edge `1-2-1`:** starting a straight-edge
  `1-2-1` (`flag-edge-1-2-1`: `436 ms` med, `p90 984 ms`, `30% >= 600 ms`;
  `reveal-edge-1-2-1`: `492 ms`, `47% >= 600 ms`) is still ~170–230 ms slower
  than memorized counting moves (`255–270 ms`), showing that initial entry into
  the pattern is not yet automatic on Expert even when the follow-up flags feel
  fast.
- **Wall vs interior asymmetry:** `flag-1-2-interior` (`489 ms`, `p90 1100 ms`)
  is `137 ms` slower than `flag-1-2-wall` (`352 ms`).
- **No-flag hesitation tax:** `reveal-counting-noflag` (`401 ms`, `p90 1273 ms`,
  `32% >= 600 ms`) is `110 ms` slower than `reveal-counting-after-flag`
  (`291 ms`), quantifying the extra verification cost when skipping flags.
- **Button hover asymmetry:** right-click flags dwell `86–110 ms` on target
  (press-triggered), whereas left-click reveals and chords dwell `139–189 ms`
  (`+50–80 ms` longer on every left click due to mouseup activation and
  pre-release verification).

## 4. Exhaustive `4 / 5 / 6 / 7` completion audit

In `150` Expert wins (`1,679` exhaustive `4` instances and `360` exhaustive `5+`
instances):

- **Untouched (`fresh`) exhaustive `4` (`n=90`) and `5+` (`n=10`):** only
  `51.1%` (`fresh4`) and `50.0%` (`fresh5+`) are handled immediately (`<= 1`
  other click before flagging); `p90` clicks skipped before returning are `32`
  (`fresh4`) and `20` (`fresh5+`).
- **Partially-flagged (`partial`) exhaustive `4` (`n=1,306`) and `5+` (`n=295`)**
  — e.g. a `4` that already has `2` flags and `2` remaining covered squares:
  - First-flag latency (excluding rapid 2nd/3rd follow-up flags on the same
    number): `302 ms` median (`p90 652 ms`) on `partial4` and `312 ms` median
    (`p90 651 ms`) on `partial5+`, ~`70–80 ms` slower at `p90` than `exh-1-3`
    (`571 ms`).
  - `24.7%` of `partial4`s and `21.7%` of `partial5+`s are skipped (`p90` =
    `5–6` clicks skipped; overall `503 ms` median / `864 ms` `p75` visible time
    for `4`s, `554 ms` / `834 ms` for `5+`s).
  - In `118` abandoned frontier hovers (`~0.8` per Expert win), the cursor
    hovered `>= 220 ms` directly beside an unflagged exhaustive `4/5/6/7` and
    left without flagging it.

## 5. What mouse traces reveal about visual attention, decisions, and frustration

Across the `150` Expert wins, continuous cursor traces reveal cognitive events
invisible in click-only logs:

- **Abandoned frontier checks (`849` total = `5.66 / win`, `3.04 s / win`):**
  cursor dwells `>= 220 ms` within `1.6` cells of a live frontier, then moves
  `>= 2.5` cells away without clicking:
  - `51.9%` (`441`): no local deduction available (useful visual bail)
  - `14.3%` (`121`): missed counting-safe move under the cursor
  - `13.9%` (`118`): unflagged exhaustive `4/5/6/7` right under the cursor
  - `10.6%` (`90`): unflagged counting-proven mine under the cursor
  - `9.3%` (`79`): stumped by a locally solvable overlap pattern
- **Approach-and-abort reversals (`628` total = `4.19 / win`):** cursor travels
  `>= 45 px` toward one area then reverses `> 130°` for `>= 45 px` without
  clicking (mid-flight second-guessing).
- **Frustration / rhythm disruption:** `11.95` burst no-op episodes per win
  (`>= 2` no-ops within `1.0 s`), and the click immediately after a no-op slows
  by `+50 ms` (`312 ms` median vs `262 ms` normal).

## 6. No-Mark "sharpening" hypothesis test

Tested whether playing an intentional No-Mark block (`>= 3` no-mark wins OR
`>= 4` active no-mark minutes, excluding `< 5 s` early-loss restart streaks)
improves flagged Expert play within the next `90` minutes:

- `35` genuine No-Mark blocks found in the full archive; `24` were followed by
  flagged Expert play within `90` minutes.
- Pooled across all `24` blocks (almost all were `2`-minute Beginner bursts):
  median Expert 3BV/s was flat (`1.782` before vs `1.787` after), IOE flat
  (`0.614` vs `0.616`), no-ops flat (`42.5` vs `44.0`), late conversion lower
  (`30.5%` → `19.2%`), and `>= p90 (2.05)` share slightly higher (`7.5%` →
  `10.5%`, `4 / 38` wins). Only `2` of the top-15 all-time Expert 3BV/s wins
  followed genuine prior no-mark play.
- **Crucial subset nuance (`N = 2`):** only two blocks in the entire archive
  matched the creator's actual `15–20 min` Intermediate/Expert no-mark protocol:
  - `2026-10-11`: `19.3` active min Int/Exp no-mark → followed by `7` Expert
    wins (best `2.14 3BV/s`; `#10` all-time `2.191` also followed `5.2 m` prior
    no-mark).
  - `2026-10-14`: `14.2` active min Int/Exp no-mark → preceded by `0 / 4`,
    followed by `#7` all-time `2.216 3BV/s`.
- Verdict: currently unverified at `N = 2` for long Intermediate/Expert no-mark
  warmups. Testable directly via alternating tagged blocks (`no-mark warmup` vs
  none) scored by `training.html`'s existing paired-block experiment rule.

## 7. Skill-acquisition literature synthesis for concentrated sub-board drills

Online literature review supporting the creator's `100` mini-board focused
pattern drill → `100` Intermediate transfer-test design:

- **Blocked vs. interleaved practice (Contextual Interference — Shea & Morgan,
  1979; Battig, 1979):** blocked (concentrated) practice accelerates initial
  acquisition of a weak or un-automatized micro-skill and is effective for
  overwriting an entrenched motor habit; interleaved (mixed) practice drives
  durable long-term retention and whole-game transfer via **elaboration**
  (contrasting confusable patterns) and **action-plan reconstruction** (reloading
  the decision rule from scratch on every trial). For rare high-speed patterns,
  cognitive research prescribes a **blocked-to-interleaved progression**: short
  concentrated exposure until sight-recognition forms, then mixed drills with
  clutter and distractor lookalikes so the pattern triggers inside full boards.
- **Perceptual Learning Modules (PLMs — Philip Kellman):** short, high-frequency,
  speeded discrimination trials on varied instances (rotations, reflections,
  background clutter) build pre-attentive visual chunks (Chase & Simon; de
  Groot), shifting recognition from serial counting into fast parallel
  perception and freeing working memory for lookahead.
- **Adaptive Response-Time-Based Sequencing (ARTS — Mettler & Kellman):**
  retires mastered items only when *both* accuracy and response time pass a
  fluency threshold (e.g., `< 300 ms`), while dynamically re-spacing slower
  variants by RT rather than running a fixed static count.
- **Part-task → whole-task transfer:** small sub-boards transfer reliably to
  `16x16` and `30x16` play only when they preserve visual noise/clutter
  (surrounding numbers, partial flags, all 8 orientations) rather than showing
  sterile isolated patterns, and when transfer is verified by measuring
  *in-game latency on that exact pattern* across real games before and after
  (matching the creator's `100` mini-board → `100` Intermediate A/B design).

# Training toward an Expert win under 60 seconds

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/training.md](../implementation/training.md).
Supporting empirical studies: [reference/expert-speed-training-2026-09-26.md](../../reference/expert-speed-training-2026-09-26.md), [reference/skill-comparison-2026-09-26.md](../../reference/skill-comparison-2026-09-26.md), [reference/sub60-iteration-program-2026-11-25.md](../../reference/sub60-iteration-program-2026-11-25.md).

## Goal and principles

Turn recorded gameplay traces into a scientific, self-updating training system for breaking 60 seconds on Standard Expert (and progressing beyond): measure exact subskills against stronger players, surface the highest-cost bottlenecks automatically, drill targeted weaknesses with coaching modes and problems, and verify whether practice transfers into real Standard play through controlled experiments.

- **Core speed identity:** `time = inputs × seconds per input`, so `3BV/s = IOE / seconds per input`. Breaking 60 s requires both cutting removable inputs (clicks per 3BV) and shortening per-input thinking, cursor travel, and pauses.
- **Decisions vs measurements:** stage rules and numeric targets below are working decisions grounded in trace studies; they can be revised as measurements evolve.

## The training plan and stage targets

Rules from earlier stages stay active as you advance. A stage completes when every measure meets its target (the active stage is the first incomplete one); reaching the sub-60 goal does not wait for earlier stages.

### Every session routine

- `45–60 min` on most days (split longer volume across spaced sessions hours apart).
- `5 min` Intermediate warm-up under current stage rules, then `~10 min` Expert blocks with one focus rule per block.
- Open in a corner; if it shows a number, restart with `Space` instead of guessing.
- Keep mouse, sensitivity, and zoom fixed; tag any intentional change with a player state.
- Stop when a block is clearly worse than the session's best block, or after two avoidable deaths in a row past `20 s` (performance degrades before fatigue is felt).
- Review `training.html` at the end of each session.

### Cumulative stages

1. **Stop wasting inputs:** click a number only when all its mines are flagged and covered neighbors remain (never test-chord). Flag and chord only when the chord opens more squares than flags needed (`1` flag → `>= 2` cells, `2` → `>= 3`; flag on ties), else click safe squares directly; never place unused flags; prefer the highest-yield chord. Judge early sessions by `IOE`, `no-op rate`, and `unused flag share`.
2. **Finish started runs:** chord only over proven flags; scan the whole board before guessing; take truly forced guesses immediately; remove any noticed wrong flag before chording near it; drill `5 min/day` of Endgame drill.
3. **Read and move faster:** read ahead with the eyes rather than the cursor; move only toward already-solved cells while reading the next area; clear in consistent sweeps; replay the slowest win with the click-speed path view to identify long-pause patterns; use Intermediate blocks for volume.
4. **Win under 60 seconds:** keep all rules active and keep converting runs (a first sub-60 typically happens on `<= 150` 3BV once median wins near `70 s`, becoming routine at the Stage 3 target).

### Stage targets

| Stage | Measure | Target | Rationale |
| --- | --- | --- | --- |
| 1 | `IOE` (`3BV / inputs`, median of latest 20 wins) | `>= 0.91` | removing avoidable inputs reaches `~0.92` (`1.09` inputs/3BV) |
| 1 | `no-op clicks / win` (median of latest 20 wins) | `<= 5` | eliminates test-chord and finished-number clicks |
| 2 | `20 s+` runs won (latest 60 runs) | `>= 45%` | runs past the opening convert above the `~41%` start-of-game solver ceiling |
| 2 | avoidable losses after `20 s` (share of classified losses) | `<= 35%` | shifts late deaths from misreads to forced guesses |
| 2 | wrong flags / win (mean of latest replayed wins) | `<= 0.5` | reduces chord-death exposure |
| 3 | pauses `> 1 s` / win (median of latest replayed wins) | `<= 4` | cuts reading stalls |
| 3 | median `3BV/s` (latest 20 wins) | `>= 2.8` | `~62 s` median on an average `173`-3BV Expert board |
| 4 | wins under `60 s` | `>= 1` | primary milestone |

## Training page (`training.html`)

- **Access & behavior:** opens from `training` in the game footer; top header links directly to `index.html`, `problems.html`, `self-check.html`, and includes 1-click practice mode launchers (`Play Standard Expert`, `Coach: No-waste`, `Coach: Early bail`, `Coach: Scan shield`, `Coach: Full mix`, `Endgame drill`, and `Sub-board & mentation drills`); `Escape` returns to the game. Computes fresh off-thread on every load across three parallel workers (`training-worker.js`, `mind-map-worker.js`, `switch-cost-worker.js`), keeps `mind-map-worker.js` alive for on-demand full-board replay inspection, and persists player ground-truth mentation feedback in `userdata['mentationFeedback']`.
- **Inline plain-English definitions:** every technical or mentation term on the page (`3BV`, `3BV/s`, `IOE`, `no-op click`, `1.5-click`, `eyes-ahead lookahead`, `dry jump`, `counting-first fork`, `slow cursor reading`, `local drift`, `fluent chunk size`, `press-to-press`, `mid-flight detour`, `pre-press hover`, `button hold`, `pre-death flow breakdown`, `fresh` vs `queued`, `bail first`, `pointless endgame flag`) includes a visible inline plain-English definition where it appears on screen.
- **Scope:** Standard Expert with default generator (`30x16/99@standard`) for the main dashboard; cross-size sections explicitly label their pools. Sections with no eligible data stay hidden cleanly.

### Sections in page order

1. **Now:** summary cards for best Expert win (with 3BV and date), median win, median `3BV/s`, `IOE`, `seconds per input`, wins `< 60 s`, and current stage, each stating its sample.
2. **What stands out & ranked performance traits (`#training-traits`):**
   - Surfaces up to `6` threshold-triggered highlight cards only when clear signals fire (pointless endgame flagging, low eyes-ahead cross-board lookahead, slow solvable shapes tackled while counting moves waited elsewhere, cursor-led reading loops over open clues, pre-death flow breakdown before late losses, skipped ready `4/5/6/7`s, slow known patterns like straight-edge `1-2-1` or interior `1-2`, upper-tail `2.0+ 3BV/s` breakout, post-no-op rhythm slowdown).
   - Ranks all measured Expert traits by estimated seconds per win left on the table (`IOE`, slow cursor reading on open clues, eyes-ahead cross-board lookahead, slow solvable shapes past easy moves, abandoned frontier hovers, habit vs physical no-ops, counting-first area choice on forks, pointless flags in the final 5 safe squares, ready `4/5/6/7` skips, fresh no-flag counting hesitation, post-no-op slowdown), with visible inline definitions, vertically aligned digits/units, explicit counts, and a 1-click practice drill launcher on every row.
3. **Stages:** each target's current value, threshold, met status, and sample; active stage outlined.
4. **Technique & thinking mind-map (`#training-mind-map`):**
   - Pools up to `100` Beginner, `100` Intermediate, and `80` Expert traced Standard wins plus up to `60` late Expert losses (`>= 20 s`) via exact `GuardianAngel.proveLevels` proof tiers, per-square `deducible-since` information age, press-to-press (`ldown`/`rdown`) timing (eliminating mechanical button-hold bias), and bevel-calibrated pointer samples ([reference/mentation-model-2026-11-26.md](../../reference/mentation-model-2026-11-26.md)).
   - **How your mind moves through Expert games:** five-card mentation summary with visible inline definitions and practice launchers (**Eyes-ahead lookahead** on `>= 4`-square dry-area jumps + counting-first fork share, **Slow cursor reading on clues** + hover/drift/flight split and local `path/chord` drift ratio, **Fluent chunk size** + entry/follow-up press-to-press ms, **Mid-flight detours & pre-press hover** + left-button hold duration, and **Pre-death flow breakdown** across the final 5 moves before late Expert losses past `20 s`) plus a **What breaks your flow** chunk-breaker table (`s/win`).
   - **Monitored training modes & subgames for each identified skill:** maps all 8 identified skills (`No-ops & 1.5-click economy`, `Endgame direct finishing`, `Late-game survival & pre-death flow reset`, `Bail-first on slow shapes`, `Cluttered no-flag counting chunks`, `Ready 4/5/6/7 pop-out scan`, `Two-area eyes-ahead lookahead transition`, `Eyes-first anti-drift reading`) to live Expert trace values, target thresholds, monitored drill progress read from `Coach` history and `minesweeper-problems` IndexedDB, and 1-click drill launchers.
   - One-step size filter (`All sizes | Expert | Intermediate | Beginner`) — never triple-slash cells.
   - **Technique speed catalog (press-to-press):** inline classic Minesweeper visual mini-board for every technique (with `yours` / `shape` toggle showing captured `5×5` positions from the player's own wins when available), `count`, integer `fresh (ms)` (newly proved by the immediately prior click, local, no detour), integer `queued (ms)` (proved `1–3` clicks earlier, local, no detour), integer `all (ms)`, integer `90th (ms)`, whole-percent `slow (%)` (`>= 600 ms`), whole-percent `easy elsewhere (%)` (`>= 2` counting moves `>= 3` squares away), and `action` pill judging slow solvable shapes (`>= 450 ms` fresh when `n >= 5` else overall, with `>= 50%` easy moves elsewhere) as **`bail first`** (`low n` under 5 samples).
   - **Endgame pointless flagging:** separate Expert, Intermediate, and Beginner rows showing `%` of wins with unused or 1-square-only flags in the final 5 safe squares, flags/win, `s/win`, and `%` flagging when only `1` safe square remained.
   - **Single-game thinking trace:** selector over the latest `12` replayed Expert wins showing per-game eyes-ahead `%`, local drift ratio, detours, and chronological decision episodes with `5×5` local board snapshots and an **`Inspect on full board`** jump button on every episode.
5. **Mentation calibration scoreboard & game replay launcher (`#training-inspector`):**
   - **Model accuracy & ground-truth calibration scoreboard (`mentation-v2`):** summarizes all moves rated inside the main [Play Game Replay](replay.md) (`userdata['mentationFeedback']`) — reporting total moves reviewed, overall `Accurate %`, `Partly right %`, and `Wrong %`, per-claim-type breakdown table with top reported correction reasons, and 1-click **`Export feedback JSON`**, **`Copy feedback summary for chat`**, and **`Import feedback JSON`** controls.
   - **Game replay launcher:** lets the player open any recent traced Expert win, late Expert loss (`20 s+`), Intermediate win, or Beginner win directly on the main Play Game board in Replay mode (`index.html?replay=<endedAt>&step=0`) so there is only one replay surface in the app.
5. **Coaching drills & transfer to Standard (`#training-coach`):**
   - *Recommended next drill:* derived live from latest Standard Expert stats (`Coach: No-waste` if no-ops `> 10` or `IOE < 0.78`; `Coach: Scan shield` if avoidable late losses `> 50%`; `Coach: Early bail` otherwise).
   - *Practice drills played:* per Coach mode ([Play modes](play-modes.md)), games, wins, active minutes, and earlier-half vs latest-half trends (no-ops, 1-cell flags, 1.5-click share, fast-bail share, lookahead share, blind spots, shield saves, wrong-flag warnings).
   - *Slow overlap patterns (`>= 450 ms`):* aggregated across Coach games by pattern family (`1-2 interior`, `1-2 on wall`, `1-1 interior`, `1-1 on wall`, `overlap chain`).
   - *Transfer to Standard Expert:* anchored at first Coach game; compares up to `50` pre-coach Standard Expert wins (and runs from that start) against all post-coach games, plus coach-days vs non-coach-days over the recent window across `3BV/s`, win time, `IOE`, no-ops/win, flags/3BV, `flag→chord gap`, move gap, left hard work/win, `>= 20 s` conversion, and avoidable late loss share (explicitly requiring `>= 10` post-coach wins before judging transfer).
   - *Sampled state vs Standard Expert:* splits `stateSample` games by focus (`1/5`–`5/5`) and pace (`calm`, `flowing`, `rushed`, `tilted`).
6. **Where the time goes in your latest wins:** replays the latest `20` wins' traces to attribute mean time per input kind (`>= 2`-cell chord flags, 1-cell chord flags, unused flags, removed flags, wrong flags, no-ops) and reports the arithmetic win time without removable inputs' gaps (explicitly labeled arithmetic, not a prediction).
7. **Button switch cost:** pooled short-range switch-cost regression across flagged Standard games (details below).
8. **Openings:** tracks the corner-start rule over default-generator Expert games carrying `firstRevealIndex` (from `2026-09-27`): corner first-click share, corner-zero opening share, and win rates after openings vs un-restarted numbered starts. Other generators are named and excluded.
9. **The plan:** stage rules above with the active stage outlined (readable even with zero saved games).
10. **Week by week:** Monday-based local calendar weeks, newest first: games, wins, best, median win, median `3BV/s`, `top-3 3BV/s`, `IOE`, `seconds per input`, `20 s+ runs`, and `20 s+ won`.
11. **Experiments: player states compared:** evaluates alternating same-day blocks (`A B A B ...`, ~20 Expert games/block, condition `B` tagged with a player state) for every state tag used on Expert games:
    - Pairs consecutive same-day blocks in order (`1st` vs `2nd`, `3rd` vs `4th`) across days where the state was used.
    - Reports per-condition games, wins, median win time, `3BV/s`, `IOE`, `seconds per input`, flags/win, chords one flag short/game (excluding pre-`2026-09-26` combined no-op records), and `>= 20 s` win rate.
    - Reports mean paired difference in median win time (`with − without`) with 95% Student `t` interval (from `>= 3` pairs with wins on both sides).
    - **Fixed-size pre-registered decision rule:** decided once on the first `4` block pairs with wins on both sides — `B` wins if its median win time is lower in `>= 3` of `4` pairs AND `>= 20 s` conversion is at least as high across all `8` blocks. Later pairs update the descriptive interval without overturning the fixed-size decision.

### Button switch cost

Pooled regression quantifying the hand-switching penalty between flagging and chording at short distances ([reference/mode-switch-2026-09-28.md](../../reference/mode-switch-2026-09-28.md)):

- **Scope:** judged Standard games on Beginner, Intermediate, and Expert with `flagsPlaced > 0 && !flagsBlocked` (excluding no-mark and flag-blocked games).
- **Transitions:** consecutive moves that are both `flag` or `chord` within Chebyshev distance `<= 2`, timed press-to-press between `40 ms` and `5 s` (reveals and long jumps excluded).
- **Pools:** latest `500` and earlier `500` qualifying flagged Standard games with saved traces and `>= 1` short-range pair (minimum `30` games to fit a pool).
- **Display:** leads with **extra time per switch (ms)** and its 95% CI, followed by `%` change (+ 95% CI), median switched gap, switch share, mean short-range switch time per Beginner/Intermediate/Expert flagged game, game/pair counts, and a plain-English two-sample 95% CI verdict comparing latest `500` vs earlier `500`.

### Core definitions

- **Inputs:** `boardChangingClicks + noOpClicks`. `3BV/s` and `IOE` (`3BV / inputs`) read directly from `GameData.metrics` ([Measurement catalog](measurement-catalog.md)). Records pre-dating `noOpClicks` (`2026-08-19`) are excluded from input medians.
- **Seconds per input:** win time divided by inputs.
- **Run:** a game lasting `>= 20 s`. Conversion is wins among the latest `60` runs.
- **Avoidable loss:** fatal status `mine-safe` or `guess-safe` (legacy and unclassified losses excluded from denominator, sample size disclosed).
- **Removable inputs:** every no-op click, every removed flag + its removal, every unused flag, and every flag used only by 1-cell chords.
- **Pauses:** gaps `> 1 s` before an input.
- **Wrong flags:** flags on safe cells in the replayed layout (post-game truth, never shown during play).
- **Coverage:** wins lacking a trace, rebuildable board, or consistent replay (e.g., Guardian Angel redraw on a seed-rebuilt board) are counted and named, never estimated.

## Companion drills and planned extensions

- **Timed drills:** [Minesweeper problems](problems.md) provides real-game pattern problems (`problems.html`), the 10-position **Last-flag drill** (1.5-click practice), and the 24-square **Pointing test** (separating pure hand travel from decision hesitation).
- **Planned unbuilt training work:** tracked in [BACKLOG.md](../../BACKLOG.md#training-coaching-and-mind-map) (automatic multi-clue shape mining and decision-order refinement, concentrated sub-board pattern drills with Intermediate transfer testing, and a controlled No-Mark sharpening block experiment).

# Deep performance review and coaching-mode design (2026-11-25)

Follow-up to [expert-speed-training-2026-09-26.md](expert-speed-training-2026-09-26.md)
and [skill-comparison-2026-09-26.md](skill-comparison-2026-09-26.md), prompted
by the creator's 2026-11-25 request to back-review the full saved game history,
identify what drives fast versus slow days and games, compare against elite
pro play, and design modified training variants with live coaching detectors.

Epistemic labels: [measured] = computed directly from saved game records,
traces, play spans, or published saolei.wang replay files; [documented] =
primary source; [community claim] = experienced players' advice without
published replay data.

## 1. Dataset and 3-month trajectory (2026-08-19 to 2026-11-25)

Source: the live browser IndexedDB of `https://minesweeper-friendly.fuseki.net/`
(read-only, cross-checked with 0 mismatches against the 11,588-record
2026-11-04 export): 12,718 finished game records (4,658 Standard Expert, 435
wins; 4,526 Standard Intermediate, 1,837 wins; 3,153 Standard Beginner, 2,012
wins), 2,929 play spans (since 2026-10-12), 229 traced Expert wins, and 111
traced recent late Expert losses (>= 20 s, since 2026-10-15). Comparison
corpus: 329 reviewed Expert replays from `~/Documents/minesweeper-corpus/saolei/`
across five 3BV/s bands (`1.6–2.0`, `2.4–2.8`, `3.0–3.5`, `3.8–4.4`, and `4.5+`
up to 5.99 3BV/s, 69 games across 14 players in `4.5+`), analyzed with identical
proof-engine code (`guardian-angel.js`, `training-core.js`). [measured]

**Three-month plateau (Standard Expert, 4,658 games, 435 wins):** [measured]

| Month | Games | Wins | Late conv (>=20s) | Best | Med win | Med 3BV/s | IOE | No-ops/win | Flags/3BV | Unflagged% |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-08 | 1,012 | 93 | 25.1% | 80.90 s | 101.30 s | 1.699 | 0.60 | 43.0 | 0.58 | 1.0% |
| 2026-09 | 922 | 92 | 26.1% | 71.03 s | 98.39 s | 1.768 | 0.63 | 38.0 | 0.58 | 1.0% |
| 2026-10 | 2,146 | 206 | 24.7% | 75.67 s | 97.13 s | 1.803 | 0.62 | 40.0 | 0.57 | 1.0% |
| 2026-11 | 578 | 44 | 20.8% | 79.45 s | 101.99 s | 1.705 | 0.61 | 41.0 | 0.60 | 1.0% |

Intermediate (`1.82 -> 1.86 -> 1.85 -> 1.80` 3BV/s, IOE `0.58–0.60`) and
Beginner (`1.82 -> 1.92 -> 1.87 -> 1.89` 3BV/s, IOE `0.57–0.61`) show the same
flat profile. Underlying habits did not shift after the 2026-09-26 plan:

- Unflagged mine share stayed at 1.0% on Expert (flagging ~99% of mines).
- No-op clicks stayed at 39–41 per Expert win (`24.2` chords on numbers short of
  flags, `7.8` on finished numbers, `3.7` right-clicks on open cells).
- The 1.5-click / both-button chord (`chordGesture`) appeared in only 9 of 100
  recent traced Expert wins (19 gestures total).
- Play spans since 2026-10-20 show 948 finished Expert boards against 27
  restarted boards (median restart duration 49.2 s), confirming numbered starts
  are rarely restarted immediately; ~55% of Expert games end in losses under 10 s.
- The separate problems page saw 65 problem attempts, 1 pointing run, and 7
  last-flag drill attempts total (all from late September). Passive post-game
  stats and out-of-game drills did not alter live-play autopilot.

## 2. Fast days versus slow days, and fast games versus slow games

**Variance decomposition (wins with full board metrics):** [measured]

- Board traits (3BV, HZiNi, zero-opening coverage, 0–1 share, 3BV spread,
  islands) explain `R^2 = 0.237` of Expert 3BV/s (`0.326` Intermediate, `0.442`
  Beginner).
- Higher zero-opening coverage lowers the player's 3BV/s (`rho = -0.39` Expert,
  `-0.60` Intermediate, `-0.62` Beginner), while higher 3BV raises it
  (`+0.40` Expert, `+0.59` Intermediate). Replay shows 72% of the player's
  flags and 45% of 1-cell chords sit on the rim of zero-openings, spending two
  clicks on rim numbers that count as 0 additional 3BV.
- Between-day intraclass correlation (ICC) of board-adjusted 3BV/s across days
  with >= 3 wins is `0.111` on Expert (26 days, 281 wins), `0.150` on
  Intermediate (41 days, 901 wins), and `0.022` on Beginner. Day-to-day state is
  real (~12.3 s/win between fastest and slowest quartiles of Expert days, 1.865
  vs 1.613 3BV/s), while ~85–89% of board-adjusted variance is within-day.

**What moves on fast days (Expert, 27 days since 2026-09-15, >= 3 wins/day):** [measured]

- Fast days are simultaneously faster and cleaner: inputs/s rises (`2.69 -> 3.02`,
  `rho = +0.753`), fastclick gap (planned pairs) shortens (`214 -> 207 ms`,
  `rho = -0.531`), median jump gap (`moveGapMedianMs`) drops (`692 -> 598 ms`,
  `rho = -0.465`), mouse speed rises (`227 -> 249 px/s`, `rho = +0.451`), IOE
  rises (`0.606 -> 0.626`, `rho = +0.341`), late conversion rises (`23.0% ->
  25.1%`, `rho = +0.345`), and misclicks drop (`3.01 -> 2.66`).
- No-op clicks per win do not move with day form (`rho = +0.042`).

**Within-player fast versus slow games (board-adjusted top 40 vs bottom 40 of
217 clean active traced Expert wins, excluding 12 wins with window-left/AFK
gaps >= 10 s):** [measured]

- Total active time: `85.2 s` (2.05 3BV/s) vs `118.9 s` (1.52 3BV/s), a 33.7 s
  gap.
- Time spent in normal clicks (`< 600 ms` gaps): virtually identical (`60.1 s`
  vs `60.3 s`).
- **The entire 33.5 s gap lives in stalls >= 600 ms:** `25.1 s` vs `58.6 s`
  (`600–1000 ms`: `17.0` vs `23.6 s`; `1–2 s`: `6.9` vs `18.0 s`; `>= 2 s`:
  `1.2` vs `17.1 s`). Direct no-op time also differs (`10.1` vs `15.7 s`).

## 3. Session timing, warm-up, fatigue, time of day, and post-loss dynamics

Sessions defined by 30-minute gaps (235 sessions across 75 play-days); within-
session deltas center each win on its own session mean (sessions with >= 3 wins)
to avoid survivor bias. [measured]

- **Warm-up and 90-minute fatigue:**
  - Expert within-session 3BV/s peaks at 45–90 min (`+0.056 3BV/s`, 95% CI
    `[+0.013, +0.093]`, n = 108; fastclick gap drops from `212 ms` at 0–5 min to
    `202 ms` at 45–60 min), then degrades past 90 min (`-0.020`, n = 113; late
    conversion falls from `25–28.5%` to `22.4%`, fastclick slows back to `212 ms`).
  - Intermediate follows the identical shape: cold at 0–10 min (`-0.030 3BV/s`,
    95% CI `[-0.061, -0.0001]`, conv `60.9%`), peaking at 45–90 min (`+0.027`,
    conv `68.2%`), dropping at 90+ min (`-0.005`, conv `62.4%`).
  - 1,355 of 4,658 Expert games (29%) occur past 90 min into a session.
  - Cold-start Expert games #1–3 convert at `20.0%` (`1.718` 3BV/s) versus
    `28.0%` (`1.826`) from Expert #4 onward; 5+ prior Beg/Int games lift Expert
    #1–3 to `22.7%` (`1.752`).
- **Time of day (local time):**
  - 04:00–09:00: slower hands (`1.698` 3BV/s, fastclick `212 ms`) but highest
    Expert conversion (`29.4%`).
  - 18:00–21:00: best combined window (`1.809` 3BV/s, fastclick `202 ms`, conv
    `27.1%`).
  - 21:00–24:00: fast wins (`1.864`) but Expert conversion collapses to `15.7%`
    (14/217, WR `6.5%`).
- **Post-loss restart rhythm (consecutive Expert games within 3 min):**
  - After a win: median pause before next board `15.8 s` -> next game `1.820`
    3BV/s, `27.2%` conv.
  - After a mid-game loss (15–40 s): instant restart (`1.5 s`) -> next-game
    conversion drops to `20.2%`.
  - After a late loss (>= 40 s): restart in `2.0 s` -> conversion holds (`28.1%`)
    but pace slows (`1.721` 3BV/s).
- **Square size (`cellPx` in 229 traced Expert wins):** `28 px` (n = 5): `1.624`
  3BV/s; `32 px` (n = 91): `1.722`; `36 px` (n = 107): `1.808`; `40 px`
  (n = 26): `1.826` (misclicks `3.54` vs `2.78–2.84` at `32–36 px`). At 36–40 px
  an Expert board spans ~1,080–1,200 px wide (vs 480 px at 16 px), a trade-off
  between target size / visual clarity and peripheral scan span that warrants a
  controlled A/B block test.

## 4. Style-neutral click-by-click audit versus elite pro replays (up to 5.99 3BV/s)

Local work is defined style-neutrally using **safe moves and ready chords only**
(excluding unflagged mines, which low-flag pros leave behind by design). All
groups use the same proof engine (`GuardianAngel.proveFacts`) and kinematics
split; Ernest's reaction times were also quantized to 10 ms to match Arbiter's
clock. [measured]

| Measure (Expert wins, AFK excluded) | Player (recent, n=92) | Pro 1.6–2.0 (n=60) | Pro 2.4–2.8 (n=60) | Pro 3.0–3.5 (n=60) | Pro 3.8–4.4 (n=80) | Pro 4.5+ (n=69) |
| --- | --- | --- | --- | --- | --- | --- |
| Median 3BV/s / mean active time | 1.76 / 99.0 s | 1.98 / 83.0 s | 2.77 / 62.3 s | 3.46 / 46.3 s | 4.17 / 48.4 s | 4.78 / 39.7 s |
| Effective clicks / 3BV | 1.40 | 1.21 | 1.18 | 1.11 | 0.96 | 0.92 |
| Flags / 3BV (low-value flags / 3BV) | 0.59 (0.18) | 0.36 (0.08) | 0.13 (0.01) | 0.18 (0.01) | 0.19 (0.01) | 0.19 (0.01) |
| 1-cell chords / 3BV | 0.32 | 0.08 | 0.01 | 0.02 | 0.02 | 0.02 |
| Active time in gaps >= 600 ms | 38.3 s | 36.4 s | 17.5 s | 8.8 s | 8.2 s | 4.7 s |
| Pure direct no-op click time | 12.8 s | — | — | — | — | — |
| Queued lookahead (10ms-quant `react <= 30ms`) | 17.8% | 30.5% | 45.6% | 54.2% | 54.8% | 63.4% |
| Queued lookahead (`react <= 50ms`) | 38.7% | 51.1% | 70.0% | 78.1% | 78.8% | 85.7% |
| Queued median reaction / hover (ms) | 68 / 108 | 50 / 130 | 40 / 100 | 30 / 80 | 30 / 70 | 30 / 60 |
| `flag -> chord` median (ms) | 265 | 270 | 210 | 130 | 110 | 100 |
| `reveal -> reveal` median (ms) | 290 | 300 | 210 | 180 | 170 | 160 |
| Post-opening (>=15 cells) reaction (ms) | 502 | 615 | 540 | 440 | 440 | 370 |
| Jump >= 5 cells median (ms) | 862 | 940 | 740 | 560 | 530 | 370 |
| Endgame (last 15% 3BV) 3BV/s / >=600ms share | 1.23 / 54.7% | 1.77 / 51.7% | 2.41 / 36.7% | 3.02 / 24.4% | 3.80 / 16.7% | 4.16 / 12.9% |
| Cursor path / 3BV (cells) | 3.95 | 3.37 | 3.25 | 3.19 | 2.77 | 2.76 |

**Four primary findings:**

1. **Flag-and-test-chord tax (~25–30 s/win).** The player uses 1.63 total inputs
   per 3BV (1.40 effective + 0.23 no-op) against 0.92 effective for `4.5+` pros.
   Low-value flags (`0.18/3BV`) and 1-cell chords (`0.32/3BV`) are 16–18x higher
   than every pro tier from `2.4+` up (`0.01–0.02/3BV`). `flag -> chord` stays
   at 265 ms without the 1.5-click (vs 100 ms in `4.5+`). Pure no-op clicks cost
   12.8 s directly and trigger 9.5 s of broken-rhythm >= 600 ms stalls during
   easy local work.
2. **Lookahead deficit (cursor-locked reading).** Even on *queued* targets
   already proven before the preceding click, the player starts moving within
   <= 30 ms on only `17.8%` of moves (`38.7%` <= 50 ms) versus `63.4%` (`85.7%`)
   for `4.5+` pros, and hovers `108 ms` on arrival before clicking (vs `60 ms`).
   Elite pros decouple eyes from hand, scanning 2–3 moves ahead so travel begins
   as the prior click lands.
3. **Stall-tail anatomy (`38.3 s/win` in active gaps >= 600 ms vs `4.7 s` in `4.5+`):**
   - Easy counting move right beside cursor (`EasyLoc`): `14.8 s/win` (~9.5 s
     with a no-op click breaking rhythm; ~8.9 s pure visual misses across all
     easy-local moments without no-ops).
   - Two-number overlap patterns (`HrdGrnd` 3.4 s + `HrdJump` 2.3 s + `2NumOth`
     2.3 s = `8.0 s/win`). Slowest fresh families in recent wins: `1-2 mine`
     interior (`815 ms` median, 92.6% >= 600 ms vs `500 ms` in `4.5+`),
     `overlap-chain` (`835 ms`, 73.7% >= 600 ms vs `475 ms`), and `1-1 safe`
     interior (`644 ms`, 58.4% >= 600 ms vs `430 ms`).
   - Local-dry relocations (`State C`): `7.6 s/win` (`19.5` dry jumps/win at
     `676 ms` mean vs `8.7/win` at `400 ms` in `4.5+`). Heavy flagging and
     corner-scrubbing create twice as many dead ends.
   - Guess hesitation (`3.2 s`), post-opening reads (`3.1 s`), deep search (`1.0 s`).
4. **Testing the early-bail hypothesis (State B: local 2-number only, while easy
   counting work exists elsewhere):**
   - The player enters State B `13.2` times/win (vs `5.0` for `4.5+` pros) and
     jumps away only `25.2%` of the time (vs `36–45%` across all pro bands).
   - Comparing 3-click tempo (`t[i+2] - t[i-1]`) in the player's own recent wins:
     - **Immediate jump (`< 500 ms`): `1,062 ms`** (fastest!)
     - Stay and solve locally: `1,198 ms`
     - **Linger `>= 500 ms`, then jump: `1,666 ms`** (worst — pays both stare
       and travel!)
   - Same ordering holds in `Pro_4.5+` (`680 ms` fast jump vs `700 ms` stay vs
     `1,150 ms` slow jump). Conclusion: solve memorized 2-number patterns in
     place only if recognized immediately (`< 400 ms`); if not, bail at once
     before staring.
   - Notably, `4.5+` pros leave easy single cells behind more often (`16.5/game`,
     `10.4%`) and pick them up on a return pass (`4.8` backtracks/game) while
     still maintaining 30% shorter cursor path/3BV (`2.76` vs `3.95`) and higher
     forward-sweep continuity (`41–44%` vs `36.8%`).

## 5. Recent late Expert losses (111 traced runs >= 20 s, 2026-10-15 to 2026-11-25)

In total, 424 late Expert losses since 2026-10-15 consumed 7.14 hours. Replay of
the 111 traced late losses shows: [measured]

- **109 of 111 (98.2%) were avoidable or suboptimal; only 2 (1.8%) were forced
  best guesses:**
  - `33 (29.7%)`: opened a proven mine
  - `23 (20.7%)`: chorded over a wrong flag
  - `23 (20.7%)`: guessed while an easy counting-safe move existed **elsewhere**
    on the board (tunnel vision)
  - `19 (17.1%)`: took a worse guess than available (no safe move)
  - `7 (6.3%)`: guessed while a 2-number/hard safe move existed
  - `4 (3.6%)`: guessed while an easy counting-safe move sat locally (`<= 3` cells)
- **Speed-triggered error chains:** `52 of 111 (46.8%)` fatal clicks occurred
  `< 500 ms` after the previous board-changing click (`10` under 250 ms, `42` in
  250–500 ms); `33` within 1 s of a flag, `24` within 1 s of a no-op click, and
  `20` within 1 s of a wrong flag.

## 6. Live coaching detectors / modified practice variants (proposed, unbuilt)

Recorded in [BACKLOG.md](../BACKLOG.md) under "Live coaching modes and in-game
detectors". Because passive post-game stats and separate drill pages did not
change live autopilot across 2,700+ subsequent Expert games, the proposed design
adds unranked practice variants that run regular boards with one focused live
coach detector at a time (worker-isolated, never blocking input):

1. **No-Waste Coach:** immediate subtle cue on test-chords / finished-number
   no-ops, amber ring on 1-cell-only flags and opening-rim 1-cell chords, an
   optional per-board flag budget (e.g., 45 -> 30 on Expert, or pure NF
   Intermediate blocks), and a live `% 1.5-clicked` meter on `flag -> chord`
   pairs.
2. **Early-Bail & Lookahead Coach:** in State B (no local easy move, easy safe
   move elsewhere), emit a gentle cue / highlight at `450 ms` to train the
   `< 450 ms` bailout reflex instead of `800–1500 ms` staring; track live queued
   lookahead (`react <= 50 ms`) and easy-local blind-spot stalls (`> 500 ms` with
   an adjacent counting-safe square).
3. **Scan-Before-Guess & Wrong-Flag Brake (Practice Shield):** catch unproven
   clicks when an easy safe move exists elsewhere (flashing the missed safe
   square instead of ending the practice run) and warn on provably contradictory
   flags before a `< 500 ms` chain chord kills the run.
4. **Weak-Pattern Auto-Bookmark:** automatically capture in-game `1-2` interior,
   `1-1` interior, and `overlap-chain` positions where the player hesitated
   `> 450 ms` into a short post-session flashcard replay (rotated/mirrored).
5. **Opening & Session Guardrails:** subtle `Space = new board` cue on numbered
   corner starts, a 3-second cooldown prompt after `> 15 s` losses, and a
   60–75 minute session cap well before the 90-minute fatigue cliff.

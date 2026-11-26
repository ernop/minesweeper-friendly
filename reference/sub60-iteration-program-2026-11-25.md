# Long-Term Sub-60 Research, Development, Practice & Iteration Program (2026-11-25)

Working hypothesis log and current research/experiment catalog serving the
three enduring product goals in [PRODUCT.md](../PRODUCT.md):
1. Build the world's best play-mode Minesweeper for players.
2. Integrate intelligence and invent/discover ever-better self-training methods,
   empirically tested against real play.
3. Let ordinary play naturally rise into fun record-keeping, lucid stats, and
   deep self-understanding.

Everything below represents current measurements and candidate experiments —
not fixed commitments. New research, trace findings, or better ideas replace
earlier methods whenever evidence favors them.

Supporting empirical reports:
- [deep-performance-review-2026-11-25.md](deep-performance-review-2026-11-25.md)
  (full history audit, pro comparison up to 5.99 3BV/s, warm-up/fatigue, late
  losses, coaching mode design)
- [mind-map-and-coach-eval-2026-11-25.md](mind-map-and-coach-eval-2026-11-25.md)
  (weekly top-3 peaks, Coach mode evaluation, cross-size technique timings,
  exhaustive 4/5/6/7 audit, pointer checks, No-Mark test, skill-acquisition
  literature)

---

## 1. North Star & Verified Baseline (2026-11-25)

- **Target:** break sub-60 s on Standard Expert (`3BV/s >= 2.8`, `IOE >= 0.91`,
  no-ops `<= 5/win`, late conversion `>= 45%`, avoidable late losses `<= 35%`)
  by modeling how Ernest actually reads and decides, training weak micro-skills
  with verified transfer, and cutting wasted inputs and slow-shape stalls.
- **Measured baseline (`12,752` games, `435` Expert wins, `450` traced Beg/Int/Exp
  wins, `329` pro replays up to `5.99 3BV/s`):**
  - Expert median: `~1.76–1.80 3BV/s` (`~98 s`); upper tail expanded in Sep–Oct
    (`>= 2.0 3BV/s` share `5.4% -> 19.4%`, `58` wins `>= 2.0`, `27` `>= 2.1`).
  - **Input economy & waste:** `IOE 0.61–0.62`, `~39–41` no-ops/win (`~58–70%`
    habit test-chords/rechecks vs `~30–42%` physical 1-cell/button slips;
    `+50 ms` drag on the next click), `0.18` low-value flags/3BV, `0.32`
    1-cell chords/3BV (`45–47%` on opening rims), `0%` 1.5-click adoption.
  - **Endgame pointless flagging:** `92%` of Expert wins (`74%` Int, `63%` Beg)
    place unused or 1-square-only flags in the final `5` safe squares (`1.3 s/win`);
    `54%` of Expert wins place a flag when only `1` safe square remains.
  - **Slow solvable shapes tackled past easy moves:** `4.7 s/win` above `300 ms`
    spent on overlap/coupled shapes while `>= 2` counting moves sit open
    elsewhere (e.g. `overlap-chain-reveal 776 ms`, `allNumbers 664 ms`,
    `1-3-1 corner 588 ms`, `edge 1-2-2-1 504 ms`, `edge 1-2-1 472 ms`,
    `interior 1-2 flag 453 ms`).
  - **Exhaustive `4/5/6/7` skips:** `27–32%` skipped past the next click
    (`~50%` on untouched `4/5+`, `22–25%` on partially-flagged `4/5+`), plus
    cursor walk-aways right beside unflagged ready `4/5/6/7`s.
  - **Visual attention, lookahead & motor dwell:** `4.8 s/win` in abandoned
    frontier hovers (`~40–48%` walking away from a solvable local move or ready
    `4/5/6/7`), queued lookahead `react <= 30 ms` at `17.8%` (vs `63.4%` in
    `4.5+` pros), left-click hover dwell `+56 ms` longer than right-click flags
    (`128 ms` vs `72 ms`), no-flag counting reveals `+120–131 ms` slower than
    post-flag reveals.
  - **Run survival & session physiology:** `98.2%` (`109/111`) of late losses
    avoidable (`46.8%` within `< 500 ms` of prior click); performance peaks at
    `45–90 min` into a session then drops past `90 min`; `1.5 s` snap-restarts
    after `15–40 s` losses drop next-game conversion (`20.2%` vs `27.2%`); fast
    days beat slow days by `~12.3 s/win`.

---

## 2. Foundation Already Shipped (Phase 0 — Live 2026-11-25)

1. **Live Coaching Modes (`coach.js`, `game/coach.js`):** `Coach: No-waste`
   (with optional `Flag cap`), `Coach: Early bail`, `Coach: Scan shield`,
   `Coach: Full mix`, quick Focus `1–5` + Pace state sampling in `edit states`,
   slow overlap-pattern bookmarks with replay jumps, and Standard Expert
   transfer tracking on `training.html`.
2. **Cross-Size Trace Mind-Map & Standard Diagnostics (`mind-map.js`,
   `mind-map-worker.js`, `training.html`):**
   - Automatic notable highlights (`<= 6` high-signal cards, threshold-gated).
   - Ranked Expert performance traits ordered by time cost (`s/win`).
   - Pooled cross-size (`Beg + Int + Exp`) `24`-technique catalog with inline
     classic Minesweeper mini-board diagrams, `yours` real-`5x5` board toggles,
     one-step level switcher, counts (`n`), integer ms, whole `%`, and
     `bail first` / `drill` / `fast` / `low n` verdicts.
   - Endgame pointless flagging table by level.
   - Single-game thinking trace for the latest `12` Expert wins with `5x5`
     board snapshots of notable decisions.
   - Weekly `top-3 3BV/s` column and aligned `20 s+ runs` / `20 s+ won` columns.
3. **App-Wide Display Standards (`docs/product/ui-doctrine.md`):** minimal
   significant digits, no triple-slash cells, vertical right-aligned tabular
   digits with aligned units, counts (`n`), visual board examples, exact solver
   truth, zero fallbacks.

---

## 3. Long-Term Research, Development & Practice Tracks

### Track A — Cognitive Mind-Map & Decision-Order Engine (Understand First)

- **A1. Automatic complex-shape mining:** discover recurring canonical
  rotated/reflected multi-clue shapes from real traces beyond the initial 24
  techniques (coupled corners, `3`-clue chains, reduced high-number walls,
  endgame shapes) and attach real visual diagrams + `n` + latency + `bail first`
  cost.
- **A2. Full-game move-order & area-transition modeling:** reconstruct *why*
  Ernest solved regions in the order he did (local continuation, smart bail from
  a slow shape, leaving easy work behind, backtracking, cursor-locked reading vs
  eyes-ahead lookahead, frustration cascades after no-ops).
- **A3. Longitudinal technique speed trends:** track per-technique median and
  90th latency over time across pooled `Beg + Int + Exp` games so every drill
  and coaching change produces a clean time-series curve with high sample size.

### Track B — Concentrated Sub-Board Focused Pattern Trainer + Transfer Harness

Grounded in cognitive/motor skill-acquisition literature:
- **Blocked -> interleaved progression** (Contextual Interference, Shea & Morgan
  1979): short concentrated bursts build sight-recognition, then interleaved
  sets with lookalike distractors lock in whole-game retention and transfer.
- **Perceptual Learning Modules (PLMs — Kellman)** + **Adaptive
  Response-Time-Based Sequencing (ARTS — Mettler & Kellman):** brief speeded
  trials across all 8 orientations with realistic border clutter and partial
  flags, retiring items only once *both* accurate and below target RT (e.g.
  `< 300 ms`).

Build milestones:
- **B1. Cluttered mini-board drill engine (on `problems.html`):** generates
  `~100` realistic small boards per target pattern (surrounding numbers, partial
  flags, walls, all 8 symmetries, distractor non-matching boards) with ARTS
  response-time scheduling and zero sterile cutouts.
- **B2. Priority drill packs (ranked by measured time cost):**
  1. Exhaustive `4/5/6/7` rapid completion (especially partially-flagged `4`s)
  2. `Interior 1-2 flag` & `Straight-edge 1-2-1 / 1-2-2-1`
  3. Endgame direct-click finishing (zero pointless flags in final 5 safe squares)
  4. No-flag counting reveals & `1.5`-click last-flag reflex
- **B3. Automated `100`-Intermediate-Game A/B Transfer Harness:** measure exact
  baseline speed & skip rate on Target Pattern X (plus an untrained Control
  Pattern Y) across `100` Intermediate games via `mind-map.js` -> complete the
  `100`-board focused drill on Pattern X -> play `100` Intermediate games ->
  report exact before/after latency & skip deltas on X versus Y.

### Track C — Live Coaching Mode Evolution (Rewire In-Game Autopilot)

- **C1. Shield Mode `+20 s` Discipline Time Penalty:** keep death protection,
  add configurable time penalty (default `+20 s`) when violating chosen rules:
  - Skipping an exhaustively ready `4/5/6/7` to work elsewhere
  - Jumping far away while easy local counting moves remain
  - Guessing past a proven-safe square
  - Placing a pointless flag when `<= 5` safe squares remain
- **C2. Slow-Pattern Early Bail (No Target-Cell Hints):** remove target-cell
  highlighting from `Coach: Early bail`; fire a subtle non-spoiling bail cue
  only when lingering `>= 450 ms` on a mind-map `bail first` shape while
  counting moves wait elsewhere.
- **C3. No-Waste Refinements:** distinguish habit no-ops (`70%`) from physical
  1-cell/button slips (`30%`) in live recap, call out endgame pointless flags
  immediately, and track `1.5`-click progress.
- **C4. Session & Tilt Guardrails:** `Space = new board` cue on numbered starts,
  brief reset pause after `> 15 s` losses (breaking `1.5 s` snap-restart tilt),
  and `60–75 min` session notice before the `90 min` fatigue drop.

### Track D — Controlled Practice Experiments (Paired Blocks on `training.html`)

1. **No-Mark Sharpening Protocol:** alternating Expert sessions preceded by
   `15–20 min` Intermediate no-mark (`Coach: No-waste`, `Flag cap = 0`) tagged
   `no-mark warmup` versus standard warmup (`N = 2` historical long blocks were
   both positive on `2026-10-11` and `2026-10-14`; run `>= 4` paired blocks).
2. **Square Size / Scan-Span A/B:** test `36 px` vs smaller squares (`24–28 px`
   or `16 px`) using pointing-test baseline + alternating Expert blocks to
   measure scan-width gain vs misclick cost.
3. **Warmup & 60–75 Min Session Cap:** `5 min` Intermediate warmup + `10 min`
   single-rule Expert blocks, ending before the `90 min` fatigue cliff.
4. **State Sampling & Readiness:** correlate quick `Focus 1–5` + `Pace` tags
   and `self-check.html` alertness against fast vs slow days (`12.3 s/win`
   spread).
5. **Coach Transfer Audit:** once `>= 10` post-coach Standard Expert wins
   accumulate per drill, keep only drills showing verified Standard improvement
   and tune or drop anything that does not transfer.

---

## 4. Iterative `/goal` Execution & Check-In Protocol

Each iteration cycle follows five strict steps:
1. **Pick one bounded milestone** from Tracks A–C (ordered by measured impact
   from `mind-map.js` and Ernest's latest play feedback).
2. **Build cleanly:** pure logic module + worker isolation + strict UI doctrine
   (minimal sigdigs, vertical digit alignment, visual mini-boards, counts `n`) +
   unit tests + Playwright browser verification + Firefox latency check (`--record`).
3. **Deploy and check in with Ernest:** pause after each shipped milestone so
   Ernest can inspect the live page, try a real practice/play block, and report
   what felt right or misaligned.
4. **Re-audit fresh IndexedDB traces:** measure exact before/after shifts on
   techniques, endgame flags, slow-shape bails, no-ops, and Standard transfer.
5. **Refine and repeat:** update this program, `BACKLOG.md`, and `docs/product/`
   from the measured data before starting the next milestone.

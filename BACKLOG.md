# Unbuilt work

Single list of unbuilt ideas, open design decisions, and pending
Step-2 cleanups. Shipped behavior lives in `docs/product/` (indexed by
[PRODUCT.md](PRODUCT.md)); do not keep shipped recaps here.

Status labels: **creator** = requested by the creator; **mapped** = proposed
or derived from research/analysis, not requested as a build; **found** =
discovered bug or gap awaiting action.

---

## Training, coaching, and mind-map

- **creator** — **Calibrate `mentation-v2` from ground-truth replay inspector
  feedback:** once the player labels `20–40` episodes across real games in
  `#training-inspector` and exports `mentation-feedback.json`, audit every
  `Partly right` and `Wrong` case, refine `mind-map.js` thresholds and claim
  rules under `MODEL_VERSION = 'mentation-v2'`, and verify accuracy gains on the
  labeled ground-truth set.
- **creator** — **Deeper mind-map shape mining & decision-order refinement:**
  automatically cluster recurring multi-clue shapes beyond the 24-technique
  catalog, reconstruct full board area-visitation order, and track pooled
  `Beg + Int + Exp` technique latencies longitudinally over time.
- **creator** — **Sub-board skill drill ARTS adaptive sequencing + 100-game
  Intermediate transfer tracking:** extend the 6 cluttered sub-board and
  mentation drills on `problems.html` ([reference/mentation-model-2026-11-26.md](reference/mentation-model-2026-11-26.md))
  with blocked-to-interleaved ARTS response-time scheduling, multi-orientation
  board symmetries, and automated before/after `Fresh Local P2P` latency & skip
  checks across `100` Intermediate games in `mind-map.js`.
- **creator** — **Shield mode `+20 s` discipline penalty & exhaustive `4/5/6/7`
  rule:** keep death protection in `Coach: Scan shield`, add a configurable
  time penalty (default `+20 s`) when skipping a ready `4/5/6/7`, jumping past
  easy local counting moves, guessing past a proven-safe square, or placing
  pointless flags with `<= 5` safe squares left.
- **creator** — **Slow-pattern Early Bail (no target-cell hints):** replace
  target-cell highlighting in `Coach: Early bail` with a non-spoiling nudge
  when lingering on a `bail first` shape (`>= 450 ms`) while counting moves
  wait elsewhere.
- **creator** — **No-Mark sharpening experiment protocol:** run alternating
  tagged blocks (`15–20 min` Intermediate no-mark warmup via `Coach: No-waste`
  `Flag cap = 0` vs standard warmup) and score Expert 3BV/s, IOE, and late
  conversion on `training.html` (`N = 2` historical long blocks, both positive).
- **mapped** — **Coach follow-ons:** export captured `>= 450 ms` overlap
  bookmarks into rotated/mirrored flashcards on `problems.html`; optional
  session/tilt guardrails (post-`> 15 s` loss reset prompt, `60–75 min`
  fatigue reminder); calibrate detectors once `>= 10` post-coach Standard
  Expert wins accumulate.
- **creator** — **Training & problems plan-v2 follow-ons:**
  - Counterfactual replay gap ranking (replace one component at a time with
    faster-level values); add board difficulty (3BV, openings) and per-class
    player effects to the corpus comparison model.
  - Own-game drills on `problems.html`: premature-chord last-flag positions,
    wrong-flag check-before-chording positions from losses, long-pause
    recognize-and-click positions, and mid-game deduction-only sprints.
  - `problems.html` upgrades: worker-run exact judgement on off-answer clicks,
    gap-weighted spaced scheduling, mine-answer and straight-edge classes, and
    archive sync initiated directly from `problems.html`.
  - Training page additions: Intermediate warm-up stats beside Expert,
    board-adjusted weekly pace and statistical plateau detection, stage-target
    review after Stage 1, backfill of pre-`firstRevealIndex` opening starts.
- **mapped** — **Keyboard keys as mouse buttons:** separate clicking from
  aiming as an alternating-block experiment.

---

## Play modes, solver, generators, and replay

- **creator** — **More board generators:** threshold blobs (edge-softness
  parameter), toroidal wrap, black noise (sparse tight bursts), chosen words
  in letterforms (part of the score key), flag/emblem region geometries, new
  ranked board sizes, and trait-targeted generation (force/forbid `8`/`7`/max
  number, target island count, largest island, or zero count).
- **mapped** — **Solver-aware modes & rules:**
  - **Kaboom:** unfixed mines; unforced guesses kill, forced guesses survive.
  - **Guardian Angel family expansion:** evaluate unpinned groups, unevenly
    seen chains, unequal chains with extra untouched squares (needs a policy
    for unequal-odds forced guesses), and multiple untouched regions.
- **creator** — **Replay & score-list follow-ons:**
  - Open old games saved without `finalBoard` (pre-`2026-09-21`) by rebuilding
    mines from seed + input replay (decide whether replay/live-perf stay off
    for traces lacking per-move positions).
  - Full lists for streak tables (each run's length, start/end dates, link to
    last win).
- **mapped** — **Replay polish:** real/scaled-time animated cursor playback;
  wider overlay canvas showing off-board excursions (e.g. travel to face button).
- **mapped** — **Exact solver tools (from JSMinesweeper review):** per-number
  probability breakdown on hover/guess card, progress chance (candidate info
  tie-break), dead-square highlighting, manual position analyzer, MBF/ABF
  board file import/export.
- **open decision** — **Deeper than one-move perfect play (`Odds.winChances`
  `10^5` search budget):** raising the budget buys ~1% more guesses at seconds
  each (`4,184/4,266` stopped guesses require listing `>= 10^8` layouts).
  Options: (1, recommended) keep `10^5` and show exact stopped work count on
  the card; (2) run uncapped on demand when the card opens; (3) raise to `10^6`.

---

## Analytics, results, rankings, and limits

- **creator** — **Live perf charts follow-ons:** detect forks inside one work
  area (splitting one frontier by direction), backfill pre-`2026-10-20` move
  habits, calibrate near/jump/pause/undo thresholds against replays, plot
  against 3BV progress, show rows live during play, restore distinct rings on
  hovered events' left-behind squares.
- **creator** — **Session results & judgment follow-ons:**
  - Split `wrong flag` into contradicted-by-numbers vs trusted-guessed-flag.
  - Add proof tiers (`counting` / `overlap` / `whole-board`) for survived
    guesses past safe squares, plus rushed-click overlay (`< 500 ms`).
  - Compare creator's answers to the 163 local `analysis/judgment/` problems
    to settle risk thresholds, whole-board guilt, and win flag mistakes.
  - Optional: split stored `whole-board` loss tier into `all-numbers` vs
    `mine-total`; optional: file forced guesses by one-move life before lowest
    immediate risk.
- **creator** — **Deduction levels & move hierarchy unbuilt parts:** finer
  grades within `all-numbers` (minimum clue count) and `overlap` (subset vs
  partial); judge each player move against best 3BV/click (crediting flags
  with chords prepared); information-usefulness tie-break (level 6);
  output-per-hour move scoring; revisit first-reading defaults (connected guess
  definition, flag click cost, safe-only distance).
- **creator** — **Fastclick gap (planned pairs) open calibration:** compare on
  traces touching vs within-2, pooled vs same-button pairs, pair-count display,
  and rest-rule separation.
- **creator** — **Game data, rankings & board-metric follow-ons:**
  - Decide what game data supersedes vs rank tables; disambiguate shared
    `"3BV 71"` naming between board-trait rank and solve-time table; polish
    `"see scores"` standalone row alignment when no trace exists.
  - Open display polish: one-line color key, small-pool & data-sufficiency
    handling, `ranks won` row wrapping (28ch cap), unify remaining `"mark"`
    wording in evaluation/replay to `"flag"`.
  - Open ranking policy choices: small-pool first-place rules, preserving
    collapsed category names, eligibility before duplicate collapsing, current
    vs earned-at-the-time standings.
  - Record-review additions (`mapped`): click any recent rank to inspect its
    game, mini finished-board metric-cell preview, median-time delta beside
    board ranks.
  - Switch cost (`mapped`): direction/distance breakdowns with reliability
    checks, rolling 500-game history chart, cross-player comparison.
  - Research (`creator`/`mapped`): recent & per-person trait–performance
    correlations (needs explicit player identity, never conflating state tags),
    scalable exact opening-first minimum `C_0*(B)`, multifeature expected-time
    model, guess-ledger rank lists/scatters, total-click IOE cousin.
- **mapped** — **Additional daily play limits:** sitting breaks (N min play /
  M min break), allowed start-time window, losing-streak stop, weekly totals,
  wall-clock page time, per-mode limits, pre-limit warning, stop-time no-flags
  stage, and archiving play spans.

---

## Bugs, performance, and infrastructure

- **found (awaiting decision)** — **Settings overwritten after Firefox Back or
  two open tabs:** Firefox bfcache restores stale RAM settings, and a later
  write overwrites changes made on `settings.html` or another tab. Options:
  (1, recommended) checked IndexedDB writes comparing stored version before
  writing, reloading stale tabs; (2) reload on persisted `pageshow` (abandons
  unfinished boards and does not fix two tabs).
- **creator** — **Long-history trend cost:** keep exact full-lifetime Theil–Sen
  coverage while bounding cost via worker-owned delta history, revision-keyed
  exact caches, incremental bucket aggregates, and lazy view computation.
- **creator** — **Remaining latency optimizations:** skip offscreen section
  layout, cut `syncGameSidebar` layout cost on board switch, incremental
  worklist proofs updating only around newly opened cells, reply worker
  judgment before model measurements, store compact per-action board diffs in
  traces, seed realistic multi-thousand-game history in the latency check, and
  attribute the occasional board-switch spike.
- **found** — **Backfill pass over all saved traces:** one worker pass to
  recompute move habits, planned-pairs fastclick gap, cadence spread,
  given-opening 3BV, and rescore historical guesses to exact `guess-ledger-v3`
  (plus saving exact raw-risk verdict fields so readers stop comparing
  decimals within `1e-12`). Decide auto-start vs button-start and whether to
  drop unscorable untraced `guessPerfect`.
- **creator** — **Hosting & discoverability:** Voice-Wei origin migration
  (preserving saved data & Articles auth), Nectaris Remake independent hosting
  prep, and `robots.txt` / `sitemap.xml` / `llms.txt` / OG meta tags for
  `https://minesweeper-friendly.fuseki.net/`.

---

## Lifelong self-measurement and longitudinal research

- **creator** — **Nothing lost:** archive folder import (rebuild DB on a new
  machine), record restarted/abandoned attempts with partial traces and end
  reason, full-rate Pointer Events capture (coalesced samples, paint times,
  pointer exit/re-entry, per-action board diffs), declared hardware/DPI/mm
  setup registry stamped onto records, timestamped state changes & in-session
  sleepiness rating.
- **creator** — **More frozen `<= 90 s` self-checks:** calibrated aimed
  pointing (mm amplitudes/widths), stratified deduction test from fixed
  generator, processing-speed task if needed.
- **creator** — **Gameplay as calibrated passive measure:** provability replay
  (`deducible-since` per cell), hand-slip vs decision-error split, per-movement
  tables, fix wander window mismatch and truncated recovery runs, group local
  time using recorded time zone, CHI 2012 deliberate-movement filter, tremor /
  overshoot / Fitts throughput, Hevelius CoV & per-stage display config.
- **creator** — **Long-horizon in-app analysis views** (building on offline
  `analysis/history/`): session & trailing-chunk summaries, session-aligned
  small multiples, behavioral tendency signature, error grammar, guess-policy
  progression, competing win-rate vs wins/hour objectives, held-out state
  classification, "me over time" dashboard, self-check history charts, and
  optional physiological channels (heart rate via local base system).
- **creator** — **Secret replay experiment**
  ([reference/replay-experiment.md](reference/replay-experiment.md)): covert
  lagged re-serves of transformed earlier boards inside ordinary Standard play.

---

## Pending Step-2 cleanups (delete once active browsers have loaded Step 1)

- **Fastclick gap (old definition):** delete legacy `fastclickGapMs` deletion
  block in `normalizeGameRecord` and its test.
- **Record field rename (`clicks`/`wastedClicks`/`movesRanOut`):** delete
  DB v7 rename step, `RENAMED_RECORD_FIELDS` entries, import renaming, and old
  tests (eligible since `2026-11-05` after exporting fresh backups).
- **Guardian Angel record rename (`justice*` -> `guardianAngel*`):** delete
  DB v8 rename shim and old-name migration tests (setting shim already removed;
  historical `guardianAngelVersion` stamps in `game/history.js` and
  `justiceSaves` stay accepted unless rewritten in a one-time upgrade).
- **Legacy panels strip:** delete retired `panels.gameDetails`, `replay`, and
  `reviewOptions` strips in `panelsFromStored` (`settings-core.js`).
- **Board strings (array -> string evaluations):** delete
  `stringFormatEvaluation` and array branches once active browsers load Step 1
  (decide whether `stringFormatTraceEvents` stays for pre-v2 traces or traces
  are rewritten once).

---

## Decided against (do not revisit without an explicit request)

- **Separate Guardian-Angel-on vs. Guardian-Angel-off rankings:** mixed lists
  are canonical.
- **Storing song/media titles on `musicPlaying`:** boolean only (song titles
  are personal data that should not live permanently in exports).

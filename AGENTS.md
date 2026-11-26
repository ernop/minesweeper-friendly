# minesweeper-friendly — Agent Index

Start here. Loaded at startup by every agent. Holds standing rules, runtime
wiring, and pointers to area docs; open only the area files a task needs. Keep
this file concise (under 18 KB) so no agent harness truncates it at startup.

## Project

A classic-Windows Minesweeper web app (same standard mechanics, zero
dependencies, no build step) with solver-aware variants (Guardian Angel,
Angelic), live coaching modes, rich per-game analytics, and trace-based
training diagnostics. Long-term vision: [PRODUCT.md](PRODUCT.md).

### Runtime architecture & cache-tag rules

- **Game page (`index.html` + `style.css`):** loads `pages-redirect.js`,
  `page-errors.js`, `storage.js`, `observation-context.js`, `archive.js`; pure
  logic modules (`rng.js`, `guardian-angel.js`, `coach.js`, `board-shape.js`,
  `zini.js`, `board-metrics.js`, `endgame.js`, `solver.js`, `generators.js`,
  `pregen.js`, `odds.js`, `trial.js`, `game-data.js`, `during-game.js`,
  `board-icons.js`, `settings-core.js`, `preferences-game.js`,
  `analysis-client.js`, `play-limits.js`, `board-metrics-ui.js`); `fuseki-stats.js`;
  then `game/*.js` in exact `index.html` load order.
- **Companion pages:**
  - `settings.html` + `settings-page.js` (loads `storage.js`, `archive.js`,
    `generators.js`, `game-data.js`, `during-game.js`, `board-icons.js`,
    `settings-core.js`, `play-limits.js`).
  - `training.html` + `training-page.js` (loads `storage.js`, `board-icons.js`;
    runs read-only workers `training-worker.js`, `mind-map-worker.js`, and
    `switch-cost-worker.js` in parallel).
  - `problems.html` + `problems-page.js` (separate `minesweeper-problems`
    IndexedDB via `problems-storage.js`; does not load `storage.js`).
  - `self-check.html` + `self-check-page.js` (`storage.js`,
    `observation-context.js`, `archive.js`, `self-check-core.js`).
- **Workers:** `analysis-worker.js` (named queues + `trend-fit.js`),
  `board-metrics-worker.js`, `archive-worker.js` (`archive-format.js`),
  `training-worker.js` (`training-core.js`), `mind-map-worker.js`
  (`mind-map.js`), `switch-cost-worker.js` (`switch-cost.js`).
- **Hard invariants (enforced by tests):**
  - Every shipped page/worker file must be listed in `deploy/runtime-files.json`
    (`python3 tests/hosting-release-test.py`).
  - Every page running game code loads `page-errors.js` right after
    `pages-redirect.js` (`tests/page-errors-test.js`).
  - Every page's `storage.js?v=` tag must match (`tests/storage-cache-tag-test.js`).
  - `fuseki-stats.js` is copied byte-for-byte from `fuseki4_ai`; never edit it
    here. Logging-only failures in play statistics are the sole exception to
    Anti-Fallback (stats must never interrupt play).
  - `game/*.js` share one global scope in `index.html` order, share one `?v=`
    tag (including worker imports in `analysis-worker.js` and
    `training-worker.js`; bump worker creation URLs too), and `game/main.js`
    loads last and alone defines `storageFailure` / `userdataReady`
    (`tests/startup-presentation-test.js`; tests read via `tests/game-source.js`).

### `game/` files (load order)

| File | Responsibility |
| --- | --- |
| `core.js` | live game state, shared DOM handles, status line |
| `layout.js` | board position solver/editor, zoom, pixel ratio, adaptive dock, clearance |
| `play.js` | top panel (LCDs, dove), generator glue, new-game, reveal/flag/chord, win/loss, Guardian Angel |
| `play-modes.js` | other-modes menu, 3BV countdown, Endgame drill, Board lab, live trials |
| `coach.js` | coaching practice modes (`coach-*`), coach bar, cues, bookmarks, recap |
| `play-limits.js` | play spans, daily-limit gates, no-flags penalty, top-bar usage |
| `evaluation.js` | pure verdict model, click capture, worker-run decision judgment |
| `results.js` | saving records, after-game report, High scores view, collapsible openers |
| `history.js` | record schema/version stamps, mode keys, normalization, transfer cleaning |
| `rankings.js` | rank windows, day categories, session summary/tree, session picker, rank lists |
| `charts.js` | chart presentation (models in worker), SVG helpers, ticks, trends, scatters |
| `trial-review.js` | after-trial identity review and run overlays |
| `game-data-chart.js` | game data percentile band, distributions, strips, example boards |
| `during-game-chart.js` | live perf charts, move counts, event tracks, hover replay preview |
| `result-ranks.js` | `renderRanks` section assembly |
| `score-list.js` | full score-list windows, sorting, old-game comparison |
| `input-trace.js` | raw cursor/button/layout trace capture and atomic `storeGame` |
| `replay-model.js` | pure path and choice replay |
| `replay-view.js` | replay transport, playback, hover preview, path canvas, legends |
| `music.js` | music state sampling |
| `trace-metrics.js` | pure trace-motion measurement systems and press-timing medians |
| `metric-definitions.js` | shared metric display catalog and series projection (also in workers) |
| `motion-stats.js` | collapsible foot motion-stats section (computed only while open) |
| `player-states.js` | player state tags and popover menu |
| `controls.js` | board input events, Space restart, game choice, custom board |
| `backup.js` | history/trace export/import, data-format card |
| `main.js` | storage hooks, `completePendingGames`, static chrome, `init` (must load last) |

### Local server, hosting, and deploys

- **Player origin:** `http://127.0.0.1:8018/` owned on PC by systemd unit
  `minesweeper-friendly.service` (`systemctl --user status/restart`; never
  start a competing manual server or use `localhost` — IndexedDB is per origin).
- **Test origin:** anything that writes storage during verification runs on
  `http://127.0.0.1:8099/` in an isolated profile, never `8018`.
- **Canonical release:** public repo `ernop/minesweeper-friendly`; every push
  to `master` deploys to `https://minesweeper-friendly.fuseki.net/` once CI
  passes. Before pushing runtime changes, record the Firefox latency check
  (`--record`) on the commit being pushed; after pushing, verify CI passes
  (`gh run watch <id> --exit-status`). A failed deploy is a failed change.

## Documentation rules (optimized for cold-start agents)

- **Save decisions in the same turn:** every product guideline, design
  decision, requirement, or new idea goes into checked-in files immediately
  (chat is never the record). Keep specs and code in sync in the same change.
- **Keep `docs/product/` present-tense, goal-first, and scannable:**
  - Record **goals, principles, user ergonomics, and non-obvious invariants**
    ("why" things behave as they do so a cold-start agent never regresses them).
  - **Do not** paste verbatim chat transcripts, `"creator request YYYY-MM-DD:"`
    attribution tags, retired-UI history (`"until X it sat in Y"`), or raw
    implementation lists (pixel step arrays, CSS breakpoints, slider increments)
    into `docs/product/`. Git holds history; code and `docs/implementation/`
    hold exact constants and wiring.
  - **Keep dates only** where time defines data semantics (schema boundaries
    where older saved records lack fields) or on dated empirical studies in
    `reference/`.
- **Single home per kind of fact:**
  - Product goals & behavioral invariants -> matching `docs/product/<area>.md`
    (indexed in [PRODUCT.md](PRODUCT.md)).
  - Code wiring, function names, constants, test notes ->
    `docs/implementation/<area>.md`.
  - Unbuilt ideas, deferred work, open decisions -> [BACKLOG.md](BACKLOG.md)
    (prune shipped recaps; keep only unbuilt work).
  - Empirical studies, pro audits, research logs -> `reference/`
    ([reference/README.md](reference/README.md)).
  - One definition per measurement: every performance metric's id, name,
    definition, format, direction, and formula live once in `GameData.metrics`
    (`game-data.js`; [docs/product/measurement-catalog.md](docs/product/measurement-catalog.md)).
  - App-wide UI rules: always read [docs/product/ui-doctrine.md](docs/product/ui-doctrine.md)
    before building or reshaping any surface.

## Area index

| Area | Product spec | Implementation |
| --- | --- | --- |
| Hosting, deploys, play stats | [hosting.md](docs/product/hosting.md) | [hosting.md](docs/implementation/hosting.md) |
| Design axis, deduction levels, move hierarchy | [design-axis.md](docs/product/design-axis.md) | — |
| UI doctrine (read before any UI work) | [ui-doctrine.md](docs/product/ui-doctrine.md) | — |
| Board chrome, layout, board position, latency | [board-and-layout.md](docs/product/board-and-layout.md) | [board-and-layout.md](docs/implementation/board-and-layout.md) |
| Play modes & live coaching modes | [play-modes.md](docs/product/play-modes.md) | [play-modes.md](docs/implementation/play-modes.md) |
| Board generators & score keys | [board-generators.md](docs/product/board-generators.md) | [board-generators.md](docs/implementation/board-generators.md) |
| Guardian Angel | [guardian-angel.md](docs/product/guardian-angel.md) | [guardian-angel.md](docs/implementation/guardian-angel.md) |
| Game-end evaluation & action evidence | [game-end-evaluation.md](docs/product/game-end-evaluation.md) | [game-end-evaluation.md](docs/implementation/game-end-evaluation.md) |
| Result presentation & ordering | [results.md](docs/product/results.md) | [results.md](docs/implementation/results.md) |
| Game data chart & shared session | [game-data.md](docs/product/game-data.md) | [game-data.md](docs/implementation/game-data.md) |
| Live perf charts (during the game) | [during-game.md](docs/product/during-game.md) | [during-game.md](docs/implementation/during-game.md) |
| Measurement catalog | [measurement-catalog.md](docs/product/measurement-catalog.md) | [measurement-catalog.md](docs/implementation/measurement-catalog.md) |
| Rankings, highlights, streaks, session summary | [rankings.md](docs/product/rankings.md) | [rankings.md](docs/implementation/rankings.md) |
| Average-time & scatter charts | [charts.md](docs/product/charts.md) | [charts.md](docs/implementation/charts.md) |
| Path and choice replay | [replay.md](docs/product/replay.md) | [replay.md](docs/implementation/replay.md) |
| Per-game stats, board metrics, guess ledger | [per-game-stats.md](docs/product/per-game-stats.md) | [per-game-stats.md](docs/implementation/per-game-stats.md), [board-metrics.md](docs/implementation/board-metrics.md) |
| Motion stats | [motion-stats.md](docs/product/motion-stats.md) | [motion-stats.md](docs/implementation/motion-stats.md) |
| Retired left session panel | [session-stats.md](docs/product/session-stats.md) | — |
| Player states | [player-states.md](docs/product/player-states.md) | [player-states.md](docs/implementation/player-states.md) |
| Personal settings | [settings.md](docs/product/settings.md) | [settings.md](docs/implementation/settings.md) |
| Daily play limits | [play-limits.md](docs/product/play-limits.md) | [play-limits.md](docs/implementation/play-limits.md) |
| Storage, traces, backup, archive | [storage-and-history.md](docs/product/storage-and-history.md) | [storage-and-history.md](docs/implementation/storage-and-history.md) |
| Lifelong self-measurement & offline analysis | [measurement.md](docs/product/measurement.md) | [offline-analysis.md](docs/implementation/offline-analysis.md) |
| Self-check reference tests | [self-check.md](docs/product/self-check.md) | [self-check.md](docs/implementation/self-check.md) |
| Training & trace mind-map | [training.md](docs/product/training.md) | [training.md](docs/implementation/training.md) |
| Minesweeper problems | [problems.md](docs/product/problems.md) | [problems.md](docs/implementation/problems.md) |

Verification, browsers, and promo screenshots: [docs/implementation/verification.md](docs/implementation/verification.md).
Research notes: [reference/README.md](reference/README.md). Player pitch: `promo/PROMO.md` (keep non-technical).

## Standing engineering rules

### Anti-Fallback Principle
There is only the primary path. Anywhere a component can fail, raise a loud,
visible error naming what failed and where — never catch-and-default, retry-loop
past bugs, chain backup methods/tools/configs, or degrade silently in UI. Fix
the single upstream source.

### Design requirements
1. **Zero tolerated defects:** a known flaw is a bug to fix, not a trade-off.
2. **No dead guards or legacy clutter:** never guard unreachable states. When a
   history/schema change affects only existing stored records, ship it in two
   steps (migrate on load, then delete the migration once active browsers load
   step 1; track step 2 in `BACKLOG.md`).
3. **Proper names:** name exact concepts with units/reference points (`timeMs`,
   `endedAt`); one term per concept.
4. **Store primary facts once; derive stable functions at read time:** store
   independently measured quantities directly, never reconstructed by subtracting
   two fields with mismatched edges.
5. **No lying UI or data:** no sentinel "unknown" values, no rounded copy that
   disagrees with its source, no display string acting as an identifier.
6. **Exact values, never estimates:** compute every displayed fact exactly by
   definition; a note saying "approximately" never fixes a shortcut. Scale the
   algorithm instead.
7. **Component independence:** storage emits data, not UI copy; presentation
   does not own storage keys.
8. **Replace, don't accumulate:** when a newly shipped behavior is rejected with
   no real data on it, remove/replace it outright instead of adding an option
   beside it.

### Analysis isolation & latency budgets
- Heavy analytics run in workers, never in gameplay/input handlers or the UI
  thread; discard stale replies; no main-thread fallback.
- Run `tests/latency-browser-check.js` in Firefox (~15 s, [verification.md](docs/implementation/verification.md))
  when finishing any gameplay, game-end, storage, startup, or result-layout
  change, and with `--record` on the commit being pushed (commit the appended
  `tests/latency-history.jsonl` line separately as
  `"Record latency for <commit>: ..."`). Budgets are tight and per machine
  (`tests/latency-machine.txt`, gitignored).
- Run only browser checks exercising the change; never let a stalled command
  hang.
- Never use environment variables for app config (use gitignored machine files).

### Communication & style
- Plain player-known terms; define any technical term inline where first used.
- Ask questions in plain text with a recommended answer (not modal forms);
  answer questions before starting long work.
- No emojis anywhere (files, responses, commits).
- No relationship fluff, praise, validation, or empty intensifiers (`genuinely`,
  `really`, `actually` as filler, `honestly`, `heads-up`, `wrinkle`, `lands`
  for done, `say the word`, `walk you through`, smell words).
- Code comments explain current "why", never dated changelogs or what the code
  already says. Filenames: `[A-Za-z0-9._-]` only.
- Structural fixes over promises: fix code, linters, hooks, or loaded docs so
  cold-start sessions behave right by default.

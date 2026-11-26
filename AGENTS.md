# minesweeper-friendly — Agent Index

Start here. Loaded at startup by every agent. Holds standing rules, runtime
wiring, and pointers to area docs; open only the area files a task needs. Keep
this file under 18 KB (enforced by `tests/agent-docs-test.js`) so no harness
truncates it at startup.

## Project

A classic-Windows Minesweeper web app (standard mechanics, zero dependencies,
no build step) with solver-aware variants (Guardian Angel, Angelic), live
coaching modes, per-game analytics, and trace-based training diagnostics.
Long-term three-pillar vision: [PRODUCT.md](PRODUCT.md).

### Runtime architecture & cache-tag rules

- **Game page (`index.html` + `style.css`):** loads `pages-redirect.js`,
  `page-errors.js`, `storage.js`, `observation-context.js`, `archive.js`;
  pure board/solver modules (`rng.js`, `guardian-angel.js`, `coach.js`,
  `board-shape.js`, `zini.js`, `board-metrics.js`); backfill UI
  (`board-metrics-ui.js`); pure game/model/settings modules (`endgame.js`,
  `solver.js`, `generators.js`, `pregen.js`, `odds.js`, `trial.js`,
  `game-data.js`, `during-game.js`, `board-icons.js`, `settings-core.js`,
  `play-limits.js`); worker/preference glue (`analysis-client.js`,
  `preferences-game.js`); `fuseki-stats.js`; then `game/*.js` in exact
  `index.html` load order.
- **Companion pages:**
  - `settings.html` + `settings-page.js` (`style.css`, `storage.js`,
    `archive.js`, `generators.js`, `game-data.js`, `during-game.js`,
    `board-icons.js`, `settings-core.js`, `play-limits.js`).
  - `training.html` + `training-page.js` (`style.css`, `training.css`,
    `storage.js`, `board-icons.js`; runs read-only workers `training-worker.js`,
    `mind-map-worker.js`, `switch-cost-worker.js` in parallel).
  - `problems.html` + `problems-page.js` (`style.css`, `problems.css`,
    `board-icons.js`, `problems-core.js`, `problems-storage.js`,
    `problems-bank.json`; separate `minesweeper-problems` IndexedDB, does not
    load `storage.js`).
  - `self-check.html` + `self-check-page.js` (`style.css`, `storage.js`,
    `observation-context.js`, `archive.js`, `self-check-core.js`).
  - `guardian-angel-help.html` (static diagrams; loads only
    `pages-redirect.js` and `fuseki-stats.js`, runs no game code).
- **Workers:** `analysis-worker.js` (named queues from `analysis-client.js`;
  `trend-fit.js` + shared modules), `board-metrics-worker.js`
  (`board-metrics-ui.js`), `archive-worker.js` (`archive.js`;
  `archive-format.js`, `problems-storage.js`), `training-worker.js`
  (`training-core.js`), `mind-map-worker.js` (`mind-map.js`),
  `switch-cost-worker.js` (`switch-cost.js`).
- **Hard invariants (enforced by tests):**
  - Every shipped page/worker/asset must be listed in `deploy/runtime-files.json`
    (`python3 tests/hosting-release-test.py`).
  - Every game-code page loads `page-errors.js` right after `pages-redirect.js`
    (`tests/page-errors-test.js`).
  - Shared `?v=` tags (`YYYYMMDD-topic`) must match everywhere an asset loads
    across all HTML pages and workers (`tests/storage-cache-tag-test.js`,
    `tests/agent-docs-test.js`). All `game/*.js` share one `?v=` tag (including
    imports in `analysis-worker.js` and `training-worker.js`); whenever a worker
    or its imports change, also bump that worker's creation URL
    (`analysis-client.js`, `training-page.js`, `board-metrics-ui.js`,
    `archive.js`) and the creator script's tag in HTML.
  - `game/*.js` share one global scope in `index.html` order; `game/main.js`
    loads last and alone defines `storageFailure` / `userdataReady`
    (`tests/startup-presentation-test.js`; tests read via `tests/game-source.js`).
  - UI invariants enforced automatically: `tests/player-words-test.js`,
    `tests/chart-captions-test.js`, `tests/settings-one-place-test.js`.
  - `fuseki-stats.js` is copied byte-for-byte from `fuseki4_ai`; never edit it
    here. Logging-only failures in play statistics are the sole exception to
    Anti-Fallback (stats must never interrupt play).

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

### Local server, verification, and deploys

- **Player origin:** `http://127.0.0.1:8018/` owned on PC by systemd unit
  `minesweeper-friendly.service` (`systemctl --user status/restart`; never
  start a competing manual server or use `localhost` — IndexedDB is per origin).
- **Test origin:** anything writing storage during verification runs on
  `http://127.0.0.1:8099/` in an isolated profile, never `8018`.
- **Standard verification:** run CI checks before every push:
  `python3 tests/hosting-release-test.py && for t in tests/*-test.js; do node "$t"; done`.
  Run only browser checks covering the changed code (not the whole browser
  list); stop any stalled command instead of waiting it out.
- **Canonical release (`ernop/minesweeper-friendly`):** every push to `master`
  deploys to `https://minesweeper-friendly.fuseki.net/` once CI passes. For
  gameplay, game-end, storage, startup, or result-layout changes:
  1. Run Firefox `tests/latency-browser-check.js` unrecorded on `8099` while
     finishing the change.
  2. Commit the code changes.
  3. Run `tests/latency-browser-check.js ... --record` against `HEAD`, then
     commit the appended `tests/latency-history.jsonl` line alone as
     `"Record latency for <commit>: ..."`.
  4. Push and confirm CI passes (`gh run watch <id> --exit-status`). A failed
     deploy is a failed change.

## Documentation rules (cold-start standard)

- **Spec-first and same-turn sync:** read the affected `docs/product/` section
  before changing behavior. Save every product guideline, decision, or new idea
  to checked-in files in the same turn (chat is never the record), preserving
  intent and distinguishing requested behavior from implemented behavior.
- **Keep `docs/product/` present-tense, goal-first, and scannable:**
  - Record **goals, principles, user ergonomics, and non-obvious invariants**.
    Verify every present-tense claim against live code when editing.
  - **Do not** paste verbatim chat transcripts, `"creator request YYYY-MM-DD:"`
    attribution tags, retired-UI history (`"until X it sat in Y"`), or raw
    implementation lists into `docs/product/`. Git holds history; code and
    `docs/implementation/` hold constants and wiring.
  - **Keep dates only** where time defines data semantics (schema boundaries)
    or on dated empirical studies in `reference/`.
- **Single home per kind of fact:**
  - Product goals & behavioral invariants -> `docs/product/<area>.md`
    ([PRODUCT.md](PRODUCT.md)).
  - Code wiring, function names, constants, test notes ->
    `docs/implementation/<area>.md`.
  - Unbuilt ideas, deferred work, open decisions, Step-2 cleanups ->
    [BACKLOG.md](BACKLOG.md) (no shipped recaps).
  - Empirical studies, audits, archived reviews -> `reference/`
    ([reference/README.md](reference/README.md)).
  - Player-facing overview/pitch -> [README.md](README.md) and
    `promo/PROMO.md` (keep non-technical; update on major UI changes;
    `tests/promo-screenshots.js` retakes `promo/` images).
  - One definition per measurement -> `GameData.metrics` in `game-data.js`
    ([docs/product/measurement-catalog.md](docs/product/measurement-catalog.md)).
  - App-wide UI rules -> read [docs/product/ui-doctrine.md](docs/product/ui-doctrine.md)
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
Research notes: [reference/README.md](reference/README.md).

## Standing engineering rules

### Anti-Fallback & Design Requirements
Follow the global Anti-Fallback Principle strictly (primary path only; fail
loudly with file/cause; never catch-and-default, chain backup methods/tools, or
degrade UI; sole exception is `fuseki-stats.js` console logging).
1. **Zero tolerated defects:** a known flaw is a bug to fix, not a trade-off.
2. **No dead guards or legacy clutter:** never guard unreachable states. When a
   schema change affects only existing stored records, ship in two steps
   (migrate on load, then delete the migration once active browsers load step 1;
   track step 2 in `BACKLOG.md`).
3. **Proper names:** name exact concepts with units/reference points (`timeMs`,
   `endedAt`); one term per concept.
4. **Max efficiency & primary-fact storage:** store each independently measured
   quantity once and derive pure, definition-stable functions at read time; when
   in doubt, store the straightforward scalar rather than subtracting mismatched
   fields.
5. **Concept division:** nothing duplicated, nothing one thing split, nothing
   two things merged.
6. **No lying UI or data:** no sentinel "unknown" values, no rounded copy
   disagreeing with its source, no display string acting as an identifier.
7. **Exact values, never estimates:** compute every displayed fact exactly by
   definition; a note saying `"approximately"` never fixes a shortcut. Scale the
   algorithm instead.
8. **Component independence:** storage emits data, not UI copy; presentation
   does not own storage keys.
9. **Replace, don't accumulate — protect real data:** replace a rejected
   behavior rather than adding an option beside it; delete brand-new rejected
   features with no real data outright, **but never delete anything holding real
   accumulated data or in real use without the creator's decision**.

### Analysis isolation & latency budgets
- Heavy analytics run in workers, never in gameplay/input handlers or the UI
  thread; discard stale replies; no main-thread fallback.
- Latency budgets (`tests/latency-budgets.json`, per machine via gitignored
  `tests/latency-machine.txt`) sit just above measured Firefox times — never
  generous round numbers. **A budget failure means the change is unfinished:**
  fix the slowdown or ask the creator before loosening a budget. Tighten budgets
  when code gets faster; only full-results timing may loosen while play,
  win-click, and post-game freeze budgets stay tight. `dirty: true` from another
  session's edits does not block pushing.
- Never use environment variables for app config; keep secrets out of the repo
  (`FUSEKI_DEPLOY_SSH_KEY` lives only in GitHub Secrets).

### Communication, code style & efficiency
- Plain player-known terms; define any technical term inline where first used.
- Ask questions in plain text with a recommended answer (not modal forms);
  answer the user's question in the first message before starting long work.
- When uncertain whether a recommendation suffices, investigate and resolve it
  before answering; return an answer, not a basic/ironclad menu.
- No emojis anywhere. No praise, validation, filler intensifiers (`genuinely`,
  `really`, `actually` as filler, `honestly`, `heads-up`, `wrinkle`, `lands`,
  `say the word`, `walk you through`), or smell words.
- Comments explain current "why", never dated changelogs or what code says.
  Python: type hints, `pathlib.Path`, constants for magic values. Filenames:
  `[A-Za-z0-9._-]` only.
- Structural fixes and cheap automation first: if `rg` or a script can do it,
  don't spend model time on it.

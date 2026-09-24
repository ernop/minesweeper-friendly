# minesweeper-friendly — Agent Index

Start here. Agents load this file at startup. It holds the standing rules
and the path to every other piece of project knowledge; open only the files
a task needs.

## Project

A minesweeper clone of minesweeper.online's standard mode (same mechanics,
classic-Windows look), growing toward friendlier variants: no-guess boards
and beyond. The friendliness axis and the solver tiers that define
"solvable" are in [docs/product/design-axis.md](docs/product/design-axis.md).

Runtime: `index.html` + `style.css` load `storage.js`; pure `rng.js` /
`justice.js` / `board-shape.js` / `zini.js` / `board-metrics.js`;
`board-metrics-ui.js` (which runs `board-metrics-worker.js`); pure
`endgame.js` / `solver.js` / `generators.js` / `pregen.js` / `odds.js` /
`trial.js`; shared `game-data.js` / `settings-core.js` / `preferences-game.js`;
then the game page's own scripts in `game/` (below). No dependencies, no
build step. The settings page is
`settings.html` + `settings-page.js`, loading the same `style.css`,
`storage.js`, `generators.js`, `game-data.js`, and `settings-core.js` (both
pages must load storage.js, game-data.js, and settings-core.js before their own script).

### Game page code (`game/`)

The former single `minesweeper.js` is split by area into classic scripts
in `game/` (user request 2026-09-23: split it "to some kind of logical
division ... to make working with this file easy and sensible"). The split
moved code verbatim; only two blocks changed position (the play-mode code
now follows board play, and the storage hooks moved into `main.js`), and
section markers were added where an old heading no longer described its
code. The rules:

- The files share one global scope and load in `index.html` order. Code
  that runs at load time may use only what its own file or an earlier file
  declares. Functions called later may use any file.
- `game/main.js` loads last and alone declares `storageFailure` and
  `userdataReady`: `storage.js` starts the page as soon as `userdataReady`
  exists, so every other file must be loaded by then.
- All `game/` script tags share one `?v=` tag. Bump it in every tag (one
  replace) whenever any `game/` file changes.
- `tests/startup-presentation-test.js` enforces the last two rules. Tests
  read the code through `tests/game-source.js`, which concatenates the files
  in load order, so section-marker spans keep working across files.

Files, in load order:

| File | Holds |
| --- | --- |
| `core.js` | constants, the current game's state, DOM handles |
| `layout.js` | board position solver and wiring, docked columns, clearance |
| `play.js` | LCDs, generator glue, new-game flow, reveal/flag/chord, win/loss, A just universe |
| `play-modes.js` | Pregen 10, Endgame drill, Board lab, trials on the live board |
| `evaluation.js` | game-end evaluation: pure verdict model, live capture |
| `results.js` | the saved record (`reportResult`), after-game report, result view |
| `history.js` | record schema, per-mode history, mode keys, normalization, transfer cleaning |
| `rankings.js` | rank windows, date/age formatting, day categories, board families, ranks won in session, rank lists |
| `charts.js` | axis ticks, trend lines, the (?) help tip, scatter and average-time charts |
| `trial-review.js` | after-trial rank rows, identity review, run overlays |
| `game-data-chart.js` | the game data chart (0–100% band) and its views |
| `result-ranks.js` | `renderRanks`: result tables and charts in section order |
| `input-trace.js` | the raw input trace |
| `replay-model.js` | path and choice replay, pure part |
| `replay-view.js` | replay controls, frames, path canvas, legends |
| `music.js` | music state sampling |
| `trace-metrics.js` | trace metrics, pure (all measurement systems) |
| `metrics-panel.js` | left stats panel: session heading, live rows, motion charts, scheduling |
| `session-stats.js` | session series computation, event recording, startup backfill |
| `session-charts.js` | the one session picker, session controls and charts |
| `player-states.js` | player state tags |
| `controls.js` | board input events, difficulty tabs, board position editor, zoom |
| `backup.js` | history/trace export and import, data-format card |
| `main.js` | storage hooks, mode/generator switchers, `init` (last) |

Serve with `python3 -m http.server 8018 --bind 127.0.0.1` and open exactly
`http://127.0.0.1:8018/`.
On PC, the enabled systemd user unit `minesweeper-friendly.service` owns this
server (boot startup, survives logout, restarts after exit). Use
`systemctl --user start/restart/status minesweeper-friendly.service` as
appropriate; never launch a competing manual server. Source and installation:
[README.md — Persistent local server](README.md#persistent-local-server-linux).
Anything that writes storage during verification runs on
`http://127.0.0.1:8099/` instead
([docs/implementation/verification.md](docs/implementation/verification.md)).

Hosting: public GitHub repo `ernop/minesweeper-friendly`; GitHub Pages serves
the playable game from the master branch root at
https://ernop.github.io/minesweeper-friendly/ and redeploys on every push.

## Standing instructions

Standing user instruction (reaffirmed 2026-09-23): always save every
user-provided product guideline, design, requirement, and decision to a
project file in the same turn, without needing a reminder. Record product
and UI specifications in the matching `docs/product/` file (indexed by
[PRODUCT.md](PRODUCT.md)), the implementation mapping in the matching
`docs/implementation/` file, and pending work in [BACKLOG.md](BACKLOG.md),
linking any supporting design document from here.
Preserve the user's intent and distinguish requested behavior from what is
implemented. This applies even when no code change is requested; chat alone
is not the record.

The product spec is canonical for every product and UI decision. Read the
affected section before changing behavior, and keep it and the code in sync
in the same change. Implementation notes only map the spec onto code.

App-wide UI rules (simplicity first, optional help must be useful and hidden
behind a subtle tooltip affordance, hover never reflows page content,
semantic legend/key labels are never shortened,
layout stability, no distracting duplicate live values, clear ways in and out) live in
[docs/product/ui-doctrine.md](docs/product/ui-doctrine.md) — read it before
building or reshaping any surface.

Unbuilt work lives in one file: [BACKLOG.md](BACKLOG.md). That is the
place for generation ideas, deferred product, and requested rank lists
that are not in the game yet. Do not leave new ideas only in chat.

Documentation layout (decided 2026-09-23): this file holds only startup
facts, rules, and pointers; details belong in the area files. Each area has
one product file and at most one implementation file, listed below; a new
area adds its files and its row in the same change. Cross-references cite
the file path, plus the section heading when the file holds several.

## Where to look

| Area | Product spec | Implementation notes |
| --- | --- | --- |
| Friendliness axis, solver tiers | [docs/product/design-axis.md](docs/product/design-axis.md) | none |
| UI doctrine (read before any UI work) | [docs/product/ui-doctrine.md](docs/product/ui-doctrine.md) | none |
| Board chrome, page layout, board position | [docs/product/board-and-layout.md](docs/product/board-and-layout.md) | [docs/implementation/board-and-layout.md](docs/implementation/board-and-layout.md) |
| Play modes (NG variants, Endgame drill, trials, Pregen 10, Board lab) | [docs/product/play-modes.md](docs/product/play-modes.md) | [docs/implementation/play-modes.md](docs/implementation/play-modes.md) |
| Board generators, top score keys | [docs/product/board-generators.md](docs/product/board-generators.md) | [docs/implementation/board-generators.md](docs/implementation/board-generators.md) |
| A just universe | [docs/product/just-universe.md](docs/product/just-universe.md) | [docs/implementation/just-universe.md](docs/implementation/just-universe.md) |
| Game-end evaluation, action evidence | [docs/product/game-end-evaluation.md](docs/product/game-end-evaluation.md) | [docs/implementation/game-end-evaluation.md](docs/implementation/game-end-evaluation.md) |
| Result presentation and ordering | [docs/product/results.md](docs/product/results.md) | [docs/implementation/results.md](docs/implementation/results.md) |
| Game data chart, shared session | [docs/product/game-data.md](docs/product/game-data.md) | [docs/implementation/game-data.md](docs/implementation/game-data.md) |
| Rank lists, highlights, recent placements, streaks | [docs/product/rankings.md](docs/product/rankings.md) | [docs/implementation/rankings.md](docs/implementation/rankings.md) |
| Average-time charts, scatter plots | [docs/product/charts.md](docs/product/charts.md) | [docs/implementation/charts.md](docs/implementation/charts.md) |
| Path and choice replay | [docs/product/replay.md](docs/product/replay.md) | [docs/implementation/replay.md](docs/implementation/replay.md) |
| Per-game stats and counters, music, guess ledger | [docs/product/per-game-stats.md](docs/product/per-game-stats.md) | [docs/implementation/per-game-stats.md](docs/implementation/per-game-stats.md) |
| Board measurements, "This board" tables, backfill | [docs/product/per-game-stats.md](docs/product/per-game-stats.md), [docs/product/rankings.md](docs/product/rankings.md) | [docs/implementation/board-metrics.md](docs/implementation/board-metrics.md) |
| Trace metrics panel | [docs/product/trace-metrics-panel.md](docs/product/trace-metrics-panel.md) | [docs/implementation/trace-metrics-panel.md](docs/implementation/trace-metrics-panel.md) |
| Session stats | [docs/product/session-stats.md](docs/product/session-stats.md) | [docs/implementation/session-stats.md](docs/implementation/session-stats.md) |
| Player states | [docs/product/player-states.md](docs/product/player-states.md) | [docs/implementation/player-states.md](docs/implementation/player-states.md) |
| Personal settings | [docs/product/settings.md](docs/product/settings.md) | [docs/implementation/settings.md](docs/implementation/settings.md) |
| Storage, raw input traces, history, backup | [docs/product/storage-and-history.md](docs/product/storage-and-history.md) | [docs/implementation/storage-and-history.md](docs/implementation/storage-and-history.md) |
| Measurement purpose, offline analysis | [docs/product/measurement.md](docs/product/measurement.md) | [docs/implementation/offline-analysis.md](docs/implementation/offline-analysis.md) |

- Local tooling, test entry points, headless browsers, and deploys:
  [docs/implementation/verification.md](docs/implementation/verification.md).
- Research notes and external references: [reference/README.md](reference/README.md).
- Promotion: `promo/PROMO.md` is the promotional page — player-facing pitch
  only, nothing technical — with `promo/win-screen-2026-08-19.png` as its hero
  image. Keep it free of implementation detail.
  `promo/win-screen-2026-08-19-full-layout.png` (current layout: stats beside
  the board, charts below) is the README's screenshot.
- [2026-09-22 retained stash review](docs/stash-review-2026-09-22.md): recovered reporting work, superseded chart changes, and archived hosting proposal.

## Rules for agents

Condensed from `~/proj/mybrowser/.cursor/rules/` (canonical source; read
`00-absolute-rules.mdc` there for the full text) and `~/proj/agents.md`.

### The Anti-Fallback Principle

This is a global principle. It governs every layer — library code, APIs, data
handling, configuration, infrastructure, tooling, UI — not just imports.
Anywhere a component can fail, it must fail loudly and visibly, never continue
in a reduced or substituted mode.

There is only the primary path. Any fallback is banned. When the primary path
cannot do its job, stop and raise a loud, visible error that names what failed
and where — never a backup path, a default value, a retry, or a degraded mode.
Repair the primary path. A system must not contain a component whose absence
it is built to tolerate; if you find yourself writing "works without X," X was
not optional — its failure is a crash, not a mode.

Why: a fallback hides the original mistake. Execution keeps going, so the
failure surfaces later and far from its cause, and debugging costs about twice
as long because you must first discover that a fallback swallowed the error.
The design target is the inverse: the system should always be one mistake away
from a huge, visible crash, so every mistake announces itself where it happens.

The test for any error-handling code: does it let execution continue toward a
wrong-but-quiet result (fallback — banned), or does it halt and show the
failure (error — required)? Re-raising a caught exception verbatim, or a
missing-config check that exits pointing at the fix, is failing visibly —
that is the rule, not an exception to it.

Banned, non-exhaustively:

- Defensive imports (`try: import x / except ImportError`). Import directly;
  if it fails, fix `requirements.txt`, never wrap in try/except.
- Config-detection chains (storage → file A → file B → baked default). Read
  the one authoritative source; if missing or invalid, error.
- Trying multiple external tools until one works.
- `tryAscertainValue` patterns checking field_a, then field_b, then field_c.
- Catch-and-default / catch-and-continue: `try { x } catch { return [] }`, or
  `value ?? DEFAULT` where a missing value is a bug.
- Retry loops papering over an intermittent failure instead of fixing its
  cause.
- UI "graceful degradation" that hides a backend error behind a generic
  offline/empty state. Render the actual status code and body.
- The fix is always to improve the single upstream source, never to add
  downstream alternatives.

### Design requirements

Recorded 2026-08-19 during the play-history design review. These govern every
design in this repo and extend the Anti-Fallback Principle above.

1. Perfect design, zero compromises. A tolerated known defect is a bug in the
   design, not a trade-off.
2. Ideal-world assumptions: there are no legacy problems, legacy users, or
   support burdens. No fallbacks (see above) and no belt-and-suspenders:
   never guard a state the system cannot reach — if a state is impossible,
   the guard is banned; if it is possible, it must be handled truthfully.
   Schema changes carry no migration shims or forward version provisioning;
   change the schema and the code together.
3. Proper names, always. A name states exactly what the thing is, with units
   and reference points where they disambiguate (`timeMs`, `endedAt`). One
   term per concept.
4. Always the most efficient way possible — computation, storage,
   implementation effort. Store each primary fact exactly once; derive
   everything else at read time.
5. No component ever lies in any message it emits — UI text, stored records,
   return values. Every value shown or stored is exactly the fact it claims:
   no sentinel values standing in for "unknown" or "impossible", no rounded
   copy that can disagree with its source, no display string doing double
   duty as an identifier.
6. Components are relatively independent. Storage does not produce UI
   strings; presentation does not define storage keys; a component's
   interface is data, not another component's formatting.
7. Correct division of concepts: nothing duplicated, nothing that is one
   thing split, nothing that is two things merged. Storing a derived value
   next to its primaries is duplication.

Refinement to 4 and 7 (2026-08-20, decided with the user): "store each
primary fact exactly once" means store every independently MEASURED
quantity directly and straightforwardly; derive at read time only what is
a pure, definition-stable function of stored facts (3BV/s from bv3 and
timeMs). Never store a measured value only as a remainder to be
reconstructed by subtracting one stored value from another — if the two
measurements' windows or thresholds differ even at the edges, the
reconstruction lies. The duplication rule 7 bans is two copies of the
same fact; two related measurements are not copies. Since raw traces
became the stored ground truth ([Raw input traces](docs/product/storage-and-history.md)), per-game
scalars are summaries of the trace and definitions can be recomputed
retroactively; when in doubt, add the straightforward scalar rather than
a clever reconstruction.

### Configuration

- Never use environment variables for configuration.
- `settings.json` (gitignored) holds keys/secrets; `settings.example.json`
  (checked in) is the template. Code reads the config file, not `os.environ`.
- Never commit credentials; placeholders like `YOUR_API_KEY_HERE` in docs.

### Communication

- No emojis anywhere — files, responses, commits.
- No relationship-management speech: no praise, validation, verdicts on the
  user's statements ("You're right"), reassurance, or servile offers. Present
  analysis; agreement is its conclusion, not its opening.
- Preserve the epistemic status of the user's words — a claim stays a claim,
  neither upgraded ("brilliant insight") nor downgraded ("instinct", "hunch").
- Banned words/phrasings: "honest(ly)" framing, "heads-up", "wrinkle",
  "lands/land" for "is done", "say the word", "walk you through", empty
  intensifiers ("genuinely", "really", "actually" as filler), smell words
  ("cruft", "hacky", "code smell", "bloat", "footgun", "overengineered",
  "elegant", "clean code" as praise). State concrete pros and cons instead.
- Put meaning in statements, not in a word's connotation. If something is
  risky or costly, say so and why.
- Report status straight: what is done, what is not; name issues as issues.
- Be terse; present alternatives as labeled options, not padded prose. Do the
  task, report, stop — but do obvious follow-up housekeeping without asking.
- When uncertain whether a recommendation suffices, investigate and resolve
  the uncertainty before answering; return an answer, not a basic/ironclad
  menu.

### Code style

- Comments explain why, not what. No comments that restate the function name.
- Type hints in Python; `pathlib.Path` for paths; constants for magic values.
- One term per concept; unify immediately when dual terminology appears.
- Filenames we create: `[A-Za-z0-9._-]` only — no spaces or metacharacters.

### Structural fixes only

"The agent will remember/try harder next time" is not a fix — future sessions
start from the same weights and files. Valid fixes change the code path, the
checked-in rule files, or an injected hook so the correct behavior is the
default. Durable facts go in checked-in files linked from an agents.md, never
in an agent's private memory.

### Cost-efficiency

Prevent problem classes at the earliest, cheapest point (linter rule,
pre-commit hook, script) rather than repeatedly hand-fixing instances. If
grep or a script can do it, don't spend model time on it.

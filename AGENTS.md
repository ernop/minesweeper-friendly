# minesweeper-friendly — Agent Index

Start here. Agents load this file at startup. It holds the standing rules
and the path to every other piece of project knowledge; open only the files
a task needs.

## Project

A minesweeper clone of minesweeper.online's standard mode (same mechanics,
classic-Windows look), growing toward friendlier variants such as A just
universe and Angelic play (the no-guess modes were removed 2026-10-21). The
friendliness axis and the deduction levels that grade how hard each fact
is to know and define "solvable" (`Justice.DEDUCTION_LEVELS`) are in
[docs/product/design-axis.md](docs/product/design-axis.md).

Runtime: `index.html` + `style.css` load `storage.js`; pure `rng.js` /
`justice.js` / `board-shape.js` / `zini.js` / `board-metrics.js`;
`board-metrics-ui.js` (historical backfill in `board-metrics-worker.js`); pure
`endgame.js` / `solver.js` / `generators.js` / `pregen.js` / `odds.js` /
`trial.js`; shared `game-data.js` / `during-game.js` (pure, the during-the-game
model and rows, also in `analysis-worker.js`) / `board-icons.js` / `settings-core.js` / `preferences-game.js`;
`analysis-client.js` (named worker queues in `analysis-worker.js`, using
`trend-fit.js` for exact slope selection; its switch-cost lane runs
`switch-cost-worker.js`, which reads saved traces and runs the pure
`switch-cost.js` with `training-core.js`, `justice.js`, `solver.js`, and
`rng.js`); pure `switch-cost.js` (the page reads its constants); the pure
`play-limits.js` (daily play limits, after `settings-core.js`); then the game page's own scripts in `game/` (below). No dependencies, no
build step. The settings page is
`settings.html` + `settings-page.js`, loading the same `style.css`,
`storage.js`, `generators.js`, `game-data.js`, `during-game.js`, `board-icons.js`,
`settings-core.js`, and `play-limits.js` (both pages must load storage.js,
game-data.js, during-game.js, board-icons.js, settings-core.js, and
play-limits.js before their own script; the schema's mine-style choices come
from board-icons.js, its during-the-game rows from during-game.js).
The problems page is `problems.html` + `problems-page.js`, loading
`style.css`, `problems.css`, `board-icons.js`, the pure `problems-core.js`,
`problems-storage.js`, and the generated `problems-bank.json`; it keeps its own
IndexedDB database (`minesweeper-problems`, names in `problems-storage.js`,
which `archive-worker.js` also imports to archive it) and does not load
`storage.js`.
The self-check page is `self-check.html` + `self-check-page.js`, loading
`style.css`, `storage.js`, `observation-context.js`, `archive.js`, and the pure
`self-check-core.js`; the game page loads `observation-context.js` and
`archive.js` right after `storage.js`, and the settings page loads `archive.js`
too. `archive.js` drives the archive folder through `archive-worker.js`, which
imports the pure `archive-format.js`. Every page's `storage.js` cache tag
changes together: a stale copy would open an older database version and fail
(`tests/storage-cache-tag-test.js` enforces it). Every file a page or worker
loads must be listed in `deploy/runtime-files.json`, or the hosted release
breaks; `python3 tests/hosting-release-test.py` fails on a missing one.
Every page that runs game code loads `page-errors.js` right after the Pages
redirect: the error bar, which shows any error no code handled
([UI doctrine](docs/product/ui-doctrine.md), "Errors are shown";
`tests/page-errors-test.js` enforces the order).
Every page also loads `fuseki-stats.js`, Fuseki's play-statistics module,
copied byte for byte from fuseki4_ai `setup/apps/fuseki-stats.js`; never edit
it here. On the game page it loads deferred, just before the `game/` scripts.
Calls to it log a failure to the console instead of raising it, a deliberate
exception to the Anti-Fallback Principle below: statistics must never
interrupt play (creator decision 2026-10-11;
[Play statistics](docs/product/hosting.md#play-statistics)).
The training page is `training.html` + `training-page.js`, loading
`style.css`, `training.css`, and `storage.js`; `training-worker.js` reads the
saved games and runs the pure `training-core.js` with `justice.js`,
`solver.js`, `rng.js`, and `game/evaluation.js`.

### Game page code (`game/`)

The former single `minesweeper.js` is split by area into classic scripts
in `game/` (user request 2026-09-23: split it "to some kind of logical
division ... to make working with this file easy and sensible"; then
"review and finish the move now properly"). Code moved verbatim: a first
pass split the file in order, and a second pass the same day moved each
misplaced piece into the file of its area. Section markers inside each
file name what its parts hold. The rules:

- The files share one global scope and load in `index.html` order. Code
  that runs at load time may use only what its own file or an earlier file
  declares. Functions called later may use any file.
- `game/main.js` loads last and alone declares `storageFailure` and
  `userdataReady`: `storage.js` starts the page as soon as `userdataReady`
  exists, so every other file must be loaded by then.
- All `game/` script tags share one `?v=` tag, including the `game/` files
  that `analysis-worker.js` and `training-worker.js` import. Bump it in every
  tag (one replace) whenever any `game/` file changes, then each changed
  worker's own tag where it is created (`analysis-client.js`,
  `training-page.js`) and that file's tag in its page. The workers' copies
  once kept older tags while the page moved on (2026-10-14).
- `tests/startup-presentation-test.js` enforces the last two rules, except
  the workers' own tags. Tests
  read the code through `tests/game-source.js`, which concatenates the files
  in load order, so section-marker spans keep working across files.

Files, in load order:

| File | Holds |
| --- | --- |
| `core.js` | the current game's state, shared DOM handles (incl. the page status line) |
| `layout.js` | board position solver, wiring, and editor; zoom and pixel ratio; docked columns; clearance |
| `play.js` | top panel (LCDs, face), generator glue and Generator menu, new-game flow, reveal/flag/chord, win/loss, A just universe |
| `play-modes.js` | other modes menu, mode predicates and labels; 3BV countdown (the code's "pregen"), Endgame drill, Board lab, trials on the live board |
| `play-limits.js` | daily play limits: the play spans (every saved one; this tab's begin, heartbeat, and ending), the closed-board gate and notice, the no-flags penalty gate, today's use in the top bar |
| `evaluation.js` | game-end evaluation: pure verdict model, live capture |
| `results.js` | the saved record (`reportResult`), after-game report, result view, High scores view |
| `history.js` | record version stamps and schema, per-mode history, mode keys, normalization, transfer cleaning |
| `rankings.js` | rank windows and relative ages, day categories, board families and their one name each (`BOARD_TRAIT_NAMES`), session summary and its results tree, the one session picker, ranks won in session, rank lists |
| `charts.js` | chart models and presentation (heavy models execute in the analysis worker); chart basics (SVG namespace, count phrases, text widths, displayed numbers, sparkline sizes), axis ticks, trend lines, the (?) help tip, scatter and average-time charts |
| `trial-review.js` | after-trial identity review, run overlays |
| `game-data-chart.js` | game data: pure ranking and label layout, then the 0–100% band and its views, the strips, and the cards' example boards |
| `switch-cost-line.js` | the optional switch cost line under game data: the session's and the latest 500 standard games' estimates, its card, refresh requests |
| `during-game-chart.js` | live perf charts (head of the game data column): the progress, moves available, and relative charts and event tracks on one time axis, legend picks, the log or linear scale and the count axis, hover line, the card for the hovered line, the board's replay previewing the hovered moment, replay link, configure |
| `result-ranks.js` | `renderRanks`: result tables and charts in section order |
| `input-trace.js` | the raw input trace |
| `replay-model.js` | path and choice replay, pure part |
| `replay-view.js` | replay transport and playback, hover preview, frames, path canvas, legends |
| `music.js` | music state sampling |
| `trace-metrics.js` | trace metrics, pure (all measurement systems), and the press-timing constants and median the results use |
| `metric-definitions.js` | shared metric display catalog and series projection (pure, also loaded in workers) |
| `motion-stats.js` | motion stats, the open/close section at the page foot: live sample scheduling, rows and sparklines, the finished game's Fitts curve and spatial pace bias |
| `player-states.js` | player state tags and their menu |
| `controls.js` | board input events, new-game shortcut, game choice (preset links, other modes menu, mode options row), custom board, see-scores button |
| `backup.js` | history/trace export and import, data-format card |
| `main.js` | storage hooks, static chrome, `init` (last) |

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

Hosting: public GitHub repo `ernop/minesweeper-friendly`. The canonical game
is https://minesweeper-friendly.fuseki.net/ and every master push releases it.
GitHub Pages still publishes the master branch and redirects visitors there.

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
behind a subtle tooltip affordance, options never more than one step deep,
grouped in one place, and each shown in only one place, hover never reflows page content,
semantic legend/key labels are never shortened, no text narrating what a
chart's marks are ("Green line: this game."),
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
| Public hosting and deployment, play statistics | [docs/product/hosting.md](docs/product/hosting.md) | [docs/implementation/hosting.md](docs/implementation/hosting.md) |
| Friendliness axis, deduction levels | [docs/product/design-axis.md](docs/product/design-axis.md) | none |
| UI doctrine (read before any UI work) | [docs/product/ui-doctrine.md](docs/product/ui-doctrine.md) | none |
| Board chrome, page layout (game setup rows, top bar, settings row, footer), board position | [docs/product/board-and-layout.md](docs/product/board-and-layout.md) | [docs/implementation/board-and-layout.md](docs/implementation/board-and-layout.md) |
| Play modes (Angelic, Endgame drill, trials, 3BV countdown, Board lab; the removed no-guess modes) | [docs/product/play-modes.md](docs/product/play-modes.md) | [docs/implementation/play-modes.md](docs/implementation/play-modes.md) |
| Board generators, top score keys | [docs/product/board-generators.md](docs/product/board-generators.md) | [docs/implementation/board-generators.md](docs/implementation/board-generators.md) |
| A just universe | [docs/product/just-universe.md](docs/product/just-universe.md) | [docs/implementation/just-universe.md](docs/implementation/just-universe.md) |
| Game-end evaluation, action evidence | [docs/product/game-end-evaluation.md](docs/product/game-end-evaluation.md) | [docs/implementation/game-end-evaluation.md](docs/implementation/game-end-evaluation.md) |
| Result presentation and ordering | [docs/product/results.md](docs/product/results.md) | [docs/implementation/results.md](docs/implementation/results.md) |
| Game data chart, shared session, switch cost line | [docs/product/game-data.md](docs/product/game-data.md) | [docs/implementation/game-data.md](docs/implementation/game-data.md) |
| Live perf charts (in-game rows over time, moves available by deduction level and chordable numbers, detected events: clicks, jumps and why each move happened, pauses) | [docs/product/during-game.md](docs/product/during-game.md) | [docs/implementation/during-game.md](docs/implementation/during-game.md) |
| Rank lists, highlights, recent placements, streaks, session summary and its results tree (incl. abandoned boards) | [docs/product/rankings.md](docs/product/rankings.md) | [docs/implementation/rankings.md](docs/implementation/rankings.md) |
| Average-time charts, scatter plots | [docs/product/charts.md](docs/product/charts.md) | [docs/implementation/charts.md](docs/implementation/charts.md) |
| Path and choice replay | [docs/product/replay.md](docs/product/replay.md) | [docs/implementation/replay.md](docs/implementation/replay.md) |
| Per-game stats and counters (incl. move habits), music, guess ledger | [docs/product/per-game-stats.md](docs/product/per-game-stats.md) | [docs/implementation/per-game-stats.md](docs/implementation/per-game-stats.md) |
| Board measurements, "This board" tables, backfill | [docs/product/per-game-stats.md](docs/product/per-game-stats.md), [docs/product/rankings.md](docs/product/rankings.md) | [docs/implementation/board-metrics.md](docs/implementation/board-metrics.md) |
| Motion stats (the trace metrics, an open/close section at the page foot) | [docs/product/motion-stats.md](docs/product/motion-stats.md) | [docs/implementation/motion-stats.md](docs/implementation/motion-stats.md) |
| Session stats and the left panel (removed 2026-10-20: the decision, where each part went) | [docs/product/session-stats.md](docs/product/session-stats.md) | none |
| Player states | [docs/product/player-states.md](docs/product/player-states.md) | [docs/implementation/player-states.md](docs/implementation/player-states.md) |
| Personal settings | [docs/product/settings.md](docs/product/settings.md) | [docs/implementation/settings.md](docs/implementation/settings.md) |
| Daily play limits (play time, games, games per level, stop time; 4:00 play day; two confirmations; 2-minute loosening lock; no-flags-first penalty) | [docs/product/play-limits.md](docs/product/play-limits.md) | [docs/implementation/play-limits.md](docs/implementation/play-limits.md) |
| Storage, raw input traces, history, backup, archive folder | [docs/product/storage-and-history.md](docs/product/storage-and-history.md) | [docs/implementation/storage-and-history.md](docs/implementation/storage-and-history.md) |
| Measurement purpose, lifelong self-measurement, offline analysis | [docs/product/measurement.md](docs/product/measurement.md) | [docs/implementation/offline-analysis.md](docs/implementation/offline-analysis.md) |
| Self-check (frozen reference tests: sleepiness rating, alertness test) | [docs/product/self-check.md](docs/product/self-check.md) | [docs/implementation/self-check.md](docs/implementation/self-check.md) |
| Training toward an Expert win under 60 s (plan, stage targets, training page) | [docs/product/training.md](docs/product/training.md) | [docs/implementation/training.md](docs/implementation/training.md) |
| Minesweeper problems (situation classes from pro replays, timed problems page, problem bank) | [docs/product/problems.md](docs/product/problems.md) | [docs/implementation/problems.md](docs/implementation/problems.md) |

- Local tooling, test entry points, headless browsers, and deploys:
  [docs/implementation/verification.md](docs/implementation/verification.md).
- Research notes and external references: [reference/README.md](reference/README.md).
- Promotion: `promo/PROMO.md` is the promotional page — player-facing pitch
  only, nothing technical — with `promo/win-screen-2026-10-21.png` (the board
  and its tables after a win) as its hero image. Keep it free of
  implementation detail. `promo/win-screen-2026-10-21-full-layout.png`
  (the layout at 1920 x 1080 on 2026-10-21: board and tables left, live perf
  charts above game data right) is the README's top screenshot; the
  README's close-ups sit beside it in `promo/` under the same date.
  `tests/promo-screenshots.js` retakes all seven:
  [verification](docs/implementation/verification.md), "README and promo
  screenshots".
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
- Method chains in our own code: running one method and, when it fails,
  another. Use one method that works well (creator 2026-10-21, on no-guess
  board generation: "we should use ONE technology which works well. not use
  something, and if it fails, use another thing. that's a very bad
  pattern.").
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

Removal and replacement (creator direction 2026-09-26; the case was the
self-check's 3-minute test, rejected minutes after release, then kept beside
its replacement and then kept readable for one saved check):

- Replace, don't add. When the creator rejects a behavior ("too long",
  "wrong"), change it rather than adding the fix as an option beside the
  rejected one, unless a choice is what they asked for.
- Weigh a removal by its situation. A feature the creator rejected right after
  it shipped, with nothing real built on it, goes outright: code, tests, docs,
  and its test data, with no compatibility path. That is not a license to
  remove freely: anything holding real accumulated data, or in real use, keeps
  its data or waits for the creator's decision before anything is deleted.

### Analysis isolation

User requirement (2026-09-25): expensive analytics must run in workers, never
in gameplay/input handlers or the UI thread. Keep result jobs bound to captured
games and discard stale view updates. No main-thread calculation fallback. See
[Preparation and completion cost](docs/product/board-and-layout.md#preparation-and-completion-cost).

### Latency budgets

User requirement (2026-09-26): the system must never get slow again. Run
`tests/latency-browser-check.js` in Firefox (about 13 seconds on the PC) when
finishing each change to gameplay, game end, storage, startup, or result
presentation, so a slowdown shows at the change that caused it (creator
decision 2026-10-26; it had run only before a push). Before the push, run it
once more with `--record` and commit the appended `tests/latency-history.jsonl`
line with the change: a recorded line names the commit it measured. A budget
failure blocks the push. Besides input and startup, the check times a long
Expert win to its full results, the analysis workers' share included (added
2026-10-26, after a change that doubled the workers' after-game work had
passed it). Budgets are per machine (creator request 2026-10-18): the gitignored
`tests/latency-machine.txt` names the machine running the check (`linux-pc`,
`windows-laptop`), and a run is judged only against that machine's budgets.
Budgets sit just above that machine's measured times, never at generous round
numbers; they tighten when code gets faster and loosen only by recorded
creator decision. Commands:
[verification](docs/implementation/verification.md).

### Test speed

User requirement (2026-10-17): no slow test runs. Run only the browser checks
that exercise the change, never the whole list by routine, and stop any
command that has stalled instead of waiting on it again. Details:
[verification](docs/implementation/verification.md), "Test speed".

### Configuration

- Never use environment variables for configuration.
- `settings.json` (gitignored) holds keys/secrets; `settings.example.json`
  (checked in) is the template. Code reads the config file, not `os.environ`.
- Never commit credentials; placeholders like `YOUR_API_KEY_HERE` in docs.

### Communication

- Plain terms (user request 2026-09-26): use normal words; when a technical
  term or a name you coined is needed, define it in the same sentence where it
  first appears, not elsewhere.
- Questions (user request 2026-09-26): ask in plain text with a recommended
  answer, not in question forms; forms were closed unanswered twice and cost
  round trips.
- Answer first (user request 2026-09-26): answer the user's question in the
  first message, then do any long audit or fix; a yes/no question once
  waited 28 minutes behind its fix.
- Defects found while working get fixed when the fix is clear, not only
  listed (user expectation 2026-09-26); report what was fixed.
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

# Training page implementation

Specification: [docs/product/training.md](../product/training.md).

## Files

| File | Role |
| --- | --- |
| `training.html` | page shell, the plan's static text, section containers |
| `training.css` | page layout; `style.css` still supplies the base font and the shared `.return-to-game` dress |
| `training-page.js` | renderer; defines `userdataReady` / `storageFailure` for `storage.js`; starts the worker |
| `training-worker.js` | reads IndexedDB, replays, posts the summary |
| `training-core.js` | pure measurements (`TrainingCore`), loaded by the worker and by Node tests |

The game page links it with `#training-btn` in `#top-right` (styled with
`#settings-btn` in `style.css`). All five files are in
`deploy/runtime-files.json`; the release validator checks the page's `src`/`href`
references, the `new Worker(...)` literal, and the worker's `importScripts`.

## Data flow

1. `storage.js` opens (and, if needed, upgrades) the database exactly as on the
   other pages, then calls `userdataReady`.
2. The page posts `{ name: DB_NAME, version: db.version, userdataStore,
   traceStore, historyKey: 'history' }` to `training-worker.js`. Passing the
   opened version keeps storage schema knowledge in `storage.js` only.
3. The worker opens the same version (an `upgradeneeded` there means the
   database was deleted meanwhile; it aborts rather than create an empty one),
   reads the `history` userdata value in one transaction and the latest
   `TrainingCore.RECENT_WINS` Expert wins' traces by `endedAt` in another, closes
   the connection, and posts `TrainingCore.summary(records, traces, deps)`.
   The page never deserializes the history on its own thread.
4. `deps` injects `Solver.randomPlacement`, `GameRandom.fromSeed`/`VERSION`, and
   `fatalKindOf` built from `fatalEvaluationOf` + `fatalActionStatusKind`
   (`game/evaluation.js`, legacy fatal records → `undefined`). The worker loads
   `justice.js` before `solver.js` because `solver.js` expects `Justice`.

## Replay (`trainingReplay`)

Inputs are trace events of kind `lup` or `rdown` with an integer `index`,
the same events the board handlers in `game/controls.js` log after their
early-return checks, except a right press marked `chordGesture` (the right
half of a both-button chord, not an input of its own). Semantics mirror
`revealCell`/`floodReveal`, `chordTargets`/`chord`, and `toggleFlag`: a left
release on a covered unflagged cell reveals and floods zeros (skipping flags);
on a revealed number it chords when flags equal the number and covered
unflagged neighbors remain; otherwise it is a no-op classified as missing flag,
extra flag, finished (nothing left to open), blank, or on a flag. A left
release marked `chordGesture` never reveals: over an unopened cell it is the
no-op `noop-chord-on-unopened`. A right press toggles a covered cell's flag or
is a no-op on an open one.

Layout: `trace.finalBoard.cells[i].mine` when saved (post-Justice, and every
recorded input replays identically on it because redraws only rearrange covered
sealed pockets consistently with revealed numbers); otherwise, for
`uniform-first-safe-fisher-yates-v1` traces with the current RNG version, the
board rebuilt from `seed` and the first reveal (the first left release on a cell
not flagged before the start). Any other trace is `no-layout`. A win must end
with every safe cell open and no mine; a loss must end on the explosion; inputs
after an explosion or a mismatch are `diverged`. Nothing is approximated.

On the 2026-09-26 history this reproduced 973 of 995 Expert traces; the 22
diverged were Justice redraws on seed-rebuilt boards.

Each replay step carries `{ kind, gapMs, t, index }`: the input kind, the gap
since the previous input, the trace time, and the cell.

## Offline comparison pipeline (plan v2)

`analysis/skill-comparison/` compares the player's exported games with
published expert replays (commands, data rules, and measurement notes in its
NOTES.md; design and results in reference/skill-comparison-2026-09-26.md).
`user_games.js` converts the game's history and traces exports through
`TrainingCore.replay`; `corpus_actions.py` converts saolei.wang replays through
`ms_toollib`; `compare.py` measures both identically. Trace layout events
measure `#board`'s border box, so the converter insets the cell grid by the
bevel (one eighth of a cell) and rejects any game with a click more than 1 px
outside its own cell.

## Tests

- `node tests/training-core-test.js`: hand-built 5x4 known answers for every
  input kind, gap timing, flag classes, removable counts; outcome and
  divergence checks; seed-rebuilt Expert boards (right and wrong seed, saved
  final board); record pace, runs through the real verdict code, weeks; stage
  status; an end-to-end summary; a loud failure when trace slots do not match
  the recent wins.
- `node tests/training-browser-check.js PLAYWRIGHT CHROMIUM` (8099 only, isolated
  profile): empty state; a seeded synthetic flagger history with deliberate
  no-ops; worker summary from IndexedDB; stage, budget, and week rendering;
  every neutral text element pure black; Esc returns to the game.

# minesweeper-friendly — Agent Index

Start here. This is the master index for the project.

## What this project is

A minesweeper project growing out of research into solver-aware game modes
(2026-08-19 session). Reference point: minesweeper.online's "no guessing" (NG)
mode, where the generator verifies with a logical solver that every board is
completable without guessing.

The design axis mapped so far, ordered by who bears the burden of ambiguity:

1. Naive random — mines fixed, no guarantees.
2. First-click safe — standard mode today; opening never kills.
3. No-guess (NG) — a complete logical path is guaranteed at generation time
   (minesweeper.online NG, Simon Tatham's Mines).
4. Evil NG — additionally guarantees a difficulty floor (at least one advanced
   deduction per board).
5. Unbuilt intermediate entries: graded NG (score by hardest required
   technique, as Sudoku grading does), uniform-hardness NG, single-path NG,
   proof-or-die NG (opening a not-provably-safe cell kills even if empty).
6. Kaboom (pwmarcz.pl/kaboom) — adversarial: mines stay unfixed; any unforced
   guess is a mine, forced guesses are always safe.
7. The angelic dual of Kaboom — mostly unexplored: any guess consistent with
   your information succeeds; you die only by contradicting known facts.

The repo name points at entry 7 and its neighbors: variants friendlier than
standard play.

Solver logic tiers (what "solvable" means): (a) trivial counting — number
equals hidden or flagged neighbors; (b) subset subtraction between overlapping
constraints — yields the named patterns 1-1, 1-2, 1-2-1, 1-2-2-1, reductions,
holes, triangles, corner patterns; (c) full constraint enumeration including
the global mine count. NG generation is generate → solve → reject/repair →
repeat. One derived result from the session: a 1-2…2-1 wall chain with k twos
is fully forced unless k ≡ 0 (mod 3), in which case only every third cell is a
forced mine.

## State

Standard mode clone implemented (2026-08-19): `index.html` + `style.css` +
`minesweeper.js`, no dependencies, no build step. Serve with
`python3 -m http.server 8018`.

**`PRODUCT.md` is the canonical spec of every product and UI decision**
(board chrome, layout rules, rank lists, rankaverages, streaks, scatters,
backup). Read it before changing behavior; keep it and the code in sync in
the same change. Below is only the implementation mapping.

Implementation notes:

- Storage: localStorage `minesweeper-friendly.history` maps mode key to a
  chronological array of game records, one per finished game:
  {endedAt, outcome: 'win'|'loss', timeMs, bv3, clicks, wastedClicks,
  mousePathPx} — primary measurements only (wastedClicks absent on records
  from before 2026-08-19; see `GAME_RECORD_SCHEMA`). The mode key is the board parameters
  (`modeKey()`, e.g. `9x9/10`); difficulty names are display-only
  (`modeLabel()`). Timestamps are epoch ms; all calendar math is done in
  the viewer's local timezone at read time. This schema replaced the
  `scores.v1`/`losses.v1` pair (2026-08-19, data-structure rectification);
  the old keys are not read and any data under them is ignored.
- Derived metrics (3BV/s, efficiency %, mouse speed, path/click, path/3BV)
  are computed at read time via `secondsOf`/`bvPerSecond`/
  `efficiencyPercent`, never stored.
- `mousePathPx`: cursor distance accumulated on document mousemove only
  while `gameState === 'playing'`.
- `clickCount` counts only effective clicks; `wastedClicks` counts board
  clicks that changed nothing — `toggleFlag` and `chord` return whether
  they had an effect, and the mouseup/contextmenu handlers count the
  falses plus left-clicks on flagged cells. Stored on the record since
  2026-08-19; `GAME_RECORD_SCHEMA` accepts its absence (older records),
  and the wasted-clicks scatter filters to wins that carry it.
- Rank list machinery: `rankWindows` (time windows + `specificity` for
  progressive disclosure), `rankColumns` (adds day categories, `isHoliday`),
  `windowBounds` (11-row windowing), `buildRankList` (shared renderer,
  always the full window), `relativeAge` + `.age-u-*` classes (age display
  and unit colors, shared with the scatter legend).
- Rankaverages: `RANKAVERAGE_SPECS` (bucketing per stat), `avgDelta`
  (sign/color convention; rendered as a final grid row whose text sits in
  the average-time column).
- Streaks: run-splitting and the core-trim/dedupe/domination filter are in
  `renderRanks`; see PRODUCT.md for the double-counting rationale.
- Scatters: `buildScatter` + `niceTicks` (`timeTicks` for the date axis),
  appended after a `.flex-break`; dots colored by age unit (`.age-dot-*`),
  the current game ringed and tagged with its today-rank, on-chart axis
  labels, legend appended last. Options: `timeAxis` (local calendar
  x-ticks), `idealLine` (y = x dashed floor).
- Layout: `#results` (summary + `#stats-grid` only) is absolutely
  positioned off `#game-area`; `#result-ranks` is normal flow below.
  `html { scrollbar-gutter: stable }` protects board centering.
- Backup: `#backup` controls; `importHistory` validates the whole blob
  before writing (arrays of well-formed records only, loud error naming the
  offending mode otherwise), dedupes by `endedAt` within each mode, and
  re-sorts each mode chronologically after a merge. Export writes with
  `navigator.clipboard` only; a rejection surfaces its error message.
  `#format-panel` (toggled by `#format-btn`) is the data-format reference
  card, generated at init by `buildFormatPanel` from `GAME_RECORD_SCHEMA`
  and `DIFFICULTIES` — the same schema `importHistory` validates against —
  so the card, the validator, and the writer cannot drift apart.

Hosting: public GitHub repo `ernop/minesweeper-friendly`; GitHub Pages serves
the playable game from the master branch root at
https://ernop.github.io/minesweeper-friendly/ and redeploys on every push.

## Local tooling and verification (this machine, learned 2026-08-19)

- Serving: `python3 -m http.server 8018` is the canonical local server
  (README). Other ports (8000; 8099 for throwaway tests) have been used in
  agent sessions. localStorage is per-origin, so EACH PORT HAS ITS OWN PLAY
  HISTORY — never test imports or synthetic renders against the origin the
  player actually uses; use a fresh port instead.
- No headless browser exists here: no chromium / google-chrome /
  headless_shell, and `/usr/bin/firefox` is an uninstalled snap stub that
  only prints "snap install firefox". Visual verification needs the Cursor
  IDE browser (MCP server `cursor-ide-browser`), which is registered only
  while an IDE browser tab exists — it can appear and disappear
  mid-session, so check availability before planning around it.
- Running game code without a browser: load `minesweeper.js` in Node via
  `vm.runInThisContext`, not `eval` (the file's 'use strict' makes eval
  declarations local, so nothing would be defined). Required shims:
  `document` with `getElementById` (memoize one stub element per id),
  `createElement`/`createElementNS`, `querySelectorAll`,
  `documentElement.style.setProperty`, `addEventListener`; stub elements
  with textContent/innerHTML/hidden/value/dataset, `style.setProperty`,
  `setAttribute`, `addEventListener`, `appendChild`/`append`,
  `querySelector`/`querySelectorAll` (must return 3 elements — `setLcd`
  iterates 3 digit svgs), `classList`, `requestSubmit`; globals
  `localStorage`, `navigator.clipboard.writeText`,
  `URL.createObjectURL`/`revokeObjectURL`, `performance.now`. This ran the
  real `importHistory` end-to-end for the 2026-08-19 legacy-history
  conversion (import + dedupe-on-reimport both verified).
- Quick checks: `node --check minesweeper.js` for JS syntax; a small
  python3 `html.parser` walker for tag balance in `index.html` (void tags:
  meta, link, input, br, hr, img). Node v22 is installed and fine for
  one-shot data conversion scripts.
- Deploys: `gh` CLI is installed and authenticated. Every push to master
  triggers the "pages build and deployment" workflow; `gh run list` /
  `gh run watch <id> --exit-status` confirm it, and the live site can be
  spot-checked with `curl https://ernop.github.io/minesweeper-friendly/...`.

Promotion: `promo/PROMO.md` is the promotional page — player-facing pitch
only, nothing technical — with `promo/win-screen-2026-08-19.png` as its hero
image. Keep it free of implementation detail.
`promo/win-screen-2026-08-19-full-layout.png` (current layout: stats beside
the board, charts below) is the README's screenshot.

Not yet implemented: NG/friendly modes.

## Reference material

- `reference/minesweeper-online-ng-medium-2026-08-19.png` — minesweeper.online
  NG mode (Medium), showing the given starting position (green X) and
  difficulty tabs Easy/Medium/Hard/Evil.
- Pattern catalog: https://minesweeper.online/help/patterns
- Gameplay/3BV/NG help: https://minesweeper.online/help/gameplay
- Kaboom design writeup: https://pwmarcz.pl/blog/kaboom/
- Probabilistic solver: https://github.com/mrgriscom/minesweepr

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

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
`python3 -m http.server 8018`. Covers: Beginner/Intermediate/Expert/Custom
tabs, first-click safety (mines placed on first reveal), flood fill, flags,
left-click chording with press preview, seven-segment LCD counters, smiley
face states, classic loss/win rendering (red hit cell, crossed wrong flags,
auto-flag on win), 3BV/efficiency stats line, zoom control, space-bar restart.
All icons are inline SVG. The status button is a dove (peace symbol) with
four states: idle, startled flap while pressing, olive branch on win, broken
heart on loss. Score history: all wins stored per mode in localStorage
(`minesweeper-friendly.scores.v1`) with date/time/3BV/3BV/s/clicks/efficiency/
mouse path (`pathPx`: cursor distance in px accumulated on document mousemove
only while `gameState === 'playing'`);
after each win the result panel shows ranked-list columns (windowed via
`windowBounds`, 11 rows max: 5 either side, top-anchored when 1st place is
within the 5 above; own score bolded) for windows built by `rankWindows`:
Earned detail: a list renders its full window only when the placement is
top-10 or within 10% of the best entry's value (`nearTop`, metric per list
type: time, bucket avg time, streak length); otherwise it collapses to the
heading plus the player's own row (see `buildRankList`).
lifetime, "in <year>" (calendar year), "in the last year" (rolling 365 days
from end of the day 365 days prior), "this month" (calendar), "past week"
(midnight 6 days back), "today" (last local midnight), then rolling hour /
15 min / 5 min / 1 min. Timestamps are epoch ms; all calendar boundaries and
day categories resolve in the viewer's local timezone. Plus day categories: today's weekday,
weekend-or-weekday, and US federal holidays (rule-based, `isHoliday`) when
today is one. Progressive disclosure: each window/category column carries a
`specificity` rank (narrow windows lowest, then day categories, then broad
windows); when several columns contain the exact same score set only the
most specific renders, so a new player sees one chart and broader ones
appear as history spreads across hours/days/weekdays.
Rankaverage charts (`RANKAVERAGE_SPECS`) group wins by efficiency / clicks /
3BV / 3BV/s (2-decimal buckets) / mouse path (100px buckets) / mouse speed
(10px/s buckets; both use `has` to filter pre-pathPx wins) and rank the
groups by average solve time; each row shows
rank, value, avg time, and x-count, and each chart carries an
`avgDeltaCaption`: this win's effect on its group's average (green improved /
red worsened / gray unchanged / blue first). There are no separate rankcount
charts; the x-count column covers that. The stats line is a label/value
grid (`#stats-grid`) and includes derived mouse metrics: speed (px/s),
path per click, path per 3BV. At the very bottom, three inline-SVG scatter
plots (`buildScatter`, after a `.flex-break`) show relationships across all
path-recorded wins, this game's dot highlighted red: mouse speed vs time,
path/click vs efficiency, path/3BV vs time. Both axes carry 1/2/5-step
tick labels with gridlines (`niceTicks`); units go in a caption below. Streak lists: losses are stored as bare
timestamps per mode (`minesweeper-friendly.losses.v1`, written by
`recordLoss`) purely to split win runs; a k-loss streak joins k+1 adjacent
runs (k = 0/1/2 for streak / near-streak / near-near-streak), ranked by
length then recency, current streak highlighted. Windows are trimmed to
their nonempty core, deduped, and dropped when strictly inside a wider
core — consecutive losses leave empty runs whose padded windows would
otherwise re-list sub-streaks (the double-counting bug). Overlapping
windows that span different losses are distinct streaks and both stay. Export blobs are
`{ wins, losses }`; import also accepts the older bare wins map, deduping
losses by timestamp.
Rows show relative age (`relativeAge`: abbreviated s/m/h/d/w/
mo/y, no "ago" suffix; a 0-second age renders as a left-aligned "just now"
spanning the age columns), color-coded per unit via
`.age-u-*` classes (s hyper-fluorescent green #39ff14, then the board-number
palette: m green, h blue, d red, w navy, mo maroon, y teal); the me-row
overrides to black on its highlight for readability. The results area uses
the same chunky Arial Black face as the in-game numerals. Losses are shown but not recorded.
Layout: `#results` (win summary + stats grid only) is absolutely positioned
off `#game-area` (left: 100%, 320px wide) so it appears to the right of the
board and never occupies layout space — the board must never move when
results appear/disappear; `html { scrollbar-gutter: stable }` keeps the
scrollbar from nudging the centered board either. `#result-ranks` (rank
charts, rankaverages, streaks) sits below the board in normal flow.

Backup: `#backup` controls export the score history as a JSON blob
(clipboard via `copyToClipboard` with execCommand fallback, or Blob-URL file
download) and import via paste or file. `importScores` merges with dedup
keyed on `at`/`timeMs` pairs per mode, so repeat imports are no-ops.

Hosting: public GitHub repo `ernop/minesweeper-friendly`; GitHub Pages serves
the playable game from the master branch root at
https://ernop.github.io/minesweeper-friendly/ and redeploys on every push.
Default difficulty is Beginner.

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

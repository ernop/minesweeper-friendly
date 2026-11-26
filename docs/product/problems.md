# Minesweeper problems

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/problems.md](../implementation/problems.md). Training context: [training.md](training.md#companion-drills-and-planned-extensions).

## Goal and hosting

Provide fast, repeatable timed drills (`problems.html`, opened from `problems` in the game footer; ships as a subpage of `https://minesweeper-friendly.fuseki.net/problems.html` with `pages-redirect.js`) that measure pattern recognition, 1.5-click execution, and pure pointing speed against stronger players across skill bands. Keeps fixed classic board icons (`100%` classic numbers, flags, and mines) so cross-session comparisons stay invariant.

## Pattern problems (`problems-v2`)

Each problem is a real Expert replay moment immediately before a revealed number makes `1–4` covered squares provably safe.

- **Bank (`saolei-3498-20260927`):** `4` classes × `40` problems, calibrated against `3,498` corpus games. Every problem's answer set is verified by the full solver and rejects positions where the new number enables a harder deduction outside its class.
- **Situation classes:** `one number at a time` (repeated single-number counting) and pairwise difference families with `>= 10` fresh corpus moves at every ladder skill level (`1-1 rule`, `1-1 rule at the edge`, `1-2 rule`).
- **Frozen protocol (`problems-v2`; any procedural change requires a new protocol id, enforced by `tests/problems-core-test.js`):**
  1. Board shows covered squares, a start-square ring (dot at the original player's cursor), and an orange **focus box** around the start square and all answer squares (+1 square border, clipped to board). Earlier `problems-v1` attempts (lacking the focus box) remain in history but stay excluded from `problems-v2` ladders.
  2. Hovering the start square reveals the pre-click board; leaving re-covers it and resets the timer.
  3. After a fixed `1 s` preview (matching in-game local familiarity without unlimited pre-study), the start square opens automatically; time zero is the paint frame drawing the new number.
  4. The player opens every safe answer square using standard reveal, flag-on-press, and single/both-button chord controls (`1.5`-click supported).
  5. Ends on all safe answer squares open (`solved`), mine hit (`mine`), `20 s` (`timeout`), `Esc` (`abandoned`), or tab hide/blur (`interrupted`).
- **Derived measures (computed on display, never stored):**
  - **First answer:** first click aiming at an answer square (reveal, chord into one, or flag an answer mine; incidental flood openings do not count).
  - **Thinking:** time zero until cursor moves `>= 0.25` square, plus dwell on the first answered square before clicking (matching corpus replay split).
  - **Moving:** travel time between those two parts; **Total:** time until last safe answer square opens; **Extra clicks:** non-answer board-changing clicks.
- **Sets and vertical ladders:** a set runs `20` problems (`5` one-number + `15` pattern, least-attempted first, randomized) at saved square size (`16–32 px`). Each rule displays a vertical fastest-on-top green-to-red **ladder** placing corpus skill levels (`3.5+ 3BV/s`, etc.; levels with `< 10` moves listed below as `"Too few games yet"`) alongside `"You"` in `--this-game` light blue (and `"Original player"` in italic on per-problem results when they answered on their next click). Home shows one ladder per rule side by side plus the latest `30` attempts.

## Last-flag drill (`last-flag-v1`)

Practices replacing the common wasted `chord-short-of-flags → flag → chord` sequence with a single `1.5`-click motion.

- **Positions:** `60` fast-game corpus moments where a player flagged a mine and immediately chorded the completed number (`1` flag short, missing mine provable, `>= 2` safe squares to open so chording beats direct clicking).
- **Run:** `10` least-practiced positions per drill. Resting cursor on the start ring shows the board on the next frame (time zero) with a focus box around the number; opening its safe squares via any method finishes (`10 s` timeout; mine ends the position).
- **Result:** reports completion time, clicks, whether a both-button chord (`1.5` click, `gesture: true`) was used, and the original player's time.

## Pointing test (`pointing-v1`)

Measures hand speed and click accuracy without deduction.

- **Frozen route (`tests/problems-core-test.js`):** from `(15, 8)`, `24` fixed moves of `2–13` squares (`9` of `2–4`, `9` of `4–8`, `6` of `8+`) in all directions, invariant across years.
- **Run:** click start square to begin; each target lights blue on the animation frame after the previous press (mouse down on target counts; presses elsewhere count as misses; `Esc` stops; hide/blur interrupts).
- **Measures & display:** per-target movement time, reaction/travel/hover split, center offset, misses; run-level medians by distance band, Fitts regression against $\log_2(\text{distance} + 1)$, throughput (bits/s), total misses, and press spread. Displays time/target, throughput, misses, and distance-band ladders against corpus travel medians. Once complete runs exist at `>= 2` square sizes, adds a per-size comparison table on the home card.

## Storage, backup, and archive

- **Separate database (`minesweeper-problems`):** stores `attempts`, `drillAttempts`, and `pointingRuns` (each keyed by `startedAt`), independent of the game page's database version. Loading validates every record and fails visibly if malformed. Attempts keep matching their problem id across bank rebuilds.
- **Backup & archive:** exports/imports `{ format: "minesweeper-problems-attempts", formatVersion: 3, exportedAt, attempts, pointingRuns, drillAttempts }` merged by `startedAt`. Every stored item automatically syncs to the user's [archive folder](storage-and-history.md#archive-folder) on the next sync from the game, settings, or self-check page.
- **Unbuilt upgrades:** tracked in [BACKLOG.md](../../BACKLOG.md#training-coaching-and-mind-map) (off-answer exact judgment, adaptive scheduling, mine-answer/edge classes, own-game drills, and direct archive sync from `problems.html`).

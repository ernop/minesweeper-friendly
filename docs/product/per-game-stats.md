# Per-game stats

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/per-game-stats.md](../implementation/per-game-stats.md), [docs/implementation/board-metrics.md](../implementation/board-metrics.md).

## Goal and display principles

- **Store primary facts once; derive everything else at read time.** Ratios, rates, and shares compute from stored primary counts and timing so unit updates and catalog refinements apply retroactively across old and new records without migrations.
- **One catalog everywhere:** every measurement's name, definition, format, and formula live once in `GameData.metrics` ([Measurement catalog](measurement-catalog.md)). Regular wins display performance in [Game data](game-data.md); losses and trials display the `this game` label/value table under the board ([Results](results.md)). Completion-dependent metrics (`3BV/s`, `efficiency`, `IOE`, `path / 3BV`, etc.) never compute on unfinished losses.
- **Absence means `"not measured"`:** fields added on later dates are omitted on earlier records, valid on import, excluded from averages and comparison pools, and never coerced to `0`.

## Schema-boundary dates

Dates below mark when each stored field joined or changed semantics in saved history:

| Date | Field(s) / version | Scope / change |
| --- | --- | --- |
| `2026-08-19` | `noOpClicks`, `flagsPlaced` | Added (`noOpClicks` named `wastedClicks` and `boardChangingClicks` named `clicks` until `2026-10-27`). |
| `2026-08-20` | `flagsRemoved`, `guardianAngel`, `guardianAngelEnabled`, `states` | Added (`guardianAngel*` named `justice*` until `2026-11-23`). |
| `2026-08-21` | `boardShape`, guess ledger (`oddsVersion`), `givenOpening` | Added; pre-boundary trials were all given an opening. |
| `2026-08-22` | `musicPlaying` | Added (local canonical origin only). |
| `2026-08-23` | `misclicks`, `actionEvaluations`, `justiceSaves` | Added (`justiceSaves` written only part of that day; accepted on read, never written or shown). |
| `2026-08-30` | `zini`, `hzini`, `chordClicks`, `cadenceSpread` | Added (`cadenceSpread` stored unrounded from `2026-10-26`). |
| `2026-09-21` | `boardMetrics` (`workSpread`, `safeCells`, `zeroOpenedZeroOneCells`, `zeroOpenedCells`) | Added (`zeroOpenedZeroOneCells` excludes covered 1s; older `zeroOneCells` is never mixed in). |
| `2026-09-27` | `firstRevealIndex`, `timeZone`, `utcOffsetMin` | Added. |
| `2026-10-14` | `flagsBlocked` | Added (daily-limit no-flags penalty). |
| `2026-10-20` | `moveHabits` (`movesMovedOn`, `movesLeftHardWork`, `movesLeftEasyWork`, `moveGapMedianMs`, `forkMoves`, `forkMovesToNearestArea`) | Added (`movesMovedOn` named `movesRanOut` until `2026-10-27`; older games backfill on restore). |
| `2026-10-26` | `fastclickGapMs`, `fastclickGapVersion: "planned-pairs-v1"` | Redefined from `<= 1 s` gaps to planned pairs; unversioned earlier values are deleted on load and ignored. |
| `2026-10-27` | `mousePathPx` (trace-sourced, unrounded), `givenOpeningBv3` | Unified with live perf charts; older records keep page-counted `mousePathPx`. |
| `2026-11-02` | `oddsVersion: "guess-ledger-v3"`, unlimited solver | Exact layout counting with no work limit; pre-boundary `v1`/`v2` records keep their versioned values. |
| `2026-11-24` | `flagChordGapMs` | Added (planned short-range `flag → chord` median ms). |

## Core counters and derived metrics

- **Primary stored counters:** end timestamp, outcome, `timeMs` (displayed in seconds to 3 decimals), `bv3`, `boardChangingClicks` (reveals, flags, accepted chords), `noOpClicks` (unsatisfied/empty/covered chords, left-click on flag, solo right press on revealed cell; a both-button chord counts as one click), `chordClicks`, `flagsPlaced` (removals do not subtract), `flagsRemoved` (stored separately from no-ops because both are board-changing events), `misclicks`, `mousePathPx`, and `actionEvaluations`.
- **Wins-only derived metrics:**
  - `3BV/s` = `3BV / time_s` (3 decimals).
  - `clicks over 3BV` = `boardChangingClicks − 3BV`.
  - `efficiency` = `100 × 3BV / boardChangingClicks` (replaces duplicate `throughput`).
  - `IOE` = `3BV / (boardChangingClicks + noOpClicks)`.
  - `ZiNi efficiency` = `100 × zini / boardChangingClicks`; `HZiNi efficiency` = `100 × hzini / boardChangingClicks` (may exceed `100%` when beating the greedy benchmark).
  - `IOS` = `log(3BV) / log(time_s)` (blank when `time_s <= 1`, matching minesweeper.online).
  - `STNB` = `C / (time_s^1.7 / 3BV)` with community constants `47.299` (Beginner), `153.73` (Intermediate), `435.001` (Expert); exact standard shapes only, never Endgame drills.
  - `unflagged mine share` = `(mines − flagsPlaced + flagsRemoved) / mines` (every standing flag at a win sits on a mine; `100%` on markless wins; unmeasured on losses, Endgame drills, and pre-counter records).
  - `path / 3BV` = `mousePathPx / 3BV`.
- **All-outcome derived metrics:**
  - `board-changing click share` = `boardChangingClicks / (boardChangingClicks + noOpClicks)` (never called `"correctness"` because wrong flags and fatal reveals still change the board).
  - `chord share` = `chordClicks / boardChangingClicks`.
  - `click rate` (`/s`), `no-op rate` (`/s`), `misclick rate` (`/min`), `flag rate` (`/s`), `flag-removal rate` (`/min`), `mouse speed` (`px/s`), `path / click`.
- **Markless status (`(m)`):** when `flagsPlaced === 0`, the stats table reads `"0 - markless"` and individual win times carry an olive `(m)` prefix (average-time dots do not). Pre-counter records never claim markless status. Post-game rankings for a no-mark win filter to no-mark games of the same key ([Rank tables](rankings.md#no-mark-wins)).
- **Trials with a given opening (`givenOpeningBv3`):** 3BV-based performance metrics subtract `givenOpeningBv3` from board 3BV; board traits keep full board 3BV; `ZiNi` and `HZiNi` efficiency are omitted. Pre-`2026-10-27` trials populate `givenOpeningBv3` from their trace on restore and omit 3BV performance metrics until then.

## Board benchmarks and backfill

All board benchmarks describe the **final mine layout** (after any Guardian Angel redraw) and are omitted on Endgame drills (whose remnant does not represent a full board).

- **ZiNi / HZiNi:** exact deterministic greedy flag-and-chord click benchmarks (`zini.js`), **not** a proven global minimum ($C_0^*$; see [reference/board-metric-definitions.md](../../reference/board-metric-definitions.md#9-fixed-opening-first-benchmark-and-exact-opening-first-minimum)).
  - **HZiNi procedure:** starting from known mines and no flags, open every zero component once (including numbered borders), then repeatedly pick the exposed positive clue maximizing `covered safe neighbors − unflagged mine neighbors − 1 >= 0` (column-major top-to-bottom, left-to-right tie break), flag its unflagged mines, and chord once; otherwise directly reveal the next covered safe cell. Every reveal, flag, and chord counts as 1.
- **3BV spread (`workSpread`):** RMS distance (in cell spacings) of 3BV work points from their centroid (weight 1 per independent safe cell and per zero component's centroid). Stored unrounded; comparison tables bucket to nearest `0.5` cell, halfway upward (`round(2 × v) / 2`), naming the half-open interval (e.g., `2.25–2.75 cells`, clipped at `0`).
- **0–1 share (`zeroOpenedZeroOneCells / safeCells`):** open every zero and nothing else, then count only revealed `0`s and `1`s divided by all safe cells (excludes covered `1`s and clues `>= 2`; cannot exceed zero-opening coverage; `0%` with no zeros, `100%` with no mines). Earlier `zeroOneCells` (which included covered `1`s) never enters `0–1 share` comparisons.
- **Zero-opening coverage (`zeroOpenedCells / safeCells`):** union of all zero floods including numbered borders, divided by all safe cells. Both share tables bucket to the nearest whole percentage point via exact integer arithmetic `floor((200 × num + den) / (2 × den))` (halfway upward) to avoid floating-point tie error.
- **Board shape (`boardShape`):** `maxAdjacent`, `hasSeven`, `zeroCount`, `islandCount` (8-connected mine components, diagonals included, no wrap), and `largestIsland` (mine count in largest component).
- **Worker backfill (`Backfill saved wins`):** runs manually one board at a time in `board-metrics-worker.js`, amending records in place and saving each immediately. Availability derives from an IndexedDB index of saved final boards matched by mode and cell count (missing traces never enter the queue; no permanent skip flags, so restoring a trace re-enables backfill). `Stop backfill` lets the current board finish; `Resume backfill` appears only after an explicit stop in the same session. Errors stay visible and retryable; the progress panel hides once no attemptable work remains (controlled by `boardMetricFacts`).

## Timing, cursor, and movement stats

- **Cadence spread (`cadenceSpread`):** `IQR / median` of all recorded press gaps (left downs and right flag triggers, no-ops included; requires `>= 2` gaps). Robust to outlier pauses; recomputed from trace on result restore when changed.
- **Mouse path (`mousePathPx`):** unrounded pixel travel from the input trace while the game clock ran (start to stop or last action, whichever is later), counting every cursor observation including co-timestamped events. Matches live perf charts and motion stats identically. Pre-`2026-10-27` records retain their page-counted path because their traces dropped co-timestamped observations.
- **Fastclick gap (`fastclickGapMs`, `planned-pairs-v1`):** median press-to-press milliseconds of **planned pairs** — two consecutive board-changing clicks that the player could decide together, isolating finger/hand speed from sequential reading. Two clicks qualify when all four rules hold:
  1. *Proven together:* every square opened or flagged by either click was already proven (safe or mine) before the first click, so click 2 needed no new information from click 1.
  2. *Touching:* click 2's square (for a chord, its number) is one of click 1's 8 neighbors, keeping travel nearly constant.
  3. *One motion:* no other press occurred between them (including no-ops), and if click 1 opened squares, no `>= 100 ms` gap occurred without a cursor observation before press 2. Flags reveal nothing, so resting after a flag is allowed (covering the 1.5-click).
  4. *No flag removals:* neither click removes a flag.
  - Timed press-to-press (right press for flag, left press for reveal/chord, first button down for two-button chord), with no upper time cap. Absent if the game had no planned pair (never fabricated). Unversioned pre-`2026-10-26` values are ignored by the catalog, purged on load/import, and recomputed from traces when old results are opened.
- **Flag→chord gap (`flagChordGapMs`):** median press-to-press milliseconds of short-range planned `flag-place → chord` pairs in flagged games (`flagsPlaced > 0 && !flagsBlocked`): a flag followed immediately by a chord within Chebyshev distance `<= 2`, no intervening press, with the flagged mine and all chord-opened squares already proven before the flag. Covers single-click, two-button, and 1.5-click chords.
- **Move habits (`moveHabits`):** counts how the player transitions between work areas across wins and losses (a *move* is a board-changing click `>= 3` squares from everything the previous board-changing click opened/marked and from proven-safe squares within 2 squares of those; [Live perf charts](during-game.md#events-and-move-characterization)):
  - `movesMovedOn` (local proven-safe work ran out);
  - `movesLeftHardWork` (local proven-safe squares remained, none provable by single-number counting);
  - `movesLeftEasyWork` (at least one local proven-safe square was provable by single-number counting);
  - `moveGapMedianMs` (median gap before a move; absent if no moves);
  - `forkMoves` (moves while proven-safe squares existed in `>= 2` separate areas, merging squares `<= 2` apart) and `forkMovesToNearestArea` (forks entering the area holding the nearest proven-safe square).
  - Each kind is stored separately; games saved before `2026-10-20` (or pre-`2026-11-02` work-limited games) compute them when next restored.

## Action accuracy, misclicks, and guess ledger

- **Misclicks (`misclicks`):** board-changing actions contradicted by facts provable from the visible board at click time (opening a proven mine, flagging a proven-safe cell, unflagging a proven mine, or chording against a visible contradiction). Operational visible-state count independent of outcome; counted at game end in the reports worker.
- **Likely physical misclick deaths:** separate post-hoc inference that never replaces the fatal action's technical class or `misclicks` count. Qualifies as `likely-misclick-after-wrong-flag` when a still-standing flag on an actually safe cell was placed strictly `< 1,000 ms` (input-event time to input-event time) before the fatal action and `1` square away (orthogonally or diagonally). A second reason (`wrong-button`) is derived from the saved ledger ([Game-end evaluation](game-end-evaluation.md#loss-types)).
- **Action evaluations (`actionEvaluations`):** sole canonical store of mistakes and deaths (visible board snapshots omit hidden mines; no-op clicks omit board snapshots). Legacy `stupidDeath`, `deathKind`, `deathRisk`, and `deathBestRisk` are import-only, normalized immediately into legacy-provenance evaluations and deleted; runtime code never reads them.
- **Guardian Angel (`guardianAngel`, `guardianAngelEnabled`):** counts every qualifying entry guaranteed safe whether or not mines moved (strict player-POV rule: hidden redraw counts like historical `justiceSaves` are never recorded or displayed). Stats row reads `"Guardian Angel interventions"`. `guardianAngelEnabled` freezes the setting at first reveal.
- **Guess ledger (`guesses`, `guessIdealRisk`, `guessNonideal`, `guessPerfect`, `lifeLost`, `lifeNeedless`, `oddsVersion`):** scores every bare non-first reveal whose remaining-layout mine probability is `> 0` (never chords; never Angelic, where guesses cannot kill). Computed at game end in the reports worker via exact frontier dynamic programming with no work limit (`guess-ledger-v3`), comparing exact layout-count ratios with zero rounding tolerance (verified against brute-force layout enumeration tests):
  - **Life lost:** sum of raw mine probability `p` across guesses (including guesses protected by Guardian Angel).
  - **Life needless:** sum of `p(chosen) − p(best)`.
  - **Ideal-risk:** whether `p(chosen) === p(best)`.
  - **One-move life (`guessPerfect`):** `(1 − p_die) × (1 − E[min next risk])` weighed by consistent whole-board layouts for each possible revealed number, compared across all covered squares including proven-safe ones (under Guardian Angel, `p_die = 0` for this score while raw `p` stays on `lifeLost`). Pre-`2026-11-02` `v1`/`v2` records keep their versioned values.
  - A scoring error is a bug: judgment halts, the error bar displays it, and the game stays pending for retry on next load. Guess-odds risk chips beside the board remain withheld (only the Guardian Angel intervention count chip appears beside the board; [Guardian Angel](guardian-angel.md)).

## Reproducibility and play context

- **Reproducibility:** every board receives a cryptographic 128-bit `seed` expanded by `xoshiro128ss-v1` (`rngVersion`, `boardVersion`, `guardianAngelVersion`, and `firstRevealIndex` on non-drill boards). Together with board mode, these reproduce the initial board; reproducing later Guardian Angel redraws also requires replaying the input trace under the recorded `guardianAngelVersion`.
- **Time zone:** `timeZone` (IANA name) and `utcOffsetMin` at `endedAt` preserve true local time of day across travel and timezone database updates.
- **Player states (`states`):** list of active tag IDs at finish (empty list when none; stats table shows a `States` row only when non-empty; [Player states](player-states.md)).
- **Daily-limit flag block (`flagsBlocked`):** set when a daily limit's no-flags penalty deals a flagless board; stats table shows `Flags: blocked by a daily limit` ([Daily play limits](play-limits.md)).
- **Music playing (`musicPlaying`):** local-only boolean on `http://127.0.0.1:8018` (never contacted on hosted or test origins so visitors never receive local-network permission prompts and CSP forbids it). Polls `localhost/api/is-music-playing` every `15 s` plus on deal (backend checks active non-TTS PipeWire stream with live monitor signal above `-60 dBFS`, cached up to 1 min). Stored as `true` if any poll during play heard audio, `false` if all heard silence, omitted if unreachable; HTTP/malformed answers clear live state and surface in the error bar. Displayed live as a rounded sand pill (`"music on"` / `"music off"`) beside player state tags in the top bar ([UI doctrine](ui-doctrine.md)) and in the stats table (`playing` / `none`). Deliberately boolean — never records stream or song titles.

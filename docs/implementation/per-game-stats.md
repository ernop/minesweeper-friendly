# Per-game stats and counters — implementation notes

Spec: [docs/product/per-game-stats.md](../product/per-game-stats.md). Index: [AGENTS.md](../../AGENTS.md).

- Derived metrics (3BV/s, efficiency %, board-changing click share %, IOS,
  mouse speed, path/click, path/3BV) are computed at read time by the
  `value` functions of `GameData.metrics` in `game-data.js`, never stored.
  Board-changing click share (id `boardChangingClickShare` since
  2026-10-26; `correctness`, its name until 2026-10-15, before)
  needs `noOpClicks` (absent = unmeasured). Efficiency and IOS are
  wins-only; IOS is also blank when time ≤ 1s. Every one that divides 3BV
  reads `solvedBv3Of(record)`: `bv3`, less `givenOpeningBv3` on a trial
  game given an opening (`hadGivenOpening`), undefined there until that is
  measured; `ziniEfficiencyOf` and `hziniEfficiencyOf` are undefined on such
  games.
- Flagger metrics (2026-08-30, [Per-game stats](../product/per-game-stats.md)): `zini.js`
  (`Zini` global / CommonJS) ports the community Rust reference's greedy
  ZiNi and human ZiNi; `reportResult` stores `zini`/`hzini` (except in
  Endgame drill) and `chordClicks` (incremented only in `chord`'s accepted
  path). Derived read-time: `ioeOf` (bv3/clicks, wins), `chordShareOf`
  (chordClicks/clicks), `zniEfficiencyOf` (zini/clicks, wins), `stnbOf`
  (`STNB_CONSTANTS` on exact standard shapes, wins, never on drills).
  `node tests/zini-test.js` (hand-simulated small boards + 3BV-bound
  invariants on random boards). Per-game `cadenceSpread` = the trace
  cadence system's gap spread ratio, stored on wins and losses by the
  reports worker's `finished-game` (`finishedMeasurements` with
  `needCadence`, `metrics.cad.gapSpreadRatio`), unrounded since 2026-10-26
  (`toFixed(3)` before). The restore path (`preferences-game.js`) asks for
  it every time (`needCadence: true`; the worker already runs the trace
  metrics for the restored charts) and saves the record only when a
  measured value differs from the stored one; drives a stats row, the cadence-over-date
  relationship scatter, game data, and the live perf charts' row (until
  2026-10-20 also the left panel's session series).
- Fastclick gap: `fastclickGapVersion` and `fastclickGapMs` come from
  `DuringGame.fastclickGap` on the during-the-game model's planned pairs in
  the reports worker (`finishedMeasurements` with the plan's
  `needFastclickGap`), which `reportResult` asks for in `finished-game` and
  assigns before the record's second save, as move habits are
  ([Live perf charts](during-game.md), "Model"). The restore path
  (`preferences-game.js`) asks for them when a record's
  `fastclickGapVersion` is not `GameData.FASTCLICK_GAP_VERSION` and
  deletes the earlier definition's `fastclickGapMs` before assigning them.
  The catalog's `value` reads `fastclickGapMs` only beside the current
  version. `normalizeGameRecord` (`game/history.js`) deletes a
  `fastclickGapMs` without `fastclickGapVersion` on load and import. That
  block is step 1 of 2; step 2 deletes it and its test
  ([BACKLOG.md](../../BACKLOG.md), "Fastclick gap: planned pairs"). Before 2026-10-26 `reportResult` stored the earlier definition's
  median, from `DuringGame.fastclickGaps` on the trace that day and before
  that from `recordUsefulPress`'s wall-clock press and cursor times during
  play ([measurement catalog](measurement-catalog.md)).
- Move habits (2026-10-20): `movesMovedOn` (`movesRanOut` until
  2026-10-27), `movesLeftHardWork`,
  `movesLeftEasyWork`, `moveGapMedianMs`, `forkMoves`, and
  `forkMovesToNearestArea` come from `DuringGame.moveHabits` on the
  during-the-game model in the reports worker (`finishedMeasurements` with
  the plan's `needMoveHabits`; see
  [Live perf charts](during-game.md), "Model"). `reportResult` asks for them
  in `finished-game` and assigns them before the record's second save; the
  restore path asks when the record lacks `movesMovedOn`. Schema rows in
  `GAME_RECORD_SCHEMA` (`isCount` for the counts). Game data reads them in
  `timeBeforeMove` (`moveTime` until 2026-10-26), `easyWorkLeftShare` (left easy work over the three kinds'
  sum), and `nearestAreaShare`; `GameData.examples` gives their boards
  (`moves`, `easyWorkLeft`, `forks`). `tests/during-game-test.js` and
  `tests/game-data-test.js` cover them.
- `mousePathPx` (2026-10-27): `reportResult` stores
  `DuringGame.cursorTravelPx` of the live trace (samples, the observations
  they replaced from `liveMergedObservations`, events, and the record's
  time): the sum of `sampleTravelPx` (game/trace-metrics.js) over the
  samples on the game clock, the same `cursorPath` the live perf charts'
  path and mouse speed rows plot. Until then `game/controls.js` added each
  document mousemove's step while `gameState === 'playing'` and the record
  stored that sum rounded.
- Given-opening 3BV (2026-10-27): `reportResult` stores `givenOpeningBv3`
  on a trial game given an opening, `DuringGame.bv3SolvedBy` of the squares
  the opening left open (`trialPresentation.openedAtStart`), and carries it
  into the trial session's attempt. The restore path asks for it
  (`needGivenOpeningBv3`) when such a record lacks it; the worker's
  `finishedMeasurements` takes `DuringGame.bv3SolvedAtStart` of the trace's
  events, the open squares of the first decision's position.
- Unused correct marks: `activeFlagEpisodes` and `flagEpisodes` retain every
  player flag placement and removal until the outcome is known.
  `markChordFlagUsage` consumes neighboring episodes only for an accepted
  chord. On a win, `finishOpenFlagEpisodes(true)` retrospectively tags each
  unused correct placement with `unused-correct-flag`, adds its time-loss
  evidence to the report/trace, and increments stored `unusedCorrectFlags`.
  On a loss, the episodes are deliberately unmeasured and the record omits
  that field because later intended chord use is unknowable. This measures
  observable chord use, never mental use. The primary calibration (decided
  2026-08-30) is per mark placed, game data's unused flag share; its
  per-minute form is the optional unused flag rate (`perMinute` in
  game-data.js). A markless win is unmeasured (0 of 0). Until 2026-10-20 the
  session series also carried both to the left panel's charts.
- `boardChangingClicks` (the page counter and the record field; `clickCount`
  and `clicks` until 2026-10-27) counts only effective clicks; `noOpClicks`
  (`wastedClicks` until then) counts board
  clicks that changed nothing — the board mousedown/mouseup handlers
  (game/controls.js) count unavailable chords, left-clicks on flagged cells,
  both-button releases over unopened cells, and right presses on revealed
  cells that `settlePendingRightPress` finds unjoined at release. Stored on the record since
  2026-08-19; `GAME_RECORD_SCHEMA` accepts its absence (older records),
  and the wasted-clicks scatter filters to wins that carry it.
- `misclicks` counts board-changing actions contradicted by facts provable
  from the visible board at input time: reveal of a certain mine, placement
  on a proven safe, removal from a certain mine, or a chord whose opened set
  contains a certain mine / flagged set contains a proven safe. Since
  2026-11-03 `completeGameEvaluations` counts, at game end, the judged
  decisions carrying a `MISCLICK_MISTAKES` tag (game/evaluation.js), and
  `completeGameRecord` stores the count. Until then
  `Solver.isVisibleMisclick` classified each action in the board
  mousedown/mouseup handlers before acting. Stored since 2026-08-23; older
  records omit it. A fatal misclick also carries its tag in
  `actionEvaluations`.
- `annotateLikelyMisclickDeath` adds a non-exclusive retrospective inference
  to the fatal evaluation before `recordActionEvaluation`: among
  `activeFlagEpisodes`, a still-standing flag on an actual safe cell must
  have been placed 0–999ms earlier and touch the fatal reveal cell or chord
  center orthogonally/diagonally. It adds
  `likely-misclick-after-wrong-flag` plus `{flagCell,targetCell,gapMs}` evidence;
  it never replaces `lossKindOf`, increments the exact visible-state
  `misclicks` count, or qualifies removed/correct/distant flags. The gap is
  `latestBoardInput().atMs` (input-trace.js: the newest lup/rdown board
  event, the same clock `traceDecision` stamps evaluations with) minus the
  flag evaluation's `atMs`; the fatal evaluation's own `atMs` is still its
  build time at this point. `LIKELY_MISCLICK_MAX_MS` lives in the verdict
  (evaluation.js), shared with the ledger-read wrong-button reason
  (`wrongButtonEvidenceOf`).
- `scoreGuess` (odds.js) returns `expectedLife`, `bestExpectedLife`, and
  `bestExpectedCells` for every guess, and `completeReveal` stores
  them on every measured guess at game end (since 2026-11-02; until then
  only when the one-move model ran or a proven-safe open existed; until
  2026-11-03 `evaluateRevealAction` stored them at the click).
- `flagsPlaced` counts flag placements by the player (removals don't
  subtract). `isMarkless(record)` derives the markless status
  (flagsPlaced === 0); records from before the measurement have it
  undefined and never qualify. Same absence rules as noOpClicks.
  Display: the `.markless-time` class on a time cell draws a small
  olive-green "(m)" before the time via CSS `::before` — applied in
  `timeAgeRow` (every time-ranked list) and the stats table's Time row.
  A markless win's post-game pool is `noMarkComparison` in rankings.js
  ([No-mark wins](../product/rankings.md#no-mark-wins-decided-2026-10-14)).
- `flagsRemoved` counts flag removals by the player (both branches live in
  `toggleFlag`). It stays separate from no-op clicks because removal
  changed the board; its reason is not inferred. Same absence rules as
  noOpClicks (absent before 2026-08-20).
- Unflagged mine share (2026-10-10): `unflaggedMineShareOf(record, mines)`
  in game-data.js, (mines − flagsPlaced + flagsRemoved) ÷ mines on wins, 1
  for a markless win, undefined on losses, Endgame drills, and records
  without the counters. No clamp: `toggleFlag` is the only path that sets a
  flag in a recorded game (Board lab sets them directly and records
  nothing), and at a win every standing flag is on a mine. Its one
  definition serves the `unflaggedMineShare` GameData metric (params are
  the game's `config`; `step(params)` is one mine), the your-perf property
  chart (`steppedMetric('unflaggedMineShare', null, { percent: true })`,
  win-bound from the catalog), the stats grid's `measurementRow`, `checkWin`'s
  session ending (live counters plus `settings.playMode`), and
  `sessionBackfillFromHistory`. `tests/game-data-test.js` holds its known
  answers.
- Music state ([Music playing](../product/per-game-stats.md)): `sampleMusic` fetches
  `MUSIC_ENDPOINT` (http://localhost/api/is-music-playing — the resident
  ProjectLauncher at `~/proj/mybrowser/utilities/caddy/launcher/launcher.py`,
  proxied by Caddy from :80 to :8787, answering from PipeWire with a 60s
  cache and `Access-Control-Allow-Origin: *`: true = `pw-dump` shows a
  running output stream (speech-dispatcher excluded) AND a ~0.5s
  `pw-record` probe of the default sink's monitor has RMS ≥ -60 dBFS,
  because paused/idle web players can hold a running stream of silence).
  Local only (2026-09-26): `musicMeasured` (`location.origin ===
  MUSIC_ORIGIN`, `http://127.0.0.1:8018`) gates both the first sample and
  the interval, so every other origin never calls `fetch` on the endpoint;
  Chrome 142+ would otherwise ask public visitors for local-network access.
  `tests/music-local-only-test.js` pins this. `beginMusicSampling` (called
  from newGame beside beginTrace) resets `musicObservations` and, on the
  local origin, samples once; a top-level setInterval
  (`MUSIC_SAMPLE_EVERY_MS`, 15s) polls continuously there — not only
  during games — because `musicNow` also drives the live music state
  (`#music-state`, the first item of the play context line `#play-context`
  in `#top-right`, rendered by `renderMusicState`: "music on" or "music
  off", hidden while `musicNow` is null). A request with no answer (a
  network failure or the 3 s timeout) sets `musicNow` to null, so unknown
  never displays or records as silence. A non-OK status or an answer whose
  `is_music_playing` is not a boolean also sets it null and is raised from
  the promise `sampleMusic` returns, so the error bar shows it; until
  2026-10-21 one `.catch` swallowed all three alike.
  `tests/music-local-only-test.js` pins both paths. An answer is pushed onto
  `musicObservations` only while `tracing()` — it is at most seconds old,
  so it belongs to the board now in play; one landing after game end is
  display-only. `reportResult` writes `musicPlaying` (any-sample-true)
  only when at least one answer arrived during the game — a failed fetch
  (launcher down) sets `musicNow` null and produces no observation, the
  designed "not measured" state, not a hidden error.
- Guess ledger ([Guess ledger](../product/per-game-stats.md)), since
  2026-11-02 (`guess-ledger-v3`): `odds.js` counts every remaining layout
  exactly with Justice's counter (below) and scores a bare unproven click,
  with no work limit. `analyzeView(view, opts)` (`opts.structure`: a
  structure the caller already built under the default options, the live
  perf charts' guess facts) returns each number group's boxes and layouts
  by mine count, and for each covered square the layouts mining it
  (`mineLayouts`, BigInt; a proven mine's is every layout), `total`,
  `pMine`, `unproven`, and `provenSafeOpen`; it throws when no layout fits
  the visible numbers and the mine count. `Odds.ratio(num, den)` turns a
  ratio of BigInt counts into a double, cutting both to their top 1,000 bits
  past the double range, so a count past 10^308 still gives its exact ratio
  to double precision.
- Justice's counter (`justice.js`, "LAYOUT COUNTS", the method of
  JSMinesweeper's probability engine,
  [reference/jsminesweeper.md](../../reference/jsminesweeper.md)): covered
  squares beside exactly the same numbers form one box; a group's numbers
  are taken in breadth-first order; a state is the remaining need of each
  number open across that order, and partial layouts with equal states
  merge, their counts kept as BigInt polynomials by mine count
  (`countGroup`). Forward counts and backward completions give each box's
  mined tallies. Groups join each other and the sea by products of their
  rows by mine count and the sea's binomials (`multiplyCounts`,
  `chooseRange`). The work grows with how many numbers are open across the
  order, not with the layouts: `tests/justice-test.js` 10a counts 2^80 + 2
  layouts in one group of 160 squares in about 20 ms, where the listing it
  replaced stopped at its 2,000,000-visit limit. The problem is NP-complete
  in the worst case (Kaye 2000), and there is no limit: a position past
  reach would be slow, never answered with a missing or substituted value.
  On 3,955 positions of simulated Intermediate and Expert games the facts
  equal the listing's wherever it finished. On 1,736 positions of
  simulated Expert games `proveLevels` took a median 0.25 ms (the listing
  0.21 ms) and at most 3.7 ms (the listing 16.4 ms).
- One-move life (`lifeLayouts`, `expectedLife`; `guess-ledger-v3`): for an
  opened square X, life × total is the sum, over each number n X could
  show, of the layouts showing n less the fewest layouts mining any one
  square once n shows (none when some square is then proven safe or none
  is undecided). The groups X touches are recounted with X safe and its
  covered neighbors tracked, so the number X shows is one more counted
  quantity; the rest of the board enters through kernels cached per
  touched set (the far groups' and the sea's layouts by mine count, with
  variants for a tracked or an untracked sea square mined). Squares no
  group touches share one value per class (proven safe or sea, how many
  sea neighbors are tracked, which proven squares are around). While
  another proven-safe square is open, X's life is its survival layouts.
- `scoreGuess`: the best is the highest life over every covered square;
  squares are taken in increasing order of layouts mining them, and the
  scan stops once a square's survival, which bounds its life, falls below
  the best found. A square A just universe would protect is always scored,
  its life divided by its safe layouts, since it cannot die. `perfectPlay`
  compares products of BigInt counts exactly. On 832 Expert guesses of
  simulated games guessing the safest square, in Node on 2026-11-02: a
  median 0.6 ms, 99th percentile 5.0 ms, at most 15 ms a guess (the code
  it replaced: no odds at all for 176 of them). Since 2026-11-03 it runs
  at game end in the reports worker (`completeReveal`), never on the click
  (creator 2026-11-03: "we MUST not block the input thread"). It had stayed
  on the click from 2026-11-02 on the Node numbers; in Firefox that day a
  guess re-timed warm took a median 2.1 ms on Intermediate and 1.0 ms on
  Expert, and the page's first guess, run cold, 9 to 13 ms.
- Before 2026-11-02 (`guess-ledger-v2`, 2026-10-22) `odds.js` listed
  layouts on residual clue components (budget 22 vars / 250000 visits)
  plus a binomial sea; one-move hypothetical next positions capped their
  proof prepass at 80000 visits. Its lookahead weighed each number the
  clicked square could show by the whole-board layouts that show it
  (`restWeights[k]` per component). Before v2 it counted each layout of the
  group once, so the number distribution was wrong whenever the group's
  layouts held different mine counts, and a number only a ruled-out layout
  shows became a hypothetical position the proof rejects ("visible clues
  are inconsistent", justice.js). Once `noteGuess` stopped catching errors
  (2026-10-21), every guess into such a group threw before its reveal, so
  the square never opened; an Intermediate endgame hit it on 2026-10-22.
  `history.js` accepts all three versions on saved games (`ODDS_VERSIONS`).
  `tests/odds-test.js` compares every covered square's one-move life, and
  the best value, cells, and perfect-play verdict, with a brute-force
  listing on random small boards, counts past the double range, and keeps
  that endgame as a fixture.
  `completeReveal` scores each reveal after the first-click path that its
  board did not prove safe, from the board saved before the click, so the
  p is the player's information, not the post-mercy board. The
  `finished-game` job's `guessLedger` flag, `guessLedgerAppliesTo(playMode)`
  (game/play.js: standard, 3BV countdown, trial modes, endgame drill —
  modes where hidden mines really kill; angelic records nothing, its ledger
  fields stay absent, as they are on saved games of the removed
  proof-or-die), gates it. Until 2026-11-03 `noteGuess` scored the click in
  `revealCell` before Justice. Proven-safe clicks and clicks with
  p(mine) = 0 are not guesses. Every guess is measured; until 2026-11-02 an
  over-budget position returned `{measured: false}` and `oddsUnmeasured`
  omitted the whole ledger from that record — no invented odds. A thrown
  scoring error is not caught: it rejects the worker job, the error bar
  shows it (`analysisFailure`), and the game stays pending. Until
  2026-11-03 it left `revealCell` before the reveal; until 2026-10-21
  `noteGuess` caught it, wrote "guess odds failed" in the backup status
  line, and dropped the ledger, and `scoreGuess` caught a Justice
  certification error and scored the guess as if no square were protected,
  recording wrong protected risks without a word.
  `scoreGuess` stores absolute p (`lifeLost`), excess over min p
  (`lifeNeedless`), `idealRisk`, and one-move life, the expected
  remaining life after one guess (`perfectPlay`). A covered proven-safe cell makes min p 0, so any
  guess is fully needless. The per-guess risk chips that once showed
  these numbers beside the board were withheld on 2026-08-23 (creator
  request: reintroduce only with a proper explanation); the ledger
  itself is unchanged. `node tests/odds-test.js` includes a seeded
  brute-force parity section: on random small boards every consistent
  layout is enumerated and `analyzeView` probabilities must match it
  exactly.

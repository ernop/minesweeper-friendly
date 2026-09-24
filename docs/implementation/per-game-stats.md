# Per-game stats and counters — implementation notes

Spec: [docs/product/per-game-stats.md](../product/per-game-stats.md). Index: [AGENTS.md](../../AGENTS.md).

- Derived metrics (3BV/s, efficiency %, correctness %, throughput, IOS,
  mouse speed, path/click, path/3BV) are computed at read time via
  `secondsOf`/`bvPerSecond`/`efficiencyPercent`/`correctnessPercent`/
  `throughputOf`/`iosOf`, never stored. Correctness needs `wastedClicks`
  (absent = unmeasured). Throughput and IOS are wins-only; IOS is also
  blank when time ≤ 1s.
- Flagger metrics (2026-08-30, [Per-game stats](../product/per-game-stats.md)): `zini.js`
  (`Zini` global / CommonJS) ports the community Rust reference's greedy
  ZiNi and human ZiNi; `reportResult` stores `zini`/`hzini` (except in
  Endgame drill) and `chordClicks` (incremented only in `chord`'s accepted
  path). Derived read-time: `ioeOf` (bv3/clicks, wins), `chordShareOf`
  (chordClicks/clicks), `zniEfficiencyOf` (zini/clicks, wins), `stnbOf`
  (`STNB_CONSTANTS` on exact standard shapes, wins, never on drills).
  `node tests/zini-test.js` (hand-simulated small boards + 3BV-bound
  invariants on random boards). Per-game `cadenceSpread` = the trace
  cadence system's gap spread ratio, stored on wins and losses from
  `computeClickCadence` at report time; drives a stats row, the
  cadence-over-date relationship scatter, and the session series
  (`sessionGapSpread` over raw press gaps live; per-game basis medians
  stored spreads — backfilled spans have no raw gaps and stay
  unmeasured on the per-time basis).
- `mousePathPx`: cursor distance accumulated on document mousemove only
  while `gameState === 'playing'`.
- Unused correct marks: `activeFlagEpisodes` and `flagEpisodes` retain every
  player flag placement and removal until the outcome is known.
  `markChordFlagUsage` consumes neighboring episodes only for an accepted
  chord. On a win, `finishOpenFlagEpisodes(true)` retrospectively tags each
  unused correct placement with `unused-correct-flag`, adds its time-loss
  evidence to the report/trace, and increments stored `unusedCorrectFlags`.
  On a loss, the episodes are deliberately unmeasured and the record omits
  that field because later intended chord use is unknowable. The closed
  winning play span carries the total into win-only `/m` and `/game` session
  series. This measures observable chord use, never mental use.
  The primary calibration (decided 2026-08-30) is per mark placed:
  `sessionUnusedMarkShare(ev)` derives unusedMarks / flags from win events
  (live 'end' and backfilled 'game' alike), the series flows through every
  session aggregation as `unusedMarkShareFraction` mirroring
  `winUnmarkedFraction`, and the endings chart draws it as "percent of
  placed marks unused when winning". A markless win is unmeasured (0 of 0).
- `clickCount` counts only effective clicks; `wastedClicks` counts board
  clicks that changed nothing — `toggleFlag` and `chord` return whether
  they had an effect, and the mouseup/contextmenu handlers count the
  falses plus left-clicks on flagged cells. Stored on the record since
  2026-08-19; `GAME_RECORD_SCHEMA` accepts its absence (older records),
  and the wasted-clicks scatter filters to wins that carry it.
- `misclicks` counts board-changing actions contradicted by facts provable
  from the visible board at input time. `Solver.isVisibleMisclick` owns
  the pure classification: reveal of a certain mine, placement on a
  proven safe, removal from a certain mine, or a chord whose opened set
  contains a certain mine / flagged set contains a proven safe. The
  mouseup/contextmenu handlers classify and increment before acting so a
  fatal action reaches `reportResult`; `newGame` resets it. Stored since
  2026-08-23; older records omit it. A fatal misclick can also carry one
  or more tags in `actionEvaluations`; the count and evidence ledger are
  independent measurements.
- `annotateLikelyMisclickDeath` adds a non-exclusive retrospective inference
  to the fatal evaluation before `recordActionEvaluation`: among
  `activeFlagEpisodes`, a still-standing flag on an actual safe cell must
  have been placed 0–999ms earlier and touch the fatal reveal cell or chord
  center orthogonally/diagonally. It adds
  `likely-misclick-after-wrong-flag` plus `{flagCell,targetCell,gapMs}` evidence;
  it never replaces `sessionEndingKind`, increments the exact visible-state
  `misclicks` count, or qualifies removed/correct/distant flags.
- `flagsPlaced` counts flag placements by the player (removals don't
  subtract; the win auto-flagging in `checkWin` bypasses `toggleFlag` and
  is not counted). `isMarkless(record)` derives the markless status
  (flagsPlaced === 0); records from before the measurement have it
  undefined and never qualify. Same absence rules as wastedClicks.
  Display: the `.markless-time` class on a time cell draws a small
  olive-green "(m)" before the time via CSS `::before` — applied in
  `timeAgeRow` (every time-ranked list) and the stats table's Time row.
- `flagsRemoved` counts flag removals by the player (both branches live in
  `toggleFlag`). It stays separate from no-op clicks because removal
  changed the board; its reason is not inferred. Same absence rules as
  wastedClicks (absent before 2026-08-20).
- Music state ([Music playing](../product/per-game-stats.md)): `sampleMusic` fetches
  `MUSIC_ENDPOINT` (http://localhost/api/is-music-playing — the resident
  ProjectLauncher at `~/proj/mybrowser/utilities/caddy/launcher/launcher.py`,
  proxied by Caddy from :80 to :8787, answering from PipeWire with a 60s
  cache and `Access-Control-Allow-Origin: *`: true = `pw-dump` shows a
  running output stream (speech-dispatcher excluded) AND a ~0.5s
  `pw-record` probe of the default sink's monitor has RMS ≥ -60 dBFS,
  because paused/idle web players can hold a running stream of silence;
  Firefox exempts
  http://localhost from mixed-content blocking, so the GitHub Pages origin
  can fetch it too). `beginMusicSampling` (called from newGame beside
  beginTrace) resets `musicObservations` and samples once; a top-level
  setInterval (`MUSIC_SAMPLE_EVERY_MS`, 15s) polls continuously — not
  only during games — because `musicNow` also drives the live indicator
  (`#music-indicator`, the olive "music" chip in `#top-right`, rendered
  by `renderMusicIndicator`; hidden unless the latest answer is exactly
  true, so unknown never displays as silence). An answer is pushed onto
  `musicObservations` only while `tracing()` — it is at most seconds old,
  so it belongs to the board now in play; one landing after game end is
  display-only. `reportResult` writes `musicPlaying` (any-sample-true)
  only when at least one answer arrived during the game — a failed fetch
  sets `musicNow` null and produces no observation, because
  unreachable-endpoint is the designed "not measured" state on foreign
  origins, not a hidden error.
- Guess ledger ([Guess ledger](../product/per-game-stats.md)): `odds.js` enumerates remaining
  consistent layouts on residual clue components (budget 22 vars /
  250000 visits) plus a binomial sea, then scores a bare unproven click.
  `analyzeView(view, opts)` can pass proof options through
  `Justice.buildStructure`; one-ply hypothetical next positions cap the
  canonical proof prepass at 80000 visits so up to forty branches cannot
  each consume the two-million-visit gameplay budget. Incomplete proof
  facts stay sound, and residual odds either complete or remain unmeasured.
  `noteGuess` runs from `revealCell` after the first-click path and
  before Justice, gated by `guessLedgerAppliesToMode()` (standard,
  trial modes, uniform/single-path NG, endgame drill — modes where hidden
  mines really kill; angelic and proof-or-die record nothing, their ledger
  fields stay absent), so the p is the player's
  information, not the post-mercy board. Proven-safe clicks and clicks
  with enumerated p(mine) = 0 return null (not a guess). Over-budget returns `{measured: false}` and
  `oddsFailed` omits the whole ledger from that record — no invented
  odds; a thrown scoring error does the same and never blocks the
  reveal. `scoreGuess` stores absolute p (`lifeLost`), excess over min p
  (`lifeNeedless`), `idealRisk`, and one-ply expected remaining life
  (`perfectPlay`). A covered proven-safe cell makes min p 0, so any
  guess is fully needless. The per-guess risk chips that once showed
  these numbers beside the board were withheld on 2026-08-23 (creator
  request: reintroduce only with a proper explanation); the ledger
  itself is unchanged. `node tests/odds-test.js` includes a seeded
  brute-force parity section: on random small boards every consistent
  layout is enumerated and `analyzeView` probabilities must match it
  exactly.

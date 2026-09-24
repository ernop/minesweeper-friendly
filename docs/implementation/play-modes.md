# Play modes — implementation notes

Spec: [docs/product/play-modes.md](../product/play-modes.md). Index: [AGENTS.md](../../AGENTS.md).

- Play modes ([Play modes](../product/play-modes.md)): `settings.playMode` plus history
  key `WxH/M@id`. `solver.js` grades NG boards (`analyze` /
  `generate`) and decides proof-or-die / angelic clicks. `trial.js`
  holds the 25×4 and 4×4 sessions, dihedral maps, identity grouping,
  and replay of opens/flags from stored traces for overlay charts.
  `node tests/solver-test.js` and `node tests/trial-test.js`.
- Endgame drill mode ([Play modes](../product/play-modes.md)): `endgame.js` is the pure
  dealing module (`EndgameDrill` global / CommonJS, loaded with the other
  board modules; everything injected — rng, `BoardGenerators.place`,
  `Solver.classifyCells`). `deal` draws a seed, places a full board with
  the frozen generator, then rejection-samples border-flush remnant
  windows (sized from a covered-safe budget scaled by mine density):
  accept only 4–45 covered safe cells after opening-closure erosion,
  ≥1 mine in the window, ≥1 covered numbered safe cell, and pure-deduction
  finishability (iterated `classifyCells` with real flood semantics; a
  work-limit hit rejects). One rng stream drives placement and window
  search, so the accepted seed replays the whole presentation. Budget
  exhaustion throws. In `game/play-modes.js`, `setupEndgameDrill` (called from
  `newGame` like the pregen hook) applies the deal, marks the presented
  cells revealed, and leaves `gameState` 'ready' with mines placed — the
  existing reveal/flag ready-branches start the timer on first input (an
  accepted chord can never be first: it needs a flag, which already
  started the game). `drillCurrent` carries `remaining3BV` (stored as the
  record's `bv3`) and `safeLeft` for the `#endgame-drill-info` chrome.
  Drill records omit `zini`/`hzini`, `stnbOf` returns undefined for them,
  and `guessLedgerAppliesToMode` includes the mode. Dealing measured ~2 ms
  per expert deal. `node tests/endgame-drill-test.js` (known-answer
  remaining 3BV, closure, 50/50 rejection, full deals through the real
  stack on three sizes, seed-replay determinism).
- Pregen 10 mode: `pregen.js` provides pure 3BV scoring and descending
  seed ranking. The game page creates ten independently seeded candidates
  through the selected generator with `width - 1` (upper right) safe, deals
  each by regenerating its map from the ranked seed, and automatically opens
  that cell without adding a player click. The per-page batch is replaced
  after ten deals or when its board/generator key changes. `#pregen-charts`
  stays below the board during and after play: `Pregen.chartWins` scopes the
  current batch by `pregenBatch.startedAt` and the whole day by local midnight,
  then the existing `buildScatter` grammar renders 3BV → time once each scope
  has the normal two-win minimum. `Pregen.progressRows` feeds the adjacent
  run/3BV/time table from completed `pregenBatch.results` only — no live clock
  or active-board row. Its latest completed row keeps the light-blue
  `me` marker during the next game. This is deal order, so the percentage
  and podium treatments used for performance rankings do not apply.
  `node tests/pregen-test.js`.

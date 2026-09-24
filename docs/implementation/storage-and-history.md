# Storage, traces, and backup — implementation notes

Spec: [docs/product/storage-and-history.md](../product/storage-and-history.md). Index: [AGENTS.md](../../AGENTS.md).

- Storage ([Storage](../product/storage-and-history.md)): one IndexedDB database
  (`minesweeper-friendly`, version 3), two stores. The open, upgrade,
  `readAllUserdata`, and `persistUserdata` live in `storage.js`
  (2026-08-23, shared with the settings page); each page defines two
  late-bound hooks: `storageFailure(what)` (announce + throw) and
  `userdataReady()` (called once BOTH the db is open and this callback has
  been declared — the open can otherwise race later deferred scripts;
  `readyState` cannot signal this because it is already interactive during
  defer execution). `userdata` holds one
  entry per kind — 'history', 'settings', and 'trial'; retired 'states' and
  'rankavgSort' keys remain readable for existing data (`USERDATA_KINDS`); `traces` holds one entry per game. Userdata
  is RAM-first: the game page's `userdataReady` fills the active RAM objects
  (`history`, `settings`) via
  `readAllUserdata`, then calls `init()` (states panel, first board —
  everything that reads userdata waits there; only static chrome builds
  at parse). All reads/mutations touch RAM synchronously; every mutation
  calls `persistUserdata(kind, ramObject)`, an async fire-and-forget
  put (IndexedDB clones at put() time, so later RAM mutations cannot
  race). The game page's `storageFailure` announces in #backup-status;
  the settings page's in #settings-status — no silent storage loss.
  The version-2 upgrade carries the pre-2026-08-20 localStorage keys
  (`LEGACY_LOCALSTORAGE_KEYS`) into `userdata` once, removing them after
  the upgrade transaction commits; deletable once every player's origin
  has upgraded. Cross-page consistency: each page reads settings fresh
  at load and writes through immediately; the game and settings pages
  are never open as two live views of the same RAM.
- History: userdata 'history' maps mode key to a
  chronological array of game records, one per finished game:
  {endedAt, outcome: 'win'|'loss', timeMs, bv3, clicks, wastedClicks,
  misclicks, flagsPlaced, flagsRemoved, unusedCorrectFlags (wins only), mousePathPx,
  states, justice,
  justiceEnabled, seed, rngVersion, boardVersion, justiceVersion,
  maxAdjacent, hasSeven, zeroCount, islandCount, largestIsland,
  playMode, identityIndex, transform, trialStartedAt, guesses,
  guessIdealRisk, guessNonideal, guessPerfect, lifeLost, lifeNeedless,
  oddsVersion, actionEvaluations,
  fastclickGapMs, musicPlaying} —
  (`justiceSaves` is historical: written only during part of 2026-08-23,
  no longer recorded or shown; the schema still accepts it) —
  primary measurements only
  (later-added fields may be absent on earlier records; see
  `GAME_RECORD_SCHEMA`). The mode key is the top score key: board
  parameters, play mode, and board generator (`modeKey()`, e.g.
  `9x9/10@standard`, or with a non-default generator
  `9x9/10@standard+pink-noise(alpha=1,scale=8,contrast=2)`); keys
  without `@` mean Standard, keys without `+` mean the default uniform
  generator. Difficulty names are display-only. Timestamps are epoch
  ms; all calendar math is done in the viewer's local timezone at read
  time. This schema replaced the `scores.v1`/`losses.v1` pair
  (2026-08-19, data-structure rectification); the old keys are not read
  and any data under them is ignored.
- Raw input traces ([Raw input traces](../product/storage-and-history.md)): `beginTrace` (end of
  newGame's board build) starts {startedAt, t0, t/x/y sample arrays,
  events}; the document mousemove handler appends a sample per move while
  `tracing()` (ready or playing). `traceEvent` logs 'ldown'/'lup'/'rdown'
  from the board handlers (document mouseup catches off-cell releases,
  index null); `traceDecision` logs every accepted action's exact pre-action
  visible position, measured choices, evidence, and result;
  `recordLayout` logs board-geometry events (newGame,
  scroll, resize, zoom), and `recordLayoutIfMoved` (2026-08-23)
  re-records whenever the board's rect differs from the last layout
  event — called from `traceEvent` and `syncBoardLayout`, scheduled by
  ResizeObserver when the panel or surrounding controls change size.
  Stats sampling never triggers a layout pass.
  `node tests/trace-layout-test.js` freezes these
  rules. `saveTrace` (called from reportResult) puts
  {endedAt, mode, outcome, startedAt, sampleT/sampleX/sampleY as typed
  arrays, events} into the `traces` store, keyPath endedAt (never held
  in RAM — far too large). Failures go through `storageFailure`
  (#backup-status + throw) — no silent trace loss. "export traces"
  (#export-traces-btn + #export-traces-file) downloads every trace as a
  JSON array with the typed arrays converted back to plain arrays.
- Trace timestamp invariant ([Raw input traces](../product/storage-and-history.md)): the document
  mousemove recorder coalesces events whose precision-reduced
  performance.now() equals the previous sample's (latest position wins),
  so sampleT is strictly increasing by construction. This is what keeps
  every dt > 0 (no Infinity speeds/jerk in the metrics panel — the
  2026-08-20 bug) and satisfies the offline extractor's validation.
  Simulated-input tests must dispatch mousemoves with real delays
  (~12ms sleeps) or they exercise exactly this coalescing path.
- Backup: `#backup` controls; `importHistory` validates the whole blob
  before writing (arrays of well-formed records only, loud error naming the
  offending mode otherwise), dedupes by `endedAt` within each mode, and
  re-sorts each mode chronologically after a merge. Export writes with
  `navigator.clipboard` only; a rejection surfaces its error message.
  `#format-panel` (toggled by `#format-btn`) is the data-format reference
  card, generated at init by `buildFormatPanel` from `GAME_RECORD_SCHEMA`
  and `DIFFICULTIES` — the same schema `importHistory` validates against —
  so the card, the validator, and the writer cannot drift apart.

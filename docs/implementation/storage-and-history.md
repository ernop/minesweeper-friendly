# Storage, traces, and backup — implementation notes

Spec: [docs/product/storage-and-history.md](../product/storage-and-history.md). Index: [AGENTS.md](../../AGENTS.md).

- Storage ([Storage](../product/storage-and-history.md)): one IndexedDB database
  (`minesweeper-friendly`, version 5), four stores. The version-5 upgrade
  checks `objectStoreNames` and creates `records` (moving userdata `history`
  into it) and/or `selfChecks` (`SELF_CHECK_STORE`, keyPath `startedAt`,
  [self-check implementation](self-check.md)), because each of the two
  version-4 builds created only one of them. The open, upgrade,
  `readAllUserdata`, `persistUserdata`, `readGameRecords`,
  `persistGameRecord(s)`, and `persistGameRecordChanges` live in `storage.js`
  (2026-08-23, shared with the settings page and, since 2026-09-26, the
  self-check page). Its open success also calls `navigator.storage.persist()`;
  a rejection is a `storageFailure`. `settings-page.js` reads
  `navigator.storage.persisted()` into `#storage-persistence-text`. Each page
  defines two
  late-bound hooks: `storageFailure(what)` (announce + throw) and
  `userdataReady()` (called once BOTH the db is open and this callback has
  been declared — the open can otherwise race later deferred scripts;
  `readyState` cannot signal this because it is already interactive during
  defer execution). `userdata` holds one
  entry per kind — 'settings' and 'trial'; retired 'states' and
  'rankavgSort' keys remain readable for existing data (`USERDATA_KINDS`);
  `records` holds one game record per out-of-line key [history key,
  endedAt], so a key range reads one mode in play order; `traces` holds one entry per game. Userdata
  is RAM-first: the game page's `userdataReady` fills the active RAM objects
  (`settings`, then `history` from `readGameRecords`) via
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
  has upgraded. The version-4 upgrade (2026-09-26) moves the former
  whole-history userdata value into `records` inside the upgrade
  transaction, keeping the first of two records sharing a key as
  normalization always did, and deletes the old value. Game records are
  written by `appendGameRecord`, the finished-game worker reply
  (`reportResult`), restored-trace measurements, board-metric backfill
  (`persistGameRecord`), and import (`persistGameRecords`, added records
  only). Load-time normalization returns the exact `writes` and legacy-key
  `deletions` it implies, applied by `persistGameRecordChanges`; it never
  clears the store, so a record another tab saved between this page's read
  and its write survives. The training
  worker reads only its mode's key range. Cross-page consistency: each page reads settings fresh
  at load and writes through immediately. Two game tabs are two live RAM
  copies: each writes only its own games' records, so neither erases the
  other's; each shows the other's games after a reload.
- History: the RAM `history` maps mode key to a
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
  sourceT/sampleTrusted/sampleMergeCount, initialPageState, events}; the
  document mousemove handler calls `traceMove` while
  `tracing()` (ready or playing). `traceEvent` logs 'ldown'/'lup'/'rdown'
  from the board handlers (document mouseup catches off-cell releases,
  index null) and returns the logged event, so a right press can be marked
  `chordGesture` when a left press joins it; `traceDecision` logs every accepted action's exact pre-action
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
  arrays, events, captureVersion, clock, initialPageState, sampleSourceT,
  sampleTrusted, sampleMergeCount} into the `traces` store, keyPath endedAt.
  Only the active trace remains in RAM during play. Failures go through `storageFailure`
  (#backup-status + throw) — no silent trace loss. "export traces"
  (#export-traces-btn + #export-traces-file) downloads every trace as a
  JSON array with the typed arrays converted back to plain arrays.
- Trace timestamp invariant ([Raw input traces](../product/storage-and-history.md)): the document
  `traceMove` recorder merges events whose precision-reduced
  performance.now() equals the previous sample's (latest position wins),
  so sampleT is strictly increasing by construction. This is what keeps
  every dt > 0 (no Infinity speeds/jerk in the metrics panel — the
  2026-08-20 bug) and satisfies the offline extractor's validation.
  Simulated-input tests must dispatch mousemoves with real delays
  (~12ms sleeps) or they exercise exactly this coalescing path.
- Capture v1 ([contract](../product/storage-and-history.md#capture-provenance-v1-2026-09-26)):
  `traceEventSource` preserves browser timestamp/type/trust independently of
  the existing receipt-time fields. `traceMove` merges only equal receipt times,
  updating the surviving sample's source provenance and merge count together.
  `saveTrace` writes source times as Float64Array, trust as Uint8Array, counts
  as Uint32Array; `game/backup.js` converts them for JSON export when measured.
  No database upgrade or historical rewrite is needed for these new fields.
  `traceRightButton` runs in document capture listeners before gameplay's
  board mousedown handler (the right press); distinct kinds prevent duplicate
  action counts.
  `tracePageEvent` records window focus/blur and pagehide/pageshow, plus document
  visibility changes. Existing flush/cancel behavior remains in those handlers.
  Page-state collection schedules no analysis on its own; the next existing
  live update/final save includes it. All handlers stop recording at game end.
  Existing workers, replay, and offline feature formulas continue to select
  their named action kinds and receipt-time sample arrays. The Python
  extractor explicitly recognizes the new non-action kinds and decision events;
  it still rejects unknown kinds. Provenance collection performs no analytics.
  `tests/trace-layout-test.js` checks clock separation, sample merging/provenance,
  state transitions and stop boundaries; `tests/trace-capture-browser-check.js`
  checks real right-click events, queued source time, listener wiring, IndexedDB,
  export, and worker equality with/without added non-action observations.
- Backup: `#backup` controls; `importHistory` validates the whole blob
  before writing (arrays of well-formed records only, loud error naming the
  offending mode otherwise), dedupes by `endedAt` within each mode, and
  re-sorts each mode chronologically after a merge. Export writes with
  `navigator.clipboard` only; a rejection surfaces its error message.
  `#format-panel` (toggled by `#format-btn`) is the data-format reference
  card, generated at init by `buildFormatPanel` from `GAME_RECORD_SCHEMA`
  and `DIFFICULTIES` — the same schema `importHistory` validates against —
  so the card, the validator, and the writer cannot drift apart.
- Archive folder ([Archive folder](../product/storage-and-history.md#archive-folder-creator-direction-2026-09-26)):
  - `archive.js` (page side; loaded by index.html, settings.html, and
    self-check.html right after `storage.js`/`observation-context.js`):
    - `archiveState` holds status, detail, worker, and the running, queued,
      and suspended flags.
    - `loadArchive(render)` reads userdata kind `archive` (`{ handle,
      chosenAt }`) and calls `queryPermission`.
    - `requestArchiveSync` is called after saves. `runArchiveSync` queues
      exactly one more sync while one runs.
    - `chooseArchiveFolder` uses `showDirectoryPicker`, id
      `minesweeper-friendly-archive`; a cancelled picker changes nothing.
    - `useArchiveFolder(handle)` persists and syncs. Tests pass an
      origin-private directory handle here.
    - `resumeArchive` calls `requestPermission`.
    - `suspendArchiveSync`/`releaseArchiveSync` bracket the self-check's
      timed test.
    - `archiveStatusText` gives the sentence every page shows.
    - Rejections and worker errors become status `error`, with the browser
      error's name and message.
  - `archive-worker.js`:
    - takes `navigator.locks` lock `minesweeper-friendly-archive-sync`;
    - opens the database without a version and closes on `versionchange`;
    - reads every game record with its `[history key, endedAt]` key, the
      trace keys, and every self-check;
    - lists each month directory once per worker lifetime (the `listings`
      cache, reset when the folder changes or any sync fails). A name
      missing from a listing made by an earlier sync is checked with
      `getFileHandle`, since another tab may have written it;
    - writes the missing items through `CompressionStream('gzip')` and
      `createWritable`;
    - rejects two items mapping to one path, and writes `README.txt` if absent;
    - reports `progress` every 25 files, then `done` with per-kind written
      and present counts, or `error` (`NotAllowedError` means the page must
      ask for permission again).
  - `archive-format.js` (pure, loaded by the worker and by tests): paths,
    `archiveNameSlug`, the three document builders, and `ARCHIVE_README_TEXT`.
  - Triggers:
    - game page: `saveTrace`'s completion, `importHistory`, and
      `loadArchive(renderArchiveChip)` at the end of `init` (`game/backup.js`
      renders `#archive-chip`);
    - settings page: `renderArchiveSettings` in `settings-page.js`;
    - self-check page: `renderSelfCheckArchive`, a sync after each saved
      check and after an import, and suspension from `startVigilance` until
      the saved check's transaction completes.
  - Tests: `tests/archive-format-test.js` and `tests/archive-browser-check.js`.

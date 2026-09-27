# Storage, traces, and backup

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/storage-and-history.md](../implementation/storage-and-history.md).

## Storage (decided 2026-08-20)

- All persistent data lives in one IndexedDB database
  (`minesweeper-friendly`, version 5) with four stores: `userdata`
  (personal preferences and trial sessions — one entry per kind),
  `records` (one game record per finished game), `traces` (one entry per finished game),
  and `selfChecks` (one record per [self-check](self-check.md), keyed by
  `startedAt`).
  Finishing a game writes only its own record (2026-09-26 input-latency
  review: the whole history had been one value, rewritten twice per game —
  160 MB for 6,407 games, about a second of blocked input each time). The
  version-4 upgrade moves each stored record to its own entry once.
  Creator requirement (2026-09-26): writing all that stored data at every
  game end "is horrible and we should never do that." A game's writes cover
  only what that game created or changed; their cost never grows with the
  size of the history.
- Version 4 shipped twice on 2026-09-26 with different contents. The public
  build moved history into `records`; the local player origin's build added
  `selfChecks`. The version-5 upgrade creates whichever of the two stores a
  database lacks, moving history into `records` if it is still one userdata
  value. Every path therefore ends with the same four stores, and nothing is
  moved twice.
- Open game tabs never erase each other's games. Found 2026-09-26: with the
  game open in two windows, the whole-history value was rewritten from one
  tab's older copy, dropping the 11 games finished in the other tab between
  12:59 and 14:41 (their traces survived; the records were restored from a
  same-day snapshot by import). Per-game records remove that failure:
  every write, including load-time normalization, touches only the records
  it changes.
  The traces store indexes `[mode, finalBoard.cells.length]` as
  `boardsByModeAndSize`, so backfill can find source boards without loading raw
  input payloads. The version-3 upgrade indexes existing traces in place; no
  game records or traces are rewritten. Blocked upgrades explicitly ask the
  player to close other game/settings tabs and reload.
- Userdata and records are RAM-first: every kind and record is read into
  RAM once at startup, all reads and mutations work on the RAM copy
  synchronously, and each mutation immediately persists that kind's whole
  RAM object, or only the changed game records, with an async
  fire-and-forget write. Everything the player sees is rendered
  from RAM; nothing waits on the disk. Keeping all userdata in RAM is
  fine because scalar records are tiny — revisit only if that ever stops
  being true. Traces are far too large for RAM and are written straight
  to their store (see Raw input traces).
- Page assets download in parallel with deferred scripts, with storage first
  so IndexedDB opens concurrently. Because an IndexedDB open can finish while
  later deferred scripts are still executing, storage announces readiness
  only after the page's `userdataReady` callback exists; `readyState` is not
  used as that signal because it is already `interactive` during deferred
  execution.
- A failure to open the database or to persist anything is announced in
  the backup status line and thrown — never tolerated silently.
- Persistent storage (2026-09-26): browsers may evict a site's storage under
  disk pressure unless the site's storage is persistent. Every page therefore
  asks, via `navigator.storage.persist()`, once the database opens. The browser
  decides: Chrome from site engagement without a prompt, Firefox by asking.
  The Settings Archive group states the answer. When it is no, it says the
  browser may delete the data when disk space runs low, and that the archive
  folder keeps a copy, or asks for one.
- Size (measured 2026-09-26, three scripted Expert games of about 230 actions):
  - A trace is about 750 KB as JSON. The board snapshot before every action
    is half of it (about 375 KB), the rest of the per-action evidence about a
    quarter, and cursor samples about 55 KB.
  - Chrome's database stores it in about 160 KB on disk; the gzip archive
    copy is about 40 KB.
  - Values stay uncompressed in the browser. Compressing them would slow
    every replay, analysis, and backfill read and hide indexed fields, to save
    about 120 KB per game. Storing board changes instead of full snapshots is
    the larger saving and belongs with the next trace format change.
- Before 2026-08-20 the userdata lived in localStorage; the version-2
  database upgrade carries those keys over exactly once and then removes
  them, so existing players (including on the public GitHub Pages origin)
  keep their history without doing anything.

## Raw input traces (decided 2026-08-20)

- Every finished game (win and loss) keeps its sampled input stream as
  the ground truth behind motion and decision analysis: cursor samples
  (relative ms timestamp, x, y; equal receipt times merge as specified below), button events
  ('ldown'/'lup'/'rdown' with position and the board cell index hit, or null
  for a press released off the cells; `chordGesture: true` marks a right
  press that was half of a both-button chord and the left release that made
  the chord attempt, since 2026-09-26), layout events (the board's bounding
  rect and dimensions, re-recorded on scroll, resize, and zoom, so every
  sample maps to a board cell forever), and one decision event per accepted
  board action. A decision event keeps the exact pre-action visible position,
  selected cell(s), measured reasonable-choice set, evidence, and outcome.
  This is the durable source for faithful choice replay and later analytics;
  the scalar history record still keeps only reportable mistake evidence.
- The board also moves without any scroll/resize/zoom event when content
  around it changes — found 2026-08-23: the metrics panel's first render
  during init shifts the centered board ~880px after the trace's opening
  layout event, so warmup samples mapped through stale geometry. The
  recorder therefore also compares the live rect to the last recorded
  one and re-records on any difference: before every button event (every
  click maps exactly), and after layout passes scheduled by ResizeObserver
  when the panel or surrounding controls change size. Stats sampling does
  not run page layout. Traces
  saved before the fix retain the defect for the first game of each
  page load: their samples map through the stale opening rect (button
  events are unaffected — they store the hit cell index directly). The
  true geometry was never measured, so those traces cannot be repaired;
  offline sample-to-cell mapping of a session's pre-fix first game is
  suspect.
- A trace runs from board creation to finish: pre-first-click movement is
  warmup and is real data, so capture covers the ready state, not just
  play. Post-game movement belongs to no game and is not captured.
  Abandoned boards (restarted mid-game) produce no record and no trace.
- `rdown` is the board's right press, which flags a covered cell: the press
  itself since 2026-09-26, before that the context-menu event (fired on the
  press on Linux and macOS, on the release on Windows). Existing calculations
  continue using this action boundary and handler-time samples; capture
  provenance v1 below separately records physical right-button transitions,
  event times, and page-state observations. Full source-sample preservation
  and complete-attempt retention remain unbuilt; see the
  [lifelong self-measurement roadmap](../../BACKLOG.md#lifelong-self-measurement-roadmap-creator-2026-09-26).
- Sample timestamps are strictly increasing, by construction (decided
  2026-08-20): browsers reduce performance.now() precision (Chromium
  quantizes to ~100µs), so two mousemove events can read the same
  timestamp. Such events are one sample — the latest position at that
  instant. Their delivery order is known but elapsed time within the tie
  is not resolved; a zero time step would put Infinity into every
  rate computed from this computation stream. The discarded positions
  cannot be reconstructed; capture v1 records the number merged. Every consumer (the metrics panel, the
  offline extractors) may rely on this invariant.
- Traces live in their own store (`traces`, keyed by endedAt exactly like
  history records; see Storage). The active trace stays in RAM; the full
  historical trace collection is not loaded during play. Nothing is pruned.
- Scalar record fields are summaries; the trace is what lets any future
  metric be computed over past games retroactively. Failure to capture or
  save a trace is announced visibly and thrown, never tolerated.
- An "export traces" button beside the backup controls downloads all
  traces as one JSON file (download only — far too large for the
  clipboard) for the offline analysis pipelines under `analysis/`.
- Historical recording overhead, measured 2026-08-20 before capture v1: ~100ns per mousemove event and
  <0.5ms of typed-array conversion at save time — imperceptible.
- Since 2026-09-26 each new trace also stores `environment`: device pixel
  ratio, screen and viewport size, and the browser's user-agent string at trace
  start, which change cursor pixels and input timing. Physical device facts are
  not observable and are not guessed. Older traces lack the field (not
  measured). See [Lifelong self-measurement](measurement.md#lifelong-self-measurement-creator-direction-2026-09-26).

### Capture provenance v1 (2026-09-26)

The creator's instruction to continue the profiling work starts with better
observations. This implemented slice adds provenance to new finished-game
traces; it does not change the numerical definitions of existing statistics.

- `captureVersion: 1` identifies this acquisition contract. `clock` retains
  `timeOriginMs` and `traceStartMs` from the browser monotonic clock; their sum
  anchors relative trace time to the browser's epoch estimate. Existing
  `startedAt` remains the separately observed `Date.now()` value used by current
  history/session code. A wall-clock adjustment is not a change in elapsed
  monotonic time; existing wall-time-based summaries are not redefined here.
- Existing input events keep handler-recorded `t` and gain `sourceT` (browser
  `Event.timeStamp` minus trace start), `sourceType`, `isTrusted`, and `buttons`.
  Both times are milliseconds on the same relative clock. Source time is browser
  event creation time, not measured hardware activation. Do not clamp negative
  source times: a queued event may predate board creation. Layout and decision
  events are app observations and do not invent browser-source timestamps.
- Mouse samples gain parallel `sampleSourceT`, `sampleTrusted` (0/1), and
  `sampleMergeCount` arrays. A sample's count is the number of delivered
  `mousemove` observations merged into that receipt-time sample. On a tie, the
  latest position and its source time/trust survive. Counts expose the loss;
  they do not recover the discarded observations or browser-coalesced points.
  No claim of a complete device stream or polling rate follows from these arrays.
- Document-level mouse down/up listeners independently record
  `right-button-down` and `right-button-up`, including off-board events, with
  position, cell index (null off cells), browser button state, and source
  provenance. They never toggle flags or count as additional game actions.
  Existing left down/up coverage is unchanged. A button held outside the
  trace's window may have only one observed transition; no counterpart is invented.
- `initialPageState` records document visibility and focus at trace start.
  `page-state` events record `visibilitychange`, window focus/blur, and
  `pagehide`/`pageshow`, with both times, source trust, and the observed state.
  Page lifecycle events also retain `persisted`. These identify observed context
  changes, not proof of distraction, sleepiness, a pause, or a missing input.
  An abrupt exit may emit no event. A pagehide observation is durable only if
  that trace later reaches the existing finished-game save path.
- Capture stops at game end. Export includes all new observations and converts
  every sample array to a JSON array. Earlier traces remain explicitly
  unmeasured for these fields; export does not manufacture them.

Still pending: one full Pointer Events acquisition stream with coalesced and
ordered equal-time samples, every button/cancellation, input-to-action links,
setup identity, viewport/device context, and partial-attempt checkpointing.
These remain in the [lifelong self-measurement roadmap](../../BACKLOG.md#lifelong-self-measurement-roadmap-creator-2026-09-26).

## Play history and backup

- Every finished game (win and loss) is kept forever (one `records` entry
  each; see Storage), grouped by mode; nothing is pruned. A mode is identified
  by board parameters plus play mode (e.g. `9x9/10@standard`). Keys
  written before 2026-08-21 as `9x9/10` mean Standard.
- Export/import game history as a JSON map of mode to game records,
  without preferences: copy to clipboard, save to
  file, paste in, or open from file — subtle controls out of the way of
  play. Export applies the importer schema first, discarding invalid
  optional fields and omitting irreparable records or lists so it never
  emits data this build would reject. Import recovers every usable sibling:
  invalid optional fields are discarded, irreparable records/lists are
  skipped; the status reports each kind of cleanup. Embedded settings in
  older combined exports are ignored.
  Records dedupe by end timestamp, so repeated imports are no-ops.
- A "data format" button beside the backup controls raises a reference
  card: the export's overall shape (one mode-keyed
  list per board) and a field-by-field table of the per-game record fields
  with example values and units, plus the note that every other displayed
  stat is derived from them at display time. The card is generated from
  the same field definitions the importer validates against, so it cannot
  lie about the real format.

## Archive folder (creator direction, 2026-09-26)

For [lifelong self-measurement](measurement.md#lifelong-self-measurement-creator-direction-2026-09-26),
the browser database is a working copy. Every primary item is also written
to a folder the player chooses, as documented open files that outlive the
browser, its profile, and this origin.

- **Choose.** Settings, group "Archive": "Choose folder" opens the browser's
  folder picker; "Change folder" picks another, and the new folder then
  catches up on everything. The handle is stored as userdata kind `archive`.
  Browsers without folder access (the File System Access API) show that fact
  and no picker.
- **Automatic writes.** After each finished game's trace is saved, after
  each self-check, after a history or self-check import, on each page load
  (after the game page's startup), and on "Archive now", a sync writes every
  record, trace, and self-check the folder does not hold yet, and every
  problem attempt, pointing run, and drill attempt from the problems page's
  own database (added 2026-09-27: they are primary items too). The problems
  page does not open the game database, where the folder is stored, so its
  items are written by the next sync of the game, settings, or self-check
  page. A sync never creates the problems database: until the player opens
  that page there is nothing of it to archive.
  - The sync runs in a worker that reads the database itself, so the page
    thread does no archive work. A measured first sync of 500 seeded games
    wrote 1,000 files in about 5 s with no long main-thread task.
  - The worker keeps directory listings between syncs, so a sync after one
    game checks only new files (about 10 ms with 1,000 files archived).
    Each page load lists the folder afresh.
  - A Web Lock serializes syncs from every open tab.
- **Write-once.**
  - Each item file is written once, atomically, and never changed or deleted.
    `README.txt` is the one exception (2026-09-27): a sync rewrites it when
    its text differs from the current layout's description, because a README
    that omits directories would mislead its reader.
  - A record is archived as it was first written. Values added to it later
    (board measurements, evidence corrections) are recomputable from the
    trace and seed.
  - Deleting data in the browser never deletes archive files.
- **Layout** (UTC year and month; every name uses only `[A-Za-z0-9._-]`):
  - `games/YYYY/MM/<endedAt>-<mode>.json.gz`: one finished game's record.
    Each character of the board key outside `A-Za-z0-9.-` is written as `_`
    plus four hex digits, so distinct keys never collide.
  - `traces/YYYY/MM/<endedAt>.json.gz`: that game's raw input trace, with
    typed arrays as plain number arrays.
  - `self-checks/YYYY/MM/<startedAt>.json.gz`: one self-check.
  - `problem-attempts/`, `pointing-runs/`, and `drill-attempts/`, each
    `YYYY/MM/<startedAt>.json.gz`: one item of the problems page
    ([problems.md](problems.md)). Attempts name their problem bank by
    `bankId`; every bank is `problems-bank.json` in the repository history.
  - `README.txt` describes all of this for a reader without the app.
- **Format.** Each item is gzip-compressed UTF-8 JSON holding `format`,
  `formatVersion` (1), and the item. The formats are
  `minesweeper-friendly-game-record` with `{ mode, record }`,
  `minesweeper-friendly-trace` with `{ trace }`,
  `minesweeper-friendly-self-check` with `{ selfCheck }`,
  `minesweeper-problems-attempt` with `{ attempt }`,
  `minesweeper-problems-pointing-run` with `{ run }`, and
  `minesweeper-problems-drill-attempt` with `{ attempt }`.
- **Status counts.** The status sentence counts game records, traces, and
  self-checks, then each problems-page kind once the folder holds any.
- **Permission.**
  - Browsers may require the player to renew write permission on a later
    visit. Until then the archive is paused: the settings page says so, the
    self-check page offers "Allow archive writing", and the game page shows
    an "archive paused" chip that resumes on click.
  - Nothing is lost meanwhile: the data stays in the database, and the next
    sync writes it.
- **Failures.** A failed sync (for example a folder deleted or moved) shows
  "archive failed" with the browser's error on the game page chip, in the
  backup status line, on the settings page, and on the self-check page. It
  is retried by a click or the next save, and stays visible until a sync
  succeeds.
- **Timed tests.** While a self-check test runs, archive work is suspended.
  A running sync stops, and it restarts after the result is saved.

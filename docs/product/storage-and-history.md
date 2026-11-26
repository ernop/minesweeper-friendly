# Storage, traces, and backup

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/storage-and-history.md](../implementation/storage-and-history.md).

## Storage model

All persistent game-page data lives in one IndexedDB database (`minesweeper-friendly`, version `8`) with five stores:

- **`userdata`:** single entries by kind — personal preferences (`settings`), trial sessions, daily play limits, and archive folder handle (`archive`).
- **`records`:** one entry per finished game (win or loss), keyed by `endedAt`. Finishing a game writes only its own record (never rewriting full history, so write cost stays constant and open tabs never overwrite each other's finished games).
- **`traces`:** one raw input trace per finished game, keyed by `endedAt`, indexed on `[mode, finalBoard.cells.length]` as `boardsByModeAndSize` so board-metric backfill finds source boards without loading raw pointer arrays. Never loaded in bulk during play.
- **`selfChecks`:** one entry per [self-check](self-check.md), keyed by `startedAt`.
- **`playSpans`:** one entry per board put into play (finished or abandoned), keyed by `startedAt`, feeding [daily play limits](play-limits.md) and abandoned-board session counts. Each tab writes only its own spans.

### Storage invariants and migrations
- **RAM-first reads:** `userdata` and scalar `records` load once at startup into RAM so all reads and UI renders are synchronous; mutations fire-and-forget async writes touching only changed entries. Traces stay on disk except for the active game.
- **Compact string encoding:** inside saved `actionEvaluations` and capture-v2+ traces, visible board snapshots (`position.cells`) store as one character per square (`.`, `F`, `0`–`8`) and square lists (`cells`) as comma-joined strings rather than nested arrays, avoiding multi-hundred-millisecond deserialization stalls on load.
- **Concurrent startup open:** `storage.js` loads deferred right after `page-errors.js` so IndexedDB opens in parallel with remaining scripts, invoking `userdataReady` only once `game/main.js` defines it. Database open/write failures announce loudly and throw (never tolerated silently); blocked upgrades prompt closing other open tabs.
- **Persistent storage request:** every page calls `navigator.storage.persist()` once the database opens and surfaces the browser's answer in the Settings Archive panel (warning when non-persistent storage risks eviction under disk pressure).
- **Two-step history cleanups:** schema changes needed only by pre-existing records ship in two steps — Step 1 migrates on load/import, and Step 2 deletes the shim once active browsers have loaded Step 1 (tracked in [BACKLOG.md](../../BACKLOG.md#pending-step-2-cleanups-delete-once-active-browsers-have-loaded-step-1)).

### Schema-boundary dates

| Date | DB / format boundary | Semantic change |
| --- | --- | --- |
| `2026-08-20` | DB v2 | Moved history and settings from `localStorage` into IndexedDB (one-time migration). |
| `2026-08-21` | Mode keys | Keys include `@<playMode>` (`9x9/10@standard`); earlier bare `9x9/10` keys mean Standard. |
| `2026-09-26` | DB v4/v5, Capture v1 | Per-game `records` store + `selfChecks` store; traces add `environment`, `clock`, `sourceT`, `sourceType`, `isTrusted`, `buttons`, `right-button-down/up`, and `page-state` events. |
| `2026-10-10` | `finalBoard` flags | Wins stop auto-flagging remaining mines; pre-boundary traces store all mines flagged (derive true player flags from the last decision event's pre-action board). |
| `2026-10-12` | DB v6 | Added `playSpans` store (`generator` and exit reason added `2026-10-20`). |
| `2026-10-26` | Capture v2 | Evaluation and trace boards/square lists switch from nested arrays to compact strings. |
| `2026-10-27` | DB v7, Capture v3, Archive v2 | Renamed `clicks` → `boardChangingClicks`, `wastedClicks` → `noOpClicks`, `movesRanOut` → `movesMovedOn`; traces store merged co-timestamped cursor observations (`mergedSample/X/Y/SourceT/Trusted`) and float32 cursor coords. |
| `2026-11-03` | Pending save | Finished record + trace save atomically marked `evaluationPending`, then re-save complete after worker judgment; pending games stay excluded from UI, archive, training, and exports until complete. |
| `2026-11-23` | DB v8, Archive v3 | Renamed `justice*` → `guardianAngel*` (`justice`, `justiceEnabled`, `justiceVersion`, `justiceProtected`). |

## Raw input traces

Every finished game (win or loss) saves its complete input stream as ground truth for replay, motion stats, and retroactive analytics. Failure to capture or save a trace surfaces visibly and throws.

- **Scope:** captures from board deal through finish (pre-first-click warmup is real data; post-game movement is excluded; abandoned boards currently save no trace).
- **Contents:** strictly increasing cursor samples (`t`, `x`, `y`), button events (`ldown`/`lup`/`rdown` with coordinates, cell index or `null`, and `chordGesture`), layout snapshots (board rect + dimensions re-recorded on scroll, resize, zoom, layout shift via `ResizeObserver`, and before every button event if changed), decision events (exact pre-action visible board, selected cells, evidence, outcome), `finalBoard` (enabling post-reload restoration), and `environment` (`devicePixelRatio`, screen/viewport dimensions, user agent).
- **Strictly increasing sample timestamps:** equal-timestamp `mousemove` observations merge into one sample (latest position wins) so consumers never encounter zero `dt` / `Infinity` speed; since capture v3 (`2026-10-27`), replaced intermediate observations persist in parallel `merged*` arrays so cursor travel includes them (while Hevelius algorithms run strictly on timestamped samples). Pre-`2026-08-23` traces may map warmup samples through a stale opening rect on the first game of a load.
- **Uncompressed in IndexedDB:** traces remain uncompressed inside IndexedDB so replay, analysis, and backfill reads stay fast and indexed fields remain queryable (archive copies are gzip-compressed).

### Capture provenance
- `captureVersion` (`1` = provenance fields, `2` = string boards/cells, `3` = `merged*` co-timestamped points + float32 coordinates matching in-game capture precision).
- `clock` keeps `timeOriginMs` and `traceStartMs` from the monotonic clock alongside wall-clock `startedAt`.
- Input events retain handler time `t` plus `sourceT` (`Event.timeStamp - traceStartMs`, never clamped if negative from queued events), `sourceType`, `isTrusted`, and `buttons`; layout and decision events are app observations without fabricated browser timestamps.
- Document-level `right-button-down` and `right-button-up` record physical right-button transitions (including off-board) without affecting flag actions (`rdown` marks the flag trigger itself).
- `initialPageState` and `page-state` events record `visibilitychange`, focus/blur, and `pagehide`/`pageshow` (with `persisted`), treated strictly as observed browser state rather than inferred distraction.

## Play history and backup

- **Retention:** every finished game is kept permanently, grouped by mode key; nothing is pruned.
- **Backup controls:** shared bordered buttons in `#backup` under the board — `export history`, `export traces` (file download only, too large for clipboard), `import history` (paste or file open), and `data format` (inline reference card generated directly from importer validation definitions, ending with a summary of hosted [play statistics](hosting.md#play-statistics)).
- **Clean transfer:** history exports contain only mode-keyed game lists (no preferences), validated through the importer schema before emission. Imports dedupe by `endedAt`, ignore legacy embedded settings, recover valid siblings while stripping invalid optional fields or irreparable records, and report every cleanup in the status line.

## Archive folder

For [lifelong self-measurement](measurement.md#lifelong-self-measurement), IndexedDB acts as a working copy while every primary item also writes once as an open, documented gzip file to a user-chosen local folder that outlives any browser profile or origin.

- **Setup:** configured in Settings → `Archive` via File System Access API (`Choose folder` / `Change folder`, handle stored in `userdata['archive']`; browsers without folder access state that fact and omit the picker).
- **Automatic off-thread sync:** `archive-worker.js` reads IndexedDB directly (serialized across tabs via Web Locks, keeping cached directory listings between syncs and refreshing on page load). Syncs trigger after each finished game's judged record saves, after each self-check, after imports, after page startup, and on `Archive now`. Syncs also archive `minesweeper-problems` items when that database exists (never creating it if unused) and suspend while a timed self-check is running.
- **Write-once guarantee:** every item file writes atomically once and is never modified or deleted (deleting browser data never deletes archive files). Only `README.txt` updates automatically when its format description changes. Games marked `evaluationPending` wait until worker judgment finishes so archived records include complete evaluations and board measurements.
- **Directory layout** (UTC `YYYY/MM`, filenames restricted to `[A-Za-z0-9._-]`, non-safe key chars hex-escaped as `_XXXX`):
  - `games/YYYY/MM/<endedAt>-<mode>.json.gz` (`minesweeper-friendly-game-record`: `{ mode, record }`)
  - `traces/YYYY/MM/<endedAt>.json.gz` (`minesweeper-friendly-trace`: `{ trace }`, typed arrays as JSON arrays)
  - `self-checks/YYYY/MM/<startedAt>.json.gz` (`minesweeper-friendly-self-check`: `{ selfCheck }`)
  - `problem-attempts/`, `pointing-runs/`, `drill-attempts/` under `YYYY/MM/<startedAt>.json.gz` (`minesweeper-problems-*`, referencing `bankId`)
  - `README.txt` (self-contained format guide including historical archive format versions `1`/`2`/`3`)
- **Permissions and errors:** when the browser requires renewed folder write permission, syncing pauses with no data loss and surfaces a one-click resume control (`archive paused` chip on game page, status on Settings, `Allow archive writing` on self-check). Sync failures surface `"archive failed"` with the browser error across game chip, backup status, Settings, and self-check until a retry succeeds.

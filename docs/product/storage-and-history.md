# Storage, traces, and backup

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/storage-and-history.md](../implementation/storage-and-history.md).

## Storage (decided 2026-08-20)

- All persistent data lives in one IndexedDB database
  (`minesweeper-friendly`, version 3) with two stores: `userdata` (play
  history, personal preferences, and trial sessions — one entry per kind) and `traces` (one entry per finished game).
  The traces store indexes `[mode, finalBoard.cells.length]` as
  `boardsByModeAndSize`, so backfill can find source boards without loading raw
  input payloads. The version-3 upgrade indexes existing traces in place; no
  game records or traces are rewritten. Blocked upgrades explicitly ask the
  player to close other game/settings tabs and reload.
- Userdata is RAM-first: every kind is read into RAM once at startup, all
  reads and mutations work on the RAM copy synchronously, and each
  mutation immediately persists that kind's whole RAM object with an
  async fire-and-forget write. Everything the player sees is rendered
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
- Before 2026-08-20 the userdata lived in localStorage; the version-2
  database upgrade carries those keys over exactly once and then removes
  them, so existing players (including on the public GitHub Pages origin)
  keep their history without doing anything.

## Raw input traces (decided 2026-08-20)

- Every finished game (win and loss) keeps its complete input stream as
  the ground truth behind all motion and decision analysis: cursor samples
  (relative ms timestamp, x, y for every mousemove), button events
  ('ldown'/'lup'/'rdown' with position and the board cell index hit, or null
  for a press released off the cells), layout events (the board's bounding
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
- Sample timestamps are strictly increasing, by construction (decided
  2026-08-20): browsers reduce performance.now() precision (Chromium
  quantizes to ~100µs), so two mousemove events can read the same
  timestamp. Such events are one sample — the latest position at that
  instant — because at the timer's resolution the two positions are not
  ordered in time, and a zero time step would put Infinity into every
  rate computed from the trace. Every consumer (the metrics panel, the
  offline extractors) may rely on this invariant.
- Traces live in their own store (`traces`, keyed by endedAt exactly like
  history records; see Storage) and are never held in RAM — they are far
  too large for that. Nothing is pruned.
- Scalar record fields are summaries; the trace is what lets any future
  metric be computed over past games retroactively. Failure to capture or
  save a trace is announced visibly and thrown, never tolerated.
- An "export traces" button beside the backup controls downloads all
  traces as one JSON file (download only — far too large for the
  clipboard) for the offline analysis pipelines under `analysis/`.
- Recording overhead, measured 2026-08-20: ~100ns per mousemove event and
  <0.5ms of typed-array conversion at save time — imperceptible.

## Play history and backup

- Every finished game (win and loss) is kept forever (userdata `history`;
  see Storage), grouped by mode; nothing is pruned. A mode is identified
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

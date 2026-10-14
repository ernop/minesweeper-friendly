# Daily play limits — implementation notes

Spec: [docs/product/play-limits.md](../product/play-limits.md). Index: [AGENTS.md](../../AGENTS.md).

- `play-limits.js` (root, pure, loaded by the game and settings pages after
  `settings-core.js`, whose `DIFFICULTIES` it reads) holds the rules:
  `PLAY_LIMIT_KINDS` (ids `playMinutes`, `games`, `beginnerGames`,
  `intermediateGames`, `expertGames`, `stopAt`; types minutes / games /
  clock), `playLimitsFrom` (validates userdata `playLimits`; throws on an
  unknown id or invalid value), `playDayStart` / `nextPlayDayStart` (local
  4:00 via `setHours`, so clock changes give 23- or 25-hour days),
  `playDayUse` (play time and game counts from the spans started since
  `playDayStart`), `playLimitReached`, `reachedPlayLimits`,
  `nextPlayLimitChange` (next 4:00 or stop time), `playLimitLoosens`,
  `playLimitLoosenLock` ('played' over `PLAY_LIMIT_LOOSEN_MAX_PLAYED_MS`,
  'reached', or null), and the shared formatters. Stop times are minutes
  after local midnight; `playDayMinuteOf` reorders them from 4:00 so 1:00
  is later than 23:00.
- Storage: database version 6 adds the `playSpans` store (`PLAY_SPAN_STORE`,
  keyPath `startedAt`); userdata gains the `playLimits` kind.
  `readPlaySpansSince(fromMs)` reads one play day by key range;
  `persistPlaySpan` puts one span. A span is
  `{ startedAt, lastSeenAt, endedAt | null, width, height, mines, playMode }`.
  Play time derives from the timestamps (`playSpanPlayedMs`): an unfinished
  span seen within `PLAY_SPAN_LIVE_MS` (70 s, above a hidden tab's
  once-a-minute timer) counts to now, an older one to `lastSeenAt`.
- Game page, `game/play-limits.js`: `playSpanBegin` (from `startTimer`)
  saves a span and rewrites it every `PLAY_SPAN_HEARTBEAT_MS` (5 s);
  `playSpanEnd` (from `finish`, the top of `newGame`, and `endTrial`) closes
  it; `savePlaySpanProgress` runs from the page-lifecycle handlers in
  `controls.js` on hide and pagehide. Each save also posts the span on the
  `BroadcastChannel` `PLAY_LIMITS_CHANNEL`, so every open game or settings
  tab counts every tab's play live; the settings page posts `{ limits }`
  after a change. `playLimitBlocksStart()` (ready board and a limit reached)
  guards `revealCell`, `toggleFlag`, and the three board press handlers.
  `newGame` sets `boardDealtClosed` and skips `setupTrialBoard` /
  `setupPregenBoard` while closed, because those deal an opened board and
  start its clock; `renderPlayLimits` calls `newGame` once the limits
  reopen on a board dealt closed. `renderPlayLimits` (end of `newGame`,
  span begin/end, after the startup result restore, each broadcast, and a
  timer at `nextPlayLimitChange`) draws `#play-limits-btn` (first in
  `#top-bar` since 2026-10-14, never hidden: "daily limits" with no limit
  set) and
  `#play-limit-closed`, absolutely positioned over `#game-frame`.
- Settings page, `settings-page.js` "DAILY LIMITS": `#play-limit-table` is
  one CSS grid (rows `display: contents`) built by `renderPlayLimitTable`;
  `#play-limit-dialog` is a modal `<dialog>` drawn by
  `renderPlayLimitDialog` from `playLimitEdit` (`step` edit / confirm).
  `proposePlayLimit` validates and checks `playLimitChangeRefusal`;
  `applyPlayLimit` checks it again, persists, and broadcasts. Esc closes
  only the dialog while it is open.
- Tests: `tests/play-limits-test.js` (rules, clock changes in
  America/Los_Angeles, and the game hooks by source);
  `tests/play-limits-browser-check.js PLAYWRIGHT_CORE_DIR EXECUTABLE
  [SCREENSHOT_DIR]` runs the whole flow on 8099 across a game tab and a
  settings tab.

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
  is later than 23:00. The penalty (2026-10-14): `PLAY_LIMIT_PENALTIES`
  (ids `no-flags-first`, the `DEFAULT_PLAY_LIMIT_PENALTY`, and `closed`),
  `playLimitPenaltySpec` / `playLimitPenaltyFrom` (userdata
  `playLimitPenalty`, absent = the default, unknown id throws),
  `playLimitNoFlagsAmount` (half the limit in its unit, games rounded up, 0
  for a stop time), `playLimitClosingUse`, `playLimitStage` ('open',
  'no-flags', 'closed'), `playDayStage` (the strictest set limit),
  `playLimitPenaltyLoosens`, and `playLimitPenaltyLoosenLock` (any reached
  limit counts as 'reached').
- Storage: database version 6 adds the `playSpans` store (`PLAY_SPAN_STORE`,
  keyPath `startedAt`); userdata gains the `playLimits` kind, and on
  2026-10-14 `playLimitPenalty` (no database version change: userdata kinds
  are keys in one store).
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
  tab counts every tab's play live; the settings page posts `{ limits }` or
  `{ penalty }` after a change. `playLimitBlocksStart()` (ready board and
  `playDayStage` 'closed') guards `revealCell`, `toggleFlag`, and the three
  board press handlers. The no-flags stage: `playSpanBegin` fixes
  `boardFlagsBlocked` from the day's stage before saving the board's span
  (so the stage counts the boards before it); `flagPlacementBlocked()` is
  the live stage on a ready board and `boardFlagsBlocked` after; `rightPress`
  in `controls.js` returns before tracing when it would place a flag on a
  covered square, calling `showFlagRefused` (the `.refused` outline on
  `#play-limits-use` for 1.2 s). `reportResult` writes `flagsBlocked: true`
  from `boardFlagsBlocked`; `GAME_RECORD_SCHEMA` accepts only `true` or
  absent.
  `newGame` sets `boardDealtClosed` and skips `setupTrialBoard` /
  `setupPregenBoard` while closed, because those deal an opened board and
  start its clock; `renderPlayLimits` calls `newGame` once the limits
  reopen on a board dealt closed. `renderPlayLimits` (end of `newGame`,
  span begin/end, after the startup result restore, each broadcast, and a
  timer at `nextPlayLimitChange`) draws `#play-limits-use` (the only child
  of `#top-bar`, hidden while no limit is set, `.reached` in red; its parts
  come from `playLimitUsePart`) and `#play-limit-closed`, absolutely
  positioned over `#game-frame`. The link `#play-limits-btn` (fixed text
  "daily limits", never hidden) is static markup in the first group of
  `#settings-row`, beside `#settings-btn` (2026-10-20; from 2026-10-14 it
  followed the use in the top bar).
- Settings page, `settings-page.js` "DAILY LIMITS": `#play-limit-table` is
  one CSS grid (rows `display: contents`) built by `renderPlayLimitTable`;
  `#play-limit-dialog` is a modal `<dialog>` drawn by
  `renderPlayLimitDialog` from `playLimitEdit` (`step` edit / confirm).
  `proposePlayLimit` validates and checks `playLimitChangeRefusal`;
  `applyPlayLimit` checks it again, persists, and broadcasts. Esc closes
  only the dialog while it is open. The penalty line `#play-limit-penalty`
  (`renderPlayLimitPenaltyLine`, from `renderPlayLimitTable`) opens the same
  `<dialog>`, drawn by `renderPlayLimitPenaltyDialog` from
  `playLimitPenaltyEdit` (radio choices, then the confirm step);
  `applyPlayLimitPenalty` rechecks `playLimitPenaltyChangeRefusal`.
- Tests: `tests/play-limits-test.js` (rules, clock changes in
  America/Los_Angeles, and the game hooks by source);
  `tests/play-limits-browser-check.js PLAYWRIGHT_CORE_DIR EXECUTABLE
  [SCREENSHOT_DIR]` runs the whole flow on 8099 across a game tab and a
  settings tab.

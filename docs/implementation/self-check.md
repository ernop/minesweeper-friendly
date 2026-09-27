# Self-check: implementation

Spec: [docs/product/self-check.md](../product/self-check.md).

- `self-check.html` loads `style.css`, `storage.js`, `observation-context.js`,
  `self-check-core.js`, and `self-check-page.js`, in that order. It does not
  load the game's settings or game-data scripts.
- `self-check-core.js` (pure, no DOM): `SLEEPINESS_SCALE`,
  `ALERTNESS_PROTOCOL` (the test the page runs: 10 stimuli),
  `VIGILANCE_PROTOCOL` (the retired 3-minute test, kept to read its checks),
  `ALERTNESS_PROTOCOLS` (every protocol a stored check can carry), `VIGILANCE_INTERRUPTIONS`,
  `drawVigilanceIsiMs(protocol, unitRandom)`, `scoreVigilance` (thresholds of
  the record's own protocol), `routineBaseline(checks, before, protocolId)` (up
  to `SELF_CHECK_BASELINE_COUNT` = 10
  earlier complete routine checks), `validSelfCheck`, and the backup format
  (`selfCheckFile`, `readSelfCheckFile`). It uses the validators from
  `observation-context.js`.
- `self-check-page.js` defines `storageFailure` and `userdataReady`, which
  `storage.js` calls. `userdataReady` reads the whole `selfChecks` store,
  validates each record, and renders the history.
  - Views (`SELF_CHECK_VIEWS`): home, checkin, instructions, test, and result.
    The body class `vigilance-running` hides the titlebar and heading.
  - Check-in: `beginSelfCheck(occasion)` stamps `startedAt` and the time zone;
    `selectSleepiness`; Continue validates the sleep hours, including
    `validity.badInput`.
  - Test: `startVigilance(startT)` uses the Begin click's `timeStamp`.
    `scheduleNextStimulus(anchorT, feedbackText)` draws each interval.
    `onVigilanceFrame(frameT)` is the only per-frame work: it records the frame
    interval, shows a due stimulus, updates the counter, and applies the
    timeout and the end (once the 10th stimulus's feedback has shown).
    `onVigilancePointerDown` (capture phase, button 0) records the response or
    early press; presses after the 10th stimulus is resolved are not recorded.
    `interruptVigilance(type, t)` handles Esc, `visibilitychange` to hidden,
    window `blur`, and `pagehide`.
  - History marks checks of the retired 3-minute test "(old 3-minute test)" in
    the status column; `routineBaseline` compares each check only with checks
    of its own protocol.
  - `finishVigilance(status, endT)` builds the record, validates it (failure
    is a visible error), and `add`s it to the store. The result and history
    render only after the transaction completes.
  - `importSelfChecks` merges by `startedAt` in one transaction.
  - Archive (`archive.js`): `userdataReady` calls
    `loadArchive(renderSelfCheckArchive)`. `startVigilance` calls
    `suspendArchiveSync()`. The saved check's transaction completion calls
    `requestArchiveSync()` and then `releaseArchiveSync()`, so exactly one
    sync runs. An import also requests a sync.
- `storage.js`: database version 4 creates `SELF_CHECK_STORE` (`selfChecks`,
  keyPath `startedAt`). Every page's `storage.js` cache tag moved together,
  because a stale copy would request version 3 and fail against version 4.
- Game page context (same change): `observation-context.js` loads right after
  `storage.js`. `reportResult` spreads `observedTimeZone(endedAt)` into the
  record. `GAME_RECORD_SCHEMA` validates `timeZone` and `utcOffsetMin`.
  `beginTrace` captures `observedEnvironment()`, and `saveTrace` stores it as
  `environment`.

## Tests

- `node tests/self-check-core-test.js`: freezes the released constants and
  covers known-answer scoring (including the exact 100 ms and 355 ms
  boundaries), validation, the backup round trip, and the baseline window.
- `node tests/self-check-browser-check.js PLAYWRIGHT_CORE_DIR CHROMIUM`:
  - covers the version-3 to version-4 upgrade keeping existing userdata, the
    check-in, answered stimuli with plausible reactions, an early press, a
    stop, stored fields, history, cancel storing nothing, and the backup round
    trip into an emptied store;
  - a complete 10-counter test (about 30 s);
  - it serves the working tree through Playwright request routing under the
    exact origin `http://127.0.0.1:8099/` and aborts every other request, so
    it needs no server and cannot reach whatever listens on that port.

# Local tooling and verification (this machine, learned 2026-08-19)

Index: [AGENTS.md](../../AGENTS.md).

- Since 2026-09-07, port 8018 is owned by the enabled systemd user unit
  `minesweeper-friendly.service`, sourced from `systemd/minesweeper-friendly.service`.
  Start/restart it with `systemctl --user`; logs are in
  `journalctl --user -u minesweeper-friendly.service`. Existing `Linger=yes`
  provides startup at boot before login and operation after logout.
- Serving: `python3 -m http.server 8018 --bind 127.0.0.1` and
  `http://127.0.0.1:8018/` are the canonical local server and exact play
  origin — no improvised hosts or ports (decided 2026-08-22; sessions had
  used 8000, 8099, ...). If that origin is already serving, use the running
  server. Browser storage (IndexedDB, and localStorage before 2026-08-20) is
  per-origin: `localhost:8018` is a different, incorrect score store even
  though it reaches the same machine. `http://127.0.0.1:8018/` is the
  player's real origin. Agent verification
  also runs on 8018 whenever it persists nothing (RAM-only injections
  plus an in-page render, reading, screenshots — `persistUserdata` and
  `saveTrace` untouched). Anything that writes storage — imports, played
  test games, settings changes — runs on `http://127.0.0.1:8099/`, the
  single permanent test origin (junk history expected there), never on any
  other origin.
- Headless browsing (state as of 2026-08-23): no system chromium /
  google-chrome, and `/usr/bin/firefox` is an uninstalled snap stub that
  only prints "snap install firefox" — but Playwright browser builds now
  live under `~/.cache/ms-playwright` (chromium headless shell included),
  installed during an agent verification session. A working harness sits
  in `/tmp/mines-smoke` (puppeteer-core against
  `~/.cache/ms-playwright/chromium_headless_shell-*/.../chrome-headless-shell`,
  launched with `--no-sandbox` — the AppArmor userns restriction forbids
  the sandbox). /tmp is wipeable; reinstalling is one `npm i
  puppeteer-core` plus that executablePath. The Cursor IDE browser (MCP
  server `cursor-ide-browser`) also works when registered, but it exists
  only while an IDE browser tab is open and can disappear mid-session,
  so check availability before planning around it.
- Running game code without a browser: load the `game/` scripts, in
  `index.html` order, in Node via `vm.runInThisContext`, not `eval` (each
  file's 'use strict' makes eval declarations local, so nothing would be
  defined). `tests/game-source.js` exports `files` (that order), `texts`,
  and `source` (their concatenation); tests extract marker- or
  function-delimited spans from `source`. Required shims:
  `document` with `getElementById` (memoize one stub element per id),
  `createElement`/`createElementNS`, `querySelectorAll`,
  `documentElement.style.setProperty`, `addEventListener`; stub elements
  with textContent/innerHTML/hidden/value/dataset, `style.setProperty`,
  `setAttribute`, `addEventListener`, `appendChild`/`append`,
  `querySelector`/`querySelectorAll` (must return 3 elements — `setLcd`
  iterates 3 digit svgs), `classList`, `requestSubmit`,
  `getBoundingClientRect` (trace layout events); globals `localStorage`
  (still required — the version-2 upgrade reads the legacy keys),
  `navigator.clipboard.writeText` (define via Object.defineProperty —
  Node 22 has a global navigator getter),
  `URL.createObjectURL`/`revokeObjectURL`, `performance.now`,
  `window.addEventListener`, and a working `indexedDB` shim: `open`
  fires onupgradeneeded (with `event.oldVersion`,
  `event.target.transaction` supporting addEventListener('complete'))
  then onsuccess on a microtask; `createObjectStore` supports both
  keyPath ('traces') and out-of-line keys ('userdata');
  `transaction(...).objectStore(...)` supports put/get/getAll with
  request onsuccess on a microtask and transaction oncomplete firing
  after all request callbacks (a timer works, since microtasks run
  first). Startup is async — the db open (in storage.js, which the
  harness must load first along with settings-core.js) leads to
  `userdataReady` then `init()`, and `userdataReady` also waits for
  `document.readyState`, so a DOM shim must report it past 'loading'; the
  harness must await (~a timer tick) after loading the
  scripts before touching game state. Since 2026-08-20 the game's
  top-level bindings (history, cells, ...) are reachable from follow-up
  `vm.runInThisContext` snippets, which is how a harness asserts on RAM
  state. This approach ran the real `importHistory` end-to-end for the
  2026-08-19 legacy-history conversion, and the full 2026-08-20
  localStorage-to-IndexedDB migration (fresh start + carried-over data,
  a played game persisting record and trace, import write-through).
- Quick checks: `for f in game/*.js; do node --check "$f"; done` for JS
  syntax; a small
  python3 `html.parser` walker for tag balance in `index.html` (void tags:
  meta, link, input, br, hr, img). Node v22 is installed and fine for
  one-shot data conversion scripts.
- Deploys: `gh` CLI is installed and authenticated. Every push to master
  triggers the "pages build and deployment" workflow; `gh run list` /
  `gh run watch <id> --exit-status` confirm it, and the live site can be
  spot-checked with `curl https://ernop.github.io/minesweeper-friendly/...`.
- Test entry points (2026-09-23): `for t in tests/*-test.js; do node "$t"; done`
  runs every Node suite. The browser checks
  (`tests/startup-browser-check.js`, `tests/board-time-profile-browser-check.js`,
  `tests/rank-highlight-browser-check.js`, `tests/preferences-browser-check.js`,
  `tests/board-metrics-browser-check.js`) take a playwright-core directory and
  a Chromium executable as arguments, and need a server for the repository
  root on `http://127.0.0.1:8099/`. On this machine those arguments are
  `/home/ef/proj/voice-wei/node_modules/playwright-core` and
  `/home/ef/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`.
  `tests/metrics-*-parity.js` compare in-page metrics with the offline
  pipelines (environments: [offline-analysis.md](offline-analysis.md)).

Session/placement layout regression (2026-09-07):
`tests/session-placement-layout-test.html` runs RAM-only fixtures on the test
origin. It checks session chart stability, all three board sizes at 1680/1216/
650px widths, board stability at game end, daily placements within the first
table row, all streak variants in that same collection without section
headings, tables directly beneath the board, collapsed sidebar replay,
tall stats/legend isolation, and compact details opening/closing. It also
checks replay scroll retention, closing back to the finished board, resetting
on a new game, and arrow keys leaving a collapsed replay alone.
Its replay fixture waits for native toggle delivery before rendering the first
frame, so the saved panel state has caught up with the opened details element.
`tests/scroll-position-test.html` checks page and metrics-panel scroll retention
with hidden/tall legends, docked stats, and compact details.

Preference verification (2026-09-21): `node tests/settings-state-test.js`
checks every new preference shape and independent JSON transfer. Browser:
`node tests/preferences-browser-check.js /path/to/playwright /path/to/chromium`
uses only `http://127.0.0.1:8099/` in an isolated profile. Include
`preferences-game.js` between settings-core.js and the `game/` scripts in
game harnesses. Reload begins a fresh unfinished game, but restores the last
finished view/replay when that game's trace is available.

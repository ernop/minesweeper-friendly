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
  so check availability before planning around it. Its screenshots wait
  for a drawn frame, and a tab Cursor is not showing draws none (2026-10-07
  findings, local patch, and stock recipe:
  `~/proj/mybrowser/config/cursor-browser-screenshots.md`).
- Looking at the player's live page on 8018 without writing to it: do not
  scroll it. A scroll saves the page offset to `settings.viewPosition`
  after 150 ms (`flushViewPosition` in `preferences-game.js`). To see the
  whole page, read `document.documentElement.outerHTML` (read-only), strip
  the `<script>` elements, add `<base href="http://127.0.0.1:8018/">`, and
  render the file in Playwright's Chromium with a full-page screenshot.
  Charts are inline SVG, so they survive; `<select>` choices and checkbox
  states do not, and mockups can edit that copy freely.
- Mocking the result screen with real history (used 2026-10-07): open
  `http://127.0.0.1:8099/` in a Playwright Firefox persistent profile under
  `/tmp` at the player's viewport, call `importPreferences` with the
  creator's exported preferences (`viewPosition` zeroed) and `importHistory`
  with their history export, reload until the game count matches, then play
  one game by clicking known-safe cells (`cells[i].mine` is false). Reopening
  the same profile restores that result view, so each mock run injects its
  CSS and DOM changes with `page.evaluate` and screenshots the first screen.
  One Firefox process at a time can hold the profile; parallel launches fail.
  The profile keeps Firefox's HTTP cache (`<profile>/cache2`), and
  `http.server` sends no cache headers, so a reopened profile can run
  scripts older than the working tree; delete `cache2` before each launch.
- README and promo screenshots (2026-10-08): the same sandbox, with
  `updateSettings` opening the stats panel and setting the session to
  "last 7 calendar days" (`pastWeek`), since the history export ended the
  day before and a "today" session would hold only scripted games. Scripted
  Beginner wins (safe-cell clicks about 0.3 s apart) were played until one
  finished in about 5 s, so its rows read as a strong game. Captures: the
  viewport at 1920 x 1080 for the README's top image; at 2560 x 1440,
  element screenshots of `#game-data-column` (band, then distributions),
  `#metrics-panel`, the 3BV/s row's `.chart-help-tip`, and
  `.result-chart-section-perfCharts` / `-relationships`, plus `main` cut
  above "This board" for the promo hero. The card overhangs the game data
  column at that width, so it is captured alone. Restore every changed
  preference afterwards, save the PNGs with Pillow `optimize=True` into
  `promo/` under the capture date, and replace the old files and every
  reference to them (README, `promo/PROMO.md`, AGENTS.md).
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
  triggers GitHub Pages and the Fuseki release workflow; `gh run list` /
  `gh run watch <id> --exit-status` confirm it, and the live site can be
  spot-checked with `curl https://minesweeper-friendly.fuseki.net/...`.
  `https://ernop.github.io/minesweeper-friendly/` redirects there.
- Test entry points (2026-09-23): `for t in tests/*-test.js; do node "$t"; done`
  runs every Node suite; also run `python3 tests/hosting-release-test.py`,
  which fails when a page loads a file missing from `deploy/runtime-files.json`.
  The browser checks
  (`tests/startup-browser-check.js`, `tests/trace-capture-browser-check.js`,
  `tests/board-time-profile-browser-check.js`,
  `tests/rank-highlight-browser-check.js`, `tests/preferences-browser-check.js`,
  `tests/board-metrics-browser-check.js`, `tests/training-browser-check.js`,
  `tests/chord-buttons-browser-check.js`, `tests/problems-browser-check.js`)
  take a playwright-core directory and
  a Chromium executable as arguments, and need a server for the repository
  root on `http://127.0.0.1:8099/`. On this machine those arguments are
  `/home/ef/proj/voice-wei/node_modules/playwright-core` and
  `/home/ef/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`.
  `tests/self-check-browser-check.js` (runs a complete 10-counter test),
  `tests/switch-cost-browser-check.js` (optional third argument: a
  screenshot path for the panel's top with the switch-cost card open), and
  `tests/archive-browser-check.js` take the same two arguments but
  need no server: they serve the working tree through Playwright request
  routing under the exact origin `http://127.0.0.1:8099/` and abort every
  other request, so they run even while something else holds that port.
  Routing serves workers in Chromium only: Firefox does not route the
  requests a worker makes itself (`importScripts`), so a Firefox check that
  runs workers needs the 8099 server.
  `tests/metrics-*-parity.js` compare in-page metrics with the offline
  pipelines (environments: [offline-analysis.md](offline-analysis.md)).

Session/placement layout regression (2026-09-07):
`tests/session-placement-layout-test.html` runs RAM-only fixtures on the test
origin. It checks session chart stability, all three board sizes at 2560/1680/
1216/650px widths, board stability at game end, the board centered in its
column, the session summary left of the board and ranks won right of it
exactly where each fits (both beside a beginner board at 2560), below the
board the summary heading one left column with ranks won under it and later
tables beside or under that column (beside it at 1680), all streak variants
in that same collection without section
headings, tables directly beneath the board and the blocks beside it, collapsed sidebar replay,
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

Analysis performance checks (2026-09-25):
`tests/analysis-worker-test.js` loads the real worker without any DOM and
compares streamed/restored metrics with complete-prefix calculations.
`tests/analysis-isolation-browser-check.js` holds worker loading while testing
real play/restart/restoration and error visibility.
`tests/game-end-performance-browser-check.js` runs a 2,000-record fixture and
fails if expensive analytics execute in the window. Both browser checks use
the same Playwright/Chromium arguments and 8099 origin listed above.
`node tests/performance-benchmark.js BASELINE_GIT_REVISION` compares exact
outputs and median-of-three computation times with the named git revision;
it never opens player storage. Timing observations are not pass thresholds.

Latency check (2026-09-26, creator request, cut to basics the same day: "keep
just basic timing stuff please so we notice if we megaslowdown again"; spec:
[Input latency](../product/board-and-layout.md#input-latency-user-report-2026-09-26)):
`node tests/latency-browser-check.js PLAYWRIGHT_CORE_DIR firefox|chromium EXECUTABLE [--record]`
takes about 10 seconds. In a fresh profile on 8099 with a synthetic
6,500-game history, on a fixed board, it times page load, new game, the first
click, a dozen more clicks, the click that shows a mine, and switching to
expert, plus the longest freeze in the two seconds after that game ends. Each
input gets two numbers: `*WorkMs`, how long the game's own handlers ran for it
(only our code affects this), and `*Ms`, input to the first task after the
next frame (what the player sees, including up to one 16.7 ms frame of
waiting). Unlike the checks above, these are pass thresholds: any value over
`tests/latency-budgets.json` fails, and the file must name exactly the
measured metrics. The limits sit just above the worst of three Firefox runs
(creator decision 2026-09-26, below). `--record` appends the run to
`tests/latency-history.jsonl`; `node tests/latency-history.js` prints recorded
runs against the budgets. On this machine: Playwright
`/home/ef/proj/voice-wei/node_modules/playwright-core`, Firefox
`/home/ef/.cache/ms-playwright/firefox-1538/firefox/firefox` (the engine the
creator plays in), Chromium
`/home/ef/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`.

Hosting verification (2026-09-26): `python3 tests/hosting-release-test.py`
checks the committed-runtime artifact. `tests/hosting-browser-check.js` takes
the same Playwright and Chromium arguments as the other browser checks and
uses only 8099. It asserts the hosted response headers, so a plain
`python3 -m http.server` fails its first header check; a server that adds the
live site's headers (as `curl -sI https://minesweeper-friendly.fuseki.net/`
shows them) runs it (2026-09-28). `python3 tests/hosting-http-check.py` targets the isolated
nginx fixture with deliberately forbidden files and a symlink probe. Details:
[hosting implementation](hosting.md).

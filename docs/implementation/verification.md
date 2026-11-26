# Local tooling and verification

Index: [AGENTS.md](../../AGENTS.md).

## Origins and local servers

- **Player origin (`http://127.0.0.1:8018/`):** canonical local play origin, owned on PC by the enabled systemd user unit `minesweeper-friendly.service` (`systemd/minesweeper-friendly.service`, `Linger=yes`). Manage with `systemctl --user status/restart minesweeper-friendly.service` and `journalctl --user -u minesweeper-friendly.service`; never start a second manual server on `8018`, and never use `localhost:8018` (IndexedDB is origin-scoped).
  - Read-only verification on `8018` is permitted only when it persists nothing (`persistUserdata` and `storeGame` untouched). **Never scroll the player's live page on `8018`:** scrolling persists `settings.viewPosition` after `150 ms` (`flushViewPosition`). To screenshot the full page read-only, capture `document.documentElement.outerHTML`, strip `<script>` tags, prepend `<base href="http://127.0.0.1:8018/">`, and render in Playwright Chromium.
- **Test origin (`http://127.0.0.1:8099/`):** single permanent origin for anything writing storage (imports, played test games, settings changes, browser checks). Serve the repo root with:
  ```bash
  python3 -m http.server 8099 --bind 127.0.0.1
  ```

## Standard Node & CI suites (~25 s total)

Run before every push (matches `.github/workflows/hosting.yml`):

```bash
python3 tests/hosting-release-test.py
for t in tests/*-test.js; do node "$t"; done
```

Quick syntax check: `for f in game/*.js; do node --check "$f"; done`.

Offline metric parity checks (`tests/metrics-*-parity.js`) compare in-page metrics against offline pipelines ([offline-analysis.md](offline-analysis.md)).

## Browser checks and speed rules

- **Run only checks covering the changed code** (~10 s each; running all takes `> 2 min`).
- **Never wait out a stall:** a command expected under 1 min still running at 2 min is stalled — stop it and diagnose before rerunning.
- **Machine Playwright & browser paths:**
  - `linux-pc`: Playwright `/home/ef/proj/voice-wei/node_modules/playwright-core`; Firefox (player's engine) `/home/ef/.cache/ms-playwright/firefox-1538/firefox/firefox` (also `firefox-1555`); Chromium headless shell `/home/ef/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell` (also `1248`; pass `--no-sandbox` under AppArmor userns restrictions); Chromium full `/home/ef/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome` (also `1248`).
  - `windows-laptop`: Playwright `C:\Users\ernes\AppData\Local\npm-cache\_npx\e41f203b7505f1fb\node_modules\playwright-core`; Firefox `%LOCALAPPDATA%\ms-playwright\firefox-1543\firefox\firefox.exe`.
  - `cloud-vm`: 2-vCPU Ubuntu 24.04 cloud agent VM; Playwright from `voice-wei/node_modules/playwright-core`; Firefox 157 `/opt/ms-playwright/firefox-1555/firefox/firefox` (~22 s latency run; all 16 metrics budgeted).

### Browser check entry points

- **Require `127.0.0.1:8099` server** (`node <check> <playwright-core> <chromium-exe>`):
  - `tests/startup-browser-check.js`
  - `tests/trace-capture-browser-check.js`
  - `tests/board-time-profile-browser-check.js` (also runs `tests/session-placement-layout-test.html`)
  - `tests/rank-highlight-browser-check.js`
  - `tests/preferences-browser-check.js`
  - `tests/board-metrics-browser-check.js`
  - `tests/training-browser-check.js`
  - `tests/chord-buttons-browser-check.js`
  - `tests/coach-browser-check.js`
  - `tests/during-game-browser-check.js`
  - `tests/play-limits-browser-check.js`
  - `tests/problems-browser-check.js`
  - `tests/analysis-isolation-browser-check.js`
  - `tests/game-end-performance-browser-check.js` (2,000-record fixture; poisons main-thread analytics)
- **Take engine argument (`node <check> <playwright-core> chromium|firefox <exe>`, require `8099`):**
  - `tests/page-errors-browser-check.js` — run in **both** `chromium` and `firefox` after changing `page-errors.js` (stacks differ by engine).
  - `tests/score-list-browser-check.js` (~5 s Chromium, ~7 s Firefox).
- **Self-routed (no `8099` server needed in Chromium; route requests under exact `http://127.0.0.1:8099/`):**
  - `tests/self-check-browser-check.js`
  - `tests/switch-cost-browser-check.js` (optional 3rd arg: screenshot path)
  - `tests/trial-opening-browser-check.js`
  - `tests/archive-browser-check.js`
  - *Note:* Playwright request routing does not intercept worker `importScripts` in Firefox; Firefox worker checks require a live `8099` server.
- **Static RAM-only HTML layout fixtures (open on `8099`):**
  - `tests/session-placement-layout-test.html` (board-first layout, adaptive right/left/below dock, overview band, rankings opener, closed-table width lock, replay transport and playback; keeps fixed-height results box above the iframe so Firefox does not throttle off-screen iframe `requestAnimationFrame`).
  - `tests/scroll-position-test.html` (scroll retention across layout and motion-stats updates).

## Firefox latency check (`tests/latency-browser-check.js`)

Spec: [Startup readiness and responsiveness](../product/board-and-layout.md#startup-readiness-and-responsiveness).

```bash
node tests/latency-browser-check.js \
  /home/ef/proj/voice-wei/node_modules/playwright-core \
  firefox \
  /home/ef/.cache/ms-playwright/firefox-1538/firefox/firefox \
  [--record]
```

- Requires `127.0.0.1:8099` server and gitignored `tests/latency-machine.txt` (`linux-pc`, `windows-laptop`, or `cloud-vm`; exits immediately if missing). Takes ~15 s on `linux-pc` (~22 s on `cloud-vm`).
- Measures startup, new game, first click, 12 clicks, mine reveal, board-size switch to Expert, post-loss freeze (`10 ms` timer gaps over `2 s`), plus a full flagged Expert win (`229` clicks, 3BV `193`): `winClickWorkMs`, `winClickMs`, `afterWinFreezeMs`, and `expertWinResultsMs` (winning click until full results complete with no `aria-busy`, including worker tasks).
- **Strict pass thresholds (`tests/latency-budgets.json`, per machine):** budgets sit just above worst measured Firefox runs (tighten when faster; loosen only by recorded creator decision; only `expertWinResultsMs` may loosen while play/win-click/freeze stay tight).
  - Run unrecorded when finishing any change to gameplay, game end, storage, startup, or result layout.
  - Before pushing, commit code changes first, run with `--record` against `HEAD`, and commit the single appended `tests/latency-history.jsonl` line separately as `"Record latency for <commit>: ..."`.
  - Inspect history against budgets with `node tests/latency-history.js`.
  - `windows-laptop` currently lacks `expertWinResultsMs` / `winClick*` / `afterWinFreezeMs` budgets (prints measurements until three runs set them).
- `node tests/performance-benchmark.js <git-rev>` compares exact outputs and median-of-three Node computation times against a baseline commit (informational, not pass thresholds).

## Hosting and deploy checks

- Every push to `master` runs `.github/workflows/hosting.yml` and deploys to `https://minesweeper-friendly.fuseki.net/`. Confirm with `gh run list` / `gh run watch <id> --exit-status`, and optionally spot-check with `curl -sI https://minesweeper-friendly.fuseki.net/VERSION`.
- `tests/hosting-browser-check.js` asserts live response headers on `8099` (plain `http.server` lacks those headers; use a header-injecting local server matching `curl -sI https://minesweeper-friendly.fuseki.net/`).
- `python3 tests/hosting-http-check.py` tests the isolated nginx fixture against forbidden files and symlink probes ([hosting implementation](hosting.md)).

## Running `game/` scripts in Node harnesses

Load `game/` scripts in `index.html` order via `vm.runInThisContext` (not `eval` — `'use strict'` scopes `eval` declarations locally). `tests/game-source.js` exports `{ files, texts, source }` in exact load order.

- Required shims: `document` (`getElementById` memoized per id, `createElement`/`createElementNS`, `querySelector`/`querySelectorAll` returning 3 elements for LCD digits, `documentElement.style.setProperty`, `readyState` past `'loading'`), `localStorage` (DB v2 upgrade), `navigator.clipboard.writeText` (via `Object.defineProperty` on Node 22), `URL.createObjectURL`/`revokeObjectURL`, `performance.now`, `window.addEventListener`, and an async `indexedDB` shim (`onupgradeneeded` + `onsuccess` + `oncomplete` on microtask/timer). Load `storage.js`, `settings-core.js`, and `preferences-game.js` before `game/` scripts, then await a timer tick for `userdataReady` → `init()`.

## Mocking real history & retaking promo screenshots

- **Persistent Firefox profile mock on `8099`:** open `http://127.0.0.1:8099/` in a Playwright Firefox persistent profile under `/tmp`, call `importPreferences` (`viewPosition` zeroed) and `importHistory`, reload until counts match, and play one game. Only one Firefox process can hold a profile at once; **delete `<profile>/cache2` before each launch** because `http.server` sends no cache headers.
- **README & promo screenshots (~30 s, requires `8099` server + Pillow):**
  ```bash
  node tests/promo-screenshots.js \
    /home/ef/proj/voice-wei/node_modules/playwright-core \
    /home/ef/.cache/ms-playwright/firefox-1538/firefox/firefox \
    <history-export.json> <YYYY-MM-DD>
  ```
  Writes 7 PNGs into `promo/` under `<YYYY-MM-DD>` (shifting `Date` to 7 min after the export's last game, scripting a realistic 10–12 3BV Beginner win at `2.35` 3BV/s with `2` flags, and capturing 1920×1080 full layout, 2560×1440 hero, Game Data band/distributions/card, live perf charts, and relationship charts). After retaking, delete old date-stamped PNGs and update image paths and alt texts in [README.md](../../README.md) and [promo/PROMO.md](../../promo/PROMO.md).

# Public hosting

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/hosting.md](../implementation/hosting.md).

## Hosting design and security boundaries

- **Canonical origin:** `https://minesweeper-friendly.fuseki.net/`, independently maintained in `ernop/minesweeper-friendly` and deployed automatically on every passing push to `master`. Cross-project multi-app hosting policy lives in Fuseki's `docs/product-requirements.md`.
- **Origin isolation:** each Fuseki application gets its own HTTPS origin (`https://minesweeper-friendly.fuseki.net/`, separate from `edit.fuseki.net` and other apps) because paths alone do not isolate IndexedDB, `localStorage`, service workers, or editor cookies.
- **GitHub Pages redirect:** GitHub Pages still publishes `master`, and `pages-redirect.js` (loaded first on every page, running only on `ernop.github.io`) redirects visitors to `https://minesweeper-friendly.fuseki.net/` preserving path, query, and hash. Browser history stays origin-scoped; players transfer data via explicit export/import.
- **Footer link:** game footer links to `https://minesweeper-friendly.fuseki.net/` labeled `"play on Fuseki"`.
- **Runtime-only release:** publish only files declared in `deploy/runtime-files.json` (never exports, research, tests, git metadata, or secrets). Failed uploads never modify live releases, and deploy credentials grant no shell, `sudo`, or cross-app write access.
- **Local-only stays local:** features contacting local services (such as music detection) run strictly on the local canonical origin; hosted CSP forbids connections beyond the site's own origin.
- **Visitor count:** nginx access logs on `minesweeper-friendly.fuseki.net` count origin visits independently of play statistics (`edit.fuseki.net` excluded).

## Play statistics

First-party play telemetry hosted solely on `https://minesweeper-friendly.fuseki.net/` (GET `/_event` on the same origin → private nginx log → private staff dashboard; zero third parties; disabled on local origins, GitHub Pages, and tests). All players including the creator count equally.

- **Shared module (`fuseki-stats.js`):** copied byte-for-byte from `fuseki4_ai` (never edited here). Stores a random player id (`localStorage['fuseki-stats-player']`) and per-load id. Emits `play` (first input per load), `game` (per finished game/attempt), and `time` (on hide/close and every `10` active minutes, counting visible time within `5 min` of input). Carries only numbers, booleans, and short tokens — never free text, state tags, notes, history, or traces.
- **Game page `game` event:** sent once when a finished game's record saves (never on abandon, replay, score view, import, or backfill):

| Key | Value |
| --- | --- |
| `m` | `<level>:<playMode>` plus `:<generatorId>` when non-default generator applies (`expert:standard`, `custom-20x12-50:test-trial`) |
| `r`, `d` | `win` or `loss`; final time in seconds (ms precision) |
| `w`, `h`, `mines` | board dimensions and mine count |
| `g_<key>` | generator parameters in schema order (present strictly when `m` names a generator) |
| `guardian_angel` | whether Guardian Angel was enabled (named `just` prior to `2026-11-23`) |
| `bbbv`, `clicks`, `flags` | record 3BV (remaining 3BV for Endgame drill), `boardChangingClicks`, `flagsPlaced` |
| `bbbvs`, `eff`, `ioe` | `3BV/s`, efficiency %, IOE (wins only, matching result screen) |

- **Companion pages:** `problems.html` and `self-check.html` emit `game` events (`m` = `problem`, `last-flag-drill`, `pointing-test`, `self-check`; `r` = outcome; `d` = duration s; self-checks never send ratings, sleep hours, notes, or reaction times). `training.html`, `settings.html`, and `guardian-angel-help.html` emit only `play` and `time`.
- **Anti-Fallback exception:** telemetry must never slow or interrupt play — failures log to console only and never raise.
- **Disclosure:** the game page's `data format` card ends with: `"On minesweeper-friendly.fuseki.net, play statistics — a random player number, active time, and game results such as level, time and 3BV/s — are recorded on the site's server."`

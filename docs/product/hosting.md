# Public hosting

Product spec; indexed by [PRODUCT.md](../../PRODUCT.md).

## Request (2026-09-26)

Review fuseki.net and its independently maintained repository applications,
including existing Voice-Wei, add Minesweeper Friendly, and prepare for
Nectaris Remake later. Plan and thoroughly test the security and deployment
boundaries before implementation. Nectaris is a future launch, not a request
to publish it now.

Clarified goals (creator, 2026-09-26): one generic, security-first
arrangement for the Fuseki main site and all related projects. New projects
are posted often, each from its own repository, with minimal per-project
setup; the main site keeps evolving with its own dynamic features; routes,
hostnames, deployments, and site links stay coordinated. Security is a
primary requirement. Fuseki's
[product requirements](https://github.com/ernop/fuseki4_ai/blob/master/docs/product-requirements.md#independently-deployed-applications)
own this cross-project requirement; the current implementation serves
Minesweeper alone.

Launch timing (creator, 2026-09-26): public activation on fuseki.net happens
"asap, once the overall edit.fuseki.net change is done". That change moves
the private Fuseki editor to its own origin (`edit.fuseki.net`) first, so no
page on fuseki.net or on an app subdomain shares the editor's origin or
cookies.

## Hosting design

- Each application keeps its own repository and deploys independently.
- New applications use separate HTTPS browser origins. The intended game
  origin is `https://minesweeper-friendly.fuseki.net/`; the Fuseki project
  path remains a discoverable entry point. Paths alone do not isolate
  IndexedDB, localStorage, service workers, or authenticated editor access.
- The public, canonical game is `https://minesweeper-friendly.fuseki.net/`
  (creator, 2026-09-26). GitHub Pages still publishes the repository, and
  every page there redirects visitors to that origin, keeping the path,
  query, and hash. The redirect runs only on `ernop.github.io`. Scores,
  traces, and settings stay in the browser at the origin where they were
  saved; a Pages history does not appear on Fuseki. Use the existing
  explicit export/import controls to transfer them. Hosting never uploads
  scores, traces, or settings; the hosted site receives only the
  [play statistics](#play-statistics) below.
- The game page's footer links to `https://minesweeper-friendly.fuseki.net/`
  with the label "play on Fuseki", replacing its GitHub repository link
  (creator, 2026-09-27).
- Visits to `https://minesweeper-friendly.fuseki.net/` are included in the
  Fuseki origin visitor count (decided 2026-09-26). The count is the nginx
  access log, not a script on the page; the [play statistics](#play-statistics)
  are a separate record. The game's pages are recorded under that hostname.
  `edit.fuseki.net` is not part of the count.
- Publish only the playable runtime, including worker dependencies and the
  `game/` directory. Never publish personal exports, research, tests, source
  control metadata, or configuration secrets.
- Local-only features stay local (creator, 2026-09-26): music detection runs
  only on the player's own local origin, so hosted copies never contact a
  visitor's localhost and their CSP allows no connection beyond the game's
  own origin ([Music playing](per-game-stats.md)).
- A failed or incomplete upload must not change the live release. Deploy
  credentials must not grant shell access, sudo, or writes to another app.
- Voice-Wei's existing editor integration and saved browser data require
  their own tested transition before changing its origin. Preserve its
  current behavior during the Minesweeper launch.

## Play statistics

Creator decision, 2026-10-11: each of his hosted applications reports play
statistics to its own server — how many players, how long they play, how many
games, and the games' results; for Minesweeper "the level and score etc." and
the time the player got. A persistent random player number and detailed game
data are allowed. The creator's own play counts like anyone's (no exclusion).

- Where: only `https://minesweeper-friendly.fuseki.net/`. Each event is one
  GET to `/_event` on that same origin; nginx writes it to a private log, and
  a private analytics worker aggregates the log for the creator's staff-only
  dashboard. Nothing goes to any third party. Local runs (the player origin
  and the test origin), the GitHub Pages copy, and tests send nothing.
- Every page loads Fuseki's shared module, `fuseki-stats.js`, unchanged. It
  keeps a random player number in the browser (`localStorage` key
  `fuseki-stats-player`) and a random number per page load. It sends `play`
  at a page load's first input, `game` per finished game or attempt, and
  `time` when the page is hidden or closed and after every 10 active minutes.
  Every event carries the page path and the active seconds since the previous
  event (page visible, with an input in the last 5 minutes). Values are
  numbers, booleans, and short tokens only: no free text, state tags, notes,
  history, or traces.
- Game page: one `game` event when a finished game's record is saved, win or
  loss. A board abandoned mid-game records nothing and sends nothing. No
  event on re-render, replay, score views, imports, or backfills. Fields:

  | Key | Value |
  | --- | --- |
  | `m` | `<level>:<play mode>`, plus `:<generator id>` when the mode places mines with the Generator menu's choice and that choice is not the default `uniform`; for example `expert:standard`, `expert:standard:pink-noise`, `custom-20x12-50:single-path-ng` |
  | `r` | `win` or `loss` |
  | `d` | the final time in seconds as the result shows it (millisecond precision) |
  | `w`, `h`, `mines` | board width, height, and mine count |
  | `g_<key>` | each parameter of the generator in `m`, in schema order, present exactly when `m` names a generator (pink noise: `g_alpha`, `g_scale`, `g_contrast`, `g_stretch`) |
  | `just` | whether A just universe was on for the game |
  | `bbbv` | the record's 3BV (an Endgame drill's: the presented remnant's) |
  | `clicks`, `flags` | board-changing clicks; flags placed |
  | `bbbvs`, `eff`, `ioe` | 3BV/s, efficiency in percent, and IOE, present exactly where the result screen shows them (wins) |

  The level is `beginner`, `intermediate`, or `expert` when the board is
  exactly that preset, otherwise `custom-<W>x<H>-<M>`; the play mode is its
  id, such as `standard`, `uniform-ng`, `endgame-drill`, or `trial`. `m` is
  the comparable unit (level, play mode, generator) so per-mode best and
  median times stay meaningful; it is the game's top score key without the
  generator's parameters, which follow as `g_<key>`.

- Problems page and self-check: one `game` event when a problem attempt, a
  last-flag drill attempt, a pointing-test run, or a self-check's alertness
  test is saved, with `m` naming it (`problem`, `last-flag-drill`,
  `pointing-test`, `self-check`), `r` its saved outcome (for example
  `solved`, `mine`, `timeout`, `abandoned`, `interrupted`, `complete`), and
  `d` its duration in seconds. A self-check event never carries the
  sleepiness answer, sleep hours, note, or reaction times. The training,
  settings, and help pages send only `play` and `time`.
- Statistics never interrupt or slow play: a failed call is logged to the
  browser console and never raised, and a page without the module sends
  nothing. This is a deliberate exception to the anti-fallback rule in
  [AGENTS.md](../../AGENTS.md).
- Disclosure: the game page's data-format card ends with "On
  minesweeper-friendly.fuseki.net, play statistics — a random player number,
  active time, and game results such as level, time and 3BV/s — are recorded
  on the site's server." The host is named so the line is also true on local
  copies, which send nothing.

Implementation, launch prerequisites, and evidence:
[hosting implementation](../implementation/hosting.md).

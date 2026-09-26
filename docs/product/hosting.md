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
  explicit export/import controls to transfer them. Hosting does not upload
  player data.
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

Implementation, launch prerequisites, and evidence:
[hosting implementation](../implementation/hosting.md).

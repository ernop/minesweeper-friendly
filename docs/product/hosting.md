# Public hosting

Product spec; indexed by [PRODUCT.md](../../PRODUCT.md).

## Request (2026-09-26)

Review fuseki.net and its independently maintained repository applications,
including existing Voice-Wei, add Minesweeper Friendly, and prepare for
Nectaris Remake later. Plan and thoroughly test the security and deployment
boundaries before implementation. Nectaris is a future launch, not a request
to publish it now.

## Hosting design

- Each application keeps its own repository and deploys independently.
- New applications use separate HTTPS browser origins. The intended game
  origin is `https://minesweeper-friendly.fuseki.net/`; the Fuseki project
  path remains a discoverable entry point. Paths alone do not isolate
  IndexedDB, localStorage, service workers, or authenticated editor access.
- Keep the existing GitHub Pages game available. Scores, traces, and settings
  stay in the browser at their original origin; use the existing explicit
  export/import controls to transfer them. Hosting does not upload player data.
- Publish only the playable runtime, including worker dependencies and the
  `game/` directory. Never publish personal exports, research, tests, source
  control metadata, or configuration secrets.
- A failed or incomplete upload must not change the live release. Deploy
  credentials must not grant shell access, sudo, or writes to another app.
- Voice-Wei's existing editor integration and saved browser data require
  their own tested transition before changing its origin. Preserve its
  current behavior during the Minesweeper launch.

Implementation, launch prerequisites, and evidence:
[hosting implementation](../implementation/hosting.md).

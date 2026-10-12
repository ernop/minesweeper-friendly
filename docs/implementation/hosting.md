# Fuseki hosting implementation

Specification: [public hosting](../product/hosting.md).

## Plan and acceptance criteria (2026-09-26)

1. Inspect live HTTP responses, nginx configuration, DNS, app requirements,
   publication ownership, and existing deployment identities.
2. Build an explicit runtime artifact from a Git revision, validate every
   dependency, and reject private files and symlinks.
3. Use a root-installed receiver running as a dedicated unprivileged account.
   Accept one bounded artifact, validate it, then atomically select its release.
   Keep app releases outside Fuseki's disposable publisher output.
4. Serve the game on its own HTTPS hostname with an app-specific CSP,
   correct MIME types, revalidation, no directory listing or PHP execution.
5. Test artifact completeness, traversal and link rejection, failed uploads,
   publication atomicity, route reservations, browser workers, settings,
   gameplay, and persistence. Check existing Fuseki and Voice-Wei routes.
6. Configure DNS and TLS before enabling redirects or automated deployment;
   verify live content against the exact deployed revision.

## Findings

- fuseki.net uses nginx 1.24 on `tpbeta`, with a private Django editor and
  static publication. `/voice-wei/` aliases `/srv/voice-wei/site`.
- The August hosting proposal omitted the now-required `game/` scripts and
  used non-atomic rsync into the live directory. It also added another app
  to the editor's browser origin. This design supersedes that proposal.
- Voice-Wei intentionally calls the editor's authenticated voice-draft API.
  It also stores provider keys and preferences in origin-local storage.
  A redirect-only migration would break both access and saved state.
- The proposed app hostnames did not resolve at review time. Existing TLS
  covers only fuseki.net and www.fuseki.net. DNS access has been requested.
- The server had about 3.8 GiB free. The game is small, but release storage
  must be bounded; do not remove unrelated application data to make room.
- Existing uncommitted gameplay/measurement work is outside this change;
  it must not be accidentally committed or released by hosting tooling.

## Implementation and verification

- `index.html`'s `#site-footer` links to the canonical game on Fuseki with
  the label "play on Fuseki" (2026-09-27).
- `deploy/runtime-files.json` owns the explicit public runtime list;
  `tests/hosting-release-test.py` fails when a page or worker loads a file
  missing from it.
- `deploy/build-release.py` builds deterministic tar bytes and hashes from one
  commit, including its allowlist; it never reads uncommitted runtime changes.
- `deploy/publish.py` uses a pinned host key and the sole SSH command `publish`,
  then verifies the public VERSION. The root-installed receiver is maintained
  by the Fuseki repository, not writable by this app's credential.
- `.github/workflows/hosting.yml` verifies every master push and then releases
  it (automatic since the 2026-09-26 launch); its `production-fuseki`
  environment is restricted to master and contains the dedicated key. The
  workflow writes the key file with its final newline, which OpenSSH requires
  and the stored secret lacks (the first deploy attempt failed on exactly this).
- Three artifact tests, nine receiver tests, 41 committed-runtime Node suites,
  and 463 Fuseki Django tests passed. Actual nginx 1.24 checks verified all 52
  published file hashes (runtime plus VERSION), MIME, gzip, 304s, headers,
  forbidden paths, symlinks, listing, and write methods.
- Chromium verified startup, workers, completed-game persistence, settings
  import/navigation, history download, and help under the actual CSP without
  page errors or policy violations. Worker-delay/isolation and a 2,000-record
  completion test also passed. All storage writes used an isolated profile at
  `http://127.0.0.1:8099/`, never the player's local origin or real profile.
- `tests/hosting-browser-check.js` exercises the hosted artifact;
  `tests/hosting-http-check.py` also requires the deliberate forbidden-file
  and symlink fixtures described in the host review.

## Play statistics (2026-10-11)

Specification: [Play statistics](../product/hosting.md#play-statistics).

- `fuseki-stats.js` is fuseki4_ai's `setup/apps/fuseki-stats.js`, copied
  byte for byte (sha256 `8401cc4aa487031fdd58513e532d29973fa0159e65f823de01415fca37bef30f`
  on 2026-10-11, when that file was not yet committed there). Never edit it
  here: copy the canonical file again and confirm with `cmp`. It sends only on
  `minesweeper-friendly.fuseki.net`, to `/_event`; on any other host its
  `game` and `engaged` do nothing and it installs no listener or timer.
- Every root page loads it with one shared `?v=` tag: `index.html` deferred,
  just before the `game/` scripts (`game/main.js` stays last); the other
  pages as their first body script. It is in `deploy/runtime-files.json`.
  Fuseki's receiver policy for this app already accepts root `.js` files.
- Game page: `reportResult` (`game/results.js`) calls
  `FusekiStats.game(playStatisticsFields(record))` right after
  `appendGameRecord`. `flushPendingResult` clears the pending outcome before
  calling `reportResult`, so a game is finalized once, and nothing else calls
  the module. `playStatisticsFields` reads only the record, `config`, and
  `gameGenerator`: `difficultyNameOf` (shared with `boardDisplayLabelOf`)
  names the level, `generatorAppliesToMode` decides `gen`, and
  `shownMeasurement` (shared with the result screen's `measurementRow`)
  supplies 3BV/s, efficiency, and IOE where the result screen shows them.
- Subpages: `problems-page.js` `reportPlayStatistics` runs on transaction
  completion in `finishAttempt`, `finishDrillAttempt`, and `finishPointing`;
  `self-check-page.js` `finishVigilance` sends on its transaction completion.
- Each call is `try { if (window.FusekiStats) ... } catch (error) {
  console.error(error); }`; these are the runtime's only `console.error`
  calls.
- An Expert win sends, for example:
  `/_event?v=1&e=game&p=<player>&s=<page load>&n=2&t=74&pg=%2F&m=expert&r=win&d=61.234&w=30&h=16&mines=99&pm=standard&gen=uniform&just=1&bbbv=152&clicks=180&flags=70&bbbvs=2.482&eff=84.444&ioe=0.817`.
- `tests/play-statistics-test.js` checks that every page loads the module
  under one tag and that local, test, and Pages origins send nothing. It
  runs the real deferral chain and `reportResult` for three games (Expert
  Standard win, custom Single-path NG loss, Endgame drill win). Each sends
  exactly one event, after the record is saved, with the exact fields and
  encoded URL; a second flush, the fallback timer, and the analysis answer
  send nothing more. It also checks that the four subpage finish points send
  once, only after the save completes.
- The hosted pings need Fuseki's `/_event` location (fuseki4_ai
  `setup/nginx/minesweeper-friendly.conf`). Before it serves, they get 404
  responses, which the module ignores but browsers list as failed requests
  and the vhost access log records. Release this after the location is live.

## Launch status

The dedicated server account, root-owned receiver, SSH restrictions, and
master-only GitHub environment are installed. The initial committed runtime
is seeded and hash-verified; an incomplete upload was rejected without
changing it. The temporary local private key was deleted. Actual SSH tests rejected shell
commands, command injection, and rsync to Voice-Wei.

Live since 2026-09-26, after the Fuseki editor moved to `edit.fuseki.net`
(creator's order): DreamHost A record `minesweeper-friendly.fuseki.net ->
146.190.147.109` plus CAA `0 issue "letsencrypt.org"` on fuseki.net, a separate
Let's Encrypt certificate, the vhost with `connect-src 'self'` (music detection
is local-only), and `fuseki.net/minesweeper`, `/minesweeper/`, and
`/minesweeper-friendly/...` redirecting there with path and query kept.
GitHub Pages (`ernop.github.io/minesweeper-friendly`) redirects visitors to
the same origin, path, query, and hash kept; the redirect runs only on that
host.
`scripts/enable_minesweeper_https.sh` checked the live VERSION before nginx's
asynchronous reload had taken effect and stopped; the entry snippet was then
installed by hand with the same validation.

The authoritative cross-repository procedure and review are in
[Fuseki's independent application hosting plan](https://github.com/ernop/fuseki4_ai/blob/master/docs/minesweeper-friendly-hosting-plan.md).
Voice-Wei migration and Nectaris launch remain separate follow-up work;
see [BACKLOG.md](../../BACKLOG.md).

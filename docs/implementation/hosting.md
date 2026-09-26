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
`scripts/enable_minesweeper_https.sh` checked the live VERSION before nginx's
asynchronous reload had taken effect and stopped; the entry snippet was then
installed by hand with the same validation.

The authoritative cross-repository procedure and review are in
[Fuseki's independent application hosting plan](https://github.com/ernop/fuseki4_ai/blob/master/docs/minesweeper-friendly-hosting-plan.md).
Voice-Wei migration and Nectaris launch remain separate follow-up work;
see [BACKLOG.md](../../BACKLOG.md).

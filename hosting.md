# Hosting at fuseki.net/minesweeper-friendly

The contract between this game and the fuseki.net server. Hand this file
to the fuseki.net project; everything the server must provide is here.

## Serving the game

Static files, no build step, all paths relative — copy these fifteen
files into the directory served at `https://fuseki.net/minesweeper-friendly/`:

    index.html  settings.html  just-universe-help.html
    style.css  favicon.svg
    rng.js  justice.js  board-shape.js  solver.js  odds.js  trial.js
    storage.js  settings-core.js  settings-page.js  minesweeper.js

(Copying the whole repo also works; `tests/`, `reference/`, `promo/`,
and the markdown files are simply dead weight.)

If the site-wide Content-Security-Policy applies to this path, the game
needs at least: `script-src 'self'; style-src 'self' 'unsafe-inline';
connect-src 'self'; img-src 'self' data:`. Serving the path without a
CSP is also fine — the game makes no third-party requests. The music
indicator's poll of `http://localhost/api/is-music-playing` fails for
every visitor without that local service (some browsers block it
outright, others just fail to connect); it is designed to fail silent
and simply never appears on machines without that endpoint.

## The play heartbeat (`hb`)

The game sends one empty `navigator.sendBeacon` POST to
`/minesweeper-friendly/hb` per **five minutes of accumulated played
time** (game-in-progress time, not wall time; breaks and idling between
games do not count). No payload, no cookies, no identifiers — one
logged hit means "someone played five more minutes". The beacon only
fires when `location.hostname === 'fuseki.net'`; localhost, `file://`,
and GitHub Pages send nothing.

The server's whole job is to answer 204 and log the hit:

```nginx
location = /minesweeper-friendly/hb {
    access_log /var/log/nginx/minesweeper-hb.log;
    return 204;
}
```

Keep whatever logrotate retention the aggregate numbers should survive,
or fold the log into a periodic tally before rotation.

## Reading the numbers

- **Total played hours**: heartbeat hits × 5 / 60 —
  `echo $(( $(wc -l < /var/log/nginx/minesweeper-hb.log) * 5 / 60 ))h`
- **Distinct players in the log window**:
  `awk '{print $1}' /var/log/nginx/minesweeper-hb.log | sort -u | wc -l`
  (distinct client IPs; households/VPNs blur it — treat as approximate)
- **Visitors, pageviews, referrers**: run goaccess over the main access
  log filtered to the game path, e.g.
  `grep '/minesweeper-friendly/' /var/log/nginx/access.log | goaccess --log-format=COMBINED -o report.html -`

Server-side logs cannot be affected by ad blockers, so visitor counts
are complete; heartbeats are same-origin with a bland path, so filter
lists do not match them either.

## Privacy stance

Nothing about a player leaves their machine except these anonymous
heartbeat hits and the ordinary access-log entries any web server
writes. Game history, settings, and traces stay in the player's own
browser storage. Browser storage is per-origin: anyone who played at
another URL (e.g. the GitHub Pages mirror) starts fresh here.

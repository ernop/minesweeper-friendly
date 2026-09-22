# Retained stash review — 2026-09-22

Reviewed stash a3f3be3 (pre-PR-1 switch, 2026-08-25) against master d40652e.
The entire original stash, including its three untracked files, is preserved on
branch `codex/archive-minesweeper-stash-20260825`.

Integrated: the early-game guess category and fatal status, progress evidence,
risk-scope inclusion, compact fatal presentation, and expandable groups of
proven-safe flag mistakes. The category participates in both current session
rate bases; all newer categories and chart behavior remain present.

Superseded: the wall-clock session window, zero-based chart scales, old
rank-average table implementation, earlier chart ordering, cache-bust strings,
and wholesale session redraw loop conflict with newer documented decisions.
The current played-time retention, auto-ranged axes, chart grouping, and stable
controls remain authoritative. Original alternatives remain in the archive.

Deferred: the heartbeat and its hosting contract are preserved in the archive,
not enabled. That work requires a working server endpoint and reconciliation
with current error-handling rules. Its claim that sendBeacon sends no cookies
is incorrect for same-origin requests; shipping the original implementation
would violate its own no-cookie requirement. No gameplay history was modified.

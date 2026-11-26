# Session stats (retired left panel)

Product spec archive; index: [PRODUCT.md](../../PRODUCT.md). No implementation notes (code removed `2026-10-20`).

The former left stats panel held session charts over played time (game endings, action/report rates, provenance strip, game markers, switch cost row) and live motion rows. It was removed on `2026-10-20` because it duplicated the right-hand per-game and session surfaces.

## Where each component moved

| Retired left-panel component | Current home |
| --- | --- |
| Live motion rows | Collapsible `motion stats` section at page foot, closed by default ([Motion stats](motion-stats.md)) |
| Session picker | `#settings-row` at page foot ([One session definition](game-data.md#one-session-definition)) |
| Core pace/efficiency/flag metrics | `game summary perf` ([Game data](game-data.md)) and [live perf charts](during-game.md) |
| Flag rates & report-category rates | Optional rows (off by default) in [Game data](game-data.md#catalog-directions-and-defaults) and [live perf charts](during-game.md) |
| Game endings % | Lifetime column in [session summary](rankings.md#session-summary-and-results-partition) |
| Button switch cost | Pooled regression on [Training page](training.md#button-switch-cost); per-game `flag→chord gap` in [Game data](game-data.md#historical-tracking-and-button-switch-cost) |

Intentionally not carried over: per-game death/misclick rates (binary per-game outcomes already live in the after-game report and session results partition), measurement-notes rates, live session time-series controls (`showSessionStats`, `sessionLookbackSeconds`, `metricsPanelWidth`, etc.), and the `"left panel"` settings group.

## Reusable chart ideas (for future time-series views)

Full prior specification lives at git commit `d45a257`:

- **Hysteresis 1-2-5 y-axis:** grows immediately when a line needs room, shrinks only once the tallest value fits within `80%` of a lower step so climbing series do not pump the scale.
- **Direct end-of-line labels:** label each line at its newest point with name, value, and unit in the line's color where it covers the least data.
- **Break-compressed played-time axis:** compress idle breaks out, paired with an overhead provenance strip split at local midnight and `>= 15 min` breaks.
- **Outcome markers & hover spotlight:** thin per-game vertical markers colored by outcome (hovering duration, lifetime rank, time of day); hovering a series label thickens that line and fades siblings.

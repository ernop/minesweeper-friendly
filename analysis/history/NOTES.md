# History summary — reproducible stratified analysis

2026-09-04. The 2026-08-30 findings review (an interactive canvas outside
the repo) quoted about sixty numbers computed by one-off scripts that were
never checked in. This script regenerates them from any history export so
the findings can be re-read as history grows and the "Behavioral
signatures and state research" work (PRODUCT.md) has a data layer.

## Run

```
node analysis/history/summarize-history.js <history-export.json> \
     [--gap-minutes 30] [--out analysis/history/out/summary.json]
```

Node only, standard library only. The digest goes to stderr; the full JSON
to `--out` (the `out/` directory is git-ignored) or stdout. Exports dropped
into the repo root (`minesweeper-friendly-history-*.json`) are ignored by
`.gitignore`: they are personal data and the local origin would serve them.

## What it computes

Every grouping keeps the exact board/mode key (`9x9/10@standard`) and
reports sample sizes. Nothing here infers a cause (PRODUCT.md "Measurement
purpose").

- `totals`, `byKey`: games, wins, Wilson 95% win-rate interval, accumulated
  play time, robust center/spread (median, quartiles, n) for win time,
  mouse speed (px/s), click rate (/s), fastclick gap, misclicks, wasted
  clicks. These are the physical-state aggregates every grouping must
  report.
- `daily[key][day]`, `trends[key]`: per-day win rate and median win time;
  Theil–Sen slopes per day (robust to one odd day); Spearman rank
  correlation of game order with win time (wins only).
- `sessions`: gap-based sessions (`--gap-minutes`, default 30) with wall
  time, the same aggregates, per-key breakdown, state tags seen, and an
  early-half versus late-half contrast for sessions of 6+ games (warm-up or
  fatigue, day and equipment held fixed).
- `losses`: the fatal-action taxonomy in the report's exact wording. The
  script loads the game's own `GAME-END EVALUATION: VERDICT` span (the way
  the tests do) and calls `fatalActionStatusKind` / `FATAL_STATUS_LABELS`;
  it never re-implements the classification. Legacy-provenance deaths and
  unevaluated losses are counted separately, never upgraded.
- `guessPolicy[key]`: ledger coverage, guesses per game, share of guesses
  off ideal risk, share perfect, life lost and needless per game.
- `luckCalibration`: Justice-free games bucketed by summed modeled risk
  (`lifeLost`), realized guess-death rate against `1 − exp(−lifeLost)`. The
  exponential is the survival-model approximation for summed per-guess
  probabilities; exact per-guess products need the trace export.
- `stateContrasts[state][key]`, `musicContrasts[key]`: paired with/without
  summaries inside one key, only where both arms have 10+ games.
- `shapeCorrelations[key]`: Spearman of win time with 3BV, zeros, islands,
  mouse path, and clicks.

## Known measurement-era caveats in the 2026-08-30 export

- The first 66 games (2026-08-19, sessions 1–2) are all wins: losses were
  not yet recorded. Session and daily win rates for that day are not
  comparable with later days.
- 1,081 losses carry coarse legacy provenance (`legacyProvenance`) and 0 have
  no evaluation; only the 1,278 modern losses have a complete fatal status.
- Two guess deaths sit in the "no modeled risk" calibration bucket: their
  games have a zero ledger because the fatal guess itself was not scored
  before the game ended. They are reported, not removed.

## Not built

Trailing played-time chunks inside the current session are the app's own
session panel; the offline script summarizes completed sessions only.
Trace-derived motion measures (pauses, submovements, verification dwell)
need the traces export and the `analysis/biometrics` / `analysis/mousetrap`
extractors.

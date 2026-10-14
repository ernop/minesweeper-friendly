# Offline analysis — implementation notes

Spec: [docs/product/measurement.md](../product/measurement.md). Index: [AGENTS.md](../../AGENTS.md).

- Offline analysis lives under `analysis/` (inputs: the exported trace
  JSON). `analysis/mousetrap/trace_measures.R` computes psychometric
  mouse-tracking measures per inter-click segment; it runs on the R env
  at `~/analysis-envs/r-mousetrap` (created 2026-08-20 with micromamba at
  `~/.local/bin/micromamba` — this machine has no system R and no
  passwordless sudo; mousetrap itself compiled from CRAN, its heavy deps
  installed as conda-forge binaries). `analysis/biometrics/` holds the
  mouse-dynamics feature extractor with its own venv.
  `analysis/history/summarize-history.js` (Node, stdlib only; input: a
  history export) regenerates the stratified history summary the
  2026-08-30 findings review quoted — totals and per-key/per-day win rates
  with Wilson intervals, Theil–Sen daily trends, Spearman shape/time
  correlations, gap-based sessions with early/late halves and the
  physical-state aggregates (mouse speed, click rate, fastclick gap), the
  loss types and likely-misclick reasons in the report's exact wording (it
  loads the GAME-END EVALUATION: VERDICT span and `justice.js`, like the
  tests, so it can never re-implement `lossTypeOf`), guess-policy per key, a summed-risk luck
  calibration table, and paired state-tag/music contrasts. Output JSON goes
  to `--out` (`analysis/history/out/` is ignored); see
  `analysis/history/NOTES.md`. History exports dropped into the repo root
  are ignored by name pattern (personal data; also served by the local
  origin).
- `analysis/judgment/build-problems.js` (Node; input: a history export)
  picks wins and losses from the player's own games, one or more saved
  moves each, for the judgment quiz `analysis/judgment/judge.html`, a local
  research page opened at `http://127.0.0.1:8018/analysis/judgment/judge.html`
  (creator request 2026-10-14; [BACKLOG.md](../../BACKLOG.md), "Game results
  as one tree per board type"). Like the history summary it loads the
  VERDICT span with `justice.js`, and adds `odds.js`, `solver.js`, and
  `rng.js` for every covered square's mine chance, the recomputed one-step
  model, and clean wins' final boards. The bank
  (`analysis/judgment/judgment-problems.json`) and the creator's latest
  exported answers (`judgment-answers.json`) are committed beside the page
  (creator, 2026-10-14: the judgments are not private); neither the page nor
  the bank is a runtime file. See `analysis/judgment/NOTES.md`.
- `analysis/switch-cost/reference.py` (numpy, pandas, patsy; see
  `analysis/switch-cost/NOTES.md`) is the independent reference for the
  stats panel's switch cost ([Switching](../product/trace-metrics-panel.md#switching-creator-request-and-approval-2026-09-28)):
  the study's model P1 over transitions as `switch-cost.js` emits them.
  `tests/switch-cost-reference.json` is its output on the synthetic fixture.

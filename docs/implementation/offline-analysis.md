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
  loss taxonomy in the report's exact wording (it loads the GAME-END
  EVALUATION: VERDICT span, like the tests, so it can never re-implement
  `fatalActionStatusKind`), guess-policy per key, a summed-risk luck
  calibration table, and paired state-tag/music contrasts. Output JSON goes
  to `--out` (`analysis/history/out/` is ignored); see
  `analysis/history/NOTES.md`. History exports dropped into the repo root
  are ignored by name pattern (personal data; also served by the local
  origin).

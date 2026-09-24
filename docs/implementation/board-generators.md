# Board generators — implementation notes

Spec: [docs/product/board-generators.md](../product/board-generators.md). Index: [AGENTS.md](../../AGENTS.md).

- Board generators ([Board generators and top score keys](../product/board-generators.md)):
  `generators.js` is the pure registry (`BoardGenerators` global /
  CommonJS module, loaded after solver.js — its uniform entry delegates
  to `Solver.randomPlacement`): per generator an id, menu label,
  `version` (the record's `boardVersion` string), a parameter schema
  ({key, label, min/max/step, default, describe}), and `place(width,
  height, mineCount, safeIndex, rng, params)`; `safeIndex` is null in
  the Board lab (no first click). Six generators (2026-08-25; a seventh,
  patriotic stars-and-stripes, was removed 2026-08-30): pink
  noise = fractal value-noise field (persistence 2^(−alpha/2) gives
  spectral slope alpha; `stretch` = log2 x:y anisotropy) +
  Efraimidis-Spirakis weighted sampling (`weightedSampleInto`); blue
  noise = Mitchell best-candidate (`bestCandidatePlace`, O(n)-per-mine
  nearest-distance relax, pluggable score); green noise = one band-pass
  octave, weighted; stippled = red-noise density field × best-candidate
  distance score; letterforms = seed-drawn letters from the built-in
  5×7 `LETTERFORMS` font as exp-weights. Game
  side: `settings.boardGenerator` + `settings.boardGeneratorParams`
  (per-generator overrides, deep-copied in `settingsFrom`), the
  `#board-generator-select` menu (`buildBoardGeneratorSwitcher`,
  disabled via `generatorAppliesToMode` in single-path NG and trials),
  `gameGenerator` frozen per board in `newGame`, `topScoreKeyOf` /
  `BoardGenerators.keySuffix` for the history key, and the record's
  `generator` field (absent = default). Board lab (`playMode
  'board-lab'`, `gameState 'lab'`): `buildLabBoard` deals a solved-view
  board with no records, traces, or timer; `buildLabPanel` /
  `syncLabChrome` render the size + parameter sliders (`#board-lab-panel`;
  rebuild only on generator change so a drag never loses its slider).
  `node tests/generators-test.js` freezes placement invariants,
  key-suffix canonical form, validation, and the statistical
  signatures (pink clusters, blue spreads).

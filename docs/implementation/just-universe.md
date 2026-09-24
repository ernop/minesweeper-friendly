# A just universe — implementation notes

Spec: [docs/product/just-universe.md](../product/just-universe.md). Index: [AGENTS.md](../../AGENTS.md).

- A just universe ([A just universe](../product/just-universe.md)): the judge and redraw
  are `justice.js` — pure logic on a view {width, height, mines,
  revealed[], adjacent[]} (flags invisible by design), exporting the
  `Justice` global / CommonJS module, loaded before the `game/` scripts in
  `index.html`; the page wiring is in `game/play.js`. Exact player rule: a bare click into a certified pocket
  that no outside clue can ever resolve is guaranteed safe. Qualification
  is hidden-layout-independent: `certifyEntry(view, clicked)` receives no
  witness. `certifyEntries(view, entries)` is the batched equivalent used
  by guess scoring: it builds one visible constraint structure and checks
  each frontier/sea component once, avoiding an Expert-sized structure
  rebuild for every covered cell on the click-critical path. Certification
  runs `proveFacts` (direct counts, general overlap subtraction,
  then exhaustive component search coupled by total mines and sea),
  `buildStructure` (residual clue components plus
  8-connected sea components), then recognizes one compact family:
  `cardinalityShape` (every k-of-n layout), `complementShape` (a connected
  spanning x+y=1 graph whose two equal-total bipartition layouts satisfy
  every residual clue), or one sealed sea remnant whose count is fixed by
  cardinality/complement frontier templates. Covered external cells must
  be proved mines or receive an invariant pocket contribution. Whole
  residual components are used; v1 never searches arbitrary pocket subsets.
  Unsupported asymmetric/exotic ambiguity is outside the product rule.
  This replaced two model-enumeration implementations on 2026-08-20: the
  first hung mid-game; the second's sparse benchmark falsely supported a
  universal <3ms claim, while a deterministic 40-variable sealed
  constraint family exposed 1,048,576 layouts and took ~693ms. The current
  certificate-shape judge itself enumerates no ambiguous pocket layouts.
  Its canonical proof prepass now has a deterministic two-million-node
  ceiling and returns a Map annotated with `complete`, `visits`, and
  `method`; over-limit results retain only sound facts and cannot justify a
  negative player judgement. One visible-position cache avoids repeating
  the same exact proof across click scoring, reports, and mode rules.
  `redrawEntry(certificate, clicked, currentMines, random)` consults the
  witness only after certification: an already-clear entry returns it
  unchanged; a mined cardinality/sea entry directly samples k locations
  excluding the click; a mined complement entry switches partitions.
  Game side: only `revealCell` calls `attemptJustice(index)`, before its
  mine test and never on the first reveal. `chord` never calls Justice;
  wrong flags remain fatal. Every qualifying entry increments
  `justiceEvents` regardless of whether redraw occurred and pushes a
  {type, clearWays, totalWays} detail onto `justiceDetails` (reset in
  newGame; feeds the end-game recap). Whether the entry's cell was mined
  before the redraw is deliberately not tracked past the redraw itself:
  the player's point of view is the only one that exists (creator
  directive 2026-08-23) — recap, details, stats, and record never reveal
  or refer to an "actual" mine reality, and the historical `justiceSaves`
  field stopped being written the same day it was added. When
  `finish()` runs, `showJusticeSurvivals` attaches one
  `.justice-live-word` chip to #justice-live at the board's right,
  wording the count as "you won a forced coinflip" (pluralized) —
  nothing pops up mid-game, and no chip appears when the count is zero
  (2026-08-23). `reportResult` stores `justice`,
  `justiceEnabled`, `seed`, `rngVersion`, `boardVersion`,
  and `justiceVersion`; rankings intentionally remain mixed (confirmed
  as the product 2026-08-23, no longer a deferral). `rng.js`
  exports `GameRandom`: `createSeed` obtains 128
  bits from `crypto.getRandomValues`, and `fromSeed` implements
  `xoshiro128ss-v1`, the single stream used by `placeMines` and Justice.
  Initial-board replay needs mode + first click + seed + RNG/board versions;
  Justice replay also needs the input trace and Justice version.
  just-universe-help.html is a standalone explainer document (its "?"
  popover on the settings row was removed in the 2026-08-23 caption
  purge; the schema no longer carries `helpFile`). Correctness:
  `node tests/justice-test.js`
  (deterministic fixtures including safe-entry counting semantics and the
  chord-origin rule); `node tests/rng-test.js` freezes the RNG version's
  output sequence; scale: `node tests/justice-bench.js` (100x100 boards,
  10,000-cell structural proof and direct redraw; no timing threshold).

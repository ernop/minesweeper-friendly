# A just universe — implementation notes

Spec: [docs/product/just-universe.md](../product/just-universe.md). Index: [AGENTS.md](../../AGENTS.md).

- A just universe ([A just universe](../product/just-universe.md)): the judge and redraw
  are `justice.js` — pure logic on a view {width, height, mines,
  revealed[], adjacent[]} (flags invisible by design), exporting the
  `Justice` global / CommonJS module, loaded before the `game/` scripts in
  `index.html`; the page wiring is in `game/play.js`. Exact player rule
  (player words since 2026-10-21): a click on a square in a guess that
  nothing else on the board could ever settle is guaranteed safe. The code
  and these notes keep their own terms (pocket, sealed, certificate,
  cardinality, complement, sea); `tests/player-words-test.js` keeps the
  ones players once saw out of shipped prose. Qualification
  is hidden-layout-independent: `certifyEntry(view, clicked)` receives no
  witness. `certifyEntries(view, entries, heldStructure)` is the batched
  equivalent used by guess scoring: it builds one visible constraint
  structure, or takes the caller's (`heldStructure`, the live perf charts'
  guess facts), and checks
  each component's groups, each group, and the sea once, avoiding an
  Expert-sized structure rebuild for every covered cell on the
  click-critical path. Certification
  runs `proveFacts` (direct counts, general overlap subtraction,
  then exhaustive component search coupled by total mines and sea),
  `buildStructure` (residual clue components, `cluesOfCell`, plus
  8-connected sea components), then `componentGroups` splits the clicked
  cell's component into two kinds of group (per group since 2026-10-21;
  whole components only before, which refused two boxed-in 50/50s joined
  by a shared number):
  - twin groups, the cells touched by exactly the same residual clues,
    whose mine count is pinned by a clue covering only that group or by
    peeling (subtracting already pinned groups until a clue has one open
    group left). A pinned count strictly between none and all of the
    group, with every external covered cell proved a mine or touching all
    or none of the group (`cardinalityBoundaryIsSealed`), certifies a
    cardinality pocket.
  - pair chains, the cells linked by x+y=1 clues, two-colored (an odd cycle
    throws: the clues would be inconsistent). Equal sides
    (`balancedChain`), every residual clue touching the chain seeing as
    many cells of one side as of the other (`chainCluesAreInvariant`),
    and the same rule for external covered cells
    (`complementBoundaryIsSealed`) certify a complement pocket.
  The sea qualifies when it is the only sea component, sealed, and every
  frontier cell lies in a pinned twin group or an equal-sided chain
  (`frontierBesideOpenChain` finds no open chain), which fixes the sea's
  count. Pinning passes along every pair clue, so no chain mixes pinned
  and unpinned twin groups and nothing is counted twice. When one uneven
  chain is the frontier's only open part instead (2026-10-26,
  `seaCompletedChainCertificate`), its sides differ by exactly the number
  of sea cells (every sea component), and the mine total leaves the
  larger side's count, the chain and the whole sea form one complement
  pocket: `partitionA` the larger side, `partitionB` the smaller side
  plus the sea. It needs `chainCluesAreInvariant` on the chain (no clue
  touches the sea) and `complementBoundaryIsSealed` on the whole shape;
  a sea at least as large as the frontier fails first, so the early game
  skips the walk over every component. `certifyEntries` builds it at most
  once per call and hands the one certificate to each of its chain and
  sea entries. The swap of a certified group's
  layout keeps every clue count and the mine total, so the redraw stays
  valid. Unsupported asymmetric/exotic ambiguity is outside the product
  rule.
  This replaced two model-enumeration implementations on 2026-08-20: the
  first hung mid-game; the second's sparse benchmark falsely supported a
  universal <3ms claim, while a deterministic 40-variable sealed
  constraint family exposed 1,048,576 layouts and took ~693ms. The current
  certificate-shape judge itself enumerates no ambiguous pocket layouts.
  Its canonical proof prepass now has a deterministic two-million-node
  ceiling and returns a Map annotated with `complete`, `visits`, and
  `method`; over-limit results retain only sound facts and cannot justify a
  negative player judgement. A visible-position cache, one entry per work
  budget, avoids repeating the same exact proof across click scoring,
  reports, and mode rules; guess scoring's 80,000-node hypothetical
  positions therefore cannot evict the click's own proof (2026-09-26).
  The same day's input-latency review made the proof cheaper without
  changing its results: the node search keeps its cell order, branch order,
  and node count but uses flat typed arrays and no per-node allocation,
  leaf summaries stop once every flag is seen, and after a count pass that
  marked nothing, the pairwise subset rule compares only clue pairs that
  share a cell (disjoint pairs can then neither mark nor contradict).
  `redrawEntry(certificate, clicked, currentMines, random)` consults the
  witness only after certification: an already-clear entry returns it
  unchanged; a mined cardinality/sea entry directly samples k locations
  excluding the click; a mined complement entry switches partitions.
  Game side: only `revealCell` calls `attemptJustice(index)`, before its
  mine test and never on the first reveal. `chord` never calls Justice;
  wrong flags remain fatal. Every qualifying entry increments
  `justiceEvents` regardless of whether redraw occurred and pushes a
  {type, squareCount, mineCount, clearWays, totalWays} detail onto
  `justiceDetails` (reset in newGame; feeds the end-game recap, whose
  `justiceGuessName` names it "a 50/50", "a chain of 50/50s over N
  squares", "M mines among N squares", or "... among the last N squares no
  number touches"). Whether the entry's cell was mined
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
  (deterministic fixtures including safe-entry counting semantics, the
  chord-origin rule, the 2026-10-21 board with two 50/50s sharing a number,
  a 50/50 pinned only by subtraction, and the 2026-10-26 corner with its
  refusals: the same corner twice, a corner group a square outside can
  tell apart, and a corner the mine count settles read through a stopped
  proof; then 800 random small boards
  played by opening proven-safe cells until stuck, where every certificate
  is checked against brute force over every layout the view allows: the
  family holds, each member can replace the group, no openable outside
  cell tells the members apart, and every redraw is valid — removing the
  invariance, balance, or twin sealing check each fails it, as does
  removing the sea-completed chain's invariance, boundary, size, or mine
  count check);
  `node tests/rng-test.js` freezes the RNG version's
  output sequence; scale: `node tests/justice-bench.js` (100x100 boards,
  10,000-cell structural proof and direct redraw; no timing threshold).

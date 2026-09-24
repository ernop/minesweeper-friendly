# A just universe (decided 2026-08-20)

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/just-universe.md](../implementation/just-universe.md).

The first friendly variant (the direction of [design-axis](design-axis.md) entry
7, the angelic dual of Kaboom). Principle: the player can lose to their own
choices and to the field's diffuse odds, but never to a coin the universe
minted specifically for them.

- Exact player-facing definition: **when you bare-click into a certified
  pocket that no outside clue can ever resolve, that entry is guaranteed
  safe.**
- A *sealed pocket* is a group of still-unknown cells with at least two
  possible internal mine arrangements, all with the same mine total, such
  that every possible observation outside the pocket is identical under
  every arrangement. An internal safe click may reveal a number and resolve
  the rest; the defining fact is that this information could not be earned
  before entering. Every cell in a certified v1 pocket is ambiguous and
  has the same odds.
- This is structural, de re necessity: winning eventually requires entering
  this particular unreadable pocket. It deliberately excludes merely de
  dicto necessity ("some gamble is required"), including the early corner-1
  and its open sea. It also excludes provably safe/mine cells.
- Justice applies only to a bare direct reveal. Chords categorically receive
  none, even if a chord would open only one cell: a flag is the player's
  unsupported claim, and a wrong one may kill.
- Qualification is decided from visible clues and the global mine count
  before the hidden layout is consulted. Every qualifying entry increments
  `justice`, whether its cell was already clear or needed intervention. If
  mined, only the certified pocket is redrawn uniformly from its represented
  layouts conditioned on that cell being clear. Thus Justice is a count of
  guaranteed sealed-pocket entries, not counterfactual deaths undone.
- V1 recognizes only structures carrying short exact certificates:
  symmetric k-of-n pockets, equal-total alternating 50/50 pairs/chains, and
  a single sealed sea remnant whose mine count is pinned by certified
  frontier totals. Arbitrary asymmetric or structurally exotic ambiguities
  are outside v1 and retain ordinary Minesweeper behavior. This explicit
  scope replaces the earlier unbounded model-enumeration design.
- At game end a single chip appears to the board's right stating the
  game's Justice survival count: "you won a forced coinflip" (pluralized
  with the count for more than one). Nothing pops up beside the board
  mid-game (creator request 2026-08-23). Earlier the same day the design
  was per-event "JUSTICE" chips plus guess-odds risk chips; later on
  2026-08-23 the creator withheld the risk chips entirely — they may
  return once they can be shown with a proper explanation, and the
  underlying guess measurements are still recorded either way.
  Since 2026-08-23 there is also an end-game Justice recap (an explicit
  creator request reversing the earlier "no separate end-game recap"
  decision): see [Game-end evaluation](game-end-evaluation.md).
- The per-game record carries the event count (`justice`), the frozen
  `justiceEnabled` state, the 128-bit `seed`, `rngVersion`, `boardVersion`,
  and `justiceVersion`; see [Per-game stats](per-game-stats.md). Rankings mix Justice-on and
  Justice-off games in the same lists: first decided 2026-08-20 as a
  deferral, confirmed as the product on 2026-08-23 — Justice stays on
  and its games rank within these lists; separation is not planned.
- Setting `justUniverse` (default on), labeled "a just universe":
  "when you bare-click into a sealed pocket that no outside clue can ever
  resolve, that entry is guaranteed safe". It remains editable before the
  first reveal, is frozen for the active game, and unlocks when the game
  ends or restarts.
  A "?" beside the name raises `just-universe-help.html` on hover — a
  standalone page of mini-board diagrams showing where the rule applies
  and where it does not.
- The certificate judge is exact and deterministic; it performs no model
  enumeration and has no search budget. Redraw sampling is direct over the
  compact certified family. Implementation and deterministic scale checks
  are recorded in [docs/implementation/just-universe.md](../implementation/just-universe.md).

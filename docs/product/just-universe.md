# A just universe (decided 2026-08-20)

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/just-universe.md](../implementation/just-universe.md).

The first friendly variant (the direction of [design-axis](design-axis.md) entry
7, the angelic dual of Kaboom). Principle: the player can lose to their own
choices and to the field's diffuse odds, but never to a coin the universe
minted specifically for them.

- Exact player-facing definition: **when you click a square in a guess that
  nothing else on the board could ever settle, that square is guaranteed
  safe.** Until 2026-10-21 it read "when you bare-click into a certified
  pocket that no outside clue can ever resolve, that entry is guaranteed
  safe".
- Player words (creator 2026-10-21, of the settings hint "a bare click into a
  truly unknowable pocket never kills you": "you must rewrite a just
  univere's text blurb to be more clear about what we do. never use phrases
  like "pocket" which I haven't approved, with players."). Player text names
  the covered guesses as "a guess that nothing else on the board could ever
  settle", "a 50/50", "a chain of 50/50s", "1 mine among 3 squares", and
  "the last squares no number touches"; it never says pocket, sealed,
  certified, bare click, or sea remnant. The app-wide rule is in
  [UI doctrine](ui-doctrine.md), "Player words only". Below, a *group* is
  the squares of one such guess; the word is this spec's, not the player's.
- A covered group is a set of still-unknown squares with at least two
  possible mine layouts, all with the same mine total, such that every
  possible observation outside the group is identical under every layout.
  A safe click inside it may reveal a number and settle the rest; the
  defining fact is that this information could not be earned before
  clicking. Every square of a covered group is ambiguous and has the same
  odds.
- This is structural, de re necessity: winning eventually requires clicking
  into this particular group. It deliberately excludes merely de dicto
  necessity ("some gamble is required"), including the early corner 1 and
  its open field. It also excludes provably safe or mined squares.
- Justice ("Justice" is the code's name for the rule's events, not shown to
  players) applies only to a plain click on a covered square. Chords
  categorically receive none, even if a chord would open only one square: a
  flag is the player's unsupported claim, and a wrong one may kill.
- Qualification is decided from visible numbers and the global mine count
  before the hidden layout is consulted. Every qualifying click increments
  `justice`, whether its square was already clear or needed intervention.
  If mined, only that group is redrawn uniformly from its represented
  layouts conditioned on that square being clear. Thus Justice is a count of
  guaranteed clicks, not counterfactual deaths undone.
- V1 recognizes only structures carrying short exact proofs: k-of-n groups
  in which every layout is possible (1 mine among 3 squares), equal-total
  alternating 50/50 pairs and chains, and a single area of squares no
  number touches whose mine count is pinned by the rest of the board.
  Arbitrary asymmetric or structurally exotic ambiguities are outside v1
  and keep ordinary Minesweeper behavior. This explicit scope replaces the
  earlier unbounded model-enumeration design.
- Each group is judged on its own, even when a number it shares links it to
  other unknown squares (creator report 2026-10-21, with a screenshot of a
  loss: two 50/50s in the bottom rows, each boxed in, joined by a shared 2
  and 5; the judge then accepted only a whole connected region of one
  shape, saw four layouts there, and refused both). Fixed the same day: a
  50/50 or k-of-n group qualifies when its count is pinned by the numbers
  (directly, or after subtracting groups already pinned) and every number
  touching it sees all of its squares alike; a chain qualifies when every
  number touching it sees its two sides alike. Records made from then on
  carry `justiceVersion` `just-universe-v3`.
- At game end a single chip appears to the board's right stating the
  game's Justice survival count: "you won a forced coinflip" (pluralized
  with the count for more than one). Its tooltip: "Guesses that nothing else
  on the board could ever settle are forced coinflips; A Just Universe makes
  you win every one". Nothing pops up beside the board
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
- Setting `justUniverse` (default on), labeled "a just universe". Its one
  visible hint: "a guess that nothing else on the board could ever settle,
  like a boxed-in 50/50, never kills you". The name's tooltip: "when you
  click (not chord) a square in a guess that nothing else on the board could
  ever settle, that square is guaranteed safe, and every number shown and
  the mine count stay true; it covers 50/50s, chains of 50/50s, groups like
  1 mine among 3 squares, and the last squares no number touches once the
  mine count fixes their mines; it never covers chords, guesses that opening
  other squares could still settle, or squares the numbers already prove"
  (both 2026-10-21). It remains editable before the first reveal, is frozen
  for the active game, and unlocks when the game ends or restarts.
- `just-universe-help.html` is a standalone page of mini-board diagrams
  showing where the rule applies and where it does not, including two
  50/50s that share a number (rewritten in player words 2026-10-21). No
  control links to it: the "?" beside the setting's name that raised it was
  removed in the 2026-08-23 caption purge.
- The group judge is exact and deterministic; it performs no model
  enumeration and has no search budget (the proof of what the numbers fix,
  run before it, has a work limit whose overruns withhold the rule, never
  invent it). Redraw sampling is direct over the group's compact family.
  Implementation and deterministic scale checks are recorded in
  [docs/implementation/just-universe.md](../implementation/just-universe.md).

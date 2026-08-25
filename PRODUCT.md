# minesweeper-friendly — Product & UI Decisions

Canonical record of every product and UI decision made to date (2026-08-19
session). If behavior and this file disagree, one of them is a bug: fix the
code or fix this file in the same change. Implementation notes (function and
key names) live in `agents.md`; player-facing pitch in `promo/PROMO.md`.

## Product goals

- Start from a faithful clone of minesweeper.online's standard mode: same
  mechanics, same classic-Windows look.
- Grow toward friendlier variants (no-guess and beyond; the design axis is
  mapped in `agents.md`). First variant implemented 2026-08-20: "A just
  universe" (see its section below).
- A playable version is always live at
  https://ernop.github.io/minesweeper-friendly/ — the public repo redeploys
  GitHub Pages on every push. The page links back to the repo via a subtle
  footer.
- Default difficulty is Beginner.

## Board and chrome

- Classic Windows minesweeper skin; every icon is inline SVG; no
  dependencies, no build step.
- Cell numbers use a chunky face (Arial Black stack); the classic
  number-color palette (1 blue, 2 green, 3 red, ...).
- Number display (2026-08-23): a gameplay setting draws revealed counts
  as the classic digits (default), as letters A–H (A=1 … H=8), or as one
  colored dot per cell. All three use the classic color palette, so the
  color always carries the count; in the dots display it is the only
  carrier. Changing the setting repaints the board in place, mid-game
  included.
- Favicon (2026-08-23; letter and color revised same day): a raised
  minesweeper cell in the game's exact palette (silver face, light/dark
  bevels) carrying a blocky letter M in the board's strong classic blue
  (the "1" color — the first light-blue E was judged too light). One SVG
  (`favicon.svg`), linked from both pages.
- The status button is a dove (symbol of peace and kindness), not a smiley:
  idle; startled flap while a cell is pressed; olive branch on win; broken
  heart on loss.
- Clicking anywhere in the titlebar (the whole top panel, not just the
  dove) restarts. Space bar also restarts, except when focus is in an
  input, textarea, button, or link.
- LCD counters are red seven-segment with visible gaps between digits (the
  digits must not crowd together).
- Zoom control: 16-32 px cell sizes.
- Mechanics: first click never a mine; flood fill; right-click flags;
  left-click chording with press preview; win auto-flags remaining mines;
  loss shows the red hit cell and crossed-out wrong flags.

## Play modes (decided 2026-08-21)

A second uniqueifier next to board size. The upper-right cluster has a
Mode menu. Rankings and history are stored per (board, play mode); a
Beginner Standard win never appears on Beginner Uniform NG lists.

- **Standard.** Today's first-click-safe random boards. "A just universe"
  applies here and in the Trial modes (frozen from the setting on the
  first click, or when a given opening is used). It does not apply in
  the NG modes or Angelic.
- **Uniform NG.** Generate-and-reject until the board is fully solvable
  from the opening by direct counting, overlap deduction, or exhaustive
  globally consistent layouts, and every required deduction step sits at
  one grade (all counting, all overlap, or all exact). If no such board appears
  within the attempt budget, generation fails loudly.
- **Single-path NG.** Same solver, plus each deduction step's newly
  proven safes are covered by one click's flood — no unused forced
  cells, no second equally-forced next move. Boards are carved as a
  connected safe corridor through an all-mine field (random placement
  almost never has this shape). If no such board appears within the
  attempt budget, generation fails loudly.
- **Proof-or-die.** An NG board. After the opening, opening a cell that
  is not currently proven safe kills, even if that cell is empty. Chords
  die if any opened cell is unproven. If exhaustive proof reaches its
  explicit work limit, the input is blocked and not judged; engine
  incompleteness never counts as player failure.
- **Angelic.** The rest of the angelic dual of Kaboom: a click (or chord
  cell) that is not a proven mine is made safe; you die only by
  contradicting known facts (clicking a proven mine). A just universe is
  the sealed-pocket special case; this mode covers every consistent
  guess. Justice is off here — the mode is the mercy.

### Visible-information solver

`Justice.proveFacts` is the canonical proof engine used by NG generation,
Proof-or-die, Angelic, misclick classification, guess scoring, and action
reports. It receives only revealed numbers, covered-cell locations, board
dimensions, and the total mine count. Player flags are annotations and the
hidden layout is never evidence.

The solver first closes direct-count and arbitrary overlap-difference
constraints. It then partitions the unresolved frontier into connected
constraint components, exhaustively searches each component, and joins
their possible mine totals through the board-wide mine count and
unconstrained sea. A cell is proven safe or mined only when it has that
value in every globally consistent layout. This is general constraint
solving rather than a catalog of named patterns.

The browser search has a deterministic two-million-node work limit.
Results carry `complete`, `visits`, and `method`. A completed search has
considered every consistent layout; an over-limit search returns only facts
already soundly established and marks itself incomplete. Reports must not
call an unresolved action “unproven,” and Proof-or-die must not kill, merely
because the engine exhausted its work budget. Identical visible positions
reuse the last exact proof result. One-ply odds scoring may inspect up to
forty hypothetical next positions; each hypothetical proof prepass uses an
80000-node limit, after which residual odds either complete independently
or remain explicitly unmeasured.
- **Trial.** 25 hidden board identities for the current size, each shown
  four times (100 games). Choosing the mode hides the board and shows
  a centered description plus Start trial. That click starts the
  sequence; the player chooses the opening (a mine can kill — the
  layout is already fixed). Presentations are
  shuffled so repeats are not obvious, with the same identity kept away
  from its other showings; the four showings of one identity use four
  different isometries (a subset of the eight dihedral maps on a square;
  all four of identity, 180°, and the two flips on a rectangle) so the
  puzzle is the same logically and never the same orientation twice.
  The board stays covered until you click; the timer starts then.
  Progress is `n / 100` with an "end trial" control. After each game
  the finished board stays; the titlebar (or space) deals the next
  one. A restart before that game is finished skips the current slot
  and deals the next item. When the last game finishes, the board
  disappears. A centered header holds the session line, a descriptive
  later-versus-first comparison, and Start another trial; the meeting-index summary is a
  full-width row under that; per-board cards wrap below. Start another trial stays inert for a short
  moment so a trailing click cannot begin a new session. Leaving the
  mode or changing size while a session is running ends it; that
  review is not kept. Justice follows the user setting (default on).
  Solve-time, 3BV/s, and efficiency omit losses; counts, overlays, and
  motion metrics keep them.
  The review leads with later meetings of the same identity vs first
  meetings. Descriptive comparison text and meeting-index bars (mean win time, 3BV/s,
  win rate; light gold = first meeting, dark brown = last) sit above
  the per-board list. Identities are collapsed; a row opens if it has a
  loss, a large first-to-last swing, or is the only board. Open rows
  keep attempt-index charts plus overlaid traces: open squares,
  remaining safe squares (0 is a win), flags, unmarked mines, cursor
  path, speed (with a bucket-width slider; default 200 ms mean, 0 =
  raw samples), and cursor x/y mapped back through the inverse isometry
  onto the identity board so the four orientations share one
  coordinate frame. From the results the player
  starts another trial (same size) or changes mode / size (that opens
  a fresh lobby). Ending early via "end trial" shows the same review
  for the games already played.
  Finished trial games are stored under that size's trial key only —
  they do not enter Standard (or any other mode's) time windows,
  streaks, scatters, or rankaverages.
- **Short trial.** The same rules as Trial, with 4 identities shown
  four times each (16 games). Its results live under that size's
  short-trial key and never mix with the 100-game Trial lists.
- **Test trial.** One identity, four orientations (4 games). Same
  storage split (`@test-trial`).
- The setting `trialGiveOpening` (default off) restores a predetermined
  opening on trial boards. A first click on a mine can kill: the
  layout is already fixed.
- **Board lab (decided 2026-08-25).** The non-play mode for exploring
  board generation. Every board appears the instant it is dealt, shown
  as if it had just been solved: safe cells open with their numbers,
  mines flagged, counters at their win values (mine LCD 0, timer 0).
  No input reaches the cells, no timer runs, and nothing is ever
  recorded — the mode exists to look at generated boards, not to play
  them. A panel above the board holds free size adjustment (width
  8–100, height 1–100, mines 1 to the classic (w−1)(h−1) cap — the
  sliders replace the custom form, which stays hidden in this mode),
  one slider per parameter of the chosen generator, and a "make new
  board" button; the titlebar, dove, and space bar deal a new board as
  everywhere else. Any slider movement regenerates instantly. The
  generator itself is chosen with the same upper-right Generator menu
  as in play; parameter changes made in the lab persist and are the
  values the play modes use. The see-scores control hides here
  (there is nothing to rank).

## Board generators and top score keys (decided 2026-08-25)

The board generator is the algorithm that places the mines — a third
uniqueifier next to board size and play mode. The upper-right cluster
has a Generator menu below the Mode menu. The registry lives in
`generators.js`; the menu is disabled (never silently ignored) in modes
that place their own boards: Single-path NG carves corridors, trials
deal fixed identities.

- **Default.** The uniform Fisher-Yates placement standard play has
  always used (every layout equally likely, first click never a mine).
- **Pink noise.** Mines drawn from a fractal (octave-summed) value-noise
  field with power spectrum ≈ 1/f^alpha, by exact weighted sampling
  without replacement (weight exp(contrast × standardized field)).
  Parameters: spectral exponent alpha (0 = white/uniform, 1 = pink,
  2 = red/brown; the slider is the whole colored-noise family on the
  clustered side), feature size (base wavelength in cells), contrast
  (0 = uniform regardless of the field; higher hugs the field peaks),
  and stretch (anisotropy as log2 of the x:y feature ratio: 0 = round
  features, positive = horizontal streaks, negative = vertical veins).
  Produces dense mine clumps and open plains.
- **Blue noise.** Mitchell's best-candidate sampling: each mine
  auditions `spread` uniform candidates and takes the one farthest from
  every placed mine. spread 1 is exactly uniform; higher is more even.
  Produces evenly spaced mines with few adjacent pairs.
- **Green noise.** One mid-frequency octave only (band-pass — the
  halftoning literature's green noise): mine clumps of one
  characteristic size with even spacing between clumps. Parameters:
  clump spacing (the band's wavelength; clumps about half that wide)
  and contrast.
- **Stippled.** A smooth large-scale density field (red-noise slope)
  rendered the way stippling renders ink: best-candidate scored by
  nearest-distance × local density, so spacing is locally even — tight
  in dense regions, wide in sparse ones. Parameters: density feature
  size, density range (0 = pure blue noise), evenness (candidates).
- **Letterforms.** Mine density follows random uppercase letters from a
  built-in 5×7 pixel font, one per equal horizontal slot, letters drawn
  from the game seed like the rest of the layout — the solved board
  spells them in mines. Parameters: letters (1–6) and stroke contrast
  (stroke cells weigh e^contrast against 1; high values put nearly all
  mines in the strokes).
- **Patriotic.** Stars and stripes: the upper-left canton (a chosen
  share of the width, the classic 7/13 of the height) takes its exact
  area-proportional share of the mines as an evenly spread star field
  (best-candidate); the rest fall into alternating dense/sparse
  horizontal stripes by weighted sampling, dense at top and bottom.
  Parameters: stripes (odd, 3–21), stripe contrast (dense:sparse
  weight ratio), canton width (0 = no canton).

In Standard and Angelic the generator places the board directly; in
Uniform NG and Proof-or-die it supplies the candidates for the
generate-and-reject loop, so a colored-noise NG board is noise-shaped
AND fully solvable (the attempt budget still fails loudly).

**The top score key** is the single high-level concept: everything that
determines how a board is made and played — board parameters, play
mode, and the generator with its exact parameter values — and every
key holds its own separate history and rankings. Concretely the key is
`WxH/M@playMode` plus a `+generator(param=value,...)` suffix in schema
order, e.g. `9x9/10@standard+pink-noise(alpha=1,scale=8,contrast=2)`.
The default generator adds no suffix, so every pre-generator key is
already a valid top score key, exactly as keys without `@` mean
Standard. Records carry the same facts: `boardVersion` names the
placement algorithm version (one string per generator) and `generator`
stores the non-default id plus its complete parameter set; both are
frozen per board at deal time, so a mid-board settings import cannot
make a record disagree with the placement that actually ran.

## A just universe (decided 2026-08-20)

The first friendly variant (the direction of `agents.md` design-axis entry
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
  decision): see "Game-end evaluation".
- The per-game record carries the event count (`justice`), the frozen
  `justiceEnabled` state, the 128-bit `seed`, `rngVersion`, `boardVersion`,
  and `justiceVersion`; see Per-game stats. Rankings mix Justice-on and
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
  are recorded in `agents.md`.

## Game-end evaluation (requested and decided 2026-08-23)

Every board-changing action, fatal action, and classified no-op board
input is evaluated against the position visible immediately before it.
The canonical result is a versioned
`actionEvaluations` evidence ledger, not one mutually exclusive label.
The ledger stores every fatal action and every earlier measured reportable
action;
a nonfatal unnecessary guess therefore survives into the after-game
report.

- New evidence records carry `proofVersion: "all-consistent-layouts-v1"`.
  An exhaustive result may call an unresolved cell uncertain; an
  explicitly incomplete work-limit result may preserve facts already
  proved, but cannot generate an “unproven” criticism. Older
  `opened-unproven-with-safe-move` entries that include a saved position
  are rechecked by the canonical solver; if the selected cell is now
  proved safe, that obsolete mistake tag is removed and the correction is
  persisted.
- The independent dimensions are preserved together:
  - **action and outcome** — reveal, chord, flag placement/removal, or a
    proof-or-die open; continued play or death;
  - **visible certainty** — selected square proven safe, proven mine, or
    uncertain;
  - **necessity** — whether a guaranteed-safe reveal existed elsewhere;
  - **raw risk quality** — chosen mine probability, lowest available
    mine probability, and whether the minimum was taken;
  - **actual risk under the active rules** — chosen and best immediate
    loss probability after Justice or mode protection is applied. Raw
    risk can remain nonzero while actual risk is zero; that action is not
    called game-risking;
  - **one-ply modeled quality** — chosen and best measured expected
    remaining life. This is explicitly the odds model's output, not a
    claim about information, intent, attention, or cause;
  - **mechanical contradictions** — proven-safe flag, removal of a
    proven-mine flag, visible chord contradiction, and a wrong-flag chord
    established only by the fatal outcome;
  - **no-progress input** — unsatisfied chord, left-click on a flag, or
    right-click on a revealed cell. These carry their exact no-op reason
    but omit a full board snapshot to avoid multiplying history size.
- **Needless guess** has one precise meaning: the player revealed an
  uncertain, positive-risk square while at least one zero-risk reveal
  was available. Merely having a different move with higher modeled
  expected life is recorded separately.
- A click on a **proven mine while a safe move is open** records both
  facts: `opened-proven-mine` and `ignored-safe-move`. It is not collapsed
  into either "mine" or "needless." A positive-risk uncertain click in
  the same position records `guessed-with-safe-move`; a forced guess
  above the minimum records `chose-higher-risk`; a forced minimum-risk
  guess carries no mistake tag even if it happens to kill.
- The primary fatal status uses the independent facts directly:
  **opened a proven mine while a safe move was available**; **opened a
  proven mine when a guess was required**; **died after guessing while a
  safe move was available**; **higher-risk forced guess**; or **died
  despite choosing a minimum-risk forced guess**. An unmeasured risk rank
  says so. Chording is only the input method: its opened cells receive the
  same proven/potential, safe-available, and risk-rank classification
  rather than a separate “chord death” report class.
- Evidence capture must never block play. Prover/enumerator failure is
  stored as unmeasured rather than filled with an invented conclusion.
- **Exclusive report taxonomy** (added 2026-08-23): each evaluation
  appears once, under its highest-severity applicable category, while
  all lower-level mistake tags remain on its evidence:
  1. **Game loss** — every fatal action. The category states the outcome,
     not that the action was a mistake; a lowest-risk forced death belongs
     here too.
  2. **Game risk** — a survived action that added actual immediate loss
     probability under the active mode and protection rules. Raw-risk
     differences canceled by Justice or Angelic protection do not qualify.
  3. **Time loss** — a no-progress input, proven-safe flag, removal of a
     proven-mine flag, or nonfatal visible chord contradiction. The
     measurement is one classified action; it does not invent seconds or
     claim intent.
  4. **Life maximization** — an otherwise-lower-severity action for which
     the one-ply model found higher expected remaining life elsewhere.
     This category is optional and model-relative, including
     sea-versus-frontier comparisons; it is not presented as long-horizon
     optimality.
  5. **Measurement notes** — legacy or incomplete evidence that cannot
     honestly be classified further, plus the factual Justice recap.
- Display: the compact stats stay in the 320px sidebar, while the action
  analysis occupies a centered, responsive column below the board and
  above rankings/charts. Category sections appear in the severity order
  above. The fatal action is always first. Survived game-risk actions then
  sort by selected actual death probability (highest first), with excess
  risk as the tie-breaker. Time loss, life maximization, and measurement
  notes follow and retain action order. Wins use the same report: they have
  no fatal block, but survived risky or needless guesses still appear when
  the selected scope includes game risk. Every bare reveal is evaluated;
  marking or chording is never required for criticism. When no action
  qualifies under the selected scope, the report emits no empty-success or
  “nothing recorded” placeholder. Each block leads with
  only the dimensions that distinguish that report type, as compact
  labeled facts (`Immediate risk`, `Safe alternative`, `One-ply life`,
  etc.). Equal raw/active risks collapse into one line, equal modeled-life
  values say “tied,” and measured values/counts are retained without
  repetitive prose. A saved rendering shows the visible board before the
  action. Uniform covered remainder is omitted: the diagram crops to
  revealed/flagged/selected/trigger cells plus two cells of context,
  explicitly labels its original row/column range, and ignores a large
  alternative set when choosing bounds. The selected square(s) are outlined
  red; guaranteed-safe alternatives green; lower-risk or higher
  modeled-life alternatives blue; flag corrections orange. Alternative
  legends show the full count plus short coordinate examples. Trial results retain each run's
  ledger and expose the same report in a nested “action report” disclosure
  under that run, so the final trial review does not lose interim mistakes.
  Semantically identical entries without a saved diagram aggregate at
  their first occurrence and show one count (for example, “Unsatisfied
  chord clicks: 7”); positioned evidence remains one block per action so
  each action number stays attached to its diagram.
  Full analysis adds category counts instead of one undifferentiated
  “recorded mistakes” total, plus nonzero excess-game-risk and
  modeled-life-gap magnitudes. Lower tiers omit those diagnostic rows.
  Under the default fatal-only tier a clean win shows no analysis block;
  the persistent scope selector remains available.
- The session endings chart classifies losses through the **same
  fatal-action status the report labels** (2026-08-23, evening: the
  chart's categories must be the report's reasons for losing, word for
  word): opened a proven mine (safe move available / guess required),
  Proof-or-die rule death (with / without a proven-safe move), died
  after guessing while a safe move was available, and forced guesses
  that were higher-risk, minimum-risk, or risk-rank-unmeasured. One
  classifier produces both the report label and the chart kind, so the
  two can never disagree. The five old ending names (`mine`, `chord`,
  `needless`, `forced`, `angel`) survive only as **legacy provenance**:
  losses imported from records that stored the old five-way verdict
  keep their old line (dashed on the chart) rather than having modern
  detail invented for them, and the report shows their old wording.
- The Justice recap (win or loss alike): when the game had Justice
  events, a second block cites the rule by name — 'Due to the rule "A
  Just Universe", you won a forced coinflip' (count-pluralized) — with
  one detail line per event (pocket type, clear/total layout counts,
  "a forced coinflip, won"). Strictly the player's point of view
  (creator directive later on 2026-08-23, reversing the same-day
  "honest redraw detail" design): no "actual" mine reality is ever
  revealed or referred to — whether an entry's square was mined and
  redrawn or was already clear is not recorded, shown, or hinted at.
  A forced flip is a forced flip, neither a life nor a death. The
  layout counts in the detail lines are the player's own information,
  derived from visible clues.
- Storage (see Per-game stats): `actionEvaluations` on every new record.
  `justiceSaves` (the redraw count) was written only during part of
  2026-08-23 and is no longer recorded — see the player's-point-of-view
  directive above; old records keep it as an accepted historical field,
  but nothing displays it. Legacy `stupidDeath`, `deathKind`,
  `deathRisk`, and `deathBestRisk` fields are accepted only at the
  load/import boundary, converted immediately into a versioned action
  evaluation with explicit legacy provenance, deleted, and persisted
  back. Coarse old evidence is never upgraded by inventing detail.
- The left panel's session section gains a **game endings** chart: one
  chart, one cumulative percent line per ending kind (win plus the
  report's fatal-action statuses plus dashed legacy-verdict lines plus
  "unjudged loss"), each line the kind's share of the games finished so
  far in the played-time window. Kinds that never occurred stay off the
  chart, except the win line, which always draws once any game has
  ended (a 0% win line is itself the reading). A
  color legend under the chart carries each drawn kind's current share;
  this chart keeps its legend even though the action-rates charts label
  their lines directly (2026-08-23, evening), because cumulative-share
  lines converge and stack at identical values, leaving no honest room
  for on-chart names.
- The same chart carries the **percent of mines unmarked when winning**
  line
  (2026-08-23, evening; renamed from "win-with-unmarked-mines" minutes
  later — that read like a share of wins, not a share of mines), a
  different quantity on the same percent axis,
  drawn dotted: across the window's wins so far, the average share of
  the board's mines carrying no flag at the instant of winning
  (measured only on wins; 0% means every mine was flagged, 100% a
  markless win). Live wins count unflagged mines just before the
  auto-flag sweep repaints them; stored wins derive the share (never
  store it) from `flagsPlaced - flagsRemoved` against the mode's mine
  count — at a win every flag still on the board provably sits on a
  mine, since flagged cells cannot be revealed. Wins recorded before
  the flag counters existed are unmeasured and stay out of both the
  numerator and the denominator; the line draws once any win in the
  window measured it, even at 0% (flagging every mine is a reading
  too).
  Wins backfill as wins; losses derive their line from the fatal action
  evidence; legacy losses retain their old line through provenance, and
  evidence-free losses are "unjudged loss".
- The session window is now selectable (this request's companion): 15m /
  30m / 1h / 3h of accumulated play, persisted as `sessionWindowMinutes`
  (default 60), chosen with a second selector on the session section
  head beside the running-average length. Event retention always covers
  the largest choice, so switching longer works immediately.
- `reportScope` is the single persistent “After each game, show me”
  setting, available both directly above the current after-game report
  (changes apply immediately) and on the settings page:
  - `none` — no action report, mistake/category counts, or fatal-action
    mention; evidence is still stored;
  - `fatal` — **default for every new player**; wins show no analysis,
    losses show exactly the fatal action and its evidence;
  - `risk` — fatal action plus earlier actions that increased actual
    death probability;
  - `full` — fatal and risky actions plus aggregated time loss,
    model-relative optimization, measurement notes, and the corresponding
    diagnostic stats.
  Old `shownThings.endVerdict` and `reportCategories` values are read only
  to migrate an existing preference into the nearest tier;
  `reportDetail` is retired. None are shown or rewritten. Reports describe actions
  under the stated rules;
  it does not identify judgment, attention, or any other cause — the
  standing measurement doctrine.

## Layout: the board never moves

- The board is the anchor. Nothing that appears or disappears may shift it,
  ever.
- The win summary (three lines: outcome, mode, end date-time) + stats table
  are the ONLY things allowed beside the board: normally absolutely
  positioned at the far right of the available main column, vertically
  aligned from the board row's top, 320px wide. Container-relative
  positioning accounts for the in-page metrics column, so the stats'
  right edge never crosses the main column/window edge. If fixed top-right
  controls occupy the same strip, the stats start below those controls
  while remaining flush right.
- Everything else (the centered action analysis, rank lists, rankaverages,
  streaks, scatter plots) sits below the board in normal flow. If the stats
  table is taller than the board, the first visible section shifts down by
  the overhang so nothing sits under the table; the board does not move.
- The scrollbar gutter is always reserved so a tall results area cannot
  change the viewport width and nudge the centered board.
- The results area echoes the in-game numeral face (Arial Black stack).

## UI doctrine (directives collected 2026-08-23)

Player directives given across the settings redesigns, promoted here
because they apply app-wide, not just where each was first stated.

- Simplicity first: prefer the simplest surface that does the job. When
  explanatory or demonstration machinery accretes around a surface,
  strip it rather than polish it — the settings demo world (a pretend
  mid-game that reacted to every switch) was built and removed the same
  day on this rule.
- Captions and explanatory text must earn their place: write one only
  when it says something truly new and useful, keep it minimal and to
  the point, and never add speculation or editorializing. A caption that
  restates its control's name is noise and gets removed. Full
  descriptions may ride on names as plain tooltips.
- Hover changes nothing: pointer movement must never inject, swap, or
  reflow text, and no control may be reachable only by hovering.
- Layout stability: content appearing or disappearing must not shift
  unrelated content. "The board never moves" (previous section) is the
  oldest case of this rule; it holds on every page.
- Clear ways in and out: a surface opens from an obvious bordered button
  and closes just as obviously — for a page, a visible way back at both
  the top and the bottom of the body (not tucked at a far edge), plus
  Esc. Modals and separate pages are allowed; the old "in-page only,
  never a modal" lock was lifted 2026-08-23.

## Measurement purpose (decided 2026-08-20)

The point of all per-game measurement — scalar stats, raw input traces,
and state tags — is to preserve observations that can be compared within
one player over minutes, days, and longer periods. The game records what
happened; it does not infer why a value changed. A state tag permits later
grouping by that self-reported context, but neither a tag nor a correlation
establishes a cause. Motion and gameplay measurements are not diagnoses,
health assessments, personality traits, or proven measures of fatigue,
attention, confidence, expertise, or cognition.

Questions about learning, equipment, health, or other circumstances are
research hypotheses until tested against the stored observations with an
explicit analysis and appropriate controls.
This is why measurements favor completeness over compactness, why raw
traces are kept (a metric invented years from now must be computable over
today's games), and why spent effort is never dropped (see the
measurement principle in reference/mouse-motion-metrics.md).

Clarified 2026-08-20: the motion metrics measure the outer physical
world — the layer where the player actually interacts with the mouse and
generates movements — not the inner cognitive one. Concretely, every
inter-click movement is anchored at the last click before it, regardless
of how long before that its destination had been revealed or become
deducible; when the player's intention for a move was actually born
(at the enabling reveal, during earlier work, on committing after the
previous click, or on re-verifying at arrival) is private and is
deliberately not guessed at. A cell that gets resolved indirectly by
separate processes (a flood fill or a chord from elsewhere) simply
produces no movement and no work items — correct, because no physical
interaction happened there. The full birth-time analysis, including the
uneven thinking-contamination it implies and the computable refinements
left for later, is in reference/mouse-motion-metrics.md ("Goal birth
time and segment anchoring").

## Per-game stats

Recorded per finished game, win or loss, primary measurements only: end
date, outcome, time (ms precision, shown as seconds to 3 decimals), 3BV,
clicks, no-op clicks (`wastedClicks`), misclicks, flags placed, flags removed, mouse path (px of
cursor travel, accumulated only while the game is in progress), and
the versioned action-evaluation ledger (`actionEvaluations`), plus
the finished-board shape facts (max number, whether a 7 is present,
zero count, island count, largest island). The stored click count includes only
clicks that changed the board (reveals, flags, chords). Everything else is
derived at display time: 3BV/s (4 decimals), clicks over 3BV (clicks minus
3BV; wins only — a lost board was never finished, so the subtraction means
nothing), efficiency % (3BV / effective clicks, as a percent), correctness %
(effective / (effective + wasted); omitted when wasted clicks were never
measured), throughput (3BV / effective clicks, as a 4-decimal ratio — the
same quantity as efficiency, clone name; wins only, same unfinished-board
honesty as clicks over 3BV), IOS (log(3BV) / log(time in seconds); wins
only; blank when time is 1s or less, matching minesweeper.online), mouse
speed (px/s), path per click, path per 3BV, and (2026-08-22, the per-game
forms of the session series) click rate (effective clicks per second),
no-op rate (no-op clicks per second — per minute until 2026-08-23,
when it followed the session chart's unit move; the rate is derived
from the stored count, so old and new records alike show the new unit
with no migration), misclick rate (visible-board
contradictions per minute), and mark rate (flags placed per second) —
all derived from the stored counts and time, so they
appear on historical games too.
Shown as a label/value table for wins and losses alike; a loss shows no
rank output at all (losses split win streaks and feed lifetime totals, but
are not ranked).

Wasted clicks — board clicks that changed nothing (chord attempts on
unsatisfied or empty numbers, left-clicks on flagged cells, right-clicks
on revealed cells) — joined the record schema on 2026-08-19 (decided
2026-08-19: tolerate absence going forward). Games recorded before the
measurement existed simply lack the field: absence means "not measured"
and is valid on import (a present value must be a number); displays that
need the value use only records that carry it. Every game recorded from
now on has it.

Misclicks — board-changing actions contradicted by facts provable from
the visible board at click time: opening a proven mine, flagging a proven
safe cell, removing a flag from a proven mine, or chording while a flagged
neighbor is proven safe or an opened neighbor is proven mined. This is an
operational visible-state classification, not a claim about intent or what
the player consciously knew. It is independent of outcome: a fatal
misclick also appears in the action-evaluation ledger, while a wrong
flag can be a nonfatal misclick. Stored as `misclicks` on every new game
record beginning 2026-08-23; older records omit it as not measured.

Flags placed — how many flags the player set during the game (removing a
flag doesn't subtract; the auto-flagging of remaining mines on a win is
not the player's doing and is not counted) — joined the schema on
2026-08-19 under the same absence rules as wasted clicks. A game with
zero flags placed holds the special status "markless": the stats table's
"Flags placed" row reads "0 - markless", and wherever an individual game's
time appears in a table chart (rank-list time cells, the stats table's
Time row) a small olive-green "(m)" precedes it. Aggregate times
(rankaverage group averages, delta rows) carry no marker, since they mix
games. Records from before the
measurement never claim the status, since for them it is unknown.

Flags removed — how many flag states the player turned off — joined the
schema on 2026-08-20 under the same absence rules. Placement and removal
both changed the board and count as effective clicks; the placement still
counts in flags placed. Removal is stored separately from no-op clicks
because they are different observable events. The record does not say why
either event occurred: a no-op is not automatically a motor slip, and a
removed flag does not prove a changed mind.

Justice — how many bare entries into certified sealed pockets were
guaranteed safe (see "A just universe") — joined the schema on 2026-08-20
under the same absence rules as wasted clicks. It increments on every
qualifying entry whether the hidden cell was originally clear or required
a redraw. Zero is a normal value and is recorded; the stats table always
shows the row when the field exists. `justiceEnabled` records the setting
state frozen at the first reveal so the rules of the game remain knowable,
although rankings deliberately continue mixing both states for now.

Guess ledger — on every bare click into a cell whose remaining-layout
mine probability is greater than zero (not the first click, never a
chord). A cell that is safe in every consistent layout is not a guess,
even if local deduction had not yet marked it; clicking it is not
wrong and does not print a chip. The remaining consistent layouts
are enumerated and the click is scored. Stored per game (joined
2026-08-21, same absence rules as wasted clicks; omitted entirely if any
guess in the game exceeded the enumerator budget): `guesses`,
`guessIdealRisk`, `guessNonideal`, `guessPerfect`, `lifeLost`,
`lifeNeedless`, `oddsVersion`.

- **Life lost** (absolute). Each guess costs its mine probability. A 19%
  death click spends 0.19 lives in the multiverse whether you lived or
  died. Justice may still rewrite a certified pocket so you live; the
  0.19 remains on the ledger (the remaining chance you lived was played
  out, not erased).
- **Life needless.** Cost above the safest available cell:
  p(chosen) − p(best). Clicking the ideal-risk spot costs 0 needless
  life even if that spot is itself a 19% die. This still punishes
  semi-deaths — picking a 30% when a 19% existed — without punishing
  ideal play for the world's residual risk.
- **Ideal-risk / off.** A guess is ideal-risk when it chose a lowest-p
  cell, off when it did not.
- **Perfect.** Lowest raw risk is not the same as best play. A 4% click
  that tells you almost nothing can lose to a 5% click that splits the
  remaining layouts and leaves a solved board. The stored objective is
  one-ply expected remaining life: (1 − p(die)) × (1 − expected min
  remaining risk after the number that click would show). When Justice
  would certify the cell, death risk for this score is 0 (you will
  live) but absolute life-lost still uses the raw p. If the remaining
  region is too large to enumerate, `guessPerfect` falls back to
  “same as ideal-risk” rather than inventing information value, and if
  even p cannot be measured the whole ledger is omitted.

A chip (olive, in the Justice stack, shown at game end like the rest of
the stack) prints the raw p and either
`ideal`, `justice`, or the needless extra; its hover text names the
reason (a provably safe square was available, or the safest square's
odds). The ledger exists only where the standard mine gamble is real:
Standard, the Trial modes, and the NG modes (their mines still kill).
Angelic records no ledger — an unproven click there cannot kill, so a
risk chip would be fiction — and neither does Proof-or-die, where an
unproven click is a deterministic death, not a probability. Absence of
the fields on those modes means "not measured", the usual rule. A
scoring failure never blocks the reveal: it announces in the backup
status line and omits that game's ledger. The odds engine is held to
ground truth by a brute-force parity test (every consistent layout
enumerated on small random boards; probabilities must match exactly).

Action evaluations — `actionEvaluations` joined the schema 2026-08-23
and is the sole in-memory/store representation for action mistakes and
deaths. It is an array on every new record: empty when a win had no
recorded reportable action, otherwise one item for each nonfatal measured action
plus one item for the fatal action on a loss. Every item carries a schema
version, action number/time, action/result, any number of independent
mistake tags, literal measured evidence, and alternative cells. Actions
where position matters also carry a compact visible-position snapshot
(revealed cell/number pairs plus flagged indices); no-op inputs omit it
to avoid duplicating the board in history. A snapshot records what was visible, not hidden
mines the player could not see. See "Game-end evaluation" for the full
taxonomy and report.

Legacy `stupidDeath`, `deathKind`, `deathRisk`, and `deathBestRisk` are
import-only. Loading or importing immediately converts them to one fatal
action evaluation, records exactly which old representation supplied it,
removes all four legacy fields, and persists the normalized history.
`deathKind` can retain its old five-way chart line as provenance;
`stupidDeath: true` can retain only “legacy avoidable” because inventing
the missing modern subtype, risks, alternatives, or board would be false.
An older win with no action ledger becomes an explicit measurement note
that action coverage is unavailable, not a falsely mistake-free modern
game.
No runtime calculation reads either legacy field.

Justice saves (`justiceSaves`) — a historical field written only during
part of 2026-08-23, counting which Justice entries involved a redraw. It
was retired the same day by the player's-point-of-view directive: never
reveal or refer to an "actual" mine reality behind a forced coinflip —
a forced flip is a forced flip, neither a life nor a death. The field is
no longer recorded or shown anywhere; the schema still accepts it so the
records from that day stay valid.

Fastclick gap — the game's median gap between consecutive board-changing
presses made on the move (a cursor move within 100ms before the press)
with gaps under 1s — joined the schema on 2026-08-22 alongside the
session stats, whose fastclick series uses the identical qualification.
Stored (as `fastclickGapMs`) rather than derived because it needs press
timestamps, which the scalar record does not carry (the trace does, so
history from the trace era is backfillable offline). Win or loss alike.
Absent when no gap qualified — slow, careful play is "not measured
here", never a made-up number — and on games recorded before the
measurement. The stats table shows a "Fastclick gap" row when the field
exists.

Seed — every new board receives a cryptographically generated 128-bit seed.
`xoshiro128ss-v1` expands it into the one deterministic random stream used
for initial mine placement and every Justice redraw. Finished records and
traces store `seed`, `rngVersion`, `boardVersion`, and `justiceVersion`.
The seed plus board mode, first click, RNG version, and board version
reproduces the initial board. Reproducing later redraws also requires
replaying the stored input trace under the recorded Justice version,
because redraws consume the stream only when the player's path triggers
them. A bare seed without those version names is not claimed to be a
permanent replay format.

Board shape — facts of the finished mine layout, joined the schema on
2026-08-21 under the same absence rules: `maxAdjacent` (highest number
on the board), `hasSeven`, `zeroCount` (cells with adjacent-mine count
0), `islandCount` (8-connected mine components, diagonals included,
edges empty), `largestIsland` (mine count in the largest component).
The stats table shows max number, zeros, islands, and largest island
when the fields exist. They feed the board-shape time lists.

Music playing — whether this machine heard audio playing during the game
— joined the schema on 2026-08-22 (decided 2026-08-22). The page cannot
observe system audio; the machine's resident base system (ProjectLauncher,
the localhost dashboard's API) can, via PipeWire: playing means some audio
output stream is running (speech synthesis excluded) AND the speaker mix
actually carries signal (~0.5s of the default sink's monitor above
-60 dBFS) — stream state alone lies, since some players hold an open
"running" stream while feeding silence. It serves a cached boolean at
localhost/api/is-music-playing, rechecked there at most once a minute. The
game polls it continuously while the page is open (every 15s, plus once
the moment a board is dealt); the record stores `musicPlaying` = true if
any answer arriving while the game ran heard audio, false if every one
heard silence, and no field at all when the endpoint never answered (any
other machine, base system down) — absence means "not measured", the
usual rule, so records cannot lie on origins with no base system.
Because it is a true state of the world, it is also shown live: an olive
"music" chip in the fixed upper-right cluster (by the states tags)
appears while the latest answer is "playing" and goes away when the
music stops — within about a minute either way, since the base system
rechecks at most once a minute (worst case ~75s: poll interval + cache
age). An unreachable endpoint shows nothing: unknown is never displayed
as silence. The chip is display only — a measured fact, not a player
tag, so it has no x and takes no clicks. The stats table shows a "Music"
row (playing / none) when the field exists. Deliberately a boolean, not
the stream titles: titles are personal data that would live forever in
records and exports.

States — the player's state tags active at the moment the game finished
(see "Player states" below) — joined the schema on 2026-08-20. Every game
recorded from now on carries the field (an empty list when nothing was
active); games from before it existed lack it, same absence rules as
wasted clicks. The stats table shows a "States" row only when the game
carries at least one tag.

## Player states

- The player keeps a personal list of self-reported context tags —
  sleepiness, mood, hardware ("bad mouse"), location. Active tags are
  stored on finished-game records for later grouping and comparison; the
  tag and any observed association do not establish a cause.
- Only ACTIVE states are visible. Each shows as a chip (the me-row
  highlight: bold black on light blue, with a trailing x); clicking a
  chip takes the state off. An untagged session shows nothing but one
  small "+ state" button, which carries a hover tooltip explaining the
  feature.
- The "+ state" button opens a menu of the inactive options: clicking a
  name puts it on (and closes the menu). The menu also manages the list
  itself: an x beside each option deletes it outright, and a text field
  at the bottom creates a new state — a created state goes on
  immediately, since typing it mid-session means "I am in this state
  now". Duplicate or empty names are refused with a visible message.
- Since 2026-08-23 the "+ state" opener is a real bordered button (it was
  dotted-underline text) that holds a pressed look while the menu is up,
  and the menu carries a "session states" header with an ×; ×, Esc, and a
  click outside all close it. (It shares the button dress with the
  "settings" link beside it, which since later that day leads to the full
  settings page rather than opening a surface here.)
- A new player's menu offers three suggested options: sleepy, just woke
  up, inebriated — none active.
- The active set is stamped onto each game record at the moment it
  finishes (win or loss).
- Editing the list never touches past games: records keep exactly the
  states they were stamped with, even if a state is later removed.
- The states panel sits in the screen's upper-right corner (2026-08-20;
  it previously hung off the board's left edge), sharing a fixed cluster
  with the play-mode menu (2026-08-21) and the settings button. Fixed to
  the viewport, it occupies no layout space — using it never moves the
  board — and stays visible while scrolling the charts.

## Rank lists (time windows and day categories)

- Windows, all in the viewer's local timezone: lifetime; "in <year>"
  (calendar year); "in the last year" (rolling: starts at the end of the
  day exactly 365 days ago); "this month" (calendar); "past week" (midnight
  6 days back); "today" (since last local midnight); past hour / 15 min /
  5 min / 1 min (rolling).
- Day categories: "on <weekday>s" (today's weekday), "on weekends" or "on
  weekdays" (whichever today is), "on holidays" (US federal, only when
  today is one).
- Progressive disclosure: when several lists would contain the exact same
  set of scores, only the most specific renders (specificity: narrow
  windows, then day categories, then broad windows). Exception
  (2026-08-22, "past week" added to it later that day): "lifetime" and
  "past week" always render, and any window holding the exact same
  scores collapses into one of them — so a player whose whole history
  fits in one week sees "lifetime" and "past week" rather than a stack
  of identical month/year charts, and always has the week as a recent
  reference frame. A brand-new player sees the two pinned charts;
  broader ones appear as history spreads out. This is the
  `collapseDuplicateCharts` setting (see Personal settings), on by
  default; switched off, every window always renders its own chart.
- Also one non-window list: "3BV N" — every win
  whose board had exactly this game's 3BV, the fairest time comparison
  (2026-08-20). Same row format as the window lists.
- Board-shape lists (2026-08-21), same row format, over timed wins of
  this mode whose finished board (after any Justice redraw) matches this
  game. Measured at game end and stored: `maxAdjacent`, `hasSeven`,
  `zeroCount`, `islandCount`, `largestIsland`. Absence on earlier
  records means not measured; those games stay off these lists.
  - "has 8" / "has 7" — at least one cell with that number.
  - "max 4" / "max 3" / "max 2" — no number higher than that cap.
    Nested; a max-2 board also qualifies for max 3 and max 4.
  - "N islands" — 8-connected mine components (diagonals count, edges
    empty, no wrap).
  - "largest island N" — mine count in the largest such component.
  - "N zeros" — cells whose adjacent-mine count is 0.
  Progressive disclosure uses the same setting as the window charts:
  identical member sets keep the most specific list (has 8, has 7,
  max 2, then max 3, then max 4, then the grouping lists).
- Row format: rank, time, relative age. Headings carry only the window
  name; the rank fraction lives in the chart itself — your row's "#x"
  plus an "of N" footer line, shown only when rows are actually cut off
  below (if the last row is visible the end is already in view). The
  footer line always occupies its height, blank when unneeded, so its
  appearing can never resize a chart (2026-08-20).
- Windowing: always the full 11 rows when the list has them. If your rank
  is within the top 11, the list anchors at #1 and shows the top 11 with
  your row in its true place (a #8 placement draws #1-#11, never #3-#13).
  Otherwise the window centers on you — 5 above, 5 below — sliding upward
  near the bottom so the budget still fills (a constant row count also
  keeps chart heights stable across rankaverage re-sorts, 2026-08-20).
- Every list always renders its full window at full opacity, wherever the
  placement falls: a mediocre rank still shows its 5 neighbors either side,
  because the placement itself is fresh information. (This replaced the
  earned-detail collapse, which greyed non-top placements to a single row.)

## Recent placements (requested and decided 2026-08-23; charts and the
## lifetime near-miss rule extended later the same day)

- One summary block, rendered right after the "3BV N" list: for a chosen
  recent window it reports, per longer chart, which of that chart's top
  ranks were earned within the recent window — e.g.
  "this month: 1st, 3rd, 8–12th / lifetime: 7th, 14th".
- Source window choices: today (since the last local midnight — the
  default), today since 6am (6am is the day boundary, so before 6am it
  reaches back to yesterday's 6am rather than reporting an empty
  morning), in the past 10 min / 30 min / hour / 2 hours / 4 hours
  (the short rolling windows added 2026-08-23), in the past 24h, in the
  past week (midnight 6 days back, same as the rank window). The choice
  persists
  as the `recentPlacementsWindow` setting, chosen with the selector on
  the block's own heading (like the session lookback); changing it
  re-renders the result in place.
- Only charts strictly longer than the source window report — a chart no
  longer than the source could only echo itself. For time windows,
  strictly longer means the window starts strictly earlier: with the
  source at the past hour, "today", "past week", "this month" and up
  qualify while "past hour" and shorter never do, and "today" as source
  excludes the "today" chart itself.
- The general rule (decided 2026-08-23, third revision that day): every
  chart this game is ranked on competes. Besides the time windows that
  means all the lifetime-spanning membership charts — the day categories
  (this weekday, weekend/weekday, holidays when today is one), this
  game's "3BV N" chart, and its board-shape charts (has 8 / has 7 /
  max N / N islands / largest island N / N zeros). Spanning lifetime,
  membership charts always qualify as longer; only their member wins
  compete. The summary is independent of which tablecharts are switched
  on (hiding a chart does not hide the fact); the chart definitions are
  shared with the tablecharts (`boardShapeCandidates`, `rankColumns`) so
  the two sets cannot drift.
- Only ranks within the top tenth of a list are reported (rank r
  qualifies when r × 10 ≤ list length): a 9-win list reports nothing, a
  200-win list reports ranks up to 20. Ranking order is the tablechart
  order — fastest first, ties by earlier finish.
- Lifetime always answers (added later on 2026-08-23): when the source
  window has wins but none reached lifetime's top tenth, the single best
  (closest) recent lifetime rank reports anyway, muted and with an
  explanatory tooltip — how close the window came stays visible. Because
  of this rule, the block's one-line empty state means exactly "no wins
  <window>" and says so.
- Row format: chart name, the earned ranks with consecutive runs
  compressed ("8–12th", the ordinal suffix closing each run), and a pale
  "of N" naming the list length the tenth is of. Rows order narrowest
  chart first (the tablecharts' specificity order; after lifetime come
  the same-3BV chart, then the board-shape charts in their tablechart
  order).
- Gated by shownThings.recentPlacements (on by default).

## Relative age display

- Largest sensible unit, abbreviated, no "ago": s, m, h, d, w, mo, y.
  h, d, w, and y show one decimal place, including trailing .0 (1.0h,
  2.3d, 2.0w). s, m, and mo stay whole. Tenths-rounding that would
  display as the next unit's threshold promotes instead (23.95h → 1.0d).
- A 0-second age renders as "this" (the game that just finished), spanning
  the age columns, right-aligned so its right edge is flush with the other
  rows' age labels (2026-08-20; replaced the left-aligned "just now").
- The age (count + unit) is color-coded by unit: s = hyper-fluorescent
  green (#39ff14, always bolded — too light to read at normal weight);
  then the board-number palette: m = green, h = blue (the "1" blue),
  d = red (the game red), w = navy, mo = maroon, y = teal.
- Your own row is bolded on a tasteful light-blue highlight (#d8ebfa),
  with text overridden to black for readability (unit colors would be
  unreadable on the highlight).

## Rankaverage charts

- One per grouping stat: efficiency (exact %), clicks (exact), 3BV (exact),
  3BV/s (0.01 buckets), mouse path (100px buckets), mouse speed (10px/s
  buckets). There are NO separate rankcount charts and no exact-match
  "same 3BV/clicks/efficiency" columns — the rankaverage's x-count column
  and value grouping cover those.
- Row format: rank, grouped value, that group's average solve time, win
  count in the group. Ranked best (lowest) average first. The count is
  written with a trailing multiplication sign ("12x") and right-aligned,
  so ones/tens/hundreds places line up down the column.
- No chart title: a header row of clickable column names does the naming,
  with the value column's header carrying the stat name at heading size
  and weight while its neighbors ("#", "avg", "count") stay pale
  (2026-08-20).
- Sortable (2026-08-20): clicking a column header cycles ascending (▴),
  descending (▾), then back to the natural rank order. Sorting only
  reorders rows — every row keeps its true by-average rank number — and
  the window stays centered on this game's bucket. The chosen order
  persists per chart (userdata `rankavgSort`, entries {key, dir},
  absent = natural) and every comparator ends in a
  deterministic tie-break, so a given history always renders the same way.
  Re-sorting freezes the chart at its pre-click width so reordering never
  reflows the charts around it.
- Delta row, minimal text only: how this win moved its own group's
  average. Because the delta is a time, it renders as the chart's last
  grid row with its text in the average-time column, exactly aligned
  under the times above it. The SIGN is the true numeric direction of the
  average time ("-0.024s" = it fell, "+0.462s" = it rose); the COLOR is
  the judgment: green = good (average fell), red = bad (rose), gray "=" =
  unchanged at display precision (a shift rounding to 0.000s is never
  "worsened"), blue "new" = first game in that group. Green always means
  good, red always means bad.

## Average-time charts

- One small scatter per grouping stat (`AVERAGE_SCATTER_SPECS`): grouped
  value on x, that group's average solve time on y, dots colored by the
  age of the group's newest win.
  Axis labels name the chart ("→ 3BV" / "→ average time").
- Trend lines (decided 2026-08-22, chosen by eye from a five-fit
  sampling): the Theil–Sen line y = a + b·x — b is the median slope over
  all point pairs, a the median of y − b·x. Chosen over least squares
  because outlier games barely move it, and over a through-origin ratio
  line because solve time has a fixed per-game component. The line draws
  twice, both dashed (dashing marks them as fits, not data), colored by
  the same color:recency sense as the age dots: the fit over all plotted
  bucket averages in the years teal (deep history), the fit over bucket
  averages recomputed from today's wins only (local midnight, as
  everywhere) in the hours blue — today's line only appearing once today
  has at least 2 buckets.   Lines clip to the plot frame and span only
  their own fit's x-range (a fit is never extrapolated beyond its data).
  No caption: the fit-name/math caption and the color-key note ("teal =
  all data, blue = today only") were both dropped 2026-08-22 — the
  dashing marks the lines as fits and the color:recency sense already
  matches the age dots. The date, 3BV/time, and 3BV/clicks raw plots
  carry the same pair (see "Scatter plots").

## Streak lists

- Three lists: "streak" (0 losses), "near-streak" (1 loss ok),
  "near-near-streak" (2 losses ok) — headings carry just these names, no
  parenthetical (2026-08-20). A k-loss streak is k+1 adjacent win-runs
  joined.
- No double counting: candidate windows are trimmed to their non-empty
  core; identical cores dedupe; a core strictly inside a wider core is
  dropped (consecutive losses otherwise re-list sub-streaks). Two streaks
  that merely overlap across different losses are both real and both stay.
- Ranked by length, then recency. Row: rank, "N wins", relative age of the
  streak's last win. The streak ending in this win is your row.

## Scatter plots

- At the very bottom, ten plots, grouped time-trend first, then board,
  then mouse: win time vs date (local date/time x-axis: minute-to-day
  calendar ticks, HH:mm labels below a day step, M/D above), win time vs
  hour of day (0-24 local), 3BV vs time, clicks vs 3BV (with the y = x
  floor drawn as a dashed line — a game on the line used only the board's
  minimum clicks), no-op clicks vs 3BV/s (only wins carrying the
  wastedClicks measurement; appears once at least 2 do), mouse path vs
  time, mouse speed vs time, mouse speed vs efficiency, path per click vs
  efficiency, path per 3BV vs time. Requires at least 2 wins.
- Every win is a dot colored by its relative-age unit, reusing the age
  palette (seconds = fluorescent green, minutes = green, hours = blue,
  days = red, weeks = navy, months = maroon, years = teal), so time
  trends are scannable at a glance. Within its unit color each dot also
  fades with age — full opacity on entering the unit down to 30% at its
  far edge, so a 6-day-old red dot is visibly paler than a 1-day-old one
  (2026-08-20). A shared legend below the plots spells out the mapping.
- The just-finished game is a larger black-ringed dot (colored like the
  rest, i.e. fluorescent green since it is seconds old) tagged with its
  rank among today's wins ("#N today"); the tag flips to the left when
  the dot is near the right edge.
- No chart titles (2026-08-20): the axis labels name the chart. Labels
  are terse — one or two words, no units or asides ("→ time", "→ 3BV",
  "→ mouse speed"); the tick values carry the scale. The two time charts
  are labeled "date" (calendar spread) and "time of day" (all wins folded
  onto one 24-hour clock).
- The whole section (plots and legend) is the "relationship charts"
  shown-thing. The switch had described these plots all along but never
  actually gated them (it only trimmed a trial summary line); repaired
  2026-08-23.
- Both axes carry real scales: tick labels at nice 1/2/5-step intervals
  with light gridlines. Ticks and axis labels render at heading size
  (12px bold, 2026-08-20), so the x axis caps at 6 ticks (5 on the date
  axis, whose HH:mm labels are widest) while y takes up to 7.
- Trend lines (2026-08-22): the date, 3BV/time, and 3BV/clicks plots
  carry the same Theil–Sen pair as the average-time charts (all data in
  the years teal, today only in the hours blue, both dashed, same
  caption). Fits always use the untrimmed values even where the trimmed
  axis hides outliers — Theil–Sen resists them by construction — and a
  line spans only its own data's x-range, never extrapolated beyond it,
  so today's line on the date plot is a short segment at the right edge
  (today's trajectory; the all-data slope there is seconds per day of
  practice). On 3BV/clicks the trend's gap above the y = x floor is the
  average click overhead per unit of board difficulty. No line on "time
  of day" (a straight line on a circular axis would mislead) or "wasted
  clicks" (tied small-integer x leaves too few effective slopes).
- Minor tickmarks (2026-08-22) sit on the axis edges between the labeled
  divisions so inner positions are readable: each labeled step splits into
  round parts (quarters for a 2- or 4-mantissa step, else fifths), also
  covering the padded range beyond the outermost labels. The date axis
  skips them (calendar steps don't subdivide into round parts).

## Storage (decided 2026-08-20)

- All persistent data lives in one IndexedDB database
  (`minesweeper-friendly`, version 2) with two stores: `userdata` (play
  history, settings, rankaverage sort preferences, player states, trial
  session — one entry per kind) and `traces` (one entry per finished game).
- Userdata is RAM-first: every kind is read into RAM once at startup, all
  reads and mutations work on the RAM copy synchronously, and each
  mutation immediately persists that kind's whole RAM object with an
  async fire-and-forget write. Everything the player sees is rendered
  from RAM; nothing waits on the disk. Keeping all userdata in RAM is
  fine because scalar records are tiny — revisit only if that ever stops
  being true. Traces are far too large for RAM and are written straight
  to their store (see Raw input traces).
- A failure to open the database or to persist anything is announced in
  the backup status line and thrown — never tolerated silently.
- Before 2026-08-20 the userdata lived in localStorage; the version-2
  database upgrade carries those keys over exactly once and then removes
  them, so existing players (including on the public GitHub Pages origin)
  keep their history without doing anything.

## Raw input traces (decided 2026-08-20)

- Every finished game (win and loss) keeps its complete input stream as
  the ground truth behind all motion metrics: cursor samples (relative ms
  timestamp, x, y for every mousemove), button events ('ldown'/'lup'/
  'rdown' with position and the board cell index hit, or null for a press
  released off the cells), and layout events (the board's bounding rect
  and dimensions, re-recorded on scroll, resize, and zoom, so every
  sample maps to a board cell forever).
- The board also moves without any scroll/resize/zoom event when content
  around it changes — found 2026-08-23: the metrics panel's first render
  during init shifts the centered board ~880px after the trace's opening
  layout event, so warmup samples mapped through stale geometry. The
  recorder therefore also compares the live rect to the last recorded
  one and re-records on any difference: before every button event (every
  click maps exactly), after every metrics-panel render (the known
  mover — appearing, hiding, collapsing, drag-resizing), and via the
  once-a-second live tick as the catch-all for anything else. Traces
  saved before the fix retain the defect for the first game of each
  page load: their samples map through the stale opening rect (button
  events are unaffected — they store the hit cell index directly). The
  true geometry was never measured, so those traces cannot be repaired;
  offline sample-to-cell mapping of a session's pre-fix first game is
  suspect.
- A trace runs from board creation to finish: pre-first-click movement is
  warmup and is real data, so capture covers the ready state, not just
  play. Post-game movement belongs to no game and is not captured.
  Abandoned boards (restarted mid-game) produce no record and no trace.
- Sample timestamps are strictly increasing, by construction (decided
  2026-08-20): browsers reduce performance.now() precision (Chromium
  quantizes to ~100µs), so two mousemove events can read the same
  timestamp. Such events are one sample — the latest position at that
  instant — because at the timer's resolution the two positions are not
  ordered in time, and a zero time step would put Infinity into every
  rate computed from the trace. Every consumer (the metrics panel, the
  offline extractors) may rely on this invariant.
- Traces live in their own store (`traces`, keyed by endedAt exactly like
  history records; see Storage) and are never held in RAM — they are far
  too large for that. Nothing is pruned.
- Scalar record fields are summaries; the trace is what lets any future
  metric be computed over past games retroactively. Failure to capture or
  save a trace is announced visibly and thrown, never tolerated.
- An "export traces" button beside the backup controls downloads all
  traces as one JSON file (download only — far too large for the
  clipboard) for the offline analysis pipelines under `analysis/`.
- Recording overhead, measured 2026-08-20: ~100ns per mousemove event and
  <0.5ms of typed-array conversion at save time — imperceptible.

## Path replay views (decided 2026-08-23)

- When a game finishes, a "path: …" button appears beside "see scores"
  below the board and cycles three views of the played-out board:
  off → moves → clicks. It hides whenever no finished board is on screen
  (a new board, the trial lobby/review phases).
- 'moves' draws the game's actual cursor path — the polyline through
  every recorded cursor sample, warmup included — over the finished
  board. 'clicks' draws only the effective click events ('lup'/'rdown')
  connected in click order. Both shade light = earlier, dark = later
  (the overlay-chart convention); click dots draw in both views, blue
  for left clicks, red for right (flag) clicks. Movement that left the
  board clips at the board edge (the path exits and re-enters).
- The drawing is the RAM trace of the game just finished — nothing new
  is stored, and the views exist only until the next board replaces the
  trace. Replaying older games from the traces store is not built.
- Every point maps through the trace's layout events (the board geometry
  in effect at that moment) to a board fraction and then onto the
  board's current size, so the overlay is correct even if the player
  scrolled or zoomed mid-game, and it follows zoom changes made after
  the game.
- The overlay never intercepts input; the chosen view is remembered
  across games within the page session (not persisted), so a view left
  on shows the next finished game's path immediately.

## Trace metrics panel (decided 2026-08-20; vertical with sparklines
## later the same day, replacing the first bottom-strip form; live/final
## split into panel/bottom-charts with settings later still)

- The session-level mouse-dynamics features are computed in-page from the
  trace and shown both live and canonically, in two places:
  - LIVE (the panel): while a trace runs (board shown through game end),
    a vertical panel fixed to the left edge recomputes once a second over
    the samples so far, marked "live" in grey. Live numbers are transient
    readings of an unfinished trace. The live rows go away when the game
    finishes; the panel itself stays, because since 2026-08-22 it also
    hosts the session stats section (see "Session stats"), which spans
    games.
  - FINAL (the after-game charts): the moment a game finishes, the same
    computation runs once over the complete trace, and each metric
    renders as a larger chart inline at the page bottom, after whatever
    other bottom charts the outcome produced (rank lists and scatters for
    a win, nothing else for a loss — motion existed either way). These
    are the canonical values: same code as live, complete data, and the
    same wall-time definition the stored trace carries
    (endedAt - startedAt) — live and final can never disagree in
    definition, only in how much of the game they saw.
- Two settings govern the two stages (see Personal settings; both default
  on): "show motion stats during game" (the live panel) and "show motion
  stats after game ends" (the bottom charts). Toggling either applies
  immediately — the panel updates mid-game, the bottom charts appear or
  vanish on the shown result. Finer stage-by-stage configurability of
  what is shown when is planned, not built.
- The panel also carries its own small × toggler in its top-right:
  clicking it tucks the panel down to a "stats ▸" chip in the same
  corner (renamed from "motion ▸" when the session section moved in,
  2026-08-22), and the chip click brings it back. This is session-only
  display state — the persistent switches are the settings.
- One row per metric: the name, the current value, and a sparkline chart
  of the value's evolution over this game (one point per live recompute
  plus the final one). The sparkline carries labeled axes: y is the
  series min and max (a flat series draws mid-chart but labels its true
  value — the padding is chart geometry, not data), x runs 0 to the
  elapsed seconds. Spans where the value was not yet measurable are gaps
  in the line, never bridged. The after-game charts are the same rows at
  chart size (230x130 vs the panel's 150x46).
- Five measurement systems, each a labeled section of the panel and of
  the after-game charts (decided 2026-08-20, when the three researched
  systems beyond the first were reimplemented in-page; click timing
  added 2026-08-22). Every row
  carries a two-part explanation as its hover tooltip — "HOW", exactly
  how the value is calculated, and "RECORDS", a literal description of
  the observation without assigning a cause; each section header explains
  its system the same way. The sections:
  - DYNAMICS — the behavioral-biometrics session set over movement bouts
    (a pause of 100ms or more separates bouts): strokes, moving, silence
    (share of the game with the cursor still), path, speed (mean of
    per-stroke mean speeds), peak speed, straightness (chord/path),
    jerk (mean |da/dt|, px/ms³), turn rate (rad/ms), left clicks, right
    clicks, hold (mean button-down time), pause-and-click (mean stillness
    before a press). Definitions are exactly those of the offline
    extractor (`analysis/biometrics/extract_features.py`).
  - WASTE — the survey's own whole-game proposals
    (reference/mouse-motion-metrics.md Tier 1/2): wander (total travel
    over the straight lines between consecutive clicks; 1.0 = perfectly
    direct), pauses / paused / longest pause (stops of 250ms or more),
    turnarounds (heading reversals over 90° between movement legs of 8px
    or more), feints (dwelled 300ms or more over a cell, then left it
    without clicking). These are event definitions, not claims about
    intention.
  - CLICK TIMING — press-to-press cadence over all button presses, left
    and right together (added 2026-08-22): click gap (median gap between
    consecutive presses), gap spread (interquartile range over median —
    near 0 = metronomic, systematic clicking; high = rapid-fire runs
    mixed with long stalls), fastest gap, peak rate (most presses in any
    rolling 1-second window), burst share (share of gaps under 250ms),
    on the move (share of presses with a cursor sample in the 100ms
    before the press — clicking without stopping). The press is the
    unit: a wasted click is the same motor act as an effective one, and
    the trace records the hand, not the board effect (the measurement
    principle again).
  - TRAJECTORY GEOMETRY — mousetrap-formula measures (Kieslich et al.)
    per inter-click segment, means over segments: segments, MAD,
    AUC, AD, x-flips, y-flips, initiation, idle, vel max, acc max,
    sample entropy, segment time. An exact port of the R package as
    `analysis/mousetrap/trace_measures.R` applies it, verified
    value-for-value against Rscript (see agents.md).
  - MOVEMENT GEOMETRY — Hevelius-formula movement features (Gajos et al. 2020;
    reference/hevelius/FEATURES.md) per inter-click movement, means over
    movements: execution, exec no pauses, peak speed, peak accel,
    submovements, main sub, sub end dist, axis dev, movement error, axis
    crossings, norm jerk (without pauses), click slip, verification,
    re-entries. More features are computed than displayed (offsets,
    variability, direction changes, normalized jerk with pauses, the
    submovement fractions); per-stage display configurability is
    planned. The block-variability features (CoV across
    equal-difficulty movements) are offline-only: they need difficulty
    residualization first.
- An inter-click segment (the trajectory- and movement-geometry unit) runs from
  the previous click to the next, the click being the segment's response
  — the exact trial construction of the offline R pipeline; segments
  with fewer than 5 trajectory points are unmeasurable and skipped.
  Segment values change only when a click lands, so the live schedule
  recomputes those two systems per click and the whole-trace systems
  every tick.
- A value whose formula needs more data than the trace has yet (no
  strokes, no completed click, no measurable segment, zero wall time)
  shows as an en dash with a "not yet measurable" tooltip — never a
  made-up zero. A formula that computes but degenerates (sample entropy
  with no matching windows yields NaN, as in R) displays the same way:
  not measurable here.
- The panel is display only: nothing new is stored. The trace remains the
  ground truth, per-game scalar records are unchanged, and the panel's
  values are recomputable from the stored trace forever.
- The panel is an in-page left column: it consumes layout width and never
  covers the board or page content. It is sticky within its column and
  scrolls itself when the viewport is shorter than its rows.

## Session stats (decided 2026-08-22)

The recent-observations section: a handful of running-average series
over a selectable window of actual play (15m / 30m / 1h / 3h, default
1h; see "Game-end evaluation" for the 2026-08-23 window selector),
across games, shown live at the top of the flush-left panel. Wall-clock
breaks are compressed out. Each charted point is the average over a
selectable trailing lookback of played time (running averages replaced
disjoint buckets 2026-08-23, chosen over them for readable trends and
rare-event rates). Each series is deliberately both a per-game statistic
(already in the records) and an ongoing session trend. The chart
displays changes but does not label their cause.

- Scope: only time a game was actually in progress (first reveal — or
  first flag once mines exist — to game end). Losses count. Abandoned
  boards count too (the restart threw away the record, not the time the
  player spent); their play interval closes when the restart happens.
  Travel to the restart button and between-game idling are nobody's
  statistic.
- The series, in the panel's recent-observations section (since
  2026-08-23 the six action rates share two unit-grouped charts —
  see "The action-rates charts" below — while mouse speed, fastclick
  gap, and game endings keep their own):
  - **mouse speed** — px of cursor travel while playing over in-progress
    seconds, px/s.
  - **click rate** — board clicks that changed something (reveals,
    flags, chords) per in-progress second; no-op clicks excluded (they
    have their own row). It does not partition decision and movement time.
  - **deaths with mistakes** — fatal actions carrying at least one
    evidence-backed mistake tag per in-progress minute; untagged deaths
    do not count.
  - **misclicks** — the visible-state contradiction definition above per
    in-progress minute, whether or not the action ended the game.
  - **no-op clicks** — clicks that changed no board state per
    in-progress second (stored under the legacy field name
    `wastedClicks`; charted /m until 2026-08-23, see the action-rates
    charts below).
  - **fastclick gap** — median gap between consecutive board-changing presses of
    the same game, counting only presses made on the move (a cursor
    sample within 100ms before, the cadence definition) with gaps under
    1s. It records only that filtered timing distribution.
  - **mine marking** — flags placed per in-progress second (removals
    don't subtract; win auto-flagging never counts).
  - **flag removals** (added 2026-08-22, same evening) — flags taken
    back per in-progress minute. Counts the removal, not the placement;
    flags left standing are invisible here, and the reason for removal
    is not observed.
    Backfills from the stored per-game `flagsRemoved` count, and the
    stats table shows the per-game form as "Flag-removal rate" beside the
    existing "Flags removed" count.
  - **game endings** (added 2026-08-23) — not a rate: one chart of
    cumulative percent lines, one per ending kind (win, the report's
    fatal-action statuses word for word, dashed legacy-verdict lines,
    unjudged loss), each the kind's share of the games finished so far
    in the window, plus the dotted "percent of mines unmarked when
    winning" line (the wins' average share of mines left unflagged at
    the winning instant), with a color legend of current shares. See
    "Game-end evaluation".
  - **report categories** (added 2026-08-23) — one per-minute line for
    each enabled exclusive action-report category: game loss, game risk,
    time loss, life maximization, and measurement notes. `reportScope`
    gates these lines with the same none / fatal / risk / full ladder as
    the report.
  - **excess game risk** — sum of the extra immediate loss probability
    on survived game-risk actions per played minute, in percentage
    points/minute. Active protection rules are applied first; this is a
    probability sum, not a count of observed deaths.
  - **modeled life gap** — sum of one-ply
    best-minus-selected expected-remaining-life gaps per played minute.
    It appears only when the optional life-maximization category is on.
- Running averages (replacing disjoint buckets, 2026-08-23): the
  lookback is selectable on the section itself (30s / 1m / 2m / 5m /
  15m; persisted as the `sessionLookbackSeconds` setting, default 5m),
  and so is the window length (1m / 5m / 10m / 15m / 30m / 1h / 3h;
  `sessionWindowMinutes`, default 1h). Both are **played time**, not
  elapsed real time — "5m average" means five minutes of actual play.
  Game spans are joined onto a cumulative-play timeline, so the end of a
  game and the start after a five-minute break are adjacent. History is
  scanned backward through as many games as necessary to fill the chosen
  play window plus one lookback. One sample per 10s of play, each
  averaging the lookback of played time behind it (internally: rolling
  windows over fine 10s buckets); samples sit at played-time multiples,
  so a finished sample never changes as play continues — only the
  newest, which rides the current play position. A young session
  averages the play that exists so far. A wall-clock break changes
  nothing.
- Honesty rules: a point whose lookback covers under one second of
  in-progress play shows an en dash — one death over a 50ms sliver is
  an absurdity, not a reading. Unmeasurable points are gaps in the
  line, never bridged; a played-but-motionless stretch's speed is a
  real 0.
- The newest measurable sample's value — the running average ending at
  the current play position — is labeled directly beside its plotted
  point, rather than detached from the data in the title row.
- Storage: the live event log is RAM, but the window survives reload
  (decided 2026-08-22, same evening; played-time scan revised
  2026-08-23): at startup the newest records are scanned backward until
  the largest selectable window (3h) plus the largest lookback (15m)
  plus retention slack of actual play
  is rebuilt — play 30 minutes, close the tab,
  reopen, and the running averages are still there. The inclusion rule
  (stated explicitly 2026-08-22, late evening, and verified with a live
  loss + reload): wins and losses backfill alike, each with its full
  played time — a loss's record carries its duration, counts, and death
  exactly as a win's carries its counts. Losing an abandoned board's
  time is acceptable; missing a loss is not. Abandoned boards produce
  no record and so cannot be backfilled: their played time is kept live
  but honestly lost across a reload — the one accepted gap. All modes'
  games backfill — session stats are about the player, not the board.
  Backfill is span-level approximate where live capture is exact: a
  record holds totals, not timestamps, so each game's totals (including
  report-category counts and their risk/life magnitudes) spread
  evenly over its span, its mistake-tagged fatal action lands at the
  played instant it ended, and its stored per-game fastclick median
  stands in for that span's gaps. The traces hold exact timing if a finer
  backfill is ever wanted. Newer per-game persistence includes the
  `fastclickGapMs` (2026-08-22), plus `misclicks` and the canonical
  `actionEvaluations` ledger (2026-08-23, feeding both mistake-tagged
  deaths and derived game-ending lines);
  every series also has a per-game form in the stats table — click,
  no-op, misclick, mark, and flag-removal rates derived from stored counts,
  mouse speed as before, the fastclick gap from its stored field.
- Display: the section renders at the top of the left metrics panel,
  always (not just during games), under its own "session" header with
  HOW/RECORDS hover explanations like every other metric row. The
  `showSessionStats` setting (default on) turns it off; the panel's ×
  chip tucks it away with the rest.
- Charts: real charts, not sparklines (decided 2026-08-22, same
  evening) — the scatter plots' visual grammar at panel width (the
  panel widened to fit): plot frame, light gridlines, 1/2/5-step y
  ticks with minor tickmarks, relative played-time x ticks (`-1h` through
  `now`). The y axis
  always starts at 0 (every series is nonnegative; an auto-zoomed
  floor turned small wiggles into drama). Titles are black, larger,
  close to and left-aligned with the plot area; session-axis text is
  12px bold for legibility. Each newest point carries its formatted
  value directly.
- No axis captions (both dropped 2026-08-23): the "→ accumulated play
  time" x caption went in the morning — the "-15m … now" tick labels
  already say "played time ago" — and the rotated y-axis unit caption
  went that afternoon. The unit moved into the row title, which now
  reads name + unit ("mouse speed px/s", "fastclick gap ms", "game
  endings %") and sits flush on the plot's top edge (the title-to-chart
  gap reduced until nothing separates them); the sideways read and the
  caption's horizontal cost are gone.
- The action-rates charts (combined 2026-08-23 afternoon; split by
  unit that evening): the six per-play-time rates draw as two shared
  charts right after game endings, replacing their six solo charts.
  "action rates/m" holds every per-minute series — flag removals,
  misclicks, deaths with mistakes — and "action rates/s" the per-second
  trio, mine marking, click rate, and no-op clicks, so the lines on a
  chart are directly comparable and neither unit's magnitudes squash
  the other's (the single dual-axis chart tried first put a ~20/m no-op
  line and a ~1/s marking line on one numeric scale, flattening the
  small movers). Each chart's scale is rooted at 0; the ceiling sits
  on the 1-2-5-10 ladder (1, 2, 5, 10, 20, 50…) rather than ceil(max),
  a stability request (2026-08-23: "I hate when we're pushing up into
  new territory and shrinking, or the false appearance nothing is
  changing"). The scale grows the moment a line needs more room —
  data never clips — and then holds through the whole climb inside
  that step; it shrinks only when the tallest shown value fits within
  80% of a lower step, so a peak leaving the window or a value
  hovering at a boundary cannot flap the scale. The ceiling is
  remembered per chart in RAM only; a reload re-derives it from the
  backfilled window. The accepted trade-off: up to ~2.5× headroom
  above the tallest line, and the same data can draw at different
  scales depending on what the chart showed before — the labeled
  ticks always state the scale in force. Integer ticks stepped
  1/2/5/10… stay readable, each labeled with the chart's unit
  ("0/m, 1/m, 2/m…"). Each series keeps
  the unit that gives it a meaty, clearly visible value (the choice
  delegated in the original request): click rate, mine marking, and
  no-op clicks read as /s; misclicks, deaths with mistakes, and flag
  removals as /m. No-op clicks changed unit twice: sketched /s,
  implemented /m because ~3/m beat ~0.05/s pinned to the floor, then
  moved back to /s later on 2026-08-23 (user call, "to improve
  distribution") once real sessions showed its ~19/m line towering
  over the other /m rates and squashing them against the floor, while
  at ~0.3/s it sits comfortably beside click rate on the /s scale.
  Each line has its own color and ends in
  a dot, and labels itself directly (2026-08-23, evening): its name,
  current value, and unit float together to the endpoint's left in the
  line's color, nudged apart when endpoints crowd while preserving the
  lines' top-to-bottom order, so reading never needs legend matching —
  the rates charts have no legend at all. Hovering a line or its label
  gives that metric's HOW/RECORDS. Mid-line name placement was tried
  first and rejected: several near-zero rates share a tight band, so a
  name-sized box rarely had a clear spot and the design would have
  degenerated into a legend fallback most of the time. Mouse speed
  (px/s) and fastclick gap (ms) keep solo charts — their units fit
  neither chart.
- Resizable (added 2026-08-22, live behavior revised 2026-08-23): the
  in-page panel's right edge is a drag grip. Dragging resizes the panel
  and recomputes chart geometry on every animation frame, so the contents
  track the pointer rather than catching up on release.
  The width persists as the `metricsPanelWidth` setting (default 316px,
  clamped 220–640); collapsing to the corner chip ignores it.
- Live redraws preserve `#metrics-panel-content`'s `scrollTop`; replacing chart
  nodes once a second must never push a reader away from lower charts.

## Personal settings (decided 2026-08-20; area redone from scratch 2026-08-23)

- The design doctrine (settled 2026-08-23 after several same-day
  revisions; the general rules it produced live in "UI doctrine" above):
  settings live on their own full page, settings.html, reached from the
  clear "settings" button in the game's upper-right; the way back is
  equally clear — "return to game" buttons at the top and bottom of the
  page body, Esc, or the browser's Back. The page stays focused on the
  settings themselves. A change shows its meaning where the thing itself
  lives: the game page reads settings fresh on every load.
  Everything else (row shape, hint placement) is implementation and
  freely revisable; earlier revisions of this section had mistaken
  implementation defaults for decisions.
- A schema-driven settings system for player-facing behavior switches:
  `SETTINGS_SCHEMA` is the single definition (field, default, validity,
  group, label, hint, description); the loader, the import validator, the
  settings page UI, and the data-format card all derive from it. It lives
  in settings-core.js, loaded by both pages, so the game and the settings
  page cannot drift. Named "settings", never "config" — that word is the
  board parameters.
- Stored beside the history (userdata `settings`; see Storage). Absent
  entry or absent field = the default (the player never changed it);
  nothing is persisted until they do.
- Exports carry the block under the reserved top-level `"settings"` key
  (it can never collide with a mode key, which is always WxH/M@playMode);
  importing
  a blob applies its settings after validation. Exports from before
  2026-08-20 simply lack the key.
- A "settings" button in the game's upper-right corner (the fixed
  cluster it shares with the states tags, 2026-08-20; a real bordered
  button since 2026-08-23) is a plain link to settings.html (2026-08-23;
  before that it opened an in-page surface — first a small corner
  dropdown, then briefly a full-height right-edge drawer that same day).
  The settings page wears the game's identity: a slim titlebar with the
  site name, then a centered body headed "Settings" with its save
  behavior stated beside the title. The two "return to game" buttons
  (dressed like the game's own top-right buttons) sit above and below the
  settings panels in the body; Esc also returns. They are not tucked at
  a screen edge.
- The demo world (2026-08-23, created with the page and removed later
  the same day): a miniature pretend mid-game beside the controls —
  partially played board, mini left-panel cards, stand-in result
  cards — that reacted live to every switch. Removed to keep the page
  super simple; the record stays because the idea may return.
- Switches render under group headings naming where they act — gameplay /
  left panel / after a game — driven by the schema's `group` field
  (`SETTINGS_GROUPS` orders the sections), so the page and the schema
  cannot drift. Each group is a separate panel with its heading in a
  stable left column and its settings on the right. A switch row puts its
  name on the left, its checkbox at the far right, and any earned hint in
  the column between them — never below the name where it could look like
  another list item. The schema's full description remains a plain
  tooltip. A multi-option setting such as `reportScope` puts one radio
  group to the right of its name. The numerous shown-things switches form
  a compact two-column option grid under their own subheading rather than
  extending the primary list. The layout collapses to one section column
  on narrow screens while retaining the name/control relationship. A
  change saves immediately; the game page reads settings fresh on every
  load, so returning applies them. "Changes save automatically" beside
  the page title states why there is no save button.
- Hover must never inject or swap text (decided 2026-08-23 after two
  rounds of hover-note mechanisms did exactly that). The row–demo glow
  link retired with the demo world the same day. The game page has no
  hover-only controls: the floating "hide ×" chip that appeared over a
  hovered result section (added earlier on 2026-08-23) was removed the
  same day — hiding things is the settings page's job, not something the
  pointer stumbles into. The remaining one-click precedents stand: the
  session lookback and window selectors living on the session section
  itself, and the stats panel width set by dragging the panel's own edge.
- Settings so far: `justUniverse` (default on) — sealed-pocket mercy (see
  "A just universe";
  a game freezes the value at its first reveal, so a change made mid-game
  applies from the next game — the old drawer's mid-game lock UI retired
  with the drawer, 2026-08-23);
  `collapseDuplicateCharts` (default on) — the rank
  lists' progressive disclosure switch (see Rank lists);
  `showMotionStatsDuringGame` and `showMotionStatsAfterGame` (both
  default on) — the two stages of the trace metrics display (see Trace
  metrics panel); `reportScope` (`fatal` by default; choices `none`,
  `fatal`, `risk`, `full`) — the simple after-game analysis ladder,
  editable on both the report and settings page, which also gates category
  session diagnostics;
  `showSessionStats` (default on),
  `sessionLookbackSeconds` (default 300), and `sessionWindowMinutes`
  (default 60) — the session stats section, its running-average
  length, and its window length (the latter two set by the selectors on
  the session section itself, not panel checkboxes; see
  Session stats); `metricsPanelWidth` (default 316, clamped 220–640; set
  by dragging the stats panel's right edge, not a panel checkbox) — the
  left panel's width, which the session charts fill;
  `numberDisplay` (default numbers; the first choice-row setting) —
  digits / letters / dots for revealed counts (see Board and chrome).
- The schema's `helpFile` "?" popover was removed with the caption purge
  (2026-08-23): the just-universe explanation already lives in the hint
  and tooltip. just-universe-help.html remains in the repo as a
  standalone document.

## Play history and backup

- Every finished game (win and loss) is kept forever (userdata `history`;
  see Storage), grouped by mode; nothing is pruned. A mode is identified
  by board parameters plus play mode (e.g. `9x9/10@standard`). Keys
  written before 2026-08-21 as `9x9/10` mean Standard.
- Export/import as a JSON map of mode to game records, plus the reserved
  `"settings"` key (see Personal settings): copy to clipboard, save to
  file, paste in, or open from file — subtle controls out of the way of
  play. The blob is validated in full — settings included — before
  anything is written; a malformed blob imports nothing and says why.
  Records dedupe by end timestamp, so repeated imports are no-ops.
- A "data format" button beside the backup controls raises a reference
  card: the export's overall shape (the settings block plus one mode-keyed
  list per board) and a field-by-field table of the per-game record fields
  with example values and units, plus the note that every other displayed
  stat is derived from them at display time. The card is generated from
  the same field definitions the importer validates against, so it cannot
  lie about the real format.

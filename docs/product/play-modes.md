# Play modes (decided 2026-08-21)

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/play-modes.md](../implementation/play-modes.md).

A second uniqueifier next to board size. The upper-right cluster has a
Mode menu. Rankings and history are stored per (board, play mode); a
Beginner Standard win never appears on Beginner Uniform NG lists.

- **Standard.** Today's first-click-safe random boards. "A just universe"
  applies here and in the Trial modes (frozen from the setting on the
  first click, or when a given opening is used). It does not apply in
  the NG modes or Angelic.
- **pregen 10 boards and order by 3BV descending, assuming auto-click in
  upper right (decided 2026-08-26).** Generate ten first-click-safe
  candidates through the selected board generator, using the upper-right
  cell as every candidate's opening. Compute each full board's 3BV, order
  the candidates from highest to lowest (generation order breaks ties), and
  deal all ten in that order; exhausting the batch creates a fresh ten.
  Every candidate has its own replayable seed. The upper-right cell opens
  automatically and the timer starts after generation; that supplied opening
  is not counted as a player click. The current batch position and 3BV appear
  below the Mode menu. Gameplay otherwise follows Standard, including A just
  universe and guess measurement, while history and rankings remain separate
  under this mode's key.
  A persistent "challenge progress" table precedes the charts with columns
  `run`, `3BV`, and `time`. Each finished board adds one row in ranked deal
  order; a loss is named in its time cell. Only completed facts appear here:
  there is no second live timer or transient current-board row. The latest
  completed run keeps the standard light-blue "me" background, including
  while the next board is underway.
  Two persistent 3BV → solve-time scatters sit below the board throughout
  play and after each result: "this challenge" contains wins completed since
  the current ten-board batch was created, while "whole day" contains this
  top-score key's wins since local midnight, including earlier batches.
  They use the normal relationship-chart grammar (wins only, age-colored
  dots, nice axes and minor ticks, Tukey y-outlier trimming, a blue
  Theil–Sen fit, and the latest win ringed with its within-scope time rank).
  Each chart keeps a fixed-size waiting frame until the normal two-win
  minimum is reached.
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
- **Endgame drill (2026-08-30).** Repeated quick training on realistic
  endgame positions. Each deal generates a full board with the selected
  generator, then presents it late-game: every safe cell is revealed
  except a remnant pocket flush with a board side (real endgames finish
  against borders and corners), with opening closure enforced (a
  revealed zero never keeps a covered neighbor). A deal is accepted only
  when the pocket keeps 4–45 covered safe cells, contains at least one
  mine and one covered numbered safe cell (an all-zero remnant trains
  nothing), and is finishable by pure deduction from the visible numbers
  and mine counter — verified with the exact solver, so a drill death is
  always a reading error, never a forced guess. Rejection budget
  exhausted → fail loudly. The timer starts on the player's first input
  (reveal or flag; an accepted chord always follows a flag). The
  record's 3BV is the presented remnant's remaining 3BV — the minimum
  clicks to finish what was actually left — so 3BV/s, efficiency, and
  the same-3BV tables stay honest within the mode; ZiNi/HZiNi and STNB
  are omitted (full-board measures misdescribe a partial solve). The
  guess ledger stays on: every measured guess in a deducible position is
  unforced, which is the mode's training signal. Records rank under
  their own `@endgame-drill` history key. A drill's seed replays the
  entire deal (board and window search), and dealing is ~2 ms on expert,
  so face-button restarts stay instant. The upper-right chrome shows
  "N safe cells left · remaining 3BV M". Dealing lives in `endgame.js`
  (pure, dependency-injected, node-tested).

## Visible-information solver

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
  streaks, relationship charts, or average-time charts.
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

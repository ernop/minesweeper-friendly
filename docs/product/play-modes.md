# Play modes (decided 2026-08-21)

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/play-modes.md](../implementation/play-modes.md).

A second uniqueifier next to board size. Rankings and history are stored
per (board, play mode); a 9 x 9 Standard win never appears on 9 x 9
Angelic lists.

Choosing a mode (creator request 2026-10-20: "beg, int, exp are "all-in-one
settings choosers". when a user choose a mode besides those from the
dropdown they shoudl only then be presetned with the variant and other
options", "for inner modes like for example NG ... they'd be in a custom
mode overall, then pick the board size and minecount and logic etc
subsequently"; "simlify the mode pickers. i don't like the current layers
wqhich are duplicative and needlessly complex"):

- Beginner, Intermediate, and Expert are whole choices: the preset board,
  Standard, and the default generator. They are the only way to play a
  preset board, so every other mode's games are custom-board games.
- Every other mode, and Custom (Standard on a board the player sizes), is
  one entry of the **other modes** menu beside the preset links, one level
  deep: every mode is an entry of its own, never a variant choice under
  another mode. Choosing an entry opens the mode options row with the board
  size, the generator where the mode uses one, and the mode's progress
  ([Game setup](board-and-layout.md#game-setup-top-bar-settings-row-and-footer)).
- Until 2026-10-20 the mode was a separate menu in the details column, so a
  preset board could be played in any mode. Saved settings holding a preset
  with another mode continue as that mode on a custom board of the preset's
  size, so the rankings they play into are unchanged.

- **Standard.** Today's first-click-safe random boards. "A just universe"
  applies here and in the Trial modes (frozen from the setting on the
  first click, or when a given opening is used). It does not apply in
  Angelic.
- **3BV countdown (decided 2026-08-26 as "pregen 10 boards and order by 3BV
  descending, assuming auto-click in upper right"; renamed 2026-10-20).**
  The creator asked for a better name ("figure outa better pregen10-name")
  when the long one was found cut off in the closed other modes menu. The
  new name says what the player meets: the boards count down from the
  highest 3BV. The menu entry's tooltip, and the closed menu's while the
  mode is chosen, gives the rest: "Ten boards a batch, played from the
  highest 3BV down; the upper-right square opens on its own." Its id
  (`pregen-10-3bv-desc`) and history keys are unchanged, so saved games and
  rankings carry over. Generate ten first-click-safe
  candidates through the selected board generator, using the upper-right
  cell as every candidate's opening. Compute each full board's 3BV, order
  the candidates from highest to lowest (generation order breaks ties), and
  deal all ten in that order; exhausting the batch creates a fresh ten.
  Every candidate has its own replayable seed. The upper-right cell opens
  automatically and the timer starts after generation; that supplied opening
  is not counted as a player click. The current batch position and 3BV appear
  in the mode options row. Gameplay otherwise follows Standard, including A just
  universe and guess measurement, while history and rankings remain separate
  under this mode's key.
  A persistent "challenge progress" table precedes the charts with columns
  `run`, `3BV`, and `time`. Each finished board adds one row in ranked deal
  order; a loss is named in its time cell. Only completed facts appear here:
  there is no second live timer or transient current-board row. The latest
  completed run keeps the page-wide this-game light blue "me" background, including
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
- **No-guess modes (built 2026-08-21, removed 2026-10-21).** Uniform NG,
  Single-path NG, and Proof-or-die are gone, with the method that made their
  boards. Creator decision 2026-10-21: "let's eliminate that bad method. it
  sounds like it'll take a long time, and taht just sucks. just remove NG
  overall please." The method drew random boards and threw each away until
  one passed the mode's test. At Expert it almost never found a Uniform NG
  or Single-path NG board within its attempt budget, so the first click
  failed. The Single-path boards it did find were nearly all opened by the
  first click: all 8 saved Single-path games had 3BV 1 to 3. A replacement
  that builds each board directly, swapping mines wherever the solver gets
  stuck, was prototyped the same day and not built. It made every board
  tested at every standard size, in a median 4 to 6 ms at Expert.
  - What the modes were, for reading their saved games. Each board was fully
    solvable from the opening without guessing. Uniform NG also required
    every deduction step to sit at one grade: all direct counting, all
    overlap deduction, or all exhaustive layouts. Single-path NG also
    required one click's opening to cover each step's newly proven safe
    squares. Proof-or-die used a solvable board and killed any opening of a
    square not proven safe, even an empty one.
  - Saved games stay. Their mode, names, history lists, and Proof-or-die's
    verdicts are kept: a rule death for opening an unproven square, and
    every win counted as won without a guess. They export and import as
    before. No new game can be started in these modes. A stored setting
    naming one loads as Standard, as any invalid stored setting loads as
    its default; a preferences file naming one is refused on import, as
    any invalid preference is.
  - The rule that prompted the removal holds for any later no-guess mode:
    one method that works well at every board size the mode offers, never a
    first method with a second behind it for when the first fails ("we
    should use ONE technology which works well. not use something, and if it
    fails, use another thing. that's a very bad pattern.").
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

`Justice.proveFacts` is the canonical proof engine used by Angelic, the
Endgame drill, misclick classification, guess scoring, and action reports. It receives only revealed numbers, covered-cell locations, board
dimensions, and the total mine count. Player flags are annotations and the
hidden layout is never evidence.

The solver first closes direct-count and arbitrary overlap-difference
constraints. It then partitions the unresolved frontier into connected
constraint components, exhaustively searches each component, and joins
their possible mine totals through the board-wide mine count and
unconstrained sea. A cell is proven safe or mined only when it has that
value in every globally consistent layout. This is general constraint
solving rather than a catalog of named patterns. Its stages are the
deduction levels ([design axis](design-axis.md), "Deduction levels"):
counting, overlap, the search without the mine total, then the search
joined through it. `Justice.proveLevels` runs them in one pass, recording
the first level proving each fact, for the live perf charts' moves
available.

The browser search has a deterministic two-million-node work limit.
Results carry `complete`, `visits`, and `method`. A completed search has
considered every consistent layout; an over-limit search returns only facts
already soundly established and marks itself incomplete. Reports must not
call an unresolved action “unproven” merely because the engine exhausted its
work budget. Identical visible positions
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
  fully known: safe cells open with their numbers, every mine flagged,
  mine LCD 0, timer 0. (Since 2026-10-10 a won game no longer flags the
  remaining mines; the lab still flags every mine, because nobody plays
  its boards and its flags only show where the mines are.)
  No input reaches the cells, no timer runs, and nothing is ever
  recorded — the mode exists to look at generated boards, not to play
  them. The board size is the mode options row's size form, as in every
  custom mode (until 2026-10-20 the lab had its own width, height, and
  mines sliders in place of that form). A panel under the row holds the
  lab's note, one slider per parameter of the chosen generator, and a
  "make new board" button; the titlebar, dove, and space bar deal a new
  board as everywhere else. Any slider movement regenerates instantly. The
  generator itself is chosen with the same Generator menu in the mode
  options row as in play; parameter changes made in the lab persist and
  are the values the play modes use. The see-scores control hides here
  (there is nothing to rank).

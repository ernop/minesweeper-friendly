# Unbuilt work

Single list of what exists as an idea and is not in the product yet.
Implemented behavior stays in the product spec (`PRODUCT.md` indexes its
section files). This file is the place to add the next request; do not
leave new ideas only in chat.

Status labels: **creator** = the creator asked for it; **mapped** = named
on the design axis or in a research note, not requested as a build.

## Live perf charts follow-ons (creator request 2026-10-15; base built the same day)

The block itself is built ([During the game](docs/product/during-game.md));
it was titled "during this game, second by second" until 2026-10-20.
Not built yet:

- **creator** — Forks inside one work area. The request's "two choices for
  which way to go" also covers one frontier with work in two directions (an
  opening with proven-safe squares on its left and right edges). Built forks
  count only separate areas (squares more than 2 apart); splitting one
  area by direction along its frontier would catch the rest.
- **creator** — Move habits of games saved before 2026-10-20. Learning from
  move habits across games ("individuals would vary a lot in this way too!
  which could be useful to learn from") was built on 2026-10-20 with the
  move characterization ([Per-game stats](docs/product/per-game-stats.md),
  "Move habits"): each game stores them as it ends, and an earlier game
  only when its result is next restored, so lifetime comparisons start from
  that day. The backfill is "Measure every saved game again" (Measurement
  catalog follow-ons, below). The live perf charts' "came back" events are
  not counted in the record.
- Calibrate the first-choice thresholds against the creator's saved games:
  2 squares near, 3 squares a jump, 1 second a long gap, 1 second a quick
  undo, 2 squares linking a work area. Check the event counts against what
  the replays show.
- Rows plotted against progress (3BV solved share) instead of seconds, so
  games of different length line up.
- The same rows live during play.
- Set the hovered events' squares apart on the board. The board beside the
  block (2026-10-15 to 2026-10-21) ringed only the squares the hovered
  events concern: the proven-safe squares a move left behind, or every
  proven-safe square during a pause. Hover now shows the board's own replay
  frame, whose "available moves" overlay (on by default) rings every
  proven-safe square of that moment, so the left-behind squares are among
  them but not marked as the event's. A distinct mark on them while an event is hovered would
  restore what the event is about.

## Fastclick gap: planned pairs (creator request 2026-10-26; built the same day, follow-ons open)

The redefinition is built: the fastclick gap is the median press-to-press
time of a game's planned pairs, two clicks in a row on touching squares
that the board had proven before the first, in one motion, no flag
removals ([Per-game stats](docs/product/per-game-stats.md), "Fastclick
gap", which also holds the creator's request verbatim). The creator asked
for it ("make the cahgne to fastclick gap") before the offline comparison
the plan proposed, so the plan's open choices took its proposal. Records
carry `fastclickGapVersion: "planned-pairs-v1"`; a value without it follows
the earlier definition, is read nowhere, and since 2026-10-26 is deleted on
load and import (step 1 of 2, below). Open:

- **creator** — Settle the open choices on the creator's own games. Compare
  offline on saved traces: per game, the earlier definition's gaps, the
  planned pairs under each choice below, and the excluded pairs by reason
  (not proven before, too far, a rest, a removal, another press between).
  The traces live only in the browser on the PC (no archive folder was
  found on disk), so this needs "export traces" from the backup row under
  the board. The choices:
  - Touching squares only (built), or within 2: "nearby" may include a
    square two over when the hand runs along a line of safe squares;
    within 2 gets more pairs but mixes in travel.
  - Every kind of pair pooled (built: reveal then reveal, flag then chord,
    chord then flag, flag then flag, reveal then flag), or same-button
    pairs only. A button switch uses another finger and can be faster or
    slower than one finger clicking twice, so a pooled value moves with a
    game's mix of flags and reveals.
  - How many planned pairs an Expert game has. With few, a game's median
    is noisy, and the record may need the pair count beside it. (A
    simulated Expert win that always took the proven-safe square nearest
    the last click had 29 in 201 clicks; the creator's play is not known.)
  - Whether the rest rule splits the pairs cleanly: the rest after the
    first click should sit near 0 ms in planned pairs and clearly above
    100 ms in the others.
- **found** — Measure every saved game again. Only a game whose result is
  opened is measured again from its trace now, so most older games have no
  fastclick gap of the current definition, and game data and the your-perf
  charts compare the new values with fewer games. The proposed pass is
  "Measure every saved game again" (Measurement catalog follow-ons, below).
- **creator** — Step 2 of deleting the earlier definition's values. The
  creator approved deleting them on 2026-10-26, in two steps ("we can do
  the cleanup in two steps; there aren't many active users (basically only
  me another guy)"). Of the 8,203 games in the 2026-10-11 history export,
  5,945 held such a value. Step 1 was built the same day: `normalizeGameRecord`
  deletes a `fastclickGapMs` without `fastclickGapVersion` on load and
  import, for every game whether or not it has a trace (a game with a trace
  is measured again when its result is opened). Step 2 deletes that block,
  its test in `tests/action-evaluation-migration-test.js`, and the schema
  sentence saying such values are deleted. It waits for the creator to
  confirm that every browser both active players use has loaded a release
  with step 1. A backup saved before step 1 still holds old values. If one
  is imported after step 2, they are unread again, so the schema sentence
  then returns to describing them.

## Measurement catalog follow-ons (found 2026-10-26 while unifying the measurements)

The catalog and the hover link are built
([Measurement catalog](docs/product/measurement-catalog.md)), and the four
divergences left on 2026-10-26 were resolved on 2026-10-27 with the
creator's approval ("continue"; same file, "Divergences resolved
2026-10-27"). Open:

- **creator** — Record field names: step 2. Step 1 (2026-10-27) renamed
  `clicks`, `wastedClicks`, and `movesRanOut` to `boardChangingClicks`,
  `noOpClicks`, and `movesMovedOn`: the database's version-7 upgrade step
  renames them in saved records and the trial session's attempts, and
  `cleanTransferredGameRecord` renames them in an imported backup, both
  through `RENAMED_RECORD_FIELDS` and `renameRecordFields` in `storage.js`
  (the version-5 step calls it too). Step 2 deletes the version-7 step's
  body, the rename map and function, the two calls, the "named ... before
  2026-10-27" schema sentences, and the upgrade and import tests' old-name
  cases. The creator set the date on 2026-10-29: do the deletion on
  2026-11-05 or any later day, in place of waiting for a separate
  confirmation that both players' browsers have loaded step 1. A backup exported before step 1
  holds the old names, and `boardChangingClicks` is required, so after step
  2 importing one would reject every record. Before step 2, export a fresh
  backup, or decide to keep the import's renaming for such files (the
  creator's 2026-10-11 export is one). The agent recommends exporting fresh
  backups and deleting all of it, since a new player never has an old file.
- **found** — Measure every saved game again. A saved game is measured
  again from its trace only when its result is restored on the game page:
  cadence spread every time, the fastclick gap of the earlier definition,
  and move habits and a given opening's 3BV when missing. Most saved games
  are never restored, so lifetime comparisons of move habits cover games
  since 2026-10-20 and of the fastclick gap since 2026-10-26, cadence spread
  keeps older records' 3-decimal rounding, and the 103 trial games of
  2026-08-21 given an opening show no 3BV/s, efficiency, or IOE until
  restored. Proposed: one worker pass over the saved traces running the
  restore path's measurement plan on each game, saving each record as it
  finishes, with progress and failures shown as the board-measurement
  backfill shows them. Design notes: the worker reads the traces itself,
  as `switch-cost-worker.js` does, so the page never holds them; a game
  its trace cannot measure (no trace, or the prover stopped at its work
  limit at a move) needs a stamp so the pass does not offer it again; the
  pass waits while a board is in play; the model takes 46–120 ms per Expert
  game, so the 8,203 games of the 2026-10-11 export take minutes. Open for
  the creator: whether it starts by itself or from a button (the
  board-measurement backfill starts from a button). The mouse path is not
  in it: traces before capture version 3 lack the observations received at
  one instant, so their travel would be shorter than the stored path.

## One look per kind of thing: the rest of the page (follows the creator's 2026-10-14 direction)

The details column follows
[One look per kind of thing](docs/product/ui-doctrine.md) since 2026-10-14,
and the backup row under the board since 2026-10-20 (creator: "yes
standardize"). One control keeps its own look:

- Game data's pool switch (`.game-data-pool-switch`, joined buttons with a
  pressed one) is a choice between pools, so under the rule it would take
  the select's look or the shared button look with its pressed state.
  Not yet changed.

## Board position editor and a full board column (creator report 2026-10-26, awaiting the creator's choice)

Creator: "on size 36, 100% zoom, I'd like to move the board a bit to the
right (expert) but using "position" won't let me". At Zoom 36 an Expert
board's frame is 1114px wide. The details column takes its saved share of
the window and gives way only until the board column is the board plus the
8px edge clearance on each side ([Layout](docs/product/board-and-layout.md)),
so on a 2560px window a share above about 0.527 leaves the board column at
exactly 1130px and the applied left/right offset at 0 (at the default 0.46
the board has 86px each side). The editor still shows the saved preference
on its -2000 to 2000 slider and number, so it states an offset the board is
not at and gives no reason. Options:

- Truthful editor (recommended): the left/right row shows the board's
  applied offset and the range that fits at the current width, and says on
  the same line when the saved preference is held back. Layout priorities
  stay as decided on 2026-10-17; the player makes room by dragging the
  details column's edge.
- The board's position takes room from the details column: an offset past
  the room narrows the details column, down to its 320px minimum, so the
  editor always moves the board. The column's width then depends on two
  settings, and game data and live perf charts narrow as the board moves.

## Settings changes undone after Back from the settings page (found 2026-11-04, awaiting the creator's choice)

Firefox keeps the game page in its back-forward cache while settings.html is
open, and the hosted site's `Cache-Control: no-cache` does not prevent that.
Back, one of the documented ways back from settings
([Personal settings](docs/product/settings.md)), restores that page as it
was. Its RAM settings predate the change, so the board keeps the old look,
and its next preference write (a scroll, a focus change, a panel toggle, or
leaving the page) stores the whole older settings object over the change.
Reproduced 2026-11-04 in Playwright's Firefox with bfcache on as in a normal
Firefox (`fission.bfcacheInParent`, which Playwright's build turns off): after
importing `{"cellSize": 40, "flagSize": 60}` on settings.html and going Back,
`pageshow` reported `persisted`, the board drew 28 px squares, and focusing
another control stored cellSize 28 and flagSize 45 again. "return to game" and
Esc load index.html fresh and are not affected. Two open tabs share the cause:
each writes its whole RAM settings object, so a game tab left open overwrites
a change made in another tab at its next preference write (game records had
this failure until 2026-09-26; [Storage](docs/product/storage-and-history.md)).
Options:

- Checked writes (recommended): each settings write reads the stored record
  in the same IndexedDB transaction and writes only when it is the record
  this page last read or wrote; otherwise the page reloads and shows the
  stored settings. Covers Back, two tabs, and the settings page restored the
  same way, and an unfinished board survives Back when nothing changed. It
  changes storage.js (every page's cache tag) and needs a rule for the stale
  page's own last change: dropped by the reload, or written field by field
  onto the stored record first.
- Reload on restore: the game page reloads on a `pageshow` with `persisted`
  before anything can write, so Back works like "return to game". A few
  lines, but Back from any page abandons an unfinished board, and two open
  tabs still overwrite each other.

## Game results as one tree per board type (creator request 2026-10-14; scope and abandoned built 2026-10-20, the rest proposed, awaiting review)

The creator asked to rethink the session's results table. In Beginner, show
only Beginner, starting from all games started, then break them into finer
and finer kinds: won or lost; within losses, an opening loss where the first
few moves had to guess, a "dumb" early death such as clicking beside a corner
3 while rushing, then the known loss types and possibly more; and types of
wins, since some wins follow no bad moves while others survive needless bad
guesses. The request: "think very carefully and present me an ontology of
wins / complete categorization system". Built today
([Session summary](docs/product/rankings.md), "Session results"): one tree
per session, then on 2026-10-15 only the shown game's board size, with one
share column per level, every share of all that size's games (creator:
"ONLY be about the currrne mode (only e.g. expert,not all 3 ypese)"; "each
level of subsection shalal alsohave itsown percent too"; "10% (of
absolute)"). Level 1 is won or
lost; level 2 the game's worst offense against perfect play (no avoidable
risk, a riskier guess than necessary, a guess past a safe move, a wrong
flag, a proven mine, then the measurement gaps); level 3 its type
([Game-end evaluation](docs/product/game-end-evaluation.md), "Session result
kinds"). That tree already splits opening guess deaths by risk and files a
loss under an earlier survived guess when that guess was worse than the
fatal click (creator request the same evening: "1st split: wins/losses.
then within each cat, break them down by the variety and type of worst
offenses against perfect play"). The report still files every opening
forced-guess death as one "early-game guess".

Proposed, not decided:

- **Scope.** The board type being played (size, play mode, and generator;
  Standard Beginner is simply Beginner) in the page-wide session. Other types
  do not appear. Modes stay apart because their rules change what a guess
  can do (in Angelic a guess cannot kill). Built 2026-10-15 by size, then on
  2026-10-20 by board type (creator: "yes, spli treethat way"), so an
  Angelic Expert game and a Standard Expert game no longer share one tree.
- **Level 1, how the board ended:** won, lost, or abandoned (restarted, or
  the page closed before the end). A board counts once it ends. Shares are of
  games started, so every level sums to its parent; every game is in exactly
  one leaf. Built 2026-10-20, abandoned also counting a board cut off by its
  trial's end, with no deeper rows: boards record how they left play from
  then ([Session summary](docs/product/rankings.md)).
- **Won, named by the worst risk survived:**
  - *clean*, no risk the board did not force: no guess after the first
    click; or forced guesses only, each at the lowest risk available;
  - *won despite avoidable risk*: a guess while a square was proven safe, by
    the easiest proof of a safe square (counting single numbers, comparing
    overlapping numbers, whole-board reasoning, or only A Just Universe's
    guarantee); otherwise a riskier guess than necessary, after the opening
    or in the opening only;
  - guesses not measured (records from before the guess ledger).
- **Lost, level 2, when** the fatal click came, by the board's progress
  before it: the opening (under a tenth of the safe squares open, today's
  early-game line; Beginner: 7 or fewer), mid-game, or the endgame (at least
  nine tenths open; Beginner: 7 or fewer safe squares left).
- **Lost, level 3, what** the fatal click was, the first that applies: wrong
  flag; opened a proven mine (by proof level); guessed while a square was
  proven safe (by proof level, or A Just Universe); a riskier guess than
  necessary (after the opening, near or far as today); a forced guess at the
  lowest risk available. Proof-or-die rule deaths (saved games of that mode,
  removed 2026-10-21) and unmeasured risk keep their own rows; losses
  without evidence are "not judged".
- **Overlays**, counted within the losses, never adding to them: the two
  likely-misclick reasons, and a new *rushed* row: the fatal click came under
  half a second after the click before it.
- **Replaces the 2026-08-24 rule** that files every forced-guess death in the
  opening as one "early-game guess" whatever its risk. The opening becomes a
  level, and its guesses split by risk like any other. Any lower-risk square
  makes a guess "riskier than necessary", with no tolerance: in the history,
  guesses under 1.05 times the lowest risk number 0 on Beginner, 1 on
  Intermediate, and 9 on Expert, deaths and survivals together.

Checked against the creator's 2026-10-11 export, games with full evidence.
Beginner Standard (1,093 wins, 490 losses):

- Wins: no guess 726, forced lowest-risk guesses only 154, a riskier guess
  140 (113 in the opening only), a guess past a proven-safe square 73.
- Losses: opening 266, mid-game 122, endgame 102. In the opening, 222 of the
  233 forced-guess deaths chose a square riskier than the safest one; 216 of
  them were beside a revealed number, typically the 1 or 2 shown by a corner
  first click, at 33-67% where 11.7% was available; 148 of the 222 came under
  half a second after the first click. A proven mine opened in the opening happened
  10 times, never by counting single numbers. 80 of the 145 proven-mine deaths
  came in the endgame.
- Intermediate and Expert have the same shape: the opening holds 56% and 61%
  of losses, and the riskier opening guess death is mostly a square beside a
  revealed number (558 of 589 on Intermediate, 789 of 896 on Expert).

Needs, beyond what is measured:

- Proof levels for survived guesses past a safe square (the item under
  "Loss-type follow-ons" below), computed once from saved positions.
- How far an abandoned board got (an abandoned level 2: in the opening or
  after it): the play span would also record the safe squares open at each
  save. Built 2026-10-20 without it: spans record how the board left play,
  and a window reaching back before then says so on the abandoned row.
- The rushed row: the time since the previous click on the fatal evaluation.
  A game's second click already has it as `atMs`; older games get it from
  their traces.

Open decisions, each recommended: split opening guess deaths by risk in the
report too (the session tree does since 2026-10-14); the half-second rushed
line. Decided 2026-10-20 and built: scope by board type, and count
abandoned boards.

**Direction, the same day: judge from the decision tree.** The creator: every
click is a move from one position to its possible next positions (death, or
each number the square could show, and on from there); at a win or a death,
look back at the choices made and the other options the player had, and
whether better ones were turned down; categorize the actual outcomes by that,
judged against what the player could know at the time, not usually against
where the mines turned out to be. Proposed questions for every death, in
order (Beginner Standard counts from the 2026-10-11 export, 490 deaths):

1. Could the player have known the click would kill? *Known* (179): the
   numbers proved it, a proven mine or a chord through a flag the numbers
   contradicted. *A gamble* (311): the numbers left a chance it was safe.
2. For a known death, why it was clicked, inferred from timing and context
   and never certain: rushed (the proving number had just appeared), slipped
   (aiming at a neighboring safe square), wrong button (meant to flag),
   misled by the player's own flag that the numbers contradicted (34), or
   overlooked (the proof had been on screen a while), graded by proof level.
3. For a gamble, whether it was needed: *unnecessary* (51, a certainly-safe
   move existed); *a worse gamble than available* (241: a safer square, or
   looking ahead, a square whose number would have told more); *the best
   gamble available* (14: the board's doing, at a blind start, mid-game, or a
   final coin flip); *a gamble on the player's own guessed flag* (5: a chord
   or click trusting a flag that was itself a guess).
4. How the game got there: whether the forced position was in the board from
   the start or made by an earlier choice (a riskier or less informative
   guess, a wrong flag), and how much avoidable risk was survived before.
5. When, and how much was lost: opening, mid-game, or endgame, and how close
   the game was to won.

Consequences:

- The built "wrong flag" loss type is decided by the death itself, which is
  hindsight. Judged by the screen, 34 of the 39 Beginner wrong-flag deaths
  were known (the numbers contradicted the flag) and 5 were gambles on a
  guessed flag; Intermediate 217 and 15, Expert 242 and 20.
- Each death can carry its *choice share*: the share of its risk that the
  best available move would have avoided, (risk taken - lowest risk) / risk
  taken. Known deaths and unnecessary gambles are all choice, the best gamble
  all luck, a 33% guess where 12% existed about two thirds choice. Summed over
  a set of deaths it estimates how many came from choices rather than forced
  risk: Beginner 403 of 486 measurable, Intermediate 998 of 1,276, Expert
  1,369 of 1,922. A chord on guessed flags has no stored joint risk yet.
- Lookahead: a move's value is its win chance over all its branches. The game
  measures the immediate risk of every click and, for guesses, one step
  further (the guess ledger's modeled life); an exact win chance over every
  future position is feasible only for small unknown regions such as most
  endgames.
- Wins ask the same questions of every survived choice and are named by the
  worst: no gamble, only best gambles, a worse gamble than available, an
  unnecessary gamble.

Proposed next: these kinds become the loss levels of the tree above (known,
unnecessary gamble, worse gamble, best gamble, gamble on a guessed flag), with
opening, mid-game, and endgame beneath each.

**Judgment problems, the same day (creator request).** "let's make a new type
of problem! let's actually iteratively do this": pick many interesting wins
and losses, show one or more situations from each (the moment of loss or an
earlier choice), and quiz the creator on how the game should be judged. A won
game where a safe and useful move was passed over for a guess is judged bad.
At least 100 problems of every kind, then classify the answers "to truly
discover the best possible way to evaluate and judge the result of the games
someone starts". Built as a local research page outside the release, with the
problems and the creator's exported answers committed beside it (the creator:
"its only me doing this and my minesweeper opinions are rather public"):
`analysis/judgment/` ([notes](analysis/judgment/NOTES.md)), 163 problems of 45
kinds from the 2026-10-11 export. Each asks for a rating of every shown move,
the game's category, how much of the result came from the player's choices,
and a note, then shows the analysis and the proposed category. Waiting for
the creator's answers; next, compare them with the proposed categories kind by
kind, and settle the tree's levels and thresholds: how much riskier counts,
whether a safe square only whole-board reasoning finds counts against the
player, whether a win's flag mistakes matter. A game's avoidable risk comes
from the actual risks its saved moves record, not from the guess ledger,
whose totals deliberately keep raw mine chances under A Just Universe
([per-game stats](docs/product/per-game-stats.md), "Life lost"); the quiz
measures wins that way.

## More daily play limits (proposed 2026-10-12 with the built ones)

The creator asked "What else can you think of like this?" when requesting
[daily play limits](docs/product/play-limits.md). Proposed, not requested
as builds; each would join `PLAY_LIMIT_KINDS` under the same 4:00 day, two
confirmations, and loosening lock:

- **Breaks.** After N minutes of play, no new board for M minutes. Caps a
  single sitting, which a daily total does not.
- **Start time.** No board before a time of day (the morning counterpart of
  the stop time), or allowed hours as one window.
- **Losing streak stop.** After N losses in a row, done for the day (or for
  a break): a stop against playing on tilt.
- **Weekly totals.** Play time or games per week, for someone who wants a
  long day sometimes but a bounded week.
- **Wall-clock time on the page.** Time with the game open and visible,
  including reviewing results between games; the built play time counts
  only game time.
- **Mode limits.** Games per play mode (trials, Endgame drill) or Custom.
- **A warning before the limit.** The board's notice at, say, 5 minutes or
  5 games left, so the last game is chosen rather than cut off.
- **No-flags penalty alternatives** (found while building the penalty,
  2026-10-14; [the penalty](docs/product/play-limits.md#the-penalty-no-flags-first-creator-request-2026-10-14)).
  Built: a stop time closes at once, and a board keeps the flag permission
  it went into play with. Open: a no-flags stage for the stop time (half the
  time from the stop time to 4:00, so 23:00 would allow flagless play until
  1:30); taking flags away mid-game at the moment a play-time limit is
  reached, which would leave one game played under two rules.
- **Archive the play spans.** They are the only record of abandoned boards,
  their time and, since 2026-10-20, how each board left play, which the
  session results count; the archive folder does not hold them yet.

## After-game self-evaluation review (creator request 2026-10-07; round 2 built the same day)

The creator asked to rethink the after-game view around its questions: how
well did I just do, how am I playing and feeling this session, how did this
game go, how does the screen look, and what do the colors mean. Cutting is
allowed when done consciously. Observed first on a 40.270 s Intermediate win
in the Cursor browser's profile (13 Intermediate games, 5 wins), compact
layout at 1154 px wide; round 2 used the creator's production history (7,436
games) at their 2560 x 970 viewport.

Findings (round 1, before the changes):

- The page is 10,238 px tall, about 11 screens. Its 98 charts take about 88%
  of that height: 20 your perf, 9 board traits, 8 relationships, 61 motion
  diagnostics. With 5 wins each history chart has about five dots.
- In the compact layout the outcome line and the game-data band exist only
  inside the Game details popover, so the page states the time only in table
  rows and the timer.
- No element states a verdict. The time ranked 3rd of 5, while 3BV/s and path
  per 3BV were each the worst of 5, and
  the board's 3BV was 6th lowest of 13. The page shows these as separate
  ranks and leaves the conclusion to the player.
- Small pools give extreme colors: with 2 session wins every session marker
  sits at 0% or 100%, so a mid-lifetime game shows red "time (session)" and
  "time (day)" markers and a brown "Last place" row.
- Six color codes share the screen: board numbers, rank tints and podium,
  age units, chart dots and trend lines, the band gradient, and the session
  panel's ending markers. Green means "minutes old" on dots and ages but
  "better" in tints and the band; red means "days old", "worse", a board 3,
  or an avoidable mistake. Nothing on screen keys the table or dot colors.
- One concept, standing within a pool, uses two scales: rank-table tints run
  green, cool gray, brown, while the band (and the UI doctrine's performance
  gradient) runs green, blue, red.
- Seven of nine This-board tables and "past 5 min" held one row ("#1 of 1,
  Only result"). "max number 4" and "max 4" listed the same games, as the
  nested max-N rule allows when no board has a 5.
- The session's three games (a 3.1 s loss, the 28.846 s lifetime best, this
  win) appear nowhere as a sequence; the picker read "last hour".

Built 2026-10-07 on the creator's approval ("Please go forward with
this!"), specified where each lives:

- The first screen carries the result
  ([results](docs/product/results.md#the-first-screen-carries-the-result-creator-direction-2026-10-07)):
  the board centered in its column, the session summary left of it and
  ranks won right of it wherever each fits
  ([layout](docs/product/board-and-layout.md#layout-the-board-never-moves)).
- Session summary (wanted from the first mockup, whose verdict rows the
  creator rejected):
  [Session summary](docs/product/rankings.md#session-summary-requested-and-built-2026-10-07).
- One standing scale, green better, red worse, and one this-game color (light
  blue at first; from 2026-10-08 the charts' fluorescent green, which the
  creator kept for charts and moved everywhere; since 2026-10-15 light blue
  again everywhere, the charts' this-game dot included): [UI doctrine](docs/product/ui-doctrine.md) and
  [Rank highlights](docs/product/rankings.md#rank-highlights-built-2026-09-21-recolored-2026-10-07).
- Game data rebuilt: one row per measurement in aligned columns, plain
  labels, the colored bar, the lifetime/session switch, the hover card with
  the distribution, the distributions view with lifetime and session
  groups for your perf and board traits (a pools switch, labeled sections
  until 2026-10-17, shows either or both since 2026-10-08, and the strips
  grow to fill the height), and
  chart titles carrying each row's value and
  standing ([game data](docs/product/game-data.md#position-and-presentation)).
- One session picker for every session surface, at the upper left; moved
  to the top bar at the upper right on 2026-10-14, and to the settings row
  at the page foot on 2026-10-20
  ([One session definition](docs/product/game-data.md#one-session-definition)).
- One name per measurement across game data, tables, charts, the stats
  table, session charts, and the stats panel ("max number", "zero-opening
  coverage", "islands", "flag" for placed flags), with grouped tables naming
  their range ([UI doctrine](docs/product/ui-doctrine.md),
  [per-game stats](docs/product/per-game-stats.md)).
- Game data panel polish (creator review 2026-10-08, built the same day): no
  heading, one options row under the data, centered side titles, no
  "boards" head, regular-weight numbers, no scroll bars, no help cursor,
  cards cut to what the panel does not already show (rank, games, a needed
  definition; no restated lines, pool descriptions, or arithmetic) that
  follow the points switch, whole-value
  histogram bins, and the session summary's means without the default mode
  name ([game data](docs/product/game-data.md#position-and-presentation),
  [session summary](docs/product/rankings.md#session-summary-requested-and-built-2026-10-07)).

Still open:

- **Color key** (proposed, not decided). One line keying the remaining
  codes: the standing scale, the this-game light blue, and age units.
- **Data sufficiency** (proposed, not decided). Show a history chart once
  its pool has enough games and say so in one line; omit one-row "Only
  result" tables; fold motion diagnostics behind one button.
- **Small pools** (proposed, not decided). With two session games every
  session standing is 0% or 100%; "2 of 2" wording or a minimum pool size.
- **Session summary clipped in a narrow board column** (found 2026-10-14,
  unchanged by that day's top bar). With the details column docked and game
  data inside it, as at 1216-1280 px wide, the board column is about 400-440
  px, narrower than the summary (about 505-515 px), so its right columns
  (mean IOE, and a second size's share in the results grid) are cut off at
  the column's edge. Options: let the summary scroll sideways inside its
  block; wrap the means onto their own grid under the counts; or undock the
  details column into the Game details popover sooner.
- **Fit beside an Intermediate board at 2560** (found while building). With
  production history the session summary (391 px) and ranks won (418 px)
  exceed the 379 px beside an Intermediate board, so both sit below it.
  Narrower blocks or a narrower game data column would put them beside it.
  Since the session means were added (2026-10-08) the summary is about
  505 px for one type and no longer fits beside a Beginner board (433 px)
  either; ranks won still does.
- **Ranks won rows wrap** (found while building 2026-10-10). The ranks cell
  is capped at 28ch (set 2026-09-21, when the block began listing every
  session rank), so about four chips, one of them a range or the "this"
  chip, wrap to a second line, against the one-line row rule. Example,
  while equal streaks still ranked newer first: the player's 2026-10-07
  Intermediate near-streak row read "2nd, 8–9th, 39th this" over
  "40–42nd". Options: drop
  the cap, so a row wraps only when it is wider than the space it has (the
  block widens to its longest row and in long sessions leaves the board's
  side sooner); a wider cap (fewer wraps, not none); or a per-row chip limit
  with the rest in a tooltip (hides ranks the 2026-09-21 decision chose to
  show).
- **"Mark" wording in the game-end evaluation and replay** (found while
  building). Game data and the stats table now say "flag" (the session
  charts did too, until their removal on 2026-10-20); the evaluation's "Mark use" and "unused correct mark" and the
  replay legend still say "mark".

## Loss-type follow-ons (found while building loss types, 2026-10-11)

Loss types and the session summary's results grid are built
([Game-end evaluation](docs/product/game-end-evaluation.md), "Loss types";
[Session summary](docs/product/rankings.md#session-summary-requested-and-built-2026-10-07)).
Open:

- **Proof tiers for survived guesses past a safe move.** Only losses carry
  the tier. A survived reveal past a proven-safe square (game risk) does
  not, so the report and the session results cannot yet tell a missed counting
  move from a missed whole-board deduction when the guess happened to
  survive. The session results tree shows the gap: a win's guess past a safe
  square and a loss's "survived it, died later" have no proof split. The
  measurement would be the one losses get (the creator's 1,257 saved losses
  took about 0.2 s together).
- **Full historical action-evidence backfill** (moved here from the session
  stats follow-ons, removed with the panel on 2026-10-20). Legacy death booleans and
  five-way verdicts are normalized immediately, but old records lack the
  saved visible position and earlier nonfatal mistakes. Deterministic board
  replay plus stored traces may be able to reconstruct some of that
  evidence offline; uncertainty must remain explicit.
- **Whole-board split into the two searching levels** (proposed
  2026-10-26 with the deduction levels,
  [Design axis](docs/product/design-axis.md), "Deduction levels"). The
  stored tier `whole-board`, and with it `mine-whole-board` and
  `guess-safe-whole-board`, joins all numbers and the mine total. Split, a
  loss would say whether the missed proof needed the numbers taken
  together or also the board's mine count. It changes stored evidence
  values and loss-type keys (rankings, the session results tree, the
  problems builder), so it waits for the creator's decision; existing
  losses would be measured again once from their saved positions, as on
  2026-10-11.

## Deduction levels: further grades (proposed 2026-10-26)

The creator asked to "construct a well-bordered complexity leel system and
develop ths further"; the four levels are built
([Design axis](docs/product/design-axis.md), "Deduction levels"). Proposed
next steps, each exact:

- **Grades within all numbers**, the level of "collecting disparate distant
  facts" and "multi-step contradictions": by the fewest numbers whose
  layouts alone force the fact (three in the worked example; long chains
  need more), found by trying sets of the numbers around the fact's linked
  squares, smallest first. Cost to be measured before choosing; such facts
  are rare (0.17% of facts on simulated Expert games, 0.1% on Intermediate
  and Beginner).
- **Grades within overlap**: one number's covered squares inside another's
  before two numbers that only partly share squares.
- **Moves available by the finer grades**: the live perf charts' level rows
  would gain one row per grade.

## Move hierarchy: the unbuilt levels (creator request 2026-10-26)

The creator asked for one description of how the moves available at any
moment are characterized, from proven moves up to the player's output per
hour. It is [Design axis](docs/product/design-axis.md), "Move hierarchy",
which says what is built at each level. The creator then asked to build the
unbuilt levels ("biuld them", 2026-10-26); built that day with definitions
recorded as choices to change ([During the game](docs/product/during-game.md),
"Revision (creator 2026-10-26, the move hierarchy)"): usefulness as 3BV per
click and distance by level, a connected guess as one beside open numbers,
the whole game's chance to win where its exact search finishes, and the
wait before a guess nothing could ever settle. Still not built:

- **Each move judged against the most useful** (level 2). The most 3BV per
  click available is shown at every moment, but the move the player made
  is not scored against it. A flag solves no 3BV by itself and pays off
  only through a later chord, so judging single clicks needs a definition
  that credits a flag with the chord it prepares.
- **The information tie-break** (level 6): between otherwise equal moves,
  the one whose information helps the player more. It needs a definition
  of an information's usefulness, such as the facts a revealed number
  would prove next, counted exactly over the layouts.
- **Output per hour as a judgment of moves** (level 6): an objective such
  as expected wins per hour of play, against which a move is scored.
  "Competing optimization objectives", below, is the analysis side of it.
- **The chance to win past the work limit** (level 5): "Deeper than
  one-move perfect play", below; the split into independent groups and the
  pruning bound were built 2026-10-27, dead squares skipped 2026-11-02, and
  the limit is a creator decision.
- **The choices made in building** (same revision) are first readings:
  connected meaning beside open numbers (the creator did not answer which
  reading was meant), flags counted as clicks in 3BV per click, and
  distance only to proven-safe squares.

## Switching between marking and clicking (creator, 2026-09-28)

The creator asked for a performance stat on switching between marking and
clicking or chording and for a statistical look first; the study is
[reference/mode-switch-2026-09-28.md](reference/mode-switch-2026-09-28.md).

- **Switch cost.** Built and released 2026-09-28 on the creator's approval,
  made one session-stats row with a session and a latest-500 column on
  2026-10-08, and an optional line under game data on 2026-10-20, when the
  left panel was removed ([Switch cost line](docs/product/game-data.md#switch-cost-line-creator-request-and-approval-2026-09-28-under-game-data-since-2026-10-20)).
  Finished on 2026-10-20 (creator: "review and finish switch cost please.
  think about hwo to m ake this useful"): the line shows what the shown
  game's switches cost in seconds and an earlier-500 pool beside the latest
  500, and the card the cost per game of each standard board. The half-built
  per-game regression (`SwitchCost.gameFit`, partly built 2026-10-08) was
  removed: one game's estimate is noise, so a game's cost prices its
  switches at the latest 500 games' estimate.
- **Breakdowns by direction and distance** (mapped). Flag then chord against
  chord then flag, and one, two, or three or more cells, differ widely in
  the study; showing them needs its own reliability check per breakdown.
- **The estimate over time** (mapped). The latest and the earlier 500 are
  two points since 2026-10-20; a history of the pooled value across every
  successive 500-game window would show the whole course.
- **Standing among other players** (mapped). Alternation relative to chance
  and speed across 545 replay-corpus players are in the study; the corpus
  chords with both buttons, so its switch costs do not compare directly.

## Training toward Expert sub-60 (creator, 2026-09-26)

The plan and the read-only training page are built
([Training](docs/product/training.md)). The creator then asked for plan v2:
measure against real players first, break play into subskills, and build
"Minesweeper problems" from real positions (same file, "Redo requested").
Unbuilt parts of plan v2 (creator):

- **Corpus at scale.** Built: a 3BV/s-stratified saolei.wang sample of 500
  games per level (3,498 usable, at most 10 per player per level, 2026-09-27;
  [reference](reference/skill-comparison-2026-09-26.md)). Still open: board
  difficulty in the model (3BV, openings).
- **Situation annotation.** Built (`analysis/skill-comparison/situations.js`;
  results in [Training](docs/product/training.md#situations-memorization-and-problems-requested-2026-09-26-evening)).
- **Gap ranking.** Replace one component at a time (reaction, travel, hover,
  economy, pauses) in the player's own games with a faster level's values for
  the same situations; rank subskills by seconds saved. The situation analysis
  prices each trait's gap from the player's counts; the counterfactual replay
  is still open.
- **Pointing test.** Built as `pointing-v1` on the problems page
  ([problems.md](docs/product/problems.md)), with runs compared by square size
  (2026-09-27).
- **Minesweeper problems.** Version 1 built; follow-ons under
  [Minesweeper problems](#minesweeper-problems).
- **Level placement.** Built at the level of the average game at the player's
  speed with bootstrap intervals. Still open: a per-class model with player
  effects, once the corpus holds enough fresh moves per class and level.
- **Keyboard keys as mouse buttons (mapped).** minesweeper.online lets keys act
  as the buttons, separating clicking from aiming; a candidate for alternating
  blocks. Both-button chording and the 1.5 click are built as standard behavior
  (2026-09-26), and the trace-metrics cell-geometry defect found by the
  comparison is fixed.

Earlier proposals, still open:

- **Per-game economy feedback.** Built. The after-game report counts chord
  clicks on numbers still short of flags and clicks on finished numbers on
  their own lines ([evaluation](docs/product/game-end-evaluation.md)).
- **Last-flag drill.** Built from replay-corpus positions
  ([problems.md](docs/product/problems.md)). Open: positions from the player's
  own premature-chord moments, read from their traces in the browser.
- **Wrong-flag drill.** Most late Expert deaths follow a wrong flag (a chord
  over it, a chord contradicting the numbers, a misclick next to it). A timed
  check-before-chording drill: positions with one wrong flag near a number
  about to be chorded, answered by removing it, from the player's own losses.
- **Opening statistics.** Built 2026-09-27 from a new per-record fact,
  `firstRevealIndex`, on the training page ([training.md](docs/product/training.md),
  Openings). Open: the games before that date, whose first click only their
  traces hold (a one-time worker replay of all traces).
- **Drills aimed at the stages.** A timed recognize-and-click drill over local
  positions taken from the player's own long pauses and misreads, shown in all
  rotations and reflections with look-alike patterns mixed together (far
  transfer from generic drills is near zero); and a mid-game sprint (a
  deduction-only mid-game position, the Endgame drill's larger sibling).
- **Technique comparisons.** Built: the training page compares games with and
  without each player state on the same days, in alternating blocks, with the
  plan's fixed four-pair rule and a 95% interval for the win-time difference
  over block pairs ([training.md](docs/product/training.md), Experiments).
  A paired t interval replaced the bootstrap idea: with a handful of pairs a
  bootstrap interval comes out too narrow.
- **Intermediate on the page.** The warm-up level's economy and pace beside
  Expert.
- **Board-adjusted pace and plateau detection.** 3BV/s rises with board 3BV, so
  weekly trends should also show pace adjusted for 3BV (and openings) beside
  the raw medians. Call a plateau only when changepoint detection finds no
  recent upward phase and an equivalence test puts the recent slope below the
  smallest improvement that matters (sources in the training reference).
- **Target review.** The stage targets came from the 2026-09-26 history;
  revisit them once Stage 1 completes.

## Minesweeper problems

Version 1 is built ([Minesweeper problems](docs/product/problems.md)). Open:

- **Exact click judgement.** Judge each click outside the answer squares in a
  worker: provable from other numbers at that moment, or a guess.
- **Adaptive scheduling.** Choose classes by the player's gap to the next level
  and repeat missed problems after spaced intervals.
- **More classes.** Mine-answer problems (the answer is a flag or a chord), the
  two-number families once every level holds 10 fresh corpus moves of them
  (the 1-2 rule at the edge had at most 7 per level in 3,498 games), and
  straight-edge runs as their own classes.
- **Problems from the player's own games,** timed against the player's in-game
  response to the same moment.
- **Archive folder.** Built 2026-09-27: syncs of the game, settings, and
  self-check pages archive problem attempts, pointing runs, and drill attempts
  ([storage-and-history.md](docs/product/storage-and-history.md), Archive
  folder). Open: a sync started by the problems page itself, which needs that
  page to open the game database where the folder is stored.

## Fuseki hosting (creator, 2026-09-26)

Add Minesweeper under the Fuseki project site with independent, isolated
hosting; [the hosting specification](docs/product/hosting.md) and
[implementation plan/status](docs/implementation/hosting.md) own the detail.
Live at https://minesweeper-friendly.fuseki.net/ since 2026-09-26; every
verified master push is released. Voice-Wei origin migration must preserve its
saved browser data and deliberate authenticated Articles integration.
Nectaris Remake is requested for later: prepare the same deployment contract,
then audit its runtime artifact and origin requirements before launch.

Generic multi-project hosting gaps are tracked in
[Fuseki's roadmap](https://github.com/ernop/fuseki4_ai/blob/master/docs/todo.md#independent-apps-2026-09-26).
(Music detection is local-only since 2026-09-26; see
[Music playing](docs/product/per-game-stats.md).)

Welcome search engines and LLM crawlers (built 2026-09-04 on branch
`cursor/welcome-crawlers-7966`, commit 09e014a, for the GitHub Pages address
and never merged; the branch was deleted 2026-10-18, when the creator had the
old branches pulled in or removed, because every address in it pointed at
Pages, which now redirects to Fuseki): a `robots.txt` allowing every crawler,
naming the AI crawlers too; a `sitemap.xml` of the pages; an `llms.txt`
describing the project, its pages, and its documentation; and on each page a
meta description, an index-and-follow robots tag, a canonical link, and Open
Graph and Twitter tags with the promo screenshot. Rebuilding it for
https://minesweeper-friendly.fuseki.net/ means adding the files to
`deploy/runtime-files.json` and finding how Fuseki's server answers
`/robots.txt` today.

## Long-history trend cost (creator concern, 2026-09-26)

The user asks whether fits cover every retained game and notes that O(n log n)
still grows. The worker/exact-selection change is built; bounded lifetime cost
is not. See [Point charts — Lifetime growth concern](docs/product/charts.md#lifetime-growth-concern-2026-09-26)
and [the current scope and cost](docs/implementation/charts.md#lifetime-scope-and-remaining-cost-2026-09-26-review).

Investigate worker-owned history updated by deltas, exact model caches keyed by
data revision/scope, incremental bucket aggregates, and calculating charts when
their views need them. Measure history cloning, repeated loss/view renders, new
wins, startup, and imports separately. Preserve the existing lifetime coverage
and exact estimator unless the creator selects a statistical-definition change;
no cap, sampling, or reduced refresh frequency has been approved.

## Input latency follow-ons (creator report, 2026-09-26)

The creator reported laggy clicks on the GitHub Pages site in Firefox, from
the first square on ([Input latency](docs/product/board-and-layout.md#input-latency-user-report-2026-09-26)).
Built: exact, faster click-time proof and odds evidence, session charts
that redraw once per session step during a game, and one stored record per
game instead of rewriting the whole history twice per game. Not built:

1. **Proof-budget tail.** Built 2026-11-02 by the exact counter
   ([reference/jsminesweeper.md](reference/jsminesweeper.md)): about 1% of
   expert positions exhausted the exact proof's 2,000,000-node budget
   (about 90ms in Firefox, every click on them) and ended incomplete; the
   proof now always completes, at most 3.7 ms on 1,736 simulated Expert
   positions in Node. It completes proofs that used to stop, so in those
   positions A just universe now applies its rule and the evaluation can
   name a mistake it withheld. No version changed for it: the proof's
   definition (`proofVersion` `all-consistent-layouts-v1`, every consistent
   layout) is the same, each saved evaluation records whether its proof
   completed (`factsMeasured`), and evaluations and records made since
   carry `oddsVersion` `guess-ledger-v3`. The creator may still ask for a
   new proof version.
2. **Evidence off the input path.** Built 2026-11-03, on the creator's
   "we MUST not block the input thread": a click saves its board, and the
   reports worker judges every decision at game end
   ([Game-end evaluation](docs/product/game-end-evaluation.md), "When it is
   judged"). Only A Just Universe's certification and Angelic play's mine
   move still prove on the click, since they decide what it opens.
3. **Remaining freezes found by attributed measurement (2026-09-26).** In
   Firefox with the stats panel open, all measured as our own code:
   - After a game, the report arrives in tasks of 60-160ms: `renderResult`
     work between yields, the trace copy in `saveTrace` (about 45ms on
     expert), and a forced layout of the whole finished report when
     `renderResultAsync` ends with `syncBoardLayout` (58-94ms; once 783ms).
     Remeasured 2026-10-26: most of that layout was the result charts'
     13,149 dots as SVG circles; drawn on one canvas per chart, the layout
     after a loss takes 18-20ms and a forced whole-page layout 11ms (51
     before). Since 2026-11-03 the result's parts show as they arrive
     (creator decision that day,
     [Results come in as their data arrives](docs/product/results.md#results-come-in-as-their-data-arrives-creator-decision-2026-11-03)),
     and each worker request and the session summary are built in their own
     task, the session results file the board type's games while the reports
     worker judges the game (22ms in one piece at 1,950 games), and the
     relationship charts are built one per task, so asking for every part at
     once adds no long task: the freeze after the check's lost game reads
     27-30ms, and 34-45ms for the code before in runs alternating with it.
     The longest frame after a win is live perf charts' first draw, about
     27ms (about 12 of them drawing the charts), as before. Skipping
     offscreen sections' layout is still open.
   - Switching board size while a report is shown takes about 200ms: the
     forced layout in `newGame`'s `syncGameSidebar`.
   - Some expert clicks took 57-92ms in the misclick check, where the exact
     proof exhausted its work budget (item 1, built 2026-11-02; not yet
     remeasured in Firefox).
4. **Waste the latency check measures (2026-09-26; remeasured 2026-10-20).**
   Our own handlers, in Firefox, with no report shown: a new intermediate
   game takes 23-24ms of work to build 256 cells (26-28ms on 2026-09-26,
   8ms in Chromium then). Switching to expert took 20-21ms and was down to
   7-9ms by 2026-10-19. The largest freeze in the two seconds after a game
   ends is 68-77ms since the left stats panel's removal (82-91ms on
   2026-09-26; the report tasks in item 3). The creator's rule is that time
   with no logical reason to exist is waste; cutting these lowers the limits
   in `tests/latency-budgets.json` (last tightened 2026-10-20).
   A won Expert game's full results (`expertWinResultsMs`, added 2026-10-26)
   took 216-224ms on the PC, and 132-152ms after that day's changes: the
   reports worker proved each position during play, so `finished-game`
   replied 58-73ms after the post instead of about 105ms of work. The same
   changes cut new game work to 7-13ms and the freeze after a game ends to
   33-66ms (every interval of the check's timer counted). Since 2026-11-03
   the positions are proved after the game instead (item 2): on the check's
   Expert win (229 decisions, nine guesses) `finished-game` takes 106-118ms
   in Firefox (proving 52-55, the rest of the judgment 14-15, motion 4-5,
   the measurements with the model 30-32), and `expertWinResultsMs` was
   205-248ms against its 165ms budget. The creator decided the same day that
   results come in part by part and that budget may rise while the player is
   never blocked, and the winning click and the freeze in the two seconds
   after it got their own budgets. The check's Expert game then began placing
   one flag: the synthetic Expert wins all have flags, so the flagless win
   had been ranked by itself and drew no charts. With every chart drawn the
   full results take 386-520ms (448-527 for the code before, alternating),
   and the budget is 525ms; the freeze after a game ends fell to 26-31ms and
   its budget from 70 to 35. Replying the judgment before the model's
   measurements would bring the first parts sooner; only game data and the
   charts need those measurements. The charts' models run one after another
   in the one charts worker, about 140ms for an Expert win's 30 jobs.
   What remains, in Firefox:
   - The winning click's task ran 56-68ms (2026-10-26): `reportResult`
     47-56ms, of which copying the trace into storage took 32-34ms and the
     `finished-game` post's copy to the worker 11-13ms. Since 2026-11-03
     `storeGame` copies the record and trace into storage twice, at game
     end marked pending and again once judged. Most of each copy was the
     full visible board on every decision event, measured while boards
     were arrays; since capture version 2 (2026-10-26) each is one string,
     so the copies need measuring again. Storing each
     action's board changes instead (Lifelong self-measurement roadmap,
     "Full-rate pointer capture") would cut both. Sending the worker only
     what the live feed has not would not: the page changes two kinds of
     trace entries after the feed may have sent them (a merged pointer
     sample, and a right press that joins a chord), so the worker's copy
     can differ from the saved trace.
   - Fixed 2026-11-03: the first result per mode per page load rendered
     twice when the mode had wins without board measurements, as all the
     check's synthetic wins are: the arrival of the saved-board list
     (`loadBoardMetricSources`) rendered the whole result again, asking the
     workers for every view again, though only the board measurements'
     status box reads that list. The box is now always in This board,
     hidden while empty, and such changes refill only it
     (`refreshBoardMetricStatus`).
   Occasional spike (2026-09-26): one latency run in nine on the same code
   measured switching to expert at 45ms of work (usual 15-23ms; master
   showed 17-21ms over the same alternating runs). Not yet attributed; a
   profile of a spiking run would show whether it is garbage collection or
   background analysis landing during the switch.
5. **Every load reads every game's action evaluations (found 2026-10-26;
   mostly fixed the same day).** The test was a Firefox test profile seeded
   with the creator's 2026-10-11 history export (8,203 games): every load
   froze the page for 1.0-1.05 s while the records were read into RAM, 0.82-
   0.84 s of it rebuilding the action evaluations' boards and square lists,
   each pair and number a separate value. Saved boards and square lists are
   strings since 2026-10-26 ([Storage](docs/product/storage-and-history.md),
   "Saved boards and square lists"): the longest freeze of an ordinary load
   is now 0.29-0.39 s on the same history, and the latency check's startup
   went from 523-528 ms to 244-257 ms. Still open: the remaining freeze is
   reading the records, now 45.7 MB as JSON, of which the evaluations'
   evidence is the largest part; and the latency check seeds a small
   history, so a history of the creator's size would keep this in its
   budgets.
6. **Board strings: step 2.** Delete the conversion from array boards and
   square lists: `stringFormatEvaluation` (game/evaluation.js), its call in
   `normalizeGameRecord`, the array branch of `validActionEvaluations`
   (game/history.js), their tests in
   tests/action-evaluation-migration-test.js, and the offline tools' input
   conversion. Waits for the creator to confirm that every browser both
   active players use has loaded step 1. Two decisions belong to the
   creator then. Traces saved before capture version 2 keep arrays forever
   unless rewritten, so `stringFormatTraceEvents` either stays, or one pass
   rewrites every stored trace first. And history exports saved before
   2026-10-26 can no longer be imported with their action evaluations
   once the import branch goes, nor read by the offline tools, so the
   creator re-exports after step 1 and keeps only the new exports, or the
   conversion stays at import.
7. **Incremental proofs (2026-11-03).** The game end proves every position
   of the game once (item 2). Each proof starts from the previous
   position's facts, and the residual groups of numbers a click left
   unchanged are read back rather than counted again (599 of 730 on the
   latency check's Expert win). The rest of each proof still reads the
   whole board at every position: the two rules passes to a fixpoint over
   every number, the residual numbers and their groups, the mine total's
   step, and the board view, together about 0.2ms a position in Firefox
   (52-55ms of the check's 229-decision win). Updating them only around the
   squares a click opened (the numbers beside new facts as a worklist,
   residual numbers and groups carried from the previous position, the
   mine total's sums kept per group) would make each proof cost about what
   the click changed. The proof's definition and results stay the same, so
   no version changes. Not built.

## Game data as the primary result surface (creator, 2026-09-23)

The creator likes the game-data band and hopes it can "supercede so many
other UI elements", said the page layout is "not very standardized nor
efficient", and asked that the chart not be crushed and that "the labels
must match better". Built the same day: fluid details column, compact setup
rows, a chart filling the remaining column height, and one-line labels
placed from measured widths (docs/product/game-data.md "Layout pass").

Decided and built later that day, with label simplification on 2026-09-26:
lifetime is implicit ("3BV/s 1.600"), while narrower comparisons retain
"(session)" or "(day)". Comparisons with fewer than two eligible measured
games are omitted, including the former one-game section
([Game data](docs/product/game-data.md)). The best in a pool is 0%, using
100 × (rank − 1) ÷ (count − 1). The chart has its own full-height column
beside the board column, empty during play. The board rests beside the
game data column and the saved position counts from there; the later
answer "Sit right next to the game data column" replaced the earlier "keep
centering" (docs/product/board-and-layout.md "Layout: the board never
moves"). Superseding other elements waits ("later"). The page-wide
standardization sweep was approved ("all"). Still open:

- **What it supersedes.** Each left-side time marker is the same comparison
  as a time table's "this" row: lifetime time and the lifetime table, session
  time and the session's time table ("today" under the default session).
  The chart gives rank and top
  share but not the neighboring times,
  cross-category achievements (ranks won), or the scatterplots. Options:
  hide tables whose standing the chart already shows, link a label to its
  table, or keep tables as the detailed layer.
- **Shared vocabulary.** The board-side "3BV 71" ranks this
  board's 3BV among boards, while the "3BV 71" This-board table ranks solve
  times among 3BV-71 wins, so the same text names different quantities.
- **One label per measurement.** Built 2026-10-07: one row per measurement
  with session and lifetime columns ([game data](docs/product/game-data.md)).
- **Standardization sweep (approved "all"; built 2026-09-23).** No gray text
  remains, the primary containers are fluid, headings outrank their body
  text, and the outcome summary takes two lines ([UI doctrine](docs/product/ui-doctrine.md),
  [Result presentation and ordering](docs/product/results.md), and [Personal settings](docs/product/settings.md)). The seconds
  age green `#39ff14` (about 1.4:1 on white) now sits on a black chip, the
  creator's choice over a darker green. The same chip now carries the
  session tooltip text of the three ending colors under 4.5:1 on white
  (yellow, gold, orange).
  Still open:
  - "see scores" sits alone on its row only when no replay trace exists
    (history views); after a live game it shares the row with Overlays &
    display.

## Ranks-won visibility and rank appearance (creator, 2026-09-21)

Review why the selected period omits earlier achievements in categories other
than the latest win's, especially 3BV 41 after a 3BV-40 win. The complete
[visibility review](reference/ranks-won-review.md) records the affected families,
independent cutoff/scope/collapse rules, verified interactions, and options.
Built: all 3BV and measured shape categories represented by wins in the selected
period now compete, within the current board-size/play-mode/generator key and
reference date's day-category scope. Full tablecharts retain their per-game
scope. [Recent placements](docs/product/rankings.md) records the resulting policy.
Reverted as the default on 2026-10-14 (creator): only the shown win's board
categories compete again; the period-wide discovery is the switch "ranks on
other session boards", off by default.

Appearance approved and built the same day: independent podium rank numbers
and full-row percentage tints, readable low/last/only-result states, a latest-game
edge, and explicit percentage/list-size labels. The same treatment reaches
all qualifying ordinals in the compact summary, including earlier games at
other 3BV values; blue edges and “this” identify the current one. [Rank highlights](docs/product/rankings.md) records
the implemented design; the alternative underline and uniform-blue treatments
from the comparison were not selected.

Still undecided: first-place exceptions for small pools, preservation of
collapsed category names, eligibility before duplicate collapsing, and current
standings versus achievements when earned. These rules were not changed by
the category-scope revision.

## Board-shape time lists (built 2026-08-21)

The lists themselves are in the product ([Rank lists](docs/product/rankings.md)).
Generation that aims at the same families is still unbuilt; see below.

## Board difficulty and expected performance (creator review, 2026-09-21)

Exact-ZiNi, HZiNi, and exact-maximum-clue time tablecharts are built, alongside 3BV,
with all standings visible and qualifying period-wide summary entries.
The [board difficulty review](reference/board-difficulty-review.md) separates
board rarity, conditional solve performance, workload, logic, and chance,
with primary online sources and explicitly proposed measurements.

**Built after this review:** HZiNi and 3BV spread time tables, HZiNi
win efficiency in Game stats, and the two requested exact fractions:
0–1 share = zeros and ones revealed by opening every zero / all safe cells
(covered ones excluded, clarified by the creator); zero-opening
coverage = the union of all zero floods including numbered borders counted
once / all safe cells. Both fractions now group time comparisons by the
nearest whole percentage point; 3BV spread uses the nearest 0.5 cell. Halfway
ties round up and recorded measurements retain full precision. Values appear
only in tablechart headings, with definitions and precise measurements on
mouseover/focus. These groupings also drive qualifying period-wide summaries.
Board fractions remain distinct from rank percentiles.
Saved-win backfill handles partial old measurements and shows progress,
Stop/Resume, unavailable/error counts, and immediately usable saved results
that survive reload. Old whole-board 0–1 counts are excluded until the player
backfills the corrected visible count. Exhausted backfill operations hide
their progress panel; actual errors stay visible. See [Per-game stats](docs/product/per-game-stats.md) for the
implemented behavior.

**Recurring backfill prompt (creator report and fix request, built 2026-09-23):**
Completed batches returned after reload because missing-board checks were
session-local. Backfill now queries the saved-board index before offering work,
excluding unavailable layouts without permanently marking games as skipped.
Restored traces become eligible again. Resume/Paused now require an explicit
Stop in the current page; reload offers any real remaining work as
`Backfill saved wins`. Browser regression covers the v2 database upgrade,
repeated reloads after exhaustion, and restoring a missing source board.
[Per-game stats](docs/product/per-game-stats.md) records the implemented policy.

**Declined for the current UI:** the creator asked to skip the other proposals,
including largest-opening share, remaining work clusters, deduction coverage/
depth, all-start logical profiles, and work-tree length. Their definitions and
tested calculators remain research, not queued implementation:
[structural-fraction review](reference/board-structure-research.md) and
[rigorous metric definitions](reference/board-metric-definitions.md).
Retired C*/RCW searches are outside the game's runtime.

A multifeature expected-time model also remains research. It needs held-out
validation, adequate sample sizes, a declared reference period, and separate
treatment of wins/losses. Actual time, clicks, mistakes, and pauses must not
be inputs to an allegedly board-only difficulty adjustment.

**Still unbuilt:** a scalable exact production calculation of the creator's
opening-first global minimum C₀*(B) = opening count + minimum remaining actions
after all zero floods. Its exact <=16-cell reference calculator and complete
definition exist. Opening zeros first does not remove the general optimization
problem on zero-free boards. HZiNi is a separate fixed greedy benchmark, not
a proved C₀*. No range or heuristic may be labeled the global minimum.
An optimal whole-game survival policy also remains research. No additional
metric implementation is approved by the retained research proposals.

## Recent and per-person trait–performance correlations (creator, 2026-09-23)

Identify which board descriptors are most associated with this person's
time performance now, and how that association differs by person. The
game-data visualization ranks this game's performance within lifetime/session
history and its board values in preferred directions. It does not compute
correlations or attribute solve time to traits. Historical session windows
now use the page's one session picker and derive summaries from existing records.

Existing history already collects primary trait measurements, solve time,
completion date, and the size/mine-count/mode/generator score key. Derive
correlation results from those facts rather than storing duplicate percentile
snapshots. The analysis still needs an explicit recent-period choice,
adequate measured samples, treatment of ties and missing values, and a
distinction between association, independent effects, and changes in player
speed over time. Per-person comparison needs explicit player attribution;
the current history store has no player identifier, and state tags must not
be silently treated as identities. No account tracking, cross-person data
collection, or fitted correlation view is implemented by the trait-line UI.

## Record-review improvements (mapped, 2026-09-21)

Proposals from the creator-requested thread audit; not approved implementation.
The compact gapless summary, surrounding table flow, and local day-of-month
comparisons are built. The earlier open ranking-policy choices and exact
opening-first click optimizer are tracked above.

- **Inspect an achievement's game.** Activate an individual recent rank to
  open its original finished game and matching comparison table, including
  earlier board categories absent from the currently displayed game. A
  compressed rank range first exposes its individual games. Preserve the
  summary's period, score key, and return scroll position. Saved-board replay
  needs that game's trace; do not imply an unavailable board can be restored.
  This is the first suggested addition because retained achievements should
  be directly inspectable.
- **See the cells behind a board metric.** A small separate finished-board
  preview can highlight the 0/1 cells revealed by all zero openings, the full
  union of zero openings, or the 3BV
  work points and their center. Associate it with the inspected record, which
  may differ from the active unfinished board. Reuse the exact existing
  definitions, keep help accessible by keyboard, and do not reflow the page
  on hover or add another permanent values list.
- **Compare time with the group's median.** Optional detail beside a board
  comparison can state seconds faster/slower than the median of that table's
  saved wins, with its sample count. Use the arithmetic mean of the two
  central times for an even count. This describes the same observed comparison
  pool as the rank; it is not an overall board-difficulty estimate or a
  prediction. It supplies magnitude where a rank alone gives only position.

## Generation (not built)

The board-generator registry exists (2026-08-25, [Board
generators and top score keys](docs/product/board-generators.md)): Default, Pink noise, and Blue noise,
each parameterized, chosen from the Generator menu in the mode options row, with
per-key rankings and the Board lab exploration mode. Everything below
is still unbuilt.

### More board generators (creator, 2026-08-25)

Built the same day ([Board generators and top score keys](docs/product/board-generators.md)):
pink noise (with the anisotropy stretch parameter), blue noise, green
noise, stippled, letterforms, and patriotic (the last removed
2026-08-30). Still unbuilt:

- **Threshold blobs.** Cut the noise field at a level and fill the
  super-threshold region with mines (hard blob edges instead of the
  built proportional weighting) — parameterized by edge softness.
- **Toroidal wrap.** Periodic noise/distance so the board tiles;
  matters for future wrapped-board modes.
- **Black noise.** The audio-taxonomy color not yet represented:
  almost-everywhere emptiness with rare tight bursts — most of the
  board minefree, a few dense pockets. (Violet noise, blue's steeper
  sibling, is effectively reachable by raising blue's spread and is
  not planned as its own entry.)
- **Words in letterforms.** The letterforms generator draws random
  letters; a chosen word (part of the key, so each word ranks
  separately) is the natural next step.
- **Flags and emblems.** The removed patriotic generator was
  stars-and-stripes; flag geometries generally (tricolors, crosses,
  circles) are a region-allocation pattern with different regions.
- **New board sizes.** New board sizes as their own ranked keys — the
  top score key already carries them.

### Solver-aware modes (mapped)

From the design axis in [docs/product/design-axis.md](docs/product/design-axis.md). Its
no-guess tiers (NG, Evil NG, Graded NG) were dropped 2026-10-21 with the
no-guess modes ([Play modes](docs/product/play-modes.md)). The deduction levels
are implemented (design axis, "Deduction levels", 2026-10-26; solver tiers
before): counting, arbitrary overlap-difference deduction, exhaustive
frontier-component search over the numbers alone, and that search joined
through the global mine count and sea.
This is layout-consistency solving, not a finite named-pattern catalog.
Derived session result: a
1-2…2-1 wall chain with k twos is fully forced unless k ≡ 0 (mod 3).

- **Kaboom.** Mines stay unfixed; any unforced guess is a mine, forced
  guesses are always safe.
- **Justice v1 family expansion.** Asymmetric or exotic sealed structure
  still refused. Angelic mode (2026-08-21) is the rest of the dual for
  play: any cell that is not a proven mine is made safe. Expanding
  Justice certificates is a further step. Built 2026-10-21: groups are
  judged one by one inside a connected region, so 50/50s and k-of-n
  groups joined by a shared number qualify
  ([A just universe](docs/product/just-universe.md)). Built 2026-10-26: a
  chain with unequal sides qualifies when the last squares no number
  touches make up exactly the difference and the mine count leaves just
  two layouts (creator report of a loss on that shape). Still refused: a
  group whose count no clue pins even after subtraction, an unevenly seen
  chain, an unequal chain with more squares no number touches than the
  difference (several layouts at unequal odds, so not one coin; a rule for
  it must first decide whether such a guess counts as forced), and a sea
  that is not the only one.

### Boards shaped like the lists above (creator interest, 2026-08-21)

Generation that aims at the same families the new lists rank:

- force or forbid an 8, a 7, or a chosen max number (2 / 3 / 4)
- target a chosen island count
- target a chosen largest-island size
- target a chosen zero count

## Deferred product (already decided, not built)

- **Separate Justice-on and Justice-off rankings: decided against
  (2026-08-23).** Originally deferred 2026-08-20. The creator confirmed
  the mixed lists are the product: Justice stays on and its games rank
  within the same lists. Not open for revisiting without a new explicit
  request.
- **Per-stage motion-stat configurability.** Which metrics appear live
  vs after the game. Since 2026-10-20 one open/close section at the page
  foot holds both (it replaced the two on/off settings); finer control does
  not exist.
- **Hevelius features computed but not shown.** Offsets, variability,
  direction changes, normalized jerk with pauses, submovement fractions.
  Same per-stage display question.
- **Hevelius block-variability (CoV).** Offline-only until movements are
  residualized against log2 distance and log2 width
  (`reference/hevelius/FEATURES.md` assumption A3).
- **Hevelius Kalman position smoothing.** Papers do not publish the
  filter parameters; the in-page port skips it (documented deviation).
- **CHI 2012 deliberate-movement filter.** Would isolate queued
  point-and-click returns as the clean motor trials inside ordinary
  play. Researched, not built.
- **Goal-birth refinements** (`reference/mouse-motion-metrics.md`):
  final-approach onset from the last movement bout into the click;
  deducible-since timestamps (needs a solver replay) and the queue
  metrics that sit on them. Anchoring at the previous click is the
  decided measurement, not a stand-in for these.
- **Trace-only metrics named in the survey and not ported:** tremor
  spectrum (4–6 Hz band power), overshoot analysis, Fitts throughput
  curves. Raw traces are stored so these can be added later.
- **Guess-ledger ranks and scatters.** Life lost / needless / perfect-play
  counts are stored per game; no rank list or scatter uses them yet.
- **Exact layout counter for odds, facts, and the guess ledger
  (requirement 2026-10-22; [AGENTS.md](AGENTS.md) design requirement 8;
  [Guess ledger](docs/product/per-game-stats.md)).** Built 2026-11-02
  (`guess-ledger-v3`; [per-game stats notes](docs/implementation/per-game-stats.md),
  "Guess ledger"; the method is JSMinesweeper's probability engine,
  [reference/jsminesweeper.md](reference/jsminesweeper.md)), except the
  rescoring of saved games: one counter for the proof, the odds, and
  one-move life, with no work limit; every guess measured; the best value
  over every covered square; ties by exact counts. Until then `odds.js`
  listed layouts up to 22 squares per group or 250,000 steps and took
  shortcuts beyond them, and on forced-guess endgames the "perfect"
  verdict was wrong for 7.8% of Intermediate and 11.4% of Expert guesses
  (measured 2026-10-22). The 2026-10-22 prototype of one-move life took a
  median 20.5 ms and at most 179 ms an Expert guess, so it was planned for
  the analysis worker; the built one takes a median 0.6 ms and at most
  15 ms on 832 Expert guesses in Node (kernels for the untouched board
  cached per touched set, one value per class of sea square, the survival
  bound in increasing order of risk). Since 2026-11-03 the whole judgment,
  this scoring included, runs at game end in the reports worker, never on
  the click ([Game-end evaluation](docs/product/game-end-evaluation.md),
  "When it is judged"). Still open:
  - **Saved games.** Every accepted action's position is in the raw trace
    (`traceDecision`), so every guess of a traced game can be rescored to
    `guess-ledger-v3`. Rescoring also replaces the false ties stored until
    2026-10-11 (bare survival odds saved as both the chosen and best
    values), which the full report shows as "tied". An untraced game keeps
    positions only on its stored evaluations (deaths and mistakes). Its
    `guessPerfect` cannot be rescored, so whether to drop it is a creator
    decision. Rescoring changes saved history, so it ships in two steps
    ([AGENTS.md](AGENTS.md), "Changes to saved history").
  - **Raw risk ties read from decimals.** Since 2026-11-03 each guess
    saves the active-rules verdict exactly (`bestActualRiskTaken`), and the
    survived game-risk category, the loss types, the session kinds, and the
    report's active-rules risk line read it; "a square was proven safe"
    reads a lowest risk of exactly 0. Two readers still compare stored
    decimals within 10^-12: the report's raw risk line ("tied"), shown when
    A Just Universe made the active risks differ, and whether the raw and
    active risks are the same line. A gap smaller than that needs more than
    10^12 layouts in play. Exact: save the raw verdict and whether A Just
    Universe changed either risk. Saved games keep the tolerance where
    their decimals came from raw odds (until 2026-08-23) or the listing.
- **Deeper than one-move perfect play.** Current `guessPerfect` is
  expected remaining life after one number observation. A full
  remaining-game-tree win probability needs a method that scales (design
  requirement 8), not a budget, and never a substitute such as min-p.
  Built 2026-10-26 for the live perf charts' guess card, not for the
  record: an exact count of the layouts perfect play wins
  (`Odds.winChances`), which stops at a work limit with no value where its
  search is too large, the card saying so. That limit is a budget, set to
  keep each guess's search to a few milliseconds after the game. The agent
  recommended keeping the exact value where it finishes. The creator
  disagreed (2026-10-26): "i still don't agree w/100k; tehre should be a
  proper way to actually calculate this, algebraically or with just
  logical propositions in a moderately largeish chain." Directions then
  listed: splitting the board into regions that interact only through the
  mine total; settling by proof first; symmetry; and bounds that prune
  whole subtrees.
  Built 2026-10-27 ([During the game](docs/product/during-game.md),
  "Revision (creator 2026-10-26, the move hierarchy)"): the split (groups
  no number links, whose chances multiply where the mine total leaves each
  one count; groups it leaves several counts searched together) and a
  bound that prunes every subtree that cannot beat the best guess found.
  Both are exact: they agree with a brute-force game search on 12,000
  random small positions. On the guesses of `tests/win-chances-bench.js`
  they raised the computed guesses from 26 to 27 of 41 Beginner, 49 to 52
  of 77 Intermediate, and 71 to 90 of 212 Expert, at most about 2 ms a
  guess. Settling by proof first was already in the search; symmetry beyond
  squares mined in the same layouts was not tried.
  What remains is not a counting problem. Of the 122 Expert guesses still
  refused, 96 have a group of a million or more layouts that nothing
  splits (82 more than 10^12), because the unopened area joins them: the
  chance to win there is the value of the whole rest of the game in that
  area, which no known exact method finishes. The other 26 have fewer
  layouts but a long search over what opening the unopened squares can
  show: without a limit, 15 finish within 1.2 seconds, 4 take 3 to 11
  seconds, and 7 do not finish in 15. Open, a creator decision: the limit.
  Raising it tenfold computes 4 more Expert guesses and 1 Beginner, at up
  to 15 ms a guess on the after-game results path; computing a guess's
  chance only when its card opens, with about a second each, would compute
  about 15 more Expert guesses and leave the card blank while it runs. The
  agent recommends keeping 100,000. The limit stays until the creator
  decides.
  2026-11-02: the search skips dead squares (one showing the same number in
  every layout that leaves it safe; JSMinesweeper's term), its counts are
  exact BigInts from the new counter, and every guess's odds are measured,
  so the bench's games play to their end. On those guesses it computes 27
  of 42 Beginner, 52 of 93 Intermediate, and 116 of 387 Expert (the
  published release: 26, 49, and 89, agreeing exactly on every guess both
  compute); at 1,000,000, 28, 53, and 123 at up to 61 ms a guess; at
  10,000,000, 29, 56, and 130 at up to 259 ms. JSMinesweeper limits the
  same search too: its exact search runs only below 1,000 remaining
  layouts in play (its analyzer: a setting up to 20,000, 5,000 by
  default), and a heuristic chooses beyond. The decision is still the
  creator's; the agent's recommendation is unchanged.
  2026-11-03, the creator: "i still disagree with things such as arbitrary
  100k limits ... is there evidence of the actual risk, the actual timing
  distribution we expose ourselves to? there should be." Measured that day
  in Node on the PC, on the 4,703 guesses with an undecided square in
  2,245 of the creator's saved games (a copy of the database read on the
  test origin), at limits of 10^5 (now), 10^6, 10^7, and 10^8:

  | Level | Guesses | Computed at 10^5 / 10^6 / 10^7 / 10^8 | Per guess at 10^5: median, 99th percentile, most | Most per guess at 10^6 / 10^7 / 10^8 |
  | --- | --- | --- | --- | --- |
  | Beginner | 476 | 14.5% / 16.0% / 17.2% / 18.3% | 0.18 ms, 9 ms, 27 ms | 0.19 s / 2.2 s / 18.5 s |
  | Intermediate | 1,144 | 10.5% / 11.8% / 12.5% / 14.0% | 0.45 ms, 17 ms, 76 ms | 0.24 s / 1.8 s / 17.8 s |
  | Expert | 3,083 | 4.6% / 5.1% / 5.6% / 6.2% | 0.89 ms, 18 ms, 57 ms | 0.23 s / 2.4 s / 16.8 s |

  At 10^5 one game's guesses take at most 112 ms together, in the reports
  worker after the game. Of the 4,266 guesses not computed at 10^8, 4,184
  stop while listing a group's layouts, which alone needs at least 10^8
  units, and up to 10^107: no limit a person can wait for computes them
  (at the measured median of 0.09 µs a unit, 10^8 units take about 9
  seconds and 10^15 about 3 years). The other 82 stop in the search. So the limit is a bound on time, not on the answer, and
  raising it buys a few guesses in 100 at seconds each. Options for the
  creator, the agent recommending the first:
  1. Keep 10^5, and have the guess card state the work the search needed
     (at least the units counted when it stopped; a group's listing is
     counted exactly before it is listed) in place of a bare "not
     computed".
  2. Compute a guess's chance only when its card opens, with no limit,
     cancelled when the card closes or a game starts, showing progress:
     about 1 more guess in 100, and a card that waits seconds or never
     finishes on the rest.
  3. Raise the limit to 10^6: about 1 more guess in 100, up to 0.24 s a
     guess after the game.
- **JSMinesweeper traits not built** (review 2026-11-02,
  [reference/jsminesweeper.md](reference/jsminesweeper.md)). Each but the
  last is exact and comes from counts the game already makes:
  - **Chance of each number.** For a covered square, the chance it shows
    each number if opened (JSMinesweeper's "probability breakdown by
    value", 2026-10-04). One-move life already counts the layouts showing
    each number; it could show on the replay's hover or the guess card.
  - **Progress chance.** The chance the position after a guess has a
    proven-safe square (JSMinesweeper's "progress"). One-move life already
    finds, for each number, whether some square is then safe. A candidate
    definition for the move hierarchy's information tie-break (level 6,
    above).
  - **Dead squares shown.** Marking squares whose opening can teach
    nothing (a mine in every layout, or the same number in every layout
    that leaves it safe), in the guess card or the replay. Perfect play's
    search already finds them.
  - **Position analyzer.** Building a position by hand and seeing its mine
    chances, one-move life, and chance to win (JSMinesweeper's Analyser).
    Today they show only on positions from played games. It needs a place
    on the page and a decision on whether such positions are saved.
  - **MBF and ABF board files.** Opening and saving boards in the
    MinesweeperX and Arbiter formats, to share boards with other tools.
  - **Long-term risk.** JSMinesweeper raises the score of a guess that
    affects a 50/50 the player must face later, by a heuristic weight. The
    exact version is perfect play's chance to win ("Deeper than one-move
    perfect play", above).
- **Session results judged by the one-move choice first** (offered
  2026-11-03, not requested). The creator asked for the "best move with
  board-winning in mind rather than safest next move". Built that day: the
  tree splits lowest-risk guesses by whether each was the best one-move
  choice ([Game-end evaluation](docs/product/game-end-evaluation.md),
  "Riskier than necessary (decided 2026-11-03)"). The option is to file a
  guess by its one-move choice first, so a riskier guess that was the best
  one-move choice is no offense. Evidence the same day: of 4,849 forced
  guesses in the creator's games, 56 (1.2%) would change family; on the 145
  where perfect play's chance to win finishes, the best one-move choice and
  the lowest risk together won as many layouts as any square 100 times in
  106, the lowest risk alone 2 in 15, and the best one-move choice alone 1
  in 2. Games saved before 2026-11-02 have no exact one-move life, so they
  could not be filed this way.
- **IOE as 3BV / total clicks** (effective + wasted). Efficiency /
  throughput already use effective clicks only. The clone's IOE is the
  missing total-click cousin.
- **Which-song detail on the music state: decided against (2026-08-22).**
  The boolean `musicPlaying` is built ([Music playing](docs/product/per-game-stats.md)).
  PipeWire also exposes each stream's `media.name` (Firefox: the playing
  tab's media title), so song titles are technically reachable, but the
  creator decided titles are never stored: they are personal data that
  would live forever in records and exports. Not open for revisiting
  without a new explicit request. MPRIS (artist/album) is absent for
  this Firefox; would need a player that registers one.

## Longitudinal behavior and state analysis (creator, 2026-08-30)

Build an analysis surface over history plus traces. It must keep exact
board/mode/generator and measurement-era strata visible and make sample
coverage explicit. The measurement and interpretation requirements are
canonical in [Behavioral signatures and state research](docs/product/measurement.md).

Data layer built 2026-09-04: `analysis/history/summarize-history.js`
regenerates the stratified summary offline (sessions with early/late
halves, per-key/per-day trends, loss taxonomy in the report's wording,
guess policy, luck calibration, state/music contrasts; see
`analysis/history/NOTES.md`). The in-app surfaces below remain unbuilt; the
script's JSON is the intended input for their first versions.

- **Per-session and trailing-chunk summaries.** For every completed or current
  session and every selectable recent played-time chunk, prominently show
  games, wins, win rate, and accumulated play time. Beside them show robust
  center/spread and measured n for mouse speed (px/s), useful click rate (/s),
  fastclick gap (ms), path per click, and the available trace-derived movement,
  pause, click-hold, and verification measures. A chunk with no finished game
  has no win-rate reading; it is not 0%.
- **Session comparison views.** Small multiples align sessions at first play;
  paired early/late summaries expose warm-up or degradation; rolling windows
  show the latest state without letting long high-volume sessions become
  thousands of false independent samples. Calendar-day and whole-session
  uncertainty are computed with day/session as the resampling unit.
- **Behavioral tendency signature.** Preserve separate dimensions for useful
  click cadence, movement speed/path geometry, marking/chording style,
  same-cell no-op bursts, visible-fact contradictions, fatal-action types,
  and guess policy. Show rates as well as counts so board exposure and
  truncated losses do not masquerade as tendencies.
- **Error grammar.** Break no-ops into unavailable chord, click-on-flag, and
  flag-on-revealed-cell; separate visible-state contradictions from the
  narrower likely physical-misclick inference; show repeated same-cell bursts,
  action order, board region, and eventual outcome. Sequence analysis sorts
  action evaluations by `atMs` rather than trusting historical array order.
- **Guess-policy progression.** By exact level and over date/session position,
  chart the shares and risk magnitudes of guaranteed-safe alternatives
  ignored, minimum-risk guesses, higher-risk guesses, one-move model-best
  choices, and model disagreements. Add information-gain/deeper-horizon
  measures only when their definitions and coverage are explicit.
- **Competing optimization objectives.** Put per-game win probability beside
  wins per wall-clock hour, attempts per hour, expected time to the next win,
  and progress/risk per played hour. Test whether higher levels produce a
  shift from per-instance survival toward rapid exposure/restart policy; do
  not call that less sophisticated unless it is worse under the objective
  being evaluated.
- **State association and classification.** Compare explicitly labeled states
  with session-matched controls, then evaluate any classifier on held-out
  whole sessions against time-of-day and session-position baselines. Report
  class counts, calibration, confusion/errors, and uncertainty. One player's
  data can test within-player state prediction; identifying different people
  requires labeled data from multiple people and a separate consented study.
- **Priority visuals.** Session-aligned metric ribbons; trailing-chunk stat
  strips; speed/accuracy/risk frontiers; full-text fatal-status composition;
  risk-calibration curves; guess-policy shares by level; same-cell no-op burst
  rasters; and held-out state-classifier calibration/confusion views.

## Path replay follow-ons (mapped 2026-08-23; creator request 2026-11-07)

The after-game replay is built ([Path and choice replay](docs/product/replay.md)):
the transport under the finished board, with Play, the board overlays, and
the mouse path views, drawn from the trace of the game just ended, of an old
game opened from a rank table's full list (built 2026-11-07,
[Rank tables](docs/product/rankings.md), "Full lists and old games"), or of
the one a reload brings back. Not built:

- **creator** — Old games saved without their final board (request
  2026-11-07: open old games, "like old winning/best times etc.", as a game
  just ended). Traces kept the finished board (`finalBoard`) from
  2026-09-21; a full list's row of an earlier game says it cannot be opened.
  Its mines can be rebuilt from the seed and the first reveal where the
  generator allows it, and its finished board by replaying its inputs, as
  the training worker does ([Training](docs/implementation/training.md),
  "Replay"; exact unless a Justice redraw happened, which the replay
  detects). Open: whether those traces carry what the replay transport and
  the live perf charts read (each move's recorded position), or those parts
  stay off for such games.
- **creator** — Full lists of the streak tables (2026-11-07). The
  creator's request covered "any of the ratings boxes"; a streak table's
  rows are runs of wins, not games, so its box does not open. A full list
  of runs could show each run's length, its first and last win's dates,
  and open its last win. Waits on the creator.
- **Animated playback.** The stored timestamps allow replaying the
  cursor in real or scaled time rather than a static polyline.
- **Off-board excursions.** The overlay canvas covers the board only,
  so movement that left the board clips at its edge; a wider canvas
  would show the full excursion (e.g. travel to the face button).

## Research designs (creator, not built)

- **Secret replay experiment** (2026-08-19 discussion;
  `reference/replay-experiment.md`): covert re-serves of transformed
  earlier boards inside ordinary Standard play, lag as the scheduled
  variable (1 game to 1 week) to estimate repeat-associated change;
  candidate repeat measurements (click-sequence match under the
  transform, time-to-first-deduction); and within- vs between-identity
  variance. Calling any effect memory, skill, or luck requires controls
  beyond board identity. Trial / Short trial are the overt
  instrument; this is the covert, long-lag complement.

## Already true, so they are not backlog

- First-click-safe standard play; classic chrome; history; rank windows;
  "3BV N"; board-shape time lists (has 8 / has 7 / max 4 / max 3 /
  max 2 / islands / largest island / zeros); average-time charts; streaks;
  five relationship scatters; markless; states; settings; traces; four in-page motion
  systems; "A just universe" v1; play-mode switcher; Angelic; Trial (25 identities × 4
  isometries, lobby → start → repeat-comparison review); Short
  trial (4 × 4); Test trial (1 × 4); correctness / throughput / IOS
  (derived); guess ledger (life lost, needless, ideal-risk, one-move
  perfect play); board generators (Default / Pink noise / Blue noise /
  Green noise / Stippled / Letterforms, per-key rankings
  via the top score key, Board lab exploration mode);
  music-playing state (boolean asked of the local base
  system); versioned action-evaluation ledger with exclusive game-loss /
  game-risk / time-loss / optional life-maximization / measurement-note
  report groups, four persistent none / fatal / risk / full display tiers
  (nothing is the new-player default), protection-aware risk magnitudes,
  explanations/position snapshots, and immediate legacy death-field
  normalization.
- Waste metrics (pauses, wander, turnarounds, feints) and the
  biometrics / mousetrap / Hevelius-style displays. The Tier 1/2
  "store a scalar per metric" framing is obsolete: the trace is the
  ground truth.
- Path replay views (2026-08-23): the after-game moves/clicks overlay
  on the finished board, with the layout-drift re-record fix in the
  trace recorder that it exposed ([Path replay views](docs/product/replay.md) and
  [Raw input traces](docs/product/storage-and-history.md)).

## Lifelong self-measurement roadmap (creator, 2026-09-26)

The creator asks for something usable "over years and decades to measure and
check all aspects of myself". Purpose and rules:
[Lifelong self-measurement](docs/product/measurement.md#lifelong-self-measurement-creator-direction-2026-09-26).
Built first on 2026-09-26:
- [self-check v1](docs/product/self-check.md): a sleepiness rating plus a
  10-counter alertness test (it replaced the first 3-minute test, which the
  creator found too long), with history and backup;
- the time zone on finished-game records;
- screen and browser facts on traces, and input provenance
  ([capture v1](docs/product/storage-and-history.md#capture-provenance-v1-2026-09-26):
  browser event times, focus and visibility changes, and physical right-button
  press and release);
- the [automatic archive folder](docs/product/storage-and-history.md#archive-folder-creator-direction-2026-09-26);
- a persistent-storage request.

Remaining, in priority order (earlier items prevent irreversible loss):

1. **Nothing lost.**
   - **Archive import.** Rebuild a browser database from an archive folder,
     for a new machine or profile. Writing is built.
   - **Every attempt.** Restarted and abandoned boards keep a record and a
     partial trace with an explicit end reason, checkpointed during play, so
     practice exposure and between-game intervals become countable. Never
     relabel a restart as a loss.
   - **Full-rate pointer capture.**
     - Pointer Events with every coalesced sample, and event time as the sample
       clock. Chromium's `mousemove` stream delivers one sample per display
       frame.
     - Physical press and release for both buttons anywhere, including
       cancellations, each linked to the game action it caused.
     - The paint time of each board change.
     - Pointer exit and re-entry.
     - Replace capture v1's per-sample trust and merge arrays.
     - Store each action's board changes instead of the full visible board
       before every action, which was half of every trace as arrays
       (measured 2026-09-26; one string per board since capture version 2,
       2026-10-26). Replay and analysis rebuild positions by applying the
       changes in order.
   - **Declared setup registry.** Mouse, DPI, pointer speed and acceleration,
     hand, display, and a per-display pixels-per-millimetre calibration, with
     change events stamped onto games and checks.
   - **Timestamped state-tag changes**, and a standalone sleepiness rating
     during play sessions.
2. **More frozen checks.** Each is 90 s or less, under the self-check
   versioning rules:
   - an aimed-pointing test (fixed amplitudes and widths in millimetres after
     calibration);
   - a deduction test from a fixed generator, with parallel forms stratified
     by deduction level, so no position repeats but difficulty matches;
   - a processing-speed task, only if those two leave a gap.
3. **Gameplay as a calibrated passive measure.**
   - The provability replay: when each cell became provable from the visible
     board, and time to action, by deduction level.
   - A split between hand slips and decision errors.
   - Per-movement tables in place of per-game means.
   - Fix or retire the trace stats with known formula defects: wander's window
     mismatch, signed MAD/AUC/AD that cancel, recovery runs cut off by the
     game's end, and idle under event-driven sampling.
   - Then regroup the displayed core by dimension and rename. The popups were
     rewritten short on 2026-09-26 (docs/product/ui-doctrine.md, "Stat
     explanations"); update each one as its stat is renamed, fixed, or retired.
   - Local-time groupings use the recorded time zone.
4. **Long-horizon views.**
   - A "me over time" page: daily values, personal baseline bands, change
     detection, time-of-day and seasonal profiles, and annotations for setup
     and protocol changes and notes.
   - Automatic reports of day-to-day reliability, and of associations among
     checks, ratings, and play.
   - Charts for self-check history.
5. **Optional body channels.** Heart rate and beat-to-beat intervals from a
   chest strap through the local base system (the music endpoint's pattern),
   then others as the creator chooses. Each joins the rest by time; none is
   inferred from cursor data.

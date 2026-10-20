# Game-end evaluation (requested and decided 2026-08-23)

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/game-end-evaluation.md](../implementation/game-end-evaluation.md).

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
  proved, but cannot generate an “unproven” criticism. From 2026-08-23
  until 2026-10-11, every page load rechecked older
  `opened-unproven-with-safe-move` entries with the canonical solver and
  removed the tag where the selected cell was proved safe. The recheck was
  retired on 2026-10-11 as a finished migration: capture uses the same
  solver with the same budget, so it could no longer change anything, and
  on the creator's history it re-proved 96 saved positions on every load
  (about 150 ms of main-thread time) and corrected none.
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
  - **no-progress input** — unsatisfied chord, left-click on a flag, or a
    right press on a revealed cell that no left press joined into a
    both-button chord (settled at its release, dated at its press). These carry their exact no-op reason
    but omit a full board snapshot to avoid multiplying history size.
  - **unused correct mark (wins only)** — in a won game, a player-placed flag
    that was on a mine when removed or at game end but never contributed to
    an accepted chord. Each placement/removal cycle is its own episode.
    Losses are unmeasured: their truncated future cannot establish whether a
    standing mark would later have supported a chord. This is an observable
    no-chord-use proxy for wasted marking time, not a claim that the player
    did not use the mark mentally. It is attached retrospectively to the
    original flag action, shown in full action analysis and the less-useful
    path, counted in win records' `unusedCorrectFlags`, and charted against
    measured winning-game time or measured wins in session rates.
    **Calibration (decided 2026-08-30): the primary reading is per mark
    placed** — the share of a won game's placed flags that went unused.
    Per game rises with board size and flagging volume, and per minute
    rises with playing speed; the share is dimensionless and answers "of
    the marking work done, how much was pointless" directly, and a
    markless win stays unmeasured (0 of 0) rather than counting as
    perfect. Until 2026-10-20 it also drew on the session endings chart as
    "percent of placed flags unused when winning"; game data's optional
    unused flag rate is its per-minute companion, and the game record
    shows the count with its share ("2 of 14 placed (14%)").
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
  safe move was available**; **died on an early-game guess**;
  **higher-risk forced guess**; or **died
  despite choosing a minimum-risk forced guess**. An unmeasured risk rank
  says so. Chording is only the input method: its opened cells receive the
  same proven/potential, safe-available, and risk-rank classification
  rather than a separate “chord death” report class.
- **Died on an early-game guess** (added 2026-08-24): a forced-guess
  death taken while under a tenth of the board's safe squares were
  revealed files as this one routine status whatever its risk rank was —
  over enough games such deaths are part of the mode, so the report
  treats them as its entry fee, not a drama. Below full scope the fatal
  block shows one calm sentence with no risk facts or diagram; full
  analysis keeps every measurement, including the early-game progress
  line. Guessing past a proven-safe move stays "died after guessing
  while a safe move was available" at any stage, and the status derives
  at read time, so old records reclassify like every other derived
  view (the session endings chart, removed 2026-10-20, had a matching
  muted-gold line).
- Evidence capture must never block play. Prover/enumerator failure is
  stored as unmeasured rather than filled with an invented conclusion.
- **Game-end feedback precedes result work** (decided 2026-08-29): once the
  ending action has been evaluated, a loss must reveal its mines, mark the hit
  cell, and show the dead face, while a win must complete its mine marks,
  counter, and cool face, in the current input turn, so the final click shows
  as fast as any other (creator decision 2026-09-26: "having the last click be
  normal just like the others would indeed be wonderful"; drawing the result
  shell in that frame had made game-ending clicks the only ones past 20ms).
  The outcome and exact final time appear beside the completed board one
  frame later, with a quiet loading status beneath them. Only after that
  second paint may record and trace capture, final trace metrics,
  session-chart rebuilding, rankings, and the full post-game report begin.
  The shell runs the same board-layout sync as the full result, so its first
  visible frame is already correctly placed. A throttled-frame
  fallback still finalizes the record promptly; any subsequent player input,
  and the tab being hidden or unloaded, flush pending finalization first — a
  finished game is never lost to the deferral window. The pre-action
  proof/odds measurement remains before mutation because its evidence must
  describe exactly what the player could see when clicking.
- **Exclusive report taxonomy** (added 2026-08-23): each evaluation
  appears once, under its highest-severity applicable category, while
  all lower-level mistake tags remain on its evidence:
  1. **Game loss** — every fatal action. The category states the outcome,
     not that the action was a mistake; a lowest-risk forced death belongs
     here too.
  2. **Game risk** — a survived action that added actual immediate loss
     probability under the active mode and protection rules. Raw-risk
     differences canceled by Justice or Angelic protection do not qualify.
  3. **Early-game guess** (added 2026-08-24) — a survived action that
     would be game risk, taken while under a tenth of the board's safe
     squares were revealed (`evidence.boardProgress`, derived from the
     saved position on records from before the field). Guessing before
     the board opens up is how most games start, so it reports as its
     own lower-priority category — headline "made a non-optimal
     early-game guess" — instead of as mid-game risk, and its deltas
     stay out of the excess-game-risk magnitude. Included at risk scope,
     after the game-risk section. A fatal early guess is still the
     fatal action, but files under its own calm "died on an early-game
     guess" status (see below). The recategorization applies to old
     records at read time like every other derived classification.
  4. **Time loss** — a no-progress input, proven-safe flag, removal of a
     proven-mine flag, or nonfatal visible chord contradiction. The
     measurement is one classified action; it does not invent seconds or
     claim intent.
  5. **Life maximization** — an otherwise-lower-severity action for which
     the one-ply model found higher expected remaining life elsewhere.
     This category is optional and model-relative, including
     sea-versus-frontier comparisons; it is not presented as long-horizon
     optimality.
  6. **Measurement notes** — legacy or incomplete evidence that cannot
     honestly be classified further, plus the factual Justice recap.
- Display: the compact stats stay in the 320px sidebar, while the action
  analysis occupies a centered, responsive column below the board and
  above rankings/charts. Category sections appear in the severity order
  above. The fatal action is always first. Survived game-risk and
  early-guess actions then sort within their sections by selected actual
  death probability (highest first), with excess risk as the tie-breaker.
  Time loss, life maximization, and measurement
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
  chord clicks: 7”). “Flagged a proven-safe square” also aggregates into
  one simple count even though those entries have saved positions; opening
  the count reveals every individual action and diagram. Other positioned
  evidence remains one block per action so each action number stays
  attached to its diagram.
  Full analysis adds category counts instead of one undifferentiated
  “recorded mistakes” total, plus nonzero excess-game-risk and
  modeled-life-gap magnitudes. Lower tiers omit those diagnostic rows.
  Under the default fatal-only tier a clean win shows no analysis block;
  the persistent scope selector remains available.
- The session results classify losses through the **same loss type the
  report labels** (2026-08-23, evening, for the session endings chart that
  came first: its categories must be the report's reasons for losing, word
  for word; refined from the fatal-action status to the loss type on
  2026-10-11, see "Loss types" below). One classifier, `lossKindOf`,
  produces both the report label and the session results' kind, so the two
  can never disagree. The five old ending names (`mine`, `chord`,
  `needless`, `forced`, `angel`) survive only as **legacy provenance**:
  losses imported from records that stored the old five-way verdict keep
  their old kind rather than having modern detail invented for them, and
  the report shows their old wording.
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
- Storage (see [Per-game stats](per-game-stats.md)): `actionEvaluations` on every new record.
  `justiceSaves` (the redraw count) was written only during part of
  2026-08-23 and is no longer recorded — see the player's-point-of-view
  directive above; old records keep it as an accepted historical field,
  but nothing displays it. Legacy `stupidDeath`, `deathKind`,
  `deathRisk`, and `deathBestRisk` fields are accepted only at the
  load/import boundary, converted immediately into a versioned action
  evaluation with explicit legacy provenance, deleted, and persisted
  back. Coarse old evidence is never upgraded by inventing detail.
- From 2026-08-23 to 2026-10-20 the left panel's session section had a
  **game endings** chart: one cumulative percent line per ending kind, with
  the wins' percent of mines unflagged and percent of placed flags unused
  drawn beside them. It left with the panel ([Session stats](session-stats.md)).
  Each kind's share of all of the board's games is now the session results'
  lifetime column ([Session summary](rankings.md#session-summary-requested-and-built-2026-10-07)),
  and the two marking lines are game data's unflagged mine share and unused
  flag share, per game ([Game data](game-data.md)).
- The session results use the page-wide `sessionDefinition`, set by the one
  picker in the settings row and shared with ranks won and game data;
  default today (since local midnight).
- `reportScope` is the single persistent “After each game, show me”
  setting (changes apply immediately) and is also available on the settings
  page. After a game, its control sits in “Overlays & display” for every
  scope, visible with everything else in that panel (the collapsed
  “Analysis & chart display” section was removed 2026-09-26; see
  [UI doctrine](ui-doctrine.md)). Below it the panel shows every
  result-section switch, including duplicate-tablechart grouping, in the
  same This game / Tables / This board / Charts groups as
  the settings page; changes persist and apply immediately without closing
  the panel. Charts and defaults remain unchanged:
  - `none` — **default for every new player** (decided 2026-09-26): no
    action report, mistake/category counts, or fatal-action mention;
    evidence is still stored;
  - `fatal` — wins show no analysis, losses show exactly the fatal action
    and its evidence;
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
- **Collection is independent of display.** `reportScope` filters only what
  is rendered. Every action is evaluated under the same rules in every scope,
  and every fatal or reportable evaluation is stored in
  `actionEvaluations`; session category totals are derived from that complete
  stored ledger. A clean nonfatal action is evaluated transiently but creates
  no report item.
- The five exclusive primary report item categories are:
  **Game loss** (every fatal action), **Game risk** (a survived action that
  increased actual death risk), **Time loss** (no progress, visible-state
  regression, or a win's unused correct mine mark), **Life maximization**
  (positive one-ply modeled-life gap), and **Measurement notes** (legacy,
  incomplete, newer, or otherwise unclassifiable evidence).
- The complete current mistake/evidence tag registry is:
  `opened-proven-mine`, `ignored-safe-move`, `guessed-with-safe-move`,
  `chose-higher-risk`, `chose-lower-modeled-life`,
  `flagged-proven-safe`, `removed-proven-mine-flag`,
  `chord-visible-contradiction`, `chord-wrong-flag-outcome`,
  `opened-unproven-with-safe-move`, `no-op-click`,
  `unused-correct-flag`, and `legacy-avoidable`. `no-op-click` further records
  why nothing changed: `chord-short-of-flags` (a chord tried before the
  number's last flag), `chord-nothing-to-open` (a finished number),
  `chord-too-many-flags`, `chord-over-covered` (both buttons released over a
  covered square), `left-clicked-flag`, or `flagged-revealed-cell`. Games
  recorded before 2026-09-26 night carry `chord-unavailable` for all four chord
  reasons. The after-game report counts each reason on its own line (for
  example "Chord clicks on numbers still short of flags: 26"), because the
  player's saved wins showed these two habits to be most of the clicks that
  change nothing (about 26 and 8 per Expert win); the short-of-flags line's
  detail names the 1.5 click, which removes that click. An action may carry
  several tags, but severity assigns it to one primary category so category
  totals never double-count it.
- Modern Game-loss items use one of nine fatal statuses:
  `mine-safe`, `mine-forced`, `proof-safe`, `proof-forced`, `guess-safe`,
  `guess-early`, `guess-higher`, `guess-min`, or `guess-unmeasured`;
  evidence-free losses are `unjudged`. Older imports may preserve the
  legacy `mine`, `chord`, `needless`, `forced`, or `angel` verdict as
  provenance. The status stays the technical classification (training
  reads it); the report and the session summary name the finer loss type
  below.

## Loss types (requested 2026-10-11)

The creator asked whether the game can tell apart a physical misclick, a
wrong mine flag followed by death, a guess that was truly forced, a forced
guess taken locally to save time, and a guess taken while a real move
existed, and asked for the session summary to break losses down by type.
The review found the fatal status already separated proven-mine clicks,
needless guesses, and forced-guess risk ranks, but filed every chord death
by its odds even though a chord death always proves a wrong flag, did not
say how hard the missed proof was, and caught only one misclick pattern.

Every modern loss now has exactly one **loss type**, a refinement of its
fatal status that uses only facts: the saved position, the solver's proof
tiers ([design axis](design-axis.md)), and the death itself. In order of
precedence:

1. **Wrong flag** (`flag-wrong`, "opened a mine that a wrong flag made
   look safe") — every chord death, and every reveal beside a number that
   already carried as many flags as its count. A chord opens only around a
   number whose flags match its count, and a number with all its flags
   declares its other squares safe, so opening a mine there proves one of
   those flags was on a safe square. In Proof-or-die, a chord over unproven
   squares is instead the mode's rule death (`proof-safe`/`proof-forced`),
   unless it opened a proven mine.
2. **Opened a proven mine**, graded by the easiest proof tier that proves
   it: `mine-counting` (counting single numbers), `mine-overlap` (comparing
   overlapping numbers), or `mine-whole-board` (only whole-board reasoning:
   every consistent layout, or the mine total).
3. **Guessed while a safe move existed**, graded by the easiest tier that
   proves any covered square safe: `guess-safe-counting`,
   `guess-safe-overlap`, `guess-safe-whole-board`; or `guess-safe-justice`
   when no square was proven safe but A Just Universe guaranteed a safe
   entry.
4. **Higher-risk forced guess**, graded by distance (squares in any
   direction, so a diagonal neighbor is 1): `guess-higher-near` when a
   lowest-risk square was within 2 squares of the chosen one,
   `guess-higher-far` when every lowest-risk square was 3 or more away —
   the local guess that saved travel.
5. Every other status is its own loss type: `guess-early`, `guess-min`
   (the truly forced guess at minimum risk), `guess-unmeasured`, and the
   Proof-or-die rule deaths. A refinable status whose record has no saved
   position keeps the status as its loss type.

The tiers are measured once, at the death, and stored on the fatal
evaluation's evidence as `mineProofTier` (when the opened square was a
proven mine) and `safeProofTier` (when any covered square was proven
safe), each `'counting'`, `'overlap'`, or `'whole-board'`. Losses saved
before 2026-10-11 gain them once from their saved position when history
loads, and the change is persisted (on the creator's history: 1,257
losses, about 0.2 s of work and an 11 MB rewrite, once). Measuring them at
read time instead cost about 50 ms per startup for the busiest week.
Chord deaths carry no tiers: their loss type is the wrong flag. A
positioned fatal action whose loss type needs a tier and lacks one is a
bug and fails loudly. The report's evidence lines name the tier ("selected
square was proven mined by counting single numbers"; "a square was proven
safe by comparing overlapping numbers"), and add a "Wrong flag" line for a
reveal beside a flag-satisfied number and a "Lowest-risk square: N squares
away" line for a higher-risk forced guess.

**Likely misclicks stay an overlay**, never a loss type (creator decision
2026-08-28): they are inferences about motor slips, not facts, so a loss
keeps its loss type and may also carry one or both reasons:

- `wrong-flag` — the captured `likely-misclick-after-wrong-flag` tag: a
  still-standing flag on a safe square, adjacent to the fatal square,
  placed under a second before the fatal action
  ([per-game stats](per-game-stats.md)).
- `wrong-button` (added 2026-10-11) — a left click on a proven mine under a
  second after a chord on an adjacent number did nothing because the
  number was still short of flags, with no input between them. The mine
  was one of that number's missing flags, so the player most likely meant
  to flag it. It is read from the saved ledger (the failed chord is the
  no-op entry with the previous action number), so it applies to every
  saved game. The report adds a "Likely misclick" line with the measured
  interval. Exactly 1,000 ms does not qualify, as for `wrong-flag`.

The session summary counts each reason on its own row. The session endings
chart's dashed "died: likely misclick" line, removed 2026-10-20, counted
losses with either reason.

What the evidence cannot separate: a guess taken "to save time" is visible
only as the distance to a lowest-risk square, not as intent, and a
minimum-risk guess at a forced position is `guess-min` whether or not the
player knew it was forced.

**Under review (creator request 2026-10-14):** a tree of results per board
type that makes the opening its own level and splits its guess deaths by risk
like any other, replacing the 2026-08-24 rule above that files every
forced-guess death in the opening as "early-game guess" whatever its risk.
On the creator's history, 222 of 233 such Beginner deaths chose a square
riskier than the safest one. The session summary's results tree already
splits them ("Session result kinds" below); the report still uses the
2026-08-24 rule. Proposed design and the history check:
[BACKLOG](../../BACKLOG.md), "Game results as one tree per board type".

## Win types (requested 2026-10-14)

The creator asked for the session summary to break down wins as well as
losses: "yes, there are types of wins, since sometimes you'll WIN by
accident! or even though you made horrible guesses and even unnece" (the
message was cut off there; "unnecessary guesses" is the likely end, and the
types below cover it).

Every win has exactly one **win type**, named by the worst guess it
survived. A guess is a click on a square that might hold a mine, after the
first click (the guess ledger's definition, [per-game stats](per-game-stats.md));
a chord is never one. Its risk is the actual risk under the active rules, the
same risk the Game risk category uses, so a guess that A Just Universe made
safe risked nothing. Worst first, the first that applies:

1. `win-guess-safe`, "won despite guessing while a safe move was
   available": a survived guess past a proven-safe square
   (`guessed-with-safe-move`, or `opened-unproven-with-safe-move` when the
   odds were unmeasured).
2. `win-guess-higher`, "won despite a higher-risk forced guess": a survived
   guess riskier than the lowest available, after the opening
   (`chose-higher-risk` at a tenth or more of the safe squares revealed).
3. `win-guess-early`, "won despite a higher-risk early-game guess": the
   same, in the opening only (the early-game line of the Early-game guess
   category above).
4. `win-guess-min`, "won guessing only at the lowest risk": the guess
   ledger counted guesses and none of them carries a tag above.
5. `win-no-guess`, "won without guessing": the ledger counted no guess.
   Every Proof-or-die win is this type, because the mode kills every
   unproven open.
6. `win-unmeasured`, "won; guesses not measured": the game has no guess
   ledger (recorded before the ledger, an Angelic game, or a guess whose odds
   exceeded the enumerator budget) and no tag above, or its action evidence
   predates the action evaluations and its ledger counted guesses.

The saved action evaluations keep every survived guess that was riskier than
necessary, and the ledger counts all guesses, so the type is derived at read
time for every saved win. The session summary files wins by these types
under its "won" branch ([Session summary](rankings.md), "Session results").
The proposed results tree
([BACKLOG](../../BACKLOG.md), "Game results as one tree per board type")
would refine the guess past a safe square by proof tier, as the loss types
do.

## Session result kinds (requested 2026-10-14)

The creator, of the session summary's flat list of win types and loss
types: "this display should be changed. 1. the division should be
multilevel. 1st split: wins/losses. 2. then within each cat, break them down
by the variety and type of worst offenses against perfect play." The session
summary's results tree ([Session summary](rankings.md), "Session results")
files every game under one **session result kind**, named by the game's
worst offense against perfect play. The offenses, least to worst:

1. none: no guess, or forced guesses only, each at the lowest risk;
2. a riskier guess than necessary;
3. a guess while a safe move was available;
4. opening a mine: through a wrong flag, or a proven mine.

A win's kind is its win type (above), which already names the worst guess it
survived. A loss's kind is its loss type, with two refinements:

- **An early-game guess death splits by risk rank**, as every other guess
  does: `guess-early-min` (the lowest risk available, no offense),
  `guess-early-higher` (a riskier square than necessary), or
  `guess-early-unmeasured`. The 2026-08-24 rule files every forced-guess
  death in the opening as one routine "early-game guess" whatever its risk;
  sorted by offense, that one kind hid the most common avoidable death. On
  the creator's 2026-10-11 export, 222 of 233 Beginner, 589 of 618
  Intermediate, and 896 of 978 Expert opening guess deaths chose a riskier
  square than the safest one. The report keeps the one early-game guess
  status; only the session results split it.
- **A survived guess worse than the fatal click files the loss under that
  guess**: `survived-guess-safe` when the game survived a guess past a
  proven-safe square and then died on a riskier forced guess or less;
  `survived-guess-higher` when it survived a riskier guess than necessary
  and then died on a lowest-risk or unmeasured forced guess. The fatal
  click is ranked by the list above: a lowest-risk forced guess 1, a
  riskier one 2, a guess past a safe square or a Proof-or-die rule death
  past a proven-safe move 3, a wrong flag or a proven mine 4; a forced guess
  of unmeasured risk counts as 1, since if it was riskier, the survived
  riskier guess was just as bad. An equally bad fatal click keeps its own
  kind, since it is itself an instance of the worst offense. The survived
  guesses are the same ones win types use (the same stored tags, so a guess
  A Just Universe made safe is no offense). On the 2026-10-11 export this
  moves 1 Beginner, 35 Intermediate, and 103 Expert losses.
- Proof-or-die's rule death with no proven-safe move, legacy verdicts, and
  unjudged losses are not ranked, so they keep their kinds.

Time-loss actions (no-op clicks, flags on proven-safe squares, unused
correct flags) are not on this ladder: the families name risk taken, so a
win with only time loss is still "no avoidable risk". Survived guesses past a
safe square carry no stored proof tier, so their leaf is not split by proof
(the backlog's "Loss-type follow-ons").

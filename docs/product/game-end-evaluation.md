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
    perfect. It draws on the endings chart as "percent of placed marks
    unused when winning" beside the unmarked-mines-at-win line; the /m
    and /game rate views remain as time and volume companions, and the
    game record shows the count with its share ("2 of 14 placed (14%)").
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
  view (the endings chart gains a matching muted-gold line).
- Evidence capture must never block play. Prover/enumerator failure is
  stored as unmeasured rather than filled with an invented conclusion.
- **Game-end feedback precedes result work** (decided 2026-08-29): once the
  ending action has been evaluated, a loss must reveal its mines, mark the hit
  cell, and show the dead face, while a win must complete its mine marks,
  counter, and cool face, in the current input turn. The outcome and exact
  final time appear immediately beside the completed board, with a quiet
  loading status beneath them. Only after that first paint may history
  cloning and persistence, final trace metrics, session-chart rebuilding,
  rankings, and the full post-game report begin.
  The immediate shell runs the same board-layout sync as the full result, so
  its one visible frame is already correctly placed. A throttled-frame
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
- Storage (see [Per-game stats](per-game-stats.md)): `actionEvaluations` on every new record.
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
  too). This win-only line is the positive marking-economy measure:
  a higher value means the player completed the board while placing marks
  on a smaller share of its mines. The separate unused-correct-mark measure
  is likewise win-only, but identifies marks that never enabled a chord.
  Wins backfill as wins; losses derive their line from the fatal action
  evidence; legacy losses retain their old line through provenance, and
  evidence-free losses are "unjudged loss".
- The session window uses the page-wide `sessionDefinition` chooser, shared
  with records won and game data; default last hour of wall-clock time.
  Aggregation lookbacks still use played time. See Session stats.
- `reportScope` is the single persistent “After each game, show me”
  setting (changes apply immediately) and is also available on the settings
  page. After a game, its control stays in the “Analysis & chart display”
  panel within “Overlays & display” for every scope. The
  panel also exposes all existing result-section switches, motion charts,
  and duplicate-tablechart grouping; changes persist and apply immediately
  without closing the panel. Charts and defaults remain unchanged:
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
  one of `chord-unavailable`, `left-clicked-flag`, or
  `flagged-revealed-cell`. An action may carry several tags, but severity
  assigns it to one primary category so category totals never double-count it.
- Modern Game-loss items use one of eight fatal statuses:
  `mine-safe`, `mine-forced`, `proof-safe`, `proof-forced`, `guess-safe`,
  `guess-higher`, `guess-min`, or `guess-unmeasured`; evidence-free losses
  are `unjudged`. Older imports may preserve the legacy `mine`, `chord`,
  `needless`, `forced`, or `angel` verdict as provenance.

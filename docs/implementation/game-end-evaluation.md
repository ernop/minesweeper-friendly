# Game-end evaluation — implementation notes

Spec: [docs/product/game-end-evaluation.md](../product/game-end-evaluation.md). Index: [AGENTS.md](../../AGENTS.md).

- Action evidence ([Game-end evaluation](../product/game-end-evaluation.md),
  "When it is judged"), in two parts since 2026-11-03:
  - At the click (the CAPTURE section of `game/evaluation.js`):
    `captureRevealAction`, `captureChordAction`, `captureFlagAction`, and
    `captureNoOpAction` save the visible board before mutation and what the
    click itself saw (first reveal, a chord's hit mines, a likely misclick,
    the board's progress); `recordActionEvaluation` sets the result and
    `traceDecision` puts the evaluation object in the trace. Nothing is
    proved or scored there. A Just Universe's certification and Angelic
    play's mine move stay on the click (`attemptJustice`, `game/play.js`),
    since they decide what the click opens. Compact no-op evaluations omit
    a board snapshot; only their trace copy gets one, for replay.
  - At game end, in the reports worker's `finished-game` job:
    `completeGameEvaluations({ events, justiceEnabled, guessLedger }, proofs)`
    judges each saved decision from its saved board with one
    `DuringGame.positionProofs()` store, the one the live perf charts' model
    then reads: `completeReveal` (facts, raw and active-rules risk,
    `bestActualRiskTaken`, one-move life, guess score via `Odds.scoreGuess`
    with the store's `oddsOf`), `completeChord`, `completeFlag`, the death's
    `fatalTiersOfProof`, the misclick count (`MISCLICK_MISTAKES`), the A Just
    Universe events (`justiceDetailOf`), and the guess ledger. Mistakes the
    proof finds go before those the click saw (`prependMistakes`). It stamps
    each judged decision's `oddsVersion` and `proofVersion` with the judging
    code's. The page applies the returned parts to its trace copy
    (`applyCompletedEvaluations`) and `completeGameRecord` sets the record's
    `misclicks`, `justice`, ledger fields, and `actionEvaluations`
    (`reportableEvaluations`: every decision with a death or a mistake).
    Each position's proof resumes from the previous board's facts, and
    reads back from the store's `groupCounts` every residual group of
    numbers whose exact constraints the game already counted
    (`Justice.proveLevels(view, clues, earlier, groupCounts)`;
    `tests/justice-test.js` 11c holds the result equal to a separate proof
    per level of the whole board).
  A thrown proof or odds error rejects the worker job; `analysisFailure`
  shows it and the game stays pending for the next load. Until 2026-11-03
  the `evaluate*Action` functions judged each click on the page thread
  before it changed the board; until 2026-10-21 each caught such an error,
  wrote "action evaluation failed" in the backup status line, and stored
  `factsMeasured: false`; the 2026-10-11 export holds no such record, so
  none had fired.
  Capture and `recordActionEvaluation` never consult `reportScope`; that
  setting gates only rendering through `reportCategoryEnabled` and
  `evaluationForReport`. Thus hidden fatal/reportable items still enter the
  canonical record and session summaries. Retrospective
  win-only `unused-correct-flag` entries follow the same rule and classify
  as `timeLoss`; losses create no such entry.
  `actionEvaluationCategory` assigns exactly one primary category in
  severity order (`gameLoss`, `gameRisk`, `timeLoss`,
  `lifeMaximization`, `measurementNotes`); actual-risk delta, not raw
  odds alone, determines survived game risk. The
  `chose-lower-modeled-life` tag alone files `lifeMaximization` (since
  2026-11-02: exact counts set the tag, so a gap can be below any decimal
  tolerance; the tag had been set only above a gap of 1e-9, which the
  category then checked again, so no saved action changes category).
  The game-risk check keeps its 1e-12 delta: until 2026-08-23 the risk
  tags were set from raw odds alone, so a protected guess can carry one
  with no actual risk. `actionCategorySummary`
  supplies category frequencies and magnitudes to session backfill.
  `reportableEvaluations` keeps every nonfatal tagged action and always the
  fatal one; the record holds only the versioned `actionEvaluations` array.
  `renderResult` puts `buildVerdictBlocks` in the full-width
  `#result-analysis` below the board (never the 320px stat sidebar), where
  each `.verdict-category` is an auto-fit grid of at least 400px columns;
  the builder groups each action once by primary category and obeys
  `settings.reportScope` through `reportScopeAllows`: none (new-player
  default), fatal-only, fatal+risk, or full. The settings page's
  `buildChoiceRow` renders the choice from `REPORT_SCOPE_CHOICES` (the
  schema entry's `choices`); the game page has no control for it since
  2026-10-21, when `buildReportScopeControl` and its copies in the display
  panel and above the trial review were removed.
  Every direct reveal is evaluated before opening whether or not the player
  ever flags or chords. `buildVerdictBlocks` returns `null` when no enabled
  category has content; it never manufactures an empty-success measurement
  note.
  `orderReportEntries` fixes section order at fatal, game risk, time loss,
  life maximization, then notes; survived game-risk actions sort by highest
  selected actual death probability, then excess risk, while other sections
  retain action order. Winning records use this same path and therefore
  show survived risky actions at risk/full scope without inventing a fatal block.
  Life-model secondary prose/alternatives appear only at full scope:
  below it `evaluationForReport`'s copy, without the
  `chose-lower-modeled-life` tag and the `higher-modeled-life-reveal`
  alternative, gives each block its title, prose, and diagram, while
  `buildVerdictBlocks` passes the saved evaluation to
  `actionEvaluationLines`, so the One-move life line states the saved
  verdict at every scope (`tests/game-end-evaluation-test.js`, the
  2026-11-07 Intermediate position).
  `aggregateReportEntries` collapses semantically identical
  positionless entries into reason-specific counts while positioned
  entries stay individual. `actionEvaluationLines` turns positioned
  reports into compact labeled difference/value rows, merging identical
  raw/active risk and stating model ties once. `evaluationCropBounds`
  excludes large alternative sets from its bounds and crops uniform
  covered remainder to visible/flagged/selected/trigger cells plus two
  context cells; `buildEvaluationPosition` labels and draws that source
  range without revealing hidden mines. Trial result payloads copy the ledger, and
  `renderTrialReview` exposes the same blocks under each run's nested
  action report. `fatalActionStatusKind` is the technical fatal-action
  status (training's avoidable kinds read it). `lossTypeOf` refines it into
  the loss type ([spec](../product/game-end-evaluation.md#loss-types-requested-2026-10-11)),
  memoized per evaluation object in a WeakMap: `refinedLossType` checks a
  Proof-or-die chord (saved games of that removed mode), then the wrong flag (`besideFlagSatisfiedNumber` on
  the saved position, or any chord), then the stored tier
  (`storedProofTier` throws when a positioned fatal action lacks it), then
  `nearestLowestRiskDistance` against `LOWER_RISK_NEAR_SQUARES` (2). The
  report's death label is `LOSS_TYPE_LABELS[lossTypeOf(...)]`, and
  `lossKindOf` returns the same kind for the session results (legacy
  records keep their stored five-way verdict as provenance), so their rows
  and the report's wording can never disagree; it was `sessionEndingKind`,
  serving the session endings chart, until 2026-10-20. `fatalProofTiers`
  measures `mineProofTier` and `safeProofTier` with `easiestProofTier`
  (Justice.proveFacts with the counting level's options, then the overlap
  level's, from `Justice.DEDUCTION_LEVELS`, else whole-board; it stops at
  the first level proving the square, so it does not search when a rule
  proves it) and returns only the tiers an evaluation lacks;
  `normalizeGameRecord` adds them once to older losses (a fresh evaluation
  object, so the change persists). A new death's tiers come from its
  board's proof levels at game end (`fatalTiersOfProof`). `likelyMisclickReasonsOf` combines the
  captured wrong-flag tag with `wrongButtonEvidenceOf` (the ledger's no-op
  `chord-short-of-flags` entry with the previous action number, on a number
  adjacent to the opened proven mine, `0 <= gap < LIKELY_MISCLICK_MAX_MS`).
  `fatalEvidenceLines(fatal, ledger)` adds the Wrong flag, Lowest-risk
  square, and wrong-button Likely misclick lines, which `buildVerdictBlocks`
  passes to `actionEvaluationLines` as `extraLines`; the Certainty and Safe
  alternative lines name the stored tier (`PROOF_TIER_PHRASES`).
  `winTypeOf(record)` (2026-10-14; [spec](../product/game-end-evaluation.md#win-types-requested-2026-10-14))
  sits after `lossKindOf` in the pure verdict span: a saved Proof-or-die
  win is `win-no-guess`; any legacy or other-version evaluation leaves only the
  ledger's `guesses === 0`; otherwise `worstSurvivedGuess(evaluations)`
  (the stored `guessed-with-safe-move` / `opened-unproven-with-safe-move`
  tags as 'safe', then `chose-higher-risk` split by `evaluationIsEarlyGame`
  into 'higher' and 'early'; fatal evaluations skipped), then
  `record.guesses` decide. A win guessing only at the lowest risk is split
  by `oneMoveKind('win-guess-min', record)`: `-best` when
  `everyGuessBestOneMove` (every guess `guessPerfect`), the bare kind when
  not, `-unrated` when the ledger's `oddsVersion` is not in
  `EXACT_ONE_MOVE_LEDGERS` (only `guess-ledger-v3` counts exactly).
  `WIN_TYPE_LABELS` holds the win types in order,
  cleanest first. Its known answers are in
  `tests/game-end-evaluation-test.js`.
  `sessionResultKind(record)` (2026-10-14; [spec](../product/game-end-evaluation.md#session-result-kinds-requested-2026-10-14))
  follows: a win's `winTypeOf`; a loss's `lossKindOf`, with
  `guess-early` split by `evaluationRiskDelta` into `guess-early-min`,
  `guess-early-higher`, or `guess-early-unmeasured`; then, for kinds in
  `FATAL_OFFENSE_RANKS`, `worstSurvivedGuess` ranked by
  `SURVIVED_GUESS_RANKS` replaces a lower-ranked fatal kind with
  `survived-guess-safe` or `survived-guess-higher`; a `guess-min` that
  stays is split by `oneMoveKind` like a win. The session summary
  counts these (`docs/implementation/rankings.md`, "Session results").
  `evaluationEndingKind` remains only as
  the old five-way view for the report's legacy labels and verdict
  styling; modern chords classify
  by proven/needless/forced mine-opening evidence, while only legacy chord
  provenance keeps the dedicated chord line. `normalizeGameRecord`
  runs inside history load and import: it converts `stupidDeath`,
  `deathKind`, `deathRisk`, and `deathBestRisk` to an explicitly
  provenance-marked fatal evaluation, deletes all four fields, and causes
  normalized history to be persisted. `proofCorrectedEvaluation`, which
  re-proved saved-position entries carrying `opened-unproven-with-safe-move`
  on every load, was removed on 2026-10-11 (see the spec). A pre-ledger win becomes a
  `pre-action-evaluation-coverage` measurement note instead of an
  invented clean ledger. Runtime code never reads the old fields.

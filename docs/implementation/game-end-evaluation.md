# Game-end evaluation — implementation notes

Spec: [docs/product/game-end-evaluation.md](../product/game-end-evaluation.md). Index: [AGENTS.md](../../AGENTS.md).

- Action evidence ([Game-end evaluation](../product/game-end-evaluation.md)):
  `evaluateRevealAction`, `evaluateChordAction`, `evaluateFlagAction`, and
  `evaluateNoOpAction`
  capture the visible board before mutation, independent mistake tags,
  chosen/best raw and protection-aware actual risk, one-ply expected-life
  values, no-op reason, and highlighted alternatives. Compact no-op
  evaluations deliberately omit a board snapshot.
  Capture and `recordActionEvaluation` never consult `reportScope`; that
  setting gates only rendering through `reportCategoryEnabled` and
  `evaluationForReport`. Thus hidden fatal/reportable items still enter the
  canonical record and session summaries. Retrospective
  win-only `unused-correct-flag` entries follow the same rule and classify
  as `timeLoss`; losses create no such entry.
  `actionEvaluationCategory` assigns exactly one primary category in
  severity order (`gameLoss`, `gameRisk`, `timeLoss`,
  `lifeMaximization`, `measurementNotes`); actual-risk delta, not raw
  odds alone, determines survived game risk. `actionCategorySummary`
  supplies category frequencies and magnitudes to session backfill.
  `recordActionEvaluation` keeps every nonfatal tagged
  action; `lose(hitIndices, evaluation)` always keeps the fatal action.
  `reportResult` writes only the versioned `actionEvaluations` array.
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
  Life-model secondary prose/alternatives appear only at full scope.
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
  Proof-or-die chord, then the wrong flag (`besideFlagSatisfiedNumber` on
  the saved position, or any chord), then the stored tier
  (`storedProofTier` throws when a positioned fatal action lacks it), then
  `nearestLowestRiskDistance` against `LOWER_RISK_NEAR_SQUARES` (2). The
  report's death label is `LOSS_TYPE_LABELS[lossTypeOf(...)]`, and
  `lossKindOf` returns the same kind for the session results (legacy
  records keep their stored five-way verdict as provenance), so their rows
  and the report's wording can never disagree; it was `sessionEndingKind`,
  serving the session endings chart, until 2026-10-20. `fatalProofTiers`
  measures `mineProofTier` and `safeProofTier` with `easiestProofTier`
  (Justice.proveFacts with counting only, then with overlaps, else
  whole-board) and returns only the tiers an evaluation lacks;
  `recordActionEvaluation` stores them on a death, and
  `normalizeGameRecord` adds them once to older losses (a fresh evaluation
  object, so the change persists). `likelyMisclickReasonsOf` combines the
  captured wrong-flag tag with `wrongButtonEvidenceOf` (the ledger's no-op
  `chord-short-of-flags` entry with the previous action number, on a number
  adjacent to the opened proven mine, `0 <= gap < LIKELY_MISCLICK_MAX_MS`).
  `fatalEvidenceLines(fatal, ledger)` adds the Wrong flag, Lowest-risk
  square, and wrong-button Likely misclick lines, which `buildVerdictBlocks`
  passes to `actionEvaluationLines` as `extraLines`; the Certainty and Safe
  alternative lines name the stored tier (`PROOF_TIER_PHRASES`).
  `winTypeOf(record)` (2026-10-14; [spec](../product/game-end-evaluation.md#win-types-requested-2026-10-14))
  sits after `lossKindOf` in the pure verdict span: Proof-or-die is
  `win-no-guess`; any legacy or other-version evaluation leaves only the
  ledger's `guesses === 0`; otherwise `worstSurvivedGuess(evaluations)`
  (the stored `guessed-with-safe-move` / `opened-unproven-with-safe-move`
  tags as 'safe', then `chose-higher-risk` split by `evaluationIsEarlyGame`
  into 'higher' and 'early'; fatal evaluations skipped), then
  `record.guesses` decide. `WIN_TYPE_LABELS` holds the win types in order,
  cleanest first. Its known answers are in
  `tests/game-end-evaluation-test.js`.
  `sessionResultKind(record)` (2026-10-14; [spec](../product/game-end-evaluation.md#session-result-kinds-requested-2026-10-14))
  follows: a win's `winTypeOf`; a loss's `lossKindOf`, with
  `guess-early` split by `evaluationRiskDelta` into `guess-early-min`,
  `guess-early-higher`, or `guess-early-unmeasured`; then, for kinds in
  `FATAL_OFFENSE_RANKS`, `worstSurvivedGuess` ranked by
  `SURVIVED_GUESS_RANKS` replaces a lower-ranked fatal kind with
  `survived-guess-safe` or `survived-guess-higher`. The session summary
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

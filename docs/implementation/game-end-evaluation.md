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
  `settings.reportScope` through `reportScopeAllows`: none, fatal-only
  (new-player default), fatal+risk, or full. `buildReportScopeControl`
  renders in the display options, or above the report for trial review,
  and re-renders immediately; the
  settings page shares `REPORT_SCOPE_CHOICES`.
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
  action report. `fatalActionStatusKind` is the single fatal-action
  classifier: `fatalActionStatusLabel` looks its kind up in
  FATAL_STATUS_LABELS for the report, and `sessionEndingKind` returns
  the same kind for the endings chart (legacy records keep their stored
  five-way verdict as provenance), so chart categories and report
  wording can never disagree. `evaluationEndingKind` remains only as
  the old five-way view for the report's legacy labels and verdict
  styling; modern chords classify
  by proven/needless/forced mine-opening evidence, while only legacy chord
  provenance keeps the dedicated chord line. `normalizeGameRecord`
  runs inside history load and import: it converts `stupidDeath`,
  `deathKind`, `deathRisk`, and `deathBestRisk` to an explicitly
  provenance-marked fatal evaluation, deletes all four fields, and causes
  normalized history to be persisted. `proofCorrectedEvaluation` also
  reruns saved-position entries carrying the old
  `opened-unproven-with-safe-move` tag; a complete proof that the selected
  cell was safe removes and persists that obsolete tag. A pre-ledger win becomes a
  `pre-action-evaluation-coverage` measurement note instead of an
  invented clean ledger. Runtime code never reads the old fields.

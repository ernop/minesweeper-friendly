# Game-end evaluation

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/game-end-evaluation.md](../implementation/game-end-evaluation.md).

## Goal and execution model

Evaluate every board-changing action, fatal action, and classified no-op against the exact position visible immediately before it, storing an independent multi-dimensional evidence ledger (`actionEvaluations`, `proofVersion: "all-consistent-layouts-v1"`) so nonfatal mistakes survive into post-game review without conflating separate facts or blocking gameplay.

- **Zero evaluation during play:** clicks record only what happened and the pre-click visible board in the raw input trace; no proving or guess scoring runs on clicks (only Guardian Angel's rule check and Angelic's mine relocation run live, since they govern what opens).
- **Immediate visual game-end feedback:** on the ending click, mines/hit square/dead face (or completed flags/counter/cool face) paint in the same input turn so the last click feels as responsive as any other. The outcome and final time appear beside the board one frame later with a quiet loading status; only after that second paint do record/trace persistence, worker evaluation, and results begin. Subsequent player input, tab hiding, or unload flush finalization immediately so finished games are never lost.
- **Off-thread incremental judgment and crash safety:** after game end, `analysis-worker.js` evaluates every saved decision off the main thread — proving each board once (shared with [live perf charts](during-game.md)), continuing incrementally from previous proofs and skipping unchanged frontier components. Finished games and traces save immediately marked pending, then save again complete in finish order. Pending games remain excluded from displayed history, archive, training, and exports until complete; reloading finishes any pending games before rendering.
- **Exact proofs and loud errors:** since `2026-11-02`, proofs and odds count every layout with no work limit so every new action is measured (earlier records that hit a work limit stay explicitly unmeasured and never generate unproven criticisms). Any solver or odds exception halts judgment and surfaces in the error bar rather than degrading silently.

## Independent evidence dimensions and tag registry

Every evaluated action preserves independent facts together rather than collapsing them into one label:

- **Action and outcome:** reveal, chord, flag placement/removal, or historical Proof-or-die open (mode removed `2026-10-21`; saved records still judge under its rules); continued play or death.
- **Visible certainty:** selected square proven safe, proven mine, or uncertain.
- **Necessity:** whether any guaranteed-safe reveal existed elsewhere. **Needless guess** means strictly revealing an uncertain positive-risk square while at least one zero-risk reveal was available.
- **Raw risk quality:** chosen mine probability, lowest available mine probability, and whether the minimum was chosen.
- **Actual risk under active rules:** chosen and best immediate loss probability after Guardian Angel or Angelic protection (raw risk neutralized to `0` is never called game-risking).
- **One-move modeled quality:** chosen and best exact expected remaining life (`(1 − p_die) × (1 − E[min next risk])`, exact since `2026-11-02`). Explicitly model-relative (including sea-vs-frontier comparisons), never presented as long-horizon optimality or player intent.
- **Mechanical contradictions:** proven-safe flag, removal of a proven-mine flag, visible chord contradiction, or wrong-flag chord established by fatal outcome.
- **No-progress input (`no-op-click`):** omits full board snapshots to avoid bloating history; records exact sub-reason: `chord-short-of-flags`, `chord-nothing-to-open`, `chord-too-many-flags`, `chord-over-covered`, `left-clicked-flag`, or `flagged-revealed-cell` (pre-`2026-09-26` night records carry combined `chord-unavailable`). Report counts each reason on its own line (with the short-of-flags detail noting the 1.5 click).
- **Unused correct mark (wins only):** a player-placed flag sitting on a mine when removed or at win without ever contributing to an accepted chord (per placement/removal episode; unmeasured on losses whose future was cut short). Observable proxy for no chord use, not a claim about mental use. Primary calibration is the dimensionless share of placed flags unused (`unusedCorrectFlags / flagsPlaced`; markless wins stay unmeasured rather than `0%`).
- **Combined facts preserved:** clicking a proven mine while a safe move is open records **both** `opened-proven-mine` and `ignored-safe-move`. Chording is an input method whose opened squares receive standard risk/proof classification alongside wrong-flag death attribution.
- **Tag registry:** `opened-proven-mine`, `ignored-safe-move`, `guessed-with-safe-move`, `chose-higher-risk`, `chose-lower-modeled-life`, `flagged-proven-safe`, `removed-proven-mine-flag`, `chord-visible-contradiction`, `chord-wrong-flag-outcome`, `opened-unproven-with-safe-move`, `no-op-click`, `unused-correct-flag`, `legacy-avoidable`.
- **Modern fatal statuses (9):** `mine-safe`, `mine-forced`, `proof-safe`, `proof-forced`, `guess-safe`, `guess-early`, `guess-higher`, `guess-min`, `guess-unmeasured` (plus `unjudged` and legacy provenance `mine`, `chord`, `needless`, `forced`, `angel`).

## Exclusive report taxonomy, scopes, and presentation

**Collection is independent of display:** every action evaluates and stores into `actionEvaluations` under the same rules regardless of display scope. `reportScope` (configured solely on the settings page; default `none` for new players) filters rendering:

- `none` — no action report, category counts, or fatal-action block (evidence still stores).
- `fatal` — fatal action and its evidence on losses only; nothing on wins.
- `risk` — fatal action plus earlier survived actions that added actual death probability (including early-game guesses).
- `full` — all of `risk` plus time loss, life maximization, measurement notes, category counts, and nonzero excess-risk / modeled-life-gap magnitudes.

Each reportable evaluation appears **once**, under its highest-severity exclusive category (while lower tags remain on its evidence):

1. **Game loss** — every fatal action (stating outcome, not blame; lowest-risk forced deaths belong here too). A forced-guess death with `< 10%` of safe squares revealed files under the calm status **`died on an early-game guess`** (below `full` scope: one calm sentence with no risk table or diagram; `full` keeps all measurements). Guessing past a proven-safe square stays `"died after guessing while a safe move was available"` at every stage.
2. **Game risk** — survived action adding actual immediate death probability at `>= 10%` safe squares revealed. Sorted by actual death probability descending, then excess risk.
3. **Early-game guess** — survived action that would be game risk taken under `10%` safe squares revealed (`evidence.boardProgress`). Reported after game risk at `risk` scope and excluded from excess-game-risk magnitude.
4. **Time loss** — no-progress input, proven-safe flag, proven-mine flag removal, nonfatal visible chord contradiction, or win's unused correct flag (retains action order; measures classified actions without inventing seconds).
5. **Life maximization** — otherwise-lower-severity action where exact one-move survival model found higher expected remaining life elsewhere (retains action order).
6. **Measurement notes** — legacy or incomplete evidence that cannot be classified further without guessing, plus the factual Guardian Angel recap.

### Report rendering and Guardian Angel recap

- **Layout:** centered column below the board and above rankings/charts; emits no `"nothing recorded"` placeholder when no action qualifies under the active scope. Trial runs nest their per-run report inside a disclosure under each run.
- **Compact facts and diagrams:** each block leads with labeled facts (`Immediate risk`, `Safe alternative`, `One-move life`, etc.), collapsing equal raw/active risks into one line. `One-move life` always states the comparison against the best available square at every scope (reading `"tied"` strictly when no better square existed). Pre-action board diagrams crop to revealed/flagged/selected/trigger squares plus 2 cells of context (labeling original row/column bounds, ignoring large alternative sets when sizing): selected red, safe green, lower-risk/higher-life blue, flag corrections orange. Non-diagram identical no-ops and `"Flagged a proven-safe square"` aggregate by count (with expandable diagrams for flagged-safe entries).
- **Guardian Angel recap (strict player POV):** whenever Guardian Angel intervened (win or loss), a block states the count (`once`, `twice`, `N times`) — `"Your Guardian Angel intervened <count> to keep you safe: every click into a guess that nothing else on the board could ever settle is guaranteed safe."` — with one plain-language line per event (`#1: a 50/50`, `a chain of 50/50s over 6 squares`, `1 mine among 3 squares (2 in 3 safe)`, `— kept safe by Guardian Angel.`). Never records, reveals, or hints at whether mines actually moved (`justiceSaves` from `2026-08-23` is accepted on read only, never written or shown).
- **Legacy normalization:** `stupidDeath`, `deathKind`, `deathRisk`, and `deathBestRisk` convert at load/import into legacy-provenance evaluations and are deleted; modern detail is never fabricated for coarse legacy records.

## Loss types

One canonical classifier (`lossKindOf`) produces both the report's loss label and the session breakdown's leaf so the two can never disagree. Proof tiers map [design axis](design-axis.md#deduction-levels) levels 1 and 2 (`counting`, `overlap`) and combine levels 3–4 into `whole-board`. In order of precedence:

1. **Wrong flag (`flag-wrong`):** every chord death, and every reveal beside a number already carrying as many flags as its count (except a Proof-or-die rule death on unproven squares that did not hit a proven mine).
2. **Opened a proven mine**, by easiest tier proving it: `mine-counting`, `mine-overlap`, or `mine-whole-board`.
3. **Guessed while a safe move existed**, by easiest tier proving any square safe: `guess-safe-counting`, `guess-safe-overlap`, `guess-safe-whole-board`, or `guess-safe-guardian-angel` (no square proven safe, but Guardian Angel guaranteed a safe entry).
4. **Higher-risk forced guess**, by Chebyshev distance to nearest lowest-risk square: `guess-higher-near` (`<= 2` squares) or `guess-higher-far` (`>= 3` squares — local guess saving travel).
5. **Other statuses keep their own kind:** `guess-early`, `guess-min`, `guess-unmeasured`, Proof-or-die rule deaths (or unrefined status when a record lacks a saved board).

Proof tiers (`mineProofTier`, `safeProofTier`) measure once at death and persist (pre-`2026-10-11` losses migrated once on load; a positioned fatal action missing a required tier fails loudly).

- **Likely misclicks stay an overlay** (never a loss type, because motor slips are inferred rather than proven):
  - `wrong-flag` (`likely-misclick-after-wrong-flag`): standing flag on an actually safe cell, 1 square away from the fatal square, placed strictly `< 1,000 ms` earlier (input-event timestamps).
  - `wrong-button`: left click on a proven mine strictly `< 1,000 ms` after a `chord-short-of-flags` no-op on an adjacent number with no intervening input (derived from the saved ledger across all games).

## Win types and session result kinds

Every finished game maps to one leaf in the [session results partition](rankings.md#session-summary-and-results-partition), ordered by worst offense against perfect play: `(1)` no avoidable risk → `(2)` riskier guess than necessary → `(3)` guess past a safe move → `(4)` opening a mine (wrong flag or proven mine). Time-loss actions do not climb this risk ladder.

### Win types (worst survived guess under active rules; chords are never guesses)

1. `win-guess-safe` — survived a guess past a proven-safe square.
2. `win-guess-higher` — survived a higher-risk forced guess at `>= 10%` safe squares open.
3. `win-guess-early` — survived a higher-risk forced guess in the opening (`< 10%` safe open).
4. Lowest-risk forced guesses only, split by exact one-move choice: `win-guess-min-best` (`guessPerfect === guesses`), `win-guess-min` (not every guess best one-move), or `win-guess-min-unrated` (pre-`guess-ledger-v3` approximate ledger).
5. `win-no-guess` — zero guesses on the ledger.
6. `win-unmeasured` — missing guess ledger (pre-ledger, Angelic, or pre-`2026-11-02` over-budget) with no worse tag above.

### Loss refinements in the session partition

A loss's session result kind is its loss type with three refinements (unranked Proof-or-die rule deaths with no safe move, legacy verdicts, and unjudged losses keep their kinds):

- **Post-opening lowest-risk forced death splits by one-move choice:** `guess-min-best`, `guess-min`, or `guess-min-unrated` (mirroring lowest-risk wins).
- **Opening forced-guess death splits by risk rank:** `guess-early-min`, `guess-early-higher`, or `guess-early-unmeasured` (while the post-game report keeps the calm single `guess-early` status).
- **Worse survived guess supersedes a milder fatal click:** `survived-guess-safe` (survived a guess past a safe square, then died on a riskier forced guess or less) or `survived-guess-higher` (survived a riskier guess than necessary, then died on a lowest-risk or unmeasured forced guess). An equally severe fatal click keeps its own kind.

### Why `"riskier than necessary"` stays strict

A guess with higher immediate mine risk than the safest square under active rules remains `"riskier than necessary"` even if it achieves the best one-move life. Empirical evaluation on 145 exact-win-chance positions showed that excusing riskier best-one-move guesses traded one gain for one error while blurring the definition of lowest immediate risk; lowest-risk guesses already split cleanly by one-move optimality.

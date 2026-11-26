# Play modes

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/play-modes.md](../implementation/play-modes.md).

## Choosing a mode and score isolation

Play mode is a second uniqueifier beside board dimensions and generator: every mode stores history and rankings under its own key (`WxH/M@<playMode>`), so wins in different modes never mix.

- **One-click presets:** **Beginner**, **Intermediate**, and **Expert** are complete choices (preset board, `Standard` mode, default generator) showing zero extra setup controls above the board.
- **Flat `other modes` menu:** `Custom` (`Standard` on player-chosen dimensions) and every alternate mode live directly in one flat dropdown beside the presets — never split across redundant mode + variant menus ([Board and layout](board-and-layout.md#navigation-and-progressive-disclosure)). Selecting any entry switches to the player's custom dimensions and reveals one `#mode-options` row holding dimensions, generator (where applicable), and mode progress.

## Active play modes

### Standard
First-click-safe random play. Guardian Angel applies (frozen from the setting at first click or given opening).

### 3BV countdown (`pregen-10-3bv-desc`)
Generates ten independently seeded first-click-safe candidates through the chosen generator with the upper-right cell safe, ranks them by descending 3BV (generation order breaks ties), and deals all ten in order (starting a fresh batch after ten).

- The upper-right square opens automatically without counting as a player click; the timer starts after generation. `#mode-options` shows batch progress and board 3BV. Guardian Angel and guess measurement follow Standard rules.
- **Persistent challenge display below the board:** a `challenge progress` table (`run`, `3BV`, `time` — completed facts only, no second live timer, latest completed run highlighted in `--this-game` light blue) precedes two persistent 3BV → solve-time scatters (`this challenge` since batch creation and `whole day` since local midnight), using standard relationship-chart grammar with fixed waiting frames until two wins exist.

### Angelic (`angelic`)
The full angelic dual of Kaboom ([Design axis](design-axis.md)): any reveal or chord square not proven to be a mine is made safe; you die only by contradicting visible facts (clicking a proven mine). Guardian Angel and the guess ledger do not apply here because unproven clicks cannot kill.

### Endgame drill (`endgame-drill`)
Fast, repeatable pure-deduction training on realistic late-game remnants (`endgame.js`).

- Generates a full board through the chosen generator, then reveals every safe cell except a border-flush remnant pocket enforcing opening closure (no revealed zero keeps a covered neighbor) with `4–45` covered safe cells, `>= 1` mine, `>= 1` covered numbered safe cell, and exact solver proof that the entire remnant finishes by pure deduction (exhausting the sampling budget fails loudly).
- Timer starts on first input; each seed replays the full board and window search.
- Records store **remaining 3BV** as `bv3` (keeping `3BV/s`, `efficiency`, and same-3BV tables honest within the mode), omit full-board `zini`/`hzini`/`STNB`, keep the guess ledger active (every guess is unforced), and show `"N safe cells left · remaining 3BV M"` in `#mode-options`.

### Coaching practice modes (`coach-*`)
Four one-level-deep practice entries stored under separate `@coach-*` keys (never mixing with Standard rankings), carrying a `coach` counter block per record with Guardian Angel and guess measurement enabled:

- **Coach: No-waste (`coach-no-waste`):** cues no-op clicks (with reason), 1-cell-only/unused flags, and 1-cell chords (calling out opening-rim 1-cell chords); tracks 1.5-click short-range flag→chord pairs; offers an optional per-board **Flag cap** (`unlimited`, `50`, `35`, `20`, `0 (no flags)`) in `#coach-bar`.
- **Coach: Early bail (`coach-early-bail`):** runs off-frame local counting/overlap analysis; when local easy work runs out while easy moves exist elsewhere, arms a configurable **Bail cue** timer (`300`, `450` default, `600`, `800 ms`) and highlights the nearest easy cluster if lingering, tracking fast bails vs. nudges, local blind spots (`550 ms`), and queued lookahead moves (`<= 220 ms`).
- **Coach: Scan shield (`coach-scan-shield`):** intercepts unproven left-click reveals while a proven-safe square exists elsewhere (and clicks on proven mines), flashing missed safe squares instead of ending the run while letting genuine forced guesses proceed; warns on provably wrong or overflagging flags before chording; notes numbered starts (`Space` to restart).
- **Coach: Full mix (`coach-full`):** runs No-waste, Early bail, and Scan shield together.
- **Shared coach features:** captures slow overlap-tier hesitations (`>= 450 ms`) by pattern family (`1-2 interior`, `1-2 on wall`, `1-1 interior`, `1-1 on wall`, `overlap chain`), prompts for a fresh state tag check-in if none occurred within `30 min`, and displays a post-game **Coach recap** with one-click replay jumps. Planned revisions (removing target-cell hints in Early bail, Scan shield `+20 s` discipline penalty, exhaustive `4/5/6/7` priority) are tracked in [BACKLOG.md](../../BACKLOG.md#training-coaching-and-mind-map).

### Trial (`trial`), Short trial (`short-trial`), and Test trial (`test-trial`)
Repeated hidden-board identity experiments (`25×4 = 100`, `4×4 = 16`, and `1×4 = 4` games), each stored under its own mode key and excluded from Standard charts/streaks.

- Starts from a centered lobby (`Start trial`). Layouts are pre-fixed, so an ungiven first click on a mine can kill (`trialGiveOpening`, default off, restores a predetermined opening and subtracts `givenOpeningBv3` from 3BV performance metrics; [Per-game stats](per-game-stats.md)).
- Shuffled presentations separate repeat meetings of the same board identity across four distinct dihedral orientations (`identity`, `180°`, and flips on rectangles; a subset of all eight on squares). Progress displays `n / total` with `end trial`; restarting mid-game skips the current slot; leaving mode/size discards an active session. Guardian Angel follows the user setting.
- **After-trial review:** hides the board, leads with later-vs-first summary comparison, meeting-index bars (mean win time, `3BV/s`, win rate; light gold = first meeting, dark brown = last), and `Start another trial` (briefly inert against trailing clicks). Per-identity cards auto-open on losses, large first-to-last swings, or single-board trials, displaying attempt charts and inverse-isometry overlaid traces (open squares, remaining safe squares, flags, unmarked mines, cursor path, speed with bucket slider, and aligned cursor coordinates).

### Board lab (`board-lab`)
Non-play generator explorer: deals fully revealed boards immediately (safe cells open, every mine flagged for visibility, LCDs at `0`), ignores cell input, records nothing, hides `see scores`, and shows generator parameter sliders + `make new board` beneath `#mode-options` (parameter changes persist for play modes; titlebar/Space deals fresh boards).

## Removed no-guess modes (legacy history compatibility)

`Uniform NG`, `Single-path NG`, and `Proof-or-die` were removed on `2026-10-21` because their generate-and-reject generator failed reliably at Expert and skewed Single-path boards toward trivial openings.

- **Preserved history:** saved records retain their mode keys, labels, history lists, exports/imports, and Proof-or-die verdicts (`REMOVED_PLAY_MODES`). No new game can start in these modes; stored settings naming one default to `Standard`, and preference imports naming one fail validation.
- **Standing rule for any future NG generator:** ship one constructive technology that works reliably across every board size — never a primary method backed by a fallback generator.

## Visible-information solver

`GuardianAngel.proveFacts` is the canonical exact proof engine shared by Angelic, Endgame drill, misclick classification, guess scoring, live perf charts, and action evaluation. It reads only revealed numbers, covered-cell indices, board dimensions, and total mine count (flags are player annotations, never proof; hidden mines are never consulted).

- **Stages (`GuardianAngel.proveLevels`):** closes single-number counting (level 1) and pairwise overlap differences (level 2), then partitions the remaining frontier into connected components, merges squares beside identical open numbers, and counts layouts via frontier dynamic programming without enumerating individual layouts — first per component (`all numbers`, level 3) and then joined through the board mine total (`mine total`, level 4; [Design axis](design-axis.md#deduction-levels)).
- **Unlimited exact proofs (`2026-11-02` onward):** full proofs and one-move odds scoring run with no work limit, scaling with frontier width rather than total layout count (`complete: true` on every full proof; only counting/overlap prepasses report incomplete). Identical visible positions reuse the last exact proof. Pre-`2026-11-02` saved records that hit the former `2,000,000`-node work limit stay explicitly marked incomplete rather than generating unproven criticisms.

# Guardian Angel

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/guardian-angel.md](../implementation/guardian-angel.md).

## Goal and player-facing rule

A solver-aware rule on the angelic end of the [design axis](design-axis.md): players can lose to their own choices and to diffuse open-field gambles, never to a structurally unresolvable forced guess.

- **Exact player-facing definition:** **when you click a square in a guess that nothing else on the board could ever settle, that square is guaranteed safe.**
- **Player words only:** player-facing copy describes qualifying guesses as `"a guess that nothing else on the board could ever settle"`, `"a 50/50"`, `"a chain of 50/50s"`, `"1 mine among 3 squares"`, and `"the last squares no number touches"` — never internal solver terms (`pocket`, `sealed`, `certified`, `bare click`, `sea remnant`; [UI doctrine](ui-doctrine.md#numbers-labels-and-visual-clarity)). Below, *group* is spec shorthand only.

## Exact qualification rules (`guardian-angel-v4`)

A covered *group* qualifies when it has `>= 2` valid mine layouts, all with the same mine total, such that every possible observation outside the group is identical across layouts (de re structural necessity: winning requires clicking into this group, every square inside is ambiguous with identical odds, and no information outside can ever settle it).

- **Scope:** applies in `Standard`, `3BV countdown`, `Coach:*`, and `Trial` modes when enabled (`guardianAngel` setting, default on; frozen at first reveal and unlocked on game end/restart). Off in `Angelic` (which already protects every non-proven-mine click).
- **Plain clicks only — never chords:** chords never receive protection, even when opening one square, because flags are unsupported player claims. Proven-safe, proven-mine, and open-field guesses never qualify.
- **Deterministic exact v1 families (judged per group from visible numbers + global mine count before consulting hidden mines, with unlimited exact pre-proofs and zero model enumeration):**
  1. **`k`-of-`n` groups:** pinned mine count (directly or after subtracting already-pinned groups) where every touching number sees all squares in the group identically (e.g., `1 mine among 3 squares`), even when a shared number touches other unknown groups.
  2. **Equal-side alternating 50/50 pairs and chains:** every touching number sees both sides identically.
  3. **Unequal-side 50/50 chains completed by untouched squares:** every touching number sees both sides alike, every other unknown area has a pinned count, the untouched squares equal the exact size difference between sides, every still-openable square outside sees both layouts alike, and the global mine count forces exactly two layouts (larger side mined, or smaller side + all untouched squares mined; reported as `"a chain of 50/50s over N squares"`). Unequal-odds cases with extra untouched squares stay outside v1 ([BACKLOG.md](../../BACKLOG.md#play-modes-solver-generators-and-replay)).
  4. **Single untouched region with pinned mine count:** the last squares no number touches once the rest of the board fixes their exact mine count.
- **Redraw and strict player-POV accounting:** every qualifying click increments `guardianAngel` whether the square was already clear or needed redrawing. If mined, only that group redraws uniformly from its valid layouts conditioned on the clicked square being clear (preserving all revealed numbers and global mine count). Hidden redraw counts are never recorded or displayed (`justiceSaves` from `2026-08-23` is read-only legacy compatibility).

## Presentation, rankings, and reference page

- **End-of-game chip only (nothing mid-game):** at game end (or on restored/old-game view; cleared in High scores), a single chip beside the board states `"your Guardian Angel intervened once to keep you safe"` (`"twice"` for 2, `"N times"` for 3+) with tooltip `"Every click into a guess that nothing else on the board could ever settle is guaranteed safe by Guardian Angel."` Guess-odds risk chips remain withheld.
- **End-of-game recap:** when enabled by `reportScope`, [game-end evaluation](game-end-evaluation.md#report-rendering-and-guardian-angel-recap) lists each intervention in plain player words without hinting whether mines moved.
- **Mixed canonical rankings:** Guardian-Angel-on and Guardian-Angel-off games rank together in one shared list per key (decided against splitting). Records store `guardianAngel`, `guardianAngelEnabled`, `seed`, `rngVersion`, `boardVersion`, and `guardianAngelVersion` (`guardian-angel-v4`; fields named `justice*` prior to `2026-11-23`).
- **Settings & visual help:** `guardianAngel` lives on `settings.html` with hint `"a guess that nothing else on the board could ever settle, like a boxed-in 50/50, never kills you"` and full tooltip. `guardian-angel-help.html` stays in the repo as a standalone visual diagram reference (unlinked from controls).

# Ranks-won visibility review — 2026-09-21

Initial review, followed by a same-day scope decision. This describes the
working-tree implementation before that decision; the
examples are controlled fixtures, not an inspection of the player's database.

**Decision implemented later on 2026-09-21:** the period summary covers every
3BV and measured board-shape category represented by its wins. Current board
size/mine count, play mode, generator parameters, and reference date's day
categories remain the scope. Neighboring full tables still use the latest
win's categories. Top-tenth qualification, duplicate collapsing, and current
standings remain unchanged. The following audit preserves the prior behavior
and the still-open choices. The user also requested a visual design review for
absolute rank and percentage standing, including poor placements. The full-row
tint and podium-number proposal was subsequently approved and implemented;
PRODUCT.md “Rank highlights” is the current specification.

The current block answers: **which recent wins currently occupy qualifying
positions in the charts selected for the latest win?** Its category selection
depends on one win even though its time selector describes a whole period.
The current specification explicitly says “every chart this game is ranked on”
in PRODUCT.md, “Recent placements”.

For the user's example, with the latest Intermediate win at 3BV 40, only the
3BV-40 candidate is constructed. An earlier qualifying 3BV-41 win is still in
history and can appear in general time rankings, but its 3BV-41 placement is
absent. A subsequent slow 3BV-41 win brings that earlier placement back and
removes the 3BV-40 category. Beating the previous result is not what causes the
category to disappear; changing the reference win's category does.

## Categories selected from one reference win

| Family | Candidates considered | What can be omitted from the chosen period |
| --- | --- | --- |
| Exact 3BV | Only the reference win's exact 3BV | Placements at every other 3BV |
| High clues | `has 8` only if the reference board's maximum is 8; `has 7` only if its measured `hasSeven` is true | Earlier placements on boards with 8s or 7s when the reference board lacks them |
| Low maximum clue | `max 4`, `max 3`, `max 2` only when the reference board satisfies each cap | Earlier qualifying low-maximum boards when the reference board exceeds that cap; a max-2 reference does consider all three nested caps |
| Mine islands | Only the reference board's exact island count | All other island counts |
| Largest mine island | Only the reference board's exact largest-island size | All other largest-island sizes |
| Zero cells | Only the reference board's exact zero count | All other zero counts |
| Day categories | The reference date's weekday, its weekday/weekend class, and holidays only when that date is a recognized US federal holiday | Other days represented in a source period spanning dates; e.g. Sunday's weekend placement disappears from a past-week summary viewed Monday |

Day categories use the result's finish date after a win, but the current date
when opening scores or showing previous wins after a loss. Shape and 3BV
categories still use the latest saved win in those history views. A loss does
not select categories from the lost board.

## Independent exclusions and changes in meaning

1. **One score key.** Only the current board dimensions/mine count, play mode,
   and generator including its parameters supply records. Other difficulties,
   custom configurations, modes, or generator settings played in the same
   period do not appear. Justice on/off intentionally share rankings. Markless
   status, session states, and music do not create separate score keys.
2. **Wins in the chosen wall-clock period.** Only completed wins can earn these
   placements. “Today” starts at local midnight, not session start; it includes
   earlier sessions today and excludes yesterday's part of a session crossing
   midnight. The 6am choice uses the most recent 6am. Other choices are past
   10/30 minutes, 1/2/4/24 hours, or seven calendar dates starting six midnights
   ago. Reloading does not discard saved wins.
3. **Only longer time rankings.** A time-ranking window must start strictly
   earlier than the selected source window. Today-as-source excludes the today
   ranking; past-week-as-source excludes past week. Calendar boundary alignment
   matters, not just the nominal window name. Membership categories span
   lifetime and bypass this start-time comparison.
4. **Top tenth only.** Rank `r` qualifies only if `10*r <= N`. First of nine
   is omitted; first of ten qualifies; second needs twenty. First place has no
   general exception. Lifetime alone shows the best recent placement, muted,
   when no recent placement qualifies. This also applies to tiny lifetime
   histories, even a first of one.
5. **Identical member sets collapse.** With the default setting enabled, time
   and day categories collapse within one group; shapes collapse within
   another. Lifetime and past week are retained first and claim their duplicate
   sets; otherwise the configured priority keeps one name. Shape priority is
   has 8, has 7, max 2, max 3, max 4, islands, largest island, zeros. This removes
   category names even when their meanings differ. Exact 3BV remains separate;
   there is no cross-family deduplication. Turning collapse off restores only
   candidates that were constructed, not other 3BV or shape values.
6. **Collapse precedes time eligibility.** A short-window chart can claim a
   member set, removing a lifetime membership category, and then be excluded
   because it is no longer than the source. Confirmed example: all ten Monday
   wins happened in the past minute, with other wins on earlier days. `on
   Mondays` qualifies without collapse; with collapse, `past 1 min` claims its
   set and is then excluded from today's summary. Both names disappear.
7. **Current standings, not ranks at achievement time.** Each render sorts
   the chart's present members. An early first of ten can become second of
   eleven after a faster win and disappear from that category's top tenth.
   Time windows can also lose competitors as they advance. Conversely, a
   slower additional win can grow the pool enough to make a previously omitted
   rank qualify. The title “ranks won” does not explain this distinction.
8. **Ties receive different ranks.** Equal stored times are ordered by earlier
   finish, not joint place. A later time equaling the best can be ranked second
   and fail the cutoff.
9. **Unmeasured shape facts are excluded.** Old records without the relevant
   measured shape field are absent from that comparison. If the reference win
   lacks the field, that family is not constructed at all. Missing measurements
   are not evidence of zero or of membership.
10. **Only individual solve-time placements are summarized.** A 3BV category
    ranks solve time, not 3BV/s. Streak, near-streak, and near-near-streak tables
    are separate and never feed this block. Neither do efficiency, click,
    mouse-path, average-time, or motion achievements. Most of these do not have
    an individual record-ranking system to summarize.
11. **Visibility and rendering context.** The recent-placements switch hides
    the entire block. Hiding individual time/3BV/shape tablecharts does not
    remove their candidates from the summary, including largest-island charts.
    Trial's immediate result view uses its own charts; the history score view
    can show the ordinary summary. Board lab records no games. With no saved
    win, the ordinary ranking renderer is not entered.

There is no additional row cap on the summary: every surviving qualifying row
and every qualifying recent rank in that row is rendered. Consecutive ranks
are compressed without losing positions. The latest win alone is highlighted;
older ranks remain listed if they qualify. Full neighboring tablecharts have
their separate 11-row display window, which does not limit this summary.

Post-win windows are anchored to the win's finish timestamp. Score/history
views use the time of rendering. The block is rebuilt on relevant actions,
not kept continuously current by a clock.

## Choices under review

- **A. Keep selection tied to the latest win.** Retain current behavior and
  explicitly describe that scope. This keeps the summary aligned with adjacent
  per-game tables but does not provide a complete period review.
- **B. Cover every category represented by wins in the selected period.**
  Construct the union of their 3BV, shape, and day-category definitions, rank
  each against its full appropriate historical pool, then summarize qualifying
  recent wins. The latest game supplies a highlight, not the category filter.
  This directly fixes the 40/41 case. More category rows may be visible.
- **C. Preserve achievements as they happened.** Reconstruct each game's rank
  against the history available at its finish. Distinguish a new best time,
  an equal best time, and an ordinary placement. An early first remains an
  achievement even if beaten later. This answers a different question from
  current standings and can produce several firsts for the same category.

B and C are independent: complete category coverage does not by itself preserve
earlier first places. Historical ranks can be derived from stored chronological
records; they should not become duplicate stored facts. Reconstruction describes
the available history and cannot recover games that were deleted or never saved.

Recommended direction for discussion, not approved implementation:

1. Use B for the period summary; retain context-specific adjacent full tables.
2. Keep comparison pools separated by score key. If a combined day overview is
   wanted, group by difficulty/mode/generator; do not compare unlike boards in
   one rank. A combined overview is a separate scope choice.
3. Admit current first places regardless of pool size, with explicit `of N`;
   retain the top-tenth threshold for other placements. First of one remains
   distinguishable from first of hundreds. Do not silently replace this with
   top-three or another new cutoff.
4. Apply eligibility before duplicate collapsing. In the summary, preserve
   category identities, either as separate rows or all category names on a
   combined row when their full member sets are identical. The large adjacent
   tables can retain their existing collapse policy.
5. Name the current-standings meaning explicitly. If the desired meaning is
   “records I set today”, use C as an achievement view and show the earned rank
   separately from the current rank; do not silently substitute one for the
   other. Decide how first-ever entries and tied best times are labeled.
6. Keep absent measurements unmeasured and ordinary placement ranking
   deterministic. Streak achievements need their own definition, including
   treatment of a streak crossing the source boundary; add them only as an
   explicit extension.

Implementation details that matter if B is selected: exact-value categories
need keys containing their value (e.g. island count), and weekday categories
need keys containing the weekday. The current generic family IDs are safe
only because one reference game supplies at most one value per family. Reuse
category definitions between the summary and full tables, while separating
category discovery from rendering and from duplicate collapsing.

## Evidence

- `PRODUCT.md`, “Rank lists” and “Recent placements”: documented policy.
- `minesweeper.js`: `rankWindows`, `rankColumns`, `boardShapeCandidates`,
  `dedupeRankCandidates`, `recentPlacementsSummary`, `buildRecentPlacements`,
  `renderRanks`, `renderResult`, `showScoresForCurrentMode`, and `modeKey`.
- `settings-core.js`: `RECENT_PLACEMENTS_WINDOWS`, `collapseDuplicateCharts`,
  and the shown-things options.
- Existing `node tests/recent-placements-test.js`: all 50 checks passed.
- Additional temporary VM fixtures exercised the actual candidate builder and
  summary: 40/41 selection and reappearance, omitted distinct shapes, first of
  nine versus ten, displacement of an earlier first, collapse before eligibility,
  and omitted weekend categories in a past-week source viewed Monday. All
  assertions passed. No player data or runtime settings were changed.

# Per-game stats

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/per-game-stats.md](../implementation/per-game-stats.md), [docs/implementation/board-metrics.md](../implementation/board-metrics.md).

Recorded per finished game, win or loss, primary measurements only: end
date, outcome, time (ms precision, shown as seconds to 3 decimals), 3BV,
clicks, no-op clicks (`wastedClicks`), misclicks, flags placed, flags removed, mouse path (px of
cursor travel, accumulated only while the game is in progress), and
the versioned action-evaluation ledger (`actionEvaluations`), plus
the finished-board shape facts (max number, whether a 7 is present,
zero count, island count, largest island). The stored click count includes only
clicks that changed the board (reveals, flags, chords). Everything else is
derived at display time: 3BV/s (4 decimals), clicks over 3BV (clicks minus
3BV; wins only — a lost board was never finished, so the subtraction means
nothing), efficiency % (3BV / effective clicks, as a percent), correctness %
(effective / (effective + wasted); omitted when wasted clicks were never
measured), throughput (3BV / effective clicks, as a 4-decimal ratio — the
same quantity as efficiency, clone name; wins only, same unfinished-board
honesty as clicks over 3BV), IOS (log(3BV) / log(time in seconds); wins
only; blank when time is 1s or less, matching minesweeper.online), mouse
speed (px/s), path per click, path per 3BV, and (2026-08-22, the per-game
forms of the session series) click rate (effective clicks per second),
no-op rate (no-op clicks per second — per minute until 2026-08-23,
when it followed the session chart's unit move; the rate is derived
from the stored count, so old and new records alike show the new unit
with no migration), misclick rate (visible-board
contradictions per minute), and mark rate (flags placed per second) —
all derived from the stored counts and time, so they
appear on historical games too.
Regular wins show these measurements through the game-data chart and its
configuration; the complete replacement inventory is in
[the game-data design](game-data.md). Losses and trial results retain the
label/value table. Losses are never ranked as completed solves; their measured
action statistics can join a performance comparison, and prior win rankings
remain visible below the loss.

Flagger metrics (added 2026-08-30). Each new record stores the board's
greedy ZiNi (`zini`, the reference greedy flags-and-chords algorithm's
click count — the flaggers' counterpart to 3BV, never above it), human
ZiNi (`hzini`, the same greedy algorithm restricted to already-open cells
after opening every opening first; ported from the community Rust
reference in `zini.js` with known-answer tests), and `chordClicks`
(accepted chords among the board-changing clicks). Both ZiNi fields are
board facts, so they are stored rather than derived; they are omitted on
Endgame drill games, where a full-board measure misdescribes the partial
solve. Derived at display time: IOE (3BV / total board-changing clicks,
wins only), chord share (accepted chords / board-changing clicks, any
outcome — how much of the play is chord-driven), ZiNi efficiency
(zini / clicks, the flagger analog of throughput, wins only), and STNB
(difficulty-normalized speed: constant / (time^1.7 / 3BV) with the
community constants 47.299 beginner, 153.73 intermediate, 435.001
expert; only defined on those exact board shapes, wins only, and never
on Endgame drill records). Absent fields on old records follow the
standard not-measured rules.

Board measurements (2026-09-21, revised to completed scalar benchmarks):
**This board** shows HZiNi, 3BV spread, 0–1 share, and zero-opening coverage.
HZiNi uses the existing `hzini` primary record field. Optional versioned
`boardMetrics` stores `workSpread`, `safeCells`, `zeroOpenedZeroOneCells`, and
`zeroOpenedCells`. Store measured counts once and derive fractions at display time. No C* proof intervals, RCW simulation,
hint counts, or simulated guess/mine-hit counts appear in the live results.
Previously saved research measurements remain in exports without entering
comparison tables.

**Game data** replaces the winning-game scalar stat block in the sidebar.
It compares this game's performance with independently configurable lifetime
and session pools on the left, and ranks the board's measured trait values
in preferred directions on the right. Its 0–100% band places each item at
100 × (rank − 1) ÷ (count − 1): the best in its pool is 0% at the top and the
worst is 100% (user decision 2026-09-23: "if my number here was highest the
entire session, the value would be 0%, i.e. I was the best"). Each left label
names the measurement and this game's value, then ends with its pool word:
"3BV/s 1.600 (session)", "time 44.382s (life)", or "(day)" for the trailing
24 hours (user decision 2026-09-23: add the word to the end of the labels;
the creator then chose "(day)" over "(24h)").
Board-trait labels have no pool word. The band also has exact anchors, pastel
colors, automatic range zoom, and full calculation/scope tooltips. Configuration has separate
session/lifetime checkbox columns and all-selection controls; a saved bottom
checkbox shows/hides actual values. By default (user decision 2026-09-23,
from the creator's own configuration) the left side shows lifetime
comparisons for time, misclick rate, fastclick gap, 3BV/s, click rate, no-op
rate, correctness, mouse speed, and unused mark share, plus time (day), and
no session comparisons; the right side omits 3BV spread, whose tablechart
switch is off by default. The page-wide session chooser controls
this chart, left-side session stats, and records won together, defaulting to
the last hour of wall time. The chart includes paginated historical-window
summaries from saved primary facts. The separate This win/time caption is gone.
Its band sits where both sides' labels fit on one line (2026-09-23). It lives
in its own full-height column beside the board column when that fits, and
otherwise fills the details column's width and remaining height (see [Layout](board-and-layout.md)).
Replacing other result surfaces with it is planned for later (user decision
2026-09-23); see BACKLOG.md.

The complete specification, catalog, formula rules, responsive behavior,
historical data design, and explicit inventory of old stat-block fields no
longer displayed are in [Game data and the shared session](game-data.md).
This is descriptive comparison, not a trait–performance correlation model.

- **HZiNi (Human ZiNi):** begin with the fixed final board,
  perfect mine knowledge, and no flags. Reveal each zero component once,
  including its numbered border. Then repeatedly choose the exposed positive
  clue maximizing `covered safe neighbors - unflagged mine neighbors - 1`,
  provided the gain is nonnegative; flag its remaining adjacent mines and
  chord once. Otherwise reveal the next covered safe cell. Ties and direct
  reveals scan down each column, columns left to right, matching the existing
  Human ZiNi implementation. Each reveal, flag placement and chord counts
  once. Stop when all safe cells are open. The resulting integer is an exact
  deterministic benchmark count, **not a proved global minimum**. No hint,
  deduction, or guess count is an input. `HZiNi N` ranks winning times at
  exactly N; existing historical HZiNi values are immediately eligible.
- **HZiNi efficiency:** `100 * hzini / clicks`, derived in Game stats on
  wins with positive board-changing clicks. It can exceed 100% if the
  player beats the greedy benchmark. It measures performance, not a board
  characteristic or rank percentile.
- **3BV spread:** the root-mean-square distance from the mean of the 3BV
  work points, in cell spacings. Each independent safe cell contributes one
  point; each zero component contributes its zero-cell centroid with weight
  one. Store the unrounded value; time comparisons round to the nearest
  0.5 cell, with exact halfway values upward (`round(2 * value) / 2`). The
  heading gives the group, e.g. `3BV spread 2.5 cells`; its mouseover gives
  the underlying measurement to three decimals and the definition. A 2.5-cell
  group covers [2.25, 2.75); the zero group is clipped at zero.
- **0–1 share:** open every zero and nothing else, then count only the
  revealed zeros and ones, divided by all safe cells on the board. Covered
  ones and revealed clues of two or more do not count. Shared borders count
  once. No deductions, flags, chords, or subsequent direct reveals are
  included. With no zeros the share is 0%; with no mines it is 100%.
  This share cannot exceed zero-opening coverage.
- **zero-opening coverage:** the union of every zero flood, including all
  numbered borders counted once, divided by all safe cells. Stop after
  flooding, before deductions or chords. No zeros means coverage 0%.
  Both time tables group by the nearest whole percentage point, halfway
  upward. Compute `floor((200 * numerator + denominator) / (2 * denominator))`
  from integer counts to avoid binary-ratio tie errors. The 72% group covers
  [71.5%, 72.5%); 0% and 100% clip to the valid range. Table headings show
  the group; their mouseovers retain exact numerator/denominator, a percentage
  to three decimals, and the definition. Stored counts retain full precision.
  Missing and unsupported measurements stay excluded. These are board
  fractions, distinct from rank percentiles. Both full tables and recent
  achievements use these same rounded groups.

The [full definitions](../../reference/board-metric-definitions.md#9-fixed-opening-first-benchmark-and-exact-opening-first-minimum)
specify the fixed HZiNi procedure and distinguish the requested globally
optimal opening-first quantity C₀*: one reveal per opening plus the globally
fewest remaining actions. An exact tiny-board reference calculator exists;
a scalable exact production implementation remains research. HZiNi's fixed
column-major choice is orientation-dependent; 3BV spread, both fractions, and C₀* are not.
Measurements describe the final layout in modes that can change mines.

Analysis runs in one background worker at a time. Results amend only the captured
history record, including if the player changes modes or starts another game.
New games supply their captured final layout; older viewed records use their
saved final-board trace when available and otherwise say the board is
unavailable. No historical values are guessed. Endgame drills omit these
full-board measures. Export/import preserves versioned measurements; future
versions are retained without interpretation or mixing into current cohorts.
`Backfill saved wins` fills missing measurements for the current mode from
saved final-board traces, one board at a time, including records that already
have HZiNi/spread but lack the fractions. The corrected visible 0–1 count is
stored separately as `zeroOpenedZeroOneCells`: the earlier `zeroOneCells`
counted all zeros and ones, including covered ones, and never enters corrected
0–1 comparisons. Those older records need backfill even when they have all
earlier measurements. Their unchanged spread and zero-opening coverage remain
usable. Bulk backfill starts only when the player clicks its button.
A progress bar and text show checked /
total, measured, unavailable, failed, and remaining counts. A missing trace
stays unmeasured; an actual calculation/read failure displays its error.
`Stop backfill` lets the current board finish. `Resume backfill` processes only
missing measurements. Each completed record is saved
separately and immediately joins its comparison tables; no whole-batch completion
is required. Progress is derived from recorded measurements, not a saved cursor.
After the creator reported recurring completed backfills (2026-09-23) and
requested a complete fix, availability is derived from an IndexedDB index of
saved final boards, matched by mode and cell count. Missing traces, traces without
final boards, and mismatched layouts never enter the bulk queue or button count.
The source check runs before offering work on each page load; unavailable boards
cannot resurrect an exhausted batch. No permanent skip flags are stored: restoring
a board makes its missing measurements eligible again. The index reads only keys,
not whole input traces; trace writes invalidate the current mode's RAM catalog.
`Resume backfill` and `Paused` appear only after an explicit Stop in the current
page. After reload, remaining calculable work uses `Backfill saved wins`, preserving
completed measurements without claiming the player paused. Actual read/calculation
failures remain visible and may be attempted again after reload; they are never
recorded as successful measurements or permanent unavailability.
The progress panel disappears when no calculation is active and no further
record can be attempted in that operation, including when the remainder has
unavailable saved boards. It remains available while paused with work left.
Actual backfill errors remain visible independently of the progress panel.
Counts cover supported full-board wins in the current score key. The
`board backfill progress` display switch controls this panel (saved key
`boardMetricFacts`). Calculation/unavailable/error status remains visible
independently; the retired standalone value cards have no display switch.

Cadence spread (added 2026-08-30, the chosen per-game cadence-consistency
measure) is stored as `cadenceSpread` on wins and losses alike: the
interquartile range of all button-press gaps (wasted presses included)
divided by their median — 0 is metronomic, larger is burstier. A robust
dimensionless dispersion was chosen over a coefficient of variation
because press-gap distributions are heavy-tailed; the IQR/median form
ignores outlier pauses instead of being dominated by them. Needs at
least two measurable gaps. It appears as a stats row, as a
cadence-spread-versus-date relationship scatter (wins with the field,
Theil–Sen trend on that subset), and as a session series.

Wasted clicks — board clicks that changed nothing (chord attempts on
unsatisfied or empty numbers, left-clicks on flagged cells, right-clicks
on revealed cells) — joined the record schema on 2026-08-19 (decided
2026-08-19: tolerate absence going forward). Games recorded before the
measurement existed simply lack the field: absence means "not measured"
and is valid on import (a present value must be a number); displays that
need the value use only records that carry it. Every game recorded from
now on has it.

Misclicks — board-changing actions contradicted by facts provable from
the visible board at click time: opening a proven mine, flagging a proven
safe cell, removing a flag from a proven mine, or chording while a flagged
neighbor is proven safe or an opened neighbor is proven mined. This is an
operational visible-state classification, not a claim about intent or what
the player consciously knew. It is independent of outcome: a fatal
misclick also appears in the action-evaluation ledger, while a wrong
flag can be a nonfatal misclick. Stored as `misclicks` on every new game
record beginning 2026-08-23; older records omit it as not measured.

Likely physical misclick deaths are a separate post-hoc inference, introduced
2026-08-28; they do not change that exact visible-state count or replace the
fatal action's technical classification. A loss qualifies when a flag still
standing on an actually safe cell was placed less than 1,000ms before the
fatal action and is one cell away, orthogonally or diagonally, from the
fatal reveal or chord center. Exactly 1,000ms does not qualify, and removed,
correct, or more distant flags do not qualify. The fatal report keeps all
technical mistake tags and adds the measured flag cell, target cell, and gap
under `likely-misclick-after-wrong-flag`. This is intentionally labeled
“likely”: hidden-board truth is used only after the game to distinguish a
motor-slip pattern from a claim about what the player believed.

Flags placed — how many flags the player set during the game (removing a
flag doesn't subtract; the auto-flagging of remaining mines on a win is
not the player's doing and is not counted) — joined the schema on
2026-08-19 under the same absence rules as wasted clicks. A game with
zero flags placed holds the special status "markless": the stats table's
"Flags placed" row reads "0 - markless", and wherever an individual game's
time appears in a table chart (rank-list time cells, the stats table's
Time row) a small olive-green "(m)" precedes it. Average-time chart dots
carry no marker, since they aggregate games. Records from before the
measurement never claim the status, since for them it is unknown.

Flags removed — how many flag states the player turned off — joined the
schema on 2026-08-20 under the same absence rules. Placement and removal
both changed the board and count as effective clicks; the placement still
counts in flags placed. Removal is stored separately from no-op clicks
because they are different observable events. The record does not say why
either event occurred: a no-op is not automatically a motor slip, and a
removed flag does not prove a changed mind.

Justice — how many bare entries into certified sealed pockets were
guaranteed safe (see [A just universe](just-universe.md)) — joined the schema on 2026-08-20
under the same absence rules as wasted clicks. It increments on every
qualifying entry whether the hidden cell was originally clear or required
a redraw. Zero is a normal value and is recorded; the stats table always
shows the row when the field exists. `justiceEnabled` records the setting
state frozen at the first reveal so the rules of the game remain knowable,
although rankings deliberately continue mixing both states for now.

Guess ledger — on every bare click into a cell whose remaining-layout
mine probability is greater than zero (not the first click, never a
chord). A cell that is safe in every consistent layout is not a guess,
even if local deduction had not yet marked it; clicking it is not
wrong and does not print a chip. The remaining consistent layouts
are enumerated and the click is scored. Stored per game (joined
2026-08-21, same absence rules as wasted clicks; omitted entirely if any
guess in the game exceeded the enumerator budget): `guesses`,
`guessIdealRisk`, `guessNonideal`, `guessPerfect`, `lifeLost`,
`lifeNeedless`, `oddsVersion`.

- **Life lost** (absolute). Each guess costs its mine probability. A 19%
  death click spends 0.19 lives in the multiverse whether you lived or
  died. Justice may still rewrite a certified pocket so you live; the
  0.19 remains on the ledger (the remaining chance you lived was played
  out, not erased).
- **Life needless.** Cost above the safest available cell:
  p(chosen) − p(best). Clicking the ideal-risk spot costs 0 needless
  life even if that spot is itself a 19% die. This still punishes
  semi-deaths — picking a 30% when a 19% existed — without punishing
  ideal play for the world's residual risk.
- **Ideal-risk / off.** A guess is ideal-risk when it chose a lowest-p
  cell, off when it did not.
- **Perfect.** Lowest raw risk is not the same as best play. A 4% click
  that tells you almost nothing can lose to a 5% click that splits the
  remaining layouts and leaves a solved board. The stored objective is
  one-ply expected remaining life: (1 − p(die)) × (1 − expected min
  remaining risk after the number that click would show). When Justice
  would certify the cell, death risk for this score is 0 (you will
  live) but absolute life-lost still uses the raw p. If the remaining
  region is too large to enumerate, `guessPerfect` falls back to
  “same as ideal-risk” rather than inventing information value, and if
  even p cannot be measured the whole ledger is omitted.

A chip (olive, in the Justice stack, shown at game end like the rest of
the stack) prints the raw p and either
`ideal`, `justice`, or the needless extra; its hover text names the
reason (a provably safe square was available, or the safest square's
odds). The ledger exists only where the standard mine gamble is real:
Standard, the Trial modes, and the NG modes (their mines still kill).
Angelic records no ledger — an unproven click there cannot kill, so a
risk chip would be fiction — and neither does Proof-or-die, where an
unproven click is a deterministic death, not a probability. Absence of
the fields on those modes means "not measured", the usual rule. A
scoring failure never blocks the reveal: it announces in the backup
status line and omits that game's ledger. The odds engine is held to
ground truth by a brute-force parity test (every consistent layout
enumerated on small random boards; probabilities must match exactly).

Action evaluations — `actionEvaluations` joined the schema 2026-08-23
and is the sole in-memory/store representation for action mistakes and
deaths. It is an array on every new record: empty when a win had no
recorded reportable action, otherwise one item for each nonfatal measured action
plus one item for the fatal action on a loss. Every item carries a schema
version, action number/time, action/result, any number of independent
mistake tags, literal measured evidence, and alternative cells. Actions
where position matters also carry a compact visible-position snapshot
(revealed cell/number pairs plus flagged indices); no-op inputs omit it
to avoid duplicating the board in history. A snapshot records what was visible, not hidden
mines the player could not see. See [Game-end evaluation](game-end-evaluation.md) for the full
taxonomy and report.

Legacy `stupidDeath`, `deathKind`, `deathRisk`, and `deathBestRisk` are
import-only. Loading or importing immediately converts them to one fatal
action evaluation, records exactly which old representation supplied it,
removes all four legacy fields, and persists the normalized history.
`deathKind` can retain its old five-way chart line as provenance;
`stupidDeath: true` can retain only “legacy avoidable” because inventing
the missing modern subtype, risks, alternatives, or board would be false.
An older win with no action ledger becomes an explicit measurement note
that action coverage is unavailable, not a falsely mistake-free modern
game.
No runtime calculation reads either legacy field.

Justice saves (`justiceSaves`) — a historical field written only during
part of 2026-08-23, counting which Justice entries involved a redraw. It
was retired the same day by the player's-point-of-view directive: never
reveal or refer to an "actual" mine reality behind a forced coinflip —
a forced flip is a forced flip, neither a life nor a death. The field is
no longer recorded or shown anywhere; the schema still accepts it so the
records from that day stay valid.

Fastclick gap — the game's median gap between consecutive board-changing
presses made on the move (a cursor move within 100ms before the press)
with gaps under 1s — joined the schema on 2026-08-22 alongside the
session stats, whose fastclick series uses the identical qualification.
Stored (as `fastclickGapMs`) rather than derived because it needs press
timestamps, which the scalar record does not carry (the trace does, so
history from the trace era is backfillable offline). Win or loss alike.
Absent when no gap qualified — slow, careful play is "not measured
here", never a made-up number — and on games recorded before the
measurement. The stats table shows a "Fastclick gap" row when the field
exists.

Seed — every new board receives a cryptographically generated 128-bit seed.
`xoshiro128ss-v1` expands it into the one deterministic random stream used
for initial mine placement and every Justice redraw. Finished records and
traces store `seed`, `rngVersion`, `boardVersion`, and `justiceVersion`.
The seed plus board mode, first click, RNG version, and board version
reproduces the initial board. Reproducing later redraws also requires
replaying the stored input trace under the recorded Justice version,
because redraws consume the stream only when the player's path triggers
them. A bare seed without those version names is not claimed to be a
permanent replay format.

Board shape — facts of the finished mine layout, joined the schema on
2026-08-21 under the same absence rules: `maxAdjacent` (highest number
on the board), `hasSeven`, `zeroCount` (cells with adjacent-mine count
0), `islandCount` (8-connected mine components, diagonals included,
edges empty), `largestIsland` (mine count in the largest component).
The stats table shows max number, zeros, islands, and largest island
when the fields exist. They feed the board-shape time lists.

Music playing — whether this machine heard audio playing during the game
— joined the schema on 2026-08-22 (decided 2026-08-22). The page cannot
observe system audio; the machine's resident base system (ProjectLauncher,
the localhost dashboard's API) can, via PipeWire: playing means some audio
output stream is running (speech synthesis excluded) AND the speaker mix
actually carries signal (~0.5s of the default sink's monitor above
-60 dBFS) — stream state alone lies, since some players hold an open
"running" stream while feeding silence. It serves a cached boolean at
localhost/api/is-music-playing, rechecked there at most once a minute. The
game polls it continuously while the page is open (every 15s, plus once
the moment a board is dealt); the record stores `musicPlaying` = true if
any answer arriving while the game ran heard audio, false if every one
heard silence, and no field at all when the endpoint never answered (any
other machine, base system down) — absence means "not measured", the
usual rule, so records cannot lie on origins with no base system.
Because it is a true state of the world, it is also shown live: an olive
"music" chip in the fixed upper-right cluster (by the states tags)
appears while the latest answer is "playing" and goes away when the
music stops — within about a minute either way, since the base system
rechecks at most once a minute (worst case ~75s: poll interval + cache
age). An unreachable endpoint shows nothing: unknown is never displayed
as silence. The chip is display only — a measured fact, not a player
tag, so it has no x and takes no clicks. The stats table shows a "Music"
row (playing / none) when the field exists. Deliberately a boolean, not
the stream titles: titles are personal data that would live forever in
records and exports.

States — the player's state tags active at the moment the game finished
(see [Player states](player-states.md)) — joined the schema on 2026-08-20. Every game
recorded from now on carries the field (an empty list when nothing was
active); games from before it existed lack it, same absence rules as
wasted clicks. The stats table shows a "States" row only when the game
carries at least one tag.

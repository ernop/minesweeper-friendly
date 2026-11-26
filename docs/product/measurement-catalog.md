# Measurement catalog

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/measurement-catalog.md](../implementation/measurement-catalog.md).

## Single source of truth (`GameData.metrics`)

Every performance measurement is defined once in `GameData.metrics` (`game-data.js`):

- `id` — canonical key across settings, chart hooks, and code.
- `name` — sole display name across every surface.
- `definition` — concise explanation (where name and unit alone leave meaning open), worded to hold over both whole games and live time slices.
- `format` — exact display formatting.
- `direction` — preferred direction (higher or lower).
- `games` — scope (`wins` only when completion or solved 3BV is required; `wins and losses` otherwise).
- `formula` — exact derivation from stored primary record fields.

Every surface reads from this catalog and never renames, redefines, or re-derives a measurement:

- [Game data](game-data.md) rows, hover cards, and `configure` list.
- [Live perf charts](during-game.md) legend names, hover definitions, formats, whole-game values, and `configure` list.
- [Point charts](charts.md) (`your perf` titles, values, winrate eligibility; `cadence spread` scatter).
- [Motion stats](motion-stats.md) `cadence spread` row.
- `this game` stats table on losses and trials ([Per-game stats](per-game-stats.md)).
- [Full score lists](rankings.md#full-score-lists-and-old-game-review) headers, values, column-picker definitions, and default sort direction.
- [Training page](training.md) (`3BV/s`, `IOE`) and [Trial review](play-modes.md#trial-trial-short-trial-short-trial-and-test-trial-test-trial) (`3BV/s`, `efficiency`).

Non-catalog rows never reuse a catalog measurement's name: whole-game totals (`excess game risk`, `modeled life gap` in `this game`) stay distinct from their per-minute catalog rates (`excess game risk rate`, `modeled life gap rate`).

## Canonical value and scope invariants

- **Exact whole-game parity:** every live perf chart row representing a catalog measurement uses the exact `GameData.metrics` whole-game value as its legend value and `1×` reference (rates divide by record time with no 1-second whole-game cutoff; the 1-second minimum applies only to live averaging windows/buckets).
- **Single-source trace derivations:** `mousePathPx` (since `2026-10-27`, including merged co-timestamped observations), `fastclickGapMs` (`planned-pairs-v1`, since `2026-10-26`; unversioned legacy values are never mixed in), and unrounded `cadenceSpread` compute from one shared trace pipeline so Game Data, live perf charts, motion stats, replay, and trial review match identically.
- **Given-opening 3BV parity:** trials with `givenOpeningBv3` divide all 3BV performance measurements by player-solved 3BV everywhere (while board traits retain full board 3BV and ZiNi/HZiNi efficiency are omitted).
- **Wins-only consistency:** any measurement scoped to wins in `GameData.metrics` (including `3BV/s`, `path / 3BV`, `clicks over 3BV`, `IOE`, `HZiNi efficiency`, `unused flag share`, `unflagged mine share`) is excluded from `winrate` mode on `your perf` charts so losses never plot bogus whole-board 3BV denominators.
- **Re-measurement on restore:** restoring a saved game recomputes `cadenceSpread`, upgrades legacy `fastclickGapMs`, and backfills missing `moveHabits` or `givenOpeningBv3` from its trace (bulk backfill across all history is tracked in [BACKLOG.md](../../BACKLOG.md#bugs-performance-and-infrastructure)).

## Bidirectional hover link (Game Data ↔ Live perf charts ↔ Lower charts)

- Hovering or focusing a `game summary perf` row spotlights its matching line and counted event marks in [live perf charts](during-game.md) (fading sibling lines/marks, never text labels) and outlines the matching `your perf` chart below (no-op if the row is hidden in live perf charts).
- Hovering a live perf chart line or legend entry rings the matching `game summary perf` row (in band or distributions view) in `--this-game` light blue and outlines its `your perf` chart below. Event-track legend entries ring every performance row counted over them (hovering a single event mark or non-catalog line rings nothing):

| Live perf event row | Linked `game summary perf` rows |
| --- | --- |
| `no-op clicks` | `no-op rate` |
| `misclicks` | `misclick rate` |
| `flags removed` | `flag-removal rate` |
| `moved on`, `left hard work` | `time before a move` |
| `left easy work` | `time before a move`, `moves leaving easy work` |
| `forks` | `forks to the nearest area` |
| `unused flags` | `unused flag share`, `unused flag rate` |

- Hover links never shift layout (inset rings + opacity fades only).

## Historical id and field renames (migration compatibility)

Settings saved under pre-`2026-10-26` ids map transparently to their canonical ids: `correctness` → `boardChangingClickShare`, `moveTime` → `timeBeforeMove`, `unusedMarkShare` → `unusedFlagShare`, `excessGameRisk` → `excessGameRiskRate`, `modeledLifeGap` → `modeledLifeGapRate`. Record fields renamed in DB v7 (`2026-10-27`): `clicks` → `boardChangingClicks`, `wastedClicks` → `noOpClicks`, `movesRanOut` → `movesMovedOn` (Step-2 removal tracked in [BACKLOG.md](../../BACKLOG.md#pending-step-2-cleanups-delete-once-active-browsers-have-loaded-step-1)).

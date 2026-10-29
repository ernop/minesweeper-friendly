# Measurement catalog (creator request 2026-10-26)

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/measurement-catalog.md](../implementation/measurement-catalog.md).

## Request

Creator, verbatim: "there should be a mouseover logical connectino between
any stat appearing in "game summary perf" such as 3BV/s such taht when i
mouseovere it, thatline in the per-second perf chart alone gets
highlighted. and fice versa.

note: if there are any divergences in our internal naming or setup or ways
to measure or track any of these between the places each of them appears or
is calculated, we should take the chaance to rectify it hnow. we really
needa global clear definition of exactly what it is and how we think about
it, uniquely across the ENTIRE coddebase."

"The per-second perf chart" is the live perf charts block
([During the game](during-game.md)); "game summary perf" is game data's
performance side ([Game data](game-data.md)). Built the same day.

## One catalog

Every performance measurement is defined once, in the game data catalog:

- its id, the one key for it in settings, chart hooks, and code;
- its name, the one name every surface shows;
- its definition, where the name and unit leave it open, worded so it holds
  both for the whole game and for any stretch of it, since the live perf
  charts show the same measurement moment by moment;
- its format, the one way its value is written;
- its better direction;
- which games it covers: wins only, when it needs the finished board or
  the 3BV the player solved, or wins and losses;
- its formula over the saved game record.

Every surface that shows a measurement takes all of these from the
catalog and never renames or redefines it:

- game data's rows, cards, and configure list ([Game data](game-data.md));
- the live perf charts' rows: legend name, definition on hover, value
  format, and configure list ([During the game](during-game.md), "Rows");
- the your-perf property charts: title, values, and which games they plot
  ([Point charts](charts.md));
- the cadence spread relationship chart's title and values;
- motion stats' cadence spread row: name and definition
  ([Motion stats](motion-stats.md));
- the "this game" table of a loss or trial game
  ([Per-game stats](per-game-stats.md)).

A row or label that is not a catalog measurement never takes a
measurement's name. A whole-game total and its rate are two things with two
names: "excess game risk" is a game's total, shown in the "this game"
table, and "excess game risk rate" is that total per minute, the
measurement game data ranks; the same holds for "modeled life gap" and
"modeled life gap rate".

## One value

A live perf charts row that is a catalog measurement shows, as its
whole-game value (its legend value and the 1× it is drawn against), exactly
the game data value for that game, computed from the same facts:

- A rate divides by the record's time. Until 2026-10-26 the live charts
  divided by their axis's span, the record's time or the last action,
  whichever was later, and gave a game under a second no whole-game value;
  the 1-second minimum now applies only to an averaging window or bucket
  ([During the game](during-game.md), "Averaging").
- The fastclick gap's planned pairs are found once, from the game's trace
  and the proofs the live perf charts' model makes, by one function; the
  live line plots them and the record stores their median, rounded to the
  millisecond. Until 2026-10-26 the record took its gaps, under the earlier
  definition, from the page's own clock during play
  ([Per-game stats](per-game-stats.md), "Fastclick gap").
- A record's value of a measurement's earlier definition is not that
  measurement: the catalog reads the fastclick gap only from records that
  name its current definition (`fastclickGapVersion`), so no comparison
  mixes the two.
- Cadence spread is stored unrounded; until 2026-10-26 the record rounded
  it to 3 decimals while the live charts did not.

## Which games

A measurement game data compares on wins only is wins-only everywhere. The
your-perf charts' winrate mode, which groups wins and losses, leaves out
exactly those measurements. Since 2026-10-26 that includes 3BV/s, path /
3BV, and clicks over 3BV: a loss's recorded 3BV is the whole board's, not
the part the player solved, so these charts had grouped losses by values
that were not their measurement ([Point charts](charts.md)). It follows the
creator's 2026-10-07 direction "one name one thing", under which a loss
already showed no 3BV/s, efficiency, or path / 3BV computed from the whole
board's 3BV ([Per-game stats](per-game-stats.md)); a test written on
2026-09-23 had kept 3BV/s losses in winrate.

## Hover link

- Hovering or focusing a game summary perf row spotlights that
  measurement in the live perf charts: its line on the chart against the
  whole game, and the marks of the event rows counted for it (the no-op
  rate's row brings forward the no-op clicks' marks). Every other line and
  mark in those charts fades, as when the pointer is on a line. Leaving
  restores them. A row whose measurement the block does not show (chosen
  off in configure, or hidden by a legend pick) spotlights nothing.
- Hovering a line in the live perf charts (the line the hover card names)
  or a legend entry rings that measurement's game summary perf row, in the
  band or the distributions view, in the this-game color. An event row's
  legend entry rings the rows of the measurements counted over its events:

  | Event row | Game summary perf rows |
  | --- | --- |
  | no-op clicks | no-op rate |
  | misclicks | misclick rate |
  | flags removed | flag-removal rate |
  | moved on, left hard work | time before a move |
  | left easy work | time before a move, moves leaving easy work |
  | forks | forks to the nearest area |
  | unused flags | unused flag share, unused flag rate |

  A mark on an event track is one event, not a measurement, so hovering it
  rings nothing. Lines with no game data measurement (action gaps, squares
  moved, work areas, the progress and moves available rows) ring nothing.
- Either hover also outlines that measurement's your-perf chart below, as a
  game data row's hover always has.
- Neither moves anything on the page: the ring is drawn inside the row's
  label and the fade is opacity ([UI doctrine](ui-doctrine.md)).

## Ids renamed 2026-10-26

Ids that no longer said what their measurement is took its name. Saved
choices under an old id (game data's configure, the live perf charts'
configure) keep their choice under the new one.

| Old id | Id | Name |
| --- | --- | --- |
| `correctness` | `boardChangingClickShare` | board-changing click share (since 2026-10-15) |
| `moveTime` | `timeBeforeMove` | time before a move |
| `unusedMarkShare` | `unusedFlagShare` | unused flag share |
| `excessGameRisk` | `excessGameRiskRate` | excess game risk rate (was "excess game risk") |
| `modeledLifeGap` | `modeledLifeGapRate` | modeled life gap rate (was "modeled life gap") |

## Divergences found and fixed 2026-10-26

- The live perf charts kept their own copy of every shared row's name and
  definition, and many of the definitions differed from game data's. Rows
  now read the catalog, and the definitions were rewritten to hold over any
  stretch of the game. Game data's misclick definition named only opening a
  proven mine and flagging a proven-safe square; the count also includes
  removing a proven mine's flag and chording against the visible proof, and
  the definition now says so.
- The fastclick gap was measured twice, by the page during play and by the
  live charts from the trace; now once, from the trace (One value, above).
- Cadence spread was rounded in the record only (One value, above).
- Live whole-game rates used a different divisor and a minimum time (One
  value, above).
- The "this game" table computed flag rate and flag-removal rate itself,
  and wrote flag-removal rate with one decimal against the catalog's
  format; it now shows both from the catalog.
- The your-perf charts repeated formulas for path / click, path / 3BV,
  board-changing click share, IOS, and unused flag share, and declared
  wins-only by hand, which had drifted from the catalog (Which games,
  above). They now read the catalog for both.
- Motion stats wrote its own cadence spread definition.
- Five ids did not match their measurement (Ids renamed, above).
- A test kept its own copies of three formulas under the old names
  "correctness" and "throughput"; it now tests the catalog's.

## Divergences resolved 2026-10-27

The four that remained on 2026-10-26 went to the creator with a
recommendation each, and the creator answered "continue" (2026-10-27),
taking all four:

- Stored field names now are their measurement's name: `clicks` became
  `boardChangingClicks`, `wastedClicks` became `noOpClicks`, and
  `movesRanOut` became `movesMovedOn` (the moved-on events' count). The
  database's version-7 upgrade renames them once in every saved record and
  in the trial session's attempts, an import renames them in an earlier
  backup, and the archive folder's format version is 2
  ([Storage](storage-and-history.md), "Storage"). The local player
  origin's database was copied aside on 2026-10-27, before the upgrade
  first ran.
- Mouse path from one source. The trace keeps the cursor observations it
  used to drop when two arrived at one instant, and the record's path is the
  trace's travel while the game clock ran, the same sum the live perf
  charts' path and mouse speed rows plot, so game data's path, path /
  click, path / 3BV, and mouse speed are their whole-game values
  ([Per-game stats](per-game-stats.md), "Mouse path"). The page's own
  count of the path during play is gone; records before 2026-10-27 keep it.
  Motion stats' path, wander, movement-bout speeds, and straightness, the
  trial review's path and speed, and the replay's movement speed read the
  same travel ([Storage](storage-and-history.md), "Capture provenance
  v1").
- Trials with a given opening. The record stores the 3BV the opening solved
  (`givenOpeningBv3`), and every performance measurement divides the 3BV the
  player solved, as the live perf charts' 3BV solved counts it; board traits
  keep the board's 3BV, and ZiNi and HZiNi efficiency do not apply
  ([Per-game stats](per-game-stats.md), "Trials with a given opening").
- Older records' cadence spread and fastclick gap. A saved game's result
  restored on the game page is measured again from its trace: cadence spread
  every time, the fastclick gap when it follows the earlier definition, and
  move habits and a given opening's 3BV when missing. Restoring is the one
  place a saved game is measured again; a pass over every saved game is not
  built ([BACKLOG.md](../../BACKLOG.md), "Measure every saved game again").
  Older fastclick gaps are read nowhere, so no comparison mixes the two
  definitions ([BACKLOG.md](../../BACKLOG.md), "Fastclick gap: planned
  pairs").

The training page's 3BV/s and IOE and the trial review's 3BV/s and
efficiency now read the catalog; both had computed their own, and the trial
review's ignored the given opening.

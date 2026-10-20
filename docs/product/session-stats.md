# Session stats (built 2026-08-22; removed with the left stats panel 2026-10-20)

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). No implementation notes: the code is gone.

The left stats panel held the session section (charts of the session's
per-game measurements over played time, game endings, action rates, report
category rates, a "when this play happened" strip, game markers, and the
switch cost row) and the live motion rows. Both left the page on 2026-10-20.

## The decision

The creator (verbatim, 2026-10-20): "many sections within the left side
live-charstg are actually also covered by the two sections which relate to
user perf within this game. but i guess the left-sdie ones are mostly about
the entire session? hmm but we still also have that in those newer
right-sdie sections. it seems to me we can remove all the left side stat
charts and things totally? what do you think? but the product solutions and
ideas we used and invented there coul be useful too - what do you think?
let's talk about that."

After the recommendation to remove the panel: "yes. for now, let's move the
live-motion ones down to the bottom area and let the user open/close it as
wanted. ahh, session charts of per-game charts. true. let's make those
available as optinos to include in the 3 right-side sections? which teh user
can add/remove. same for teh game endings %! wonderful! same for all,
actually hmm but remember the post-game "classifity this loss by type (and
also even wins by type) " isn't on t he block to be moved here - it's still
supposed to appear after the game ends, right?" It is: the after-game
report and the session results keep classifying every loss and win
([Game-end evaluation](game-end-evaluation.md)).

## Where each part went

| Part | Now |
| --- | --- |
| live motion rows | the motion stats section at the page foot, closed by default ([Motion stats](motion-stats.md)) |
| session picker | the settings row at the page foot, unchanged ([One session definition](game-data.md#one-session-definition)) |
| mouse speed, click rate, no-op rate, misclick rate, fastclick gap, cadence spread, unused flag share, unflagged mine share | already rows of game summary perf ([Game data](game-data.md)); the pace rows of live perf charts ([During the game](during-game.md)) |
| flag rate, flag-removal rate, unused flag rate, the game risk, early guess, time loss, and life maximization rates, excess game risk, modeled life gap | new optional rows of game summary perf, off by default ([Catalog and configuration](game-data.md#catalog-and-configuration)) |
| the same over the course of a game, plus cadence spread | new optional rows of live perf charts, off by default ([During the game](during-game.md)) |
| game endings % | the lifetime column of the session results ([Session summary](rankings.md)) |
| switch cost row | the optional line under game data's chart ([Switch cost line](game-data.md#switch-cost-line-creator-request-and-approval-2026-09-28-under-game-data-since-2026-10-20)) |

Not carried over, by decision:

- Game loss and deaths with mistakes per minute, and "died: likely
  misclick": a game has at most one death, so per game each is a yes-or-no
  fact, which the session results and the after-game report already show.
  The plan's event for the fatal click's loss type on the live perf charts
  was not built either: the after-game report's heading names it, and the
  creator asked the same day not to copy data from a visible canonical
  place into a smaller one ("let's avoid copying data from a canonical,
  visible location, to some other smaller lcoation for "convenience"").
- Measurement notes per minute: old evidence, not performance.
- The session's course over played time: the compressed played-time axis,
  running averages and raw buckets, the time or per-game rate basis, the
  mode scope, the provenance strip, and the game markers existed only to
  chart a session minute by minute. The page has no such view now; every
  input to one stays in the saved records and traces
  ([Measurement](measurement.md)).
- Settings removed with it: `showSessionStats`, `sessionLookbackSeconds`,
  `sessionLookbackGames`, `sessionAggregation`, `sessionRateBasis`,
  `sessionModeScope`, `metricsPanelWidth`, `metricsPanelCollapsed`, the
  panel's scroll offsets in `viewPosition`, and the settings page's "left
  panel" group ([Personal settings](settings.md)).

## Ideas worth reusing

Answering the creator's question about the panel's product ideas: these
worked there and suit any future chart of values over time. The full
specification is in this file at commit d45a257.

- A y scale on the 1-2-5 ladder that grows the moment a line needs room and
  shrinks only when the tallest value fits within 80% of a lower step, so a
  climbing line never pushes the scale up and down (creator, 2026-08-23: "I
  hate when we're pushing up into new territory and shrinking, or the false
  appearance nothing is changing").
- Each line labeled at its newest point with name, value, and unit in the
  line's color, placed where it covers the least data, instead of a legend.
- A played-time axis that compresses breaks out, with a strip above the
  charts naming when the play happened, cut at local midnight and at breaks
  of 15 minutes or more.
- Thin markers for every finished game in its ending's color, with a compact
  hover: duration, lifetime rank, and time of day.
- Hovering a legend entry or a line's label thickens that line and fades the
  others.

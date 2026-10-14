# Daily play limits (creator request 2026-10-12; built the same day)

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/play-limits.md](../implementation/play-limits.md).

The request, in the creator's words: "Let someone set a personal time limit
per day of N minutes. It should reset at their 4am. They can remove it and
set it only with double confirmation. And removing it can't be done unless
the time limit isn't used up for the day or even more than two minutes have
been played! Other types of limits shall also be settable such as 100 total
games of each main level type (basic, expert, intermediate) etc. or, 50
games total ... Wall clock time, game count. Anyway please set it up in a
coherent and beautifully integrated way!"

## Requested behavior

- A daily play-time limit of N minutes.
- The day resets at the player's local 4:00.
- Setting and removing a limit each take two confirmations.
- Removing is refused once more than 2 minutes were played that day, and
  refused while the limit is used up.
- Game-count limits: per main level (Beginner, Intermediate, Expert) and for
  all games together.
- A limit by wall-clock time.

## Decisions (made while building, 2026-10-12; each open to the creator)

- **One play day for everything.** A play day runs from local 4:00 to the
  next local 4:00 (23 or 25 hours across a clock change). Every limit is per
  play day and every count resets at 4:00. A board that crosses 4:00 counts
  wholly toward the day it started in.
- **The limits.** Six, each optional and independent:
  - *play time*, in minutes (1–1440);
  - *games*, every board started: Beginner, Intermediate, Expert, Custom,
    in every mode (1–10000);
  - *Beginner games*, *Intermediate games*, *Expert games*: boards started
    on exactly that preset's size and mine count, in any mode (1–10000 each;
    "100 of each level" is three limits of 100);
  - *stop time*, the wall-clock limit: no new board from that time of day
    until 4:00 (a stop time of 4:00 closes the whole day). "Wall clock time"
    was read as a time-of-day stop; a limit on wall-clock time spent with the
    page open is not built (BACKLOG).
- **What counts.** Play time is game time, as the timer counts it: from the
  board going into play (first click, or the deal in Pregen 10 and trials
  with a given opening) to its end. A game is a board that went into play.
  Restarted (abandoned) boards count, both their time and as a game, so
  restarting is never a way around a limit. Play in every open tab adds up.
  Play before a limit was set still counts toward it that day.
- **When a limit is reached.** The board in play always finishes: stopping
  it would destroy a game the player is in the middle of. No new board can
  start until 4:00: the board shows "Done for today", the reached limits
  with their values, and "new games from 4:00" over the board frame (the
  frame keeps its size; nothing moves). The count limits are reached when
  the board that makes the count starts, so the 50th game is played and the
  51st is refused. A stop time that comes while a board is ready closes it
  at that minute, without a reload.
- **Changing a limit.** Tightening (adding a limit, lowering one, an earlier
  stop time) works any time. Loosening (raising, removing, a later stop
  time) is refused while today's play is over 2 minutes, and refused while
  that limit is reached, exactly as requested for removal. Raising is a
  partial removal, so the same rule covers it; otherwise "remove" could be
  had by raising to 1440 minutes.
- **Two confirmations.** Every change, tightening or loosening, opens a
  dialog: step one shows what is counted, today's use, the value field, and
  the loosening rule; step two is "Confirm again" with the change in large
  type. The second step's confirm button sits at the opposite side from the
  first step's Continue, so a double click cannot confirm. Step two checks
  the lock again at the moment it applies, since play in another tab can
  pass 2 minutes in between.
- **Where.** Limits are set only on the settings page, in a "Daily limits"
  panel at the top: one single-line row per limit with today's use, the
  limit, "reached" and "locked until 4:00" when they apply, and a Set or
  Change button. Today's use updates live while another tab plays. The
  game page shows a link at the start of the top bar, at the upper right
  (2026-10-14; in the side column before), only while a limit is set,
  "today: 12m 34s of 30m · 14 of 50 games", in red as "limit reached: ..."
  once one is reached. It updates when a board starts or ends, not every
  second, following the no-ticking-duplicates rule
  ([UI doctrine](ui-doctrine.md)).
- **Not a preference.** Limits are their own stored kind outside the
  settings schema: a preferences import or history import cannot lift one,
  and they are not exported. A stored limit this build cannot read stops
  the page with an error rather than being dropped, since dropping it would
  lift a commitment.
- **Limits of enforcement.** Limits live in this browser's storage. Clearing
  site data, another browser, or a private window starts without them; the
  feature is a commitment the player makes to themself, not a lock against
  a determined player. Closing a tab mid-game without the browser saving
  loses at most 5 seconds of that board's time.

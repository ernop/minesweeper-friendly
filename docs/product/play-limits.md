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
  it would destroy a game the player is in the middle of. What follows is
  the penalty (below). Once the day is closed, no new board can start until
  4:00: the board shows "Done for today", the limits that closed it with
  their values, and "new games from 4:00" over the board frame (the frame
  keeps its size; nothing moves). The count limits are reached when the
  board that makes the count starts, so the 50th game is played and the
  51st is refused (under the closed-at-once penalty). A stop time that
  comes while a board is ready closes it at that minute, without a reload.

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
  game page always shows a link to that panel, "daily limits", beside
  "settings" in the settings row at the page foot, the one place for the
  player's global configuration (creator 2026-10-20: "all usre-specific
  global configuration should be in the same place"). From 2026-10-14 the
  link sat at the start of the top bar at the upper right (creator request:
  "play limits button/info be on toplevel"; before, it showed in the side
  column and only while a limit was set). Once any limit is set, today's use
  against them is the top bar's whole content, plain bold text at the upper
  right, "today: 12m 34s of 30m · 14 of 50 games", in red as
  "no flags: ..." in the no-flags stage and "limit reached: ..." once the
  day is closed. It stays at the top while the link moved down: it is live
  status rather than configuration, and a refused flag press flashes it, so
  it has to be in view during play. (2026-10-14, under
  [One look per kind of thing](ui-doctrine.md): earlier that day the use
  replaced the link's own label, so a fact read as a button.) It updates when a
  board starts or ends, not every second, following the no-ticking-duplicates
  rule ([UI doctrine](ui-doctrine.md)).
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

## The penalty: no flags first (creator request 2026-10-14)

The request, in the creator's words: "i think that the default punishment
should be that after time is up, you LOST THE ability to mark mines. that's
the initial penalty setup; that lasts for 1/2 the time you set the
punishment to be, (or half the number of agmes or whatever) after that time
is up, you really have no perms at all. ofc someone cna also just set the
default punishment to be no playing instantly rather than initially just
losing marking permissions. i do think that, as the default punishment,
would be really funny".

Requested behavior:

- The default penalty: once a limit is reached, flags are taken away for
  half the limit again; after that, no play at all.
- The player can instead choose to have play stop at once.

Built the same day; decisions made while building, each open to the
creator:

- **Two penalties, one choice for every limit.** *No flags first* (the
  default): reaching a play-time or count limit starts a no-flags stage
  that lasts half the limit again, and the day closes at the end of it.
  *Closed at once*: the day closes when a limit is reached, as before.
- **How long the no-flags stage lasts.** Half the limit, in its own unit: a
  30-minute play-time limit is reached at 30m and closes at 45m; a 50-game
  limit deals games 51 to 75 without flags and refuses the 76th. Half a
  game count rounds up, so a limit of 1 or 5 still gets 1 or 3 games without
  flags.
- **A stop time closes at once under either penalty.** A time of day has no
  amount to halve. (One reading that would give it a stage: half the time
  from the stop time to 4:00. Not built: a 23:00 stop would then allow
  flagless play until 1:30.)
- **Which boards lose flags.** A board's permission is fixed when it goes
  into play, as a board in play always finishes: a board started before the
  limit was reached keeps its flags to the end, and every board dealt in the
  no-flags stage has none. While a board is ready it follows the day's stage
  as it changes (another tab's play can move it).
- **What "no flags" means.** A right press on a covered square places
  nothing; removing a flag still works, so a flag placed earlier never locks
  its square shut. Chords still work but need flags around a number to do
  anything. A refused press changes nothing on the board and is not saved
  in the input trace (as presses on a closed board are not); today's use in
  the top bar flashes a red outline to answer it.
- **What the player sees.** Today's use in the top bar reads "no flags: 32m
  10s of 30m, closes at 45m" (one part per set limit, the reached ones naming
  where they close) in red; once closed, "limit reached: 46m 02s of 30m and
  15m without flags", and the closed board lists the same. On the settings
  page a reached limit's row says "no flags, closes at 45m" or "closed".
- **The record says so.** A game played with flags blocked stores
  `flagsBlocked: true`, and its game details show "Flags: blocked by a daily
  limit", so a flagless game imposed by a limit is never mistaken for the
  player's choice to play without flags. Ranking needs no rule of its own:
  a game dealt without flags places no flags, so its win is a no-mark win
  and ranks among the no-mark games of its board and mode
  ([No-mark wins](rankings.md#no-mark-wins-decided-2026-10-14)).
- **Changing the penalty.** One line under the limits table, "when a limit
  is reached", with the current choice and a Change button, through the
  same two confirmations as a limit. Switching to closed at once tightens,
  so it works any time. Switching back to no flags first loosens, so it
  follows the loosening rule: refused while today's play is over 2 minutes
  or while any limit is reached. Like the limits, the penalty is its own
  stored kind, outside preferences, and is not exported.

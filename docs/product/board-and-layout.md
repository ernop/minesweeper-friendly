# Board and layout

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/board-and-layout.md](../implementation/board-and-layout.md).

## Board and chrome

- Classic Windows minesweeper skin; every icon is inline SVG; no
  dependencies, no build step.
- Cell numbers use a chunky face (Arial Black stack); the classic
  number-color palette (1 blue, 2 green, 3 red, ...).
- Number size follows the zoom (creator request 2026-10-14: at zoom 40 and
  above the numerals were "difficult to read"; "expand the numerals within
  the squares"). Up to 28 px a digit is about half the square's height; from
  40 px it is about two thirds, the classic proportion; 32 and 36 px sit in
  between, so no zoom step jumps. The face keeps its weight at every size.
- Number display (2026-08-23): a gameplay setting draws revealed counts
  as the classic digits (default), as letters A–H (A=1 … H=8), or as one
  colored dot per cell. All three use the classic color palette, so the
  color always carries the count; in the dots display it is the only
  carrier. Changing the setting repaints the board in place, mid-game
  included.
- The mark (the flag; creator request 2026-10-15: "the MARK to be very
  very visually distinct and not overlapping in color with any other
  item"). Its hue is magenta, reserved for the flag: no count color, the
  red hit square, the red wrong-flag cross, the bomb style's fuse, or any
  replay overlay uses it. The classic red pennant shared its red with the
  3s, the hit square, and the wrong-flag cross. A larger, black-outlined
  magenta flag was rejected minutes later ("too big ... same size as prior
  but with stronger colors and no black border").
- Flag controls (creator request 2026-10-15, "redo this more carefully":
  "control of the overall SIZE of the indicator on a gradient, as in, how
  much of the square it takes up", "control of the INTENSITY ... the
  brightness and strength of the color used", "another chooser for the
  overall STYLE of the indicator"; "the MINE marker is very important. The
  'exploded mine' marker is whatever", so the hit square has no controls).
  Three gameplay settings, all on the settings page:
  - flag style: classic (a magenta pennant on the black pole and base),
    pennant (a large pennant and pole, all magenta, no black), diamond,
    square, and ring, each solid magenta. Every choice shows a five-by-three
    board in play with three flags, drawn at the chosen size and strength.
  - flag size: a slider from 20% to 100% of the square's width in steps of
    5, numbered every 10. Default 45%, the classic flag's original size.
    Above 75% the flag reaches over the covered square's bevel.
  - flag color strength: a slider from 10 to 100 in steps of 10. 100 is
    full-strength magenta (`#ff00ff`, the default); lower values lose
    saturation and lighten toward the gray of a covered square.
  Both sliders show a notch at every step, a number at every 10 including
  both ends, and the current value large beside the name. Dragging redraws
  every board demo on the page at once (the mine-style boards show the
  chosen flag too); releasing saves. The replay's mark-mine badge and its
  legend swatch are the chosen flag. The problems page and the judgment
  tool draw the classic flag at the default size and strength: they do not
  read the game's settings.
- Mine style (creator request 2026-10-15: "5 variant visual styles for
  mines, which i'll be able to choose from visually in my config", at least
  two "more visually distinct and clear", as the enlarged numbers are): a
  gameplay setting picks how mines are drawn on a lost board, in replays,
  and in help boards. Classic (default) is the original Windows mine: a
  small ball with thin spikes at its original size. Bold is the same mine at
  heavy weight; sea mine is a large ball with six round-tipped horns; bomb
  is a round cartoon bomb with a lit fuse; star is a solid eight-point star.
  These four fill nearly the whole open square, matching the large digits.
  Every style is black with white highlights, so it reads on the silver
  square and on the red hit square, and a wrong flag is that style's mine
  crossed out in red. The settings page shows every choice on a small lost
  board beside its name (creator request 2026-10-15: the choosers "need to
  demo what each option really means, more"): five by three squares with
  counts, unflagged mines, the mine you hit, a flagged mine, a wrong flag,
  and a covered square, its counts drawn in the chosen number display.
  The number display choices likewise show the counts 1 to 8 as each
  draws them. The
  problems page keeps the classic mine: it does not read the game's
  settings. The style applies to the next board drawn, not a board already
  shown.
- Favicon (2026-08-23; letter and color revised same day): a raised
  minesweeper cell in the game's exact palette (silver face, light/dark
  bevels) carrying a blocky letter M in the board's strong classic blue
  (the "1" color — the first light-blue E was judged too light). One SVG
  (`favicon.svg`), linked from both pages.
- The status button is a dove (symbol of peace and kindness), not a smiley:
  it stays still throughout normal play, carries an olive branch on win,
  and becomes a broken heart on loss.
- Clicking anywhere in the titlebar (the whole top panel, not just the
  dove) restarts. Space bar also restarts, except when focus is in an
  input, textarea, or button, where Space types or activates. A focused link
  does not block it (changed 2026-09-27): Space never activates a link, so the
  old link exception only let the browser page the document down, moving the
  board under the cursor, and a difficulty tab keeps focus after its click.
- LCD counters are red seven-segment with visible gaps between digits (the
  digits must not crowd together).
- Zoom control: 16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 80, or 96 px cell sizes.
  Default 28 px. The chosen size is a saved preference: it survives reloads
  and visits to Settings, and travels with separate preference exports/imports. Zoom
  changes resize the current board in place and update trace geometry. It
  sits in the board display group with **position** and the pixel ratio,
  the last group of the settings row at the page foot
  ([Game setup, top bar, settings row, and footer](#game-setup-top-bar-settings-row-and-footer)).
  The group first became its own widget at the foot of the board column
  (creator request 2026-10-20: "split out the vision/zoom/pixel width
  section to a very bottom of page widget which has the same contents");
  from 2026-10-14 it was a group in the top bar, and before that Zoom sat at
  the end of the difficulty tabs.
- Pixel ratio (creator request 2026-10-14: "a new viz which shows your
  *browser* zoomlevel (just in case)"): the board display group shows
  "pixel ratio 2", the browser's device pixel ratio, updated the moment it
  changes. A page cannot read the browser zoom: the ratio is the browser
  zoom times the system display scale, and the two cannot be told apart. The
  creator's monitor runs at system scale 2 (5120 x 2160 shown as 2560 x
  1080), so there the readout is 2 at browser zoom 100% and 2.2 at 110%;
  labeling it "browser zoom" would claim 200%. It is the same number every
  trace stores as `environment.devicePixelRatio`. Its tooltip gives the
  definition.
- Mechanics: first click never a mine; flood fill; the right press flags (on
  the press, as in the official game, whatever the browser's menu timing);
  chording with press preview by a left click on a satisfied number or by both
  buttons held together over it, so the 1.5 click works (right press to flag,
  keep holding, slide onto the number, press left, release); once both
  buttons are down together the release chords and never reveals; a win
  leaves the board as the player left it (next item); loss shows the red hit
  cell and crossed-out wrong flags. Both-button chording and flag-on-press
  were added 2026-09-26 at the user's request: the official game has them,
  and their absence was an oversight, not a decision.
- Won board (user decision 2026-10-10, a deliberate departure from the
  classic game): classic Windows Minesweeper flags every remaining mine and
  sets the mine counter to 0 on a win; this game does neither. The won board
  shows only the flags the player placed, unflagged mines stay covered
  (every covered square on a won board is a mine, since a win means every
  safe square is open), and the mine counter keeps showing mines minus the
  player's flags. The user asked why the mines not yet marked "show up as if
  you HAD marked them" and rejected it: the automatic flags claimed marks the
  player never made, hid the flagged/unflagged split the game measures
  (markless wins, the unflagged-mines share, unused correct flags), and were
  saved into each win's trace as its final board.

## Startup readiness

User report (2026-09-25): the board appeared to be playable while startup
was still preparing the game, so attempts to click it were frustrating.

- Keep the board and its restart panel concealed until saved settings,
  history, the selected game/replay view, and layout restoration are complete.
  Their first visible frame must accept the input appropriate to that view.
- Show “Preparing your game…” during that work, without drawing a dummy
  covered board. Reserve the board's space while preparing it; revealing it
  must not move surrounding content.
- Space must not restart the game during startup. Loading failures keep
  the board concealed and display the actual failure in the startup status.

## Preparation and completion cost

User direction (2026-09-25): review delays while a game prepares to draw
itself and while the previous game finishes. Reduce the underlying
algorithmic cost and repeated work, rather than only hiding the wait or
moving the same work behind a loading indicator. Preserve measurement
and ranking definitions; verify improvements with scaling measurements
and equivalent-output tests.

### Analysis must not block play (requested 2026-09-25)

Trend fitting, trace reconstruction, live motion analysis, session summaries,
rankings, chart preparation, and board benchmarks run in background workers. Loading a saved finished board exposes its restart and replay controls before
statistical reconstruction finishes. Starting the next game and board input never wait for these calculations. Report jobs capture the finished
game; a late reply can complete that game's data but cannot replace a newer
board or view. Pending analysis is shown as pending, and worker failure is a
visible error, never a synchronous substitute. Presentation stays on the UI
thread and must yield between substantial report sections.

Improve the algorithms as well as moving them: exact Theil–Sen fits retain
all eligible observations and the specified median slope/intercept; sampling
may guide exact selection but must not approximate the reported fit.

### Input latency (user report 2026-09-26)

User report, playing the GitHub Pages site in Firefox on the PC: "even
clicking the first square to open, or the 10th, as i play, feels somehow
laggy"; asked whether the game is "max efficient" and to test and fix it.

- A board input's visible response must not wait on measurement.
- Tracked latency budgets (creator request 2026-09-26: "add in tests
  measuring and tracking the timing for all these things such as new game,
  1st click of new game, etc and we shall be able to monitor them over time
  as we change things, so that we never again let the system get slow").
  Cut to basics the same day ("keep just basic timing stuff please so we
  notice if we megaslowdown again"): a check of about 10 seconds times page
  load, new game, the first click and a dozen more, the click that shows a
  mine, the freeze after a game ends, and switching to expert. Each input is
  timed as the game's own work and as time to screen. Exceeding a limit fails
  the check; recorded runs keep the history in the repository
  ([how to run](../implementation/verification.md)).
- Limits per machine (creator request 2026-10-18, after the first run on the
  Windows laptop failed the limits set on the Linux PC while the previous
  release failed them by as much there: "i suggest adding labels so that we
  can track and notice & prevent regressions appropriately for each"). The
  same code takes different times on different machines and browsers, so
  each machine has a label, its own limits, and its own runs in the history;
  a run is judged only against its own machine's limits and earlier runs.
- The check runs at each change, not only at the push (creator decision
  2026-10-26). The creator asked: "do you think we should run timing tests at
  the point we change code, rather than waiting til we push it? or is tehre
  some reason for dealying?" The recommendation was to run it whenever a change
  to gameplay, game end, storage, startup, or result presentation is finished,
  keep the recorded run for the push, and add the time from a long Expert win
  to its full results; the creator answered "make the chagen." Run at each
  change, a slowdown shows at the change that caused it instead of at a push
  that bundles several. The Expert win was added because earlier that day a
  change that doubled the after-game analysis passed the check, which timed
  only the page's own handlers; that analysis runs in a worker, and the time
  from the winning click to the full results on screen now counts it. The
  check takes about 13 seconds on the PC.
- Latency limits are tight, not generous (creator decision 2026-09-26: "If
  we're getting three milliseconds now, 30 milliseconds now, degrading to 100
  milliseconds per click is absolutely unacceptable ... It's very important
  that we don't slow down the click frame. That doesn't mean testing it a
  zillion times in a 12-minute long test ... It means testing it one time
  properly."). Each limit sits just above today's measured time in Firefox,
  and a click must reach the screen within two frames (34 ms). Limits tighten
  when the code gets faster. Time with no logical reason to exist counts as
  waste to remove, not as a baseline to protect; measured 2026-09-26 and not
  yet cut: new game (26–28 ms of work in Firefox), switching board size
  (20–21 ms), and the freeze after a game ends (82–91 ms).
- Click-time evidence (the visible-position proof, guess odds, and Justice
  certification) keeps its exact definitions and results; only its cost
  may change. Built 2026-09-26: expert flags, chords, and guesses that took
  up to about 0.6 s in Firefox now take a few milliseconds, with a rare
  proof-budget case near 0.1 s
  ([measurements](../implementation/board-and-layout.md#click-time-evidence-cost-2026-09-26)).
- Motion stats sample at most four times a second during a game, and draw
  nothing while their section is closed ([Motion stats](motion-stats.md)).
  The session charts, which redrew once per 10-second session step, left
  with the left panel on 2026-10-20 ([Session stats](session-stats.md)).
- Finishing a game must not rewrite the whole history. Found: every finished
  game rewrote the entire stored history twice (160 MB for the player's
  6,407 games), blocking input for roughly a second each time, including
  the first clicks of the next board. Each game now writes only its own
  record ([Storage](storage-and-history.md)).

## Game setup, top bar, settings row, and footer

Creator requests 2026-10-20. First: "move the dropdown picker for mode to
where current "custom" is. make the curent "custom" just one opton on that
list", "when needed, generator shall show up next to the dropdown for mode;
ofc, modes such as the three default (beginner, intermediate, expert) have
no need to see this", and split the board display into "a very bottom of
page widget". Then: "beg, int, exp are "all-in-one settings choosers". when
a user choose a mode besides those from the dropdown they shoudl only then
be presetned with the variant and other options. that way, simple or new
users who only want to play the standard modes don't need to be confronted
with any other ui elemtns", "for inner modes like for example NG ... they'd
be in a custom mode overall, then pick the board size and minecount and
logic etc subsequently", "you may add other pages as links in the footer
... move them to the bottom so they aren't cluttering up the top", and
"all usre-specific global configuration should be in the same place.
simlify the mode pickers. i don't like the current layers wqhich are
duplicative and needlessly complex."

- **Game choice row**, at the top of the board column, centered: the Game
  details button (only while the details are the popover), **Beginner**,
  **Intermediate**, **Expert**, and the **other modes** menu. A preset link
  is a whole choice: its board, Standard play, and the default generator.
  A player who picks presets sees nothing else above the board: no size
  fields, no generator, no mode status.
- The **other modes** menu reads "other modes" while a preset is chosen. It
  lists Custom (Standard play on a board the player sizes) and then every
  other mode, one level deep: 3BV countdown, Angelic, Endgame drill, Trial,
  Short trial, Test trial, and Board lab ([Play modes](play-modes.md)). Choosing an entry makes the game
  custom: it plays on the player's custom board, the last size applied in
  the mode options row (Expert's 30 x 16 with 99 mines until one is), and
  the menu shows that mode's name in bold, as the chosen preset link is
  bold. Choosing a preset link again returns to Standard on that preset.
- **Mode options row**, directly under the game choice row, only for an
  entry from the other modes menu: Width, Height, Mines, and **Update**
  (the one board-size form, for every such mode, Board lab included); the
  **Generator** menu when the mode places mines with a generator, so not for
  the trials ([Board generators](board-generators.md)); and the mode's own progress
  (a trial's progress and its **end trial** button, 3BV countdown's board
  count, the Endgame drill's line). Board lab adds its panel below the row:
  its note, the chosen generator's parameter sliders, and **make new
  board**. Until 2026-10-20 the preset links sat beside a Custom tab, the
  Mode and Generator menus sat in the details column, and Board lab had a
  second size form of its own.
- **Top bar**: today's use against the daily limits, as plain text once
  any limit is set ("today: 12m 34s of 30m · 14 of 50 games", red once one
  is reached; [Daily play limits](play-limits.md)), then the **settings**
  button (the settings page) at its right end. Today's use is live status,
  not configuration, so it stays in view: a refused flag press flashes its
  outline. With the details column docked the bar sits above it at the
  page's upper right, sticky with it; with the Game details popover it sits
  above the board column, right-aligned; below 700px it is the first row.
  Without limits it holds only settings. The settings button returned here
  on 2026-10-21 (creator: "move "settings" to upper right."); from
  2026-10-20 it sat in the settings row at the page foot, and from
  2026-10-14 to 2026-10-20 the bar also held the daily limits link, the
  session picker, and an "other pages" menu.
- **Settings row**, at the page foot under the motion stats section and the
  backup row: the rest of what the player configures for every game, in
  three groups:
  1. **daily limits** (the settings page's limits panel), always shown and
     always so labeled.
  2. The session picker labeled "session"
     ([One session definition](game-data.md#one-session-definition)).
  3. The board display: Zoom, **position**, and the pixel ratio.

  Items within a group sit 6px apart and groups 22px apart; a group never
  splits across rows. Per-mode choices (board size, generator) are not
  global and stay in the mode options row.
- **Footer**, the last line: links to the other pages, self-check, training,
  and problems, then "play on Fuseki". They were an "other pages" menu in
  the top bar from 2026-10-14 to 2026-10-20.

## Layout: the board never moves

- The page has two columns: the board with its tablecharts, and the
  details column (live perf charts, game data, and game details). The
  details column is reserved before a game finishes; results and replay
  never change the board column's width.
- A third column at the left held the session and live motion stats until
  2026-10-20 ([Session stats](session-stats.md)). The motion stats are now
  an open/close section at the page foot ([Motion stats](motion-stats.md)),
  so nothing beside the board comes or goes with them.
- The archive alert and the play context line (the music state and the
  player states that are on, as tags, with the **edit states** button;
  [Player states](player-states.md)) stay at the top of the details column.
- One details column (creator 2026-10-17, of the laptop layout with game data
  docked between the board and a 320px details column: "it's too compressed!
  Let's make the entire rightside (two columns) into one, and make the upper
  part be things like "intermediate" and "win" ... (actually, remove the
  date) and make the rest part of the UI, which can compress/shrink, so
  there's proper room for during-game, game-average, and board-profile stat
  sections. and, each of those shall be toggleable open/closed so that we use
  space well and can expand to be visible enough."). The separate game data
  column (2026-09-23 to 2026-10-17) is gone; everything right of the board is
  one sticky column, top to bottom:
  - No outcome line (creator request 2026-10-20: "remove this text saying
    'Win beginner.' I was certain we'd already removed it, but anyway,
    remove it again"). The dove face shows win or loss and the board tabs
    show the board; "no-mark" stays in the stats ("0 - markless") and the
    no-mark lifetime list. From 2026-10-17 the column opened with "Win" or
    "Loss" and the board ("Win Expert · no-mark"); until 2026-10-19 it
    named the mode and generator too. Only the High scores view keeps a
    head line: "High scores" and its board, then "Latest win" or "No wins
    yet", since nothing else on screen says the view is not a game.
  - The archive alert and the play context line with **edit states**, then
    one row holding see scores. Mode and generator moved to the game setup
    rows above the board on 2026-10-20, and Replay game became the
    transport under the board. The row also held the Overlays button (the
    replay's board overlays and mouse path) until 2026-10-21, when those
    toggles moved under the transport ([Path and choice
    replay](replay.md)).
  - "live perf charts" ([During the game](during-game.md)), a stat section
    titled by a button that opens and closes it (its (?) was removed
    2026-10-20); then game data's one chart ([Game data](game-data.md)),
    whose two sides, "game summary perf" and "board traits", share its
    percentile bar (creator 2026-10-17,
    after the first build split them into two sections with a bar each:
    "its necessary / hoped for that "board traits" and "your perf" share the
    same percentile distribution chart"). Each side's title opens and closes
    that side the same way. Each open or closed state is a remembered panel
    (`duringGame`, `gamePerformance`, `boardTraits`), open by default, kept
    across games and reloads. After a loss the column holds live perf
    charts and the loss's statistics.
  - Game data's chart takes the column height left below everything above
    it, so its options row stays at the screen's bottom. It keeps at least
    240px per open side, and the column scrolls below that rather than
    crushing it. A closed side keeps only its title and the open side takes
    its room; with both sides closed the chart is one line holding the two
    titles. Closing "during this game" lets the chart fill the column.
- Board in the middle (creator decision 2026-10-07: "perhaps the session sum
  could be to the left of the board, ranks won to the right, board in
  middle? that's okay"): the board always centers in its column. This
  supersedes the 2026-09-23 decision that the board rest against game data
  ("Sit right next to the game data column; my saved position then counts
  from there"), which had left an empty area about 1,000 x 330 px wide on the
  first screen left of a Beginner board at 2560 px. A zero position offset is
  the centered place, so finishing a game never moves the board.
- Beside the board (same decision): after a game, the session summary rests
  left of the board frame and ranks won right of it, 16px from the frame
  (from the replay transport where that is wider than a small board),
  tops aligned with the board. Each goes beside the board only where its
  whole width fits inside the board column (8px from its edges); otherwise
  it stays at the head of the table list under the board, summary first.
  Both keep their places at the head of the table list's DOM order, so the
  table order rule is unchanged. The tables below start after the board and
  its transport or after the lower of the two side blocks, whichever ends
  lower. On the
  creator's 2560 x 970 viewport both fit beside a Beginner board; beside an
  Intermediate board the room is about 379px each side, narrower than the two
  blocks with production history (about 391 and 418px), so both lead the
  tables instead. The side blocks never move the board.
- The board is the anchor. Appearing or disappearing content must not move it.
  Its reserved startup space occupies the same explicit main column.
- The archive alert, session tags, optional display
  controls, the stat sections or completed-game stats, and the full replay
  legend share the right details column in that order. They are in
  normal flow inside an independently scrollable, sticky column. Stats precede
  the legend, so changing replay frames does not move the stats. These panels
  never cover the board or tablecharts and never add height between them.
- Details column sizing (2026-10-17, replacing the 2026-09-23 split between
  a game data column and a 320px details column): the column prefers a
  share of the window width, 46% by default, and gives way to the board
  column, which keeps the larger of the board and 640px (the ranks-won
  summary plus a table beside it), down to 320px. Below that the Game
  details popover takes over, `max(420px, 60vw)` within the viewport, so
  widening the column never undocks a board that fit beside a 320px column.
  On a 1504px laptop window with the stats panel open (until 2026-10-20) it
  was about 450px wide by default.
- Resizable details column (creator 2026-10-17, of the details column with
  game data: "you must allow that section, also, to be widenable/narrowable
  with mouse", the stats panel's right edge being the existing drag grip):
  the docked column's left edge is a drag grip in the gap between the board
  column and the details column, the height of the column, marked by a thin
  line that highlights on hover and while dragging. Dragging left widens the
  column and dragging right narrows it, within the same limits (320px, and
  the board column's room); the board recenters in its column, and the
  during-the-game charts and game data follow the pointer each animation
  frame rather than catching up on release. Release saves the width as the
  `detailsColumnShare` setting, a share of the window width, so the column
  keeps its proportion when the window changes size. With keyboard focus on
  the grip, the left and right arrows widen and narrow the column by 10px.
  The grip is absent while the details are the Game details popover.
- When the board and side columns cannot fit, a bordered **Game details**
  button opens the same details as a native popover. Close, Escape, or clicking
  outside dismisses it. Opening it does not reflow the board or history.
  This mode depends on viewport, board, and metrics-column widths, never on
  whether a result or legend exists. Below 700px, session metrics occupy a
  bounded scroll area above the game.
- The replay transport sits directly under the board once a game ends,
  like a video player's controls
  ([Path and choice replay](replay.md)). It is as wide as the
  board (at least 340px, at most the board column) and centered under it.
  It adds its height between the board and the tables but never moves the
  board. Its foot holds the replay's view toggles, board overlays then
  mouse path, wrapping within its width; score controls stay in the details
  column. Replay arrow shortcuts apply while the transport is visible.
- The tables begin directly below the board when no action report is shown.
  The session summary and the time-period summary ("ranks won in session",
  today by default) lead them, unless they sit beside the board (above);
  then come the time/category, streak, near-streak, and near-near-streak
  tables. All share one continuous, left-aligned wrapping list without a
  section heading. A separate **This
  board** section follows (2026-09-21): exact 3BV, ZiNi, HZiNi, maximum number,
  has-7/8, maximum-clue caps, zero-count, mine-island count, and enabled
  largest-island tablecharts. Each table keeps its own identifying label.
  Both sections precede the your-perf charts, the board-trait charts, and
  relationships; the motion stats section follows them at the page foot
  ([Motion stats](motion-stats.md)).
  HZiNi, 3BV spread, 0–1 share, and zero-opening coverage values appear in
  their tablechart headings; there are no separate value cards. The
  3BV-spread tablechart is off by default (user decision 2026-09-23: "i don't
  think we need to show 3bv spread by default"). Game data's board-trait
  rows, the 3BV spread marker among them, are chosen in its configure since
  2026-10-14, not by these switches ([Game data](game-data.md)). Heading
  mouseovers/focus expose definitions, more precise values, and grouping
  rules without moving the layout. Backfill progress stays above the tables.
  After a loss these comparison families describe the lost board, including
  when no wins exist yet; the upper period/streak tables retain the latest
  win history without marking the loss.
- The scrollbar gutter is reserved so page growth cannot move the board.
  Stats and legend height affect only their own scroll column. Only board
  Justice callouts reserve any overhang before the following content.
- Replay legends are built offscreen and replaced together, so rebuilding
  them cannot temporarily collapse the column and reset its scroll position.
- Layout runs on geometry changes, never a periodic stats-refresh timer, and
  preserves page and sidebar scroll. Layout corrections allocate space;
  they do not raise z-index to conceal collisions between ordinary content.
- Position stores independent X/Y pixel preferences, editable by drag,
  arrows, labeled sliders, or numbers. Offsets count from the board's
  centered resting place (2026-10-07; formerly from beside game data). A
  saved offset therefore now moves the board from the center. Sidebar controls
  remain outside its translation. Applied offsets keep a board that fits at
  least 8px inside the board column and the viewport and 8px below the game
  setup rows, the lowest of the game choice row, the mode options row, and
  the Board lab panel (an oversized board keeps its overflow), without
  rewriting the saved preference. A trial's lobby and review show no board,
  so no offset applies to them.
- The position editor follows the board, normally directly below it, on all
  screen widths. It switches sides when needed and stays within the visible
  viewport during dragging, scrolling, resizing, and zooming. Reset (both
  offsets to zero, the resting place) and a prominent Done button stay at
  the top of the editor; Escape also closes it.
  The editor does not change the board's position or page layout. Its
  **position** opener is in the settings row's board display group at the
  page foot, after Zoom (2026-10-20; from 2026-10-14 the same group sat in
  the top bar). Opening or closing the editor never scrolls the page to the
  opener. It holds a pressed look while the
  editor is open. Closing the editor returns keyboard focus to
  the opener; loading the page does not (until 2026-10-14 every load gave
  the opener focus and its focus ring).
- The results area echoes the in-game numeral face (Arial Black stack);
  the game-data chart inside it uses regular Arial.

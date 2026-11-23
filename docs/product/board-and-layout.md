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
- Number size and mine size (creator request 2026-11-05: the board's glyph
  sizes "shall be an adjustable setting", and if "the normal settings UI"
  could not adjust them, "it should be modified to allow me to do so").
  Two gameplay sliders on the settings page, each under the choice it sizes:
  - number size, under number display: 50% to 120% of a count's standard
    size at the chosen zoom (the size above), in steps of 5, numbered every
    10. Default 100%. It sizes digits, letters, and dots alike. Its ceiling
    keeps the widest letter, G, inside its square at the largest zoom.
  - mine size, under mine style: 50% to 100% of the style's own size, in
    steps of 5, numbered every 10. Default 100%. Every style but classic
    already fills nearly the whole open square, so no mine grows past its
    own size. It sizes every mine drawing: the crossed-out wrong flag and a
    replay's proven mines too.
  They work like the flag sliders: dragging redraws every board demo on the
  page, releasing saves, and the game page applies them when it loads. The
  problems page and the judgment tool draw counts and mines at 100%: they
  do not read the game's settings.
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
  and on game data's example boards. Classic (default) is the original Windows mine: a
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
  check takes about 15 seconds on the PC.
- Latency limits are tight, not generous (creator decision 2026-09-26: "If
  we're getting three milliseconds now, 30 milliseconds now, degrading to 100
  milliseconds per click is absolutely unacceptable ... It's very important
  that we don't slow down the click frame. That doesn't mean testing it a
  zillion times in a 12-minute long test ... It means testing it one time
  properly."). Each limit sits just above today's measured time in Firefox,
  and a click must reach the screen within two frames (34 ms). Limits tighten
  when the code gets faster. Time with no logical reason to exist counts as
  waste to remove, not as a baseline to protect; measured 2026-09-26: new
  game (26–28 ms of work in Firefox), switching board size (20–21 ms), and
  the freeze after a game ends (82–91 ms). Cut by 2026-10-26: new game to
  7–13 ms, switching to 9–10, the freeze after a game ends to 33–66 ms, and
  a long Expert win's full results from 216–224 ms to 132–152; what remains
  is listed in [BACKLOG.md](../../BACKLOG.md), "Input latency follow-ons".
- A game's full results may take longer; play may not (creator decision
  2026-11-03: "let's just display things as they come in, so nothing blocks
  other stuff ... during-game play speed is totally unimpacted; the display
  of the result (win/die) is unaffected, and AFTER t hat, data comes in ...
  as long as the user isn't blocked, budgets can be raised"). Results show
  part by part as their data arrives
  ([Results come in as their data arrives](results.md#results-come-in-as-their-data-arrives-creator-decision-2026-11-03)).
  The limits on play, on the winning click, and on freezes stay tight; only
  the limit on the time to a game's full results may be raised. So the check
  also times the winning click (its own work and its time to screen) and the
  longest freeze in the two seconds after it. Its Expert game now places one
  flag, so the win is ranked among the history's Expert wins and its results
  draw every chart; the full-results limit on the PC went from 165 to 525 ms
  (measured 386-520 at system load up to 5; the code before took 448-527 in
  runs alternating with it; the judgment, made in the reports worker after
  the game since that day, takes about 115 of them, and the charts' models
  about 140). The freeze after a game ends was cut to 26-31 ms, so its
  limit went from 70 to 35.
- Click-time evidence (the visible-position proof, guess odds, and Guardian Angel
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

- **Game choice row**, centered in the page head above the top stage:
  **Beginner**, **Intermediate**, **Expert**, and the **other modes** menu. A
  preset link is a whole choice: its board, Standard play, and the default
  generator. A player who picks presets sees nothing else above the board: no
  size fields, no generator, no mode status. (Until 2026-11-19 a **Game
  details** popover button also appeared here on narrow screens; the adaptive
  details dock below the board replaced that popover.)
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
  is reached; [Daily play limits](play-limits.md)), then the **daily
  limits** button (the settings page's limits panel, always shown and
  always so labeled), then the **settings** button (the settings page) at
  its right end. Today's use is live status, not configuration, so it
  stays in view: a refused flag press flashes its outline. Above 1120px it
  shares the page head with the centered game choice row at the page's upper
  right; at 1120px and below it stacks cleanly right-aligned above the game
  choice row so neither collides. Without limits it holds
  the two buttons. The daily limits button returned here on 2026-10-22
  (creator: "move "daily limits" control button back up to UR") and the
  settings button on 2026-10-21 (creator: "move "settings" to upper
  right."); from 2026-10-20 each sat in the settings row at the page foot,
  and from 2026-10-14 to 2026-10-20 the bar also held the session picker
  and an "other pages" menu.
- **Settings row**, at the page foot under the motion stats section and the
  backup row: the rest of what the player configures for every game, in
  two groups:
  1. The session picker labeled "session"
     ([One session definition](game-data.md#one-session-definition)).
  2. The board display: Zoom, **position**, and the pixel ratio.

  Items within a group sit 6px apart and groups 22px apart; a group never
  splits across rows. Per-mode choices (board size, generator) are not
  global and stay in the mode options row.
- **Footer**, the last line: links to the other pages, self-check, training,
  and problems, then "play on Fuseki". They were an "other pages" menu in
  the top bar from 2026-10-14 to 2026-10-20.

## Layout: board position first, adaptive details dock, full-width sections

Revised 2026-11-19 (creator approved Option 1 with sub-choices A and B,
following his 2026-10-26 report that "position" blocked moving an Expert
board right at Zoom 36 and his 2026-11-19 request to prioritize board
location across the full viewport and standardize the framing and flow of
the remaining after-board chunks without altering their internal tables or
charts).

- **Single-column full-width page with a board-first top stage**: the page
  no longer reserves a permanent right-hand column beside the board and
  every lower section (that two-column split ran from 2026-09-07 to
  2026-11-19, with a third left stats column removed on 2026-10-20).
  Instead:
  1. **Zone 1 (top stage)**: the board is placed **first** across the full
     page width, with `boardOffsetX = 0` centered in the full viewport. The
     player can drag or set **position** anywhere inside the full stage
     width (8 px edge inset) and below the game setup rows without any
     details-column reservation blocking travel.
  2. **Adaptive details dock**: after the board is placed, the details
     column (archive alert, play context with **edit states**, **see
     scores**, live perf charts, game data, and the replay legend) docks
     into whichever free flank of the board has more room (right on ties)
     whenever that flank holds at least 320 px outside an 18 px gap and the
     viewport is wider than 700 px. Moving the board right automatically
     flips the dock to the left flank; moving the board left widens the
     right flank. The footprint reserves the replay transport's minimum
     width (340 px) so ending a small board never shifts the dock.
  3. **Below-board full-width fallback (no popover)**: when neither flank
     holds 320 px or the viewport is 700 px or narrower (for example an
     Expert board centered on a 1440–1504 px laptop or a narrow window),
     the details dock drops directly below the board at 100% page width
     instead of hiding behind a **Game details** popover. At 900 px and
     wider when both live perf charts and game data are present, they sit
     side by side in two equal fluid columns; below 900 px or when only one
     is present they stack cleanly at full width.
  4. **Zone 2 (full-width after-board sections)**: below the top stage,
     every section spans 100% of the page width in a consistent vertical
     stack: after-game report (when shown, with its own arrow opener),
     upper tables (overview row then rankings), This board, your perf,
     board traits, relationships, motion stats, backup, settings row, and
     footer.
- **Details dock contents** (unified into one column on 2026-10-17, creator:
  "make the entire rightside (two columns) into one ... each of those shall
  be toggleable open/closed so that we use space well"):
  - No outcome line (creator request 2026-10-20: "remove this text saying
    'Win beginner.'"). Only the High scores view and Old game view keep a
    head line, since nothing else on screen says the view is not the current
    game.
  - The archive alert and play context line with **edit states**, paired
    with **see scores** on one wrapping line.
  - "live perf charts" ([During the game](during-game.md)), a stat section
    titled by a button that opens and closes it; then game data's one chart
    ([Game data](game-data.md)), whose two sides, "game summary perf" and
    "board traits", share its percentile bar. Each open or closed state is
    a remembered panel (`duringGame`, `gamePerformance`, `boardTraits`),
    open by default. After a loss the column holds live perf charts alone;
    the loss's statistics are the "this game" table in the overview row
    below the board (creator 2026-10-26,
    [This game's stats](results.md#this-games-stats-creator-request-2026-10-26)).
  - When docked beside the board, game data's chart takes the column height
    left below everything above it (keeping at least 240 px per open side,
    scrolling below that rather than crushing it). In band view, when live
    perf charts is absent (High scores) or closed, the docked details
    column caps its height to `max(580px, boardAreaHeight)` within the
    available viewport height so the lone band stays compact alongside the
    board instead of stretching to the viewport foot. When docked below the
    board, it flows at full readable height (matching live perf charts when
    side by side).
  - The replay legend follows stats inside the same details dock, so
    changing replay frames never moves stats, and neither moves the board.
- **Resizable docked details**: when the details dock sits in the left or
  right flank, its board-facing edge holds a drag grip in the 18 px gap
  (right edge when docked left, left edge when docked right), matching the
  dock's height and highlighted on hover and drag. Dragging widens or
  narrows the dock between 320 px and the free flank's room without ever
  moving the board; live perf charts and game data follow each animation
  frame. Release saves `detailsColumnShare` (default 0.46 of window width).
  Keyboard Left/Right arrows step 10 px. The grip is absent when the dock
  sits below the board.
- **The board is the anchor**: appearing or disappearing results, replay
  controls, hover cards, or lower sections never move the board. The
  scrollbar gutter is reserved so page growth cannot shift the board.
  Top-stage `min-height` reserves room for the docked details panel and any
  board Guardian Angel callout so sections below never overlap them.
- **Replay transport**: sits directly under the board once a game ends
  ([Path and choice replay](replay.md)), sized to
  `min(stageWidth, max(340px, boardFrameWidth))` and centered under the
  board (moving with its saved translation). Its foot holds the replay's
  view toggles, board overlays then mouse path.
- **After-board sections** (standardized 2026-11-19):
  - When an after-game report is shown, it uses the same full-width arrow
    opener ("after-game report", remembered in `panels.resultAnalysis`,
    default open) with a 1 px black underline.
  - The upper tables start directly below the top stage (or report). First
    is a full-width wrapping overview row holding the session summary
    ("session"), "ranks won in session", and after a loss "this game" stats
    side by side in DOM order (stacking cleanly on narrow viewports).
    Beside-board table snapping (`placeBoardSides`, used 2026-10-07 to
    2026-11-19) was removed so overview tables stay predictable and never
    jump when the board moves, and the `.session-tables` float wraparound
    was replaced by the clean full-width row. Below the overview row sits
    the full-width "rankings" group (time, category, and streak tables
    sharing one opener and consistent vertical padding/baseline across
    clickable and non-clickable tables).
  - **This board** follows at full width, then **your perf**, **board
    traits**, and **relationships** (each using a left-aligned responsive
    CSS grid of 270 px chart cards without changing each chart's internal
    SVG/canvas geometry), then **motion stats** at the page foot (a
    left-aligned responsive grid of 230 px cards with matching black-rule
    subheadings).
  - HZiNi, 3BV spread, 0–1 share, and zero-opening coverage values appear in
    their tablechart headings; 3BV spread stays off by default. Heading
    mouseovers/focus show definitions without moving layout.
- **Replay legends** are built offscreen and replaced together so
  rebuilding them cannot collapse the dock and reset scroll. Layout runs on
  geometry changes, never a periodic stats-refresh timer, and preserves
  page and dock scroll.
- **Position editor**: stores independent X/Y pixel preferences, editable
  by drag, arrows, labeled sliders, or numeric inputs. Offsets count from
  the board's viewport-centered resting place (`0, 0`). Applied offsets
  keep a board that fits at least 8 px inside the full stage width and the
  viewport and 8 px below the lowest visible game setup row (an oversized
  board keeps its overflow), without rewriting the saved preference. The
  X and Y sliders dynamically show the actual movable `[min, max]` range
  and labeled ticks for the current board and viewport, and dragging/arrow
  keys start from the applied position with zero dead zone. A trial's lobby
  and review show no board, so no offset applies to them.
  The editor panel follows the union of the board and (when visible) its
  replay controls so opening it after a finished game never covers the
  replay transport, staying within the visible viewport, with Reset and
  Done at the top and Escape to close. Clicking **position** in the
  settings row scrolls the board into view when the board is off-screen;
  reloading with the editor open or closing it never scrolls the page, and
  closing returns focus to the **position** button in the settings row.
- **Typography** (unified 2026-11-19, sub-choice A): all after-board
  sections (`#result-analysis`, `#result-ranks`, `#pregen-charts`) share
  regular `Arial, Helvetica, sans-serif` (bold headings and tabular values)
  with `#game-sidebar` and `#motion-stats`. Only board `.cell` numerals and
  live Guardian Angel callouts keep the chunky `Arial Black` face.

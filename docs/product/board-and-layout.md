# Board and layout

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/board-and-layout.md](../implementation/board-and-layout.md).

## Board and chrome

- Classic Windows minesweeper skin; every icon is inline SVG; no
  dependencies, no build step.
- Cell numbers use a chunky face (Arial Black stack); the classic
  number-color palette (1 blue, 2 green, 3 red, ...).
- Number display (2026-08-23): a gameplay setting draws revealed counts
  as the classic digits (default), as letters A–H (A=1 … H=8), or as one
  colored dot per cell. All three use the classic color palette, so the
  color always carries the count; in the dots display it is the only
  carrier. Changing the setting repaints the board in place, mid-game
  included.
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
  input, textarea, button, or link.
- LCD counters are red seven-segment with visible gaps between digits (the
  digits must not crowd together).
- Zoom control: 16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 80, or 96 px cell sizes.
  Default 28 px. The chosen size is a saved preference: it survives reloads
  and visits to Settings, and travels with separate preference exports/imports. Zoom
  changes resize the current board in place and update trace geometry.
- Mechanics: first click never a mine; flood fill; right-click flags;
  left-click chording with press preview; win auto-flags remaining mines;
  loss shows the red hit cell and crossed-out wrong flags.

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

## Layout: the board never moves

- The page has separate columns for session/motion metrics, the board and
  tablecharts, game data, and game details. The game data and details columns
  are reserved before a game finishes; results and replay never change the
  board column's width.
- The metrics column always exists: its "session" heading at the upper left
  is the page's one session picker (user decision 2026-09-23;
  [One session definition](game-data.md#one-session-definition)). The
  former session chooser above the board column's difficulty tabs is
  removed.
- Game data column (user decision 2026-09-23: "a full-height column right
  next to the board", empty during play): a sticky column of the full viewport
  height between the board column and the details column. It is empty during
  play and after losses, and holds the winning game's chart. It is reserved
  only when a win can plot the chart (the chart is enabled and the mode is not
  a trial). It docks when the board column keeps at least the board and 640px
  (the ranks-won summary plus a table beside it) with the column at 360px or
  more and the details column at its 320px minimum. It then takes
  `clamp(360px, 24vw, 760px)` of the remaining room. Otherwise the chart
  falls back to the details column as described below.
- Board beside game data (user decision 2026-09-23, "Sit right next to the
  game data column; my saved position then counts from there"; this later
  answer supersedes the same day's earlier "keep centering"): whenever game
  data has a column beside the board column (its own column, or the details
  column holding it), the board rests against the board column's right edge,
  8px in, instead of centering. A zero position offset is that resting
  place. With no chart column beside it (chart hidden, trial modes, compact
  details), the board centers in its column. The choice depends only on the
  viewport, board, and metrics-column widths, the chart setting, and the
  play mode, so finishing a game never moves the board.
- The board is the anchor. Appearing or disappearing content must not move it.
  Its reserved startup space occupies the same explicit main column.
- Mode, generator, session tags, settings, optional replay/display controls,
  completed-game stats, and the full replay legend share the right details
  column in that order. They are in
  normal flow inside an independently scrollable, sticky column. Stats precede
  the legend, so changing replay frames does not move the stats. These panels
  never cover the board or tablecharts and never add height between them.
- Details column sizing (2026-09-23, after the user found game data crushed
  in a fixed 320px strip): with the game data column docked, the details
  column stays at its 320px minimum. When it holds game data itself, it is
  fluid, `clamp(320px, 30vw, 760px)`, and the compact popover is
  `max(420px, 45vw)` within the viewport. Mode and
  generator share a row when they fit; music, tags, + state, and settings
  follow on wrapping rows. Game data there takes the column height left below them,
  the scores navigation, and the outcome summary (at least 480px), so it ends
  at the screen bottom with its controls visible instead of running below it.
  The column gives way to the board down to 320px before the Game details
  popover takes over, so widening it never undocks a board that fit beside
  the former 320px column.
- When the board and side columns cannot fit, a bordered **Game details**
  button opens the same details as a native popover. Close, Escape, or clicking
  outside dismisses it. Opening it does not reflow the board or history.
  This mode depends on viewport, board, and metrics-column widths, never on
  whether a result or legend exists. Below 700px, session metrics occupy a
  bounded scroll area above the game.
- Replay is collapsed by default behind **Replay game** in the sidebar.
  Closing it restores the finished board; starting a new game resets it to
  collapsed. Its slider, status, display options, and score controls occupy
  no space below the board. Replay arrow shortcuts apply only while its
  transport is open and visible.
- The tables begin directly below the board when no action report is shown.
  The time-period summary ("ranks won", today by default), time/category,
  streak, near-streak, and near-near-streak tables share one continuous,
  left-aligned wrapping list without a section heading. A separate **This
  board** section follows (2026-09-21): exact 3BV, ZiNi, HZiNi, maximum number,
  has-7/8, maximum-clue caps, zero-count, mine-island count, and enabled
  largest-island tablecharts. Each table keeps its own identifying label.
  Both sections precede the your-perf charts, the board-trait charts,
  relationships, and motion diagnostics.
  HZiNi, 3BV spread, 0–1 share, and zero-opening coverage values appear in
  their tablechart headings; there are no separate value cards. The
  3BV-spread tablechart is off by default (user decision 2026-09-23: "i don't
  think we need to show 3bv spread by default"); its switch also controls the
  3BV spread marker in game data. Heading
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
  arrows, labeled sliders, or numbers. Offsets count from the board's resting
  place: beside game data or centered, as described above. Sidebar controls
  remain outside its translation. Applied offsets keep a board that fits at
  least 8px inside the board column and the viewport and 8px below the tabs
  (an oversized board keeps its overflow), without rewriting the saved
  preference; beside game data, a rightward offset is therefore applied as
  zero.
- The position editor follows the board, normally directly below it, on all
  screen widths. It switches sides when needed and stays within the visible
  viewport during dragging, scrolling, resizing, and zooming. Reset (both
  offsets to zero, the resting place) and a prominent Done button stay at
  the top of the editor; Escape also closes it.
  The editor does not change the board's position or page layout.
- The results area echoes the in-game numeral face (Arial Black stack);
  the game-data chart inside it uses regular Arial.

# Personal settings (decided 2026-08-20; area redone from scratch 2026-08-23)

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/settings.md](../implementation/settings.md).

- The design doctrine (settled 2026-08-23 after several same-day
  revisions; the general rules it produced live in [UI doctrine](ui-doctrine.md)):
  settings live on their own full page, settings.html, reached from the
  clear "settings" button at the game page's upper right, in the top bar;
  the way back is
  equally clear — "return to game" buttons at the top and bottom of the
  page body, Esc, or the browser's Back. The page stays focused on the
  settings themselves. A change shows its meaning where the thing itself
  lives: the game page reads settings fresh on every load.
  Everything else (row shape, hint placement) is implementation and
  freely revisable; earlier revisions of this section had mistaken
  implementation defaults for decisions.
- A schema-driven settings system for player-facing behavior switches:
  `SETTINGS_SCHEMA` is the single definition (field, default, validity,
  group, label, hint, description, and optional migration); the loader,
  saver, import validator, settings page UI, and data-format card all derive
  from it. Selectable values and limits live beside the schema; generator
  parameters use the shared generator registry. Both pages load that registry
  and can validate every preference without the game runtime. It lives
  in settings-core.js, loaded by both pages, so the game and the settings
  page cannot drift. Named "settings", never "config" — that word is the
  board parameters.
- Stored beside the history (userdata `settings`; see [Storage](storage-and-history.md)). Absent
  entry or absent field = the default (the player never changed it). Invalid
  stored fields also use their defaults, and nested values are copied before
  editing. Loading only writes when consolidating an existing state-tag list
  into preferences; other writes follow user changes. All persistent
  preferences use this flat JSON-compatible object,
  including controls edited on the game page. The data-format reference
  lists every setting, default, and meaning directly from the schema.
- Preferences and game history have separate files and transfer controls.
  The Settings page exports/imports a plain JSON object defined by
  `SETTINGS_SCHEMA`; an invalid or unknown field rejects the whole preference
  import with an error. History exports contain only mode-keyed game lists;
  history imports ignore the preferences embedded in older combined exports.
  Neither transfer applies the other kind of data.
- All lasting control and view choices are preferences: difficulty/preset,
  applied custom width/height/mines, the separate unsubmitted custom-form
  values, player-state tags and active flags, mouse-path mode, all six replay
  overlays, trial-speed averaging, score/current-game view, replay action
  position, all panels/disclosures, trial identity/action-report
  disclosures, text drafts, page scroll position, and focused control.
  These use the same schema and settings record as the existing preferences.
- The game choice is one consistent pair (2026-10-20): a preset difficulty
  always goes with the Standard mode, and every other mode with the custom
  board ([Play modes](play-modes.md)). Saving any other pair is an error.
  A stored or imported preset with another mode, the pair the former
  separate Mode menu allowed, loads as that mode on a custom board of the
  preset's size, which keeps its rankings. The replay disclosure's
  remembered open state (`panels.replay`) is gone with the disclosure, and
  so is the Overlays panel's (`panels.reviewOptions`, 2026-10-21); a stored
  one is dropped on load.
- Preference restoration completes before the game becomes interactive.
  Inapplicable panels keep their open preference until available. Replay
  positions refer to finished games by timestamp; the actual completed board
  and trace belong to the trace store, never the preference file. New traces
  store the final board and metric sampling times so the finished view can
  be reconstructed without recording another result.
- Browser-selected file handles, held mouse buttons, active drags, hover
  highlights, and tooltips are transient input state, not preferences. File
  selections are applied immediately. An unfinished board still starts fresh
  on reload; saved Trial progress remains separate from personal preferences.
- One place for the player's global configuration (creator 2026-10-20:
  "all usre-specific global configuration should be in the same place"):
  on the game page it is the settings row at the page foot, holding the
  daily limits link, the session picker, and the board display (Zoom,
  position, pixel ratio), with the settings page's own button at the upper
  right since 2026-10-21 (below)
  ([Game setup, top bar, settings row, and footer](board-and-layout.md#game-setup-top-bar-settings-row-and-footer)).
  Choices that belong to one game setup, the board size and the generator,
  stay beside the mode they configure. Each option has one place (creator
  2026-10-21; [UI doctrine](ui-doctrine.md)): a setting the settings page
  shows is changed only there, and a surface's own view choices (the
  replay's overlays, a chart's averaging) only on that surface.
- A "settings" button at the right end of the game page's top bar, at the
  upper right (creator 2026-10-21: "move "settings" to upper right."; on
  2026-10-20 in the settings row at the page foot; in the top bar from
  2026-10-14; before that in the details column's cluster it shared with the
  states tags, 2026-08-20; a real bordered
  button since 2026-08-23) is a plain link to settings.html (2026-08-23;
  before that it opened an in-page surface — first a small corner
  dropdown, then briefly a full-height right-edge drawer that same day).
  The settings page wears the game's identity: a slim titlebar with the
  site name, then a centered body headed "Settings" with its save
  behavior stated beside the title. The two "return to game" buttons
  (dressed like the game's own top-right buttons) sit above and below the
  settings panels in the body; Esc also returns. They are not tucked at
  a screen edge.
- The demo world (2026-08-23, created with the page and removed later
  the same day): a miniature pretend mid-game beside the controls —
  partially played board, mini left-panel cards, stand-in result
  cards — that reacted live to every switch. Removed to keep the page
  super simple; the record stays because the idea may return.
- Switches render under group headings naming where they act — gameplay /
  after a game, with a "left panel" group until the panel's removal on
  2026-10-20 — driven by the schema's `group` field
  (`SETTINGS_GROUPS` orders the sections), so the page and the schema
  cannot drift. Each group is a separate panel with its heading in a
  stable left column and its settings on the right. A switch row puts its
  name on the left, its checkbox at the far right, and any earned hint in
  the column between them — never below the name where it could look like
  another list item. The schema's full description remains a plain
  tooltip. A multi-option setting such as `reportScope` puts one radio
  group to the right of its name. The result-section switches (every
  shown-things switch plus duplicate-tablechart grouping; motion charts too
  until 2026-10-20)
  form compact option grids (as many columns of at least 260px as fit) under
  four subheadings named for what they control, in result order: This game,
  Tables, This board, Charts (2026-09-26). The game's Overlays & display
  panel showed the same groups until 2026-10-21, when the creator had the
  copy removed: each option has one place
  ([UI doctrine](ui-doctrine.md)). The layout
  collapses to one section column on narrow screens while retaining the
  name/control relationship. Width (2026-09-23 sweep): the body spans the
  window less 48px (28px on narrow screens), and the title and return
  buttons stay centered. The groups flow into as many columns of at least
  760px as fit, which is the width that keeps a switch row's name, hint,
  and checkbox on one line. That gives three columns at 2560px and two at
  1920px. Preferences backup joins the same flow, followed by the Archive
  group (2026-09-26): the archive status sentence in bold, the browser's
  answer to the persistent-storage request, then "Choose folder" (or "Change
  folder") and "Archive now" once a folder exists; see
  [Archive folder](storage-and-history.md#archive-folder-creator-direction-2026-09-26).
  Neither button is ever shown disabled, because disabled controls render
  gray text: "Choose folder" is absent where the browser cannot pick
  folders, and an "Archive now" click during a sync queues one more. A
  switch row without a hint lets its name use the hint column. A
  change saves immediately; the game page reads settings fresh on every
  load, so returning applies them. "Changes save automatically" beside
  the page title states why there is no save button.
- Hover must never inject or swap text (decided 2026-08-23 after two
  rounds of hover-note mechanisms did exactly that). The row–demo glow
  link retired with the demo world the same day. The game page has no
  hover-only controls: the floating "hide ×" chip that appeared over a
  hovered result section (added earlier on 2026-08-23) was removed the
  same day — hiding things is the settings page's job, not something the
  pointer stumbles into. The remaining one-click precedent stands: the
  details column's width, set by dragging its own edge. The session
  section's own selectors and the stats panel's drag edge, the other two,
  left with the panel on 2026-10-20 ([Session stats](session-stats.md)).
- Settings so far: `cellSize` (default 28) — saved Zoom in pixels;
  `justUniverse` (default on) — sealed-pocket mercy (see
  [A just universe](just-universe.md);
  a game freezes the value at its first reveal, so a change made mid-game
  applies from the next game — the old drawer's mid-game lock UI retired
  with the drawer, 2026-08-23);
  `collapseDuplicateCharts` (default on) — the rank
  lists' progressive disclosure switch (see [Rank lists](rankings.md));
  `panels.motionStats` (default closed; set by the section's title) — the
  motion stats section at the page foot, the mouse-dynamics values (see
  [Motion stats](motion-stats.md)); it replaced `showMotionStatsDuringGame`
  and `showMotionStatsAfterGame` ("motion charts") on 2026-10-20;
  `reportScope` (`none` by default; choices `none`, `fatal`, `risk`,
  `full`) — the simple after-game analysis ladder, chosen only on the
  settings page since 2026-10-21 (before then also in the game's Overlays &
  display panel and above the trial review); it does not change what game
  data's report category rows count;
  `sessionDefinition` (default `today`, since local midnight; set only by
  the one session picker in the game page's settings row, never on the
  settings page) — the shared wall-clock session window (see [One session
  definition](game-data.md#one-session-definition)). The left panel's
  `showSessionStats`, `sessionLookbackSeconds`, `metricsPanelWidth`, and
  the other session chart controls were removed with it on 2026-10-20
  ([Session stats](session-stats.md));
  `detailsColumnShare` (default 0.46; set by dragging the details column's
  left edge) — the docked details column's share of the window width,
  within 320px and the board column's room (see [Board and
  layout](board-and-layout.md));
  `numberDisplay` (default numbers; the first choice-row setting) —
  digits / letters / dots for revealed counts (see [Board and chrome](board-and-layout.md));
  `flagStyle` (default classic), `flagSize` (default 45, percent of the
  square's width, 20–100 by 5), and `flagIntensity` (default 100, color
  strength, 10–100 by 10; all added 2026-10-15) — the flag's look, the two
  numbers set with sliders (see [Board and chrome](board-and-layout.md));
  `mineStyle` (default classic; added 2026-10-15) — classic / bold / sea
  mine / bomb / star, each choice shown as board squares in the picker (see
  [Board and chrome](board-and-layout.md));
  `gameDataMetrics` (one selection for both comparisons since 2026-10-07,
  replacing separate lifetime and session selections; a measurement either
  of them showed stays shown), `gameDataBoardTraits` (since 2026-10-14: which
  board traits game data ranks, chosen in its configure, apart from the This
  board table switches; a profile saved before then starts from what those
  switches showed), `gameDataSwitchCost` (default off, since 2026-10-20:
  the switch cost line under the chart, chosen in its configure),
  `gameDataShowValues`,
  `gameDataBandPool` (default lifetime), `gameDataDistributions`
  (default off), and `gameDataDistributionPools` (default both; the last
  three chosen on the chart itself) — the game data
  column (see [Game data](game-data.md)); `shownThings.duringGame` (default
  on; "live perf charts", titled "during this game, second by second"
  until 2026-10-20, in the This game group before game data, which it leads
  in the result; in the Charts group until it moved there on 2026-10-15),
  `duringGameRows` (which rows it shows, chosen with its configure), and
  `duringGameAveraging` (default a 2 s rolling average, chosen on the
  block; added 2026-10-15 as `duringGameAverage` with 5 s buckets, renamed
  2026-10-20 so the new default reached every player), and
  `duringGameRelativeScale` (default log, or linear; the scale of the chart
  of each line against its whole-game value, chosen on the block; added
  2026-10-21) — the live perf charts at the head of the game data column (see
  [During the game](during-game.md));
  `shownThings.sessionSummary`
  (default on) — the session summary table (see
  [Rank lists](rankings.md#session-summary-requested-and-built-2026-10-07));
  `shownThings.sessionEndings` (default on, added 2026-10-11 as "session
  loss types"; "session results by type" since 2026-10-14) — the summary's
  results tree under it for the current board type alone (its size, mode,
  and generator since 2026-10-20; the size alone from 2026-10-15; before
  then one column pair per size played): won, lost, and abandoned (since
  2026-10-20), won and lost then by the worst offense against perfect play
  and its type, each level's shares in their own column, listed under
  Tables right after the summary.
- Daily limits (2026-10-12): the first panel on the page, "Daily limits",
  holds the [daily play limits](play-limits.md). They are not schema
  settings and do not save automatically: each change goes through two
  confirmations, and preferences backup neither exports nor imports them.
- New-player quiet start (decided 2026-09-26): someone arriving without a
  saved `reportScope` gets after-game action reports off (`none`); session
  stats were off for them too until the panel's removal on 2026-10-20. The
  session picker stays in the settings row ("session today"). The
  loss-analysis report stays available from settings, the report ladder's
  one place since 2026-10-21. A value already saved stays as saved.
- Motion stats off by default (creator decision 2026-10-17, verbatim: "by
  default, dynamics shall be off"): both stages of the mouse-dynamics
  display, the live left panel and the after-game motion charts, defaulted
  off. Since 2026-10-20 the one motion stats section at the page foot
  carries the decision by starting closed; the two switches are gone, and a
  profile that had them on starts with the section closed too.
- The same 2026-10-17 request asked for "big/thick lettering" by default;
  the creator withdrew it on 2026-10-19 ("the way it is now, is okay"), so
  the number display, mine style, and digit size keep their defaults.
- The schema's `helpFile` "?" popover was removed with the caption purge
  (2026-08-23): the just-universe explanation already lives in the hint
  and tooltip. just-universe-help.html remains in the repo as a
  standalone document.

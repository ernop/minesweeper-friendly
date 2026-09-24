# Personal settings (decided 2026-08-20; area redone from scratch 2026-08-23)

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/settings.md](../implementation/settings.md).

- The design doctrine (settled 2026-08-23 after several same-day
  revisions; the general rules it produced live in [UI doctrine](ui-doctrine.md)):
  settings live on their own full page, settings.html, reached from the
  clear "settings" button in the game's upper-right; the way back is
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
  overlays, panel collapse, trial-speed averaging, score/current-game view,
  replay action position, all panels/disclosures, trial identity/action-report
  disclosures, text drafts, page/panel scroll positions, and focused control.
  These use the same schema and settings record as the existing preferences.
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
- A "settings" button in the game's upper-right corner (the fixed
  cluster it shares with the states tags, 2026-08-20; a real bordered
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
  left panel / after a game — driven by the schema's `group` field
  (`SETTINGS_GROUPS` orders the sections), so the page and the schema
  cannot drift. Each group is a separate panel with its heading in a
  stable left column and its settings on the right. A switch row puts its
  name on the left, its checkbox at the far right, and any earned hint in
  the column between them — never below the name where it could look like
  another list item. The schema's full description remains a plain
  tooltip. A multi-option setting such as `reportScope` puts one radio
  group to the right of its name. The numerous shown-things switches form
  a compact option grid (as many columns of at least 260px as fit) under
  their own subheading rather than extending the primary list. The layout
  collapses to one section column on narrow screens while retaining the
  name/control relationship. Width (2026-09-23 sweep): the body spans the
  window less 48px (28px on narrow screens), and the title and return
  buttons stay centered. The groups flow into as many columns of at least
  760px as fit, which is the width that keeps a switch row's name, hint,
  and checkbox on one line. That gives three columns at 2560px and two at
  1920px. Preferences backup joins the same flow as the last group. A
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
  pointer stumbles into. The remaining one-click precedents stand: the
  session lookback and window selectors living on the session section
  itself, and the stats panel width set by dragging the panel's own edge.
- Settings so far: `cellSize` (default 28) — saved Zoom in pixels;
  `justUniverse` (default on) — sealed-pocket mercy (see
  [A just universe](just-universe.md);
  a game freezes the value at its first reveal, so a change made mid-game
  applies from the next game — the old drawer's mid-game lock UI retired
  with the drawer, 2026-08-23);
  `collapseDuplicateCharts` (default on) — the rank
  lists' progressive disclosure switch (see [Rank lists](rankings.md));
  `showMotionStatsDuringGame` and `showMotionStatsAfterGame` (both
  default on) — the two stages of the trace metrics display (see [Trace
  metrics panel](trace-metrics-panel.md)); `reportScope` (`fatal` by default; choices `none`,
  `fatal`, `risk`, `full`) — the simple after-game analysis ladder,
  editable on both the report and settings page, which also gates category
  session diagnostics;
  `showSessionStats` (default on),
  `sessionLookbackSeconds` (default 300), and `sessionDefinition`
  (default `pastHour`) — visibility, played-time grouping, and the shared
  wall-clock session window (see [Session stats](session-stats.md)); `metricsPanelWidth` (default 316, clamped 220–640; set
  by dragging the stats panel's right edge, not a panel checkbox) — the
  left panel's width, which the session charts fill;
  `numberDisplay` (default numbers; the first choice-row setting) —
  digits / letters / dots for revealed counts (see [Board and chrome](board-and-layout.md)).
- The schema's `helpFile` "?" popover was removed with the caption purge
  (2026-08-23): the just-universe explanation already lives in the hint
  and tooltip. just-universe-help.html remains in the repo as a
  standalone document.

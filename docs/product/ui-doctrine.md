# UI doctrine (directives collected 2026-08-23)

Product spec section; index: [PRODUCT.md](../../PRODUCT.md).

Player directives given across the settings redesigns, promoted here
because they apply app-wide, not just where each was first stated.

- Simplicity first: prefer the simplest surface that does the job. When
  explanatory or demonstration machinery accretes around a surface,
  strip it rather than polish it — the settings demo world (a pretend
  mid-game that reacted to every switch) was built and removed the same
  day on this rule.
- One look per kind of thing (creator direction 2026-10-14, of the then top
  bar and the details column: "the tags/playstate (music on/off, mouse,
  computer, mental and physical state) shall not visually be identical to
  BUTTONS. it's a totally diff datatype after all. 2. why so many similar
  diffs everywhere? let's make it simpler."). On the game page every action
  or opener wears one bordered button look and every choice one select look;
  a fact (today's use against the daily limits, the pixel ratio) is plain
  text with no border, fill, pointer, or hover. A tag the player has put on
  a game (a player state, and the measured music state beside them) is a
  fully rounded sand pill with no pointer or hover (creator 2026-10-20:
  "they're not buttons, they're tags ... show they're more like props than
  UI interactive elements"; [Player states](player-states.md)). A fact is
  never a button's label: the button says
  what it does and the value sits beside it. A fact the player can change is
  changed in the one panel its button opens. Found that day: nine CSS rules
  had each copied the button look with small differences (three border
  colors, two fills, five paddings), and the Zoom select had none, so it
  showed the browser's default. Surfaces with deliberate sizes of their own
  (the position editor's Reset and Done, the other pages' return links)
  override only what differs. The backup row under the board (export
  history, export traces, import history, data format, the save-to-file
  links, and the import panel's apply and open file) wore dotted underlined
  link text until 2026-10-20, when the creator approved converting it ("yes
  standardize"); its two panel openers hold the pressed look while their
  panel is open. Game data's joined pool switch still has its own rule
  ([BACKLOG.md](../../BACKLOG.md)). The live perf charts' legend entries
  are their rows' switches as well as their key (creator 2026-10-21: a
  click shows or hides the row; [During the game](during-game.md)): they
  keep the legend's look (swatch or mark, name, value, no border) and the
  pointer their spotlight already had, and a hidden row's name is struck
  through.
- Prefer regular-weight chart names, labels, and values. Use position,
  spacing, and restrained color to establish hierarchy instead of relying
  on bolding.
- One standing scale, one this-game color (creator direction 2026-10-07:
  "green good red bad"; 2026-10-08: "for charts, keep the green. and let's
  backport the green to replace blue as the 'this' pointer color";
  2026-10-15: "lets globally switch 'this' color to light blue, not light
  green now."). Standing
  within a pool runs muted green (better) through a neutral light gray or
  white middle to red (worse) everywhere: rank chips, the game-data bar and
  histograms, and chart chips. A display whose every value has one standing
  carries no standing color: ranks won in session reports only top-tenth
  ranks, so there its ranks are plain text (creator 2026-10-14: "these are
  not 'this' right? so why green?";
  [Rank highlights](rankings.md#rank-highlights-built-2026-09-21-recolored-2026-10-07)).
  This game is light blue (`--this-game`, #87cefa), and nothing else uses
  it: its table rows and "this" chips (bold black on it, about 12:1), its
  bar or dot and the pin over it on game data's strips, the ring around a
  chart linked to a hovered game-data row, its black-ringed dot on the
  scatter charts, and your mark on the problems page. As a mark, line, or
  ring on white it has black edges, as the chart dot has its black ring,
  because the light blue alone is about 1.7:1 on white. A hovered game-data
  row no longer takes it (creator 2026-10-20: "entirely remove the
  blue-background when mousing over effect"). It is deeper than the app's pale
  blues, the pressed toggle fill (#dcecf5) and the session day fill
  (#d3e7f5), so a this-game row does not read as a pressed control. History:
  a paler light blue (#cfe5fa) marked this game from 2026-10-07, the charts'
  fluorescent seconds green (#39ff14) from 2026-10-08, and this light blue
  from 2026-10-15. The age-unit palette is a separate code and stays as it
  is: its seconds green still colors other games under a minute old on the
  scatter charts and the legend's seconds swatch; this game's dot is light
  blue whatever its age.
- Contrast, hierarchy, and width (user rules, recorded 2026-09-23): neutral
  text is pure black on light backgrounds and pure white on dark ones. No
  gray labels, gray placeholders, or opacity-dimmed text; secondary hierarchy
  comes from size, weight, spacing, and placement. Headings are larger
  and/or heavier than the text beneath them. Data values (numbers, times,
  dates, status) are the most legible element in their region. Primary
  containers use fluid widths, not fixed pixel caps that leave empty
  margins.
- Page-wide standardization sweep (creator-approved "all", 2026-09-23):
  every neutral text color on both pages is `#000`, including SVG chart
  ticks, axis labels, outlier notes, and sparkline labels. Semantic hues
  remain: links, error reds, verdict and report-category colors, the
  cell-number palette, and the age-unit palette. A gray series keeps its
  gray line or marker but draws its text in black (`textColor`: the
  measurement-notes rate labels and the unjudged-ending tooltip). Series
  focus fades other series' lines, dots, and leaders, never their value
  labels. Primary containers lost their pixel caps. The action report
  spans the board column and lays out each category's blocks in
  auto-fit columns of at least 400px, in reading order. Section titles
  span their sections. Data-format blocks grow to fill their row. Trial
  rankings and trial identity cards are uncapped. Headings now outrank
  their body text: rank-table labels are 14px over 12px rows,
  measurement-system heads such as "session" are 15px over 14px chart
  titles, and settings group headings are 15px over 14px setting names.
  Controls, tooltips, and popovers keep their own size limits.
- No copies of a visible fact (creator 2026-10-20, of game data's board
  name heads: "there is already a visible-on-the screen indicator that we
  are in intermediate mode. it's the fact that Intermediate is already
  highlighted on top of the whole entire screen! in general, let's avoid
  copying data from a canonical, visible location, to some other smaller
  lcoation for "convenience"."). A fact shown in its canonical place (the
  highlighted preset link for the board, the mode pickers for the mode)
  is not repeated in a smaller place elsewhere on the page. Different
  facts may share a word, and a chart may name a measurement it plots;
  what is banned is a second, smaller copy of the same fact for
  convenience.
- Optional instructions and explanatory text must meet both conditions:
  they add useful information, and they stay hidden until requested through
  a subtle help affordance, such as a (?) hover tooltip or a control's
  tooltip. Do not add persistent instructional captions. Omit redundant or
  obvious guidance entirely; keep useful help brief and factual. This does
  not hide essential control labels, semantic legends, or error messages.
- Stat explanations (user direction 2026-09-26: "write them well without
  clutter"): every displayed stat has one, opened from its name or a (?).
  Write one or two plain sentences: what the number is (left out where the
  name and unit already say it; "No fluff in mouseovers" below), then only the
  defining detail or a caveat that prevents a likely misreading. Do not
  repeat the label or value, restate what the chart or section heading
  already says, or include formulas the reader does not need. Rules shared
  by many items (a ranking formula, tie rules, a comparison pool, a unit)
  are stated once, in the chart's or section's own help. Use the player's
  words (click, flag, chord, zero region), not internal names. Each
  measurement has one definition, reused wherever it appears. The details
  column's three section titles (live perf charts, game summary perf, board
  traits) carry no (?) since 2026-10-20 (creator: "remove all three (?)
  buttosn and mouseovers entirely, not replacing orputting the removed text
  anywhere; it merely wil lbe gone."); their rows keep their definitions.
- Hover must not inject, swap, or reflow page content. Supplementary help
  may appear as an overlay tooltip on hover or keyboard focus without
  changing the layout; no action control may be reachable only by hovering.
  One exception, the creator's (2026-10-21): hovering the live perf charts
  shows the hovered moment on the board itself, through the replay's own
  frame, in place of a second board beside the charts ("that way we don't
  duplicate teh baord"). Only the board's squares and overlays, the
  transport's slider and status, and the replay legend at the column's foot
  change; nothing moves, and leaving the charts restores them
  ([During the game](during-game.md)).
- No help affordance changes the pointer to the question-mark help cursor
  (creator 2026-10-08, of the game data rows: "the mouse shall not change to
  the '?' mark, cause I don't like that"). Requested for game data; applied
  to every help label, (?) button, and the problems page's help, since the
  reason given is the cursor itself. The pointer stays the default arrow.
- No fluff in mouseovers (creator 2026-10-08, of the game data cards: "the
  first 4 lines are useless since they just state what the user already
  knows/has on screen. also remove stuff like 'with these boards settings'
  which are obvious. dont include that pointless actual division equation
  please ... please just cut all the fluff here for all mouseovers"). A
  tooltip or card never restates the name, value, percentage, or anything
  else already on screen; never describes a pool or setting that is
  obvious from context; never shows arithmetic the reader does not need;
  and gives a definition only where the name and unit leave the thing
  open, after the data. It replaced the same day's "measurement
  explanations" rule (plain lead sentence, worked calculation, percentage
  arithmetic, example boards) ([Game data](game-data.md), hover card).
  Example boards came back on 2026-10-20 at the creator's request, as this
  game's own board in the player's board style showing what the
  measurement counts, with a key of counts ([Game data](game-data.md),
  "Strips and example boards"): a picture of the measured thing, not text
  the screen already shows.
- No narrated marks (creator 2026-10-08: "'Green line: this game. Ticks
  under a lifetime or board strip: this session's games.' and similar
  rather pointless text shall not appear in this project, please"). No
  caption, key line, or tooltip says what a chart's marks are: which line,
  dot, tick, bar, ring, or strip stands for what ("Green line: this game.",
  "Ticks: this session's wins."), how much one dot or bar holds ("One dot
  per win.", "Each bar spans 0.834s."), or what the axes are ("across is
  the game's 3BV, up is its solve time"). This game's color is one
  page-wide convention (above) and needs no key; titles and axis labels
  name what is plotted. A legend for an arbitrary code still says what each
  color or style means (the age palette, the trend lines' teal and blue,
  the game-endings lines, the replay's buttons), and definitions and
  caveats stay ("Semantic labels are never shortened", below).
  `tests/chart-captions-test.js` searches every shipped file for the
  narrating form.
- A data panel whose content can outgrow its box shrinks to fit rather than
  growing a scroll bar when the creator asks for no scrolling there (game
  data, 2026-10-08: "careful not to allow this part of the UI to gain any
  kind of vscroll bar or hscroll bar").
- Semantic labels are never shortened: when legend, key, series, color,
  region, or section text is the unique explanation of what a visual
  encoding means, render the complete wording. Never truncate it,
  ellipsize it, replace it with an abbreviation, or require hover to
  recover it. Wrap the label, expand/reflow the key, use direct labels,
  or replace the chart legend with a full-text table; available width is
  a layout resource, not a reason to remove meaning. The former exception
  for MN and ZOC on game data ended 2026-10-07: game data now says "max
  number" and "zero-opening coverage", one name per measurement.
- Layout stability: content appearing or disappearing must not shift
  unrelated content. "The board never moves" (previous section) is the
  oldest case of this rule; it holds on every page.
- No distracting transient duplicates: a live-changing value appears only
  where it is essential, in one canonical place. Summary tables, rankings,
  and comparison surfaces show stable completed facts; they do not echo the
  game timer or add other ticking/readjusting values.
- Options are never more than one step deep (creator direction 2026-09-26,
  on the after-game display panel whose lower half was a collapsed
  "Analysis & chart display" section: "that is TOO DEEP of menus. move this
  and all such things higher up in the hierarchy, we shouldn't have such
  deep option config menus and to the extent possible this all shall be
  centralized and combined logically"). Every option is on the page itself
  or in the one panel a single bordered button opens. A panel shows all of
  its options at once: never behind a collapsed section, a "more" toggle,
  or a second panel. Related options live together in one place, under
  headings named for what they control, in the order those things appear
  on the page. Where a narrow window
  folds the whole side column into its Game details popover, a panel from
  that column shows inline inside it instead of opening a second popover.
- Each option in one place (creator 2026-10-21: "rectify the duplication
  and problematic "double settings location" issue where some settinsg are
  within "settings" while others are in "overlays & display""). A setting
  the player keeps for every game (the after-game report choice, which
  result sections show, the board's look, a just universe) is shown and
  changed only on the settings page; no other surface carries a copy. A
  surface's own view choices stay on that surface and are not repeated on
  the settings page: the replay's board overlays and mouse path in the
  Overlays panel beside it, each chart's averaging, scale, configure, and
  pool switches on the chart. From 2026-09-26 until this decision the
  game's panel, then named Overlays & display, repeated the settings page's
  report choice and result-section switches from one shared definition,
  and the trial review repeated the report choice.
  `tests/settings-one-place-test.js` fails when game-page code changes a
  setting the settings page shows.
- Defaults show nothing extra (creator 2026-10-20: "beg, int, exp are
  "all-in-one settings choosers". when a user choose a mode besides those
  from the dropdown they shoudl only then be presetned with the variant and
  other options. that way, simple or new users who only want to play the
  standard modes don't need to be confronted with any other ui elemtns").
  A choice that is complete in itself, such as a preset board, brings no
  further controls with it. A choice's own options appear only once that
  choice is made, beside it, and leave when it is left. One choice is
  never split over two pickers that must be set together: the play mode
  and its variants are entries of one menu, not a mode menu plus a
  variant menu ("simlify the mode pickers. i don't like the current
  layers wqhich are duplicative and needlessly complex";
  [Game setup](board-and-layout.md#game-setup-top-bar-settings-row-and-footer)).
- Global configuration in one place (creator 2026-10-20: "all usre-specific
  global configuration should be in the same place"). Everything the player
  configures for every game (the settings page, the daily limits, the
  session window, the board display) sits in one row, at the game page's
  foot; links to the other pages sit in the footer below it. Live status
  (today's use against the limits) and per-game context (the player
  states) are not configuration and stay where play needs them.
- Clear ways in and out: a surface opens from an obvious bordered button
  and closes just as obviously — for a page, a visible way back at both
  the top and the bottom of the body (not tucked at a far edge), plus
  Esc. Modals and separate pages are allowed; the old "in-page only,
  never a modal" lock was lifted 2026-08-23.

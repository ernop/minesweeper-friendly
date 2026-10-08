# UI doctrine (directives collected 2026-08-23)

Product spec section; index: [PRODUCT.md](../../PRODUCT.md).

Player directives given across the settings redesigns, promoted here
because they apply app-wide, not just where each was first stated.

- Simplicity first: prefer the simplest surface that does the job. When
  explanatory or demonstration machinery accretes around a surface,
  strip it rather than polish it — the settings demo world (a pretend
  mid-game that reacted to every switch) was built and removed the same
  day on this rule.
- Prefer regular-weight chart names, labels, and values. Use position,
  spacing, and restrained color to establish hierarchy instead of relying
  on bolding.
- One standing scale, one this-game color (creator direction 2026-10-07:
  "green good red bad", and "light blue = the one we just did so you can
  always see 'this' just-completed run"). Standing within a pool runs green
  (better) through a neutral light gray or white middle to red (worse)
  everywhere: rank chips, the game-data bar and histograms, and chart chips.
  Light blue (#cfe5fa, with #1f6fd1 for lines) means only "this game": its
  table rows, its "this" chips, its line on histograms, and the outline of a
  chart linked to a hovered game-data row. Standing scales therefore have no
  blue middle (formerly light green, light blue, light red). The age-unit
  palette is a separate code and stays as it is.
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
  measurement has one definition, reused wherever it appears.
- Hover must not inject, swap, or reflow page content. Supplementary help
  may appear as an overlay tooltip on hover or keyboard focus without
  changing the layout; no action control may be reachable only by hovering.
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
  on the page. When the settings page also lists the same options, both
  render one shared definition with the same groups. Where a narrow window
  folds the whole side column into its Game details popover, a panel from
  that column shows inline inside it instead of opening a second popover.
- Clear ways in and out: a surface opens from an obvious bordered button
  and closes just as obviously — for a page, a visible way back at both
  the top and the bottom of the body (not tucked at a far edge), plus
  Esc. Modals and separate pages are allowed; the old "in-page only,
  never a modal" lock was lifted 2026-08-23.

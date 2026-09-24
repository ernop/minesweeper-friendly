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
  on bolding. Performance gradients use light green for stronger standings,
  light blue around the middle, and light red for weaker standings.
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
- Hover must not inject, swap, or reflow page content. Supplementary help
  may appear as an overlay tooltip on hover or keyboard focus without
  changing the layout; no action control may be reachable only by hovering.
- Semantic labels are never shortened: when legend, key, series, color,
  region, or section text is the unique explanation of what a visual
  encoding means, render the complete wording. Never truncate it,
  ellipsize it, replace it with an abbreviation, or require hover to
  recover it. Wrap the label, expand/reflow the key, use direct labels,
  or replace the chart legend with a full-text table; available width is
  a layout resource, not a reason to remove meaning.
  Requested compact names on the percentile overview are an explicit
  exception: MN = max number and ZOC = zero-opening coverage, expanded in
  the chart help and each item's value tooltip.
- Layout stability: content appearing or disappearing must not shift
  unrelated content. "The board never moves" (previous section) is the
  oldest case of this rule; it holds on every page.
- No distracting transient duplicates: a live-changing value appears only
  where it is essential, in one canonical place. Summary tables, rankings,
  and comparison surfaces show stable completed facts; they do not echo the
  game timer or add other ticking/readjusting values.
- Clear ways in and out: a surface opens from an obvious bordered button
  and closes just as obviously — for a page, a visible way back at both
  the top and the bottom of the body (not tucked at a far edge), plus
  Esc. Modals and separate pages are allowed; the old "in-page only,
  never a modal" lock was lifted 2026-08-23.

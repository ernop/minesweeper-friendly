# UI doctrine

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). App-wide UI
principles and invariants. Read before building or reshaping any surface.

## Simplicity and visual restraint

- **Simplicity first:** prefer the simplest surface that does the job. Strip
  unnecessary demo or explanatory machinery instead of polishing it.
- **Defaults show nothing extra:** complete preset choices (Beginner,
  Intermediate, Expert) show no extra setup controls. Mode-specific options
  appear only when a non-preset mode is active, in one flat level (never split
  across redundant mode + variant menus).
- **No copies of a visible fact:** never repeat a fact already visible in its
  canonical location (such as the active board preset or mode) in a smaller
  secondary place for convenience.
- **No distracting transient duplicates:** live-changing values appear only in
  one canonical place. Summary tables, rankings, and comparison surfaces show
  stable completed facts — never echoing live timers or ticking numbers.

## Visual grammar, color, and contrast

- **One look per kind of thing:**
  - Actions and panel openers share one bordered button style.
  - Choices share one select/control style.
  - Live facts (today's limit usage, pixel ratio) are plain text with no
    border, fill, pointer, or hover effect; a fact is never used as a button's
    label.
  - Player state tags and music tags are fully rounded sand pills with no
    pointer or hover effect (props, not buttons).
  - Collapsible section/table openers share one control everywhere: an arrow
    before a bold title (right when closed, down when open), state remembered
    across games and reloads, with a black rule under section/table titles.
  - Live perf chart legend entries act as row visibility switches while keeping
    their clean legend look (swatch, name, value, pointer; struck-through name
    when hidden).
- **Regular weight first:** prefer regular-weight chart names, labels, and
  values; build hierarchy through position, spacing, and restrained color
  rather than heavy bolding.
- **Pure black neutral text and fluid width:** neutral text is `#000` on light
  backgrounds and `#fff` on dark ones (including SVG ticks, axis labels, and
  notes). No gray labels, gray placeholders, or opacity-dimmed text. Headings
  outrank body text, data values are the most legible element in their region,
  and primary containers use fluid widths without artificial pixel caps.
- **One standing scale, one this-game color:**
  - Standing within a pool runs muted green (better) through light gray/white
    to red (worse) everywhere. Omit standing tint when every value shares one
    standing (for example, top-tenth session highlights stay plain text).
  - Light blue (`--this-game`, `#87cefa`) marks **this game** exclusively
    (table rows, chips, chart strips/dots, hover-linked rings, problem marks).
    Give it a black border on white backgrounds for contrast; never apply it as
    a hover fill.
  - Semantic palettes (cell numbers, age-unit colors, verdicts, errors) remain
    distinct from the standing scale.

## Numbers, labels, and visual clarity

- **Compact, vertically aligned numbers:**
  - Brutally limit significant digits: integers for milliseconds and whole
    percentages, at most one decimal for seconds/rates where useful, and at
    most two decimals for ratios (`3BV/s`, `IOE`), uniform down every column.
  - Never pack triple slash-separated numbers across levels (`Beg / Int / Exp`)
    into one cramped cell; split them into separate rows or a one-step level
    switcher.
  - Right-align every numeric column with `tabular-nums` so place values stack
    vertically (tens over tens, ones over ones, decimals over decimals — e.g.
    `12.8%` over ` 7.0%`, never left-aligned `1` over `7`). When units vary
    within one column, align digits right and units left in a fixed pair.
  - Show sample counts (`n`) beside every technique/pattern timing or rate, and
    render classic Minesweeper visual mini-boards beside pattern/technique names.
- **Semantic labels are never shortened:** never truncate, ellipsize,
  abbreviate, or hide behind hover any label that uniquely explains a visual
  encoding or measurement. Wrap, reflow, or widen instead.
- **Player words only:** everything a player reads uses ordinary Minesweeper
  terms (`square`, `click`, `chord`, `flag`, `number`, `mine`, `guess`,
  `50/50`) or explicitly approved names — never internal solver terms
  (`pocket`, `sealed`, `certified`, `bare click`, `sea remnant`). Explain rules
  in terms of what happens to the player, not how code computes it. Enforced by
  `tests/player-words-test.js`.
- **No narrated marks:** never add captions or tooltips explaining what chart
  marks are (`"Green line: this game."`, `"One dot per win."`, `"across is..."`).
  Legends decoding arbitrary color/style codes (age palette, trend lines,
  replay buttons) and metric definitions stay. Enforced by
  `tests/chart-captions-test.js`.
- **Exact values only:** compute every reported fact exactly by definition.
  Never approximate or add `"approximately"` disclaimers in place of scaling
  the algorithm.

## Help, hover, and layout stability

- **Useful, hidden optional help:** omit persistent instructional captions and
  obvious guidance. Keep concise, factual stat explanations (1–2 sentences
  stating defining details or caveats) behind hover/focus tooltips on names or
  subtle `(?)` controls. Every measurement reuses its single canonical
  definition.
- **No fluff in mouseovers:** hover cards never restate names, values, or
  obvious context already on screen, and never print unnecessary arithmetic
  formulas. Visual example boards showing what a metric counts on this game are
  encouraged.
- **Default cursor on help:** never change the pointer to the `?` help cursor.
- **Hover never reflows or covers its target:** never inject, swap, or shift
  page content on hover, and never hide action controls behind hover. Tooltips
  open beside their anchor when neither below nor above fits so they never
  block pointer events. Two narrow exceptions exist on live perf charts:
  hovering previews that moment in-place on the board's replay frame, and
  focusing a line relabels y-ticks inside already-reserved margin space.
- **Layout stability & shrink-to-fit:** appearing or disappearing content never
  shifts unrelated elements; the board never moves. Panels configured for no
  scrolling (such as game data) shrink to fit rather than growing scrollbars.

## Options, navigation, and errors

- **Options at most one step deep:** every option lives directly on the page or
  inside one flat panel opened by a single bordered button (never behind
  collapsed sub-sections, "more" toggles, or nested panels). Group related
  options together in page order.
- **Each option in one place (global vs. local split):**
  - Global play rules, board look, after-game report level (`reportScope`),
    daily limits, preferences backup, and archive live only on `settings.html`.
  - Local view composition (replay overlays/path, per-chart switches, full
    score-list columns, `configure results` dialog, and explicit right-click
    `hide`/`remove` menus with Shift+right-click passthrough) lives only on the
    game page.
  - Enforced both ways by `tests/settings-one-place-test.js`.
- **Clear ways in and out:** open surfaces from clear bordered buttons; every
  subpage provides visible return links at both top and bottom plus `Esc`.
- **Errors are shown visibly:** unhandled exceptions, rejected promises, failed
  asset loads, and worker errors surface in the fixed bottom red error bar
  (file, line, count, dismiss) without shifting layout. Internal calculation
  failures raise loudly rather than degrading silently (sole exception:
  `fuseki-stats.js` logs failures to console so statistics never interrupt
  play).

# Path and choice replay views (decided 2026-08-23; expanded 2026-08-28; overhauled 2026-08-30: history slider, solver overlays, interpretive legends, chord detection, off-screen durations)

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/replay.md](../implementation/replay.md).

- When a game finishes, “Overlays & display” opens a closable panel with
  separate buttons for off, raw path, click locations, movement speed,
  click speed, game progress, and less useful. All options remain available;
  the panel occupies the browser top layer without pushing rankings down.
  Close, Escape, or clicking outside dismisses it. The control hides whenever no
  finished board is on screen (a new board or trial lobby/review phase).
- Raw path restores the original complete every-sample tool, shaded from light
  early movement to dark late movement. Click locations restores the original
  raw left-release/right-press inputs as numbered positions in action order;
  it is not limited to analytically accepted decisions. Chords are detected
  (a decision frame's time equals its accepting input event, so accepted
  inputs join exactly to their action kind) and drawn in their own green,
  distinct from plain left releases (blue) and right presses (red); the
  legend counts detected chords, and the chord dot itself is the exact spot
  the chord was performed at.
- Sampling is event-driven, so nothing is recorded while the cursor rests or
  is off-window. Any silent stretch ≥300ms draws as a dashed gray connector
  instead of a fake speed color; if its endpoints are ≥40px apart the cursor
  left and re-entered ("away") and the connector carries an on-path duration
  label — the direct answer to "how long was I off-screen?".
- The three continuous parameter views draw the actual cursor polyline through every
  recorded sample, warmup included. Movement speed colors each segment by
  its instantaneous px/s; click speed colors the movement leading to each
  action by inverse inter-action gap; game progress colors it by the share
  of non-mine cells uncovered in the exact position during that movement.
  Parameter-colored paths are 4.25px wide (raw path 3px), materially thicker
  than the former 1.5px line.
  Blue is the low end and red the high end. Speed ranges are relative to the
  just-finished sample and use the lower charts' Tukey 1.5-IQR display rule
  on both extremes once at least eight values exist, so an isolated pause or
  burst cannot flatten the local differences. Every continuous path mode has
  an interpretive legend (2026-08-30, replacing the gradient bar): six chips,
  one per color class, each labeled with the exact numeric interval it
  covers, so every speed class on the line is enumerated. The legend is
  bidirectional: hovering a chip spotlights that class's segments on the
  board (others fade); hovering the path itself pops a tooltip with the exact
  value of the nearest segment and lights the matching chip. The hover
  listener lives on the board, so the canvas still never intercepts input.
  Discrete marks keep explicit color keys. If every segment has the same
  value, the legend reports that actual value rather than inventing a wider
  or negative range. Legend rows and notes are black on white — no gray text.
  The legend is the vertical key beside the board described under review
  mode (path-view chips stack in it, one range per line); active-button
  styling never changes button dimensions, so
  selecting movement speed cannot make the input buttons twitch.
- "Less useful" shows complete episodes, not isolated fragments: the last
  useful click before a run, every movement and mistake-tagged action in the
  run, and the next useful action and movement into it. Blue marks the prior
  useful boundary, orange the less-useful interval, and green the next useful
  boundary; each action-to-action interval is labeled with its measured time.
  Less useful means actions with measured
  mistake evidence: no-op/time-loss actions, visible contradictions,
  avoidable or higher risk, and lower modeled one-ply life. A loss from a
  minimum-risk forced guess is not labeled less useful merely because it
  was fatal.
- Game-history slider (updated 2026-09-07): once a game is finished,
  **Replay game** in the right sidebar opens its transport. It starts
  collapsed for each game; closing it restores the finished board. The
  slider fills the sidebar width above a row of Start / previous / next /
  End buttons and the status. “Overlays & display” and “see scores” are
  also in the sidebar. None of these controls occupies space under the board.
  The slider's positions count actions done, 0 … N: the right end (N) is the
  finished board itself, which is where every game starts; every earlier
  position shows the exact player-visible board before action position + 1,
  with the board overlays and the legend. Moving the slider is what enters
  and leaves review; the finished board is restored exactly at the end.
  The scale has notch marks for every position (thinned above 60) and black
  numeric labels at both endpoints (0 and N) and the interior quarters; the
  current position rides in a label above the thumb; the status spells it
  out ("13 of 14 actions done · deciding at 2.66 s · next: reveal · 1
  measured choice"; at the end "14 / 14 actions · Finished board"). The
  slider is as wide as its
  row allows (no fixed cap), so notches stay apart on long games. It can be
  combined with raw path, click locations, any parameter color, less
  useful, or off; the selected overlay truncates at the displayed position
  while retaining its full-game color scale for comparison.
  Start / End jump to the first frame and finished board. Navigation uses
  fixed grid columns and a compact, two-line-height scrollable status area.
  There is no “Review game / Final time” heading row. The stats column
  contains the completed time to three decimal places; the transport does not
  duplicate it. The finished-board status shows only the action count and
  “Finished board”. The separate details column keeps the legend out of the
  transport layout, so changing frames or overlays never moves its buttons.
  Board overlays and Mouse path have separate labeled
  groups inside “Overlays & display”, followed by Analysis & chart display.
  The compact transport and panel opener stay in the sidebar; opening them
  does not move lifetime or daily rankings.
  ‹ / › and Left/Right keys step one action while replay is open and visible,
  except while another
  interactive control has keyboard focus; solid purple rings mark the measured
  reasonable choice set (purple is also the color of the uncertain-pocket
  labels that describe that set; measured choices were a second green until
  2026-09-04 and could not be told from the proven-safe ring on the same
  square), a gold ring marks the square the action was performed on (for a
  chord: the number that was clicked), a translucent gold wash marks the
  squares the action changed (for a chord: the cells it opened), and a gold
  crosshair with a white action-kind pill pins the exact input pixel of the
  displayed action — for a chord, the precise spot the chord was performed
  at. The pill sits centered just above the crosshair arms so it never
  covers the acted square, and is clamped to the board (the crosshair keeps
  its canvas even when the path mode is off).
  The status names actions done, the decision's in-game time, the next
  action's type, and measured choice count; the three values are the largest
  text in the status (bold, 16 px) and the words around them are secondary. Uncertain
  reasonable-choice cells are split into connected visual pockets; each pocket
  gets a leader line to a side label giving its mine probability (exact 50%
  reads `50/50`; other uncertain values never round to 0%, 100%, or `50/50`)
  and cell count. Labels choose the board side that avoids the result summary
  and available viewport edge. Proven-safe choices get no coinflip label.
  Returning the slider to its end restores the finished board exactly.
- Review-mode overlays (2026-08-30): six independent toggles on their own
  row, remembered for the page session, each doing exactly what it says.
  `available moves` and `forced mines` start on — showing what was logically
  deducible at each moment is the point of review mode (requested
  2026-08-30 late evening); the rest start off. Solver deductions and
  player-action marks are two independent visual channels (dashed inner
  rings versus solid inset rings and washes), so one square can carry a
  deduction and an action mark simultaneously — the earlier single-channel
  rings silently replaced each other.
  - `available moves` shows the player's complete option set — raw click,
    chord, and mark-mine (requested 2026-08-31: all options must be visible
    to evaluate choices for speed and risk). Every covered cell proven safe
    gets a dashed green ring (raw click) — including flagged cells, where a
    dashed safe ring exposes a provably wrong flag. Every satisfied number
    whose chord would open only proven-clear cells gets a dashed blue ring.
    Every unflagged proven mine gets a mini flag badge (top-left corner):
    the mark-mine move. Every number that becomes safely chordable once
    those mines are marked (flags + unflagged proven mines exactly satisfy
    the number and everything else it would open is proven clear) gets a
    dashed teal ring when the chord opens two or more cells; a combo that
    opens a single cell stays in the option set but is drawn as a thin
    dashed teal ring, because mark + chord is two inputs for a cell whose
    raw click is one — a dominated option, shown as such rather than hidden
    (2026-09-04; before that every combo had the same thick ring and on a
    mid-game board most numbers were ringed). Cells a full-ring chord opens
    are tinted pale green. A chord satisfied by a wrong flag is never called
    safe — it would open a proven mine.
  - `forced mines`: every covered cell proven to be a mine gets a dashed red
    ring and (when unflagged) a dimmed real mine glyph; on a flagged cell
    the ring confirms the flag. The mark-mine mini flag on the same square
    stays at full strength. Proofs come from full layout enumeration,
    so everything deducible from the visible numbers is shown (e.g. the
    forced mine under a satisfied 2), not just one-step patterns.
  - `mine %`: every covered cell shows its exact mine probability in percent
    as a small white corner badge (bottom-right, so flags and mine glyphs
    stay visible), computed by full enumeration of remaining layouts
    (components + binomial sea) with all visible knowledge. A proven cell
    whose ring already states the answer shows no badge (a proven mine while
    `forced mines` is on, a proven safe while `available moves` is on); with
    those layers off the badge reads 0 or 100. Four symbols in one square
    hid the board (2026-09-04). When a position exceeds the enumeration
    budget the legend says so and only bounded-proof facts are marked —
    probabilities are never invented. The legend's badge swatch shows a
    sample number.
  - `pointless clicks` / `purposeful clicks`: numbered hollow rings at every
    mistake-tagged (orange) or clean (black) action up to the shown moment,
    as two separate layers. Hollow so the number, flag, or badge under the
    exact click spot stays readable; black so a clean action never shares a
    hue with the teal chord rings.
  - `rough movement`: deep-pink underlay on segments crawling below ¼ of
    the game's own median moving pace or making a >135° direction
    reversal — hesitation and overshoot correction made visible (deep pink
    so it never shares a hue with the purple choice rings).
  - Solver reads are cached per decision index and precomputed for every
    frame in short idle slices as soon as review mode is turned on, so
    slider scrubbing never waits on an enumeration; the cache and the
    precompute clear with each new board. A solver failure is an error,
    never displayed as "position too complex".
  - Legend: every encoding has its own legend item with a swatch of the same
    form the board draws (dashed ring, solid ring, fill, mini flag, numeric
    badge, hollow marker, crosshair, leader) and its complete wording; no
    item bundles two encodings under one swatch. Each active overlay adds
    its own legend group.
  - Legend placement and reading order (requested 2026-09-04): the legend
    is a vertical key, one item per line, in the separate game details
    column after the final stats. Items read at a glance: the swatch
    is board-cell sized (22 px) in the exact color and form drawn on the
    board; the meaning is the bold headline ("proven safe: open it with a
    raw click"); the look words and any fine print sit beneath it in one
    smaller black line ("dashed green · around a flag it means that flag is
    provably wrong"). Groups have bold underlined titles. Nothing is
    shortened. The complete key follows the stats inside the right details
    column, with its own column's scrollbar when needed. It never competes
    with stats for a horizontal gutter or pushes stats below the board.
    On compact layouts it appears in the same Game details popover. Neither
    the legend nor the stats changes the board, transport, or history layout.
- These displays read the just-finished RAM trace. The same decision frames
  are persisted in the trace store for future historical replay and analytics;
  loading older traces into this control is not yet built.
- Every point maps through the trace's layout events (the board geometry
  in effect at that moment) to a board fraction and then onto the
  board's current size, so the overlay is correct even if the player
  scrolled or zoomed mid-game, and it follows zoom changes made after
  the game.
- The overlay never intercepts input; the chosen view is remembered
  across games within the page session (not persisted), so a view left
  on shows the next finished game's path immediately.

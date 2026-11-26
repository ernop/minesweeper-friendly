# Board and layout

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/board-and-layout.md](../implementation/board-and-layout.md).

## Goals

- **Effortless, classic play:** give players an immediate, crisp classic-Windows Minesweeper surface with zero visual clutter and zero dependencies.
- **Flexible personal ergonomics:** let every player tune scale, iconography, legibility, and board placement so they can balance cursor travel, click precision, peripheral vision, and eyesight to play at their best.
- **Rock-steady spatial stability:** the board is the physical anchor of the page; controls, stats, replays, and overlays adapt around it and never shift it under the cursor.
- **Instant responsiveness:** play and board input must never wait on analytics, rendering, or storage.

---

## Board feel and visual customization

### Core look and mechanics
- **Classic readability:** tactile raised bevels, high-contrast chunky numbers in the classic color palette, red seven-segment LCD counters with clear digit separation, inline vector graphics, and a calm dove status button (steady in play, olive branch on win, broken heart on loss).
- **Standard mechanics:** first click never a mine, flood fill on zeros, flag placed immediately on right press, chording with press preview via left click or both buttons held together (so the 1.5-click works seamlessly; once both buttons are down, releasing only chords and never reveals), and loss showing the hit square plus crossed-out wrong flags.
- **Honest won state:** winning leaves the board exactly as the player finished it — unflagged mines stay covered and the mine counter reflects mines minus flags actually placed — so play history, markless wins, and flag efficiency remain truthful.
- **Frictionless restart:** clicking anywhere on the top status panel or pressing `Space` starts a new board immediately (except while typing in a text field or activating a button; a focused link never blocks `Space` or scrolls the page).

### Visual and ergonomic flexibility
Every visual preference saves automatically, travels with preference exports, and updates live previews in Settings so players see what each change does without guessing:

- **Board scale (Zoom):** let players scale cell size across a wide practical range to trade mouse movement distance and peripheral scan width against click target precision and visual comfort. Zoom resizes the board in place and keeps trace geometry accurate.
- **Effective display scale readout:** display the browser's live device pixel ratio (`pixel ratio`) beside the display controls so players can verify their actual rendered scale across monitors and browser zoom levels. Never label it `"browser zoom"`: browsers expose only the combined product of OS display scale and browser zoom, so `"browser zoom"` would falsely read `200%` on a 2x display.
- **Number display and sizing:** support classic digits alongside alternative count encodings (letters `A–H` or color-only dots, all sharing the classic color palette) and let players scale glyph size relative to the square so numbers stay effortless to read at any zoom.
- **Unmistakable flags:** reserve magenta exclusively for flags so they never collide visually with number colors, hit mines, wrong-flag crosses, or replay overlays. Let players tune flag style, relative size, and color strength so marks stand out cleanly at their preferred visual weight.
- **Clear mine iconography:** offer distinct, high-contrast mine styles (plus relative sizing) that remain legible on both normal revealed squares and red hit squares, matching the visual weight of the player's chosen numbers.
- **Fixed reference tools:** companion drill pages (`problems.html`, judgment tool) keep fixed classic defaults so cross-player or longitudinal measurements stay consistent.

---

## Startup readiness and responsiveness

- **No half-ready board:** conceal the board and restart chrome behind a space-reserving loading state until saved settings, history, and layout are restored, so the first visible frame accepts input immediately without shifting surrounding content. `Space` stays inactive during startup, and any loading failure is shown directly.
- **Play never waits on analysis:** evaluation, trend fitting, trace reconstruction, motion stats, rankings, charts, and board metrics run off the UI thread in workers. Finishing a game writes only that game (never rewriting full history), shows win/loss immediately, and fills in tables and charts progressively as worker replies arrive without blocking the next board.
- **Exact calculations, fast algorithms:** speed comes from better algorithms and worker isolation, never from approximating reported measurements or falling back to degraded paths. Motion stats pause computation completely while collapsed.
- **Guarded latency budgets:** maintain tight, per-machine regression budgets on startup, new game, clicks (within two display frames), game-end freezes, and full Expert result completion, checked as gameplay or result code changes so slowdowns are caught at the source.

---

## Navigation and progressive disclosure

- **Zero clutter for standard play:** Beginner, Intermediate, and Expert are complete one-click presets (standard rules, default generator) that show no extra setup controls above the board.
- **One-level-deep alternate modes:** Custom and all other play modes live together in one flat `other modes` menu. Board dimensions, generator selection, and mode-specific progress appear cleanly in a single row directly beneath the mode bar only when a non-preset mode is active.
- **Clear role separation:**
  - **Top bar:** live play context (player state tags and popover editor, score-list access, live daily-limit usage once limits are configured, and entry to Daily limits and Settings).
  - **Page-foot settings row:** global per-session and display preferences (`session` window, Zoom, board `position`, and pixel ratio), cleanly grouped without mixing in per-mode options.
  - **Footer:** quiet links to companion pages (`self-check`, `training`, `problems`) and the hosted site.

---

## Board-first adaptive layout

- **Board placement first:** the board occupies the primary full-width top stage first, defaulting to centered. Players can position the board anywhere inside the viewport (via drag, arrow keys, sliders, or numeric offsets) to suit their posture, monitor, and dominant hand. Applied placement keeps fitting boards inside the viewport and clear of top controls without overwriting the player's preferred offset on smaller windows.
- **Adaptive details dock:** live performance charts, game data, and the replay legend dock beside the board on whichever flank offers more space (filling the visible viewport height cleanly and letting the player resize the dock edge without moving the board). When neither flank has comfortable room, the dock flows automatically at full width directly below the board rather than hiding behind a popover. Do not show a redundant `"Win beginner."` outcome banner in the dock (only High scores and Old game views carry a header line, since nothing else marks them as non-current views). After a loss, the dock holds live perf charts alone; loss statistics live in `"this game"` in the overview row below.
- **Stable anchor:** appearing or disappearing results, replay controls, hover cards, or lower sections never move the board; the scrollbar gutter is always reserved, and the top stage reserves room for the docked details and any Guardian Angel callout so lower sections never collide with them.
- **Predictable post-game flow:**
  - **Replay transport** sits centered directly under the board once a game ends, following the board's offset and keeping overlay/path controls compact and unobstructed.
  - **After-board sections** stack cleanly at full page width in consistent order: after-game report (when enabled), overview row (session summary, ranks won in session, and loss stats), rankings, board traits (`This board`), performance and relationship chart grids, motion stats, backup row, settings row, and footer — each with consistent typography, collapsible openers, and hover definitions that never reflow layout.

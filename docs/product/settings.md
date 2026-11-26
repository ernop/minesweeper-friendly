# Personal settings

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/settings.md](../implementation/settings.md).

## Goal and ownership split

Keep every persistent preference defined once in `SETTINGS_SCHEMA` (`settings-core.js`, loaded by both the game page and `settings.html`) so validation, defaults, UI rendering, export/import, and the data-format card can never drift. Named `"settings"`, never `"config"` (reserved for board parameters).

Every option lives in **one place** ([UI doctrine](ui-doctrine.md#options-navigation-and-errors)):

- **Global play, look, report, and account (`settings.html`):** daily play limits, Guardian Angel, board look and glyph sizes (`numberDisplay`, `numberSize`, `flagStyle`, `flagSize`, `flagIntensity`, `mineStyle`, `mineSize`), after-game report level (`reportScope`), preferences backup, and archive folder.
- **Local view and play-surface configuration (game page only):**
  - Mode choice, board size, and generator in the top setup rows.
  - Shared session window (`sessionDefinition`), Zoom (`cellSize`), board `position`, pixel ratio, and `configure results` (`<dialog id="results-config">` for `shownThings` and `collapseDuplicateCharts`) in `#settings-row` at the page foot.
  - Per-surface controls directly on their surfaces: Game Data (`gameDataMetrics`, `gameDataBoardTraits`, `gameDataScopedRows`, `gameDataPool`, `gameDataShowValues`, `gameDataDistributions`), live perf charts (`duringGameRows`, `duringGameAveraging`, `duringGameRelativeScale`), full score-list columns (`scoreListColumns`), replay overlays/path, collapsible openers (`panels.*`), and docked details width (`detailsColumnShare` via drag grip).
  - Direct right-click → `hide`/`remove` on individual rows, columns, tables, charts, and section heads (Shift+right-click opens the browser menu; never hover-injected chrome).

## Settings page (`settings.html`)

- **Navigation:** opens from the bordered `settings` button at the upper right of the game page's top bar (`daily limits` sits beside it). Displays a slim titlebar with the site name, centered `"Settings"` heading with `"Changes save automatically"` beside it, and `"return to game"` buttons at both top and bottom of the page body (`Esc` and browser Back also return).
- **Layout:** responsive multi-column panels (`Daily limits` first, then `SETTINGS_GROUPS` in schema order: gameplay / after a game, followed by Preferences backup and Archive). Each group keeps its heading in a left column and controls on the right. Switch rows put name left, optional earned hint middle, checkbox right (full schema description on hover tooltip; never a subtitle that reads like a second list item). Interactive board-look choosers and sliders redraw live preview boards while dragging and save on release. Controls never render disabled (for example, `Choose folder` is omitted where folder access is unsupported; `Archive now` queues another sync if clicked mid-sync).
- **Daily limits exception:** daily limits sit in the first panel on `settings.html` but are **not** schema preferences — they never auto-save (requiring two confirmations and a 2-minute loosening lock; [Daily play limits](play-limits.md)) and are excluded from preferences export/import.

## Storage, defaults, and transfer

- **Persistence:** stored in IndexedDB `userdata['settings']` as one flat JSON-compatible object ([Storage](storage-and-history.md)). Absent entry or absent/invalid field falls back to schema default; nested values copy before editing. Restoration finishes before startup reveals the board. Changes save automatically on interaction (game page reads fresh on every load).
- **Game-choice consistency:** preset difficulties (`beginner`, `intermediate`, `expert`) pair strictly with `standard` mode; every other mode pairs with `custom` board dimensions. Saving an invalid pair throws; legacy stored/imported `(preset, non-standard)` pairs migrate to `custom` with that preset's dimensions, preserving history keys.
- **Separate transfer:** `settings.html` exports and imports plain JSON matching `SETTINGS_SCHEMA`; any invalid or unknown field rejects the whole preferences import with an error. History exports contain only mode-keyed game lists and ignore legacy embedded preferences on import.
- **Transient vs. persistent state:** browser file handles, held mouse buttons, active drags, hover highlights, tooltips, and unfinished boards are transient (never saved in preferences). Saved Trial progress lives outside preferences. Replay position references a finished game by timestamp; the finished board and trace belong to the `traces` store.

## Key preference defaults

- **Quiet start for new players:** `reportScope` defaults to `none` (after-game action reports off, configurable on `settings.html` to `fatal`, `risk`, or `full`; collection stays independent of display), and `panels.motionStats` defaults closed (motion computation paused while closed).
- **Board and rules:** `cellSize` = `28`, `guardianAngel` = `true` (frozen at first reveal), `numberDisplay` = `digits`, `numberSize` = `100` (`50–120%` by `5`), `flagStyle` = `classic`, `flagSize` = `45` (`20–100%` by `5`), `flagIntensity` = `100` (`10–100` by `10`), `mineStyle` = `classic`, `mineSize` = `100` (`50–100%` by `5`), `sessionDefinition` = `today`, `detailsColumnShare` = `0.46`, `collapseDuplicateCharts` = `true`.
- **Dock and result sections:** `panels.duringGame`, `panels.gamePerformance`, `panels.boardTraits`, `panels.resultAnalysis`, and all lower result openers (`sessionSummary`, `recentPlacements`, `gameStats`, `rankTables`, `boardTables`, `perfCharts`, `boardCharts`, `relationships`) default open. `gameDataPool` defaults to `all`, `gameDataScopedRows` to empty, `gameDataDistributions` to off, `duringGameAveraging` to `2 s` rolling, and `duringGameRelativeScale` to `log`.
- **Standalone help:** `guardian-angel-help.html` stays in the repo as a standalone visual reference (no inline `"?"` help popover in the schema).

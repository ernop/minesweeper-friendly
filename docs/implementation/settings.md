# Personal settings — implementation notes

Spec: [docs/product/settings.md](../product/settings.md). Index: [AGENTS.md](../../AGENTS.md).

- Personal settings ([Personal settings](../product/settings.md)): the RAM `settings`
  object lives in `settings-core.js` (userdata 'settings', filled by each
  page's `userdataReady` via `settingsFrom`, which fills absent fields
  from `SETTINGS_SCHEMA` defaults). `SETTINGS_SCHEMA`, `SETTINGS_GROUPS`,
  `SHOWN_THINGS_*`, `REPORT_SCOPE_CHOICES`,
  `NUMBER_DISPLAY_CHOICES`, `settingsFrom`,
  `saveSettings`, `cleanTransferredSettings`, all preference choices/bounds,
  the cell iconography SVGs, and `paintCellGlyph` live in `settings-core.js`,
  shared by both pages. Both load `generators.js` for the shared registry;
  its browser load does not require a solver unless actually placing boards.
  Every schema validator runs on either page. `settingsFrom` rejects malformed
  fields to defaults and clones object values; schema `migrate` handles older
  forms. `saveSettings` normalizes the same flat object before writing, while
  loading never writes. `cellSize` defaults to 28 and permits 16–96 px through
  the schema's choices. `initCellSizeControl` builds Zoom from those choices;
  `applyCellSize` updates CSS, selection, position, and trace geometry at load,
  change, and import without starting a game. The data-format card derives
  its setting/default/meaning table from the schema. `tests/settings-state-test.js`
  covers both-page validation, defaults, migration, cloning, and round trips;
  `tests/preferences-browser-check.js` covers real IndexedDB restoration,
  drafts, replay, scrolling, separate transfers, and existing tags on 8099.
  `preferences-game.js`, loaded before the game runtime, owns control bindings,
  restoration guards, and scroll/focus capture. The schema also owns board
  presets, drafts, path/overlay choices, disclosure state, and player tags.
  `loadSettings` moves the former `userdata.states` record into
  `settings.playerStates` using one atomic transaction. `restorePreferredResult`
  reads a saved finished-board snapshot and trace, rebuilding its metric
  series from stored sample times; those are game data, never preferences.
  The controls themselves are `settings.html` +
  `settings-page.js` (2026-08-23; the in-page drawer is gone):
  `#settings-btn` on the game page is now a plain `<a>` to settings.html.
  The page (the demo world is gone; see [Personal settings](../product/settings.md)) has a slim
  `#settings-titlebar`, then fluid `#settings-layout`: top return link,
  page title + automatic-save note, `#settings-column`, and bottom return
  link. Esc navigates back too. `buildSettingsColumn` renders one
  `.settings-group` panel per `SETTINGS_GROUPS` entry, marked
  `data-schema-group`, and inserts them before the static
  `#preferences-transfer` group inside `#settings-column`. Rebuilds remove
  only marked groups, so an import keeps the backup form and its focus.
  `#settings-column` is a CSS multi-column flow (`columns: 760px`) with
  unbroken groups. Each switch from
  `buildSettingRow` is one wide label with its name left, checkbox at the
  far right, and the rare schema `hint` in a dedicated middle column
  (only `justUniverse`); `describe` remains the name's title tooltip.
  `buildChoiceRow` puts its radio group to the right of the setting name.
  `buildShownThings` lays its many switches out as a compact auto-fill
  option grid of at least 260px columns, collapsing responsively. A change just saves; the static
  note beside the page title explains the absent save button. No hover
  behavior at all — no hover-injected or
  hover-swapped text, ever (two note mechanisms were removed for this on
  2026-08-23). The game page has no region tagging and no hover
  controls: the `#region-hide-chip` mechanism (hover a result section,
  click "hide ×" to switch it off) and the `tagSettingRegion` markers
  feeding it were removed later on 2026-08-23 — hiding things is the
  settings page's job (see [Personal settings](../product/settings.md)).
  `numberDisplay` (digits / letters / dots, drawn in `updateCell` via
  `paintCellGlyph`) repaints in place on settings import
  (`repaintRevealedCells`). The raw scatter block is gated by
  shownThings.relationshipCharts since 2026-08-23. Preferences transfer as
  a separate plain JSON object through `exportPreferences`/`importPreferences`
  on the Settings page; `importHistory` ignores old embedded settings.
  `reportScopeFromStored` maps the retired `shownThings.endVerdict` /
  `reportCategories` forms to the nearest tier; explicit modern
  `reportScope` always wins.
  `justUniverse` is frozen into `justiceEnabledForGame` at first reveal —
  a change on the settings page applies from the next game (the old
  drawer's mid-game lock UI retired with the drawer).
  `collapseDuplicateCharts` gates the progressive-disclosure dedupe in
  `renderRanks` ("lifetime" is exempt: always shown, and identical
  windows collapse into it).

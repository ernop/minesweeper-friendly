# Personal settings — implementation notes

Spec: [docs/product/settings.md](../product/settings.md). Index: [AGENTS.md](../../AGENTS.md).

- Personal settings ([Personal settings](../product/settings.md)): the RAM `settings`
  object lives in `settings-core.js` (userdata 'settings', filled by each
  page's `userdataReady` via `settingsFrom`, which fills absent fields
  from `SETTINGS_SCHEMA` defaults). `SETTINGS_SCHEMA`, `SETTINGS_GROUPS`,
  `SHOWN_THINGS_*`, `RESULT_SECTION_GROUPS` (with `resultSectionSwitch`,
  `resultSectionShown`, `setResultSectionShown`), `REPORT_SCOPE_CHOICES`,
  `NUMBER_DISPLAY_CHOICES`, `MINE_STYLE_CHOICES`, `settingsFrom`,
  `saveSettings`, `cleanTransferredSettings`, all preference choices/bounds,
  and `paintCellGlyph` live in `settings-core.js`, shared by both pages.
  `MINE_STYLE_CHOICES` is derived from `MINE_STYLES` in `board-icons.js`,
  so both pages (and the node tests that load the schema) load
  `board-icons.js` before `settings-core.js`. Both load `generators.js` for the shared registry;
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
  A field listed in `CHOICE_PREVIEWS` (`numberDisplay`, `flagStyle`,
  `mineStyle`) also shows each choice as `.cell` squares in a
  `.setting-choice-preview` grid at 36 px between the radio and the label:
  the counts 1–8 through `paintCountGlyph`, or a demo board
  (`FLAG_STYLE_DEMO_BOARD` in play, `MINE_STYLE_DEMO_BOARD` lost; counts
  computed from their mines) drawn by `demoBoardCells` with the player's
  other choices. `renderBoardLook` applies `setFlagSize` and refills every
  preview after each build, choice change, and slider movement.
  Control `slider` (`flagSize`, `flagIntensity`; schema `scale` = min, max,
  step, labelStep, unit, validated by `onScale`) renders through
  `buildSliderRow`: the value beside the name, a range input, and a notch
  and number scale positioned by `--at`, inset by half the thumb. `input`
  updates RAM and the demos; `change` saves.
  `buildResultSections` renders `RESULT_SECTION_GROUPS` where the
  `shownThings` entry (control `result-sections`) sits: one subheading and
  compact auto-fill option grid of at least 260px columns per group,
  collapsing responsively. Boolean fields with control `result-section`
  (`collapseDuplicateCharts`) render only inside
  those groups, and `tests/report-settings-test.js` checks that every switch
  is in exactly one group. Only the settings page renders them (the game
  page's `renderReviewDisplay` copy and `buildReportScopeControl` went on
  2026-10-21): `tests/settings-one-place-test.js` fails when game-page code
  (the `game/` files, `preferences-game.js`, `index.html`) writes any field
  whose schema control is not `none`, or names `RESULT_SECTION_GROUPS`,
  `REPORT_SCOPE_CHOICES`, or `setResultSectionShown`. A change just saves; the static
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
  `reportScope` always wins. `gameDataMetricsFromStored` merges the retired
  `gameDataLifetimeMetrics` / `gameDataSessionMetrics` selections into
  `gameDataMetrics` (shown in either stays shown); a stored
  `gameDataMetrics` always wins. `panelsFromStored` (the `panels` field's
  `migrate`) copies the stored panels without the retired `replay` key
  (2026-10-20, with the replay disclosure). `saveSettings` throws when a
  preset `difficulty` goes with a `playMode` other than `standard`;
  `presetModeAsCustom`, applied in `loadSettings` and `importPreferences`,
  turns that pair into `difficulty: 'custom'` with the preset's dimensions
  as `customBoard` and `customBoardDraft` (2026-10-20, when the mode menu
  became the custom entries; [Play modes](../product/play-modes.md)).
  `justUniverse` is frozen into `justiceEnabledForGame` at first reveal —
  a change on the settings page applies from the next game (the old
  drawer's mid-game lock UI retired with the drawer).
  `collapseDuplicateCharts` gates the progressive-disclosure dedupe in
  `renderRanks` ("lifetime" is exempt: always shown, and identical
  windows collapse into it).

- Saved-board restoration separates interactive setup from statistics.
  `restorePreferredResult` loads the board/trace and restores replay controls,
  while `restoredAnalysisReady` reconstructs metrics and reports in workers.
  `initGamePreferences` releases startup after control layout; it applies saved
  scroll/focus again after report completion only until the first pointer,
  key, wheel, or touch input. A late reply never pulls the player back after
  restarting or navigating the current view.

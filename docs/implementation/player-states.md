# Player states — implementation notes

Spec: [docs/product/player-states.md](../product/player-states.md). Index: [AGENTS.md](../../AGENTS.md).

- Player states ([Player states](../product/player-states.md)): userdata 'states' holds
  `[{name, active}]` in display order; absent entry = new player,
  `userdataReady` fills `playerStates` with the `DEFAULT_STATE_NAMES`
  options (none active) and nothing is persisted until the player
  changes something. `activeStateNames()` is stamped
  onto every record as `states` (always written, `[]` when none active;
  absent on pre-2026-08-20 records, same absence rules as wastedClicks).
  UI: `#states` lives in `#top-right` inside the independently scrolling
  game sidebar, after mode, generator, and the archive chip
  (`#settings-btn` moved to `#top-bar` on 2026-10-14). Expanding
  state controls never changes the board column. `renderStates` calls
  `renderPlayContext` and `renderStatesMenu`. `renderPlayContext` fills
  `#play-context` with `musicStateItem` (`#music-state`, owned by
  `game/music.js`) and one `span.context-item` per active state; CSS puts a
  dot after every item but the last and hides the line when no item is
  visible. `#states-edit-btn` (`.ui-button`, pressed while
  `aria-expanded="true"`) toggles `#states-menu` through
  `setStatesMenuOpen`. `renderStatesMenu` builds one `.state-option` row per
  state: a label holding a checkbox and the name, then a `.state-remove` x.
  The add form (a created state activates immediately) sits under a
  `#states-menu-head` header whose `#states-close` ×, Esc, and outside clicks
  close the menu.
  Every change goes through `savePlayerStates(states)`, which calls
  `updateSettings({ playerStates })`. `saveSettings` replaces `settings` with
  a validated clone, so handlers never keep a state object: each builds the
  new list from `settings.playerStates` by name at click time. A checkbox
  change re-renders only the context line, so focus stays on the checkbox;
  a delete re-renders both. The outside-click handler tests
  `event.composedPath()` rather than `contains(event.target)`, because a
  delete has already removed its row from the menu by the time the click
  reaches the document. `tests/preferences-browser-check.js` covers the
  context line, checkbox and label clicks, delete, and Escape.

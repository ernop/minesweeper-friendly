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
  game sidebar, shared with mode, generator, and `#settings-btn`. Expanding
  state controls never changes the board column. Only active
  states render (chips; click = take off); `#states-add-btn` (a real
  bordered button holding a pressed `.open` look while the menu is up,
  2026-08-23) toggles
  `#states-menu` through `setStatesMenuOpen`, which lists the inactive
  options (click = put on, its
  `.state-remove` x = delete from list) plus the add form (a created
  state activates immediately) under a `#states-menu-head` header whose
  `#states-close` ×, Esc, and outside clicks all close it. `renderStates`
  rebuilds both chips and menu options.
